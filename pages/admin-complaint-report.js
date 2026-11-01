'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminComplaintReportPage({ db, formatMinorUnits, decryptMobile, sendJson, httpError }) {

  function formatDateTime(isoString) {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
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

  function buildConditions(params) {
    const fromDate = String(params.get('fromDate') || '').trim();
    const toDate = String(params.get('toDate') || '').trim();
    const user = String(params.get('user') || params.get('buyer') || '').trim();
    const seller = String(params.get('seller') || '').trim();
    const operatorId = String(params.get('operatorId') || '').trim();
    const status = String(params.get('status') || '').trim().toLowerCase();
    const search = String(params.get('search') || '').trim();
    const limit = String(params.get('limit') || '50').trim().toLowerCase();

    const conditions = ["(r.dispute_status IS NOT NULL AND r.dispute_status NOT IN ('none', '') OR d.id IS NOT NULL)"];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (fromDate) {
      conditions.push(`COALESCE(r.dispute_created_at, d.created_at, r.created_at) >= (${add(fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (toDate) {
      conditions.push(`COALESCE(r.dispute_created_at, d.created_at, r.created_at) < (((${add(toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (user) {
      const uLike = add(`%${user}%`);
      conditions.push(`(b.username ILIKE ${uLike} OR COALESCE(b.name, '') ILIKE ${uLike} OR COALESCE(b.email, '') ILIKE ${uLike})`);
    }
    if (seller) {
      const sLike = add(`%${seller}%`);
      conditions.push(`(s.username ILIKE ${sLike} OR COALESCE(s.name, '') ILIKE ${sLike})`);
    }
    if (operatorId && /^[0-9a-f-]{36}$/i.test(operatorId)) {
      conditions.push(`r.operator_id = ${add(operatorId)}`);
    }
    if (status && status !== 'all') {
      conditions.push(`LOWER(COALESCE(r.dispute_status, d.status, 'pending')) = ${add(status)}`);
    }
    if (search) {
      const q = add(`%${search}%`);
      conditions.push(`(r.mobile_number ILIKE ${q} OR COALESCE(r.idempotency_key, '') ILIKE ${q} OR r.id::text ILIKE ${q} OR COALESCE(d.dispute_code, '') ILIKE ${q} OR COALESCE(r.dispute_reason, d.reason, '') ILIKE ${q} OR b.username ILIKE ${q} OR COALESCE(b.name, '') ILIKE ${q})`);
    }

    let limitNum = 50;
    if (limit === '25') limitNum = 25;
    else if (limit === '100') limitNum = 100;
    else if (limit === '200') limitNum = 200;
    else if (limit === 'all') limitNum = 2000;

    return {
      whereClause: `WHERE ${conditions.join(' AND ')}`,
      values,
      fromDate,
      toDate,
      user,
      seller,
      operatorId,
      status,
      search,
      limit: String(limitNum),
    };
  }

  async function streamCsv(searchParams, response) {
    const filterInfo = buildConditions(searchParams);

    const query = `
      SELECT r.id AS order_id, r.user_id AS buyer_user_id, r.seller_user_id,
             r.mobile_number, r.operator_name, r.circle_name, r.amount_minor,
             r.status AS recharge_status, r.idempotency_key, r.provider_reference,
             COALESCE(r.dispute_status, d.status, 'pending') AS dispute_status,
             COALESCE(r.dispute_reason, d.reason, 'No reason specified') AS dispute_reason,
             COALESCE(r.dispute_resolution_note, d.resolution_note, '') AS dispute_resolution_note,
             COALESCE(r.dispute_created_at, d.created_at, r.created_at) AS dispute_created_at,
             COALESCE(r.dispute_resolved_at, d.resolved_at) AS dispute_resolved_at,
             b.username AS buyer_username, b.name AS buyer_name, b.phone_ciphertext AS buyer_phone, b.email AS buyer_email,
             s.username AS seller_username, s.name AS seller_name,
             res.username AS resolved_by_username, res.name AS resolved_by_name,
             d.dispute_code
      FROM recharge_orders r
      LEFT JOIN users b ON b.id = r.user_id
      LEFT JOIN users s ON s.id = r.seller_user_id
      LEFT JOIN users res ON res.id = r.dispute_resolved_by
      LEFT JOIN recharge_disputes d ON d.order_id = r.id
      ${filterInfo.whereClause}
      ORDER BY COALESCE(r.dispute_created_at, d.created_at, r.created_at) DESC
      LIMIT 10000
    `;

    const result = await db.query(query, filterInfo.values);
    const fileName = `user_complaints_${filterInfo.fromDate || 'all'}_to_${filterInfo.toDate || 'all'}.csv`;

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    });

    const csvHeader = [
      'Complaint Code',
      'Order ID',
      'Buyer Username',
      'Buyer Name',
      'Buyer Mobile',
      'Buyer Email',
      'Seller Username',
      'Seller Name',
      'Recharged Mobile',
      'Operator',
      'Circle',
      'Amount (INR)',
      'Complaint Reason',
      'Complaint Status',
      'Complaint Date (IST)',
      'Resolved Date (IST)',
      'Resolved By',
      'Resolution Note',
    ].join(',') + '\r\n';

    const lines = [csvHeader];
    for (const row of result.rows) {
      let buyerMobile = '';
      if (row.buyer_phone && typeof decryptMobile === 'function') {
        try { buyerMobile = decryptMobile(row.buyer_phone); } catch {}
      }

      const line = [
        `"${String(row.dispute_code || ('CMP-' + row.order_id.slice(0, 8).toUpperCase())).replace(/"/g, '""')}"`,
        `"${String(row.order_id).replace(/"/g, '""')}"`,
        `"${String(row.buyer_username || '').replace(/"/g, '""')}"`,
        `"${String(row.buyer_name || '').replace(/"/g, '""')}"`,
        `"${buyerMobile}"`,
        `"${String(row.buyer_email || '').replace(/"/g, '""')}"`,
        `"${String(row.seller_username || '').replace(/"/g, '""')}"`,
        `"${String(row.seller_name || '').replace(/"/g, '""')}"`,
        `"${String(row.mobile_number || '').replace(/"/g, '""')}"`,
        `"${String(row.operator_name || '').replace(/"/g, '""')}"`,
        `"${String(row.circle_name || '').replace(/"/g, '""')}"`,
        `"${formatMinorUnits(row.amount_minor || 0)}"`,
        `"${String(row.dispute_reason || '').replace(/"/g, '""')}"`,
        `"${String(row.dispute_status || '').toUpperCase()}"`,
        `"${formatDateTime(row.dispute_created_at)}"`,
        `"${formatDateTime(row.dispute_resolved_at)}"`,
        `"${String(row.resolved_by_name || row.resolved_by_username || '-').replace(/"/g, '""')}"`,
        `"${String(row.dispute_resolution_note || '').replace(/"/g, '""')}"`,
      ].join(',') + '\r\n';
      lines.push(line);
    }

    response.end(lines.join(''));
  }

  async function sendAdminComplaintReportPage(admin, response, searchParams = new URLSearchParams()) {
    if (searchParams.get('format') === 'csv' || searchParams.get('export') === 'csv') {
      return streamCsv(searchParams, response);
    }

    const filterInfo = buildConditions(searchParams);

    // Fetch operators list for filter dropdown
    const opListRes = await db.query(
      `SELECT id, operator_name, service_type FROM operator_definitions WHERE deleted_at IS NULL ORDER BY operator_name ASC`
    );

    // Fetch KPI summaries
    const kpiRes = await db.query(`
      SELECT
        COUNT(*)::int AS total_complaints,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(r.dispute_status, d.status, 'pending')) = 'pending')::int AS pending_complaints,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(r.dispute_status, d.status, 'pending')) = 'accepted')::int AS accepted_complaints,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(r.dispute_status, d.status, 'pending')) = 'rejected')::int AS rejected_complaints,
        COALESCE(SUM(r.amount_minor), 0)::bigint AS total_disputed_minor
      FROM recharge_orders r
      LEFT JOIN recharge_disputes d ON d.order_id = r.id
      WHERE (r.dispute_status IS NOT NULL AND r.dispute_status NOT IN ('none', '') OR d.id IS NOT NULL)
    `);
    const kpi = kpiRes.rows[0] || {
      total_complaints: 0,
      pending_complaints: 0,
      accepted_complaints: 0,
      rejected_complaints: 0,
      total_disputed_minor: 0,
    };

    // Query filtered complaints
    const query = `
      SELECT r.id AS order_id, r.user_id AS buyer_user_id, r.seller_user_id,
             r.mobile_number, r.operator_name, r.circle_name, r.amount_minor,
             r.status AS recharge_status, r.idempotency_key, r.provider_reference,
             COALESCE(r.dispute_status, d.status, 'pending') AS dispute_status,
             COALESCE(r.dispute_reason, d.reason, 'No reason specified') AS dispute_reason,
             COALESCE(r.dispute_resolution_note, d.resolution_note, '') AS dispute_resolution_note,
             COALESCE(r.dispute_created_at, d.created_at, r.created_at) AS dispute_created_at,
             COALESCE(r.dispute_resolved_at, d.resolved_at) AS dispute_resolved_at,
             b.username AS buyer_username, b.name AS buyer_name, b.phone_ciphertext AS buyer_phone, b.email AS buyer_email,
             s.username AS seller_username, s.name AS seller_name,
             res.username AS resolved_by_username, res.name AS resolved_by_name,
             d.dispute_code, d.id AS dispute_id
      FROM recharge_orders r
      LEFT JOIN users b ON b.id = r.user_id
      LEFT JOIN users s ON s.id = r.seller_user_id
      LEFT JOIN users res ON res.id = r.dispute_resolved_by
      LEFT JOIN recharge_disputes d ON d.order_id = r.id
      ${filterInfo.whereClause}
      ORDER BY COALESCE(r.dispute_created_at, d.created_at, r.created_at) DESC
      LIMIT ${Number(filterInfo.limit) || 50}
    `;

    const result = await db.query(query, filterInfo.values);

    // Build rows HTML
    const rowsHtml = result.rows.map((row, idx) => {
      let buyerMobile = '';
      if (row.buyer_phone && typeof decryptMobile === 'function') {
        try { buyerMobile = decryptMobile(row.buyer_phone); } catch {}
      }

      const complaintCode = row.dispute_code || ('CMP-' + row.order_id.slice(0, 8).toUpperCase());
      const dStatus = String(row.dispute_status || 'pending').toLowerCase();

      let statusBadge = '<span class="badge badge-warning text-white px-2 py-1"><i class="fa fa-clock-o mr-1"></i> Pending</span>';
      if (dStatus === 'accepted') {
        statusBadge = '<span class="badge badge-success px-2 py-1"><i class="fa fa-check-circle mr-1"></i> Accepted & Refunded</span>';
      } else if (dStatus === 'rejected') {
        statusBadge = '<span class="badge badge-danger px-2 py-1"><i class="fa fa-times-circle mr-1"></i> Rejected (Fake)</span>';
      }

      const modalPayload = escapeHtml(JSON.stringify({
        complaintCode,
        orderId: row.order_id,
        idempotencyKey: row.idempotency_key || '-',
        buyerUsername: row.buyer_username || '-',
        buyerName: row.buyer_name || 'Buyer',
        buyerMobile: buyerMobile || '-',
        buyerEmail: row.buyer_email || '-',
        sellerUsername: row.seller_username || 'System / Default',
        sellerName: row.seller_name || '-',
        rechargeMobile: row.mobile_number || '-',
        operatorName: row.operator_name || '-',
        circleName: row.circle_name || '-',
        amount: formatMinorUnits(row.amount_minor || 0),
        reason: row.dispute_reason || 'No reason specified',
        status: dStatus,
        createdAt: formatDateTime(row.dispute_created_at),
        resolvedAt: formatDateTime(row.dispute_resolved_at),
        resolvedBy: row.resolved_by_name || row.resolved_by_username || '-',
        resolutionNote: row.dispute_resolution_note || '-',
      }));

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <span class="badge badge-primary font-monospace">${escapeHtml(complaintCode)}</span>
            <div class="small text-muted font-monospace mt-1" title="Order ID: ${escapeHtml(row.order_id)}">
              ${escapeHtml(row.order_id.slice(0, 13))}...
            </div>
          </td>
          <td>
            <div class="font-weight-bold text-dark">${escapeHtml(row.buyer_name || 'Buyer')}</div>
            <div class="small text-muted font-monospace"><i class="fa fa-user mr-1"></i>${escapeHtml(row.buyer_username || '-')}</div>
            ${buyerMobile ? `<div class="small text-muted"><i class="fa fa-phone mr-1"></i>${escapeHtml(buyerMobile)}</div>` : ''}
          </td>
          <td>
            <div class="font-weight-bold text-dark">${escapeHtml(row.seller_name || row.seller_username || 'System Route')}</div>
            ${row.seller_username ? `<div class="small text-muted font-monospace">${escapeHtml(row.seller_username)}</div>` : ''}
          </td>
          <td>
            <div class="font-weight-bold font-monospace text-primary" style="font-size:14px;">
              ${escapeHtml(row.mobile_number || '-')}
            </div>
            <div class="small text-muted">
              ${escapeHtml(row.operator_name || '-')} · ${escapeHtml(row.circle_name || 'All')}
            </div>
          </td>
          <td class="text-right">
            <span class="font-weight-bold text-success font-monospace" style="font-size:14px;">
              ₹${formatMinorUnits(row.amount_minor || 0)}
            </span>
          </td>
          <td style="max-width: 250px;">
            <div class="text-dark small font-weight-bold text-truncate" title="${escapeHtml(row.dispute_reason || '')}">
              ${escapeHtml(row.dispute_reason || 'No reason specified')}
            </div>
          </td>
          <td class="text-center" style="white-space:nowrap;">
            ${statusBadge}
          </td>
          <td class="small text-muted" style="white-space:nowrap;">
            ${formatDateTime(row.dispute_created_at)}
          </td>
          <td>
            ${row.dispute_resolved_at ? `
              <div class="small font-weight-bold text-dark">${formatDateTime(row.dispute_resolved_at)}</div>
              <div class="small text-muted text-truncate" style="max-width:180px;" title="${escapeHtml(row.dispute_resolution_note || '')}">
                <i class="fa fa-comment-o mr-1"></i>${escapeHtml(row.dispute_resolution_note || '-')}
              </div>
            ` : '<span class="text-muted small font-italic">Unresolved</span>'}
          </td>
          <td class="text-center" style="white-space:nowrap;">
            <button type="button" class="btn btn-xs btn-outline-info btn-view-complaint" data-json="${modalPayload}" title="View Full Details">
              <i class="fa fa-eye mr-1"></i> Details
            </button>
            ${dStatus === 'pending' ? `
              <button type="button" class="btn btn-xs btn-success ml-1 btn-quick-accept" data-id="${row.order_id}" data-user="${escapeHtml(row.buyer_name || row.buyer_username)}" data-amount="₹${formatMinorUnits(row.amount_minor || 0)}" title="Accept & Refund">
                <i class="fa fa-check"></i>
              </button>
              <button type="button" class="btn btn-xs btn-danger ml-1 btn-quick-reject" data-id="${row.order_id}" data-user="${escapeHtml(row.buyer_name || row.buyer_username)}" title="Reject Complaint">
                <i class="fa fa-times"></i>
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    const operatorFilterOpts = opListRes.rows.map(o => `
      <option value="${o.id}" ${filterInfo.operatorId === o.id ? 'selected' : ''}>${escapeHtml(o.operator_name)} (${escapeHtml(o.service_type)})</option>
    `).join('');

    const csvUrl = `/admin/reports/complaint?${searchParams.toString()}&format=csv`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>User Complaints Report - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    .kpi-card { border-radius: 8px; border: 1px solid #e2e8f0; padding: 12px 16px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .kpi-title { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px; }
    .kpi-val { font-size: 20px; font-weight: 800; color: #1e293b; }
    .filter-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px; }
    .table td, .table th { vertical-align: middle; font-size: 13px; }
    .btn-xs { padding: 3px 8px; font-size: 11px; border-radius: 4px; }
  </style>
</head>
<body class="app sidebar-mini">
  <div class="page">
    <div class="page-main">
      ${renderAdminNavigation('/admin/reports/complaint')}

      <main class="main-content">
        <div class="container-fluid px-3 pt-3">
          <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div>
              <h4 class="page-title mb-0 font-weight-bold text-dark">
                <i class="fa fa-exclamation-circle text-danger mr-2"></i> User Complaints Report
              </h4>
              <p class="text-muted small mb-0">Sabhi users dwara lagaye gaye complaints/disputes ki complete list aur resolution details.</p>
            </div>
            <div>
              <a href="${csvUrl}" class="btn btn-sm btn-outline-success font-weight-bold mr-2">
                <i class="fa fa-download mr-1"></i> Export CSV
              </a>
              <a href="/admin/reports/complaint" class="btn btn-sm btn-outline-secondary font-weight-bold">
                <i class="fa fa-refresh mr-1"></i> Refresh
              </a>
            </div>
          </div>

          <!-- KPI Summary Cards -->
          <div class="row mb-3">
            <div class="col-xl-2 col-md-4 col-6 mb-2">
              <div class="kpi-card border-left border-primary" style="border-left-width: 4px !important;">
                <div class="kpi-title">Total Complaints</div>
                <div class="kpi-val text-primary">${kpi.total_complaints}</div>
              </div>
            </div>
            <div class="col-xl-2 col-md-4 col-6 mb-2">
              <div class="kpi-card border-left border-warning" style="border-left-width: 4px !important;">
                <div class="kpi-title">Pending</div>
                <div class="kpi-val text-warning">${kpi.pending_complaints}</div>
              </div>
            </div>
            <div class="col-xl-2 col-md-4 col-6 mb-2">
              <div class="kpi-card border-left border-success" style="border-left-width: 4px !important;">
                <div class="kpi-title">Accepted &amp; Refunded</div>
                <div class="kpi-val text-success">${kpi.accepted_complaints}</div>
              </div>
            </div>
            <div class="col-xl-2 col-md-4 col-6 mb-2">
              <div class="kpi-card border-left border-danger" style="border-left-width: 4px !important;">
                <div class="kpi-title">Rejected / Fake</div>
                <div class="kpi-val text-danger">${kpi.rejected_complaints}</div>
              </div>
            </div>
            <div class="col-xl-4 col-md-8 col-12 mb-2">
              <div class="kpi-card border-left border-info" style="border-left-width: 4px !important;">
                <div class="kpi-title">Total Disputed Amount</div>
                <div class="kpi-val text-info">₹${formatMinorUnits(kpi.total_disputed_minor || 0)}</div>
              </div>
            </div>
          </div>

          <div id="topAlert" class="alert alert-success font-weight-bold" style="display:none;"></div>
          <div id="topError" class="alert alert-danger font-weight-bold" style="display:none;"></div>

          <!-- Filter Form -->
          <div class="filter-card">
            <form method="GET" action="/admin/reports/complaint" id="filterForm">
              <div class="form-row">
                <div class="form-group col-md-3 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">User (Buyer)</label>
                  <input type="text" class="form-control form-control-sm" name="user" value="${escapeHtml(filterInfo.user)}" placeholder="Username or Name">
                </div>
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">Operator</label>
                  <select class="form-control form-control-sm" name="operatorId">
                    <option value="">All Operators</option>
                    ${operatorFilterOpts}
                  </select>
                </div>
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">Complaint Status</label>
                  <select class="form-control form-control-sm" name="status">
                    <option value="all" ${filterInfo.status === 'all' || !filterInfo.status ? 'selected' : ''}>All Status</option>
                    <option value="pending" ${filterInfo.status === 'pending' ? 'selected' : ''}>Pending (${kpi.pending_complaints})</option>
                    <option value="accepted" ${filterInfo.status === 'accepted' ? 'selected' : ''}>Accepted &amp; Refunded (${kpi.accepted_complaints})</option>
                    <option value="rejected" ${filterInfo.status === 'rejected' ? 'selected' : ''}>Rejected (${kpi.rejected_complaints})</option>
                  </select>
                </div>
                <div class="form-group col-md-3 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">Keyword Search</label>
                  <input type="text" class="form-control form-control-sm" name="search" value="${escapeHtml(filterInfo.search)}" placeholder="Mobile, Code, Reason, Order ID...">
                </div>
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">Per Page</label>
                  <select class="form-control form-control-sm" name="limit">
                    <option value="25" ${filterInfo.limit === '25' ? 'selected' : ''}>25 Records</option>
                    <option value="50" ${filterInfo.limit === '50' ? 'selected' : ''}>50 Records</option>
                    <option value="100" ${filterInfo.limit === '100' ? 'selected' : ''}>100 Records</option>
                    <option value="200" ${filterInfo.limit === '200' ? 'selected' : ''}>200 Records</option>
                    <option value="all" ${filterInfo.limit === '2000' ? 'selected' : ''}>All Records</option>
                  </select>
                </div>
              </div>
              <div class="form-row align-items-center">
                <div class="form-group col-md-3 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">From Date</label>
                  <input type="date" class="form-control form-control-sm" id="fromDate" name="fromDate" value="${escapeHtml(filterInfo.fromDate)}">
                </div>
                <div class="form-group col-md-3 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">To Date</label>
                  <input type="date" class="form-control form-control-sm" id="toDate" name="toDate" value="${escapeHtml(filterInfo.toDate)}">
                </div>
                <div class="form-group col-md-6 col-12 mb-2 d-flex align-items-end gap-1 flex-wrap">
                  <button type="submit" class="btn btn-sm btn-primary px-3 mr-2 font-weight-bold">
                    <i class="fa fa-filter mr-1"></i> Apply Filter
                  </button>
                  <a href="/admin/reports/complaint" class="btn btn-sm btn-light border mr-2">
                    <i class="fa fa-refresh mr-1"></i> Reset
                  </a>
                  <div class="btn-group btn-group-sm mt-1">
                    <button type="button" class="btn btn-outline-secondary" onclick="setQuickDate('today')">Today</button>
                    <button type="button" class="btn btn-outline-secondary" onclick="setQuickDate('yesterday')">Yesterday</button>
                    <button type="button" class="btn btn-outline-secondary" onclick="setQuickDate('last7')">Last 7D</button>
                    <button type="button" class="btn btn-outline-secondary" onclick="setQuickDate('month')">This Month</button>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <!-- Main Complaints Table -->
          <div class="card shadow-sm border-0 mb-4">
            <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
              <h6 class="mb-0 font-weight-bold text-dark">
                Complaints List (${result.rowCount} shown / ${kpi.total_complaints} total)
              </h6>
            </div>
            <div class="table-responsive">
              <table class="table table-bordered table-striped table-hover mb-0">
                <thead class="thead-dark">
                  <tr>
                    <th style="width: 35px; text-align: center;">#</th>
                    <th>Complaint ID</th>
                    <th>Complainant (User)</th>
                    <th>Seller / Route</th>
                    <th>Recharged Mobile</th>
                    <th style="text-align: right;">Amount</th>
                    <th>Complaint Reason</th>
                    <th style="text-align: center;">Status</th>
                    <th>Complaint Date</th>
                    <th>Resolution</th>
                    <th style="text-align: center;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="11" class="text-center py-4 text-muted font-weight-bold">No user complaints found matching the filters.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>

  <!-- Complaint Details Modal -->
  <div class="modal fade" id="complaintModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-lg" role="document">
      <div class="modal-content">
        <div class="modal-header bg-primary text-white py-2">
          <h5 class="modal-title font-weight-bold" id="cModalTitle">Complaint Details</h5>
          <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <div class="row">
            <div class="col-md-6 mb-3">
              <div class="card bg-light border-0 p-3 h-100">
                <h6 class="font-weight-bold text-dark mb-2"><i class="fa fa-user text-primary mr-1"></i> Complainant User</h6>
                <div><strong>Name:</strong> <span id="mBuyerName">-</span></div>
                <div><strong>Username:</strong> <span id="mBuyerUser">-</span></div>
                <div><strong>Mobile:</strong> <span id="mBuyerMobile">-</span></div>
                <div><strong>Email:</strong> <span id="mBuyerEmail">-</span></div>
              </div>
            </div>
            <div class="col-md-6 mb-3">
              <div class="card bg-light border-0 p-3 h-100">
                <h6 class="font-weight-bold text-dark mb-2"><i class="fa fa-bolt text-warning mr-1"></i> Transaction Info</h6>
                <div><strong>Recharged Number:</strong> <span id="mNumber" class="font-weight-bold text-primary font-monospace">-</span></div>
                <div><strong>Operator / Circle:</strong> <span id="mOperator">-</span></div>
                <div><strong>Amount:</strong> <span id="mAmount" class="font-weight-bold text-success font-monospace">-</span></div>
                <div><strong>Txn / Order ID:</strong> <span id="mOrderId" class="font-monospace small">-</span></div>
              </div>
            </div>
          </div>
          <div class="card bg-light border-0 p-3 mb-3">
            <h6 class="font-weight-bold text-danger mb-2"><i class="fa fa-comment mr-1"></i> User's Complaint Reason</h6>
            <div id="mReason" class="font-weight-bold text-dark">-</div>
            <div class="small text-muted mt-1">Submitted on: <span id="mCreatedAt">-</span></div>
          </div>
          <div class="card bg-light border-0 p-3">
            <h6 class="font-weight-bold text-dark mb-2"><i class="fa fa-check-square-o text-success mr-1"></i> Status &amp; Resolution</h6>
            <div><strong>Status:</strong> <span id="mStatusBadge">-</span></div>
            <div><strong>Resolved Date:</strong> <span id="mResolvedAt">-</span></div>
            <div><strong>Resolved By:</strong> <span id="mResolvedBy">-</span></div>
            <div><strong>Admin Resolution Note:</strong> <span id="mNote">-</span></div>
          </div>
        </div>
        <div class="modal-footer py-2">
          <button type="button" class="btn btn-secondary btn-sm font-weight-bold" data-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
  <script src="/auth-client.js"></script>
  <script>
    function setQuickDate(type) {
      const today = new Date();
      const formatDate = (d) => d.toISOString().split('T')[0];
      const fromEl = document.getElementById('fromDate');
      const toEl = document.getElementById('toDate');

      if (type === 'today') {
        fromEl.value = formatDate(today);
        toEl.value = formatDate(today);
      } else if (type === 'yesterday') {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        fromEl.value = formatDate(y);
        toEl.value = formatDate(y);
      } else if (type === 'last7') {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        fromEl.value = formatDate(d);
        toEl.value = formatDate(today);
      } else if (type === 'month') {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        fromEl.value = formatDate(start);
        toEl.value = formatDate(today);
      }
      document.getElementById('filterForm').submit();
    }

    // View Details Modal
    document.querySelectorAll('.btn-view-complaint').forEach(btn => {
      btn.addEventListener('click', () => {
        try {
          const d = JSON.parse(btn.dataset.json);
          document.getElementById('cModalTitle').textContent = 'Complaint ' + d.complaintCode;
          document.getElementById('mBuyerName').textContent = d.buyerName;
          document.getElementById('mBuyerUser').textContent = d.buyerUsername;
          document.getElementById('mBuyerMobile').textContent = d.buyerMobile;
          document.getElementById('mBuyerEmail').textContent = d.buyerEmail;
          document.getElementById('mNumber').textContent = d.rechargeMobile;
          document.getElementById('mOperator').textContent = d.operatorName + ' (' + d.circleName + ')';
          document.getElementById('mAmount').textContent = '₹' + d.amount;
          document.getElementById('mOrderId').textContent = d.orderId;
          document.getElementById('mReason').textContent = d.reason;
          document.getElementById('mCreatedAt').textContent = d.createdAt;
          document.getElementById('mResolvedAt').textContent = d.resolvedAt;
          document.getElementById('mResolvedBy').textContent = d.resolvedBy;
          document.getElementById('mNote').textContent = d.resolutionNote;

          let badge = '<span class="badge badge-warning text-white font-weight-bold">Pending</span>';
          if (d.status === 'accepted') badge = '<span class="badge badge-success font-weight-bold">Accepted &amp; Refunded</span>';
          if (d.status === 'rejected') badge = '<span class="badge badge-danger font-weight-bold">Rejected</span>';
          document.getElementById('mStatusBadge').innerHTML = badge;

          $('#complaintModal').modal('show');
        } catch (e) {
          alert('Could not parse complaint details.');
        }
      });
    });

    const topAlert = document.getElementById('topAlert');
    const topError = document.getElementById('topError');

    // Quick Accept & Refund
    document.querySelectorAll('.btn-quick-accept').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.id;
        const user = btn.dataset.user;
        const amount = btn.dataset.amount;
        if (!confirm('Accept this complaint and issue full refund of ' + amount + ' to ' + user + '?')) return;

        btn.disabled = true;
        topAlert.style.display = 'none';
        topError.style.display = 'none';
        try {
          const res = await fetch('/api/admin/disputes/accept', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ orderId, note: 'Accepted and refunded by Admin via Complaint Report' })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to accept complaint.');
          topAlert.textContent = '✓ Complaint accepted and refund successfully credited!';
          topAlert.style.display = 'block';
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          topError.textContent = err.message;
          topError.style.display = 'block';
          btn.disabled = false;
        }
      });
    });

    // Quick Reject
    document.querySelectorAll('.btn-quick-reject').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.id;
        const user = btn.dataset.user;
        const reason = prompt('Enter rejection note for ' + user + ':', 'Operator confirmed success / Invalid complaint');
        if (reason === null) return;

        btn.disabled = true;
        topAlert.style.display = 'none';
        topError.style.display = 'none';
        try {
          const res = await fetch('/api/admin/disputes/reject', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ orderId, note: reason })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to reject complaint.');
          topAlert.textContent = '✓ Complaint rejected.';
          topAlert.style.display = 'block';
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          topError.textContent = err.message;
          topError.style.display = 'block';
          btn.disabled = false;
        }
      });
    });
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
    response.end(await addPanelChrome(html, { role: 'admin', userId: admin.id, db, currentPath: '/admin/reports/complaint' }));
  }

  return { sendAdminComplaintReportPage };
};
