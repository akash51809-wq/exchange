'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');
const { renderAdminNavigation } = require('../config/admin-panel-menu');

module.exports = function createAdminKycListPage({ db, decryptMobile }) {
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

  async function sendAdminKycListPage(admin, response, searchParams) {
    const statusFilter = String(searchParams.get('status') || 'pending').trim().toLowerCase();

    // 1. Fetch counts
    const countRes = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
         COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
         COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
         COUNT(*) AS total_count
       FROM user_kyc`
    ).catch(() => ({ rows: [{ pending_count: 0, approved_count: 0, rejected_count: 0, total_count: 0 }] }));

    const counts = countRes.rows[0] || { pending_count: 0, approved_count: 0, rejected_count: 0, total_count: 0 };

    // 2. Fetch records
    const conditions = [];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      conditions.push(`k.status = ${add(statusFilter)}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const listRes = await db.query(
      `SELECT k.id, k.user_id, k.gst_number, k.aadhar_number,
              k.aadhar_front_data, k.aadhar_back_data,
              k.pan_number, k.pan_card_data,
              k.status, k.rejection_reason, k.submitted_at, k.reviewed_at, k.updated_at,
              u.username, u.name AS user_name, u.email, u.role, u.phone_ciphertext
       FROM user_kyc k
       JOIN users u ON u.id = k.user_id
       ${whereClause}
       ORDER BY
         CASE WHEN k.status = 'pending' THEN 1 ELSE 2 END ASC,
         k.submitted_at DESC
       LIMIT 300`,
      values
    ).catch(() => ({ rows: [] }));

    const rows = listRes.rows || [];

    const rowsHtml = rows.map((r, idx) => {
      let mobile = '—';
      if (r.phone_ciphertext && typeof decryptMobile === 'function') {
        try { mobile = decryptMobile(r.phone_ciphertext) || '—'; } catch { mobile = '••••••••••'; }
      }

      let statusBadge = '';
      if (r.status === 'pending') {
        statusBadge = '<span class="badge badge-warning px-2 py-1 font-weight-bold" style="background:#f59e0b;color:#fff;"><i class="fa fa-clock-o mr-1"></i> Pending</span>';
      } else if (r.status === 'approved') {
        statusBadge = '<span class="badge badge-success px-2 py-1 font-weight-bold" style="background:#10b981;color:#fff;"><i class="fa fa-check-circle mr-1"></i> Approved</span>';
      } else if (r.status === 'rejected') {
        statusBadge = '<span class="badge badge-danger px-2 py-1 font-weight-bold" style="background:#ef4444;color:#fff;"><i class="fa fa-times-circle mr-1"></i> Rejected</span>';
      }

      let actionsHtml = '';
      if (r.status === 'pending') {
        actionsHtml = `
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-success btn-approve-kyc" data-id="${escapeHtml(r.id)}" data-user="${escapeHtml(r.user_name || r.username)}" title="Approve KYC">
              <i class="fa fa-check"></i> Approve
            </button>
            <button type="button" class="btn btn-danger btn-reject-kyc" data-id="${escapeHtml(r.id)}" data-user="${escapeHtml(r.user_name || r.username)}" title="Reject KYC">
              <i class="fa fa-times"></i> Reject
            </button>
          </div>
        `;
      } else if (r.status === 'rejected') {
        actionsHtml = `
          <button type="button" class="btn btn-sm btn-outline-danger btn-reject-kyc" data-id="${escapeHtml(r.id)}" data-user="${escapeHtml(r.user_name || r.username)}" data-prev-reason="${escapeHtml(r.rejection_reason || '')}">
            <i class="fa fa-pencil mr-1"></i> Update Reason
          </button>
        `;
      } else {
        actionsHtml = '<span class="text-success small font-weight-bold"><i class="fa fa-check"></i> Verified</span>';
      }

      return `
        <tr id="row-${escapeHtml(r.id)}">
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <strong class="text-dark d-block">${escapeHtml(r.user_name || 'User')}</strong>
            <span class="small font-monospace text-primary">@${escapeHtml(r.username || '')}</span>
            <div class="small text-muted"><i class="fa fa-phone mr-1"></i>${escapeHtml(mobile)}</div>
            ${r.email ? `<div class="small text-muted font-monospace"><i class="fa fa-envelope mr-1"></i>${escapeHtml(r.email)}</div>` : ''}
          </td>
          <td>
            <span class="font-monospace font-weight-bold text-dark text-uppercase">${escapeHtml(r.gst_number || 'N/A')}</span>
          </td>
          <td>
            <span class="font-monospace font-weight-bold text-dark">${escapeHtml(r.aadhar_number || '-')}</span>
          </td>
          <td>
            <span class="font-monospace font-weight-bold text-dark text-uppercase">${escapeHtml(r.pan_number || '-')}</span>
          </td>
          <td class="text-center" style="white-space:nowrap;">
            <div class="d-flex flex-column align-items-center" style="gap:4px;">
              ${r.aadhar_front_data ? `
                <button type="button" class="btn btn-xs btn-outline-primary btn-block text-left" onclick="viewKycDoc('${escapeHtml(r.id)}', 'aadhar_front')">
                  <i class="fa fa-id-card-o mr-1"></i> Aadhaar Front
                </button>
              ` : '<span class="text-muted small">No Front</span>'}
              ${r.aadhar_back_data ? `
                <button type="button" class="btn btn-xs btn-outline-primary btn-block text-left" onclick="viewKycDoc('${escapeHtml(r.id)}', 'aadhar_back')">
                  <i class="fa fa-id-card mr-1"></i> Aadhaar Back
                </button>
              ` : '<span class="text-muted small">No Back</span>'}
              ${r.pan_card_data ? `
                <button type="button" class="btn btn-xs btn-outline-success btn-block text-left" onclick="viewKycDoc('${escapeHtml(r.id)}', 'pan_card')">
                  <i class="fa fa-credit-card mr-1"></i> PAN Photo
                </button>
              ` : '<span class="text-muted small">No PAN Photo</span>'}
            </div>
          </td>
          <td class="small text-muted font-monospace" style="white-space:nowrap;">
            ${escapeHtml(formatDateTime(r.submitted_at))}
          </td>
          <td class="text-center">
            ${statusBadge}
          </td>
          <td class="small" style="max-width:200px;">
            ${r.status === 'rejected' && r.rejection_reason ? `
              <span class="text-danger font-weight-bold d-block"><i class="fa fa-exclamation-circle mr-1"></i> Rejected:</span>
              <span class="text-dark">${escapeHtml(r.rejection_reason)}</span>
            ` : (r.status === 'approved' ? `
              <span class="text-success"><i class="fa fa-check mr-1"></i> Approved on ${escapeHtml(formatDateTime(r.reviewed_at || r.updated_at))}</span>
            ` : '<span class="text-muted">Awaiting Review</span>')}
          </td>
          <td class="text-center" style="white-space:nowrap;">
            ${actionsHtml}
          </td>
        </tr>
      `;
    }).join('');

    // Pre-serialize row document data so modal can show photos without extra fetch
    const docDataMap = {};
    rows.forEach(r => {
      docDataMap[r.id] = {
        userName: r.user_name || r.username,
        aadharFront: r.aadhar_front_data || '',
        aadharBack: r.aadhar_back_data || '',
        panCard: r.pan_card_data || '',
      };
    });

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pending User KYC Approvals - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    .container-fluid { width: 100%; padding-left: 15px; padding-right: 15px; }
    .metric-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .metric-card .count { font-size: 24px; font-weight: 800; }
    .kyc-table th { font-size: 12px; font-weight: 700; background: #f8fafc; color: #334155; }
    .kyc-table td { font-size: 13px; vertical-align: middle; }
    .modal-doc-img {
      max-width: 100%;
      max-height: 75vh;
      object-fit: contain;
      display: block;
      margin: 0 auto;
      border-radius: 6px;
      border: 1px solid #334155;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${renderAdminNavigation('/admin/users/pending-kyc')}
      <main class="main-content">
        <div class="container-fluid px-3 pt-3">

          <!-- Page Header -->
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <div>
              <h4 class="page-title mb-1 font-weight-bold text-dark">
                <i class="fa fa-id-card-o text-primary mr-2"></i> User KYC Verification &amp; Approvals
              </h4>
              <p class="text-muted small mb-0">Review pending user identity documents (Aadhaar &amp; PAN photos, GST) and approve or reject KYC.</p>
            </div>
            <div>
              <button type="button" class="btn btn-outline-primary btn-sm" onclick="location.reload()">
                <i class="fa fa-refresh mr-1"></i> Refresh
              </button>
            </div>
          </div>

          <!-- Metric Cards -->
          <div class="row mb-3">
            <div class="col-sm-6 col-lg-3 mb-2">
              <a href="?status=pending" class="text-decoration-none">
                <div class="metric-card border-warning">
                  <div>
                    <span class="text-muted small text-uppercase font-weight-bold d-block">Pending KYC</span>
                    <span class="count text-warning">${escapeHtml(String(counts.pending_count || 0))}</span>
                  </div>
                  <i class="fa fa-clock-o text-warning" style="font-size:28px;"></i>
                </div>
              </a>
            </div>

            <div class="col-sm-6 col-lg-3 mb-2">
              <a href="?status=approved" class="text-decoration-none">
                <div class="metric-card border-success">
                  <div>
                    <span class="text-muted small text-uppercase font-weight-bold d-block">Approved KYC</span>
                    <span class="count text-success">${escapeHtml(String(counts.approved_count || 0))}</span>
                  </div>
                  <i class="fa fa-check-circle text-success" style="font-size:28px;"></i>
                </div>
              </a>
            </div>

            <div class="col-sm-6 col-lg-3 mb-2">
              <a href="?status=rejected" class="text-decoration-none">
                <div class="metric-card border-danger">
                  <div>
                    <span class="text-muted small text-uppercase font-weight-bold d-block">Rejected KYC</span>
                    <span class="count text-danger">${escapeHtml(String(counts.rejected_count || 0))}</span>
                  </div>
                  <i class="fa fa-times-circle text-danger" style="font-size:28px;"></i>
                </div>
              </a>
            </div>

            <div class="col-sm-6 col-lg-3 mb-2">
              <a href="?status=all" class="text-decoration-none">
                <div class="metric-card border-primary">
                  <div>
                    <span class="text-muted small text-uppercase font-weight-bold d-block">Total Submissions</span>
                    <span class="count text-primary">${escapeHtml(String(counts.total_count || 0))}</span>
                  </div>
                  <i class="fa fa-users text-primary" style="font-size:28px;"></i>
                </div>
              </a>
            </div>
          </div>

          <!-- Filter Tabs & Search -->
          <div class="card mb-3 shadow-sm border-0">
            <div class="card-header bg-white py-2 px-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
              
              <ul class="nav nav-pills card-header-pills">
                <li class="nav-item">
                  <a class="nav-link font-weight-bold ${statusFilter === 'pending' ? 'active' : ''}" href="?status=pending">
                    <i class="fa fa-clock-o mr-1"></i> Pending (${counts.pending_count})
                  </a>
                </li>
                <li class="nav-item">
                  <a class="nav-link font-weight-bold ${statusFilter === 'approved' ? 'active' : ''}" href="?status=approved">
                    <i class="fa fa-check-circle mr-1"></i> Approved (${counts.approved_count})
                  </a>
                </li>
                <li class="nav-item">
                  <a class="nav-link font-weight-bold ${statusFilter === 'rejected' ? 'active' : ''}" href="?status=rejected">
                    <i class="fa fa-times-circle mr-1"></i> Rejected (${counts.rejected_count})
                  </a>
                </li>
                <li class="nav-item">
                  <a class="nav-link font-weight-bold ${statusFilter === 'all' || !statusFilter ? 'active' : ''}" href="?status=all">
                    <i class="fa fa-list mr-1"></i> All Submissions (${counts.total_count})
                  </a>
                </li>
              </ul>

              <div style="max-width:280px;width:100%;">
                <input type="text" id="searchInput" class="form-control form-control-sm" placeholder="Filter list...">
              </div>

            </div>

            <div class="table-responsive">
              <table class="table table-bordered table-hover mb-0 kyc-table" id="kycTable">
                <thead>
                  <tr>
                    <th class="text-center" style="width:40px;">#</th>
                    <th>USER DETAILS</th>
                    <th>GST NUMBER</th>
                    <th>AADHAAR NUMBER</th>
                    <th>PAN NUMBER</th>
                    <th class="text-center" style="width:160px;">ATTACHED PHOTOS</th>
                    <th>SUBMITTED AT</th>
                    <th class="text-center" style="width:110px;">STATUS</th>
                    <th>REMARKS / REASON</th>
                    <th class="text-center" style="width:150px;">ACTION</th>
                  </tr>
                </thead>
                <tbody id="kycTableBody">
                  ${rowsHtml || '<tr><td colspan="10" class="text-center py-4 text-muted"><i class="fa fa-inbox fa-2x d-block mb-1"></i>No KYC records found in this category.</td></tr>'}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      </main>
    </div>
  </div>

  <!-- Document Viewer Modal -->
  <div class="modal fade" id="adminDocModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header py-2 px-3 bg-light d-flex justify-content-between align-items-center">
          <div>
            <h6 class="modal-title font-weight-bold text-dark" id="adminDocTitle">Document Photo</h6>
            <small class="text-muted" id="adminDocUser"></small>
          </div>
          <button type="button" class="close" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body p-3 text-center bg-dark">
          <img src="" id="adminDocImage" class="modal-doc-img" alt="Document Viewer">
        </div>
        <div class="modal-footer py-2 px-3 bg-light d-flex justify-content-between">
          <a href="#" id="adminDocDownloadBtn" download="kyc-doc" class="btn btn-outline-primary btn-sm">
            <i class="fa fa-download mr-1"></i> Download Original
          </a>
          <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Rejection Reason Modal -->
  <div class="modal fade" id="rejectKycModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header py-2 px-3 bg-danger text-white">
          <h6 class="modal-title font-weight-bold"><i class="fa fa-times-circle mr-1"></i> Reject KYC Application</h6>
          <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body p-3">
          <p class="small text-dark mb-2">
            You are rejecting KYC for: <strong id="rejectModalUserName" class="text-danger"></strong>
          </p>
          <div class="form-group mb-0">
            <label class="font-weight-bold small text-dark">
              Reason for Rejection <span class="text-danger">*</span>
            </label>
            <textarea id="rejectionReasonInput" class="form-control" rows="3" placeholder="e.g. Aadhaar card photo is blurry / Name does not match PAN / Invalid ID numbers..." required></textarea>
            <small class="form-text text-muted">This reason will be displayed directly to the user on their KYC page so they can re-submit with correct details.</small>
          </div>
        </div>
        <div class="modal-footer py-2 px-3 bg-light d-flex justify-content-between">
          <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-danger btn-sm font-weight-bold" id="btnConfirmReject">
            <i class="fa fa-times-circle mr-1"></i> Confirm Reject KYC
          </button>
        </div>
      </div>
    </div>
  </div>

  <script id="kycDocsData" type="application/json">
    ${JSON.stringify(docDataMap).replace(/</g, '\\u003c')}
  </script>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script src="/auth-client.js"></script>
  <script>
  (function() {
    let docMap = {};
    try {
      docMap = JSON.parse(document.getElementById('kycDocsData').textContent);
    } catch(e) {}

    window.viewKycDoc = function(kycId, docType) {
      const rec = docMap[kycId];
      if (!rec) return;

      let src = '';
      let title = '';
      if (docType === 'aadhar_front') {
        src = rec.aadharFront;
        title = 'Aadhaar Card Front Photo';
      } else if (docType === 'aadhar_back') {
        src = rec.aadharBack;
        title = 'Aadhaar Card Back Photo';
      } else if (docType === 'pan_card') {
        src = rec.panCard;
        title = 'PAN Card Photo';
      }

      if (!src) {
        alert('No photo attached for this document.');
        return;
      }

      document.getElementById('adminDocTitle').textContent = title;
      document.getElementById('adminDocUser').textContent = 'User: ' + rec.userName;
      const img = document.getElementById('adminDocImage');
      img.src = src;
      const dlBtn = document.getElementById('adminDocDownloadBtn');
      if (dlBtn) dlBtn.href = src;

      $('#adminDocModal').modal('show');
    };

    // Filter search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        const q = searchInput.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#kycTableBody tr');
        rows.forEach(function(tr) {
          tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    }

    // Approve KYC
    document.querySelectorAll('.btn-approve-kyc').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        const kycId = btn.getAttribute('data-id');
        const userName = btn.getAttribute('data-user');

        if (!confirm('Are you sure you want to APPROVE KYC for ' + userName + '? Once approved, Seller payout will be unlocked.')) {
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';

        try {
          const res = await fetch('/api/admin/kyc/approve', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ kycId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to approve KYC.');
          alert('✓ KYC Approved successfully for ' + userName);
          location.reload();
        } catch(err) {
          alert('Error: ' + err.message);
          btn.disabled = false;
          btn.innerHTML = '<i class="fa fa-check"></i> Approve';
        }
      });
    });

    // Reject KYC Modal
    let activeRejectId = null;
    document.querySelectorAll('.btn-reject-kyc').forEach(function(btn) {
      btn.addEventListener('click', function() {
        activeRejectId = btn.getAttribute('data-id');
        const userName = btn.getAttribute('data-user');
        const prevReason = btn.getAttribute('data-prev-reason') || '';

        document.getElementById('rejectModalUserName').textContent = userName;
        document.getElementById('rejectionReasonInput').value = prevReason;
        $('#rejectKycModal').modal('show');
      });
    });

    // Confirm Reject KYC
    const btnConfirmReject = document.getElementById('btnConfirmReject');
    if (btnConfirmReject) {
      btnConfirmReject.addEventListener('click', async function() {
        if (!activeRejectId) return;

        const reason = document.getElementById('rejectionReasonInput').value.trim();
        if (!reason) {
          alert('Please enter a rejection reason.');
          document.getElementById('rejectionReasonInput').focus();
          return;
        }

        btnConfirmReject.disabled = true;
        btnConfirmReject.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Rejecting...';

        try {
          const res = await fetch('/api/admin/kyc/reject', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ kycId: activeRejectId, reason }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to reject KYC.');

          $('#rejectKycModal').modal('hide');
          alert('✓ KYC marked as Rejected with reason. User can now Re-KYC.');
          location.reload();
        } catch(err) {
          alert('Error: ' + err.message);
          btnConfirmReject.disabled = false;
          btnConfirmReject.innerHTML = '<i class="fa fa-times-circle mr-1"></i> Confirm Reject KYC';
        }
      });
    }

  })();
  </script>
</body>
</html>`;

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(await addPanelChrome(html, { role: 'admin', userId: admin.id, db, currentPath: '/admin/users/pending-kyc' }));
  }

  return { sendAdminKycListPage };
};
