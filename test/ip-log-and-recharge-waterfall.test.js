'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createUserIpLogPage = require('../pages/user-ip-log');
const createAdminRechargeReportPage = require('../pages/admin-recharge-report');
const createAdminUserLoginHistoryPage = require('../pages/admin-user-login-history');

test('User IP Log Page - Component Rendering & Elements', async (t) => {
  const mockDb = {
    query: async (sql, values) => {
      return {
        rowCount: 1,
        rows: [
          {
            id: 'd92a0123-1111-2222-3333-444455556666',
            user_id: 'u-123',
            username: 'demouser',
            name: 'Demo User',
            role: 'user',
            ip_address: '103.24.55.12',
            user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0',
            device_type: 'Desktop',
            device_name: 'Windows PC',
            os_name: 'Windows 11',
            browser_name: 'Google Chrome',
            browser_version: '122.0.0',
            location: 'Lucknow, Uttar Pradesh, India',
            status: 'success',
            session_token_hash: Buffer.from('tokenhash'),
            login_at: new Date().toISOString(),
            logout_at: null,
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            revoked_at: null,
          },
        ],
      };
    },
  };

  const { sendUserIpLogPage } = createUserIpLogPage({
    db: mockDb,
    sendJson: () => {},
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
  });

  let outputHtml = '';
  const mockResponse = {
    writeHead: () => {},
    end: (content) => {
      outputHtml = String(content);
    },
  };

  const mockUser = { id: 'u-123', username: 'demouser', name: 'Demo User', role: 'user' };
  const searchParams = new URLSearchParams('');

  await sendUserIpLogPage(mockUser, mockResponse, searchParams);

  // 1. Title and Header
  assert.ok(outputHtml.includes('Login &amp; IP Access Log') || outputHtml.includes('Login & IP Access Log'), 'Header includes Login & IP Access Log');
  assert.ok(outputHtml.includes('Total Logins'), 'Has Total Logins KPI card');
  assert.ok(outputHtml.includes('Active Sessions'), 'Has Active Sessions KPI card');

  // 2. Filter Form Inputs
  assert.ok(outputHtml.includes('name="fromDate"'), 'Has fromDate input');
  assert.ok(outputHtml.includes('name="toDate"'), 'Has toDate input');
  assert.ok(outputHtml.includes('name="ip"'), 'Has IP address input');
  assert.ok(outputHtml.includes('name="device"'), 'Has device type filter');
  assert.ok(outputHtml.includes('name="status"'), 'Has status filter');

  // 3. Table Columns & Row Values
  assert.ok(outputHtml.includes('103.24.55.12'), 'Displays IP address in table');
  assert.ok(outputHtml.includes('Lucknow, Uttar Pradesh, India'), 'Displays location');
  assert.ok(outputHtml.includes('Windows PC'), 'Displays device name');
  assert.ok(outputHtml.includes('Google Chrome'), 'Displays browser name');
  assert.ok(outputHtml.includes('Active Now'), 'Displays active session badge');
  assert.ok(outputHtml.includes('btn-inspect-log'), 'Has inspect detail modal button');
  assert.ok(outputHtml.includes('modalInspectLog'), 'Contains modal inspect log');
});

test('Admin User Login History - IP Search Filter Support', async (t) => {
  let capturedSql = '';
  let capturedValues = [];

  const mockDb = {
    query: async (sql, values) => {
      capturedSql = sql;
      capturedValues = values;
      return { rowCount: 0, rows: [] };
    },
  };

  const { sendAdminUserLoginHistoryPage } = createAdminUserLoginHistoryPage({
    db: mockDb,
    sendJson: () => {},
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
  });

  let outputHtml = '';
  const mockResponse = {
    writeHead: () => {},
    end: (content) => {
      outputHtml = String(content);
    },
  };

  const mockAdmin = { id: 'adm-1', username: 'admin', role: 'admin' };
  const searchParams = new URLSearchParams('ip=49.36.12.8');

  await sendAdminUserLoginHistoryPage(mockAdmin, mockResponse, searchParams);

  assert.ok(capturedSql.includes('l.ip_address ILIKE'), 'SQL query filters by ip_address');
  assert.ok(capturedValues.some(v => v.includes('49.36.12.8')), 'Passes IP address value to query');
  assert.ok(outputHtml.includes('name="ip"'), 'Form contains IP address input field');
});

