'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = function createAdminDisputesPage({ db, formatMinorUnits, decryptMobile }) {
  
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

  async function sendAdminDisputesPage(admin, response, searchParams) {
    const filters = {
      limit: String(searchParams.get('limit') || '50').trim(),
      fromDate: String(searchParams.get('fromDate') || '').trim(),
      toDate: String(searchParams.get('toDate') || '').trim(),
      status: String(searchParams.get('status') || '').trim().toLowerCase(),
      operatorId: String(searchParams.get('operatorId') || '').trim(),
      search: String(searchParams.get('search') || '').trim().slice(0, 80),
    };

    const operators = await db.query(
      "SELECT id, operator_name, service_type, operator_code FROM operator_definitions WHERE status='active' AND deleted_at IS NULL ORDER BY operator_name",
    );

    // Query disputes
    const conditions = ["r.dispute_status IN ('pending', 'accepted', 'rejected')"];
    const values = [];
    const add = (value) => { values.push(value); return `$${values.length}`; };

    if (filters.fromDate) {
      conditions.push(`r.dispute_created_at >= ${add(`${filters.fromDate} 00:00:00+05:30`)}`);
    }
    if (filters.toDate) {
      conditions.push(`r.dispute_created_at <= ${add(`${filters.toDate} 23:59:59.999+05:30`)}`);
    }
    if (filters.status && ['pending', 'accepted', 'rejected'].includes(filters.status)) {
      conditions.push(`r.dispute_status = ${add(filters.status)}`);
    }
    if (filters.operatorId && UUID.test(filters.operatorId)) {
      conditions.push(`r.operator_id = ${add(filters.operatorId)}`);
    }
    if (filters.search) {
      conditions.push(`(r.mobile_number ILIKE ${add(`%${filters.search}%`)} OR r.idempotency_key ILIKE ${add(`%${filters.search}%`)} OR r.id::text ILIKE ${add(`%${filters.search}%`)} OR b.username ILIKE ${add(`%${filters.search}%`)} OR s.username ILIKE ${add(`%${filters.search}%`)})`);
    }

    let limitClause = 'LIMIT 50';
    if (filters.limit === '20') limitClause = 'LIMIT 20';
    else if (filters.limit === '100') limitClause = 'LIMIT 100';
    else if (filters.limit === '200') limitClause = 'LIMIT 200';
    else if (filters.limit === 'all') limitClause = 'LIMIT 1000';

    const query = `
      SELECT r.id, r.user_id AS buyer_user_id, r.seller_user_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.circle_name, r.amount_minor, r.margin_minor, r.cost_minor,
             r.status, r.idempotency_key, r.provider_reference, r.with_gst,
             r.dispute_status, r.dispute_reason, r.dispute_resolution_note,
             r.dispute_created_at, r.dispute_resolved_at, r.created_at,
             b.username AS buyer_username, b.name AS buyer_name,
             s.username AS seller_username, s.name AS seller_name
      FROM recharge_orders r
      LEFT JOIN users b ON b.id = r.user_id
      LEFT JOIN users s ON s.id = r.seller_user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY r.dispute_created_at DESC NULLS LAST, r.created_at DESC
      ${limitClause}
    `;

    const result = await db.query(query, values);

    // KPI counts
    let pendingCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;
    let totalDisputedAmountMinor = 0n;

    const rowsHtml = result.rows.map((row, index) => {
      totalDisputedAmountMinor += BigInt(row.amount_minor || '0');
      const dStatus = (row.dispute_status || 'pending').toLowerCase();
      if (dStatus === 'pending') pendingCount++;
      else if (dStatus === 'accepted') acceptedCount++;
      else if (dStatus === 'rejected') rejectedCount++;

      let mobile = row.mobile_number || '';
      if (!mobile && row.mobile_ciphertext && decryptMobile) {
        try {
          mobile = decryptMobile(row.mobile_ciphertext);
        } catch {
          mobile = '••••••••••';
        }
      }

      let disputeBadge = '';
      if (dStatus === 'pending') {
        disputeBadge = '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;font-size:11px;"><i class="fa fa-clock-o"></i> Pending Review</span>';
      } else if (dStatus === 'accepted') {
        disputeBadge = '<span class="badge badge-success" style="background:#10b981;font-size:11px;"><i class="fa fa-check-circle"></i> Accepted (Refunded)</span>';
      } else if (dStatus === 'rejected') {
        disputeBadge = '<span class="badge badge-danger" style="background:#ef4444;font-size:11px;"><i class="fa fa-times-circle"></i> Rejected</span>';
      }

      let orderBadge = '';
      if (row.status === 'refunded') {
        orderBadge = '<span class="badge badge-info" style="background:#0ea5e9;font-size:10px;">Refunded</span>';
      } else if (row.status === 'successful') {
        orderBadge = '<span class="badge badge-success" style="background:#22c55e;font-size:10px;">Successful</span>';
      } else {
        orderBadge = `<span class="badge badge-secondary" style="font-size:10px;">${escapeHtml(row.status)}</span>`;
      }

      const formattedAmount = `₹${formatMinorUnits(row.amount_minor)}`;
      const formattedCost = `₹${formatMinorUnits(row.cost_minor || row.amount_minor)}`;
      const shortTxnId = String(row.id).slice(0, 13) + '...';

      let adminActionCell = '';
      if (dStatus === 'pending') {
        adminActionCell = `
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-xs btn-success btn-admin-accept"
              data-id="${escapeHtml(row.id)}"
              data-amount="${escapeHtml(formattedAmount)}"
              data-buyer="${escapeHtml(row.buyer_username || 'Buyer')}">
              <i class="fa fa-check"></i> Accept Refund
            </button>
            <button type="button" class="btn btn-xs btn-danger btn-admin-reject ml-1"
              data-id="${escapeHtml(row.id)}"
              data-buyer="${escapeHtml(row.buyer_username || 'Buyer')}">
              <i class="fa fa-times"></i> Reject
            </button>
          </div>
        `;
      } else {
        adminActionCell = `
          <div class="small text-muted font-italic">
            Resolved: ${escapeHtml(formatDateTime(row.dispute_resolved_at))}
            ${row.dispute_resolution_note ? `<div class="text-dark small">Note: ${escapeHtml(row.dispute_resolution_note)}</div>` : ''}
          </div>
        `;
      }

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${index + 1}</td>
          <td class="small text-muted font-monospace" style="white-space:nowrap;">${escapeHtml(formatDateTime(row.dispute_created_at || row.created_at))}</td>
          <td class="font-monospace font-weight-bold text-primary" title="${escapeHtml(row.id)}">
            ${escapeHtml(shortTxnId)}
            <div class="small text-muted font-monospace">Ref: ${escapeHtml(row.idempotency_key || '-')}</div>
          </td>
          <td>
            <strong class="text-dark">${escapeHtml(row.buyer_name || row.buyer_username || '-')}</strong>
            <div class="small text-muted font-monospace">${escapeHtml(row.buyer_username || '')}</div>
          </td>
          <td>
            <strong class="text-dark">${escapeHtml(row.seller_name || row.seller_username || 'Internal')}</strong>
            <div class="small text-muted font-monospace">${escapeHtml(row.seller_username || '')}</div>
          </td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(mobile)}</td>
          <td>
            <span class="font-weight-bold text-dark">${escapeHtml(row.operator_name || 'Operator')}</span>
            <div class="small text-muted">${escapeHtml(row.circle_name || 'All Circle')}</div>
          </td>
          <td class="text-right font-monospace">
            <div class="font-weight-bold text-dark">${formattedAmount}</div>
            <div class="small text-muted">Cost: ${formattedCost}</div>
          </td>
          <td class="small" style="max-width:240px;">
            <div class="p-1 bg-light border rounded text-dark">${escapeHtml(row.dispute_reason || 'Dispute raised')}</div>
          </td>
          <td class="text-center">${disputeBadge}</td>
          <td class="text-center">${orderBadge}</td>
          <td class="text-center" style="white-space:nowrap;">${adminActionCell}</td>
        </tr>
      `;
    }).join('');

    const selected = (actual, expected) => (actual === expected ? ' selected' : '');
    const operatorOptions = operators.rows.map((op) => `<option value="${op.id}"${selected(filters.operatorId, op.id)}>${escapeHtml(op.operator_name)}</option>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Disputes &amp; Complaints - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body {
      background-color: #f0f3f8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .admin-page-container {
      padding: 16px 20px 40px;
    }
    .admin-titlebar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .admin-titlebar h3 {
      font-size: 20px;
      font-weight: 700;
      color: #1e3a8a;
      margin: 0;
    }
    
    /* Top Filter Bar */
    .filter-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .filter-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin: 0;
    }
    .filter-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .filter-group label {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      margin: 0;
      white-space: nowrap;
    }
    .filter-input, .filter-select {
      height: 32px;
      padding: 2px 8px;
      font-size: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #ffffff;
    }
    .btn-filter-search {
      height: 32px;
      padding: 0 16px;
      font-size: 12px;
      font-weight: 600;
      background: #1e3a8a;
      border: 1px solid #1e3a8a;
      color: #ffffff;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    .btn-filter-reset {
      height: 32px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 600;
      background: #64748b;
      border: 1px solid #475569;
      color: #ffffff;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      text-decoration: none;
    }

    /* KPI Cards */
    .kpi-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }
    .kpi-card {
      flex: 1;
      min-width: 150px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .kpi-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
    }
    .kpi-number {
      font-size: 18px;
      font-weight: 700;
      color: #1e293b;
      margin-top: 2px;
    }

    /* Table */
    .data-table-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
      overflow: hidden;
    }
    .data-table-responsive {
      overflow-x: auto;
      margin: 0;
    }
    .admin-dispute-table {
      width: 100%;
      min-width: 1300px;
      margin-bottom: 0;
      border-collapse: collapse;
    }
    .admin-dispute-table thead th {
      background: #1e3a8a;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      padding: 10px 8px;
      white-space: nowrap;
      border: 1px solid #2e4d9e;
      vertical-align: middle;
      text-align: center;
    }
    .admin-dispute-table tbody td {
      padding: 8px 8px;
      font-size: 12px;
      vertical-align: middle;
      border: 1px solid #edf2f7;
    }
    .admin-dispute-table tbody tr:hover {
      background-color: #f8fafc;
    }
    .dispute-empty-state {
      padding: 50px 20px;
      text-align: center;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      
      <!-- Admin Top Navigation -->
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
                    <li><a href="/admin/disputes" class="font-weight-bold text-danger">Disputes &amp; Complaints</a></li>
                  </ul>
                </li>
                <li><a href="/admin/seller-api/requests">Request API Approval</a></li>
                <li><a href="/admin/disputes" class="active font-weight-bold"><i class="fa fa-shield"></i> Disputes</a></li>
                <li><a href="#" class="sub-icon">Settings <i class="fa fa-angle-down"></i></a>
                  <ul class="sub-menu">
                    <li><a href="/admin/settings/create-operator">Create Operator</a></li>
                    <li><a href="/admin/settings/show-operator">Show Operator</a></li>
                    <li><a href="/admin/settings/service-settings">Service Settings</a></li>
                    <li><a href="/admin/settings/plan-api">Plan API &amp; Lookup</a></li>
                  </ul>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </div>

      <main class="main-content">
        <div class="container-fluid px-2">
          <div class="admin-page-container">
            
            <div class="admin-titlebar">
              <div>
                <h3><i class="fa fa-shield mr-1"></i> Transaction Disputes &amp; Complaints</h3>
                <p class="text-muted small mb-0">Review all recharge dispute requests submitted by users and buyers.</p>
              </div>
            </div>

            <div id="adminActionAlert" class="alert alert-success" style="display:none;"></div>

            <!-- Top Filter Bar -->
            <div class="filter-card">
              <form method="get" action="/admin/disputes" class="filter-form">
                
                <div class="filter-group">
                  <label for="filterLimit">Top</label>
                  <select name="limit" id="filterLimit" class="filter-select" style="width: 70px;">
                    <option value="20"${selected(filters.limit, '20')}>20</option>
                    <option value="50"${selected(filters.limit, '50')}>50</option>
                    <option value="100"${selected(filters.limit, '100')}>100</option>
                    <option value="200"${selected(filters.limit, '200')}>200</option>
                    <option value="all"${selected(filters.limit, 'all')}>All</option>
                  </select>
                </div>

                <div class="filter-group">
                  <label for="filterFromDate">From</label>
                  <input type="date" name="fromDate" id="filterFromDate" class="filter-input" value="${escapeHtml(filters.fromDate)}">
                </div>

                <div class="filter-group">
                  <label for="filterToDate">To</label>
                  <input type="date" name="toDate" id="filterToDate" class="filter-input" value="${escapeHtml(filters.toDate)}">
                </div>

                <div class="filter-group">
                  <label for="filterStatus">Status</label>
                  <select name="status" id="filterStatus" class="filter-select">
                    <option value="">:: ALL ::</option>
                    <option value="pending"${selected(filters.status, 'pending')}>Pending Review</option>
                    <option value="accepted"${selected(filters.status, 'accepted')}>Accepted (Refunded)</option>
                    <option value="rejected"${selected(filters.status, 'rejected')}>Rejected</option>
                  </select>
                </div>

                <div class="filter-group">
                  <label for="filterOperator">Operator</label>
                  <select name="operatorId" id="filterOperator" class="filter-select" style="max-width: 130px;">
                    <option value="">:: ALL ::</option>
                    ${operatorOptions}
                  </select>
                </div>

                <div class="filter-group">
                  <label for="filterSearch">Search</label>
                  <input type="text" name="search" id="filterSearch" class="filter-input" placeholder="Txn ID, Mobile, Buyer, Seller" value="${escapeHtml(filters.search)}" style="min-width: 150px;">
                </div>

                <button type="submit" class="btn-filter-search">
                  <i class="fa fa-search"></i> Search
                </button>

                <a href="/admin/disputes" class="btn-filter-reset" title="Clear Filters">
                  <i class="fa fa-refresh"></i> Reset
                </a>
              </form>
            </div>

            <!-- KPI Cards -->
            <div class="kpi-row">
              <div class="kpi-card">
                <div class="kpi-label">Total Disputes</div>
                <div class="kpi-number">${result.rowCount}</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Pending Review</div>
                <div class="kpi-number text-warning">${pendingCount}</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Accepted &amp; Refunded</div>
                <div class="kpi-number text-success">${acceptedCount}</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Rejected</div>
                <div class="kpi-number text-danger">${rejectedCount}</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Total Disputed Value</div>
                <div class="kpi-number text-primary">₹${formatMinorUnits(totalDisputedAmountMinor.toString())}</div>
              </div>
            </div>

            <!-- Table Card -->
            <div class="data-table-card">
              <div class="data-table-responsive">
                <table class="admin-dispute-table table-bordered">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Dispute Date</th>
                      <th>Txn ID &amp; Ref</th>
                      <th>Buyer</th>
                      <th>Seller / API</th>
                      <th>Number</th>
                      <th>Operator &amp; Circle</th>
                      <th>Amount &amp; Cost</th>
                      <th>Dispute Reason</th>
                      <th>Dispute Status</th>
                      <th>Order Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml.length > 0 ? rowsHtml : `
                      <tr>
                        <td colspan="12" class="dispute-empty-state">
                          <i class="fa fa-shield text-muted" style="font-size:36px;"></i>
                          <p class="mt-2 font-weight-bold mb-1">No dispute complaints found matching criteria.</p>
                          <span class="small text-muted">When users raise disputes from their purchase transaction report, they will appear here.</span>
                        </td>
                      </tr>
                    `}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  </div>

  <!-- Admin Resolution Modal -->
  <div class="modal fade" id="adminModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header bg-primary text-white py-2">
          <h5 class="modal-title font-weight-bold text-white" id="adminModalTitle">Resolve Dispute</h5>
          <button type="button" class="close text-white" data-dismiss="modal"><span>&times;</span></button>
        </div>
        <form id="adminResolutionForm">
          <input type="hidden" id="adminOrderId">
          <input type="hidden" id="adminActionType">
          <div class="modal-body">
            <div id="adminModalPrompt" class="alert alert-info"></div>
            <div class="form-group mb-0">
              <label class="font-weight-bold">Admin Resolution Note *</label>
              <textarea id="adminNote" class="form-control" rows="3" placeholder="Enter resolution explanation..." required></textarea>
            </div>
            <div id="adminModalError" class="alert alert-danger mt-2" style="display:none;"></div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary font-weight-bold" id="btnAdminSubmit">
              Confirm Action
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
  (()=>{
    const topAlert = document.getElementById('adminActionAlert');
    const adminModal = $('#adminModal');
    const adminForm = document.getElementById('adminResolutionForm');
    const modalError = document.getElementById('adminModalError');
    const btnSubmit = document.getElementById('btnAdminSubmit');

    document.querySelectorAll('.btn-admin-accept').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('adminOrderId').value = btn.dataset.id;
        document.getElementById('adminActionType').value = 'accept';
        document.getElementById('adminModalTitle').textContent = 'Accept Dispute & Refund Buyer';
        document.getElementById('adminModalPrompt').innerHTML = '<strong>Accepting Dispute:</strong> This will issue a full wallet refund of ' + escapeHtml(btn.dataset.amount) + ' to Buyer (' + escapeHtml(btn.dataset.buyer) + ') and mark the transaction as Refunded.';
        document.getElementById('adminModalPrompt').className = 'alert alert-success';
        btnSubmit.className = 'btn btn-success font-weight-bold';
        btnSubmit.textContent = 'Confirm Accept & Refund';
        modalError.style.display = 'none';
        adminModal.modal('show');
      });
    });

    document.querySelectorAll('.btn-admin-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('adminOrderId').value = btn.dataset.id;
        document.getElementById('adminActionType').value = 'reject';
        document.getElementById('adminModalTitle').textContent = 'Reject Dispute';
        document.getElementById('adminModalPrompt').innerHTML = '<strong>Rejecting Dispute:</strong> No refund will be given. Please state the reason for rejection (e.g. operator confirmation).';
        document.getElementById('adminModalPrompt').className = 'alert alert-danger';
        btnSubmit.className = 'btn btn-danger font-weight-bold';
        btnSubmit.textContent = 'Confirm Reject';
        modalError.style.display = 'none';
        adminModal.modal('show');
      });
    });

    if (adminForm) {
      adminForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        modalError.style.display = 'none';
        btnSubmit.disabled = true;

        const orderId = document.getElementById('adminOrderId').value;
        const action = document.getElementById('adminActionType').value;
        const note = document.getElementById('adminNote').value.trim();

        const endpoint = action === 'accept' ? '/api/admin/disputes/accept' : '/api/admin/disputes/reject';

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ orderId, note }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to update dispute.');

          adminModal.modal('hide');
          topAlert.textContent = '✓ Dispute successfully updated!';
          topAlert.style.display = 'block';
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          modalError.textContent = err.message;
          modalError.style.display = 'block';
        } finally {
          btnSubmit.disabled = false;
        }
      });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/disputes' }));
  }

  return { sendAdminDisputesPage };
};
