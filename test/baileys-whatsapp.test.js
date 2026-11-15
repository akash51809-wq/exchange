'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const baileysWhatsappService = require('../lib/baileys-whatsapp-service');
const createAdminServiceSettingsPage = require('../pages/admin-service-settings');

test('Baileys WhatsApp Service - getStatus returns structured connection state', async () => {
  const status = baileysWhatsappService.getStatus();
  assert.ok(status, 'Status object should exist');
  assert.ok('status' in status);
  assert.ok('isConnected' in status);
  assert.ok('connectedNumber' in status);
  assert.ok('profilePicUrl' in status);
  assert.ok('qrCodeDataUrl' in status);
  assert.strictEqual(typeof status.isConnected, 'boolean');
});

test('Baileys WhatsApp Service - sendMessage validates 10-digit mobile number', async () => {
  const invalid1 = await baileysWhatsappService.sendMessage('', 'Hello');
  assert.strictEqual(invalid1.sent, false);
  assert.match(invalid1.error, /invalid recipient/i);

  const invalid2 = await baileysWhatsappService.sendMessage('12345', 'Hello');
  assert.strictEqual(invalid2.sent, false);
  assert.match(invalid2.error, /at least 10 digits/i);

  // When not connected, returns informative error about scanning QR code
  const notConnectedRes = await baileysWhatsappService.sendMessage('9876543210', 'Test message');
  assert.strictEqual(notConnectedRes.sent, false);
  assert.match(notConnectedRes.error, /not connected|scan the QR/i);
});

test('Admin Service Settings - WhatsApp page HTML contains Baileys QR & Scan UI and removes old API inputs', async () => {
  const mockDb = {
    query: async () => ({ rowCount: 0, rows: [] }),
  };

  const handler = createAdminServiceSettingsPage({
    db: mockDb,
    encryptServiceConfig: () => 'encrypted',
    decryptServiceConfig: () => ({}),
    sendJson: () => {},
    httpError: (msg, code) => {
      const err = new Error(msg);
      err.statusCode = code;
      return err;
    },
  });

  let capturedHtml = '';
  const mockRes = {
    writeHead: () => {},
    end: (html) => {
      capturedHtml = html;
    },
  };

  await handler.sendAdminServiceSettingsPage({ id: 'admin-id', role: 'admin' }, mockRes);

  // Verifications:
  assert.ok(capturedHtml.includes('Direct WhatsApp Gateway'), 'Should contain WhatsApp Gateway heading');
  assert.ok(!capturedHtml.includes('(Baileys)'), 'Frontend HTML should not expose internal library Baileys');
  assert.ok(!capturedHtml.includes('WhiskeySockets'), 'Frontend HTML should not expose WhiskeySockets');
  assert.ok(capturedHtml.includes('id="btnBaileysConnect"'), 'Should contain Scan / Link WhatsApp button');
  assert.ok(capturedHtml.includes('id="btnBaileysLogout"'), 'Should contain Logout button');
  assert.ok(capturedHtml.includes('id="baileysQrImage"'), 'Should contain QR image element');
  assert.ok(capturedHtml.includes('id="baileysConnectedCard"'), 'Should contain Connected Card element');
  assert.ok(capturedHtml.includes('id="baileysConnectedDp"'), 'Should contain Connected DP element');
  assert.ok(capturedHtml.includes('placeholder="type your test here"'), 'Should have informative placeholder');
  assert.ok(!capturedHtml.includes('value="Hello! This is a test WhatsApp message'), 'Should not have prefilled default test message');
  assert.ok(capturedHtml.includes('id="btnSendTestWhatsapp"'), 'Should contain Send Test Message button');

  // Should NOT contain the old API configuration inputs
  assert.ok(!capturedHtml.includes('id="waApiUrl"'), 'Old waApiUrl should be removed');
  assert.ok(!capturedHtml.includes('id="waPostBody"'), 'Old waPostBody should be removed');
  assert.ok(!capturedHtml.includes('id="waHeaders"'), 'Old waHeaders should be removed');
  assert.ok(!capturedHtml.includes('id="btnSaveWhatsapp"'), 'Old btnSaveWhatsapp should be removed');
});

