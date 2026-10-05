'use strict';

function formatRupees(minorValue) {
  const minor = BigInt(minorValue || 0);
  return `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;
}

async function addPanelChrome(html, { role, userId, db }) {
  if (html.includes('id="exchange-fixed-strip"')) return html;
  let balance = '';
  if (role === 'user' && userId && db) {
    const result = await db.query("SELECT balance_minor FROM wallets WHERE user_id=$1 AND currency='INR'", [userId]);
    balance = formatRupees(result.rows[0]?.balance_minor || 0);
  }
  const rightContent = role === 'user'
    ? `<div class="exchange-strip-balance"><span>PREPAID WALLET</span><strong>₹${balance}</strong></div>`
    : '<div class="exchange-strip-admin"><i class="fa fa-shield"></i> ADMIN PANEL</div>';

  const injection = `<div id="exchange-fixed-strip" class="exchange-fixed-strip">
    <div class="exchange-strip-left">
      <a class="exchange-strip-brand" href="${role === 'admin' ? '/admin/' : '/dashboard'}">
        <span class="exchange-brand-mark">ER</span>
        <span>Exchange</span>
      </a>
    </div>
    <div class="exchange-strip-right">
      ${rightContent}
      <a href="/admin/login" id="logout-button" class="exchange-strip-logout" title="Sign Out">
        <i class="fa fa-power-off"></i> <span>Logout</span>
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
    .main-content, .app-content {
      margin-top: 0 !important;
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
    @media (max-width: 600px) {
      .exchange-fixed-strip { padding: 0 8px; }
      .exchange-strip-balance { gap: 5px; padding: 0 6px; }
      .exchange-strip-balance span { font-size: 9px; }
      .exchange-strip-logout span { display: none; }
      .exchange-strip-logout { padding: 5px 8px; }
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
        totalTop += menu.getBoundingClientRect().height;
      }
      document.body.style.paddingTop = totalTop + 'px';
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('DOMContentLoaded', place);

    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('#logout-button, .exchange-strip-logout');
      if (btn) {
        e.preventDefault();
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        } catch (_) {}
        window.location.href = '/admin/login';
      }
    });
  })();
  </script>`;
  return html.replace(/<\/body>/i, `${injection}</body>`);
}

module.exports = { addPanelChrome };
