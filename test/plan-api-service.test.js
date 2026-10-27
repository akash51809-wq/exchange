'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_EZYTM_API_URL,
  DEFAULT_EZYTM_API_USER_ID,
  DEFAULT_EZYTM_API_PASSWORD,
  fetchEzytmOperatorLookup,
  fetchOperatorLookup,
  normalizeCircleName,
} = require('../lib/plan-api-service');
const createAdminServiceSettingsPage = require('../pages/admin-service-settings');

test('ezytm plan API - Defaults and Constants', () => {
  assert.equal(DEFAULT_EZYTM_API_URL, 'https://planapi.in/api/Mobile/OperatorFetchNew');
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
  assert.equal(saveRes.data.planApi.brandName, 'ezytm plan API');
  assert.equal(saveRes.data.planApi.apiUserId, '5100');
  assert.equal(saveRes.data.planApi.apiPassword, 'amart@74');
  assert.equal(saveRes.data.planApi.requestType, 'GET');

  // Test handleTestPlanApi
  const testRes = {};
  await serviceSettingsPage.handleTestPlanApi(req, testRes, {
    mobile: '9335819686',
    apiUserId: '5100',
    apiPassword: 'amart@74',
    apiUrl: 'https://planapi.in/api/Mobile/OperatorFetchNew',
  });

  assert.equal(testRes.statusCode, 200);
  assert.equal(testRes.data.ok, true);
  assert.equal(testRes.data.brand, 'ezytm plan API');
  assert.equal(testRes.data.operator, 'Airtel');
  assert.equal(testRes.data.circle, 'UP East');
});
