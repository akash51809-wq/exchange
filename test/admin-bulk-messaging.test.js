'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ADMIN_PANEL_MENU, renderAdminNavigation } = require('../config/admin-panel-menu');
const createAdminSendBulkWhatsappPage = require('../pages/admin-send-bulk-whatsapp');
const createAdminSendBulkEmailPage = require('../pages/admin-send-bulk-email');
const { logSentMessage, formatBulkPersonalizedText } = require('../lib/notification-service');

test('Admin Navigation Menu - Bulk WhatsApp & Bulk Email Menu Items in Settings', () => {
  const settingsMenu = ADMIN_PANEL_MENU.find(m => m.label === 'Settings');
  assert.ok(settingsMenu, 'Settings menu must exist');

  const waItem = settingsMenu.items.find(i => i.path === '/admin/settings/send-bulk-whatsapp');
  assert.ok(waItem, 'Send Bulk WhatsApp must be present in Settings menu');
  assert.equal(waItem.label, 'Send Bulk WhatsApp');

  const emailItem = settingsMenu.items.find(i => i.path === '/admin/settings/send-bulk-email');
  assert.ok(emailItem, 'Send Bulk Email must be present in Settings menu');
  assert.equal(emailItem.label, 'Send Bulk Email');

  const navHtml = renderAdminNavigation('/admin/settings/send-bulk-whatsapp');
  assert.ok(navHtml.includes('/admin/settings/send-bulk-whatsapp'));
  assert.ok(navHtml.includes('Send Bulk WhatsApp'));
  assert.ok(navHtml.includes('/admin/settings/send-bulk-email'));
  assert.ok(navHtml.includes('Send Bulk Email'));
});

test('Send Bulk WhatsApp Page - Top Navigation Bar & Clean Component Elements', async () => {
  const mockUsers = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'rahul_trader',
      name: 'Rahul Telecom Services',
      status: 'active',
      phone_ciphertext: Buffer.from('9876543210'),
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      username: 'sharma_recharge',
      name: 'Sharma Communication',
      status: 'inactive',
      phone_ciphertext: Buffer.from('9123456780'),
    },
  ];

  const mockDb = {
    query: async () => ({ rows: mockUsers }),
  };

  const decryptMobile = (buf) => buf.toString('utf8');
  const { sendAdminSendBulkWhatsappPage } = createAdminSendBulkWhatsappPage({ db: mockDb, decryptMobile });

  let outputHtml = '';
  const mockResponse = {
    writeHead: () => {},
    end: (html) => { outputHtml = html; },
  };

  await sendAdminSendBulkWhatsappPage({ id: 'admin-1', role: 'admin' }, mockResponse);

  // Check Standard Top Navigation Menu Bar is present (as on every other page)
  assert.ok(outputHtml.includes('horizontalMenu'), 'Must include standard horizontal menu');
  assert.ok(outputHtml.includes('horizontalMenu-list'), 'Must include horizontalMenu-list');

  // Check Page Title and Breadcrumbs
  assert.ok(outputHtml.includes('Send Bulk WhatsApp'));

  // Ensure extra tabs and extra switch buttons are removed
  assert.ok(!outputHtml.includes('nav-tabs-custom'), 'Extra tabs must be removed');
  assert.ok(!outputHtml.includes('Switch to Bulk Email'), 'Extra switch button must be removed');

  // Check Recipient Mode Radios: Specific User vs All User
  assert.ok(outputHtml.includes('Choose Specific User'));
  assert.ok(outputHtml.includes('All User'));
  assert.ok(outputHtml.includes('name="recipientMode"'));
  assert.ok(outputHtml.includes('value="specific"'));
  assert.ok(outputHtml.includes('value="all"'));

  // Check Sub-filter: All Users, Active, Inactive
  assert.ok(outputHtml.includes('All Users'));
  assert.ok(outputHtml.includes('Active Users Only'));
  assert.ok(outputHtml.includes('Inactive / Blocked Users'));
  assert.ok(outputHtml.includes('name="userStatusFilter"'));

  // Check Message Box: Type text here
  assert.ok(outputHtml.includes('Type text here'));
  assert.ok(outputHtml.includes('id="whatsappMessage"'));

  // Check Keyword Box: [NAME] Firm Name
  assert.ok(outputHtml.includes('[NAME]'));
  assert.ok(outputHtml.includes('Firm Name'));

  // Check Send Button
  assert.ok(outputHtml.includes('id="btnSendWhatsapp"'));
  assert.ok(outputHtml.includes('Send Bulk WhatsApp'));

  // Check Users JSON payload has decrypted mobile info
  assert.ok(outputHtml.includes('Rahul Telecom Services'));
  assert.ok(outputHtml.includes('Sharma Communication'));
});

