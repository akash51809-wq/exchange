'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getClientIp, isTrustedProxy, verifyIpWhitelisted, isIpEqual } = require('../lib/client-ip');

describe('Client IP Extraction & Spoof Prevention Tests', () => {
  it('ignores spoofed X-Forwarded-For when connection is from untrusted source', () => {
    // Direct connection from public IP 198.51.100.5
    // Client sends spoofed X-Forwarded-For header claiming to be 203.0.113.1
    const req = {
      socket: { remoteAddress: '198.51.100.5' },
      headers: { 'x-forwarded-for': '203.0.113.1' },
    };

    const resolvedIp = getClientIp(req);
    // Since 198.51.100.5 is NOT a trusted proxy, X-Forwarded-For MUST BE IGNORED
    assert.strictEqual(resolvedIp, '198.51.100.5');
  });

  it('trusts X-Forwarded-For when connection is from trusted proxy', () => {
    process.env.TRUSTED_PROXIES = '10.0.0.1, 172.16.0.1';
    try {
      assert.strictEqual(isTrustedProxy('10.0.0.1'), true);

      const req = {
        socket: { remoteAddress: '10.0.0.1' },
        headers: { 'x-forwarded-for': '203.0.113.50, 10.0.0.1' },
      };

      const resolvedIp = getClientIp(req);
      assert.strictEqual(resolvedIp, '203.0.113.50');
    } finally {
      delete process.env.TRUSTED_PROXIES;
    }
  });

  it('supports TRUST_PROXY=true for local reverse proxy (127.0.0.1)', () => {
    process.env.TRUST_PROXY = 'true';
    try {
      assert.strictEqual(isTrustedProxy('127.0.0.1'), true);
      assert.strictEqual(isTrustedProxy('::1'), true);

      const req = {
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-forwarded-for': '157.240.22.35' },
      };

      const resolvedIp = getClientIp(req);
      assert.strictEqual(resolvedIp, '157.240.22.35');
    } finally {
      delete process.env.TRUST_PROXY;
    }
  });

  it('normalizes IPv6-mapped IPv4 addresses', () => {
    assert.strictEqual(isIpEqual('::ffff:192.168.1.1', '192.168.1.1'), true);
  });

  it('strictly validates IP whitelist without granting automatic loopback bypass', () => {
    const allowed = ['203.0.113.5', '198.51.100.20'];

    assert.strictEqual(verifyIpWhitelisted('203.0.113.5', allowed), true);
    assert.strictEqual(verifyIpWhitelisted('198.51.100.20', allowed), true);
    // Disallowed IP
    assert.strictEqual(verifyIpWhitelisted('198.51.100.21', allowed), false);
    // Loopback should NOT automatically bypass if not in allowed list
    assert.strictEqual(verifyIpWhitelisted('127.0.0.1', allowed), false);
    assert.strictEqual(verifyIpWhitelisted('::1', allowed), false);
  });

  it('allows all IPs when allowed list is empty', () => {
    assert.strictEqual(verifyIpWhitelisted('203.0.113.5', []), true);
    assert.strictEqual(verifyIpWhitelisted('127.0.0.1', null), true);
  });
});
