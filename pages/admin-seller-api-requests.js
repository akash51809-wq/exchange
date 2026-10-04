'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');
const { decryptSellerApiConfig } = require('../lib/stock-api-helper');

module.exports = function createAdminSellerApiRequestsPage({ db, formatMinorUnits, decryptMobile }) {
  async function sendAdminSellerApiRequestsPage(admin, response, searchParams = new URLSearchParams()) {
    // Ensure database columns exist
    await db.query(`
      ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS is_admin_approved BOOLEAN DEFAULT false;
      ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'waiting';
      ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT '';
      ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
      ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
      UPDATE seller_api_settings SET approval_status = 'waiting', is_admin_approved = false WHERE approval_status IS NULL;
    `);

    const statusFilter = String(searchParams.get('status') || '').trim();
    const search = String(searchParams.get('search') || '').trim().slice(0, 100);
    const pageSize = ['10', '25', '50', '100', '500'].includes(searchParams.get('limit')) ? searchParams.get('limit') : '25';

    const conditions = ['s.deleted_at IS NULL'];
    const values = [];

    if (statusFilter && ['waiting', 'approved', 'rejected'].includes(statusFilter)) {
      values.push(statusFilter);
      conditions.push(`s.approval_status = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(u.name ILIKE $${values.length} OR u.username ILIKE $${values.length} OR s.name ILIKE $${values.length})`);
    }

    values.push(Number(pageSize));

    const result = await db.query(
      `SELECT s.id, s.name, s.short_name, s.services, s.mode, s.config_ciphertext,
              s.balance_value, s.balance_key, s.last_balance_at, s.is_active, s.is_admin_approved,
              s.approval_status, s.rejection_reason, s.approved_at, s.created_at,
              u.id AS user_id, u.name AS user_name, u.username AS user_username, u.phone_ciphertext AS user_phone_cipher
       FROM seller_api_settings s
       JOIN users u ON u.id = s.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY 
         CASE WHEN s.approval_status = 'waiting' THEN 0 WHEN s.approval_status IS NULL THEN 0 ELSE 1 END,
         s.created_at DESC
       LIMIT $${values.length}`,
      values
    );

    // Count pending / waiting requests
    const countsRes = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE approval_status = 'waiting' OR approval_status IS NULL) AS waiting_count,
        COUNT(*) FILTER (WHERE approval_status = 'approved') AS approved_count,
        COUNT(*) FILTER (WHERE approval_status = 'rejected') AS rejected_count,
        COUNT(*) AS total_count
      FROM seller_api_settings
      WHERE deleted_at IS NULL
    `);
    const counts = countsRes.rows[0] || { waiting_count: 0, approved_count: 0, rejected_count: 0, total_count: 0 };

    const rows = result.rows.map((row, index) => {
      let config = {};
      try {
        config = decryptSellerApiConfig(row.config_ciphertext);
      } catch {}

      let userPhone = '';
      if (row.user_phone_cipher) {
        try { userPhone = decryptMobile(row.user_phone_cipher); } catch {}
      }

      const status = row.approval_status || (row.is_admin_approved ? 'approved' : 'waiting');
      
      let statusBadge = '<span class="badge badge-danger badge-custom" style="background-color: #ef4444; color: #fff;">Waiting</span>';
      if (status === 'approved') {
        statusBadge = '<span class="badge badge-success badge-custom" style="background-color: #22c55e; color: #fff;">Approved</span>';
      } else if (status === 'rejected') {
        statusBadge = `<span class="badge badge-danger badge-custom" style="background-color: #ef4444; color: #fff;" title="${escapeHtml(row.rejection_reason || 'Rejected')}">Rejected</span>`;
      }

      const balanceUrl = config.url || config.request?.url || '—';
      const rechargeUrl = config.recharge?.url || '—';

      let actionButtons = '';
      if (status === 'waiting') {
        actionButtons = `
          <button type="button" class="btn btn-sm btn-success btn-action-approve mr-1" data-id="${row.id}" data-name="${escapeHtml(row.name)}" title="Approve Request">
            <i class="fa fa-check"></i> Approve
          </button>
          <button type="button" class="btn btn-sm btn-danger btn-action-reject" data-id="${row.id}" data-name="${escapeHtml(row.name)}" title="Reject Request">
            <i class="fa fa-times"></i> Reject
          </button>
        `;
      } else if (status === 'approved') {
        actionButtons = `
          <button type="button" class="btn btn-sm btn-outline-danger btn-action-reject" data-id="${row.id}" data-name="${escapeHtml(row.name)}" title="Change to Rejected">
            <i class="fa fa-ban"></i> Reject
          </button>
        `;
      } else if (status === 'rejected') {
        actionButtons = `
          <button type="button" class="btn btn-sm btn-outline-success btn-action-approve" data-id="${row.id}" data-name="${escapeHtml(row.name)}" title="Re-approve Request">
            <i class="fa fa-check"></i> Approve
          </button>
        `;
      }

      const modalDetails = escapeHtml(JSON.stringify({
        id: row.id,
        name: row.name,
        userName: row.user_name || row.user_username,
        username: row.user_username,
        userPhone,
        balanceUrl,
        balanceMethod: config.requestType || 'GET',
        balanceResponseType: config.responseType || 'JSON',
        balanceKey: row.balance_key || config.balanceKey || '',
        balanceValue: row.balance_value || '',
        balanceParams: config.parameters || [],
        rechargeUrl,
        rechargeMethod: config.recharge?.requestType || 'GET',
        rechargeResponseType: config.recharge?.responseType || 'JSON',
        rechargeParams: config.recharge?.parameters || [],
        rechargeStatusKey: config.recharge?.statusKey || '',
        rechargeSuccessCodes: config.recharge?.successCodes || '',
        rechargeFailedCodes: config.recharge?.failedCodes || '',
        rechargeSupplierIdKey: config.recharge?.supplierIdKey || '',
        rechargeOperatorIdKey: config.recharge?.operatorIdKey || '',
        status,
        rejectionReason: row.rejection_reason || '',
        createdAt: new Date(row.created_at).toLocaleString('en-IN')
      }));

      return `
        <tr id="req-row-${row.id}">
          <td class="text-center font-weight-bold">${index + 1}</td>
          <td>
            <div class="font-weight-bold text-dark">${escapeHtml(row.user_name || 'User')}</div>
            <div class="text-muted small">${escapeHtml(row.user_username)} ${userPhone ? `· <i class="fa fa-phone text-success"></i> ${escapeHtml(userPhone)}` : ''}</div>
          </td>
          <td>
            <div class="font-weight-bold text-primary">${escapeHtml(row.name)}</div>
            <div class="text-muted" style="font-size: 11px;">Services: ${escapeHtml(row.services || 'Mobile')}</div>
          </td>
          <td>
            <div class="text-truncate" style="max-width: 200px; font-size: 12px;" title="${escapeHtml(balanceUrl)}">
              <code>${escapeHtml(balanceUrl)}</code>
            </div>
            <div class="small text-muted mt-1">
              Method: <strong>${escapeHtml(config.requestType || 'GET')}</strong> | Balance: <strong>₹${escapeHtml(row.balance_value || '0.00')}</strong>
            </div>
          </td>
          <td>
            <div class="text-truncate" style="max-width: 200px; font-size: 12px;" title="${escapeHtml(rechargeUrl)}">
              <code>${escapeHtml(rechargeUrl)}</code>
            </div>
            <div class="small text-muted mt-1">
              Method: <strong>${escapeHtml(config.recharge?.requestType || '—')}</strong>
            </div>
          </td>
          <td class="text-center">
            ${statusBadge}
            ${row.rejection_reason ? `<div class="small text-danger mt-1" style="font-size: 11px;">${escapeHtml(row.rejection_reason)}</div>` : ''}
          </td>
          <td class="small text-muted text-center" style="white-space: nowrap;">
            ${escapeHtml(new Date(row.created_at).toLocaleString('en-IN'))}
          </td>
          <td class="text-center" style="white-space: nowrap;">
            ${actionButtons}
            <button type="button" class="btn btn-sm btn-outline-info btn-view-details ml-1" data-details="${modalDetails}" title="View Full API Specs">
              <i class="fa fa-eye"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const selectedStatus = (val) => statusFilter === val ? 'selected' : '';
    const selectedLimit = (val) => pageSize === String(val) ? 'selected' : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Request API Approval - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    .horizontalMenu-list > li > a, .horizontalMenu-list > li > a:visited { color: #fff !important; font-weight: 700 !important; }
    .horizontalMenu-list > li:hover > a, .horizontalMenu-list > li:focus-within > a { color: #fff !important; background: #35489d !important; }
    .horizontalMenu-list .sub-menu { background: #fff !important; border: 1px solid #dbe1ee !important; box-shadow: 0 8px 22px #17224b24; }
    .horizontalMenu-list .sub-menu > li > a, .horizontalMenu-list .sub-menu > li > a:visited { background: #fff !important; color: #29385f !important; font-weight: 600 !important; }
    .horizontalMenu-list .sub-menu > li > a:hover { background: #edf2ff !important; color: #344ca6 !important; }
    
    .badge-custom { font-size: 11px; padding: 5px 10px; font-weight: 600; border-radius: 4px; }
    .stat-card { border-radius: 8px; border: 0; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
    .stat-card .card-body { padding: 15px 20px; }
    .stat-num { font-size: 22px; font-weight: 700; margin-bottom: 2px; }
    .table-req thead { background: #1e5ba8; color: #fff; }
    .table-req thead th { vertical-align: middle; font-size: 12px; font-weight: 600; border: none; }
    .table-req tbody td { vertical-align: middle; font-size: 12px; }
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
              <li><a href="#">User</a>
                <ul class="sub-menu">
                  <li><a href="/admin/users/list">List User</a></li>
                </ul>
              </li>
              <li><a href="#">Payment</a>
                <ul class="sub-menu">
                  <li><a href="/admin/payment/fund-request">Fund Request</a></li>
                </ul>
              </li>
              <li class="active"><a href="/admin/seller-api/requests" style="background:#25377a; color:#fff !important;">Request API Approval</a></li>
              <li><a href="#">Settings</a>
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
        
        <div class="page-header d-flex justify-content-between align-items-center mt-3 mb-3">
          <h4 class="page-title mb-0 font-weight-bold text-dark">
            <i class="fa fa-plug text-primary mr-1"></i> Request API Approval
          </h4>
          <div>
            <button id="btnRefreshList" class="btn btn-sm btn-outline-primary shadow-sm"><i class="fa fa-refresh mr-1"></i> Refresh</button>
          </div>
        </div>

        <!-- Top Summary Cards -->
        <div class="row mb-3">
          <div class="col-6 col-md-3">
            <div class="card stat-card bg-light border-left border-danger" style="border-left-width: 4px !important;">
              <div class="card-body">
                <div class="text-danger small font-weight-bold text-uppercase">Waiting Approval</div>
                <div class="stat-num text-danger">${counts.waiting_count}</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card stat-card bg-light border-left border-success" style="border-left-width: 4px !important;">
              <div class="card-body">
                <div class="text-success small font-weight-bold text-uppercase">Approved APIs</div>
                <div class="stat-num text-success">${counts.approved_count}</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card stat-card bg-light border-left border-dark" style="border-left-width: 4px !important;">
              <div class="card-body">
                <div class="text-dark small font-weight-bold text-uppercase">Rejected APIs</div>
                <div class="stat-num text-dark">${counts.rejected_count}</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card stat-card bg-light border-left border-primary" style="border-left-width: 4px !important;">
              <div class="card-body">
                <div class="text-primary small font-weight-bold text-uppercase">Total Submissions</div>
                <div class="stat-num text-primary">${counts.total_count}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Filter Card -->
        <section class="card mb-3 shadow-sm">
          <div class="card-body py-3">
            <form method="GET" action="/admin/seller-api/requests">
              <div class="form-row align-items-end">
                <div class="form-group col-md-3 mb-2">
                  <label class="font-weight-bold small text-muted" for="statusFilter">Approval Status</label>
                  <select id="statusFilter" name="status" class="form-control form-control-sm">
                    <option value="">All Statuses</option>
                    <option value="waiting" ${selectedStatus('waiting')}>Waiting (Pending Approval)</option>
                    <option value="approved" ${selectedStatus('approved')}>Approved</option>
                    <option value="rejected" ${selectedStatus('rejected')}>Rejected</option>
                  </select>
                </div>
                <div class="form-group col-md-4 mb-2">
                  <label class="font-weight-bold small text-muted" for="searchInput">Search User / API</label>
                  <input id="searchInput" name="search" class="form-control form-control-sm" value="${escapeHtml(search)}" placeholder="Search by name, username, or API name">
                </div>
                <div class="form-group col-md-2 mb-2">
                  <label class="font-weight-bold small text-muted" for="limitSelect">Show Entries</label>
                  <select id="limitSelect" name="limit" class="form-control form-control-sm">
                    <option value="10" ${selectedLimit(10)}>10</option>
                    <option value="25" ${selectedLimit(25)}>25</option>
                    <option value="50" ${selectedLimit(50)}>50</option>
                    <option value="100" ${selectedLimit(100)}>100</option>
                  </select>
                </div>
                <div class="form-group col-md-3 mb-2">
                  <button type="submit" class="btn btn-sm btn-primary px-3 mr-1"><i class="fa fa-search"></i> Filter</button>
                  <a class="btn btn-sm btn-secondary" href="/admin/seller-api/requests">Reset</a>
                </div>
              </div>
            </form>
          </div>
        </section>

        <!-- Requests Table -->
        <section class="card shadow-sm">
          <div class="card-header d-flex justify-content-between align-items-center bg-white border-bottom">
            <h5 class="card-title mb-0 font-weight-bold" style="font-size: 15px;">Seller API Requests</h5>
            <span class="badge badge-primary px-2 py-1 font-weight-bold">${result.rowCount} item(s)</span>
          </div>
          <div class="card-body p-0">
            <div id="statusAlert" class="m-3" style="display: none;"></div>
            <div class="table-responsive">
              <table class="table table-bordered table-striped table-hover mb-0 table-req">
                <thead>
                  <tr>
                    <th style="width: 45px;" class="text-center">#</th>
                    <th>User / Owner</th>
                    <th>API Name</th>
                    <th>Balance Endpoint</th>
                    <th>Recharge Endpoint</th>
                    <th class="text-center" style="width: 110px;">Approval Status</th>
                    <th class="text-center" style="width: 140px;">Requested At</th>
                    <th class="text-center" style="width: 160px;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || '<tr><td colspan="8" class="text-center py-4 text-muted">No API approval requests found.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </main>
  </div>
</div>

<!-- API Details Modal -->
<div class="modal fade" id="apiDetailsModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
    <div class="modal-content">
      <div class="modal-header bg-light">
        <h5 class="modal-title font-weight-bold" id="modalApiTitle"><i class="fa fa-info-circle text-info mr-1"></i> API Configuration Details</h5>
        <button type="button" class="close" data-dismiss="modal"><span>&times;</span></button>
      </div>
      <div class="modal-body p-3">
        <div id="modalDetailsContent"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
<script src="/auth-client.js"></script>
<script>
(function() {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  var btnRefresh = $('btnRefreshList');
  if (btnRefresh) btnRefresh.onclick = function() { location.reload(); };

  // Approve action handler
  document.querySelectorAll('.btn-action-approve').forEach(function(btn) {
    btn.onclick = async function() {
      var id = btn.dataset.id;
      var name = btn.dataset.name;
      if (!confirm('Are you sure you want to APPROVE API "' + name + '"?')) return;

      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/seller-api-requests/' + id + '/decision', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'approve' })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to approve API');
        location.reload();
      } catch (err) {
        alert('Error: ' + err.message);
        btn.disabled = false;
      }
    };
  });

  // Reject action handler
  document.querySelectorAll('.btn-action-reject').forEach(function(btn) {
    btn.onclick = async function() {
      var id = btn.dataset.id;
      var name = btn.dataset.name;
      var note = prompt('Enter Rejection Reason for API "' + name + '" (Optional):', '');
      if (note === null) return;

      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/seller-api-requests/' + id + '/decision', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'reject', note: note })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to reject API');
        location.reload();
      } catch (err) {
        alert('Error: ' + err.message);
        btn.disabled = false;
      }
    };
  });

  // View Details handler
  document.querySelectorAll('.btn-view-details').forEach(function(btn) {
    btn.onclick = function() {
      try {
        var d = JSON.parse(btn.dataset.details);
        $('modalApiTitle').innerHTML = '<i class="fa fa-plug text-primary mr-1"></i> API Details: ' + escapeHtml(d.name);
        
        var paramsHtml = '<span class="text-muted">None</span>';
        if (Array.isArray(d.balanceParams) && d.balanceParams.length > 0) {
          paramsHtml = '<ul class="list-unstyled mb-0">' + d.balanceParams.map(function(p) {
            return '<li><code>' + escapeHtml(p.key) + '</code> = <code>' + escapeHtml(p.value) + '</code></li>';
          }).join('') + '</ul>';
        }

        var rechargeParamsHtml = '<span class="text-muted">None</span>';
        if (Array.isArray(d.rechargeParams) && d.rechargeParams.length > 0) {
          rechargeParamsHtml = '<ul class="list-unstyled mb-0">' + d.rechargeParams.map(function(p) {
            return '<li><code>' + escapeHtml(p.key) + '</code> = <code>' + escapeHtml(p.value) + '</code></li>';
          }).join('') + '</ul>';
        }

        var html = '<div class="row">' +
          '<div class="col-md-6 mb-3">' +
            '<div class="card h-100 bg-light">' +
              '<div class="card-header bg-white font-weight-bold py-2"><i class="fa fa-user text-primary mr-1"></i> User Info</div>' +
              '<div class="card-body py-2">' +
                '<div><strong>Name:</strong> ' + escapeHtml(d.userName) + '</div>' +
                '<div><strong>Username:</strong> ' + escapeHtml(d.username) + '</div>' +
                '<div><strong>Phone:</strong> ' + escapeHtml(d.userPhone || '—') + '</div>' +
                '<div><strong>Submitted At:</strong> ' + escapeHtml(d.createdAt) + '</div>' +
                '<div><strong>Status:</strong> <span class="badge badge-' + (d.status === 'approved' ? 'success' : 'danger') + '">' + escapeHtml(d.status) + '</span></div>' +
                (d.rejectionReason ? '<div class="text-danger mt-1"><strong>Reason:</strong> ' + escapeHtml(d.rejectionReason) + '</div>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="col-md-6 mb-3">' +
            '<div class="card h-100 bg-light">' +
              '<div class="card-header bg-white font-weight-bold py-2"><i class="fa fa-money text-success mr-1"></i> Balance API Config</div>' +
              '<div class="card-body py-2" style="font-size: 12px;">' +
                '<div><strong>URL:</strong> <code style="word-break: break-all;">' + escapeHtml(d.balanceUrl) + '</code></div>' +
                '<div><strong>Method:</strong> ' + escapeHtml(d.balanceMethod) + ' | <strong>Format:</strong> ' + escapeHtml(d.balanceResponseType) + '</div>' +
                '<div><strong>Balance Key:</strong> <code>' + escapeHtml(d.balanceKey || '—') + '</code></div>' +
                '<div><strong>Last Fetched Balance:</strong> ₹' + escapeHtml(d.balanceValue || '0.00') + '</div>' +
                '<div class="mt-1"><strong>Parameters:</strong> ' + paramsHtml + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="col-md-12">' +
            '<div class="card bg-light">' +
              '<div class="card-header bg-white font-weight-bold py-2"><i class="fa fa-bolt text-warning mr-1"></i> Recharge API Config</div>' +
              '<div class="card-body py-2" style="font-size: 12px;">' +
                '<div><strong>Recharge URL:</strong> <code style="word-break: break-all;">' + escapeHtml(d.rechargeUrl) + '</code></div>' +
                '<div><strong>Method:</strong> ' + escapeHtml(d.rechargeMethod) + ' | <strong>Format:</strong> ' + escapeHtml(d.rechargeResponseType) + '</div>' +
                '<div class="row mt-2">' +
                  '<div class="col-md-6">' +
                    '<div><strong>Status Key:</strong> <code>' + escapeHtml(d.rechargeStatusKey || '—') + '</code></div>' +
                    '<div><strong>Success Values:</strong> <code>' + escapeHtml(d.rechargeSuccessCodes || '—') + '</code></div>' +
                    '<div><strong>Failed Values:</strong> <code>' + escapeHtml(d.rechargeFailedCodes || '—') + '</code></div>' +
                  '</div>' +
                  '<div class="col-md-6">' +
                    '<div><strong>Supplier ID Key:</strong> <code>' + escapeHtml(d.rechargeSupplierIdKey || '—') + '</code></div>' +
                    '<div><strong>Operator ID Key:</strong> <code>' + escapeHtml(d.rechargeOperatorIdKey || '—') + '</code></div>' +
                  '</div>' +
                '</div>' +
                '<div class="mt-2"><strong>Parameters:</strong> ' + rechargeParamsHtml + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

        $('modalDetailsContent').innerHTML = html;
        $('#apiDetailsModal').modal('show');
      } catch (err) {
        alert('Failed to show details: ' + err.message);
      }
    };
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
    response.end(await addPanelChrome(html, { role: 'admin' }));
  }

  return { sendAdminSellerApiRequestsPage };
};
