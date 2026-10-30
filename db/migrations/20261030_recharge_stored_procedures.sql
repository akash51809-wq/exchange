-- ==============================================================================
-- Exchange Platform: High-Performance Stored Procedures for Atomic Settlement
-- Eliminates multiple network round-trips by executing pre-debit, ledger writes,
-- margin credits, and order insertion in single ACID database transactions.
-- ==============================================================================

-- 1. Atomic Pre-Debit Stored Procedure
CREATE OR REPLACE FUNCTION sp_recharge_pre_debit(
  p_buyer_id uuid,
  p_amount_minor bigint,
  p_ref_id text,
  p_mobile_number text,
  p_is_separate boolean
)
RETURNS TABLE (
  ok boolean,
  error_code text,
  error_message text,
  wallet_id uuid,
  post_debit_balance bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_cur_bal bigint;
  v_post_bal bigint;
BEGIN
  -- Row-level exclusive lock on buyer wallet
  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = p_buyer_id AND currency = 'INR'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'ERR_WALLET_NOT_FOUND', 'Wallet account not found.', NULL::uuid, 0::bigint;
    RETURN;
  END IF;

  -- Determine current balance based on wallet mode
  IF p_is_separate THEN
    v_cur_bal := COALESCE(v_wallet.buyer_balance_minor, 0);
  ELSE
    v_cur_bal := COALESCE(v_wallet.balance_minor, 0);
  END IF;

  -- Verify balance sufficiency
  IF v_cur_bal < p_amount_minor THEN
    RETURN QUERY SELECT false, '128', 
      CASE WHEN p_is_separate THEN 'FAILED- Insufficient Fund in Buyer Wallet' ELSE 'FAILED- Insufficient Fund' END,
      v_wallet.id, v_cur_bal;
    RETURN;
  END IF;

  v_post_bal := v_cur_bal - p_amount_minor;

  -- Atomically debit balance
  IF p_is_separate THEN
    UPDATE wallets
    SET buyer_balance_minor = v_post_bal,
        balance_minor = GREATEST(0, balance_minor - p_amount_minor),
        updated_at = now()
    WHERE id = v_wallet.id;
  ELSE
    UPDATE wallets
    SET balance_minor = v_post_bal,
        buyer_balance_minor = v_post_bal,
        updated_at = now()
    WHERE id = v_wallet.id;
  END IF;

  -- Insert debit entry into wallet_entries
  INSERT INTO wallet_entries (
    wallet_id, user_id, amount_minor, entry_type, reference_type, idempotency_key, description
  ) VALUES (
    v_wallet.id, p_buyer_id, p_amount_minor, 'debit', 'recharge_order', 'rech_deb_' || p_ref_id, 'Recharge Debit: ' || p_mobile_number
  )
  ON CONFLICT (wallet_id, idempotency_key) DO NOTHING;

  RETURN QUERY SELECT true, '0', 'Pre-debit successful', v_wallet.id, v_post_bal;
END;
$$;

-- 2. Atomic Order Settlement Stored Procedure
CREATE OR REPLACE FUNCTION sp_recharge_settle_order(
  p_buyer_id uuid,
  p_buyer_wallet_id uuid,
  p_ref_id text,
  p_mobile_number text,
  p_mobile_ciphertext bytea,
  p_operator_code text,
  p_operator_name text,
  p_operator_id uuid,
  p_circle_name text,
  p_amount_minor bigint,
  p_order_status text,
  p_provider_ref text,
  p_buyer_commission_minor bigint,
  p_net_cost_minor bigint,
  p_seller_id uuid,
  p_seller_api_id uuid,
  p_seller_margin_minor bigint,
  p_seller_credit_minor bigint,
  p_seller_margin_id uuid,
  p_buyer_margin_id uuid,
  p_response_payload jsonb,
  p_with_gst boolean,
  p_is_separate boolean
)
RETURNS TABLE (
  order_id uuid,
  created_at timestamptz,
  buyer_final_balance bigint,
  seller_final_balance bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id uuid;
  v_created_at timestamptz;
  v_buyer_bal bigint := 0;
  v_seller_bal bigint := 0;
  v_seller_wallet_id uuid;
BEGIN
  -- Credit buyer margin if recharge is successful
  IF p_order_status = 'successful' AND p_buyer_commission_minor > 0 THEN
    IF p_is_separate THEN
      UPDATE wallets
      SET buyer_balance_minor = buyer_balance_minor + p_buyer_commission_minor,
          balance_minor = balance_minor + p_buyer_commission_minor,
          updated_at = now()
      WHERE id = p_buyer_wallet_id
      RETURNING buyer_balance_minor INTO v_buyer_bal;
    ELSE
      UPDATE wallets
      SET balance_minor = balance_minor + p_buyer_commission_minor,
          buyer_balance_minor = balance_minor + p_buyer_commission_minor,
          updated_at = now()
      WHERE id = p_buyer_wallet_id
      RETURNING balance_minor INTO v_buyer_bal;
    END IF;

    INSERT INTO wallet_entries (
      wallet_id, user_id, amount_minor, entry_type, reference_type, idempotency_key, description
    ) VALUES (
      p_buyer_wallet_id, p_buyer_id, p_buyer_commission_minor, 'credit', 'buyer_margin', 'rech_comm_' || p_ref_id, 'buyer margin'
    )
    ON CONFLICT (wallet_id, idempotency_key) DO NOTHING;
  ELSE
    SELECT CASE WHEN p_is_separate THEN buyer_balance_minor ELSE balance_minor END
    INTO v_buyer_bal
    FROM wallets WHERE id = p_buyer_wallet_id;
  END IF;

  -- Credit seller wallet if recharge is successful
  IF p_order_status = 'successful' AND p_seller_credit_minor > 0 AND p_seller_id IS NOT NULL THEN
    INSERT INTO wallets (user_id, currency) VALUES (p_seller_id, 'INR')
    ON CONFLICT (user_id, currency) DO NOTHING;

    IF p_is_separate THEN
      UPDATE wallets
      SET seller_balance_minor = seller_balance_minor + p_seller_credit_minor,
          balance_minor = balance_minor + p_seller_credit_minor,
          updated_at = now()
      WHERE user_id = p_seller_id AND currency = 'INR'
      RETURNING id, seller_balance_minor INTO v_seller_wallet_id, v_seller_bal;
    ELSE
      UPDATE wallets
      SET balance_minor = balance_minor + p_seller_credit_minor,
          seller_balance_minor = seller_balance_minor + p_seller_credit_minor,
          updated_at = now()
      WHERE user_id = p_seller_id AND currency = 'INR'
      RETURNING id, balance_minor INTO v_seller_wallet_id, v_seller_bal;
    END IF;

    IF v_seller_wallet_id IS NOT NULL THEN
      INSERT INTO wallet_entries (
        wallet_id, user_id, amount_minor, entry_type, reference_type, idempotency_key, description
      ) VALUES (
        v_seller_wallet_id, p_seller_id, p_seller_credit_minor, 'credit', 'seller_sales_credit', 'rech_seller_' || p_ref_id, 'Recharge Sale Credit (' || p_mobile_number || ')'
      )
      ON CONFLICT (wallet_id, idempotency_key) DO NOTHING;
    END IF;
  END IF;

  -- Insert recharge order
  INSERT INTO recharge_orders (
    user_id, mobile_ciphertext, operator_code, amount_minor,
    status, idempotency_key, provider_reference,
    margin_minor, cost_minor, seller_user_id, seller_api_id,
    seller_margin_minor, circle_name, operator_name, operator_id, mobile_number,
    response_payload, with_gst
  ) VALUES (
    p_buyer_id, p_mobile_ciphertext, p_operator_code, p_amount_minor,
    p_order_status, p_ref_id, p_provider_ref,
    p_buyer_commission_minor, p_net_cost_minor, p_seller_id, p_seller_api_id,
    p_seller_margin_minor, p_circle_name, p_operator_name, p_operator_id, p_mobile_number,
    p_response_payload, p_with_gst
  )
  RETURNING id, recharge_orders.created_at INTO v_order_id, v_created_at;

  -- Update margin limits used
  IF p_seller_margin_id IS NOT NULL THEN
    UPDATE seller_margin_settings
    SET limit_used_minor = limit_used_minor + p_amount_minor
    WHERE id = p_seller_margin_id;
  END IF;

  IF p_buyer_margin_id IS NOT NULL THEN
    UPDATE buyer_margin_settings
    SET limit_used_minor = limit_used_minor + p_amount_minor
    WHERE id = p_buyer_margin_id;
  END IF;

  RETURN QUERY SELECT v_order_id, v_created_at, v_buyer_bal, v_seller_bal;
END;
$$;
