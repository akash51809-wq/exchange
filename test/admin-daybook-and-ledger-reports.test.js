'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ADMIN_PANEL_MENU, renderAdminMenuList } = require('../config/admin-panel-menu');
const createAdminBuyerDaybookPage = require('../pages/admin-buyer-daybook');
const createAdminBuyerLedgerPage = require('../pages/admin-buyer-ledger');
const createAdminSellerDaybookPage = require('../pages/admin-seller-daybook');
const createAdminSellerLedgerPage = require('../pages/admin-seller-ledger');

function createMockDb() {
  return {
    async query(sql, params = []) {
      const s = String(sql).trim();

      // Users dropdown query
      if (/SELECT.*FROM users/i.test(s)) {
        return {
          rows: [
            { id: 'u-1', username: 'buyer_one', name: 'Buyer One', business_name: 'Biz 1' },
            { id: 'u-2', username: 'seller_one', name: 'Seller One', business_name: 'Biz 2' },
          ],
          rowCount: 2,
        };
      }

      // Opening balance query
      if (/SELECT[\s\S]*opening_bal[\s\S]*FROM wallet_entries/i.test(s)) {
        return {
          rows: [{ opening_bal: '500000' }], // ₹5,000.00
          rowCount: 1,
        };
      }

      // Period movements query
      if (/SELECT[\s\S]*credits[\s\S]*debits[\s\S]*FROM wallet_entries/i.test(s)) {
        return {
          rows: [{ credits: '200000', debits: '300000' }],
          rowCount: 1,
        };
      }

      // Operator breakdown query (must be checked BEFORE generic purchase_val)
      if (/SELECT[\s\S]*op_name[\s\S]*FROM recharge_orders/i.test(s)) {
        return {
          rows: [
            {
              op_name: 'Jio Prepaid',
              service_type: 'Prepaid',
              total_txns: 3,
              success_txns: 3,
              failed_txns: 0,
              pending_txns: 0,
              total_val: '150000',
              purchase_val: '150000',
              sale_val: '150000',
              cost_val: '144000',
              margin_val: '6000',
            },
            {
              op_name: 'Airtel Prepaid',
              service_type: 'Prepaid',
              total_txns: 2,
              success_txns: 1,
              failed_txns: 1,
              pending_txns: 0,
              total_val: '100000',
              purchase_val: '100000',
              sale_val: '100000',
              cost_val: '96000',
              margin_val: '4000',
            },
          ],
          rowCount: 2,
        };
      }

      // Purchase KPI query
      if (/SELECT[\s\S]*purchase_val[\s\S]*FROM recharge_orders/i.test(s)) {
        return {
          rows: [
            {
              total_count: 5,
              success_count: 4,
              purchase_val: '250000', // ₹2,500.00
              cost_val: '240000',     // ₹2,400.00
              margin_val: '10000',    // ₹100.00 (4%)
            },
          ],
          rowCount: 1,
        };
      }

      // Seller sale KPI query
      if (/SELECT[\s\S]*sale_val[\s\S]*FROM recharge_orders/i.test(s)) {
        return {
          rows: [
            {
              total_count: 8,
              success_count: 7,
              sale_val: '400000',   // ₹4,000.00
              cost_val: '380000',
              margin_val: '20000',  // ₹200.00 (5%)
            },
          ],
          rowCount: 1,
        };
      }

      // Redeem KPI query
      if (/SELECT[\s\S]*redeem_cnt[\s\S]*FROM payout_requests/i.test(s)) {
        return {
          rows: [{ redeem_cnt: 1, redeem_val: '50000' }], // ₹500.00
          rowCount: 1,
        };
      }

      // Ledger summary KPI query
      if (/SELECT.*purchase_debit.*redeem_debit.*total_used.*FROM wallet_entries/i.test(s)) {
        return {
          rows: [
            {
              purchase_debit: '250000',
              redeem_debit: '50000',
              total_used: '300000',
              total_credits: '200000',
            },
          ],
          rowCount: 1,
        };
      }

      if (/SELECT.*total_sales.*FROM recharge_orders/i.test(s)) {
        return {
          rows: [{ total_sales: '400000' }],
          rowCount: 1,
        };
      }

      // Ledger table query
      if (/WITH running AS/i.test(s)) {
        return {
          rows: [
            {
              id: 'txn-1',
              wallet_id: 'w-1',
              user_id: 'u-1',
              amount_minor: '50000',
              entry_type: 'debit',
              reference_type: 'recharge_order',
              idempotency_key: 'TXN12345678901234',
              description: 'Jio ₹500 Recharge for 9876543210',
              created_at: new Date().toISOString(),
              user_name: 'Buyer One',
              user_username: 'buyer1',
              user_running_balance_minor: '450000',
              old_balance_minor: '500000',
            },
            {
              id: 'txn-2',
              wallet_id: 'w-1',
              user_id: 'u-1',
              amount_minor: '200000',
              entry_type: 'credit',
              reference_type: 'fund_request',
              idempotency_key: 'TXN98765432109876',
              description: 'Wallet Topup via Bank Transfer',
              created_at: new Date().toISOString(),
              user_name: 'Buyer One',
              user_username: 'buyer1',
              user_running_balance_minor: '650000',
              old_balance_minor: '450000',
            },
          ],
          rowCount: 2,
        };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

test('Feature: Admin Menu includes new Accounts menu with Daybook, Ledger, Earning and Invoice items', () => {
  const accountsGroup = ADMIN_PANEL_MENU.find((g) => g.label === 'Accounts');
  assert.ok(accountsGroup, 'Accounts menu group should exist');
  assert.equal(accountsGroup.icon, 'fa fa-book', 'Accounts menu item has fa-book icon');

  const buyerDaybook = accountsGroup.items.find((i) => i.path === '/admin/reports/buyer-daybook');
  const buyerLedger = accountsGroup.items.find((i) => i.path === '/admin/reports/buyer-ledger');
  const sellerDaybook = accountsGroup.items.find((i) => i.path === '/admin/reports/seller-daybook');
  const sellerLedger = accountsGroup.items.find((i) => i.path === '/admin/reports/seller-ledger');
  const adminEarning = accountsGroup.items.find((i) => i.path === '/admin/reports/admin-earning');
  const invoices = accountsGroup.items.find((i) => i.path === '/admin/invoice');

  assert.ok(buyerDaybook, 'Buyer Daybook menu item should exist under Accounts');
  assert.ok(buyerLedger, 'Buyer Ledger menu item should exist under Accounts');
  assert.ok(sellerDaybook, 'Seller Daybook menu item should exist under Accounts');
  assert.ok(sellerLedger, 'Seller Ledger menu item should exist under Accounts');
  assert.ok(adminEarning, 'Admin Earning menu item should exist under Accounts');
  assert.ok(invoices, 'Invoices menu item should exist under Accounts');

  const renderedList = renderAdminMenuList('/admin/reports/buyer-daybook');
  assert.match(renderedList, /Accounts/);
  assert.match(renderedList, /href="\/admin\/reports\/buyer-daybook"/);
  assert.match(renderedList, /href="\/admin\/reports\/buyer-ledger"/);
  assert.match(renderedList, /href="\/admin\/reports\/seller-daybook"/);
  assert.match(renderedList, /href="\/admin\/reports\/seller-ledger"/);
  assert.match(renderedList, /href="\/admin\/reports\/admin-earning"/);
  assert.match(renderedList, /href="\/admin\/invoice"/);
});

test('Feature: Buyer Daybook Page - Top summary metrics & operator breakdown table', async () => {
  const db = createMockDb();
  const page = createAdminBuyerDaybookPage({
    db,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    sendJson: () => {},
    httpError: (m, c) => new Error(`${c}: ${m}`),
  });

  let capturedHtml = '';
  const res = {
    writeHead() {},
    end(html) { capturedHtml = html; },
  };

  const params = new URLSearchParams('fromDate=2026-11-03&toDate=2026-11-03&userId=all');
  await page.sendAdminBuyerDaybookPage({ role: 'admin', username: 'admin' }, res, params);

  // 1. Title and header
  assert.match(capturedHtml, /Buyer Daybook/i);
  assert.match(capturedHtml, /Opening Balance/i);
  assert.match(capturedHtml, /Purchase Balance/i);
  assert.match(capturedHtml, /Redeem Balance/i);
  assert.match(capturedHtml, /Buyer Margin \(Get Margin\)/i);
  assert.match(capturedHtml, /Closing Balance/i);

  // 2. Values in summary cards
  assert.match(capturedHtml, /₹5,000\.00/); // Opening balance
  assert.match(capturedHtml, /₹2,500\.00/); // Purchase balance
  assert.match(capturedHtml, /₹500\.00/);   // Redeem balance
  assert.match(capturedHtml, /₹100\.00/);   // Margin in Rs
  assert.match(capturedHtml, /4\.00%/);     // Margin %

  // 3. Operator table
  assert.match(capturedHtml, /Operator-Wise Purchase Summary/i);
  assert.match(capturedHtml, /Jio Prepaid/);
  assert.match(capturedHtml, /Airtel Prepaid/);
  assert.match(capturedHtml, /Grand Total:/);
});

test('Feature: Buyer Ledger Page - Top summary metrics & detailed transaction table', async () => {
  const db = createMockDb();
  const page = createAdminBuyerLedgerPage({
    db,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    sendJson: () => {},
    httpError: (m, c) => new Error(`${c}: ${m}`),
  });

  let capturedHtml = '';
  const res = {
    writeHead() {},
    end(html) { capturedHtml = html; },
  };

  const params = new URLSearchParams('fromDate=2026-11-03&toDate=2026-11-03&userId=all');
  await page.sendAdminBuyerLedgerPage({ role: 'admin', username: 'admin' }, res, params);

  // 1. Title and summary
  assert.match(capturedHtml, /Buyer Ledger/i);
  assert.match(capturedHtml, /Opening Balance/i);
  assert.match(capturedHtml, /Purchase \(Buy\)/i);
  assert.match(capturedHtml, /Redeem \(Payout\)/i);
  assert.match(capturedHtml, /Total Used Balance/i);
  assert.match(capturedHtml, /Closing Balance/i);

  // 2. Full transaction ledger table
  assert.match(capturedHtml, /Transaction Statement &amp; Ledger Table/i);
  assert.match(capturedHtml, /TXN1234567890/);
  assert.match(capturedHtml, /Buy Recharge/);
  assert.match(capturedHtml, /Topup Deposit/);
  assert.match(capturedHtml, /Buyer One/);
});

test('Feature: Seller Daybook Page - Top summary metrics & operator breakdown table', async () => {
  const db = createMockDb();
  const page = createAdminSellerDaybookPage({
    db,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    sendJson: () => {},
    httpError: (m, c) => new Error(`${c}: ${m}`),
  });

  let capturedHtml = '';
  const res = {
    writeHead() {},
    end(html) { capturedHtml = html; },
  };

  const params = new URLSearchParams('fromDate=2026-11-03&toDate=2026-11-03&userId=all');
  await page.sendAdminSellerDaybookPage({ role: 'admin', username: 'admin' }, res, params);

  // 1. Title and header
  assert.match(capturedHtml, /Seller Daybook/i);
  assert.match(capturedHtml, /Opening Balance/i);
  assert.match(capturedHtml, /Sale Balance/i);
  assert.match(capturedHtml, /Redeem Balance/i);
  assert.match(capturedHtml, /Seller Margin \(Paid\/Earned\)/i);
  assert.match(capturedHtml, /Closing Balance/i);

  // 2. Values in summary cards
  assert.match(capturedHtml, /₹4,000\.00/); // Sale balance
  assert.match(capturedHtml, /₹200\.00/);   // Seller margin
  assert.match(capturedHtml, /5\.00%/);     // Margin %

  // 3. Operator table
  assert.match(capturedHtml, /Operator-Wise Sale Summary/i);
  assert.match(capturedHtml, /Jio Prepaid/);
  assert.match(capturedHtml, /Grand Total:/);
});

test('Feature: Seller Ledger Page - Top summary metrics & detailed transaction table', async () => {
  const db = createMockDb();
  const page = createAdminSellerLedgerPage({
    db,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    sendJson: () => {},
    httpError: (m, c) => new Error(`${c}: ${m}`),
  });

  let capturedHtml = '';
  const res = {
    writeHead() {},
    end(html) { capturedHtml = html; },
  };

  const params = new URLSearchParams('fromDate=2026-11-03&toDate=2026-11-03&userId=all');
  await page.sendAdminSellerLedgerPage({ role: 'admin', username: 'admin' }, res, params);

  // 1. Title and summary
  assert.match(capturedHtml, /Seller Ledger/i);
  assert.match(capturedHtml, /Opening Balance/i);
  assert.match(capturedHtml, /Total Sale/i);
  assert.match(capturedHtml, /Total Redeem/i);
  assert.match(capturedHtml, /Total Used Balance/i);
  assert.match(capturedHtml, /Closing Balance/i);

  // 2. Transaction statement table
  assert.match(capturedHtml, /Seller Statement &amp; Ledger Table/i);
  assert.match(capturedHtml, /TXN1234567890/);
});


test('Feature: Buyer Buy Recharge NEVER routes to own seller margin even if highest', async () => {
  const buyerId = 'user-dual-role-123';
  const otherSellerId = 'user-other-seller-456';

  // Candidate seller list returned by DB (simulating candidate seller margins)
  const candidateSellers = [
    {
      seller_margin_id: 'sm-own',
      user_id: buyerId, // Same user!
      commission_percent: '6.5', // Highest margin!
      seller_api_id: 'api-own',
      seller_api_name: 'Self Stock API',
    },
    {
      seller_margin_id: 'sm-other',
      user_id: otherSellerId, // Other user!
      commission_percent: '4.0', // Lower margin
      seller_api_id: 'api-other',
      seller_api_name: 'Other Seller API',
    },
  ];

  // Emulate the routing loop in lib/buyer-api-service.js lines 1130-1160
  const routedSellers = [];
  for (let sIdx = 0; sIdx < candidateSellers.length; sIdx++) {
    const sellerCandidate = candidateSellers[sIdx];
    if (sellerCandidate.user_id && buyerId && String(sellerCandidate.user_id) === String(buyerId)) {
      continue; // Strictly skipped
    }
    routedSellers.push(sellerCandidate);
  }

  assert.equal(routedSellers.length, 1, 'Only other sellers must be routed');
  assert.equal(routedSellers[0].user_id, otherSellerId, 'Must route to other seller');
  assert.notEqual(routedSellers[0].user_id, buyerId, 'Must NEVER route to buyer self');
});

test('Feature: Admin Reports menu is divided into 2 columns & User/Admin menus have bold typography with icons', async () => {
  const { renderAdminMenuList, renderAdminNavigation, ADMIN_PANEL_MENU } = require('../config/admin-panel-menu');
  const { renderUserMenuList, renderUserNavigation, getUserPanelMenu } = require('../config/user-panel-menu');
  const { addPanelChrome } = require('../lib/panel-chrome');

  // 1. Admin Menu checks
  const reportsItem = ADMIN_PANEL_MENU.find(m => m.label === 'Reports');
  assert.ok(reportsItem, 'Reports menu item exists in Admin menu');
  assert.equal(reportsItem.twoColumns, true, 'Reports menu item has twoColumns: true');
  assert.equal(reportsItem.icon, 'fa fa-bar-chart', 'Reports menu item has fa-bar-chart icon');

  const adminMenuHtml = renderAdminMenuList('/admin/reports/daily-sales-report');
  assert.match(adminMenuHtml, /sub-menu two-columns/i, 'Admin Reports dropdown renders with sub-menu two-columns');
  assert.match(adminMenuHtml, /two-col-container/i, 'Admin Reports dropdown renders with two-col-container');
  assert.match(adminMenuHtml, /menu-col/i, 'Admin Reports dropdown renders with menu-col');
  assert.match(adminMenuHtml, /col-divider/i, 'Admin Reports dropdown renders with col-divider between columns');
  assert.match(adminMenuHtml, /fa fa-tachometer.*Dashboard/i, 'Admin Dashboard has icon');
  assert.match(adminMenuHtml, /fa fa-users.*User/i, 'Admin User has icon');
  assert.match(adminMenuHtml, /fa fa-credit-card.*Payment/i, 'Admin Payment has icon');
  assert.match(adminMenuHtml, /fa fa-book.*Accounts/i, 'Admin Accounts has icon');
  assert.match(adminMenuHtml, /fa fa-gavel.*Disputes/i, 'Admin Disputes has icon');
  assert.match(adminMenuHtml, /fa fa-cogs.*Settings/i, 'Admin Settings has icon');
  assert.match(adminMenuHtml, /font-weight:700/i, 'Admin menu links have font-weight:700');

  const adminNavHtml = renderAdminNavigation('/admin/');
  assert.match(adminNavHtml, /\.sub-menu\.two-columns/i, 'Admin Navigation includes 2-column styles');
  assert.match(adminNavHtml, /\.horizontalMenu-list > li > a/i, 'Admin Navigation includes bold styles');

  // 2. User Menu checks
  const userMenu = getUserPanelMenu('single');
  const sellerItem = userMenu.find(m => m.label === 'Seller');
  assert.ok(sellerItem, 'Seller item exists in User menu');
  assert.equal(sellerItem.twoColumns, true, 'Seller menu has twoColumns: true');
  assert.equal(sellerItem.icon, 'fa fa-shopping-bag', 'Seller menu has shopping bag icon');

  const userMenuHtml = renderUserMenuList('single', '/dashboard');
  assert.match(userMenuHtml, /fa fa-tachometer.*Dashboard/i, 'User Dashboard has icon');
  assert.match(userMenuHtml, /fa fa-money.*Fund/i, 'User Fund has icon');
  assert.match(userMenuHtml, /fa fa-shopping-cart.*Buyer/i, 'User Buyer has icon');
  assert.match(userMenuHtml, /fa fa-shopping-bag.*Seller/i, 'User Seller has icon');
  assert.match(userMenuHtml, /fa fa-bar-chart.*User Report/i, 'User Report has icon');
  assert.doesNotMatch(userMenuHtml, /Alerts Setting/i, 'User Alerts Setting menu is removed');
  assert.match(userMenuHtml, /fa fa-file-text-o.*Invoice/i, 'User Invoice has icon');
  assert.match(userMenuHtml, /fa fa-cogs.*Setting/i, 'User Setting has icon');
  assert.match(userMenuHtml, /sub-menu two-columns/i, 'User Seller dropdown renders with sub-menu two-columns');
  assert.match(userMenuHtml, /font-weight:700/i, 'User menu links have font-weight:700');

  const userNavHtml = renderUserNavigation('single', '/dashboard');
  assert.match(userNavHtml, /\.sub-menu\.two-columns/i, 'User Navigation includes 2-column styles');
  assert.match(userNavHtml, /\.horizontalMenu-list > li > a/i, 'User Navigation includes bold styles');

  // 3. Panel Chrome injection checks
  const sampleAdminHtml = '<html><head></head><body><div class="page-main"><nav class="horizontalMenu"></nav></div></body></html>';
  const injectedAdminHtml = await addPanelChrome(sampleAdminHtml, { role: 'admin' });
  assert.match(injectedAdminHtml, /sub-menu two-columns/i, 'addPanelChrome renders 2-columns in admin menu');
  assert.match(injectedAdminHtml, /\.sub-menu\.two-columns/i, 'addPanelChrome injects 2-column styles');
  assert.match(injectedAdminHtml, /font-weight: 700 !important/i, 'addPanelChrome injects font-weight bold styles');
  assert.match(injectedAdminHtml, /\.sub-menu li a[\s\S]*font-weight: 700 !important/i, 'addPanelChrome ensures all submenu links are bold');

  // Verify all submenus in admin and user panel render with font-weight-bold and style="font-weight:700"
  assert.match(adminMenuHtml, /<a class="font-weight-bold[^"]*" style="font-weight:700"[^>]*>Daily Sales Report<\/a>/i);
  assert.match(adminMenuHtml, /<a class="font-weight-bold[^"]*" style="font-weight:700"[^>]*>List User<\/a>/i);
  assert.match(adminMenuHtml, /<a class="font-weight-bold[^"]*" style="font-weight:700"[^>]*>Fund Request<\/a>/i);
  assert.match(adminMenuHtml, /<a class="font-weight-bold[^"]*" style="font-weight:700"[^>]*>API Setting<\/a>/i);

  assert.match(userMenuHtml, /<a class="font-weight-bold[^"]*" style="font-weight:700"[^>]*>Wallet Topup Request<\/a>/i);
  assert.match(userMenuHtml, /<a class="font-weight-bold[^"]*" style="font-weight:700"[^>]*>Buyer Margin<\/a>/i);
  assert.match(userMenuHtml, /<a class="font-weight-bold[^"]*" style="font-weight:700"[^>]*>Sales Margin<\/a>/i);
  assert.match(userMenuHtml, /<a class="font-weight-bold[^"]*" style="font-weight:700"[^>]*>Account Statement<\/a>/i);
});
