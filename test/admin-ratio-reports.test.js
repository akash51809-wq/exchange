'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ADMIN_PANEL_MENU } = require('../config/admin-panel-menu');
const createAdminSellerRefundRatioReportPage = require('../pages/admin-seller-refund-ratio-report');
const createAdminFakeComplaintRatioReportPage = require('../pages/admin-fake-complaint-ratio-report');

test('Admin Navigation Menu - Reports Configuration', async (t) => {
  await t.test('reports submenu contains Seller Refund Ratio and Fake Complaint Ratio', () => {
    const reportsMenu = ADMIN_PANEL_MENU.find((m) => m.label === 'Reports');
    assert.ok(reportsMenu, 'Reports menu item must exist');
    assert.ok(Array.isArray(reportsMenu.items), 'Reports menu must have submenu items');

    const sellerRefundItem = reportsMenu.items.find((i) => i.path === '/admin/reports/seller-refund-ratio');
    assert.ok(sellerRefundItem, 'Seller Refund Ratio report item must be present');
    assert.equal(sellerRefundItem.label, 'Seller Refund Ratio');

    const fakeComplaintItem = reportsMenu.items.find((i) => i.path === '/admin/reports/fake-complaint-ratio');
    assert.ok(fakeComplaintItem, 'Fake Complaint Ratio report item must be present');
    assert.equal(fakeComplaintItem.label, 'Fake Complaint Ratio');
  });
});

