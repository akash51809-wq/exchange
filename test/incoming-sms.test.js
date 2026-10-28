'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseIncomingBankSms,
  processIncomingSms,
  autoMatchPendingFundRequestOnSubmission,
  getIncomingSmsConfig,
} = require('../lib/incoming-sms-service');

const { ADMIN_PANEL_MENU, renderAdminNavigation } = require('../config/admin-panel-menu');
const createAdminIncomingSmsPage = require('../pages/admin-incoming-sms');
const createAdminServiceSettingsPage = require('../pages/admin-service-settings');

test('Admin Navigation Menu - Incoming SMS Log in Reports Submenu', () => {
  const reportsMenu = ADMIN_PANEL_MENU.find(m => m.label === 'Reports');
  assert.ok(reportsMenu, 'Reports menu must exist');

  const incomingItem = reportsMenu.items.find(i => i.path === '/admin/reports/incoming-sms');
  assert.ok(incomingItem, 'Incoming SMS Log must be present in Reports menu');
  assert.equal(incomingItem.label, 'Incoming SMS Log');

  const navHtml = renderAdminNavigation('/admin/reports/incoming-sms');
  assert.ok(navHtml.includes('/admin/reports/incoming-sms'));
  assert.ok(navHtml.includes('Incoming SMS Log'));
});

test('SMS Parser - Bank Credit SMS Parsing across Indian Banks', () => {
  // 1. SBI Sample
  const sbiSms = 'Dear SBI User, your A/C ending 1234 has been credited by Rs. 2,000.00 on 28-10-26 by UPI ref no 430291827364.';
  const sbi = parseIncomingBankSms(sbiSms);
  assert.equal(sbi.isCredit, true);
  assert.equal(sbi.amountStr, '2,000.00');
  assert.equal(sbi.amountMinor, 200000n);
  assert.equal(sbi.utr, '430291827364');
  assert.equal(sbi.bank, 'SBI');

  // 2. HDFC Sample
  const hdfcSms = 'Dear Customer, INR 5,000.00 deposited to A/C **5678 on 28-OCT-26 by UPI. UPI Ref 430291827365';
  const hdfc = parseIncomingBankSms(hdfcSms, 'AX-HDFCBK');
  assert.equal(hdfc.isCredit, true);
  assert.equal(hdfc.amountStr, '5,000.00');
  assert.equal(hdfc.amountMinor, 500000n);
  assert.equal(hdfc.utr, '430291827365');
  assert.equal(hdfc.bank, 'HDFC');

  // 3. ICICI Sample
  const iciciSms = 'Your a/c no. XX9876 is credited with Rs 1,500.00 on 28-OCT-26. UPI:430291827367-Transfer';
  const icici = parseIncomingBankSms(iciciSms, 'BP-ICICIB');
  assert.equal(icici.isCredit, true);
  assert.equal(icici.amountStr, '1,500.00');
  assert.equal(icici.amountMinor, 150000n);
  assert.equal(icici.utr, '430291827367');
  assert.equal(icici.bank, 'ICICI');

  // 4. Axis Sample with slash format
  const axisSms = 'Axis Bank: Account 93849335819868 has been credited with INR 3,000.00 on 28-10-2026 by UPI/430291827368/Transfer.';
  const axis = parseIncomingBankSms(axisSms);
  assert.equal(axis.isCredit, true);
  assert.equal(axis.amountStr, '3,000.00');
  assert.equal(axis.amountMinor, 300000n);
  assert.equal(axis.utr, '430291827368');
  assert.equal(axis.bank, 'AXIS');

  // 5. Debit rejection
  const debitSms = 'A/C 1234 debited by Rs. 200 on 28-Oct-26';
  const debit = parseIncomingBankSms(debitSms);
  assert.equal(debit.isCredit, false);
});

