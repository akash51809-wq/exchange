'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createUserFundStatementPage({ db, formatMinorUnits }) {

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

  async function sendUserFundStatementPage(user, response, searchParams) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');
    const today = getTodayString();

    const fromDate = String(searchParams.get('fromDate') || '').trim();
    const toDate = String(searchParams.get('toDate') || '').trim();
    const typeFilter = String(searchParams.get('type') || '').trim().toLowerCase(); // 'all', 'credit', 'debit'

    // Fetch current wallet balance
    const walletRes = await db.query(
      "SELECT id, balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR'",
      [user.id],
    );
    const currentBalanceMinor = BigInt(walletRes.rows[0]?.balance_minor || 0);

    // Query all wallet entries for running balance calculation
    const query = `
      WITH running AS (
        SELECT id, wallet_id, user_id, amount_minor, entry_type, reference_type,
               idempotency_key, description, created_at,
               SUM(CASE WHEN entry_type = 'debit' THEN -amount_minor ELSE amount_minor END)
                 OVER (ORDER BY created_at ASC, id ASC) AS running_balance_minor
        FROM wallet_entries
        WHERE user_id = $1
      )
      SELECT *
      FROM running
      WHERE 1=1
      ${fromDate ? `AND created_at >= '${fromDate} 00:00:00+05:30'::timestamptz` : ''}
      ${toDate ? `AND created_at <= '${toDate} 23:59:59.999+05:30'::timestamptz` : ''}
      ${typeFilter === 'credit' ? `AND entry_type IN ('credit', 'refund')` : ''}
      ${typeFilter === 'debit' ? `AND entry_type = 'debit'` : ''}
      ORDER BY created_at DESC
      LIMIT 250
    `;

    const result = await db.query(query, [user.id]);

    let totalCreditMinor = 0n;
    let totalDebitMinor = 0n;

    const rowsHtml = result.rows.map((row, idx) => {
      const isDebit = row.entry_type === 'debit';
      const amount = BigInt(row.amount_minor || 0);
      if (isDebit) {
        totalDebitMinor += amount;
      } else {
        totalCreditMinor += amount;
      }

      let typeBadge = '';
      if (row.entry_type === 'credit') {
        typeBadge = '<span class="badge badge-success" style="background:#22c55e;">Credit</span>';
      } else if (row.entry_type === 'debit') {
        typeBadge = '<span class="badge badge-danger" style="background:#ef4444;">Debit</span>';
      } else if (row.entry_type === 'refund') {
        typeBadge = '<span class="badge badge-info" style="background:#0ea5e9;">Refund</span>';
      } else {
        typeBadge = `<span class="badge badge-secondary">${escapeHtml(row.entry_type)}</span>`;
      }

      const debitCol = isDebit ? `<span class="text-danger font-weight-bold font-monospace">₹${formatMinorUnits(amount)}</span>` : '-';
      const creditCol = !isDebit ? `<span class="text-success font-weight-bold font-monospace">₹${formatMinorUnits(amount)}</span>` : '-';
      const balanceAfter = `₹${formatMinorUnits(row.running_balance_minor || 0)}`;

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td class="small text-muted font-monospace" style="white-space:nowrap;">${escapeHtml(formatDateTime(row.created_at))}</td>
          <td class="font-monospace small font-weight-bold text-primary" title="${escapeHtml(row.idempotency_key || row.id)}">
            ${escapeHtml((row.idempotency_key || String(row.id)).slice(0, 16))}...
          </td>
          <td>
            <strong class="text-dark">${escapeHtml(row.description || row.reference_type || 'Wallet Entry')}</strong>
            <div class="small text-muted font-monospace">${escapeHtml(row.reference_type || '')}</div>
          </td>
          <td class="text-center">${typeBadge}</td>
          <td class="text-right">${debitCol}</td>
          <td class="text-right">${creditCol}</td>
          <td class="text-right font-weight-bold text-dark font-monospace">${balanceAfter}</td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fund Dr/Cr Statement - Exchange</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 12px 18px 40px; }
    .kpi-card {
      border-radius: 6px; padding: 12px 16px; color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.1); margin-bottom: 12px;
    }
    .kpi-title { font-size: 11px; text-transform: uppercase; font-weight: 700; opacity: 0.9; margin: 0; letter-spacing: 0.5px; }
    .kpi-val { font-size: 22px; font-weight: 800; margin: 2px 0 0; }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <div class="page-container">

        <div class="row">
          <div class="col-md-4">
            <div class="kpi-card" style="background: linear-gradient(135deg, #16a34a, #22c55e);">
              <div class="kpi-title"><i class="fa fa-arrow-down mr-1"></i> Total Deposit / Credit (Filtered)</div>
              <div class="kpi-val font-monospace">₹${formatMinorUnits(totalCreditMinor)}</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="kpi-card" style="background: linear-gradient(135deg, #dc2626, #ef4444);">
              <div class="kpi-title"><i class="fa fa-arrow-up mr-1"></i> Total Withdrawal / Debit (Filtered)</div>
              <div class="kpi-val font-monospace">₹${formatMinorUnits(totalDebitMinor)}</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="kpi-card" style="background: linear-gradient(135deg, #1e3a8a, #0284c7);">
              <div class="kpi-title"><i class="fa fa-wallet mr-1"></i> Current Wallet Balance</div>
              <div class="kpi-val font-monospace" style="color:#ffc928;">₹${formatMinorUnits(currentBalanceMinor)}</div>
            </div>
          </div>
        </div>

        <div class="card shadow-sm border-0">
          <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h5 class="card-title mb-0 text-dark" style="font-size:15px;"><i class="fa fa-list-alt mr-1"></i> Fund Dr/Cr Statement Report</h5>
            <form method="GET" action="/fund/statement" class="form-inline">
              <label class="small font-weight-bold mr-1">From:</label>
              <input type="date" name="fromDate" value="${escapeHtml(fromDate)}" class="form-control form-control-sm mr-2">
              <label class="small font-weight-bold mr-1">To:</label>
              <input type="date" name="toDate" value="${escapeHtml(toDate)}" class="form-control form-control-sm mr-2">
              <label class="small font-weight-bold mr-1">Type:</label>
              <select name="type" class="form-control form-control-sm mr-2">
                <option value="">All (Dr & Cr)</option>
                <option value="credit"${typeFilter === 'credit' ? ' selected' : ''}>Credit / Deposit Only</option>
                <option value="debit"${typeFilter === 'debit' ? ' selected' : ''}>Debit / Withdrawal Only</option>
              </select>
              <button type="submit" class="btn btn-primary btn-sm mr-1"><i class="fa fa-search"></i> Search</button>
              <a href="/fund/statement" class="btn btn-secondary btn-sm">Reset</a>
            </form>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-hover table-sm mb-0">
                <thead class="thead-light">
                  <tr>
                    <th class="text-center" style="width:40px;">#</th>
                    <th>Date & Time</th>
                    <th>Txn ID / Ref</th>
                    <th>Description</th>
                    <th class="text-center">Type</th>
                    <th class="text-right">Debit Amount (₹)</th>
                    <th class="text-right">Credit Amount (₹)</th>
                    <th class="text-right">Balance After (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="8" class="text-center py-4 text-muted">No fund statement records found for the selected filter.</td></tr>'}
                </tbody>
                <tfoot>
                  <tr class="bg-light font-weight-bold">
                    <td colspan="5" class="text-right">Filtered Totals:</td>
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

  return { sendUserFundStatementPage };
};
