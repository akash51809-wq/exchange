'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createBuyerApiService = require('../lib/buyer-api-service');
const createUserSalesMarginPage = require('../pages/user-sales-margin');

test('Buyer & Seller Margin - Circle Routing and Seller API Selection Tests', async (t) => {
  const mockWalletRow = { id: 'w1', balance_minor: 100000n, buyer_balance_minor: 100000n, seller_balance_minor: 0n };

  await t.test('Buyer margin: rejects with errorcode 161 "invalid circle" when buyer configured specific circle and recharge circle differs', async () => {
    let sentStatusCode = 0;
    let sentPayload = null;

    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM wallets')) {
          return { rows: [mockWalletRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql, params) => {
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'buyer-u1', username: 'buyer_test', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM recharge_orders WHERE idempotency_key')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM recharge_orders WHERE (mobile_number')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM admin_service_settings')) {
          return { rows: [{ service_key: 'general', is_enabled: true, config_ciphertext: 'mock' }], rowCount: 1 };
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
          return { rows: [mockWalletRow], rowCount: 1 };
        }
        // Buyer margin query in Step 3 - returns 0 rows because circle 'UP East' doesn't match 'Delhi'
        if (sql.includes('FROM buyer_margin_settings') && sql.includes('LOWER(circle_name) = LOWER($3)')) {
          return { rows: [], rowCount: 0 };
        }
        // checkCircles query in Step 3 - buyer only configured 'Delhi'
        if (sql.includes('SELECT DISTINCT') && sql.includes('buyer_margin_settings')) {
          return { rows: [{ circle_name: 'delhi' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ apiUrl: 'https://api.example.com', method: 'GET' }),
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => ({
        ok: true,
        brand: 'ezytm plan API',
        operator: 'Jio',
        circle: 'UP East',
        operatorCode: 'JIO',
      }),
      sendJson: (_res, code, payload) => {
        sentStatusCode = code;
        sentPayload = payload;
      },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: async () => ({ ok: true, status: 'SUCCESS' }),
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const mockUrl = new URL('http://localhost/webservices/api/recharge?username=buyer_test&token=tok&number=9876543210&amount=100&operator=JIO&ref_id=REF_CIRCLE_TEST_1');

    await service.handleBuyerRecharge(mockReq, mockRes, mockUrl);

    assert.strictEqual(sentStatusCode, 400);
    assert.strictEqual(sentPayload?.status, 'FAILURE');
    assert.strictEqual(sentPayload?.errorcode, '161');
    assert.strictEqual(sentPayload?.message, 'invalid circle');
  });

  await t.test('Buyer margin: accepts recharge when buyer configured "All" circle', async () => {
    let sentStatusCode = 0;
    let sentPayload = null;
    let attemptedSeller = null;

    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM wallets')) {
          return { rows: [mockWalletRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql, params) => {
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'buyer-u1', username: 'buyer_test', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM recharge_orders WHERE idempotency_key')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM recharge_orders WHERE (mobile_number')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM admin_service_settings')) {
          return { rows: [{ service_key: 'general', is_enabled: true, config_ciphertext: 'mock' }], rowCount: 1 };
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
          return { rows: [mockWalletRow], rowCount: 1 };
        }
        // Buyer margin matches because circle is All
        if (sql.includes('FROM buyer_margin_settings')) {
          return {
            rows: [{
              id: 'bm-all',
              commission_percent: '2.00',
              circle_name: 'All',
              with_gst: false,
              limit_minor: null,
              limit_used_minor: 0n,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM seller_margin_settings')) {
          return {
            rows: [{
              seller_margin_id: 'sm-1',
              user_id: 'seller-u1',
              commission_percent: '3.00',
              seller_api_id: 'api-1',
              seller_api_name: 'AirtelSellerAPI',
              config_ciphertext: 'enc',
              is_active: true,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('INSERT INTO recharge_orders')) {
          return { rows: [{ id: 'order-123' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ apiUrl: 'https://api.example.com', method: 'GET' }),
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => ({
        ok: true,
        brand: 'ezytm plan API',
        operator: 'Jio',
        circle: 'UP East',
        operatorCode: 'JIO',
      }),
      sendJson: (_res, code, payload) => {
        sentStatusCode = code;
        sentPayload = payload;
      },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: async ({ sellerApiRow }) => {
        attemptedSeller = sellerApiRow?.user_id;
        return { ok: true, status: 'SUCCESS', supplierTxnId: 'TXN999', operatorTxnId: 'OP999' };
      },
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const mockUrl = new URL('http://localhost/webservices/api/recharge?username=buyer_test&token=tok&number=9876543210&amount=100&operator=JIO&ref_id=REF_CIRCLE_ALL_1');

    await service.handleBuyerRecharge(mockReq, mockRes, mockUrl);

    assert.strictEqual(sentStatusCode, 200);
    assert.strictEqual(sentPayload?.status, 'SUCCESS');
    assert.strictEqual(attemptedSeller, 'seller-u1');
  });

  await t.test('Seller margin page: loads seller APIs into API dropdown, shows API column in table and saves api_name', async () => {
    let insertedData = null;
    let updatedData = null;

    const mockDb = {
      query: async (sql, params) => {
        if (sql.includes('FROM seller_api_settings')) {
          return {
            rows: [
              { id: 'api-1', name: 'My Fast API', short_name: 'FA' },
              { id: 'api-2', name: 'Direct Airtel Gateway', short_name: 'DAG' },
            ],
            rowCount: 2,
          };
        }
        if (sql.includes('FROM operator_definitions')) {
          return {
            rows: [{ id: '11111111-1111-4111-8111-111111111111', operator_name: 'Airtel', service_type: 'Prepaid', operator_code: 'AIR' }],
            rowCount: 1,
          };
        }
        if (sql.includes('SELECT m.id, m.operator_id, m.api_name')) {
          return {
            rows: [{
              id: '22222222-2222-4222-8222-222222222222',
              operator_id: '11111111-1111-4111-8111-111111111111',
              api_name: 'My Fast API',
              operator_name: 'Airtel',
              service_type: 'Prepaid',
              admin_operator_code: 'AIR',
              circle_name: 'UP East',
              amount_type: 'all',
              amount_min_minor: 0n,
              amount_max_minor: 0n,
              commission_percent: '3.50',
              required_min_roffer_minor: 0n,
              limit_minor: 100000n,
              limit_used_minor: 0n,
              limit_type: 'daily',
              with_gst: false,
              is_active: true,
              is_admin_approved: true,
              is_roffer: 'all',
              operator_code: 'AIR',
              created_at: new Date().toISOString(),
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('INSERT INTO seller_margin_settings')) {
          insertedData = params;
          return { rows: [{ id: 'new-margin-id' }], rowCount: 1 };
        }
        if (sql.includes('UPDATE seller_margin_settings SET api_name=')) {
          updatedData = params;
          return { rows: [{ id: params[0] }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const userSalesMargin = createUserSalesMarginPage({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      getSession: async () => ({ id: 'seller-user-1', role: 'user' }),
      readJson: async () => ({
        apiName: 'My Fast API',
        operatorId: '11111111-1111-4111-8111-111111111111',
        circleName: 'UP East',
        amountType: 'all',
        commissionPercent: '3.50',
        limitType: 'daily',
        requiredMinRoffer: '0.00',
        limit: '0.00',
      }),
      checkSameOrigin: () => {},
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      sendJson: (_res, code, data) => {},
      allowRate: () => true,
    });

    let renderedHtml = '';
    const mockRes = {
      writeHead: () => {},
      end: (content) => { renderedHtml = content; },
    };

    await userSalesMargin.sendUserSalesMarginPage({ id: 'seller-user-1' }, mockRes, new URLSearchParams());

    // Check table has API header and shows API name
    assert.match(renderedHtml, /<th>API<\/th>/i);
    assert.match(renderedHtml, /My Fast API/);
    assert.match(renderedHtml, /<option value="Direct Airtel Gateway">Direct Airtel Gateway<\/option>/);
    assert.match(renderedHtml, /<option value="Exchange API">Exchange API<\/option>/);

    // Test createSellerMargin saves api_name
    await userSalesMargin.createSellerMargin({ headers: {} }, { writeHead: () => {}, end: () => {} });
    assert.strictEqual(insertedData[2], 'My Fast API'); // api_name is 3rd param ($3)

    // Test updateSellerMargin updates api_name
    await userSalesMargin.updateSellerMargin({ headers: {} }, { writeHead: () => {}, end: () => {} }, '22222222-2222-4222-8222-222222222222');
    assert.strictEqual(updatedData[2], 'My Fast API'); // api_name is 3rd param ($3)
  });

  await t.test('Seller candidate routing: circle and api_name matching logic', async () => {
    // Verify candidate sellers SQL handles LOWER(m.circle_name) = LOWER($2) OR LOWER(m.circle_name) = 'all'
    // and (m.api_name IS NULL OR m.api_name = '' OR m.api_name = 'Exchange API' OR s.name = m.api_name OR s.short_name = m.api_name)
    let capturedQuerySql = '';
    let capturedQueryParams = [];

    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM wallets')) {
          return { rows: [mockWalletRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql, params) => {
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'buyer-u1', username: 'buyer_test', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM recharge_orders WHERE idempotency_key')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM recharge_orders WHERE (mobile_number')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM admin_service_settings')) {
          return { rows: [{ service_key: 'general', is_enabled: true, config_ciphertext: 'mock' }], rowCount: 1 };
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
          return { rows: [mockWalletRow], rowCount: 1 };
        }
        if (sql.includes('FROM buyer_margin_settings')) {
          return {
            rows: [{
              id: 'bm-all',
              commission_percent: '2.00',
              circle_name: 'All',
              with_gst: false,
              limit_minor: null,
              limit_used_minor: 0n,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM seller_margin_settings')) {
          capturedQuerySql = sql;
          capturedQueryParams = params;
          return {
            rows: [{
              seller_margin_id: 'sm-1',
              user_id: 'seller-high',
              commission_percent: '4.00',
              seller_api_id: 'api-1',
              seller_api_name: 'My Fast API',
              config_ciphertext: 'enc',
              is_active: true,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('INSERT INTO recharge_orders')) {
          return { rows: [{ id: 'order-123' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ apiUrl: 'https://api.example.com', method: 'GET' }),
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => ({
        ok: true,
        brand: 'ezytm plan API',
        operator: 'Jio',
        circle: 'UP East',
        operatorCode: 'JIO',
      }),
      sendJson: () => {},
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: async () => ({ ok: true, status: 'SUCCESS' }),
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const mockUrl = new URL('http://localhost/webservices/api/recharge?username=buyer_test&token=tok&number=9876543210&amount=100&operator=JIO&ref_id=REF_ROUTING_TEST_1');

    await service.handleBuyerRecharge(mockReq, mockRes, mockUrl);

    // Verify candidate seller query filters by circle (exact circle or 'all')
    assert.match(capturedQuerySql, /LOWER\(m\.circle_name\) = LOWER\(\$2\) OR LOWER\(m\.circle_name\) = 'all'/i);
    // Verify candidate seller query joins on seller API match
    assert.match(capturedQuerySql, /s\.name = m\.api_name OR s\.short_name = m\.api_name/i);
    // Verify candidate seller query sorts by highest seller commission percent
    assert.match(capturedQuerySql, /ORDER BY CAST\(m\.commission_percent AS NUMERIC\) DESC/i);
    // Verify candidate seller query filters seller commission >= buyerAskedCommission
    assert.match(capturedQuerySql, /CAST\(m\.commission_percent AS NUMERIC\) >= \$5/i);
    // Verify parameter 2 is the detected circle 'UP East'
    assert.strictEqual(capturedQueryParams[1], 'UP East');
  });
});
