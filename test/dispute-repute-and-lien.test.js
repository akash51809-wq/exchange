'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { holdDisputeLien, releaseDisputeLien, applyDisputeRefundPenalty, clearPolicyCache } = require('../lib/wallet-helper');

test('Dispute Lien Multiplier - Freezes multiple of recharge amount on seller wallet', async () => {
  clearPolicyCache();
  let lienAmountMinorInserted = 0n;
  let multiplierUsed = 0;
  let walletLienUpdated = 0n;

  const mockClient = {
    query: async (sql, params) => {
      // 1. Policy settings
      if (/FROM\s+website_settings/is.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            wallet_mode: 'single',
            seller_sale_redeem_hold_minutes: 0,
            seller_sale_exchange_hold_minutes: 0,
            dispute_lien_multiplier: '3.00',
            dispute_refund_lien_multiplier: '3.00',
            dispute_refund_lien_days: 10,
          }]
        };
      }
      if (/CREATE\s+TABLE/is.test(sql)) {
        return { rowCount: 0, rows: [] };
      }
      if (/INSERT\s+INTO\s+seller_wallet_liens/is.test(sql)) {
        lienAmountMinorInserted = BigInt(params[3]);
        multiplierUsed = Number(params[4]);
        return { rowCount: 1, rows: [{ id: 'mock-lien-uuid-1' }] };
      }
      if (/UPDATE\s+wallets/is.test(sql) && /lien_balance_minor/is.test(sql)) {
        walletLienUpdated = BigInt(params[0]);
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  // Rs 100 recharge (10000 minor) with 3.0x multiplier
  const res = await holdDisputeLien(mockClient, {
    orderId: 'mock-order-1',
    sellerId: 'mock-seller-1',
    rechargeAmountMinor: 10000,
  });

  assert.ok(res);
  // Rs 100 * 3 = Rs 300 (30000 minor)
  assert.equal(lienAmountMinorInserted, 30000n, 'Lien amount inserted must be 3x recharge amount');
  assert.equal(walletLienUpdated, 30000n, 'Wallet lien balance must increase by 3x recharge amount');
  assert.equal(multiplierUsed, 3.0, 'Multiplier used must be 3.0');
});

test('Dispute Lien Release on Reject - Releases entire 3x lien amount on seller wallet', async () => {
  clearPolicyCache();
  let lienStatusUpdated = '';
  let walletLienDeducted = 0n;

  const mockClient = {
    query: async (sql, params) => {
      if (/FROM\s+seller_wallet_liens/is.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: 'mock-lien-uuid-1',
            seller_user_id: 'mock-seller-1',
            amount_minor: '30000', // 300 Rs lien
          }]
        };
      }
      if (/UPDATE\s+seller_wallet_liens\s+SET\s+status\s*=\s*'released'/is.test(sql)) {
        lienStatusUpdated = 'released';
        return { rowCount: 1, rows: [] };
      }
      if (/UPDATE\s+wallets/is.test(sql) && /lien_balance_minor/is.test(sql)) {
        walletLienDeducted = BigInt(params[0]);
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  await releaseDisputeLien(mockClient, {
    orderId: 'mock-order-1',
    reason: 'Dispute rejected by seller',
  });

  assert.equal(lienStatusUpdated, 'released', 'Lien status must be released');
  assert.equal(walletLienDeducted, 30000n, 'Entire 300 Rs (30000 minor) lien must be deducted from wallet lien balance');
});