test('Admin Recharge Report - Compact Layout & 5 Colored Action Buttons', async (t) => {
  const mockDb = {
    query: async (sql) => {
      if (sql.includes('operator_definitions')) {
        return { rowCount: 1, rows: [{ id: 'op-1', operator_name: 'Airtel', operator_code: 'AT', service_type: 'Prepaid' }] };
      }
      return {
        rowCount: 1,
        rows: [
          {
            id: '99998888-7777-6666-5555-444433332222',
            user_id: 'b-1',
            seller_user_id: 's-1',
            mobile_number: '9889433917',
            operator_name: 'Airtel',
            operator_code: 'AT',
            circle_name: 'Delhi NCR',
            amount_minor: '19900',
            status: 'successful',
            idempotency_key: 'TXN20261030161730LYSA4C',
            provider_reference: '7798134',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            buyer_username: 'testbuyer',
            buyer_name: 'Test Buyer',
            seller_username: 'testseller',
            seller_name: 'Test Seller',
            response_payload: { duration_ms: 1200 },
          },
        ],
      };
    },
  };

  const { sendAdminRechargeReportPage } = createAdminRechargeReportPage({
    db: mockDb,
    formatMinorUnits: (m) => (Number(m) / 100).toFixed(2),
    sendJson: () => {},
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
  });

  let outputHtml = '';
  const mockResponse = {
    writeHead: () => {},
    end: (content) => {
      outputHtml = String(content);
    },
  };

  const mockAdmin = { id: 'adm-1', username: 'admin', role: 'admin' };
  const searchParams = new URLSearchParams('');

  await sendAdminRechargeReportPage(mockAdmin, mockResponse, searchParams);

  // 1. Table Headers - compact columns fitting without horizontal scroll
  assert.ok(outputHtml.includes('Operator &amp; Circle') || outputHtml.includes('Operator & Circle'), 'Header has combined Operator & Circle');
  assert.ok(outputHtml.includes('Supplier / Ref ID'), 'Header has combined Supplier / Ref ID');

  // 2. 5 Distinct Action Icon Buttons
  assert.ok(outputHtml.includes('btn-action-icon btn-act-fail'), 'Has Fail action icon button');
  assert.ok(outputHtml.includes('btn-action-icon btn-act-dispute'), 'Has Dispute action icon button');
  assert.ok(outputHtml.includes('btn-action-icon btn-act-cb'), 'Has Callback action icon button');
  assert.ok(outputHtml.includes('btn-action-icon btn-act-log'), 'Has Log action icon button');
  assert.ok(outputHtml.includes('btn-action-icon btn-act-ope'), 'Has Ope ID action icon button');

  // 3. Button Tooltips on Hover
  assert.ok(outputHtml.includes('title="Mark as Fail &amp; Refund Buyer"'), 'Fail button has tooltip title');
  assert.ok(outputHtml.includes('title="Dispute Management / Fake Complaint"'), 'Dispute button has tooltip title');
  assert.ok(outputHtml.includes('title="Resend Webhook Callback to Buyer"'), 'Callback button has tooltip title');
  assert.ok(outputHtml.includes('title="View Complete Recharge Waterfall Log"'), 'Log button has tooltip title');
  assert.ok(outputHtml.includes('title="Update Operator Txn Ref ID"'), 'Ope ID button has tooltip title');

  // 4. Modal XL for Waterfall Log
  assert.ok(outputHtml.includes('modal-dialog modal-xl modal-dialog-centered'), 'Recharge Log modal uses modal-xl for comfortable waterfall reading');
});

