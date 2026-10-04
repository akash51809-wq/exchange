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
    if (!response.ok) throw new Error(result.error || 'अनुरोध पूरा नहीं हुआ।');
    return result;
  }
  function showError(error) {
    const target = document.getElementById('userModalError');
    if (target) { target.textContent = error; target.classList.add('show'); }
    else window.alert(error);
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
    open(`Change Password · ${button.dataset.user}`, `<form id="passwordForm"><div class="user-modal-error" id="userModalError"></div><p class="text-muted">नया पासवर्ड छह अंकों का होना चाहिए।</p><label>New Password</label><input name="password" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" class="form-control" required autocomplete="new-password"><div class="user-modal-actions"><button type="button" class="btn btn-outline-secondary" data-close>Cancel</button><button class="user-save">Set Password</button></div></form>`);
    body.querySelector('#passwordForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await post(`/api/admin/users/${selectedId}/password`, { password: event.currentTarget.elements.namedItem('password').value });
        window.alert('पासवर्ड बदल दिया गया।'); close();
      } catch (error) { showError(error.message); }
    });
  }));

  document.querySelectorAll('[data-setting]').forEach((button) => button.addEventListener('click', () => {
    const user = JSON.parse(button.dataset.setting);
    selectedId = user.id;
    open(`User Settings · ${user.userId}`, `<form id="settingForm"><div class="user-modal-error" id="userModalError"></div><label>Account Status</label><select name="status" class="form-control"><option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option><option value="blocked" ${user.status === 'blocked' ? 'selected' : ''}>Inactive / Blocked</option></select><div class="user-modal-actions"><button type="button" class="btn btn-outline-secondary" data-close>Cancel</button><button class="user-save">Save Setting</button></div></form>`);
    body.querySelector('#settingForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await post(`/api/admin/users/${selectedId}/status`, { status: event.currentTarget.elements.namedItem('status').value });
        window.location.reload();
      } catch (error) { showError(error.message); }
    });
  }));

  document.querySelectorAll('[data-setup]').forEach((button) => button.addEventListener('click', () => {
    const user = JSON.parse(button.dataset.setup);
    open(`User Setup · ${user.userId}`, `<div class="setup-grid"><strong>User ID</strong><span>${escape(user.userId)}</span><strong>Name</strong><span>${escape(user.name)}</span><strong>Mobile</strong><span>${escape(user.mobile)}</span><strong>Email</strong><span>${escape(user.email || '—')}</span><strong>Parent</strong><span>${escape(user.parentName || 'Not assigned')}</span><strong>Address</strong><span>${escape(user.address || 'Not provided')}</span><strong>Joined</strong><span>${escape(user.joined)}</span><strong>Wallet Balance</strong><span>₹${escape(user.balance)}</span><strong>Status</strong><span>${escape(user.status)}</span></div><div class="user-modal-actions"><button type="button" class="btn btn-secondary" data-close>Close</button></div>`);
  }));

  document.querySelectorAll('[data-margin]').forEach((button) => button.addEventListener('click', async () => {
    open(`User Margins · ${button.dataset.user}`, 'लोड हो रहा है…');
    try {
      const response = await fetch(`/api/admin/users/${button.dataset.margin}/margins`, { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Margin विवरण नहीं मिला।');
      const render = (heading, items) => `<h5 class="mt-3">${heading}</h5><div class="table-responsive"><table class="table table-bordered margin-table"><thead><tr><th>Operator</th><th>Circle</th><th>Commission</th><th>Status</th></tr></thead><tbody>${items.length ? items.map((item) => `<tr><td>${escape(item.operatorName)}</td><td>${escape(item.circleName)}</td><td>${escape(item.commissionPercent)}%</td><td>${item.active ? 'On' : 'Off'}</td></tr>`).join('') : '<tr><td colspan="4">No margin setting</td></tr>'}</tbody></table></div>`;
      body.innerHTML = render('Buyer Margin', result.buyer) + render('Seller Margin', result.seller) + '<div class="user-modal-actions"><button type="button" class="btn btn-secondary" data-close>Close</button></div>';
      body.querySelectorAll('[data-close]').forEach((closeButton) => closeButton.addEventListener('click', close));
    } catch (error) { body.textContent = error.message; }
  }));

  document.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm(`User ${button.dataset.user} को सूची से हटाकर account block करना है?`)) return;
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