test('Incoming SMS Processing - Auto-Approves Matching Pending Fund Request', async () => {
  const pendingRequests = [
    {
      id: 'fund-req-123',
      user_id: 'user-goyalpay',
      amount_minor: '200000',
      status: 'pending',
      transaction_id_ciphertext: Buffer.from('430291827364'),
      username: '9839680707',
      name: 'GOYALPAY',
      email: 'goyalpay@gmail.com',
      phone_ciphertext: Buffer.from('9839680707'),
    },
  ];

  const dbCalls = [];
  const mockDb = {
    query: async (sql, params) => {
      dbCalls.push({ sql, params });
      if (sql.includes("FROM admin_service_settings WHERE service_key = 'incoming_sms'")) {
        return { rowCount: 1, rows: [{ is_enabled: true, config_ciphertext: Buffer.from(JSON.stringify({ autoUpdatePayment: true })) }] };
      }
      if (sql.includes('SELECT r.id, r.user_id, r.amount_minor') && sql.includes('r.transaction_id_hash = $1')) {
        return { rowCount: 1, rows: pendingRequests };
      }
      if (sql.includes('INSERT INTO incoming_sms_logs')) {
        return { rowCount: 1, rows: [{ id: 'sms-log-1' }] };
      }
      return { rowCount: 0, rows: [] };
    },
    connect: async () => {
      return {
        query: async (sql) => {
          if (sql.includes('SELECT id FROM wallets')) {
            return { rowCount: 1, rows: [{ id: 'wallet-1' }] };
          }
          if (sql.includes('FROM website_settings')) {
            return { rowCount: 0, rows: [] };
          }
          return { rowCount: 1, rows: [] };
        },
        release: () => {},
      };
    },
  };

  const decryptServiceConfig = (buf) => JSON.parse(buf.toString('utf8'));
  const fundFieldHash = (f, val) => `hash-${val}`;
  const decryptFundField = (buf) => buf.toString('utf8');
  const formatMinorUnits = (minor) => (Number(minor) / 100).toFixed(2);

  const rawMessage = 'Dear SBI User, your A/C ending 1234 has been credited by Rs. 2,000.00 on 28-10-26 by UPI ref no 430291827364.';
  const result = await processIncomingSms({
    db: mockDb,
    decryptServiceConfig,
    fundFieldHash,
    decryptFundField,
    formatMinorUnits,
    sender: 'VM-SBIINB',
    rawMessage,
    simSlot: '0',
    rawPayload: { message: rawMessage },
  });

  assert.equal(result.ok, true);
  assert.equal(result.isCredit, true);
  assert.equal(result.amountMinor, '200000');
  assert.equal(result.utr, '430291827364');
  assert.equal(result.matchStatus, 'auto_approved');
  assert.equal(result.matchedUser.username, '9839680707');
});

