'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');
const { checkAndSuspendSellerApiOnDailyRefund } = require('../lib/seller-api-rules');
const {
  getWalletMode,
  holdDisputeLien,
  releaseDisputeLien,
  applyDisputeRefundPenalty,
} = require('../lib/wallet-helper');

const CIRCLES = [
  'All', 'Andhra Pradesh', 'Assam', 'Bihar & Jharkhand', 'Chennai', 'Delhi', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jammu Kashmir', 'Karnataka', 'Kerala', 'Kolkata',
  'Maharashtra & Goa', 'Mumbai', 'North East', 'Orissa', 'Punjab', 'Rajasthan',
  'Tamil Nadu', 'UP East', 'UP West', 'West Bengal',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = function createAdminRechargeReportPage({
  db,
  formatMinorUnits,
  decryptMobile,
  sendJson,
  httpError,
}) {

  function getTodayString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  /**
   * Helper to format table rows HTML
   */
  function renderTableRows(rows) {
    if (!rows || rows.length === 0) {
      return '<tr><td colspan="14" class="text-center py-5 text-muted font-weight-bold">No recharge transactions found.</td></tr>';
    }

    return rows.map((row, index) => {
      const amtMinor = BigInt(row.amount_minor || '0');

      let mobile = row.mobile_number || '';
      if (!mobile && row.mobile_ciphertext && decryptMobile) {
        try { mobile = decryptMobile(row.mobile_ciphertext); } catch (_) { mobile = '••••••••••'; }
      }

      const payload = typeof row.response_payload === 'object' && row.response_payload !== null ? row.response_payload : {};
      let durationSec = '1.0s';
      if (payload.duration_ms) {
        durationSec = (Number(payload.duration_ms) / 1000).toFixed(1) + 's';
      } else if (row.updated_at && row.created_at) {
        const diffMs = Math.max(500, new Date(row.updated_at).getTime() - new Date(row.created_at).getTime());
        durationSec = (diffMs / 1000).toFixed(1) + 's';
      }

      let statusBadge = '<span class="badge badge-secondary px-2 py-1">Unknown</span>';
      if (row.status === 'successful') {
        statusBadge = '<span class="badge badge-success px-2 py-1" style="background:#10b981;"><i class="fa fa-check-circle mr-1"></i> SUCCESS</span>';
      } else if (row.status === 'pending' || row.status === 'processing') {
        statusBadge = '<span class="badge badge-warning text-white px-2 py-1" style="background:#f59e0b;"><i class="fa fa-clock-o mr-1"></i> PENDING</span>';
      } else if (row.status === 'failed') {
        statusBadge = '<span class="badge badge-danger px-2 py-1" style="background:#ef4444;"><i class="fa fa-times-circle mr-1"></i> FAILED</span>';
      } else if (row.status === 'refunded') {
        statusBadge = '<span class="badge badge-info px-2 py-1" style="background:#0ea5e9;"><i class="fa fa-undo mr-1"></i> REFUNDED</span>';
      }

      const supplierId = payload.supplierTxnId || payload.txnid || payload.operatorTxnId || '-';
      const opeId = row.provider_reference || '-';
      const systemRechargeId = 'RCH-' + row.id.slice(0, 8).toUpperCase();
      const amountFormatted = (Number(amtMinor) / 100).toFixed(2);
      const isSuccess = row.status === 'successful';

      return `
        <tr data-order-id="${row.id}">
          <td class="text-center font-weight-bold">${index + 1}</td>
          <td>
            <div class="d-flex align-items-center">
              <span class="badge badge-light border text-monospace font-weight-bold py-1 px-2" style="font-size:11.5px;letter-spacing:0.5px;" title="${row.id}">
                ${systemRechargeId}
              </span>
              <button class="btn btn-xs btn-outline-secondary ml-1 py-0 px-1 border-0" onclick="navigator.clipboard.writeText('${row.id}')" title="Copy Full UUID">
                <i class="fa fa-copy"></i>
              </button>
            </div>
          </td>
          <td>
            <span class="font-weight-bold text-dark d-block" style="font-size:12px;">${formatDateTime(row.created_at)}</span>
            <span class="badge badge-pill badge-primary-light text-primary border font-weight-bold" style="font-size:10px;background:#eef2ff;">
              ⏱️ ${durationSec}
            </span>
          </td>
          <td>
            <span class="font-weight-bold text-dark d-block">${escapeHtml(row.buyer_name || row.buyer_username || 'N/A')}</span>
            <small class="text-muted text-monospace">@${escapeHtml(row.buyer_username || 'n/a')}</small>
          </td>
          <td>
            ${row.seller_user_id ? `
              <span class="font-weight-bold text-dark d-block">${escapeHtml(row.seller_name || row.seller_username || 'Seller')}</span>
              <small class="text-muted text-monospace">@${escapeHtml(row.seller_username || 'n/a')}</small>
            ` : '<span class="badge badge-light border text-muted">Direct / None</span>'}
          </td>
          <td>
            <span class="font-weight-bold text-dark">${escapeHtml(row.operator_name || row.operator_code || '-')}</span>
          </td>
          <td><span class="text-muted">${escapeHtml(row.circle_name || 'All')}</span></td>
          <td>
            <strong class="text-dark font-weight-bold text-monospace" style="letter-spacing:0.3px;">${escapeHtml(mobile)}</strong>
          </td>
          <td>
            <strong class="text-dark font-weight-bold" style="font-size:13.5px;">₹${amountFormatted}</strong>
          </td>
          <td>${statusBadge}</td>
          <td class="text-monospace ope-cell" style="font-size:11.5px;">${escapeHtml(opeId)}</td>
          <td class="text-monospace" style="font-size:11.5px;">${escapeHtml(supplierId)}</td>
          <td class="text-monospace" style="font-size:11px;">
            <span class="badge badge-light border text-secondary px-2 py-1" title="Client Ref ID">
              ${escapeHtml(row.idempotency_key || '-')}
            </span>
          </td>
          <td>
            <div class="d-flex align-items-center" style="gap: 4px;">
              ${isSuccess ? `
                <button type="button" class="btn btn-xs btn-outline-danger font-weight-bold py-1 px-2 btn-action-fail"
                        data-id="${row.id}" data-ref="${escapeHtml(row.idempotency_key)}" title="Mark as Fail & Refund Buyer">
                  <i class="fa fa-times"></i> Fail
                </button>
              ` : `
                <button type="button" class="btn btn-xs btn-outline-secondary py-1 px-2" disabled title="Only for success txn">
                  <i class="fa fa-times"></i> Fail
                </button>
              `}
              <button type="button" class="btn btn-xs btn-outline-warning text-dark font-weight-bold py-1 px-2 btn-action-dispute"
                      data-id="${row.id}" data-disp="${row.dispute_status || 'none'}" data-reason="${escapeHtml(row.dispute_reason || '')}"
                      title="Dispute Management">
                <i class="fa fa-gavel"></i> Dispute
              </button>
              <button type="button" class="btn btn-xs btn-outline-info font-weight-bold py-1 px-2 btn-action-resend-cb"
                      data-id="${row.id}" title="Resend Callback to Buyer">
                <i class="fa fa-paper-plane"></i> CB
              </button>
              <button type="button" class="btn btn-xs btn-outline-dark font-weight-bold py-1 px-2 btn-action-log"
                      data-id="${row.id}" title="View Complete Recharge Log">
                <i class="fa fa-file-text-o"></i> Log
              </button>
              <button type="button" class="btn btn-xs btn-outline-primary font-weight-bold py-1 px-2 btn-action-update-ope"
                      data-id="${row.id}" data-ope="${escapeHtml(row.provider_reference || '')}" title="Update Operator Ref ID">
                <i class="fa fa-pencil"></i> Ope ID
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Helper to render shared action modals HTML
   */
  function renderModalsHtml() {
    return `
    <!-- Modal: Fail Order -->
    <div class="modal fade" id="modalFailOrder" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header bg-danger text-white">
            <h5 class="modal-title font-weight-bold"><i class="fa fa-exclamation-triangle mr-1"></i> Confirm Fail Recharge</h5>
            <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <p class="text-dark font-weight-bold mb-2">Are you sure you want to mark this successful recharge as FAILED?</p>
            <div class="alert alert-warning small py-2">
              <i class="fa fa-info-circle mr-1"></i> <strong>Important:</strong> The recharge cost will be refunded back to the Buyer's prepaid wallet immediately, and any seller sales credit will be reversed.
            </div>
            <div class="form-group">
              <label class="font-weight-bold small text-muted">Reason / Remark for Failure</label>
              <input type="text" id="failOrderReason" class="form-control" placeholder="e.g. Failed at operator end as per operator log">
            </div>
            <input type="hidden" id="failOrderId">
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-danger font-weight-bold" id="btnConfirmFailOrder">
              <i class="fa fa-check mr-1"></i> Confirm &amp; Refund Buyer
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Update Ope ID -->
    <div class="modal fade" id="modalUpdateOpe" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title font-weight-bold"><i class="fa fa-edit mr-1"></i> Update Operator Reference ID</h5>
            <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="font-weight-bold small text-muted">Operator Ref ID (opeid)</label>
              <input type="text" id="updateOpeIdVal" class="form-control text-monospace" placeholder="Enter valid operator reference ID">
            </div>
            <input type="hidden" id="updateOpeOrderId">
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary font-weight-bold" id="btnConfirmUpdateOpe">
              <i class="fa fa-save mr-1"></i> Save Ope ID
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Recharge Log -->
    <div class="modal fade" id="modalRechargeLog" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header bg-dark text-white">
            <h5 class="modal-title font-weight-bold"><i class="fa fa-file-code-o mr-1"></i> Full Recharge Transaction Log</h5>
            <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body p-3" id="rechargeLogBody">
            <div class="text-center py-4"><i class="fa fa-spinner fa-spin fa-2x text-primary"></i></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Dispute Details / Action -->
    <div class="modal fade" id="modalDispute" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header bg-warning text-dark">
            <h5 class="modal-title font-weight-bold"><i class="fa fa-gavel mr-1"></i> Transaction Dispute</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <div id="disputeCurrentStatus" class="mb-3"></div>
            <div class="form-group">
              <label class="font-weight-bold small text-muted">Dispute Reason / Remark</label>
              <textarea id="disputeReasonInput" class="form-control" rows="3" placeholder="Enter dispute reason..."></textarea>
            </div>
            <input type="hidden" id="disputeOrderId">
          </div>
          <div class="modal-footer">
            <a href="/admin/disputes" class="btn btn-outline-dark mr-auto" target="_blank">
              <i class="fa fa-external-link mr-1"></i> Go to Disputes Page
            </a>
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-warning font-weight-bold text-dark" id="btnSaveDispute">
              <i class="fa fa-save mr-1"></i> Save Dispute
            </button>
          </div>
        </div>
      </div>
    </div>
    `;
  }

  /**
   * Helper to render client-side scripts with modal handlers and live polling
   */
  function renderScriptsHtml({ isLive = false } = {}) {
    return `
    <script src="/assets/js/jquery-3.5.1.min.js"></script>
    <script src="/assets/plugins/bootstrap/js/bootstrap.min.js"></script>
    <script src="/auth-client.js"></script>

    <script>
      let isModalOpen = false;
      $('.modal').on('show.bs.modal', function() { isModalOpen = true; });
      $('.modal').on('hidden.bs.modal', function() { isModalOpen = false; });

      // 1. Fail Order
      $(document).on('click', '.btn-action-fail', function() {
        const orderId = $(this).data('id');
        const refId = $(this).data('ref');
        $('#failOrderId').val(orderId);
        $('#failOrderReason').val('Failed by Administrator (Ref: ' + refId + ')');
        $('#modalFailOrder').modal('show');
      });

      $('#btnConfirmFailOrder').on('click', async function() {
        const orderId = $('#failOrderId').val();
        const reason = $('#failOrderReason').val().trim();
        const btn = $(this);
        btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin mr-1"></i> Processing...');

        try {
          const res = await fetch('/api/admin/recharge-report/mark-failed', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ orderId, reason }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to update transaction.');
          alert('✓ ' + data.message);
          $('#modalFailOrder').modal('hide');
          location.reload();
        } catch (err) {
          alert('Error: ' + err.message);
        } finally {
          btn.prop('disabled', false).html('<i class="fa fa-check mr-1"></i> Confirm &amp; Refund Buyer');
        }
      });

      // 2. Update Ope ID
      $(document).on('click', '.btn-action-update-ope', function() {
        const orderId = $(this).data('id');
        const currentOpe = $(this).data('ope') || '';
        $('#updateOpeOrderId').val(orderId);
        $('#updateOpeIdVal').val(currentOpe === '-' ? '' : currentOpe);
        $('#modalUpdateOpe').modal('show');
      });

      $('#btnConfirmUpdateOpe').on('click', async function() {
        const orderId = $('#updateOpeOrderId').val();
        const opeId = $('#updateOpeIdVal').val().trim();
        const btn = $(this);
        btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin mr-1"></i> Saving...');

        try {
          const res = await fetch('/api/admin/recharge-report/update-ope-id', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ orderId, opeId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to update Ope ID.');
          alert('✓ ' + data.message);
          $('#modalUpdateOpe').modal('hide');
          $('tr[data-order-id="' + orderId + '"] .ope-cell').text(opeId || '-');
        } catch (err) {
          alert('Error: ' + err.message);
        } finally {
          btn.prop('disabled', false).html('<i class="fa fa-save mr-1"></i> Save Ope ID');
        }
      });

      // 3. Resend Callback
      $(document).on('click', '.btn-action-resend-cb', async function() {
        const orderId = $(this).data('id');
        const btn = $(this);
        if (!confirm('Are you sure you want to resend the callback webhook to the buyer?')) return;

        btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i>');
        try {
          const res = await fetch('/api/admin/recharge-report/resend-callback', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ orderId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to resend callback.');
          alert('✓ ' + data.message);
        } catch (err) {
          alert('Callback Error: ' + err.message);
        } finally {
          btn.prop('disabled', false).html('<i class="fa fa-paper-plane"></i> CB');
        }
      });

      // 4. View Recharge Log
      $(document).on('click', '.btn-action-log', async function() {
        const orderId = $(this).data('id');
        $('#rechargeLogBody').html('<div class="text-center py-4"><i class="fa fa-spinner fa-spin fa-2x text-primary"></i><div class="mt-2 text-muted">Loading recharge log...</div></div>');
        $('#modalRechargeLog').modal('show');

        try {
          const res = await fetch('/api/admin/recharge-report/log?orderId=' + encodeURIComponent(orderId), {
            credentials: 'same-origin',
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to fetch log.');

          const l = data.log;
          const rawPayloadJson = typeof l.response_payload === 'object' ? JSON.stringify(l.response_payload, null, 2) : String(l.response_payload || '{}');

          const logHtml = \`
            <div class="table-responsive mb-3">
              <table class="table table-sm table-bordered mb-0" style="font-size:12.5px;">
                <tr><th style="width:170px;" class="bg-light">Internal Order ID</th><td class="text-monospace font-weight-bold">\${escapeHtml(l.id)}</td></tr>
                <tr><th class="bg-light">Client Ref ID</th><td class="text-monospace">\${escapeHtml(l.idempotency_key)}</td></tr>
                <tr><th class="bg-light">Mobile Number</th><td class="font-weight-bold text-dark">\${escapeHtml(l.mobile)}</td></tr>
                <tr><th class="bg-light">Operator / Code</th><td>\${escapeHtml(l.operator_name)} (\${escapeHtml(l.operator_code)})</td></tr>
                <tr><th class="bg-light">Recharge Amount</th><td class="font-weight-bold text-dark">₹\${(Number(l.amount_minor)/100).toFixed(2)}</td></tr>
                <tr><th class="bg-light">Current Status</th><td><span class="badge badge-dark">\${escapeHtml(l.status.toUpperCase())}</span></td></tr>
                <tr><th class="bg-light">Operator Txn (Ope ID)</th><td class="text-monospace text-primary font-weight-bold">\${escapeHtml(l.provider_reference || '-')}</td></tr>
                <tr><th class="bg-light">Buyer Details</th><td>\${escapeHtml(l.buyer_name)} (@\${escapeHtml(l.buyer_username)})</td></tr>
                <tr><th class="bg-light">Seller Details</th><td>\${escapeHtml(l.seller_name || '-')} (@\${escapeHtml(l.seller_username || 'direct')})</td></tr>
                <tr><th class="bg-light">Created At</th><td>\${escapeHtml(l.created_at)}</td></tr>
                <tr><th class="bg-light">Updated At</th><td>\${escapeHtml(l.updated_at)} (Duration: \${escapeHtml(l.duration_sec)})</td></tr>
              </table>
            </div>
            <h6 class="font-weight-bold text-dark mb-1"><i class="fa fa-code mr-1 text-primary"></i> Gateway / Supplier Response Payload</h6>
            <pre class="bg-dark text-white p-3 rounded text-monospace" style="max-height:220px;overflow-y:auto;font-size:11.5px;">\${escapeHtml(rawPayloadJson)}</pre>
          \`;
          $('#rechargeLogBody').html(logHtml);
        } catch (err) {
          $('#rechargeLogBody').html('<div class="alert alert-danger mb-0">Failed to load log: ' + escapeHtml(err.message) + '</div>');
        }
      });

      // 5. Dispute Management
      $(document).on('click', '.btn-action-dispute', function() {
        const orderId = $(this).data('id');
        const dispStatus = $(this).data('disp') || 'none';
        const reason = $(this).data('reason') || '';

        $('#disputeOrderId').val(orderId);
        $('#disputeReasonInput').val(reason);

        let statusText = '<span class="badge badge-secondary px-2 py-1">No Dispute Active</span>';
        if (dispStatus === 'pending') {
          statusText = '<span class="badge badge-warning px-2 py-1 text-white"><i class="fa fa-clock-o mr-1"></i> Dispute Pending Review</span>';
        } else if (dispStatus === 'accepted') {
          statusText = '<span class="badge badge-success px-2 py-1"><i class="fa fa-check mr-1"></i> Dispute Accepted & Refunded</span>';
        } else if (dispStatus === 'rejected') {
          statusText = '<span class="badge badge-danger px-2 py-1"><i class="fa fa-times mr-1"></i> Dispute Rejected</span>';
        }
        $('#disputeCurrentStatus').html('<strong>Current Status:</strong> ' + statusText);
        $('#modalDispute').modal('show');
      });

      $('#btnSaveDispute').on('click', async function() {
        const orderId = $('#disputeOrderId').val();
        const reason = $('#disputeReasonInput').val().trim();
        if (!reason) { alert('Please enter dispute reason / remark.'); return; }

        const btn = $(this);
        btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin mr-1"></i> Saving...');

        try {
          const res = await fetch('/api/admin/recharge-report/raise-dispute', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ orderId, reason }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to record dispute.');
          alert('✓ ' + data.message);
          $('#modalDispute').modal('hide');
          location.reload();
        } catch (err) {
          alert('Error: ' + err.message);
        } finally {
          btn.prop('disabled', false).html('<i class="fa fa-save mr-1"></i> Save Dispute');
        }
      });

      function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }

      ${isLive ? `
      // 10-Second Automatic Poller for Live Recharge Report
      let countdownSec = 10;
      const countdownEl = document.getElementById('autoRefreshCountdown');
      const pulseBadge = document.getElementById('livePulseBadge');

      async function refreshLiveTable() {
        if (isModalOpen) {
          countdownSec = 10;
          return;
        }

        try {
          if (pulseBadge) pulseBadge.classList.add('pulse-active');
          const res = await fetch('/api/admin/reports/live-recharge/data', {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin',
            cache: 'no-store'
          });
          if (!res.ok) return;
          const data = await res.json();
          if (data.ok) {
            const tbody = document.getElementById('rechargeTableBody');
            if (tbody) tbody.innerHTML = data.tableRows;

            // Update KPI cards
            if (document.getElementById('kpiTotalCount')) document.getElementById('kpiTotalCount').innerHTML = data.totalCount + ' <small class="text-muted" style="font-size:13px;">(₹' + data.totalAmtFormatted + ')</small>';
            if (document.getElementById('kpiSuccessCount')) document.getElementById('kpiSuccessCount').innerHTML = data.successCount + ' <small class="text-muted" style="font-size:13px;">(₹' + data.successAmtFormatted + ')</small>';
            if (document.getElementById('kpiPendingCount')) document.getElementById('kpiPendingCount').textContent = data.pendingCount;
            if (document.getElementById('kpiFailedCount')) document.getElementById('kpiFailedCount').textContent = data.failedCount;
            if (document.getElementById('liveLastUpdated')) document.getElementById('liveLastUpdated').textContent = data.lastUpdated;
          }
        } catch (err) {
          console.warn('[Live Recharge Poll Error]', err);
        } finally {
          if (pulseBadge) setTimeout(() => pulseBadge.classList.remove('pulse-active'), 1200);
          countdownSec = 10;
        }
      }

      // Interval ticker (1 second)
      setInterval(() => {
        if (isModalOpen) return;
        countdownSec--;
        if (countdownEl) countdownEl.textContent = countdownSec + 's';
        if (countdownSec <= 0) {
          refreshLiveTable();
        }
      }, 1000);

      $('#btnManualRefresh').on('click', function() {
        countdownSec = 10;
        refreshLiveTable();
      });
      ` : ''}
    </script>
    `;
  }

  /**
   * Common CSS for reports
   */
  const COMMON_REPORT_CSS = `
    .page-title-box { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .card-filter { border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); margin-bottom: 18px; }
    .card-filter .card-body { padding: 18px 20px; }
    .filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; align-items: end; }
    .filter-grid .form-group { margin-bottom: 0; }
    .filter-grid label { font-size: 11.5px; font-weight: 700; color: #475569; margin-bottom: 4px; display: block; }
    .filter-grid .form-control { height: 35px; font-size: 12.5px; border-radius: 6px; }
    .filter-btn-group { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; }
    .summary-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; box-shadow: 0 1px 4px rgba(0,0,0,0.03); }
    .summary-card h6 { font-size: 11.5px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
    .summary-card h4 { font-size: 20px; font-weight: 800; margin-bottom: 0; }
    .table-recharge thead th { background: #1e293b; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap; padding: 10px 8px; border: none; }
    .table-recharge td { font-size: 12px; vertical-align: middle; white-space: nowrap; padding: 8px 8px; }
    .btn-xs { padding: 3px 7px; font-size: 11px; border-radius: 4px; line-height: 1.2; }
    .badge-primary-light { background: #eff6ff; color: #3b82f6; }
    .modal-backdrop.show { opacity: 0.5; }
    @keyframes livePulseAnim {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1.05); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    .pulse-badge { animation: livePulseAnim 2s infinite; }
  `;

  /**
   * 1. GET /admin/reports/recharge-report - Master Recharge Report Page
   */
  async function sendAdminRechargeReportPage(admin, response, searchParams) {
    const today = getTodayString();

    const filters = {
      limit: ['20', '50', '100', '500'].includes(searchParams.get('limit')) ? searchParams.get('limit') : '20',
      fromDate: String(searchParams.get('fromDate') || today).trim(),
      toDate: String(searchParams.get('toDate') || today).trim(),
      clientId: String(searchParams.get('clientId') || '').trim(),
      operatorId: String(searchParams.get('operatorId') || '').trim(),
      circle: String(searchParams.get('circle') || '').trim(),
      status: String(searchParams.get('status') || '').trim().toLowerCase(),
      mobile: String(searchParams.get('mobile') || '').trim().replace(/\D/g, ''),
      amount: String(searchParams.get('amount') || '').trim(),
    };

    // Fetch operators list for filter dropdown
    const operatorsRes = await db.query(
      "SELECT id, operator_name, service_type, operator_code FROM operator_definitions WHERE deleted_at IS NULL ORDER BY operator_name ASC",
    );

    // Build SQL query conditions
    const conditions = [];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (filters.fromDate) {
      conditions.push(`r.created_at >= (${add(filters.fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (filters.toDate) {
      conditions.push(`r.created_at < (((${add(filters.toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (filters.clientId) {
      conditions.push(`(r.idempotency_key ILIKE ${add(`%${filters.clientId}%`)} OR r.id::text ILIKE ${add(`%${filters.clientId}%`)})`);
    }
    if (filters.status && ['successful', 'pending', 'failed', 'refunded'].includes(filters.status)) {
      if (filters.status === 'pending') {
        conditions.push(`r.status IN ('pending', 'processing')`);
      } else {
        conditions.push(`r.status = ${add(filters.status)}`);
      }
    }
    if (filters.operatorId && UUID_REGEX.test(filters.operatorId)) {
      conditions.push(`r.operator_id = ${add(filters.operatorId)}`);
    }
    if (filters.circle && filters.circle !== 'All' && CIRCLES.includes(filters.circle)) {
      conditions.push(`r.circle_name = ${add(filters.circle)}`);
    }
    if (filters.mobile) {
      conditions.push(`(r.mobile_number LIKE ${add(`%${filters.mobile}%`)} OR r.provider_reference LIKE ${add(`%${filters.mobile}%`)})`);
    }
    if (filters.amount && !isNaN(Number(filters.amount))) {
      const amtMinor = BigInt(Math.round(Number(filters.amount) * 100));
      conditions.push(`r.amount_minor = ${add(amtMinor)}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = searchParams.get('download') === 'csv' ? 'LIMIT 2000' : `LIMIT ${Number(filters.limit)}`;

    const query = `
      SELECT r.id, r.user_id, r.seller_user_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.operator_code, r.circle_name, r.amount_minor, r.margin_minor,
             r.cost_minor, r.seller_margin_minor, r.status, r.idempotency_key, r.provider_reference,
             r.response_payload, r.with_gst, r.dispute_status, r.dispute_reason, r.dispute_resolution_note,
             r.created_at, r.updated_at,
             u_buyer.username AS buyer_username, u_buyer.name AS buyer_name,
             u_seller.username AS seller_username, u_seller.name AS seller_name
      FROM recharge_orders r
      LEFT JOIN users u_buyer ON u_buyer.id = r.user_id
      LEFT JOIN users u_seller ON u_seller.id = r.seller_user_id
      ${whereClause}
      ORDER BY r.created_at DESC
      ${limitClause}
    `;

    const result = await db.query(query, values);

    // CSV Download
    if (searchParams.get('download') === 'csv') {
      return streamCsv(result.rows, response, 'recharge-report');
    }

    // KPI Counters
    let successCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let totalAmtMinor = 0n;
    let successAmtMinor = 0n;

    for (const row of result.rows) {
      const amtMinor = BigInt(row.amount_minor || '0');
      totalAmtMinor += amtMinor;
      if (row.status === 'successful') {
        successCount++;
        successAmtMinor += amtMinor;
      } else if (row.status === 'pending' || row.status === 'processing') {
        pendingCount++;
      } else if (row.status === 'failed') {
        failedCount++;
      }
    }

    const tableRows = renderTableRows(result.rows);
    const downloadParams = new URLSearchParams(searchParams);
    downloadParams.set('download', 'csv');
    const downloadUrl = `/admin/reports/recharge-report?${downloadParams.toString()}`;
    const navigation = renderAdminNavigation('/admin/reports/recharge-report');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Recharge Report - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>${COMMON_REPORT_CSS}</style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      
      <main class="main-content">
        <div class="container-fluid px-3 py-3">

          <!-- Header -->
          <div class="page-title-box">
            <div>
              <h4 class="font-weight-bold text-dark mb-1">
                <i class="fa fa-list-alt text-primary mr-2"></i> Recharge Report
              </h4>
              <p class="text-muted small mb-0">Master live recharge transaction audit log, routing waterfall and operator controls.</p>
            </div>
            <div class="d-flex" style="gap: 8px;">
              <a href="${downloadUrl}" class="btn btn-sm btn-success font-weight-bold shadow-sm" id="btnDownload">
                <i class="fa fa-download mr-1"></i> Download CSV
              </a>
              <button class="btn btn-sm btn-outline-primary" onclick="location.reload()">
                <i class="fa fa-refresh mr-1"></i> Refresh
              </button>
            </div>
          </div>

          <!-- Summary Stats -->
          <div class="row mb-3">
            <div class="col-6 col-md-3 mb-2">
              <div class="summary-card border-left border-primary" style="border-left-width: 4px !important;">
                <h6>Total Transactions</h6>
                <h4 class="text-primary">${result.rowCount} <small class="text-muted" style="font-size:13px;">(₹${(Number(totalAmtMinor)/100).toFixed(2)})</small></h4>
              </div>
            </div>
            <div class="col-6 col-md-3 mb-2">
              <div class="summary-card border-left border-success" style="border-left-width: 4px !important;">
                <h6>Successful Volume</h6>
                <h4 class="text-success">${successCount} <small class="text-muted" style="font-size:13px;">(₹${(Number(successAmtMinor)/100).toFixed(2)})</small></h4>
              </div>
            </div>
            <div class="col-6 col-md-3 mb-2">
              <div class="summary-card border-left border-warning" style="border-left-width: 4px !important;">
                <h6>Pending Orders</h6>
                <h4 class="text-warning">${pendingCount}</h4>
              </div>
            </div>
            <div class="col-6 col-md-3 mb-2">
              <div class="summary-card border-left border-danger" style="border-left-width: 4px !important;">
                <h6>Failed Orders</h6>
                <h4 class="text-danger">${failedCount}</h4>
              </div>
            </div>
          </div>

          <!-- Filter Form -->
          <div class="card card-filter">
            <div class="card-body">
              <form method="GET" action="/admin/reports/recharge-report" id="filterForm">
                <div class="filter-grid">
                  <div class="form-group">
                    <label>Top Entries</label>
                    <select name="limit" class="form-control">
                      <option value="20" ${filters.limit === '20' ? 'selected' : ''}>Top 20</option>
                      <option value="50" ${filters.limit === '50' ? 'selected' : ''}>Top 50</option>
                      <option value="100" ${filters.limit === '100' ? 'selected' : ''}>Top 100</option>
                      <option value="500" ${filters.limit === '500' ? 'selected' : ''}>Top 500</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>From Date</label>
                    <input type="date" name="fromDate" class="form-control" value="${escapeHtml(filters.fromDate)}">
                  </div>
                  <div class="form-group">
                    <label>To Date</label>
                    <input type="date" name="toDate" class="form-control" value="${escapeHtml(filters.toDate)}">
                  </div>
                  <div class="form-group">
                    <label>Client ID / Ref</label>
                    <input type="text" name="clientId" class="form-control" value="${escapeHtml(filters.clientId)}" placeholder="Ref ID / UUID">
                  </div>
                  <div class="form-group">
                    <label>Operator</label>
                    <select name="operatorId" class="form-control">
                      <option value="">All Operators</option>
                      ${operatorsRes.rows.map(o => `<option value="${o.id}" ${filters.operatorId === o.id ? 'selected' : ''}>${escapeHtml(o.operator_name)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Circle</label>
                    <select name="circle" class="form-control">
                      ${CIRCLES.map(c => `<option value="${c}" ${filters.circle === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Status</label>
                    <select name="status" class="form-control">
                      <option value="">All Status</option>
                      <option value="successful" ${filters.status === 'successful' ? 'selected' : ''}>Successful</option>
                      <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>Pending</option>
                      <option value="failed" ${filters.status === 'failed' ? 'selected' : ''}>Failed</option>
                      <option value="refunded" ${filters.status === 'refunded' ? 'selected' : ''}>Refunded</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Mobile Number</label>
                    <input type="text" name="mobile" class="form-control" value="${escapeHtml(filters.mobile)}" placeholder="10-digit number" maxlength="15">
                  </div>
                  <div class="form-group">
                    <label>Amount (₹)</label>
                    <input type="number" name="amount" class="form-control" value="${escapeHtml(filters.amount)}" placeholder="e.g. 299" step="any">
                  </div>
                </div>

                <div class="filter-btn-group">
                  <a href="/admin/reports/recharge-report" class="btn btn-sm btn-outline-secondary">
                    <i class="fa fa-refresh mr-1"></i> Reset
                  </a>
                  <button type="submit" class="btn btn-sm btn-primary font-weight-bold px-4">
                    <i class="fa fa-search mr-1"></i> Search Orders
                  </button>
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
                      <th style="width: 40px;">#</th>
                      <th>Recharge ID</th>
                      <th>Date Time (Sec)</th>
                      <th>Buyer Name</th>
                      <th>Seller Name</th>
                      <th>Operator</th>
                      <th>Circle</th>
                      <th>Mobile No.</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Ope ID</th>
                      <th>Supplier ID</th>
                      <th>Client ID</th>
                      <th class="text-center" style="min-width: 250px;">Action</th>
                    </tr>
                  </thead>
                  <tbody id="rechargeTableBody">
                    ${tableRows}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  </div>

  ${renderModalsHtml()}
  ${renderScriptsHtml({ isLive: false })}
</body>
</html>`;

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/reports/recharge-report' }));
  }

  /**
   * 2. GET /admin/reports/pending-recharge - Pending Recharge Report Page
   * "same to same as recharge report open hoga with all filter but usme filter me status by default pending set hoga aur niche table me only jo recharge pending hai bas wahi show hoga"
   */
  async function sendAdminPendingRechargeReportPage(admin, response, searchParams) {
    const today = getTodayString();

    const statusParam = searchParams.get('status');
    const effectiveStatus = statusParam !== null ? String(statusParam).trim().toLowerCase() : 'pending';

    const filters = {
      limit: ['20', '50', '100', '500'].includes(searchParams.get('limit')) ? searchParams.get('limit') : '20',
      fromDate: String(searchParams.get('fromDate') || today).trim(),
      toDate: String(searchParams.get('toDate') || today).trim(),
      clientId: String(searchParams.get('clientId') || '').trim(),
      operatorId: String(searchParams.get('operatorId') || '').trim(),
      circle: String(searchParams.get('circle') || '').trim(),
      status: effectiveStatus,
      mobile: String(searchParams.get('mobile') || '').trim().replace(/\D/g, ''),
      amount: String(searchParams.get('amount') || '').trim(),
    };

    // Fetch operators list for filter dropdown
    const operatorsRes = await db.query(
      "SELECT id, operator_name, service_type, operator_code FROM operator_definitions WHERE deleted_at IS NULL ORDER BY operator_name ASC",
    );

    // Build SQL query conditions
    const conditions = [];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (filters.fromDate) {
      conditions.push(`r.created_at >= (${add(filters.fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (filters.toDate) {
      conditions.push(`r.created_at < (((${add(filters.toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (filters.clientId) {
      conditions.push(`(r.idempotency_key ILIKE ${add(`%${filters.clientId}%`)} OR r.id::text ILIKE ${add(`%${filters.clientId}%`)})`);
    }

    if (filters.status && ['successful', 'pending', 'failed', 'refunded'].includes(filters.status)) {
      if (filters.status === 'pending') {
        conditions.push(`r.status IN ('pending', 'processing')`);
      } else {
        conditions.push(`r.status = ${add(filters.status)}`);
      }
    } else if (!statusParam) {
      // Default to pending
      conditions.push(`r.status IN ('pending', 'processing')`);
    }

    if (filters.operatorId && UUID_REGEX.test(filters.operatorId)) {
      conditions.push(`r.operator_id = ${add(filters.operatorId)}`);
    }
    if (filters.circle && filters.circle !== 'All' && CIRCLES.includes(filters.circle)) {
      conditions.push(`r.circle_name = ${add(filters.circle)}`);
    }
    if (filters.mobile) {
      conditions.push(`(r.mobile_number LIKE ${add(`%${filters.mobile}%`)} OR r.provider_reference LIKE ${add(`%${filters.mobile}%`)})`);
    }
    if (filters.amount && !isNaN(Number(filters.amount))) {
      const amtMinor = BigInt(Math.round(Number(filters.amount) * 100));
      conditions.push(`r.amount_minor = ${add(amtMinor)}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = searchParams.get('download') === 'csv' ? 'LIMIT 2000' : `LIMIT ${Number(filters.limit)}`;

    const query = `
      SELECT r.id, r.user_id, r.seller_user_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.operator_code, r.circle_name, r.amount_minor, r.margin_minor,
             r.cost_minor, r.seller_margin_minor, r.status, r.idempotency_key, r.provider_reference,
             r.response_payload, r.with_gst, r.dispute_status, r.dispute_reason, r.dispute_resolution_note,
             r.created_at, r.updated_at,
             u_buyer.username AS buyer_username, u_buyer.name AS buyer_name,
             u_seller.username AS seller_username, u_seller.name AS seller_name
      FROM recharge_orders r
      LEFT JOIN users u_buyer ON u_buyer.id = r.user_id
      LEFT JOIN users u_seller ON u_seller.id = r.seller_user_id
      ${whereClause}
      ORDER BY r.created_at DESC
      ${limitClause}
    `;

    const result = await db.query(query, values);

    // CSV Download
    if (searchParams.get('download') === 'csv') {
      return streamCsv(result.rows, response, 'pending-recharge-report');
    }

    // KPI Counters
    let pendingCount = 0;
    let totalAmtMinor = 0n;

    for (const row of result.rows) {
      const amtMinor = BigInt(row.amount_minor || '0');
      totalAmtMinor += amtMinor;
      if (row.status === 'pending' || row.status === 'processing') {
        pendingCount++;
      }
    }

    const tableRows = renderTableRows(result.rows);
    const downloadParams = new URLSearchParams(searchParams);
    downloadParams.set('download', 'csv');
    const downloadUrl = `/admin/reports/pending-recharge?${downloadParams.toString()}`;
    const navigation = renderAdminNavigation('/admin/reports/pending-recharge');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pending Recharge Report - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>${COMMON_REPORT_CSS}</style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      
      <main class="main-content">
        <div class="container-fluid px-3 py-3">

          <!-- Header -->
          <div class="page-title-box">
            <div>
              <h4 class="font-weight-bold text-dark mb-1">
                <i class="fa fa-clock-o text-warning mr-2"></i> Pending Recharge Report
              </h4>
              <p class="text-muted small mb-0">View, track and resolve all live transactions currently in pending / processing status.</p>
            </div>
            <div class="d-flex" style="gap: 8px;">
              <a href="${downloadUrl}" class="btn btn-sm btn-success font-weight-bold shadow-sm" id="btnDownload">
                <i class="fa fa-download mr-1"></i> Download CSV
              </a>
              <button class="btn btn-sm btn-outline-primary" onclick="location.reload()">
                <i class="fa fa-refresh mr-1"></i> Refresh
              </button>
            </div>
          </div>

          <!-- Summary Stats -->
          <div class="row mb-3">
            <div class="col-6 col-md-4 mb-2">
              <div class="summary-card border-left border-warning" style="border-left-width: 4px !important;">
                <h6>Pending Transactions</h6>
                <h4 class="text-warning">${result.rowCount}</h4>
              </div>
            </div>
            <div class="col-6 col-md-4 mb-2">
              <div class="summary-card border-left border-primary" style="border-left-width: 4px !important;">
                <h6>Pending Volume</h6>
                <h4 class="text-primary">₹${(Number(totalAmtMinor)/100).toFixed(2)}</h4>
              </div>
            </div>
            <div class="col-12 col-md-4 mb-2">
              <div class="summary-card border-left border-info" style="border-left-width: 4px !important;">
                <h6>Filter Active</h6>
                <h4 class="text-info" style="font-size:16px;">Status: <span class="badge badge-warning text-white">PENDING (Default)</span></h4>
              </div>
            </div>
          </div>

          <!-- Filter Form (Status selected as Pending by default) -->
          <div class="card card-filter">
            <div class="card-body">
              <form method="GET" action="/admin/reports/pending-recharge" id="filterForm">
                <div class="filter-grid">
                  <div class="form-group">
                    <label>Top Entries</label>
                    <select name="limit" class="form-control">
                      <option value="20" ${filters.limit === '20' ? 'selected' : ''}>Top 20</option>
                      <option value="50" ${filters.limit === '50' ? 'selected' : ''}>Top 50</option>
                      <option value="100" ${filters.limit === '100' ? 'selected' : ''}>Top 100</option>
                      <option value="500" ${filters.limit === '500' ? 'selected' : ''}>Top 500</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>From Date</label>
                    <input type="date" name="fromDate" class="form-control" value="${escapeHtml(filters.fromDate)}">
                  </div>
                  <div class="form-group">
                    <label>To Date</label>
                    <input type="date" name="toDate" class="form-control" value="${escapeHtml(filters.toDate)}">
                  </div>
                  <div class="form-group">
                    <label>Client ID / Ref</label>
                    <input type="text" name="clientId" class="form-control" value="${escapeHtml(filters.clientId)}" placeholder="Ref ID / UUID">
                  </div>
                  <div class="form-group">
                    <label>Operator</label>
                    <select name="operatorId" class="form-control">
                      <option value="">All Operators</option>
                      ${operatorsRes.rows.map(o => `<option value="${o.id}" ${filters.operatorId === o.id ? 'selected' : ''}>${escapeHtml(o.operator_name)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Circle</label>
                    <select name="circle" class="form-control">
                      ${CIRCLES.map(c => `<option value="${c}" ${filters.circle === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Status</label>
                    <select name="status" class="form-control font-weight-bold">
                      <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>Pending (Default)</option>
                      <option value="successful" ${filters.status === 'successful' ? 'selected' : ''}>Successful</option>
                      <option value="failed" ${filters.status === 'failed' ? 'selected' : ''}>Failed</option>
                      <option value="refunded" ${filters.status === 'refunded' ? 'selected' : ''}>Refunded</option>
                      <option value="" ${filters.status === '' ? 'selected' : ''}>All Status</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Mobile Number</label>
                    <input type="text" name="mobile" class="form-control" value="${escapeHtml(filters.mobile)}" placeholder="10-digit number" maxlength="15">
                  </div>
                  <div class="form-group">
                    <label>Amount (₹)</label>
                    <input type="number" name="amount" class="form-control" value="${escapeHtml(filters.amount)}" placeholder="e.g. 299" step="any">
                  </div>
                </div>

                <div class="filter-btn-group">
                  <a href="/admin/reports/pending-recharge" class="btn btn-sm btn-outline-secondary">
                    <i class="fa fa-refresh mr-1"></i> Reset
                  </a>
                  <button type="submit" class="btn btn-sm btn-warning font-weight-bold px-4 text-dark">
                    <i class="fa fa-search mr-1"></i> Search Pending Orders
                  </button>
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
                      <th style="width: 40px;">#</th>
                      <th>Recharge ID</th>
                      <th>Date Time (Sec)</th>
                      <th>Buyer Name</th>
                      <th>Seller Name</th>
                      <th>Operator</th>
                      <th>Circle</th>
                      <th>Mobile No.</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Ope ID</th>
                      <th>Supplier ID</th>
                      <th>Client ID</th>
                      <th class="text-center" style="min-width: 250px;">Action</th>
                    </tr>
                  </thead>
                  <tbody id="rechargeTableBody">
                    ${tableRows}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  </div>

  ${renderModalsHtml()}
  ${renderScriptsHtml({ isLive: false })}
</body>
</html>`;

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/reports/pending-recharge' }));
  }

  /**
   * 3. GET /admin/reports/live-recharge - Live Auto-Refreshing Recharge Report
   * "ooper koi filter show nahi hoga aur sirf only table show hogi aur ye page without any touch automatic every 10 second me refresh hota rahega jisse latest txn apne aap show ho"
   */
  async function sendAdminLiveRechargeReportPage(admin, response, searchParams) {
    const query = `
      SELECT r.id, r.user_id, r.seller_user_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.operator_code, r.circle_name, r.amount_minor, r.margin_minor,
             r.cost_minor, r.seller_margin_minor, r.status, r.idempotency_key, r.provider_reference,
             r.response_payload, r.with_gst, r.dispute_status, r.dispute_reason, r.dispute_resolution_note,
             r.created_at, r.updated_at,
             u_buyer.username AS buyer_username, u_buyer.name AS buyer_name,
             u_seller.username AS seller_username, u_seller.name AS seller_name
      FROM recharge_orders r
      LEFT JOIN users u_buyer ON u_buyer.id = r.user_id
      LEFT JOIN users u_seller ON u_seller.id = r.seller_user_id
      ORDER BY r.created_at DESC
      LIMIT 50
    `;
    const result = await db.query(query);

    // KPI Counters for today
    const statsRes = await db.query(`
      SELECT 
        COUNT(*) AS total_count,
        COALESCE(SUM(amount_minor), 0) AS total_minor,
        COUNT(*) FILTER (WHERE status = 'successful') AS success_count,
        COALESCE(SUM(amount_minor) FILTER (WHERE status = 'successful'), 0) AS success_minor,
        COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) AS pending_count,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
      FROM recharge_orders
      WHERE created_at >= (CURRENT_DATE::timestamp AT TIME ZONE 'Asia/Kolkata')
    `);
    const stats = statsRes.rows[0] || {};

    const tableRows = renderTableRows(result.rows);
    const nowTime = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    const navigation = renderAdminNavigation('/admin/reports/live-recharge');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Live Recharge Report - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    ${COMMON_REPORT_CSS}
    .live-top-banner {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #fff;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.08);
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      
      <main class="main-content">
        <div class="container-fluid px-3 py-3">

          <!-- Live Top Banner (No Filter Form) -->
          <div class="live-top-banner">
            <div>
              <div class="d-flex align-items-center mb-1">
                <span class="badge badge-success px-3 py-1 font-weight-bold pulse-badge mr-2" id="livePulseBadge" style="background:#10b981;font-size:12px;border-radius:20px;">
                  <span class="spinner-grow spinner-grow-sm mr-1" role="status" style="width:7px;height:7px;"></span> LIVE STREAM
                </span>
                <h4 class="mb-0 font-weight-bold text-white">Live Recharge Report</h4>
              </div>
              <p class="text-white-50 mb-0 small">
                Live real-time transaction board auto-refreshing every 10 seconds (Real-time Transaction Feed).
              </p>
            </div>
            <div class="d-flex align-items-center flex-wrap" style="gap: 10px;">
              <div class="bg-dark px-3 py-2 rounded border border-secondary text-white small d-flex align-items-center">
                <i class="fa fa-refresh fa-spin text-warning mr-2"></i> Auto-refresh in: <strong id="autoRefreshCountdown" class="text-warning ml-1" style="font-size:14px;">10s</strong>
              </div>
              <div class="bg-dark px-3 py-2 rounded border border-secondary text-white small d-flex align-items-center">
                <i class="fa fa-clock-o text-info mr-2"></i> Updated: <span id="liveLastUpdated" class="text-light ml-1 font-weight-bold">${nowTime}</span>
              </div>
              <button type="button" id="btnManualRefresh" class="btn btn-sm btn-primary font-weight-bold shadow-sm px-3">
                <i class="fa fa-refresh mr-1"></i> Refresh Now
              </button>
            </div>
          </div>

          <!-- Summary Stats for Today -->
          <div class="row mb-3">
            <div class="col-6 col-md-3 mb-2">
              <div class="summary-card border-left border-primary" style="border-left-width: 4px !important;">
                <h6>Total Today Txns</h6>
                <h4 class="text-primary" id="kpiTotalCount">${stats.total_count || 0} <small class="text-muted" style="font-size:13px;">(₹${(Number(stats.total_minor || 0)/100).toFixed(2)})</small></h4>
              </div>
            </div>
            <div class="col-6 col-md-3 mb-2">
              <div class="summary-card border-left border-success" style="border-left-width: 4px !important;">
                <h6>Successful Today</h6>
                <h4 class="text-success" id="kpiSuccessCount">${stats.success_count || 0} <small class="text-muted" style="font-size:13px;">(₹${(Number(stats.success_minor || 0)/100).toFixed(2)})</small></h4>
              </div>
            </div>
            <div class="col-6 col-md-3 mb-2">
              <div class="summary-card border-left border-warning" style="border-left-width: 4px !important;">
                <h6>Pending Orders</h6>
                <h4 class="text-warning" id="kpiPendingCount">${stats.pending_count || 0}</h4>
              </div>
            </div>
            <div class="col-6 col-md-3 mb-2">
              <div class="summary-card border-left border-danger" style="border-left-width: 4px !important;">
                <h6>Failed Today</h6>
                <h4 class="text-danger" id="kpiFailedCount">${stats.failed_count || 0}</h4>
              </div>
            </div>
          </div>

          <!-- Live Table Card (Direct Table, No Filter) -->
          <div class="card shadow-sm border-0">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <h6 class="mb-0 font-weight-bold text-dark">
                <i class="fa fa-bolt text-warning mr-1"></i> Latest Incoming Recharges (Latest 50 Feed)
              </h6>
              <span class="badge badge-light border text-muted px-2 py-1 small">Automatic Live Polling: Active</span>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-bordered table-hover table-striped table-recharge mb-0">
                  <thead>
                    <tr>
                      <th style="width: 40px;">#</th>
                      <th>Recharge ID</th>
                      <th>Date Time (Sec)</th>
                      <th>Buyer Name</th>
                      <th>Seller Name</th>
                      <th>Operator</th>
                      <th>Circle</th>
                      <th>Mobile No.</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Ope ID</th>
                      <th>Supplier ID</th>
                      <th>Client ID</th>
                      <th class="text-center" style="min-width: 250px;">Action</th>
                    </tr>
                  </thead>
                  <tbody id="rechargeTableBody">
                    ${tableRows}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  </div>

  ${renderModalsHtml()}
  ${renderScriptsHtml({ isLive: true })}
</body>
</html>`;

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(await addPanelChrome(html, { role: 'admin', currentPath: '/admin/reports/live-recharge' }));
  }

  /**
   * 4. GET /api/admin/reports/live-recharge/data - 10-Second Auto-Refresh API for Live Table
   */
  async function handleGetLiveRechargeData(request, response) {
    const query = `
      SELECT r.id, r.user_id, r.seller_user_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.operator_code, r.circle_name, r.amount_minor, r.margin_minor,
             r.cost_minor, r.seller_margin_minor, r.status, r.idempotency_key, r.provider_reference,
             r.response_payload, r.with_gst, r.dispute_status, r.dispute_reason, r.dispute_resolution_note,
             r.created_at, r.updated_at,
             u_buyer.username AS buyer_username, u_buyer.name AS buyer_name,
             u_seller.username AS seller_username, u_seller.name AS seller_name
      FROM recharge_orders r
      LEFT JOIN users u_buyer ON u_buyer.id = r.user_id
      LEFT JOIN users u_seller ON u_seller.id = r.seller_user_id
      ORDER BY r.created_at DESC
      LIMIT 50
    `;
    const result = await db.query(query);

    const statsRes = await db.query(`
      SELECT 
        COUNT(*) AS total_count,
        COALESCE(SUM(amount_minor), 0) AS total_minor,
        COUNT(*) FILTER (WHERE status = 'successful') AS success_count,
        COALESCE(SUM(amount_minor) FILTER (WHERE status = 'successful'), 0) AS success_minor,
        COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) AS pending_count,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
      FROM recharge_orders
      WHERE created_at >= (CURRENT_DATE::timestamp AT TIME ZONE 'Asia/Kolkata')
    `);
    const stats = statsRes.rows[0] || {};

    const tableRows = renderTableRows(result.rows);
    const nowTime = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

    sendJson(response, 200, {
      ok: true,
      tableRows,
      totalCount: Number(stats.total_count || 0),
      totalAmtFormatted: (Number(stats.total_minor || 0) / 100).toFixed(2),
      successCount: Number(stats.success_count || 0),
      successAmtFormatted: (Number(stats.success_minor || 0) / 100).toFixed(2),
      pendingCount: Number(stats.pending_count || 0),
      failedCount: Number(stats.failed_count || 0),
      lastUpdated: nowTime,
    });
  }

  /**
   * Helper to stream CSV
   */
  function streamCsv(rows, response, filenamePrefix) {
    const csvHeader = [
      'Recharge ID',
      'Date Time (IST)',
      'Duration (Sec)',
      'Buyer Name',
      'Buyer ID',
      'Seller Name',
      'Seller ID',
      'Operator',
      'Circle',
      'Mobile Number',
      'Amount',
      'Status',
      'Ope ID',
      'Supplier ID',
      'Client ID',
      'Dispute Status',
    ].join(',') + '\r\n';

    const csvRows = rows.map((row) => {
      let mobile = row.mobile_number || '';
      if (!mobile && row.mobile_ciphertext && decryptMobile) {
        try { mobile = decryptMobile(row.mobile_ciphertext); } catch (_) { mobile = 'Hidden'; }
      }
      const payload = typeof row.response_payload === 'object' && row.response_payload !== null ? row.response_payload : {};
      let durationSec = '1.0s';
      if (payload.duration_ms) {
        durationSec = (Number(payload.duration_ms) / 1000).toFixed(1) + 's';
      } else if (row.updated_at && row.created_at) {
        const diffMs = Math.max(500, new Date(row.updated_at).getTime() - new Date(row.created_at).getTime());
        durationSec = (diffMs / 1000).toFixed(1) + 's';
      }
      const supplierId = payload.supplierTxnId || payload.txnid || payload.operatorTxnId || '';
      const opeId = row.provider_reference || '';
      const amountFormatted = (Number(row.amount_minor || 0) / 100).toFixed(2);

      const sanitize = (val) => `"${String(val || '').replace(/"/g, '""')}"`;

      return [
        sanitize('RCH-' + row.id.slice(0, 8).toUpperCase()),
        sanitize(formatDateTime(row.created_at)),
        sanitize(durationSec),
        sanitize(row.buyer_name || row.buyer_username || ''),
        sanitize(row.user_id),
        sanitize(row.seller_name || row.seller_username || 'Direct'),
        sanitize(row.seller_user_id || ''),
        sanitize(row.operator_name || row.operator_code || ''),
        sanitize(row.circle_name || 'All'),
        sanitize(mobile),
        sanitize(amountFormatted),
        sanitize(row.status.toUpperCase()),
        sanitize(opeId),
        sanitize(supplierId),
        sanitize(row.idempotency_key || ''),
        sanitize(row.dispute_status || 'none'),
      ].join(',');
    }).join('\r\n');

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filenamePrefix}-${getTodayString()}.csv"`,
      'cache-control': 'no-store',
    });
    response.end(csvHeader + csvRows);
  }

  /**
   * POST /api/admin/recharge-report/mark-failed - Fail a successful recharge and refund buyer
   */
  async function handleMarkFailed(request, response, input, admin) {
    const orderId = String(input.orderId || '').trim();
    const reason = String(input.reason || 'Failed by Administrator').trim();
    if (!orderId) throw httpError('Order ID is required.', 400);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const orderRes = await client.query(
        `SELECT id, user_id, seller_user_id, seller_api_id, amount_minor, cost_minor, margin_minor, seller_margin_minor,
                mobile_number, status, response_payload
         FROM recharge_orders
         WHERE id = $1 FOR UPDATE`,
        [orderId],
      );
      if (!orderRes.rowCount) throw httpError('Transaction not found.', 404);
      const order = orderRes.rows[0];

      if (order.status !== 'successful') {
        throw httpError('Only successful transactions can be marked as failed.', 400);
      }

      const buyerId = order.user_id;
      const refundAmountMinor = BigInt(order.cost_minor || order.amount_minor || '0');

      const walletMode = await getWalletMode(client);
      const isSeparate = (walletMode === 'separate');

      // 1. Credit refund to Buyer's wallet
      const buyerWalletRes = await client.query(
        "SELECT id, balance_minor, buyer_balance_minor, seller_balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR' FOR UPDATE",
        [buyerId],
      );
      if (!buyerWalletRes.rowCount) throw httpError('Buyer wallet not found.', 404);
      const buyerWallet = buyerWalletRes.rows[0];

      if (isSeparate) {
        const newBuyerBal = BigInt(buyerWallet.buyer_balance_minor || 0) + refundAmountMinor;
        await client.query(
          "UPDATE wallets SET buyer_balance_minor = $1, balance_minor = balance_minor + $2, updated_at = now() WHERE id = $3",
          [newBuyerBal, refundAmountMinor, buyerWallet.id],
        );
      } else {
        const newBuyerBal = BigInt(buyerWallet.balance_minor || 0) + refundAmountMinor;
        await client.query(
          "UPDATE wallets SET balance_minor = $1, buyer_balance_minor = buyer_balance_minor + $2, updated_at = now() WHERE id = $3",
          [newBuyerBal, refundAmountMinor, buyerWallet.id],
        );
      }

      await client.query(
        `INSERT INTO wallet_entries (
           wallet_id, user_id, amount_minor, entry_type, reference_type, reference_id, idempotency_key, description
         ) VALUES (
           $1, $2, $3, 'refund', 'admin_failed_refund', $4, $5, $6
         ) ON CONFLICT (wallet_id, idempotency_key) DO NOTHING`,
        [
          buyerWallet.id, buyerId, refundAmountMinor, order.id,
          `adm_fail_ref_${order.id}`, `Refund for Failed Recharge (${order.mobile_number || ''})`,
        ],
      );

      // 2. Debit credited amount from Seller's wallet if seller was credited
      if (order.seller_user_id) {
        const amtMinor = BigInt(order.amount_minor || '0');
        const sellerMarginMinor = BigInt(order.seller_margin_minor || '0');
        const sellerCreditMinor = amtMinor > sellerMarginMinor ? amtMinor - sellerMarginMinor : 0n;

        if (sellerCreditMinor > 0n) {
          const sellerWalletRes = await client.query(
            "SELECT id, balance_minor, buyer_balance_minor, seller_balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR' FOR UPDATE",
            [order.seller_user_id],
          );
          if (sellerWalletRes.rowCount > 0) {
            const sellerWallet = sellerWalletRes.rows[0];
            if (isSeparate) {
              const newSellerBal = BigInt(sellerWallet.seller_balance_minor || 0) - sellerCreditMinor;
              await client.query(
                "UPDATE wallets SET seller_balance_minor = GREATEST(0, $1), balance_minor = GREATEST(0, balance_minor - $2), updated_at = now() WHERE id = $3",
                [newSellerBal, sellerCreditMinor, sellerWallet.id],
              );
            } else {
              const newSellerBal = BigInt(sellerWallet.balance_minor || 0) - sellerCreditMinor;
              await client.query(
                "UPDATE wallets SET balance_minor = GREATEST(0, $1), seller_balance_minor = GREATEST(0, seller_balance_minor - $2), updated_at = now() WHERE id = $3",
                [newSellerBal, sellerCreditMinor, sellerWallet.id],
              );
            }
            await client.query(
              `INSERT INTO wallet_entries (
                 wallet_id, user_id, amount_minor, entry_type, reference_type, reference_id, idempotency_key, description
               ) VALUES (
                 $1, $2, $3, 'debit', 'seller_failed_reversal', $4, $5, $6
               ) ON CONFLICT (wallet_id, idempotency_key) DO NOTHING`,
              [
                sellerWallet.id, order.seller_user_id, sellerCreditMinor, order.id,
                `adm_fail_rev_${order.id}`, `Reversal for Failed Recharge (${order.mobile_number || ''})`,
              ],
            );
          }
        }
      }

      // 3. Update order status to failed / refunded
      const updatedPayload = typeof order.response_payload === 'object' && order.response_payload !== null
        ? order.response_payload
        : {};
      updatedPayload.admin_failed_by = admin.id;
      updatedPayload.admin_failed_at = new Date().toISOString();
      updatedPayload.admin_failed_reason = reason;

      await client.query(
        `UPDATE recharge_orders
         SET status = 'failed', dispute_status = 'accepted', dispute_resolution_note = $1,
             response_payload = $2, updated_at = now()
         WHERE id = $3`,
        [reason, JSON.stringify(updatedPayload), order.id],
      );

      if (order.seller_user_id) {
        await applyDisputeRefundPenalty(client, {
          orderId: order.id,
          sellerId: order.seller_user_id,
          rechargeAmountMinor: order.amount_minor,
          reason,
        }).catch(() => {});
      }

      await client.query('COMMIT');
      if (order.seller_api_id) {
        checkAndSuspendSellerApiOnDailyRefund(db, order.seller_api_id).catch(() => {});
      }
      sendJson(response, 200, { ok: true, message: 'Transaction marked as failed and buyer wallet refunded successfully.' });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * POST /api/admin/recharge-report/update-ope-id - Update operator reference ID
   */
  async function handleUpdateOpeId(request, response, input) {
    const orderId = String(input.orderId || '').trim();
    const opeId = String(input.opeId || '').trim();
    if (!orderId) throw httpError('Order ID is required.', 400);

    const updateRes = await db.query(
      `UPDATE recharge_orders
       SET provider_reference = $1, updated_at = now()
       WHERE id = $2 RETURNING id, provider_reference`,
      [opeId || null, orderId],
    );

    if (!updateRes.rowCount) throw httpError('Transaction not found.', 404);
    sendJson(response, 200, { ok: true, message: 'Operator ID updated successfully.', opeId });
  }

  /**
   * POST /api/admin/recharge-report/resend-callback - Resend callback webhook to buyer
   */
  async function handleResendCallback(request, response, input) {
    const orderId = String(input.orderId || '').trim();
    if (!orderId) throw httpError('Order ID is required.', 400);

    const orderRes = await db.query(
      `SELECT r.id, r.user_id, r.status, r.idempotency_key, r.operator_code, r.mobile_number,
              r.amount_minor, r.provider_reference, r.response_payload, u.callback_url
       FROM recharge_orders r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = $1`,
      [orderId],
    );

    if (!orderRes.rowCount) throw httpError('Transaction not found.', 404);
    const order = orderRes.rows[0];

    if (!order.callback_url) {
      throw httpError('Buyer has not configured a Callback URL in their Settings.', 400);
    }

    try {
      const urlObj = new URL(order.callback_url);
      urlObj.searchParams.set('status', order.status === 'successful' ? 'SUCCESS' : (order.status === 'pending' ? 'PENDING' : 'FAILURE'));
      urlObj.searchParams.set('recharge_id', order.id);
      urlObj.searchParams.set('ref_id', order.idempotency_key);
      urlObj.searchParams.set('operator', order.operator_code || '');
      urlObj.searchParams.set('number', order.mobile_number || '');
      urlObj.searchParams.set('amount', (Number(order.amount_minor) / 100).toFixed(2));
      urlObj.searchParams.set('operator_ref', order.provider_reference || '');
      urlObj.searchParams.set('statuscode', order.status === 'successful' ? '0' : (order.status === 'pending' ? '1' : '2'));

      const cbRes = await fetch(urlObj.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });

      sendJson(response, 200, {
        ok: true,
        message: `Callback sent to ${order.callback_url} (HTTP ${cbRes.status} ${cbRes.statusText})`,
      });
    } catch (cbErr) {
      throw httpError(`Callback delivery failed: ${cbErr.message}`, 502);
    }
  }

  /**
   * GET /api/admin/recharge-report/log - Retrieve complete raw log for a transaction
   */
  async function handleGetLog(request, response, url) {
    const orderId = String(url.searchParams.get('orderId') || '').trim();
    if (!orderId) throw httpError('Order ID is required.', 400);

    const orderRes = await db.query(
      `SELECT r.id, r.user_id, r.seller_user_id, r.mobile_number, r.mobile_ciphertext,
              r.operator_name, r.operator_code, r.circle_name, r.amount_minor, r.margin_minor,
              r.cost_minor, r.seller_margin_minor, r.status, r.idempotency_key, r.provider_reference,
              r.response_payload, r.with_gst, r.dispute_status, r.dispute_reason, r.dispute_resolution_note,
              r.created_at, r.updated_at,
              u_buyer.username AS buyer_username, u_buyer.name AS buyer_name,
              u_seller.username AS seller_username, u_seller.name AS seller_name
       FROM recharge_orders r
       LEFT JOIN users u_buyer ON u_buyer.id = r.user_id
       LEFT JOIN users u_seller ON u_seller.id = r.seller_user_id
       WHERE r.id = $1`,
      [orderId],
    );

    if (!orderRes.rowCount) throw httpError('Transaction not found.', 404);
    const row = orderRes.rows[0];

    let mobile = row.mobile_number || '';
    if (!mobile && row.mobile_ciphertext && decryptMobile) {
      try { mobile = decryptMobile(row.mobile_ciphertext); } catch (_) { mobile = '••••••••••'; }
    }

    const payload = typeof row.response_payload === 'object' && row.response_payload !== null ? row.response_payload : {};
    let durationSec = '0.0s';
    if (payload.duration_ms) {
      durationSec = (Number(payload.duration_ms) / 1000).toFixed(1) + 's';
    } else if (row.updated_at && row.created_at) {
      const diffMs = Math.max(0, new Date(row.updated_at).getTime() - new Date(row.created_at).getTime());
      durationSec = (diffMs / 1000).toFixed(1) + 's';
    }

    sendJson(response, 200, {
      ok: true,
      log: {
        id: row.id,
        idempotency_key: row.idempotency_key,
        mobile,
        operator_name: row.operator_name,
        operator_code: row.operator_code,
        amount_minor: row.amount_minor,
        status: row.status,
        provider_reference: row.provider_reference,
        buyer_username: row.buyer_username,
        buyer_name: row.buyer_name,
        seller_username: row.seller_username,
        seller_name: row.seller_name,
        created_at: formatDateTime(row.created_at),
        updated_at: formatDateTime(row.updated_at),
        duration_sec: durationSec,
        response_payload: payload,
      },
    });
  }

  /**
   * POST /api/admin/recharge-report/raise-dispute - Record admin dispute
   */
  async function handleRaiseDispute(request, response, input, admin) {
    const orderId = String(input.orderId || '').trim();
    const reason = String(input.reason || '').trim();
    if (!orderId) throw httpError('Order ID is required.', 400);
    if (!reason) throw httpError('Dispute reason is required.', 400);

    const orderRes = await db.query(
      'SELECT id, user_id, seller_user_id, status FROM recharge_orders WHERE id = $1',
      [orderId],
    );
    if (!orderRes.rowCount) throw httpError('Transaction not found.', 404);
    const order = orderRes.rows[0];

    const dispCode = 'DSP-' + order.id.slice(0, 8).toUpperCase();
    await db.query(
      `UPDATE recharge_orders
       SET dispute_status = 'pending', dispute_reason = $1, dispute_created_at = now(), updated_at = now()
       WHERE id = $2`,
      [reason, order.id],
    );

    await db.query(
      `INSERT INTO recharge_disputes (
         order_id, buyer_id, seller_id, dispute_code, reason, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'pending', now(), now())
       ON CONFLICT DO NOTHING`,
      [order.id, order.user_id, order.seller_user_id, dispCode, reason],
    ).catch(() => {});

    if (order.seller_user_id) {
      await holdDisputeLien(db, {
        orderId: order.id,
        sellerId: order.seller_user_id,
        rechargeAmountMinor: order.amount_minor,
      }).catch(() => {});
    }

    sendJson(response, 200, { ok: true, message: 'Dispute recorded successfully.', disputeCode: dispCode });
  }

  return {
    sendAdminRechargeReportPage,
    sendAdminPendingRechargeReportPage,
    sendAdminLiveRechargeReportPage,
    handleGetLiveRechargeData,
    handleMarkFailed,
    handleUpdateOpeId,
    handleResendCallback,
    handleGetLog,
    handleRaiseDispute,
  };
};
