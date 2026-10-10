'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const { getSellerAvailableBalances } = require('../lib/wallet-helper');

module.exports = function createPageModule({ db, adminUiRoot }) {
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

  async function sendUserDashboard(user, response) {
    // 1. Fetch wallet balances and policies (Single vs Separate, Lean Balance)
    const balanceData = await getSellerAvailableBalances(db, user.id);
    const walletMode = balanceData.walletMode || 'single';
    const isSeparate = (walletMode === 'separate');

    const totalBal = balanceData.formatted.totalBalance;
    const buyerBal = balanceData.formatted.buyerBalance;
    const sellerBal = balanceData.formatted.sellerBalance;
    const activeLien = balanceData.formatted.activeLien;
    const activeLienMinor = balanceData.activeLienMinor;
    const heldExchangeBal = balanceData.formatted.heldForExchange;
    const heldExchangeMinor = balanceData.heldForExchangeMinor;
    const availableRedeem = balanceData.formatted.availableForRedeem;
    const availableExchange = balanceData.formatted.availableForExchange;

    // Available usable balance in single wallet mode = Total - Lien
    const totalMinor = BigInt(balanceData.totalBalanceMinor || 0);
    const usableSingleMinor = totalMinor > activeLienMinor ? totalMinor - activeLienMinor : 0n;
    const usableSingleRupees = formatRupees(usableSingleMinor);

    // 2. Fetch news ticker text from website_settings
    let newsTickerText = 'Welcome to Exchange Recharge & LAPU Trading Platform! Fast execution, automated LAPU stock swapping, and 24x7 real-time settlement. Keep your wallet balance updated for uninterrupted recharge transactions.';
    try {
      const wsRes = await db.query('SELECT news_ticker, website_name FROM website_settings WHERE id = 1 LIMIT 1');
      if (wsRes.rows[0] && wsRes.rows[0].news_ticker && wsRes.rows[0].news_ticker.trim()) {
        newsTickerText = wsRes.rows[0].news_ticker.trim();
      }
    } catch (_) {}

    // 3. Fetch KPI metrics in parallel (Today Purchase, Today Sales, Today Disputes, Pending Orders)
    const [
      todayPurchaseRes,
      todaySalesRes,
      todayPurchaseDisputeRes,
      todaySalesDisputeRes,
      pendingPurchaseRes,
      pendingSalesRes,
      recentTxnsRes,
    ] = await Promise.all([
      // A. Today Purchases (Buyer: user_id = user.id)
      db.query(`
        SELECT
          COUNT(*) AS total_count,
          COALESCE(SUM(amount_minor), 0) AS total_val,
          COUNT(*) FILTER (WHERE status = 'successful') AS success_count,
          COALESCE(SUM(amount_minor) FILTER (WHERE status = 'successful'), 0) AS success_val
        FROM recharge_orders
        WHERE user_id = $1
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
      `, [user.id]).catch(() => ({ rows: [{}] })),

      // B. Today Sales (Seller: seller_user_id = user.id)
      db.query(`
        SELECT
          COUNT(*) AS total_count,
          COALESCE(SUM(amount_minor), 0) AS total_val,
          COUNT(*) FILTER (WHERE status = 'successful') AS success_count,
          COALESCE(SUM(amount_minor) FILTER (WHERE status = 'successful'), 0) AS success_val
        FROM recharge_orders
        WHERE seller_user_id = $1
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
      `, [user.id]).catch(() => ({ rows: [{}] })),

      // C. Today Purchase Dispute (Buyer disputes raised today)
      db.query(`
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(amount_minor), 0) AS val
        FROM recharge_orders
        WHERE user_id = $1
          AND dispute_status IN ('pending', 'accepted', 'rejected')
          AND (COALESCE(dispute_created_at, created_at) AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
      `, [user.id]).catch(() => ({ rows: [{}] })),

      // D. Today Sales Dispute (Seller disputes received today)
      db.query(`
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(amount_minor), 0) AS val
        FROM recharge_orders
        WHERE seller_user_id = $1
          AND dispute_status IN ('pending', 'accepted', 'rejected')
          AND (COALESCE(dispute_created_at, created_at) AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
      `, [user.id]).catch(() => ({ rows: [{}] })),

      // E. Pending Purchase (Buyer: status in ('pending', 'processing'))
      db.query(`
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(amount_minor), 0) AS val
        FROM recharge_orders
        WHERE user_id = $1
          AND status IN ('pending', 'processing')
      `, [user.id]).catch(() => ({ rows: [{}] })),

      // F. Pending Sales (Seller: status in ('pending', 'processing'))
      db.query(`
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(amount_minor), 0) AS val
        FROM recharge_orders
        WHERE seller_user_id = $1
          AND status IN ('pending', 'processing')
      `, [user.id]).catch(() => ({ rows: [{}] })),

      // G. Recent 6 transactions for this user (Buy or Sell)
      db.query(`
        SELECT r.id, r.mobile_number, r.operator_name, r.circle_name, r.amount_minor,
               r.status, r.provider_reference, r.idempotency_key, r.created_at,
               (CASE WHEN r.user_id = $1 THEN 'Purchase' ELSE 'Sale' END) AS txn_role
        FROM recharge_orders r
        WHERE r.user_id = $1 OR r.seller_user_id = $1
        ORDER BY r.created_at DESC
        LIMIT 6
      `, [user.id]).catch(() => ({ rows: [] })),
    ]);

    // Parse Today Purchase
    const tBuyRow = todayPurchaseRes.rows[0] || {};
    const todayBuyCount = Number(tBuyRow.success_count ?? tBuyRow.total_count ?? 0);
    const todayBuyVal = formatRupees(tBuyRow.success_val ?? tBuyRow.total_val ?? 0);

    // Parse Today Sales
    const tSellRow = todaySalesRes.rows[0] || {};
    const todaySellCount = Number(tSellRow.success_count ?? tSellRow.total_count ?? 0);
    const todaySellVal = formatRupees(tSellRow.success_val ?? tSellRow.total_val ?? 0);

    // Parse Today Purchase Dispute
    const tBuyDispRow = todayPurchaseDisputeRes.rows[0] || {};
    const todayBuyDispCount = Number(tBuyDispRow.count || 0);
    const todayBuyDispVal = formatRupees(tBuyDispRow.val || 0);

    // Parse Today Sales Dispute
    const tSellDispRow = todaySalesDisputeRes.rows[0] || {};
    const todaySellDispCount = Number(tSellDispRow.count || 0);
    const todaySellDispVal = formatRupees(tSellDispRow.val || 0);

    // Parse Pending Purchase
    const pBuyRow = pendingPurchaseRes.rows[0] || {};
    const pendingBuyCount = Number(pBuyRow.count || 0);
    const pendingBuyVal = formatRupees(pBuyRow.val || 0);

    // Parse Pending Sales
    const pSellRow = pendingSalesRes.rows[0] || {};
    const pendingSellCount = Number(pSellRow.count || 0);
    const pendingSellVal = formatRupees(pSellRow.val || 0);

    // Format Recent Transactions rows
    const recentRows = recentTxnsRes.rows || [];
    const recentRowsHtml = recentRows.length > 0
      ? recentRows.map((r) => {
        let statusBadge = '';
        if (r.status === 'successful') {
          statusBadge = '<span class="badge badge-success px-2 py-1"><i class="fa fa-check-circle mr-1"></i> Success</span>';
        } else if (r.status === 'pending' || r.status === 'processing') {
          statusBadge = '<span class="badge badge-warning text-dark px-2 py-1"><i class="fa fa-clock mr-1"></i> Pending</span>';
        } else if (r.status === 'refunded') {
          statusBadge = '<span class="badge badge-info px-2 py-1"><i class="fa fa-undo mr-1"></i> Refunded</span>';
        } else {
          statusBadge = '<span class="badge badge-danger px-2 py-1"><i class="fa fa-times-circle mr-1"></i> Failed</span>';
        }

        const roleBadge = r.txn_role === 'Purchase'
          ? '<span class="badge badge-primary px-2 py-1"><i class="fa fa-cart-shopping mr-1"></i> Purchase</span>'
          : '<span class="badge badge-dark px-2 py-1"><i class="fa fa-chart-line mr-1"></i> Sale</span>';

        return `
          <tr>
            <td class="small text-muted font-monospace">${escapeHtml(formatDateTime(r.created_at))}</td>
            <td>${roleBadge}</td>
            <td class="font-weight-bold text-dark font-monospace">${escapeHtml(r.mobile_number || '-')}</td>
            <td>
              <span class="badge badge-light border text-dark font-weight-bold">${escapeHtml(r.operator_name || 'Operator')}</span>
              <span class="badge badge-light text-muted">${escapeHtml(r.circle_name || 'All')}</span>
            </td>
            <td class="text-right font-weight-bold text-dark font-monospace">₹${formatRupees(r.amount_minor)}</td>
            <td class="text-center">${statusBadge}</td>
            <td class="small text-muted font-monospace">${escapeHtml(r.provider_reference || r.idempotency_key || '-')}</td>
          </tr>
        `;
      }).join('')
      : `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa fa-inbox mb-2 d-block" style="font-size:24px;"></i>No transactions recorded yet today.</td></tr>`;

    // 4. Build Complete Page HTML
    const navigationHtml = renderUserNavigation(walletMode, '/dashboard');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>User Dashboard - Exchange Recharge Platform</title>
  <link rel="icon" type="image/x-icon" href="/api/favicon">
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body {
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1e293b;
    }
    .user-dashboard-container {
      padding: 16px 20px 48px;
    }

    /* Running News Bar directly touching below menu bar */
    .user-news-ticker-strip {
      background: #ffffff;
      border-top: 1px solid #e2e8f0;
      border-bottom: 2px solid #cbd5e1;
      height: 38px;
      line-height: 38px;
      display: flex;
      align-items: center;
      position: relative;
      z-index: 100;
      box-shadow: 0 2px 5px rgba(0,0,0,0.03);
      margin-top: 0;
      margin-bottom: 16px;
      padding: 0 16px;
      overflow: hidden;
    }
    .news-badge {
      display: inline-flex;
      align-items: center;
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
      color: #ffffff;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.5px;
      padding: 2px 10px;
      height: 24px;
      line-height: 20px;
      border-radius: 4px;
      box-shadow: 0 2px 6px rgba(239, 68, 68, 0.35);
      margin-right: 14px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .live-pulse-dot {
      width: 7px;
      height: 7px;
      background-color: #ffffff;
      border-radius: 50%;
      margin-right: 6px;
      display: inline-block;
      animation: pulse-live 1.5s infinite;
    }
    @keyframes pulse-live {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(0.8); }
      100% { opacity: 1; transform: scale(1); }
    }
    .news-marquee-wrapper {
      flex-grow: 1;
      overflow: hidden;
      white-space: nowrap;
      position: relative;
    }
    .news-marquee-content {
      display: inline-block;
      padding-left: 100%;
      animation: tickerMarquee 38s linear infinite;
      font-size: 13px;
      font-weight: 500;
      color: #334155;
    }
    .news-marquee-content:hover {
      animation-play-state: paused;
      cursor: default;
    }
    @keyframes tickerMarquee {
      0% { transform: translate3d(0, 0, 0); }
      100% { transform: translate3d(-100%, 0, 0); }
    }

    /* Top Wallet Cards */
    .top-wallet-card {
      border-radius: 14px;
      padding: 20px 24px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 18px rgba(0,0,0,0.06);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      height: 100%;
      border: 1px solid rgba(226, 232, 240, 0.8);
      background: #ffffff;
    }
    .top-wallet-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 26px rgba(0,0,0,0.1);
    }
    .wallet-card-bg-single {
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      color: #ffffff;
      border: none;
    }
    .wallet-card-bg-buyer {
      background: linear-gradient(135deg, #065f46 0%, #10b981 100%);
      color: #ffffff;
      border: none;
    }
    .wallet-card-bg-seller {
      background: linear-gradient(135deg, #312e81 0%, #6366f1 100%);
      color: #ffffff;
      border: none;
    }
    .wallet-card-bg-lien {
      background: #ffffff;
      border-left: 5px solid #f59e0b;
      color: #1e293b;
    }
    .wallet-card-bg-available {
      background: #ffffff;
      border-left: 5px solid #10b981;
      color: #1e293b;
    }
    .wallet-card-watermark {
      position: absolute;
      right: -10px;
      bottom: -15px;
      font-size: 85px;
      opacity: 0.12;
      pointer-events: none;
    }
    .wallet-amount-lg {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.5px;
      line-height: 1.15;
      margin: 8px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    }

    /* KPI Metric Cards */
    .kpi-stat-card {
      background: #ffffff;
      border-radius: 12px;
      padding: 18px 20px;
      box-shadow: 0 3px 14px rgba(0,0,0,0.04);
      border: 1px solid #e2e8f0;
      position: relative;
      overflow: hidden;
      transition: all 0.2s ease;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .kpi-stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.08);
      border-color: #cbd5e1;
    }
    .kpi-card-today-purchase { border-top: 4px solid #2563eb; }
    .kpi-card-today-sales { border-top: 4px solid #10b981; }
    .kpi-card-today-purchase-disp { border-top: 4px solid #f59e0b; }
    .kpi-card-today-sales-disp { border-top: 4px solid #ef4444; }
    .kpi-card-pending-purchase { border-top: 4px solid #06b6d4; }
    .kpi-card-pending-sales { border-top: 4px solid #8b5cf6; }

    .kpi-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .kpi-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin: 0;
    }
    .kpi-icon-bubble {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .bubble-blue { background: #eff6ff; color: #2563eb; }
    .bubble-green { background: #ecfdf5; color: #10b981; }
    .bubble-amber { background: #fffbeb; color: #f59e0b; }
    .bubble-red { background: #fef2f2; color: #ef4444; }
    .bubble-cyan { background: #ecfeff; color: #06b6d4; }
    .bubble-purple { background: #f5f3ff; color: #8b5cf6; }

    .kpi-body {
      margin-bottom: 12px;
    }
    .kpi-val-number {
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.1;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    }
    .kpi-count-pill {
      font-size: 12px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 20px;
      display: inline-block;
      margin-top: 6px;
    }
    .pill-blue { background: #dbeafe; color: #1e40af; }
    .pill-green { background: #d1fae5; color: #065f46; }
    .pill-amber { background: #fef3c7; color: #92400e; }
    .pill-red { background: #fee2e2; color: #991b1b; }
    .pill-cyan { background: #cffafe; color: #155e75; }
    .pill-purple { background: #ede9fe; color: #5b21b6; }

    .kpi-footer-link {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      text-decoration: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid #f1f5f9;
      padding-top: 10px;
      margin-top: 4px;
      transition: color 0.15s ease;
    }
    .kpi-footer-link:hover {
      color: #2563eb;
      text-decoration: none;
    }

    /* Quick Shortcuts Grid */
    .shortcut-pill-btn {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.2s ease;
      text-decoration: none;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }
    .shortcut-pill-btn:hover {
      background: #2563eb;
      color: #ffffff;
      border-color: #2563eb;
      text-decoration: none;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(37,99,235,0.25);
    }
    .shortcut-pill-btn i {
      font-size: 16px;
    }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    ${navigationHtml}

    <!-- 1. Running Style News Bar touching directly below Menu Bar -->
    <div class="user-news-ticker-strip">
      <div class="news-badge">
        <span class="live-pulse-dot"></span>
        <i class="fa fa-bullhorn mr-1"></i> LIVE NEWS
      </div>
      <div class="news-marquee-wrapper">
        <div class="news-marquee-content">
          ${escapeHtml(newsTickerText)}
        </div>
      </div>
    </div>

    <div class="user-dashboard-container">
      <!-- Welcome Header -->
      <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 class="font-weight-bold text-dark mb-1">
            Welcome, ${escapeHtml(user.name || user.username)}
          </h2>
          <p class="text-muted mb-0 small">
            User ID: <strong>${escapeHtml(user.username)}</strong> &middot; Real-time multi-recharge trading overview &middot; IST Date: <strong>${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}</strong>
          </p>
        </div>
        <div class="d-flex align-items-center gap-2">
          <a href="/fund/wallet-topup-request" class="btn btn-primary font-weight-bold btn-sm px-3 shadow-sm">
            <i class="fa fa-plus-circle mr-1"></i> Topup Request
          </a>
          ${isSeparate ? `
            <a href="/account/wallet-exchange" class="btn btn-outline-primary font-weight-bold btn-sm px-3 shadow-sm ml-2">
              <i class="fa fa-arrows-rotate mr-1"></i> Exchange Wallet
            </a>
          ` : ''}
          <a href="/report/account-statement" class="btn btn-outline-secondary font-weight-bold btn-sm px-3 shadow-sm ml-2">
            <i class="fa fa-file-invoice mr-1"></i> Statement
          </a>
        </div>
      </div>

      <!-- 2. TOP WALLET BALANCE SECTION -->
      <div class="row mb-4">
        ${!isSeparate ? `
          <!-- Single Wallet Mode -->
          <div class="col-lg-4 col-md-6 mb-3 mb-lg-0">
            <div class="top-wallet-card wallet-card-bg-single">
              <i class="fa fa-wallet wallet-card-watermark"></i>
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="badge badge-light text-primary font-weight-bold text-uppercase px-2 py-1">
                  <i class="fa fa-circle-check mr-1"></i> Unified Mode
                </span>
                <span class="small" style="opacity: 0.9;">Main Balance</span>
              </div>
              <div class="small text-uppercase font-weight-bold" style="letter-spacing: 0.5px; opacity: 0.95;">
                Main Wallet Balance
              </div>
              <div class="wallet-amount-lg">₹${totalBal}</div>
              <div class="d-flex justify-content-between align-items-center mt-2 pt-1" style="border-top: 1px solid rgba(255,255,255,0.2);">
                <small style="opacity: 0.9;">Usable for recharges & payouts</small>
                <a href="/fund/wallet-topup-request" class="btn btn-light btn-sm text-primary font-weight-bold py-0 px-2" style="font-size: 11px;">Topup</a>
              </div>
            </div>
          </div>

          <div class="col-lg-4 col-md-6 mb-3 mb-lg-0">
            <div class="top-wallet-card wallet-card-bg-lien">
              <i class="fa fa-lock wallet-card-watermark"></i>
              <div class="d-flex justify-content-between align-items-center mb-1">
                ${activeLienMinor > 0n
                  ? `<span class="badge badge-danger font-weight-bold text-uppercase px-2 py-1"><i class="fa fa-shield-alt mr-1"></i> Active Dispute Lien</span>`
                  : `<span class="badge badge-success font-weight-bold text-uppercase px-2 py-1"><i class="fa fa-check mr-1"></i> 100% Clear</span>`
                }
                <span class="small text-muted font-weight-bold">Security Hold</span>
              </div>
              <div class="small text-uppercase font-weight-bold text-muted" style="letter-spacing: 0.5px;">
                Lean Balance (Lien Hold)
              </div>
              <div class="wallet-amount-lg text-dark">₹${activeLien}</div>
              <div class="d-flex justify-content-between align-items-center mt-2 pt-1 border-top">
                <small class="text-muted">${activeLienMinor > 0n ? 'Frozen for active disputes' : 'No funds currently locked'}</small>
                <a href="/buyer/recharge-dispute" class="small text-primary font-weight-bold">Dispute List</a>
              </div>
            </div>
          </div>

          <div class="col-lg-4 col-md-12 mb-3 mb-lg-0">
            <div class="top-wallet-card wallet-card-bg-available">
              <i class="fa fa-bolt wallet-card-watermark text-success"></i>
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="badge badge-success font-weight-bold text-uppercase px-2 py-1">
                  <i class="fa fa-check-double mr-1"></i> Net Spendable
                </span>
                <span class="small text-muted font-weight-bold">Instant Execution</span>
              </div>
              <div class="small text-uppercase font-weight-bold text-muted" style="letter-spacing: 0.5px;">
                Net Available Balance
              </div>
              <div class="wallet-amount-lg text-success">₹${usableSingleRupees}</div>
              <div class="d-flex justify-content-between align-items-center mt-2 pt-1 border-top">
                <small class="text-muted">Total Balance minus Active Lien</small>
                <a href="/report/account-statement" class="small text-success font-weight-bold">Passbook</a>
              </div>
            </div>
          </div>
        ` : `
          <!-- Separate Wallet Mode (Buyer + Seller + Lien) -->
          <div class="col-lg-4 col-md-6 mb-3 mb-lg-0">
            <div class="top-wallet-card wallet-card-bg-buyer">
              <i class="fa fa-shopping-cart wallet-card-watermark"></i>
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="badge badge-light text-success font-weight-bold text-uppercase px-2 py-1">
                  <i class="fa fa-cart-shopping mr-1"></i> Purchases
                </span>
                <span class="small" style="opacity: 0.9;">Recharge Balance</span>
              </div>
              <div class="small text-uppercase font-weight-bold" style="letter-spacing: 0.5px; opacity: 0.95;">
                Buyer Wallet
              </div>
              <div class="wallet-amount-lg">₹${buyerBal}</div>
              <div class="d-flex justify-content-between align-items-center mt-2 pt-1" style="border-top: 1px solid rgba(255,255,255,0.2);">
                <small style="opacity: 0.9;">Recharges, APIs & Margin Buy</small>
                <a href="/fund/wallet-topup-request" class="btn btn-light btn-sm text-success font-weight-bold py-0 px-2" style="font-size: 11px;">+ Topup</a>
              </div>
            </div>
          </div>

          <div class="col-lg-4 col-md-6 mb-3 mb-lg-0">
            <div class="top-wallet-card wallet-card-bg-seller">
              <i class="fa fa-chart-line wallet-card-watermark"></i>
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="badge badge-light text-primary font-weight-bold text-uppercase px-2 py-1">
                  <i class="fa fa-line-chart mr-1"></i> Sales Earnings
                </span>
                <span class="small" style="opacity: 0.9;">Proceeds</span>
              </div>
              <div class="small text-uppercase font-weight-bold" style="letter-spacing: 0.5px; opacity: 0.95;">
                Seller Wallet
              </div>
              <div class="wallet-amount-lg">₹${sellerBal}</div>
              <div class="d-flex justify-content-between align-items-center mt-2 pt-1" style="border-top: 1px solid rgba(255,255,255,0.2);">
                <small style="opacity: 0.9;">Available for exchange: ₹${availableExchange}</small>
                <div>
                  <a href="/account/wallet-exchange" class="btn btn-light btn-sm text-primary font-weight-bold py-0 px-2 mr-1" style="font-size: 11px;">Exchange</a>
                  <a href="/fund/redeem" class="btn btn-outline-light btn-sm font-weight-bold py-0 px-2" style="font-size: 11px;">Redeem</a>
                </div>
              </div>
            </div>
          </div>

          <div class="col-lg-4 col-md-12 mb-3 mb-lg-0">
            <div class="top-wallet-card wallet-card-bg-lien">
              <i class="fa fa-lock wallet-card-watermark"></i>
              <div class="d-flex justify-content-between align-items-center mb-1">
                ${activeLienMinor > 0n
                  ? `<span class="badge badge-danger font-weight-bold text-uppercase px-2 py-1"><i class="fa fa-shield-alt mr-1"></i> Active Dispute Lien</span>`
                  : `<span class="badge badge-success font-weight-bold text-uppercase px-2 py-1"><i class="fa fa-check mr-1"></i> 100% Clear</span>`
                }
                <span class="small text-muted font-weight-bold">Security Hold</span>
              </div>
              <div class="small text-uppercase font-weight-bold text-muted" style="letter-spacing: 0.5px;">
                Lean Balance (Lien Hold)
              </div>
              <div class="wallet-amount-lg text-dark">₹${activeLien}</div>
              <div class="d-flex justify-content-between align-items-center mt-2 pt-1 border-top">
                <small class="text-muted">${activeLienMinor > 0n ? 'Frozen for active complaints' : 'Zero lien hold on account'}</small>
                <a href="/seller/sales-dispute" class="small text-danger font-weight-bold">Dispute List</a>
              </div>
            </div>
          </div>
        `}
      </div>

      <!-- 3. KPI METRIC CARDS (No. and Value both) -->
      <div class="row mb-4">
        <!-- 1. Today Purchase -->
        <div class="col-xl-4 col-md-6 mb-4">
          <div class="kpi-stat-card kpi-card-today-purchase">
            <div class="kpi-header">
              <span class="kpi-title">Today Purchase</span>
              <div class="kpi-icon-bubble bubble-blue">
                <i class="fa fa-shopping-cart"></i>
              </div>
            </div>
            <div class="kpi-body">
              <div class="kpi-val-number">₹${todayBuyVal}</div>
              <span class="kpi-count-pill pill-blue">
                <i class="fa fa-check mr-1"></i> ${todayBuyCount} Orders
              </span>
            </div>
            <a href="/buyer/purchase-txn" class="kpi-footer-link">
              <span>View Purchase History</span>
              <i class="fa fa-arrow-right"></i>
            </a>
          </div>
        </div>

        <!-- 2. Today Sales -->
        <div class="col-xl-4 col-md-6 mb-4">
          <div class="kpi-stat-card kpi-card-today-sales">
            <div class="kpi-header">
              <span class="kpi-title">Today Sales</span>
              <div class="kpi-icon-bubble bubble-green">
                <i class="fa fa-chart-line"></i>
              </div>
            </div>
            <div class="kpi-body">
              <div class="kpi-val-number text-success">₹${todaySellVal}</div>
              <span class="kpi-count-pill pill-green">
                <i class="fa fa-bolt mr-1"></i> ${todaySellCount} Orders
              </span>
            </div>
            <a href="/seller/sales-txn" class="kpi-footer-link">
              <span>View Sales History</span>
              <i class="fa fa-arrow-right"></i>
            </a>
          </div>
        </div>

        <!-- 3. Today Purchase Dispute -->
        <div class="col-xl-4 col-md-6 mb-4">
          <div class="kpi-stat-card kpi-card-today-purchase-disp">
            <div class="kpi-header">
              <span class="kpi-title">Today Purchase Dispute</span>
              <div class="kpi-icon-bubble bubble-amber">
                <i class="fa fa-triangle-exclamation"></i>
              </div>
            </div>
            <div class="kpi-body">
              <div class="kpi-val-number text-warning">₹${todayBuyDispVal}</div>
              <span class="kpi-count-pill pill-amber">
                <i class="fa fa-flag mr-1"></i> ${todayBuyDispCount} Disputes
              </span>
            </div>
            <a href="/buyer/recharge-dispute" class="kpi-footer-link">
              <span>Manage Buyer Disputes</span>
              <i class="fa fa-arrow-right"></i>
            </a>
          </div>
        </div>

        <!-- 4. Today Sales Dispute -->
        <div class="col-xl-4 col-md-6 mb-4">
          <div class="kpi-stat-card kpi-card-today-sales-disp">
            <div class="kpi-header">
              <span class="kpi-title">Today Sales Dispute</span>
              <div class="kpi-icon-bubble bubble-red">
                <i class="fa fa-scale-balanced"></i>
              </div>
            </div>
            <div class="kpi-body">
              <div class="kpi-val-number text-danger">₹${todaySellDispVal}</div>
              <span class="kpi-count-pill pill-red">
                <i class="fa fa-shield mr-1"></i> ${todaySellDispCount} Disputes
              </span>
            </div>
            <a href="/seller/sales-dispute" class="kpi-footer-link">
              <span>Manage Seller Disputes</span>
              <i class="fa fa-arrow-right"></i>
            </a>
          </div>
        </div>

        <!-- 5. Pending Purchase -->
        <div class="col-xl-4 col-md-6 mb-4">
          <div class="kpi-stat-card kpi-card-pending-purchase">
            <div class="kpi-header">
              <span class="kpi-title">Pending Purchase</span>
              <div class="kpi-icon-bubble bubble-cyan">
                <i class="fa fa-clock"></i>
              </div>
            </div>
            <div class="kpi-body">
              <div class="kpi-val-number" style="color:#0891b2;">₹${pendingBuyVal}</div>
              <span class="kpi-count-pill pill-cyan">
                <i class="fa fa-hourglass-half mr-1"></i> ${pendingBuyCount} Pending
              </span>
            </div>
            <a href="/buyer/purchase-txn" class="kpi-footer-link">
              <span>Track Pending Purchases</span>
              <i class="fa fa-arrow-right"></i>
            </a>
          </div>
        </div>

        <!-- 6. Pending Sales -->
        <div class="col-xl-4 col-md-6 mb-4">
          <div class="kpi-stat-card kpi-card-pending-sales">
            <div class="kpi-header">
              <span class="kpi-title">Pending Sales</span>
              <div class="kpi-icon-bubble bubble-purple">
                <i class="fa fa-arrows-rotate"></i>
              </div>
            </div>
            <div class="kpi-body">
              <div class="kpi-val-number" style="color:#7c3aed;">₹${pendingSellVal}</div>
              <span class="kpi-count-pill pill-purple">
                <i class="fa fa-spinner mr-1"></i> ${pendingSellCount} Pending
              </span>
            </div>
            <a href="/seller/sales-pending" class="kpi-footer-link">
              <span>Manage Pending Queue</span>
              <i class="fa fa-arrow-right"></i>
            </a>
          </div>
        </div>
      </div>

      <!-- Quick Shortcuts -->
      <div class="card border-0 shadow-sm rounded-3 mb-4">
        <div class="card-body p-3">
          <div class="d-flex align-items-center justify-content-between mb-3">
            <h6 class="font-weight-bold text-dark mb-0 text-uppercase small" style="letter-spacing: 0.5px;">
              <i class="fa fa-compass text-primary mr-2"></i> Quick Actions &amp; Direct Shortcuts
            </h6>
            <span class="badge badge-light border text-muted">User Portal</span>
          </div>
          <div class="row">
            <div class="col-md-2 col-sm-4 col-6 mb-2">
              <a href="/buyer/purchase-txn" class="shortcut-pill-btn">
                <i class="fa fa-cart-shopping text-primary"></i> <span>Buy Txn</span>
              </a>
            </div>
            <div class="col-md-2 col-sm-4 col-6 mb-2">
              <a href="/seller/sales-txn" class="shortcut-pill-btn">
                <i class="fa fa-chart-line text-success"></i> <span>Sales Txn</span>
              </a>
            </div>
            <div class="col-md-2 col-sm-4 col-6 mb-2">
              <a href="/fund/wallet-topup-request" class="shortcut-pill-btn">
                <i class="fa fa-money-bill-transfer text-info"></i> <span>Topup</span>
              </a>
            </div>
            <div class="col-md-2 col-sm-4 col-6 mb-2">
              <a href="/buyer/available-margin" class="shortcut-pill-btn">
                <i class="fa fa-tags text-warning"></i> <span>Buy Margin</span>
              </a>
            </div>
            <div class="col-md-2 col-sm-4 col-6 mb-2">
              <a href="/seller/sales-margin" class="shortcut-pill-btn">
                <i class="fa fa-sliders text-danger"></i> <span>Sell Margin</span>
              </a>
            </div>
            <div class="col-md-2 col-sm-4 col-6 mb-2">
              <a href="/buyer/api-document" class="shortcut-pill-btn">
                <i class="fa fa-code text-purple" style="color:#8b5cf6;"></i> <span>API Docs</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Live Transactions Table -->
      <div class="card border-0 shadow-sm rounded-3">
        <div class="card-header bg-white py-3 border-bottom d-flex align-items-center justify-content-between">
          <h6 class="font-weight-bold text-dark mb-0">
            <i class="fa fa-list-check text-primary mr-2"></i> Recent Recharge Activity
          </h6>
          <div>
            <a href="/buyer/purchase-txn" class="btn btn-outline-primary btn-sm font-weight-bold mr-1">Purchase Report</a>
            <a href="/seller/sales-txn" class="btn btn-outline-secondary btn-sm font-weight-bold">Sales Report</a>
          </div>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover table-striped mb-0 text-nowrap">
              <thead class="bg-light text-uppercase small text-muted font-weight-bold">
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Role</th>
                  <th>Number</th>
                  <th>Operator &amp; Circle</th>
                  <th class="text-right">Amount</th>
                  <th class="text-center">Status</th>
                  <th>Ref ID</th>
                </tr>
              </thead>
              <tbody>
                ${recentRowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="/auth-client.js"></script>
</body>
</html>`;

    const fullHtml = useFullWidthContainers(html);
    const framedHtml = await addPanelChrome(fullHtml, {
      role: 'user',
      userId: user.id,
      db,
      currentPath: '/dashboard',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data:; font-src 'self' data: https://cdnjs.cloudflare.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
    });
    response.end(framedHtml);
  }

  return { sendUserDashboard };
};
