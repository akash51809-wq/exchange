'use strict';

const test = require('node:test');
const assert = require('node:assert');
const createBuyerApiService = require('../lib/buyer-api-service');
const createUserBuyerPurchaseTxnPage = require('../pages/user-buyer-purchase-txn');
const createUserSellerSalesTxnPage = require('../pages/user-seller-sales-txn');
const createAdminRechargeReportPage = require('../pages/admin-recharge-report');

test('Buyer & Seller Margin Distribution and Transaction Reports', async (t) => {
  await t.test('1. Buyer receives available margin (2.11%) when seller offers 2.21% and buyer min is 1.85%', async () => {
    let sentStatusCode = null;
    let sentPayload = null;
    let forwardedSellerUserId = null;
    let insertedOrderParams = null;
    let creditedSellerAmount = null;
    let creditedBuyerCommission = null;

    const mockDb = {
      connect: async () => ({
        query: async (sql, params) => {
          if (sql.includes('buyer_balance_minor') && sql.includes('UPDATE wallets')) {
            creditedBuyerCommission = params[0];
            return { rowCount: 1, rows: [{ id: 'wallet-1', balance_minor: '100000', buyer_balance_minor: '100000' }] };
          }
          if (sql.includes('seller_balance_minor') && sql.includes('UPDATE wallets')) {
            creditedSellerAmount = params[0];
            return { rowCount: 1, rows: [{ id: 'wallet-seller', balance_minor: '50000', seller_balance_minor: '50000' }] };
          }
          if (sql.includes('INSERT INTO recharge_orders')) {
            insertedOrderParams = params;
            return { rows: [{ id: 'order-test-22', created_at: new Date() }], rowCount: 1 };
          }
          return { rowCount: 1, rows: [{ id: 'wallet-1', balance_minor: '100000', buyer_balance_minor: '100000' }] };
        },
        release: () => {},
      }),
      query: async (sql, params) => {
        if (sql.includes('SELECT u.id, u.username') || sql.includes('FROM users')) {
          return {
            rows: [{ id: 'buyer-uuid', username: 'buyer_test', role: 'user', status: 'active', callback_url: null }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM user_whitelisted_ips')) return { rows: [], rowCount: 0 };
        if (sql.includes("FROM admin_service_settings WHERE service_key = 'margin_difference'")) {
          // Admin margin difference configured to 0.10%
          return {
            rows: [{
              is_enabled: true,
              config_ciphertext: 'mock_enc',
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM admin_service_settings')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM operator_definitions')) {
          return {
            rows: [{
              id: 'op-airtel-id',
              operator_name: 'Airtel',
              service_type: 'Mobile Recharge',
              operator_code: 'AIRTEL',
              minimum_amount_minor: 1000,
              maximum_amount_minor: 1000000,
              stop_amounts_minor: [],
              operator_number_length: 10,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'wallet-1', balance_minor: '100000', buyer_balance_minor: '100000' }], rowCount: 1 };
        }
        if (sql.includes('FROM recharge_orders WHERE user_id = $1 AND idempotency_key = $2')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('FROM buyer_margin_settings')) {
          // Buyer configured purchase margin 1.85%
          return {
            rows: [{
              id: 'bm-1',
              commission_percent: '1.8500',
              with_gst: false,
              limit_minor: '0',
              limit_used_minor: '0',
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM seller_margin_settings m') && sql.includes('INNER JOIN seller_api_settings s')) {
          // Seller offers 2.2100%
          return {
            rows: [{
              seller_margin_id: 'sm-airtel-1',
              user_id: 'seller-user-uuid',
              commission_percent: '2.2100',
              operator_id: 'op-airtel-id',
              circle_name: 'All',
              limit_minor: '500000',
              limit_used_minor: '0',
              with_gst: false,
              is_roffer: 'all',
              seller_api_id: 'api-rambhiya-id',
              seller_api_name: 'Rambhiya',
              config_ciphertext: 'enc_cfg',
              api_active: true,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('INSERT INTO recharge_orders')) {
          insertedOrderParams = params;
          return { rows: [{ id: 'order-test-22', created_at: new Date() }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: (minor) => (Number(minor) / 100).toFixed(2),
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({
        recharge: {
          url: 'https://gateway.example.com/recharge',
          requestType: 'GET',
          responseType: 'json',
          parameters: [{ key: 'number', value: '{NUMBER}' }],
        },
      }),
      decryptServiceConfig: () => ({ marginDifferencePercent: '0.10' }),
      fetchOperatorLookup: async () => ({
        ok: true,
        brand: 'ezytm plan API',
        operator: 'Airtel',
        circle: 'UP East',
        operatorCode: 'AIRTEL',
      }),
      sendJson: (_res, code, payload) => {
        sentStatusCode = code;
        sentPayload = payload;
      },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: async ({ sellerApiRow }) => {
        forwardedSellerUserId = sellerApiRow?.user_id;
        return { ok: true, status: 'SUCCESS', supplierTxnId: 'SUP_TXN_123', operatorTxnId: 'OPR_TXN_123' };
      },
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    // ₹22.00 recharge for mobile 7872476082
    const mockUrl = new URL('http://localhost/webservices/api/recharge?username=buyer_test&token=tok&number=7872476082&amount=22&operator=AIRTEL&ref_id=REF_TEST_22');

    await service.handleBuyerRecharge(mockReq, mockRes, mockUrl);

    assert.strictEqual(sentStatusCode, 200);
    assert.strictEqual(sentPayload?.status, 'SUCCESS');
    assert.strictEqual(forwardedSellerUserId, 'seller-user-uuid');

    // Available margin = 2.21% - 0.10% = 2.11%
    assert.strictEqual(sentPayload?.margin, '2.11');
    assert.strictEqual(sentPayload?.buyer_margin_percent, 2.11);
    assert.strictEqual(sentPayload?.seller_margin_percent, 2.21);

    // On ₹22.00 (2200 minor):
    // Buyer receives 2.11% commission = round(2200 * 0.0211) = 46 minor (₹0.46)
    assert.strictEqual(creditedBuyerCommission, 46n);

    // Seller receives recharge amount minus 2.21% margin:
    // Seller margin = round(2200 * 0.0221) = 49 minor (₹0.49)
    // Seller credit = 2200 - 49 = 2151 minor (₹21.51)
    assert.strictEqual(creditedSellerAmount, 2151n);

    // Verify stored order columns
    assert.ok(insertedOrderParams, 'Order was inserted');
    // buyer_margin_percent is passed as param 19, seller_margin_percent as param 20
    assert.strictEqual(insertedOrderParams[18], 2.11);
    assert.strictEqual(insertedOrderParams[19], 2.21);
  });

  await t.test('2. Buyer Purchase Txn page displays both % and ₹ amount in Margin column', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('FROM operator_definitions')) {
          return { rows: [{ id: 'op-1', operator_name: 'Airtel' }], rowCount: 1 };
        }
        if (sql.includes('FROM recharge_orders')) {
          return {
            rows: [{
              id: 'df629fbe-0140-4c63-bf90-5782e79bf437',
              user_id: 'buyer-1',
              seller_user_id: 'seller-1',
              mobile_number: '7872476082',
              operator_name: 'Airtel',
              circle_name: 'UP East',
              amount_minor: '2200',
              margin_minor: '46',
              cost_minor: '2154',
              buyer_margin_percent: '2.1100',
              status: 'successful',
              idempotency_key: 'REF_TEST_22',
              provider_reference: 'OPR_TXN_123',
              with_gst: false,
              created_at: new Date('2026-11-14T10:00:00Z'),
              operator_code: 'AIRTEL',
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    let renderedHtml = '';
    const mockResponse = {
      writeHead: () => {},
      end: (content) => { renderedHtml = content; },
    };

    const { sendUserBuyerPurchaseTxnPage } = createUserBuyerPurchaseTxnPage({
      db: mockDb,
      formatMinorUnits: (minor) => (Number(minor) / 100).toFixed(2),
      formatDateTime: () => '14-Nov-2026 10:00 AM',
      decryptMobile: (m) => m.toString(),
      getSession: async () => ({ id: 'buyer-1', username: 'test_buyer' }),
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
    });

    await sendUserBuyerPurchaseTxnPage({ id: 'buyer-1' }, mockResponse, new URLSearchParams());

    assert.ok(renderedHtml.includes('2.11%'), 'Contains percentage 2.11%');
    assert.ok(renderedHtml.includes('₹0.46'), 'Contains formatted margin amount ₹0.46');
    // Verify vertical layout (percentage on top, ₹ amount below)
    assert.match(renderedHtml, /<div class="font-weight-bold text-success"[^>]*>2\.11%<\/div>\s*<div class="text-muted"[^>]*>₹0\.46<\/div>/);
  });

  await t.test('3. Seller Sales Txn page displays both % and ₹ amount in Margin column', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('FROM operator_definitions')) {
          return { rows: [{ id: 'op-1', operator_name: 'Airtel' }], rowCount: 1 };
        }
        if (sql.includes('FROM recharge_orders')) {
          return {
            rows: [{
              id: 'df629fbe-0140-4c63-bf90-5782e79bf437',
              buyer_user_id: 'buyer-1',
              seller_user_id: 'seller-1',
              seller_api_id: 'api-1',
              mobile_number: '7872476082',
              operator_name: 'Airtel',
              circle_name: 'UP East',
              amount_minor: '2200',
              margin_minor: '46',
              cost_minor: '2154',
              seller_margin_minor: '49',
              seller_margin_percent: '2.2100',
              status: 'successful',
              idempotency_key: 'REF_TEST_22',
              provider_reference: 'OPR_TXN_123',
              with_gst: false,
              created_at: new Date('2026-11-14T10:00:00Z'),
              updated_at: new Date('2026-11-14T10:00:02Z'),
              operator_code: 'AIRTEL',
              buyer_username: 'test_buyer',
              buyer_name: 'Test Buyer',
              seller_api_name: 'Rambhiya',
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    let renderedHtml = '';
    const mockResponse = {
      writeHead: () => {},
      end: (content) => { renderedHtml = content; },
    };

    const { sendUserSellerSalesTxnPage } = createUserSellerSalesTxnPage({
      db: mockDb,
      formatMinorUnits: (minor) => (Number(minor) / 100).toFixed(2),
      formatDateTime: () => '14-Nov-2026 10:00 AM',
      formatDuration: () => '2s',
      decryptMobile: (m) => m.toString(),
      getSession: async () => ({ id: 'seller-1', username: 'test_seller' }),
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
    });

    await sendUserSellerSalesTxnPage({ id: 'seller-1' }, mockResponse, new URLSearchParams());

    assert.ok(renderedHtml.includes('2.21%'), 'Contains seller percentage 2.21%');
    assert.ok(renderedHtml.includes('₹0.49'), 'Contains formatted seller margin amount ₹0.49');
    // Verify vertical layout (percentage on top, ₹ amount below)
    assert.match(renderedHtml, /<div class="font-weight-bold text-success"[^>]*>2\.21%<\/div>\s*<div class="text-muted"[^>]*>₹0\.49<\/div>/);
  });

  await t.test('4. Buyer Purchase Txn displays actual request received time', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('FROM operator_definitions')) {
          return { rows: [{ id: 'op-1', operator_name: 'Airtel' }], rowCount: 1 };
        }
        if (sql.includes('FROM recharge_orders')) {
          return {
            rows: [{
              id: 'order-received-at-test',
              user_id: 'buyer-1',
              seller_user_id: 'seller-1',
              mobile_number: '7872476082',
              operator_name: 'Airtel',
              circle_name: 'UP East',
              amount_minor: '2200',
              margin_minor: '46',
              cost_minor: '2154',
              buyer_margin_percent: '2.1100',
              status: 'successful',
              idempotency_key: 'REF_TEST_REC',
              provider_reference: 'OPR_TXN_REC',
              with_gst: false,
              created_at: new Date('2026-11-14T10:05:00Z'),
              actual_received_at: new Date('2026-11-14T10:04:58Z'),
              operator_code: 'AIRTEL',
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    let renderedHtml = '';
    const mockResponse = {
      writeHead: () => {},
      end: (content) => { renderedHtml = content; },
    };

    const { sendUserBuyerPurchaseTxnPage } = createUserBuyerPurchaseTxnPage({
      db: mockDb,
      formatMinorUnits: (minor) => (Number(minor) / 100).toFixed(2),
      decryptMobile: (m) => m.toString(),
      getSession: async () => ({ id: 'buyer-1', username: 'test_buyer' }),
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
    });

    await sendUserBuyerPurchaseTxnPage({ id: 'buyer-1' }, mockResponse, new URLSearchParams());
    assert.ok(renderedHtml.includes('34:58'), 'Renders actual received timestamp (34:58) instead of created_at (35:00)');
    assert.ok(!renderedHtml.includes('35:00'), 'Does not render created_at timestamp');
  });

  await t.test('5. Waterfall routing skips seller when limit is exhausted (limit_used_minor >= limit_minor)', async () => {
    let routedSellerUserId = null;
    let sentStatusCode = null;
    let sentPayload = null;

    const mockDb = {
      connect: async () => ({
        query: async (sql, params) => {
          if (sql.includes('INSERT INTO recharge_orders')) {
            return { rows: [{ id: 'order-limit-test', created_at: new Date() }], rowCount: 1 };
          }
          return { rowCount: 1, rows: [{ id: 'wallet-1', balance_minor: '100000', buyer_balance_minor: '100000' }] };
        },
        release: () => {},
      }),
      query: async (sql, params) => {
        if (sql.includes('SELECT u.id, u.username') || sql.includes('FROM users')) {
          return { rows: [{ id: 'buyer-1', username: 'test_buyer', role: 'user', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM operator_definitions')) {
          return {
            rows: [{
              id: 'op-1',
              operator_name: 'Airtel',
              service_type: 'Mobile Recharge',
              operator_code: 'AIRTEL',
              minimum_amount_minor: 1000,
              maximum_amount_minor: 1000000,
              stop_amounts_minor: [],
              operator_number_length: 10,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'wallet-1', balance_minor: '100000', buyer_balance_minor: '100000' }], rowCount: 1 };
        }
        if (sql.includes('FROM buyer_margin_settings')) {
          return { rows: [{ id: 'bm-1', commission_percent: '1.8500', with_gst: false, limit_minor: '0', limit_used_minor: '0' }], rowCount: 1 };
        }
        if (sql.includes('FROM seller_margin_settings m') && sql.includes('INNER JOIN seller_api_settings s')) {
          return {
            rows: [
              {
                seller_margin_id: 'sm-exhausted',
                user_id: 'seller-exhausted',
                commission_percent: '2.5000',
                operator_id: 'op-1',
                circle_name: 'All',
                limit_minor: '50000',
                limit_used_minor: '50000',
                limit_type: 'daily',
                seller_api_id: 'api-ex',
                api_name: 'API Ex',
                api_mode: 'api',
                config_ciphertext: 'enc',
                with_gst: false,
              },
              {
                seller_margin_id: 'sm-available',
                user_id: 'seller-available',
                commission_percent: '2.2100',
                operator_id: 'op-1',
                circle_name: 'All',
                limit_minor: '50000',
                limit_used_minor: '10000',
                limit_type: 'daily',
                seller_api_id: 'api-av',
                api_name: 'API Av',
                api_mode: 'api',
                config_ciphertext: 'enc',
                with_gst: false,
              },
            ],
            rowCount: 2,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const service = createBuyerApiService({
      db: mockDb,
      forwardRechargeToSeller: async ({ sellerApiRow }) => {
        routedSellerUserId = sellerApiRow?.user_id;
        return { ok: true, status: 'SUCCESS', supplierTxnId: 'SUP_AV_123', operatorTxnId: 'OPR_AV_123' };
      },
      encryptMobile: (m) => `enc:${m}`,
      decryptMobile: (m) => m.replace('enc:', ''),
      decryptSellerApiConfig: () => ({
        recharge: {
          url: 'https://gateway.example.com/recharge',
          requestType: 'GET',
          responseType: 'json',
          parameters: [{ key: 'number', value: '{NUMBER}' }],
        },
      }),
      decryptServiceConfig: () => ({ marginDifferencePercent: '0.10' }),
      sendJson: (res, code, payload) => {
        sentStatusCode = code;
        sentPayload = payload;
      },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      formatMinorUnits: (minor) => (Number(minor) / 100).toFixed(2),
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const mockUrl = new URL('http://localhost/webservices/api/recharge?username=test_buyer&token=tok&number=7872476082&amount=22&operator=AIRTEL&ref_id=REF_LIMIT_CHECK_1');

    await service.handleBuyerRecharge(mockReq, mockRes, mockUrl);

    assert.strictEqual(sentStatusCode, 200);
    assert.strictEqual(routedSellerUserId, 'seller-available', 'Routed to seller with available limit, skipping exhausted seller');
  });

  await t.test('6. Seller Sales Txn displays Req Time, Resp Time, and calculated Used duration', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('FROM operator_definitions')) {
          return { rows: [{ id: 'op-1', operator_name: 'Airtel' }], rowCount: 1 };
        }
        if (sql.includes('FROM recharge_orders')) {
          return {
            rows: [{
              id: 'order-seller-dur-test',
              buyer_user_id: 'buyer-1',
              seller_user_id: 'seller-1',
              seller_api_id: 'api-1',
              mobile_number: '7872476082',
              operator_name: 'Airtel',
              circle_name: 'UP East',
              amount_minor: '2200',
              margin_minor: '46',
              cost_minor: '2154',
              seller_margin_minor: '49',
              seller_margin_percent: '2.2100',
              status: 'successful',
              idempotency_key: 'REF_TEST_DUR',
              provider_reference: 'OPR_TXN_DUR',
              with_gst: false,
              created_at: new Date('2026-11-14T10:00:00Z'),
              actual_received_at: new Date('2026-11-14T10:00:00.000Z'),
              actual_response_at: new Date('2026-11-14T10:00:01.850Z'),
              actual_duration_ms: 1850,
              operator_code: 'AIRTEL',
              buyer_username: 'test_buyer',
              buyer_name: 'Test Buyer',
              seller_api_name: 'Rambhiya',
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    let renderedHtml = '';
    const mockResponse = {
      writeHead: () => {},
      end: (content) => { renderedHtml = content; },
    };

    const { sendUserSellerSalesTxnPage } = createUserSellerSalesTxnPage({
      db: mockDb,
      formatMinorUnits: (minor) => (Number(minor) / 100).toFixed(2),
      formatDateTime: (iso) => new Date(iso).toISOString(),
      decryptMobile: (m) => m.toString(),
      getSession: async () => ({ id: 'seller-1', username: 'test_seller' }),
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
    });

    await sendUserSellerSalesTxnPage({ id: 'seller-1' }, mockResponse, new URLSearchParams());

    assert.ok(renderedHtml.includes('Actual Request Received Time'), 'Has Actual Request Received Time title');
    assert.ok(renderedHtml.includes('Actual Response Time'), 'Has Actual Response Time title');
    assert.ok(renderedHtml.includes('1.85s'), 'Has formatted duration in seconds');
  });

  await t.test('7. Admin Recharge Report displays Buyer received margin and Seller debited margin badges', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('FROM operator_definitions')) {
          return { rows: [{ id: 'op-1', operator_name: 'Airtel' }], rowCount: 1 };
        }
        if (sql.includes('SELECT r.id, r.user_id, r.seller_user_id') && sql.includes('FROM recharge_orders r')) {
          return {
            rows: [{
              id: 'd91a92e1-4567-4890-abcd-ef0123456789',
              user_id: 'buyer-uuid',
              seller_user_id: 'seller-uuid',
              mobile_number: '7872476082',
              operator_name: 'Airtel',
              operator_code: 'AIRTEL',
              circle_name: 'UP East',
              amount_minor: '2200',
              margin_minor: '46',
              cost_minor: '2154',
              seller_margin_minor: '49',
              buyer_margin_percent: '2.1100',
              seller_margin_percent: '2.2100',
              status: 'successful',
              idempotency_key: 'REF_ADMIN_REP',
              provider_reference: 'OPR_ADMIN_REP',
              response_payload: { duration_ms: 1850 },
              with_gst: false,
              created_at: new Date('2026-11-14T10:00:00Z'),
              updated_at: new Date('2026-11-14T10:00:02Z'),
              buyer_username: 'buyer_vip',
              buyer_name: 'VIP Buyer',
              seller_username: 'seller_star',
              seller_name: 'Star Seller',
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    let renderedHtml = '';
    const mockResponse = {
      writeHead: () => {},
      end: (content) => { renderedHtml = content; },
    };

    const { sendAdminRechargeReportPage } = createAdminRechargeReportPage({
      db: mockDb,
      formatMinorUnits: (minor) => (Number(minor) / 100).toFixed(2),
      decryptMobile: (m) => m.toString(),
      sendJson: () => {},
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
    });

    await sendAdminRechargeReportPage({ id: 'admin-1', role: 'admin' }, mockResponse, new URLSearchParams());

    assert.ok(renderedHtml.includes('Margin: 2.11% (₹0.46)'), 'Displays buyer received margin badge');
    assert.ok(renderedHtml.includes('Margin: 2.21% (₹0.49)'), 'Displays seller debited margin badge');
  });
});
