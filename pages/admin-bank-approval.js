'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminBankApprovalPage({ db, decryptMobile }) {

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
    const search = String(searchParams.get('search') || '').trim();
    const statusFilter = String(searchParams.get('status') || '').trim().toLowerCase();
    const fromDate = String(searchParams.get('fromDate') || '').trim();
    const toDate = String(searchParams.get('toDate') || '').trim();

    // 1. Fetch KPI counts
    const kpiRes = await db.query(`
      SELECT
        COUNT(*)::int AS total_banks,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_banks,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved_banks,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected_banks
      FROM user_bank_accounts
    `);
    const kpi = kpiRes.rows[0] || { total_banks: 0, pending_banks: 0, approved_banks: 0, rejected_banks: 0 };

    // 2. Fetch PENDING bank approvals (Top section)
    const pendingRes = await db.query(`
      SELECT b.id, b.user_id, b.bank_name, b.account_holder_name, b.account_number,
             b.ifsc_code, b.status, b.admin_note, b.created_at, b.approved_at,
             u.username, u.name AS user_name, u.email, u.phone_ciphertext
      FROM user_bank_accounts b
      JOIN users u ON u.id = b.user_id
      WHERE b.status = 'pending'
      ORDER BY b.created_at ASC
    `);

    // 3. Build conditions for ALL bank accounts table (Bottom section)
    const conditions = [];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      conditions.push(`b.status = ${add(statusFilter)}`);
    }
    if (search) {
      const q = add(`%${search}%`);
      conditions.push(`(u.username ILIKE ${q} OR COALESCE(u.name, '') ILIKE ${q} OR COALESCE(u.email, '') ILIKE ${q} OR b.bank_name ILIKE ${q} OR b.account_number ILIKE ${q} OR b.account_holder_name ILIKE ${q} OR b.ifsc_code ILIKE ${q})`);
    }
    if (fromDate) {
      conditions.push(`b.created_at >= (${add(fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (toDate) {
      conditions.push(`b.created_at < (((${add(toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const allBanksRes = await db.query(`
      SELECT b.id, b.user_id, b.bank_name, b.account_holder_name, b.account_number,
             b.ifsc_code, b.status, b.admin_note, b.created_at, b.approved_at,
             u.username, u.name AS user_name, u.email, u.phone_ciphertext
      FROM user_bank_accounts b
      JOIN users u ON u.id = b.user_id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT 500
    `, values);

    // Render Pending Table Rows (Top)
    const pendingRowsHtml = pendingRes.rows.map((row, idx) => {
      let mobile = '';
      if (row.phone_ciphertext && typeof decryptMobile === 'function') {
        try { mobile = decryptMobile(row.phone_ciphertext); } catch {}
      }

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <div class="font-weight-bold text-dark">${escapeHtml(row.user_name || 'User')}</div>
            <div class="small text-muted font-monospace"><i class="fa fa-user mr-1"></i>${escapeHtml(row.username || '')}</div>
            ${mobile ? `<div class="small text-muted"><i class="fa fa-phone mr-1"></i>${escapeHtml(mobile)}</div>` : ''}
          </td>
          <td><strong class="text-primary">${escapeHtml(row.bank_name)}</strong></td>
          <td>${escapeHtml(row.account_holder_name)}</td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(row.account_number)}</td>
          <td class="font-monospace text-uppercase text-dark font-weight-bold">${escapeHtml(row.ifsc_code)}</td>
          <td class="small text-muted" style="white-space:nowrap;">${escapeHtml(formatDateTime(row.created_at))}</td>
          <td class="text-center" style="white-space:nowrap;">
            <button type="button" class="btn btn-xs btn-success font-weight-bold btn-approve" data-id="${escapeHtml(row.id)}" data-user="${escapeHtml(row.user_name || row.username)}">
              <i class="fa fa-check mr-1"></i> Approve
            </button>
            <button type="button" class="btn btn-xs btn-danger font-weight-bold ml-1 btn-reject" data-id="${escapeHtml(row.id)}" data-user="${escapeHtml(row.user_name || row.username)}">
              <i class="fa fa-times mr-1"></i> Reject
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Render All Banks Table Rows (Bottom)
    const allBanksRowsHtml = allBanksRes.rows.map((row, idx) => {
      let mobile = '';
      if (row.phone_ciphertext && typeof decryptMobile === 'function') {
        try { mobile = decryptMobile(row.phone_ciphertext); } catch {}
      }

      let statusBadge = '<span class="badge badge-warning text-white px-2 py-1" style="background:#f59e0b;"><i class="fa fa-clock-o mr-1"></i>Pending</span>';
      if (row.status === 'approved') statusBadge = '<span class="badge badge-success px-2 py-1" style="background:#22c55e;"><i class="fa fa-check-circle mr-1"></i>Approved</span>';
      if (row.status === 'rejected') statusBadge = '<span class="badge badge-danger px-2 py-1" style="background:#ef4444;"><i class="fa fa-times-circle mr-1"></i>Rejected</span>';

      let actionBtns = '';
      if (row.status === 'pending') {
        actionBtns = `
          <button type="button" class="btn btn-xs btn-success btn-approve" data-id="${escapeHtml(row.id)}" data-user="${escapeHtml(row.user_name || row.username)}" title="Approve this bank">
            <i class="fa fa-check"></i>
          </button>
          <button type="button" class="btn btn-xs btn-danger ml-1 btn-reject" data-id="${escapeHtml(row.id)}" data-user="${escapeHtml(row.user_name || row.username)}" title="Reject this bank">
            <i class="fa fa-times"></i>
          </button>
        `;
      } else if (row.status === 'approved') {
        actionBtns = `
          <button type="button" class="btn btn-xs btn-outline-danger btn-reject" data-id="${escapeHtml(row.id)}" data-user="${escapeHtml(row.user_name || row.username)}" title="Revoke / Reject">
            <i class="fa fa-ban mr-1"></i>Reject
          </button>
        `;
      } else {
        actionBtns = `
          <button type="button" class="btn btn-xs btn-outline-success btn-approve" data-id="${escapeHtml(row.id)}" data-user="${escapeHtml(row.user_name || row.username)}" title="Re-approve">
            <i class="fa fa-check mr-1"></i>Approve
          </button>
        `;
      }

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <div class="font-weight-bold text-dark">${escapeHtml(row.user_name || 'User')}</div>
            <div class="small text-muted font-monospace"><i class="fa fa-user mr-1"></i>${escapeHtml(row.username || '')}</div>
            ${mobile ? `<div class="small text-muted"><i class="fa fa-phone mr-1"></i>${escapeHtml(mobile)}</div>` : ''}
          </td>
          <td><strong class="text-primary">${escapeHtml(row.bank_name)}</strong></td>
          <td>${escapeHtml(row.account_holder_name)}</td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(row.account_number)}</td>
          <td class="font-monospace text-uppercase text-dark font-weight-bold">${escapeHtml(row.ifsc_code)}</td>
          <td class="text-center">${statusBadge}</td>
          <td class="small text-muted" style="white-space:nowrap;">${escapeHtml(formatDateTime(row.created_at))}</td>
          <td class="small text-muted" style="white-space:nowrap;">${escapeHtml(formatDateTime(row.approved_at))}</td>
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
  <title>User Bank Approvals & Directory - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 12px 18px 40px; }
    .kpi-card { border-radius: 8px; border: 1px solid #e2e8f0; padding: 12px 16px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .kpi-title { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px; }
    .kpi-val { font-size: 20px; font-weight: 800; color: #1e293b; }
    .section-card { border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 24px; overflow: hidden; }
    .section-head { padding: 12px 18px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    .table td, .table th { vertical-align: middle; font-size: 13px; }
    .btn-xs { padding: 3px 8px; font-size: 11px; border-radius: 4px; }
  </style>
</head>
<body class="app sidebar-mini">
  <div class="page">
    <div class="page-main">
      ${renderAdminNavigation('/admin/payment/bank-approval')}

      <main class="main-content">
        <div class="container-fluid px-3 pt-3">
          <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div>
              <h4 class="page-title mb-0 font-weight-bold text-dark">
                <i class="fa fa-university text-primary mr-2"></i> User Bank Account Approvals
              </h4>
              <p class="text-muted small mb-0">Review pending bank approvals and view all user bank accounts directory.</p>
            </div>
            <div>
              <a href="/admin/payment/bank-approval" class="btn btn-sm btn-outline-secondary font-weight-bold">
                <i class="fa fa-refresh mr-1"></i> Refresh
              </a>
            </div>
          </div>

          <!-- KPI Cards -->
          <div class="row mb-3">
            <div class="col-xl-3 col-md-6 col-6 mb-2">
              <div class="kpi-card border-left border-primary" style="border-left-width: 4px !important;">
                <div class="kpi-title">Total Added Banks</div>
                <div class="kpi-val text-primary">${kpi.total_banks}</div>
              </div>
            </div>
            <div class="col-xl-3 col-md-6 col-6 mb-2">
              <div class="kpi-card border-left border-warning" style="border-left-width: 4px !important;">
                <div class="kpi-title">Pending Approvals</div>
                <div class="kpi-val text-warning">${kpi.pending_banks}</div>
              </div>
            </div>
            <div class="col-xl-3 col-md-6 col-6 mb-2">
              <div class="kpi-card border-left border-success" style="border-left-width: 4px !important;">
                <div class="kpi-title">Approved Banks</div>
                <div class="kpi-val text-success">${kpi.approved_banks}</div>
              </div>
            </div>
            <div class="col-xl-3 col-md-6 col-6 mb-2">
              <div class="kpi-card border-left border-danger" style="border-left-width: 4px !important;">
                <div class="kpi-title">Rejected Banks</div>
                <div class="kpi-val text-danger">${kpi.rejected_banks}</div>
              </div>
            </div>
          </div>

          <div id="topAlert" class="alert alert-success font-weight-bold" style="display:none;"></div>
          <div id="topError" class="alert alert-danger font-weight-bold" style="display:none;"></div>

          <!-- TOP SECTION: PENDING BANK APPROVALS -->
          <div class="section-card border-warning">
            <div class="section-head bg-light">
              <h6 class="mb-0 font-weight-bold text-dark">
                <i class="fa fa-clock-o text-warning mr-2"></i> Pending Bank Approvals (${pendingRes.rowCount})
              </h6>
              <span class="badge badge-warning text-white font-weight-bold px-2 py-1">
                ${pendingRes.rowCount} Action Required
              </span>
            </div>
            <div class="table-responsive">
              <table class="table table-bordered table-hover table-striped mb-0">
                <thead class="thead-dark">
                  <tr>
                    <th class="text-center" style="width:40px;">#</th>
                    <th>User</th>
                    <th>Bank Name</th>
                    <th>Account Holder</th>
                    <th>Account Number</th>
                    <th>IFSC Code</th>
                    <th>Submitted On (IST)</th>
                    <th class="text-center" style="width:160px;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${pendingRowsHtml || '<tr><td colspan="8" class="text-center py-4 text-muted font-weight-bold"><i class="fa fa-check-circle text-success mr-2"></i>No pending bank approvals at the moment. All requests have been reviewed!</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <!-- BOTTOM SECTION: ALL USER BANK ACCOUNTS LIST -->
          <div class="section-card">
            <div class="section-head bg-white">
              <div>
                <h6 class="mb-0 font-weight-bold text-dark">
                  <i class="fa fa-list text-primary mr-2"></i> All Added User Banks Directory (${allBanksRes.rowCount} shown / ${kpi.total_banks} total)
                </h6>
                <div class="small text-muted">Complete list of all bank accounts submitted by users across the system.</div>
              </div>
            </div>

            <!-- Filter Bar for All Banks Table -->
            <div class="p-3 bg-light border-bottom">
              <form method="GET" action="/admin/payment/bank-approval" class="form-row align-items-end" id="filterForm">
                <div class="form-group col-md-3 col-12 mb-2">
                  <label class="small font-weight-bold text-dark">Search User / Bank / Account</label>
                  <input type="text" class="form-control form-control-sm" name="search" value="${escapeHtml(search)}" placeholder="Search username, name, bank, A/C, IFSC...">
                </div>
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">Status Filter</label>
                  <select name="status" class="form-control form-control-sm">
                    <option value="" ${statusFilter === '' ? 'selected' : ''}>All Status (${kpi.total_banks})</option>
                    <option value="approved" ${statusFilter === 'approved' ? 'selected' : ''}>Approved (${kpi.approved_banks})</option>
                    <option value="pending" ${statusFilter === 'pending' ? 'selected' : ''}>Pending (${kpi.pending_banks})</option>
                    <option value="rejected" ${statusFilter === 'rejected' ? 'selected' : ''}>Rejected (${kpi.rejected_banks})</option>
                  </select>
                </div>
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">From Date</label>
                  <input type="date" class="form-control form-control-sm" id="fromDate" name="fromDate" value="${escapeHtml(fromDate)}">
                </div>
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">To Date</label>
                  <input type="date" class="form-control form-control-sm" id="toDate" name="toDate" value="${escapeHtml(toDate)}">
                </div>
                <div class="form-group col-md-3 col-12 mb-2 d-flex gap-1">
                  <button type="submit" class="btn btn-sm btn-primary px-3 mr-2 font-weight-bold">
                    <i class="fa fa-filter mr-1"></i> Apply
                  </button>
                  <a href="/admin/payment/bank-approval" class="btn btn-sm btn-light border mr-2">
                    <i class="fa fa-refresh mr-1"></i> Reset
                  </a>
                </div>
              </form>
            </div>

            <!-- All Banks Main Table -->
            <div class="table-responsive">
              <table class="table table-bordered table-hover table-striped mb-0">
                <thead class="thead-light">
                  <tr>
                    <th class="text-center" style="width:40px;">#</th>
                    <th>User</th>
                    <th>Bank Name</th>
                    <th>Account Holder</th>
                    <th>Account Number</th>
                    <th>IFSC Code</th>
                    <th class="text-center">Status</th>
                    <th>Submitted On (IST)</th>
                    <th>Approved/Reviewed On</th>
                    <th>Admin Note</th>
                    <th class="text-center" style="width:100px;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${allBanksRowsHtml || '<tr><td colspan="11" class="text-center py-4 text-muted font-weight-bold">No user bank accounts found matching the filters.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
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
    response.end(await addPanelChrome(html, { role: 'admin', userId: admin.id, db, currentPath: '/admin/payment/bank-approval' }));
  }

  return { sendAdminBankApprovalPage };
};
