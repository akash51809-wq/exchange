'use strict';

module.exports = function createSystemChartPage() {
  async function sendSystemChartPage(request, response) {
    const html = `<!DOCTYPE html>
<html lang="hi" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exchange System Architecture & Feature Chart (सिस्टम फीचर व लॉजिक चार्ट)</title>
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
          <h1 class="hero-title">Exchange सिस्टम फीचर, सेटिंग्स एवं लॉजिक चार्ट</h1>
          <p class="hero-subtitle">
            यह पेज केवल डायरेक्ट यूआरएल <code>/chart</code> से खुलता है (यूज़र या एडमिन मेनू में इसका कोई लिंक नहीं है)। इसमें सिस्टम के प्रत्येक फीचर, गणितीय फॉर्मूले, सिक्योरिटी रूल्स और बैकएंड फ्लो को बेहद सरल हिंदी भाषा में समझाया गया है।
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="nav-tabs-wrapper">
    <div class="custom-nav">
      <a href="#section-admin" class="nav-tab-btn active" onclick="activateTab(event, 'section-admin')">
        <i class="fa fa-shield text-danger"></i> 1. एडमिन पैनल (Admin Features)
      </a>
      <a href="#section-general-settings" class="nav-tab-btn" onclick="activateTab(event, 'section-general-settings')">
        <i class="fa fa-sliders text-warning"></i> 2. सर्विस सेटिंग्स (7 General Rules)
      </a>
      <a href="#section-user" class="nav-tab-btn" onclick="activateTab(event, 'section-user')">
        <i class="fa fa-user text-primary"></i> 3. यूज़र पैनल (Buyer &amp; Seller)
      </a>
      <a href="#section-engine" class="nav-tab-btn" onclick="activateTab(event, 'section-engine')">
        <i class="fa fa-bolt text-success"></i> 4. रिचार्ज इंजन व वॉटरफॉल फ्लो
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
        <h2>1. एडमिन पैनल (Admin Panel) के सभी फीचर्स व कार्यप्रणाली</h2>
      </div>

      <!-- Feature: User Management -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-users text-primary"></i> 1.1 यूजर मैनेजमेंट (User List)</h4>
          <span class="feature-route">/admin/users/list</span>
        </div>
        <div class="card-feature-body">
          <p class="font-weight-bold text-dark">सभी रजिस्टर्ड Buyers और Sellers का केंद्रीय नियंत्रण:</p>
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-money text-success"></i> लाइव वॉलेट बैलेंस</h6>
              <p>प्रत्येक यूजर का लाइव INR प्रीपेड बैलेंस दिखता है। यूजर का बैलेंस डेटाबेस के <code>wallets</code> टेबल से 1-क्लिक रिफ्रेश होता है।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-toggle-on text-primary"></i> स्टेटस नियंत्रण (Active / Inactive / Pending)</h6>
              <p>एडमिन किसी भी यूजर को तुरंत <b>Active</b>, <b>Blocked</b> (Inactive) या <b>Pending</b> कर सकता है। ब्लॉक होने पर यूजर का लॉगिन व API कॉल दोनों बंद हो जाते हैं।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-key text-danger"></i> पासवर्ड रीसेट एवं सेटिंग्स</h6>
              <p>बिना पुराने पासवर्ड के एडमिन यूजर का नया पासवर्ड सेट कर सकता है, साथ ही यूजर की प्रोफाइल, एड्रेस व पेरेंट यूजर असाइन कर सकता है।</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature: Payment & Fund Requests -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-bank text-success"></i> 1.2 फंड रिक्वेस्ट व बैंक अप्रूवल (Payment &amp; Banking)</h4>
          <span class="feature-route">/admin/payment/fund-request | /admin/payment/bank-list | /admin/payment/payout-requests</span>
        </div>
        <div class="card-feature-body">
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-arrow-down text-success"></i> फंड टॉप-अप रिक्वेस्ट (Wallet Topup)</h6>
              <p>यूजर जब बैंक में पैसे भेजकर UTR व प्रूफ सबमिट करता है, तो एडमिन उसे वेरिफाई करके <b>Approve</b> (वॉलेट में तुरंत बैलेंस क्रेडिट) या <b>Reject</b> (कारण सहित) करता है।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-building text-primary"></i> एडमिन बैंक लिस्ट (Admin Bank List)</h6>
              <p>एडमिन अपने वो बैंक खाते व UPI QR कोड जोड़ता है जो यूजर्स को वॉलेट लोड करते समय स्क्रीन पर दिखाई देते हैं।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-check-square-o text-info"></i> यूजर बैंक अप्रूवल (Bank Approval)</h6>
              <p>यूजर विथड्रॉल के लिए जो बैंक खाता जोड़ता है, एडमिन उसे पहले अप्रूव करता है। बिना अप्रूवल के यूजर उस खाते में पेआउट नहीं ले सकता।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-arrow-up text-danger"></i> पेआउट रिक्वेस्ट (Payout / Redeem)</h6>
              <p>यूजर के वॉलेट से बैंक ट्रांसफर रिक्वेस्ट। एडमिन बैंक में ट्रांसफर करके UTR नंबर डालकर <b>Approve</b> करता है, या <b>Reject</b> करने पर यूजर का बैलेंस स्वतः रिफंड हो जाता है।</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature: Disputes -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-gavel text-warning"></i> 1.3 विवाद समाधान (Disputes Resolution)</h4>
          <span class="feature-route">/admin/disputes</span>
        </div>
        <div class="card-feature-body">
          <p>Buyer और Seller के बीच विवादित रिचार्ज का सुप्रीम एडमिन फैसला:</p>
          <div class="step-flow">
            <div class="step-item">
              <div class="step-num">1</div>
              <div class="step-text">
                <h6>विवाद की समीक्षा (Review Dispute)</h6>
                <p>एडमिन बायर का कम्प्लेन रीज़न और सेलर द्वारा दिया गया ऑपरेटर रिस्पॉन्स व प्रूफ एक स्क्रीन पर देखता है।</p>
              </div>
            </div>
            <div class="step-item">
              <div class="step-num">2</div>
              <div class="step-text">
                <h6>एक्सेप्ट व रिफंड (Accept &amp; Refund)</h6>
                <p>एडमिन द्वारा <b>Accept</b> करने पर: Buyer के वॉलेट में रिचार्ज की पूरी लागत तुरंत रिफंड हो जाती है, और Seller के वॉलेट से क्रेडिट अमाउंट रिवर्स (कटौती) हो जाता है।</p>
              </div>
            </div>
            <div class="step-item">
              <div class="step-num">3</div>
              <div class="step-text">
                <h6>रिजेक्ट (Reject Dispute)</h6>
                <p>यदि सेलर का रिचार्ज ऑपरेटर एंड पर सफल साबित होता है, तो एडमिन विवाद को रिमार्क लिखकर Reject कर देता है (कोई रिफंड नहीं दिया जाता)।</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature: Recharge Report -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-list-alt text-info"></i> 1.4 मास्टर रिचार्ज रिपोर्ट (Recharge Report)</h4>
          <span class="feature-route">/admin/reports/recharge-report</span>
        </div>
        <div class="card-feature-body">
          <p class="font-weight-bold text-dark">सभी लाइव रिचार्ज ट्रांजैक्शन की ऑडिट रिपोर्ट और 5 एक्शन बटन्स:</p>
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-filter text-primary"></i> 9 स्मार्ट फिल्टर्स</h6>
              <p>Top 20/50/100/500, From Date, To Date, Client ID, Operator, Circle, Status, Mobile Number और Exact Amount द्वारा 1-क्लिक सर्च।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-download text-success"></i> CSV/Excel डाउनलोड</h6>
              <p>फ़िल्टर किए गए सभी डेटा को डेट-रेंज के साथ एक क्लिक में CSV फाइल में डाउनलोड करना।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-clock-o text-warning"></i> समय व सटीक अवधि (Duration in Seconds)</h6>
              <p>तारीख व समय सेकंड्स सहित (<code>hh:mm:ss</code>) और रिचार्ज सक्सेस होने में कितने सेकंड लगे (उदा. <code>⏱️ 2.4s</code>)।</p>
            </div>
          </div>
          <div class="mt-3">
            <h6 class="font-weight-bold text-dark">टेबल में उपलब्ध 5 एक्शन बटन (Action Controls):</h6>
            <div class="row">
              <div class="col-md-4 mb-2">
                <div class="p-2 border rounded bg-light">
                  <strong class="text-danger"><i class="fa fa-times"></i> Fail Button (केवल Success ट्रांजैक्शन हेतु):</strong>
                  <p class="small mb-0">यदि ऑपरेटर से बाद में रिचार्ज फेल हो जाए, तो एडमिन इस बटन से ट्रांजैक्शन को FAILED कर सकता है। बायर के वॉलेट में तुरंत रिफंड चला जाता है और सेलर का क्रेडिट वापस कट जाता है।</p>
                </div>
              </div>
              <div class="col-md-4 mb-2">
                <div class="p-2 border rounded bg-light">
                  <strong class="text-warning"><i class="fa fa-gavel"></i> Dispute Button:</strong>
                  <p class="small mb-0">ट्रांजैक्शन पर सीधे विवाद दर्ज करने या विवाद की स्थिति देखने की सुविधा।</p>
                </div>
              </div>
              <div class="col-md-4 mb-2">
                <div class="p-2 border rounded bg-light">
                  <strong class="text-info"><i class="fa fa-paper-plane"></i> Resend Callback (CB):</strong>
                  <p class="small mb-0">Buyer के Callback URL पर ताज़ा रिचार्ज स्थिति, ऑपरेटर ID और रिस्पॉन्स कोड के साथ दोबारा वेबहुक भेजना।</p>
                </div>
              </div>
              <div class="col-md-6 mb-2">
                <div class="p-2 border rounded bg-light">
                  <strong class="text-dark"><i class="fa fa-file-text-o"></i> Recharge Log:</strong>
                  <p class="small mb-0">मोडल में पूरा कच्चा (Raw) JSON पेलोड, प्रोवाइडर का मूल रिस्पॉन्स, टाइमस्टैम्प्स, बायर/सेलर की जानकारी देखना।</p>
                </div>
              </div>
              <div class="col-md-6 mb-2">
                <div class="p-2 border rounded bg-light">
                  <strong class="text-primary"><i class="fa fa-pencil"></i> Update Ope ID:</strong>
                  <p class="small mb-0">ऑपरेटर रेफरेंस ID (opeid) को सीधे मोडल में एडिट करके सेव करना।</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature: Operators -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-cogs text-secondary"></i> 1.5 ऑपरेटर मैनेजमेंट (Create &amp; Show Operators)</h4>
          <span class="feature-route">/admin/settings/create-operator | /admin/settings/show-operator</span>
        </div>
        <div class="card-feature-body">
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-plus-circle text-primary"></i> ऑपरेटर कॉन्फ़िगरेशन</h6>
              <p>ऑपरेटर नाम, कोड (उदा. AT, JIO, VI), सर्विस प्रकार (Mobile, DTH, Bill Payment, FASTag, आदि), मिनिमम व मैक्सिमम अमाउंट सीमा।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-ban text-danger"></i> स्टॉप अमाउंट्स (Stop Amounts)</h6>
              <p>कॉमा-सेपरेटेड अमाउंट्स (उदा. 101, 501, 1001) जिन्हें ब्लॉक करना हो, ताकि कोई यूजर गलती से इन अमाउंट्स का रिचार्ज न कर सके।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-list text-info"></i> बिल पेमेंट पैरामीटर्स</h6>
              <p>बिजली/गैस/पानी के लिए कस्टम फ़ील्ड्स (उदा. Consumer Number, Account ID, Sub-division) जोड़ना।</p>
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
        <h2>2. सर्विस सेटिंग्स (General Rules &amp; 7 System Switches)</h2>
      </div>

      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-sliders text-warning"></i> सर्विस सेटिंग्स का General Tab</h4>
          <span class="feature-route">/admin/settings/service-settings</span>
        </div>
        <div class="card-feature-body">
          <p>यह 7 सेटिंग्स पूरे एक्सचेंज सिस्टम की आत्मा हैं। प्रत्येक सेटिंग के आगे कॉम्पैक्ट <b>ON/OFF</b> टॉगल स्विच दिया गया है:</p>

          <div class="table-responsive">
            <table class="table table-bordered table-striped">
              <thead class="bg-dark text-white">
                <tr>
                  <th style="width: 50px;">#</th>
                  <th style="width: 220px;">सेटिंग का नाम</th>
                  <th style="width: 140px;">स्विच / इनपुट</th>
                  <th>विस्तृत कार्यप्रणाली एवं लॉजिक (How it Works)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="font-weight-bold text-center">1</td>
                  <td><strong>Login OTP</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span></td>
                  <td>
                    • <b>ON होने पर:</b> जब भी कोई यूजर (Admin, Buyer या Seller) अपना यूजर आईडी व पासवर्ड डालेगा, सिस्टम तुरंत 6 अंकों का सुरक्षित OTP जनरेट करके उसके रजिस्टर्ड <b>Email</b> और <b>WhatsApp</b> दोनों पर भेजेगा। OTP भरने पर ही लॉगिन होगा।<br>
                    • <b>OFF होने पर:</b> OTP नहीं मांगा जाएगा, यूजर सीधे पासवर्ड से तुरंत लॉगिन हो जाएगा।
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">2</td>
                  <td><strong>Instant Response Time</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Seconds (उदा. 15s)</small></td>
                  <td>
                    • <b>लॉजिक:</b> Buyer जब API से कोई रिचार्ज रिक्वेस्ट भेजेगा, तो यहाँ सेट किए गए सेकंड्स (उदा. 15 सेकंड) के अंदर यदि सेलर से Success या Fail रिस्पॉन्स मिल जाता है, तो Buyer को सीधा Live रिस्पॉन्स जाएगा।<br>
                    • यदि सेलर की API धीमी है और सेट सेकंड्स से अधिक समय लगता है, तो Buyer का कनेक्शन टाइमआउट नहीं होगा, बल्कि रिस्पॉन्स आने पर बैकएंड स्वतः Buyer के <b>Callback URL</b> पर रिस्पॉन्स भेज देगा।
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">3</td>
                  <td><strong>Complain Accept After</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Instant / Delay (Sec/Min)</small></td>
                  <td>
                    • <b>Instant:</b> रिचार्ज होते ही Buyer तुरंत कम्प्लेन/विवाद दर्ज कर सकता है।<br>
                    • <b>Set Time:</b> जितने सेकंड या मिनट सेट होंगे, रिचार्ज होने के केवल उतने समय बाद ही कम्प्लेन स्वीकार होगी। पहले कम्प्लेन करने पर सिस्टम बताएगा कि कृपया इतने सेकंड/मिनट प्रतीक्षा करें।
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">4</td>
                  <td><strong>Do not Accept Complain After</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Days (उदा. 7 Days)</small></td>
                  <td>
                    • <b>लॉजिक:</b> इसमें जितने दिन भरे होंगे (उदा. 7 दिन), सिर्फ उतने दिन पुराने ट्रांजैक्शन की ही कम्प्लेन प्राप्त होगी। उससे अधिक पुरानी तारीख के रिचार्ज पर कम्प्लेन सबमिशन ब्लॉक रहेगा।
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">5</td>
                  <td><strong>Notify Pending Txn After</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Minutes (उदा. 15 Min)</small></td>
                  <td>
                    • <b>बैकग्राउंड ऑटो-वर्कर:</b> रिचार्ज जिस भी Seller के पास गया है, यदि वह रिचार्ज सेट मिनटों (उदा. 15 मिनट) से अधिक समय तक <code>pending</code> रहता है, तो सिस्टम हर 60 सेकंड में चेक करके उस Seller के WhatsApp पर ऑटोमैटिक रिमाइंडर मैसेज भेजता है कि कृपया इस पेंडिंग रिचार्ज को तुरंत क्लियर करें।
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">6</td>
                  <td><strong>Stop Rehit After</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Minutes (उदा. 2 Min)</small></td>
                  <td>
                    • <b>लॉजिक:</b> यदि पहली API/सेलर से रिचार्ज रिस्पॉन्स आने में या फेल होने में सेट किए गए मिनट (उदा. 2 मिनट) से अधिक समय लग जाता है, तो सिस्टम आगे दूसरे सेलर पर Re-hit (झरना) करने के बजाय Buyer को तुरंत Fail रिस्पॉन्स भेजकर रोक देगा ताकि बायर का पैसा अटका न रहे।
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-center">7</td>
                  <td><strong>Stop Same Number/Amount for</strong></td>
                  <td><span class="tag-pill tag-on">ON</span> / <span class="tag-pill tag-off">OFF</span><br><small class="text-muted">Minutes (उदा. 3 Min)</small></td>
                  <td>
                    • <b>डुप्लीकेट रिचार्ज सुरक्षा:</b> जो रिचार्ज एक बार Success हो चुका है, उसी समान मोबाइल नंबर और समान अमाउंट का नया रिक्वेस्ट उतने सेट मिनट में किसी भी यूजर से दोबारा स्वीकार नहीं होगा। इससे गलती से दो बार रिचार्ज होने का नुकसान रुक जाता है।
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="row mt-4">
            <div class="col-md-3">
              <div class="logic-box border-primary">
                <h6><i class="fa fa-envelope text-primary"></i> Email Notification Settings</h6>
                <p class="mb-0 small">Google Apps Script Webhook या SMTP सर्वर। OTP, अलर्ट्स व ट्रांजैक्शन मेल्स भेजने हेतु।</p>
              </div>
            </div>
            <div class="col-md-3">
              <div class="logic-box border-success">
                <h6><i class="fa fa-whatsapp text-success"></i> WhatsApp Notification Settings</h6>
                <p class="mb-0 small">UltraMsg या Custom Gateway। लॉगिन OTP, पेआउट अलर्ट्स व सेलर पेंडिंग रिमाइंडर भेजने हेतु।</p>
              </div>
            </div>
            <div class="col-md-3">
              <div class="logic-box border-info">
                <h6><i class="fa fa-search text-info"></i> Plan API (ERS HLR Fetch)</h6>
                <p class="mb-0 small">बैकएंड में प्री-कॉन्फ़िगर ERS API। बायर मोबाइल नंबर से लाइव ऑपरेटर व सर्कल फेच व ऑटो-राउटिंग।</p>
              </div>
            </div>
            <div class="col-md-3">
              <div class="logic-box border-warning">
                <h6><i class="fa fa-percent text-warning"></i> Margin Difference Setting</h6>
                <p class="mb-0 small">सेलर मार्जिन और बायर मार्जिन के बीच एडमिन का न्यूनतम कमीशन मार्जिन अंतर (%) तय करना।</p>
              </div>
            </div>
          </div>

          <div class="card-feature mt-4 border-info">
            <div class="card-feature-header bg-light">
              <h4><i class="fa fa-search text-info"></i> Plan API (Multi-Brand ERS Operator &amp; Circle Fetch Engine)</h4>
              <span class="feature-route">/admin/settings/service-settings#tabPlanApi</span>
            </div>
            <div class="card-feature-body">
              <p>रिचार्ज सिस्टम को पूरी तरह ऑटोमैटिक बनाने के लिए <strong>Plan API / HLR Operator Lookup</strong> इंटीग्रेट किया गया है:</p>
              <ul>
                <li><strong>मल्टी-ब्रांड आर्किटेक्चर (Multi-Brand Support):</strong> सिस्टम में एक से अधिक ब्रांड्स का Plan API जोड़ने की सुविधा है। वर्तमान में <strong>ERS (Easy Recharge Solution)</strong> ब्रांड लाइव एक्टिव है।</li>
                <li><strong>बैकएंड में प्री-कॉन्फ़िगर URL:</strong> एडमिन को कोई बड़ा URL लिखने की जरूरत नहीं है। बैकएंड में <code>https://plan.easyrechargesolution.com/api/Mobile/OperatorFetchNew</code> पहले से कॉन्फ़िगर है। एडमिन को एडमिन पैनल में सिर्फ अपना <strong>User ID (ApiUserID)</strong> और <strong>Token</strong> सबमिट करना होता है।</li>
                <li><strong>डायनामिक मोबाइल नंबर (Mobileno Replacement):</strong> जब भी कोई Buyer रिचार्ज रिक्वेस्ट भेजता है, उसका 10-अंकों का मोबाइल नंबर ERS API के <code>Mobileno</code> पैरामीटर में लाइव पास होता है।</li>
                <li><strong>लाइव ऑपरेटर व सर्कल डिटेक्शन:</strong> ERS से प्राप्त ऑपरेटर नाम (उदा. AIRTEL, Reliance Jio, VODAFONE) और सर्कल (उदा. UP East, Mumbai) को सिस्टम डेटाबेस के <code>operator_definitions</code> और सर्कल्स से स्वतः मैच किया जाता है।</li>
                <li><strong>बेस्ट सेलर मार्जिन ऑटो-राउटिंग:</strong> डिटेक्ट किए गए ऑपरेटर और सर्कल के आधार पर सेलर मार्जिन सेटिंग्स चेक होती हैं और सबसे ज्यादा कमीशन मार्जिन देने वाले सेलर के पास रिचार्ज रिक्वेस्ट वाटरफॉल तरीके से रूट हो जाती है।</li>
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
        <h2>3. यूज़र पैनल (User Panel) के सभी फीचर्स व कार्यप्रणाली</h2>
      </div>

      <!-- Buyer Features -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-shopping-cart text-primary"></i> 3.1 बायर मॉड्यूल्स (Buyer - रिचार्ज खरीदने वाला)</h4>
          <span class="feature-route">/buyer/*</span>
        </div>
        <div class="card-feature-body">
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-eye text-primary"></i> Available Margin (/buyer/available-margin)</h6>
              <p>मार्केट में जितने भी सेलर स्टॉक दे रहे हैं, उनमें से एडमिन का मार्जिन अंतर काटकर बायर को मिलने वाला वास्तविक बेस्ट कमीशन लाइव दिखता है।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-sliders text-success"></i> Buyer Margin (/buyer/margin)</h6>
              <p>बायर प्रत्येक ऑपरेटर पर अपना न्यूनतम अपेक्षित कमीशन (%) सेट करता है। इसके साथ ही डेली/मंथली लिमिट और जीएसटी विकल्प चुनता है।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-list-alt text-info"></i> Purchase Txn (/buyer/purchase-txn)</h6>
              <p>बायर द्वारा खरीदे गए सभी रिचार्ज का पूरा इतिहास। फ़िल्टर (Date, Operator, Status, Mobile, Ref ID) और लाइव समरी कार्ड्स।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-undo text-danger"></i> Purchase Refund (/buyer/purchase-refund)</h6>
              <p>फेल हुए या डिस्प्यूट में रिफंड मिले रिचार्ज का ब्योरा। रिफंड की रकम बायर के प्रीपेड वॉलेट में स्वतः जुड़ जाती है।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-gavel text-warning"></i> Recharge Dispute (/buyer/recharge-dispute)</h6>
              <p>गलत या पेंडिंग रिचार्ज पर कम्प्लेन दर्ज करना। सिस्टम सेटिंग्स के अनुसार समय सीमा जांची जाती है।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-pie-chart text-secondary"></i> Operator-wise Purchase (/buyer/operator-wise-purchase)</h6>
              <p>ऑपरेटर के आधार पर कुल रिचार्ज काउंट, कुल खर्च की गई रकम और कमाए गए कमीशन का समरी टेबल।</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Seller Features -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-briefcase text-success"></i> 3.2 सेलर मॉड्यूल्स (Seller - रिचार्ज बेचने/सप्लाई करने वाला)</h4>
          <span class="feature-route">/seller/*</span>
        </div>
        <div class="card-feature-body">
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-tag text-success"></i> Sales Margin (/seller/sales-margin)</h6>
              <p>सेलर तय करता है कि वह किस ऑपरेटर पर कितना कमीशन (%) ऑफर कर रहा है, उसकी बिक्री सीमा (Limit) क्या है और मिनिमम Roffer आवश्यकता क्या है।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-line-chart text-primary"></i> Sales Txn (/seller/sales-txn)</h6>
              <p>सेलर के स्टॉक/API पर जितने भी रिचार्ज हिट हुए, उनकी पूरी लिस्ट। रिचार्ज सक्सेस होने पर सेलर को मिला क्रेडिट तुरंत दिखता है।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-code text-dark"></i> API Setting (/seller/api-setting)</h6>
              <p>सेलर अपनी थर्ड-पार्टी रिचार्ज API (URL, Headers, GET/POST Parameters, JSON/Text Dynamic Parsing, Callback Setup) सेट करता है।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-gavel text-warning"></i> Sales Dispute (/seller/sales-dispute)</h6>
              <p>बायर द्वारा की गई कम्प्लेन्स का सेलर स्तर पर निस्तारण। सेलर ऑपरेटर प्रूफ देखकर <b>Accept (Refund)</b> या <b>Reject</b> कर सकता है।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-clock-o text-danger"></i> Sales Pending (/seller/sales-pending)</h6>
              <p>सेलर की API पर पेंडिंग चल रहे रिचार्ज का लाइव मॉनिटरिंग डैशबोर्ड।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-bar-chart text-info"></i> Operator-wise Sale (/seller/operator-wise-sale)</h6>
              <p>ऑपरेटर-वाइज़ बिक्री मात्रा, सेलर्स को मिला पेमेंट और मार्जिन का एनालिटिक्स।</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Security Settings -->
      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-lock text-danger"></i> 3.3 यूजर सुरक्षा सेटिंग्स (IP Whitelist &amp; Callback)</h4>
          <span class="feature-route">/setting/ip-setting | /setting/add-callback</span>
        </div>
        <div class="card-feature-body">
          <div class="logic-grid">
            <div class="logic-box">
              <h6><i class="fa fa-shield text-primary"></i> IP Setting (API सुरक्षा)</h6>
              <p>यूजर अपने सर्वर का IP Address व्हाइटलिस्ट करता है। बिना व्हाइटलिस्टेड IP के API से कोई भी रिचार्ज रिक्वेस्ट स्वीकार नहीं की जाती।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-link text-success"></i> Add Callback (वेबहुक URL)</h6>
              <p>यूजर अपना Callback URL जोड़ता है ताकि रिचार्ज का स्टेटस (Success/Fail) उसके सर्वर पर वेबहुक द्वारा स्वतः प्राप्त हो सके।</p>
            </div>
            <div class="logic-box">
              <h6><i class="fa fa-key text-danger"></i> Dual-OTP सुरक्षा</h6>
              <p>IP या Callback URL बदलते समय सुरक्षा हेतु यूजर के ईमेल और व्हाट्सएप पर डुअल OTP जाता है, जिसे भरने के बाद ही बदलाव लागू होता है।</p>
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
        <h2>4. स्मार्ट रिचार्ज इंजन, वॉटरफॉल व सेटलमेंट लॉजिक</h2>
      </div>

      <div class="card-feature">
        <div class="card-feature-header">
          <h4><i class="fa fa-bolt text-warning"></i> रिचार्ज का पूरा जीवनचक्र (End-to-End Lifecycle)</h4>
          <span class="feature-route">lib/buyer-api-service.js</span>
        </div>
        <div class="card-feature-body">
          <p class="font-weight-bold text-dark">जब Buyer की API या पोर्टल से एक रिचार्ज रिक्वेस्ट आती है, तो सिस्टम निम्नलिखित 7 चरणों में काम करता है:</p>

          <div class="step-flow">
            <div class="step-item">
              <div class="step-num">1</div>
              <div class="step-text">
                <h6>ऑथेंटिकेशन एवं डुप्लीकेट चेक (Authentication &amp; Duplicate Check)</h6>
                <p>
                  • Buyer का <code>api_token</code> और व्हाइटलिस्टेड IP चेक होता है।<br>
                  • <b>Duplicate Protection:</b> यदि 'Stop Same Number/Amount' सेटिंग ON है, तो देखा जाता है कि पिछले X मिनट में इसी नंबर व अमाउंट का सफल रिचार्ज तो नहीं हुआ। यदि हुआ है, तो रिक्वेस्ट तुरंत रिजेक्ट हो जाती है।
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">2</div>
              <div class="step-text">
                <h6>वॉलेट बैलेंस जाँच एवं होल्ड/डेबिट (Wallet Balance Debit)</h6>
                <p>
                  • Buyer के प्रीपेड वॉलेट बैलेंस की जांच होती है। यदि बैलेंस कम है तो <code>Insufficient Balance</code> एरर जाता है।<br>
                  • पर्याप्त बैलेंस होने पर रिचार्ज की पूरी राशि Buyer के वॉलेट से तात्कालिक रूप से डेबिट (Hold) कर ली जाती है।
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">3</div>
              <div class="step-text">
                <h6>सर्वश्रेष्ठ सेलर मैचिंग (Best Seller Margin Matching)</h6>
                <p>
                  • सिस्टम उन सभी सक्रिय Sellers को खोजता है जिन्होंने उस ऑपरेटर व सर्कल पर स्टॉक दिया है और जिनका ऑफर किया गया मार्जिन Buyer के न्यूनतम मार्जिन से <b>बराबर या अधिक</b> है।<br>
                  • सेलर्स को उच्चतम मार्जिन से न्यूनतम मार्जिन (Descending Order) में क्रमबद्ध (Sort) किया जाता है, ताकि बायर को सबसे बेहतरीन मार्जिन वाला सेलर पहले मिले।
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">4</div>
              <div class="step-text">
                <h6>वॉटरफॉल Re-hit प्रक्रिया (Cascading Re-hit Waterfall)</h6>
                <p>
                  • सिस्टम सबसे पहले #1 सेलर की API पर रिचार्ज भेजता है।<br>
                  • यदि सेलर #1 से रिचार्ज <b>Success</b> या <b>Pending</b> होता है, तो वॉटरफॉल तुरंत रुक जाता है (विनर मिल गया)।<br>
                  • यदि सेलर #1 से रिचार्ज <b>Fail</b> होता है, तो सिस्टम जांचता है कि क्या 'Stop Rehit After' समय सीमा समाप्त तो नहीं हुई। यदि समय बचा है, तो तुरंत सेलर #2 की API पर Re-hit करता है। यह क्रम तब तक चलता है जब तक सफल सेलर न मिल जाए या लिस्ट समाप्त न हो जाए।
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">5</div>
              <div class="step-text">
                <h6>यदि सभी सेलर फेल हो जाएं (All Sellers Failed)</h6>
                <p>
                  • यदि सभी सेलर्स फेल हो जाते हैं, तो Buyer के वॉलेट से काटा गया पूरा पैसा तुरंत <b>वापस रिफंड (Credit)</b> कर दिया जाता है।<br>
                  • डेटाबेस में <code>status: 'failed'</code> का रिकॉर्ड दर्ज होता है और बायर को फेल का रिस्पॉन्स चला जाता है।
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">6</div>
              <div class="step-text">
                <h6>सफलता सेटलमेंट व गणित (Success Settlement Mathematics)</h6>
                <p>
                  जब विनर सेलर से रिचार्ज सफल होता है, तो एक ही सुरक्षित डेटाबेस ट्रांजैक्शन (BEGIN...COMMIT) में निम्नलिखित गणित होता है:<br>
                  • <b>बायर कमीशन:</b> <code>Buyer Commission = Amount × Buyer Commission %</code> बायर के वॉलेट में क्रेडिट होता है।<br>
                  • <b>सेलर क्रेडिट:</b> <code>Seller Payout = Amount - (Amount × Seller Margin %)</code> सेलर के वॉलेट में जमा होता है।<br>
                  • <b>लिमिट्स अपडेट:</b> बायर और सेलर दोनों की 'लिमिट यूज़्ड' बढ़ाई जाती है।
                </p>
              </div>
            </div>

            <div class="step-item">
              <div class="step-num">7</div>
              <div class="step-text">
                <h6>लाइव रिस्पॉन्स बनाम कॉलबैक डिलीवरी (Instant Response vs Callback)</h6>
                <p>
                  • यदि पूरे प्रोसेस में लगा समय एडमिन द्वारा सेट किए गए 'Instant Response Time' (उदा. 15 सेकंड) के भीतर है, तो Buyer को लाइव स्क्रीन/API पर तुरंत रिस्पॉन्स मिलता है।<br>
                  • यदि किसी कारणवश सेलर से रिस्पॉन्स आने में 15 सेकंड से अधिक समय लग जाता है, तो बैकएंड स्वतः Buyer के <b>Callback URL</b> पर ट्रांजैक्शन ID, ऑपरेटर ID और स्टेटस कोड भेज देता है।
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
