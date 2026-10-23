'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');
const { seedNotificationTemplates } = require('../lib/notification-service');

module.exports = function createAdminNotificationsPage({ db }) {
  async function sendAdminNotificationsPage(admin, response) {
    // Fetch all notification templates sorted by sort_order
    let result = await db.query(
      `SELECT id, event_key, title, category, recipient_type,
              whatsapp_enabled, email_enabled, whatsapp_template,
              email_subject, email_template, allowed_keywords, sort_order, updated_at
       FROM admin_notification_templates
       ORDER BY sort_order ASC, title ASC`
    ).catch(() => ({ rows: [] }));

    let templates = result.rows || [];
    if (templates.length === 0) {
      await seedNotificationTemplates(db).catch(() => {});
      result = await db.query(
        `SELECT id, event_key, title, category, recipient_type,
                whatsapp_enabled, email_enabled, whatsapp_template,
                email_subject, email_template, allowed_keywords, sort_order, updated_at
         FROM admin_notification_templates
         ORDER BY sort_order ASC, title ASC`
      ).catch(() => ({ rows: [] }));
      templates = result.rows || [];
    }

    const stats = {
      total: templates.length,
      waActive: templates.filter(t => t.whatsapp_enabled).length,
      emailActive: templates.filter(t => t.email_enabled).length,
      adminAlerts: templates.filter(t => t.recipient_type === 'admin').length,
    };

    const categories = [...new Set(templates.map(t => t.category))];

    const templatesJson = escapeHtml(JSON.stringify(templates));

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Notification Settings - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .font-monospace { font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .stat-card { border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    .notif-card { border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 4px 16px rgba(0,0,0,0.05); }
    
    /* Left List Items */
    .notif-item {
      padding: 12px 14px;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
      transition: all 0.15s ease-in-out;
      border-left: 3px solid transparent;
    }
    .notif-item:hover {
      background-color: #f8fafc;
    }
    .notif-item.active {
      background-color: #eff6ff;
      border-left-color: #2563eb;
    }
    .notif-item-title {
      font-size: 13.5px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 3px;
    }
    .notif-item.active .notif-item-title {
      color: #1d4ed8;
      font-weight: 700;
    }
    
    /* Compact Channel Toggles */
    .btn-toggle-wa, .btn-toggle-email {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 12px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s;
    }
    .btn-toggle-wa.active {
      background-color: #dcfce7;
      color: #15803d;
      border-color: #86efac;
    }
    .btn-toggle-wa.inactive {
      background-color: #f1f5f9;
      color: #94a3b8;
      border-color: #cbd5e1;
    }
    .btn-toggle-email.active {
      background-color: #dbeafe;
      color: #1d4ed8;
      border-color: #93c5fd;
    }
    .btn-toggle-email.inactive {
      background-color: #f1f5f9;
      color: #94a3b8;
      border-color: #cbd5e1;
    }

    /* Keyword Pills */
    .keyword-pill {
      font-size: 11.5px;
      font-weight: 600;
      font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      padding: 4px 10px;
      border-radius: 6px;
      background: #f1f5f9;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      margin-right: 6px;
      margin-bottom: 6px;
      transition: all 0.12s ease-in-out;
    }
    .keyword-pill:hover {
      background: #2563eb;
      color: #ffffff;
      border-color: #1d4ed8;
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(37,99,235,0.25);
    }

    /* Preview Bubble */
    .preview-wa-bubble {
      background-color: #e2f7cb;
      border-radius: 8px 8px 8px 0px;
      padding: 10px 14px;
      max-width: 90%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      position: relative;
      font-size: 13px;
      color: #111b21;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .preview-email-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #ffffff;
      padding: 14px;
      font-size: 13px;
    }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    <div class="sticky">
      <div class="horizontal-main hor-menu clearfix">
        <div class="horizontal-mainwrapper container-fluid px-2 clearfix">
          <nav class="horizontalMenu clearfix">
            <ul class="horizontalMenu-list">
              <li><a href="/admin/">Dashboard</a></li>
              <li><a href="#">User</a>
                <ul class="sub-menu">
                  <li><a href="/admin/users/list">List User</a></li>
                </ul>
              </li>
              <li><a href="#">Payment</a>
                <ul class="sub-menu">
                  <li><a href="/admin/payment/fund-request">Fund Request</a></li>
                  <li><a href="/admin/payment/bank-list">Bank List</a></li>
                </ul>
              </li>
              <li><a href="/admin/seller-api/requests">Seller API Requests</a></li>
              <li class="active"><a href="#" style="background:#25377a; color:#fff !important;">Settings</a>
                <ul class="sub-menu">
                  <li><a href="/admin/settings/create-operator">Create Operator</a></li>
                  <li><a href="/admin/settings/show-operator">Show Operator</a></li>
                  <li><a href="/admin/settings/service-settings">Service Settings</a></li>
                  <li><a href="/admin/settings/notifications" class="font-weight-bold text-primary">Notification Settings</a></li>
                  <li><a href="/admin/settings/wallet-settings">Wallet Settings</a></li>
                  <li><a href="/admin/settings/website-settings">Website Settings</a></li>
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </div>

    <main class="main-content">
      <div class="container-fluid px-3 py-3">
        
        <!-- Header -->
        <div class="page-header d-flex justify-content-between align-items-center mb-3">
          <div>
            <h4 class="page-title mb-1 font-weight-bold text-dark">
              <i class="fa fa-bell text-primary mr-2"></i> Notification Settings &amp; Templates
            </h4>
            <p class="text-muted mb-0 small">Configure automated notification templates and toggle WhatsApp and Email delivery per event.</p>
          </div>
          <div>
            <a href="/admin/settings/service-settings" class="btn btn-outline-secondary btn-sm mr-1">
              <i class="fa fa-cogs mr-1"></i> Gateway Settings
            </a>
            <button type="button" class="btn btn-outline-primary btn-sm" onclick="location.reload()">
              <i class="fa fa-refresh mr-1"></i> Refresh
            </button>
          </div>
        </div>

        <div id="topAlert" class="alert alert-success alert-dismissible fade show py-2 small" style="display:none;" role="alert">
          <span id="topAlertText"></span>
          <button type="button" class="close py-2" onclick="document.getElementById('topAlert').style.display='none'"><span>&times;</span></button>
        </div>

        <!-- KPI Metrics -->
        <div class="row mb-3">
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="card stat-card mb-0">
              <div class="card-body p-3 d-flex align-items-center justify-content-between">
                <div>
                  <div class="text-muted small font-weight-bold">Total Notifications</div>
                  <div class="h4 font-weight-bold text-dark mb-0 mt-1">${stats.total} Events</div>
                </div>
                <div class="bg-primary-transparent rounded p-2 text-primary" style="font-size:22px;">
                  <i class="fa fa-list-check"></i>
                </div>
              </div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="card stat-card mb-0">
              <div class="card-body p-3 d-flex align-items-center justify-content-between">
                <div>
                  <div class="text-muted small font-weight-bold">WhatsApp Active</div>
                  <div class="h4 font-weight-bold text-success mb-0 mt-1">${stats.waActive} / ${stats.total}</div>
                </div>
                <div class="bg-success-transparent rounded p-2 text-success" style="font-size:22px;">
                  <i class="fa-brands fa-whatsapp"></i>
                </div>
              </div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="card stat-card mb-0">
              <div class="card-body p-3 d-flex align-items-center justify-content-between">
                <div>
                  <div class="text-muted small font-weight-bold">Email Active</div>
                  <div class="h4 font-weight-bold text-primary mb-0 mt-1">${stats.emailActive} / ${stats.total}</div>
                </div>
                <div class="bg-info-transparent rounded p-2 text-primary" style="font-size:22px;">
                  <i class="fa fa-envelope"></i>
                </div>
              </div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="card stat-card mb-0">
              <div class="card-body p-3 d-flex align-items-center justify-content-between">
                <div>
                  <div class="text-muted small font-weight-bold">Admin Alert Events</div>
                  <div class="h4 font-weight-bold text-warning mb-0 mt-1">${stats.adminAlerts} Alerts</div>
                </div>
                <div class="bg-warning-transparent rounded p-2 text-warning" style="font-size:22px;">
                  <i class="fa fa-shield-halved"></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Master / Detail Container -->
        <div class="row">
          <!-- Left: List of Notifications with Compact On/Off Toggles -->
          <div class="col-xl-5 col-lg-5 mb-3">
            <div class="card notif-card h-100">
              <div class="card-header bg-white py-2 px-3 border-bottom">
                <div class="d-flex justify-content-between align-items-center">
                  <h6 class="font-weight-bold text-dark mb-0" style="font-size:14px;">
                    <i class="fa fa-list mr-1 text-primary"></i> Notification List (${templates.length})
                  </h6>
                  <span class="badge badge-light border text-muted" style="font-size:11px;">WA &amp; Email Delivery</span>
                </div>
              </div>
              
              <div class="p-2 border-bottom bg-light">
                <div class="input-group input-group-sm">
                  <div class="input-group-prepend"><span class="input-group-text"><i class="fa fa-search"></i></span></div>
                  <input type="text" class="form-control" id="searchNotifInput" placeholder="Filter notifications by name...">
                </div>
              </div>

              <div class="card-body p-0" style="max-height: 720px; overflow-y: auto;" id="notifListContainer">
                <!-- Dynamically rendered list items -->
              </div>
            </div>
          </div>

          <!-- Right: Edit Box & Content Customizer -->
          <div class="col-xl-7 col-lg-7 mb-3">
            <div class="card notif-card h-100">
              <div class="card-header bg-white py-2 px-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <span class="badge badge-primary px-2 py-1 mr-1" id="detailRecipientBadge">User</span>
                  <strong class="text-dark font-weight-bold" id="detailTitle" style="font-size: 15px;">Select a notification</strong>
                  <div class="text-muted small font-monospace" id="detailEventKey" style="font-size:11px;"></div>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <button type="button" class="btn btn-primary btn-sm font-weight-bold shadow-sm" id="btnSaveTemplate">
                    <i class="fa fa-save mr-1"></i> Save Changes
                  </button>
                </div>
              </div>

              <div class="card-body p-3">
                <div id="noSelectionNotice" class="text-center py-5 text-muted" style="display:none;">
                  <i class="fa fa-envelope-open-text fa-3x mb-2 text-secondary"></i>
                  <p class="mb-0">Please select a notification event from the left list to edit its content and channels.</p>
                </div>

                <div id="editorContent">
                  <!-- Channel Delivery Switches -->
                  <div class="row mb-3 bg-light p-2 rounded mx-0 border">
                    <div class="col-sm-6 d-flex align-items-center justify-content-between py-1">
                      <div class="d-flex align-items-center">
                        <i class="fa-brands fa-whatsapp text-success fa-lg mr-2"></i>
                        <div>
                          <span class="font-weight-bold text-dark small d-block">Send WhatsApp</span>
                          <small class="text-muted">Deliver WhatsApp message on this event</small>
                        </div>
                      </div>
                      <div class="custom-control custom-switch ml-2">
                        <input type="checkbox" class="custom-control-input" id="switchWhatsapp">
                        <label class="custom-control-label" for="switchWhatsapp"></label>
                      </div>
                    </div>
                    <div class="col-sm-6 d-flex align-items-center justify-content-between py-1 border-left">
                      <div class="d-flex align-items-center">
                        <i class="fa fa-envelope text-primary fa-lg mr-2"></i>
                        <div>
                          <span class="font-weight-bold text-dark small d-block">Send Email</span>
                          <small class="text-muted">Deliver email message on this event</small>
                        </div>
                      </div>
                      <div class="custom-control custom-switch ml-2">
                        <input type="checkbox" class="custom-control-input" id="switchEmail">
                        <label class="custom-control-label" for="switchEmail"></label>
                      </div>
                    </div>
                  </div>

                  <!-- Dynamic / Required Keywords Section -->
                  <div class="form-group mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <label class="font-weight-bold text-dark small mb-0">
                        <i class="fa fa-tags text-primary mr-1"></i> Allowed Event Keywords
                      </label>
                      <small class="text-muted"><i class="fa fa-mouse-pointer mr-1"></i> Click any tag to insert into message</small>
                    </div>
                    <div class="p-2 border rounded bg-white d-flex flex-wrap align-items-center" id="keywordPillsContainer" style="min-height: 40px;">
                      <!-- Populated dynamically based on event -->
                    </div>
                  </div>

                  <!-- WhatsApp Message Content -->
                  <div class="form-group mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <label class="font-weight-bold text-dark small mb-0">
                        <i class="fa-brands fa-whatsapp text-success mr-1"></i> WhatsApp Message Content <span class="text-danger">*</span>
                      </label>
                      <small class="text-muted font-monospace" id="waCharCount">0 characters</small>
                    </div>
                    <textarea class="form-control font-monospace" id="waTemplateInput" rows="4" placeholder="Type WhatsApp message template with {{keywords}}..." style="font-size: 13px;"></textarea>
                  </div>

                  <!-- Email Subject & Content -->
                  <div class="form-group mb-2">
                    <label class="font-weight-bold text-dark small mb-1">
                      <i class="fa fa-heading text-primary mr-1"></i> Email Subject <span class="text-danger">*</span>
                    </label>
                    <input type="text" class="form-control" id="emailSubjectInput" placeholder="e.g. Your Account Verification OTP - {{app_name}}">
                  </div>

                  <div class="form-group mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <label class="font-weight-bold text-dark small mb-0">
                        <i class="fa fa-envelope text-primary mr-1"></i> Email Body Template <span class="text-danger">*</span>
                      </label>
                      <small class="text-muted font-monospace" id="emailCharCount">0 characters</small>
                    </div>
                    <textarea class="form-control font-monospace" id="emailTemplateInput" rows="6" placeholder="Type Email body template with {{keywords}}..." style="font-size: 13px;"></textarea>
                  </div>

                  <!-- Live Rendered Preview -->
                  <div class="card bg-light border mb-0">
                    <div class="card-header bg-transparent py-2 border-bottom d-flex justify-content-between align-items-center">
                      <span class="font-weight-bold small text-dark"><i class="fa fa-eye text-info mr-1"></i> Simulated Live Preview</span>
                      <small class="text-muted">Simulates variable substitution</small>
                    </div>
                    <div class="card-body p-3">
                      <div class="mb-2">
                        <span class="badge badge-success px-2 py-1 mb-1"><i class="fa-brands fa-whatsapp mr-1"></i> WhatsApp Preview</span>
                        <div class="preview-wa-bubble" id="previewWaBubble">—</div>
                      </div>
                      <div class="mt-3">
                        <span class="badge badge-primary px-2 py-1 mb-1"><i class="fa fa-envelope mr-1"></i> Email Preview</span>
                        <div class="preview-email-box">
                          <div class="font-weight-bold border-bottom pb-1 mb-2 text-dark" id="previewEmailSubject">—</div>
                          <div style="white-space: pre-wrap;" id="previewEmailBody">—</div>
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
    </main>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="/auth-client.js"></script>
<script>
(function() {
  const rawTemplates = ${templatesJson};
  let currentKey = (rawTemplates[0] && rawTemplates[0].event_key) || null;
  let lastFocusedInput = null;

  // Track focused textarea/input for keyword insertion
  ['waTemplateInput', 'emailSubjectInput', 'emailTemplateInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('focus', () => { lastFocusedInput = el; });
    }
  });

  function showToast(msg, isError = false) {
    const alertBox = document.getElementById('topAlert');
    const textEl = document.getElementById('topAlertText');
    alertBox.className = 'alert py-2 small alert-dismissible fade show ' + (isError ? 'alert-danger' : 'alert-success');
    textEl.textContent = msg;
    alertBox.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => { alertBox.style.display = 'none'; }, 3500);
  }

  function renderList(filterText = '') {
    const container = document.getElementById('notifListContainer');
    const term = filterText.toLowerCase().trim();

    const filtered = rawTemplates.filter(t => {
      if (!term) return true;
      return t.title.toLowerCase().includes(term) ||
             t.event_key.toLowerCase().includes(term) ||
             t.category.toLowerCase().includes(term);
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="text-center py-4 text-muted small"><i class="fa fa-search mb-1 d-block" style="font-size:18px;"></i>No notifications match your search.</div>';
      return;
    }

    container.innerHTML = filtered.map(t => {
      const isSelected = t.event_key === currentKey;
      const isAdmin = t.recipient_type === 'admin';
      const waClass = t.whatsapp_enabled ? 'active' : 'inactive';
      const waLabel = t.whatsapp_enabled ? 'WA ON' : 'WA OFF';
      const emailClass = t.email_enabled ? 'active' : 'inactive';
      const emailLabel = t.email_enabled ? 'MAIL ON' : 'MAIL OFF';
      const recBadge = isAdmin 
        ? '<span class="badge badge-warning text-dark px-1" style="font-size:10px;"><i class="fa fa-user-shield mr-1"></i>Admin Alert</span>' 
        : '<span class="badge badge-light border text-muted px-1" style="font-size:10px;">User</span>';

      return \`
        <div class="notif-item \${isSelected ? 'active' : ''}" data-key="\${t.event_key}">
          <div class="d-flex justify-content-between align-items-start">
            <div style="flex: 1; min-width: 0;">
              <div class="d-flex align-items-center mb-1">
                <span class="notif-item-title text-truncate mr-2">\${t.title}</span>
                \${recBadge}
              </div>
              <div class="text-muted font-monospace" style="font-size: 11px;">\${t.event_key}</div>
            </div>
            <div class="d-flex gap-1 ml-2" onclick="event.stopPropagation();">
              <button type="button" class="btn btn-toggle-wa \${waClass}" data-key="\${t.event_key}" title="Toggle WhatsApp Delivery">
                <i class="fa-brands fa-whatsapp mr-1"></i>\${waLabel}
              </button>
              <button type="button" class="btn btn-toggle-email \${emailClass} ml-1" data-key="\${t.event_key}" title="Toggle Email Delivery">
                <i class="fa fa-envelope mr-1"></i>\${emailLabel}
              </button>
            </div>
          </div>
        </div>
      \`;
    }).join('');

    // Bind item selection clicks
    container.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.getAttribute('data-key');
        selectNotification(key);
      });
    });

    // Bind quick toggle buttons in list
    container.querySelectorAll('.btn-toggle-wa').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-key');
        const item = rawTemplates.find(x => x.event_key === key);
        if (!item) return;
        const nextState = !item.whatsapp_enabled;
        await quickToggle(key, 'whatsapp', nextState);
      });
    });

    container.querySelectorAll('.btn-toggle-email').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-key');
        const item = rawTemplates.find(x => x.event_key === key);
        if (!item) return;
        const nextState = !item.email_enabled;
        await quickToggle(key, 'email', nextState);
      });
    });
  }

  function selectNotification(key) {
    currentKey = key;
    const item = rawTemplates.find(x => x.event_key === key);
    if (!item) return;

    renderList(document.getElementById('searchNotifInput').value);

    // Update Header
    document.getElementById('detailTitle').textContent = item.title;
    document.getElementById('detailEventKey').textContent = item.event_key + ' (' + item.category + ')';
    const recBadge = document.getElementById('detailRecipientBadge');
    if (item.recipient_type === 'admin') {
      recBadge.className = 'badge badge-warning text-dark px-2 py-1 mr-1';
      recBadge.innerHTML = '<i class="fa fa-user-shield mr-1"></i> Admin Number Alert';
    } else {
      recBadge.className = 'badge badge-primary px-2 py-1 mr-1';
      recBadge.innerHTML = '<i class="fa fa-user mr-1"></i> Client / User Message';
    }

    // Switches
    document.getElementById('switchWhatsapp').checked = Boolean(item.whatsapp_enabled);
    document.getElementById('switchEmail').checked = Boolean(item.email_enabled);

    // Inputs
    document.getElementById('waTemplateInput').value = item.whatsapp_template || '';
    document.getElementById('emailSubjectInput').value = item.email_subject || '';
    document.getElementById('emailTemplateInput').value = item.email_template || '';

    // Render keyword pills
    const pillsContainer = document.getElementById('keywordPillsContainer');
    const keywords = Array.isArray(item.allowed_keywords) ? item.allowed_keywords : [];
    if (keywords.length > 0) {
      pillsContainer.innerHTML = keywords.map(kw => {
        const fullTag = '{{' + kw + '}}';
        return '<button type="button" class="keyword-pill" data-tag="' + fullTag + '" title="Click to insert ' + fullTag + '"><i class="fa fa-plus text-primary mr-1" style="font-size:9px;"></i>' + fullTag + '</button>';
      }).join('');

      pillsContainer.querySelectorAll('.keyword-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const tag = pill.getAttribute('data-tag');
          insertTagIntoActiveInput(tag);
        });
      });
    } else {
      pillsContainer.innerHTML = '<span class="text-muted small">No specific dynamic variables for this template.</span>';
    }

    updateCounters();
    updatePreview();
  }

  function insertTagIntoActiveInput(tag) {
    const target = lastFocusedInput || document.getElementById('waTemplateInput');
    if (!target) return;

    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const val = target.value;
    target.value = val.substring(0, start) + tag + val.substring(end);
    target.focus();
    target.selectionStart = target.selectionEnd = start + tag.length;

    updateCounters();
    updatePreview();
  }

  function updateCounters() {
    const wa = document.getElementById('waTemplateInput').value;
    const email = document.getElementById('emailTemplateInput').value;
    document.getElementById('waCharCount').textContent = wa.length + ' characters';
    document.getElementById('emailCharCount').textContent = email.length + ' characters';
  }

  function updatePreview() {
    const item = rawTemplates.find(x => x.event_key === currentKey);
    if (!item) return;

    const sampleData = {
      name: 'Rohan Sharma',
      user_name: 'Rohan Sharma',
      username: 'rohan_pay',
      seller_name: 'FastPay Solutions',
      otp: '749201',
      expiry_minutes: '10',
      app_name: 'Exchange Portal',
      login_url: window.location.origin + '/login',
      kyc_url: window.location.origin + '/setting/kyc',
      reset_url: window.location.origin + '/reset-password?token=xyz987',
      date_time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      ip_address: '103.21.244.52',
      device: 'Chrome on Windows 11',
      amount: '5000.00',
      utr: '429381928301',
      bank_name: 'State Bank of India',
      account_number: '394829103948',
      admin_url: window.location.origin + '/admin/payment/fund-request',
      status: 'approved',
      reason: 'Transaction verified and credited',
      wallet_balance: '12,500.00',
      current_balance: '120.00',
      threshold_amount: '500.00',
      topup_url: window.location.origin + '/fund/wallet-topup-request',
      order_id: 'EX-93821',
      operator: 'Jio Mobile',
      mobile_number: '9876543210',
      complaint_id: 'DISP-4012'
    };

    const substitute = (text) => {
      if (!text) return '—';
      return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
        return sampleData[k] !== undefined ? sampleData[k] : ('{{' + k + '}}');
      });
    };

    const waText = document.getElementById('waTemplateInput').value;
    const emailSubject = document.getElementById('emailSubjectInput').value;
    const emailBody = document.getElementById('emailTemplateInput').value;

    document.getElementById('previewWaBubble').textContent = substitute(waText);
    document.getElementById('previewEmailSubject').textContent = 'Subject: ' + substitute(emailSubject);
    document.getElementById('previewEmailBody').textContent = substitute(emailBody);
  }

  // Live preview typing listeners
  document.getElementById('waTemplateInput').addEventListener('input', () => { updateCounters(); updatePreview(); });
  document.getElementById('emailSubjectInput').addEventListener('input', updatePreview);
  document.getElementById('emailTemplateInput').addEventListener('input', () => { updateCounters(); updatePreview(); });

  // Search filter
  document.getElementById('searchNotifInput').addEventListener('input', (e) => {
    renderList(e.target.value);
  });

  // Quick toggle helper
  async function quickToggle(key, channel, nextState) {
    try {
      const res = await fetch('/api/admin/settings/notifications/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ eventKey: key, channel, enabled: nextState })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update channel toggle.');

      const item = rawTemplates.find(x => x.event_key === key);
      if (item) {
        if (channel === 'whatsapp') item.whatsapp_enabled = nextState;
        if (channel === 'email') item.email_enabled = nextState;
      }
      renderList(document.getElementById('searchNotifInput').value);
      if (currentKey === key) {
        document.getElementById('switchWhatsapp').checked = Boolean(item.whatsapp_enabled);
        document.getElementById('switchEmail').checked = Boolean(item.email_enabled);
      }
      showToast(key + ' ' + channel.toUpperCase() + ' delivery turned ' + (nextState ? 'ON' : 'OFF'));
    } catch (err) {
      showToast(err.message, true);
    }
  }

  // Save changes button
  document.getElementById('btnSaveTemplate').addEventListener('click', async () => {
    const item = rawTemplates.find(x => x.event_key === currentKey);
    if (!item) return;

    const btn = document.getElementById('btnSaveTemplate');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving...';

    const payload = {
      whatsapp_enabled: document.getElementById('switchWhatsapp').checked,
      email_enabled: document.getElementById('switchEmail').checked,
      whatsapp_template: document.getElementById('waTemplateInput').value.trim(),
      email_subject: document.getElementById('emailSubjectInput').value.trim(),
      email_template: document.getElementById('emailTemplateInput').value.trim()
    };

    try {
      const res = await fetch('/api/admin/settings/notifications/' + currentKey, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save notification template.');

      // Update in memory
      Object.assign(item, payload);
      renderList(document.getElementById('searchNotifInput').value);
      showToast('Notification template for "' + item.title + '" saved successfully!');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa fa-save mr-1"></i> Save Changes';
    }
  });

  // Initial render
  if (rawTemplates.length > 0) {
    selectNotification(rawTemplates[0].event_key);
  } else {
    document.getElementById('noSelectionNotice').style.display = 'block';
    document.getElementById('editorContent').style.display = 'none';
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
      currentPath: '/admin/settings/notifications',
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

  return { sendAdminNotificationsPage };
};
