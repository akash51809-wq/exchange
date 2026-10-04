'use strict';

/**
 * PlanAPI / Ezytm Web Scraper & Operator Lookup Service
 * Automatically logs in to https://planapi.in with saved credentials,
 * maintains session cookies, and scrapes Operator & Circle details from OperatorLook.aspx.
 */

// In-memory active session cookie jar with TTL
let cachedWebSession = {
  cookies: '',
  expiresAt: 0,
  username: '',
};

/**
 * Helper to match an operator name with system operator_definitions in database
 */
async function matchSystemOperator(db, detectedName, detectedCode) {
  if (!db || (!detectedName && !detectedCode)) return null;

  try {
    const cleanName = String(detectedName || '').trim();
    const cleanCode = String(detectedCode || '').trim();

    // 1. Direct code match
    if (cleanCode) {
      const byCode = await db.query(
        `SELECT id, operator_name, operator_code, service_type, status
         FROM operator_definitions
         WHERE deleted_at IS NULL AND lower(operator_code) = lower($1)
         LIMIT 1`,
        [cleanCode],
      );
      if (byCode.rowCount > 0) return byCode.rows[0];
    }

    // 2. Direct exact name match
    if (cleanName) {
      const byExact = await db.query(
        `SELECT id, operator_name, operator_code, service_type, status
         FROM operator_definitions
         WHERE deleted_at IS NULL AND lower(operator_name) = lower($1)
         LIMIT 1`,
        [cleanName],
      );
      if (byExact.rowCount > 0) return byExact.rows[0];

      // 3. Normalized alias matching
      let normalized = cleanName.toLowerCase();
      if (normalized.includes('airtel')) normalized = 'airtel';
      else if (normalized.includes('jio') || normalized.includes('reliance')) normalized = 'jio';
      else if (normalized.includes('vodafone') || normalized.includes('idea') || normalized === 'vi') normalized = 'vi';
      else if (normalized.includes('bsnl')) normalized = 'bsnl';

      const byIlike = await db.query(
        `SELECT id, operator_name, operator_code, service_type, status
         FROM operator_definitions
         WHERE deleted_at IS NULL AND (
           lower(operator_name) ILIKE $1 OR
           lower(operator_code) ILIKE $1 OR
           $2 ILIKE '%' || lower(operator_name) || '%'
         )
         ORDER BY (lower(operator_name) = lower($3)) DESC, created_at ASC
         LIMIT 1`,
        [`%${normalized}%`, cleanName.toLowerCase(), normalized],
      );
      if (byIlike.rowCount > 0) return byIlike.rows[0];
    }
  } catch (err) {
    console.warn('[PlanAPI Operator Match Warning]:', err.message);
  }
  return null;
}

/**
 * Merge new set-cookie headers into a cookie string
 */
function mergeCookies(existingCookieStr, setCookieHeaders) {
  if (!setCookieHeaders) return existingCookieStr || '';
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  const cookieMap = new Map();

  // Parse existing cookies
  if (existingCookieStr) {
    existingCookieStr.split(';').forEach((part) => {
      const trimmed = part.trim();
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (k && v) cookieMap.set(k, v);
      }
    });
  }

  // Parse new cookies
  headers.forEach((hdr) => {
    const firstPart = hdr.split(';')[0].trim();
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx > 0) {
      const k = firstPart.slice(0, eqIdx).trim();
      const v = firstPart.slice(eqIdx + 1).trim();
      if (k && v) cookieMap.set(k, v);
    }
  });

  return Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * Extract ASP.NET Hidden Fields (__VIEWSTATE, __EVENTVALIDATION, __VIEWSTATEGENERATOR)
 */
function extractAspNetTokens(html) {
  const viewStateMatch = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/i) || html.match(/name="__VIEWSTATE"\s+value="([^"]+)"/i);
  const generatorMatch = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/i) || html.match(/name="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/i);
  const validationMatch = html.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/i) || html.match(/name="__EVENTVALIDATION"\s+value="([^"]+)"/i);

  return {
    viewState: viewStateMatch ? viewStateMatch[1] : '',
    viewStateGenerator: generatorMatch ? generatorMatch[1] : 'C2EE9ABB',
    eventValidation: validationMatch ? validationMatch[1] : '',
  };
}

/**
 * Step 1: Login to planapi.in and establish authenticated session
 */