test('Incoming SMS Processing - Marks as Unmatched when No Pending Request Exists', async () => {
  const mockDb = {
    query: async (sql) => {
      if (sql.includes("FROM admin_service_settings WHERE service_key = 'incoming_sms'")) {
        return { rowCount: 1, rows: [{ is_enabled: true, config_ciphertext: Buffer.from(JSON.stringify({ autoUpdatePayment: true })) }] };
      }
      if (sql.includes('SELECT r.id, r.user_id, r.amount_minor')) {
        return { rowCount: 0, rows: [] }; // No matching request
      }
      if (sql.includes('INSERT INTO incoming_sms_logs')) {
        return { rowCount: 1, rows: [{ id: 'sms-log-2' }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  const decryptServiceConfig = (buf) => JSON.parse(buf.toString('utf8'));
  const fundFieldHash = (f, val) => `hash-${val}`;

  const rawMessage = 'HDFC Bank: Rs 5,000.00 credited via UPI ref 999888777666';
  const result = await processIncomingSms({
    db: mockDb,
    decryptServiceConfig,
    fundFieldHash,
    sender: 'AX-HDFCBK',
    rawMessage,
  });

  assert.equal(result.ok, true);
  assert.equal(result.isCredit, true);
  assert.equal(result.utr, '999888777666');
  assert.equal(result.matchStatus, 'unmatched');
});

test('Service Settings Page - Incoming SMS Tab & Form Elements', async () => {
  const mockDb = {
    query: async () => ({ rows: [] }),
  };

  const { sendAdminServiceSettingsPage } = createAdminServiceSettingsPage({
    db: mockDb,
    encryptServiceConfig: () => null,
    decryptServiceConfig: () => ({}),
    sendJson: () => {},
    httpError: (msg) => new Error(msg),
  });

  let outputHtml = '';
  const mockResponse = {
    writeHead: () => {},
    end: (html) => { outputHtml = html; },
  };

  await sendAdminServiceSettingsPage({ id: 'admin-1', role: 'admin' }, mockResponse);

  // Check Incoming SMS tab button
  assert.ok(outputHtml.includes('data-target="#tabIncomingSms"'));
  assert.ok(outputHtml.includes('Incoming SMS'));

  // Check tab pane elements
  assert.ok(outputHtml.includes('id="tabIncomingSms"'));
  assert.ok(outputHtml.includes('id="incomingSmsEnabled"'));
  assert.ok(outputHtml.includes('id="serviceIncomingSmsWebhookUrl"'));
  assert.ok(outputHtml.includes('id="incomingSmsSecretKey"'));
  assert.ok(outputHtml.includes('id="incomingSmsAutoCredit"'));
  assert.ok(outputHtml.includes('id="incomingSmsAllowedSenders"'));
  assert.ok(outputHtml.includes('id="btnSaveIncomingSms"'));
  assert.ok(outputHtml.includes('View Incoming SMS Chart &amp; Logs'));
});

test('Incoming SMS Page - Full Component Elements & Visual Chart', async () => {
  const mockLogs = [
    {
      id: 'log-1',
      sender: 'VM-SBIINB',
      raw_message: 'Dear SBI User, your A/C ending 1234 has been credited by Rs. 2,000.00 on 28-10-26 by UPI ref no 430291827364.',
      sim_slot: '0',
      parsed_amount_minor: 200000n,
      parsed_utr: '430291827364',
      parsed_bank: 'SBI',
      match_status: 'auto_approved',
      matched_fund_request_id: 'fund-1',
      matched_user_id: 'user-1',
      matched_username: '9839680707',
      matched_user_name: 'GOYALPAY',
      auto_approval_note: 'Auto-approved via Incoming Bank SMS Webhook',
      created_at: new Date().toISOString(),
    },
  ];

  const mockDb = {
    query: async (sql) => {
      if (sql.includes("FROM admin_service_settings WHERE service_key = 'incoming_sms'")) {
        return { rowCount: 1, rows: [{ is_enabled: true, config_ciphertext: null }] };
      }
      if (sql.includes('SELECT COUNT(*)::int as total FROM incoming_sms_logs')) {
        return { rowCount: 1, rows: [{ total: 1 }] };
      }
      if (sql.includes('matched_user_name')) {
        return { rowCount: 1, rows: mockLogs };
      }
      if (sql.includes('COUNT(*)::int as total_sms')) {
        return {
          rowCount: 1,
          rows: [{
            total_sms: 1,
            auto_approved_count: 1,
            unmatched_count: 0,
            ignored_count: 0,
            total_credited_minor: 200000n,
          }],
        };
      }
      if (sql.includes('to_char(created_at, \'YYYY-MM-DD\') as day')) {
        return {
          rowCount: 1,
          rows: [{
            day: '2026-10-28',
            count_total: 1,
            count_approved: 1,
            amount_credited_minor: 200000n,
          }],
        };
      }
      if (sql.includes('COALESCE(parsed_bank, \'Other\') as bank_name')) {
        return { rowCount: 1, rows: [{ bank_name: 'SBI', count: 1, approved_count: 1 }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  const { sendAdminIncomingSmsPage } = createAdminIncomingSmsPage({
    db: mockDb,
    decryptServiceConfig: () => ({ autoUpdatePayment: true }),
    formatMinorUnits: (m) => (Number(m) / 100).toFixed(2),
  });

  let outputHtml = '';
  const mockResponse = {
    writeHead: () => {},
    end: (html) => { outputHtml = html; },
  };

  const url = new URL('http://localhost:3000/admin/reports/incoming-sms');
  await sendAdminIncomingSmsPage({ id: 'admin-1', role: 'admin' }, mockResponse, url);

  // Verify navigation menu
  assert.ok(outputHtml.includes('horizontalMenu'));

  // Verify KPI cards
  assert.ok(outputHtml.includes('Total Received SMS'));
  assert.ok(outputHtml.includes('Auto-Approved Topups'));
  assert.ok(outputHtml.includes('Total Amount Credited'));

  // Verify Chart Container
  assert.ok(outputHtml.includes('Incoming SMS &amp; Auto-Credit Activity Chart'));

  // Verify Table & Records
  assert.ok(outputHtml.includes('GOYALPAY'));
  assert.ok(outputHtml.includes('430291827364'));
  assert.ok(outputHtml.includes('Auto Approved'));
  assert.ok(outputHtml.includes('VM-SBIINB'));

  // Verify Webhook Copy Button and Modals
  assert.ok(outputHtml.includes('id="webhookUrlInput"'));
  assert.ok(outputHtml.includes('id="btnCopyWebhookUrl"'));
  assert.ok(outputHtml.includes('id="payloadModal"'));
  assert.ok(outputHtml.includes('id="testSmsModal"'));
});
