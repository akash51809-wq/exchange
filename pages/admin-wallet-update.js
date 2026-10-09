'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminWalletUpdatePage({
  db,
  formatMinorUnits,
  decryptFundField,
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
   * Helper to build SQL WHERE clause
   */
  function buildConditions(params) {
    const fromDate = String(params.get('fromDate') || '').trim();
    const toDate = String(params.get('toDate') || '').trim();
    const partyName = String(params.get('partyName') || params.get('party') || '').trim();
    const statusFilter = String(params.get('status') || '').trim().toLowerCase();
    const modeFilter = String(params.get('mode') || params.get('paymentMode') || '').trim();

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
      conditions.push(`(u.name ILIKE ${pLike} OR u.username ILIKE ${pLike} OR COALESCE(u.business_name, '') ILIKE ${pLike} OR COALESCE(u.email, '') ILIKE ${pLike})`);
    }
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(`r.status = ${add(statusFilter)}`);
    }
    if (modeFilter && modeFilter !== 'all') {
      conditions.push(`r.payment_mode = ${add(modeFilter)}`);
    }

    return {
      whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      values,
      fromDate,
      toDate,
      partyName,
      statusFilter,
      modeFilter,
    };
  }

  /**
   * Stream CSV
   */
  async function streamCsv(searchParams, response) {
    const filterInfo = buildConditions(searchParams);
    const query = `
      SELECT r.id, r.amount_minor, r.bank_code, r.payment_mode, r.wallet_type,
             r.source_account_ciphertext, r.transaction_id_ciphertext,
             r.status, r.review_note, r.created_at, r.reviewed_at,
             u.username, u.name AS user_name, u.business_name,
             COALESCE(b.bank_name, r.bank_name, r.bank_code) AS bank_display,
             COALESCE(b.account_number, r.deposit_account) AS deposit_account_num
      FROM wallet_fund_requests r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN admin_bank_accounts b ON b.id = r.bank_account_id
      ${filterInfo.whereClause}
      ORDER BY r.created_at DESC
      LIMIT 10000
    `;

    const result = await db.query(query, filterInfo.values);
    const fileName = `wallet_update_report_${filterInfo.fromDate || 'all'}_to_${filterInfo.toDate || 'all'}.csv`;

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    });

    const csvHeader = [
      'Update ID',
      'Requested At (IST)',
      'Party Name',
      'Party Username',
      'Deposited Bank',
      'Deposit Account',
      'Amount (INR)',
      'Payment Mode',
      'Wallet Type',
      'Depositor Account / Mobile',
      'Transaction ID / UTR',
      'Status',
      'Review Note',
      'Reviewed At',
    ].join(',') + '\r\n';

    response.write(csvHeader);

    for (const row of result.rows) {
      let accNum = '—';
      let txnId = '—';
      if (decryptFundField) {
        if (row.source_account_ciphertext) {
          try { accNum = decryptFundField(row.source_account_ciphertext, 'account'); } catch (_) { accNum = '—'; }
        }
        if (row.transaction_id_ciphertext) {
          try { txnId = decryptFundField(row.transaction_id_ciphertext, 'transaction'); } catch (_) { txnId = '—'; }
        }
      }
      const amount = (Number(row.amount_minor || 0) / 100).toFixed(2);
      const line = [
        `"WUP-${row.id.slice(0, 8).toUpperCase()}"`,
        `"${formatDateTime(row.created_at)}"`,
        `"${String(row.user_name || '').replace(/"/g, '""')}"`,
        `"${String(row.username || '').replace(/"/g, '""')}"`,
        `"${String(row.bank_display || '').replace(/"/g, '""')}"`,
        `"${String(row.deposit_account_num || '').replace(/"/g, '""')}"`,
        amount,
        `"${String(row.payment_mode || '').replace(/"/g, '""')}"`,
        `"${String(row.wallet_type || 'Prepaid').replace(/"/g, '""')}"`,
        `"${accNum.replace(/"/g, '""')}"`,
        `"${txnId.replace(/"/g, '""')}"`,
        `"${String(row.status || '').toUpperCase()}"`,
        `"${String(row.review_note || '').replace(/"/g, '""')}"`,
        `"${formatDateTime(row.reviewed_at)}"`,
      ].join(',') + '\r\n';
      response.write(line);
    }
    response.end();
  }

  async function sendAdminWalletUpdatePage(admin, response, searchParams) {
    if (searchParams.get('export') === 'csv') {
      return streamCsv(searchParams, response);
    }

    const {
      whereClause,
      values,
      fromDate,
      toDate,
      partyName,
      statusFilter,
      modeFilter,
    } = buildConditions(searchParams);

    const query = `
      SELECT r.id, r.amount_minor, r.bank_code, r.payment_mode, r.wallet_type, r.proof_mime,
             r.source_account_ciphertext, r.transaction_id_ciphertext,
             r.status, r.review_note, r.created_at, r.reviewed_at,
             u.id AS user_id, u.username, u.name AS user_name, u.business_name,
             COALESCE(b.bank_name, r.bank_name, r.bank_code) AS bank_display,
             COALESCE(b.account_number, r.deposit_account) AS deposit_account_num,
             adm.username AS reviewed_by_name
      FROM wallet_fund_requests r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN admin_bank_accounts b ON b.id = r.bank_account_id
      LEFT JOIN users adm ON adm.id = r.reviewed_by
      ${whereClause}
      ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
      LIMIT 500
    `;

    const result = await db.query(query, values);

    // Calculate KPI Totals
    let totalCount = 0;
    let approvedCount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;
    let totalApprovedMinor = 0n;
    let totalPendingMinor = 0n;
    let totalRejectedMinor = 0n;

    for (const row of result.rows) {
      totalCount++;
      const amt = BigInt(row.amount_minor || 0);
      if (row.status === 'approved') {
        approvedCount++;
        totalApprovedMinor += amt;
      } else if (row.status === 'pending') {
        pendingCount++;
        totalPendingMinor += amt;
      } else if (row.status === 'rejected') {
        rejectedCount++;
        totalRejectedMinor += amt;
      }
    }

    // Format Table Rows
    const rowsHtml = result.rows.map((row, idx) => {
      const amt = BigInt(row.amount_minor || 0);

      let accountNumber = '—';
      let transactionId = '—';
      if (decryptFundField) {
        if (row.source_account_ciphertext) {
          try { accountNumber = decryptFundField(row.source_account_ciphertext, 'account'); } catch (_) { accountNumber = '—'; }
        }
        if (row.transaction_id_ciphertext) {
          try { transactionId = decryptFundField(row.transaction_id_ciphertext, 'transaction'); } catch (_) { transactionId = '—'; }
        }
      }

      const proof = row.proof_mime
        ? `<a class="btn btn-xs btn-outline-info font-weight-bold" target="_blank" rel="noopener" href="/admin/payment/fund-request/proof/${row.id}">
             <i class="fa fa-eye mr-1"></i>View Slip
           </a>`
        : '<span class="text-muted small">No File</span>';

      let statusBadge = '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;"><i class="fa fa-clock-o mr-1"></i> Pending</span>';
      if (row.status === 'approved') {
        statusBadge = '<span class="badge badge-success" style="background:#10b981;"><i class="fa fa-check mr-1"></i> Approved</span>';
      } else if (row.status === 'rejected') {
        statusBadge = '<span class="badge badge-danger" style="background:#ef4444;"><i class="fa fa-times mr-1"></i> Rejected</span>';
      }

      let actions = '';
      if (row.status === 'pending') {
        actions = `
          <div class="d-flex align-items-center" style="gap:4px;">
            <button type="button" class="btn btn-xs btn-success font-weight-bold px-2 py-1" data-action="approve" data-id="${row.id}">
              <i class="fa fa-check"></i> Approve
            </button>
            <button type="button" class="btn btn-xs btn-danger font-weight-bold px-2 py-1" data-action="reject" data-id="${row.id}">
              <i class="fa fa-times"></i> Reject
            </button>
          </div>
        `;
      } else {
        actions = `<span class="small text-muted font-italic">${row.status === 'approved' ? 'Credited to Wallet' : 'Declined'}</span>`;
      }

      const reqCode = 'WUP-' + row.id.slice(0, 8).toUpperCase();

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <span class="badge badge-light border text-monospace font-weight-bold" title="${row.id}">
              ${reqCode}
            </span>
          </td>
          <td class="small text-muted" style="white-space:nowrap;">
            ${formatDateTime(row.created_at)}
          </td>
          <td>
            <strong class="text-dark">${escapeHtml(row.user_name || row.username)}</strong>
            <div class="small text-muted font-monospace">@${escapeHtml(row.username)}</div>
            ${row.business_name ? `<div class="small text-primary">${escapeHtml(row.business_name)}</div>` : ''}
          </td>
          <td>
            <strong class="text-primary">${escapeHtml(row.bank_display || 'Bank')}</strong>
            ${row.deposit_account_num ? `<div class="small text-muted font-monospace">A/C: ${escapeHtml(row.deposit_account_num)}</div>` : ''}
          </td>
          <td class="text-right font-weight-bold font-monospace text-dark" style="font-size:14px;">
            ₹${formatRupeesFromMinor(amt)}
          </td>
          <td>
            <span class="badge badge-pill badge-light border text-dark font-weight-bold">
              ${escapeHtml(row.payment_mode || 'Bank')}
            </span>
          </td>
          <td class="small font-monospace">${escapeHtml(accountNumber)}</td>
          <td class="small font-monospace font-weight-bold text-dark">${escapeHtml(transactionId)}</td>
          <td class="text-center">${proof}</td>
          <td class="text-center">${statusBadge}</td>
          <td>
            <div class="small text-muted">${escapeHtml(row.review_note || '—')}</div>
            ${row.reviewed_by_name ? `<div class="small text-info font-monospace">by @${escapeHtml(row.reviewed_by_name)}</div>` : ''}
          </td>
          <td style="white-space:nowrap;">${actions}</td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>List of Wallet Update - Admin Payment</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 14px 18px 40px; }
    .kpi-card { border-radius: 8px; padding: 16px 18px; color: #fff; box-shadow: 0 3px 10px rgba(0,0,0,0.08); }
    .kpi-title { font-size: 11.5px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.6px; opacity: 0.9; margin-bottom: 6px; }
    .kpi-value { font-size: 22px; font-weight: 800; line-height: 1.2; font-family: SFMono-Regular, Consolas, monospace; }
    .kpi-sub { font-size: 11.5px; opacity: 0.85; margin-top: 4px; }
    .card-panel { border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 2px 6px rgba(0,0,0,0.04); background: #fff; margin-bottom: 18px; }
    .card-panel-head { padding: 12px 18px; border-bottom: 1px solid #edf2f7; display: flex; align-items: center; justify-content: space-between; background: #fafbfc; }
    .font-monospace { font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .table thead th { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; }
    .table td { vertical-align: middle; font-size: 12.5px; border-color: #f1f5f9; }
    .table tbody tr:hover { background-color: #f8fafc; }
    .btn-quick-date { font-size: 11px; padding: 3px 8px; font-weight: 600; border-radius: 4px; }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    ${renderAdminNavigation('/admin/payment/wallet-update')}

    <main class="main-content">
      <div class="page-container">

        <!-- Page Header -->
        <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap" style="gap:10px;">
          <div>
            <h3 class="font-weight-bold text-dark mb-1">
              <i class="fa fa-money text-primary mr-2"></i>List of Wallet Update
            </h3>
            <p class="text-muted mb-0 small">
              View and review wallet update &amp; fund topup requests from all parties
            </p>
          </div>
          <div class="d-flex align-items-center" style="gap:8px;">
            <button type="button" class="btn btn-sm btn-success font-weight-bold shadow-sm" data-toggle="modal" data-target="#manualUpdateModal">
              <i class="fa fa-plus-circle mr-1"></i> Manual Wallet Update
            </button>
            <a href="?${searchParams.toString()}&export=csv" class="btn btn-sm btn-outline-success font-weight-bold shadow-sm">
              <i class="fa fa-download mr-1"></i> Export CSV
            </a>
          </div>
        </div>

        <!-- Filter Card -->
        <section class="card-panel mb-3">
          <div class="card-panel-head">
            <span class="font-weight-bold text-dark">
              <i class="fa fa-filter text-primary mr-1"></i> Filter Wallet Updates
            </span>
            <div class="d-flex align-items-center flex-wrap" style="gap:4px;">
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('today')">Today</button>
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('yesterday')">Yesterday</button>
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('last7')">Last 7 Days</button>
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('thismonth')">This Month</button>
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('all')">All Time</button>
            </div>
          </div>
          <div class="p-3">
            <form method="GET" action="/admin/payment/wallet-update" id="filterForm">
              <div class="form-row">
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterFromDate">From Date</label>
                  <input type="date" class="form-control form-control-sm" id="filterFromDate" name="fromDate" value="${escapeHtml(fromDate)}">
                </div>
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterToDate">To Date</label>
                  <input type="date" class="form-control form-control-sm" id="filterToDate" name="toDate" value="${escapeHtml(toDate)}">
                </div>
                <div class="form-group col-md-3 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterParty">Party Name / Username</label>
                  <input type="text" class="form-control form-control-sm" id="filterParty" name="partyName" value="${escapeHtml(partyName)}" placeholder="Search party name or username...">
                </div>
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterStatus">Status</label>
                  <select class="form-control form-control-sm" id="filterStatus" name="status">
                    <option value="all"${statusFilter === 'all' || !statusFilter ? ' selected' : ''}>All Status</option>
                    <option value="pending"${statusFilter === 'pending' ? ' selected' : ''}>Pending</option>
                    <option value="approved"${statusFilter === 'approved' ? ' selected' : ''}>Approved</option>
                    <option value="rejected"${statusFilter === 'rejected' ? ' selected' : ''}>Rejected</option>
                  </select>
                </div>
                <div class="form-group col-md-1 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterMode">Mode</label>
                  <select class="form-control form-control-sm" id="filterMode" name="mode">
                    <option value="">All</option>
                    <option value="UPI"${modeFilter === 'UPI' ? ' selected' : ''}>UPI</option>
                    <option value="Bank Transfer"${modeFilter === 'Bank Transfer' ? ' selected' : ''}>Bank</option>
                    <option value="Cash Deposit"${modeFilter === 'Cash Deposit' ? ' selected' : ''}>Cash</option>
                  </select>
                </div>
                <div class="form-group col-md-2 col-sm-12 mb-2 d-flex align-items-end" style="gap:6px;">
                  <button type="submit" class="btn btn-primary btn-sm btn-block font-weight-bold">
                    <i class="fa fa-search mr-1"></i> Apply
                  </button>
                  <a href="/admin/payment/wallet-update" class="btn btn-outline-secondary btn-sm font-weight-bold">
                    Reset
                  </a>
                </div>
              </div>
            </form>
          </div>
        </section>

        <!-- KPI Cards -->
        <div class="row mb-3">
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #4f46e5, #3730a3);">
              <div class="kpi-title"><i class="fa fa-list-alt mr-1"></i> Total Requests</div>
              <div class="kpi-value">${totalCount}</div>
              <div class="kpi-sub">Total update requests in filter</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #059669, #047857);">
              <div class="kpi-title"><i class="fa fa-check-circle mr-1"></i> Approved / Credited</div>
              <div class="kpi-value">₹${formatRupeesFromMinor(totalApprovedMinor)}</div>
              <div class="kpi-sub">${approvedCount} approved requests credited</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #d97706, #b45309);">
              <div class="kpi-title"><i class="fa fa-clock-o mr-1"></i> Pending Amount</div>
              <div class="kpi-value">₹${formatRupeesFromMinor(totalPendingMinor)}</div>
              <div class="kpi-sub">${pendingCount} requests awaiting approval</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #dc2626, #b91c1c);">
              <div class="kpi-title"><i class="fa fa-times-circle mr-1"></i> Rejected Amount</div>
              <div class="kpi-value">₹${formatRupeesFromMinor(totalRejectedMinor)}</div>
              <div class="kpi-sub">${rejectedCount} rejected / declined requests</div>
            </div>
          </div>
        </div>

        <!-- Alert Message Container -->
        <div id="actionAlert" class="alert d-none mb-3" role="alert"></div>

        <!-- Report Table -->
        <div class="card-panel">
          <div class="card-panel-head">
            <span class="font-weight-bold text-dark">
              <i class="fa fa-table text-primary mr-1"></i> Wallet Update Records (${result.rowCount})
            </span>
            <button type="button" class="btn btn-sm btn-light" onclick="location.reload()">
              <i class="fa fa-refresh mr-1"></i> Refresh
            </button>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered table-striped table-hover mb-0">
              <thead>
                <tr>
                  <th class="text-center" style="width:45px;">#</th>
                  <th>Request ID</th>
                  <th>Date &amp; Time (IST)</th>
                  <th>Party Name</th>
                  <th>Deposited Bank</th>
                  <th class="text-right">Amount (₹)</th>
                  <th>Mode</th>
                  <th>Sender A/C / Mobile</th>
                  <th>Transaction ID / UTR</th>
                  <th class="text-center">Proof</th>
                  <th class="text-center">Status</th>
                  <th>Admin Remarks</th>
                  <th class="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="13" class="text-center py-4 text-muted font-weight-bold">No wallet update records found for this filter.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  </div>
</div>

<!-- Modal: Manual Wallet Update -->
<div class="modal fade" id="manualUpdateModal" tabindex="-1" role="dialog" aria-labelledby="manualUpdateModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered" role="document">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title font-weight-bold" id="manualUpdateModalLabel">
          <i class="fa fa-plus-circle mr-1"></i> Manual Wallet Balance Update
        </h5>
        <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <form id="manualWalletForm">
        <div class="modal-body">
          <div id="manualModalError" class="alert alert-danger d-none mb-3"></div>
          <div class="form-group">
            <label class="font-weight-bold small text-muted">Party Username / ID *</label>
            <input type="text" class="form-control" name="username" required placeholder="Enter username (e.g. buyer1, retailer1)">
          </div>
          <div class="form-group">
            <label class="font-weight-bold small text-muted">Action Type *</label>
            <select class="form-control" name="actionType" required>
              <option value="credit">Credit (+) Add to Wallet</option>
              <option value="debit">Debit (-) Deduct from Wallet</option>
            </select>
          </div>
          <div class="form-group">
            <label class="font-weight-bold small text-muted">Target Wallet (For Separate Wallet Mode)</label>
            <select class="form-control" name="walletTarget">
              <option value="buyer">Buyer Wallet - Default</option>
              <option value="seller">Seller Wallet</option>
            </select>
            <small class="form-text text-muted">In Separate Dual Wallet mode, this determines which wallet balance will be updated.</small>
          </div>
          <div class="form-group">
            <label class="font-weight-bold small text-muted">Amount in INR (₹) *</label>
            <input type="number" step="0.01" min="1" class="form-control" name="amount" required placeholder="e.g. 500.00">
          </div>
          <div class="form-group">
            <label class="font-weight-bold small text-muted">Remark / Reason *</label>
            <input type="text" class="form-control" name="remark" required placeholder="e.g. Direct Cash deposit / Special topup">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-primary font-weight-bold" id="btnSubmitManual">
            Submit Wallet Update
          </button>
        </div>
      </form>
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
    document.getElementById('filterForm').submit();
  }

  // Handle Approve / Reject action buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      let note = '';
      if (action === 'reject') {
        note = prompt('Enter rejection note / remark (optional):');
        if (note === null) return;
      } else {
        if (!confirm('Are you sure you want to approve this wallet topup? Amount will be credited to the user wallet.')) {
          return;
        }
      }
      btn.disabled = true;
      try {
        const response = await fetch('/api/admin/fund-requests/' + id + '/decision', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, note }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Action failed.');
        location.reload();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });

  // Manual Wallet Update submit
  $('#manualWalletForm').on('submit', async function(e) {
    e.preventDefault();
    const btn = $('#btnSubmitManual');
    btn.prop('disabled', true).text('Updating...');
    $('#manualModalError').addClass('d-none');

    const form = this;
    const payload = {
      username: form.username.value.trim(),
      actionType: form.actionType.value,
      walletTarget: form.walletTarget ? form.walletTarget.value : 'buyer',
      amount: parseFloat(form.amount.value),
      remark: form.remark.value.trim(),
    };

    try {
      const response = await fetch('/api/admin/wallet/manual-update', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update wallet.');
      alert('Wallet updated successfully!');
      location.reload();
    } catch (err) {
      $('#manualModalError').text(err.message).removeClass('d-none');
      btn.prop('disabled', false).text('Submit Wallet Update');
    }
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
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/payment/wallet-update' }));
  }

  return {
    sendAdminWalletUpdatePage,
  };
};
