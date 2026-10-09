'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const { getWalletMode, getSellerAvailableBalances } = require('../lib/wallet-helper');

module.exports = function createUserWalletExchangePage({
  db,
  formatMinorUnits,
  sendJson,
  httpError,
}) {
  /**
   * Helper: format rupees
   */
  function formatRupees(minorValue) {
    const minor = BigInt(minorValue || 0);
    return `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;
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

  /**
   * Render User Wallet Exchange Page
   */
  async function sendUserWalletExchangePage(user, response) {
    const balanceData = await getSellerAvailableBalances(db, user.id);
    const walletMode = balanceData.walletMode;
    const isSeparate = (walletMode === 'separate');

    const buyerBal = balanceData.formatted.buyerBalance;
    const sellerTotalBal = balanceData.formatted.sellerBalance;
    const availableExchangeBal = balanceData.formatted.availableForExchange;
    const availableExchangeMinor = balanceData.availableForExchangeMinor;
    const heldExchangeBal = balanceData.formatted.heldForExchange;
    const activeLienBal = balanceData.formatted.activeLien;
    const heldExchangeMinor = balanceData.heldForExchangeMinor;
    const activeLienMinor = balanceData.activeLienMinor;
    const totalBal = balanceData.formatted.totalBalance;

    // Fetch exchange history
    let historyRows = [];
    try {
      const histRes = await db.query(
        `SELECT id, amount_minor, from_wallet, to_wallet,
                prev_seller_minor, prev_buyer_minor, new_seller_minor, new_buyer_minor,
                remark, created_at
         FROM wallet_exchange_transfers
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [user.id]
      );
      historyRows = histRes.rows;
    } catch (_) {
      historyRows = [];
    }

    const navigation = renderUserNavigation(walletMode).replace(
      'horizontal-mainwrapper container clearfix',
      'horizontal-mainwrapper container-fluid px-2 clearfix'
    );

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Exchange Wallet Balance - User Panel</title>
  <link rel="icon" type="image/x-icon" href="/api/favicon">
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/plugins/web-fonts/icons.css">
  <link rel="stylesheet" href="/assets/plugins/web-fonts/font-awesome/font-awesome.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 16px 20px 50px; }
    .wallet-card {
      border-radius: 14px;
      padding: 22px;
      color: #fff;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
      position: relative;
      overflow: hidden;
      height: 100%;
    }
    .wallet-card-seller {
      background: linear-gradient(135deg, #4338ca 0%, #6366f1 100%);
    }
    .wallet-card-buyer {
      background: linear-gradient(135deg, #047857 0%, #10b981 100%);
    }
    .wallet-card-icon {
      position: absolute;
      right: -10px;
      bottom: -15px;
      font-size: 85px;
      opacity: 0.15;
    }
    .exchange-arrow-box {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
    }
    .exchange-arrow-circle {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4f46e5;
      font-size: 20px;
      border: 2px solid #e2e8f0;
    }
    .quick-amount-btn {
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .quick-amount-btn:hover {
      background: #4f46e5;
      color: #fff;
      border-color: #4f46e5;
    }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    ${navigation}

    <div class="page-container">
      <!-- Breadcrumb & Header -->
      <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 class="font-weight-bold text-dark mb-1 d-flex align-items-center gap-2">
            <i class="fa fa-arrows-rotate text-primary mr-2"></i> Exchange Wallet Balance
          </h2>
          <p class="text-muted mb-0 small">
            Instantly transfer your seller earnings to your buyer wallet for recharge purchases.
          </p>
        </div>
        <div>
          <a href="/report/account-statement" class="btn btn-outline-secondary btn-sm font-weight-bold">
            <i class="fa fa-file-lines mr-1"></i> Account Statement
          </a>
          <a href="/fund/statement" class="btn btn-outline-primary btn-sm font-weight-bold ml-1">
            <i class="fa fa-list mr-1"></i> Fund Statement
          </a>
        </div>
      </div>

      ${!isSeparate ? `
        <!-- Single Wallet Warning -->
        <div class="alert alert-warning border-0 shadow-sm p-4 text-center rounded-3">
          <div class="mb-3">
            <i class="fa fa-triangle-exclamation text-warning" style="font-size: 48px;"></i>
          </div>
          <h4 class="font-weight-bold text-dark">Single Wallet Mode is Currently Active</h4>
          <p class="text-muted mb-3">
            The administrator has currently enabled <strong>Single Unified Wallet</strong> mode. All transactions (purchases and sales) operate from a single main wallet.<br>
            The wallet exchange feature is only active when the administrator selects <strong>Separate Dual Wallet</strong> mode.
          </p>
          <a href="/dashboard" class="btn btn-primary font-weight-bold px-4">
            <i class="fa fa-home mr-1"></i> Back to Dashboard
          </a>
        </div>
      ` : `
        <!-- Dual Wallet Overview Cards -->
        <div class="row mb-4 align-items-center">
          <div class="col-md-5 mb-3 mb-md-0">
            <div class="wallet-card wallet-card-seller">
              <i class="fa fa-line-chart wallet-card-icon"></i>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge badge-light text-primary font-weight-bold text-uppercase px-2 py-1">
                  <i class="fa fa-arrow-up-from-bracket mr-1"></i> Source
                </span>
                <span class="small font-weight-bold" style="opacity: 0.9;">Available for Transfer</span>
              </div>
              <div class="small text-uppercase font-weight-bold" style="letter-spacing: 0.5px; opacity: 0.9;">
                Seller Wallet
              </div>
              <h1 class="display-5 font-weight-bold my-2" id="sellerBalDisplay">₹${availableExchangeBal}</h1>
              ${heldExchangeMinor > 0n || activeLienMinor > 0n ? `
                <div class="mt-1 small" style="opacity: 0.95;">
                  <div>Total Seller Balance: <strong>₹${sellerTotalBal}</strong></div>
                  ${heldExchangeMinor > 0n ? `<span class="badge badge-warning text-dark mr-1" style="font-size:11px;"><i class="fa fa-clock-o"></i> Sales Hold (${balanceData.policy.sellerSaleExchangeHoldMinutes}m): ₹${heldExchangeBal}</span>` : ''}
                  ${activeLienMinor > 0n ? `<span class="badge badge-danger" style="font-size:11px;"><i class="fa fa-lock"></i> Dispute Lien: ₹${activeLienBal}</span>` : ''}
                </div>
              ` : `
                <div class="small" style="opacity: 0.9;">
                  <i class="fa fa-info-circle mr-1"></i> Recharge sales and LAPU earnings (100% available)
                </div>
              `}
            </div>
          </div>

          <div class="col-md-2 text-center mb-3 mb-md-0 exchange-arrow-box">
            <div class="exchange-arrow-circle" title="One-way Transfer: Seller to Buyer">
              <i class="fa fa-arrow-right"></i>
            </div>
          </div>

          <div class="col-md-5">
            <div class="wallet-card wallet-card-buyer">
              <i class="fa fa-shopping-cart wallet-card-icon"></i>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge badge-light text-success font-weight-bold text-uppercase px-2 py-1">
                  <i class="fa fa-arrow-down-to-bracket mr-1"></i> Destination
                </span>
                <span class="small font-weight-bold" style="opacity: 0.9;">For Recharge Purchases</span>
              </div>
              <div class="small text-uppercase font-weight-bold" style="letter-spacing: 0.5px; opacity: 0.9;">
                Buyer Wallet
              </div>
              <h1 class="display-5 font-weight-bold my-2" id="buyerBalDisplay">₹${buyerBal}</h1>
              <div class="small" style="opacity: 0.9;">
                <i class="fa fa-info-circle mr-1"></i> Recharge purchases and API order balance
              </div>
            </div>
          </div>
        </div>

        <!-- Transfer Form Card -->
        <div class="row mb-4">
          <div class="col-lg-7 col-md-12 mb-4 mb-lg-0">
            <div class="card shadow-sm border-0 rounded-3">
              <div class="card-header bg-white border-bottom py-3">
                <h5 class="card-title mb-0 font-weight-bold text-dark d-flex align-items-center">
                  <i class="fa fa-arrow-right-arrow-left text-primary mr-2"></i> Transfer Seller Balance to Buyer Wallet
                </h5>
              </div>
              <div class="card-body p-4">
                <div id="transferAlert" class="alert alert-success d-none font-weight-bold"></div>
                <div id="transferError" class="alert alert-danger d-none font-weight-bold"></div>

                <form id="walletExchangeForm" onsubmit="handleExchangeSubmit(event)">
                  <!-- From & To displays -->
                  <div class="row mb-3">
                    <div class="col-sm-6 mb-2 mb-sm-0">
                      <label class="font-weight-bold small text-muted text-uppercase">From Wallet (Deducted From)</label>
                      <div class="p-2 px-3 border rounded bg-light font-weight-bold text-indigo d-flex align-items-center justify-content-between">
                        <span><i class="fa fa-line-chart mr-1 text-primary"></i> Seller Wallet</span>
                        <span class="badge badge-primary">₹${sellerBal}</span>
                      </div>
                    </div>
                    <div class="col-sm-6">
                      <label class="font-weight-bold small text-muted text-uppercase">To Wallet (Credited To)</label>
                      <div class="p-2 px-3 border rounded bg-light font-weight-bold text-success d-flex align-items-center justify-content-between">
                        <span><i class="fa fa-shopping-cart mr-1 text-success"></i> Buyer Wallet</span>
                        <span class="badge badge-success">₹${buyerBal}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Amount input -->
                  <div class="form-group mb-3">
                    <label class="font-weight-bold text-dark">
                      Transfer Amount (₹) <span class="text-danger">*</span>
                    </label>
                    <div class="input-group input-group-lg">
                      <div class="input-group-prepend">
                        <span class="input-group-text font-weight-bold bg-white text-dark">₹</span>
                      </div>
                      <input type="number" step="0.01" min="1" max="${(Number(sellerMinor) / 100).toFixed(2)}"
                             class="form-control font-weight-bold text-primary" id="transferAmount" name="amount"
                             placeholder="Enter amount to transfer (e.g. 500.00)" required>
                    </div>
                    <small class="form-text text-muted">
                      Maximum available seller balance: <strong>₹${sellerBal}</strong>
                    </small>
                  </div>

                  <!-- Quick Amount Shortcuts -->
                  <div class="mb-4">
                    <label class="small text-muted font-weight-bold d-block mb-2">QUICK AMOUNT SHORTCUTS:</label>
                    <div class="d-flex flex-wrap gap-2" style="gap: 8px;">
                      <button type="button" class="quick-amount-btn" onclick="setTransferAmount(100)">+ ₹100</button>
                      <button type="button" class="quick-amount-btn" onclick="setTransferAmount(500)">+ ₹500</button>
                      <button type="button" class="quick-amount-btn" onclick="setTransferAmount(1000)">+ ₹1,000</button>
                      <button type="button" class="quick-amount-btn" onclick="setTransferAmount(2000)">+ ₹2,000</button>
                      <button type="button" class="quick-amount-btn" onclick="setTransferAmount(5000)">+ ₹5,000</button>
                      <button type="button" class="quick-amount-btn bg-indigo text-white" style="background:#4338ca;border-color:#4338ca;" onclick="setTransferAll()">Transfer Full Balance</button>
                    </div>
                  </div>

                  <!-- Remarks / Note (Optional) -->
                  <div class="form-group mb-4">
                    <label class="font-weight-bold small text-muted">Remark / Note (Optional)</label>
                    <input type="text" class="form-control" id="transferRemark" name="remark" placeholder="e.g. For daytime mobile recharges" maxlength="150">
                  </div>

                  <!-- Security / Rule notice -->
                  <div class="alert alert-light border small text-muted mb-4">
                    <i class="fa fa-shield-alt text-primary mr-1"></i>
                    <strong>Important Rule:</strong> Transfers are strictly from <strong>Seller Wallet to Buyer Wallet</strong> (Buyer to Seller transfers are not supported). 
                    Transferred funds are credited to your Buyer Wallet immediately upon confirmation.
                  </div>

                  <button type="submit" id="btnSubmitTransfer" class="btn btn-primary btn-lg btn-block font-weight-bold shadow-sm">
                    <i class="fa fa-paper-plane mr-2"></i> Confirm &amp; Transfer to Buyer Wallet
                  </button>
                </form>
              </div>
            </div>
          </div>

          <!-- Rules & Info Side Card -->
          <div class="col-lg-5 col-md-12">
            <div class="card shadow-sm border-0 rounded-3 mb-4">
              <div class="card-header bg-white border-bottom py-3">
                <h5 class="card-title mb-0 font-weight-bold text-dark">
                  <i class="fa fa-circle-question text-info mr-2"></i> Wallet Exchange Guide
                </h5>
              </div>
              <div class="card-body p-4">
                <div class="d-flex align-items-start mb-3">
                  <div class="badge badge-primary rounded-circle p-2 mr-3" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">1</div>
                  <div>
                    <h6 class="font-weight-bold mb-1 text-dark">One-Way Transfer Only</h6>
                    <p class="text-muted small mb-0">Balance can only be transferred from Seller Wallet to Buyer Wallet. Buyer to Seller transfers are not allowed.</p>
                  </div>
                </div>

                <div class="d-flex align-items-start mb-3">
                  <div class="badge badge-success rounded-circle p-2 mr-3" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">2</div>
                  <div>
                    <h6 class="font-weight-bold mb-1 text-dark">Available Balance Limit</h6>
                    <p class="text-muted small mb-0">You can only transfer up to the available balance currently unheld in your Seller Wallet.</p>
                  </div>
                </div>

                <div class="d-flex align-items-start mb-3">
                  <div class="badge badge-warning rounded-circle p-2 mr-3 text-dark" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">3</div>
                  <div>
                    <h6 class="font-weight-bold mb-1 text-dark">Instant Credit</h6>
                    <p class="text-muted small mb-0">Once confirmed, the balance is instantly credited to your Buyer Wallet and ready for recharges.</p>
                  </div>
                </div>

                <div class="d-flex align-items-start">
                  <div class="badge badge-info rounded-circle p-2 mr-3" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">4</div>
                  <div>
                    <h6 class="font-weight-bold mb-1 text-dark">Full Ledger Audit Trail</h6>
                    <p class="text-muted small mb-0">Every transfer is recorded with dual entries in your account statement and transfer history below.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Transfer History Table -->
        <div class="card shadow-sm border-0 rounded-3">
          <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
            <h5 class="card-title mb-0 font-weight-bold text-dark">
              <i class="fa fa-clock-rotate-left text-primary mr-2"></i> Recent Wallet Exchange History
            </h5>
            <span class="badge badge-light border text-muted">${historyRows.length} Records</span>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-striped table-hover mb-0">
                <thead class="bg-light">
                  <tr>
                    <th>Date &amp; Time (IST)</th>
                    <th class="text-center">Direction</th>
                    <th class="text-right">Transferred Amount</th>
                    <th>Seller Wallet (Before &rarr; After)</th>
                    <th>Buyer Wallet (Before &rarr; After)</th>
                    <th>Remark</th>
                    <th class="text-center">Status</th>
                  </tr>
                </thead>
                <tbody id="exchangeHistoryBody">
                  ${historyRows.length === 0 ? `
                    <tr>
                      <td colspan="7" class="text-center py-4 text-muted">
                        <i class="fa fa-folder-open-empty mr-1"></i> No wallet exchange transfers recorded yet.
                      </td>
                    </tr>
                  ` : historyRows.map((r) => `
                    <tr>
                      <td class="font-weight-bold small text-dark">${formatDateTime(r.created_at)}</td>
                      <td class="text-center font-weight-bold">
                        <span class="badge badge-primary px-2 py-1"><i class="fa fa-arrow-right mr-1"></i> Seller &rarr; Buyer</span>
                      </td>
                      <td class="text-right font-weight-bold text-success font-monospace" style="font-size: 15px;">
                        ₹${formatRupees(r.amount_minor)}
                      </td>
                      <td class="small font-monospace">
                        <span class="text-muted">₹${formatRupees(r.prev_seller_minor)}</span>
                        <i class="fa fa-arrow-right text-muted mx-1"></i>
                        <strong class="text-danger">₹${formatRupees(r.new_seller_minor)}</strong>
                      </td>
                      <td class="small font-monospace">
                        <span class="text-muted">₹${formatRupees(r.prev_buyer_minor)}</span>
                        <i class="fa fa-arrow-right text-muted mx-1"></i>
                        <strong class="text-success">₹${formatRupees(r.new_buyer_minor)}</strong>
                      </td>
                      <td class="small text-muted">${escapeHtml(r.remark || 'Wallet Exchange Transfer')}</td>
                      <td class="text-center">
                        <span class="badge badge-success px-2"><i class="fa fa-check mr-1"></i> Completed</span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `}
    </div>
  </div>
</div>

<script src="/assets/plugins/jquery/jquery.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script>
  var maxSellerRupees = parseFloat("${(Number(availableExchangeMinor) / 100).toFixed(2)}") || 0;

  function setTransferAmount(amt) {
    if (amt > maxSellerRupees) amt = maxSellerRupees;
    document.getElementById('transferAmount').value = amt.toFixed(2);
  }

  function setTransferAll() {
    document.getElementById('transferAmount').value = maxSellerRupees.toFixed(2);
  }

  async function handleExchangeSubmit(e) {
    e.preventDefault();
    var amtInput = document.getElementById('transferAmount');
    var amount = parseFloat(amtInput.value);
    var remark = document.getElementById('transferRemark').value.trim();

    var alertEl = document.getElementById('transferAlert');
    var errorEl = document.getElementById('transferError');
    var btn = document.getElementById('btnSubmitTransfer');

    alertEl.classList.add('d-none');
    errorEl.classList.add('d-none');

    if (isNaN(amount) || amount <= 0) {
      errorEl.textContent = 'Please enter a valid amount (₹).';
      errorEl.classList.remove('d-none');
      return;
    }

    if (amount > maxSellerRupees) {
      errorEl.textContent = 'Transfer amount cannot exceed your available seller balance (₹' + maxSellerRupees.toFixed(2) + ').';
      errorEl.classList.remove('d-none');
      return;
    }

    if (!confirm('Are you sure you want to transfer ₹' + amount.toFixed(2) + ' from Seller Wallet to your Buyer Wallet?')) {
      return;
    }

    var originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>Processing Transfer...';

    try {
      var res = await fetch('/api/user/wallet/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount,
          fromWallet: 'seller',
          toWallet: 'buyer',
          remark: remark
        })
      });

      var data = await res.json();
      if (!res.ok || !data.ok) {
        errorEl.textContent = data.message || 'Transfer failed. Please try again.';
        errorEl.classList.remove('d-none');
        btn.disabled = false;
        btn.innerHTML = originalText;
        return;
      }

      alertEl.innerHTML = '<i class="fa fa-check-circle mr-1"></i> ' + (data.message || '₹' + amount.toFixed(2) + ' transferred successfully!');
      alertEl.classList.remove('d-none');
      amtInput.value = '';

      // Reload page to refresh all header strips and balances
      setTimeout(function() {
        window.location.reload();
      }, 1200);
    } catch (err) {
      errorEl.textContent = 'Network error: ' + err.message;
      errorEl.classList.remove('d-none');
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
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
    });
    response.end(await addPanelChrome(html, { role: 'user', userId: user.id, db, currentPath: '/account/wallet-exchange' }));
  }

  /**
   * API Handler: POST /api/user/wallet/exchange
   */
  async function handleUserWalletExchange(request, response, user) {
    if (!user || user.role !== 'user') {
      throw httpError('Unauthorized user access required.', 401);
    }

    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 10000) throw httpError('Payload too large', 413);
    }

    let payload = {};
    try {
      payload = JSON.parse(body);
    } catch (_) {
      throw httpError('Invalid JSON format.', 400);
    }

    const amount = Number(payload.amount);
    const fromWallet = String(payload.fromWallet || 'seller').trim().toLowerCase();
    const toWallet = String(payload.toWallet || 'buyer').trim().toLowerCase();
    const remark = String(payload.remark || '').trim().slice(0, 150);

    // Strictly enforce Seller -> Buyer only
    if (fromWallet !== 'seller' || toWallet !== 'buyer') {
      throw httpError('Transfers are only allowed from Seller Wallet to Buyer Wallet (Buyer to Seller not allowed).', 400);
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw httpError('Valid positive amount required.', 400);
    }

    const amountMinor = BigInt(Math.round(amount * 100));
    if (amountMinor <= 0n) {
      throw httpError('Amount must be at least ₹0.01.', 400);
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const walletMode = await getWalletMode(client);
      if (walletMode !== 'separate') {
        throw httpError('Wallet exchange is only available in Separate Dual Wallet mode.', 400);
      }

      // Lock user's wallet
      const walletRes = await client.query(
        "SELECT id, balance_minor, buyer_balance_minor, seller_balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR' FOR UPDATE",
        [user.id]
      );

      if (!walletRes.rowCount) {
        throw httpError('User wallet account not found.', 404);
      }

      const wallet = walletRes.rows[0];
      const prevSellerMinor = BigInt(wallet.seller_balance_minor || 0);
      const prevBuyerMinor = BigInt(wallet.buyer_balance_minor || 0);

      // Check available seller balance taking holding delay and active liens into account
      const balanceData = await getSellerAvailableBalances(client, user.id);
      if (amountMinor > balanceData.availableForExchangeMinor) {
        let msg = `Insufficient exchangeable balance. Available exchange balance: ₹${balanceData.formatted.availableForExchange}.`;
        if (balanceData.heldForExchangeMinor > 0n) {
          msg += ` (Recent sales hold: ₹${balanceData.formatted.heldForExchange} - Policy: ${balanceData.policy.sellerSaleExchangeHoldMinutes} minutes hold)`;
        }
        if (balanceData.activeLienMinor > 0n) {
          msg += ` (Active dispute lien hold: ₹${balanceData.formatted.activeLien})`;
        }
        throw httpError(msg, 400);
      }

      const newSellerMinor = prevSellerMinor - amountMinor;
      const newBuyerMinor = prevBuyerMinor + amountMinor;

      // Update wallet atomically
      await client.query(
        `UPDATE wallets
         SET seller_balance_minor = $1,
             buyer_balance_minor = $2,
             updated_at = now()
         WHERE id = $3`,
        [newSellerMinor, newBuyerMinor, wallet.id]
      );

      // Record transfer in wallet_exchange_transfers audit table
      await client.query(`
        CREATE TABLE IF NOT EXISTS wallet_exchange_transfers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
          from_wallet TEXT NOT NULL DEFAULT 'seller',
          to_wallet TEXT NOT NULL DEFAULT 'buyer',
          prev_seller_minor BIGINT NOT NULL,
          prev_buyer_minor BIGINT NOT NULL,
          new_seller_minor BIGINT NOT NULL,
          new_buyer_minor BIGINT NOT NULL,
          remark TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      const xferRes = await client.query(
        `INSERT INTO wallet_exchange_transfers (
           user_id, amount_minor, from_wallet, to_wallet,
           prev_seller_minor, prev_buyer_minor, new_seller_minor, new_buyer_minor,
           remark
         ) VALUES ($1, $2, 'seller', 'buyer', $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [user.id, amountMinor, prevSellerMinor, prevBuyerMinor, newSellerMinor, newBuyerMinor, remark || 'Seller to Buyer Wallet Exchange']
      );

      const transferId = xferRes.rows[0].id;

      // Add double-entry debit & credit to wallet_entries ledger
      const debitKey = `xfer_deb_${transferId}`;
      const creditKey = `xfer_cred_${transferId}`;

      await client.query(
        `INSERT INTO wallet_entries (wallet_id, user_id, amount_minor, entry_type, reference_type, reference_id, idempotency_key, description)
         VALUES ($1, $2, $3, 'debit', 'wallet_exchange', $4, $5, $6)
         ON CONFLICT (wallet_id, idempotency_key) DO NOTHING`,
        [wallet.id, user.id, amountMinor, transferId, debitKey, `Exchange Debit from Seller: ₹${formatRupees(amountMinor)}`]
      );

      await client.query(
        `INSERT INTO wallet_entries (wallet_id, user_id, amount_minor, entry_type, reference_type, reference_id, idempotency_key, description)
         VALUES ($1, $2, $3, 'credit', 'wallet_exchange', $4, $5, $6)
         ON CONFLICT (wallet_id, idempotency_key) DO NOTHING`,
        [wallet.id, user.id, amountMinor, transferId, creditKey, `Exchange Credit to Buyer: ₹${formatRupees(amountMinor)}`]
      );

      await client.query('COMMIT');

      sendJson(response, 200, {
        ok: true,
        message: `₹${formatRupees(amountMinor)} successfully transferred from Seller Wallet to Buyer Wallet.`,
        transferredAmount: formatRupees(amountMinor),
        newBuyerBalance: formatRupees(newBuyerMinor),
        newSellerBalance: formatRupees(newSellerMinor),
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    sendUserWalletExchangePage,
    handleUserWalletExchange,
  };
};
