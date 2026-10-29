'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createUserBuyerPurchaseTxnPage = require('../pages/user-buyer-purchase-txn');
const createUserSellerSalesTxnPage = require('../pages/user-seller-sales-txn');

function formatMinorUnits(value) {
  const minor = BigInt(value || '0');
  return (minor / 100n).toString() + '.' + String(minor % 100n).padStart(2, '0');
}

function createMockResponse() {
  let statusCode = 200;
  let headers = {};
  let body = '';
  return {
    writeHead(code, h) {
      statusCode = code;
      headers = h;
    },
    end(data) {
      body = data;
    },
    getOutput() {
      return { statusCode, headers, body };
    }
  };
}

test('Seller Sales Txn Page - Date/Time 3 Lines, Full Txn ID with API Name, and Slim Summary Box', async () => {
  const mockDb = {
    async query(sql, params) {
      if (sql.includes('recharge_orders')) {
        return {
          rowCount: 2,
          rows: [
            {
              id: '12345678-1234-1234-1234-123456789abc',
              user_id: 'buyer-uuid',
              seller_user_id: 'seller-uuid',
              seller_api_id: 'api-uuid-1',
              mobile_number: '9876543210',
              operator_name: 'Airtel',
              circle_name: 'UP East',
              amount_minor: '29900',
              margin_minor: '598',
              seller_margin_minor: '897',
              status: 'successful',
              idempotency_key: 'DEMO_KEY_123',
              provider_reference: 'OPR883719',
              with_gst: true,
              created_at: '2026-10-29T10:00:00.000Z',
              updated_at: '2026-10-29T10:00:02.400Z',
              seller_api_name: 'Rambhiya API',
              seller_api_short_name: 'Rambhiya',
            },
            {
              id: '87654321-4321-4321-4321-cba987654321',
              user_id: 'buyer-uuid',
              seller_user_id: 'seller-uuid',
              seller_api_id: 'api-uuid-2',
              mobile_number: '9812345678',
              operator_name: 'Jio',
              circle_name: 'Delhi',
              amount_minor: '23900',
              margin_minor: '0',
              seller_margin_minor: '0',
              status: 'pending',
              idempotency_key: 'DEMO_KEY_PENDING',
              provider_reference: 'PEND123456',
              with_gst: false,
              created_at: '2026-10-29T10:15:00.000Z',
              updated_at: '2026-10-29T10:15:00.000Z',
              seller_api_name: 'Robotic Exchange',
              seller_api_short_name: 'Robotic Exchange',
            }
          ]
        };
      }
      if (sql.includes('operator_definitions')) {
        return { rows: [{ id: 'op1', operator_name: 'Airtel' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  const sellerPage = createUserSellerSalesTxnPage({
    db: mockDb,
    formatMinorUnits,
    decryptMobile: (b) => '9876543210'
  });

  const res = createMockResponse();
  await sellerPage.sendUserSellerSalesTxnPage({ id: 'seller-uuid' }, res, new URLSearchParams());
  const output = res.getOutput();

  assert.equal(output.statusCode, 200);

  // 1. Full Txn ID present (not truncated with ...)
  assert.ok(output.body.includes('12345678-1234-1234-1234-123456789abc'), 'Must contain full UUID Txn ID');
  assert.ok(!output.body.includes('12345678-1234...'), 'Must not truncate Txn ID');

  // 2. API Name present below Txn ID
  assert.ok(output.body.includes('Rambhiya API'), 'Must display seller API name');
  assert.ok(output.body.includes('Robotic Exchange'), 'Must display robotic exchange API name');

  // 3. Date & Time 3 lines: Request time, Response time, Total Used Time
  assert.ok(output.body.includes('Request Time'), 'Must have request time indicator/title');
  assert.ok(output.body.includes('Response Time'), 'Must have response time indicator/title');
  assert.ok(output.body.includes('Total Used Time'), 'Must have total used time indicator/title');
  assert.ok(output.body.includes('2.4s'), 'Must calculate and display duration (2.4s)');
  assert.ok(output.body.includes('Running...'), 'Must display Running... for pending transactions');

  // 4. Slim/compact summary bar styling
  assert.ok(output.body.includes('.txn-kpi-card {'), 'Must have KPI card CSS');
  assert.ok(output.body.includes('padding: 4px 10px;'), 'Summary KPI card must have compact vertical padding');
});

test('Buyer Purchase Txn Page - Full Txn ID and Slim Summary Box', async () => {
  const mockDb = {
    async query(sql, params) {
      if (sql.includes('recharge_orders')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'abcdef12-3456-7890-abcd-ef1234567890',
              user_id: 'buyer-uuid',
              seller_user_id: 'seller-uuid',
              mobile_number: '9876543210',
              operator_name: 'Airtel',
              circle_name: 'UP East',
              amount_minor: '29900',
              margin_minor: '598',
              status: 'successful',
              idempotency_key: 'BUYER_KEY_1',
              provider_reference: 'OPR999',
              with_gst: true,
              created_at: '2026-10-29T10:00:00.000Z',
            }
          ]
        };
      }
      if (sql.includes('operator_definitions')) {
        return { rows: [{ id: 'op1', operator_name: 'Airtel' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  const buyerPage = createUserBuyerPurchaseTxnPage({
    db: mockDb,
    formatMinorUnits,
    decryptMobile: (b) => '9876543210'
  });

  const res = createMockResponse();
  await buyerPage.sendUserBuyerPurchaseTxnPage({ id: 'buyer-uuid' }, res, new URLSearchParams());
  const output = res.getOutput();

  assert.equal(output.statusCode, 200);

  // 1. Full Txn ID present (not truncated with ...)
  assert.ok(output.body.includes('abcdef12-3456-7890-abcd-ef1234567890'), 'Must contain full UUID Txn ID');
  assert.ok(!output.body.includes('abcdef12-3456...'), 'Must not truncate Txn ID');

  // 2. Slim/compact summary bar styling
  assert.ok(output.body.includes('padding: 4px 10px;'), 'Summary KPI card must have compact vertical padding');
});
