'use strict';

const { assertSafePublicUrl } = require('./ssrf-filter');

/**
 * Extract balance or any value from JSON object/array or XML/Text response by path/key/position.
 *
 * Supports:
 * - JSON dot notation: 'balance', 'data.balance', 'response.wallet.amount', 'wallets.0.balance'
 * - Bracket notation: 'wallets[0].amount'
 * - Case-insensitive fallback
 * - XML tag extraction: 'balance' -> extracts content from <balance>...</balance> or <Balance>...</Balance>
 * - XML attribute extraction: 'balance' -> extracts from balance="..."
 * - Indexed position for array / tokens
 */
function extractValueByPath(data, keyPath) {
  if (data === null || data === undefined || !keyPath) return null;
  const pathStr = String(keyPath).trim();
  if (!pathStr) return null;

  // 1. If data is an object / array (e.g. JSON parsed)
  if (typeof data === 'object') {
    const parts = pathStr.replace(/\[(\w+)\]/g, '.$1').split('.').map((p) => p.trim()).filter(Boolean);
    let current = data;

    for (const part of parts) {
      if (current === null || current === undefined) return null;
      if (typeof current !== 'object') return null;

      if (part in current) {
        current = current[part];
      } else {
        // Case-insensitive check
        const lower = part.toLowerCase();
        const foundKey = Object.keys(current).find((k) => k.toLowerCase() === lower);
        if (foundKey) {
          current = current[foundKey];
        } else if (Array.isArray(current) && !isNaN(Number(part))) {
          current = current[Number(part)];
        } else {
          // If requested balance key was not found directly, check common balance aliases
          const lowerPart = part.toLowerCase();
          if (lowerPart.includes('bal') || lowerPart.includes('amount') || lowerPart.includes('wallet') || lowerPart.includes('stock')) {
            const fallbackKey = Object.keys(current).find((k) =>
              /^(?:totalbalance|mainbalance|rechargebalance|balance|walletbalance|sellerwalletbalance|bal|amount)$/i.test(k)
            );
            if (fallbackKey && typeof current[fallbackKey] !== 'object') {
              return String(current[fallbackKey]).trim();
            }
          }
          return null;
        }
      }
    }

    if (current === null || current === undefined) return null;
    if (typeof current === 'object') {
      // If object, try to see if it has 'balance', 'amount', 'value', 'bal'
      for (const candidate of ['rechargeBalance', 'balance', 'amount', 'totalBalance', 'bal', 'value', 'data']) {
        if (current && typeof current === 'object' && candidate in current && typeof current[candidate] !== 'object') {
          return String(current[candidate]).trim();
        }
      }
      return JSON.stringify(current);
    }
    return String(current).trim();
  }

  // 2. If data is string (e.g. XML, CSV, plain text)
  if (typeof data === 'string') {
    const text = data.trim();

    // Try parsing as JSON first
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      try {
        const parsed = JSON.parse(text);
        const res = extractValueByPath(parsed, keyPath);
        if (res !== null) return res;
      } catch {}
    }

    // Clean tag if user supplied <tag> or tag
    const cleanTag = pathStr.replace(/[<>]/g, '').trim();

    // Try standard XML closing tag regex: <tag>value</tag> or <ns:tag>value</ns:tag>
    const tagRegex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${cleanTag}[^>]*>([^<]+)<\\/(?:[a-zA-Z0-9_]+:)?${cleanTag}>`, 'i');
    const tagMatch = text.match(tagRegex);
    if (tagMatch && tagMatch[1] !== undefined) {
      return tagMatch[1].trim();
    }

    // Fallback for XML numeric balance values like <decimal>1234.56</decimal> or <string>1234.56</string> in ASMX/SOAP
    if (cleanTag.toLowerCase() === 'balance' || cleanTag.toLowerCase() === 'amount') {
      for (const altTag of ['balance', 'decimal', 'string', 'bal', 'amount']) {
        const altRegex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${altTag}[^>]*>([^<]+)<\\/(?:[a-zA-Z0-9_]+:)?${altTag}>`, 'i');
        const altMatch = text.match(altRegex);
        if (altMatch && altMatch[1] !== undefined && !isNaN(Number(altMatch[1].trim()))) {
          return altMatch[1].trim();
        }
      }
    }

    // Try XML attribute: tag="value" or balance="1234.56"
    const attrRegex = new RegExp(`(?:${cleanTag})\\s*=\\s*["']([^"']+)["']`, 'i');
    const attrMatch = text.match(attrRegex);
    if (attrMatch && attrMatch[1] !== undefined) {
      return attrMatch[1].trim();
    }

    // Try Key: Value or Key=Value in plain text/CSV
    const kvRegex = new RegExp(`(?:^|[\\r\\n,;|])\\s*${cleanTag}\\s*[:=]\\s*([^\\r\\n,;|]+)`, 'i');
    const kvMatch = text.match(kvRegex);
    if (kvMatch && kvMatch[1] !== undefined) {
      return kvMatch[1].trim();
    }

    // If keyPath is a numeric 1-based index in delimited text (e.g., pos 1 or 2 in "SUCCESS,1500,TXN123")
    if (/^\d+$/.test(pathStr)) {
      const idx = Number(pathStr) - 1;
      const tokens = text.split(/[,|;~#\t]/).map((t) => t.trim());
      if (idx >= 0 && idx < tokens.length) {
        return tokens[idx];
      }
    }
  }

  return null;
}

