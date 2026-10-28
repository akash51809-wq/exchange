'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminSendBulkWhatsappPage({ db, decryptMobile }) {
  async function sendAdminSendBulkWhatsappPage(admin, response) {
    // Fetch users for target selection
    const res = await db.query(
      `SELECT id, username, name, email, phone_ciphertext, status
       FROM users
       WHERE role = 'user' AND deleted_at IS NULL
       ORDER BY name ASC, username ASC
       LIMIT 2000`
    ).catch(() => ({ rows: [] }));

    const users = (res.rows || []).map(u => {
      let mobile = '';
      if (u.phone_ciphertext && typeof decryptMobile === 'function') {
        try { mobile = String(decryptMobile(u.phone_ciphertext) || '').trim(); } catch (_) {}
      }
      return {
        id: u.id,
        username: u.username || '',
        name: u.name || u.username || 'User',
        status: u.status || 'active',
        mobile: mobile,
        hasMobile: Boolean(mobile && mobile.length >= 10),
      };
    });

    const safeUsersJson = JSON.stringify(users).replace(/</g, '\\u003c');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Send Bulk WhatsApp - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .card-custom {
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      box-shadow: 0 4px 16px rgba(0,0,0,0.04);
      margin-bottom: 24px;
      overflow: hidden;
    }
    .card-custom .card-header {
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      padding: 16px 20px;
    }
    .card-custom .card-body {
      padding: 24px;
    }
    .option-pill-radio { display: none; }
    .option-pill-label {
      cursor: pointer;
      padding: 8px 18px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 13px;
      border: 1.5px solid #cbd5e1;
      background: #fff;
      color: #475569;
      transition: all 0.2s;
      margin-right: 8px;
      margin-bottom: 8px;
      display: inline-flex;
      align-items: center;
    }
    .option-pill-label:hover {
      border-color: #25d366;
      color: #128c7e;
    }
    .option-pill-radio:checked + .option-pill-label {
      background: #25d366;
      border-color: #25d366;
      color: #fff;
      box-shadow: 0 2px 8px rgba(37,211,102,0.3);
    }
    .keyword-badge {
      display: inline-flex;
      align-items: center;
      background: #e0f2fe;
      color: #0369a1;
      padding: 5px 12px;
      border-radius: 6px;
      font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid #bae6fd;
      transition: all 0.15s;
    }
    .keyword-badge:hover {
      background: #0284c7;
      color: #fff;
      border-color: #0284c7;
      transform: translateY(-1px);
    }
    .users-selection-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
      padding: 12px;
      max-height: 260px;
      overflow-y: auto;
    }
    .user-chip {
      background: #e2e8f0;
      color: #1e293b;
      padding: 4px 10px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      margin: 3px;
    }
    .user-chip .btn-remove {
      margin-left: 6px;
      cursor: pointer;
      color: #64748b;
      font-weight: bold;
    }
    .user-chip .btn-remove:hover {
      color: #ef4444;
    }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    
    <!-- Standard Top Header -->
    <div class="app-header header sticky">
      <div class="container-fluid main-container">
        <div class="d-flex align-items-center">
          <a class="header-brand" href="/admin/">
            <img src="/api/logo" class="header-brand-img desktop-logo" alt="Logo" style="height:36px;max-width:180px;object-fit:contain;" onerror="this.src='/assets/images/brand/logo.png'">
          </a>
          <div class="ms-auto d-flex order-lg-2">
            <span class="badge bg-primary text-white p-2 px-3 fw-bold"><i class="fa fa-user-shield me-1"></i> Admin Panel</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Standard Admin Horizontal Navigation Menu Bar -->
    ${renderAdminNavigation('/admin/settings/send-bulk-whatsapp')}

    <!-- Main Content Area -->
    <div class="main-content hor-content mt-0">
      <div class="side-app">
        <div class="main-container container-fluid py-4 px-4">

          <!-- Page Header & Breadcrumbs (Clean, no extra tabs) -->
          <div class="page-header d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
            <div>
              <h1 class="page-title text-success"><i class="fab fa-whatsapp me-2"></i>Send Bulk WhatsApp</h1>
              <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="/admin/">Admin</a></li>
                <li class="breadcrumb-item">Settings</li>
                <li class="breadcrumb-item active" aria-current="page">Send Bulk WhatsApp</li>
              </ol>
            </div>
            <div>
              <span id="targetBadge" class="badge badge-success p-2 px-3" style="font-size:13px;">
                <i class="fa fa-users mr-1"></i>Target: <span id="targetCount">0</span> Users
              </span>
            </div>
          </div>

          <!-- Instant Notification Alert Container -->
          <div id="instantNoticeContainer" style="display:none;"></div>

          <div class="row">
            <div class="col-xl-9 col-lg-11 mx-auto">
              <div class="card-custom">
                <div class="card-header d-flex justify-content-between align-items-center">
                  <span class="font-weight-bold text-dark" style="font-size:15px;">
                    <i class="fa fa-pen mr-2 text-success"></i>Compose WhatsApp Broadcast Message
                  </span>
                </div>
                <div class="card-body">
                  
                  <!-- 1. Recipient Target Selection -->
                  <div class="form-group mb-4">
                    <label class="font-weight-bold text-dark d-block mb-2">
                      <i class="fa fa-users text-muted mr-1"></i>Choose Recipients:
                    </label>
                    <div class="option-pill-group d-flex flex-wrap">
                      <input type="radio" class="option-pill-radio" name="recipientMode" id="modeSpecific" value="specific">
                      <label class="option-pill-label" for="modeSpecific">
                        <i class="fa fa-user-check mr-1"></i>Choose Specific User
                      </label>

                      <input type="radio" class="option-pill-radio" name="recipientMode" id="modeAll" value="all" checked>
                      <label class="option-pill-label" for="modeAll">
                        <i class="fa fa-users mr-1"></i>All User
                      </label>
                    </div>
                  </div>

                  <!-- 2. Sub-option for All Users (All, Active, Inactive) -->
                  <div id="subFilterAllContainer" class="form-group mb-4 p-3 bg-light rounded" style="border: 1px dashed #cbd5e1;">
                    <label class="font-weight-bold text-muted small text-uppercase d-block mb-2">
                      Filter Users Status:
                    </label>
                    <div class="option-pill-group d-flex flex-wrap mb-0">
                      <input type="radio" class="option-pill-radio" name="userStatusFilter" id="statusAll" value="all" checked>
                      <label class="option-pill-label" for="statusAll">
                        <i class="fa fa-layer-group mr-1"></i>All Users
                      </label>

                      <input type="radio" class="option-pill-radio" name="userStatusFilter" id="statusActive" value="active">
                      <label class="option-pill-label" for="statusActive">
                        <i class="fa fa-circle-check text-success mr-1"></i>Active Users Only
                      </label>

                      <input type="radio" class="option-pill-radio" name="userStatusFilter" id="statusInactive" value="inactive">
                      <label class="option-pill-label" for="statusInactive">
                        <i class="fa fa-circle-xmark text-danger mr-1"></i>Inactive / Blocked Users
                      </label>
                    </div>
                  </div>

                  <!-- 3. Specific User Selection Container (hidden by default) -->
                  <div id="specificUserContainer" class="form-group mb-4" style="display:none;">
                    <label class="font-weight-bold text-dark d-block mb-1">
                      Search &amp; Select Users:
                    </label>
                    <div class="input-group mb-2">
                      <div class="input-group-prepend">
                        <span class="input-group-text bg-white"><i class="fa fa-search text-muted"></i></span>
                      </div>
                      <input type="text" id="userSearchInput" class="form-control" placeholder="Search by Firm Name, Username or Mobile...">
                      <div class="input-group-append">
                        <button class="btn btn-outline-secondary btn-sm" type="button" id="btnSelectAllFiltered">Select All</button>
                        <button class="btn btn-outline-secondary btn-sm" type="button" id="btnClearSelected">Clear</button>
                      </div>
                    </div>

                    <div class="users-selection-box mb-2" id="userCheckboxList">
                      <!-- Checkbox items rendered via JS -->
                    </div>

                    <div id="selectedChipsContainer" class="mt-2" style="min-height:30px;">
                      <span class="text-muted small">Selected Users: </span>
                      <div id="chipsList" class="d-inline"></div>
                    </div>
                  </div>

                  <!-- 4. WhatsApp Message Box -->
                  <div class="form-group mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <label for="whatsappMessage" class="font-weight-bold text-dark mb-0">
                        <i class="fa fa-comment-dots text-success mr-1"></i>Type text here:
                      </label>
                      <span id="msgStats" class="text-muted small">0 characters | 0 words</span>
                    </div>
                    <textarea id="whatsappMessage" class="form-control" rows="6" style="font-size:14px; line-height:1.6;" placeholder="Type your WhatsApp message here... You can use [NAME] to insert each user's Firm Name."></textarea>
                  </div>

                  <!-- 5. Keyword Card -->
                  <div class="card mb-4 border-info" style="background:#f0f9ff; border-radius:8px;">
                    <div class="card-body p-3">
                      <div class="d-flex align-items-center justify-content-between mb-2">
                        <span class="font-weight-bold text-primary" style="font-size:13px;">
                          <i class="fa fa-tag mr-1"></i>Available Personalization Keyword
                        </span>
                        <span class="text-muted small">Click keyword below to insert into message</span>
                      </div>
                      <div class="table-responsive">
                        <table class="table table-sm table-bordered bg-white mb-0" style="font-size:13px;">
                          <thead class="thead-light">
                            <tr>
                              <th style="width:160px;">Keyword</th>
                              <th>Description</th>
                              <th style="width:120px;" class="text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td><span class="keyword-badge" id="btnInsertName">[NAME]</span></td>
                              <td class="font-weight-bold text-dark">Firm Name</td>
                              <td class="text-center">
                                <button type="button" class="btn btn-xs btn-outline-primary btn-insert-keyword" data-keyword="[NAME]">
                                  <i class="fa fa-plus mr-1"></i>Insert
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <small class="text-muted mt-2 d-block">
                        <i class="fa fa-info-circle mr-1 text-info"></i>मैसेज भेजते समय [NAME] प्रत्येक यूजर के वास्तविक फर्म नेम / नाम से अपने आप बदल जाएगा।
                      </small>
                    </div>
                  </div>

                  <!-- 6. Submit Button -->
                  <div class="d-flex align-items-center justify-content-between flex-wrap">
                    <button type="button" id="btnSendWhatsapp" class="btn btn-success btn-lg px-4 font-weight-bold shadow-sm">
                      <i class="fab fa-whatsapp mr-2"></i>Send Bulk WhatsApp
                    </button>
                    <div id="sendingNotice" class="text-muted small mt-2 mt-sm-0" style="display:none;">
                      <span class="spinner-border spinner-border-sm text-success mr-1"></span>Sending message...
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

  </div>
