'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminBuyerLedgerPage({
  db,
  formatMinorUnits,
  sendJson,
  httpError,
}) {
  function getTodayString() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
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

  async function sendAdminBuyerLedgerPage(admin, response, searchParams) {
    const today = getTodayString();
    const fromDate = String(searchParams.get('fromDate') || today).trim();
    const toDate = String(searchParams.get('toDate') || today).trim();
    const selectedUserId = String(searchParams.get('userId') || 'all').trim();
    const typeFilter = String(searchParams.get('type') || 'all').trim().toLowerCase();
    const limitFilter = String(searchParams.get('limit') || '50').trim();
    const isCsv = String(searchParams.get('format') || '').toLowerCase() === 'csv';

    let limitClause = 'LIMIT 50';
    if (limitFilter === '100') limitClause = 'LIMIT 100';
    else if (limitFilter === '200') limitClause = 'LIMIT 200';
    else if (limitFilter === 'all') limitClause = 'LIMIT 2000';

    // 1. Fetch buyer users for dropdown
    const buyersRes = await db.query(`
      SELECT id, username, name, business_name
      FROM users
      WHERE role = 'user' AND deleted_at IS NULL
      ORDER BY name ASC, username ASC
    `);
    const buyerUsers = buyersRes.rows || [];

    const startTimestamp = `${fromDate} 00:00:00+05:30`;
    const endTimestamp = `${toDate} 23:59:59.999+05:30`;

    const userWhereClause = (selectedUserId && selectedUserId !== 'all') ? 'AND w.user_id = $1' : '';
    const userParams = (selectedUserId && selectedUserId !== 'all') ? [selectedUserId] : [];

    // 2. Opening Balance (all net wallet entries before startTimestamp)
    let openingBalanceMinor = 0n;
    try {
      const openSql = `
        SELECT COALESCE(SUM(CASE WHEN w.entry_type = 'debit' THEN -w.amount_minor ELSE w.amount_minor END), 0) AS opening_bal
        FROM wallet_entries w
        WHERE w.created_at < '${startTimestamp}'::timestamptz
        ${userWhereClause}
      `;
      const openRes = await db.query(openSql, userParams);
      openingBalanceMinor = BigInt(openRes.rows[0]?.opening_bal || 0);
    } catch (e) {
      console.warn('[Buyer Ledger] Error fetching opening balance:', e.message);
    }

    // 3. KPI: Purchase, Redeem, Used Balance, Period Credits & Debits
    let purchaseBalanceMinor = 0n;
    let redeemBalanceMinor = 0n;
    let totalUsedBalanceMinor = 0n;
    let periodCreditsMinor = 0n;
    let periodDebitsMinor = 0n;

    try {
      const kpiSql = `
        SELECT
          COALESCE(SUM(w.amount_minor) FILTER (WHERE w.entry_type = 'debit' AND (w.reference_type ILIKE '%recharge%' OR w.description ILIKE '%recharge%')), 0) AS purchase_debit,
          COALESCE(SUM(w.amount_minor) FILTER (WHERE w.entry_type = 'debit' AND (w.reference_type ILIKE '%payout%' OR w.reference_type ILIKE '%redeem%' OR w.description ILIKE '%payout%')), 0) AS redeem_debit,
          COALESCE(SUM(w.amount_minor) FILTER (WHERE w.entry_type = 'debit'), 0) AS total_used,
          COALESCE(SUM(w.amount_minor) FILTER (WHERE w.entry_type <> 'debit'), 0) AS total_credits
        FROM wallet_entries w
        WHERE w.created_at >= '${startTimestamp}'::timestamptz
          AND w.created_at <= '${endTimestamp}'::timestamptz
          ${userWhereClause}
      `;
      const kpiRes = await db.query(kpiSql, userParams);
      const kRow = kpiRes.rows[0] || {};
      purchaseBalanceMinor = BigInt(kRow.purchase_debit || 0);
      redeemBalanceMinor = BigInt(kRow.redeem_debit || 0);
      totalUsedBalanceMinor = BigInt(kRow.total_used || 0);
      periodDebitsMinor = BigInt(kRow.total_used || 0);
      periodCreditsMinor = BigInt(kRow.total_credits || 0);
    } catch (e) {
      console.warn('[Buyer Ledger] Error fetching summary KPIs:', e.message);
    }

    // Closing Balance = Opening Balance + Period Credits - Period Debits
    const closingBalanceMinor = openingBalanceMinor + periodCreditsMinor - periodDebitsMinor;

    // 4. Fetch Full Detailed Transaction Ledger Table
    // Running balance query across all matching wallet movements
    const whereConditions = [
      `w.created_at >= '${startTimestamp}'::timestamptz`,
      `w.created_at <= '${endTimestamp}'::timestamptz`,
    ];
    if (selectedUserId && selectedUserId !== 'all') {
      whereConditions.push(`w.user_id = '${selectedUserId}'`);
    }
    if (typeFilter === 'recharge') {
      whereConditions.push(`(w.reference_type ILIKE '%recharge%' OR w.description ILIKE '%recharge%')`);
    } else if (typeFilter === 'topup') {
      whereConditions.push(`(w.reference_type ILIKE '%fund%' OR w.reference_type ILIKE '%topup%' OR w.description ILIKE '%topup%')`);
    } else if (typeFilter === 'margin') {
      whereConditions.push(`(w.reference_type ILIKE '%margin%' OR w.description ILIKE '%margin%')`);
    } else if (typeFilter === 'payout') {
      whereConditions.push(`(w.reference_type ILIKE '%payout%' OR w.reference_type ILIKE '%redeem%')`);
    } else if (typeFilter === 'refund') {
      whereConditions.push(`(w.reference_type ILIKE '%refund%' OR w.entry_type = 'refund')`);
    } else if (typeFilter === 'adjustment') {
      whereConditions.push(`(w.reference_type ILIKE '%admin%' OR w.entry_type = 'adjustment')`);
    }

    const txnsQuery = `
      WITH running AS (
        SELECT w.id, w.wallet_id, w.user_id, w.amount_minor, w.entry_type, w.reference_type,
               w.idempotency_key, w.description, w.created_at,
               u.name AS user_name, u.username AS user_username,
               SUM(CASE WHEN w.entry_type = 'debit' THEN -w.amount_minor ELSE w.amount_minor END)
                 OVER (PARTITION BY w.user_id ORDER BY w.created_at ASC, w.id ASC) AS user_running_balance_minor
        FROM wallet_entries w
        JOIN users u ON u.id = w.user_id
        ${selectedUserId !== 'all' ? `WHERE w.user_id = '${selectedUserId}'` : ''}
      )
      SELECT r.*,
        (r.user_running_balance_minor - (CASE WHEN r.entry_type = 'debit' THEN -r.amount_minor ELSE r.amount_minor END)) AS old_balance_minor
      FROM running r
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY r.created_at DESC, r.id DESC
      ${limitClause}
    `;

    let txnRows = [];
    try {
      const txnsRes = await db.query(txnsQuery);
      txnRows = txnsRes.rows || [];
    } catch (e) {
      console.warn('[Buyer Ledger] Error fetching transaction rows:', e.message);
    }

    // Handle CSV download
    if (isCsv) {
      response.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="buyer_ledger_${fromDate}_to_${toDate}.csv"`,
        'cache-control': 'no-store',
      });
      let csv = 'Sr,Date Time (IST),Txn ID,Buyer Name,Username,Type,Particulars,Old Balance (INR),Debit (INR),Credit (INR),New Balance (INR)\n';
      txnRows.forEach((r, idx) => {
        const isDebit = r.entry_type === 'debit';
        const amt = BigInt(r.amount_minor || 0);
        const oldBal = BigInt(r.old_balance_minor || 0);
        const curBal = BigInt(r.user_running_balance_minor || 0);
        const dStr = isDebit ? (Number(amt) / 100).toFixed(2) : '0.00';
        const cStr = !isDebit ? (Number(amt) / 100).toFixed(2) : '0.00';
        csv += `${idx + 1},"${formatDateTime(r.created_at)}","${r.idempotency_key || r.id}","${r.user_name || ''}","${r.user_username || ''}","${r.reference_type || r.entry_type}","${(r.description || '').replace(/"/g, '""')}",${(Number(oldBal) / 100).toFixed(2)},${dStr},${cStr},${(Number(curBal) / 100).toFixed(2)}\n`;
      });
      return response.end(csv);
    }

    const navigation = renderAdminNavigation('/admin/reports/buyer-ledger');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Buyer Ledger - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 16px 20px 40px; }
    .ledger-kpi-card {
      background: #ffffff;
      border-radius: 8px;
      padding: 16px 20px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .kpi-icon-box {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .filter-card {
      background: #ffffff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      padding: 14px 18px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <div class="page-container">
        
        <!-- Header -->
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h3 class="font-weight-bold text-dark mb-0">
              <i class="fa fa-list-alt text-primary mr-1"></i> Buyer Ledger
            </h3>
            <p class="text-muted small mb-0">
              Complete statement and audit ledger of opening balance, purchase transactions, payouts, balance usage, and every debit/credit entry.
            </p>
          </div>
          <div class="d-flex gap-2">
            <a href="?fromDate=${escapeHtml(fromDate)}&toDate=${escapeHtml(toDate)}&userId=${escapeHtml(selectedUserId)}&type=${escapeHtml(typeFilter)}&format=csv" class="btn btn-outline-success btn-sm font-weight-bold">
              <i class="fa fa-download mr-1"></i> Export Ledger CSV
            </a>
            <a href="/admin/reports/buyer-daybook${selectedUserId !== 'all' ? `?userId=${selectedUserId}` : ''}" class="btn btn-outline-primary btn-sm font-weight-bold">
              <i class="fa fa-book mr-1"></i> View Buyer Daybook
            </a>
          </div>
        </div>

        <!-- Filter Form -->
        <div class="filter-card">
          <form method="GET" action="/admin/reports/buyer-ledger" class="row align-items-end g-2">
            <div class="col-md-2 col-sm-6">
              <label class="font-weight-bold small text-muted mb-1">From Date:</label>
              <input type="date" name="fromDate" value="${escapeHtml(fromDate)}" class="form-control form-control-sm font-weight-bold">
            </div>
            <div class="col-md-2 col-sm-6">
              <label class="font-weight-bold small text-muted mb-1">To Date:</label>
              <input type="date" name="toDate" value="${escapeHtml(toDate)}" class="form-control form-control-sm font-weight-bold">
            </div>
            <div class="col-md-3 col-sm-6">
              <label class="font-weight-bold small text-muted mb-1">Buyer User:</label>
              <select name="userId" class="form-control form-control-sm font-weight-bold">
                <option value="all">-- All Buyers --</option>
                ${buyerUsers.map((u) => `
                  <option value="${u.id}" ${u.id === selectedUserId ? 'selected' : ''}>
                    ${escapeHtml(u.name || u.username)} (${escapeHtml(u.username)})
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="col-md-2 col-sm-6">
              <label class="font-weight-bold small text-muted mb-1">Txn Type:</label>
              <select name="type" class="form-control form-control-sm font-weight-bold">
                <option value="all" ${typeFilter === 'all' ? 'selected' : ''}>All Types</option>
                <option value="recharge" ${typeFilter === 'recharge' ? 'selected' : ''}>Buy Recharge</option>
                <option value="topup" ${typeFilter === 'topup' ? 'selected' : ''}>Topup Deposit</option>
                <option value="margin" ${typeFilter === 'margin' ? 'selected' : ''}>Buyer Margin</option>
                <option value="payout" ${typeFilter === 'payout' ? 'selected' : ''}>Payout / Redeem</option>
                <option value="refund" ${typeFilter === 'refund' ? 'selected' : ''}>Refund</option>
                <option value="adjustment" ${typeFilter === 'adjustment' ? 'selected' : ''}>Admin Adjustment</option>
              </select>
            </div>
            <div class="col-md-1 col-sm-6">
              <label class="font-weight-bold small text-muted mb-1">Rows:</label>
              <select name="limit" class="form-control form-control-sm font-weight-bold">
                <option value="50" ${limitFilter === '50' ? 'selected' : ''}>50</option>
                <option value="100" ${limitFilter === '100' ? 'selected' : ''}>100</option>
                <option value="200" ${limitFilter === '200' ? 'selected' : ''}>200</option>
                <option value="all" ${limitFilter === 'all' ? 'selected' : ''}>All</option>
              </select>
            </div>
            <div class="col-md-2 col-sm-6 d-flex gap-1">
              <button type="submit" class="btn btn-primary btn-sm btn-block font-weight-bold">
                <i class="fa fa-filter mr-1"></i> Filter
              </button>
              <a href="/admin/reports/buyer-ledger" class="btn btn-outline-secondary btn-sm" title="Reset">
                <i class="fa fa-refresh"></i>
              </a>
            </div>
          </form>
        </div>

        <!-- Top 5 Summary Cards -->
        <div class="row row-deck mb-4">
          <!-- 1. Opening Balance -->
          <div class="col-xl-2 col-lg-4 col-md-6 mb-3">
            <div class="ledger-kpi-card">
              <div class="kpi-icon-box bg-primary-transparent text-primary">
                <i class="fa fa-university"></i>
              </div>
              <div>
                <small class="text-muted font-weight-bold d-block text-uppercase">Opening Balance</small>
                <h4 class="font-weight-bold text-dark mb-0 font-monospace">₹${formatRupeesFromMinor(openingBalanceMinor)}</h4>
              </div>
            </div>
          </div>

          <!-- 2. Purchase -->
          <div class="col-xl-2 col-lg-4 col-md-6 mb-3">
            <div class="ledger-kpi-card">
              <div class="kpi-icon-box bg-info-transparent text-info">
                <i class="fa fa-shopping-cart"></i>
              </div>
              <div>
                <small class="text-muted font-weight-bold d-block text-uppercase">Purchase (Buy)</small>
                <h4 class="font-weight-bold text-info mb-0 font-monospace">₹${formatRupeesFromMinor(purchaseBalanceMinor)}</h4>
              </div>
            </div>
          </div>

          <!-- 3. Redeem -->
          <div class="col-xl-2 col-lg-4 col-md-6 mb-3">
            <div class="ledger-kpi-card">
              <div class="kpi-icon-box bg-warning-transparent text-warning">
                <i class="fa fa-money"></i>
              </div>
              <div>
                <small class="text-muted font-weight-bold d-block text-uppercase">Redeem (Payout)</small>
                <h4 class="font-weight-bold text-warning mb-0 font-monospace">₹${formatRupeesFromMinor(redeemBalanceMinor)}</h4>
              </div>
            </div>
          </div>

          <!-- 4. Used Balance -->
          <div class="col-xl-3 col-lg-6 col-md-6 mb-3">
            <div class="ledger-kpi-card">
              <div class="kpi-icon-box bg-danger-transparent text-danger">
                <i class="fa fa-arrow-circle-down"></i>
              </div>
              <div>
                <small class="text-muted font-weight-bold d-block text-uppercase">Total Used Balance</small>
                <h4 class="font-weight-bold text-danger mb-0 font-monospace">₹${formatRupeesFromMinor(totalUsedBalanceMinor)}</h4>
                <small class="text-muted">Net debits (purchases + payouts)</small>
              </div>
            </div>
          </div>

          <!-- 5. Closing Balance -->
          <div class="col-xl-3 col-lg-6 col-md-6 mb-3">
            <div class="ledger-kpi-card">
              <div class="kpi-icon-box bg-success-transparent text-success">
                <i class="fa fa-balance-scale"></i>
              </div>
              <div>
                <small class="text-muted font-weight-bold d-block text-uppercase">Closing Balance</small>
                <h4 class="font-weight-bold text-success mb-0 font-monospace">₹${formatRupeesFromMinor(closingBalanceMinor)}</h4>
                <small class="text-muted">Net balance after all movements</small>
              </div>
            </div>
          </div>
        </div>

        <!-- Full Detailed Transaction Ledger Table -->
        <div class="card shadow-sm border-0">
          <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
            <h5 class="card-title font-weight-bold mb-0 text-dark">
              <i class="fa fa-table text-primary mr-1"></i> Transaction Statement &amp; Ledger Table
            </h5>
            <span class="badge badge-light border text-muted px-2 py-1">${txnRows.length} Entry(ies) shown</span>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered table-striped card-table mb-0 text-nowrap">
              <thead class="bg-light">
                <tr>
                  <th class="text-center" style="width:45px;">#</th>
                  <th>Date &amp; Time (IST)</th>
                  <th>Txn / Ref ID</th>
                  <th>Buyer</th>
                  <th class="text-center">Type</th>
                  <th>Particulars / Description</th>
                  <th class="text-right">Opening Bal (₹)</th>
                  <th class="text-right">Debit (₹)</th>
                  <th class="text-right">Credit (₹)</th>
                  <th class="text-right">Closing Bal (₹)</th>
                  <th class="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                ${txnRows.length === 0 ? `
                  <tr>
                    <td colspan="11" class="text-center py-4 text-muted">
                      <i class="fa fa-info-circle fa-2x mb-2 text-muted d-block"></i>
                      No ledger transactions found for the selected filters.
                    </td>
                  </tr>
                ` : txnRows.map((row, idx) => {
                  const isDebit = row.entry_type === 'debit';
                  const amt = BigInt(row.amount_minor || 0);
                  const oldBal = BigInt(row.old_balance_minor || 0);
                  const curBal = BigInt(row.user_running_balance_minor || 0);

                  const ref = (row.reference_type || '').toLowerCase();
                  const desc = (row.description || '').toLowerCase();
                  let typeBadge = '';

                  if (ref.includes('recharge') || desc.includes('recharge debit')) {
                    typeBadge = '<span class="badge badge-primary">Buy Recharge</span>';
                  } else if (ref.includes('buyer_margin') || desc.includes('margin')) {
                    typeBadge = '<span class="badge badge-success">Buyer Margin</span>';
                  } else if (ref.includes('payout') || ref.includes('redeem')) {
                    typeBadge = '<span class="badge badge-warning text-white">Payout Redeem</span>';
                  } else if (ref.includes('refund') || row.entry_type === 'refund') {
                    typeBadge = '<span class="badge badge-info">Refund</span>';
                  } else if (ref.includes('fund') || ref.includes('topup')) {
                    typeBadge = '<span class="badge badge-success">Topup Deposit</span>';
                  } else {
                    typeBadge = `<span class="badge badge-secondary">${escapeHtml(row.reference_type || 'Adjustment')}</span>`;
                  }

                  const debitCol = isDebit
                    ? `<span class="text-danger font-weight-bold font-monospace">₹${formatRupeesFromMinor(amt)}</span>`
                    : '<span class="text-muted">-</span>';
                  const creditCol = !isDebit
                    ? `<span class="text-success font-weight-bold font-monospace">₹${formatRupeesFromMinor(amt)}</span>`
                    : '<span class="text-muted">-</span>';

                  return `
                    <tr>
                      <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
                      <td class="small font-monospace text-muted">${escapeHtml(formatDateTime(row.created_at))}</td>
                      <td class="small font-monospace font-weight-bold text-primary" title="${escapeHtml(row.idempotency_key || String(row.id))}">
                        ${escapeHtml((row.idempotency_key || String(row.id)).slice(0, 18))}...
                      </td>
                      <td>
                        <strong class="text-dark">${escapeHtml(row.user_name || row.user_username)}</strong>
                        <small class="text-muted d-block">@${escapeHtml(row.user_username)}</small>
                      </td>
                      <td class="text-center">${typeBadge}</td>
                      <td><span class="text-dark font-weight-semibold">${escapeHtml(row.description || row.reference_type || '-')}</span></td>
                      <td class="text-right font-monospace font-weight-bold text-dark">₹${formatRupeesFromMinor(oldBal)}</td>
                      <td class="text-right">${debitCol}</td>
                      <td class="text-right">${creditCol}</td>
                      <td class="text-right font-monospace font-weight-bold text-primary">₹${formatRupeesFromMinor(curBal)}</td>
                      <td class="text-center"><span class="badge badge-success">Success</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  </div>
</body>
</html>`;

    const fullHtml = useFullWidthContainers(html);
    const framedHtml = await addPanelChrome(fullHtml, {
      role: 'admin',
      admin,
      currentPath: '/admin/reports/buyer-ledger',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(framedHtml);
  }

  return { sendAdminBuyerLedgerPage };
};
