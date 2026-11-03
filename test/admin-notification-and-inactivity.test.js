'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkAndDeactivateInactiveUsers } = require('../lib/user-inactivity-service');
const createAdminServiceSettingsPage = require('../pages/admin-service-settings');
const createAdminWebsiteSettingsPage = require('../pages/admin-website-settings');

function createMockDb() {
  const tables = {
    users: [
      {
        id: 'u-active-recent-buyer',
        username: 'buyer1',
        role: 'user',
        status: 'active',
        created_at: new Date(Date.now() - 40 * 86400 * 1000),
        deleted_at: null,
      },
      {
        id: 'u-active-recent-seller',
        username: 'seller1',
        role: 'user',
        status: 'active',
        created_at: new Date(Date.now() - 50 * 86400 * 1000),
        deleted_at: null,
      },
      {
        id: 'u-active-inactive-user',
        username: 'sleeping1',
        role: 'user',
        status: 'active',
        created_at: new Date(Date.now() - 60 * 86400 * 1000),
        deleted_at: null,
      },
      {
        id: 'u-already-blocked',
        username: 'blocked1',
        role: 'user',
        status: 'blocked',
        created_at: new Date(Date.now() - 90 * 86400 * 1000),
        deleted_at: null,
      },
      {
        id: 'u-admin-no-txns',
        username: 'admin1',
        role: 'admin',
        status: 'active',
        created_at: new Date(Date.now() - 100 * 86400 * 1000),
        deleted_at: null,
      },
    ],
    recharge_orders: [
      {
        id: 'ord-1',
        user_id: 'u-active-recent-buyer',
        seller_user_id: 'someone-else',
        created_at: new Date(Date.now() - 5 * 86400 * 1000),
      },
      {
        id: 'ord-2',
        user_id: 'someone-else',
        seller_user_id: 'u-active-recent-seller',
        created_at: new Date(Date.now() - 10 * 86400 * 1000),
      },
    ],
    website_settings: [
      {
        id: 1,
        news_ticker: 'Test ticker',
        news_ticker_enabled: true,
        dashboard_banner_data: Buffer.from('fake-banner'),
        dashboard_banner_mime: 'image/png',
        login_side_image_data: Buffer.from('fake-side-image'),
        login_side_image_mime: 'image/png',
        login_side_image_enabled: true,
        login_popup_enabled: true,
        login_popup_image_data: Buffer.from('fake-popup'),
        login_popup_image_mime: 'image/jpeg',
        login_popup_link: 'https://example.com/promo',
        dashboard_popup_enabled: true,
        dashboard_popup_image_data: Buffer.from('fake-dash-popup'),
        dashboard_popup_image_mime: 'image/jpeg',
        dashboard_popup_link: 'https://example.com/dash-notice',
        dashboard_popup_frequency: 'session',
      },
    ],
    admin_service_settings: [],
    admin_audit_logs: [],
    user_sessions: [],
  };

  return {
    tables,
    async query(sql, params = []) {
      const s = String(sql).trim();

      if (/SELECT u\.id, u\.username, u\.name/i.test(s) && /FROM users u/i.test(s)) {
        // Inactivity search query
        const days = params[0] || 30;
        const cutoff = new Date(Date.now() - days * 86400 * 1000);

        const inactiveUsers = tables.users.filter((u) => {
          if (u.role !== 'user' || u.status !== 'active' || u.deleted_at !== null) return false;
          if (u.created_at > cutoff) return false;
          // check if has buy or sale orders since cutoff
          const hasTxn = tables.recharge_orders.some(
            (o) => (o.user_id === u.id || o.seller_user_id === u.id) && o.created_at >= cutoff
          );
          return !hasTxn;
        });

        return { rows: inactiveUsers, rowCount: inactiveUsers.length };
      }

      if (/UPDATE users\s+SET status = 'blocked'/i.test(s)) {
        const ids = params[0] || [];
        for (const u of tables.users) {
          if (ids.includes(u.id)) {
            u.status = 'blocked';
          }
        }
        return { rowCount: ids.length };
      }

      if (/UPDATE user_sessions/i.test(s)) {
        return { rowCount: 0 };
      }

      if (/INSERT INTO admin_audit_logs/i.test(s)) {
        tables.admin_audit_logs.push({ sql, params });
        return { rowCount: 1 };
      }

      if (/SELECT.*FROM website_settings/i.test(s)) {
        return { rows: tables.website_settings, rowCount: tables.website_settings.length };
      }

      if (/UPDATE website_settings/i.test(s)) {
        return { rowCount: 1 };
      }

      if (/CREATE TABLE|ALTER TABLE|INSERT INTO website_settings/i.test(s)) {
        return { rowCount: 1 };
      }

      if (/SELECT.*FROM admin_service_settings/i.test(s)) {
        return { rows: tables.admin_service_settings, rowCount: tables.admin_service_settings.length };
      }

      if (/INSERT INTO admin_service_settings/i.test(s)) {
        return { rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

test('Feature: Inactivity Service - identifies and deactivates users with no Buy/Sale for X days', async () => {
  const db = createMockDb();

  // Test dry run
  const dryResult = await checkAndDeactivateInactiveUsers({ db, inactiveDays: 30, dryRun: true });
  assert.equal(dryResult.ok, true);
  assert.equal(dryResult.count, 1);
  assert.equal(dryResult.deactivatedUsers[0].username, 'sleeping1');
  // In dry run, user should still be active
  const sleepingUserBefore = db.tables.users.find((u) => u.username === 'sleeping1');
  assert.equal(sleepingUserBefore.status, 'active');

  // Test real deactivation
  const liveResult = await checkAndDeactivateInactiveUsers({ db, inactiveDays: 30, dryRun: false });
  assert.equal(liveResult.ok, true);
  assert.equal(liveResult.count, 1);

  // Check statuses
  const sleepingUserAfter = db.tables.users.find((u) => u.username === 'sleeping1');
  assert.equal(sleepingUserAfter.status, 'blocked'); // Marked inactive in users table

  const buyer = db.tables.users.find((u) => u.username === 'buyer1');
  assert.equal(buyer.status, 'active'); // Had recent buy order

  const seller = db.tables.users.find((u) => u.username === 'seller1');
  assert.equal(seller.status, 'active'); // Had recent sale order

  const admin = db.tables.users.find((u) => u.username === 'admin1');
  assert.equal(admin.status, 'active'); // Admin never auto-deactivated
});

test('Feature: Admin Service Settings - UI renamed to Notification, has inactivity setting and 5 media options with dimensions', async () => {
  const db = createMockDb();
  const page = createAdminServiceSettingsPage({
    db,
    encryptServiceConfig: (c) => JSON.stringify(c),
    decryptServiceConfig: (c) => JSON.parse(c),
    sendJson: () => {},
    httpError: (msg, code) => new Error(`${code}: ${msg}`),
  });

  let capturedHtml = '';
  const mockResponse = {
    writeHead() {},
    end(html) {
      capturedHtml = html;
    },
  };

  await page.sendAdminServiceSettingsPage({ role: 'admin', username: 'admin' }, mockResponse);

  // 1. Tab renamed to "Notification" (not "Push Notifications")
  assert.match(capturedHtml, /Notification\s*<\/button>/i);
  assert.doesNotMatch(capturedHtml, /Push Notifications\s*<\/button>/i);

  // 2. User Inactivity setting under General tab
  assert.match(capturedHtml, /Set User Inactive on Inactivity \(No Buy \/ Sale\)/i);
  assert.match(capturedHtml, /id="userInactivityDays"/);
  assert.match(capturedHtml, /id="btnRunInactivityCheck"/);

  // 3. Option 1: Live News Ticker
  assert.match(capturedHtml, /1\.\s*Live News/i);
  assert.match(capturedHtml, /id="newsTickerText"/);

  // 4. Option 2: Dashboard Banner with size
  assert.match(capturedHtml, /2\.\s*User Dashboard Banner/i);
  assert.match(capturedHtml, /1200\s*(?:&times;|x)\s*180\s*px/i);
  assert.match(capturedHtml, /id="dashboard_banner_file"/);

  // 5. Option 3: Login Page Right-Side Box Graphic with size
  assert.match(capturedHtml, /3\.\s*Login Page Right-Side Box Graphic/i);
  assert.match(capturedHtml, /800\s*(?:&times;|x)\s*900\s*px/i);
  assert.match(capturedHtml, /id="login_side_image_file"/);

  // 6. Option 4: Login Page Popup Modal with size
  assert.match(capturedHtml, /4\.\s*Login Page Popup/i);
  assert.match(capturedHtml, /600\s*(?:&times;|x)\s*600\s*px/i);
  assert.match(capturedHtml, /id="login_popup_image_file"/);

  // 7. Option 5: Post-Login Dashboard Popup Modal with size
  assert.match(capturedHtml, /5\.\s*User Dashboard Popup/i);
  assert.match(capturedHtml, /600\s*(?:&times;|x)\s*600\s*px/i);
  assert.match(capturedHtml, /id="dashboard_popup_image_file"/);
  assert.match(capturedHtml, /id="dashboardPopupFrequency"/);
});

test('Feature: Admin Website Settings - Dashboard Banner Upload removed', async () => {
  const db = createMockDb();
  const page = createAdminWebsiteSettingsPage({
    db,
    formatMinorUnits: () => '0.00',
    normalizeIndianMobile: (m) => m,
  });

  let capturedHtml = '';
  const mockResponse = {
    writeHead() {},
    end(html) {
      capturedHtml = html;
    },
  };

  await page.sendAdminWebsiteSettingsPage({ role: 'admin', username: 'admin' }, mockResponse);

  // Website settings should NOT have dashboard banner upload anymore
  assert.doesNotMatch(capturedHtml, /id="dashboard_banner_file"/);
  assert.doesNotMatch(capturedHtml, /User Dashboard Banner Image/i);
  // But must retain logo and favicon
  assert.match(capturedHtml, /id="logo_file"/);
  assert.match(capturedHtml, /id="favicon_file"/);
});

test('Feature: Notification handlers save all 5 settings and media', async () => {
  const db = createMockDb();
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
    newsTickerText: 'Flash Sale: 5% Bonus on All Lapu Loads Today!',
    newsTickerEnabled: true,
    loginSideImageEnabled: true,
    login_side_image_data_b64: Buffer.from('side-img-bytes').toString('base64'),
    login_side_image_mime: 'image/png',
    loginPopupEnabled: true,
    loginPopupLink: 'https://exchange.example.com/signup-bonus',
    login_popup_image_data_b64: Buffer.from('popup-img-bytes').toString('base64'),
    login_popup_image_mime: 'image/jpeg',
    dashboardPopupEnabled: true,
    dashboardPopupFrequency: 'session',
    dashboardPopupLink: 'https://exchange.example.com/notice',
    dashboard_popup_image_data_b64: Buffer.from('dash-img-bytes').toString('base64'),
    dashboard_popup_image_mime: 'image/jpeg',
  });

  assert.equal(mockResponse.statusCode, 200);
  assert.equal(mockResponse.body.ok, true);
});
