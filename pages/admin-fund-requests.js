'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { USER_PANEL_MENU, renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createPageModule({ db, formatMinorUnits, decryptFundField }) {
async function sendAdminFundRequestsPage(admin, response) {
  const result = await db.query(
    `SELECT r.id, r.amount_minor, r.bank_code, r.payment_mode, r.wallet_type, r.proof_mime,
            r.source_account_ciphertext, r.transaction_id_ciphertext,
            r.status, r.review_note, r.created_at, u.username, u.name,
            COALESCE(b.bank_name, r.bank_name, r.bank_code) as bank_display,
            COALESCE(b.account_number, r.deposit_account) as deposit_account_num
     FROM wallet_fund_requests r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN admin_bank_accounts b ON b.id = r.bank_account_id
     ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 500`,
  );
  const rows = result.rows.map((row) => {
    const proof = row.proof_mime ? `<a class="btn btn-sm btn-outline-info" target="_blank" rel="noopener" href="/admin/payment/fund-request/proof/${row.id}">प्रूफ देखें</a>` : '—';
    const accountNumber = row.source_account_ciphertext ? decryptFundField(row.source_account_ciphertext, 'account') : '—';
    const transactionId = row.transaction_id_ciphertext ? decryptFundField(row.transaction_id_ciphertext, 'transaction') : '—';
    const actions = row.status === 'pending'
      ? `<button type="button" class="btn btn-sm btn-success mr-1" data-action="approve" data-id="${row.id}">Approve</button><button type="button" class="btn btn-sm btn-danger" data-action="reject" data-id="${row.id}">Reject</button>`
      : `<span class="badge badge-${row.status === 'approved' ? 'success' : 'secondary'}">${row.status === 'approved' ? 'Approved' : 'Rejected'}</span>`;
    return `<tr>
      <td>${escapeHtml(row.username)}</td>
      <td>${escapeHtml(row.name)}</td>
      <td><strong class="text-primary">${escapeHtml(row.bank_display || 'Bank')}</strong>${row.deposit_account_num ? `<div class="small text-muted font-monospace">${escapeHtml(row.deposit_account_num)}</div>` : ''}</td>
      <td class="font-weight-bold">₹${formatMinorUnits(row.amount_minor)}</td>
      <td>${escapeHtml(row.payment_mode)}</td>
      <td>${escapeHtml(row.wallet_type)}</td>
      <td>${escapeHtml(accountNumber)}</td>
      <td>${escapeHtml(transactionId)}</td>
      <td>${proof}</td>
      <td>${escapeHtml(new Date(row.created_at).toLocaleString('en-IN'))}</td>
      <td>${actions}${row.review_note ? `<div class="small mt-1">${escapeHtml(row.review_note)}</div>` : ''}</td>
    </tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fund Requests - Exchange</title><link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css"><link rel="stylesheet" href="/assets/css/style.css"><link rel="stylesheet" href="/assets/css/dark.css"><link rel="stylesheet" href="/assets/css/skins.css"><link rel="stylesheet" href="/assets/css/icons.css"></head><body><div class="page"><div class="page-main"><div class="sticky"><div class="horizontal-main hor-menu clearfix"><div class="horizontal-mainwrapper container-fluid px-2 clearfix"><nav class="horizontalMenu clearfix"><ul class="horizontalMenu-list"><li><a href="/admin/">Dashboard</a></li><li><a href="#">User</a><ul class="sub-menu"><li><a href="/admin/users/list">List User</a></li></ul></li><li><a href="#">Payment</a><ul class="sub-menu"><li><a href="/admin/payment/fund-request">Fund Request</a></li><li><a href="/admin/payment/bank-list">Bank List</a></li></ul></li><li><a href="/admin/seller-api/requests">Request API Approval</a></li><li><a href="#">Settings</a><ul class="sub-menu"><li><a href="/admin/settings/create-operator">Create Operator</a></li><li><a href="/admin/settings/show-operator">Show Operator</a></li><li><a href="/admin/settings/service-settings">Service Settings</a></li></ul></li></ul></nav></div></div></div><main class="main-content"><div class="container-fluid px-2"><div class="page-header"><h4 class="page-title">Fund Request</h4></div><section class="card"><div class="card-header d-flex justify-content-between"><h3 class="card-title">Wallet Topup Requests</h3><button id="refresh-requests" class="btn btn-sm btn-outline-primary">Refresh</button></div><div class="card-body"><div id="fund-message" role="status" aria-live="polite"></div><div class="table-responsive"><table class="table table-bordered table-striped"><thead><tr><th>User ID</th><th>Name</th><th>Deposited In Bank</th><th>Amount</th><th>Payment Mode</th><th>Wallet</th><th>Depositor Account</th><th>Transaction ID</th><th>Proof</th><th>Requested At</th><th>Action / Status</th></tr></thead><tbody>${rows || '<tr><td colspan="11" class="text-center">No fund requests</td></tr>'}</tbody></table></div></div></section></div></main></div></div><script src="/assets/js/jquery-3.5.1.min.js"></script><script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script><script src="/auth-client.js"></script><script>document.getElementById('refresh-requests').addEventListener('click',()=>location.reload());document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{const action=button.dataset.action;let note='';if(action==='reject'){note=prompt('Reject karne ka note (optional):');if(note===null)return;}button.disabled=true;try{const response=await fetch('/api/admin/fund-requests/'+button.dataset.id+'/decision',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action,note})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Action poora nahin hua.');location.reload();}catch(error){document.getElementById('fund-message').className='alert alert-danger';document.getElementById('fund-message').textContent=error.message;button.disabled=false;}}));</script></body></html>`;
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
  });
  response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/payment/fund-request' }));
}

  return { sendAdminFundRequestsPage };
};
