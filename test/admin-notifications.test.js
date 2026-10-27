'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_NOTIFICATION_TEMPLATES,
  renderTemplate,
  seedNotificationTemplates,
  sendNotificationEvent,
} = require('../lib/notification-service');
const createAdminNotificationsPage = require('../pages/admin-notifications');

test('Admin Notifications - 18 Templates Specification and Keywords', async (t) => {
  await t.test('has exactly 18 default notification events', () => {
    assert.equal(DEFAULT_NOTIFICATION_TEMPLATES.length, 18);
  });

  const expectedKeys = [
    'signup_otp',
    'welcome_msg_signup',
    'reminder_msg_kyc',
    'forgot_password',
    'change_password',
    'login_otp',
    'login_info_user',
    'add_wallet_request_user',
    'add_wallet_request_admin',
    'wallet_approved_rejected_user',
    'redeem_wallet_request_user',
    'redeem_wallet_request_admin',
    'redeem_approved_rejected_user',
    'pending_recharge_seller',
    'pending_complaint_seller',
    'api_low_balance_user',
    'bank_approved_redeem',
    'seller_api_auto_disabled',
  ];

  await t.test('contains all 18 required event keys in order', () => {
    const keys = DEFAULT_NOTIFICATION_TEMPLATES.map(t => t.event_key);
    assert.deepEqual(keys, expectedKeys);
  });

  await t.test('recipient types are correctly set for user vs admin alerts', () => {
    const adminAlerts = DEFAULT_NOTIFICATION_TEMPLATES.filter(t => t.recipient_type === 'admin');
    const adminKeys = adminAlerts.map(t => t.event_key);
    assert.deepEqual(adminKeys, ['add_wallet_request_admin', 'redeem_wallet_request_admin']);

    const userEvents = DEFAULT_NOTIFICATION_TEMPLATES.filter(t => t.recipient_type === 'user');
    assert.equal(userEvents.length, 16);
  });

  await t.test('each event has scoped keywords relevant to its purpose', () => {
    const byKey = Object.fromEntries(DEFAULT_NOTIFICATION_TEMPLATES.map(t => [t.event_key, t]));

    // OTPs
    assert.deepEqual(byKey.signup_otp.allowed_keywords, ['name', 'otp', 'expiry_minutes', 'app_name']);
    assert.deepEqual(byKey.login_otp.allowed_keywords, ['name', 'otp', 'expiry_minutes', 'app_name']);

    // Admin Alerts
    assert.ok(byKey.add_wallet_request_admin.allowed_keywords.includes('admin_url'));
    assert.ok(byKey.add_wallet_request_admin.allowed_keywords.includes('utr'));
    assert.ok(!byKey.signup_otp.allowed_keywords.includes('admin_url'));

    // Seller complaints and disputes
    assert.ok(byKey.pending_complaint_seller.allowed_keywords.includes('reason'));
    assert.ok(byKey.pending_complaint_seller.allowed_keywords.includes('complaint_id'));

    // Low balance
    assert.ok(byKey.api_low_balance_user.allowed_keywords.includes('threshold_amount'));
    assert.ok(byKey.api_low_balance_user.allowed_keywords.includes('topup_url'));

    // Seller API Auto Disabled
    assert.ok(byKey.seller_api_auto_disabled.allowed_keywords.includes('seller_name'));
    assert.ok(byKey.seller_api_auto_disabled.allowed_keywords.includes('api_name'));
    assert.ok(byKey.seller_api_auto_disabled.allowed_keywords.includes('reason'));
  });

  await t.test('whatsapp, email, and sms channels are enabled by default with max 160-char SMS lock', () => {
    for (const t of DEFAULT_NOTIFICATION_TEMPLATES) {
      assert.equal(t.whatsapp_enabled, true);
      assert.equal(t.email_enabled, true);
      assert.equal(t.sms_enabled, true);
      assert.ok(t.whatsapp_template.length > 0);
      assert.ok(t.email_subject.length > 0);
      assert.ok(t.email_template.length > 0);
      assert.ok(t.sms_template.length > 0);
      assert.ok(t.sms_template.length <= 160, `SMS template for ${t.event_key} exceeds 160 characters (${t.sms_template.length})`);
    }
  });
});

