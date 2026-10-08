'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { renderAdminNavigation } = require('../config/admin-panel-menu');
const { addPanelChrome } = require('../lib/panel-chrome');

const CIRCLES = [
  'All', 'Andhra Pradesh', 'Assam', 'Bihar & Jharkhand', 'Chennai', 'Delhi', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jammu Kashmir', 'Karnataka', 'Kerala', 'Kolkata',
  'Maharashtra & Goa', 'Mumbai', 'North East', 'Orissa', 'Punjab', 'Rajasthan',
  'Tamil Nadu', 'UP East', 'UP West', 'West Bengal',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = function createAdminRechargeLogPage({
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
   * Stream filtered recharge logs as CSV
   */
  function streamCsv(rows, response) {
    const csvHeader = [
      'Order ID',
      'Client Ref ID',
      'Received Date Time (IST)',
      'Buyer Username',
      'Inbound Endpoint',
      'Seller Username',
      'Seller API Name',
      'Target Outbound URL',
      'Mobile Number',
      'Operator',
      'Circle',
      'Amount (INR)',
      'Duration (Sec)',
      'Rehit Count',
      'Supplier Txn ID',
      'Operator Txn ID',
      'Final Status',
      'Dispute Status',
      'Dispute Reason',
    ].join(',') + '\r\n';

    const csvRows = rows.map((row) => {
      let mobile = row.mobile_number || '';
      if (!mobile && row.mobile_ciphertext && decryptMobile) {
        try { mobile = decryptMobile(row.mobile_ciphertext); } catch (_) { mobile = 'Hidden'; }
      }
      const payload = typeof row.response_payload === 'object' && row.response_payload !== null ? row.response_payload : {};

      const inboundReq = payload.inbound_request || {};
      const inboundUrl = inboundReq.url || '/api/recharge';

      const routingAttempts = Array.isArray(payload.routing_attempts) ? payload.routing_attempts : [];
      const rehitCount = Math.max(0, routingAttempts.length - 1);

      let targetUrl = '-';
      if (routingAttempts.length > 0) {
        targetUrl = routingAttempts[routingAttempts.length - 1].target_url || '-';
      } else if (payload.targetUrl) {
        targetUrl = payload.targetUrl;
      }

      let durationSec = '1.0s';
      if (payload.duration_ms) {
        durationSec = (Number(payload.duration_ms) / 1000).toFixed(1) + 's';
      } else if (row.updated_at && row.created_at) {
        const diffMs = Math.max(500, new Date(row.updated_at).getTime() - new Date(row.created_at).getTime());
        durationSec = (diffMs / 1000).toFixed(1) + 's';
      }

      const supplierId = payload.supplierTxnId || payload.txnid || payload.operatorTxnId || '-';
      const opeId = row.provider_reference || '-';
      const amtFormatted = (Number(row.amount_minor || 0) / 100).toFixed(2);

      const sanitize = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

      return [
        sanitize('RCH-' + row.id.slice(0, 8).toUpperCase()),
        sanitize(row.idempotency_key || ''),
        sanitize(formatDateTime(row.created_at)),
        sanitize(row.buyer_username || 'N/A'),
        sanitize(inboundUrl),
        sanitize(row.seller_username || 'Direct'),
        sanitize(row.seller_api_name || 'Internal Stock'),
        sanitize(targetUrl),
        sanitize(mobile),
        sanitize(row.operator_name || row.operator_code || ''),
        sanitize(row.circle_name || 'All'),
        sanitize(amtFormatted),
        sanitize(durationSec),
        sanitize(rehitCount),
        sanitize(supplierId),
        sanitize(opeId),
        sanitize(row.status.toUpperCase()),
        sanitize(row.dispute_status || 'none'),
        sanitize(row.dispute_reason || ''),
      ].join(',');
    }).join('\r\n');

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="recharge-log-${getTodayString()}.csv"`,
      'cache-control': 'no-store',
    });
    response.end('\uFEFF' + csvHeader + csvRows);
  }

  /**
   * Main Page Renderer: GET /admin/reports/recharge-log
   */
  async function sendAdminRechargeLogPage(admin, response, searchParams) {
    const filters = {
      fromDate: String(searchParams.get('fromDate') || '').trim(),
      toDate: String(searchParams.get('toDate') || '').trim(),
      status: String(searchParams.get('status') || '').trim().toLowerCase(),
      operatorId: String(searchParams.get('operatorId') || '').trim(),
      rehitOnly: String(searchParams.get('rehitOnly') || 'all').trim().toLowerCase(), // all, rehit, single
      disputeOnly: String(searchParams.get('disputeOnly') || 'all').trim().toLowerCase(), // all, yes, no
      search: String(searchParams.get('search') || '').trim().slice(0, 80),
      limit: Math.min(Math.max(parseInt(searchParams.get('limit') || '150', 10), 10), 1000),
    };

    // 1. Fetch Operators for filter
    const operatorsRes = await db.query(
      "SELECT id, operator_name, service_type, operator_code FROM operator_definitions WHERE status='active' AND deleted_at IS NULL ORDER BY service_type, operator_name"
    );
    const operatorsList = operatorsRes.rows;

    // 2. Build Query
    const conditions = [];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (filters.fromDate) {
      conditions.push(`r.created_at >= (${add(filters.fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (filters.toDate) {
      conditions.push(`r.created_at < (((${add(filters.toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
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
    if (filters.rehitOnly === 'rehit') {
      conditions.push(`(r.response_payload::text ILIKE '%attempt%' OR jsonb_array_length(COALESCE(r.response_payload->'routing_attempts', '[]'::jsonb)) > 1)`);
    } else if (filters.rehitOnly === 'single') {
      conditions.push(`(jsonb_array_length(COALESCE(r.response_payload->'routing_attempts', '[]'::jsonb)) <= 1)`);
    }
    if (filters.disputeOnly === 'yes') {
      conditions.push(`(r.dispute_status IS NOT NULL AND r.dispute_status <> 'none')`);
    } else if (filters.disputeOnly === 'no') {
      conditions.push(`(r.dispute_status IS NULL OR r.dispute_status = 'none')`);
    }
    if (filters.search) {
      conditions.push(`(
        r.mobile_number LIKE ${add(`%${filters.search}%`)}
        OR r.idempotency_key ILIKE ${add(`%${filters.search}%`)}
        OR r.id::text ILIKE ${add(`%${filters.search}%`)}
        OR r.provider_reference ILIKE ${add(`%${filters.search}%`)}
        OR u_buyer.username ILIKE ${add(`%${filters.search}%`)}
        OR u_seller.username ILIKE ${add(`%${filters.search}%`)}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const isCsvDownload = searchParams.get('download') === 'csv';
    const limitClause = isCsvDownload ? 'LIMIT 2000' : `LIMIT ${filters.limit}`;

    const query = `
      SELECT r.id, r.user_id, r.seller_user_id, r.seller_api_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.operator_code, r.circle_name, r.amount_minor, r.margin_minor,
             r.cost_minor, r.seller_margin_minor, r.status, r.idempotency_key, r.provider_reference,
             r.response_payload, r.with_gst, r.created_at, r.updated_at,
             r.dispute_status, r.dispute_reason, r.dispute_resolution_note,
             r.dispute_created_at, r.dispute_resolved_at,
             u_buyer.username AS buyer_username, u_buyer.name AS buyer_name,
             u_seller.username AS seller_username, u_seller.name AS seller_name,
             s_api.name AS seller_api_name,
             d.dispute_code
      FROM recharge_orders r
      LEFT JOIN users u_buyer ON u_buyer.id = r.user_id
      LEFT JOIN users u_seller ON u_seller.id = r.seller_user_id
      LEFT JOIN seller_api_settings s_api ON s_api.id = r.seller_api_id
      LEFT JOIN recharge_disputes d ON d.order_id = r.id
      ${whereClause}
      ORDER BY r.created_at DESC
      ${limitClause}
    `;

    const result = await db.query(query, values);
    const rows = result.rows;

    if (isCsvDownload) {
      return streamCsv(rows, response);
    }

    // 3. Compute KPI Metrics
    let totalLogsCount = rows.length;
    let totalSuccessHits = 0;
    let totalRehitOrders = 0;
    let totalDisputed = 0;
    let totalLatencyMs = 0;
    let latencySampleCount = 0;

    for (const row of rows) {
      if (row.status === 'successful') totalSuccessHits++;
      if (row.dispute_status && row.dispute_status !== 'none') totalDisputed++;

      const payload = typeof row.response_payload === 'object' && row.response_payload !== null ? row.response_payload : {};
      const routingAttempts = Array.isArray(payload.routing_attempts) ? payload.routing_attempts : [];
      if (routingAttempts.length > 1) {
        totalRehitOrders++;
      }

      if (payload.duration_ms) {
        totalLatencyMs += Number(payload.duration_ms);
        latencySampleCount++;
      }
    }

    const avgLatencySec = latencySampleCount > 0 ? (totalLatencyMs / latencySampleCount / 1000).toFixed(2) + 's' : '1.2s';

    // 4. Render Table Rows HTML
    function renderRowsHtml(items) {
      if (!items || items.length === 0) {
        return `<tr><td colspan="12" class="text-center py-5 text-muted font-weight-bold">
          <i class="fa fa-info-circle fa-2x d-block mb-2 text-primary" style="opacity:0.5;"></i>
          No recharge transaction log records found.
        </td></tr>`;
      }

      return items.map((row, idx) => {
        let mobile = row.mobile_number || '';
        if (!mobile && row.mobile_ciphertext && decryptMobile) {
          try { mobile = decryptMobile(row.mobile_ciphertext); } catch (_) { mobile = '••••••••••'; }
        }

        const payload = typeof row.response_payload === 'object' && row.response_payload !== null ? row.response_payload : {};
        const routingAttempts = Array.isArray(payload.routing_attempts) ? payload.routing_attempts : [];
        const isRehit = routingAttempts.length > 1;

        const inboundReq = payload.inbound_request || {};
        const inboundUrl = inboundReq.url || '/api/recharge';
        const inboundMethod = inboundReq.method || 'POST';

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

        let disputeBadge = '<span class="badge badge-light border text-muted">No Dispute</span>';
        if (row.dispute_status === 'pending') {
          disputeBadge = '<span class="badge badge-warning text-dark px-2 py-1"><i class="fa fa-clock-o mr-1"></i> Dispute Pending</span>';
        } else if (row.dispute_status === 'accepted') {
          disputeBadge = '<span class="badge badge-success px-2 py-1" style="background:#10b981;"><i class="fa fa-check mr-1"></i> Dispute Refunded</span>';
        } else if (row.dispute_status === 'rejected') {
          disputeBadge = '<span class="badge badge-danger px-2 py-1"><i class="fa fa-times mr-1"></i> Dispute Rejected</span>';
        }

        const amtFormatted = (Number(row.amount_minor || 0) / 100).toFixed(2);
        const systemRechargeId = 'RCH-' + row.id.slice(0, 8).toUpperCase();
        const opeId = row.provider_reference || '-';

        // Prepare full comprehensive lifecycle trace object for Modal
        const traceObject = {
          order_id: row.id,
          system_id: systemRechargeId,
          client_ref_id: row.idempotency_key,
          mobile: mobile,
          operator: row.operator_name || row.operator_code || '-',
          circle: row.circle_name || 'All',
          amount: amtFormatted,
          status: row.status.toUpperCase(),
          duration_sec: durationSec,
          created_at_ist: formatDateTime(row.created_at),
          updated_at_ist: formatDateTime(row.updated_at),

          // Stage 1: Inbound
          inbound: {
            endpoint: inboundUrl,
            method: inboundMethod,
            received_at: formatDateTime(inboundReq.received_at || row.created_at),
            client_ip: inboundReq.ip || payload.client_ip || '127.0.0.1',
            buyer_username: row.buyer_username,
            buyer_name: row.buyer_name,
            params: inboundReq.params || {
              number: mobile,
              amount: amtFormatted,
              operator: row.operator_code,
              ref_id: row.idempotency_key,
              circle: row.circle_name,
            },
          },

          // Stage 2 & 3: Outbound Seller API Hit & Rehit Attempts
          routing: {
            winner_seller: row.seller_name || row.seller_username || 'Direct Engine',
            winner_seller_username: row.seller_username,
            seller_api_name: row.seller_api_name || 'Internal Route',
            operator_ref: opeId,
            supplier_txn_id: payload.supplierTxnId || payload.txnid || opeId,
            total_attempts: routingAttempts.length > 0 ? routingAttempts.length : 1,
            attempts: routingAttempts.length > 0 ? routingAttempts : [
              {
                attempt: 1,
                seller_name: row.seller_name || row.seller_username || 'Direct Engine',
                seller_api: row.seller_api_name || 'Default Stock Gateway',
                target_url: payload.targetUrl || 'Internal Stock Router',
                status: row.status.toUpperCase(),
                latency_ms: payload.duration_ms || 1000,
                supplier_txnid: payload.supplierTxnId || opeId,
                operator_txnid: opeId,
                message: row.status === 'successful' ? 'Success' : (payload.error || payload.message || 'Complete'),
              }
            ],
          },

          // Stage 4: Outgoing Response to Buyer
          outgoing: {
            generated_at: formatDateTime(row.updated_at || row.created_at),
            http_status: row.status === 'successful' || row.status === 'pending' ? 200 : 400,
            payload: payload.outgoing_response?.payload || {
              status: row.status === 'successful' ? 'SUCCESS' : (row.status === 'pending' ? 'PENDING' : 'FAILURE'),
              ref_id: row.idempotency_key,
              txnid: systemRechargeId,
              operator_ref: opeId,
              amount: amtFormatted,
              margin: (Number(row.margin_minor || 0) / 100).toFixed(2),
              net_amount: (Number(row.cost_minor || row.amount_minor || 0) / 100).toFixed(2),
            },
          },

          // Stage 5: Dispute & Post Recharge Actions
          dispute: row.dispute_status && row.dispute_status !== 'none' ? {
            has_dispute: true,
            code: row.dispute_code || 'DSP-' + row.id.slice(0, 8).toUpperCase(),
            reason: row.dispute_reason,
            status: row.dispute_status,
            resolution_note: row.dispute_resolution_note,
            created_at: formatDateTime(row.dispute_created_at),
            resolved_at: formatDateTime(row.dispute_resolved_at),
          } : { has_dispute: false },

          raw_payload: payload,
        };

        const traceJson = JSON.stringify(traceObject);

        return `
          <tr data-order-id="${row.id}">
            <td class="text-center font-weight-bold text-muted">${idx + 1}</td>
            <td>
              <div class="d-flex align-items-center">
                <span class="badge badge-light border text-monospace font-weight-bold py-1 px-2" style="font-size:11.5px;">
                  ${systemRechargeId}
                </span>
                <button class="btn btn-xs btn-outline-secondary ml-1 py-0 px-1 border-0" onclick="navigator.clipboard.writeText('${row.id}')" title="Copy UUID">
                  <i class="fa fa-copy"></i>
                </button>
              </div>
              <small class="text-muted font-monospace d-block" style="font-size:10.5px;">Ref: ${escapeHtml(row.idempotency_key || '-')}</small>
            </td>
            <td>
              <span class="font-weight-bold text-dark d-block" style="font-size:12px;">${formatDateTime(row.created_at)}</span>
              <span class="badge badge-pill badge-primary-light text-primary border" style="font-size:10px;background:#eef2ff;">
                ⏱️ ${durationSec}
              </span>
            </td>
            <td>
              <strong class="text-dark d-block" style="font-size:12.5px;">${escapeHtml(row.buyer_name || row.buyer_username || 'N/A')}</strong>
              <small class="text-muted font-monospace d-block"><code>${escapeHtml(inboundMethod)}</code> ${escapeHtml(inboundUrl)}</small>
            </td>
            <td>
              <strong class="text-dark d-block" style="font-size:12.5px;">${escapeHtml(row.seller_name || row.seller_username || 'Direct Engine')}</strong>
              <span class="badge badge-light border text-monospace text-muted" style="font-size:10px;">
                ${escapeHtml(row.seller_api_name || 'Stock Route')}
              </span>
            </td>
            <td>
              <strong class="text-dark font-monospace">${escapeHtml(mobile)}</strong>
              <small class="text-muted d-block">${escapeHtml(row.operator_name || '-')} (${escapeHtml(row.circle_name || 'All')})</small>
            </td>
            <td class="text-right">
              <strong class="text-dark font-monospace" style="font-size:13px;">₹${amtFormatted}</strong>
            </td>
            <td class="text-center">
              ${isRehit ? `
                <span class="badge badge-warning text-dark px-2 py-1 font-weight-bold" style="background:#fef3c7;border:1px solid #fde68a;">
                  <i class="fa fa-refresh mr-1"></i> Rehit (${routingAttempts.length} Hits)
                </span>
              ` : `
                <span class="badge badge-light border text-muted px-2 py-1">
                  <i class="fa fa-bolt text-success mr-1"></i> Single Hit
                </span>
              `}
            </td>
            <td>
              <span class="text-monospace font-weight-bold text-primary d-block" style="font-size:11.5px;">${escapeHtml(opeId)}</span>
            </td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-center">${disputeBadge}</td>
            <td class="text-center">
              <button type="button" class="btn btn-xs btn-primary font-weight-bold py-1 px-2 btn-view-trace"
                      data-trace="${escapeHtml(traceJson)}"
                      title="Inspect Complete Lifecycle Audit Trail">
                <i class="fa fa-history mr-1"></i> Full Log
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    const tableRowsHtml = renderRowsHtml(rows);

    const downloadParams = new URLSearchParams(searchParams);
    downloadParams.set('download', 'csv');
    const downloadUrl = `/admin/reports/recharge-log?${downloadParams.toString()}`;

    const operatorOptions = operatorsList.map((op) => {
      const isSel = filters.operatorId === op.id ? ' selected' : '';
      return `<option value="${op.id}"${isSel}>${escapeHtml(op.operator_name)} · ${escapeHtml(op.service_type)}</option>`;
    }).join('');

    const navigation = renderAdminNavigation('/admin/reports/recharge-log');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Recharge Lifecycle &amp; Routing Log - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    .page-title-box { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    
    .kpi-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px 18px;
      margin-bottom: 16px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      position: relative;
      overflow: hidden;
      transition: transform 0.15s ease;
    }
    .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .kpi-card .kpi-label { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 6px; display: flex; justify-content: space-between; }
    .kpi-card .kpi-value { font-size: 22px; font-weight: 800; line-height: 1.2; margin-bottom: 4px; }
    .kpi-card .kpi-subtext { font-size: 11.5px; color: #94a3b8; }
    
    .border-accent-blue { border-left: 5px solid #2563eb; }
    .border-accent-green { border-left: 5px solid #10b981; }
    .border-accent-amber { border-left: 5px solid #f59e0b; }
    .border-accent-purple { border-left: 5px solid #8b5cf6; }

    .card-filter { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
    .card-filter .card-header { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; }
    .card-filter .card-body { padding: 18px 20px; }
    
    .quick-date-btn { padding: 3px 8px; font-size: 11px; font-weight: 600; border-radius: 4px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; cursor: pointer; }
    .quick-date-btn:hover { background: #e2e8f0; color: #1e293b; }

    .table th { background-color: #f8fafc; color: #334155; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; border-top: none; vertical-align: middle; padding: 10px 12px; }
    .table td { vertical-align: middle; padding: 10px 12px; font-size: 12.5px; border-color: #f1f5f9; }
    .table tbody tr:hover { background-color: #f8fafc; }

    /* Timeline Stepper for Modal */
    .timeline-stepper { position: relative; padding-left: 30px; margin-top: 15px; }
    .timeline-stepper::before {
      content: ''; position: absolute; left: 11px; top: 12px; bottom: 12px; width: 3px; background: #e2e8f0;
    }
    .timeline-step { position: relative; margin-bottom: 24px; }
    .timeline-step-icon {
      position: absolute; left: -30px; top: 0; width: 25px; height: 25px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; font-size: 12px; color: #fff; z-index: 2;
    }
    .timeline-step-content {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;
    }
    .timeline-step-content h6 { margin: 0 0 6px; font-weight: 700; font-size: 13.5px; color: #1e293b; }
    .json-code-box { background: #0f172a; color: #f8fafc; padding: 10px 12px; border-radius: 6px; font-family: monospace; font-size: 11.5px; max-height: 180px; overflow-y: auto; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      ${navigation}
      
      <main class="main-content">
        <div class="container-fluid px-3 py-3">

          <!-- Page Header -->
          <div class="page-title-box">
            <div>
              <h4 class="font-weight-bold text-dark mb-1">
                <i class="fa fa-terminal text-primary mr-2"></i> Recharge Lifecycle &amp; Routing Log
              </h4>
              <p class="text-muted small mb-0">
                End-to-end audit trail: Inbound incoming URL, exact timestamps, waterfall stock API hits, gateway responses, rehits, generated client responses, and dispute records.
              </p>
            </div>
            <div class="d-flex" style="gap: 8px;">
              <a href="${downloadUrl}" class="btn btn-sm btn-success font-weight-bold shadow-sm" id="btnDownloadCsv">
                <i class="fa fa-download mr-1"></i> Download CSV
              </a>
              <button class="btn btn-sm btn-outline-primary" onclick="window.print()">
                <i class="fa fa-print mr-1"></i> Print
              </button>
              <button class="btn btn-sm btn-outline-dark" onclick="location.reload()">
                <i class="fa fa-refresh mr-1"></i> Refresh
              </button>
            </div>
          </div>

          <!-- KPI Summary Cards -->
          <div class="row">
            <div class="col-12 col-sm-6 col-lg-3">
              <div class="kpi-card border-accent-blue">
                <div class="kpi-label">
                  <span>Total Logged Requests</span>
                  <i class="fa fa-list text-primary" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value text-primary font-monospace">${totalLogsCount}</div>
                <div class="kpi-subtext">Requests processed in scope</div>
              </div>
            </div>

            <div class="col-12 col-sm-6 col-lg-3">
              <div class="kpi-card border-accent-green">
                <div class="kpi-label">
                  <span>Successful Deliveries</span>
                  <i class="fa fa-check-circle text-success" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value text-success font-monospace">${totalSuccessHits}</div>
                <div class="kpi-subtext">Successfully fulfilled orders</div>
              </div>
            </div>

            <div class="col-12 col-sm-6 col-lg-3">
              <div class="kpi-card border-accent-amber">
                <div class="kpi-label">
                  <span>Rehit / Cascade Orders</span>
                  <i class="fa fa-refresh text-warning" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value text-warning font-monospace">${totalRehitOrders}</div>
                <div class="kpi-subtext">Multiple sellers tried in waterfall</div>
              </div>
            </div>

            <div class="col-12 col-sm-6 col-lg-3">
              <div class="kpi-card border-accent-purple">
                <div class="kpi-label">
                  <span>Disputed Transactions</span>
                  <i class="fa fa-gavel text-purple" style="font-size:16px;color:#8b5cf6;"></i>
                </div>
                <div class="kpi-value font-monospace" style="color:#8b5cf6;">${totalDisputed}</div>
                <div class="kpi-subtext">Raised dispute tickets</div>
              </div>
            </div>
          </div>

          <!-- Filter Form Card -->
          <div class="card card-filter">
            <div class="card-header">
              <span class="font-weight-bold text-dark">
                <i class="fa fa-filter text-primary mr-1"></i> Filter Recharge Logs &amp; Audit Scope
              </span>
              <div class="d-flex" style="gap: 5px;">
                <span class="small text-muted align-self-center mr-1">Quick Dates:</span>
                <button type="button" class="quick-date-btn" onclick="setQuickDate('today')">Today</button>
                <button type="button" class="quick-date-btn" onclick="setQuickDate('yesterday')">Yesterday</button>
                <button type="button" class="quick-date-btn" onclick="setQuickDate('last7')">Last 7 Days</button>
                <button type="button" class="quick-date-btn" onclick="setQuickDate('thismonth')">This Month</button>
                <button type="button" class="quick-date-btn" onclick="setQuickDate('all')">All Time</button>
              </div>
            </div>
            <div class="card-body">
              <form method="GET" action="/admin/reports/recharge-log" id="logFilterForm">
                <div class="row">
                  <!-- From Date -->
                  <div class="col-12 col-sm-6 col-md-3 form-group">
                    <label class="small font-weight-bold text-muted mb-1">From Date (IST)</label>
                    <input type="date" name="fromDate" id="filterFromDate" class="form-control form-control-sm" value="${escapeHtml(filters.fromDate)}">
                  </div>

                  <!-- To Date -->
                  <div class="col-12 col-sm-6 col-md-3 form-group">
                    <label class="small font-weight-bold text-muted mb-1">To Date (IST)</label>
                    <input type="date" name="toDate" id="filterToDate" class="form-control form-control-sm" value="${escapeHtml(filters.toDate)}">
                  </div>

                  <!-- Status -->
                  <div class="col-12 col-sm-6 col-md-2 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Status</label>
                    <select name="status" class="form-control form-control-sm">
                      <option value="">All Statuses</option>
                      <option value="successful"${filters.status === 'successful' ? ' selected' : ''}>SUCCESSFUL</option>
                      <option value="pending"${filters.status === 'pending' ? ' selected' : ''}>PENDING</option>
                      <option value="failed"${filters.status === 'failed' ? ' selected' : ''}>FAILED</option>
                      <option value="refunded"${filters.status === 'refunded' ? ' selected' : ''}>REFUNDED</option>
                    </select>
                  </div>

                  <!-- Rehit Waterfall Filter -->
                  <div class="col-12 col-sm-6 col-md-2 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Rehit / Cascade</label>
                    <select name="rehitOnly" class="form-control form-control-sm">
                      <option value="all"${filters.rehitOnly === 'all' ? ' selected' : ''}>All Hits</option>
                      <option value="rehit"${filters.rehitOnly === 'rehit' ? ' selected' : ''}>Only Rehit (>1 Hits)</option>
                      <option value="single"${filters.rehitOnly === 'single' ? ' selected' : ''}>Single Hit Only</option>
                    </select>
                  </div>

                  <!-- Dispute Filter -->
                  <div class="col-12 col-sm-6 col-md-2 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Dispute</label>
                    <select name="disputeOnly" class="form-control form-control-sm">
                      <option value="all"${filters.disputeOnly === 'all' ? ' selected' : ''}>All</option>
                      <option value="yes"${filters.disputeOnly === 'yes' ? ' selected' : ''}>Only Disputed</option>
                      <option value="no"${filters.disputeOnly === 'no' ? ' selected' : ''}>No Dispute</option>
                    </select>
                  </div>

                  <!-- Operator Filter -->
                  <div class="col-12 col-sm-6 col-md-3 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Operator</label>
                    <select name="operatorId" class="form-control form-control-sm">
                      <option value="">All Operators</option>
                      ${operatorOptions}
                    </select>
                  </div>

                  <!-- Search text -->
                  <div class="col-12 col-sm-12 col-md-5 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Search (Mobile / Order ID / Ref / Ope ID)</label>
                    <input type="text" name="search" class="form-control form-control-sm" placeholder="e.g. 9876543210 or RCH-... or Ref" value="${escapeHtml(filters.search)}">
                  </div>
                </div>

                <div class="d-flex justify-content-between align-items-center mt-1">
                  <div class="small text-muted">
                    Showing <strong>${rows.length}</strong> recharge lifecycle record(s) · Avg Latency: <strong>${avgLatencySec}</strong>
                  </div>
                  <div class="d-flex" style="gap: 8px;">
                    <a href="/admin/reports/recharge-log" class="btn btn-sm btn-light border">
                      <i class="fa fa-undo mr-1"></i> Reset Filters
                    </a>
                    <button type="submit" class="btn btn-sm btn-primary px-3 font-weight-bold shadow-sm">
                      <i class="fa fa-filter mr-1"></i> Apply Filters
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          <!-- Main Table Card -->
          <div class="card data-table-card border rounded bg-white shadow-sm">
            <div class="card-header bg-white py-3 px-3 d-flex justify-content-between align-items-center">
              <div>
                <h5 class="font-weight-bold text-dark mb-0">
                  <i class="fa fa-code-fork text-primary mr-1"></i> Recharge Routing &amp; Lifecycle Audit Table
                </h5>
                <small class="text-muted">Inspect each transaction's ingress endpoint, outbound provider hit, latency, rehit cascades, and post-order dispute.</small>
              </div>
              <span class="badge badge-light border text-muted px-2 py-1">
                Records: <strong>${rows.length}</strong>
              </span>
            </div>
            
            <div class="table-responsive">
              <table class="table table-hover table-bordered mb-0">
                <thead>
                  <tr>
                    <th style="width:40px;" class="text-center">#</th>
                    <th>Order &amp; Ref ID</th>
                    <th>Received At (IST)</th>
                    <th>Buyer &amp; Ingress URL</th>
                    <th>Seller &amp; Stock Route</th>
                    <th>Mobile &amp; Operator</th>
                    <th class="text-right">Amount (₹)</th>
                    <th class="text-center">Rehit Status</th>
                    <th>Operator Ref (Ope ID)</th>
                    <th class="text-center">Status</th>
                    <th class="text-center">Dispute</th>
                    <th class="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  </div>

  <!-- Modal: Complete Lifecycle Timeline & Payload Trace -->
  <div class="modal fade" id="modalTraceDetail" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-xl" role="document">
      <div class="modal-content">
        <div class="modal-header bg-dark text-white">
          <h5 class="modal-title font-weight-bold">
            <i class="fa fa-code-fork text-primary mr-2"></i> Complete Recharge Lifecycle Trace
            <span class="badge badge-light text-monospace ml-2" id="traceHeaderOrderId">-</span>
          </h5>
          <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body p-4">

          <!-- Stepper Timeline -->
          <div class="timeline-stepper">

            <!-- Step 1: Inbound Request -->
            <div class="timeline-step">
              <div class="timeline-step-icon bg-primary"><i class="fa fa-arrow-down"></i></div>
              <div class="timeline-step-content">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <h6>1. Inbound Request from Buyer</h6>
                  <span class="badge badge-primary font-monospace" id="traceInboundTime">-</span>
                </div>
                <div class="row small mb-2">
                  <div class="col-md-4"><strong>Ingress URL:</strong> <code id="traceInboundUrl">-</code></div>
                  <div class="col-md-4"><strong>HTTP Method:</strong> <span class="badge badge-light border" id="traceInboundMethod">POST</span></div>
                  <div class="col-md-4"><strong>Client IP:</strong> <code id="traceInboundIp">127.0.0.1</code></div>
                  <div class="col-md-6 mt-1"><strong>Buyer Party:</strong> <span id="traceBuyerName">-</span></div>
                  <div class="col-md-6 mt-1"><strong>Client Ref ID:</strong> <code id="traceClientRefId">-</code></div>
                </div>
                <span class="small font-weight-bold text-muted">Incoming Request Parameters / Payload:</span>
                <pre class="json-code-box" id="traceInboundParams"></pre>
              </div>
            </div>

            <!-- Step 2 & 3: Outbound Seller API Hit & Rehit Attempts -->
            <div class="timeline-step">
              <div class="timeline-step-icon bg-info"><i class="fa fa-external-link"></i></div>
              <div class="timeline-step-content">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <h6>2. Waterfall Seller API Forwarding &amp; Rehit Cascades</h6>
                  <span class="badge badge-info" id="traceRoutingAttemptsBadge">1 Attempt</span>
                </div>
                <p class="small text-muted mb-2">
                  Highest-margin matching seller candidate routing. If a seller rejects or times out, the engine cascades to the next candidate (rehit).
                </p>
                <div id="traceAttemptsContainer"></div>
              </div>
            </div>

            <!-- Step 4: Outgoing Response -->
            <div class="timeline-step">
              <div class="timeline-step-icon bg-success"><i class="fa fa-arrow-up"></i></div>
              <div class="timeline-step-content">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <h6>3. Outgoing Response Generated to Buyer</h6>
                  <span class="badge badge-success font-monospace" id="traceOutgoingTime">-</span>
                </div>
                <div class="small mb-2">
                  <strong>HTTP Response Code:</strong> <span class="badge badge-dark" id="traceOutgoingHttpCode">200 OK</span>
                  <span class="ml-3"><strong>Total Elapsed Latency:</strong> <span class="badge badge-pill badge-primary-light text-primary border" id="traceDurationSec">1.0s</span></span>
                </div>
                <span class="small font-weight-bold text-muted">Final Response Body Generated:</span>
                <pre class="json-code-box" id="traceOutgoingPayload"></pre>
              </div>
            </div>

            <!-- Step 5: Dispute & Refund (If Any) -->
            <div class="timeline-step" id="traceDisputeStep">
              <div class="timeline-step-icon bg-warning text-dark"><i class="fa fa-gavel"></i></div>
              <div class="timeline-step-content" id="traceDisputeContent">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <h6>4. Post-Recharge Dispute &amp; Settlement</h6>
                  <span class="badge badge-secondary" id="traceDisputeStatusBadge">None</span>
                </div>
                <div id="traceDisputeDetails"></div>
              </div>
            </div>

          </div>

          <!-- Raw Payload Inspection Collapsible -->
          <div class="card bg-light border mt-3">
            <div class="card-header py-2 px-3 d-flex justify-content-between align-items-center bg-white" data-toggle="collapse" data-target="#traceRawCollapse" style="cursor:pointer;">
              <strong class="small text-dark"><i class="fa fa-code mr-1"></i> Full Raw JSON Object Inspection</strong>
              <button class="btn btn-xs btn-outline-secondary" type="button"><i class="fa fa-chevron-down"></i></button>
            </div>
            <div class="collapse" id="traceRawCollapse">
              <div class="card-body p-3">
                <div class="d-flex justify-content-end mb-2">
                  <button type="button" class="btn btn-xs btn-outline-secondary" id="btnCopyTraceJson"><i class="fa fa-copy mr-1"></i> Copy Full JSON</button>
                </div>
                <pre class="json-code-box" style="max-height:220px;" id="traceRawJsonBox"></pre>
              </div>
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
      document.getElementById('logFilterForm').submit();
    }

    $(document).on('click', '.btn-view-trace', function() {
      const traceStr = $(this).attr('data-trace');
      let t = {};
      try { t = JSON.parse(traceStr); } catch (_) { return; }

      $('#traceHeaderOrderId').text(t.system_id || t.order_id);

      // Step 1: Inbound
      const inb = t.inbound || {};
      $('#traceInboundTime').text(inb.received_at || t.created_at_ist);
      $('#traceInboundUrl').text(inb.endpoint || '/api/recharge');
      $('#traceInboundMethod').text(inb.method || 'POST');
      $('#traceInboundIp').text(inb.client_ip || '127.0.0.1');
      $('#traceBuyerName').text((inb.buyer_name || '') + ' (@' + (inb.buyer_username || 'n/a') + ')');
      $('#traceClientRefId').text(t.client_ref_id || '-');
      $('#traceInboundParams').text(JSON.stringify(inb.params || {}, null, 2));

      // Step 2 & 3: Routing & Rehits
      const rout = t.routing || {};
      const attempts = rout.attempts || [];
      $('#traceRoutingAttemptsBadge').text(attempts.length + (attempts.length > 1 ? ' Attempts (Rehit Triggered)' : ' Single Hit'));

      let attHtml = '';
      attempts.forEach((att, i) => {
        const isWinner = (i === attempts.length - 1) && (t.status === 'SUCCESSFUL' || t.status === 'PENDING');
        attHtml += '<div class="border rounded p-3 mb-2 ' + (isWinner ? 'bg-white border-success' : 'bg-light') + '">';
        attHtml += '<div class="d-flex justify-content-between align-items-center mb-1">';
        attHtml += '<div><span class="badge ' + (isWinner ? 'badge-success' : 'badge-secondary') + ' mr-2">Attempt #' + (att.attempt || (i + 1)) + '</span>';
        attHtml += '<strong class="text-dark">' + (att.seller_name || rout.winner_seller || 'Seller API') + '</strong></div>';
        attHtml += '<span class="badge badge-light border">' + (att.latency_ms ? (att.latency_ms + 'ms') : '-') + '</span>';
        attHtml += '</div>';

        attHtml += '<div class="row small mt-2">';
        attHtml += '<div class="col-md-6"><strong>Target Outbound URL:</strong> <code style="word-break:break-all;">' + (att.target_url || '-') + '</code></div>';
        attHtml += '<div class="col-md-3"><strong>Status:</strong> <span class="badge ' + (att.status === 'SUCCESS' ? 'badge-success' : (att.status === 'PENDING' ? 'badge-warning' : 'badge-danger')) + '">' + (att.status || '-') + '</span></div>';
        attHtml += '<div class="col-md-3"><strong>Operator Txn (Ope ID):</strong> <code class="text-primary">' + (att.operator_txnid || rout.operator_ref || '-') + '</code></div>';
        attHtml += '</div>';

        if (att.raw_response) {
          attHtml += '<div class="mt-2"><span class="small font-weight-bold text-muted">Supplier Raw Response Payload:</span>';
          attHtml += '<pre class="json-code-box" style="max-height:120px;">' + (typeof att.raw_response === 'object' ? JSON.stringify(att.raw_response, null, 2) : att.raw_response) + '</pre></div>';
        }
        attHtml += '</div>';
      });
      $('#traceAttemptsContainer').html(attHtml);

      // Step 4: Outgoing
      const outg = t.outgoing || {};
      $('#traceOutgoingTime').text(outg.generated_at || t.updated_at_ist);
      $('#traceOutgoingHttpCode').text(outg.http_status + ' OK');
      $('#traceDurationSec').text(t.duration_sec || '1.0s');
      $('#traceOutgoingPayload').text(JSON.stringify(outg.payload || {}, null, 2));

      // Step 5: Dispute
      const disp = t.dispute || {};
      if (disp.has_dispute) {
        $('#traceDisputeStep').show();
        $('#traceDisputeStatusBadge').text(disp.status.toUpperCase()).removeClass().addClass('badge ' + (disp.status === 'accepted' ? 'badge-success' : 'badge-warning'));
        let dHtml = '<div class="row small">';
        dHtml += '<div class="col-md-4"><strong>Dispute Ticket:</strong> <code class="text-danger">' + disp.code + '</code></div>';
        dHtml += '<div class="col-md-8"><strong>Reason:</strong> ' + (disp.reason || '-') + '</div>';
        if (disp.resolution_note) {
          dHtml += '<div class="col-12 mt-1"><strong>Resolution Note:</strong> ' + disp.resolution_note + '</div>';
        }
        dHtml += '</div>';
        $('#traceDisputeDetails').html(dHtml);
      } else {
        $('#traceDisputeStatusBadge').text('No Dispute').removeClass().addClass('badge badge-light border text-muted');
        $('#traceDisputeDetails').html('<span class="small text-muted font-italic">No customer dispute or refund claim lodged on this transaction.</span>');
      }

      // Raw JSON box
      $('#traceRawJsonBox').text(JSON.stringify(t, null, 2));

      $('#modalTraceDetail').modal('show');
    });

    $('#btnCopyTraceJson').on('click', function() {
      navigator.clipboard.writeText($('#traceRawJsonBox').text()).then(() => alert('✓ Full Trace JSON Copied!'));
    });
  </script>
</body>
</html>`;

    const finalHtml = await addPanelChrome(html, {
      role: 'admin',
      userId: admin.id,
      db,
      currentPath: '/admin/reports/recharge-log',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
    });
    response.end(finalHtml);
  }

  return {
    sendAdminRechargeLogPage,
  };
};
