'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

const CIRCLES = [
  'All', 'Andhra Pradesh', 'Assam', 'Bihar & Jharkhand', 'Chennai', 'Delhi', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jammu Kashmir', 'Karnataka', 'Kerala', 'Kolkata',
  'Maharashtra & Goa', 'Mumbai', 'North East', 'Orissa', 'Punjab', 'Rajasthan',
  'Tamil Nadu', 'UP East', 'UP West', 'West Bengal',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = function createAdminRefundReportPage({
  db,
  formatMinorUnits,
  decryptMobile,
  sendJson,
  httpError,
}) {

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

  /**
   * Stream filtered refunds as CSV
   */
  function streamCsv(rows, response) {
    const csvHeader = [
      'Order ID',
      'Client Ref ID',
      'Refund Date Time (IST)',
      'Original Txn Date (IST)',
      'Buyer User (Refund To)',
      'Buyer Username',
      'Seller User (Debited From)',
      'Seller Username',
      'Mobile Number',
      'Operator',
      'Circle',
      'Recharge Gross Amount (INR)',
      'Reversed Margin (INR)',
      'Net Refund Credited (INR)',
      'Refund Source / Type',
      'Refund Reason / Remark',
      'Status',
      'Wallet Txn Ref',
    ].join(',') + '\r\n';

    const csvRows = rows.map((row) => {
      let mobile = row.mobile_number || '';
      if (!mobile && row.mobile_ciphertext && decryptMobile) {
        try { mobile = decryptMobile(row.mobile_ciphertext); } catch (_) { mobile = 'Hidden'; }
      }
      const grossAmt = (Number(row.amount_minor || 0) / 100).toFixed(2);
      const revMargin = (Number(row.margin_minor || 0) / 100).toFixed(2);
      const netRefund = (Number(row.cost_minor || (BigInt(row.amount_minor || 0) - BigInt(row.margin_minor || 0))) / 100).toFixed(2);

      const refundDate = row.dispute_resolved_at || row.updated_at || row.created_at;

      let refundType = 'System Failed Refund';
      if (row.dispute_status === 'accepted') {
        refundType = 'Dispute Accepted & Refunded';
      } else if (row.admin_failed_by || (row.response_payload && row.response_payload.admin_failed_by)) {
        refundType = 'Admin Failed Refund';
      }

      const reason = row.dispute_resolution_note || row.dispute_reason || (row.response_payload && row.response_payload.admin_failed_reason) || 'Failed Recharge Refund';
      const walletRef = `adm_fail_ref_${row.id.slice(0, 8)}`;

      const sanitize = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

      return [
        sanitize('RCH-' + row.id.slice(0, 8).toUpperCase()),
        sanitize(row.idempotency_key || ''),
        sanitize(formatDateTime(refundDate)),
        sanitize(formatDateTime(row.created_at)),
        sanitize(row.buyer_name || row.buyer_username || 'N/A'),
        sanitize(row.buyer_username || ''),
        sanitize(row.seller_name || row.seller_username || 'Direct'),
        sanitize(row.seller_username || ''),
        sanitize(mobile),
        sanitize(row.operator_name || row.operator_code || ''),
        sanitize(row.circle_name || 'All'),
        sanitize(grossAmt),
        sanitize(revMargin),
        sanitize(netRefund),
        sanitize(refundType),
        sanitize(reason),
        sanitize(row.status.toUpperCase()),
        sanitize(walletRef),
      ].join(',');
    }).join('\r\n');

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="refund-report-${getTodayString()}.csv"`,
      'cache-control': 'no-store',
    });
    response.end('\uFEFF' + csvHeader + csvRows);
  }

  /**
   * Main Page Renderer: GET /admin/reports/refund-report
   */
  async function sendAdminRefundReportPage(admin, response, searchParams) {
    const filters = {
      fromDate: String(searchParams.get('fromDate') || '').trim(),
      toDate: String(searchParams.get('toDate') || '').trim(),
      userId: String(searchParams.get('userId') || '').trim(),
      userRole: String(searchParams.get('userRole') || 'all').trim().toLowerCase(), // all, buyer, seller
      refundType: String(searchParams.get('refundType') || 'all').trim().toLowerCase(), // all, admin, dispute, system
      operatorId: String(searchParams.get('operatorId') || '').trim(),
      circle: String(searchParams.get('circle') || '').trim(),
      search: String(searchParams.get('search') || '').trim().slice(0, 80),
      limit: Math.min(Math.max(parseInt(searchParams.get('limit') || '200', 10), 10), 1000),
    };

    // 1. Fetch Users & Operators for filter dropdowns
    const [usersRes, operatorsRes] = await Promise.all([
      db.query("SELECT id, username, name, business_name FROM users WHERE deleted_at IS NULL ORDER BY username ASC"),
      db.query("SELECT id, operator_name, service_type, operator_code FROM operator_definitions WHERE status='active' AND deleted_at IS NULL ORDER BY service_type, operator_name"),
    ]);
    const usersList = usersRes.rows;
    const operatorsList = operatorsRes.rows;

    // 2. Query Refund transactions
    // Refund criteria: status is refunded or failed, or dispute accepted, or wallet entry has refund
    const conditions = [
      "(r.status = 'refunded' OR r.status = 'failed' OR r.dispute_status = 'accepted' OR EXISTS (SELECT 1 FROM wallet_entries w WHERE w.reference_id = r.id AND (w.entry_type = 'refund' OR w.reference_type LIKE '%refund%')))"
    ];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (filters.fromDate) {
      conditions.push(`COALESCE(r.dispute_resolved_at, r.updated_at, r.created_at) >= (${add(filters.fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (filters.toDate) {
      conditions.push(`COALESCE(r.dispute_resolved_at, r.updated_at, r.created_at) < (((${add(filters.toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (filters.userId && UUID_REGEX.test(filters.userId)) {
      if (filters.userRole === 'buyer') {
        conditions.push(`r.user_id = ${add(filters.userId)}`);
      } else if (filters.userRole === 'seller') {
        conditions.push(`r.seller_user_id = ${add(filters.userId)}`);
      } else {
        conditions.push(`(r.user_id = ${add(filters.userId)} OR r.seller_user_id = ${add(filters.userId)})`);
      }
    }
    if (filters.refundType === 'admin') {
      conditions.push(`(r.response_payload::text ILIKE '%admin_failed_by%' OR r.dispute_resolution_note ILIKE '%Administrator%')`);
    } else if (filters.refundType === 'dispute') {
      conditions.push(`(r.dispute_status = 'accepted' OR d.status = 'accepted')`);
    } else if (filters.refundType === 'system') {
      conditions.push(`(r.status = 'failed' AND (r.dispute_status IS NULL OR r.dispute_status = 'none'))`);
    }
    if (filters.operatorId && UUID_REGEX.test(filters.operatorId)) {
      conditions.push(`r.operator_id = ${add(filters.operatorId)}`);
    }
    if (filters.circle && filters.circle !== 'All' && CIRCLES.includes(filters.circle)) {
      conditions.push(`r.circle_name = ${add(filters.circle)}`);
    }
    if (filters.search) {
      conditions.push(`(
        r.mobile_number LIKE ${add(`%${filters.search}%`)}
        OR r.idempotency_key ILIKE ${add(`%${filters.search}%`)}
        OR r.id::text ILIKE ${add(`%${filters.search}%`)}
        OR r.dispute_reason ILIKE ${add(`%${filters.search}%`)}
        OR r.dispute_resolution_note ILIKE ${add(`%${filters.search}%`)}
        OR u_buyer.username ILIKE ${add(`%${filters.search}%`)}
        OR u_buyer.name ILIKE ${add(`%${filters.search}%`)}
        OR u_seller.username ILIKE ${add(`%${filters.search}%`)}
        OR u_seller.name ILIKE ${add(`%${filters.search}%`)}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const isCsvDownload = searchParams.get('download') === 'csv';
    const limitClause = isCsvDownload ? 'LIMIT 2000' : `LIMIT ${filters.limit}`;

    const query = `
      SELECT r.id, r.user_id, r.seller_user_id, r.seller_api_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.operator_code, r.circle_name, r.amount_minor, r.margin_minor,
             r.cost_minor, r.seller_margin_minor, r.status, r.idempotency_key, r.provider_reference,
             r.response_payload, r.with_gst, r.created_at, r.updated_at,
             r.dispute_status, r.dispute_reason, r.dispute_resolution_note,
             r.dispute_created_at, r.dispute_resolved_at,
             u_buyer.username AS buyer_username, u_buyer.name AS buyer_name, u_buyer.business_name AS buyer_business,
             u_seller.username AS seller_username, u_seller.name AS seller_name, u_seller.business_name AS seller_business,
             d.dispute_code, d.reason AS d_reason, d.status AS d_status, d.resolution_note AS d_note,
             w_ref.id AS wallet_entry_id, w_ref.idempotency_key AS wallet_idempotency_key, w_ref.amount_minor AS wallet_refund_minor
      FROM recharge_orders r
      LEFT JOIN users u_buyer ON u_buyer.id = r.user_id
      LEFT JOIN users u_seller ON u_seller.id = r.seller_user_id
      LEFT JOIN recharge_disputes d ON d.order_id = r.id
      LEFT JOIN wallet_entries w_ref ON w_ref.reference_id = r.id AND (w_ref.entry_type = 'refund' OR w_ref.reference_type = 'admin_failed_refund')
      ${whereClause}
      ORDER BY COALESCE(r.dispute_resolved_at, r.updated_at, r.created_at) DESC
      ${limitClause}
    `;

    const result = await db.query(query, values);
    const rows = result.rows;

    if (isCsvDownload) {
      return streamCsv(rows, response);
    }

    // 3. Compute KPI counters
    let totalRefundCount = rows.length;
    let totalGrossRefundMinor = 0n;
    let totalNetRefundMinor = 0n;
    let totalReversedMarginMinor = 0n;

    for (const row of rows) {
      const gross = BigInt(row.amount_minor || '0');
      const margin = BigInt(row.margin_minor || '0');
      const net = BigInt(row.cost_minor || (gross > margin ? gross - margin : gross));

      totalGrossRefundMinor += gross;
      totalReversedMarginMinor += margin;
      totalNetRefundMinor += net;
    }

    // Today's total refunds count & amount
    let todayRefundCount = 0;
    let todayRefundAmtMinor = 0n;
    try {
      const todayRes = await db.query(
        `SELECT COUNT(id) AS today_count, COALESCE(SUM(amount_minor), 0) AS today_minor
         FROM recharge_orders
         WHERE (status = 'refunded' OR status = 'failed' OR dispute_status = 'accepted')
           AND COALESCE(dispute_resolved_at, updated_at, created_at) >= (CURRENT_DATE::timestamp AT TIME ZONE 'Asia/Kolkata')`
      );
      if (todayRes.rowCount > 0) {
        todayRefundCount = Number(todayRes.rows[0].today_count || 0);
        todayRefundAmtMinor = BigInt(todayRes.rows[0].today_minor || '0');
      }
    } catch (_) {}

    // 4. Render Table Rows HTML
    function renderRowsHtml(items) {
      if (!items || items.length === 0) {
        return `<tr><td colspan="12" class="text-center py-5 text-muted font-weight-bold">
          <i class="fa fa-info-circle fa-2x d-block mb-2 text-info" style="opacity:0.5;"></i>
          No refund records found matching your filters.
        </td></tr>`;
      }

      return items.map((row, idx) => {
        let mobile = row.mobile_number || '';
        if (!mobile && row.mobile_ciphertext && decryptMobile) {
          try { mobile = decryptMobile(row.mobile_ciphertext); } catch (_) { mobile = '••••••••••'; }
        }

        const grossAmt = (Number(row.amount_minor || 0) / 100).toFixed(2);
        const revMargin = (Number(row.margin_minor || 0) / 100).toFixed(2);
        const netRefund = (Number(row.cost_minor || (BigInt(row.amount_minor || 0) - BigInt(row.margin_minor || 0))) / 100).toFixed(2);

        const refundDate = row.dispute_resolved_at || row.updated_at || row.created_at;

        const payload = typeof row.response_payload === 'object' && row.response_payload !== null ? row.response_payload : {};
        const isAdminFail = Boolean(payload.admin_failed_by || (row.dispute_resolution_note && row.dispute_resolution_note.includes('Administrator')));
        const isDispute = row.dispute_status === 'accepted' || Boolean(row.dispute_code);

        let refundTypeBadge = '<span class="badge badge-secondary px-2 py-1"><i class="fa fa-cogs mr-1"></i> System Failed</span>';
        if (isDispute) {
          refundTypeBadge = '<span class="badge badge-success px-2 py-1" style="background:#10b981;"><i class="fa fa-gavel mr-1"></i> Dispute Accepted</span>';
        } else if (isAdminFail) {
          refundTypeBadge = '<span class="badge badge-warning text-dark px-2 py-1" style="background:#fde047;border:1px solid #facc15;"><i class="fa fa-user-shield mr-1"></i> Admin Refund</span>';
        }

        const reason = row.dispute_resolution_note || row.dispute_reason || payload.admin_failed_reason || 'Recharge Failed / System Reversal';
        const systemRechargeId = 'RCH-' + row.id.slice(0, 8).toUpperCase();
        const walletRef = row.wallet_idempotency_key || `adm_fail_ref_${row.id.slice(0, 8)}`;

        // JSON payload for modal inspection
        const fullDetailJson = JSON.stringify({
          recharge_order: {
            id: row.id,
            user_id: row.user_id,
            seller_user_id: row.seller_user_id,
            seller_api_id: row.seller_api_id,
            mobile_number: mobile,
            operator_name: row.operator_name,
            operator_code: row.operator_code,
            circle_name: row.circle_name,
            amount: grossAmt,
            margin: revMargin,
            net_cost: netRefund,
            status: row.status,
            idempotency_key: row.idempotency_key,
            provider_reference: row.provider_reference,
            created_at: row.created_at,
            updated_at: row.updated_at,
            dispute_status: row.dispute_status,
            dispute_reason: row.dispute_reason,
            dispute_resolution_note: row.dispute_resolution_note,
            response_payload: payload,
          },
          buyer_user: {
            id: row.user_id,
            name: row.buyer_name,
            username: row.buyer_username,
            business_name: row.buyer_business,
          },
          seller_user: {
            id: row.seller_user_id,
            name: row.seller_name,
            username: row.seller_username,
            business_name: row.seller_business,
          },
          dispute_record: row.dispute_code ? {
            code: row.dispute_code,
            reason: row.d_reason,
            status: row.d_status,
            resolution_note: row.d_note,
          } : null,
          wallet_refund_entry: {
            entry_id: row.wallet_entry_id,
            idempotency_key: row.wallet_idempotency_key,
            amount: (Number(row.wallet_refund_minor || row.cost_minor || row.amount_minor || 0) / 100).toFixed(2),
          },
        }, null, 2);

        return `
          <tr data-order-id="${row.id}">
            <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
            <td>
              <span class="font-weight-bold text-dark d-block" style="font-size:12px;">${formatDateTime(refundDate)}</span>
              <small class="text-muted d-block">Txn: ${formatDateTime(row.created_at)}</small>
            </td>
            <td>
              <div class="d-flex align-items-center">
                <span class="badge badge-light border text-monospace font-weight-bold py-1 px-2" style="font-size:11.5px;">
                  ${systemRechargeId}
                </span>
                <button class="btn btn-xs btn-outline-secondary ml-1 py-0 px-1 border-0" onclick="navigator.clipboard.writeText('${row.id}')" title="Copy UUID">
                  <i class="fa fa-copy"></i>
                </button>
              </div>
              <small class="text-muted font-monospace d-block" style="font-size:10.5px;">Ref: ${escapeHtml(row.idempotency_key || '-')}</small>
            </td>
            <td>
              <strong class="text-dark d-block" style="font-size:12.5px;">${escapeHtml(row.buyer_name || row.buyer_username || 'N/A')}</strong>
              <small class="text-muted text-monospace">@${escapeHtml(row.buyer_username || 'n/a')}</small>
            </td>
            <td>
              ${row.seller_user_id ? `
                <strong class="text-dark d-block" style="font-size:12.5px;">${escapeHtml(row.seller_name || row.seller_username || 'Seller')}</strong>
                <small class="text-muted text-monospace">@${escapeHtml(row.seller_username || 'seller')}</small>
              ` : '<span class="badge badge-light border text-muted">Direct / None</span>'}
            </td>
            <td>
              <strong class="text-dark font-weight-bold font-monospace">${escapeHtml(mobile)}</strong>
              <small class="text-muted d-block">${escapeHtml(row.operator_name || '-')} (${escapeHtml(row.circle_name || 'All')})</small>
            </td>
            <td class="text-right">
              <strong class="text-dark font-monospace" style="font-size:13px;">₹${grossAmt}</strong>
            </td>
            <td class="text-right font-monospace text-danger font-weight-bold">
              -₹${revMargin}
            </td>
            <td class="text-right font-monospace text-success font-weight-bold" style="font-size:13px;">
              +₹${netRefund}
            </td>
            <td class="text-center">
              ${refundTypeBadge}
            </td>
            <td>
              <div class="small text-dark" style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(reason)}">
                ${escapeHtml(reason)}
              </div>
              <small class="text-muted font-monospace" style="font-size:10.5px;">Wallet: ${escapeHtml(walletRef)}</small>
            </td>
            <td class="text-center">
              <button type="button" class="btn btn-xs btn-outline-info font-weight-bold py-1 px-2 btn-show-all-tables"
                      data-json="${escapeHtml(fullDetailJson)}"
                      title="Inspect All Linked Database Tables Details">
                <i class="fa fa-table mr-1"></i> All Tables Detail
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    const tableRowsHtml = renderRowsHtml(rows);

    const downloadParams = new URLSearchParams(searchParams);
    downloadParams.set('download', 'csv');
    const downloadUrl = `/admin/reports/refund-report?${downloadParams.toString()}`;

    const partyOptions = usersList.map((u) => {
      const isSel = filters.userId === u.id ? ' selected' : '';
      const display = `${escapeHtml(u.name || u.username)} (@${escapeHtml(u.username)})${u.business_name ? ` - ${escapeHtml(u.business_name)}` : ''}`;
      return `<option value="${u.id}"${isSel}>${display}</option>`;
    }).join('');

    const operatorOptions = operatorsList.map((op) => {
      const isSel = filters.operatorId === op.id ? ' selected' : '';
      return `<option value="${op.id}"${isSel}>${escapeHtml(op.operator_name)} · ${escapeHtml(op.service_type)}</option>`;
    }).join('');

    const circleOptions = CIRCLES.map((c) => {
      const isSel = filters.circle === c ? ' selected' : '';
      return `<option value="${escapeHtml(c)}"${isSel}>${escapeHtml(c)}</option>`;
    }).join('');

    const navigation = renderAdminNavigation('/admin/reports/refund-report');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Refund Report - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    .page-title-box { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    
    .kpi-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px 18px;
      margin-bottom: 16px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      position: relative;
      overflow: hidden;
      transition: transform 0.15s ease;
    }
    .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .kpi-card .kpi-label { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 6px; display: flex; justify-content: space-between; }
    .kpi-card .kpi-value { font-size: 22px; font-weight: 800; line-height: 1.2; margin-bottom: 4px; }
    .kpi-card .kpi-subtext { font-size: 11.5px; color: #94a3b8; }
    
    .border-accent-sky { border-left: 5px solid #0ea5e9; }
    .border-accent-green { border-left: 5px solid #10b981; }
    .border-accent-red { border-left: 5px solid #ef4444; }
    .border-accent-amber { border-left: 5px solid #f59e0b; }

    .card-filter { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
    .card-filter .card-header { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; }
    .card-filter .card-body { padding: 18px 20px; }
    
    .quick-date-btn { padding: 3px 8px; font-size: 11px; font-weight: 600; border-radius: 4px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; cursor: pointer; }
    .quick-date-btn:hover { background: #e2e8f0; color: #1e293b; }

    .table th { background-color: #f8fafc; color: #334155; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; border-top: none; vertical-align: middle; padding: 10px 12px; }
    .table td { vertical-align: middle; padding: 10px 12px; font-size: 12.5px; border-color: #f1f5f9; }
    .table tbody tr:hover { background-color: #f8fafc; }

    .json-code-box { background: #0f172a; color: #f8fafc; padding: 12px 14px; border-radius: 6px; font-family: monospace; font-size: 11.5px; max-height: 250px; overflow-y: auto; }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      
      <main class="main-content">
        <div class="container-fluid px-3 py-3">

          <!-- Page Header -->
          <div class="page-title-box">
            <div>
              <h4 class="font-weight-bold text-dark mb-1">
                <i class="fa fa-undo text-danger mr-2"></i> Refund Report
              </h4>
              <p class="text-muted small mb-0">
                Audit every refund transaction with exact date-time, user identification, reversed commissions, wallet credit references, and multi-table records.
              </p>
            </div>
            <div class="d-flex" style="gap: 8px;">
              <a href="${downloadUrl}" class="btn btn-sm btn-success font-weight-bold shadow-sm" id="btnDownloadCsv">
                <i class="fa fa-download mr-1"></i> Download CSV
              </a>
              <button class="btn btn-sm btn-outline-primary" onclick="window.print()">
                <i class="fa fa-print mr-1"></i> Print
              </button>
              <button class="btn btn-sm btn-outline-dark" onclick="location.reload()">
                <i class="fa fa-refresh mr-1"></i> Refresh
              </button>
            </div>
          </div>

          <!-- KPI Summary Cards -->
          <div class="row">
            <div class="col-12 col-sm-6 col-lg-3">
              <div class="kpi-card border-accent-sky">
                <div class="kpi-label">
                  <span>Total Refund Count</span>
                  <i class="fa fa-history text-info" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value text-info font-monospace">${totalRefundCount}</div>
                <div class="kpi-subtext">Refunded orders in scope</div>
              </div>
            </div>

            <div class="col-12 col-sm-6 col-lg-3">
              <div class="kpi-card border-accent-green">
                <div class="kpi-label">
                  <span>Net Refund Credited</span>
                  <i class="fa fa-wallet text-success" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value text-success font-monospace">₹${(Number(totalNetRefundMinor)/100).toFixed(2)}</div>
                <div class="kpi-subtext">Total refunded into buyers' wallets</div>
              </div>
            </div>

            <div class="col-12 col-sm-6 col-lg-3">
              <div class="kpi-card border-accent-red">
                <div class="kpi-label">
                  <span>Reversed Commission</span>
                  <i class="fa fa-minus-circle text-danger" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value text-danger font-monospace">₹${(Number(totalReversedMarginMinor)/100).toFixed(2)}</div>
                <div class="kpi-subtext">Buyer margins rolled back</div>
              </div>
            </div>

            <div class="col-12 col-sm-6 col-lg-3">
              <div class="kpi-card border-accent-amber">
                <div class="kpi-label">
                  <span>Today's Refunds</span>
                  <i class="fa fa-calendar text-warning" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value text-dark font-monospace">${todayRefundCount} <small class="text-muted" style="font-size:13px;">(₹${(Number(todayRefundAmtMinor)/100).toFixed(2)})</small></div>
                <div class="kpi-subtext">Processed today (IST)</div>
              </div>
            </div>
          </div>

          <!-- Filter Form Card -->
          <div class="card card-filter">
            <div class="card-header">
              <span class="font-weight-bold text-dark">
                <i class="fa fa-filter text-primary mr-1"></i> Filter Refund Orders
              </span>
              <div class="d-flex" style="gap: 5px;">
                <span class="small text-muted align-self-center mr-1">Quick Dates:</span>
                <button type="button" class="quick-date-btn" onclick="setQuickDate('today')">Today</button>
                <button type="button" class="quick-date-btn" onclick="setQuickDate('yesterday')">Yesterday</button>
                <button type="button" class="quick-date-btn" onclick="setQuickDate('last7')">Last 7 Days</button>
                <button type="button" class="quick-date-btn" onclick="setQuickDate('thismonth')">This Month</button>
                <button type="button" class="quick-date-btn" onclick="setQuickDate('all')">All Time</button>
              </div>
            </div>
            <div class="card-body">
              <form method="GET" action="/admin/reports/refund-report" id="refundFilterForm">
                <div class="row">
                  <!-- From Date -->
                  <div class="col-12 col-sm-6 col-md-3 form-group">
                    <label class="small font-weight-bold text-muted mb-1">From Date (Refund Date)</label>
                    <input type="date" name="fromDate" id="filterFromDate" class="form-control form-control-sm" value="${escapeHtml(filters.fromDate)}">
                  </div>

                  <!-- To Date -->
                  <div class="col-12 col-sm-6 col-md-3 form-group">
                    <label class="small font-weight-bold text-muted mb-1">To Date (Refund Date)</label>
                    <input type="date" name="toDate" id="filterToDate" class="form-control form-control-sm" value="${escapeHtml(filters.toDate)}">
                  </div>

                  <!-- Party Wise Selector -->
                  <div class="col-12 col-sm-6 col-md-3 form-group">
                    <label class="small font-weight-bold text-muted mb-1">User / Party</label>
                    <select name="userId" class="form-control form-control-sm">
                      <option value="">All Users (Any)</option>
                      ${partyOptions}
                    </select>
                  </div>

                  <!-- User Role -->
                  <div class="col-12 col-sm-6 col-md-3 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Role in Refund</label>
                    <select name="userRole" class="form-control form-control-sm">
                      <option value="all"${filters.userRole === 'all' ? ' selected' : ''}>Any Role (Buyer or Seller)</option>
                      <option value="buyer"${filters.userRole === 'buyer' ? ' selected' : ''}>Buyer (Refund Recipient)</option>
                      <option value="seller"${filters.userRole === 'seller' ? ' selected' : ''}>Seller (Debited / Reversed)</option>
                    </select>
                  </div>

                  <!-- Refund Type / Source -->
                  <div class="col-12 col-sm-6 col-md-3 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Refund Source / Initiator</label>
                    <select name="refundType" class="form-control form-control-sm">
                      <option value="all"${filters.refundType === 'all' ? ' selected' : ''}>All Refund Types</option>
                      <option value="admin"${filters.refundType === 'admin' ? ' selected' : ''}>Admin Initiated (Marked Failed)</option>
                      <option value="dispute"${filters.refundType === 'dispute' ? ' selected' : ''}>Dispute Accepted &amp; Resolved</option>
                      <option value="system"${filters.refundType === 'system' ? ' selected' : ''}>System Auto Reversal (Failed)</option>
                    </select>
                  </div>

                  <!-- Operator Filter -->
                  <div class="col-12 col-sm-6 col-md-3 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Operator</label>
                    <select name="operatorId" class="form-control form-control-sm">
                      <option value="">All Operators</option>
                      ${operatorOptions}
                    </select>
                  </div>

                  <!-- Circle Filter -->
                  <div class="col-12 col-sm-6 col-md-2 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Circle</label>
                    <select name="circle" class="form-control form-control-sm">
                      ${circleOptions}
                    </select>
                  </div>

                  <!-- Search keyword -->
                  <div class="col-12 col-sm-6 col-md-4 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Search (Mobile / Order ID / Reason / Ref)</label>
                    <input type="text" name="search" class="form-control form-control-sm" placeholder="e.g. 9876543210 or RCH-... or Reason" value="${escapeHtml(filters.search)}">
                  </div>
                </div>

                <div class="d-flex justify-content-between align-items-center mt-1">
                  <div class="small text-muted">
                    Showing <strong>${rows.length}</strong> refund record(s)
                  </div>
                  <div class="d-flex" style="gap: 8px;">
                    <a href="/admin/reports/refund-report" class="btn btn-sm btn-light border">
                      <i class="fa fa-undo mr-1"></i> Reset Filters
                    </a>
                    <button type="submit" class="btn btn-sm btn-primary px-3 font-weight-bold shadow-sm">
                      <i class="fa fa-filter mr-1"></i> Apply Filters
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          <!-- Refund Data Table Card -->
          <div class="card data-table-card border rounded bg-white shadow-sm">
            <div class="card-header bg-white py-3 px-3 d-flex justify-content-between align-items-center">
              <div>
                <h5 class="font-weight-bold text-dark mb-0">
                  <i class="fa fa-list-alt text-danger mr-1"></i> Refund Transactions Audit Log
                </h5>
                <small class="text-muted">Audit log showing user, original recharge, refund timestamp, and multi-table linkings.</small>
              </div>
              <span class="badge badge-light border text-muted px-2 py-1">
                Records: <strong>${rows.length}</strong>
              </span>
            </div>
            
            <div class="table-responsive">
              <table class="table table-hover table-bordered mb-0">
                <thead>
                  <tr>
                    <th style="width:40px;" class="text-center">#</th>
                    <th>Refund Date &amp; Time (IST)</th>
                    <th>Order &amp; Ref ID</th>
                    <th>Buyer (Refund To)</th>
                    <th>Seller (Debited From)</th>
                    <th>Mobile &amp; Operator</th>
                    <th class="text-right">Gross (₹)</th>
                    <th class="text-right">Rev. Margin</th>
                    <th class="text-right">Net Refund</th>
                    <th class="text-center">Refund Source</th>
                    <th>Reason / Remark</th>
                    <th class="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  </div>

  <!-- Modal: All Linked Tables Detail Inspector -->
  <div class="modal fade" id="modalAllTablesDetail" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-xl" role="document">
      <div class="modal-content">
        <div class="modal-header bg-dark text-white">
          <h5 class="modal-title font-weight-bold">
            <i class="fa fa-database text-warning mr-2"></i> All Tables Detail Inspector
          </h5>
          <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body p-4">
          
          <ul class="nav nav-tabs mb-3" id="tableTabs" role="tablist">
            <li class="nav-item">
              <a class="nav-link active font-weight-bold" id="tab-recharge-link" data-toggle="tab" href="#tab-recharge" role="tab">
                <i class="fa fa-bolt mr-1 text-primary"></i> recharge_orders
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link font-weight-bold" id="tab-parties-link" data-toggle="tab" href="#tab-parties" role="tab">
                <i class="fa fa-users mr-1 text-info"></i> users (Buyer &amp; Seller)
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link font-weight-bold" id="tab-wallet-link" data-toggle="tab" href="#tab-wallet" role="tab">
                <i class="fa fa-credit-card mr-1 text-success"></i> wallet_entries
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link font-weight-bold" id="tab-dispute-link" data-toggle="tab" href="#tab-dispute" role="tab">
                <i class="fa fa-gavel mr-1 text-warning"></i> recharge_disputes
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link font-weight-bold" id="tab-raw-link" data-toggle="tab" href="#tab-raw" role="tab">
                <i class="fa fa-code mr-1 text-secondary"></i> Raw Full JSON
              </a>
            </li>
          </ul>

          <div class="tab-content">
            <!-- 1. recharge_orders -->
            <div class="tab-pane fade show active" id="tab-recharge" role="tabpanel">
              <div class="table-responsive">
                <table class="table table-sm table-bordered" style="font-size:12.5px;" id="inspectRechargeTable">
                </table>
              </div>
            </div>

            <!-- 2. users -->
            <div class="tab-pane fade" id="tab-parties" role="tabpanel">
              <div class="row">
                <div class="col-md-6">
                  <h6 class="font-weight-bold text-primary mb-2"><i class="fa fa-user mr-1"></i> Buyer Details (Refund Recipient)</h6>
                  <table class="table table-sm table-bordered" style="font-size:12.5px;" id="inspectBuyerTable"></table>
                </div>
                <div class="col-md-6">
                  <h6 class="font-weight-bold text-dark mb-2"><i class="fa fa-server mr-1"></i> Seller Details (Sales Reversal)</h6>
                  <table class="table table-sm table-bordered" style="font-size:12.5px;" id="inspectSellerTable"></table>
                </div>
              </div>
            </div>

            <!-- 3. wallet_entries -->
            <div class="tab-pane fade" id="tab-wallet" role="tabpanel">
              <div class="alert alert-success p-2 small mb-2">
                <i class="fa fa-check-circle mr-1"></i> Corresponding credit ledger entry into buyer wallet.
              </div>
              <table class="table table-sm table-bordered" style="font-size:12.5px;" id="inspectWalletTable"></table>
            </div>

            <!-- 4. recharge_disputes -->
            <div class="tab-pane fade" id="tab-dispute" role="tabpanel">
              <div id="disputeArea"></div>
            </div>

            <!-- 5. raw JSON -->
            <div class="tab-pane fade" id="tab-raw" role="tabpanel">
              <div class="d-flex justify-content-end mb-2">
                <button type="button" class="btn btn-xs btn-outline-secondary" id="btnCopyJson"><i class="fa fa-copy mr-1"></i> Copy JSON</button>
              </div>
              <pre class="json-code-box" id="rawJsonBox"></pre>
            </div>
          </div>

        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
        </div>
      </div>
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
      } else if (preset === 'all') {
        fromInput.value = '';
        toInput.value = '';
      }
      document.getElementById('refundFilterForm').submit();
    }

    $(document).on('click', '.btn-show-all-tables', function() {
      const dataStr = $(this).attr('data-json');
      let data = {};
      try { data = JSON.parse(dataStr); } catch (_) { return; }

      // 1. Fill recharge_orders
      const r = data.recharge_order || {};
      let rHtml = '';
      rHtml += '<tr><th class="bg-light" style="width:200px;">id (UUID)</th><td class="font-monospace font-weight-bold text-primary">' + (r.id || '-') + '</td></tr>';
      rHtml += '<tr><th class="bg-light">idempotency_key</th><td class="font-monospace">' + (r.idempotency_key || '-') + '</td></tr>';
      rHtml += '<tr><th class="bg-light">status</th><td><span class="badge badge-danger">' + (r.status || '-').toUpperCase() + '</span></td></tr>';
      rHtml += '<tr><th class="bg-light">mobile_number</th><td class="font-monospace font-weight-bold">' + (r.mobile_number || '-') + '</td></tr>';
      rHtml += '<tr><th class="bg-light">operator_name / code</th><td>' + (r.operator_name || '-') + ' (' + (r.operator_code || '-') + ')</td></tr>';
      rHtml += '<tr><th class="bg-light">circle_name</th><td>' + (r.circle_name || 'All') + '</td></tr>';
      rHtml += '<tr><th class="bg-light">amount_minor (Gross)</th><td class="font-weight-bold">₹' + (r.amount || '0.00') + '</td></tr>';
      rHtml += '<tr><th class="bg-light">margin_minor (Buyer Comm)</th><td class="text-danger font-weight-bold">₹' + (r.margin || '0.00') + '</td></tr>';
      rHtml += '<tr><th class="bg-light">cost_minor (Net Refunded)</th><td class="text-success font-weight-bold">₹' + (r.net_cost || '0.00') + '</td></tr>';
      rHtml += '<tr><th class="bg-light">provider_reference</th><td class="font-monospace">' + (r.provider_reference || '-') + '</td></tr>';
      rHtml += '<tr><th class="bg-light">created_at</th><td>' + (r.created_at || '-') + '</td></tr>';
      rHtml += '<tr><th class="bg-light">updated_at</th><td>' + (r.updated_at || '-') + '</td></tr>';
      rHtml += '<tr><th class="bg-light">dispute_reason</th><td>' + (r.dispute_reason || '-') + '</td></tr>';
      rHtml += '<tr><th class="bg-light">dispute_resolution_note</th><td>' + (r.dispute_resolution_note || '-') + '</td></tr>';
      $('#inspectRechargeTable').html(rHtml);

      // 2. Fill Buyer & Seller
      const b = data.buyer_user || {};
      let bHtml = '';
      bHtml += '<tr><th class="bg-light" style="width:140px;">User ID</th><td class="font-monospace small">' + (b.id || '-') + '</td></tr>';
      bHtml += '<tr><th class="bg-light">Username</th><td class="font-weight-bold text-dark font-monospace">@' + (b.username || '-') + '</td></tr>';
      bHtml += '<tr><th class="bg-light">Full Name</th><td>' + (b.name || '-') + '</td></tr>';
      bHtml += '<tr><th class="bg-light">Business Name</th><td>' + (b.business_name || '-') + '</td></tr>';
      $('#inspectBuyerTable').html(bHtml);

      const s = data.seller_user || {};
      let sHtml = '';
      sHtml += '<tr><th class="bg-light" style="width:140px;">Seller User ID</th><td class="font-monospace small">' + (s.id || '-') + '</td></tr>';
      sHtml += '<tr><th class="bg-light">Username</th><td class="font-weight-bold text-dark font-monospace">@' + (s.username || '-') + '</td></tr>';
      sHtml += '<tr><th class="bg-light">Full Name</th><td>' + (s.name || '-') + '</td></tr>';
      sHtml += '<tr><th class="bg-light">Business Name</th><td>' + (s.business_name || '-') + '</td></tr>';
      $('#inspectSellerTable').html(sHtml);

      // 3. Fill Wallet Entries
      const w = data.wallet_refund_entry || {};
      let wHtml = '';
      wHtml += '<tr><th class="bg-light" style="width:180px;">entry_type</th><td><span class="badge badge-success">REFUND</span></td></tr>';
      wHtml += '<tr><th class="bg-light">idempotency_key</th><td class="font-monospace text-primary font-weight-bold">' + (w.idempotency_key || '-') + '</td></tr>';
      wHtml += '<tr><th class="bg-light">amount credited</th><td class="font-weight-bold text-success font-monospace">₹' + (w.amount || '0.00') + '</td></tr>';
      wHtml += '<tr><th class="bg-light">reference_id</th><td class="font-monospace">' + (r.id || '-') + '</td></tr>';
      $('#inspectWalletTable').html(wHtml);

      // 4. Fill Dispute
      const d = data.dispute_record;
      if (d) {
        let dHtml = '<table class="table table-sm table-bordered" style="font-size:12.5px;">';
        dHtml += '<tr><th class="bg-light" style="width:160px;">dispute_code</th><td class="font-monospace font-weight-bold text-danger">' + (d.code || '-') + '</td></tr>';
        dHtml += '<tr><th class="bg-light">reason</th><td>' + (d.reason || '-') + '</td></tr>';
        dHtml += '<tr><th class="bg-light">status</th><td><span class="badge badge-success">' + (d.status || '-').toUpperCase() + '</span></td></tr>';
        dHtml += '<tr><th class="bg-light">resolution_note</th><td>' + (d.resolution_note || '-') + '</td></tr>';
        dHtml += '</table>';
        $('#disputeArea').html(dHtml);
      } else {
        $('#disputeArea').html('<div class="alert alert-light border text-muted">No dispute ticket formally registered on this order (Refund occurred directly via Admin or System Failure).</div>');
      }

      // 5. Fill Raw JSON
      $('#rawJsonBox').text(dataStr);

      $('#modalAllTablesDetail').modal('show');
    });

    $('#btnCopyJson').on('click', function() {
      navigator.clipboard.writeText($('#rawJsonBox').text()).then(() => alert('✓ JSON Copied to clipboard!'));
    });
  </script>
</body>
</html>`;

    const finalHtml = await addPanelChrome(html, {
      role: 'admin',
      userId: admin.id,
      db,
      currentPath: '/admin/reports/refund-report',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
    });
    response.end(finalHtml);
  }

  return {
    sendAdminRefundReportPage,
  };
};
