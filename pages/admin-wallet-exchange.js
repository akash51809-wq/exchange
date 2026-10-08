'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminWalletExchangePage({
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
    const entryType = String(params.get('entryType') || '').trim().toLowerCase();
    const referenceType = String(params.get('referenceType') || '').trim();

    const conditions = [];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (fromDate) {
      conditions.push(`we.created_at >= (${add(fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (toDate) {
      conditions.push(`we.created_at < (((${add(toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (partyName) {
      const pLike = add(`%${partyName}%`);
      conditions.push(`(u.name ILIKE ${pLike} OR u.username ILIKE ${pLike} OR COALESCE(u.business_name, '') ILIKE ${pLike} OR COALESCE(u.email, '') ILIKE ${pLike})`);
    }
    if (entryType && entryType !== 'all') {
      conditions.push(`we.entry_type = ${add(entryType)}`);
    }
    if (referenceType && referenceType !== 'all') {
      conditions.push(`we.reference_type = ${add(referenceType)}`);
    }

    return {
      whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      values,
      fromDate,
      toDate,
      partyName,
      entryType,
      referenceType,
    };
  }

  /**
   * Stream CSV
   */
  async function streamCsv(searchParams, response) {
    const filterInfo = buildConditions(searchParams);
    const query = `
      SELECT we.id, we.created_at, we.amount_minor, we.entry_type, we.reference_type,
             we.reference_id, we.idempotency_key, we.description,
             u.username, u.name AS user_name, u.business_name, u.role,
             COALESCE(w.balance_minor, 0) AS current_balance_minor
      FROM wallet_entries we
      JOIN users u ON u.id = we.user_id
      JOIN wallets w ON w.id = we.wallet_id
      ${filterInfo.whereClause}
      ORDER BY we.created_at DESC
      LIMIT 10000
    `;

    const result = await db.query(query, filterInfo.values);
    const fileName = `wallet_exchange_report_${filterInfo.fromDate || 'all'}_to_${filterInfo.toDate || 'all'}.csv`;

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    });

    const csvHeader = [
      'Txn Ref ID',
      'Date Time (IST)',
      'Party Name',
      'Party Username',
      'Role',
      'Entry Type',
      'Amount (INR)',
      'Exchange Category',
      'Description',
      'Idempotency Key',
      'Current Wallet Balance (INR)',
    ].join(',') + '\r\n';

    response.write(csvHeader);

    for (const row of result.rows) {
      const amount = (Number(row.amount_minor || 0) / 100).toFixed(2);
      const balance = (Number(row.current_balance_minor || 0) / 100).toFixed(2);
      const line = [
        `"WEX-${row.id.slice(0, 8).toUpperCase()}"`,
        `"${formatDateTime(row.created_at)}"`,
        `"${String(row.user_name || '').replace(/"/g, '""')}"`,
        `"${String(row.username || '').replace(/"/g, '""')}"`,
        `"${String(row.role || 'user').toUpperCase()}"`,
        `"${String(row.entry_type || '').toUpperCase()}"`,
        amount,
        `"${String(row.reference_type || '').replace(/"/g, '""')}"`,
        `"${String(row.description || '').replace(/"/g, '""')}"`,
        `"${String(row.idempotency_key || '').replace(/"/g, '""')}"`,
        balance,
      ].join(',') + '\r\n';
      response.write(line);
    }
    response.end();
  }

  async function sendAdminWalletExchangePage(admin, response, searchParams) {
    if (searchParams.get('export') === 'csv') {
      return streamCsv(searchParams, response);
    }

    const {
      whereClause,
      values,
      fromDate,
      toDate,
      partyName,
      entryType,
      referenceType,
    } = buildConditions(searchParams);

    const query = `
      SELECT we.id, we.created_at, we.amount_minor, we.entry_type, we.reference_type,
             we.reference_id, we.idempotency_key, we.description,
             u.id AS user_id, u.username, u.name AS user_name, u.business_name, u.role,
             COALESCE(w.balance_minor, 0) AS current_balance_minor
      FROM wallet_entries we
      JOIN users u ON u.id = we.user_id
      JOIN wallets w ON w.id = we.wallet_id
      ${whereClause}
      ORDER BY we.created_at DESC
      LIMIT 500
    `;

    const result = await db.query(query, values);

    // Calculate KPI Totals
    let totalCount = 0;
    let totalCreditMinor = 0n;
    let totalDebitMinor = 0n;
    let totalRefundMinor = 0n;

    for (const row of result.rows) {
      totalCount++;
      const amt = BigInt(row.amount_minor || 0);
      if (row.entry_type === 'credit') {
        totalCreditMinor += amt;
      } else if (row.entry_type === 'debit') {
        totalDebitMinor += amt;
      } else if (row.entry_type === 'refund') {
        totalRefundMinor += amt;
      }
    }

    const netExchangeFlowMinor = totalCreditMinor + totalRefundMinor - totalDebitMinor;

    // Format Table Rows
    const rowsHtml = result.rows.map((row, idx) => {
      const amt = BigInt(row.amount_minor || 0);
      const curBal = BigInt(row.current_balance_minor || 0);

      let typeBadge = '';
      if (row.entry_type === 'credit') {
        typeBadge = '<span class="badge badge-success px-2 py-1" style="background:#10b981;"><i class="fa fa-arrow-down mr-1"></i> CREDIT</span>';
      } else if (row.entry_type === 'debit') {
        typeBadge = '<span class="badge badge-danger px-2 py-1" style="background:#ef4444;"><i class="fa fa-arrow-up mr-1"></i> DEBIT</span>';
      } else if (row.entry_type === 'refund') {
        typeBadge = '<span class="badge badge-info px-2 py-1" style="background:#0ea5e9;"><i class="fa fa-undo mr-1"></i> REFUND</span>';
      } else {
        typeBadge = `<span class="badge badge-secondary px-2 py-1">${escapeHtml(row.entry_type || 'TXN')}</span>`;
      }

      // Friendly label for reference_type
      const refLabels = {
        recharge_order: 'Recharge Purchase (Debit)',
        buyer_margin: 'Buyer Commission (Credit)',
        fail_recharge: 'Recharge Failed Refund',
        recharge_refund: 'Order Refund',
        recharge_dispute_refund: 'Dispute Refund',
        fund_request: 'Wallet Topup (Fund Request)',
        payout_request: 'Payout Redeem (Debit)',
        payout_refund: 'Rejected Payout Refund',
        seller_sales_credit: 'Seller Sale Settlement (Credit)',
        manual_admin_update: 'Manual Admin Adjustment',
      };
      const categoryLabel = refLabels[row.reference_type] || row.reference_type || 'General Wallet';

      const txnCode = 'WEX-' + row.id.slice(0, 8).toUpperCase();

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <span class="badge badge-light border text-monospace font-weight-bold" title="${row.id}">
              ${txnCode}
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
          <td class="text-center">
            <span class="badge badge-light border text-uppercase" style="font-size:10px;">${escapeHtml(row.role || 'user')}</span>
          </td>
          <td class="text-center">${typeBadge}</td>
          <td class="text-right font-weight-bold font-monospace" style="font-size:14px;color:${row.entry_type === 'debit' ? '#ef4444' : '#10b981'};">
            ${row.entry_type === 'debit' ? '-' : '+'}₹${formatRupeesFromMinor(amt)}
          </td>
          <td>
            <span class="badge badge-pill badge-light border font-weight-bold text-dark">
              ${escapeHtml(categoryLabel)}
            </span>
          </td>
          <td>
            <div class="small text-dark font-weight-bold">${escapeHtml(row.description || 'Wallet transaction')}</div>
            <div class="small text-muted font-monospace">${escapeHtml(row.idempotency_key || '—')}</div>
          </td>
          <td class="text-right font-monospace">
            <span class="badge badge-light border font-weight-bold text-primary">₹${formatRupeesFromMinor(curBal)}</span>
          </td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>List of Wallet Exchange - Admin Payment</title>
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
    ${renderAdminNavigation('/admin/payment/wallet-exchange')}

    <main class="main-content">
      <div class="page-container">

        <!-- Page Header -->
        <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap" style="gap:10px;">
          <div>
            <h3 class="font-weight-bold text-dark mb-1">
              <i class="fa fa-exchange text-primary mr-2"></i>List of Wallet Exchange
            </h3>
            <p class="text-muted mb-0 small">
              Complete Ledger of all wallet movements, debit/credits, commissions &amp; settlements
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
              <i class="fa fa-filter text-primary mr-1"></i> Filter Wallet Exchange Transactions
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
            <form method="GET" action="/admin/payment/wallet-exchange" id="filterForm">
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
                  <input type="text" class="form-control form-control-sm" id="filterParty" name="partyName" value="${escapeHtml(partyName)}" placeholder="Search party or username...">
                </div>
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterType">Entry Type</label>
                  <select class="form-control form-control-sm" id="filterType" name="entryType">
                    <option value="all"${entryType === 'all' || !entryType ? ' selected' : ''}>All Types</option>
                    <option value="credit"${entryType === 'credit' ? ' selected' : ''}>Credit (+)</option>
                    <option value="debit"${entryType === 'debit' ? ' selected' : ''}>Debit (-)</option>
                    <option value="refund"${entryType === 'refund' ? ' selected' : ''}>Refund</option>
                  </select>
                </div>
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterCategory">Category</label>
                  <select class="form-control form-control-sm" id="filterCategory" name="referenceType">
                    <option value="">All Categories</option>
                    <option value="recharge_order"${referenceType === 'recharge_order' ? ' selected' : ''}>Recharge Purchase</option>
                    <option value="buyer_margin"${referenceType === 'buyer_margin' ? ' selected' : ''}>Buyer Commission</option>
                    <option value="seller_sales_credit"${referenceType === 'seller_sales_credit' ? ' selected' : ''}>Seller Settlement</option>
                    <option value="fail_recharge"${referenceType === 'fail_recharge' ? ' selected' : ''}>Failed Recharge Refund</option>
                    <option value="fund_request"${referenceType === 'fund_request' ? ' selected' : ''}>Fund Topup</option>
                    <option value="payout_request"${referenceType === 'payout_request' ? ' selected' : ''}>Payout Redeem</option>
                    <option value="manual_admin_update"${referenceType === 'manual_admin_update' ? ' selected' : ''}>Manual Admin</option>
                  </select>
                </div>
                <div class="form-group col-md-1 col-sm-12 mb-2 d-flex align-items-end" style="gap:6px;">
                  <button type="submit" class="btn btn-primary btn-sm btn-block font-weight-bold">
                    <i class="fa fa-search"></i>
                  </button>
                  <a href="/admin/payment/wallet-exchange" class="btn btn-outline-secondary btn-sm font-weight-bold">
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
              <div class="kpi-title"><i class="fa fa-list mr-1"></i> Total Exchange Entries</div>
              <div class="kpi-value">${totalCount}</div>
              <div class="kpi-sub">Total ledger transactions</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #059669, #047857);">
              <div class="kpi-title"><i class="fa fa-arrow-down mr-1"></i> Total Credit Volume</div>
              <div class="kpi-value">₹${formatRupeesFromMinor(totalCreditMinor)}</div>
              <div class="kpi-sub">Commissions, topups &amp; credits</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #dc2626, #b91c1c);">
              <div class="kpi-title"><i class="fa fa-arrow-up mr-1"></i> Total Debit Volume</div>
              <div class="kpi-value">₹${formatRupeesFromMinor(totalDebitMinor)}</div>
              <div class="kpi-sub">Recharges &amp; payout debits</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #0284c7, #0369a1);">
              <div class="kpi-title"><i class="fa fa-undo mr-1"></i> Total Refunds Volume</div>
              <div class="kpi-value">₹${formatRupeesFromMinor(totalRefundMinor)}</div>
              <div class="kpi-sub">Failed orders &amp; dispute returns</div>
            </div>
          </div>
        </div>

        <!-- Report Table -->
        <div class="card-panel">
          <div class="card-panel-head">
            <span class="font-weight-bold text-dark">
              <i class="fa fa-table text-primary mr-1"></i> Wallet Exchange Transactions (${result.rowCount})
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
                  <th>Txn ID</th>
                  <th>Date &amp; Time (IST)</th>
                  <th>Party Details</th>
                  <th class="text-center">Role</th>
                  <th class="text-center">Type</th>
                  <th class="text-right">Amount (₹)</th>
                  <th>Category</th>
                  <th>Particulars / Description</th>
                  <th class="text-right">Balance After (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="10" class="text-center py-4 text-muted font-weight-bold">No wallet exchange records found for this filter.</td></tr>'}
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
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/payment/wallet-exchange' }));
  }

  return {
    sendAdminWalletExchangePage,
  };
};
