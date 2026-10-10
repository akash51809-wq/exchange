'use strict';

/**
 * Wallet Mode & Policy Helper with Multi-Wallet, Holding Times & Dispute Lien System
 * Supports:
 * - 'single': Single Unified Prepaid Wallet (default)
 * - 'separate': Dual Wallets (Buyer Wallet for fund requests & recharge buys,
 *                               Seller Wallet for sales earnings & redeem payouts)
 * - Seller Sales Redeem Hold Duration (Minutes)
 * - Seller Sales Wallet Exchange Hold Duration (Minutes)
 * - Dispute Lien Multiplier (X times recharge amount frozen during active dispute)
 * - Dispute Refund Penalty Multiplier (X times recharge amount frozen on refund)
 * - Dispute Refund Lien Retention Duration (Days before penalty lien expires)
 */

let cachedPolicySettings = null;
let lastPolicyCacheTime = 0;
const POLICY_CACHE_TTL_MS = 3000; // 3 seconds cache for high throughput

function formatRupees(minorValue) {
  const minor = BigInt(minorValue || 0);
  return `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;
}

/**
 * Get all wallet & dispute policy settings from website_settings
 * @param {import('pg').Pool|import('pg').PoolClient} db
 */
async function getWalletPolicySettings(db) {
  const now = Date.now();
  if (cachedPolicySettings && now - lastPolicyCacheTime < POLICY_CACHE_TTL_MS) {
    return cachedPolicySettings;
  }

  try {
    const res = await db.query(`
      SELECT wallet_mode,
             COALESCE(seller_sale_redeem_hold_minutes, 0) AS seller_sale_redeem_hold_minutes,
             COALESCE(seller_sale_exchange_hold_minutes, 0) AS seller_sale_exchange_hold_minutes,
             COALESCE(dispute_lien_multiplier, 1.00) AS dispute_lien_multiplier,
             COALESCE(dispute_refund_lien_multiplier, 1.00) AS dispute_refund_lien_multiplier,
             COALESCE(dispute_refund_lien_days, 7) AS dispute_refund_lien_days
      FROM website_settings
      WHERE id = 1
      LIMIT 1
    `);
    const row = res.rows[0] || {};
    const settings = {
      walletMode: row.wallet_mode === 'separate' ? 'separate' : 'single',
      sellerSaleRedeemHoldMinutes: Math.max(0, parseInt(row.seller_sale_redeem_hold_minutes, 10) || 0),
      sellerSaleExchangeHoldMinutes: Math.max(0, parseInt(row.seller_sale_exchange_hold_minutes, 10) || 0),
      disputeLienMultiplier: Math.max(0.1, parseFloat(row.dispute_lien_multiplier) || 1.0),
      disputeRefundLienMultiplier: Math.max(0, parseFloat(row.dispute_refund_lien_multiplier) || 1.0),
      disputeRefundLienDays: Math.max(0, parseInt(row.dispute_refund_lien_days, 10) || 7),
    };
    cachedPolicySettings = settings;
    lastPolicyCacheTime = now;
    return settings;
  } catch (_) {
    return {
      walletMode: 'single',
      sellerSaleRedeemHoldMinutes: 0,
      sellerSaleExchangeHoldMinutes: 0,
      disputeLienMultiplier: 1.0,
      disputeRefundLienMultiplier: 1.0,
      disputeRefundLienDays: 7,
    };
  }
}

/**
 * Get current system wallet mode ('single' or 'separate')
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @returns {Promise<'single'|'separate'>}
 */
async function getWalletMode(db) {
  const settings = await getWalletPolicySettings(db);
  return settings.walletMode;
}

/**
 * Update system wallet mode
 * @param {import('pg').Pool} db
 * @param {'single'|'separate'} newMode
 * @param {string} [adminId]
 */
async function setWalletMode(db, newMode, adminId) {
  return setWalletPolicySettings(db, { walletMode: newMode }, adminId);
}

/**
 * Update wallet mode and seller/dispute policy settings
 * @param {import('pg').Pool} db
 * @param {object} newSettings
 * @param {string} [adminId]
 */
async function setWalletPolicySettings(db, newSettings, adminId) {
  const current = await getWalletPolicySettings(db);
  const mode = newSettings.walletMode || newSettings.mode || current.walletMode;
  if (!['single', 'separate'].includes(mode)) {
    throw new Error('Invalid wallet mode. Must be "single" or "separate".');
  }

  const redeemHoldMinutes = newSettings.sellerSaleRedeemHoldMinutes !== undefined
    ? Math.max(0, parseInt(newSettings.sellerSaleRedeemHoldMinutes, 10) || 0)
    : current.sellerSaleRedeemHoldMinutes;

  const exchangeHoldMinutes = newSettings.sellerSaleExchangeHoldMinutes !== undefined
    ? Math.max(0, parseInt(newSettings.sellerSaleExchangeHoldMinutes, 10) || 0)
    : current.sellerSaleExchangeHoldMinutes;

  const disputeLienMultiplier = newSettings.disputeLienMultiplier !== undefined
    ? Math.max(0.1, parseFloat(newSettings.disputeLienMultiplier) || 1.0)
    : current.disputeLienMultiplier;

  const disputeRefundLienMultiplier = newSettings.disputeRefundLienMultiplier !== undefined
    ? Math.max(0, parseFloat(newSettings.disputeRefundLienMultiplier) || 1.0)
    : current.disputeRefundLienMultiplier;

  const disputeRefundLienDays = newSettings.disputeRefundLienDays !== undefined
    ? Math.max(0, parseInt(newSettings.disputeRefundLienDays, 10) || 7)
    : current.disputeRefundLienDays;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Ensure columns exist in website_settings and wallets
    await client.query(`
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS wallet_mode TEXT NOT NULL DEFAULT 'single';
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS seller_sale_redeem_hold_minutes INT NOT NULL DEFAULT 0;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS seller_sale_exchange_hold_minutes INT NOT NULL DEFAULT 0;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dispute_lien_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.00;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dispute_refund_lien_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.00;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dispute_refund_lien_days INT NOT NULL DEFAULT 7;

      ALTER TABLE wallets ADD COLUMN IF NOT EXISTS buyer_balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (buyer_balance_minor >= 0);
      ALTER TABLE wallets ADD COLUMN IF NOT EXISTS seller_balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (seller_balance_minor >= 0);
      ALTER TABLE wallets ADD COLUMN IF NOT EXISTS lien_balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (lien_balance_minor >= 0);

      CREATE TABLE IF NOT EXISTS seller_wallet_liens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id UUID REFERENCES recharge_orders(id) ON DELETE SET NULL,
        dispute_id UUID,
        lien_type TEXT NOT NULL DEFAULT 'dispute' CHECK (lien_type IN ('dispute', 'refund_penalty')),
        amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
        multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.00,
        base_recharge_minor BIGINT NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'deducted')),
        expires_at TIMESTAMPTZ,
        released_at TIMESTAMPTZ,
        release_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE seller_wallet_liens ADD COLUMN IF NOT EXISTS base_recharge_minor BIGINT NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_seller_wallet_liens_seller ON seller_wallet_liens(seller_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_seller_wallet_liens_order ON seller_wallet_liens(order_id);
    `);

    // Update website_settings
    await client.query(
      `UPDATE website_settings
       SET wallet_mode = $1,
           seller_sale_redeem_hold_minutes = $2,
           seller_sale_exchange_hold_minutes = $3,
           dispute_lien_multiplier = $4,
           dispute_refund_lien_multiplier = $5,
           dispute_refund_lien_days = $6,
           updated_at = now()
       WHERE id = 1`,
      [
        mode,
        redeemHoldMinutes,
        exchangeHoldMinutes,
        disputeLienMultiplier,
        disputeRefundLienMultiplier,
        disputeRefundLienDays,
      ]
    );

    if (mode === 'separate' && current.walletMode !== 'separate') {
      // If switching to separate mode, backfill buyer_balance_minor for users who only had balance_minor
      await client.query(`
        UPDATE wallets
        SET buyer_balance_minor = balance_minor,
            seller_balance_minor = 0,
            updated_at = now()
        WHERE buyer_balance_minor = 0 AND seller_balance_minor = 0 AND balance_minor > 0
      `);
      await client.query(`
        UPDATE wallets
        SET balance_minor = buyer_balance_minor + seller_balance_minor,
            updated_at = now()
      `);
    } else if (mode === 'single' && current.walletMode !== 'single') {
      // Switching back to single: sync total balance
      await client.query(`
        UPDATE wallets
        SET balance_minor = buyer_balance_minor + seller_balance_minor,
            updated_at = now()
      `);
    }

    if (adminId) {
      await client.query(
        'INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
        [
          adminId,
          'update_wallet_policy',
          'website_settings',
          '1',
          {
            mode,
            redeemHoldMinutes,
            exchangeHoldMinutes,
            disputeLienMultiplier,
            disputeRefundLienMultiplier,
            disputeRefundLienDays,
            timestamp: new Date().toISOString(),
          },
        ]
      ).catch(() => {});
    }

    await client.query('COMMIT');

    const updated = {
      walletMode: mode,
      sellerSaleRedeemHoldMinutes: redeemHoldMinutes,
      sellerSaleExchangeHoldMinutes: exchangeHoldMinutes,
      disputeLienMultiplier,
      disputeRefundLienMultiplier,
      disputeRefundLienDays,
    };
    cachedPolicySettings = updated;
    lastPolicyCacheTime = Date.now();
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Auto-release any active penalty liens that have reached expires_at
 * @param {import('pg').Pool|import('pg').PoolClient} db
 */
async function releaseExpiredLiens(db) {
  try {
    const expiredRes = await db.query(`
      SELECT id, seller_user_id, amount_minor
      FROM seller_wallet_liens
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at <= now()
    `);

    if (!expiredRes.rowCount) return;

    for (const lien of expiredRes.rows) {
      await db.query(`
        UPDATE seller_wallet_liens
        SET status = 'released',
            released_at = now(),
            release_reason = 'Retention period expired'
        WHERE id = $1
      `, [lien.id]);

      await db.query(`
        UPDATE wallets
        SET lien_balance_minor = GREATEST(0, lien_balance_minor - $1),
            updated_at = now()
        WHERE user_id = $2 AND currency = 'INR'
      `, [lien.amount_minor, lien.seller_user_id]);
    }
  } catch (_) {}
}

/**
 * Get comprehensive seller available balances taking holding delays and active liens into account
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} userId
 */
async function getSellerAvailableBalances(db, userId) {
  await releaseExpiredLiens(db);
  const policy = await getWalletPolicySettings(db);

  // 1. Fetch wallet
  const walletRes = await db.query(
    "SELECT id, balance_minor, buyer_balance_minor, seller_balance_minor, lien_balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR'",
    [userId]
  );
  const wallet = walletRes.rows[0] || {};
  const totalBalanceMinor = BigInt(wallet.balance_minor || 0);
  const buyerBalanceMinor = BigInt(wallet.buyer_balance_minor || (policy.walletMode === 'single' ? totalBalanceMinor : 0));
  const sellerBalanceMinor = BigInt(wallet.seller_balance_minor || (policy.walletMode === 'single' ? totalBalanceMinor : 0));

  // 2. Fetch active dispute / penalty liens
  let activeLienMinor = 0n;
  try {
    const lienRes = await db.query(
      "SELECT COALESCE(SUM(amount_minor), 0) AS total_lien FROM seller_wallet_liens WHERE seller_user_id = $1 AND status = 'active'",
      [userId]
    );
    activeLienMinor = BigInt(lienRes.rows[0]?.total_lien || wallet.lien_balance_minor || 0);
  } catch (_) {
    activeLienMinor = BigInt(wallet.lien_balance_minor || 0);
  }

  // 3. Fetch recent sales within Redeem Hold duration
  let heldForRedeemMinor = 0n;
  if (policy.sellerSaleRedeemHoldMinutes > 0) {
    try {
      const holdRes = await db.query(
        `SELECT COALESCE(SUM(amount_minor), 0) AS held_minor
         FROM recharge_orders
         WHERE seller_user_id = $1
           AND status = 'successful'
           AND created_at >= (now() - ($2 || ' minutes')::interval)`,
        [userId, policy.sellerSaleRedeemHoldMinutes]
      );
      heldForRedeemMinor = BigInt(holdRes.rows[0]?.held_minor || 0);
    } catch (_) {
      heldForRedeemMinor = 0n;
    }
  }

  // 4. Fetch recent sales within Exchange Hold duration
  let heldForExchangeMinor = 0n;
  if (policy.sellerSaleExchangeHoldMinutes > 0) {
    try {
      const holdRes = await db.query(
        `SELECT COALESCE(SUM(amount_minor), 0) AS held_minor
         FROM recharge_orders
         WHERE seller_user_id = $1
           AND status = 'successful'
           AND created_at >= (now() - ($2 || ' minutes')::interval)`,
        [userId, policy.sellerSaleExchangeHoldMinutes]
      );
      heldForExchangeMinor = BigInt(holdRes.rows[0]?.held_minor || 0);
    } catch (_) {
      heldForExchangeMinor = 0n;
    }
  }

  // 5. Calculate Net Available Balances
  // Available = max(0, Seller Balance - Active Liens - Sales On Release Hold)
  let availableForRedeemMinor = sellerBalanceMinor - activeLienMinor - heldForRedeemMinor;
  if (availableForRedeemMinor < 0n) availableForRedeemMinor = 0n;

  let availableForExchangeMinor = sellerBalanceMinor - activeLienMinor - heldForExchangeMinor;
  if (availableForExchangeMinor < 0n) availableForExchangeMinor = 0n;

  return {
    walletId: wallet.id,
    walletMode: policy.walletMode,
    totalBalanceMinor,
    buyerBalanceMinor,
    sellerBalanceMinor,
    activeLienMinor,
    heldForRedeemMinor,
    heldForExchangeMinor,
    availableForRedeemMinor,
    availableForExchangeMinor,
    formatted: {
      totalBalance: formatRupees(totalBalanceMinor),
      buyerBalance: formatRupees(buyerBalanceMinor),
      sellerBalance: formatRupees(sellerBalanceMinor),
      activeLien: formatRupees(activeLienMinor),
      heldForRedeem: formatRupees(heldForRedeemMinor),
      heldForExchange: formatRupees(heldForExchangeMinor),
      availableForRedeem: formatRupees(availableForRedeemMinor),
      availableForExchange: formatRupees(availableForExchangeMinor),
    },
    policy,
  };
}

/**
 * Hold dispute lien on seller's wallet when buyer files complaint
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {object} params
 */
async function holdDisputeLien(client, { orderId, sellerId, disputeId, rechargeAmountMinor }) {
  if (!sellerId) return null;
  const policy = await getWalletPolicySettings(client);
  const multiplier = Number(policy.disputeLienMultiplier || 1.0);
  const baseRechargeMinor = BigInt(rechargeAmountMinor || 0);
  if (baseRechargeMinor <= 0n) return null;

  const lienAmountMinor = BigInt(Math.round(Number(baseRechargeMinor) * multiplier));
  if (lienAmountMinor <= 0n) return null;

  // Ensure table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS seller_wallet_liens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id UUID REFERENCES recharge_orders(id) ON DELETE SET NULL,
      dispute_id UUID,
      lien_type TEXT NOT NULL DEFAULT 'dispute' CHECK (lien_type IN ('dispute', 'refund_penalty')),
      amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
      multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.00,
      base_recharge_minor BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'deducted')),
      expires_at TIMESTAMPTZ,
      released_at TIMESTAMPTZ,
      release_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE seller_wallet_liens ADD COLUMN IF NOT EXISTS base_recharge_minor BIGINT NOT NULL DEFAULT 0;
  `);

  const lienRes = await client.query(
    `INSERT INTO seller_wallet_liens (
       seller_user_id, order_id, dispute_id, lien_type, amount_minor,
       multiplier, base_recharge_minor, status
     ) VALUES ($1, $2, $3, 'dispute', $4, $5, $6, 'active')
     RETURNING id`,
    [sellerId, orderId, disputeId || null, lienAmountMinor, multiplier, baseRechargeMinor]
  );

  // Update wallet lien balance
  await client.query(
    `UPDATE wallets
     SET lien_balance_minor = lien_balance_minor + $1,
         updated_at = now()
     WHERE user_id = $2 AND currency = 'INR'`,
    [lienAmountMinor, sellerId]
  );

  return {
    lienId: lienRes.rows[0]?.id,
    lienAmountMinor,
    multiplier,
  };
}

