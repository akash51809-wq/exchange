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

module.exports = function createUserSellerSalesTxnPage({ db, formatMinorUnits, decryptMobile }) {
  
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

  function formatDuration(createdIso, updatedIso, status) {
    if (status === 'pending' || status === 'processing') {
      return '<span class="text-warning"><i class="fa fa-hourglass-start mr-1"></i>Running...</span>';
    }
    if (!createdIso) return '-';
    const start = new Date(createdIso).getTime();
    const end = updatedIso ? new Date(updatedIso).getTime() : start;
    const diffMs = Math.max(0, end - start);
    if (diffMs < 1000) {
      return `${diffMs} ms`;
    }
    const totalSecs = diffMs / 1000;
    if (totalSecs < 60) {
      return `${totalSecs.toFixed(1)}s`;
    }
    const mins = Math.floor(totalSecs / 60);
    const remSecs = Math.round(totalSecs % 60);
    return `${mins}m ${remSecs}s`;
  }

  async function sendUserSellerSalesTxnPage(user, response, searchParams) {
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

    // Build query conditions for seller's processed sales transactions
    const conditions = ['r.seller_user_id = $1'];
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
      SELECT r.id, r.user_id AS buyer_user_id, r.seller_user_id, r.seller_api_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.circle_name, r.amount_minor, r.margin_minor, r.cost_minor, r.seller_margin_minor,
             r.status, r.idempotency_key, r.provider_reference, r.with_gst, r.created_at, r.updated_at,
             o.operator_code, u.username AS buyer_username, u.name AS buyer_name,
             sapi.name AS seller_api_name, sapi.short_name AS seller_api_short_name
      FROM recharge_orders r
      LEFT JOIN operator_definitions o ON o.id = r.operator_id
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN seller_api_settings sapi ON sapi.id = r.seller_api_id
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
      const rowSellerMargin = BigInt(row.seller_margin_minor || row.margin_minor || '0');
      totalAmountMinor += BigInt(row.amount_minor || '0');
      totalMarginMinor += rowSellerMargin;
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
      const formattedMargin = `₹${formatMinorUnits(rowSellerMargin.toString())}`;
      const apiDisplayName = row.seller_api_name || row.seller_api_short_name || 'Direct / Internal';
      const durationHtml = formatDuration(row.created_at, row.updated_at, row.status);

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${index + 1}</td>
          <td style="white-space:nowrap;font-size:11px;line-height:1.35;">
            <div class="font-monospace text-dark font-weight-bold" title="1. Request Time">
              <i class="fa fa-arrow-circle-up text-primary mr-1" style="font-size:11px;"></i>${escapeHtml(formatDateTime(row.created_at))}
            </div>
            <div class="font-monospace text-muted mt-1" title="2. Response Time">
              <i class="fa fa-arrow-circle-down text-success mr-1" style="font-size:11px;"></i>${row.status === 'pending' || row.status === 'processing' ? '<span class="text-warning font-weight-bold">Awaiting...</span>' : escapeHtml(formatDateTime(row.updated_at || row.created_at))}
            </div>
            <div class="mt-1 font-monospace" title="3. Total Used Time">
              <span class="badge badge-light border text-dark px-1 py-0 font-weight-bold" style="font-size:10px;">
                <i class="fa fa-clock-o text-info mr-1"></i>${durationHtml}
              </span>
            </div>
          </td>
          <td style="min-width:220px;">
            <div class="font-monospace font-weight-bold text-primary" style="font-size:11px;word-break:break-all;" title="${escapeHtml(row.id)}">
              ${escapeHtml(row.id)}
            </div>
            <div class="mt-1">
              <span class="badge badge-primary px-2 py-0" style="background:#1d4ed8;font-size:10px;font-weight:600;" title="Seller Processed API">
                <i class="fa fa-plug mr-1"></i>${escapeHtml(apiDisplayName)}
              </span>
            </div>
          </td>
          <td>
            <strong class="text-dark">${escapeHtml(row.operator_name || row.operator_code || 'Operator')}</strong>
          </td>
          <td><span class="badge badge-light border text-dark">${escapeHtml(row.circle_name || 'All')}</span></td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(mobile)}</td>
          <td class="text-center"><span class="badge ${row.with_gst ? 'badge-primary' : 'badge-secondary'}">${row.with_gst ? 'With GST' : 'No GST'}</span></td>
          <td class="text-right font-weight-bold text-dark font-monospace">${formattedAmount}</td>
          <td class="text-right font-weight-bold text-success font-monospace">${formattedMargin}</td>
          <td class="text-center">${statusBadge}</td>
          <td class="small font-monospace text-muted" title="${escapeHtml(row.provider_reference || '')}">${escapeHtml(row.provider_reference ? (row.provider_reference.length > 15 ? row.provider_reference.slice(0, 15) + '...' : row.provider_reference) : '-')}</td>
          <td class="small font-monospace text-muted" title="${escapeHtml(row.idempotency_key || '')}">${escapeHtml(row.idempotency_key ? (row.idempotency_key.length > 15 ? row.idempotency_key.slice(0, 15) + '...' : row.idempotency_key) : '-')}</td>
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
  <title>Seller Sales Txn - Exchange</title>
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
      padding: 6px 14px 24px;
    }
    .txn-header-card {
      background: #1b3576;
      border-radius: 4px;
      padding: 6px 12px;
      margin-bottom: 6px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.1);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .txn-header-title {
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .txn-filter-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin: 0;
    }
    .txn-filter-group {
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .txn-filter-group label {
      color: #d1dcf5;
      font-size: 11px;
      font-weight: 600;
      margin: 0;
      white-space: nowrap;
    }
    .txn-filter-select, .txn-filter-input {
      height: 27px;
      padding: 1px 6px;
      font-size: 11px;
      border-radius: 3px;
      border: 1px solid #ced4da;
      background-color: #ffffff;
      color: #333333;
    }
    .txn-btn-search {
      height: 27px;
      padding: 0 12px;
      font-size: 11px;
      font-weight: 600;
      background-color: #0d6efd;
      border: 1px solid #0b5ed7;
      color: #ffffff;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    }
    .txn-btn-search:hover {
      background-color: #0b5ed7;
      color: #ffffff;
    }
    .txn-btn-refresh {
      height: 27px;
      padding: 0 10px;
      font-size: 11px;
      font-weight: 600;
      background-color: #10b981;
      border: 1px solid #059669;
      color: #ffffff;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      text-decoration: none;
    }
    .txn-btn-refresh:hover {
      background-color: #059669;
      color: #ffffff;
      text-decoration: none;
    }

    /* Summary KPI Bar - Ultra Compact */
    .txn-summary-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 6px;
    }
    .txn-kpi-card {
      flex: 1;
      min-width: 130px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 4px 10px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .txn-kpi-title {
      font-size: 10px;
      color: #64748b;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 0;
      line-height: 1.2;
    }
    .txn-kpi-val {
      font-size: 14px;
      font-weight: 700;
      color: #1e293b;
      line-height: 1.2;
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
      min-width: 1200px;
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
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <main class="main-content">
        <div class="txn-page-container">
          
          <!-- Top Blue Filter Card -->
          <div class="txn-header-card">
            <h4 class="txn-header-title">
              <i class="fa fa-exchange"></i> Seller Sales Transactions
            </h4>
            <form method="get" action="/seller/sales-txn" class="txn-filter-form">
              
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

              <a href="/seller/sales-txn" class="txn-btn-refresh" title="Refresh & Reset to Today">
                <i class="fa fa-refresh"></i> Refresh
              </a>
            </form>
          </div>

          <!-- Summary KPI Cards -->
          <div class="txn-summary-bar">
            <div class="txn-kpi-card">
              <div class="txn-kpi-title">Total Transactions</div>
              <div class="txn-kpi-val">${result.rowCount}</div>
            </div>
            <div class="txn-kpi-card">
              <div class="txn-kpi-title">Total Sales Amount</div>
              <div class="txn-kpi-val text-primary">₹${formatMinorUnits(totalAmountMinor.toString())}</div>
            </div>
            <div class="txn-kpi-card">
              <div class="txn-kpi-title">Total Margin Earned</div>
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
                    <th style="width: 35px;">#</th>
                    <th style="min-width: 175px;">Date &amp; Time (Req / Resp / Used)</th>
                    <th style="min-width: 220px;">Txn ID &amp; API</th>
                    <th>Operator</th>
                    <th>Circle</th>
                    <th>Number</th>
                    <th>GST</th>
                    <th>Amount</th>
                    <th>Margin</th>
                    <th>Status</th>
                    <th>Operator Ref</th>
                    <th>Ref ID</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml.length > 0 ? rowsHtml : `
                    <tr>
                      <td colspan="12" class="txn-empty">
                        <i class="fa fa-inbox text-muted" style="font-size:32px;"></i>
                        <p class="mt-2 font-weight-bold mb-1">No sales transactions found for the selected date range &amp; filters.</p>
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
  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
  <script src="/assets/plugins/horizontal-menu/horizontal.js"></script>
  <script src="/auth-client.js"></script>
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

  return { sendUserSellerSalesTxnPage };
};
