'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminWebsiteSettingsPage({
  db,
  sendJson,
  httpError,
}) {
  /**
   * Helper: Get current settings from database
   */
  async function fetchSettings() {
    try {
      const res = await db.query('SELECT * FROM website_settings WHERE id = 1');
      if (res.rows[0]) {
        return res.rows[0];
      }
    } catch (_) {}
    return {
      website_name: 'Easy Recharge Solution',
      website_tagline: "India's Leading B2B Multi-Recharge & LAPU Stock Exchange Platform",
      logo_data: null,
      logo_mime: null,
      logo_url: null,
      favicon_data: null,
      favicon_mime: null,
      favicon_url: null,
      support_phone: '+91 98765 43210',
      support_whatsapp: '+91 98765 43210',
      support_email: 'support@easyrechargesolution.com',
      office_address: 'Cyber City, Tower B, Sector 62, Noida, Uttar Pradesh, India - 201309',
      working_hours: '24x7 Customer & Stock Support',
      footer_about: 'Empowering telecom retailers and master distributors across India with lightning-fast multi-recharge services, automated LAPU stock swapping, and bank-grade APIs.',
      social_telegram: 'https://t.me/easyrechargesolution',
      meta_title: 'Easy Recharge Solution | B2B Recharge & Stock Exchange',
      meta_description: 'Instant Mobile, DTH, LAPU Stock Exchange & Utility Recharge API Platform with 99.99% uptime.',
    };
  }

  /**
   * Render HTML page for /admin/settings/website-settings
   */
  async function sendAdminWebsiteSettingsPage(admin, response) {
    const s = await fetchSettings();
    const hasCustomLogo = Boolean(s.logo_data || s.logo_url);
    const hasCustomFavicon = Boolean(s.favicon_data || s.favicon_url);

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Website Settings &amp; Logo Management - Admin</title>
  <link rel="icon" type="image/x-icon" href="/api/favicon">
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body {
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .settings-page {
      padding: 16px 20px 60px;
    }
    .settings-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 24px;
    }
    .settings-header h3 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .settings-header p {
      color: #64748b;
      margin: 4px 0 0;
      font-size: 13.5px;
    }
    .card-settings {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.03);
      margin-bottom: 24px;
      overflow: hidden;
    }
    .card-settings-header {
      padding: 16px 20px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .card-settings-header h5 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
    }
    .card-settings-body {
      padding: 24px 20px;
    }
    .form-group label {
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 6px;
    }
    .form-control {
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      padding: 10px 14px;
      font-size: 13.5px;
    }
    .form-control:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
    }
    .upload-box {
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      background: #f8fafc;
      transition: all 0.2s ease;
      cursor: pointer;
      position: relative;
    }
    .upload-box:hover {
      border-color: #3b82f6;
      background: #eff6ff;
    }
    .upload-box input[type="file"] {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
    .preview-canvas-card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 110px;
    }
    .preview-dark {
      background: #101114;
      color: #fff;
    }
    .preview-light {
      background: #ffffff;
      color: #0f172a;
    }
    .preview-mockup-tab {
      background: #e2e8f0;
      border-radius: 6px 6px 0 0;
      padding: 6px 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: #334155;
      box-shadow: 0 -1px 3px rgba(0,0,0,0.05);
    }
    .badge-status-pill {
      font-size: 11.5px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 20px;
    }
    .btn-save-main {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #ffffff;
      font-size: 15px;
      font-weight: 700;
      padding: 12px 28px;
      border-radius: 8px;
      border: none;
      box-shadow: 0 4px 12px rgba(37,99,235,0.3);
      transition: all 0.2s;
    }
    .btn-save-main:hover {
      background: linear-gradient(135deg, #1d4ed8, #1e40af);
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(37,99,235,0.4);
      color: #fff;
    }
    .toast-popup {
      position: fixed;
      top: 60px;
      right: 24px;
      z-index: 99999;
      min-width: 320px;
      display: none;
    }
  </style>
</head>
<body class="app">
  <div class="page">
    <div class="page-main">
      ${renderAdminNavigation('/admin/settings/website-settings')}

      <div class="container-fluid settings-page">
        <!-- Toast Feedback -->
        <div id="toast-box" class="toast-popup alert alert-success alert-dismissible fade show shadow-lg" role="alert">
          <strong id="toast-title"><i class="fa fa-check-circle"></i> Success!</strong>
          <span id="toast-msg" class="d-block mt-1">Settings have been saved successfully.</span>
        </div>

        <!-- Page Header -->
        <div class="settings-header">
          <div>
            <h3><i class="fa fa-globe text-primary"></i> Website Settings (Brand &amp; Portal Identity)</h3>
            <p>Manage logo, favicon, website name, and support details for the front website, login page, and dashboard.</p>
          </div>
          <div class="d-flex gap-2">
            <a href="/" target="_blank" class="btn btn-outline-primary btn-sm font-weight-bold">
              <i class="fa fa-external-link"></i> View Live Website
            </a>
          </div>
        </div>

        <form id="website-settings-form">
          <div class="row">
            <!-- Left Column: Brand & Logo -->
            <div class="col-lg-6">
              <!-- Brand Identity -->
              <div class="card-settings">
                <div class="card-settings-header">
                  <i class="fa fa-paint-brush text-primary"></i>
                  <h5>1. Brand &amp; Website Identity</h5>
                </div>
                <div class="card-settings-body">
                  <div class="form-group mb-3">
                    <label for="website_name">Website / Brand Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" id="website_name" name="website_name" value="${escapeHtml(s.website_name || '')}" placeholder="e.g. Easy Recharge Solution" required>
                    <small class="text-muted">This name appears in the front website header, login screen, and page titles.</small>
                  </div>

                  <div class="form-group mb-3">
                    <label for="website_tagline">Website Tagline / Slogan</label>
                    <input type="text" class="form-control" id="website_tagline" name="website_tagline" value="${escapeHtml(s.website_tagline || '')}" placeholder="e.g. India's Leading B2B Recharge &amp; LAPU Stock Exchange">
                  </div>
                </div>
              </div>

              <!-- Logo Upload & Live Preview -->
              <div class="card-settings">
                <div class="card-settings-header">
                  <i class="fa fa-image text-success"></i>
                  <h5>2. Website Logo (Upload Logo)</h5>
                  <span class="badge badge-status-pill ${hasCustomLogo ? 'badge-success' : 'badge-secondary'} ml-auto" id="logo-status-badge">
                    ${hasCustomLogo ? 'Custom Logo Active' : 'Default Logo Active'}
                  </span>
                </div>
                <div class="card-settings-body">
                  <div class="upload-box mb-3" id="logo-drop-area">
                    <input type="file" id="logo_file" name="logo_file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif">
                    <i class="fa fa-cloud-upload fa-3x text-primary mb-2"></i>
                    <h6 class="font-weight-bold mb-1">Drag &amp; drop new logo here or click to browse</h6>
                    <p class="text-muted small mb-0">PNG, JPG, SVG, WebP (Recommended: 250×60px, transparent background)</p>
                  </div>

                  <!-- Live Previews -->
                  <div class="row">
                    <div class="col-md-6 mb-2">
                      <small class="font-weight-bold text-muted d-block mb-1">Light Background (Front Website)</small>
                      <div class="preview-canvas-card preview-light">
                        <img id="logo-preview-light" src="/api/logo?t=${Date.now()}" alt="Logo Preview Light" style="max-height: 48px; max-width: 100%; object-fit: contain;">
                      </div>
                    </div>
                    <div class="col-md-6 mb-2">
                      <small class="font-weight-bold text-muted d-block mb-1">Dark Background (Admin / Dashboard)</small>
                      <div class="preview-canvas-card preview-dark">
                        <img id="logo-preview-dark" src="/api/logo?t=${Date.now()}" alt="Logo Preview Dark" style="max-height: 44px; max-width: 100%; object-fit: contain;">
                      </div>
                    </div>
                  </div>

                  <div class="custom-control custom-checkbox mt-3">
                    <input type="checkbox" class="custom-control-input" id="reset_logo" name="reset_logo" value="1">
                    <label class="custom-control-label text-danger font-weight-bold" for="reset_logo">Reset custom logo to system default 3D logo</label>
                  </div>
                </div>
              </div>

              <!-- Favicon Upload -->
              <div class="card-settings">
                <div class="card-settings-header">
                  <i class="fa fa-bookmark text-warning"></i>
                  <h5>3. Favicon Icon (Upload Favicon)</h5>
                  <span class="badge badge-status-pill ${hasCustomFavicon ? 'badge-success' : 'badge-secondary'} ml-auto" id="favicon-status-badge">
                    ${hasCustomFavicon ? 'Custom Favicon' : 'Default Favicon'}
                  </span>
                </div>
                <div class="card-settings-body">
                  <div class="d-flex align-items-center gap-3 mb-3">
                    <div class="upload-box flex-grow-1 p-3">
                      <input type="file" id="favicon_file" name="favicon_file" accept=".ico,image/x-icon,image/png,image/svg+xml">
                      <i class="fa fa-upload text-warning mr-2"></i>
                      <span class="font-weight-bold">Choose Favicon (.ico, .png, .svg)</span>
                      <small class="d-block text-muted">Size: 32×32 or 64×64 pixels</small>
                    </div>

                    <!-- Browser Tab Mockup -->
                    <div class="text-center pl-3">
                      <small class="text-muted font-weight-bold d-block mb-1">Browser Tab Preview</small>
                      <div class="preview-mockup-tab border">
                        <img id="favicon-preview-img" src="/api/favicon?t=${Date.now()}" alt="Favicon" style="width: 18px; height: 18px; object-fit: contain;">
                        <span id="tab-title-preview" class="text-truncate" style="max-width: 120px;">${escapeHtml(s.website_name || 'Exchange')}</span>
                      </div>
                    </div>
                  </div>

                  <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input" id="reset_favicon" name="reset_favicon" value="1">
                    <label class="custom-control-label text-danger" for="reset_favicon">Reset to default favicon</label>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Column: Contact Details & SEO -->
            <div class="col-lg-6">
              <!-- Contact Details -->
              <div class="card-settings">
                <div class="card-settings-header">
                  <i class="fa fa-phone text-info"></i>
                  <h5>4. Contact Us Details</h5>
                </div>
                <div class="card-settings-body">
                  <div class="row">
                    <div class="col-md-6 form-group mb-3">
                      <label for="support_phone"><i class="fa fa-phone mr-1 text-primary"></i> Support Phone Number</label>
                      <input type="text" class="form-control" id="support_phone" name="support_phone" value="${escapeHtml(s.support_phone || '')}" placeholder="+91 98765 43210">
                    </div>
                    <div class="col-md-6 form-group mb-3">
                      <label for="support_whatsapp"><i class="fa fa-whatsapp mr-1 text-success"></i> WhatsApp Support Number</label>
                      <input type="text" class="form-control" id="support_whatsapp" name="support_whatsapp" value="${escapeHtml(s.support_whatsapp || '')}" placeholder="+91 98765 43210">
                    </div>
                  </div>

                  <div class="form-group mb-3">
                    <label for="support_email"><i class="fa fa-envelope mr-1 text-danger"></i> Official Support Email</label>
                    <input type="email" class="form-control" id="support_email" name="support_email" value="${escapeHtml(s.support_email || '')}" placeholder="support@easyrechargesolution.com">
                  </div>

                  <div class="form-group mb-3">
                    <label for="office_address"><i class="fa fa-map-marker mr-1 text-danger"></i> Head Office Address</label>
                    <textarea class="form-control" id="office_address" name="office_address" rows="2" placeholder="Enter complete office address...">${escapeHtml(s.office_address || '')}</textarea>
                  </div>

                  <div class="form-group mb-3">
                    <label for="working_hours"><i class="fa fa-clock-o mr-1 text-info"></i> Support Working Hours</label>
                    <input type="text" class="form-control" id="working_hours" name="working_hours" value="${escapeHtml(s.working_hours || '')}" placeholder="e.g. 24x7 Customer &amp; Stock Support">
                  </div>

                  <div class="form-group mb-3">
                    <label for="social_telegram"><i class="fa fa-telegram mr-1 text-primary"></i> Telegram Channel / Support Link</label>
                    <input type="text" class="form-control" id="social_telegram" name="social_telegram" value="${escapeHtml(s.social_telegram || '')}" placeholder="https://t.me/easyrechargesolution">
                  </div>
                </div>
              </div>

              <!-- Footer & SEO Settings -->
              <div class="card-settings">
                <div class="card-settings-header">
                  <i class="fa fa-search text-purple"></i>
                  <h5>5. Footer &amp; SEO Details</h5>
                </div>
                <div class="card-settings-body">
                  <div class="form-group mb-3">
                    <label for="footer_about">Footer Company About</label>
                    <textarea class="form-control" id="footer_about" name="footer_about" rows="3" placeholder="Brief company summary shown in website footer...">${escapeHtml(s.footer_about || '')}</textarea>
                  </div>

                  <div class="form-group mb-3">
                    <label for="meta_title">Page Meta Title (for SEO)</label>
                    <input type="text" class="form-control" id="meta_title" name="meta_title" value="${escapeHtml(s.meta_title || '')}" placeholder="Easy Recharge Solution | B2B Recharge &amp; Stock Exchange">
                  </div>

                  <div class="form-group mb-3">
                    <label for="meta_description">Page Meta Description (for SEO)</label>
                    <textarea class="form-control" id="meta_description" name="meta_description" rows="2" placeholder="Summary description for search engines...">${escapeHtml(s.meta_description || '')}</textarea>
                  </div>
                </div>
              </div>

              <!-- Submit Button Bar -->
              <div class="card-settings p-4 text-right bg-white sticky-bottom" style="position: sticky; bottom: 16px; z-index: 100;">
                <div class="d-flex align-items-center justify-content-between">
                  <span id="save-status-msg" class="text-muted small">Changes will take effect across the entire portal immediately.</span>
                  <button type="submit" id="btn-submit" class="btn btn-save-main">
                    <i class="fa fa-save mr-2"></i> Save Website Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>

  <script>
    (function() {
      // Elements
      const form = document.getElementById('website-settings-form');
      const logoInput = document.getElementById('logo_file');
      const faviconInput = document.getElementById('favicon_file');
      const logoPreviewLight = document.getElementById('logo-preview-light');
      const logoPreviewDark = document.getElementById('logo-preview-dark');
      const faviconPreviewImg = document.getElementById('favicon-preview-img');
      const nameInput = document.getElementById('website_name');
      const tabTitlePreview = document.getElementById('tab-title-preview');
      const toastBox = document.getElementById('toast-box');
      const toastTitle = document.getElementById('toast-title');
      const toastMsg = document.getElementById('toast-msg');
      const btnSubmit = document.getElementById('btn-submit');

      // Live Tab Title Preview
      nameInput.addEventListener('input', function() {
        tabTitlePreview.textContent = this.value || 'Exchange';
      });

      // Live Logo Preview on client-side selection
      logoInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function(evt) {
            logoPreviewLight.src = evt.target.result;
            logoPreviewDark.src = evt.target.result;
            document.getElementById('reset_logo').checked = false;
          };
          reader.readAsDataURL(file);
        }
      });

      // Live Favicon Preview
      faviconInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function(evt) {
            faviconPreviewImg.src = evt.target.result;
            document.getElementById('reset_favicon').checked = false;
          };
          reader.readAsDataURL(file);
        }
      });

      // Show toast
      function showToast(title, message, isSuccess = true) {
        toastBox.className = 'toast-popup alert ' + (isSuccess ? 'alert-success' : 'alert-danger') + ' alert-dismissible fade show shadow-lg';
        toastTitle.innerHTML = (isSuccess ? '<i class="fa fa-check-circle"></i> ' : '<i class="fa fa-exclamation-triangle"></i> ') + title;
        toastMsg.textContent = message;
        toastBox.style.display = 'block';
        setTimeout(() => {
          toastBox.style.display = 'none';
        }, 5000);
      }

      // Handle Form Submit
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i> Saving...';

        try {
          const formData = new FormData(form);
          const payload = {
            website_name: formData.get('website_name'),
            website_tagline: formData.get('website_tagline'),
            support_phone: formData.get('support_phone'),
            support_whatsapp: formData.get('support_whatsapp'),
            support_email: formData.get('support_email'),
            office_address: formData.get('office_address'),
            working_hours: formData.get('working_hours'),
            social_telegram: formData.get('social_telegram'),
            footer_about: formData.get('footer_about'),
            meta_title: formData.get('meta_title'),
            meta_description: formData.get('meta_description'),
            reset_logo: formData.get('reset_logo') === '1',
            reset_favicon: formData.get('reset_favicon') === '1',
          };

          // Read logo file if provided
          const logoFile = logoInput.files[0];
          if (logoFile) {
            payload.logo_data_b64 = await readFileAsBase64(logoFile);
            payload.logo_mime = logoFile.type || 'image/png';
          }

          // Read favicon file if provided
          const faviconFile = faviconInput.files[0];
          if (faviconFile) {
            payload.favicon_data_b64 = await readFileAsBase64(faviconFile);
            payload.favicon_mime = faviconFile.type || 'image/x-icon';
          }

          const res = await fetch('/api/admin/settings/website', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.message || data.error || 'Failed to save settings.');
          }

          showToast('Success!', 'Website settings and logo saved successfully. Changes are now live!', true);
          
          // Refresh previews with cache buster
          const timestamp = Date.now();
          logoPreviewLight.src = '/api/logo?t=' + timestamp;
          logoPreviewDark.src = '/api/logo?t=' + timestamp;
          faviconPreviewImg.src = '/api/favicon?t=' + timestamp;

          if (payload.reset_logo) {
            document.getElementById('logo-status-badge').textContent = 'Default Logo Active';
            document.getElementById('logo-status-badge').className = 'badge badge-status-pill badge-secondary ml-auto';
            document.getElementById('reset_logo').checked = false;
          } else if (logoFile) {
            document.getElementById('logo-status-badge').textContent = 'Custom Logo Active';
            document.getElementById('logo-status-badge').className = 'badge badge-status-pill badge-success ml-auto';
          }

        } catch (err) {
          showToast('Error', err.message, false);
        } finally {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<i class="fa fa-save mr-2"></i> Save Website Settings';
        }
      });

      function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result;
            const b64 = result.split(',')[1] || '';
            resolve(b64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
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
    });
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/settings/website-settings' }));
  }

  /**
   * Save website settings API handler
   */
  async function handleSaveWebsiteSettings(request, response) {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) { // 10MB limit
        throw httpError('Payload too large', 413);
      }
    }
    const input = JSON.parse(body || '{}');

    // Ensure table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS website_settings (
        id INT PRIMARY KEY DEFAULT 1,
        website_name TEXT NOT NULL DEFAULT 'Easy Recharge Solution',
        website_tagline TEXT DEFAULT 'India''s Leading B2B Multi-Recharge & LAPU Stock Exchange Platform',
        logo_data BYTEA,
        logo_mime TEXT,
        logo_url TEXT,
        favicon_data BYTEA,
        favicon_mime TEXT,
        favicon_url TEXT,
        support_phone TEXT DEFAULT '+91 98765 43210',
        support_whatsapp TEXT DEFAULT '+91 98765 43210',
        support_email TEXT DEFAULT 'support@easyrechargesolution.com',
        office_address TEXT DEFAULT 'Cyber City, Sector 62, Noida, Uttar Pradesh, India - 201309',
        working_hours TEXT DEFAULT '24x7 Customer & Stock Support',
        footer_about TEXT DEFAULT 'Empowering telecom retailers and master distributors across India with lightning-fast multi-recharge services, automated LAPU stock swapping, and bank-grade APIs.',
        social_telegram TEXT DEFAULT 'https://t.me/easyrechargesolution',
        meta_title TEXT DEFAULT 'Easy Recharge Solution | B2B Recharge & Stock Exchange',
        meta_description TEXT DEFAULT 'Instant Mobile, DTH, LAPU Stock Exchange & Utility Recharge API Platform with 99.99% uptime.',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      INSERT INTO website_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    `);

    // Prepare update parameters
    const websiteName = String(input.website_name || 'Easy Recharge Solution').trim();
    const websiteTagline = String(input.website_tagline || '').trim();
    const supportPhone = String(input.support_phone || '').trim();
    const supportWhatsapp = String(input.support_whatsapp || '').trim();
    const supportEmail = String(input.support_email || '').trim();
    const officeAddress = String(input.office_address || '').trim();
    const workingHours = String(input.working_hours || '').trim();
    const socialTelegram = String(input.social_telegram || '').trim();
    const footerAbout = String(input.footer_about || '').trim();
    const metaTitle = String(input.meta_title || '').trim();
    const metaDescription = String(input.meta_description || '').trim();

    await db.query(`
      UPDATE website_settings SET
        website_name = $1,
        website_tagline = $2,
        support_phone = $3,
        support_whatsapp = $4,
        support_email = $5,
        office_address = $6,
        working_hours = $7,
        social_telegram = $8,
        footer_about = $9,
        meta_title = $10,
        meta_description = $11,
        updated_at = now()
      WHERE id = 1
    `, [
      websiteName,
      websiteTagline,
      supportPhone,
      supportWhatsapp,
      supportEmail,
      officeAddress,
      workingHours,
      socialTelegram,
      footerAbout,
      metaTitle,
      metaDescription,
    ]);

    // Handle logo reset or upload
    if (input.reset_logo) {
      await db.query('UPDATE website_settings SET logo_data = NULL, logo_mime = NULL, logo_url = NULL, updated_at = now() WHERE id = 1');
    } else if (input.logo_data_b64) {
      const buf = Buffer.from(input.logo_data_b64, 'base64');
      const mime = String(input.logo_mime || 'image/png').trim();
      await db.query('UPDATE website_settings SET logo_data = $1, logo_mime = $2, updated_at = now() WHERE id = 1', [buf, mime]);
    }

    // Handle favicon reset or upload
    if (input.reset_favicon) {
      await db.query('UPDATE website_settings SET favicon_data = NULL, favicon_mime = NULL, favicon_url = NULL, updated_at = now() WHERE id = 1');
    } else if (input.favicon_data_b64) {
      const buf = Buffer.from(input.favicon_data_b64, 'base64');
      const mime = String(input.favicon_mime || 'image/x-icon').trim();
      await db.query('UPDATE website_settings SET favicon_data = $1, favicon_mime = $2, updated_at = now() WHERE id = 1', [buf, mime]);
    }

    sendJson(response, 200, {
      ok: true,
      message: 'Website settings and logo saved successfully.',
    });
  }

  return {
    sendAdminWebsiteSettingsPage,
    handleSaveWebsiteSettings,
    fetchSettings,
  };
};
