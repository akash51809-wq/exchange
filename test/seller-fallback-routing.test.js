'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createBuyerApiService = require('../lib/buyer-api-service');

test('Seller Fallback Routing - Respects maxSellerRetryCount and margin >= buyer asked margin', async (t) => {
  await t.test('Falls back to at most maxSellerRetryCount sellers when 1st seller fails', async () => {
    const attemptsMade = [];

    const mockSellers = [
      { seller_margin_id: 'm1', user_id: 'seller-high', commission_percent: '4.50', seller_api_id: 'api-1', seller_api_name: 'HighAPI', config_ciphertext: 'enc', is_active: true },
      { seller_margin_id: 'm2', user_id: 'seller-mid1', commission_percent: '3.50', seller_api_id: 'api-2', seller_api_name: 'Mid1API', config_ciphertext: 'enc', is_active: true },
      { seller_margin_id: 'm3', user_id: 'seller-mid2', commission_percent: '3.00', seller_api_id: 'api-3', seller_api_name: 'Mid2API', config_ciphertext: 'enc', is_active: true },
      { seller_margin_id: 'm4', user_id: 'seller-low',  commission_percent: '2.50', seller_api_id: 'api-4', seller_api_name: 'LowAPI',  config_ciphertext: 'enc', is_active: true },
    ];

    // Mock DB
    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'w1', balance_minor: 100000n, buyer_balance_minor: 100000n, seller_balance_minor: 0n }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql, params) => {
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'buyer-user-1', username: 'buyer_test', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM recharge_orders WHERE idempotency_key')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM recharge_orders WHERE (mobile_number')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM admin_service_settings')) {
          return {
            rows: [{
              service_key: 'general',
              is_enabled: true,
              config_ciphertext: 'mock',
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM operator_definitions')) {
          return {
            rows: [{
              id: 'op-jio',
              operator_name: 'Jio',
              operator_code: 'JIO',
              minimum_amount_minor: 1000n,
              maximum_amount_minor: 1000000n,
              stop_amounts_minor: [],
              operator_number_length: 10,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'w1', balance_minor: 100000n, buyer_balance_minor: 100000n, seller_balance_minor: 0n }], rowCount: 1 };
        }
        if (sql.includes('FROM buyer_margin_settings')) {
          // Buyer asked margin = 2.50%
          return {
            rows: [{
              id: 'bm-1',
              commission_percent: '2.50',
              with_gst: false,
              limit_minor: null,
              limit_used_minor: 0n,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM seller_margin_settings')) {
          return { rows: mockSellers, rowCount: mockSellers.length };
        }
        if (sql.includes('INSERT INTO recharge_orders')) {
          return { rows: [{ id: 'order-uuid-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    // Forward function that records attempts and fails seller-high and seller-mid1, then succeeds on seller-mid2
    const customForward = async ({ sellerApiRow, rechargeData }) => {
      attemptsMade.push(sellerApiRow.user_id);
      if (sellerApiRow.user_id === 'seller-mid2') {
        return { ok: true, status: 'SUCCESS', message: 'Recharge Success', supplierTxnId: 'SUPP123', operatorTxnId: 'OP123' };
      }
      return { ok: false, status: 'FAILURE', message: 'Supplier simulated fail' };
    };

    let sentPayload = null;
    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ apiUrl: 'https://api.example.com', method: 'GET' }),
      decryptServiceConfig: () => ({
        stopRehitAfterEnabled: false,
        maxSellerRetryEnabled: true,
        maxSellerRetryCount: 2, // At most 2 fallback sellers after 1st fail
        stopSameNumberAmountEnabled: false,
      }),
      fetchOperatorLookup: async () => null,
      sendJson: (_res, _code, payload) => { sentPayload = payload; },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: customForward,
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const mockUrl = new URL('http://localhost/webservices/api/recharge?username=buyer_test&token=tok&number=9876543210&amount=100&operator=JIO&ref_id=REF_TEST_1');

    await service.handleBuyerRecharge(mockReq, mockRes, mockUrl);

    // 1st seller (seller-high) failed -> tried seller-mid1 (fallback 1) -> failed -> tried seller-mid2 (fallback 2) -> succeeded!
    assert.deepEqual(attemptsMade, ['seller-high', 'seller-mid1', 'seller-mid2']);
    // seller-low should not be attempted since seller-mid2 succeeded
    assert.equal(attemptsMade.includes('seller-low'), false);
    assert.equal(sentPayload?.status, 'SUCCESS');
  });

  await t.test('Halts cascade when maxSellerRetryCount is reached even if more sellers exist', async () => {
    const attemptsMade = [];

    const mockSellers = [
      { seller_margin_id: 'm1', user_id: 'seller-1', commission_percent: '4.00', seller_api_id: 'api-1', config_ciphertext: 'enc', is_active: true },
      { seller_margin_id: 'm2', user_id: 'seller-2', commission_percent: '3.50', seller_api_id: 'api-2', config_ciphertext: 'enc', is_active: true },
      { seller_margin_id: 'm3', user_id: 'seller-3', commission_percent: '3.00', seller_api_id: 'api-3', config_ciphertext: 'enc', is_active: true },
      { seller_margin_id: 'm4', user_id: 'seller-4', commission_percent: '2.50', seller_api_id: 'api-4', config_ciphertext: 'enc', is_active: true },
    ];

    const mockClient = {
      query: async () => ({ rows: [{ id: 'w1', balance_minor: 100000n, buyer_balance_minor: 100000n }], rowCount: 1 }),
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql) => {
        if (sql.includes('SELECT u.id, u.username')) return { rows: [{ id: 'buyer-user-1', username: 'buyer_test', status: 'active' }], rowCount: 1 };
        if (sql.includes('FROM admin_service_settings')) {
          return {
            rows: [{
              service_key: 'general',
              is_enabled: true,
              config_ciphertext: 'mock',
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM operator_definitions')) {
          return { rows: [{ id: 'op-jio', operator_name: 'Jio', operator_code: 'JIO', minimum_amount_minor: 1000n, maximum_amount_minor: 1000000n, stop_amounts_minor: [], operator_number_length: 10 }], rowCount: 1 };
        }
        if (sql.includes('FROM wallets')) return { rows: [{ id: 'w1', balance_minor: 100000n, buyer_balance_minor: 100000n }], rowCount: 1 };
        if (sql.includes('FROM buyer_margin_settings')) return { rows: [{ id: 'bm-1', commission_percent: '2.50' }], rowCount: 1 };
        if (sql.includes('FROM seller_margin_settings')) return { rows: mockSellers, rowCount: mockSellers.length };
        return { rows: [], rowCount: 0 };
      },
    };

    // All sellers fail
    const customForward = async ({ sellerApiRow }) => {
      attemptsMade.push(sellerApiRow.user_id);
      return { ok: false, status: 'FAILURE', message: 'Fail' };
    };

    let sentPayload = null;
    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ apiUrl: 'https://api.example.com', method: 'GET' }),
      decryptServiceConfig: () => ({
        stopRehitAfterEnabled: false,
        maxSellerRetryEnabled: true,
        maxSellerRetryCount: 1, // Only 1 fallback seller allowed after 1st fail!
        stopSameNumberAmountEnabled: false,
      }),
      fetchOperatorLookup: async () => null,
      sendJson: (_res, _code, payload) => { sentPayload = payload; },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: customForward,
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const mockUrl = new URL('http://localhost/webservices/api/recharge?username=buyer_test&token=tok&number=9876543210&amount=100&operator=JIO&ref_id=REF_TEST_2');

    await service.handleBuyerRecharge(mockReq, mockRes, mockUrl);

    // 1st seller (seller-1) + at most 1 fallback (seller-2) = exactly 2 attempts
    assert.deepEqual(attemptsMade, ['seller-1', 'seller-2']);
    assert.equal(attemptsMade.includes('seller-3'), false, 'seller-3 must not be attempted');
    assert.equal(attemptsMade.includes('seller-4'), false, 'seller-4 must not be attempted');
    assert.equal(sentPayload?.status, 'FAILURE');
  });

  await t.test('When maxSellerRetryCount is 0, no fallback sellers are attempted after 1st failure', async () => {
    const attemptsMade = [];

    const mockSellers = [
      { seller_margin_id: 'm1', user_id: 'seller-1', commission_percent: '4.00', seller_api_id: 'api-1', config_ciphertext: 'enc', is_active: true },
      { seller_margin_id: 'm2', user_id: 'seller-2', commission_percent: '3.50', seller_api_id: 'api-2', config_ciphertext: 'enc', is_active: true },
    ];

    const mockClient = {
      query: async () => ({ rows: [{ id: 'w1', balance_minor: 100000n, buyer_balance_minor: 100000n }], rowCount: 1 }),
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql) => {
        if (sql.includes('SELECT u.id, u.username')) return { rows: [{ id: 'buyer-user-1', username: 'buyer_test', status: 'active' }], rowCount: 1 };
        if (sql.includes('FROM admin_service_settings')) {
          return {
            rows: [{
              service_key: 'general',
              is_enabled: true,
              config_ciphertext: 'mock',
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM operator_definitions')) {
          return { rows: [{ id: 'op-jio', operator_name: 'Jio', operator_code: 'JIO', minimum_amount_minor: 1000n, maximum_amount_minor: 1000000n, stop_amounts_minor: [], operator_number_length: 10 }], rowCount: 1 };
        }
        if (sql.includes('FROM wallets')) return { rows: [{ id: 'w1', balance_minor: 100000n, buyer_balance_minor: 100000n }], rowCount: 1 };
        if (sql.includes('FROM buyer_margin_settings')) return { rows: [{ id: 'bm-1', commission_percent: '2.50' }], rowCount: 1 };
        if (sql.includes('FROM seller_margin_settings')) return { rows: mockSellers, rowCount: mockSellers.length };
        return { rows: [], rowCount: 0 };
      },
    };

    const customForward = async ({ sellerApiRow }) => {
      attemptsMade.push(sellerApiRow.user_id);
      return { ok: false, status: 'FAILURE', message: 'Fail' };
    };

    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ apiUrl: 'https://api.example.com', method: 'GET' }),
      decryptServiceConfig: () => ({
        stopRehitAfterEnabled: false,
        maxSellerRetryEnabled: true,
        maxSellerRetryCount: 0, // 0 fallback sellers allowed
        stopSameNumberAmountEnabled: false,
      }),
      fetchOperatorLookup: async () => null,
      sendJson: () => {},
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: customForward,
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const mockUrl = new URL('http://localhost/webservices/api/recharge?username=buyer_test&token=tok&number=9876543210&amount=100&operator=JIO&ref_id=REF_TEST_3');

    await service.handleBuyerRecharge(mockReq, mockRes, mockUrl);

    // Only 1st seller attempted
    assert.deepEqual(attemptsMade, ['seller-1']);
  });

  await t.test('Strictly skips any seller whose margin is lower than buyer asked margin', async () => {
    const attemptsMade = [];

    const mockSellers = [
      { seller_margin_id: 'm1', user_id: 'seller-1', commission_percent: '4.00', seller_api_id: 'api-1', config_ciphertext: 'enc', is_active: true },
      // seller-2 margin is 2.00%, which is LESS than buyer min 3.00%
      { seller_margin_id: 'm2', user_id: 'seller-below-min', commission_percent: '2.00', seller_api_id: 'api-2', config_ciphertext: 'enc', is_active: true },
      { seller_margin_id: 'm3', user_id: 'seller-3', commission_percent: '3.20', seller_api_id: 'api-3', config_ciphertext: 'enc', is_active: true },
    ];

    const mockClient = {
      query: async () => ({ rows: [{ id: 'w1', balance_minor: 100000n, buyer_balance_minor: 100000n }], rowCount: 1 }),
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql) => {
        if (sql.includes('SELECT u.id, u.username')) return { rows: [{ id: 'buyer-user-1', username: 'buyer_test', status: 'active' }], rowCount: 1 };
        if (sql.includes('FROM operator_definitions')) {
          return { rows: [{ id: 'op-jio', operator_name: 'Jio', operator_code: 'JIO', minimum_amount_minor: 1000n, maximum_amount_minor: 1000000n, stop_amounts_minor: [], operator_number_length: 10 }], rowCount: 1 };
        }
        if (sql.includes('FROM wallets')) return { rows: [{ id: 'w1', balance_minor: 100000n, buyer_balance_minor: 100000n }], rowCount: 1 };
        // Buyer asked margin = 3.00%
        if (sql.includes('FROM buyer_margin_settings')) return { rows: [{ id: 'bm-1', commission_percent: '3.00' }], rowCount: 1 };
        if (sql.includes('FROM seller_margin_settings')) return { rows: mockSellers, rowCount: mockSellers.length };
        return { rows: [], rowCount: 0 };
      },
    };

    const customForward = async ({ sellerApiRow }) => {
      attemptsMade.push(sellerApiRow.user_id);
      if (sellerApiRow.user_id === 'seller-3') {
        return { ok: true, status: 'SUCCESS', message: 'Success' };
      }
      return { ok: false, status: 'FAILURE', message: 'Fail' };
    };

    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ apiUrl: 'https://api.example.com', method: 'GET' }),
      decryptServiceConfig: () => ({
        stopRehitAfterEnabled: false,
        maxSellerRetryEnabled: true,
        maxSellerRetryCount: 3,
        stopSameNumberAmountEnabled: false,
      }),
      fetchOperatorLookup: async () => null,
      sendJson: () => {},
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: customForward,
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const mockUrl = new URL('http://localhost/webservices/api/recharge?username=buyer_test&token=tok&number=9876543210&amount=100&operator=JIO&ref_id=REF_TEST_4');

    await service.handleBuyerRecharge(mockReq, mockRes, mockUrl);

    // seller-below-min must be skipped completely because its margin is 2.00% < buyer min 3.00%
    assert.deepEqual(attemptsMade, ['seller-1', 'seller-3']);
  });
});
