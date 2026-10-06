'use strict';

const { escapeHtml } = require('../lib/page-utils');

const ADMIN_PANEL_MENU = [
  { label: 'Dashboard', path: '/admin/' },
  { label: 'User', path: '#', items: [
    { label: 'List User', path: '/admin/users/list' },
  ] },
  { label: 'Payment', path: '#', items: [
    { label: 'Fund Request', path: '/admin/payment/fund-request' },
    { label: 'Bank List', path: '/admin/payment/bank-list' },
    { label: 'Bank Approval', path: '/admin/payment/bank-approval' },
    { label: 'Payout Requests', path: '/admin/payment/payout-requests' },
  ] },
  { label: 'Disputes', path: '/admin/disputes' },
  { label: 'Request API Approval', path: '/admin/seller-api/requests' },
  { label: 'Reports', path: '#', items: [
    { label: 'Recharge Report', path: '/admin/reports/recharge-report' },
    { label: 'Invoices', path: '/admin/invoice' },
  ] },
  { label: 'Settings', path: '#', items: [
    { label: 'Create Operator', path: '/admin/settings/create-operator' },
    { label: 'Show Operator', path: '/admin/settings/show-operator' },
    { label: 'Service Settings', path: '/admin/settings/service-settings' },
  ] },
];

function renderAdminMenuList(activePath = '') {
  return ADMIN_PANEL_MENU.map((item) => {
    const label = escapeHtml(item.label);
    if (!item.items?.length) {
      const activeClass = (activePath === item.path || (item.path !== '/admin/' && activePath.startsWith(item.path))) ? ' active' : '';
      return `<li aria-haspopup="true"><a class="font-weight-bold${activeClass}" style="font-weight:700" href="${item.path}">${label}</a></li>`;
    }
    const hasActiveChild = item.items.some(c => activePath && activePath.startsWith(c.path));
    const activeClass = hasActiveChild ? ' active' : '';
    const children = item.items.map((child) => {
      const childActive = activePath === child.path ? ' active font-weight-bold text-primary' : '';
      return `<li aria-haspopup="true"><a class="${childActive}" href="${child.path}">${escapeHtml(child.label)}</a></li>`;
    }).join('');
    return `<li aria-haspopup="true"><a href="${item.path}" class="sub-icon font-weight-bold${activeClass}" style="font-weight:700">${label} <i class="fa fa-angle-down horizontal-icon"></i></a><ul class="sub-menu">${children}</ul></li>`;
  }).join('');
}

function renderAdminNavigation(activePath = '') {
  const entries = renderAdminMenuList(activePath);
  return `<!-- Horizontal-menu --><div class="sticky"><div class="horizontal-main hor-menu clearfix"><div class="horizontal-mainwrapper container-fluid px-2 clearfix"><nav class="horizontalMenu clearfix"><ul class="horizontalMenu-list">${entries}</ul></nav></div></div></div><!-- Horizontal-menu end -->`;
}

module.exports = { ADMIN_PANEL_MENU, renderAdminMenuList, renderAdminNavigation };
