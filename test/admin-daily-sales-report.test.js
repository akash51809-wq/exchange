'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createAdminDailySalesReportPage = require('../pages/admin-daily-sales-report');
const { addPanelChrome } = require('../lib/panel-chrome');

function createMockDb() {
  return {
    async query(sql) {
      const s = String(sql).trim();

      if (/FROM operator_definitions/i.test(s)) {
        return {
          rows: [
            { id: 'op-1', operator_name: 'Jio', service_type: 'Prepaid', operator_code: 'JIO' },
            { id: 'op-2', operator_name: 'Airtel', service_type: 'Prepaid', operator_code: 'AIRTEL' },
          ],
          rowCount: 2,
        };
      }

      if (/GROUP BY operator_display/i.test(s)) {
        return {
          rows: [
            {
              operator_display: 'Jio',
              operator_code: 'JIO',
              total_count: 5,
              success_count: 4,
              total_amount_minor: '100000',
              success_amount_minor: '80000',
              total_cost_minor: '76800',
              total_margin_minor: '3200',
            },
          ],
          rowCount: 1,
        };
      }

      if (/GROUP BY r\.amount_minor/i.test(s)) {
        return {
          rows: [
            {
              amount_minor: '20000',
              total_count: 5,
              success_count: 4,
              total_amount_minor: '100000',
              success_amount_minor: '80000',
              total_margin_minor: '3200',
            },
          ],
          rowCount: 1,
        };
      }

      if (/GROUP BY u\.id/i.test(s)) {
        return {
          rows: [
            {
              user_id: 'u-1',
              party_name: 'Buyer One',
              username: 'buyer1',
              business_name: 'Biz',
              role: 'buyer',
              wallet_balance_minor: '50000',
              total_count: 5,
              success_count: 4,
              total_amount_minor: '100000',
              success_amount_minor: '80000',
              total_cost_minor: '76800',
              total_margin_minor: '3200',
            },
          ],
          rowCount: 1,
        };
      }

      if (/FROM recharge_orders r[\s\S]*ORDER BY r\.created_at DESC/i.test(s)) {
        return {
          rows: [
            {
              id: 'ord-1234-5678-90ab',
              created_at: new Date().toISOString(),
              amount_minor: '20000',
              cost_minor: '19200',
              margin_minor: '800',
              status: 'pending',
              mobile_number: '9876543210',
              op_name: 'Jio',
              circle_name: 'Delhi',
              idempotency_key: 'IDEMP-1',
              provider_reference: 'PROV-1',
              buyer_name: 'Buyer One',
              buyer_username: 'buyer1',
              seller_name: 'Seller One',
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

test('Feature: Daily Sales Report - Status defaults to All, quick date presets, and unclipped input layouts', async () => {
  const db = createMockDb();
  const page = createAdminDailySalesReportPage({
    db,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    decryptMobile: (m) => m,
    sendJson: () => {},
    httpError: (m, c) => new Error(`${c}: ${m}`),
  });

  let capturedHtml = '';
  const res = {
    writeHead(code) { assert.equal(code, 200); },
    end(html) { capturedHtml = html; },
  };

  const params = new URLSearchParams('');
  await page.sendAdminDailySalesReportPage({ role: 'admin', username: 'admin' }, res, params);

  // 1. Status Filter has "All Status" selected by default
  assert.match(capturedHtml, /<option value="all" selected>All Status<\/option>/i);

  // 2. Form grid uses generous column sizes and explicit height
  assert.match(capturedHtml, /col-lg-2 col-md-3 col-sm-6/i);
  assert.match(capturedHtml, /col-lg-3 col-md-6 col-sm-6/i);
  assert.match(capturedHtml, /style="height:38px;"/);

  // 3. Quick date presets include All Time
  assert.match(capturedHtml, /All Time/i);
  assert.match(capturedHtml, /setQuickDate\('all'\)/);

  // 4. Panel Chrome universal input text clipping fix is injected
  assert.match(capturedHtml, /\.form-control[\s\S]*height: 38px !important/);
  assert.match(capturedHtml, /select\.form-control[\s\S]*height: 38px !important/);
  assert.match(capturedHtml, /input\[type="date"\]\.form-control[\s\S]*min-width: 140px !important/);
});
