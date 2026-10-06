'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createUserSellerOperatorWiseSalePage({ db, formatMinorUnits }) {

  function getTodayString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async function sendUserSellerOperatorWiseSalePage(user, response, searchParams) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');
    const today = getTodayString();

    const fromDate = String(searchParams.get('fromDate') || today).trim();
    const toDate = String(searchParams.get('toDate') || today).trim();

    const conditions = ['r.seller_user_id = $1', "r.status = 'successful'"];
    const values = [user.id];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (fromDate) {
      conditions.push(`r.created_at >= ${add(`${fromDate} 00:00:00+05:30`)}`);
    }
    if (toDate) {
      conditions.push(`r.created_at <= ${add(`${toDate} 23:59:59.999+05:30`)}`);
    }

    const query = `
      SELECT
        COALESCE(o.operator_name, r.operator_name, 'Unknown Operator') AS op_name,
        COUNT(r.id) AS txn_count,
        COALESCE(SUM(r.amount_minor), 0) AS total_amount_minor,
        COALESCE(SUM(r.seller_margin_minor), 0) AS total_discount_minor
      FROM recharge_orders r
      LEFT JOIN operator_definitions o ON o.id = r.operator_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY op_name
      ORDER BY op_name ASC
    `;

    const result = await db.query(query, values);

    let grandTotalAmountMinor = 0n;
    let grandTotalDiscountMinor = 0n;
    let grandTotalCount = 0;

    const rowsHtml = result.rows.map((row, idx) => {
      const amt = BigInt(row.total_amount_minor || 0);
      const disc = BigInt(row.total_discount_minor || 0);
      const count = parseInt(row.txn_count || 0, 10);

      grandTotalAmountMinor += amt;
      grandTotalDiscountMinor += disc;
      grandTotalCount += count;

      const avgDiscountPercent = amt > 0n
        ? (Number(disc * 10000n / amt) / 100).toFixed(2) + '%'
        : '0.00%';

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td><strong class="text-dark">${escapeHtml(row.op_name)}</strong></td>
          <td class="text-center font-monospace font-weight-bold">${count}</td>
          <td class="text-right font-weight-bold text-dark font-monospace">₹${formatMinorUnits(amt)}</td>
          <td class="text-right font-weight-bold text-danger font-monospace">₹${formatMinorUnits(disc)}</td>
          <td class="text-right font-weight-bold text-primary font-monospace">${avgDiscountPercent}</td>
        </tr>
      `;
    }).join('');

    const grandAvgDiscount = grandTotalAmountMinor > 0n
      ? (Number(grandTotalDiscountMinor * 10000n / grandTotalAmountMinor) / 100).toFixed(2) + '%'
      : '0.00%';

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Operator-wise Sale - Exchange</title>
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
            <div class="kpi-card" style="background: linear-gradient(135deg, #1e3a8a, #0284c7);">
              <div class="small text-uppercase font-weight-bold opacity-90"><i class="fa fa-list mr-1"></i> Total Sales Orders</div>
              <h3 class="font-weight-bold mb-0 mt-1">${grandTotalCount}</h3>
            </div>
          </div>
          <div class="col-md-4">
            <div class="kpi-card" style="background: linear-gradient(135deg, #15803d, #22c55e);">
              <div class="small text-uppercase font-weight-bold opacity-90"><i class="fa fa-line-chart mr-1"></i> Total Sale Volume</div>
              <h3 class="font-weight-bold mb-0 mt-1 font-monospace">₹${formatMinorUnits(grandTotalAmountMinor)}</h3>
            </div>
          </div>
          <div class="col-md-4">
            <div class="kpi-card" style="background: linear-gradient(135deg, #b91c1c, #ef4444);">
              <div class="small text-uppercase font-weight-bold opacity-90"><i class="fa fa-tags mr-1"></i> Total Discount Given</div>
              <h3 class="font-weight-bold mb-0 mt-1 font-monospace">₹${formatMinorUnits(grandTotalDiscountMinor)}</h3>
            </div>
          </div>
        </div>

        <div class="card shadow-sm border-0">
          <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h5 class="card-title mb-0 text-dark" style="font-size:15px;"><i class="fa fa-bar-chart mr-1"></i> Operator-wise Sale Report</h5>
            <form method="GET" action="/seller/operator-wise-sale" class="form-inline">
              <label class="small font-weight-bold mr-1">From:</label>
              <input type="date" name="fromDate" value="${escapeHtml(fromDate)}" class="form-control form-control-sm mr-2">
              <label class="small font-weight-bold mr-1">To:</label>
              <input type="date" name="toDate" value="${escapeHtml(toDate)}" class="form-control form-control-sm mr-2">
              <button type="submit" class="btn btn-primary btn-sm mr-1"><i class="fa fa-search"></i> Search</button>
              <a href="/seller/operator-wise-sale" class="btn btn-secondary btn-sm">Reset</a>
            </form>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-hover table-sm mb-0">
                <thead class="thead-light">
                  <tr>
                    <th class="text-center" style="width:40px;">#</th>
                    <th>Operator Name</th>
                    <th class="text-center">Sales Count</th>
                    <th class="text-right">Recharge Amount (₹)</th>
                    <th class="text-right">Discount in Rupees (₹)</th>
                    <th class="text-right">Average Discount (%)</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="6" class="text-center py-4 text-muted">No sales records found for selected dates.</td></tr>'}
                </tbody>
                <tfoot>
                  <tr class="bg-light font-weight-bold">
                    <td colspan="2" class="text-right">Grand Total:</td>
                    <td class="text-center font-monospace">${grandTotalCount}</td>
                    <td class="text-right text-dark font-monospace">₹${formatMinorUnits(grandTotalAmountMinor)}</td>
                    <td class="text-right text-danger font-monospace">₹${formatMinorUnits(grandTotalDiscountMinor)}</td>
                    <td class="text-right text-primary font-monospace">${grandAvgDiscount}</td>
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

  return { sendUserSellerOperatorWiseSalePage };
};
