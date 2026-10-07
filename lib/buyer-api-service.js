'use strict';

const crypto = require('node:crypto');
const { executeStockApiCall, extractValueByPath } = require('./stock-api-helper');
const { handleSellerApiSuccess, handleSellerApiFailure } = require('./seller-api-rules');

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
      const err = new Error('FAILED- Invalid API key');
      err.statusCode = 401;
      err.errorcode = '145';
      throw err;
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
      const err = new Error('FAILED- Invalid API key');
      err.statusCode = 401;
      err.errorcode = '145';
      throw err;
    }

    const result = await db.query(query, values);
    if (!result.rowCount) {
      const err = new Error('FAILED- Invalid API key');
      err.statusCode = 401;
      err.errorcode = '145';
      throw err;
    }

    const user = result.rows[0];
    if (user.status === 'suspended') {
      const err = new Error('FAILED- Account Suspended -Contact To Admin');
      err.statusCode = 403;
      err.errorcode = '106';
      throw err;
    }

    if (user.status === 'service_suspended' || user.status === 'blocked' || user.status !== 'active') {
      const err = new Error('FAILED- Service has been temporarily suspended for Your account for more detail contact to customer care');
      err.statusCode = 403;
      err.errorcode = '270';
      throw err;
    }

    // Check IP Whitelist for Buyer Buy Requests
    const ipRes = await db.query(
      "SELECT ip_address FROM user_whitelisted_ips WHERE user_id = $1 AND status = 'approved'",
      [user.id],
    );
    if (ipRes.rowCount > 0) {
      const allowedIps = ipRes.rows.map(r => (r.ip_address || '').trim());
      const rawClientIp = request?.headers?.['x-forwarded-for']?.split(',')[0].trim() || request?.socket?.remoteAddress || '';
      const clientIp = rawClientIp.replace(/^::ffff:/, '').trim();

      const isWhitelisted = allowedIps.some(ip => {
        const clean = ip.replace(/^::ffff:/, '').trim();
        return clean === clientIp || clean === rawClientIp || clientIp === '127.0.0.1' || clientIp === '::1';
      });

      if (!isWhitelisted) {
        const err = new Error(`FAILED- IP not whitelisted. Request IP: ${clientIp || 'Unknown'}`);
        err.statusCode = 403;
        err.errorcode = '107';
        throw err;
      }
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

  async function getGeneralSettings() {
    try {
      const row = await db.query("SELECT is_enabled, config_ciphertext FROM admin_service_settings WHERE service_key = 'general'");
      if (row.rowCount > 0 && decryptServiceConfig) {
        const config = decryptServiceConfig(row.rows[0].config_ciphertext);
        return { isEnabled: row.rows[0].is_enabled, ...config };
      }
    } catch (err) {
      console.error('[Buyer API] Error fetching general settings:', err);
    }
    return {
      loginOtpEnabled: false,
      instantResponseEnabled: true,
      instantResponseSeconds: 15,
      complainAcceptAfterEnabled: false,
      complainAcceptMode: 'instant',
      complainAcceptValue: 60,
      complainAcceptUnit: 'seconds',
      complainMaxAgeEnabled: true,
      complainMaxAgeDays: 7,
      notifyPendingTxnEnabled: true,
      notifyPendingTxnMinutes: 15,
      stopRehitAfterEnabled: true,
      stopRehitAfterMinutes: 2,
      stopSameNumberAmountEnabled: true,
      stopSameNumberAmountMinutes: 3,
      apiDisableFailTxnEnabled: true,
      apiDisableFailTxnCount: 5,
      apiSuspendRefundPercentEnabled: true,
      apiSuspendRefundPercent: 25,
    };
  }

  async function dispatchBuyerCallback({ callbackUrl, payload }) {
    if (!callbackUrl) return;
    try {
      const urlObj = new URL(callbackUrl);
      for (const [k, v] of Object.entries(payload)) {
        if (v !== undefined && v !== null) {
          urlObj.searchParams.set(k, String(v));
        }
      }
      await fetch(urlObj.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      console.log(`[Buyer Callback] Dispatched successfully to ${urlObj.toString()}`);
    } catch (err) {
      console.warn(`[Buyer Callback Error] Failed to send callback to ${callbackUrl}:`, err.message);
    }
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
      let planApiLookupInfo = null;

      // Dynamically fetch live Operator & Circle from Plan API (ERS) using the request's mobile number
      if (fetchOperatorLookup) {
        try {
          const autoLook = await fetchOperatorLookup({ db, decryptServiceConfig, mobile: number });
          if (autoLook && autoLook.ok) {
            planApiLookupInfo = {
              brand: autoLook.brand || 'ERS',
              operator: autoLook.operator,
              circle: autoLook.circle,
              operatorCode: autoLook.operatorCode,
              circleCode: autoLook.circleCode,
              latencyMs: autoLook.latencyMs,
            };
            // Route as per detected operator and circle from Plan API
            const detectedCode = (autoLook.matchedOperator ? autoLook.matchedOperator.code : '') || autoLook.operatorCode;
            if (detectedCode) {
              finalOpCode = detectedCode;
            }
            if (autoLook.circle && autoLook.circle !== 'All') {
              finalCircle = autoLook.circle;
            }
          }
        } catch (autoErr) {
          console.log('[Plan API Operator Lookup Info]:', autoErr.message);
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
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: '109',
          message: 'FAILED- Duplicate Reference Id',
          ref_id: refId,
        });
      }

      const amountNum = Number(amountStr);
      const amountMinor = BigInt(Math.round(amountNum * 100));

      let mobileCipher;
      try {
        mobileCipher = encryptMobile(number);
      } catch {
        mobileCipher = Buffer.from(number);
      }

      // Check general settings: Stop Same Number/Amount for X minutes
      const genSettings = await getGeneralSettings();
      if (genSettings.stopSameNumberAmountEnabled) {
        const waitMin = Number(genSettings.stopSameNumberAmountMinutes || 3);
        if (waitMin > 0) {
          const recentDup = await db.query(
            `SELECT id FROM recharge_orders
             WHERE (mobile_number = $1 OR mobile_ciphertext = $2)
               AND amount_minor = $3
               AND status = 'successful'
               AND created_at >= (now() - ($4 || ' minutes')::interval)
             LIMIT 1`,
            [number, mobileCipher, amountMinor, String(waitMin)],
          );
          if (recentDup.rowCount > 0) {
            return sendJson(response, 400, {
              status: 'FAILURE',
              errorcode: '110',
              message: `FAILED- Same number and amount was recently recharged successfully. Please wait ${waitMin} minute(s).`,
              ref_id: refId,
            });
          }
        }
      }

      // Match operator from operator_definitions
      const opResult = await db.query(
        `SELECT id, operator_name, service_type, operator_code,
                minimum_amount_minor, maximum_amount_minor, stop_amounts_minor, operator_number_length
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

      // Validate Mobile Number Length: 142 FAILED- Mobile length should be between {Min-Max}
      const rawNumberOnly = number.replace(/\D/g, '');
      const expectedLength = operatorDef.operator_number_length || 10;
      const minLength = expectedLength;
      const maxLength = expectedLength;
      if (rawNumberOnly.length < minLength || rawNumberOnly.length > maxLength) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: '142',
          message: `FAILED- Mobile length should be between ${minLength}-${maxLength}`,
          ref_id: refId,
        });
      }

      // Validate Denomination / Amount: 242 FAILED- Bad Voucher or This Denomination Is Not Allowed
      const minAmountMinor = BigInt(operatorDef.minimum_amount_minor || 0);
      const maxAmountMinor = BigInt(operatorDef.maximum_amount_minor || 0);
      const stopAmountsMinor = Array.isArray(operatorDef.stop_amounts_minor)
        ? operatorDef.stop_amounts_minor.map((x) => BigInt(x))
        : [];

      const isBadVoucher =
        amountMinor < minAmountMinor ||
        (maxAmountMinor > 0n && amountMinor > maxAmountMinor) ||
        stopAmountsMinor.some((stopVal) => stopVal === amountMinor);

      if (isBadVoucher) {
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: '242',
          message: 'FAILED- Bad Voucher or This Denomination Is Not Allowed',
          ref_id: refId,
        });
      }

      // 1. Check wallet balance: 128 FAILED- Insufficient Fund
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
          errorcode: '128',
          message: 'FAILED- Insufficient Fund',
          ref_id: refId,
        });
      }

      // 2. Initial full debit of recharge amount from buyer wallet
      const debitClient = await db.connect();
      let walletId = null;
      let postDebitBalance = 0n;
      try {
        await debitClient.query('BEGIN');
        const lockedWallet = await debitClient.query(
          "SELECT id, balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR' FOR UPDATE",
          [buyer.id],
        );
        if (!lockedWallet.rowCount) {
          await debitClient.query('ROLLBACK');
          return sendJson(response, 400, {
            status: 'FAILURE',
            errorcode: 'ERR_WALLET_NOT_FOUND',
            message: 'Wallet account not found.',
            ref_id: refId,
          });
        }
        walletId = lockedWallet.rows[0].id;
        const curBal = BigInt(lockedWallet.rows[0].balance_minor || 0);
        if (curBal < amountMinor) {
          await debitClient.query('ROLLBACK');
          return sendJson(response, 400, {
            status: 'FAILURE',
            errorcode: '128',
            message: 'FAILED- Insufficient Fund',
            ref_id: refId,
          });
        }

        postDebitBalance = curBal - amountMinor;
        await debitClient.query(
          "UPDATE wallets SET balance_minor = $1, updated_at = now() WHERE id = $2",
          [postDebitBalance, walletId],
        );

        await debitClient.query(
          `INSERT INTO wallet_entries (
             wallet_id, user_id, amount_minor, entry_type, reference_type, idempotency_key, description
           ) VALUES (
             $1, $2, $3, 'debit', 'recharge_order', $4, $5
           )`,
          [walletId, buyer.id, amountMinor, `rech_deb_${refId}`, `Recharge Debit: ${number}`],
        );

        await debitClient.query('COMMIT');
      } catch (debitErr) {
        await debitClient.query('ROLLBACK').catch(() => {});
        throw debitErr;
      } finally {
        debitClient.release();
      }

      // Helper function to refund debit on failure
      async function refundDebit(reasonDescription) {
        const refClient = await db.connect();
        try {
          await refClient.query('BEGIN');
          const balRes = await refClient.query(
            "UPDATE wallets SET balance_minor = balance_minor + $1, updated_at = now() WHERE id = $2 RETURNING balance_minor",
            [amountMinor, walletId],
          );
          await refClient.query(
            `INSERT INTO wallet_entries (
               wallet_id, user_id, amount_minor, entry_type, reference_type, idempotency_key, description
             ) VALUES (
               $1, $2, $3, 'refund', 'fail_recharge', $4, $5
             ) ON CONFLICT (wallet_id, idempotency_key) DO NOTHING`,
            [walletId, buyer.id, amountMinor, `rech_ref_${refId}_${Date.now()}`, reasonDescription || 'fail recharge'],
          );
          await refClient.query('COMMIT');
          return balRes.rowCount > 0 ? BigInt(balRes.rows[0].balance_minor) : postDebitBalance + amountMinor;
        } catch (rfErr) {
          await refClient.query('ROLLBACK').catch(() => {});
          console.error('[Buyer API] Failed to refund debited amount:', rfErr);
          return postDebitBalance + amountMinor;
        } finally {
          refClient.release();
        }
      }

      // 3. Check Buyer's Purchase Margin for this operator & circle
      const buyerMarginRes = await db.query(
        `SELECT id, commission_percent, with_gst, required_min_roffer_minor, limit_minor, limit_used_minor
         FROM buyer_margin_settings
         WHERE user_id = $1 AND operator_id = $2
           AND circle_name IN ($3, 'All')
           AND is_active = true AND deleted_at IS NULL
           AND (
             amount_type = 'all'
             OR (amount_type = 'fixed' AND amount_min_minor = $4)
             OR (amount_type = 'range' AND amount_min_minor <= $4 AND amount_max_minor >= $4)
           )
         ORDER BY (circle_name = $3) DESC,
                  CASE amount_type WHEN 'fixed' THEN 0 WHEN 'range' THEN 1 ELSE 2 END,
                  created_at DESC
         LIMIT 1`,
        [buyer.id, operatorDef.id, finalCircle, amountMinor.toString()],
      );

      if (!buyerMarginRes.rowCount) {
        // Buyer has not configured purchase margin for this operator/circle/amount
        const restoredBal = await refundDebit('fail recharge');
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: '160',
          message: 'FAILED- No sellers available for selected margin',
          ref_id: refId,
          closing_balance: (Number(restoredBal) / 100).toFixed(2),
        });
      }

      const buyerMarginSetting = buyerMarginRes.rows[0];
      const buyerCommissionPercent = parseFloat(buyerMarginSetting.commission_percent || '0');

      // 4. Find all sellers offering commission >= buyer's set margin limit
      // "agar wo margin ya usse jada margin kisi seller ne add kiya hoga to sabse pahle highest margin wale seller ke pass wo txn jayega... buy margin set limit se kam me nahi"
      const candidateSellersRes = await db.query(
        `SELECT m.id AS seller_margin_id, m.user_id, m.commission_percent, m.operator_id, m.circle_name,
                m.limit_minor, m.limit_used_minor, m.with_gst, m.is_roffer,
                s.id AS seller_api_id, s.name AS seller_api_name, s.config_ciphertext, s.is_active AS api_active
         FROM seller_margin_settings m
         LEFT JOIN seller_api_settings s ON s.user_id = m.user_id AND s.deleted_at IS NULL AND s.is_active = true AND s.is_admin_approved = true
         WHERE m.operator_id = $1
           AND (m.circle_name = $2 OR m.circle_name = 'All')
           AND m.is_active = true
           AND m.is_admin_approved = true
           AND m.deleted_at IS NULL
           AND m.user_id <> $3
           AND (
             m.amount_type = 'all'
             OR (m.amount_type = 'fixed' AND m.amount_min_minor = $4)
             OR (m.amount_type = 'range' AND m.amount_min_minor <= $4 AND m.amount_max_minor >= $4)
           )
           AND CAST(m.commission_percent AS NUMERIC) >= $5
         ORDER BY CAST(m.commission_percent AS NUMERIC) DESC, m.created_at DESC`,
        [operatorDef.id, finalCircle, buyer.id, amountMinor.toString(), buyerCommissionPercent],
      );

      if (!candidateSellersRes.rowCount) {
        // No seller available with margin >= buyer's purchase margin: 160 FAILED- No sellers available for selected margin
        const restoredBal = await refundDebit('fail recharge');
        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: '160',
          message: 'FAILED- No sellers available for selected margin',
          ref_id: refId,
          closing_balance: (Number(restoredBal) / 100).toFixed(2),
        });
      }

      // 5. Cascading / Waterfall Seller Routing (Highest margin seller first)
      const internalTxnId = `TXN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
      let winningSeller = null;
      let winningHitResult = null;
      const sellers = candidateSellersRes.rows;
      const routingStartMs = Date.now();

      for (let sIdx = 0; sIdx < sellers.length; sIdx++) {
        const sellerCandidate = sellers[sIdx];
        if (sIdx > 0 && genSettings.stopRehitAfterEnabled) {
          const maxRehitMs = Number(genSettings.stopRehitAfterMinutes || 2) * 60 * 1000;
          if (Date.now() - routingStartMs >= maxRehitMs) {
            console.warn(`[Recharge Routing] Stop Rehit triggered: ${Date.now() - routingStartMs}ms elapsed >= limit ${maxRehitMs}ms. Halting rehit cascade.`);
            break;
          }
        }

        console.log(`[Recharge Routing] Trying seller user: ${sellerCandidate.user_id}, margin: ${sellerCandidate.commission_percent}% (Buyer min: ${buyerCommissionPercent}%)`);
        const sellerApiRow = sellerCandidate.seller_api_id ? sellerCandidate : null;

        const hitResult = await forwardRechargeToSeller({
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

        if (hitResult.ok && (hitResult.status === 'SUCCESS' || hitResult.status === 'PENDING')) {
          winningSeller = sellerCandidate;
          winningHitResult = hitResult;
          console.log(`[Recharge Routing] Seller succeeded: ${sellerCandidate.user_id} with status ${hitResult.status}`);
          if (sellerCandidate.seller_api_id) {
            await handleSellerApiSuccess(db, sellerCandidate.seller_api_id);
          }
          break;
        } else {
          console.warn(`[Recharge Routing] Seller failed/rejected: ${sellerCandidate.user_id}, error: ${hitResult.message}. Cascading to next seller...`);
          if (sellerCandidate.seller_api_id) {
            await handleSellerApiFailure(db, sellerCandidate.seller_api_id, genSettings);
          }
        }
      }

      // Encrypt mobile for database recording if not already set
      if (!mobileCipher) {
        try {
          mobileCipher = encryptMobile(number);
        } catch {
          mobileCipher = Buffer.from(number);
        }
      }

      // 6. If all sellers failed
      if (!winningSeller || !winningHitResult) {
        const restoredBal = await refundDebit('fail recharge');

        // Record failed recharge order for audit & idempotency
        const failDurationMs = Date.now() - routingStartMs;
        try {
          await db.query(
            `INSERT INTO recharge_orders (
               user_id, mobile_ciphertext, operator_code, amount_minor,
               status, idempotency_key, provider_reference,
               margin_minor, cost_minor, circle_name, operator_name,
               operator_id, mobile_number, response_payload, with_gst
             ) VALUES (
               $1, $2, $3, $4,
               'failed', $5, $6,
               0, $4, $7, $8,
               $9, $10, $11, false
             )`,
            [
              buyer.id, mobileCipher, operatorDef.operator_code || operatorCode, amountMinor,
              refId, internalTxnId,
              finalCircle, operatorDef.operator_name, operatorDef.id, number,
              JSON.stringify({ error: 'All matching sellers failed or rejected request', message: 'fail recharge', duration_ms: failDurationMs, operatorLookup: planApiLookupInfo }),
            ],
          );
        } catch (recErr) {
          console.warn('[Buyer API] Failed to record failed order:', recErr.message);
        }

        return sendJson(response, 400, {
          status: 'FAILURE',
          errorcode: '160',
          message: 'FAILED- No sellers available for selected margin',
          ref_id: refId,
          closing_balance: (Number(restoredBal) / 100).toFixed(2),
        });
      }

      // 7. Recharge Succeeded or Pending at Winner Seller
      // Calculate buyer's commission amount
      const buyerCommissionMinor = BigInt(Math.round(Number(amountMinor) * (buyerCommissionPercent / 100.0)));
      const netCostMinor = amountMinor > buyerCommissionMinor ? amountMinor - buyerCommissionMinor : amountMinor;
      const orderDbStatus = winningHitResult.status === 'PENDING' ? 'pending' : 'successful';
      const providerRef = winningHitResult.operatorTxnId || winningHitResult.supplierTxnId || internalTxnId;

      const finishClient = await db.connect();
      let finalBalance = postDebitBalance;
      let orderRow = null;

      try {
        await finishClient.query('BEGIN');

        // Credit buyer commission to buyer wallet: "as buyer margin"
        if (buyerCommissionMinor > 0n) {
          const creditWallet = await finishClient.query(
            "UPDATE wallets SET balance_minor = balance_minor + $1, updated_at = now() WHERE id = $2 RETURNING balance_minor",
            [buyerCommissionMinor, walletId],
          );
          if (creditWallet.rowCount > 0) {
            finalBalance = BigInt(creditWallet.rows[0].balance_minor);
          }

          await finishClient.query(
            `INSERT INTO wallet_entries (
               wallet_id, user_id, amount_minor, entry_type, reference_type, idempotency_key, description
             ) VALUES (
               $1, $2, $3, 'credit', 'buyer_margin', $4, $5
             ) ON CONFLICT (wallet_id, idempotency_key) DO NOTHING`,
            [walletId, buyer.id, buyerCommissionMinor, `rech_comm_${refId}`, 'buyer margin'],
          );
        }

        // 7b. Credit Seller Wallet: Recharge Amount minus Seller's Margin
        // "agar recharge sucess hota hai to recharge amount me se seller ka set kiya hua margin kam karke utna paisa seller ke wallet me add ho jayega"
        const sellerMarginPercent = parseFloat(winningSeller.commission_percent || '0');
        const sellerMarginMinor = BigInt(Math.round(Number(amountMinor) * (sellerMarginPercent / 100.0)));
        const sellerCreditMinor = amountMinor > sellerMarginMinor ? amountMinor - sellerMarginMinor : 0n;

        if (orderDbStatus === 'successful' && sellerCreditMinor > 0n) {
          const sellerWalletRes = await finishClient.query(
            "SELECT id, balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR' FOR UPDATE",
            [winningSeller.user_id],
          );
          if (sellerWalletRes.rowCount > 0) {
            const sellerWalletId = sellerWalletRes.rows[0].id;
            await finishClient.query(
              "UPDATE wallets SET balance_minor = balance_minor + $1, updated_at = now() WHERE id = $2",
              [sellerCreditMinor, sellerWalletId],
            );
            await finishClient.query(
              `INSERT INTO wallet_entries (
                 wallet_id, user_id, amount_minor, entry_type, reference_type, idempotency_key, description
               ) VALUES (
                 $1, $2, $3, 'credit', 'seller_sales_credit', $4, $5
               ) ON CONFLICT (wallet_id, idempotency_key) DO NOTHING`,
              [sellerWalletId, winningSeller.user_id, sellerCreditMinor, `rech_seller_${refId}`, `Recharge Sale Credit (${number})`],
            );
          }
        }

        const successDurationMs = Date.now() - routingStartMs;
        const finalResponsePayload = Object.assign({}, winningHitResult.parsedData || { status: winningHitResult.status }, {
          duration_ms: successDurationMs,
          supplierTxnId: winningHitResult.supplierTxnId || '',
          operatorTxnId: winningHitResult.operatorTxnId || providerRef || '',
          operatorLookup: planApiLookupInfo,
        });

        // Insert recharge order
        const insertOrder = await finishClient.query(
          `INSERT INTO recharge_orders (
             user_id, mobile_ciphertext, operator_code, amount_minor,
             status, idempotency_key, provider_reference,
             margin_minor, cost_minor, seller_user_id, seller_api_id,
             seller_margin_minor, circle_name, operator_name, operator_id, mobile_number,
             response_payload, with_gst
           ) VALUES (
             $1, $2, $3, $4,
             $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14, $15, $16,
             $17, $18
           ) RETURNING id, created_at`,
          [
            buyer.id, mobileCipher, operatorDef.operator_code || operatorCode, amountMinor,
            orderDbStatus, refId, providerRef,
            buyerCommissionMinor, netCostMinor, winningSeller.user_id, winningSeller.seller_api_id || null,
            sellerMarginMinor, finalCircle, operatorDef.operator_name, operatorDef.id, number,
            JSON.stringify(finalResponsePayload),
            Boolean(buyerMarginSetting.with_gst),
          ],
        );

        orderRow = insertOrder.rows[0];

        // Update seller limit used
        await finishClient.query(
          'UPDATE seller_margin_settings SET limit_used_minor = limit_used_minor + $1 WHERE id = $2',
          [amountMinor, winningSeller.seller_margin_id],
        );

        // Update buyer limit used
        await finishClient.query(
          'UPDATE buyer_margin_settings SET limit_used_minor = limit_used_minor + $1 WHERE id = $2',
          [amountMinor, buyerMarginSetting.id],
        );

        await finishClient.query('COMMIT');
      } catch (finishErr) {
        await finishClient.query('ROLLBACK').catch(() => {});
        throw finishErr;
      } finally {
        finishClient.release();
      }

      // Check instant response timeout for buyer callback
      const totalElapsedSec = (Date.now() - routingStartMs) / 1000;
      const instantTimeoutSec = Number(genSettings.instantResponseSeconds || 15);
      if (genSettings.instantResponseEnabled && totalElapsedSec > instantTimeoutSec && buyer.callback_url) {
        dispatchBuyerCallback({
          callbackUrl: buyer.callback_url,
          payload: {
            status: winningHitResult.status === 'PENDING' ? 'PENDING' : 'SUCCESS',
            recharge_id: orderRow ? orderRow.id : internalTxnId,
            ref_id: refId,
            operator: operatorDef.operator_code || operatorCode,
            number,
            amount: (Number(amountMinor) / 100).toFixed(2),
            operator_ref: providerRef,
            statuscode: winningHitResult.status === 'PENDING' ? '1' : '0',
          },
        }).catch((cbErr) => console.warn('[Callback Dispatch Error]', cbErr.message));
      }

      return sendJson(response, 200, {
        status: winningHitResult.status === 'PENDING' ? 'PENDING' : 'SUCCESS',
        errorcode: '0',
        message: winningHitResult.status === 'PENDING'
          ? 'Recharge Request Submitted (Pending Provider Status)'
          : 'Recharge Request Accepted Successfully',
        recharge_id: orderRow ? orderRow.id : internalTxnId,
        ref_id: refId,
        operator: operatorDef.operator_code || operatorCode,
        number,
        amount: (Number(amountMinor) / 100).toFixed(2),
        margin: (Number(buyerCommissionMinor) / 100).toFixed(2),
        net_amount: (Number(netCostMinor) / 100).toFixed(2),
        operator_ref: providerRef,
        supplier_ref: winningHitResult.supplierTxnId || '',
        closing_balance: (Number(finalBalance) / 100).toFixed(2),
        time: new Date(orderRow ? orderRow.created_at : Date.now()).toISOString().replace('T', ' ').slice(0, 19),
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return sendJson(response, statusCode, {
        status: 'FAILURE',
        errorcode: error.errorcode || 'ERR_SERVER',
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
        errorcode: error.errorcode || 'ERR_SERVER',
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
        errorcode: error.errorcode || 'ERR_SERVER',
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
        'SELECT id, idempotency_key, status, dispute_status, created_at FROM recharge_orders WHERE user_id = $1 AND (idempotency_key = $2 OR id::text = $2) LIMIT 1',
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

      // Validate Dispute General Settings (complainMaxAge & complainAcceptAfter)
      const genSettings = await getGeneralSettings();
      if (genSettings.complainMaxAgeEnabled) {
        const maxDays = Number(genSettings.complainMaxAgeDays || 7);
        if (maxDays > 0) {
          const ageDays = (Date.now() - new Date(order.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24);
          if (ageDays > maxDays) {
            return sendJson(response, 400, {
              status: 'FAILURE',
              errorcode: '112',
              message: `FAILED- Complaints cannot be accepted for transactions older than ${maxDays} days.`,
              ref_id: refId,
            });
          }
        }
      }

      if (genSettings.complainAcceptAfterEnabled && genSettings.complainAcceptMode === 'delay') {
        let delaySec = Number(genSettings.complainAcceptValue || 0);
        if (genSettings.complainAcceptUnit === 'minutes') delaySec *= 60;
        const ageSec = (Date.now() - new Date(order.created_at || Date.now()).getTime()) / 1000;
        if (ageSec < delaySec) {
          const remSec = Math.ceil(delaySec - ageSec);
          const remText = genSettings.complainAcceptUnit === 'minutes' ? `${Math.ceil(remSec / 60)} minute(s)` : `${remSec} second(s)`;
          return sendJson(response, 400, {
            status: 'FAILURE',
            errorcode: '113',
            message: `FAILED- Complain can only be submitted after ${genSettings.complainAcceptValue} ${genSettings.complainAcceptUnit || 'seconds'} of recharge. Please wait ${remText}.`,
            ref_id: refId,
          });
        }
      }

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
        errorcode: '235',
        message: 'SUCCESS- Dispute Accepcted',
        dispute_id: dispCode,
        recharge_id: order.id,
        ref_id: order.idempotency_key,
        dispute_status: 'ACCEPTED',
        reason,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return sendJson(response, statusCode, {
        status: 'FAILURE',
        errorcode: error.errorcode || 'ERR_SERVER',
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
