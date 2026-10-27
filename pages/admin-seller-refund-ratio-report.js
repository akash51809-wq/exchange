'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminSellerRefundRatioReportPage({
  db,
  formatMinorUnits,
  sendJson,
  httpError,
}) {
  function getTodayString() {
    const d = new Date();
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  function getMonthStartString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }

  function formatRupeesFromMinor(minorValue) {
    const minor = BigInt(minorValue || 0);
    const sign = minor < 0n ? '-' : '';
    const absMinor = minor < 0n ? -minor : minor;
    const whole = absMinor / 100n;
    const cents = absMinor % 100n;
    return `${sign}${whole.toLocaleString('en-IN')}.${String(cents).padStart(2, '0')}`;
  }

  function sanitizeCsv(val) {
    const str = String(val ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  }

  async function sendAdminSellerRefundRatioReportPage(admin, response, searchParams) {
    const today = getTodayString();
    const filters = {
      sellerId: String(searchParams.get('sellerId') || searchParams.get('seller') || '').trim(),
      operatorId: String(searchParams.get('operatorId') || searchParams.get('operator') || '').trim(),
      from: String(searchParams.get('from') || getMonthStartString()).trim(),
      to: String(searchParams.get('to') || today).trim(),
      download: String(searchParams.get('download') || '').trim().toLowerCase(),
    };

    // Date validation
    const validDate = (val) => /^\d{4}-\d{2}-\d{2}$/.test(val);
    if (filters.from && !validDate(filters.from)) filters.from = getMonthStartString();
    if (filters.to && !validDate(filters.to)) filters.to = today;

    // 1. Fetch Sellers and Operators for filter dropdowns
    const [sellersRes, operatorsRes] = await Promise.all([
      db.query(`
        SELECT DISTINCT u.id, u.username, u.name
        FROM users u
        WHERE u.role = 'user' AND u.deleted_at IS NULL
          AND (EXISTS (SELECT 1 FROM recharge_orders r WHERE r.seller_user_id = u.id)
               OR EXISTS (SELECT 1 FROM seller_api_settings s WHERE s.user_id = u.id AND s.deleted_at IS NULL))
        ORDER BY u.name ASC, u.username ASC
      `),
      db.query(`
        SELECT id, operator_name, operator_code, service_type
        FROM operator_definitions
        WHERE deleted_at IS NULL
        ORDER BY operator_name ASC
      `),
    ]);

    const sellersList = sellersRes.rows;
    const operatorsList = operatorsRes.rows;

    // 2. Build Query Conditions
    const where = ['r.seller_user_id IS NOT NULL'];
    const values = [];
    const addParam = (val) => { values.push(val); return `$${values.length}`; };

    if (filters.sellerId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.sellerId)) {
      where.push(`r.seller_user_id = ${addParam(filters.sellerId)}`);
    }

    if (filters.operatorId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.operatorId)) {
      where.push(`r.operator_id = ${addParam(filters.operatorId)}`);
    }

    if (filters.from) {
      where.push(`r.created_at >= (${addParam(filters.from)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (filters.to) {
      where.push(`r.created_at < (((${addParam(filters.to)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }

    const sql = `
      SELECT
        r.seller_user_id,
        COALESCE(u.name, u.username, 'Unknown Seller') AS seller_name,
        COALESCE(u.username, '—') AS seller_username,
        r.operator_id,
        COALESCE(o.operator_name, 'Unknown Operator') AS operator_name,
        COALESCE(o.operator_code, '—') AS operator_code,
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(r.amount_minor), 0)::bigint AS total_amount_minor,
        COUNT(*) FILTER (WHERE r.status = 'success' AND (r.dispute_status IS NULL OR r.dispute_status != 'accepted'))::int AS success_orders,
        COALESCE(SUM(r.amount_minor) FILTER (WHERE r.status = 'success' AND (r.dispute_status IS NULL OR r.dispute_status != 'accepted')), 0)::bigint AS success_amount_minor,
        COUNT(*) FILTER (WHERE r.status IN ('refunded', 'failed') OR r.dispute_status = 'accepted')::int AS refund_orders,
        COALESCE(SUM(r.amount_minor) FILTER (WHERE r.status IN ('refunded', 'failed') OR r.dispute_status = 'accepted'), 0)::bigint AS refund_amount_minor,
        COUNT(*) FILTER (WHERE r.status = 'pending')::int AS pending_orders,
        COALESCE(SUM(r.amount_minor) FILTER (WHERE r.status = 'pending'), 0)::bigint AS pending_amount_minor
      FROM recharge_orders r
      LEFT JOIN users u ON u.id = r.seller_user_id
      LEFT JOIN operator_definitions o ON o.id = r.operator_id
      WHERE ${where.join(' AND ')}
      GROUP BY r.seller_user_id, u.name, u.username, r.operator_id, o.operator_name, o.operator_code
      ORDER BY refund_orders DESC, total_orders DESC
    `;

    const reportRes = await db.query(sql, values);
    const rows = reportRes.rows;

    // Aggregates for KPIs
    let totalAllOrders = 0;
    let totalAllAmountMinor = 0n;
    let totalSuccessOrders = 0;
    let totalSuccessAmountMinor = 0n;
    let totalRefundOrders = 0;
    let totalRefundAmountMinor = 0n;
    let totalPendingOrders = 0;

    const data = rows.map((row) => {
      const total = Number(row.total_orders || 0);
      const totalAmt = BigInt(row.total_amount_minor || 0);
      const succ = Number(row.success_orders || 0);
      const succAmt = BigInt(row.success_amount_minor || 0);
      const ref = Number(row.refund_orders || 0);
      const refAmt = BigInt(row.refund_amount_minor || 0);
      const pend = Number(row.pending_orders || 0);

      totalAllOrders += total;
      totalAllAmountMinor += totalAmt;
      totalSuccessOrders += succ;
      totalSuccessAmountMinor += succAmt;
      totalRefundOrders += ref;
      totalRefundAmountMinor += refAmt;
      totalPendingOrders += pend;

      const refundCountRatio = total > 0 ? ((ref / total) * 100).toFixed(2) : '0.00';
      const refundAmountRatio = totalAmt > 0n ? (Number((refAmt * 10000n) / totalAmt) / 100).toFixed(2) : '0.00';

      return {
        ...row,
        total,
        totalAmt,
        succ,
        succAmt,
        ref,
        refAmt,
        pend,
        refundCountRatio,
        refundAmountRatio,
      };
    });

    // 3. Handle CSV / Excel Export
    if (filters.download === 'csv' || filters.download === 'excel') {
      const csvHeaders = [
        'Seller Name',
        'Seller Username',
        'Operator Name',
        'Operator Code',
        'Total Recharges',
        'Total Amount (INR)',
        'Success Recharges',
        'Success Amount (INR)',
        'Refunded / Failed Recharges',
        'Refunded Amount (INR)',
        'Pending Recharges',
        'Refund Count Ratio (%)',
        'Refund Amount Ratio (%)',
      ].join(',') + '\r\n';

      const csvLines = data.map((d) => [
        sanitizeCsv(d.seller_name),
        sanitizeCsv(d.seller_username),
        sanitizeCsv(d.operator_name),
        sanitizeCsv(d.operator_code),
        d.total,
        (Number(d.totalAmt) / 100).toFixed(2),
        d.succ,
        (Number(d.succAmt) / 100).toFixed(2),
        d.ref,
        (Number(d.refAmt) / 100).toFixed(2),
        d.pend,
        sanitizeCsv(d.refundCountRatio + '%'),
        sanitizeCsv(d.refundAmountRatio + '%'),
      ].join(',')).join('\r\n');

      response.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="seller-operator-refund-ratio-${today}.csv"`,
        'cache-control': 'no-store',
      });
      response.end('\uFEFF' + csvHeaders + csvLines);
      return;
    }

    // 4. Render HTML Page
    const overallRefundRatio = totalAllOrders > 0
      ? ((totalRefundOrders / totalAllOrders) * 100).toFixed(2)
      : '0.00';

    const overallRefundAmountRatio = totalAllAmountMinor > 0n
      ? (Number((totalRefundAmountMinor * 10000n) / totalAllAmountMinor) / 100).toFixed(2)
      : '0.00';

    const buildQueryString = (overrides = {}) => {
      const q = new URLSearchParams();
      if (filters.sellerId) q.set('sellerId', filters.sellerId);
      if (filters.operatorId) q.set('operatorId', filters.operatorId);
      if (filters.from) q.set('from', filters.from);
      if (filters.to) q.set('to', filters.to);
      for (const [k, v] of Object.entries(overrides)) {
        if (v) q.set(k, v); else q.delete(k);
      }
      return q.toString();
    };

    const excelDownloadUrl = `/admin/reports/seller-refund-ratio?${buildQueryString({ download: 'csv' })}`;

    const sellerOptions = sellersList.map((s) => `
      <option value="${s.id}"${s.id === filters.sellerId ? ' selected' : ''}>
        ${escapeHtml(s.name)} (@${escapeHtml(s.username)})
      </option>
    `).join('');

    const operatorOptions = operatorsList.map((o) => `
      <option value="${o.id}"${o.id === filters.operatorId ? ' selected' : ''}>
        ${escapeHtml(o.operator_name)} (${escapeHtml(o.operator_code || '—')})
      </option>
    `).join('');

    const tableRows = data.length ? data.map((item, idx) => {
      const ratioNum = parseFloat(item.refundCountRatio);
      let badgeClass = 'badge-success';
      if (ratioNum > 20) badgeClass = 'badge-danger';
      else if (ratioNum > 5) badgeClass = 'badge-warning';

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <strong>${escapeHtml(item.seller_name)}</strong>
            <small class="d-block text-muted">@${escapeHtml(item.seller_username)}</small>
          </td>
          <td>
            <strong>${escapeHtml(item.operator_name)}</strong>
            <span class="badge badge-light border ml-1">${escapeHtml(item.operator_code)}</span>
          </td>
          <td class="text-right">
            <strong>${item.total.toLocaleString('en-IN')}</strong>
            <small class="d-block text-muted">₹${formatRupeesFromMinor(item.totalAmt)}</small>
          </td>
          <td class="text-right text-success">
            <strong>${item.succ.toLocaleString('en-IN')}</strong>
            <small class="d-block text-muted">₹${formatRupeesFromMinor(item.succAmt)}</small>
          </td>
          <td class="text-right text-danger">
            <strong>${item.ref.toLocaleString('en-IN')}</strong>
            <small class="d-block text-muted">₹${formatRupeesFromMinor(item.refAmt)}</small>
          </td>
          <td class="text-right text-warning">
            ${item.pend.toLocaleString('en-IN')}
          </td>
          <td class="text-center">
            <span class="badge badge-pill ${badgeClass} font-weight-bold" style="font-size: 13px; padding: 6px 12px;">
              ${item.refundCountRatio}%
            </span>
          </td>
          <td class="text-center font-weight-bold text-secondary">
            ${item.refundAmountRatio}%
          </td>
        </tr>
      `;
    }).join('') : `
      <tr>
        <td colspan="9" class="text-center py-5 text-muted">
          <i class="fa fa-info-circle fa-2x mb-2 text-secondary"></i>
          <p class="mb-0 font-weight-bold">No seller-operator transaction records found for the selected criteria.</p>
        </td>
      </tr>
    `;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Seller &amp; Operator Refund Ratio Report - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    .report-card { border: 1px solid #e2e6f0; border-radius: 11px; box-shadow: 0 4px 14px rgba(35,51,99,0.06); margin-bottom: 20px; }
    .report-card-head { background: #5969c9; color: #fff; padding: 13px 18px; font-weight: 700; display: flex; align-items: center; justify-content: space-between; border-radius: 11px 11px 0 0; }
    .kpi-box { background: #fff; border-radius: 10px; border: 1px solid #e4e7ef; padding: 16px; margin-bottom: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
    .kpi-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #7e8799; margin-bottom: 6px; }
    .kpi-value { font-size: 22px; font-weight: 800; color: #2e384d; margin-bottom: 3px; }
    .kpi-sub { font-size: 12px; color: #8790a1; }
    .table thead th { background: #343a40; color: #fff; border-color: #454b52; font-size: 12px; white-space: nowrap; padding: 12px 10px; }
    .table td { vertical-align: middle; font-size: 13px; }
    .filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: end; }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    <div class="sticky">
      <div class="horizontal-main hor-menu clearfix">
        <div class="horizontal-mainwrapper container-fluid px-2 clearfix">
          <nav class="horizontalMenu clearfix"></nav>
        </div>
      </div>
    </div>

    <main class="main-content">
      <div class="container-fluid px-3 py-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h3 class="font-weight-bold text-primary mb-1">Seller &amp; Operator Refund Ratio Report</h3>
            <p class="text-muted mb-0">सेलर व ऑपरेटर अनुसार रिचार्ज रिफंड प्रतिशत और प्रदर्शन विश्लेषण (Seller-wise &amp; Operator-wise Refund Ratio)</p>
          </div>
          <div>
            <a href="${excelDownloadUrl}" class="btn btn-success font-weight-bold shadow-sm">
              <i class="fa fa-file-excel-o mr-1"></i> Download Excel
            </a>
          </div>
        </div>

        <!-- KPI Summary Cards -->
        <div class="row">
          <div class="col-md-3 col-sm-6">
            <div class="kpi-box border-left-primary">
              <div class="kpi-title">Total Recharge Orders</div>
              <div class="kpi-value">${totalAllOrders.toLocaleString('en-IN')}</div>
              <div class="kpi-sub">Gross ₹${formatRupeesFromMinor(totalAllAmountMinor)}</div>
            </div>
          </div>
          <div class="col-md-3 col-sm-6">
            <div class="kpi-box border-left-success">
              <div class="kpi-title text-success">Successful Recharges</div>
              <div class="kpi-value text-success">${totalSuccessOrders.toLocaleString('en-IN')}</div>
              <div class="kpi-sub">₹${formatRupeesFromMinor(totalSuccessAmountMinor)} (${totalAllOrders > 0 ? ((totalSuccessOrders/totalAllOrders)*100).toFixed(1) : 0}%)</div>
            </div>
          </div>
          <div class="col-md-3 col-sm-6">
            <div class="kpi-box border-left-danger">
              <div class="kpi-title text-danger">Refunded / Failed</div>
              <div class="kpi-value text-danger">${totalRefundOrders.toLocaleString('en-IN')}</div>
              <div class="kpi-sub">₹${formatRupeesFromMinor(totalRefundAmountMinor)} (${overallRefundRatio}%)</div>
            </div>
          </div>
          <div class="col-md-3 col-sm-6">
            <div class="kpi-box border-left-warning">
              <div class="kpi-title text-warning">Overall Refund Ratio</div>
              <div class="kpi-value ${parseFloat(overallRefundRatio) > 15 ? 'text-danger' : (parseFloat(overallRefundRatio) > 5 ? 'text-warning' : 'text-success')}">
                ${overallRefundRatio}%
              </div>
              <div class="kpi-sub">Amount Refunded: ${overallRefundAmountRatio}%</div>
            </div>
          </div>
        </div>

        <!-- Filters Section -->
        <section class="report-card">
          <div class="report-card-head">
            <span><i class="fa fa-filter mr-1"></i> Filter By Seller &amp; Operator</span>
            <small>Showing aggregated stats based on filters</small>
          </div>
          <div class="card-body p-3">
            <form method="get" action="/admin/reports/seller-refund-ratio">
              <div class="filter-grid">
                <div>
                  <label class="font-weight-bold text-muted small mb-1">Seller</label>
                  <select name="sellerId" class="form-control form-control-sm">
                    <option value="">All Sellers</option>
                    ${sellerOptions}
                  </select>
                </div>
                <div>
                  <label class="font-weight-bold text-muted small mb-1">Operator</label>
                  <select name="operatorId" class="form-control form-control-sm">
                    <option value="">All Operators</option>
                    ${operatorOptions}
                  </select>
                </div>
                <div>
                  <label class="font-weight-bold text-muted small mb-1">From Date</label>
                  <input type="date" name="from" class="form-control form-control-sm" value="${escapeHtml(filters.from)}">
                </div>
                <div>
                  <label class="font-weight-bold text-muted small mb-1">To Date</label>
                  <input type="date" name="to" class="form-control form-control-sm" value="${escapeHtml(filters.to)}">
                </div>
                <div class="d-flex align-items-center" style="gap: 6px;">
                  <button type="submit" class="btn btn-sm btn-primary flex-grow-1">
                    <i class="fa fa-search mr-1"></i> Search
                  </button>
                  <a href="/admin/reports/seller-refund-ratio" class="btn btn-sm btn-outline-secondary">
                    Reset
                  </a>
                </div>
              </div>
            </form>
          </div>
        </section>

        <!-- Data Table -->
        <section class="report-card">
          <div class="report-card-head">
            <span><i class="fa fa-table mr-1"></i> Seller &amp; Operator Breakdown</span>
            <span>${data.length} Combinations</span>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered table-striped table-sm mb-0">
              <thead>
                <tr>
                  <th style="width: 40px;">#</th>
                  <th>Seller</th>
                  <th>Operator</th>
                  <th class="text-right">Total Recharges</th>
                  <th class="text-right">Success</th>
                  <th class="text-right">Refunded / Failed</th>
                  <th class="text-right">Pending</th>
                  <th class="text-center" style="min-width: 140px;">Refund Count Ratio</th>
                  <th class="text-center" style="min-width: 140px;">Refund Amount Ratio</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
<script src="/auth-client.js"></script>
</body>
</html>`;

    const finalHtml = await addPanelChrome(html, {
      role: 'admin',
      userId: admin.id,
      db,
      currentPath: '/admin/reports/seller-refund-ratio',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
    });
    response.end(finalHtml);
  }

  return {
    sendAdminSellerRefundRatioReportPage,
  };
};
