'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminBankApprovalPage({ db }) {

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

  async function sendAdminBankApprovalPage(admin, response, searchParams) {
    const statusFilter = String(searchParams.get('status') || 'pending').trim().toLowerCase();

    const conditions = [];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      conditions.push(`b.status = ${add(statusFilter)}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT b.id, b.user_id, b.bank_name, b.account_holder_name, b.account_number,
              b.ifsc_code, b.status, b.admin_note, b.created_at, b.approved_at,
              u.username, u.name AS user_name, u.email
       FROM user_bank_accounts b
       JOIN users u ON u.id = b.user_id
       ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT 200`,
      values,
    );

    const rowsHtml = result.rows.map((row, idx) => {
      let statusBadge = '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;">Pending</span>';
      if (row.status === 'approved') statusBadge = '<span class="badge badge-success" style="background:#22c55e;">Approved</span>';
      if (row.status === 'rejected') statusBadge = '<span class="badge badge-danger" style="background:#ef4444;">Rejected</span>';

      let actionBtns = '';
      if (row.status === 'pending') {
        actionBtns = `
          <button type="button" class="btn btn-xs btn-success btn-approve" data-id="${escapeHtml(row.id)}" data-user="${escapeHtml(row.user_name || row.username)}">
            <i class="fa fa-check"></i> Approve
          </button>
          <button type="button" class="btn btn-xs btn-danger btn-reject" data-id="${escapeHtml(row.id)}" data-user="${escapeHtml(row.user_name || row.username)}">
            <i class="fa fa-times"></i> Reject
          </button>
        `;
      } else {
        actionBtns = `<span class="small text-muted font-italic">${row.status === 'approved' ? 'Active' : 'Rejected'}</span>`;
      }

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <strong class="text-dark">${escapeHtml(row.user_name || 'User')}</strong>
            <div class="small text-muted font-monospace">${escapeHtml(row.username || '')}</div>
          </td>
          <td><strong class="text-primary">${escapeHtml(row.bank_name)}</strong></td>
          <td>${escapeHtml(row.account_holder_name)}</td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(row.account_number)}</td>
          <td class="font-monospace text-uppercase text-dark font-weight-bold">${escapeHtml(row.ifsc_code)}</td>
          <td class="text-center">${statusBadge}</td>
          <td class="small text-muted" style="white-space:nowrap;">${escapeHtml(formatDateTime(row.created_at))}</td>
          <td class="small text-muted">${escapeHtml(row.admin_note || '-')}</td>
          <td class="text-center" style="white-space:nowrap;">${actionBtns}</td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>User Bank Approvals - Exchange Admin</title>
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
            <h4 class="page-title mb-0 text-dark"><i class="fa fa-university mr-2"></i> User Bank Account Approvals</h4>
            <div class="small text-muted">Verify and approve user bank accounts before payout activation</div>
          </div>
          <form method="GET" action="/admin/payment/bank-approval" class="form-inline">
            <select name="status" class="form-control form-control-sm mr-2" onchange="this.form.submit()">
              <option value="pending"${statusFilter === 'pending' ? ' selected' : ''}>Pending (${result.rowCount})</option>
              <option value="approved"${statusFilter === 'approved' ? ' selected' : ''}>Approved</option>
              <option value="rejected"${statusFilter === 'rejected' ? ' selected' : ''}>Rejected</option>
              <option value=""${statusFilter === '' ? ' selected' : ''}>All</option>
            </select>
            <a href="/admin/payment/bank-approval" class="btn btn-secondary btn-sm">Refresh</a>
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
                    <th>User</th>
                    <th>Bank Name</th>
                    <th>Account Holder</th>
                    <th>Account Number</th>
                    <th>IFSC Code</th>
                    <th class="text-center">Status</th>
                    <th>Submitted On</th>
                    <th>Admin Note</th>
                    <th class="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="10" class="text-center py-4 text-muted">No bank accounts found for selected filter.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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

    async function reviewBank(id, action, note = '') {
      topAlert.style.display = 'none';
      topError.style.display = 'none';

      try {
        const res = await fetch('/api/admin/payment/banks/review', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ id, action, note }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Operation failed');

        topAlert.textContent = '✓ Bank account successfully ' + (action === 'approve' ? 'approved and activated' : 'rejected') + '!';
        topAlert.style.display = 'block';
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        topError.textContent = err.message;
        topError.style.display = 'block';
      }
    }

    document.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Approve bank account for ' + btn.dataset.user + '?')) {
          reviewBank(btn.dataset.id, 'approve');
        }
      });
    });

    document.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        const reason = prompt('Enter rejection reason for ' + btn.dataset.user + ':', 'Invalid bank details or IFSC');
        if (reason !== null) {
          reviewBank(btn.dataset.id, 'reject', reason);
        }
      });
    });
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
    response.end(await addPanelChrome(html, { role: 'admin', userId: admin.id, db }));
  }

  return { sendAdminBankApprovalPage };
};
