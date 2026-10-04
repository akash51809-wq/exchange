'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminUserListPage({ db, formatMinorUnits, decryptMobile, normalizeIndianMobile, lookupMobile }) {
  async function sendAdminUserListPage(admin, response, searchParams) {
    // Keep the list usable during a rolling local restart when the app code is newer than its database.
    await db.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS users_parent_user_idx ON users (parent_user_id) WHERE parent_user_id IS NOT NULL;
    `);
    const filters = {
      search: String(searchParams.get('search') || '').trim().slice(0, 100),
      status: String(searchParams.get('status') || '').trim(),
      from: String(searchParams.get('from') || '').trim(),
      to: String(searchParams.get('to') || '').trim(),
      limit: ['10', '25', '50', '100', '500'].includes(searchParams.get('limit')) ? searchParams.get('limit') : '10',
      page: /^\d+$/.test(searchParams.get('page') || '') ? Math.max(1, Number(searchParams.get('page'))) : 1,
    };
    if (filters.status && !['active', 'blocked', 'pending'].includes(filters.status)) filters.status = '';
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
    if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to))) throw Object.assign(new Error('à¤¤à¤¾à¤°à¥€à¤– à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤'), { statusCode: 400 });
    if (filters.from && filters.to && filters.from > filters.to) throw Object.assign(new Error('From Date, To Date à¤¸à¥‡ à¤¬à¤¾à¤¦ à¤•à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¤¤à¥€à¥¤'), { statusCode: 400 });

    const where = ['u.role = \'user\'', 'u.deleted_at IS NULL'];
    const values = [];
    const add = (value) => { values.push(value); return `$${values.length}`; };
    if (filters.status) where.push(`u.status = ${add(filters.status)}`);
    if (filters.from) where.push(`u.created_at >= (${add(filters.from)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    if (filters.to) where.push(`u.created_at < (((${add(filters.to)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    if (filters.search) {
      let mobileHash = null;
      try { mobileHash = lookupMobile(normalizeIndianMobile(filters.search)); } catch { /* Search other user fields below. */ }
      if (mobileHash) {
        const searchValue = add(`%${filters.search}%`);
        const mobileValue = add(mobileHash);
        where.push(`(u.username ILIKE ${searchValue} OR u.name ILIKE ${searchValue} OR COALESCE(u.email,'') ILIKE ${searchValue} OR u.phone_lookup_hash = ${mobileValue} OR EXISTS (SELECT 1 FROM users p WHERE p.id=u.parent_user_id AND (p.username ILIKE ${searchValue} OR p.name ILIKE ${searchValue})))`);
      } else {
        const searchValue = add(`%${filters.search}%`);
        where.push(`(u.username ILIKE ${searchValue} OR u.name ILIKE ${searchValue} OR COALESCE(u.email,'') ILIKE ${searchValue} OR EXISTS (SELECT 1 FROM users p WHERE p.id=u.parent_user_id AND (p.username ILIKE ${searchValue} OR p.name ILIKE ${searchValue})))`);
      }
    }
    const countResult = await db.query(`SELECT count(*)::int AS total FROM users u WHERE ${where.join(' AND ')}`, values);
    const total = Number(countResult.rows[0]?.total || 0);
    const pageSize = Number(filters.limit);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    filters.page = Math.min(filters.page, pageCount);
    values.push(pageSize, (filters.page - 1) * pageSize);
    const result = await db.query(
      `SELECT u.id, u.username, u.name, u.email, u.phone_ciphertext, u.status, u.created_at, u.address,
              p.id AS parent_id, p.username AS parent_username, p.name AS parent_name,
              COALESCE(w.balance_minor, 0) AS balance_minor
       FROM users u LEFT JOIN wallets w ON w.user_id=u.id AND w.currency='INR'
       LEFT JOIN users p ON p.id=u.parent_user_id AND p.deleted_at IS NULL
       WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const rows = result.rows.map((user, index) => {
      let mobile = 'â€”';
      try { mobile = decryptMobile(user.phone_ciphertext) || 'â€”'; } catch { mobile = 'Unavailable'; }
      const balance = formatMinorUnits(user.balance_minor);
      const created = new Date(user.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const parentName = user.parent_name ? `${user.parent_name} (${user.parent_username})` : '';
      const details = { id: user.id, userId: user.username, name: user.name, email: user.email || '', mobile, address: user.address || '', parentUser: user.parent_username || '', parentName, status: user.status, joined: created, balance };
      const encoded = escapeHtml(JSON.stringify(details));
      return `<tr><td>${(filters.page - 1) * pageSize + index + 1}</td><td><div class="user-main"><span class="user-avatar">${escapeHtml(user.name.trim().slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(user.name)}</strong><small>ID: ${escapeHtml(user.username)}</small><small>Joined: ${escapeHtml(created)}</small></span></div></td><td>${user.parent_name ? `<strong>${escapeHtml(user.parent_name)}</strong><small class="subline">${escapeHtml(user.parent_username)}</small>` : '<span class="text-muted">Not assigned</span>'}</td><td><strong>${escapeHtml(mobile)}</strong><small class="subline">${escapeHtml(user.email || 'ईमेल दर्ज नहीं')}</small></td><td>${user.address ? escapeHtml(user.address) : '<span class="text-muted">Not provided</span>'}</td><td><span class="balance-chip" data-balance-user="${user.id}" title="Live wallet balance">₹${balance}</span></td><td><select class="form-control form-control-sm status-select" data-status-user="${user.id}" aria-label="Status for ${escapeHtml(user.username)}"><option value="active"${user.status === 'active' ? ' selected' : ''}>Active</option><option value="blocked"${user.status === 'blocked' ? ' selected' : ''}>Inactive</option><option value="pending"${user.status === 'pending' ? ' selected' : ''}>Pending</option></select></td><td><div class="user-actions"><button class="user-action edit" type="button" title="Edit" data-edit="${encoded}"><i class="fa fa-pencil"></i></button><button class="user-action password" type="button" title="Change Password" data-password="${user.id}" data-user="${escapeHtml(user.username)}"><i class="fa fa-key"></i></button><button class="user-action setting" type="button" title="Settings" data-setting="${encoded}"><i class="fa fa-cog"></i></button><button class="user-action margin" type="button" title="Margin" data-margin="${user.id}" data-user="${escapeHtml(user.username)}"><i class="fa fa-percent"></i></button><button class="user-action setup" type="button" title="Setup" data-setup="${encoded}"><i class="fa fa-sliders"></i></button><button class="user-action delete" type="button" title="Delete" data-delete="${user.id}" data-user="${escapeHtml(user.username)}"><i class="fa fa-trash"></i></button></div></td></tr>`;
    }).join('');
    const pageUrl = (page) => {
      const params = new URLSearchParams();
      for (const key of ['search', 'status', 'from', 'to', 'limit']) if (filters[key]) params.set(key, filters[key]);
      params.set('page', String(page));
      return `/admin/users/list?${params.toString()}`;
    };
    const start = total ? (filters.page - 1) * pageSize + 1 : 0;
    const end = Math.min(filters.page * pageSize, total);
    const pagination = `<div class="user-pagination"><span>Showing ${start}â€“${end} of ${total} registered users</span><div><a class="btn btn-sm btn-outline-primary ${filters.page <= 1 ? 'disabled' : ''}" href="${pageUrl(Math.max(1, filters.page - 1))}">Previous</a><span class="page-count">Page ${filters.page} of ${pageCount}</span><a class="btn btn-sm btn-outline-primary ${filters.page >= pageCount ? 'disabled' : ''}" href="${pageUrl(Math.min(pageCount, filters.page + 1))}">Next</a></div></div>`;
    const sel = (name, value) => filters[name] === value ? ' selected' : '';
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>List Users - Exchange Admin</title><link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css"><link rel="stylesheet" href="/assets/css/style.css"><link rel="stylesheet" href="/assets/css/dark.css"><link rel="stylesheet" href="/assets/css/skins.css"><link rel="stylesheet" href="/assets/css/icons.css"><style>
      .user-page{padding:14px 16px 30px}.user-page-title{display:flex;align-items:center;justify-content:space-between;margin:8px 0 17px}.user-page-title h3{color:#5969c9;font-weight:700;margin:0}.user-page-title p{color:#7e8799;margin:5px 0 0}.user-card{border:1px solid #e2e6f0;border-radius:11px;box-shadow:0 5px 18px #2333630b;margin-bottom:18px;overflow:hidden}.user-card-head{background:#5969c9;color:#fff;padding:12px 17px;font-weight:700;display:flex;align-items:center;justify-content:space-between}.user-card-body{padding:16px}.user-filters{display:grid;grid-template-columns:minmax(200px,2fr) repeat(4,minmax(130px,1fr));gap:12px;align-items:end}.user-filters label{font-weight:700;color:#46516d;font-size:13px}.user-filters .form-control{height:39px;border-radius:8px;border-color:#dce1ec}.filter-buttons{display:flex;gap:7px}.filter-buttons .btn{height:39px}.user-table-wrap{overflow:auto}.user-table{min-width:1050px;margin:0}.user-table thead th{background:#343a40;color:#fff;border-color:#454b52;white-space:nowrap;font-size:12px;padding:12px 10px}.user-table td{vertical-align:middle;border-color:#e4e7ef;font-size:13px}.user-table tbody tr:nth-child(even){background:#f6f7fb}.user-table tbody tr:hover{background:#eef2ff}.user-main{display:flex;align-items:center;gap:9px;min-width:155px}.user-avatar{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:white;font-weight:800;background:linear-gradient(135deg,#21b6b2,#5969c9)}.user-main small,.subline{display:block;color:#8790a1;font-size:11px;margin-top:3px}.balance-chip{display:inline-block;background:#e4f7ef;color:#138254;border-radius:16px;padding:6px 11px;font-weight:800;white-space:nowrap}.status-select{min-width:105px;border-radius:7px;border-color:#dce1ec}.user-actions{display:grid;grid-template-columns:repeat(3,30px);gap:5px}.user-action{width:30px;height:30px;border:0;border-radius:50%;color:#fff}.user-action.edit{background:#5969c9}.user-action.password{background:#ec4d5c}.user-action.setting{background:#19a9bd}.user-action.margin{background:#f0a23d}.user-action.setup{background:#20ae78}.user-action.delete{background:#e24656}.user-empty{text-align:center;color:#7d8799;padding:36px 10px}.user-pagination{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px 16px;color:#64708a;font-size:13px}.user-pagination>div{display:flex;align-items:center;gap:8px}.user-pagination .disabled{pointer-events:none;opacity:.45}.page-count{font-weight:700}.user-modal{position:fixed;inset:0;padding:18px;z-index:1060;display:none;align-items:center;justify-content:center}.user-modal.open{display:flex}.user-modal-backdrop{position:absolute;inset:0;background:#11172a99}.user-modal-card{position:relative;background:#fff;width:min(680px,100%);max-height:92vh;overflow:auto;border-radius:12px;box-shadow:0 18px 60px #10163255}.user-modal-head{padding:15px 19px;background:#f4f6ff;border-bottom:1px solid #e4e8f1;display:flex;justify-content:space-between;align-items:center}.user-modal-head h4{margin:0;color:#4c5db8;font-weight:700}.user-modal-body{padding:18px}.user-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.user-modal-grid .wide{grid-column:1/-1}.user-modal-body label{font-size:13px;font-weight:700;color:#44506a}.user-modal-body .form-control{border-radius:7px}.user-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.user-modal-error{display:none;color:#bd374c;background:#fff0f2;padding:8px 10px;border-radius:6px}.user-modal-error.show{display:block}.user-save{background:#5969c9;color:#fff;border:0;border-radius:7px;padding:9px 19px;font-weight:700}.margin-table{width:100%;font-size:13px}.margin-table th{background:#394a9f;color:white}.setup-grid{display:grid;grid-template-columns:150px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid #edf0f5}.setup-grid strong{color:#66708b}@media(max-width:850px){.user-filters{grid-template-columns:1fr 1fr}.user-page{padding:9px}}@media(max-width:560px){.user-modal-grid{grid-template-columns:1fr}.user-modal-grid .wide{grid-column:auto}.user-filters{grid-template-columns:1fr}}
      </style></head><body><div class="page"><div class="page-main"><div class="sticky"><div class="horizontal-main hor-menu clearfix"><div class="horizontal-mainwrapper container-fluid px-2 clearfix"><nav class="horizontalMenu clearfix"><ul class="horizontalMenu-list"><li><a href="/admin/">Dashboard</a></li><li><a href="#">User <i class="fa fa-angle-down"></i></a><ul class="sub-menu"><li><a href="/admin/users/list">List User</a></li></ul></li><li><a href="#">Payment <i class="fa fa-angle-down"></i></a><ul class="sub-menu"><li><a href="/admin/payment/fund-request">Fund Request</a></li></ul></li><li><a href="/admin/seller-api/requests">Request API Approval</a></li><li><a href="#">Settings <i class="fa fa-angle-down"></i></a><ul class="sub-menu"><li><a href="/admin/settings/create-operator">Create Operator</a></li><li><a href="/admin/settings/show-operator">Show Operator</a></li><li><a href="/admin/settings/service-settings">Service Settings</a></li></ul></li></ul></nav></div></div></div><main class="main-content"><div class="container-fluid px-2"><div class="user-page"><div class="user-page-title"><div><h3>List of Users</h3><p>Registered users and their current INR wallet balance.</p></div><span class="badge badge-primary">${total} registered</span></div><section class="user-card"><div class="user-card-head"><span><i class="fa fa-filter"></i> Filters</span><span>Balance refreshes with this page</span></div><div class="user-card-body"><form method="get" action="/admin/users/list" class="user-filters"><div><label for="userSearch">Search User</label><input id="userSearch" name="search" class="form-control" value="${escapeHtml(filters.search)}" maxlength="100" placeholder="Name, mobile number, email or user ID"></div><div><label for="userType">User Type</label><select id="userType" class="form-control" disabled><option>All Users</option></select></div><div><label for="fromDate">From Date</label><input id="fromDate" name="from" type="date" class="form-control" value="${escapeHtml(filters.from)}"></div><div><label for="toDate">To Date</label><input id="toDate" name="to" type="date" class="form-control" value="${escapeHtml(filters.to)}"></div><div><label for="userStatus">Status</label><select id="userStatus" name="status" class="form-control"><option value="">All Status</option><option value="active"${sel('status','active')}>Active</option><option value="blocked"${sel('status','blocked')}>Inactive</option><option value="pending"${sel('status','pending')}>Pending</option></select></div><div><label for="userLimit">Show Entries</label><select id="userLimit" name="limit" class="form-control"><option value="10"${sel('limit','10')}>10</option><option value="25"${sel('limit','25')}>25</option><option value="50"${sel('limit','50')}>50</option><option value="100"${sel('limit','100')}>100</option><option value="500"${sel('limit','500')}>500</option></select></div><div class="filter-buttons"><button class="btn btn-success" type="submit"><i class="fa fa-search"></i> Search</button><a class="btn btn-outline-secondary" href="/admin/users/list">Reset</a></div></form></div></section><section class="user-card"><div class="user-card-head"><span><i class="fa fa-users"></i> Registered Users</span><button class="btn btn-sm btn-light" type="button" onclick="location.reload()"><i class="fa fa-refresh"></i> Refresh Balance</button></div><div class="user-card-body"><div class="user-table-wrap"><table class="table table-bordered table-striped table-sm user-table"><thead><tr><th>ID</th><th>User Details</th><th>Parent</th><th>Contact Details</th><th>Address</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="user-empty">No registered users found.</td></tr>'}</tbody></table></div></div></section>${pagination}</div></div></main></div></div>
      <div class="user-modal" id="userModal"><div class="user-modal-backdrop" data-close></div><section class="user-modal-card" role="dialog" aria-modal="true"><header class="user-modal-head"><h4 id="modalTitle">User</h4><button type="button" class="close" data-close>&times;</button></header><div class="user-modal-body" id="modalBody"></div></section></div>
      <script src="/assets/js/jquery-3.5.1.min.js"></script><script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script><script src="/auth-client.js"></script><script src="/admin/users/list-client.js"></script></body></html>`;
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
    });
    response.end(await addPanelChrome(html, { role: 'admin' }));
  }

  return { sendAdminUserListPage };
};


