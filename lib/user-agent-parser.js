'use strict';

/**
 * Lightweight, robust User-Agent parser for user login history
 */
function parseUserAgent(uaString = '') {
  const ua = String(uaString || '').trim();
  if (!ua) {
    return {
      deviceType: 'Desktop',
      deviceName: 'Unknown Device',
      osName: 'Unknown OS',
      browserName: 'Unknown Browser',
      browserVersion: '',
    };
  }

  // 1. Device Type
  let deviceType = 'Desktop';
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = 'Tablet';
  } else if (/mobile|iphone|ipod|android.*mobile|blackberry|opera mini|iemobile|wpdesktop/i.test(ua)) {
    deviceType = 'Mobile';
  } else if (/bot|crawler|spider|slurp|facebookexternalhit|bingbot|googlebot/i.test(ua)) {
    deviceType = 'Bot';
  }

  // 2. Specific Device Name & Brand
  let deviceName = 'PC / Workstation';
  if (/iphone/i.test(ua)) {
    deviceName = 'Apple iPhone';
  } else if (/ipad/i.test(ua)) {
    deviceName = 'Apple iPad';
  } else if (/macintosh|mac os x/i.test(ua)) {
    deviceName = 'Apple Mac';
  } else if (/windows/i.test(ua)) {
    deviceName = 'Windows PC';
  } else if (/android/i.test(ua)) {
    const buildMatch = ua.match(/;\s*([^;()]+)\s*(?:Build\/|\))/i);
    if (buildMatch && buildMatch[1] && !buildMatch[1].includes('Android')) {
      const raw = buildMatch[1].trim();
      if (/SM-[A-Za-z0-9]+/i.test(raw)) deviceName = `Samsung (${raw})`;
      else if (/Redmi|Mi|POCO/i.test(raw)) deviceName = `Xiaomi (${raw})`;
      else if (/OnePlus/i.test(raw)) deviceName = `OnePlus (${raw})`;
      else if (/vivo/i.test(raw)) deviceName = `Vivo (${raw})`;
      else if (/oppo/i.test(raw)) deviceName = `Oppo (${raw})`;
      else if (/realme/i.test(raw)) deviceName = `Realme (${raw})`;
      else if (/pixel/i.test(raw)) deviceName = `Google Pixel (${raw})`;
      else deviceName = raw.slice(0, 30);
    } else {
      deviceName = 'Android Device';
    }
  } else if (/linux/i.test(ua)) {
    deviceName = 'Linux Workstation';
  }

  // 3. Operating System
  let osName = 'Unknown OS';
  if (/windows nt 10\.0/i.test(ua)) osName = 'Windows 10/11';
  else if (/windows nt 6\.3/i.test(ua)) osName = 'Windows 8.1';
  else if (/windows nt 6\.2/i.test(ua)) osName = 'Windows 8';
  else if (/windows nt 6\.1/i.test(ua)) osName = 'Windows 7';
  else if (/windows nt 6\.0/i.test(ua)) osName = 'Windows Vista';
  else if (/windows nt 5\.1/i.test(ua)) osName = 'Windows XP';
  else if (/windows nt/i.test(ua)) osName = 'Windows OS';
  else if (/android\s+([0-9.]+)/i.test(ua)) {
    const v = ua.match(/android\s+([0-9.]+)/i);
    osName = `Android ${v ? v[1] : ''}`.trim();
  } else if (/cpu.*os\s+([0-9_]+)\s+like\s+mac/i.test(ua)) {
    const v = ua.match(/cpu.*os\s+([0-9_]+)\s+like\s+mac/i);
    osName = `iOS ${v ? v[1].replace(/_/g, '.') : ''}`.trim();
  } else if (/mac os x\s+([0-9_]+)/i.test(ua)) {
    const v = ua.match(/mac os x\s+([0-9_]+)/i);
    osName = `macOS ${v ? v[1].replace(/_/g, '.') : ''}`.trim();
  } else if (/ubuntu/i.test(ua)) osName = 'Ubuntu Linux';
  else if (/fedora/i.test(ua)) osName = 'Fedora Linux';
  else if (/red hat/i.test(ua)) osName = 'RedHat Linux';
  else if (/linux/i.test(ua)) osName = 'Linux';
  else if (/crkey|chromebook/i.test(ua)) osName = 'ChromeOS';

  // 4. Browser Name & Version
  let browserName = 'Unknown Browser';
  let browserVersion = '';
  if (/edg\/([0-9.]+)/i.test(ua)) {
    browserName = 'Microsoft Edge';
    const m = ua.match(/edg\/([0-9.]+)/i);
    browserVersion = m ? m[1] : '';
  } else if (/opr\/([0-9.]+)/i.test(ua) || /opera/i.test(ua)) {
    browserName = 'Opera';
    const m = ua.match(/(?:opr|opera)\/([0-9.]+)/i);
    browserVersion = m ? m[1] : '';
  } else if (/samsungbrowser\/([0-9.]+)/i.test(ua)) {
    browserName = 'Samsung Internet';
    const m = ua.match(/samsungbrowser\/([0-9.]+)/i);
    browserVersion = m ? m[1] : '';
  } else if (/ucbrowser\/([0-9.]+)/i.test(ua)) {
    browserName = 'UC Browser';
    const m = ua.match(/ucbrowser\/([0-9.]+)/i);
    browserVersion = m ? m[1] : '';
  } else if (/chrome\/([0-9.]+)/i.test(ua)) {
    browserName = 'Google Chrome';
    const m = ua.match(/chrome\/([0-9.]+)/i);
    browserVersion = m ? m[1] : '';
  } else if (/firefox\/([0-9.]+)/i.test(ua)) {
    browserName = 'Mozilla Firefox';
    const m = ua.match(/firefox\/([0-9.]+)/i);
    browserVersion = m ? m[1] : '';
  } else if (/version\/([0-9.]+).*safari/i.test(ua)) {
    browserName = 'Apple Safari';
    const m = ua.match(/version\/([0-9.]+)/i);
    browserVersion = m ? m[1] : '';
  }

  return {
    deviceType,
    deviceName,
    osName,
    browserName,
    browserVersion,
  };
}

