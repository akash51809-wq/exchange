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
};
