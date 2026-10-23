'use strict';

/**
 * High-resolution, modern SVG assets for Default Brand Logo & Favicon
 * Designed with 3D gradients, specular highlights, and crisp geometry.
 */

function getDefaultLogoSvg(brandName = 'Easy Recharge', tagline = 'EXCHANGE PLATFORM') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 80" width="420" height="80">
  <defs>
    <!-- 3D Gradients -->
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f2fe" />
      <stop offset="50%" stop-color="#4facfe" />
      <stop offset="100%" stop-color="#0052d4" />
    </linearGradient>
    <linearGradient id="depthGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#1e293b" stop-opacity="0.3" />
    </linearGradient>
    <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="60%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#ef4444" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
    <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#e2e8f0" />
    </linearGradient>
    <filter id="glow3d" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <filter id="shadow3d" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="4" stdDeviation="4" flood-color="#0052d4" flood-opacity="0.35" />
    </filter>
  </defs>

  <!-- 3D Emblem Container -->
  <g transform="translate(10, 8)" filter="url(#shadow3d)">
    <!-- Base 3D Hexagon Plate -->
    <polygon points="32,2 58,16 58,48 32,62 6,48 6,16" fill="url(#depthGrad)" stroke="url(#shieldGrad)" stroke-width="2.5" />
    <!-- Inner Glowing Facet -->
    <polygon points="32,7 53,19 53,45 32,57 11,45 11,19" fill="#0b1329" fill-opacity="0.85" />
    
    <!-- 3D Exchange Arrows (Curved Tech Orbit) -->
    <path d="M 20 22 A 16 16 0 0 1 45 25" fill="none" stroke="url(#accentGrad)" stroke-width="2.5" stroke-linecap="round" />
    <polygon points="48,25 43,21 44,28" fill="#10b981" />
    
    <path d="M 44 42 A 16 16 0 0 1 19 39" fill="none" stroke="url(#shieldGrad)" stroke-width="2.5" stroke-linecap="round" />
    <polygon points="16,39 21,43 20,36" fill="#00f2fe" />

    <!-- 3D Lightning Core -->
    <polygon points="34,16 23,34 32,34 30,48 41,30 32,30" fill="url(#boltGrad)" filter="url(#glow3d)" />
  </g>

  <!-- Brand Typography -->
  <g transform="translate(86, 0)">
    <!-- Main Title -->
    <text x="0" y="42" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" font-size="25" font-weight="800" fill="url(#textGrad)" letter-spacing="0.2">
      ${escapeSvg(brandName)}
    </text>

    <!-- Tagline Badge -->
    <rect x="0" y="49" width="168" height="18" rx="4" fill="url(#shieldGrad)" fill-opacity="0.18" stroke="url(#shieldGrad)" stroke-width="1" stroke-opacity="0.4" />
    <text x="7" y="62" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="800" fill="#38bdf8" letter-spacing="2">
      ${escapeSvg(tagline)}
    </text>

    <!-- 3D Pulse Dot -->
    <circle cx="160" cy="58" r="3" fill="#10b981" />
  </g>
</svg>`;
}

function getDefaultFaviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="favBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="favBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f2fe" />
      <stop offset="100%" stop-color="#4facfe" />
    </linearGradient>
    <linearGradient id="favBolt" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
  </defs>
  <!-- 3D Rounded Shield Base -->
  <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#favBg)" stroke="url(#favBorder)" stroke-width="3" />
  <!-- Exchange Arc -->
  <circle cx="32" cy="32" r="18" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="4 3" opacity="0.4" />
  <!-- Central 3D Lightning Bolt -->
  <polygon points="34,14 21,34 31,34 29,50 43,30 33,30" fill="url(#favBolt)" />
</svg>`;
}

