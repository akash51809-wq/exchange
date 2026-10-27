'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ADMIN_PANEL_MENU } = require('../config/admin-panel-menu');
const { logSentMessage, sendNotificationEvent } = require('../lib/notification-service');
const createAdminUserSendMsgLogPage = require('../pages/admin-user-send-msg-log');

test('Admin Navigation Menu - User Send Msg Log Configuration', async (t) => {
  await t.test('reports submenu contains User Send Msg Log', () => {
    const reportsMenu = ADMIN_PANEL_MENU.find((m) => m.label === 'Reports');
    assert.ok(reportsMenu, 'Reports menu item must exist');
    const msgLogItem = reportsMenu.items.find((i) => i.path === '/admin/reports/user-send-msg-log');
    assert.ok(msgLogItem, 'User Send Msg Log item must be present in Reports');
    assert.equal(msgLogItem.label, 'User Send Msg Log');
  });

  await t.test('user submenu also contains User Send Msg Log', () => {
    const userMenu = ADMIN_PANEL_MENU.find((m) => m.label === 'User');
    assert.ok(userMenu, 'User menu item must exist');
    const msgLogItem = userMenu.items.find((i) => i.path === '/admin/reports/user-send-msg-log');
    assert.ok(msgLogItem, 'User Send Msg Log item must be present in User menu');
    assert.equal(msgLogItem.label, 'User Send Msg Log');
  });
});

