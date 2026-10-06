'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createUserReportAccountStatementPage({ db, formatMinorUnits }) {

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

  async function sendUserReportAccountStatementPage(user, response, searchParams) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');
    const today = getTodayString();

    const topFilter = String(searchParams.get('top') || '20').trim().toLowerCase(); // '20', '50', '100', 'all'
    const fromDate = String(searchParams.get('fromDate') || '').trim();
    const toDate = String(searchParams.get('toDate') || '').trim();

    let limitClause = 'LIMIT 20';
    if (topFilter === '50') limitClause = 'LIMIT 50';
    else if (topFilter === '100') limitClause = 'LIMIT 100';
    else if (topFilter === 'all') limitClause = 'LIMIT 1000';

    const conditions = [];
    if (fromDate) conditions.push(`created_at >= '${fromDate} 00:00:00+05:30'::timestamptz`);
    if (toDate) conditions.push(`created_at <= '${toDate} 23:59:59.999+05:30'::timestamptz`);
    const whereFiltered = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      WITH running AS (
        SELECT id, wallet_id, user_id, amount_minor, entry_type, reference_type,
               idempotency_key, description, created_at,
               SUM(CASE WHEN entry_type = 'debit' THEN -amount_minor ELSE amount_minor END)
                 OVER (ORDER BY created_at ASC, id ASC) AS running_balance_minor
        FROM wallet_entries
        WHERE user_id = $1
      )
      SELECT *,
        (running_balance_minor - (CASE WHEN entry_type = 'debit' THEN -amount_minor ELSE amount_minor END)) AS old_balance_minor
      FROM running
      ${whereFiltered}
      ORDER BY created_at DESC
      ${limitClause}
    `;

    const result = await db.query(query, [user.id]);

    let totalDebitMinor = 0n;
    let totalCreditMinor = 0n;

    const rowsHtml = result.rows.map((row, idx) => {
      const isDebit = row.entry_type === 'debit';
      const amount = BigInt(row.amount_minor || 0);
      const oldBal = BigInt(row.old_balance_minor || 0);
      const curBal = BigInt(row.running_balance_minor || 0);

      if (isDebit) totalDebitMinor += amount;
      else totalCreditMinor += amount;

      // Classify recharge type: Buy / Sale / Other
      const ref = (row.reference_type || '').toLowerCase();
      const desc = (row.description || '').toLowerCase();
      let typeBadge = '';

      if (ref.includes('recharge_order') || desc.includes('recharge debit')) {
        typeBadge = '<span class="badge badge-primary" style="background:#2563eb;">Buy Recharge</span>';
      } else if (ref.includes('seller_sales') || desc.includes('sale')) {
        typeBadge = '<span class="badge badge-info" style="background:#0284c7;">Sale Recharge</span>';
      } else if (ref.includes('buyer_margin') || desc.includes('margin')) {
        typeBadge = '<span class="badge badge-success" style="background:#16a34a;">Buyer Margin</span>';
      } else if (ref.includes('payout_request')) {
        typeBadge = '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;">Payout / Redeem</span>';
      } else if (ref.includes('refund')) {
        typeBadge = '<span class="badge badge-info" style="background:#06b6d4;">Refund</span>';
      } else if (ref.includes('fund') || ref.includes('topup')) {
        typeBadge = '<span class="badge badge-success" style="background:#22c55e;">Topup Deposit</span>';
      } else {
        typeBadge = `<span class="badge badge-secondary">${escapeHtml(row.reference_type || 'Other')}</span>`;
      }

      const debitCol = isDebit ? `<span class="text-danger font-weight-bold font-monospace">₹${formatMinorUnits(amount)}</span>` : '-';
      const creditCol = !isDebit ? `<span class="text-success font-weight-bold font-monospace">₹${formatMinorUnits(amount)}</span>` : '-';

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td class="font-monospace small font-weight-bold text-primary" title="${escapeHtml(row.idempotency_key || row.id)}">
            ${escapeHtml((row.idempotency_key || String(row.id)).slice(0, 16))}...
          </td>
          <td class="small text-muted font-monospace" style="white-space:nowrap;">${escapeHtml(formatDateTime(row.created_at))}</td>
          <td>
            <strong class="text-dark">${escapeHtml(row.description || row.reference_type || '-')}</strong>
          </td>
          <td class="text-center">${typeBadge}</td>
          <td class="text-right font-monospace font-weight-bold text-dark">₹${formatMinorUnits(oldBal)}</td>
          <td class="text-right">${debitCol}</td>
          <td class="text-right">${creditCol}</td>
          <td class="text-right font-monospace font-weight-bold text-primary">₹${formatMinorUnits(curBal)}</td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Account Statement - Exchange</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 12px 18px 40px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <div class="page-container">

        <div class="card shadow-sm border-0">
          <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h5 class="card-title mb-0 text-dark" style="font-size:15px;"><i class="fa fa-book mr-1"></i> Account Statement</h5>
            <form method="GET" action="/report/account-statement" class="form-inline">
              <label class="small font-weight-bold mr-1">Show Top:</label>
              <select name="top" class="form-control form-control-sm mr-2">
                <option value="20"${topFilter === '20' ? ' selected' : ''}>Top 20</option>
                <option value="50"${topFilter === '50' ? ' selected' : ''}>Top 50</option>
                <option value="100"${topFilter === '100' ? ' selected' : ''}>Top 100</option>
                <option value="all"${topFilter === 'all' ? ' selected' : ''}>All Records</option>
              </select>
              <label class="small font-weight-bold mr-1">From:</label>
              <input type="date" name="fromDate" value="${escapeHtml(fromDate)}" class="form-control form-control-sm mr-2">
              <label class="small font-weight-bold mr-1">To:</label>
              <input type="date" name="toDate" value="${escapeHtml(toDate)}" class="form-control form-control-sm mr-2">
              <button type="submit" class="btn btn-primary btn-sm mr-1"><i class="fa fa-search"></i> Search</button>
              <a href="/report/account-statement" class="btn btn-secondary btn-sm">Reset</a>
            </form>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-hover table-sm mb-0">
                <thead class="thead-light">
                  <tr>
                    <th class="text-center" style="width:40px;">Sl No</th>
                    <th>Txn ID</th>
                    <th>Date Time</th>
                    <th>Description</th>
                    <th class="text-center">Recharge Type</th>
                    <th class="text-right">Old Balance (₹)</th>
                    <th class="text-right">Debit Amount (₹)</th>
                    <th class="text-right">Credit Amount (₹)</th>
                    <th class="text-right">Current Balance (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="9" class="text-center py-4 text-muted">No account statement records found.</td></tr>'}
                </tbody>
                <tfoot>
                  <tr class="bg-light font-weight-bold">
                    <td colspan="6" class="text-right">Totals (Filtered):</td>
                    <td class="text-right text-danger font-monospace">₹${formatMinorUnits(totalDebitMinor)}</td>
                    <td class="text-right text-success font-monospace">₹${formatMinorUnits(totalCreditMinor)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
  <script src="/assets/plugins/horizontal-menu/horizontal.js"></script>
  <script src="/auth-client.js"></script>
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
    response.end(await addPanelChrome(html, { role: 'user', userId: user.id, db }));
  }

  return { sendUserReportAccountStatementPage };
};