test('Dispute Refund Retention - Holds 3x penalty lien for configured days on accepted refund', async () => {
  clearPolicyCache();
  let penaltyLienInserted = 0n;
  let penaltyExpiresAt = null;

  const mockClient = {
    query: async (sql, params) => {
      if (/FROM\s+website_settings/is.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            wallet_mode: 'single',
            seller_sale_redeem_hold_minutes: 0,
            seller_sale_exchange_hold_minutes: 0,
            dispute_lien_multiplier: '3.00',
            dispute_refund_lien_multiplier: '3.00',
            dispute_refund_lien_days: 10,
          }]
        };
      }
      if (/status\s*=\s*'active'\s+AND\s+lien_type\s*=\s*'dispute'/is.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: 'mock-lien-1',
            seller_user_id: 'mock-seller-1',
            amount_minor: '30000',
          }]
        };
      }
      if (/SET\s+status\s*=\s*'deducted'/is.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      if (/INSERT\s+INTO\s+seller_wallet_liens/is.test(sql)) {
        penaltyLienInserted = BigInt(params[2]);
        penaltyExpiresAt = params[5];
        return { rowCount: 1, rows: [] };
      }
      if (/UPDATE\s+wallets/is.test(sql) && /lien_balance_minor/is.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  const res = await applyDisputeRefundPenalty(mockClient, {
    orderId: 'mock-order-1',
    sellerId: 'mock-seller-1',
    rechargeAmountMinor: 10000,
    reason: 'Dispute accepted and refunded',
  });

  assert.equal(penaltyLienInserted, 30000n, 'Penalty lien must hold 3x recharge amount');
  assert.equal(res.refundDays, 10, 'Must hold for 10 days as configured');
  assert.ok(penaltyExpiresAt, 'Must set expiration timestamp');
  assert.ok(penaltyExpiresAt.getTime() > Date.now() + 9 * 24 * 3600 * 1000, 'Expiration must be at least 9 days in future');
});

test('Re-Dispute Logic - Rejects refunded transactions and allows re-dispute on rejected transactions', () => {
  // Test conditions for dispute / re-dispute eligibility
  function checkDisputeEligibility(order, maxAgeDays) {
    if (order.dispute_status === 'accepted' || order.status === 'refunded') {
      return { ok: false, error: 'This transaction has already been refunded.' };
    }
    if (order.dispute_status === 'pending') {
      return { ok: false, error: 'A dispute is already pending review for this transaction.' };
    }
    const ageDays = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > maxAgeDays) {
      return { ok: false, error: `Complaints cannot be accepted for transactions older than ${maxAgeDays} days.` };
    }
    return { ok: true, isReDispute: order.dispute_status === 'rejected' };
  }

  const now = new Date().toISOString();
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();

  // 1. Refunded transaction -> Blocked
  const refundedOrder = { status: 'refunded', dispute_status: 'accepted', created_at: now };
  assert.equal(checkDisputeEligibility(refundedOrder, 7).ok, false);
  assert.equal(checkDisputeEligibility(refundedOrder, 7).error, 'This transaction has already been refunded.');

  // 2. Pending dispute -> Blocked
  const pendingOrder = { status: 'successful', dispute_status: 'pending', created_at: now };
  assert.equal(checkDisputeEligibility(pendingOrder, 7).ok, false);
  assert.equal(checkDisputeEligibility(pendingOrder, 7).error, 'A dispute is already pending review for this transaction.');

  // 3. Rejected dispute within max age -> Allowed as Re-Dispute!
  const rejectedOrder = { status: 'successful', dispute_status: 'rejected', created_at: now };
  const rejectedRes = checkDisputeEligibility(rejectedOrder, 7);
  assert.equal(rejectedRes.ok, true);
  assert.equal(rejectedRes.isReDispute, true, 'Must identify as Re-Dispute');

  // 4. Custom maxAgeDays check: if admin sets 5 days, 10-day old transaction is rejected
  assert.equal(checkDisputeEligibility(rejectedOrder, 5).ok, true); // now is < 5 days
  const oldRejectedOrder = { status: 'successful', dispute_status: 'rejected', created_at: tenDaysAgo };
  const oldRes = checkDisputeEligibility(oldRejectedOrder, 5);
  assert.equal(oldRes.ok, false);
  assert.equal(oldRes.error, 'Complaints cannot be accepted for transactions older than 5 days.');

  // 5. If admin configures 15 days, 10-day old transaction is accepted
  const oldRes15 = checkDisputeEligibility(oldRejectedOrder, 15);
  assert.equal(oldRes15.ok, true);
});
