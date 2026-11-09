'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminDashboardPage({
  db,
  formatMinorUnits,
  sendJson,
  httpError,
}) {

  function getTodayRangeIST() {
    const now = new Date();
    const istDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const startOfDay = `${istDateStr} 00:00:00+05:30`;
    const endOfDay = `${istDateStr} 23:59:59.999+05:30`;
    return { istDateStr, startOfDay, endOfDay };
  }

  function formatRupeesFromMinor(minorValue) {
    if (typeof formatMinorUnits === 'function') {
      return formatMinorUnits(minorValue);
    }
    const minor = BigInt(minorValue || 0);
    const sign = minor < 0n ? '-' : '';
    const abs = minor < 0n ? -minor : minor;
    const whole = abs / 100n;
    const cents = abs % 100n;
    return `${sign}${whole.toLocaleString('en-IN')}.${String(cents).padStart(2, '0')}`;
  }

  function getOperatorColor(opName = '') {
    const n = String(opName).toLowerCase();
    if (n.includes('jio')) return '#0f52ba';
    if (n.includes('airtel')) return '#ea1d24';
    if (n.includes('vi') || n.includes('vodafone') || n.includes('idea')) return '#e60000';
    if (n.includes('bsnl')) return '#00833e';
    if (n.includes('dish') || n.includes('dth')) return '#f37021';
    if (n.includes('tata') || n.includes('play')) return '#68217a';
    return '#475569';
  }

  async function sendAdminDashboardPage(admin, response, searchParams = new URLSearchParams()) {
    const { istDateStr, startOfDay, endOfDay } = getTodayRangeIST();

    // 1. Parallel DB queries for all metrics
    const [
      pendingRechargeRes,
      pendingComplaintRes,
      pendingFundRes,
      pendingPayoutRes,
      pendingKycRes,
      pendingBankRes,
      todayTxnsRes,
      todayRedeemRes,
      operatorSummaryRes,
      pendingSellerApiRes,
      recentSellerApiRes,
    ] = await Promise.all([
      // 1. Pending Recharge
      db.query(`
        SELECT
          COUNT(*)::int AS count,
          COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor
        FROM recharge_orders
        WHERE UPPER(status) IN ('PENDING', 'IN_PROCESS')
      `).catch(() => ({ rows: [{ count: 0, amount_minor: 0 }] })),

      // 2. Pending Complaint / Dispute
      db.query(`
        SELECT
          COUNT(*)::int AS count,
          COALESCE(SUM(r.amount_minor), 0)::bigint AS amount_minor
        FROM recharge_orders r
        LEFT JOIN recharge_disputes d ON d.order_id = r.id
        WHERE (r.dispute_status IS NOT NULL AND LOWER(r.dispute_status) = 'pending')
           OR (d.id IS NOT NULL AND LOWER(COALESCE(d.status, 'pending')) = 'pending' AND (r.dispute_status IS NULL OR LOWER(r.dispute_status) = 'pending'))
      `).catch(() => ({ rows: [{ count: 0, amount_minor: 0 }] })),

      // 3. Pending Payment (Fund Requests)
      db.query(`
        SELECT
          COUNT(*)::int AS count,
          COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor
        FROM wallet_fund_requests
        WHERE LOWER(status) = 'pending'
      `).catch(() => ({ rows: [{ count: 0, amount_minor: 0 }] })),

      // 4. Pending Payout Requests
      db.query(`
        SELECT
          COUNT(*)::int AS count,
          COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor
        FROM payout_requests
        WHERE LOWER(status) = 'pending'
      `).catch(() => ({ rows: [{ count: 0, amount_minor: 0 }] })),

      // 5. Pending KYC
      db.query(`
        SELECT
          COUNT(*)::int AS count
        FROM user_kyc
        WHERE LOWER(status) = 'pending'
      `).catch(() => ({ rows: [{ count: 0 }] })),

      // 6. Pending Bank Approval
      db.query(`
        SELECT
          COUNT(*)::int AS count
        FROM user_bank_accounts
        WHERE LOWER(status) = 'pending'
      `).catch(() => ({ rows: [{ count: 0 }] })),

      // 7. Today Recharge Transactions & Purchase
      db.query(`
        SELECT
          COUNT(*)::int AS total_txns,
          COALESCE(SUM(amount_minor), 0)::bigint AS total_volume_minor,
          COUNT(*) FILTER (WHERE UPPER(status) = 'SUCCESS')::int AS success_txns,
          COALESCE(SUM(amount_minor) FILTER (WHERE UPPER(status) = 'SUCCESS'), 0)::bigint AS success_volume_minor,
          COUNT(*) FILTER (WHERE UPPER(status) IN ('PENDING', 'IN_PROCESS'))::int AS pending_txns,
          COALESCE(SUM(amount_minor) FILTER (WHERE UPPER(status) IN ('PENDING', 'IN_PROCESS')), 0)::bigint AS pending_volume_minor,
          COUNT(*) FILTER (WHERE UPPER(status) = 'FAILED')::int AS failed_txns,
          COALESCE(SUM(amount_minor) FILTER (WHERE UPPER(status) = 'FAILED'), 0)::bigint AS failed_volume_minor,
          COALESCE(SUM(cost_minor) FILTER (WHERE UPPER(status) = 'SUCCESS'), 0)::bigint AS purchase_cost_minor,
          COALESCE(SUM(margin_minor) FILTER (WHERE UPPER(status) = 'SUCCESS'), 0)::bigint AS purchase_margin_minor,
          COUNT(DISTINCT user_id) FILTER (WHERE UPPER(status) = 'SUCCESS')::int AS active_buyers
        FROM recharge_orders
        WHERE created_at >= $1 AND created_at <= $2
      `, [startOfDay, endOfDay]).catch(() => ({ rows: [{
        total_txns: 0, total_volume_minor: 0,
        success_txns: 0, success_volume_minor: 0,
        pending_txns: 0, pending_volume_minor: 0,
        failed_txns: 0, failed_volume_minor: 0,
        purchase_cost_minor: 0, purchase_margin_minor: 0,
        active_buyers: 0,
      }] })),

      // 8. Today Redeem (Payout Requests)
      db.query(`
        SELECT
          COUNT(*)::int AS total_requests,
          COALESCE(SUM(amount_minor), 0)::bigint AS total_volume_minor,
          COUNT(*) FILTER (WHERE LOWER(status) = 'success')::int AS processed_count,
          COALESCE(SUM(amount_minor) FILTER (WHERE LOWER(status) = 'success'), 0)::bigint AS processed_volume_minor,
          COUNT(*) FILTER (WHERE LOWER(status) = 'pending')::int AS pending_count,
          COALESCE(SUM(amount_minor) FILTER (WHERE LOWER(status) = 'pending'), 0)::bigint AS pending_volume_minor,
          COUNT(*) FILTER (WHERE LOWER(status) = 'rejected')::int AS rejected_count,
          COALESCE(SUM(amount_minor) FILTER (WHERE LOWER(status) = 'rejected'), 0)::bigint AS rejected_volume_minor
        FROM payout_requests
        WHERE created_at >= $1 AND created_at <= $2
      `, [startOfDay, endOfDay]).catch(() => ({ rows: [{
        total_requests: 0, total_volume_minor: 0,
        processed_count: 0, processed_volume_minor: 0,
        pending_count: 0, pending_volume_minor: 0,
        rejected_count: 0, rejected_volume_minor: 0,
      }] })),

      // 9. Today Operator-wise Summary
      db.query(`
        SELECT
          COALESCE(o.operator_name, r.operator_name, r.operator_code, 'Unknown') AS op_name,
          COALESCE(o.service_type, 'Prepaid') AS service_type,
          COUNT(*)::int AS total_count,
          COALESCE(SUM(r.amount_minor), 0)::bigint AS total_val,
          COUNT(*) FILTER (WHERE UPPER(r.status) = 'SUCCESS')::int AS success_count,
          COALESCE(SUM(r.amount_minor) FILTER (WHERE UPPER(r.status) = 'SUCCESS'), 0)::bigint AS success_val,
          COUNT(*) FILTER (WHERE UPPER(r.status) = 'FAILED')::int AS failed_count,
          COUNT(*) FILTER (WHERE UPPER(r.status) IN ('PENDING', 'IN_PROCESS'))::int AS pending_count,
          COALESCE(SUM(r.margin_minor) FILTER (WHERE UPPER(r.status) = 'SUCCESS'), 0)::bigint AS margin_val
        FROM recharge_orders r
        LEFT JOIN operator_definitions o ON o.id = r.operator_id
        WHERE r.created_at >= $1 AND r.created_at <= $2
        GROUP BY 1, 2
        ORDER BY total_val DESC
      `, [startOfDay, endOfDay]).catch(() => ({ rows: [] })),

      // 10. Pending & In Progress Seller API Requests
      db.query(`
        SELECT
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE LOWER(status) = 'pending')::int AS pending_count,
          COUNT(*) FILTER (WHERE LOWER(status) = 'in_progress')::int AS in_progress_count
        FROM seller_api_integration_requests
        WHERE LOWER(status) IN ('pending', 'in_progress')
      `).catch(() => ({ rows: [{ count: 0, pending_count: 0, in_progress_count: 0 }] })),

      // 11. Recent Seller API Requests for Dashboard Widget
      db.query(`
        SELECT ir.id, ir.user_id, ir.api_website, ir.api_username, ir.status, ir.created_at,
               u.name AS user_name, u.username AS user_username
        FROM seller_api_integration_requests ir
        JOIN users u ON u.id = ir.user_id
        ORDER BY 
          CASE WHEN ir.status = 'pending' THEN 0 WHEN ir.status = 'in_progress' THEN 1 ELSE 2 END,
          ir.created_at DESC
        LIMIT 5
      `).catch(() => ({ rows: [] })),
    ]);

    // Data extraction
    const pRecharge = pendingRechargeRes.rows[0] || { count: 0, amount_minor: 0 };
    const pComplaint = pendingComplaintRes.rows[0] || { count: 0, amount_minor: 0 };
    const pFund = pendingFundRes.rows[0] || { count: 0, amount_minor: 0 };
    const pPayout = pendingPayoutRes.rows[0] || { count: 0, amount_minor: 0 };
    const pKyc = pendingKycRes.rows[0] || { count: 0 };
    const pBank = pendingBankRes.rows[0] || { count: 0 };
    const pSellerApi = (pendingSellerApiRes && pendingSellerApiRes.rows[0]) || { count: 0, pending_count: 0, in_progress_count: 0 };
    const recentSellerApiRows = (recentSellerApiRes && recentSellerApiRes.rows) || [];

    const todayTxn = todayTxnsRes.rows[0] || {};
    const totalTxns = Number(todayTxn.total_txns || 0);
    const totalVolMinor = BigInt(todayTxn.total_volume_minor || 0);
    const successTxns = Number(todayTxn.success_txns || 0);
    const successVolMinor = BigInt(todayTxn.success_volume_minor || 0);
    const pendingTxns = Number(todayTxn.pending_txns || 0);
    const pendingVolMinor = BigInt(todayTxn.pending_volume_minor || 0);
    const failedTxns = Number(todayTxn.failed_txns || 0);
    const failedVolMinor = BigInt(todayTxn.failed_volume_minor || 0);
    const purchaseCostMinor = BigInt(todayTxn.purchase_cost_minor || 0);
    const purchaseMarginMinor = BigInt(todayTxn.purchase_margin_minor || 0);
    const activeBuyers = Number(todayTxn.active_buyers || 0);

    const txnSuccessRate = totalTxns > 0 ? ((successTxns * 100) / totalTxns).toFixed(1) : '0.0';
    const marginPercent = successVolMinor > 0n ? (Number(purchaseMarginMinor * 10000n / successVolMinor) / 100).toFixed(2) : '0.00';

    const todayRedeem = todayRedeemRes.rows[0] || {};
    const totalRedeemCount = Number(todayRedeem.total_requests || 0);
    const totalRedeemVolMinor = BigInt(todayRedeem.total_volume_minor || 0);
    const processedRedeemCount = Number(todayRedeem.processed_count || 0);
    const processedRedeemVolMinor = BigInt(todayRedeem.processed_volume_minor || 0);
    const pendingRedeemCount = Number(todayRedeem.pending_count || 0);
    const pendingRedeemVolMinor = BigInt(todayRedeem.pending_volume_minor || 0);
    const rejectedRedeemCount = Number(todayRedeem.rejected_count || 0);
    const rejectedRedeemVolMinor = BigInt(todayRedeem.rejected_volume_minor || 0);

    // Operator rows processing
    const operatorRows = operatorSummaryRes.rows || [];
    let grandOpTotalCount = 0;
    let grandOpTotalValMinor = 0n;
    let grandOpSuccessCount = 0;
    let grandOpSuccessValMinor = 0n;
    let grandOpMarginMinor = 0n;

    for (const r of operatorRows) {
      grandOpTotalCount += Number(r.total_count || 0);
      grandOpTotalValMinor += BigInt(r.total_val || 0);
      grandOpSuccessCount += Number(r.success_count || 0);
      grandOpSuccessValMinor += BigInt(r.success_val || 0);
      grandOpMarginMinor += BigInt(r.margin_val || 0);
    }

    const opTableHtml = operatorRows.length === 0 ? `
      <tr>
        <td colspan="8" class="text-center text-muted py-3">
          <i class="fa fa-info-circle mr-1"></i> No transactions recorded yet for today (${escapeHtml(istDateStr)}). Live operator statistics will populate automatically as recharges are processed.
        </td>
      </tr>
    ` : operatorRows.map((op, idx) => {
      const opCount = Number(op.total_count || 0);
      const opValMinor = BigInt(op.total_val || 0);
      const opSuccessCount = Number(op.success_count || 0);
      const opSuccessValMinor = BigInt(op.success_val || 0);
      const opMarginMinor = BigInt(op.margin_val || 0);

      const sharePct = grandOpTotalValMinor > 0n
        ? (Number(opValMinor * 10000n / grandOpTotalValMinor) / 100).toFixed(1)
        : '0.0';
      const successPct = opCount > 0 ? ((opSuccessCount * 100) / opCount).toFixed(1) : '0.0';
      const avgTicketRupees = opCount > 0 ? (Number(opValMinor) / (opCount * 100)).toFixed(2) : '0.00';
      const opMarginPct = opSuccessValMinor > 0n
        ? (Number(opMarginMinor * 10000n / opSuccessValMinor) / 100).toFixed(2)
        : '0.00';
      const opColor = getOperatorColor(op.op_name);

      return `
        <tr>
          <td class="text-center text-muted font-weight-bold" style="width:36px;">${idx + 1}</td>
          <td>
            <div class="d-flex align-items-center">
              <span class="operator-badge-dot" style="background-color: ${opColor};"></span>
              <div>
                <strong class="text-dark">${escapeHtml(op.op_name)}</strong>
                <span class="badge badge-light border text-muted ml-1" style="font-size:10px;">${escapeHtml(op.service_type)}</span>
              </div>
            </div>
          </td>
          <td class="text-right font-weight-bold">${opCount.toLocaleString('en-IN')}</td>
          <td class="text-right font-weight-bold text-primary">₹${formatRupeesFromMinor(opValMinor)}</td>
          <td>
            <div class="d-flex align-items-center justify-content-between">
              <span class="font-weight-bold mr-2">${sharePct}%</span>
              <div class="progress flex-grow-1" style="height: 6px; background:#e2e8f0; border-radius:3px;">
                <div class="progress-bar" style="width: ${sharePct}%; background-color: ${opColor}; border-radius:3px;"></div>
              </div>
            </div>
          </td>
          <td class="text-right">
            <span class="badge badge-${Number(successPct) >= 90 ? 'success' : (Number(successPct) >= 70 ? 'warning' : 'danger')}" style="font-size:11px;">
              ${opSuccessCount} (${successPct}%)
            </span>
          </td>
          <td class="text-right font-weight-bold text-dark">₹${avgTicketRupees}</td>
          <td class="text-right">
            <span class="text-success font-weight-bold">₹${formatRupeesFromMinor(opMarginMinor)}</span>
            <small class="text-muted d-block" style="font-size:10.5px;">(${opMarginPct}%)</small>
          </td>
        </tr>
      `;
    }).join('');

    const grandSuccessPct = grandOpTotalCount > 0 ? ((grandOpSuccessCount * 100) / grandOpTotalCount).toFixed(1) : '0.0';
    const grandAvgTicket = grandOpTotalCount > 0 ? (Number(grandOpTotalValMinor) / (grandOpTotalCount * 100)).toFixed(2) : '0.00';
    const grandMarginPct = grandOpSuccessValMinor > 0n ? (Number(grandOpMarginMinor * 10000n / grandOpSuccessValMinor) / 100).toFixed(2) : '0.00';

    const recentSellerApiHtml = recentSellerApiRows.length > 0
      ? recentSellerApiRows.map((r, i) => {
        let badge = '<span class="badge badge-warning text-dark px-2 py-1"><i class="fa fa-clock-o mr-1"></i> Pending</span>';
        if (r.status === 'in_progress') {
          badge = '<span class="badge badge-info px-2 py-1"><i class="fa fa-spinner fa-spin mr-1"></i> In Progress</span>';
        } else if (r.status === 'approved') {
          badge = '<span class="badge badge-success px-2 py-1"><i class="fa fa-check-circle mr-1"></i> Approved</span>';
        } else if (r.status === 'rejected') {
          badge = '<span class="badge badge-danger px-2 py-1"><i class="fa fa-times-circle mr-1"></i> Rejected</span>';
        }
        const createdStr = new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
        return `<tr>
          <td class="text-center font-weight-bold text-muted">${i + 1}</td>
          <td>
            <div class="font-weight-bold text-dark">${escapeHtml(r.user_name || 'Client User')}</div>
            <div class="text-muted small">${escapeHtml(r.user_username)}</div>
          </td>
          <td>
            <span class="font-monospace text-primary text-truncate d-inline-block font-weight-bold" style="max-width:220px;" title="${escapeHtml(r.api_website)}">
              ${escapeHtml(r.api_website)}
            </span>
            ${r.api_username ? `<div class="text-muted small">Username: ${escapeHtml(r.api_username)}</div>` : ''}
          </td>
          <td>${badge}</td>
          <td class="small text-muted text-nowrap"><i class="fa fa-clock-o mr-1"></i>${escapeHtml(createdStr)}</td>
          <td class="text-center">
            <a href="/admin/seller-api/requests" class="btn btn-xs btn-outline-primary py-0 px-2" title="Process Integration Request">
              Review &rarr;
            </a>
          </td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="6" class="text-center py-3 text-muted"><i class="fa fa-plug fa-lg mr-2 text-muted"></i>No active seller API integration requests.</td></tr>';

    const rawHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <title>Admin Live Dashboard - Recharge Exchange</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/iconfonts/font-awesome/css/font-awesome.min.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <style>
    :root {
      --primary-color: #2563eb;
      --card-bg: #ffffff;
      --border-color: #e2e8f0;
      --text-muted: #64748b;
    }
    body {
      background-color: #f8fafc !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      color: #1e293b;
      overflow-x: hidden;
    }
    .page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .dashboard-container {
      padding: 8px 12px 14px 12px;
      max-width: 100%;
    }
    .top-command-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #ffffff;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 6px 14px;
      margin-bottom: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .top-command-bar h1 {
      font-size: 15px;
      font-weight: 800;
      margin: 0;
      letter-spacing: -0.2px;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .live-indicator {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 700;
      color: #059669;
      background: #ecfdf5;
      padding: 2px 8px;
      border-radius: 20px;
      border: 1px solid #a7f3d0;
    }
    .pulse-dot {
      width: 7px;
      height: 7px;
      background-color: #10b981;
      border-radius: 50%;
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    .btn-refresh {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      color: #334155;
      font-weight: 700;
      font-size: 11.5px;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-refresh:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    /* Pending Row Grid - 7 columns compact */
    .pending-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 8px;
      margin-bottom: 8px;
    }
    .pending-tile {
      background: #ffffff;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 7px 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
      position: relative;
      transition: transform 0.15s, box-shadow 0.15s;
      text-decoration: none !important;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 72px;
    }
    .pending-tile:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 10px rgba(0,0,0,0.08);
    }
    .pending-tile-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .pending-tile-title {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #475569;
    }
    .pending-tile-icon {
      font-size: 13px;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pending-tile-bottom {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-top: 4px;
    }
    .pending-count-badge {
      font-size: 18px;
      font-weight: 800;
      line-height: 1;
    }
    .pending-tile-sub {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 65%;
      text-align: right;
    }

    /* Today 3 Core Cards Grid */
    .core-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 8px;
    }
    .core-card {
      background: #ffffff;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
      position: relative;
    }
    .core-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .core-card-title {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .core-main-stat {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .core-big-rupee {
      font-size: 21px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.1;
    }
    .core-big-count {
      font-size: 12.5px;
      font-weight: 700;
      color: #475569;
    }
    .core-pill-row {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-top: 6px;
    }
    .core-mini-pill {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 10.5px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: 1 1 auto;
      justify-content: center;
    }

    /* Operator Summary Table Section */
    .operator-card {
      background: #ffffff;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 8px 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .operator-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      padding-bottom: 5px;
      border-bottom: 1px solid #f1f5f9;
    }
    .operator-title {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #0f172a;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .operator-table-container {
      max-height: calc(100vh - 355px);
      min-height: 180px;
      overflow-y: auto;
    }
    .table-compact {
      margin-bottom: 0;
      font-size: 11.5px;
    }
    .table-compact th {
      background: #f8fafc !important;
      color: #475569;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 5px 8px !important;
      border-top: none !important;
      position: sticky;
      top: 0;
      z-index: 5;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .table-compact td {
      padding: 5px 8px !important;
      vertical-align: middle !important;
      border-top: 1px solid #f1f5f9 !important;
    }
    .table-compact tfoot td {
      background: #f8fafc !important;
      font-weight: 800;
      border-top: 2px solid #cbd5e1 !important;
      font-size: 11.5px;
    }
    .operator-badge-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 6px;
      flex-shrink: 0;
    }

    /* Responsiveness */
    @media (max-width: 1400px) {
      .pending-grid { grid-template-columns: repeat(4, 1fr); }
    }
    @media (max-width: 992px) {
      .pending-grid { grid-template-columns: repeat(3, 1fr); }
      .core-grid { grid-template-columns: 1fr; }
      .operator-table-container { max-height: 400px; }
    }
    @media (max-width: 768px) {
      .pending-grid { grid-template-columns: repeat(2, 1fr); }
      .top-command-bar { flex-direction: column; align-items: flex-start; gap: 6px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${renderAdminNavigation('/admin/')}

      <main class="main-content">
        <div class="container-fluid dashboard-container">

          <!-- Command Header Bar -->
          <div class="top-command-bar">
            <div>
              <h1><i class="fa fa-tachometer text-primary"></i> Admin Dashboard &amp; Live Command Center</h1>
            </div>
            <div class="d-flex align-items-center gap-2">
              <span class="live-indicator"><span class="pulse-dot"></span> LIVE IST &bull; ${escapeHtml(istDateStr)}</span>
              <span class="text-muted font-weight-bold ml-2 mr-2" style="font-size: 11.5px;" id="liveClock"></span>
              <button class="btn-refresh" onclick="location.reload();" title="Refresh dashboard data">
                <i class="fa fa-refresh mr-1"></i> Refresh
              </button>
            </div>
          </div>

          <!-- 1. PENDING METRICS ROW (6 Items) -->
          <div class="pending-grid">
            <!-- 1. Pending Recharge -->
            <a href="/admin/reports/pending-recharge" class="pending-tile" style="border-top: 3px solid #f59e0b;" title="View Pending Recharge Orders">
              <div class="pending-tile-top">
                <span class="pending-tile-title">Pending Recharge</span>
                <span class="pending-tile-icon" style="background:#fef3c7; color:#d97706;"><i class="fa fa-bolt"></i></span>
              </div>
              <div class="pending-tile-bottom">
                <span class="pending-count-badge ${pRecharge.count > 0 ? 'text-warning' : 'text-dark'}">${pRecharge.count}</span>
                <span class="pending-tile-sub">₹${formatRupeesFromMinor(pRecharge.amount_minor)}</span>
              </div>
            </a>

            <!-- 2. Pending Complain -->
            <a href="/admin/reports/complaint?status=pending" class="pending-tile" style="border-top: 3px solid #ef4444;" title="View Pending Complaints &amp; Disputes">
              <div class="pending-tile-top">
                <span class="pending-tile-title">Pending Complain</span>
                <span class="pending-tile-icon" style="background:#fee2e2; color:#dc2626;"><i class="fa fa-exclamation-triangle"></i></span>
              </div>
              <div class="pending-tile-bottom">
                <span class="pending-count-badge ${pComplaint.count > 0 ? 'text-danger' : 'text-dark'}">${pComplaint.count}</span>
                <span class="pending-tile-sub">₹${formatRupeesFromMinor(pComplaint.amount_minor)}</span>
              </div>
            </a>

            <!-- 3. Pending Payment (Fund Requests) -->
            <a href="/admin/payment/fund-request" class="pending-tile" style="border-top: 3px solid #3b82f6;" title="View Pending Wallet Topup Requests">
              <div class="pending-tile-top">
                <span class="pending-tile-title">Pending Payment</span>
                <span class="pending-tile-icon" style="background:#dbeafe; color:#2563eb;"><i class="fa fa-credit-card"></i></span>
              </div>
              <div class="pending-tile-bottom">
                <span class="pending-count-badge ${pFund.count > 0 ? 'text-primary' : 'text-dark'}">${pFund.count}</span>
                <span class="pending-tile-sub">₹${formatRupeesFromMinor(pFund.amount_minor)}</span>
              </div>
            </a>

            <!-- 4. Pending Payout -->
            <a href="/admin/payment/payout-requests?status=pending" class="pending-tile" style="border-top: 3px solid #8b5cf6;" title="View Pending Payout/Redeem Requests">
              <div class="pending-tile-top">
                <span class="pending-tile-title">Pending Payout</span>
                <span class="pending-tile-icon" style="background:#ede9fe; color:#7c3aed;"><i class="fa fa-paper-plane"></i></span>
              </div>
              <div class="pending-tile-bottom">
                <span class="pending-count-badge ${pPayout.count > 0 ? 'text-purple' : 'text-dark'}">${pPayout.count}</span>
                <span class="pending-tile-sub">₹${formatRupeesFromMinor(pPayout.amount_minor)}</span>
              </div>
            </a>

            <!-- 5. Pending KYC -->
            <a href="/admin/users/pending-kyc" class="pending-tile" style="border-top: 3px solid #06b6d4;" title="View Pending User KYC Verifications">
              <div class="pending-tile-top">
                <span class="pending-tile-title">Pending KYC</span>
                <span class="pending-tile-icon" style="background:#cffafe; color:#0891b2;"><i class="fa fa-id-card-o"></i></span>
              </div>
              <div class="pending-tile-bottom">
                <span class="pending-count-badge ${pKyc.count > 0 ? 'text-info' : 'text-dark'}">${pKyc.count}</span>
                <span class="pending-tile-sub">User KYC</span>
              </div>
            </a>

            <!-- 6. Pending Bank Approval -->
            <a href="/admin/payment/bank-approval?status=pending" class="pending-tile" style="border-top: 3px solid #10b981;" title="View Pending User Bank Accounts Approval">
              <div class="pending-tile-top">
                <span class="pending-tile-title">Pending Bank Approval</span>
                <span class="pending-tile-icon" style="background:#d1fae5; color:#059669;"><i class="fa fa-university"></i></span>
              </div>
              <div class="pending-tile-bottom">
                <span class="pending-count-badge ${pBank.count > 0 ? 'text-success' : 'text-dark'}">${pBank.count}</span>
                <span class="pending-tile-sub">Bank Approvals</span>
              </div>
            </a>

            <!-- 7. Pending Seller API Requests -->
            <a href="/admin/seller-api/requests" class="pending-tile" style="border-top: 3px solid #ec4899;" title="View Seller API Integration Requests">
              <div class="pending-tile-top">
                <span class="pending-tile-title">Seller API Request</span>
                <span class="pending-tile-icon" style="background:#fce7f3; color:#db2777;"><i class="fa fa-plug"></i></span>
              </div>
              <div class="pending-tile-bottom">
                <span class="pending-count-badge ${pSellerApi.count > 0 ? 'text-danger font-weight-bold' : 'text-dark'}">${pSellerApi.count}</span>
                <span class="pending-tile-sub">${pSellerApi.pending_count > 0 ? pSellerApi.pending_count + ' Pending' : (pSellerApi.in_progress_count > 0 ? pSellerApi.in_progress_count + ' In Progress' : 'Seller API')}</span>
              </div>
            </a>
          </div>

          <!-- 2. TODAY CORE METRICS ROW (Today Transaction, Today Purchase, Today Redeem) -->
          <div class="core-grid">
            <!-- Card 1: Today Transaction -->
            <div class="core-card" style="border-left: 3px solid #2563eb;">
              <div class="core-card-header">
                <h3 class="core-card-title text-primary"><i class="fa fa-exchange"></i> Today Transaction</h3>
                <a href="/admin/reports/recharge-report" class="badge badge-light border text-primary" style="font-size:10.5px;">View Report &rarr;</a>
              </div>
              <div class="core-main-stat">
                <span class="core-big-rupee">₹${formatRupeesFromMinor(totalVolMinor)}</span>
                <span class="core-big-count">${totalTxns.toLocaleString('en-IN')} Orders</span>
              </div>
              <div class="progress" style="height: 5px; background: #e2e8f0; border-radius: 3px; margin-bottom: 6px;">
                <div class="progress-bar bg-success" style="width: ${txnSuccessRate}%;" title="Success: ${txnSuccessRate}%"></div>
                <div class="progress-bar bg-warning" style="width: ${totalTxns > 0 ? (pendingTxns * 100 / totalTxns).toFixed(1) : 0}%;" title="Pending"></div>
                <div class="progress-bar bg-danger" style="width: ${totalTxns > 0 ? (failedTxns * 100 / totalTxns).toFixed(1) : 0}%;" title="Failed"></div>
              </div>
              <div class="core-pill-row">
                <span class="core-mini-pill text-success" title="Successful recharges"><i class="fa fa-check-circle"></i> Success: <b>${successTxns}</b> (₹${formatRupeesFromMinor(successVolMinor)})</span>
                <span class="core-mini-pill text-warning" title="Pending recharges"><i class="fa fa-clock-o"></i> Pending: <b>${pendingTxns}</b></span>
                <span class="core-mini-pill text-danger" title="Failed recharges"><i class="fa fa-times-circle"></i> Failed: <b>${failedTxns}</b></span>
              </div>
            </div>

            <!-- Card 2: Today Purchase -->
            <div class="core-card" style="border-left: 3px solid #10b981;">
              <div class="core-card-header">
                <h3 class="core-card-title text-success"><i class="fa fa-shopping-cart"></i> Today Purchase</h3>
                <a href="/admin/reports/buyer-daybook" class="badge badge-light border text-success" style="font-size:10.5px;">Buyer Daybook &rarr;</a>
              </div>
              <div class="core-main-stat">
                <span class="core-big-rupee text-success">₹${formatRupeesFromMinor(successVolMinor)}</span>
                <span class="core-big-count">${successTxns.toLocaleString('en-IN')} Executed</span>
              </div>
              <div class="d-flex align-items-center justify-content-between mb-1" style="font-size:11px;">
                <span class="text-muted">Purchase Cost: <b>₹${formatRupeesFromMinor(purchaseCostMinor)}</b></span>
                <span class="text-success font-weight-bold">Margin: ₹${formatRupeesFromMinor(purchaseMarginMinor)} (${marginPercent}%)</span>
              </div>
              <div class="core-pill-row">
                <span class="core-mini-pill text-dark" title="Active buyers making purchases"><i class="fa fa-users text-primary"></i> Buyers: <b>${activeBuyers} Active</b></span>
                <span class="core-mini-pill text-success" title="Net margin earned"><i class="fa fa-line-chart"></i> Margin: <b>₹${formatRupeesFromMinor(purchaseMarginMinor)}</b></span>
                <span class="core-mini-pill text-info" title="Overall Success Ratio"><i class="fa fa-pie-chart"></i> Ratio: <b>${txnSuccessRate}%</b></span>
              </div>
            </div>

            <!-- Card 3: Today Redeem -->
            <div class="core-card" style="border-left: 3px solid #8b5cf6;">
              <div class="core-card-header">
                <h3 class="core-card-title text-purple"><i class="fa fa-money"></i> Today Redeem</h3>
                <a href="/admin/payment/payout-requests" class="badge badge-light border text-purple" style="font-size:10.5px;">Payouts &rarr;</a>
              </div>
              <div class="core-main-stat">
                <span class="core-big-rupee" style="color:#7c3aed;">₹${formatRupeesFromMinor(totalRedeemVolMinor)}</span>
                <span class="core-big-count">${totalRedeemCount.toLocaleString('en-IN')} Requests</span>
              </div>
              <div class="d-flex align-items-center justify-content-between mb-1" style="font-size:11px;">
                <span class="text-success">Processed: <b>₹${formatRupeesFromMinor(processedRedeemVolMinor)}</b> (${processedRedeemCount})</span>
                <span class="text-warning">In Queue: <b>₹${formatRupeesFromMinor(pendingRedeemVolMinor)}</b> (${pendingRedeemCount})</span>
              </div>
              <div class="core-pill-row">
                <span class="core-mini-pill text-success"><i class="fa fa-check"></i> Paid: <b>${processedRedeemCount}</b></span>
                <span class="core-mini-pill text-warning"><i class="fa fa-hourglass-half"></i> Pending: <b>${pendingRedeemCount}</b></span>
                <span class="core-mini-pill text-danger"><i class="fa fa-ban"></i> Rejected: <b>${rejectedRedeemCount}</b></span>
              </div>
            </div>
          </div>

          <!-- 3. SELLER API INTEGRATION REQUESTS -->
          <div class="operator-card mb-3" style="border-top: 3px solid #ec4899;">
            <div class="operator-header">
              <h3 class="operator-title" style="color:#db2777;">
                <i class="fa fa-plug mr-1"></i> Seller API Integration Requests
                <span class="badge badge-light border ml-2 text-dark font-weight-normal" style="font-size:11px;">
                  <b>${pSellerApi.count}</b> active (${pSellerApi.pending_count} pending, ${pSellerApi.in_progress_count} in-progress)
                </span>
              </h3>
              <div class="d-flex align-items-center gap-2">
                <a href="/admin/seller-api/requests" class="btn btn-sm btn-outline-primary py-0 px-2" style="font-size:11px;">
                  Manage All Seller API Requests &rarr;
                </a>
              </div>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover table-compact table-bordered mb-0">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th class="text-center" style="width:36px;">#</th>
                    <th>User / Client</th>
                    <th>API Website / Username</th>
                    <th>Status</th>
                    <th>Requested At</th>
                    <th class="text-center" style="width:100px;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${recentSellerApiHtml}
                </tbody>
              </table>
            </div>
          </div>

          <!-- 4. TODAY OPERATOR-WISE SUMMARY & % WISE -->
          <div class="operator-card">
            <div class="operator-header">
              <h3 class="operator-title">
                <i class="fa fa-bar-chart text-primary"></i> Today Operator-Wise Summary &amp; Percentage Breakdown
              </h3>
              <div class="d-flex align-items-center gap-2">
                <span class="badge badge-light border text-muted" style="font-size: 11px;">
                  Total Operators: <b>${operatorRows.length}</b>
                </span>
                <a href="/admin/reports/daily-sales-report" class="btn btn-sm btn-outline-primary py-0 px-2" style="font-size:11px;">
                  Full Sales Report &rarr;
                </a>
              </div>
            </div>

            <div class="operator-table-container">
              <table class="table table-sm table-hover table-compact table-bordered">
                <thead>
                  <tr>
                    <th class="text-center" style="width:36px;">#</th>
                    <th>Operator &amp; Service</th>
                    <th class="text-right">Today Txns</th>
                    <th class="text-right">Total Volume</th>
                    <th style="min-width: 140px;">Share (% Vol)</th>
                    <th class="text-right">Success / Rate</th>
                    <th class="text-right">Avg Ticket (₹)</th>
                    <th class="text-right">Margin / %</th>
                  </tr>
                </thead>
                <tbody>
                  ${opTableHtml}
                </tbody>
                ${operatorRows.length > 0 ? `
                <tfoot>
                  <tr>
                    <td colspan="2" class="text-right">TOTAL SUMMARY:</td>
                    <td class="text-right">${grandOpTotalCount.toLocaleString('en-IN')}</td>
                    <td class="text-right text-primary">₹${formatRupeesFromMinor(grandOpTotalValMinor)}</td>
                    <td class="text-center font-weight-bold">100.0%</td>
                    <td class="text-right text-success">${grandOpSuccessCount} (${grandSuccessPct}%)</td>
                    <td class="text-right font-weight-bold">₹${grandAvgTicket}</td>
                    <td class="text-right text-success">₹${formatRupeesFromMinor(grandOpMarginMinor)} (${grandMarginPct}%)</td>
                  </tr>
                </tfoot>` : ''}
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script src="/auth-client.js"></script>
  <script>
    (function () {
      function updateClock() {
        var d = new Date();
        var opts = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
        var clockEl = document.getElementById('liveClock');
        if (clockEl) {
          clockEl.textContent = d.toLocaleTimeString('en-IN', opts);
        }
      }
      setInterval(updateClock, 1000);
      updateClock();

      // Auto-refresh every 45 seconds for real-time live command center
      var autoRefreshTimer = setInterval(function () {
        location.reload();
      }, 45000);
    })();
  </script>
</body>
</html>`;

    const html = await addPanelChrome(rawHtml, { role: 'admin', currentPath: '/admin/' });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
    });
    response.end(html);
  }

  return { sendAdminDashboardPage };
};
