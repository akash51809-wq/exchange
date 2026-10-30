'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const {
  MONTHS,
  getLastMonthYear,
  getMonthRange,
  getMonthName,
  calculateGstAmounts,
  syncMonthlyInvoices,
  formatDisplayDate,
} = require('../lib/invoice-utils');

module.exports = function createUserInvoicePages({ db, formatMinorUnits }) {

  async function getAdminState() {
    try {
      const res = await db.query("SELECT state FROM users WHERE role = 'admin' AND state IS NOT NULL AND state <> '' LIMIT 1");
      if (res.rows.length && res.rows[0].state) {
        return res.rows[0].state;
      }
    } catch (_) {}
    return 'Uttar Pradesh';
  }

  async function sendUserInvoicePage(user, type, response, searchParams) {
    const defaultLast = getLastMonthYear();
    const selectedYear = String(searchParams.get('year') || defaultLast.year).trim();
    const selectedMonth = String(searchParams.get('month') || defaultLast.month).trim().padStart(2, '0');
    const selectedMonthYear = `${selectedYear}-${selectedMonth}`;
    const statusFilter = String(searchParams.get('status') || 'all').trim().toLowerCase();

    const adminState = await getAdminState();

    // Auto-sync monthly records for this selected year & month
    try {
      await syncMonthlyInvoices(db, selectedYear, selectedMonth, adminState);
    } catch (err) {
      console.warn('[User Invoice Sync Error]:', err.message);
    }

    const monthLabel = `${getMonthName(selectedMonth)} ${selectedYear}`;

    // Available Years
    const currentYear = new Date().getFullYear();
    const yearOptions = [];
    for (let y = currentYear; y >= currentYear - 4; y--) {
      yearOptions.push(`<option value="${y}"${String(y) === selectedYear ? ' selected' : ''}>${y}</option>`);
    }

    // Available Months
    const monthOptions = MONTHS.map((m) =>
      `<option value="${m.value}"${m.value === selectedMonth ? ' selected' : ''}>${m.name}</option>`
    );

    // ==========================================
    // 1. BUYER GST INVOICE
    // ==========================================
    if (type === 'buyer-gst' || type === 'buyer') {
      const invoiceRes = await db.query(
        `SELECT inv.id, inv.user_id, inv.month_year, inv.topup_amount_minor,
                inv.taxable_amount_minor, inv.cgst_amount_minor, inv.sgst_amount_minor, inv.igst_amount_minor,
                inv.status, inv.created_at, inv.updated_at,
                u.name AS user_name, u.username, u.business_name, u.state AS user_state, u.address,
                COALESCE(u.gst_number, k.gst_number, '-') AS gst_number
         FROM buyer_gst_invoices inv
         JOIN users u ON u.id = inv.user_id
         LEFT JOIN user_kyc k ON k.user_id = u.id
         WHERE inv.user_id = $1 AND inv.month_year = $2`,
        [user.id, selectedMonthYear],
      );

      const invRow = invoiceRes.rows[0] || null;
      const isApproved = invRow && invRow.status === 'approved';

      // All invoices history for this buyer
      const historyRes = await db.query(
        `SELECT inv.id, inv.month_year, inv.topup_amount_minor,
                inv.taxable_amount_minor, inv.cgst_amount_minor, inv.sgst_amount_minor, inv.igst_amount_minor,
                inv.status, inv.created_at, inv.updated_at,
                u.name AS user_name, u.username, u.business_name, u.state AS user_state,
                COALESCE(u.gst_number, k.gst_number, '-') AS gst_number
         FROM buyer_gst_invoices inv
         JOIN users u ON u.id = inv.user_id
         LEFT JOIN user_kyc k ON k.user_id = u.id
         WHERE inv.user_id = $1
         ORDER BY inv.month_year DESC`,
        [user.id],
      );

      const historyRowsHtml = historyRes.rows.map((row) => {
        const [y, m] = row.month_year.split('-');
        const mName = getMonthName(m);
        const approved = row.status === 'approved';
        const invAmt = BigInt(row.topup_amount_minor || 0);
        const taxAmt = BigInt(row.taxable_amount_minor || 0);
        const cgstAmt = BigInt(row.cgst_amount_minor || 0);
        const sgstAmt = BigInt(row.sgst_amount_minor || 0);
        const igstAmt = BigInt(row.igst_amount_minor || 0);

        const statusBadge = approved
          ? `<span class="badge" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;font-weight:700;padding:6px 14px;border-radius:20px;font-size:12px;"><i class="fa fa-check-circle mr-1"></i> Approved</span>`
          : `<span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-weight:700;padding:6px 14px;border-radius:20px;font-size:12px;"><i class="fa fa-clock-o mr-1"></i> Pending Approval</span>`;

        let actionHtml = '';
        if (approved) {
          actionHtml = `
            <a href="/invoice/buyer-gst-invoice?year=${escapeHtml(y)}&month=${escapeHtml(m)}" class="btn btn-sm btn-outline-primary font-weight-bold">
              <i class="fa fa-file-text-o mr-1"></i> View Invoice
            </a>
          `;
        } else {
          actionHtml = `<span class="text-muted small font-italic"><i class="fa fa-lock mr-1"></i> Available After Approval</span>`;
        }

        return `
          <tr>
            <td class="text-center font-monospace font-weight-bold">${escapeHtml(y)}</td>
            <td class="text-center font-weight-bold text-dark">${escapeHtml(mName)}</td>
            <td>
              <strong class="text-dark">${escapeHtml(row.user_name || user.name)}</strong>
              <div class="small text-muted font-monospace">${escapeHtml(row.username || user.username)}</div>
            </td>
            <td class="font-monospace font-weight-bold">${escapeHtml(row.gst_number || '-')}</td>
            <td class="text-right font-monospace text-dark font-weight-bold">${approved ? `₹${formatMinorUnits(taxAmt)}` : '-'}</td>
            <td class="text-right font-monospace text-muted">${approved ? `₹${formatMinorUnits(cgstAmt)}` : '-'}</td>
            <td class="text-right font-monospace text-muted">${approved ? `₹${formatMinorUnits(sgstAmt)}` : '-'}</td>
            <td class="text-right font-monospace text-muted">${approved ? `₹${formatMinorUnits(igstAmt)}` : '-'}</td>
            <td class="text-right font-monospace font-weight-bold text-primary">${approved ? `₹${formatMinorUnits(invAmt)}` : `₹${formatMinorUnits(invAmt)}`}</td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-center">${actionHtml}</td>
          </tr>
        `;
      }).join('');

      let invoiceCardHtml = '';
      if (invRow && isApproved) {
        const invAmt = BigInt(invRow.topup_amount_minor || 0);
        const taxAmt = BigInt(invRow.taxable_amount_minor || 0);
        const cgstAmt = BigInt(invRow.cgst_amount_minor || 0);
        const sgstAmt = BigInt(invRow.sgst_amount_minor || 0);
        const igstAmt = BigInt(invRow.igst_amount_minor || 0);
        const invoiceNo = `GST-B-${user.username.toUpperCase()}-${selectedYear}${selectedMonth}`;

        invoiceCardHtml = `
          <div class="invoice-box mb-4">
            <div class="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3 flex-wrap gap-2">
              <div>
                <h3 class="font-weight-bold text-primary mb-1">TAX INVOICE</h3>
                <div class="small text-muted font-monospace">Invoice No: <strong>${escapeHtml(invoiceNo)}</strong></div>
                <div class="small text-muted">Billing Month: <strong>${escapeHtml(monthLabel)}</strong></div>
              </div>
              <div class="text-right">
                <h4 class="font-weight-bold text-dark mb-0">EXCHANGE PLATFORM</h4>
                <div class="small text-muted">EASY RECHARGE SOLUTION</div>
                <div class="small text-muted font-monospace">GSTIN: 09AAACS1234F1Z5</div>
                <div class="small text-muted">Prayagraj, Uttar Pradesh</div>
              </div>
            </div>

            <div class="row mb-4">
              <div class="col-sm-6">
                <div class="text-uppercase small font-weight-bold text-muted mb-1">Billed To (Buyer):</div>
                <h5 class="font-weight-bold text-dark mb-1">${escapeHtml(user.name)}</h5>
                <div class="small text-muted">User ID: <span class="font-monospace font-weight-bold">${escapeHtml(user.username)}</span></div>
                ${user.business_name ? `<div class="small text-muted">Firm: ${escapeHtml(user.business_name)}</div>` : ''}
                <div class="small text-muted font-monospace">GSTIN: <strong>${escapeHtml(invRow.gst_number || '-')}</strong></div>
                <div class="small text-muted">${escapeHtml(user.address || 'India')}</div>
              </div>
              <div class="col-sm-6 text-sm-right mt-3 mt-sm-0">
                <div class="text-uppercase small font-weight-bold text-muted mb-1">Invoice Details:</div>
                <div class="small text-muted">Place of Supply: <strong>${escapeHtml(user.state || 'Uttar Pradesh')}</strong></div>
                <div class="small text-muted">Status: <strong class="text-success"><i class="fa fa-check-circle mr-1"></i> Approved</strong></div>
                <div class="small text-muted">Approved Date: <strong>${escapeHtml(formatDisplayDate(invRow.approved_at || invRow.updated_at))}</strong></div>
              </div>
            </div>

            <div class="table-responsive mb-4">
              <table class="table table-bordered table-sm mb-0">
                <thead class="thead-light">
                  <tr>
                    <th class="text-center" style="width:40px;">#</th>
                    <th>Description of Service</th>
                    <th class="text-center">SAC Code</th>
                    <th class="text-right">Taxable Value (₹)</th>
                    <th class="text-right">CGST (9%)</th>
                    <th class="text-right">SGST (9%)</th>
                    <th class="text-right">IGST (18%)</th>
                    <th class="text-right">Total Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="text-center font-monospace">1</td>
                    <td>
                      <strong>Prepaid Wallet Topup / Recharge Stock Advance</strong>
                      <div class="small text-muted">Billing Period: ${escapeHtml(monthLabel)}</div>
                    </td>
                    <td class="text-center font-monospace">998599</td>
                    <td class="text-right font-monospace">₹${formatMinorUnits(taxAmt)}</td>
                    <td class="text-right font-monospace">₹${formatMinorUnits(cgstAmt)}</td>
                    <td class="text-right font-monospace">₹${formatMinorUnits(sgstAmt)}</td>
                    <td class="text-right font-monospace">₹${formatMinorUnits(igstAmt)}</td>
                    <td class="text-right font-weight-bold font-monospace text-primary">₹${formatMinorUnits(invAmt)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="font-weight-bold bg-light">
                    <td colspan="7" class="text-right">Grand Total (Inclusive of GST):</td>
                    <td class="text-right text-primary font-monospace" style="font-size:16px;">₹${formatMinorUnits(invAmt)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div class="border-top pt-3 text-muted small text-center">
              This is a computer-generated tax invoice and does not require a physical signature.
            </div>
          </div>
        `;
      } else {
        invoiceCardHtml = `
          <div class="alert alert-warning border p-4 mb-4" style="background:#fffbeb;border-color:#fef3c7;">
            <div class="d-flex align-items-center">
              <i class="fa fa-clock-o text-warning mr-3" style="font-size:28px;"></i>
              <div>
                <h5 class="font-weight-bold mb-1" style="color:#92400e;">Invoice Pending Admin Approval</h5>
                <p class="mb-0 small text-muted">
                  The Buyer GST Tax Invoice for <strong>${escapeHtml(monthLabel)}</strong> is currently pending confirmation from Admin.
                  Once verified and approved by Admin, your official invoice will be generated and made available here automatically for download.
                </p>
              </div>
            </div>
          </div>
        `;
      }

      const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Buyer GST Invoice - Exchange</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 16px 20px 50px; }
    .filter-card { background: #ffffff; border-radius: 10px; padding: 16px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; margin-bottom: 20px; }
    .invoice-box { background: #ffffff; border-radius: 10px; padding: 25px 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .table-inv thead th { background: #f8fafc; color: #475569; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; padding: 10px 12px; white-space: nowrap; }
    .table-inv tbody td { vertical-align: middle; padding: 12px; font-size: 13px; }
    @media print {
      body * { visibility: hidden; }
      .invoice-box, .invoice-box * { visibility: visible; }
      .invoice-box { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: none; padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      <div class="no-print">${renderUserNavigation('/invoice/buyer-gst-invoice')}</div>

      <div class="page-container">
        <!-- Top Title Bar -->
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 no-print">
          <div>
            <h4 class="page-title mb-1 text-dark font-weight-bold">
              <i class="fa fa-shopping-cart mr-2 text-primary"></i> Buyer GST Invoices
            </h4>
            <div class="text-muted small">View and download your monthly wallet topup GST Tax Invoices</div>
          </div>
          ${invRow && isApproved ? `
            <button type="button" class="btn btn-primary btn-sm font-weight-bold px-3" onclick="window.print()">
              <i class="fa fa-print mr-1"></i> Print / Download Invoice
            </button>
          ` : ''}
        </div>

        <!-- Filter Bar -->
        <div class="filter-card no-print">
          <form method="GET" action="/invoice/buyer-gst-invoice">
            <div class="form-row align-items-end">
              <div class="col-md-3 col-sm-6 mb-2">
                <label class="small font-weight-bold text-muted mb-1">Select Year:</label>
                <select name="year" class="form-control form-control-sm">
                  ${yearOptions.join('')}
                </select>
              </div>
              <div class="col-md-3 col-sm-6 mb-2">
                <label class="small font-weight-bold text-muted mb-1">Select Month:</label>
                <select name="month" class="form-control form-control-sm">
                  ${monthOptions.join('')}
                </select>
              </div>
              <div class="col-md-3 col-sm-12 mb-2">
                <button type="submit" class="btn btn-primary btn-sm px-3 mr-1 font-weight-bold">
                  <i class="fa fa-search mr-1"></i> View Month
                </button>
                <a href="/invoice/buyer-gst-invoice" class="btn btn-outline-secondary btn-sm">Reset</a>
              </div>
            </div>
          </form>
        </div>

        <!-- Current Selected Month Invoice Preview -->
        ${invoiceCardHtml}

        <!-- Invoices List Table -->
        <div class="card shadow-sm border-0 no-print">
          <div class="card-header bg-white py-3">
            <h5 class="card-title mb-0 font-weight-bold text-dark">
              <i class="fa fa-history mr-2 text-primary"></i> Monthly Invoices History
            </h5>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered table-inv mb-0">
              <thead>
                <tr>
                  <th class="text-center">Year</th>
                  <th class="text-center">Month</th>
                  <th>Buyer Name</th>
                  <th>Buyer GST No</th>
                  <th class="text-right">Taxable Amount</th>
                  <th class="text-right">CGST Amt</th>
                  <th class="text-right">SGST Amt</th>
                  <th class="text-right">IGST Amt</th>
                  <th class="text-right">Invoice Amount</th>
                  <th class="text-center">Status</th>
                  <th class="text-center">View Invoice</th>
                </tr>
              </thead>
              <tbody>
                ${historyRowsHtml || '<tr><td colspan="11" class="text-center py-4 text-muted font-weight-bold">No buyer invoice records found yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
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
      return;
    }

    // ==========================================
    // 2. SELLER GST INVOICE
    // ==========================================
    if (type === 'seller-gst' || type === 'seller') {
      const sellerRes = await db.query(
        `SELECT inv.id, inv.user_id, inv.month_year, inv.redeem_amount_minor,
                inv.taxable_amount_minor, inv.cgst_amount_minor, inv.sgst_amount_minor, inv.igst_amount_minor,
                inv.file_name, inv.file_mime, inv.status, inv.created_at, inv.updated_at,
                u.name AS user_name, u.username, u.business_name, u.state AS user_state,
                COALESCE(u.gst_number, k.gst_number, '-') AS gst_number
         FROM seller_gst_invoices inv
         JOIN users u ON u.id = inv.user_id
         LEFT JOIN user_kyc k ON k.user_id = u.id
         WHERE inv.user_id = $1
         ORDER BY inv.month_year DESC`,
        [user.id],
      );

      const sellerRowsHtml = sellerRes.rows.map((row) => {
        const [y, m] = row.month_year.split('-');
        const mName = getMonthName(m);
        const invAmt = BigInt(row.redeem_amount_minor || 0);
        const taxAmt = BigInt(row.taxable_amount_minor || 0);
        const cgstAmt = BigInt(row.cgst_amount_minor || 0);
        const sgstAmt = BigInt(row.sgst_amount_minor || 0);
        const igstAmt = BigInt(row.igst_amount_minor || 0);

        let normStatus = (row.status || 'pending').toLowerCase();
        if (normStatus === 'uploaded') normStatus = 'waiting_for_approval';
        if (normStatus === 'verified') normStatus = 'approved';

        let statusBadge = '';
        if (normStatus === 'approved') {
          statusBadge = `<span class="badge" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;font-weight:700;padding:6px 14px;border-radius:20px;font-size:12px;"><i class="fa fa-check-circle mr-1"></i> Approved</span>`;
        } else if (normStatus === 'waiting_for_approval') {
          statusBadge = `<span class="badge" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;font-weight:700;padding:6px 14px;border-radius:20px;font-size:12px;"><i class="fa fa-hourglass-half mr-1"></i> Waiting for Approval</span>`;
        } else {
          statusBadge = `<span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-weight:700;padding:6px 14px;border-radius:20px;font-size:12px;"><i class="fa fa-clock-o mr-1"></i> Pending</span>`;
        }

        let actionHtml = '';
        if (normStatus === 'approved') {
          actionHtml = `
            <a href="/api/user/invoices/download?month=${escapeHtml(row.month_year)}" target="_blank" class="btn btn-sm btn-outline-success font-weight-bold">
              <i class="fa fa-file-pdf-o mr-1"></i> View Invoice
            </a>
          `;
        } else if (normStatus === 'waiting_for_approval') {
          actionHtml = `
            <div class="d-inline-flex align-items-center">
              <a href="/api/user/invoices/download?month=${escapeHtml(row.month_year)}" target="_blank" class="btn btn-sm btn-outline-primary mr-1 font-weight-bold" title="View Uploaded Invoice">
                <i class="fa fa-eye mr-1"></i> View
              </a>
              <button type="button" class="btn btn-sm btn-outline-secondary font-weight-bold btn-open-upload" data-month="${escapeHtml(row.month_year)}" data-amount="₹${formatMinorUnits(invAmt)}">
                <i class="fa fa-refresh mr-1"></i> Re-Upload
              </button>
            </div>
          `;
        } else {
          actionHtml = `
            <button type="button" class="btn btn-sm btn-primary font-weight-bold btn-open-upload" data-month="${escapeHtml(row.month_year)}" data-amount="₹${formatMinorUnits(invAmt)}">
              <i class="fa fa-upload mr-1"></i> Upload Invoice
            </button>
          `;
        }

        return `
          <tr>
            <td class="text-center font-monospace font-weight-bold">${escapeHtml(y)}</td>
            <td class="text-center font-weight-bold text-dark">${escapeHtml(mName)}</td>
            <td>
              <strong class="text-dark">${escapeHtml(row.user_name || user.name)}</strong>
              <div class="small text-muted font-monospace">${escapeHtml(row.username || user.username)}</div>
            </td>
            <td class="font-monospace font-weight-bold">${escapeHtml(row.gst_number || '-')}</td>
            <td class="text-right font-monospace text-dark font-weight-bold">₹${formatMinorUnits(taxAmt)}</td>
            <td class="text-right font-monospace text-muted">₹${formatMinorUnits(cgstAmt)}</td>
            <td class="text-right font-monospace text-muted">₹${formatMinorUnits(sgstAmt)}</td>
            <td class="text-right font-monospace text-muted">₹${formatMinorUnits(igstAmt)}</td>
            <td class="text-right font-monospace font-weight-bold text-primary" style="font-size:14px;">₹${formatMinorUnits(invAmt)}</td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-center small text-muted font-monospace">${escapeHtml(formatDisplayDate(row.created_at))}</td>
            <td class="text-center small text-muted font-monospace">${escapeHtml(row.updated_at && row.updated_at !== row.created_at ? formatDisplayDate(row.updated_at) : '-')}</td>
            <td class="text-center">${actionHtml}</td>
          </tr>
        `;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Seller GST Invoice - Exchange</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 16px 20px 50px; }
    .filter-card { background: #ffffff; border-radius: 10px; padding: 16px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; margin-bottom: 20px; }
    .inv-table-card { background: #ffffff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .inv-table-card .card-header { background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 14px 20px; }
    .table-inv thead th { background: #f8fafc; color: #475569; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; padding: 10px 12px; white-space: nowrap; }
    .table-inv tbody td { vertical-align: middle; padding: 12px; font-size: 13px; }
    .table-inv tbody tr:hover { background: #f8fafc; }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${renderUserNavigation('/invoice/seller-gst-invoice')}

      <div class="page-container">
        <!-- Top Bar -->
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h4 class="page-title mb-1 text-dark font-weight-bold">
              <i class="fa fa-upload mr-2 text-primary"></i> Seller GST Invoices
            </h4>
            <div class="text-muted small">Upload and track your monthly GST invoices for redeemed payout amounts</div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge mr-2" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;">Pending = Upload Required</span>
            <span class="badge mr-2" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;">Waiting for Approval = Sent to Admin</span>
            <span class="badge" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;">Approved = Confirmed</span>
          </div>
        </div>

        <!-- Filter Card -->
        <div class="filter-card">
          <form method="GET" action="/invoice/seller-gst-invoice">
            <div class="form-row align-items-end">
              <div class="col-md-3 col-sm-6 mb-2">
                <label class="small font-weight-bold text-muted mb-1">Select Year:</label>
                <select name="year" class="form-control form-control-sm">
                  ${yearOptions.join('')}
                </select>
              </div>
              <div class="col-md-3 col-sm-6 mb-2">
                <label class="small font-weight-bold text-muted mb-1">Select Month:</label>
                <select name="month" class="form-control form-control-sm">
                  ${monthOptions.join('')}
                </select>
              </div>
              <div class="col-md-3 col-sm-6 mb-2">
                <label class="small font-weight-bold text-muted mb-1">Status:</label>
                <select name="status" class="form-control form-control-sm">
                  <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Status</option>
                  <option value="pending" ${statusFilter === 'pending' ? 'selected' : ''}>Pending (Upload Required)</option>
                  <option value="waiting_for_approval" ${statusFilter === 'waiting_for_approval' ? 'selected' : ''}>Waiting for Approval</option>
                  <option value="approved" ${statusFilter === 'approved' ? 'selected' : ''}>Approved</option>
                </select>
              </div>
              <div class="col-md-3 col-sm-12 mb-2 text-right">
                <button type="submit" class="btn btn-primary btn-sm px-3 mr-1 font-weight-bold">
                  <i class="fa fa-filter mr-1"></i> Filter
                </button>
                <a href="/invoice/seller-gst-invoice" class="btn btn-outline-secondary btn-sm">Reset</a>
              </div>
            </div>
          </form>
        </div>

        <div id="userTopAlert" class="alert alert-success font-weight-bold" style="display:none;"></div>
        <div id="userTopError" class="alert alert-danger font-weight-bold" style="display:none;"></div>

        <!-- Table Card -->
        <div class="inv-table-card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h5 class="card-title mb-0 font-weight-bold text-dark">
              <i class="fa fa-list mr-2 text-primary"></i> Monthly Seller Invoices
            </h5>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered table-inv mb-0">
              <thead>
                <tr>
                  <th class="text-center">Year</th>
                  <th class="text-center">Month</th>
                  <th>Seller Name</th>
                  <th>Seller GST No</th>
                  <th class="text-right">Taxable Amount</th>
                  <th class="text-right">CGST Amt</th>
                  <th class="text-right">SGST Amt</th>
                  <th class="text-right">IGST Amt</th>
                  <th class="text-right">Invoice Amount</th>
                  <th class="text-center">Status</th>
                  <th class="text-center">Added Date</th>
                  <th class="text-center">Updated Date</th>
                  <th class="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                ${sellerRowsHtml || '<tr><td colspan="13" class="text-center py-4 text-muted font-weight-bold">No seller invoices found. Invoices are generated automatically on the 1st of every month for your redeemed payouts.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- Upload Modal -->
  <div class="modal fade" id="uploadInvoiceModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <form id="sellerUploadForm">
          <div class="modal-header bg-light">
            <h5 class="modal-title font-weight-bold text-dark">
              <i class="fa fa-cloud-upload mr-2 text-primary"></i> Upload Seller GST Invoice
            </h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body p-4">
            <input type="hidden" id="modalInvMonth">
            <div class="alert alert-light border small mb-3">
              Billing Period: <strong id="modalPeriodText" class="text-dark"></strong>
              <br>Invoice Amount: <strong id="modalAmountText" class="text-primary font-monospace"></strong>
              <hr class="my-2">
              Billed To: <strong>EASY RECHARGE SOLUTION</strong>
              <br>GSTIN: <span class="font-monospace font-weight-bold">09AAACS1234F1Z5</span> (Uttar Pradesh)
            </div>

            <div class="form-group mb-3">
              <label class="small font-weight-bold text-dark">Select Invoice File (PDF, PNG, JPG, WEBP) *</label>
              <input type="file" class="form-control-file border p-2 rounded" id="modalInvFile" accept=".pdf,image/png,image/jpeg,image/webp" required>
              <small class="text-muted">Maximum allowed file size: 5MB</small>
            </div>
            <div id="modalError" class="alert alert-danger small py-2 font-weight-bold" style="display:none;"></div>
          </div>
          <div class="modal-footer bg-light">
            <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm font-weight-bold" id="btnSubmitModalUpload">
              <i class="fa fa-upload mr-1"></i> Upload Invoice
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
    document.querySelectorAll('.btn-open-upload').forEach(btn => {
      btn.addEventListener('click', () => {
        const month = btn.dataset.month;
        const amt = btn.dataset.amount;
        document.getElementById('modalInvMonth').value = month;
        document.getElementById('modalPeriodText').textContent = month;
        document.getElementById('modalAmountText').textContent = amt;
        document.getElementById('modalInvFile').value = '';
        document.getElementById('modalError').style.display = 'none';
        $('#uploadInvoiceModal').modal('show');
      });
    });

    const uploadForm = document.getElementById('sellerUploadForm');
    const btnSubmit = document.getElementById('btnSubmitModalUpload');
    const modalError = document.getElementById('modalError');
    const topAlert = document.getElementById('userTopAlert');
    const topError = document.getElementById('userTopError');

    if (uploadForm) {
      uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        modalError.style.display = 'none';
        const fileInput = document.getElementById('modalInvFile');
        const month = document.getElementById('modalInvMonth').value;

        if (!fileInput.files.length) {
          modalError.textContent = 'Please choose a file to upload.';
          modalError.style.display = 'block';
          return;
        }

        const file = fileInput.files[0];
        if (file.size > 5 * 1024 * 1024) {
          modalError.textContent = 'File size exceeds 5MB limit.';
          modalError.style.display = 'block';
          return;
        }

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Uploading...';

        const reader = new FileReader();
        reader.onload = async function() {
          const base64Data = reader.result.split(',')[1];
          try {
            const res = await fetch('/api/user/invoices/upload', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({
                month,
                fileName: file.name,
                fileMime: file.type || 'application/pdf',
                fileData: base64Data,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.message || 'Upload failed.');

            $('#uploadInvoiceModal').modal('hide');
            topAlert.textContent = '✓ Seller GST Invoice uploaded successfully! Status changed to Waiting for Approval.';
            topAlert.style.display = 'block';
            setTimeout(() => window.location.reload(), 1200);
          } catch (err) {
            modalError.textContent = err.message;
            modalError.style.display = 'block';
          } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="fa fa-upload mr-1"></i> Upload Invoice';
          }
        };
        reader.readAsDataURL(file);
      });
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
      response.end(await addPanelChrome(html, { role: 'user', userId: user.id, db }));
      return;
    }

    // ==========================================
    // 3. COMMISSION INVOICES
    // ==========================================
    if (type === 'buyer-commission' || type === 'seller-commission') {
      const isBuyer = type === 'buyer-commission';
      const colName = isBuyer ? 'r.margin_minor' : 'r.seller_margin_minor';
      const userCol = isBuyer ? 'r.user_id' : 'r.seller_user_id';
      const { start, end } = getMonthRange(selectedYear, selectedMonth);

      const commRes = await db.query(
        `SELECT COALESCE(SUM(${colName}), 0) AS total_comm_minor, COUNT(id) AS txn_count
         FROM recharge_orders r
         WHERE ${userCol} = $1 AND r.status = 'successful'
           AND r.created_at >= $2 AND r.created_at < $3`,
        [user.id, start, end],
      );
      const totalCommMinor = BigInt(commRes.rows[0]?.total_comm_minor || 0);
      const formattedComm = `₹${formatMinorUnits(totalCommMinor)}`;
      const txnCount = parseInt(commRes.rows[0]?.txn_count || 0, 10);

      const title = isBuyer ? 'Buyer Commission Invoice' : 'Seller Commission Invoice';

      const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Exchange</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 16px 20px 50px; }
    .card-box { background:#fff; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.06); padding:25px; border:1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${renderUserNavigation(`/invoice/${type}-invoice`)}
      <div class="page-container">

        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h4 class="page-title mb-1 text-dark font-weight-bold"><i class="fa fa-percent mr-2 text-primary"></i> ${title}</h4>
            <div class="small text-muted">Monthly commission statement and invoice</div>
          </div>
          <form method="GET" action="/invoice/${type}-invoice" class="form-inline">
            <select name="year" class="form-control form-control-sm mr-1">
              ${yearOptions.join('')}
            </select>
            <select name="month" class="form-control form-control-sm mr-2">
              ${monthOptions.join('')}
            </select>
            <button type="submit" class="btn btn-primary btn-sm mr-2">Filter</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="window.print()">
              <i class="fa fa-print mr-1"></i> Print
            </button>
          </form>
        </div>

        <div class="card-box">
          <div class="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
            <div>
              <h4 class="font-weight-bold text-dark mb-0">${title.toUpperCase()}</h4>
              <div class="text-muted small">Month: <strong>${monthLabel}</strong></div>
            </div>
            <div class="text-right">
              <div class="small text-muted">User: <strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.username)})</div>
              <div class="small text-muted">Role: <strong>${escapeHtml(user.role)}</strong></div>
            </div>
          </div>

          <div class="row">
            <div class="col-md-6">
              <div class="bg-light p-3 rounded mb-3">
                <div class="small text-uppercase font-weight-bold text-muted">Total Successful Transactions</div>
                <h3 class="font-weight-bold text-dark mb-0 mt-1">${txnCount}</h3>
              </div>
            </div>
            <div class="col-md-6">
              <div class="bg-light p-3 rounded mb-3">
                <div class="small text-uppercase font-weight-bold text-muted">${isBuyer ? 'Total Buyer Margin Earned' : 'Total Seller Discount/Commission'}</div>
                <h3 class="font-weight-bold text-success font-monospace mb-0 mt-1">${formattedComm}</h3>
              </div>
            </div>
          </div>

          <div class="table-responsive">
            <table class="table table-bordered table-sm mb-0">
              <thead class="thead-light">
                <tr>
                  <th>Description</th>
                  <th class="text-center">Count</th>
                  <th class="text-right">Total Commission Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${isBuyer ? 'Recharge Purchase Commission' : 'Recharge Sales Discount/Commission'} (${monthLabel})</td>
                  <td class="text-center font-monospace">${txnCount}</td>
                  <td class="text-right font-weight-bold font-monospace text-success">${formattedComm}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
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
      return;
    }
  }

  return { sendUserInvoicePage };
};
