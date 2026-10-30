'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { SafeRedisClient, redisService } = require('../lib/redis-service');

describe('Redis & Accelerator Service Tests', () => {
  it('instantiates SafeRedisClient in safe in-memory fallback mode by default', () => {
    const client = new SafeRedisClient();
    const status = client.getStatus();
    assert.strictEqual(status.mode, 'in-memory-fallback');
    assert.strictEqual(status.isConnected, false);
    assert.strictEqual(status.redisUrlConfigured, false);
  });

  it('atomically sets key with setNx and rejects duplicate key with TTL', async () => {
    const client = new SafeRedisClient();
    const key = `test:key:${Date.now()}`;

    // First time should succeed
    const firstAttempt = await client.setNx(key, 'val1', 2);
    assert.strictEqual(firstAttempt, true, 'First setNx should return true');

    // Immediate duplicate attempt must fail (return false)
    const duplicateAttempt = await client.setNx(key, 'val2', 2);
    assert.strictEqual(duplicateAttempt, false, 'Duplicate setNx must return false');

    // Value retrieved should be first value
    const val = await client.get(key);
    assert.strictEqual(val, 'val1');
  });

  it('detects duplicate ref_id with isDuplicateRefId', async () => {
    const client = new SafeRedisClient();
    const buyerId = 'usr-test-buyer-1';
    const refId = `REF_${Date.now()}_ABC`;

    // First transaction with refId: is not duplicate
    const isDup1 = await client.isDuplicateRefId(buyerId, refId, 60);
    assert.strictEqual(isDup1, false, 'First request should not be detected as duplicate');

    // Replay transaction with same buyer & refId: IS duplicate
    const isDup2 = await client.isDuplicateRefId(buyerId, refId, 60);
    assert.strictEqual(isDup2, true, 'Immediate retry with same refId must be caught as duplicate');

    // Different buyer with same refId: distinct namespace
    const isDupOtherBuyer = await client.isDuplicateRefId('usr-test-buyer-2', refId, 60);
    assert.strictEqual(isDupOtherBuyer, false, 'Different buyerId should have separate deduplication key');
  });

  it('throttles rapid duplicate requests for same mobile number and amount', async () => {
    const client = new SafeRedisClient();
    const mobile = '9876543210';
    const amount = 199;

    // First recharge on mobile: allowed
    const throttled1 = await client.isNumberThrottled(mobile, amount, 3);
    assert.strictEqual(throttled1, false, 'First recharge must not be throttled');

    // Immediate second recharge on same mobile and same amount: throttled
    const throttled2 = await client.isNumberThrottled(mobile, amount, 3);
    assert.strictEqual(throttled2, true, 'Rapid repeat recharge on same number & amount must be throttled');

    // Different amount on same mobile: allowed
    const throttledDiffAmount = await client.isNumberThrottled(mobile, 299, 3);
    assert.strictEqual(throttledDiffAmount, false, 'Different amount on same mobile should be allowed');
  });

  it('cleans up deleted keys using del', async () => {
    const client = new SafeRedisClient();
    const key = `test:del:${Date.now()}`;
    await client.set(key, 'hello', 10);
    assert.strictEqual(await client.get(key), 'hello');

    await client.del(key);
    assert.strictEqual(await client.get(key), null);
  });
});