const net = require('node:net');

const geoCache = new Map();
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isPrivateOrLocalIp(ip) {
  const cleanIp = String(ip || '').replace(/^::ffff:/, '').trim();
  if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1') return true;
  if (cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)) return true;
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(cleanIp)) return true;
  if (cleanIp.startsWith('fe80:') || cleanIp.startsWith('fc00:') || cleanIp.startsWith('fd')) return true;
  return false;
}

function formatGeoParts(city, region, country) {
  let cleanCountry = String(country || '').trim();
  if (cleanCountry === 'IN') cleanCountry = 'India';
  const rawParts = [city, region, cleanCountry]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  const uniqueParts = [];
  for (const part of rawParts) {
    if (!uniqueParts.some((u) => u.toLowerCase() === part.toLowerCase())) {
      uniqueParts.push(part);
    }
  }
  return uniqueParts.length > 0 ? uniqueParts.join(', ') : 'India';
}

/**
 * Extract location directly from trusted CDN/edge geolocation headers if present
 */
function extractHeaderLocation(headers = {}) {
  if (!headers || typeof headers !== 'object') return null;
  const city = headers['cf-ipcity'] || headers['x-vercel-ip-city'] || '';
  const region = headers['cf-region'] || headers['x-vercel-ip-country-region'] || '';
  const country = headers['cf-ipcountry'] || headers['x-vercel-ip-country'] || '';
  if (city || region) {
    return formatGeoParts(decodeURIComponentSafe(city), decodeURIComponentSafe(region), country || 'India');
  }
  return null;
}

function decodeURIComponentSafe(val) {
  try {
    return decodeURIComponent(String(val || ''));
  } catch {
    return String(val || '');
  }
}

/**
 * Synchronous location lookup using cached GeoIP or safe local/fallback label
 */
function resolveLocation(ip, _profile = {}, headers = {}) {
  const cleanIp = String(ip || '').replace(/^::ffff:/, '').trim();
  if (isPrivateOrLocalIp(cleanIp)) {
    return !cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1'
      ? 'Localhost / Development Server'
      : 'Local Network (LAN)';
  }
  const headerLoc = extractHeaderLocation(headers);
  if (headerLoc) return headerLoc;

  const cached = geoCache.get(cleanIp);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.location;
  }
  return 'India';
}

/**
 * Asynchronous real IP Geolocation lookup with in-memory cache and fast timeout
 */
async function resolveLocationAsync(ip, headers = {}) {
  const cleanIp = String(ip || '').replace(/^::ffff:/, '').trim();
  if (isPrivateOrLocalIp(cleanIp)) {
    return !cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1'
      ? 'Localhost / Development Server'
      : 'Local Network (LAN)';
  }

  const headerLoc = extractHeaderLocation(headers);
  if (headerLoc) return headerLoc;

  const cached = geoCache.get(cleanIp);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.location;
  }

  if (!net.isIP(cleanIp)) {
    return 'India';
  }

  let resolved = '';
  const queryProvider = async (url, parseFn) => {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2500),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const loc = parseFn(data);
    if (!loc) throw new Error('Empty location');
    return loc;
  };

  try {
    resolved = await Promise.any([
      queryProvider(`https://ipinfo.io/${encodeURIComponent(cleanIp)}/json`, (d) =>
        d && (d.city || d.region || d.country) ? formatGeoParts(d.city, d.region, d.country || 'India') : ''
      ),
      queryProvider(`https://ipwho.is/${encodeURIComponent(cleanIp)}`, (d) =>
        d && d.success !== false && (d.city || d.region || d.country) ? formatGeoParts(d.city, d.region, d.country || 'India') : ''
      ),
    ]);
  } catch (_) {}

  const finalLoc = resolved || 'India';
  if (resolved) {
    if (geoCache.size > 5000) {
      geoCache.clear();
    }
    geoCache.set(cleanIp, {
      location: finalLoc,
      expiresAt: Date.now() + GEO_CACHE_TTL_MS,
    });
  }
  return finalLoc;
}

module.exports = {
  parseUserAgent,
  resolveLocation,
  resolveLocationAsync,
};
