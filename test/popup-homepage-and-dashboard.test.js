'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createFrontLandingPage = require('../pages/front-landing-page');
const createUserDashboardPage = require('../pages/user-dashboard');
const createAdminStaticUi = require('../pages/admin-static-ui');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

test('Homepage Popup Modal: Renders when popup image exists in website_settings', async () => {
  const fakeDb = {
    async query(sql) {
      if (sql.includes('website_settings')) {
        return {
          rows: [{
            website_name: 'Test Exchange',
            login_popup_image_data: Buffer.from('fake-image-bytes'),
            login_popup_image_mime: 'image/png',
            login_popup_enabled: true,
            login_popup_link: 'https://example.com/promo',
            updated_at: new Date('2026-11-07T12:00:00Z'),
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const { sendFrontLandingPage } = createFrontLandingPage({
    db: fakeDb,
    sendJson: () => {},
  });

  let capturedHtml = '';
  const mockRes = {
    writeHead() {},
    end(html) {
      capturedHtml = html ? html.toString('utf8') : '';
    },
  };

  await sendFrontLandingPage({}, mockRes);

  assert.match(capturedHtml, /id="homeNoticeModal"/i, 'Must render homeNoticeModal on homepage');
  assert.match(capturedHtml, /id="closeHomeNoticeModal"/i, 'Must have close button');
  assert.match(capturedHtml, /src="\/api\/login-popup-image\?v=/i, 'Must load popup image from API with cache-bust version');
  assert.match(capturedHtml, /href="https:\/\/example\.com\/promo"/i, 'Must link to configured popup URL');
  assert.match(capturedHtml, /sessionStorage\.getItem\(popupKey\)/i, 'Must check sessionStorage with timestamp key');
});

test('Homepage Popup Modal: Omitted when no popup image is configured', async () => {
  const fakeDb = {
    async query() {
      return {
        rows: [{
          website_name: 'Test Exchange',
          login_popup_image_data: null,
          dashboard_popup_image_data: null,
          login_popup_enabled: false,
        }],
        rowCount: 1,
      };
    },
  };

  const { sendFrontLandingPage } = createFrontLandingPage({
    db: fakeDb,
    sendJson: () => {},
  });

  let capturedHtml = '';
  const mockRes = {
    writeHead() {},
    end(html) {
      capturedHtml = html ? html.toString('utf8') : '';
    },
  };

  await sendFrontLandingPage({}, mockRes);
  assert.equal(capturedHtml.includes('id="homeNoticeModal"'), false, 'Must not render modal when no image configured');
});

test('Dashboard Popup Modal: Renders on user dashboard with smart fallback and timestamp key', async () => {
  const fakeDb = {
    async query(sql) {
      if (sql.includes('website_settings')) {
        return {
          rows: [{
            news_ticker: 'Test ticker',
            news_ticker_enabled: true,
            dashboard_banner_enabled: true,
            has_dashboard_popup: true,
            dashboard_popup_image_data: Buffer.from('dashboard-popup-bytes'),
            dashboard_popup_image_mime: 'image/png',
            dashboard_popup_enabled: true,
            dashboard_popup_link: 'https://example.com/dashboard-promo',
            dashboard_popup_frequency: 'session',
            updated_at: new Date('2026-11-07T14:30:00Z'),
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const userDashboard = createUserDashboardPage({
    db: fakeDb,
    formatRupees: () => '0.00',
    formatMinorUnits: () => '0.00',
  });

  let capturedHtml = '';
  const mockRes = {
    writeHead() {},
    end(html) {
      capturedHtml = html ? html.toString('utf8') : '';
    },
  };

  await userDashboard.sendUserDashboard({ id: 'u1', username: 'testuser', name: 'Test User', role: 'user' }, mockRes);

  assert.match(capturedHtml, /id="dashboardNoticeModal"/i, 'Must render dashboardNoticeModal');
  assert.match(capturedHtml, /id="closeDashboardNoticeModal"/i, 'Must have close button');
  assert.match(capturedHtml, /src="\/api\/dashboard-popup-image\?v=/i, 'Must load dashboard popup image with versioning');
  assert.match(capturedHtml, /href="https:\/\/example\.com\/dashboard-promo"/i, 'Must link to configured popup URL');
  assert.match(capturedHtml, /dashboard_popup_seen_/i, 'Must use versioned sessionStorage key');
});
