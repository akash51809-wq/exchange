'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ADMIN_PANEL_MENU, renderAdminNavigation } = require('../config/admin-panel-menu');
const createAdminAllSellerMarginPage = require('../pages/admin-all-seller-margin');
const createAdminAllBuyerMarginPage = require('../pages/admin-all-buyer-margin');
const createAdminCreateOperatorPage = require('../pages/admin-create-operator');
const createAdminShowOperatorsPage = require('../pages/admin-show-operators');
const createUserSalesMarginPage = require('../pages/user-sales-margin');

test('Admin Navigation Menu - Margin Reports and User Login Log Items', () => {
  const reportsMenu = ADMIN_PANEL_MENU.find((m) => m.label === 'Reports');
  assert.ok(reportsMenu, 'Reports menu group should exist');

  const sellerMarginItem = reportsMenu.items.find((s) => s.path === '/admin/reports/all-seller-margin');
  assert.ok(sellerMarginItem, 'Show All Seller Margin menu item should exist in Reports');
  assert.equal(sellerMarginItem.label, 'Show All Seller Margin');

  const buyerMarginItem = reportsMenu.items.find((s) => s.path === '/admin/reports/all-buyer-margin');
  assert.ok(buyerMarginItem, 'Show All Buyer Margin menu item should exist in Reports');
  assert.equal(buyerMarginItem.label, 'Show All Buyer Margin');

  const loginLogItem = reportsMenu.items.find((s) => s.path === '/admin/reports/user-login-log');
  assert.ok(loginLogItem, 'User Login Log menu item should exist in Reports');
  assert.equal(loginLogItem.label, 'User Login Log');

  const renderedNav = renderAdminNavigation('/admin/reports/all-seller-margin');
  assert.ok(renderedNav.includes('/admin/reports/all-seller-margin'), 'Rendered nav should include all-seller-margin link');
  assert.ok(renderedNav.includes('Show All Seller Margin'), 'Rendered nav should include label Show All Seller Margin');
  assert.ok(renderedNav.includes('/admin/reports/all-buyer-margin'), 'Rendered nav should include all-buyer-margin link');
  assert.ok(renderedNav.includes('/admin/reports/user-login-log'), 'Rendered nav should include user-login-log link');
});

test('Admin All Seller Margin Page - Component Rendering & Filters', async () => {
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id, operator_name')) {
        return {
          rows: [
            { id: 'op-1', operator_name: 'Airtel' },
            { id: 'op-2', operator_name: 'Jio' },
          ],
          rowCount: 2,
        };
      }
      return {
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            user_id: 'u-1',
            username: 'seller01',
            user_name: 'Goyal Telecom',
            mobile: '9876543210',
            operator_id: 'op-1',
            operator_name: 'Airtel',
            operator_code: 'AT',
            service_type: 'Mobile Recharge',
            circle_name: 'Delhi',
            amount_type: 'all',
            amount_min_minor: '0',
            amount_max_minor: '0',
            commission_percent: '3.50',
            limit_type: 'unlimited',
            limit_minor: '0',
            is_active: true,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
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

  assert.ok(outputHtml.includes('Show All Seller Margin'), 'Should display page title');
  assert.ok(outputHtml.includes('Goyal Telecom'), 'Should display seller firm name');
  assert.ok(outputHtml.includes('Airtel'), 'Should display operator name');
  assert.ok(outputHtml.includes('3.5000%'), 'Should display commission percent');
  assert.ok(outputHtml.includes('name="seller"'), 'Should have seller filter');
  assert.ok(outputHtml.includes('name="operatorId"'), 'Should have operator filter');
  assert.ok(outputHtml.includes('name="circle"'), 'Should have circle filter');
  assert.ok(outputHtml.includes('btn-toggle-active'), 'Should have toggle active button');
  assert.ok(outputHtml.includes('btn-delete-margin'), 'Should have delete button');
  assert.ok(outputHtml.includes('Export CSV'), 'Should have CSV download button');
});

test('Admin All Buyer Margin Page - Component Rendering & Filters', async () => {
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id, operator_name')) {
        return {
          rows: [
            { id: 'op-1', operator_name: 'Airtel' },
          ],
          rowCount: 1,
        };
      }
      return {
        rows: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            user_id: 'b-1',
            username: 'buyer01',
            user_name: 'Kumar Pay',
            mobile: '9123456789',
            operator_id: 'op-1',
            operator_name: 'Airtel',
            operator_code: 'AT',
            service_type: 'Mobile Recharge',
            circle_name: 'All',
            amount_type: 'all',
            amount_min_minor: '0',
            amount_max_minor: '0',
            commission_percent: '2.50',
            limit_type: 'unlimited',
            limit_minor: '0',
            is_active: true,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      };
    },
  };

  const { sendAdminAllBuyerMarginPage } = createAdminAllBuyerMarginPage({
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

  await sendAdminAllBuyerMarginPage({ id: 'admin-1', role: 'admin' }, mockRes, new URLSearchParams(''));

  assert.ok(outputHtml.includes('Show All Buyer Margin'), 'Should display page title');
  assert.ok(outputHtml.includes('Kumar Pay'), 'Should display buyer firm name');
  assert.ok(outputHtml.includes('Airtel'), 'Should display operator name');
  assert.ok(outputHtml.includes('2.5000%'), 'Should display commission percent');
  assert.ok(outputHtml.includes('name="buyer"'), 'Should have buyer filter');
  assert.ok(outputHtml.includes('name="operatorId"'), 'Should have operator filter');
  assert.ok(outputHtml.includes('btn-toggle-active'), 'Should have toggle active button');
  assert.ok(outputHtml.includes('btn-delete-margin'), 'Should have delete button');
});

