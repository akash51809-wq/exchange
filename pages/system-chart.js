'use strict';

module.exports = function createSystemChartPage() {
  async function sendSystemChartPage(request, response) {
    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exchange System Architecture & Feature Chart</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #4f46e5;
      --primary-dark: #3730a3;
      --primary-light: #eef2ff;
      --secondary: #0ea5e9;
      --success: #10b981;
      --success-light: #ecfdf5;
      --warning: #f59e0b;
      --warning-light: #fffbeb;
      --danger: #ef4444;
      --danger-light: #fef2f2;
      --dark: #0f172a;
      --gray-900: #1e293b;
      --gray-700: #334155;
      --gray-500: #64748b;
      --gray-200: #e2e8f0;
      --gray-100: #f8fafc;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f1f5f9;
      color: var(--gray-700);
      margin: 0;
      padding: 0;
      line-height: 1.6;
    }
    .hero-banner {
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%);
      color: #fff;
      padding: 50px 20px 40px;
      position: relative;
      overflow: hidden;
      border-bottom: 4px solid var(--primary);
    }
    .hero-banner::after {
      content: '';
      position: absolute;
      top: -50%;
      right: -10%;
      width: 450px;
      height: 450px;
      background: radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(0,0,0,0) 70%);
      border-radius: 50%;
      pointer-events: none;
    }
    .hero-title {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 10px;
      background: linear-gradient(to right, #ffffff, #c7d2fe);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero-subtitle {
      font-size: 15px;
      color: #cbd5e1;
      max-width: 850px;
      margin-bottom: 0;
    }
    .nav-tabs-wrapper {
      position: sticky;
      top: 0;
      z-index: 1020;
      background: #ffffff;
      box-shadow: 0 4px 15px rgba(0,0,0,0.06);
      padding: 8px 20px;
      border-bottom: 1px solid var(--gray-200);
    }
    .custom-nav {
      display: flex;
      gap: 12px;
      max-width: 1200px;
      margin: 0 auto;
      overflow-x: auto;
      padding: 4px 0;
    }
    .nav-tab-btn {
      padding: 9px 20px;
      font-size: 13.5px;
      font-weight: 700;
      border-radius: 30px;
      border: 1px solid var(--gray-200);
      background: #fff;
      color: var(--gray-700);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
      white-space: nowrap;
      text-decoration: none !important;
    }
    .nav-tab-btn:hover {
      background: var(--gray-100);
      border-color: #cbd5e1;
      color: var(--dark);
    }
    .nav-tab-btn.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);
    }
    .content-container {
      max-width: 1240px;
      margin: 30px auto;
      padding: 0 20px 60px;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 22px;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--gray-200);
    }
    .section-header h2 {
      font-size: 24px;
      font-weight: 800;
      margin: 0;
      color: var(--dark);
    }
    .badge-role {
      font-size: 12px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 20px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .badge-admin { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge-user { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; }
    .badge-engine { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    
    .card-feature {
      background: #ffffff;
      border: 1px solid var(--gray-200);
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.03);
      margin-bottom: 24px;
      overflow: hidden;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .card-feature:hover {
      box-shadow: 0 8px 24px rgba(0,0,0,0.07);
    }
    .card-feature-header {
      padding: 16px 22px;
      background: #f8fafc;
      border-bottom: 1px solid var(--gray-200);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .card-feature-header h4 {
      font-size: 17px;
      font-weight: 700;
      margin: 0;
      color: var(--dark);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .feature-route {
      font-family: monospace;
      font-size: 12px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      padding: 3px 9px;
      border-radius: 6px;
      color: #334155;
      font-weight: 600;
    }
    .card-feature-body {
      padding: 22px;
    }
    .logic-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      margin-top: 14px;
    }
    .logic-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
    }
    .logic-box h6 {
      font-size: 13.5px;
      font-weight: 700;
      margin-bottom: 6px;
      color: var(--gray-900);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .logic-box p {
      font-size: 13px;
      margin-bottom: 0;
      color: #475569;
    }
    .step-flow {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 14px;
    }
    .step-item {
      display: flex;
      gap: 14px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-left: 4px solid var(--primary);
      padding: 14px 16px;
      border-radius: 6px;
    }
    .step-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 13px;
      flex-shrink: 0;
    }
    .step-text h6 {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 4px;
      color: var(--dark);
    }
    .step-text p {
      font-size: 13px;
      margin: 0;
      color: #475569;
    }
    .tag-pill {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 12px;
      margin-right: 4px;
    }
    .tag-on { background: #d1fae5; color: #065f46; }
    .tag-off { background: #fee2e2; color: #991b1b; }
    .tag-info { background: #e0f2fe; color: #075985; }

    @media (max-width: 768px) {
      .hero-title { font-size: 24px; }
      .logic-grid { grid-template-columns: 1fr; }
      .card-feature-header { flex-direction: column; align-items: flex-start; gap: 6px; }
    }
  </style>
</head>
<body>

  <!-- Top Hero Header -->
  <div class="hero-banner">
    <div class="container-fluid" style="max-width: 1240px; margin: 0 auto;">
      <div class="d-flex align-items-center justify-content-between flex-wrap">
        <div>
          <span class="badge badge-light px-3 py-1 font-weight-bold text-dark mb-2" style="font-size:11.5px; letter-spacing:0.5px;">
            <i class="fa fa-book mr-1 text-primary"></i> SYSTEM KNOWLEDGE BASE &amp; FLOW CHART
          </span>
          <h1 class="hero-title">Exchange System Architecture, Features &amp; Logic Chart</h1>
          <p class="hero-subtitle">
            This internal page is accessed directly via <code>/chart</code> (it is not linked in public user or admin navigation menus). It provides a complete reference for system features, mathematical formulas, security rules, and backend workflows.
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="nav-tabs-wrapper">
    <div class="custom-nav">
      <a href="#section-admin" class="nav-tab-btn active" onclick="activateTab(event, 'section-admin')">
        <i class="fa fa-shield text-danger"></i> 1. Admin Features
      </a>
      <a href="#section-general-settings" class="nav-tab-btn" onclick="activateTab(event, 'section-general-settings')">
        <i class="fa fa-sliders text-warning"></i> 2. Service Settings (9 General Rules)
      </a>
      <a href="#section-user" class="nav-tab-btn" onclick="activateTab(event, 'section-user')">
        <i class="fa fa-user text-primary"></i> 3. User Panel (Buyer &amp; Seller)
      </a>
      <a href="#section-engine" class="nav-tab-btn" onclick="activateTab(event, 'section-engine')">
        <i class="fa fa-bolt text-success"></i> 4. Recharge Engine &amp; Waterfall Flow
      </a>
    </div>
  </div>

  <div class="content-container">

    <!-- ============================================================ -->
    <!-- SECTION 1: ADMIN PANEL FEATURES -->
    <!-- ============================================================ -->
    <div id="section-admin" class="chart-section">
      <div class="section-header">
        <span class="badge-role badge-admin">ADMINISTRATOR</span>
        <h2>1. Administrator Panel Features &amp; Workflow</h2>
      </div>

      <!-- Feature: User Management -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-users text-primary"></i> 1.1 User Management (User List)</h4>
          <span class="feature-route">/admin/users/list</span>
        </div>
        <div class="card-feature-body">
          <p class="font-weight-bold text-dark">Central control over all registered Buyers and Sellers:</p>
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-money text-success"></i> Real-time Wallet Balances</h6>
              <p>View each user's live INR prepaid balance, refreshed directly from the <code>wallets</code> database table with one click.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-toggle-on text-primary"></i> Status Control (Active / Inactive / Pending)</h6>
              <p>Admins can toggle any user between <b>Active</b>, <b>Blocked</b> (Inactive), and <b>Pending</b>. When blocked, user login and API requests are immediately restricted.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-key text-danger"></i> Password Reset &amp; Profile Updates</h6>
              <p>Admins can set new passwords without needing old passwords, as well as manage user profile details, contact info, and parent accounts.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature: Payment & Fund Requests -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-bank text-success"></i> 1.2 Fund Requests &amp; Bank Approvals (Payment &amp; Banking)</h4>
          <span class="feature-route">/admin/payment/fund-request | /admin/payment/bank-list | /admin/payment/payout-requests</span>
        </div>
        <div class="card-feature-body">
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-arrow-down text-success"></i> Wallet Top-up Requests</h6>
              <p>When users transfer money and submit their UTR proof, the admin verifies details and either <b>Approves</b> (instantly crediting the wallet) or <b>Rejects</b> with a reason.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-building text-primary"></i> Admin Bank Accounts (Admin Bank List)</h6>
              <p>Admins configure receiving bank accounts and UPI QR codes that display to users when depositing funds.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-check-square-o text-info"></i> User Bank Account Approval</h6>
              <p>When users register a bank account for payouts, admins must approve it before withdrawals can be initiated.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-arrow-up text-danger"></i> Payout Requests (Redeem)</h6>
              <p>Redeem requests from user wallets to banks. Admins approve transfers with a reference UTR, or reject requests to automatically refund the user's wallet.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature: Disputes -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-gavel text-warning"></i> 1.3 Dispute Resolution</h4>
          <span class="feature-route">/admin/disputes</span>
        </div>
        <div class="card-feature-body">
          <p>Final administrative adjudication between Buyer and Seller over disputed recharges:</p>
          <div class="step-flow">
            <div class="step-item">
              <div class="step-num">1</div>
              <div class="step-text">
                <h6>Review Dispute</h6>
                <p>Admins examine the buyer's complaint reason, the seller's operator response, and proof of transaction on a unified screen.</p>
              </div>
            </div>
            <div class="step-item">
              <div class="step-num">2</div>
              <div class="step-text">
                <h6>Accept &amp; Refund</h6>
                <p>When an admin clicks <b>Accept</b>: the full recharge cost is refunded to the Buyer's wallet, and the credited amount is reversed (debited) from the Seller's wallet.</p>
              </div>
            </div>
            <div class="step-item">
              <div class="step-num">3</div>
              <div class="step-text">
                <h6>Reject Dispute</h6>
                <p>If the seller's recharge is verified as successful at the operator level, the admin rejects the dispute with an explanatory remark (no refund is issued).</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature: Recharge Report -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-list-alt text-info"></i> 1.4 Master Recharge Report</h4>
          <span class="feature-route">/admin/reports/recharge-report</span>
        </div>
        <div class="card-feature-body">
          <p class="font-weight-bold text-dark">Audit log of all live recharge transactions with 5 action buttons:</p>
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-filter text-primary"></i> 9 Smart Filters</h6>
              <p>Top 20/50/100/500, From Date, To Date, Client ID, Operator, Circle, Status, Mobile Number, and Exact Amount 1-click search.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-download text-success"></i> CSV / Excel Export</h6>
              <p>Download all filtered records across any date range into CSV format with one click.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-clock-o text-warning"></i> Precision Timing &amp; Duration</h6>
              <p>Timestamps formatted to the second (<code>hh:mm:ss</code>) alongside exact execution turnaround time (e.g. <code>⏱️ 2.4s</code>).</p>
            </div>
          </div>
          <div class="mt-3">
            <h6 class="font-weight-bold text-dark">Available Action Controls in Table:</h6>
            <div class="row">
              <div class="col-md-4 mb-2">
                <div class="p-2 border rounded bg-light">
                  <strong class="text-danger"><i class="fa fa-times"></i> Fail Button (Success records only):</strong>
                  <p class="small mb-0">If a recharge fails later at the operator level, admins can mark it FAILED. The buyer receives an immediate refund and the seller's credit is reversed.</p>
                </div>
              </div>
              <div class="col-md-4 mb-2">
                <div class="p-2 border rounded bg-light">
                  <strong class="text-warning"><i class="fa fa-gavel"></i> Dispute Button:</strong>
                  <p class="small mb-0">Directly raise or inspect a dispute for this specific transaction.</p>
                </div>
              </div>
              <div class="col-md-4 mb-2">
                <div class="p-2 border rounded bg-light">
                  <strong class="text-info"><i class="fa fa-paper-plane"></i> Resend Callback (CB):</strong>
                  <p class="small mb-0">Re-dispatch a webhook callback to the Buyer's Callback URL with updated status, operator ID, and response code.</p>
                </div>
              </div>
              <div class="col-md-6 mb-2">
                <div class="p-2 border rounded bg-light">
                  <strong class="text-dark"><i class="fa fa-file-text-o"></i> Recharge Log:</strong>
                  <p class="small mb-0">Modal displaying raw JSON payloads, original provider response, timestamps, and full buyer/seller transaction data.</p>
                </div>
              </div>
              <div class="col-md-6 mb-2">
                <div class="p-2 border rounded bg-light">
                  <strong class="text-primary"><i class="fa fa-pencil"></i> Update Ope ID:</strong>
                  <p class="small mb-0">Edit and save operator reference IDs (opeid) directly in an interactive modal.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature: Live Recharge Report -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-bolt text-danger"></i> 1.5 Live Recharge Report (10s Auto Refresh)</h4>
          <span class="feature-route">/admin/reports/live-recharge</span>
        </div>
        <div class="card-feature-body">
          <p class="font-weight-bold text-dark">Real-time automatic transaction feed without manual intervention:</p>
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-eye-slash text-secondary"></i> Filter-free Clean View</h6>
              <p>No cluttered filter bars on load — directly focused on real-time transaction streaming and live metrics.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-refresh text-success"></i> 10-Second Auto Refresh</h6>
              <p>Background polling automatically loads the latest 50 transactions every 10 seconds with a countdown ticker and heartbeat indicator.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-pause-circle text-warning"></i> Modal Protection</h6>
              <p>Opening Fail, Dispute, Log, or Update Ope ID modals automatically pauses auto-refresh to prevent interruptions during actions.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature: Pending Recharge Report -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-clock-o text-warning"></i> 1.6 Pending Recharge Report</h4>
          <span class="feature-route">/admin/reports/pending-recharge</span>
        </div>
        <div class="card-feature-body">
          <p class="font-weight-bold text-dark">Focused oversight and rapid resolution for pending transactions:</p>
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-hourglass-half text-warning"></i> Default Pending Filter</h6>
              <p>Pre-filtered to display exclusively Pending transactions for fast administrative triage.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-search text-primary"></i> Full Search Suite</h6>
              <p>Filter by Top entries, Date Range, Buyer/Client ID, Operator, Circle, Mobile Number, or Amount.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-wrench text-danger"></i> Quick Resolution Actions</h6>
              <p>Inspect raw logs, update Operator IDs, or mark failed to immediately refund the buyer where necessary.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature: Operators -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-cogs text-secondary"></i> 1.7 Operator Management (Create &amp; Show Operators)</h4>
          <span class="feature-route">/admin/settings/create-operator | /admin/settings/show-operator</span>
        </div>
        <div class="card-feature-body">
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-plus-circle text-primary"></i> Operator Configuration</h6>
              <p>Operator name, code (e.g. AT, JIO, VI), service category (Mobile, DTH, Bill Payment, FASTag, etc.), and amount bounds.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-ban text-danger"></i> Stop Amounts</h6>
              <p>Comma-separated prohibited denominations (e.g. 101, 501, 1001) that cannot be submitted for processing.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-list text-info"></i> Bill Payment Parameters</h6>
              <p>Custom field schemas for utility payments (e.g. Consumer Number, Account ID, Sub-division).</p>
            </div>
          </div>
        </div>
      </div>
    </div>


    <!-- ============================================================ -->
    <!-- SECTION 2: SERVICE SETTINGS & 7 GENERAL RULES -->
    <!-- ============================================================ -->
    <div id="section-general-settings" class="chart-section mt-5">
      <div class="section-header">
        <span class="badge-role badge-admin">SYSTEM RULES</span>
        <h2>2. Service Settings (General Rules &amp; 9 System Switches)</h2>
      </div>

      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-sliders text-warning"></i> Service Settings - General Tab</h4>
          <span class="feature-route">/admin/settings/service-settings</span>
        </div>
        <div class="card-feature-body">
          <p>These 9 settings govern the core workflow of the exchange system. Each setting features a compact <b>ON/OFF</b> toggle switch:</p>

          <div class="table-responsive">
            <table class="table table-bordered table-striped">
              <thead class="bg-dark text-white">
                <tr>
                  <th style="width: 50px;">#</th>
                  <th style="width: 220px;">Setting Name</th>
                  <th style="width: 140px;">Switch / Input</th>
                  <th>Workflow &amp; Logic (How it Works)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="font-weight-bold text-center">1</td>
                  <td><strong>Login OTP</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span></td>
                  <td>
                    • <b>When ON:</b> Whenever any user (Admin, Buyer, or Seller) enters their user ID and password, the system immediately generates a secure 6-digit OTP and dispatches it to both their registered <b>Email</b> and <b>WhatsApp</b>. Login completes only after OTP verification.<br>
                    • <b>When OFF:</b> OTP verification is bypassed, and users log in directly with their credentials.
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">2</td>
                  <td><strong>Instant Response Time</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Seconds (e.g., 15s)</small></td>
                  <td>
                    • <b>Logic:</b> When a Buyer sends a recharge request via API, if a Success or Fail response is received from the Seller within the configured seconds (e.g., 15s), an instant live response is returned directly to the Buyer.<br>
                    • If the Seller API is delayed beyond this limit, the Buyer connection will not time out; instead, the backend automatically forwards the outcome to the Buyer's <b>Callback URL</b> as soon as it arrives.
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">3</td>
                  <td><strong>Complain Accept After</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Instant / Delay (Sec/Min)</small></td>
                  <td>
                    • <b>Instant:</b> Buyers can raise a complaint/dispute immediately following recharge processing.<br>
                    • <b>Set Time:</b> A dispute is accepted only after the configured duration (seconds or minutes) has elapsed. Early submissions are blocked with an instruction to wait.
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">4</td>
                  <td><strong>Do not Accept Complain After</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Days (e.g., 7 Days)</small></td>
                  <td>
                    • <b>Logic:</b> Complaints are restricted to transactions completed within the configured window (e.g., 7 days). Submissions for recharges older than this cutoff are blocked.
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">5</td>
                  <td><strong>Notify Pending Txn After</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Minutes (e.g., 15 Min)</small></td>
                  <td>
                    • <b>Background Auto-Worker:</b> If a recharge dispatched to a Seller remains in <code>pending</code> status past the configured threshold (e.g., 15 minutes), the background worker scans every 60 seconds and sends an automated WhatsApp reminder to that Seller to clear the pending transaction immediately.
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">6</td>
                  <td><strong>Stop Rehit After</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Minutes (e.g., 2 Min)</small></td>
                  <td>
                    • <b>Logic:</b> If the initial Seller API takes longer than the configured threshold (e.g., 2 minutes) to respond or fail, the waterfall engine halts further re-hits to prevent locking buyer funds indefinitely, immediately returning a Fail response to the Buyer.
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">7</td>
                  <td><strong>Stop Same Number/Amount for</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Minutes (e.g., 3 Min)</small></td>
                  <td>
                    • <b>Duplicate Recharge Protection:</b> Once a recharge succeeds, any subsequent request with the same mobile number and exact amount submitted within the configured window is blocked, preventing accidental double billing.
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">8</td>
                  <td><strong>API Disable After Number of Fail Txn</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Fail Txn (e.g., 5)</small></td>
                  <td>
                    • <b>Logic:</b> If a Seller API accumulates consecutive failures matching the configured threshold, the system automatically disables that Seller API (is_active = false).<br>
                    • This diverts incoming traffic to healthy Sellers, preventing cascade failures until the operator resolves their outage and re-enables the endpoint.
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">9</td>
                  <td><strong>API Suspend After % on Refund Txn in a Day</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">% (e.g., 25%)</small></td>
                  <td>
                    • <b>Logic:</b> If the proportion of refunded/disputed transactions for any Seller API exceeds the configured percentage (e.g., 25%) in a single 24-hour cycle, the API is automatically suspended (is_active = false).<br>
                    • This protects buyers and the platform against degraded or fraudulent upstream providers.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="row mt-4">
            <div class="col-md-3">
              <div class="logic-box border-primary">
                <h6><i class="fa fa-envelope text-primary"></i> Email Notification Settings</h6>
                <p class="mb-0 small">Google Apps Script Webhook or SMTP server for dispatching OTPs, security alerts, and transaction receipts.</p>
              </div>
            </div>
            <div class="col-md-3">
              <div class="logic-box border-success">
                <h6><i class="fa fa-whatsapp text-success"></i> WhatsApp Notification Settings</h6>
                <p class="mb-0 small">UltraMsg or Custom Gateway for dispatching login OTPs, payout notifications, and seller pending transaction reminders.</p>
              </div>
            </div>
            <div class="col-md-3">
              <div class="logic-box border-info">
                <h6><i class="fa fa-search text-info"></i> Plan API (ERS HLR Fetch)</h6>
                <p class="mb-0 small">Pre-configured ERS backend API for live operator and circle lookup and dynamic route optimization based on buyer mobile numbers.</p>
              </div>
            </div>
            <div class="col-md-3">
              <div class="logic-box border-warning">
                <h6><i class="fa fa-percent text-warning"></i> Margin Difference Setting</h6>
                <p class="mb-0 small">Configures admin commission margin difference (%) between seller offers and buyer rates.</p>
              </div>
            </div>
          </div>

          <div class="card-feature mt-4 border-info">
            <div class="card-feature-header bg-light">
              <h4><i class="fa fa-search text-info"></i> Plan API (Multi-Brand ERS Operator &amp; Circle Fetch Engine)</h4>
              <span class="feature-route">/admin/settings/service-settings#tabPlanApi</span>
            </div>
            <div class="card-feature-body">
              <p>Integrated <strong>Plan API / HLR Operator Lookup</strong> for automated route resolution:</p>
              <ul>
                <li><strong>Multi-Brand Architecture:</strong> Supports adding multiple Plan API providers. The <strong>ERS (Easy Recharge Solution)</strong> engine is currently live.</li>
                <li><strong>Pre-configured Backend URL:</strong> Pre-configured with <code>https://plan.easyrechargesolution.com/api/Mobile/OperatorFetchNew</code>. The administrator only inputs their <strong>User ID (ApiUserID)</strong> and <strong>Token</strong>.</li>
                <li><strong>Dynamic Mobile Lookup:</strong> Whenever a Buyer requests a recharge, the 10-digit mobile number is passed dynamically to the ERS API <code>Mobileno</code> parameter.</li>
                <li><strong>Live Operator &amp; Circle Detection:</strong> Operator name (e.g., AIRTEL, Reliance Jio, VODAFONE) and Circle (e.g., UP East, Mumbai) returned from ERS are matched automatically against database <code>operator_definitions</code> and registered circles.</li>
                <li><strong>Best Seller Margin Routing:</strong> Using the resolved operator and circle, seller margins are evaluated to route requests via the waterfall engine to the highest-yielding seller.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>


    <!-- ============================================================ -->
    <!-- SECTION 3: USER PANEL (BUYER & SELLER) -->
    <!-- ============================================================ -->
    <div id="section-user" class="chart-section mt-5">
      <div class="section-header">
        <span class="badge-role badge-user">BUYER &amp; SELLER USER</span>
        <h2>3. User Panel Modules &amp; Functionality</h2>
      </div>

      <!-- Buyer Features -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-shopping-cart text-primary"></i> 3.1 Buyer Modules (Recharge Purchasing)</h4>
          <span class="feature-route">/buyer/*</span>
        </div>
        <div class="card-feature-body">
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-eye text-primary"></i> Available Margin (/buyer/available-margin)</h6>
              <p>Displays live top commission rates available across active seller stock, net of system admin margin deductions.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-sliders text-success"></i> Buyer Margin (/buyer/margin)</h6>
              <p>Allows buyers to configure minimum acceptable commission (%) per operator, along with daily/monthly volume limits and GST options.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-list-alt text-info"></i> Purchase Txn (/buyer/purchase-txn)</h6>
              <p>Comprehensive transaction history for all recharges purchased by the buyer, complete with filters (Date, Operator, Status, Mobile, Ref ID) and live summary cards.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-undo text-danger"></i> Purchase Refund (/buyer/purchase-refund)</h6>
              <p>Detailed log of failed and disputed recharge refunds. Refund amounts are credited automatically back to the buyer's prepaid wallet.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-gavel text-warning"></i> Recharge Dispute (/buyer/recharge-dispute)</h6>
              <p>Submit dispute tickets for failed or unfulfilled recharges, subject to system dispute eligibility timeframes.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-pie-chart text-secondary"></i> Operator-wise Purchase (/buyer/operator-wise-purchase)</h6>
              <p>Summary breakdown of recharge volume, aggregate expenditure, and commission earned categorized by telecom operator.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Seller Features -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-briefcase text-success"></i> 3.2 Seller Modules (Recharge Supply &amp; Fulfillment)</h4>
          <span class="feature-route">/seller/*</span>
        </div>
        <div class="card-feature-body">
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-tag text-success"></i> Sales Margin (/seller/sales-margin)</h6>
              <p>Sellers define commission (%) offered per operator, daily/monthly fulfillment limits, and minimum Roffer criteria.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-line-chart text-primary"></i> Sales Txn (/seller/sales-txn)</h6>
              <p>Comprehensive transaction log of all recharge requests dispatched to the seller's balance/API, displaying instant credits on successful processing.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-code text-dark"></i> API Setting (/seller/api-setting)</h6>
              <p>Configure third-party recharge gateway API endpoints (URL, Headers, GET/POST Parameters, JSON/Text Dynamic Parsing, and Webhook Callbacks).</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-gavel text-warning"></i> Sales Dispute (/seller/sales-dispute)</h6>
              <p>Review buyer disputes. Sellers inspect operator response logs to either <b>Accept (Refund)</b> or <b>Reject</b> tickets.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-clock-o text-danger"></i> Sales Pending (/seller/sales-pending)</h6>
              <p>Live dashboard monitoring ongoing and delayed recharges currently processing on the seller gateway.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-bar-chart text-info"></i> Operator-wise Sale (/seller/operator-wise-sale)</h6>
              <p>Analytics on fulfilled recharge volumes, seller earnings, and net margins segmented by telecom operator.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Security Settings -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-lock text-danger"></i> 3.3 Security Settings (IP Whitelist &amp; Callback)</h4>
          <span class="feature-route">/setting/ip-setting | /setting/add-callback</span>
        </div>
        <div class="card-feature-body">
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-shield text-primary"></i> IP Setting (API Security)</h6>
              <p>Whitelist trusted server IP addresses. Requests from unlisted IPs are rejected at the firewall gateway.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-link text-success"></i> Add Callback (Webhook URL)</h6>
              <p>Register callback endpoints to receive automatic real-time transaction updates (Success/Fail) on completion.</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-key text-danger"></i> Dual-OTP Verification</h6>
              <p>Changes to IP whitelists or callback endpoints require dual OTP confirmation via registered Email and WhatsApp for tamper prevention.</p>
            </div>
          </div>
        </div>
      </div>
    </div>


    <!-- ============================================================ -->
    <!-- SECTION 4: SMART RECHARGE ENGINE & WATERFALL -->
    <!-- ============================================================ -->
    <div id="section-engine" class="chart-section mt-5">
      <div class="section-header">
        <span class="badge-role badge-engine">ENGINE ARCHITECTURE</span>
        <h2>4. Smart Recharge Engine, Waterfall &amp; Settlement Logic</h2>
      </div>

      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-bolt text-warning"></i> End-to-End Recharge Lifecycle</h4>
          <span class="feature-route">lib/buyer-api-service.js</span>
        </div>
        <div class="card-feature-body">
          <p class="font-weight-bold text-dark">When a recharge request arrives from a Buyer API or portal, the engine executes the following 7 stages:</p>

          <div class="step-flow">
            <div class="step-item">
              <div class="step-num">1</div>
              <div class="step-text">
                <h6>Authentication &amp; Duplicate Check</h6>
                <p>
                  • Buyer <code>api_token</code> and whitelisted IP are validated.<br>
                  • <b>Duplicate Protection:</b> If 'Stop Same Number/Amount' is ON, the system checks for any successful recharge on the same number and amount within the configured window. If detected, the request is rejected immediately.
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">2</div>
              <div class="step-text">
                <h6>Wallet Balance Debit &amp; Hold</h6>
                <p>
                  • Checks buyer prepaid wallet balance. Returns <code>Insufficient Balance</code> if below required amount.<br>
                  • Upon verification, the recharge amount is temporarily held (debited) from the buyer wallet.
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">3</div>
              <div class="step-text">
                <h6>Best Seller Margin Matching</h6>
                <p>
                  • Identifies all active sellers offering stock for the operator and circle whose offered margin meets or exceeds the buyer's minimum expected margin.<br>
                  • Sellers are sorted in descending order of margin so that the highest yielding seller is prioritized first.
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">4</div>
              <div class="step-text">
                <h6>Cascading Re-hit Waterfall</h6>
                <p>
                  • Dispatches the request to the primary (#1) seller API.<br>
                  • If seller #1 responds with <b>Success</b> or <b>Pending</b>, the waterfall terminates immediately.<br>
                  • If seller #1 returns <b>Fail</b>, the engine checks whether the 'Stop Rehit After' timeout has been reached. If time remains, the request is re-dispatched to seller #2. This cascading waterfall continues until a successful response is received or eligible sellers are exhausted.
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">5</div>
              <div class="step-text">
                <h6>All Sellers Failed Handling</h6>
                <p>
                  • If all eligible sellers fail, the debited amount is immediately refunded in full back to the buyer's wallet.<br>
                  • The transaction is recorded as <code>status: 'failed'</code> and an error response is returned to the buyer.
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">6</div>
              <div class="step-text">
                <h6>Success Settlement Mathematics</h6>
                <p>
                  When the winning seller confirms a successful recharge, the following settlement occurs inside an atomic database transaction (BEGIN...COMMIT):<br>
                  • <b>Buyer Commission:</b> <code>Buyer Commission = Amount × Buyer Commission %</code> is credited to the buyer wallet.<br>
                  • <b>Seller Credit:</b> <code>Seller Payout = Amount - (Amount × Seller Margin %)</code> is credited to the seller balance.<br>
                  • <b>Limits Update:</b> Both buyer and seller used limits are updated accordingly.
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">7</div>
              <div class="step-text">
                <h6>Instant Response vs Callback Delivery</h6>
                <p>
                  • If processing finishes within the configured 'Instant Response Time' (e.g., 15s), an instant synchronous response is returned to the buyer.<br>
                  • If upstream seller processing exceeds this threshold, the backend asynchronously posts transaction ID, operator ID, and status code to the buyer's registered <b>Callback URL</b>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <footer class="bg-dark text-white py-4 text-center border-top">
    <div class="container">
      <p class="mb-1 font-weight-bold">Exchange System Logic &amp; Architecture Map</p>
      <small class="text-muted">Direct Access Only — Confidential Internal Documentation</small>
    </div>
  </footer>

  <script>
    function activateTab(e, sectionId) {
      document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
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
    response.end(html);
  }

  return { sendSystemChartPage };
};
