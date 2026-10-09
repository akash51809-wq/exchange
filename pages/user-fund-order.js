'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { USER_PANEL_MENU, renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createPageModule({ db, formatMinorUnits, fundFieldHash, decryptFundField, httpError: providedHttpError }) {
const httpError = providedHttpError || ((message, statusCode = 400) => Object.assign(new Error(message), { statusCode }));

async function sendUserFundOrderPage(user, response, searchParams) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const filters = {
    limit: ['50', '100', '250', '500'].includes(searchParams.get('limit')) ? searchParams.get('limit') : '50',
    wallet: searchParams.get('wallet') || '',
    status: searchParams.get('status') || '',
    from: searchParams.has('from') ? searchParams.get('from') : today,
    to: searchParams.has('to') ? searchParams.get('to') : today,
    mode: searchParams.get('mode') || '',
    accountNumber: String(searchParams.get('accountNumber') || '').trim(),
    transactionId: String(searchParams.get('transactionId') || '').trim(),
  };
  const isValidDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [yearStr, monthStr, dayStr] = value.split('-');
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const d = parseInt(dayStr, 10);
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };
  if ((filters.from && !isValidDate(filters.from)) || (filters.to && !isValidDate(filters.to))) {
    throw httpError('Invalid date format. Please select a valid calendar date in YYYY-MM-DD format.', 400);
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    throw httpError('From Date cannot be later than To Date.', 400);
  }
  if (filters.wallet && filters.wallet !== 'Prepaid') {
    throw httpError('Invalid wallet type selected.', 400);
  }
  if (filters.status && !['pending', 'approved', 'rejected'].includes(filters.status)) {
    throw httpError('Invalid status filter selected.', 400);
  }
  if (filters.mode && !['Bank Transfer', 'UPI', 'Cash Deposit'].includes(filters.mode)) {
    throw httpError('Invalid payment mode selected.', 400);
  }

  const conditions = ['r.user_id = $1'];
  const values = [user.id];
  const addValue = (sql) => { values.push(sql); return `$${values.length}`; };
  if (filters.from) conditions.push(`r.created_at >= (${addValue(filters.from)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
  if (filters.to) conditions.push(`r.created_at < (((${addValue(filters.to)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
  if (filters.wallet) conditions.push(`r.wallet_type = ${addValue(filters.wallet)}`);
  if (filters.status) conditions.push(`r.status = ${addValue(filters.status)}`);
  if (filters.mode) conditions.push(`r.payment_mode = ${addValue(filters.mode)}`);
  if (filters.accountNumber) {
    const normalized = filters.accountNumber.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z0-9]{5,34}$/.test(normalized)) {
      throw httpError('Invalid account number filter format.', 400);
    }
    conditions.push(`r.source_account_hash = ${addValue(fundFieldHash('account', normalized))}`);
  }
  if (filters.transactionId) {
    const normalized = filters.transactionId.toUpperCase();
    if (!/^[A-Z0-9/._-]{3,80}$/.test(normalized)) {
      throw httpError('Invalid transaction ID filter format.', 400);
    }
    conditions.push(`r.transaction_id_hash = ${addValue(fundFieldHash('transaction', normalized))}`);
  }
  const limitParam = addValue(Number(filters.limit));
  const result = await db.query(
    `SELECT r.id, r.amount_minor, r.bank_code, r.payment_mode, r.wallet_type,
            r.source_account_ciphertext, r.transaction_id_ciphertext, r.status, r.review_note, r.created_at
     FROM wallet_fund_requests r WHERE ${conditions.join(' AND ')}
     ORDER BY r.created_at DESC LIMIT ${limitParam}`,
    values,
  );
  const statusLabels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
  const rows = result.rows.map((row, index) => {
    const sourceAccount = row.source_account_ciphertext ? decryptFundField(row.source_account_ciphertext, 'account') : '—';
    const transactionId = row.transaction_id_ciphertext ? decryptFundField(row.transaction_id_ciphertext, 'transaction') : '—';
    const badge = row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning';
    return `<tr><td>${index + 1}</td><td>${row.bank_code === 'axis' ? 'AXIS BANK' : escapeHtml(row.bank_code)}</td><td>S3 SOLUTION &amp; SERVICE COMPANY</td><td>${escapeHtml(sourceAccount)}</td><td>${escapeHtml(row.payment_mode)}</td><td>${escapeHtml(transactionId)}</td><td>—</td><td>—</td><td>—</td><td>${escapeHtml(new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))}</td><td>₹${formatMinorUnits(row.amount_minor)}</td><td><span class="badge badge-${badge}">${statusLabels[row.status]}</span></td><td>${escapeHtml(row.review_note || '—')}</td></tr>`;
  }).join('');
  const selected = (name, value) => filters[name] === value ? ' selected' : '';
  const menu = USER_PANEL_MENU.map((item) => {
    const label = escapeHtml(item.label);
    if (!item.items?.length) return `<li aria-haspopup="true"><a class="font-weight-bold" style="font-weight:700" href="${item.path}">${label}</a></li>`;
    return `<li aria-haspopup="true"><a href="${item.path}" class="sub-icon font-weight-bold" style="font-weight:700">${label} <i class="fa fa-angle-down horizontal-icon"></i></a><ul class="sub-menu">${item.items.map((child) => `<li aria-haspopup="true"><a class="font-weight-bold" style="font-weight:700" href="${child.path}">${escapeHtml(child.label)}</a></li>`).join('')}</ul></li>`;
  }).join('');
  const html = `<!DOCTYPE html><html lang="en" dir="ltr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My Fund Order - Exchange</title><link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css"><link rel="stylesheet" href="/assets/css/style.css"><link rel="stylesheet" href="/assets/css/dark.css"><link rel="stylesheet" href="/assets/css/skins.css"><link rel="stylesheet" href="/assets/css/icons.css"></head><body><div class="page"><div class="page-main"><div class="sticky"><div class="horizontal-main hor-menu clearfix"><div class="horizontal-mainwrapper container-fluid px-2 clearfix"><nav class="horizontalMenu clearfix"><ul class="horizontalMenu-list">${menu}</ul></nav></div></div></div><main class="main-content"><div class="container-fluid px-2"><div class="page-header"><h4 class="page-title">My Fund Order History</h4></div><section class="card"><div class="card-header"><h3 class="card-title">Fund Request Filters</h3></div><div class="card-body"><form method="GET" action="/report/fund-order"><div class="form-row"><div class="form-group col-md-3"><label for="limit">Choose Top</label><select id="limit" name="limit" class="form-control"><option value="50"${selected('limit', '50')}>50</option><option value="100"${selected('limit', '100')}>100</option><option value="250"${selected('limit', '250')}>250</option><option value="500"${selected('limit', '500')}>500</option></select></div><div class="form-group col-md-3"><label for="wallet">Wallet Type</label><select id="wallet" name="wallet" class="form-control"><option value="">All Wallets</option><option value="Prepaid"${selected('wallet', 'Prepaid')}>Prepaid</option></select></div><div class="form-group col-md-3"><label for="status">Choose Status</label><select id="status" name="status" class="form-control"><option value="">All Status</option><option value="pending"${selected('status', 'pending')}>Pending</option><option value="approved"${selected('status', 'approved')}>Approved</option><option value="rejected"${selected('status', 'rejected')}>Rejected</option></select></div><div class="form-group col-md-3"><label for="from">From Date</label><input id="from" name="from" type="date" class="form-control" value="${escapeHtml(filters.from)}"></div><div class="form-group col-md-3"><label for="to">To Date</label><input id="to" name="to" type="date" class="form-control" value="${escapeHtml(filters.to)}"></div><div class="form-group col-md-3"><label for="mode">Choose Mode</label><select id="mode" name="mode" class="form-control"><option value="">All Modes</option><option${selected('mode', 'Bank Transfer')} value="Bank Transfer">Bank Transfer</option><option${selected('mode', 'UPI')} value="UPI">UPI</option><option${selected('mode', 'Cash Deposit')} value="Cash Deposit">Cash Deposit</option></select></div><div class="form-group col-md-3"><label for="accountNumber">Enter Account No.</label><input id="accountNumber" name="accountNumber" class="form-control" value="${escapeHtml(filters.accountNumber)}" placeholder="Enter account number" maxlength="34"></div><div class="form-group col-md-3"><label for="transactionId">Enter Transaction ID</label><div class="input-group"><input id="transactionId" name="transactionId" class="form-control" value="${escapeHtml(filters.transactionId)}" placeholder="Enter transaction ID" maxlength="80"><div class="input-group-append"><button class="btn btn-outline-primary" type="submit">Search</button></div></div></div></div><button class="btn btn-primary" type="submit">Apply Filters</button> <a class="btn btn-secondary" href="/report/fund-order">Reset</a></form></div></section><section class="card"><div class="card-header"><h3 class="card-title">Fund Request Records (${result.rowCount})</h3></div><div class="card-body"><div class="table-responsive"><table class="table table-bordered table-striped table-sm"><thead><tr><th>#</th><th>Bank</th><th>Account Holder</th><th>Account No.</th><th>Transfer Mode</th><th>Transaction ID</th><th>Mobile No.</th><th>Cheque No.</th><th>Card Number</th><th>Entry Date</th><th>Amount (₹)</th><th>Status</th><th>Remark</th></tr></thead><tbody>${rows || '<tr><td colspan="13" class="text-center">No Record Found</td></tr>'}</tbody></table></div></div></section></div></main></div></div><script src="/assets/js/jquery-3.5.1.min.js"></script><script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script><script src="/assets/plugins/horizontal-menu/horizontal.js"></script><script src="/auth-client.js"></script></body></html>`;
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
  });
  response.end(await addPanelChrome(html, { role: 'user', userId: user.id, db }));
}

  return { sendUserFundOrderPage };
};
