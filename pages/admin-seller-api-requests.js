'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');
const { decryptSellerApiConfig } = require('../lib/stock-api-helper');

module.exports = function createAdminSellerApiRequestsPage({ db, formatMinorUnits, decryptMobile }) {
  async function sendAdminSellerApiRequestsPage(admin, response, searchParams = new URLSearchParams()) {
    // Fetch Client Integration Requests
    const intResult = await db.query(
      `SELECT ir.id, ir.user_id, ir.api_website, ir.api_username, ir.website_password,
              ir.support_number, ir.server_ip, ir.api_token, ir.api_pin, ir.api_remark,
              ir.doc_name, ir.status, ir.admin_note, ir.created_at, ir.reviewed_at,
              u.name AS user_name, u.username AS user_username, u.phone_ciphertext AS user_phone_cipher
       FROM seller_api_integration_requests ir
       JOIN users u ON u.id = ir.user_id
       ORDER BY 
         CASE WHEN ir.status = 'pending' THEN 0 WHEN ir.status = 'in_progress' THEN 1 ELSE 2 END,
         ir.created_at DESC
       LIMIT 200`
    ).catch(() => ({ rows: [] }));

    const intRows = intResult.rows || [];
    const intPendingCount = intRows.filter(r => r.status === 'pending').length;

    const intRowsHtml = intRows.length > 0
      ? intRows.map((row, index) => {
        let userPhone = '';
        if (row.user_phone_cipher && decryptMobile) {
          try { userPhone = decryptMobile(row.user_phone_cipher); } catch {}
        }

        let badge = '<span class="badge badge-warning text-dark px-2 py-1"><i class="fa fa-clock-o mr-1"></i> Pending</span>';
        if (row.status === 'in_progress') {
          badge = '<span class="badge badge-info px-2 py-1"><i class="fa fa-spinner fa-spin mr-1"></i> In Progress</span>';
        } else if (row.status === 'approved') {
          badge = '<span class="badge badge-success px-2 py-1"><i class="fa fa-check-circle mr-1"></i> Approved</span>';
        } else if (row.status === 'rejected') {
          badge = '<span class="badge badge-danger px-2 py-1"><i class="fa fa-times-circle mr-1"></i> Rejected</span>';
        }

        const docBtn = row.doc_name
          ? `<a href="/api/integration-requests/${row.id}/document" class="btn btn-sm btn-outline-primary py-0 px-2 text-nowrap" target="_blank" rel="noopener">
               <i class="fa fa-download mr-1"></i> ${escapeHtml(row.doc_name.slice(0, 15))}
             </a>`
          : '<span class="text-muted small">—</span>';

        const rawPassword = row.website_password || '';

        return `
          <tr id="int-row-${row.id}">
            <td class="text-center font-weight-bold text-muted">${index + 1}</td>
            <td>
              <div class="font-weight-bold text-dark">${escapeHtml(row.user_name || 'Client User')}</div>
              <div class="text-muted small">${escapeHtml(row.user_username)} ${userPhone ? `· <a href="tel:${escapeHtml(userPhone)}" class="text-success"><i class="fa fa-phone"></i> ${escapeHtml(userPhone)}</a>` : ''}</div>
            </td>
            <td>
              <div class="font-weight-bold text-primary font-monospace text-truncate" style="max-width: 180px;" title="${escapeHtml(row.api_website)}">
                <a href="${escapeHtml(row.api_website.startsWith('http') ? row.api_website : 'https://' + row.api_website)}" target="_blank" rel="noopener">
                  ${escapeHtml(row.api_website)} <i class="fa fa-external-link small"></i>
                </a>
              </div>
            </td>
            <td><code class="font-weight-bold text-dark font-monospace">${escapeHtml(row.api_username)}</code></td>
            <td>
              <div class="d-flex align-items-center">
                <span class="password-mask font-monospace" data-pw="${escapeHtml(rawPassword)}">••••••••</span>
                ${rawPassword ? `<button type="button" class="btn btn-xs btn-outline-secondary ml-1 btn-toggle-pw" title="Show/Hide Password"><i class="fa fa-eye"></i></button>` : ''}
              </div>
            </td>
            <td>${row.support_number ? `<a href="tel:${escapeHtml(row.support_number)}" class="text-dark"><i class="fa fa-phone text-muted mr-1"></i>${escapeHtml(row.support_number)}</a>` : '—'}</td>
            <td>${row.server_ip ? `<code class="font-monospace text-info">${escapeHtml(row.server_ip)}</code>` : '—'}</td>
            <td>
              <div class="text-truncate font-monospace small" style="max-width: 140px;" title="${escapeHtml(row.api_token || '—')}">
                ${escapeHtml(row.api_token || '—')}
              </div>
            </td>
            <td><code class="font-monospace">${escapeHtml(row.api_pin || '—')}</code></td>
            <td>
              <div class="small text-truncate" style="max-width: 180px;" title="${escapeHtml(row.api_remark || '—')}">
                ${escapeHtml(row.api_remark || '—')}
              </div>
            </td>
            <td class="text-center">${docBtn}</td>
            <td class="text-center">
              ${badge}
              ${row.admin_note ? `<div class="small text-muted mt-1" style="font-size: 11px;">Note: ${escapeHtml(row.admin_note)}</div>` : ''}
            </td>
            <td class="text-center text-nowrap">
              <div class="btn-group btn-group-sm">
                <button type="button" class="btn btn-outline-primary dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                  Update Status
                </button>
                <div class="dropdown-menu dropdown-menu-right">
                  <a class="dropdown-item btn-int-status text-info" href="#" data-id="${row.id}" data-status="in_progress">
                    <i class="fa fa-spinner mr-1"></i> Mark In Progress
                  </a>
                  <a class="dropdown-item btn-int-status text-success" href="#" data-id="${row.id}" data-status="approved">
                    <i class="fa fa-check mr-1"></i> Approve Request
                  </a>
                  <a class="dropdown-item btn-int-status text-danger" href="#" data-id="${row.id}" data-status="rejected">
                    <i class="fa fa-times mr-1"></i> Reject Request
                  </a>
                  <div class="dropdown-divider"></div>
                  <a class="dropdown-item btn-int-status text-muted" href="#" data-id="${row.id}" data-status="pending">
                    <i class="fa fa-undo mr-1"></i> Reset to Pending
                  </a>
                </div>
              </div>
            </td>
          </tr>
        `;
      }).join('')
      : '<tr><td colspan="13" class="text-center py-4 text-muted"><i class="fa fa-inbox mb-1 d-block" style="font-size: 24px;"></i>No client integration requests submitted yet.</td></tr>';

    // Also fetch seller_api_settings for secondary tab
    const cfgResult = await db.query(
      `SELECT s.id, s.name, s.services, s.mode, s.config_ciphertext,
              s.balance_value, s.is_admin_approved, s.approval_status, s.rejection_reason,
              s.created_at, u.name AS user_name, u.username AS user_username
       FROM seller_api_settings s
       JOIN users u ON u.id = s.user_id
       WHERE s.deleted_at IS NULL
       ORDER BY s.created_at DESC
       LIMIT 100`
    ).catch(() => ({ rows: [] }));

    const cfgRowsHtml = (cfgResult.rows || []).map((row, idx) => {
      let config = {};
      try { config = decryptSellerApiConfig(row.config_ciphertext); } catch {}
      const status = row.approval_status || (row.is_admin_approved ? 'approved' : 'waiting');
      const badge = status === 'approved'
        ? '<span class="badge badge-success">Approved</span>'
        : status === 'rejected'
          ? '<span class="badge badge-danger">Rejected</span>'
          : '<span class="badge badge-warning text-dark">Waiting</span>';
      return `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td><strong>${escapeHtml(row.user_name || row.user_username)}</strong></td>
          <td><strong class="text-primary">${escapeHtml(row.name)}</strong></td>
          <td><code>${escapeHtml(config.url || '—')}</code></td>
          <td class="text-center">${badge}</td>
          <td class="small text-muted text-center">${escapeHtml(new Date(row.created_at).toLocaleString('en-IN'))}</td>
          <td class="text-center">
            <button type="button" class="btn btn-xs btn-success btn-cfg-approve mr-1" data-id="${row.id}">Approve</button>
            <button type="button" class="btn btn-xs btn-danger btn-cfg-reject" data-id="${row.id}">Reject</button>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" class="text-center py-3 text-muted">No API settings configured.</td></tr>';

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Seller API Requests - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    .font-monospace { font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .table thead th { background: #1e293b; color: #fff; font-size: 12px; font-weight: 600; vertical-align: middle; }
    .table tbody td { vertical-align: middle; font-size: 13px; }
    .nav-tabs .nav-link { font-weight: 600; color: #475569; }
    .nav-tabs .nav-link.active { font-weight: 700; color: #2563eb; border-top: 2px solid #2563eb; }
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
                  <li><a href="/admin/payment/bank-list">Bank List</a></li>
                </ul>
              </li>
              <li class="active"><a href="/admin/seller-api/requests" style="background:#25377a; color:#fff !important;">Seller API Requests</a></li>
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
      <div class="container-fluid px-2 py-3">
        <div class="page-header d-flex justify-content-between align-items-center mb-3">
          <div>
            <h4 class="page-title mb-1 font-weight-bold text-dark">
              <i class="fa fa-plug text-primary mr-2"></i> Seller API Requests
            </h4>
            <p class="text-muted mb-0 small">Review and manage supplier API integration requests and configurations submitted by clients.</p>
          </div>
          <div>
            <button class="btn btn-outline-primary btn-sm" onclick="location.reload()">
              <i class="fa fa-refresh mr-1"></i> Refresh
            </button>
          </div>
        </div>

        <div id="alertPlaceholder"></div>

        <ul class="nav nav-tabs mb-3" id="apiTabs" role="tablist">
          <li class="nav-item">
            <a class="nav-link active" id="integration-tab" data-toggle="tab" href="#integrationTabContent" role="tab">
              <i class="fa fa-paper-plane mr-1"></i> Client Integration Requests
              ${intPendingCount > 0 ? `<span class="badge badge-warning text-dark ml-1">${intPendingCount}</span>` : ''}
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" id="config-tab" data-toggle="tab" href="#configTabContent" role="tab">
              <i class="fa fa-cogs mr-1"></i> Seller API Configurations
            </a>
          </li>
        </ul>

        <div class="tab-content" id="apiTabsContent">
          <!-- Tab 1: Client Integration Requests -->
          <div class="tab-pane fade show active" id="integrationTabContent" role="tabpanel">
            <div class="card shadow-sm border-0">
              <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                <h5 class="card-title mb-0 font-weight-bold" style="font-size:15px;">
                  <i class="fa fa-list text-primary mr-2"></i> Client API Integration Requests (${intRows.length})
                </h5>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-bordered table-hover table-striped mb-0 text-nowrap">
                    <thead>
                      <tr>
                        <th class="text-center" style="width: 40px;">#</th>
                        <th>Client User</th>
                        <th>API Website</th>
                        <th>API Username / ID</th>
                        <th>Website Password</th>
                        <th>Support Number</th>
                        <th>Server IP Address</th>
                        <th>API Token</th>
                        <th>API Pin</th>
                        <th>API Remark</th>
                        <th class="text-center">API Document</th>
                        <th class="text-center">Status</th>
                        <th class="text-center" style="width: 140px;">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${intRowsHtml}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab 2: Seller API Configurations -->
          <div class="tab-pane fade" id="configTabContent" role="tabpanel">
            <div class="card shadow-sm border-0">
              <div class="card-header bg-white py-2">
                <h5 class="card-title mb-0 font-weight-bold" style="font-size:15px;">
                  <i class="fa fa-sliders text-primary mr-2"></i> Seller Configured API Endpoints
                </h5>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-bordered table-striped mb-0 text-nowrap">
                    <thead>
                      <tr>
                        <th class="text-center" style="width:40px;">#</th>
                        <th>User</th>
                        <th>API Name</th>
                        <th>Base URL</th>
                        <th class="text-center">Status</th>
                        <th class="text-center">Submitted At</th>
                        <th class="text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${cfgRowsHtml}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </main>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="/auth-client.js"></script>
<script>
function showAlert(msg, type = 'success') {
  const c = document.getElementById('alertPlaceholder');
  c.innerHTML = '<div class="alert alert-' + type + ' alert-dismissible fade show" role="alert">' +
    msg + '<button type="button" class="close" data-dismiss="alert"><span>&times;</span></button></div>';
}

// Password toggle eye button
document.querySelectorAll('.btn-toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const mask = btn.previousElementSibling;
    const isMasked = mask.textContent.startsWith('•');
    if (isMasked) {
      mask.textContent = mask.getAttribute('data-pw');
      btn.innerHTML = '<i class="fa fa-eye-slash"></i>';
    } else {
      mask.textContent = '••••••••';
      btn.innerHTML = '<i class="fa fa-eye"></i>';
    }
  });
});

// Update Integration Request Status
document.querySelectorAll('.btn-int-status').forEach(item => {
  item.addEventListener('click', async (e) => {
    e.preventDefault();
    const id = item.getAttribute('data-id');
    const status = item.getAttribute('data-status');
    const adminNote = prompt('Enter admin note / remark for this status update (optional):', '') || '';

    try {
      const res = await fetch('/api/admin/integration-requests/' + id + '/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status, adminNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status.');
      showAlert('Request status updated successfully to ' + status + '!');
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      showAlert(err.message, 'danger');
    }
  });
});

// Config tab approve / reject
document.querySelectorAll('.btn-cfg-approve').forEach(btn => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-id');
    try {
      const res = await fetch('/api/admin/seller-api-requests/' + id + '/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed.');
      showAlert('API configuration approved.');
      setTimeout(() => location.reload(), 1000);
    } catch (err) { showAlert(err.message, 'danger'); }
  });
});

document.querySelectorAll('.btn-cfg-reject').forEach(btn => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-id');
    const note = prompt('Enter rejection reason:') || '';
    try {
      const res = await fetch('/api/admin/seller-api-requests/' + id + '/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'reject', note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rejection failed.');
      showAlert('API configuration rejected.');
      setTimeout(() => location.reload(), 1000);
    } catch (err) { showAlert(err.message, 'danger'); }
  });
});
</script>
</body>
</html>`;

    const fullHtml = useFullWidthContainers(html);
    const framedHtml = await addPanelChrome(fullHtml, {
      role: 'admin',
      userId: admin.id,
      db,
      currentPath: '/admin/seller-api/requests',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    });
    response.end(framedHtml);
  }

  return { sendAdminSellerApiRequestsPage };
};