/**
 * Release dispute lien when recharge is confirmed successful / dispute rejected
 * "agar dispute recharge success hai to poora paisa free ho jayega"
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {object} params
 */
async function releaseDisputeLien(client, { orderId, reason }) {
  if (!orderId) return;

  const liensRes = await client.query(
    `SELECT id, seller_user_id, amount_minor
     FROM seller_wallet_liens
     WHERE order_id = $1 AND status = 'active'`,
    [orderId]
  );

  for (const lien of liensRes.rows) {
    await client.query(
      `UPDATE seller_wallet_liens
       SET status = 'released',
           released_at = now(),
           release_reason = $1,
           updated_at = now()
       WHERE id = $2`,
      [reason || 'Dispute rejected / Recharge marked successful', lien.id]
    );

    await client.query(
      `UPDATE wallets
       SET lien_balance_minor = GREATEST(0, lien_balance_minor - $1),
           updated_at = now()
       WHERE user_id = $2 AND currency = 'INR'`,
      [lien.amount_minor, lien.seller_user_id]
    );
  }
}

/**
 * Apply refund penalty lien when recharge dispute is refunded / accepted
 * "aur agar recharge refund hua to kitne guna paisa seller la lean hoga aur kitne din tak"
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {object} params
 */
async function applyDisputeRefundPenalty(client, { orderId, sellerId, rechargeAmountMinor, reason }) {
  if (!orderId && !sellerId) return;
  const policy = await getWalletPolicySettings(client);
  const refundMultiplier = Number(policy.disputeRefundLienMultiplier || 1.0);
  const refundDays = Number(policy.disputeRefundLienDays || 7);
  const baseRechargeMinor = BigInt(rechargeAmountMinor || 0);

  // 1. Release original pending dispute lien
  let prevLienMinor = 0n;
  if (orderId) {
    const prevLiensRes = await client.query(
      `SELECT id, seller_user_id, amount_minor
       FROM seller_wallet_liens
       WHERE order_id = $1 AND status = 'active' AND lien_type = 'dispute'`,
      [orderId]
    );
    for (const prev of prevLiensRes.rows) {
      prevLienMinor += BigInt(prev.amount_minor || 0);
      if (!sellerId) sellerId = prev.seller_user_id;
      await client.query(
        `UPDATE seller_wallet_liens
         SET status = 'deducted',
             released_at = now(),
             release_reason = $1,
             updated_at = now()
         WHERE id = $2`,
        [reason || 'Dispute refunded - closed', prev.id]
      );
    }
  }

  if (!sellerId) return;

  // 2. If refund penalty multiplier > 0 and days > 0, create penalty lien
  let penaltyLienMinor = 0n;
  if (refundMultiplier > 0 && refundDays > 0 && baseRechargeMinor > 0n) {
    penaltyLienMinor = BigInt(Math.round(Number(baseRechargeMinor) * refundMultiplier));
    const expiresAt = new Date(Date.now() + refundDays * 24 * 60 * 60 * 1000);

    await client.query(
      `INSERT INTO seller_wallet_liens (
         seller_user_id, order_id, lien_type, amount_minor, multiplier,
         base_recharge_minor, status, expires_at, release_reason
       ) VALUES ($1, $2, 'refund_penalty', $3, $4, $5, 'active', $6, $7)`,
      [
        sellerId,
        orderId || null,
        penaltyLienMinor,
        refundMultiplier,
        baseRechargeMinor,
        expiresAt,
        `Refund penalty held for ${refundDays} days`,
      ]
    );
  }

  // 3. Adjust wallet lien balance: remove previous dispute lien, add penalty lien
  await client.query(
    `UPDATE wallets
     SET lien_balance_minor = GREATEST(0, lien_balance_minor - $1 + $2),
         updated_at = now()
     WHERE user_id = $3 AND currency = 'INR'`,
    [prevLienMinor, penaltyLienMinor, sellerId]
  );

  return {
    penaltyLienMinor,
    multiplier: refundMultiplier,
    refundDays,
  };
}

/**
 * Get wallet balances for a user (backward compatible)
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} userId
 */
async function getUserWalletData(db, userId) {
  const data = await getSellerAvailableBalances(db, userId);
  return {
    mode: data.walletMode,
    walletId: data.walletId,
    balanceMinor: data.totalBalanceMinor,
    buyerBalanceMinor: data.buyerBalanceMinor,
    sellerBalanceMinor: data.sellerBalanceMinor,
    lienBalanceMinor: data.activeLienMinor,
    availableForRedeemMinor: data.availableForRedeemMinor,
    availableForExchangeMinor: data.availableForExchangeMinor,
  };
}

function clearPolicyCache() {
  cachedPolicySettings = null;
  lastPolicyCacheTime = 0;
}

module.exports = {
  getWalletMode,
  setWalletMode,
  getWalletPolicySettings,
  setWalletPolicySettings,
  releaseExpiredLiens,
  getSellerAvailableBalances,
  holdDisputeLien,
  releaseDisputeLien,
  applyDisputeRefundPenalty,
  getUserWalletData,
  formatRupees,
  clearPolicyCache,
};
