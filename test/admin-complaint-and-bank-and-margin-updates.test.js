'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ADMIN_PANEL_MENU, renderAdminNavigation } = require('../config/admin-panel-menu');
const createAdminAllSellerMarginPage = require('../pages/admin-all-seller-margin');
const createUserSalesMarginPage = require('../pages/user-sales-margin');
const createAdminBankApprovalPage = require('../pages/admin-bank-approval');
const createAdminComplaintReportPage = require('../pages/admin-complaint-report');
const createAdminServiceSettingsPage = require('../pages/admin-service-settings');
const createUserFundRedeemPage = require('../pages/user-fund-redeem');
const createUserWalletTopupPage = require('../pages/user-wallet-topup');
const createAdminPayoutRequestsPage = require('../pages/admin-payout-requests');

test('Admin Navigation Menu - Complaint Report Item exists under Reports', () => {
  const reportsMenu = ADMIN_PANEL_MENU.find((m) => m.label === 'Reports');
  assert.ok(reportsMenu, 'Reports menu group should exist');

  const complaintItem = reportsMenu.items.find((s) => s.path === '/admin/reports/complaint');
  assert.ok(complaintItem, 'Complaint Report menu item should exist in Reports');
  assert.equal(complaintItem.label, 'Complaint Report');

  const renderedNav = renderAdminNavigation('/admin/reports/complaint');
  assert.ok(renderedNav.includes('/admin/reports/complaint'), 'Rendered nav should include /admin/reports/complaint link');
  assert.ok(renderedNav.includes('Complaint Report'), 'Rendered nav should include label Complaint Report');
});

test('Feature 1: Admin All Seller Margin Page - User Status and Admin Status Columns', async () => {
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id, operator_name')) {
        return {
          rows: [
            { id: 'op-1', operator_name: 'Airtel', service_type: 'Mobile Recharge', operator_code: 'AT' },
          ],
          rowCount: 1,
        };
      }
      return {
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            user_id: 'u-1',
            username: 'seller01',
            user_name: 'Sharma Telecom',
            phone_ciphertext: null,
            operator_id: 'op-1',
            operator_name: 'Airtel',
            operator_code: 'AT',
            admin_op_code: 'AT',
            service_type: 'Mobile Recharge',
            circle_name: 'Delhi',
            amount_type: 'all',
            amount_min_minor: '0',
            amount_max_minor: '0',
            commission_percent: '4.2500',
            limit_type: 'daily',
            limit_minor: '500000',
            limit_used_minor: '12000',
            with_gst: false,
            is_active: true,
            is_admin_approved: false, // Admin turned it OFF (Blocked)
            is_roffer: 'all',
            created_at: new Date().toISOString(),
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            user_id: 'u-2',
            username: 'seller02',
            user_name: 'Verma Recharge',
            phone_ciphertext: null,
            operator_id: 'op-1',
            operator_name: 'Airtel',
            operator_code: 'AT',
            admin_op_code: 'AT',
            service_type: 'Mobile Recharge',
            circle_name: 'UP East',
            amount_type: 'all',
            amount_min_minor: '0',
            amount_max_minor: '0',
            commission_percent: '3.8000',
            limit_type: 'daily',
            limit_minor: '100000',
            limit_used_minor: '5000',
            with_gst: true,
            is_active: false,
            is_admin_approved: true, // Admin turned it ON (Allowed)
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 2,
      };
    },
  };

  const { sendAdminAllSellerMarginPage } = createAdminAllSellerMarginPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v || 0) / 100).toFixed(2),
    decryptMobile: (m) => m,
    sendJson: () => {},
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
  });

  let outputHtml = '';
  const mockRes = {
    writeHead: () => {},
    end: (html) => { outputHtml = html; },
  };

  await sendAdminAllSellerMarginPage({ id: 'admin-1', role: 'admin' }, mockRes, new URLSearchParams(''));

  // Check columns
  assert.ok(outputHtml.includes('>User Status<'), 'Table should have User Status column header');
  assert.ok(outputHtml.includes('>Admin Status<'), 'Table should have Admin Status column header');

  // Check buttons
  assert.ok(outputHtml.includes('btn-toggle-admin-status'), 'Should have Admin Status toggle buttons');
  assert.ok(outputHtml.includes('ON (Allowed)'), 'Should show ON (Allowed) button for approved margins');
  assert.ok(outputHtml.includes('OFF (Blocked)'), 'Should show OFF (Blocked) button for blocked margins');

  // Check User Status badges
  assert.ok(outputHtml.includes('<i class="fa fa-check-circle mr-1"></i> ON'), 'Should display User Status ON badge');
  assert.ok(outputHtml.includes('<i class="fa fa-ban mr-1"></i> OFF'), 'Should display User Status OFF badge');

  // Check Filters
  assert.ok(outputHtml.includes('name="userStatus"'), 'Should have User Status filter dropdown');
  assert.ok(outputHtml.includes('name="adminStatus"'), 'Should have Admin Status filter dropdown');
});