test('Admin Notifications - Template Rendering Engine', async (t) => {
  await t.test('replaces placeholders with supplied params', () => {
    const tmpl = 'Hello {{name}}, your OTP is {{otp}} for {{app_name}}.';
    const rendered = renderTemplate(tmpl, { name: 'Rahul', otp: '482910', app_name: 'Exchange' });
    assert.equal(rendered, 'Hello Rahul, your OTP is 482910 for Exchange.');
  });

  await t.test('leaves missing variables intact as tags', () => {
    const tmpl = 'Dear {{name}}, reference ID is {{ref_id}}.';
    const rendered = renderTemplate(tmpl, { name: 'Aman' });
    assert.equal(rendered, 'Dear Aman, reference ID is {{ref_id}}.');
  });

  await t.test('handles empty or null template safely', () => {
    assert.equal(renderTemplate('', { name: 'Test' }), '');
    assert.equal(renderTemplate(null, { name: 'Test' }), '');
  });
});

test('Admin Notifications - Database Seeding', async () => {
  const insertedRows = [];
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO admin_notification_templates')) {
        insertedRows.push(params);
        return { rowCount: 1 };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  await seedNotificationTemplates(mockDb);
  assert.equal(insertedRows.length, 18);
  assert.equal(insertedRows[0][0], 'signup_otp');
  assert.equal(insertedRows[16][0], 'bank_approved_redeem');
  assert.equal(insertedRows[17][0], 'seller_api_auto_disabled');
});

test('Admin Notifications - Page Component Rendering', async () => {
  const templates = DEFAULT_NOTIFICATION_TEMPLATES.map((t, idx) => ({
    id: `00000000-0000-0000-0000-0000000000${String(idx).padStart(2, '0')}`,
    ...t,
    updated_at: new Date().toISOString(),
  }));

  const mockDb = {
    query: async () => ({ rows: templates }),
  };

  const { sendAdminNotificationsPage } = createAdminNotificationsPage({ db: mockDb });

  let responseBody = '';
  const mockResponse = {
    writeHead: () => {},
    end: (html) => { responseBody = html; },
  };

  await sendAdminNotificationsPage({ id: 'admin-1', role: 'admin' }, mockResponse);

  // Assert essential elements in HTML output matching reference table UI
  assert.ok(responseBody.includes('Notification Settings'));
  assert.ok(responseBody.includes('Notification List'));
  assert.ok(responseBody.includes('SEND WHATSAPP'));
  assert.ok(responseBody.includes('SEND EMAIL'));
  assert.ok(responseBody.includes('SEND SMS'));
  assert.ok(responseBody.includes('CONTENT'));
  assert.ok(responseBody.includes('notificationsTable'));
  assert.ok(responseBody.includes('signup_otp'));
  assert.ok(responseBody.includes('bank_approved_redeem'));
  assert.ok(responseBody.includes('Allowed Event Keywords'));
  assert.ok(responseBody.includes('Simulated Live Preview'));
  assert.ok(responseBody.includes('/api/admin/settings/notifications/toggle'));
});

