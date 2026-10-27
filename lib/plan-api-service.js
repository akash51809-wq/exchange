'use strict';

/**
 * ezytm plan API & Operator Lookup Service
 * Fetches live Mobile Operator and Circle using ezytm plan API:
 * https://planapi.in/api/Mobile/OperatorFetchNew?ApiUserID=5100&ApiPassword=amart@74&Mobileno=12XXXXXX90
 */

const DEFAULT_EZYTM_API_URL = process.env.EZYTM_PLAN_API_URL || 'https://planapi.in/api/Mobile/OperatorFetchNew';
const DEFAULT_EZYTM_API_USER_ID = process.env.EZYTM_PLAN_API_USER_ID || '5100';
const DEFAULT_EZYTM_API_PASSWORD = process.env.EZYTM_PLAN_API_PASSWORD || 'amart@74';

// In-memory active session cookie jar with TTL
let cachedWebSession = {
  cookies: '',
  expiresAt: 0,
  username: '',
};

/**
 * Normalize circle name to standard system circles
 */
function normalizeCircleName(rawCircle) {
  if (!rawCircle) return 'All';
  const c = String(rawCircle).trim();
  const lower = c.toLowerCase();

  if ((lower.includes('up') || lower.includes('u.p') || lower.includes('uttar pradesh')) && lower.includes('east')) return 'UP East';
  if ((lower.includes('up') || lower.includes('u.p') || lower.includes('uttar pradesh')) && lower.includes('west')) return 'UP West';
  if (lower.includes('delhi')) return 'Delhi';
  if (lower.includes('mumbai')) return 'Mumbai';
  if (lower.includes('kolkata') || lower.includes('calcutta')) return 'Kolkata';
  if (lower.includes('maharashtra') || lower.includes('goa')) return 'Maharashtra & Goa';
  if (lower.includes('bihar') || lower.includes('jharkhand')) return 'Bihar & Jharkhand';
  if (lower.includes('gujarat')) return 'Gujarat';
  if (lower.includes('haryana')) return 'Haryana';
  if (lower.includes('punjab')) return 'Punjab';
  if (lower.includes('rajasthan')) return 'Rajasthan';
  if (lower.includes('karnataka')) return 'Karnataka';
  if (lower.includes('kerala')) return 'Kerala';
  if (lower.includes('chennai')) return 'Chennai';
  if (lower.includes('tamil')) return 'Tamil Nadu';
  if (lower.includes('andhra') || lower.includes('telangana')) return 'Andhra Pradesh';
  if (lower.includes('bengal')) return 'West Bengal';
  if (lower.includes('assam')) return 'Assam';
  if (lower.includes('north east') || lower.includes('northeast')) return 'North East';
  if (lower.includes('orissa') || lower.includes('odisha')) return 'Orissa';
  if (lower.includes('himachal')) return 'Himachal Pradesh';
  if (lower.includes('jammu') || lower.includes('kashmir')) return 'Jammu Kashmir';

  return c;
}

/**
 * Fetch live Operator & Circle from ezytm plan API
 * Endpoint: https://planapi.in/api/Mobile/OperatorFetchNew?ApiUserID=5100&ApiPassword=amart@74&Mobileno=12XXXXXX90
 * Type: GET
 * Parameters:
 *   - ApiUserID (string, required): 4-digit MemberID credentials
 *   - ApiPassword (string, required): ApiPassword credentials
 *   - Mobileno (string, required): Customer 10-digit Mobile number
 */
