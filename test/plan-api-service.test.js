'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_EZYTM_API_URL,
  DEFAULT_EZYTM_ROFFER_URL,
  DEFAULT_EZYTM_API_USER_ID,
  DEFAULT_EZYTM_API_PASSWORD,
  fetchEzytmOperatorLookup,
  fetchEzytmRoffer,
  fetchOperatorLookup,
  normalizeCircleName,
} = require('../lib/plan-api-service');
const createAdminServiceSettingsPage = require('../pages/admin-service-settings');

test('ezytm plan API - Defaults and Constants', () => {
  assert.equal(DEFAULT_EZYTM_API_URL, 'https://planapi.in/api/Mobile/OperatorFetchNew');
  assert.equal(DEFAULT_EZYTM_ROFFER_URL, 'https://planapi.in/api/Mobile/RofferCheck');
  assert.equal(DEFAULT_EZYTM_API_USER_ID, '5100');
  assert.equal(DEFAULT_EZYTM_API_PASSWORD, 'amart@74');
});

test('normalizeCircleName standardizes circle names correctly', () => {
  assert.equal(normalizeCircleName('U.P. (East)'), 'UP East');
  assert.equal(normalizeCircleName('Uttar Pradesh East'), 'UP East');
  assert.equal(normalizeCircleName('UP West'), 'UP West');
  assert.equal(normalizeCircleName('Delhi NCR'), 'Delhi');
  assert.equal(normalizeCircleName('Mumbai'), 'Mumbai');
  assert.equal(normalizeCircleName('Bihar & Jharkhand'), 'Bihar & Jharkhand');
  assert.equal(normalizeCircleName(null), 'All');
});

test('fetchEzytmOperatorLookup sends GET request with ApiUserID, ApiPassword, and Mobileno', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let calledUrl = '';
  let calledMethod = '';

  globalThis.fetch = async (url, options) => {
    calledUrl = String(url);
    calledMethod = options.method;
    return {
      text: async () => JSON.stringify({
        ERROR: '0',
        STATUS: '1',
        Mobile: '9335819686',
        Operator: 'Airtel',
        OpCode: 'AT',
        Circle: 'UP East',
        CircleCode: '12',
        Message: 'Success',
      }),
    };
  };

  const res = await fetchEzytmOperatorLookup({
    apiUserId: '5100',
    apiPassword: 'amart@74',
    mobile: '9335819686',
  });

  assert.equal(calledMethod, 'GET');
  const parsed = new URL(calledUrl);
  assert.equal(parsed.origin + parsed.pathname, 'https://planapi.in/api/Mobile/OperatorFetchNew');
  assert.equal(parsed.searchParams.get('ApiUserID'), '5100');
  assert.equal(parsed.searchParams.get('ApiPassword'), 'amart@74');
  assert.equal(parsed.searchParams.get('Mobileno'), '9335819686');

  assert.equal(res.ok, true);
  assert.equal(res.operator, 'Airtel');
  assert.equal(res.circle, 'UP East');
  assert.equal(res.opcode, 'AT');
  assert.equal(res.circlecode, '12');
  assert.equal(res.status, 'SUCCESS');
});

test('fetchEzytmOperatorLookup handles invalid IP or error response gracefully', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => ({
    text: async () => JSON.stringify({
      ERROR: '1',
      STATUS: '1',
      Mobile: '9335819686',
      Operator: '',
      OpCode: null,
      Circle: '',
      CircleCode: null,
      Message: 'Invalid Ip address your IP is 49.43.112.72',
    }),
  });

  const res = await fetchEzytmOperatorLookup({
    apiUserId: '5100',
    apiPassword: 'amart@74',
    mobile: '9335819686',
  });

  assert.equal(res.ok, false);
  assert.equal(res.status, 'FAILED');
  assert.match(res.message, /Invalid Ip address/);
});

test('fetchOperatorLookup routes through ezytm plan API and matches database operator', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => ({
    text: async () => JSON.stringify({
      ERROR: '0',
      STATUS: '1',
      Mobile: '9876543210',
      Operator: 'Jio',
      OpCode: 'JIO',
      Circle: 'Delhi',
      CircleCode: '5',
      Message: 'Success',
    }),
  });

  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('FROM operator_definitions')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'op-jio-uuid',
            operator_name: 'Reliance Jio',
            operator_code: 'JIO',
            service_type: 'Mobile Recharge',
            status: 'active',
          }],
        };
      }
      if (sql.includes("service_key = 'plan_api'")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  const lookup = await fetchOperatorLookup({
    db: mockDb,
    decryptServiceConfig: () => ({}),
    mobile: '9876543210',
  });

  assert.equal(lookup.ok, true);
  assert.equal(lookup.brand, 'ezytm plan API');
  assert.equal(lookup.operator, 'Reliance Jio');
  assert.equal(lookup.operatorCode, 'JIO');
  assert.equal(lookup.circle, 'Delhi');
  assert.ok(lookup.matchedOperator);
  assert.equal(lookup.matchedOperator.code, 'JIO');
});

