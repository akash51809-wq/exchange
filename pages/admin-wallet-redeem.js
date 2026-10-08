'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminWalletRedeemPage({
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

    const conditions = [];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (fromDate) {
      conditions.push(`p.created_at >= (${add(fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (toDate) {
      conditions.push(`p.created_at < (((${add(toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (partyName) {
      const pLike = add(`%${partyName}%`);
      conditions.push(`(u.name ILIKE ${pLike} OR u.username ILIKE ${pLike} OR COALESCE(u.business_name, '') ILIKE ${pLike} OR COALESCE(u.email, '') ILIKE ${pLike})`);
    }
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(`p.status = ${add(statusFilter)}`);
    }

    return {
      whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      values,
      fromDate,
      toDate,
      partyName,
      statusFilter,
    };
  }

  /**
   * Stream CSV
   */
  async function streamCsv(searchParams, response) {
    const filterInfo = buildConditions(searchParams);
    const query = `
      SELECT p.id, p.user_id, p.bank_name, p.account_holder_name, p.account_number,
             p.ifsc_code, p.amount_minor, p.status, p.utr_number, p.admin_remark,
             p.created_at, p.processed_at,
             u.username, u.name AS user_name, u.business_name
      FROM payout_requests p
      JOIN users u ON u.id = p.user_id
      ${filterInfo.whereClause}
      ORDER BY p.created_at DESC
      LIMIT 10000
    `;

    const result = await db.query(query, filterInfo.values);
    const fileName = `wallet_redeem_report_${filterInfo.fromDate || 'all'}_to_${filterInfo.toDate || 'all'}.csv`;

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    });

    const csvHeader = [
      'Redeem ID',
      'Requested At (IST)',
      'Party Name',
      'Party Username',
      'Bank Name',
      'Account Number',
      'IFSC Code',
      'Account Holder',
      'Redeem Amount (INR)',
      'Status',
      'UTR Number',
      'Admin Remark',
      'Processed At (IST)',
    ].join(',') + '\r\n';

    response.write(csvHeader);

    for (const row of result.rows) {
      const amount = (Number(row.amount_minor || 0) / 100).toFixed(2);
      const line = [
        `"RDM-${row.id.slice(0, 8).toUpperCase()}"`,
        `"${formatDateTime(row.created_at)}"`,
        `"${String(row.user_name || '').replace(/"/g, '""')}"`,
        `"${String(row.username || '').replace(/"/g, '""')}"`,
        `"${String(row.bank_name || '').replace(/"/g, '""')}"`,
        `"${String(row.account_number || '').replace(/"/g, '""')}"`,
        `"${String(row.ifsc_code || '').replace(/"/g, '""')}"`,
        `"${String(row.account_holder_name || '').replace(/"/g, '""')}"`,
        amount,
        `"${String(row.status || '').toUpperCase()}"`,
        `"${String(row.utr_number || '').replace(/"/g, '""')}"`,
        `"${String(row.admin_remark || '').replace(/"/g, '""')}"`,
        `"${formatDateTime(row.processed_at)}"`,
      ].join(',') + '\r\n';
      response.write(line);
    }
    response.end();
  }

  async function sendAdminWalletRedeemPage(admin, response, searchParams) {
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
    } = buildConditions(searchParams);

    const query = `
      SELECT p.id, p.user_id, p.bank_name, p.account_holder_name, p.account_number,
             p.ifsc_code, p.amount_minor, p.status, p.utr_number, p.admin_remark,
             p.created_at, p.processed_at,
             u.username, u.name AS user_name, u.business_name,
             adm.username AS processed_by_name
      FROM payout_requests p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN users adm ON adm.id = p.processed_by
      ${whereClause}
      ORDER BY CASE WHEN p.status = 'pending' THEN 0 ELSE 1 END, p.created_at DESC
      LIMIT 500
    `;

    const result = await db.query(query, values);

    // Calculate KPI Totals
    let totalCount = 0;
    let successCount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;
    let totalSuccessMinor = 0n;
    let totalPendingMinor = 0n;
    let totalRejectedMinor = 0n;

    for (const row of result.rows) {
      totalCount++;
      const amt = BigInt(row.amount_minor || 0);
      if (row.status === 'success') {
        successCount++;
        totalSuccessMinor += amt;
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

      let statusBadge = '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;"><i class="fa fa-clock-o mr-1"></i> Pending</span>';
      if (row.status === 'success') {
        statusBadge = '<span class="badge badge-success" style="background:#10b981;"><i class="fa fa-check mr-1"></i> Processed / Success</span>';
      } else if (row.status === 'rejected') {
        statusBadge = '<span class="badge badge-danger" style="background:#ef4444;"><i class="fa fa-times mr-1"></i> Rejected</span>';
      }

      let actions = '';
      if (row.status === 'pending') {
        actions = `
          <button type="button" class="btn btn-xs btn-primary font-weight-bold px-2 py-1 btn-process-redeem"
            data-id="${escapeHtml(row.id)}"
            data-user="${escapeHtml(row.user_name || row.username)}"
            data-bank="${escapeHtml(row.bank_name)}"
            data-acc="${escapeHtml(row.account_number)}"
            data-ifsc="${escapeHtml(row.ifsc_code)}"
            data-holder="${escapeHtml(row.account_holder_name)}"
            data-amount="₹${formatRupeesFromMinor(amt)}">
            <i class="fa fa-cogs mr-1"></i> Process / Pay
          </button>
        `;
      } else {
        actions = `<span class="small text-muted font-italic">${row.status === 'success' ? 'Paid via Bank' : 'Refunded to Wallet'}</span>`;
      }

      const reqCode = 'RDM-' + row.id.slice(0, 8).toUpperCase();

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
            <strong class="text-primary">${escapeHtml(row.bank_name)}</strong>
            <div class="small font-monospace text-dark font-weight-bold">A/C: ${escapeHtml(row.account_number)}</div>
            <div class="small text-muted">${escapeHtml(row.account_holder_name)} | IFSC: <span class="font-monospace text-uppercase">${escapeHtml(row.ifsc_code)}</span></div>
          </td>
          <td class="text-right font-weight-bold font-monospace text-dark" style="font-size:14px;">
            ₹${formatRupeesFromMinor(amt)}
          </td>
          <td class="text-center">${statusBadge}</td>
          <td class="font-monospace font-weight-bold text-dark small">
            ${row.utr_number ? `<span class="badge badge-light border px-2 py-1">${escapeHtml(row.utr_number)}</span>` : '<span class="text-muted">—</span>'}
          </td>
          <td>
            <div class="small text-muted">${escapeHtml(row.admin_remark || '—')}</div>
          </td>
          <td class="small text-muted" style="white-space:nowrap;">
            ${row.processed_at ? formatDateTime(row.processed_at) : '—'}
            ${row.processed_by_name ? `<div class="font-monospace text-info small">by @${escapeHtml(row.processed_by_name)}</div>` : ''}
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
  <title>List of Wallet Redeem - Admin Payment</title>
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
    ${renderAdminNavigation('/admin/payment/wallet-redeem')}

    <main class="main-content">
      <div class="page-container">

        <!-- Page Header -->
        <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap" style="gap:10px;">
          <div>
            <h3 class="font-weight-bold text-dark mb-1">
              <i class="fa fa-credit-card text-primary mr-2"></i>List of Wallet Redeem
            </h3>
            <p class="text-muted mb-0 small">
              View, process, and track wallet balance redeem / bank payout requests
            </p>
          </div>
          <div class="d-flex align-items-center" style="gap:8px;">
            <a href="?${searchParams.toString()}&export=csv" class="btn btn-sm btn-outline-success font-weight-bold shadow-sm">
              <i class="fa fa-download mr-1"></i> Export CSV
            </a>
          </div>
        </div>

        <!-- Filter Card -->
        <section class="card-panel mb-3">
          <div class="card-panel-head">
            <span class="font-weight-bold text-dark">
              <i class="fa fa-filter text-primary mr-1"></i> Filter Wallet Redeem Requests
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
            <form method="GET" action="/admin/payment/wallet-redeem" id="filterForm">
              <div class="form-row">
                <div class="form-group col-md-3 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterFromDate">From Date</label>
                  <input type="date" class="form-control form-control-sm" id="filterFromDate" name="fromDate" value="${escapeHtml(fromDate)}">
                </div>
                <div class="form-group col-md-3 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterToDate">To Date</label>
                  <input type="date" class="form-control form-control-sm" id="filterToDate" name="toDate" value="${escapeHtml(toDate)}">
                </div>
                <div class="form-group col-md-3 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterParty">Party Name / Username</label>
                  <input type="text" class="form-control form-control-sm" id="filterParty" name="partyName" value="${escapeHtml(partyName)}" placeholder="Search party or username...">
                </div>
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterStatus">Status</label>
                  <select class="form-control form-control-sm" id="filterStatus" name="status">
                    <option value="all"${statusFilter === 'all' || !statusFilter ? ' selected' : ''}>All Status</option>
                    <option value="pending"${statusFilter === 'pending' ? ' selected' : ''}>Pending</option>
                    <option value="success"${statusFilter === 'success' ? ' selected' : ''}>Success / Paid</option>
                    <option value="rejected"${statusFilter === 'rejected' ? ' selected' : ''}>Rejected</option>
                  </select>
                </div>
                <div class="form-group col-md-1 col-sm-12 mb-2 d-flex align-items-end" style="gap:6px;">
                  <button type="submit" class="btn btn-primary btn-sm btn-block font-weight-bold">
                    <i class="fa fa-search"></i>
                  </button>
                  <a href="/admin/payment/wallet-redeem" class="btn btn-outline-secondary btn-sm font-weight-bold">
                    <i class="fa fa-refresh"></i>
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
              <div class="kpi-title"><i class="fa fa-list-alt mr-1"></i> Total Redeem Requests</div>
              <div class="kpi-value">${totalCount}</div>
              <div class="kpi-sub">Total withdrawal requests in filter</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #059669, #047857);">
              <div class="kpi-title"><i class="fa fa-check-circle mr-1"></i> Processed / Paid</div>
              <div class="kpi-value">₹${formatRupeesFromMinor(totalSuccessMinor)}</div>
              <div class="kpi-sub">${successCount} requests successfully transferred</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #d97706, #b45309);">
              <div class="kpi-title"><i class="fa fa-clock-o mr-1"></i> Pending Payout Amount</div>
              <div class="kpi-value">₹${formatRupeesFromMinor(totalPendingMinor)}</div>
              <div class="kpi-sub">${pendingCount} requests waiting to be paid</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #dc2626, #b91c1c);">
              <div class="kpi-title"><i class="fa fa-times-circle mr-1"></i> Rejected Amount</div>
              <div class="kpi-value">₹${formatRupeesFromMinor(totalRejectedMinor)}</div>
              <div class="kpi-sub">${rejectedCount} rejected &amp; refunded to wallet</div>
            </div>
          </div>
        </div>

        <!-- Report Table -->
        <div class="card-panel">
          <div class="card-panel-head">
            <span class="font-weight-bold text-dark">
              <i class="fa fa-table text-primary mr-1"></i> Wallet Redeem Records (${result.rowCount})
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
                  <th>Redeem ID</th>
                  <th>Requested At (IST)</th>
                  <th>Party Name</th>
                  <th>Bank Account Details</th>
                  <th class="text-right">Redeem Amount (₹)</th>
                  <th class="text-center">Status</th>
                  <th>Bank UTR No.</th>
                  <th>Remarks</th>
                  <th>Processed Date</th>
                  <th class="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="11" class="text-center py-4 text-muted font-weight-bold">No wallet redeem records found for this filter.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  </div>
</div>

<!-- Modal: Process Payout / Redeem -->
<div class="modal fade" id="processPayoutModal" tabindex="-1" role="dialog" aria-labelledby="processPayoutModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered" role="document">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title font-weight-bold" id="processPayoutModalLabel">
          <i class="fa fa-bank mr-1"></i> Process Wallet Redeem Payout
        </h5>
        <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <form id="payoutProcessForm">
        <input type="hidden" id="payoutId" name="payoutId">
        <div class="modal-body">
          <div id="processModalError" class="alert alert-danger d-none mb-3"></div>

          <div class="card bg-light border p-3 mb-3">
            <div class="d-flex justify-content-between mb-1">
              <span class="text-muted small">Party:</span>
              <strong id="modalPartyName" class="text-dark"></strong>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span class="text-muted small">Bank / Holder:</span>
              <span id="modalBankDetails" class="text-dark small font-weight-bold"></span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span class="text-muted small">Account &amp; IFSC:</span>
              <span id="modalAccountDetails" class="text-primary font-monospace font-weight-bold"></span>
            </div>
            <div class="d-flex justify-content-between border-top pt-2 mt-1">
              <span class="text-muted font-weight-bold">Redeem Amount:</span>
              <strong id="modalAmount" class="text-success font-monospace" style="font-size:16px;"></strong>
            </div>
          </div>

          <div class="form-group">
            <label class="font-weight-bold small text-muted">Select Action *</label>
            <select class="form-control" id="payoutAction" name="action" required>
              <option value="success">Mark as Paid / Success (Transferred to User Bank)</option>
              <option value="reject">Reject &amp; Refund Amount Back to User Wallet</option>
            </select>
          </div>

          <div class="form-group" id="utrGroup">
            <label class="font-weight-bold small text-muted">Bank UTR / Transaction Ref No. *</label>
            <input type="text" class="form-control font-monospace" id="payoutUtr" name="utr" placeholder="Enter bank UTR (e.g. 428198129031)">
            <small class="text-muted">Enter the 12-digit or transaction reference number from your netbanking app.</small>
          </div>

          <div class="form-group">
            <label class="font-weight-bold small text-muted">Admin Remarks / Note</label>
            <input type="text" class="form-control" id="payoutRemark" name="remark" placeholder="e.g. IMPS payment done / Account verification failed">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-primary font-weight-bold" id="btnSubmitProcess">
            Confirm &amp; Process Payout
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

  // Open Process Modal
  $(document).on('click', '.btn-process-redeem', function() {
    const btn = $(this);
    $('#payoutId').val(btn.data('id'));
    $('#modalPartyName').text(btn.data('user'));
    $('#modalBankDetails').text(btn.data('bank') + ' (' + btn.data('holder') + ')');
    $('#modalAccountDetails').text(btn.data('acc') + ' / ' + btn.data('ifsc'));
    $('#modalAmount').text(btn.data('amount'));
    $('#payoutUtr').val('');
    $('#payoutRemark').val('');
    $('#processModalError').addClass('d-none');
    $('#payoutAction').val('success').trigger('change');
    $('#processPayoutModal').modal('show');
  });

  $('#payoutAction').on('change', function() {
    if ($(this).val() === 'reject') {
      $('#utrGroup').hide();
      $('#payoutUtr').prop('required', false);
      $('#btnSubmitProcess').removeClass('btn-primary').addClass('btn-danger').text('Reject Payout & Refund Wallet');
    } else {
      $('#utrGroup').show();
      $('#payoutUtr').prop('required', true);
      $('#btnSubmitProcess').removeClass('btn-danger').addClass('btn-primary').text('Confirm & Process Payout');
    }
  });

  // Submit Payout Process
  $('#payoutProcessForm').on('submit', async function(e) {
    e.preventDefault();
    const btn = $('#btnSubmitProcess');
    const id = $('#payoutId').val();
    const action = $('#payoutAction').val();
    const utr = $('#payoutUtr').val().trim();
    const remark = $('#payoutRemark').val().trim();

    if (action === 'success' && !utr) {
      $('#processModalError').text('Bank UTR number is required for successful payout.').removeClass('d-none');
      return;
    }

    btn.prop('disabled', true).text('Processing...');
    $('#processModalError').addClass('d-none');

    try {
      const response = await fetch('/api/admin/payment/payouts/process', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action, utr, remark }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to process payout.');
      alert('Payout processed successfully.');
      location.reload();
    } catch (err) {
      $('#processModalError').text(err.message).removeClass('d-none');
      btn.prop('disabled', false).text('Confirm & Process Payout');
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
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/payment/wallet-redeem' }));
  }

  return {
    sendAdminWalletRedeemPage,
  };
};
