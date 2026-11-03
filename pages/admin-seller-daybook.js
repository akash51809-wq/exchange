'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminSellerDaybookPage({
  db,
  formatMinorUnits,
  sendJson,
  httpError,
}) {
  function getTodayString() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function formatRupeesFromMinor(minorValue) {
    const minor = BigInt(minorValue || 0);
    const sign = minor < 0n ? '-' : '';
    const absMinor = minor < 0n ? -minor : minor;
    const whole = absMinor / 100n;
    const cents = absMinor % 100n;
    return `${sign}${whole.toLocaleString('en-IN')}.${String(cents).padStart(2, '0')}`;
  }

  async function sendAdminSellerDaybookPage(admin, response, searchParams) {
    const today = getTodayString();
    const fromDate = String(searchParams.get('fromDate') || searchParams.get('date') || today).trim();
    const toDate = String(searchParams.get('toDate') || fromDate || today).trim();
    const selectedUserId = String(searchParams.get('userId') || 'all').trim();
    const isCsv = String(searchParams.get('format') || '').toLowerCase() === 'csv';

    // 1. Fetch seller users for dropdown
    const sellersRes = await db.query(`
      SELECT DISTINCT u.id, u.username, u.name, u.business_name
      FROM users u
      LEFT JOIN seller_margin_settings m ON m.user_id = u.id
      LEFT JOIN seller_api_settings s ON s.user_id = u.id
      WHERE u.role = 'user' AND u.deleted_at IS NULL
        AND (m.id IS NOT NULL OR s.id IS NOT NULL)
      ORDER BY u.name ASC, u.username ASC
    `);
    const sellerUsers = sellersRes.rows.length ? sellersRes.rows : (await db.query("SELECT id, username, name, business_name FROM users WHERE role = 'user' AND deleted_at IS NULL ORDER BY name ASC")).rows;

    const startTimestamp = `${fromDate} 00:00:00+05:30`;
    const endTimestamp = `${toDate} 23:59:59.999+05:30`;

    const sellerWhereClause = (selectedUserId && selectedUserId !== 'all') ? 'AND seller_user_id = $1' : '';
    const walletUserWhereClause = (selectedUserId && selectedUserId !== 'all') ? 'AND user_id = $1' : '';
    const queryParams = (selectedUserId && selectedUserId !== 'all') ? [selectedUserId] : [];

    // 2. Opening Balance calculation (wallet movements before startTimestamp)
    let openingBalanceMinor = 0n;
    try {
      const openSql = `
        SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN -amount_minor ELSE amount_minor END), 0) AS opening_bal
        FROM wallet_entries
        WHERE created_at < '${startTimestamp}'::timestamptz
        ${walletUserWhereClause}
      `;
      const openRes = await db.query(openSql, queryParams);
      openingBalanceMinor = BigInt(openRes.rows[0]?.opening_bal || 0);
    } catch (e) {
      console.warn('[Seller Daybook] Error fetching opening balance:', e.message);
    }

    // 3. Period Net Movements
    let periodCreditMinor = 0n;
    let periodDebitMinor = 0n;
    try {
      const moveSql = `
        SELECT
          COALESCE(SUM(amount_minor) FILTER (WHERE entry_type <> 'debit'), 0) AS credits,
          COALESCE(SUM(amount_minor) FILTER (WHERE entry_type = 'debit'), 0) AS debits
        FROM wallet_entries
        WHERE created_at >= '${startTimestamp}'::timestamptz
          AND created_at <= '${endTimestamp}'::timestamptz
          ${walletUserWhereClause}
      `;
      const moveRes = await db.query(moveSql, queryParams);
      periodCreditMinor = BigInt(moveRes.rows[0]?.credits || 0);
      periodDebitMinor = BigInt(moveRes.rows[0]?.debits || 0);
    } catch (e) {
      console.warn('[Seller Daybook] Error fetching period movements:', e.message);
    }

    // Closing Balance = Opening Balance + Period Credits - Period Debits
    const closingBalanceMinor = openingBalanceMinor + periodCreditMinor - periodDebitMinor;

    // 4. Sale Recharges KPI (Fulfilled by seller)
    let totalSaleCount = 0;
    let successSaleCount = 0;
    let saleAmountMinor = 0n;
    let saleCostMinor = 0n;
    let saleMarginMinor = 0n;

    try {
      const saleSql = `
        SELECT
          COUNT(*) AS total_count,
          COUNT(*) FILTER (WHERE status = 'successful') AS success_count,
          COALESCE(SUM(amount_minor) FILTER (WHERE status = 'successful'), 0) AS sale_val,
          COALESCE(SUM(cost_minor) FILTER (WHERE status = 'successful'), 0) AS cost_val,
          COALESCE(SUM(COALESCE(seller_margin_minor, margin_minor, 0)) FILTER (WHERE status = 'successful'), 0) AS margin_val
        FROM recharge_orders
        WHERE created_at >= '${startTimestamp}'::timestamptz
          AND created_at <= '${endTimestamp}'::timestamptz
          ${sellerWhereClause}
      `;
      const saleRes = await db.query(saleSql, queryParams);
      const sRow = saleRes.rows[0] || {};
      totalSaleCount = parseInt(sRow.total_count, 10) || 0;
      successSaleCount = parseInt(sRow.success_count, 10) || 0;
      saleAmountMinor = BigInt(sRow.sale_val || 0);
      saleCostMinor = BigInt(sRow.cost_val || 0);
      saleMarginMinor = BigInt(sRow.margin_val || 0);
    } catch (e) {
      console.warn('[Seller Daybook] Error fetching sale KPIs:', e.message);
    }

    const marginPercent = saleAmountMinor > 0n
      ? (Number(saleMarginMinor) / Number(saleAmountMinor) * 100).toFixed(2)
      : '0.00';

    // 5. Redeem Balance (Payout requests)
    let totalRedeemCount = 0;
    let redeemAmountMinor = 0n;
    try {
      const redSql = `
        SELECT
          COUNT(*) AS redeem_cnt,
          COALESCE(SUM(amount_minor) FILTER (WHERE status = 'success' OR status = 'pending'), 0) AS redeem_val
        FROM payout_requests
        WHERE created_at >= '${startTimestamp}'::timestamptz
          AND created_at <= '${endTimestamp}'::timestamptz
          ${walletUserWhereClause}
      `;
      const redRes = await db.query(redSql, queryParams);
      totalRedeemCount = parseInt(redRes.rows[0]?.redeem_cnt, 10) || 0;
      redeemAmountMinor = BigInt(redRes.rows[0]?.redeem_val || 0);
    } catch (e) {
      console.warn('[Seller Daybook] Error fetching redeem KPIs:', e.message);
    }

    // 6. Operator-wise Sale Breakdown
    let opBreakdownRows = [];
    try {
      const opSql = `
        SELECT
          COALESCE(o.operator_name, r.operator_name, r.operator_code, 'Unknown') AS op_name,
          COALESCE(o.service_type, 'Prepaid') AS service_type,
          COUNT(*) AS total_txns,
          COUNT(*) FILTER (WHERE r.status = 'successful') AS success_txns,
          COUNT(*) FILTER (WHERE r.status = 'failed' OR r.status = 'refunded') AS failed_txns,
          COUNT(*) FILTER (WHERE r.status = 'pending') AS pending_txns,
          COALESCE(SUM(r.amount_minor), 0) AS total_val,
          COALESCE(SUM(r.amount_minor) FILTER (WHERE r.status = 'successful'), 0) AS sale_val,
          COALESCE(SUM(r.cost_minor) FILTER (WHERE r.status = 'successful'), 0) AS cost_val,
          COALESCE(SUM(COALESCE(r.seller_margin_minor, r.margin_minor, 0)) FILTER (WHERE r.status = 'successful'), 0) AS margin_val
        FROM recharge_orders r
        LEFT JOIN operator_definitions o ON o.id = r.operator_id
        WHERE r.created_at >= '${startTimestamp}'::timestamptz
          AND r.created_at <= '${endTimestamp}'::timestamptz
          ${sellerWhereClause}
        GROUP BY COALESCE(o.operator_name, r.operator_name, r.operator_code, 'Unknown'), COALESCE(o.service_type, 'Prepaid')
        ORDER BY sale_val DESC, total_txns DESC
      `;
      const opRes = await db.query(opSql, queryParams);
      opBreakdownRows = opRes.rows || [];
    } catch (e) {
      console.warn('[Seller Daybook] Error fetching operator breakdown:', e.message);
    }

    // Handle CSV download
    if (isCsv) {
      response.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="seller_daybook_${fromDate}_to_${toDate}.csv"`,
        'cache-control': 'no-store',
      });
      let csv = 'Operator Name,Service Type,Total Sale Orders,Success,Failed,Pending,Sale Amount (INR),Net Cost (INR),Seller Margin (INR),Margin (%)\n';
      for (const op of opBreakdownRows) {
        const sVal = BigInt(op.sale_val || 0);
        const mVal = BigInt(op.margin_val || 0);
        const cVal = BigInt(op.cost_val || 0);
        const pct = sVal > 0n ? (Number(mVal) / Number(sVal) * 100).toFixed(2) : '0.00';
        csv += `"${op.op_name}","${op.service_type}",${op.total_txns},${op.success_txns},${op.failed_txns},${op.pending_txns},${(Number(sVal) / 100).toFixed(2)},${(Number(cVal) / 100).toFixed(2)},${(Number(mVal) / 100).toFixed(2)},${pct}%\n`;
      }
      return response.end(csv);
    }

    const navigation = renderAdminNavigation('/admin/reports/seller-daybook');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Seller Daybook - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 16px 20px 40px; }
    .daybook-kpi-card {
      background: #ffffff;
      border-radius: 8px;
      padding: 16px 20px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .kpi-icon-box {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .filter-card {
      background: #ffffff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      padding: 14px 18px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <div class="page-container">
        
        <!-- Header -->
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h3 class="font-weight-bold text-dark mb-0">
              <i class="fa fa-book text-success mr-1"></i> Seller Daybook
            </h3>
            <p class="text-muted small mb-0">
              Daily summary of opening balance, sale volume fulfilled, redeem requests, seller margin (₹ &amp; %), operator-wise breakdown, and closing balance.
            </p>
          </div>
          <div class="d-flex gap-2">
            <a href="?fromDate=${escapeHtml(fromDate)}&toDate=${escapeHtml(toDate)}&userId=${escapeHtml(selectedUserId)}&format=csv" class="btn btn-outline-success btn-sm font-weight-bold">
              <i class="fa fa-download mr-1"></i> Export CSV
            </a>
            <a href="/admin/reports/seller-ledger${selectedUserId !== 'all' ? `?userId=${selectedUserId}` : ''}" class="btn btn-outline-info btn-sm font-weight-bold">
              <i class="fa fa-list-alt mr-1"></i> View Seller Ledger
            </a>
          </div>
        </div>

        <!-- Filter Form -->
        <div class="filter-card">
          <form method="GET" action="/admin/reports/seller-daybook" class="row align-items-end g-2">
            <div class="col-md-3 col-sm-6">
              <label class="font-weight-bold small text-muted mb-1">From Date (IST):</label>
              <input type="date" name="fromDate" value="${escapeHtml(fromDate)}" class="form-control form-control-sm font-weight-bold">
            </div>
            <div class="col-md-3 col-sm-6">
              <label class="font-weight-bold small text-muted mb-1">To Date (IST):</label>
              <input type="date" name="toDate" value="${escapeHtml(toDate)}" class="form-control form-control-sm font-weight-bold">
            </div>
            <div class="col-md-4 col-sm-8">
              <label class="font-weight-bold small text-muted mb-1">Filter by Seller User:</label>
              <select name="userId" class="form-control form-control-sm font-weight-bold">
                <option value="all">-- All Sellers (Platform Wide) --</option>
                ${sellerUsers.map((u) => `
                  <option value="${u.id}" ${u.id === selectedUserId ? 'selected' : ''}>
                    ${escapeHtml(u.name || u.username)} (${escapeHtml(u.username)}) ${u.business_name ? `[${escapeHtml(u.business_name)}]` : ''}
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="col-md-2 col-sm-4 d-flex gap-1">
              <button type="submit" class="btn btn-success btn-sm btn-block font-weight-bold">
                <i class="fa fa-filter mr-1"></i> Filter
              </button>
              <a href="/admin/reports/seller-daybook" class="btn btn-outline-secondary btn-sm" title="Reset">
                <i class="fa fa-refresh"></i>
              </a>
            </div>
          </form>
        </div>

        <!-- Top 5 Summary Cards -->
        <div class="row row-deck mb-4">
          <!-- 1. Opening Balance -->
          <div class="col-xl-2 col-lg-4 col-md-6 mb-3">
            <div class="daybook-kpi-card">
              <div class="kpi-icon-box bg-primary-transparent text-primary">
                <i class="fa fa-university"></i>
              </div>
              <div>
                <small class="text-muted font-weight-bold d-block text-uppercase">Opening Balance</small>
                <h4 class="font-weight-bold text-dark mb-0 font-monospace">₹${formatRupeesFromMinor(openingBalanceMinor)}</h4>
              </div>
            </div>
          </div>

          <!-- 2. Sale Balance -->
          <div class="col-xl-3 col-lg-4 col-md-6 mb-3">
            <div class="daybook-kpi-card">
              <div class="kpi-icon-box bg-success-transparent text-success">
                <i class="fa fa-line-chart"></i>
              </div>
              <div>
                <small class="text-muted font-weight-bold d-block text-uppercase">Sale Balance</small>
                <h4 class="font-weight-bold text-success mb-0 font-monospace">₹${formatRupeesFromMinor(saleAmountMinor)}</h4>
                <small class="text-muted">${successSaleCount} fulfilled / ${totalSaleCount} total</small>
              </div>
            </div>
          </div>

          <!-- 3. Redeem Balance -->
          <div class="col-xl-2 col-lg-4 col-md-6 mb-3">
            <div class="daybook-kpi-card">
              <div class="kpi-icon-box bg-warning-transparent text-warning">
                <i class="fa fa-money"></i>
              </div>
              <div>
                <small class="text-muted font-weight-bold d-block text-uppercase">Redeem Balance</small>
                <h4 class="font-weight-bold text-warning mb-0 font-monospace">₹${formatRupeesFromMinor(redeemAmountMinor)}</h4>
                <small class="text-muted">${totalRedeemCount} payout req(s)</small>
              </div>
            </div>
          </div>

          <!-- 4. Get / Paid Margin -->
          <div class="col-xl-3 col-lg-6 col-md-6 mb-3">
            <div class="daybook-kpi-card">
              <div class="kpi-icon-box bg-info-transparent text-info">
                <i class="fa fa-percent"></i>
              </div>
              <div>
                <small class="text-muted font-weight-bold d-block text-uppercase">Seller Margin (Paid/Earned)</small>
                <h4 class="font-weight-bold text-info mb-0 font-monospace">
                  ₹${formatRupeesFromMinor(saleMarginMinor)}
                  <span class="badge badge-info ml-1 font-weight-bold" style="font-size:12px;">${marginPercent}%</span>
                </h4>
                <small class="text-muted">Stock margin fulfilled</small>
              </div>
            </div>
          </div>

          <!-- 5. Closing Balance -->
          <div class="col-xl-2 col-lg-6 col-md-6 mb-3">
            <div class="daybook-kpi-card">
              <div class="kpi-icon-box bg-purple-transparent text-purple" style="color:#7c3aed;background:#f3e8ff;">
                <i class="fa fa-balance-scale"></i>
              </div>
              <div>
                <small class="text-muted font-weight-bold d-block text-uppercase">Closing Balance</small>
                <h4 class="font-weight-bold text-dark mb-0 font-monospace">₹${formatRupeesFromMinor(closingBalanceMinor)}</h4>
              </div>
            </div>
          </div>
        </div>

        <!-- Operator-wise Sale Breakdown Table -->
        <div class="card shadow-sm border-0">
          <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
            <h5 class="card-title font-weight-bold mb-0 text-dark">
              <i class="fa fa-pie-chart text-success mr-1"></i> Operator-Wise Sale Summary
            </h5>
            <span class="badge badge-light border text-muted px-2 py-1">${opBreakdownRows.length} Operator(s) fulfilled</span>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered table-striped card-table mb-0 text-nowrap">
              <thead class="bg-light">
                <tr>
                  <th class="text-center" style="width:50px;">#</th>
                  <th>Operator Name</th>
                  <th>Service Type</th>
                  <th class="text-center">Total Sales</th>
                  <th class="text-center">Success</th>
                  <th class="text-center">Failed</th>
                  <th class="text-center">Pending</th>
                  <th class="text-right">Sale Value (₹)</th>
                  <th class="text-right">Net Cost (₹)</th>
                  <th class="text-right">Seller Margin (₹)</th>
                  <th class="text-center">Margin (%)</th>
                </tr>
              </thead>
              <tbody>
                ${opBreakdownRows.length === 0 ? `
                  <tr>
                    <td colspan="11" class="text-center py-4 text-muted">
                      <i class="fa fa-info-circle fa-2x mb-2 text-muted d-block"></i>
                      No sale transactions found for the selected date and seller.
                    </td>
                  </tr>
                ` : opBreakdownRows.map((op, idx) => {
                  const sVal = BigInt(op.sale_val || 0);
                  const cVal = BigInt(op.cost_val || 0);
                  const mVal = BigInt(op.margin_val || 0);
                  const pct = sVal > 0n ? (Number(mVal) / Number(sVal) * 100).toFixed(2) : '0.00';
                  return `
                    <tr>
                      <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
                      <td class="font-weight-bold text-dark">${escapeHtml(op.op_name)}</td>
                      <td><span class="badge badge-info">${escapeHtml(op.service_type)}</span></td>
                      <td class="text-center font-weight-bold">${op.total_txns}</td>
                      <td class="text-center text-success font-weight-bold">${op.success_txns}</td>
                      <td class="text-center text-danger font-weight-bold">${op.failed_txns}</td>
                      <td class="text-center text-warning font-weight-bold">${op.pending_txns}</td>
                      <td class="text-right font-monospace font-weight-bold text-dark">₹${formatRupeesFromMinor(sVal)}</td>
                      <td class="text-right font-monospace text-muted">₹${formatRupeesFromMinor(cVal)}</td>
                      <td class="text-right font-monospace font-weight-bold text-success">₹${formatRupeesFromMinor(mVal)}</td>
                      <td class="text-center font-monospace font-weight-bold text-primary">${pct}%</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              ${opBreakdownRows.length > 0 ? `
                <tfoot class="bg-light font-weight-bold">
                  <tr>
                    <td colspan="3" class="text-right font-weight-bold">Grand Total:</td>
                    <td class="text-center font-weight-bold">${totalSaleCount}</td>
                    <td class="text-center text-success font-weight-bold">${successSaleCount}</td>
                    <td class="text-center text-danger font-weight-bold">
                      ${opBreakdownRows.reduce((acc, r) => acc + (parseInt(r.failed_txns, 10) || 0), 0)}
                    </td>
                    <td class="text-center text-warning font-weight-bold">
                      ${opBreakdownRows.reduce((acc, r) => acc + (parseInt(r.pending_txns, 10) || 0), 0)}
                    </td>
                    <td class="text-right font-monospace font-weight-bold text-dark">₹${formatRupeesFromMinor(saleAmountMinor)}</td>
                    <td class="text-right font-monospace font-weight-bold text-muted">₹${formatRupeesFromMinor(saleCostMinor)}</td>
                    <td class="text-right font-monospace font-weight-bold text-success">₹${formatRupeesFromMinor(saleMarginMinor)}</td>
                    <td class="text-center font-monospace font-weight-bold text-primary">${marginPercent}%</td>
                  </tr>
                </tfoot>
              ` : ''}
            </table>
          </div>
        </div>

      </div>
    </div>
  </div>
</body>
</html>`;

    const fullHtml = useFullWidthContainers(html);
    const framedHtml = await addPanelChrome(fullHtml, {
      role: 'admin',
      admin,
      currentPath: '/admin/reports/seller-daybook',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(framedHtml);
  }

  return { sendAdminSellerDaybookPage };
};
