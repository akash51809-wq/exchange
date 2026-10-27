'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');

const createAdminUserListPage = require('../pages/admin-user-list');

test('Admin User List - Action Buttons & Configure Feature', async (t) => {
  const mockUser = {
    id: '12345678-1234-4234-8234-123456789012',
    username: 'testseller',
    name: 'Test Seller',
    email: 'seller@example.com',
    phone_ciphertext: Buffer.from('testphone'),
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00Z'),
    address: '123 Market St',
    pincode: '110001',
    state: 'Delhi',
    city: 'New Delhi',
    callback_url: 'https://webhook.site/test-callback',
    api_token: 'tok_test1234567890',
    parent_id: null,
    parent_username: null,
    parent_name: null,
    balance_minor: 50000n,
  };

  const mockDb = {
    query: async (sql, values) => {
      if (sql.includes('ALTER TABLE users')) {
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
    decryptMobile: () => '9876543210',
    normalizeIndianMobile: (m) => m,
    lookupMobile: (m) => m,
  });

  await t.test('verifies Configure button is present and Setup and Margin buttons are removed', async () => {
    let capturedHtml = '';
    const mockResponse = {
      writeHead: () => {},
      end: (data) => { capturedHtml = data; },
    };

    await sendAdminUserListPage(
      { id: 'admin1', role: 'admin', username: 'admin' },
      mockResponse,
      new URLSearchParams()
    );

    // 1. Margin button must NOT be present
    assert.equal(
      capturedHtml.includes('user-action margin'),
      false,
      'Margin button must be removed from user list'
    );
    assert.equal(
      capturedHtml.includes('data-margin='),
      false,
      'data-margin attribute must be removed'
    );

    // 2. Setup button must NOT be present
    assert.equal(
      capturedHtml.includes('user-action setup'),
      false,
      'User setup button must be removed from user list'
    );
    assert.equal(
      capturedHtml.includes('data-setup='),
      false,
      'data-setup attribute must be removed'
    );

    // 3. Configure button must BE present
    assert.equal(
      capturedHtml.includes('user-action configure'),
      true,
      'Configure button must be present in user actions'
    );
    assert.equal(
      capturedHtml.includes('title="Configure"'),
      true,
      'Configure button must have title="Configure"'
    );
    assert.equal(
      capturedHtml.includes('data-configure='),
      true,
      'data-configure attribute must be present on Configure button'
    );

    // 4. Edit, Password, Delete buttons must still be present
    assert.equal(capturedHtml.includes('user-action edit'), true, 'Edit button must remain');
    assert.equal(capturedHtml.includes('user-action password'), true, 'Password button must remain');
    assert.equal(capturedHtml.includes('user-action delete'), true, 'Delete button must remain');

    // 5. User details in data-configure must include callbackUrl and apiToken
    assert.equal(
      capturedHtml.includes('https://webhook.site/test-callback'),
      true,
      'Encoded data must contain user callback_url'
    );
    assert.equal(
      capturedHtml.includes('tok_test1234567890'),
      true,
      'Encoded data must contain user api_token'
    );
  });
});

test('Admin User List Client Script Verification', async (t) => {
  const clientScript = fs.readFileSync(path.join(__dirname, '..', 'pages', 'admin-user-list-client.js'), 'utf8');

  await t.test('client script binds to data-configure and removes data-setup and data-margin', () => {
    assert.equal(clientScript.includes('[data-configure]'), true, 'Must listen to [data-configure]');
    assert.equal(clientScript.includes('[data-setup]'), false, 'Must NOT listen to [data-setup]');
    assert.equal(clientScript.includes('[data-margin]'), false, 'Must NOT listen to [data-margin]');
  });

  await t.test('client script provides API token copy, generate, IP whitelist, callback URL and seller API controls', () => {
    // API Token & Webhook & IP Whitelist controls
    assert.equal(clientScript.includes('configApiTokenInput'), true, 'Must have API Token input');
    assert.equal(clientScript.includes('btnCopyToken'), true, 'Must have Copy Token button');
    assert.equal(clientScript.includes('btnGenToken'), true, 'Must have Generate Token button');
    assert.equal(clientScript.includes('configIpsInput'), true, 'Must have Whitelisted IPs textarea');
    assert.equal(clientScript.includes('configCallbackUrlInput'), true, 'Must have Callback URL input');

    // Seller API controls
    assert.equal(clientScript.includes('addSellerApiForm'), true, 'Must have Add Seller API form');
    assert.equal(clientScript.includes('data-toggle-api'), true, 'Must have Toggle Seller API button');
    assert.equal(clientScript.includes('data-delete-api'), true, 'Must have Delete Seller API button');
    assert.equal(clientScript.includes('/seller-api'), true, 'Must call seller-api endpoints');
  });
});

test('IP and URL Validation Logic', async (t) => {
  await t.test('IP validation correctly validates IPv4, IPv6 and rejects invalid entries', () => {
    assert.equal(net.isIP('116.202.172.205') !== 0, true, '116.202.172.205 must be valid IP');
    assert.equal(net.isIP('127.0.0.1') !== 0, true, '127.0.0.1 must be valid IP');
    assert.equal(net.isIP('::1') !== 0, true, '::1 must be valid IPv6');
    assert.equal(net.isIP('999.999.999.999') === 0, true, '999.999.999.999 must be invalid');
    assert.equal(net.isIP('not-an-ip') === 0, true, 'non-IP string must be invalid');
  });

  await t.test('Callback URL parsing accepts valid HTTP/HTTPS URLs and rejects invalid protocols', () => {
    const isValidHttpUrl = (str) => {
      try {
        const u = new URL(str);
        return ['http:', 'https:'].includes(u.protocol);
      } catch {
        return false;
      }
    };

    assert.equal(isValidHttpUrl('https://callback.example.com/webhook'), true);
    assert.equal(isValidHttpUrl('http://myserver.in/api/cb'), true);
    assert.equal(isValidHttpUrl('ftp://example.com/file'), false);
    assert.equal(isValidHttpUrl('javascript:alert(1)'), false);
    assert.equal(isValidHttpUrl('not-a-url'), false);
  });
});
