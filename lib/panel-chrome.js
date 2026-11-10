'use strict';

const { renderAdminMenuList } = require('../config/admin-panel-menu');
const { renderUserMenuList, renderUserNavigation } = require('../config/user-panel-menu');
const { getWalletMode } = require('./wallet-helper');

function formatRupees(minorValue) {
  const minor = BigInt(minorValue || 0);
  return `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;
}

async function addPanelChrome(html, { role, userId, db, currentPath, impersonatedBy }) {
  if (role === 'admin') {
    if (/<nav\s+class=["']horizontalMenu[^"']*["'][^>]*>[\s\S]*?<\/nav>/i.test(html)) {
      html = html.replace(
        /<nav\s+class=["']horizontalMenu[^"']*["'][^>]*>[\s\S]*?<\/nav>/i,
        `<nav class="horizontalMenu clearfix"><ul class="horizontalMenu-list">${renderAdminMenuList(currentPath || '')}</ul></nav>`,
      );
    } else if (html.includes('horizontalMenu-list')) {
      html = html.replace(
        /<ul\s+class=["']horizontalMenu-list["'][^>]*>[\s\S]*?<\/ul>/i,
        `<ul class="horizontalMenu-list">${renderAdminMenuList(currentPath || '')}</ul>`,
      );
    }
  } else if (role === 'user') {
    const walletMode = db ? await getWalletMode(db) : 'single';
    if (/<nav\s+class=["']horizontalMenu[^"']*["'][^>]*>[\s\S]*?<\/nav>/i.test(html)) {
      html = html.replace(
        /<nav\s+class=["']horizontalMenu[^"']*["'][^>]*>[\s\S]*?<\/nav>/i,
        `<nav class="horizontalMenu clearfix"><ul class="horizontalMenu-list">${renderUserMenuList(walletMode, currentPath || '')}</ul></nav>`,
      );
    } else if (html.includes('horizontalMenu-list')) {
      html = html.replace(
        /<ul\s+class=["']horizontalMenu-list["'][^>]*>[\s\S]*?<\/ul>/i,
        `<ul class="horizontalMenu-list">${renderUserMenuList(walletMode, currentPath || '')}</ul>`,
      );
    } else {
      // Safety fallback: ensure navigation menu is NEVER missing from any user panel page
      const fallbackNav = renderUserNavigation(walletMode, currentPath || '');
      if (/<div\s+class=["']page-main["'][^>]*>/i.test(html)) {
        html = html.replace(/(<div\s+class=["']page-main["'][^>]*>)/i, `$1\n${fallbackNav}`);
      } else if (/<body[^>]*>/i.test(html)) {
        html = html.replace(/(<body[^>]*>)/i, `$1\n${fallbackNav}`);
      }
    }
  }

  // Ensure FontAwesome 4 icons CSS is always available for horizontal menu icons
  if (/<head>/i.test(html) && !/font-awesome\.min\.css|icons\.css/i.test(html)) {
    html = html.replace(/<head>/i, '<head>\n  <link rel="stylesheet" href="/assets/css/icons.css">');
  }

  // Update favicon and template brand logos dynamically
  if (/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i.test(html)) {
    html = html.replace(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i, '<link rel="icon" type="image/x-icon" href="/api/favicon">');
  } else if (/<head>/i.test(html)) {
    html = html.replace(/<head>/i, '<head>\n  <link rel="icon" type="image/x-icon" href="/api/favicon">');
  }
  html = html.replace(/src=["'][^"']*assets\/images\/brand\/logo(?:-[0-9]+)?\.png["']/gi, 'src="/api/logo"');

  if (html.includes('id="exchange-fixed-strip"')) return html;
  let rightContent = '';
  let impersonationBadge = '';
  if (role === 'user' && userId && db) {
    let isImpersonated = Boolean(impersonatedBy);
    if (!isImpersonated) {
      try {
        const impCheck = await db.query(
          "SELECT s.impersonated_by FROM user_sessions s WHERE s.user_id = $1 AND s.impersonated_by IS NOT NULL AND s.revoked_at IS NULL AND s.expires_at > now() LIMIT 1",
          [userId]
        );
        if (impCheck.rows && impCheck.rows.length > 0) isImpersonated = true;
      } catch (_) {}
    }
    if (isImpersonated) {
      impersonationBadge = `<div class="exchange-strip-impersonate" style="background:#f59e0b;color:#111;font-size:11px;font-weight:700;padding:4px 9px;border-radius:4px;display:inline-flex;align-items:center;gap:6px;margin-right:6px;"><i class="fa fa-user-secret"></i> <span>Switched to User</span><a href="/admin/switch-back" style="background:#1f2937;color:#fff;text-decoration:none;padding:2px 7px;border-radius:3px;font-size:10.5px;font-weight:700;margin-left:4px;" title="Exit user view and return to Admin Users List"><i class="fa fa-sign-out"></i> Back to Admin</a></div>`;
    }
    const walletMode = await getWalletMode(db);
    const result = await db.query(
      "SELECT balance_minor, buyer_balance_minor, seller_balance_minor FROM wallets WHERE user_id=$1 AND currency='INR'",
      [userId]
    );
    const row = result.rows[0] || {};
    if (walletMode === 'separate') {
      const buyerBal = formatRupees(row.buyer_balance_minor || 0);
      const sellerBal = formatRupees(row.seller_balance_minor || 0);
      rightContent = `
        <div class="exchange-strip-balance" style="background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.4);" title="Buyer Wallet (Topup & Recharge Purchases)">
          <span style="color:#34d399;"><i class="fa fa-shopping-cart"></i> BUYER WALLET</span>
          <strong style="color:#10b981;">₹${buyerBal}</strong>
        </div>
        <div class="exchange-strip-balance" style="background: rgba(99, 102, 241, 0.15); border-color: rgba(99, 102, 241, 0.4); margin-left: 6px;" title="Seller Wallet (Sales Credit & Bank Payouts)">
          <span style="color:#a5b4fc;"><i class="fa fa-line-chart"></i> SELLER WALLET</span>
          <strong style="color:#818cf8;">₹${sellerBal}</strong>
        </div>
      `;
    } else {
      const balance = formatRupees(row.balance_minor || 0);
      rightContent = `<div class="exchange-strip-balance"><span>PREPAID WALLET</span><strong>₹${balance}</strong></div>`;
    }
  } else {
    rightContent = '<div class="exchange-strip-admin"><i class="fa fa-shield"></i> ADMIN PANEL</div>';
  }

  const injection = `<div id="exchange-fixed-strip" class="exchange-fixed-strip">
    <div class="exchange-strip-left">
      <button type="button" id="exchangeMobileMenuToggle" class="exchange-mobile-menu-btn" aria-label="Toggle Navigation" title="Open Menu">
        <i class="fa fa-bars"></i>
      </button>
      <a class="exchange-strip-brand" href="${role === 'admin' ? '/admin/' : '/dashboard'}">
        <img src="/api/logo" alt="Logo" class="exchange-brand-img" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';" style="height:26px;max-width:130px;object-fit:contain;vertical-align:middle;display:inline-block;">
        <span class="exchange-brand-mark" style="display:none;">ER</span>
        <span class="exchange-brand-text">Exchange</span>
      </a>
    </div>
    <div class="exchange-strip-right">
      <button type="button" id="exchange-global-excel-download" class="exchange-strip-download" title="Download complete page data in Excel">
        <i class="fa fa-file-excel-o"></i> <span>Download Excel</span>
      </button>
      ${impersonationBadge}
      ${rightContent}
      <a href="${impersonationBadge ? '/admin/switch-back' : (role === 'admin' ? '/admin/login' : '/')}" id="logout-button" class="exchange-strip-logout" title="${impersonationBadge ? 'Exit to Admin' : 'Sign Out'}">
        <i class="fa fa-power-off"></i> <span>${impersonationBadge ? 'Exit View' : 'Logout'}</span>
      </a>
    </div>
  </div>
  <style>
    .exchange-fixed-strip {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 42px;
      z-index: 1040;
      background: #101114;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      box-shadow: 0 2px 7px rgba(0,0,0,0.3);
      font-family: Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .exchange-strip-left, .exchange-strip-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .exchange-strip-brand {
      display: flex;
      align-items: center;
      gap: 9px;
      color: #fff !important;
      font-weight: 700;
      text-decoration: none !important;
      letter-spacing: .2px;
      font-size: 14.5px;
    }
    .exchange-brand-mark {
      width: 25px;
      height: 25px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #22b4b0, #4d5fc0);
      font-size: 11px;
      font-weight: 800;
      color: #fff;
    }
    .exchange-strip-balance {
      height: 30px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 11px;
      border-radius: 5px;
      background: #22252a;
      color: #f4f5f7;
      border: 1px solid #333842;
    }
    .exchange-strip-balance span {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .5px;
      color: #c2c6ce;
    }
    .exchange-strip-balance strong {
      font-size: 13.5px;
      color: #ffc928;
    }
    .exchange-strip-admin {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .6px;
      color: #e3e6ec;
      background: #22252a;
      padding: 5px 11px;
      border-radius: 5px;
      border: 1px solid #333842;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .exchange-strip-download {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #107c41;
      color: #ffffff !important;
      font-size: 11.5px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 4px;
      text-decoration: none !important;
      border: 1px solid #0e6b37;
      cursor: pointer;
      line-height: 1.2;
      transition: all 0.15s ease-in-out;
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
    }
    .exchange-strip-download:hover {
      background: #0b5e31;
      border-color: #084926;
      color: #ffffff !important;
      text-decoration: none !important;
      transform: translateY(-1px);
    }
    .exchange-strip-download i {
      font-size: 12.5px;
    }
    .exchange-strip-logout {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #dc2626;
      color: #ffffff !important;
      font-size: 11.5px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 4px;
      text-decoration: none !important;
      border: 1px solid #ef4444;
      cursor: pointer;
      line-height: 1.2;
      transition: all 0.15s ease-in-out;
    }
    .exchange-strip-logout:hover {
      background: #b91c1c;
      border-color: #b91c1c;
      color: #ffffff !important;
      text-decoration: none !important;
      transform: translateY(-1px);
    }
    .exchange-strip-logout i {
      font-size: 11px;
    }

    /* Remove and hide white header box completely */
    .hor-header, header.header, .header.top-header, .page-main > .hor-header, .page-main > header.header {
      display: none !important;
      height: 0 !important;
      min-height: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      visibility: hidden !important;
      overflow: hidden !important;
    }

    /* Lift up entire design */
    .page {
      padding-top: 0 !important;
    }
    .page-main {
      padding-top: 0 !important;
      margin-top: 0 !important;
    }
    .main-content, .app-content, .content-wrapper {
      margin-top: 0 !important;
      margin-left: 0 !important;
    }
    .exchange-mobile-menu-btn {
      display: none;
      background: rgba(255,255,255,0.12);
      color: #ffffff;
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 5px;
      padding: 4px 9px;
      font-size: 15px;
      cursor: pointer;
      line-height: 1;
      align-items: center;
      justify-content: center;
    }
    @media (max-width: 991px) {
      .exchange-mobile-menu-btn { display: inline-flex; }
    }
    .sticky {
      position: fixed;
      top: 42px;
      left: 0;
      right: 0;
      width: 100%;
      z-index: 1025;
      margin-top: 0 !important;
    }
    .sticky .horizontal-main {
      width: 100% !important;
      background: #29327f !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .sticky .horizontal-mainwrapper {
      width: 100% !important;
      max-width: 100% !important;
      padding-left: 14px !important;
      padding-right: 14px !important;
      margin: 0 auto !important;
    }
    @media (min-width: 992px) {
      .sticky .horizontalMenu > .horizontalMenu-list {
        display: flex !important;
        flex-wrap: nowrap !important;
        align-items: center !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .sticky .horizontalMenu > .horizontalMenu-list > li {
        float: none !important;
        position: relative !important;
        flex: 0 0 auto !important;
      }
      .sticky .horizontalMenu > .horizontalMenu-list > li > a {
        padding: 11px 10px !important;
        white-space: nowrap !important;
        line-height: 1.3 !important;
      }
      .sticky .horizontalMenu > .horizontalMenu-list > li:hover > ul.sub-menu {
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
    }
    @media (max-width: 600px) {
      .exchange-fixed-strip { padding: 0 8px; }
      .exchange-strip-balance { gap: 5px; padding: 0 6px; }
      .exchange-strip-balance span { font-size: 9px; }
      .exchange-strip-logout span, .exchange-strip-download span { display: none; }
      .exchange-strip-logout, .exchange-strip-download { padding: 5px 8px; }
    }

    /* Menu bar typography and 2-column dropdown styles */
    .horizontalMenu-list > li > a {
      font-weight: 700 !important;
      font-size: 13px !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
    }
    .horizontalMenu-list > li > a > i.menu-icon,
    .horizontalMenu-list > li > a > i.fa,
    .horizontalMenu-list > li > a > i.horizontal-icon,
    .exchange-fixed-strip i.fa {
      font-family: FontAwesome !important;
      font-style: normal !important;
      font-weight: normal !important;
      line-height: 1 !important;
    }
    .horizontalMenu-list > li > a > i.menu-icon {
      font-size: 13.5px !important;
      margin-right: 2px !important;
    }
    .horizontalMenu-list .sub-menu {
      text-align: left !important;
    }
    .horizontalMenu-list .sub-menu.two-columns {
      min-width: 480px !important;
      width: max-content !important;
      padding: 10px 12px !important;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18) !important;
      border-radius: 8px !important;
      background: #ffffff !important;
      text-align: left !important;
    }
    .horizontalMenu-list .sub-menu.two-columns .two-col-container {
      display: flex !important;
      flex-direction: row !important;
      gap: 16px !important;
      width: 100% !important;
      text-align: left !important;
      align-items: flex-start !important;
      justify-content: flex-start !important;
    }
    .horizontalMenu-list .sub-menu.two-columns .menu-col {
      flex: 1 1 50% !important;
      min-width: 220px !important;
      list-style: none !important;
      padding: 0 !important;
      margin: 0 !important;
      text-align: left !important;
    }
    .horizontalMenu-list .sub-menu.two-columns .menu-col.col-divider {
      border-left: 1px solid #e2e8f0 !important;
      padding-left: 14px !important;
    }
    .horizontalMenu-list .sub-menu.two-columns .menu-col li {
      display: block !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      list-style: none !important;
      text-align: left !important;
    }
    .horizontalMenu-list .sub-menu li,
    .horizontalMenu-list .sub-menu > li {
      text-align: left !important;
    }
    .horizontalMenu-list .sub-menu li a,
    .horizontalMenu-list .sub-menu a,
    .horizontalMenu-list .sub-menu.two-columns .menu-col li a {
      font-weight: 700 !important;
      font-size: 13px !important;
      color: #334155 !important;
      letter-spacing: 0.1px !important;
      display: block !important;
      width: 100% !important;
      text-align: left !important;
      padding: 7px 12px !important;
      white-space: nowrap !important;
    }
    .horizontalMenu-list .sub-menu li a:hover,
    .horizontalMenu-list .sub-menu a:hover,
    .horizontalMenu-list .sub-menu.two-columns .menu-col li a:hover {
      font-weight: 700 !important;
      color: #2563eb !important;
      background: #eff6ff !important;
      text-align: left !important;
    }
    .horizontalMenu-list .sub-menu li a.active,
    .horizontalMenu-list .sub-menu a.active,
    .horizontalMenu-list .sub-menu.two-columns .menu-col li a.active {
      font-weight: 800 !important;
      color: #2563eb !important;
      background: #eff6ff !important;
      text-align: left !important;
    }

    /* Universal fix for clipped/cut-off text in inputs, select boxes, and date pickers across ALL pages */
    .form-control, .form-control-sm, .form-control-lg {
      height: 38px !important;
      min-height: 38px !important;
      line-height: 1.45 !important;
      padding: 6px 12px !important;
      font-size: 13.5px !important;
      box-sizing: border-box !important;
    }
    select.form-control, select.form-control-sm, select.form-control-lg {
      height: 38px !important;
      min-height: 38px !important;
      line-height: 1.45 !important;
      padding: 6px 10px !important;
      font-size: 13.5px !important;
      box-sizing: border-box !important;
    }
    input[type="date"].form-control, input[type="date"].form-control-sm,
    input[type="datetime-local"].form-control, input[type="datetime-local"].form-control-sm {
      height: 38px !important;
      min-height: 38px !important;
      line-height: 1.45 !important;
      padding: 5px 8px !important;
      font-size: 13px !important;
      min-width: 140px !important;
      box-sizing: border-box !important;
    }
    .form-group label {
      margin-bottom: 4px !important;
      line-height: 1.3 !important;
      font-size: 11.5px !important;
      font-weight: 700 !important;
      color: #475569 !important;
      display: inline-block !important;
    }
    .form-row > .form-group {
      min-width: 110px !important;
    }
  </style>
  <script>
  (()=>{
    const strip = document.getElementById('exchange-fixed-strip');
    function place() {
      const stripHeight = strip ? strip.offsetHeight : 42;
      const menu = document.querySelector('.page-main .sticky, .horizontalMenucontainer .sticky, .sticky');
      let totalTop = stripHeight;
      if (menu) {
        menu.style.position = 'fixed';
        menu.style.top = stripHeight + 'px';
        menu.style.left = '0';
        menu.style.right = '0';
        menu.style.width = '100%';
        menu.style.zIndex = '1025';
        menu.style.marginTop = '0';
        const menuHeight = menu.getBoundingClientRect().height;
        totalTop += (menuHeight > 0 ? menuHeight : 46);
      }
      document.body.style.paddingTop = totalTop + 'px';
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('DOMContentLoaded', () => {
      place();
      setTimeout(place, 120);
    });
    window.addEventListener('load', place);

    const mobileToggleBtn = document.getElementById('exchangeMobileMenuToggle');
    if (mobileToggleBtn) {
      mobileToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('active');
      });
    }

    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('#logout-button, .exchange-strip-logout');
      if (btn) {
        e.preventDefault();
        try {
          const res = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
          const data = await res.json().catch(() => ({}));
          if (data && data.redirect) {
            window.location.href = data.redirect;
            return;
          }
        } catch (_) {}
        window.location.href = '${role === 'admin' ? '/admin/login' : '/'}';
      }
    });

    // 1. Setup in-page Download Excel button if page has a header
    function setupPageDownloadButton() {
      const pageHeader = document.querySelector('.page-header');
      if (pageHeader) {
        if (!pageHeader.querySelector('.exchange-page-excel-btn, a[href*="download=excel"], a[href*="download=csv"], a[href*="format=csv"]')) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-sm btn-success exchange-page-excel-btn font-weight-bold shadow-sm';
          btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:#107c41;border-color:#0e6b37;padding:5px 12px;border-radius:4px;font-size:12px;color:#fff;cursor:pointer;';
          btn.innerHTML = '<i class="fa fa-file-excel-o"></i> <span>Download Excel</span>';
          btn.title = 'Download complete page details in Excel';

          const rightHeader = pageHeader.querySelector('.page-rightheader, .btn-list, .breadcrumb');
          if (rightHeader) {
            btn.style.marginLeft = '8px';
            rightHeader.appendChild(btn);
          } else {
            pageHeader.style.display = 'flex';
            pageHeader.style.justifyContent = 'space-between';
            pageHeader.style.alignItems = 'center';
            btn.style.marginLeft = 'auto';
            pageHeader.appendChild(btn);
          }
        }
      } else {
        const firstCardHeader = document.querySelector('.card-header');
        if (firstCardHeader && !firstCardHeader.querySelector('.exchange-page-excel-btn, a[href*="download=excel"], a[href*="download=csv"], a[href*="format=csv"]')) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-sm btn-success exchange-page-excel-btn font-weight-bold shadow-sm ml-auto';
          btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:#107c41;border-color:#0e6b37;padding:4px 10px;border-radius:4px;font-size:11.5px;color:#fff;cursor:pointer;';
          btn.innerHTML = '<i class="fa fa-file-excel-o"></i> <span>Download Excel</span>';
          btn.title = 'Download complete page details in Excel';
          firstCardHeader.classList.add('d-flex', 'justify-content-between', 'align-items-center');
          firstCardHeader.appendChild(btn);
        }
      }
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', setupPageDownloadButton);
    } else {
      setupPageDownloadButton();
    }

    function escapeCsv(val) {
      if (val === null || val === undefined) return '""';
      var s = String(val).replace(/\\r\\n/g, ' ').replace(/[\\r\\n]/g, ' ').replace(/\\s+/g, ' ').trim();
      return '"' + s.replace(/"/g, '""') + '"';
    }

    function exportPageToExcel(triggerBtn) {
      try {
        var pageTitle = (document.querySelector('h1, h2, h3, h4, .page-title') ? document.querySelector('h1, h2, h3, h4, .page-title').innerText : document.title || 'Page Details')
          .trim().replace(/[\\r\\n\\t]+/g, ' ');
        var cleanTitle = pageTitle
          .replace(/\\s*-\\s*Exchange.*$/i, '')
          .replace(/[^a-zA-Z0-9_\\u0900-\\u097F -]/g, '')
          .trim().replace(/\\s+/g, '_') || 'Export';

        var now = new Date();
        var pad = function(n) { return String(n).padStart(2, '0'); };
        var dateStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
        var timeStr = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
        var filename = cleanTitle + '_' + dateStr + '_' + timeStr + '.csv';

        var csv = '\\uFEFF'; // UTF-8 BOM for Microsoft Excel

        // 1. Meta Header
        csv += escapeCsv('PAGE REPORT / EXCEL EXPORT') + '\\r\\n';
        csv += escapeCsv('Page Name') + ',' + escapeCsv(pageTitle) + '\\r\\n';
        csv += escapeCsv('Export Date & Time') + ',' + escapeCsv(now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })) + '\\r\\n';
        csv += escapeCsv('Page URL') + ',' + escapeCsv(window.location.pathname + window.location.search) + '\\r\\n';

        // 2. Filter Values (if any)
        var filterElements = document.querySelectorAll('form input:not([type="hidden"]):not([type="submit"]):not([type="button"]), form select');
        var filterList = [];
        filterElements.forEach(function(el) {
          var label = '';
          if (el.id) {
            var lbl = document.querySelector('label[for="' + el.id + '"]');
            if (lbl) label = lbl.innerText.trim();
          }
          if (!label && el.name) label = el.name;
          if (!label && el.placeholder) label = el.placeholder;
          var val = el.value;
          if (el.tagName === 'SELECT' && el.selectedIndex >= 0) {
            val = el.options[el.selectedIndex].text;
          }
          if (val && val !== 'all' && val !== 'All' && val !== '') {
            filterList.push((label || 'Filter') + ': ' + val);
          }
        });
        if (filterList.length > 0) {
          csv += escapeCsv('Applied Filters') + ',' + escapeCsv(filterList.join(' | ')) + '\\r\\n';
        }
        csv += '\\r\\n';

        // 3. KPI & Summary Cards (Dashboards, Daybook, Ledger, Reports)
        var kpis = [];
        var cardContainers = document.querySelectorAll('.daybook-kpi-card, .dash-kpi-card, .kpi-card, .metric-card, .stat-card, [class*="card"]');
        cardContainers.forEach(function(card) {
          if (card.querySelector('table')) return;
          if (card.parentElement && card.parentElement.closest('.daybook-kpi-card, .dash-kpi-card')) return;
          var lblEl = card.querySelector('.text-muted, .small, label, p, .card-title, .dash-kpi-title, .kpi-label');
          var valEl = card.querySelector('h1, h2, h3, h4, h5, strong, .number, .dash-kpi-val, .font-weight-bold, [style*="font-size:2"]');
          if (lblEl && valEl && lblEl !== valEl) {
            var lbl = lblEl.innerText.replace(/[\\r\\n\\t]+/g, ' ').trim();
            var val = valEl.innerText.replace(/[\\r\\n\\t]+/g, ' ').trim();
            if (lbl && val && lbl.length < 80 && val.length < 80 && !kpis.some(function(x) { return x.lbl === lbl && x.val === val; })) {
              kpis.push({ lbl: lbl, val: val });
            }
          }
        });
        if (kpis.length > 0) {
          csv += escapeCsv('--- [SUMMARY / KEY METRICS] ---') + '\\r\\n';
          csv += escapeCsv('Metric / Parameter') + ',' + escapeCsv('Value') + '\\r\\n';
          kpis.forEach(function(k) {
            csv += escapeCsv(k.lbl) + ',' + escapeCsv(k.val) + '\\r\\n';
          });
          csv += '\\r\\n';
        }

        // 4. Data Tables
        var tables = document.querySelectorAll('table');
        var tableIndex = 0;
        tables.forEach(function(table) {
          if (table.offsetParent === null && table.offsetWidth === 0 && table.offsetHeight === 0) return;
          if (table.classList.contains('datepicker-table')) return;

          tableIndex++;
          var tableTitle = '';
          var card = table.closest('.card, .section, .box');
          if (card) {
            var ct = card.querySelector('.card-title, .card-header h3, .card-header h4, .card-header h5, .card-header strong, h3, h4');
            if (ct) tableTitle = ct.innerText.replace(/[\\r\\n\\t]+/g, ' ').trim();
          }
          if (!tableTitle && table.caption) tableTitle = table.caption.innerText.trim();
          if (!tableTitle) tableTitle = 'Data Table ' + tableIndex;

          csv += escapeCsv('--- [TABLE: ' + tableTitle + '] ---') + '\\r\\n';

          // Identify Action columns to exclude
          var headerCells = table.querySelectorAll('thead tr:last-child th, thead tr:last-child td, tr:first-child th');
          var excludeCols = new Set();
          headerCells.forEach(function(th, idx) {
            var t = th.innerText.toLowerCase().trim();
            if (t === 'action' || t === 'actions' || t === 'operation' || t === 'operate' || (t === '#' && th.querySelector('input[type="checkbox"]'))) {
              excludeCols.add(idx);
            }
          });

          var rows = table.querySelectorAll('tr');
          rows.forEach(function(tr) {
            if (tr.offsetParent === null && tr.offsetWidth === 0 && tr.offsetHeight === 0) return;
            var cells = tr.querySelectorAll('th, td');
            if (cells.length === 0) return;

            var rowVals = [];
            var rowHasData = false;
            cells.forEach(function(cell, cIdx) {
              if (excludeCols.has(cIdx)) return;
              var clone = cell.cloneNode(true);
              clone.querySelectorAll('script, style, .dropdown-menu, .modal, input[type="hidden"], .avatar, svg').forEach(function(x) { x.remove(); });

              var inp = clone.querySelector('input:not([type="checkbox"]):not([type="radio"]), select, textarea');
              var txt = '';
              if (inp) {
                if (inp.tagName === 'SELECT' && inp.selectedIndex >= 0) {
                  txt = inp.options[inp.selectedIndex].text;
                } else {
                  txt = inp.value || '';
                }
              } else {
                txt = clone.innerText || clone.textContent || '';
              }
              txt = txt.replace(/[\\r\\n\\t]+/g, ' - ').replace(/\\s+/g, ' ').trim();
              if (txt) rowHasData = true;
              rowVals.push(escapeCsv(txt));
            });

            if (rowHasData || rowVals.length > 0) {
              csv += rowVals.join(',') + '\\r\\n';
            }
          });

          csv += '\\r\\n';
        });

        // 5. Form / Configuration Details (if no tables and no KPI cards)
        if (tableIndex === 0 && kpis.length === 0) {
          var formGroups = document.querySelectorAll('.form-group, .row > div');
          var formDetails = [];
          formGroups.forEach(function(fg) {
            var label = fg.querySelector('label, .control-label, dt');
            var input = fg.querySelector('input:not([type="hidden"]), select, textarea, dd, .form-control-plaintext');
            if (label && input) {
              var lText = label.innerText.replace(/[\\*\\r\\n\\t]+/g, ' ').trim();
              var val = '';
              if (input.tagName === 'SELECT' && input.selectedIndex >= 0) {
                val = input.options[input.selectedIndex].text;
              } else if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
                val = input.value;
              } else {
                val = input.innerText;
              }
              val = (val || '').replace(/[\\r\\n\\t]+/g, ' ').trim();
              if (lText && val && !formDetails.some(function(d) { return d.lbl === lText; })) {
                formDetails.push({ lbl: lText, val: val });
              }
            }
          });
          if (formDetails.length > 0) {
            csv += escapeCsv('--- [FORM / CONFIGURATION DETAILS] ---') + '\\r\\n';
            csv += escapeCsv('Field') + ',' + escapeCsv('Value') + '\\r\\n';
            formDetails.forEach(function(fd) {
              csv += escapeCsv(fd.lbl) + ',' + escapeCsv(fd.val) + '\\r\\n';
            });
            csv += '\\r\\n';
          }
        }

        // 6. Trigger Browser File Download
        var blobUrl = '';
        try {
          var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          blobUrl = URL.createObjectURL(blob);
        } catch (_) {}

        var a = document.createElement('a');
        if (blobUrl) {
          a.setAttribute('href', blobUrl);
        } else {
          a.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
        }
        a.setAttribute('download', filename);
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (blobUrl) {
          setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 2000);
        }

        // Visual feedback
        if (triggerBtn) {
          var origHtml = triggerBtn.innerHTML;
          triggerBtn.innerHTML = '<i class="fa fa-check"></i> <span>Downloaded!</span>';
          setTimeout(function() { triggerBtn.innerHTML = origHtml; }, 2000);
        }
      } catch (err) {
        console.error('[Excel Download Error]', err);
        alert('Failed to generate Excel download: ' + err.message);
      }
    }

    // Attach click handler for all Excel download buttons
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('#exchange-global-excel-download, .exchange-page-excel-btn, .exchange-strip-download');
      if (btn) {
        e.preventDefault();
        exportPageToExcel(btn);
      }
    });
  })();
  </script>`;
  const lastBodyIdx = html.toLowerCase().lastIndexOf('</body>');
  if (lastBodyIdx !== -1) {
    return html.slice(0, lastBodyIdx) + injection + html.slice(lastBodyIdx);
  }
  return html + injection;
}

module.exports = { addPanelChrome };
