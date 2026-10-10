'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const { getWalletPolicySettings, setWalletPolicySettings } = require('../lib/wallet-helper');

module.exports = function createAdminWalletSettingsPage({
  db,
  formatMinorUnits,
  sendJson,
  httpError,
}) {
  /**
   * Fetch aggregate stats for wallets and active liens
   */
  async function fetchWalletStats() {
    try {
      const res = await db.query(`
        SELECT
          COUNT(DISTINCT w.user_id) AS total_users,
          COALESCE(SUM(w.balance_minor), 0) AS total_balance_minor,
          COALESCE(SUM(w.buyer_balance_minor), 0) AS total_buyer_minor,
          COALESCE(SUM(w.seller_balance_minor), 0) AS total_seller_minor,
          COALESCE(SUM(w.lien_balance_minor), 0) AS total_lien_minor
        FROM wallets w
        JOIN users u ON u.id = w.user_id
        WHERE u.role = 'user' AND w.currency = 'INR'
      `);

      let totalActiveLienMinor = 0n;
      try {
        const lienRes = await db.query(`
          SELECT COALESCE(SUM(amount_minor), 0) AS active_lien_minor
          FROM seller_wallet_liens
          WHERE status = 'active'
        `);
        totalActiveLienMinor = BigInt(lienRes.rows[0]?.active_lien_minor || res.rows[0]?.total_lien_minor || 0);
      } catch (_) {
        totalActiveLienMinor = BigInt(res.rows[0]?.total_lien_minor || 0);
      }

      const row = res.rows[0] || {};
      return {
        total_users: row.total_users || 0,
        total_balance_minor: row.total_balance_minor || 0,
        total_buyer_minor: row.total_buyer_minor || 0,
        total_seller_minor: row.total_seller_minor || 0,
        total_active_lien_minor: totalActiveLienMinor,
      };
    } catch (_) {
      return {
        total_users: 0,
        total_balance_minor: 0,
        total_buyer_minor: 0,
        total_seller_minor: 0,
        total_active_lien_minor: 0n,
      };
    }
  }

  /**
   * Render Admin Wallet Settings Page
   */
  async function sendAdminWalletSettingsPage(admin, response, query = {}) {
    const policy = await getWalletPolicySettings(db);
    const stats = await fetchWalletStats();

    const isSingle = policy.walletMode === 'single';
    const isSeparate = policy.walletMode === 'separate';
    const isSavedSuccess = String(query?.saved || '').toLowerCase() === 'true' || query?.saved === '1';

    const totalBal = formatMinorUnits(stats.total_balance_minor);
    const buyerBal = formatMinorUnits(stats.total_buyer_minor);
    const sellerBal = formatMinorUnits(stats.total_seller_minor);
    const activeLienBal = formatMinorUnits(stats.total_active_lien_minor);
    const totalUsers = Number(stats.total_users || 0).toLocaleString('en-IN');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Wallet, Sales Holding & Dispute Lien Settings - Admin</title>
  <link rel="icon" type="image/x-icon" href="/api/favicon">
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/plugins/web-fonts/icons.css">
  <link rel="stylesheet" href="/assets/plugins/web-fonts/font-awesome/font-awesome.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    .mode-card {
      border: 2px solid #e2e8f0;
      border-radius: 14px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.25s ease;
      background: #ffffff;
      position: relative;
      height: 100%;
    }
    .mode-card:hover {
      border-color: #3b82f6;
      box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.15);
      transform: translateY(-2px);
    }
    .mode-card.selected {
      border-color: #2563eb;
      background: linear-gradient(180deg, #f0f7ff 0%, #ffffff 100%);
      box-shadow: 0 12px 30px -5px rgba(37, 99, 235, 0.2);
    }
    .mode-badge-active {
      position: absolute;
      top: 16px;
      right: 16px;
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 700;
      border-radius: 999px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .stat-box {
      border-radius: 12px;
      padding: 16px 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .stat-box-icon {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
    }
    .rule-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .preset-btn {
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .preset-btn:hover {
      background: #3b82f6;
      color: #ffffff;
      border-color: #3b82f6;
    }
    .section-icon-badge {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }
  </style>
</head>
<body class="app sidebar-mini">
<div class="page">
  <div class="page-main">
    <div class="app-header header top-header">
      <div class="container-fluid main-container">
        <div class="d-flex align-items-center">
          <a class="header-brand" href="/admin/">
            <img src="/api/logo" class="header-brand-img desktop-logo" alt="Logo" style="height:36px;max-width:180px;object-fit:contain;" onerror="this.src='/assets/images/brand/logo.png'">
          </a>
          <div class="ms-auto d-flex order-lg-2">
            <span class="badge bg-primary text-white p-2 px-3 fw-bold"><i class="fa fa-user-shield me-1"></i> Admin Panel</span>
          </div>
        </div>
      </div>
    </div>

    ${renderAdminNavigation('/admin/settings/wallet-settings')}

    <div class="main-content hor-content mt-0">
      <div class="side-app">
        <div class="main-container container-fluid">
          <!-- Page Header -->
          <div class="page-header d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
            <div>
              <h1 class="page-title text-primary"><i class="fa fa-wallet me-2"></i>Wallet, Sales Holding &amp; Dispute Policy Settings</h1>
              <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="/admin/">Admin</a></li>
                <li class="breadcrumb-item">Settings</li>
                <li class="breadcrumb-item active" aria-current="page">Wallet Settings</li>
              </ol>
            </div>
            <div>
              <span class="badge ${isSeparate ? 'bg-success' : 'bg-primary'} p-2 px-3 fs-13">
                <i class="fa ${isSeparate ? 'fa-code-branch' : 'fa-circle-dot'} me-1"></i>
                Active Mode: <strong>${isSeparate ? 'Separate Dual Wallet' : 'Single Unified Wallet'}</strong>
              </span>
            </div>
          </div>

          <!-- Alert banner explaining the system -->
          <div class="alert alert-info border-0 shadow-sm mb-4" style="background: linear-gradient(90deg, #eff6ff 0%, #f0fdf4 100%); border-left: 5px solid #2563eb !important;">
            <div class="d-flex align-items-start">
              <i class="fa fa-circle-info fs-24 text-primary me-3 mt-1"></i>
              <div>
                <h5 class="fw-bold mb-1 text-dark">Central Wallet, Seller Sales Hold &amp; Dispute Policy Control Center</h5>
                <p class="mb-0 text-muted fs-13">
                  Configure system wallet mode (Single/Dual), holding durations for seller sales before <strong>Redeem</strong> or <strong>Wallet Exchange</strong>, 
                  and dispute lien multipliers with penalty retention days upon refund.
                </p>
              </div>
            </div>
          </div>

          <!-- Live Balance Overview Stats -->
          <div class="row mb-4">
            <div class="col-sm-6 col-lg">
              <div class="stat-box">
                <div class="stat-box-icon bg-primary-transparent text-primary">
                  <i class="fa fa-users"></i>
                </div>
                <div>
                  <div class="text-muted fs-12 fw-semibold text-uppercase">Total Active Users</div>
                  <h4 class="fw-bold mb-0 text-dark">${totalUsers}</h4>
                </div>
              </div>
            </div>
            <div class="col-sm-6 col-lg">
              <div class="stat-box">
                <div class="stat-box-icon bg-emerald-transparent text-success" style="background: rgba(16, 185, 129, 0.15);">
                  <i class="fa fa-shopping-cart" style="color: #059669;"></i>
                </div>
                <div>
                  <div class="text-muted fs-12 fw-semibold text-uppercase">Buyer Balance</div>
                  <h4 class="fw-bold mb-0 text-success">₹${buyerBal}</h4>
                </div>
              </div>
            </div>
            <div class="col-sm-6 col-lg">
              <div class="stat-box">
                <div class="stat-box-icon bg-indigo-transparent text-indigo" style="background: rgba(99, 102, 241, 0.15);">
                  <i class="fa fa-line-chart" style="color: #4f46e5;"></i>
                </div>
                <div>
                  <div class="text-muted fs-12 fw-semibold text-uppercase">Seller Balance</div>
                  <h4 class="fw-bold mb-0" style="color: #4f46e5;">₹${sellerBal}</h4>
                </div>
              </div>
            </div>
            <div class="col-sm-6 col-lg">
              <div class="stat-box">
                <div class="stat-box-icon bg-warning-transparent text-warning">
                  <i class="fa fa-vault"></i>
                </div>
                <div>
                  <div class="text-muted fs-12 fw-semibold text-uppercase">Combined Balance</div>
                  <h4 class="fw-bold mb-0 text-warning">₹${totalBal}</h4>
                </div>
              </div>
            </div>
            <div class="col-sm-6 col-lg">
              <div class="stat-box">
                <div class="stat-box-icon text-danger" style="background: rgba(239, 68, 68, 0.15);">
                  <i class="fa fa-lock" style="color: #ef4444;"></i>
                </div>
                <div>
                  <div class="text-muted fs-12 fw-semibold text-uppercase">Active Lien Held</div>
                  <h4 class="fw-bold mb-0 text-danger">₹${activeLienBal}</h4>
                </div>
              </div>
            </div>
          </div>

          <!-- Live Saved Notification & Alert Banner -->
          ${isSavedSuccess ? `
          <div class="alert alert-success border-0 shadow-sm mb-4 d-flex align-items-center">
            <i class="fa fa-circle-check fs-20 me-3 text-success"></i>
            <div>
              <strong>Settings Saved!</strong> Wallet mode and policy settings have been updated successfully.
            </div>
          </div>` : ''}

          <div id="statusAlert" class="alert d-none mb-4" role="alert"></div>

          <!-- Settings Form Start -->
          <form id="walletSettingsForm" method="POST" action="/admin/settings/wallet-settings" onsubmit="event.preventDefault(); saveAllSettings();">

            <!-- SECTION 1: Single vs Separate Wallet Mode -->
            <div class="card shadow-sm border-0 mb-4">
              <div class="card-header bg-white border-bottom d-flex align-items-center">
                <span class="section-icon-badge bg-primary text-white me-2"><i class="fa fa-sliders"></i></span>
                <h5 class="card-title mb-0 fw-bold">1. Choose System Wallet Mode (Single vs Separate)</h5>
              </div>
              <div class="card-body p-4">
                <div class="row g-4">
                  <!-- Mode 1: Single Wallet -->
                  <div class="col-md-6">
                    <div class="mode-card ${isSingle ? 'selected' : ''}" id="card-single" onclick="selectMode('single')">
                      ${isSingle ? '<span class="mode-badge-active bg-primary text-white"><i class="fa fa-check me-1"></i>Currently Active</span>' : ''}
                      <div class="d-flex align-items-center mb-3">
                        <div class="stat-box-icon bg-primary text-white rounded-circle me-3" style="width:44px;height:44px;">
                          <i class="fa fa-wallet"></i>
                        </div>
                        <div>
                          <h5 class="fw-bold mb-0 text-dark">Single Unified Wallet</h5>
                          <span class="text-muted fs-12">All-in-One Unified Prepaid Balance</span>
                        </div>
                      </div>
                      <p class="text-secondary fs-13 mb-3">
                        Each user operates with <strong>1 primary wallet</strong>. Recharge purchases, LAPU sales, fund requests, 
                        and payout redemptions all operate from this single balance.
                      </p>
                      <div class="border-top pt-3">
                        <div class="rule-pill text-white" style="background:#2563eb;">
                          <i class="fa fa-check"></i> Fund Topup &rarr; Credited to Main Wallet
                        </div>
                        <div class="rule-pill text-white" style="background:#0284c7;">
                          <i class="fa fa-cart-shopping"></i> Purchase Txn &rarr; Debited from Main Wallet
                        </div>
                        <div class="rule-pill text-white" style="background:#16a34a;">
                          <i class="fa fa-line-chart"></i> LAPU Sale Credit &rarr; Credited to Main Wallet
                        </div>
                        <div class="rule-pill text-white" style="background:#ea580c;">
                          <i class="fa fa-money-bill-wave"></i> Fund Redeem &rarr; Debited from Main Wallet
                        </div>
                      </div>
                      <div class="mt-3">
                        <div class="form-check form-check-inline">
                          <input class="form-check-input" type="radio" name="walletMode" id="radioSingle" value="single" ${isSingle ? 'checked' : ''}>
                          <label class="form-check-label fw-bold" for="radioSingle">Use Single Wallet</label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Mode 2: Separate Dual Wallet -->
                  <div class="col-md-6">
                    <div class="mode-card ${isSeparate ? 'selected' : ''}" id="card-separate" onclick="selectMode('separate')">
                      ${isSeparate ? '<span class="mode-badge-active bg-success text-white"><i class="fa fa-check me-1"></i>Currently Active</span>' : ''}
                      <div class="d-flex align-items-center mb-3">
                        <div class="stat-box-icon bg-success text-white rounded-circle me-3" style="width:44px;height:44px;">
                          <i class="fa fa-arrows-split-up-and-left"></i>
                        </div>
                        <div>
                          <h5 class="fw-bold mb-0 text-dark">Separate Dual Wallet</h5>
                          <span class="text-muted fs-12">Dual Wallet Mode (Buyer Wallet + Seller Wallet)</span>
                        </div>
                      </div>
                      <p class="text-secondary fs-13 mb-3">
                        Each user operates with <strong>2 distinct wallets</strong>. Buyer and seller cash flows are isolated, transparent, 
                        and securely managed.
                      </p>
                      <div class="border-top pt-3">
                        <div class="rule-pill text-white" style="background:#059669;">
                          <i class="fa fa-arrow-down"></i> Fund Request &rarr; Credited to <strong>Buyer Wallet</strong>
                        </div>
                        <div class="rule-pill text-white" style="background:#0284c7;">
                          <i class="fa fa-cart-shopping"></i> Buy Txn &rarr; Debited from <strong>Buyer Wallet</strong>
                        </div>
                        <div class="rule-pill text-white" style="background:#4f46e5;">
                          <i class="fa fa-arrow-up"></i> Sale Txn &rarr; Credited to <strong>Seller Wallet</strong>
                        </div>
                        <div class="rule-pill text-white" style="background:#d97706;">
                          <i class="fa fa-money-bill-transfer"></i> Redeem Request &rarr; Payout from <strong>Seller Wallet</strong>
                        </div>
                      </div>
                      <div class="mt-3">
                        <div class="form-check form-check-inline">
                          <input class="form-check-input" type="radio" name="walletMode" id="radioSeparate" value="separate" ${isSeparate ? 'checked' : ''}>
                          <label class="form-check-label fw-bold" for="radioSeparate">Use Separate Dual Wallet</label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- SECTION 2: Seller Sales Release / Holding Time Delay Settings -->
            <div class="card shadow-sm border-0 mb-4">
              <div class="card-header bg-white border-bottom d-flex align-items-center justify-content-between">
                <div class="d-flex align-items-center">
                  <span class="section-icon-badge text-white me-2" style="background: linear-gradient(135deg, #4f46e5, #06b6d4);"><i class="fa fa-clock"></i></span>
                  <div>
                    <h5 class="card-title mb-0 fw-bold">2. Seller Sales Holding Time Settings</h5>
                    <span class="text-muted fs-12">How long sales earnings remain on hold before release (Redeem &amp; Wallet Exchange)</span>
                  </div>
                </div>
                <span class="badge bg-indigo-transparent text-indigo fw-bold px-3 py-2" style="background: #eef2ff; color: #4338ca;">
                  <i class="fa fa-bolt me-1"></i> Two Independent Controls
                </span>
              </div>
              <div class="card-body p-4">
                <div class="row g-4">
                  <!-- Setting 2A: Seller Sale Redeem Hold Time -->
                  <div class="col-lg-6">
                    <div class="p-3 border rounded-3 bg-light h-100">
                      <div class="d-flex align-items-center mb-2">
                        <div class="stat-box-icon text-white rounded-3 me-2" style="width:36px;height:36px;background:#d97706;font-size:16px;">
                          <i class="fa fa-money-bill-transfer"></i>
                        </div>
                        <div>
                          <label for="redeemHoldMin" class="fw-bold mb-0 text-dark">Seller Sales Redeem Hold Duration (Minutes)</label>
                          <div class="text-muted fs-12">Duration before seller sales earnings can be redeemed to bank</div>
                        </div>
                      </div>
                      <p class="text-secondary fs-13 mb-3">
                        After a seller completes a recharge sale, how many minutes before that earning becomes eligible for bank payout/redeem.
                        Set to <strong>0</strong> for instant redeem availability.
                      </p>
                      <div class="input-group mb-2">
                        <span class="input-group-text bg-white"><i class="fa fa-hourglass-half text-warning"></i></span>
                        <input type="number" id="redeemHoldMin" name="sellerSaleRedeemHoldMinutes" class="form-control form-control-lg font-monospace fw-bold" min="0" max="43200" step="1" value="${policy.sellerSaleRedeemHoldMinutes}">
                        <span class="input-group-text bg-white fw-bold">Minutes</span>
                      </div>
                      <div class="d-flex flex-wrap gap-1 align-items-center mt-2">
                        <span class="fs-12 text-muted me-1">Quick Presets:</span>
                        <button type="button" class="preset-btn" onclick="setPreset('redeemHoldMin', 0)">0m (Instant)</button>
                        <button type="button" class="preset-btn" onclick="setPreset('redeemHoldMin', 15)">15m</button>
                        <button type="button" class="preset-btn" onclick="setPreset('redeemHoldMin', 30)">30m</button>
                        <button type="button" class="preset-btn" onclick="setPreset('redeemHoldMin', 60)">1 Hour (60m)</button>
                        <button type="button" class="preset-btn" onclick="setPreset('redeemHoldMin', 120)">2 Hours (120m)</button>
                        <button type="button" class="preset-btn" onclick="setPreset('redeemHoldMin', 1440)">24 Hours (1440m)</button>
                      </div>
                    </div>
                  </div>

                  <!-- Setting 2B: Seller Sale Exchange Hold Time -->
                  <div class="col-lg-6">
                    <div class="p-3 border rounded-3 bg-light h-100">
                      <div class="d-flex align-items-center mb-2">
                        <div class="stat-box-icon text-white rounded-3 me-2" style="width:36px;height:36px;background:#0284c7;font-size:16px;">
                          <i class="fa fa-arrows-rotate"></i>
                        </div>
                        <div>
                          <label for="exchangeHoldMin" class="fw-bold mb-0 text-dark">Seller Sales Wallet Exchange Hold Duration (Minutes)</label>
                          <div class="text-muted fs-12">Duration before seller sales earnings can be transferred to buyer wallet</div>
                        </div>
                      </div>
                      <p class="text-secondary fs-13 mb-3">
                        After a seller completes a recharge sale, how many minutes before that earning becomes eligible for seller-to-buyer wallet exchange.
                        Set to <strong>0</strong> for instant exchange availability.
                      </p>
                      <div class="input-group mb-2">
                        <span class="input-group-text bg-white"><i class="fa fa-hourglass-end text-info"></i></span>
                        <input type="number" id="exchangeHoldMin" name="sellerSaleExchangeHoldMinutes" class="form-control form-control-lg font-monospace fw-bold" min="0" max="43200" step="1" value="${policy.sellerSaleExchangeHoldMinutes}">
                        <span class="input-group-text bg-white fw-bold">Minutes</span>
                      </div>
                      <div class="d-flex flex-wrap gap-1 align-items-center mt-2">
                        <span class="fs-12 text-muted me-1">Quick Presets:</span>
                        <button type="button" class="preset-btn" onclick="setPreset('exchangeHoldMin', 0)">0m (Instant)</button>
                        <button type="button" class="preset-btn" onclick="setPreset('exchangeHoldMin', 15)">15m</button>
                        <button type="button" class="preset-btn" onclick="setPreset('exchangeHoldMin', 30)">30m</button>
                        <button type="button" class="preset-btn" onclick="setPreset('exchangeHoldMin', 60)">1 Hour (60m)</button>
                        <button type="button" class="preset-btn" onclick="setPreset('exchangeHoldMin', 120)">2 Hours (120m)</button>
                        <button type="button" class="preset-btn" onclick="setPreset('exchangeHoldMin', 1440)">24 Hours (1440m)</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- SECTION 3: Dispute / Complaint Lien & Penalty Policy Settings -->
            <div class="card shadow-sm border-0 mb-4">
              <div class="card-header bg-white border-bottom d-flex align-items-center justify-content-between">
                <div class="d-flex align-items-center">
                  <span class="section-icon-badge text-white me-2" style="background: linear-gradient(135deg, #ef4444, #f97316);"><i class="fa fa-shield-halved"></i></span>
                  <div>
                    <h5 class="card-title mb-0 fw-bold">3. Dispute / Complaint Lien &amp; Penalty Policy</h5>
                    <span class="text-muted fs-12">Lien hold on seller wallet upon buyer dispute and refund penalty rules</span>
                  </div>
                </div>
                <span class="badge bg-danger-transparent text-danger fw-bold px-3 py-2" style="background: #fef2f2; color: #dc2626;">
                  <i class="fa fa-lock me-1"></i> Fraud Protection Lien
                </span>
              </div>
              <div class="card-body p-4">
                <div class="row g-4">
                  <!-- Setting 3A: Dispute Lien Multiplier -->
                  <div class="col-md-4">
                    <div class="p-3 border rounded-3 bg-light h-100">
                      <div class="d-flex align-items-center mb-2">
                        <div class="stat-box-icon text-white rounded-3 me-2" style="width:36px;height:36px;background:#f59e0b;font-size:16px;">
                          <i class="fa fa-lock"></i>
                        </div>
                        <div>
                          <label for="disputeLienMult" class="fw-bold mb-0 text-dark">Complaint Lien Multiplier (x Multiplier)</label>
                          <div class="text-muted fs-12">Multiplier of recharge amount held on buyer complaint</div>
                        </div>
                      </div>
                      <p class="text-secondary fs-13 mb-3">
                        When a buyer raises a dispute on a recharge, the multiplier of the recharge amount held as a <strong>Lien Hold</strong> in the seller wallet until cleared.
                      </p>
                      <div class="input-group mb-2">
                        <span class="input-group-text bg-white"><i class="fa fa-xmark text-warning"></i></span>
                        <input type="number" id="disputeLienMult" name="disputeLienMultiplier" class="form-control form-control-lg font-monospace fw-bold" min="0.1" max="10.0" step="0.1" value="${policy.disputeLienMultiplier.toFixed(1)}">
                        <span class="input-group-text bg-white fw-bold">x Multiplier</span>
                      </div>
                      <div class="d-flex flex-wrap gap-1 align-items-center mt-2">
                        <span class="fs-12 text-muted me-1">Quick Presets:</span>
                        <button type="button" class="preset-btn" onclick="setPreset('disputeLienMult', '1.0')">1.0x (1x)</button>
                        <button type="button" class="preset-btn" onclick="setPreset('disputeLienMult', '1.5')">1.5x</button>
                        <button type="button" class="preset-btn" onclick="setPreset('disputeLienMult', '2.0')">2.0x (2x)</button>
                        <button type="button" class="preset-btn" onclick="setPreset('disputeLienMult', '3.0')">3.0x</button>
                      </div>
                      <div class="mt-3 p-2 rounded bg-white border border-success-subtle text-success fs-12">
                        <i class="fa fa-check-circle me-1"></i>
                        <strong>Auto-Free on Success:</strong> If the disputed recharge is verified as successful, all lien funds are immediately released (Free).
                      </div>
                    </div>
                  </div>

                  <!-- Setting 3B: Refund Penalty Multiplier -->
                  <div class="col-md-4">
                    <div class="p-3 border rounded-3 bg-light h-100">
                      <div class="d-flex align-items-center mb-2">
                        <div class="stat-box-icon text-white rounded-3 me-2" style="width:36px;height:36px;background:#ef4444;font-size:16px;">
                          <i class="fa fa-gavel"></i>
                        </div>
                        <div>
                          <label for="refundLienMult" class="fw-bold mb-0 text-dark">Refund Penalty Multiplier (x Multiplier)</label>
                          <div class="text-muted fs-12">Multiplier of recharge amount held as penalty on refund</div>
                        </div>
                      </div>
                      <p class="text-secondary fs-13 mb-3">
                        If a disputed recharge is <strong>Refunded / Accepted</strong>, the multiplier of the recharge amount held from the seller as a penalty lien.
                      </p>
                      <div class="input-group mb-2">
                        <span class="input-group-text bg-white"><i class="fa fa-percent text-danger"></i></span>
                        <input type="number" id="refundLienMult" name="disputeRefundLienMultiplier" class="form-control form-control-lg font-monospace fw-bold" min="0" max="10.0" step="0.1" value="${policy.disputeRefundLienMultiplier.toFixed(1)}">
                        <span class="input-group-text bg-white fw-bold">x Penalty</span>
                      </div>
                      <div class="d-flex flex-wrap gap-1 align-items-center mt-2">
                        <span class="fs-12 text-muted me-1">Quick Presets:</span>
                        <button type="button" class="preset-btn" onclick="setPreset('refundLienMult', '0.0')">0.0x (No Lien)</button>
                        <button type="button" class="preset-btn" onclick="setPreset('refundLienMult', '1.0')">1.0x</button>
                        <button type="button" class="preset-btn" onclick="setPreset('refundLienMult', '1.5')">1.5x</button>
                        <button type="button" class="preset-btn" onclick="setPreset('refundLienMult', '2.0')">2.0x (2x)</button>
                        <button type="button" class="preset-btn" onclick="setPreset('refundLienMult', '3.0')">3.0x</button>
                      </div>
                    </div>
                  </div>

                  <!-- Setting 3C: Refund Lien Days -->
                  <div class="col-md-4">
                    <div class="p-3 border rounded-3 bg-light h-100">
                      <div class="d-flex align-items-center mb-2">
                        <div class="stat-box-icon text-white rounded-3 me-2" style="width:36px;height:36px;background:#475569;font-size:16px;">
                          <i class="fa fa-calendar-days"></i>
                        </div>
                        <div>
                          <label for="refundLienDays" class="fw-bold mb-0 text-dark">Refund Lien Retention Days</label>
                          <div class="text-muted fs-12">How many days the refund penalty lien remains held</div>
                        </div>
                      </div>
                      <p class="text-secondary fs-13 mb-3">
                        Number of days the seller's penalty lien remains on hold following a refund. Once the period expires, the system automatically releases the lien.
                      </p>
                      <div class="input-group mb-2">
                        <span class="input-group-text bg-white"><i class="fa fa-calendar-check text-secondary"></i></span>
                        <input type="number" id="refundLienDays" name="disputeRefundLienDays" class="form-control form-control-lg font-monospace fw-bold" min="0" max="365" step="1" value="${policy.disputeRefundLienDays}">
                        <span class="input-group-text bg-white fw-bold">Days</span>
                      </div>
                      <div class="d-flex flex-wrap gap-1 align-items-center mt-2">
                        <span class="fs-12 text-muted me-1">Quick Presets:</span>
                        <button type="button" class="preset-btn" onclick="setPreset('refundLienDays', 0)">0 (Immediate)</button>
                        <button type="button" class="preset-btn" onclick="setPreset('refundLienDays', 3)">3 Days</button>
                        <button type="button" class="preset-btn" onclick="setPreset('refundLienDays', 7)">7 Days</button>
                        <button type="button" class="preset-btn" onclick="setPreset('refundLienDays', 15)">15 Days</button>
                        <button type="button" class="preset-btn" onclick="setPreset('refundLienDays', 30)">30 Days</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Action Button & Summary -->
            <div class="card shadow-sm border-0 mb-4 bg-white">
              <div class="card-body p-4 d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div class="text-muted fs-13">
                  <i class="fa fa-shield-halved text-primary me-1"></i>
                  Once saved, all settings apply immediately across the system (buyer, seller, recharge API, and dispute engine).
                </div>
                <div>
                  <button type="submit" id="saveModeBtn" class="btn btn-primary btn-lg px-5 fw-bold shadow-sm">
                    <i class="fa fa-save me-2"></i>Save All Wallet &amp; Dispute Settings
                  </button>
                </div>
              </div>
            </div>

          </form>
          <!-- Settings Form End -->

          <!-- Feature Comparison Matrix -->
          <div class="card shadow-sm border-0 mb-4">
            <div class="card-header bg-white border-bottom">
              <h5 class="card-title mb-0 fw-bold"><i class="fa fa-table me-2 text-info"></i>Feature Comparison Guide</h5>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-bordered table-striped mb-0">
                  <thead class="table-light">
                    <tr>
                      <th style="width: 25%;">Feature / Operation</th>
                      <th style="width: 37.5%;" class="text-primary"><i class="fa fa-wallet me-1"></i> Single Wallet Mode</th>
                      <th style="width: 37.5%;" class="text-success"><i class="fa fa-arrows-split-up-and-left me-1"></i> Separate Dual Wallet Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td class="fw-bold">User Header &amp; Dashboard Display</td>
                      <td>Displays: <code>PREPAID WALLET: ₹X.XX</code></td>
                      <td>Displays: <code>BUYER WALLET: ₹X.XX</code> &amp; <code>SELLER WALLET: ₹Y.YY</code></td>
                    </tr>
                    <tr>
                      <td class="fw-bold">Fund Request Approval (Topup)</td>
                      <td>Credited to Main Wallet</td>
                      <td>Credited to <strong>Buyer Wallet</strong></td>
                    </tr>
                    <tr>
                      <td class="fw-bold">Recharge Purchase (API Buy)</td>
                      <td>Debited from Main Wallet</td>
                      <td>Debited from <strong>Buyer Wallet</strong> (refunded to Buyer Wallet on failure)</td>
                    </tr>
                    <tr>
                      <td class="fw-bold">Recharge Sales Credit (LAPU Sale)</td>
                      <td>Credited to Main Wallet</td>
                      <td>Credited to <strong>Seller Wallet</strong></td>
                    </tr>
                    <tr>
                      <td class="fw-bold">Sales Release Hold Time (Redeem &amp; Exchange)</td>
                      <td>Sales earnings held for configured minutes before redeem or exchange</td>
                      <td>Held in Seller Wallet for configured minutes before redeem or exchange</td>
                    </tr>
                    <tr>
                      <td class="fw-bold">Dispute Lien &amp; Penalty Multiplier</td>
                      <td>Held X times recharge amount from seller balance on dispute</td>
                      <td>Held X times recharge amount from Seller Wallet (released on success, Y days penalty on refund)</td>
                    </tr>
                    <tr>
                      <td class="fw-bold">Fund Redeem / Bank Payout (Withdrawal)</td>
                      <td>Debited from Main Wallet (available balance)</td>
                      <td>Debited from <strong>Seller Wallet</strong> (available balance)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</div>

<!-- Toast notification -->
<div class="position-fixed bottom-0 end-0 p-3" style="z-index: 9999;">
  <div id="liveToast" class="toast align-items-center text-white border-0" role="alert" aria-live="assertive" aria-atomic="true">
    <div class="d-flex">
      <div class="toast-body fs-14 fw-semibold" id="toastMessage"></div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  </div>
</div>

<script src="/assets/plugins/jquery/jquery.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script>
  function selectMode(mode) {
    document.getElementById('radioSingle').checked = (mode === 'single');
    document.getElementById('radioSeparate').checked = (mode === 'separate');
    
    document.getElementById('card-single').classList.toggle('selected', mode === 'single');
    document.getElementById('card-separate').classList.toggle('selected', mode === 'separate');
  }

  function setPreset(elementId, value) {
    var el = document.getElementById(elementId);
    if (el) el.value = value;
  }

  function showToast(message, isError) {
    var toastEl = document.getElementById('liveToast');
    var msgEl = document.getElementById('toastMessage');
    var alertEl = document.getElementById('statusAlert');

    if (msgEl) msgEl.innerHTML = message;
    if (alertEl) {
      alertEl.className = 'alert ' + (isError ? 'alert-danger' : 'alert-success') + ' d-block shadow-sm';
      alertEl.innerHTML = '<i class="fa ' + (isError ? 'fa-triangle-exclamation' : 'fa-circle-check') + ' me-2"></i>' + message;
      try { alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
    }

    if (toastEl) {
      toastEl.className = 'toast align-items-center text-white border-0 ' + (isError ? 'bg-danger' : 'bg-success');
      toastEl.style.opacity = '1';
      toastEl.style.display = 'block';

      if (window.bootstrap && typeof window.bootstrap.Toast === 'function') {
        try {
          var toast = new bootstrap.Toast(toastEl, { delay: 4000 });
          toast.show();
          return;
        } catch (_) {}
      }
      if (window.jQuery && typeof jQuery.fn.toast === 'function') {
        try {
          jQuery(toastEl).toast({ delay: 4000 }).toast('show');
          return;
        } catch (_) {}
      }
      setTimeout(function() {
        if (toastEl) toastEl.style.display = 'none';
      }, 4000);
    }
  }

  async function saveAllSettings() {
    var selected = document.querySelector('input[name="walletMode"]:checked');
    if (!selected) {
      showToast('Please select a wallet mode.', true);
      return;
    }
    var mode = selected.value;

    var redeemHoldMin = parseInt(document.getElementById('redeemHoldMin').value, 10);
    if (isNaN(redeemHoldMin)) redeemHoldMin = 0;

    var exchangeHoldMin = parseInt(document.getElementById('exchangeHoldMin').value, 10);
    if (isNaN(exchangeHoldMin)) exchangeHoldMin = 0;

    var disputeLienMult = parseFloat(document.getElementById('disputeLienMult').value);
    if (isNaN(disputeLienMult)) disputeLienMult = 1.0;

    var refundLienMult = parseFloat(document.getElementById('refundLienMult').value);
    if (isNaN(refundLienMult)) refundLienMult = 1.0;

    var refundLienDays = parseInt(document.getElementById('refundLienDays').value, 10);
    if (isNaN(refundLienDays)) refundLienDays = 7;

    if (redeemHoldMin < 0 || exchangeHoldMin < 0) {
      showToast('Holding time cannot be negative.', true);
      return;
    }
    if (disputeLienMult < 0.1 || refundLienMult < 0) {
      showToast('Lien multiplier must be a valid positive number (or 0 for refund).', true);
      return;
    }
    if (refundLienDays < 0) {
      showToast('Refund lien days cannot be negative.', true);
      return;
    }

    var btn = document.getElementById('saveModeBtn');
    var originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin me-2"></i>Saving All Settings...';

    try {
      var res = await fetch('/api/admin/settings/wallet-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          mode: mode,
          sellerSaleRedeemHoldMinutes: redeemHoldMin,
          sellerSaleExchangeHoldMinutes: exchangeHoldMin,
          disputeLienMultiplier: disputeLienMult,
          disputeRefundLienMultiplier: refundLienMult,
          disputeRefundLienDays: refundLienDays,
        })
      });
      var data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.message || 'An error occurred while saving settings.', true);
        btn.disabled = false;
        btn.innerHTML = originalText;
        return;
      }
      showToast('Wallet mode and policy settings updated successfully! Reloading page...', false);
      setTimeout(function() {
        window.location.reload();
      }, 1200);
    } catch (err) {
      showToast('Network error: ' + err.message, true);
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
    response.end(await addPanelChrome(html, { role: 'admin', userId: admin.id, db, currentPath: '/admin/settings/wallet-settings' }));
  }

  /**
   * API & Form Handler: POST /api/admin/settings/wallet-mode & /admin/settings/wallet-settings
   */
  async function handleUpdateWalletMode(request, response, admin) {
    if (!admin || admin.role !== 'admin') {
      throw httpError('Unauthorized', 401);
    }

    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 50000) throw httpError('Payload too large', 413);
    }

    let payload = {};
    const contentType = String(request.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('application/json')) {
      try {
        payload = JSON.parse(body || '{}');
      } catch (_) {
        throw httpError('Invalid JSON', 400);
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(body);
      for (const [key, val] of params.entries()) {
        payload[key] = val;
      }
    } else {
      try {
        payload = JSON.parse(body || '{}');
      } catch (_) {
        const params = new URLSearchParams(body);
        for (const [key, val] of params.entries()) {
          payload[key] = val;
        }
      }
    }

    const mode = String(payload.mode || payload.walletMode || payload.wallet_mode || '').trim().toLowerCase();
    if (mode && !['single', 'separate'].includes(mode)) {
      throw httpError('Invalid mode. Must be "single" or "separate".', 400);
    }

    const updated = await setWalletPolicySettings(db, payload, admin.id);

    const accept = String(request.headers['accept'] || '').toLowerCase();
    if (!accept.includes('application/json') && contentType.includes('application/x-www-form-urlencoded')) {
      response.writeHead(303, { Location: '/admin/settings/wallet-settings?saved=true' });
      response.end();
      return;
    }

    sendJson(response, 200, {
      ok: true,
      settings: updated,
      message: 'Wallet mode & policies successfully updated.',
    });
  }

  return {
    sendAdminWalletSettingsPage,
    handleUpdateWalletMode,
  };
};
