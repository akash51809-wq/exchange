'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { USER_PANEL_MENU, renderUserNavigation } = require('../config/user-panel-menu');
const { renderAdminMenuList } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const { sendNotFoundPage } = require('./not-found');

module.exports = function createPageModule({ fs, fsp, path, adminUiRoot, adminAssetsRoot, sendJson, db }) {
  const ADMIN_UI_ROOT = adminUiRoot;
  const ADMIN_ASSETS_ROOT = adminAssetsRoot;
async function serveAdminUi(urlPath, method, response) {
  let root;
  let requestedPath;

  if (urlPath === '/admin' || urlPath === '/admin/') {
    root = ADMIN_UI_ROOT;
    requestedPath = 'index.html';
  } else if (urlPath === '/admin/login' || urlPath === '/user/login' || urlPath === '/login') {
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
      sendJson(response, 404, { error: 'File not found.' });
    } else {
      sendNotFoundPage(response, { requestedUrl: urlPath });
    }
    return true;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestedPath);
  } catch {
    sendJson(response, 400, { error: 'Invalid path format.' });
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

      if (path.basename(filePath) === 'login-2.html') {
        const isUserPortal = urlPath === '/user/login' || urlPath === '/login';
        if (isUserPortal) {
          htmlBody = htmlBody
            .replace(/<title>[\s\S]*?<\/title>/i, '<title>User Login - Exchange Platform</title>')
            .replace(/<h2>Login<\/h2>/i, '<h2>User Login</h2>')
            .replace(/href=["']\/admin\/login["']/gi, 'href="/user/login"');
        } else {
          htmlBody = htmlBody
            .replace(/<title>[\s\S]*?<\/title>/i, '<title>Admin Login - Exchange</title>')
            .replace(/<h2>Login<\/h2>/i, '<h2>Admin Login</h2>')
            .replace(/<div class="text-center mt-7">[\s\S]*?<\/div>\s*<\/div>/i, '</div>');
        }

        // Clean layout styles: eliminate blue box, prevent scroll down, and fit side banner cleanly
        const cleanLoginStyles = `
        <style id="login-clean-layout">
          html, body.custom-page1 {
            height: 100vh !important;
            max-height: 100vh !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .d-md-flex {
            height: 100vh !important;
            max-height: 100vh !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: row !important;
          }
          .w-40.h-100vh {
            flex: 0 0 420px !important;
            width: 420px !important;
            max-width: 100% !important;
            height: 100vh !important;
            max-height: 100vh !important;
            overflow-y: auto !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            padding: 24px 36px !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            box-shadow: 4px 0 24px rgba(0, 0, 0, 0.05) !important;
            z-index: 10 !important;
          }
          .w-40 .page-single-content {
            margin: auto 0 !important;
            width: 100% !important;
          }
          .w-40 .card-body {
            padding: 0 !important;
            margin: 0 !important;
          }
          .w-40 .mt-lg-9 {
            margin-top: 0 !important;
          }
          /* Remove right-side blue box completely */
          .bg-style {
            background: #f1f5f9 !important;
          }
          .bg-style:before {
            display: none !important;
            background: transparent !important;
            content: none !important;
          }
          .w-80.bg-style {
            flex: 1 1 auto !important;
            width: calc(100% - 420px) !important;
            height: 100vh !important;
            max-height: 100vh !important;
            overflow: hidden !important;
            background: #f1f5f9 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 20px !important;
            box-sizing: border-box !important;
            position: relative !important;
          }
          .w-80.bg-style .page-single-content,
          .w-80.bg-style .card-body,
          .w-80.bg-style .row,
          .w-80.bg-style [class*="col-"] {
            width: 100% !important;
            height: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .custom-body1 {
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0 !important;
            margin: 0 !important;
            text-align: center !important;
          }
          .login-side-banner-img {
            max-width: 100% !important;
            max-height: 94vh !important;
            width: auto !important;
            height: auto !important;
            object-fit: contain !important;
            border-radius: 12px !important;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
            display: block !important;
          }
          @media (max-width: 767px) {
            .w-40.h-100vh {
              width: 100% !important;
              flex: 0 0 100% !important;
              padding: 24px 20px !important;
            }
            .w-80.bg-style {
              display: none !important;
            }
          }
        </style>
        `;
        htmlBody = htmlBody.replace(/<\/head>/i, cleanLoginStyles + '\n</head>');

        // Always show the side banner image instead of the blue text box
        htmlBody = htmlBody.replace(
          /<div class="custom-body1">[\s\S]*?<\/div>/i,
          `<div class="custom-body1">
            <img src="/api/login-side-image" alt="Login Graphic" class="login-side-banner-img" onerror="this.onerror=null;this.src='/assets/images/photos/custom-2.jpg';">
          </div>`
        );

        if (db) {
          try {
            const res = await db.query(
            `SELECT (login_side_image_data IS NOT NULL) AS has_side_image,
                    login_side_image_enabled,
                    (login_popup_image_data IS NOT NULL) AS has_popup,
                    login_popup_enabled,
                    login_popup_link
             FROM website_settings WHERE id = 1 LIMIT 1`
          );
          if (res.rowCount > 0) {
            const row = res.rows[0];
            if (row.login_side_image_enabled === false) {
              htmlBody = htmlBody.replace(/<\/head>/i, `<style>.w-80.bg-style { display: none !important; } .w-40.h-100vh { flex: 0 0 100% !important; width: 100% !important; margin: auto !important; max-width: 480px !important; }</style>\n</head>`);
            }
            if (row.has_popup && row.login_popup_enabled) {
              const link = row.login_popup_link ? String(row.login_popup_link).trim() : '';
              const linkOpen = link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" style="display:block;cursor:pointer;">` : '';
              const linkClose = link ? `</a>` : '';
              const popupHtml = `
              <!-- Login Notice Modal -->
              <div id="loginNoticeModal" style="display:flex;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.75);z-index:999999;align-items:center;justify-content:center;padding:16px;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);">
                <div style="position:relative;background:#ffffff;border-radius:12px;max-width:550px;width:100%;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);overflow:hidden;">
                  <button type="button" id="closeLoginNoticeModal" style="position:absolute;top:10px;right:10px;z-index:10;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,0.65);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;" aria-label="Close">&times;</button>
                  ${linkOpen}
                    <img src="/api/login-popup-image" alt="Notice" style="width:100%;height:auto;display:block;max-height:80vh;object-fit:contain;">
                  ${linkClose}
                </div>
              </div>
              <script>
                (function(){
                  var m = document.getElementById('loginNoticeModal');
                  var c = document.getElementById('closeLoginNoticeModal');
                  if(m && c){
                    c.onclick = function(){ m.style.display = 'none'; };
                    m.onclick = function(e){ if(e.target === m) m.style.display = 'none'; };
                  }
                })();
              </script>
              `;
              htmlBody = htmlBody.replace(/<\/body>/i, popupHtml + '\n</body>');
            }
          }
        } catch (_) {}
      }
    }
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