test('Admin Service Settings - handleSaveWhatsappSettings saves enabled toggle without requiring API URL', async () => {
  let savedEnabled = null;

  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO admin_service_settings')) {
        savedEnabled = params[0];
      }
      return { rowCount: 1, rows: [] };
    },
  };

  const handler = createAdminServiceSettingsPage({
    db: mockDb,
    encryptServiceConfig: (c) => JSON.stringify(c),
    decryptServiceConfig: (s) => JSON.parse(s),
    sendJson: (res, code, data) => {
      res.statusCode = code;
      res.data = data;
    },
    httpError: (msg, code) => {
      const err = new Error(msg);
      err.statusCode = code;
      return err;
    },
  });

  const res = {};
  await handler.handleSaveWhatsappSettings({}, res, { isEnabled: true });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(savedEnabled, true);
});

test('Admin Service Settings - Baileys Status endpoint returns live connection info', async () => {
  const handler = createAdminServiceSettingsPage({
    db: {},
    encryptServiceConfig: () => '',
    decryptServiceConfig: () => ({}),
    sendJson: (res, code, data) => {
      res.statusCode = code;
      res.data = data;
    },
    httpError: (m) => new Error(m),
  });

  const res = {};
  await handler.handleBaileysStatus({}, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.ok, true);
  assert.ok('status' in res.data);
  assert.ok('isConnected' in res.data);
});

test('Baileys WhatsApp Service - Session persistence to/from database store', async () => {
  const store = new Map();
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('SELECT file_name, file_data FROM whatsapp_session_store')) {
        const rows = [];
        for (const [key, val] of store.entries()) {
          rows.push({ file_name: key, file_data: val });
        }
        return { rowCount: rows.length, rows };
      }
      if (sql.includes('INSERT INTO whatsapp_session_store')) {
        store.set(params[0], params[1]);
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('DELETE FROM whatsapp_session_store')) {
        store.clear();
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  baileysWhatsappService.setDb(mockDb);

  // Clear session
  await baileysWhatsappService.clearDbSession();
  assert.strictEqual(store.size, 0);

  // Fake creds file
  const fs = require('fs');
  const path = require('path');
  baileysWhatsappService.ensureAuthDir();
  const testFile = path.join(baileysWhatsappService.authDir, 'test-key.json');
  fs.writeFileSync(testFile, JSON.stringify({ test: 'auth_value' }));

  // Sync to DB
  await baileysWhatsappService.syncSessionToDb();
  assert.ok(store.has('test-key.json'), 'Session file should be saved in DB store');

  // Restore from DB
  fs.unlinkSync(testFile);
  assert.strictEqual(fs.existsSync(testFile), false);
  const restored = await baileysWhatsappService.restoreSessionFromDb();
  assert.strictEqual(restored, true);
  assert.strictEqual(fs.existsSync(testFile), true);

  // Cleanup
  fs.unlinkSync(testFile);
  await baileysWhatsappService.clearDbSession();
});

test('Baileys WhatsApp Service - Robust phone normalization handles all variations', async () => {
  // Test with mock socket
  const originalSock = baileysWhatsappService.sock;
  const originalStatus = baileysWhatsappService.status;

  let capturedJid = null;
  let capturedText = null;

  baileysWhatsappService.status = 'connected';
  baileysWhatsappService.sock = {
    sendMessage: async (jid, content) => {
      capturedJid = jid;
      capturedText = content.text;
      return { key: { id: 'TEST_MSG_ID' }, messageTimestamp: 123456789 };
    },
  };

  try {
    // 10 digits
    let res = await baileysWhatsappService.sendMessage('9876543210', 'Test 1');
    assert.strictEqual(res.sent, true);
    assert.strictEqual(capturedJid, '919876543210@s.whatsapp.net');

    // +91 with spaces and dashes
    res = await baileysWhatsappService.sendMessage('+91 98765-43210', 'Test 2');
    assert.strictEqual(res.sent, true);
    assert.strictEqual(capturedJid, '919876543210@s.whatsapp.net');

    // 0 leading 11 digits
    res = await baileysWhatsappService.sendMessage('09876543210', 'Test 3');
    assert.strictEqual(res.sent, true);
    assert.strictEqual(capturedJid, '919876543210@s.whatsapp.net');

    // +910 leading 13 digits
    res = await baileysWhatsappService.sendMessage('+9109876543210', 'Test 4');
    assert.strictEqual(res.sent, true);
    assert.strictEqual(capturedJid, '919876543210@s.whatsapp.net');
  } finally {
    baileysWhatsappService.sock = originalSock;
    baileysWhatsappService.status = originalStatus;
  }
});
