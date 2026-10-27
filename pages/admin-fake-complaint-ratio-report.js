'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminFakeComplaintRatioReportPage({
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

  async function sendAdminFakeComplaintRatioReportPage(admin, response, searchParams) {
    const today = getTodayString();
    const filters = {
      buyerId: String(searchParams.get('buyerId') || searchParams.get('buyer') || '').trim(),
      operatorId: String(searchParams.get('operatorId') || searchParams.get('operator') || '').trim(),
      from: String(searchParams.get('from') || getMonthStartString()).trim(),
      to: String(searchParams.get('to') || today).trim(),
      download: String(searchParams.get('download') || '').trim().toLowerCase(),
    };

    // Date validation
    const validDate = (val) => /^\d{4}-\d{2}-\d{2}$/.test(val);
    if (filters.from && !validDate(filters.from)) filters.from = getMonthStartString();
    if (filters.to && !validDate(filters.to)) filters.to = today;

    // 1. Fetch Buyers and Operators for filter dropdowns
    const [buyersRes, operatorsRes] = await Promise.all([
      db.query(`
        SELECT DISTINCT u.id, u.username, u.name
        FROM users u
        WHERE u.role = 'user' AND u.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM recharge_orders r WHERE r.user_id = u.id)
        ORDER BY u.name ASC, u.username ASC
      `),
      db.query(`
        SELECT id, operator_name, operator_code, service_type
        FROM operator_definitions
        WHERE deleted_at IS NULL
        ORDER BY operator_name ASC
      `),
    ]);

    const buyersList = buyersRes.rows;
    const operatorsList = operatorsRes.rows;

    // 2. Build Query Conditions
    const where = ['r.user_id IS NOT NULL'];
    const values = [];
    const addParam = (val) => { values.push(val); return `$${values.length}`; };

    if (filters.buyerId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.buyerId)) {
      where.push(`r.user_id = ${addParam(filters.buyerId)}`);
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
        r.user_id AS buyer_user_id,
        COALESCE(u.name, u.username, 'Unknown Buyer') AS buyer_name,
        COALESCE(u.username, '—') AS buyer_username,
        r.operator_id,
        COALESCE(o.operator_name, 'Unknown Operator') AS operator_name,
        COALESCE(o.operator_code, '—') AS operator_code,
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(r.amount_minor), 0)::bigint AS total_amount_minor,
        COUNT(*) FILTER (WHERE r.status = 'success' OR r.dispute_status IN ('pending', 'rejected', 'accepted'))::int AS success_orders,
        COALESCE(SUM(r.amount_minor) FILTER (WHERE r.status = 'success' OR r.dispute_status IN ('pending', 'rejected', 'accepted')), 0)::bigint AS success_amount_minor,
        COUNT(*) FILTER (WHERE r.dispute_status IN ('pending', 'rejected', 'accepted') OR EXISTS (SELECT 1 FROM recharge_disputes d WHERE d.order_id = r.id))::int AS total_complaints,
        COALESCE(SUM(r.amount_minor) FILTER (WHERE r.dispute_status IN ('pending', 'rejected', 'accepted') OR EXISTS (SELECT 1 FROM recharge_disputes d WHERE d.order_id = r.id)), 0)::bigint AS total_complaint_amount_minor,
        COUNT(*) FILTER (WHERE r.dispute_status = 'rejected' OR EXISTS (SELECT 1 FROM recharge_disputes d WHERE d.order_id = r.id AND d.status = 'rejected'))::int AS fake_complaints,
        COALESCE(SUM(r.amount_minor) FILTER (WHERE r.dispute_status = 'rejected' OR EXISTS (SELECT 1 FROM recharge_disputes d WHERE d.order_id = r.id AND d.status = 'rejected')), 0)::bigint AS fake_complaint_amount_minor,
        COUNT(*) FILTER (WHERE r.dispute_status = 'accepted' OR EXISTS (SELECT 1 FROM recharge_disputes d WHERE d.order_id = r.id AND d.status = 'accepted'))::int AS accepted_complaints,
        COALESCE(SUM(r.amount_minor) FILTER (WHERE r.dispute_status = 'accepted' OR EXISTS (SELECT 1 FROM recharge_disputes d WHERE d.order_id = r.id AND d.status = 'accepted')), 0)::bigint AS accepted_complaint_amount_minor,
        COUNT(*) FILTER (WHERE r.dispute_status = 'pending' OR EXISTS (SELECT 1 FROM recharge_disputes d WHERE d.order_id = r.id AND d.status = 'pending'))::int AS pending_complaints
      FROM recharge_orders r
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN operator_definitions o ON o.id = r.operator_id
      WHERE ${where.join(' AND ')}
      GROUP BY r.user_id, u.name, u.username, r.operator_id, o.operator_name, o.operator_code
      ORDER BY fake_complaints DESC, total_complaints DESC, total_orders DESC
    `;

    const reportRes = await db.query(sql, values);
    const rows = reportRes.rows;

    // Aggregates for KPIs
    let totalAllOrders = 0;
    let totalAllAmountMinor = 0n;
    let totalSuccessOrders = 0;
    let totalSuccessAmountMinor = 0n;
    let totalComplaintsAll = 0;
    let totalComplaintAmountMinor = 0n;
    let totalFakeComplaints = 0;
    let totalFakeAmountMinor = 0n;
    let totalAcceptedComplaints = 0;
    let totalPendingComplaints = 0;

    const data = rows.map((row) => {
      const total = Number(row.total_orders || 0);
      const totalAmt = BigInt(row.total_amount_minor || 0);
      const succ = Number(row.success_orders || 0);
      const succAmt = BigInt(row.success_amount_minor || 0);
      const complaints = Number(row.total_complaints || 0);
      const complaintAmt = BigInt(row.total_complaint_amount_minor || 0);
      const fake = Number(row.fake_complaints || 0);
      const fakeAmt = BigInt(row.fake_complaint_amount_minor || 0);
      const accepted = Number(row.accepted_complaints || 0);
      const pending = Number(row.pending_complaints || 0);

      totalAllOrders += total;
      totalAllAmountMinor += totalAmt;
      totalSuccessOrders += succ;
      totalSuccessAmountMinor += succAmt;
      totalComplaintsAll += complaints;
      totalComplaintAmountMinor += complaintAmt;
      totalFakeComplaints += fake;
      totalFakeAmountMinor += fakeAmt;
      totalAcceptedComplaints += accepted;
      totalPendingComplaints += pending;

      // Fake Complaint % of all complaints raised
      const fakeRatioOfDisputes = complaints > 0 ? ((fake / complaints) * 100).toFixed(2) : '0.00';
      // Fake Complaint % of all successful recharges
      const fakeRatioOfSuccess = succ > 0 ? ((fake / succ) * 100).toFixed(2) : '0.00';

      return {
        ...row,
        total,
        totalAmt,
        succ,
        succAmt,
        complaints,
        complaintAmt,
        fake,
        fakeAmt,
        accepted,
        pending,
        fakeRatioOfDisputes,
        fakeRatioOfSuccess,
      };
    });

    // 3. Handle CSV / Excel Export
    if (filters.download === 'csv' || filters.download === 'excel') {
      const csvHeaders = [
        'Buyer Name',
        'Buyer Username',
        'Operator Name',
        'Operator Code',
        'Total Recharges',
        'Total Amount (INR)',
        'Success Recharges',
        'Success Amount (INR)',
        'Total Complaints Raised',
        'Complaint Amount (INR)',
        'Fake / Rejected Complaints',
        'Fake Complaint Amount (INR)',
        'Accepted Complaints',
        'Pending Complaints',
        'Fake Ratio (% of Complaints)',
        'Fake Ratio (% of Success)',
      ].join(',') + '\r\n';

      const csvLines = data.map((d) => [
        sanitizeCsv(d.buyer_name),
        sanitizeCsv(d.buyer_username),
        sanitizeCsv(d.operator_name),
        sanitizeCsv(d.operator_code),
        d.total,
        (Number(d.totalAmt) / 100).toFixed(2),
        d.succ,
        (Number(d.succAmt) / 100).toFixed(2),
        d.complaints,
        (Number(d.complaintAmt) / 100).toFixed(2),
        d.fake,
        (Number(d.fakeAmt) / 100).toFixed(2),
        d.accepted,
        d.pending,
        sanitizeCsv(d.fakeRatioOfDisputes + '%'),
        sanitizeCsv(d.fakeRatioOfSuccess + '%'),
      ].join(',')).join('\r\n');

      response.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="buyer-fake-complaint-ratio-${today}.csv"`,
        'cache-control': 'no-store',
      });
      response.end('\uFEFF' + csvHeaders + csvLines);
      return;
    }

    // 4. Render HTML Page
    const overallFakeRatioOfDisputes = totalComplaintsAll > 0
      ? ((totalFakeComplaints / totalComplaintsAll) * 100).toFixed(2)
      : '0.00';

    const overallFakeRatioOfSuccess = totalSuccessOrders > 0
      ? ((totalFakeComplaints / totalSuccessOrders) * 100).toFixed(2)
      : '0.00';

    const buildQueryString = (overrides = {}) => {
      const q = new URLSearchParams();
      if (filters.buyerId) q.set('buyerId', filters.buyerId);
      if (filters.operatorId) q.set('operatorId', filters.operatorId);
      if (filters.from) q.set('from', filters.from);
      if (filters.to) q.set('to', filters.to);
      for (const [k, v] of Object.entries(overrides)) {
        if (v) q.set(k, v); else q.delete(k);
      }
      return q.toString();
    };

    const excelDownloadUrl = `/admin/reports/fake-complaint-ratio?${buildQueryString({ download: 'csv' })}`;

    const buyerOptions = buyersList.map((b) => `
      <option value="${b.id}"${b.id === filters.buyerId ? ' selected' : ''}>
        ${escapeHtml(b.name)} (@${escapeHtml(b.username)})
      </option>
    `).join('');

    const operatorOptions = operatorsList.map((o) => `
      <option value="${o.id}"${o.id === filters.operatorId ? ' selected' : ''}>
        ${escapeHtml(o.operator_name)} (${escapeHtml(o.operator_code || '—')})
      </option>
    `).join('');

    const tableRows = data.length ? data.map((item, idx) => {
      const fakeDisputeRatioNum = parseFloat(item.fakeRatioOfDisputes);
      let badgeClass = 'badge-success';
      if (item.fake > 0 && fakeDisputeRatioNum > 30) badgeClass = 'badge-danger';
      else if (item.fake > 0) badgeClass = 'badge-warning';

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <strong>${escapeHtml(item.buyer_name)}</strong>
            <small class="d-block text-muted">@${escapeHtml(item.buyer_username)}</small>
          </td>
          <td>
            <strong>${escapeHtml(item.operator_name)}</strong>
            <span class="badge badge-light border ml-1">${escapeHtml(item.operator_code)}</span>
          </td>
          <td class="text-right text-success">
            <strong>${item.succ.toLocaleString('en-IN')}</strong>
            <small class="d-block text-muted">₹${formatRupeesFromMinor(item.succAmt)}</small>
          </td>
          <td class="text-right">
            <strong>${item.complaints.toLocaleString('en-IN')}</strong>
            <small class="d-block text-muted">₹${formatRupeesFromMinor(item.complaintAmt)}</small>
          </td>
          <td class="text-right text-danger font-weight-bold">
            <strong>${item.fake.toLocaleString('en-IN')}</strong>
            <small class="d-block text-danger font-weight-normal">₹${formatRupeesFromMinor(item.fakeAmt)}</small>
          </td>
          <td class="text-right text-info">
            ${item.accepted.toLocaleString('en-IN')}
          </td>
          <td class="text-right text-warning">
            ${item.pending.toLocaleString('en-IN')}
          </td>
          <td class="text-center">
            <span class="badge badge-pill ${badgeClass} font-weight-bold" style="font-size: 13px; padding: 6px 12px;">
              ${item.fakeRatioOfDisputes}%
            </span>
          </td>
          <td class="text-center font-weight-bold text-secondary">
            ${item.fakeRatioOfSuccess}%
          </td>
        </tr>
      `;
    }).join('') : `
      <tr>
        <td colspan="10" class="text-center py-5 text-muted">
          <i class="fa fa-info-circle fa-2x mb-2 text-secondary"></i>
          <p class="mb-0 font-weight-bold">No buyer complaint/recharge records found for the selected criteria.</p>
        </td>
      </tr>
    `;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Buyer &amp; Operator Fake Complaint Ratio Report - Exchange Admin</title>
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
            <h3 class="font-weight-bold text-primary mb-1">Buyer &amp; Operator Fake Complaint Ratio Report</h3>
            <p class="text-muted mb-0">बायर व ऑपरेटर अनुसार फेक कंप्लेंट और रिजेक्टेड डिस्प्यूट रेश्यो रिपोर्ट (Buyer-wise &amp; Operator-wise Fake Complaint Ratio)</p>
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
            <div class="kpi-box border-left-success">
              <div class="kpi-title text-success">Successful Recharges</div>
              <div class="kpi-value text-success">${totalSuccessOrders.toLocaleString('en-IN')}</div>
              <div class="kpi-sub">Total ₹${formatRupeesFromMinor(totalSuccessAmountMinor)}</div>
            </div>
          </div>
          <div class="col-md-3 col-sm-6">
            <div class="kpi-box border-left-primary">
              <div class="kpi-title text-primary">Complaints Raised</div>
              <div class="kpi-value text-primary">${totalComplaintsAll.toLocaleString('en-IN')}</div>
              <div class="kpi-sub">Disputed ₹${formatRupeesFromMinor(totalComplaintAmountMinor)}</div>
            </div>
          </div>
          <div class="col-md-3 col-sm-6">
            <div class="kpi-box border-left-danger">
              <div class="kpi-title text-danger">Fake Complaints (Rejected)</div>
              <div class="kpi-value text-danger">${totalFakeComplaints.toLocaleString('en-IN')}</div>
              <div class="kpi-sub">₹${formatRupeesFromMinor(totalFakeAmountMinor)}</div>
            </div>
          </div>
          <div class="col-md-3 col-sm-6">
            <div class="kpi-box border-left-warning">
              <div class="kpi-title text-warning">Fake Complaint Ratio</div>
              <div class="kpi-value ${parseFloat(overallFakeRatioOfDisputes) > 30 ? 'text-danger' : 'text-warning'}">
                ${overallFakeRatioOfDisputes}%
              </div>
              <div class="kpi-sub">On Success Orders: ${overallFakeRatioOfSuccess}%</div>
            </div>
          </div>
        </div>

        <!-- Filters Section -->
        <section class="report-card">
          <div class="report-card-head">
            <span><i class="fa fa-filter mr-1"></i> Filter By Buyer &amp; Operator</span>
            <small>Showing fake complaint frequency and percentages</small>
          </div>
          <div class="card-body p-3">
            <form method="get" action="/admin/reports/fake-complaint-ratio">
              <div class="filter-grid">
                <div>
                  <label class="font-weight-bold text-muted small mb-1">Buyer</label>
                  <select name="buyerId" class="form-control form-control-sm">
                    <option value="">All Buyers</option>
                    ${buyerOptions}
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
                  <a href="/admin/reports/fake-complaint-ratio" class="btn btn-sm btn-outline-secondary">
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
            <span><i class="fa fa-table mr-1"></i> Buyer &amp; Operator Fake Complaint Breakdown</span>
            <span>${data.length} Combinations</span>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered table-striped table-sm mb-0">
              <thead>
                <tr>
                  <th style="width: 40px;">#</th>
                  <th>Buyer</th>
                  <th>Operator</th>
                  <th class="text-right">Successful Recharges</th>
                  <th class="text-right">Complaints Raised</th>
                  <th class="text-right text-danger">Fake / Rejected</th>
                  <th class="text-right text-info">Accepted</th>
                  <th class="text-right text-warning">Pending</th>
                  <th class="text-center" style="min-width: 140px;">Fake Ratio (% of Complaints)</th>
                  <th class="text-center" style="min-width: 140px;">Fake on Success (%)</th>
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
      currentPath: '/admin/reports/fake-complaint-ratio',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
    });
    response.end(finalHtml);
  }

  return {
    sendAdminFakeComplaintRatioReportPage,
  };
};
