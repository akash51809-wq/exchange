'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createUserInvoicePages({ db, formatMinorUnits }) {

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
    const month = parseInt(mStr, 10); // 1-12
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

  async function sendUserInvoicePage(user, type, response, searchParams) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');
    const selectedMonth = String(searchParams.get('month') || getLastMonthYear()).trim();
    const { start, end } = getMonthRange(selectedMonth);
    const monthLabel = getMonthName(selectedMonth);

    // Build month dropdown options (last 12 months)
    const monthOptions = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const lbl = dt.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      monthOptions.push(`<option value="${val}"${val === selectedMonth ? ' selected' : ''}>${lbl}</option>`);
    }

    if (type === 'buyer-gst' || type === 'buyer') {
      // Buyer GST Invoice: Total wallet topup done in the selected month
      const topupRes = await db.query(
        `SELECT COALESCE(SUM(amount_minor), 0) AS total_topup_minor, COUNT(id) AS request_count
         FROM wallet_fund_requests
         WHERE user_id = $1 AND status = 'approved'
           AND created_at >= $2 AND created_at < $3`,
        [user.id, start, end],
      );
      const totalAmountMinor = BigInt(topupRes.rows[0]?.total_topup_minor || 0);
      const formattedTotal = `₹${formatMinorUnits(totalAmountMinor)}`;
      const reqCount = parseInt(topupRes.rows[0]?.request_count || 0, 10);

      // Tax calculation (Inclusive 18% GST)
      const totalNum = Number(totalAmountMinor) / 100;
      const taxableNum = totalNum / 1.18;
      const gstNum = totalNum - taxableNum;
      const cgstNum = gstNum / 2;
      const sgstNum = gstNum / 2;

      const invoiceNo = `GST-B-${user.username.toUpperCase()}-${selectedMonth.replace('-', '')}`;

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
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 12px 18px 40px; }
    .invoice-card { background: #fff; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); padding: 30px; margin-top: 15px; }
    @media print {
      body * { visibility: hidden; }
      .invoice-card, .invoice-card * { visibility: visible; }
      .invoice-card { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: none; padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      <div class="no-print">${navigation}</div>
      <div class="page-container">

        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 no-print mb-2">
          <div>
            <h4 class="page-title mb-0 text-dark"><i class="fa fa-file-text-o mr-2"></i> Buyer GST Invoice</h4>
            <div class="small text-muted">Monthly GST invoice for total wallet topups</div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <form method="GET" action="/invoice/buyer-gst-invoice" class="form-inline">
              <label class="small font-weight-bold mr-1">Billing Month:</label>
              <select name="month" class="form-control form-control-sm mr-2" onchange="this.form.submit()">
                ${monthOptions.join('')}
              </select>
            </form>
            <button type="button" class="btn btn-primary btn-sm ml-2" onclick="window.print()">
              <i class="fa fa-print mr-1"></i> Print / Download Invoice
            </button>
          </div>
        </div>

        <div class="invoice-card">
          <div class="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
            <div>
              <h3 class="font-weight-bold text-primary mb-1">TAX INVOICE</h3>
              <div class="font-monospace text-muted small">Invoice No: <strong>${invoiceNo}</strong></div>
              <div class="text-muted small">Billing Month: <strong>${monthLabel}</strong></div>
            </div>
            <div class="text-right">
              <h4 class="font-weight-bold text-dark mb-0">EXCHANGE PLATFORM</h4>
              <div class="small text-muted">S3 SOLUTION & SERVICE COMPANY</div>
              <div class="small text-muted font-monospace">GSTIN: 09AAACS1234F1Z5</div>
              <div class="small text-muted">support@exchange.local</div>
            </div>
          </div>

          <div class="row mb-4">
            <div class="col-sm-6">
              <div class="text-uppercase small font-weight-bold text-muted mb-1">Billed To (Buyer):</div>
              <h5 class="font-weight-bold text-dark mb-1">${escapeHtml(user.name)}</h5>
              <div class="small text-muted">User ID: <span class="font-monospace font-weight-bold">${escapeHtml(user.username)}</span></div>
              <div class="small text-muted">Business: ${escapeHtml(user.business_name || user.name)}</div>
              <div class="small text-muted">${escapeHtml(user.address || 'India')}</div>
            </div>
            <div class="col-sm-6 text-sm-right mt-3 mt-sm-0">
              <div class="text-uppercase small font-weight-bold text-muted mb-1">Invoice Details:</div>
              <div class="small text-muted">Date: <strong>${new Date().toLocaleDateString('en-IN')}</strong></div>
              <div class="small text-muted">Place of Supply: <strong>Uttar Pradesh (09)</strong></div>
              <div class="small text-muted">Approved Topup Requests: <strong>${reqCount}</strong></div>
            </div>
          </div>

          <div class="table-responsive mb-4">
            <table class="table table-bordered table-sm mb-0">
              <thead class="thead-light">
                <tr>
                  <th class="text-center" style="width:50px;">#</th>
                  <th>Description of Service</th>
                  <th class="text-center">SAC Code</th>
                  <th class="text-right">Taxable Value (₹)</th>
                  <th class="text-right">CGST (9%)</th>
                  <th class="text-right">SGST (9%)</th>
                  <th class="text-right">Total Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="text-center">1</td>
                  <td>
                    <strong>Prepaid Wallet Topup / Recharge Stock Advance</strong>
                    <div class="small text-muted">For month of ${monthLabel} (${reqCount} approved topups)</div>
                  </td>
                  <td class="text-center font-monospace">998599</td>
                  <td class="text-right font-monospace">₹${taxableNum.toFixed(2)}</td>
                  <td class="text-right font-monospace">₹${cgstNum.toFixed(2)}</td>
                  <td class="text-right font-monospace">₹${sgstNum.toFixed(2)}</td>
                  <td class="text-right font-weight-bold font-monospace text-dark">${formattedTotal}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="font-weight-bold bg-light">
                  <td colspan="6" class="text-right">Grand Total (Inclusive of GST):</td>
                  <td class="text-right text-primary font-monospace" style="font-size:16px;">${formattedTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="border-top pt-3 text-muted small text-center">
            This is a computer-generated invoice and does not require a physical signature.
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
      return;
    }

    if (type === 'seller-gst' || type === 'seller') {
      // Seller GST Invoice: Shows total payment redeemed by user in selected month, and seller uploads their GST invoice for that amount
      const redeemRes = await db.query(
        `SELECT COALESCE(SUM(amount_minor), 0) AS total_redeem_minor, COUNT(id) AS payout_count
         FROM payout_requests
         WHERE user_id = $1 AND status = 'success'
           AND created_at >= $2 AND created_at < $3`,
        [user.id, start, end],
      );
      const totalRedeemMinor = BigInt(redeemRes.rows[0]?.total_redeem_minor || 0);
      const formattedRedeem = `₹${formatMinorUnits(totalRedeemMinor)}`;
      const payoutCount = parseInt(redeemRes.rows[0]?.payout_count || 0, 10);

      // Check if invoice already uploaded
      const invoiceRes = await db.query(
        `SELECT id, month_year, redeem_amount_minor, file_name, file_mime, status, created_at, updated_at
         FROM seller_gst_invoices
         WHERE user_id = $1 AND month_year = $2`,
        [user.id, selectedMonth],
      );
      const existingInvoice = invoiceRes.rows[0] || null;

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
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 12px 18px 40px; }
    .kpi-box { background: #fff; border-radius: 6px; padding: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.08); margin-bottom: 15px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <div class="page-container">

        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h4 class="page-title mb-0 text-dark"><i class="fa fa-upload mr-2"></i> Seller GST Invoice Upload</h4>
            <div class="small text-muted">Upload your GST invoice for payments redeemed in selected month</div>
          </div>
          <form method="GET" action="/invoice/seller-gst-invoice" class="form-inline">
            <label class="small font-weight-bold mr-1">Redeem Month:</label>
            <select name="month" class="form-control form-control-sm mr-2" onchange="this.form.submit()">
              ${monthOptions.join('')}
            </select>
            <a href="/invoice/seller-gst-invoice" class="btn btn-secondary btn-sm">Reset</a>
          </form>
        </div>

        <div id="topAlert" class="alert alert-success font-weight-bold" style="display:none;"></div>
        <div id="topError" class="alert alert-danger font-weight-bold" style="display:none;"></div>

        <div class="row">
          <div class="col-md-5">
            <div class="kpi-box">
              <div class="small text-muted text-uppercase font-weight-bold">Billing Month:</div>
              <h5 class="font-weight-bold text-dark mt-1">${monthLabel}</h5>

              <div class="small text-muted text-uppercase font-weight-bold mt-3">Total Payment Redeemed:</div>
              <h2 class="font-weight-bold text-primary font-monospace mt-1">${formattedRedeem}</h2>
              <div class="small text-muted">${payoutCount} Successful Payout / Redeem transactions</div>

              <div class="small text-muted text-uppercase font-weight-bold mt-3">GST Invoice Status:</div>
              <div class="mt-1">
                ${existingInvoice
                  ? `<span class="badge badge-success px-3 py-2" style="background:#22c55e;font-size:13px;"><i class="fa fa-check-circle"></i> Invoice Uploaded (${existingInvoice.file_name || 'File'})</span>`
                  : `<span class="badge badge-danger px-3 py-2" style="background:#ef4444;font-size:13px;"><i class="fa fa-exclamation-triangle"></i> Invoice Pending Upload</span>`}
              </div>

              ${existingInvoice ? `
                <div class="mt-3">
                  <a href="/api/user/invoices/download?month=${escapeHtml(selectedMonth)}" class="btn btn-outline-primary btn-sm" target="_blank">
                    <i class="fa fa-download mr-1"></i> View Uploaded Invoice
                  </a>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="col-md-7">
            <div class="card shadow-sm border-0">
              <div class="card-header bg-primary text-white py-2">
                <h5 class="card-title mb-0" style="font-size:15px;"><i class="fa fa-cloud-upload mr-1"></i> Upload Seller GST Invoice</h5>
              </div>
              <div class="card-body">
                ${totalRedeemMinor <= 0n ? `
                  <div class="alert alert-info py-2 small mb-0">
                    <i class="fa fa-info-circle mr-1"></i> You did not redeem any payments in <strong>${monthLabel}</strong>. No invoice is required for this month.
                  </div>
                ` : `
                  <form id="uploadInvoiceForm">
                    <input type="hidden" id="invMonth" value="${escapeHtml(selectedMonth)}">
                    <div class="alert alert-light border small mb-3">
                      Please upload your GST Invoice of <strong>${formattedRedeem}</strong> billed to:
                      <br><strong>S3 SOLUTION & SERVICE COMPANY</strong>, GSTIN: 09AAACS1234F1Z5
                    </div>

                    <div class="form-group mb-3">
                      <label class="small font-weight-bold">Select Invoice File (PDF, PNG, JPG, WEBP) <span class="text-danger">*</span></label>
                      <input type="file" class="form-control-file border p-2 rounded" id="invFile" accept=".pdf,image/png,image/jpeg,image/webp" required>
                      <small class="text-muted">Maximum file size: 5MB</small>
                    </div>

                    <button type="submit" class="btn btn-primary font-weight-bold btn-block" id="btnUploadInv">
                      <i class="fa fa-upload mr-1"></i> ${existingInvoice ? 'Re-upload / Update Invoice' : 'Upload Invoice'}
                    </button>
                  </form>
                `}
              </div>
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
  <script>
  (function() {
    const form = document.getElementById('uploadInvoiceForm');
    const btn = document.getElementById('btnUploadInv');
    const topAlert = document.getElementById('topAlert');
    const topError = document.getElementById('topError');

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        topAlert.style.display = 'none';
        topError.style.display = 'none';

        const fileInput = document.getElementById('invFile');
        const month = document.getElementById('invMonth').value;

        if (!fileInput.files.length) {
          topError.textContent = 'Please choose a file to upload.';
          topError.style.display = 'block';
          return;
        }

        const file = fileInput.files[0];
        if (file.size > 5 * 1024 * 1024) {
          topError.textContent = 'File size exceeds 5MB limit.';
          topError.style.display = 'block';
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Uploading...';

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

            topAlert.textContent = '✓ Seller GST Invoice uploaded successfully!';
            topAlert.style.display = 'block';
            setTimeout(() => window.location.reload(), 1200);
          } catch (err) {
            topError.textContent = err.message;
            topError.style.display = 'block';
          } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa fa-upload mr-1"></i> Upload Invoice';
          }
        };
        reader.readAsDataURL(file);
      });
    }
  })();
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

    if (type === 'buyer-commission' || type === 'seller-commission') {
      const isBuyer = type === 'buyer-commission';
      const colName = isBuyer ? 'r.margin_minor' : 'r.seller_margin_minor';
      const userCol = isBuyer ? 'r.user_id' : 'r.seller_user_id';

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
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 12px 18px 40px; }
    .card-box { background:#fff; border-radius:6px; box-shadow:0 2px 6px rgba(0,0,0,0.08); padding:25px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <div class="page-container">

        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h4 class="page-title mb-0 text-dark"><i class="fa fa-percent mr-2"></i> ${title}</h4>
            <div class="small text-muted">Monthly commission statement and invoice</div>
          </div>
          <form method="GET" action="/invoice/${type}-invoice" class="form-inline">
            <label class="small font-weight-bold mr-1">Billing Month:</label>
            <select name="month" class="form-control form-control-sm mr-2" onchange="this.form.submit()">
              ${monthOptions.join('')}
            </select>
            <button type="button" class="btn btn-primary btn-sm ml-2" onclick="window.print()">
              <i class="fa fa-print mr-1"></i> Print Statement
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
      return;
    }
  }

  return { sendUserInvoicePage };
};