async function loginToPlanApiWeb(username, password) {
  const loginUrl = 'https://planapi.in/Login.aspx';
  let sessionCookies = '';

  // 1. Initial GET request to obtain tokens and session ID
  const initialRes = await fetch(loginUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });

  const initialHtml = await initialRes.text();
  const rawSetCookie = initialRes.headers.getSetCookie ? initialRes.headers.getSetCookie() : [initialRes.headers.get('set-cookie')].filter(Boolean);
  sessionCookies = mergeCookies('', rawSetCookie);

  const tokens = extractAspNetTokens(initialHtml);

  // 2. Submit Login POST request
  const bodyParams = new URLSearchParams();
  bodyParams.set('__EVENTTARGET', '');
  bodyParams.set('__EVENTARGUMENT', '');
  bodyParams.set('__VIEWSTATE', tokens.viewState);
  bodyParams.set('__VIEWSTATEGENERATOR', tokens.viewStateGenerator);
  if (tokens.eventValidation) {
    bodyParams.set('__EVENTVALIDATION', tokens.eventValidation);
  }
  bodyParams.set('ctl00$ContentPlaceHolder1$txtUsername', username);
  bodyParams.set('ctl00$ContentPlaceHolder1$Password', password);
  bodyParams.set('ctl00$ContentPlaceHolder1$chkRememberMe', 'on');

  const postRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': loginUrl,
      'Origin': 'https://planapi.in',
      'Cookie': sessionCookies,
    },
    body: bodyParams.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });

  const postCookies = postRes.headers.getSetCookie ? postRes.headers.getSetCookie() : [postRes.headers.get('set-cookie')].filter(Boolean);
  sessionCookies = mergeCookies(sessionCookies, postCookies);

  // Check login response (redirect 302 or dashboard HTML)
  const isRedirect = postRes.status === 302 || postRes.status === 301;
  const locationHeader = postRes.headers.get('location') || '';

  // Cache valid session for 25 minutes
  cachedWebSession = {
    cookies: sessionCookies,
    expiresAt: Date.now() + 25 * 60 * 1000,
    username,
  };

  return {
    cookies: sessionCookies,
    isRedirect,
    redirectLocation: locationHeader,
    status: postRes.status,
  };
}

/**
 * Step 2: Scrape Operator & Circle from OperatorLook.aspx using authenticated session
 */
async function scrapeOperatorLookFromWeb({ mobile, username, password, forceRelogin = false }) {
  const cleanMobile = String(mobile || '').replace(/\D/g, '').slice(-10);
  if (!cleanMobile || cleanMobile.length < 10) {
    throw new Error('Valid 10-digit mobile number is required.');
  }

  // Ensure active session
  let cookies = cachedWebSession.cookies;
  const isExpired = Date.now() >= cachedWebSession.expiresAt || cachedWebSession.username !== username;

  if (!cookies || isExpired || forceRelogin) {
    const loginRes = await loginToPlanApiWeb(username, password);
    cookies = loginRes.cookies;
  }

  const operatorLookUrl = `https://planapi.in/OperatorLook.aspx?mobile=${encodeURIComponent(cleanMobile)}`;
  const baseOperatorLookUrl = 'https://planapi.in/OperatorLook.aspx';

  // 1. Fetch OperatorLook.aspx with session cookies
  let lookRes = await fetch(operatorLookUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://planapi.in/Default.aspx',
      'Cookie': cookies,
    },
    signal: AbortSignal.timeout(15000),
  });

  let lookHtml = await lookRes.text();

  // If redirected back to Login.aspx, re-login once and retry
  if (lookHtml.includes('id="ContentPlaceHolder1_Password"') && !forceRelogin) {
    const loginRes = await loginToPlanApiWeb(username, password);
    cookies = loginRes.cookies;

    lookRes = await fetch(operatorLookUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://planapi.in/Default.aspx',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(15000),
    });
    lookHtml = await lookRes.text();
  }

  // 2. Parse HTML / DOM data
  let parsed = parseScrapedHtml(lookHtml, cleanMobile);

  // If initial GET didn't have data, try submitting form/postback on OperatorLook.aspx with mobile number
  if (!parsed.operator && lookHtml.includes('__VIEWSTATE')) {
    const tokens = extractAspNetTokens(lookHtml);
    const postBody = new URLSearchParams();
    postBody.set('__EVENTTARGET', '');
    postBody.set('__EVENTARGUMENT', '');
    postBody.set('__VIEWSTATE', tokens.viewState);
    postBody.set('__VIEWSTATEGENERATOR', tokens.viewStateGenerator);
    if (tokens.eventValidation) postBody.set('__EVENTVALIDATION', tokens.eventValidation);
    postBody.set('ctl00$ContentPlaceHolder1$txtMobile', cleanMobile);
    postBody.set('ctl00$ContentPlaceHolder1$txtNumber', cleanMobile);
    postBody.set('ctl00$ContentPlaceHolder1$Mobileno', cleanMobile);
    postBody.set('ctl00$ContentPlaceHolder1$btnSearch', 'Search');
    postBody.set('ctl00$ContentPlaceHolder1$btnSubmit', 'Submit');

    const formPostRes = await fetch(baseOperatorLookUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': baseOperatorLookUrl,
        'Origin': 'https://planapi.in',
        'Cookie': cookies,
      },
      body: postBody.toString(),
      signal: AbortSignal.timeout(15000),
    });

    const formHtml = await formPostRes.text();
    const secondParsed = parseScrapedHtml(formHtml, cleanMobile);
    if (secondParsed.operator) {
      parsed = secondParsed;
      lookHtml = formHtml;
    }
  }

  // 3. Fallback: also try internal API endpoint if page uses AJAX
  if (!parsed.operator) {
    try {
      const ajaxUrl = `https://planapi.in/api/mobile/OperatorLook?mobile=${cleanMobile}&number=${cleanMobile}`;
      const ajaxRes = await fetch(ajaxUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Cookie': cookies,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (ajaxRes.ok) {
        const ajaxText = await ajaxRes.text();
        const jsonParsed = parsePlanApiResponse(ajaxText);
        if (jsonParsed.operator) {
          parsed = jsonParsed;
          lookHtml = ajaxText;
        }
      }
    } catch (_) {}
  }

  return {
    ...parsed,
    rawHtml: lookHtml.slice(0, 3000),
    cookiesAcquired: Boolean(cookies),
  };
}

