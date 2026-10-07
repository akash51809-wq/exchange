'use strict';

/**
 * Seller API Health and Rule Enforcements
 * 1. Auto-disable seller API after set number of fail transactions (apiDisableFailTxn)
 * 2. Auto-suspend seller API after set % on refund transactions in a 24-hour day (apiSuspendRefundPercent)
 */

async function fetchGeneralSettings(db, decryptServiceConfig) {
  try {
    const row = await db.query("SELECT is_enabled, config_ciphertext FROM admin_service_settings WHERE service_key = 'general'");
    if (row.rowCount > 0) {
      if (typeof decryptServiceConfig === 'function') {
        const config = decryptServiceConfig(row.rows[0].config_ciphertext);
        return { isEnabled: row.rows[0].is_enabled, ...config };
      }
    }
  } catch (err) {
    console.error('[SellerApiRules] Error fetching general settings:', err.message);
  }
  return {
    apiDisableFailTxnEnabled: true,
    apiDisableFailTxnCount: 5,
    apiSuspendRefundPercentEnabled: true,
    apiSuspendRefundPercent: 25,
  };
}

/**
 * Handle a successful hit on Seller API:
 * Resets consecutive fail count back to 0.
 */
async function handleSellerApiSuccess(db, sellerApiId) {
  if (!sellerApiId) return;
  try {
    await db.query(
      'UPDATE seller_api_settings SET fail_count = 0 WHERE id = $1',
      [sellerApiId],
    );
  } catch (err) {
    console.warn('[SellerApiRules] Error resetting seller API fail count:', err.message);
  }
}

/**
 * Handle a failed hit on Seller API:
 * Increments fail count. If threshold reached, disables the API (is_active = false).
 */
async function handleSellerApiFailure(db, sellerApiId, genSettings) {
  if (!sellerApiId) return;
  try {
    if (!genSettings || genSettings.apiDisableFailTxnEnabled === undefined) {
      genSettings = await fetchGeneralSettings(db);
    }
    if (!genSettings.apiDisableFailTxnEnabled) return;

    const maxFails = Math.max(1, parseInt(genSettings.apiDisableFailTxnCount, 10) || 5);

    const upd = await db.query(
      `UPDATE seller_api_settings
       SET fail_count = COALESCE(fail_count, 0) + 1,
           is_active = CASE WHEN COALESCE(fail_count, 0) + 1 >= $2 THEN false ELSE is_active END,
           auto_disabled_at = CASE WHEN COALESCE(fail_count, 0) + 1 >= $2 THEN now() ELSE auto_disabled_at END,
           auto_disabled_reason = CASE WHEN COALESCE(fail_count, 0) + 1 >= $2
             THEN 'Auto-disabled: ' || (COALESCE(fail_count, 0) + 1) || ' consecutive failed transactions reached (Limit: ' || $2 || ')'
             ELSE auto_disabled_reason END,
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, fail_count, is_active`,
      [sellerApiId, maxFails],
    );

    if (upd.rowCount > 0 && !upd.rows[0].is_active) {
      console.warn(
        `[Auto-Disable Seller API] Seller API "${upd.rows[0].name}" (${upd.rows[0].id}) automatically DISABLED after ${upd.rows[0].fail_count} failed transactions (Limit: ${maxFails}).`
      );
    }
  } catch (err) {
    console.error('[SellerApiRules] Error handling seller API failure:', err.message);
  }
}

/**
 * Check and suspend Seller API if refund rate in last 24 hours exceeds threshold %.
 */
async function checkAndSuspendSellerApiOnDailyRefund(db, sellerApiId, genSettings) {
  if (!sellerApiId) return;
  try {
    if (!genSettings || genSettings.apiSuspendRefundPercentEnabled === undefined) {
      genSettings = await fetchGeneralSettings(db);
    }
    if (!genSettings.apiSuspendRefundPercentEnabled) return;

    const thresholdPercent = Math.max(1, Math.min(100, parseFloat(genSettings.apiSuspendRefundPercent) || 25));

    // Calculate orders for this seller_api_id in the last 24 hours
    const statsRes = await db.query(
      `SELECT
         COUNT(*) AS total_count,
         COUNT(*) FILTER (WHERE status = 'refunded' OR dispute_status = 'accepted') AS refund_count
       FROM recharge_orders
       WHERE seller_api_id = $1
         AND created_at >= NOW() - INTERVAL '24 hours'`,
      [sellerApiId],
    );

    if (statsRes.rowCount > 0) {
      const total = parseInt(statsRes.rows[0].total_count, 10) || 0;
      const refunds = parseInt(statsRes.rows[0].refund_count, 10) || 0;

      // To avoid false triggers on low volume, require minimum 3 orders
      if (total >= 3 && refunds > 0) {
        const refundPercent = (refunds / total) * 100.0;
        if (refundPercent >= thresholdPercent) {
          const res = await db.query(
            `UPDATE seller_api_settings
             SET is_active = false,
                 auto_disabled_at = now(),
                 auto_disabled_reason = 'Auto-suspended: Daily refund rate is ' || ROUND($2::numeric, 1) || '% (' || $3 || '/' || $4 || ' txns), exceeding limit ' || $5 || '%',
                 updated_at = now()
             WHERE id = $1 AND is_active = true
             RETURNING id, name`,
            [sellerApiId, refundPercent, refunds, total, thresholdPercent],
          );
          if (res.rowCount > 0) {
            console.warn(
              `[Auto-Suspend Seller API] Seller API "${res.rows[0].name}" (${sellerApiId}) automatically SUSPENDED due to ${refundPercent.toFixed(1)}% refunds in 24h (${refunds}/${total}) >= ${thresholdPercent}%.`
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('[SellerApiRules] Error checking daily refund percent:', err.message);
  }
}

module.exports = {
  fetchGeneralSettings,
  handleSellerApiSuccess,
  handleSellerApiFailure,
  checkAndSuspendSellerApiOnDailyRefund,
};
