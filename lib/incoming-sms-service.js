'use strict';

const crypto = require('node:crypto');
const { getWalletMode } = require('./wallet-helper');

/**
 * Parses Indian bank credit SMS text.
 * Detects whether the SMS is a credit transaction, extracts the credited amount (in rupees and minor units),
 * extracts the UTR / UPI / IMPS reference number, and detects the bank.
 *
 * @param {string} text - Raw SMS message text
 * @returns {object} Parsed details
 */
function parseIncomingBankSms(text, sender = '') {
  if (!text || typeof text !== 'string') {
    return { isCredit: false, raw: '', error: 'Empty message text' };
  }

  const raw = text.trim();
  const lower = raw.toLowerCase();
  const combined = (lower + ' ' + String(sender || '').toLowerCase());

  // 1. Credit vs Debit validation
  const hasCreditWord =
    lower.includes('credit') ||
    lower.includes('credited') ||
    lower.includes('deposited') ||
    lower.includes('received') ||
    lower.includes('added to your a/c') ||
    lower.includes('money received');

  const hasDebitWord =
    lower.includes('debited') ||
    lower.includes('withdrawn') ||
    lower.includes('sent rs') ||
    lower.includes('transferred to') ||
    lower.includes('paid to');

  // If message mentions debit and doesn't clearly indicate credit, mark as non-credit
  if (!hasCreditWord && !lower.includes(' cr ') && !lower.endsWith(' cr.')) {
    return { isCredit: false, raw, error: 'Not a credit transaction SMS' };
  }
  if (hasDebitWord && !hasCreditWord) {
    return { isCredit: false, raw, error: 'Debit transaction SMS' };
  }

  // 2. Extract Amount
  let amountStr = null;
  // Pattern A: "credited by/with/for Rs. 1,500.00" or "deposited Rs 500"
  const amtMatch1 = raw.match(
    /(?:credited(?:\s*(?:by|with|for|to))?|deposited(?:\s*(?:in|to|with))?|received)\s*(?:(?:of\s*)?(?:rs\.?|inr|₹)\s*)?([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i
  );
  // Pattern B: "Rs. 1,500.00 credited" or "INR 500 credited"
  const amtMatch2 = raw.match(
    /(?:rs\.?|inr|₹)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:has\s*been|is)?\s*(?:credited|deposited|received)/i
  );
  // Pattern C: "credit ... INR/Rs 500"
  const amtMatch3 = raw.match(
    /(?:credit|cr)\s*.*?(?:rs\.?|inr|₹)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i
  );
  // Pattern D: "A/C ... credited ... Rs.500"
  const amtMatch4 = raw.match(
    /(?:rs\.?|inr|₹)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i
  );

  if (amtMatch1 && amtMatch1[1]) {
    amountStr = amtMatch1[1];
  } else if (amtMatch2 && amtMatch2[1]) {
    amountStr = amtMatch2[1];
  } else if (amtMatch3 && amtMatch3[1]) {
    amountStr = amtMatch3[1];
  } else if (amtMatch4 && amtMatch4[1]) {
    amountStr = amtMatch4[1];
  }

  let amountMinor = 0n;
  if (amountStr) {
    const cleanAmt = amountStr.replace(/,/g, '');
    const num = parseFloat(cleanAmt);
    if (!isNaN(num) && num > 0) {
      amountMinor = BigInt(Math.round(num * 100));
    }
  }

  // 3. Extract UTR / Reference Number
  let utr = null;
  // Slash or colon format: UPI/430291827364 or IMPS/430291827364 or UPI-430291827364
  const utrMatchSlash = raw.match(/(?:upi|imps|neft|rtgs)[\/:\-]([0-9a-zA-Z]{6,25})/i);
  // Label format: UTR: 430291827364, UPI Ref: 430291827364, Ref No 430291827364, Txn ID 430291827364
  const utrMatchLabel = raw.match(
    /(?:upi\s*ref(?:erence)?(?:\s*(?:no|num|id))?|utr(?:\s*(?:no|num|id))?|ref(?:erence)?\s*(?:no|num|id)?|rrn|txn\s*(?:id|no)?)\s*[:\-#\/\s]\s*([0-9a-zA-Z]{6,25})/i
  );
  // 12-digit continuous numeric sequence (UPI standard UTR)
  const utrMatch12 = raw.match(/\b([0-9]{12})\b/);

  if (utrMatchSlash && utrMatchSlash[1]) {
    utr = utrMatchSlash[1].trim();
  } else if (utrMatchLabel && utrMatchLabel[1]) {
    utr = utrMatchLabel[1].trim();
  } else if (utrMatch12 && utrMatch12[1]) {
    utr = utrMatch12[1].trim();
  }

  // Clean UTR of trailing non-alphanumeric chars (like trailing dot or hyphen)
  if (utr) {
    utr = utr.replace(/[^a-zA-Z0-9]$/, '');
  }

  // 4. Detect Bank Name
  let bank = 'Bank';
  if (combined.includes('sbi') || combined.includes('state bank')) bank = 'SBI';
  else if (combined.includes('hdfc')) bank = 'HDFC';
  else if (combined.includes('icici')) bank = 'ICICI';
  else if (combined.includes('axis') || combined.includes('utib')) bank = 'AXIS';
  else if (combined.includes('kotak')) bank = 'KOTAK';
  else if (combined.includes('pnb') || combined.includes('punjab national')) bank = 'PNB';
  else if (combined.includes('bob') || combined.includes('baroda')) bank = 'BOB';
  else if (combined.includes('canara')) bank = 'CANARA';
  else if (combined.includes('union')) bank = 'UNION';
  else if (combined.includes('paytm')) bank = 'PAYTM';
  else if (combined.includes('airtel')) bank = 'AIRTEL';
  else if (combined.includes('yes bank') || combined.includes('yesb')) bank = 'YES BANK';
  else if (combined.includes('indusind')) bank = 'INDUSIND';
  else if (combined.includes('federal')) bank = 'FEDERAL';
  else if (combined.includes('idbi')) bank = 'IDBI';
  else if (combined.includes('idfc')) bank = 'IDFC';

  return {
    isCredit: true,
    amountStr,
    amountMinor,
    utr,
    bank,
    raw,
  };
}

/**
 * Fetch incoming SMS service settings from admin_service_settings table
 */
async function getIncomingSmsConfig(db, decryptServiceConfig) {
  try {
    const res = await db.query(
      "SELECT is_enabled, config_ciphertext FROM admin_service_settings WHERE service_key = 'incoming_sms'"
    );
    if (!res.rowCount) {
      return {
        isEnabled: true,
        autoUpdatePayment: true,
        secretKey: '',
        allowedSenders: '',
      };
    }
    const r = res.rows[0];
    const decrypted = (typeof decryptServiceConfig === 'function' && r.config_ciphertext)
      ? decryptServiceConfig(r.config_ciphertext)
      : {};
    return {
      isEnabled: Boolean(r.is_enabled),
      autoUpdatePayment: decrypted.autoUpdatePayment !== false,
      secretKey: String(decrypted.secretKey || ''),
      allowedSenders: String(decrypted.allowedSenders || ''),
    };
  } catch (err) {
    console.error('[Incoming SMS] Error loading settings:', err.message);
    return {
      isEnabled: true,
      autoUpdatePayment: true,
      secretKey: '',
      allowedSenders: '',
    };
  }
}

/**
 * Save incoming SMS service settings into admin_service_settings table
 */
async function saveIncomingSmsConfig(db, encryptServiceConfig, config = {}) {
  const isEnabled = Boolean(config.isEnabled);
  const cfgPayload = {
    autoUpdatePayment: Boolean(config.autoUpdatePayment),
    secretKey: String(config.secretKey || '').trim(),
    allowedSenders: String(config.allowedSenders || '').trim(),
  };
  const ciphertext = typeof encryptServiceConfig === 'function' ? encryptServiceConfig(cfgPayload) : null;
  await db.query(
    `INSERT INTO admin_service_settings (service_key, is_enabled, config_ciphertext, updated_at)
     VALUES ('incoming_sms', $1, $2, now())
     ON CONFLICT (service_key) DO UPDATE
     SET is_enabled = EXCLUDED.is_enabled, config_ciphertext = EXCLUDED.config_ciphertext, updated_at = now()`,
    [isEnabled, ciphertext]
  );
  return { ok: true, isEnabled, ...cfgPayload };
}

/**
 * Process an incoming SMS message.
 * Parses the SMS, checks for credit, saves the log into incoming_sms_logs,
 * and if auto-credit is enabled, attempts to find and auto-approve matching pending fund request.
 */
async function processIncomingSms({
  db,
  decryptServiceConfig,
  encryptFundField,
  decryptFundField,
  fundFieldHash,
  formatMinorUnits,
  sendNotificationEvent,
  decryptMobile,
  sender = '',
  rawMessage = '',
  simSlot = '0',
  rawPayload = {},
  isSimulation = false,
}) {
  const config = await getIncomingSmsConfig(db, decryptServiceConfig);

  // If service is disabled and not simulation
  if (!config.isEnabled && !isSimulation) {
    return {
      ok: false,
      disabled: true,
      message: 'Incoming SMS service is disabled in Service Settings.',
    };
  }

  // Parse the SMS text
  const parsed = parseIncomingBankSms(rawMessage, sender);

  let matchStatus = 'unmatched';
  let matchedFundRequestId = null;
  let matchedUserId = null;
  let autoApprovalNote = null;
  let matchedFundRequest = null;

  if (!parsed.isCredit) {
    matchStatus = 'ignored';
  } else if (config.autoUpdatePayment && parsed.amountMinor > 0n && parsed.utr) {
    // Attempt to match with a pending wallet fund request
    const cleanUtr = parsed.utr.trim().toUpperCase();
    const txnHash = typeof fundFieldHash === 'function' ? fundFieldHash('transaction', cleanUtr) : null;

    let candidateRequest = null;

    // 1) Match by transaction_id_hash
    if (txnHash) {
      const hashRes = await db.query(
        `SELECT r.id, r.user_id, r.amount_minor, r.status, r.transaction_id_ciphertext,
                u.name, u.username, u.email, u.phone_ciphertext
         FROM wallet_fund_requests r
         JOIN users u ON u.id = r.user_id
         WHERE r.status = 'pending' AND r.transaction_id_hash = $1
         LIMIT 1`,
        [txnHash]
      );
      if (hashRes.rowCount > 0) {
        candidateRequest = hashRes.rows[0];
      }
    }

    // 2) Fallback: Match by amount in recent pending requests and decrypt UTR
    if (!candidateRequest && typeof decryptFundField === 'function') {
      const amtRes = await db.query(
        `SELECT r.id, r.user_id, r.amount_minor, r.status, r.transaction_id_ciphertext,
                u.name, u.username, u.email, u.phone_ciphertext
         FROM wallet_fund_requests r
         JOIN users u ON u.id = r.user_id
         WHERE r.status = 'pending' AND r.amount_minor = $1
         ORDER BY r.created_at DESC
         LIMIT 25`,
        [parsed.amountMinor.toString()]
      );

      for (const row of amtRes.rows) {
        if (row.transaction_id_ciphertext) {
          try {
            const dec = decryptFundField(row.transaction_id_ciphertext, 'transaction');
            const cleanDec = String(dec || '').trim().toUpperCase();
            if (cleanDec === cleanUtr || cleanDec.includes(cleanUtr) || cleanUtr.includes(cleanDec)) {
              candidateRequest = row;
              break;
            }
          } catch (_) {}
        }
      }
    }

    // If candidate found and amounts match, auto-approve!
    if (candidateRequest && BigInt(candidateRequest.amount_minor) === parsed.amountMinor) {
      matchedFundRequest = candidateRequest;
      matchedFundRequestId = candidateRequest.id;
      matchedUserId = candidateRequest.user_id;

      if (!isSimulation) {
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          // Ensure wallet exists
          await client.query(
            `INSERT INTO wallets (user_id, currency) VALUES ($1, 'INR')
             ON CONFLICT (user_id, currency) DO NOTHING`,
            [candidateRequest.user_id]
          );

          const wallet = await client.query(
            "SELECT id FROM wallets WHERE user_id = $1 AND currency = 'INR' FOR UPDATE",
            [candidateRequest.user_id]
          );
          if (!wallet.rowCount) throw new Error('User wallet not found for auto-credit.');

          const walletMode = await getWalletMode(client);
          if (walletMode === 'separate') {
            await client.query(
              "UPDATE wallets SET buyer_balance_minor = buyer_balance_minor + $1::bigint, balance_minor = balance_minor + $1::bigint, updated_at = now() WHERE id = $2",
              [candidateRequest.amount_minor, wallet.rows[0].id]
            );
          } else {
            await client.query(
              "UPDATE wallets SET balance_minor = balance_minor + $1::bigint, buyer_balance_minor = balance_minor + $1::bigint, updated_at = now() WHERE id = $2",
              [candidateRequest.amount_minor, wallet.rows[0].id]
            );
          }

          // Insert wallet entry
          await client.query(
            `INSERT INTO wallet_entries (wallet_id, user_id, amount_minor, entry_type, reference_type, reference_id, idempotency_key)
             VALUES ($1, $2, $3, 'credit', 'fund_request', $4, $5)`,
            [
              wallet.rows[0].id,
              candidateRequest.user_id,
              candidateRequest.amount_minor,
              candidateRequest.id,
              `fund-request-auto-sms:${candidateRequest.id}`,
            ]
          );

          autoApprovalNote = `Auto-approved via Incoming Bank SMS Webhook (Bank: ${parsed.bank}, UTR: ${parsed.utr})`;

          // Update fund request status
          await client.query(
            `UPDATE wallet_fund_requests
             SET status = 'approved', review_note = $1, reviewed_at = now()
             WHERE id = $2`,
            [autoApprovalNote, candidateRequest.id]
          );

          // Audit log
          await client.query(
            `INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details)
             VALUES (NULL, 'fund_request_auto_approved_sms', 'wallet_fund_request', $1, $2::jsonb)`,
            [
              candidateRequest.id,
              JSON.stringify({
                amountMinor: candidateRequest.amount_minor.toString(),
                userId: candidateRequest.user_id,
                utr: parsed.utr,
                bank: parsed.bank,
                sender,
              }),
            ]
          );

          await client.query('COMMIT');
          matchStatus = 'auto_approved';

          // Dispatch wallet_approved_rejected_user notification to user
          if (typeof sendNotificationEvent === 'function') {
            let uMobile = '';
            if (candidateRequest.phone_ciphertext && typeof decryptMobile === 'function') {
              try { uMobile = decryptMobile(candidateRequest.phone_ciphertext); } catch (_) {}
            }
            sendNotificationEvent({
              db,
              decryptServiceConfig,
              eventKey: 'wallet_approved_rejected_user',
              params: {
                name: candidateRequest.name || candidateRequest.username,
                status: 'APPROVED (Auto)',
                amount: typeof formatMinorUnits === 'function' ? formatMinorUnits(candidateRequest.amount_minor) : (Number(candidateRequest.amount_minor) / 100).toFixed(2),
                utr: parsed.utr,
                current_balance: 'Updated',
                remark: autoApprovalNote,
              },
              recipientMobile: uMobile || undefined,
              recipientEmail: candidateRequest.email || undefined,
            }).catch(() => {});
          }
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          console.error('[Incoming SMS Auto-Credit Error]:', err.message);
          matchStatus = 'failed';
          autoApprovalNote = `Auto-approval failed: ${err.message}`;
        } finally {
          client.release();
        }
      } else {
        matchStatus = 'auto_approved';
        autoApprovalNote = `[Simulation] Would auto-approve fund request for user: ${candidateRequest.username} (₹${(Number(candidateRequest.amount_minor)/100).toFixed(2)})`;
      }
    }
  }

  // Save log into incoming_sms_logs
  let logId = null;
  if (!isSimulation) {
    try {
      const insRes = await db.query(
        `INSERT INTO incoming_sms_logs
           (sender, raw_message, sim_slot, parsed_amount_minor, parsed_utr, parsed_bank,
            match_status, matched_fund_request_id, matched_user_id, processed_at, auto_approval_note, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $7 = 'auto_approved' THEN now() ELSE NULL END, $10, $11::jsonb)
         RETURNING id`,
        [
          sender || null,
          rawMessage,
          simSlot || '0',
          parsed.amountMinor > 0n ? parsed.amountMinor.toString() : null,
          parsed.utr || null,
          parsed.bank || null,
          matchStatus,
          matchedFundRequestId,
          matchedUserId,
          autoApprovalNote,
          JSON.stringify(rawPayload || {}),
        ]
      );
      if (insRes.rowCount > 0) logId = insRes.rows[0].id;
    } catch (err) {
      console.error('[Incoming SMS] Error inserting log into DB:', err.message);
    }
  }

  return {
    ok: true,
    logId,
    isCredit: parsed.isCredit,
    amountStr: parsed.amountStr,
    amountMinor: parsed.amountMinor.toString(),
    utr: parsed.utr,
    bank: parsed.bank,
    matchStatus,
    autoApprovalNote,
    matchedUser: matchedFundRequest ? { id: matchedFundRequest.user_id, username: matchedFundRequest.username, name: matchedFundRequest.name } : null,
    message: matchStatus === 'auto_approved'
      ? `Payment of ₹${parsed.amountStr} auto-approved for user ${matchedFundRequest?.username || 'buyer'}!`
      : (parsed.isCredit ? 'Credit SMS recorded (pending matching buyer request).' : 'Incoming message processed.'),
  };
}

/**
 * When a buyer submits a fund request, check if a recent (last 48 hours) unmatched incoming SMS
 * exists for this UTR and amount. If so, auto-approve immediately!
 */
async function autoMatchPendingFundRequestOnSubmission({
  db,
  fundRequestId,
  userId,
  amountMinor,
  transactionId,
  formatMinorUnits,
  sendNotificationEvent,
  decryptServiceConfig,
  decryptMobile,
}) {
  if (!fundRequestId || !userId || !amountMinor || !transactionId) return null;

  try {
    const config = await getIncomingSmsConfig(db, decryptServiceConfig);
    if (!config.isEnabled || !config.autoUpdatePayment) return null;

    const cleanUtr = String(transactionId).trim().toUpperCase();

    // Check if there is an unmatched incoming SMS in the last 48 hours matching this UTR and amount
    const smsRes = await db.query(
      `SELECT id, sender, raw_message, parsed_bank, parsed_utr, created_at
       FROM incoming_sms_logs
       WHERE match_status = 'unmatched'
         AND upper(parsed_utr) = $1
         AND parsed_amount_minor = $2
         AND created_at >= now() - INTERVAL '48 hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [cleanUtr, amountMinor.toString()]
    );

    if (smsRes.rowCount === 0) return null;

    const matchedSms = smsRes.rows[0];

    // Auto-approve the newly submitted fund request
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO wallets (user_id, currency) VALUES ($1, 'INR')
         ON CONFLICT (user_id, currency) DO NOTHING`,
        [userId]
      );

      const wallet = await client.query(
        "SELECT id FROM wallets WHERE user_id = $1 AND currency = 'INR' FOR UPDATE",
        [userId]
      );
      if (!wallet.rowCount) throw new Error('User wallet not found');

      const walletMode = await getWalletMode(client);
      if (walletMode === 'separate') {
        await client.query(
          "UPDATE wallets SET buyer_balance_minor = buyer_balance_minor + $1::bigint, balance_minor = balance_minor + $1::bigint, updated_at = now() WHERE id = $2",
          [amountMinor.toString(), wallet.rows[0].id]
        );
      } else {
        await client.query(
          "UPDATE wallets SET balance_minor = balance_minor + $1::bigint, buyer_balance_minor = balance_minor + $1::bigint, updated_at = now() WHERE id = $2",
          [amountMinor.toString(), wallet.rows[0].id]
        );
      }

      await client.query(
        `INSERT INTO wallet_entries (wallet_id, user_id, amount_minor, entry_type, reference_type, reference_id, idempotency_key)
         VALUES ($1, $2, $3, 'credit', 'fund_request', $4, $5)`,
        [wallet.rows[0].id, userId, amountMinor.toString(), fundRequestId, `fund-request-auto-sms:${fundRequestId}`]
      );

      const autoNote = `Auto-approved via Pre-received Bank SMS (Bank: ${matchedSms.parsed_bank || 'Bank'}, UTR: ${cleanUtr})`;

      await client.query(
        `UPDATE wallet_fund_requests
         SET status = 'approved', review_note = $1, reviewed_at = now()
         WHERE id = $2`,
        [autoNote, fundRequestId]
      );

      // Link in incoming_sms_logs
      await client.query(
        `UPDATE incoming_sms_logs
         SET match_status = 'auto_approved', matched_fund_request_id = $1, matched_user_id = $2,
             processed_at = now(), auto_approval_note = $3
         WHERE id = $4`,
        [fundRequestId, userId, autoNote, matchedSms.id]
      );

      await client.query(
        `INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details)
         VALUES (NULL, 'fund_request_auto_approved_sms', 'wallet_fund_request', $1, $2::jsonb)`,
        [fundRequestId, JSON.stringify({ amountMinor: amountMinor.toString(), userId, utr: cleanUtr, smsId: matchedSms.id })]
      );

      await client.query('COMMIT');

      // Dispatch notification
      try {
        const uRes = await db.query(
          'SELECT name, username, email, phone_ciphertext FROM users WHERE id = $1',
          [userId]
        );
        if (uRes.rowCount > 0 && typeof sendNotificationEvent === 'function') {
          const u = uRes.rows[0];
          let uMobile = '';
          if (u.phone_ciphertext && typeof decryptMobile === 'function') {
            try { uMobile = decryptMobile(u.phone_ciphertext); } catch (_) {}
          }
          sendNotificationEvent({
            db,
            decryptServiceConfig,
            eventKey: 'wallet_approved_rejected_user',
            params: {
              name: u.name || u.username,
              status: 'APPROVED (Instant Auto)',
              amount: typeof formatMinorUnits === 'function' ? formatMinorUnits(amountMinor) : (Number(amountMinor) / 100).toFixed(2),
              utr: cleanUtr,
              current_balance: 'Updated',
              remark: autoNote,
            },
            recipientMobile: uMobile || undefined,
            recipientEmail: u.email || undefined,
          }).catch(() => {});
        }
      } catch (_) {}

      return { autoApproved: true, note: autoNote, smsId: matchedSms.id };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[Incoming SMS Auto-Match on Submission Error]:', err.message);
      return null;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Incoming SMS Auto-Match Error]:', err.message);
    return null;
  }
}

