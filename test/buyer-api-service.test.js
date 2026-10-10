'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const createBuyerApiService = require('../lib/buyer-api-service');

describe('Buyer API Service & Seller Routing Safety Tests', () => {
  const service = createBuyerApiService({
    db: { query: async () => ({ rows: [], rowCount: 0 }) },
    formatMinorUnits: () => '0.00',
    encryptMobile: (m) => Buffer.from(m),
    decryptMobile: (b) => b.toString(),
    decryptSellerApiConfig: () => {
      throw new Error('Decryption failed: bad key or corrupt ciphertext');
    },
    decryptServiceConfig: () => ({}),
    fetchOperatorLookup: async () => null,
    sendJson: () => {},
    httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
  });

  it('forwardRechargeToSeller strictly returns FAILURE when sellerApiRow is missing or unconfigured', async () => {
    const res = await service.forwardRechargeToSeller({
      sellerApiRow: null,
      rechargeData: { number: '9876543210', amount: '100.00', operatorCode: 'AIRTEL' },
    });

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.status, 'FAILURE');
    assert.strictEqual(res.rawStatus, 'ERR_NO_API_CONFIG');
    assert.match(res.message, /Seller API configuration is missing/i);
  });

  it('forwardRechargeToSeller strictly returns FAILURE when config decryption fails (never mock SUCCESS)', async () => {
    const res = await service.forwardRechargeToSeller({
      sellerApiRow: {
        id: 'api-123',
        name: 'Corrupt Stock API',
        config_ciphertext: Buffer.from('corrupt_bytes'),
      },
      rechargeData: { number: '9876543210', amount: '100.00', operatorCode: 'AIRTEL' },
    });

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.status, 'FAILURE');
    assert.strictEqual(res.rawStatus, 'ERR_DECRYPT_CONFIG');
    assert.match(res.message, /Failed to decrypt seller API configuration/i);
  });

  it('forwardRechargeToSeller strictly returns FAILURE when recharge endpoint URL is missing', async () => {
    const serviceWithEmptyUrl = createBuyerApiService({
      db: { query: async () => ({ rows: [], rowCount: 0 }) },
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ recharge: { url: '' } }), // Empty URL
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => null,
      sendJson: () => {},
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
    });

    const res = await serviceWithEmptyUrl.forwardRechargeToSeller({
      sellerApiRow: {
        id: 'api-456',
        name: 'Empty URL API',
        config_ciphertext: Buffer.from('valid_ciphertext'),
      },
      rechargeData: { number: '9876543210', amount: '100.00', operatorCode: 'AIRTEL' },
    });

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.status, 'FAILURE');
    assert.strictEqual(res.rawStatus, 'ERR_INVALID_API_URL');
    assert.match(res.message, /Seller recharge endpoint URL is missing or invalid/i);
  });

  it('dispatchBuyerCallback blocks unsafe private IPs via SSRF filter and returns failure', async () => {
    const res = await service.dispatchBuyerCallback({
      callbackUrl: 'http://127.0.0.1:8080/webhook',
      payload: { status: 'SUCCESS', ref_id: 'REF123' },
    });

    assert.strictEqual(res.ok, false);
    assert.match(res.message, /forbidden|private|loopback/i);
  });

  it('handleBuyerRecharge auto-refunds buyer wallet if unexpected failure occurs before supplier execution', async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'wallet-1', balance_minor: 50000n, buyer_balance_minor: 50000n }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'user-1', username: 'buyer1', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('FROM recharge_orders')) {
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
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'wallet-1', balance_minor: 50000n, buyer_balance_minor: 50000n }], rowCount: 1 };
        }
        if (sql.includes('FROM buyer_margin_settings')) {
          // Simulate an unexpected database error after debit has already committed
          throw new Error('Simulated DB disconnect during margin lookup');
        }
        return { rows: [], rowCount: 0 };
      },
    };

    let sentStatusCode = 0;
    let sentPayload = null;
    const testService = createBuyerApiService({
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
    const mockRes = {};
    const testUrl = new URL('http://localhost/webservices/api/recharge?api_token=tok123&number=9876543210&amount=100&operator=AIRTEL&ref_id=REF_ERR_ROLLBACK');

    await testService.handleBuyerRecharge(mockReq, mockRes, testUrl);

    assert.strictEqual(sentStatusCode, 500);
    assert.strictEqual(sentPayload.status, 'FAILURE');
    assert.match(sentPayload.message, /Simulated DB disconnect/i);

    // Verify wallet debit was executed
    const debitEntry = executedQueries.find((q) => q.sql.includes('INSERT INTO wallet_entries') && q.sql.includes("'debit'"));
    assert.ok(debitEntry, 'Wallet debit entry must have been executed');

    // Verify wallet refund was automatically triggered
    const refundEntry = executedQueries.find((q) => q.sql.includes('INSERT INTO wallet_entries') && q.sql.includes("'refund'"));
    assert.ok(refundEntry, 'Wallet refund entry must have been automatically executed on unexpected error');
  });

  it('handleBuyerRecharge saves emergency order record if supplier succeeded but finishClient commit fails', async () => {
    const executedQueries = [];
    let finishTransactionAttempted = false;
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'wallet-1', balance_minor: 50000n, buyer_balance_minor: 50000n }], rowCount: 1 };
        }
        if (sql.includes('UPDATE wallets SET buyer_balance_minor = buyer_balance_minor +') || sql.includes('UPDATE wallets SET balance_minor = balance_minor +')) {
          return { rows: [{ balance_minor: 50000n, buyer_balance_minor: 50000n }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO recharge_orders')) {
          return { rows: [{ id: 'order-123', created_at: new Date() }], rowCount: 1 };
        }
        if (sql.includes('UPDATE seller_margin_settings SET limit_used_minor')) {
          finishTransactionAttempted = true;
          throw new Error('Simulated commit failure after seller recharge success');
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'user-1', username: 'buyer1', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips')) {
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
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'wallet-1', balance_minor: 50000n, buyer_balance_minor: 50000n }], rowCount: 1 };
        }
        if (sql.includes('FROM buyer_margin_settings')) {
          return { rows: [{ id: 'bmargin-1', commission_percent: '2.50', with_gst: false }], rowCount: 1 };
        }
        if (sql.includes('FROM seller_margin_settings')) {
          return {
            rows: [{
              seller_margin_id: 'smargin-1',
              user_id: 'seller-user-1',
              commission_percent: '3.00',
              seller_api_id: 'sapi-1',
              seller_api_name: 'Mock API',
              config_ciphertext: Buffer.from('mock'),
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM recharge_orders')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('INSERT INTO recharge_orders') && sql.includes('ON CONFLICT (user_id, idempotency_key)')) {
          return { rows: [{ id: 'recovered-order-uuid', created_at: new Date() }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
    };

    let sentStatusCode = 0;
    let sentPayload = null;
    const testService = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({
        recharge: {
          url: 'http://mock-provider.com/recharge',
          success_codes: '0,SUCCESS',
          supplier_id_key: 'txnid',
        },
      }),
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => null,
      sendJson: (_res, code, payload) => {
        sentStatusCode = code;
        sentPayload = payload;
      },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: async () => ({
        ok: true,
        status: 'SUCCESS',
        supplierTxnId: 'SUPPLIER_TXN_999',
        operatorTxnId: 'OP_REF_888',
        latencyMs: 150,
        targetUrl: 'http://mock-provider.com/recharge',
        parsedData: { status: 'SUCCESS' },
        message: 'Success',
      }),
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const testUrl = new URL('http://localhost/webservices/api/recharge?api_token=tok123&number=9876543210&amount=100&operator=AIRTEL&ref_id=REF_EMERGENCY_RECOVER');

    await testService.handleBuyerRecharge(mockReq, mockRes, testUrl);

    assert.strictEqual(finishTransactionAttempted, true, 'finishClient transaction was attempted');
    assert.strictEqual(sentStatusCode, 200);
    assert.strictEqual(sentPayload.status, 'SUCCESS');
    assert.strictEqual(sentPayload.recharge_id, 'recovered-order-uuid');

    // Verify emergency fallback insert was executed with ON CONFLICT
    const emergencyInsert = executedQueries.find((q) => q.sql.includes('INSERT INTO recharge_orders') && q.sql.includes('ON CONFLICT (user_id, idempotency_key)'));
    assert.ok(emergencyInsert, 'Emergency fallback insert must be executed');

    // Crucially: refund must NOT be executed because supplier succeeded
    const refundEntry = executedQueries.find((q) => q.sql.includes('INSERT INTO wallet_entries') && q.params && q.params.includes('refund'));
    assert.strictEqual(refundEntry, undefined, 'Must NOT refund when supplier recharge has succeeded');
  });

  it('handleBuyerRecharge with PENDING status does NOT credit buyer margin or seller sales credit upfront', async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'wallet-1', balance_minor: 50000n, buyer_balance_minor: 50000n }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO recharge_orders')) {
          return { rows: [{ id: 'pending-order-uuid', created_at: new Date() }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'user-1', username: 'buyer1', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM admin_service_settings')) return { rows: [], rowCount: 0 };
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
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'wallet-1', balance_minor: 50000n, buyer_balance_minor: 50000n }], rowCount: 1 };
        }
        if (sql.includes('FROM buyer_margin_settings')) {
          return { rows: [{ id: 'bmargin-1', commission_percent: '2.50', with_gst: false }], rowCount: 1 };
        }
        if (sql.includes('FROM seller_margin_settings')) {
          return {
            rows: [{
              seller_margin_id: 'smargin-1',
              user_id: 'seller-user-1',
              commission_percent: '3.00',
              seller_api_id: 'sapi-1',
              seller_api_name: 'Mock API',
              config_ciphertext: Buffer.from('mock'),
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM recharge_orders')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 1 };
      },
    };

    let sentStatusCode = 0;
    let sentPayload = null;
    const testService = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ recharge: { url: 'http://mock.com' } }),
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => null,
      sendJson: (_res, code, payload) => {
        sentStatusCode = code;
        sentPayload = payload;
      },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: async () => ({
        ok: true,
        status: 'PENDING',
        supplierTxnId: 'PENDING_TXN_123',
        operatorTxnId: '',
        latencyMs: 120,
        targetUrl: 'http://mock.com',
        parsedData: { status: 'PENDING' },
        message: 'Pending',
      }),
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const testUrl = new URL('http://localhost/webservices/api/recharge?api_token=tok123&number=9876543210&amount=100&operator=AIRTEL&ref_id=REF_PENDING_TEST');

    await testService.handleBuyerRecharge(mockReq, mockRes, testUrl);

    assert.strictEqual(sentStatusCode, 200);
    assert.strictEqual(sentPayload.status, 'PENDING');
    assert.strictEqual(sentPayload.margin, '0.00', 'Margin must be 0.00 on pending order');
    assert.strictEqual(sentPayload.net_amount, '100.00', 'Full amount must be held on pending order');
    assert.strictEqual(sentPayload.closing_balance, '400.00', 'Closing balance must reflect full debit without unearned margin');

    // Verify buyer margin entry was NOT inserted
    const buyerMarginEntry = executedQueries.find(
      (q) => q.sql.includes('INSERT INTO wallet_entries') && q.params && q.params.includes('buyer_margin')
    );
    assert.strictEqual(buyerMarginEntry, undefined, 'Must NOT credit buyer margin on pending recharge');

    // Verify seller sales credit was NOT inserted
    const sellerCreditEntry = executedQueries.find(
      (q) => q.sql.includes('INSERT INTO wallet_entries') && q.params && q.params.includes('seller_sales_credit')
    );
    assert.strictEqual(sellerCreditEntry, undefined, 'Must NOT credit seller on pending recharge');
  });

  it('handleBuyerRecharge with SUCCESS status auto-provisions seller wallet and credits both buyer margin and seller sales credit', async () => {
    const executedQueries = [];
    let sellerWalletProvisioned = false;

    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('INSERT INTO wallets') && sql.includes('ON CONFLICT (user_id, currency) DO NOTHING')) {
          sellerWalletProvisioned = true;
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('FROM wallets') && sql.includes('FOR UPDATE')) {
          if (params && params.includes('seller-user-1')) {
            return { rows: [{ id: 'seller-wallet-1', balance_minor: 0n, seller_balance_minor: 0n }], rowCount: 1 };
          }
          return { rows: [{ id: 'wallet-1', balance_minor: 50000n, buyer_balance_minor: 50000n }], rowCount: 1 };
        }
        if (sql.includes('UPDATE wallets SET buyer_balance_minor = buyer_balance_minor +') || sql.includes('UPDATE wallets SET balance_minor = balance_minor +')) {
          return { rows: [{ balance_minor: 40250n, buyer_balance_minor: 40250n }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO recharge_orders')) {
          return { rows: [{ id: 'success-order-uuid', created_at: new Date() }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'user-1', username: 'buyer1', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM admin_service_settings')) return { rows: [], rowCount: 0 };
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
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'wallet-1', balance_minor: 50000n, buyer_balance_minor: 50000n }], rowCount: 1 };
        }
        if (sql.includes('FROM buyer_margin_settings')) {
          return { rows: [{ id: 'bmargin-1', commission_percent: '2.50', with_gst: false }], rowCount: 1 };
        }
        if (sql.includes('FROM seller_margin_settings')) {
          return {
            rows: [{
              seller_margin_id: 'smargin-1',
              user_id: 'seller-user-1',
              commission_percent: '3.00',
              seller_api_id: 'sapi-1',
              seller_api_name: 'Mock API',
              config_ciphertext: Buffer.from('mock'),
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM recharge_orders')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 1 };
      },
    };

    let sentStatusCode = 0;
    let sentPayload = null;
    const testService = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ recharge: { url: 'http://mock.com' } }),
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => null,
      sendJson: (_res, code, payload) => {
        sentStatusCode = code;
        sentPayload = payload;
      },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: async () => ({
        ok: true,
        status: 'SUCCESS',
        supplierTxnId: 'SUCCESS_TXN_777',
        operatorTxnId: 'OP_777',
        latencyMs: 120,
        targetUrl: 'http://mock.com',
        parsedData: { status: 'SUCCESS' },
        message: 'Success',
      }),
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const testUrl = new URL('http://localhost/webservices/api/recharge?api_token=tok123&number=9876543210&amount=100&operator=AIRTEL&ref_id=REF_SUCCESS_TEST');

    await testService.handleBuyerRecharge(mockReq, mockRes, testUrl);

    assert.strictEqual(sentStatusCode, 200);
    assert.strictEqual(sentPayload.status, 'SUCCESS');
    assert.strictEqual(sentPayload.margin, '2.50');
    assert.strictEqual(sentPayload.net_amount, '97.50');
    assert.strictEqual(sentPayload.closing_balance, '402.50');
    assert.strictEqual(sellerWalletProvisioned, true, 'Seller wallet must be auto-provisioned');

    // Verify buyer margin entry was inserted
    const buyerMarginEntry = executedQueries.find(
      (q) => q.sql.includes('INSERT INTO wallet_entries') && q.sql.includes("'buyer_margin'")
    );
    assert.ok(buyerMarginEntry, 'Buyer margin entry must be credited on success');

    // Verify seller sales credit entry was inserted
    const sellerCreditEntry = executedQueries.find(
      (q) => q.sql.includes('INSERT INTO wallet_entries') && q.sql.includes("'seller_sales_credit'")
    );
    assert.ok(sellerCreditEntry, 'Seller sales credit must be credited on success');
  });

  it('handleBuyerRecharge rolls back and throws error if seller wallet is missing on SUCCESS', async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM wallets') && sql.includes('FOR UPDATE')) {
          // Simulate seller wallet missing even after provisioning
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('UPDATE wallets SET buyer_balance_minor = buyer_balance_minor +') || sql.includes('UPDATE wallets SET balance_minor = balance_minor +')) {
          return { rows: [{ balance_minor: 40250n, buyer_balance_minor: 40250n }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO recharge_orders')) {
          return { rows: [{ id: 'emergency-order-uuid', created_at: new Date() }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };

    const mockDb = {
      connect: async () => mockClient,
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'user-1', username: 'buyer1', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM admin_service_settings')) return { rows: [], rowCount: 0 };
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
        if (sql.includes('FROM wallets')) {
          return { rows: [{ id: 'wallet-1', balance_minor: 50000n, buyer_balance_minor: 50000n }], rowCount: 1 };
        }
        if (sql.includes('FROM buyer_margin_settings')) {
          return { rows: [{ id: 'bmargin-1', commission_percent: '2.50', with_gst: false }], rowCount: 1 };
        }
        if (sql.includes('FROM seller_margin_settings')) {
          return {
            rows: [{
              seller_margin_id: 'smargin-1',
              user_id: 'seller-user-missing-wallet',
              commission_percent: '3.00',
              seller_api_id: 'sapi-1',
              seller_api_name: 'Mock API',
              config_ciphertext: Buffer.from('mock'),
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM recharge_orders')) return { rows: [], rowCount: 0 };
        if (sql.includes('INSERT INTO recharge_orders') && sql.includes('ON CONFLICT (user_id, idempotency_key)')) {
          return { rows: [{ id: 'emergency-order-uuid', created_at: new Date() }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
    };

    const testService = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({ recharge: { url: 'http://mock.com' } }),
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => null,
      sendJson: () => {},
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
      forwardRechargeToSeller: async () => ({
        ok: true,
        status: 'SUCCESS',
        supplierTxnId: 'SUCCESS_TXN_888',
        operatorTxnId: 'OP_888',
        latencyMs: 120,
        targetUrl: 'http://mock.com',
        parsedData: { status: 'SUCCESS' },
        message: 'Success',
      }),
    });

    const mockReq = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {};
    const testUrl = new URL('http://localhost/webservices/api/recharge?api_token=tok123&number=9876543210&amount=100&operator=AIRTEL&ref_id=REF_SELLER_WALLET_ERR');

    await testService.handleBuyerRecharge(mockReq, mockRes, testUrl);

    // Verify rollback was called in finishClient when seller wallet was missing
    const rollbackQuery = executedQueries.find((q) => q.sql === 'ROLLBACK');
    assert.ok(rollbackQuery, 'Transaction must rollback if seller wallet cannot be located or provisioned');
  });

  it('authenticateBuyer accepts whitelisted IPs having status approved or active', async () => {
    let queriedSql = '';
    const mockDb = {
      query: async (sql, params) => {
        queriedSql = sql;
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'user-ip-test', username: 'ipuser', status: 'active' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_whitelisted_ips')) {
          assert.match(sql, /status IN \('approved', 'active'\)/i);
          return { rows: [{ ip_address: '203.0.113.195' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const ipTestService = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({}),
      decryptServiceConfig: () => ({}),
      fetchOperatorLookup: async () => null,
      sendJson: () => {},
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
    });

    const validReq = {
      method: 'GET',
      headers: {},
      socket: { remoteAddress: '203.0.113.195' },
    };

    const user = await ipTestService.authenticateBuyer({ api_token: 'tok_valid' }, validReq);
    assert.strictEqual(user.username, 'ipuser');

    const blockedReq = {
      method: 'GET',
      headers: {},
      socket: { remoteAddress: '198.51.100.44' },
    };

    await assert.rejects(
      () => ipTestService.authenticateBuyer({ api_token: 'tok_valid' }, blockedReq),
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.errorcode, '107');
        return true;
      },
    );
  });
});