test('Admin Recharge Report - Waterfall Log Handler Structure', async (t) => {
  const mockDb = {
    query: async (sql, values) => {
      if (sql.includes('FROM recharge_orders')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: '11112222-3333-4444-5555-666677778888',
              mobile_number: '9889433917',
              operator_name: 'Airtel',
              operator_code: 'AT',
              circle_name: 'Delhi',
              amount_minor: '19900',
              status: 'successful',
              idempotency_key: 'TXN20261030161730LYSA4C',
              provider_reference: '7798134',
              created_at: new Date('2026-10-30T16:17:45Z').toISOString(),
              updated_at: new Date('2026-10-30T16:17:50Z').toISOString(),
              buyer_username: 'buyer1',
              buyer_name: 'Buyer One',
              seller_username: 'seller1',
              seller_name: 'Seller One',
              response_payload: {
                inbound_request: {
                  url: '/webservices/api/recharge?number=9889433917&operator=AT&amount=199',
                  params: { number: '9889433917', operator: 'AT', amount: '199', ref_id: 'TXN20261030161730LYSA4C' },
                },
                routing_attempts: [
                  {
                    attempt: 1,
                    target_url: 'https://api.roboticexchange.in/Robotics/webservice/GetMobileRecharge',
                    status: 'FAILURE',
                    latency_ms: 4000,
                    raw_response: '{"ERROR":5,"STATUS":3,"MESSAGE":"Invalid Operator!"}',
                  },
                  {
                    attempt: 2,
                    target_url: 'http://amrecharge.com/API/TransactionAPI',
                    status: 'SUCCESS',
                    latency_ms: 1000,
                    raw_response: '{"status":1,"rpid":"7798134","msg":"Success"}',
                  },
                ],
              },
            },
          ],
        };
      }
      if (sql.includes('recharge_order_logs')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  const { handleGetLog } = createAdminRechargeReportPage({
    db: mockDb,
    formatMinorUnits: (m) => (Number(m) / 100).toFixed(2),
    sendJson: (res, code, data) => {
      res.statusCode = code;
      res.body = data;
    },
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
  });

  const mockResponse = {};
  const mockUrl = new URL('http://localhost/api/admin/recharge-report/log?orderId=11112222-3333-4444-5555-666677778888');

  await handleGetLog({}, mockResponse, mockUrl);

  assert.strictEqual(mockResponse.statusCode, 200);
  assert.ok(mockResponse.body.ok, 'Response is ok');
  assert.ok(Array.isArray(mockResponse.body.waterfall), 'Waterfall is an array');
  assert.strictEqual(mockResponse.body.waterfall.length, 3, 'Contains 3 waterfall hops (1 Inbound Request + 2 Supplier Requests)');

  // Hop 1: Request
  assert.strictEqual(mockResponse.body.waterfall[0].log_type, 'Request');
  assert.strictEqual(mockResponse.body.waterfall[0].client_id, 'TXN20261030161730LYSA4C');
  assert.ok(mockResponse.body.waterfall[0].request_data.includes('9889433917'), 'Request data includes mobile');

  // Hop 2: SupplierRequest Attempt 1
  assert.strictEqual(mockResponse.body.waterfall[1].log_type, 'SupplierRequest');
  assert.strictEqual(mockResponse.body.waterfall[1].url, 'https://api.roboticexchange.in/Robotics/webservice/GetMobileRecharge');

  // Hop 3: SupplierRequest Attempt 2 / Rehit
  assert.ok(mockResponse.body.waterfall[2].log_type.includes('Rehit'), 'Hop 3 is marked as Rehit');
  assert.strictEqual(mockResponse.body.waterfall[2].url, 'http://amrecharge.com/API/TransactionAPI');
});
