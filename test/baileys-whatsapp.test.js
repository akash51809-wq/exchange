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
  assert.ok(capturedHtml.includes('Direct WhatsApp Web Gateway (Baileys)'), 'Should contain Baileys heading');
  assert.ok(capturedHtml.includes('id="btnBaileysConnect"'), 'Should contain Scan / Link WhatsApp button');
  assert.ok(capturedHtml.includes('id="btnBaileysLogout"'), 'Should contain Logout button');
  assert.ok(capturedHtml.includes('id="baileysQrImage"'), 'Should contain QR image element');
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