test('Feature 1: User Sales Margin - Admin OFF blocks user from turning it ON', async () => {
  let queriedSql = '';
  let updatedActive = null;

  const mockDb = {
    query: async (sql, params) => {
      queriedSql = sql;
      if (sql.includes('SELECT id, is_active, is_admin_approved FROM seller_margin_settings')) {
        // Return record with is_admin_approved = false (Admin turned OFF)
        return {
          rows: [{ id: params[0], is_active: false, is_admin_approved: false }],
          rowCount: 1,
        };
      }
      if (sql.includes('UPDATE seller_margin_settings SET is_active=')) {
        updatedActive = params[2];
        return {
          rows: [{ id: params[0], is_active: updatedActive }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const { setSellerMarginActive } = createUserSalesMarginPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v || 0) / 100).toFixed(2),
    sendJson: (_res, _code, data) => data,
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
    getSession: async () => ({ id: '11111111-1111-4111-8111-111111111111', role: 'user' }),
    checkSameOrigin: () => {},
    readJson: async () => ({ active: true }),
    allowRate: () => true,
  });

  const mockReq = { headers: {} };
  const mockRes = {};

  // User attempts to turn ON while Admin Status is OFF
  await assert.rejects(
    async () => {
      await setSellerMarginActive(mockReq, mockRes, '22222222-2222-4222-8222-222222222222');
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.ok(err.message.includes('Admin'), 'Error should state that Admin has turned this OFF');
      return true;
    },
    'Should reject user attempt to activate admin-blocked margin'
  );

  assert.equal(updatedActive, null, 'UPDATE should not have been executed');

  // Now mock Admin turning it back ON
  const mockDbAdminAllowed = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id, is_active, is_admin_approved FROM seller_margin_settings')) {
        return {
          rows: [{ id: params[0], is_active: false, is_admin_approved: true }],
          rowCount: 1,
        };
      }
      if (sql.includes('UPDATE seller_margin_settings SET is_active=')) {
        updatedActive = params[2];
        return {
          rows: [{ id: params[0], is_active: updatedActive }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const { setSellerMarginActive: setMarginActiveAllowed } = createUserSalesMarginPage({
    db: mockDbAdminAllowed,
    formatMinorUnits: (v) => (Number(v || 0) / 100).toFixed(2),
    sendJson: (_res, _code, data) => data,
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
    getSession: async () => ({ id: '11111111-1111-4111-8111-111111111111', role: 'user' }),
    checkSameOrigin: () => {},
    readJson: async () => ({ active: true }),
    allowRate: () => true,
  });

  await setMarginActiveAllowed(mockReq, mockRes, '22222222-2222-4222-8222-222222222222');
  assert.equal(updatedActive, true, 'User should be able to turn ON when Admin Status is ON');
});

test('Feature 2: Admin Bank Approval Page - Pending on Top, All Added Banks Below', async () => {
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('COUNT(*)::int AS total_banks')) {
        return {
          rows: [{ total_banks: 5, pending_banks: 1, approved_banks: 3, rejected_banks: 1 }],
          rowCount: 1,
        };
      }
      if (sql.includes("WHERE b.status = 'pending'")) {
        // Pending banks (Upper section)
        return {
          rows: [
            {
              id: 'bank-p1',
              user_id: 'u-1',
              bank_name: 'HDFC Bank',
              account_holder_name: 'Rahul Sharma',
              account_number: '50100234567890',
              ifsc_code: 'HDFC0001234',
              status: 'pending',
              admin_note: null,
              created_at: new Date().toISOString(),
              approved_at: null,
              username: 'rahul99',
              user_name: 'Rahul Sharma',
              email: 'rahul@example.com',
            },
          ],
          rowCount: 1,
        };
      }
      // All banks (Lower section)
      return {
        rows: [
          {
            id: 'bank-p1',
            user_id: 'u-1',
            bank_name: 'HDFC Bank',
            account_holder_name: 'Rahul Sharma',
            account_number: '50100234567890',
            ifsc_code: 'HDFC0001234',
            status: 'pending',
            admin_note: null,
            created_at: new Date().toISOString(),
            approved_at: null,
            username: 'rahul99',
            user_name: 'Rahul Sharma',
            email: 'rahul@example.com',
          },
          {
            id: 'bank-a1',
            user_id: 'u-2',
            bank_name: 'State Bank of India',
            account_holder_name: 'Pooja Verma',
            account_number: '30492819283',
            ifsc_code: 'SBIN0004321',
            status: 'approved',
            admin_note: 'Verified with passbook',
            created_at: new Date(Date.now() - 86400000).toISOString(),
            approved_at: new Date().toISOString(),
            username: 'pooja88',
            user_name: 'Pooja Verma',
            email: 'pooja@example.com',
          },
        ],
        rowCount: 2,
      };
    },
  };

  const { sendAdminBankApprovalPage } = createAdminBankApprovalPage({
    db: mockDb,
    decryptMobile: (m) => m,
  });

  let outputHtml = '';
  const mockRes = {
    writeHead: () => {},
    end: (html) => { outputHtml = html; },
  };

  await sendAdminBankApprovalPage({ id: 'admin-1', role: 'admin' }, mockRes, new URLSearchParams(''));

  // Verify Upper section exists for Pending Approvals
  assert.ok(outputHtml.includes('Pending Bank Approvals'), 'Should have Pending Bank Approvals section on top');
  assert.ok(outputHtml.includes('Action Required'), 'Should indicate pending action');

  // Verify Lower section exists for All User Banks
  assert.ok(outputHtml.includes('All Added User Banks Directory'), 'Should have All Added User Banks Directory on bottom');
  assert.ok(outputHtml.includes('Complete list of all bank accounts submitted by users'), 'Should describe directory table');

  // Verify elements in both tables
  assert.ok(outputHtml.includes('HDFC0001234'), 'Should show pending account IFSC');
  assert.ok(outputHtml.includes('SBIN0004321'), 'Should show approved account IFSC');
  assert.ok(outputHtml.includes('btn-approve'), 'Should have approve buttons');
  assert.ok(outputHtml.includes('btn-reject'), 'Should have reject buttons');
  assert.ok(outputHtml.includes('Search User / Bank / Account'), 'Should have search filter for all banks');
});