test('Admin Notifications - High-level Event Dispatcher', async (t) => {
  await t.test('dispatches WhatsApp and Email when both enabled', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('FROM admin_notification_templates')) {
          return {
            rowCount: 1,
            rows: [{
              event_key: 'signup_otp',
              title: 'Signup OTP',
              recipient_type: 'user',
              whatsapp_enabled: true,
              email_enabled: true,
              whatsapp_template: 'Hi {{name}}, code is {{otp}}',
              email_subject: 'OTP {{otp}}',
              email_template: 'Hi {{name}}, code is {{otp}}',
            }],
          };
        }
        if (sql.includes("service_key = 'whatsapp'")) {
          return { rowCount: 0, rows: [] }; // unconfigured in mock
        }
        if (sql.includes("service_key = 'email'")) {
          return { rowCount: 0, rows: [] }; // unconfigured in mock
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const res = await sendNotificationEvent({
      db: mockDb,
      decryptServiceConfig: () => ({}),
      eventKey: 'signup_otp',
      params: { name: 'Vikas', otp: '123456' },
      recipientMobile: '9876543210',
      recipientEmail: 'vikas@example.com',
    });

    assert.equal(res.ok, true);
    assert.equal(res.eventKey, 'signup_otp');
    assert.ok(res.whatsapp);
    assert.ok(res.email);
    assert.ok(res.sms);
  });

  await t.test('returns disabled status when channels are toggled off', async () => {
    const mockDb = {
      query: async () => ({
        rowCount: 1,
        rows: [{
          event_key: 'signup_otp',
          title: 'Signup OTP',
          recipient_type: 'user',
          whatsapp_enabled: false,
          email_enabled: false,
          whatsapp_template: '',
          email_subject: '',
          email_template: '',
        }],
      }),
    };

    const res = await sendNotificationEvent({
      db: mockDb,
      decryptServiceConfig: () => ({}),
      eventKey: 'signup_otp',
      params: {},
      recipientMobile: '9876543210',
      recipientEmail: 'vikas@example.com',
    });

    assert.equal(res.ok, true);
    assert.equal(res.whatsapp.disabled, true);
    assert.equal(res.email.disabled, true);
  });

  await t.test('dispatches seller_api_auto_disabled event with reason and api_name', async () => {
    let capturedMobile = null;
    let capturedEmail = null;
    let capturedMsg = null;

    const mockDb = {
      query: async (sql, params) => {
        if (sql.includes('FROM admin_notification_templates WHERE event_key = $1')) {
          return {
            rowCount: 1,
            rows: [{
              event_key: 'seller_api_auto_disabled',
              title: 'Seller API Auto-Disabled Alert',
              recipient_type: 'user',
              whatsapp_enabled: true,
              email_enabled: true,
              whatsapp_template: 'Alert to Seller {{seller_name}}: Your Seller API "{{api_name}}" has been marked INACTIVE. Reason: {{reason}}.',
              email_subject: 'Alert: Seller API Inactive - {{api_name}}',
              email_template: 'Dear {{seller_name}},\n\nYour API "{{api_name}}" is disabled: {{reason}}',
            }],
          };
        }
        if (sql.includes("WHERE service_key = 'whatsapp'")) {
          return {
            rowCount: 1,
            rows: [{
              is_enabled: true,
              config_ciphertext: Buffer.from('dummy'),
            }],
          };
        }
        if (sql.includes("WHERE service_key = 'email'")) {
          return {
            rowCount: 1,
            rows: [{
              is_enabled: true,
              config_ciphertext: Buffer.from('dummy'),
            }],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const res = await sendNotificationEvent({
      db: mockDb,
      decryptServiceConfig: () => ({
        apiUrl: 'https://wa.gateway/send?to=[MOBILE]&msg=[MESSAGE]',
      }),
      eventKey: 'seller_api_auto_disabled',
      params: {
        seller_name: 'FastPay',
        api_name: 'Ivan Route',
        reason: '5 consecutive failed transactions reached',
        date_time: '26-Oct-2026 08:00 PM',
      },
      recipientMobile: '9876543210',
      recipientEmail: 'seller@example.com',
    });

    assert.equal(res.ok, true);
    assert.equal(res.eventKey, 'seller_api_auto_disabled');
    assert.ok(res.whatsapp !== null);
  });

  await t.test('strict channel isolation: WhatsApp OTP never sent to email, Email OTP never sent to WhatsApp', async () => {
    // WhatsApp OTP dispatch: recipientMobile provided, recipientEmail omitted
    const waOnlyRes = await sendNotificationEvent({
      db: { query: async () => ({ rowCount: 0, rows: [] }) },
      decryptServiceConfig: () => ({ apiUrl: 'https://wa.gateway/send?to=[MOBILE]&msg=[MESSAGE]' }),
      eventKey: 'signup_otp',
      params: { name: 'Ramesh', otp: '123456', expiry_minutes: 5 },
      recipientMobile: '9876543210',
    });
    assert.equal(waOnlyRes.ok, true);
    assert.equal(waOnlyRes.email.sent, false);
    assert.equal(waOnlyRes.email.error, 'No recipient email address provided');

    // Email OTP dispatch: recipientEmail provided, recipientMobile omitted
    const emailOnlyRes = await sendNotificationEvent({
      db: { query: async () => ({ rowCount: 0, rows: [] }) },
      decryptServiceConfig: () => ({}),
      eventKey: 'signup_otp',
      params: { name: 'Ramesh', otp: '654321', expiry_minutes: 5 },
      recipientEmail: 'ramesh@example.com',
    });
    assert.equal(emailOnlyRes.ok, true);
    assert.equal(emailOnlyRes.whatsapp.sent, false);
    assert.equal(emailOnlyRes.whatsapp.error, 'No recipient mobile number provided');
  });
});

test('Admin Notifications - SMS Gateway Integration and 160-char Limit Lock', async (t) => {
  const { sendSmsNotification } = require('../lib/notification-service');

  await t.test('sendSmsNotification performs keyword replacements and truncates at 160 chars', async () => {
    let calledUrl = '';
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      calledUrl = url;
      return {
        status: 200,
        text: async () => '{"status":"SUCCESS","message":"SMS sent"}',
      };
    };

    try {
      const mockDb = {
        query: async () => ({
          rowCount: 1,
          rows: [{
            is_enabled: true,
            config_ciphertext: Buffer.from('dummy'),
          }],
        }),
      };

      const longMessage = 'A'.repeat(200); // 200 chars

      const result = await sendSmsNotification({
        db: mockDb,
        decryptServiceConfig: () => ({
          apiUrl: 'https://services.easyrechargesolution.com/api/sms/send?token=TEST_TOKEN&recipient=[RECIPIENT]&message=[MESSAGE]&simSlot=[SIM_SLOT]',
          simSlot: '0',
        }),
        toNumber: '9876543210',
        message: longMessage,
      });

      assert.equal(result.sent, true);
      assert.equal(result.status, 200);
      assert.ok(calledUrl.includes('recipient=9876543210'));
      assert.ok(calledUrl.includes('simSlot=0'));
      // The message query param should be exactly 160 A's
      const expectedMessageParam = 'message=' + 'A'.repeat(160);
      assert.ok(calledUrl.includes(expectedMessageParam));
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test('createAdminServiceSettingsPage handles save and test for SMS Gateway', async () => {
    const createAdminServiceSettingsPage = require('../pages/admin-service-settings');
    let savedRow = null;
    let sentJson = null;

    const mockDb = {
      query: async (sql, params) => {
        if (sql.includes("INSERT INTO admin_service_settings (service_key, is_enabled, config_ciphertext")) {
          savedRow = { sql, params };
          return { rowCount: 1 };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const mockSendJson = (res, status, payload) => {
      sentJson = { status, payload };
    };

    const { handleSaveSmsSettings, handleTestSms, sendAdminServiceSettingsPage } = createAdminServiceSettingsPage({
      db: mockDb,
      encryptServiceConfig: (cfg) => Buffer.from(JSON.stringify(cfg)),
      decryptServiceConfig: (buf) => JSON.parse(buf.toString()),
      sendJson: mockSendJson,
      httpError: (msg, code) => Object.assign(new Error(msg), { statusCode: code }),
    });

    // 1. Test save SMS settings
    await handleSaveSmsSettings({}, {}, {
      isEnabled: true,
      requestType: 'GET',
      apiUrl: 'https://services.easyrechargesolution.com/api/sms/send?token=TEST_TOKEN&recipient=[RECIPIENT]&message=[MESSAGE]&simSlot=0',
      simSlot: '0',
    });

    assert.equal(sentJson.status, 200);
    assert.equal(sentJson.payload.ok, true);
    assert.equal(savedRow.params[0], true);

    // 2. Test send test SMS
    let calledUrl = '';
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      calledUrl = url;
      return { status: 200, text: async () => '{"status":"SUCCESS"}' };
    };

    try {
      await handleTestSms({}, {}, {
        toNumber: '9876543210',
        message: 'Test SMS'.repeat(25), // > 160 chars
        requestType: 'GET',
        apiUrl: 'https://services.easyrechargesolution.com/api/sms/send?token=TEST_TOKEN&recipient=[RECIPIENT]&message=[MESSAGE]&simSlot=0',
        simSlot: '0',
      });
      assert.equal(sentJson.status, 200);
      assert.equal(sentJson.payload.ok, true);
      assert.ok(calledUrl.includes('recipient=9876543210'));
    } finally {
      global.fetch = originalFetch;
    }

    // 3. Test sendAdminServiceSettingsPage HTML renders SMS Gateway tab
    let htmlOutput = '';
    await sendAdminServiceSettingsPage({ id: 'admin-1', role: 'admin' }, {
      writeHead: () => {},
      end: (h) => { htmlOutput = h; },
    });
    assert.ok(htmlOutput.includes('SMS Gateway Integration'));
    assert.ok(htmlOutput.includes('smsEnabled'));
    assert.ok(htmlOutput.includes('smsApiUrl'));
    assert.ok(htmlOutput.includes('testSmsRecipient'));
  });

});
