'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createUserFundRedeemPage({ db, formatMinorUnits }) {

  function getTodayString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateTime(isoString) {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return String(isoString).replace('T', ' ').slice(0, 19);
    }
  }

  async function sendUserFundRedeemPage(user, response, searchParams) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');
    const today = getTodayString();

    const fromDate = String(searchParams.get('fromDate') || '').trim();
    const toDate = String(searchParams.get('toDate') || '').trim();
    const statusFilter = String(searchParams.get('status') || '').trim().toLowerCase();

    // 1. Fetch current wallet balance
    const walletRes = await db.query(
      "SELECT id, balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR'",
      [user.id],
    );
    const balanceMinor = BigInt(walletRes.rows[0]?.balance_minor || 0);
    const formattedBalance = `₹${formatMinorUnits(balanceMinor)}`;
    const balanceRupees = (Number(balanceMinor) / 100).toFixed(2);

    // 2. Fetch user bank accounts
    const banksRes = await db.query(
      `SELECT id, bank_name, account_holder_name, account_number, ifsc_code, status, admin_note, created_at, approved_at
       FROM user_bank_accounts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [user.id],
    );
    const banks = banksRes.rows;
    const approvedBanks = banks.filter((b) => b.status === 'approved');

    // 3. Fetch payout requests
    const conditions = ['p.user_id = $1'];
    const values = [user.id];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (fromDate) {
      conditions.push(`p.created_at >= ${add(`${fromDate} 00:00:00+05:30`)}`);
    }
    if (toDate) {
      conditions.push(`p.created_at <= ${add(`${toDate} 23:59:59.999+05:30`)}`);
    }
    if (statusFilter && ['pending', 'success', 'rejected'].includes(statusFilter)) {
      conditions.push(`p.status = ${add(statusFilter)}`);
    }

    const payoutsRes = await db.query(
      `SELECT p.id, p.bank_name, p.account_holder_name, p.account_number, p.ifsc_code,
              p.amount_minor, p.status, p.utr_number, p.admin_remark, p.created_at, p.processed_at
       FROM payout_requests p
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT 100`,
      values,
    );
    const payouts = payoutsRes.rows;

    // Bank accounts table rows
    const bankRowsHtml = banks.map((b, idx) => {
      let statusBadge = '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;">Pending Approval</span>';
      if (b.status === 'approved') {
        statusBadge = '<span class="badge badge-success" style="background:#22c55e;">Active / Approved</span>';
      } else if (b.status === 'rejected') {
        statusBadge = `<span class="badge badge-danger" style="background:#ef4444;" title="${escapeHtml(b.admin_note || '')}">Rejected</span>`;
      }
      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td class="font-weight-bold text-dark">${escapeHtml(b.bank_name)}</td>
          <td>${escapeHtml(b.account_holder_name)}</td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(b.account_number)}</td>
          <td class="font-monospace text-primary font-weight-bold">${escapeHtml(b.ifsc_code)}</td>
          <td class="text-center">${statusBadge}</td>
          <td class="small text-muted">${escapeHtml(formatDateTime(b.created_at))}</td>
        </tr>
      `;
    }).join('');

    // Approved bank options for payout form
    const bankOptionsHtml = approvedBanks.map((b) => {
      return `<option value="${escapeHtml(b.id)}">${escapeHtml(b.bank_name)} - A/C: ${escapeHtml(b.account_number)} (${escapeHtml(b.account_holder_name)})</option>`;
    }).join('');

    // Payout requests table rows
    const payoutRowsHtml = payouts.map((p, idx) => {
      let statusBadge = '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;"><i class="fa fa-clock-o"></i> Pending Process</span>';
      if (p.status === 'success') {
        statusBadge = `<span class="badge badge-success" style="background:#22c55e;"><i class="fa fa-check-circle"></i> Success</span>`;
      } else if (p.status === 'rejected') {
        statusBadge = `<span class="badge badge-danger" style="background:#ef4444;" title="${escapeHtml(p.admin_remark || 'Rejected by Admin')}"><i class="fa fa-times-circle"></i> Rejected (Refunded)</span>`;
      }

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td class="small font-monospace font-weight-bold text-primary" title="${escapeHtml(p.id)}">${escapeHtml(p.id.slice(0, 13))}...</td>
          <td class="small text-muted font-monospace" style="white-space:nowrap;">${escapeHtml(formatDateTime(p.created_at))}</td>
          <td>
            <strong class="text-dark">${escapeHtml(p.bank_name)}</strong>
            <div class="small font-monospace text-muted">A/C: ${escapeHtml(p.account_number)} | IFSC: ${escapeHtml(p.ifsc_code)}</div>
            <div class="small text-muted">${escapeHtml(p.account_holder_name)}</div>
          </td>
          <td class="text-right font-weight-bold text-danger font-monospace">₹${formatMinorUnits(p.amount_minor)}</td>
          <td class="text-center">${statusBadge}</td>
          <td class="font-monospace small text-dark">${escapeHtml(p.utr_number || '-')}</td>
          <td class="small text-muted">${escapeHtml(p.admin_remark || '-')}</td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fund Redeem / Payout - Exchange</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 12px 18px 40px; }
    .header-card {
      background: #1b3576; border-radius: 4px; padding: 12px 18px; margin-bottom: 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.12); color: #fff; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;
    }
    .header-title { font-size: 17px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px; }
    .balance-card {
      background: linear-gradient(135deg, #1e3a8a, #0284c7); color: #fff; border-radius: 6px; padding: 14px 18px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;
    }
    .balance-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9; margin: 0; }
    .balance-val { font-size: 26px; font-weight: 800; color: #ffc928; margin: 0; }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <div class="page-container">

        <div class="balance-card">
          <div>
            <div class="balance-title"><i class="fa fa-wallet mr-1"></i> Available Wallet Balance</div>
            <h2 class="balance-val" id="dispUserBalance">${formattedBalance}</h2>
            <div class="small text-light">You can request payout of full or partial available balance</div>
          </div>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-warning text-dark font-weight-bold" data-toggle="modal" data-target="#addBankModal">
              <i class="fa fa-plus-circle mr-1"></i> Add Bank Account
            </button>
          </div>
        </div>

        <div id="topAlert" class="alert alert-success font-weight-bold" style="display:none;"></div>
        <div id="topError" class="alert alert-danger font-weight-bold" style="display:none;"></div>

        <div class="row">
          <!-- Payout Request Card -->
          <div class="col-lg-5 col-md-12 mb-3">
            <div class="card h-100 shadow-sm border-0">
              <div class="card-header bg-primary text-white py-2">
                <h5 class="card-title mb-0" style="font-size:15px;"><i class="fa fa-paper-plane mr-1"></i> Request Payout / Redeem</h5>
              </div>
              <div class="card-body">
                ${approvedBanks.length === 0 ? `
                  <div class="alert alert-info py-2 small">
                    <i class="fa fa-info-circle mr-1"></i> <strong>No Approved Bank Account:</strong> Please add your bank details first using the <strong>"Add Bank Account"</strong> button. Once approved by Admin, you can request payout here.
                  </div>
                ` : `
                  <form id="payoutForm">
                    <div class="form-group mb-3">
                      <label class="font-weight-bold text-dark small">Select Approved Bank Account <span class="text-danger">*</span></label>
                      <select class="form-control form-control-sm" id="payoutBankId" required>
                        <option value="">-- Choose Bank Account --</option>
                        ${bankOptionsHtml}
                      </select>
                    </div>

                    <div class="form-group mb-3">
                      <label class="font-weight-bold text-dark small">Withdrawal Amount (₹) <span class="text-danger">*</span></label>
                      <div class="input-group input-group-sm">
                        <div class="input-group-prepend"><span class="input-group-text">₹</span></div>
                        <input type="number" step="0.01" min="1" max="${balanceRupees}" class="form-control" id="payoutAmount" placeholder="Enter amount" required>
                        <div class="input-group-append">
                          <button class="btn btn-outline-secondary" type="button" id="btnMaxBalance">Full Balance</button>
                        </div>
                      </div>
                      <small class="text-muted">Max withdrawable: ${formattedBalance}</small>
                    </div>

                    <button type="submit" class="btn btn-primary btn-block font-weight-bold" id="btnSubmitPayout" ${balanceMinor <= 0n ? 'disabled' : ''}>
                      <i class="fa fa-check-circle mr-1"></i> Submit Payout Request
                    </button>
                  </form>
                `}
              </div>
            </div>
          </div>

          <!-- My Bank Accounts Card -->
          <div class="col-lg-7 col-md-12 mb-3">
            <div class="card h-100 shadow-sm border-0">
              <div class="card-header bg-dark text-white py-2 d-flex justify-content-between align-items-center">
                <h5 class="card-title mb-0" style="font-size:15px;"><i class="fa fa-university mr-1"></i> My Bank Accounts (${banks.length})</h5>
                <button type="button" class="btn btn-xs btn-outline-light" data-toggle="modal" data-target="#addBankModal">
                  <i class="fa fa-plus"></i> Add New Bank
                </button>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-bordered table-striped table-sm mb-0">
                    <thead class="thead-light">
                      <tr>
                        <th class="text-center" style="width:40px;">#</th>
                        <th>Bank Name</th>
                        <th>A/C Holder</th>
                        <th>Account No</th>
                        <th>IFSC</th>
                        <th class="text-center">Status</th>
                        <th>Added On</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${bankRowsHtml || '<tr><td colspan="7" class="text-center py-4 text-muted">No bank account added yet. Click "Add Bank Account" to add.</td></tr>'}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Payout Request History Card -->
        <div class="card shadow-sm border-0 mt-3">
          <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h5 class="card-title mb-0 text-dark" style="font-size:15px;"><i class="fa fa-history mr-1"></i> Payout / Redeem History</h5>
            <form method="GET" action="/fund/redeem" class="form-inline">
              <input type="date" name="fromDate" value="${escapeHtml(fromDate)}" class="form-control form-control-sm mr-1">
              <input type="date" name="toDate" value="${escapeHtml(toDate)}" class="form-control form-control-sm mr-1">
              <select name="status" class="form-control form-control-sm mr-1">
                <option value="">All Status</option>
                <option value="pending"${statusFilter === 'pending' ? ' selected' : ''}>Pending</option>
                <option value="success"${statusFilter === 'success' ? ' selected' : ''}>Success</option>
                <option value="rejected"${statusFilter === 'rejected' ? ' selected' : ''}>Rejected</option>
              </select>
              <button type="submit" class="btn btn-primary btn-sm mr-1"><i class="fa fa-search"></i> Filter</button>
              <a href="/fund/redeem" class="btn btn-secondary btn-sm">Reset</a>
            </form>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-hover table-sm mb-0">
                <thead class="thead-light">
                  <tr>
                    <th class="text-center" style="width:40px;">#</th>
                    <th>Request ID</th>
                    <th>Date & Time</th>
                    <th>Bank Details</th>
                    <th class="text-right">Amount (₹)</th>
                    <th class="text-center">Status</th>
                    <th>UTR / Ref No</th>
                    <th>Admin Remark</th>
                  </tr>
                </thead>
                <tbody>
                  ${payoutRowsHtml || '<tr><td colspan="8" class="text-center py-4 text-muted">No payout request found.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- Add Bank Modal -->
  <div class="modal fade" id="addBankModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <form id="addBankForm">
          <div class="modal-header bg-primary text-white py-2">
            <h5 class="modal-title" style="font-size:15px;"><i class="fa fa-university mr-1"></i> Add Bank Details for Approval</h5>
            <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
          </div>
          <div class="modal-body">
            <div id="modalBankError" class="alert alert-danger py-2 small" style="display:none;"></div>
            <div class="form-group mb-2">
              <label class="small font-weight-bold">Bank Name <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm" id="mbBankName" placeholder="e.g. State Bank of India, HDFC Bank" required>
            </div>
            <div class="form-group mb-2">
              <label class="small font-weight-bold">Account Holder Name <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm" id="mbHolderName" placeholder="Name as per bank passbook" required>
            </div>
            <div class="form-group mb-2">
              <label class="small font-weight-bold">Account Number <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm" id="mbAccountNumber" placeholder="Enter bank account number" required>
            </div>
            <div class="form-group mb-2">
              <label class="small font-weight-bold">IFSC Code <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm text-uppercase" id="mbIfsc" placeholder="e.g. SBIN0001234" maxlength="11" required>
            </div>
            <div class="alert alert-warning py-1 small mb-0">
              <i class="fa fa-info-circle mr-1"></i> Bank details will be verified and approved by Admin before payout activation.
            </div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm font-weight-bold" id="btnSaveBank">
              <i class="fa fa-check mr-1"></i> Submit for Approval
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
  <script src="/assets/plugins/horizontal-menu/horizontal.js"></script>
  <script src="/auth-client.js"></script>
  <script>
  (function() {
    const maxBalRupees = ${JSON.stringify(balanceRupees)};
    const btnMax = document.getElementById('btnMaxBalance');
    const payoutAmountInput = document.getElementById('payoutAmount');
    const topAlert = document.getElementById('topAlert');
    const topError = document.getElementById('topError');

    if (btnMax && payoutAmountInput) {
      btnMax.addEventListener('click', function() {
        payoutAmountInput.value = maxBalRupees;
      });
    }

    // Add Bank Form submit
    const addBankForm = document.getElementById('addBankForm');
    const modalBankError = document.getElementById('modalBankError');
    const btnSaveBank = document.getElementById('btnSaveBank');

    if (addBankForm) {
      addBankForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        modalBankError.style.display = 'none';

        const bankName = document.getElementById('mbBankName').value.trim();
        const accountHolderName = document.getElementById('mbHolderName').value.trim();
        const accountNumber = document.getElementById('mbAccountNumber').value.trim();
        const ifscCode = document.getElementById('mbIfsc').value.trim().toUpperCase();

        if (!bankName || !accountHolderName || !accountNumber || !ifscCode) {
          modalBankError.textContent = 'Please fill all required bank details.';
          modalBankError.style.display = 'block';
          return;
        }

        btnSaveBank.disabled = true;
        btnSaveBank.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Submitting...';

        try {
          const res = await fetch('/api/user/banks', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ bankName, accountHolderName, accountNumber, ifscCode }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || data.message || 'Failed to submit bank account.');

          $('#addBankModal').modal('hide');
          topAlert.textContent = '✓ Bank details submitted successfully! It will be activated after Admin approval.';
          topAlert.style.display = 'block';
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          modalBankError.textContent = err.message;
          modalBankError.style.display = 'block';
        } finally {
          btnSaveBank.disabled = false;
          btnSaveBank.innerHTML = '<i class="fa fa-check mr-1"></i> Submit for Approval';
        }
      });
    }

    // Payout Form submit
    const payoutForm = document.getElementById('payoutForm');
    const btnSubmitPayout = document.getElementById('btnSubmitPayout');

    if (payoutForm) {
      payoutForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        topError.style.display = 'none';
        topAlert.style.display = 'none';

        const bankId = document.getElementById('payoutBankId').value;
        const amount = parseFloat(payoutAmountInput.value);

        if (!bankId) {
          topError.textContent = 'Please select an approved bank account.';
          topError.style.display = 'block';
          return;
        }
        if (isNaN(amount) || amount <= 0) {
          topError.textContent = 'Please enter a valid withdrawal amount.';
          topError.style.display = 'block';
          return;
        }
        if (amount > parseFloat(maxBalRupees)) {
          topError.textContent = 'Withdrawal amount cannot exceed available balance.';
          topError.style.display = 'block';
          return;
        }

        if (!confirm('Are you sure you want to withdraw ₹' + amount.toFixed(2) + '? This amount will be debited from your wallet immediately.')) {
          return;
        }

        btnSubmitPayout.disabled = true;
        btnSubmitPayout.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Processing...';

        try {
          const res = await fetch('/api/user/payout-request', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ bankAccountId: bankId, amount }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || data.message || 'Failed to submit payout request.');

          topAlert.textContent = '✓ Payout request of ₹' + amount.toFixed(2) + ' submitted successfully! Amount debited from wallet and sent for Admin processing.';
          topAlert.style.display = 'block';
          setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
          topError.textContent = err.message;
          topError.style.display = 'block';
        } finally {
          btnSubmitPayout.disabled = false;
          btnSubmitPayout.innerHTML = '<i class="fa fa-check-circle mr-1"></i> Submit Payout Request';
        }
      });
    }
  })();
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
    response.end(await addPanelChrome(html, { role: 'user', userId: user.id, db }));
  }

  return { sendUserFundRedeemPage };
};
