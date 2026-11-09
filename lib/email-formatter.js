'use strict';

/**
 * Modern Responsive Email Formatter
 * Generates beautiful, card-based branded HTML emails inspired by modern design
 * with dark header emblem, key-value data tables, and Gmail OTP Copy button compatibility.
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extract OTP code from subject, text or html
 */
function extractOtpCode(text, html) {
  const combined = `${text || ''} ${html || ''}`;

  // 1. Exact match: Your One-Time Password (OTP) is 123456
  const p1 = combined.match(/(?:one-time password\s*\(otp\)\s*is|verification code\s*is|otp\s*is)\s*([0-9]{4,8})/i);
  if (p1 && p1[1]) return p1[1];

  // 2. Tag match: <div style="font-size:28px...">123456</div>
  const p2 = combined.match(/<div[^>]*font-size:\s*28px[^>]*>\s*([0-9]{4,8})\s*<\/div>/i);
  if (p2 && p2[1]) return p2[1];

  // 3. Fallback: isolated 6-digit number in short text
  const p3 = combined.match(/\b([0-9]{6})\b/);
  if (p3 && p3[1]) return p3[1];

  return null;
}

/**
 * Format any outgoing email into a sleek modern responsive card
 */
function formatModernEmailHtml({ subject, html, text, fromName, eventKey, params, websiteSettings }) {
  const brandName = (websiteSettings && websiteSettings.website_name) || fromName || 'Exchange Platform';
  const rawSubject = String(subject || 'Exchange Portal Notification').trim();
  const rawText = String(text || '').trim();
  const rawHtml = String(html || '').trim();

  // If already a complete HTML document, don't double wrap
  if (rawHtml && (rawHtml.includes('<!DOCTYPE') || rawHtml.includes('<html'))) {
    return {
      formattedHtml: rawHtml,
      plainText: rawText || rawHtml.replace(/<[^>]+>/g, '').trim(),
    };
  }

  // Detect if this is an OTP / Verification email
  const isOtp = /verification code|one-time password|\botp\b/i.test(rawSubject) ||
                /one-time password \(otp\) is|\botp is\b|verification code is/i.test(rawText || rawHtml) ||
                eventKey === 'signup_otp' || eventKey === 'login_otp' || eventKey === 'forgot_password';

  const otpCode = isOtp ? extractOtpCode(rawText, rawHtml) : null;

  if (isOtp && otpCode) {
    // Plain text MUST begin with exact phrase for Gmail OTP detection
    const plainText = `Your One-Time Password (OTP) is ${otpCode}.`;

    const formattedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(rawSubject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 32px 14px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 540px; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 24px rgba(15,23,42,0.07); border: 1px solid #e2e8f0;">
          
          <!-- Modern Dark Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #091e3a 0%, #0f2b4c 50%, #0d3b66 100%); padding: 30px 24px 24px; text-align: center;">
              <!-- Glowing Brand Emblem Badge -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 12px;">
                <tr>
                  <td style="background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.22); border-radius: 8px; padding: 8px 20px;">
                    <span style="font-size: 18px; font-weight: 800; letter-spacing: 1.5px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      &#x26A1; ${escapeHtml(brandName.toUpperCase())}
                    </span>
                  </td>
                </tr>
              </table>
              <div style="color: #93c5fd; font-size: 11px; font-weight: 700; letter-spacing: 2.2px; text-transform: uppercase;">
                SECURE LOGIN VERIFICATION
              </div>
            </td>
          </tr>

          <!-- Gradient Accent Stripe -->
          <tr>
            <td style="height: 3px; background: linear-gradient(90deg, #3b82f6 0%, #10b981 100%);"></td>
          </tr>

          <!-- Card Content Body -->
          <tr>
            <td style="padding: 32px 28px 26px;">
              <h3 style="margin: 0 0 12px; font-size: 17px; font-weight: 700; color: #0f172a;">
                Hello, ${escapeHtml(params?.name || params?.username || 'User')}
              </h3>
              <p style="margin: 0 0 16px; font-size: 14px; color: #334155; line-height: 1.6;">
                We received a verification request for your <b>${escapeHtml(brandName)}</b> account. Use the OTP below to complete your login.
              </p>

              <!-- Exact Gmail Heuristic Trigger Line -->
              <p style="margin: 0 0 18px; font-size: 15px; color: #0f172a; line-height: 1.6; font-weight: 600;">
                Your One-Time Password (OTP) is <span style="font-weight: 800; color: #2563eb;">${escapeHtml(otpCode)}</span>.
              </p>

              <!-- Mint/Emerald Dashed OTP Box -->
              <div style="background: #f0fdf4; border: 1.5px dashed #86efac; border-radius: 12px; padding: 22px 16px; text-align: center; margin: 22px 0;">
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #15803d; text-transform: uppercase; margin-bottom: 8px;">
                  YOUR ONE-TIME PASSWORD
                </div>
                <div style="font-size:28px; font-weight:bold;">
                  ${escapeHtml(otpCode)}
                </div>
                <div style="font-size: 11.5px; color: #64748b; margin-top: 8px;">
                  Valid for 10 minutes only &bull; Please do not share this OTP with anyone
                </div>
              </div>

              <!-- Security Tip Callout -->
              <div style="background: #f8fafc; border-left: 3px solid #3b82f6; border-radius: 6px; padding: 12px 14px; margin-top: 22px;">
                <p style="margin: 0; font-size: 12.5px; color: #475569; line-height: 1.5;">
                  <strong style="color: #0f172a;">Security Advisory:</strong> If you did not request this OTP, please change your password immediately or contact our support team.
                </p>
              </div>
            </td>
          </tr>

          <!-- Card Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                This is an automated security message from <b>${escapeHtml(brandName)}</b>. Please do not reply directly.
              </p>
              <p style="margin: 0; font-size: 11px; color: #cbd5e1;">
                &copy; ${new Date().getFullYear()} ${escapeHtml(brandName)}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { formattedHtml, plainText };
  }

  // --- GENERAL NOTIFICATION / ALERT EMAIL ---
  let badgeSubtitle = 'OFFICIAL NOTIFICATION';
  let headerColor = '#0d3b66';
  let accentColor = '#3b82f6';

  if (/alert|disabled|failed|error|warning/i.test(rawSubject)) {
    badgeSubtitle = 'SYSTEM SECURITY ALERT';
    headerColor = '#7f1d1d';
    accentColor = '#ef4444';
  } else if (/login|password|kyc|ip|device/i.test(rawSubject)) {
    badgeSubtitle = 'ACCOUNT SECURITY NOTICE';
    headerColor = '#0f2b4c';
    accentColor = '#0284c7';
  } else if (/wallet|payout|redeem|top-?up|payment|recharge/i.test(rawSubject)) {
    badgeSubtitle = 'TRANSACTION NOTIFICATION';
    headerColor = '#064e3b';
    accentColor = '#10b981';
  }

  // Parse lines: check for bullet points or Key: Value pairs
  const lines = (rawText || rawHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).split(/\r?\n/);
  const contentBlocks = [];
  let currentKvList = [];

  function flushKvList() {
    if (currentKvList.length > 0) {
      const rowsHtml = currentKvList.map((item, idx) => `
        <tr>
          <td style="color: #64748b; font-weight: 600; padding: 8px 10px; border-bottom: ${idx === currentKvList.length - 1 ? 'none' : '1px solid #edf2f7'}; width: 40%; font-size: 13px;">
            ${escapeHtml(item.key)}
          </td>
          <td style="color: #0f172a; font-weight: 700; padding: 8px 10px; border-bottom: ${idx === currentKvList.length - 1 ? 'none' : '1px solid #edf2f7'}; font-size: 13px; ${item.isMonospace ? 'font-family:monospace;' : ''}">
            ${escapeHtml(item.val)}
          </td>
        </tr>
      `).join('');

      contentBlocks.push(`
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin: 18px 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
            ${rowsHtml}
          </table>
        </div>
      `);
      currentKvList = [];
    }
  }

  let actionUrl = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushKvList();
      continue;
    }

    // Check for URL
    const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/i);
    if (urlMatch && !actionUrl) {
      actionUrl = urlMatch[1];
    }

    // Check for "- Key: Value" or "Key: Value" (when not a full sentence)
    const kvMatch = trimmed.match(/^[-*•]?\s*([A-Za-z0-9\s/&()-]{2,30}):\s*(.+)$/);
    if (kvMatch && !trimmed.endsWith('.') && kvMatch[2].length < 120) {
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      const isMonospace = /ip|utr|id|code|hash|transaction|account/i.test(key);
      currentKvList.push({ key, val, isMonospace });
      continue;
    }

    flushKvList();

    // Regular paragraph
    if (/^dear|^hello|^hi/i.test(trimmed)) {
      contentBlocks.push(`<h3 style="margin: 0 0 12px; font-size: 17px; font-weight: 700; color: #0f172a;">${escapeHtml(trimmed)}</h3>`);
    } else {
      contentBlocks.push(`<p style="margin: 0 0 14px; font-size: 14px; color: #334155; line-height: 1.6;">${escapeHtml(trimmed)}</p>`);
    }
  }
  flushKvList();

  // If there's an action URL, render a CTA button
  if (actionUrl) {
    contentBlocks.push(`
      <div style="text-align: center; margin: 24px 0 16px;">
        <a href="${escapeHtml(actionUrl)}" target="_blank" rel="noopener" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 12px rgba(37,99,235,0.25);">
          Open Portal &rarr;
        </a>
      </div>
    `);
  }

  const plainText = rawText || lines.join('\n');

  const formattedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(rawSubject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 32px 14px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 24px rgba(15,23,42,0.07); border: 1px solid #e2e8f0;">
          
          <!-- Modern Dark Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #091e3a 0%, ${headerColor} 100%); padding: 30px 24px 24px; text-align: center;">
              <!-- Glowing Brand Emblem Badge -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 12px;">
                <tr>
                  <td style="background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.22); border-radius: 8px; padding: 8px 20px;">
                    <span style="font-size: 18px; font-weight: 800; letter-spacing: 1.5px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      &#x26A1; ${escapeHtml(brandName.toUpperCase())}
                    </span>
                  </td>
                </tr>
              </table>
              <div style="color: #93c5fd; font-size: 11px; font-weight: 700; letter-spacing: 2.2px; text-transform: uppercase;">
                ${escapeHtml(badgeSubtitle)}
              </div>
            </td>
          </tr>

          <!-- Accent Line -->
          <tr>
            <td style="height: 3px; background: linear-gradient(90deg, ${accentColor} 0%, #10b981 100%);"></td>
          </tr>

          <!-- Card Content Body -->
          <tr>
            <td style="padding: 32px 28px 24px;">
              ${contentBlocks.join('\n')}
            </td>
          </tr>

          <!-- Card Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                This is an automated notification from <b>${escapeHtml(brandName)}</b>. Please do not reply directly.
              </p>
              <p style="margin: 0; font-size: 11px; color: #cbd5e1;">
                &copy; ${new Date().getFullYear()} ${escapeHtml(brandName)}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { formattedHtml, plainText };
}

module.exports = {
  formatModernEmailHtml,
  extractOtpCode,
  escapeHtml,
};