async function fetchEzytmOperatorLookup({
  apiUserId = DEFAULT_EZYTM_API_USER_ID,
  apiPassword = DEFAULT_EZYTM_API_PASSWORD,
  mobile,
  apiUrl = DEFAULT_EZYTM_API_URL,
}) {
  const cleanMobile = String(mobile || '').replace(/\D/g, '').slice(-10);
  if (!cleanMobile || cleanMobile.length < 10) {
    throw new Error('Valid 10-digit mobile number is required.');
  }

  const cleanUser = String(apiUserId || DEFAULT_EZYTM_API_USER_ID).trim();
  const cleanPass = String(apiPassword || DEFAULT_EZYTM_API_PASSWORD).trim();
  if (!cleanUser || !cleanPass) {
    throw new Error('ezytm plan API credentials are not configured. Please configure ApiUserID and ApiPassword in Admin Service Settings.');
  }

  const endpoint = String(apiUrl || DEFAULT_EZYTM_API_URL).trim();
  const urlObj = new URL(endpoint.startsWith('http') ? endpoint : `https://${endpoint}`);
  urlObj.searchParams.set('ApiUserID', cleanUser);
  urlObj.searchParams.set('ApiPassword', cleanPass);
  urlObj.searchParams.set('Mobileno', cleanMobile);

  const startTime = Date.now();
  const res = await fetch(urlObj.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      'Accept': 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(12000),
  });

  const rawText = await res.text();
  const latencyMs = Date.now() - startTime;
  let rawJson = null;
  try {
    rawJson = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Invalid JSON response from ezytm plan API: ${rawText.slice(0, 150)}`);
  }

  // Normalize response keys to eliminate trailing spaces (e.g. 'Operator ')
  const data = {};
  for (const [k, v] of Object.entries(rawJson)) {
    data[k.trim()] = v;
  }

  const operator = String(data.Operator || data.operator || data.OpName || '').trim();
  const circle = String(data.Circle || data.circle || data.circle_name || '').trim();
  const opcode = String(data.OpCode || data.opcode || data.OpId || '').trim();
  const circlecode = String(data.CircleCode || data.circlecode || '').trim();
  const message = String(data.Message || data.message || data.msg || '').trim();
  const errorVal = String(data.ERROR !== undefined ? data.ERROR : (data.error !== undefined ? data.error : '')).trim();

  const isSuccess = Boolean(
    operator &&
    operator.toLowerCase() !== 'null' &&
    operator.toLowerCase() !== 'undefined' &&
    (errorVal === '0' || errorVal === '' || data.STATUS === '1' || data.STATUS === 'SUCCESS')
  );

  if (!isSuccess) {
    const errMsg = message || `ezytm plan API lookup failed (Error: ${data.ERROR || data.STATUS || 'Unknown'})`;
    return {
      ok: false,
      status: 'FAILED',
      message: errMsg,
      operator: '',
      circle: '',
      opcode: '',
      circlecode: '',
      latencyMs,
      raw: rawText,
      rawJson,
    };
  }

  return {
    ok: true,
    status: 'SUCCESS',
    operator,
    circle,
    opcode,
    circlecode,
    message: message || 'Operator details fetched successfully from ezytm plan API.',
    latencyMs,
    raw: rawText,
    rawJson,
  };
}

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
 * Main Entry Point: Fetch Operator & Circle Lookup (ezytm plan API)
 * Automatically fetches live Operator and Circle before routing recharge to highest seller margin.
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
      config = {
        brandName: 'ezytm plan API',
        activeBrand: 'ezytm plan API',
        apiUserId: DEFAULT_EZYTM_API_USER_ID,
        apiPassword: DEFAULT_EZYTM_API_PASSWORD,
        apiUrl: DEFAULT_EZYTM_API_URL,
        requestType: 'GET',
      };
      isEnabled = Boolean(config.apiUserId && config.apiPassword);
      if (!isEnabled) {
        return {
          ok: false,
          operator: '',
          circle: '',
          message: 'Operator Lookup credentials are not configured in Admin Settings.',
          matchedOperator: null,
        };
      }
    } else {
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
  }

  const startTime = Date.now();
  let result = null;
  let rawResponseText = '';

  const ezytmUserId = String(
    config.apiUserId ||
    config.ApiUserID ||
    config.userId ||
    config.memberId ||
    DEFAULT_EZYTM_API_USER_ID
  ).trim();

  const ezytmPassword = String(
    config.apiPassword ||
    config.ApiPassword ||
    config.password ||
    config.token ||
    DEFAULT_EZYTM_API_PASSWORD
  ).trim();

  const ezytmApiUrl = String(
    config.apiUrl ||
    DEFAULT_EZYTM_API_URL
  ).trim();

  try {
    result = await fetchEzytmOperatorLookup({
      apiUserId: ezytmUserId,
      apiPassword: ezytmPassword,
      mobile: mobile10,
      apiUrl: ezytmApiUrl,
    });
    rawResponseText = result.raw || JSON.stringify(result.rawJson || {});
  } catch (err) {
    result = {
      ok: false,
      status: 'FAILED',
      message: err.message,
      operator: '',
      circle: '',
      opcode: '',
      circlecode: '',
      raw: err.message,
    };
    rawResponseText = err.message;
  }

  const latencyMs = result?.latencyMs || (Date.now() - startTime);
  const rawOperatorName = result ? (result.operator || '') : '';
  const rawCircleName = result ? (result.circle || 'All') : 'All';
  const normalizedCircle = normalizeCircleName(rawCircleName);
  const opcode = result ? (result.opcode || '') : '';
  const circlecode = result ? (result.circlecode || '') : '';

  // Match with internal database operator definitions
  const matchedOperator = await matchSystemOperator(db, rawOperatorName, opcode);

  const finalOperatorName = (matchedOperator ? matchedOperator.operator_name : '') || rawOperatorName || 'Unknown';
  const finalOperatorCode = (matchedOperator ? matchedOperator.operator_code : '') || opcode;

  return {
    ok: Boolean(rawOperatorName && result && result.ok !== false),
    source: 'ezytm plan API',
    brand: 'ezytm plan API',
    mobile: mobile10,
    operator: finalOperatorName,
    circle: normalizedCircle,
    operatorCode: finalOperatorCode,
    circleCode: circlecode,
    rawOperator: rawOperatorName,
    rawCircle: rawCircleName,
    status: result?.status || (rawOperatorName ? 'SUCCESS' : 'FAILED'),
    message: result?.message || (rawOperatorName ? 'Operator details fetched successfully.' : 'No operator info parsed.'),
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
  DEFAULT_EZYTM_API_URL,
  DEFAULT_EZYTM_API_USER_ID,
  DEFAULT_EZYTM_API_PASSWORD,
  fetchEzytmOperatorLookup,
  normalizeCircleName,
  fetchOperatorLookup,
  loginToPlanApiWeb,
  scrapeOperatorLookFromWeb,
  parseScrapedHtml,
  parsePlanApiResponse,
  matchSystemOperator,
  // Backward compatibility aliases
  DEFAULT_ERS_API_URL: DEFAULT_EZYTM_API_URL,
  DEFAULT_ERS_API_USER_ID: DEFAULT_EZYTM_API_USER_ID,
  DEFAULT_ERS_TOKEN: DEFAULT_EZYTM_API_PASSWORD,
  fetchErsOperatorLookup: fetchEzytmOperatorLookup,
};
