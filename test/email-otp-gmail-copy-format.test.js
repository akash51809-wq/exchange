'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_NOTIFICATION_TEMPLATES, renderTemplate } = require('../lib/notification-templates');
const { sendNotificationEvent } = require('../lib/notification-service');

test('Gmail OTP Format: signup_otp template has exact subject and copy button HTML markup', () => {
  const signupTemplate = DEFAULT_NOTIFICATION_TEMPLATES.find(t => t.event_key === 'signup_otp');
  assert.ok(signupTemplate, 'signup_otp template must exist');
  assert.equal(signupTemplate.email_subject, 'Your Verification Code');
  assert.match(signupTemplate.email_template, /^Your One-Time Password \(OTP\) is \{\{otp\}\}\./m);
  assert.match(signupTemplate.email_template, /<div style="font-size:28px;\s*font-weight:bold;">\s*\{\{otp\}\}\s*<\/div>/);

  const renderedSubject = renderTemplate(signupTemplate.email_subject, { otp: '484137' });
  const renderedBody = renderTemplate(signupTemplate.email_template, { otp: '484137' });

  assert.equal(renderedSubject, 'Your Verification Code');
  assert.match(renderedBody, /Your One-Time Password \(OTP\) is 484137\./);
  assert.match(renderedBody, /<div style="font-size:28px; font-weight:bold;">\s*484137\s*<\/div>/);
});

test('Gmail OTP Format: forgot_password template has exact subject and copy button HTML markup', () => {
  const resetTemplate = DEFAULT_NOTIFICATION_TEMPLATES.find(t => t.event_key === 'forgot_password');
  assert.ok(resetTemplate, 'forgot_password template must exist');
  assert.equal(resetTemplate.email_subject, 'Your Verification Code');
  assert.match(resetTemplate.email_template, /^Your One-Time Password \(OTP\) is \{\{reset_otp\}\}\./m);
  assert.match(resetTemplate.email_template, /<div style="font-size:28px;\s*font-weight:bold;">\s*\{\{reset_otp\}\}\s*<\/div>/);

  const renderedSubject = renderTemplate(resetTemplate.email_subject, { reset_otp: '484137' });
  const renderedBody = renderTemplate(resetTemplate.email_template, { reset_otp: '484137' });

  assert.equal(renderedSubject, 'Your Verification Code');
  assert.match(renderedBody, /Your One-Time Password \(OTP\) is 484137\./);
  assert.match(renderedBody, /<div style="font-size:28px; font-weight:bold;">\s*484137\s*<\/div>/);
});

test('Gmail OTP Format: sendNotificationEvent passes both clean plain text and HTML to email dispatcher', async () => {
  let capturedEmailPayload = null;

  const mockDb = {
    async query(sql) {
      if (sql.includes('admin_notification_templates')) {
        return {
          rowCount: 1,
          rows: [{
            event_key: 'signup_otp',
            title: 'Signup OTP',
            recipient_type: 'user',
            whatsapp_enabled: false,
            sms_enabled: false,
            email_enabled: true,
            email_subject: 'Your Verification Code',
            email_template: 'Your One-Time Password (OTP) is {{otp}}.\n<div style="font-size:28px; font-weight:bold;">\n  {{otp}}\n</div>',
          }],
        };
      }
      if (sql.includes('admin_service_settings')) {
        return {
          rowCount: 1,
          rows: [{ is_enabled: true, config_ciphertext: 'mock' }],
        };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  const decryptServiceConfig = () => ({
    provider: 'google_script',
    googleScriptUrl: 'https://script.google.com/macros/s/mock/exec',
    googleScriptKey: 'test-key',
    fromName: 'Exchange',
  });

  // Mock global fetch to capture payload
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    capturedEmailPayload = JSON.parse(opts.body);
    return {
      text: async () => JSON.stringify({ status: 'success' }),
    };
  };

  try {
    const res = await sendNotificationEvent({
      db: mockDb,
      decryptServiceConfig,
      eventKey: 'signup_otp',
      params: { otp: '484137' },
      recipientEmail: 'testuser@gmail.com',
    });

    assert.equal(res.ok, true);
    assert.ok(capturedEmailPayload, 'Payload must be sent to email provider');
    assert.equal(capturedEmailPayload.subject, 'Your Verification Code');
    assert.equal(capturedEmailPayload.text, 'Your One-Time Password (OTP) is 484137.');
    assert.match(capturedEmailPayload.html, /<div style="font-size:28px; font-weight:bold;">\s*484137\s*<\/div>/);
  } finally {
    global.fetch = origFetch;
  }
});