/**
 * Parse Scraped HTML from OperatorLook.aspx for Operator, Circle, and Plans
 */
function parseScrapedHtml(html, mobile) {
  let operator = '';
  let circle = '';
  let opcode = '';
  let circlecode = '';
  let plans = [];

  if (!html || typeof html !== 'string') {
    return { operator: '', circle: '', opcode: '', circlecode: '', plans: [] };
  }

  // 1. Try finding JSON inside response
  if (html.trim().startsWith('{') || html.trim().startsWith('[')) {
    return parsePlanApiResponse(html);
  }

  // 2. Scrape from table rows <tr><td>...</td></tr>
  const tableRows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  for (const tr of tableRows) {
    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const cellTexts = tds.map((td) => td.replace(/<[^>]+>/g, '').trim());

    for (let i = 0; i < cellTexts.length; i++) {
      const text = cellTexts[i];
      const lower = text.toLowerCase();

      // Check for known operators
      if (lower.includes('airtel') || lower === 'jio' || lower.includes('reliance jio') || lower.includes('vodafone') || lower.includes('idea') || lower === 'vi' || lower.includes('bsnl')) {
        if (!operator) operator = text;
      }
      // Check for common circles
      if (lower.includes('delhi') || lower.includes('mumbai') || lower.includes('up') || lower.includes('bihar') || lower.includes('punjab') || lower.includes('rajasthan') || lower.includes('gujarat') || lower.includes('maharashtra') || lower.includes('bengal') || lower.includes('karnataka') || lower.includes('tamil nadu') || lower.includes('kerala') || lower.includes('andhra')) {
        if (!circle) circle = text;
      }
    }
  }

  // 3. Scrape from specific ASP.NET label/span IDs or classes
  const opSpan = html.match(/id="[^"]*(?:lblOperator|lblOpName|OperatorName|OpName|lblCircle|circle)[^"]*"[^>]*>([^<]+)<\/span>/i);
  if (opSpan && !operator) {
    operator = opSpan[1].trim();
  }

  const cirSpan = html.match(/id="[^"]*(?:lblCircle|CircleName|lblState)[^"]*"[^>]*>([^<]+)<\/span>/i);
  if (cirSpan && !circle) {
    circle = cirSpan[1].trim();
  }

  // 4. Regex pattern search for Operator: ..., Circle: ...
  if (!operator) {
    const opRegex = /(?:Operator|OPNAME|Network)\s*[:=]\s*([A-Za-z0-9\s&]+?)(?:<|,|\n|;|\t|Circle|State)/i;
    const opM = html.match(opRegex);
    if (opM) operator = opM[1].trim();
  }

  if (!circle) {
    const cirRegex = /(?:Circle|State|Region)\s*[:=]\s*([A-Za-z0-9\s()&]+?)(?:<|,|\n|;|\t|Plan|Type)/i;
    const cirM = html.match(cirRegex);
    if (cirM) circle = cirM[1].trim();
  }

  // Clean values
  operator = operator.replace(/&amp;/g, '&').replace(/[\r\n\t]+/g, ' ').trim();
  circle = circle.replace(/&amp;/g, '&').replace(/[\r\n\t]+/g, ' ').trim();

  return {
    status: operator ? 'SUCCESS' : 'LOOKUP_COMPLETE',
    operator: operator || '',
    circle: circle || '',
    opcode: opcode || '',
    circlecode: circlecode || '',
    plans,
  };
}

