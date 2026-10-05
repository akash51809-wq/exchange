'use strict';

const nodemailer = require('nodemailer');
const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminGmailSettingsPage({
  db,
  encryptServiceConfig,
  decryptServiceConfig,
  sendJson,
  httpError,
}) {
  /**
   * Render HTML page for /admin/settings/gmail-settings
   */
  async function sendAdminGmailSettingsPage(admin, response) {
    // Load current email config
    let emailConfig = {
      isEnabled: false,
      provider: 'gmail',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      encryption: 'ssl',
      username: '',
      password: '',
      fromEmail: '',
      fromName: 'Exchange Portal',
    };

    try {
      const row = await db.query("SELECT is_enabled, config_ciphertext FROM admin_service_settings WHERE service_key = 'email'");
      if (row.rowCount > 0) {
        const saved = decryptServiceConfig(row.rows[0].config_ciphertext);
        emailConfig = {
          isEnabled: Boolean(row.rows[0].is_enabled),
          provider: saved.provider || (saved.smtpHost?.includes('gmail') ? 'gmail' : 'custom'),
          smtpHost: saved.smtpHost || 'smtp.gmail.com',
          smtpPort: saved.smtpPort || 465,
          encryption: saved.encryption || 'ssl',
          username: saved.username || '',
          password: saved.password || '',
          fromEmail: saved.fromEmail || saved.username || '',
          fromName: saved.fromName || 'Exchange Portal',
        };
      }
    } catch (err) {
      console.warn('Error loading email settings:', err.message);
    }

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gmail &amp; SMTP Settings - Exchange Admin</title>
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
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .settings-titlebar h3 {
      font-size: 22px;
      font-weight: 700;
      color: #1e3a8a;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .settings-titlebar p {
      color: #64748b;
      margin: 4px 0 0;
      font-size: 13px;
    }

    /* Cards */
    .card-settings {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
      margin-bottom: 24px;
      overflow: hidden;
    }
    .card-settings-header {
      background: #f8fafc;
      padding: 16px 20px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-settings-header h5 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card-settings-body {
      padding: 24px 20px;
    }

    /* Toggle Switch */
    .custom-switch-lg .custom-control-label::before {
      height: 24px;
      width: 48px;
      border-radius: 12px;
    }
    .custom-switch-lg .custom-control-label::after {
      width: 20px;
      height: 20px;
      border-radius: 10px;
    }
    .custom-switch-lg .custom-control-input:checked ~ .custom-control-label::after {
      transform: translateX(24px);
    }
    .custom-switch-lg .custom-control-label {
      padding-top: 2px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
    }

    /* Provider preset selector */
    .provider-selector {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
    }
    .provider-btn {
      flex: 1;
      padding: 12px 16px;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      transition: all 0.2s;
    }
    .provider-btn:hover {
      border-color: #cbd5e1;
      background: #f1f5f9;
    }
    .provider-btn.active {
      border-color: #ea4335;
      background: #fff5f5;
    }
    .provider-btn.active.custom-smtp {
      border-color: #1e3a8a;
      background: #eff6ff;
    }
    .provider-btn .provider-icon {
      font-size: 24px;
    }
    .provider-btn .provider-title {
      font-weight: 700;
      font-size: 14px;
      color: #1e293b;
      display: block;
    }
    .provider-btn .provider-desc {
      font-size: 12px;
      color: #64748b;
      display: block;
    }

    /* Form controls */
    .form-group label {
      font-weight: 600;
      color: #334155;
      font-size: 13px;
      margin-bottom: 6px;
    }
    .form-control {
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      font-size: 14px;
    }
    .form-control:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }
    .input-group-text {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #64748b;
    }

    /* Step box */
    .guide-step {
      display: flex;
      gap: 14px;
      margin-bottom: 16px;
    }
    .guide-step-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #1e3a8a;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
      flex-shrink: 0;
    }
    .guide-step-content {
      font-size: 13px;
      color: #334155;
      line-height: 1.5;
    }
    .guide-step-content strong {
      color: #0f172a;
    }

    .badge-status-on {
      background: #dcfce7;
      color: #166534;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .badge-status-off {
      background: #fee2e2;
      color: #991b1b;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
  </style>
</head>
<body class="app">
  <div class="page">
    <div class="page-main">
      <div class="settings-page container-fluid">
        
        <!-- Header -->
        <div class="settings-titlebar">
          <div>
            <h3><i class="fa fa-envelope-o text-danger"></i> Gmail &amp; SMTP Configuration</h3>
            <p>Setup Gmail SMTP credentials for automated user registration emails, OTP delivery, wallet alerts, and dispute updates.</p>
          </div>
          <div>
            <span id="service-status-badge" class="${emailConfig.isEnabled ? 'badge-status-on' : 'badge-status-off'}">
              <i class="fa fa-circle" style="font-size: 9px;"></i>
              ${emailConfig.isEnabled ? 'Email Service Active' : 'Email Service Inactive'}
            </span>
          </div>
        </div>

        <div class="row">
          <!-- Main Form Column -->
          <div class="col-lg-7">
            <div class="card-settings">
              <div class="card-settings-header">
                <h5><i class="fa fa-cogs text-primary"></i> SMTP Server Details</h5>
                <div class="custom-control custom-switch custom-switch-lg">
                  <input type="checkbox" class="custom-control-input" id="email-is-enabled" ${emailConfig.isEnabled ? 'checked' : ''}>
                  <label class="custom-control-label" for="email-is-enabled">Enable Email Service</label>
                </div>
              </div>
              <div class="card-settings-body">
                
                <!-- Quick Preset Selector -->
                <label class="font-weight-bold text-dark mb-2">Select Provider / Preset:</label>
                <div class="provider-selector">
                  <div class="provider-btn ${emailConfig.provider === 'gmail' ? 'active' : ''}" id="btn-preset-gmail" onclick="selectProvider('gmail')">
                    <div class="provider-icon text-danger"><i class="fa fa-google"></i></div>
                    <div>
                      <span class="provider-title">Google Gmail</span>
                      <span class="provider-desc">smtp.gmail.com (Port 465 SSL)</span>
                    </div>
                  </div>
                  <div class="provider-btn ${emailConfig.provider === 'custom' ? 'active custom-smtp' : ''}" id="btn-preset-custom" onclick="selectProvider('custom')">
                    <div class="provider-icon text-primary"><i class="fa fa-server"></i></div>
                    <div>
                      <span class="provider-title">Custom SMTP Server</span>
                      <span class="provider-desc">cPanel, AWS SES, Zoho, etc.</span>
                    </div>
                  </div>
                </div>

                <form id="form-gmail-settings">
                  <input type="hidden" id="email-provider" value="${escapeHtml(emailConfig.provider)}">

                  <!-- Gmail Address -->
                  <div class="form-group">
                    <label for="email-username">
                      <i class="fa fa-user-circle text-primary mr-1"></i> Gmail / Username Email *
                    </label>
                    <div class="input-group">
                      <div class="input-group-prepend">
                        <span class="input-group-text"><i class="fa fa-at"></i></span>
                      </div>
                      <input type="email" class="form-control" id="email-username" placeholder="e.g. yourcompany@gmail.com" value="${escapeHtml(emailConfig.username)}" required autocomplete="username">
                    </div>
                    <small class="form-text text-muted">Your registered Gmail address used for authenticating with Google SMTP.</small>
                  </div>

                  <!-- Google App Password -->
                  <div class="form-group">
                    <label for="email-password">
                      <i class="fa fa-key text-warning mr-1"></i> Gmail App Password (16 Letters) *
                    </label>
                    <div class="input-group">
                      <div class="input-group-prepend">
                        <span class="input-group-text"><i class="fa fa-lock"></i></span>
                      </div>
                      <input type="password" class="form-control" id="email-password" placeholder="e.g. abcd efgh ijkl mnop" value="${escapeHtml(emailConfig.password)}" required autocomplete="current-password">
                      <div class="input-group-append">
                        <button class="btn btn-outline-secondary" type="button" id="btn-toggle-pwd" onclick="togglePasswordVisibility()">
                          <i class="fa fa-eye" id="eye-icon"></i>
                        </button>
                      </div>
                    </div>
                    <small class="form-text text-muted">Use 16-letter App Password generated from Google Account (see guide on the right).</small>
                  </div>

                  <div class="row">
                    <!-- Sender Name -->
                    <div class="col-md-6 form-group">
                      <label for="email-from-name">
                        <i class="fa fa-tag text-info mr-1"></i> Sender Name (From Name)
                      </label>
                      <input type="text" class="form-control" id="email-from-name" placeholder="Exchange Portal" value="${escapeHtml(emailConfig.fromName)}">
                    </div>

                    <!-- Sender Email -->
                    <div class="col-md-6 form-group">
                      <label for="email-from-address">
                        <i class="fa fa-envelope text-info mr-1"></i> Sender Email (From Email)
                      </label>
                      <input type="email" class="form-control" id="email-from-address" placeholder="e.g. yourcompany@gmail.com" value="${escapeHtml(emailConfig.fromEmail)}">
                    </div>
                  </div>

                  <!-- Advanced SMTP Settings (Collapsible / Toggleable) -->
                  <div class="card bg-light border p-3 my-3">
                    <h6 class="font-weight-bold text-dark mb-2">
                      <i class="fa fa-sliders text-secondary mr-1"></i> SMTP Server Host &amp; Port
                    </h6>
                    <div class="row">
                      <div class="col-md-5 form-group mb-2">
                        <label class="small text-muted mb-1" for="email-smtp-host">SMTP Host</label>
                        <input type="text" class="form-control form-control-sm" id="email-smtp-host" value="${escapeHtml(emailConfig.smtpHost)}" required>
                      </div>
                      <div class="col-md-3 form-group mb-2">
                        <label class="small text-muted mb-1" for="email-smtp-port">Port</label>
                        <input type="number" class="form-control form-control-sm" id="email-smtp-port" value="${emailConfig.smtpPort}" required>
                      </div>
                      <div class="col-md-4 form-group mb-2">
                        <label class="small text-muted mb-1" for="email-encryption">Encryption</label>
                        <select class="form-control form-control-sm" id="email-encryption">
                          <option value="ssl" ${emailConfig.encryption === 'ssl' ? 'selected' : ''}>SSL (Port 465)</option>
                          <option value="tls" ${emailConfig.encryption === 'tls' ? 'selected' : ''}>TLS / STARTTLS (Port 587)</option>
                          <option value="none" ${emailConfig.encryption === 'none' ? 'selected' : ''}>None</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <!-- Alert feedback -->
                  <div id="save-msg-box" style="display: none;" class="alert mb-3" role="alert"></div>

                  <!-- Submit button -->
                  <div class="d-flex justify-content-end mt-4">
                    <button type="submit" class="btn btn-primary btn-lg font-weight-bold px-5" id="btn-save-email">
                      <i class="fa fa-save mr-1"></i> Save Gmail Settings
                    </button>
                  </div>
                </form>

              </div>
            </div>
          </div>

          <!-- Right Column: Live Testing & Guide -->
          <div class="col-lg-5">
            
            <!-- Live Test Email Box -->
            <div class="card-settings">
              <div class="card-settings-header bg-primary text-white">
                <h5 class="text-white"><i class="fa fa-paper-plane"></i> Live SMTP Test</h5>
              </div>
              <div class="card-settings-body">
                <p class="text-muted small mb-3">Send a real test email to verify your Gmail SMTP credentials and ensure mail delivery works without errors.</p>
                <form id="form-test-email">
                  <div class="form-group">
                    <label for="test-to-email">Send Test Email To:</label>
                    <div class="input-group">
                      <input type="email" class="form-control" id="test-to-email" placeholder="Enter recipient email (e.g. your personal email)" required>
                      <div class="input-group-append">
                        <button type="submit" class="btn btn-success font-weight-bold" id="btn-send-test">
                          <i class="fa fa-paper-plane mr-1"></i> Send Test
                        </button>
                      </div>
                    </div>
                  </div>
                  <div id="test-msg-box" style="display: none;" class="alert mt-3 small" role="alert"></div>
                </form>
              </div>
            </div>

            <!-- How to Get Gmail App Password Guide -->
            <div class="card-settings">
              <div class="card-settings-header">
                <h5><i class="fa fa-question-circle text-info"></i> How to Get Gmail App Password</h5>
              </div>
              <div class="card-settings-body">
                <div class="guide-step">
                  <div class="guide-step-num">1</div>
                  <div class="guide-step-content">
                    Go to <strong>Google Account Security</strong>:<br>
                    <a href="https://myaccount.google.com/security" target="_blank" class="text-primary font-weight-bold">
                      myaccount.google.com/security <i class="fa fa-external-link small"></i>
                    </a>
                  </div>
                </div>

                <div class="guide-step">
                  <div class="guide-step-num">2</div>
                  <div class="guide-step-content">
                    Make sure <strong>2-Step Verification</strong> is turned <strong>ON</strong>.
                  </div>
                </div>

                <div class="guide-step">
                  <div class="guide-step-num">3</div>
                  <div class="guide-step-content">
                    Click or search for <strong>App passwords</strong>:<br>
                    <a href="https://myaccount.google.com/apppasswords" target="_blank" class="text-primary font-weight-bold">
                      myaccount.google.com/apppasswords <i class="fa fa-external-link small"></i>
                    </a>
                  </div>
                </div>

                <div class="guide-step">
                  <div class="guide-step-num">4</div>
                  <div class="guide-step-content">
                    Enter App name as <strong>Exchange</strong> and click <strong>Create</strong>.
                  </div>
                </div>

                <div class="guide-step mb-0">
                  <div class="guide-step-num">5</div>
                  <div class="guide-step-content">
                    Google will show a <strong>16-letter password</strong> (e.g., <code>abcd efgh ijkl mnop</code>). Copy and paste it into the <strong>Gmail App Password</strong> field.
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/popper.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>

  <script>
    function selectProvider(type) {
      document.getElementById('email-provider').value = type;
      const btnGmail = document.getElementById('btn-preset-gmail');
      const btnCustom = document.getElementById('btn-preset-custom');
      const hostInput = document.getElementById('email-smtp-host');
      const portInput = document.getElementById('email-smtp-port');
      const encInput = document.getElementById('email-encryption');

      if (type === 'gmail') {
        btnGmail.className = 'provider-btn active';
        btnCustom.className = 'provider-btn';
        hostInput.value = 'smtp.gmail.com';
        portInput.value = '465';
        encInput.value = 'ssl';
      } else {
        btnGmail.className = 'provider-btn';
        btnCustom.className = 'provider-btn active custom-smtp';
        if (hostInput.value === 'smtp.gmail.com') {
          hostInput.value = '';
          portInput.value = '587';
          encInput.value = 'tls';
        }
      }
    }

    function togglePasswordVisibility() {
      const pwdInput = document.getElementById('email-password');
      const eyeIcon = document.getElementById('eye-icon');
      if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        eyeIcon.className = 'fa fa-eye-slash';
      } else {
        pwdInput.type = 'password';
        eyeIcon.className = 'fa fa-eye';
      }
    }

    // Handle Save Form
    document.getElementById('form-gmail-settings').addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-email');
      const msgBox = document.getElementById('save-msg-box');
      
      const isEnabled = document.getElementById('email-is-enabled').checked;
      const provider = document.getElementById('email-provider').value;
      const username = document.getElementById('email-username').value.trim();
      const password = document.getElementById('email-password').value.trim().replace(/\\s+/g, '');
      const fromName = document.getElementById('email-from-name').value.trim() || 'Exchange Portal';
      const fromEmail = document.getElementById('email-from-address').value.trim() || username;
      const smtpHost = document.getElementById('email-smtp-host').value.trim() || (provider === 'gmail' ? 'smtp.gmail.com' : '');
      const smtpPort = Number(document.getElementById('email-smtp-port').value) || 465;
      const encryption = document.getElementById('email-encryption').value;

      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving Settings...';
      msgBox.style.display = 'none';

      try {
        const res = await fetch('/api/admin/settings/services/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            isEnabled,
            provider,
            username,
            password,
            fromName,
            fromEmail,
            smtpHost,
            smtpPort,
            encryption,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to save settings.');

        msgBox.className = 'alert alert-success';
        msgBox.innerHTML = '<i class="fa fa-check-circle mr-1"></i> ' + (data.message || 'Gmail SMTP Settings saved successfully!');
        msgBox.style.display = 'block';

        // Update badge
        const badge = document.getElementById('service-status-badge');
        if (isEnabled) {
          badge.className = 'badge-status-on';
          badge.innerHTML = '<i class="fa fa-circle" style="font-size: 9px;"></i> Email Service Active';
        } else {
          badge.className = 'badge-status-off';
          badge.innerHTML = '<i class="fa fa-circle" style="font-size: 9px;"></i> Email Service Inactive';
        }

      } catch (err) {
        msgBox.className = 'alert alert-danger';
        msgBox.innerHTML = '<i class="fa fa-exclamation-triangle mr-1"></i> ' + err.message;
        msgBox.style.display = 'block';
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa fa-save mr-1"></i> Save Gmail Settings';
      }
    });

    // Handle Test Email
    document.getElementById('form-test-email').addEventListener('submit', async (e) => {
      e.preventDefault();
      const testBtn = document.getElementById('btn-send-test');
      const testMsgBox = document.getElementById('test-msg-box');
      const toEmail = document.getElementById('test-to-email').value.trim();

      const provider = document.getElementById('email-provider').value;
      const username = document.getElementById('email-username').value.trim();
      const password = document.getElementById('email-password').value.trim().replace(/\\s+/g, '');
      const fromName = document.getElementById('email-from-name').value.trim() || 'Exchange Portal';
      const fromEmail = document.getElementById('email-from-address').value.trim() || username;
      const smtpHost = document.getElementById('email-smtp-host').value.trim() || (provider === 'gmail' ? 'smtp.gmail.com' : '');
      const smtpPort = Number(document.getElementById('email-smtp-port').value) || 465;
      const encryption = document.getElementById('email-encryption').value;

      testBtn.disabled = true;
      testBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Testing...';
      testMsgBox.style.display = 'none';

      try {
        const res = await fetch('/api/admin/settings/services/email/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            toEmail,
            provider,
            username,
            password,
            fromName,
            fromEmail,
            smtpHost,
            smtpPort,
            encryption,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'SMTP Test failed.');

        testMsgBox.className = 'alert alert-success mt-3 small';
        testMsgBox.innerHTML = '<strong><i class="fa fa-check-circle"></i> Success:</strong> ' + data.message;
        testMsgBox.style.display = 'block';
      } catch (err) {
        testMsgBox.className = 'alert alert-danger mt-3 small';
        testMsgBox.innerHTML = '<strong><i class="fa fa-times-circle"></i> Error:</strong> ' + err.message;
        testMsgBox.style.display = 'block';
      } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send Test';
      }
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
    response.end(await addPanelChrome(html, { role: 'admin' }));
  }

  return {
    sendAdminGmailSettingsPage,
  };
};
