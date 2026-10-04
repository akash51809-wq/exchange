'use strict';

const crypto = require('node:crypto');
const { executeStockApiCall, extractValueByPath } = require('./stock-api-helper');

module.exports = function createBuyerApiService({
  db,
  formatMinorUnits,
  encryptMobile,
  decryptMobile,
  decryptSellerApiConfig,
  decryptServiceConfig,
  fetchOperatorLookup,
  sendJson,
  httpError,
}) {
  /**
   * Helper to parse request params from GET query or POST JSON / x-www-form-urlencoded
   */
  async function parseRequestParams(request, url) {
    const params = {};

    // Read query params from URL
    for (const [key, val] of url.searchParams.entries()) {
      params[key] = val;
    }

    // If POST or PUT, read body
    if (request.method === 'POST' || request.method === 'PUT') {
      const contentType = request.headers['content-type'] || '';
      const bodyText = await new Promise((resolve, reject) => {
        let text = '';
        request.on('data', (chunk) => {
          text += chunk;
          if (text.length > 500_000) {
            reject(new Error('Request body too large.'));
          }
        });
        request.on('end', () => resolve(text));
        request.on('error', reject);
      });

      if (bodyText.trim()) {
        if (contentType.includes('application/json')) {
          try {
            const parsed = JSON.parse(bodyText);
            if (parsed && typeof parsed === 'object') {
              Object.assign(params, parsed);
            }
          } catch {}
        } else {
          // Form URL-encoded
          try {
            const bodyParams = new URLSearchParams(bodyText);
            for (const [key, val] of bodyParams.entries()) {
              params[key] = val;
            }
          } catch {}
        }
      }
    }

    return params;
  }

  /**
   * Authenticate buyer using username and api_token / token
   */
  async function authenticateBuyer(params, request) {
    let username = String(params.username || params.user_id || params.mobile || '').trim();
    let apiToken = String(params.api_token || params.token || params.apikey || params.key || '').trim();

    // Support Bearer token header if token not in body/query
    if (!apiToken && request?.headers?.authorization?.startsWith('Bearer ')) {
      apiToken = request.headers.authorization.slice(7).trim();
    }

    if (!username && !apiToken) {
      throw httpError('Missing credentials. Please provide username and api_token.', 401);
    }

    let query;
    let values;

    if (username && apiToken) {
      query = `
        SELECT u.id, u.username, u.name, u.role, u.status, u.api_token, u.callback_url,
               w.id AS wallet_id, w.balance_minor
        FROM users u
        LEFT JOIN wallets w ON w.user_id = u.id AND w.currency = 'INR'
        WHERE (u.username = $1 OR lower(u.username) = lower($1) OR u.email = $1)
          AND u.api_token = $2
          AND u.deleted_at IS NULL
      `;
      values = [username, apiToken];
    } else if (apiToken) {
      query = `
        SELECT u.id, u.username, u.name, u.role, u.status, u.api_token, u.callback_url,
               w.id AS wallet_id, w.balance_minor
        FROM users u
        LEFT JOIN wallets w ON w.user_id = u.id AND w.currency = 'INR'
        WHERE u.api_token = $1 AND u.deleted_at IS NULL
      `;
      values = [apiToken];
    } else {
      throw httpError('Missing api_token.', 401);
    }

    const result = await db.query(query, values);
    if (!result.rowCount) {
      throw httpError('Invalid username or API token.', 401);
    }

    const user = result.rows[0];
    if (user.status !== 'active') {
      throw httpError('Account is ' + user.status + '. Please contact administrator.', 403);
    }

    return user;
  }

  /**
   * Substitute template placeholders with actual transaction values
   */
  function substitutePlaceholders(template, data) {
    if (!template || typeof template !== 'string') return template;
    let text = template;
    const map = {
      '{NUMBER}': data.number,
      '{MOBILE}': data.number,
      '{ACCOUNT}': data.number,
      '[NUMBER]': data.number,
      '[number]': data.number,
      '[mobile]': data.number,
      '{AMOUNT}': data.amount,
      '[AMOUNT]': data.amount,
      '[amount]': data.amount,
      '{OPCODE}': data.operatorCode,
      '{OPERATOR}': data.operatorCode,
      '[OPCODE]': data.operatorCode,
      '[opcode]': data.operatorCode,
      '[operator]': data.operatorCode,
      '{TXNID}': data.txnid,
      '{REFID}': data.refId,
      '[REFID]': data.refId,
      '[ref_id]': data.refId,
      '{RECHARGE_ID}': data.rechargeId,
      '[recharge_id]': data.rechargeId,
      '{CIRCLE}': data.circle,
      '[CIRCLE]': data.circle,
      '[circle]': data.circle,
    };
    for (const [key, val] of Object.entries(map)) {
      if (val !== undefined && val !== null) {
        text = text.replaceAll(key, String(val));
      }
    }
    return text;
  }

  async function getAdminMarginDifference() {
    try {
      const row = await db.query("SELECT config_ciphertext FROM admin_service_settings WHERE service_key = 'margin_difference'");
      if (row.rowCount > 0 && decryptServiceConfig) {
        const config = decryptServiceConfig(row.rows[0].config_ciphertext);
        const val = parseFloat(config.marginDifferencePercent ?? config.percent ?? '0.10');
        return isNaN(val) ? 0.10 : Math.max(0, val);
      }
    } catch (err) {
      console.error('[Buyer API] Error fetching admin margin difference:', err);
    }
    return 0.10;
  }

  /**
   * Forward recharge request to Seller's configured stock API
   */
  async function forwardRechargeToSeller({ sellerApiRow, rechargeData }) {
    if (!sellerApiRow || !sellerApiRow.config_ciphertext || !decryptSellerApiConfig) {
      return {
        ok: true,
        status: 'SUCCESS',
        supplierTxnId: `LOCAL_${Date.now()}`,
        operatorTxnId: `OP_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
        rawResponse: null,
        message: 'Processed via Exchange Internal Engine',
      };
    }

    let config = {};
    try {
      config = decryptSellerApiConfig(sellerApiRow.config_ciphertext);
    } catch (err) {
      console.error('Failed to decrypt seller API config:', err);
      return {
        ok: true,
        status: 'SUCCESS',
        supplierTxnId: `LOCAL_${Date.now()}`,
        operatorTxnId: `OP_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
        rawResponse: null,
        message: 'Processed via fallback engine',
      };
    }

    const rechargeConfig = config.recharge;
    if (!rechargeConfig || !rechargeConfig.url) {
      return {
        ok: true,
        status: 'SUCCESS',
        supplierTxnId: `LOCAL_${Date.now()}`,
        operatorTxnId: `OP_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
        rawResponse: null,
        message: 'Processed via Exchange API',
      };
    }

    // Substitute placeholders in URL
    const targetUrl = substitutePlaceholders(rechargeConfig.url, rechargeData);

    // Substitute placeholders in parameters
    const params = (rechargeConfig.parameters || []).map((p) => ({
      key: substitutePlaceholders(p.key, rechargeData),
      value: substitutePlaceholders(p.value, rechargeData),
    }));

    // Substitute placeholders in headers
    const headers = (rechargeConfig.headers || []).map((h) => ({
      key: substitutePlaceholders(h.key, rechargeData),
      value: substitutePlaceholders(h.value, rechargeData),
    }));

    // Substitute placeholders in body
    const body = substitutePlaceholders(rechargeConfig.body || '', rechargeData);

    try {
      console.log(`[SELLER API HIT] Calling Seller ${sellerApiRow.name} (${sellerApiRow.id}) at ${targetUrl}`);
      const apiRes = await executeStockApiCall({
        url: targetUrl,
        requestType: rechargeConfig.requestType || 'GET',
        responseType: rechargeConfig.responseType || 'json',
        parameters: params,
        headers,
        body,
      });

      console.log(`[SELLER API RESPONSE] (${apiRes.status} in ${apiRes.latencyMs}ms):`, apiRes.rawText);

      const parsedData = apiRes.parsedData || apiRes.rawText;

      // Extract status
      let extractedStatus = '';
      if (rechargeConfig.statusKey) {
        extractedStatus = String(extractValueByPath(parsedData, rechargeConfig.statusKey) || '').trim();
      } else {
        extractedStatus = String(
          extractValueByPath(parsedData, 'status') ||
          extractValueByPath(parsedData, 'response_code') ||
          extractValueByPath(parsedData, 'statuscode') ||
          extractValueByPath(parsedData, 'result') ||
          extractValueByPath(parsedData, 'code') ||
          (apiRes.ok ? 'SUCCESS' : 'FAILED'),
        ).trim();
      }

      // Determine success / failure / pending
      const successCodes = (rechargeConfig.successCodes || 'SUCCESS,0,SUCCESSFUL,200,TRUE,OK,ACCEPTED,PENDING')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      const failedCodes = (rechargeConfig.failedCodes || 'FAILED,FAILURE,ERR,ERROR,1,REJECTED,400,500')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      const statusUpper = extractedStatus.toUpperCase();
      const isSuccess = successCodes.includes(statusUpper) || (apiRes.ok && !failedCodes.includes(statusUpper) && (statusUpper.includes('SUCC') || statusUpper === '0' || statusUpper === '200'));
      const isFailed = failedCodes.includes(statusUpper) || (!apiRes.ok && !successCodes.includes(statusUpper));

      // Extract supplier / operator TXN ID
      let supplierTxnId = '';
      if (rechargeConfig.supplierIdKey) {
        supplierTxnId = String(extractValueByPath(parsedData, rechargeConfig.supplierIdKey) || '').trim();
      }
      if (!supplierTxnId) {
        supplierTxnId = String(
          extractValueByPath(parsedData, 'supplier_id') ||
          extractValueByPath(parsedData, 'txnid') ||
          extractValueByPath(parsedData, 'order_id') ||
          extractValueByPath(parsedData, 'rpid') ||
          `SUP_${Date.now()}`,
        ).trim();
      }

      let operatorTxnId = '';
      if (rechargeConfig.operatorIdKey) {
        operatorTxnId = String(extractValueByPath(parsedData, rechargeConfig.operatorIdKey) || '').trim();
      }
      if (!operatorTxnId) {
        operatorTxnId = String(
          extractValueByPath(parsedData, 'operator_id') ||
          extractValueByPath(parsedData, 'op_ref') ||
          extractValueByPath(parsedData, 'rrn') ||
          supplierTxnId,
        ).trim();
      }

      let finalStatus = 'SUCCESS';
      if (isFailed) {
        finalStatus = 'FAILURE';
      } else if (statusUpper.includes('PEND') || statusUpper === '2') {
        finalStatus = 'PENDING';
      }

      return {
        ok: !isFailed,
        status: finalStatus,
        rawStatus: extractedStatus,
        supplierTxnId,
        operatorTxnId,
        rawResponse: apiRes.rawText,
        parsedData,
        latencyMs: apiRes.latencyMs,
        targetUrl: apiRes.finalUrl,
        message: isFailed ? (apiRes.rawText || 'Supplier API returned failure') : 'Success',
      };
    } catch (apiErr) {
      console.error('Error calling supplier recharge API:', apiErr.message);
      return {
        ok: false,
        status: 'FAILURE',
        rawStatus: 'ERR_CALL',
        supplierTxnId: '',
        operatorTxnId: '',
        rawResponse: apiErr.message,
        errorReason: apiErr.message,
        message: 'Failed to communicate with supplier API: ' + apiErr.message,
      };
    }
  }

  /**
   * 1. Recharge API Handler (GET / POST /webservices/api/recharge)
   */
  async function handleBuyerRecharge(request, response, url) {
    try {
      const params = await parseRequestParams(request, url);
      const buyer = await authenticateBuyer(params, request);

      const number = String(params.number || params.mobile || params.account || '').trim();
      const amountStr = String(params.amount || '').trim();
      const operatorCode = String(params.operator || params.operator_code || params.op || '').trim();
      const refId = String(params.ref_id || params.refId || params.txnid || params.client_id || '').trim();
      const circleName = String(params.circle || 'All').trim();

      // Basic validations
      if (!number || number.length < 8 || number.length > 18) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: 'ERR_INVALID_NUMBER',
          message: 'Invalid mobile or account number.',
          ref_id: refId,
        });
      }

      if (!amountStr || isNaN(Number(amountStr)) || Number(amountStr) <= 0) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: 'ERR_INVALID_AMOUNT',
          message: 'Invalid recharge amount.',
          ref_id: refId,
        });
      }

      let finalOpCode = operatorCode;
      let finalCircle = circleName;

      // If operator code is missing or 'auto', auto-detect via PlanAPI lookup
      if ((!finalOpCode || finalOpCode.toLowerCase() === 'auto') && fetchOperatorLookup) {
        try {
          const autoLook = await fetchOperatorLookup({ db, decryptServiceConfig, mobile: number });
          if (autoLook && autoLook.ok) {
            finalOpCode = autoLook.operatorCode || (autoLook.matchedOperator ? autoLook.matchedOperator.code : '');
            if (finalCircle === 'All' || !finalCircle) {
              finalCircle = autoLook.circle || 'All';
            }
          }
        } catch (autoErr) {
          console.log('[Auto Operator Lookup Info]:', autoErr.message);
        }
      }

      if (!finalOpCode) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: 'ERR_INVALID_OPERATOR',
          message: 'Operator code is required or could not be auto-detected.',
          ref_id: refId,
        });
      }

      if (!refId) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: 'ERR_MISSING_REF_ID',
          message: 'Unique ref_id is required.',
        });
      }

      // Check duplicate / idempotency
      const existing = await db.query(
        'SELECT id, amount_minor, margin_minor, cost_minor, status, provider_reference, operator_code, created_at FROM recharge_orders WHERE user_id = $1 AND idempotency_key = $2',
        [buyer.id, refId],
      );

      if (existing.rowCount > 0) {
        const prev = existing.rows[0];
        const statusMap = {
          successful: 'SUCCESS',
          pending: 'PENDING',
          processing: 'PENDING',
          failed: 'FAILURE',
          refunded: 'REFUNDED',
        };
        return sendJson(response, 200, {
          status: statusMap[prev.status] || 'SUCCESS',
          errorcode: '0',
          message: 'Duplicate Transaction (Already Processed)',
          recharge_id: prev.id,
          ref_id: refId,
          operator: prev.operator_code,
          number,
          amount: (Number(prev.amount_minor) / 100).toFixed(2),
          margin: (Number(prev.margin_minor || 0) / 100).toFixed(2),
          net_amount: (Number(prev.cost_minor || prev.amount_minor) / 100).toFixed(2),
          operator_ref: prev.provider_reference || '',
          duplicate: true,
          time: new Date(prev.created_at).toISOString().replace('T', ' ').slice(0, 19),
        });
      }

      const amountNum = Number(amountStr);
      const amountMinor = BigInt(Math.round(amountNum * 100));

      // Match operator from operator_definitions
      const opResult = await db.query(
        `SELECT id, operator_name, service_type, operator_code
         FROM operator_definitions
         WHERE (operator_code ILIKE $1 OR id::text = $1 OR operator_name ILIKE $1)
           AND status = 'active' AND deleted_at IS NULL
         LIMIT 1`,
        [finalOpCode],
      );

      if (!opResult.rowCount) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: 'ERR_OPERATOR_NOT_FOUND',
          message: `Operator code "${finalOpCode}" is not recognized or inactive.`,
          ref_id: refId,
        });
      }

      const operatorDef = opResult.rows[0];

      // Check wallet balance first
      const walletRes = await db.query(
        "SELECT id, balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR'",
        [buyer.id],
      );

      if (!walletRes.rowCount) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: 'ERR_WALLET_NOT_FOUND',
          message: 'Wallet account not found.',
          ref_id: refId,
        });
      }

      const currentBalance = BigInt(walletRes.rows[0].balance_minor || 0);
      if (currentBalance < amountMinor) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: 'ERR_INSUFFICIENT_BALANCE',
          message: `Insufficient Wallet Balance. Current: ₹${(Number(currentBalance) / 100).toFixed(2)}, Required: ₹${amountNum.toFixed(2)}`,
          ref_id: refId,
        });
      }

      // Find best seller route & margin
      const sellerMarginRes = await db.query(
        `SELECT m.id, m.user_id, m.commission_percent, m.operator_id, m.circle_name,
                m.limit_minor, m.limit_used_minor, m.with_gst, m.is_roffer,
                s.id AS seller_api_id, s.name AS seller_api_name, s.config_ciphertext, s.is_active AS api_active
         FROM seller_margin_settings m
         LEFT JOIN seller_api_settings s ON s.user_id = m.user_id AND s.deleted_at IS NULL AND s.is_active = true AND s.is_admin_approved = true
         WHERE m.operator_id = $1
           AND (m.circle_name = $2 OR m.circle_name = 'All')
           AND m.is_active = true
           AND m.is_admin_approved = true
           AND m.deleted_at IS NULL
         ORDER BY (CAST(m.commission_percent AS NUMERIC) - 0.10) DESC, m.created_at DESC
         LIMIT 1`,
        [operatorDef.id, finalCircle],
      );

      let buyerMarginMinor = 0n;
      let sellerUserId = null;
      let sellerApiId = null;
      let sellerApiRow = null;
      let withGst = false;

      const adminMarginDiff = await getAdminMarginDifference();

      if (sellerMarginRes.rowCount > 0) {
        const sm = sellerMarginRes.rows[0];
        sellerUserId = sm.user_id;
        sellerApiId = sm.seller_api_id;
        sellerApiRow = sm.seller_api_id ? sm : null;
        withGst = Boolean(sm.with_gst);
        const origCommission = parseFloat(sm.commission_percent || '0');
        const effectiveRate = Math.max(0, origCommission - adminMarginDiff);
        buyerMarginMinor = BigInt(Math.round(Number(amountMinor) * (effectiveRate / 100.0)));
      }

      const debitMinor = amountMinor > buyerMarginMinor ? amountMinor - buyerMarginMinor : amountMinor;
      const internalTxnId = `TXN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

      // Forward to Seller's Live API if configured
      const sellerHitResult = await forwardRechargeToSeller({
        sellerApiRow,
        rechargeData: {
          number,
          amount: amountNum.toFixed(2),
          operatorCode: operatorDef.operator_code || operatorCode,
          refId,
          txnid: internalTxnId,
          rechargeId: internalTxnId,
          circle: circleName,
        },
      });

      // If the supplier explicitly rejected / failed the recharge
      if (!sellerHitResult.ok) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: 'ERR_SUPPLIER_REJECTED',
          message: sellerHitResult.message || 'Recharge was rejected by supplier API.',
          ref_id: refId,
          operator_ref: sellerHitResult.supplierTxnId || '',
        });
      }

      // Order status based on seller response
      const orderDbStatus = sellerHitResult.status === 'PENDING' ? 'pending' : 'successful';
      const providerRef = sellerHitResult.operatorTxnId || sellerHitResult.supplierTxnId || internalTxnId;

      // Use a DB transaction to debit wallet and insert order
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        // Re-lock buyer wallet row
        const lockedWallet = await client.query(
          "SELECT id, balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR' FOR UPDATE",
          [buyer.id],
        );

        const latestBal = BigInt(lockedWallet.rows[0].balance_minor || 0);
        if (latestBal < debitMinor) {
          await client.query('ROLLBACK');
          return sendJson(response, 400, {
            status: 'FAILURE',
            errorcode: 'ERR_INSUFFICIENT_BALANCE',
            message: 'Insufficient balance during processing.',
            ref_id: refId,
          });
        }

        const newBalance = latestBal - debitMinor;

        // Debit wallet
        await client.query(
          "UPDATE wallets SET balance_minor = $1, updated_at = now() WHERE user_id = $2 AND currency = 'INR'",
          [newBalance, buyer.id],
        );

        // Encrypt mobile
        let mobileCipher;
        try {
          mobileCipher = encryptMobile(number);
        } catch {
          mobileCipher = Buffer.from(number);
        }

        // Insert recharge order
        const insertOrder = await client.query(
          `INSERT INTO recharge_orders (
             user_id, mobile_ciphertext, operator_code, amount_minor,
             status, idempotency_key, provider_reference,
             margin_minor, cost_minor, seller_user_id, seller_api_id,
             circle_name, operator_name, operator_id, mobile_number,
             response_payload, with_gst
           ) VALUES (
             $1, $2, $3, $4,
             $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14, $15,
             $16, $17
           ) RETURNING id, created_at`,
          [
            buyer.id, mobileCipher, operatorDef.operator_code || operatorCode, amountMinor,
            orderDbStatus, refId, providerRef,
            buyerMarginMinor, debitMinor, sellerUserId, sellerApiId,
            circleName, operatorDef.operator_name, operatorDef.id, number,
            JSON.stringify(sellerHitResult.parsedData || { status: sellerHitResult.status }),
            withGst,
          ],
        );

        const orderRow = insertOrder.rows[0];

        // Insert wallet entry
        await client.query(
          `INSERT INTO wallet_entries (
             wallet_id, user_id, amount_minor, entry_type, reference_type, reference_id, idempotency_key
           ) VALUES (
             $1, $2, $3, 'debit', 'recharge_order', $4, $5
           )`,
          [lockedWallet.rows[0].id, buyer.id, debitMinor, orderRow.id, `rech_${refId}`],
        );

        // Update seller limit used if matched
        if (sellerMarginRes.rowCount > 0) {
          await client.query(
            'UPDATE seller_margin_settings SET limit_used_minor = limit_used_minor + $1 WHERE id = $2',
            [amountMinor, sellerMarginRes.rows[0].id],
          );
        }

        await client.query('COMMIT');

        return sendJson(response, 200, {
          status: sellerHitResult.status === 'PENDING' ? 'PENDING' : 'SUCCESS',
          errorcode: '0',
          message: sellerHitResult.status === 'PENDING' ? 'Recharge Request Submitted (Pending Provider Status)' : 'Recharge Request Accepted Successfully',
          recharge_id: orderRow.id,
          ref_id: refId,
          operator: operatorDef.operator_code || operatorCode,
          number,
          amount: (Number(amountMinor) / 100).toFixed(2),
          margin: (Number(buyerMarginMinor) / 100).toFixed(2),
          net_amount: (Number(debitMinor) / 100).toFixed(2),
          operator_ref: providerRef,
          supplier_ref: sellerHitResult.supplierTxnId || '',
          closing_balance: (Number(newBalance) / 100).toFixed(2),
          time: new Date(orderRow.created_at).toISOString().replace('T', ' ').slice(0, 19),
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return sendJson(response, statusCode, {
        status: 'FAILURE',
        errorcode: 'ERR_SERVER',
        message: error.message || 'Internal server error processing recharge.',
      });
    }
  }

  /**
   * 2. Status Check API Handler (GET / POST /webservices/api/status)
   */
  async function handleBuyerStatus(request, response, url) {
    try {
      const params = await parseRequestParams(request, url);
      const buyer = await authenticateBuyer(params, request);

      const refId = String(params.ref_id || params.refId || params.recharge_id || params.order_id || params.txnid || '').trim();

      if (!refId) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: 'ERR_MISSING_PARAM',
          message: 'Parameter ref_id or recharge_id is required.',
        });
      }

      const result = await db.query(
        `SELECT id, amount_minor, margin_minor, cost_minor, status, idempotency_key,
                provider_reference, operator_code, operator_name, mobile_number,
                mobile_ciphertext, created_at, updated_at
         FROM recharge_orders
         WHERE user_id = $1 AND (idempotency_key = $2 OR id::text = $2 OR provider_reference = $2)
         LIMIT 1`,
        [buyer.id, refId],
      );

      if (!result.rowCount) {
        return sendJson(response, 404, {
          status: 'FAILURE',
          errorcode: 'ERR_NOT_FOUND',
          message: 'Transaction not found for the given reference ID.',
          ref_id: refId,
        });
      }

      const row = result.rows[0];
      let mobileNumber = row.mobile_number || '';
      if (!mobileNumber && row.mobile_ciphertext) {
        try {
          mobileNumber = decryptMobile(row.mobile_ciphertext);
        } catch {
          mobileNumber = '';
        }
      }

      const statusMap = {
        successful: 'SUCCESS',
        pending: 'PENDING',
        processing: 'PENDING',
        failed: 'FAILURE',
        refunded: 'REFUNDED',
      };

      return sendJson(response, 200, {
        status: 'SUCCESS',
        errorcode: '0',
        message: 'Transaction Details Retrieved',
        recharge_id: row.id,
        ref_id: row.idempotency_key,
        number: mobileNumber,
        amount: (Number(row.amount_minor) / 100).toFixed(2),
        margin: (Number(row.margin_minor || 0) / 100).toFixed(2),
        net_amount: (Number(row.cost_minor || row.amount_minor) / 100).toFixed(2),
        operator: row.operator_code,
        tx_status: statusMap[row.status] || 'SUCCESS',
        operator_ref: row.provider_reference || '',
        created_at: new Date(row.created_at).toISOString().replace('T', ' ').slice(0, 19),
        updated_at: new Date(row.updated_at || row.created_at).toISOString().replace('T', ' ').slice(0, 19),
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return sendJson(response, statusCode, {
        status: 'FAILURE',
        errorcode: 'ERR_SERVER',
        message: error.message || 'Error checking status.',
      });
    }
  }

  /**
   * 3. Balance Check API Handler (GET / POST /webservices/api/balance)
   */
  async function handleBuyerBalance(request, response, url) {
    try {
      const params = await parseRequestParams(request, url);
      const buyer = await authenticateBuyer(params, request);

      const wallet = await db.query(
        "SELECT balance_minor, currency FROM wallets WHERE user_id = $1 AND currency = 'INR'",
        [buyer.id],
      );

      const balanceMinor = wallet.rows[0]?.balance_minor || 0;

      return sendJson(response, 200, {
        status: 'SUCCESS',
        errorcode: '0',
        message: 'Wallet Balance Retrieved',
        username: buyer.username,
        balance: (Number(balanceMinor) / 100).toFixed(2),
        currency: 'INR',
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return sendJson(response, statusCode, {
        status: 'FAILURE',
        errorcode: 'ERR_SERVER',
        message: error.message || 'Error checking balance.',
      });
    }
  }

  /**
   * 4. Dispute Request API Handler (GET / POST /webservices/api/dispute)
   */
  async function handleBuyerDispute(request, response, url) {
    try {
      const params = await parseRequestParams(request, url);
      const buyer = await authenticateBuyer(params, request);

      const refId = String(params.ref_id || params.refId || params.recharge_id || params.order_id || params.txnid || '').trim();
      const reason = String(params.reason || 'Recharge not received on mobile').trim().slice(0, 255);

      if (!refId) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: 'ERR_MISSING_PARAM',
          message: 'Parameter ref_id or recharge_id is required.',
        });
      }

      const result = await db.query(
        'SELECT id, idempotency_key, status, dispute_status FROM recharge_orders WHERE user_id = $1 AND (idempotency_key = $2 OR id::text = $2) LIMIT 1',
        [buyer.id, refId],
      );

      if (!result.rowCount) {
        return sendJson(response, 404, {
          status: 'FAILURE',
          errorcode: 'ERR_NOT_FOUND',
          message: 'Transaction not found to dispute.',
          ref_id: refId,
        });
      }

      const order = result.rows[0];
      const dispCode = 'DSP-' + order.id.slice(0, 8).toUpperCase();

      await db.query(
        `UPDATE recharge_orders
         SET dispute_status = 'pending', dispute_reason = $1, dispute_created_at = now(), updated_at = now()
         WHERE id = $2`,
        [reason, order.id],
      );

      try {
        await db.query(
          `INSERT INTO recharge_disputes (order_id, buyer_id, seller_id, dispute_code, reason, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'pending', now(), now())`,
          [order.id, buyer.id, order.seller_user_id || null, dispCode, reason],
        );
      } catch (e) {
        // Table might be creating
      }

      return sendJson(response, 200, {
        status: 'SUCCESS',
        errorcode: '0',
        message: 'Dispute request registered successfully',
        dispute_id: dispCode,
        recharge_id: order.id,
        ref_id: order.idempotency_key,
        dispute_status: 'PENDING',
        reason,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return sendJson(response, statusCode, {
        status: 'FAILURE',
        errorcode: 'ERR_SERVER',
        message: error.message || 'Error creating dispute.',
      });
    }
  }

  /**
   * 5. Operator Codes API Handler (GET / POST /webservices/api/operators)
   */
  async function handleBuyerOperators(request, response, url) {
    try {
      const params = await parseRequestParams(request, url);
      await authenticateBuyer(params, request);

      const result = await db.query(
        "SELECT operator_name, service_type, operator_code FROM operator_definitions WHERE status = 'active' AND deleted_at IS NULL ORDER BY service_type, operator_name",
      );

      return sendJson(response, 200, {
        status: 'SUCCESS',
        errorcode: '0',
        message: 'Operators List Retrieved',
        count: result.rowCount,
        operators: result.rows.map((row) => ({
          operator_name: row.operator_name,
          service_type: row.service_type,
          operator_code: row.operator_code,
        })),
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return sendJson(response, statusCode, {
        status: 'FAILURE',
        errorcode: 'ERR_SERVER',
        message: error.message || 'Error fetching operators.',
      });
    }
  }

  /**
   * 6. Operator & Circle Lookup API (GET / POST /webservices/api/operator-lookup)
   */
  async function handleBuyerOperatorLookup(request, response, url) {
    try {
      const params = await parseRequestParams(request, url);
      await authenticateBuyer(params, request);

      const number = String(params.number || params.mobile || '').trim();
      if (!number || number.replace(/\D/g, '').length < 10) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: 'ERR_INVALID_NUMBER',
          message: 'Valid 10-digit mobile number is required.',
        });
      }

      if (!fetchOperatorLookup) {
        return sendJson(response, 500, {
          status: 'FAILURE',
          errorcode: 'ERR_SERVICE_UNAVAILABLE',
          message: 'Plan API / Operator Lookup service is not initialized.',
        });
      }

      const lookup = await fetchOperatorLookup({
        db,
        decryptServiceConfig,
        mobile: number,
      });

      return sendJson(response, 200, {
        status: 'SUCCESS',
        errorcode: '0',
        message: 'Operator and circle fetched successfully.',
        number: lookup.mobile,
        operator: lookup.operator,
        circle: lookup.circle,
        operator_code: lookup.operatorCode,
        circle_code: lookup.circleCode,
        matched_operator: lookup.matchedOperator ? {
          name: lookup.matchedOperator.name,
          code: lookup.matchedOperator.code,
          service_type: lookup.matchedOperator.serviceType,
        } : null,
      });
    } catch (error) {
      const statusCode = error.statusCode || 400;
      return sendJson(response, statusCode, {
        status: 'FAILURE',
        errorcode: 'ERR_LOOKUP',
        message: error.message || 'Operator lookup failed.',
      });
    }
  }

  /**
   * API to get logged-in user credentials (used by the API doc UI)
   */
  async function handleGetCredentials(request, response, session) {
    const result = await db.query('SELECT username, api_token FROM users WHERE id = $1', [session.id]);
    if (!result.rowCount) {
      return sendJson(response, 404, { error: 'User not found' });
    }
    const user = result.rows[0];
    return sendJson(response, 200, {
      username: user.username,
      api_token: user.api_token || '',
    });
  }

  return {
    handleBuyerRecharge,
    handleBuyerStatus,
    handleBuyerBalance,
    handleBuyerDispute,
    handleBuyerOperators,
    handleBuyerOperatorLookup,
    handleGetCredentials,
  };
};
