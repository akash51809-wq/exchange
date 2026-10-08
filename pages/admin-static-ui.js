'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { USER_PANEL_MENU, renderUserNavigation } = require('../config/user-panel-menu');
const { renderAdminMenuList } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const { sendNotFoundPage } = require('./not-found');

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

  function handleNotFound() {
    if (urlPath.startsWith('/assets/')) {
      sendJson(response, 404, { error: 'यह फाइल उपलब्ध नहीं है।' });
    } else {
      sendNotFoundPage(response, { requestedUrl: urlPath });
    }
    return true;
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
    return handleNotFound();
  }

  let fileInfo;
  try {
    fileInfo = await fsp.stat(filePath);
  } catch {
    return handleNotFound();
  }
  if (!fileInfo.isFile()) {
    return handleNotFound();
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
      // Replace any existing template menu list with only the created system menus
      if (/<nav\s+class=["']horizontalMenu[^"']*["'][^>]*>[\s\S]*?<\/nav>/i.test(htmlBody)) {
        htmlBody = htmlBody.replace(
          /<nav\s+class=["']horizontalMenu[^"']*["'][^>]*>[\s\S]*?<\/nav>/i,
          `<nav class="horizontalMenu clearfix"><ul class="horizontalMenu-list">${renderAdminMenuList(urlPath || '/admin/')}</ul></nav>`,
        );
      } else {
        htmlBody = htmlBody.replace(
          /<ul\s+class=["']horizontalMenu-list["'][^>]*>[\s\S]*?<\/ul>/i,
          `<ul class="horizontalMenu-list">${renderAdminMenuList(urlPath || '/admin/')}</ul>`,
        );
      }
      htmlBody = await addPanelChrome(htmlBody, { role: 'admin', currentPath: urlPath || '/admin/' });
    } else {
      // Replace logo, favicon in login, register, and forgot-password pages
      htmlBody = htmlBody
        .replace(/src=["'][^"']*assets\/images\/brand\/(?:favicon|logo(?:-[0-9]+)?)\.png["']/gi, 'src="/api/logo"')
        .replace(/class=["']header-brand-img dark-logo["']/gi, 'class="header-brand-img dark-logo" style="max-height:55px;max-width:220px;object-fit:contain;"')
        .replace(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/gi, '<link rel="icon" type="image/x-icon" href="/api/favicon">');
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
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://api.postalpincode.in; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
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
