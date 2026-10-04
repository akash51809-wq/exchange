'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

const CIRCLES = [
  'All', 'Andhra Pradesh', 'Assam', 'Bihar & Jharkhand', 'Chennai', 'Delhi', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jammu Kashmir', 'Karnataka', 'Kerala', 'Kolkata',
  'Maharashtra & Goa', 'Mumbai', 'North East', 'Orissa', 'Punjab', 'Rajasthan',
  'Tamil Nadu', 'UP East', 'UP West', 'West Bengal',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = function createUserBuyerPurchaseTxnPage({ db, formatMinorUnits, decryptMobile }) {
  
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

  async function sendUserBuyerPurchaseTxnPage(user, response, searchParams) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');
    const today = getTodayString();

    const filters = {
      limit: String(searchParams.get('limit') || '20').trim(),
      fromDate: String(searchParams.get('fromDate') || today).trim(),
      toDate: String(searchParams.get('toDate') || today).trim(),
      status: String(searchParams.get('status') || '').trim().toLowerCase(),
      operatorId: String(searchParams.get('operatorId') || '').trim(),
      circle: String(searchParams.get('circle') || '').trim(),
      number: String(searchParams.get('number') || '').trim().replace(/\D/g, ''),
    };

    const operators = await db.query(
      "SELECT id, operator_name, service_type, operator_code FROM operator_definitions WHERE status='active' AND deleted_at IS NULL ORDER BY operator_name",
    );

    // Build query conditions for buyer's purchase transactions
    const conditions = ['r.user_id = $1'];
    const values = [user.id];
    const add = (value) => { values.push(value); return `$${values.length}`; };

    if (filters.fromDate) {
      conditions.push(`r.created_at >= ${add(`${filters.fromDate} 00:00:00+05:30`)}`);
    }
    if (filters.toDate) {
      conditions.push(`r.created_at <= ${add(`${filters.toDate} 23:59:59.999+05:30`)}`);
    }
    if (filters.status && ['successful', 'pending', 'failed', 'refunded'].includes(filters.status)) {
      conditions.push(`r.status = ${add(filters.status)}`);
    }
    if (filters.operatorId && UUID.test(filters.operatorId)) {
      conditions.push(`r.operator_id = ${add(filters.operatorId)}`);
    }
    if (filters.circle && filters.circle !== 'All' && CIRCLES.includes(filters.circle)) {
      conditions.push(`r.circle_name = ${add(filters.circle)}`);
    }
    if (filters.number) {
      conditions.push(`(r.mobile_number LIKE ${add(`%${filters.number}%`)} OR r.idempotency_key LIKE ${add(`%${filters.number}%`)} OR r.provider_reference LIKE ${add(`%${filters.number}%`)})`);
    }

    let limitClause = 'LIMIT 20';
    if (filters.limit === '50') limitClause = 'LIMIT 50';
    else if (filters.limit === '100') limitClause = 'LIMIT 100';
    else if (filters.limit === '200') limitClause = 'LIMIT 200';
    else if (filters.limit === 'all') limitClause = 'LIMIT 1000';

    const query = `
      SELECT r.id, r.user_id, r.seller_user_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.circle_name, r.amount_minor, r.margin_minor, r.cost_minor,
             r.status, r.idempotency_key, r.provider_reference, r.with_gst,
             r.dispute_status, r.dispute_reason, r.dispute_resolution_note, r.dispute_created_at,
             r.created_at, o.operator_code
      FROM recharge_orders r
      LEFT JOIN operator_definitions o ON o.id = r.operator_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY r.created_at DESC
      ${limitClause}
    `;

    const result = await db.query(query, values);

    // Calculate totals for the filtered results
    let totalAmountMinor = 0n;
    let totalMarginMinor = 0n;
    let successCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    const rowsHtml = result.rows.map((row, index) => {
      totalAmountMinor += BigInt(row.amount_minor || '0');
      totalMarginMinor += BigInt(row.margin_minor || '0');
      if (row.status === 'successful') successCount++;
      else if (row.status === 'pending' || row.status === 'processing') pendingCount++;
      else if (row.status === 'failed') failedCount++;

      let mobile = row.mobile_number || '';
      if (!mobile && row.mobile_ciphertext && decryptMobile) {
        try {
          mobile = decryptMobile(row.mobile_ciphertext);
        } catch {
          mobile = '••••••••••';
        }
      }

      let statusBadge = '<span class="badge badge-secondary">Unknown</span>';
      if (row.status === 'successful') {
        statusBadge = '<span class="badge badge-success" style="background:#22c55e;font-size:11px;"><i class="fa fa-check-circle"></i> Success</span>';
      } else if (row.status === 'pending' || row.status === 'processing') {
        statusBadge = '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;font-size:11px;"><i class="fa fa-clock-o"></i> Pending</span>';
      } else if (row.status === 'failed') {
        statusBadge = '<span class="badge badge-danger" style="background:#ef4444;font-size:11px;"><i class="fa fa-times-circle"></i> Failed</span>';
      } else if (row.status === 'refunded') {
        statusBadge = '<span class="badge badge-info" style="background:#0ea5e9;font-size:11px;"><i class="fa fa-undo"></i> Refunded</span>';
      }

      const formattedAmount = `₹${formatMinorUnits(row.amount_minor)}`;
      const formattedMargin = `₹${formatMinorUnits(row.margin_minor || '0')}`;
      const shortTxnId = String(row.id).slice(0, 13) + '...';

      // Dispute Action or Status Badge
      let disputeCell = '';
      const dStatus = (row.dispute_status || 'none').toLowerCase();
      if (dStatus === 'pending') {
        disputeCell = `<span class="badge badge-warning" style="background:#f59e0b;color:#fff;font-size:11px;" title="Dispute Reason: ${escapeHtml(row.dispute_reason || '')}"><i class="fa fa-clock-o"></i> Dispute: Pending</span>`;
      } else if (dStatus === 'accepted') {
        disputeCell = `<span class="badge badge-success" style="background:#10b981;font-size:11px;" title="Refunded"><i class="fa fa-check-circle"></i> Dispute: Accepted</span>`;
      } else if (dStatus === 'rejected') {
        disputeCell = `<span class="badge badge-danger" style="background:#ef4444;font-size:11px;" title="Note: ${escapeHtml(row.dispute_resolution_note || 'Rejected by seller')}"><i class="fa fa-times-circle"></i> Dispute: Rejected</span>`;
      } else {
        // Can dispute if not refunded and not already disputed
        disputeCell = `
          <button type="button" class="btn btn-xs btn-outline-danger btn-raise-dispute"
            data-id="${escapeHtml(row.id)}"
            data-ref="${escapeHtml(row.idempotency_key || row.id)}"
            data-mobile="${escapeHtml(mobile)}"
            data-operator="${escapeHtml(row.operator_name || row.operator_code || '')}"
            data-amount="${escapeHtml(formattedAmount)}">
            <i class="fa fa-exclamation-triangle"></i> Dispute
          </button>
        `;
      }

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${index + 1}</td>
          <td class="font-monospace font-weight-bold text-primary" title="${escapeHtml(row.id)}">${escapeHtml(shortTxnId)}</td>
          <td><strong class="text-dark">${escapeHtml(row.operator_name || row.operator_code || 'Operator')}</strong></td>
          <td><span class="badge badge-light border text-dark">${escapeHtml(row.circle_name || 'All')}</span></td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(mobile)}</td>
          <td class="text-center"><span class="badge ${row.with_gst ? 'badge-primary' : 'badge-secondary'}">${row.with_gst ? 'With GST' : 'No GST'}</span></td>
          <td class="small text-muted font-monospace" style="white-space:nowrap;">${escapeHtml(formatDateTime(row.created_at))}</td>
          <td class="text-right font-weight-bold text-dark font-monospace">${formattedAmount}</td>
          <td class="text-right font-weight-bold text-success font-monospace">${formattedMargin}</td>
          <td class="text-center">${statusBadge}</td>
          <td class="small font-monospace text-muted" title="${escapeHtml(row.provider_reference || '')}">${escapeHtml(row.provider_reference ? (row.provider_reference.length > 15 ? row.provider_reference.slice(0, 15) + '...' : row.provider_reference) : '-')}</td>
          <td class="small font-monospace text-muted" title="${escapeHtml(row.idempotency_key || '')}">${escapeHtml(row.idempotency_key ? (row.idempotency_key.length > 15 ? row.idempotency_key.slice(0, 15) + '...' : row.idempotency_key) : '-')}</td>
          <td class="text-center" style="white-space:nowrap;">${disputeCell}</td>
        </tr>
      `;
    }).join('');

    const selected = (actual, expected) => (actual === expected ? ' selected' : '');
    const operatorOptions = operators.rows.map((op) => `<option value="${op.id}"${selected(filters.operatorId, op.id)}>${escapeHtml(op.operator_name)}</option>`).join('');
    const circleOptions = CIRCLES.map((circle) => `<option value="${escapeHtml(circle)}"${selected(filters.circle, circle)}>${escapeHtml(circle)}</option>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Buyer Purchase Txn - Exchange</title>
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
    .txn-page-container {
      padding: 12px 18px 40px;
    }
    .txn-header-card {
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
    .txn-header-title {
      color: #ffffff;
      font-size: 16px;
      font-weight: 700;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .txn-filter-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
    .txn-filter-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .txn-filter-group label {
      color: #d1dcf5;
      font-size: 11px;
      font-weight: 600;
      margin: 0;
      white-space: nowrap;
    }
    .txn-filter-select, .txn-filter-input {
      height: 31px;
      padding: 2px 6px;
      font-size: 12px;
      border-radius: 3px;
      border: 1px solid #ced4da;
      background-color: #ffffff;
      color: #333333;
    }
    .txn-btn-search {
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
    .txn-btn-search:hover {
      background-color: #0b5ed7;
      color: #ffffff;
    }
    .txn-btn-refresh {
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
    .txn-btn-refresh:hover {
      background-color: #059669;
      color: #ffffff;
      text-decoration: none;
    }

    /* Summary KPI Bar */
    .txn-summary-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
    }
    .txn-kpi-card {
      flex: 1;
      min-width: 140px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 8px 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .txn-kpi-title {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .txn-kpi-val {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
    }

    /* Table */
    .txn-table-card {
      background: #ffffff;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      overflow: hidden;
    }
    .txn-table-responsive {
      overflow-x: auto;
      margin: 0;
    }
    .txn-table {
      width: 100%;
      min-width: 1250px;
      margin-bottom: 0;
      border-collapse: collapse;
    }
    .txn-table thead th {
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
    .txn-table tbody td {
      padding: 7px 8px;
      font-size: 12px;
      vertical-align: middle;
      border: 1px solid #edf2f7;
    }
    .txn-table tbody tr:hover {
      background-color: #f8fafc;
    }
    .txn-empty {
      padding: 40px 20px;
      text-align: center;
      color: #64748b;
    }
    .btn-raise-dispute {
      font-size: 11px;
      padding: 2px 7px;
      font-weight: 600;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <main class="main-content">
        <div class="txn-page-container">
          
          <div id="disputeAlert" class="alert alert-success" style="display:none;"></div>

          <!-- Top Blue Filter Card -->
          <div class="txn-header-card">
            <h4 class="txn-header-title">
              <i class="fa fa-shopping-cart"></i> Buyer Purchase Transactions
            </h4>
            <form method="get" action="/buyer/purchase-txn" class="txn-filter-form">
              
              <div class="txn-filter-group">
                <label for="filterLimit">Top</label>
                <select name="limit" id="filterLimit" class="txn-filter-select" style="min-width: 65px;">
                  <option value="20"${selected(filters.limit, '20')}>20</option>
                  <option value="50"${selected(filters.limit, '50')}>50</option>
                  <option value="100"${selected(filters.limit, '100')}>100</option>
                  <option value="200"${selected(filters.limit, '200')}>200</option>
                  <option value="all"${selected(filters.limit, 'all')}>All</option>
                </select>
              </div>

              <div class="txn-filter-group">
                <label for="filterFromDate">From</label>
                <input type="date" name="fromDate" id="filterFromDate" class="txn-filter-input" value="${escapeHtml(filters.fromDate)}">
              </div>

              <div class="txn-filter-group">
                <label for="filterToDate">To</label>
                <input type="date" name="toDate" id="filterToDate" class="txn-filter-input" value="${escapeHtml(filters.toDate)}">
              </div>

              <div class="txn-filter-group">
                <label for="filterStatus">Status</label>
                <select name="status" id="filterStatus" class="txn-filter-select">
                  <option value="">:: ALL ::</option>
                  <option value="successful"${selected(filters.status, 'successful')}>Successful</option>
                  <option value="pending"${selected(filters.status, 'pending')}>Pending</option>
                  <option value="failed"${selected(filters.status, 'failed')}>Failed</option>
                  <option value="refunded"${selected(filters.status, 'refunded')}>Refunded</option>
                </select>
              </div>

              <div class="txn-filter-group">
                <label for="filterOperator">Operator</label>
                <select name="operatorId" id="filterOperator" class="txn-filter-select" style="max-width: 120px;">
                  <option value="">:: ALL ::</option>
                  ${operatorOptions}
                </select>
              </div>

              <div class="txn-filter-group">
                <label for="filterCircle">Circle</label>
                <select name="circle" id="filterCircle" class="txn-filter-select" style="max-width: 110px;">
                  <option value="">:: ALL ::</option>
                  ${circleOptions}
                </select>
              </div>

              <div class="txn-filter-group">
                <label for="filterNumber">Number</label>
                <input type="text" name="number" id="filterNumber" class="txn-filter-input" placeholder="Mobile / Txn" value="${escapeHtml(filters.number)}" style="max-width: 100px;">
              </div>

              <button type="submit" class="txn-btn-search">
                <i class="fa fa-search"></i> Search
              </button>

              <a href="/buyer/purchase-txn" class="txn-btn-refresh" title="Refresh & Reset to Today">
                <i class="fa fa-refresh"></i> Refresh
              </a>
            </form>
          </div>

          <!-- Summary KPI Cards -->
          <div class="txn-summary-bar">
            <div class="txn-kpi-card">
              <div class="txn-kpi-title">Total Purchases</div>
              <div class="txn-kpi-val">${result.rowCount}</div>
            </div>
            <div class="txn-kpi-card">
              <div class="txn-kpi-title">Total Purchase Amount</div>
              <div class="txn-kpi-val text-primary">₹${formatMinorUnits(totalAmountMinor.toString())}</div>
            </div>
            <div class="txn-kpi-card">
              <div class="txn-kpi-title">Total Margin Received</div>
              <div class="txn-kpi-val text-success">₹${formatMinorUnits(totalMarginMinor.toString())}</div>
            </div>
            <div class="txn-kpi-card">
              <div class="txn-kpi-title">Success / Pending / Failed</div>
              <div class="txn-kpi-val" style="font-size:14px;">
                <span class="text-success font-weight-bold">${successCount}</span> / 
                <span class="text-warning font-weight-bold">${pendingCount}</span> / 
                <span class="text-danger font-weight-bold">${failedCount}</span>
              </div>
            </div>
          </div>

          <!-- Transactions Table -->
          <div class="txn-table-card">
            <div class="txn-table-responsive">
              <table class="txn-table table-bordered">
                <thead>
                  <tr>
                    <th>Sl No</th>
                    <th>Txn ID</th>
                    <th>Ope Name</th>
                    <th>Circle</th>
                    <th>Number</th>
                    <th>GST Type</th>
                    <th>Date with Time</th>
                    <th>Amount</th>
                    <th>Margin</th>
                    <th>Status</th>
                    <th>Ope ID</th>
                    <th>Ref ID</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml.length > 0 ? rowsHtml : `
                    <tr>
                      <td colspan="13" class="txn-empty">
                        <i class="fa fa-inbox text-muted" style="font-size:32px;"></i>
                        <p class="mt-2 font-weight-bold mb-1">No purchase transactions found for the selected date range &amp; filters.</p>
                        <span class="small text-muted">Try changing the date or clearing filters.</span>
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

  <!-- Dispute Modal -->
  <div class="modal fade" id="disputeModal" tabindex="-1" role="dialog" aria-labelledby="disputeModalLabel" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header bg-danger text-white py-2">
          <h5 class="modal-title font-weight-bold text-white" id="disputeModalLabel"><i class="fa fa-exclamation-triangle mr-1"></i> Raise Transaction Dispute / Complaint</h5>
          <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <form id="disputeForm">
          <input type="hidden" id="disputeOrderId" name="orderId">
          <input type="hidden" id="disputeRefId" name="refId">
          <div class="modal-body">
            
            <div class="p-2 mb-3 bg-light border rounded">
              <div class="row small">
                <div class="col-6"><strong>Mobile:</strong> <span id="dispModalMobile" class="font-monospace text-dark"></span></div>
                <div class="col-6"><strong>Amount:</strong> <span id="dispModalAmount" class="font-monospace text-dark font-weight-bold"></span></div>
                <div class="col-6 mt-1"><strong>Operator:</strong> <span id="dispModalOperator" class="text-dark"></span></div>
                <div class="col-6 mt-1"><strong>Txn Ref:</strong> <span id="dispModalRef" class="font-monospace text-muted"></span></div>
              </div>
            </div>

            <div class="form-group">
              <label for="disputeReasonSelect" class="font-weight-bold">Dispute Reason *</label>
              <select id="disputeReasonSelect" class="form-control" required>
                <option value="Recharge not received on customer mobile number">Recharge not received on customer mobile number</option>
                <option value="Amount deducted but talktime/data not credited">Amount deducted but talktime/data not credited</option>
                <option value="Wrong plan/validity activated">Wrong plan/validity activated</option>
                <option value="Customer complaining about failed transaction">Customer complaining about failed transaction</option>
                <option value="other">Other (Specify below)</option>
              </select>
            </div>

            <div class="form-group" id="customReasonGroup" style="display:none;">
              <label for="disputeCustomReason" class="font-weight-bold">Custom Reason / Notes *</label>
              <textarea id="disputeCustomReason" class="form-control" rows="2" placeholder="Describe the dispute in detail..."></textarea>
            </div>

            <div class="small text-muted">
              <i class="fa fa-info-circle"></i> Once submitted, the seller and administrator will review the complaint. If accepted by seller, your wallet will be credited with a full refund.
            </div>

            <div id="modalDisputeError" class="alert alert-danger mt-2" style="display:none;"></div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-danger font-weight-bold" id="btnSubmitDispute">
              <i class="fa fa-send mr-1"></i> Submit Dispute
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
    const disputeReasonSelect = document.getElementById('disputeReasonSelect');
    const customReasonGroup = document.getElementById('customReasonGroup');
    const disputeForm = document.getElementById('disputeForm');
    const btnSubmit = document.getElementById('btnSubmitDispute');
    const modalError = document.getElementById('modalDisputeError');
    const topAlert = document.getElementById('disputeAlert');

    if (disputeReasonSelect) {
      disputeReasonSelect.addEventListener('change', () => {
        customReasonGroup.style.display = disputeReasonSelect.value === 'other' ? 'block' : 'none';
      });
    }

    document.querySelectorAll('.btn-raise-dispute').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('disputeOrderId').value = btn.dataset.id;
        document.getElementById('disputeRefId').value = btn.dataset.ref;
        document.getElementById('dispModalMobile').textContent = btn.dataset.mobile;
        document.getElementById('dispModalAmount').textContent = btn.dataset.amount;
        document.getElementById('dispModalOperator').textContent = btn.dataset.operator;
        document.getElementById('dispModalRef').textContent = btn.dataset.ref;
        modalError.style.display = 'none';
        $('#disputeModal').modal('show');
      });
    });

    if (disputeForm) {
      disputeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        modalError.style.display = 'none';

        let reason = disputeReasonSelect.value;
        if (reason === 'other') {
          reason = document.getElementById('disputeCustomReason').value.trim();
          if (!reason) {
            modalError.textContent = 'Please provide details for the dispute.';
            modalError.style.display = 'block';
            return;
          }
        }

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Submitting...';

        const orderId = document.getElementById('disputeOrderId').value;
        const refId = document.getElementById('disputeRefId').value;

        try {
          const res = await fetch('/api/buyer/disputes', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              orderId,
              refId,
              reason,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || data.message || 'Failed to raise dispute.');

          $('#disputeModal').modal('hide');
          topAlert.textContent = '✓ Dispute submitted successfully! Seller and Admin have been notified.';
          topAlert.style.display = 'block';
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        } catch (err) {
          modalError.textContent = err.message;
          modalError.style.display = 'block';
        } finally {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<i class="fa fa-send mr-1"></i> Submit Dispute';
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

  return { sendUserBuyerPurchaseTxnPage };
};
