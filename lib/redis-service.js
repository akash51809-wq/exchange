'use strict';

/**
 * Exchange Platform - High Performance Redis / In-Memory Accelerator Service
 *
 * Designed specifically for high-speed rate-limiting, idempotency, session caching,
 * and fraud prevention WITHOUT risking financial ledger accuracy.
 *
 * Golden Architectural Principle:
 * - PostgreSQL is ALWAYS the permanent, ACID-compliant source of truth for balances and wallets.
 * - Redis serves as a lightning-fast (sub-millisecond) guardrail for duplicate detection,
 *   rate limiting, and fast metadata lookup.
 * - Graceful Fallback: If Redis is unavailable or not configured, it seamlessly falls back
 *   to local in-memory storage so the system runs smoothly without downtime.
 */

const net = require('node:net');

class SafeRedisClient {
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || null;
    this.inMemoryStore = new Map();
    this.inMemoryExpiries = new Map();
    this.isConnected = false;
    this.mode = 'in-memory-fallback';

    if (this.redisUrl) {
      this.initRedisConnection();
    } else {
      console.log('[RedisService] No REDIS_URL configured. Operating in high-speed In-Memory Cache mode.');
    }
  }

  initRedisConnection() {
    try {
      // Optional ioredis integration if installed in environment
      const Redis = require('ioredis');
      this.client = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        enableOfflineQueue: false,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2000)),
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.mode = 'redis-connected';
        console.log('[RedisService] Successfully connected to Redis Server.');
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.mode = 'in-memory-fallback';
        // Non-blocking warning so system never crashes
        // console.warn('[RedisService Warning] Redis connection issue. Falling back to In-Memory cache:', err.message);
      });
    } catch (_) {
      // ioredis not installed; operates in high-performance in-memory mode
      this.mode = 'in-memory-fallback';
    }
  }

  /**
   * Set a key if it does not already exist (Atomic SET NX with TTL in seconds)
   * Perfect for duplicate ref_id prevention and rapid transaction deduplication.
   *
   * @param {string} key
   * @param {string} value
   * @param {number} ttlSeconds
   * @returns {Promise<boolean>} true if key was set (unique), false if key already existed
   */
  async setNx(key, value = '1', ttlSeconds = 300) {
    if (this.isConnected && this.client) {
      try {
        const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
        return res === 'OK';
      } catch (_) {
        // Fallback to in-memory on redis connection glitch
      }
    }

    // In-Memory atomic SET NX
    const now = Date.now();
    const existingExpiry = this.inMemoryExpiries.get(key);
    if (existingExpiry && existingExpiry > now) {
      return false; // Key already exists and is active
    }

    this.inMemoryStore.set(key, value);
    this.inMemoryExpiries.set(key, now + (ttlSeconds * 1000));

    // Garbage collect memory if store grows too large
    if (this.inMemoryStore.size > 20000) {
      for (const [k, exp] of this.inMemoryExpiries.entries()) {
        if (exp <= now) {
          this.inMemoryStore.delete(k);
          this.inMemoryExpiries.delete(k);
        }
      }
    }

    return true;
  }

  /**
   * Get value of key
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch (_) {}
    }

    const now = Date.now();
    const expiry = this.inMemoryExpiries.get(key);
    if (expiry && expiry <= now) {
      this.inMemoryStore.delete(key);
      this.inMemoryExpiries.delete(key);
      return null;
    }

    return this.inMemoryStore.get(key) || null;
  }

  /**
   * Set key with TTL in seconds
   * @param {string} key
   * @param {string} value
   * @param {number} ttlSeconds
   */
  async set(key, value, ttlSeconds = 60) {
    if (this.isConnected && this.client) {
      try {
        return await this.client.set(key, value, 'EX', ttlSeconds);
      } catch (_) {}
    }

    const now = Date.now();
    this.inMemoryStore.set(key, value);
    this.inMemoryExpiries.set(key, now + (ttlSeconds * 1000));
  }

  /**
   * Delete a key
   * @param {string} key
   */
  async del(key) {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch (_) {}
    }
    this.inMemoryStore.delete(key);
    this.inMemoryExpiries.delete(key);
  }

  /**
   * Check if a recharge reference ID is a duplicate in sub-millisecond time.
   * @param {string} buyerId
   * @param {string} refId
   * @param {number} [ttlSeconds=300] - 5 minutes lock
   * @returns {Promise<boolean>} true if duplicate, false if new unique request
   */
  async isDuplicateRefId(buyerId, refId, ttlSeconds = 300) {
    const key = `recharge:ref:${buyerId}:${refId}`;
    const wasSet = await this.setNx(key, '1', ttlSeconds);
    return !wasSet; // If not set, it means it already existed (duplicate)
  }

  /**
   * Check and enforce same-number-amount frequency throttle.
   * @param {string} mobileNumber
   * @param {string|number} amount
   * @param {number} waitMinutes
   * @returns {Promise<boolean>} true if throttled (duplicate within window), false if allowed
   */
  async isNumberThrottled(mobileNumber, amount, waitMinutes = 3) {
    if (waitMinutes <= 0) return false;
    const key = `recharge:throttle:${mobileNumber}:${amount}`;
    const wasSet = await this.setNx(key, '1', waitMinutes * 60);
    return !wasSet;
  }

  /**
   * Get operational status
   */
  getStatus() {
    return {
      mode: this.mode,
      isConnected: this.isConnected,
      redisUrlConfigured: Boolean(this.redisUrl),
      inMemoryEntriesCount: this.inMemoryStore.size,
    };
  }
}

const defaultRedisService = new SafeRedisClient();

module.exports = {
  SafeRedisClient,
  redisService: defaultRedisService,
};
