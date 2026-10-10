'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateIp, validateSafePublicUrl, assertSafePublicUrl } = require('../lib/ssrf-filter');

describe('SSRF Filter Security Tests', () => {
  it('correctly detects private IPv4 ranges', () => {
    assert.strictEqual(isPrivateIp('127.0.0.1'), true);
    assert.strictEqual(isPrivateIp('10.0.0.1'), true);
    assert.strictEqual(isPrivateIp('192.168.1.1'), true);
    assert.strictEqual(isPrivateIp('172.16.0.1'), true);
    assert.strictEqual(isPrivateIp('169.254.169.254'), true); // Cloud metadata
    assert.strictEqual(isPrivateIp('0.0.0.0'), true);
  });

  it('correctly detects private IPv6 ranges', () => {
    assert.strictEqual(isPrivateIp('::1'), true);
    assert.strictEqual(isPrivateIp('fe80::1'), true);
    assert.strictEqual(isPrivateIp('fc00::1'), true);
    assert.strictEqual(isPrivateIp('::ffff:127.0.0.1'), true);
  });

  it('allows public IPv4 addresses', () => {
    assert.strictEqual(isPrivateIp('8.8.8.8'), false);
    assert.strictEqual(isPrivateIp('1.1.1.1'), false);
    assert.strictEqual(isPrivateIp('142.250.190.46'), false);
  });

  it('blocks localhost and forbidden hostnames in URLs', async () => {
    const res1 = await validateSafePublicUrl('http://localhost:3000/api');
    assert.strictEqual(res1.safe, false);

    const res2 = await validateSafePublicUrl('http://127.0.0.1:8080/callback');
    assert.strictEqual(res2.safe, false);

    const res3 = await validateSafePublicUrl('http://metadata.google.internal/computeMetadata/v1/');
    assert.strictEqual(res3.safe, false);

    const res4 = await validateSafePublicUrl('http://169.254.169.254/latest/meta-data/');
    assert.strictEqual(res4.safe, false);
  });

  it('rejects unsupported protocols like file://, ftp://, gopher://', async () => {
    const res1 = await validateSafePublicUrl('file:///etc/passwd');
    assert.strictEqual(res1.safe, false);

    const res2 = await validateSafePublicUrl('gopher://127.0.0.1:25/');
    assert.strictEqual(res2.safe, false);
  });

  it('throws on assertSafePublicUrl when unsafe URL is provided', async () => {
    await assert.rejects(
      async () => {
        await assertSafePublicUrl('http://192.168.0.100/admin');
      },
      (err) => err.statusCode === 400
    );
  });
});
