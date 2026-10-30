'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const {
  MONTHS,
  getLastMonthYear,
  getMonthName,
  calculateGstAmounts,
  syncMonthlyInvoices,
  formatDisplayDate,
} = require('../lib/invoice-utils');

module.exports = function createAdminInvoicePage({ db, formatMinorUnits }) {

  async function getAdminState() {
    try {
      const res = await db.query("SELECT state FROM users WHERE role = 'admin' AND state IS NOT NULL AND state <> '' LIMIT 1");
      if (res.rows.length && res.rows[0].state) {
        return res.rows[0].state;
      }
    } catch (_) {}
    return 'Uttar Pradesh';
  }

  async function sendAdminInvoicePage(admin, response, searchParams) {
    const defaultLast = getLastMonthYear();
    const selectedYear = String(searchParams.get('year') || defaultLast.year).trim();
    const selectedMonth = String(searchParams.get('month') || defaultLast.month).trim().padStart(2, '0');
    const selectedMonthYear = `${selectedYear}-${selectedMonth}`;
    const activeTab = String(searchParams.get('tab') || 'seller').trim().toLowerCase(); // 'seller' or 'buyer'
    const statusFilter = String(searchParams.get('status') || 'all').trim().toLowerCase();
    const search = String(searchParams.get('search') || '').trim();

    const adminState = await getAdminState();

    // Auto-sync monthly records for this selected year & month
    try {
      await syncMonthlyInvoices(db, selectedYear, selectedMonth, adminState);
    } catch (err) {
      console.warn('[Invoice Sync Error]:', err.message);
    }

    const monthLabel = `${getMonthName(selectedMonth)} ${selectedYear}`;

    // Available Years (last 5 years)
    const currentYear = new Date().getFullYear();
    const yearOptions = [];
    for (let y = currentYear; y >= currentYear - 4; y--) {
      yearOptions.push(`<option value="${y}"${String(y) === selectedYear ? ' selected' : ''}>${y}</option>`);
    }

    // Available Months
    const monthOptions = MONTHS.map((m) =>
      `<option value="${m.value}"${m.value === selectedMonth ? ' selected' : ''}>${m.name}</option>`
    );

    // 1. Fetch Seller Invoices
    const sellerParams = [selectedMonthYear];
    let sellerConditions = ['inv.month_year = $1', 'u.deleted_at IS NULL'];

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'waiting_for_approval') {
        sellerConditions.push("(inv.status = 'waiting_for_approval' OR inv.status = 'uploaded')");
      } else if (statusFilter === 'approved') {
        sellerConditions.push("(inv.status = 'approved' OR inv.status = 'verified')");
      } else if (statusFilter === 'pending') {
        sellerConditions.push("inv.status = 'pending'");
      }
    }

    if (search) {
      sellerParams.push(`%${search}%`);
      const pIdx = sellerParams.length;
      sellerConditions.push(`(u.name ILIKE $${pIdx} OR u.username ILIKE $${pIdx} OR COALESCE(u.business_name, '') ILIKE $${pIdx} OR COALESCE(u.gst_number, k.gst_number, '') ILIKE $${pIdx})`);
    }

    const sellersRes = await db.query(
      `SELECT inv.id, inv.user_id, inv.month_year, inv.redeem_amount_minor,
              inv.taxable_amount_minor, inv.cgst_amount_minor, inv.sgst_amount_minor, inv.igst_amount_minor,
              inv.file_name, inv.file_mime, inv.status, inv.created_at, inv.updated_at,
              u.name AS user_name, u.username, u.business_name, u.state AS user_state,
              COALESCE(u.gst_number, k.gst_number, '-') AS gst_number
       FROM seller_gst_invoices inv
       JOIN users u ON u.id = inv.user_id
       LEFT JOIN user_kyc k ON k.user_id = u.id
       WHERE ${sellerConditions.join(' AND ')}
       ORDER BY inv.created_at DESC`,
      sellerParams,
    );

    // 2. Fetch Buyer Invoices
    const buyerParams = [selectedMonthYear];
    let buyerConditions = ['inv.month_year = $1', 'u.deleted_at IS NULL'];

    if (statusFilter && statusFilter !== 'all') {
      buyerParams.push(statusFilter);
      buyerConditions.push(`inv.status = $${buyerParams.length}`);
    }

    if (search) {
      buyerParams.push(`%${search}%`);
      const pIdx = buyerParams.length;
      buyerConditions.push(`(u.name ILIKE $${pIdx} OR u.username ILIKE $${pIdx} OR COALESCE(u.business_name, '') ILIKE $${pIdx} OR COALESCE(u.gst_number, k.gst_number, '') ILIKE $${pIdx})`);
    }

    const buyersRes = await db.query(
      `SELECT inv.id, inv.user_id, inv.month_year, inv.topup_amount_minor,
              inv.taxable_amount_minor, inv.cgst_amount_minor, inv.sgst_amount_minor, inv.igst_amount_minor,
              inv.status, inv.created_at, inv.updated_at,
              u.name AS user_name, u.username, u.business_name, u.state AS user_state,
              COALESCE(u.gst_number, k.gst_number, '-') AS gst_number
       FROM buyer_gst_invoices inv
       JOIN users u ON u.id = inv.user_id
       LEFT JOIN user_kyc k ON k.user_id = u.id
       WHERE ${buyerConditions.join(' AND ')}
       ORDER BY inv.created_at DESC`,
      buyerParams,
    );

    // Render Seller Rows
    const sellerRowsHtml = sellersRes.rows.map((row) => {
      const invAmt = BigInt(row.redeem_amount_minor || 0);
      const taxAmt = BigInt(row.taxable_amount_minor || 0);
      const cgstAmt = BigInt(row.cgst_amount_minor || 0);
      const sgstAmt = BigInt(row.sgst_amount_minor || 0);
      const igstAmt = BigInt(row.igst_amount_minor || 0);

      // Status logic: pending, waiting_for_approval, approved
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

      // Actions / View Invoice Button
      let actionHtml = '';
      if (normStatus === 'approved') {
        actionHtml = `
          <a href="/api/admin/invoices/download?id=${escapeHtml(row.id)}" target="_blank" class="btn btn-sm btn-outline-primary font-weight-bold" title="Download Approved Invoice">
            <i class="fa fa-file-pdf-o mr-1"></i> View Invoice
          </a>
        `;
      } else if (normStatus === 'waiting_for_approval') {
        actionHtml = `
          <div class="d-inline-flex align-items-center gap-1">
            <a href="/api/admin/invoices/download?id=${escapeHtml(row.id)}" target="_blank" class="btn btn-sm btn-outline-primary font-weight-bold mr-1" title="Review Invoice File">
              <i class="fa fa-eye mr-1"></i> View Invoice
            </a>
            <button type="button" class="btn btn-sm btn-success font-weight-bold btn-approve-seller" data-id="${escapeHtml(row.id)}" title="Confirm & Approve">
              <i class="fa fa-check mr-1"></i> Confirm
            </button>
          </div>
        `;
      } else {
        actionHtml = `<span class="text-muted small font-italic"><i class="fa fa-upload mr-1"></i> Pending Upload</span>`;
      }

      const [y, m] = (row.month_year || selectedMonthYear).split('-');
      const mName = getMonthName(m);

      return `
        <tr>
          <td class="text-center font-monospace font-weight-bold">${escapeHtml(y)}</td>
          <td class="text-center font-weight-bold text-dark">${escapeHtml(mName)}</td>
          <td>
            <div class="font-weight-bold text-dark">${escapeHtml(row.user_name || 'Seller')}</div>
            <div class="small text-muted font-monospace"><i class="fa fa-user mr-1"></i>${escapeHtml(row.username)}</div>
            ${row.business_name ? `<div class="small text-secondary">${escapeHtml(row.business_name)}</div>` : ''}
          </td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(row.gst_number || '-')}</td>
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

    // Render Buyer Rows
    const buyerRowsHtml = buyersRes.rows.map((row) => {
      const invAmt = BigInt(row.topup_amount_minor || 0);
      const taxAmt = BigInt(row.taxable_amount_minor || 0);
      const cgstAmt = BigInt(row.cgst_amount_minor || 0);
      const sgstAmt = BigInt(row.sgst_amount_minor || 0);
      const igstAmt = BigInt(row.igst_amount_minor || 0);

      const isApproved = row.status === 'approved';

      const statusBadge = isApproved
        ? `<span class="badge" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;font-weight:700;padding:6px 14px;border-radius:20px;font-size:12px;"><i class="fa fa-check-circle mr-1"></i> Approved</span>`
        : `<span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-weight:700;padding:6px 14px;border-radius:20px;font-size:12px;"><i class="fa fa-clock-o mr-1"></i> Pending Approval</span>`;

      const [y, m] = (row.month_year || selectedMonthYear).split('-');
      const mName = getMonthName(m);

      const invoiceData = {
        id: row.id,
        year: y,
        month: mName,
        monthYear: row.month_year,
        buyerName: row.user_name || 'Buyer',
        username: row.username,
        businessName: row.business_name || row.user_name,
        gstNumber: row.gst_number || '-',
        taxable: formatMinorUnits(taxAmt),
        cgst: formatMinorUnits(cgstAmt),
        sgst: formatMinorUnits(sgstAmt),
        igst: formatMinorUnits(igstAmt),
        invoiceAmount: formatMinorUnits(invAmt),
        status: isApproved ? 'Approved' : 'Pending Approval',
        placeOfSupply: row.user_state || 'Uttar Pradesh',
      };

      const actionHtml = `
        <div class="d-inline-flex align-items-center">
          ${!isApproved ? `
            <button type="button" class="btn btn-sm btn-success font-weight-bold btn-approve-buyer mr-1" data-id="${escapeHtml(row.id)}" title="Approve this invoice for Buyer">
              <i class="fa fa-check mr-1"></i> Approve
            </button>
          ` : ''}
          <button type="button" class="btn btn-sm btn-outline-info font-weight-bold btn-view-buyer-invoice" data-invoice='${escapeHtml(JSON.stringify(invoiceData))}' title="View & Print Invoice">
            <i class="fa fa-file-text-o mr-1"></i> View Invoice
          </button>
        </div>
      `;

      return `
        <tr>
          <td class="text-center">
            ${!isApproved ? `<input type="checkbox" class="buyer-checkbox" value="${escapeHtml(row.id)}">` : '<i class="fa fa-check text-success" title="Approved"></i>'}
          </td>
          <td class="text-center font-monospace font-weight-bold">${escapeHtml(y)}</td>
          <td class="text-center font-weight-bold text-dark">${escapeHtml(mName)}</td>
          <td>
            <div class="font-weight-bold text-dark">${escapeHtml(row.user_name || 'Buyer')}</div>
            <div class="small text-muted font-monospace"><i class="fa fa-user mr-1"></i>${escapeHtml(row.username)}</div>
            ${row.business_name ? `<div class="small text-secondary">${escapeHtml(row.business_name)}</div>` : ''}
          </td>
          <td class="font-monospace font-weight-bold text-dark">${escapeHtml(row.gst_number || '-')}</td>
          <td class="text-right font-monospace text-dark font-weight-bold">₹${formatMinorUnits(taxAmt)}</td>
          <td class="text-right font-monospace text-muted">₹${formatMinorUnits(cgstAmt)}</td>
          <td class="text-right font-monospace text-muted">₹${formatMinorUnits(sgstAmt)}</td>
          <td class="text-right font-monospace text-muted">₹${formatMinorUnits(igstAmt)}</td>
          <td class="text-right font-monospace font-weight-bold text-primary" style="font-size:14px;">₹${formatMinorUnits(invAmt)}</td>
          <td class="text-center">${statusBadge}</td>
          <td class="text-center">${actionHtml}</td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GST Invoices - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 16px 20px 50px; }
    
    /* Tab buttons styling - Crisp & high contrast */
    .invoice-nav-tabs {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 12px;
    }
    .invoice-tab-btn {
      padding: 10px 24px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 14px;
      text-decoration: none !important;
      display: inline-flex;
      align-items: center;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .invoice-tab-btn.active {
      background: #1e3a8a !important;
      color: #ffffff !important;
      border: 2px solid #1e3a8a !important;
      box-shadow: 0 4px 12px rgba(30, 58, 138, 0.28);
    }
    .invoice-tab-btn.active i {
      color: #ffffff !important;
    }
    .invoice-tab-btn:not(.active) {
      background: #ffffff !important;
      color: #334155 !important;
      border: 2px solid #cbd5e1 !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .invoice-tab-btn:not(.active):hover {
      background: #f8fafc !important;
      color: #0f172a !important;
      border-color: #94a3b8 !important;
    }

    .filter-card {
      background: #ffffff;
      border-radius: 10px;
      padding: 16px 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
      border: 1px solid #e2e8f0;
      margin-bottom: 22px;
    }
    .inv-table-card {
      background: #ffffff;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
      overflow: hidden;
    }
    .inv-table-card .card-header {
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      padding: 14px 20px;
    }
    .table-inv thead th {
      background: #f8fafc;
      color: #475569;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #cbd5e1;
      vertical-align: middle;
      white-space: nowrap;
      padding: 10px 12px;
    }
    .table-inv tbody td {
      vertical-align: middle;
      padding: 12px;
      font-size: 13px;
    }
    .table-inv tbody tr:hover {
      background: #f8fafc;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${renderAdminNavigation('/admin/invoice')}

      <div class="page-container">
        <!-- Page Header -->
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h4 class="page-title mb-1 text-dark font-weight-bold">
              <i class="fa fa-file-text-o mr-2 text-primary"></i> GST Invoices Management
            </h4>
            <div class="text-muted small">Manage monthly Seller Redeem GST invoices and Buyer Wallet Topup invoices</div>
          </div>
          <div class="text-muted small">
            Admin State: <strong class="text-dark">${escapeHtml(adminState)}</strong> (Place of Supply)
          </div>
        </div>

        <!-- High-Contrast Tab Buttons -->
        <div class="invoice-nav-tabs">
          <a class="invoice-tab-btn ${activeTab === 'seller' ? 'active' : ''}" href="/admin/invoice?year=${escapeHtml(selectedYear)}&month=${escapeHtml(selectedMonth)}&tab=seller">
            <i class="fa fa-upload mr-2"></i> Seller GST Invoice (${sellersRes.rowCount})
          </a>
          <a class="invoice-tab-btn ${activeTab === 'buyer' ? 'active' : ''}" href="/admin/invoice?year=${escapeHtml(selectedYear)}&month=${escapeHtml(selectedMonth)}&tab=buyer">
            <i class="fa fa-shopping-cart mr-2"></i> Buyer GST Invoice (${buyersRes.rowCount})
          </a>
        </div>

        <!-- Filter Bar -->
        <div class="filter-card">
          <form method="GET" action="/admin/invoice" id="invoiceFilterForm">
            <input type="hidden" name="tab" value="${escapeHtml(activeTab)}">
            <div class="row align-items-end">
              <div class="col-md-2 col-sm-6 mb-2">
                <label class="small font-weight-bold text-muted mb-1">Select Year:</label>
                <select name="year" class="form-control form-control-sm">
                  ${yearOptions.join('')}
                </select>
              </div>
              <div class="col-md-2 col-sm-6 mb-2">
                <label class="small font-weight-bold text-muted mb-1">Select Month:</label>
                <select name="month" class="form-control form-control-sm">
                  ${monthOptions.join('')}
                </select>
              </div>
              <div class="col-md-3 col-sm-6 mb-2">
                <label class="small font-weight-bold text-muted mb-1">Status:</label>
                <select name="status" class="form-control form-control-sm">
                  <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Status</option>
                  ${activeTab === 'seller' ? `
                    <option value="pending" ${statusFilter === 'pending' ? 'selected' : ''}>Pending (Not Uploaded)</option>
                    <option value="waiting_for_approval" ${statusFilter === 'waiting_for_approval' ? 'selected' : ''}>Waiting for Approval</option>
                    <option value="approved" ${statusFilter === 'approved' ? 'selected' : ''}>Approved</option>
                  ` : `
                    <option value="pending" ${statusFilter === 'pending' ? 'selected' : ''}>Pending Approval</option>
                    <option value="approved" ${statusFilter === 'approved' ? 'selected' : ''}>Approved</option>
                  `}
                </select>
              </div>
              <div class="col-md-3 col-sm-6 mb-2">
                <label class="small font-weight-bold text-muted mb-1">Search User / GST No:</label>
                <input type="text" name="search" class="form-control form-control-sm" placeholder="Name, Username, GST No..." value="${escapeHtml(search)}">
              </div>
              <div class="col-md-2 col-sm-12 mb-2 text-right">
                <button type="submit" class="btn btn-primary btn-sm px-3 mr-1 font-weight-bold">
                  <i class="fa fa-filter mr-1"></i> Filter
                </button>
                <a href="/admin/invoice?tab=${escapeHtml(activeTab)}" class="btn btn-outline-secondary btn-sm">Reset</a>
              </div>
            </div>
          </form>
        </div>

        ${activeTab === 'seller' ? `
          <!-- Seller Invoices Card -->
          <div class="inv-table-card">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <h5 class="card-title mb-0 font-weight-bold text-dark">
                <i class="fa fa-list mr-2 text-primary"></i> Seller GST Invoices for ${escapeHtml(monthLabel)}
              </h5>
              <div class="d-flex align-items-center gap-2">
                <span class="badge mr-2" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;">Pending = Not Uploaded</span>
                <span class="badge mr-2" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;">Waiting for Approval = Uploaded</span>
                <span class="badge" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;">Approved = Verified</span>
              </div>
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
                    <th class="text-center">Action / View</th>
                  </tr>
                </thead>
                <tbody>
                  ${sellerRowsHtml || `<tr><td colspan="13" class="text-center py-5 text-muted font-weight-bold">No seller invoices found for ${escapeHtml(monthLabel)}.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          <!-- Buyer Invoices Card -->
          <div class="inv-table-card">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <h5 class="card-title mb-0 font-weight-bold text-dark">
                  <i class="fa fa-list mr-2 text-primary"></i> Buyer GST Invoices for ${escapeHtml(monthLabel)}
                </h5>
                <small class="text-muted">Invoices approved by admin become visible to buyers on their panel</small>
              </div>
              <div>
                <button type="button" class="btn btn-success btn-sm font-weight-bold" id="btnBulkApproveBuyers" disabled>
                  <i class="fa fa-check-circle mr-1"></i> Approve Selected (<span id="selectedCount">0</span>)
                </button>
              </div>
            </div>
            <div class="table-responsive">
              <table class="table table-bordered table-inv mb-0">
                <thead>
                  <tr>
                    <th class="text-center" style="width:36px;">
                      <input type="checkbox" id="selectAllBuyers">
                    </th>
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
                    <th class="text-center">Action / View</th>
                  </tr>
                </thead>
                <tbody>
                  ${buyerRowsHtml || `<tr><td colspan="12" class="text-center py-5 text-muted font-weight-bold">No buyer invoices found for ${escapeHtml(monthLabel)}.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        `}

      </div>
    </div>
  </div>

  <!-- Buyer Invoice Preview Modal -->
  <div class="modal fade" id="buyerInvoiceModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-lg" role="document">
      <div class="modal-content">
        <div class="modal-header bg-light">
          <h5 class="modal-title font-weight-bold text-dark"><i class="fa fa-file-text-o mr-2 text-primary"></i> Tax Invoice Preview</h5>
          <button type="button" class="close" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body p-4" id="buyerInvoicePrintArea">
          <!-- Dynamically populated -->
        </div>
        <div class="modal-footer bg-light">
          <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Close</button>
          <button type="button" class="btn btn-primary btn-sm font-weight-bold" onclick="printInvoiceModal()"><i class="fa fa-print mr-1"></i> Print / Download</button>
        </div>
      </div>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
  <script src="/auth-client.js"></script>
  <script>
    // Seller Approve Handler
    document.querySelectorAll('.btn-approve-seller').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('Are you sure you want to approve this Seller GST Invoice?')) return;
        btn.disabled = true;
        try {
          const res = await fetch('/api/admin/invoices/seller/approve', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ id })
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || 'Failed to approve invoice.');
          window.location.reload();
        } catch (err) {
          alert('Error: ' + err.message);
          btn.disabled = false;
        }
      });
    });

    // Buyer Single Approve Handler
    document.querySelectorAll('.btn-approve-buyer').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('Are you sure you want to approve this Buyer GST Invoice? It will immediately show on the Buyer panel.')) return;
        btn.disabled = true;
        try {
          const res = await fetch('/api/admin/invoices/buyer/approve', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ ids: [id] })
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || 'Failed to approve invoice.');
          window.location.reload();
        } catch (err) {
          alert('Error: ' + err.message);
          btn.disabled = false;
        }
      });
    });

    // Buyer Checkboxes & Bulk Approve
    const selectAllBuyers = document.getElementById('selectAllBuyers');
    const buyerCheckboxes = document.querySelectorAll('.buyer-checkbox');
    const btnBulkApprove = document.getElementById('btnBulkApproveBuyers');
    const selectedCountSpan = document.getElementById('selectedCount');

    function updateBulkButton() {
      const checked = Array.from(buyerCheckboxes).filter(cb => cb.checked);
      if (selectedCountSpan) selectedCountSpan.textContent = checked.length;
      if (btnBulkApprove) btnBulkApprove.disabled = checked.length === 0;
    }

    if (selectAllBuyers) {
      selectAllBuyers.addEventListener('change', () => {
        buyerCheckboxes.forEach(cb => cb.checked = selectAllBuyers.checked);
        updateBulkButton();
      });
    }

    buyerCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        if (!cb.checked && selectAllBuyers) selectAllBuyers.checked = false;
        updateBulkButton();
      });
    });

    if (btnBulkApprove) {
      btnBulkApprove.addEventListener('click', async () => {
        const checked = Array.from(buyerCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        if (!checked.length) return;
        if (!confirm('Are you sure you want to approve ' + checked.length + ' selected Buyer invoice(s)? They will become visible on the Buyer panels.')) return;
        btnBulkApprove.disabled = true;
        try {
          const res = await fetch('/api/admin/invoices/buyer/approve', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ ids: checked })
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || 'Failed to approve invoices.');
          window.location.reload();
        } catch (err) {
          alert('Error: ' + err.message);
          btnBulkApprove.disabled = false;
        }
      });
    }

    // Buyer View Invoice Modal
    document.querySelectorAll('.btn-view-buyer-invoice').forEach(btn => {
      btn.addEventListener('click', () => {
        const inv = JSON.parse(btn.dataset.invoice);
        const modalArea = document.getElementById('buyerInvoicePrintArea');
        const invoiceNo = 'GST-B-' + (inv.username || 'USR').toUpperCase() + '-' + inv.year + inv.monthYear.split('-')[1];

        modalArea.innerHTML = \`
          <div class="border p-4 bg-white" style="border-radius:6px;">
            <div class="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
              <div>
                <h3 class="font-weight-bold text-primary mb-1">TAX INVOICE</h3>
                <div class="small text-muted font-monospace">Invoice No: <strong>\${invoiceNo}</strong></div>
                <div class="small text-muted">Billing Month: <strong>\${inv.month} \${inv.year}</strong></div>
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
                <h5 class="font-weight-bold text-dark mb-1">\${inv.buyerName}</h5>
                <div class="small text-muted">User ID: <span class="font-monospace font-weight-bold">\${inv.username}</span></div>
                \${inv.businessName ? '<div class="small text-muted">Firm: ' + inv.businessName + '</div>' : ''}
                <div class="small text-muted font-monospace">GSTIN: <strong>\${inv.gstNumber}</strong></div>
              </div>
              <div class="col-sm-6 text-sm-right mt-3 mt-sm-0">
                <div class="text-uppercase small font-weight-bold text-muted mb-1">Tax Invoice Details:</div>
                <div class="small text-muted">Place of Supply: <strong>\${inv.placeOfSupply}</strong></div>
                <div class="small text-muted">Status: <strong class="text-success">\${inv.status}</strong></div>
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
                      <div class="small text-muted">Month: \${inv.month} \${inv.year}</div>
                    </td>
                    <td class="text-center font-monospace">998599</td>
                    <td class="text-right font-monospace">₹\${inv.taxable}</td>
                    <td class="text-right font-monospace">₹\${inv.cgst}</td>
                    <td class="text-right font-monospace">₹\${inv.sgst}</td>
                    <td class="text-right font-monospace">₹\${inv.igst}</td>
                    <td class="text-right font-weight-bold font-monospace text-primary">₹\${inv.invoiceAmount}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="font-weight-bold bg-light">
                    <td colspan="7" class="text-right">Grand Total (Inclusive of GST):</td>
                    <td class="text-right text-primary font-monospace" style="font-size:15px;">₹\${inv.invoiceAmount}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div class="border-top pt-3 text-muted small text-center">
              This is a computer generated tax invoice and does not require a physical signature.
            </div>
          </div>
        \`;
        $('#buyerInvoiceModal').modal('show');
      });
    });

    function printInvoiceModal() {
      const content = document.getElementById('buyerInvoicePrintArea').innerHTML;
      const printWindow = window.open('', '', 'height=700,width=900');
      printWindow.document.write('<html><head><title>Print Tax Invoice</title>');
      printWindow.document.write('<link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">');
      printWindow.document.write('<style>body{padding:20px;font-family:-apple-system,sans-serif;}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(content);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 350);
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
    response.end(await addPanelChrome(html, { role: 'admin', userId: admin.id, db, currentPath: '/admin/invoice' }));
  }

  return { sendAdminInvoicePage };
};