test('Send Bulk Email Page - Top Navigation Bar & Clean Component Elements', async () => {
  const mockUsers = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'rahul_trader',
      name: 'Rahul Telecom Services',
      status: 'active',
      email: 'rahul@example.com',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      username: 'sharma_recharge',
      name: 'Sharma Communication',
      status: 'inactive',
      email: 'sharma@example.com',
    },
  ];

  const mockDb = {
    query: async () => ({ rows: mockUsers }),
  };

  const { sendAdminSendBulkEmailPage } = createAdminSendBulkEmailPage({ db: mockDb });

  let outputHtml = '';
  const mockResponse = {
    writeHead: () => {},
    end: (html) => { outputHtml = html; },
  };

  await sendAdminSendBulkEmailPage({ id: 'admin-1', role: 'admin' }, mockResponse);

  // Check Standard Top Navigation Menu Bar is present (as on every other page)
  assert.ok(outputHtml.includes('horizontalMenu'), 'Must include standard horizontal menu');
  assert.ok(outputHtml.includes('horizontalMenu-list'), 'Must include horizontalMenu-list');

  // Check Page Title and Breadcrumbs
  assert.ok(outputHtml.includes('Send Bulk Email'));

  // Ensure extra tabs and extra switch buttons are removed
  assert.ok(!outputHtml.includes('nav-tabs-custom'), 'Extra tabs must be removed');
  assert.ok(!outputHtml.includes('Switch to Bulk WhatsApp'), 'Extra switch button must be removed');

  // Check Recipient Mode Radios: Specific User vs All User
  assert.ok(outputHtml.includes('Choose Specific User'));
  assert.ok(outputHtml.includes('All User'));
  assert.ok(outputHtml.includes('name="recipientMode"'));

  // Check Sub-filter: All Users, Active, Inactive
  assert.ok(outputHtml.includes('All Users'));
  assert.ok(outputHtml.includes('Active Users Only'));
  assert.ok(outputHtml.includes('Inactive / Blocked Users'));

  // Check Subject and Message Boxes
  assert.ok(outputHtml.includes('id="emailSubject"'));
  assert.ok(outputHtml.includes('Subject:'));
  assert.ok(outputHtml.includes('Type your msg here:'));
  assert.ok(outputHtml.includes('id="emailMessage"'));

  // Check Keyword Box: [NAME] Firm Name
  assert.ok(outputHtml.includes('[NAME]'));
  assert.ok(outputHtml.includes('Firm Name'));

  // Check Send Button
  assert.ok(outputHtml.includes('id="btnSendEmail"'));
  assert.ok(outputHtml.includes('Send Bulk Email'));

  // Check Users JSON payload has email info
  assert.ok(outputHtml.includes('rahul@example.com'));
  assert.ok(outputHtml.includes('sharma@example.com'));
});