test('Seller & Operator Refund Ratio Report Tests', async (t) => {
  const sellerId = '11111111-1111-4111-8111-111111111111';
  const operatorId = '22222222-2222-4222-8222-222222222222';

  const mockDb = {
    query: async (sql, values) => {
      // Sellers list query
      if (sql.includes('FROM users u') && sql.includes('seller_api_settings')) {
        return {
          rows: [{ id: sellerId, username: 'fastseller', name: 'Fast Seller Pvt Ltd' }],
          rowCount: 1,
        };
      }
      // Operators list query
      if (sql.includes('FROM operator_definitions')) {
        return {
          rows: [{ id: operatorId, operator_name: 'Jio Prepaid', operator_code: 'JIO', service_type: 'Prepaid' }],
          rowCount: 1,
        };
      }
      // Aggregation query
      if (sql.includes('FROM recharge_orders r') && sql.includes('r.seller_user_id IS NOT NULL')) {
        return {
          rows: [
            {
              seller_user_id: sellerId,
              seller_name: 'Fast Seller Pvt Ltd',
              seller_username: 'fastseller',
              operator_id: operatorId,
              operator_name: 'Jio Prepaid',
              operator_code: 'JIO',
              total_orders: 100,
              total_amount_minor: 5000000n, // ₹50,000.00
              success_orders: 85,
              success_amount_minor: 4250000n, // ₹42,500.00
              refund_orders: 15,
              refund_amount_minor: 750000n, // ₹7,500.00
              pending_orders: 0,
              pending_amount_minor: 0n,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const { sendAdminSellerRefundRatioReportPage } = createAdminSellerRefundRatioReportPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    sendJson: () => {},
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
  });

  await t.test('renders HTML page with filter options and calculated refund ratio', async () => {
    let capturedHtml = '';
    let capturedHeaders = {};
    const mockResponse = {
      writeHead: (status, headers) => { capturedHeaders = headers; },
      end: (content) => { capturedHtml = content; },
    };

    const admin = { id: 'admin-uuid', role: 'admin', username: 'admin' };
    const searchParams = new URLSearchParams({
      sellerId,
      operatorId,
      from: '2026-10-01',
      to: '2026-10-27',
    });

    await sendAdminSellerRefundRatioReportPage(admin, mockResponse, searchParams);

    assert.ok(capturedHtml.includes('Seller &amp; Operator Refund Ratio Report'), 'Must contain page title');
    assert.ok(capturedHtml.includes('Fast Seller Pvt Ltd'), 'Must display seller name');
    assert.ok(capturedHtml.includes('Jio Prepaid'), 'Must display operator name');
    assert.ok(capturedHtml.includes('15.00%'), 'Must compute 15.00% refund count ratio');
    assert.ok(capturedHtml.includes('Download Excel'), 'Must contain Download Excel button');
    assert.ok(capturedHtml.includes('sellerId'), 'Must contain seller filter dropdown');
    assert.ok(capturedHtml.includes('operatorId'), 'Must contain operator filter dropdown');
  });

  await t.test('streams CSV file on download=csv with UTF-8 BOM and correct columns', async () => {
    let capturedData = '';
    let capturedHeaders = {};
    let capturedStatus = 0;
    const mockResponse = {
      writeHead: (status, headers) => {
        capturedStatus = status;
        capturedHeaders = headers;
      },
      end: (content) => { capturedData = content; },
    };

    const admin = { id: 'admin-uuid', role: 'admin', username: 'admin' };
    const searchParams = new URLSearchParams({
      download: 'csv',
    });

    await sendAdminSellerRefundRatioReportPage(admin, mockResponse, searchParams);

    assert.equal(capturedStatus, 200);
    assert.equal(capturedHeaders['content-type'], 'text/csv; charset=utf-8');
    assert.ok(capturedHeaders['content-disposition'].includes('attachment; filename="seller-operator-refund-ratio-'), 'Must specify attachment filename');
    assert.ok(capturedData.startsWith('\uFEFF'), 'Must include UTF-8 BOM for Microsoft Excel compatibility');
    assert.ok(capturedData.includes('Seller Name,Seller Username,Operator Name'), 'Must contain CSV header');
    assert.ok(capturedData.includes('Fast Seller Pvt Ltd'), 'Must include seller row in CSV');
    assert.ok(capturedData.includes('15.00%'), 'Must include calculated 15.00% ratio in CSV');
  });
});

test('Buyer & Operator Fake Complaint Ratio Report Tests', async (t) => {
  const buyerId = '33333333-3333-4333-8333-333333333333';
  const operatorId = '44444444-4444-4444-8444-444444444444';

  const mockDb = {
    query: async (sql, values) => {
      // Buyers list query
      if (sql.includes('FROM users u') && sql.includes('recharge_orders r')) {
        return {
          rows: [{ id: buyerId, username: 'riskybuyer', name: 'Buyer John' }],
          rowCount: 1,
        };
      }
      // Operators list query
      if (sql.includes('FROM operator_definitions')) {
        return {
          rows: [{ id: operatorId, operator_name: 'Airtel Prepaid', operator_code: 'AIRTEL', service_type: 'Prepaid' }],
          rowCount: 1,
        };
      }
      // Aggregation query
      if (sql.includes('FROM recharge_orders r') && sql.includes('r.user_id IS NOT NULL')) {
        return {
          rows: [
            {
              buyer_user_id: buyerId,
              buyer_name: 'Buyer John',
              buyer_username: 'riskybuyer',
              operator_id: operatorId,
              operator_name: 'Airtel Prepaid',
              operator_code: 'AIRTEL',
              total_orders: 50,
              total_amount_minor: 2500000n, // ₹25,000.00
              success_orders: 48,
              success_amount_minor: 2400000n, // ₹24,000.00
              total_complaints: 10,
              total_complaint_amount_minor: 500000n, // ₹5,000.00
              fake_complaints: 7, // 7 disputes rejected = Fake complaints
              fake_complaint_amount_minor: 350000n, // ₹3,500.00
              accepted_complaints: 2, // 2 genuine disputes accepted
              accepted_complaint_amount_minor: 100000n,
              pending_complaints: 1,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const { sendAdminFakeComplaintRatioReportPage } = createAdminFakeComplaintRatioReportPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    sendJson: () => {},
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
  });

  await t.test('renders HTML page with filter options and calculated fake complaint ratios', async () => {
    let capturedHtml = '';
    let capturedHeaders = {};
    const mockResponse = {
      writeHead: (status, headers) => { capturedHeaders = headers; },
      end: (content) => { capturedHtml = content; },
    };

    const admin = { id: 'admin-uuid', role: 'admin', username: 'admin' };
    const searchParams = new URLSearchParams({
      buyerId,
      operatorId,
      from: '2026-10-01',
      to: '2026-10-27',
    });

    await sendAdminFakeComplaintRatioReportPage(admin, mockResponse, searchParams);

    assert.ok(capturedHtml.includes('Buyer &amp; Operator Fake Complaint Ratio Report'), 'Must contain page title');
    assert.ok(capturedHtml.includes('Buyer John'), 'Must display buyer name');
    assert.ok(capturedHtml.includes('Airtel Prepaid'), 'Must display operator name');
    // 7 out of 10 complaints are fake = 70.00%
    assert.ok(capturedHtml.includes('70.00%'), 'Must compute 70.00% fake complaint ratio');
    // 7 fake complaints out of 48 success orders = 14.58%
    assert.ok(capturedHtml.includes('14.58%'), 'Must compute 14.58% fake on success ratio');
    assert.ok(capturedHtml.includes('Download Excel'), 'Must contain Download Excel button');
    assert.ok(capturedHtml.includes('buyerId'), 'Must contain buyer filter dropdown');
    assert.ok(capturedHtml.includes('operatorId'), 'Must contain operator filter dropdown');
  });

  await t.test('streams CSV file on download=excel with UTF-8 BOM and correct columns', async () => {
    let capturedData = '';
    let capturedHeaders = {};
    let capturedStatus = 0;
    const mockResponse = {
      writeHead: (status, headers) => {
        capturedStatus = status;
        capturedHeaders = headers;
      },
      end: (content) => { capturedData = content; },
    };

    const admin = { id: 'admin-uuid', role: 'admin', username: 'admin' };
    const searchParams = new URLSearchParams({
      download: 'excel',
    });

    await sendAdminFakeComplaintRatioReportPage(admin, mockResponse, searchParams);

    assert.equal(capturedStatus, 200);
    assert.equal(capturedHeaders['content-type'], 'text/csv; charset=utf-8');
    assert.ok(capturedHeaders['content-disposition'].includes('attachment; filename="buyer-fake-complaint-ratio-'), 'Must specify attachment filename');
    assert.ok(capturedData.startsWith('\uFEFF'), 'Must include UTF-8 BOM for Microsoft Excel compatibility');
    assert.ok(capturedData.includes('Buyer Name,Buyer Username,Operator Name'), 'Must contain CSV header');
    assert.ok(capturedData.includes('Buyer John'), 'Must include buyer row in CSV');
    assert.ok(capturedData.includes('70.00%'), 'Must include calculated 70.00% fake dispute ratio in CSV');
  });
});
