'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { getWalletMode } = require('../lib/wallet-helper');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createUserPlaceholderPages({ db }) {
  async function sendUserPanelPage(user, page, response) {
    const templatePath = path.join(__dirname, 'user', page.template);
    const walletMode = db ? await getWalletMode(db).catch(() => 'single') : 'single';
    const currentPath = page.path || '';
    let html = await fsp.readFile(templatePath, 'utf8');
    html = html
      .replaceAll('{{PAGE_TITLE}}', escapeHtml(page.title))
      .replaceAll('{{USER_NAME}}', escapeHtml(user.name))
      .replaceAll('{{USER_ID}}', escapeHtml(user.username))
      .replaceAll('{{USER_MENU}}', renderUserNavigation(walletMode, currentPath));
    html = useFullWidthContainers(html);
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'${page.template === 'seller-api-setting.html' ? ' https:' : ''}; object-src 'none'; base-uri 'self'; frame-ancestors 'none';`,
    });
    response.end(await addPanelChrome(html, { role: 'user', userId: user.id, db, currentPath }));
  }

  return { sendUserPanelPage };
};