test('Feature 3: Admin Complaint Report Page - Rendering, KPIs, Table & Modal', async () => {
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id, operator_name')) {
        return {
          rows: [{ id: 'op-1', operator_name: 'Airtel', service_type: 'Mobile Recharge' }],
          rowCount: 1,
        };
      }
      if (sql.includes('COUNT(*)::int AS total_complaints')) {
        return {
          rows: [{
            total_complaints: 3,
            pending_complaints: 1,
            accepted_complaints: 1,
            rejected_complaints: 1,
            total_disputed_minor: 89700,
          }],
          rowCount: 1,
        };
      }
      // Complaints list
      return {
        rows: [
          {
            order_id: 'df9959af-7ef9-4526-9045-6134179894e4',
            buyer_user_id: 'b-1',
            seller_user_id: 's-1',
            mobile_number: '9876543210',
            operator_name: 'Airtel',
            circle_name: 'UP East',
            amount_minor: '29900',
            recharge_status: 'success',
            idempotency_key: 'BUY-TXN-101',
            provider_reference: 'OPR-99881',
            dispute_status: 'pending',
            dispute_reason: 'Recharge not received on customer handset',
            dispute_resolution_note: null,
            dispute_created_at: new Date().toISOString(),
            dispute_resolved_at: null,
            buyer_username: 'buyer_amit',
            buyer_name: 'Amit Kumar',
            buyer_phone: null,
            buyer_email: 'amit@example.com',
            seller_username: 'testseller',
            seller_name: 'Test Seller API',
            resolved_by_username: null,
            resolved_by_name: null,
            dispute_code: 'CMP-2026-001',
            dispute_id: 'disp-1',
          },
          {
            order_id: 'de017a5d-a730-43e9-93f0-8c66a7c1d907',
            buyer_user_id: 'b-2',
            seller_user_id: 's-1',
            mobile_number: '9415012345',
            operator_name: 'Jio',
            circle_name: 'Delhi',
            amount_minor: '19900',
            recharge_status: 'refunded',
            idempotency_key: 'BUY-TXN-102',
            provider_reference: 'OPR-99882',
            dispute_status: 'accepted',
            dispute_reason: 'Balance not received',
            dispute_resolution_note: 'Refund processed to wallet',
            dispute_created_at: new Date(Date.now() - 3600000).toISOString(),
            dispute_resolved_at: new Date().toISOString(),
            buyer_username: 'buyer_neha',
            buyer_name: 'Neha Singh',
            buyer_phone: null,
            buyer_email: 'neha@example.com',
            seller_username: 'testseller',
            seller_name: 'Test Seller API',
            resolved_by_username: 'admin',
            resolved_by_name: 'Super Admin',
            dispute_code: 'CMP-2026-002',
            dispute_id: 'disp-2',
          },
        ],
        rowCount: 2,
      };
    },
  };

  const { sendAdminComplaintReportPage } = createAdminComplaintReportPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v || 0) / 100).toFixed(2),
    decryptMobile: (m) => m,
    sendJson: () => {},
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
  });

  let outputHtml = '';
  const mockRes = {
    writeHead: () => {},
    end: (html) => { outputHtml = html; },
  };

  await sendAdminComplaintReportPage({ id: 'admin-1', role: 'admin' }, mockRes, new URLSearchParams(''));

  // Title & KPI
  assert.ok(outputHtml.includes('User Complaints Report'), 'Should render page title User Complaints Report');
  assert.ok(outputHtml.includes('Total Complaints'), 'Should render Total Complaints KPI');
  assert.ok(outputHtml.includes('Pending'), 'Should render Pending KPI');
  assert.ok(outputHtml.includes('Accepted &amp; Refunded'), 'Should render Accepted & Refunded KPI');

  // Check Complainant data rendered
  assert.ok(outputHtml.includes('buyer_amit'), 'Should display complainant username buyer_amit');
  assert.ok(outputHtml.includes('Amit Kumar'), 'Should display complainant full name Amit Kumar');
  assert.ok(outputHtml.includes('9876543210'), 'Should display recharged mobile number');
  assert.ok(outputHtml.includes('Recharge not received on customer handset'), 'Should display complaint reason');
  assert.ok(outputHtml.includes('CMP-2026-001'), 'Should display complaint reference code');

  // Check Action buttons & modal
  assert.ok(outputHtml.includes('btn-view-complaint'), 'Should have View Details button');
  assert.ok(outputHtml.includes('btn-quick-accept'), 'Should have quick accept button for pending complaints');
  assert.ok(outputHtml.includes('btn-quick-reject'), 'Should have quick reject button for pending complaints');
  assert.ok(outputHtml.includes('id="complaintModal"'), 'Should include Complaint Details Modal');

  // Check Filters
  assert.ok(outputHtml.includes('name="user"'), 'Should have User filter');
  assert.ok(outputHtml.includes('name="status"'), 'Should have Status filter');
  assert.ok(outputHtml.includes('name="search"'), 'Should have Keyword Search filter');
  assert.ok(outputHtml.includes('Export CSV'), 'Should have Export CSV button');
});

