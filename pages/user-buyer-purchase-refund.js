'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createUserBuyerPurchaseRefundPage({ db, formatMinorUnits, decryptMobile }) {

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

  async function sendUserBuyerPurchaseRefundPage(user, response, searchParams) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');
    const today = getTodayString();

    const fromDate = String(searchParams.get('fromDate') || '').trim();
    const toDate = String(searchParams.get('toDate') || '').trim();
    const numberFilter = String(searchParams.get('number') || '').trim().replace(/\D/g, '');

    const conditions = ['r.user_id = $1', "(r.status = 'refunded' OR r.dispute_status = 'accepted')"];
    const values = [user.id];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (fromDate) {
      conditions.push(`COALESCE(r.dispute_resolved_at, r.updated_at, r.created_at) >= ${add(`${fromDate} 00:00:00+05:30`)}`);
    }
    if (toDate) {
      conditions.push(`COALESCE(r.dispute_resolved_at, r.updated_at, r.created_at) <= ${add(`${toDate} 23:59:59.999+05:30`)}`);
    }
    if (numberFilter) {
      conditions.push(`(r.mobile_number LIKE ${add(`%${numberFilter}%`)} OR r.idempotency_key LIKE ${add(`%${numberFilter}%`)})`);
    }

    const query = `
      SELECT r.id, r.user_id, r.seller_user_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.circle_name, r.amount_minor, r.margin_minor, r.cost_minor,
             r.status, r.idempotency_key, r.provider_reference, r.with_gst,
             r.dispute_status, r.dispute_reason, r.dispute_resolution_note,
             r.dispute_created_at, r.dispute_resolved_at, r.created_at, r.updated_at
      FROM recharge_orders r
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(r.dispute_resolved_at, r.updated_at) DESC
      LIMIT 100
    `;

    const result = await db.query(query, values);

    let totalRefundAmountMinor = 0n;
    let totalReversedMarginMinor = 0n;
    let totalNetRefundMinor = 0n;

    const rowsHtml = result.rows.map((row, idx) => {
      const amount = BigInt(row.amount_minor || 0);
      const margin = BigInt(row.margin_minor || 0);
      const netRefund = amount > margin ? amount - margin : amount;

      totalRefundAmountMinor += amount;
      totalReversedMarginMinor += margin;
      totalNetRefundMinor += netRefund;

      let mobile = row.mobile_number || '';
      if (!mobile && row.mobile_ciphertext && decryptMobile) {
        try { mobile = decryptMobile(row.mobile_ciphertext); } catch { mobile = '••••••••••'; }
      }

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td class="small text-muted font-monospace" style="white-space:nowrap;">
            ${escapeHtml(formatDateTime(row.dispute_resolved_at || row.updated_at))}
            <div class="small text-muted">Txn: ${escapeHtml(formatDateTime(row.created_at))}</div>
          </td>
          <td class="font-monospace small font-weight-bold text-primary" title="${escapeHtml(row.id)}">
            ${escapeHtml(row.id.slice(0, 13))}...
            <div class="small text-muted font-monospace">Ref: ${escapeHtml(row.idempotency_key || '-')}</div>
          </td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(mobile)}</td>
          <td>
            <strong class="text-dark">${escapeHtml(row.operator_name || 'Operator')}</strong>
            <div class="small text-muted">${escapeHtml(row.circle_name || 'All Circle')}</div>
          </td>
          <td class="text-right font-weight-bold text-dark font-monospace">₹${formatMinorUnits(amount)}</td>
          <td class="text-right font-weight-bold text-danger font-monospace">-₹${formatMinorUnits(margin)}</td>
          <td class="text-right font-weight-bold text-success font-monospace">+₹${formatMinorUnits(netRefund)}</td>
          <td class="text-center">
            <span class="badge badge-success" style="background:#22c55e;"><i class="fa fa-undo"></i> Refunded</span>
          </td>
          <td class="small text-muted" style="max-width:220px;">
            <div class="p-1 bg-light border rounded">
              <div><strong>Dispute:</strong> ${escapeHtml(row.dispute_reason || 'Recharge not received')}</div>
              ${row.dispute_resolution_note ? `<div class="mt-1 text-dark"><strong>Note:</strong> ${escapeHtml(row.dispute_resolution_note)}</div>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Buyer Purchase Refund - Exchange</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 12px 18px 40px; }
    .kpi-card { border-radius: 6px; padding: 12px 16px; color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.1); margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <div class="page-container">

        <div class="row">
          <div class="col-md-4">
            <div class="kpi-card" style="background: linear-gradient(135deg, #0284c7, #38bdf8);">
              <div class="small text-uppercase font-weight-bold opacity-90"><i class="fa fa-undo mr-1"></i> Total Refunded Txns</div>
              <h3 class="font-weight-bold mb-0 mt-1">${result.rowCount}</h3>
            </div>
          </div>
          <div class="col-md-4">
            <div class="kpi-card" style="background: linear-gradient(135deg, #15803d, #22c55e);">
              <div class="small text-uppercase font-weight-bold opacity-90"><i class="fa fa-wallet mr-1"></i> Total Net Refund Credited</div>
              <h3 class="font-weight-bold mb-0 mt-1 font-monospace">₹${formatMinorUnits(totalNetRefundMinor)}</h3>
            </div>
          </div>
          <div class="col-md-4">
            <div class="kpi-card" style="background: linear-gradient(135deg, #dc2626, #ef4444);">
              <div class="small text-uppercase font-weight-bold opacity-90"><i class="fa fa-minus-circle mr-1"></i> Reversed Commission</div>
              <h3 class="font-weight-bold mb-0 mt-1 font-monospace">₹${formatMinorUnits(totalReversedMarginMinor)}</h3>
            </div>
          </div>
        </div>

        <div class="card shadow-sm border-0">
          <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h5 class="card-title mb-0 text-dark" style="font-size:15px;"><i class="fa fa-history mr-1"></i> Purchase Refund History</h5>
            <form method="GET" action="/buyer/purchase-refund" class="form-inline">
              <input type="date" name="fromDate" value="${escapeHtml(fromDate)}" class="form-control form-control-sm mr-1">
              <input type="date" name="toDate" value="${escapeHtml(toDate)}" class="form-control form-control-sm mr-1">
              <input type="text" name="number" value="${escapeHtml(numberFilter)}" placeholder="Mobile / Ref ID" class="form-control form-control-sm mr-1">
              <button type="submit" class="btn btn-primary btn-sm mr-1"><i class="fa fa-search"></i> Search</button>
              <a href="/buyer/purchase-refund" class="btn btn-secondary btn-sm">Reset</a>
            </form>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-hover table-sm mb-0">
                <thead class="thead-light">
                  <tr>
                    <th class="text-center" style="width:40px;">#</th>
                    <th>Refund Date</th>
                    <th>Txn ID / Ref</th>
                    <th>Mobile</th>
                    <th>Operator</th>
                    <th class="text-right">Recharge Amt (₹)</th>
                    <th class="text-right">Reversed Comm. (₹)</th>
                    <th class="text-right">Net Refunded (₹)</th>
                    <th class="text-center">Status</th>
                    <th>Dispute / Seller Remark</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="10" class="text-center py-4 text-muted">No refunded purchase records found.</td></tr>'}
                </tbody>
                <tfoot>
                  <tr class="bg-light font-weight-bold">
                    <td colspan="5" class="text-right">Totals:</td>
                    <td class="text-right text-dark font-monospace">₹${formatMinorUnits(totalRefundAmountMinor)}</td>
                    <td class="text-right text-danger font-monospace">-₹${formatMinorUnits(totalReversedMarginMinor)}</td>
                    <td class="text-right text-success font-monospace">+₹${formatMinorUnits(totalNetRefundMinor)}</td>
                    <td colspan="2"></td>
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

  return { sendUserBuyerPurchaseRefundPage };
};
