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
    { label: 'Buyer GST Invoice', path: '/invoice/buyer-gst-invoice' },
    { label: 'Seller GST Invoice', path: '/invoice/seller-gst-invoice' },
    { label: 'Buyer Commission Invoice', path: '/invoice/buyer-commission-invoice' },
    { label: 'Seller Commission Invoice', path: '/invoice/seller-commission-invoice' },
  ] },
  { label: 'Setting', path: '/setting', items: [
    { label: 'IP Setting', path: '/setting/ip-setting' },
    { label: 'Add Callback', path: '/setting/add-callback' },
    { label: 'Error List', path: '/setting/error-list' },
  ] },
  { label: 'Available Stock', path: '/available-stock' },
];

function getUserPanelMenu(walletMode = 'single') {
  const isSeparate = (walletMode === 'separate');

  const accountItems = [];
  if (isSeparate) {
    accountItems.push({ label: 'Exchange Wallet Balance', path: '/account/wallet-exchange' });
  }
  accountItems.push({ label: 'Account Statement', path: '/report/account-statement' });

  return [
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
    { label: 'Account', path: '#', items: accountItems },
    { label: 'User Report', path: '/report', items: [
      { label: 'Account Statement', path: '/report/account-statement' },
      { label: 'Fund Order', path: '/report/fund-order' },
    ] },
    { label: 'Alerts Setting', path: '/alerts-setting' },
    { label: 'Invoice', path: '/invoice', items: [
      { label: 'Buyer GST Invoice', path: '/invoice/buyer-gst-invoice' },
      { label: 'Seller GST Invoice', path: '/invoice/seller-gst-invoice' },
      { label: 'Buyer Commission Invoice', path: '/invoice/buyer-commission-invoice' },
      { label: 'Seller Commission Invoice', path: '/invoice/seller-commission-invoice' },
    ] },
    { label: 'Setting', path: '/setting', items: [
      { label: 'IP Setting', path: '/setting/ip-setting' },
      { label: 'Add Callback', path: '/setting/add-callback' },
      { label: 'Error List', path: '/setting/error-list' },
    ] },
    { label: 'Available Stock', path: '/available-stock' },
  ];
}

const USER_PANEL_PAGES = new Map();
const templateFor = (route) => `${route.split('/').filter(Boolean).join('-')}.html`;
for (const item of getUserPanelMenu('separate')) {
  if (item.path !== '/dashboard' && item.path !== '#') USER_PANEL_PAGES.set(item.path, { title: item.label, template: templateFor(item.path) });
  for (const child of item.items || []) USER_PANEL_PAGES.set(child.path, { title: child.label, template: templateFor(child.path) });
}
USER_PANEL_PAGES.set('/invoice/buyer-invoice', { title: 'Buyer GST Invoice', template: 'invoice-buyer-gst-invoice.html' });
USER_PANEL_PAGES.set('/invoice/seller-invoice', { title: 'Seller GST Invoice', template: 'invoice-seller-gst-invoice.html' });
USER_PANEL_PAGES.set('/account/wallet-exchange', { title: 'Exchange Wallet Balance', template: 'account-wallet-exchange.html' });
USER_PANEL_PAGES.set('/user/account/wallet-exchange', { title: 'Exchange Wallet Balance', template: 'account-wallet-exchange.html' });

function renderUserMenuList(walletMode = 'single', activePath = '') {
  const menu = getUserPanelMenu(walletMode);
  return menu.map((item) => {
    const label = escapeHtml(item.label);
    if (!item.items?.length) {
      const activeClass = (activePath === item.path || (item.path !== '/dashboard' && activePath && activePath.startsWith(item.path))) ? ' active' : '';
      return `<li aria-haspopup="true"><a class="font-weight-bold${activeClass}" style="font-weight:700" href="${item.path}">${label}</a></li>`;
    }
    const hasActiveChild = item.items.some(c => activePath && activePath.startsWith(c.path));
    const activeClass = hasActiveChild ? ' active' : '';
    const children = item.items.map((child) => {
      const childActive = (activePath && activePath === child.path) ? ' active font-weight-bold text-primary' : '';
      return `<li aria-haspopup="true"><a class="${childActive}" href="${child.path}">${escapeHtml(child.label)}</a></li>`;
    }).join('');
    return `<li aria-haspopup="true"><a href="${item.path}" class="sub-icon font-weight-bold${activeClass}" style="font-weight:700">${label} <i class="fa fa-angle-down horizontal-icon"></i></a><ul class="sub-menu">${children}</ul></li>`;
  }).join('');
}

function renderUserNavigation(walletMode = 'single', activePath = '') {
  const entries = renderUserMenuList(walletMode, activePath);
  return `<!-- Horizontal-menu --><div class="sticky"><div class="horizontal-main hor-menu clearfix"><div class="horizontal-mainwrapper container clearfix"><nav class="horizontalMenu clearfix"><ul class="horizontalMenu-list">${entries}</ul></nav></div></div></div><!-- Horizontal-menu end -->`;
}

module.exports = {
  USER_PANEL_MENU,
  USER_PANEL_PAGES,
  getUserPanelMenu,
  renderUserMenuList,
  renderUserNavigation,
};