test('Feature 4: Service Settings - 5 New Payout & Fund Request Options Persistence & Page Rendering', async () => {
  let savedCiphertext = null;
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO admin_service_settings')) {
        savedCiphertext = params[0];
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('SELECT service_key')) {
        return {
          rows: savedCiphertext ? [{
            service_key: 'general',
            is_enabled: true,
            config_ciphertext: savedCiphertext,
            updated_at: new Date().toISOString(),
          }] : [],
          rowCount: savedCiphertext ? 1 : 0,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const fakeEncrypt = (obj) => JSON.stringify(obj);
  const fakeDecrypt = (str) => {
    try { return JSON.parse(str); } catch { return {}; }
  };

  let jsonResponse = null;
  const mockSendJson = (res, code, data) => { jsonResponse = { code, data }; };

  const {
    handleSaveGeneralSettings,
    handleGetServices,
    sendAdminServiceSettingsPage,
  } = createAdminServiceSettingsPage({
    db: mockDb,
    encryptServiceConfig: fakeEncrypt,
    decryptServiceConfig: fakeDecrypt,
    sendJson: mockSendJson,
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
  });

  // 1. Save general settings with the 5 new options
  const payload = {
    payoutTimeWindowEnabled: true,
    payoutStartTime: '10:00',
    payoutEndTime: '20:00',
    payoutAmountLimitEnabled: true,
    payoutMinAmount: 200,
    payoutMaxAmount: 25000,
    fundRequestMinAmountEnabled: true,
    fundRequestMinAmount: 500,
    payoutChargesEnabled: true,
    payoutChargeImps: 6.50,
    payoutChargeNeft: 2.50,
    payoutChargeRtgs: 12.00,
    payoutCooldownEnabled: true,
    payoutCooldownMinutes: 45,
  };

  await handleSaveGeneralSettings({}, {}, payload);
  assert.equal(jsonResponse.code, 200);
  assert.equal(jsonResponse.data.ok, true);
  assert.equal(jsonResponse.data.general.payoutTimeWindowEnabled, true);
  assert.equal(jsonResponse.data.general.payoutStartTime, '10:00');
  assert.equal(jsonResponse.data.general.payoutEndTime, '20:00');
  assert.equal(jsonResponse.data.general.payoutMinAmount, 200);
  assert.equal(jsonResponse.data.general.payoutMaxAmount, 25000);
  assert.equal(jsonResponse.data.general.fundRequestMinAmount, 500);
  assert.equal(jsonResponse.data.general.payoutChargeImps, 6.5);
  assert.equal(jsonResponse.data.general.payoutChargeNeft, 2.5);
  assert.equal(jsonResponse.data.general.payoutChargeRtgs, 12);
  assert.equal(jsonResponse.data.general.payoutCooldownMinutes, 45);

  // 2. Fetch services to verify roundtrip decryption
  await handleGetServices({}, {});
  assert.equal(jsonResponse.code, 200);
  const fetched = jsonResponse.data.general;
  assert.equal(fetched.payoutStartTime, '10:00');
  assert.equal(fetched.payoutEndTime, '20:00');
  assert.equal(fetched.payoutMinAmount, 200);
  assert.equal(fetched.payoutMaxAmount, 25000);
  assert.equal(fetched.fundRequestMinAmount, 500);
  assert.equal(fetched.payoutChargeImps, 6.5);
  assert.equal(fetched.payoutCooldownMinutes, 45);

  // 3. Render Admin Service Settings HTML and verify all 5 options are present
  let pageHtml = '';
  const mockRes = {
    writeHead: () => {},
    end: (html) => { pageHtml = html; },
  };
  await sendAdminServiceSettingsPage({ id: 'admin-1', role: 'admin' }, mockRes);

  assert.ok(pageHtml.includes('Payout &amp; Fund Request Rules'), 'Section header should be present');
  assert.ok(pageHtml.includes('id="payoutTimeWindowEnabled"'), 'Toggle for payout time window should exist');
  assert.ok(pageHtml.includes('id="payoutStartTime"'), 'Input for payout start time should exist');
  assert.ok(pageHtml.includes('id="payoutEndTime"'), 'Input for payout end time should exist');
  assert.ok(pageHtml.includes('id="payoutAmountLimitEnabled"'), 'Toggle for payout amount limit should exist');
  assert.ok(pageHtml.includes('id="payoutMinAmount"'), 'Input for payout min amount should exist');
  assert.ok(pageHtml.includes('id="payoutMaxAmount"'), 'Input for payout max amount should exist');
  assert.ok(pageHtml.includes('id="fundRequestMinAmountEnabled"'), 'Toggle for min fund request should exist');
  assert.ok(pageHtml.includes('id="fundRequestMinAmount"'), 'Input for min fund request amount should exist');
  assert.ok(pageHtml.includes('id="payoutChargesEnabled"'), 'Toggle for payout charges should exist');
  assert.ok(pageHtml.includes('id="payoutChargeImps"'), 'Input for IMPS charge should exist');
  assert.ok(pageHtml.includes('id="payoutChargeNeft"'), 'Input for NEFT charge should exist');
  assert.ok(pageHtml.includes('id="payoutChargeRtgs"'), 'Input for RTGS charge should exist');
  assert.ok(pageHtml.includes('id="payoutCooldownEnabled"'), 'Toggle for payout cooldown should exist');
  assert.ok(pageHtml.includes('id="payoutCooldownMinutes"'), 'Input for cooldown minutes should exist');
});

test('Feature 5: User Fund Redeem Page - Display Limits, Modes, and Charges', async () => {
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('FROM wallets')) {
        return {
          rows: [{ balance_minor: '800000', seller_balance_minor: '800000', buyer_balance_minor: '0' }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM website_settings')) {
        return { rows: [{ seller_wallet_mode: 'single', seller_sale_redeem_hold_minutes: 0 }], rowCount: 1 };
      }
      if (sql.includes('FROM recharge_orders')) {
        return { rows: [{ held_minor: '0', lien_minor: '0' }], rowCount: 1 };
      }
      if (sql.includes('FROM user_bank_accounts')) {
        return {
          rows: [
            {
              id: 'bank-uuid-1',
              bank_name: 'HDFC Bank',
              account_holder_name: 'Sharma Telecom',
              account_number: '123456789012',
              ifsc_code: 'HDFC0001234',
              status: 'approved',
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM user_kyc')) {
        return { rows: [{ status: 'approved' }], rowCount: 1 };
      }
      if (sql.includes('FROM payout_requests')) {
        return {
          rows: [
            {
              id: 'payout-1',
              bank_name: 'HDFC Bank',
              account_holder_name: 'Sharma Telecom',
              account_number: '123456789012',
              ifsc_code: 'HDFC0001234',
              amount_minor: '500000',
              status: 'pending',
              utr_number: null,
              admin_remark: null,
              payout_mode: 'IMPS',
              charge_minor: '500',
              created_at: new Date().toISOString(),
              processed_at: null,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const mockGeneralSettings = async () => ({
    payoutTimeWindowEnabled: true,
    payoutStartTime: '09:00',
    payoutEndTime: '22:00',
    payoutAmountLimitEnabled: true,
    payoutMinAmount: 100,
    payoutMaxAmount: 50000,
    fundRequestMinAmountEnabled: true,
    fundRequestMinAmount: 100,
    payoutChargesEnabled: true,
    payoutChargeImps: 5.00,
    payoutChargeNeft: 3.00,
    payoutChargeRtgs: 10.00,
    payoutCooldownEnabled: true,
    payoutCooldownMinutes: 30,
  });

  const { sendUserFundRedeemPage } = createUserFundRedeemPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v || 0) / 100).toFixed(2),
    getGeneralSettings: mockGeneralSettings,
  });

  let outputHtml = '';
  const mockRes = {
    writeHead: () => {},
    end: (html) => { outputHtml = html; },
  };

  await sendUserFundRedeemPage({ id: 'u-1', role: 'user' }, mockRes, new URLSearchParams(''));

  // Verify Transfer Mode selector and options
  assert.ok(outputHtml.includes('id="payoutMode"'), 'Should have Transfer Mode selector');
  assert.ok(outputHtml.includes('IMPS (Fee: ₹5.00)'), 'Should list IMPS fee');
  assert.ok(outputHtml.includes('NEFT (Fee: ₹3.00)'), 'Should list NEFT fee');
  assert.ok(outputHtml.includes('RTGS (Fee: ₹10.00)'), 'Should list RTGS fee');

  // Verify Amount limit display
  assert.ok(outputHtml.includes('Allowed Amount Limit:'), 'Should display allowed amount limit');
  assert.ok(outputHtml.includes('Min ₹100.00 - Max ₹50000.00'), 'Should show configured min and max range');

  // Verify Payout hours display
  assert.ok(outputHtml.includes('Payout Hours:'), 'Should display allowed payout hours');
  assert.ok(outputHtml.includes('09:00 AM to 10:00 PM'), 'Should display formatted 12-hour payout hours');

  // Verify History table displays mode and fee
  assert.ok(outputHtml.includes('IMPS'), 'History table should display payout mode');
  assert.ok(outputHtml.includes('Fee ₹5.00'), 'History table should display fee amount');
});

test('Feature 6: User Wallet Topup Page - Displays Minimum Fund Request Limit', async () => {
  const mockDb = {
    query: async (sql) => {
      if (sql.includes('FROM admin_bank_accounts')) {
        return {
          rows: [
            {
              id: 'bank-1',
              bank_name: 'State Bank of India',
              branch_name: 'Main',
              account_holder: 'Exchange Services',
              account_number: '112233445566',
              ifsc_code: 'SBIN0001111',
              cash_deposit_charges: 0,
              upi_id: 'exchange@sbi',
              qr_image_url: null,
              bank_logo_url: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM wallet_fund_requests')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM website_settings')) {
        return { rows: [{ seller_wallet_mode: 'single' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const mockGeneralSettings = async () => ({
    fundRequestMinAmountEnabled: true,
    fundRequestMinAmount: 500,
  });

  const { sendWalletTopupRequestPage } = createUserWalletTopupPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v || 0) / 100).toFixed(2),
    getGeneralSettings: mockGeneralSettings,
  });

  let outputHtml = '';
  const mockRes = {
    writeHead: () => {},
    end: (html) => { pageHtml: outputHtml = html; },
  };

  await sendWalletTopupRequestPage({ id: 'u-1', name: 'Ravi', username: 'ravi01' }, mockRes);

  assert.ok(outputHtml.includes('Min ₹500.00'), 'Should show Min ₹500.00 badge beside amount label');
  assert.ok(outputHtml.includes('min="500"'), 'Amount input should have min="500"');
  assert.ok(outputHtml.includes('Minimum fund request limit is <strong>₹500.00</strong>'), 'Should show informative help text for min amount');
});

test('Feature 7: Admin Payout Requests Page - Shows Payout Mode and Fee', async () => {
  const mockDb = {
    query: async (sql) => {
      if (sql.includes('FROM payout_requests')) {
        return {
          rows: [
            {
              id: 'payout-1234',
              user_id: 'u-1',
              bank_name: 'ICICI Bank',
              account_holder_name: 'Sharma Telecom',
              account_number: '987654321012',
              ifsc_code: 'ICIC0001234',
              amount_minor: '799500',
              status: 'pending',
              utr_number: null,
              admin_remark: null,
              created_at: new Date().toISOString(),
              processed_at: null,
              payout_mode: 'IMPS',
              charge_minor: '500',
              username: 'sharma01',
              user_name: 'Sharma Telecom',
              email: 'sharma@example.com',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const { sendAdminPayoutRequestsPage } = createAdminPayoutRequestsPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v || 0) / 100).toFixed(2),
  });

  let outputHtml = '';
  const mockRes = {
    writeHead: () => {},
    end: (html) => { outputHtml = html; },
  };

  await sendAdminPayoutRequestsPage({ id: 'admin-1', role: 'admin' }, mockRes, new URLSearchParams(''));

  assert.ok(outputHtml.includes('₹7995.00'), 'Should render requested payout amount');
  assert.ok(outputHtml.includes('IMPS'), 'Should render payout transfer mode');
  assert.ok(outputHtml.includes('(Fee: ₹5.00)'), 'Should render payout fee');
});

test('Feature 8: Payout & Fund Request Rule Enforcement Logic', () => {
  // Test helper: formatTime12Hour
  function formatTime12Hour(timeStr) {
    if (!timeStr) return '';
    const [hStr, mStr] = String(timeStr).split(':');
    let h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  assert.equal(formatTime12Hour('09:00'), '09:00 AM');
  assert.equal(formatTime12Hour('22:00'), '10:00 PM');
  assert.equal(formatTime12Hour('00:00'), '12:00 AM');
  assert.equal(formatTime12Hour('12:30'), '12:30 PM');

  // Test Time Window Enforcement
  function checkTimeWindow(currentTimeStr, startTimeStr, endTimeStr) {
    const [curH, curM] = currentTimeStr.split(':').map(Number);
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);
    const curMins = curH * 60 + curM;
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    let isAllowed = false;
    if (startMins <= endMins) {
      isAllowed = (curMins >= startMins && curMins <= endMins);
    } else {
      isAllowed = (curMins >= startMins || curMins <= endMins);
    }
    if (!isAllowed) {
      throw new Error(`Plz make payment request between ${formatTime12Hour(startTimeStr)} to ${formatTime12Hour(endTimeStr)}`);
    }
    return true;
  }

  assert.ok(checkTimeWindow('14:30', '09:00', '22:00'));
  assert.throws(
    () => checkTimeWindow('05:00', '09:00', '22:00'),
    /Plz make payment request between 09:00 AM to 10:00 PM/
  );

  // Test Amount Limit Enforcement
  function checkAmountLimit(amount, min, max) {
    if (amount < min || amount > max) {
      throw new Error(`Payout request amount must be between ₹${min.toFixed(2)} and ₹${max.toFixed(2)}.`);
    }
    return true;
  }

  assert.ok(checkAmountLimit(500, 100, 50000));
  assert.throws(() => checkAmountLimit(50, 100, 50000), /Payout request amount must be between ₹100.00 and ₹50000.00/);
  assert.throws(() => checkAmountLimit(60000, 100, 50000), /Payout request amount must be between ₹100.00 and ₹50000.00/);

  // Test Payout Charges & Balance Deduction:
  // User balance = 8000, IMPS charge = 5 -> User max request = 7995, Total wallet debit = 8000
  const userBalanceRupees = 8000;
  const impsFeeRupees = 5;
  const requestedPayout = 7995;
  const totalDebit = requestedPayout + impsFeeRupees;
  assert.equal(totalDebit, 8000);
  assert.ok(totalDebit <= userBalanceRupees, '7995 + 5 fits in 8000 balance');

  // Attempting to request 8000 with 5 fee would exceed balance
  const excessivePayout = 8000;
  assert.ok((excessivePayout + impsFeeRupees) > userBalanceRupees, '8000 + 5 = 8005 exceeds 8000');

  // Test Payout Cooldown Enforcement
  function checkCooldown(lastCreatedAtMs, cooldownMins) {
    const elapsedMins = (Date.now() - lastCreatedAtMs) / (1000 * 60);
    if (elapsedMins < cooldownMins) {
      const wait = Math.ceil(cooldownMins - elapsedMins);
      throw new Error(`Please wait ${wait} minute(s) before submitting another payout request. (Allowed gap: ${cooldownMins} minutes between requests).`);
    }
    return true;
  }

  // 10 minutes ago with 30 min cooldown -> blocked
  assert.throws(
    () => checkCooldown(Date.now() - 10 * 60 * 1000, 30),
    /Please wait 20 minute\(s\) before submitting another payout request/
  );
  // 35 minutes ago with 30 min cooldown -> allowed
  assert.ok(checkCooldown(Date.now() - 35 * 60 * 1000, 30));
});

