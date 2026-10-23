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

test('Admin Notifications - 17 Templates Specification and Keywords', async (t) => {
  await t.test('has exactly 17 default notification events', () => {
    assert.equal(DEFAULT_NOTIFICATION_TEMPLATES.length, 17);
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
  ];

  await t.test('contains all 17 required event keys in order', () => {
    const keys = DEFAULT_NOTIFICATION_TEMPLATES.map(t => t.event_key);
    assert.deepEqual(keys, expectedKeys);
  });

  await t.test('recipient types are correctly set for user vs admin alerts', () => {
    const adminAlerts = DEFAULT_NOTIFICATION_TEMPLATES.filter(t => t.recipient_type === 'admin');
    const adminKeys = adminAlerts.map(t => t.event_key);
    assert.deepEqual(adminKeys, ['add_wallet_request_admin', 'redeem_wallet_request_admin']);

    const userEvents = DEFAULT_NOTIFICATION_TEMPLATES.filter(t => t.recipient_type === 'user');
    assert.equal(userEvents.length, 15);
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
  });

  await t.test('only whatsapp and email channels are enabled by default', () => {
    for (const t of DEFAULT_NOTIFICATION_TEMPLATES) {
      assert.equal(t.whatsapp_enabled, true);
      assert.equal(t.email_enabled, true);
      assert.ok(t.whatsapp_template.length > 0);
      assert.ok(t.email_subject.length > 0);
      assert.ok(t.email_template.length > 0);
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
  assert.equal(insertedRows.length, 17);
  assert.equal(insertedRows[0][0], 'signup_otp');
  assert.equal(insertedRows[16][0], 'bank_approved_redeem');
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

  // Assert essential elements in HTML output
  assert.ok(responseBody.includes('Notification Settings &amp; Templates') || responseBody.includes('Notification Settings'));
  assert.ok(responseBody.includes('17 Events'));
  assert.ok(responseBody.includes('WA ON'));
  assert.ok(responseBody.includes('MAIL ON'));
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
});