test('Message Logging Functionality - logSentMessage & sendNotificationEvent', async (t) => {
  await t.test('logSentMessage inserts record into database and resolves username if missing', async () => {
    const insertedRows = [];
    const mockDb = {
      query: async (sql, params) => {
        if (sql.includes('SELECT name, username FROM users')) {
          return { rowCount: 1, rows: [{ name: 'Test User', username: 'testuser' }] };
        }
        if (sql.includes('INSERT INTO user_sent_msg_logs')) {
          insertedRows.push({
            user_id: params[0],
            user_name: params[1],
            recipient: params[2],
            msg_type: params[3],
            platform: params[4],
            content: params[5],
            subject: params[6],
            status: params[7],
          });
          return { rowCount: 1, rows: [{ id: 'mock-log-id', created_at: new Date().toISOString() }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const res = await logSentMessage(mockDb, {
      userId: '11111111-1111-4111-8111-111111111111',
      recipient: '9876543210',
      msgType: 'Login OTP',
      platform: 'sms',
      content: 'Your Login OTP is 123456.',
      status: 'sent',
    });

    assert.ok(res, 'logSentMessage should return inserted record');
    assert.equal(insertedRows.length, 1);
    assert.equal(insertedRows[0].user_name, 'Test User');
    assert.equal(insertedRows[0].recipient, '9876543210');
    assert.equal(insertedRows[0].msg_type, 'Login OTP');
    assert.equal(insertedRows[0].platform, 'sms');
    assert.equal(insertedRows[0].content, 'Your Login OTP is 123456.');
  });

  await t.test('sendNotificationEvent records dispatched notifications in user_sent_msg_logs', async () => {
    const loggedMessages = [];
    const mockDb = {
      query: async (sql, params) => {
        if (sql.includes('SELECT event_key, title')) {
          return {
            rowCount: 1,
            rows: [{
              event_key: 'login_otp',
              title: 'Login OTP',
              recipient_type: 'user',
              whatsapp_enabled: true,
              email_enabled: true,
              sms_enabled: true,
              whatsapp_template: 'Your OTP is {{otp}}',
              email_subject: 'Login OTP',
              email_template: 'Your Email OTP is {{otp}}',
              sms_template: 'SMS OTP: {{otp}}',
            }],
          };
        }
        if (sql.includes("service_key = 'whatsapp'")) {
          return { rowCount: 1, rows: [{ config_ciphertext: Buffer.from('mock'), is_enabled: true }] };
        }
        if (sql.includes("service_key = 'sms'")) {
          return { rowCount: 1, rows: [{ config_ciphertext: Buffer.from('mock'), is_enabled: true }] };
        }
        if (sql.includes("service_key = 'email'")) {
          return { rowCount: 1, rows: [{ config_ciphertext: Buffer.from('mock'), is_enabled: true }] };
        }
        if (sql.includes('INSERT INTO user_sent_msg_logs')) {
          loggedMessages.push({
            recipient: params[2],
            msg_type: params[3],
            platform: params[4],
            content: params[5],
          });
          return { rowCount: 1, rows: [{ id: 'log-1' }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    // Override global fetch for testing
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      status: 200,
      text: async () => '{"status":"ok"}',
    });

    try {
      await sendNotificationEvent({
        db: mockDb,
        decryptServiceConfig: () => ({
          apiUrl: 'https://example.com/send?to=[RECIPIENT]&msg=[MESSAGE]',
          requestType: 'GET',
          provider: 'google_script',
          googleScriptUrl: 'https://script.google.com/macros/s/test/exec',
        }),
        eventKey: 'login_otp',
        params: { otp: '654321', name: 'Alok' },
        recipientMobile: '9988776655',
        recipientEmail: 'alok@example.com',
        userName: 'Alok',
      });

      // Should have logged WhatsApp, Email, and SMS
      assert.ok(loggedMessages.length >= 2, `Expected at least 2 logged messages, got ${loggedMessages.length}`);
      const platforms = loggedMessages.map((m) => m.platform);
      assert.ok(platforms.includes('whatsapp') || platforms.includes('sms') || platforms.includes('email'));
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('Admin User Send Msg Log Page - Structure, Filters & 25-Row Pager', async (t) => {
  const { sendAdminUserSendMsgLogPage } = createAdminUserSendMsgLogPage({
    db: {
      query: async (sql, params) => {
        if (sql.includes('COUNT(*) AS total_count')) {
          return {
            rowCount: 1,
            rows: [{ total_count: 50, sms_count: 20, whatsapp_count: 20, email_count: 10 }],
          };
        }
        if (sql.includes('COUNT(*) AS total')) {
          return {
            rowCount: 1,
            rows: [{ total: 50 }],
          };
        }
        if (sql.includes('SELECT l.id, l.user_id, l.user_name')) {
          // Generate 25 mock rows to verify 25 rows per page
          const rows = [];
          for (let i = 1; i <= 25; i++) {
            rows.push({
              id: `log-id-${i}`,
              user_id: `user-id-${i}`,
              user_name: `Test User ${i}`,
              username: `user${i}`,
              recipient: i % 2 === 0 ? `98765432${String(i).padStart(2, '0')}` : `user${i}@example.com`,
              msg_type: i % 3 === 0 ? 'Signup OTP' : 'Login OTP',
              platform: i % 3 === 0 ? 'email' : (i % 2 === 0 ? 'sms' : 'whatsapp'),
              content: `Your security OTP is ${100000 + i}. Valid for 5 mins.`,
              subject: i % 3 === 0 ? 'Account Notification' : null,
              status: 'sent',
              created_at: new Date().toISOString(),
            });
          }
          return { rowCount: rows.length, rows };
        }
        if (sql.includes('SELECT id, username, name')) {
          return {
            rowCount: 2,
            rows: [
              { id: 'u1', username: 'user1', name: 'User One', email: 'u1@example.com' },
              { id: 'u2', username: 'user2', name: 'User Two', email: 'u2@example.com' },
            ],
          };
        }
        if (sql.includes('SELECT DISTINCT msg_type')) {
          return {
            rowCount: 2,
            rows: [{ msg_type: 'Login OTP' }, { msg_type: 'Signup OTP' }],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    },
    sendJson: () => {},
    httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
  });

  await t.test('renders HTML page with filters, default today dates, and 25-row table', async () => {
    let responseBody = '';
    let responseHeaders = {};
    const mockResponse = {
      writeHead: (status, headers) => {
        responseHeaders = headers;
      },
      end: (data) => {
        responseBody = data;
      },
    };

    const searchParams = new URLSearchParams();
    await sendAdminUserSendMsgLogPage({ id: 'admin-id', role: 'admin' }, mockResponse, searchParams);

    assert.equal(responseHeaders['content-type'], 'text/html; charset=utf-8');
    assert.ok(responseBody.includes('User Send Msg Log'), 'Should have page title');
    assert.ok(responseBody.includes('From Date'), 'Should have From Date filter');
    assert.ok(responseBody.includes('To Date'), 'Should have To Date filter');
    assert.ok(responseBody.includes('User'), 'Should have User filter');
    assert.ok(responseBody.includes('Msg Type'), 'Should have Msg Type filter');
    assert.ok(responseBody.includes('Platform'), 'Should have Platform filter');

    // Default date verification (today)
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    assert.ok(responseBody.includes(`value="${today}"`), 'Filter should default to today date');

    // Table Columns
    assert.ok(responseBody.includes('Sl No'), 'Should have Sl No column');
    assert.ok(responseBody.includes('User Name'), 'Should have User Name column');
    assert.ok(responseBody.includes('User Number or Email'), 'Should have User Number or Email column');
    assert.ok(responseBody.includes('Platform'), 'Should have Platform column');
    assert.ok(responseBody.includes('Msg Type'), 'Should have Msg Type column');
    assert.ok(responseBody.includes('Msg Content'), 'Should have Msg Content column');
    assert.ok(responseBody.includes('Date Time'), 'Should have Date Time column');

    // Pagination verification (25 rows per page, 2 pages for 50 records)
    assert.ok(responseBody.includes('Showing <strong>1</strong> to <strong>25</strong> of <strong>50</strong> entries (25 per page)'), 'Should show 25 entries per page text');
    assert.ok(responseBody.includes('Next'), 'Should have Next page link');
    assert.ok(responseBody.includes('page=2'), 'Should have link to page 2');
  });

  await t.test('streams CSV / Excel file on download=csv', async () => {
    let responseBody = '';
    let responseHeaders = {};
    const mockResponse = {
      writeHead: (status, headers) => {
        responseHeaders = headers;
      },
      end: (data) => {
        responseBody = data;
      },
    };

    const searchParams = new URLSearchParams('download=csv');
    await sendAdminUserSendMsgLogPage({ id: 'admin-id', role: 'admin' }, mockResponse, searchParams);

    assert.equal(responseHeaders['content-type'], 'text/csv; charset=utf-8');
    assert.ok(responseHeaders['content-disposition'].includes('attachment; filename="user_send_msg_log_'), 'Should have attachment disposition');
    assert.ok(responseBody.includes('Sl No,Log ID,Date Time (IST),User Name,Username,Recipient (Mobile / Email),Platform,Message Type,Subject,Message Content,Status'));
    assert.ok(responseBody.includes('Test User 1'));
  });
});