/**
 * Helper to parse JSON response from PlanAPI
 */
function parsePlanApiResponse(rawText) {
  let operator = '';
  let circle = '';
  let opcode = '';
  let circlecode = '';
  let status = 'SUCCESS';
  let message = '';
  let parsedJson = null;

  if (!rawText || typeof rawText !== 'string') {
    return { status: 'FAILED', message: 'Empty response from Plan API.', raw: '' };
  }

  const trimmed = rawText.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      parsedJson = JSON.parse(trimmed);
      const data = Array.isArray(parsedJson) ? parsedJson[0] : parsedJson;
      const resp = data.RESPONSE || data.response || data.Data || data.data || data;

      operator = resp.OPERATOR || resp.operator || resp.Operator || resp.OpName || resp.op || resp.operator_name || '';
      circle = resp.CIRCLE || resp.circle || resp.Circle || resp.circle_name || resp.CircleName || resp.State || '';
      opcode = resp.OPCODE || resp.opcode || resp.OpCode || resp.operator_code || resp.OpId || '';
      circlecode = resp.CIRCLECODE || resp.circlecode || resp.CircleCode || resp.circle_code || '';

      const st = data.STATUS || data.status || data.Status || data.msg || data.Message;
      if (st) status = String(st);
      message = data.MESSAGE || data.message || data.msg || data.Error || '';
    } catch (_) {}
  }

  return {
    status: status || (operator ? 'SUCCESS' : 'UNKNOWN'),
    operator: operator || '',
    circle: circle || '',
    opcode: opcode || '',
    circlecode: circlecode || '',
    message: message || (operator ? 'Operator details fetched successfully.' : 'No operator info parsed.'),
    parsedJson,
    raw: trimmed,
  };
}

/**
 * Main Entry Point: Fetch Operator & Circle Lookup (Web Scraper + API modes)
 */
