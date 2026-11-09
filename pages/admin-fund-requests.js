'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createPageModule({ db, formatMinorUnits, decryptFundField }) {
  async function sendAdminFundRequestsPage(admin, response) {
    const result = await db.query(
      `SELECT r.id, r.amount_minor, r.bank_code, r.payment_mode, r.wallet_type, r.proof_mime,
              r.source_account_ciphertext, r.transaction_id_ciphertext,
              r.status, r.review_note, r.created_at, r.bank_account_id, u.username, u.name,
              COALESCE(b.bank_name, r.bank_name, r.bank_code) as bank_display,
              COALESCE(b.account_number, r.deposit_account) as deposit_account_num
       FROM wallet_fund_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN admin_bank_accounts b ON b.id = r.bank_account_id
       ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 500`,
    );

    let pendingCount = 0;
    let pendingAmountMinor = 0n;
    let approvedCount = 0;
    let approvedAmountMinor = 0n;
    let rejectedCount = 0;
    let rejectedAmountMinor = 0n;
    let totalCount = result.rows.length;
    let totalAmountMinor = 0n;

    for (const r of result.rows) {
      const amt = BigInt(r.amount_minor || 0);
      totalAmountMinor += amt;
      const st = String(r.status || '').toLowerCase();
      if (st === 'pending') {
        pendingCount++;
        pendingAmountMinor += amt;
      } else if (st === 'approved') {
        approvedCount++;
        approvedAmountMinor += amt;
      } else if (st === 'rejected') {
        rejectedCount++;
        rejectedAmountMinor += amt;
      }
    }

    const rows = result.rows.map((row, idx) => {
      const proof = row.proof_mime
        ? `<a class="btn btn-xs btn-outline-info text-nowrap" target="_blank" rel="noopener" href="/admin/payment/fund-request/proof/${row.id}">
             <i class="fa fa-image mr-1"></i>View Slip
           </a>`
        : '<span class="text-muted small">—</span>';

      const accountNumber = row.source_account_ciphertext ? decryptFundField(row.source_account_ciphertext, 'account') : '—';
      const transactionId = row.transaction_id_ciphertext ? decryptFundField(row.transaction_id_ciphertext, 'transaction') : '—';

      const isPending = row.status === 'pending';
      const isApproved = row.status === 'approved';
      const isRejected = row.status === 'rejected';

      let statusBadge = '';
      if (isPending) {
        statusBadge = '<span class="badge badge-warning text-dark px-2 py-1"><i class="fa fa-clock-o mr-1"></i>Pending</span>';
      } else if (isApproved) {
        statusBadge = '<span class="badge badge-success px-2 py-1"><i class="fa fa-check-circle mr-1"></i>Approved</span>';
      } else {
        statusBadge = '<span class="badge badge-danger px-2 py-1"><i class="fa fa-times-circle mr-1"></i>Rejected</span>';
      }

      const actions = isPending
        ? `<div class="btn-group btn-group-sm">
             <button type="button" class="btn btn-success btn-sm px-2" data-action="approve" data-id="${row.id}" title="Approve Request">
               <i class="fa fa-check mr-1"></i>Approve
             </button>
             <button type="button" class="btn btn-danger btn-sm px-2" data-action="reject" data-id="${row.id}" title="Reject Request">
               <i class="fa fa-times mr-1"></i>Reject
             </button>
           </div>`
        : `${statusBadge}`;

      const mode = String(row.payment_mode || 'UPI').toUpperCase();
      let modeBadge = `<span class="badge badge-secondary px-2 py-1">${escapeHtml(mode)}</span>`;
      if (mode.includes('UPI')) {
        modeBadge = '<span class="badge px-2 py-1 text-white" style="background:#7c3aed;"><i class="fa fa-qrcode mr-1"></i>UPI</span>';
      } else if (mode.includes('IMPS')) {
        modeBadge = '<span class="badge px-2 py-1 text-white" style="background:#0284c7;"><i class="fa fa-bolt mr-1"></i>IMPS</span>';
      } else if (mode.includes('NEFT')) {
        modeBadge = '<span class="badge px-2 py-1 text-white" style="background:#0d9488;"><i class="fa fa-university mr-1"></i>NEFT</span>';
      } else if (mode.includes('RTGS')) {
        modeBadge = '<span class="badge px-2 py-1 text-white" style="background:#4f46e5;"><i class="fa fa-exchange mr-1"></i>RTGS</span>';
      } else if (mode.includes('CASH')) {
        modeBadge = '<span class="badge px-2 py-1 text-dark" style="background:#f59e0b;"><i class="fa fa-money mr-1"></i>Cash</span>';
      }

      const wallet = String(row.wallet_type || 'buyer').toLowerCase();
      const walletBadge = wallet === 'seller'
        ? '<span class="badge badge-primary px-2 py-1"><i class="fa fa-briefcase mr-1"></i>Seller</span>'
        : '<span class="badge badge-success px-2 py-1"><i class="fa fa-shopping-cart mr-1"></i>Buyer</span>';

      const initial = (row.name || row.username || 'U').trim().slice(0, 1).toUpperCase();
      const dateStr = new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });

      return `<tr class="fund-row" data-status="${escapeHtml(row.status || '')}" data-mode="${escapeHtml(mode)}" data-wallet="${escapeHtml(wallet)}" data-search="${escapeHtml((row.username + ' ' + row.name + ' ' + (row.bank_display || '') + ' ' + accountNumber + ' ' + transactionId).toLowerCase())}">
        <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
        <td>
          <div class="d-flex align-items-center">
            <span class="user-avatar-initial mr-2">${escapeHtml(initial)}</span>
            <div>
              <strong class="text-dark d-block">${escapeHtml(row.name)}</strong>
              <small class="text-muted"><i class="fa fa-user-circle mr-1"></i>${escapeHtml(row.username)}</small>
            </div>
          </div>
        </td>
        <td>
          <div class="d-flex align-items-center">
            ${row.bank_account_id ? `<img src="/api/bank-logo/${row.bank_account_id}" alt="" class="bank-chip-logo mr-2" onerror="this.style.display='none'">` : '<i class="fa fa-university text-muted mr-2" style="font-size:16px;"></i>'}
            <div>
              <strong class="text-primary d-block">${escapeHtml(row.bank_display || 'Admin Bank')}</strong>
              ${row.deposit_account_num ? `<span class="badge badge-light border font-monospace text-dark">${escapeHtml(row.deposit_account_num)}</span>` : ''}
            </div>
          </div>
        </td>
        <td>
          <span class="fund-amount-pill">₹${formatMinorUnits(row.amount_minor)}</span>
        </td>
        <td>${modeBadge}</td>
        <td>${walletBadge}</td>
        <td>
          <span class="font-monospace text-muted small">${escapeHtml(accountNumber)}</span>
        </td>
        <td>
          ${transactionId !== '—' ? `
            <div class="d-flex align-items-center">
              <span class="font-monospace text-dark font-weight-bold small mr-1 text-truncate" style="max-width:130px;" title="${escapeHtml(transactionId)}">${escapeHtml(transactionId)}</span>
              <button type="button" class="btn btn-xs btn-light border py-0 px-1 copy-btn" data-copy="${escapeHtml(transactionId)}" title="Copy UTR/TxID">
                <i class="fa fa-copy text-muted"></i>
              </button>
            </div>` : '<span class="text-muted small">—</span>'}
        </td>
        <td class="text-center">${proof}</td>
        <td class="small text-muted text-nowrap"><i class="fa fa-clock-o mr-1"></i>${escapeHtml(dateStr)}</td>
        <td class="text-nowrap">
          ${actions}
          ${row.review_note ? `<div class="small text-muted mt-1 font-italic bg-light p-1 rounded border"><i class="fa fa-info-circle text-info mr-1"></i>${escapeHtml(row.review_note)}</div>` : ''}
        </td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Fund Requests - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    .fund-kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 14px;
    }
    .fund-kpi-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 16px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.03);
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .fund-kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    }
    .fund-kpi-label {
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #64748b;
      margin-bottom: 2px;
    }
    .fund-kpi-val {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
    }
    .fund-kpi-sub {
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
    }
    .fund-kpi-icon {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .user-avatar-initial {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: #ffffff;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      flex-shrink: 0;
    }
    .bank-chip-logo {
      width: 24px;
      height: 24px;
      object-fit: contain;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      padding: 1px;
    }
    .fund-amount-pill {
      font-size: 14px;
      font-weight: 800;
      color: #10b981;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 6px;
      padding: 3px 8px;
      white-space: nowrap;
      display: inline-block;
    }
    .fund-filter-bar {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .fund-tab-btn {
      border: none;
      background: none;
      font-size: 12.5px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 6px;
      color: #64748b;
      cursor: pointer;
      transition: all 0.15s;
    }
    .fund-tab-btn.active {
      background: #3b82f6;
      color: #ffffff;
      box-shadow: 0 2px 4px rgba(59,130,246,0.3);
    }
    .fund-tab-btn .badge {
      font-size: 10px;
      margin-left: 4px;
      vertical-align: middle;
    }
    .fund-search-box {
      position: relative;
      min-width: 240px;
    }
    .fund-search-box input {
      height: 34px;
      font-size: 12.5px;
      padding-left: 30px;
      border-radius: 6px;
      border-color: #cbd5e1;
    }
    .fund-search-box i {
      position: absolute;
      left: 10px;
      top: 10px;
      color: #94a3b8;
      font-size: 13px;
    }
    .table-fund thead th {
      background: #1e293b;
      color: #ffffff;
      border-color: #334155;
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 8px 10px;
      white-space: nowrap;
      vertical-align: middle;
    }
    .table-fund td {
      vertical-align: middle;
      font-size: 12.5px;
      padding: 8px 10px;
      border-color: #e2e8f0;
    }
    .table-fund tbody tr:hover {
      background-color: #f1f5f9;
    }
    @media (max-width: 992px) {
      .fund-kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 576px) {
      .fund-kpi-grid { grid-template-columns: 1fr; }
      .fund-filter-bar { flex-direction: column; align-items: stretch; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${renderAdminNavigation('/admin/payment/fund-request')}
      <main class="main-content">
        <div class="container-fluid px-2">
          
          <!-- Header Bar -->
          <div class="d-flex align-items-center justify-content-between mb-3 mt-1">
            <div>
              <h4 class="page-title mb-0" style="font-weight:800;color:#1e293b;">
                <i class="fa fa-money text-success mr-2"></i>Fund Request Management
              </h4>
              <p class="text-muted small mb-0">Approve or reject wallet topup deposits submitted by buyers and sellers.</p>
            </div>
            <div class="d-flex align-items-center gap-2">
              <button id="refresh-requests" class="btn btn-sm btn-outline-primary shadow-sm" type="button">
                <i class="fa fa-refresh mr-1"></i> Refresh Requests
              </button>
            </div>
          </div>

          <!-- 4 KPI Metrics Summary Cards -->
          <div class="fund-kpi-grid">
            <!-- Pending Requests -->
            <div class="fund-kpi-card" style="border-left: 4px solid #f59e0b;">
              <div>
                <div class="fund-kpi-label text-warning">Pending Approval</div>
                <div class="fund-kpi-val text-warning">${pendingCount}</div>
                <div class="fund-kpi-sub">₹${formatMinorUnits(pendingAmountMinor)}</div>
              </div>
              <div class="fund-kpi-icon" style="background: #fef3c7; color: #d97706;">
                <i class="fa fa-clock-o"></i>
              </div>
            </div>

            <!-- Approved Requests -->
            <div class="fund-kpi-card" style="border-left: 4px solid #10b981;">
              <div>
                <div class="fund-kpi-label text-success">Approved Requests</div>
                <div class="fund-kpi-val text-success">${approvedCount}</div>
                <div class="fund-kpi-sub">₹${formatMinorUnits(approvedAmountMinor)}</div>
              </div>
              <div class="fund-kpi-icon" style="background: #d1fae5; color: #059669;">
                <i class="fa fa-check-circle"></i>
              </div>
            </div>

            <!-- Rejected Requests -->
            <div class="fund-kpi-card" style="border-left: 4px solid #ef4444;">
              <div>
                <div class="fund-kpi-label text-danger">Rejected Requests</div>
                <div class="fund-kpi-val text-danger">${rejectedCount}</div>
                <div class="fund-kpi-sub">₹${formatMinorUnits(rejectedAmountMinor)}</div>
              </div>
              <div class="fund-kpi-icon" style="background: #fee2e2; color: #dc2626;">
                <i class="fa fa-times-circle"></i>
              </div>
            </div>

            <!-- Total Requests Volume -->
            <div class="fund-kpi-card" style="border-left: 4px solid #3b82f6;">
              <div>
                <div class="fund-kpi-label text-primary">Total Volume</div>
                <div class="fund-kpi-val text-primary">${totalCount}</div>
                <div class="fund-kpi-sub">₹${formatMinorUnits(totalAmountMinor)}</div>
              </div>
              <div class="fund-kpi-icon" style="background: #dbeafe; color: #2563eb;">
                <i class="fa fa-inr"></i>
              </div>
            </div>
          </div>

          <!-- Alert / Status message -->
          <div id="fund-message" role="status" aria-live="polite"></div>

          <!-- Main Table Card with Filter Tabs -->
          <section class="card shadow-sm border-0 mb-4" style="border-radius:10px;overflow:hidden;">
            <div class="card-header bg-white border-bottom py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div class="d-flex align-items-center gap-1">
                <button type="button" class="fund-tab-btn active" data-filter-status="all">
                  All Requests <span class="badge badge-secondary">${totalCount}</span>
                </button>
                <button type="button" class="fund-tab-btn" data-filter-status="pending">
                  Pending <span class="badge badge-warning text-dark">${pendingCount}</span>
                </button>
                <button type="button" class="fund-tab-btn" data-filter-status="approved">
                  Approved <span class="badge badge-success">${approvedCount}</span>
                </button>
                <button type="button" class="fund-tab-btn" data-filter-status="rejected">
                  Rejected <span class="badge badge-danger">${rejectedCount}</span>
                </button>
              </div>

              <div class="d-flex align-items-center gap-2">
                <div class="fund-search-box">
                  <i class="fa fa-search"></i>
                  <input type="text" id="fundTableSearch" class="form-control" placeholder="Quick search user, bank, TxID...">
                </div>
                <select id="fundModeFilter" class="form-control form-control-sm" style="width: auto; height: 34px;">
                  <option value="">All Modes</option>
                  <option value="UPI">UPI</option>
                  <option value="IMPS">IMPS</option>
                  <option value="NEFT">NEFT</option>
                  <option value="RTGS">RTGS</option>
                  <option value="CASH">Cash</option>
                </select>
                <select id="fundWalletFilter" class="form-control form-control-sm" style="width: auto; height: 34px;">
                  <option value="">All Wallets</option>
                  <option value="buyer">Buyer</option>
                  <option value="seller">Seller</option>
                </select>
              </div>
            </div>

            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-bordered table-striped table-hover table-fund mb-0" id="fundRequestsTable">
                  <thead>
                    <tr>
                      <th class="text-center" style="width: 40px;">#</th>
                      <th>User Details</th>
                      <th>Deposited In Bank</th>
                      <th class="text-right">Amount</th>
                      <th>Payment Mode</th>
                      <th>Wallet</th>
                      <th>Depositor Account</th>
                      <th>Transaction ID / UTR</th>
                      <th class="text-center">Proof Slip</th>
                      <th>Requested At</th>
                      <th>Action / Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows || '<tr><td colspan="11" class="text-center py-4 text-muted"><i class="fa fa-inbox fa-2x mb-2 d-block"></i>No wallet fund requests found.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
  <script src="/auth-client.js"></script>
  <script>
    document.getElementById('refresh-requests').addEventListener('click', () => location.reload());

    // 1-Click Copy helper
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-copy');
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          const original = btn.innerHTML;
          btn.innerHTML = '<i class="fa fa-check text-success"></i>';
          setTimeout(() => { btn.innerHTML = original; }, 1500);
        }).catch(() => {});
      });
    });

    // Client-side instant filtering (Status tab, Mode, Wallet, Search)
    const tableRows = document.querySelectorAll('.fund-row');
    let currentStatus = 'all';

    function filterFundRows() {
      const query = (document.getElementById('fundTableSearch').value || '').trim().toLowerCase();
      const mode = (document.getElementById('fundModeFilter').value || '').toLowerCase();
      const wallet = (document.getElementById('fundWalletFilter').value || '').toLowerCase();

      tableRows.forEach(row => {
        const rowStatus = (row.getAttribute('data-status') || '').toLowerCase();
        const rowMode = (row.getAttribute('data-mode') || '').toLowerCase();
        const rowWallet = (row.getAttribute('data-wallet') || '').toLowerCase();
        const rowSearch = row.getAttribute('data-search') || '';

        let match = true;
        if (currentStatus !== 'all' && rowStatus !== currentStatus) match = false;
        if (mode && !rowMode.includes(mode)) match = false;
        if (wallet && rowWallet !== wallet) match = false;
        if (query && !rowSearch.includes(query)) match = false;

        row.style.display = match ? '' : 'none';
      });
    }

    document.querySelectorAll('.fund-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fund-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentStatus = btn.getAttribute('data-filter-status') || 'all';
        filterFundRows();
      });
    });

    document.getElementById('fundTableSearch').addEventListener('input', filterFundRows);
    document.getElementById('fundModeFilter').addEventListener('change', filterFundRows);
    document.getElementById('fundWalletFilter').addEventListener('change', filterFundRows);

    // Approve / Reject actions
    document.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', async () => {
        const action = button.dataset.action;
        let note = '';
        if (action === 'reject') {
          note = prompt('Rejection reason / note for user:');
          if (note === null) return;
        } else {
          if (!confirm('Are you sure you want to approve this fund request and credit the wallet balance?')) {
            return;
          }
        }
        button.disabled = true;
        try {
          const response = await fetch('/api/admin/fund-requests/' + button.dataset.id + '/decision', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action, note }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'Action could not be completed.');
          location.reload();
        } catch (error) {
          const msgEl = document.getElementById('fund-message');
          msgEl.className = 'alert alert-danger';
          msgEl.textContent = error.message;
          button.disabled = false;
        }
      });
    });
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
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/payment/fund-request' }));
  }

  return { sendAdminFundRequestsPage };
};
