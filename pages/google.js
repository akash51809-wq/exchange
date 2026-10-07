'use strict';

/**
 * Google Messages Web Hub (/google)
 * Direct standalone page for opening https://messages.google.com/
 * Allows pairing via Google Account (Email login) or Mobile QR Code Scanner.
 * Not linked in admin or user panel menus.
 */
module.exports = function createGooglePage() {
  async function sendGooglePage(request, response) {
    const html = `<!DOCTYPE html>
<html lang="hi" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Messages Web Hub - Email Login & Mobile QR Pairing</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --g-blue: #1a73e8;
      --g-blue-dark: #1557b0;
      --g-blue-light: #e8f0fe;
      --g-red: #ea4335;
      --g-yellow: #fbbc04;
      --g-green: #34a853;
      --dark-bg: #0f172a;
      --dark-card: #1e293b;
      --dark-border: #334155;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0b1120;
      color: var(--text-main);
      margin: 0;
      padding: 0;
      min-height: 100vh;
      line-height: 1.6;
    }

    /* Top Brand Bar */
    .top-bar {
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--dark-border);
      padding: 14px 24px;
      position: sticky;
      top: 0;
      z-index: 1000;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand-title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 19px;
      font-weight: 700;
      color: #fff;
    }
    .google-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      font-size: 13px;
      color: #cbd5e1;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background: var(--g-green);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--g-green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.2); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }

    /* Container */
    .main-wrapper {
      max-width: 1280px;
      margin: 0 auto;
      padding: 30px 20px 80px;
    }

    /* Hero Banner */
    .hero-card {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid var(--dark-border);
      border-radius: 16px;
      padding: 32px 36px;
      margin-bottom: 30px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .hero-card::after {
      content: '';
      position: absolute;
      top: -40px;
      right: -40px;
      width: 250px;
      height: 250px;
      background: radial-gradient(circle, rgba(26,115,232,0.18) 0%, rgba(0,0,0,0) 70%);
      border-radius: 50%;
      pointer-events: none;
    }
    .hero-heading {
      font-size: 28px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .hero-sub {
      color: var(--text-muted);
      font-size: 15px;
      max-width: 840px;
      margin-bottom: 24px;
    }

    /* Launch Actions Grid */
    .launch-btn-group {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .btn-launch-primary {
      background: linear-gradient(135deg, var(--g-blue) 0%, var(--g-blue-dark) 100%);
      color: #fff !important;
      font-weight: 700;
      font-size: 16px;
      padding: 14px 28px;
      border-radius: 10px;
      border: none;
      box-shadow: 0 4px 18px rgba(26,115,232,0.4);
      display: inline-flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-launch-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(26,115,232,0.55);
    }
    .btn-launch-secondary {
      background: rgba(255,255,255,0.06);
      border: 1px solid var(--dark-border);
      color: #e2e8f0 !important;
      font-weight: 600;
      font-size: 15px;
      padding: 14px 22px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
    }
    .btn-launch-secondary:hover {
      background: rgba(255,255,255,0.12);
      border-color: #64748b;
      color: #fff !important;
    }

    /* Guide Grid */
    .guide-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 24px;
      margin-bottom: 30px;
    }
    .card-guide {
      background: var(--dark-card);
      border: 1px solid var(--dark-border);
      border-radius: 14px;
      padding: 24px;
      position: relative;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .card-guide:hover {
      border-color: #475569;
    }
    .guide-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 18px;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .guide-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }
    .icon-email { background: rgba(26,115,232,0.15); color: #60a5fa; }
    .icon-qr { background: rgba(52,168,83,0.15); color: #4ade80; }
    .icon-otp { background: rgba(245,158,11,0.15); color: #fbbf24; }

    .step-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .step-item {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    .step-item:last-child { margin-bottom: 0; }
    .step-badge {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #334155;
      color: #f8fafc;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .step-text h6 {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
    }
    .step-text p {
      font-size: 13.5px;
      color: var(--text-muted);
      margin: 0;
      line-height: 1.5;
    }

    /* OTP Scratchpad Tool */
    .scratchpad-card {
      background: var(--dark-card);
      border: 1px solid var(--dark-border);
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 30px;
    }
    .scratchpad-textarea {
      width: 100%;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 14px;
      color: #f8fafc;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      resize: vertical;
      min-height: 90px;
      margin-bottom: 12px;
      outline: none;
      transition: border-color 0.2s;
    }
    .scratchpad-textarea:focus {
      border-color: var(--g-blue);
    }
    .otp-extracted-box {
      background: #0f172a;
      border: 1px dashed #475569;
      border-radius: 10px;
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .otp-number {
      font-family: 'JetBrains Mono', monospace;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 4px;
      color: #4ade80;
    }

    /* Embedded Frame Container */
    .frame-wrapper {
      background: var(--dark-card);
      border: 1px solid var(--dark-border);
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 30px;
    }
    .frame-bar {
      padding: 12px 18px;
      background: #111827;
      border-bottom: 1px solid var(--dark-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .frame-notice {
      background: rgba(245, 158, 11, 0.1);
      border-left: 4px solid var(--g-yellow);
      padding: 12px 18px;
      color: #fde68a;
      font-size: 13.5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .embedded-frame {
      width: 100%;
      height: 750px;
      border: none;
      background: #fff;
    }

    /* Toast Notification */
    .toast-msg {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #10b981;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-weight: 600;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      display: none;
      z-index: 9999;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>

  <!-- Top Brand Bar -->
  <header class="top-bar">
    <div class="brand-title">
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
        <path d="M24 4C12.95 4 4 12.95 4 24C4 35.05 12.95 44 24 44C35.05 44 44 35.05 44 24C44 12.95 35.05 4 24 4Z" fill="#1A73E8"/>
        <path d="M35 17H13C11.9 17 11 17.9 11 19V29C11 30.1 11.9 31 13 31H35C36.1 31 37 30.1 37 29V19C37 17.9 36.1 17 35 17ZM34 21L24 27.25L14 21V19L24 25.25L34 19V21Z" fill="white"/>
      </svg>
      <span>Google Messages Web Gateway</span>
    </div>
    <div class="d-flex align-items-center" style="gap: 12px;">
      <span class="google-badge">
        <span class="pulse-dot"></span> Web Sync Active
      </span>
      <span class="badge badge-secondary py-2 px-3 text-white" style="font-size: 12px; background: #334155;">
        <i class="fa fa-lock mr-1"></i> Direct Access Only
      </span>
    </div>
  </header>

  <!-- Main Content -->
  <main class="main-wrapper">

    <!-- Hero Card -->
    <div class="hero-card">
      <div class="hero-heading">
        <span>Google Messages (messages.google.com)</span>
        <span class="badge badge-primary px-3 py-1 font-weight-normal" style="font-size: 14px; background: #1a73e8;">
          Email Login &amp; Mobile QR Scanner
        </span>
      </div>
      <p class="hero-sub">
        यहाँ से आप Google Messages Web को सीधे ओपन करके अपने <b>Google Account (Email)</b> से लॉगिन कर सकते हैं अथवा अपने <b>Android Mobile से QR Code स्कैन</b> करके सभी आने वाले SMS, Bank OTP, और Seller OTP को अपने कंप्यूटर पर रीयल-टाइम में प्राप्त कर सकते हैं।
      </p>

      <div class="launch-btn-group">
        <button type="button" class="btn-launch-primary" onclick="openGoogleMessagesApp()">
          <i class="fa fa-desktop" style="font-size: 18px;"></i>
          <span>Launch Google Messages App Window</span>
        </button>
        <a href="https://messages.google.com/web" target="_blank" rel="noopener noreferrer" class="btn-launch-secondary">
          <i class="fa fa-external-link"></i>
          <span>Open in New Browser Tab</span>
        </a>
        <a href="https://messages.google.com/web/authentication" target="_blank" rel="noopener noreferrer" class="btn-launch-secondary">
          <i class="fa fa-qrcode text-success"></i>
          <span>Direct QR Pairing Page</span>
        </a>
      </div>
    </div>

    <!-- Step-by-Step Guide Grid -->
    <div class="guide-grid">

      <!-- Guide 1: Email Login -->
      <div class="card-guide">
        <div class="guide-header">
          <div class="guide-icon icon-email">
            <i class="fa fa-envelope-o"></i>
          </div>
          <div>
            <h5 class="mb-0 font-weight-bold text-white">विधि 1: Google Account (Email) से लॉगिन</h5>
            <small class="text-muted">Google खाते द्वारा ऑटोमैटिक क्लाउड पेयरिंग</small>
          </div>
        </div>
        <ul class="step-list">
          <li class="step-item">
            <div class="step-badge">1</div>
            <div class="step-text">
              <h6>Google Messages विंडो खोलें</h6>
              <p>ऊपर <b>"Launch Google Messages App Window"</b> बटन पर क्लिक करें। विंडो में <b>"Sign in with Google"</b> (Google खाते से साइन इन करें) का विकल्प चुनें।</p>
            </div>
          </li>
          <li class="step-item">
            <div class="step-badge">2</div>
            <div class="step-text">
              <h6>Gmail आईडी व पासवर्ड दर्ज करें</h6>
              <p>वही Google Account (Gmail) भरें जो आपके उस Android फ़ोन में एक्टिव है जिसके SMS आप देखना चाहते हैं।</p>
            </div>
          </li>
          <li class="step-item">
            <div class="step-badge">3</div>
            <div class="step-text">
              <h6>मोबाइल स्क्रीन पर पुष्टि करें</h6>
              <p>आपके मोबाइल फ़ोन पर Google Messages ऐप में पुष्टि का अलर्ट आएगा (या नंबर मिलान करने को कहा जाएगा)। फ़ोन पर 'Yes' टैप करें।</p>
            </div>
          </li>
          <li class="step-item">
            <div class="step-badge">4</div>
            <div class="step-text">
              <h6>सभी SMS लाइव दिखने लगेंगे</h6>
              <p>लॉगिन पूरा होते ही आपके फ़ोन के सभी टेक्स्ट मैसेज, बैंक OTP और अलर्ट्स कंप्यूटर स्क्रीन पर लाइव उपलब्ध हो जाएंगे।</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- Guide 2: Mobile QR Scan -->
      <div class="card-guide">
        <div class="guide-header">
          <div class="guide-icon icon-qr">
            <i class="fa fa-qrcode"></i>
          </div>
          <div>
            <h5 class="mb-0 font-weight-bold text-white">विधि 2: Mobile Phone से QR कोड स्कैन</h5>
            <small class="text-muted">फ़ोन कैमरे द्वारा त्वरित 5-सेकंड पेयरिंग</small>
          </div>
        </div>
        <ul class="step-list">
          <li class="step-item">
            <div class="step-badge">1</div>
            <div class="step-text">
              <h6>"Remember this computer" ON करें</h6>
              <p>Google Messages स्क्रीन पर QR कोड के ठीक नीचे <b>"Remember this computer" (इस कंप्यूटर को याद रखें)</b> को ऑन रखें ताकि बार-बार स्कैन न करना पड़े।</p>
            </div>
          </li>
          <li class="step-item">
            <div class="step-badge">2</div>
            <div class="step-text">
              <h6>फ़ोन में Google Messages ऐप खोलें</h6>
              <p>अपने Android फ़ोन पर <b>Messages</b> ऐप खोलें। ऊपर दाईं ओर अपने प्रोफ़ाइल फ़ोटो अथवा 3 डॉट्स (⋮) पर टैप करें।</p>
            </div>
          </li>
          <li class="step-item">
            <div class="step-badge">3</div>
            <div class="step-text">
              <h6>"Device pairing" चुनें</h6>
              <p>मेनू में <b>Device pairing (डिवाइस पेयरिंग)</b> विकल्प पर टैप करें और फिर <b>QR code scanner</b> बटन दबाएं।</p>
            </div>
          </li>
          <li class="step-item">
            <div class="step-badge">4</div>
            <div class="step-text">
              <h6>स्क्रीन पर दिख रहा QR कोड स्कैन करें</h6>
              <p>फ़ोन के कैमरे को कंप्यूटर स्क्रीन पर दिख रहे QR कोड के सामने लाएं। 1 सेकंड में स्कैन होते ही कनेक्शन पूरा हो जाएगा।</p>
            </div>
          </li>
        </ul>
      </div>

    </div>

    <!-- Live OTP Extractor Scratchpad -->
    <div class="scratchpad-card">
      <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap" style="gap: 10px;">
        <div class="d-flex align-items-center" style="gap: 12px;">
          <div class="guide-icon icon-otp" style="width: 38px; height: 38px; font-size: 17px;">
            <i class="fa fa-bolt"></i>
          </div>
          <div>
            <h5 class="mb-0 font-weight-bold text-white">Smart OTP &amp; SMS Extractor (त्वरित OTP टूल)</h5>
            <small class="text-muted">Google Messages से आया हुआ मैसेज यहाँ पेस्ट करें — सिस्टम अपने आप OTP निकाल लेगा</small>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary text-white" onclick="clearScratchpad()">
          <i class="fa fa-trash mr-1"></i> Clear
        </button>
      </div>

      <textarea 
        class="scratchpad-textarea" 
        id="smsInput" 
        placeholder="यहाँ आया हुआ SMS या OTP मैसेज पेस्ट करें (उदा: Your OTP for transaction is 481920. Valid for 10 minutes)..." 
        oninput="autoExtractOtp()"></textarea>

      <div class="otp-extracted-box" id="otpBox" style="display: none;">
        <div>
          <span class="text-muted small d-block">EXTRACTED OTP:</span>
          <span class="otp-number" id="detectedOtp">------</span>
          <span class="badge badge-info ml-2" id="detectedMeta">Detected</span>
        </div>
        <button type="button" class="btn btn-success font-weight-bold px-4" onclick="copyDetectedOtp()">
          <i class="fa fa-clone mr-1"></i> Copy OTP
        </button>
      </div>
    </div>

    <!-- Embedded Viewer Option (Toggleable) -->
    <div class="frame-wrapper">
      <div class="frame-bar">
        <div class="d-flex align-items-center" style="gap: 10px;">
          <i class="fa fa-window-maximize text-primary"></i>
          <span class="font-weight-bold text-white">In-Page Webview Container</span>
          <span class="badge badge-dark text-muted">https://messages.google.com/web</span>
        </div>
        <div>
          <button type="button" class="btn btn-sm btn-outline-light mr-2" onclick="toggleIframe()">
            <span id="toggleText"><i class="fa fa-eye mr-1"></i> Load In-Page Viewer</span>
          </button>
          <button type="button" class="btn btn-sm btn-primary" onclick="openGoogleMessagesApp()">
            <i class="fa fa-desktop mr-1"></i> Recommended: App Window
          </button>
        </div>
      </div>

      <div class="frame-notice">
        <div>
          <i class="fa fa-info-circle mr-1 text-warning"></i>
          <b>सुरक्षा सूचना (Security Notice):</b> Google की सख्त सिक्योरिटी पॉलिसी (X-Frame-Options) के कारण Google लॉगिन और QR पेयरिंग के लिए <b>"Launch Google Messages App Window"</b> बटन का उपयोग करना सबसे सहज और सुरक्षित रहता है।
        </div>
        <button type="button" class="btn btn-sm btn-warning text-dark font-weight-bold" onclick="openGoogleMessagesApp()">
          Open App Mode Now
        </button>
      </div>

      <div id="iframeContainer" style="display: none;">
        <iframe 
          id="googleFrame" 
          class="embedded-frame" 
          src="about:blank"
          title="Google Messages Web" 
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals">
        </iframe>
      </div>
    </div>

    <!-- Troubleshooting & Battery Optimization Tips -->
    <div class="row">
      <div class="col-md-6 mb-3">
        <div class="p-3 rounded" style="background: var(--dark-card); border: 1px solid var(--dark-border);">
          <h6 class="text-white font-weight-bold mb-2">
            <i class="fa fa-battery-full text-success mr-1"></i> कनेक्शन लगातार एक्टिव रखने के टिप्स
          </h6>
          <ul class="text-muted small pl-3 mb-0" style="line-height: 1.8;">
            <li>फ़ोन में <b>Settings &rarr; Apps &rarr; Messages &rarr; Battery</b> में जाकर <b>Unrestricted (बिना रोक-टोक)</b> सेट करें ताकि बैकग्राउंड में ऐप बंद न हो।</li>
            <li>फ़ोन और कंप्यूटर दोनों पर स्थिर इंटरनेट कनेक्शन (Wi-Fi या 4G/5G) चालू रखें।</li>
            <li>QR स्कैन करते समय हमेशा <b>"Remember this computer"</b> को टिक करके रखें।</li>
          </ul>
        </div>
      </div>
      <div class="col-md-6 mb-3">
        <div class="p-3 rounded" style="background: var(--dark-card); border: 1px solid var(--dark-border);">
          <h6 class="text-white font-weight-bold mb-2">
            <i class="fa fa-question-circle text-info mr-1"></i> यदि QR कोड लोड न हो अथवा डिस्कनेक्ट हो जाए
          </h6>
          <ul class="text-muted small pl-3 mb-0" style="line-height: 1.8;">
            <li>Google Messages विंडो को बंद करके <b>"Launch App Window"</b> बटन से दोबारा खोलें।</li>
            <li>फ़ोन में Google Messages &rarr; Device pairing में जाकर पुराने कनेक्शन को Unpair करके पुनः स्कैन करें।</li>
            <li>यदि आप डुअल सिम इस्तेमाल करते हैं तो मैसेज ऐप में सही सिम कार्ड चुनें।</li>
          </ul>
        </div>
      </div>
    </div>

  </main>

  <!-- Toast Element -->
  <div class="toast-msg" id="toast">OTP Copied to Clipboard!</div>

  <script>
    // 1. Open Google Messages in Clean Standalone App Window
    function openGoogleMessagesApp() {
      const w = 1200;
      const h = 850;
      const left = Math.max(0, (window.screen.width - w) / 2);
      const top = Math.max(0, (window.screen.height - h) / 2);
      const win = window.open(
        'https://messages.google.com/web',
        'GoogleMessagesWebWin',
        'width=' + w + ',height=' + h + ',top=' + top + ',left=' + left + ',status=no,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes'
      );
      if (win) {
        win.focus();
        showToast('Google Messages App Window Launched!');
      } else {
        alert('कृपया ब्राउज़र का पॉपअप ब्लॉकर (Popup Blocker) Allow करें ताकि विंडो खुल सके।');
      }
    }

    // 2. Toggle In-Page Frame
    let isFrameLoaded = false;
    function toggleIframe() {
      const cont = document.getElementById('iframeContainer');
      const frame = document.getElementById('googleFrame');
      const text = document.getElementById('toggleText');
      if (cont.style.display === 'none') {
        cont.style.display = 'block';
        if (!isFrameLoaded) {
          frame.src = 'https://messages.google.com/web';
          isFrameLoaded = true;
        }
        text.innerHTML = '<i class="fa fa-eye-slash mr-1"></i> Hide In-Page Viewer';
      } else {
        cont.style.display = 'none';
        text.innerHTML = '<i class="fa fa-eye mr-1"></i> Load In-Page Viewer';
      }
    }

    // 3. Smart OTP Extractor
    function autoExtractOtp() {
      const text = document.getElementById('smsInput').value || '';
      const box = document.getElementById('otpBox');
      const numElem = document.getElementById('detectedOtp');
      const metaElem = document.getElementById('detectedMeta');

      if (!text.trim()) {
        box.style.display = 'none';
        return;
      }

      // RegEx patterns for common Indian Bank & Service OTPs (4, 6, 8 digits)
      const patterns = [
        /(?:otp|one time password|code|verification code|pin)[\s:is=-]+([0-9]{4,8})\b/i,
        /\b([0-9]{6})\b/,
        /\b([0-9]{4})\b/,
        /\b([0-9]{8})\b/
      ];

      let foundOtp = null;
      for (const pat of patterns) {
        const match = text.match(pat);
        if (match && match[1]) {
          foundOtp = match[1];
          break;
        } else if (match && match[0] && !isNaN(match[0])) {
          foundOtp = match[0];
          break;
        }
      }

      if (foundOtp) {
        numElem.textContent = foundOtp;
        metaElem.textContent = foundOtp.length + '-Digit OTP Detected';
        box.style.display = 'flex';
      } else {
        box.style.display = 'none';
      }
    }

    function copyDetectedOtp() {
      const otp = document.getElementById('detectedOtp').textContent.trim();
      if (!otp) return;
      navigator.clipboard.writeText(otp).then(function() {
        showToast('OTP (' + otp + ') Copied to Clipboard!');
      }).catch(function() {
        const dummy = document.createElement('textarea');
        dummy.value = otp;
        document.body.appendChild(dummy);
        dummy.select();
        document.execCommand('copy');
        document.body.removeChild(dummy);
        showToast('OTP (' + otp + ') Copied to Clipboard!');
      });
    }

    function clearScratchpad() {
      document.getElementById('smsInput').value = '';
      document.getElementById('otpBox').style.display = 'none';
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(function() {
        t.style.display = 'none';
      }, 3000);
    }
  </script>
</body>
</html>`;

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(html);
  }

  return {
    sendGooglePage,
  };
};