async function fetchOperatorLookup({
  db,
  decryptServiceConfig,
  mobile,
  overrideConfig = null,
}) {
  const cleanMobile = String(mobile || '').replace(/\D/g, '');
  if (!cleanMobile || cleanMobile.length < 10) {
    throw new Error('Valid 10-digit mobile number is required for Operator Lookup.');
  }
  const mobile10 = cleanMobile.slice(-10);

  // Determine configuration
  let config = overrideConfig;
  let isEnabled = true;

  if (!config) {
    const row = await db.query(
      "SELECT config_ciphertext, is_enabled FROM admin_service_settings WHERE service_key = 'plan_api'",
    );
    if (!row.rowCount) {
      throw new Error('Plan API / Operator Lookup service is not configured in Admin Settings.');
    }
    isEnabled = Boolean(row.rows[0].is_enabled);
    if (!isEnabled) {
      throw new Error('Plan API / Operator Lookup service is currently disabled in Admin Settings.');
    }
    try {
      config = decryptServiceConfig(row.rows[0].config_ciphertext);
    } catch (err) {
      throw new Error('Failed to decrypt Plan API configuration.');
    }
  }

  const username = String(config.memberId || config.userId || config.username || '').trim();
  const password = String(config.password || config.apiKey || config.token || '').trim();
  const mode = String(config.mode || 'scraper').toLowerCase(); // 'scraper' or 'api'
  const startTime = Date.now();

  if (!username || !password) {
    throw new Error('PlanAPI Login Username (Mobile No / Member ID) and Password are required.');
  }

  let result;
  let rawResponseText = '';

  // 1. Web Scraping Mode: Logs in to planapi.in and scrapes OperatorLook.aspx
  if (mode === 'scraper' || !config.customUrlTemplate) {
    try {
      const scraped = await scrapeOperatorLookFromWeb({
        mobile: mobile10,
        username,
        password,
      });

      result = scraped;
      rawResponseText = scraped.rawHtml || '';
    } catch (scrapeErr) {
      console.warn('[PlanAPI Web Scraper Warning]:', scrapeErr.message);
      // Fallback to direct HTTP fetch
      result = { operator: '', circle: '', opcode: '', circlecode: '' };
    }
  }

  // 2. Direct API Mode / Fallback: If custom URL or scraper yielded no operator
  if (!result || !result.operator) {
    const apiUrl = String(config.apiUrl || 'https://planapi.in/OperatorLook.aspx').trim();
    const requestType = String(config.requestType || 'GET').trim().toUpperCase();
    const customUrlTemplate = String(config.customUrlTemplate || '').trim();
    const paramMemberId = String(config.paramMemberId || 'memberid').trim();
    const paramPassword = String(config.paramPassword || 'password').trim();
    const paramMobile = String(config.paramMobile || 'mobile').trim();

    let targetUrl = '';
    let reqBody = undefined;

    if (customUrlTemplate) {
      targetUrl = customUrlTemplate
        .replace(/\[MEMBER_ID\]/gi, encodeURIComponent(username))
        .replace(/\[USER_ID\]/gi, encodeURIComponent(username))
        .replace(/\[PASSWORD\]/gi, encodeURIComponent(password))
        .replace(/\[API_KEY\]/gi, encodeURIComponent(password))
        .replace(/\[MOBILE_NO\]/gi, encodeURIComponent(mobile10))
        .replace(/\[MOBILE\]/gi, encodeURIComponent(mobile10))
        .replace(/\[NUMBER\]/gi, encodeURIComponent(mobile10));
    } else if (requestType === 'GET') {
      const urlObj = new URL(apiUrl.startsWith('http') ? apiUrl : `https://${apiUrl}`);
      urlObj.searchParams.set(paramMemberId, username);
      urlObj.searchParams.set(paramPassword, password);
      urlObj.searchParams.set(paramMobile, mobile10);
      targetUrl = urlObj.toString();
    } else {
      targetUrl = apiUrl;
      const bParams = new URLSearchParams();
      bParams.set(paramMemberId, username);
      bParams.set(paramPassword, password);
      bParams.set(paramMobile, mobile10);
      reqBody = bParams.toString();
    }

    try {
      const directRes = await fetch(targetUrl, {
        method: requestType,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/html, */*',
          ...(reqBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: reqBody,
        signal: AbortSignal.timeout(15000),
      });

      rawResponseText = await directRes.text();
      const parsedDirect = parsePlanApiResponse(rawResponseText);
      if (parsedDirect.operator) {
        result = parsedDirect;
      } else {
        const parsedHtml = parseScrapedHtml(rawResponseText, mobile10);
        result = parsedHtml;
      }
    } catch (dirErr) {
      console.warn('[PlanAPI Direct Call Warning]:', dirErr.message);
    }
  }

  const latencyMs = Date.now() - startTime;
  const operatorName = result ? (result.operator || '') : '';
  const circleName = result ? (result.circle || 'All Circle') : 'All Circle';
  const opcode = result ? (result.opcode || '') : '';
  const circlecode = result ? (result.circlecode || '') : '';

  // Match with internal database operator definitions
  const matchedOperator = await matchSystemOperator(db, operatorName, opcode);

  return {
    ok: Boolean(operatorName),
    source: 'planapi_web_scraper',
    mobile: mobile10,
    operator: operatorName || (matchedOperator ? matchedOperator.operator_name : 'Unknown'),
    circle: circleName || 'All Circle',
    operatorCode: opcode || (matchedOperator ? matchedOperator.operator_code : ''),
    circleCode: circlecode || '',
    status: result?.status || (operatorName ? 'SUCCESS' : 'COMPLETED'),
    message: operatorName ? 'Operator details scraped and fetched successfully.' : 'Details fetched from web portal.',
    matchedOperator: matchedOperator ? {
      id: matchedOperator.id,
      name: matchedOperator.operator_name,
      code: matchedOperator.operator_code,
      serviceType: matchedOperator.service_type,
      status: matchedOperator.status,
    } : null,
    latencyMs,
    rawResponse: rawResponseText.slice(0, 3000),
  };
}

module.exports = {
  fetchOperatorLookup,
  loginToPlanApiWeb,
  scrapeOperatorLookFromWeb,
  parseScrapedHtml,
  parsePlanApiResponse,
  matchSystemOperator,
};
