'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = function createUserSellerSalesDisputePage({ db, formatMinorUnits, decryptMobile }) {
  
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

  async function sendUserSellerSalesDisputePage(user, response, searchParams) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');
    const today = getTodayString();

    const filters = {
      limit: String(searchParams.get('limit') || '20').trim(),
      fromDate: String(searchParams.get('fromDate') || '').trim(),
      toDate: String(searchParams.get('toDate') || '').trim(),
      status: String(searchParams.get('status') || '').trim().toLowerCase(),
      operatorId: String(searchParams.get('operatorId') || '').trim(),
      number: String(searchParams.get('number') || '').trim().replace(/\D/g, ''),
    };

    const operators = await db.query(
      "SELECT id, operator_name, service_type, operator_code FROM operator_definitions WHERE status='active' AND deleted_at IS NULL ORDER BY operator_name",
    );

    // Filter by seller user ID and where dispute is raised
    const conditions = ['r.seller_user_id = $1', "r.dispute_status IN ('pending', 'accepted', 'rejected')"];
    const values = [user.id];
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
    if (filters.number) {
      conditions.push(`(r.mobile_number LIKE ${add(`%${filters.number}%`)} OR r.idempotency_key LIKE ${add(`%${filters.number}%`)})`);
    }

    let limitClause = 'LIMIT 20';
    if (filters.limit === '50') limitClause = 'LIMIT 50';
    else if (filters.limit === '100') limitClause = 'LIMIT 100';
    else if (filters.limit === 'all') limitClause = 'LIMIT 1000';

    const query = `
      SELECT r.id, r.user_id AS buyer_user_id, r.seller_user_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.circle_name, r.amount_minor, r.margin_minor, r.cost_minor,
             r.status, r.idempotency_key, r.provider_reference, r.with_gst,
             r.dispute_status, r.dispute_reason, r.dispute_resolution_note,
             r.dispute_created_at, r.dispute_resolved_at, r.created_at,
             u.username AS buyer_username, u.name AS buyer_name
      FROM recharge_orders r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY r.dispute_created_at DESC NULLS LAST, r.created_at DESC
      ${limitClause}
    `;

    const result = await db.query(query, values);

    // KPI counts
    let pendingCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;
    let totalDisputeAmountMinor = 0n;

    const rowsHtml = result.rows.map((row, index) => {
      totalDisputeAmountMinor += BigInt(row.amount_minor || '0');
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

      let statusBadge = '';
      if (dStatus === 'pending') {
        statusBadge = '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;font-size:11px;"><i class="fa fa-clock-o"></i> Pending Review</span>';
      } else if (dStatus === 'accepted') {
        statusBadge = '<span class="badge badge-success" style="background:#10b981;font-size:11px;"><i class="fa fa-check-circle"></i> Accepted (Refunded)</span>';
      } else if (dStatus === 'rejected') {
        statusBadge = '<span class="badge badge-danger" style="background:#ef4444;font-size:11px;"><i class="fa fa-times-circle"></i> Rejected</span>';
      }

      const formattedAmount = `₹${formatMinorUnits(row.amount_minor)}`;
      const shortTxnId = String(row.id).slice(0, 13) + '...';

      let actionCell = '';
      if (dStatus === 'pending') {
        actionCell = `
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-sm btn-success btn-accept-dispute"
              data-id="${escapeHtml(row.id)}"
              data-buyer="${escapeHtml(row.buyer_username || 'Buyer')}"
              data-mobile="${escapeHtml(mobile)}"
              data-amount="${escapeHtml(formattedAmount)}">
              <i class="fa fa-check"></i> Accept &amp; Refund
            </button>
            <button type="button" class="btn btn-sm btn-danger btn-reject-dispute ml-1"
              data-id="${escapeHtml(row.id)}"
              data-buyer="${escapeHtml(row.buyer_username || 'Buyer')}"
              data-mobile="${escapeHtml(mobile)}"
              data-amount="${escapeHtml(formattedAmount)}">
              <i class="fa fa-times"></i> Reject
            </button>
          </div>
        `;
      } else {
        actionCell = `
          <div class="small text-muted">
            <em>${dStatus === 'accepted' ? 'Refund Processed' : 'Rejected'}</em>
            ${row.dispute_resolution_note ? `<div class="small text-dark mt-1" style="max-width:200px;">Note: ${escapeHtml(row.dispute_resolution_note)}</div>` : ''}
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
            <strong class="text-dark">${escapeHtml(row.buyer_name || row.buyer_username || 'Buyer')}</strong>
            <div class="small text-muted font-monospace">${escapeHtml(row.buyer_username || '')}</div>
          </td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(mobile)}</td>
          <td>
            <span class="font-weight-bold text-dark">${escapeHtml(row.operator_name || 'Operator')}</span>
            <div class="small text-muted">${escapeHtml(row.circle_name || 'All Circle')}</div>
          </td>
          <td class="text-right font-weight-bold text-dark font-monospace">${formattedAmount}</td>
          <td class="small text-dark" style="max-width: 250px;">
            <div class="p-1 bg-light border rounded">${escapeHtml(row.dispute_reason || 'No reason specified')}</div>
          </td>
          <td class="text-center">${statusBadge}</td>
          <td class="text-center" style="white-space: nowrap;">${actionCell}</td>
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
  <title>Seller Sales Dispute - Exchange</title>
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
    .dispute-page-container {
      padding: 12px 18px 40px;
    }
    .dispute-header-card {
      background: #1b3576;
      border-radius: 4px;
      padding: 10px 16px;
      margin-bottom: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.12);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .dispute-header-title {
      color: #ffffff;
      font-size: 16px;
      font-weight: 700;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dispute-filter-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
    .dispute-filter-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .dispute-filter-group label {
      color: #d1dcf5;
      font-size: 11px;
      font-weight: 600;
      margin: 0;
      white-space: nowrap;
    }
    .dispute-filter-select, .dispute-filter-input {
      height: 31px;
      padding: 2px 6px;
      font-size: 12px;
      border-radius: 3px;
      border: 1px solid #ced4da;
      background-color: #ffffff;
      color: #333333;
    }
    .dispute-btn-search {
      height: 31px;
      padding: 0 14px;
      font-size: 12px;
      font-weight: 600;
      background-color: #0d6efd;
      border: 1px solid #0b5ed7;
      color: #ffffff;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
    }
    .dispute-btn-refresh {
      height: 31px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 600;
      background-color: #10b981;
      border: 1px solid #059669;
      color: #ffffff;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      text-decoration: none;
    }

    .dispute-summary-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
    }
    .dispute-kpi-card {
      flex: 1;
      min-width: 140px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 8px 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .dispute-kpi-title {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .dispute-kpi-val {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
    }

    .dispute-table-card {
      background: #ffffff;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      overflow: hidden;
    }
    .dispute-table-responsive {
      overflow-x: auto;
      margin: 0;
    }
    .dispute-table {
      width: 100%;
      min-width: 1200px;
      margin-bottom: 0;
      border-collapse: collapse;
    }
    .dispute-table thead th {
      background: #25396e;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      padding: 9px 8px;
      white-space: nowrap;
      border: 1px solid #364d88;
      vertical-align: middle;
      text-align: center;
    }
    .dispute-table tbody td {
      padding: 8px 8px;
      font-size: 12px;
      vertical-align: middle;
      border: 1px solid #edf2f7;
    }
    .dispute-table tbody tr:hover {
      background-color: #f8fafc;
    }
    .dispute-empty {
      padding: 40px 20px;
      text-align: center;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <main class="main-content">
        <div class="dispute-page-container">
          
          <div id="sellerActionAlert" class="alert alert-success" style="display:none;"></div>

          <!-- Top Blue Filter Card -->
          <div class="dispute-header-card">
            <h4 class="dispute-header-title">
              <i class="fa fa-shield"></i> Seller Sales Dispute Management
            </h4>
            <form method="get" action="/seller/sales-dispute" class="dispute-filter-form">
              
              <div class="dispute-filter-group">
                <label for="filterLimit">Top</label>
                <select name="limit" id="filterLimit" class="dispute-filter-select" style="min-width: 65px;">
                  <option value="20"${selected(filters.limit, '20')}>20</option>
                  <option value="50"${selected(filters.limit, '50')}>50</option>
                  <option value="100"${selected(filters.limit, '100')}>100</option>
                  <option value="all"${selected(filters.limit, 'all')}>All</option>
                </select>
              </div>

              <div class="dispute-filter-group">
                <label for="filterFromDate">From</label>
                <input type="date" name="fromDate" id="filterFromDate" class="dispute-filter-input" value="${escapeHtml(filters.fromDate)}">
              </div>

              <div class="dispute-filter-group">
                <label for="filterToDate">To</label>
                <input type="date" name="toDate" id="filterToDate" class="dispute-filter-input" value="${escapeHtml(filters.toDate)}">
              </div>

              <div class="dispute-filter-group">
                <label for="filterStatus">Status</label>
                <select name="status" id="filterStatus" class="dispute-filter-select">
                  <option value="">:: ALL ::</option>
                  <option value="pending"${selected(filters.status, 'pending')}>Pending Review</option>
                  <option value="accepted"${selected(filters.status, 'accepted')}>Accepted (Refunded)</option>
                  <option value="rejected"${selected(filters.status, 'rejected')}>Rejected</option>
                </select>
              </div>

              <div class="dispute-filter-group">
                <label for="filterOperator">Operator</label>
                <select name="operatorId" id="filterOperator" class="dispute-filter-select" style="max-width: 120px;">
                  <option value="">:: ALL ::</option>
                  ${operatorOptions}
                </select>
              </div>

              <div class="dispute-filter-group">
                <label for="filterNumber">Number</label>
                <input type="text" name="number" id="filterNumber" class="dispute-filter-input" placeholder="Mobile / Txn" value="${escapeHtml(filters.number)}" style="max-width: 100px;">
              </div>

              <button type="submit" class="dispute-btn-search">
                <i class="fa fa-search"></i> Search
              </button>

              <a href="/seller/sales-dispute" class="dispute-btn-refresh" title="Reset Filters">
                <i class="fa fa-refresh"></i> Refresh
              </a>
            </form>
          </div>

          <!-- KPI Cards -->
          <div class="dispute-summary-bar">
            <div class="dispute-kpi-card">
              <div class="dispute-kpi-title">Total Disputes</div>
              <div class="dispute-kpi-val">${result.rowCount}</div>
            </div>
            <div class="dispute-kpi-card">
              <div class="dispute-kpi-title">Pending Disputes</div>
              <div class="dispute-kpi-val text-warning">${pendingCount}</div>
            </div>
            <div class="dispute-kpi-card">
              <div class="dispute-kpi-title">Accepted &amp; Refunded</div>
              <div class="dispute-kpi-val text-success">${acceptedCount}</div>
            </div>
            <div class="dispute-kpi-card">
              <div class="dispute-kpi-title">Rejected Disputes</div>
              <div class="dispute-kpi-val text-danger">${rejectedCount}</div>
            </div>
          </div>

          <!-- Disputes Table -->
          <div class="dispute-table-card">
            <div class="dispute-table-responsive">
              <table class="dispute-table table-bordered">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Dispute Date</th>
                    <th>Txn ID &amp; Ref</th>
                    <th>Buyer</th>
                    <th>Mobile</th>
                    <th>Operator &amp; Circle</th>
                    <th>Amount</th>
                    <th>Dispute Reason</th>
                    <th>Dispute Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml.length > 0 ? rowsHtml : `
                    <tr>
                      <td colspan="10" class="dispute-empty">
                        <i class="fa fa-shield text-muted" style="font-size:32px;"></i>
                        <p class="mt-2 font-weight-bold mb-1">No sales disputes found matching your criteria.</p>
                        <span class="small text-muted">Any disputes raised by buyers for your processed sales will appear here.</span>
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  </div>

  <!-- Accept & Refund Modal -->
  <div class="modal fade" id="acceptModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header bg-success text-white py-2">
          <h5 class="modal-title font-weight-bold text-white"><i class="fa fa-check-circle mr-1"></i> Accept Dispute &amp; Issue Full Refund</h5>
          <button type="button" class="close text-white" data-dismiss="modal"><span>&times;</span></button>
        </div>
        <form id="acceptForm">
          <input type="hidden" id="acceptOrderId">
          <div class="modal-body">
            <div class="alert alert-info">
              <strong><i class="fa fa-info-circle"></i> Refund Confirmation:</strong>
              <p class="mb-0 mt-1">Accepting this dispute will immediately mark the transaction as <strong>Refunded</strong> and refund <strong id="acceptModalAmount"></strong> to the Buyer (<strong id="acceptModalBuyer"></strong>).</p>
            </div>
            <div class="form-group mb-0">
              <label class="font-weight-bold">Acceptance / Resolution Note (Optional)</label>
              <textarea id="acceptNote" class="form-control" rows="2" placeholder="e.g. Verified failed recharge with operator. Refund approved."></textarea>
            </div>
            <div id="acceptModalError" class="alert alert-danger mt-2" style="display:none;"></div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-success font-weight-bold" id="btnConfirmAccept">
              <i class="fa fa-check mr-1"></i> Confirm Accept &amp; Refund
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- Reject Dispute Modal -->
  <div class="modal fade" id="rejectModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header bg-danger text-white py-2">
          <h5 class="modal-title font-weight-bold text-white"><i class="fa fa-times-circle mr-1"></i> Reject Dispute</h5>
          <button type="button" class="close text-white" data-dismiss="modal"><span>&times;</span></button>
        </div>
        <form id="rejectForm">
          <input type="hidden" id="rejectOrderId">
          <div class="modal-body">
            <div class="alert alert-warning">
              <strong><i class="fa fa-exclamation-triangle"></i> Rejecting Dispute:</strong>
              <p class="mb-0 mt-1">No refund will be issued. Please provide a clear reason or operator transaction proof for the buyer and admin.</p>
            </div>
            <div class="form-group mb-0">
              <label class="font-weight-bold">Rejection Reason / Proof *</label>
              <textarea id="rejectReason" class="form-control" rows="3" placeholder="e.g. Operator response confirms balance and validity credited to customer." required></textarea>
            </div>
            <div id="rejectModalError" class="alert alert-danger mt-2" style="display:none;"></div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-danger font-weight-bold" id="btnConfirmReject">
              <i class="fa fa-times mr-1"></i> Confirm Reject
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
    const topAlert = document.getElementById('sellerActionAlert');

    // Handle Accept Click
    document.querySelectorAll('.btn-accept-dispute').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('acceptOrderId').value = btn.dataset.id;
        document.getElementById('acceptModalAmount').textContent = btn.dataset.amount;
        document.getElementById('acceptModalBuyer').textContent = btn.dataset.buyer;
        document.getElementById('acceptModalError').style.display = 'none';
        $('#acceptModal').modal('show');
      });
    });

    // Handle Accept Submit
    const acceptForm = document.getElementById('acceptForm');
    const btnConfirmAccept = document.getElementById('btnConfirmAccept');
    if (acceptForm) {
      acceptForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        btnConfirmAccept.disabled = true;
        btnConfirmAccept.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Processing Refund...';
        const orderId = document.getElementById('acceptOrderId').value;
        const note = document.getElementById('acceptNote').value.trim();

        try {
          const res = await fetch('/api/seller/disputes/accept', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ orderId, note }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to accept dispute.');

          $('#acceptModal').modal('hide');
          topAlert.textContent = '✓ Dispute accepted and refund successfully credited to Buyer!';
          topAlert.className = 'alert alert-success';
          topAlert.style.display = 'block';
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          document.getElementById('acceptModalError').textContent = err.message;
          document.getElementById('acceptModalError').style.display = 'block';
        } finally {
          btnConfirmAccept.disabled = false;
          btnConfirmAccept.innerHTML = '<i class="fa fa-check mr-1"></i> Confirm Accept &amp; Refund';
        }
      });
    }

    // Handle Reject Click
    document.querySelectorAll('.btn-reject-dispute').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('rejectOrderId').value = btn.dataset.id;
        document.getElementById('rejectModalError').style.display = 'none';
        $('#rejectModal').modal('show');
      });
    });

    // Handle Reject Submit
    const rejectForm = document.getElementById('rejectForm');
    const btnConfirmReject = document.getElementById('btnConfirmReject');
    if (rejectForm) {
      rejectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reason = document.getElementById('rejectReason').value.trim();
        if (!reason) {
          alert('Please enter reason for rejection.');
          return;
        }

        btnConfirmReject.disabled = true;
        btnConfirmReject.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Rejecting...';
        const orderId = document.getElementById('rejectOrderId').value;

        try {
          const res = await fetch('/api/seller/disputes/reject', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ orderId, reason }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to reject dispute.');

          $('#rejectModal').modal('hide');
          topAlert.textContent = '✓ Dispute rejected.';
          topAlert.className = 'alert alert-info';
          topAlert.style.display = 'block';
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          document.getElementById('rejectModalError').textContent = err.message;
          document.getElementById('rejectModalError').style.display = 'block';
        } finally {
          btnConfirmReject.disabled = false;
          btnConfirmReject.innerHTML = '<i class="fa fa-times mr-1"></i> Confirm Reject';
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

  return { sendUserSellerSalesDisputePage };
};
