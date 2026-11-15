'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');
const {
  sendWhatsappNotification,
  sendEmailNotification,
  sendSmsNotification,
  logSentMessage,
} = require('../lib/notification-service');

module.exports = function createAdminUserSendMsgLogPage({
  db,
  decryptServiceConfig,
  sendJson,
  httpError,
}) {
  const PAGE_SIZE = 25;

  function getTodayString() {
    const d = new Date();
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  function formatDateTime(isoString) {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return String(isoString).replace('T', ' ').slice(0, 19);
    }
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return '';
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour}h ago`;
      const diffDays = Math.floor(diffHour / 24);
      if (diffDays === 1) return 'Yesterday';
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  }

  function sanitizeCsv(val) {
    const str = String(val ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  }

  /**
   * Helper to format Delivery Status badge and provider details
   */
  function renderDeliveryStatus(row) {
    const status = String(row.status || '').toLowerCase();
    const plat = String(row.platform || '').toLowerCase();
    const payload = row.response_payload && typeof row.response_payload === 'object' ? row.response_payload : {};

    const isFailed = status === 'failed' || payload.sent === false;
    if (isFailed) {
      let reason = 'Failed / Undelivered';
      let detail = '';
      const respStr = typeof payload.response === 'string' ? payload.response : JSON.stringify(payload.response || '');
      if (respStr.includes('WhatsApp is not connected') || respStr.includes('not connected') || payload.status === 503) {
        reason = 'Not Connected';
        detail = 'WhatsApp not connected';
      } else if (payload.error) {
        reason = String(payload.error).slice(0, 26);
        detail = String(payload.error);
      } else if (payload.status) {
        reason = `HTTP ${payload.status}`;
        detail = `Gateway error ${payload.status}`;
      }
      return `
        <div class="text-center">
          <span class="badge badge-danger px-2 py-1 font-weight-bold" style="background-color:#dc3545;color:#fff;">
            <i class="fa fa-times-circle mr-1"></i>Failed
          </span>
          <small class="d-block text-danger font-weight-semibold mt-1 text-truncate" style="font-size:11px;max-width:125px;margin:0 auto;" title="${escapeHtml(detail || reason)}">${escapeHtml(reason)}</small>
        </div>
      `;
    }

    // Delivered status
    if (plat === 'whatsapp') {
      const isDirect = payload.provider === 'baileys' || (payload.response && String(payload.response).includes('Direct'));
      const provLabel = isDirect ? 'Direct WhatsApp' : 'WhatsApp Gateway';
      return `
        <div class="text-center">
          <span class="badge badge-success px-2 py-1 font-weight-bold" style="background-color:#28a745;color:#fff;">
            <i class="fa fa-check-circle mr-1"></i>Delivered
          </span>
          <small class="d-block text-muted mt-1" style="font-size:11px;">${escapeHtml(provLabel)}</small>
        </div>
      `;
    }

    if (plat === 'email') {
      const isScript = payload.provider === 'google_script' || (payload.response && String(payload.response).includes('script'));
      const provLabel = isScript ? 'Google Apps Script' : 'SMTP Server';
      return `
        <div class="text-center">
          <span class="badge badge-primary px-2 py-1 font-weight-bold" style="background-color:#007bff;color:#fff;">
            <i class="fa fa-check-circle mr-1"></i>Delivered
          </span>
          <small class="d-block text-muted mt-1" style="font-size:11px;">${escapeHtml(provLabel)}</small>
        </div>
      `;
    }

    if (plat === 'sms') {
      return `
        <div class="text-center">
          <span class="badge badge-info px-2 py-1 font-weight-bold" style="background-color:#17a2b8;color:#fff;">
            <i class="fa fa-check-circle mr-1"></i>Delivered
          </span>
          <small class="d-block text-muted mt-1" style="font-size:11px;">SMS Gateway</small>
        </div>
      `;
    }

    return `
      <div class="text-center">
        <span class="badge badge-success px-2 py-1 font-weight-bold">
          <i class="fa fa-check mr-1"></i>Delivered
        </span>
      </div>
    `;
  }

  /**
   * Ensure user_sent_msg_logs table exists and cleanup any legacy failed status
   */
  async function ensureTable() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_sent_msg_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          user_name TEXT,
          recipient TEXT NOT NULL,
          msg_type TEXT NOT NULL,
          platform TEXT NOT NULL,
          content TEXT NOT NULL,
          subject TEXT,
          status TEXT DEFAULT 'sent',
          response_payload JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_user_sent_msg_logs_created_at ON user_sent_msg_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_user_sent_msg_logs_user_id ON user_sent_msg_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_sent_msg_logs_platform ON user_sent_msg_logs(platform);
        CREATE INDEX IF NOT EXISTS idx_user_sent_msg_logs_msg_type ON user_sent_msg_logs(msg_type);
        CREATE INDEX IF NOT EXISTS idx_user_sent_msg_logs_status ON user_sent_msg_logs(status);
      `);

      // Clean up legacy records: mark any records where gateway returned 503 or not connected as failed
      await db.query(`
        UPDATE user_sent_msg_logs
        SET status = 'failed'
        WHERE status != 'failed'
          AND (
            (response_payload->>'sent')::text = 'false'
            OR (response_payload->>'status')::text IN ('503', '500', '400', '401', '403')
            OR (response_payload->>'response')::text ILIKE '%not connected%'
            OR (response_payload->>'response')::text ILIKE '%WhatsApp is not connected%'
            OR (response_payload->>'error') IS NOT NULL
          )
      `);
    } catch (err) {
      console.warn('[User Sent Msg Log Table Init Warning]:', err.message);
    }
  }

  ensureTable().catch(() => {});

  /**
   * Build WHERE filter conditions and values
   */
  function buildFilters(searchParams) {
    const today = getTodayString();
    const from = String(searchParams.get('from') || searchParams.get('fromDate') || today).trim();
    const to = String(searchParams.get('to') || searchParams.get('toDate') || today).trim();
    const user = String(searchParams.get('user') || searchParams.get('userId') || '').trim();
    const msgType = String(searchParams.get('msgType') || searchParams.get('type') || '').trim();
    const platform = String(searchParams.get('platform') || '').trim().toLowerCase();
    const status = String(searchParams.get('status') || '').trim().toLowerCase();
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const download = String(searchParams.get('download') || searchParams.get('export') || '').trim().toLowerCase();

    // Validate date format YYYY-MM-DD
    const validDate = (val) => /^\d{4}-\d{2}-\d{2}$/.test(val);
    const validFrom = validDate(from) ? from : today;
    const validTo = validDate(to) ? to : today;

    const conditions = [];
    const values = [];
    const addParam = (val) => { values.push(val); return `$${values.length}`; };

    if (validFrom) {
      conditions.push(`l.created_at >= (${addParam(validFrom)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (validTo) {
      conditions.push(`l.created_at < (((${addParam(validTo)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }

    if (status && status !== 'all') {
      if (status === 'delivered' || status === 'sent') {
        conditions.push("l.status = 'sent'");
      } else if (status === 'failed') {
        conditions.push("l.status = 'failed'");
      }
    }

    if (user) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user);
      if (isUuid) {
        conditions.push(`(l.user_id = ${addParam(user)} OR l.user_name ILIKE ${addParam(`%${user}%`)})`);
      } else {
        const uLike = addParam(`%${user}%`);
        conditions.push(`(l.user_name ILIKE ${uLike} OR l.recipient ILIKE ${uLike} OR COALESCE(u.username, '') ILIKE ${uLike})`);
      }
    }

    if (msgType && msgType !== 'all') {
      conditions.push(`l.msg_type ILIKE ${addParam(msgType)}`);
    }

    if (platform && platform !== 'all') {
      conditions.push(`l.platform = ${addParam(platform)}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return {
      from: validFrom,
      to: validTo,
      user,
      msgType,
      platform: platform || 'all',
      status: status || 'all',
      page,
      download,
      whereClause,
      values,
    };
  }

  /**
   * Stream Excel / CSV export
   */
  async function streamCsv(filters, response) {
    const query = `
      SELECT l.id, l.user_id, l.user_name, l.recipient, l.msg_type,
             l.platform, l.content, l.subject, l.status, l.response_payload, l.created_at,
             u.username, u.email AS user_email
      FROM user_sent_msg_logs l
      LEFT JOIN users u ON u.id = l.user_id
      ${filters.whereClause}
      ORDER BY l.created_at DESC
      LIMIT 10000
    `;

    const res = await db.query(query, filters.values).catch(() => ({ rows: [] }));
    const fileName = `user_send_msg_log_${filters.from}_to_${filters.to}.csv`;

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    });

    const BOM = '\uFEFF';
    const headers = [
      'Sl No',
      'Log ID',
      'Date Time (IST)',
      'User Name',
      'Username',
      'Recipient (Mobile / Email)',
      'Platform',
      'Message Type',
      'Subject',
      'Message Content',
      'Status',
      'Delivery Status',
    ].join(',') + '\r\n';

    const rows = [BOM, headers];
    res.rows.forEach((row, idx) => {
      const isFailed = row.status === 'failed' || (row.response_payload && row.response_payload.sent === false);
      const deliveryStatus = isFailed ? 'Failed' : 'Delivered';
      const line = [
        idx + 1,
        sanitizeCsv(row.id),
        sanitizeCsv(formatDateTime(row.created_at)),
        sanitizeCsv(row.user_name || '-'),
        sanitizeCsv(row.username || '-'),
        sanitizeCsv(row.recipient),
        sanitizeCsv(String(row.platform || '').toUpperCase()),
        sanitizeCsv(row.msg_type),
        sanitizeCsv(row.subject || '-'),
        sanitizeCsv(row.content),
        sanitizeCsv(row.status || 'sent'),
        sanitizeCsv(deliveryStatus),
      ].join(',') + '\r\n';
      rows.push(line);
    });

    response.end(rows.join(''));
  }

  /**
   * Main Page Request Handler
   */
  async function sendAdminUserSendMsgLogPage(admin, response, searchParams) {
    const filters = buildFilters(searchParams);

    if (filters.download === 'csv' || filters.download === 'excel') {
      return streamCsv(filters, response);
    }

    // 1. Fetch distinct users, message types and counts for filter dropdowns & KPI cards
    const [usersRes, msgTypesRes, countsRes] = await Promise.all([
      db.query(`
        SELECT id, username, name, email
        FROM users
        WHERE deleted_at IS NULL
        ORDER BY name ASC, username ASC
        LIMIT 500
      `).catch(() => ({ rows: [] })),
      db.query(`
        SELECT DISTINCT msg_type
        FROM user_sent_msg_logs
        WHERE msg_type IS NOT NULL AND msg_type != ''
        ORDER BY msg_type ASC
      `).catch(() => ({ rows: [] })),
      // Real platform and status counters for the current date range
      db.query(`
        SELECT
          COUNT(*) AS total_count,
          COUNT(*) FILTER (WHERE l.status = 'sent') AS delivered_count,
          COUNT(*) FILTER (WHERE l.status = 'failed') AS failed_count,
          COUNT(*) FILTER (WHERE l.platform = 'sms') AS sms_count,
          COUNT(*) FILTER (WHERE l.platform = 'whatsapp') AS whatsapp_count,
          COUNT(*) FILTER (WHERE l.platform = 'email') AS email_count
        FROM user_sent_msg_logs l
        WHERE l.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata')
          AND l.created_at < ((($2::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')
      `, [filters.from, filters.to]).catch(() => ({ rows: [{ total_count: 0, delivered_count: 0, failed_count: 0, sms_count: 0, whatsapp_count: 0, email_count: 0 }] })),
    ]);

    const usersList = usersRes.rows || [];
    const existingMsgTypes = (msgTypesRes.rows || []).map((r) => r.msg_type);
    const summary = countsRes.rows[0] || { total_count: 0, delivered_count: 0, failed_count: 0, sms_count: 0, whatsapp_count: 0, email_count: 0 };

    // Standard fallback notification types if table has few or none yet
    const standardMsgTypes = [
      'Login OTP',
      'Signup OTP',
      'Welcome Message After Signup',
      'Reminder Message for KYC',
      'Forgot Password',
      'Change Password',
      'KYC Approved',
      'KYC Rejected',
      'Balance Alert',
      'Low Balance Alert',
      'Seller API Auto Disabled',
    ];
    const allMsgTypes = Array.from(new Set([...existingMsgTypes, ...standardMsgTypes])).sort();

    // 2. Fetch Total Count for Pagination
    const countSql = `
      SELECT COUNT(*) AS total
      FROM user_sent_msg_logs l
      LEFT JOIN users u ON u.id = l.user_id
      ${filters.whereClause}
    `;
    const countRes = await db.query(countSql, filters.values).catch(() => ({ rows: [{ total: 0 }] }));
    const totalRecords = parseInt(countRes.rows[0]?.total || '0', 10);
    const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
    const currentPage = Math.min(filters.page, totalPages);
    const offset = (currentPage - 1) * PAGE_SIZE;

    // 3. Fetch Paginated Records (strictly 25 rows)
    const listValues = [...filters.values];
    listValues.push(PAGE_SIZE);
    const limitParam = `$${listValues.length}`;
    listValues.push(offset);
    const offsetParam = `$${listValues.length}`;

    const listSql = `
      SELECT l.id, l.user_id, l.user_name, l.recipient, l.msg_type,
             l.platform, l.content, l.subject, l.status, l.response_payload, l.created_at,
             u.username, u.email AS user_email
      FROM user_sent_msg_logs l
      LEFT JOIN users u ON u.id = l.user_id
      ${filters.whereClause}
      ORDER BY l.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;
    const listRes = await db.query(listSql, listValues).catch((err) => {
      console.error('[User Sent Msg Log Query Error]:', err.message);
      return { rows: [] };
    });
    const logs = listRes.rows || [];

    // Helper to generate pagination URLs preserving other query params
    function makePageUrl(pageNum) {
      const p = new URLSearchParams();
      if (filters.from) p.set('from', filters.from);
      if (filters.to) p.set('to', filters.to);
      if (filters.user) p.set('user', filters.user);
      if (filters.msgType && filters.msgType !== 'all') p.set('msgType', filters.msgType);
      if (filters.platform && filters.platform !== 'all') p.set('platform', filters.platform);
      if (filters.status && filters.status !== 'all') p.set('status', filters.status);
      p.set('page', String(pageNum));
      return `?${p.toString()}`;
    }

    // Helper for platform filter pill links
    function makePlatformUrl(plat) {
      const p = new URLSearchParams();
      if (filters.from) p.set('from', filters.from);
      if (filters.to) p.set('to', filters.to);
      if (filters.user) p.set('user', filters.user);
      if (filters.msgType && filters.msgType !== 'all') p.set('msgType', filters.msgType);
      if (plat && plat !== 'all') p.set('platform', plat);
      if (filters.status && filters.status !== 'all') p.set('status', filters.status);
      p.set('page', '1');
      return `?${p.toString()}`;
    }

    // Helper for status filter pill links
    function makeStatusUrl(stat) {
      const p = new URLSearchParams();
      if (filters.from) p.set('from', filters.from);
      if (filters.to) p.set('to', filters.to);
      if (filters.user) p.set('user', filters.user);
      if (filters.msgType && filters.msgType !== 'all') p.set('msgType', filters.msgType);
      if (filters.platform && filters.platform !== 'all') p.set('platform', filters.platform);
      if (stat && stat !== 'all') p.set('status', stat);
      p.set('page', '1');
      return `?${p.toString()}`;
    }

    // Export URL
    const exportParams = new URLSearchParams();
    if (filters.from) exportParams.set('from', filters.from);
    if (filters.to) exportParams.set('to', filters.to);
    if (filters.user) exportParams.set('user', filters.user);
    if (filters.msgType && filters.msgType !== 'all') exportParams.set('msgType', filters.msgType);
    if (filters.platform && filters.platform !== 'all') exportParams.set('platform', filters.platform);
    if (filters.status && filters.status !== 'all') exportParams.set('status', filters.status);
    exportParams.set('download', 'csv');
    const exportUrl = `?${exportParams.toString()}`;

    // Render Table Rows
    const startRowIdx = totalRecords === 0 ? 0 : offset + 1;
    const endRowIdx = Math.min(offset + PAGE_SIZE, totalRecords);

    const rowsHtml = logs.length === 0
      ? `<tr><td colspan="9" class="text-center py-5 text-muted"><i class="fa fa-inbox fa-3x mb-3 text-secondary d-block"></i>No sent message logs found for the selected filter criteria.</td></tr>`
      : logs.map((row, idx) => {
        const slNo = offset + idx + 1;
        const plat = String(row.platform || '').toLowerCase();
        let platBadge = '<span class="badge badge-secondary px-2 py-1"><i class="fa fa-paper-plane mr-1"></i>Other</span>';
        if (plat === 'whatsapp') {
          platBadge = '<span class="badge badge-success px-2 py-1" style="background-color:#25d366;color:#fff;"><i class="fa fa-whatsapp mr-1"></i>WhatsApp</span>';
        } else if (plat === 'sms') {
          platBadge = '<span class="badge badge-info px-2 py-1" style="background-color:#17a2b8;color:#fff;"><i class="fa fa-commenting mr-1"></i>SMS</span>';
        } else if (plat === 'email') {
          platBadge = '<span class="badge badge-primary px-2 py-1" style="background-color:#007bff;color:#fff;"><i class="fa fa-envelope mr-1"></i>Email</span>';
        }

        const isEmail = plat === 'email' || (row.recipient && row.recipient.includes('@'));
        const recipIcon = isEmail
          ? '<i class="fa fa-envelope-o text-primary mr-1"></i>'
          : '<i class="fa fa-mobile text-success mr-1" style="font-size:16px;"></i>';

        const userNameDisplay = escapeHtml(row.user_name || row.username || 'User');
        const userHandle = row.username ? `<small class="text-muted d-block font-italic">@${escapeHtml(row.username)}</small>` : '';

        const fullContent = escapeHtml(row.content || '');
        const isLong = (row.content || '').length > 90;
        const shortContent = isLong ? escapeHtml((row.content || '').slice(0, 90) + '...') : fullContent;

        const dateFormatted = formatDateTime(row.created_at);
        const relTime = formatRelativeTime(row.created_at);

        const deliveryStatusHtml = renderDeliveryStatus(row);
        const isFailed = String(row.status || '').toLowerCase() === 'failed' || (row.response_payload && row.response_payload.sent === false);
        const statusReason = isFailed
          ? (row.response_payload?.error || (typeof row.response_payload?.response === 'string' && row.response_payload?.response.includes('not connected') ? 'WhatsApp is not connected' : 'Failed to deliver'))
          : (row.response_payload?.provider || 'Delivered successfully');

        return `
          <tr>
            <td class="text-center font-weight-bold align-middle">${slNo}</td>
            <td class="align-middle">
              <div class="d-flex align-items-center">
                <div class="avatar-sm rounded-circle text-white d-inline-flex align-items-center justify-content-center mr-2" style="width:32px;height:32px;background:linear-gradient(135deg,#667eea,#764ba2);font-weight:700;font-size:12px;">
                  ${userNameDisplay.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div class="font-weight-semibold text-dark">${userNameDisplay}</div>
                  ${userHandle}
                </div>
              </div>
            </td>
            <td class="align-middle">
              <span class="text-nowrap font-weight-500">${recipIcon}${escapeHtml(row.recipient)}</span>
            </td>
            <td class="text-center align-middle">
              ${platBadge}
            </td>
            <td class="align-middle">
              <span class="badge badge-light border text-dark font-weight-bold px-2 py-1" style="font-size:12px;">
                ${escapeHtml(row.msg_type || 'General')}
              </span>
              ${row.subject ? `<small class="d-block text-muted mt-1" title="Email Subject">Sub: ${escapeHtml(row.subject)}</small>` : ''}
            </td>
            <td class="align-middle" style="max-width:300px;">
              <div class="msg-content-preview font-monospace" style="font-size:12.5px;color:#333;word-break:break-word;white-space:pre-wrap;">${shortContent}</div>
              ${isLong ? `
                <button type="button" class="btn btn-link btn-sm p-0 mt-1 text-primary view-msg-btn"
                  data-id="${escapeHtml(row.id)}"
                  data-user="${userNameDisplay}"
                  data-recip="${escapeHtml(row.recipient)}"
                  data-type="${escapeHtml(row.msg_type || 'Message')}"
                  data-plat="${escapeHtml(plat.toUpperCase())}"
                  data-date="${escapeHtml(dateFormatted)}"
                  data-status="${escapeHtml(isFailed ? 'Failed' : 'Delivered')}"
                  data-reason="${escapeHtml(statusReason)}"
                  data-msg="${escapeHtml(row.content || '')}">
                  <i class="fa fa-eye"></i> View Full Message
                </button>
              ` : ''}
            </td>
            <td class="align-middle text-center" style="width:130px;">
              ${deliveryStatusHtml}
            </td>
            <td class="align-middle text-nowrap">
              <div class="text-dark font-weight-500" style="font-size:12.5px;">${dateFormatted}</div>
              ${relTime ? `<small class="text-muted d-block">${relTime}</small>` : ''}
            </td>
            <td class="text-center align-middle">
              <button type="button" class="btn btn-sm btn-outline-primary resend-msg-btn py-1 px-2 font-weight-bold text-nowrap"
                style="font-size:12px;border-radius:4px;"
                data-id="${escapeHtml(row.id)}"
                data-recip="${escapeHtml(row.recipient)}"
                data-plat="${escapeHtml(plat)}"
                data-user="${userNameDisplay}"
                data-type="${escapeHtml(row.msg_type || 'Message')}"
                title="Resend this message">
                <i class="fa fa-repeat mr-1"></i> Resend
              </button>
            </td>
          </tr>
        `;
      }).join('');

    // Pagination Component
    let paginationHtml = '';
    if (totalPages > 1) {
      let pageButtons = '';
      const startP = Math.max(1, currentPage - 2);
      const endP = Math.min(totalPages, currentPage + 2);

      if (startP > 1) {
        pageButtons += `<li class="page-item"><a class="page-link" href="${makePageUrl(1)}">1</a></li>`;
        if (startP > 2) {
          pageButtons += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
      }

      for (let p = startP; p <= endP; p++) {
        const activeClass = p === currentPage ? ' active' : '';
        pageButtons += `<li class="page-item${activeClass}"><a class="page-link" href="${makePageUrl(p)}">${p}</a></li>`;
      }

      if (endP < totalPages) {
        if (endP < totalPages - 1) {
          pageButtons += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        pageButtons += `<li class="page-item"><a class="page-link" href="${makePageUrl(totalPages)}">${totalPages}</a></li>`;
      }

      paginationHtml = `
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-center mt-3 pt-3 border-top">
          <div class="text-muted font-weight-500 mb-2 mb-md-0" style="font-size:13px;">
            Showing <strong>${startRowIdx}</strong> to <strong>${endRowIdx}</strong> of <strong>${totalRecords}</strong> entries (25 per page)
          </div>
          <nav aria-label="Page navigation">
            <ul class="pagination pagination-sm m-0">
              <li class="page-item ${currentPage <= 1 ? 'disabled' : ''}">
                <a class="page-link" href="${makePageUrl(Math.max(1, currentPage - 1))}" tabindex="-1">
                  <i class="fa fa-angle-left mr-1"></i>Previous
                </a>
              </li>
              ${pageButtons}
              <li class="page-item ${currentPage >= totalPages ? 'disabled' : ''}">
                <a class="page-link" href="${makePageUrl(Math.min(totalPages, currentPage + 1))}">
                  Next<i class="fa fa-angle-right ml-1"></i>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      `;
    } else {
      paginationHtml = `
        <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top text-muted" style="font-size:13px;">
          <div>Showing <strong>${startRowIdx}</strong> to <strong>${endRowIdx}</strong> of <strong>${totalRecords}</strong> entries</div>
          <div>Page 1 of 1</div>
        </div>
      `;
    }

    // HTML Output
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <title>User Send Msg Log - Admin Panel</title>
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.min.css">
  <link rel="stylesheet" href="/assets/plugins/fontawesome-free/css/all.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
  <style>
    body { background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #333; }
    .card { border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); margin-bottom: 22px; }
    .card-header { background-color: #fff; border-bottom: 1px solid #edf2f7; padding: 14px 20px; font-weight: 700; border-top-left-radius: 10px; border-top-right-radius: 10px; }
    .stat-card { border-radius: 10px; border: 1px solid #e2e8f0; padding: 14px 16px; background: #fff; display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,0,0,0.05); }
    .stat-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
    .stat-val { font-size: 20px; font-weight: 800; line-height: 1.2; margin-top: 4px; }
    .stat-lbl { font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #718096; }
    .table thead th { background-color: #2d3748; color: #fff; font-size: 12.5px; font-weight: 600; border-color: #374151; vertical-align: middle; padding: 11px 12px; }
    .table-striped tbody tr:nth-of-type(odd) { background-color: #fcfdfe; }
    .table-hover tbody tr:hover { background-color: #f1f5f9; }
    .filter-label { font-size: 12.5px; font-weight: 700; color: #4a5568; margin-bottom: 5px; }
    .form-control, .custom-select { height: 38px; border-radius: 6px; font-size: 13.5px; border: 1px solid #cbd5e1; }
    .form-control:focus, .custom-select:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.2); }
    .nav-pills .nav-link { font-weight: 600; font-size: 13px; color: #4b5563; border-radius: 6px; padding: 7px 16px; }
    .nav-pills .nav-link.active { background-color: #4f46e5; color: #fff; }
    .pagination .page-item.active .page-link { background-color: #4f46e5; border-color: #4f46e5; }
    .modal-content { border-radius: 10px; border: none; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    <!-- Header / Navigation will be dynamically handled by addPanelChrome -->
    <div class="sticky"><div class="horizontal-main hor-menu clearfix"><div class="horizontal-mainwrapper container-fluid px-2 clearfix"><nav class="horizontalMenu clearfix"><ul class="horizontalMenu-list"><li><a href="/admin/">Dashboard</a></li></ul></nav></div></div></div>

    <main class="main-content py-4">
      <div class="container-fluid px-4">
        <!-- Page Title -->
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3">
          <div>
            <h3 class="font-weight-bold text-dark m-0"><i class="fa fa-history text-primary mr-2"></i>User Send Msg Log</h3>
            <p class="text-muted mt-1 mb-0" style="font-size:13.5px;">Logs of all notifications dispatched to users via SMS, WhatsApp, and Email with real-time delivery status.</p>
          </div>
          <div class="mt-2 mt-md-0">
            <a href="${exportUrl}" class="btn btn-success btn-sm font-weight-bold shadow-sm">
              <i class="fa fa-file-excel-o mr-1"></i> Download Excel / CSV
            </a>
            <button type="button" class="btn btn-outline-secondary btn-sm ml-2 font-weight-bold" onclick="location.reload();">
              <i class="fa fa-refresh mr-1"></i> Refresh
            </button>
          </div>
        </div>

        <!-- Summary KPI Counters for selected date range (Total, Delivered, Failed, WhatsApp, SMS, Email) -->
        <div class="row">
          <div class="col-6 col-md-4 col-lg-2 mb-3">
            <div class="stat-card">
              <div>
                <div class="stat-lbl">Total Dispatched</div>
                <div class="stat-val text-dark">${Number(summary.total_count || 0).toLocaleString('en-IN')}</div>
              </div>
              <div class="stat-icon" style="background:#eef2ff;color:#4f46e5;">
                <i class="fa fa-paper-plane"></i>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-4 col-lg-2 mb-3">
            <div class="stat-card">
              <div>
                <div class="stat-lbl">Delivered</div>
                <div class="stat-val text-success">${Number(summary.delivered_count || (Number(summary.total_count || 0) - Number(summary.failed_count || 0))).toLocaleString('en-IN')}</div>
              </div>
              <div class="stat-icon" style="background:#dcfce7;color:#16a34a;">
                <i class="fa fa-check-circle"></i>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-4 col-lg-2 mb-3">
            <div class="stat-card">
              <div>
                <div class="stat-lbl">Failed</div>
                <div class="stat-val text-danger">${Number(summary.failed_count || 0).toLocaleString('en-IN')}</div>
              </div>
              <div class="stat-icon" style="background:#fee2e2;color:#dc2626;">
                <i class="fa fa-times-circle"></i>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-4 col-lg-2 mb-3">
            <div class="stat-card">
              <div>
                <div class="stat-lbl">WhatsApp</div>
                <div class="stat-val text-success">${Number(summary.whatsapp_count || 0).toLocaleString('en-IN')}</div>
              </div>
              <div class="stat-icon" style="background:#dcfce7;color:#16a34a;">
                <i class="fa fa-whatsapp"></i>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-4 col-lg-2 mb-3">
            <div class="stat-card">
              <div>
                <div class="stat-lbl">SMS</div>
                <div class="stat-val text-info">${Number(summary.sms_count || 0).toLocaleString('en-IN')}</div>
              </div>
              <div class="stat-icon" style="background:#e0f2fe;color:#0284c7;">
                <i class="fa fa-commenting"></i>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-4 col-lg-2 mb-3">
            <div class="stat-card">
              <div>
                <div class="stat-lbl">Email</div>
                <div class="stat-val text-primary">${Number(summary.email_count || 0).toLocaleString('en-IN')}</div>
              </div>
              <div class="stat-icon" style="background:#ede9fe;color:#7c3aed;">
                <i class="fa fa-envelope"></i>
              </div>
            </div>
          </div>
        </div>

        <!-- Filter Form Card -->
        <div class="card shadow-sm mb-4">
          <div class="card-header bg-white d-flex justify-content-between align-items-center">
            <span><i class="fa fa-filter text-primary mr-1"></i> Filter Message Logs</span>
            <span class="badge badge-light border text-muted">Default: Today's Data</span>
          </div>
          <div class="card-body">
            <form method="GET" action="/admin/reports/user-send-msg-log" id="filterForm">
              <div class="row">
                <div class="col-md-2 col-sm-6 mb-3">
                  <label class="filter-label" for="fromDate">From Date</label>
                  <input type="date" id="fromDate" name="from" class="form-control" value="${escapeHtml(filters.from)}">
                </div>
                <div class="col-md-2 col-sm-6 mb-3">
                  <label class="filter-label" for="toDate">To Date</label>
                  <input type="date" id="toDate" name="to" class="form-control" value="${escapeHtml(filters.to)}">
                </div>
                <div class="col-md-2 col-sm-6 mb-3">
                  <label class="filter-label" for="userSelect">User</label>
                  <select id="userSelect" name="user" class="form-control custom-select">
                    <option value="">All Users</option>
                    ${usersList.map((u) => {
                      const sel = filters.user === u.id || filters.user.toLowerCase() === (u.username || '').toLowerCase() ? ' selected' : '';
                      return `<option value="${escapeHtml(u.id)}"${sel}>${escapeHtml(u.name || u.username)} (${escapeHtml(u.username)})</option>`;
                    }).join('')}
                  </select>
                </div>
                <div class="col-md-2 col-sm-6 mb-3">
                  <label class="filter-label" for="msgTypeSelect">Msg Type</label>
                  <select id="msgTypeSelect" name="msgType" class="form-control custom-select">
                    <option value="all">All Message Types</option>
                    ${allMsgTypes.map((t) => {
                      const sel = filters.msgType.toLowerCase() === t.toLowerCase() ? ' selected' : '';
                      return `<option value="${escapeHtml(t)}"${sel}>${escapeHtml(t)}</option>`;
                    }).join('')}
                  </select>
                </div>
                <div class="col-md-2 col-sm-6 mb-3">
                  <label class="filter-label" for="platformSelect">Platform</label>
                  <select id="platformSelect" name="platform" class="form-control custom-select">
                    <option value="all"${filters.platform === 'all' ? ' selected' : ''}>All Platforms</option>
                    <option value="sms"${filters.platform === 'sms' ? ' selected' : ''}>SMS</option>
                    <option value="whatsapp"${filters.platform === 'whatsapp' ? ' selected' : ''}>WhatsApp</option>
                    <option value="email"${filters.platform === 'email' ? ' selected' : ''}>Email</option>
                  </select>
                </div>
                <div class="col-md-2 col-sm-6 mb-3">
                  <label class="filter-label" for="statusSelect">Delivery Status</label>
                  <select id="statusSelect" name="status" class="form-control custom-select">
                    <option value="all"${filters.status === 'all' ? ' selected' : ''}>All Status</option>
                    <option value="delivered"${filters.status === 'delivered' || filters.status === 'sent' ? ' selected' : ''}>Delivered / Sent</option>
                    <option value="failed"${filters.status === 'failed' ? ' selected' : ''}>Failed / Undelivered</option>
                  </select>
                </div>
              </div>
              <div class="d-flex justify-content-end align-items-center mt-1">
                <a href="/admin/reports/user-send-msg-log" class="btn btn-outline-secondary btn-sm mr-2 font-weight-bold" style="height:36px;line-height:22px;">
                  <i class="fa fa-times mr-1"></i> Reset
                </a>
                <button type="submit" class="btn btn-primary btn-sm px-4 font-weight-bold" style="height:36px;">
                  <i class="fa fa-search mr-1"></i> Filter Logs
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Platform & Delivery Status Filter Tabs -->
        <div class="d-flex flex-wrap justify-content-between align-items-center mb-3">
          <div class="d-flex flex-wrap align-items-center mb-2 mb-md-0">
            <ul class="nav nav-pills bg-white p-1 rounded border shadow-sm mr-3 mb-2 mb-md-0">
              <li class="nav-item">
                <a class="nav-link ${filters.platform === 'all' ? 'active' : ''}" href="${makePlatformUrl('all')}">
                  <i class="fa fa-list mr-1"></i> All (${Number(summary.total_count || 0).toLocaleString('en-IN')})
                </a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${filters.platform === 'whatsapp' ? 'active' : ''}" href="${makePlatformUrl('whatsapp')}">
                  <i class="fa fa-whatsapp mr-1 text-success"></i> WhatsApp (${Number(summary.whatsapp_count || 0).toLocaleString('en-IN')})
                </a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${filters.platform === 'sms' ? 'active' : ''}" href="${makePlatformUrl('sms')}">
                  <i class="fa fa-commenting mr-1 text-info"></i> SMS (${Number(summary.sms_count || 0).toLocaleString('en-IN')})
                </a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${filters.platform === 'email' ? 'active' : ''}" href="${makePlatformUrl('email')}">
                  <i class="fa fa-envelope mr-1 text-primary"></i> Email (${Number(summary.email_count || 0).toLocaleString('en-IN')})
                </a>
              </li>
            </ul>

            <ul class="nav nav-pills bg-white p-1 rounded border shadow-sm">
              <li class="nav-item">
                <a class="nav-link ${filters.status === 'all' ? 'active' : ''}" href="${makeStatusUrl('all')}">
                  All Status
                </a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${filters.status === 'delivered' || filters.status === 'sent' ? 'active' : ''}" href="${makeStatusUrl('delivered')}">
                  <i class="fa fa-check-circle mr-1 text-success"></i> Delivered
                </a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${filters.status === 'failed' ? 'active' : ''}" href="${makeStatusUrl('failed')}">
                  <i class="fa fa-times-circle mr-1 text-danger"></i> Failed
                </a>
              </li>
            </ul>
          </div>

          <div class="text-muted font-weight-500" style="font-size:13px;">
            Showing 25 rows per page
          </div>
        </div>

        <!-- Table Card -->
        <div class="card shadow-sm">
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered table-striped table-hover m-0">
                <thead>
                  <tr>
                    <th style="width:55px;" class="text-center">Sl No</th>
                    <th style="min-width:170px;">User Name</th>
                    <th style="min-width:150px;">User Number or Email</th>
                    <th style="width:105px;" class="text-center">Platform</th>
                    <th style="min-width:140px;">Msg Type</th>
                    <th style="min-width:260px;">Msg Content</th>
                    <th style="width:130px;" class="text-center">Delivery Status</th>
                    <th style="width:160px;">Date Time</th>
                    <th style="width:105px;" class="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
          <div class="card-footer bg-white">
            ${paginationHtml}
          </div>
        </div>

      </div>
    </main>
  </div>
</div>

<!-- Modal for Viewing Full Message -->
<div class="modal fade" id="msgDetailModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered" role="document">
    <div class="modal-content">
      <div class="modal-header bg-light">
        <h5 class="modal-title font-weight-bold" id="modalTitle">Message Details</h5>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body">
        <div class="row mb-2">
          <div class="col-6">
            <small class="text-muted d-block font-weight-bold">USER</small>
            <span id="modalUser" class="font-weight-600 text-dark">-</span>
          </div>
          <div class="col-6">
            <small class="text-muted d-block font-weight-bold">RECIPIENT</small>
            <span id="modalRecip" class="font-weight-600 text-dark">-</span>
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-6">
            <small class="text-muted d-block font-weight-bold">PLATFORM</small>
            <span id="modalPlat" class="badge badge-info">-</span>
          </div>
          <div class="col-6">
            <small class="text-muted d-block font-weight-bold">DELIVERY STATUS</small>
            <span id="modalStatus" class="badge badge-success">-</span>
            <small id="modalReason" class="d-block font-weight-bold mt-1" style="display:none;font-size:11.5px;"></small>
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-12">
            <small class="text-muted d-block font-weight-bold">DATE TIME</small>
            <span id="modalDate" class="text-dark font-weight-500">-</span>
          </div>
        </div>
        <div>
          <small class="text-muted d-block font-weight-bold mb-1">MESSAGE CONTENT</small>
          <div id="modalContent" class="p-3 bg-light rounded border font-monospace text-dark" style="white-space:pre-wrap;word-break:break-word;max-height:280px;overflow-y:auto;font-size:13px;">-</div>
        </div>
      </div>
      <div class="modal-footer bg-light d-flex justify-content-between align-items-center">
        <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Close</button>
        <button type="button" class="btn btn-primary btn-sm" id="modalResendBtn">
          <i class="fa fa-repeat mr-1"></i> Resend Message
        </button>
      </div>
    </div>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script>
  var currentModalLogId = null;
  var currentModalPlat = null;
  var currentModalRecip = null;

  async function executeResend(logId, plat, recip, btnElement) {
    if (!logId) return;
    var confirmMsg = 'Are you sure you want to resend this ' + (plat || '').toUpperCase() + ' message to ' + recip + '?';
    if (!confirm(confirmMsg)) return;

    var originalHtml = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Resending...';

    try {
      var res = await fetch('/api/admin/reports/user-send-msg-log/resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ logId: logId })
      });
      var data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || data.message || 'Failed to resend message');
      }

      btnElement.className = btnElement.className.replace('btn-outline-primary', '').replace('btn-primary', '') + ' btn-success';
      btnElement.innerHTML = '<i class="fa fa-check mr-1"></i> Resent!';

      var existingAlert = document.getElementById('resendAlertBox');
      if (existingAlert) existingAlert.remove();

      var alertDiv = document.createElement('div');
      alertDiv.id = 'resendAlertBox';
      alertDiv.className = 'alert alert-success alert-dismissible fade show shadow-sm mb-3';
      alertDiv.setAttribute('role', 'alert');
      alertDiv.innerHTML = '<i class="fa fa-check-circle mr-2"></i><strong>Success!</strong> ' + (data.message || 'Message resent successfully!') +
        '<button type="button" class="close" data-dismiss="alert">&times;</button>';

      var container = document.querySelector('.main-content .container-fluid');
      if (container) container.insertBefore(alertDiv, container.firstChild);

      setTimeout(function() {
        location.reload();
      }, 1200);

    } catch (err) {
      alert('Resend Error: ' + err.message);
      btnElement.innerHTML = originalHtml;
      btnElement.disabled = false;
    }
  }

  // Pure vanilla event listener for rock-solid reliability across all browsers
  document.addEventListener('click', function(e) {
    var resendBtn = e.target.closest('.resend-msg-btn');
    if (resendBtn) {
      e.preventDefault();
      var logId = resendBtn.getAttribute('data-id');
      var plat = resendBtn.getAttribute('data-plat');
      var recip = resendBtn.getAttribute('data-recip');
      executeResend(logId, plat, recip, resendBtn);
      return;
    }

    var modalResendBtn = e.target.closest('#modalResendBtn');
    if (modalResendBtn) {
      e.preventDefault();
      if (!currentModalLogId) return;
      executeResend(currentModalLogId, currentModalPlat, currentModalRecip, modalResendBtn);
      return;
    }

    var viewBtn = e.target.closest('.view-msg-btn');
    if (viewBtn) {
      e.preventDefault();
      currentModalLogId = viewBtn.getAttribute('data-id');
      currentModalPlat = viewBtn.getAttribute('data-plat');
      currentModalRecip = viewBtn.getAttribute('data-recip');
      var st = viewBtn.getAttribute('data-status') || 'Delivered';
      var reason = viewBtn.getAttribute('data-reason') || '';

      var elTitle = document.getElementById('modalTitle');
      var elUser = document.getElementById('modalUser');
      var elRecip = document.getElementById('modalRecip');
      var elPlat = document.getElementById('modalPlat');
      var elDate = document.getElementById('modalDate');
      var elContent = document.getElementById('modalContent');
      var elStatus = document.getElementById('modalStatus');
      var elReason = document.getElementById('modalReason');

      if (elTitle) elTitle.textContent = viewBtn.getAttribute('data-type') || 'Message Details';
      if (elUser) elUser.textContent = viewBtn.getAttribute('data-user') || '-';
      if (elRecip) elRecip.textContent = viewBtn.getAttribute('data-recip') || '-';
      if (elPlat) elPlat.textContent = viewBtn.getAttribute('data-plat') || '-';
      if (elDate) elDate.textContent = viewBtn.getAttribute('data-date') || '-';
      if (elContent) elContent.textContent = viewBtn.getAttribute('data-msg') || '-';

      if (elStatus) {
        if (st === 'Failed') {
          elStatus.className = 'badge badge-danger';
          elStatus.innerHTML = '<i class="fa fa-times-circle mr-1"></i>Failed';
          if (elReason) {
            if (reason) {
              elReason.textContent = reason;
              elReason.className = 'text-danger';
              elReason.style.display = 'block';
            } else {
              elReason.style.display = 'none';
            }
          }
        } else {
          elStatus.className = 'badge badge-success';
          elStatus.innerHTML = '<i class="fa fa-check-circle mr-1"></i>Delivered';
          if (elReason) {
            if (reason) {
              elReason.textContent = reason;
              elReason.className = 'text-muted';
              elReason.style.display = 'block';
            } else {
              elReason.style.display = 'none';
            }
          }
        }
      }

      if (window.$ && $.fn && $.fn.modal) {
        $('#msgDetailModal').modal('show');
      } else {
        var m = document.getElementById('msgDetailModal');
        if (m) {
          m.classList.add('show');
          m.style.display = 'block';
        }
      }
    }
  });
</script>
</body>
</html>`;

    const fullPage = await addPanelChrome(html, {
      role: 'admin',
      userId: admin.id,
      db,
      currentPath: '/admin/reports/user-send-msg-log',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(fullPage);
  }

  /**
   * POST /api/admin/reports/user-send-msg-log/resend - Resend a logged message
   */
  async function handleResendMsg(request, response, input) {
    const logId = String(input.logId || input.id || '').trim();
    if (!logId) {
      throw httpError('Message log ID is required.', 400);
    }

    const res = await db.query('SELECT * FROM user_sent_msg_logs WHERE id = $1', [logId]);
    if (res.rowCount === 0) {
      throw httpError('Message log record not found.', 404);
    }

    const row = res.rows[0];
    const platform = String(row.platform || '').toLowerCase().trim();
    const recipient = String(row.recipient || '').trim();
    const content = String(row.content || '').trim();
    const subject = row.subject || undefined;

    if (!recipient) {
      throw httpError('Recipient is missing in message log record.', 400);
    }
    if (!content) {
      throw httpError('Message content is empty in message log record.', 400);
    }

    let sendResult = null;
    let sendError = null;

    if (platform === 'whatsapp') {
      sendResult = await sendWhatsappNotification({
        db,
        decryptServiceConfig,
        toNumber: recipient,
        message: content,
      });
      if (!sendResult || !sendResult.sent) {
        sendError = sendResult?.error || 'Failed to send WhatsApp message. Please check WhatsApp connection in Service Settings.';
      }
    } else if (platform === 'email') {
      const hasHtml = content.includes('<') && content.includes('>');
      sendResult = await sendEmailNotification({
        db,
        decryptServiceConfig,
        toEmail: recipient,
        subject: subject || 'Exchange Portal Notification',
        text: hasHtml ? content.replace(/<[^>]+>/g, '').trim() : content,
        html: hasHtml ? content : undefined,
      });
      if (!sendResult || !sendResult.sent) {
        sendError = sendResult?.error || 'Failed to send Email. Please check Email service settings.';
      }
    } else if (platform === 'sms') {
      sendResult = await sendSmsNotification({
        db,
        decryptServiceConfig,
        toNumber: recipient,
        message: content,
      });
      if (!sendResult || !sendResult.sent) {
        sendError = sendResult?.error || 'Failed to send SMS. Please check SMS service settings.';
      }
    } else {
      throw httpError(`Unsupported messaging platform: ${platform}`, 400);
    }

    if (sendError) {
      // Record failed attempt in user_sent_msg_logs with genuine failed status
      try {
        await db.query(
          `INSERT INTO user_sent_msg_logs (
            user_id, user_name, recipient, msg_type, platform, content, subject, status, response_payload, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'failed', $8, now())`,
          [
            row.user_id,
            row.user_name,
            recipient,
            String(row.msg_type || 'Message').includes('(Resent)') ? row.msg_type : `${row.msg_type || 'Message'} (Resent)`,
            platform,
            content,
            subject || null,
            JSON.stringify(sendResult || { error: sendError }),
          ]
        );
      } catch (logErr) {
        console.warn('[Resend Message Failed Log Error]:', logErr.message);
      }
      throw httpError(sendError, 400);
    }

    // Log the newly resent message into user_sent_msg_logs
    try {
      await logSentMessage(db, {
        userId: row.user_id,
        userName: row.user_name,
        recipient: recipient,
        msgType: String(row.msg_type || 'Message').includes('(Resent)') ? row.msg_type : `${row.msg_type || 'Message'} (Resent)`,
        platform: platform,
        content: content,
        subject: subject,
        status: 'sent',
        responsePayload: sendResult,
      });
    } catch (logErr) {
      console.warn('[Resend Message Log Error]:', logErr.message);
    }

    sendJson(response, 200, {
      ok: true,
      message: `Message resent successfully to ${recipient} via ${platform.toUpperCase()}!`,
      platform: platform,
      recipient: recipient,
      result: sendResult,
    });
  }

  return {
    sendAdminUserSendMsgLogPage,
    handleResendMsg,
  };
};
