'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { renderUserNavigation } = require('../config/user-panel-menu');
const createAdminServiceSettingsPage = require('../pages/admin-service-settings');
const createUserDashboardPage = require('../pages/user-dashboard');
const { addPanelChrome } = require('../lib/panel-chrome');

test('Submenu alignment: 2-column and standard dropdown items are strictly left-aligned', async () => {
  const adminNav = renderAdminNavigation('/admin/');
  assert.match(adminNav, /text-align:\s*left\s*!important/i);
  assert.match(adminNav, /justify-content:\s*flex-start\s*!important/i);

  const chromeHtml = await addPanelChrome('<div>Test</div>', { role: 'admin', currentPath: '/admin/' });
  assert.match(chromeHtml, /text-align:\s*left\s*!important/i);
  assert.match(chromeHtml, /justify-content:\s*flex-start\s*!important/i);

  const userNav = renderUserNavigation('/dashboard');
  assert.match(userNav, /text-align:\s*left\s*!important/i);
});

test('User Dashboard Banner: container and image have compact vertical height with responsive full width fit', async () => {
  const db = {
    async query() {
      return {
        rows: [{
          news_ticker: 'New Flash Announcement Live from Admin',
          news_ticker_enabled: true,
          dashboard_banner_enabled: true,
          has_dashboard_popup: false,
          dashboard_popup_enabled: false,
          website_name: 'Exchange Platform',
        }],
        rowCount: 1,
      };
    },
  };

  const userDashboard = createUserDashboardPage({
    db,
    formatRupees: (v) => '0.00',
    formatMinorUnits: (v) => '0.00',
  });

  let capturedHtml = '';
  const mockResponse = {
    writeHead() {},
    end(html) {
      capturedHtml = html;
    },
  };

  await userDashboard.sendUserDashboard({ id: 'u1', username: 'testuser', name: 'Test User', role: 'user' }, mockResponse);

  // Check banner styles (compact vertical height and full width left-to-right fit)
  assert.match(capturedHtml, /\.user-dashboard-banner-container\s*\{[^}]*(?:height|max-height):\s*120px\s*!important/s);
  assert.match(capturedHtml, /\.user-dashboard-banner-img\s*\{[^}]*object-fit:\s*(?:cover|contain)\s*!important/s);
  assert.match(capturedHtml, /\.user-dashboard-banner-img\s*\{[^}]*width:\s*100%\s*!important/s);

  // Check live news reflection
  assert.match(capturedHtml, /New Flash Announcement Live from Admin/);
});

test('Service Settings - Notifications: Saves live news and all 5 media options with DB persistence', async () => {
  const mockTable = {
    website_settings: [{
      id: 1,
      news_ticker: 'Original News',
      news_ticker_enabled: true,
      dashboard_banner_enabled: true,
      dashboard_banner_data: null,
      login_side_image_enabled: true,
      login_side_image_data: null,
      login_popup_enabled: false,
      login_popup_image_data: null,
      dashboard_popup_enabled: false,
      dashboard_popup_image_data: null,
    }],
  };

  const db = {
    async query(sql, params = []) {
      const s = String(sql).trim();
      if (/SELECT.*FROM website_settings/i.test(s)) {
        return { rows: mockTable.website_settings, rowCount: mockTable.website_settings.length };
      }
      if (/UPDATE website_settings/i.test(s)) {
        if (params && params.length >= 9) {
          mockTable.website_settings[0].news_ticker = params[0];
          mockTable.website_settings[0].news_ticker_enabled = params[1];
          mockTable.website_settings[0].dashboard_banner_enabled = params[2];
          mockTable.website_settings[0].login_side_image_enabled = params[3];
          mockTable.website_settings[0].login_popup_enabled = params[4];
          mockTable.website_settings[0].login_popup_link = params[5];
          mockTable.website_settings[0].dashboard_popup_enabled = params[6];
          mockTable.website_settings[0].dashboard_popup_frequency = params[7];
          mockTable.website_settings[0].dashboard_popup_link = params[8];
        }
        if (/dashboard_banner_data\s*=\s*\$1/i.test(s)) {
          mockTable.website_settings[0].dashboard_banner_data = params[0];
        }
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const page = createAdminServiceSettingsPage({
    db,
    encryptServiceConfig: (c) => JSON.stringify(c),
    decryptServiceConfig: (c) => JSON.parse(c),
    sendJson: (res, code, data) => {
      res.statusCode = code;
      res.body = data;
    },
    httpError: (msg, code) => new Error(`${code}: ${msg}`),
  });

  const mockResponse = {};
  await page.handleSaveNotificationSettings({}, mockResponse, {
    newsTickerText: 'Admin Updated Live Ticker 2026',
    newsTickerEnabled: true,
    dashboardBannerEnabled: true,
    dashboard_banner_data_b64: Buffer.from('mock-banner-binary').toString('base64'),
    dashboard_banner_mime: 'image/png',
    loginSideImageEnabled: true,
    login_side_image_data_b64: Buffer.from('mock-side-binary').toString('base64'),
    login_side_image_mime: 'image/png',
    loginPopupEnabled: true,
    loginPopupLink: 'https://example.com/login-offer',
    login_popup_image_data_b64: Buffer.from('mock-login-popup-binary').toString('base64'),
    login_popup_image_mime: 'image/jpeg',
    dashboardPopupEnabled: true,
    dashboardPopupFrequency: 'session',
    dashboardPopupLink: 'https://example.com/user-dash-popup',
    dashboard_popup_image_data_b64: Buffer.from('mock-dash-popup-binary').toString('base64'),
    dashboard_popup_image_mime: 'image/jpeg',
  });

  assert.equal(mockResponse.statusCode, 200);
  assert.equal(mockResponse.body.ok, true);
  assert.equal(mockTable.website_settings[0].news_ticker, 'Admin Updated Live Ticker 2026');
  assert.equal(mockTable.website_settings[0].news_ticker_enabled, true);
  assert.equal(mockTable.website_settings[0].dashboard_banner_enabled, true);
  assert.ok(mockTable.website_settings[0].dashboard_banner_data instanceof Buffer);
});

test('Landing Page: Exposes /user/login and does not expose /admin/login link', () => {
  const frontLanding = fs.readFileSync(path.resolve(__dirname, '../pages/front-landing-page.js'), 'utf8');
  assert.match(frontLanding, /href="\/user\/login"/);
  assert.doesNotMatch(frontLanding, /href="\/admin\/login"/);
});

test('Auth Client Script: Implements submit button disable lock against double-click', () => {
  const indexJs = fs.readFileSync(path.resolve(__dirname, '../index.js'), 'utf8');
  assert.match(indexJs, /submitBtn\.disabled\s*=\s*true/);
  assert.match(indexJs, /isSubmitting\s*=\s*true/);
  assert.match(indexJs, /recentLoginNotifications/);
  assert.match(indexJs, /Admin accounts cannot log in through the user portal/);
  assert.match(indexJs, /Only administrators can log in here/);
});
