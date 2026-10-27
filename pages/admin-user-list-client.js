'use strict';

(() => {
  const modal = document.getElementById('userModal');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  let selectedId = '';

  function open(label, content) {
    title.textContent = label;
    body.innerHTML = content;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    body.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', close));
  }
  function close() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }
  async function post(url, payload) {
    const response = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request could not be completed.');
    return result;
  }
  async function get(url) {
    const response = await fetch(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to fetch data.');
    return result;
  }
  function showError(error, targetId = 'userModalError') {
    const target = document.getElementById(targetId);
    if (target) { target.textContent = error; target.classList.add('show'); }
    else window.alert(error);
  }
  function showSuccess(msg, targetId = 'userModalSuccess') {
    const target = document.getElementById(targetId);
    if (target) { target.textContent = msg; target.classList.add('show'); }
  }
  function hideMessages(errId, succId) {
    const err = document.getElementById(errId);
    const succ = document.getElementById(succId);
    if (err) { err.textContent = ''; err.classList.remove('show'); }
    if (succ) { succ.textContent = ''; succ.classList.remove('show'); }
  }

  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', close));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => {
    const user = JSON.parse(button.dataset.edit);
    selectedId = user.id;
    open('Edit User', `<form id="editUserForm"><div class="user-modal-error" id="userModalError"></div><div class="user-modal-grid"><div><label>Name *</label><input name="name" class="form-control" required maxlength="80" value="${escape(user.name)}"></div><div><label>Mobile Number *</label><input name="mobile" class="form-control" required maxlength="14" value="${escape(user.mobile)}"></div><div><label>Email (optional)</label><input name="email" type="email" class="form-control" maxlength="254" value="${escape(user.email)}"></div><div><label>Parent User ID</label><input name="parentUser" class="form-control" maxlength="80" value="${escape(user.parentUser)}" placeholder="Username or ID; blank to remove"><small class="text-muted">Parent must be an active user. Current: ${escape(user.parentName || 'None')}</small></div><div class="wide"><label>Address</label><textarea name="address" class="form-control" maxlength="300" rows="3" placeholder="User address">${escape(user.address)}</textarea></div><div class="user-modal-actions wide"><button type="button" class="btn btn-outline-secondary" data-close>Cancel</button><button class="user-save">Save Changes</button></div></div></form>`);
    body.querySelector('#editUserForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await post(`/api/admin/users/${selectedId}/update`, {
          name: form.elements.namedItem('name').value,
          mobile: form.elements.namedItem('mobile').value,
          email: form.elements.namedItem('email').value,
          parentUser: form.elements.namedItem('parentUser').value,
          address: form.elements.namedItem('address').value,
        });
        window.location.reload();
      } catch (error) { showError(error.message); }
    });
  }));

  document.querySelectorAll('[data-password]').forEach((button) => button.addEventListener('click', () => {
    selectedId = button.dataset.password;
    open(`Change Password · ${button.dataset.user}`, `<form id="passwordForm"><div class="user-modal-error" id="userModalError"></div><p class="text-muted">New password must be between 6 and 128 characters (letters, numbers, and special characters allowed).</p><label>New Password</label><input name="password" type="password" minlength="6" maxlength="128" placeholder="New password (letters, numbers, special characters)" class="form-control" required autocomplete="new-password"><div class="user-modal-actions"><button type="button" class="btn btn-outline-secondary" data-close>Cancel</button><button class="user-save">Set Password</button></div></form>`);
    body.querySelector('#passwordForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await post(`/api/admin/users/${selectedId}/password`, { password: event.currentTarget.elements.namedItem('password').value });
        window.alert('Password has been updated successfully.'); close();
      } catch (error) { showError(error.message); }
    });
  }));

  async function loadAndRenderConfigure(user, activeTab = 'tab-api') {
    selectedId = user.id;
    open(`Configure · ${escape(user.name)} (${escape(user.userId)})`, '<div class="text-center py-4"><i class="fa fa-spinner fa-spin fa-2x text-primary"></i><p class="mt-2 text-muted">Loading configuration...</p></div>');

    try {
      const data = await get(`/api/admin/users/${selectedId}/configure`);
      const apiToken = data.user?.apiToken || user.apiToken || '';
      const callbackUrl = data.user?.callbackUrl || user.callbackUrl || '';
      const ips = Array.isArray(data.ips) ? data.ips.join('\n') : '';
      const sellerApis = Array.isArray(data.sellerApis) ? data.sellerApis : [];

      const sellerApiRows = sellerApis.length ? sellerApis.map((api) => `
        <tr data-api-row="${api.id}">
          <td><strong>${escape(api.name)}</strong></td>
          <td><span class="badge badge-light border">₹${escape(api.balance || '0.00')}</span></td>
          <td><span class="badge badge-secondary">${escape(api.method || 'GET')}</span></td>
          <td>
            <span class="badge ${api.isActive ? 'badge-success' : 'badge-danger'}">
              ${api.isActive ? 'Active' : 'Inactive'}
            </span>
          </td>
          <td class="text-right">
            <button class="btn btn-sm ${api.isActive ? 'btn-outline-warning' : 'btn-outline-success'} btn-toggle-api mr-1" type="button" data-toggle-api="${api.id}" title="${api.isActive ? 'Deactivate API' : 'Activate API'}">
              ${api.isActive ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn btn-sm btn-outline-danger btn-delete-api" type="button" data-delete-api="${api.id}" title="Delete API">
              <i class="fa fa-trash"></i>
            </button>
          </td>
        </tr>
      `).join('') : '<tr><td colspan="5" class="text-center text-muted py-3">No seller APIs configured for this user yet.</td></tr>';

      const content = `
        <div class="config-nav">
          <button type="button" class="config-nav-btn ${activeTab === 'tab-api' ? 'active' : ''}" data-target-tab="tab-api">
            <i class="fa fa-key mr-1"></i> API, Webhook & IP Whitelist
          </button>
          <button type="button" class="config-nav-btn ${activeTab === 'tab-seller' ? 'active' : ''}" data-target-tab="tab-seller">
            <i class="fa fa-server mr-1"></i> Seller APIs (${sellerApis.length})
          </button>
        </div>

        <div class="config-tab ${activeTab === 'tab-api' ? 'active' : ''}" id="tab-api">
          <form id="configureApiForm">
            <div class="user-modal-error" id="configApiError"></div>
            <div class="user-modal-success" id="configApiSuccess"></div>

            <div class="form-group mb-3">
              <label class="font-weight-bold">API Token</label>
              <div class="input-group">
                <input id="configApiTokenInput" name="apiToken" class="form-control font-monospace" value="${escape(apiToken)}" placeholder="User API token">
                <div class="input-group-append">
                  <button class="btn btn-outline-secondary" type="button" id="btnCopyToken" title="Copy Token"><i class="fa fa-copy"></i> Copy</button>
                  <button class="btn btn-outline-primary" type="button" id="btnGenToken" title="Generate New Token"><i class="fa fa-refresh"></i> Generate</button>
                </div>
              </div>
              <small class="text-muted">Unique token used by buyer to authenticate API recharge and balance requests.</small>
            </div>

            <div class="form-group mb-3">
              <label class="font-weight-bold">Whitelisted IP Address(es)</label>
              <textarea id="configIpsInput" name="ips" class="form-control font-monospace" rows="3" placeholder="Enter allowed IP addresses (one per line or comma separated, e.g. 116.202.172.205)">${escape(ips)}</textarea>
              <small class="text-muted">Requests with buyer API token from any IP not listed here will be rejected.</small>
            </div>

            <div class="form-group mb-3">
              <label class="font-weight-bold">Callback Webhook URL</label>
              <input id="configCallbackUrlInput" name="callbackUrl" type="url" class="form-control" value="${escape(callbackUrl)}" placeholder="https://example.com/api/callback">
              <small class="text-muted">System will POST instant transaction status callbacks to this URL.</small>
            </div>

            <div class="user-modal-actions">
              <button type="button" class="btn btn-outline-secondary" data-close>Cancel</button>
              <button type="submit" class="user-save" id="btnSaveApiConfig"><i class="fa fa-check mr-1"></i> Save Configuration</button>
            </div>
          </form>
        </div>

        <div class="config-tab ${activeTab === 'tab-seller' ? 'active' : ''}" id="tab-seller">
          <div class="user-modal-error" id="sellerApiError"></div>
          <div class="user-modal-success" id="sellerApiSuccess"></div>

          <h6 class="font-weight-bold text-dark mb-2">Configured Seller APIs</h6>
          <div class="table-responsive mb-4 border rounded">
            <table class="table table-sm table-striped mb-0">
              <thead class="thead-light">
                <tr>
                  <th>API Name</th>
                  <th>Balance</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>${sellerApiRows}</tbody>
            </table>
          </div>

          <div class="card bg-light border p-3">
            <h6 class="font-weight-bold mb-3 text-primary"><i class="fa fa-plus-circle mr-1"></i> Add / Configure New Seller API</h6>
            <form id="addSellerApiForm">
              <div class="user-modal-grid">
                <div>
                  <label class="font-weight-bold">API Name *</label>
                  <input name="name" class="form-control" required maxlength="100" placeholder="e.g. Ezytm Seller API">
                </div>
                <div>
                  <label class="font-weight-bold">Method *</label>
                  <select name="method" class="form-control">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
                <div class="wide">
                  <label class="font-weight-bold">Recharge URL *</label>
                  <input name="rechargeUrl" class="form-control" required placeholder="https://api.example.com/recharge?token=XYZ&number={MOBILE}&amount={AMOUNT}&operator={OPERATOR}&order_id={TID}">
                  <small class="text-muted">Available tags: {MOBILE}, {AMOUNT}, {OPERATOR}, {TID}, {CIRCLE}</small>
                </div>
                <div>
                  <label class="font-weight-bold">Balance URL (optional)</label>
                  <input name="balanceUrl" class="form-control" placeholder="https://api.example.com/balance?token=XYZ">
                </div>
                <div>
                  <label class="font-weight-bold">Balance Key (optional)</label>
                  <input name="balanceKey" class="form-control" placeholder="e.g. balance or data.balance">
                </div>
                <div class="wide">
                  <label class="font-weight-bold">Status Check URL (optional)</label>
                  <input name="statusUrl" class="form-control" placeholder="https://api.example.com/status?token=XYZ&order_id={TID}">
                </div>
                <div>
                  <label class="font-weight-bold">Status</label>
                  <select name="isActive" class="form-control">
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
                <div class="d-flex align-items-end justify-content-end">
                  <button type="submit" class="btn btn-primary font-weight-bold px-4" id="btnAddSellerApi">
                    <i class="fa fa-save mr-1"></i> Add Seller API
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div class="user-modal-actions mt-3">
            <button type="button" class="btn btn-secondary" data-close>Close</button>
          </div>
        </div>
      `;

      open(`Configure · ${escape(user.name)} (${escape(user.userId)})`, content);

      // Tab switching
      body.querySelectorAll('[data-target-tab]').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
          body.querySelectorAll('.config-nav-btn').forEach((b) => b.classList.remove('active'));
          body.querySelectorAll('.config-tab').forEach((t) => t.classList.remove('active'));
          tabBtn.classList.add('active');
          const target = body.querySelector(`#${tabBtn.dataset.targetTab}`);
          if (target) target.classList.add('active');
        });
      });

      // Copy Token
      const btnCopy = body.querySelector('#btnCopyToken');
      if (btnCopy) {
        btnCopy.addEventListener('click', () => {
          const input = body.querySelector('#configApiTokenInput');
          if (!input) return;
          input.select();
          navigator.clipboard.writeText(input.value).then(() => {
            btnCopy.innerHTML = '<i class="fa fa-check text-success"></i> Copied!';
            setTimeout(() => { btnCopy.innerHTML = '<i class="fa fa-copy"></i> Copy'; }, 2000);
          }).catch(() => {
            window.alert('Token copied: ' + input.value);
          });
        });
      }

      // Generate New Token
      const btnGen = body.querySelector('#btnGenToken');
      if (btnGen) {
        btnGen.addEventListener('click', () => {
          const tokenInput = body.querySelector('#configApiTokenInput');
          if (!tokenInput) return;
          const randomBytes = new Uint8Array(16);
          crypto.getRandomValues(randomBytes);
          const hex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
          tokenInput.value = 'tok_' + hex;
        });
      }

      // API Config Form Submission
      const apiForm = body.querySelector('#configureApiForm');
      if (apiForm) {
        apiForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          hideMessages('configApiError', 'configApiSuccess');
          const btn = body.querySelector('#btnSaveApiConfig');
          if (btn) btn.disabled = true;

          try {
            const result = await post(`/api/admin/users/${selectedId}/configure`, {
              apiToken: body.querySelector('#configApiTokenInput').value,
              ips: body.querySelector('#configIpsInput').value,
              callbackUrl: body.querySelector('#configCallbackUrlInput').value,
            });
            showSuccess(result.message || 'Configuration saved successfully.', 'configApiSuccess');
          } catch (error) {
            showError(error.message, 'configApiError');
          } finally {
            if (btn) btn.disabled = false;
          }
        });
      }

      // Add Seller API Form Submission
      const addApiForm = body.querySelector('#addSellerApiForm');
      if (addApiForm) {
        addApiForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          hideMessages('sellerApiError', 'sellerApiSuccess');
          const form = event.currentTarget;
          const btn = body.querySelector('#btnAddSellerApi');
          if (btn) btn.disabled = true;

          try {
            await post(`/api/admin/users/${selectedId}/seller-api`, {
              name: form.elements.namedItem('name').value,
              method: form.elements.namedItem('method').value,
              rechargeUrl: form.elements.namedItem('rechargeUrl').value,
              balanceUrl: form.elements.namedItem('balanceUrl').value,
              balanceKey: form.elements.namedItem('balanceKey').value,
              statusUrl: form.elements.namedItem('statusUrl').value,
              isActive: form.elements.namedItem('isActive').value === 'true',
            });
            await loadAndRenderConfigure(user, 'tab-seller');
            showSuccess('Seller API added successfully!', 'sellerApiSuccess');
          } catch (error) {
            showError(error.message, 'sellerApiError');
            if (btn) btn.disabled = false;
          }
        });
      }

      // Toggle Seller API Active
      body.querySelectorAll('[data-toggle-api]').forEach((toggleBtn) => {
        toggleBtn.addEventListener('click', async () => {
          const apiId = toggleBtn.dataset.toggleApi;
          toggleBtn.disabled = true;
          hideMessages('sellerApiError', 'sellerApiSuccess');
          try {
            const res = await post(`/api/admin/users/${selectedId}/seller-api/${apiId}/toggle`, {});
            await loadAndRenderConfigure(user, 'tab-seller');
            showSuccess(`Seller API status updated to ${res.isActive ? 'Active' : 'Inactive'}.`, 'sellerApiSuccess');
          } catch (error) {
            showError(error.message, 'sellerApiError');
            toggleBtn.disabled = false;
          }
        });
      });

      // Delete Seller API
      body.querySelectorAll('[data-delete-api]').forEach((delBtn) => {
        delBtn.addEventListener('click', async () => {
          const apiId = delBtn.dataset.deleteApi;
          if (!window.confirm('Are you sure you want to delete this Seller API?')) return;
          delBtn.disabled = true;
          hideMessages('sellerApiError', 'sellerApiSuccess');
          try {
            await post(`/api/admin/users/${selectedId}/seller-api/${apiId}/delete`, {});
            await loadAndRenderConfigure(user, 'tab-seller');
            showSuccess('Seller API deleted successfully.', 'sellerApiSuccess');
          } catch (error) {
            showError(error.message, 'sellerApiError');
            delBtn.disabled = false;
          }
        });
      });

    } catch (error) {
      showError(error.message);
    }
  }

  document.querySelectorAll('[data-configure]').forEach((button) => button.addEventListener('click', () => {
    const user = JSON.parse(button.dataset.configure);
    loadAndRenderConfigure(user, 'tab-api');
  }));

  document.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm(`Are you sure you want to remove user ${button.dataset.user} and block the account?`)) return;
    button.disabled = true;
    try {
      await post(`/api/admin/users/${button.dataset.delete}/delete`, {});
      window.location.reload();
    } catch (error) { window.alert(error.message); button.disabled = false; }
  }));

  document.querySelectorAll('[data-status-user]').forEach((select) => {
    let current = select.value;
    select.addEventListener('change', async () => {
      const next = select.value;
      select.disabled = true;
      try {
        await post(`/api/admin/users/${select.dataset.statusUser}/status`, { status: next });
        current = next;
      } catch (error) {
        select.value = current;
        window.alert(error.message);
      } finally { select.disabled = false; }
    });
  });

  let balanceRefreshRunning = false;
  async function refreshVisibleBalances() {
    const balanceElements = [...document.querySelectorAll('[data-balance-user]')];
    if (!balanceElements.length || balanceRefreshRunning) return;
    balanceRefreshRunning = true;
    try {
      const query = new URLSearchParams();
      balanceElements.forEach((element) => query.append('id', element.dataset.balanceUser));
      const response = await fetch(`/api/admin/users/list-balances?${query}`, { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Balance refresh failed.');
      result.balances.forEach((item) => {
        const target = document.querySelector(`[data-balance-user="${CSS.escape(item.userId)}"]`);
        if (target) target.textContent = `₹${item.balance}`;
      });
    } catch (error) {
      console.warn('Live wallet balance refresh failed:', error.message);
    } finally { balanceRefreshRunning = false; }
  }
  const refreshButton = document.querySelector('.user-card-head button');
  if (refreshButton) {
    refreshButton.removeAttribute('onclick');
    refreshButton.addEventListener('click', refreshVisibleBalances);
  }
  refreshVisibleBalances();
  window.setInterval(refreshVisibleBalances, 5000);
})();
