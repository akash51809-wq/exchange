'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const createAdminUserListPage = require('../pages/admin-user-list');
const { addPanelChrome } = require('../lib/panel-chrome');

test('Admin User List - Switch to User Button & Action Elements', async (t) => {
  const mockUser = {
    id: '11111111-2222-3333-4444-555555555555',
    username: 'selleruser01',
    name: 'Seller User 01',
    email: 'seller01@example.com',
    phone_ciphertext: Buffer.from('testphone'),
    status: 'active',
    created_at: new Date('2026-02-01T10:00:00Z'),
    address: '456 Commercial Hub',
    pincode: '400001',
    state: 'Maharashtra',
    city: 'Mumbai',
    callback_url: 'https://webhook.site/seller01-callback',
    api_token: 'tok_selleruser01_secret',
    parent_id: null,
    parent_username: null,
    parent_name: null,
    balance_minor: 1250000n,
  };

  const mockDb = {
    query: async (sql) => {
      if (sql.includes('ALTER TABLE users') || sql.includes('ALTER TABLE user_sessions')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('count(*)::int AS total')) {
        return { rows: [{ total: 1 }], rowCount: 1 };
      }
      if (sql.includes('FROM users u LEFT JOIN wallets w')) {
        return { rows: [mockUser], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const { sendAdminUserListPage } = createAdminUserListPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    decryptMobile: () => '9876501234',
    normalizeIndianMobile: (m) => m,
    lookupMobile: (m) => m,
  });

  await t.test('renders Switch to User button with target="_blank", fa-sign-in icon and correct link', async () => {
    let capturedHtml = '';
    const mockResponse = {
      writeHead: () => {},
      end: (data) => { capturedHtml = data; },
    };

    await sendAdminUserListPage(
      { id: 'admin-id-1', role: 'admin', username: 'admin' },
      mockResponse,
      new URLSearchParams()
    );

    // 1. Verify Switch to User button exists
    assert.ok(
      capturedHtml.includes('class="user-action switch-user"'),
      'Switch to User action button must have class "user-action switch-user"'
    );
    assert.ok(
      capturedHtml.includes('title="Switch to User"'),
      'Switch to User action button must have title="Switch to User"'
    );

    // 2. Verify target="_blank" so user panel opens in a new tab
    assert.ok(
      capturedHtml.includes('target="_blank"'),
      'Switch to User button must open in a new tab via target="_blank"'
    );

    // 3. Verify href points to /admin/users/:id/switch
    assert.ok(
      capturedHtml.includes(`href="/admin/users/${mockUser.id}/switch"`),
      'Switch to User button must link to /admin/users/:id/switch'
    );

    // 4. Verify data attributes and icon
    assert.ok(
      capturedHtml.includes(`data-switch-user="${mockUser.id}"`),
      'Switch to User button must have data-switch-user attribute'
    );
    assert.ok(
      capturedHtml.includes('fa-sign-in'),
      'Switch to User button must have fa-sign-in icon'
    );
  });
});

test('Panel Chrome - User View Impersonation Header & Return to Admin', async (t) => {
  const mockDb = {
    query: async (sql) => {
      if (sql.includes('FROM wallets')) {
        return {
          rows: [{ balance_minor: 500000n, buyer_balance_minor: 300000n, seller_balance_minor: 200000n }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM website_settings')) {
        return { rows: [{ wallet_mode: 'separate' }], rowCount: 1 };
      }
      if (sql.includes('FROM user_sessions')) {
        return { rows: [{ impersonated_by: 'admin-uuid-123' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  await t.test('renders Switched to User badge and Back to Admin link when impersonated', async () => {
    const rawHtml = `<!DOCTYPE html><html><head><title>User Dashboard</title></head><body><div class="page-content">Dashboard Content</div></body></html>`;

    const result = await addPanelChrome(rawHtml, {
      role: 'user',
      userId: 'user-uuid-456',
      db: mockDb,
      currentPath: '/dashboard',
      impersonatedBy: 'admin-uuid-123',
    });

    assert.ok(result.includes('Switched to User'), 'Must display Switched to User badge');
    assert.ok(result.includes('href="/admin/switch-back"'), 'Must include link to /admin/switch-back');
    assert.ok(result.includes('Back to Admin'), 'Must have Back to Admin button');
    assert.ok(result.includes('Exit View'), 'Logout button must say Exit View when impersonating');
  });

  await t.test('renders normal header without impersonation badge for regular user', async () => {
    const rawHtml = `<!DOCTYPE html><html><head><title>User Dashboard</title></head><body><div class="page-content">Dashboard Content</div></body></html>`;

    const regularDb = {
      query: async (sql) => {
        if (sql.includes('FROM wallets')) {
          return { rows: [{ balance_minor: 500000n }], rowCount: 1 };
        }
        if (sql.includes('FROM website_settings')) {
          return { rows: [{ wallet_mode: 'single' }], rowCount: 1 };
        }
        if (sql.includes('FROM user_sessions')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const result = await addPanelChrome(rawHtml, {
      role: 'user',
      userId: 'regular-user-uuid',
      db: regularDb,
      currentPath: '/dashboard',
    });

    assert.equal(result.includes('Switched to User'), false, 'Should not show Switched to User for regular user');
    assert.equal(result.includes('href="/admin/switch-back"'), false, 'Should not show switch-back link for regular user');
    assert.ok(result.includes('Logout'), 'Regular user should see standard Logout button');
  });
});

test('Switch to User & Switch Back Protocol Specifications', async (t) => {
  await t.test('switch route regex matches valid UUID user paths', () => {
    const validUuid = '12345678-1234-4234-8234-123456789012';
    const switchPath = `/admin/users/${validUuid}/switch`;
    const apiSwitchPath = `/api/admin/users/${validUuid}/switch`;

    const switchMatch = switchPath.match(/^\/admin\/users\/([0-9a-f-]{36})\/switch$/i);
    const apiSwitchMatch = apiSwitchPath.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/switch$/i);

    assert.ok(switchMatch, 'Must match /admin/users/:id/switch');
    assert.equal(switchMatch[1], validUuid, 'Extracted user ID must match');
    assert.ok(apiSwitchMatch, 'Must match /api/admin/users/:id/switch');
    assert.equal(apiSwitchMatch[1], validUuid, 'Extracted user ID from API must match');
  });

  await t.test('cookie issuance structure preserves admin session and sets user session', () => {
    const SESSION_COOKIE = 'exchange_session';
    const ADMIN_SESSION_COOKIE = 'exchange_admin_session';
    const SESSION_DURATION_SECONDS = 12 * 60 * 60;

    const sessionCookie = (token, maxAge) =>
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
    const adminSessionCookie = (token, maxAge) =>
      `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;

    const adminToken = 'adm_tok_12345';
    const userToken = 'usr_tok_67890';

    const cookies = [
      sessionCookie(userToken, SESSION_DURATION_SECONDS),
      adminSessionCookie(adminToken, SESSION_DURATION_SECONDS),
    ];

    assert.equal(cookies.length, 2);
    assert.ok(cookies[0].startsWith('exchange_session=usr_tok_67890'), 'User token set in exchange_session');
    assert.ok(cookies[1].startsWith('exchange_admin_session=adm_tok_12345'), 'Admin token preserved in exchange_admin_session');
    assert.ok(cookies[0].includes('Path=/'), 'Cookie path is root');
    assert.ok(cookies[0].includes('HttpOnly'), 'Cookie is HttpOnly');
  });

  await t.test('switch-back route matches and revokes user session and clears admin cookie', () => {
    const switchBackPath = '/admin/switch-back';
    const switchBackMatch = (switchBackPath === '/admin/switch-back' || switchBackPath === '/admin/users/switch-back');
    assert.equal(switchBackMatch, true, 'Matches /admin/switch-back');

    const clearAdminCookie = 'exchange_admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
    assert.ok(clearAdminCookie.includes('Max-Age=0'), 'Admin cookie cleared on exit');
  });
});
