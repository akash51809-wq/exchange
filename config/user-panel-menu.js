'use strict';

const { escapeHtml } = require('../lib/page-utils');

const USER_PANEL_MENU = [
  { label: 'Dashboard', path: '/dashboard', icon: 'fa fa-tachometer' },
  { label: 'Fund', path: '/fund', icon: 'fa fa-money', items: [
    { label: 'Wallet Topup Request', path: '/fund/wallet-topup-request' },
    { label: 'Redeem', path: '/fund/redeem' },
    { label: 'Fund Dr/Cr Statement', path: '/fund/statement' },
  ] },
  { label: 'Buyer', path: '/buyer', icon: 'fa fa-shopping-cart', items: [
    { label: 'Buyer Margin', path: '/buyer/margin' },
    { label: 'Purchase Txn', path: '/buyer/purchase-txn' },
    { label: 'API Document', path: '/buyer/api-document' },
    { label: 'Purchase Refund', path: '/buyer/purchase-refund' },
    { label: 'Recharge Dispute', path: '/buyer/recharge-dispute' },
    { label: 'Operator-wise Purchase', path: '/buyer/operator-wise-purchase' },
  ] },
  { label: 'Seller', path: '/seller', icon: 'fa fa-shopping-bag', twoColumns: true, items: [
    { label: 'Sales Margin', path: '/seller/sales-margin' },
    { label: 'Sales Txn', path: '/seller/sales-txn' },
    { label: 'API Setting', path: '/seller/api-setting' },
    { label: 'Operator-wise Sale', path: '/seller/operator-wise-sale' },
    { label: 'Fake Complaint Report', path: '/seller/fake-complaint-report' },
    { label: 'Sale Summary Day-wise', path: '/seller/sales-summary-day-wise' },
    { label: 'Sales Dispute', path: '/seller/sales-dispute' },
    { label: 'Sales Pending', path: '/seller/sales-pending' },
    { label: 'Allowed Denomination', path: '/seller/allowed-denomination' },
  ] },
  { label: 'User Report', path: '/report', icon: 'fa fa-bar-chart', items: [
    { label: 'Account Statement', path: '/report/account-statement' },
    { label: 'Fund Order', path: '/report/fund-order' },
    { label: 'Login & IP Log', path: '/report/ip-log' },
  ] },
  { label: 'Invoice', path: '/invoice', icon: 'fa fa-file-text-o', items: [
    { label: 'Buyer GST Invoice', path: '/invoice/buyer-gst-invoice' },
    { label: 'Seller GST Invoice', path: '/invoice/seller-gst-invoice' },
    { label: 'Buyer Commission Invoice', path: '/invoice/buyer-commission-invoice' },
    { label: 'Seller Commission Invoice', path: '/invoice/seller-commission-invoice' },
  ] },
  { label: 'Setting', path: '/setting', icon: 'fa fa-cogs', items: [
    { label: 'KYC Verification', path: '/kyc' },
    { label: 'IP Setting', path: '/setting/ip-setting' },
    { label: 'Add Callback', path: '/setting/add-callback' },
    { label: 'Error List', path: '/setting/error-list' },
  ] },
  { label: 'Help', path: '/help', icon: 'fa fa-question-circle', items: [
    { label: 'Integration Requests', path: '/help/integration-requests' },
  ] },
  { label: 'Available Stock', path: '/available-stock', icon: 'fa fa-cubes' },
];

