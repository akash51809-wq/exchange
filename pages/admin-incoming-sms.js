'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');
const {
  getIncomingSmsStats,
  getIncomingSmsLogs,
  getIncomingSmsConfig,
} = require('../lib/incoming-sms-service');

module.exports = function createAdminIncomingSmsPage({
  db,
  decryptServiceConfig,
  formatMinorUnits,
}) {
  const PAGE_SIZE = 25;

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

  function sanitizeCsv(val) {
    const str = String(val ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  }

  function getStatusBadge(status) {
    switch (status) {
      case 'auto_approved':
        return '<span class="badge badge-success px-2 py-1"><i class="fa fa-check-circle mr-1"></i>Auto Approved</span>';
      case 'unmatched':
        return '<span class="badge badge-warning text-dark px-2 py-1"><i class="fa fa-clock-o mr-1"></i>Unmatched</span>';
      case 'ignored':
        return '<span class="badge badge-secondary px-2 py-1"><i class="fa fa-ban mr-1"></i>Ignored / Non-Credit</span>';
      case 'failed':
        return '<span class="badge badge-danger px-2 py-1"><i class="fa fa-times-circle mr-1"></i>Failed</span>';
      default:
        return `<span class="badge badge-light border px-2 py-1">${escapeHtml(status || 'Pending')}</span>`;
    }
  }

  function getBankBadge(bank) {
    const b = String(bank || 'Bank').toUpperCase();
    let bg = '#3b82f6';
    if (b.includes('SBI')) bg = '#1d4ed8';
    else if (b.includes('HDFC')) bg = '#0284c7';
    else if (b.includes('ICICI')) bg = '#b91c1c';
    else if (b.includes('AXIS')) bg = '#991b1b';
    else if (b.includes('KOTAK')) bg = '#dc2626';
    else if (b.includes('PAYTM')) bg = '#0ea5e9';
    else if (b.includes('AIRTEL')) bg = '#e11d48';
    return `<span class="badge text-white px-2 py-1 font-weight-bold" style="background:${bg}; font-size:11px;"><i class="fa fa-university mr-1"></i>${escapeHtml(b)}</span>`;
  }

  /**
   * Render HTML page or stream CSV for /admin/reports/incoming-sms
   */
  async function sendAdminIncomingSmsPage(admin, response, url) {
    const params = url.searchParams;
    const fromDate = params.get('from_date') || '';
    const toDate = params.get('to_date') || '';
    const status = params.get('status') || 'all';
    const bank = params.get('bank') || 'all';
    const query = params.get('q') || '';
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const limit = Math.max(10, Math.min(100, parseInt(params.get('limit') || String(PAGE_SIZE), 10)));
    const download = params.get('download');

    // 1) Fetch service configuration
    const config = await getIncomingSmsConfig(db, decryptServiceConfig);

    // 2) Handle CSV export
    if (download === 'csv' || download === 'excel') {
      const allLogs = await getIncomingSmsLogs(db, {
        page: 1,
        limit: 10000,
        fromDate,
        toDate,
        status,
        bank,
        query,
      });

      const csvRows = [
        '\uFEFF' +
          [
            'ID',
            'Received Date & Time',
            'Bank',
            'Sender',
            'Amount (INR)',
            'UTR / Reference',
            'Status',
            'Matched Buyer Username',
            'Matched Buyer Name',
            'SIM Slot',
            'Auto Approval Note',
            'Message Content',
          ]
            .map(sanitizeCsv)
            .join(','),
      ];

      for (const row of allLogs.rows) {
        const amt = row.parsed_amount_minor ? (Number(row.parsed_amount_minor) / 100).toFixed(2) : '0.00';
        csvRows.push(
          [
            row.id,
            formatDateTime(row.created_at),
            row.parsed_bank || 'Bank',
            row.sender || 'Unknown',
            amt,
            row.parsed_utr || '',
            row.match_status,
            row.matched_username || '',
            row.matched_user_name || '',
            row.sim_slot || '0',
            row.auto_approval_note || '',
            row.raw_message || '',
          ]
            .map(sanitizeCsv)
            .join(',')
        );
      }

      const csvContent = csvRows.join('\r\n');
      response.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="incoming_sms_logs_${getTodayString()}.csv"`,
        'cache-control': 'no-store',
      });
      response.end(csvContent);
      return;
    }

    // 3) Fetch KPI stats & daily chart data
    const stats = await getIncomingSmsStats(db, { fromDate, toDate, status, bank, query });

    // 4) Fetch paginated logs
    const logData = await getIncomingSmsLogs(db, {
      page,
      limit,
      fromDate,
      toDate,
      status,
      bank,
      query,
    });

    const totalCreditedRupees = typeof formatMinorUnits === 'function'
      ? formatMinorUnits(stats.totalCreditedMinor)
      : (Number(stats.totalCreditedMinor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    // Build Chart SVG / Visualization
    const chartDays = stats.chartDaily.slice(-14); // Last 14 days
    const maxSmsCount = Math.max(1, ...chartDays.map(d => d.count_total || 0));

    const chartBarsHtml = chartDays.length > 0
      ? chartDays.map(d => {
          const totalH = Math.round(((d.count_total || 0) / maxSmsCount) * 110);
          const apprH = Math.round(((d.count_approved || 0) / maxSmsCount) * 110);
          const label = d.day ? d.day.slice(5) : ''; // MM-DD
          return `
            <div class="chart-col d-flex flex-column align-items-center" style="flex:1; min-width:32px;">
              <div class="small font-weight-bold text-muted mb-1" style="font-size:10px;">${d.count_total}</div>
              <div class="chart-bar-wrap d-flex align-items-end justify-content-center" style="height:120px; width:100%; position:relative;">
                <div class="bar-total bg-primary opacity-50" style="width:16px; height:${Math.max(4, totalH)}px; border-radius:4px 4px 0 0;" title="Total: ${d.count_total} SMS on ${d.day}"></div>
                <div class="bar-appr bg-success" style="width:16px; height:${Math.max(0, apprH)}px; position:absolute; bottom:0; border-radius:4px 4px 0 0;" title="Auto-Approved: ${d.count_approved} on ${d.day}"></div>
              </div>
              <div class="chart-label text-muted small mt-1 font-monospace" style="font-size:10px;">${label}</div>
            </div>`;
        }).join('')
      : '<div class="text-muted p-4 text-center w-100"><i class="fa fa-line-chart fa-2x mb-2 d-block opacity-50"></i>No message activity recorded in this period yet. Send a test SMS to view live analytics!</div>';

    // Bank distribution pills
    const bankPillsHtml = stats.bankBreakdown.length > 0
      ? stats.bankBreakdown.map(b => `
          <span class="badge badge-light border text-dark p-2 mr-2 mb-2 font-weight-bold" style="font-size:12px;">
            <i class="fa fa-university text-primary mr-1"></i>${escapeHtml(b.bank_name)}:
            <span class="text-primary">${b.count}</span>
            <span class="text-success small ml-1">(${b.approved_count} Approved)</span>
          </span>
        `).join('')
      : '<span class="text-muted small">No bank breakdown available yet.</span>';

    // Build Table Rows
    const rowsHtml = logData.rows.length > 0
      ? logData.rows.map((row, index) => {
          const rowNum = (logData.page - 1) * logData.limit + index + 1;
          const amtRupees = row.parsed_amount_minor
            ? (Number(row.parsed_amount_minor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })
            : '—';

          let buyerHtml = '<span class="text-muted">—</span>';
          if (row.matched_username) {
            buyerHtml = `
              <div class="font-weight-bold text-dark">${escapeHtml(row.matched_user_name || row.matched_username)}</div>
              <div class="small text-muted font-monospace">@${escapeHtml(row.matched_username)}</div>
              ${row.matched_fund_request_id ? `<a href="/admin/payment/fund-request" class="small text-primary"><i class="fa fa-external-link mr-1"></i>View Fund Request</a>` : ''}
            `;
          }

          const utrHtml = row.parsed_utr
            ? `<span class="badge badge-light border font-monospace text-dark px-2 py-1" style="font-size:12px;">
                ${escapeHtml(row.parsed_utr)}
                <button type="button" class="btn btn-xs btn-link p-0 ml-1 text-primary btn-copy" data-copy="${escapeHtml(row.parsed_utr)}" title="Copy UTR">
                  <i class="fa fa-copy"></i>
                </button>
               </span>`
            : '<span class="text-muted">—</span>';

          const msgSnippet = escapeHtml(row.raw_message || '');
          const rowJson = escapeHtml(JSON.stringify(row, (k, v) => typeof v === 'bigint' ? v.toString() : v));

          return `
            <tr>
              <td class="text-center font-weight-bold text-muted">${rowNum}</td>
              <td class="text-nowrap" style="font-size:12px;">
                <div class="font-weight-bold text-dark">${formatDateTime(row.created_at)}</div>
                <div class="small text-muted font-monospace"><i class="fa fa-sim-card mr-1"></i>SIM ${escapeHtml(row.sim_slot || '0')}</div>
              </td>
              <td class="text-nowrap">
                ${getBankBadge(row.parsed_bank)}
                <div class="small text-muted font-monospace mt-1">${escapeHtml(row.sender || 'Unknown')}</div>
              </td>
              <td class="text-nowrap font-weight-bold text-success" style="font-size:14px;">
                ${row.parsed_amount_minor ? `₹${amtRupees}` : '<span class="text-muted font-weight-normal">—</span>'}
              </td>
              <td>${utrHtml}</td>
              <td>
                <div class="sms-content-box" style="max-width:380px; font-size:12px; line-height:1.4; color:#334155; word-break:break-word;">
                  ${msgSnippet}
                </div>
                ${row.auto_approval_note ? `<div class="small text-success mt-1 font-weight-bold"><i class="fa fa-check-circle mr-1"></i>${escapeHtml(row.auto_approval_note)}</div>` : ''}
              </td>
              <td>${buyerHtml}</td>
              <td class="text-center text-nowrap">${getStatusBadge(row.match_status)}</td>
              <td class="text-center text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-info btn-view-payload" data-payload='${rowJson}' title="View Full Raw Details">
                  <i class="fa fa-eye mr-1"></i>Details
                </button>
              </td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="9" class="text-center py-5 text-muted"><i class="fa fa-inbox fa-3x mb-2 d-block opacity-50"></i>No incoming SMS records match your filter criteria.</td></tr>';

    // Pagination URLs
    const buildPageUrl = (p) => {
      const sp = new URLSearchParams(url.searchParams);
      sp.set('page', String(p));
      return `/admin/reports/incoming-sms?${sp.toString()}`;
    };

    const prevUrl = logData.page > 1 ? buildPageUrl(logData.page - 1) : '#';
    const nextUrl = logData.page < logData.totalPages ? buildPageUrl(logData.page + 1) : '#';

    // Export CSV URL
    const csvExportUrl = (() => {
      const sp = new URLSearchParams(url.searchParams);
      sp.set('download', 'csv');
      return `/admin/reports/incoming-sms?${sp.toString()}`;
    })();

    const fullHtml = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Incoming SMS Analytics &amp; Auto-Credit - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .kpi-card { border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: transform 0.15s ease; }
    .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.06); }
    .kpi-value { font-size: 26px; font-weight: 800; line-height: 1.2; }
    .chart-container { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); margin-bottom: 20px; }
    .filter-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .webhook-bar { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #fff; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; box-shadow: 0 3px 8px rgba(30,58,138,0.2); }
    .table-container { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .sms-content-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; font-family: -apple-system, BlinkMacSystemFont, monospace; }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">

    <main class="main-content">
      <div class="container-fluid px-3 pt-3 pb-5">

        <!-- Page Breadcrumb & Header -->
        <div class="page-header d-flex justify-content-between align-items-center flex-wrap mb-3">
          <div>
            <h4 class="page-title text-primary font-weight-bold mb-1">
              <i class="fa fa-inbox mr-2"></i>Incoming SMS Logs &amp; Auto-Credit Receiver
            </h4>
            <ol class="breadcrumb mb-0 p-0 bg-transparent" style="font-size:12px;">
              <li class="breadcrumb-item"><a href="/admin/">Dashboard</a></li>
              <li class="breadcrumb-item"><a href="#">Reports</a></li>
              <li class="breadcrumb-item active text-primary">Incoming SMS Logs &amp; Chart</li>
            </ol>
          </div>
          <div class="d-flex align-items-center flex-wrap" style="gap:8px;">
            <a href="/admin/settings/service-settings" class="btn btn-outline-primary btn-sm font-weight-bold">
              <i class="fa fa-cogs mr-1"></i>Configure Webhook in Service Settings
            </a>
            <a href="/admin/payment/fund-request" class="btn btn-outline-success btn-sm font-weight-bold">
              <i class="fa fa-money mr-1"></i>Buyer Fund Requests
            </a>
            <a href="${csvExportUrl}" class="btn btn-success btn-sm font-weight-bold shadow-sm">
              <i class="fa fa-download mr-1"></i>Export CSV
            </a>
          </div>
        </div>

        <!-- 1. Webhook URL Quick Integration Bar -->
        <div class="webhook-bar">
          <div class="row align-items-center">
            <div class="col-lg-6 mb-2 mb-lg-0">
              <div class="d-flex align-items-center mb-1">
                <span class="badge badge-success px-2 py-1 font-weight-bold mr-2">
                  <i class="fa fa-circle mr-1"></i>LIVE RECEIVER ACTIVE
                </span>
                <span class="font-weight-bold" style="font-size:14px;">Your Incoming SMS Webhook URL:</span>
              </div>
              <div class="input-group">
                <input type="text" id="webhookUrlInput" class="form-control font-monospace" style="font-size:13px; background:#f8fafc;" readonly value="">
                <div class="input-group-append">
                  <button type="button" class="btn btn-light font-weight-bold" id="btnCopyWebhookUrl">
                    <i class="fa fa-copy mr-1 text-primary"></i>Copy URL
                  </button>
                </div>
              </div>
            </div>
            <div class="col-lg-6">
              <div class="d-flex justify-content-lg-end align-items-center flex-wrap" style="gap:12px;">
                <div class="small">
                  <i class="fa fa-shield mr-1"></i>Auto-Credit:
                  <span class="font-weight-bold text-white">${config.autoUpdatePayment ? 'ENABLED (Auto Approves Buyer UTR)' : 'PAUSED'}</span>
                </div>
                <div class="small">
                  <i class="fa fa-key mr-1"></i>Auth Secret:
                  <span class="font-monospace">${config.secretKey ? 'Configured' : 'Open / Optional'}</span>
                </div>
                <button type="button" class="btn btn-light btn-sm text-primary font-weight-bold" id="btnQuickTestModal">
                  <i class="fa fa-bolt mr-1"></i>Test &amp; Simulate SMS
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. KPI Metric Cards -->
        <div class="row mb-3">
          <div class="col-sm-6 col-lg-3 mb-3">
            <div class="card kpi-card p-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="text-muted small font-weight-bold text-uppercase">Total Received SMS</span>
                <span class="badge badge-primary-light p-2"><i class="fa fa-envelope text-primary"></i></span>
              </div>
              <div class="kpi-value text-primary">${stats.totalSms}</div>
              <small class="text-muted">Total incoming messages logged</small>
            </div>
          </div>

          <div class="col-sm-6 col-lg-3 mb-3">
            <div class="card kpi-card p-3 border-success">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="text-muted small font-weight-bold text-uppercase">Auto-Approved Topups</span>
                <span class="badge badge-success-light p-2"><i class="fa fa-check-circle text-success"></i></span>
              </div>
              <div class="kpi-value text-success">${stats.autoApprovedCount}</div>
              <small class="text-success font-weight-bold">Matched &amp; credited automatically</small>
            </div>
          </div>

          <div class="col-sm-6 col-lg-3 mb-3">
            <div class="card kpi-card p-3 border-info">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="text-muted small font-weight-bold text-uppercase">Total Amount Credited</span>
                <span class="badge badge-info-light p-2"><i class="fa fa-money text-info"></i></span>
              </div>
              <div class="kpi-value text-dark">₹${totalCreditedRupees}</div>
              <small class="text-muted">Credited to buyer wallets</small>
            </div>
          </div>

          <div class="col-sm-6 col-lg-3 mb-3">
            <div class="card kpi-card p-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="text-muted small font-weight-bold text-uppercase">Unmatched / Pending</span>
                <span class="badge badge-warning-light p-2"><i class="fa fa-clock-o text-warning"></i></span>
              </div>
              <div class="kpi-value text-warning">${stats.unmatchedCount}</div>
              <small class="text-muted">Waiting for buyer request</small>
            </div>
          </div>
        </div>

        <!-- 3. Visual Analytics Chart Card -->
        <div class="chart-container">
          <div class="d-flex justify-content-between align-items-center flex-wrap mb-3 border-bottom pb-2">
            <div>
              <h5 class="font-weight-bold text-dark mb-0">
                <i class="fa fa-bar-chart text-primary mr-2"></i>Incoming SMS &amp; Auto-Credit Activity Chart
              </h5>
              <small class="text-muted">Visual volume of received bank SMS messages vs auto-approved payments</small>
            </div>
            <div class="d-flex align-items-center mt-2 mt-sm-0" style="gap:16px;">
              <span class="small font-weight-bold"><span class="badge badge-primary mr-1">&nbsp;</span> Total SMS Received</span>
              <span class="small font-weight-bold"><span class="badge badge-success mr-1">&nbsp;</span> Auto-Approved Payments</span>
            </div>
          </div>

          <!-- Bar Chart Visual -->
          <div class="d-flex align-items-end justify-content-between overflow-auto pt-2 pb-1" style="min-height:140px; gap:8px;">
            ${chartBarsHtml}
          </div>

          <!-- Bank Distribution Breakdown -->
          <div class="mt-3 pt-3 border-top">
            <div class="small font-weight-bold text-muted mb-2 text-uppercase">
              <i class="fa fa-university mr-1"></i>Bank Distribution Breakdown:
            </div>
            <div class="d-flex flex-wrap align-items-center">
              ${bankPillsHtml}
            </div>
          </div>
        </div>

        <!-- 4. Filter Controls -->
        <div class="filter-card">
          <form method="GET" action="/admin/reports/incoming-sms" id="filterForm">
            <div class="row align-items-end">
              <div class="col-md-2 form-group mb-2">
                <label for="filterFromDate" class="font-weight-bold small">From Date</label>
                <input type="date" id="filterFromDate" name="from_date" class="form-control form-control-sm" value="${escapeHtml(fromDate)}">
              </div>

              <div class="col-md-2 form-group mb-2">
                <label for="filterToDate" class="font-weight-bold small">To Date</label>
                <input type="date" id="filterToDate" name="to_date" class="form-control form-control-sm" value="${escapeHtml(toDate)}">
              </div>

              <div class="col-md-2 form-group mb-2">
                <label for="filterStatus" class="font-weight-bold small">Match Status</label>
                <select id="filterStatus" name="status" class="form-control form-control-sm">
                  <option value="all" ${status === 'all' ? 'selected' : ''}>All Statuses</option>
                  <option value="auto_approved" ${status === 'auto_approved' ? 'selected' : ''}>Auto Approved</option>
                  <option value="unmatched" ${status === 'unmatched' ? 'selected' : ''}>Unmatched</option>
                  <option value="ignored" ${status === 'ignored' ? 'selected' : ''}>Ignored / Non-Credit</option>
                  <option value="failed" ${status === 'failed' ? 'selected' : ''}>Failed</option>
                </select>
              </div>

              <div class="col-md-2 form-group mb-2">
                <label for="filterBank" class="font-weight-bold small">Bank</label>
                <select id="filterBank" name="bank" class="form-control form-control-sm">
                  <option value="all" ${bank === 'all' ? 'selected' : ''}>All Banks</option>
                  <option value="sbi" ${bank.toLowerCase() === 'sbi' ? 'selected' : ''}>SBI</option>
                  <option value="hdfc" ${bank.toLowerCase() === 'hdfc' ? 'selected' : ''}>HDFC</option>
                  <option value="icici" ${bank.toLowerCase() === 'icici' ? 'selected' : ''}>ICICI</option>
                  <option value="axis" ${bank.toLowerCase() === 'axis' ? 'selected' : ''}>AXIS</option>
                  <option value="kotak" ${bank.toLowerCase() === 'kotak' ? 'selected' : ''}>KOTAK</option>
                  <option value="pnb" ${bank.toLowerCase() === 'pnb' ? 'selected' : ''}>PNB</option>
                  <option value="bob" ${bank.toLowerCase() === 'bob' ? 'selected' : ''}>BOB</option>
                  <option value="paytm" ${bank.toLowerCase() === 'paytm' ? 'selected' : ''}>PAYTM</option>
                  <option value="airtel" ${bank.toLowerCase() === 'airtel' ? 'selected' : ''}>AIRTEL</option>
                </select>
              </div>

              <div class="col-md-3 form-group mb-2">
                <label for="filterQuery" class="font-weight-bold small">Search UTR / Sender / Text</label>
                <input type="text" id="filterQuery" name="q" class="form-control form-control-sm" placeholder="Search UTR, sender or message..." value="${escapeHtml(query)}">
              </div>

              <div class="col-md-1 form-group mb-2">
                <button type="submit" class="btn btn-primary btn-sm btn-block font-weight-bold">
                  <i class="fa fa-filter mr-1"></i>Filter
                </button>
              </div>
            </div>

            <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top flex-wrap" style="font-size:12px;">
              <div>
                <a href="/admin/reports/incoming-sms" class="text-muted mr-3"><i class="fa fa-undo mr-1"></i>Reset All Filters</a>
                <span class="text-muted">Showing <b>${logData.rows.length}</b> of <b>${logData.total}</b> total records</span>
              </div>
              <div class="custom-control custom-switch mt-2 mt-sm-0">
                <input type="checkbox" class="custom-control-input" id="toggleAutoRefresh" checked>
                <label class="custom-control-label font-weight-bold text-primary" for="toggleAutoRefresh">
                  <i class="fa fa-refresh fa-spin mr-1"></i>Live Auto-Refresh (10s)
                </label>
              </div>
            </div>
          </form>
        </div>

        <!-- 5. Data Table -->
        <div class="table-container mb-4">
          <div class="table-responsive">
            <table class="table table-hover table-bordered mb-0 align-middle">
              <thead class="thead-light">
                <tr>
                  <th style="width:40px;" class="text-center">#</th>
                  <th style="width:140px;">Received At</th>
                  <th style="width:130px;">Bank / Sender</th>
                  <th style="width:120px;">Credited Amt</th>
                  <th style="width:160px;">UTR / Ref No</th>
                  <th>SMS Content &amp; Match Details</th>
                  <th style="width:180px;">Matched Buyer</th>
                  <th style="width:130px;" class="text-center">Match Status</th>
                  <th style="width:90px;" class="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          ${logData.totalPages > 1 ? `
          <div class="d-flex justify-content-between align-items-center p-3 border-top flex-wrap">
            <div class="text-muted small">
              Page <b>${logData.page}</b> of <b>${logData.totalPages}</b>
            </div>
            <ul class="pagination pagination-sm mb-0">
              <li class="page-item ${logData.page <= 1 ? 'disabled' : ''}">
                <a class="page-link" href="${prevUrl}">&laquo; Prev</a>
              </li>
              ${Array.from({ length: Math.min(5, logData.totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return `
                  <li class="page-item ${pageNum === logData.page ? 'active' : ''}">
                    <a class="page-link" href="${buildPageUrl(pageNum)}">${pageNum}</a>
                  </li>
                `;
              }).join('')}
              <li class="page-item ${logData.page >= logData.totalPages ? 'disabled' : ''}">
                <a class="page-link" href="${nextUrl}">Next &raquo;</a>
              </li>
            </ul>
          </div>
          ` : ''}
        </div>

      </div>
    </main>

  </div>
</div>

<!-- Modal: Raw Payload & Message Details -->
<div class="modal fade" id="payloadModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white py-2">
        <h5 class="modal-title font-weight-bold" style="font-size:15px;">
          <i class="fa fa-info-circle mr-1"></i>Incoming SMS Details &amp; Raw Webhook Payload
        </h5>
        <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body p-3">
        <div class="row">
          <div class="col-md-6 mb-2">
            <label class="font-weight-bold small text-muted text-uppercase mb-0">Bank / Sender:</label>
            <div id="modalBankSender" class="font-weight-bold text-dark">-</div>
          </div>
          <div class="col-md-6 mb-2">
            <label class="font-weight-bold small text-muted text-uppercase mb-0">Detected Amount:</label>
            <div id="modalAmount" class="font-weight-bold text-success">-</div>
          </div>
          <div class="col-md-6 mb-2">
            <label class="font-weight-bold small text-muted text-uppercase mb-0">Detected UTR / Ref:</label>
            <div id="modalUtr" class="font-monospace text-primary font-weight-bold">-</div>
          </div>
          <div class="col-md-6 mb-2">
            <label class="font-weight-bold small text-muted text-uppercase mb-0">Match Status:</label>
            <div id="modalStatus">-</div>
          </div>
        </div>

        <div class="form-group mt-2">
          <label class="font-weight-bold small text-muted text-uppercase mb-1">Full SMS Message:</label>
          <div id="modalSmsBody" class="p-2 border rounded bg-light font-monospace small" style="white-space:pre-wrap;"></div>
        </div>

        <div class="form-group mb-0">
          <label class="font-weight-bold small text-muted text-uppercase mb-1">Raw JSON Payload:</label>
          <pre id="modalRawJson" class="p-2 border rounded bg-dark text-success small mb-0 font-monospace" style="max-height:220px; overflow-y:auto;"></pre>
        </div>
      </div>
      <div class="modal-footer py-2">
        <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>

<!-- Modal: Test & Simulate SMS -->
<div class="modal fade" id="testSmsModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered" role="document">
    <div class="modal-content">
      <div class="modal-header bg-info text-white py-2">
        <h5 class="modal-title font-weight-bold" style="font-size:15px;">
          <i class="fa fa-bolt mr-1"></i>Test &amp; Simulate Incoming Bank SMS
        </h5>
        <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body p-3">
        <p class="text-muted small mb-3">
          Simulate an incoming bank credit SMS without waiting for a real bank notification.
          The system will parse the amount, UTR, and automatically credit any matching pending buyer fund request.
        </p>

        <div class="form-group mb-2">
          <label class="font-weight-bold small">Select Sample Bank Template:</label>
          <select id="simBankSelect" class="form-control form-control-sm">
            <option value="sbi">SBI - State Bank of India (Rs. 2,000.00)</option>
            <option value="hdfc">HDFC Bank (Rs. 5,000.00)</option>
            <option value="icici">ICICI Bank (Rs. 1,500.00)</option>
            <option value="axis">Axis Bank (Rs. 3,000.00)</option>
            <option value="custom">Custom Message</option>
          </select>
        </div>

        <div class="form-group mb-2">
          <label class="font-weight-bold small">Sender / Bank Header:</label>
          <input type="text" id="simSender" class="form-control form-control-sm font-monospace" value="VM-SBIINB">
        </div>

        <div class="form-group mb-3">
          <label class="font-weight-bold small">SMS Message Text:</label>
          <textarea id="simMessageText" class="form-control form-control-sm font-monospace" rows="4">Dear SBI User, your A/C ending 1234 has been credited by Rs. 2,000.00 on 28-10-26 by UPI ref no 430291827364.</textarea>
        </div>

        <div id="simResultBox" class="p-2 border rounded small" style="display:none;"></div>
      </div>
      <div class="modal-footer py-2">
        <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Close</button>
        <button type="button" class="btn btn-primary btn-sm font-weight-bold" id="btnExecuteSimulate">
          <i class="fa fa-play mr-1"></i>Process &amp; Auto-Credit
        </button>
      </div>
    </div>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script>
  // Automatically populate current domain into webhook URL input
  const webhookUrl = window.location.origin + '/api/webhook/incoming-sms';
  document.getElementById('webhookUrlInput').value = webhookUrl;

  // Copy Webhook URL button
  document.getElementById('btnCopyWebhookUrl').addEventListener('click', () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      alert('Webhook URL copied to clipboard: ' + webhookUrl);
    });
  });

  // Copy UTR buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const val = btn.dataset.copy;
      if (val) {
        navigator.clipboard.writeText(val).then(() => {
          btn.innerHTML = '<i class="fa fa-check text-success"></i>';
          setTimeout(() => { btn.innerHTML = '<i class="fa fa-copy"></i>'; }, 1500);
        });
      }
    });
  });

  // View Payload Modal
  document.querySelectorAll('.btn-view-payload').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const data = JSON.parse(btn.dataset.payload);
        document.getElementById('modalBankSender').textContent = (data.parsed_bank || 'Bank') + ' (' + (data.sender || 'Unknown') + ')';
        document.getElementById('modalAmount').textContent = data.parsed_amount_minor ? '₹' + (Number(data.parsed_amount_minor)/100).toFixed(2) : '—';
        document.getElementById('modalUtr').textContent = data.parsed_utr || '—';
        document.getElementById('modalStatus').textContent = data.match_status || '—';
        document.getElementById('modalSmsBody').textContent = data.raw_message || '';
        document.getElementById('modalRawJson').textContent = JSON.stringify(data, null, 2);
        $('#payloadModal').modal('show');
      } catch (err) {
        console.error('Failed to parse row data:', err);
      }
    });
  });

  // Test & Simulate Modal
  const simTemplates = {
    sbi: {
      sender: 'VM-SBIINB',
      msg: 'Dear SBI User, your A/C ending 1234 has been credited by Rs. 2,000.00 on 28-10-26 by UPI ref no 430291827364.'
    },
    hdfc: {
      sender: 'AX-HDFCBK',
      msg: 'Dear Customer, INR 5,000.00 deposited to A/C **5678 on 28-OCT-26 by UPI. UPI Ref 430291827365'
    },
    icici: {
      sender: 'BP-ICICIB',
      msg: 'Your a/c no. XX9876 is credited with Rs 1,500.00 on 28-OCT-26. UPI:430291827367-Transfer'
    },
    axis: {
      sender: 'AX-AXISBK',
      msg: 'Axis Bank: Account 93849335819868 has been credited with INR 3,000.00 on 28-10-2026 by UPI/430291827368/Transfer.'
    },
    custom: {
      sender: 'BANK',
      msg: 'Your account credited with Rs 500.00 via UPI ref no 123456789012'
    }
  };

  document.getElementById('btnQuickTestModal').addEventListener('click', () => {
    $('#testSmsModal').modal('show');
  });

  document.getElementById('simBankSelect').addEventListener('change', (e) => {
    const t = simTemplates[e.target.value] || simTemplates.sbi;
    document.getElementById('simSender').value = t.sender;
    document.getElementById('simMessageText').value = t.msg;
  });

  document.getElementById('btnExecuteSimulate').addEventListener('click', async () => {
    const btn = document.getElementById('btnExecuteSimulate');
    const resBox = document.getElementById('simResultBox');
    btn.disabled = true;
    resBox.style.display = 'none';

    try {
      const resp = await fetch('/api/webhook/incoming-sms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: document.getElementById('simSender').value,
          message: document.getElementById('simMessageText').value,
          sim: '0',
          isSimulation: false,
        }),
      });
      const data = await resp.json();
      resBox.style.display = 'block';
      if (resp.ok) {
        resBox.className = 'p-2 border rounded small bg-light text-success font-weight-bold';
        resBox.innerHTML = '<i class="fa fa-check-circle mr-1"></i>' + (data.message || 'Processed successfully!') +
          '<div class="mt-1 font-monospace text-dark font-weight-normal">' +
          'Status: ' + (data.matchStatus || 'unmatched') + ' | Detected: ₹' + (data.amountStr || '0') + ' | UTR: ' + (data.utr || 'N/A') +
          '</div>';
        setTimeout(() => { location.reload(); }, 2000);
      } else {
        resBox.className = 'p-2 border rounded small bg-light text-danger font-weight-bold';
        resBox.innerHTML = '<i class="fa fa-exclamation-triangle mr-1"></i>' + (data.error || 'Failed to process');
      }
    } catch (err) {
      resBox.style.display = 'block';
      resBox.className = 'p-2 border rounded small bg-light text-danger font-weight-bold';
      resBox.innerHTML = '<i class="fa fa-exclamation-triangle mr-1"></i>Error: ' + err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // Live Auto-Refresh every 10 seconds if toggle is ON
  let refreshTimer = null;
  const toggle = document.getElementById('toggleAutoRefresh');
  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      // Only refresh if modal is not currently open
      if (!$('#payloadModal').hasClass('show') && !$('#testSmsModal').hasClass('show')) {
        location.reload();
      }
    }, 10000);
  }
  if (toggle && toggle.checked) startAutoRefresh();
  toggle?.addEventListener('change', () => {
    if (toggle.checked) startAutoRefresh();
    else if (refreshTimer) clearInterval(refreshTimer);
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
    });
    response.end(await addPanelChrome(fullHtml, { role: 'admin', currentPath: '/admin/reports/incoming-sms' }));
  }

  return {
    sendAdminIncomingSmsPage,
  };
};