function getDefaultDashboardBannerSvg(title = 'Next-Gen Multi-Recharge & LAPU Stock Exchange Platform', subtitle = 'Instant automated LAPU stock swapping, high-speed recharge routing, and 24x7 real-time settlement') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 180" width="1200" height="180" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bannerBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#070d1e" />
      <stop offset="40%" stop-color="#0f214d" />
      <stop offset="75%" stop-color="#182c66" />
      <stop offset="100%" stop-color="#0b1736" />
    </linearGradient>
    <linearGradient id="cyanGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00f2fe" />
      <stop offset="100%" stop-color="#4facfe" />
    </linearGradient>
    <linearGradient id="amberGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#ef4444" />
    </linearGradient>
    <linearGradient id="greenGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background Base -->
  <rect x="0" y="0" width="1200" height="180" fill="url(#bannerBg)" />

  <!-- Ambient Light Orbs -->
  <circle cx="100" cy="90" r="120" fill="#0052d4" opacity="0.18" filter="url(#softGlow)" />
  <circle cx="950" cy="90" r="180" fill="#4facfe" opacity="0.12" filter="url(#softGlow)" />
  <circle cx="1120" cy="50" r="90" fill="#10b981" opacity="0.15" filter="url(#softGlow)" />

  <!-- Tech Grid Lines -->
  <path d="M 0 45 L 1200 45 M 0 90 L 1200 90 M 0 135 L 1200 135" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1" />
  <path d="M 200 0 L 200 180 M 450 0 L 450 180 M 700 0 L 700 180 M 950 0 L 950 180" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1" />

  <!-- Decorative Circuit Curves on Right -->
  <g opacity="0.35" transform="translate(820, 20)">
    <circle cx="160" cy="70" r="65" fill="none" stroke="url(#cyanGlow)" stroke-width="2" stroke-dasharray="6 4" />
    <circle cx="160" cy="70" r="45" fill="none" stroke="url(#cyanGlow)" stroke-width="1.5" />
    <path d="M 40 70 L 115 70 M 205 70 L 280 70 M 160 5 L 160 25 M 160 115 L 160 135" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" />
    <circle cx="40" cy="70" r="4" fill="#00f2fe" />
    <circle cx="280" cy="70" r="4" fill="#10b981" />
    <polygon points="160,52 148,76 158,76 156,92 172,72 162,72" fill="url(#amberGlow)" />
  </g>

  <!-- Left Content Block -->
  <g transform="translate(48, 36)">
    <!-- Micro Live Badge -->
    <rect x="0" y="0" width="138" height="22" rx="11" fill="#0369a1" fill-opacity="0.35" stroke="#38bdf8" stroke-opacity="0.5" stroke-width="1" />
    <circle cx="10" cy="11" r="3.5" fill="#10b981" />
    <text x="20" y="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="700" fill="#38bdf8" letter-spacing="1">
      OFFICIAL PORTAL
    </text>

    <!-- Main Title Heading -->
    <text x="0" y="52" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" font-size="24" font-weight="800" fill="#ffffff" letter-spacing="-0.3">
      ${escapeSvg(title)}
    </text>

    <!-- Subtitle -->
    <text x="0" y="76" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500" fill="#94a3b8">
      ${escapeSvg(subtitle)}
    </text>

    <!-- Feature Pill Badges -->
    <g transform="translate(0, 92)">
      <rect x="0" y="0" width="156" height="22" rx="4" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1" />
      <text x="10" y="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10.5" font-weight="700" fill="#38bdf8">
        ⚡ Lightning-Fast APIs
      </text>

      <rect x="168" y="0" width="160" height="22" rx="4" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1" />
      <text x="178" y="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10.5" font-weight="700" fill="#4ade80">
        🛡️ Bank-Grade Security
      </text>

      <rect x="340" y="0" width="168" height="22" rx="4" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1" />
      <text x="350" y="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10.5" font-weight="700" fill="#fbbf24">
        🔄 24x7 Real-Time Settle
      </text>
    </g>
  </g>
</svg>`;
}

function escapeSvg(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  getDefaultLogoSvg,
  getDefaultFaviconSvg,
  getDefaultDashboardBannerSvg,
};
