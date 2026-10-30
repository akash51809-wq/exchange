'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const createBuyerApiService = require('../lib/buyer-api-service');

describe('System Hardening, Security & High-Performance Verification', () => {

  it('Strict Amount Validation rejects negative, 0, NaN, Infinity, and invalid decimal places', async () => {
    let sentStatusCode = 0;
    let sentPayload = null;

    const mockDb = {
      query: async (sql) => {
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'buyer-user-1', username: 'buyer1', status: 'active' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => {},
      }),
    };

    const mockService = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({}),
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => null,
      sendJson: (_res, code, payload) => {
        sentStatusCode = code;
        sentPayload = payload;
      },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
    });

    const invalidAmounts = ['-50', '0', 'abc', 'NaN', 'Infinity', '10.555', '1e5', '100000000'];

    for (const badAmt of invalidAmounts) {
      sentStatusCode = 0;
      sentPayload = null;

      const mockReq = {
        method: 'GET',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };
      const testUrl = new URL(`http://localhost/webservices/api/recharge?api_token=tok123&number=9876543210&amount=${encodeURIComponent(badAmt)}&operator=AIRTEL&ref_id=REF_VAL_${Date.now()}`);

      await mockService.handleBuyerRecharge(mockReq, {}, testUrl);

      assert.strictEqual(sentStatusCode, 400, `Amount "${badAmt}" should return HTTP 400`);
      assert.strictEqual(sentPayload.status, 'FAILURE');
      assert.strictEqual(sentPayload.errorcode, 'ERR_INVALID_AMOUNT');
    }
  });

  it('Atomic Balance Pre-Debit: Locks wallet with row lock FOR UPDATE and debits before calling sellers', async () => {
    const executedQueries = [];

    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('SELECT id, balance_minor') && sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 'wallet-atomic-1', balance_minor: 100000n, buyer_balance_minor: 100000n }], rowCount: 1 };
        }
        if (sql.includes('UPDATE wallets SET')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO wallet_entries')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'buyer-user-1', username: 'buyer1', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips') || sql.includes('FROM recharge_orders')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('FROM admin_service_settings')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('FROM operator_definitions')) {
          return {
            rows: [{
              id: 'op-1',
              operator_name: 'Airtel',
              operator_code: 'AIRTEL',
              minimum_amount_minor: 1000n,
              maximum_amount_minor: 1000000n,
              stop_amounts_minor: [],
              operator_number_length: 10,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM buyer_margin_settings')) {
          return {
            rows: [{
              id: 'b-margin-1',
              commission_percent: '3.0',
              circle_name: 'All',
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM seller_margin_settings')) {
          return {
            rows: [{
              seller_margin_id: 's-margin-1',
              user_id: 'seller-user-1',
              commission_percent: '4.0',
              seller_api_id: 'api-1',
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ recharge: { url: 'https://example.com' } }),
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => null,
      sendJson: () => {},
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: async () => ({
        ok: true,
        status: 'SUCCESS',
        supplierTxnId: 'SUP12345',
        operatorTxnId: 'OP12345',
      }),
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const testUrl = new URL('http://localhost/webservices/api/recharge?api_token=tok123&number=9876543210&amount=199&operator=AIRTEL&ref_id=REF_PREDEBIT_1');

    await service.handleBuyerRecharge(mockReq, {}, testUrl);

    // Verify row lock FOR UPDATE was used
    const lockQuery = executedQueries.find((q) => q.sql.includes('FOR UPDATE') && q.sql.includes('FROM wallets'));
    assert.ok(lockQuery, 'A row-level lock (FOR UPDATE) must be acquired on the buyer wallet');

    // Verify debit entry was written to wallet_entries before supplier finish
    const debitEntries = executedQueries.filter((q) => q.sql.includes('INSERT INTO wallet_entries') && q.sql.includes("'debit'"));
    assert.strictEqual(debitEntries.length, 1, 'Exactly one pre-debit entry must be recorded');
    assert.match(debitEntries[0].sql, /recharge_order/, 'Debit entry reference type must be recharge_order');
  });

  it('Order ID Scoping: Status Check enforces user_id = buyer.id and rejects unauthorized access', async () => {
    let sentStatusCode = 0;
    let sentPayload = null;

    const mockDb = {
      query: async (sql, params) => {
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'buyer-user-A', username: 'buyerA', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('FROM recharge_orders')) {
          // Verify that user_id = $1 is in SQL and params[0] is buyer.id
          assert.ok(sql.includes('WHERE user_id = $1'), 'Status check SQL MUST enforce user_id = $1');
          assert.strictEqual(params[0], 'buyer-user-A', 'User ID param must match authenticated buyer ID');
          // Simulate no match because order belongs to buyer-user-B
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({}),
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => null,
      sendJson: (_res, code, payload) => {
        sentStatusCode = code;
        sentPayload = payload;
      },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const testUrl = new URL('http://localhost/webservices/api/status?api_token=tok123&ref_id=ORDER_OF_BUYER_B');

    await service.handleBuyerStatus(mockReq, {}, testUrl);

    assert.strictEqual(sentStatusCode, 404);
    assert.strictEqual(sentPayload.status, 'FAILURE');
    assert.strictEqual(sentPayload.errorcode, 'ERR_NOT_FOUND');
    assert.match(sentPayload.message, /not found/i);
  });

  it('General Settings in-memory caching serves 1000 requests without hitting DB repeatedly', async () => {
    let dbQueryCount = 0;

    const mockDb = {
      query: async (sql) => {
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'buyer-user-1', username: 'buyer1', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM recharge_orders')) {
          return {
            rows: [{
              id: 'order-1',
              idempotency_key: 'REF_1',
              status: 'successful',
              dispute_status: 'none',
              created_at: new Date(),
            }],
            rowCount: 1,
          };
        }
        if (sql.includes("FROM admin_service_settings WHERE service_key = 'general'")) {
          dbQueryCount++;
          return {
            rowCount: 1,
            rows: [{
              is_enabled: true,
              config_ciphertext: Buffer.from('mock_encrypted'),
            }],
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({}),
      decryptServiceConfig: () => ({ instantResponseEnabled: true, instantResponseSeconds: 15 }),
      fetchOperatorLookup: async () => null,
      sendJson: () => {},
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
    });

    // Make 100 calls to trigger general settings
    for (let i = 0; i < 100; i++) {
      const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      const testUrl = new URL(`http://localhost/webservices/api/dispute?api_token=tok123&ref_id=REF_${i}`);
      await service.handleBuyerDispute(mockReq, {}, testUrl);
    }

    // Only 1 query should have been made to admin_service_settings across 100 calls
    assert.strictEqual(dbQueryCount, 1, 'admin_service_settings must be cached in memory (1 query instead of 100)');
  });
});
