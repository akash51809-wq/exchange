'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminPayoutRequestsPage({ db, formatMinorUnits }) {

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

  async function sendAdminPayoutRequestsPage(admin, response, searchParams) {
    const statusFilter = String(searchParams.get('status') || 'pending').trim().toLowerCase();
    const fromDate = String(searchParams.get('fromDate') || '').trim();
    const toDate = String(searchParams.get('toDate') || '').trim();

    const conditions = [];
    const values = [];
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

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT p.id, p.user_id, p.bank_name, p.account_holder_name, p.account_number,
              p.ifsc_code, p.amount_minor, p.status, p.utr_number, p.admin_remark,
              p.created_at, p.processed_at,
              u.username, u.name AS user_name, u.email
       FROM payout_requests p
       JOIN users u ON u.id = p.user_id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT 200`,
      values,
    );

    let totalAmountMinor = 0n;

    const rowsHtml = result.rows.map((row, idx) => {
      totalAmountMinor += BigInt(row.amount_minor || 0);

      let statusBadge = '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;">Pending</span>';
      if (row.status === 'success') statusBadge = '<span class="badge badge-success" style="background:#22c55e;">Success</span>';
      if (row.status === 'rejected') statusBadge = '<span class="badge badge-danger" style="background:#ef4444;">Rejected</span>';

      let actionBtn = '';
      if (row.status === 'pending') {
        actionBtn = `
          <button type="button" class="btn btn-xs btn-primary btn-process-payout"
            data-id="${escapeHtml(row.id)}"
            data-user="${escapeHtml(row.user_name || row.username)}"
            data-bank="${escapeHtml(row.bank_name)}"
            data-acc="${escapeHtml(row.account_number)}"
            data-ifsc="${escapeHtml(row.ifsc_code)}"
            data-amount="₹${formatMinorUnits(row.amount_minor)}">
            <i class="fa fa-cogs"></i> Process
          </button>
        `;
      } else {
        actionBtn = `<span class="small text-muted font-italic">${row.status === 'success' ? 'Processed' : 'Refunded'}</span>`;
      }

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td class="font-monospace small font-weight-bold text-primary" title="${escapeHtml(row.id)}">${escapeHtml(row.id.slice(0, 13))}...</td>
          <td class="small text-muted" style="white-space:nowrap;">${escapeHtml(formatDateTime(row.created_at))}</td>
          <td>
            <strong class="text-dark">${escapeHtml(row.user_name || 'User')}</strong>
            <div class="small text-muted font-monospace">${escapeHtml(row.username || '')}</div>
          </td>
          <td>
            <strong class="text-primary">${escapeHtml(row.bank_name)}</strong>
            <div class="small font-monospace text-dark">A/C: ${escapeHtml(row.account_number)}</div>
            <div class="small text-muted">${escapeHtml(row.account_holder_name)} | IFSC: ${escapeHtml(row.ifsc_code)}</div>
          </td>
          <td class="text-right font-weight-bold text-danger font-monospace">₹${formatMinorUnits(row.amount_minor)}</td>
          <td class="text-center">${statusBadge}</td>
          <td class="font-monospace small text-dark">${escapeHtml(row.utr_number || '-')}</td>
          <td class="small text-muted">${escapeHtml(row.admin_remark || '-')}</td>
          <td class="text-center" style="white-space:nowrap;">${actionBtn}</td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payout / Redeem Requests - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 12px 18px 40px; }
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
                    <li><a href="/admin/payment/bank-approval">Bank Approvals</a></li>
                    <li><a href="/admin/payment/payout-request">Payout Requests</a></li>
                    <li><a href="/admin/payment/invoice">Invoice</a></li>
                    <li><a href="/admin/payment/bank-list">Admin Bank List</a></li>
                    <li><a href="/admin/payment/disputes">Disputes</a></li>
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

      <div class="page-container">
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h4 class="page-title mb-0 text-dark"><i class="fa fa-money mr-2"></i> User Payout / Redeem Requests</h4>
            <div class="small text-muted">Manually process user withdrawal requests and mark Success with UTR or Reject</div>
          </div>
          <form method="GET" action="/admin/payment/payout-request" class="form-inline">
            <input type="date" name="fromDate" value="${escapeHtml(fromDate)}" class="form-control form-control-sm mr-1">
            <input type="date" name="toDate" value="${escapeHtml(toDate)}" class="form-control form-control-sm mr-1">
            <select name="status" class="form-control form-control-sm mr-1" onchange="this.form.submit()">
              <option value="pending"${statusFilter === 'pending' ? ' selected' : ''}>Pending (${result.rowCount})</option>
              <option value="success"${statusFilter === 'success' ? ' selected' : ''}>Success</option>
              <option value="rejected"${statusFilter === 'rejected' ? ' selected' : ''}>Rejected</option>
              <option value=""${statusFilter === '' ? ' selected' : ''}>All</option>
            </select>
            <button type="submit" class="btn btn-primary btn-sm mr-1"><i class="fa fa-search"></i></button>
            <a href="/admin/payment/payout-request" class="btn btn-secondary btn-sm">Reset</a>
          </form>
        </div>

        <div id="topAlert" class="alert alert-success font-weight-bold" style="display:none;"></div>
        <div id="topError" class="alert alert-danger font-weight-bold" style="display:none;"></div>

        <div class="card shadow-sm border-0">
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-hover table-sm mb-0">
                <thead class="thead-light">
                  <tr>
                    <th class="text-center" style="width:40px;">#</th>
                    <th>Request ID</th>
                    <th>Requested On</th>
                    <th>User</th>
                    <th>Bank & Account</th>
                    <th class="text-right">Amount (₹)</th>
                    <th class="text-center">Status</th>
                    <th>UTR / Ref No</th>
                    <th>Admin Remark</th>
                    <th class="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="10" class="text-center py-4 text-muted">No payout requests found for selected filter.</td></tr>'}
                </tbody>
                <tfoot>
                  <tr class="bg-light font-weight-bold">
                    <td colspan="5" class="text-right">Total Payouts:</td>
                    <td class="text-right text-danger font-monospace">₹${formatMinorUnits(totalAmountMinor)}</td>
                    <td colspan="4"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Process Payout Modal -->
  <div class="modal fade" id="processPayoutModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <form id="processPayoutForm">
          <input type="hidden" id="payoutModalId">
          <div class="modal-header bg-primary text-white py-2">
            <h5 class="modal-title" style="font-size:15px;"><i class="fa fa-cogs mr-1"></i> Process Payout Request</h5>
            <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
          </div>
          <div class="modal-body">
            <div id="modalPayoutError" class="alert alert-danger py-2 small" style="display:none;"></div>
            
            <div class="bg-light p-2 rounded mb-3 small">
              <div><strong>User:</strong> <span id="mDispUser"></span></div>
              <div><strong>Amount:</strong> <span id="mDispAmount" class="font-weight-bold text-danger font-monospace"></span></div>
              <div><strong>Bank:</strong> <span id="mDispBank"></span></div>
              <div><strong>Account:</strong> <span id="mDispAcc" class="font-monospace"></span></div>
              <div><strong>IFSC:</strong> <span id="mDispIfsc" class="font-monospace font-weight-bold"></span></div>
            </div>

            <div class="form-group mb-2">
              <label class="small font-weight-bold">Action <span class="text-danger">*</span></label>
              <select class="form-control form-control-sm" id="mAction" required>
                <option value="success">Mark as Success / Processed</option>
                <option value="reject">Reject & Refund to User Wallet</option>
              </select>
            </div>

            <div class="form-group mb-2" id="utrGroup">
              <label class="small font-weight-bold">Bank UTR / Transaction Reference Number <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm" id="mUtr" placeholder="e.g. UTR1234567890">
            </div>

            <div class="form-group mb-2">
              <label class="small font-weight-bold">Admin Remark / Note</label>
              <input type="text" class="form-control form-control-sm" id="mRemark" placeholder="e.g. Paid via IMPS/NEFT / Reason if rejected">
            </div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm font-weight-bold" id="btnConfirmProcess">
              <i class="fa fa-check mr-1"></i> Confirm Update
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
    const topAlert = document.getElementById('topAlert');
    const topError = document.getElementById('topError');
    const modal = $('#processPayoutModal');
    const modalError = document.getElementById('modalPayoutError');
    const form = document.getElementById('processPayoutForm');
    const btnConfirm = document.getElementById('btnConfirmProcess');
    const actionSelect = document.getElementById('mAction');
    const utrGroup = document.getElementById('utrGroup');

    actionSelect.addEventListener('change', () => {
      utrGroup.style.display = actionSelect.value === 'success' ? 'block' : 'none';
    });

    document.querySelectorAll('.btn-process-payout').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('payoutModalId').value = btn.dataset.id;
        document.getElementById('mDispUser').textContent = btn.dataset.user;
        document.getElementById('mDispAmount').textContent = btn.dataset.amount;
        document.getElementById('mDispBank').textContent = btn.dataset.bank;
        document.getElementById('mDispAcc').textContent = btn.dataset.acc;
        document.getElementById('mDispIfsc').textContent = btn.dataset.ifsc;
        document.getElementById('mUtr').value = '';
        document.getElementById('mRemark').value = '';
        actionSelect.value = 'success';
        utrGroup.style.display = 'block';
        modalError.style.display = 'none';
        modal.modal('show');
      });
    });

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        modalError.style.display = 'none';

        const id = document.getElementById('payoutModalId').value;
        const action = actionSelect.value;
        const utr = document.getElementById('mUtr').value.trim();
        const remark = document.getElementById('mRemark').value.trim();

        if (action === 'success' && !utr) {
          modalError.textContent = 'Please enter Bank UTR / Reference number for successful payout.';
          modalError.style.display = 'block';
          return;
        }

        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Processing...';

        try {
          const res = await fetch('/api/admin/payment/payouts/process', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ id, action, utr, remark }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || data.message || 'Operation failed');

          modal.modal('hide');
          topAlert.textContent = '✓ Payout request updated successfully! ' + (action === 'reject' ? 'Amount refunded to user wallet.' : 'Marked as success.');
          topAlert.style.display = 'block';
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          modalError.textContent = err.message;
          modalError.style.display = 'block';
        } finally {
          btnConfirm.disabled = false;
          btnConfirm.innerHTML = '<i class="fa fa-check mr-1"></i> Confirm Update';
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
    response.end(await addPanelChrome(html, { role: 'admin', userId: admin.id, db, currentPath: '/admin/payment/payout-requests' }));
  }

  return { sendAdminPayoutRequestsPage };
};