function getUserPanelMenu(walletMode = 'single') {
  const isSeparate = (walletMode === 'separate');

  const accountItems = [];
  if (isSeparate) {
    accountItems.push({ label: 'Exchange Wallet Balance', path: '/account/wallet-exchange' });
  }
  accountItems.push({ label: 'Account Statement', path: '/report/account-statement' });

  return [
    { label: 'Dashboard', path: '/dashboard', icon: 'fa fa-tachometer' },
    { label: 'Fund', path: '/fund', icon: 'fa fa-money', items: [
      { label: 'Wallet Topup Request', path: '/fund/wallet-topup-request' },
      { label: 'Redeem', path: '/fund/redeem' },
      { label: 'Fund Dr/Cr Statement', path: '/fund/statement' },
    ] },
    { label: 'Buyer', path: '/buyer', icon: 'fa fa-shopping-cart', items: [
      { label: 'Buyer Margin', path: '/buyer/margin' },
      { label: 'Purchase Txn', path: '/buyer/purchase-txn' },
      { label: 'API Document', path: '/buyer/api-document' },
      { label: 'Purchase Refund', path: '/buyer/purchase-refund' },
      { label: 'Recharge Dispute', path: '/buyer/recharge-dispute' },
      { label: 'Operator-wise Purchase', path: '/buyer/operator-wise-purchase' },
    ] },
    { label: 'Seller', path: '/seller', icon: 'fa fa-shopping-bag', twoColumns: true, items: [
      { label: 'Sales Margin', path: '/seller/sales-margin' },
      { label: 'Sales Txn', path: '/seller/sales-txn' },
      { label: 'API Setting', path: '/seller/api-setting' },
      { label: 'Operator-wise Sale', path: '/seller/operator-wise-sale' },
      { label: 'Fake Complaint Report', path: '/seller/fake-complaint-report' },
      { label: 'Sale Summary Day-wise', path: '/seller/sales-summary-day-wise' },
      { label: 'Sales Dispute', path: '/seller/sales-dispute' },
      { label: 'Sales Pending', path: '/seller/sales-pending' },
      { label: 'Allowed Denomination', path: '/seller/allowed-denomination' },
    ] },
    { label: 'Account', path: '#', icon: 'fa fa-university', items: accountItems },
    { label: 'User Report', path: '/report', icon: 'fa fa-bar-chart', items: [
      { label: 'Account Statement', path: '/report/account-statement' },
      { label: 'Fund Order', path: '/report/fund-order' },
      { label: 'Login & IP Log', path: '/report/ip-log' },
    ] },
    { label: 'Invoice', path: '/invoice', icon: 'fa fa-file-text-o', items: [
      { label: 'Buyer GST Invoice', path: '/invoice/buyer-gst-invoice' },
      { label: 'Seller GST Invoice', path: '/invoice/seller-gst-invoice' },
      { label: 'Buyer Commission Invoice', path: '/invoice/buyer-commission-invoice' },
      { label: 'Seller Commission Invoice', path: '/invoice/seller-commission-invoice' },
    ] },
    { label: 'Setting', path: '/setting', icon: 'fa fa-cogs', items: [
      { label: 'KYC Verification', path: '/kyc' },
      { label: 'IP Setting', path: '/setting/ip-setting' },
      { label: 'Add Callback', path: '/setting/add-callback' },
      { label: 'Error List', path: '/setting/error-list' },
    ] },
    { label: 'Help', path: '/help', icon: 'fa fa-question-circle', items: [
      { label: 'Integration Requests', path: '/help/integration-requests' },
    ] },
    { label: 'Available Stock', path: '/available-stock', icon: 'fa fa-cubes' },
  ];
}

