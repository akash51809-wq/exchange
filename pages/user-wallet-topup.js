'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { USER_PANEL_MENU, renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const { getWalletMode } = require('../lib/wallet-helper');

module.exports = function createPageModule({ db, formatMinorUnits }) {
async function sendWalletTopupRequestPage(user, response) {
  const userName = escapeHtml(user.name);
  const userId = escapeHtml(user.username);
  const walletMode = await getWalletMode(db);
  const isSeparate = (walletMode === 'separate');

  // Fetch active bank accounts configured by admin
  const bankResult = await db.query(
    `SELECT id, bank_name, branch_name, account_holder, account_number, ifsc_code,
            billing_info, cash_deposit_charges, upi_id, qr_image_url, bank_logo_url
     FROM admin_bank_accounts
     WHERE is_active = true
     ORDER BY created_at ASC`,
  );
  const activeBanks = bankResult.rows;

  const requests = await db.query(
    `SELECT r.id, r.amount_minor, r.bank_code, r.bank_account_id, r.payment_mode, r.status, r.review_note, r.created_at,
            COALESCE(b.bank_name, r.bank_name, r.bank_code) as display_bank,
            COALESCE(b.account_number, r.deposit_account) as display_account
     FROM wallet_fund_requests r
     LEFT JOIN admin_bank_accounts b ON b.id = r.bank_account_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC
     LIMIT 50`,
    [user.id],
  );

  const navigationHtml = renderUserNavigation(walletMode, '/fund/wallet-topup-request');

  const statusLabels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
  const historyRows = requests.rows.map((request) => {
    const minor = BigInt(request.amount_minor || 0);
    const amount = (minor / 100n).toString() + '.' + String(minor % 100n).padStart(2, '0');
    const badgeClass = request.status === 'approved' ? 'badge-success' : (request.status === 'pending' ? 'badge-warning' : 'badge-danger');
    return `<tr>
      <td>${escapeHtml(new Date(request.created_at).toLocaleString('en-IN'))}</td>
      <td>
        <div class="d-flex align-items-center">
          ${request.bank_account_id ? `<img src="/api/bank-logo/${request.bank_account_id}" style="max-height:20px;max-width:28px;object-fit:contain;margin-right:6px;border-radius:2px;" alt="" onerror="this.style.display='none'">` : ''}
          <strong>${escapeHtml(request.display_bank || 'Bank')}</strong>
        </div>
      </td>
      <td class="font-weight-bold text-primary">₹${amount}</td>
      <td>${escapeHtml(request.payment_mode)}</td>
      <td><span class="badge ${badgeClass}">${statusLabels[request.status] || request.status}</span></td>
      <td>${escapeHtml(request.review_note || '—')}</td>
    </tr>`;
  }).join('');

  const bankTableRows = activeBanks.map((b, i) => {
    const charges = b.cash_deposit_charges ? `₹${Number(b.cash_deposit_charges).toFixed(2)}` : '₹0.00';
    const qrCol = b.qr_image_url
      ? `<a href="${escapeHtml(b.qr_image_url)}" target="_blank" rel="noopener"><img src="${escapeHtml(b.qr_image_url)}" alt="QR" style="max-height:36px; border-radius:4px;"></a>`
      : (b.upi_id ? `<code class="font-monospace">${escapeHtml(b.upi_id)}</code>` : '—');

    return `<tr>
      <td class="text-center font-weight-bold">${i + 1}</td>
      <td>
        <div class="d-flex align-items-center">
          <img src="/api/bank-logo/${b.id}" style="max-height:28px;max-width:38px;object-fit:contain;margin-right:8px;border-radius:3px;" alt="" onerror="this.style.display='none'">
          <strong class="text-primary">${escapeHtml(b.bank_name)}</strong>
        </div>
      </td>
      <td>${escapeHtml(b.branch_name || 'Main Branch')}</td>
      <td>${escapeHtml(b.account_holder)}</td>
      <td><code class="font-weight-bold text-dark font-monospace" style="font-size:14px;">${escapeHtml(b.account_number)}</code></td>
      <td><span class="badge badge-light border text-uppercase font-monospace">${escapeHtml(b.ifsc_code)}</span></td>
      <td><small>${escapeHtml(b.billing_info || '—')}</small></td>
      <td class="text-right font-weight-bold text-danger">${charges}</td>
      <td class="text-center">${qrCol}</td>
      <td>${escapeHtml(b.bank_name)}</td>
    </tr>`;
  }).join('');

  const bankSelectOptions = activeBanks.map((b) => {
    return `<option value="${b.id}" data-account="${escapeHtml(b.account_number)}" data-name="${escapeHtml(b.bank_name)}" data-logo="/api/bank-logo/${b.id}">${escapeHtml(b.bank_name)} - ${escapeHtml(b.branch_name || b.account_number)}</option>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Wallet Topup Request - Exchange</title>
  <link rel="icon" type="image/x-icon" href="/api/favicon">
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    .font-monospace { font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    /* Remove scroll arrows from number input */
    input[type=number]::-webkit-inner-spin-button,
    input[type=number]::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    input[type=number] {
      -moz-appearance: textfield;
    }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    ${navigationHtml}

    <main class="main-content">
      <div class="container-fluid px-2">
        <div class="page-header d-flex justify-content-between align-items-center mb-3">
          <h4 class="page-title mb-0">Wallet Topup Request</h4>
          <button type="button" class="btn btn-primary shadow-sm" data-toggle="modal" data-target="#wallet-topup-modal">
            <i class="fa fa-plus-circle mr-1"></i> Fund Request
          </button>
        </div>

        ${isSeparate ? `
        <div class="alert alert-info border-0 shadow-sm d-flex align-items-center mb-3" style="background: #eff6ff; border-left: 4px solid #2563eb !important;">
          <i class="fa fa-info-circle text-primary mr-2" style="font-size: 18px;"></i>
          <span class="fs-13"><strong>Dual Wallet Active:</strong> Approved fund requests are credited directly to your <strong>Buyer Wallet</strong> for mobile/DTH recharge purchases.</span>
        </div>` : ''}

        <section class="card mb-4 shadow-sm">
          <div class="card-header bg-white border-bottom">
            <h3 class="card-title font-weight-bold text-dark mb-0">
              <i class="fa fa-university text-primary mr-1"></i> Company Bank Details for Payment
            </h3>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-striped table-hover mb-0">
                <thead class="bg-light">
                  <tr>
                    <th class="text-center" style="width: 45px;">#</th>
                    <th>Bank Name</th>
                    <th>Branch Name</th>
                    <th>Account Holder</th>
                    <th>Account Number</th>
                    <th>IFSC Code</th>
                    <th>Billing Info</th>
                    <th class="text-right">Deposit Fee</th>
                    <th class="text-center">UPI / QR</th>
                    <th>Bank Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${bankTableRows || '<tr><td colspan="10" class="text-center py-4 text-muted">No active bank accounts found. Please contact administration.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section class="card shadow-sm">
          <div class="card-header bg-white border-bottom">
            <h3 class="card-title font-weight-bold text-dark mb-0">
              <i class="fa fa-history text-secondary mr-1"></i> My Fund Requests
            </h3>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-striped table-hover mb-0">
                <thead class="bg-light">
                  <tr>
                    <th>Requested At</th>
                    <th>Bank Deposited</th>
                    <th>Amount</th>
                    <th>Payment Mode</th>
                    <th>Status</th>
                    <th>Admin Note</th>
                  </tr>
                </thead>
                <tbody>
                  ${historyRows || '<tr><td colspan="6" class="text-center py-4 text-muted">No fund requests yet.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</div>

<div class="modal fade" id="wallet-topup-modal" tabindex="-1" role="dialog" aria-labelledby="wallet-topup-title" aria-hidden="true">
  <div class="modal-dialog modal-lg modal-dialog-scrollable" role="document">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title font-weight-bold text-white" id="wallet-topup-title">
          <i class="fa fa-money mr-1"></i> Submit Wallet Fund Request
        </h5>
        <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body p-4">
        <div class="alert alert-info py-2">
          <i class="fa fa-info-circle mr-1"></i> Wallet balance will be credited directly to your wallet once verified and approved by the admin team.
        </div>
        <form id="wallet-topup-form">
          <div class="form-row">
            <div class="form-group col-md-6">
              <label for="topup-bank" class="font-weight-bold">Choose Bank <span class="text-danger">*</span></label>
              <div class="d-flex align-items-center">
                <img id="topup-bank-logo" src="" style="width:36px;height:36px;object-fit:contain;margin-right:8px;border-radius:4px;border:1px solid #cbd5e1;display:none;" alt="Bank Logo">
                <select id="topup-bank" class="form-control" required>
                  <option value="">Select Bank</option>
                  ${bankSelectOptions}
                </select>
              </div>
            </div>
            <div class="form-group col-md-6">
              <label for="topup-deposit-account" class="font-weight-bold">Deposit Account Number</label>
              <input id="topup-deposit-account" class="form-control font-monospace" placeholder="Select bank above" readonly>
            </div>
            <div class="form-group col-md-6">
              <label for="topup-payment-mode" class="font-weight-bold">Payment Mode <span class="text-danger">*</span></label>
              <select id="topup-payment-mode" class="form-control" required>
                <option value="">Select Payment Mode</option>
                <option>Bank Transfer</option>
                <option>UPI</option>
                <option>Cash Deposit</option>
              </select>
            </div>
            <div class="form-group col-md-6">
              <label for="topup-amount" class="font-weight-bold">Requested Amount (₹) <span class="text-danger">*</span></label>
              <input id="topup-amount" type="number" class="form-control" min="0.01" max="10000000" step="0.01" placeholder="Enter amount manually, e.g. 5000" required>
            </div>
            <div class="form-group col-md-12">
              <label for="topup-wallet-type" class="font-weight-bold">Wallet Type <span class="text-danger">*</span></label>
              <select id="topup-wallet-type" class="form-control" required>
                <option>Prepaid</option>
              </select>
            </div>
            <div class="form-group col-md-12">
              <label for="topup-transaction-id" class="font-weight-bold">UTR / Transaction Reference ID <span class="text-danger">*</span></label>
              <input id="topup-transaction-id" class="form-control font-monospace" maxlength="80" placeholder="Enter unique bank UTR / Ref ID (e.g. 423456789012)" required>
              <small class="form-text text-muted">Mandatory bank transaction reference number. Note: 1 UTR can only be submitted once lifetime across the entire system.</small>
            </div>
            <div class="form-group col-12">
              <label for="topup-proof" class="font-weight-bold">Upload Payment Slip / Screenshot (Optional, max 512 KB)</label>
              <input id="topup-proof" type="file" class="form-control-file" accept="image/png,image/jpeg,image/webp,image/gif">
            </div>
          </div>
          <hr>
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <p id="topup-message" class="mb-0 font-weight-bold text-danger" role="status" aria-live="polite"></p>
            </div>
            <div>
              <button type="button" class="btn btn-secondary mr-2" data-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary px-4" id="submitTopupBtn">
                <i class="fa fa-send mr-1"></i> Submit Request
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="/auth-client.js"></script>
<script>
document.getElementById('topup-bank').addEventListener('change', function() {
  const sel = this.options[this.selectedIndex];
  document.getElementById('topup-deposit-account').value = sel ? (sel.dataset.account || '') : '';
  const logoEl = document.getElementById('topup-bank-logo');
  if (sel && sel.dataset.logo) {
    logoEl.src = sel.dataset.logo;
    logoEl.style.display = 'inline-block';
    logoEl.onerror = () => { logoEl.style.display = 'none'; };
  } else {
    logoEl.style.display = 'none';
  }
});

const form = document.getElementById('wallet-topup-form');
const submitBtn = document.getElementById('submitTopupBtn');

form.addEventListener('submit', async function(event) {
  event.preventDefault();
  const message = document.getElementById('topup-message');
  message.textContent = '';
  message.className = 'mb-0 font-weight-bold text-info';
  message.textContent = 'Submitting request...';
  submitBtn.disabled = true;

  const file = document.getElementById('topup-proof').files[0];
  let proof = null;
  if (file) {
    if (file.size > 524288) {
      message.className = 'mb-0 font-weight-bold text-danger';
      message.textContent = 'Proof image must be under 512 KB.';
      submitBtn.disabled = false;
      return;
    }
    proof = {
      mime: file.type,
      base64: await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })
    };
  }

  const bankSelect = document.getElementById('topup-bank');
  const selectedBankOption = bankSelect.options[bankSelect.selectedIndex];
  const bankId = bankSelect.value;
  const bankName = selectedBankOption ? selectedBankOption.dataset.name : '';

  try {
    const response = await fetch('/api/fund-requests', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bankId,
        bankCode: bankName || bankId,
        paymentMode: document.getElementById('topup-payment-mode').value,
        amount: document.getElementById('topup-amount').value,
        walletType: document.getElementById('topup-wallet-type').value,
        transactionId: document.getElementById('topup-transaction-id').value,
        proof
      })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Failed to submit fund request.');
    message.className = 'mb-0 font-weight-bold text-success';
    message.textContent = 'Fund request submitted successfully! Wallet balance will update upon admin approval.';
    form.reset();
    document.getElementById('topup-deposit-account').value = '';
    document.getElementById('topup-bank-logo').style.display = 'none';
    setTimeout(() => location.reload(), 1200);
  } catch (error) {
    message.className = 'mb-0 font-weight-bold text-danger';
    message.textContent = error.message;
    submitBtn.disabled = false;
  }
});
</script>
</body>
</html>`;

  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
  });
  response.end(await addPanelChrome(html, { role: 'user', userId: user.id, db, currentPath: '/fund/wallet-topup-request' }));
}

  return { sendWalletTopupRequestPage };
};
