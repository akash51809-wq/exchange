'use strict';

/**
 * Checks if two IP addresses are equal (normalizing IPv6-mapped IPv4).
 */
function isIpEqual(ip1, ip2) {
  if (!ip1 || !ip2) return false;
  const c1 = String(ip1).replace(/^::ffff:/, '').trim().toLowerCase();
  const c2 = String(ip2).replace(/^::ffff:/, '').trim().toLowerCase();
  return c1 === c2;
}

/**
 * Checks whether an incoming socket remote IP is a designated trusted reverse proxy.
 */
function isTrustedProxy(socketIp) {
  if (!socketIp) return false;
  const cleanSocket = String(socketIp).replace(/^::ffff:/, '').trim().toLowerCase();

  // If TRUST_PROXY is set to 'true', treat local loopback (127.0.0.1, ::1) as trusted reverse proxy
  if (process.env.TRUST_PROXY === 'true' && (cleanSocket === '127.0.0.1' || cleanSocket === '::1')) {
    return true;
  }

  // If explicit comma-separated TRUSTED_PROXIES list is provided
  if (process.env.TRUSTED_PROXIES) {
    const list = process.env.TRUSTED_PROXIES
      .split(',')
      .map((s) => s.replace(/^::ffff:/, '').trim().toLowerCase())
      .filter(Boolean);
    if (list.includes(cleanSocket)) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves the genuine client IP address.
 * Prevents IP spoofing: X-Forwarded-For is ONLY trusted if the direct connection
 * came from a verified trusted reverse proxy.
 */
function getClientIp(request) {
  const socketIp = (request?.socket?.remoteAddress || '').replace(/^::ffff:/, '').trim();

  // If the direct connection is NOT from a trusted proxy, ignore X-Forwarded-For
  if (!isTrustedProxy(socketIp)) {
    return socketIp || '127.0.0.1';
  }

  // Direct connection is from a trusted proxy, inspect forwarded headers
  const forwarded = request?.headers?.['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const parts = forwarded
      .split(',')
      .map((p) => p.replace(/^::ffff:/, '').trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[0];
    }
  }

  const realIp = request?.headers?.['x-real-ip'];
  if (realIp && typeof realIp === 'string') {
    return realIp.replace(/^::ffff:/, '').trim();
  }

  return socketIp || '127.0.0.1';
}

/**
 * Verifies if the resolved client IP is included in the approved whitelist.
 * Does not grant automatic bypass for loopback unless loopback is explicitly whitelisted.
 */
function verifyIpWhitelisted(clientIp, allowedIps = []) {
  if (!allowedIps || allowedIps.length === 0) return true;
  const cleanClient = (clientIp || '').replace(/^::ffff:/, '').trim().toLowerCase();
  return allowedIps.some((allowed) => {
    const cleanAllowed = (allowed || '').replace(/^::ffff:/, '').trim().toLowerCase();
    return cleanAllowed === cleanClient;
  });
}

module.exports = {
  getClientIp,
  isTrustedProxy,
  verifyIpWhitelisted,
  isIpEqual,
};
