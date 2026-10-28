'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminSendBulkEmailPage({ db }) {
  async function sendAdminSendBulkEmailPage(admin, response) {
    // Fetch users for target selection
    const res = await db.query(
      `SELECT id, username, name, email, status
       FROM users
       WHERE role = 'user' AND deleted_at IS NULL
       ORDER BY name ASC, username ASC
       LIMIT 2000`
    ).catch(() => ({ rows: [] }));

    const users = (res.rows || []).map(u => {
      const email = String(u.email || '').trim().toLowerCase();
      return {
        id: u.id,
        username: u.username || '',
        name: u.name || u.username || 'User',
        status: u.status || 'active',
        email: email,
        hasEmail: Boolean(email && email.includes('@')),
      };
    });

    const safeUsersJson = JSON.stringify(users).replace(/</g, '\\u003c');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Send Bulk Email - Exchange Admin</title>
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
    .nav-tabs-custom {
      border-bottom: 2px solid #e2e8f0;
      margin-bottom: 24px;
    }
    .nav-tabs-custom .nav-link {
      border: none;
      color: #64748b;
      font-weight: 600;
      padding: 10px 18px;
      margin-bottom: -2px;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
    }
    .nav-tabs-custom .nav-link:hover {
      color: #0ea5e9;
    }
    .nav-tabs-custom .nav-link.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
      background: transparent;
    }
    .option-pill-group .btn-check { display: none; }
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
      border-color: #2563eb;
      color: #1d4ed8;
    }
    .option-pill-radio:checked + .option-pill-label {
      background: #2563eb;
      border-color: #2563eb;
      color: #fff;
      box-shadow: 0 2px 8px rgba(37,99,235,0.3);
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
    .kpi-box {
      border-radius: 8px;
      padding: 14px 18px;
      text-align: center;
    }
    .kpi-box .kpi-num {
      font-size: 24px;
      font-weight: 800;
      line-height: 1.2;
    }
    .kpi-box .kpi-title {
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    <div class="container-fluid px-4 py-4">

      <!-- Breadcrumbs & Header -->
      <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap">
        <div>
          <h4 class="mb-1 text-dark font-weight-bold">
            <i class="fa fa-envelope text-primary mr-2"></i>Send Bulk Email
          </h4>
          <p class="text-muted mb-0 small">Send personalized bulk broadcast emails to users with dynamic firm name</p>
        </div>
        <div class="d-flex align-items-center mt-2 mt-sm-0">
          <a href="/admin/settings/send-bulk-whatsapp" class="btn btn-outline-success btn-sm mr-2 font-weight-bold">
            <i class="fab fa-whatsapp mr-1"></i>Switch to Bulk WhatsApp
          </a>
          <a href="/admin/reports/user-send-msg-log" class="btn btn-outline-secondary btn-sm font-weight-bold">
            <i class="fa fa-list mr-1"></i>View Sent Msg Log
          </a>
        </div>
      </div>

      <!-- Quick Nav Tabs -->
      <ul class="nav nav-tabs-custom">
        <li class="nav-item">
          <a class="nav-link" href="/admin/settings/notifications"><i class="fa fa-bell mr-1"></i>Notification Templates</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="/admin/settings/send-bulk-whatsapp"><i class="fab fa-whatsapp mr-1 text-success"></i>Send Bulk WhatsApp</a>
        </li>
        <li class="nav-item">
          <a class="nav-link active" href="/admin/settings/send-bulk-email"><i class="fa fa-envelope mr-1 text-primary"></i>Send Bulk Email</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="/admin/settings/service-settings"><i class="fa fa-sliders mr-1 text-secondary"></i>Service Settings</a>
        </li>
      </ul>

      <div class="row">
        <!-- Main Form Column -->
        <div class="col-lg-7">
          <div class="card-custom">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="font-weight-bold text-dark"><i class="fa fa-pen mr-2 text-primary"></i>Compose Broadcast Email</span>
              <span id="targetBadge" class="badge badge-primary px-3 py-2 font-weight-bold" style="font-size:12px;">
                Target: <span id="targetCount">0</span> Users
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
                  <input type="text" id="userSearchInput" class="form-control" placeholder="Search by Firm Name, Username or Email...">
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

              <!-- 4. Email Subject Box -->
              <div class="form-group mb-3">
                <label for="emailSubject" class="font-weight-bold text-dark mb-1">
                  <i class="fa fa-heading text-primary mr-1"></i>Subject:
                </label>
                <input type="text" id="emailSubject" class="form-control" placeholder="Enter email subject here... (e.g. Important Update for [NAME])">
              </div>

              <!-- 5. Email Message Box -->
              <div class="form-group mb-4">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <label for="emailMessage" class="font-weight-bold text-dark mb-0">
                    <i class="fa fa-align-left text-primary mr-1"></i>Type your msg here:
                  </label>
                  <span id="msgStats" class="text-muted small">0 characters | 0 words</span>
                </div>
                <textarea id="emailMessage" class="form-control" rows="8" style="font-size:14px; line-height:1.6;" placeholder="Type your email message here... You can use [NAME] to insert each user's Firm Name."></textarea>
              </div>

              <!-- 6. Keyword Card -->
              <div class="card mb-4 border-info" style="background:#f0f9ff; border-radius:8px;">
                <div class="card-body p-3">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="font-weight-bold text-primary" style="font-size:13px;">
                      <i class="fa fa-tag mr-1"></i>Available Personalization Keyword
                    </span>
                    <span class="text-muted small">Click keyword below to insert into Subject or Message</span>
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
                          <td class="font-weight-bold text-dark">Firm Name / User Name</td>
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
                    <i class="fa fa-info-circle mr-1 text-info"></i>Jab aap email bhejenge, toh har user ko uska real Firm Name / Name Subject aur Message dono mein automatically deliver hoga.
                  </small>
                </div>
              </div>

              <!-- 7. Submit Button & Status Message -->
              <div class="d-flex align-items-center justify-content-between flex-wrap">
                <button type="button" id="btnSendEmail" class="btn btn-primary btn-lg px-4 font-weight-bold shadow-sm">
                  <i class="fa fa-paper-plane mr-2"></i>Send Bulk Email
                </button>
                <div id="sendingNotice" class="text-muted small mt-2 mt-sm-0" style="display:none;">
                  <span class="spinner-border spinner-border-sm text-primary mr-1"></span>Sending broadcast emails...
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- Right Column: Live Status & Dispatch Results -->
        <div class="col-lg-5">
          <div class="card-custom">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="font-weight-bold text-dark"><i class="fa fa-chart-pie mr-2 text-info"></i>Delivery Summary</span>
              <span id="statusBadge" class="badge badge-secondary px-2 py-1">Ready</span>
            </div>
            <div class="card-body">
              
              <!-- KPI Counters -->
              <div class="row mb-3">
                <div class="col-4">
                  <div class="kpi-box bg-light border">
                    <div class="kpi-num text-dark" id="kpiTarget">0</div>
                    <div class="kpi-title text-muted">Targeted</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="kpi-box bg-light border border-success">
                    <div class="kpi-num text-success" id="kpiSent">0</div>
                    <div class="kpi-title text-success">Sent</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="kpi-box bg-light border border-danger">
                    <div class="kpi-num text-danger" id="kpiFailed">0</div>
                    <div class="kpi-title text-danger">Failed</div>
                  </div>
                </div>
              </div>

              <!-- Progress Bar -->
              <div class="progress mb-4" style="height: 10px; display: none;" id="sendProgressBarContainer">
                <div id="sendProgressBar" class="progress-bar bg-primary progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%;"></div>
              </div>

              <!-- Results Table / Log -->
              <h6 class="font-weight-bold text-muted small text-uppercase mb-2">Live Dispatch Log</h6>
              <div class="border rounded p-2 bg-light" style="max-height: 380px; overflow-y: auto;" id="resultsLogContainer">
                <div class="text-center text-muted py-4 small" id="noLogsNotice">
                  <i class="fa fa-envelope-open fa-2x mb-2 text-muted" style="opacity:0.4;"></i>
                  <div>No broadcast sent yet. Compose your subject &amp; message and click <b>Send Bulk Email</b>.</div>
                </div>
                <table class="table table-sm table-hover bg-white mb-0" id="resultsTable" style="display:none; font-size:12px;">
                  <thead class="thead-light">
                    <tr>
                      <th>#</th>
                      <th>User</th>
                      <th>Email</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="resultsTableBody"></tbody>
                </table>
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
  const subjectInput = document.getElementById('emailSubject');
  const messageTextarea = document.getElementById('emailMessage');
  const msgStats = document.getElementById('msgStats');
  const targetCountEl = document.getElementById('targetCount');

  // Track last active input for keyword insertion
  let lastActiveField = messageTextarea;
  subjectInput.addEventListener('focus', () => { lastActiveField = subjectInput; });
  messageTextarea.addEventListener('focus', () => { lastActiveField = messageTextarea; });

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
    const count = targets.length;
    targetCountEl.textContent = count;
    document.getElementById('kpiTarget').textContent = count;
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
             u.email.includes(q);
    });

    if (filtered.length === 0) {
      userCheckboxList.innerHTML = '<div class="text-muted small p-2 text-center">No users match your search.</div>';
      return;
    }

    userCheckboxList.innerHTML = filtered.map(u => {
      const checked = selectedUserIds.has(u.id) ? 'checked' : '';
      const emailBadge = u.hasEmail 
        ? '<span class="badge badge-primary ml-1" style="font-size:10px;">' + escapeHtml(u.email) + '</span>'
        : '<span class="badge badge-warning text-dark ml-1" style="font-size:10px;">No Email</span>';
      return '<div class="custom-control custom-checkbox py-1 border-bottom">' +
        '<input type="checkbox" class="custom-control-input chk-user" id="chk_' + u.id + '" data-id="' + u.id + '" ' + checked + '>' +
        '<label class="custom-control-label d-flex align-items-center justify-content-between" for="chk_' + u.id + '" style="cursor:pointer; font-size:13px;">' +
          '<span><b>' + escapeHtml(u.name) + '</b> <span class="text-muted">(@' + escapeHtml(u.username) + ')</span></span>' +
          emailBadge +
        '</label>' +
      '</div>';
    }).join('');

    // Attach listeners
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
      if (!q || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.email.includes(q)) {
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

  // Insert Keyword at cursor position into active field
  function insertKeyword(keyword) {
    const targetEl = lastActiveField || messageTextarea;
    if (!targetEl) return;
    const start = targetEl.selectionStart || targetEl.value.length;
    const end = targetEl.selectionEnd || targetEl.value.length;
    const val = targetEl.value;
    targetEl.value = val.substring(0, start) + keyword + val.substring(end);
    targetEl.focus();
    targetEl.selectionStart = targetEl.selectionEnd = start + keyword.length;
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
    const text = messageTextarea.value || '';
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\\s+/).length : 0;
    msgStats.textContent = chars + ' characters | ' + words + ' words';
  }
  messageTextarea.addEventListener('input', updateMsgStats);

  // Send Bulk Email action
  const btnSendEmail = document.getElementById('btnSendEmail');
  const sendingNotice = document.getElementById('sendingNotice');
  const progressBarContainer = document.getElementById('sendProgressBarContainer');
  const progressBar = document.getElementById('sendProgressBar');
  const resultsTable = document.getElementById('resultsTable');
  const resultsTableBody = document.getElementById('resultsTableBody');
  const noLogsNotice = document.getElementById('noLogsNotice');
  const statusBadge = document.getElementById('statusBadge');

  btnSendEmail.addEventListener('click', async () => {
    const subject = subjectInput.value.trim();
    const message = messageTextarea.value.trim();

    if (!subject) {
      alert('Please enter an email subject before sending.');
      subjectInput.focus();
      return;
    }

    if (!message) {
      alert('Please enter your email message before sending.');
      messageTextarea.focus();
      return;
    }

    const targetUsers = getTargetUsers();
    if (targetUsers.length === 0) {
      alert('No recipients selected. Please select at least one user.');
      return;
    }

    const confirmMsg = 'Confirm sending bulk broadcast email to ' + targetUsers.length + ' users?\\n\\nSubject: ' + subject + '\\n\\nNote: [NAME] will be replaced with each user\\\'s Firm Name.';
    if (!confirm(confirmMsg)) return;

    btnSendEmail.disabled = true;
    sendingNotice.style.display = 'inline-block';
    progressBarContainer.style.display = 'block';
    progressBar.style.width = '30%';
    statusBadge.className = 'badge badge-warning px-2 py-1';
    statusBadge.textContent = 'Sending...';

    const payload = {
      targetType: modeSpecific.checked ? 'specific' : 'all',
      userStatus: document.querySelector('input[name="userStatusFilter"]:checked')?.value || 'all',
      userIds: modeSpecific.checked ? Array.from(selectedUserIds) : [],
      subject: subject,
      message: message,
    };

    try {
      const res = await fetch('/api/admin/bulk-email/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      progressBar.style.width = '100%';

      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch bulk email.');
      }

      // Update KPIs
      document.getElementById('kpiTarget').textContent = data.total || targetUsers.length;
      document.getElementById('kpiSent').textContent = data.sent || 0;
      document.getElementById('kpiFailed').textContent = data.failed || 0;

      // Render Results Table
      noLogsNotice.style.display = 'none';
      resultsTable.style.display = 'table';
      resultsTableBody.innerHTML = (data.results || []).map((r, i) => {
        const badge = r.sent
          ? '<span class="badge badge-success">Sent</span>'
          : '<span class="badge badge-danger">Failed</span>';
        const reason = r.reason ? '<div class="text-muted" style="font-size:10px;">' + escapeHtml(r.reason) + '</div>' : '';
        return '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td><b>' + escapeHtml(r.name) + '</b></td>' +
          '<td>' + escapeHtml(r.email || '-') + '</td>' +
          '<td>' + badge + reason + '</td>' +
        '</tr>';
      }).join('');

      statusBadge.className = 'badge badge-success px-2 py-1';
      statusBadge.textContent = 'Completed';
      alert('Bulk Email broadcast completed! Sent: ' + (data.sent || 0) + ', Failed: ' + (data.failed || 0));
    } catch (err) {
      statusBadge.className = 'badge badge-danger px-2 py-1';
      statusBadge.textContent = 'Error';
      alert('Error: ' + err.message);
    } finally {
      btnSendEmail.disabled = false;
      sendingNotice.style.display = 'none';
      setTimeout(() => { progressBarContainer.style.display = 'none'; }, 2000);
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
      currentPath: '/admin/settings/send-bulk-email',
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

  return { sendAdminSendBulkEmailPage };
};
