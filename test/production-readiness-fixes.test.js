'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const createBuyerApiService = require('../lib/buyer-api-service');
const { fetchEzytmOperatorLookup } = require('../lib/plan-api-service');
const { sendWhatsappNotification, sendSmsNotification, sendEmailNotification } = require('../lib/notification-service');
const { createSupabaseDbPool } = require('../lib/supabase');
const { releaseExpiredLiens } = require('../lib/wallet-helper');

describe('Production Readiness & Security Hardening Fixes', () => {

  it('Buyer API: Rate limiter enforces limit and returns 429 on excessive recharge requests', async () => {
    let lastStatusCode = 0;
    let lastPayload = null;

    const mockDb = {
      query: async (sql) => {
        if (sql.includes('SELECT u.id, u.username')) {
          return { rows: [{ id: 'buyer-user-rate-test', username: 'ratebuyer', status: 'active' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => {},
      }),
    };

    const service = createBuyerApiService({
      db: mockDb,
      formatMinorUnits: () => '0.00',
      encryptMobile: (m) => Buffer.from(m),
      decryptMobile: (b) => b.toString(),
      decryptSellerApiConfig: () => ({}),
      decryptServiceConfig: () => ({}),
      sendJson: (_res, code, payload) => {
        lastStatusCode = code;
        lastPayload = payload;
      },
      httpError: (msg, status = 400) => Object.assign(new Error(msg), { statusCode: status }),
    });

    const mockReq = {
      method: 'GET',
      headers: {},
      socket: { remoteAddress: '198.51.100.22' },
    };

    // Send 120 requests (allowed)
    for (let i = 0; i < 120; i++) {
      const url = new URL(`http://localhost/webservices/api/recharge?api_token=tok123&number=9876543210&amount=100&operator=AIRTEL&ref_id=REF_${i}`);
      await service.handleBuyerRecharge(mockReq, {}, url);
      // It will fail on lack of wallet balance or operator, but not rate limited yet
      assert.notStrictEqual(lastStatusCode, 429, `Request ${i + 1} should not be rate limited`);
    }

    // 121st request must trigger HTTP 429 ERR_RATE_LIMITED
    const blockedUrl = new URL(`http://localhost/webservices/api/recharge?api_token=tok123&number=9876543210&amount=100&operator=AIRTEL&ref_id=REF_BLOCKED`);
    await service.handleBuyerRecharge(mockReq, {}, blockedUrl);

    assert.strictEqual(lastStatusCode, 429, 'Expected HTTP 429 Too Many Requests');
    assert.strictEqual(lastPayload.status, 'FAILURE');
    assert.strictEqual(lastPayload.errorcode, 'ERR_RATE_LIMITED');
  });

  it('SSRF Filter in Plan API blocks private IP addresses and metadata endpoints', async () => {
    const dangerousUrls = [
      'http://127.0.0.1:8080/api',
      'http://localhost:3000/api',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.1/private-plan',
      'http://192.168.1.1/router',
    ];

    for (const badUrl of dangerousUrls) {
      await assert.rejects(
        async () => {
          await fetchEzytmOperatorLookup({
            apiUrl: badUrl,
            mobile: '9876543210',
            apiUserId: 'test',
            apiPassword: 'pwd',
          });
        },
        (err) => {
          assert.ok(
            err.message.includes('SSRF') || err.message.toLowerCase().includes('forbidden') || err.message.toLowerCase().includes('private'),
            `Expected SSRF rejection for ${badUrl}, got: ${err.message}`
          );
          return true;
        }
      );
    }
  });

  it('SSRF Filter in Notification Service blocks private URLs in webhooks', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes("service_key = 'whatsapp'")) {
          return {
            rowCount: 1,
            rows: [{ is_enabled: true, config_ciphertext: Buffer.from('mock') }],
          };
        }
        if (sql.includes("service_key = 'sms'")) {
          return {
            rowCount: 1,
            rows: [{ is_enabled: true, config_ciphertext: Buffer.from('mock') }],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const waResult = await sendWhatsappNotification({
      db: mockDb,
      decryptServiceConfig: () => ({
        apiUrl: 'http://127.0.0.1:8080/send-wa?num=[RECIPIENT]&msg=[MESSAGE]',
      }),
      toNumber: '9876543210',
      message: 'Hello',
    });
    assert.strictEqual(waResult.sent, false);
    assert.ok(
      waResult.error.toLowerCase().includes('private') ||
      waResult.error.toLowerCase().includes('forbidden') ||
      waResult.error.toLowerCase().includes('ssrf')
    );

    const smsResult = await sendSmsNotification({
      db: mockDb,
      decryptServiceConfig: () => ({
        apiUrl: 'http://169.254.169.254/sms?to=[RECIPIENT]&msg=[MESSAGE]',
      }),
      toNumber: '9876543210',
      message: 'Hello',
    });
    assert.strictEqual(smsResult.sent, false);
    assert.ok(
      smsResult.error.toLowerCase().includes('private') ||
      smsResult.error.toLowerCase().includes('forbidden') ||
      smsResult.error.toLowerCase().includes('ssrf')
    );
  });

  it('Atomic Transaction in releaseExpiredLiens wraps execution with BEGIN/COMMIT', async () => {
    const executed = [];
    const mockClient = {
      query: async (sql, params) => {
        executed.push({ sql: sql.trim(), params });
        if (sql.includes('SELECT id, seller_user_id')) {
          return {
            rowCount: 1,
            rows: [{ id: 'lien-uuid-1', seller_user_id: 'seller-user-1', amount_minor: '5000' }],
          };
        }
        return { rowCount: 1, rows: [] };
      },
      release: () => { executed.push({ sql: 'RELEASE' }); },
    };

    const mockPool = {
      connect: async () => mockClient,
      query: mockClient.query,
    };

    await releaseExpiredLiens(mockPool);

    assert.ok(executed.some(e => e.sql === 'BEGIN'), 'Must start transaction with BEGIN');
    assert.ok(executed.some(e => e.sql.includes('UPDATE seller_wallet_liens')), 'Must update lien status');
    assert.ok(executed.some(e => e.sql.includes('UPDATE wallets')), 'Must update wallet balance');
    assert.ok(executed.some(e => e.sql === 'COMMIT'), 'Must commit transaction');
    assert.ok(executed.some(e => e.sql === 'RELEASE'), 'Must release client back to pool');
  });

  it('Default DB_POOL_MAX is upgraded to 25 for high concurrency', () => {
    const saved = process.env.DB_POOL_MAX;
    delete process.env.DB_POOL_MAX;
    try {
      const pool = createSupabaseDbPool();
      assert.strictEqual(pool.options.max, 25, 'Default pool max should be 25');
      pool.end();
    } finally {
      if (saved) process.env.DB_POOL_MAX = saved;
    }
  });

});
