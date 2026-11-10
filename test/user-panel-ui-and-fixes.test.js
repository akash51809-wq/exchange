'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { convertRupeesToWords } = require('../lib/amount-words');
const { resolveLocation, resolveLocationAsync } = require('../lib/user-agent-parser');
const { getUserPanelMenu, renderUserNavigation, USER_PANEL_PAGES } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

const createUserWalletTopupPage = require('../pages/user-wallet-topup');
const createUserFundRedeemPage = require('../pages/user-fund-redeem');
const createUserKycPage = require('../pages/user-kyc');
const createUserIpLogPage = require('../pages/user-ip-log');
const createUserInvoicePages = require('../pages/user-invoice');
const createUserPlaceholderPages = require('../pages/user-placeholder');

const noopDb = {
  async query(sql) {
    if (/website_settings/i.test(sql)) {
      return { rows: [{ wallet_mode: 'single', website_name: 'Exchange' }], rowCount: 1 };
    }
    if (/user_bank_accounts/i.test(sql)) {
      return {
        rows: [{
          id: 'bank-1', bank_name: 'SBI', account_holder_name: 'Demo',
          account_number: '1234567890', ifsc_code: 'SBIN0001234', status: 'approved',
        }],
        rowCount: 1,
      };
    }
    if (/FROM user_kyc/i.test(sql)) {
      return { rows: [{ status: 'approved' }], rowCount: 1 };
    }
    if (/FROM buyer_gst_invoices|FROM seller_gst_invoices/i.test(sql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/wallets/i.test(sql)) {
      return { rows: [{ balance_minor: '500000', buyer_balance_minor: '250000', seller_balance_minor: '250000' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  },
};

test('convertRupeesToWords converts amounts accurately into Indian Rupees in Words', () => {
  assert.equal(convertRupeesToWords('500'), 'Rupees Five Hundred Only');
  assert.equal(convertRupeesToWords('5000'), 'Rupees Five Thousand Only');
  assert.equal(convertRupeesToWords('125000'), 'Rupees One Lakh Twenty Five Thousand Only');
  assert.equal(convertRupeesToWords('10000000'), 'Rupees One Crore Only');
  assert.equal(convertRupeesToWords('1234.50'), 'Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only');
  assert.equal(convertRupeesToWords(''), '');
  assert.equal(convertRupeesToWords('0'), '');
});

test('User Wallet Topup Page - Payment modes, Rupees in words, Right button, No Wallet Type, Clean Menu Bar', async () => {
  const { sendWalletTopupRequestPage } = createUserWalletTopupPage({
    db: noopDb,
    formatMinorUnits: (m) => (Number(m || 0) / 100).toFixed(2),
    getGeneralSettings: async () => ({ fundRequestMinAmountEnabled: false }),
  });

  let html = '';
  await sendWalletTopupRequestPage({ id: 'u-1', name: 'Test User', username: '9999999999', role: 'user' }, {
    writeHead() {},
    end(c) { html = String(c); },
  });

  // Payment modes
  assert.match(html, /<option value="NEFT">NEFT<\/option>/i);
  assert.match(html, /<option value="RTGS">RTGS<\/option>/i);
  assert.match(html, /<option value="IMPS">IMPS<\/option>/i);
  assert.match(html, /<option value="UPI">UPI<\/option>/i);
  assert.match(html, /<option value="Cash in Bank">Cash in Bank<\/option>/i);

  // Wallet type removed
  assert.doesNotMatch(html, /id="topup-wallet-type"/i);

  // Amount in words live container + helper
  assert.match(html, /id="topup-amount-words"/i);
  assert.match(html, /bindAmountWordsDisplay\('topup-amount', 'topup-amount-words'\)/i);

  // Right-side page header wrapper and clean full-width nav + horizontal.js
  assert.match(html, /class="page-rightheader[^"]*"[\s\S]*data-target="#wallet-topup-modal"/i);
  assert.doesNotMatch(html, /font-awesome\/6\./i, 'Should not load conflicting FA6 CDN');
  assert.match(html, /horizontal-menu\/horizontal\.js/i);
  assert.match(html, /horizontal-mainwrapper container-fluid/i);
});

test('User Fund Redeem Page - Displays live Rupees in Words for payout amount', async () => {
  const { sendUserFundRedeemPage } = createUserFundRedeemPage({
    db: noopDb,
    formatMinorUnits: (m) => (Number(m || 0) / 100).toFixed(2),
    getGeneralSettings: async () => ({}),
  });

  let html = '';
  await sendUserFundRedeemPage({ id: 'u-1', name: 'Test User', username: '9999999999', role: 'user' }, {
    writeHead() {},
    end(c) { html = String(c); },
  }, new URLSearchParams(''));

  assert.match(html, /id="payout-amount-words"/i);
  assert.match(html, /bindAmountWordsDisplay\('payoutAmount', 'payout-amount-words'\)/i);
  assert.match(html, /__updateWordsDisplay/i);
  assert.match(html, /horizontal-mainwrapper container-fluid/i);
});

test('User KYC, IP Log, and Invoice Pages - All include top Horizontal Navigation Bar without disturbance', async () => {
  const user = { id: 'u-1', name: 'Test User', username: '9999999999', role: 'user' };

  // 1. KYC Page
  const { sendUserKycPage } = createUserKycPage({ db: noopDb });
  let kycHtml = '';
  await sendUserKycPage(user, { writeHead() {}, end(c) { kycHtml = String(c); } });
  assert.match(kycHtml, /<nav class="horizontalMenu clearfix">/i, 'KYC page must include horizontalMenu');
  assert.match(kycHtml, /horizontal-menu\/horizontal\.js/i, 'KYC page must load horizontal.js');
  assert.match(kycHtml, /jquery-3\.5\.1\.min\.js/i, 'KYC page must load jQuery');

  // 2. IP Log Page
  const { sendUserIpLogPage } = createUserIpLogPage({ db: noopDb, sendJson: () => {}, httpError: () => new Error() });
  let ipLogHtml = '';
  await sendUserIpLogPage(user, { writeHead() {}, end(c) { ipLogHtml = String(c); } }, new URLSearchParams(''));
  assert.match(ipLogHtml, /<nav class="horizontalMenu clearfix">/i, 'IP Log page must include horizontalMenu');
  assert.match(ipLogHtml, /horizontal-menu\/horizontal\.js/i, 'IP Log page must load horizontal.js');
  assert.doesNotMatch(ipLogHtml, /sidebar-mini/i, 'IP Log must not use sidebar-mini body class');
  assert.doesNotMatch(ipLogHtml, /class="app-content/i, 'IP Log must not use app-content margin class');

  // 3. Invoice Pages (Buyer GST, Seller GST, Buyer Commission)
  const { sendUserInvoicePage } = createUserInvoicePages({ db: noopDb, formatMinorUnits: () => '0.00' });
  for (const invType of ['buyer-gst', 'seller-gst', 'buyer-commission']) {
    let invHtml = '';
    await sendUserInvoicePage(user, invType, { writeHead() {}, end(c) { invHtml = String(c); } }, new URLSearchParams(''));
    assert.match(invHtml, /<nav class="horizontalMenu clearfix">/i, `${invType} invoice must include horizontalMenu`);
    assert.match(invHtml, /horizontal-mainwrapper container-fluid/i, `${invType} invoice must use full-width nav container`);
    assert.match(invHtml, /horizontal-menu\/horizontal\.js/i, `${invType} invoice must include horizontal.js`);
  }
});

test('User Navigation removes Alerts Setting and addPanelChrome injects nav fallback when absent', async () => {
  const menu = getUserPanelMenu('single');
  assert.equal(menu.some((m) => m.label === 'Alerts Setting'), false, 'Alerts Setting must be removed from user menu');

  const navHtml = renderUserNavigation('single', '/dashboard');
  assert.doesNotMatch(navHtml, /Alerts Setting/i);

  const barePage = '<html><head></head><body><div class="page"><div class="page-main"><div class="container">Hello</div></div></div></body></html>';
  const chromeInjected = await addPanelChrome(barePage, { role: 'user', userId: 'u-1', db: noopDb, currentPath: '/dashboard' });
  assert.match(chromeInjected, /<nav class="horizontalMenu clearfix">/i, 'addPanelChrome must auto-inject nav menu if missing');
});

test('User /setting/error-list Page - Renders formatted API error code directory', async () => {
  const { sendUserPanelPage } = createUserPlaceholderPages({ db: noopDb });
  const pageDef = USER_PANEL_PAGES.get('/setting/error-list');
  assert.ok(pageDef, '/setting/error-list route must exist in USER_PANEL_PAGES');

  let errHtml = '';
  await sendUserPanelPage(
    { id: 'u-1', name: 'Test User', username: '9999999999', role: 'user' },
    pageDef,
    { writeHead() {}, end(c) { errHtml = String(c); } }
  );

  assert.match(errHtml, /API Response &amp; Error Code List/i);
  for (const code of ['145', '106', '107', '109', '110', '128', '142', '160', '242', '270', 'ERR_CALL', 'ERR_SERVER']) {
    assert.ok(errHtml.includes(`>${code}<`), `Error list must include code ${code}`);
  }
  assert.match(errHtml, /id="errSearchInput"/i, 'Error list must include interactive search box');
});

test('GeoIP Location Resolution - Never leaks stale profile city on public IPs and handles local/edge headers', async () => {
  // Stale profile city ("North East Delhi") must NOT be stamped on a public IP
  const staleProfile = { city: 'North East Delhi', state: 'Delhi' };
  const syncLoc = resolveLocation('49.43.120.115', staleProfile);
  assert.doesNotMatch(syncLoc, /North East Delhi/i, 'Public IP sync fallback must not leak stale profile city');

  // Localhost returns Development Server
  assert.equal(await resolveLocationAsync('127.0.0.1'), 'Localhost / Development Server');

  // Trusted edge header returns exact city/region
  const headerLoc = await resolveLocationAsync('49.43.120.115', {
    'cf-ipcity': 'Prayagraj',
    'cf-region': 'Uttar Pradesh',
    'cf-ipcountry': 'IN',
  });
  assert.equal(headerLoc, 'Prayagraj, Uttar Pradesh, India');
});