/**
 * Fetch KPI statistics and daily chart aggregations for the Incoming SMS page
 */
async function getIncomingSmsStats(db, { fromDate, toDate, status, bank, query } = {}) {
  const whereClauses = [];
  const params = [];

  if (fromDate) {
    params.push(fromDate);
    whereClauses.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (toDate) {
    params.push(toDate);
    whereClauses.push(`created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
  }
  if (status && status !== 'all') {
    params.push(status);
    whereClauses.push(`match_status = $${params.length}`);
  }
  if (bank && bank !== 'all') {
    params.push(bank.toLowerCase());
    whereClauses.push(`lower(parsed_bank) = $${params.length}`);
  }
  if (query && query.trim()) {
    params.push(`%${query.trim().toLowerCase()}%`);
    whereClauses.push(`(lower(raw_message) LIKE $${params.length} OR lower(COALESCE(parsed_utr, '')) LIKE $${params.length} OR lower(COALESCE(sender, '')) LIKE $${params.length})`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // 1) Totals
  const totalsRes = await db.query(
    `SELECT
       COUNT(*)::int as total_sms,
       COUNT(*) FILTER (WHERE match_status = 'auto_approved')::int as auto_approved_count,
       COUNT(*) FILTER (WHERE match_status = 'unmatched')::int as unmatched_count,
       COUNT(*) FILTER (WHERE match_status = 'ignored')::int as ignored_count,
       COALESCE(SUM(parsed_amount_minor) FILTER (WHERE match_status = 'auto_approved'), 0)::bigint as total_credited_minor
     FROM incoming_sms_logs
     ${whereSql}`,
    params
  ).catch(() => ({ rows: [{ total_sms: 0, auto_approved_count: 0, unmatched_count: 0, ignored_count: 0, total_credited_minor: 0n }] }));

  const totals = totalsRes.rows[0] || {};

  // 2) Daily Chart Data (Past 14 days or filtered period)
  const chartRes = await db.query(
    `SELECT
       to_char(created_at, 'YYYY-MM-DD') as day,
       COUNT(*)::int as count_total,
       COUNT(*) FILTER (WHERE match_status = 'auto_approved')::int as count_approved,
       COALESCE(SUM(parsed_amount_minor) FILTER (WHERE match_status = 'auto_approved'), 0)::bigint as amount_credited_minor
     FROM incoming_sms_logs
     ${whereSql}
     GROUP BY day
     ORDER BY day ASC
     LIMIT 30`,
    params
  ).catch(() => ({ rows: [] }));

  // 3) Bank Breakdown
  const bankRes = await db.query(
    `SELECT
       COALESCE(parsed_bank, 'Other') as bank_name,
       COUNT(*)::int as count,
       COUNT(*) FILTER (WHERE match_status = 'auto_approved')::int as approved_count
     FROM incoming_sms_logs
     ${whereSql}
     GROUP BY bank_name
     ORDER BY count DESC
     LIMIT 10`,
    params
  ).catch(() => ({ rows: [] }));

  return {
    totalSms: Number(totals.total_sms || 0),
    autoApprovedCount: Number(totals.auto_approved_count || 0),
    unmatchedCount: Number(totals.unmatched_count || 0),
    ignoredCount: Number(totals.ignored_count || 0),
    totalCreditedMinor: BigInt(totals.total_credited_minor || 0n),
    chartDaily: chartRes.rows || [],
    bankBreakdown: bankRes.rows || [],
  };
}

/**
 * Fetch paginated incoming SMS logs with filters
 */
async function getIncomingSmsLogs(db, {
  page = 1,
  limit = 25,
  fromDate = '',
  toDate = '',
  status = 'all',
  bank = 'all',
  query = '',
} = {}) {
  const whereClauses = [];
  const params = [];

  if (fromDate) {
    params.push(fromDate);
    whereClauses.push(`l.created_at >= $${params.length}::timestamptz`);
  }
  if (toDate) {
    params.push(toDate);
    whereClauses.push(`l.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
  }
  if (status && status !== 'all') {
    params.push(status);
    whereClauses.push(`l.match_status = $${params.length}`);
  }
  if (bank && bank !== 'all') {
    params.push(bank.toLowerCase());
    whereClauses.push(`lower(l.parsed_bank) = $${params.length}`);
  }
  if (query && query.trim()) {
    params.push(`%${query.trim().toLowerCase()}%`);
    whereClauses.push(
      `(lower(l.raw_message) LIKE $${params.length} OR lower(COALESCE(l.parsed_utr, '')) LIKE $${params.length} OR lower(COALESCE(l.sender, '')) LIKE $${params.length} OR lower(COALESCE(u.username, '')) LIKE $${params.length} OR lower(COALESCE(u.name, '')) LIKE $${params.length})`
    );
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count total rows
  const countRes = await db.query(
    `SELECT COUNT(*)::int as total
     FROM incoming_sms_logs l
     LEFT JOIN users u ON u.id = l.matched_user_id
     ${whereSql}`,
    params
  ).catch(() => ({ rows: [{ total: 0 }] }));

  const total = Number(countRes.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const offset = (currentPage - 1) * limit;

  // Fetch paginated rows
  const queryParams = [...params, limit, offset];
  const rowsRes = await db.query(
    `SELECT
       l.id, l.sender, l.raw_message, l.sim_slot, l.parsed_amount_minor, l.parsed_utr,
       l.parsed_bank, l.match_status, l.matched_fund_request_id, l.matched_user_id,
       l.processed_at, l.auto_approval_note, l.metadata, l.created_at,
       u.username as matched_username, u.name as matched_user_name
     FROM incoming_sms_logs l
     LEFT JOIN users u ON u.id = l.matched_user_id
     ${whereSql}
     ORDER BY l.created_at DESC
     LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams
  ).catch(() => ({ rows: [] }));

  return {
    rows: rowsRes.rows || [],
    total,
    page: currentPage,
    limit,
    totalPages,
  };
}

module.exports = {
  parseIncomingBankSms,
  getIncomingSmsConfig,
  saveIncomingSmsConfig,
  processIncomingSms,
  autoMatchPendingFundRequestOnSubmission,
  getIncomingSmsStats,
  getIncomingSmsLogs,
};
