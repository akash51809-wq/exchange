'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearStr, monthStr, dayStr] = value.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const d = parseInt(dayStr, 10);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

describe('Calendar Date Validation Tests', () => {
  it('accepts valid calendar dates', () => {
    assert.strictEqual(isValidCalendarDate('2026-10-10'), true);
    assert.strictEqual(isValidCalendarDate('2026-01-01'), true);
    assert.strictEqual(isValidCalendarDate('2026-12-31'), true);
  });

  it('rejects non-existent days in 30-day months', () => {
    assert.strictEqual(isValidCalendarDate('2026-04-31'), false); // April has 30 days
    assert.strictEqual(isValidCalendarDate('2026-06-31'), false); // June has 30 days
    assert.strictEqual(isValidCalendarDate('2026-09-31'), false); // September has 30 days
    assert.strictEqual(isValidCalendarDate('2026-11-31'), false); // November has 30 days
  });

  it('rejects non-existent February dates', () => {
    assert.strictEqual(isValidCalendarDate('2026-02-29'), false); // 2026 is not a leap year
    assert.strictEqual(isValidCalendarDate('2026-02-30'), false);
    assert.strictEqual(isValidCalendarDate('2026-02-31'), false);
  });

  it('accepts leap year February 29th', () => {
    assert.strictEqual(isValidCalendarDate('2024-02-29'), true); // 2024 is a leap year
    assert.strictEqual(isValidCalendarDate('2028-02-29'), true); // 2028 is a leap year
  });

  it('rejects malformed date strings', () => {
    assert.strictEqual(isValidCalendarDate('invalid'), false);
    assert.strictEqual(isValidCalendarDate('2026-13-01'), false);
    assert.strictEqual(isValidCalendarDate('2026-00-10'), false);
    assert.strictEqual(isValidCalendarDate('10-10-2026'), false);
    assert.strictEqual(isValidCalendarDate(null), false);
    assert.strictEqual(isValidCalendarDate(12345), false);
  });
});
