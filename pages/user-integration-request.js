'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const { getWalletMode } = require('../lib/wallet-helper');

module.exports = function createUserIntegrationRequestPage({ db }) {
  function formatDateTime(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return String(isoString).replace('T', ' ').slice(0, 19);
    }
  }

  async function sendUserIntegrationRequestPage(user, response) {
    const walletMode = await getWalletMode(db);
    const navigationHtml = renderUserNavigation(walletMode, '/help/integration-requests');

    // Fetch existing requests submitted by this user
    const listRes = await db.query(
      `SELECT id, api_website, api_username, support_number, server_ip, api_token, api_pin,
              api_remark, doc_name, status, admin_note, created_at
       FROM seller_api_integration_requests
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [user.id]
    ).catch(() => ({ rows: [] }));

    const rows = listRes.rows || [];
    const rowsHtml = rows.length > 0
      ? rows.map((r, idx) => {
        let badge = '<span class="badge badge-warning text-dark px-2 py-1"><i class="fa fa-clock mr-1"></i> Pending</span>';
        if (r.status === 'in_progress') {
          badge = '<span class="badge badge-info px-2 py-1"><i class="fa fa-spinner fa-spin mr-1"></i> In Progress</span>';
        } else if (r.status === 'approved') {
          badge = '<span class="badge badge-success px-2 py-1"><i class="fa fa-check-circle mr-1"></i> Approved</span>';
        } else if (r.status === 'rejected') {
          badge = '<span class="badge badge-danger px-2 py-1"><i class="fa fa-times-circle mr-1"></i> Rejected</span>';
        }

        const docLink = r.doc_name
          ? `<a href="/api/integration-requests/${r.id}/document" class="btn btn-sm btn-outline-primary py-0 px-2" target="_blank" rel="noopener">
              <i class="fa fa-file-arrow-down mr-1"></i> Download
            </a>`
          : '<span class="text-muted small">No file</span>';

        return `
          <tr>
            <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
            <td class="small text-muted font-monospace">${escapeHtml(formatDateTime(r.created_at))}</td>
            <td class="font-weight-bold text-primary font-monospace">${escapeHtml(r.api_website)}</td>
            <td class="font-weight-bold text-dark font-monospace">${escapeHtml(r.api_username)}</td>
            <td class="font-monospace text-muted">${escapeHtml(r.server_ip || '—')}</td>
            <td class="text-center">${docLink}</td>
            <td class="text-center">${badge}</td>
            <td class="small text-dark">${escapeHtml(r.admin_note || '—')}</td>
          </tr>
        `;
      }).join('')
      : '<tr><td colspan="8" class="text-center py-4 text-muted"><i class="fa fa-inbox mb-1 d-block" style="font-size: 22px;"></i>No integration requests submitted yet.</td></tr>';

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Seller API Integration Requests - Exchange</title>
  <link rel="icon" type="image/x-icon" href="/api/favicon">
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; }
    .int-card { border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.04); border: 1px solid #e2e8f0; background: #ffffff; }
    .font-monospace { font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    ${navigationHtml}

    <div class="container-fluid px-3 py-4">
      <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h4 class="font-weight-bold text-dark mb-1">
            <i class="fa fa-plug-circle-plus text-primary mr-2"></i> Seller API Integration Requests
          </h4>
          <p class="text-muted mb-0 small">
            Submit your supplier / seller API credentials and documentation to the administration team for swift platform integration.
          </p>
        </div>
      </div>

      <div class="row">
        <!-- Integration Form Card -->
        <div class="col-xl-5 col-lg-6 mb-4">
          <div class="card int-card h-100">
            <div class="card-header bg-white py-3 border-bottom">
              <h6 class="font-weight-bold text-dark mb-0">
                <i class="fa fa-paper-plane text-primary mr-2"></i> New Integration Request
              </h6>
            </div>
            <div class="card-body p-4">
              <div id="formAlert" class="alert alert-danger py-2 small" style="display:none;" role="alert"></div>
              <div id="formSuccess" class="alert alert-success py-2 small" style="display:none;" role="alert"></div>

              <form id="integrationForm">
                <div class="form-group mb-3">
                  <label class="font-weight-bold text-dark small">API Website <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="apiWebsite" placeholder="https://api.example.com or portal website" required>
                </div>

                <div class="form-row">
                  <div class="form-group col-md-6 mb-3">
                    <label class="font-weight-bold text-dark small">API Username / ID <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" id="apiUsername" placeholder="e.g. client_user_12" required>
                  </div>
                  <div class="form-group col-md-6 mb-3">
                    <label class="font-weight-bold text-dark small">Website Password</label>
                    <input type="text" class="form-control" id="websitePassword" placeholder="Portal password">
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group col-md-6 mb-3">
                    <label class="font-weight-bold text-dark small">Support Number</label>
                    <input type="text" class="form-control" id="supportNumber" placeholder="e.g. +91 9876543210">
                  </div>
                  <div class="form-group col-md-6 mb-3">
                    <label class="font-weight-bold text-dark small">Server IP Address</label>
                    <input type="text" class="form-control font-monospace" id="serverIp" placeholder="e.g. 103.21.244.0">
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group col-md-6 mb-3">
                    <label class="font-weight-bold text-dark small">API Token</label>
                    <input type="text" class="form-control font-monospace" id="apiToken" placeholder="Auth token or API key">
                  </div>
                  <div class="form-group col-md-6 mb-3">
                    <label class="font-weight-bold text-dark small">API Pin</label>
                    <input type="text" class="form-control font-monospace" id="apiPin" placeholder="Security PIN if any">
                  </div>
                </div>

                <div class="form-group mb-3">
                  <label class="font-weight-bold text-dark small">API Remark</label>
                  <textarea class="form-control" id="apiRemark" rows="2" placeholder="Any special instructions, operator codes, or notes..."></textarea>
                </div>

                <div class="form-group mb-4">
                  <label class="font-weight-bold text-dark small">API Document (PDF / DOC / TXT / ZIP / Image, max 5 MB)</label>
                  <input type="file" class="form-control-file" id="apiDocument" accept=".pdf,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg">
                  <small class="form-text text-muted">Upload API documentation manual or postman collection.</small>
                </div>

                <button type="submit" class="btn btn-primary btn-block font-weight-bold py-2 shadow-sm" id="btnSubmit">
                  <i class="fa fa-send mr-1"></i> Submit Integration Request
                </button>
              </form>
            </div>
          </div>
        </div>

        <!-- Submitted Requests List Card -->
        <div class="col-xl-7 col-lg-6 mb-4">
          <div class="card int-card h-100">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <h6 class="font-weight-bold text-dark mb-0">
                <i class="fa fa-list-check text-success mr-2"></i> My Integration Requests
              </h6>
              <span class="badge badge-light border text-muted">${rows.length} Total</span>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-hover table-striped mb-0 text-nowrap">
                  <thead class="bg-light small text-muted font-weight-bold text-uppercase">
                    <tr>
                      <th class="text-center" style="width: 45px;">#</th>
                      <th>Date</th>
                      <th>API Website</th>
                      <th>Username</th>
                      <th>Server IP</th>
                      <th class="text-center">Doc</th>
                      <th class="text-center">Status</th>
                      <th>Admin Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml}
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

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="/auth-client.js"></script>
<script>
document.getElementById('integrationForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const alertEl = document.getElementById('formAlert');
  const successEl = document.getElementById('formSuccess');
  const btn = document.getElementById('btnSubmit');

  alertEl.style.display = 'none';
  successEl.style.display = 'none';

  const apiWebsite = document.getElementById('apiWebsite').value.trim();
  const apiUsername = document.getElementById('apiUsername').value.trim();
  const websitePassword = document.getElementById('websitePassword').value.trim();
  const supportNumber = document.getElementById('supportNumber').value.trim();
  const serverIp = document.getElementById('serverIp').value.trim();
  const apiToken = document.getElementById('apiToken').value.trim();
  const apiPin = document.getElementById('apiPin').value.trim();
  const apiRemark = document.getElementById('apiRemark').value.trim();

  let documentData = null;
  const fileInput = document.getElementById('apiDocument');
  if (fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
      alertEl.textContent = 'Uploaded document must be under 5 MB.';
      alertEl.style.display = 'block';
      return;
    }
    const b64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(String(reader.result).split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    documentData = {
      name: file.name,
      mime: file.type,
      base64: b64,
    };
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Submitting...';

  try {
    const res = await fetch('/api/integration-requests', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiWebsite,
        apiUsername,
        websitePassword,
        supportNumber,
        serverIp,
        apiToken,
        apiPin,
        apiRemark,
        document: documentData,
      }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || result.message || 'Failed to submit integration request.');

    successEl.textContent = 'Integration request submitted successfully! Admin will review and configure your API.';
    successEl.style.display = 'block';
    document.getElementById('integrationForm').reset();
    setTimeout(() => location.reload(), 1500);
  } catch (err) {
    alertEl.textContent = err.message;
    alertEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-send mr-1"></i> Submit Integration Request';
  }
});
</script>
</body>
</html>`;

    const fullHtml = useFullWidthContainers(html);
    const framedHtml = await addPanelChrome(fullHtml, {
      role: 'user',
      userId: user.id,
      db,
      currentPath: '/help/integration-requests',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    });
    response.end(framedHtml);
  }

  return { sendUserIntegrationRequestPage };
};
