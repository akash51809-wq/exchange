'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderUserNavigation } = require('../config/user-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

const CIRCLES = [
  'All', 'Andhra Pradesh', 'Assam', 'Bihar & Jharkhand', 'Chennai', 'Delhi', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jammu Kashmir', 'Karnataka', 'Kerala', 'Kolkata',
  'Maharashtra & Goa', 'Mumbai', 'North East', 'Orissa', 'Punjab', 'Rajasthan',
  'Tamil Nadu', 'UP East', 'UP West', 'West Bengal',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = function createUserSalesMarginPage({ db, formatMinorUnits, getSession, readJson, checkSameOrigin, httpError, sendJson, allowRate }) {
  function requireUser(request) {
    return getSession(request).then((user) => {
      if (!user) throw httpError('Login required.', 401);
      if (user.role !== 'user') throw httpError('This feature is for users only.', 403);
      return user;
    });
  }

  function parseMoney(value, label, { optional = false, allowZero = true } = {}) {
    const text = String(value ?? '').trim();
    if (!text && optional) return null;
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw httpError(`Please enter a valid amount for ${label}.`, 400);
    const [whole, fraction = ''] = text.split('.');
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if ((!allowZero && minor < 1n) || minor > 10_000_000_000n) throw httpError(`${label} must be between 0 and 100,000,000.`, 400);
    return minor.toString();
  }

  function parseInput(input) {
    const operatorId = String(input.operatorId || '').trim();
    const circleName = String(input.circleName || '').trim();
    const amountType = String(input.amountType || '').trim();
    const limitType = String(input.limitType || '').trim();
    const isRoffer = String(input.isRoffer || 'all').trim();
    const commission = String(input.commissionPercent ?? '').trim();
    const operatorCode = String(input.operatorCode || '').trim();
    if (!UUID.test(operatorId)) throw httpError('Please select an operator from the list.', 400);
    if (!CIRCLES.includes(circleName)) throw httpError('Please select an available circle.', 400);
    if (!['all', 'range', 'fixed'].includes(amountType)) throw httpError('Please select an amount type.', 400);
    if (!['daily', 'monthly', 'lifetime', 'unlimited'].includes(limitType)) throw httpError('Please select a limit type.', 400);
    if (!['all', 'roffer_only', 'no_roffer'].includes(isRoffer)) throw httpError('Invalid Roffer option.', 400);
    if (!/^(?:\d{1,3})(?:\.\d{1,4})?$/.test(commission) || Number(commission) > 100) throw httpError('Commission must be between 0 and 100, up to 4 decimal places.', 400);
    if (operatorCode.length > 40 || (operatorCode && !/^[A-Za-z0-9_-]+$/.test(operatorCode))) throw httpError('Operator Code may only contain letters, numbers, _, and -.', 400);
    let amountMin = null;
    let amountMax = null;
    if (amountType === 'range') {
      amountMin = parseMoney(input.amountMin, 'Minimum Amount', { allowZero: false });
      amountMax = parseMoney(input.amountMax, 'Maximum Amount', { allowZero: false });
      if (BigInt(amountMax) < BigInt(amountMin)) throw httpError('Maximum amount cannot be less than minimum amount.', 400);
    } else if (amountType === 'fixed') {
      amountMin = parseMoney(input.amountFixed, 'Fixed Amount', { allowZero: false });
      amountMax = amountMin;
    }
    return {
      operatorId, circleName, amountType, amountMin, amountMax,
      commission, requiredMinRoffer: parseMoney(input.requiredMinRoffer, 'Required Min Roffer'),
      limit: parseMoney(input.limit, 'Limit'), limitType,
      withGst: input.withGst === true, isRoffer, operatorCode: operatorCode || null,
    };
  }

  async function assertOperatorExists(operatorId) {
    const result = await db.query("SELECT id FROM operator_definitions WHERE id = $1 AND status = 'active' AND deleted_at IS NULL", [operatorId]);
    if (!result.rowCount) throw httpError('This operator is not available in the admin operator list.', 400);
  }

  async function sendUserSalesMarginPage(user, response, searchParams) {
    const navigation = renderUserNavigation().replace('horizontal-mainwrapper container clearfix', 'horizontal-mainwrapper container-fluid px-2 clearfix');
    const filters = {
      service: String(searchParams.get('service') || '').trim(),
      operatorId: String(searchParams.get('operatorId') || '').trim(),
      circle: String(searchParams.get('circle') || '').trim(),
      active: String(searchParams.get('active') || '').trim(),
      search: String(searchParams.get('search') || '').trim().slice(0, 80),
    };
    if (filters.active && !['on', 'off'].includes(filters.active)) filters.active = '';
    const operators = await db.query("SELECT id, operator_name, service_type, operator_code FROM operator_definitions WHERE status='active' AND deleted_at IS NULL ORDER BY service_type, operator_name");
    const services = [...new Set(operators.rows.map((row) => row.service_type))];
    const conditions = ['m.user_id = $1', 'm.deleted_at IS NULL'];
    const values = [user.id];
    const add = (value) => { values.push(value); return `$${values.length}`; };
    if (filters.service && services.includes(filters.service)) conditions.push(`o.service_type = ${add(filters.service)}`);
    if (filters.operatorId && UUID.test(filters.operatorId)) conditions.push(`m.operator_id = ${add(filters.operatorId)}`);
    if (filters.circle && CIRCLES.includes(filters.circle)) conditions.push(`m.circle_name = ${add(filters.circle)}`);
    if (filters.active) conditions.push(`m.is_active = ${add(filters.active === 'on')}`);
    if (filters.search) conditions.push(`(o.operator_name ILIKE ${add(`%${filters.search}%`)} OR m.circle_name ILIKE ${add(`%${filters.search}%`)} OR COALESCE(m.operator_code, '') ILIKE ${add(`%${filters.search}%`)})`);
    const result = await db.query(
      `SELECT m.id, m.operator_id, o.operator_name, o.service_type, o.operator_code AS admin_operator_code,
              m.circle_name, m.amount_type, m.amount_min_minor, m.amount_max_minor,
              m.commission_percent, m.required_min_roffer_minor, m.limit_minor,
              m.limit_used_minor, m.limit_type, m.with_gst, m.is_active,
              m.is_admin_approved, m.is_roffer, m.operator_code, m.created_at
       FROM seller_margin_settings m JOIN operator_definitions o ON o.id = m.operator_id
       WHERE ${conditions.join(' AND ')} ORDER BY m.created_at DESC LIMIT 500`, values,
    );
    const selected = (actual, expected) => actual === expected ? ' selected' : '';
    const serviceOptions = services.map((service) => `<option value="${escapeHtml(service)}"${selected(filters.service, service)}>${escapeHtml(service)}</option>`).join('');
    const operatorOptions = operators.rows.map((op) => `<option value="${op.id}">${escapeHtml(op.operator_name)} · ${escapeHtml(op.service_type)}</option>`).join('');
    const circleOptions = CIRCLES.map((circle) => `<option value="${escapeHtml(circle)}">${escapeHtml(circle)}</option>`).join('');
    const rows = result.rows.map((row, index) => {
      const amount = row.amount_type === 'all' ? 'All' : row.amount_type === 'fixed'
        ? `₹${formatMinorUnits(row.amount_min_minor)}`
        : `₹${formatMinorUnits(row.amount_min_minor)} – ₹${formatMinorUnits(row.amount_max_minor)}`;
      const margin = {
        id: row.id, operatorId: row.operator_id, circleName: row.circle_name, amountType: row.amount_type,
        amountMin: row.amount_min_minor == null ? '' : formatMinorUnits(row.amount_min_minor),
        amountMax: row.amount_max_minor == null ? '' : formatMinorUnits(row.amount_max_minor),
        commissionPercent: row.commission_percent, requiredMinRoffer: formatMinorUnits(row.required_min_roffer_minor),
        limit: formatMinorUnits(row.limit_minor), limitType: row.limit_type, withGst: row.with_gst,
        isRoffer: row.is_roffer, operatorCode: row.operator_code || '',
      };
      const approved = row.is_admin_approved ? '<span class="sm-badge approved">Approved</span>' : '<span class="sm-badge pending">Pending</span>';
      const toggle = `<label class="sm-switch" title="${row.is_active ? 'Setting On' : 'Setting Off'}"><input type="checkbox" data-active="${row.id}"${row.is_active ? ' checked' : ''}><span class="sm-slider"></span></label><small class="sm-toggle-label ${row.is_active ? 'on' : ''}">${row.is_active ? 'On' : 'Off'}</small>`;
      const encoded = escapeHtml(JSON.stringify(margin));
      return `<tr><td>${index + 1}</td><td><div class="sm-operator"><span class="sm-operator-icon">${escapeHtml(row.operator_name.slice(0, 1).toUpperCase())}</span><span><b>${escapeHtml(row.operator_name)}</b><small>${escapeHtml(row.service_type)}</small></span></div></td><td>${escapeHtml(row.circle_name)}</td><td><span class="sm-amount">${amount}</span></td><td><span class="sm-commission">${escapeHtml(row.commission_percent)}%</span></td><td>₹${formatMinorUnits(row.required_min_roffer_minor)}</td><td><b>₹${formatMinorUnits(row.limit_minor)}</b><small class="sm-subline">${escapeHtml(row.limit_type)}</small></td><td>₹${formatMinorUnits(row.limit_used_minor)}</td><td><span class="sm-gst ${row.with_gst ? 'yes' : 'no'}">${row.with_gst ? 'Yes' : 'No'}</span></td><td>${toggle}</td><td>${approved}</td><td>${row.is_roffer === 'all' ? 'All' : row.is_roffer === 'roffer_only' ? 'Roffer Only' : 'No Roffer'}</td><td>${escapeHtml(row.operator_code || row.admin_operator_code)}</td><td><div class="sm-actions"><button type="button" class="sm-action edit" data-edit="${encoded}" aria-label="Edit"><i class="fa fa-pencil"></i></button><button type="button" class="sm-action delete" data-delete="${row.id}" aria-label="Delete"><i class="fa fa-trash"></i></button></div></td></tr>`;
    }).join('');
    const noOperators = operators.rowCount === 0 ? '<div class="sm-note">No operators created by admin yet. They will appear here once created.</div>' : '';
    const html = `<!DOCTYPE html><html lang="en" dir="ltr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seller Margin - Exchange</title><link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css"><link rel="stylesheet" href="/assets/css/style.css"><link rel="stylesheet" href="/assets/css/dark.css"><link rel="stylesheet" href="/assets/css/skins.css"><link rel="stylesheet" href="/assets/css/icons.css"><style>
      .sm-page{padding:10px 16px 30px}.sm-titlebar{display:flex;justify-content:space-between;align-items:center;margin:12px 0 18px}.sm-titlebar h3{font-weight:700;color:#35429a;margin:0}.sm-titlebar p{margin:5px 0 0;color:#78829a}.sm-new{border:0;border-radius:8px;background:linear-gradient(120deg,#5865c7,#3948a9);color:white;padding:10px 19px;font-weight:700;box-shadow:0 5px 14px #5865c73b}.sm-new:hover{color:#fff;transform:translateY(-1px)}.sm-card{border:1px solid #e2e7f2;border-radius:11px;box-shadow:0 5px 18px #25366c0c;margin-bottom:18px;overflow:hidden}.sm-card-head{background:linear-gradient(100deg,#35479d,#4d68c6);color:#fff;padding:12px 17px;font-weight:700;display:flex;justify-content:space-between}.sm-card-body{padding:16px}.sm-filters{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:12px;align-items:end}.sm-filters label,.sm-form label{font-size:13px;font-weight:700;color:#424e6a;margin-bottom:5px}.sm-filters .form-control,.sm-form .form-control{border-radius:7px;border-color:#d9dfeb;height:39px}.sm-filter-actions{display:flex;gap:8px}.sm-filter-actions .btn{height:39px}.sm-summary{display:flex;gap:9px;align-items:center;color:#65708a;font-size:13px;margin:0 0 11px}.sm-dot{height:8px;width:8px;border-radius:50%;background:#20b99a;display:inline-block}.sm-table-wrap{overflow:auto}.sm-table{min-width:1430px;margin:0;border:1px solid #e5e8f0}.sm-table thead th{background:#343f8e;color:#fff;border:1px solid #4655a4;padding:11px 9px;white-space:nowrap;font-size:12px;vertical-align:middle}.sm-table tbody td{padding:9px;vertical-align:middle;border-color:#e4e8ef;font-size:13px}.sm-table tbody tr:nth-child(even){background:#f5f7fc}.sm-table tbody tr:hover{background:#edf2ff}.sm-operator{display:flex;align-items:center;gap:8px;min-width:125px}.sm-operator-icon{height:31px;width:31px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:white;font-weight:800;background:linear-gradient(135deg,#20b9b2,#5165cb)}.sm-operator small,.sm-subline{display:block;color:#7e879c;font-size:11px;margin-top:2px}.sm-amount{color:#3e4da8;font-weight:700}.sm-commission{display:inline-block;background:#e8f8f2;color:#118461;padding:4px 8px;border-radius:16px;font-weight:700;white-space:nowrap}.sm-gst{padding:4px 9px;border-radius:15px;font-size:11px;font-weight:700}.sm-gst.yes{background:#e8f8f2;color:#118461}.sm-gst.no{background:#f0f1f5;color:#7c8496}.sm-badge{display:inline-block;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:700;white-space:nowrap}.sm-badge.approved{background:#e2f7ed;color:#138557}.sm-badge.pending{background:#fff2d5;color:#ad7300}.sm-switch{position:relative;width:43px;height:23px;display:inline-block;vertical-align:middle;margin:0}.sm-switch input{opacity:0;width:0;height:0}.sm-slider{position:absolute;inset:0;cursor:pointer;background:#cbd1dd;border-radius:20px;transition:.2s}.sm-slider:before{content:"";position:absolute;height:17px;width:17px;left:3px;top:3px;background:white;border-radius:50%;transition:.2s;box-shadow:0 1px 4px #0002}.sm-switch input:checked+.sm-slider{background:#19b88a}.sm-switch input:checked+.sm-slider:before{transform:translateX(20px)}.sm-toggle-label{margin-left:5px;color:#828ba0;font-size:11px}.sm-toggle-label.on{color:#118461;font-weight:700}.sm-actions{display:flex;gap:6px}.sm-action{width:31px;height:31px;border:0;border-radius:7px;color:#fff}.sm-action.edit{background:#18a8bd}.sm-action.delete{background:#e34d66}.sm-note{background:#eef5ff;color:#3b5799;border-left:4px solid #4e67c6;padding:12px 15px;border-radius:5px;margin:0 0 15px}.sm-empty{text-align:center;padding:40px 10px;color:#7a849b}.sm-empty i{font-size:28px;color:#8995cf;margin-bottom:8px}.sm-modal{position:fixed;z-index:1050;inset:0;display:none;align-items:center;justify-content:center;padding:20px}.sm-modal.open{display:flex}.sm-backdrop{position:absolute;inset:0;background:#11172bb3}.sm-dialog{position:relative;background:white;width:min(590px,100%);max-height:92vh;overflow:auto;border-radius:12px;box-shadow:0 18px 65px #10163255}.sm-modal-head{padding:16px 20px;border-bottom:1px solid #e8ebf2;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(110deg,#fff,#f1f4ff)}.sm-modal-head h4{margin:0;color:#34469d;font-weight:700}.sm-close{border:0;background:none;font-size:24px;color:#76809a}.sm-form{padding:18px 20px}.sm-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}.sm-form .wide{grid-column:1/-1}.sm-form .form-group{margin:0}.sm-hint{font-size:11px;color:#8a92a4;margin-top:4px}.sm-amount-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sm-gst-control{min-height:39px;display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid #dfe4ee;border-radius:7px;color:#41518f;font-weight:700}.sm-modal-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:17px}.sm-save{background:#16a8b9;color:#fff;border:0;border-radius:7px;padding:9px 21px;font-weight:700}.sm-cancel{border-radius:7px}.sm-error{display:none;color:#c63751;background:#fff0f2;padding:8px 10px;border-radius:6px;margin-bottom:10px}.sm-error.show{display:block}@media(max-width:1050px){.sm-filters{grid-template-columns:repeat(3,minmax(130px,1fr))}}@media(max-width:650px){.sm-page{padding:8px}.sm-filters{grid-template-columns:1fr 1fr}.sm-titlebar{align-items:flex-start;gap:10px}.sm-titlebar h3{font-size:19px}.sm-form-grid{grid-template-columns:1fr}.sm-form .wide{grid-column:auto}.sm-amount-fields{grid-template-columns:1fr}}
      </style></head><body><div class="page"><div class="page-main">${navigation}<main class="main-content"><div class="container-fluid px-1"><div class="sm-page"><div class="sm-titlebar"><div><h3>Seller Margin</h3><p>Manage your operator margin rules and active status.</p></div><button class="sm-new" id="newMargin" type="button"><i class="fa fa-plus"></i> New Margin</button></div>${noOperators}<section class="sm-card"><div class="sm-card-head"><span><i class="fa fa-link"></i> Seller Margin Filters</span><span>${result.rowCount} records</span></div><div class="sm-card-body"><form method="get" action="/seller/sales-margin" class="sm-filters"><div><label for="filterService">Service Type</label><select class="form-control" name="service" id="filterService"><option value="">All Services</option>${serviceOptions}</select></div><div><label for="filterOperator">Operator</label><select class="form-control" name="operatorId" id="filterOperator"><option value="">All Operators</option>${operators.rows.map((op) => `<option value="${op.id}"${selected(filters.operatorId, op.id)}>${escapeHtml(op.operator_name)}</option>`).join('')}</select></div><div><label for="filterCircle">Circle</label><select class="form-control" name="circle" id="filterCircle"><option value="">All Circles</option>${CIRCLES.map((circle) => `<option value="${escapeHtml(circle)}"${selected(filters.circle, circle)}>${escapeHtml(circle)}</option>`).join('')}</select></div><div><label for="filterActive">Status</label><select class="form-control" name="active" id="filterActive"><option value="">All</option><option value="on"${selected(filters.active, 'on')}>On</option><option value="off"${selected(filters.active, 'off')}>Off</option></select></div><div><label for="filterSearch">Search</label><div class="input-group"><input class="form-control" id="filterSearch" name="search" value="${escapeHtml(filters.search)}" placeholder="Operator, circle, code"><div class="input-group-append"><button class="btn btn-primary" type="submit"><i class="fa fa-search"></i></button></div></div></div><div class="sm-filter-actions"><button class="btn btn-primary" type="submit">Apply</button><a class="btn btn-outline-secondary" href="/seller/sales-margin">Reset</a></div></form></div></section><section class="sm-card"><div class="sm-card-head"><span><i class="fa fa-table"></i> Margin Configuration</span><span class="badge badge-light">${result.rowCount} shown</span></div><div class="sm-card-body"><div class="sm-summary"><span class="sm-dot"></span> On settings are enabled for this user account. New settings are saved Off until enabled.</div><div class="sm-table-wrap"><table class="table sm-table"><thead><tr><th>#</th><th>Operator</th><th>Circle Name</th><th>Amount</th><th>Comm (%)</th><th>Required Min Roffer</th><th>Limit</th><th>Limit Used</th><th>With GST</th><th>Is Active</th><th>Admin Approval</th><th>Is Roffer</th><th>OpCode</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="14"><div class="sm-empty"><i class="fa fa-sliders"></i><br>No margin settings found. Click "New Margin" to add your first setting.</div></td></tr>'}</tbody></table></div></div></section></div></div></main></div></div>
      <div class="sm-modal" id="marginModal" aria-hidden="true"><div class="sm-backdrop" data-close></div><section class="sm-dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><header class="sm-modal-head"><h4 id="modalTitle">Seller Margin Insert</h4><button class="sm-close" type="button" data-close aria-label="Close">&times;</button></header><form class="sm-form" id="marginForm"><div class="sm-error" id="formError" role="alert"></div><div class="sm-form-grid"><div class="form-group wide"><label for="apiName">API</label><select id="apiName" class="form-control" disabled><option>Exchange API</option></select><small class="sm-hint">Local system selection; external API not connected yet.</small></div><div class="form-group"><label for="operatorId">Choose Operator *</label><select id="operatorId" class="form-control" required><option value="">:: Select Operator ::</option>${operatorOptions}</select></div><div class="form-group"><label for="circleName">Circle *</label><select id="circleName" class="form-control" required><option value="">:: Select Circle ::</option>${circleOptions}</select></div><div class="form-group wide"><label for="amountType">Amount Type</label><select id="amountType" class="form-control"><option value="all">All Amounts</option><option value="range">Amount Range</option><option value="fixed">Fixed Amount</option></select></div><div class="form-group wide" id="rangeFields" hidden><div class="sm-amount-fields"><div><label for="amountMin">Minimum Amount *</label><input id="amountMin" type="number" min="0.01" step="0.01" class="form-control" placeholder="0.00"></div><div><label for="amountMax">Maximum Amount *</label><input id="amountMax" type="number" min="0.01" step="0.01" class="form-control" placeholder="0.00"></div></div></div><div class="form-group wide" id="fixedFields" hidden><label for="amountFixed">Fixed Amount *</label><input id="amountFixed" type="number" min="0.01" step="0.01" class="form-control" placeholder="0.00"></div><div class="form-group"><label for="commissionPercent">Commission % *</label><input id="commissionPercent" type="number" min="0" max="100" step="0.0001" value="0" class="form-control" required></div><div class="form-group"><label for="operatorCode">OpCode (optional)</label><input id="operatorCode" maxlength="40" class="form-control" placeholder="Enter OpCode"></div><div class="form-group"><label for="requiredMinRoffer">Required Min Roffer (₹)</label><input id="requiredMinRoffer" type="number" min="0" step="0.01" value="0" class="form-control"></div><div class="form-group"><label for="limit">Limit (₹)</label><input id="limit" type="number" min="0" step="0.01" value="0" class="form-control"></div><div class="form-group"><label for="limitType">Limit Type</label><select id="limitType" class="form-control"><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="lifetime">Lifetime</option><option value="unlimited">Unlimited</option></select></div><div class="form-group"><label for="isRoffer">Roffer Setting</label><select id="isRoffer" class="form-control"><option value="all">All</option><option value="roffer_only">Roffer Only</option><option value="no_roffer">No Roffer</option></select></div><div class="form-group"><label>GST setting</label><label class="sm-gst-control"><input id="withGst" type="checkbox"> With GST</label></div></div><div class="sm-modal-footer"><button type="button" class="btn btn-outline-secondary sm-cancel" data-close>Cancel</button><button type="submit" class="sm-save" id="saveMargin">Save Margin</button></div></form></section></div>
      <script src="/assets/js/jquery-3.5.1.min.js"></script><script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script><script src="/assets/plugins/horizontal-menu/horizontal.js"></script><script src="/auth-client.js"></script><script>
      (()=>{const modal=document.getElementById('marginModal'),form=document.getElementById('marginForm'),error=document.getElementById('formError'),title=document.getElementById('modalTitle'),save=document.getElementById('saveMargin'),amountType=document.getElementById('amountType');let editingId='';const el=id=>document.getElementById(id);function showModal(data){form.reset();error.classList.remove('show');error.textContent='';editingId=data?.id||'';title.textContent=editingId?'Edit Seller Margin':'Seller Margin Insert';save.textContent=editingId?'Save Changes':'Save Margin';el('amountType').value=data?.amountType||'all';el('operatorId').value=data?.operatorId||'';el('circleName').value=data?.circleName||'';el('commissionPercent').value=data?.commissionPercent??'0';el('operatorCode').value=data?.operatorCode||'';el('requiredMinRoffer').value=data?.requiredMinRoffer||'0';el('limit').value=data?.limit||'0';el('limitType').value=data?.limitType||'daily';el('withGst').checked=Boolean(data?.withGst);el('isRoffer').value=data?.isRoffer||'all';el('amountMin').value=data?.amountMin||'';el('amountMax').value=data?.amountMax||'';el('amountFixed').value=data?.amountMin||'';updateAmountFields();modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.style.overflow=''}function updateAmountFields(){el('rangeFields').hidden=amountType.value!=='range';el('fixedFields').hidden=amountType.value!=='fixed'}document.getElementById('newMargin').addEventListener('click',()=>showModal());document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',closeModal));document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal()});amountType.addEventListener('change',updateAmountFields);document.querySelectorAll('[data-edit]').forEach(button=>button.addEventListener('click',()=>{try{showModal(JSON.parse(button.dataset.edit))}catch{window.alert('Unable to open this record.')}}));form.addEventListener('submit',async event=>{event.preventDefault();error.classList.remove('show');const amount=amountType.value;const payload={operatorId:el('operatorId').value,circleName:el('circleName').value,amountType:amount,amountMin:el('amountMin').value,amountMax:el('amountMax').value,amountFixed:el('amountFixed').value,commissionPercent:el('commissionPercent').value,operatorCode:el('operatorCode').value,requiredMinRoffer:el('requiredMinRoffer').value,limit:el('limit').value,limitType:el('limitType').value,withGst:el('withGst').checked,isRoffer:el('isRoffer').value};save.disabled=true;try{const response=await fetch(editingId?'/api/seller/margins/'+editingId+'/update':'/api/seller/margins',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Failed to save setting.');window.location.reload()}catch(err){error.textContent=err.message;error.classList.add('show')}finally{save.disabled=false}});document.querySelectorAll('[data-active]').forEach(toggle=>toggle.addEventListener('change',async()=>{const prior=!toggle.checked;toggle.disabled=true;try{const response=await fetch('/api/seller/margins/'+toggle.dataset.active+'/active',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({active:toggle.checked})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Failed to update status.');window.location.reload()}catch(err){toggle.checked=prior;window.alert(err.message)}finally{toggle.disabled=false}}));document.querySelectorAll('[data-delete]').forEach(button=>button.addEventListener('click',async()=>{if(!window.confirm('Are you sure you want to delete this margin setting?'))return;button.disabled=true;try{const response=await fetch('/api/seller/margins/'+button.dataset.delete+'/delete',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:'{}'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Failed to delete setting.');window.location.reload()}catch(err){window.alert(err.message);button.disabled=false}}))})();
      </script></body></html>`;
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
    });
    response.end(await addPanelChrome(html, { role: 'user', userId: user.id, db }));
  }

  async function createSellerMargin(request, response) {
    checkSameOrigin(request);
    const user = await requireUser(request);
    if (!allowRate(`seller-margin:${user.id}`, 30, 60 * 60_000)) throw httpError('Too many requests; please try again later.', 429);
    const data = parseInput(await readJson(request));
    await assertOperatorExists(data.operatorId);
    const saved = await db.query(
      `INSERT INTO seller_margin_settings
       (user_id, operator_id, api_name, circle_name, amount_type, amount_min_minor, amount_max_minor,
        commission_percent, required_min_roffer_minor, limit_minor, limit_type, with_gst, is_roffer, operator_code)
       VALUES ($1,$2,'Exchange API',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [user.id, data.operatorId, data.circleName, data.amountType, data.amountMin, data.amountMax, data.commission,
        data.requiredMinRoffer, data.limit, data.limitType, data.withGst, data.isRoffer, data.operatorCode],
    );
    sendJson(response, 201, { id: saved.rows[0].id, message: 'Margin setting saved. Turn On to activate.' });
  }

  async function updateSellerMargin(request, response, marginId) {
    checkSameOrigin(request);
    const user = await requireUser(request);
    if (!UUID.test(marginId)) throw httpError('Invalid margin ID.', 400);
    if (!allowRate(`seller-margin:${user.id}`, 30, 60 * 60_000)) throw httpError('Too many requests; please try again later.', 429);
    const data = parseInput(await readJson(request));
    await assertOperatorExists(data.operatorId);
    const result = await db.query(
      `UPDATE seller_margin_settings SET operator_id=$3, circle_name=$4, amount_type=$5,
         amount_min_minor=$6, amount_max_minor=$7, commission_percent=$8, required_min_roffer_minor=$9,
         limit_minor=$10, limit_type=$11, with_gst=$12, is_roffer=$13, operator_code=$14, updated_at=now()
       WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id`,
      [marginId, user.id, data.operatorId, data.circleName, data.amountType, data.amountMin, data.amountMax,
        data.commission, data.requiredMinRoffer, data.limit, data.limitType, data.withGst, data.isRoffer, data.operatorCode],
    );
    if (!result.rowCount) throw httpError('Margin setting not found.', 404);
    sendJson(response, 200, { message: 'Margin setting updated.' });
  }

  async function setSellerMarginActive(request, response, marginId) {
    checkSameOrigin(request);
    const user = await requireUser(request);
    if (!UUID.test(marginId)) throw httpError('Invalid margin ID.', 400);
    const input = await readJson(request);
    if (typeof input.active !== 'boolean') throw httpError('Please select On or Off status.', 400);
    if (!allowRate(`seller-margin:${user.id}`, 60, 60 * 60_000)) throw httpError('Too many requests; please try again later.', 429);
    const result = await db.query(
      `UPDATE seller_margin_settings SET is_active=$3, updated_at=now()
       WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id, is_active`, [marginId, user.id, input.active],
    );
    if (!result.rowCount) throw httpError('Margin setting not found.', 404);
    sendJson(response, 200, { active: result.rows[0].is_active, message: input.active ? 'Margin setting turned On.' : 'Margin setting turned Off.' });
  }

  async function deleteSellerMargin(request, response, marginId) {
    checkSameOrigin(request);
    const user = await requireUser(request);
    if (!UUID.test(marginId)) throw httpError('Invalid margin ID.', 400);
    await readJson(request);
    if (!allowRate(`seller-margin:${user.id}`, 30, 60 * 60_000)) throw httpError('Too many requests; please try again later.', 429);
    const result = await db.query(
      `UPDATE seller_margin_settings SET deleted_at=now(), is_active=false, updated_at=now()
       WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id`, [marginId, user.id],
    );
    if (!result.rowCount) throw httpError('Margin setting not found.', 404);
    sendJson(response, 200, { message: 'Margin setting deleted.' });
  }

  return { sendUserSalesMarginPage, createSellerMargin, updateSellerMargin, setSellerMarginActive, deleteSellerMargin };
};
