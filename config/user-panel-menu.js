'use strict';

const { escapeHtml } = require('../lib/page-utils');

const USER_PANEL_MENU = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Fund', path: '/fund', items: [
    { label: 'Wallet Topup Request', path: '/fund/wallet-topup-request' },
    { label: 'Redeem', path: '/fund/redeem' },
    { label: 'Fund Dr/Cr Statement', path: '/fund/statement' },
  ] },
  { label: 'Buyer', path: '/buyer', items: [
    { label: 'Available Margin', path: '/buyer/available-margin' },
    { label: 'Buyer Margin', path: '/buyer/margin' },
    { label: 'Purchase Txn', path: '/buyer/purchase-txn' },
    { label: 'API Document', path: '/buyer/api-document' },
    { label: 'Purchase Refund', path: '/buyer/purchase-refund' },
    { label: 'Recharge Dispute', path: '/buyer/recharge-dispute' },
    { label: 'Operator-wise Purchase', path: '/buyer/operator-wise-purchase' },
  ] },
  { label: 'Seller', path: '/seller', items: [
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
  { label: 'User Report', path: '/report', items: [
    { label: 'Account Statement', path: '/report/account-statement' },
    { label: 'Fund Order', path: '/report/fund-order' },
  ] },
  { label: 'Alerts Setting', path: '/alerts-setting' },
  { label: 'Invoice', path: '/invoice', items: [
    { label: 'Buyer Invoice', path: '/invoice/buyer-invoice' },
    { label: 'Seller Invoice', path: '/invoice/seller-invoice' },
  ] },
  { label: 'Setting', path: '/setting', items: [
    { label: 'IP Setting', path: '/setting/ip-setting' },
    { label: 'Add Callback', path: '/setting/add-callback' },
    { label: 'Error List', path: '/setting/error-list' },
  ] },
  { label: 'Available Stock', path: '/available-stock' },
];

const USER_PANEL_PAGES = new Map();
const templateFor = (route) => `${route.split('/').filter(Boolean).join('-')}.html`;
for (const item of USER_PANEL_MENU) {
  if (item.path !== '/dashboard') USER_PANEL_PAGES.set(item.path, { title: item.label, template: templateFor(item.path) });
  for (const child of item.items || []) USER_PANEL_PAGES.set(child.path, { title: child.label, template: templateFor(child.path) });
}

function renderUserNavigation() {
  const entries = USER_PANEL_MENU.map((item) => {
    const label = escapeHtml(item.label);
    if (!item.items?.length) return `<li aria-haspopup="true"><a class="font-weight-bold" style="font-weight:700" href="${item.path}">${label}</a></li>`;
    const children = item.items.map((child) => `<li aria-haspopup="true"><a class="font-weight-bold" style="font-weight:700" href="${child.path}">${escapeHtml(child.label)}</a></li>`).join('');
    return `<li aria-haspopup="true"><a href="${item.path}" class="sub-icon font-weight-bold" style="font-weight:700">${label} <i class="fa fa-angle-down horizontal-icon"></i></a><ul class="sub-menu">${children}</ul></li>`;
  }).join('');
  return `<!-- Horizontal-menu --><div class="sticky"><div class="horizontal-main hor-menu clearfix"><div class="horizontal-mainwrapper container clearfix"><nav class="horizontalMenu clearfix"><ul class="horizontalMenu-list">${entries}</ul></nav></div></div></div><!-- Horizontal-menu end -->`;
}

module.exports = { USER_PANEL_MENU, USER_PANEL_PAGES, renderUserNavigation };