</div>

<script id="usersData" type="application/json">
${safeUsersJson}
</script>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script>
(function() {
  let allUsers = [];
  try {
    const rawEl = document.getElementById('usersData');
    if (rawEl) allUsers = JSON.parse(rawEl.textContent);
  } catch (e) {
    console.error('Failed to parse users data:', e);
  }

  let selectedUserIds = new Set();
  const textarea = document.getElementById('whatsappMessage');
  const msgStats = document.getElementById('msgStats');
  const targetCountEl = document.getElementById('targetCount');
  const instantNoticeContainer = document.getElementById('instantNoticeContainer');

  // Switch Recipient Mode (Specific vs All)
  const modeSpecific = document.getElementById('modeSpecific');
  const modeAll = document.getElementById('modeAll');
  const subFilterAllContainer = document.getElementById('subFilterAllContainer');
  const specificUserContainer = document.getElementById('specificUserContainer');

  function updateRecipientMode() {
    if (modeSpecific.checked) {
      subFilterAllContainer.style.display = 'none';
      specificUserContainer.style.display = 'block';
    } else {
      subFilterAllContainer.style.display = 'block';
      specificUserContainer.style.display = 'none';
    }
    recalculateTargetCount();
  }

  modeSpecific.addEventListener('change', updateRecipientMode);
  modeAll.addEventListener('change', updateRecipientMode);

  // Sub-filter for All Users
  document.querySelectorAll('input[name="userStatusFilter"]').forEach(radio => {
    radio.addEventListener('change', recalculateTargetCount);
  });

  // Calculate targeted users count
  function getTargetUsers() {
    if (modeSpecific.checked) {
      return allUsers.filter(u => selectedUserIds.has(u.id));
    } else {
      const statusFilter = document.querySelector('input[name="userStatusFilter"]:checked')?.value || 'all';
      if (statusFilter === 'active') {
        return allUsers.filter(u => u.status === 'active');
      } else if (statusFilter === 'inactive') {
        return allUsers.filter(u => u.status !== 'active');
      }
      return allUsers;
    }
  }

  function recalculateTargetCount() {
    const targets = getTargetUsers();
    targetCountEl.textContent = targets.length;
  }

  // Render Checkbox List for Specific Users
  const userCheckboxList = document.getElementById('userCheckboxList');
  const userSearchInput = document.getElementById('userSearchInput');

  function renderUserCheckboxes(filterText = '') {
    const q = filterText.trim().toLowerCase();
    const filtered = allUsers.filter(u => {
      if (!q) return true;
      return u.name.toLowerCase().includes(q) ||
             u.username.toLowerCase().includes(q) ||
             u.mobile.includes(q);
    });

    if (filtered.length === 0) {
      userCheckboxList.innerHTML = '<div class="text-muted small p-2 text-center">No users match your search.</div>';
      return;
    }

    userCheckboxList.innerHTML = filtered.map(u => {
      const checked = selectedUserIds.has(u.id) ? 'checked' : '';
      const mobileBadge = u.hasMobile 
        ? '<span class="badge badge-success ml-1" style="font-size:10px;">' + (u.mobile.slice(-4).padStart(10, '*')) + '</span>'
        : '<span class="badge badge-warning text-dark ml-1" style="font-size:10px;">No Mobile</span>';
      return '<div class="custom-control custom-checkbox py-1 border-bottom">' +
        '<input type="checkbox" class="custom-control-input chk-user" id="chk_' + u.id + '" data-id="' + u.id + '" ' + checked + '>' +
        '<label class="custom-control-label d-flex align-items-center justify-content-between" for="chk_' + u.id + '" style="cursor:pointer; font-size:13px;">' +
          '<span><b>' + escapeHtml(u.name) + '</b> <span class="text-muted">(@' + escapeHtml(u.username) + ')</span></span>' +
          mobileBadge +
        '</label>' +
      '</div>';
    }).join('');

    userCheckboxList.querySelectorAll('.chk-user').forEach(chk => {
      chk.addEventListener('change', () => {
        const uid = chk.getAttribute('data-id');
        if (chk.checked) selectedUserIds.add(uid);
        else selectedUserIds.delete(uid);
        renderSelectedChips();
        recalculateTargetCount();
      });
    });
  }

  userSearchInput.addEventListener('input', () => {
    renderUserCheckboxes(userSearchInput.value);
  });

  document.getElementById('btnSelectAllFiltered').addEventListener('click', () => {
    const q = userSearchInput.value.trim().toLowerCase();
    allUsers.forEach(u => {
      if (!q || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.mobile.includes(q)) {
        selectedUserIds.add(u.id);
      }
    });
    renderUserCheckboxes(userSearchInput.value);
    renderSelectedChips();
    recalculateTargetCount();
  });

  document.getElementById('btnClearSelected').addEventListener('click', () => {
    selectedUserIds.clear();
    renderUserCheckboxes(userSearchInput.value);
    renderSelectedChips();
    recalculateTargetCount();
  });

  function renderSelectedChips() {
    const chipsList = document.getElementById('chipsList');
    if (selectedUserIds.size === 0) {
      chipsList.innerHTML = '<span class="text-muted small">None selected</span>';
      return;
    }
    const chips = [];
    selectedUserIds.forEach(uid => {
      const u = allUsers.find(x => x.id === uid);
      if (u) {
        chips.push('<span class="user-chip">' + escapeHtml(u.name) +
          '<span class="btn-remove" data-id="' + u.id + '">&times;</span></span>');
      }
    });
    chipsList.innerHTML = chips.join('');

    chipsList.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-id');
        selectedUserIds.delete(uid);
        renderUserCheckboxes(userSearchInput.value);
        renderSelectedChips();
        recalculateTargetCount();
      });
    });
  }

  // Insert Keyword at cursor position
  function insertKeyword(keyword) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    textarea.value = val.substring(0, start) + keyword + val.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + keyword.length;
    updateMsgStats();
  }

  document.querySelectorAll('.btn-insert-keyword, #btnInsertName').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      insertKeyword('[NAME]');
    });
  });

  // Character and Word Counter
  function updateMsgStats() {
    const text = textarea.value || '';
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\\s+/).length : 0;
    msgStats.textContent = chars + ' characters | ' + words + ' words';
  }
  textarea.addEventListener('input', updateMsgStats);

  // Send Bulk WhatsApp action - Non-blocking, instant free
  const btnSendWhatsapp = document.getElementById('btnSendWhatsapp');
  const sendingNotice = document.getElementById('sendingNotice');

  btnSendWhatsapp.addEventListener('click', async () => {
    const message = textarea.value.trim();
    if (!message) {
      alert('Please enter your WhatsApp message before sending.');
      textarea.focus();
      return;
    }

    const targetUsers = getTargetUsers();
    if (targetUsers.length === 0) {
      alert('No recipients selected. Please select at least one user.');
      return;
    }

    // Disable button briefly while initiating request
    btnSendWhatsapp.disabled = true;
    sendingNotice.style.display = 'inline-block';

    const payload = {
      targetType: modeSpecific.checked ? 'specific' : 'all',
      userStatus: document.querySelector('input[name="userStatusFilter"]:checked')?.value || 'all',
      userIds: modeSpecific.checked ? Array.from(selectedUserIds) : [],
      message: message,
    };

    try {
      const res = await fetch('/api/admin/bulk-whatsapp/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch bulk WhatsApp.');
      }

      // Show immediate success message on page without any blocking alert popup
      instantNoticeContainer.style.display = 'block';
      instantNoticeContainer.innerHTML = 
        '<div class="alert alert-success alert-dismissible fade show p-3 shadow-sm mb-4" role="alert">' +
          '<div class="d-flex align-items-center justify-content-between">' +
            '<div>' +
              '<h6 class="font-weight-bold mb-1"><i class="fa fa-circle-check mr-2"></i>मैसेज सफलतापूर्वक भेज दिया गया है!</h6>' +
              '<p class="mb-0 small text-muted">WhatsApp संदेश बैकग्राउंड में भेजा जा रहा है। इसका विवरण आप <a href="/admin/reports/user-send-msg-log" class="font-weight-bold text-success">User Send Msg Log</a> में देख सकते हैं।</p>' +
            '</div>' +
            '<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
              '<span aria-hidden="true">&times;</span>' +
            '</button>' +
          '</div>' +
        '</div>';

      // Clear message box and immediately free up the system
      textarea.value = '';
      updateMsgStats();
    } catch (err) {
      instantNoticeContainer.style.display = 'block';
      instantNoticeContainer.innerHTML = 
        '<div class="alert alert-danger alert-dismissible fade show p-3 shadow-sm mb-4" role="alert">' +
          '<i class="fa fa-triangle-exclamation mr-2"></i><b>Error:</b> ' + escapeHtml(err.message) +
          '<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
            '<span aria-hidden="true">&times;</span>' +
          '</button>' +
        '</div>';
    } finally {
      // Instantly free up system and button
      btnSendWhatsapp.disabled = false;
      sendingNotice.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // Initial renders
  renderUserCheckboxes();
  renderSelectedChips();
  recalculateTargetCount();
  updateMsgStats();

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
</script>
</body>
</html>`;

    const fullHtml = useFullWidthContainers(html);
    const framedHtml = await addPanelChrome(fullHtml, {
      role: 'admin',
      userId: admin.id,
      db,
      currentPath: '/admin/settings/send-bulk-whatsapp',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data:; font-src 'self' data: https://cdnjs.cloudflare.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
    });
    response.end(framedHtml);
  }

  return { sendAdminSendBulkWhatsappPage };
};
