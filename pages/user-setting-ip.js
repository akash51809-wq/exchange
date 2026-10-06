'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createUserSettingIpPage({ db, decryptMobile }) {

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

  async function sendUserSettingIpPage(user, response) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');

    // Fetch user's registered email and mobile (masked)
    let userMobile = '';
    const userRowRes = await db.query('SELECT email, phone_ciphertext FROM users WHERE id = $1', [user.id]);
    const userRow = userRowRes.rows[0];
    if (userRow?.phone_ciphertext && decryptMobile) {
      try {
        const rawPhone = decryptMobile(userRow.phone_ciphertext);
        if (rawPhone && rawPhone.length >= 10) {
          userMobile = rawPhone.slice(0, 2) + '••••••' + rawPhone.slice(-2);
        }
      } catch {}
    }
    const maskedEmail = (userRow?.email || '').replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + '•••' + c);

    // Fetch whitelisted IPs
    const ipRes = await db.query(
      `SELECT id, ip_address, status, created_at
       FROM user_whitelisted_ips
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [user.id],
    );

    const rowsHtml = ipRes.rows.map((row, idx) => {
      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td class="font-monospace font-weight-bold text-primary" style="font-size:14px;">${escapeHtml(row.ip_address)}</td>
          <td class="text-center">
            <span class="badge badge-success" style="background:#22c55e;"><i class="fa fa-shield"></i> Approved & Active</span>
          </td>
          <td class="small text-muted font-monospace">${escapeHtml(formatDateTime(row.created_at))}</td>
          <td class="text-center">
            <button type="button" class="btn btn-xs btn-outline-danger btn-delete-ip" data-id="${escapeHtml(row.id)}" data-ip="${escapeHtml(row.ip_address)}">
              <i class="fa fa-trash"></i> Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IP Whitelist Setting - Exchange</title>
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
            <h4 class="page-title mb-0 text-dark"><i class="fa fa-shield mr-2"></i> Buyer IP Whitelist Setting</h4>
            <div class="small text-muted">Whitelisted IPs are required for secure API Buy Requests. Protected with dual WhatsApp & Email OTP verification.</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm font-weight-bold" data-toggle="modal" data-target="#addIpModal">
            <i class="fa fa-plus-circle mr-1"></i> Add Software / Server IP
          </button>
        </div>

        <div id="topAlert" class="alert alert-success font-weight-bold" style="display:none;"></div>
        <div id="topError" class="alert alert-danger font-weight-bold" style="display:none;"></div>

        <div class="card shadow-sm border-0">
          <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center">
            <h5 class="card-title mb-0 text-dark" style="font-size:15px;">
              <i class="fa fa-list mr-1"></i> Approved IP Addresses (${ipRes.rowCount})
            </h5>
            <div class="small text-muted">
              ${ipRes.rowCount === 0
                ? '<span class="badge badge-warning text-dark"><i class="fa fa-info-circle"></i> No IP added: Buy requests allowed from any IP</span>'
                : '<span class="badge badge-success" style="background:#22c55e;"><i class="fa fa-lock"></i> Strict Protection: Only whitelisted IPs can make buy requests</span>'}
            </div>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-hover table-sm mb-0">
                <thead class="thead-light">
                  <tr>
                    <th class="text-center" style="width:40px;">#</th>
                    <th>IP Address</th>
                    <th class="text-center">Status</th>
                    <th>Added On</th>
                    <th class="text-center" style="width:100px;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="5" class="text-center py-4 text-muted">No IP address configured. Click "Add Software / Server IP" to secure your buy requests.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- Add IP Modal -->
  <div class="modal fade" id="addIpModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <form id="addIpForm">
          <div class="modal-header bg-primary text-white py-2">
            <h5 class="modal-title" style="font-size:15px;"><i class="fa fa-plus mr-1"></i> Add New IP Address</h5>
            <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
          </div>
          <div class="modal-body">
            <div id="modalAddError" class="alert alert-danger py-2 small" style="display:none;"></div>
            <div id="modalAddSuccess" class="alert alert-success py-2 small" style="display:none;"></div>

            <div class="form-group mb-3">
              <label class="small font-weight-bold">Software / Server IP Address <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm font-monospace" id="newIpAddress" placeholder="e.g. 103.15.22.45" required>
            </div>

            <div class="alert alert-light border small py-2 mb-3">
              <i class="fa fa-lock text-primary mr-1"></i> A 6-digit OTP will be sent to your registered:
              <br>• WhatsApp: <strong>${escapeHtml(userMobile || 'Registered Number')}</strong>
              <br>• Email: <strong>${escapeHtml(maskedEmail || 'Registered Email')}</strong>
            </div>

            <div class="mb-3">
              <button type="button" class="btn btn-outline-primary btn-sm btn-block font-weight-bold" id="btnSendAddOtp">
                <i class="fa fa-paper-plane mr-1"></i> Send OTP to Email & WhatsApp
              </button>
            </div>

            <div class="form-group mb-2" id="addOtpSection" style="display:none;">
              <label class="small font-weight-bold">Enter 6-Digit Verification OTP <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm text-center font-monospace font-weight-bold" id="addOtpInput" maxlength="6" placeholder="• • • • • •" style="letter-spacing:4px;font-size:18px;">
            </div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm font-weight-bold" id="btnConfirmAddIp" disabled>
              <i class="fa fa-check mr-1"></i> Verify OTP & Approve IP
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- Delete IP Modal -->
  <div class="modal fade" id="deleteIpModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <form id="deleteIpForm">
          <input type="hidden" id="delIpId">
          <input type="hidden" id="delIpAddress">
          <div class="modal-header bg-danger text-white py-2">
            <h5 class="modal-title" style="font-size:15px;"><i class="fa fa-trash mr-1"></i> Delete IP Address</h5>
            <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
          </div>
          <div class="modal-body">
            <div id="modalDelError" class="alert alert-danger py-2 small" style="display:none;"></div>
            <div id="modalDelSuccess" class="alert alert-success py-2 small" style="display:none;"></div>

            <p class="small mb-2">Are you sure you want to remove IP: <strong id="delIpDisp" class="font-monospace text-danger"></strong>?</p>

            <div class="alert alert-light border small py-2 mb-3">
              <i class="fa fa-lock text-danger mr-1"></i> For security, a 6-digit OTP will be sent to your WhatsApp and Email to authorize this deletion.
            </div>

            <div class="mb-3">
              <button type="button" class="btn btn-outline-danger btn-sm btn-block font-weight-bold" id="btnSendDelOtp">
                <i class="fa fa-paper-plane mr-1"></i> Send OTP to Email & WhatsApp
              </button>
            </div>

            <div class="form-group mb-2" id="delOtpSection" style="display:none;">
              <label class="small font-weight-bold">Enter 6-Digit OTP <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm text-center font-monospace font-weight-bold" id="delOtpInput" maxlength="6" placeholder="• • • • • •" style="letter-spacing:4px;font-size:18px;">
            </div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-danger btn-sm font-weight-bold" id="btnConfirmDelIp" disabled>
              <i class="fa fa-trash mr-1"></i> Verify OTP & Delete IP
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

    // Add IP Elements
    const btnSendAddOtp = document.getElementById('btnSendAddOtp');
    const addOtpSection = document.getElementById('addOtpSection');
    const addOtpInput = document.getElementById('addOtpInput');
    const btnConfirmAddIp = document.getElementById('btnConfirmAddIp');
    const modalAddError = document.getElementById('modalAddError');
    const modalAddSuccess = document.getElementById('modalAddSuccess');
    const newIpAddress = document.getElementById('newIpAddress');

    btnSendAddOtp.addEventListener('click', async () => {
      modalAddError.style.display = 'none';
      modalAddSuccess.style.display = 'none';

      const ip = newIpAddress.value.trim();
      if (!ip) {
        modalAddError.textContent = 'Please enter an IP address first.';
        modalAddError.style.display = 'block';
        return;
      }

      btnSendAddOtp.disabled = true;
      btnSendAddOtp.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Sending OTP...';

      try {
        const res = await fetch('/api/user/ip/send-otp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ action: 'add', ip }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to send OTP');

        modalAddSuccess.textContent = '✓ 6-Digit OTP sent to both your WhatsApp and Email!';
        modalAddSuccess.style.display = 'block';
        addOtpSection.style.display = 'block';
        btnConfirmAddIp.disabled = false;
        btnSendAddOtp.innerHTML = '<i class="fa fa-refresh mr-1"></i> Resend OTP';
      } catch (err) {
        modalAddError.textContent = err.message;
        modalAddError.style.display = 'block';
        btnSendAddOtp.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send OTP to Email & WhatsApp';
      } finally {
        btnSendAddOtp.disabled = false;
      }
    });

    document.getElementById('addIpForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      modalAddError.style.display = 'none';

      const ip = newIpAddress.value.trim();
      const otp = addOtpInput.value.trim();
      if (!ip || otp.length !== 6) {
        modalAddError.textContent = 'Please enter a valid 6-digit OTP.';
        modalAddError.style.display = 'block';
        return;
      }

      btnConfirmAddIp.disabled = true;
      btnConfirmAddIp.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Verifying...';

      try {
        const res = await fetch('/api/user/ip/verify-add', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ ip, otp }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Verification failed');

        $('#addIpModal').modal('hide');
        topAlert.textContent = '✓ IP ' + ip + ' approved and activated successfully!';
        topAlert.style.display = 'block';
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        modalAddError.textContent = err.message;
        modalAddError.style.display = 'block';
      } finally {
        btnConfirmAddIp.disabled = false;
        btnConfirmAddIp.innerHTML = '<i class="fa fa-check mr-1"></i> Verify OTP & Approve IP';
      }
    });

    // Delete IP Elements
    const delModal = $('#deleteIpModal');
    const delIpId = document.getElementById('delIpId');
    const delIpAddress = document.getElementById('delIpAddress');
    const delIpDisp = document.getElementById('delIpDisp');
    const btnSendDelOtp = document.getElementById('btnSendDelOtp');
    const delOtpSection = document.getElementById('delOtpSection');
    const delOtpInput = document.getElementById('delOtpInput');
    const btnConfirmDelIp = document.getElementById('btnConfirmDelIp');
    const modalDelError = document.getElementById('modalDelError');
    const modalDelSuccess = document.getElementById('modalDelSuccess');

    document.querySelectorAll('.btn-delete-ip').forEach(btn => {
      btn.addEventListener('click', () => {
        delIpId.value = btn.dataset.id;
        delIpAddress.value = btn.dataset.ip;
        delIpDisp.textContent = btn.dataset.ip;
        delOtpInput.value = '';
        delOtpSection.style.display = 'none';
        btnConfirmDelIp.disabled = true;
        modalDelError.style.display = 'none';
        modalDelSuccess.style.display = 'none';
        btnSendDelOtp.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send OTP to Email & WhatsApp';
        delModal.modal('show');
      });
    });

    btnSendDelOtp.addEventListener('click', async () => {
      modalDelError.style.display = 'none';
      modalDelSuccess.style.display = 'none';

      btnSendDelOtp.disabled = true;
      btnSendDelOtp.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Sending OTP...';

      try {
        const res = await fetch('/api/user/ip/send-otp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ action: 'delete', ipId: delIpId.value }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to send OTP');

        modalDelSuccess.textContent = '✓ 6-Digit OTP sent to both your WhatsApp and Email!';
        modalDelSuccess.style.display = 'block';
        delOtpSection.style.display = 'block';
        btnConfirmDelIp.disabled = false;
        btnSendDelOtp.innerHTML = '<i class="fa fa-refresh mr-1"></i> Resend OTP';
      } catch (err) {
        modalDelError.textContent = err.message;
        modalDelError.style.display = 'block';
        btnSendDelOtp.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send OTP to Email & WhatsApp';
      } finally {
        btnSendDelOtp.disabled = false;
      }
    });

    document.getElementById('deleteIpForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      modalDelError.style.display = 'none';

      const id = delIpId.value;
      const otp = delOtpInput.value.trim();
      if (!id || otp.length !== 6) {
        modalDelError.textContent = 'Please enter a valid 6-digit OTP.';
        modalDelError.style.display = 'block';
        return;
      }

      btnConfirmDelIp.disabled = true;
      btnConfirmDelIp.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Deleting...';

      try {
        const res = await fetch('/api/user/ip/verify-delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ id, otp }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Deletion failed');

        delModal.modal('hide');
        topAlert.textContent = '✓ IP address deleted successfully!';
        topAlert.style.display = 'block';
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        modalDelError.textContent = err.message;
        modalDelError.style.display = 'block';
      } finally {
        btnConfirmDelIp.disabled = false;
        btnConfirmDelIp.innerHTML = '<i class="fa fa-trash mr-1"></i> Verify OTP & Delete IP';
      }
    });
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

  return { sendUserSettingIpPage };
};
