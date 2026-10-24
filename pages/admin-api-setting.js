'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createAdminApiSettingPage({ db, httpError, sendJson }) {
  async function sendAdminApiSettingPage(admin, response) {
    let rows = [];
    try {
      const result = await db.query(
        `SELECT id, name, developer_name, service_type, description, is_active,
                required_parameters, config, created_at, updated_at
         FROM developer_api_templates
         ORDER BY created_at ASC`
      );
      rows = result.rows || [];
    } catch (err) {
      console.warn('Could not query developer_api_templates:', err.message);
    }

    const totalCount = rows.length;
    const activeCount = rows.filter((r) => r.is_active).length;

    const tableRowsHtml = rows.length === 0
      ? `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa fa-info-circle mr-1"></i> No developer APIs configured yet. Click "+ Add Developer API" above to add one.</td></tr>`
      : rows.map((row, idx) => {
        let reqParamLabels = [];
        try {
          const reqs = Array.isArray(row.required_parameters) ? row.required_parameters : JSON.parse(row.required_parameters || '[]');
          reqParamLabels = reqs.map(p => `<span class="badge badge-light border text-dark font-monospace mr-1 mb-1" title="${escapeHtml(p.label || p.key)}">${escapeHtml(p.key)}${p.required ? '<span class="text-danger">*</span>' : ''}</span>`);
        } catch (_) {}

        const conf = row.config || {};
        const hasBalance = !!conf.balance?.url;
        const hasRecharge = !!conf.recharge?.url;
        const hasStatus = !!conf.statusCheck?.url;
        const hasDispute = !!conf.dispute?.url;

        const endpointsBadges = [
          hasBalance ? '<span class="badge badge-success mr-1" title="Balance Check Configured"><i class="fa fa-check mr-1"></i>Balance</span>' : '',
          hasRecharge ? '<span class="badge badge-primary mr-1" title="Recharge API Configured"><i class="fa fa-check mr-1"></i>Recharge</span>' : '',
          hasStatus ? '<span class="badge badge-info mr-1" title="Status Check Configured"><i class="fa fa-check mr-1"></i>Status</span>' : '',
          hasDispute ? '<span class="badge badge-warning text-dark mr-1" title="Dispute API Configured"><i class="fa fa-check mr-1"></i>Dispute</span>' : '',
        ].filter(Boolean).join('');

        const statusBadge = row.is_active
          ? `<span class="badge badge-success px-2 py-1"><i class="fa fa-check-circle mr-1"></i>Active</span>`
          : `<span class="badge badge-secondary px-2 py-1"><i class="fa fa-pause mr-1"></i>Inactive</span>`;

        const rowDataJson = escapeHtml(JSON.stringify(row));

        return `
          <tr id="row-${row.id}">
            <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
            <td>
              <div class="font-weight-bold text-dark" style="font-size: 14.5px;">${escapeHtml(row.name)}</div>
              <div class="text-muted small">
                ${escapeHtml(row.developer_name || 'Vendor API')}
                ${row.service_type ? ` · <span class="badge badge-pill badge-outline-primary" style="font-size: 10px;">${escapeHtml(row.service_type)}</span>` : ''}
              </div>
              ${row.description ? `<div class="small text-muted text-truncate mt-1" style="max-width: 280px;" title="${escapeHtml(row.description)}">${escapeHtml(row.description)}</div>` : ''}
            </td>
            <td>
              <div class="d-flex flex-wrap" style="max-width: 240px;">
                ${reqParamLabels.length ? reqParamLabels.join('') : '<span class="text-muted small">None</span>'}
              </div>
            </td>
            <td>
              <div class="d-flex flex-wrap">
                ${endpointsBadges || '<span class="text-muted small">—</span>'}
              </div>
            </td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-muted small text-nowrap">
              ${new Date(row.updated_at || row.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </td>
            <td class="text-center text-nowrap">
              <button type="button" class="btn btn-sm btn-outline-primary mr-1 btn-edit-api" data-id="${row.id}" data-row="${rowDataJson}" title="Edit Template">
                <i class="fa fa-pencil"></i> Edit
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary mr-1 btn-view-json" data-id="${row.id}" data-row="${rowDataJson}" title="View JSON Config">
                <i class="fa fa-code"></i> JSON
              </button>
              <button type="button" class="btn btn-sm ${row.is_active ? 'btn-outline-warning' : 'btn-outline-success'} mr-1 btn-toggle-status" data-id="${row.id}" data-active="${row.is_active ? '1' : '0'}" title="${row.is_active ? 'Deactivate' : 'Activate'}">
                <i class="fa fa-power-off"></i>
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger btn-delete-api" data-id="${row.id}" data-name="${escapeHtml(row.name)}" title="Delete API Template">
                <i class="fa fa-trash"></i>
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
  <title>Developer API Setting - Exchange Admin</title>
  <link rel="icon" type="image/x-icon" href="/api/favicon">
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/plugins/web-fonts/icons.css">
  <link rel="stylesheet" href="/assets/plugins/web-fonts/font-awesome/font-awesome.min.css">
  <style>
    .container-fluid { width: 100%; }
    .table td, .table th { vertical-align: middle; }
    .nav-tabs .nav-link { font-weight: 600; color: #475569; }
    .nav-tabs .nav-link.active { color: #2563eb; border-bottom: 2px solid #2563eb; font-weight: 700; }
    .api-code-editor { font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; background: #0f172a; color: #38bdf8; }
    .badge-outline-primary { border: 1px solid #3b82f6; color: #2563eb; background: #eff6ff; }
    .param-pill { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; font-size: 11px; }
  </style>
</head>
<body>
<div class="page">
  <div class="page-main">
    <!-- Horizontal navigation is rendered automatically by addPanelChrome -->
    <div class="sticky">
      <div class="horizontal-main hor-menu clearfix">
        <div class="horizontal-mainwrapper container-fluid px-2 clearfix">
          <nav class="horizontalMenu clearfix">
            <ul class="horizontalMenu-list"></ul>
          </nav>
        </div>
      </div>
    </div>

    <main class="main-content">
      <div class="container-fluid px-3 py-3">
        
        <!-- Header row -->
        <div class="d-flex flex-wrap justify-content-between align-items-center mb-3">
          <div>
            <h4 class="page-title mb-1 font-weight-bold text-dark">
              <i class="fa fa-cubes text-primary mr-2"></i>Developer API Settings & Templates
            </h4>
            <div class="text-muted small">
              Manage pre-configured Developer APIs (such as Robotic Exchange, Ezytm, etc.). When added here, sellers in their portal can easily connect their accounts by providing only their credentials!
            </div>
          </div>
          <div class="mt-2 mt-md-0">
            <button type="button" class="btn btn-primary font-weight-bold" id="btnAddNewApi">
              <i class="fa fa-plus-circle mr-1"></i> Add New Developer API
            </button>
          </div>
        </div>

        <!-- KPI summary banner -->
        <div class="row mb-3">
          <div class="col-sm-6 col-md-3">
            <div class="card p-3 mb-2 shadow-sm border-0">
              <div class="d-flex align-items-center">
                <span class="stamp stamp-md bg-primary-transparent text-primary mr-3"><i class="fa fa-cubes"></i></span>
                <div>
                  <h4 class="m-0 text-dark font-weight-bold">${totalCount}</h4>
                  <small class="text-muted">Total Developer APIs</small>
                </div>
              </div>
            </div>
          </div>
          <div class="col-sm-6 col-md-3">
            <div class="card p-3 mb-2 shadow-sm border-0">
              <div class="d-flex align-items-center">
                <span class="stamp stamp-md bg-success-transparent text-success mr-3"><i class="fa fa-check-circle"></i></span>
                <div>
                  <h4 class="m-0 text-dark font-weight-bold">${activeCount}</h4>
                  <small class="text-muted">Active for Sellers</small>
                </div>
              </div>
            </div>
          </div>
          <div class="col-sm-6 col-md-6">
            <div class="card p-3 mb-2 shadow-sm border-0 bg-light">
              <div class="small text-muted">
                <i class="fa fa-lightbulb-o text-warning mr-1"></i> <strong>How it works:</strong>
                When you save an API template here, it automatically appears in the seller panel on <code>seller/api-setting</code>. Sellers just choose this API from the dropdown, fill their Member ID/Password, and the system auto-configures Balance, Recharge, Status Check, and Dispute URLs!
              </div>
            </div>
          </div>
        </div>

        <div id="alertBox"></div>

        <!-- Main table card -->
        <div class="card shadow-sm border-0">
          <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
            <h5 class="card-title mb-0 font-weight-bold text-dark">
              <i class="fa fa-list text-primary mr-2"></i>Configured Developer APIs
            </h5>
            <span class="badge badge-primary px-3 py-1 font-weight-bold">${totalCount} API Template${totalCount === 1 ? '' : 's'}</span>
          </div>
          <div class="table-responsive">
            <table class="table table-hover table-vcenter text-nowrap mb-0">
              <thead class="thead-light">
                <tr>
                  <th style="width: 40px;" class="text-center">#</th>
                  <th>API Name & Vendor</th>
                  <th>Required User Parameters</th>
                  <th>Endpoints Configured</th>
                  <th class="text-center" style="width: 100px;">Status</th>
                  <th style="width: 110px;">Updated</th>
                  <th class="text-center" style="width: 200px;">Actions</th>
                </tr>
              </thead>
              <tbody id="apiTableBody">
                ${tableRowsHtml}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  </div>
</div>

<!-- ============================================================= -->
<!-- MODAL: ADD / EDIT DEVELOPER API                               -->
<!-- ============================================================= -->
<div class="modal fade" id="apiModal" tabindex="-1" role="dialog" aria-hidden="true" data-backdrop="static">
  <div class="modal-dialog modal-xl modal-dialog-centered" role="document">
    <div class="modal-content border-0 shadow-lg">
      <div class="modal-header bg-primary text-white py-3">
        <h5 class="modal-title font-weight-bold" id="modalTitle">
          <i class="fa fa-plug mr-2"></i> Add Developer API Template
        </h5>
        <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <form id="apiTemplateForm">
        <div class="modal-body p-4" style="max-height: 80vh; overflow-y: auto;">
          <input type="hidden" id="editTemplateId" value="">

          <!-- Navigation tabs inside modal -->
          <ul class="nav nav-tabs mb-3" id="templateModalTabs" role="tablist">
            <li class="nav-item">
              <a class="nav-link active" id="tab-basic-link" data-toggle="tab" href="#tab-basic" role="tab"><i class="fa fa-info-circle mr-1"></i> 1. Basic & Credentials</a>
            </li>
            <li class="nav-item">
              <a class="nav-link" id="tab-balance-link" data-toggle="tab" href="#tab-balance" role="tab"><i class="fa fa-money mr-1"></i> 2. Balance API</a>
            </li>
            <li class="nav-item">
              <a class="nav-link" id="tab-recharge-link" data-toggle="tab" href="#tab-recharge" role="tab"><i class="fa fa-bolt mr-1"></i> 3. Recharge API</a>
            </li>
            <li class="nav-item">
              <a class="nav-link" id="tab-status-link" data-toggle="tab" href="#tab-status" role="tab"><i class="fa fa-search mr-1"></i> 4. Status Check</a>
            </li>
            <li class="nav-item">
              <a class="nav-link" id="tab-dispute-link" data-toggle="tab" href="#tab-dispute" role="tab"><i class="fa fa-exclamation-circle mr-1"></i> 5. Dispute API</a>
            </li>
            <li class="nav-item">
              <a class="nav-link" id="tab-codes-link" data-toggle="tab" href="#tab-codes" role="tab"><i class="fa fa-exchange mr-1"></i> 6. Operator & Circle Mapping</a>
            </li>
          </ul>

          <div class="tab-content" id="templateModalTabContent">
            
            <!-- TAB 1: BASIC INFO & REQUIRED USER PARAMETERS -->
            <div class="tab-pane fade show active" id="tab-basic" role="tabpanel">
              <div class="row">
                <div class="col-md-6 form-group">
                  <label class="font-weight-bold" for="modalApiName">API Name <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="modalApiName" required placeholder="e.g. Robotic Exchange" maxlength="100">
                  <small class="text-muted">This name will appear in the seller panel dropdown.</small>
                </div>
                <div class="col-md-6 form-group">
                  <label class="font-weight-bold" for="modalDevName">Developer / Vendor Name</label>
                  <input type="text" class="form-control" id="modalDevName" placeholder="e.g. Ezytm Technologies" maxlength="100">
                </div>
              </div>

              <div class="row">
                <div class="col-md-6 form-group">
                  <label class="font-weight-bold" for="modalServiceType">Service Type</label>
                  <select class="form-control" id="modalServiceType">
                    <option value="Mobile Recharge">Mobile Recharge</option>
                    <option value="DTH Recharge">DTH Recharge</option>
                    <option value="Multi Recharge">Multi Recharge (Mobile + DTH)</option>
                    <option value="Utility Bill Payment">Utility Bill Payment</option>
                  </select>
                </div>
                <div class="col-md-6 form-group">
                  <label class="font-weight-bold" for="modalIsActive">Active Status</label>
                  <select class="form-control" id="modalIsActive">
                    <option value="true">Active (Visible in Seller Dropdown)</option>
                    <option value="false">Inactive (Hidden from Sellers)</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="font-weight-bold" for="modalDescription">Description / Documentation Notes</label>
                <textarea class="form-control" id="modalDescription" rows="2" placeholder="Notes about endpoints, sample requests, test credentials, or whitelisting instructions..."></textarea>
              </div>

              <hr>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <h6 class="font-weight-bold mb-0 text-primary"><i class="fa fa-key mr-1"></i> Required Parameters from Seller</h6>
                  <small class="text-muted">Specify which fields the seller must fill (e.g. Member ID, Password, Route). The system will substitute them in endpoints!</small>
                </div>
                <button type="button" class="btn btn-sm btn-outline-primary" id="btnAddReqParam">
                  <i class="fa fa-plus"></i> Add Parameter
                </button>
              </div>

              <div class="table-responsive">
                <table class="table table-bordered table-sm">
                  <thead class="thead-light">
                    <tr>
                      <th style="width: 25%;">Parameter Key (e.g. Apimember_id)</th>
                      <th style="width: 30%;">Display Label (e.g. API Member ID)</th>
                      <th style="width: 15%;">Input Type</th>
                      <th style="width: 10%;" class="text-center">Required</th>
                      <th style="width: 10%;" class="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody id="reqParamRows">
                    <!-- Populated via JS -->
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TAB 2: BALANCE API -->
            <div class="tab-pane fade" id="tab-balance" role="tabpanel">
              <div class="form-group">
                <label class="font-weight-bold" for="balUrl">Balance Check URL <span class="text-danger">*</span></label>
                <input type="text" class="form-control font-monospace" id="balUrl" placeholder="https://api.roboticexchange.in/Robotics/webservice/GetWalletBalance" required>
                <small class="text-muted">Full URL for checking seller's live wallet balance.</small>
              </div>
              <div class="row">
                <div class="col-md-4 form-group">
                  <label class="font-weight-bold" for="balMethod">Request Method</label>
                  <select class="form-control" id="balMethod">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="JSON">POST (JSON Body)</option>
                  </select>
                </div>
                <div class="col-md-4 form-group">
                  <label class="font-weight-bold" for="balRespType">Response Type</label>
                  <select class="form-control" id="balRespType">
                    <option value="JSON">JSON</option>
                    <option value="XML">XML</option>
                  </select>
                </div>
                <div class="col-md-4 form-group">
                  <label class="font-weight-bold" for="balKey">Balance Key in Response <span class="text-danger">*</span></label>
                  <input type="text" class="form-control font-monospace" id="balKey" placeholder="SellerWalletBalance" required>
                  <small class="text-muted">e.g. <code>SellerWalletBalance</code> or <code>balance</code></small>
                </div>
              </div>

              <div class="d-flex justify-content-between align-items-center mb-2">
                <label class="font-weight-bold mb-0">Balance Query Parameters Template</label>
                <button type="button" class="btn btn-xs btn-outline-primary" id="btnAddBalParam"><i class="fa fa-plus"></i> Add Param</button>
              </div>
              <table class="table table-bordered table-sm">
                <thead class="thead-light"><tr><th>Parameter Key</th><th>Template Value (e.g. {Apimember_id})</th><th style="width:60px;" class="text-center">Action</th></tr></thead>
                <tbody id="balParamRows"></tbody>
              </table>
            </div>

            <!-- TAB 3: RECHARGE API -->
            <div class="tab-pane fade" id="tab-recharge" role="tabpanel">
              <div class="form-group">
                <label class="font-weight-bold" for="rechUrl">Recharge Endpoint URL <span class="text-danger">*</span></label>
                <input type="text" class="form-control font-monospace" id="rechUrl" placeholder="https://api.roboticexchange.in/Robotics/webservice/GetMobileRecharge" required>
              </div>
              <div class="row">
                <div class="col-md-6 form-group">
                  <label class="font-weight-bold" for="rechMethod">Request Method</label>
                  <select class="form-control" id="rechMethod">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="JSON">POST (JSON Body)</option>
                  </select>
                </div>
                <div class="col-md-6 form-group">
                  <label class="font-weight-bold" for="rechRespType">Response Type</label>
                  <select class="form-control" id="rechRespType">
                    <option value="JSON">JSON</option>
                    <option value="XML">XML</option>
                  </select>
                </div>
              </div>

              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <label class="font-weight-bold mb-0">Recharge Request Parameters</label>
                  <div class="small text-muted">Use placeholders: <code>{Apimember_id}</code>, <code>{Api_password}</code>, <code>{NUMBER}</code>, <code>{OPCODE}</code>, <code>{AMOUNT}</code>, <code>{TXNID}</code>, <code>{CIRCLE}</code></div>
                </div>
                <button type="button" class="btn btn-xs btn-outline-primary" id="btnAddRechParam"><i class="fa fa-plus"></i> Add Param</button>
              </div>
              <table class="table table-bordered table-sm">
                <thead class="thead-light"><tr><th>Parameter Key</th><th>Template Value</th><th style="width:60px;" class="text-center">Action</th></tr></thead>
                <tbody id="rechParamRows"></tbody>
              </table>

              <hr>
              <h6 class="font-weight-bold text-dark"><i class="fa fa-sliders text-info mr-1"></i> Response Parsing & Status Mapping</h6>
              <div class="row">
                <div class="col-md-3 form-group">
                  <label class="small font-weight-bold" for="rechStatusKey">Status Key</label>
                  <input type="text" class="form-control font-monospace" id="rechStatusKey" placeholder="STATUS">
                </div>
                <div class="col-md-3 form-group">
                  <label class="small font-weight-bold" for="rechSuccessCodes">Success Code(s)</label>
                  <input type="text" class="form-control font-monospace" id="rechSuccessCodes" placeholder="1, SUCCESS">
                </div>
                <div class="col-md-3 form-group">
                  <label class="small font-weight-bold" for="rechPendingCodes">Processing / Pending Code(s)</label>
                  <input type="text" class="form-control font-monospace" id="rechPendingCodes" placeholder="2, PROCESSING">
                </div>
                <div class="col-md-3 form-group">
                  <label class="small font-weight-bold" for="rechFailedCodes">Failed Code(s)</label>
                  <input type="text" class="form-control font-monospace" id="rechFailedCodes" placeholder="3, FAILED">
                </div>
              </div>

              <div class="row">
                <div class="col-md-3 form-group">
                  <label class="small font-weight-bold" for="rechSupplierIdKey">Order / Supplier ID Key</label>
                  <input type="text" class="form-control font-monospace" id="rechSupplierIdKey" placeholder="ORDERID">
                </div>
                <div class="col-md-3 form-group">
                  <label class="small font-weight-bold" for="rechOperatorIdKey">Operator Txn ID Key</label>
                  <input type="text" class="form-control font-monospace" id="rechOperatorIdKey" placeholder="OPTRANSID">
                </div>
                <div class="col-md-3 form-group">
                  <label class="small font-weight-bold" for="rechMemberReqIdKey">Member Req ID Key</label>
                  <input type="text" class="form-control font-monospace" id="rechMemberReqIdKey" placeholder="MEMBERREQID">
                </div>
                <div class="col-md-3 form-group">
                  <label class="small font-weight-bold" for="rechMessageKey">Message Key</label>
                  <input type="text" class="form-control font-monospace" id="rechMessageKey" placeholder="MESSAGE">
                </div>
              </div>
            </div>

            <!-- TAB 4: STATUS CHECK API -->
            <div class="tab-pane fade" id="tab-status" role="tabpanel">
              <div class="form-group">
                <label class="font-weight-bold" for="statusUrl">Status Check URL</label>
                <input type="text" class="form-control font-monospace" id="statusUrl" placeholder="https://api.roboticexchange.in/Robotics/webservice/GetStatus">
              </div>
              <div class="row">
                <div class="col-md-4 form-group">
                  <label class="font-weight-bold" for="statusMethod">Request Method</label>
                  <select class="form-control" id="statusMethod"><option value="GET">GET</option><option value="POST">POST</option></select>
                </div>
                <div class="col-md-4 form-group">
                  <label class="font-weight-bold" for="statusRespType">Response Type</label>
                  <select class="form-control" id="statusRespType"><option value="JSON">JSON</option><option value="XML">XML</option></select>
                </div>
                <div class="col-md-4 form-group">
                  <label class="font-weight-bold" for="statusKeyField">Status Key</label>
                  <input type="text" class="form-control font-monospace" id="statusKeyField" placeholder="STATUS">
                </div>
              </div>

              <div class="d-flex justify-content-between align-items-center mb-2">
                <label class="font-weight-bold mb-0">Status Check Parameters</label>
                <button type="button" class="btn btn-xs btn-outline-primary" id="btnAddStatusParam"><i class="fa fa-plus"></i> Add Param</button>
              </div>
              <table class="table table-bordered table-sm">
                <thead class="thead-light"><tr><th>Parameter Key</th><th>Template Value</th><th style="width:60px;" class="text-center">Action</th></tr></thead>
                <tbody id="statusParamRows"></tbody>
              </table>
            </div>

            <!-- TAB 5: DISPUTE API -->
            <div class="tab-pane fade" id="tab-dispute" role="tabpanel">
              <div class="form-group">
                <label class="font-weight-bold" for="disputeUrl">Dispute / Complaint URL</label>
                <input type="text" class="form-control font-monospace" id="disputeUrl" placeholder="https://api.roboticexchange.in/Robotics/webservice/RechargeComplaint">
              </div>
              <div class="row">
                <div class="col-md-6 form-group">
                  <label class="font-weight-bold" for="disputeMethod">Request Method</label>
                  <select class="form-control" id="disputeMethod"><option value="GET">GET</option><option value="POST">POST</option></select>
                </div>
                <div class="col-md-6 form-group">
                  <label class="font-weight-bold" for="disputeStatusKey">Status Key</label>
                  <input type="text" class="form-control font-monospace" id="disputeStatusKey" placeholder="STATUS">
                </div>
              </div>

              <div class="d-flex justify-content-between align-items-center mb-2">
                <label class="font-weight-bold mb-0">Dispute Parameters</label>
                <button type="button" class="btn btn-xs btn-outline-primary" id="btnAddDisputeParam"><i class="fa fa-plus"></i> Add Param</button>
              </div>
              <table class="table table-bordered table-sm">
                <thead class="thead-light"><tr><th>Parameter Key</th><th>Template Value</th><th style="width:60px;" class="text-center">Action</th></tr></thead>
                <tbody id="disputeParamRows"></tbody>
              </table>
            </div>

            <!-- TAB 6: OPERATOR & CIRCLE CODES MAPPING -->
            <div class="tab-pane fade" id="tab-codes" role="tabpanel">
              <div class="row">
                <div class="col-md-6">
                  <label class="font-weight-bold">Operator Code Mapping (JSON)</label>
                  <div class="small text-muted mb-1">Maps system operators to this API's operator codes (e.g. Airtel -> AT, Jio -> JO):</div>
                  <textarea class="form-control font-monospace api-code-editor" id="modalOperatorCodes" rows="12"></textarea>
                </div>
                <div class="col-md-6">
                  <label class="font-weight-bold">Circle Code Mapping (JSON)</label>
                  <div class="small text-muted mb-1">Maps system circle names to circle codes (e.g. Delhi -> 10, UP West -> 97):</div>
                  <textarea class="form-control font-monospace api-code-editor" id="modalCircleCodes" rows="12"></textarea>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div class="modal-footer bg-light py-2">
          <button type="button" class="btn btn-secondary btn-sm px-3" data-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm px-4 font-weight-bold" id="btnSaveTemplate">
            <i class="fa fa-save mr-1"></i> Save Developer API
          </button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- ============================================================= -->
<!-- MODAL: VIEW JSON CONFIG                                       -->
<!-- ============================================================= -->
<div class="modal fade" id="jsonModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
    <div class="modal-content">
      <div class="modal-header bg-dark text-white py-2">
        <h5 class="modal-title font-weight-bold" id="jsonModalTitle"><i class="fa fa-code mr-1"></i> API Configuration JSON</h5>
        <button type="button" class="close text-white" data-dismiss="modal"><span>&times;</span></button>
      </div>
      <div class="modal-body p-0">
        <pre id="jsonModalContent" class="m-0 p-3 api-code-editor" style="max-height: 500px; overflow: auto; border-radius: 0;"></pre>
      </div>
      <div class="modal-footer py-2">
        <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>

<script src="/assets/js/jquery-3.5.1.min.js"></script>
<script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="/auth-client.js"></script>

<script>
  function $(id) { return document.getElementById(id); }

  function showAlert(msg, type = 'success') {
    const box = $('alertBox');
    box.innerHTML = \`<div class="alert alert-\${type} alert-dismissible fade show" role="alert">
      \${msg}
      <button type="button" class="close" data-dismiss="alert"><span>&times;</span></button>
    </div>\`;
  }

  // --- Dynamic Table Row Builders ---
  function addReqParamRow(key = '', label = '', type = 'text', required = true) {
    const tbody = $('reqParamRows');
    const tr = document.createElement('tr');
    tr.innerHTML = \`
      <td><input type="text" class="form-control form-control-sm font-monospace p-key" value="\${escapeHtml(key)}" placeholder="e.g. Apimember_id" required></td>
      <td><input type="text" class="form-control form-control-sm p-label" value="\${escapeHtml(label)}" placeholder="e.g. API Member ID" required></td>
      <td>
        <select class="form-control form-control-sm p-type">
          <option value="text" \${type === 'text' ? 'selected' : ''}>Text</option>
          <option value="password" \${type === 'password' ? 'selected' : ''}>Password</option>
          <option value="select" \${type === 'select' ? 'selected' : ''}>Select / Dropdown</option>
        </select>
      </td>
      <td class="text-center">
        <input type="checkbox" class="p-required" \${required ? 'checked' : ''}>
      </td>
      <td class="text-center">
        <button type="button" class="btn btn-xs btn-outline-danger btn-del-row"><i class="fa fa-times"></i></button>
      </td>
    \`;
    tr.querySelector('.btn-del-row').onclick = () => tr.remove();
    tbody.appendChild(tr);
  }

  function addParamRow(tbodyId, key = '', val = '') {
    const tbody = $(tbodyId);
    const tr = document.createElement('tr');
    tr.innerHTML = \`
      <td><input type="text" class="form-control form-control-sm font-monospace p-key" value="\${escapeHtml(key)}" placeholder="Parameter Key" required></td>
      <td><input type="text" class="form-control form-control-sm font-monospace p-val" value="\${escapeHtml(val)}" placeholder="e.g. {Apimember_id} or {NUMBER}" required></td>
      <td class="text-center">
        <button type="button" class="btn btn-xs btn-outline-danger btn-del-row"><i class="fa fa-times"></i></button>
      </td>
    \`;
    tr.querySelector('.btn-del-row').onclick = () => tr.remove();
    tbody.appendChild(tr);
  }

  function getParamsFromTable(tbodyId) {
    const rows = Array.from($(tbodyId).querySelectorAll('tr'));
    return rows.map(r => ({
      key: r.querySelector('.p-key').value.trim(),
      value: r.querySelector('.p-val').value.trim()
    })).filter(p => p.key);
  }

  function getReqParamsFromTable() {
    const rows = Array.from($('reqParamRows').querySelectorAll('tr'));
    return rows.map(r => ({
      key: r.querySelector('.p-key').value.trim(),
      label: r.querySelector('.p-label').value.trim() || r.querySelector('.p-key').value.trim(),
      type: r.querySelector('.p-type').value,
      required: r.querySelector('.p-required').checked
    })).filter(p => p.key);
  }

  $('btnAddReqParam').onclick = () => addReqParamRow();
  $('btnAddBalParam').onclick = () => addParamRow('balParamRows');
  $('btnAddRechParam').onclick = () => addParamRow('rechParamRows');
  $('btnAddStatusParam').onclick = () => addParamRow('statusParamRows');
  $('btnAddDisputeParam').onclick = () => addParamRow('disputeParamRows');

  // Open Add Modal
  $('btnAddNewApi').onclick = () => {
    $('editTemplateId').value = '';
    $('modalTitle').innerHTML = '<i class="fa fa-plug mr-2"></i> Add Developer API Template';
    $('apiTemplateForm').reset();
    $('reqParamRows').innerHTML = '';
    $('balParamRows').innerHTML = '';
    $('rechParamRows').innerHTML = '';
    $('statusParamRows').innerHTML = '';
    $('disputeParamRows').innerHTML = '';
    $('modalOperatorCodes').value = '{}';
    $('modalCircleCodes').value = '{}';

    // Defaults for convenience
    addReqParamRow('Apimember_id', 'API Member ID / User ID', 'text', true);
    addReqParamRow('Api_password', 'API Password', 'password', true);

    $('#tab-basic-link').tab('show');
    $('#apiModal').modal('show');
  };

  // Edit Template
  document.querySelectorAll('.btn-edit-api').forEach(btn => {
    btn.onclick = () => {
      const row = JSON.parse(btn.getAttribute('data-row'));
      $('editTemplateId').value = row.id;
      $('modalTitle').innerHTML = '<i class="fa fa-pencil mr-2"></i> Edit Developer API: ' + escapeHtml(row.name);
      
      $('modalApiName').value = row.name || '';
      $('modalDevName').value = row.developer_name || '';
      $('modalServiceType').value = row.service_type || 'Mobile Recharge';
      $('modalIsActive').value = String(row.is_active !== false);
      $('modalDescription').value = row.description || '';

      // Populate Required Params
      $('reqParamRows').innerHTML = '';
      const reqs = Array.isArray(row.required_parameters) ? row.required_parameters : JSON.parse(row.required_parameters || '[]');
      reqs.forEach(p => addReqParamRow(p.key, p.label, p.type, p.required !== false));

      const conf = row.config || {};
      
      // Balance
      const bal = conf.balance || {};
      $('balUrl').value = bal.url || '';
      $('balMethod').value = bal.requestType || 'GET';
      $('balRespType').value = bal.responseType || 'JSON';
      $('balKey').value = bal.balanceKey || '';
      $('balParamRows').innerHTML = '';
      (bal.parameters || []).forEach(p => addParamRow('balParamRows', p.key, p.value));

      // Recharge
      const rech = conf.recharge || {};
      $('rechUrl').value = rech.url || '';
      $('rechMethod').value = rech.requestType || 'GET';
      $('rechRespType').value = rech.responseType || 'JSON';
      $('rechStatusKey').value = rech.statusKey || 'STATUS';
      $('rechSuccessCodes').value = rech.successCodes || '1, SUCCESS';
      $('rechPendingCodes').value = rech.pendingCodes || '2, PROCESSING';
      $('rechFailedCodes').value = rech.failedCodes || '3, FAILED';
      $('rechSupplierIdKey').value = rech.supplierIdKey || 'ORDERID';
      $('rechOperatorIdKey').value = rech.operatorIdKey || 'OPTRANSID';
      $('rechMemberReqIdKey').value = rech.memberReqIdKey || 'MEMBERREQID';
      $('rechMessageKey').value = rech.messageKey || 'MESSAGE';
      $('rechParamRows').innerHTML = '';
      (rech.parameters || []).forEach(p => addParamRow('rechParamRows', p.key, p.value));

      // Status Check
      const st = conf.statusCheck || {};
      $('statusUrl').value = st.url || '';
      $('statusMethod').value = st.requestType || 'GET';
      $('statusRespType').value = st.responseType || 'JSON';
      $('statusKeyField').value = st.statusKey || 'STATUS';
      $('statusParamRows').innerHTML = '';
      (st.parameters || []).forEach(p => addParamRow('statusParamRows', p.key, p.value));

      // Dispute
      const disp = conf.dispute || {};
      $('disputeUrl').value = disp.url || '';
      $('disputeMethod').value = disp.requestType || 'GET';
      $('disputeStatusKey').value = disp.statusKey || 'STATUS';
      $('disputeParamRows').innerHTML = '';
      (disp.parameters || []).forEach(p => addParamRow('disputeParamRows', p.key, p.value));

      // Codes JSON
      $('modalOperatorCodes').value = JSON.stringify(conf.operatorCodes || {}, null, 2);
      $('modalCircleCodes').value = JSON.stringify(conf.circleCodes || {}, null, 2);

      $('#tab-basic-link').tab('show');
      $('#apiModal').modal('show');
    };
  });

  // View JSON
  document.querySelectorAll('.btn-view-json').forEach(btn => {
    btn.onclick = () => {
      const row = JSON.parse(btn.getAttribute('data-row'));
      $('jsonModalTitle').textContent = row.name + ' - Configuration JSON';
      $('jsonModalContent').textContent = JSON.stringify(row, null, 2);
      $('#jsonModal').modal('show');
    };
  });

  // Toggle Active Status
  document.querySelectorAll('.btn-toggle-status').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const cur = btn.getAttribute('data-active') === '1';
      try {
        const res = await fetch(\`/api/admin/developer-apis/\${id}/toggle-active\`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ active: !cur })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update status');
        location.reload();
      } catch (err) {
        alert(err.message);
      }
    };
  });

  // Delete Template
  document.querySelectorAll('.btn-delete-api').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name');
      if (!confirm(\`Are you sure you want to delete Developer API "\${name}"? Existing seller APIs already configured will retain their settings.\`)) return;
      try {
        const res = await fetch(\`/api/admin/developer-apis/\${id}/delete\`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete template');
        location.reload();
      } catch (err) {
        alert(err.message);
      }
    };
  });

  // Save / Submit Template Form
  $('apiTemplateForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = $('editTemplateId').value.trim();
    const name = $('modalApiName').value.trim();
    const developer_name = $('modalDevName').value.trim();
    const service_type = $('modalServiceType').value;
    const is_active = $('modalIsActive').value === 'true';
    const description = $('modalDescription').value.trim();

    const required_parameters = getReqParamsFromTable();

    let operatorCodes = {};
    try { operatorCodes = JSON.parse($('modalOperatorCodes').value || '{}'); } catch (_) {}

    let circleCodes = {};
    try { circleCodes = JSON.parse($('modalCircleCodes').value || '{}'); } catch (_) {}

    const config = {
      balance: {
        url: $('balUrl').value.trim(),
        requestType: $('balMethod').value,
        responseType: $('balRespType').value,
        balanceKey: $('balKey').value.trim(),
        parameters: getParamsFromTable('balParamRows')
      },
      recharge: {
        url: $('rechUrl').value.trim(),
        requestType: $('rechMethod').value,
        responseType: $('rechRespType').value,
        parameters: getParamsFromTable('rechParamRows'),
        statusKey: $('rechStatusKey').value.trim() || 'STATUS',
        successCodes: $('rechSuccessCodes').value.trim() || '1',
        pendingCodes: $('rechPendingCodes').value.trim() || '2',
        failedCodes: $('rechFailedCodes').value.trim() || '3',
        supplierIdKey: $('rechSupplierIdKey').value.trim() || 'ORDERID',
        operatorIdKey: $('rechOperatorIdKey').value.trim() || 'OPTRANSID',
        memberReqIdKey: $('rechMemberReqIdKey').value.trim() || 'MEMBERREQID',
        messageKey: $('rechMessageKey').value.trim() || 'MESSAGE'
      },
      statusCheck: {
        url: $('statusUrl').value.trim(),
        requestType: $('statusMethod').value,
        responseType: $('statusRespType').value,
        statusKey: $('statusKeyField').value.trim() || 'STATUS',
        parameters: getParamsFromTable('statusParamRows')
      },
      dispute: {
        url: $('disputeUrl').value.trim(),
        requestType: $('disputeMethod').value,
        statusKey: $('disputeStatusKey').value.trim() || 'STATUS',
        parameters: getParamsFromTable('disputeParamRows')
      },
      operatorCodes,
      circleCodes
    };

    const payload = {
      name,
      developer_name,
      service_type,
      is_active,
      description,
      required_parameters,
      config
    };

    const saveBtn = $('btnSaveTemplate');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Saving...';

    try {
      const url = id ? \`/api/admin/developer-apis/\${id}/update\` : '/api/admin/developer-apis';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save developer API template.');
      $('#apiModal').modal('hide');
      location.reload();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa fa-save mr-1"></i> Save Developer API';
    }
  };
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
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/settings/api-setting' }));
  }

  return { sendAdminApiSettingPage };
};
