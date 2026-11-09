'use strict';

const nodemailer = require('nodemailer');
const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');
const { fetchOperatorLookup, fetchEzytmRoffer } = require('../lib/plan-api-service');
const { clearPolicyCache } = require('../lib/wallet-helper');
const { checkAndDeactivateInactiveUsers } = require('../lib/user-inactivity-service');

module.exports = function createAdminServiceSettingsPage({
  db,
  encryptServiceConfig,
  decryptServiceConfig,
  sendJson,
  httpError,
}) {
  /**
   * Render HTML page for /admin/settings/service-settings
   */
  async function sendAdminServiceSettingsPage(admin, response) {
    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Service Settings &amp; Plan API - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body {
      background-color: #f0f3f8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .settings-page {
      padding: 16px 20px 40px;
    }
    .settings-titlebar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .settings-titlebar h3 {
      font-size: 20px;
      font-weight: 700;
      color: #1e3a8a;
      margin: 0;
    }
    .settings-titlebar p {
      color: #64748b;
      margin: 4px 0 0;
      font-size: 13px;
    }

    /* Multi-Button Settings Selector */
    .settings-nav-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .settings-btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .settings-tab-btn {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .settings-tab-btn:hover {
      background: #e2e8f0;
      color: #1e293b;
    }
    .settings-tab-btn.active {
      background: #1e3a8a;
      border-color: #1e3a8a;
      color: #ffffff;
      box-shadow: 0 2px 6px rgba(30, 58, 138, 0.3);
    }
    .settings-tab-btn .badge-active {
      background: #10b981;
      color: #ffffff;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      font-weight: bold;
    }
    .settings-tab-btn .badge-future {
      background: #94a3b8;
      color: #ffffff;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      font-weight: normal;
    }
    .settings-tab-btn.active .badge-future {
      background: rgba(255,255,255,0.25);
    }

    /* Card Panels */
    .settings-panel-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
      margin-bottom: 24px;
      overflow: hidden;
    }
    .settings-panel-header {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .settings-panel-header h5 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .settings-panel-body {
      padding: 20px;
    }

    /* Switch toggle */
    .custom-switch-lg .custom-control-label {
      font-size: 14px;
      font-weight: 600;
      padding-top: 2px;
      cursor: pointer;
    }

    /* Compact General Settings List */
    .general-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .general-list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #edf2f7;
      transition: background-color 0.15s ease;
      gap: 16px;
    }
    .general-list-item:last-child {
      border-bottom: none;
    }
    .general-list-item:hover {
      background-color: #f8fafc;
    }
    .general-item-left {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      flex: 1;
    }
    .general-toggle-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 50px;
      padding-top: 2px;
    }
    .compact-switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      margin: 0;
      cursor: pointer;
    }
    .compact-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .compact-slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #cbd5e1;
      transition: .25s ease;
      border-radius: 24px;
    }
    .compact-slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .25s ease;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
    }
    .compact-switch input:checked + .compact-slider {
      background-color: #10b981;
    }
    .compact-switch input:checked + .compact-slider:before {
      transform: translateX(20px);
    }
    .compact-switch-badge {
      font-size: 10px;
      font-weight: 700;
      margin-top: 3px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .compact-switch-badge.badge-on {
      color: #10b981;
    }
    .compact-switch-badge.badge-off {
      color: #94a3b8;
    }
    .general-item-content {
      flex: 1;
    }
    .general-item-title {
      font-size: 14.5px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 3px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .general-item-desc {
      font-size: 12.5px;
      color: #64748b;
      line-height: 1.45;
      margin: 0;
    }
    .general-item-controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-width: 260px;
      flex-shrink: 0;
    }
    @media (max-width: 768px) {
      .general-list-item {
        flex-direction: column;
        align-items: stretch;
      }
      .general-item-controls {
        justify-content: flex-start;
        padding-left: 66px;
        margin-top: 8px;
      }
    }

    /* Help Callout */
    .help-callout {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      border-radius: 4px;
      padding: 12px 16px;
      margin-bottom: 20px;
      font-size: 13px;
      color: #1e40af;
    }
    .help-callout strong {
      display: block;
      margin-bottom: 4px;
    }
    .help-callout ol, .help-callout ul {
      margin: 0;
      padding-left: 18px;
    }

    /* Test Box */
    .test-box-card {
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      border-radius: 6px;
      padding: 16px;
      margin-top: 20px;
    }

    /* Media Upload & Notifications */
    .upload-media-box {
      border: 2px dashed #cbd5e1;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      background: #f8fafc;
      position: relative;
      cursor: pointer;
      transition: all 0.2s;
    }
    .upload-media-box:hover {
      border-color: #3b82f6;
      background: #eff6ff;
    }
    .upload-media-box input[type="file"] {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
    .media-size-pill {
      display: inline-block;
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 12px;
      margin-bottom: 8px;
    }
    .notif-card-section {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 22px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }

    .tab-pane {
      display: none;
    }
    .tab-pane.active {
      display: block;
    }

    .lookup-result-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 16px;
      margin-top: 15px;
    }
    .lookup-badge-operator {
      background: #e0e7ff;
      color: #3730a3;
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 14px;
    }
    .lookup-badge-circle {
      background: #fef3c7;
      color: #92400e;
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      
      <!-- Admin Top Navigation -->
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
                  </ul>
                </li>
                <li><a href="/admin/seller-api/requests">Request API Approval</a></li>
                <li><a href="#" class="sub-icon">Settings <i class="fa fa-angle-down"></i></a>
                  <ul class="sub-menu">
                    <li><a href="/admin/settings/create-operator">Create Operator</a></li>
                    <li><a href="/admin/settings/show-operator">Show Operator</a></li>
                    <li><a href="/admin/settings/service-settings" class="active font-weight-bold">Service Settings</a></li>
                    <li><a href="/admin/settings/plan-api">Plan API &amp; Lookup</a></li>
                  </ul>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </div>

      <main class="main-content">
        <div class="container-fluid px-2">
          <div class="settings-page">
            
            <div class="settings-titlebar">
              <div>
                <h3><i class="fa fa-cogs mr-1"></i> System &amp; Service Settings</h3>
                <p>Configure General Settings, Email (Gmail SMTP), WhatsApp Gateway, Plan API (planapi.in / HLR Lookup), and communication channels.</p>
              </div>
            </div>

            <div id="globalAlert" role="alert" style="display:none;"></div>

            <!-- Multi-Button Settings Selector -->
            <div class="settings-nav-card">
              <div class="settings-btn-group">
                <button type="button" class="settings-tab-btn active" data-target="#tabGeneral">
                  <i class="fa fa-sliders"></i> General
                </button>
                <button type="button" class="settings-tab-btn" data-target="#tabEmail">
                  <i class="fa fa-envelope"></i> Email (Gmail SMTP)
                </button>
                <button type="button" class="settings-tab-btn" data-target="#tabWhatsapp">
                  <i class="fa fa-whatsapp"></i> WhatsApp Gateway
                </button>
                <button type="button" class="settings-tab-btn" data-target="#tabPlanApi">
                  <i class="fa fa-search"></i> PLAN API
                </button>
                <button type="button" class="settings-tab-btn" data-target="#tabMarginDiff">
                  <i class="fa fa-percent"></i> Margin Difference
                </button>
                <button type="button" class="settings-tab-btn" data-target="#tabSms">
                  <i class="fa fa-commenting-o"></i> SMS Gateway
                </button>
                <button type="button" class="settings-tab-btn" data-target="#tabIncomingSms">
                  <i class="fa fa-inbox"></i> Incoming SMS
                </button>
                <button type="button" class="settings-tab-btn" data-target="#tabTelegram">
                  <i class="fa fa-telegram"></i> Telegram Bot <span class="badge-future">Coming Soon</span>
                </button>
                <button type="button" class="settings-tab-btn" data-target="#tabPayment">
                  <i class="fa fa-credit-card"></i> Payment Gateway <span class="badge-future">Coming Soon</span>
                </button>
                <button type="button" class="settings-tab-btn" data-target="#tabNotification">
                  <i class="fa fa-bell"></i> Notification
                </button>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- 0. GENERAL SERVICE & SYSTEM SETTINGS TAB -->
            <!-- ========================================== -->
            <div class="tab-pane active" id="tabGeneral">
              <div class="settings-panel-card">
                <div class="settings-panel-header">
                  <h5><i class="fa fa-sliders text-primary"></i> General Rules &amp; Service Settings</h5>
                  <span class="badge badge-light border text-muted px-2 py-1"><i class="fa fa-cogs mr-1"></i> Global Configuration</span>
                </div>
                
                <div class="p-0">
                  <div class="general-list">
                    
                    <!-- 1. Login OTP -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Login OTP">
                            <input type="checkbox" id="loginOtpEnabled">
                            <span class="compact-slider"></span>
                          </label>
                          <span id="loginOtpEnabledStatus" class="compact-switch-badge badge-off">OFF</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-shield text-primary"></i> Login OTP
                          </h6>
                          <p class="general-item-desc">
                            When enabled, users receive an OTP via email and WhatsApp on each login attempt. Login succeeds only after entering the OTP. When disabled, login proceeds directly with password.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <span class="badge badge-light border py-2 px-3 text-dark font-weight-normal">
                          <i class="fa fa-envelope text-primary mr-1"></i> Email &amp; <i class="fa fa-whatsapp text-success mr-1"></i> WhatsApp OTP
                        </span>
                      </div>
                    </div>

                    <!-- 2. Instant Response Time -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Instant Response Time">
                            <input type="checkbox" id="instantResponseEnabled" checked>
                            <span class="compact-slider"></span>
                          </label>
                          <span id="instantResponseEnabledStatus" class="compact-switch-badge badge-on">ON</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-bolt text-warning"></i> Instant Response Time
                          </h6>
                          <p class="general-item-desc">
                            When a buyer sends a recharge request, if a Success or Fail response is received from the seller within this configured window, it will be returned as an instant response. Responses received after this window will be sent to the buyer's Callback URL.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="instantResponseSeconds" class="form-control font-weight-bold text-center" value="15" min="1" max="180">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Seconds</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 3. Complain Accept After -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Complain Accept After">
                            <input type="checkbox" id="complainAcceptAfterEnabled">
                            <span class="compact-slider"></span>
                          </label>
                          <span id="complainAcceptAfterEnabledStatus" class="compact-switch-badge badge-off">OFF</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-clock-o text-danger"></i> Complain Accept After
                          </h6>
                          <p class="general-item-desc">
                            In Instant mode, buyers can lodge disputes immediately after recharge. In Set Time mode, disputes will only be accepted after the specified delay has passed.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="d-flex align-items-center">
                          <select id="complainAcceptMode" class="form-control form-control-sm font-weight-bold mr-2" style="width: 110px;">
                            <option value="instant" selected>⚡ Instant</option>
                            <option value="delay">⏱️ Set Time</option>
                          </select>
                          <div id="complainAcceptDelayWrap" class="input-group input-group-sm" style="max-width: 155px; display: none;">
                            <input type="number" id="complainAcceptValue" class="form-control font-weight-bold text-center" value="60" min="1">
                            <div class="input-group-append">
                              <select id="complainAcceptUnit" class="custom-select custom-select-sm border-left-0 font-weight-bold" style="border-top-left-radius: 0; border-bottom-left-radius: 0;">
                                <option value="seconds" selected>Sec</option>
                                <option value="minutes">Min</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 4. Do not Accept Complain After -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Do not Accept Complain After">
                            <input type="checkbox" id="complainMaxAgeEnabled" checked>
                            <span class="compact-slider"></span>
                          </label>
                          <span id="complainMaxAgeEnabledStatus" class="compact-switch-badge badge-on">ON</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-calendar-times-o text-secondary"></i> Do not Accept Complain After
                          </h6>
                          <p class="general-item-desc">
                            Refund requests and complaints will only be accepted for recharges within the specified number of days (both via API and Panel). Transactions older than this limit cannot be disputed.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="complainMaxAgeDays" class="form-control font-weight-bold text-center" value="7" min="1" max="365">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Days</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 4b. Seller Dispute Lien Multiplier -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <span class="badge badge-warning px-2 py-1 font-weight-bold" style="background:#f59e0b;color:#fff;"><i class="fa fa-shield"></i></span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-lock text-warning"></i> Seller Dispute Lien Multiplier
                          </h6>
                          <p class="general-item-desc">
                            Multiplier of the recharge amount frozen (held on lien) on the seller's wallet when a dispute is raised. (e.g. if set to 3 and recharge is Rs 100, Rs 300 will be held on lien). If the dispute is rejected, the entire frozen amount is released.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="disputeLienMultiplier" class="form-control font-weight-bold text-center" value="1.0" min="1.0" max="20.0" step="0.5">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">X Times</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 4c. Dispute Refund Lien Retention Days -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <span class="badge badge-info px-2 py-1 font-weight-bold" style="background:#0ea5e9;color:#fff;"><i class="fa fa-clock-o"></i></span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-history text-info"></i> Dispute Refund Lien Retention Days
                          </h6>
                          <p class="general-item-desc">
                            When a disputed recharge is accepted and refunded, hold the lien amount on the seller's wallet for this many days before it is automatically released.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="disputeRefundLienDays" class="form-control font-weight-bold text-center" value="7" min="0" max="365">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Days</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 4d. Seller Wallet Redeem Request Timing -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <span class="badge badge-primary px-2 py-1 font-weight-bold" style="background:#2563eb;color:#fff;"><i class="fa fa-money"></i></span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-clock-o text-primary"></i> Seller Wallet Redeem Request Timing
                          </h6>
                          <p class="general-item-desc">
                            Seller ke wallet ka balance stock sale (recharge success) hone ke utne minute baad hi redeem request (payout) lagega. Iska count per recharge hoga (Instant ya 0 min = bina delay ke turant).
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 230px;">
                          <div class="input-group-prepend">
                            <select id="sellerWalletRedeemMode" class="custom-select custom-select-sm font-weight-bold" style="border-top-right-radius:0;border-bottom-right-radius:0;">
                              <option value="instant">Instant</option>
                              <option value="delay">After Delay</option>
                            </select>
                          </div>
                          <input type="number" id="sellerWalletRedeemMinutes" class="form-control font-weight-bold text-center" value="0" min="0" max="10080" placeholder="0">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Min</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 4e. Seller Wallet Exchange Timing -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <span class="badge badge-success px-2 py-1 font-weight-bold" style="background:#16a34a;color:#fff;"><i class="fa fa-exchange"></i></span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-arrows-h text-success"></i> Seller Wallet Exchange Timing
                          </h6>
                          <p class="general-item-desc">
                            Seller ke wallet ka balance stock sale (recharge success) hone ke utne minute baad hi seller to buyer wallet exchange hoga. Iska count per recharge hoga (Instant ya 0 min = bina delay ke turant).
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 230px;">
                          <div class="input-group-prepend">
                            <select id="sellerWalletExchangeMode" class="custom-select custom-select-sm font-weight-bold" style="border-top-right-radius:0;border-bottom-right-radius:0;">
                              <option value="instant">Instant</option>
                              <option value="delay">After Delay</option>
                            </select>
                          </div>
                          <input type="number" id="sellerWalletExchangeMinutes" class="form-control font-weight-bold text-center" value="0" min="0" max="10080" placeholder="0">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Min</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 5. Notify Pending Txn After -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Notify Pending Txn After">
                            <input type="checkbox" id="notifyPendingTxnEnabled" checked>
                            <span class="compact-slider"></span>
                          </label>
                          <span id="notifyPendingTxnEnabledStatus" class="compact-switch-badge badge-on">ON</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-whatsapp text-success"></i> Notify Pending Txn After
                          </h6>
                          <p class="general-item-desc">
                            If a recharge assigned to a seller remains pending beyond the configured minutes, an automated WhatsApp reminder will be sent to the seller to clear the transaction.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="notifyPendingTxnMinutes" class="form-control font-weight-bold text-center" value="15" min="1" max="1440">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Minutes (Min)</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 6. Stop Rehit After -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Stop Rehit After">
                            <input type="checkbox" id="stopRehitAfterEnabled" checked>
                            <span class="compact-slider"></span>
                          </label>
                          <span id="stopRehitAfterEnabledStatus" class="compact-switch-badge badge-on">ON</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-ban text-danger"></i> Stop Rehit After
                          </h6>
                          <p class="general-item-desc">
                            If the primary seller API fails after this duration, a Fail response is immediately returned to the buyer rather than re-hitting another seller.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="stopRehitAfterMinutes" class="form-control font-weight-bold text-center" value="2" min="1" max="60">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Minutes (Min)</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 6b. Fallback Sellers Count on 1st Seller Failure -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Fallback Sellers Count">
                            <input type="checkbox" id="maxSellerRetryEnabled" checked>
                            <span class="compact-slider"></span>
                          </label>
                          <span id="maxSellerRetryEnabledStatus" class="compact-switch-badge badge-on">ON</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-random text-primary"></i> Max Fallback Sellers After 1st Fail
                          </h6>
                          <p class="general-item-desc">
                            1st maximum margin wale seller se recharge fail hone ke baad recharge kitne additional sellers ke paas jayega (sirf unhi sellers ke paas jinka margin buyer margin ke barabar ya usse zyada hai).
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="maxSellerRetryCount" class="form-control font-weight-bold text-center" value="3" min="0" max="50">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Sellers</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 7. Stop Same Number/Amount for -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Stop Same Number/Amount for">
                            <input type="checkbox" id="stopSameNumberAmountEnabled" checked>
                            <span class="compact-slider"></span>
                          </label>
                          <span id="stopSameNumberAmountEnabledStatus" class="compact-switch-badge badge-on">ON</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-clone text-info"></i> Stop Same Number/Amount for
                          </h6>
                          <p class="general-item-desc">
                            Blocks duplicate recharge requests for the same mobile number and same amount from any user within the configured time window once successfully processed.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="stopSameNumberAmountMinutes" class="form-control font-weight-bold text-center" value="3" min="1" max="180">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Minutes (Min)</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 8. API Disable After Number of Fail Txn -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle API Disable After Number of Fail Txn">
                            <input type="checkbox" id="apiDisableFailTxnEnabled" checked>
                            <span class="compact-slider"></span>
                          </label>
                          <span id="apiDisableFailTxnEnabledStatus" class="compact-switch-badge badge-on">ON</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-power-off text-danger"></i> API Disable After Number of Fail Txn
                          </h6>
                          <p class="general-item-desc">
                            Automatically disables a seller API if it experiences consecutive (continuous) failures reaching this threshold. If even 1 transaction succeeds in between, the failure counter resets to 0.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="apiDisableFailTxnCount" class="form-control font-weight-bold text-center" value="5" min="1" max="500">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Fail Txn</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 8b. API Disable After Number of Pending Txn -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle API Disable After Number of Pending Txn">
                            <input type="checkbox" id="apiDisablePendingTxnEnabled" checked>
                            <span class="compact-slider"></span>
                          </label>
                          <span id="apiDisablePendingTxnEnabledStatus" class="compact-switch-badge badge-on">ON</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-pause-circle text-warning"></i> API Disable After Number of Pending Txn
                          </h6>
                          <p class="general-item-desc">
                            Agar kisi seller ke paas active pending transactions ki sankhya is limit tak ya usse zyada pahunchti hai, to seller ki API automatically inactive ho jayegi taaki us seller par mazeed orders hold na hon.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="apiDisablePendingTxnCount" class="form-control font-weight-bold text-center" value="5" min="1" max="500">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Pending Txn</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 9. API Suspend After % on Refund Txn in a Day -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle API Suspend After % on Refund Txn in a Day">
                            <input type="checkbox" id="apiSuspendRefundPercentEnabled" checked>
                            <span class="compact-slider"></span>
                          </label>
                          <span id="apiSuspendRefundPercentEnabledStatus" class="compact-switch-badge badge-on">ON</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-exclamation-triangle text-warning"></i> API Suspend After % on Refund Txn in a Day
                          </h6>
                          <p class="general-item-desc">
                            Automatically suspends a seller API if the percentage of refunded/disputed transactions exceeds this limit within a 24-hour window.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="apiSuspendRefundPercent" class="form-control font-weight-bold text-center" value="25" min="1" max="100">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">% (Percent)</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- ============================================== -->
                    <!-- PAYOUT & FUND REQUEST SETTINGS SECTION -->
                    <!-- ============================================== -->
                    <div class="px-4 py-2 bg-light border-top border-bottom d-flex align-items-center">
                      <h6 class="mb-0 font-weight-bold text-dark">
                        <i class="fa fa-money text-success mr-2"></i> Payout &amp; Fund Request Rules
                      </h6>
                      <span class="badge badge-success ml-2 px-2 py-1">Payout &amp; Fund Controls</span>
                    </div>

                    <!-- 10. Set Minimum & Maximum Payout Time Limit -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Payout Request Time Window">
                            <input type="checkbox" id="payoutTimeWindowEnabled">
                            <span class="compact-slider"></span>
                          </label>
                          <span id="payoutTimeWindowEnabledStatus" class="compact-switch-badge badge-off">OFF</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-clock-o text-primary"></i> Set Minimum &amp; Maximum Payout Time Limit (Time Window)
                          </h6>
                          <p class="general-item-desc">
                            Admin morning aur night ka time set karega. User sirf isi time ke beech payout request laga sakta hai. Uske alawa request lagane par user ko error popup show hoga: <code>Plz make payment request between [Start Time] to [End Time]</code>.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="d-flex align-items-center">
                          <div class="mr-2">
                            <label class="small text-muted font-weight-bold mb-0 d-block">Start Time (Morning)</label>
                            <input type="time" id="payoutStartTime" class="form-control form-control-sm font-weight-bold" value="09:00">
                          </div>
                          <div>
                            <label class="small text-muted font-weight-bold mb-0 d-block">End Time (Night)</label>
                            <input type="time" id="payoutEndTime" class="form-control form-control-sm font-weight-bold" value="22:00">
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 11. Payout Amount List (Min & Max Payout Amount) -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Payout Amount Limits">
                            <input type="checkbox" id="payoutAmountLimitEnabled">
                            <span class="compact-slider"></span>
                          </label>
                          <span id="payoutAmountLimitEnabledStatus" class="compact-switch-badge badge-off">OFF</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-inr text-success"></i> Payout Amount Limit (Minimum &amp; Maximum)
                          </h6>
                          <p class="general-item-desc">
                            User sirf is minimum aur maximum amount ke beech hi payout request laga sakta hai. Ye amount limit user ko payout request page par show hogi.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="d-flex align-items-center">
                          <div class="input-group input-group-sm mr-2" style="max-width: 140px;">
                            <div class="input-group-prepend"><span class="input-group-text font-weight-bold">Min ₹</span></div>
                            <input type="number" id="payoutMinAmount" class="form-control font-weight-bold text-center" value="100" min="1" step="1">
                          </div>
                          <div class="input-group input-group-sm" style="max-width: 150px;">
                            <div class="input-group-prepend"><span class="input-group-text font-weight-bold">Max ₹</span></div>
                            <input type="number" id="payoutMaxAmount" class="form-control font-weight-bold text-center" value="50000" min="1" step="1">
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 12. Set Minimum Fund Request Amount -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Minimum Fund Request Amount">
                            <input type="checkbox" id="fundRequestMinAmountEnabled">
                            <span class="compact-slider"></span>
                          </label>
                          <span id="fundRequestMinAmountEnabledStatus" class="compact-switch-badge badge-off">OFF</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-plus-circle text-info"></i> Set Minimum Fund Request Amount
                          </h6>
                          <p class="general-item-desc">
                            Admin jo minimum amount set karega user usse kam amount ka fund request nahi add kar sakta. Maximum ka koi limit nahi hoga. User fund request page me ye minimum amount show hoga.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <div class="input-group-prepend"><span class="input-group-text font-weight-bold">Min ₹</span></div>
                          <input type="number" id="fundRequestMinAmount" class="form-control font-weight-bold text-center" value="100" min="1" step="1">
                        </div>
                      </div>
                    </div>

                    <!-- 13. Set Charges for Payout (IMPS, NEFT, RTGS) -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Payout Charges">
                            <input type="checkbox" id="payoutChargesEnabled">
                            <span class="compact-slider"></span>
                          </label>
                          <span id="payoutChargesEnabledStatus" class="compact-switch-badge badge-off">OFF</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-percent text-danger"></i> Set Charges for Payout (IMPS, NEFT, RTGS)
                          </h6>
                          <p class="general-item-desc">
                            Admin IMPS, NEFT aur RTGS ke liye payout transaction charges add karega. Ye user redeem request me show hoga aur user is limit ko minus karke hi payment request laga sakega (jaise IMPS charge ₹5 aur fund balance ₹8000 hai, to user max ₹7995 ki request laga sakega aur wallet se total ₹8000 debit hoga).
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="d-flex align-items-center flex-wrap">
                          <div class="input-group input-group-sm mr-2 mb-1" style="max-width: 130px;">
                            <div class="input-group-prepend"><span class="input-group-text font-weight-bold">IMPS ₹</span></div>
                            <input type="number" id="payoutChargeImps" class="form-control font-weight-bold text-center" value="5.00" min="0" step="0.01">
                          </div>
                          <div class="input-group input-group-sm mr-2 mb-1" style="max-width: 130px;">
                            <div class="input-group-prepend"><span class="input-group-text font-weight-bold">NEFT ₹</span></div>
                            <input type="number" id="payoutChargeNeft" class="form-control font-weight-bold text-center" value="3.00" min="0" step="0.01">
                          </div>
                          <div class="input-group input-group-sm mb-1" style="max-width: 130px;">
                            <div class="input-group-prepend"><span class="input-group-text font-weight-bold">RTGS ₹</span></div>
                            <input type="number" id="payoutChargeRtgs" class="form-control font-weight-bold text-center" value="10.00" min="0" step="0.01">
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 14. Gap Time Between 2 Payout Requests -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Payout Request Cooldown Gap">
                            <input type="checkbox" id="payoutCooldownEnabled">
                            <span class="compact-slider"></span>
                          </label>
                          <span id="payoutCooldownEnabledStatus" class="compact-switch-badge badge-off">OFF</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-hourglass-half text-warning"></i> Gap Time Between 2 Payout Requests
                          </h6>
                          <p class="general-item-desc">
                            Do payout requests ke beech ka cooldown time (minutes me). User is time gap ke andar doosra payout request add nahi kar sakta.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="input-group input-group-sm" style="max-width: 175px;">
                          <input type="number" id="payoutCooldownMinutes" class="form-control font-weight-bold text-center" value="30" min="1" max="1440">
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">Minutes</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 15. Set User Inactive on Inactivity (No Buy / Sale) -->
                    <div class="general-list-item">
                      <div class="general-item-left">
                        <div class="general-toggle-box">
                          <label class="compact-switch" title="Toggle Auto-Inactive Users">
                            <input type="checkbox" id="userInactivityAutoDisableEnabled">
                            <span class="compact-slider"></span>
                          </label>
                          <span id="userInactivityAutoDisableEnabledStatus" class="compact-switch-badge badge-off">OFF</span>
                        </div>
                        <div class="general-item-content">
                          <h6 class="general-item-title">
                            <i class="fa fa-user-times text-danger"></i> Set User Inactive on Inactivity (No Buy / Sale)
                          </h6>
                          <p class="general-item-desc">
                            Isme admin jitne din set karega utne din agar kisi user ka koi Buy ya Sale transaction nahi hota to uski user ID Active se <strong>Inactive (Blocked)</strong> ho jayegi. Phir admin use <code>/admin/users/list</code> me wapas status Active kar sakta hai.
                          </p>
                        </div>
                      </div>
                      <div class="general-item-controls">
                        <div class="d-flex align-items-center flex-wrap">
                          <div class="input-group input-group-sm mr-2" style="max-width: 160px;">
                            <input type="number" id="userInactivityDays" class="form-control font-weight-bold text-center" value="30" min="1" max="365">
                            <div class="input-group-append">
                              <span class="input-group-text font-weight-bold">Days</span>
                            </div>
                          </div>
                          <button type="button" class="btn btn-sm btn-outline-danger font-weight-bold" id="btnRunInactivityCheck" title="Check & Inactivate Users with no Buy/Sale in set days">
                            <i class="fa fa-bolt mr-1"></i> Check Now
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                <div class="card-footer bg-light d-flex justify-content-between align-items-center py-3 px-4">
                  <button type="button" class="btn btn-primary px-4 font-weight-bold shadow-sm" id="btnSaveGeneralSettings">
                    <i class="fa fa-save mr-1"></i> Save General Settings
                  </button>
                  <span id="generalSettingsSaveStatus" class="font-weight-bold"></span>
                </div>

              </div>
            </div>

            <!-- ========================================== -->
            <!-- 1. EMAIL (GMAIL WEBHOOK / SMTP) SETTINGS TAB -->
            <!-- ========================================== -->
            <div class="tab-pane" id="tabEmail">
              <div class="settings-panel-card">
                <div class="settings-panel-header">
                  <h5><i class="fa fa-envelope text-primary"></i> Email Notification Configuration</h5>
                  <div class="custom-control custom-switch custom-switch-lg">
                    <input type="checkbox" class="custom-control-input" id="emailEnabled">
                    <label class="custom-control-label" for="emailEnabled" id="emailEnabledLabel">Email Disabled</label>
                  </div>
                </div>
                <div class="settings-panel-body">

                  <form id="emailForm">
                    <div class="row">
                      <div class="col-md-12 form-group">
                        <label for="emailProvider" class="font-weight-bold">Email Sending Method / Provider</label>
                        <select id="emailProvider" class="form-control form-control-lg font-weight-bold">
                          <option value="google_script" selected>🌟 Google Apps Script Webhook (Recommended for Render Cloud - HTTPS Port 443)</option>
                          <option value="gmail">Gmail SMTP (Direct Port 465 / 587)</option>
                          <option value="custom">Custom SMTP Server</option>
                        </select>
                        <small class="form-text text-muted">Google Apps Script sends real emails from your Gmail account via standard HTTPS (Port 443), completely bypassing Render cloud SMTP port blocks.</small>
                      </div>
                    </div>

                    <!-- 1.A: GOOGLE APPS SCRIPT WEBHOOK CONFIG -->
                    <div id="googleScriptSection">
                      <div class="help-callout" style="background: #f0fdf4; border-left-color: #22c55e;">
                        <strong class="text-success"><i class="fa fa-shield"></i> Quick 2-Minute Setup for Google Apps Script Webhook:</strong>
                        <ol class="mb-2 mt-1" style="padding-left: 20px;">
                          <li>Open <a href="https://script.google.com" target="_blank" class="font-weight-bold text-primary">script.google.com <i class="fa fa-external-link"></i></a> and click <strong>New Project</strong>.</li>
                          <li>Delete all existing code in the editor, click <strong>"Copy Apps Script Code"</strong> below, and paste it.</li>
                          <li>Click <strong>Deploy &rarr; New deployment</strong> &rarr; Select type: <strong>Web app</strong>.</li>
                          <li>Set <em>Execute as:</em> <strong>Me (your-gmail@gmail.com)</strong> and <em>Who has access:</em> <strong>Anyone</strong> &rarr; Click <strong>Deploy</strong>.</li>
                          <li>Authorize access, copy the generated <strong>Web app URL</strong> (starts with <code>https://script.google.com/macros/s/.../exec</code>), and paste it in the box below!</li>
                        </ol>
                        <button type="button" class="btn btn-sm btn-outline-success font-weight-bold" id="btnCopyScriptCode">
                          <i class="fa fa-copy mr-1"></i> Copy Google Apps Script Code
                        </button>
                        <span id="copyScriptStatus" class="ml-2 small text-success font-weight-bold" style="display:none;">✓ Code Copied!</span>
                      </div>

                      <div class="row">
                        <div class="col-md-8 form-group">
                          <label for="googleScriptUrl" class="font-weight-bold">Google Script Web App URL *</label>
                          <input type="url" id="googleScriptUrl" class="form-control" placeholder="https://script.google.com/macros/s/AKfycb.../exec">
                          <small class="text-muted">Generated after clicking Deploy &rarr; New deployment &rarr; Web app</small>
                        </div>
                        <div class="col-md-4 form-group">
                          <label for="googleScriptKey" class="font-weight-bold">Secret Key (Optional)</label>
                          <input type="text" id="googleScriptKey" class="form-control" placeholder="exchange_secret">
                          <small class="text-muted">Matches the <code>secretKey</code> in your Apps Script code.</small>
                        </div>
                      </div>

                      <div class="row">
                        <div class="col-md-6 form-group">
                          <label for="fromNameScript" class="font-weight-bold">Sender Display Name</label>
                          <input type="text" id="fromNameScript" class="form-control" value="Exchange Portal Admin">
                        </div>
                      </div>
                    </div>

                    <!-- 1.B: STANDARD SMTP CONFIG -->
                    <div id="smtpSection" style="display:none;">
                      <div class="help-callout">
                        <strong><i class="fa fa-info-circle"></i> Direct Gmail / SMTP Setup Guide:</strong>
                        <ol class="mb-0" style="padding-left: 20px;">
                          <li>In your Google Account, enable <strong>2-Step Verification</strong>.</li>
                          <li>Go to <em>Security &rarr; 2-Step Verification &rarr; App Passwords</em>.</li>
                          <li>Create an App Password (name: <code>Exchange Portal</code>) and copy the 16-character key.</li>
                          <li>Enter your Gmail in Username and the 16-character App Password below.</li>
                        </ol>
                      </div>

                      <div class="row">
                        <div class="col-md-5 form-group">
                          <label for="smtpHost" class="font-weight-bold">SMTP Host *</label>
                          <input type="text" id="smtpHost" class="form-control" value="smtp.gmail.com">
                        </div>

                        <div class="col-md-3 form-group">
                          <label for="smtpPort" class="font-weight-bold">Port *</label>
                          <input type="number" id="smtpPort" class="form-control" value="465">
                        </div>

                        <div class="col-md-4 form-group">
                          <label for="smtpEncryption" class="font-weight-bold">Security / Encryption</label>
                          <select id="smtpEncryption" class="form-control">
                            <option value="ssl" selected>SSL (Port 465)</option>
                            <option value="tls">TLS / STARTTLS (Port 587)</option>
                          </select>
                        </div>
                      </div>

                      <div class="row">
                        <div class="col-md-6 form-group">
                          <label for="smtpUser" class="font-weight-bold">SMTP Username / Gmail Address *</label>
                          <input type="email" id="smtpUser" class="form-control" placeholder="yourcompany@gmail.com">
                        </div>

                        <div class="col-md-6 form-group">
                          <label for="smtpPass" class="font-weight-bold">Password / App Password (16-char) *</label>
                          <div class="input-group">
                            <input type="password" id="smtpPass" class="form-control font-monospace" placeholder="•••• •••• •••• ••••" autocomplete="new-password">
                            <div class="input-group-append">
                              <button type="button" class="btn btn-outline-secondary btn-toggle-pw" data-for="#smtpPass">
                                <i class="fa fa-eye"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div class="row">
                        <div class="col-md-6 form-group">
                          <label for="fromEmail" class="font-weight-bold">Sender Email (From)</label>
                          <input type="email" id="fromEmail" class="form-control" placeholder="Same as Gmail username if empty">
                        </div>

                        <div class="col-md-6 form-group">
                          <label for="fromName" class="font-weight-bold">Sender Name (From Display Name)</label>
                          <input type="text" id="fromName" class="form-control" value="Exchange Portal Admin">
                        </div>
                      </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                      <button type="submit" class="btn btn-primary" id="btnSaveEmail">
                        <i class="fa fa-save mr-1"></i> Save Email Settings
                      </button>
                      <span class="text-muted small" id="emailSaveStatus"></span>
                    </div>
                  </form>

                  <!-- Test SMTP / Webhook Email Box -->
                  <div class="test-box-card">
                    <h6 class="font-weight-bold text-dark mb-2"><i class="fa fa-paper-plane text-primary mr-1"></i> Test Email Delivery</h6>
                    <p class="text-muted small mb-3">Send a real test email to verify your email configuration.</p>
                    <div class="row align-items-end">
                      <div class="col-md-8 form-group mb-md-0">
                        <label for="testEmailRecipient" class="small font-weight-bold">Recipient Email Address</label>
                        <input type="email" id="testEmailRecipient" class="form-control" placeholder="yourpersonal@gmail.com">
                      </div>
                      <div class="col-md-4">
                        <button type="button" class="btn btn-success btn-block" id="btnSendTestEmail">
                          <i class="fa fa-paper-plane mr-1"></i> Send Test Email
                        </button>
                      </div>
                    </div>
                    <div id="testEmailAlert" class="mt-3" style="display: none;"></div>
                  </div>

                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- 2. WHATSAPP GATEWAY SETTINGS TAB -->
            <!-- ========================================== -->
            <div class="tab-pane" id="tabWhatsapp">
              <div class="settings-panel-card">
                <div class="settings-panel-header">
                  <h5><i class="fa fa-whatsapp text-success"></i> WhatsApp Gateway Integration</h5>
                  <div class="custom-control custom-switch custom-switch-lg">
                    <input type="checkbox" class="custom-control-input" id="whatsappEnabled">
                    <label class="custom-control-label" for="whatsappEnabled" id="whatsappEnabledLabel">WhatsApp Disabled</label>
                  </div>
                </div>
                <div class="settings-panel-body">
                  
                  <div class="help-callout">
                    <strong><i class="fa fa-info-circle"></i> WhatsApp Gateway Instructions:</strong>
                    <p class="mb-1">You can configure any HTTP GET or POST WhatsApp API provider.</p>
                    <p class="mb-0">Supported dynamic replacement keywords: <code>[MOBILE_NO]</code> (10-digit mobile) and <code>[CONTENT]</code> (message content).</p>
                  </div>

                  <form id="whatsappForm">
                    
                    <!-- Keyword Buttons Bar -->
                    <div class="form-group mb-3">
                      <label class="font-weight-bold mb-1">Dynamic Keywords:</label>
                      <div class="d-flex flex-wrap align-items-center" style="gap: 8px;">
                        <button type="button" class="btn btn-sm btn-outline-success font-weight-bold btn-insert-keyword" data-keyword="[MOBILE_NO]">
                          <i class="fa fa-phone mr-1"></i> [MOBILE_NO]
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-primary font-weight-bold btn-insert-keyword" data-keyword="[CONTENT]">
                          <i class="fa fa-comment-o mr-1"></i> [CONTENT]
                        </button>
                        <small class="text-muted ml-md-auto font-weight-normal">(Click keyword button to insert into focused field)</small>
                      </div>
                    </div>

                    <div class="row">
                      <div class="col-md-3 form-group">
                        <label for="waRequestType" class="font-weight-bold">Request Type *</label>
                        <select id="waRequestType" class="form-control font-weight-bold">
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                        </select>
                      </div>

                      <div class="col-md-9 form-group">
                        <label for="waApiUrl" class="font-weight-bold">API URL *</label>
                        <input type="text" id="waApiUrl" class="form-control font-monospace" placeholder="https://api.whatsapp-gateway.com/send?apikey=YOUR_KEY&mobile=[MOBILE_NO]&msg=[CONTENT]" required>
                        <small class="form-text text-muted">Enter full gateway URL including query parameters with <code>[MOBILE_NO]</code> and <code>[CONTENT]</code></small>
                      </div>
                    </div>

                    <!-- POST Options (Payload and Headers) -->
                    <div class="row" id="waPostOptionsRow" style="display: none;">
                      <div class="col-md-8 form-group">
                        <label for="waPostBody" class="font-weight-bold">POST Body / Payload (Optional)</label>
                        <textarea id="waPostBody" class="form-control font-monospace" rows="3" placeholder='{"number": "[MOBILE_NO]", "message": "[CONTENT]"}'></textarea>
                        <small class="form-text text-muted">Use <code>[MOBILE_NO]</code> and <code>[CONTENT]</code> inside JSON payload if sending via POST body.</small>
                      </div>
                      <div class="col-md-4 form-group">
                        <label for="waHeaders" class="font-weight-bold">Custom Headers (Optional)</label>
                        <textarea id="waHeaders" class="form-control font-monospace" rows="3" placeholder="Authorization: Bearer YOUR_TOKEN&#10;Content-Type: application/json"></textarea>
                        <small class="form-text text-muted">One header per line (e.g. <code>Header: Value</code>)</small>
                      </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                      <button type="submit" class="btn btn-primary" id="btnSaveWhatsapp">
                        <i class="fa fa-save mr-1"></i> Save WhatsApp Settings
                      </button>
                      <span class="text-muted small" id="whatsappSaveStatus"></span>
                    </div>
                  </form>

                  <!-- Test WhatsApp Box -->
                  <div class="test-box-card">
                    <h6 class="font-weight-bold text-dark mb-2"><i class="fa fa-whatsapp text-success mr-1"></i> Test WhatsApp Gateway Message</h6>
                    <p class="text-muted small mb-3">Send a test message to verify your API URL, method, and keyword replacements live.</p>
                    <div class="row align-items-end">
                      <div class="col-md-4 form-group mb-md-0">
                        <label for="testWaRecipient" class="small font-weight-bold">Mobile Number</label>
                        <input type="text" id="testWaRecipient" class="form-control" placeholder="10-digit mobile (e.g. 9876543210)">
                      </div>
                      <div class="col-md-5 form-group mb-md-0">
                        <label for="testWaMessage" class="small font-weight-bold">Test Message Content</label>
                        <input type="text" id="testWaMessage" class="form-control" value="Hello! This is a test WhatsApp message from Exchange Portal.">
                      </div>
                      <div class="col-md-3">
                        <button type="button" class="btn btn-success btn-block" id="btnSendTestWhatsapp">
                          <i class="fa fa-paper-plane mr-1"></i> Send Test Message
                        </button>
                      </div>
                    </div>
                    <div id="testWaAlert" class="mt-3" style="display: none;"></div>
                  </div>

                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- 3. PLAN API TAB                            -->
            <!-- ========================================== -->
            <div class="tab-pane" id="tabPlanApi">
              <div class="settings-panel-card">
                <div class="settings-panel-header">
                  <div>
                    <h5 class="mb-1"><i class="fa fa-search text-info"></i> PLAN API</h5>
                    <small class="text-muted">Live HLR Operator, Circle &amp; R-Offer Fetch Engine</small>
                  </div>
                  <div class="custom-control custom-switch custom-switch-lg">
                    <input type="checkbox" class="custom-control-input" id="planApiEnabled" checked>
                    <label class="custom-control-label" for="planApiEnabled" id="planApiEnabledLabel">PLAN API Enabled</label>
                  </div>
                </div>
                <div class="settings-panel-body">

                  <!-- Active Brand & Protocol Ribbon -->
                  <div class="d-flex align-items-center justify-content-between p-2 mb-3 bg-light rounded border flex-wrap" style="gap: 8px;">
                    <div class="d-flex align-items-center flex-wrap" style="gap: 8px;">
                      <span class="small font-weight-bold text-dark mr-2"><i class="fa fa-tags text-primary"></i> Active Provider:</span>
                      <span class="badge badge-success px-3 py-2 font-weight-bold" style="font-size: 0.95rem;">
                        <i class="fa fa-bolt mr-1"></i> Plan API (EZYTM)
                      </span>
                      <span class="badge badge-info px-2 py-2">
                        <i class="fa fa-globe mr-1"></i> Check Circle (OperatorFetchNew)
                      </span>
                      <span class="badge badge-warning px-2 py-2 text-dark">
                        <i class="fa fa-gift mr-1"></i> Check R-Offer (RofferCheck)
                      </span>
                    </div>
                    <div>
                      <span class="badge badge-primary px-2 py-1"><i class="fa fa-check-circle mr-1"></i> Backend Auto-Configured</span>
                    </div>
                  </div>

                  <!-- Specification Callout -->
                  <div class="alert alert-info py-2 px-3 mb-3 border">
                    <div class="d-flex align-items-start">
                      <i class="fa fa-info-circle text-primary fa-lg mr-2 mt-1"></i>
                      <div class="w-100">
                        <strong>Plan API (EZYTM) Integration &amp; Backend Endpoint Specifications:</strong>
                        <div class="mt-2 font-monospace small bg-white p-2 rounded border text-dark">
                          <div><strong>1. Check Circle:</strong> <code>https://planapi.in/api/Mobile/OperatorFetchNew?ApiUserID=[ApiUserID]&amp;ApiPassword=[ApiPassword]&amp;Mobileno=[Mobileno]</code></div>
                          <div class="mt-1"><strong>2. Check R-Offer:</strong> <code>https://planapi.in/api/Mobile/RofferCheck?apimember_id=[apimember_id]&amp;api_password=[api_password]&amp;operator_code=[OpCode]&amp;mobile_no=[mobile_no]</code></div>
                        </div>

                        <div class="mt-2 text-dark small">
                          <i class="fa fa-arrow-circle-right text-success mr-1"></i>
                          <strong>Configuration Note:</strong> Check Circle aur Check R-Offer dono ke URLs backend se automatically configured hain. Yahan form me sirf <strong>Choose Provider</strong> aur apna <strong>User ID &amp; Password</strong> submit karna hai.
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Provider & Credentials Form (No URL fields shown) -->
                  <form id="planApiForm" class="bg-light p-3 rounded border mb-4">
                    <h6 class="font-weight-bold text-dark mb-3">
                      <i class="fa fa-cogs text-primary mr-1"></i> Provider &amp; Credentials Configuration
                    </h6>

                    <div class="row">
                      <div class="col-md-12 form-group">
                        <label for="planApiProvider" class="font-weight-bold small text-dark">
                          Choose Provider <span class="text-danger">*</span>
                        </label>
                        <select id="planApiProvider" class="form-control font-weight-bold" required>
                          <option value="ezytm" selected>Plan API (EZYTM)</option>
                        </select>
                        <small class="form-text text-muted">Select active Plan API provider for Circle and R-Offer lookups</small>
                      </div>
                    </div>

                    <div class="row">
                      <div class="col-md-6 form-group">
                        <label for="ezytmApiUserId" class="font-weight-bold small text-dark">
                          User ID / Member ID <span class="text-danger">*</span>
                        </label>
                        <input type="text" id="ezytmApiUserId" class="form-control font-monospace font-weight-bold" placeholder="e.g. 5100" value="5100" required>
                        <small class="form-text text-muted">Your registered MemberID credentials (apimember_id / ApiUserID)</small>
                      </div>

                      <div class="col-md-6 form-group">
                        <label for="ezytmApiPassword" class="font-weight-bold small text-dark">
                          Password / API Password <span class="text-danger">*</span>
                        </label>
                        <div class="input-group">
                          <input type="password" id="ezytmApiPassword" class="form-control font-monospace font-weight-bold" placeholder="Enter ApiPassword" value="amart@74" required>
                          <div class="input-group-append">
                            <button type="button" class="btn btn-outline-secondary btn-toggle-pw" data-for="#ezytmApiPassword">
                              <i class="fa fa-eye"></i>
                            </button>
                          </div>
                        </div>
                        <small class="form-text text-muted">Your registered security password credentials (api_password / ApiPassword)</small>
                      </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                      <button type="submit" class="btn btn-primary font-weight-bold px-4" id="btnSavePlanApi">
                        <i class="fa fa-save mr-1"></i> Save PLAN API Settings
                      </button>
                      <span class="small font-weight-bold" id="planApiSaveStatus"></span>
                    </div>
                  </form>

                  <!-- ============================================== -->
                  <!-- 1. CHECK CIRCLE (OPERATOR & CIRCLE LOOKUP)     -->
                  <!-- ============================================== -->
                  <div class="test-box-card mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                      <h6 class="font-weight-bold text-dark mb-0">
                        <i class="fa fa-globe text-primary mr-1"></i> 1. Check Circle &amp; Operator Lookup
                      </h6>
                      <span class="badge badge-light border text-muted font-monospace small">OperatorFetchNew</span>
                    </div>
                    <p class="text-muted small mb-3">
                      Recharge request aane par customer number ka <strong>Operator aur Circle</strong> live fetch hota hai aur usi ke hisab se highest seller margin check hoke recharge route hota hai.
                    </p>
                    <div class="row align-items-end">
                      <div class="col-md-8 form-group mb-md-0">
                        <label for="testPlanApiMobile" class="small font-weight-bold">10-Digit Mobile Number</label>
                        <input type="tel" id="testPlanApiMobile" class="form-control font-weight-bold font-monospace" placeholder="e.g. 9335819686" value="9335819686" maxlength="10">
                      </div>
                      <div class="col-md-4">
                        <button type="button" class="btn btn-info btn-block font-weight-bold text-white" id="btnTestPlanApi">
                          <i class="fa fa-search mr-1"></i> Fetch Operator &amp; Circle
                        </button>
                      </div>
                    </div>

                    <div id="testPlanApiAlert" class="mt-3" style="display: none;"></div>

                    <!-- Dynamic Lookup Result Box -->
                    <div id="planApiResultContainer" style="display: none;" class="mt-3">
                      <div class="lookup-result-card shadow-sm p-3 border rounded bg-white">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                          <h6 class="font-weight-bold text-dark mb-0">
                            <i class="fa fa-check-circle text-success mr-1"></i> Operator Lookup Result
                            <span class="badge badge-primary ml-2 py-1 px-2" id="resBrandBadge">Plan API (EZYTM)</span>
                          </h6>
                          <span id="planApiLatency" class="badge badge-secondary py-1 px-2"></span>
                        </div>
                        <div class="row">
                          <div class="col-md-6 mb-2">
                            <span class="text-muted small d-block mb-1">Detected Operator:</span>
                            <span id="resOperatorName" class="lookup-badge-operator font-weight-bold px-2 py-1 bg-light border rounded d-inline-block"></span>
                          </div>
                          <div class="col-md-6 mb-2">
                            <span class="text-muted small d-block mb-1">Detected Circle (State):</span>
                            <span id="resCircleName" class="lookup-badge-circle font-weight-bold px-2 py-1 bg-light border rounded d-inline-block"></span>
                          </div>
                        </div>
                        <div class="row mt-2">
                          <div class="col-md-12">
                            <div class="small p-2 bg-light rounded border text-muted" id="resDbMatch"></div>
                          </div>
                        </div>
                        <div class="mt-3">
                          <a class="small text-primary font-weight-bold" data-toggle="collapse" href="#rawPlanApiResponse" role="button">
                            <i class="fa fa-code mr-1"></i> View Raw Server Response
                          </a>
                          <div class="collapse mt-2" id="rawPlanApiResponse">
                            <pre class="bg-dark text-light p-2 rounded small font-monospace" id="resRawPayload" style="max-height: 180px; overflow-y: auto;"></pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- ============================================== -->
                  <!-- 2. CHECK R-OFFER (ROFFERCHECK) SECTION         -->
                  <!-- ============================================== -->
                  <div class="test-box-card border-top pt-4">
                    <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                      <h6 class="font-weight-bold text-dark mb-0">
                        <i class="fa fa-gift text-success mr-1"></i> 2. Check R-Offer (Special Recharge Offers)
                      </h6>
                      <span class="badge badge-light border text-muted font-monospace small">RofferCheck</span>
                    </div>
                    <p class="text-muted small mb-3">
                      Plan API (EZYTM) ke live <strong>RofferCheck</strong> engine se kisi bhi mobile number ke live personalized R-Offers (special recharge plans) check karein:
                      <br><code class="text-muted font-monospace small">https://planapi.in/api/Mobile/RofferCheck?apimember_id=...&amp;api_password=...&amp;operator_code=[OpCode]&amp;mobile_no=...</code>
                    </p>
                    <div class="row align-items-end">
                      <div class="col-md-5 form-group mb-md-0">
                        <label for="testRofferMobile" class="small font-weight-bold">10-Digit Mobile Number</label>
                        <input type="tel" id="testRofferMobile" class="form-control font-weight-bold font-monospace" placeholder="e.g. 9335819686" value="9335819686" maxlength="10">
                      </div>
                      <div class="col-md-4 form-group mb-md-0">
                        <label for="testRofferOpCode" class="small font-weight-bold">Operator Code (OpCode)</label>
                        <select id="testRofferOpCode" class="form-control font-weight-bold">
                          <option value="2">Airtel (Code: 2)</option>
                          <option value="1">Idea / Vodafone (Code: 1)</option>
                          <option value="3">Jio (Code: 3)</option>
                          <option value="4">BSNL (Code: 4)</option>
                          <option value="AT">Airtel (AT)</option>
                          <option value="VI">VI (Vodafone Idea)</option>
                          <option value="JIO">JIO</option>
                        </select>
                      </div>
                      <div class="col-md-3">
                        <button type="button" class="btn btn-success btn-block font-weight-bold text-white" id="btnTestRoffer">
                          <i class="fa fa-gift mr-1"></i> Check R-Offer
                        </button>
                      </div>
                    </div>

                    <div id="testRofferAlert" class="mt-3" style="display: none;"></div>

                    <!-- Dynamic R-Offer Result Box -->
                    <div id="rofferResultContainer" style="display: none;" class="mt-3">
                      <div class="lookup-result-card shadow-sm p-3 border rounded bg-white">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                          <h6 class="font-weight-bold text-dark mb-0">
                            <i class="fa fa-tags text-success mr-1"></i> Available R-Offers
                            <span class="badge badge-success ml-2 py-1 px-2" id="rofferCountBadge">0 Offers</span>
                          </h6>
                          <span id="rofferLatency" class="badge badge-secondary py-1 px-2"></span>
                        </div>

                        <div id="rofferOffersTableWrap" class="table-responsive" style="max-height: 320px; overflow-y: auto;">
                          <table class="table table-bordered table-sm table-hover mb-0">
                            <thead class="thead-light">
                              <tr>
                                <th style="width: 100px;">Price (₹)</th>
                                <th>Offer / Plan Details</th>
                              </tr>
                            </thead>
                            <tbody id="rofferOffersTableBody"></tbody>
                          </table>
                        </div>

                        <div class="mt-3">
                          <a class="small text-primary font-weight-bold" data-toggle="collapse" href="#rawRofferResponse" role="button">
                            <i class="fa fa-code mr-1"></i> View Raw Server Response
                          </a>
                          <div class="collapse mt-2" id="rawRofferResponse">
                            <pre class="bg-dark text-light p-2 rounded small font-monospace" id="resRofferRawPayload" style="max-height: 180px; overflow-y: auto;"></pre>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- 4. MARGIN DIFFERENCE CONFIGURATION TAB -->
            <!-- ========================================== -->
            <div class="tab-pane" id="tabMarginDiff">
              <div class="settings-panel-card">
                <div class="settings-panel-header">
                  <h5><i class="fa fa-percent text-success"></i> Margin Difference Configuration</h5>
                  <div class="custom-control custom-switch custom-switch-lg">
                    <input type="checkbox" class="custom-control-input" id="marginDiffEnabled" checked>
                    <label class="custom-control-label" for="marginDiffEnabled" id="marginDiffEnabledLabel">Margin Difference Active</label>
                  </div>
                </div>
                <div class="settings-panel-body">
                  
                  <div class="help-callout">
                    <strong><i class="fa fa-info-circle"></i> Margin Difference Business Rule:</strong>
                    <p class="mb-1">
                      Available Stock me Buyer ko Seller dwara set kiye gaye commission se yeh <strong>Margin Difference</strong> kam hokar show hota hai aur Buyer ke recharge par yeh rate lagta hai.
                    </p>
                    <p class="mb-0 small text-muted">
                      <em>Example:</em> Agar Seller ne commission <strong>4.00%</strong> set kiya hai aur yahan Margin Difference <strong>0.10%</strong> set hai, toh Available Stock me Buyer ko <strong>3.90%</strong> show hoga aur transaction 3.90% margin par process hoga.
                    </p>
                  </div>

                  <form id="marginDiffForm">
                    <div class="row">
                      <div class="col-md-6 form-group">
                        <label for="marginDifferencePercent" class="font-weight-bold">Margin Difference Percent (%) *</label>
                        <div class="input-group">
                          <input type="number" step="0.01" min="0" max="100" id="marginDifferencePercent" class="form-control font-weight-bold font-monospace" value="0.10" required>
                          <div class="input-group-append">
                            <span class="input-group-text font-weight-bold">%</span>
                          </div>
                        </div>
                        <small class="form-text text-muted">Deducted from Seller's Commission when displaying Available Stock and processing Buyer recharges.</small>
                      </div>

                      <div class="col-md-6 form-group">
                        <label for="marginDiffDescription" class="font-weight-bold">Description / System Note</label>
                        <input type="text" id="marginDiffDescription" class="form-control" value="System margin difference deduction (Seller vs Buyer)">
                        <small class="form-text text-muted">Internal note for reference.</small>
                      </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                      <button type="submit" class="btn btn-primary font-weight-bold" id="btnSaveMarginDiff">
                        <i class="fa fa-save mr-1"></i> Save Margin Difference
                      </button>
                      <span class="text-muted small" id="marginDiffSaveStatus"></span>
                    </div>
                  </form>

                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- 5. SMS GATEWAY TAB -->
            <!-- ========================================== -->
            <div class="tab-pane" id="tabSms">
              <div class="settings-panel-card">
                <div class="settings-panel-header">
                  <h5><i class="fa fa-commenting-o text-info"></i> SMS Gateway Integration</h5>
                  <div class="custom-control custom-switch custom-switch-lg">
                    <input type="checkbox" class="custom-control-input" id="smsEnabled">
                    <label class="custom-control-label" for="smsEnabled" id="smsEnabledLabel">SMS Disabled</label>
                  </div>
                </div>
                <div class="settings-panel-body">
                  
                  <div class="help-callout">
                    <strong><i class="fa fa-info-circle"></i> SMS Gateway Instructions:</strong>
                    <p class="mb-1">You can configure any HTTP GET or POST SMS API provider (e.g., Easy Recharge Solution / DLTI / Fast2SMS / Msg91).</p>
                    <p class="mb-1">Default Gateway URL format: <code>https://services.easyrechargesolution.com/api/sms/send?token=YOUR_AUTH_BEARER_TOKEN&amp;recipient=[RECIPIENT]&amp;message=[MESSAGE]&amp;simSlot=0</code></p>
                    <p class="mb-0">Supported dynamic replacement keywords: <code>[RECIPIENT]</code> or <code>[MOBILE_NO]</code> (10-digit mobile), <code>[MESSAGE]</code> or <code>[CONTENT]</code> (SMS text - strictly locked to max 160 characters), and <code>[SIM_SLOT]</code> (default 0).</p>
                  </div>

                  <form id="smsForm">
                    
                    <!-- Keyword Buttons Bar -->
                    <div class="form-group mb-3">
                      <label class="font-weight-bold mb-1">Dynamic Keywords:</label>
                      <div class="d-flex flex-wrap align-items-center" style="gap: 8px;">
                        <button type="button" class="btn btn-sm btn-outline-info font-weight-bold btn-insert-keyword" data-keyword="[RECIPIENT]">
                          <i class="fa fa-phone mr-1"></i> [RECIPIENT]
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-success font-weight-bold btn-insert-keyword" data-keyword="[MOBILE_NO]">
                          <i class="fa fa-mobile mr-1"></i> [MOBILE_NO]
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-primary font-weight-bold btn-insert-keyword" data-keyword="[MESSAGE]">
                          <i class="fa fa-comment-o mr-1"></i> [MESSAGE]
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary font-weight-bold btn-insert-keyword" data-keyword="[CONTENT]">
                          <i class="fa fa-align-left mr-1"></i> [CONTENT]
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-warning font-weight-bold btn-insert-keyword" data-keyword="[SIM_SLOT]">
                          <i class="fa fa-microchip mr-1"></i> [SIM_SLOT]
                        </button>
                        <small class="text-muted ml-md-auto font-weight-normal">(Click keyword button to insert into focused field)</small>
                      </div>
                    </div>

                    <div class="row">
                      <div class="col-md-2 form-group">
                        <label for="smsRequestType" class="font-weight-bold">Request Type *</label>
                        <select id="smsRequestType" class="form-control font-weight-bold">
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                        </select>
                      </div>

                      <div class="col-md-8 form-group">
                        <label for="smsApiUrl" class="font-weight-bold">API URL *</label>
                        <input type="text" id="smsApiUrl" class="form-control font-monospace" placeholder="https://services.easyrechargesolution.com/api/sms/send?token=YOUR_AUTH_BEARER_TOKEN&recipient=[RECIPIENT]&message=[MESSAGE]&simSlot=0" required>
                        <small class="form-text text-muted">Enter full gateway URL including query parameters with <code>[RECIPIENT]</code> and <code>[MESSAGE]</code></small>
                      </div>

                      <div class="col-md-2 form-group">
                        <label for="smsSimSlot" class="font-weight-bold">SIM Slot</label>
                        <input type="text" id="smsSimSlot" class="form-control font-monospace" placeholder="0" value="0">
                        <small class="form-text text-muted">Default SIM slot (0 or 1)</small>
                      </div>
                    </div>

                    <!-- POST Options (Payload and Headers) -->
                    <div class="row" id="smsPostOptionsRow" style="display: none;">
                      <div class="col-md-8 form-group">
                        <label for="smsPostBody" class="font-weight-bold">POST Body / Payload (Optional)</label>
                        <textarea id="smsPostBody" class="form-control font-monospace" rows="3" placeholder='{"recipient": "[RECIPIENT]", "message": "[MESSAGE]", "simSlot": "[SIM_SLOT]"}'></textarea>
                        <small class="form-text text-muted">Use <code>[RECIPIENT]</code> and <code>[MESSAGE]</code> inside JSON payload if sending via POST body.</small>
                      </div>
                      <div class="col-md-4 form-group">
                        <label for="smsHeaders" class="font-weight-bold">Custom Headers (Optional)</label>
                        <textarea id="smsHeaders" class="form-control font-monospace" rows="3" placeholder="Authorization: Bearer YOUR_TOKEN&#10;Content-Type: application/json"></textarea>
                        <small class="form-text text-muted">One header per line (e.g. <code>Header: Value</code>)</small>
                      </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                      <button type="submit" class="btn btn-primary" id="btnSaveSms">
                        <i class="fa fa-save mr-1"></i> Save SMS Settings
                      </button>
                      <span class="text-muted small" id="smsSaveStatus"></span>
                    </div>
                  </form>

                  <!-- Test SMS Box -->
                  <div class="test-box-card">
                    <h6 class="font-weight-bold text-dark mb-2"><i class="fa fa-commenting-o text-info mr-1"></i> Test SMS Gateway Message</h6>
                    <p class="text-muted small mb-3">Send a test SMS to verify your API URL, method, and keyword replacements live.</p>
                    <div class="row align-items-end">
                      <div class="col-md-4 form-group mb-md-0">
                        <label for="testSmsRecipient" class="small font-weight-bold">Mobile Number</label>
                        <input type="text" id="testSmsRecipient" class="form-control" placeholder="10-digit mobile (e.g. 9876543210)">
                      </div>
                      <div class="col-md-5 form-group mb-md-0">
                        <div class="d-flex justify-content-between">
                          <label for="testSmsMessage" class="small font-weight-bold">Test SMS Message</label>
                          <small class="text-muted font-weight-bold" id="testSmsCounter">0/160</small>
                        </div>
                        <input type="text" id="testSmsMessage" class="form-control" maxlength="160" value="Hello! This is a test SMS message from Exchange Portal.">
                      </div>
                      <div class="col-md-3">
                        <button type="button" class="btn btn-info btn-block" id="btnSendTestSms">
                          <i class="fa fa-paper-plane mr-1"></i> Send Test SMS
                        </button>
                      </div>
                    </div>
                    <div id="testSmsAlert" class="mt-3" style="display: none;"></div>
                  </div>

                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- 5.5 INCOMING SMS & WEBHOOK TAB -->
            <!-- ========================================== -->
            <div class="tab-pane" id="tabIncomingSms">
              <div class="settings-panel-card">
                <div class="settings-panel-header">
                  <h5><i class="fa fa-inbox text-primary"></i> Incoming SMS &amp; Webhook Receiver (Auto Payment Topup)</h5>
                  <div class="custom-control custom-switch custom-switch-lg">
                    <input type="checkbox" class="custom-control-input" id="incomingSmsEnabled" checked>
                    <label class="custom-control-label" for="incomingSmsEnabled" id="incomingSmsEnabledLabel">Incoming SMS Enabled</label>
                  </div>
                </div>
                <div class="settings-panel-body">

                  <div class="help-callout">
                    <strong><i class="fa fa-info-circle"></i> Automated Buyer Payment Approval:</strong>
                    <p class="mb-1">Configure your SMS forwarder app (e.g. Android SMS Forwarder / Tasker / MacroDroid / SMS Gateway) to forward all incoming bank transaction SMS to the Webhook URL below.</p>
                    <p class="mb-1">When an incoming bank SMS arrives with a credited amount and UTR / UPI reference number, the system automatically verifies and approves the buyer's pending Wallet Fund Request instantly!</p>
                    <p class="mb-0">Supported Methods: <code>POST</code> (JSON or Form URL-encoded) and <code>GET</code> query parameters.</p>
                  </div>

                  <form id="incomingSmsForm">
                    <div class="row">
                      <div class="col-md-8 form-group">
                        <label class="font-weight-bold text-dark mb-1">
                          <i class="fa fa-link text-primary mr-1"></i> Incoming SMS Webhook URL *
                        </label>
                        <div class="input-group">
                          <input type="text" id="serviceIncomingSmsWebhookUrl" class="form-control font-monospace" readonly value="">
                          <div class="input-group-append">
                            <button type="button" class="btn btn-outline-primary font-weight-bold" id="btnCopyServiceWebhookUrl">
                              <i class="fa fa-copy mr-1"></i> Copy URL
                            </button>
                          </div>
                        </div>
                        <small class="form-text text-muted">Set this URL in your SMS forwarder app or message panel webhook settings.</small>
                      </div>

                      <div class="col-md-4 form-group">
                        <label for="incomingSmsSecretKey" class="font-weight-bold text-dark mb-1">
                          <i class="fa fa-key text-warning mr-1"></i> Webhook Secret Key / Token (Optional)
                        </label>
                        <div class="input-group">
                          <input type="text" id="incomingSmsSecretKey" class="form-control font-monospace" placeholder="e.g. secret_token_xyz">
                          <div class="input-group-append">
                            <button type="button" class="btn btn-outline-secondary" id="btnGenSecretKey" title="Generate Random Key">
                              <i class="fa fa-refresh"></i>
                            </button>
                          </div>
                        </div>
                        <small class="form-text text-muted">Leave empty to accept messages without token authentication.</small>
                      </div>
                    </div>

                    <div class="row">
                      <div class="col-md-6 form-group">
                        <div class="card p-3 bg-light border">
                          <div class="custom-control custom-checkbox">
                            <input type="checkbox" class="custom-control-input" id="incomingSmsAutoCredit" checked>
                            <label class="custom-control-label font-weight-bold text-dark" for="incomingSmsAutoCredit">
                              <i class="fa fa-bolt text-warning mr-1"></i> Auto-Update Buyer Payment Request
                            </label>
                          </div>
                          <small class="text-muted mt-1 d-block">
                            When enabled, pending buyer fund requests with matching UTR reference numbers will be automatically approved and credited to the buyer wallet immediately upon SMS arrival.
                          </small>
                        </div>
                      </div>

                      <div class="col-md-6 form-group">
                        <label for="incomingSmsAllowedSenders" class="font-weight-bold text-dark mb-1">
                          <i class="fa fa-filter text-info mr-1"></i> Bank Sender Whitelist (Optional)
                        </label>
                        <input type="text" id="incomingSmsAllowedSenders" class="form-control" placeholder="SBI, HDFC, ICICI, AXIS, PNB, BOB, KOTAK (or leave blank for all)">
                        <small class="form-text text-muted">Comma-separated sender IDs or bank names to accept. Leave blank to process all incoming SMS.</small>
                      </div>
                    </div>

                    <!-- Webhook Parameters Reference -->
                    <div class="card mb-3 border-info" style="background:#f0f9ff; border-radius:8px;">
                      <div class="card-body p-3">
                        <div class="font-weight-bold text-primary mb-2" style="font-size:13px;">
                          <i class="fa fa-code mr-1"></i> Supported Webhook Request Formats:
                        </div>
                        <div class="row">
                          <div class="col-md-6">
                            <div class="small font-weight-bold mb-1">1. HTTP POST JSON Payload:</div>
                            <pre class="bg-dark text-success p-2 rounded small mb-2 font-monospace">{
  "sender": "VM-SBIINB",
  "message": "Dear User, A/C ... credited by Rs 2000 ... ref 430291827364",
  "sim": "0",
  "token": "YOUR_SECRET_KEY"
}</pre>
                          </div>
                          <div class="col-md-6">
                            <div class="small font-weight-bold mb-1">2. HTTP GET or Form-Urlencoded:</div>
                            <pre class="bg-dark text-info p-2 rounded small mb-2 font-monospace">GET /api/webhook/incoming-sms?sender=AX-HDFCBK&amp;message=...credited...&amp;token=YOUR_SECRET_KEY</pre>
                            <small class="text-muted d-block">System automatically accepts <code>sender</code>, <code>message</code> (or <code>text</code>, <code>msg</code>, <code>body</code>), <code>sim</code>, and <code>token</code>.</small>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top flex-wrap" style="gap:10px;">
                      <div>
                        <button type="submit" class="btn btn-primary font-weight-bold" id="btnSaveIncomingSms">
                          <i class="fa fa-save mr-1"></i> Save Incoming SMS Settings
                        </button>
                        <span class="text-muted small ml-2" id="incomingSmsSaveStatus"></span>
                      </div>
                      <a href="/admin/reports/incoming-sms" class="btn btn-outline-info font-weight-bold">
                        <i class="fa fa-bar-chart mr-1"></i> View Incoming SMS Chart &amp; Logs
                      </a>
                    </div>
                  </form>

                  <!-- Test Incoming SMS Box -->
                  <div class="test-box-card mt-4">
                    <h6 class="font-weight-bold text-dark mb-2"><i class="fa fa-bolt text-warning mr-1"></i> Live Simulator: Test Incoming Bank Credit SMS</h6>
                    <p class="text-muted small mb-3">Simulate an incoming SMS message to verify parser extraction (Amount, UTR, Bank) and test buyer auto-credit live.</p>
                    <div class="row align-items-end">
                      <div class="col-md-3 form-group mb-md-0">
                        <label for="testIncomingBankSelect" class="small font-weight-bold">Select Template</label>
                        <select id="testIncomingBankSelect" class="form-control form-control-sm">
                          <option value="sbi">SBI (Rs. 2,000.00)</option>
                          <option value="hdfc">HDFC (Rs. 5,000.00)</option>
                          <option value="icici">ICICI (Rs. 1,500.00)</option>
                          <option value="axis">Axis (Rs. 3,000.00)</option>
                          <option value="custom">Custom SMS</option>
                        </select>
                      </div>
                      <div class="col-md-6 form-group mb-md-0">
                        <label for="testIncomingSmsMsg" class="small font-weight-bold">SMS Text to Simulate</label>
                        <input type="text" id="testIncomingSmsMsg" class="form-control form-control-sm font-monospace" value="Dear SBI User, your A/C ending 1234 has been credited by Rs. 2,000.00 on 28-10-26 by UPI ref no 430291827364.">
                      </div>
                      <div class="col-md-3">
                        <button type="button" class="btn btn-info btn-block btn-sm font-weight-bold" id="btnTestIncomingSms">
                          <i class="fa fa-play mr-1"></i> Test &amp; Simulate
                        </button>
                      </div>
                    </div>
                    <div id="testIncomingSmsAlert" class="mt-3" style="display: none;"></div>
                  </div>

                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- 5. TELEGRAM BOT TAB (COMING SOON) -->
            <!-- ========================================== -->
            <div class="tab-pane" id="tabTelegram">
              <div class="settings-panel-card text-center py-5">
                <div class="py-4">
                  <i class="fa fa-telegram text-muted" style="font-size: 48px;"></i>
                  <h4 class="mt-3 font-weight-bold">Telegram Bot Notification Settings</h4>
                  <p class="text-muted">Telegram bot token &amp; chat ID alerting system ready for activation.</p>
                  <button type="button" class="btn btn-outline-secondary" disabled>Module Ready</button>
                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- 6. PAYMENT GATEWAY TAB (COMING SOON) -->
            <!-- ========================================== -->
            <div class="tab-pane" id="tabPayment">
              <div class="settings-panel-card text-center py-5">
                <div class="py-4">
                  <i class="fa fa-credit-card text-muted" style="font-size: 48px;"></i>
                  <h4 class="mt-3 font-weight-bold">Payment Gateway Settings</h4>
                  <p class="text-muted">Auto Topup Payment Gateways (Razorpay / Cashfree / PhonePe PG) settings.</p>
                  <button type="button" class="btn btn-outline-secondary" disabled>Module Ready</button>
                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- 7. NOTIFICATION & DISPLAY MEDIA TAB -->
            <!-- ========================================== -->
            <div class="tab-pane" id="tabNotification">
              <div class="settings-panel-card">
                <div class="settings-panel-header">
                  <h5><i class="fa fa-bell text-warning"></i> Notification &amp; Display Media Management</h5>
                  <span class="badge badge-light border text-muted px-2 py-1"><i class="fa fa-television mr-1"></i> Announcements &amp; Visuals</span>
                </div>

                <div class="p-4">
                  <form id="notificationForm">

                    <!-- ========================================== -->
                    <!-- 1. LIVE NEWS (RUNNING TICKER)              -->
                    <!-- ========================================== -->
                    <div class="notif-card-section">
                      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                        <h6 class="font-weight-bold text-dark mb-0">
                          <i class="fa fa-bullhorn text-danger mr-1"></i> 1. Live News (Dashboard Ticker)
                        </h6>
                        <div class="custom-control custom-switch">
                          <input type="checkbox" class="custom-control-input" id="newsTickerEnabled" checked>
                          <label class="custom-control-label font-weight-bold" for="newsTickerEnabled" id="newsTickerEnabledLabel">Ticker Enabled</label>
                        </div>
                      </div>
                      <p class="text-muted small mb-3">
                        Admin jo text yahan type karega wo user dashboard ke header ke neeche <strong>LIVE NEWS</strong> running strip (marquee) me user ko live scroll hota hua dikhega.
                      </p>
                      <div class="form-group mb-2">
                        <label for="newsTickerText" class="font-weight-bold small text-dark">Live News Announcement Text:</label>
                        <textarea id="newsTickerText" class="form-control font-weight-bold" rows="3" placeholder="e.g. Welcome to Exchange Recharge &amp; LAPU Trading Platform! Fast execution, automated LAPU stock swapping, and 24x7 real-time settlement..."></textarea>
                      </div>
                      <div class="p-2 bg-light rounded border text-muted small">
                        <strong>Preview:</strong> <i class="fa fa-bullhorn text-danger mx-1"></i> <span id="newsTickerLivePreview" class="text-dark">Type above to preview...</span>
                      </div>
                    </div>

                    <!-- ========================================== -->
                    <!-- 2. USER DASHBOARD BANNER (UNDER LIVE NEWS) -->
                    <!-- ========================================== -->
                    <div class="notif-card-section">
                      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                        <h6 class="font-weight-bold text-dark mb-0">
                          <i class="fa fa-image text-primary mr-1"></i> 2. User Dashboard Banner (Under Live News)
                        </h6>
                        <div class="d-flex align-items-center">
                          <span class="badge badge-secondary mr-2" id="banner-status-badge">Default Banner Active</span>
                          <div class="custom-control custom-switch">
                            <input type="checkbox" class="custom-control-input" id="dashboardBannerEnabled" checked>
                            <label class="custom-control-label font-weight-bold small" for="dashboardBannerEnabled" id="dashboardBannerEnabledLabel">Banner Enabled</label>
                          </div>
                        </div>
                      </div>
                      <span class="media-size-pill">
                        <i class="fa fa-info-circle mr-1"></i> Proper Size: 1200 &times; 180 px (or 1600 &times; 240 px, Wide Horizontal Banner, Aspect Ratio ~ 7:1)
                      </span>
                      <p class="text-muted small mb-3">
                        Ye banner user dashboard me Live News ticker strip ke theek neeche full-width horizontal header ke roop me show hota hai. Kripya diye gaye sahi size ka banner upload karein taaki dashboard par perfect look aaye.
                      </p>

                      <div class="upload-media-box mb-3" id="banner-drop-area">
                        <input type="file" id="dashboard_banner_file" accept="image/png,image/jpeg,image/svg+xml,image/webp">
                        <i class="fa fa-cloud-upload fa-2x text-primary mb-2"></i>
                        <h6 class="font-weight-bold mb-1">Drag &amp; drop dashboard banner ya browse karne ke liye click karein</h6>
                        <p class="text-muted small mb-0">PNG, JPG, SVG, WebP (Max 5MB)</p>
                      </div>

                      <div class="mb-3">
                        <small class="font-weight-bold text-muted d-block mb-1">Live Dashboard Banner Preview:</small>
                        <div class="border rounded p-1 bg-light text-center" style="max-height: 140px; overflow: hidden;">
                          <img id="banner-preview-img" src="/api/dashboard-banner?t=1" alt="Banner Preview" style="width: 100%; height: 110px; object-fit: cover; border-radius: 6px;">
                        </div>
                      </div>

                      <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input" id="reset_dashboard_banner" value="1">
                        <label class="custom-control-label text-danger font-weight-bold small" for="reset_dashboard_banner">Reset to system default banner</label>
                      </div>
                    </div>

                    <!-- ========================================== -->
                    <!-- 3. LOGIN PAGE RIGHT-SIDE BLUE BOX IMAGE   -->
                    <!-- ========================================== -->
                    <div class="notif-card-section">
                      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                        <h6 class="font-weight-bold text-dark mb-0">
                          <i class="fa fa-picture-o text-info mr-1"></i> 3. Login Page Right-Side Box Graphic
                        </h6>
                        <div class="d-flex align-items-center">
                          <span class="badge badge-secondary mr-2" id="login-side-status-badge">Default Gradient Active</span>
                          <div class="custom-control custom-switch">
                            <input type="checkbox" class="custom-control-input" id="loginSideImageEnabled" checked>
                            <label class="custom-control-label font-weight-bold small" for="loginSideImageEnabled">Show Image</label>
                          </div>
                        </div>
                      </div>
                      <span class="media-size-pill">
                        <i class="fa fa-info-circle mr-1"></i> Proper Size: 800 &times; 900 px (or 1000 &times; 1200 px, Portrait Orientation, Aspect Ratio ~ 3:4)
                      </span>
                      <p class="text-muted small mb-3">
                        Login page (<code>/admin/login</code>) ke right side jo blue box/panel hai, wahan ye graphic/illustration background ya side hero banner ke roop me show hoga.
                      </p>

                      <div class="upload-media-box mb-3" id="login-side-drop-area">
                        <input type="file" id="login_side_image_file" accept="image/png,image/jpeg,image/svg+xml,image/webp">
                        <i class="fa fa-cloud-upload fa-2x text-info mb-2"></i>
                        <h6 class="font-weight-bold mb-1">Drag &amp; drop login side image ya click karein</h6>
                        <p class="text-muted small mb-0">PNG, JPG, SVG, WebP (Max 5MB)</p>
                      </div>

                      <div class="mb-3">
                        <small class="font-weight-bold text-muted d-block mb-1">Login Right-Side Graphic Preview:</small>
                        <div class="border rounded p-2 bg-light text-center" style="max-height: 180px; overflow: hidden;">
                          <img id="login-side-preview-img" src="/api/login-side-image?t=1" alt="Login Side Preview" style="max-height: 160px; max-width: 100%; object-fit: contain; border-radius: 6px;">
                        </div>
                      </div>

                      <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input" id="reset_login_side_image" value="1">
                        <label class="custom-control-label text-danger font-weight-bold small" for="reset_login_side_image">Reset to default login blue style</label>
                      </div>
                    </div>

                    <!-- ========================================== -->
                    <!-- 4. LOGIN PAGE POPUP IMAGE                  -->
                    <!-- ========================================== -->
                    <div class="notif-card-section">
                      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                        <h6 class="font-weight-bold text-dark mb-0">
                          <i class="fa fa-window-maximize text-warning mr-1"></i> 4. Website Homepage &amp; Login Page Popup Notice
                        </h6>
                        <div class="custom-control custom-switch">
                          <input type="checkbox" class="custom-control-input" id="loginPopupEnabled">
                          <label class="custom-control-label font-weight-bold small" for="loginPopupEnabled" id="loginPopupEnabledLabel">Popup Disabled</label>
                        </div>
                      </div>
                      <span class="media-size-pill">
                        <i class="fa fa-info-circle mr-1"></i> Proper Size: 600 &times; 600 px (Square) or 600 &times; 750 px (Max 5MB)
                      </span>
                      <p class="text-muted small mb-3">
                        Jab koi bhi user ya visitor Website Homepage (<code>/</code>) ya Login page (<code>/user/login</code>, <code>/admin/login</code>) open karega, to screen par ye notice / offers / updates popup image show hoga jise user close button se hata sakta hai.
                      </p>

                      <div class="form-group mb-3">
                        <label for="loginPopupLink" class="font-weight-bold small text-dark">Popup Click Link (Optional):</label>
                        <input type="url" id="loginPopupLink" class="form-control form-control-sm font-monospace" placeholder="e.g. https://... or /admin/register">
                        <small class="form-text text-muted">Agar user popup image par click kare to is URL par redirect hoga (khali chhodne par sirf image dikhegi).</small>
                      </div>

                      <div class="upload-media-box mb-3" id="login-popup-drop-area">
                        <input type="file" id="login_popup_image_file" accept="image/png,image/jpeg,image/svg+xml,image/webp">
                        <i class="fa fa-cloud-upload fa-2x text-warning mb-2"></i>
                        <h6 class="font-weight-bold mb-1">Drag &amp; drop login popup image ya click karein</h6>
                        <p class="text-muted small mb-0">PNG, JPG, SVG, WebP (Max 5MB)</p>
                      </div>

                      <div class="mb-3">
                        <small class="font-weight-bold text-muted d-block mb-1">Login Popup Image Preview:</small>
                        <div class="border rounded p-2 bg-light text-center" style="max-height: 180px; overflow: hidden;">
                          <img id="login-popup-preview-img" src="/api/login-popup-image?t=1" alt="Login Popup Preview" style="max-height: 160px; max-width: 100%; object-fit: contain; border-radius: 6px;">
                        </div>
                      </div>

                      <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input" id="reset_login_popup" value="1">
                        <label class="custom-control-label text-danger font-weight-bold small" for="reset_login_popup">Remove login popup image</label>
                      </div>
                    </div>

                    <!-- ========================================== -->
                    <!-- 5. USER DASHBOARD POPUP IMAGE (POST-LOGIN) -->
                    <!-- ========================================== -->
                    <div class="notif-card-section">
                      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                        <h6 class="font-weight-bold text-dark mb-0">
                          <i class="fa fa-bell-o text-success mr-1"></i> 5. User Dashboard Popup (Login Ke Baad)
                        </h6>
                        <div class="custom-control custom-switch">
                          <input type="checkbox" class="custom-control-input" id="dashboardPopupEnabled">
                          <label class="custom-control-label font-weight-bold small" for="dashboardPopupEnabled" id="dashboardPopupEnabledLabel">Popup Disabled</label>
                        </div>
                      </div>
                      <span class="media-size-pill">
                        <i class="fa fa-info-circle mr-1"></i> Proper Size: 600 &times; 600 px (Square) or 700 &times; 700 px (Max 5MB)
                      </span>
                      <p class="text-muted small mb-3">
                        User ke login hone ke baad User Dashboard par ye promotional banner / important announcement popup show hoga.
                      </p>

                      <div class="row">
                        <div class="col-md-6 form-group mb-3">
                          <label for="dashboardPopupFrequency" class="font-weight-bold small text-dark">Show Frequency:</label>
                          <select id="dashboardPopupFrequency" class="form-control form-control-sm font-weight-bold">
                            <option value="session">Once Per Login Session (Recommended)</option>
                            <option value="always">Every Time Dashboard Loads</option>
                          </select>
                        </div>
                        <div class="col-md-6 form-group mb-3">
                          <label for="dashboardPopupLink" class="font-weight-bold small text-dark">Popup Click Link (Optional):</label>
                          <input type="url" id="dashboardPopupLink" class="form-control form-control-sm font-monospace" placeholder="e.g. /recharge or https://...">
                        </div>
                      </div>

                      <div class="upload-media-box mb-3" id="dashboard-popup-drop-area">
                        <input type="file" id="dashboard_popup_image_file" accept="image/png,image/jpeg,image/svg+xml,image/webp">
                        <i class="fa fa-cloud-upload fa-2x text-success mb-2"></i>
                        <h6 class="font-weight-bold mb-1">Drag &amp; drop dashboard popup image ya click karein</h6>
                        <p class="text-muted small mb-0">PNG, JPG, SVG, WebP (Max 5MB)</p>
                      </div>

                      <div class="mb-3">
                        <small class="font-weight-bold text-muted d-block mb-1">Dashboard Popup Image Preview:</small>
                        <div class="border rounded p-2 bg-light text-center" style="max-height: 180px; overflow: hidden;">
                          <img id="dashboard-popup-preview-img" src="/api/dashboard-popup-image?t=1" alt="Dashboard Popup Preview" style="max-height: 160px; max-width: 100%; object-fit: contain; border-radius: 6px;">
                        </div>
                      </div>

                      <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input" id="reset_dashboard_popup" value="1">
                        <label class="custom-control-label text-danger font-weight-bold small" for="reset_dashboard_popup">Remove dashboard popup image</label>
                      </div>
                    </div>

                    <!-- Notification Form Save Button -->
                    <div class="d-flex justify-content-between align-items-center pt-3 border-top">
                      <button type="submit" class="btn btn-primary px-4 font-weight-bold shadow-sm" id="btnSaveNotifications">
                        <i class="fa fa-save mr-1"></i> Save Notification Settings &amp; Media
                      </button>
                      <span id="notificationSaveStatus" class="font-weight-bold"></span>
                    </div>

                  </form>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
  <script src="/auth-client.js"></script>
  <script>
  (()=>{
    function activateTab(targetSelector) {
      const btn = document.querySelector(\`.settings-tab-btn[data-target="\${targetSelector}"]\`);
      if (btn) {
        document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = document.querySelector(targetSelector);
        if (target) target.classList.add('active');
      }
    }

    // Tab switching click
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activateTab(btn.dataset.target);
      });
    });

    // Hash based auto-tab activation (e.g. #tabPlanApi)
    if (window.location.hash) {
      activateTab(window.location.hash);
    } else if (window.location.pathname.includes('plan-api')) {
      activateTab('#tabPlanApi');
    }

    // Password toggle
    document.querySelectorAll('.btn-toggle-pw').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.querySelector(btn.dataset.for);
        if (input) {
          const isPw = input.type === 'password';
          input.type = isPw ? 'text' : 'password';
          btn.innerHTML = isPw ? '<i class="fa fa-eye-slash"></i>' : '<i class="fa fa-eye"></i>';
        }
      });
    });

    // Preset quick-fill for Gmail
    const btnGmailPreset = document.getElementById('btnFillGmailPreset');
    if (btnGmailPreset) {
      btnGmailPreset.addEventListener('click', () => {
        document.getElementById('emailProvider').value = 'gmail';
        document.getElementById('smtpHost').value = 'smtp.gmail.com';
        document.getElementById('smtpPort').value = '465';
        document.getElementById('smtpEncryption').value = 'ssl';
      });
    }

    const encryptionSelect = document.getElementById('smtpEncryption');
    if (encryptionSelect) {
      encryptionSelect.addEventListener('change', () => {
        const portInput = document.getElementById('smtpPort');
        if (encryptionSelect.value === 'ssl') {
          portInput.value = '465';
        } else if (encryptionSelect.value === 'tls') {
          portInput.value = '587';
        }
      });
    }

    // Toggle Labels
    const emailSwitch = document.getElementById('emailEnabled');
    const emailLabel = document.getElementById('emailEnabledLabel');
    emailSwitch.addEventListener('change', () => {
      emailLabel.textContent = emailSwitch.checked ? 'Email Enabled' : 'Email Disabled';
      emailLabel.style.color = emailSwitch.checked ? '#16a34a' : '#64748b';
    });

    const waSwitch = document.getElementById('whatsappEnabled');
    const waLabel = document.getElementById('whatsappEnabledLabel');
    const smsSwitch = document.getElementById('smsEnabled');
    const smsLabel = document.getElementById('smsEnabledLabel');
    waSwitch.addEventListener('change', () => {
      waLabel.textContent = waSwitch.checked ? 'WhatsApp Enabled' : 'WhatsApp Disabled';
      waLabel.style.color = waSwitch.checked ? '#16a34a' : '#64748b';
    });

    if (smsSwitch && smsLabel) {
      smsSwitch.addEventListener('change', () => {
        smsLabel.textContent = smsSwitch.checked ? 'SMS Enabled' : 'SMS Disabled';
        smsLabel.style.color = smsSwitch.checked ? '#16a34a' : '#64748b';
      });
    }

    const planApiSwitch = document.getElementById('planApiEnabled');
    const planApiLabel = document.getElementById('planApiEnabledLabel');
    planApiSwitch.addEventListener('change', () => {
      planApiLabel.textContent = planApiSwitch.checked ? 'Plan API Enabled' : 'Plan API Disabled';
      planApiLabel.style.color = planApiSwitch.checked ? '#16a34a' : '#64748b';
    });

    const marginDiffSwitch = document.getElementById('marginDiffEnabled');
    const marginDiffLabel = document.getElementById('marginDiffEnabledLabel');
    if (marginDiffSwitch) {
      marginDiffSwitch.addEventListener('change', () => {
        marginDiffLabel.textContent = marginDiffSwitch.checked ? 'Margin Difference Active' : 'Margin Difference Disabled';
        marginDiffLabel.style.color = marginDiffSwitch.checked ? '#16a34a' : '#64748b';
      });
    }

    // Email Provider Switching Logic
    const emailProviderSelect = document.getElementById('emailProvider');
    const googleScriptSection = document.getElementById('googleScriptSection');
    const smtpSection = document.getElementById('smtpSection');

    function updateEmailProviderVisibility() {
      const p = emailProviderSelect ? emailProviderSelect.value : 'google_script';
      if (p === 'google_script') {
        if (googleScriptSection) googleScriptSection.style.display = 'block';
        if (smtpSection) smtpSection.style.display = 'none';
      } else {
        if (googleScriptSection) googleScriptSection.style.display = 'none';
        if (smtpSection) smtpSection.style.display = 'block';
        if (p === 'gmail') {
          const hostInput = document.getElementById('smtpHost');
          if (hostInput && !hostInput.value) hostInput.value = 'smtp.gmail.com';
        }
      }
    }
    if (emailProviderSelect) {
      emailProviderSelect.addEventListener('change', updateEmailProviderVisibility);
    }

    // Copy Google Apps Script Snippet
    const btnCopyScriptCode = document.getElementById('btnCopyScriptCode');
    const copyScriptStatus = document.getElementById('copyScriptStatus');
    const googleAppsScriptSource = [
      'function doPost(e) {',
      '  try {',
      '    var data = JSON.parse(e.postData.contents);',
      '    var secretKey = "exchange_secret"; // Matches portal Secret Key if configured',
      '    if (secretKey && data.key && data.key !== secretKey) {',
      '      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid Security Key" }))',
      '        .setMimeType(ContentService.MimeType.JSON);',
      '    }',
      '    GmailApp.sendEmail(data.to, data.subject, data.text || "", {',
      '      htmlBody: data.html || data.text,',
      '      name: data.name || "Exchange Portal"',
      '    });',
      '    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Email sent successfully via Gmail" }))',
      '      .setMimeType(ContentService.MimeType.JSON);',
      '  } catch (err) {',
      '    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))',
      '      .setMimeType(ContentService.MimeType.JSON);',
      '  }',
      '}'
    ].join('\\n');

    if (btnCopyScriptCode) {
      btnCopyScriptCode.addEventListener('click', () => {
        navigator.clipboard.writeText(googleAppsScriptSource).then(() => {
          if (copyScriptStatus) {
            copyScriptStatus.style.display = 'inline';
            setTimeout(() => { copyScriptStatus.style.display = 'none'; }, 3000);
          }
        }).catch(() => {
          alert('Failed to copy to clipboard automatically. Please copy the code manually.');
        });
      });
    }

    // Load Saved Settings on Page Load
    async function loadSettings() {
      try {
        const res = await fetch('/api/admin/settings/services');
        const data = await res.json();
        // Populate General Settings
        if (data.general) {
          const g = data.general;
          const setSwitch = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
              el.checked = Boolean(val);
              updateToggleBadge(id);
            }
          };
          const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined && val !== null) el.value = val;
          };

          setSwitch('loginOtpEnabled', g.loginOtpEnabled);
          setSwitch('instantResponseEnabled', g.instantResponseEnabled !== false);
          setVal('instantResponseSeconds', g.instantResponseSeconds ?? 15);
          setSwitch('complainAcceptAfterEnabled', g.complainAcceptAfterEnabled);
          setVal('complainAcceptMode', g.complainAcceptMode || 'instant');
          setVal('complainAcceptValue', g.complainAcceptValue ?? 60);
          setVal('complainAcceptUnit', g.complainAcceptUnit || 'seconds');
          setSwitch('complainMaxAgeEnabled', g.complainMaxAgeEnabled !== false);
          setVal('complainMaxAgeDays', g.complainMaxAgeDays ?? 7);
          setVal('disputeLienMultiplier', g.disputeLienMultiplier ?? 1.0);
          setVal('disputeRefundLienDays', g.disputeRefundLienDays ?? 7);

          const redeemMin = parseInt(g.sellerWalletRedeemDelayMinutes, 10) || 0;
          setVal('sellerWalletRedeemMinutes', redeemMin);
          const redeemModeSelect = document.getElementById('sellerWalletRedeemMode');
          const redeemMinInput = document.getElementById('sellerWalletRedeemMinutes');
          if (redeemModeSelect) {
            redeemModeSelect.value = redeemMin > 0 ? 'delay' : 'instant';
          }
          if (redeemMinInput) {
            redeemMinInput.disabled = (redeemMin <= 0);
          }

          const exchangeMin = parseInt(g.sellerWalletExchangeDelayMinutes, 10) || 0;
          setVal('sellerWalletExchangeMinutes', exchangeMin);
          const exchangeModeSelect = document.getElementById('sellerWalletExchangeMode');
          const exchangeMinInput = document.getElementById('sellerWalletExchangeMinutes');
          if (exchangeModeSelect) {
            exchangeModeSelect.value = exchangeMin > 0 ? 'delay' : 'instant';
          }
          if (exchangeMinInput) {
            exchangeMinInput.disabled = (exchangeMin <= 0);
          }
          setSwitch('notifyPendingTxnEnabled', g.notifyPendingTxnEnabled !== false);
          setVal('notifyPendingTxnMinutes', g.notifyPendingTxnMinutes ?? 15);
          setSwitch('stopRehitAfterEnabled', g.stopRehitAfterEnabled !== false);
          setVal('stopRehitAfterMinutes', g.stopRehitAfterMinutes ?? 2);
          setSwitch('maxSellerRetryEnabled', g.maxSellerRetryEnabled !== false);
          setVal('maxSellerRetryCount', g.maxSellerRetryCount ?? 3);
          setSwitch('stopSameNumberAmountEnabled', g.stopSameNumberAmountEnabled !== false);
          setVal('stopSameNumberAmountMinutes', g.stopSameNumberAmountMinutes ?? 3);
          setSwitch('apiDisableFailTxnEnabled', g.apiDisableFailTxnEnabled !== false);
          setVal('apiDisableFailTxnCount', g.apiDisableFailTxnCount ?? 5);
          setSwitch('apiDisablePendingTxnEnabled', g.apiDisablePendingTxnEnabled !== false);
          setVal('apiDisablePendingTxnCount', g.apiDisablePendingTxnCount ?? 5);
          setSwitch('apiSuspendRefundPercentEnabled', g.apiSuspendRefundPercentEnabled !== false);
          setVal('apiSuspendRefundPercent', g.apiSuspendRefundPercent ?? 25);
          setSwitch('payoutTimeWindowEnabled', Boolean(g.payoutTimeWindowEnabled));
          setVal('payoutStartTime', g.payoutStartTime || '09:00');
          setVal('payoutEndTime', g.payoutEndTime || '22:00');
          setSwitch('payoutAmountLimitEnabled', Boolean(g.payoutAmountLimitEnabled));
          setVal('payoutMinAmount', g.payoutMinAmount ?? 100);
          setVal('payoutMaxAmount', g.payoutMaxAmount ?? 50000);
          setSwitch('fundRequestMinAmountEnabled', Boolean(g.fundRequestMinAmountEnabled));
          setVal('fundRequestMinAmount', g.fundRequestMinAmount ?? 100);
          setSwitch('payoutChargesEnabled', Boolean(g.payoutChargesEnabled));
          setVal('payoutChargeImps', g.payoutChargeImps ?? 5.00);
          setVal('payoutChargeNeft', g.payoutChargeNeft ?? 3.00);
          setVal('payoutChargeRtgs', g.payoutChargeRtgs ?? 10.00);
          setSwitch('payoutCooldownEnabled', Boolean(g.payoutCooldownEnabled));
          setVal('payoutCooldownMinutes', g.payoutCooldownMinutes ?? 30);
          setSwitch('userInactivityAutoDisableEnabled', Boolean(g.userInactivityAutoDisableEnabled));
          setVal('userInactivityDays', g.userInactivityDays ?? 30);
          updateComplainDelayVisibility();
        }

        // Populate Email
        if (data.email) {
          emailSwitch.checked = Boolean(data.email.isEnabled);
          emailLabel.textContent = emailSwitch.checked ? 'Email Enabled' : 'Email Disabled';
          emailLabel.style.color = emailSwitch.checked ? '#16a34a' : '#64748b';
          const provider = data.email.provider || (data.email.googleScriptUrl ? 'google_script' : (data.email.smtpHost ? 'gmail' : 'google_script'));
          if (emailProviderSelect) emailProviderSelect.value = provider;
          document.getElementById('googleScriptUrl').value = data.email.googleScriptUrl || '';
          document.getElementById('googleScriptKey').value = data.email.googleScriptKey || '';
          document.getElementById('fromNameScript').value = data.email.fromName || 'Exchange Portal Admin';
          document.getElementById('smtpHost').value = data.email.smtpHost || 'smtp.gmail.com';
          document.getElementById('smtpPort').value = data.email.smtpPort || '465';
          document.getElementById('smtpEncryption').value = data.email.encryption || 'ssl';
          document.getElementById('smtpUser').value = data.email.username || '';
          document.getElementById('smtpPass').value = data.email.password || '';
          document.getElementById('fromEmail').value = data.email.fromEmail || '';
          document.getElementById('fromName').value = data.email.fromName || '';
          updateEmailProviderVisibility();
        } else {
          updateEmailProviderVisibility();
        }

        // Populate WhatsApp
        if (data.whatsapp) {
          waSwitch.checked = Boolean(data.whatsapp.isEnabled);
          waLabel.textContent = waSwitch.checked ? 'WhatsApp Enabled' : 'WhatsApp Disabled';
          waLabel.style.color = waSwitch.checked ? '#16a34a' : '#64748b';
          const reqType = (data.whatsapp.requestType || 'GET').toUpperCase();
          document.getElementById('waRequestType').value = reqType;
          document.getElementById('waApiUrl').value = data.whatsapp.apiUrl || data.whatsapp.gatewayUrl || '';
          document.getElementById('waPostBody').value = data.whatsapp.postBody || '';
          document.getElementById('waHeaders').value = data.whatsapp.headers || '';
          const postRow = document.getElementById('waPostOptionsRow');
          if (postRow) postRow.style.display = reqType === 'POST' ? 'flex' : 'none';
        }


        // Populate SMS
        if (data.sms) {
          if (smsSwitch && smsLabel) {
            smsSwitch.checked = Boolean(data.sms.isEnabled);
            smsLabel.textContent = smsSwitch.checked ? 'SMS Enabled' : 'SMS Disabled';
            smsLabel.style.color = smsSwitch.checked ? '#16a34a' : '#64748b';
          }
          const reqType = (data.sms.requestType || 'GET').toUpperCase();
          if (document.getElementById('smsRequestType')) document.getElementById('smsRequestType').value = reqType;
          if (document.getElementById('smsApiUrl')) document.getElementById('smsApiUrl').value = data.sms.apiUrl || data.sms.gatewayUrl || '';
          if (document.getElementById('smsSimSlot')) document.getElementById('smsSimSlot').value = data.sms.simSlot !== undefined ? data.sms.simSlot : '0';
          if (document.getElementById('smsPostBody')) document.getElementById('smsPostBody').value = data.sms.postBody || '';
          if (document.getElementById('smsHeaders')) document.getElementById('smsHeaders').value = data.sms.headers || '';
          const postRow = document.getElementById('smsPostOptionsRow');
          if (postRow) postRow.style.display = reqType === 'POST' ? 'flex' : 'none';
        }
        // Populate Incoming SMS
        if (data.incoming_sms) {
          const inc = data.incoming_sms;
          const incSwitch = document.getElementById('incomingSmsEnabled');
          const incLabel = document.getElementById('incomingSmsEnabledLabel');
          if (incSwitch && incLabel) {
            incSwitch.checked = Boolean(inc.isEnabled);
            incLabel.textContent = incSwitch.checked ? 'Incoming SMS Enabled' : 'Incoming SMS Disabled';
            incLabel.style.color = incSwitch.checked ? '#16a34a' : '#64748b';
          }
          if (document.getElementById('incomingSmsAutoCredit')) {
            document.getElementById('incomingSmsAutoCredit').checked = inc.autoUpdatePayment !== false;
          }
          if (document.getElementById('incomingSmsSecretKey')) {
            document.getElementById('incomingSmsSecretKey').value = inc.secretKey || '';
          }
          if (document.getElementById('incomingSmsAllowedSenders')) {
            document.getElementById('incomingSmsAllowedSenders').value = inc.allowedSenders || '';
          }
        }
        if (document.getElementById('serviceIncomingSmsWebhookUrl')) {
          document.getElementById('serviceIncomingSmsWebhookUrl').value = window.location.origin + '/api/webhook/incoming-sms';
        }

        // Populate Plan API
        if (data.plan_api || data.planApi) {
          const p = data.plan_api || data.planApi;
          planApiSwitch.checked = Boolean(p.isEnabled);
          planApiLabel.textContent = planApiSwitch.checked ? 'PLAN API Enabled' : 'PLAN API Disabled';
          planApiLabel.style.color = planApiSwitch.checked ? '#16a34a' : '#64748b';

          if (document.getElementById('planApiProvider')) {
            document.getElementById('planApiProvider').value = p.provider || 'ezytm';
          }
          if (document.getElementById('ezytmApiUserId')) {
            document.getElementById('ezytmApiUserId').value = p.apiUserId || '5100';
          }
          if (document.getElementById('ezytmApiPassword')) {
            document.getElementById('ezytmApiPassword').value = p.apiPassword || 'amart@74';
          }
        }

        // Populate Margin Difference
        if (data.margin_difference || data.marginDifference) {
          const m = data.margin_difference || data.marginDifference;
          const mdSwitch = document.getElementById('marginDiffEnabled');
          const mdLabel = document.getElementById('marginDiffEnabledLabel');
          if (mdSwitch) mdSwitch.checked = m.isEnabled !== false;
          if (mdLabel) {
            mdLabel.textContent = (mdSwitch && mdSwitch.checked) ? 'Margin Difference Active' : 'Margin Difference Disabled';
            mdLabel.style.color = (mdSwitch && mdSwitch.checked) ? '#16a34a' : '#64748b';
          }
          if (m.marginDifferencePercent !== undefined) {
            document.getElementById('marginDifferencePercent').value = m.marginDifferencePercent;
          }
          if (m.description !== undefined) {
            document.getElementById('marginDiffDescription').value = m.description;
          }
        }

        // Populate Notifications & Display Media
        if (data.notifications) {
          const n = data.notifications;
          const t = Date.now();
          const ntSwitch = document.getElementById('newsTickerEnabled');
          if (ntSwitch) {
            ntSwitch.checked = Boolean(n.news_ticker_enabled !== false);
            const ntLabel = document.getElementById('newsTickerEnabledLabel');
            if (ntLabel) ntLabel.textContent = ntSwitch.checked ? 'Ticker Enabled' : 'Ticker Disabled';
          }
          const ntInput = document.getElementById('newsTickerText');
          if (ntInput) {
            ntInput.value = n.news_ticker || '';
            const preview = document.getElementById('newsTickerLivePreview');
            if (preview) preview.textContent = n.news_ticker || 'No live news set';
          }
          const dbSwitch = document.getElementById('dashboardBannerEnabled');
          if (dbSwitch) {
            dbSwitch.checked = Boolean(n.dashboard_banner_enabled !== false);
            const dbLabel = document.getElementById('dashboardBannerEnabledLabel');
            if (dbLabel) dbLabel.textContent = dbSwitch.checked ? 'Banner Enabled' : 'Banner Disabled';
          }
          if (document.getElementById('banner-status-badge')) {
            document.getElementById('banner-status-badge').textContent = n.has_dashboard_banner ? 'Custom Banner Active' : 'Default Banner Active';
            document.getElementById('banner-status-badge').className = n.has_dashboard_banner ? 'badge badge-success mr-2' : 'badge badge-secondary mr-2';
          }
          const bannerImg = document.getElementById('banner-preview-img');
          if (bannerImg) {
            bannerImg.src = '/api/dashboard-banner?t=' + t;
          }
          const lsSwitch = document.getElementById('loginSideImageEnabled');
          if (lsSwitch) lsSwitch.checked = Boolean(n.login_side_image_enabled !== false);
          if (document.getElementById('login-side-status-badge')) {
            document.getElementById('login-side-status-badge').textContent = n.has_login_side_image ? 'Custom Image Active' : 'Default Gradient Active';
            document.getElementById('login-side-status-badge').className = n.has_login_side_image ? 'badge badge-success mr-2' : 'badge badge-secondary mr-2';
          }
          const sideImg = document.getElementById('login-side-preview-img');
          if (sideImg) {
            sideImg.src = '/api/login-side-image?t=' + t;
          }
          const lpSwitch = document.getElementById('loginPopupEnabled');
          if (lpSwitch) {
            lpSwitch.checked = Boolean(n.login_popup_enabled);
            const lpLabel = document.getElementById('loginPopupEnabledLabel');
            if (lpLabel) lpLabel.textContent = lpSwitch.checked ? 'Popup Enabled' : 'Popup Disabled';
          }
          if (document.getElementById('loginPopupLink')) document.getElementById('loginPopupLink').value = n.login_popup_link || '';
          if (document.getElementById('login-popup-status-badge')) {
            document.getElementById('login-popup-status-badge').textContent = n.has_login_popup ? 'Image Uploaded' : 'No Image';
            document.getElementById('login-popup-status-badge').className = n.has_login_popup ? 'badge badge-success' : 'badge badge-secondary';
          }
          const lpImg = document.getElementById('login-popup-preview-img');
          if (lpImg) {
            lpImg.src = '/api/login-popup-image?t=' + t;
          }

          const dpSwitch = document.getElementById('dashboardPopupEnabled');
          if (dpSwitch) {
            dpSwitch.checked = Boolean(n.dashboard_popup_enabled);
            const dpLabel = document.getElementById('dashboardPopupEnabledLabel');
            if (dpLabel) dpLabel.textContent = dpSwitch.checked ? 'Popup Enabled' : 'Popup Disabled';
          }
          if (document.getElementById('dashboardPopupLink')) document.getElementById('dashboardPopupLink').value = n.dashboard_popup_link || '';
          if (document.getElementById('dashboardPopupFrequency')) document.getElementById('dashboardPopupFrequency').value = n.dashboard_popup_frequency || 'session';
          if (document.getElementById('dashboard-popup-status-badge')) {
            document.getElementById('dashboard-popup-status-badge').textContent = n.has_dashboard_popup ? 'Image Uploaded' : 'No Image';
            document.getElementById('dashboard-popup-status-badge').className = n.has_dashboard_popup ? 'badge badge-success' : 'badge badge-secondary';
          }
          const dpImg = document.getElementById('dashboard-popup-preview-img');
          if (dpImg) {
            dpImg.src = '/api/dashboard-popup-image?t=' + t;
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }

    loadSettings();

    // Toggle POST body row
    const waRequestTypeSelect = document.getElementById('waRequestType');
    if (waRequestTypeSelect) {
      waRequestTypeSelect.addEventListener('change', () => {
        const postRow = document.getElementById('waPostOptionsRow');
        if (postRow) postRow.style.display = waRequestTypeSelect.value === 'POST' ? 'flex' : 'none';
      });
    }

    // Insert Keyword into active/last focused input
    let lastFocusedWaInput = document.getElementById('waApiUrl');
    ['waApiUrl', 'waPostBody'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('focus', () => lastFocusedWaInput = el);
    });

    document.querySelectorAll('.btn-insert-keyword').forEach(btn => {
      btn.addEventListener('click', () => {
        const keyword = btn.dataset.keyword;
        const target = lastFocusedWaInput || document.getElementById('waApiUrl');
        if (!target) return;
        const start = target.selectionStart || target.value.length;
        const end = target.selectionEnd || target.value.length;
        const val = target.value;
        target.value = val.substring(0, start) + keyword + val.substring(end);
        target.focus();
        target.selectionStart = target.selectionEnd = start + keyword.length;
      });
    });

    // Save Email Form
    const emailForm = document.getElementById('emailForm');
    const emailSaveBtn = document.getElementById('btnSaveEmail');
    const emailSaveStatus = document.getElementById('emailSaveStatus');

    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      emailSaveBtn.disabled = true;
      emailSaveBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving...';
      emailSaveStatus.textContent = '';

      const provider = document.getElementById('emailProvider').value;
      const payload = {
        isEnabled: emailSwitch.checked,
        provider,
        googleScriptUrl: document.getElementById('googleScriptUrl').value.trim(),
        googleScriptKey: document.getElementById('googleScriptKey').value.trim(),
        fromName: provider === 'google_script' ? document.getElementById('fromNameScript').value.trim() : document.getElementById('fromName').value.trim(),
        smtpHost: document.getElementById('smtpHost').value.trim(),
        smtpPort: Number(document.getElementById('smtpPort').value),
        encryption: document.getElementById('smtpEncryption').value,
        username: document.getElementById('smtpUser').value.trim(),
        password: document.getElementById('smtpPass').value.trim(),
        fromEmail: document.getElementById('fromEmail').value.trim(),
      };

      try {
        const res = await fetch('/api/admin/settings/services/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save Email settings.');
        emailSaveStatus.textContent = '✓ Saved successfully!';
        emailSaveStatus.className = 'text-success font-weight-bold';
        setTimeout(() => emailSaveStatus.textContent = '', 3000);
      } catch (err) {
        emailSaveStatus.textContent = '✗ ' + err.message;
        emailSaveStatus.className = 'text-danger font-weight-bold';
      } finally {
        emailSaveBtn.disabled = false;
        emailSaveBtn.innerHTML = '<i class="fa fa-save mr-1"></i> Save Email Settings';
      }
    });

    // Send Test Email
    const btnSendTestEmail = document.getElementById('btnSendTestEmail');
    const testEmailRecipient = document.getElementById('testEmailRecipient');
    const testEmailAlert = document.getElementById('testEmailAlert');

    btnSendTestEmail.addEventListener('click', async () => {
      const to = testEmailRecipient.value.trim();
      if (!to) {
        alert('Please enter a recipient email address for testing.');
        testEmailRecipient.focus();
        return;
      }

      const provider = document.getElementById('emailProvider').value;
      btnSendTestEmail.disabled = true;
      btnSendTestEmail.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Sending Test Email...';
      testEmailAlert.style.display = 'none';

      const payload = {
        toEmail: to,
        provider,
        googleScriptUrl: document.getElementById('googleScriptUrl').value.trim(),
        googleScriptKey: document.getElementById('googleScriptKey').value.trim(),
        fromName: provider === 'google_script' ? document.getElementById('fromNameScript').value.trim() : document.getElementById('fromName').value.trim(),
        smtpHost: document.getElementById('smtpHost').value.trim(),
        smtpPort: Number(document.getElementById('smtpPort').value),
        encryption: document.getElementById('smtpEncryption').value,
        username: document.getElementById('smtpUser').value.trim(),
        password: document.getElementById('smtpPass').value.trim(),
        fromEmail: document.getElementById('fromEmail').value.trim(),
      };

      try {
        const res = await fetch('/api/admin/settings/services/email/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          signal: AbortSignal.timeout(22000),
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Test Email Delivery Failed.');
        testEmailAlert.className = 'alert alert-success mt-3';
        testEmailAlert.innerHTML = '<strong>✓ Email Sent Successfully!</strong> ' + (data.message || 'Email verified.');
        testEmailAlert.style.display = 'block';
      } catch (err) {
        testEmailAlert.className = 'alert alert-danger mt-3';
        testEmailAlert.innerHTML = '<strong>✗ Email Test Failed:</strong> ' + err.message;
        testEmailAlert.style.display = 'block';
      } finally {
        btnSendTestEmail.disabled = false;
        btnSendTestEmail.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send Test Email';
      }
    });


    // Incoming SMS Switch Label update
    const incSwitch = document.getElementById('incomingSmsEnabled');
    const incLabel = document.getElementById('incomingSmsEnabledLabel');
    if (incSwitch && incLabel) {
      incSwitch.addEventListener('change', () => {
        incLabel.textContent = incSwitch.checked ? 'Incoming SMS Enabled' : 'Incoming SMS Disabled';
        incLabel.style.color = incSwitch.checked ? '#16a34a' : '#64748b';
      });
    }

    // Copy Webhook URL in Service Settings
    document.getElementById('btnCopyServiceWebhookUrl')?.addEventListener('click', () => {
      const urlEl = document.getElementById('serviceIncomingSmsWebhookUrl');
      if (urlEl) {
        navigator.clipboard.writeText(urlEl.value).then(() => {
          alert('Webhook URL copied: ' + urlEl.value);
        });
      }
    });

    // Generate Secret Key
    document.getElementById('btnGenSecretKey')?.addEventListener('click', () => {
      const randomSecret = 'sec_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 8);
      const secretInput = document.getElementById('incomingSmsSecretKey');
      if (secretInput) secretInput.value = randomSecret;
    });

    // Save Incoming SMS Form
    const incomingSmsForm = document.getElementById('incomingSmsForm');
    const btnSaveIncomingSms = document.getElementById('btnSaveIncomingSms');
    const incomingSmsSaveStatus = document.getElementById('incomingSmsSaveStatus');

    if (incomingSmsForm) {
      incomingSmsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        btnSaveIncomingSms.disabled = true;
        btnSaveIncomingSms.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving...';
        incomingSmsSaveStatus.textContent = '';

        const payload = {
          isEnabled: incSwitch ? incSwitch.checked : false,
          autoUpdatePayment: document.getElementById('incomingSmsAutoCredit') ? document.getElementById('incomingSmsAutoCredit').checked : true,
          secretKey: document.getElementById('incomingSmsSecretKey') ? document.getElementById('incomingSmsSecretKey').value.trim() : '',
          allowedSenders: document.getElementById('incomingSmsAllowedSenders') ? document.getElementById('incomingSmsAllowedSenders').value.trim() : '',
        };

        try {
          const res = await fetch('/api/admin/settings/services/incoming-sms', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to save Incoming SMS settings.');
          incomingSmsSaveStatus.textContent = '✓ Saved successfully!';
          incomingSmsSaveStatus.className = 'text-success font-weight-bold';
          setTimeout(() => incomingSmsSaveStatus.textContent = '', 3000);
        } catch (err) {
          incomingSmsSaveStatus.textContent = '✗ ' + err.message;
          incomingSmsSaveStatus.className = 'text-danger font-weight-bold';
        } finally {
          btnSaveIncomingSms.disabled = false;
          btnSaveIncomingSms.innerHTML = '<i class="fa fa-save mr-1"></i> Save Incoming SMS Settings';
        }
      });
    }

    // Test Simulator in Service Settings
    const testSimTemplates = {
      sbi: 'Dear SBI User, your A/C ending 1234 has been credited by Rs. 2,000.00 on 28-10-26 by UPI ref no 430291827364.',
      hdfc: 'Dear Customer, INR 5,000.00 deposited to A/C **5678 on 28-OCT-26 by UPI. UPI Ref 430291827365',
      icici: 'Your a/c no. XX9876 is credited with Rs 1,500.00 on 28-OCT-26. UPI:430291827367-Transfer',
      axis: 'Axis Bank: Account 93849335819868 has been credited with INR 3,000.00 on 28-10-2026 by UPI/430291827368/Transfer.',
      custom: 'Your account has been credited with Rs. 500.00 via UPI ref 123456789012'
    };

    document.getElementById('testIncomingBankSelect')?.addEventListener('change', (e) => {
      const msg = testSimTemplates[e.target.value] || testSimTemplates.sbi;
      const input = document.getElementById('testIncomingSmsMsg');
      if (input) input.value = msg;
    });

    document.getElementById('btnTestIncomingSms')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnTestIncomingSms');
      const alertBox = document.getElementById('testIncomingSmsAlert');
      const msg = document.getElementById('testIncomingSmsMsg')?.value || '';
      btn.disabled = true;
      alertBox.style.display = 'none';

      try {
        const res = await fetch('/api/admin/settings/services/incoming-sms/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ message: msg, sender: 'TEST-BANK' }),
        });
        const data = await res.json();
        alertBox.style.display = 'block';
        if (res.ok) {
          alertBox.className = 'alert alert-success mt-3';
          alertBox.innerHTML = '<strong><i class="fa fa-check-circle mr-1"></i>Parser Success:</strong> ' +
            (data.message || 'Processed') +
            '<div class="mt-1 small font-monospace">Bank: ' + (data.bank || 'N/A') + ' | Amount: ₹' + (data.amountStr || '0') + ' | UTR: ' + (data.utr || 'N/A') + ' | Match: ' + (data.matchStatus || 'unmatched') + '</div>';
        } else {
          alertBox.className = 'alert alert-danger mt-3';
          alertBox.innerHTML = '<strong><i class="fa fa-times-circle mr-1"></i>Error:</strong> ' + (data.error || 'Failed');
        }
      } catch (err) {
        alertBox.style.display = 'block';
        alertBox.className = 'alert alert-danger mt-3';
        alertBox.innerHTML = '<strong><i class="fa fa-times-circle mr-1"></i>Error:</strong> ' + err.message;
      } finally {
        btn.disabled = false;
      }
    });

    // Save SMS Form
    const smsForm = document.getElementById('smsForm');
    const smsSaveBtn = document.getElementById('btnSaveSms');
    const smsSaveStatus = document.getElementById('smsSaveStatus');

    if (smsForm) {
      smsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        smsSaveBtn.disabled = true;
        smsSaveBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving...';
        smsSaveStatus.textContent = '';

        const payload = {
          isEnabled: smsSwitch ? smsSwitch.checked : false,
          requestType: document.getElementById('smsRequestType').value,
          apiUrl: document.getElementById('smsApiUrl').value.trim(),
          simSlot: document.getElementById('smsSimSlot') ? document.getElementById('smsSimSlot').value.trim() : '0',
          postBody: document.getElementById('smsPostBody').value.trim(),
          headers: document.getElementById('smsHeaders').value.trim(),
        };

        try {
          const res = await fetch('/api/admin/settings/services/sms', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to save SMS settings.');
          smsSaveStatus.textContent = '✓ Saved successfully!';
          smsSaveStatus.className = 'text-success font-weight-bold';
          setTimeout(() => smsSaveStatus.textContent = '', 3000);
        } catch (err) {
          smsSaveStatus.textContent = '✗ ' + err.message;
          smsSaveStatus.className = 'text-danger font-weight-bold';
        } finally {
          smsSaveBtn.disabled = false;
          smsSaveBtn.innerHTML = '<i class="fa fa-save mr-1"></i> Save SMS Settings';
        }
      });
    }

    // Send Test SMS
    const btnSendTestSms = document.getElementById('btnSendTestSms');
    const testSmsRecipient = document.getElementById('testSmsRecipient');
    const testSmsMessage = document.getElementById('testSmsMessage');
    const testSmsAlert = document.getElementById('testSmsAlert');
    const testSmsCounter = document.getElementById('testSmsCounter');

    if (testSmsMessage && testSmsCounter) {
      const updateTestCounter = () => {
        const len = testSmsMessage.value.length;
        testSmsCounter.textContent = len + '/160';
        testSmsCounter.className = len >= 160 ? 'text-danger font-weight-bold' : 'text-muted font-weight-bold';
      };
      testSmsMessage.addEventListener('input', updateTestCounter);
      updateTestCounter();
    }

    if (btnSendTestSms) {
      btnSendTestSms.addEventListener('click', async () => {
        const toNumber = testSmsRecipient.value.trim();
        if (!toNumber || toNumber.length < 10) {
          alert('Please enter a valid 10-digit mobile number for SMS test.');
          testSmsRecipient.focus();
          return;
        }

        btnSendTestSms.disabled = true;
        btnSendTestSms.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Sending SMS...';
        testSmsAlert.style.display = 'none';

        const payload = {
          toNumber,
          message: (testSmsMessage.value || '').slice(0, 160),
          requestType: document.getElementById('smsRequestType').value,
          apiUrl: document.getElementById('smsApiUrl').value.trim(),
          simSlot: document.getElementById('smsSimSlot') ? document.getElementById('smsSimSlot').value.trim() : '0',
          postBody: document.getElementById('smsPostBody').value.trim(),
          headers: document.getElementById('smsHeaders').value.trim(),
        };

        try {
          const res = await fetch('/api/admin/settings/services/sms/test', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'SMS test failed.');
          testSmsAlert.className = 'alert alert-success mt-3';
          testSmsAlert.innerHTML = '<strong>✓ SMS Dispatched Successfully!</strong> Status: ' + data.status + '<br><small class="text-muted font-monospace">' + escapeHtml(data.response || '') + '</small>';
          testSmsAlert.style.display = 'block';
        } catch (err) {
          testSmsAlert.className = 'alert alert-danger mt-3';
          testSmsAlert.innerHTML = '<strong>✗ SMS Test Failed:</strong> ' + escapeHtml(err.message);
          testSmsAlert.style.display = 'block';
        } finally {
          btnSendTestSms.disabled = false;
          btnSendTestSms.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send Test SMS';
        }
      });
    }

    // Save WhatsApp Form
    const whatsappForm = document.getElementById('whatsappForm');
    const waSaveBtn = document.getElementById('btnSaveWhatsapp');
    const waSaveStatus = document.getElementById('whatsappSaveStatus');

    whatsappForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      waSaveBtn.disabled = true;
      waSaveBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving...';
      waSaveStatus.textContent = '';

      const payload = {
        isEnabled: waSwitch.checked,
        requestType: document.getElementById('waRequestType').value,
        apiUrl: document.getElementById('waApiUrl').value.trim(),
        postBody: document.getElementById('waPostBody').value.trim(),
        headers: document.getElementById('waHeaders').value.trim(),
      };

      try {
        const res = await fetch('/api/admin/settings/services/whatsapp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save WhatsApp settings.');
        waSaveStatus.textContent = '✓ Saved successfully!';
        waSaveStatus.className = 'text-success font-weight-bold';
        setTimeout(() => waSaveStatus.textContent = '', 3000);
      } catch (err) {
        waSaveStatus.textContent = '✗ ' + err.message;
        waSaveStatus.className = 'text-danger font-weight-bold';
      } finally {
        waSaveBtn.disabled = false;
        waSaveBtn.innerHTML = '<i class="fa fa-save mr-1"></i> Save WhatsApp Settings';
      }
    });

    // Send Test WhatsApp
    const btnSendTestWa = document.getElementById('btnSendTestWhatsapp');
    const testWaRecipient = document.getElementById('testWaRecipient');
    const testWaMessage = document.getElementById('testWaMessage');
    const testWaAlert = document.getElementById('testWaAlert');

    btnSendTestWa.addEventListener('click', async () => {
      const toNumber = testWaRecipient.value.trim();
      if (!toNumber || toNumber.length < 10) {
        alert('Please enter a valid 10-digit mobile number for WhatsApp test.');
        testWaRecipient.focus();
        return;
      }

      btnSendTestWa.disabled = true;
      btnSendTestWa.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Sending WhatsApp Message...';
      testWaAlert.style.display = 'none';

      const payload = {
        toNumber,
        message: testWaMessage.value.trim(),
        requestType: document.getElementById('waRequestType').value,
        apiUrl: document.getElementById('waApiUrl').value.trim(),
        postBody: document.getElementById('waPostBody').value.trim(),
        headers: document.getElementById('waHeaders').value.trim(),
      };

      try {
        const res = await fetch('/api/admin/settings/services/whatsapp/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'WhatsApp message test failed.');
        testWaAlert.className = 'alert alert-success mt-3';
        testWaAlert.innerHTML = '<strong>✓ WhatsApp Dispatched Successfully!</strong> Status: ' + data.status + '<br><small class="text-muted font-monospace">' + escapeHtml(data.response || '') + '</small>';
        testWaAlert.style.display = 'block';
      } catch (err) {
        testWaAlert.className = 'alert alert-danger mt-3';
        testWaAlert.innerHTML = '<strong>✗ WhatsApp Test Failed:</strong> ' + escapeHtml(err.message);
        testWaAlert.style.display = 'block';
      } finally {
        btnSendTestWa.disabled = false;
        btnSendTestWa.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send Test Message';
      }
    });

    // Save Plan API Form
    const planApiForm = document.getElementById('planApiForm');
    const planApiSaveBtn = document.getElementById('btnSavePlanApi');
    const planApiSaveStatus = document.getElementById('planApiSaveStatus');

    if (planApiForm) {
      planApiForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        planApiSaveBtn.disabled = true;
        planApiSaveBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving...';
        planApiSaveStatus.textContent = '';

        const payload = {
          isEnabled: planApiSwitch ? planApiSwitch.checked : true,
          provider: document.getElementById('planApiProvider') ? document.getElementById('planApiProvider').value : 'ezytm',
          brandName: 'Plan API (EZYTM)',
          activeBrand: 'Plan API (EZYTM)',
          requestType: 'GET',
          apiUserId: document.getElementById('ezytmApiUserId') ? document.getElementById('ezytmApiUserId').value.trim() : '5100',
          apiPassword: document.getElementById('ezytmApiPassword') ? document.getElementById('ezytmApiPassword').value.trim() : 'amart@74',
        };

        try {
          const res = await fetch('/api/admin/settings/services/plan-api', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to save Plan API settings.');
          planApiSaveStatus.textContent = '✓ Saved successfully!';
          planApiSaveStatus.className = 'text-success font-weight-bold ml-2';
          setTimeout(() => planApiSaveStatus.textContent = '', 3000);
        } catch (err) {
          planApiSaveStatus.textContent = '✗ ' + err.message;
          planApiSaveStatus.className = 'text-danger font-weight-bold ml-2';
        } finally {
          planApiSaveBtn.disabled = false;
          planApiSaveBtn.innerHTML = '<i class="fa fa-save mr-1"></i> Save PLAN API Settings';
        }
      });
    }

    // Save Margin Difference Form
    const marginDiffForm = document.getElementById('marginDiffForm');
    const marginDiffSaveBtn = document.getElementById('btnSaveMarginDiff');
    const marginDiffSaveStatus = document.getElementById('marginDiffSaveStatus');

    if (marginDiffForm) {
      marginDiffForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        marginDiffSaveBtn.disabled = true;
        marginDiffSaveBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving...';
        marginDiffSaveStatus.textContent = '';

        const payload = {
          isEnabled: marginDiffSwitch ? marginDiffSwitch.checked : true,
          marginDifferencePercent: document.getElementById('marginDifferencePercent').value.trim(),
          description: document.getElementById('marginDiffDescription').value.trim(),
        };

        try {
          const res = await fetch('/api/admin/settings/services/margin-difference', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to save Margin Difference settings.');
          marginDiffSaveStatus.textContent = '✓ Saved successfully!';
          marginDiffSaveStatus.className = 'text-success font-weight-bold';
          setTimeout(() => marginDiffSaveStatus.textContent = '', 3000);
        } catch (err) {
          marginDiffSaveStatus.textContent = '✗ ' + err.message;
          marginDiffSaveStatus.className = 'text-danger font-weight-bold';
        } finally {
          marginDiffSaveBtn.disabled = false;
          marginDiffSaveBtn.innerHTML = '<i class="fa fa-save mr-1"></i> Save Margin Difference';
        }
      });
    }

    // Test Plan API Operator Lookup
    const btnTestPlanApi = document.getElementById('btnTestPlanApi');
    const testPlanApiMobile = document.getElementById('testPlanApiMobile');
    const testPlanApiAlert = document.getElementById('testPlanApiAlert');
    const planApiResultContainer = document.getElementById('planApiResultContainer');

    if (btnTestPlanApi) {
      btnTestPlanApi.addEventListener('click', async () => {
        const mobile = testPlanApiMobile ? testPlanApiMobile.value.trim().replace(/\D/g, '') : '';
        if (!mobile || mobile.length < 10) {
          alert('Please enter a valid 10-digit mobile number for Operator Look.');
          if (testPlanApiMobile) testPlanApiMobile.focus();
          return;
        }

        btnTestPlanApi.disabled = true;
        btnTestPlanApi.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Fetching Live Operator...';
        if (testPlanApiAlert) testPlanApiAlert.style.display = 'none';
        if (planApiResultContainer) planApiResultContainer.style.display = 'none';

        const payload = {
          mobile,
          brand: 'Plan API (EZYTM)',
          provider: 'ezytm',
          apiUserId: document.getElementById('ezytmApiUserId') ? document.getElementById('ezytmApiUserId').value.trim() : '5100',
          apiPassword: document.getElementById('ezytmApiPassword') ? document.getElementById('ezytmApiPassword').value.trim() : 'amart@74',
        };

        try {
          const res = await fetch('/api/admin/settings/services/plan-api/test', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Operator lookup failed.');

          // Show result card
          if (document.getElementById('resOperatorName')) document.getElementById('resOperatorName').textContent = data.operator || 'Unknown';
          if (document.getElementById('resCircleName')) document.getElementById('resCircleName').textContent = data.circle || 'All Circle';
          if (document.getElementById('planApiLatency')) document.getElementById('planApiLatency').textContent = (data.latencyMs || 0) + ' ms';
          const brandBadge = document.getElementById('resBrandBadge');
          if (brandBadge) brandBadge.textContent = 'Brand: Plan API (EZYTM)';

          let matchHtml = '';
          if (data.matchedOperator) {
            matchHtml = '✓ <strong>Matched Database Operator:</strong> ' + escapeHtml(data.matchedOperator.name) + ' (Code: ' + escapeHtml(data.matchedOperator.code) + ', Status: ' + escapeHtml(data.matchedOperator.status) + ')';
          } else {
            matchHtml = '<span class="text-warning"><i class="fa fa-exclamation-triangle mr-1"></i> Note: Operator "' + escapeHtml(data.operator || '') + '" not yet in system Operator Definitions. You can create it in Settings &rarr; Create Operator.</span>';
          }
          if (document.getElementById('resDbMatch')) document.getElementById('resDbMatch').innerHTML = matchHtml;
          if (document.getElementById('resRawPayload')) document.getElementById('resRawPayload').textContent = typeof data.rawResponse === 'string' ? data.rawResponse : JSON.stringify(data.rawResponse || data, null, 2);

          if (planApiResultContainer) planApiResultContainer.style.display = 'block';
          if (testPlanApiAlert) {
            testPlanApiAlert.className = 'alert alert-success mt-3';
            testPlanApiAlert.innerHTML = '<strong>✓ Live Operator &amp; Circle Details Fetched Successfully!</strong> Brand: Plan API (EZYTM) | Mobile: ' + escapeHtml(data.mobile);
            testPlanApiAlert.style.display = 'block';
          }
        } catch (err) {
          if (testPlanApiAlert) {
            testPlanApiAlert.className = 'alert alert-danger mt-3';
            testPlanApiAlert.innerHTML = '<strong>✗ Operator Lookup Failed:</strong> ' + escapeHtml(err.message);
            testPlanApiAlert.style.display = 'block';
          }
        } finally {
          btnTestPlanApi.disabled = false;
          btnTestPlanApi.innerHTML = '<i class="fa fa-search mr-1"></i> Fetch Operator &amp; Circle';
        }
      });
    }

    // Test Plan API R-Offer Check
    const btnTestRoffer = document.getElementById('btnTestRoffer');
    const testRofferMobile = document.getElementById('testRofferMobile');
    const testRofferOpCode = document.getElementById('testRofferOpCode');
    const testRofferAlert = document.getElementById('testRofferAlert');
    const rofferResultContainer = document.getElementById('rofferResultContainer');
    const rofferCountBadge = document.getElementById('rofferCountBadge');
    const rofferLatency = document.getElementById('rofferLatency');
    const rofferOffersTableBody = document.getElementById('rofferOffersTableBody');
    const resRofferRawPayload = document.getElementById('resRofferRawPayload');

    if (btnTestRoffer) {
      btnTestRoffer.addEventListener('click', async () => {
        const mobile = testRofferMobile ? testRofferMobile.value.trim().replace(/\D/g, '') : '';
        if (!mobile || mobile.length < 10) {
          alert('Please enter a valid 10-digit mobile number for R-Offer lookup.');
          if (testRofferMobile) testRofferMobile.focus();
          return;
        }

        const operatorCode = testRofferOpCode ? testRofferOpCode.value : '2';

        btnTestRoffer.disabled = true;
        btnTestRoffer.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Fetching Live R-Offers...';
        if (testRofferAlert) testRofferAlert.style.display = 'none';
        if (rofferResultContainer) rofferResultContainer.style.display = 'none';

        const payload = {
          mobile,
          operatorCode,
          provider: 'ezytm',
          apiUserId: document.getElementById('ezytmApiUserId') ? document.getElementById('ezytmApiUserId').value.trim() : '5100',
          apiPassword: document.getElementById('ezytmApiPassword') ? document.getElementById('ezytmApiPassword').value.trim() : 'amart@74',
        };

        try {
          const res = await fetch('/api/admin/settings/services/plan-api/roffer-test', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || data.message || 'R-Offer lookup failed.');

          const offers = Array.isArray(data.offers) ? data.offers : [];
          if (rofferCountBadge) rofferCountBadge.textContent = offers.length + ' Offer' + (offers.length === 1 ? '' : 's');
          if (rofferLatency) rofferLatency.textContent = (data.latencyMs || 0) + ' ms';

          if (rofferOffersTableBody) {
            if (offers.length === 0) {
              rofferOffersTableBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted p-3">No specific R-Offers available for this mobile and operator.</td></tr>';
            } else {
              rofferOffersTableBody.innerHTML = offers.map(o => {
                const price = escapeHtml(String(o.Price || o.rs || o.price || o.amount || ''));
                const desc = escapeHtml(String(o.LogDescription || o.desc || o.Offer || o.plan || o.detail || ''));
                return '<tr><td class="font-weight-bold text-success font-monospace">₹ ' + (price || '-') + '</td><td>' + (desc || '-') + '</td></tr>';
              }).join('');
            }
          }

          if (resRofferRawPayload) {
            resRofferRawPayload.textContent = typeof data.raw === 'string' ? data.raw : JSON.stringify(data.raw || data, null, 2);
          }

          if (rofferResultContainer) rofferResultContainer.style.display = 'block';
          if (testRofferAlert) {
            testRofferAlert.className = 'alert alert-success mt-3';
            testRofferAlert.innerHTML = '<strong>✓ R-Offer Data Received:</strong> Found ' + offers.length + ' offer(s) for ' + escapeHtml(data.mobile || mobile) + ' (OpCode: ' + escapeHtml(data.operatorCode || operatorCode) + ')';
            testRofferAlert.style.display = 'block';
          }
        } catch (err) {
          if (testRofferAlert) {
            testRofferAlert.className = 'alert alert-danger mt-3';
            testRofferAlert.innerHTML = '<strong>✗ R-Offer Lookup Failed:</strong> ' + escapeHtml(err.message);
            testRofferAlert.style.display = 'block';
          }
        } finally {
          btnTestRoffer.disabled = false;
          btnTestRoffer.innerHTML = '<i class="fa fa-gift mr-1"></i> Check R-Offer';
        }
      });
    }

    // General Settings Toggle Badges & Logic
    const generalToggles = [
      'loginOtpEnabled',
      'instantResponseEnabled',
      'complainAcceptAfterEnabled',
      'complainMaxAgeEnabled',
      'notifyPendingTxnEnabled',
      'stopRehitAfterEnabled',
      'maxSellerRetryEnabled',
      'stopSameNumberAmountEnabled',
      'apiDisableFailTxnEnabled',
      'apiDisablePendingTxnEnabled',
      'apiSuspendRefundPercentEnabled',
      'payoutTimeWindowEnabled',
      'payoutAmountLimitEnabled',
      'fundRequestMinAmountEnabled',
      'payoutChargesEnabled',
      'payoutCooldownEnabled',
      'userInactivityAutoDisableEnabled'
    ];

    function updateToggleBadge(id) {
      const cb = document.getElementById(id);
      const statusEl = document.getElementById(id + 'Status');
      if (cb && statusEl) {
        if (cb.checked) {
          statusEl.textContent = 'ON';
          statusEl.className = 'compact-switch-badge badge-on';
        } else {
          statusEl.textContent = 'OFF';
          statusEl.className = 'compact-switch-badge badge-off';
        }
      }
    }

    generalToggles.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => updateToggleBadge(id));
      }
    });

    const complainAcceptModeSelect = document.getElementById('complainAcceptMode');
    const complainAcceptDelayWrap = document.getElementById('complainAcceptDelayWrap');
    function updateComplainDelayVisibility() {
      if (complainAcceptModeSelect && complainAcceptDelayWrap) {
        complainAcceptDelayWrap.style.display = complainAcceptModeSelect.value === 'delay' ? 'flex' : 'none';
      }
    }
    if (complainAcceptModeSelect) {
      complainAcceptModeSelect.addEventListener('change', updateComplainDelayVisibility);
    }

    const redeemModeSelect = document.getElementById('sellerWalletRedeemMode');
    const redeemMinInput = document.getElementById('sellerWalletRedeemMinutes');
    if (redeemModeSelect && redeemMinInput) {
      redeemModeSelect.addEventListener('change', () => {
        if (redeemModeSelect.value === 'instant') {
          redeemMinInput.value = '0';
          redeemMinInput.disabled = true;
        } else {
          if (parseInt(redeemMinInput.value, 10) <= 0) redeemMinInput.value = '5';
          redeemMinInput.disabled = false;
          redeemMinInput.focus();
        }
      });
    }

    const exchangeModeSelect = document.getElementById('sellerWalletExchangeMode');
    const exchangeMinInput = document.getElementById('sellerWalletExchangeMinutes');
    if (exchangeModeSelect && exchangeMinInput) {
      exchangeModeSelect.addEventListener('change', () => {
        if (exchangeModeSelect.value === 'instant') {
          exchangeMinInput.value = '0';
          exchangeMinInput.disabled = true;
        } else {
          if (parseInt(exchangeMinInput.value, 10) <= 0) exchangeMinInput.value = '5';
          exchangeMinInput.disabled = false;
          exchangeMinInput.focus();
        }
      });
    }

    // Save General Settings
    const btnSaveGeneral = document.getElementById('btnSaveGeneralSettings');
    const generalSaveStatus = document.getElementById('generalSettingsSaveStatus');

    if (btnSaveGeneral) {
      btnSaveGeneral.addEventListener('click', async () => {
        btnSaveGeneral.disabled = true;
        btnSaveGeneral.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving...';
        generalSaveStatus.textContent = '';

        const payload = {
          loginOtpEnabled: document.getElementById('loginOtpEnabled').checked,
          instantResponseEnabled: document.getElementById('instantResponseEnabled').checked,
          instantResponseSeconds: Number(document.getElementById('instantResponseSeconds').value) || 15,
          complainAcceptAfterEnabled: document.getElementById('complainAcceptAfterEnabled').checked,
          complainAcceptMode: document.getElementById('complainAcceptMode').value,
          complainAcceptValue: Number(document.getElementById('complainAcceptValue').value) || 60,
          complainAcceptUnit: document.getElementById('complainAcceptUnit').value,
          complainMaxAgeEnabled: document.getElementById('complainMaxAgeEnabled').checked,
          complainMaxAgeDays: Math.max(1, parseInt(document.getElementById('complainMaxAgeDays').value, 10) || 7),
          disputeLienMultiplier: Math.max(1, parseFloat(document.getElementById('disputeLienMultiplier').value) || 1.0),
          disputeRefundLienDays: Math.max(0, parseInt(document.getElementById('disputeRefundLienDays').value, 10) || 7),
          sellerWalletRedeemDelayMinutes: document.getElementById('sellerWalletRedeemMode')?.value === 'instant'
            ? 0
            : Math.max(0, parseInt(document.getElementById('sellerWalletRedeemMinutes')?.value, 10) || 0),
          sellerWalletExchangeDelayMinutes: document.getElementById('sellerWalletExchangeMode')?.value === 'instant'
            ? 0
            : Math.max(0, parseInt(document.getElementById('sellerWalletExchangeMinutes')?.value, 10) || 0),
          notifyPendingTxnEnabled: document.getElementById('notifyPendingTxnEnabled').checked,
          notifyPendingTxnMinutes: Number(document.getElementById('notifyPendingTxnMinutes').value) || 15,
          stopRehitAfterEnabled: document.getElementById('stopRehitAfterEnabled').checked,
          stopRehitAfterMinutes: Number(document.getElementById('stopRehitAfterMinutes').value) || 2,
          maxSellerRetryEnabled: document.getElementById('maxSellerRetryEnabled').checked,
          maxSellerRetryCount: Math.max(0, parseInt(document.getElementById('maxSellerRetryCount').value, 10) || 0),
          stopSameNumberAmountEnabled: document.getElementById('stopSameNumberAmountEnabled').checked,
          stopSameNumberAmountMinutes: Number(document.getElementById('stopSameNumberAmountMinutes').value) || 3,
          apiDisableFailTxnEnabled: document.getElementById('apiDisableFailTxnEnabled').checked,
          apiDisableFailTxnCount: Math.max(1, parseInt(document.getElementById('apiDisableFailTxnCount').value, 10) || 5),
          apiDisablePendingTxnEnabled: document.getElementById('apiDisablePendingTxnEnabled').checked,
          apiDisablePendingTxnCount: Math.max(1, parseInt(document.getElementById('apiDisablePendingTxnCount').value, 10) || 5),
          apiSuspendRefundPercentEnabled: document.getElementById('apiSuspendRefundPercentEnabled').checked,
          apiSuspendRefundPercent: Math.max(1, Math.min(100, parseFloat(document.getElementById('apiSuspendRefundPercent').value) || 25)),
          payoutTimeWindowEnabled: document.getElementById('payoutTimeWindowEnabled').checked,
          payoutStartTime: document.getElementById('payoutStartTime').value || '09:00',
          payoutEndTime: document.getElementById('payoutEndTime').value || '22:00',
          payoutAmountLimitEnabled: document.getElementById('payoutAmountLimitEnabled').checked,
          payoutMinAmount: Math.max(1, parseFloat(document.getElementById('payoutMinAmount').value) || 100),
          payoutMaxAmount: Math.max(1, parseFloat(document.getElementById('payoutMaxAmount').value) || 50000),
          fundRequestMinAmountEnabled: document.getElementById('fundRequestMinAmountEnabled').checked,
          fundRequestMinAmount: Math.max(1, parseFloat(document.getElementById('fundRequestMinAmount').value) || 100),
          payoutChargesEnabled: document.getElementById('payoutChargesEnabled').checked,
          payoutChargeImps: Math.max(0, parseFloat(document.getElementById('payoutChargeImps').value) || 0),
          payoutChargeNeft: Math.max(0, parseFloat(document.getElementById('payoutChargeNeft').value) || 0),
          payoutChargeRtgs: Math.max(0, parseFloat(document.getElementById('payoutChargeRtgs').value) || 0),
          payoutCooldownEnabled: document.getElementById('payoutCooldownEnabled').checked,
          payoutCooldownMinutes: Math.max(1, parseInt(document.getElementById('payoutCooldownMinutes').value, 10) || 30),
          userInactivityAutoDisableEnabled: document.getElementById('userInactivityAutoDisableEnabled') ? document.getElementById('userInactivityAutoDisableEnabled').checked : false,
          userInactivityDays: Math.max(1, parseInt(document.getElementById('userInactivityDays')?.value || 30, 10)),
        };

        try {
          const res = await fetch('/api/admin/settings/services/general', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || data.message || 'Failed to save general settings.');
          generalSaveStatus.textContent = '✓ General settings saved successfully!';
          generalSaveStatus.className = 'text-success font-weight-bold ml-3';
          setTimeout(() => { generalSaveStatus.textContent = ''; }, 3500);
        } catch (err) {
          generalSaveStatus.textContent = '✗ ' + err.message;
          generalSaveStatus.className = 'text-danger font-weight-bold ml-3';
        } finally {
          btnSaveGeneral.disabled = false;
          btnSaveGeneral.innerHTML = '<i class="fa fa-save mr-1"></i> Save General Settings';
        }
      });
    }

    // Run User Inactivity Check Button
    const btnRunInactivity = document.getElementById('btnRunInactivityCheck');
    if (btnRunInactivity) {
      btnRunInactivity.addEventListener('click', async () => {
        const days = Math.max(1, parseInt(document.getElementById('userInactivityDays')?.value || 30, 10));
        if (!confirm('Kya aap sach me un sabhi users ko Inactive (Blocked) karna chahte hain jinka pichle ' + days + ' dino se koi Buy ya Sale txn nahi hua hai?')) {
          return;
        }
        btnRunInactivity.disabled = true;
        btnRunInactivity.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Checking...';
        try {
          const res = await fetch('/api/admin/settings/services/run-inactivity-check', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ inactiveDays: days }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to run inactivity check.');
          alert('Inactivity check completed! ' + (data.inactivatedCount || 0) + ' user(s) set to Inactive (threshold: ' + days + ' days).');
        } catch (err) {
          alert('Error running check: ' + err.message);
        } finally {
          btnRunInactivity.disabled = false;
          btnRunInactivity.innerHTML = '<i class="fa fa-bolt mr-1"></i> Check Now';
        }
      });
    }

    // Dynamic Live News ticker preview
    const newsTickerInput = document.getElementById('newsTickerText');
    const newsTickerPreview = document.getElementById('newsTickerLivePreview');
    if (newsTickerInput && newsTickerPreview) {
      newsTickerInput.addEventListener('input', () => {
        newsTickerPreview.textContent = newsTickerInput.value.trim() || 'Type above to preview...';
      });
    }

    const compressedMediaCache = {};

    function compressImageFile(file, options) {
      options = options || {};
      return new Promise((resolve, reject) => {
        if (!file) return resolve(null);
        const isSvg = file.type === 'image/svg+xml' || (file.name && file.name.toLowerCase().endsWith('.svg'));
        const isIco = file.type === 'image/x-icon' || (file.name && file.name.toLowerCase().endsWith('.ico'));
        if (isSvg || isIco) {
          const reader = new FileReader();
          reader.onload = () => {
            const res = String(reader.result || '');
            const b64 = res.split(',')[1] || '';
            resolve({
              base64: b64,
              mime: file.type || (isSvg ? 'image/svg+xml' : 'image/x-icon'),
              dataUrl: res,
              originalSize: file.size,
              compressedSize: file.size,
              savingsPct: 0
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
          return;
        }

        const maxWidth = options.maxWidth || 1600;
        const maxHeight = options.maxHeight || 1200;
        const quality = typeof options.quality === 'number' ? options.quality : 0.82;
        const keepPng = Boolean(options.keepPng);

        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = (e) => {
          const img = new Image();
          img.onerror = () => {
            const res = String(e.target.result || '');
            resolve({
              base64: res.split(',')[1] || '',
              mime: file.type || 'image/png',
              dataUrl: res,
              originalSize: file.size,
              compressedSize: file.size,
              savingsPct: 0
            });
          };
          img.onload = () => {
            let w = img.width;
            let h = img.height;
            if (w > maxWidth || h > maxHeight) {
              const ratio = Math.min(maxWidth / w, maxHeight / h);
              w = Math.round(w * ratio);
              h = Math.round(h * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);

            const targetMime = (keepPng && file.type === 'image/png') ? 'image/png' : 'image/webp';
            let dataUrl = '';
            let finalMime = targetMime;
            try {
              dataUrl = canvas.toDataURL(targetMime, quality);
              if (!dataUrl.startsWith('data:' + targetMime)) {
                dataUrl = canvas.toDataURL('image/jpeg', quality);
                finalMime = 'image/jpeg';
              }
            } catch (_) {
              dataUrl = canvas.toDataURL('image/jpeg', quality);
              finalMime = 'image/jpeg';
            }

            const b64 = dataUrl.split(',')[1] || '';
            const compSize = Math.round((b64.length * 3) / 4);
            const savingsPct = file.size > compSize ? Math.round((1 - compSize / file.size) * 100) : 0;

            resolve({
              base64: b64,
              mime: finalMime,
              dataUrl: dataUrl,
              originalSize: file.size,
              compressedSize: compSize,
              savingsPct: savingsPct,
              width: w,
              height: h
            });
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    // Setup media file preview with drag-and-drop & auto-compression
    function setupFilePreview(inputId, imgId, resetBoxId, dropAreaId, compressOpts) {
      const input = document.getElementById(inputId);
      const img = document.getElementById(imgId);
      const dropArea = dropAreaId ? document.getElementById(dropAreaId) : null;

      async function handleFile(file) {
        if (!file) return;
        let badgeEl = document.getElementById(inputId + '_opt_badge');
        if (!badgeEl && dropArea) {
          badgeEl = document.createElement('div');
          badgeEl.id = inputId + '_opt_badge';
          badgeEl.className = 'mt-2 p-2 rounded small text-info bg-light border';
          dropArea.parentNode.insertBefore(badgeEl, dropArea.nextSibling);
        }
        if (badgeEl) {
          badgeEl.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Optimizing and reducing image for fast display...';
          badgeEl.className = 'mt-2 p-2 rounded small text-info bg-light border';
        }

        try {
          const comp = await compressImageFile(file, compressOpts);
          compressedMediaCache[inputId] = comp;
          if (img) img.src = comp.dataUrl;
          if (resetBoxId) {
            const resetBox = document.getElementById(resetBoxId);
            if (resetBox) resetBox.checked = false;
          }
          if (inputId === 'login_popup_image_file') {
            const sw = document.getElementById('loginPopupEnabled');
            if (sw) sw.checked = true;
            const lbl = document.getElementById('loginPopupEnabledLabel');
            if (lbl) lbl.textContent = 'Popup Enabled';
          }
          if (inputId === 'dashboard_popup_image_file') {
            const sw = document.getElementById('dashboardPopupEnabled');
            if (sw) sw.checked = true;
            const lbl = document.getElementById('dashboardPopupEnabledLabel');
            if (lbl) lbl.textContent = 'Popup Enabled';
          }

          if (badgeEl) {
            const origKb = (comp.originalSize / 1024).toFixed(0);
            const compKb = (comp.compressedSize / 1024).toFixed(0);
            badgeEl.className = 'mt-2 p-2 rounded small text-success bg-light border border-success';
            badgeEl.innerHTML = '<i class="fa fa-bolt mr-1"></i> <b>Auto-Reduced for Fast Display:</b> ' + origKb + ' KB &rarr; <b>' + compKb + ' KB</b> (' + comp.savingsPct + '% reduction, ' + (comp.width || '') + 'x' + (comp.height || '') + 'px ' + (comp.mime.split('/')[1] || '').toUpperCase() + ')';
          }
        } catch (err) {
          console.error('Compression error:', err);
          const reader = new FileReader();
          reader.onload = (evt) => {
            if (img) img.src = evt.target.result;
          };
          reader.readAsDataURL(file);
        }
      }

      if (input) {
        input.addEventListener('change', (e) => {
          handleFile(e.target.files[0]);
        });
      }

      if (dropArea) {
        ['dragenter', 'dragover'].forEach((eventName) => {
          dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropArea.style.borderColor = '#3b82f6';
            dropArea.style.backgroundColor = '#eff6ff';
          });
        });
        ['dragleave', 'drop'].forEach((eventName) => {
          dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropArea.style.borderColor = '#cbd5e1';
            dropArea.style.backgroundColor = '#f8fafc';
          });
        });
        dropArea.addEventListener('drop', (e) => {
          const dt = e.dataTransfer;
          const file = dt && dt.files && dt.files[0];
          if (file) {
            if (input && window.DataTransfer) {
              try {
                const dtObj = new DataTransfer();
                dtObj.items.add(file);
                input.files = dtObj.files;
              } catch (_) {}
            }
            handleFile(file);
          }
        });
      }
    }

    setupFilePreview('dashboard_banner_file', 'banner-preview-img', 'reset_dashboard_banner', 'banner-drop-area', { maxWidth: 1920, maxHeight: 600, quality: 0.85 });
    setupFilePreview('login_side_image_file', 'login-side-preview-img', 'reset_login_side_image', 'login-side-drop-area', { maxWidth: 1080, maxHeight: 1600, quality: 0.85 });
    setupFilePreview('login_popup_image_file', 'login-popup-preview-img', 'reset_login_popup', 'login-popup-drop-area', { maxWidth: 800, maxHeight: 900, quality: 0.85 });
    setupFilePreview('dashboard_popup_image_file', 'dashboard-popup-preview-img', 'reset_dashboard_popup', 'dashboard-popup-drop-area', { maxWidth: 800, maxHeight: 900, quality: 0.85 });

    // Save Notifications Form
    const notificationForm = document.getElementById('notificationForm');
    const btnSaveNotifications = document.getElementById('btnSaveNotifications');
    const notificationSaveStatus = document.getElementById('notificationSaveStatus');

    if (notificationForm) {
      notificationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        btnSaveNotifications.disabled = true;
        btnSaveNotifications.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving Notifications...';
        notificationSaveStatus.textContent = '';

        try {
          const payload = {
            newsTickerEnabled: document.getElementById('newsTickerEnabled').checked,
            newsTickerText: document.getElementById('newsTickerText').value.trim(),
            dashboardBannerEnabled: document.getElementById('dashboardBannerEnabled')?.checked !== false,
            reset_dashboard_banner: document.getElementById('reset_dashboard_banner')?.checked || false,
            loginSideImageEnabled: document.getElementById('loginSideImageEnabled').checked,
            reset_login_side_image: document.getElementById('reset_login_side_image')?.checked || false,
            loginPopupEnabled: document.getElementById('loginPopupEnabled').checked,
            loginPopupLink: document.getElementById('loginPopupLink').value.trim(),
            reset_login_popup: document.getElementById('reset_login_popup')?.checked || false,
            dashboardPopupEnabled: document.getElementById('dashboardPopupEnabled').checked,
            dashboardPopupFrequency: document.getElementById('dashboardPopupFrequency').value,
            dashboardPopupLink: document.getElementById('dashboardPopupLink').value.trim(),
            reset_dashboard_popup: document.getElementById('reset_dashboard_popup')?.checked || false,
          };

          const bannerFile = document.getElementById('dashboard_banner_file')?.files[0];
          if (bannerFile) {
            const comp = compressedMediaCache['dashboard_banner_file'] || await compressImageFile(bannerFile, { maxWidth: 1920, maxHeight: 600, quality: 0.85 });
            payload.dashboard_banner_data_b64 = comp.base64;
            payload.dashboard_banner_mime = comp.mime;
          }

          const loginSideFile = document.getElementById('login_side_image_file')?.files[0];
          if (loginSideFile) {
            const comp = compressedMediaCache['login_side_image_file'] || await compressImageFile(loginSideFile, { maxWidth: 1080, maxHeight: 1600, quality: 0.85 });
            payload.login_side_image_data_b64 = comp.base64;
            payload.login_side_image_mime = comp.mime;
          }

          const loginPopupFile = document.getElementById('login_popup_image_file')?.files[0];
          if (loginPopupFile) {
            const comp = compressedMediaCache['login_popup_image_file'] || await compressImageFile(loginPopupFile, { maxWidth: 800, maxHeight: 900, quality: 0.85 });
            payload.login_popup_image_data_b64 = comp.base64;
            payload.login_popup_image_mime = comp.mime;
            payload.loginPopupEnabled = true;
          }

          const dashPopupFile = document.getElementById('dashboard_popup_image_file')?.files[0];
          if (dashPopupFile) {
            const comp = compressedMediaCache['dashboard_popup_image_file'] || await compressImageFile(dashPopupFile, { maxWidth: 800, maxHeight: 900, quality: 0.85 });
            payload.dashboard_popup_image_data_b64 = comp.base64;
            payload.dashboard_popup_image_mime = comp.mime;
            payload.dashboardPopupEnabled = true;
          }

          const res = await fetch('/api/admin/settings/services/notifications', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to save notification settings.');

          notificationSaveStatus.textContent = '✓ Saved successfully!';
          notificationSaveStatus.className = 'text-success font-weight-bold ml-2';
          setTimeout(() => { notificationSaveStatus.textContent = ''; }, 3500);

          // Update cache-busted preview URLs and reload fresh state
          const t = Date.now();
          if (document.getElementById('banner-preview-img')) document.getElementById('banner-preview-img').src = '/api/dashboard-banner?t=' + t;
          if (document.getElementById('login-side-preview-img')) document.getElementById('login-side-preview-img').src = '/api/login-side-image?t=' + t;
          if (document.getElementById('login-popup-preview-img')) document.getElementById('login-popup-preview-img').src = '/api/login-popup-image?t=' + t;
          if (document.getElementById('dashboard-popup-preview-img')) document.getElementById('dashboard-popup-preview-img').src = '/api/dashboard-popup-image?t=' + t;

          // Clear file inputs so subsequent uploads don't double submit
          ['dashboard_banner_file', 'login_side_image_file', 'login_popup_image_file', 'dashboard_popup_image_file'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
            delete compressedMediaCache[id];
            const badgeEl = document.getElementById(id + '_opt_badge');
            if (badgeEl) badgeEl.remove();
          });

          // Reload settings after short delay to refresh status badges
          setTimeout(loadSettings, 400);
        } catch (err) {
          notificationSaveStatus.textContent = '✗ ' + err.message;
          notificationSaveStatus.className = 'text-danger font-weight-bold ml-2';
        } finally {
          btnSaveNotifications.disabled = false;
          btnSaveNotifications.innerHTML = '<i class="fa fa-save mr-1"></i> Save Notification Settings &amp; Media';
        }
      });
    }

    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          const b64 = result.split(',')[1] || '';
          resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/settings/service-settings' }));
  }

  /**
   * GET /api/admin/settings/services - Retrieve all saved service settings
   */
  async function handleGetServices(request, response) {
    const rows = await db.query('SELECT service_key, is_enabled, config_ciphertext, updated_at FROM admin_service_settings');
    const result = {};
    for (const r of rows.rows) {
      const config = decryptServiceConfig(r.config_ciphertext);
      result[r.service_key] = {
        isEnabled: r.is_enabled,
        ...config,
      };
    }
    if (!result.general) {
      result.general = {
        isEnabled: true,
        loginOtpEnabled: false,
        instantResponseEnabled: true,
        instantResponseSeconds: 15,
        complainAcceptAfterEnabled: false,
        complainAcceptMode: 'instant',
        complainAcceptValue: 60,
        complainAcceptUnit: 'seconds',
        complainMaxAgeEnabled: true,
        complainMaxAgeDays: 7,
        disputeLienMultiplier: 1.0,
        disputeRefundLienMultiplier: 1.0,
        disputeRefundLienDays: 7,
        notifyPendingTxnEnabled: true,
        notifyPendingTxnMinutes: 15,
        stopRehitAfterEnabled: true,
        stopRehitAfterMinutes: 2,
        maxSellerRetryEnabled: true,
        maxSellerRetryCount: 3,
        stopSameNumberAmountEnabled: true,
        stopSameNumberAmountMinutes: 3,
        apiDisableFailTxnEnabled: true,
        apiDisableFailTxnCount: 5,
        apiDisablePendingTxnEnabled: true,
        apiDisablePendingTxnCount: 5,
        apiSuspendRefundPercentEnabled: true,
        apiSuspendRefundPercent: 25,
        payoutTimeWindowEnabled: false,
        payoutStartTime: '09:00',
        payoutEndTime: '22:00',
        payoutAmountLimitEnabled: false,
        payoutMinAmount: 100,
        payoutMaxAmount: 50000,
        fundRequestMinAmountEnabled: false,
        fundRequestMinAmount: 100,
        payoutChargesEnabled: false,
        payoutChargeImps: 5.00,
        payoutChargeNeft: 3.00,
        payoutChargeRtgs: 10.00,
        payoutCooldownEnabled: false,
        payoutCooldownMinutes: 30,
        userInactivityAutoDisableEnabled: false,
        userInactivityDays: 30,
        sellerWalletRedeemDelayMinutes: 0,
        sellerWalletExchangeDelayMinutes: 0,
      };
    }
    try {
      const wsRes = await db.query(
        'SELECT seller_sale_redeem_hold_minutes, seller_sale_exchange_hold_minutes, dispute_lien_multiplier, dispute_refund_lien_days FROM website_settings WHERE id = 1'
      );
      if (wsRes.rowCount > 0 && result.general) {
        const ws = wsRes.rows[0];
        if (ws.seller_sale_redeem_hold_minutes !== null && ws.seller_sale_redeem_hold_minutes !== undefined) {
          result.general.sellerWalletRedeemDelayMinutes = parseInt(ws.seller_sale_redeem_hold_minutes, 10);
        }
        if (ws.seller_sale_exchange_hold_minutes !== null && ws.seller_sale_exchange_hold_minutes !== undefined) {
          result.general.sellerWalletExchangeDelayMinutes = parseInt(ws.seller_sale_exchange_hold_minutes, 10);
        }
      }
    } catch (_) {}

    try {
      const notifRes = await db.query(
        `SELECT news_ticker, news_ticker_enabled,
                dashboard_banner_enabled,
                (dashboard_banner_data IS NOT NULL) AS has_dashboard_banner,
                (login_side_image_data IS NOT NULL) AS has_login_side_image,
                login_side_image_enabled,
                (login_popup_image_data IS NOT NULL) AS has_login_popup,
                login_popup_enabled, login_popup_link,
                (dashboard_popup_image_data IS NOT NULL) AS has_dashboard_popup,
                dashboard_popup_enabled, dashboard_popup_link, dashboard_popup_frequency
         FROM website_settings WHERE id = 1`
      );
      if (notifRes.rowCount > 0) {
        const notif = notifRes.rows[0];
        if (notif.has_login_popup) {
          notif.login_popup_enabled = notif.login_popup_enabled !== false;
        }
        if (notif.has_dashboard_popup) {
          notif.dashboard_popup_enabled = notif.dashboard_popup_enabled !== false;
        }
        result.notifications = notif;
      }
    } catch (_) {}
    if (!result.sms) {
      result.sms = {
        isEnabled: false,
        requestType: 'GET',
        apiUrl: 'https://services.easyrechargesolution.com/api/sms/send?token=YOUR_AUTH_BEARER_TOKEN&recipient=[RECIPIENT]&message=[MESSAGE]&simSlot=0',
        simSlot: '0',
        postBody: '',
        headers: '',
      };
    }
    if (!result.plan_api) {
      result.plan_api = {
        isEnabled: true,
        provider: 'ezytm',
        brandName: 'Plan API (EZYTM)',
        activeBrand: 'Plan API (EZYTM)',
        apiUserId: '5100',
        apiPassword: 'amart@74',
        circleUrl: 'https://planapi.in/api/Mobile/OperatorFetchNew',
        rofferUrl: 'https://planapi.in/api/Mobile/RofferCheck',
        apiUrl: 'https://planapi.in/api/Mobile/OperatorFetchNew',
        requestType: 'GET',
      };
    } else {
      result.plan_api.provider = result.plan_api.provider || 'ezytm';
      result.plan_api.brandName = 'Plan API (EZYTM)';
      result.plan_api.activeBrand = 'Plan API (EZYTM)';
      result.plan_api.requestType = 'GET';
      result.plan_api.circleUrl = 'https://planapi.in/api/Mobile/OperatorFetchNew';
      result.plan_api.rofferUrl = 'https://planapi.in/api/Mobile/RofferCheck';
      if (!result.plan_api.apiUserId || result.plan_api.apiUserId === '9335819686') {
        result.plan_api.apiUserId = '5100';
      }
      if (!result.plan_api.apiPassword) {
        result.plan_api.apiPassword = 'amart@74';
      }
      if (!result.plan_api.apiUrl || result.plan_api.apiUrl.includes('easyrechargesolution')) {
        result.plan_api.apiUrl = 'https://planapi.in/api/Mobile/OperatorFetchNew';
      }
    }
    sendJson(response, 200, result);
  }

  /**
   * POST /api/admin/settings/services/general - Save General Settings configuration
   */
  async function handleSaveGeneralSettings(request, response, input) {
    const config = {
      loginOtpEnabled: Boolean(input.loginOtpEnabled),
      instantResponseEnabled: Boolean(input.instantResponseEnabled),
      instantResponseSeconds: Math.max(1, parseInt(input.instantResponseSeconds, 10) || 15),
      complainAcceptAfterEnabled: Boolean(input.complainAcceptAfterEnabled),
      complainAcceptMode: input.complainAcceptMode === 'delay' ? 'delay' : 'instant',
      complainAcceptValue: Math.max(0, parseInt(input.complainAcceptValue, 10) || 0),
      complainAcceptUnit: input.complainAcceptUnit === 'minutes' ? 'minutes' : 'seconds',
      complainMaxAgeEnabled: Boolean(input.complainMaxAgeEnabled),
      complainMaxAgeDays: Math.max(1, parseInt(input.complainMaxAgeDays, 10) || 7),
      disputeLienMultiplier: Math.max(1, parseFloat(input.disputeLienMultiplier) || 1.0),
      disputeRefundLienMultiplier: Math.max(1, parseFloat(input.disputeLienMultiplier) || 1.0),
      disputeRefundLienDays: Math.max(0, parseInt(input.disputeRefundLienDays, 10) || 7),
      notifyPendingTxnEnabled: Boolean(input.notifyPendingTxnEnabled),
      notifyPendingTxnMinutes: Math.max(1, parseInt(input.notifyPendingTxnMinutes, 10) || 15),
      stopRehitAfterEnabled: Boolean(input.stopRehitAfterEnabled),
      stopRehitAfterMinutes: Math.max(1, parseInt(input.stopRehitAfterMinutes, 10) || 2),
      maxSellerRetryEnabled: Boolean(input.maxSellerRetryEnabled),
      maxSellerRetryCount: Math.max(0, parseInt(input.maxSellerRetryCount, 10) || 0),
      stopSameNumberAmountEnabled: Boolean(input.stopSameNumberAmountEnabled),
      stopSameNumberAmountMinutes: Math.max(1, parseInt(input.stopSameNumberAmountMinutes, 10) || 3),
      apiDisableFailTxnEnabled: Boolean(input.apiDisableFailTxnEnabled),
      apiDisableFailTxnCount: Math.max(1, parseInt(input.apiDisableFailTxnCount, 10) || 5),
      apiDisablePendingTxnEnabled: Boolean(input.apiDisablePendingTxnEnabled),
      apiDisablePendingTxnCount: Math.max(1, parseInt(input.apiDisablePendingTxnCount, 10) || 5),
      apiSuspendRefundPercentEnabled: Boolean(input.apiSuspendRefundPercentEnabled),
      apiSuspendRefundPercent: Math.max(1, Math.min(100, parseFloat(input.apiSuspendRefundPercent) || 25)),
      payoutTimeWindowEnabled: Boolean(input.payoutTimeWindowEnabled),
      payoutStartTime: String(input.payoutStartTime || '09:00').trim(),
      payoutEndTime: String(input.payoutEndTime || '22:00').trim(),
      payoutAmountLimitEnabled: Boolean(input.payoutAmountLimitEnabled),
      payoutMinAmount: Math.max(1, parseFloat(input.payoutMinAmount) || 100),
      payoutMaxAmount: Math.max(1, parseFloat(input.payoutMaxAmount) || 50000),
      fundRequestMinAmountEnabled: Boolean(input.fundRequestMinAmountEnabled),
      fundRequestMinAmount: Math.max(1, parseFloat(input.fundRequestMinAmount) || 100),
      payoutChargesEnabled: Boolean(input.payoutChargesEnabled),
      payoutChargeImps: Math.max(0, parseFloat(input.payoutChargeImps) || 0),
      payoutChargeNeft: Math.max(0, parseFloat(input.payoutChargeNeft) || 0),
      payoutChargeRtgs: Math.max(0, parseFloat(input.payoutChargeRtgs) || 0),
      payoutCooldownEnabled: Boolean(input.payoutCooldownEnabled),
      payoutCooldownMinutes: Math.max(1, parseInt(input.payoutCooldownMinutes, 10) || 30),
      userInactivityAutoDisableEnabled: Boolean(input.userInactivityAutoDisableEnabled),
      userInactivityDays: Math.max(1, parseInt(input.userInactivityDays, 10) || 30),
      sellerWalletRedeemDelayMinutes: Math.max(0, parseInt(input.sellerWalletRedeemDelayMinutes, 10) || 0),
      sellerWalletExchangeDelayMinutes: Math.max(0, parseInt(input.sellerWalletExchangeDelayMinutes, 10) || 0),
    };

    const ciphertext = encryptServiceConfig(config);

    await db.query(
      `INSERT INTO admin_service_settings (service_key, is_enabled, config_ciphertext, updated_at)
       VALUES ('general', true, $1, now())
       ON CONFLICT (service_key) DO UPDATE
       SET is_enabled = EXCLUDED.is_enabled, config_ciphertext = EXCLUDED.config_ciphertext, updated_at = now()`,
      [ciphertext],
    );

    await db.query(
      `UPDATE website_settings
       SET dispute_lien_multiplier = $1,
           dispute_refund_lien_multiplier = $1,
           dispute_refund_lien_days = $2,
           seller_sale_redeem_hold_minutes = $3,
           seller_sale_exchange_hold_minutes = $4,
           updated_at = now()
       WHERE id = 1`,
      [config.disputeLienMultiplier, config.disputeRefundLienDays, config.sellerWalletRedeemDelayMinutes, config.sellerWalletExchangeDelayMinutes]
    ).catch(err => console.warn('[General Settings] website_settings update warning:', err.message));

    clearPolicyCache();

    sendJson(response, 200, { ok: true, message: 'General settings saved successfully.', general: config });
  }

  /**
   * POST /api/admin/settings/services/email - Save Email (Google Script Webhook or SMTP) configuration
   */
  async function handleSaveEmailSettings(request, response, input) {
    const isEnabled = Boolean(input.isEnabled);
    const provider = String(input.provider || 'google_script').trim();
    const googleScriptUrl = String(input.googleScriptUrl || '').trim();
    const googleScriptKey = String(input.googleScriptKey || '').trim();
    const fromName = String(input.fromName || 'Exchange Portal Admin').trim();

    const smtpHost = String(input.smtpHost || '').trim();
    const smtpPort = Number(input.smtpPort) || 465;
    const encryption = String(input.encryption || 'ssl').trim();
    const username = String(input.username || '').trim().toLowerCase();
    const password = String(input.password || '').trim().replace(/\s+/g, '');
    const fromEmail = String(input.fromEmail || username).trim().toLowerCase();

    if (isEnabled) {
      if (provider === 'google_script') {
        if (!googleScriptUrl || !googleScriptUrl.startsWith('https://')) {
          throw httpError('Please provide a valid Google Script Web App URL (starts with https://script.google.com/...)', 400);
        }
      } else {
        if (!smtpHost || !username || !password) {
          throw httpError('SMTP Host, Username, and Password / App Password are required when email service is enabled.', 400);
        }
      }
    }

    const config = {
      provider,
      googleScriptUrl,
      googleScriptKey,
      fromName,
      smtpHost,
      smtpPort,
      encryption,
      username,
      password,
      fromEmail,
    };

    const ciphertext = encryptServiceConfig(config);

    await db.query(
      `INSERT INTO admin_service_settings (service_key, is_enabled, config_ciphertext, updated_at)
       VALUES ('email', $1, $2, now())
       ON CONFLICT (service_key) DO UPDATE
       SET is_enabled = EXCLUDED.is_enabled, config_ciphertext = EXCLUDED.config_ciphertext, updated_at = now()`,
      [isEnabled, ciphertext],
    );

    sendJson(response, 200, { ok: true, message: 'Email settings saved successfully.' });
  }

  /**
   * POST /api/admin/settings/services/email/test - Send a live test email via Google Apps Script Webhook or SMTP
   */
  async function handleTestEmail(request, response, input) {
    const toEmail = String(input.toEmail || '').trim().toLowerCase();
    if (!toEmail || !toEmail.includes('@')) {
      throw httpError('Valid recipient email address is required.', 400);
    }

    const provider = String(input.provider || 'google_script').trim();
    let googleScriptUrl = String(input.googleScriptUrl || '').trim();
    let googleScriptKey = String(input.googleScriptKey || '').trim();
    let fromName = String(input.fromName || 'Exchange Portal Admin').trim();

    // 1) Test via Google Apps Script Webhook (Port 443 HTTPS - Works 100% on Render Cloud)
    if (provider === 'google_script' || (googleScriptUrl && !input.smtpHost)) {
      if (!googleScriptUrl) {
        const row = await db.query("SELECT config_ciphertext FROM admin_service_settings WHERE service_key = 'email'");
        if (row.rowCount > 0) {
          const saved = decryptServiceConfig(row.rows[0].config_ciphertext);
          googleScriptUrl = googleScriptUrl || saved.googleScriptUrl || '';
          googleScriptKey = googleScriptKey || saved.googleScriptKey || '';
          fromName = fromName || saved.fromName || 'Exchange Portal Admin';
        }
      }

      if (!googleScriptUrl || !googleScriptUrl.startsWith('https://')) {
        throw httpError('Please enter a valid Google Script Web App URL (starts with https://script.google.com/...)', 400);
      }

      const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      try {
        const res = await fetch(googleScriptUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          redirect: 'follow', // Handles Google Apps Script 302 redirect
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            key: googleScriptKey,
            to: toEmail,
            subject: `[Exchange Portal] Gmail Test Verification (${nowStr})`,
            text: `Hello,\n\nYour Google Apps Script Gmail Webhook is working perfectly on Exchange Portal!\n\nDelivery: HTTPS (Port 443)\nVerified At: ${nowStr}\n\nRegards,\nExchange Portal Admin`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
                <div style="background: #1e3a8a; color: #ffffff; padding: 18px 24px;">
                  <h2 style="margin: 0; font-size: 20px;">Exchange Portal</h2>
                  <p style="margin: 4px 0 0; font-size: 13px; color: #bfdbfe;">Gmail Notification Verification</p>
                </div>
                <div style="padding: 24px;">
                  <p style="font-size: 15px; color: #1e293b; margin-top: 0;">Hello,</p>
                  <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
                    <strong style="color: #15803d; font-size: 14px;">✓ Gmail Delivery Verified Successfully!</strong>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #166534;">Your Gmail account is connected via Google Apps Script Webhook over HTTPS Port 443.</p>
                  </div>
                  <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; color: #334155;">
                    <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold; width: 140px;">Delivery Method:</td><td>Google Apps Script Webhook (Port 443)</td></tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Sender Name:</td><td>${escapeHtml(fromName)}</td></tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Recipient:</td><td>${escapeHtml(toEmail)}</td></tr>
                    <tr><td style="padding: 8px 0; font-weight: bold;">Verified At:</td><td>${escapeHtml(nowStr)}</td></tr>
                  </table>
                  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                  <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">This is an automated test message sent from Exchange Portal Admin Console.</p>
                </div>
              </div>
            `,
            name: fromName,
          }),
        });

        const respText = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(respText); } catch (_) {}

        if (!parsed || parsed.status !== 'success') {
          let errorDetail = (parsed && (parsed.message || parsed.error)) || '';
          if (!errorDetail) {
            if (respText.includes('Sorry, unable to open the file') || respText.includes('Page not found')) {
              errorDetail = 'Google ne access reject kar diya (Page not found / Unauthorized). Kripya Google Script me Deploy -> Manage deployments me jakar check karein ki "Who has access" = "Anyone" select hai aur Editor me ek bar Test Run karke permissions Allow kiye gaye hain.';
            } else {
              errorDetail = 'Invalid response from Google Script Webhook: ' + respText.slice(0, 150);
            }
          }
          throw new Error(errorDetail);
        }

        sendJson(response, 200, {
          ok: true,
          message: `Test email successfully delivered to ${toEmail} via your Gmail account!`,
        });
        return;
      } catch (err) {
        console.error('Google Script Email error:', err);
        throw httpError(`Gmail Webhook Error: ${err.message}`, 400);
      }
    }

    // 2) Standard SMTP / Direct Gmail fallback
    let host = input.smtpHost ? String(input.smtpHost).trim() : '';
    let port = input.smtpPort ? Number(input.smtpPort) : 0;
    let encryption = input.encryption ? String(input.encryption).trim() : '';
    let user = input.username ? String(input.username).trim().toLowerCase() : '';
    let pass = input.password ? String(input.password).trim().replace(/\s+/g, '') : '';
    let fromEmail = input.fromEmail ? String(input.fromEmail).trim().toLowerCase() : '';

    if (!host || !user || !pass) {
      const row = await db.query("SELECT config_ciphertext FROM admin_service_settings WHERE service_key = 'email'");
      if (row.rowCount > 0) {
        const saved = decryptServiceConfig(row.rows[0].config_ciphertext);
        host = host || saved.smtpHost;
        port = port || saved.smtpPort;
        encryption = encryption || saved.encryption;
        user = user || saved.username;
        pass = pass || saved.password;
        fromEmail = fromEmail || saved.fromEmail || user;
        fromName = fromName || saved.fromName || 'Exchange Portal Admin';
      }
    }

    if (user) user = String(user).trim().toLowerCase();
    if (fromEmail) fromEmail = String(fromEmail).trim().toLowerCase();
    if (pass) pass = String(pass).trim().replace(/\s+/g, '');
    if (!fromEmail) fromEmail = user;
    if (!fromName) fromName = 'Exchange Portal Admin';

    if (!host || !user || !pass) {
      throw httpError('Incomplete SMTP configuration. Please fill Host, Username, and Password.', 400);
    }

    const isGmail = host.includes('gmail.com') || user.endsWith('@gmail.com');
    const isSecure = encryption === 'ssl' || port === 465;

    const createTransportInstance = (targetPort, secureMode) => nodemailer.createTransport({
      host: isGmail ? 'smtp.gmail.com' : host,
      port: targetPort,
      secure: secureMode,
      family: 4, // CRITICAL: Enforce IPv4 to avoid ENETUNREACH IPv6 routing error on Render
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'false' ? false : true,
      },
      connectionTimeout: 8000,
      greetingTimeout: 6000,
      socketTimeout: 10000,
    });

    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: toEmail,
      subject: `[Exchange Test] SMTP Email Verification (${nowStr})`,
      text: `Hello,\n\nYour SMTP email settings on Exchange Portal are working perfectly!\n\nHost: ${host}\nPort: ${port}\nUsername: ${user}\nTime: ${nowStr}\n\nRegards,\nExchange Portal Admin`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
          <div style="background: #1e3a8a; color: #ffffff; padding: 18px 24px;">
            <h2 style="margin: 0; font-size: 20px;">Exchange Portal</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #bfdbfe;">SMTP Email System Verification</p>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 15px; color: #1e293b; margin-top: 0;">Hello,</p>
            <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
              <strong style="color: #15803d; font-size: 14px;">✓ SMTP Email Configuration Verified!</strong>
              <p style="margin: 4px 0 0; font-size: 13px; color: #166534;">Your Gmail / SMTP settings are active and ready to deliver system notifications and transaction alerts.</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; color: #334155;">
              <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold; width: 130px;">SMTP Host:</td><td>${escapeHtml(host)}</td></tr>
              <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Port &amp; Security:</td><td>${escapeHtml(port)} (${escapeHtml(encryption.toUpperCase())})</td></tr>
              <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">SMTP User:</td><td>${escapeHtml(user)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold;">Verified At:</td><td>${escapeHtml(nowStr)}</td></tr>
            </table>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">This is an automated test message sent from Exchange Portal Admin Console.</p>
          </div>
        </div>
      `,
    };

    try {
      let transporter = createTransportInstance(port, isSecure);
      let info;
      try {
        info = await transporter.sendMail(mailOptions);
      } catch (firstErr) {
        if (isGmail) {
          const altPort = isSecure ? 587 : 465;
          const altTransporter = createTransportInstance(altPort, !isSecure);
          info = await altTransporter.sendMail(mailOptions);
        } else {
          throw firstErr;
        }
      }

      sendJson(response, 200, {
        ok: true,
        message: `Test email successfully delivered to ${toEmail}. Message ID: ${info.messageId}`,
      });
    } catch (err) {
      console.error('SMTP Send error:', err);
      let userErrMsg = err.message;
      if (/invalid login|badcredential|username and password not accepted/i.test(err.message)) {
        userErrMsg = 'Gmail ne credentials reject kar diye: Kripya 16-digit Google App Password check karein aur ensure karein ki 2-Step Verification ON hai.';
      } else if (/enotfound|enetunreach|etimedout/i.test(err.message)) {
        userErrMsg = `SMTP server connection error (${err.code || err.message}).`;
      }
      throw httpError(`SMTP Error: ${userErrMsg}`, 400);
    }
  }


  /**
   * POST /api/admin/settings/services/sms - Save SMS configuration
   */
  async function handleSaveSmsSettings(request, response, input) {
    const isEnabled = Boolean(input.isEnabled);
    const requestType = String(input.requestType || 'GET').trim().toUpperCase();
    const apiUrl = String(input.apiUrl || '').trim();
    const simSlot = String(input.simSlot || '0').trim();
    const postBody = String(input.postBody || '').trim();
    const headers = String(input.headers || '').trim();

    if (isEnabled && !apiUrl) {
      throw httpError('API URL is required when SMS service is enabled.', 400);
    }

    const config = {
      requestType,
      apiUrl,
      simSlot,
      postBody,
      headers,
    };

    const ciphertext = encryptServiceConfig(config);

    await db.query(
      `INSERT INTO admin_service_settings (service_key, is_enabled, config_ciphertext, updated_at)
       VALUES ('sms', $1, $2, now())
       ON CONFLICT (service_key) DO UPDATE
       SET is_enabled = EXCLUDED.is_enabled, config_ciphertext = EXCLUDED.config_ciphertext, updated_at = now()`,
      [isEnabled, ciphertext],
    );

    sendJson(response, 200, { ok: true, message: 'SMS settings saved successfully.' });
  }

  /**
   * POST /api/admin/settings/services/sms/test - Send a test SMS message
   */
  async function handleTestSms(request, response, input) {
    const toNumber = String(input.toNumber || '').trim().replace(/\D/g, '');
    if (!toNumber || toNumber.length < 10) {
      throw httpError('Valid 10-digit recipient mobile number is required.', 400);
    }

    const rawMessage = String(input.message || 'Hello! This is a test SMS message from Exchange Portal.').trim();
    const message = rawMessage.slice(0, 160);

    let requestType = String(input.requestType || '').trim().toUpperCase();
    let apiUrl = String(input.apiUrl || '').trim();
    let simSlot = String(input.simSlot || '0').trim();
    let postBody = String(input.postBody || '').trim();
    let rawHeaders = String(input.headers || '').trim();

    if (!apiUrl) {
      const row = await db.query("SELECT config_ciphertext FROM admin_service_settings WHERE service_key = 'sms'");
      if (row.rowCount > 0) {
        const saved = decryptServiceConfig(row.rows[0].config_ciphertext);
        requestType = requestType || saved.requestType || 'GET';
        apiUrl = apiUrl || saved.apiUrl || saved.gatewayUrl || '';
        simSlot = simSlot || saved.simSlot || '0';
        postBody = postBody || saved.postBody || '';
        rawHeaders = rawHeaders || saved.headers || '';
      }
    }

    if (!apiUrl) {
      throw httpError('Incomplete SMS gateway settings. Please enter API URL.', 400);
    }

    if (!requestType) requestType = 'GET';

    const mobile10 = toNumber.slice(-10);
    const mobileWithCc = toNumber.length === 12 && toNumber.startsWith('91') ? toNumber : `91${mobile10}`;

    // Keyword replacements for URL (with URL encoding)
    let finalUrl = apiUrl
      .replace(/\[RECIPIENT\]/gi, encodeURIComponent(mobile10))
      .replace(/\[MOBILE_NO\]/gi, encodeURIComponent(mobile10))
      .replace(/\[MOBILE\]/gi, encodeURIComponent(mobile10))
      .replace(/\[PHONE\]/gi, encodeURIComponent(mobile10))
      .replace(/\[MOBILE_WITH_CC\]/gi, encodeURIComponent(mobileWithCc))
      .replace(/\[MOBILE_91\]/gi, encodeURIComponent(mobileWithCc))
      .replace(/\[MESSAGE\]/gi, encodeURIComponent(message))
      .replace(/\[CONTENT\]/gi, encodeURIComponent(message))
      .replace(/\[MSG\]/gi, encodeURIComponent(message))
      .replace(/\[TEXT\]/gi, encodeURIComponent(message))
      .replace(/\[SIM_SLOT\]/gi, encodeURIComponent(simSlot))
      .replace(/\[SIM\]/gi, encodeURIComponent(simSlot));

    // Handle literal placeholders if admin pasted sample URL as-is
    if (!apiUrl.includes('[RECIPIENT]') && !apiUrl.includes('[MOBILE') && finalUrl.includes('recipient=9876543210')) {
      finalUrl = finalUrl.replace('recipient=9876543210', `recipient=${encodeURIComponent(mobile10)}`);
    }
    if (!apiUrl.includes('[MESSAGE]') && !apiUrl.includes('[CONTENT') && finalUrl.includes('message=Hello+World')) {
      finalUrl = finalUrl.replace('message=Hello+World', `message=${encodeURIComponent(message)}`);
    } else if (!apiUrl.includes('[MESSAGE]') && !apiUrl.includes('[CONTENT') && finalUrl.includes('message=Hello%20World')) {
      finalUrl = finalUrl.replace('message=Hello%20World', `message=${encodeURIComponent(message)}`);
    }

    // Keyword replacements for POST Body
    let finalBody = postBody
      .replace(/\[RECIPIENT\]/gi, mobile10)
      .replace(/\[MOBILE_NO\]/gi, mobile10)
      .replace(/\[MOBILE\]/gi, mobile10)
      .replace(/\[PHONE\]/gi, mobile10)
      .replace(/\[MOBILE_WITH_CC\]/gi, mobileWithCc)
      .replace(/\[MOBILE_91\]/gi, mobileWithCc)
      .replace(/\[MESSAGE\]/gi, message)
      .replace(/\[CONTENT\]/gi, message)
      .replace(/\[MSG\]/gi, message)
      .replace(/\[TEXT\]/gi, message)
      .replace(/\[SIM_SLOT\]/gi, simSlot)
      .replace(/\[SIM\]/gi, simSlot);

    // Parse custom headers
    const reqHeaders = {};
    if (rawHeaders) {
      const lines = rawHeaders.split('\n');
      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim().toLowerCase();
          const val = line.slice(colonIdx + 1).trim();
          if (key && val) {
            reqHeaders[key] = val;
          }
        }
      }
    }

    const fetchOptions = {
      method: requestType,
      signal: AbortSignal.timeout(15000),
    };

    if (requestType === 'POST') {
      if (!reqHeaders['content-type']) {
        if (finalBody.trim().startsWith('{') || finalBody.trim().startsWith('[')) {
          reqHeaders['content-type'] = 'application/json';
        } else {
          reqHeaders['content-type'] = 'application/x-www-form-urlencoded';
        }
      }
      fetchOptions.body = finalBody;
    }

    if (Object.keys(reqHeaders).length > 0) {
      fetchOptions.headers = reqHeaders;
    }

    try {
      const res = await fetch(finalUrl, fetchOptions);
      const respText = await res.text();
      sendJson(response, 200, {
        ok: true,
        status: res.status,
        response: respText.slice(0, 500),
        message: `Test SMS request dispatched with status ${res.status}.`,
      });
    } catch (err) {
      throw httpError(`SMS Gateway Test Error: ${err.message}`, 400);
    }
  }

  /**
   * POST /api/admin/settings/services/whatsapp - Save WhatsApp configuration
   */
  async function handleSaveWhatsappSettings(request, response, input) {
    const isEnabled = Boolean(input.isEnabled);
    const requestType = String(input.requestType || 'GET').trim().toUpperCase();
    const apiUrl = String(input.apiUrl || '').trim();
    const postBody = String(input.postBody || '').trim();
    const headers = String(input.headers || '').trim();

    if (isEnabled && !apiUrl) {
      throw httpError('API URL is required when WhatsApp service is enabled.', 400);
    }

    const config = {
      requestType,
      apiUrl,
      postBody,
      headers,
    };

    const ciphertext = encryptServiceConfig(config);

    await db.query(
      `INSERT INTO admin_service_settings (service_key, is_enabled, config_ciphertext, updated_at)
       VALUES ('whatsapp', $1, $2, now())
       ON CONFLICT (service_key) DO UPDATE
       SET is_enabled = EXCLUDED.is_enabled, config_ciphertext = EXCLUDED.config_ciphertext, updated_at = now()`,
      [isEnabled, ciphertext],
    );

    sendJson(response, 200, { ok: true, message: 'WhatsApp settings saved successfully.' });
  }

  /**
   * POST /api/admin/settings/services/whatsapp/test - Send a test WhatsApp message
   */
  async function handleTestWhatsapp(request, response, input) {
    const toNumber = String(input.toNumber || '').trim().replace(/\D/g, '');
    if (!toNumber || toNumber.length < 10) {
      throw httpError('Valid 10-digit recipient mobile number is required.', 400);
    }

    const message = String(input.message || 'Hello! This is a test WhatsApp message from Exchange Portal.').trim();

    let requestType = String(input.requestType || '').trim().toUpperCase();
    let apiUrl = String(input.apiUrl || '').trim();
    let postBody = String(input.postBody || '').trim();
    let rawHeaders = String(input.headers || '').trim();

    if (!apiUrl) {
      const row = await db.query("SELECT config_ciphertext FROM admin_service_settings WHERE service_key = 'whatsapp'");
      if (row.rowCount > 0) {
        const saved = decryptServiceConfig(row.rows[0].config_ciphertext);
        requestType = requestType || saved.requestType || 'GET';
        apiUrl = apiUrl || saved.apiUrl || saved.gatewayUrl || '';
        postBody = postBody || saved.postBody || '';
        rawHeaders = rawHeaders || saved.headers || '';
      }
    }

    if (!apiUrl) {
      throw httpError('Incomplete WhatsApp gateway settings. Please enter API URL.', 400);
    }

    if (!requestType) requestType = 'GET';

    // Keyword replacements for URL (with URL encoding)
    let finalUrl = apiUrl
      .replace(/\[MOBILE_NO\]/gi, encodeURIComponent(toNumber))
      .replace(/\[CONTENT\]/gi, encodeURIComponent(message));

    // Keyword replacements for POST Body
    let finalBody = postBody
      .replace(/\[MOBILE_NO\]/gi, toNumber)
      .replace(/\[CONTENT\]/gi, message);

    // Parse custom headers
    const reqHeaders = {};
    if (rawHeaders) {
      const lines = rawHeaders.split('\n');
      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim().toLowerCase();
          const val = line.slice(colonIdx + 1).trim();
          if (key && val) {
            reqHeaders[key] = val;
          }
        }
      }
    }

    const fetchOptions = {
      method: requestType,
      signal: AbortSignal.timeout(15000),
    };

    if (requestType === 'POST') {
      if (!reqHeaders['content-type']) {
        if (finalBody.trim().startsWith('{') || finalBody.trim().startsWith('[')) {
          reqHeaders['content-type'] = 'application/json';
        } else {
          reqHeaders['content-type'] = 'application/x-www-form-urlencoded';
        }
      }
      fetchOptions.body = finalBody;
    }

    if (Object.keys(reqHeaders).length > 0) {
      fetchOptions.headers = reqHeaders;
    }

    try {
      const fetchRes = await fetch(finalUrl, fetchOptions);
      const resText = await fetchRes.text();

      sendJson(response, 200, {
        ok: true,
        method: requestType,
        hitUrl: finalUrl,
        status: fetchRes.status,
        statusText: fetchRes.statusText,
        response: resText.slice(0, 500),
        message: `Request dispatched successfully. Response status: ${fetchRes.status}`,
      });
    } catch (err) {
      throw httpError(`WhatsApp Request Failed: ${err.message}`, 400);
    }
  }

  /**
   * POST /api/admin/settings/services/plan-api - Save PLAN API configuration
   */
  async function handleSavePlanApiSettings(request, response, input) {
    const isEnabled = input.isEnabled !== false;
    const provider = String(input.provider || 'ezytm').trim();
    const brandName = 'Plan API (EZYTM)';
    const activeBrand = 'Plan API (EZYTM)';
    const requestType = 'GET';
    const circleUrl = 'https://planapi.in/api/Mobile/OperatorFetchNew';
    const rofferUrl = 'https://planapi.in/api/Mobile/RofferCheck';
    const apiUserId = String(input.apiUserId || input.ezytmApiUserId || '5100').trim();
    const apiPassword = String(input.apiPassword || input.ezytmApiPassword || 'amart@74').trim();

    if (isEnabled && (!apiUserId || !apiPassword)) {
      throw httpError('Plan API (EZYTM) credentials (User ID and Password) are required.', 400);
    }

    const config = {
      isEnabled,
      provider,
      brandName,
      activeBrand,
      requestType,
      apiUrl: circleUrl, // backward compatibility
      circleUrl,
      rofferUrl,
      apiUserId,
      apiPassword,
    };

    const ciphertext = encryptServiceConfig(config);

    await db.query(
      `INSERT INTO admin_service_settings (service_key, is_enabled, config_ciphertext, updated_at)
       VALUES ('plan_api', $1, $2, now())
       ON CONFLICT (service_key) DO UPDATE
       SET is_enabled = EXCLUDED.is_enabled, config_ciphertext = EXCLUDED.config_ciphertext, updated_at = now()`,
      [isEnabled, ciphertext],
    );

    sendJson(response, 200, { ok: true, message: 'PLAN API settings saved successfully.', planApi: config });
  }

  /**
   * POST /api/admin/settings/services/plan-api/test - Test live operator lookup with Plan API (EZYTM)
   */
  async function handleTestPlanApi(request, response, input) {
    const mobile = String(input.mobile || '').trim().replace(/\D/g, '');
    if (!mobile || mobile.length < 10) {
      throw httpError('Valid 10-digit mobile number is required for Operator Look.', 400);
    }

    const apiUserId = String(input.apiUserId || input.ezytmApiUserId || '5100').trim();
    const apiPassword = String(input.apiPassword || input.ezytmApiPassword || 'amart@74').trim();
    const apiUrl = 'https://planapi.in/api/Mobile/OperatorFetchNew';

    const overrideConfig = {
      provider: 'ezytm',
      brandName: 'Plan API (EZYTM)',
      activeBrand: 'Plan API (EZYTM)',
      requestType: 'GET',
      apiUserId,
      apiPassword,
      apiUrl,
    };

    try {
      const result = await fetchOperatorLookup({
        db,
        decryptServiceConfig,
        mobile,
        overrideConfig,
      });

      sendJson(response, 200, {
        ok: result.ok,
        brand: 'Plan API (EZYTM)',
        mobile: result.mobile,
        operator: result.operator,
        circle: result.circle,
        operatorCode: result.operatorCode,
        circleCode: result.circleCode,
        message: result.message,
        status: result.status,
        latencyMs: result.latencyMs,
        matchedOperator: result.matchedOperator,
        rawResponse: result.rawResponse,
      });
    } catch (err) {
      console.error('[Plan API Test Error]:', err);
      throw httpError(err.message || 'Operator Lookup request failed.', 400);
    }
  }

  /**
   * POST /api/admin/settings/services/plan-api/roffer-test - Test live R-Offer lookup with Plan API (EZYTM)
   */
  async function handleTestPlanApiRoffer(request, response, input) {
    const mobile = String(input.mobile || '').trim().replace(/\D/g, '');
    if (!mobile || mobile.length < 10) {
      throw httpError('Valid 10-digit mobile number is required for R-Offer lookup.', 400);
    }

    const operatorCode = String(input.operatorCode || input.opCode || '2').trim();
    const apiUserId = String(input.apiUserId || input.ezytmApiUserId || '5100').trim();
    const apiPassword = String(input.apiPassword || input.ezytmApiPassword || 'amart@74').trim();
    const apiUrl = 'https://planapi.in/api/Mobile/RofferCheck';

    try {
      const result = await fetchEzytmRoffer({
        apiUserId,
        apiPassword,
        mobile,
        operatorCode,
        apiUrl,
      });

      sendJson(response, 200, {
        ok: result.ok,
        brand: 'Plan API (EZYTM)',
        mobile: result.mobile,
        operatorCode: result.operatorCode,
        status: result.status,
        message: result.message,
        offers: result.offers || [],
        latencyMs: result.latencyMs,
        raw: result.raw,
      });
    } catch (err) {
      console.error('[Plan API R-Offer Test Error]:', err);
      throw httpError(err.message || 'R-Offer lookup request failed.', 400);
    }
  }

  /**
   * POST /api/admin/settings/services/margin-difference - Save Margin Difference configuration
   */
  /**
   * POST /api/admin/settings/services/incoming-sms - Save Incoming SMS configuration
   */
  async function handleSaveIncomingSmsSettings(request, response, input) {
    const isEnabled = input.isEnabled !== false;
    const autoUpdatePayment = input.autoUpdatePayment !== false;
    const secretKey = String(input.secretKey || '').trim();
    const allowedSenders = String(input.allowedSenders || '').trim();

    const config = {
      autoUpdatePayment,
      secretKey,
      allowedSenders,
    };

    const ciphertext = encryptServiceConfig(config);

    await db.query(
      `INSERT INTO admin_service_settings (service_key, is_enabled, config_ciphertext, updated_at)
       VALUES ('incoming_sms', $1, $2, now())
       ON CONFLICT (service_key) DO UPDATE
       SET is_enabled = EXCLUDED.is_enabled, config_ciphertext = EXCLUDED.config_ciphertext, updated_at = now()`,
      [isEnabled, ciphertext],
    );

    sendJson(response, 200, { ok: true, message: 'Incoming SMS settings saved successfully.', incomingSms: { isEnabled, ...config } });
  }

  async function handleSaveMarginDifferenceSettings(request, response, input) {
    const isEnabled = input.isEnabled !== false;
    const marginDiffPercent = parseFloat(input.marginDifferencePercent ?? input.percent ?? 0.10);
    if (isNaN(marginDiffPercent) || marginDiffPercent < 0 || marginDiffPercent > 100) {
      throw httpError('Margin difference percent must be a valid number between 0 and 100.', 400);
    }
    const description = String(input.description || 'System margin difference deduction (Seller vs Buyer)').trim();

    const config = {
      isEnabled,
      marginDifferencePercent: marginDiffPercent.toFixed(2),
      description,
    };

    const ciphertext = encryptServiceConfig(config);

    await db.query(
      `INSERT INTO admin_service_settings (service_key, is_enabled, config_ciphertext, updated_at)
       VALUES ('margin_difference', $1, $2, now())
       ON CONFLICT (service_key) DO UPDATE
       SET is_enabled = EXCLUDED.is_enabled, config_ciphertext = EXCLUDED.config_ciphertext, updated_at = now()`,
      [isEnabled, ciphertext],
    );

    sendJson(response, 200, { ok: true, message: 'Margin Difference settings saved successfully.', marginDifference: config });
  }

  /**
   * POST /api/admin/settings/services/notifications - Save live news, dashboard banner, login image & popups
   */
  async function handleSaveNotificationSettings(request, response, input) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS website_settings (id INT PRIMARY KEY DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
      INSERT INTO website_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS news_ticker TEXT;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS news_ticker_enabled BOOLEAN DEFAULT TRUE;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dashboard_banner_enabled BOOLEAN DEFAULT TRUE;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dashboard_banner_data BYTEA;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dashboard_banner_mime TEXT;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dashboard_banner_url TEXT;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS login_side_image_data BYTEA;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS login_side_image_mime TEXT;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS login_side_image_enabled BOOLEAN DEFAULT TRUE;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS login_popup_enabled BOOLEAN DEFAULT TRUE;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS login_popup_image_data BYTEA;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS login_popup_image_mime TEXT;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS login_popup_link TEXT;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dashboard_popup_enabled BOOLEAN DEFAULT TRUE;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dashboard_popup_image_data BYTEA;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dashboard_popup_image_mime TEXT;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dashboard_popup_link TEXT;
      ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS dashboard_popup_frequency TEXT DEFAULT 'session';
    `);

    const newsTickerText = String(input.newsTickerText || '').trim();
    const newsTickerEnabled = input.newsTickerEnabled !== false;
    const dashboardBannerEnabled = input.dashboardBannerEnabled !== false;
    const loginSideImageEnabled = input.loginSideImageEnabled !== false;
    const loginPopupEnabled = input.reset_login_popup ? false : (input.loginPopupEnabled !== false);
    const loginPopupLink = String(input.loginPopupLink || '').trim();
    const dashboardPopupEnabled = input.reset_dashboard_popup ? false : (input.dashboardPopupEnabled !== false);
    const dashboardPopupFrequency = String(input.dashboardPopupFrequency || 'session').trim();
    const dashboardPopupLink = String(input.dashboardPopupLink || '').trim();

    await db.query(
      `UPDATE website_settings SET
         news_ticker = $1,
         news_ticker_enabled = $2,
         dashboard_banner_enabled = $3,
         login_side_image_enabled = $4,
         login_popup_enabled = $5,
         login_popup_link = $6,
         dashboard_popup_enabled = $7,
         dashboard_popup_frequency = $8,
         dashboard_popup_link = $9,
         updated_at = now()
       WHERE id = 1`,
      [
        newsTickerText,
        newsTickerEnabled,
        dashboardBannerEnabled,
        loginSideImageEnabled,
        loginPopupEnabled,
        loginPopupLink,
        dashboardPopupEnabled,
        dashboardPopupFrequency,
        dashboardPopupLink,
      ]
    );

    // Handle dashboard banner upload or reset
    if (input.reset_dashboard_banner) {
      await db.query('UPDATE website_settings SET dashboard_banner_data = NULL, dashboard_banner_mime = NULL, dashboard_banner_url = NULL, updated_at = now() WHERE id = 1');
    } else if (input.dashboard_banner_data_b64) {
      const buf = Buffer.from(input.dashboard_banner_data_b64, 'base64');
      const mime = String(input.dashboard_banner_mime || 'image/png').trim();
      await db.query('UPDATE website_settings SET dashboard_banner_data = $1, dashboard_banner_mime = $2, updated_at = now() WHERE id = 1', [buf, mime]);
    }

    // Handle login side image upload or reset
    if (input.reset_login_side_image) {
      await db.query('UPDATE website_settings SET login_side_image_data = NULL, login_side_image_mime = NULL, updated_at = now() WHERE id = 1');
    } else if (input.login_side_image_data_b64) {
      const buf = Buffer.from(input.login_side_image_data_b64, 'base64');
      const mime = String(input.login_side_image_mime || 'image/png').trim();
      await db.query('UPDATE website_settings SET login_side_image_data = $1, login_side_image_mime = $2, updated_at = now() WHERE id = 1', [buf, mime]);
    }

    // Handle login popup image upload or reset
    if (input.reset_login_popup) {
      await db.query('UPDATE website_settings SET login_popup_image_data = NULL, login_popup_image_mime = NULL, login_popup_enabled = FALSE, updated_at = now() WHERE id = 1');
    } else if (input.login_popup_image_data_b64) {
      const buf = Buffer.from(input.login_popup_image_data_b64, 'base64');
      const mime = String(input.login_popup_image_mime || 'image/png').trim();
      await db.query('UPDATE website_settings SET login_popup_image_data = $1, login_popup_image_mime = $2, login_popup_enabled = TRUE, updated_at = now() WHERE id = 1', [buf, mime]);
    }

    // Handle dashboard popup image upload or reset
    if (input.reset_dashboard_popup) {
      await db.query('UPDATE website_settings SET dashboard_popup_image_data = NULL, dashboard_popup_image_mime = NULL, dashboard_popup_enabled = FALSE, updated_at = now() WHERE id = 1');
    } else if (input.dashboard_popup_image_data_b64) {
      const buf = Buffer.from(input.dashboard_popup_image_data_b64, 'base64');
      const mime = String(input.dashboard_popup_image_mime || 'image/png').trim();
      await db.query('UPDATE website_settings SET dashboard_popup_image_data = $1, dashboard_popup_image_mime = $2, dashboard_popup_enabled = TRUE, updated_at = now() WHERE id = 1', [buf, mime]);
    }

    sendJson(response, 200, { ok: true, message: 'Notification settings and media updated successfully.' });
  }

  /**
   * POST /api/admin/settings/services/run-inactivity-check - Run user active-to-inactive check now
   */
  async function handleRunInactivityCheck(request, response, input) {
    const inactiveDays = Math.max(1, parseInt(input.inactiveDays || 30, 10));
    const result = await checkAndDeactivateInactiveUsers({ db, inactiveDays, dryRun: false });
    sendJson(response, 200, {
      ok: true,
      inactivatedCount: result.count,
      thresholdDays: result.thresholdDays,
      users: result.users,
      message: `Inactivity check completed. ${result.count} inactive user(s) set to Inactive (Blocked) status.`,
    });
  }

  return {
    sendAdminServiceSettingsPage,
    handleGetServices,
    handleSaveGeneralSettings,
    handleSaveEmailSettings,
    handleTestEmail,
    handleSaveSmsSettings,
    handleTestSms,
    handleSaveWhatsappSettings,
    handleTestWhatsapp,
    handleSavePlanApiSettings,
    handleTestPlanApi,
    handleTestPlanApiRoffer,
    handleSaveMarginDifferenceSettings,
    handleSaveIncomingSmsSettings,
    handleSaveNotificationSettings,
    handleRunInactivityCheck,
  };
};