test('Bulk WhatsApp & Email Keyword Personalization Replacement', () => {
  const user = {
    id: 'u-1',
    name: 'GOYALPAY',
    username: '9839680707',
  };

  // Exact user case tested live
  const sampleMsg = 'hi [NAME], \nThis is testing message.';
  const formattedMsg = formatBulkPersonalizedText(sampleMsg, user);
  assert.equal(formattedMsg, 'hi GOYALPAY, \nThis is testing message.');

  // Lowercase & case-insensitive variations
  assert.equal(formatBulkPersonalizedText('hi [name], welcome!', user), 'hi GOYALPAY, welcome!');
  assert.equal(formatBulkPersonalizedText('hi [Name], welcome!', user), 'hi GOYALPAY, welcome!');
  assert.equal(formatBulkPersonalizedText('hi [ NAME ], welcome!', user), 'hi GOYALPAY, welcome!');
  assert.equal(formatBulkPersonalizedText('hi [FIRM_NAME], welcome!', user), 'hi GOYALPAY, welcome!');

  // Username keyword replacement
  assert.equal(
    formatBulkPersonalizedText('Account: [NAME], Login: [USERNAME]', user),
    'Account: GOYALPAY, Login: 9839680707'
  );

  // Curly braces format
  assert.equal(formatBulkPersonalizedText('hi {{name}}, welcome!', user), 'hi GOYALPAY, welcome!');

  // Fallback when name is empty/null
  const userNoName = { id: 'u-2', name: '', username: 'goyalpay' };
  assert.equal(
    formatBulkPersonalizedText('hi [NAME], \nThis is testing message.', userNoName),
    'hi goyalpay, \nThis is testing message.'
  );

  // Email subject & body
  const emailSubjectTmpl = 'Notice for [NAME] regarding wallet limits';
  const emailBodyTmpl = 'Hello [NAME],\n\nPlease verify your profile.\n\nRegards,\nExchange Portal';

  const personalizedSubject = formatBulkPersonalizedText(emailSubjectTmpl, user);
  const personalizedBody = formatBulkPersonalizedText(emailBodyTmpl, user);

  assert.equal(personalizedSubject, 'Notice for GOYALPAY regarding wallet limits');
  assert.ok(personalizedBody.includes('Hello GOYALPAY,'));
});

test('Bulk Messaging Sent Log Integration - logSentMessage with msgType', async () => {
  const logged = [];
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO user_sent_msg_logs')) {
        logged.push({
          userId: params[0],
          userName: params[1],
          recipient: params[2],
          msgType: params[3],
          platform: params[4],
          content: params[5],
          subject: params[6],
          status: params[7],
        });
        return { rowCount: 1, rows: [{ id: 'mock-log-id' }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  // WhatsApp bulk log
  await logSentMessage(mockDb, {
    userId: '11111111-1111-4111-8111-111111111111',
    userName: 'Rahul Telecom Services',
    recipient: '9876543210',
    msgType: 'Bulk WhatsApp',
    platform: 'whatsapp',
    content: 'Dear Rahul Telecom Services, your monthly balance statement is ready.',
    status: 'sent',
    responsePayload: { sent: true },
  });

  // Email bulk log
  await logSentMessage(mockDb, {
    userId: '11111111-1111-4111-8111-111111111111',
    userName: 'Rahul Telecom Services',
    recipient: 'rahul@example.com',
    msgType: 'Bulk Email',
    platform: 'email',
    content: 'Dear Rahul Telecom Services,\n\nEmail body content.',
    subject: 'Important Announcement for Rahul Telecom Services',
    status: 'sent',
    responsePayload: { sent: true },
  });

  assert.equal(logged.length, 2);
  assert.equal(logged[0].platform, 'whatsapp');
  assert.equal(logged[0].msgType, 'Bulk WhatsApp');
  assert.equal(logged[0].status, 'sent');
  assert.equal(logged[1].platform, 'email');
  assert.equal(logged[1].msgType, 'Bulk Email');
  assert.equal(logged[1].subject, 'Important Announcement for Rahul Telecom Services');
});
