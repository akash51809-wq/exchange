'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatModernEmailHtml, extractOtpCode } = require('../lib/email-formatter');
const { sendEmailNotification } = require('../lib/notification-service');

test('Modern Email Formatter: extracts OTP codes reliably', () => {
  assert.equal(extractOtpCode('Your One-Time Password (OTP) is 736722.', ''), '736722');
  assert.equal(extractOtpCode('', '<div style="font-size:28px; font-weight:bold;"> 484137 </div>'), '484137');
  assert.equal(extractOtpCode('Your verification code is 918273. Valid for 10 min.', ''), '918273');
});

test('Modern Email Formatter: OTP email template formats high-contrast card and guarantees Gmail Copy button', () => {
  const result = formatModernEmailHtml({
    subject: 'Your Verification Code',
    text: 'Your One-Time Password (OTP) is 736722.',
    html: 'Your One-Time Password (OTP) is 736722.\n<div style="font-size:28px; font-weight:bold;">\n  736722\n</div>',
    fromName: 'Easy Recharge Solution',
    params: { name: 'John Doe' },
  });

  // Plain text must strictly start with the OTP phrase for Gmail detection
  assert.equal(result.plainText, 'Your One-Time Password (OTP) is 736722.');

  // HTML must contain modern branded card elements
  assert.match(result.formattedHtml, /SECURE LOGIN VERIFICATION/i);
  assert.match(result.formattedHtml, /EASY RECHARGE SOLUTION/i);
  assert.match(result.formattedHtml, /YOUR ONE-TIME PASSWORD/i);
  assert.match(result.formattedHtml, /736722/);
  assert.match(result.formattedHtml, /background:\s*#f0fdf4/); // Mint background
  assert.match(result.formattedHtml, /border:\s*1\.5px dashed #86efac/); // Dashed border
  assert.match(result.formattedHtml, /<div style="font-size:28px; font-weight:bold;">\s*736722\s*<\/div>/);
  assert.match(result.formattedHtml, /Security Advisory/i);
});

test('Modern Email Formatter: general alerts format key-value pairs into structured table', () => {
  const alertText = `Dear Admin,
A seller API has been auto-disabled due to repeated errors.
- API Name: Airtel LAPU API
- Error Reason: Continuous 10 transactions failed
- Trigger Time: 2026-11-09 11:45 AM
- Action: Requires re-activation from admin panel
Please review at https://exchange.easyrechargesolution.com/admin/seller-api/requests`;

  const result = formatModernEmailHtml({
    subject: 'Alert: Operator Auto-Disabled',
    text: alertText,
    fromName: 'Exchange Alert Bot',
  });

  assert.match(result.formattedHtml, /SYSTEM SECURITY ALERT/i);
  assert.match(result.formattedHtml, /Airtel LAPU API/);
  assert.match(result.formattedHtml, /Continuous 10 transactions failed/);
  assert.match(result.formattedHtml, /<table role="presentation"/i);
  assert.match(result.formattedHtml, /Open Portal &rarr;/i);
  assert.match(result.formattedHtml, /https:\/\/exchange\.easyrechargesolution\.com\/admin\/seller-api\/requests/);
});

test('Modern Email Formatter: login notification formats IP address and device details', () => {
  const loginNotice = `Dear Prince,
A new login to your account was detected from an unrecognized IP address.
- IP Address: 49.43.112.128
- Date & Time: 2/10/2026, 4:23:05 pm
- Device: Chrome on Windows 10
If this was you, no action is needed.`;

  const result = formatModernEmailHtml({
    subject: 'Security Notice: New Login from 49.43.112.128',
    text: loginNotice,
    fromName: 'Exchange Security',
  });

  assert.match(result.formattedHtml, /ACCOUNT SECURITY NOTICE/i);
  assert.match(result.formattedHtml, /49\.43\.112\.128/);
  assert.match(result.formattedHtml, /Chrome on Windows 10/);
});