const USER_PANEL_PAGES = new Map();
const templateFor = (route) => `${route.split('/').filter(Boolean).join('-')}.html`;
for (const item of getUserPanelMenu('separate')) {
  if (item.path !== '/dashboard' && item.path !== '#') USER_PANEL_PAGES.set(item.path, { title: item.label, template: templateFor(item.path), path: item.path });
  for (const child of item.items || []) USER_PANEL_PAGES.set(child.path, { title: child.label, template: templateFor(child.path), path: child.path });
}
USER_PANEL_PAGES.set('/kyc', { title: 'KYC Verification', template: 'kyc.html', path: '/kyc' });
USER_PANEL_PAGES.set('/setting/kyc', { title: 'KYC Verification', template: 'kyc.html', path: '/kyc' });
USER_PANEL_PAGES.set('/user/setting/error-list', { title: 'API Error & Failure Code List', template: 'setting-error-list.html', path: '/setting/error-list' });
USER_PANEL_PAGES.set('/invoice/buyer-invoice', { title: 'Buyer GST Invoice', template: 'invoice-buyer-gst-invoice.html', path: '/invoice/buyer-gst-invoice' });
USER_PANEL_PAGES.set('/invoice/seller-invoice', { title: 'Seller GST Invoice', template: 'invoice-seller-gst-invoice.html', path: '/invoice/seller-gst-invoice' });
USER_PANEL_PAGES.set('/account/wallet-exchange', { title: 'Exchange Wallet Balance', template: 'account-wallet-exchange.html', path: '/account/wallet-exchange' });
USER_PANEL_PAGES.set('/user/account/wallet-exchange', { title: 'Exchange Wallet Balance', template: 'account-wallet-exchange.html', path: '/account/wallet-exchange' });
USER_PANEL_PAGES.set('/help/integration-requests', { title: 'Seller API Integration Requests', template: 'help-integration-requests.html', path: '/help/integration-requests' });
USER_PANEL_PAGES.set('/help/integration-request', { title: 'Seller API Integration Requests', template: 'help-integration-requests.html', path: '/help/integration-requests' });

function renderUserMenuList(walletMode = 'single', activePath = '') {
  const menu = getUserPanelMenu(walletMode);
  return menu.map((item) => {
    const label = escapeHtml(item.label);
    const iconHtml = item.icon ? `<i class="${item.icon} menu-icon mr-1"></i>` : '';
    if (!item.items?.length) {
      const activeClass = (activePath === item.path || (item.path !== '/dashboard' && activePath && activePath.startsWith(item.path))) ? ' active' : '';
      return `<li aria-haspopup="true"><a class="font-weight-bold${activeClass}" style="font-weight:700" href="${item.path}">${iconHtml}${label}</a></li>`;
    }
    const hasActiveChild = item.items.some(c => activePath && activePath.startsWith(c.path));
    const activeClass = hasActiveChild ? ' active' : '';

    // If configured as 2 columns (like Seller in reference image)
    if (item.twoColumns && item.items.length > 1) {
      const mid = Math.ceil(item.items.length / 2);
      const col1Items = item.items.slice(0, mid);
      const col2Items = item.items.slice(mid);

      const renderCol = (list, isSecond) => {
        const lis = list.map((child) => {
          const childActive = (activePath && activePath === child.path) ? ' active text-primary' : '';
          return `<li aria-haspopup="true"><a class="font-weight-bold${childActive}" style="font-weight:700" href="${child.path}">${escapeHtml(child.label)}</a></li>`;
        }).join('');
        return `<ul class="menu-col${isSecond ? ' col-divider' : ''}">${lis}</ul>`;
      };

      const columnsHtml = `<div class="two-col-container">${renderCol(col1Items, false)}${renderCol(col2Items, true)}</div>`;
      return `<li aria-haspopup="true"><a href="${item.path}" class="sub-icon font-weight-bold${activeClass}" style="font-weight:700">${iconHtml}${label} <i class="fa fa-angle-down horizontal-icon"></i></a><ul class="sub-menu two-columns"><li class="two-col-li" style="width:100%;list-style:none;">${columnsHtml}</li></ul></li>`;
    }

    const children = item.items.map((child) => {
      const childActive = (activePath && activePath === child.path) ? ' active text-primary' : '';
      return `<li aria-haspopup="true"><a class="font-weight-bold${childActive}" style="font-weight:700" href="${child.path}">${escapeHtml(child.label)}</a></li>`;
    }).join('');
    return `<li aria-haspopup="true"><a href="${item.path}" class="sub-icon font-weight-bold${activeClass}" style="font-weight:700">${iconHtml}${label} <i class="fa fa-angle-down horizontal-icon"></i></a><ul class="sub-menu">${children}</ul></li>`;
  }).join('');
}

