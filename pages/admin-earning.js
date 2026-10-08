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

module.exports = function createAdminEarningPage({
  db,
  formatMinorUnits,
  decryptMobile,
  decryptServiceConfig,
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
   * Fetch active margin difference percentage from admin_service_settings
   */
  async function getAdminMarginDifference() {
    try {
      const row = await db.query(
        "SELECT is_enabled, config_ciphertext FROM admin_service_settings WHERE service_key = 'margin_difference'"
      );
      if (row.rowCount > 0) {
        const isEnabled = row.rows[0].is_enabled !== false;
        let percent = 0.10;
        let description = 'System margin difference deduction (Seller vs Buyer)';
        if (decryptServiceConfig && row.rows[0].config_ciphertext) {
          try {
            const config = decryptServiceConfig(row.rows[0].config_ciphertext);
            const val = parseFloat(config.marginDifferencePercent ?? config.percent ?? '0.10');
            if (!isNaN(val)) percent = Math.max(0, val);
            if (config.description) description = config.description;
          } catch (e) {
            console.warn('[Admin Earning] Decrypt config error:', e.message);
          }
        }
        return { isEnabled, percent, description };
      }
    } catch (err) {
      console.error('[Admin Earning] Error fetching margin difference setting:', err);
    }
    return { isEnabled: true, percent: 0.10, description: 'Default System Margin Difference' };
  }

  /**
   * Stream filtered transactions as CSV
   */
  function streamCsv(rows, response, marginDiffPercent) {
    const csvHeader = [
      'Order ID',
      'Client Ref ID',
      'Date Time (IST)',
      'Buyer Party',
      'Buyer Username',
      'Seller Party',
      'Seller Username',
      'Operator',
      'Circle',
      'Mobile Number',
      'Recharge Amount (INR)',
      'Margin Diff Percent (%)',
      'Admin Profit (INR)',
      'Buyer Margin (INR)',
      'Seller Margin (INR)',
      'Status',
      'Operator Txn ID (Ope ID)',
      'Duration',
    ].join(',') + '\r\n';

    const csvRows = rows.map((row) => {
      let mobile = row.mobile_number || '';
      if (!mobile && row.mobile_ciphertext && decryptMobile) {
        try { mobile = decryptMobile(row.mobile_ciphertext); } catch (_) { mobile = 'Hidden'; }
      }
      const amtMinor = BigInt(row.amount_minor || '0');
      const amtRupees = Number(amtMinor) / 100;
      const isSuccess = row.status === 'successful';
      const profitRupees = isSuccess ? (amtRupees * (marginDiffPercent / 100)) : 0;

      const buyerMarginRupees = (Number(row.margin_minor || '0') / 100);
      const sellerMarginRupees = (Number(row.seller_margin_minor || '0') / 100);

      const payload = typeof row.response_payload === 'object' && row.response_payload !== null ? row.response_payload : {};
      let durationSec = '1.0s';
      if (payload.duration_ms) {
        durationSec = (Number(payload.duration_ms) / 1000).toFixed(1) + 's';
      } else if (row.updated_at && row.created_at) {
        const diffMs = Math.max(500, new Date(row.updated_at).getTime() - new Date(row.created_at).getTime());
        durationSec = (diffMs / 1000).toFixed(1) + 's';
      }

      const sanitize = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

      return [
        sanitize('RCH-' + row.id.slice(0, 8).toUpperCase()),
        sanitize(row.idempotency_key || ''),
        sanitize(formatDateTime(row.created_at)),
        sanitize(row.buyer_name || row.buyer_username || 'N/A'),
        sanitize(row.buyer_username || ''),
        sanitize(row.seller_name || row.seller_username || 'Direct'),
        sanitize(row.seller_username || ''),
        sanitize(row.operator_name || row.operator_code || ''),
        sanitize(row.circle_name || 'All'),
        sanitize(mobile),
        sanitize(amtRupees.toFixed(2)),
        sanitize(marginDiffPercent.toFixed(2) + '%'),
        sanitize(profitRupees.toFixed(2)),
        sanitize(buyerMarginRupees.toFixed(2)),
        sanitize(sellerMarginRupees.toFixed(2)),
        sanitize(row.status.toUpperCase()),
        sanitize(row.provider_reference || ''),
        sanitize(durationSec),
      ].join(',');
    }).join('\r\n');

    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="admin-earning-report-${getTodayString()}.csv"`,
      'cache-control': 'no-store',
    });
    // Add UTF-8 BOM for Microsoft Excel compatibility
    response.end('\uFEFF' + csvHeader + csvRows);
  }

  /**
   * Main Page Renderer: GET /admin/reports/admin-earning
   */
  async function sendAdminEarningPage(admin, response, searchParams) {
    const todayStr = getTodayString();

    // 1. Fetch system setting for margin difference
    const settingConfig = await getAdminMarginDifference();

    // 2. Parse request query filters
    const filters = {
      fromDate: String(searchParams.get('fromDate') || '').trim(),
      toDate: String(searchParams.get('toDate') || '').trim(),
      partyId: String(searchParams.get('partyId') || '').trim(),
      partyRole: String(searchParams.get('partyRole') || 'all').trim().toLowerCase(), // 'all', 'buyer', 'seller'
      status: String(searchParams.get('status') || '').trim().toLowerCase(), // all, successful, pending, failed, refunded
      operatorId: String(searchParams.get('operatorId') || '').trim(),
      circle: String(searchParams.get('circle') || '').trim(),
      search: String(searchParams.get('search') || '').trim().slice(0, 80),
      limit: Math.min(Math.max(parseInt(searchParams.get('limit') || '500', 10), 10), 2000),
      // Optional margin diff override (defaults to the setting's configured rate)
      marginDiff: searchParams.get('marginDiff') !== null && !isNaN(parseFloat(searchParams.get('marginDiff')))
        ? Math.max(0, parseFloat(searchParams.get('marginDiff')))
        : settingConfig.percent,
    };

    const effectiveMarginPercent = filters.marginDiff;

    // 3. Fetch all active parties (users) for the filter dropdown
    const usersRes = await db.query(
      `SELECT id, username, name, business_name, role FROM users WHERE deleted_at IS NULL ORDER BY username ASC`
    );
    const usersList = usersRes.rows;

    // 4. Fetch all active operators for the filter dropdown
    const operatorsRes = await db.query(
      `SELECT id, operator_name, service_type, operator_code FROM operator_definitions WHERE status='active' AND deleted_at IS NULL ORDER BY service_type, operator_name`
    );
    const operatorsList = operatorsRes.rows;

    // 5. Build dynamic SQL query for recharge orders
    const conditions = [];
    const values = [];
    const add = (val) => { values.push(val); return `$${values.length}`; };

    if (filters.fromDate) {
      conditions.push(`r.created_at >= (${add(filters.fromDate)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (filters.toDate) {
      conditions.push(`r.created_at < (((${add(filters.toDate)}::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (filters.partyId && UUID_REGEX.test(filters.partyId)) {
      if (filters.partyRole === 'buyer') {
        conditions.push(`r.user_id = ${add(filters.partyId)}`);
      } else if (filters.partyRole === 'seller') {
        conditions.push(`r.seller_user_id = ${add(filters.partyId)}`);
      } else {
        conditions.push(`(r.user_id = ${add(filters.partyId)} OR r.seller_user_id = ${add(filters.partyId)})`);
      }
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
    if (filters.search) {
      conditions.push(`(
        r.mobile_number LIKE ${add(`%${filters.search}%`)}
        OR r.idempotency_key ILIKE ${add(`%${filters.search}%`)}
        OR r.id::text ILIKE ${add(`%${filters.search}%`)}
        OR r.provider_reference ILIKE ${add(`%${filters.search}%`)}
        OR u_buyer.username ILIKE ${add(`%${filters.search}%`)}
        OR u_buyer.name ILIKE ${add(`%${filters.search}%`)}
        OR u_seller.username ILIKE ${add(`%${filters.search}%`)}
        OR u_seller.name ILIKE ${add(`%${filters.search}%`)}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const isCsvDownload = searchParams.get('download') === 'csv';
    const limitClause = isCsvDownload ? 'LIMIT 5000' : `LIMIT ${filters.limit}`;

    const query = `
      SELECT r.id, r.user_id, r.seller_user_id, r.mobile_number, r.mobile_ciphertext,
             r.operator_name, r.operator_code, r.circle_name, r.amount_minor, r.margin_minor,
             r.cost_minor, r.seller_margin_minor, r.status, r.idempotency_key, r.provider_reference,
             r.response_payload, r.with_gst, r.created_at, r.updated_at,
             u_buyer.username AS buyer_username, u_buyer.name AS buyer_name, u_buyer.business_name AS buyer_business,
             u_seller.username AS seller_username, u_seller.name AS seller_name, u_seller.business_name AS seller_business
      FROM recharge_orders r
      LEFT JOIN users u_buyer ON u_buyer.id = r.user_id
      LEFT JOIN users u_seller ON u_seller.id = r.seller_user_id
      ${whereClause}
      ORDER BY r.created_at DESC
      ${limitClause}
    `;

    const result = await db.query(query, values);
    const rows = result.rows;

    // Handle CSV download directly
    if (isCsvDownload) {
      return streamCsv(rows, response, effectiveMarginPercent);
    }

    // 6. Compute Comprehensive Summary Aggregations
    let totalTxnCount = rows.length;
    let totalSuccessCount = 0;
    let totalPendingCount = 0;
    let totalFailedCount = 0;
    let totalRefundedCount = 0;

    let totalVolumeMinor = 0n;
    let successVolumeMinor = 0n;
    let totalAdminProfit = 0; // In INR Rupees
    let pendingPotentialProfit = 0; // In INR Rupees
    let totalBuyerMarginMinor = 0n;
    let totalSellerMarginMinor = 0n;

    // Party-wise aggregation maps
    const partyStatsMap = new Map();
    // Operator-wise aggregation map
    const operatorStatsMap = new Map();

    for (const row of rows) {
      const amtMinor = BigInt(row.amount_minor || '0');
      const amtRupees = Number(amtMinor) / 100;
      totalVolumeMinor += amtMinor;

      const buyerMarginMinor = BigInt(row.margin_minor || '0');
      const sellerMarginMinor = BigInt(row.seller_margin_minor || '0');
      totalBuyerMarginMinor += buyerMarginMinor;
      totalSellerMarginMinor += sellerMarginMinor;

      // Profit on this transaction according to setting margin difference
      const txnProfit = amtRupees * (effectiveMarginPercent / 100);

      const isSuccess = row.status === 'successful';
      const isPending = row.status === 'pending' || row.status === 'processing';
      const isFailed = row.status === 'failed';
      const isRefunded = row.status === 'refunded';

      if (isSuccess) {
        totalSuccessCount++;
        successVolumeMinor += amtMinor;
        totalAdminProfit += txnProfit;

        // Group by Operator (Success txns only for profit accounting)
        const opName = row.operator_name || row.operator_code || 'Unknown';
        if (!operatorStatsMap.has(opName)) {
          operatorStatsMap.set(opName, { name: opName, count: 0, volume: 0, profit: 0 });
        }
        const opStat = operatorStatsMap.get(opName);
        opStat.count++;
        opStat.volume += amtRupees;
        opStat.profit += txnProfit;

        // Group by Buyer Party
        const buyerId = row.user_id;
        if (buyerId) {
          const buyerKey = `b_${buyerId}`;
          if (!partyStatsMap.has(buyerKey)) {
            partyStatsMap.set(buyerKey, {
              userId: buyerId,
              name: row.buyer_name || row.buyer_username || 'N/A',
              username: row.buyer_username || 'n/a',
              business: row.buyer_business || '',
              role: 'Buyer',
              txnCount: 0,
              successCount: 0,
              volume: 0,
              adminProfit: 0,
            });
          }
          const pStat = partyStatsMap.get(buyerKey);
          pStat.txnCount++;
          pStat.successCount++;
          pStat.volume += amtRupees;
          pStat.adminProfit += txnProfit;
        }

        // Group by Seller Party
        const sellerId = row.seller_user_id;
        if (sellerId) {
          const sellerKey = `s_${sellerId}`;
          if (!partyStatsMap.has(sellerKey)) {
            partyStatsMap.set(sellerKey, {
              userId: sellerId,
              name: row.seller_name || row.seller_username || 'Seller',
              username: row.seller_username || 'seller',
              business: row.seller_business || '',
              role: 'Seller',
              txnCount: 0,
              successCount: 0,
              volume: 0,
              adminProfit: 0,
            });
          }
          const sStat = partyStatsMap.get(sellerKey);
          sStat.txnCount++;
          sStat.successCount++;
          sStat.volume += amtRupees;
          sStat.adminProfit += txnProfit;
        }

      } else if (isPending) {
        totalPendingCount++;
        pendingPotentialProfit += txnProfit;
      } else if (isFailed) {
        totalFailedCount++;
      } else if (isRefunded) {
        totalRefundedCount++;
      }
    }

    // Compute Today's profit directly from DB for quick glance
    let todayAdminProfit = 0;
    try {
      const todayRes = await db.query(
        `SELECT COALESCE(SUM(amount_minor), 0) AS today_success_minor, COUNT(id) AS today_success_count
         FROM recharge_orders
         WHERE status = 'successful'
           AND created_at >= (CURRENT_DATE::timestamp AT TIME ZONE 'Asia/Kolkata')`
      );
      if (todayRes.rowCount > 0) {
        const todayMinor = BigInt(todayRes.rows[0].today_success_minor || '0');
        todayAdminProfit = (Number(todayMinor) / 100) * (effectiveMarginPercent / 100);
      }
    } catch (tErr) {
      console.warn('[Admin Earning] Today profit query error:', tErr.message);
    }

    // Party-wise stats list sorted by admin profit descending
    const partyStatsList = Array.from(partyStatsMap.values()).sort((a, b) => b.adminProfit - a.adminProfit);
    // Operator-wise stats list sorted by admin profit descending
    const operatorStatsList = Array.from(operatorStatsMap.values()).sort((a, b) => b.profit - a.profit);

    // 7. Render Table Rows HTML
    function renderTableRowsHtml(items) {
      if (!items || items.length === 0) {
        return `<tr><td colspan="13" class="text-center py-5 text-muted font-weight-bold">
          <i class="fa fa-info-circle fa-2x d-block mb-2 text-primary" style="opacity:0.5;"></i>
          No transaction records found matching your filters.
        </td></tr>`;
      }

      return items.map((row, index) => {
        const amtMinor = BigInt(row.amount_minor || '0');
        const amtRupees = Number(amtMinor) / 100;
        const isSuccess = row.status === 'successful';
        const isPending = row.status === 'pending' || row.status === 'processing';
        const isFailed = row.status === 'failed';
        const isRefunded = row.status === 'refunded';

        const txnProfit = amtRupees * (effectiveMarginPercent / 100);

        let mobile = row.mobile_number || '';
        if (!mobile && row.mobile_ciphertext && decryptMobile) {
          try { mobile = decryptMobile(row.mobile_ciphertext); } catch (_) { mobile = '••••••••••'; }
        }

        let statusBadge = '<span class="badge badge-secondary px-2 py-1">Unknown</span>';
        if (isSuccess) {
          statusBadge = '<span class="badge badge-success px-2 py-1" style="background:#10b981;"><i class="fa fa-check-circle mr-1"></i> SUCCESS</span>';
        } else if (isPending) {
          statusBadge = '<span class="badge badge-warning text-white px-2 py-1" style="background:#f59e0b;"><i class="fa fa-clock-o mr-1"></i> PENDING</span>';
        } else if (isFailed) {
          statusBadge = '<span class="badge badge-danger px-2 py-1" style="background:#ef4444;"><i class="fa fa-times-circle mr-1"></i> FAILED</span>';
        } else if (isRefunded) {
          statusBadge = '<span class="badge badge-info px-2 py-1" style="background:#0ea5e9;"><i class="fa fa-undo mr-1"></i> REFUNDED</span>';
        }

        // Format Profit Badge
        let profitDisplay = '';
        if (isSuccess) {
          profitDisplay = `<span class="badge badge-success px-2 py-1 font-weight-bold" style="background:#dcfce7;color:#15803d;border:1px solid #86efac;font-size:12.5px;">+₹${txnProfit.toFixed(2)}</span>`;
        } else if (isPending) {
          profitDisplay = `<span class="badge badge-warning text-dark px-2 py-1" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;" title="Unsettled until confirmed">₹${txnProfit.toFixed(2)} (Pend)</span>`;
        } else {
          profitDisplay = `<span class="badge badge-light text-muted px-2 py-1 border">₹0.00</span>`;
        }

        const buyerComm = (Number(row.margin_minor || '0') / 100).toFixed(2);
        const sellerMargin = (Number(row.seller_margin_minor || '0') / 100).toFixed(2);
        const systemRechargeId = 'RCH-' + row.id.slice(0, 8).toUpperCase();

        return `
          <tr data-order-id="${row.id}">
            <td class="text-center font-weight-bold text-muted">${index + 1}</td>
            <td>
              <div class="d-flex align-items-center">
                <span class="badge badge-light border text-monospace font-weight-bold py-1 px-2" style="font-size:11.5px;letter-spacing:0.3px;">
                  ${systemRechargeId}
                </span>
                <button class="btn btn-xs btn-outline-secondary ml-1 py-0 px-1 border-0" onclick="navigator.clipboard.writeText('${row.id}')" title="Copy UUID">
                  <i class="fa fa-copy"></i>
                </button>
              </div>
              <small class="text-muted d-block font-monospace" style="font-size:10.5px;">Ref: ${escapeHtml(row.idempotency_key || '-')}</small>
            </td>
            <td>
              <span class="font-weight-bold text-dark d-block" style="font-size:12px;">${formatDateTime(row.created_at)}</span>
            </td>
            <td>
              <strong class="text-dark d-block" style="font-size:12.5px;">${escapeHtml(row.buyer_name || row.buyer_username || 'N/A')}</strong>
              <span class="badge badge-pill badge-light border text-monospace text-muted" style="font-size:10.5px;">
                @${escapeHtml(row.buyer_username || 'n/a')}
              </span>
            </td>
            <td>
              ${row.seller_user_id ? `
                <strong class="text-dark d-block" style="font-size:12.5px;">${escapeHtml(row.seller_name || row.seller_username || 'Seller')}</strong>
                <span class="badge badge-pill badge-light border text-monospace text-muted" style="font-size:10.5px;">
                  @${escapeHtml(row.seller_username || 'seller')}
                </span>
              ` : '<span class="badge badge-light border text-muted">Direct / Self</span>'}
            </td>
            <td>
              <strong class="text-dark d-block" style="font-size:12.5px;">${escapeHtml(row.operator_name || row.operator_code || '-')}</strong>
              <small class="text-muted">${escapeHtml(row.circle_name || 'All')}</small>
            </td>
            <td>
              <strong class="text-dark font-weight-bold font-monospace" style="letter-spacing:0.3px;">${escapeHtml(mobile)}</strong>
            </td>
            <td>
              <strong class="text-dark font-weight-bold" style="font-size:13.5px;">₹${amtRupees.toFixed(2)}</strong>
            </td>
            <td class="text-center">
              <span class="badge badge-info px-2 py-1 font-weight-bold" style="background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;">
                ${effectiveMarginPercent.toFixed(2)}%
              </span>
            </td>
            <td class="text-center font-weight-bold">
              ${profitDisplay}
            </td>
            <td>
              <div class="small text-muted">
                <span>Buyer: ₹${buyerComm}</span><br>
                <span>Seller: ₹${sellerMargin}</span>
              </div>
            </td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-center">
              <button type="button" class="btn btn-xs btn-outline-primary font-weight-bold py-1 px-2 btn-show-detail"
                      data-id="${row.id}"
                      data-rch-id="${systemRechargeId}"
                      data-ref-id="${escapeHtml(row.idempotency_key || '-')}"
                      data-ope-id="${escapeHtml(row.provider_reference || '-')}"
                      data-date="${escapeHtml(formatDateTime(row.created_at))}"
                      data-buyer="${escapeHtml(row.buyer_name || row.buyer_username || 'N/A')} (@${escapeHtml(row.buyer_username || '')})"
                      data-seller="${escapeHtml(row.seller_name || row.seller_username || 'Direct')} (@${escapeHtml(row.seller_username || 'direct')})"
                      data-mobile="${escapeHtml(mobile)}"
                      data-operator="${escapeHtml(row.operator_name || '-')} (${escapeHtml(row.circle_name || 'All')})"
                      data-amount="${amtRupees.toFixed(2)}"
                      data-margin-percent="${effectiveMarginPercent.toFixed(2)}"
                      data-profit="${txnProfit.toFixed(2)}"
                      data-buyer-comm="${buyerComm}"
                      data-seller-margin="${sellerMargin}"
                      data-status="${escapeHtml(row.status.toUpperCase())}"
                      title="View Detailed Profit Audit Breakdown">
                <i class="fa fa-eye mr-1"></i> Detail
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    const tableRowsHtml = renderTableRowsHtml(rows);

    // Build URL for CSV download
    const downloadParams = new URLSearchParams(searchParams);
    downloadParams.set('download', 'csv');
    const downloadUrl = `/admin/reports/admin-earning?${downloadParams.toString()}`;

    // Options for Party filter dropdown
    const partyOptions = usersList.map((u) => {
      const isSel = filters.partyId === u.id ? ' selected' : '';
      const display = `${escapeHtml(u.name || u.username)} (@${escapeHtml(u.username)})${u.business_name ? ` - ${escapeHtml(u.business_name)}` : ''}`;
      return `<option value="${u.id}"${isSel}>${display}</option>`;
    }).join('');

    // Options for Operator filter dropdown
    const operatorOptions = operatorsList.map((op) => {
      const isSel = filters.operatorId === op.id ? ' selected' : '';
      return `<option value="${op.id}"${isSel}>${escapeHtml(op.operator_name)} · ${escapeHtml(op.service_type)}</option>`;
    }).join('');

    // Options for Circle filter dropdown
    const circleOptions = CIRCLES.map((c) => {
      const isSel = filters.circle === c ? ' selected' : '';
      return `<option value="${escapeHtml(c)}"${isSel}>${escapeHtml(c)}</option>`;
    }).join('');

    const navigation = renderAdminNavigation('/admin/reports/admin-earning');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin Earning &amp; Profit Report - Exchange Admin</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    body { background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    .page-title-box { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    
    /* KPI Summary Cards */
    .kpi-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px 18px;
      margin-bottom: 16px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      position: relative;
      overflow: hidden;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .kpi-card .kpi-label {
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .kpi-card .kpi-value {
      font-size: 22px;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 4px;
    }
    .kpi-card .kpi-subtext {
      font-size: 11.5px;
      color: #94a3b8;
    }
    .kpi-card.border-accent-green { border-left: 5px solid #10b981; }
    .kpi-card.border-accent-blue { border-left: 5px solid #2563eb; }
    .kpi-card.border-accent-purple { border-left: 5px solid #8b5cf6; }
    .kpi-card.border-accent-orange { border-left: 5px solid #f59e0b; }
    .kpi-card.border-accent-teal { border-left: 5px solid #06b6d4; }

    /* Filter Card */
    .card-filter {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      margin-bottom: 20px;
    }
    .card-filter .card-header {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .card-filter .card-body { padding: 18px 20px; }
    .quick-date-btn {
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s;
    }
    .quick-date-btn:hover {
      background: #e2e8f0;
      color: #1e293b;
    }

    /* Accordion & Tables */
    .summary-section-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      margin-bottom: 20px;
    }
    .data-table-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      overflow: hidden;
    }
    .table th {
      background-color: #f8fafc;
      color: #334155;
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      border-top: none;
      vertical-align: middle;
      padding: 10px 12px;
    }
    .table td {
      vertical-align: middle;
      padding: 10px 12px;
      font-size: 12.5px;
      border-color: #f1f5f9;
    }
    .table tbody tr:hover { background-color: #f8fafc; }

    @media print {
      #exchange-fixed-strip, .sticky, .card-filter, .btn-print-hide, .page-title-box .btn { display: none !important; }
      body { background: #fff !important; }
      .container-fluid { padding: 0 !important; }
    }
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
                <i class="fa fa-line-chart text-success mr-2"></i> Admin Earning &amp; Profit Report
              </h4>
              <p class="text-muted small mb-0">
                Audit every recharge transaction and inspect admin net profits earned via <strong>Margin Difference Settings (${settingConfig.percent.toFixed(2)}%)</strong>.
              </p>
            </div>
            <div class="d-flex" style="gap: 8px;">
              <a href="/admin/settings/service-settings" class="btn btn-sm btn-outline-secondary" title="View or edit Margin Difference in System Settings">
                <i class="fa fa-cog mr-1"></i> Margin Settings (${settingConfig.percent.toFixed(2)}%)
              </a>
              <a href="${downloadUrl}" class="btn btn-sm btn-success font-weight-bold shadow-sm" id="btnDownloadCsv">
                <i class="fa fa-download mr-1"></i> Download CSV Report
              </a>
              <button class="btn btn-sm btn-outline-primary" onclick="window.print()">
                <i class="fa fa-print mr-1"></i> Print
              </button>
              <button class="btn btn-sm btn-outline-dark" onclick="location.reload()">
                <i class="fa fa-refresh mr-1"></i> Refresh
              </button>
            </div>
          </div>

          <!-- Summary KPI Cards -->
          <div class="row">
            <!-- Total Admin Earning / Net Profit -->
            <div class="col-12 col-sm-6 col-lg-3">
              <div class="kpi-card border-accent-green">
                <div class="kpi-label">
                  <span>Total Admin Profit</span>
                  <i class="fa fa-money text-success" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value text-success font-monospace">₹${totalAdminProfit.toFixed(2)}</div>
                <div class="kpi-subtext">Earned from ${totalSuccessCount} successful transactions</div>
              </div>
            </div>

            <!-- Successful Recharge Volume -->
            <div class="col-12 col-sm-6 col-lg-3">
              <div class="kpi-card border-accent-blue">
                <div class="kpi-label">
                  <span>Successful Volume</span>
                  <i class="fa fa-check-circle text-primary" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value text-primary font-monospace">₹${(Number(successVolumeMinor)/100).toFixed(2)}</div>
                <div class="kpi-subtext">Total recharge turnover handled</div>
              </div>
            </div>

            <!-- Today's Admin Profit -->
            <div class="col-12 col-sm-6 col-lg-2">
              <div class="kpi-card border-accent-teal">
                <div class="kpi-label">
                  <span>Today's Profit</span>
                  <i class="fa fa-calendar-check-o text-info" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value text-dark font-monospace">₹${todayAdminProfit.toFixed(2)}</div>
                <div class="kpi-subtext">IST Midnight to present</div>
              </div>
            </div>

            <!-- Pending Potential Profit -->
            <div class="col-12 col-sm-6 col-lg-2">
              <div class="kpi-card border-accent-orange">
                <div class="kpi-label">
                  <span>Pending Potential</span>
                  <i class="fa fa-clock-o text-warning" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value text-warning font-monospace">₹${pendingPotentialProfit.toFixed(2)}</div>
                <div class="kpi-subtext">${totalPendingCount} pending order(s)</div>
              </div>
            </div>

            <!-- Active Setting Margin % -->
            <div class="col-12 col-sm-6 col-lg-2">
              <div class="kpi-card border-accent-purple">
                <div class="kpi-label">
                  <span>Margin Diff %</span>
                  <i class="fa fa-sliders text-purple" style="font-size:16px;"></i>
                </div>
                <div class="kpi-value font-monospace" style="color:#7c3aed;">${effectiveMarginPercent.toFixed(2)}%</div>
                <div class="kpi-subtext">
                  <span class="badge badge-success px-1" style="font-size:10px;">${settingConfig.isEnabled ? 'Active in Settings' : 'Disabled'}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Filter Form Card -->
          <div class="card card-filter">
            <div class="card-header">
              <span class="font-weight-bold text-dark">
                <i class="fa fa-filter text-primary mr-1"></i> Filter Transactions &amp; Audit Scope
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
              <form method="GET" action="/admin/reports/admin-earning" id="earningFilterForm">
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

                  <!-- Party Wise Selector -->
                  <div class="col-12 col-sm-6 col-md-3 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Party (User / Client)</label>
                    <select name="partyId" class="form-control form-control-sm">
                      <option value="">All Parties (Any)</option>
                      ${partyOptions}
                    </select>
                  </div>

                  <!-- Party Role -->
                  <div class="col-12 col-sm-6 col-md-3 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Party Role</label>
                    <select name="partyRole" class="form-control form-control-sm">
                      <option value="all"${filters.partyRole === 'all' ? ' selected' : ''}>Any Role (Buyer or Seller)</option>
                      <option value="buyer"${filters.partyRole === 'buyer' ? ' selected' : ''}>As Buyer Only</option>
                      <option value="seller"${filters.partyRole === 'seller' ? ' selected' : ''}>As Seller Only</option>
                    </select>
                  </div>

                  <!-- Status Filter -->
                  <div class="col-12 col-sm-6 col-md-2 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Status</label>
                    <select name="status" class="form-control form-control-sm">
                      <option value="">All Statuses</option>
                      <option value="successful"${filters.status === 'successful' ? ' selected' : ''}>SUCCESS Only (Profit)</option>
                      <option value="pending"${filters.status === 'pending' ? ' selected' : ''}>PENDING</option>
                      <option value="failed"${filters.status === 'failed' ? ' selected' : ''}>FAILED</option>
                      <option value="refunded"${filters.status === 'refunded' ? ' selected' : ''}>REFUNDED</option>
                    </select>
                  </div>

                  <!-- Operator Filter -->
                  <div class="col-12 col-sm-6 col-md-2 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Operator</label>
                    <select name="operatorId" class="form-control form-control-sm">
                      <option value="">All Operators</option>
                      ${operatorOptions}
                    </select>
                  </div>

                  <!-- Circle Filter -->
                  <div class="col-12 col-sm-6 col-md-2 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Circle</label>
                    <select name="circle" class="form-control form-control-sm">
                      ${circleOptions}
                    </select>
                  </div>

                  <!-- Margin Difference % Rate Override (Simulator) -->
                  <div class="col-12 col-sm-6 col-md-2 form-group">
                    <label class="small font-weight-bold text-muted mb-1" title="Rate set in service settings. You can simulate profits with different % here.">
                      Margin Diff % Rate
                    </label>
                    <div class="input-group input-group-sm">
                      <input type="number" step="0.01" min="0" max="100" name="marginDiff" class="form-control form-control-sm font-monospace font-weight-bold" value="${effectiveMarginPercent.toFixed(2)}">
                      <div class="input-group-append">
                        <span class="input-group-text">%</span>
                      </div>
                    </div>
                  </div>

                  <!-- Search text -->
                  <div class="col-12 col-sm-12 col-md-4 form-group">
                    <label class="small font-weight-bold text-muted mb-1">Search (Mobile / Order ID / Client Ref)</label>
                    <input type="text" name="search" class="form-control form-control-sm" placeholder="e.g. 9876543210 or RCH-... or Ref" value="${escapeHtml(filters.search)}">
                  </div>
                </div>

                <div class="d-flex justify-content-between align-items-center mt-1">
                  <div class="small text-muted">
                    Showing <strong>${rows.length}</strong> transaction record(s) · Current Rate: <strong>${effectiveMarginPercent.toFixed(2)}%</strong>
                  </div>
                  <div class="d-flex" style="gap: 8px;">
                    <a href="/admin/reports/admin-earning" class="btn btn-sm btn-light border">
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

          <!-- Summary Breakdown Accordion: Party-Wise & Operator-Wise -->
          <div class="card summary-section-card mb-3">
            <div class="card-header bg-white py-2 px-3 d-flex justify-content-between align-items-center">
              <span class="font-weight-bold text-dark" style="cursor:pointer;" data-toggle="collapse" data-target="#summaryCollapsibleArea">
                <i class="fa fa-pie-chart text-primary mr-1"></i> Detailed Earning Summaries (Party-Wise &amp; Operator-Wise)
                <small class="text-muted ml-2">(Click to toggle views)</small>
              </span>
              <button class="btn btn-xs btn-outline-secondary" type="button" data-toggle="collapse" data-target="#summaryCollapsibleArea">
                <i class="fa fa-chevron-down"></i>
              </button>
            </div>
            <div class="collapse show" id="summaryCollapsibleArea">
              <div class="card-body p-3">
                <div class="row">
                  <!-- Party-Wise Summary Table -->
                  <div class="col-12 col-lg-7 mb-3">
                    <h6 class="font-weight-bold text-dark mb-2">
                      <i class="fa fa-users text-primary mr-1"></i> Party-Wise Earning Breakdown
                    </h6>
                    <div class="table-responsive border rounded" style="max-height: 260px; overflow-y: auto;">
                      <table class="table table-sm table-striped mb-0" style="font-size:12px;">
                        <thead>
                          <tr>
                            <th>Party Name &amp; User</th>
                            <th>Role</th>
                            <th class="text-right">Success Txns</th>
                            <th class="text-right">Volume (₹)</th>
                            <th class="text-right">Admin Profit (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${partyStatsList.length === 0 ? '<tr><td colspan="5" class="text-center text-muted py-3">No party records found.</td></tr>' : partyStatsList.map((p) => `
                            <tr>
                              <td>
                                <strong class="text-dark">${escapeHtml(p.name)}</strong>
                                <small class="text-muted text-monospace d-block">@${escapeHtml(p.username)}</small>
                              </td>
                              <td><span class="badge badge-light border">${p.role}</span></td>
                              <td class="text-right font-weight-bold">${p.successCount}</td>
                              <td class="text-right font-monospace">₹${p.volume.toFixed(2)}</td>
                              <td class="text-right font-monospace text-success font-weight-bold">+₹${p.adminProfit.toFixed(2)}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- Operator-Wise Summary Table -->
                  <div class="col-12 col-lg-5 mb-3">
                    <h6 class="font-weight-bold text-dark mb-2">
                      <i class="fa fa-signal text-info mr-1"></i> Operator-Wise Earning Breakdown
                    </h6>
                    <div class="table-responsive border rounded" style="max-height: 260px; overflow-y: auto;">
                      <table class="table table-sm table-striped mb-0" style="font-size:12px;">
                        <thead>
                          <tr>
                            <th>Operator</th>
                            <th class="text-right">Success Txns</th>
                            <th class="text-right">Volume (₹)</th>
                            <th class="text-right">Admin Profit (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${operatorStatsList.length === 0 ? '<tr><td colspan="4" class="text-center text-muted py-3">No operator records found.</td></tr>' : operatorStatsList.map((op) => `
                            <tr>
                              <td><strong class="text-dark">${escapeHtml(op.name)}</strong></td>
                              <th class="text-right font-weight-bold">${op.count}</th>
                              <td class="text-right font-monospace">₹${op.volume.toFixed(2)}</td>
                              <td class="text-right font-monospace text-success font-weight-bold">+₹${op.profit.toFixed(2)}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Transactions Table Card -->
          <div class="card data-table-card">
            <div class="card-header bg-white py-3 px-3 d-flex justify-content-between align-items-center">
              <div>
                <h5 class="font-weight-bold text-dark mb-0">
                  <i class="fa fa-list text-primary mr-1"></i> Transaction-by-Transaction Profit Log
                </h5>
                <small class="text-muted">Every transaction record showing recharge amount, setting margin difference, and exact admin profit.</small>
              </div>
              <div class="d-flex" style="gap: 6px;">
                <span class="badge badge-light border text-muted px-2 py-1 align-self-center">
                  Total Records: <strong>${rows.length}</strong>
                </span>
              </div>
            </div>
            
            <div class="table-responsive">
              <table class="table table-hover table-bordered mb-0" id="earningTable">
                <thead>
                  <tr>
                    <th style="width:40px;" class="text-center">#</th>
                    <th>Order &amp; Ref ID</th>
                    <th>Date &amp; Time (IST)</th>
                    <th>Buyer Party</th>
                    <th>Seller Party</th>
                    <th>Operator &amp; Circle</th>
                    <th>Mobile No</th>
                    <th>Amount (₹)</th>
                    <th class="text-center">Margin Diff</th>
                    <th class="text-center">Admin Profit</th>
                    <th>Margins (₹)</th>
                    <th class="text-center">Status</th>
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

  <!-- Modal: Transaction Profit & Ledger Breakdown -->
  <div class="modal fade" id="modalProfitDetail" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
      <div class="modal-content">
        <div class="modal-header bg-dark text-white">
          <h5 class="modal-title font-weight-bold">
            <i class="fa fa-calculator text-success mr-2"></i> Transaction Profit &amp; Margin Breakdown
          </h5>
          <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body p-4">
          <!-- Profit Spotlight Banner -->
          <div class="alert alert-success d-flex align-items-center justify-content-between p-3 mb-4" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;">
            <div>
              <span class="text-muted small text-uppercase font-weight-bold d-block">Admin Net Earning on this Txn</span>
              <h2 class="text-success font-weight-bold font-monospace mb-0" id="modalAdminProfitHeading">+₹0.00</h2>
            </div>
            <div class="text-right">
              <span class="badge badge-success px-2 py-1" style="font-size:13px;" id="modalMarginPercentBadge">Rate: 0.10%</span>
              <small class="text-muted d-block mt-1">Calculated as Amount × Setting Margin %</small>
            </div>
          </div>

          <!-- Financial Breakdown Table -->
          <div class="row mb-3">
            <div class="col-md-6 mb-3">
              <h6 class="font-weight-bold text-dark border-bottom pb-1"><i class="fa fa-inr text-primary mr-1"></i> Financial Accounting</h6>
              <table class="table table-sm table-bordered">
                <tr><th class="bg-light" style="width:170px;">Recharge Amount</th><td class="font-weight-bold text-dark" id="modalAmount">₹0.00</td></tr>
                <tr><th class="bg-light">Setting Margin Diff</th><td class="font-weight-bold text-primary" id="modalMarginPercent">0.10%</td></tr>
                <tr><th class="bg-light">Admin Net Profit</th><td class="font-weight-bold text-success" id="modalAdminProfit">₹0.00</td></tr>
                <tr><th class="bg-light">Buyer Margin Given</th><td class="text-muted" id="modalBuyerComm">₹0.00</td></tr>
                <tr><th class="bg-light">Seller Margin Taken</th><td class="text-muted" id="modalSellerMargin">₹0.00</td></tr>
                <tr><th class="bg-light">Current Status</th><td id="modalStatus">-</td></tr>
              </table>
            </div>

            <div class="col-md-6 mb-3">
              <h6 class="font-weight-bold text-dark border-bottom pb-1"><i class="fa fa-info-circle text-primary mr-1"></i> Parties &amp; Technical Info</h6>
              <table class="table table-sm table-bordered">
                <tr><th class="bg-light" style="width:150px;">Buyer Party</th><td id="modalBuyerParty">-</td></tr>
                <tr><th class="bg-light">Seller Party</th><td id="modalSellerParty">-</td></tr>
                <tr><th class="bg-light">Mobile Number</th><td class="font-monospace font-weight-bold" id="modalMobile">-</td></tr>
                <tr><th class="bg-light">Operator &amp; Circle</th><td id="modalOperator">-</td></tr>
                <tr><th class="bg-light">Operator Txn (Ope ID)</th><td class="font-monospace text-primary" id="modalOpeId">-</td></tr>
                <tr><th class="bg-light">Client Ref ID</th><td class="font-monospace text-muted" id="modalRefId">-</td></tr>
                <tr><th class="bg-light">Transaction Date</th><td id="modalDateTime">-</td></tr>
              </table>
            </div>
          </div>

          <div class="card bg-light border-0 p-3 mb-0">
            <small class="text-muted">
              <strong>Calculation Rule:</strong> Admin profit is determined by the <code>Margin Difference (%)</code> configured in admin settings. 
              Formula: <code>Recharge Amount × (Margin Difference % / 100) = Admin Profit</code>.
            </small>
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
    // Quick Date Preset Handler
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
      document.getElementById('earningFilterForm').submit();
    }

    // Modal Details Viewer
    $(document).on('click', '.btn-show-detail', function() {
      const btn = $(this);
      const isSuccess = btn.data('status') === 'SUCCESS';
      const profitFormatted = isSuccess ? '+₹' + btn.data('profit') : '₹0.00 (' + btn.data('status') + ')';

      $('#modalAdminProfitHeading').text(profitFormatted);
      $('#modalMarginPercentBadge').text('Rate: ' + btn.data('margin-percent') + '%');

      $('#modalAmount').text('₹' + btn.data('amount'));
      $('#modalMarginPercent').text(btn.data('margin-percent') + '%');
      $('#modalAdminProfit').text(isSuccess ? '+₹' + btn.data('profit') : '₹0.00');
      $('#modalBuyerComm').text('₹' + btn.data('buyer-comm'));
      $('#modalSellerMargin').text('₹' + btn.data('seller-margin'));
      $('#modalStatus').html('<span class="badge ' + (isSuccess ? 'badge-success' : 'badge-secondary') + '">' + btn.data('status') + '</span>');

      $('#modalBuyerParty').text(btn.data('buyer'));
      $('#modalSellerParty').text(btn.data('seller'));
      $('#modalMobile').text(btn.data('mobile'));
      $('#modalOperator').text(btn.data('operator'));
      $('#modalOpeId').text(btn.data('ope-id'));
      $('#modalRefId').text(btn.data('ref-id'));
      $('#modalDateTime').text(btn.data('date'));

      $('#modalProfitDetail').modal('show');
    });
  </script>
</body>
</html>`;

    const finalHtml = await addPanelChrome(html, {
      role: 'admin',
      userId: admin.id,
      db,
      currentPath: '/admin/reports/admin-earning',
    });

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
    });
    response.end(finalHtml);
  }

  return {
    sendAdminEarningPage,
  };
};
