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

module.exports = function createUserAvailableStockPage({ db, formatMinorUnits, decryptServiceConfig, getSession, httpError }) {
  
  async function getAdminMarginDifference() {
    try {
      const row = await db.query("SELECT config_ciphertext FROM admin_service_settings WHERE service_key = 'margin_difference'");
      if (row.rowCount > 0 && decryptServiceConfig) {
        const config = decryptServiceConfig(row.rows[0].config_ciphertext);
        const val = parseFloat(config.marginDifferencePercent ?? config.percent ?? '0.10');
        return isNaN(val) ? 0.10 : Math.max(0, val);
      }
    } catch (err) {
      console.error('[Available Stock] Error fetching admin margin difference:', err);
    }
    return 0.10;
  }

  async function sendUserAvailableStockPage(user, response, searchParams) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');
    
    const filters = {
      service: String(searchParams.get('service') || '').trim(),
      operatorId: String(searchParams.get('operatorId') || '').trim(),
      circle: String(searchParams.get('circle') || '').trim(),
      gstType: String(searchParams.get('gstType') || '').trim(),
      routeType: String(searchParams.get('routeType') || searchParams.get('commType') || '').trim(),
      search: String(searchParams.get('search') || '').trim().slice(0, 80),
    };

    const marginDiff = await getAdminMarginDifference();

    const operators = await db.query("SELECT id, operator_name, service_type, operator_code FROM operator_definitions WHERE status='active' AND deleted_at IS NULL ORDER BY service_type, operator_name");
    const services = [...new Set(operators.rows.map((row) => row.service_type))];

    // Query all active and admin-approved seller margins
    const conditions = ['m.deleted_at IS NULL', 'm.is_active = true', 'm.is_admin_approved = true'];
    const values = [];
    const add = (value) => { values.push(value); return `$${values.length}`; };

    if (filters.service && services.includes(filters.service)) {
      conditions.push(`o.service_type = ${add(filters.service)}`);
    }
    if (filters.operatorId && UUID.test(filters.operatorId)) {
      conditions.push(`m.operator_id = ${add(filters.operatorId)}`);
    }
    if (filters.circle && filters.circle !== 'All' && CIRCLES.includes(filters.circle)) {
      conditions.push(`m.circle_name IN (${add(filters.circle)}, 'All')`);
    }
    if (filters.gstType === 'with_gst') {
      conditions.push(`m.with_gst = true`);
    } else if (filters.gstType === 'without_gst') {
      conditions.push(`m.with_gst = false`);
    }

    if (filters.routeType === 'roffer' || filters.routeType === 'roffer_only') {
      conditions.push(`m.is_roffer = 'roffer_only'`);
    } else if (filters.routeType === 'no_roffer') {
      conditions.push(`m.is_roffer = 'no_roffer'`);
    } else if (filters.routeType === 'high_offer') {
      conditions.push(`(m.is_roffer = 'roffer_only' OR m.required_min_roffer_minor > 0)`);
    } else if (filters.routeType === 'all') {
      // no filter
    }

    if (filters.search) {
      conditions.push(`(o.operator_name ILIKE ${add(`%${filters.search}%`)} OR m.circle_name ILIKE ${add(`%${filters.search}%`)} OR COALESCE(m.operator_code, '') ILIKE ${add(`%${filters.search}%`)})`);
    }

    // Sort from highest buyer margin (Seller margin - Admin margin difference) to lowest
    const query = `
      SELECT m.id, m.user_id, m.operator_id, o.operator_name, o.service_type, o.operator_code AS admin_operator_code,
             m.circle_name, m.amount_type, m.amount_min_minor, m.amount_max_minor,
             m.commission_percent, m.required_min_roffer_minor, m.limit_minor,
             m.limit_used_minor, m.limit_type, m.with_gst, m.is_active,
             m.is_admin_approved, m.is_roffer, m.operator_code, m.created_at
      FROM seller_margin_settings m
      JOIN operator_definitions o ON o.id = m.operator_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY (CAST(m.commission_percent AS NUMERIC) - ${marginDiff}) DESC, m.created_at DESC
      LIMIT 1000
    `;

    const result = await db.query(query, values);

    const selected = (actual, expected) => (actual === expected ? ' selected' : '');
    const serviceOptions = services.map((service) => `<option value="${escapeHtml(service)}"${selected(filters.service, service)}>${escapeHtml(service)}</option>`).join('');
    const operatorOptions = operators.rows.map((op) => `<option value="${op.id}"${selected(filters.operatorId, op.id)}>${escapeHtml(op.operator_name)} · ${escapeHtml(op.service_type)}</option>`).join('');
    const circleOptions = CIRCLES.map((circle) => `<option value="${escapeHtml(circle)}"${selected(filters.circle, circle)}>${escapeHtml(circle)}</option>`).join('');

    const rows = result.rows.map((row, index) => {
      const isOwnMargin = row.user_id === user.id;

      // Amount representation
      const amount = row.amount_type === 'all'
        ? 'All'
        : row.amount_type === 'fixed'
          ? `₹${formatMinorUnits(row.amount_min_minor)}`
          : `₹${formatMinorUnits(row.amount_min_minor)} - ₹${formatMinorUnits(row.amount_max_minor)}`;

      // Margin calculation: Subtract Admin Margin Difference from Seller Commission
      const originalCommission = parseFloat(row.commission_percent || '0');
      const displayedRate = Math.max(0, originalCommission - marginDiff).toFixed(2);

      // Available Limit
      const limitTotal = BigInt(row.limit_minor || '0');
      const limitUsed = BigInt(row.limit_used_minor || '0');
      const remainingLimit = limitTotal > limitUsed ? limitTotal - limitUsed : 0n;
      const availableLimitFormatted = row.limit_type === 'unlimited' ? 'Unlimited' : `₹${formatMinorUnits(remainingLimit.toString())}`;

      // Comm type label
      const commTypeLabel = row.is_roffer === 'roffer_only'
        ? 'ROffer Only'
        : row.is_roffer === 'no_roffer'
          ? 'No ROffer'
          : 'All';

      // Min ROffer %
      const minRofferPercent = row.required_min_roffer_minor
        ? `${(Number(row.required_min_roffer_minor) / 100).toFixed(2)}%`
        : '0.00%';

      // Rate cell styling: different color if it's the current user's own margin
      let rateCell = `<span class="stock-rate font-weight-bold">${escapeHtml(displayedRate)}%</span>`;
      let rowClass = 'stock-row';
      let ownBadge = '';

      if (isOwnMargin) {
        rowClass += ' stock-own-row';
        rateCell = `<span class="stock-rate stock-rate-own font-weight-bold">${escapeHtml(displayedRate)}%</span>`;
        ownBadge = '<span class="badge badge-success ml-1" style="background:#10b981;font-size:10px;vertical-align:middle;padding:3px 6px;">Your Margin</span>';
      }

      return `
        <tr class="${rowClass}">
          <td class="text-center font-weight-bold text-muted">${index + 1}</td>
          <td>
            <div class="stock-op-cell">
              <span class="stock-op-avatar">${escapeHtml(row.operator_name.slice(0, 1).toUpperCase())}</span>
              <div>
                <strong class="stock-op-name">${escapeHtml(row.operator_name)}</strong>
                ${ownBadge}
                <div class="small text-muted">${escapeHtml(row.service_type)}</div>
              </div>
            </div>
          </td>
          <td><span class="stock-circle-badge">${escapeHtml(row.circle_name)}</span></td>
          <td class="text-center">0</td>
          <td class="text-center text-success font-weight-bold">100.0000%</td>
          <td class="text-center"><span class="badge ${row.with_gst ? 'badge-primary' : 'badge-light'}">${row.with_gst ? 'With GST' : 'No GST'}</span></td>
          <td class="text-center"><span class="stock-amount-badge">${amount}</span></td>
          <td class="text-right font-weight-bold text-dark">${availableLimitFormatted}</td>
          <td class="text-center"><span class="badge badge-info">${escapeHtml(commTypeLabel)}</span></td>
          <td class="text-center">${rateCell}</td>
          <td class="text-center"><span class="badge badge-success" style="background:#22c55e;">Active</span></td>
          <td class="text-center">0.00</td>
          <td class="text-center">${escapeHtml(minRofferPercent)}</td>
          <td class="text-center">
            <span class="stock-disabled-icon" title="Enabled"><i class="fa fa-toggle-on text-success" style="font-size:18px;"></i></span>
          </td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Available Stock - Exchange</title>
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
    .stock-page-container {
      padding: 12px 18px 40px;
    }
    
    /* Top Blue Filter Bar matching reference image */
    .stock-header-card {
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
    .stock-header-title {
      color: #ffffff;
      font-size: 16px;
      font-weight: 700;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      letter-spacing: 0.3px;
    }
    .stock-filter-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
    .stock-filter-group {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .stock-filter-group label {
      color: #d1dcf5;
      font-size: 11px;
      font-weight: 600;
      margin: 0;
      white-space: nowrap;
    }
    .stock-filter-select, .stock-filter-input {
      height: 31px;
      padding: 2px 8px;
      font-size: 12px;
      border-radius: 3px;
      border: 1px solid #ced4da;
      background-color: #ffffff;
      color: #333333;
      min-width: 110px;
    }
    .stock-btn-search {
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
      transition: background-color 0.2s;
    }
    .stock-btn-search:hover {
      background-color: #0b5ed7;
      color: #ffffff;
    }
    .stock-btn-reset {
      height: 31px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 600;
      background-color: #64748b;
      border: 1px solid #475569;
      color: #ffffff;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      text-decoration: none;
    }
    .stock-btn-reset:hover {
      background-color: #475569;
      color: #ffffff;
      text-decoration: none;
    }

    /* Note Banner */
    .stock-info-banner {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 9px 14px;
      border-radius: 4px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #1e40af;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .stock-legend {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
    }
    .stock-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .stock-legend-box {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      display: inline-block;
    }

    /* Data Table Card */
    .stock-table-card {
      background: #ffffff;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      overflow: hidden;
    }
    .stock-table-responsive {
      overflow-x: auto;
      margin: 0;
    }
    .stock-table {
      width: 100%;
      min-width: 1200px;
      margin-bottom: 0;
      border-collapse: collapse;
    }
    .stock-table thead th {
      background: #25396e;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      padding: 10px 8px;
      white-space: nowrap;
      border: 1px solid #364d88;
      vertical-align: middle;
      text-align: center;
    }
    .stock-table tbody td {
      padding: 8px 9px;
      font-size: 12px;
      vertical-align: middle;
      border-top: 1px solid #edf2f7;
      border-bottom: 1px solid #edf2f7;
    }
    .stock-table tbody tr:hover {
      background-color: #f8fafc;
    }

    /* Own Margin Row Highlighting */
    .stock-own-row {
      background-color: #ecfdf5 !important;
      border-left: 4px solid #10b981;
    }
    .stock-own-row:hover {
      background-color: #d1fae5 !important;
    }
    
    .stock-op-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .stock-op-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, #1e3a8a, #3b82f6);
      color: #ffffff;
      font-weight: 700;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .stock-op-name {
      color: #1e293b;
      font-size: 13px;
    }
    .stock-circle-badge {
      font-weight: 500;
      color: #475569;
    }
    .stock-amount-badge {
      background: #f1f5f9;
      color: #334155;
      padding: 3px 7px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 11px;
    }
    .stock-rate {
      display: inline-block;
      padding: 4px 9px;
      border-radius: 12px;
      background: #e0f2fe;
      color: #0369a1;
      font-size: 12px;
    }
    .stock-rate-own {
      background: #dcfce7 !important;
      color: #15803d !important;
      border: 1px solid #86efac;
      font-weight: 700;
    }
    .stock-empty {
      padding: 40px 20px;
      text-align: center;
      color: #64748b;
    }
    .stock-empty i {
      font-size: 32px;
      color: #94a3b8;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <main class="main-content">
        <div class="stock-page-container">
          
          <!-- Top Blue Filter Card -->
          <div class="stock-header-card">
            <h4 class="stock-header-title">
              <i class="fa fa-cubes"></i> Available Stock
            </h4>
            <form method="get" action="/available-stock" class="stock-filter-form">
              
              <div class="stock-filter-group">
                <label for="filterOperator">Operator Name</label>
                <select name="operatorId" id="filterOperator" class="stock-filter-select">
                  <option value="">:: ALL ::</option>
                  ${operators.rows.map((op) => `<option value="${op.id}"${selected(filters.operatorId, op.id)}>${escapeHtml(op.operator_name)}</option>`).join('')}
                </select>
              </div>

              <div class="stock-filter-group">
                <label for="filterCircle">Circle</label>
                <select name="circle" id="filterCircle" class="stock-filter-select">
                  <option value="">:: ALL ::</option>
                  ${circleOptions}
                </select>
              </div>

              <div class="stock-filter-group">
                <label for="filterGstType">GST Type</label>
                <select name="gstType" id="filterGstType" class="stock-filter-select">
                  <option value="">:: ALL ::</option>
                  <option value="with_gst"${selected(filters.gstType, 'with_gst')}>With GST</option>
                  <option value="without_gst"${selected(filters.gstType, 'without_gst')}>Without GST</option>
                </select>
              </div>

              <div class="stock-filter-group">
                <label for="filterRouteType">Route Type</label>
                <select name="routeType" id="filterRouteType" class="stock-filter-select">
                  <option value="">:: ALL ::</option>
                  <option value="all"${selected(filters.routeType, 'all')}>All</option>
                  <option value="roffer"${selected(filters.routeType, 'roffer') || selected(filters.routeType, 'roffer_only')}>ROffer Only</option>
                  <option value="no_roffer"${selected(filters.routeType, 'no_roffer')}>No ROffer</option>
                  <option value="high_offer"${selected(filters.routeType, 'high_offer')}>High Offer</option>
                </select>
              </div>

              <button type="submit" class="stock-btn-search">
                <i class="fa fa-search"></i> Search
              </button>

              <a href="/available-stock" class="stock-btn-reset" title="Clear Filters">
                <i class="fa fa-refresh"></i> Reset
              </a>
            </form>
          </div>

          <!-- Info Banner -->
          <div class="stock-info-banner">
            <div>
              <i class="fa fa-info-circle mr-1"></i>
              Showing available stocks sorted by <strong>Highest Margin</strong>.
              Rates are displayed after applying <strong>Admin Margin Difference (${marginDiff.toFixed(2)}% deduction)</strong>.
            </div>
            <div class="stock-legend">
              <span class="stock-legend-item">
                <span class="stock-legend-box" style="background:#ecfdf5;border:1px solid #10b981;"></span>
                <span>Your Margin Setting</span>
              </span>
              <span class="stock-legend-item">
                <span class="stock-legend-box" style="background:#ffffff;border:1px solid #cbd5e1;"></span>
                <span>Market / Seller Stocks</span>
              </span>
            </div>
          </div>

          <!-- Table Card -->
          <div class="stock-table-card">
            <div class="stock-table-responsive">
              <table class="stock-table table-bordered">
                <thead>
                  <tr>
                    <th>#</th>
                    <th style="text-align:left; min-width: 160px;">Operator Name</th>
                    <th>Circle</th>
                    <th>Fail Count</th>
                    <th>Success Rate</th>
                    <th>Gst Type</th>
                    <th>Amount</th>
                    <th style="text-align:right;">Available Limit</th>
                    <th>Route Type</th>
                    <th>Comm. Rate</th>
                    <th>Status</th>
                    <th>Add Commission</th>
                    <th>Min Roffer %</th>
                    <th>Disable</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.length > 0 ? rows : `
                    <tr>
                      <td colspan="14" class="stock-empty">
                        <i class="fa fa-inbox d-block"></i>
                        <strong>No available stock found matching your filter criteria.</strong>
                        <p class="small text-muted mb-0 mt-1">Try resetting the filters or check back later.</p>
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

  return { sendUserAvailableStockPage };
};
