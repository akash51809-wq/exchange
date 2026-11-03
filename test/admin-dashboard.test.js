'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createAdminDashboardPage = require('../pages/admin-dashboard');

function createMockDb(customQueries = {}) {
  return {
    async query(sql, params = []) {
      const s = String(sql).trim();

      // Allow override per test
      for (const [pattern, handler] of Object.entries(customQueries)) {
        if (new RegExp(pattern, 'i').test(s)) {
          return handler(s, params);
        }
      }

      // 7. Today Recharge Transactions & Purchase (Check FIRST before other recharge_orders queries)
      if (/total_txns/i.test(s)) {
        return {
          rows: [{
            total_txns: 120,
            total_volume_minor: '15000000', // ₹150,000.00
            success_txns: 110,
            success_volume_minor: '14200000', // ₹142,000.00
            pending_txns: 7,
            pending_volume_minor: '600000',   // ₹6,000.00
            failed_txns: 3,
            failed_volume_minor: '200000',    // ₹2,000.00
            purchase_cost_minor: '13632000',  // ₹136,320.00
            purchase_margin_minor: '568000',  // ₹5,680.00 (4.0%)
            active_buyers: 28,
          }],
          rowCount: 1,
        };
      }

      // 9. Today Operator-wise Summary
      if (/GROUP BY 1, 2/i.test(s)) {
        return {
          rows: [
            {
              op_name: 'Jio Prepaid',
              service_type: 'Prepaid',
              total_count: 60,
              total_val: '8000000', // ₹80,000.00
              success_count: 58,
              success_val: '7800000',
              failed_count: 1,
              pending_count: 1,
              margin_val: '312000', // ₹3,120.00 (4.0%)
            },
            {
              op_name: 'Airtel Prepaid',
              service_type: 'Prepaid',
              total_count: 40,
              total_val: '5000000', // ₹50,000.00
              success_count: 37,
              success_val: '4700000',
              failed_count: 2,
              pending_count: 1,
              margin_val: '188000', // ₹1,880.00 (4.0%)
            },
            {
              op_name: 'VI Prepaid',
              service_type: 'Prepaid',
              total_count: 20,
              total_val: '2000000', // ₹20,000.00
              success_count: 15,
              success_val: '1700000',
              failed_count: 0,
              pending_count: 5,
              margin_val: '68000',  // ₹680.00 (4.0%)
            },
          ],
          rowCount: 3,
        };
      }

      // 1. Pending Recharge
      if (/WHERE UPPER\(status\) IN \('PENDING'/i.test(s)) {
        return {
          rows: [{ count: 7, amount_minor: '185000' }], // ₹1,850.00
          rowCount: 1,
        };
      }

      // 2. Pending Complaint / Dispute
      if (/FROM recharge_orders r[\s\S]*recharge_disputes d/i.test(s)) {
        return {
          rows: [{ count: 3, amount_minor: '74900' }], // ₹749.00
          rowCount: 1,
        };
      }

      // 3. Pending Payment (Fund Requests)
      if (/FROM wallet_fund_requests/i.test(s)) {
        return {
          rows: [{ count: 5, amount_minor: '2500000' }], // ₹25,000.00
          rowCount: 1,
        };
      }

      // 8. Today Redeem (Payout Requests - check FIRST)
      if (/total_requests/i.test(s)) {
        return {
          rows: [{
            total_requests: 10,
            total_volume_minor: '5000000', // ₹50,000.00
            processed_count: 6,
            processed_volume_minor: '3800000', // ₹38,000.00
            pending_count: 4,
            pending_volume_minor: '1200000',   // ₹12,000.00
            rejected_count: 0,
            rejected_volume_minor: '0',
          }],
          rowCount: 1,
        };
      }

      // 4. Pending Payout Requests
      if (/FROM payout_requests/i.test(s)) {
        return {
          rows: [{ count: 4, amount_minor: '1200000' }], // ₹12,000.00
          rowCount: 1,
        };
      }

      // 5. Pending KYC
      if (/FROM user_kyc/i.test(s)) {
        return {
          rows: [{ count: 2 }],
          rowCount: 1,
        };
      }

      // 6. Pending Bank Approval
      if (/FROM user_bank_accounts/i.test(s)) {
        return {
          rows: [{ count: 6 }],
          rowCount: 1,
        };
      }



      return { rows: [], rowCount: 0 };
    },
  };
}

test('Feature: Admin Dashboard - Renders 6 Pending metrics, Today Core Highlights, and Operator-wise Breakdown', async () => {
  const db = createMockDb();
  const page = createAdminDashboardPage({
    db,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    sendJson: () => {},
    httpError: (m, c) => new Error(`${c}: ${m}`),
  });

  let capturedHtml = '';
  const res = {
    writeHead(code, headers) {
      assert.equal(code, 200);
      assert.equal(headers['content-type'], 'text/html; charset=utf-8');
    },
    end(html) { capturedHtml = html; },
  };

  await page.sendAdminDashboardPage({ role: 'admin', username: 'admin' }, res);

  // 1. Header Command Bar
  assert.match(capturedHtml, /Admin Dashboard &amp; Live Command Center/i);
  assert.match(capturedHtml, /LIVE IST/);
  assert.match(capturedHtml, /id="liveClock"/);
  assert.match(capturedHtml, /Refresh/);

  // 2. Pending Row (6 Cards)
  // Pending Recharge
  assert.match(capturedHtml, /Pending Recharge/i);
  assert.match(capturedHtml, /\/admin\/reports\/pending-recharge/);
  assert.match(capturedHtml, />7</); // count 7
  assert.match(capturedHtml, /1850\.00/); // ₹1,850.00

  // Pending Complain
  assert.match(capturedHtml, /Pending Complain/i);
  assert.match(capturedHtml, /\/admin\/reports\/complaint\?status=pending/);
  assert.match(capturedHtml, />3</); // count 3
  assert.match(capturedHtml, /749\.00/); // ₹749.00

  // Pending Payment
  assert.match(capturedHtml, /Pending Payment/i);
  assert.match(capturedHtml, /\/admin\/payment\/fund-request/);
  assert.match(capturedHtml, />5</); // count 5
  assert.match(capturedHtml, /25000\.00/); // ₹25,000.00

  // Pending Payout
  assert.match(capturedHtml, /Pending Payout/i);
  assert.match(capturedHtml, /\/admin\/payment\/payout-requests\?status=pending/);
  assert.match(capturedHtml, />4</); // count 4
  assert.match(capturedHtml, /12000\.00/); // ₹12,000.00

  // Pending KYC
  assert.match(capturedHtml, /Pending KYC/i);
  assert.match(capturedHtml, /\/admin\/users\/pending-kyc/);
  assert.match(capturedHtml, />2</); // count 2

  // Pending Bank Approval
  assert.match(capturedHtml, /Pending Bank Approval/i);
  assert.match(capturedHtml, /\/admin\/payment\/bank-approval\?status=pending/);
  assert.match(capturedHtml, />6</); // count 6

  // 3. Today Core Metrics
  // Today Transaction
  assert.match(capturedHtml, /Today Transaction/i);
  assert.match(capturedHtml, /150000\.00/);
  assert.match(capturedHtml, /120 Orders/);
  assert.match(capturedHtml, /Success: <b>110<\/b>/);
  assert.match(capturedHtml, /Pending: <b>7<\/b>/);
  assert.match(capturedHtml, /Failed: <b>3<\/b>/);

  // Today Purchase
  assert.match(capturedHtml, /Today Purchase/i);
  assert.match(capturedHtml, /142000\.00/);
  assert.match(capturedHtml, /110 Executed/);
  assert.match(capturedHtml, /Purchase Cost: <b>₹136320\.00<\/b>/);
  assert.match(capturedHtml, /Margin: ₹5680\.00 \(4\.00%\)/);
  assert.match(capturedHtml, /28 Active/);

  // Today Redeem
  assert.match(capturedHtml, /Today Redeem/i);
  assert.match(capturedHtml, /50000\.00/);
  assert.match(capturedHtml, /10 Requests/);
  assert.match(capturedHtml, /Paid: <b>6<\/b>/);
  assert.match(capturedHtml, /Pending: <b>4<\/b>/);

  // 4. Today Operator-Wise Summary Table
  assert.match(capturedHtml, /Today Operator-Wise Summary &amp; Percentage Breakdown/i);
  assert.match(capturedHtml, /Jio Prepaid/);
  assert.match(capturedHtml, /Airtel Prepaid/);
  assert.match(capturedHtml, /VI Prepaid/);
  assert.match(capturedHtml, /TOTAL SUMMARY:/);

  // Checks for operator percentages and metrics
  assert.match(capturedHtml, /Share \(% Vol\)/);
  assert.match(capturedHtml, /Avg Ticket \(₹\)/);
  assert.match(capturedHtml, /Success \/ Rate/);
});

test('Feature: Admin Dashboard - Handles Empty DB Gracefully Without Error', async () => {
  const emptyDb = {
    async query() {
      return { rows: [], rowCount: 0 };
    },
  };

  const page = createAdminDashboardPage({
    db: emptyDb,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    sendJson: () => {},
    httpError: (m, c) => new Error(`${c}: ${m}`),
  });

  let capturedHtml = '';
  const res = {
    writeHead(code) { assert.equal(code, 200); },
    end(html) { capturedHtml = html; },
  };

  await page.sendAdminDashboardPage({ role: 'admin', username: 'admin' }, res);

  assert.match(capturedHtml, /Admin Dashboard &amp; Live Command Center/i);
  assert.match(capturedHtml, /Pending Recharge/i);
  assert.match(capturedHtml, /Pending Complain/i);
  assert.match(capturedHtml, /Pending Payment/i);
  assert.match(capturedHtml, /Pending Payout/i);
  assert.match(capturedHtml, /Pending KYC/i);
  assert.match(capturedHtml, /Pending Bank Approval/i);
  assert.match(capturedHtml, /No transactions recorded yet for today/i);
});
