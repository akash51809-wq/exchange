'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createUserSettingCallbackPage({ db, decryptMobile }) {

  async function sendUserSettingCallbackPage(user, response) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');

    // Fetch user details including callback_url, email, phone
    const userRes = await db.query('SELECT callback_url, email, phone_ciphertext FROM users WHERE id = $1', [user.id]);
    const userRow = userRes.rows[0];
    const callbackUrl = userRow?.callback_url || '';

    let userMobile = '';
    if (userRow?.phone_ciphertext && decryptMobile) {
      try {
        const rawPhone = decryptMobile(userRow.phone_ciphertext);
        if (rawPhone && rawPhone.length >= 10) {
          userMobile = rawPhone.slice(0, 2) + '••••••' + rawPhone.slice(-2);
        }
      } catch {}
    }
    const maskedEmail = (userRow?.email || '').replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + '•••' + c);

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Callback URL Setting - Exchange</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 12px 18px 40px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      <div class="page-container">

        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h4 class="page-title mb-0 text-dark"><i class="fa fa-link mr-2"></i> Buyer Callback URL Setting</h4>
            <div class="small text-muted">Receive real-time HTTP webhooks whenever buy recharges transition status. Protected by WhatsApp & Email OTP.</div>
          </div>
        </div>

        <div id="topAlert" class="alert alert-success font-weight-bold" style="display:none;"></div>
        <div id="topError" class="alert alert-danger font-weight-bold" style="display:none;"></div>

        <div class="row">
          <div class="col-lg-7 col-md-12 mb-3">
            <div class="card shadow-sm border-0">
              <div class="card-header bg-primary text-white py-2">
                <h5 class="card-title mb-0" style="font-size:15px;"><i class="fa fa-cog mr-1"></i> Configure Callback Webhook URL</h5>
              </div>
              <div class="card-body">
                <form id="callbackForm">
                  <div class="form-group mb-3">
                    <label class="small font-weight-bold">Active Callback Webhook URL</label>
                    <div class="input-group">
                      <div class="input-group-prepend"><span class="input-group-text"><i class="fa fa-globe"></i></span></div>
                      <input type="url" class="form-control font-monospace" id="cbUrlInput" value="${escapeHtml(callbackUrl)}" placeholder="https://yourdomain.com/api/callback" required>
                    </div>
                    <small class="text-muted">Must begin with https:// or http://</small>
                  </div>

                  <div class="alert alert-light border small py-2 mb-3">
                    <i class="fa fa-lock text-primary mr-1"></i> A 6-digit OTP will be sent to both your registered:
                    <br>• WhatsApp: <strong>${escapeHtml(userMobile || 'Registered Number')}</strong>
                    <br>• Email: <strong>${escapeHtml(maskedEmail || 'Registered Email')}</strong>
                  </div>

                  <div class="mb-3">
                    <button type="button" class="btn btn-outline-primary btn-sm btn-block font-weight-bold" id="btnSendCbOtp">
                      <i class="fa fa-paper-plane mr-1"></i> Send OTP to Email & WhatsApp
                    </button>
                  </div>

                  <div class="form-group mb-3" id="cbOtpSection" style="display:none;">
                    <label class="small font-weight-bold">Enter 6-Digit Verification OTP <span class="text-danger">*</span></label>
                    <input type="text" class="form-control form-control-sm text-center font-monospace font-weight-bold" id="cbOtpInput" maxlength="6" placeholder="• • • • • •" style="letter-spacing:4px;font-size:18px;">
                  </div>

                  <div class="d-flex gap-2">
                    <button type="submit" class="btn btn-primary font-weight-bold flex-fill" id="btnSaveCallback" disabled>
                      <i class="fa fa-check-circle mr-1"></i> Verify OTP & Save Callback URL
                    </button>
                    ${callbackUrl ? `
                      <button type="button" class="btn btn-outline-danger font-weight-bold ml-2" id="btnDeleteCallback">
                        <i class="fa fa-trash mr-1"></i> Delete
                      </button>
                    ` : ''}
                  </div>
                </form>
              </div>
            </div>
          </div>

          <div class="col-lg-5 col-md-12 mb-3">
            <div class="card shadow-sm border-0">
              <div class="card-header bg-dark text-white py-2">
                <h5 class="card-title mb-0" style="font-size:15px;"><i class="fa fa-info-circle mr-1"></i> Webhook Notification Format</h5>
              </div>
              <div class="card-body small">
                <p>When an order changes status (SUCCESS, PENDING, FAILED), a <code>POST</code> request is dispatched to your callback URL with the following JSON payload:</p>
                <pre class="bg-light p-2 rounded border font-monospace text-dark" style="font-size:11px;">{
  "status": "SUCCESS",
  "order_id": "9b1deb4d-3b7d-4bad...",
  "ref_id": "CLIENT_TXN_12345",
  "operator_ref": "AIRTEL123456",
  "number": "9876543210",
  "amount": "299.00",
  "closing_balance": "1450.50",
  "timestamp": "2026-10-06T12:00:00Z"
}</pre>
                <div class="text-muted">Ensure your server responds with HTTP <code>200 OK</code> within 5 seconds.</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- Delete Callback Modal -->
  <div class="modal fade" id="delCbModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <form id="delCbForm">
          <div class="modal-header bg-danger text-white py-2">
            <h5 class="modal-title" style="font-size:15px;"><i class="fa fa-trash mr-1"></i> Delete Callback URL</h5>
            <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
          </div>
          <div class="modal-body">
            <div id="modalDelCbError" class="alert alert-danger py-2 small" style="display:none;"></div>
            <div id="modalDelCbSuccess" class="alert alert-success py-2 small" style="display:none;"></div>

            <p class="small mb-2">Are you sure you want to delete your configured callback webhook URL?</p>

            <div class="alert alert-light border small py-2 mb-3">
              <i class="fa fa-lock text-danger mr-1"></i> For your security, a 6-digit OTP will be sent to your WhatsApp and Email to authorize this deletion.
            </div>

            <div class="mb-3">
              <button type="button" class="btn btn-outline-danger btn-sm btn-block font-weight-bold" id="btnSendDelCbOtp">
                <i class="fa fa-paper-plane mr-1"></i> Send OTP to Email & WhatsApp
              </button>
            </div>

            <div class="form-group mb-2" id="delCbOtpSection" style="display:none;">
              <label class="small font-weight-bold">Enter 6-Digit OTP <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm text-center font-monospace font-weight-bold" id="delCbOtpInput" maxlength="6" placeholder="• • • • • •" style="letter-spacing:4px;font-size:18px;">
            </div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-danger btn-sm font-weight-bold" id="btnConfirmDelCb" disabled>
              <i class="fa fa-trash mr-1"></i> Verify OTP & Delete Callback
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
  <script src="/assets/plugins/horizontal-menu/horizontal.js"></script>
  <script src="/auth-client.js"></script>
  <script>
  (function() {
    const topAlert = document.getElementById('topAlert');
    const topError = document.getElementById('topError');

    const cbUrlInput = document.getElementById('cbUrlInput');
    const btnSendCbOtp = document.getElementById('btnSendCbOtp');
    const cbOtpSection = document.getElementById('cbOtpSection');
    const cbOtpInput = document.getElementById('cbOtpInput');
    const btnSaveCallback = document.getElementById('btnSaveCallback');

    btnSendCbOtp.addEventListener('click', async () => {
      topError.style.display = 'none';
      topAlert.style.display = 'none';

      const url = cbUrlInput.value.trim();
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        topError.textContent = 'Please enter a valid HTTP/HTTPS callback URL.';
        topError.style.display = 'block';
        return;
      }

      btnSendCbOtp.disabled = true;
      btnSendCbOtp.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Sending OTP...';

      try {
        const res = await fetch('/api/user/callback/send-otp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ action: 'save', callbackUrl: url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to send OTP');

        topAlert.textContent = '✓ 6-Digit OTP sent to both your WhatsApp and Email!';
        topAlert.style.display = 'block';
        cbOtpSection.style.display = 'block';
        btnSaveCallback.disabled = false;
        btnSendCbOtp.innerHTML = '<i class="fa fa-refresh mr-1"></i> Resend OTP';
      } catch (err) {
        topError.textContent = err.message;
        topError.style.display = 'block';
        btnSendCbOtp.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send OTP to Email & WhatsApp';
      } finally {
        btnSendCbOtp.disabled = false;
      }
    });

    document.getElementById('callbackForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      topError.style.display = 'none';

      const url = cbUrlInput.value.trim();
      const otp = cbOtpInput.value.trim();

      if (!url || otp.length !== 6) {
        topError.textContent = 'Please enter a valid URL and 6-digit OTP.';
        topError.style.display = 'block';
        return;
      }

      btnSaveCallback.disabled = true;
      btnSaveCallback.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Verifying...';

      try {
        const res = await fetch('/api/user/callback/verify-save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ callbackUrl: url, otp }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Verification failed');

        topAlert.textContent = '✓ Callback URL verified and saved successfully!';
        topAlert.style.display = 'block';
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        topError.textContent = err.message;
        topError.style.display = 'block';
      } finally {
        btnSaveCallback.disabled = false;
        btnSaveCallback.innerHTML = '<i class="fa fa-check-circle mr-1"></i> Verify OTP & Save Callback URL';
      }
    });

    // Delete Callback Logic
    const btnDel = document.getElementById('btnDeleteCallback');
    const delModal = $('#delCbModal');
    const btnSendDelCbOtp = document.getElementById('btnSendDelCbOtp');
    const delCbOtpSection = document.getElementById('delCbOtpSection');
    const delCbOtpInput = document.getElementById('delCbOtpInput');
    const btnConfirmDelCb = document.getElementById('btnConfirmDelCb');
    const modalDelCbError = document.getElementById('modalDelCbError');
    const modalDelCbSuccess = document.getElementById('modalDelCbSuccess');

    if (btnDel) {
      btnDel.addEventListener('click', () => {
        delCbOtpInput.value = '';
        delCbOtpSection.style.display = 'none';
        btnConfirmDelCb.disabled = true;
        modalDelCbError.style.display = 'none';
        modalDelCbSuccess.style.display = 'none';
        btnSendDelCbOtp.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send OTP to Email & WhatsApp';
        delModal.modal('show');
      });
    }

    if (btnSendDelCbOtp) {
      btnSendDelCbOtp.addEventListener('click', async () => {
        modalDelCbError.style.display = 'none';
        modalDelCbSuccess.style.display = 'none';

        btnSendDelCbOtp.disabled = true;
        btnSendDelCbOtp.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Sending OTP...';

        try {
          const res = await fetch('/api/user/callback/send-otp', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ action: 'delete' }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || data.message || 'Failed to send OTP');

          modalDelCbSuccess.textContent = '✓ 6-Digit OTP sent to both your WhatsApp and Email!';
          modalDelCbSuccess.style.display = 'block';
          delCbOtpSection.style.display = 'block';
          btnConfirmDelCb.disabled = false;
          btnSendDelCbOtp.innerHTML = '<i class="fa fa-refresh mr-1"></i> Resend OTP';
        } catch (err) {
          modalDelCbError.textContent = err.message;
          modalDelCbError.style.display = 'block';
          btnSendDelCbOtp.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send OTP to Email & WhatsApp';
        } finally {
          btnSendDelCbOtp.disabled = false;
        }
      });
    }

    if (document.getElementById('delCbForm')) {
      document.getElementById('delCbForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        modalDelCbError.style.display = 'none';

        const otp = delCbOtpInput.value.trim();
        if (otp.length !== 6) {
          modalDelCbError.textContent = 'Please enter a valid 6-digit OTP.';
          modalDelCbError.style.display = 'block';
          return;
        }

        btnConfirmDelCb.disabled = true;
        btnConfirmDelCb.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Deleting...';

        try {
          const res = await fetch('/api/user/callback/verify-delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ otp }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || data.message || 'Deletion failed');

          delModal.modal('hide');
          topAlert.textContent = '✓ Callback URL removed successfully!';
          topAlert.style.display = 'block';
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          modalDelCbError.textContent = err.message;
          modalDelCbError.style.display = 'block';
        } finally {
          btnConfirmDelCb.disabled = false;
          btnConfirmDelCb.innerHTML = '<i class="fa fa-trash mr-1"></i> Verify OTP & Delete Callback';
        }
      });
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
    response.end(await addPanelChrome(html, { role: 'user', userId: user.id, db }));
  }

  return { sendUserSettingCallbackPage };
};
