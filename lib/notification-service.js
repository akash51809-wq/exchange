'use strict';

const nodemailer = require('nodemailer');

/**
 * Send WhatsApp Message using admin service settings
 */
async function sendWhatsappNotification({ db, decryptServiceConfig, toNumber, message }) {
  const cleanNumber = String(toNumber || '').replace(/\D/g, '');
  if (!cleanNumber || cleanNumber.length < 10) {
    return { sent: false, error: 'Invalid recipient mobile number.' };
  }

  // Fetch active WhatsApp service settings
  const row = await db.query("SELECT config_ciphertext, is_enabled FROM admin_service_settings WHERE service_key = 'whatsapp'");
  if (!row.rowCount || !row.rows[0].is_enabled) {
    console.log(`[WhatsApp Notification] Service disabled or not configured for ${cleanNumber}`);
    return { sent: false, disabled: true, reason: 'WhatsApp service is disabled in Admin Settings.' };
  }

  let config;
  try {
    config = decryptServiceConfig(row.rows[0].config_ciphertext);
  } catch (err) {
    console.error('[WhatsApp Notification] Config decrypt error:', err);
    return { sent: false, error: 'Failed to decrypt WhatsApp service settings.' };
  }

  const requestType = String(config.requestType || 'GET').trim().toUpperCase();
  const apiUrl = String(config.apiUrl || '').trim();
  const postBody = String(config.postBody || '').trim();
  const rawHeaders = String(config.headers || '').trim();

  if (!apiUrl) {
    return { sent: false, error: 'WhatsApp Gateway API URL is not configured.' };
  }

  // 10-digit mobile number
  const mobile10 = cleanNumber.slice(-10);

  // Substitute keywords
  const finalUrl = apiUrl
    .replace(/\[MOBILE_NO\]/gi, encodeURIComponent(mobile10))
    .replace(/\[CONTENT\]/gi, encodeURIComponent(message));

  const finalBody = postBody
    .replace(/\[MOBILE_NO\]/gi, mobile10)
    .replace(/\[CONTENT\]/gi, message);

  // Parse headers
  const reqHeaders = {};
  if (rawHeaders) {
    const lines = rawHeaders.split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const val = line.slice(colonIdx + 1).trim();
        if (key && val) reqHeaders[key] = val;
      }
    }
  }

  const fetchOptions = {
    method: requestType,
    signal: AbortSignal.timeout(12000),
  };

  if (requestType === 'POST') {
    if (!reqHeaders['content-type']) {
      if (finalBody.trim().startsWith('{') || finalBody.trim().startsWith('[')) {
        reqHeaders['content-type'] = 'application/json';
      } else {
        reqHeaders['content-type'] = 'application/x-www-form-urlencoded';
      }
    }
    fetchOptions.body = finalBody;
  }

  if (Object.keys(reqHeaders).length > 0) {
    fetchOptions.headers = reqHeaders;
  }

  try {
    const res = await fetch(finalUrl, fetchOptions);
    const text = await res.text();
    console.log(`[WhatsApp Notification] Sent to ${mobile10}, Status: ${res.status}, Response: ${text.slice(0, 100)}`);
    return { sent: true, status: res.status, response: text.slice(0, 200) };
  } catch (err) {
    console.error(`[WhatsApp Notification Error] Failed to send to ${mobile10}:`, err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Send Email Message using admin SMTP service settings
 */
async function sendEmailNotification({ db, decryptServiceConfig, toEmail, subject, text, html }) {
  const email = String(toEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { sent: false, error: 'Invalid recipient email.' };
  }

  const row = await db.query("SELECT config_ciphertext, is_enabled FROM admin_service_settings WHERE service_key = 'email'");
  if (!row.rowCount || !row.rows[0].is_enabled) {
    return { sent: false, disabled: true, reason: 'Email service is disabled in Admin Settings.' };
  }

  let config;
  try {
    config = decryptServiceConfig(row.rows[0].config_ciphertext);
  } catch (err) {
    console.error('[Email Notification] Config decrypt error:', err);
    return { sent: false, error: 'Failed to decrypt Email service settings.' };
  }

  const host = String(config.smtpHost || (config.provider === 'gmail' ? 'smtp.gmail.com' : '')).trim();
  const port = Number(config.smtpPort) || 587;
  const encryption = String(config.encryption || 'tls').trim().toLowerCase();
  const user = String(config.username || '').trim().toLowerCase();
  const pass = String(config.password || '').trim().replace(/\s+/g, '');
  const fromEmail = String(config.fromEmail || user).trim().toLowerCase();
  const fromName = String(config.fromName || 'Exchange Portal').trim();

  if (!host || !user || !pass) {
    return { sent: false, error: 'Incomplete SMTP configuration.' };
  }

  const isGmail = host.includes('gmail.com') || user.endsWith('@gmail.com');
  const isSecure = encryption === 'ssl' || port === 465;

  const createGmailOrSmtpTransport = (targetPort, secureMode) => nodemailer.createTransport({
    host: isGmail ? 'smtp.gmail.com' : host,
    port: targetPort,
    secure: secureMode,
    family: 4, // Enforce IPv4 to avoid IPv6 hanging on cloud environments
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 8000,
    greetingTimeout: 6000,
    socketTimeout: 10000,
  });

  const mailPayload = {
    from: `"${fromName}" <${fromEmail}>`,
    to: email,
    subject: subject || 'Exchange Portal Notification',
    text: text || '',
    html: html || undefined,
  };

  try {
    let transporter = createGmailOrSmtpTransport(port, isSecure);
    let info;
    try {
      info = await transporter.sendMail(mailPayload);
    } catch (firstErr) {
      if (isGmail) {
        // Fallback: try alternate port (465 <-> 587) with IPv4
        const altPort = isSecure ? 587 : 465;
        const altTransporter = createGmailOrSmtpTransport(altPort, !isSecure);
        info = await altTransporter.sendMail(mailPayload);
      } else {
        throw firstErr;
      }
    }
    console.log(`[Email Notification] Sent to ${email}, MessageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email Notification Error] Failed to send to ${email}:`, err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = {
  sendWhatsappNotification,
  sendEmailNotification,
};
