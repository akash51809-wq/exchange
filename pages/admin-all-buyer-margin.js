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

const SERVICE_TYPES = [
  'Mobile Recharge', 'DTH', 'Postpaid', 'Electricity', 'Gas', 'Water',
  'Broadband', 'Insurance', 'FASTag', 'Other'
];

module.exports = function createAdminAllBuyerMarginPage({ db, formatMinorUnits, decryptMobile, sendJson, httpError }) {

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
        hour12: true,
      });
    } catch {
      return isoString;
    }
  }

  function buildConditions(params) {
    const fromDate = String(params.get('fromDate') || '').trim();
    const toDate = String(params.get('toDate') || '').trim();
    const buyer = String(params.get('buyer') || params.get('user') || '').trim();
    const operatorId = String(params.get('operatorId') || '').trim();
    const circle = String(params.get('circle') || '').trim();
    const serviceType = String(params.get('serviceType') || '').trim();
    const status = String(params.get('status') || '').trim().toLowerCase();
    const search = String(params.get('search') || '').trim();

    const conditions = ['m.deleted_at IS NULL'];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (fromDate) {
      conditions.push(`m.created_at >= (${add(fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (toDate) {
      conditions.push(`m.created_at < (((${add(toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (buyer) {
      const bLike = add(`%${buyer}%`);
      conditions.push(`(u.username ILIKE ${bLike} OR COALESCE(u.name, '') ILIKE ${bLike} OR COALESCE(u.email, '') ILIKE ${bLike})`);
    }
    if (operatorId && /^[0-9a-f-]{36}$/i.test(operatorId)) {
      conditions.push(`m.operator_id = ${add(operatorId)}`);
    }
    if (circle && circle !== 'all') {
      conditions.push(`m.circle_name ILIKE ${add(circle)}`);
    }
    if (serviceType && serviceType !== 'all') {
      conditions.push(`o.service_type ILIKE ${add(serviceType)}`);
    }
    if (status && status !== 'all') {
      conditions.push(`m.is_active = ${add(status === 'active')}`);
    }
    if (search) {
      const q = add(`%${search}%`);
      conditions.push(`(u.username ILIKE ${q} OR COALESCE(u.name, '') ILIKE ${q} OR o.operator_name ILIKE ${q} OR COALESCE(m.operator_code, '') ILIKE ${q} OR m.circle_name ILIKE ${q})`);
    }

    return {
      whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      values,
      fromDate,
      toDate,
      buyer,
      operatorId,
      circle,
      serviceType,
      status,
      search,
    };
  }

  async function streamCsv(searchParams, response) {
    const filterInfo = buildConditions(searchParams);
    const query = `
      SELECT m.id, m.user_id, u.username, u.name as user_name, u.phone_ciphertext,
             o.operator_name, o.service_type, o.operator_code as admin_op_code,
             m.circle_name, m.amount_type, m.amount_min_minor, m.amount_max_minor,
             m.commission_percent, m.limit_minor, m.limit_used_minor, m.limit_type,
             m.with_gst, m.is_active, m.is_roffer, m.operator_code, m.created_at, m.updated_at
      FROM buyer_margin_settings m
      JOIN users u ON u.id = m.user_id
      JOIN operator_definitions o ON o.id = m.operator_id
      ${filterInfo.whereClause}
      ORDER BY m.created_at DESC
      LIMIT 10000
    `;

    const result = await db.query(query, filterInfo.values);
    const fileName = `buyer_margins_${filterInfo.fromDate || 'all'}_to_${filterInfo.toDate || 'all'}.csv`;

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    });

    const csvHeader = [
      'Margin ID',
      'Buyer Name',
      'Buyer Username',
      'Buyer Mobile',
      'Operator Name',
      'Service Type',
      'Operator Code',
      'Circle',
      'Amount Type',
      'Amount Min',
      'Amount Max',
      'Commission / Margin (%)',
      'Limit Amount (INR)',
      'Limit Used (INR)',
      'Limit Type',
      'GST Included',
      'R-Offer',
      'Status',
      'Created At (IST)',
    ].join(',') + '\r\n';

    const lines = [csvHeader];
    for (const row of result.rows) {
      let mobile = '';
      if (row.phone_ciphertext) {
        try { mobile = decryptMobile(row.phone_ciphertext); } catch {}
      }

      let amountDisplay = 'All Amounts';
      if (row.amount_type === 'fixed') {
        amountDisplay = `Fixed: ₹${formatMinorUnits(row.amount_min_minor || 0)}`;
      } else if (row.amount_type === 'range') {
        amountDisplay = `₹${formatMinorUnits(row.amount_min_minor || 0)} - ₹${formatMinorUnits(row.amount_max_minor || 0)}`;
      }

      const line = [
        `"BM-${row.id.slice(0, 8).toUpperCase()}"`,
        `"${String(row.user_name || '').replace(/"/g, '""')}"`,
        `"${String(row.username || '').replace(/"/g, '""')}"`,
        `"${mobile}"`,
        `"${String(row.operator_name || '').replace(/"/g, '""')}"`,
        `"${String(row.service_type || '').replace(/"/g, '""')}"`,
        `"${String(row.operator_code || row.admin_op_code || '').replace(/"/g, '""')}"`,
        `"${String(row.circle_name || 'All').replace(/"/g, '""')}"`,
        `"${row.amount_type}"`,
        `"${row.amount_min_minor ? formatMinorUnits(row.amount_min_minor) : '0'}"`,
        `"${row.amount_max_minor ? formatMinorUnits(row.amount_max_minor) : '0'}"`,
        `"${Number(row.commission_percent || 0).toFixed(4)}%"`,
        `"${formatMinorUnits(row.limit_minor || 0)}"`,
        `"${formatMinorUnits(row.limit_used_minor || 0)}"`,
        `"${row.limit_type || 'daily'}"`,
        `"${row.with_gst ? 'Yes' : 'No'}"`,
        `"${row.is_roffer || 'all'}"`,
        `"${row.is_active ? 'Active' : 'Inactive'}"`,
        `"${formatDateTime(row.created_at)}"`,
      ].join(',') + '\r\n';
      lines.push(line);
    }

    response.end(lines.join(''));
  }

  async function sendAdminAllBuyerMarginPage(admin, response, searchParams = new URLSearchParams()) {
    if (searchParams.get('format') === 'csv' || searchParams.get('export') === 'csv') {
      return streamCsv(searchParams, response);
    }

    const filterInfo = buildConditions(searchParams);

    // Fetch operators list for dropdown
    const opListRes = await db.query(
      `SELECT id, operator_name, service_type, operator_code FROM operator_definitions WHERE deleted_at IS NULL ORDER BY operator_name ASC`
    );

    // Query main report data
    const query = `
      SELECT m.id, m.user_id, u.username, u.name as user_name, u.phone_ciphertext,
             o.id as operator_id, o.operator_name, o.service_type, o.operator_code as admin_op_code,
             m.circle_name, m.amount_type, m.amount_min_minor, m.amount_max_minor,
             m.commission_percent, m.limit_minor, m.limit_used_minor, m.limit_type,
             m.with_gst, m.is_active, m.is_roffer, m.operator_code, m.created_at, m.updated_at
      FROM buyer_margin_settings m
      JOIN users u ON u.id = m.user_id
      JOIN operator_definitions o ON o.id = m.operator_id
      ${filterInfo.whereClause}
      ORDER BY m.created_at DESC
      LIMIT 1000
    `;

    const result = await db.query(query, filterInfo.values);

    // Calculate KPI summaries
    const totalCount = result.rowCount !== undefined ? result.rowCount : (result.rows ? result.rows.length : 0);
    let activeCount = 0;
    let inactiveCount = 0;
    const uniqueBuyers = new Set();
    let totalCommission = 0;

    for (const r of result.rows) {
      if (r.is_active) activeCount++;
      else inactiveCount++;
      uniqueBuyers.add(r.user_id);
      totalCommission += Number(r.commission_percent || 0);
    }
    const avgCommission = totalCount > 0 ? (totalCommission / totalCount).toFixed(2) : '0.00';

    // Build rows HTML
    const rowsHtml = result.rows.map((row, idx) => {
      let mobile = '';
      if (row.phone_ciphertext) {
        try { mobile = decryptMobile(row.phone_ciphertext); } catch {}
      }

      let amountDisplay = '<span class="badge badge-light border">All Amounts</span>';
      if (row.amount_type === 'fixed') {
        amountDisplay = `<span class="badge badge-info">Fixed: ₹${formatMinorUnits(row.amount_min_minor || 0)}</span>`;
      } else if (row.amount_type === 'range') {
        amountDisplay = `<span class="badge badge-primary">₹${formatMinorUnits(row.amount_min_minor || 0)} - ₹${formatMinorUnits(row.amount_max_minor || 0)}</span>`;
      }

      const activeBadge = row.is_active
        ? '<span class="badge badge-success px-2 py-1"><i class="fa fa-check-circle mr-1"></i> Active</span>'
        : '<span class="badge badge-secondary px-2 py-1"><i class="fa fa-ban mr-1"></i> Inactive</span>';

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <div class="font-weight-bold text-dark">${escapeHtml(row.user_name || 'Buyer')}</div>
            <div class="small text-muted font-monospace"><i class="fa fa-user mr-1"></i>${escapeHtml(row.username)}</div>
            ${mobile ? `<div class="small text-muted"><i class="fa fa-phone mr-1"></i>${escapeHtml(mobile)}</div>` : ''}
          </td>
          <td>
            <div class="d-flex align-items-center">
              <img src="/api/operator-logo/${row.operator_id}" class="mr-2" style="width:24px;height:24px;object-fit:contain;border-radius:4px;background:#fff;" onerror="this.style.display='none';">
              <div>
                <span class="font-weight-bold text-primary">${escapeHtml(row.operator_name)}</span>
                <span class="badge badge-dark ml-1">${escapeHtml(row.operator_code || row.admin_op_code || '-')}</span>
              </div>
            </div>
            <div class="small text-muted">${escapeHtml(row.service_type || '')}</div>
          </td>
          <td><span class="badge badge-light border font-weight-bold">${escapeHtml(row.circle_name || 'All')}</span></td>
          <td>${amountDisplay}</td>
          <td class="text-right">
            <span class="font-weight-bold text-success font-monospace" style="font-size:14px;">${Number(row.commission_percent || 0).toFixed(4)}%</span>
          </td>
          <td>
            <div class="small font-weight-bold text-dark">Limit: ₹${formatMinorUnits(row.limit_minor || 0)}</div>
            <div class="small text-muted">Used: ₹${formatMinorUnits(row.limit_used_minor || 0)} (${escapeHtml(row.limit_type || 'daily')})</div>
          </td>
          <td>
            <div class="small">R-Offer: <span class="badge badge-light border">${escapeHtml(row.is_roffer || 'all')}</span></div>
            <div class="small text-muted">GST: ${row.with_gst ? '<span class="text-success font-weight-bold">Yes</span>' : 'No'}</div>
          </td>
          <td class="text-center">
            ${activeBadge}
          </td>
          <td class="small text-muted" style="white-space:nowrap;">
            ${formatDateTime(row.created_at)}
          </td>
          <td class="text-center" style="white-space:nowrap;">
            <button type="button" class="btn btn-xs ${row.is_active ? 'btn-outline-danger' : 'btn-outline-success'} btn-toggle-active" data-id="${row.id}" data-current="${row.is_active ? 'active' : 'inactive'}">
              <i class="fa ${row.is_active ? 'fa-pause' : 'fa-play'} mr-1"></i>${row.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button type="button" class="btn btn-xs btn-outline-danger ml-1 btn-delete-margin" data-id="${row.id}" data-op="${escapeHtml(row.operator_name)}">
              <i class="fa fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const operatorFilterOpts = opListRes.rows.map(o => `
      <option value="${o.id}" ${filterInfo.operatorId === o.id ? 'selected' : ''}>${escapeHtml(o.operator_name)} (${escapeHtml(o.service_type)})</option>
    `).join('');

    const circleFilterOpts = CIRCLES.map(c => `
      <option value="${escapeHtml(c)}" ${filterInfo.circle === c ? 'selected' : ''}>${escapeHtml(c)}</option>
    `).join('');

    const serviceFilterOpts = SERVICE_TYPES.map(s => `
      <option value="${escapeHtml(s)}" ${filterInfo.serviceType === s ? 'selected' : ''}>${escapeHtml(s)}</option>
    `).join('');

    const csvUrl = `/admin/reports/all-buyer-margin?${searchParams.toString()}&format=csv`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Show All Buyer Margin - Exchange Admin</title>
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
    .btn-xs { padding: 2px 7px; font-size: 11px; border-radius: 4px; }
  </style>
</head>
<body class="app sidebar-mini">
  <div class="page">
    <div class="page-main">
      ${renderAdminNavigation('/admin/reports/all-buyer-margin')}

      <main class="main-content">
        <div class="container-fluid px-3 pt-3">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h4 class="page-title mb-0 font-weight-bold text-dark">
                <i class="fa fa-shopping-cart text-primary mr-2"></i>Show All Buyer Margin
              </h4>
              <p class="text-muted small mb-0">Sabhi buyers ke set kiye gaye purchase margins ki comprehensive report aur status control.</p>
            </div>
            <div>
              <a href="${csvUrl}" class="btn btn-sm btn-outline-success font-weight-bold">
                <i class="fa fa-download mr-1"></i> Export CSV
              </a>
            </div>
          </div>

          <!-- KPI Summary Cards -->
          <div class="row mb-3">
            <div class="col-xl-2 col-md-4 col-6 mb-2">
              <div class="kpi-card border-left border-primary" style="border-left-width: 4px !important;">
                <div class="kpi-title">Total Margins</div>
                <div class="kpi-val text-primary">${totalCount}</div>
              </div>
            </div>
            <div class="col-xl-2 col-md-4 col-6 mb-2">
              <div class="kpi-card border-left border-success" style="border-left-width: 4px !important;">
                <div class="kpi-title">Active Margins</div>
                <div class="kpi-val text-success">${activeCount}</div>
              </div>
            </div>
            <div class="col-xl-2 col-md-4 col-6 mb-2">
              <div class="kpi-card border-left border-secondary" style="border-left-width: 4px !important;">
                <div class="kpi-title">Inactive Margins</div>
                <div class="kpi-val text-secondary">${inactiveCount}</div>
              </div>
            </div>
            <div class="col-xl-3 col-md-4 col-6 mb-2">
              <div class="kpi-card border-left border-info" style="border-left-width: 4px !important;">
                <div class="kpi-title">Unique Buyers</div>
                <div class="kpi-val text-info">${uniqueBuyers.size}</div>
              </div>
            </div>
            <div class="col-xl-3 col-md-4 col-6 mb-2">
              <div class="kpi-card border-left border-warning" style="border-left-width: 4px !important;">
                <div class="kpi-title">Average Margin %</div>
                <div class="kpi-val text-warning">${avgCommission}%</div>
              </div>
            </div>
          </div>

          <!-- Filter Form -->
          <div class="filter-card">
            <form method="GET" action="/admin/reports/all-buyer-margin" id="filterForm">
              <div class="form-row">
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">Buyer / User</label>
                  <input type="text" class="form-control form-control-sm" name="buyer" value="${escapeHtml(filterInfo.buyer)}" placeholder="Username or Name">
                </div>
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">Operator</label>
                  <select class="form-control form-control-sm" name="operatorId">
                    <option value="">All Operators</option>
                    ${operatorFilterOpts}
                  </select>
                </div>
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">Circle</label>
                  <select class="form-control form-control-sm" name="circle">
                    <option value="">All Circles</option>
                    ${circleFilterOpts}
                  </select>
                </div>
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">Service Type</label>
                  <select class="form-control form-control-sm" name="serviceType">
                    <option value="">All Services</option>
                    ${serviceFilterOpts}
                  </select>
                </div>
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">Status</label>
                  <select class="form-control form-control-sm" name="status">
                    <option value="all" ${filterInfo.status === 'all' ? 'selected' : ''}>All Status</option>
                    <option value="active" ${filterInfo.status === 'active' ? 'selected' : ''}>Active Only</option>
                    <option value="inactive" ${filterInfo.status === 'inactive' ? 'selected' : ''}>Inactive Only</option>
                  </select>
                </div>
                <div class="form-group col-md-2 col-6 mb-2">
                  <label class="small font-weight-bold text-dark">Keyword Search</label>
                  <input type="text" class="form-control form-control-sm" name="search" value="${escapeHtml(filterInfo.search)}" placeholder="Search anything...">
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
                  <a href="/admin/reports/all-buyer-margin" class="btn btn-sm btn-light border mr-2">
                    <i class="fa fa-refresh mr-1"></i> Reset
                  </a>
                  <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-secondary" onclick="setQuickDate('today')">Today</button>
                    <button type="button" class="btn btn-outline-secondary" onclick="setQuickDate('yesterday')">Yesterday</button>
                    <button type="button" class="btn btn-outline-secondary" onclick="setQuickDate('last7')">Last 7D</button>
                    <button type="button" class="btn btn-outline-secondary" onclick="setQuickDate('month')">This Month</button>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <!-- Main Table Card -->
          <div class="card shadow-sm border-0 mb-4">
            <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
              <h6 class="mb-0 font-weight-bold text-dark">
                Buyer Margins List (${totalCount} records)
              </h6>
            </div>
            <div class="table-responsive">
              <table class="table table-bordered table-striped table-hover mb-0">
                <thead class="thead-dark">
                  <tr>
                    <th style="width: 35px; text-align: center;">#</th>
                    <th>Buyer Details</th>
                    <th>Operator</th>
                    <th>Circle</th>
                    <th>Amount Range</th>
                    <th style="text-align: right;">Margin %</th>
                    <th>Limit & Usage</th>
                    <th>R-Offer / GST</th>
                    <th style="text-align: center;">Status</th>
                    <th>Date Set</th>
                    <th style="text-align: center;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="11" class="text-center py-4 text-muted font-weight-bold">No buyer margins found matching the filters.</td></tr>'}
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

    // Toggle status handler
    document.querySelectorAll('.btn-toggle-active').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const current = btn.dataset.current;
        const nextActive = current !== 'active';
        btn.disabled = true;
        try {
          const res = await fetch('/api/admin/buyer-margins/' + id + '/toggle-status', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ active: nextActive })
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || 'Failed to update status.');
          window.location.reload();
        } catch (err) {
          alert('Error: ' + err.message);
          btn.disabled = false;
        }
      });
    });

    // Delete margin handler
    document.querySelectorAll('.btn-delete-margin').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const op = btn.dataset.op || 'this operator';
        if (!confirm('Are you sure you want to remove buyer margin for ' + op + '?')) return;
        btn.disabled = true;
        try {
          const res = await fetch('/api/admin/buyer-margins/' + id + '/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({})
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || 'Failed to delete margin.');
          window.location.reload();
        } catch (err) {
          alert('Error: ' + err.message);
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
    response.end(await addPanelChrome(html, { role: 'admin', userId: admin.id, db }));
  }

  return { sendAdminAllBuyerMarginPage };
};
