'use strict';

const dns = require('dns').promises;
const net = require('net');

/**
 * Check if an IPv4 address is in a private, loopback, or reserved range.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIpv4(ip) {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP is treated as unsafe
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;

  // 10.0.0.0/8 (Private A)
  if (b0 === 10) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 172.16.0.0/12 (Private B: 172.16 - 172.31)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (b0 === 192 && b1 === 0 && parts[2] === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;

  // 192.168.0.0/16 (Private C)
  if (b0 === 192 && b1 === 168) return true;

  // 198.18.0.0/15 (Network benchmark)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast: 224 - 239)
  if (b0 >= 224 && b0 <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use: 240 - 255)
  if (b0 >= 240) return true;

  return false;
}

/**
 * Check if an IPv6 address is in a private, loopback, or reserved range.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase().trim();

  // IPv4-mapped IPv6 address, e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.slice(7);
    if (net.isIPv4(v4Part)) {
      return isPrivateIpv4(v4Part);
    }
    return true;
  }

  // Loopback (::1) or Unspecified (::)
  if (normalized === '::1' || normalized === '::') return true;

  // Unique Local Address (fc00::/7 -> fc00:: or fd00::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // Link-Local (fe80::/10 -> fe80::, fe90::, fea0::, feb0::)
  if (/^fe[89ab]/.test(normalized)) return true;

  // Multicast (ff00::/8)
  if (normalized.startsWith('ff')) return true;

  return false;
}

/**
 * Check if an IP address (v4 or v6) is private or reserved.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const cleanIp = ip.trim();

  if (net.isIPv4(cleanIp)) {
    return isPrivateIpv4(cleanIp);
  }
  if (net.isIPv6(cleanIp)) {
    return isPrivateIpv6(cleanIp);
  }

  // Not a standard IP format
  return true;
}

/**
 * Known internal hostnames and metadata endpoints that must be strictly forbidden.
 */
const FORBIDDEN_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'instance-data',
  'metadata.google.internal',
  'metadata',
]);

const FORBIDDEN_TLDS = ['.local', '.internal', '.lan', '.corp', '.home', '.onion'];

/**
 * Validate that a URL is a safe, publicly reachable HTTP/HTTPS URL and not an internal/private target (SSRF prevention).
 *
 * @param {string} urlStr - The target URL to check
 * @returns {Promise<{ safe: boolean, error?: string, parsedUrl?: URL }>}
 */
async function validateSafePublicUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return { safe: false, error: 'URL is required.' };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(urlStr.trim());
  } catch {
    return { safe: false, error: 'Invalid URL format. Must begin with http:// or https://' };
  }

  // Protocol check: Only http and https are allowed
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { safe: false, error: `Invalid URL protocol "${parsedUrl.protocol}". Only HTTP and HTTPS are permitted.` };
  }

  const hostname = parsedUrl.hostname.toLowerCase().trim();
  if (!hostname) {
    return { safe: false, error: 'URL must contain a valid hostname.' };
  }

  // Check forbidden hostname / TLD
  if (FORBIDDEN_HOSTNAMES.has(hostname)) {
    return { safe: false, error: 'Access to local or cloud metadata endpoints is strictly forbidden.' };
  }

  for (const tld of FORBIDDEN_TLDS) {
    if (hostname.endsWith(tld)) {
      return { safe: false, error: `Access to internal domain (*${tld}) is forbidden.` };
    }
  }

  // Check direct IP address input
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { safe: false, error: 'Access to private, loopback, or cloud internal IP addresses is forbidden.' };
    }
    return { safe: true, parsedUrl };
  }

  // Perform DNS lookup to detect DNS-rebinding or hostnames resolving to private IPs (e.g. localtest.me, 127.0.0.1.nip.io)
  try {
    const resolved = await dns.lookup(hostname, { all: true });
    if (!resolved || resolved.length === 0) {
      return { safe: false, error: `Unable to resolve host: ${hostname}` };
    }

    for (const record of resolved) {
      if (isPrivateIp(record.address)) {
        return {
          safe: false,
          error: `Domain "${hostname}" resolves to a restricted internal IP address (${record.address}). Access denied.`,
        };
      }
    }
  } catch (dnsErr) {
    return { safe: false, error: `DNS resolution failed for hostname "${hostname}": ${dnsErr.message}` };
  }

  return { safe: true, parsedUrl };
}

/**
 * Asserts that the URL is safe, throwing an error if it is not.
 * @param {string} urlStr
 * @returns {Promise<URL>}
 */
async function assertSafePublicUrl(urlStr) {
  const result = await validateSafePublicUrl(urlStr);
  if (!result.safe) {
    const err = new Error(result.error || 'Access to internal or restricted network endpoints is forbidden.');
    err.statusCode = 400;
    throw err;
  }
  return result.parsedUrl;
}

module.exports = {
  isPrivateIp,
  isPrivateIpv4,
  isPrivateIpv6,
  validateSafePublicUrl,
  assertSafePublicUrl,
};
