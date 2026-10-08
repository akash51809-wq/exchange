'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminDailySalesReportPage({
  db,
  formatMinorUnits,
  decryptMobile,
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

  function formatRupeesFromMinor(minorValue) {
    const minor = BigInt(minorValue || 0);
    const sign = minor < 0n ? '-' : '';
    const absMinor = minor < 0n ? -minor : minor;
    const whole = absMinor / 100n;
    const cents = absMinor % 100n;
    return `${sign}${whole.toLocaleString('en-IN')}.${String(cents).padStart(2, '0')}`;
  }

  /**
   * Helper to build SQL WHERE clause for daily sales filtering
   */
  function buildSalesConditions(params) {
    const today = getTodayString();
    const fromDate = String(params.get('fromDate') || today).trim();
    const toDate = String(params.get('toDate') || today).trim();
    const partyName = String(params.get('partyName') || params.get('party') || '').trim();
    const operatorFilter = String(params.get('operator') || '').trim();
    const statusFilter = String(params.get('status') || 'successful').trim().toLowerCase();

    const conditions = [];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (fromDate) {
      conditions.push(`r.created_at >= (${add(fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (toDate) {
      conditions.push(`r.created_at < (((${add(toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (partyName) {
      const pLike = add(`%${partyName}%`);
      conditions.push(`(u.name ILIKE ${pLike} OR u.username ILIKE ${pLike} OR COALESCE(u.business_name, '') ILIKE ${pLike})`);
    }
    if (operatorFilter && operatorFilter !== 'all') {
      const opParam = add(operatorFilter);
      conditions.push(`(r.operator_code = ${opParam} OR r.operator_name ILIKE ${opParam} OR o.operator_name ILIKE ${opParam})`);
    }
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(`r.status = ${add(statusFilter)}`);
    }

    return {
      whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      values,
      fromDate,
      toDate,
      partyName,
      operatorFilter,
      statusFilter,
    };
  }

  /**
   * Stream filtered transactions or summaries as CSV
   */
  async function streamCsv(searchParams, response) {
    const filterInfo = buildSalesConditions(searchParams);
    const query = `
      SELECT r.id, r.created_at, r.amount_minor, r.cost_minor, r.margin_minor,
             r.status, r.mobile_number, r.mobile_ciphertext,
             COALESCE(o.operator_name, r.operator_name, r.operator_code, 'Unknown') AS op_name,
             r.circle_name, r.idempotency_key, r.provider_reference,
             u.name AS buyer_name, u.username AS buyer_username,
             COALESCE(s.name, s.username, 'System') AS seller_name
      FROM recharge_orders r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN users s ON s.id = r.seller_user_id
      LEFT JOIN operator_definitions o ON o.id = r.operator_id
      ${filterInfo.whereClause}
      ORDER BY r.created_at DESC
      LIMIT 10000
    `;

    const result = await db.query(query, filterInfo.values);
    const fileName = `daily_sales_report_${filterInfo.fromDate}_to_${filterInfo.toDate}.csv`;

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    });

    const csvHeader = [
      'Order ID',
      'Date Time (IST)',
      'Party (Buyer)',
      'Party Username',
      'Seller / Provider',
      'Operator',
      'Circle',
      'Mobile Number',
      'Amount (INR)',
      'Cost (INR)',
      'Margin (INR)',
      'Status',
      'Operator Ref / OPE ID',
      'Client Ref ID',
    ].join(',') + '\r\n';

    response.write(csvHeader);

    for (const row of result.rows) {
      let mobile = row.mobile_number || '';
      if (!mobile && row.mobile_ciphertext && decryptMobile) {
        try { mobile = decryptMobile(row.mobile_ciphertext); } catch (_) { mobile = '••••••••••'; }
      }
      const amount = (Number(row.amount_minor || 0) / 100).toFixed(2);
      const cost = (Number(row.cost_minor || 0) / 100).toFixed(2);
      const margin = (Number(row.margin_minor || 0) / 100).toFixed(2);
      const line = [
        `"RCH-${row.id.slice(0, 8).toUpperCase()}"`,
        `"${formatDateTime(row.created_at)}"`,
        `"${String(row.buyer_name || '').replace(/"/g, '""')}"`,
        `"${String(row.buyer_username || '').replace(/"/g, '""')}"`,
        `"${String(row.seller_name || '').replace(/"/g, '""')}"`,
        `"${String(row.op_name || '').replace(/"/g, '""')}"`,
        `"${String(row.circle_name || 'All').replace(/"/g, '""')}"`,
        `"${mobile}"`,
        amount,
        cost,
        margin,
        `"${String(row.status || '').toUpperCase()}"`,
        `"${String(row.provider_reference || '').replace(/"/g, '""')}"`,
        `"${String(row.idempotency_key || '').replace(/"/g, '""')}"`,
      ].join(',') + '\r\n';
      response.write(line);
    }
    response.end();
  }

  async function sendAdminDailySalesReportPage(admin, response, searchParams) {
    if (searchParams.get('export') === 'csv') {
      return streamCsv(searchParams, response);
    }

    const {
      whereClause,
      values,
      fromDate,
      toDate,
      partyName,
      operatorFilter,
      statusFilter,
    } = buildSalesConditions(searchParams);

    // 1. Fetch Operator-wise Summary
    const opQuery = `
      SELECT
        COALESCE(o.operator_name, r.operator_name, r.operator_code, 'Unknown') AS operator_display,
        r.operator_code,
        COUNT(r.id) AS total_count,
        COUNT(CASE WHEN r.status = 'successful' THEN 1 END) AS success_count,
        COALESCE(SUM(r.amount_minor), 0) AS total_amount_minor,
        COALESCE(SUM(CASE WHEN r.status = 'successful' THEN r.amount_minor ELSE 0 END), 0) AS success_amount_minor,
        COALESCE(SUM(CASE WHEN r.status = 'successful' THEN r.cost_minor ELSE 0 END), 0) AS total_cost_minor,
        COALESCE(SUM(CASE WHEN r.status = 'successful' THEN r.margin_minor ELSE 0 END), 0) AS total_margin_minor
      FROM recharge_orders r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN operator_definitions o ON o.id = r.operator_id
      ${whereClause}
      GROUP BY operator_display, r.operator_code
      ORDER BY success_amount_minor DESC, total_count DESC
    `;
    const opResult = await db.query(opQuery, values);

    // 2. Fetch Amount-wise (Denomination-wise) Summary
    const amtQuery = `
      SELECT
        r.amount_minor,
        COUNT(r.id) AS total_count,
        COUNT(CASE WHEN r.status = 'successful' THEN 1 END) AS success_count,
        COALESCE(SUM(r.amount_minor), 0) AS total_amount_minor,
        COALESCE(SUM(CASE WHEN r.status = 'successful' THEN r.amount_minor ELSE 0 END), 0) AS success_amount_minor,
        COALESCE(SUM(CASE WHEN r.status = 'successful' THEN r.margin_minor ELSE 0 END), 0) AS total_margin_minor
      FROM recharge_orders r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN operator_definitions o ON o.id = r.operator_id
      ${whereClause}
      GROUP BY r.amount_minor
      ORDER BY r.amount_minor ASC
    `;
    const amtResult = await db.query(amtQuery, values);

    // 3. Fetch Party-wise Summary
    const partyQuery = `
      SELECT
        u.id AS user_id,
        u.name AS party_name,
        u.username,
        u.business_name,
        u.role,
        COALESCE(w.balance_minor, 0) AS wallet_balance_minor,
        COUNT(r.id) AS total_count,
        COUNT(CASE WHEN r.status = 'successful' THEN 1 END) AS success_count,
        COALESCE(SUM(r.amount_minor), 0) AS total_amount_minor,
        COALESCE(SUM(CASE WHEN r.status = 'successful' THEN r.amount_minor ELSE 0 END), 0) AS success_amount_minor,
        COALESCE(SUM(CASE WHEN r.status = 'successful' THEN r.cost_minor ELSE 0 END), 0) AS total_cost_minor,
        COALESCE(SUM(CASE WHEN r.status = 'successful' THEN r.margin_minor ELSE 0 END), 0) AS total_margin_minor
      FROM recharge_orders r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN wallets w ON w.user_id = u.id AND w.currency = 'INR'
      LEFT JOIN operator_definitions o ON o.id = r.operator_id
      ${whereClause}
      GROUP BY u.id, u.name, u.username, u.business_name, u.role, w.balance_minor
      ORDER BY success_amount_minor DESC, total_count DESC
    `;
    const partyResult = await db.query(partyQuery, values);

    // 4. Fetch Detailed Orders (Recent 250 for interactive inspection)
    const ordersQuery = `
      SELECT
        r.id, r.created_at, r.amount_minor, r.cost_minor, r.margin_minor,
        r.status, r.mobile_number, r.mobile_ciphertext,
        COALESCE(o.operator_name, r.operator_name, r.operator_code, 'Unknown') AS op_name,
        r.circle_name, r.idempotency_key, r.provider_reference,
        u.name AS buyer_name, u.username AS buyer_username,
        COALESCE(s.name, s.username, 'Direct/None') AS seller_name
      FROM recharge_orders r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN users s ON s.id = r.seller_user_id
      LEFT JOIN operator_definitions o ON o.id = r.operator_id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT 250
    `;
    const ordersResult = await db.query(ordersQuery, values);

    // 5. Fetch distinct operators list for filter dropdown
    const distinctOpsResult = await db.query(`
      SELECT DISTINCT COALESCE(o.operator_name, r.operator_name, r.operator_code) as op_name, r.operator_code
      FROM recharge_orders r
      LEFT JOIN operator_definitions o ON o.id = r.operator_id
      WHERE r.operator_code IS NOT NULL
      ORDER BY op_name ASC
    `);

    // Compute Overall KPI Totals
    let grandTotalCount = 0;
    let grandSuccessCount = 0;
    let grandTotalAmountMinor = 0n;
    let grandSuccessAmountMinor = 0n;
    let grandCostMinor = 0n;
    let grandMarginMinor = 0n;

    for (const row of opResult.rows) {
      grandTotalCount += parseInt(row.total_count || 0, 10);
      grandSuccessCount += parseInt(row.success_count || 0, 10);
      grandTotalAmountMinor += BigInt(row.total_amount_minor || 0);
      grandSuccessAmountMinor += BigInt(row.success_amount_minor || 0);
      grandCostMinor += BigInt(row.total_cost_minor || 0);
      grandMarginMinor += BigInt(row.total_margin_minor || 0);
    }

    const successRate = grandTotalCount > 0
      ? ((grandSuccessCount / grandTotalCount) * 100).toFixed(1)
      : '0.0';

    // Build Operator Rows HTML
    const opRowsHtml = opResult.rows.map((row, idx) => {
      const totCount = parseInt(row.total_count || 0, 10);
      const succCount = parseInt(row.success_count || 0, 10);
      const succAmt = BigInt(row.success_amount_minor || 0);
      const totAmt = BigInt(row.total_amount_minor || 0);
      const margin = BigInt(row.total_margin_minor || 0);
      const cost = BigInt(row.total_cost_minor || 0);

      const opShare = grandSuccessAmountMinor > 0n
        ? ((Number(succAmt) / Number(grandSuccessAmountMinor)) * 100).toFixed(1) + '%'
        : '0%';

      const opRate = totCount > 0 ? ((succCount / totCount) * 100).toFixed(1) + '%' : '0%';

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <div class="d-flex align-items-center">
              <span class="avatar avatar-sm rounded mr-2 font-weight-bold text-white" style="background:#5969c9;width:28px;height:28px;font-size:11px;display:inline-flex;align-items:center;justify-content:center;">
                ${escapeHtml((row.operator_display || 'OP').slice(0, 2).toUpperCase())}
              </span>
              <div>
                <strong class="text-dark">${escapeHtml(row.operator_display)}</strong>
                <div class="small text-muted font-monospace">${escapeHtml(row.operator_code || '-')}</div>
              </div>
            </div>
          </td>
          <td class="text-center font-monospace font-weight-bold">${totCount}</td>
          <td class="text-center font-monospace text-success font-weight-bold">${succCount}</td>
          <td class="text-center">
            <span class="badge badge-pill badge-light border text-dark font-weight-bold">${opRate}</span>
          </td>
          <td class="text-right font-weight-bold text-dark font-monospace" style="font-size:13.5px;">₹${formatRupeesFromMinor(succAmt)}</td>
          <td class="text-right font-weight-bold text-muted font-monospace">₹${formatRupeesFromMinor(cost)}</td>
          <td class="text-right font-weight-bold text-success font-monospace">₹${formatRupeesFromMinor(margin)}</td>
          <td class="text-center">
            <div class="d-flex align-items-center justify-content-center" style="gap:6px;">
              <div class="progress progress-xs" style="width:50px;height:6px;">
                <div class="progress-bar bg-primary" style="width:${opShare}"></div>
              </div>
              <span class="small font-weight-bold text-primary">${opShare}</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Build Amount (Denomination) Rows HTML
    const amtRowsHtml = amtResult.rows.map((row, idx) => {
      const denom = BigInt(row.amount_minor || 0);
      const totCount = parseInt(row.total_count || 0, 10);
      const succCount = parseInt(row.success_count || 0, 10);
      const succAmt = BigInt(row.success_amount_minor || 0);
      const margin = BigInt(row.total_margin_minor || 0);

      const amtShare = grandSuccessAmountMinor > 0n
        ? ((Number(succAmt) / Number(grandSuccessAmountMinor)) * 100).toFixed(1) + '%'
        : '0%';

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <span class="badge badge-primary px-3 py-1 font-weight-bold text-monospace" style="font-size:13px;background:#4f46e5;">
              ₹${formatRupeesFromMinor(denom)}
            </span>
          </td>
          <td class="text-center font-monospace font-weight-bold">${totCount}</td>
          <td class="text-center font-monospace text-success font-weight-bold">${succCount}</td>
          <td class="text-right font-weight-bold text-dark font-monospace" style="font-size:13.5px;">₹${formatRupeesFromMinor(succAmt)}</td>
          <td class="text-right font-weight-bold text-success font-monospace">₹${formatRupeesFromMinor(margin)}</td>
          <td class="text-center">
            <div class="d-flex align-items-center justify-content-center" style="gap:6px;">
              <div class="progress progress-xs" style="width:50px;height:6px;">
                <div class="progress-bar bg-success" style="width:${amtShare}"></div>
              </div>
              <span class="small font-weight-bold text-success">${amtShare}</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Build Party Rows HTML
    const partyRowsHtml = partyResult.rows.map((row, idx) => {
      const totCount = parseInt(row.total_count || 0, 10);
      const succCount = parseInt(row.success_count || 0, 10);
      const succAmt = BigInt(row.success_amount_minor || 0);
      const cost = BigInt(row.total_cost_minor || 0);
      const margin = BigInt(row.total_margin_minor || 0);
      const walletBal = BigInt(row.wallet_balance_minor || 0);

      const partyShare = grandSuccessAmountMinor > 0n
        ? ((Number(succAmt) / Number(grandSuccessAmountMinor)) * 100).toFixed(1) + '%'
        : '0%';

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <div class="d-flex align-items-center">
              <span class="avatar avatar-sm rounded-circle mr-2 font-weight-bold text-white" style="background:linear-gradient(135deg, #10b981, #0284c7);width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;">
                ${escapeHtml((row.party_name || 'U').slice(0, 1).toUpperCase())}
              </span>
              <div>
                <strong class="text-dark">${escapeHtml(row.party_name || 'User')}</strong>
                <div class="small text-muted font-monospace">@${escapeHtml(row.username || '')}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="text-muted small">${escapeHtml(row.business_name || '—')}</span>
          </td>
          <td>
            <span class="badge badge-light border text-uppercase" style="font-size:10px;">${escapeHtml(row.role || 'user')}</span>
          </td>
          <td class="text-center font-monospace font-weight-bold">${totCount}</td>
          <td class="text-center font-monospace text-success font-weight-bold">${succCount}</td>
          <td class="text-right font-weight-bold text-dark font-monospace" style="font-size:13.5px;">₹${formatRupeesFromMinor(succAmt)}</td>
          <td class="text-right font-weight-bold text-muted font-monospace">₹${formatRupeesFromMinor(cost)}</td>
          <td class="text-right font-weight-bold text-success font-monospace">₹${formatRupeesFromMinor(margin)}</td>
          <td class="text-right font-monospace">
            <span class="badge badge-light border font-weight-bold text-primary">₹${formatRupeesFromMinor(walletBal)}</span>
          </td>
          <td class="text-center">
            <span class="small font-weight-bold text-primary">${partyShare}</span>
          </td>
        </tr>
      `;
    }).join('');

    // Build Detail Orders Rows HTML
    const detailRowsHtml = ordersResult.rows.map((row, idx) => {
      const amtMinor = BigInt(row.amount_minor || 0);
      const marginMinor = BigInt(row.margin_minor || 0);

      let mobile = row.mobile_number || '';
      if (!mobile && row.mobile_ciphertext && decryptMobile) {
        try { mobile = decryptMobile(row.mobile_ciphertext); } catch (_) { mobile = '••••••••••'; }
      }

      let statusBadge = '<span class="badge badge-secondary px-2 py-1">Unknown</span>';
      if (row.status === 'successful') {
        statusBadge = '<span class="badge badge-success px-2 py-1" style="background:#10b981;"><i class="fa fa-check-circle mr-1"></i> SUCCESS</span>';
      } else if (row.status === 'pending' || row.status === 'processing') {
        statusBadge = '<span class="badge badge-warning text-white px-2 py-1" style="background:#f59e0b;"><i class="fa fa-clock-o mr-1"></i> PENDING</span>';
      } else if (row.status === 'failed') {
        statusBadge = '<span class="badge badge-danger px-2 py-1" style="background:#ef4444;"><i class="fa fa-times-circle mr-1"></i> FAILED</span>';
      } else if (row.status === 'refunded') {
        statusBadge = '<span class="badge badge-info px-2 py-1" style="background:#0ea5e9;"><i class="fa fa-undo mr-1"></i> REFUNDED</span>';
      }

      const systemRechargeId = 'RCH-' + row.id.slice(0, 8).toUpperCase();

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <span class="badge badge-light border text-monospace font-weight-bold" style="font-size:11px;" title="${row.id}">
              ${systemRechargeId}
            </span>
          </td>
          <td class="small text-muted" style="white-space:nowrap;">${formatDateTime(row.created_at)}</td>
          <td>
            <strong class="text-dark">${escapeHtml(row.buyer_name || row.buyer_username)}</strong>
            <div class="small text-muted font-monospace">@${escapeHtml(row.buyer_username)}</div>
          </td>
          <td>
            <strong class="text-dark">${escapeHtml(row.op_name)}</strong>
            <div class="small text-muted">${escapeHtml(row.circle_name || 'All')}</div>
          </td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(mobile)}</td>
          <td class="text-right font-weight-bold font-monospace text-dark" style="font-size:13px;">₹${formatRupeesFromMinor(amtMinor)}</td>
          <td class="text-right font-weight-bold font-monospace text-success">₹${formatRupeesFromMinor(marginMinor)}</td>
          <td class="text-center">${statusBadge}</td>
          <td><small class="text-muted font-monospace">${escapeHtml(row.provider_reference || '-')}</small></td>
          <td><small class="text-secondary font-monospace">${escapeHtml(row.idempotency_key || '-')}</small></td>
        </tr>
      `;
    }).join('');

    // Operator Options for dropdown
    const opSelectOptions = distinctOpsResult.rows.map((op) => {
      const selected = operatorFilter === (op.operator_code || op.op_name) ? ' selected' : '';
      return `<option value="${escapeHtml(op.operator_code || op.op_name)}"${selected}>${escapeHtml(op.op_name)} (${escapeHtml(op.operator_code || 'N/A')})</option>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Daily Sales Report - Admin Panel</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 14px 18px 40px; }
    .kpi-card { border-radius: 8px; padding: 16px 18px; color: #fff; box-shadow: 0 3px 10px rgba(0,0,0,0.08); transition: transform 0.15s ease; }
    .kpi-card:hover { transform: translateY(-2px); }
    .kpi-title { font-size: 11.5px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.6px; opacity: 0.9; margin-bottom: 6px; }
    .kpi-value { font-size: 23px; font-weight: 800; line-height: 1.2; font-family: SFMono-Regular, Consolas, monospace; }
    .kpi-sub { font-size: 11.5px; opacity: 0.85; margin-top: 4px; }
    .card-panel { border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 2px 6px rgba(0,0,0,0.04); background: #fff; margin-bottom: 18px; }
    .card-panel-head { padding: 12px 18px; border-bottom: 1px solid #edf2f7; display: flex; align-items: center; justify-content: space-between; background: #fafbfc; }
    .nav-tabs-custom { border-bottom: 2px solid #e2e8f0; display: flex; gap: 4px; padding: 0 16px; background: #fff; border-radius: 8px 8px 0 0; }
    .nav-tabs-custom .nav-link { border: none; border-bottom: 3px solid transparent; color: #64748b; font-weight: 700; font-size: 13px; padding: 12px 18px; border-radius: 0; background: transparent; cursor: pointer; }
    .nav-tabs-custom .nav-link:hover { color: #4f46e5; }
    .nav-tabs-custom .nav-link.active { color: #4f46e5; border-bottom-color: #4f46e5; background: transparent; }
    .font-monospace { font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .table thead th { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; }
    .table td { vertical-align: middle; font-size: 12.5px; border-color: #f1f5f9; }
    .table tbody tr:hover { background-color: #f8fafc; }
    .badge-primary-soft { background: #e0e7ff; color: #4338ca; }
    .btn-quick-date { font-size: 11px; padding: 3px 8px; font-weight: 600; border-radius: 4px; }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    ${renderAdminNavigation('/admin/reports/daily-sales-report')}

    <main class="main-content">
      <div class="page-container">

        <!-- Page Header -->
        <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap" style="gap:10px;">
          <div>
            <h3 class="font-weight-bold text-dark mb-1">
              <i class="fa fa-line-chart text-primary mr-2"></i>Daily Sales Report
            </h3>
            <p class="text-muted mb-0 small">
              Comprehensive Operator-wise, Amount-wise, and Party-wise Daily Sales Analysis
            </p>
          </div>
          <div class="d-flex align-items-center" style="gap:8px;">
            <span class="badge badge-primary-soft border px-3 py-2 font-weight-bold" style="font-size:12px;">
              <i class="fa fa-calendar mr-1"></i> ${escapeHtml(fromDate)} ${fromDate !== toDate ? ' to ' + escapeHtml(toDate) : ''}
            </span>
            <a href="?${searchParams.toString()}&export=csv" class="btn btn-sm btn-outline-success font-weight-bold shadow-sm">
              <i class="fa fa-download mr-1"></i> Export CSV
            </a>
          </div>
        </div>

        <!-- Filter Card -->
        <section class="card-panel mb-3">
          <div class="card-panel-head">
            <span class="font-weight-bold text-dark">
              <i class="fa fa-filter text-primary mr-1"></i> Filter Daily Sales
            </span>
            <div class="d-flex align-items-center flex-wrap" style="gap:4px;">
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('today')">Today</button>
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('yesterday')">Yesterday</button>
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('last7')">Last 7 Days</button>
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('thismonth')">This Month</button>
            </div>
          </div>
          <div class="p-3">
            <form method="GET" action="/admin/reports/daily-sales-report" id="filterForm">
              <div class="form-row">
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterFromDate">From Date</label>
                  <input type="date" class="form-control form-control-sm" id="filterFromDate" name="fromDate" value="${escapeHtml(fromDate)}" required>
                </div>
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterToDate">To Date</label>
                  <input type="date" class="form-control form-control-sm" id="filterToDate" name="toDate" value="${escapeHtml(toDate)}" required>
                </div>
                <div class="form-group col-md-3 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterParty">Party Name / Username</label>
                  <input type="text" class="form-control form-control-sm" id="filterParty" name="partyName" value="${escapeHtml(partyName)}" placeholder="Search party or username...">
                </div>
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterOperator">Operator</label>
                  <select class="form-control form-control-sm" id="filterOperator" name="operator">
                    <option value="">All Operators</option>
                    ${opSelectOptions}
                  </select>
                </div>
                <div class="form-group col-md-1 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterStatus">Status</label>
                  <select class="form-control form-control-sm" id="filterStatus" name="status">
                    <option value="all"${statusFilter === 'all' ? ' selected' : ''}>All</option>
                    <option value="successful"${statusFilter === 'successful' ? ' selected' : ''}>Success</option>
                    <option value="pending"${statusFilter === 'pending' ? ' selected' : ''}>Pending</option>
                    <option value="failed"${statusFilter === 'failed' ? ' selected' : ''}>Failed</option>
                    <option value="refunded"${statusFilter === 'refunded' ? ' selected' : ''}>Refunded</option>
                  </select>
                </div>
                <div class="form-group col-md-2 col-sm-12 mb-2 d-flex align-items-end" style="gap:6px;">
                  <button type="submit" class="btn btn-primary btn-sm btn-block font-weight-bold">
                    <i class="fa fa-search mr-1"></i> Apply
                  </button>
                  <a href="/admin/reports/daily-sales-report" class="btn btn-outline-secondary btn-sm font-weight-bold">
                    Reset
                  </a>
                </div>
              </div>
            </form>
          </div>
        </section>

        <!-- KPI Summary Cards -->
        <div class="row mb-3">
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #4f46e5, #3730a3);">
              <div class="kpi-title"><i class="fa fa-shopping-cart mr-1"></i> Total Daily Sales</div>
              <div class="kpi-value">₹${formatRupeesFromMinor(grandSuccessAmountMinor)}</div>
              <div class="kpi-sub">${grandSuccessCount} successful of ${grandTotalCount} total recharges</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #059669, #047857);">
              <div class="kpi-title"><i class="fa fa-check-circle mr-1"></i> Success Volume &amp; Rate</div>
              <div class="kpi-value">${grandSuccessCount} <span style="font-size:15px;font-weight:600;">(${successRate}%)</span></div>
              <div class="kpi-sub">Total sales volume ₹${formatRupeesFromMinor(grandTotalAmountMinor)}</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #0284c7, #0369a1);">
              <div class="kpi-title"><i class="fa fa-money mr-1"></i> Admin Margin / Profit</div>
              <div class="kpi-value">₹${formatRupeesFromMinor(grandMarginMinor)}</div>
              <div class="kpi-sub">System net margin earned today</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #d97706, #b45309);">
              <div class="kpi-title"><i class="fa fa-users mr-1"></i> Active Operators &amp; Parties</div>
              <div class="kpi-value">${opResult.rowCount} <span style="font-size:15px;font-weight:600;">Ops / ${partyResult.rowCount} Parties</span></div>
              <div class="kpi-sub">Active network partners in selected period</div>
            </div>
          </div>
        </div>

        <!-- Navigation Tabs: Operator Wise / Amount Wise / Party Wise / All Orders -->
        <div class="card-panel mb-4">
          <ul class="nav-tabs-custom" id="reportTabs" role="tablist">
            <li class="nav-item">
              <a class="nav-link active" id="tab-operator-link" data-toggle="tab" href="#tab-operator" role="tab">
                <i class="fa fa-signal mr-1 text-primary"></i> Operator Wise (${opResult.rowCount})
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link" id="tab-amount-link" data-toggle="tab" href="#tab-amount" role="tab">
                <i class="fa fa-tags mr-1 text-success"></i> Amount Wise (${amtResult.rowCount})
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link" id="tab-party-link" data-toggle="tab" href="#tab-party" role="tab">
                <i class="fa fa-users mr-1 text-info"></i> Party Wise (${partyResult.rowCount})
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link" id="tab-orders-link" data-toggle="tab" href="#tab-orders" role="tab">
                <i class="fa fa-list mr-1 text-secondary"></i> All Daily Orders (${ordersResult.rowCount})
              </a>
            </li>
          </ul>

          <div class="tab-content p-3" id="reportTabsContent">

            <!-- TAB 1: Operator-wise Sale -->
            <div class="tab-pane fade show active" id="tab-operator" role="tabpanel">
              <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                <h6 class="font-weight-bold text-dark mb-0">
                  <i class="fa fa-pie-chart text-primary mr-1"></i> Operator-Wise Daily Sales Breakdown
                </h6>
                <span class="small text-muted">Showing all active operators</span>
              </div>
              <div class="table-responsive">
                <table class="table table-bordered table-striped table-hover mb-0">
                  <thead>
                    <tr>
                      <th class="text-center" style="width:50px;">#</th>
                      <th>Operator</th>
                      <th class="text-center">Total Txns</th>
                      <th class="text-center">Success Txns</th>
                      <th class="text-center">Success Rate</th>
                      <th class="text-right">Success Sales (₹)</th>
                      <th class="text-right">Total Cost (₹)</th>
                      <th class="text-right">Total Margin (₹)</th>
                      <th class="text-center" style="width:120px;">Sales Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${opRowsHtml || '<tr><td colspan="9" class="text-center py-4 text-muted font-weight-bold">No operator sales recorded for this date.</td></tr>'}
                  </tbody>
                  <tfoot>
                    <tr class="bg-light font-weight-bold">
                      <td colspan="2" class="text-center">GRAND TOTAL</td>
                      <td class="text-center font-monospace">${grandTotalCount}</td>
                      <td class="text-center font-monospace text-success">${grandSuccessCount}</td>
                      <td class="text-center">${successRate}%</td>
                      <td class="text-right font-monospace text-dark">₹${formatRupeesFromMinor(grandSuccessAmountMinor)}</td>
                      <td class="text-right font-monospace text-muted">₹${formatRupeesFromMinor(grandCostMinor)}</td>
                      <td class="text-right font-monospace text-success">₹${formatRupeesFromMinor(grandMarginMinor)}</td>
                      <td class="text-center">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- TAB 2: Amount-wise (Denomination-wise) Sale -->
            <div class="tab-pane fade" id="tab-amount" role="tabpanel">
              <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                <h6 class="font-weight-bold text-dark mb-0">
                  <i class="fa fa-tags text-success mr-1"></i> Amount-Wise / Denomination-Wise Daily Sales Breakdown
                </h6>
                <span class="small text-muted">Grouped by recharge package amount</span>
              </div>
              <div class="table-responsive">
                <table class="table table-bordered table-striped table-hover mb-0">
                  <thead>
                    <tr>
                      <th class="text-center" style="width:50px;">#</th>
                      <th>Denomination / Amount</th>
                      <th class="text-center">Total Recharges</th>
                      <th class="text-center">Success Recharges</th>
                      <th class="text-right">Total Success Sales (₹)</th>
                      <th class="text-right">Total Margin (₹)</th>
                      <th class="text-center" style="width:120px;">Share %</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${amtRowsHtml || '<tr><td colspan="7" class="text-center py-4 text-muted font-weight-bold">No amount sales recorded for this date.</td></tr>'}
                  </tbody>
                  <tfoot>
                    <tr class="bg-light font-weight-bold">
                      <td colspan="2" class="text-center">GRAND TOTAL</td>
                      <td class="text-center font-monospace">${grandTotalCount}</td>
                      <td class="text-center font-monospace text-success">${grandSuccessCount}</td>
                      <td class="text-right font-monospace text-dark">₹${formatRupeesFromMinor(grandSuccessAmountMinor)}</td>
                      <td class="text-right font-monospace text-success">₹${formatRupeesFromMinor(grandMarginMinor)}</td>
                      <td class="text-center">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- TAB 3: Party-wise Sale -->
            <div class="tab-pane fade" id="tab-party" role="tabpanel">
              <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                <h6 class="font-weight-bold text-dark mb-0">
                  <i class="fa fa-users text-info mr-1"></i> Party-Wise / Client-Wise Daily Sales Breakdown
                </h6>
                <span class="small text-muted">Showing all buyer parties and retailers</span>
              </div>
              <div class="table-responsive">
                <table class="table table-bordered table-striped table-hover mb-0">
                  <thead>
                    <tr>
                      <th class="text-center" style="width:50px;">#</th>
                      <th>Party Name / Username</th>
                      <th>Business Name</th>
                      <th>Role</th>
                      <th class="text-center">Total Txns</th>
                      <th class="text-center">Success Txns</th>
                      <th class="text-right">Total Sales (₹)</th>
                      <th class="text-right">Net Cost (₹)</th>
                      <th class="text-right">Margin (₹)</th>
                      <th class="text-right">Live Wallet (₹)</th>
                      <th class="text-center">Volume Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${partyRowsHtml || '<tr><td colspan="11" class="text-center py-4 text-muted font-weight-bold">No party sales recorded for this date.</td></tr>'}
                  </tbody>
                  <tfoot>
                    <tr class="bg-light font-weight-bold">
                      <td colspan="4" class="text-center">GRAND TOTAL</td>
                      <td class="text-center font-monospace">${grandTotalCount}</td>
                      <td class="text-center font-monospace text-success">${grandSuccessCount}</td>
                      <td class="text-right font-monospace text-dark">₹${formatRupeesFromMinor(grandSuccessAmountMinor)}</td>
                      <td class="text-right font-monospace text-muted">₹${formatRupeesFromMinor(grandCostMinor)}</td>
                      <td class="text-right font-monospace text-success">₹${formatRupeesFromMinor(grandMarginMinor)}</td>
                      <td colspan="2" class="text-center">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- TAB 4: Detailed Orders List -->
            <div class="tab-pane fade" id="tab-orders" role="tabpanel">
              <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                <h6 class="font-weight-bold text-dark mb-0">
                  <i class="fa fa-list text-secondary mr-1"></i> Daily Sales Transaction Orders
                </h6>
                <span class="small text-muted">Latest 250 orders matching filter</span>
              </div>
              <div class="table-responsive">
                <table class="table table-bordered table-striped table-hover mb-0">
                  <thead>
                    <tr>
                      <th class="text-center" style="width:45px;">#</th>
                      <th>Recharge ID</th>
                      <th>Date Time (IST)</th>
                      <th>Party (Buyer)</th>
                      <th>Operator &amp; Circle</th>
                      <th>Mobile Number</th>
                      <th class="text-right">Amount (₹)</th>
                      <th class="text-right">Margin (₹)</th>
                      <th class="text-center">Status</th>
                      <th>Provider Ref</th>
                      <th>Client Ref ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${detailRowsHtml || '<tr><td colspan="11" class="text-center py-4 text-muted font-weight-bold">No order records found for this period.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>

      </div>
    </main>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
<script src="/auth-client.js"></script>

<script>
  function setQuickDate(preset) {
    const today = new Date();
    const formatDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    };

    const fromInput = document.getElementById('filterFromDate');
    const toInput = document.getElementById('filterToDate');

    if (preset === 'today') {
      fromInput.value = formatDate(today);
      toInput.value = formatDate(today);
    } else if (preset === 'yesterday') {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      fromInput.value = formatDate(yest);
      toInput.value = formatDate(yest);
    } else if (preset === 'last7') {
      const last7 = new Date(today);
      last7.setDate(last7.getDate() - 6);
      fromInput.value = formatDate(last7);
      toInput.value = formatDate(today);
    } else if (preset === 'thismonth') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      fromInput.value = formatDate(startOfMonth);
      toInput.value = formatDate(today);
    }
    document.getElementById('filterForm').submit();
  }
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
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/reports/daily-sales-report' }));
  }

  return {
    sendAdminDailySalesReportPage,
  };
};
