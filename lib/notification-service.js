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

  // 10-digit mobile number and with country code 91
  const mobile10 = cleanNumber.slice(-10);
  const mobileWithCc = cleanNumber.length === 12 && cleanNumber.startsWith('91') ? cleanNumber : `91${mobile10}`;

  // Fetch WhatsApp service settings from DB
  let config = null;
  let row = null;
  try {
    const res = await db.query("SELECT config_ciphertext, is_enabled FROM admin_service_settings WHERE service_key = 'whatsapp'");
    if (res.rowCount > 0 && res.rows[0].config_ciphertext) {
      row = res.rows[0];
      try {
        config = decryptServiceConfig(row.config_ciphertext);
        if (config && (config.apiUrl || config.gatewayUrl)) {
          // If WhatsApp config is configured, ensure it is enabled in the database
          if (!row.is_enabled) {
            db.query("UPDATE admin_service_settings SET is_enabled = true, updated_at = now() WHERE service_key = 'whatsapp'").catch((err) => {
              console.warn('[WhatsApp Notification] Failed to auto-enable whatsapp in DB:', err.message);
            });
          }
        }
      } catch (decErr) {
        console.error('[WhatsApp Notification] Config decrypt error:', decErr.message);
      }
    }
  } catch (dbErr) {
    console.error('[WhatsApp Notification] DB query error:', dbErr.message);
  }

  // Environment variable fallback if DB config is absent or lacks apiUrl
  if (!config || !(config.apiUrl || config.gatewayUrl)) {
    const envUrl = process.env.WHATSAPP_API_URL || process.env.WHATSAPP_GATEWAY_URL;
    if (envUrl) {
      config = {
        requestType: process.env.WHATSAPP_REQUEST_TYPE || 'GET',
        apiUrl: envUrl,
        postBody: process.env.WHATSAPP_POST_BODY || '',
        headers: process.env.WHATSAPP_HEADERS || '',
      };
    }
  }

  const apiUrl = String(config?.apiUrl || config?.gatewayUrl || '').trim();
  if (!apiUrl) {
    console.log(`[WhatsApp Notification] Service not configured (no API URL found in DB or ENV) for ${cleanNumber}`);
    return { sent: false, disabled: true, reason: 'WhatsApp service is not configured in Admin Settings or ENV.' };
  }

  const requestType = String(config.requestType || 'GET').trim().toUpperCase();
  const postBody = String(config.postBody || '').trim();
  const rawHeaders = String(config.headers || '').trim();

  // Substitute keywords (supporting multiple common variations)
  const finalUrl = apiUrl
    .replace(/\[MOBILE_NO\]/gi, encodeURIComponent(mobile10))
    .replace(/\[MOBILE\]/gi, encodeURIComponent(mobile10))
    .replace(/\[PHONE\]/gi, encodeURIComponent(mobile10))
    .replace(/\[MOBILE_WITH_CC\]/gi, encodeURIComponent(mobileWithCc))
    .replace(/\[MOBILE_91\]/gi, encodeURIComponent(mobileWithCc))
    .replace(/\[CONTENT\]/gi, encodeURIComponent(message))
    .replace(/\[MESSAGE\]/gi, encodeURIComponent(message))
    .replace(/\[MSG\]/gi, encodeURIComponent(message))
    .replace(/\[TEXT\]/gi, encodeURIComponent(message));

  const finalBody = postBody
    .replace(/\[MOBILE_NO\]/gi, mobile10)
    .replace(/\[MOBILE\]/gi, mobile10)
    .replace(/\[PHONE\]/gi, mobile10)
    .replace(/\[MOBILE_WITH_CC\]/gi, mobileWithCc)
    .replace(/\[MOBILE_91\]/gi, mobileWithCc)
    .replace(/\[CONTENT\]/gi, message)
    .replace(/\[MESSAGE\]/gi, message)
    .replace(/\[MSG\]/gi, message)
    .replace(/\[TEXT\]/gi, message);

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
    console.log(`[WhatsApp Notification] Sent to ${mobile10} (${requestType}), Status: ${res.status}, Response: ${text.slice(0, 150)}`);
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

  const provider = String(config.provider || '').trim();
  const googleScriptUrl = String(config.googleScriptUrl || '').trim();
  const googleScriptKey = String(config.googleScriptKey || '').trim();
  const fromName = String(config.fromName || 'Exchange Portal').trim();

  // 1) Google Apps Script Webhook (HTTPS Port 443 - Bypasses all cloud SMTP port restrictions)
  if (provider === 'google_script' || googleScriptUrl) {
    if (!googleScriptUrl || !googleScriptUrl.startsWith('https://')) {
      return { sent: false, error: 'Invalid Google Script Web App URL.' };
    }
    try {
      const res = await fetch(googleScriptUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        redirect: 'follow', // Google Apps Script returns 302 redirect
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          key: googleScriptKey,
          to: email,
          subject: subject || 'Exchange Portal Notification',
          text: text || '',
          html: html || '',
          name: fromName,
        }),
      });

      const respText = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(respText); } catch (_) {}

      if (!parsed || parsed.status !== 'success') {
        const errMsg = (parsed && (parsed.message || parsed.error)) || (respText.includes('Sorry, unable to open the file') ? 'Google Apps Script permissions error (Page not found / Unauthorized).' : respText.slice(0, 150));
        console.error(`[Google Script Email Error] Failed to send to ${email}:`, errMsg);
        return { sent: false, error: errMsg };
      }

      console.log(`[Google Script Email Notification] Sent to ${email}, Response: ${respText.slice(0, 100)}`);
      return { sent: true, provider: 'google_script' };
    } catch (err) {
      console.error(`[Google Script Email Error] Failed to send to ${email}:`, err.message);
      return { sent: false, error: err.message };
    }
  }

  // 2) Standard SMTP / Gmail SMTP
  const host = String(config.smtpHost || (provider === 'gmail' || provider === 'gmail_smtp' ? 'smtp.gmail.com' : '')).trim();
  const port = Number(config.smtpPort) || 587;
  const encryption = String(config.encryption || 'tls').trim().toLowerCase();
  const user = String(config.username || '').trim().toLowerCase();
  const pass = String(config.password || '').trim().replace(/\s+/g, '');
  const fromEmail = String(config.fromEmail || user).trim().toLowerCase();

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