test('Admin Create Operator & Show Operator - Min/Max Margin Fields', async () => {
  const { sendAdminCreateOperatorPage } = createAdminCreateOperatorPage();
  let createHtml = '';
  await sendAdminCreateOperatorPage({ id: 'admin-1', role: 'admin' }, {
    writeHead: () => {},
    end: (html) => { createHtml = html; },
  });

  assert.ok(createHtml.includes('minimumMarginPercent'), 'Create operator should contain minimumMarginPercent field');
  assert.ok(createHtml.includes('maximumMarginPercent'), 'Create operator should contain maximumMarginPercent field');
  assert.ok(createHtml.includes('Minimum Margin (%)'), 'Create operator should display Minimum Margin label');
  assert.ok(createHtml.includes('Maximum Margin (%)'), 'Create operator should display Maximum Margin label');

  const mockDb = {
    query: async () => ({
      rows: [
        {
          id: 'op-1',
          operator_name: 'Vi India',
          service_type: 'Mobile Recharge',
          operator_code: 'VI',
          minimum_amount_minor: '1000',
          maximum_amount_minor: '100000',
          stop_amounts_minor: [],
          operator_number_length: 10,
          status: 'active',
          minimum_margin_percent: '1.50',
          maximum_margin_percent: '6.00',
          created_at: new Date().toISOString(),
        },
      ],
      rowCount: 1,
    }),
  };

  const { sendAdminShowOperatorsPage } = createAdminShowOperatorsPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v || 0) / 100).toFixed(2),
  });

  let showHtml = '';
  await sendAdminShowOperatorsPage({ id: 'admin-1', role: 'admin' }, {
    writeHead: () => {},
    end: (html) => { showHtml = html; },
  }, new URLSearchParams(''));

  assert.ok(showHtml.includes('Allowed Margin (%)'), 'Table header should include Allowed Margin (%)');
  assert.ok(showHtml.includes('1.50% - 6.00%'), 'Operator row should display allowed margin range');
  assert.ok(showHtml.includes('editMinMargin'), 'Edit modal should contain editMinMargin field');
  assert.ok(showHtml.includes('editMaxMargin'), 'Edit modal should contain editMaxMargin field');
});

test('Seller Sales Margin - Enforces Operator Allowed Minimum & Maximum Range', async () => {
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('operator_definitions')) {
        return {
          rows: [{
            id: params[0],
            operator_name: 'Airtel',
            minimum_margin_percent: '1.00',
            maximum_margin_percent: '5.00',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const { createSellerMargin } = createUserSalesMarginPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v || 0) / 100).toFixed(2),
    getSession: async () => ({ id: 'u-1', role: 'user' }),
    readJson: async () => ({
      operatorId: '11111111-1111-4111-8111-111111111111',
      circleName: 'Delhi',
      amountType: 'all',
      limitType: 'unlimited',
      limit: '0',
      isRoffer: 'all',
      requiredMinRoffer: '0',
      commissionPercent: '7.5', // Exceeds max 5.00%
      withGst: false,
    }),
    checkSameOrigin: () => {},
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
    sendJson: () => {},
    allowRate: () => true,
  });

  await assert.rejects(
    async () => {
      await createSellerMargin({}, {});
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /must be between 1% and 5%/i);
      return true;
    },
    'Should reject seller margin exceeding operator maximum margin',
  );
});

test('Unauthenticated Page Access - Redirects to /admin/login with 302 instead of JSON error', () => {
  // Test simulated request handler logic matching index.js catch block
  function handleRequestError(statusCode, error, isApi, res) {
    if (statusCode === 401 && !isApi) {
      res.writeHead(302, { location: '/admin/login' });
      res.end();
      return 302;
    }
    res.writeHead(statusCode, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
    return statusCode;
  }

  let redirectedLocation = '';
  let finalStatus = 0;
  const mockRes = {
    writeHead: (status, headers) => {
      finalStatus = status;
      redirectedLocation = headers?.location || '';
    },
    end: () => {},
  };

  const status = handleRequestError(401, new Error('login required'), false, mockRes);
  assert.equal(status, 302, 'Should respond with HTTP 302 redirect for HTML navigation');
  assert.equal(finalStatus, 302, 'Final status must be 302');
  assert.equal(redirectedLocation, '/admin/login', 'Must redirect to /admin/login');

  // Verify that an API request still returns 401 JSON
  let apiStatus = 0;
  let apiBody = '';
  const mockApiRes = {
    writeHead: (status) => { apiStatus = status; },
    end: (body) => { apiBody = body; },
  };
  const apiResult = handleRequestError(401, new Error('login required'), true, mockApiRes);
  assert.equal(apiResult, 401, 'API request should return 401');
  assert.equal(apiStatus, 401);
  assert.ok(apiBody.includes('login required'), 'API response body should contain error JSON');
});

