'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateTransactionMargin, minorCommission } = require('../lib/margin-calculator');

describe('Margin Calculator Tests', () => {
  it('minorCommission calculates commission correctly for percentage', () => {
    // 100 INR (10000 minor units) at 3.5% = 350 minor units (3.50 INR)
    assert.strictEqual(minorCommission(10000n, '3.5'), 350n);

    // 500 INR (50000 minor units) at 2.25% = 1125 minor units (11.25 INR)
    assert.strictEqual(minorCommission(50000n, '2.25'), 1125n);

    // 10 INR (1000 minor units) at 1% = 10 minor units
    assert.strictEqual(minorCommission(1000n, '1'), 10n);

    // 0% commission
    assert.strictEqual(minorCommission(10000n, '0'), 0n);
  });

  it('calculateTransactionMargin fetches matching margin from database', async () => {
    const mockDb = {
      query: async () => ({
        rowCount: 1,
        rows: [
          {
            id: 'margin-setting-123',
            commission_percent: '3.5',
            with_gst: false,
            required_min_roffer_minor: 0,
          },
        ],
      }),
    };

    const res = await calculateTransactionMargin(mockDb, '11111111-1111-4111-8111-111111111111', {
      side: 'buy',
      operatorId: '22222222-2222-4222-8222-222222222222',
      amountMinor: 10000,
      circleName: 'Delhi',
      roffer: false,
    });

    assert.strictEqual(res.side, 'buy');
    assert.strictEqual(res.settingId, 'margin-setting-123');
    assert.strictEqual(res.baseAmountMinor, '10000');
    assert.strictEqual(res.commissionMinor, '350');
    assert.strictEqual(res.commissionPercent, '3.5');
    assert.strictEqual(res.withGst, false);
  });

  it('calculateTransactionMargin returns zero commission when no setting matches', async () => {
    const mockDb = {
      query: async () => ({
        rowCount: 0,
        rows: [],
      }),
    };

    const res = await calculateTransactionMargin(mockDb, '11111111-1111-4111-8111-111111111111', {
      side: 'sell',
      operatorId: '22222222-2222-4222-8222-222222222222',
      amountMinor: 5000,
      circleName: 'Mumbai',
      roffer: false,
    });

    assert.strictEqual(res.side, 'sell');
    assert.strictEqual(res.settingId, null);
    assert.strictEqual(res.commissionMinor, '0');
    assert.strictEqual(res.commissionPercent, '0');
  });

  it('calculateTransactionMargin throws error on invalid side or operatorId', async () => {
    const mockDb = { query: async () => ({ rowCount: 0, rows: [] }) };

    await assert.rejects(
      async () => {
        await calculateTransactionMargin(mockDb, 'user-id', {
          side: 'invalid_side',
          operatorId: 'not-a-uuid',
          amountMinor: 100,
          circleName: 'Delhi',
        });
      },
      (err) => err.statusCode === 400
    );
  });
});