/**
 * Execute an external stock/recharge API call from the server side.
 */
async function executeStockApiCall(config) {
  let {
    url,
    method = 'GET',
    requestType = 'GET',
    responseType = 'json',
    parameters = [],
    headers = [],
    body = '',
    balanceKey = '',
  } = config;

  if (!url || typeof url !== 'string') {
    throw new Error('Valid API URL is required.');
  }

  let normalizedMethod = (requestType || method || 'GET').toUpperCase();
  const isJsonRequest = normalizedMethod === 'JSON';
  if (isJsonRequest) {
    normalizedMethod = 'POST';
  }
  // Parse and validate target URL against SSRF / internal endpoints
  let parsedUrl;
  try {
    parsedUrl = await assertSafePublicUrl(url.trim());
  } catch (urlErr) {
    throw new Error(`API URL validation failed: ${urlErr.message}`);
  }

  const params = Array.isArray(parameters) ? parameters.filter((p) => p && p.key && String(p.key).trim()) : [];
  const reqHeaders = {};

  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h && h.key && String(h.key).trim()) {
        reqHeaders[String(h.key).trim()] = String(h.value || '');
      }
    }
  }

  let requestBody = null;

  if (normalizedMethod === 'GET') {
    // Append parameters as query string
    for (const p of params) {
      parsedUrl.searchParams.set(String(p.key).trim(), String(p.value || ''));
    }
  } else if (normalizedMethod === 'POST') {
    if (isJsonRequest) {
      reqHeaders['content-type'] = reqHeaders['content-type'] || 'application/json';
      if (body && String(body).trim()) {
        requestBody = String(body).trim();
      } else {
        const jsonPayload = {};
        for (const p of params) {
          jsonPayload[String(p.key).trim()] = String(p.value || '');
        }
        requestBody = JSON.stringify(jsonPayload);
      }
    } else {
      reqHeaders['content-type'] = reqHeaders['content-type'] || 'application/x-www-form-urlencoded';
      if (body && String(body).trim()) {
        requestBody = String(body).trim();
      } else {
        const formParams = new URLSearchParams();
        for (const p of params) {
          formParams.set(String(p.key).trim(), String(p.value || ''));
        }
        requestBody = formParams.toString();
      }
    }
  }

  const finalUrl = parsedUrl.toString();
  const startTime = Date.now();

  const fetchOptions = {
    method: normalizedMethod,
    headers: reqHeaders,
    signal: AbortSignal.timeout(15000),
  };

  if (requestBody && normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    fetchOptions.body = requestBody;
  }

  const response = await fetch(finalUrl, fetchOptions);
  const latencyMs = Date.now() - startTime;
  const rawText = await response.text();

  let parsedData = null;
  let detectedType = (responseType || 'json').toLowerCase();

  try {
    parsedData = JSON.parse(rawText);
    detectedType = 'json';
  } catch {
    parsedData = rawText;
  }

  let extractedBalance = null;
  if (balanceKey) {
    extractedBalance = extractValueByPath(parsedData !== null ? parsedData : rawText, balanceKey);
  }

  // Detect provider-level error message (e.g. Invalid IP Address, Authentication Failed, etc.)
  let providerError = null;
  if (parsedData && typeof parsedData === 'object') {
    const statusVal = String(parsedData.status || parsedData.STATUS || parsedData.response || '').toLowerCase();
    const isErrorStatus = statusVal === 'error' || statusVal === 'failed' || statusVal === 'failure' || statusVal === 'false' || statusVal === '0';
    const messageVal = parsedData.message || parsedData.MESSAGE || parsedData.msg || parsedData.error || parsedData.err_msg || parsedData.reason;
    if (isErrorStatus || (messageVal && /invalid ip|whitelist|access denied|unauthorized|failed|error|blocked/i.test(String(messageVal)))) {
      providerError = String(messageVal || parsedData.status || 'API provider returned error');
    }
  }

  return {
    providerError,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    latencyMs,
    rawText,
    parsedData,
    detectedType,
    extractedBalance,
    finalUrl,
  };
}

module.exports = {
  extractValueByPath,
  executeStockApiCall,
};
