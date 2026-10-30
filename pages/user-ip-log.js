'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { getUserPanelMenu } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createUserIpLogPage({ db, sendJson, httpError }) {

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

  function buildConditions(params, userId) {
    const fromDate = String(params.get('fromDate') || '').trim();
    const toDate = String(params.get('toDate') || '').trim();
    const ipFilter = String(params.get('ip') || params.get('ipAddress') || '').trim();
    const statusFilter = String(params.get('status') || '').trim().toLowerCase();
    const deviceFilter = String(params.get('device') || '').trim();

    const conditions = ['l.user_id = $1'];
    const values = [userId];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (fromDate) {
      conditions.push(`l.login_at >= (${add(fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (toDate) {
      conditions.push(`l.login_at < (((${add(toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (ipFilter) {
      conditions.push(`l.ip_address ILIKE ${add(`%${ipFilter}%`)}`);
    }
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(`l.status = ${add(statusFilter)}`);
    }
    if (deviceFilter && deviceFilter !== 'all') {
      conditions.push(`l.device_type ILIKE ${add(deviceFilter)}`);
    }

    return {
      whereClause: `WHERE ${conditions.join(' AND ')}`,
      values,
      fromDate,
      toDate,
      ipFilter,
      statusFilter,
      deviceFilter,
    };
  }

  async function streamCsv(searchParams, user, response) {
    const filterInfo = buildConditions(searchParams, user.id);
    const query = `
      SELECT l.id, l.username, l.name, l.ip_address,
             l.device_type, l.device_name, l.os_name, l.browser_name, l.browser_version,
             l.location, l.status, l.failure_reason, l.login_at, l.logout_at,
             l.user_agent,
             s.expires_at, s.revoked_at
      FROM user_login_logs l
      LEFT JOIN user_sessions s ON s.token_hash = l.session_token_hash
      ${filterInfo.whereClause}
      ORDER BY l.login_at DESC
      LIMIT 2000
    `;

    const result = await db.query(query, filterInfo.values);
    const fileName = `my_ip_log_${filterInfo.fromDate || 'all'}_to_${filterInfo.toDate || 'all'}.csv`;

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    });

    const csvHeader = [
      'Log ID',
      'Login Date Time (IST)',
      'IP Address',
      'Location',
      'Device Type',
      'Device Name',
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
    response.end(lines.join(''));
  }

  async function sendUserIpLogPage(user, response, searchParams) {
    if (searchParams.get('export') === 'csv') {
      return streamCsv(searchParams, user, response);
    }

    const {
      whereClause,
      values,
      fromDate,
      toDate,
      ipFilter,
      statusFilter,
      deviceFilter,
    } = buildConditions(searchParams, user.id);

    const query = `
      SELECT l.id, l.user_id, l.username, l.name, l.role, l.ip_address,
             l.user_agent, l.device_type, l.device_name, l.os_name,
             l.browser_name, l.browser_version, l.location, l.status,
             l.failure_reason, l.session_token_hash, l.login_at, l.logout_at,
             s.expires_at, s.revoked_at
      FROM user_login_logs l
      LEFT JOIN user_sessions s ON s.token_hash = l.session_token_hash
      ${whereClause}
      ORDER BY l.login_at DESC
      LIMIT 200
    `;

    const result = await db.query(query, values);

    // KPI Summary
    let totalLogins = 0;
    let activeSessionsCount = 0;
    let desktopCount = 0;
    let mobileCount = 0;

    for (const row of result.rows) {
      totalLogins++;
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

    const rowsHtml = result.rows.map((row, idx) => {
      const isActive =
        !row.logout_at &&
        !row.revoked_at &&
        row.expires_at &&
        new Date(row.expires_at) > new Date();

      let sessionStatusBadge = '';
      if (isActive) {
        sessionStatusBadge = '<span class="badge badge-success px-2 py-1" style="background:#10b981;"><i class="fa fa-circle mr-1" style="font-size:7px;"></i> Active Now</span>';
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

      return `
        <tr>
          <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
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
              <strong class="text-dark small">${escapeHtml(row.location || 'India')}</strong>
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
              <i class="fa fa-search-plus mr-1"></i> View Detail
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const pageHtml = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login &amp; IP Access Log - User Portal</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f0f3f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page-container { padding: 14px 18px 40px; }
    .kpi-card { border-radius: 8px; padding: 10px 14px; color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
    .kpi-title { font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; opacity: 0.9; margin-bottom: 4px; }
    .kpi-value { font-size: 19px; font-weight: 800; line-height: 1.2; font-family: SFMono-Regular, Consolas, monospace; }
    .card-filter { border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); margin-bottom: 14px; }
    .card-filter .card-body { padding: 12px 16px; }
    .filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; align-items: end; }
    .filter-grid .form-group { margin-bottom: 0; }
    .filter-grid label { font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 3px; display: block; }
    .filter-grid .form-control { height: 32px; font-size: 12px; border-radius: 6px; }
    .table-recharge thead th { background: #1e293b; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap; padding: 8px 6px; border: none; }
    .table-recharge td { font-size: 11.5px; vertical-align: middle; white-space: nowrap; padding: 6px 6px; }
    .btn-xs { padding: 3px 7px; font-size: 11px; border-radius: 4px; line-height: 1.2; }
  </style>
</head>
<body class="app sidebar-mini">
  <div class="page">
    <div class="page-main">
      <main class="app-content content-wrapper">
        <div class="page-container">

          <div class="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h4 class="font-weight-bold text-dark mb-0">
                <i class="fa fa-shield text-primary mr-2"></i> Login &amp; IP Access Log
              </h4>
              <p class="text-muted small mb-0">Review all your account login activities, IP addresses, devices, and sessions</p>
            </div>
            <div>
              <a href="/report/ip-log?export=csv&${new URLSearchParams(searchParams).toString()}" class="btn btn-sm btn-outline-success font-weight-bold">
                <i class="fa fa-download mr-1"></i> Export CSV
              </a>
            </div>
          </div>

          <!-- Thin KPI Summary Cards -->
          <div class="row mb-3">
            <div class="col-md-3 col-sm-6 mb-2">
              <div class="kpi-card" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8);">
                <div class="kpi-title">Total Logins</div>
                <div class="kpi-value">${totalLogins}</div>
              </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-2">
              <div class="kpi-card" style="background: linear-gradient(135deg, #10b981, #047857);">
                <div class="kpi-title">Active Sessions</div>
                <div class="kpi-value">${activeSessionsCount}</div>
              </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-2">
              <div class="kpi-card" style="background: linear-gradient(135deg, #6366f1, #4338ca);">
                <div class="kpi-title">Desktop Sessions</div>
                <div class="kpi-value">${desktopCount}</div>
              </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-2">
              <div class="kpi-card" style="background: linear-gradient(135deg, #0ea5e9, #0284c7);">
                <div class="kpi-title">Mobile Sessions</div>
                <div class="kpi-value">${mobileCount}</div>
              </div>
            </div>
          </div>

          <!-- Filter Bar -->
          <div class="card card-filter">
            <div class="card-body">
              <form method="GET" action="/report/ip-log">
                <div class="filter-grid">
                  <div class="form-group">
                    <label>From Date</label>
                    <input type="date" name="fromDate" class="form-control" value="${escapeHtml(fromDate)}">
                  </div>
                  <div class="form-group">
                    <label>To Date</label>
                    <input type="date" name="toDate" class="form-control" value="${escapeHtml(toDate)}">
                  </div>
                  <div class="form-group">
                    <label>IP Address</label>
                    <input type="text" name="ip" class="form-control" value="${escapeHtml(ipFilter)}" placeholder="e.g. 192.168.1.1">
                  </div>
                  <div class="form-group">
                    <label>Device Type</label>
                    <select name="device" class="form-control">
                      <option value="all">All Devices</option>
                      <option value="Desktop" ${deviceFilter.toLowerCase() === 'desktop' ? 'selected' : ''}>Desktop</option>
                      <option value="Mobile" ${deviceFilter.toLowerCase() === 'mobile' ? 'selected' : ''}>Mobile</option>
                      <option value="Tablet" ${deviceFilter.toLowerCase() === 'tablet' ? 'selected' : ''}>Tablet</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Status</label>
                    <select name="status" class="form-control">
                      <option value="all">All Status</option>
                      <option value="success" ${statusFilter === 'success' ? 'selected' : ''}>Success</option>
                      <option value="failed" ${statusFilter === 'failed' ? 'selected' : ''}>Failed</option>
                    </select>
                  </div>
                  <div>
                    <button type="submit" class="btn btn-sm btn-primary btn-block font-weight-bold" style="height:32px;">
                      <i class="fa fa-filter mr-1"></i> Filter
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          <!-- Main Table Card -->
          <div class="card shadow-sm border-0">
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-bordered table-hover table-striped table-recharge mb-0">
                  <thead>
                    <tr>
                      <th style="width:30px;" class="text-center">#</th>
                      <th>Login Date / Time</th>
                      <th>IP Address</th>
                      <th>Location</th>
                      <th>Device &amp; OS</th>
                      <th>Browser</th>
                      <th class="text-center">Session Status</th>
                      <th class="text-center" style="width:100px;">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml || '<tr><td colspan="8" class="text-center py-4 text-muted">No login activities found for the selected criteria.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  </div>

  <!-- Detail Modal -->
  <div class="modal fade" id="modalInspectLog" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header bg-dark text-white py-2">
          <h6 class="modal-title font-weight-bold mb-0">
            <i class="fa fa-shield mr-1 text-primary"></i> Login &amp; IP Session Details
          </h6>
          <button type="button" class="close text-white" data-dismiss="modal">&times;</button>
        </div>
        <div class="modal-body p-3">
          <table class="table table-sm table-bordered mb-0" style="font-size:12px;">
            <tr><th class="bg-light" style="width:140px;">IP Address</th><td class="font-monospace font-weight-bold text-primary" id="mIp">-</td></tr>
            <tr><th class="bg-light">Location</th><td id="mLoc">-</td></tr>
            <tr><th class="bg-light">Device &amp; OS</th><td id="mDev">-</td></tr>
            <tr><th class="bg-light">Browser</th><td id="mBrow">-</td></tr>
            <tr><th class="bg-light">Login Time (IST)</th><td class="font-weight-bold" id="mLogAt">-</td></tr>
            <tr><th class="bg-light">Logout Time</th><td id="mLogOut">-</td></tr>
            <tr><th class="bg-light">Session Duration</th><td id="mDur">-</td></tr>
            <tr><th class="bg-light">Status</th><td id="mStat">-</td></tr>
            <tr><th class="bg-light">User Agent</th><td class="small font-monospace" style="word-break:break-all;" id="mUa">-</td></tr>
          </table>
        </div>
        <div class="modal-footer py-2">
          <button type="button" class="btn btn-sm btn-secondary" data-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
  <script src="/auth-client.js"></script>
  <script>
    $(document).on('click', '.btn-inspect-log', function() {
      const data = $(this).data('json');
      if (!data) return;
      $('#mIp').text(data.ipAddress || '-');
      $('#mLoc').text(data.location || '-');
      $('#mDev').text((data.deviceName || data.deviceType || '-') + ' (' + (data.osName || '-') + ')');
      $('#mBrow').text((data.browserName || '-') + (data.browserVersion ? ' v' + data.browserVersion : ''));
      $('#mLogAt').text(data.loginAt || '-');
      $('#mLogOut').text(data.logoutAt || '-');
      $('#mDur').text(data.duration || '-');
      $('#mStat').text(String(data.status || 'success').toUpperCase());
      $('#mUa').text(data.userAgent || '-');
      $('#modalInspectLog').modal('show');
    });
  </script>
</body>
</html>`;

    // Apply Panel Chrome (renders top header, user menu, wallet balances)
    const finalHtml = await addPanelChrome(pageHtml, {
      title: 'Login & IP Access Log - User Portal',
      currentPath: '/report/ip-log',
      role: user.role || 'user',
      userName: user.name || user.username,
      walletMode: 'separate',
      balanceMinor: 0,
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(finalHtml);
  }

  return {
    sendUserIpLogPage,
  };
};
