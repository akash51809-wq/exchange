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

/**
 * Resolve display location based on IP address and user profile data
 */
function resolveLocation(ip, profile = {}) {
  const cleanIp = String(ip || '').trim();
  const isPrivate =
    !cleanIp ||
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp.startsWith('192.168.') ||
    cleanIp.startsWith('10.') ||
    cleanIp.startsWith('172.16.') ||
    cleanIp.startsWith('172.17.') ||
    cleanIp.startsWith('172.18.') ||
    cleanIp.startsWith('172.19.') ||
    cleanIp.startsWith('172.2') ||
    cleanIp.startsWith('172.30.') ||
    cleanIp.startsWith('172.31.');

  if (isPrivate) {
    if (profile.city || profile.state) {
      const parts = [profile.city, profile.state, 'India (Local/LAN)'].filter(Boolean);
      return parts.join(', ');
    }
    return cleanIp === '127.0.0.1' || cleanIp === '::1'
      ? 'Localhost / Development Server'
      : 'Local Network (LAN)';
  }

  // Profile-based location or general Indian public IP
  const parts = [];
  if (profile.city) parts.push(profile.city);
  if (profile.state) parts.push(profile.state);
  parts.push('India');
  return parts.join(', ');
}

module.exports = {
  parseUserAgent,
  resolveLocation,
};
