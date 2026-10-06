'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminInvoicePage({ db, formatMinorUnits }) {

  function getLastMonthYear() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function getMonthRange(monthYearStr) {
    const [yStr, mStr] = monthYearStr.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const start = `${year}-${String(month).padStart(2, '0')}-01 00:00:00+05:30`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00+05:30`;
    return { start, end };
  }

  function getMonthName(monthYearStr) {
    const [yStr, mStr] = monthYearStr.split('-');
    const date = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1);
    return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  }

  async function sendAdminInvoicePage(admin, response, searchParams) {
    const selectedMonth = String(searchParams.get('month') || getLastMonthYear()).trim();
    const activeTab = String(searchParams.get('tab') || 'seller').trim().toLowerCase(); // 'seller' or 'buyer'
    const { start, end } = getMonthRange(selectedMonth);
    const monthLabel = getMonthName(selectedMonth);

    // Month options
    const monthOptions = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const lbl = dt.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      monthOptions.push(`<option value="${val}"${val === selectedMonth ? ' selected' : ''}>${lbl}</option>`);
    }

    // 1. Fetch Buyer invoices: Total topup done by users in this month
    const buyersRes = await db.query(
      `SELECT u.id, u.username, u.name, u.business_name,
              COALESCE(SUM(w.amount_minor), 0) AS total_topup_minor,
              COUNT(w.id) AS topup_count
       FROM users u
       LEFT JOIN wallet_fund_requests w
         ON w.user_id = u.id AND w.status = 'approved'
         AND w.created_at >= $1 AND w.created_at < $2
       WHERE u.role = 'user' AND u.deleted_at IS NULL
       GROUP BY u.id, u.username, u.name, u.business_name
       HAVING COALESCE(SUM(w.amount_minor), 0) > 0
       ORDER BY total_topup_minor DESC`,
      [start, end],
    );

    // 2. Fetch Seller invoices: Total redeemed by users in this month + check upload status
    const sellersRes = await db.query(
      `SELECT u.id, u.username, u.name, u.business_name,
              COALESCE(SUM(p.amount_minor), 0) AS total_redeem_minor,
              COUNT(p.id) AS payout_count,
              inv.id AS invoice_id, inv.file_name, inv.status AS invoice_status, inv.created_at AS uploaded_at
       FROM users u
       LEFT JOIN payout_requests p
         ON p.user_id = u.id AND p.status = 'success'
         AND p.created_at >= $1 AND p.created_at < $2
       LEFT JOIN seller_gst_invoices inv
         ON inv.user_id = u.id AND inv.month_year = $3
       WHERE u.role = 'user' AND u.deleted_at IS NULL
       GROUP BY u.id, u.username, u.name, u.business_name, inv.id, inv.file_name, inv.status, inv.created_at
       HAVING COALESCE(SUM(p.amount_minor), 0) > 0
       ORDER BY total_redeem_minor DESC`,
      [start, end, selectedMonth],
    );

    // Buyer rows
    const buyerRowsHtml = buyersRes.rows.map((row, idx) => {
      const amt = BigInt(row.total_topup_minor || 0);
      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <strong class="text-dark">${escapeHtml(row.name)}</strong>
            <div class="small text-muted font-monospace">${escapeHtml(row.username)}</div>
          </td>
          <td>${escapeHtml(row.business_name || row.name)}</td>
          <td class="text-center">${escapeHtml(monthLabel)}</td>
          <td class="text-center font-monospace">${row.topup_count}</td>
          <td class="text-right font-weight-bold text-dark font-monospace">₹${formatMinorUnits(amt)}</td>
          <td class="text-center">
            <span class="badge badge-success" style="background:#22c55e;">Generated</span>
          </td>
        </tr>
      `;
    }).join('');

    // Seller rows
    const sellerRowsHtml = sellersRes.rows.map((row, idx) => {
      const amt = BigInt(row.total_redeem_minor || 0);
      const isUploaded = !!row.invoice_id;

      let statusBadge = '';
      if (isUploaded) {
        statusBadge = `
          <span class="badge badge-success px-2 py-1" style="background:#22c55e;font-size:12px;">
            <i class="fa fa-check-circle"></i> Uploaded
          </span>
          <div class="mt-1">
            <a href="/api/admin/invoices/download?id=${escapeHtml(row.invoice_id)}" target="_blank" class="small text-primary font-weight-bold">
              <i class="fa fa-download"></i> View Invoice
            </a>
          </div>
        `;
      } else {
        statusBadge = `
          <span class="badge badge-danger px-2 py-1" style="background:#ef4444;font-size:12px;">
            <i class="fa fa-times-circle"></i> Not Uploaded
          </span>
        `;
      }

      return `
        <tr style="${isUploaded ? 'background-color:#f0fdf4;' : 'background-color:#fef2f2;'}">
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <strong class="text-dark">${escapeHtml(row.name)}</strong>
            <div class="small text-muted font-monospace">${escapeHtml(row.username)}</div>
          </td>
          <td>${escapeHtml(row.business_name || row.name)}</td>
          <td class="text-center">${escapeHtml(monthLabel)}</td>
          <td class="text-center font-monospace">${row.payout_count}</td>
          <td class="text-right font-weight-bold text-dark font-monospace" style="font-size:14px;">₹${formatMinorUnits(amt)}</td>
          <td class="text-center">${statusBadge}</td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>User GST Invoices - Exchange Admin</title>
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
      <div class="sticky">
        <div class="horizontal-main hor-menu clearfix">
          <div class="horizontal-mainwrapper container-fluid px-2 clearfix">
            <nav class="horizontalMenu clearfix">
              <ul class="horizontalMenu-list">
                <li><a href="/admin/">Dashboard</a></li>
                <li><a href="#">User <i class="fa fa-angle-down"></i></a>
                  <ul class="sub-menu">
                    <li><a href="/admin/users/list">List User</a></li>
                  </ul>
                </li>
                <li><a href="#">Payment <i class="fa fa-angle-down"></i></a>
                  <ul class="sub-menu">
                    <li><a href="/admin/payment/fund-request">Fund Request</a></li>
                    <li><a href="/admin/payment/bank-approval">Bank Approvals</a></li>
                    <li><a href="/admin/payment/payout-request">Payout Requests</a></li>
                    <li><a href="/admin/payment/invoice">Invoice</a></li>
                    <li><a href="/admin/payment/bank-list">Admin Bank List</a></li>
                    <li><a href="/admin/payment/disputes">Disputes</a></li>
                  </ul>
                </li>
                <li><a href="/admin/seller-api/requests">Request API Approval</a></li>
                <li><a href="#">Settings <i class="fa fa-angle-down"></i></a>
                  <ul class="sub-menu">
                    <li><a href="/admin/settings/create-operator">Create Operator</a></li>
                    <li><a href="/admin/settings/show-operator">Show Operator</a></li>
                    <li><a href="/admin/settings/service-settings">Service Settings</a></li>
                  </ul>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </div>

      <div class="page-container">
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h4 class="page-title mb-0 text-dark"><i class="fa fa-file-text mr-2"></i> User GST Invoices Management</h4>
            <div class="small text-muted">Track monthly Buyer GST invoices and Seller GST invoice uploads</div>
          </div>
          <form method="GET" action="/admin/payment/invoice" class="form-inline">
            <input type="hidden" name="tab" value="${escapeHtml(activeTab)}">
            <label class="small font-weight-bold mr-1">Billing Month:</label>
            <select name="month" class="form-control form-control-sm mr-2" onchange="this.form.submit()">
              ${monthOptions.join('')}
            </select>
            <a href="/admin/payment/invoice" class="btn btn-secondary btn-sm">Reset</a>
          </form>
        </div>

        <!-- Tabs -->
        <ul class="nav nav-tabs border-bottom mb-3">
          <li class="nav-item">
            <a class="nav-link font-weight-bold ${activeTab === 'seller' ? 'active text-primary' : 'text-dark'}" href="/admin/payment/invoice?month=${escapeHtml(selectedMonth)}&tab=seller">
              <i class="fa fa-upload mr-1"></i> Seller GST Invoices (${sellersRes.rowCount})
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link font-weight-bold ${activeTab === 'buyer' ? 'active text-primary' : 'text-dark'}" href="/admin/payment/invoice?month=${escapeHtml(selectedMonth)}&tab=buyer">
              <i class="fa fa-shopping-cart mr-1"></i> Buyer GST Invoices (${buyersRes.rowCount})
            </a>
          </li>
        </ul>

        ${activeTab === 'seller' ? `
          <div class="card shadow-sm border-0">
            <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center">
              <h5 class="card-title mb-0 text-dark" style="font-size:15px;">
                <i class="fa fa-university mr-1"></i> Seller Redeem GST Invoices (${monthLabel})
              </h5>
              <div class="small">
                <span class="badge badge-success mr-2" style="background:#22c55e;">Green = Invoice Uploaded</span>
                <span class="badge badge-danger" style="background:#ef4444;">Red = Not Uploaded</span>
              </div>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-bordered table-sm mb-0">
                  <thead class="thead-light">
                    <tr>
                      <th class="text-center" style="width:40px;">#</th>
                      <th>Seller User</th>
                      <th>Business Name</th>
                      <th class="text-center">Month</th>
                      <th class="text-center">Redeem Count</th>
                      <th class="text-right">Redeem Amount (₹)</th>
                      <th class="text-center">Upload Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sellerRowsHtml || '<tr><td colspan="7" class="text-center py-4 text-muted">No seller redeem records found for ' + escapeHtml(monthLabel) + '.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ` : `
          <div class="card shadow-sm border-0">
            <div class="card-header bg-light py-2">
              <h5 class="card-title mb-0 text-dark" style="font-size:15px;">
                <i class="fa fa-shopping-cart mr-1"></i> Buyer Wallet Topup Invoices (${monthLabel})
              </h5>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-bordered table-hover table-sm mb-0">
                  <thead class="thead-light">
                    <tr>
                      <th class="text-center" style="width:40px;">#</th>
                      <th>Buyer User</th>
                      <th>Business Name</th>
                      <th class="text-center">Month</th>
                      <th class="text-center">Topups Count</th>
                      <th class="text-right">Topup Amount (₹)</th>
                      <th class="text-center">Invoice Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${buyerRowsHtml || '<tr><td colspan="7" class="text-center py-4 text-muted">No buyer topup records found for ' + escapeHtml(monthLabel) + '.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `}

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
    response.end(await addPanelChrome(html, { role: 'admin', userId: admin.id, db }));
  }

  return { sendAdminInvoicePage };
};
