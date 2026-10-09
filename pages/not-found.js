'use strict';

const { escapeHtml } = require('../lib/page-utils');

/**
 * Generates the HTML for the 404 Not Found error page banner.
 * Uses the Zendash UI assets and the official 404.svg vector illustration.
 */
function renderNotFoundHtml({ requestedUrl = '', session = null } = {}) {
  const safeUrl = escapeHtml(requestedUrl || '');
  const dashboardLink = session && session.role === 'admin' ? '/admin/' : '/dashboard';
  const roleName = session ? (session.role === 'admin' ? 'Admin' : 'User') : 'Guest';

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=0">
  <title>404 - Page Not Found</title>
  
  <!-- Favicon -->
  <link rel="icon" href="/assets/images/brand/favicon.ico" type="image/x-icon">

  <!-- Bootstrap css -->
  <link href="/assets/plugins/bootstrap/css/bootstrap.css" rel="stylesheet">

  <!-- Style css -->
  <link href="/assets/css/style.css" rel="stylesheet">
  <link href="/assets/css/dark.css" rel="stylesheet">
  <link href="/assets/css/skins.css" rel="stylesheet">

  <!-- Icons css -->
  <link href="/assets/css/icons.css" rel="stylesheet">

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">

  <style>
    * { box-sizing: border-box; }
    body.error-404-body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f1f5f9;
      color: #334155;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 30px 15px;
      margin: 0;
    }
    .error-card-container {
      max-width: 860px;
      width: 100%;
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
      border: 1px solid #e2e8f0;
      overflow: hidden;
      text-align: center;
      padding: 40px 30px 45px;
      position: relative;
    }
    .error-card-container::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 6px;
      background: linear-gradient(90deg, #4454c3 0%, #0ea5e9 50%, #f59e0b 100%);
    }
    .banner-wrapper {
      max-width: 440px;
      margin: 0 auto 24px;
      padding: 10px;
    }
    .error-banner-svg {
      width: 100%;
      height: auto;
      max-height: 240px;
      object-fit: contain;
      filter: drop-shadow(0 8px 16px rgba(68, 84, 195, 0.12));
    }
    .error-title-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #fee2e2;
      color: #dc2626;
      border: 1px solid #fecaca;
      border-radius: 30px;
      padding: 6px 18px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .error-headline {
      font-size: 32px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }
    .error-subtext {
      font-size: 16px;
      color: #64748b;
      max-width: 580px;
      margin: 0 auto 20px;
      line-height: 1.6;
    }
    .error-url-box {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      padding: 8px 16px;
      max-width: 100%;
      margin-bottom: 28px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13.5px;
      color: #475569;
      word-break: break-all;
    }
    .btn-action-group {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .btn-action-primary {
      background: linear-gradient(135deg, #4454c3 0%, #2f3ba2 100%);
      color: #ffffff !important;
      font-weight: 700;
      font-size: 15px;
      padding: 12px 28px;
      border-radius: 10px;
      border: none;
      box-shadow: 0 4px 15px rgba(68, 84, 195, 0.3);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .btn-action-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(68, 84, 195, 0.45);
    }
    .btn-action-secondary {
      background: #ffffff;
      color: #334155 !important;
      font-weight: 600;
      font-size: 15px;
      padding: 12px 22px;
      border-radius: 10px;
      border: 1px solid #cbd5e1;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-action-secondary:hover {
      background: #f8fafc;
      border-color: #94a3b8;
    }
    .footer-support {
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #f1f5f9;
      font-size: 13px;
      color: #94a3b8;
    }
  </style>
</head>
<body class="error-404-body">

  <div class="error-card-container">
    
    <!-- 404 Vector Banner Illustration -->
    <div class="banner-wrapper">
      <img src="/assets/images/svgs/404.svg" alt="404 Page Not Found" class="error-banner-svg">
    </div>

    <!-- Error Badge -->
    <div class="error-title-badge">
      <i class="fa fa-exclamation-triangle"></i> 404 ERROR - PAGE NOT FOUND
    </div>

    <!-- Headline -->
    <h1 class="error-headline">Page Not Found</h1>
    
    <!-- Explanation in English -->
    <p class="error-subtext">
      Sorry, the page or link you are looking for does not exist on this server, has been removed, or the URL has changed.
    </p>

    <!-- Requested URL Box -->
    ${safeUrl ? `
    <div class="error-url-box">
      <span class="badge badge-secondary" style="font-size:11px;">REQUESTED PATH</span>
      <code>${safeUrl}</code>
    </div>
    ` : ''}

    <!-- Action Buttons -->
    <div class="btn-action-group">
      <a href="${dashboardLink}" class="btn-action-primary">
        <i class="fa fa-home"></i> Go to Dashboard
      </a>
      <button type="button" class="btn-action-secondary" onclick="window.history.length > 1 ? window.history.back() : window.location.href='/'">
        <i class="fa fa-arrow-left"></i> Go Back
      </button>
      <a href="/admin/login" class="btn-action-secondary">
        <i class="fa fa-sign-in"></i> Login Page
      </a>
    </div>

    <div class="footer-support">
      <span>Exchange Portal System &bull; Error Code: HTTP 404 (Not Found) &bull; Session: ${escapeHtml(roleName)}</span>
    </div>

  </div>

</body>
</html>`;
}

/**
 * Sends a 404 Not Found response with the banner page
 */
function sendNotFoundPage(response, { requestedUrl = '', session = null } = {}) {
  const html = renderNotFoundHtml({ requestedUrl, session });
  response.writeHead(404, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
  response.end(html);
}

module.exports = {
  renderNotFoundHtml,
  sendNotFoundPage,
};
