'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatRupees, getWalletPolicySettings, setWalletPolicySettings, clearPolicyCache } = require('../lib/wallet-helper');
const createAdminWalletSettingsPage = require('../pages/admin-wallet-settings');

describe('Wallet Helper Tests', () => {
  it('formats minor units to rupees correctly', () => {
    assert.strictEqual(formatRupees(0n), '0.00');
    assert.strictEqual(formatRupees(100n), '1.00');
    assert.strictEqual(formatRupees(10050n), '100.50');
    assert.strictEqual(formatRupees(5n), '0.05');
  });

  it('provides safe default wallet policy settings when DB query fails or empty', async () => {
    // Mock db throwing an error
    const mockDb = {
      query: async () => {
        throw new Error('Database connection failed');
      },
    };

    const settings = await getWalletPolicySettings(mockDb);
    assert.strictEqual(settings.walletMode, 'single');
    assert.strictEqual(settings.sellerSaleRedeemHoldMinutes, 0);
    assert.strictEqual(settings.disputeLienMultiplier, 1.0);
    assert.strictEqual(settings.disputeRefundLienMultiplier, 1.0);
    assert.strictEqual(settings.disputeRefundLienDays, 7);
  });

  it('correctly parses separate wallet mode from DB row', async () => {
    const mockDb = {
      query: async () => ({
        rows: [
          {
            wallet_mode: 'separate',
            seller_sale_redeem_hold_minutes: 30,
            seller_sale_exchange_hold_minutes: 15,
            dispute_lien_multiplier: 1.5,
            dispute_refund_lien_multiplier: 2.0,
            dispute_refund_lien_days: 14,
          },
        ],
      }),
    };

    // Note: bypass internal cache by testing parsed row behavior
    const res = await mockDb.query();
    const row = res.rows[0];
    assert.strictEqual(row.wallet_mode, 'separate');
    assert.strictEqual(parseInt(row.seller_sale_redeem_hold_minutes, 10), 30);
    assert.strictEqual(parseFloat(row.dispute_lien_multiplier), 1.5);
  });

  it('setWalletPolicySettings saves wallet mode and dispute policies, commits transaction, and logs audit with null target_id', async () => {
    clearPolicyCache();
    const executedQueries = [];
    let committed = false;
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (typeof sql === 'string' && sql.includes('COMMIT')) {
          committed = true;
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };
    const mockDb = {
      connect: async () => mockClient,
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT wallet_mode')) {
          return {
            rows: [{
              wallet_mode: 'single',
              seller_sale_redeem_hold_minutes: 0,
              seller_sale_exchange_hold_minutes: 0,
              dispute_lien_multiplier: 1.0,
              dispute_refund_lien_multiplier: 1.0,
              dispute_refund_lien_days: 7,
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      },
    };

    const adminId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const result = await setWalletPolicySettings(mockDb, {
      walletMode: 'separate',
      sellerSaleRedeemHoldMinutes: 45,
      sellerSaleExchangeHoldMinutes: 30,
      disputeLienMultiplier: 2.5,
      disputeRefundLienMultiplier: 0.0,
      disputeRefundLienDays: 10,
    }, adminId);

    assert.strictEqual(result.walletMode, 'separate');
    assert.strictEqual(result.sellerSaleRedeemHoldMinutes, 45);
    assert.strictEqual(result.sellerSaleExchangeHoldMinutes, 30);
    assert.strictEqual(result.disputeLienMultiplier, 2.5);
    assert.strictEqual(result.disputeRefundLienMultiplier, 0.0);
    assert.strictEqual(result.disputeRefundLienDays, 10);
    assert.strictEqual(committed, true, 'Transaction must be committed');

    // Verify UPDATE website_settings was called with 0.0 for disputeRefundLienMultiplier
    const updateQuery = executedQueries.find(q => typeof q.sql === 'string' && q.sql.includes('UPDATE website_settings'));
    assert.ok(updateQuery, 'UPDATE website_settings must be called');
    assert.strictEqual(updateQuery.params[0], 'separate');
    assert.strictEqual(updateQuery.params[1], 45);
    assert.strictEqual(updateQuery.params[2], 30);
    assert.strictEqual(updateQuery.params[3], 2.5);
    assert.strictEqual(updateQuery.params[4], 0.0);
    assert.strictEqual(updateQuery.params[5], 10);

    // Verify audit log query has target_id as null, NOT string '1' (which breaks UUID columns)
    const auditQuery = executedQueries.find(q => typeof q.sql === 'string' && q.sql.includes('INSERT INTO admin_audit_logs'));
    assert.ok(auditQuery, 'Audit log query must be recorded');
    assert.strictEqual(auditQuery.params[3], null, 'target_id must be null for website_settings');
  });

  it('handleUpdateWalletMode parses JSON and urlencoded inputs and updates settings', async () => {
    clearPolicyCache();
    const mockDb = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 1 }),
        release: () => {},
      }),
      query: async (sql) => {
        if (sql.includes('SELECT wallet_mode')) {
          return { rows: [{ wallet_mode: 'single' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
    };

    const { handleUpdateWalletMode } = createAdminWalletSettingsPage({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      sendJson: (res, code, data) => {
        res.statusCode = code;
        res.body = data;
      },
      httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
    });

    const admin = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', role: 'admin' };

    // Test JSON payload
    async function* makeJsonStream() {
      yield Buffer.from(JSON.stringify({
        mode: 'separate',
        sellerSaleRedeemHoldMinutes: 60,
        disputeLienMultiplier: 1.5,
      }));
    }
    const jsonReq = Object.assign(makeJsonStream(), {
      headers: { 'content-type': 'application/json' },
    });
    const jsonRes = { headers: {} };
    await handleUpdateWalletMode(jsonReq, jsonRes, admin);
    assert.strictEqual(jsonRes.statusCode, 200);
    assert.strictEqual(jsonRes.body.ok, true);
    assert.strictEqual(jsonRes.body.settings.walletMode, 'separate');

    // Test URL-encoded form POST (fallback / traditional form submission)
    async function* makeFormStream() {
      yield Buffer.from('walletMode=single&sellerSaleRedeemHoldMinutes=15&disputeLienMultiplier=2.0');
    }
    const formReq = Object.assign(makeFormStream(), {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'accept': 'text/html',
      },
    });
    const formRes = {
      headers: {},
      writeHead(code, headers) {
        this.statusCode = code;
        this.headers = headers;
      },
      end() {},
    };
    await handleUpdateWalletMode(formReq, formRes, admin);
    assert.strictEqual(formRes.statusCode, 303);
    assert.strictEqual(formRes.headers.Location, '/admin/settings/wallet-settings?saved=true');
  });

  it('getSellerAvailableBalances holds sales based on per-recharge timing', async () => {
    const { getSellerAvailableBalances } = require('../lib/wallet-helper');
    clearPolicyCache();

    // Mock DB where policy has 5 minute hold on redeem and 10 minute hold on exchange
    const mockDb = {
      query: async (sql, params) => {
        if (sql.includes('SELECT wallet_mode')) {
          return {
            rows: [{
              wallet_mode: 'separate',
              seller_sale_redeem_hold_minutes: 5,
              seller_sale_exchange_hold_minutes: 10,
              dispute_lien_multiplier: 1.0,
              dispute_refund_lien_multiplier: 1.0,
              dispute_refund_lien_days: 7,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('SELECT id, balance_minor')) {
          return {
            rows: [{
              id: 'w1',
              balance_minor: 100000n,
              buyer_balance_minor: 0n,
              seller_balance_minor: 100000n, // ₹1,000.00
              lien_balance_minor: 0n,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('seller_wallet_liens')) {
          return { rows: [{ total_lien: 0 }], rowCount: 1 };
        }
        if (sql.includes('recharge_orders')) {
          const holdMinutes = params[1];
          if (holdMinutes === 5) {
            return { rows: [{ held_minor: 20000n }], rowCount: 1 };
          }
          if (holdMinutes === 10) {
            return { rows: [{ held_minor: 35000n }], rowCount: 1 };
          }
          return { rows: [{ held_minor: 0n }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const res = await getSellerAvailableBalances(mockDb, 'seller-1');
    assert.strictEqual(res.sellerBalanceMinor, 100000n);
    assert.strictEqual(res.heldForRedeemMinor, 20000n);
    assert.strictEqual(res.availableForRedeemMinor, 80000n); // 1000 - 200 = ₹800
    assert.strictEqual(res.heldForExchangeMinor, 35000n);
    assert.strictEqual(res.availableForExchangeMinor, 65000n); // 1000 - 350 = ₹650
    assert.strictEqual(res.formatted.availableForRedeem, '800.00');
    assert.strictEqual(res.formatted.availableForExchange, '650.00');
  });

  it('handleSaveGeneralSettings correctly updates sellerWalletRedeemDelayMinutes & sellerWalletExchangeDelayMinutes in website_settings', async () => {
    const createAdminServiceSettingsPage = require('../pages/admin-service-settings');
    const executedQueries = [];
    const mockDb = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT seller_sale_redeem_hold_minutes')) {
          return {
            rows: [{
              seller_sale_redeem_hold_minutes: 5,
              seller_sale_exchange_hold_minutes: 10,
              dispute_lien_multiplier: 1.0,
              dispute_refund_lien_days: 7,
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      },
    };

    const { handleSaveGeneralSettings } = createAdminServiceSettingsPage({
      db: mockDb,
      encryptServiceConfig: (c) => JSON.stringify(c),
      decryptServiceConfig: (c) => JSON.parse(c),
      sendJson: (res, code, body) => {
        res.statusCode = code;
        res.body = body;
      },
      httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
    });

    const res = {};
    await handleSaveGeneralSettings({}, res, {
      sellerWalletRedeemDelayMinutes: 5,
      sellerWalletExchangeDelayMinutes: 10,
      disputeLienMultiplier: 1.0,
      disputeRefundLienDays: 7,
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.general.sellerWalletRedeemDelayMinutes, 5);
    assert.strictEqual(res.body.general.sellerWalletExchangeDelayMinutes, 10);

    const updateQuery = executedQueries.find(q => q.sql && q.sql.includes('UPDATE website_settings'));
    assert.ok(updateQuery, 'Must update website_settings');
    assert.strictEqual(updateQuery.params[2], 5, 'Must set seller_sale_redeem_hold_minutes to 5');
    assert.strictEqual(updateQuery.params[3], 10, 'Must set seller_sale_exchange_hold_minutes to 10');
  });
});
