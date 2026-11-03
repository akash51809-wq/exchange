'use strict';

const { escapeHtml } = require('../lib/page-utils');

const ADMIN_PANEL_MENU = [
  { label: 'Dashboard', path: '/admin/', icon: 'fa fa-tachometer' },
  { label: 'User', path: '#', icon: 'fa fa-users', items: [
    { label: 'List User', path: '/admin/users/list' },
    { label: 'Pending KYC', path: '/admin/users/pending-kyc' },
    { label: 'User Log History', path: '/admin/users/login-history' },
    { label: 'User Send Msg Log', path: '/admin/reports/user-send-msg-log' },
  ] },
  { label: 'Payment', path: '#', icon: 'fa fa-credit-card', items: [
    { label: 'Fund Request', path: '/admin/payment/fund-request' },
    { label: 'Bank List', path: '/admin/payment/bank-list' },
    { label: 'Bank Approval', path: '/admin/payment/bank-approval' },
    { label: 'Payout Requests', path: '/admin/payment/payout-requests' },
    { label: 'List of Wallet Update', path: '/admin/payment/wallet-update' },
    { label: 'List of Wallet Redeem', path: '/admin/payment/wallet-redeem' },
    { label: 'List of Wallet Exchange', path: '/admin/payment/wallet-exchange' },
  ] },
  { label: 'Disputes', path: '/admin/disputes', icon: 'fa fa-gavel' },
  { label: 'Seller API Requests', path: '/admin/seller-api/requests', icon: 'fa fa-exchange' },
  { label: 'Reports', path: '#', icon: 'fa fa-bar-chart', twoColumns: true, items: [
    // Column 1 (Left Part)
    { label: 'Daily Sales Report', path: '/admin/reports/daily-sales-report' },
    { label: 'Buyer Daybook', path: '/admin/reports/buyer-daybook' },
    { label: 'Buyer Ledger', path: '/admin/reports/buyer-ledger' },
    { label: 'Seller Daybook', path: '/admin/reports/seller-daybook' },
    { label: 'Seller Ledger', path: '/admin/reports/seller-ledger' },
    { label: 'Recharge Report', path: '/admin/reports/recharge-report' },
    { label: 'Live Recharge Report', path: '/admin/reports/live-recharge' },
    { label: 'Pending Recharge Report', path: '/admin/reports/pending-recharge' },
    { label: 'Admin Earning', path: '/admin/reports/admin-earning' },
    { label: 'Invoices', path: '/admin/invoice' },
    // Column 2 (Right Part)
    { label: 'Refund Report', path: '/admin/reports/refund-report' },
    { label: 'Seller Refund Ratio', path: '/admin/reports/seller-refund-ratio' },
    { label: 'Fake Complaint Ratio', path: '/admin/reports/fake-complaint-ratio' },
    { label: 'Complaint Report', path: '/admin/reports/complaint' },
    { label: 'Show All Seller Margin', path: '/admin/reports/all-seller-margin' },
    { label: 'Show All Buyer Margin', path: '/admin/reports/all-buyer-margin' },
    { label: 'User Login Log', path: '/admin/reports/user-login-log' },
    { label: 'Recharge Log', path: '/admin/reports/recharge-log' },
    { label: 'User Send Msg Log', path: '/admin/reports/user-send-msg-log' },
    { label: 'Incoming SMS Log', path: '/admin/reports/incoming-sms' },
  ] },
  { label: 'Settings', path: '#', icon: 'fa fa-cogs', items: [
    { label: 'API Setting', path: '/admin/settings/api-setting' },
    { label: 'Create Operator', path: '/admin/settings/create-operator' },
    { label: 'Show Operator', path: '/admin/settings/show-operator' },
    { label: 'Service Settings', path: '/admin/settings/service-settings' },
    { label: 'Notification Settings', path: '/admin/settings/notifications' },
    { label: 'Send Bulk WhatsApp', path: '/admin/settings/send-bulk-whatsapp' },
    { label: 'Send Bulk Email', path: '/admin/settings/send-bulk-email' },
    { label: 'Wallet Settings', path: '/admin/settings/wallet-settings' },
    { label: 'Website Settings', path: '/admin/settings/website-settings' },
  ] },
];

function renderAdminMenuList(activePath = '') {
  return ADMIN_PANEL_MENU.map((item) => {
    const label = escapeHtml(item.label);
    const iconHtml = item.icon ? `<i class="${item.icon} menu-icon mr-1"></i>` : '';
    if (!item.items?.length) {
      const activeClass = (activePath === item.path || (item.path !== '/admin/' && activePath.startsWith(item.path))) ? ' active' : '';
      return `<li aria-haspopup="true"><a class="font-weight-bold${activeClass}" style="font-weight:700" href="${item.path}">${iconHtml}${label}</a></li>`;
    }
    const hasActiveChild = item.items.some(c => activePath && activePath.startsWith(c.path));
    const activeClass = hasActiveChild ? ' active' : '';

    // If configured as 2 columns (like Reports in reference image)
    if (item.twoColumns && item.items.length > 1) {
      const mid = Math.ceil(item.items.length / 2);
      const col1Items = item.items.slice(0, mid);
      const col2Items = item.items.slice(mid);

      const renderCol = (list, isSecond) => {
        const lis = list.map((child) => {
          const childActive = activePath === child.path ? ' active text-primary' : '';
          return `<li aria-haspopup="true"><a class="font-weight-bold${childActive}" style="font-weight:700" href="${child.path}">${escapeHtml(child.label)}</a></li>`;
        }).join('');
        return `<ul class="menu-col${isSecond ? ' col-divider' : ''}">${lis}</ul>`;
      };

      const columnsHtml = `<div class="two-col-container">${renderCol(col1Items, false)}${renderCol(col2Items, true)}</div>`;
      return `<li aria-haspopup="true"><a href="${item.path}" class="sub-icon font-weight-bold${activeClass}" style="font-weight:700">${iconHtml}${label} <i class="fa fa-angle-down horizontal-icon"></i></a><ul class="sub-menu two-columns"><li class="two-col-li" style="width:100%;list-style:none;">${columnsHtml}</li></ul></li>`;
    }

    const children = item.items.map((child) => {
      const childActive = activePath === child.path ? ' active text-primary' : '';
      return `<li aria-haspopup="true"><a class="font-weight-bold${childActive}" style="font-weight:700" href="${child.path}">${escapeHtml(child.label)}</a></li>`;
    }).join('');
    return `<li aria-haspopup="true"><a href="${item.path}" class="sub-icon font-weight-bold${activeClass}" style="font-weight:700">${iconHtml}${label} <i class="fa fa-angle-down horizontal-icon"></i></a><ul class="sub-menu">${children}</ul></li>`;
  }).join('');
}

function renderAdminNavigation(activePath = '') {
  const entries = renderAdminMenuList(activePath);
  return `<!-- Horizontal-menu -->
  <div class="sticky">
    <div class="horizontal-main hor-menu clearfix">
      <div class="horizontal-mainwrapper container-fluid px-2 clearfix">
        <nav class="horizontalMenu clearfix">
          <ul class="horizontalMenu-list">${entries}</ul>
        </nav>
      </div>
    </div>
  </div>
  <!-- Horizontal-menu end -->
  <style>
    .horizontalMenu-list > li > a {
      font-weight: 700 !important;
      font-size: 13.5px !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
    }
    .horizontalMenu-list > li > a > i.menu-icon {
      font-size: 14px !important;
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
  </style>`;
}

module.exports = { ADMIN_PANEL_MENU, renderAdminMenuList, renderAdminNavigation };