test('Admin Service Settings - Plan API handlers save and test ezytm plan API config', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => ({
    text: async () => JSON.stringify({
      ERROR: '0',
      STATUS: '1',
      Mobile: '9335819686',
      Operator: 'Airtel',
      OpCode: 'AT',
      Circle: 'UP East',
      CircleCode: '12',
      Message: 'Success',
    }),
  });

  const savedRows = [];
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('admin_service_settings')) {
        savedRows.push({ sql, params });
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  const mockEncrypt = (data) => Buffer.from(JSON.stringify(data));
  const mockDecrypt = (buf) => JSON.parse(buf.toString());

  const serviceSettingsPage = createAdminServiceSettingsPage({
    db: mockDb,
    encryptServiceConfig: mockEncrypt,
    decryptServiceConfig: mockDecrypt,
    fetchOperatorLookup: async ({ overrideConfig, mobile }) => ({
      ok: true,
      brand: 'ezytm plan API',
      mobile,
      operator: 'Airtel',
      circle: 'UP East',
      operatorCode: 'AT',
      circleCode: '12',
      message: 'Operator details fetched successfully.',
      status: 'SUCCESS',
      latencyMs: 120,
    }),
    httpError: (msg, code) => {
      const err = new Error(msg);
      err.statusCode = code;
      return err;
    },
    sendJson: (res, code, data) => {
      res.statusCode = code;
      res.data = data;
    },
    renderAdminNavigation: () => '',
    addPanelChrome: (opt, content) => content,
  });

  // Test handleSavePlanApiSettings
  const req = {};
  const saveRes = {};
  await serviceSettingsPage.handleSavePlanApiSettings(req, saveRes, {
    isEnabled: true,
    apiUserId: '5100',
    apiPassword: 'amart@74',
    apiUrl: 'https://planapi.in/api/Mobile/OperatorFetchNew',
  });

  assert.equal(saveRes.statusCode, 200);
  assert.equal(saveRes.data.ok, true);
  assert.equal(saveRes.data.planApi.brandName, 'Plan API (EZYTM)');
  assert.equal(saveRes.data.planApi.apiUserId, '5100');
  assert.equal(saveRes.data.planApi.apiPassword, 'amart@74');
  assert.equal(saveRes.data.planApi.requestType, 'GET');
  assert.equal(saveRes.data.planApi.circleUrl, 'https://planapi.in/api/Mobile/OperatorFetchNew');
  assert.equal(saveRes.data.planApi.rofferUrl, 'https://planapi.in/api/Mobile/RofferCheck');

  // Test handleTestPlanApi
  const testRes = {};
  await serviceSettingsPage.handleTestPlanApi(req, testRes, {
    mobile: '9335819686',
    apiUserId: '5100',
    apiPassword: 'amart@74',
  });

  assert.equal(testRes.statusCode, 200);
  assert.equal(testRes.data.ok, true);
  assert.equal(testRes.data.brand, 'Plan API (EZYTM)');
  assert.equal(testRes.data.operator, 'Airtel');
  assert.equal(testRes.data.circle, 'UP East');
});

test('fetchEzytmRoffer sends GET request with credentials and operator_code', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let calledUrl = '';
  let calledMethod = '';

  globalThis.fetch = async (url, options) => {
    calledUrl = String(url);
    calledMethod = options.method;
    return {
      text: async () => JSON.stringify({
        ERROR: '0',
        STATUS: '1',
        MOBILENO: '9335819686',
        RDATA: [
          { Price: '199', LogDescription: 'Unlimited Calls + 1.5GB/Day + 100 SMS/Day' },
          { Price: '299', LogDescription: 'Unlimited Calls + 2GB/Day for 28 Days' },
        ],
        MESSAGE: 'Offers fetched successfully',
      }),
    };
  };

  const res = await fetchEzytmRoffer({
    apiUserId: '5100',
    apiPassword: 'amart@74',
    mobile: '9335819686',
    operatorCode: '2',
  });

  assert.equal(calledMethod, 'GET');
  const parsed = new URL(calledUrl);
  assert.equal(parsed.origin + parsed.pathname, 'https://planapi.in/api/Mobile/RofferCheck');
  assert.equal(parsed.searchParams.get('apimember_id'), '5100');
  assert.equal(parsed.searchParams.get('api_password'), 'amart@74');
  assert.equal(parsed.searchParams.get('operator_code'), '2');
  assert.equal(parsed.searchParams.get('mobile_no'), '9335819686');

  assert.equal(res.ok, true);
  assert.equal(res.status, 'SUCCESS');
  assert.equal(res.mobile, '9335819686');
  assert.equal(res.operatorCode, '2');
  assert.equal(res.offers.length, 2);
  assert.equal(res.offers[0].Price, '199');
});

