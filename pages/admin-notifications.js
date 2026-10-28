'use strict';

const { escapeHtml, useFullWidthContainers } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');
const { seedNotificationTemplates, DEFAULT_NOTIFICATION_TEMPLATES } = require('../lib/notification-service');

module.exports = function createAdminNotificationsPage({ db }) {
  async function sendAdminNotificationsPage(admin, response) {
    // Fetch all notification templates sorted by sort_order
    let result = await db.query(
      `SELECT id, event_key, title, category, recipient_type,
              whatsapp_enabled, email_enabled, sms_enabled,
              whatsapp_template, email_subject, email_template, sms_template,
              allowed_keywords, sort_order, updated_at
       FROM admin_notification_templates
       ORDER BY sort_order ASC, title ASC`
    ).catch(() => ({ rows: [] }));

    let templates = result.rows || [];
    if (templates.length === 0 || (Array.isArray(DEFAULT_NOTIFICATION_TEMPLATES) && templates.length < DEFAULT_NOTIFICATION_TEMPLATES.length)) {
      await seedNotificationTemplates(db).catch(() => {});
      result = await db.query(
        `SELECT id, event_key, title, category, recipient_type,
                whatsapp_enabled, email_enabled, sms_enabled,
                whatsapp_template, email_subject, email_template, sms_template,
                allowed_keywords, sort_order, updated_at
         FROM admin_notification_templates
         ORDER BY sort_order ASC, title ASC`
      ).catch(() => ({ rows: [] }));
      templates = result.rows || [];
    }

    // Pre-render table rows on server side so data is immediately visible
    const rowsHtml = templates.map((t, idx) => {
      const isAdmin = t.recipient_type === 'admin';
      const waChecked = Boolean(t.whatsapp_enabled);
      const emailChecked = Boolean(t.email_enabled);
      const smsChecked = Boolean(t.sms_enabled);

      const recBadge = isAdmin 
        ? '<span class="badge badge-warning text-dark px-1 ml-1" style="font-size:10px;"><i class="fa fa-shield-halved mr-1"></i>Admin Alert</span>' 
        : '';

      return `
        <tr data-key="${escapeHtml(t.event_key)}" id="row-${escapeHtml(t.event_key)}">
          <td class="col-sr text-center font-weight-bold text-muted">${idx + 1}</td>
          <td class="col-type">
            <div class="d-flex align-items-center flex-wrap">
              <span class="type-title mr-1 font-weight-bold">${escapeHtml(t.title)}</span>
              ${recBadge}
            </div>
            <div class="type-key text-muted small font-monospace">${escapeHtml(t.event_key)}</div>
          </td>
          <td class="text-center">
            <div class="switch-wrapper" data-channel="whatsapp" data-key="${escapeHtml(t.event_key)}">
              <label class="custom-switch-slider mb-0">
                <input type="checkbox" class="toggle-channel-wa" data-key="${escapeHtml(t.event_key)}" ${waChecked ? 'checked' : ''}>
                <span class="slider-track"></span>
              </label>
              <span class="switch-status-label ${waChecked ? 'status-yes' : 'status-no'}">${waChecked ? 'Yes' : 'No'}</span>
            </div>
          </td>
          <td class="text-center">
            <div class="switch-wrapper" data-channel="email" data-key="${escapeHtml(t.event_key)}">
              <label class="custom-switch-slider mb-0">
                <input type="checkbox" class="toggle-channel-email" data-key="${escapeHtml(t.event_key)}" ${emailChecked ? 'checked' : ''}>
                <span class="slider-track"></span>
              </label>
              <span class="switch-status-label ${emailChecked ? 'status-yes' : 'status-no'}">${emailChecked ? 'Yes' : 'No'}</span>
            </div>
          </td>
          <td class="text-center">
            <div class="switch-wrapper" data-channel="sms" data-key="${escapeHtml(t.event_key)}">
              <label class="custom-switch-slider mb-0">
                <input type="checkbox" class="toggle-channel-sms" data-key="${escapeHtml(t.event_key)}" ${smsChecked ? 'checked' : ''}>
                <span class="slider-track"></span>
              </label>
              <span class="switch-status-label ${smsChecked ? 'status-yes' : 'status-no'}">${smsChecked ? 'Yes' : 'No'}</span>
            </div>
          </td>
          <td class="text-center">
            <button type="button" class="btn-content-edit" data-key="${escapeHtml(t.event_key)}">
              Edit
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const safeJsonPayload = JSON.stringify(templates).replace(/</g, '\\u003c');

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
    .card-notif-table {
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      box-shadow: 0 4px 16px rgba(0,0,0,0.04);
      overflow: hidden;
    }
    
    /* Table Styling matching reference image */
    .notif-table {
      margin-bottom: 0;
      border-collapse: separate;
      border-spacing: 0;
    }
    .notif-table thead th {
      background-color: #f8fafc;
      color: #475569;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      padding: 14px 16px;
      border-bottom: 1px solid #e2e8f0;
      border-top: none;
      vertical-align: middle;
    }
    .notif-table tbody tr {
      transition: background-color 0.15s ease-in-out;
    }
    .notif-table tbody tr:hover {
      background-color: #f8fafc;
    }
    .notif-table tbody td {
      padding: 12px 16px;
      vertical-align: middle;
      border-bottom: 1px solid #f1f5f9;
      font-size: 13.5px;
      color: #1e293b;
    }
    
    /* Sr No column */
    .col-sr {
      width: 70px;
    }
    
    /* Type column */
    .col-type {
      min-width: 260px;
    }
    .type-title {
      font-size: 13.5px;
      color: #1e293b;
      margin-bottom: 2px;
    }
    .type-key {
      font-size: 11.5px;
      color: #64748b;
    }
    
    /* Modern Slider Switch matching reference image */
    .switch-wrapper {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      user-select: none;
      justify-content: center;
    }
    .custom-switch-slider {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      flex-shrink: 0;
    }
    .custom-switch-slider input {
      opacity: 0;
      width: 0;
      height: 0;
      margin: 0;
    }
    .slider-track {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #cbd5e1;
      transition: all 0.2s ease-in-out;
      border-radius: 24px;
    }
    .slider-track:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: #ffffff;
      transition: all 0.2s ease-in-out;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
    }
    .custom-switch-slider input:checked + .slider-track {
      background-color: #10b981; /* Green active like reference image */
    }
    .custom-switch-slider input:checked + .slider-track:before {
      transform: translateX(20px);
    }
    .switch-status-label {
      font-size: 12.5px;
      font-weight: 700;
      width: 26px;
      text-align: left;
    }
    .switch-status-label.status-yes {
      color: #10b981;
    }
    .switch-status-label.status-no {
      color: #64748b;
    }

    /* Green Edit Button matching reference image */
    .btn-content-edit {
      background-color: #10b981;
      border: 1px solid #10b981;
      color: #ffffff;
      border-radius: 20px;
      padding: 5px 22px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.3px;
      transition: all 0.15s ease-in-out;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
      text-decoration: none !important;
      box-shadow: 0 1px 3px rgba(16, 185, 129, 0.2);
    }
    .btn-content-edit:hover, .btn-content-edit:focus {
      background-color: #059669;
      border-color: #059669;
      color: #ffffff;
      box-shadow: 0 3px 8px rgba(16, 185, 129, 0.35);
      transform: translateY(-1px);
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

    /* Live Preview */
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

    .preview-sms-bubble {
      background-color: #e0f2fe;
      border: 1px solid #bae6fd;
      border-radius: 8px 8px 8px 0px;
      padding: 10px 14px;
      max-width: 90%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      position: relative;
      font-size: 13px;
      color: #0369a1;
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

    /* Floating Toast */
    #floatingToast {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10050;
      min-width: 300px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      border-radius: 8px;
      display: none;
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

        <!-- Floating Toast Alert -->
        <div id="floatingToast" class="alert alert-success alert-dismissible fade show p-3 shadow-lg" role="alert">
          <div class="d-flex align-items-center">
            <i class="fa fa-circle-check fa-lg mr-2" id="floatingToastIcon"></i>
            <span id="floatingToastText" class="font-weight-bold small"></span>
          </div>
        </div>
        
        <!-- Clean Header (Removed Gateway button and KPI badges as requested) -->
        <div class="card card-notif-table mb-3">
          <div class="card-body p-3">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <h4 class="page-title mb-1 font-weight-bold text-dark">
                  <i class="fa fa-bell text-primary mr-2"></i> Notification Settings
                </h4>
                <p class="text-muted mb-0 small">Configure automated notification delivery channels and message templates per event.</p>
              </div>
              <div>
                <button type="button" class="btn btn-outline-primary btn-sm" onclick="location.reload()">
                  <i class="fa fa-refresh mr-1"></i> Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Notification List Table (As per Reference Image) -->
        <div class="card card-notif-table">
          <div class="card-header bg-white py-3 px-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h6 class="font-weight-bold text-dark mb-0">
              <i class="fa fa-table mr-2 text-primary"></i> Notification List
            </h6>
            <div class="d-flex align-items-center" style="max-width: 320px; width: 100%;">
              <div class="input-group input-group-sm">
                <div class="input-group-prepend"><span class="input-group-text bg-light border-right-0"><i class="fa fa-search text-muted"></i></span></div>
                <input type="text" class="form-control border-left-0 bg-light" id="tableSearchInput" placeholder="Search notification type...">
              </div>
            </div>
          </div>

          <div class="table-responsive">
            <table class="table notif-table text-nowrap" id="notificationsTable">
              <thead>
                <tr>
                  <th class="col-sr text-center">SR NO</th>
                  <th class="col-type">TYPE</th>
                  <th class="text-center" style="width: 150px;">SEND WHATSAPP</th>
                  <th class="text-center" style="width: 150px;">SEND EMAIL</th>
                  <th class="text-center" style="width: 150px;">SEND SMS</th>
                  <th class="text-center" style="width: 120px;">CONTENT</th>
                </tr>
              </thead>
              <tbody id="notifTableBody">
                ${rowsHtml}
                <tr id="notifEmptyRow" style="display:none;">
                  <td colspan="6" class="text-center py-4 text-muted">
                    <i class="fa fa-search mb-1 d-block" style="font-size:18px;"></i>
                    No notification events found matching your search.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  </div>
</div>

<!-- Edit Content Modal Dialog -->
<div class="modal fade" id="editContentModal" tabindex="-1" role="dialog" aria-labelledby="editModalLabel" aria-hidden="true" data-backdrop="static">
  <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
    <div class="modal-content shadow-lg border-0" style="border-radius: 12px; overflow: hidden;">
      
      <div class="modal-header bg-light py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
        <div>
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="badge badge-primary px-2 py-1 mr-2" id="modalRecipientBadge">User</span>
            <h5 class="modal-title font-weight-bold text-dark mb-0" id="modalTitle">Edit Notification Template</h5>
          </div>
          <div class="text-muted small font-monospace" id="modalSubtitle" style="font-size: 11.5px;"></div>
        </div>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close" style="outline: none;">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <div class="modal-body p-4">
        <!-- Channel switches inside modal (WhatsApp, Email, SMS) -->
        <div class="row mb-3 bg-light p-2 rounded mx-0 border">
          <div class="col-md-4 d-flex align-items-center justify-content-between py-1">
            <div class="d-flex align-items-center">
              <i class="fa fa-whatsapp text-success fa-lg mr-2"></i>
              <div>
                <span class="font-weight-bold text-dark small d-block">Send WhatsApp</span>
                <small class="text-muted">WhatsApp delivery</small>
              </div>
            </div>
            <div class="switch-wrapper">
              <label class="custom-switch-slider mb-0">
                <input type="checkbox" id="modalSwitchWa">
                <span class="slider-track"></span>
              </label>
              <span class="switch-status-label status-yes" id="modalWaStatusLabel">Yes</span>
            </div>
          </div>
          <div class="col-md-4 d-flex align-items-center justify-content-between py-1 border-left">
            <div class="d-flex align-items-center">
              <i class="fa fa-envelope text-primary fa-lg mr-2"></i>
              <div>
                <span class="font-weight-bold text-dark small d-block">Send Email</span>
                <small class="text-muted">Email delivery</small>
              </div>
            </div>
            <div class="switch-wrapper">
              <label class="custom-switch-slider mb-0">
                <input type="checkbox" id="modalSwitchEmail">
                <span class="slider-track"></span>
              </label>
              <span class="switch-status-label status-yes" id="modalEmailStatusLabel">Yes</span>
            </div>
          </div>
          <div class="col-md-4 d-flex align-items-center justify-content-between py-1 border-left">
            <div class="d-flex align-items-center">
              <i class="fa fa-commenting-o text-info fa-lg mr-2"></i>
              <div>
                <span class="font-weight-bold text-dark small d-block">Send SMS</span>
                <small class="text-muted">SMS delivery</small>
              </div>
            </div>
            <div class="switch-wrapper">
              <label class="custom-switch-slider mb-0">
                <input type="checkbox" id="modalSwitchSms">
                <span class="slider-track"></span>
              </label>
              <span class="switch-status-label status-yes" id="modalSmsStatusLabel">Yes</span>
            </div>
          </div>
        </div>

        <!-- Allowed Dynamic Keywords -->
        <div class="form-group mb-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <label class="font-weight-bold text-dark small mb-0">
              <i class="fa fa-tags text-primary mr-1"></i> Allowed Event Keywords
            </label>
            <small class="text-muted"><i class="fa fa-mouse-pointer mr-1"></i> Click any tag to insert into active input</small>
          </div>
          <div class="p-2 border rounded bg-white d-flex flex-wrap align-items-center" id="modalKeywordsContainer" style="min-height: 42px;">
            <!-- Populated dynamically based on event -->
          </div>
        </div>

        <!-- Content Type Selector -->
        <div class="mb-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <label class="font-weight-bold text-dark small mb-0">
              <i class="fa fa-pencil-square-o text-primary mr-1"></i> Content Type:
            </label>
            <small class="text-muted">Select content type to edit template</small>
          </div>
          <div class="btn-group btn-group-toggle w-100" id="contentTypeTabGroup">
            <button type="button" class="btn btn-outline-success font-weight-bold active btn-content-type" data-tab="paneContentWa">
              <i class="fa fa-whatsapp mr-1"></i> WhatsApp Template
            </button>
            <button type="button" class="btn btn-outline-primary font-weight-bold btn-content-type" data-tab="paneContentEmail">
              <i class="fa fa-envelope mr-1"></i> Email Template
            </button>
            <button type="button" class="btn btn-outline-info font-weight-bold btn-content-type" data-tab="paneContentSms">
              <i class="fa fa-commenting-o mr-1"></i> SMS Template <span class="badge badge-warning text-dark ml-1"><i class="fa fa-lock mr-1"></i>160 Chars Lock</span>
            </button>
          </div>
        </div>

        <!-- WhatsApp Content Pane -->
        <div class="content-tab-pane" id="paneContentWa">
          <div class="form-group mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="font-weight-bold text-dark small mb-0">
                <i class="fa fa-whatsapp text-success mr-1"></i> WhatsApp Message Content <span class="text-danger">*</span>
              </label>
              <small class="text-muted font-monospace" id="modalWaCharCount">0 characters</small>
            </div>
            <textarea class="form-control font-monospace" id="modalWaTemplateInput" rows="4" placeholder="Type WhatsApp message template with {{keywords}}..." style="font-size: 13px;"></textarea>
          </div>
        </div>

        <!-- Email Content Pane -->
        <div class="content-tab-pane" id="paneContentEmail" style="display: none;">
          <div class="form-group mb-2">
            <label class="font-weight-bold text-dark small mb-1">
              <i class="fa fa-heading text-primary mr-1"></i> Email Subject <span class="text-danger">*</span>
            </label>
            <input type="text" class="form-control" id="modalEmailSubjectInput" placeholder="e.g. Your Account Verification OTP - {{app_name}}">
          </div>
          <div class="form-group mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="font-weight-bold text-dark small mb-0">
                <i class="fa fa-envelope text-primary mr-1"></i> Email Body Template <span class="text-danger">*</span>
              </label>
              <small class="text-muted font-monospace" id="modalEmailCharCount">0 characters</small>
            </div>
            <textarea class="form-control font-monospace" id="modalEmailTemplateInput" rows="5" placeholder="Type Email body template with {{keywords}}..." style="font-size: 13px;"></textarea>
          </div>
        </div>

        <!-- SMS Content Pane (160 Characters Hard Lock) -->
        <div class="content-tab-pane" id="paneContentSms" style="display: none;">
          <div class="form-group mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="font-weight-bold text-dark small mb-0">
                <i class="fa fa-commenting-o text-info mr-1"></i> SMS Message Content
                <span class="badge badge-warning text-dark ml-2"><i class="fa fa-lock mr-1"></i>160 Characters Hard Lock</span>
              </label>
              <span class="badge badge-light border text-info font-monospace font-weight-bold" id="modalSmsCharCount">0 / 160 characters</span>
            </div>
            <textarea class="form-control font-monospace" id="modalSmsTemplateInput" rows="3" maxlength="160" placeholder="Type SMS template with {{keywords}}..." style="font-size: 13px;"></textarea>
            <div class="d-flex justify-content-between align-items-center mt-1">
              <small class="text-muted">Standard SMS max length: strictly 160 characters. Input is automatically locked at 160.</small>
              <small class="text-danger font-weight-bold" id="modalSmsLimitAlert" style="display: none;"><i class="fa fa-exclamation-triangle mr-1"></i>160 character limit reached!</small>
            </div>
          </div>
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
              <div class="preview-wa-bubble" id="modalPreviewWaBubble">—</div>
            </div>
            <div class="mt-3">
              <span class="badge badge-primary px-2 py-1 mb-1"><i class="fa fa-envelope mr-1"></i> Email Preview</span>
              <div class="preview-email-box">
                <div class="font-weight-bold border-bottom pb-1 mb-2 text-dark" id="modalPreviewEmailSubject">—</div>
                <div style="white-space: pre-wrap;" id="modalPreviewEmailBody">—</div>
              </div>
            </div>
            <div class="mt-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="badge badge-info px-2 py-1"><i class="fa fa-commenting-o mr-1"></i> SMS Preview</span>
                <small class="text-muted font-monospace" id="modalPreviewSmsCount">0 / 160 chars</small>
              </div>
              <div class="preview-sms-bubble" id="modalPreviewSmsBubble">—</div>
            </div>
          </div>
        </div>

      </div>

      <div class="modal-footer bg-light py-2 px-4 border-top d-flex justify-content-between">
        <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">
          <i class="fa fa-times mr-1"></i> Cancel
        </button>
        <button type="button" class="btn btn-primary btn-sm font-weight-bold shadow-sm" id="btnSaveModalTemplate">
          <i class="fa fa-save mr-1"></i> Save Changes
        </button>
      </div>

    </div>
  </div>
</div>

<script id="notifTemplatesData" type="application/json">
${safeJsonPayload}
</script>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="/auth-client.js"></script>
<script>
(function() {
  let rawTemplates = [];
  try {
    const rawDataEl = document.getElementById('notifTemplatesData');
    if (rawDataEl) {
      rawTemplates = JSON.parse(rawDataEl.textContent);
    }
  } catch (err) {
    console.error('Failed to parse notification templates payload:', err);
  }

  let activeEditingKey = null;
  let lastFocusedInput = null;

  // Track focused input inside modal for keyword insertion
  ['modalWaTemplateInput', 'modalEmailSubjectInput', 'modalEmailTemplateInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('focus', () => { lastFocusedInput = el; });
    }
  });

  function showToast(msg, isError = false) {
    const toast = document.getElementById('floatingToast');
    const textEl = document.getElementById('floatingToastText');
    const iconEl = document.getElementById('floatingToastIcon');
    if (!toast) return;
    toast.className = 'alert alert-dismissible fade show p-3 shadow-lg ' + (isError ? 'alert-danger' : 'alert-success');
    if (iconEl) iconEl.className = 'fa mr-2 ' + (isError ? 'fa-triangle-exclamation' : 'fa-circle-check');
    if (textEl) textEl.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3500);
  }

  // Quick toggle switches in table rows
  function initTableSwitches() {
    document.querySelectorAll('.toggle-channel-wa').forEach(input => {
      input.addEventListener('change', async () => {
        const key = input.getAttribute('data-key');
        const nextState = input.checked;
        await handleQuickToggle(key, 'whatsapp', nextState, input);
      });
    });

    document.querySelectorAll('.toggle-channel-email').forEach(input => {
      input.addEventListener('change', async () => {
        const key = input.getAttribute('data-key');
        const nextState = input.checked;
        await handleQuickToggle(key, 'email', nextState, input);
      });
    });

    document.querySelectorAll('.toggle-channel-sms').forEach(input => {
      input.addEventListener('change', async () => {
        const key = input.getAttribute('data-key');
        const nextState = input.checked;
        await handleQuickToggle(key, 'sms', nextState, input);
      });
    });

    // Edit button listeners
    document.querySelectorAll('.btn-content-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        openEditModal(key);
      });
    });
  }

  async function handleQuickToggle(key, channel, nextState, inputEl) {
    const wrapper = inputEl.closest('.switch-wrapper');
    const labelSpan = wrapper ? wrapper.querySelector('.switch-status-label') : null;
    const originalChecked = !nextState;

    if (labelSpan) {
      labelSpan.textContent = nextState ? 'Yes' : 'No';
      labelSpan.className = 'switch-status-label ' + (nextState ? 'status-yes' : 'status-no');
    }

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
        if (channel === 'sms') item.sms_enabled = nextState;
        showToast(item.title + ' ' + channel.toUpperCase() + ' delivery turned ' + (nextState ? 'YES' : 'NO'));
      }
    } catch (err) {
      inputEl.checked = originalChecked;
      if (labelSpan) {
        labelSpan.textContent = originalChecked ? 'Yes' : 'No';
        labelSpan.className = 'switch-status-label ' + (originalChecked ? 'status-yes' : 'status-no');
      }
      showToast(err.message, true);
    }
  }

  function openEditModal(key) {
    activeEditingKey = key;
    const item = rawTemplates.find(x => x.event_key === key);
    if (!item) return;

    // Header info
    document.getElementById('modalTitle').textContent = item.title;
    document.getElementById('modalSubtitle').textContent = 'Key: ' + item.event_key + ' | Category: ' + item.category;
    const badge = document.getElementById('modalRecipientBadge');
    if (item.recipient_type === 'admin') {
      badge.className = 'badge badge-warning text-dark px-2 py-1 mr-2';
      badge.innerHTML = '<i class="fa fa-shield-halved mr-1"></i> Admin Alert';
    } else {
      badge.className = 'badge badge-primary px-2 py-1 mr-2';
      badge.innerHTML = '<i class="fa fa-user mr-1"></i> User Message';
    }

    // Switches in modal
    const switchWa = document.getElementById('modalSwitchWa');
    const switchEmail = document.getElementById('modalSwitchEmail');
    const switchSms = document.getElementById('modalSwitchSms');
    switchWa.checked = Boolean(item.whatsapp_enabled);
    switchEmail.checked = Boolean(item.email_enabled);
    if (switchSms) switchSms.checked = Boolean(item.sms_enabled);
    updateModalSwitchLabels();

    // Reset Content Type Tab to WhatsApp
    document.querySelectorAll('.btn-content-type').forEach(b => b.classList.remove('active'));
    const firstTabBtn = document.querySelector('.btn-content-type[data-tab="paneContentWa"]');
    if (firstTabBtn) firstTabBtn.classList.add('active');
    document.querySelectorAll('.content-tab-pane').forEach(p => p.style.display = 'none');
    const firstPane = document.getElementById('paneContentWa');
    if (firstPane) firstPane.style.display = 'block';

    // Inputs
    document.getElementById('modalWaTemplateInput').value = item.whatsapp_template || '';
    document.getElementById('modalEmailSubjectInput').value = item.email_subject || '';
    document.getElementById('modalEmailTemplateInput').value = item.email_template || '';
    const smsInput = document.getElementById('modalSmsTemplateInput');
    if (smsInput) smsInput.value = (item.sms_template || '').slice(0, 160);

    // Render keyword tags
    const container = document.getElementById('modalKeywordsContainer');
    const keywords = Array.isArray(item.allowed_keywords) ? item.allowed_keywords : [];
    if (keywords.length > 0) {
      container.innerHTML = keywords.map(kw => {
        const fullTag = '{{' + kw + '}}';
        return '<button type="button" class="keyword-pill" data-tag="' + fullTag + '" title="Click to insert ' + fullTag + '"><i class="fa fa-plus text-primary mr-1" style="font-size:9px;"></i>' + fullTag + '</button>';
      }).join('');

      container.querySelectorAll('.keyword-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const tag = pill.getAttribute('data-tag');
          insertTagIntoActiveInput(tag);
        });
      });
    } else {
      container.innerHTML = '<span class="text-muted small">No specific dynamic variables for this template.</span>';
    }

    updateModalCounters();
    updateModalPreview();

    $('#editContentModal').modal('show');
  }

  function updateModalSwitchLabels() {
    const waChecked = document.getElementById('modalSwitchWa').checked;
    const emailChecked = document.getElementById('modalSwitchEmail').checked;
    const switchSms = document.getElementById('modalSwitchSms');
    const smsChecked = switchSms ? switchSms.checked : false;

    const waLabel = document.getElementById('modalWaStatusLabel');
    const emailLabel = document.getElementById('modalEmailStatusLabel');
    const smsLabel = document.getElementById('modalSmsStatusLabel');

    if (waLabel) {
      waLabel.textContent = waChecked ? 'Yes' : 'No';
      waLabel.className = 'switch-status-label ' + (waChecked ? 'status-yes' : 'status-no');
    }
    if (emailLabel) {
      emailLabel.textContent = emailChecked ? 'Yes' : 'No';
      emailLabel.className = 'switch-status-label ' + (emailChecked ? 'status-yes' : 'status-no');
    }
    if (smsLabel) {
      smsLabel.textContent = smsChecked ? 'Yes' : 'No';
      smsLabel.className = 'switch-status-label ' + (smsChecked ? 'status-yes' : 'status-no');
    }
  }

  document.getElementById('modalSwitchWa').addEventListener('change', updateModalSwitchLabels);
  document.getElementById('modalSwitchEmail').addEventListener('change', updateModalSwitchLabels);
  const modalSwitchSmsEl = document.getElementById('modalSwitchSms');
  if (modalSwitchSmsEl) modalSwitchSmsEl.addEventListener('change', updateModalSwitchLabels);

  function insertTagIntoActiveInput(tag) {
    const target = lastFocusedInput || document.getElementById('modalWaTemplateInput');
    if (!target) return;

    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const val = target.value;
    target.value = val.substring(0, start) + tag + val.substring(end);
    target.focus();
    target.selectionStart = target.selectionEnd = start + tag.length;

    updateModalCounters();
    updateModalPreview();
  }


  // Content Type Tab Switching
  document.querySelectorAll('.btn-content-type').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-content-type').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.content-tab-pane').forEach(p => p.style.display = 'none');
      const pane = document.getElementById(targetTab);
      if (pane) {
        pane.style.display = 'block';
        const focusInput = pane.querySelector('input, textarea');
        if (focusInput) focusInput.focus();
      }
    });
  });

  function updateModalCounters() {
    const waVal = document.getElementById('modalWaTemplateInput').value;
    const emailVal = document.getElementById('modalEmailTemplateInput').value;
    const smsInput = document.getElementById('modalSmsTemplateInput');
    if (smsInput && smsInput.value.length > 160) {
      smsInput.value = smsInput.value.slice(0, 160);
    }
    const smsVal = smsInput ? smsInput.value : '';

    document.getElementById('modalWaCharCount').textContent = waVal.length + ' characters';
    document.getElementById('modalEmailCharCount').textContent = emailVal.length + ' characters';
    const countEl = document.getElementById('modalSmsCharCount');
    const alertEl = document.getElementById('modalSmsLimitAlert');
    if (countEl) countEl.textContent = smsVal.length + ' / 160 characters (Locked)';
    if (alertEl) alertEl.style.display = smsVal.length >= 160 ? 'inline' : 'none';
  }


  function updateModalPreview() {
    const item = rawTemplates.find(x => x.event_key === activeEditingKey);
    const dummyData = {
      name: 'Ramesh Kumar',
      username: 'ramesh99',
      otp: '739201',
      expiry_minutes: '10',
      login_url: 'https://exchange.portal/login',
      kyc_url: 'https://exchange.portal/kyc',
      reset_otp: '582910',
      reset_url: 'https://exchange.portal/reset-password',
      date_time: '23-Oct-2026 07:45 PM',
      ip_address: '103.21.58.12',
      device: 'Chrome on Android',
      amount: '5,000.00',
      utr: 'UTR9823417729',
      payout_utr: 'PAY77294821',
      bank_name: 'State Bank of India',
      account_number: '•••• 4589',
      ifsc: 'SBIN0001234',
      request_id: 'REQ-10482',
      status: 'APPROVED',
      current_balance: '14,250.00',
      remark: 'Verified and approved',
      seller_name: 'Apex Telecom',
      api_name: 'Ivan API',
      order_id: 'ORD-84920',
      operator: 'Jio Prepaid',
      mobile_number: '9876543210',
      created_at: '23-Oct-2026 07:40 PM',
      complaint_id: 'CMP-2918',
      reason: 'Recharge not credited to consumer',
      threshold_amount: '1,000.00',
      topup_url: 'https://exchange.portal/fund/request',
      admin_url: 'https://exchange.portal/admin/payment/fund-request',
      app_name: 'Exchange Portal'
    };

    function replaceTags(str) {
      if (!str) return '—';
      return str.replace(/\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}/g, (match, key) => {
        return dummyData[key] !== undefined ? dummyData[key] : match;
      });
    }

    const waVal = document.getElementById('modalWaTemplateInput').value;
    const emailSubject = document.getElementById('modalEmailSubjectInput').value;
    const emailBody = document.getElementById('modalEmailTemplateInput').value;

    document.getElementById('modalPreviewWaBubble').textContent = replaceTags(waVal);
    document.getElementById('modalPreviewEmailSubject').textContent = replaceTags(emailSubject);
    document.getElementById('modalPreviewEmailBody').textContent = replaceTags(emailBody);

    const smsInput = document.getElementById('modalSmsTemplateInput');
    const smsText = smsInput ? smsInput.value.slice(0, 160) : '';
    const renderedSms = replaceTags(smsText).slice(0, 160);
    const smsBubble = document.getElementById('modalPreviewSmsBubble');
    const smsCountBadge = document.getElementById('modalPreviewSmsCount');
    if (smsBubble) smsBubble.textContent = renderedSms || '—';
    if (smsCountBadge) smsCountBadge.textContent = renderedSms.length + ' / 160 chars';
  }

  // Live preview typing listeners in modal
  document.getElementById('modalWaTemplateInput').addEventListener('input', () => { updateModalCounters(); updateModalPreview(); });
  document.getElementById('modalEmailSubjectInput').addEventListener('input', updateModalPreview);
  document.getElementById('modalEmailTemplateInput').addEventListener('input', () => { updateModalCounters(); updateModalPreview(); });
  const modalSmsInputEl = document.getElementById('modalSmsTemplateInput');
  if (modalSmsInputEl) {
    modalSmsInputEl.addEventListener('input', () => {
      if (modalSmsInputEl.value.length > 160) {
        modalSmsInputEl.value = modalSmsInputEl.value.slice(0, 160);
      }
      updateModalCounters();
      updateModalPreview();
    });
  }

  // Save changes button in modal
  document.getElementById('btnSaveModalTemplate').addEventListener('click', async () => {
    const item = rawTemplates.find(x => x.event_key === activeEditingKey);
    if (!item) return;

    const btn = document.getElementById('btnSaveModalTemplate');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving...';

    const payload = {
      whatsapp_enabled: document.getElementById('modalSwitchWa').checked,
      email_enabled: document.getElementById('modalSwitchEmail').checked,
      sms_enabled: document.getElementById('modalSwitchSms') ? document.getElementById('modalSwitchSms').checked : false,
      whatsapp_template: document.getElementById('modalWaTemplateInput').value.trim(),
      email_subject: document.getElementById('modalEmailSubjectInput').value.trim(),
      email_template: document.getElementById('modalEmailTemplateInput').value.trim(),
      sms_template: document.getElementById('modalSmsTemplateInput') ? document.getElementById('modalSmsTemplateInput').value.trim().slice(0, 160) : ''
    };

    try {
      const res = await fetch('/api/admin/settings/notifications/' + activeEditingKey, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save notification template.');

      // Update in memory
      Object.assign(item, payload);

      // Update table row in DOM
      const row = document.getElementById('row-' + activeEditingKey);
      if (row) {
        const waCheckbox = row.querySelector('.toggle-channel-wa');
        const emailCheckbox = row.querySelector('.toggle-channel-email');
        if (waCheckbox) {
          waCheckbox.checked = item.whatsapp_enabled;
          const label = waCheckbox.closest('.switch-wrapper').querySelector('.switch-status-label');
          if (label) {
            label.textContent = item.whatsapp_enabled ? 'Yes' : 'No';
            label.className = 'switch-status-label ' + (item.whatsapp_enabled ? 'status-yes' : 'status-no');
          }
        }
        if (emailCheckbox) {
          emailCheckbox.checked = item.email_enabled;
          const label = emailCheckbox.closest('.switch-wrapper').querySelector('.switch-status-label');
          if (label) {
            label.textContent = item.email_enabled ? 'Yes' : 'No';
            label.className = 'switch-status-label ' + (item.email_enabled ? 'status-yes' : 'status-no');
          }
        }
        const smsCheckbox = row.querySelector('.toggle-channel-sms');
        if (smsCheckbox) {
          smsCheckbox.checked = item.sms_enabled;
          const label = smsCheckbox.closest('.switch-wrapper').querySelector('.switch-status-label');
          if (label) {
            label.textContent = item.sms_enabled ? 'Yes' : 'No';
            label.className = 'switch-status-label ' + (item.sms_enabled ? 'status-yes' : 'status-no');
          }
        }
      }

      $('#editContentModal').modal('hide');
      showToast('Notification template for "' + item.title + '" saved successfully!');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa fa-save mr-1"></i> Save Changes';
    }
  });

  // Search filter
  const searchInput = document.getElementById('tableSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      let matchedCount = 0;
      document.querySelectorAll('#notifTableBody tr[data-key]').forEach(tr => {
        const key = tr.getAttribute('data-key');
        const item = rawTemplates.find(x => x.event_key === key);
        if (!item) return;
        const match = !term || item.title.toLowerCase().includes(term) || item.event_key.toLowerCase().includes(term) || item.category.toLowerCase().includes(term);
        tr.style.display = match ? '' : 'none';
        if (match) matchedCount++;
      });
      const emptyRow = document.getElementById('notifEmptyRow');
      if (emptyRow) {
        emptyRow.style.display = matchedCount === 0 ? '' : 'none';
      }
    });
  }

  // Initialize switches and buttons
  initTableSwitches();
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
