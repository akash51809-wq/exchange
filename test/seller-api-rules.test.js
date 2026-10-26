'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  handleSellerApiSuccess,
  handleSellerApiFailure,
  checkAndDisableSellerApiOnPendingTxn,
} = require('../lib/seller-api-rules');

test('Seller API Rules - Consecutive Failures & Pending Transactions Threshold', async (t) => {
  await t.test('Resets fail_count on success, and only disables API on consecutive failures', async () => {
    let currentFailCount = 0;
    let isActive = true;
    let autoDisabledReason = '';

    const mockDb = {
      query: async (sql, params) => {
        if (/UPDATE\s+seller_api_settings\s+SET\s+fail_count\s*=\s*0/i.test(sql)) {
          currentFailCount = 0;
          return { rowCount: 1, rows: [] };
        }
        if (/UPDATE\s+seller_api_settings/i.test(sql) && /SET\s+fail_count/i.test(sql)) {
          currentFailCount += 1;
          const limit = params[1];
          if (currentFailCount >= limit) {
            isActive = false;
            autoDisabledReason = `Auto-disabled: ${currentFailCount} consecutive failed transactions reached (Limit: ${limit})`;
          }
          return {
            rowCount: 1,
            rows: [{ id: params[0], name: 'Test API', fail_count: currentFailCount, is_active: isActive }],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const genSettings = {
      apiDisableFailTxnEnabled: true,
      apiDisableFailTxnCount: 3, // Disable on 3 CONSECUTIVE failures
    };

    // 1. First failure
    await handleSellerApiFailure(mockDb, 'api-1', genSettings);
    assert.equal(currentFailCount, 1);
    assert.equal(isActive, true, 'API should still be active after 1 failure');

    // 2. Second failure
    await handleSellerApiFailure(mockDb, 'api-1', genSettings);
    assert.equal(currentFailCount, 2);
    assert.equal(isActive, true, 'API should still be active after 2 failures');

    // 3. One SUCCESS happens!
    await handleSellerApiSuccess(mockDb, 'api-1');
    assert.equal(currentFailCount, 0, 'Success MUST reset fail_count back to 0');
    assert.equal(isActive, true, 'API remains active');

    // 4. Another failure (starts from 1 again, not 3)
    await handleSellerApiFailure(mockDb, 'api-1', genSettings);
    assert.equal(currentFailCount, 1, 'Counter restarted from 1');
    assert.equal(isActive, true, 'API is NOT disabled because failures were not consecutive 3');

    // 5. Consecutive failure 2
    await handleSellerApiFailure(mockDb, 'api-1', genSettings);
    assert.equal(currentFailCount, 2);
    assert.equal(isActive, true);

    // 6. Consecutive failure 3 -> Reaches threshold of 3!
    await handleSellerApiFailure(mockDb, 'api-1', genSettings);
    assert.equal(currentFailCount, 3);
    assert.equal(isActive, false, 'API must be disabled after 3 consecutive failures');
    assert.match(autoDisabledReason, /3 consecutive failed transactions/i);
  });

  await t.test('Auto-disables seller API when active pending transactions threshold is reached', async () => {
    let apiIsActive = true;
    let autoDisabledReason = '';

    const mockDb = {
      query: async (sql, params) => {
        if (/SELECT\s+COUNT\(\*\)\s+AS\s+pending_count/i.test(sql)) {
          // Simulate seller has 5 pending orders
          return {
            rowCount: 1,
            rows: [{ pending_count: '5' }],
          };
        }
        if (/UPDATE\s+seller_api_settings/i.test(sql) && /SET\s+is_active\s*=\s*false/i.test(sql)) {
          apiIsActive = false;
          autoDisabledReason = `Auto-disabled: ${params[1]} pending transactions held on seller API (Limit: ${params[2]})`;
          return {
            rowCount: 1,
            rows: [{ id: params[0], name: 'Seller Stock API' }],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const genSettings = {
      apiDisablePendingTxnEnabled: true,
      apiDisablePendingTxnCount: 5, // Threshold = 5 pending transactions
    };

    const wasDisabled = await checkAndDisableSellerApiOnPendingTxn(
      mockDb,
      { sellerApiId: 'api-pending-1', sellerUserId: 'seller-user-1' },
      genSettings,
    );

    assert.equal(wasDisabled, true, 'Must return true indicating pending limit was reached');
    assert.equal(apiIsActive, false, 'API is_active must become false');
    assert.match(autoDisabledReason, /5 pending transactions held/i);
  });

  await t.test('Does NOT disable seller API when active pending count is below threshold', async () => {
    let apiIsActive = true;

    const mockDb = {
      query: async (sql) => {
        if (/SELECT\s+COUNT\(\*\)\s+AS\s+pending_count/i.test(sql)) {
          // Only 2 pending orders (threshold is 5)
          return {
            rowCount: 1,
            rows: [{ pending_count: '2' }],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const genSettings = {
      apiDisablePendingTxnEnabled: true,
      apiDisablePendingTxnCount: 5,
    };

    const wasDisabled = await checkAndDisableSellerApiOnPendingTxn(
      mockDb,
      { sellerApiId: 'api-pending-2', sellerUserId: 'seller-user-2' },
      genSettings,
    );

    assert.equal(wasDisabled, false, 'Must return false when below threshold');
    assert.equal(apiIsActive, true, 'API remains active');
  });
});
