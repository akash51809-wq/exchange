'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { USER_PANEL_MENU, renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createPageModule({ fs, fsp, path, adminUiRoot, adminAssetsRoot, sendJson }) {
  const ADMIN_UI_ROOT = adminUiRoot;
  const ADMIN_ASSETS_ROOT = adminAssetsRoot;
async function serveAdminUi(urlPath, method, response) {
  let root;
  let requestedPath;

  if (urlPath === '/admin' || urlPath === '/admin/') {
    root = ADMIN_UI_ROOT;
    requestedPath = 'index.html';
  } else if (urlPath === '/admin/login' || urlPath === '/login') {
    root = ADMIN_UI_ROOT;
    requestedPath = 'login-2.html';
  } else if (urlPath === '/admin/register' || urlPath === '/admin/signup' || urlPath === '/signup' || urlPath === '/register') {
    root = ADMIN_UI_ROOT;
    requestedPath = 'register-2.html';
  } else if (urlPath === '/admin/forgot-password' || urlPath === '/forgot-password') {
    root = ADMIN_UI_ROOT;
    requestedPath = 'forgot-password-2.html';
  } else if (urlPath.startsWith('/admin/')) {
    root = ADMIN_UI_ROOT;
    requestedPath = urlPath.slice('/admin/'.length);
  } else if (urlPath.startsWith('/assets/')) {
    root = ADMIN_ASSETS_ROOT;
    requestedPath = urlPath.slice('/assets/'.length);
  } else {
    return false;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestedPath);
  } catch {
    sendJson(response, 400, { error: 'पथ सही प्रारूप में नहीं है।' });
    return true;
  }

  const filePath = path.resolve(root, decodedPath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    sendJson(response, 404, { error: 'यह पृष्ठ उपलब्ध नहीं है।' });
    return true;
  }

  let fileInfo;
  try {
    fileInfo = await fsp.stat(filePath);
  } catch {
    sendJson(response, 404, { error: 'यह पृष्ठ उपलब्ध नहीं है।' });
    return true;
  }
  if (!fileInfo.isFile()) {
    sendJson(response, 404, { error: 'यह पृष्ठ उपलब्ध नहीं है।' });
    return true;
  }

  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.eot': 'application/vnd.ms-fontobject',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  const contentType = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  let htmlBody;
  if (root === ADMIN_UI_ROOT && path.extname(filePath).toLowerCase() === '.html') {
    htmlBody = await fsp.readFile(filePath, 'utf8');
    if (!htmlBody.includes('<script src="/auth-client.js"></script>')) {
      htmlBody = htmlBody.replace(/<\/body>/i, '<script src="/auth-client.js"></script>\n\t</body>');
    }
    if (!['login-2.html', 'register-2.html', 'forgot-password-2.html'].includes(path.basename(filePath))) {
      htmlBody = useFullWidthContainers(htmlBody);
      // Put the operational user list directly into the dashboard menu markup.
      // This keeps the entry visible even if the template's menu scripts fail
      // or the browser delays executing injected scripts.
      htmlBody = htmlBody.replace(
        /(<ul\s+class=["']horizontalMenu-list["'][^>]*>)/i,
        '$1\n<li data-exchange-user-list><a href="/admin/users/list">User List</a></li>',
      );
      const adminMenuScript = `<script>(()=>{const menu=document.querySelector('.horizontalMenu-list');if(!menu)return;if(!menu.querySelector('[data-exchange-users-menu]'))menu.insertAdjacentHTML('beforeend','<li aria-haspopup="true" data-exchange-users-menu><a href="#" class="sub-icon">User <i class="fa fa-angle-down horizontal-icon"></i></a><ul class="sub-menu"><li aria-haspopup="true"><a href="/admin/users/list">List User</a></li></ul></li>');if(!menu.querySelector('[data-exchange-payment-menu]'))menu.insertAdjacentHTML('beforeend','<li aria-haspopup="true" data-exchange-payment-menu><a href="#" class="sub-icon">Payment <i class="fa fa-angle-down horizontal-icon"></i></a><ul class="sub-menu"><li aria-haspopup="true"><a href="/admin/payment/fund-request">Fund Request</a></li></ul></li>');if(!menu.querySelector('[data-exchange-api-menu]'))menu.insertAdjacentHTML('beforeend','<li aria-haspopup="true" data-exchange-api-menu><a href="/admin/seller-api/requests">Request API Approval</a></li>');if(!menu.querySelector('[data-exchange-settings-menu]'))menu.insertAdjacentHTML('beforeend','<li aria-haspopup="true" data-exchange-settings-menu><a href="#" class="sub-icon">Settings <i class="fa fa-angle-down horizontal-icon"></i></a><ul class="sub-menu"><li aria-haspopup="true"><a href="/admin/settings/create-operator">Create Operator</a></li><li aria-haspopup="true"><a href="/admin/settings/show-operator">Show Operator</a></li><li aria-haspopup="true"><a href="/admin/settings/service-settings">Service Settings</a></li></ul></li>');})();</script>\n`;
      htmlBody = htmlBody.replace(/<\/body>/i, `${adminMenuScript}</body>`);
      htmlBody = await addPanelChrome(htmlBody, { role: 'admin' });
    }
  }
  const contentLength = htmlBody === undefined ? fileInfo.size : Buffer.byteLength(htmlBody);
  response.writeHead(200, {
    'content-type': contentType,
    'content-length': contentLength,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
  });
  if (method === 'HEAD') {
    response.end();
  } else if (htmlBody !== undefined) {
    response.end(htmlBody);
  } else {
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on('error', reject);
      response.on('finish', resolve);
      stream.pipe(response);
    });
  }
  return true;
}

  return { serveAdminUi };
};