function renderUserNavigation(walletMode = 'single', activePath = '') {
  const entries = renderUserMenuList(walletMode, activePath);
  return `<!-- Horizontal-menu -->
  <div class="sticky">
    <div class="horizontal-main hor-menu clearfix">
      <div class="horizontal-mainwrapper container-fluid px-3 clearfix">
        <nav class="horizontalMenu clearfix">
          <ul class="horizontalMenu-list">${entries}</ul>
        </nav>
      </div>
    </div>
  </div>
  <!-- Horizontal-menu end -->
  <style>
    .sticky .horizontal-main {
      width: 100% !important;
      background: #29327f !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
    }
    .sticky .horizontal-mainwrapper {
      width: 100% !important;
      max-width: 100% !important;
      padding-left: 16px !important;
      padding-right: 16px !important;
      margin: 0 auto !important;
    }
    .sticky .horizontalMenu {
      display: block !important;
      width: 100% !important;
    }
    @media (min-width: 992px) {
      .sticky .horizontalMenu > .horizontalMenu-list {
        display: flex !important;
        flex-wrap: nowrap !important;
        align-items: center !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        list-style: none !important;
      }
      .sticky .horizontalMenu > .horizontalMenu-list > li {
        float: none !important;
        position: relative !important;
        flex: 0 0 auto !important;
      }
      .sticky .horizontalMenu > .horizontalMenu-list > li > a {
        padding: 11px 11px !important;
        white-space: nowrap !important;
        color: #cbd5e1 !important;
        text-decoration: none !important;
        line-height: 1.3 !important;
      }
      .sticky .horizontalMenu > .horizontalMenu-list > li > a:hover,
      .sticky .horizontalMenu > .horizontalMenu-list > li > a.active {
        color: #ffffff !important;
        background: rgba(255, 255, 255, 0.1) !important;
        border-radius: 4px;
      }
      .sticky .horizontalMenu > .horizontalMenu-list > li:hover > ul.sub-menu {
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
    }
    .horizontalMenu-list > li > a {
      font-weight: 700 !important;
      font-size: 13px !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
    }
    .horizontalMenu-list > li > a > i.menu-icon,
    .horizontalMenu-list > li > a > i.fa,
    .horizontalMenu-list > li > a > i.horizontal-icon {
      font-family: FontAwesome !important;
      font-style: normal !important;
      font-weight: normal !important;
      font-size: 13.5px !important;
      line-height: 1 !important;
      margin: 0 !important;
      vertical-align: middle !important;
    }
    .horizontalMenu-list .sub-menu.two-columns {
      min-width: 480px !important;
      width: max-content !important;
      padding: 10px 12px !important;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18) !important;
      border-radius: 8px !important;
      background: #ffffff !important;
    }
    .horizontalMenu-list .sub-menu.two-columns .two-col-container {
      display: flex !important;
      flex-direction: row !important;
      gap: 14px !important;
      width: 100% !important;
    }
    .horizontalMenu-list .sub-menu.two-columns .menu-col {
      flex: 1 1 50% !important;
      min-width: 220px !important;
      list-style: none !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .horizontalMenu-list .sub-menu.two-columns .menu-col.col-divider {
      border-left: 1px solid #e2e8f0 !important;
      padding-left: 12px !important;
    }
    .horizontalMenu-list .sub-menu.two-columns .menu-col li {
      display: block !important;
      width: 100% !important;
      margin: 0 !important;
      list-style: none !important;
    }
    .horizontalMenu-list .sub-menu {
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
  </style>`;
}

module.exports = {
  USER_PANEL_MENU,
  USER_PANEL_PAGES,
  getUserPanelMenu,
  renderUserMenuList,
  renderUserNavigation,
};
