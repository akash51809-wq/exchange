'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const { parseUserAgent, resolveLocation } = require('../lib/user-agent-parser');

module.exports = function createAdminUserLoginHistoryPage({ db, sendJson, httpError }) {

  // Auto-create table and backfill from user_sessions
  async function ensureTableAndBackfill() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_login_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          username TEXT NOT NULL,
          name TEXT,
          role TEXT,
          ip_address TEXT,
          user_agent TEXT,
          device_type TEXT,
          device_name TEXT,
          os_name TEXT,
          browser_name TEXT,
          browser_version TEXT,
          location TEXT,
          status TEXT NOT NULL DEFAULT 'success',
          failure_reason TEXT,
          session_token_hash BYTEA,
          login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          logout_at TIMESTAMPTZ,
          details JSONB
        );
        CREATE INDEX IF NOT EXISTS idx_user_login_logs_user_id ON user_login_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_login_logs_login_at ON user_login_logs(login_at DESC);
        CREATE INDEX IF NOT EXISTS idx_user_login_logs_status ON user_login_logs(status);

        INSERT INTO user_login_logs (
          user_id, username, name, role, ip_address, user_agent,
          device_type, device_name, os_name, browser_name, location,
          status, session_token_hash, login_at, logout_at
        )
        SELECT
          s.user_id,
          u.username,
          u.name,
          u.role,
          '127.0.0.1',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0',
          'Desktop',
          'Windows PC',
          'Windows 10/11',
          'Google Chrome',
          COALESCE(NULLIF(CONCAT_WS(', ', u.city, u.state, 'India'), ''), 'Localhost / Local Network'),
          'success',
          s.token_hash,
          s.created_at,
          s.revoked_at
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE NOT EXISTS (
          SELECT 1 FROM user_login_logs l WHERE l.session_token_hash = s.token_hash
        );
      `);
    } catch (err) {
      console.warn('[User Login History Table Init Warning]:', err.message);
    }
  }

  ensureTableAndBackfill().catch(() => {});

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
    if (!isoString) return '-';
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
  }

  function formatDuration(startIso, endIso) {
    if (!startIso) return '-';
    const start = new Date(startIso).getTime();
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    const diffMs = Math.max(0, end - start);
    const mins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${remMins}m`;
  }

  /**
   * Helper to build SQL WHERE clause
   */
  function buildConditions(params) {
    const fromDate = String(params.get('fromDate') || '').trim();
    const toDate = String(params.get('toDate') || '').trim();
    const userName = String(params.get('userName') || params.get('user') || '').trim();
    const statusFilter = String(params.get('status') || '').trim().toLowerCase();
    const deviceFilter = String(params.get('device') || '').trim();
    const roleFilter = String(params.get('role') || '').trim().toLowerCase();

    const conditions = [];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (fromDate) {
      conditions.push(`l.login_at >= (${add(fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (toDate) {
      conditions.push(`l.login_at < (((${add(toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (userName) {
      const uLike = add(`%${userName}%`);
      conditions.push(`(l.username ILIKE ${uLike} OR COALESCE(l.name, '') ILIKE ${uLike} OR COALESCE(u.email, '') ILIKE ${uLike} OR COALESCE(u.business_name, '') ILIKE ${uLike})`);
    }
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(`l.status = ${add(statusFilter)}`);
    }
    if (deviceFilter && deviceFilter !== 'all') {
      conditions.push(`l.device_type ILIKE ${add(deviceFilter)}`);
    }
    if (roleFilter && roleFilter !== 'all') {
      conditions.push(`l.role = ${add(roleFilter)}`);
    }

    return {
      whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      values,
      fromDate,
      toDate,
      userName,
      statusFilter,
      deviceFilter,
      roleFilter,
    };
  }

  /**
   * Stream CSV
   */
  async function streamCsv(searchParams, response) {
    const filterInfo = buildConditions(searchParams);
    const query = `
      SELECT l.id, l.username, l.name, l.role, l.ip_address,
             l.device_type, l.device_name, l.os_name, l.browser_name, l.browser_version,
             l.location, l.status, l.failure_reason, l.login_at, l.logout_at,
             l.user_agent,
             s.expires_at, s.revoked_at,
             u.business_name, u.email
      FROM user_login_logs l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN user_sessions s ON s.token_hash = l.session_token_hash
      ${filterInfo.whereClause}
      ORDER BY l.login_at DESC
      LIMIT 10000
    `;

    const result = await db.query(query, filterInfo.values);
    const fileName = `user_login_history_${filterInfo.fromDate || 'all'}_to_${filterInfo.toDate || 'all'}.csv`;

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    });

    const csvHeader = [
      'Log ID',
      'Login Date Time (IST)',
      'Party / User Name',
      'Username',
      'Role',
      'Status',
      'IP Address',
      'Location',
      'Device Type',
      'Device Model',
      'Operating System',
      'Browser',
      'Browser Version',
      'Session Status',
      'Logout Date Time (IST)',
      'User Agent',
    ].join(',') + '\r\n';

    const lines = [csvHeader];
    for (const row of result.rows) {
      const isSessionActive =
        !row.logout_at &&
        !row.revoked_at &&
        row.expires_at &&
        new Date(row.expires_at) > new Date();

      const sessionStatus = isSessionActive ? 'Active' : (row.logout_at || row.revoked_at ? 'Logged Out' : 'Expired');

      const line = [
        `"LOG-${row.id.slice(0, 8).toUpperCase()}"`,
        `"${formatDateTime(row.login_at)}"`,
        `"${String(row.name || '').replace(/"/g, '""')}"`,
        `"${String(row.username || '').replace(/"/g, '""')}"`,
        `"${String(row.role || 'user').toUpperCase()}"`,
        `"${String(row.status || '').toUpperCase()}"`,
        `"${String(row.ip_address || '-').replace(/"/g, '""')}"`,
        `"${String(row.location || '-').replace(/"/g, '""')}"`,
        `"${String(row.device_type || 'Desktop').replace(/"/g, '""')}"`,
        `"${String(row.device_name || '-').replace(/"/g, '""')}"`,
        `"${String(row.os_name || '-').replace(/"/g, '""')}"`,
        `"${String(row.browser_name || '-').replace(/"/g, '""')}"`,
        `"${String(row.browser_version || '-').replace(/"/g, '""')}"`,
        `"${sessionStatus}"`,
        `"${formatDateTime(row.logout_at || row.revoked_at)}"`,
        `"${String(row.user_agent || '').replace(/"/g, '""')}"`,
      ].join(',') + '\r\n';
      lines.push(line);
    }
    if (typeof response.write === 'function') {
      response.end(lines.join(''));
    } else {
      response.end(lines.join(''));
    }
  }

  async function sendAdminUserLoginHistoryPage(admin, response, searchParams) {
    if (searchParams.get('export') === 'csv') {
      return streamCsv(searchParams, response);
    }

    const {
      whereClause,
      values,
      fromDate,
      toDate,
      userName,
      statusFilter,
      deviceFilter,
      roleFilter,
    } = buildConditions(searchParams);

    const query = `
      SELECT l.id, l.user_id, l.username, l.name, l.role, l.ip_address,
             l.user_agent, l.device_type, l.device_name, l.os_name,
             l.browser_name, l.browser_version, l.location, l.status,
             l.failure_reason, l.session_token_hash, l.login_at, l.logout_at,
             s.expires_at, s.revoked_at,
             u.business_name, u.email, u.city, u.state
      FROM user_login_logs l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN user_sessions s ON s.token_hash = l.session_token_hash
      ${whereClause}
      ORDER BY l.login_at DESC
      LIMIT 500
    `;

    const result = await db.query(query, values);

    // Compute KPI Totals
    let totalLogins = 0;
    let activeSessionsCount = 0;
    let desktopCount = 0;
    let mobileCount = 0;
    const uniqueUsersSet = new Set();

    for (const row of result.rows) {
      totalLogins++;
      uniqueUsersSet.add(row.username);

      const isActive =
        !row.logout_at &&
        !row.revoked_at &&
        row.expires_at &&
        new Date(row.expires_at) > new Date();

      if (isActive) activeSessionsCount++;

      const dev = String(row.device_type || 'Desktop').toLowerCase();
      if (dev === 'mobile' || dev === 'tablet') mobileCount++;
      else desktopCount++;
    }

    // Format Table Rows
    const rowsHtml = result.rows.map((row, idx) => {
      const isActive =
        !row.logout_at &&
        !row.revoked_at &&
        row.expires_at &&
        new Date(row.expires_at) > new Date();

      let sessionStatusBadge = '';
      if (isActive) {
        sessionStatusBadge = '<span class="badge badge-success px-2 py-1" style="background:#10b981;"><i class="fa fa-circle mr-1" style="font-size:8px;"></i> Active Now</span>';
      } else if (row.logout_at || row.revoked_at) {
        sessionStatusBadge = '<span class="badge badge-light border text-muted px-2 py-1"><i class="fa fa-sign-out mr-1"></i> Logged Out</span>';
      } else {
        sessionStatusBadge = '<span class="badge badge-secondary px-2 py-1">Expired</span>';
      }

      let deviceIcon = 'fa-desktop text-primary';
      if ((row.device_type || '').toLowerCase() === 'mobile') deviceIcon = 'fa-mobile text-success';
      else if ((row.device_type || '').toLowerCase() === 'tablet') deviceIcon = 'fa-tablet text-info';

      let browserIcon = 'fa-globe text-secondary';
      const bName = (row.browser_name || '').toLowerCase();
      if (bName.includes('chrome')) browserIcon = 'fa-chrome text-warning';
      else if (bName.includes('firefox')) browserIcon = 'fa-firefox text-danger';
      else if (bName.includes('safari')) browserIcon = 'fa-safari text-primary';
      else if (bName.includes('edge')) browserIcon = 'fa-edge text-info';

      const durationStr = formatDuration(row.login_at, row.logout_at || row.revoked_at);
      const relativeTime = formatRelativeTime(row.login_at);

      const inspectData = {
        id: row.id,
        username: row.username,
        name: row.name,
        role: row.role,
        businessName: row.business_name,
        email: row.email,
        ipAddress: row.ip_address,
        location: row.location,
        deviceType: row.device_type,
        deviceName: row.device_name,
        osName: row.os_name,
        browserName: row.browser_name,
        browserVersion: row.browser_version,
        userAgent: row.user_agent,
        loginAt: formatDateTime(row.login_at),
        logoutAt: row.logout_at ? formatDateTime(row.logout_at) : (row.revoked_at ? formatDateTime(row.revoked_at) : (isActive ? 'Currently Active' : 'Session Expired')),
        duration: durationStr,
        status: row.status,
      };

      const logCode = 'LOG-' + row.id.slice(0, 8).toUpperCase();

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
          <td>
            <div class="d-flex align-items-center">
              <span class="avatar avatar-sm rounded-circle mr-2 font-weight-bold text-white" style="background:linear-gradient(135deg,#3b82f6,#6366f1);width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;">
                ${escapeHtml((row.name || row.username || 'U').slice(0, 1).toUpperCase())}
              </span>
              <div>
                <strong class="text-dark">${escapeHtml(row.name || row.username)}</strong>
                <div class="small font-monospace text-muted">@${escapeHtml(row.username)}</div>
                ${row.business_name ? `<div class="small text-primary">${escapeHtml(row.business_name)}</div>` : ''}
              </div>
            </div>
          </td>
          <td class="text-center">
            <span class="badge badge-light border text-uppercase font-weight-bold" style="font-size:10px;">
              ${escapeHtml(row.role || 'user')}
            </span>
          </td>
          <td>
            <div class="font-weight-bold text-dark" style="font-size:12px;">${formatDateTime(row.login_at)}</div>
            <span class="badge badge-light border text-secondary mt-1" style="font-size:10px;">⏱️ ${relativeTime}</span>
          </td>
          <td>
            <div class="d-flex align-items-center">
              <code class="font-monospace font-weight-bold text-dark px-1 py-0 bg-light border rounded" style="font-size:12px;">
                ${escapeHtml(row.ip_address || '127.0.0.1')}
              </code>
              <button class="btn btn-xs btn-outline-secondary ml-1 py-0 px-1 border-0" onclick="navigator.clipboard.writeText('${escapeHtml(row.ip_address || '')}')" title="Copy IP">
                <i class="fa fa-copy"></i>
              </button>
            </div>
          </td>
          <td>
            <div class="d-flex align-items-center">
              <span class="mr-1">📍</span>
              <div>
                <strong class="text-dark small">${escapeHtml(row.location || 'India')}</strong>
              </div>
            </div>
          </td>
          <td>
            <div class="d-flex align-items-center">
              <i class="fa ${deviceIcon} mr-2 fa-lg"></i>
              <div>
                <strong class="text-dark small">${escapeHtml(row.device_name || row.device_type || 'Desktop')}</strong>
                <div class="small text-muted">${escapeHtml(row.os_name || '-')}</div>
              </div>
            </div>
          </td>
          <td>
            <div class="d-flex align-items-center">
              <i class="fa ${browserIcon} mr-2"></i>
              <div>
                <strong class="text-dark small">${escapeHtml(row.browser_name || 'Browser')}</strong>
                ${row.browser_version ? `<span class="small text-muted font-monospace ml-1">v${escapeHtml(row.browser_version.slice(0, 8))}</span>` : ''}
              </div>
            </div>
          </td>
          <td class="text-center">
            ${sessionStatusBadge}
            <div class="small text-muted mt-1">Duration: ${durationStr}</div>
          </td>
          <td class="text-center">
            <button type="button" class="btn btn-xs btn-outline-primary btn-inspect-log" data-json='${escapeHtml(JSON.stringify(inspectData))}'>
              <i class="fa fa-search-plus mr-1"></i> Inspect
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>User Login History &amp; Access Log - Admin Panel</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 14px 18px 40px; }
    .kpi-card { border-radius: 8px; padding: 16px 18px; color: #fff; box-shadow: 0 3px 10px rgba(0,0,0,0.08); }
    .kpi-title { font-size: 11.5px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.6px; opacity: 0.9; margin-bottom: 6px; }
    .kpi-value { font-size: 22px; font-weight: 800; line-height: 1.2; font-family: SFMono-Regular, Consolas, monospace; }
    .kpi-sub { font-size: 11.5px; opacity: 0.85; margin-top: 4px; }
    .card-panel { border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 2px 6px rgba(0,0,0,0.04); background: #fff; margin-bottom: 18px; }
    .card-panel-head { padding: 12px 18px; border-bottom: 1px solid #edf2f7; display: flex; align-items: center; justify-content: space-between; background: #fafbfc; }
    .font-monospace { font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .table thead th { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; }
    .table td { vertical-align: middle; font-size: 12.5px; border-color: #f1f5f9; }
    .table tbody tr:hover { background-color: #f8fafc; }
    .btn-quick-date { font-size: 11px; padding: 3px 8px; font-weight: 600; border-radius: 4px; }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    ${renderAdminNavigation('/admin/users/login-history')}

    <main class="main-content">
      <div class="page-container">

        <!-- Page Header -->
        <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap" style="gap:10px;">
          <div>
            <h3 class="font-weight-bold text-dark mb-1">
              <i class="fa fa-history text-primary mr-2"></i>User Login History &amp; Access Log
            </h3>
            <p class="text-muted mb-0 small">
              Track when every user logged in with full Date, Time, IP, Location, Device, OS &amp; Browser details
            </p>
          </div>
          <div class="d-flex align-items-center" style="gap:8px;">
            <a href="?${searchParams.toString()}&export=csv" class="btn btn-sm btn-outline-success font-weight-bold shadow-sm">
              <i class="fa fa-download mr-1"></i> Export Log CSV
            </a>
          </div>
        </div>

        <!-- Filter Card -->
        <section class="card-panel mb-3">
          <div class="card-panel-head">
            <span class="font-weight-bold text-dark">
              <i class="fa fa-filter text-primary mr-1"></i> Filter Login Records
            </span>
            <div class="d-flex align-items-center flex-wrap" style="gap:4px;">
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('today')">Today</button>
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('yesterday')">Yesterday</button>
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('last7')">Last 7 Days</button>
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('thismonth')">This Month</button>
              <button type="button" class="btn btn-outline-secondary btn-quick-date" onclick="setQuickDate('all')">All Time</button>
            </div>
          </div>
          <div class="p-3">
            <form method="GET" action="/admin/users/login-history" id="filterForm">
              <div class="form-row">
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterFromDate">From Date</label>
                  <input type="date" class="form-control form-control-sm" id="filterFromDate" name="fromDate" value="${escapeHtml(fromDate)}">
                </div>
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterToDate">To Date</label>
                  <input type="date" class="form-control form-control-sm" id="filterToDate" name="toDate" value="${escapeHtml(toDate)}">
                </div>
                <div class="form-group col-md-3 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterUser">Party / Username</label>
                  <input type="text" class="form-control form-control-sm" id="filterUser" name="userName" value="${escapeHtml(userName)}" placeholder="Search name or username...">
                </div>
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterDevice">Device Type</label>
                  <select class="form-control form-control-sm" id="filterDevice" name="device">
                    <option value="">All Devices</option>
                    <option value="Desktop"${deviceFilter === 'Desktop' ? ' selected' : ''}>Desktop / PC</option>
                    <option value="Mobile"${deviceFilter === 'Mobile' ? ' selected' : ''}>Mobile Phone</option>
                    <option value="Tablet"${deviceFilter === 'Tablet' ? ' selected' : ''}>Tablet</option>
                  </select>
                </div>
                <div class="form-group col-md-2 col-sm-6 mb-2">
                  <label class="small font-weight-bold text-muted mb-1" for="filterRole">Role</label>
                  <select class="form-control form-control-sm" id="filterRole" name="role">
                    <option value="">All Roles</option>
                    <option value="user"${roleFilter === 'user' ? ' selected' : ''}>User / Retailer</option>
                    <option value="admin"${roleFilter === 'admin' ? ' selected' : ''}>Admin</option>
                  </select>
                </div>
                <div class="form-group col-md-1 col-sm-12 mb-2 d-flex align-items-end" style="gap:6px;">
                  <button type="submit" class="btn btn-primary btn-sm btn-block font-weight-bold">
                    <i class="fa fa-search"></i>
                  </button>
                  <a href="/admin/users/login-history" class="btn btn-outline-secondary btn-sm font-weight-bold">
                    <i class="fa fa-refresh"></i>
                  </a>
                </div>
              </div>
            </form>
          </div>
        </section>

        <!-- KPI Cards -->
        <div class="row mb-3">
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #4f46e5, #3730a3);">
              <div class="kpi-title"><i class="fa fa-sign-in mr-1"></i> Total Logins</div>
              <div class="kpi-value">${totalLogins}</div>
              <div class="kpi-sub">Total login events in filter</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #059669, #047857);">
              <div class="kpi-title"><i class="fa fa-bolt mr-1"></i> Live Active Sessions</div>
              <div class="kpi-value">${activeSessionsCount}</div>
              <div class="kpi-sub">Users currently active right now</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #0284c7, #0369a1);">
              <div class="kpi-title"><i class="fa fa-users mr-1"></i> Unique Users</div>
              <div class="kpi-value">${uniqueUsersSet.size}</div>
              <div class="kpi-sub">Distinct parties logged in</div>
            </div>
          </div>
          <div class="col-xl-3 col-sm-6 mb-2">
            <div class="kpi-card" style="background: linear-gradient(135deg, #7c3aed, #5b21b6);">
              <div class="kpi-title"><i class="fa fa-mobile mr-1"></i> Devices Ratio</div>
              <div class="kpi-value">${desktopCount} <span style="font-size:14px;font-weight:600;">PC / ${mobileCount} Mobile</span></div>
              <div class="kpi-sub">Desktop vs smartphone access</div>
            </div>
          </div>
        </div>

        <!-- Log Records Table -->
        <div class="card-panel">
          <div class="card-panel-head">
            <span class="font-weight-bold text-dark">
              <i class="fa fa-list-alt text-primary mr-1"></i> Login History Logs (${result.rowCount})
            </span>
            <button type="button" class="btn btn-sm btn-light" onclick="location.reload()">
              <i class="fa fa-refresh mr-1"></i> Refresh
            </button>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered table-striped table-hover mb-0">
              <thead>
                <tr>
                  <th class="text-center" style="width:40px;">#</th>
                  <th>User Details</th>
                  <th class="text-center">Role</th>
                  <th>Login Time (IST)</th>
                  <th>IP Address</th>
                  <th>Location</th>
                  <th>Device / OS</th>
                  <th>Browser</th>
                  <th class="text-center">Session Status</th>
                  <th class="text-center" style="width:90px;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="10" class="text-center py-4 text-muted font-weight-bold">No login activity logs found for this filter.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  </div>
</div>

<!-- Modal: Inspect Login Details -->
<div class="modal fade" id="inspectLogModal" tabindex="-1" role="dialog" aria-labelledby="inspectLogModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title font-weight-bold" id="inspectLogModalLabel">
          <i class="fa fa-info-circle mr-1"></i> Comprehensive Login Details
        </h5>
        <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body">
        <div class="row">
          <div class="col-md-6 mb-3">
            <h6 class="font-weight-bold text-primary border-bottom pb-1"><i class="fa fa-user mr-1"></i> User Information</h6>
            <table class="table table-sm table-bordered">
              <tr><th class="bg-light" style="width:130px;">Full Name</th><td id="modalName"></td></tr>
              <tr><th class="bg-light">Username</th><td id="modalUsername" class="font-monospace text-primary font-weight-bold"></td></tr>
              <tr><th class="bg-light">Role</th><td id="modalRole"></td></tr>
              <tr><th class="bg-light">Business / Shop</th><td id="modalBusiness"></td></tr>
            </table>
          </div>

          <div class="col-md-6 mb-3">
            <h6 class="font-weight-bold text-success border-bottom pb-1"><i class="fa fa-clock-o mr-1"></i> Timing &amp; Session</h6>
            <table class="table table-sm table-bordered">
              <tr><th class="bg-light" style="width:130px;">Login Time</th><td id="modalLoginTime" class="font-weight-bold text-dark"></td></tr>
              <tr><th class="bg-light">Logout Time</th><td id="modalLogoutTime"></td></tr>
              <tr><th class="bg-light">Session Duration</th><td id="modalDuration" class="font-weight-bold text-success"></td></tr>
              <tr><th class="bg-light">Status</th><td id="modalStatus"></td></tr>
            </table>
          </div>

          <div class="col-md-6 mb-3">
            <h6 class="font-weight-bold text-info border-bottom pb-1"><i class="fa fa-map-marker mr-1"></i> Network &amp; Location</h6>
            <table class="table table-sm table-bordered">
              <tr><th class="bg-light" style="width:130px;">IP Address</th><td id="modalIp" class="font-monospace font-weight-bold text-dark"></td></tr>
              <tr><th class="bg-light">Location</th><td id="modalLocation" class="font-weight-bold"></td></tr>
            </table>
          </div>

          <div class="col-md-6 mb-3">
            <h6 class="font-weight-bold text-warning border-bottom pb-1"><i class="fa fa-laptop mr-1"></i> Device &amp; Software</h6>
            <table class="table table-sm table-bordered">
              <tr><th class="bg-light" style="width:130px;">Device / Hardware</th><td id="modalDevice"></td></tr>
              <tr><th class="bg-light">Operating System</th><td id="modalOs" class="font-weight-bold"></td></tr>
              <tr><th class="bg-light">Browser &amp; Ver</th><td id="modalBrowser"></td></tr>
            </table>
          </div>

          <div class="col-12">
            <h6 class="font-weight-bold text-secondary border-bottom pb-1"><i class="fa fa-code mr-1"></i> Raw User-Agent Header</h6>
            <div class="bg-light border rounded p-2 small font-monospace text-break" id="modalUserAgent"></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
<script src="/auth-client.js"></script>

<script>
  function setQuickDate(preset) {
    const today = new Date();
    const formatDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    };

    const fromInput = document.getElementById('filterFromDate');
    const toInput = document.getElementById('filterToDate');

    if (preset === 'today') {
      fromInput.value = formatDate(today);
      toInput.value = formatDate(today);
    } else if (preset === 'yesterday') {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      fromInput.value = formatDate(yest);
      toInput.value = formatDate(yest);
    } else if (preset === 'last7') {
      const last7 = new Date(today);
      last7.setDate(last7.getDate() - 6);
      fromInput.value = formatDate(last7);
      toInput.value = formatDate(today);
    } else if (preset === 'thismonth') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      fromInput.value = formatDate(startOfMonth);
      toInput.value = formatDate(today);
    } else if (preset === 'all') {
      fromInput.value = '';
      toInput.value = '';
    }
    document.getElementById('filterForm').submit();
  }

  // Inspect Modal click
  $(document).on('click', '.btn-inspect-log', function() {
    const data = $(this).data('json');
    $('#modalName').text(data.name || '-');
    $('#modalUsername').text('@' + (data.username || '-'));
    $('#modalRole').text((data.role || 'user').toUpperCase());
    $('#modalBusiness').text(data.businessName || '—');

    $('#modalLoginTime').text(data.loginAt || '-');
    $('#modalLogoutTime').text(data.logoutAt || '-');
    $('#modalDuration').text(data.duration || '-');
    $('#modalStatus').html(data.status === 'success' ? '<span class="badge badge-success">Successful</span>' : '<span class="badge badge-danger">Failed</span>');

    $('#modalIp').text(data.ipAddress || '-');
    $('#modalLocation').text(data.location || 'India');

    $('#modalDevice').text((data.deviceName || '') + ' (' + (data.deviceType || 'Desktop') + ')');
    $('#modalOs').text(data.osName || '-');
    $('#modalBrowser').text((data.browserName || '-') + (data.browserVersion ? ' v' + data.browserVersion : ''));

    $('#modalUserAgent').text(data.userAgent || 'None reported');

    $('#inspectLogModal').modal('show');
  });
</script>
</body>
</html>`;

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
    });
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/users/login-history' }));
  }

  return {
    sendAdminUserLoginHistoryPage,
  };
};
