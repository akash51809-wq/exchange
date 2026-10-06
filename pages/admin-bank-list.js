'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createPageModule({ db }) {
  async function sendAdminBankListPage(admin, response) {
    const result = await db.query(
      `SELECT id, bank_name, branch_name, account_holder, account_number, ifsc_code,
              billing_info, cash_deposit_charges, upi_id, qr_image_url, bank_logo_url,
              is_active, created_at, updated_at
       FROM admin_bank_accounts
       ORDER BY created_at ASC`,
    );

    const rows = result.rows.map((row, index) => {
      const activeBadge = row.is_active
        ? '<span class="badge badge-success px-2 py-1">Active</span>'
        : '<span class="badge badge-secondary px-2 py-1">Inactive</span>';

      const toggleBtn = `<button type="button" class="btn btn-sm btn-${row.is_active ? 'outline-warning' : 'outline-success'} mr-1" data-toggle-action="${row.id}" data-current-status="${row.is_active}">
        ${row.is_active ? '<i class="fa fa-pause mr-1"></i>Deactivate' : '<i class="fa fa-play mr-1"></i>Activate'}
      </button>`;

      const editBtn = `<button type="button" class="btn btn-sm btn-outline-primary mr-1" data-edit-bank='${escapeHtml(JSON.stringify(row))}'>
        <i class="fa fa-edit mr-1"></i>Edit
      </button>`;

      const deleteBtn = `<button type="button" class="btn btn-sm btn-outline-danger" data-delete-bank="${row.id}" data-bank-name="${escapeHtml(row.bank_name)}">
        <i class="fa fa-trash mr-1"></i>Delete
      </button>`;

      const charges = row.cash_deposit_charges ? `₹${Number(row.cash_deposit_charges).toFixed(2)}` : '₹0.00';

      return `<tr>
        <td class="font-weight-bold text-center">${index + 1}</td>
        <td>
          <div class="font-weight-bold text-primary">${escapeHtml(row.bank_name)}</div>
          <small class="text-muted"><i class="fa fa-map-marker mr-1"></i>${escapeHtml(row.branch_name || 'Main Branch')}</small>
        </td>
        <td><strong>${escapeHtml(row.account_holder)}</strong></td>
        <td><code class="font-weight-bold font-monospace text-dark" style="font-size: 14px;">${escapeHtml(row.account_number)}</code></td>
        <td><span class="badge badge-light border text-uppercase font-monospace">${escapeHtml(row.ifsc_code)}</span></td>
        <td><small class="text-dark">${escapeHtml(row.billing_info || '—')}</small></td>
        <td class="text-right font-weight-bold text-danger">${charges}</td>
        <td class="text-center">${activeBadge}</td>
        <td class="text-center text-nowrap">
          ${toggleBtn}
          ${editBtn}
          ${deleteBtn}
        </td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payment Bank List - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    .bank-card { border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .table th { background-color: #f1f5f9; color: #334155; font-weight: 600; vertical-align: middle; }
    .font-monospace { font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    <div class="sticky">
      <div class="horizontal-main hor-menu clearfix">
        <div class="horizontal-mainwrapper container-fluid px-2 clearfix">
          <nav class="horizontalMenu clearfix">
            <ul class="horizontalMenu-list">
              <li><a href="/admin/">Dashboard</a></li>
              <li><a href="#">User <i class="fa fa-angle-down"></i></a>
                <ul class="sub-menu">
                  <li><a href="/admin/users/list">List User</a></li>
                </ul>
              </li>
              <li><a href="#">Payment <i class="fa fa-angle-down"></i></a>
                <ul class="sub-menu">
                  <li><a href="/admin/payment/fund-request">Fund Request</a></li>
                  <li><a href="/admin/payment/bank-list">Bank List</a></li>
                </ul>
              </li>
              <li><a href="/admin/seller-api/requests">Request API Approval</a></li>
              <li><a href="#">Settings <i class="fa fa-angle-down"></i></a>
                <ul class="sub-menu">
                  <li><a href="/admin/settings/create-operator">Create Operator</a></li>
                  <li><a href="/admin/settings/show-operator">Show Operator</a></li>
                  <li><a href="/admin/settings/service-settings">Service Settings</a></li>
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </div>

    <main class="main-content">
      <div class="container-fluid px-2">
        <div class="page-header d-flex justify-content-between align-items-center mb-4">
          <div>
            <h4 class="page-title mb-1">Payment Bank List</h4>
            <p class="text-muted mb-0 small">Add or manage bank accounts. Only active banks configured here will be displayed to users in Wallet Topup Request.</p>
          </div>
          <div>
            <button type="button" class="btn btn-primary shadow-sm" data-toggle="modal" data-target="#bankModal" onclick="prepareAddBank()">
              <i class="fa fa-plus-circle mr-1"></i> Add New Bank
            </button>
          </div>
        </div>

        <div id="alertPlaceholder"></div>

        <section class="card bank-card">
          <div class="card-header d-flex justify-content-between align-items-center bg-white border-bottom py-3">
            <h3 class="card-title text-dark font-weight-bold mb-0">
              <i class="fa fa-university text-primary mr-2"></i> Configured Bank Accounts
            </h3>
            <span class="badge badge-info px-3 py-2 font-weight-bold">${result.rows.length} Total Accounts</span>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-striped table-hover mb-0">
                <thead>
                  <tr>
                    <th style="width: 50px;">#</th>
                    <th>Bank &amp; Branch</th>
                    <th>Account Holder Name</th>
                    <th>Account Number</th>
                    <th>IFSC Code</th>
                    <th>Billing Info</th>
                    <th class="text-right">Deposit Charges</th>
                    <th class="text-center">Status</th>
                    <th class="text-center" style="width: 220px;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || '<tr><td colspan="9" class="text-center py-4 text-muted"><i class="fa fa-info-circle mr-1"></i> No bank accounts added yet. Click "+ Add New Bank" to add your first payment bank.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</div>

<!-- Modal: Add / Edit Bank Account -->
<div class="modal fade" id="bankModal" tabindex="-1" role="dialog" aria-labelledby="bankModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title font-weight-bold" id="bankModalLabel">Add Bank Account</h5>
        <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <form id="bankForm">
        <div class="modal-body p-4">
          <input type="hidden" id="bankId" value="">

          <div class="form-row">
            <div class="form-group col-md-6">
              <label for="bankName" class="font-weight-bold">Bank Name <span class="text-danger">*</span></label>
              <input type="text" class="form-control" id="bankName" placeholder="e.g. AXIS BANK, HDFC BANK, SBI" required>
            </div>
            <div class="form-group col-md-6">
              <label for="branchName" class="font-weight-bold">Branch Name</label>
              <input type="text" class="form-control" id="branchName" placeholder="e.g. ETAWAH, MAIN BRANCH">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-md-6">
              <label for="accountHolder" class="font-weight-bold">Account Holder Name <span class="text-danger">*</span></label>
              <input type="text" class="form-control" id="accountHolder" placeholder="e.g. S3 SOLUTION & SERVICE COMPANY" required>
            </div>
            <div class="form-group col-md-6">
              <label for="accountNumber" class="font-weight-bold">Account Number <span class="text-danger">*</span></label>
              <input type="text" class="form-control font-monospace" id="accountNumber" placeholder="e.g. 93849335819868" required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-md-6">
              <label for="ifscCode" class="font-weight-bold">IFSC Code <span class="text-danger">*</span></label>
              <input type="text" class="form-control text-uppercase font-monospace" id="ifscCode" placeholder="e.g. UTIB0CCH274" required maxlength="20">
            </div>
            <div class="form-group col-md-6">
              <label for="cashDepositCharges" class="font-weight-bold">Cash Deposit Charges (₹)</label>
              <input type="number" step="0.01" class="form-control" id="cashDepositCharges" placeholder="0.00" value="0.00">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-md-12">
              <label for="billingInfo" class="font-weight-bold">Billing Info / Instructions</label>
              <input type="text" class="form-control" id="billingInfo" placeholder="e.g. 24×7 Auto Billing Above ₹5000">
              <small class="form-text text-muted">This note will be shown to users next to the bank details.</small>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-md-6">
              <label for="upiId" class="font-weight-bold">UPI ID (Optional)</label>
              <input type="text" class="form-control font-monospace" id="upiId" placeholder="e.g. business@axisbank">
            </div>
            <div class="form-group col-md-6">
              <label for="qrImageUrl" class="font-weight-bold">QR Image URL / Bank Logo URL (Optional)</label>
              <input type="url" class="form-control" id="qrImageUrl" placeholder="https://example.com/qr.png">
            </div>
          </div>

          <div class="form-group mb-0">
            <div class="custom-control custom-switch">
              <input type="checkbox" class="custom-control-input" id="isActive" checked>
              <label class="custom-control-label font-weight-bold" for="isActive" id="isActiveLabel">Active (Visible to users in Topup Request)</label>
            </div>
          </div>
        </div>

        <div class="modal-footer bg-light">
          <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-primary" id="saveBankBtn">
            <i class="fa fa-save mr-1"></i> Save Bank Account
          </button>
        </div>
      </form>
    </div>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
<script src="/auth-client.js"></script>

<script>
function showAlert(message, type = 'success') {
  const container = document.getElementById('alertPlaceholder');
  container.innerHTML = \`<div class="alert alert-\${type} alert-dismissible fade show" role="alert">
    \${message}
    <button type="button" class="close" data-dismiss="alert" aria-label="Close">
      <span aria-hidden="true">&times;</span>
    </button>
  </div>\`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prepareAddBank() {
  document.getElementById('bankModalLabel').textContent = 'Add Bank Account';
  document.getElementById('bankId').value = '';
  document.getElementById('bankForm').reset();
  document.getElementById('isActive').checked = true;
  document.getElementById('cashDepositCharges').value = '0.00';
  document.getElementById('billingInfo').value = '24×7 Auto Billing';
}

// Edit bank trigger
document.querySelectorAll('[data-edit-bank]').forEach(btn => {
  btn.addEventListener('click', () => {
    try {
      const data = JSON.parse(btn.getAttribute('data-edit-bank'));
      document.getElementById('bankModalLabel').textContent = 'Edit Bank Account';
      document.getElementById('bankId').value = data.id;
      document.getElementById('bankName').value = data.bank_name || '';
      document.getElementById('branchName').value = data.branch_name || '';
      document.getElementById('accountHolder').value = data.account_holder || '';
      document.getElementById('accountNumber').value = data.account_number || '';
      document.getElementById('ifscCode').value = data.ifsc_code || '';
      document.getElementById('billingInfo').value = data.billing_info || '';
      document.getElementById('cashDepositCharges').value = data.cash_deposit_charges || '0.00';
      document.getElementById('upiId').value = data.upi_id || '';
      document.getElementById('qrImageUrl').value = data.qr_image_url || '';
      document.getElementById('isActive').checked = Boolean(data.is_active);
      $('#bankModal').modal('show');
    } catch (e) {
      console.error(e);
    }
  });
});

// Toggle Active / Inactive
document.querySelectorAll('[data-toggle-action]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-toggle-action');
    const cur = btn.getAttribute('data-current-status') === 'true';
    btn.disabled = true;
    try {
      const res = await fetch(\`/api/admin/payment/banks/\${id}/toggle\`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ is_active: !cur }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      location.reload();
    } catch (err) {
      showAlert(err.message, 'danger');
      btn.disabled = false;
    }
  });
});

// Delete Bank
document.querySelectorAll('[data-delete-bank]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-delete-bank');
    const name = btn.getAttribute('data-bank-name');
    if (!confirm(\`Are you sure you want to delete bank account "\${name}"? Users will no longer see this bank.\`)) {
      return;
    }
    btn.disabled = true;
    try {
      const res = await fetch(\`/api/admin/payment/banks/\${id}\`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete bank');
      location.reload();
    } catch (err) {
      showAlert(err.message, 'danger');
      btn.disabled = false;
    }
  });
});

// Save Form (Create or Update)
document.getElementById('bankForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById('saveBankBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving...';

  const bankId = document.getElementById('bankId').value;
  const payload = {
    bank_name: document.getElementById('bankName').value.trim(),
    branch_name: document.getElementById('branchName').value.trim(),
    account_holder: document.getElementById('accountHolder').value.trim(),
    account_number: document.getElementById('accountNumber').value.trim(),
    ifsc_code: document.getElementById('ifscCode').value.trim().toUpperCase(),
    billing_info: document.getElementById('billingInfo').value.trim(),
    cash_deposit_charges: parseFloat(document.getElementById('cashDepositCharges').value) || 0,
    upi_id: document.getElementById('upiId').value.trim(),
    qr_image_url: document.getElementById('qrImageUrl').value.trim(),
    is_active: document.getElementById('isActive').checked,
  };

  const url = bankId ? \`/api/admin/payment/banks/\${bankId}\` : '/api/admin/payment/banks';
  const method = bankId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save bank account');
    $('#bankModal').modal('hide');
    location.reload();
  } catch (err) {
    showAlert(err.message, 'danger');
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa fa-save mr-1"></i> Save Bank Account';
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
      'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
    });
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/payment/bank-list' }));
  }

  return { sendAdminBankListPage };
};
