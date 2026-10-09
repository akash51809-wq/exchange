'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { USER_PANEL_MENU, renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const { getWalletMode } = require('../lib/wallet-helper');

module.exports = function createPageModule({ db, adminUiRoot }) {
  const ADMIN_UI_ROOT = adminUiRoot;
async function sendUserDashboard(user, response) {
  const walletMode = await getWalletMode(db);
  const result = await db.query(
    "SELECT balance_minor, buyer_balance_minor, seller_balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR'",
    [user.id]
  );
  const row = result.rows[0] || {};
  const totalBalance = BigInt(row.balance_minor || 0);
  const totalRupees = (totalBalance / 100n).toString() + '.' + String(totalBalance % 100n).padStart(2, '0');
  const buyerBalance = BigInt(row.buyer_balance_minor || 0);
  const buyerRupees = (buyerBalance / 100n).toString() + '.' + String(buyerBalance % 100n).padStart(2, '0');
  const sellerBalance = BigInt(row.seller_balance_minor || 0);
  const sellerRupees = (sellerBalance / 100n).toString() + '.' + String(sellerBalance % 100n).padStart(2, '0');

  const dashboardPath = path.join(ADMIN_UI_ROOT, 'index.html');
  let html = await fsp.readFile(dashboardPath, 'utf8');
  const menuStart = html.indexOf('<!-- Horizontal-menu -->');
  const menuEnd = html.indexOf('<!-- Horizontal-menu end -->', menuStart);
  if (menuStart >= 0 && menuEnd >= 0) {
    html = html.slice(0, menuStart) + renderUserNavigation() + html.slice(menuEnd + '<!-- Horizontal-menu end -->'.length);
  }
  html = useFullWidthContainers(html);

  const bannerText = walletMode === 'separate'
    ? `User ID: ${escapeHtml(user.username)} · 🛒 Buyer Wallet: ₹${buyerRupees} (For Recharge) · 📈 Seller Wallet: ₹${sellerRupees} (Sales Earnings & Redeem)`
    : `User ID: ${escapeHtml(user.username)} · Wallet balance: ₹${totalRupees}. Live recharge and account overview.`;

  html = html
    .replace('<title>Exchange - Recharge Admin</title>', '<title>Exchange - Recharge Dashboard</title>')
    .replaceAll('Logan Oliver', escapeHtml(user.name))
    .replace('Manage Director', 'User Account')
    .replace(
      'Dashboard preview: figures are sample data. Live recharge and account data are not connected yet.',
      bannerText,
    )
    .replace(/href="([^"#][^"]*\.html(?:#[^"]*)?)"/gi, (match, target) => {
      if (/^(?:\/|[a-z][a-z\d+.-]*:)/i.test(target)) return match;
      return 'href="' + (target.toLowerCase() === 'index.html' ? '/dashboard' : '/admin/' + target) + '"';
    });
  html = html.replace(
    /(<div class="dropdown-menu dropdown-menu-right dropdown-menu-arrow animated p-0">)[\s\S]*?(<\/div>\s*<\/div>)/,
    '$1<div class="text-center border-bottom pb-4 pt-4"><a href="#" class="text-center user pb-0 font-weight-bold">' + escapeHtml(user.name) + '</a><p class="text-center user-semi-title mb-0">User Account</p></div><a id="logout-button" class="dropdown-item border-bottom" href="/admin/login"><i class="dropdown-icon mdi mdi-logout-variant"></i> Sign out</a>$2',
  );
  if (!html.includes('<script src="/auth-client.js"></script>')) {
    html = html.replace(/<\/body>/i, '<script src="/auth-client.js"></script>\n\t</body>');
  }
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
  });
  response.end(await addPanelChrome(html, { role: 'user', userId: user.id, db }));
}

  return { sendUserDashboard };
};