test('Admin Service Settings - handleTestPlanApiRoffer executes R-Offer fetch', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => ({
    text: async () => JSON.stringify({
      ERROR: '0',
      STATUS: '1',
      MOBILENO: '9335819686',
      RDATA: [
        { Price: '239', LogDescription: 'Unlimited Calls + 1.5GB/day 28 days' },
      ],
      MESSAGE: 'Success',
    }),
  });

  const mockDb = { query: async () => ({ rowCount: 0, rows: [] }) };
  const serviceSettingsPage = createAdminServiceSettingsPage({
    db: mockDb,
    encryptServiceConfig: (d) => Buffer.from(JSON.stringify(d)),
    decryptServiceConfig: (b) => JSON.parse(b.toString()),
    httpError: (msg, code) => {
      const err = new Error(msg);
      err.statusCode = code;
      return err;
    },
    sendJson: (res, code, data) => {
      res.statusCode = code;
      res.data = data;
    },
    renderAdminNavigation: () => '',
    addPanelChrome: (opt, content) => content,
  });

  const rofferRes = {};
  await serviceSettingsPage.handleTestPlanApiRoffer({}, rofferRes, {
    mobile: '9335819686',
    operatorCode: '2',
    apiUserId: '5100',
    apiPassword: 'amart@74',
  });

  assert.equal(rofferRes.statusCode, 200);
  assert.equal(rofferRes.data.ok, true);
  assert.equal(rofferRes.data.brand, 'Plan API (EZYTM)');
  assert.equal(rofferRes.data.mobile, '9335819686');
  assert.equal(rofferRes.data.offers.length, 1);
  assert.equal(rofferRes.data.offers[0].Price, '239');
});

test('Admin Service Settings - UI rendering reflects PLAN API, Choose Provider, and Hidden URLs', async () => {
  const mockDb = { query: async () => ({ rowCount: 0, rows: [] }) };
  const serviceSettingsPage = createAdminServiceSettingsPage({
    db: mockDb,
    encryptServiceConfig: (d) => Buffer.from(JSON.stringify(d)),
    decryptServiceConfig: (b) => JSON.parse(b.toString()),
    httpError: (msg, code) => new Error(msg),
    sendJson: () => {},
    renderAdminNavigation: () => '<nav>AdminNav</nav>',
    addPanelChrome: (opt, content) => content,
  });

  let renderedHtml = '';
  const mockRes = {
    writeHead: () => {},
    setHeader: () => {},
    end: (html) => {
      renderedHtml = html;
    },
  };

  await serviceSettingsPage.sendAdminServiceSettingsPage({ method: 'GET' }, mockRes);

  // Tab renamed to strictly "PLAN API"
  assert.match(renderedHtml, /<i class="fa fa-search"><\/i>\s*PLAN API/);
  assert.doesNotMatch(renderedHtml, /Plan API \(ezytm\)/);

  // Choose Provider dropdown present with Plan API (EZYTM)
  assert.match(renderedHtml, /id="planApiProvider"/);
  assert.match(renderedHtml, /<option value="ezytm"[^>]*>Plan API \(EZYTM\)<\/option>/);

  // Credentials fields present
  assert.match(renderedHtml, /id="ezytmApiUserId"/);
  assert.match(renderedHtml, /id="ezytmApiPassword"/);

  // Raw URL fields MUST NOT exist inside the form
  assert.doesNotMatch(renderedHtml, /<input[^>]+id="ezytmApiUrl"/);
  assert.doesNotMatch(renderedHtml, /<input[^>]+id="rofferApiUrl"/);

  // R-Offer check section and button present
  assert.match(renderedHtml, /Check R-Offer/);
  assert.match(renderedHtml, /id="btnTestRoffer"/);
  assert.match(renderedHtml, /id="testRofferOpCode"/);
  assert.match(renderedHtml, /id="testRofferMobile"/);
});
