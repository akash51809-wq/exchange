'use strict';

const { escapeHtml } = require('../lib/page-utils');

module.exports = function createFrontLandingPage({ db, sendJson }) {
  /**
   * Helper: Get current website settings from database
   */
  async function getWebsiteSettings() {
    try {
      const res = await db.query('SELECT * FROM website_settings WHERE id = 1');
      if (res.rows[0]) {
        const r = res.rows[0];
        return {
          websiteName: r.website_name || 'Easy Recharge Solution',
          websiteTagline: r.website_tagline || "India's Leading B2B Multi-Recharge & LAPU Stock Exchange Platform",
          logoUrl: '/api/logo',
          faviconUrl: '/api/favicon',
          supportPhone: r.support_phone || '+91 98765 43210',
          supportWhatsapp: r.support_whatsapp || '+91 98765 43210',
          supportEmail: r.support_email || 'support@easyrechargesolution.com',
          officeAddress: r.office_address || 'Cyber City, Tower B, Sector 62, Noida, Uttar Pradesh, India - 201309',
          workingHours: r.working_hours || '24x7 Customer & Stock Support',
          footerAbout: r.footer_about || 'Empowering telecom retailers and master distributors across India with lightning-fast multi-recharge services, automated LAPU stock swapping, and bank-grade APIs.',
          socialTelegram: r.social_telegram || 'https://t.me/easyrechargesolution',
          metaTitle: r.meta_title || 'Easy Recharge Solution | B2B Recharge & Stock Exchange',
          metaDescription: r.meta_description || 'Instant Mobile, DTH, LAPU Stock Exchange & Utility Recharge API Platform with 99.99% uptime.',
        };
      }
    } catch (_) {}
    return {
      websiteName: 'Easy Recharge Solution',
      websiteTagline: "India's Leading B2B Multi-Recharge & LAPU Stock Exchange Platform",
      logoUrl: '/api/logo',
      faviconUrl: '/api/favicon',
      supportPhone: '+91 98765 43210',
      supportWhatsapp: '+91 98765 43210',
      supportEmail: 'support@easyrechargesolution.com',
      officeAddress: 'Cyber City, Tower B, Sector 62, Noida, Uttar Pradesh, India - 201309',
      workingHours: '24x7 Customer & Stock Support',
      footerAbout: 'Empowering telecom retailers and master distributors across India with lightning-fast multi-recharge services, automated LAPU stock swapping, and bank-grade APIs.',
      socialTelegram: 'https://t.me/easyrechargesolution',
      metaTitle: 'Easy Recharge Solution | B2B Recharge & Stock Exchange',
      metaDescription: 'Instant Mobile, DTH, LAPU Stock Exchange & Utility Recharge API Platform with 99.99% uptime.',
    };
  }

  /**
   * Render HTML Front Landing Page
   */
  async function sendFrontLandingPage(request, response) {
    const s = await getWebsiteSettings();
    const cleanWhatsapp = s.supportWhatsapp.replace(/\D/g, '');

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(s.metaTitle)}</title>
  <meta name="description" content="${escapeHtml(s.metaDescription)}">
  <link rel="icon" type="image/x-icon" href="/api/favicon">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Syne:wght@700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
  <style>
    :root {
      --bg-dark: #07090e;
      --bg-card: rgba(15, 23, 42, 0.7);
      --bg-card-hover: rgba(30, 41, 59, 0.85);
      --primary: #38bdf8;
      --primary-glow: rgba(56, 189, 248, 0.4);
      --accent-cyan: #06b6d4;
      --accent-emerald: #10b981;
      --accent-indigo: #6366f1;
      --accent-amber: #f59e0b;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --border-glass: rgba(255, 255, 255, 0.08);
      --border-glow: rgba(56, 189, 248, 0.3);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-x: hidden;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    /* 3D Background Mesh & Glow Orbs */
    .bg-mesh-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: -1;
      overflow: hidden;
      pointer-events: none;
    }

    .ambient-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(120px);
      opacity: 0.28;
      animation: floatOrb 18s ease-in-out infinite alternate;
    }

    .orb-1 {
      width: 650px;
      height: 650px;
      top: -150px;
      left: -100px;
      background: radial-gradient(circle, #0284c7, #3b82f6, transparent);
    }

    .orb-2 {
      width: 550px;
      height: 550px;
      top: 35%;
      right: -100px;
      background: radial-gradient(circle, #6366f1, #8b5cf6, transparent);
      animation-duration: 22s;
    }

    .orb-3 {
      width: 500px;
      height: 500px;
      bottom: -100px;
      left: 20%;
      background: radial-gradient(circle, #059669, #0d9488, transparent);
      animation-duration: 25s;
    }

    .bg-grid-overlay {
      position: absolute;
      inset: 0;
      background-image: 
        linear-gradient(to right, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
      background-size: 60px 60px;
      mask-image: radial-gradient(circle at 50% 50%, black 40%, transparent 90%);
    }

    @keyframes floatOrb {
      0% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(60px, 40px) scale(1.1); }
      100% { transform: translate(-40px, 70px) scale(0.95); }
    }

    /* Top Live Ticker */
    .top-ticker {
      background: rgba(11, 15, 25, 0.95);
      border-bottom: 1px solid var(--border-glass);
      backdrop-filter: blur(12px);
      padding: 7px 0;
      font-size: 12px;
      overflow: hidden;
      white-space: nowrap;
      position: relative;
      z-index: 50;
    }

    .ticker-content {
      display: inline-flex;
      gap: 32px;
      animation: tickerRoll 32s linear infinite;
    }

    .ticker-item {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
      font-weight: 500;
    }

    .ticker-badge-live {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent-emerald);
      box-shadow: 0 0 8px var(--accent-emerald);
      animation: pulseLive 1.5s infinite;
    }

    @keyframes tickerRoll {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }

    @keyframes pulseLive {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    /* Navbar */
    .navbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(7, 9, 14, 0.82);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border-glass);
      transition: all 0.3s ease;
    }

    .nav-container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand-link {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: #fff;
    }

    .brand-logo-img {
      height: 38px;
      max-width: 180px;
      object-fit: contain;
      filter: drop-shadow(0 2px 8px rgba(0, 242, 254, 0.3));
    }

    .brand-title {
      font-family: 'Syne', sans-serif;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #ffffff 40%, #94a3b8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 28px;
      list-style: none;
    }

    .nav-link {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      transition: color 0.2s;
    }

    .nav-link:hover {
      color: var(--primary);
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .btn-login {
      color: #fff;
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 600;
      padding: 9px 18px;
      border-radius: 8px;
      border: 1px solid var(--border-glass);
      background: rgba(255, 255, 255, 0.05);
      transition: all 0.2s;
    }

    .btn-login:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--primary);
      color: #fff;
      transform: translateY(-1px);
    }

    .btn-register-3d {
      background: linear-gradient(135deg, #0ea5e9, #2563eb);
      color: #fff !important;
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 700;
      padding: 10px 22px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 18px rgba(14, 165, 233, 0.35);
      transition: all 0.25s ease;
      position: relative;
      overflow: hidden;
    }

    .btn-register-3d:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(14, 165, 233, 0.55);
    }

    /* Container Utility */
    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* Hero Section */
    .hero-section {
      padding: 80px 0 100px;
      position: relative;
    }

    .hero-grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 48px;
      align-items: center;
    }

    .pill-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 30px;
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.3);
      font-size: 13px;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 24px;
    }

    .hero-headline {
      font-family: 'Syne', sans-serif;
      font-size: 52px;
      line-height: 1.15;
      font-weight: 800;
      letter-spacing: -1.5px;
      margin-bottom: 20px;
    }

    .gradient-text-3d {
      background: linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #c084fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: inline-block;
    }

    .hero-subtext {
      font-size: 17.5px;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: 34px;
      max-width: 580px;
    }

    .hero-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 44px;
    }

    .btn-hero-primary {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
      text-decoration: none;
      font-size: 16px;
      font-weight: 700;
      padding: 15px 32px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 10px 30px rgba(2, 132, 199, 0.4);
      transition: all 0.25s;
    }

    .btn-hero-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 40px rgba(2, 132, 199, 0.6);
      color: #fff;
    }

    .btn-hero-glass {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-glass);
      color: #fff;
      text-decoration: none;
      font-size: 16px;
      font-weight: 600;
      padding: 15px 28px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      backdrop-filter: blur(10px);
      transition: all 0.25s;
    }

    .btn-hero-glass:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--primary);
      color: #fff;
      transform: translateY(-2px);
    }

    .hero-proof-strip {
      display: flex;
      align-items: center;
      gap: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border-glass);
    }

    .proof-item {
      display: flex;
      flex-direction: column;
    }

    .proof-val {
      font-size: 22px;
      font-weight: 800;
      color: #fff;
      font-family: 'Syne', sans-serif;
    }

    .proof-lbl {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
    }

    /* 3D Holographic Terminal Card */
    .terminal-3d-wrap {
      perspective: 1200px;
      display: flex;
      justify-content: center;
    }

    .terminal-3d-card {
      background: rgba(13, 20, 36, 0.85);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 20px;
      padding: 24px;
      width: 100%;
      max-width: 480px;
      box-shadow: 
        0 20px 50px rgba(0, 0, 0, 0.6),
        0 0 40px rgba(56, 189, 248, 0.15),
        inset 0 1px 1px rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(20px);
      transform-style: preserve-3d;
      transition: transform 0.2s cubic-bezier(0.2, 0, 0.2, 1);
      position: relative;
    }

    .terminal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-glass);
      margin-bottom: 18px;
    }

    .terminal-dots {
      display: flex;
      gap: 6px;
    }

    .t-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .t-dot-red { background: #ef4444; }
    .t-dot-yellow { background: #f59e0b; }
    .t-dot-green { background: #10b981; }

    .terminal-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 20px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--accent-emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
      display: flex;
      align-items: center;
      gap: 5px;
    }

    /* 3D Simulated Chip */
    .chip-3d-box {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.95));
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 18px;
      position: relative;
      overflow: hidden;
    }

    .chip-3d-box::after {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(
        45deg,
        transparent 45%,
        rgba(56, 189, 248, 0.12) 50%,
        transparent 55%
      );
      animation: chipScan 4s linear infinite;
    }

    @keyframes chipScan {
      0% { transform: translateY(-30%); }
      100% { transform: translateY(30%); }
    }

    .chip-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--primary);
      margin-bottom: 4px;
    }

    .chip-volume {
      font-size: 26px;
      font-weight: 800;
      color: #fff;
      font-family: 'Syne', sans-serif;
    }

    .chip-stats-row {
      display: flex;
      justify-content: space-between;
      margin-top: 12px;
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Live Stream Items */
    .live-stream-box {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .stream-row {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      transition: all 0.2s;
    }

    .stream-row:hover {
      background: rgba(255, 255, 255, 0.07);
      border-color: rgba(56, 189, 248, 0.3);
      transform: translateX(4px);
    }

    .stream-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .stream-icon {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }

    .stream-icon-airtel { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
    .stream-icon-jio { background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); }
    .stream-icon-swap { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }

    .stream-amount {
      font-weight: 700;
      color: #fff;
    }

    .stream-speed {
      font-size: 11px;
      color: var(--accent-emerald);
      font-weight: 600;
    }

    /* Calculator Section */
    .section-padding {
      padding: 90px 0;
      position: relative;
    }

    .section-titlebar {
      text-align: center;
      max-width: 680px;
      margin: 0 auto 56px;
    }

    .section-tag {
      font-size: 12.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--primary);
      margin-bottom: 12px;
      display: block;
    }

    .section-heading {
      font-family: 'Syne', sans-serif;
      font-size: 38px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 16px;
    }

    .section-desc {
      color: var(--text-muted);
      font-size: 16px;
    }

    /* 3D Profit Calculator Widget */
    .calculator-card {
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid var(--border-glow);
      border-radius: 24px;
      padding: 40px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(20px);
    }

    .calc-grid {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 40px;
      align-items: center;
    }

    .calc-control-group {
      margin-bottom: 24px;
    }

    .calc-control-label {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
    }

    .calc-select, .calc-range {
      width: 100%;
      border-radius: 10px;
    }

    .calc-select {
      background: rgba(2, 6, 23, 0.8);
      border: 1px solid var(--border-glass);
      color: #fff;
      padding: 14px 18px;
      font-size: 15px;
      font-weight: 600;
      outline: none;
    }

    .calc-select:focus {
      border-color: var(--primary);
    }

    .calc-range {
      accent-color: var(--primary);
      cursor: pointer;
      height: 8px;
    }

    /* Calculator Results 3D Display */
    .calc-results-box {
      background: linear-gradient(135deg, rgba(30, 58, 138, 0.3), rgba(15, 23, 42, 0.9));
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-radius: 20px;
      padding: 32px;
      text-align: center;
      position: relative;
      box-shadow: inset 0 0 30px rgba(56, 189, 248, 0.1);
    }

    .calc-res-label {
      font-size: 13px;
      font-weight: 700;
      color: var(--primary);
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .calc-res-val {
      font-family: 'Syne', sans-serif;
      font-size: 46px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 8px;
    }

    .calc-res-sub {
      color: var(--text-muted);
      font-size: 14px;
      margin-bottom: 24px;
    }

    .calc-breakdown-row {
      display: flex;
      justify-content: space-around;
      padding-top: 20px;
      border-top: 1px solid var(--border-glass);
    }

    .b-item strong {
      display: block;
      font-size: 18px;
      color: var(--accent-emerald);
      font-weight: 700;
    }

    .b-item span {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Features Grid (3D Tilt Cards) */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 28px;
    }

    .feature-card-3d {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 20px;
      padding: 32px 28px;
      transition: all 0.3s cubic-bezier(0.2, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(12px);
    }

    .feature-card-3d:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-glow);
      transform: translateY(-6px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 30px rgba(56, 189, 248, 0.12);
    }

    .feature-icon-box {
      width: 54px;
      height: 54px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      margin-bottom: 22px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.3);
    }

    .icon-blue { background: linear-gradient(135deg, #0284c7, #2563eb); color: #fff; }
    .icon-emerald { background: linear-gradient(135deg, #059669, #10b981); color: #fff; }
    .icon-indigo { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; }
    .icon-amber { background: linear-gradient(135deg, #d97706, #f59e0b); color: #fff; }
    .icon-cyan { background: linear-gradient(135deg, #0891b2, #06b6d4); color: #fff; }
    .icon-purple { background: linear-gradient(135deg, #9333ea, #c084fc); color: #fff; }

    .feature-title {
      font-size: 19px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 12px;
    }

    .feature-desc {
      font-size: 14.5px;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* Operators Showcase Grid */
    .operators-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
    }

    .operator-badge-card {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border-glass);
      border-radius: 16px;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.25s;
    }

    .operator-badge-card:hover {
      background: rgba(30, 41, 59, 0.8);
      border-color: var(--primary);
      transform: translateY(-3px);
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    }

    .op-meta strong {
      display: block;
      font-size: 16px;
      color: #fff;
    }

    .op-meta span {
      font-size: 12px;
      color: var(--text-muted);
    }

    .op-status {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 12px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--accent-emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    /* Developer API Studio */
    .api-studio-card {
      background: #0b0f19;
      border: 1px solid var(--border-glass);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6);
    }

    .api-header {
      background: rgba(15, 23, 42, 0.9);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-glass);
    }

    .api-tabs {
      display: flex;
      gap: 8px;
    }

    .api-tab-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 13px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .api-tab-btn.active {
      background: rgba(56, 189, 248, 0.15);
      color: var(--primary);
    }

    .api-body {
      padding: 24px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
      font-size: 13.5px;
      line-height: 1.6;
      color: #e2e8f0;
      overflow-x: auto;
    }

    .code-comment { color: #64748b; }
    .code-str { color: #34d399; }
    .code-key { color: #38bdf8; }
    .code-val { color: #f59e0b; }

    /* Contact Section */
    .contact-grid {
      display: grid;
      grid-template-columns: 0.9fr 1.1fr;
      gap: 40px;
    }

    .contact-info-card {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 24px;
      padding: 36px;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    .c-info-row {
      display: flex;
      align-items: flex-start;
      gap: 18px;
    }

    .c-icon {
      width: 46px;
      height: 46px;
      border-radius: 12px;
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }

    .c-detail strong {
      display: block;
      font-size: 15px;
      color: #fff;
      margin-bottom: 3px;
    }

    .c-detail p, .c-detail a {
      color: var(--text-muted);
      font-size: 14px;
      text-decoration: none;
      transition: color 0.2s;
    }

    .c-detail a:hover {
      color: var(--primary);
    }

    .contact-form-card {
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid var(--border-glass);
      border-radius: 24px;
      padding: 36px;
      backdrop-filter: blur(16px);
    }

    .form-row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }

    .form-input-box {
      margin-bottom: 16px;
    }

    .form-input-box label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .front-input {
      width: 100%;
      background: rgba(2, 6, 23, 0.7);
      border: 1px solid var(--border-glass);
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      transition: all 0.2s;
    }

    .front-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
    }

    .btn-submit-contact {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
      border: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
      transition: all 0.2s;
      box-shadow: 0 4px 18px rgba(2, 132, 199, 0.35);
    }

    .btn-submit-contact:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(2, 132, 199, 0.5);
    }

    /* Footer */
    .footer {
      border-top: 1px solid var(--border-glass);
      background: rgba(4, 6, 10, 0.95);
      padding: 70px 0 30px;
      position: relative;
    }

    .footer-grid {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr 1.2fr;
      gap: 40px;
      margin-bottom: 50px;
    }

    .footer-col h6 {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 18px;
    }

    .footer-links {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .footer-links a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 14px;
      transition: color 0.2s;
    }

    .footer-links a:hover {
      color: var(--primary);
    }

    .footer-bottom {
      border-top: 1px solid var(--border-glass);
      padding-top: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      color: #64748b;
      flex-wrap: wrap;
      gap: 16px;
    }

    /* Floating WhatsApp Button */
    .whatsapp-float-btn {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 999;
      background: #25d366;
      color: #fff;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      box-shadow: 0 8px 24px rgba(37, 211, 102, 0.45);
      text-decoration: none;
      transition: all 0.25s cubic-bezier(0.2, 0, 0.2, 1);
    }

    .whatsapp-float-btn:hover {
      transform: scale(1.1) translateY(-2px);
      box-shadow: 0 12px 30px rgba(37, 211, 102, 0.6);
      color: #fff;
    }

    /* Responsive */
    @media (max-width: 992px) {
      .hero-grid, .calc-grid, .contact-grid {
        grid-template-columns: 1fr;
      }
      .features-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .operators-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .footer-grid {
        grid-template-columns: 1fr 1fr;
      }
      .hero-headline {
        font-size: 40px;
      }
      .nav-links {
        display: none;
      }
    }

    @media (max-width: 640px) {
      .features-grid, .operators-grid, .footer-grid, .form-row-2 {
        grid-template-columns: 1fr;
      }
      .hero-headline {
        font-size: 32px;
      }
    }
  </style>
</head>
<body>
  <!-- Background 3D Glow & Grid -->
  <div class="bg-mesh-container">
    <div class="ambient-orb orb-1"></div>
    <div class="ambient-orb orb-2"></div>
    <div class="ambient-orb orb-3"></div>
    <div class="bg-grid-overlay"></div>
  </div>

  <!-- Top Real-time Ticker -->
  <div class="top-ticker">
    <div class="ticker-content">
      <div class="ticker-item"><span class="ticker-badge-live"></span> <strong>Airtel LAPU Stock:</strong> 99.8% Available (Margin up to 4.2%)</div>
      <div class="ticker-item"><span class="ticker-badge-live"></span> <strong>Jio Fast-Route:</strong> 22ms Execution (Zero Timeout)</div>
      <div class="ticker-item"><span class="ticker-badge-live"></span> <strong>Vi Instant Swap:</strong> 100% Active (Margin up to 4.8%)</div>
      <div class="ticker-item"><span class="ticker-badge-live"></span> <strong>BSNL National Flexi:</strong> Active (Margin up to 5.5%)</div>
      <div class="ticker-item"><span class="ticker-badge-live"></span> <strong>DTH All-India:</strong> Tata Play, Sun Direct, D2H (100% SLA)</div>
      <div class="ticker-item"><span class="ticker-badge-live"></span> <strong>Automated Wallet QR:</strong> Instant Dynamic Credit (0s Latency)</div>
      <!-- Loop Items for continuous smooth scrolling -->
      <div class="ticker-item"><span class="ticker-badge-live"></span> <strong>Airtel LAPU Stock:</strong> 99.8% Available (Margin up to 4.2%)</div>
      <div class="ticker-item"><span class="ticker-badge-live"></span> <strong>Jio Fast-Route:</strong> 22ms Execution (Zero Timeout)</div>
      <div class="ticker-item"><span class="ticker-badge-live"></span> <strong>Vi Instant Swap:</strong> 100% Active (Margin up to 4.8%)</div>
      <div class="ticker-item"><span class="ticker-badge-live"></span> <strong>BSNL National Flexi:</strong> Active (Margin up to 5.5%)</div>
    </div>
  </div>

  <!-- Navigation Bar -->
  <header class="navbar">
    <div class="nav-container">
      <a href="/" class="brand-link">
        <img src="${s.logoUrl}" alt="${escapeHtml(s.websiteName)}" class="brand-logo-img" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block';">
        <span class="brand-title" style="display:none;">${escapeHtml(s.websiteName)}</span>
      </a>

      <ul class="nav-links">
        <li><a href="#solutions" class="nav-link">Solutions</a></li>
        <li><a href="#calculator" class="nav-link">Live Margins</a></li>
        <li><a href="#operators" class="nav-link">Operators</a></li>
        <li><a href="#api" class="nav-link">API Terminal</a></li>
        <li><a href="#contact" class="nav-link">Contact Support</a></li>
      </ul>

      <div class="nav-actions">
        <a href="/admin/login" class="btn-login"><i class="fa fa-user-circle mr-1"></i> Partner Login</a>
        <a href="/admin/register" class="btn-register-3d"><i class="fa fa-bolt"></i> Get Started</a>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="hero-section">
    <div class="container">
      <div class="hero-grid">
        <!-- Hero Left Info -->
        <div>
          <div class="pill-badge">
            <i class="fa fa-shield"></i> Next-Gen Telecom &amp; Stock Exchange Infra
          </div>
          <h1 class="hero-headline">
            India's Most Advanced B2B Recharge &amp; <span class="gradient-text-3d">LAPU Stock Exchange</span>
          </h1>
          <p class="hero-subtext">
            ${escapeHtml(s.websiteTagline)}. Empowering retailers and master distributors with sub-second recharge APIs, automated stock swapping, and bank-grade security.
          </p>

          <div class="hero-buttons">
            <a href="/admin/register" class="btn-hero-primary">
              <i class="fa fa-rocket"></i> Open Free Account
            </a>
            <a href="#calculator" class="btn-hero-glass">
              <i class="fa fa-calculator"></i> Calculate Profit
            </a>
            <a href="/admin/login" class="btn-hero-glass">
              <i class="fa fa-sign-in"></i> Live Terminal
            </a>
          </div>

          <div class="hero-proof-strip">
            <div class="proof-item">
              <span class="proof-val">₹150Cr+</span>
              <span class="proof-lbl">Monthly Volume</span>
            </div>
            <div class="proof-item">
              <span class="proof-val">99.98%</span>
              <span class="proof-lbl">Uptime SLA</span>
            </div>
            <div class="proof-item">
              <span class="proof-val">&lt; 1.2s</span>
              <span class="proof-lbl">Avg Response</span>
            </div>
          </div>
        </div>

        <!-- Hero Right: 3D Holographic Terminal Card -->
        <div class="terminal-3d-wrap">
          <div class="terminal-3d-card" id="terminal3d">
            <div class="terminal-header">
              <div class="terminal-dots">
                <span class="t-dot t-dot-red"></span>
                <span class="t-dot t-dot-yellow"></span>
                <span class="t-dot t-dot-green"></span>
              </div>
              <div class="terminal-badge">
                <i class="fa fa-circle"></i> TERMINAL // 24ms LATENCY
              </div>
            </div>

            <!-- 3D Microchip Box -->
            <div class="chip-3d-box">
              <div class="chip-title">Exchange Volume (Today)</div>
              <div class="chip-volume" id="live-vol-counter">₹4,892,450.00</div>
              <div class="chip-stats-row">
                <span>Active Operators: <strong>14 / 14</strong></span>
                <span>Success Rate: <strong class="text-success">99.99%</strong></span>
              </div>
            </div>

            <!-- Simulated Realtime Stream -->
            <div class="live-stream-box">
              <div class="stream-row">
                <div class="stream-left">
                  <span class="stream-icon stream-icon-airtel">AR</span>
                  <div>
                    <strong>Airtel Prepaid ₹299</strong>
                    <div style="font-size:11px;color:#94a3b8;">Ref #721980 • Delhi Circle</div>
                  </div>
                </div>
                <div class="text-right">
                  <div class="stream-amount">+₹12.55 Mgn</div>
                  <div class="stream-speed">⚡ 0.8s SUCCESS</div>
                </div>
              </div>

              <div class="stream-row">
                <div class="stream-left">
                  <span class="stream-icon stream-icon-jio">JO</span>
                  <div>
                    <strong>Jio Unlimited ₹666</strong>
                    <div style="font-size:11px;color:#94a3b8;">Ref #721981 • Mumbai Circle</div>
                  </div>
                </div>
                <div class="text-right">
                  <div class="stream-amount">+₹25.30 Mgn</div>
                  <div class="stream-speed">⚡ 0.6s SUCCESS</div>
                </div>
              </div>

              <div class="stream-row">
                <div class="stream-left">
                  <span class="stream-icon stream-icon-swap">SW</span>
                  <div>
                    <strong>LAPU Swap ₹10,000</strong>
                    <div style="font-size:11px;color:#94a3b8;">Seller ➔ Buyer Wallet</div>
                  </div>
                </div>
                <div class="text-right">
                  <div class="stream-amount">+₹420.00 Mgn</div>
                  <div class="stream-speed">⚡ REALTIME</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Interactive 3D Profit & Margin Calculator -->
  <section class="section-padding" id="calculator" style="background: rgba(2, 6, 23, 0.4);">
    <div class="container">
      <div class="section-titlebar">
        <span class="section-tag">Instant Margin Simulator</span>
        <h2 class="section-heading">Calculate Your Real-Time Earnings</h2>
        <p class="section-desc">See exactly how much you earn every day with our high-throughput recharge &amp; LAPU stock swap engine.</p>
      </div>

      <div class="calculator-card">
        <div class="calc-grid">
          <!-- Controls -->
          <div>
            <div class="calc-control-group">
              <div class="calc-control-label">
                <span>Select Operator Service</span>
                <strong id="calc-margin-pct" style="color:var(--accent-emerald);">4.20% Commission</strong>
              </div>
              <select class="calc-select" id="calc-operator-select">
                <option value="4.2" selected>Airtel Prepaid &amp; DTH (4.20% Margin)</option>
                <option value="3.8">Reliance Jio Direct API (3.80% Margin)</option>
                <option value="4.8">Vodafone Idea - Vi Swap (4.80% Margin)</option>
                <option value="5.2">BSNL Flexi Topup (5.20% Margin)</option>
                <option value="4.0">Tata Play DTH (4.00% Margin)</option>
                <option value="4.5">LAPU Stock Liquidation (4.50% Net Margin)</option>
              </select>
            </div>

            <div class="calc-control-group">
              <div class="calc-control-label">
                <span>Daily Recharge / Exchange Volume</span>
                <strong id="calc-volume-display" style="color:#fff;">₹ 50,000 / Day</strong>
              </div>
              <input type="range" class="calc-range" id="calc-volume-range" min="5000" max="500000" step="5000" value="50000">
              <div class="d-flex justify-content-between mt-2" style="font-size:12px;color:#64748b;">
                <span>₹ 5,000</span>
                <span>₹ 2,50,000</span>
                <span>₹ 5,00,000</span>
              </div>
            </div>

            <div class="calc-control-group">
              <div class="calc-control-label">
                <span>Your Partner Tier</span>
              </div>
              <select class="calc-select" id="calc-tier-select">
                <option value="1">Retailer Account (Direct Fast Route)</option>
                <option value="1.15" selected>Master Distributor (+15% Extra Margin)</option>
                <option value="1.25">API Partner / White Label (+25% Extra Margin)</option>
              </select>
            </div>
          </div>

          <!-- Results 3D Display -->
          <div class="calc-results-box">
            <div class="calc-res-label">Estimated Monthly Earnings</div>
            <div class="calc-res-val" id="calc-monthly-earn">₹ 72,450</div>
            <div class="calc-res-sub">Credited instantly to your wallet upon transaction completion</div>

            <div class="calc-breakdown-row">
              <div class="b-item">
                <strong id="calc-daily-earn">₹ 2,415</strong>
                <span>Daily Profit</span>
              </div>
              <div class="b-item">
                <strong id="calc-annual-earn">₹ 8,69,400</strong>
                <span>Annual Growth</span>
              </div>
              <div class="b-item">
                <strong style="color:var(--primary);">0% Fee</strong>
                <span>No Hidden Cut</span>
              </div>
            </div>

            <a href="/admin/register" class="btn-hero-primary mt-4 w-100 justify-content-center" style="display:flex;">
              <i class="fa fa-arrow-right"></i> Claim These Margins Today
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 6 Core Solutions & Capabilities -->
  <section class="section-padding" id="solutions">
    <div class="container">
      <div class="section-titlebar">
        <span class="section-tag">Next-Gen Capabilities</span>
        <h2 class="section-heading">Built for High-Frequency Telecom Operations</h2>
        <p class="section-desc">Experience cutting-edge fintech infrastructure built to handle millions in daily recharge volume with zero downtime.</p>
      </div>

      <div class="features-grid">
        <!-- 1 -->
        <div class="feature-card-3d">
          <div class="feature-icon-box icon-blue">
            <i class="fa fa-refresh"></i>
          </div>
          <h3 class="feature-title">Automated LAPU Stock Swap</h3>
          <p class="feature-desc">Liquidate excess operator balance into liquid wallet funds instantly. Automatic buyer-seller matching with zero manual intervention.</p>
        </div>

        <!-- 2 -->
        <div class="feature-card-3d">
          <div class="feature-icon-box icon-emerald">
            <i class="fa fa-bolt"></i>
          </div>
          <h3 class="feature-title">Ultra High-Speed Recharge API</h3>
          <p class="feature-desc">Engineered for sub-second execution with automated multi-vendor failover routing. 99.99% uptime guaranteed by SLA.</p>
        </div>

        <!-- 3 -->
        <div class="feature-card-3d">
          <div class="feature-icon-box icon-indigo">
            <i class="fa fa-sliders"></i>
          </div>
          <h3 class="feature-title">Dynamic Custom Margin Engine</h3>
          <p class="feature-desc">Set operator-wise, circle-wise, and denomination-range margins with instant auto-settlement directly into party wallets.</p>
        </div>

        <!-- 4 -->
        <div class="feature-card-3d">
          <div class="feature-icon-box icon-amber">
            <i class="fa fa-qrcode"></i>
          </div>
          <h3 class="feature-title">Instant Dynamic UPI &amp; Bank Topup</h3>
          <p class="feature-desc">Automated wallet top-up via dynamic UPI QR, virtual accounts, and instant 24x7 IMPS/NEFT bank redeem payouts.</p>
        </div>

        <!-- 5 -->
        <div class="feature-card-3d">
          <div class="feature-icon-box icon-cyan">
            <i class="fa fa-file-text-o"></i>
          </div>
          <h3 class="feature-title">Traceable Lifecycle &amp; Dispute Logs</h3>
          <p class="feature-desc">Complete audit logs of every operator request and callback response. One-click instant refund and dispute resolution.</p>
        </div>

        <!-- 6 -->
        <div class="feature-card-3d">
          <div class="feature-icon-box icon-purple">
            <i class="fa fa-shield"></i>
          </div>
          <h3 class="feature-title">Military-Grade Security &amp; IP Locks</h3>
          <p class="feature-desc">AES-256 GCM encrypted credentials, strict IP whitelisting, HMAC request signatures, and multi-factor authentication.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Operators & Ecosystem -->
  <section class="section-padding" id="operators" style="background: rgba(2, 6, 23, 0.4);">
    <div class="container">
      <div class="section-titlebar">
        <span class="section-tag">Supported Ecosystem</span>
        <h2 class="section-heading">All Major Operators, Pan-India Coverage</h2>
        <p class="section-desc">Direct connectivity with major telecom operators and DTH service providers with real-time R-Offer plan lookups.</p>
      </div>

      <div class="operators-grid">
        <div class="operator-badge-card">
          <div class="op-meta">
            <strong>Airtel</strong>
            <span>Prepaid, Postpaid &amp; DTH</span>
          </div>
          <span class="op-status">Active 99.8%</span>
        </div>

        <div class="operator-badge-card">
          <div class="op-meta">
            <strong>Reliance Jio</strong>
            <span>Fast-Route 4G/5G</span>
          </div>
          <span class="op-status">Active 100%</span>
        </div>

        <div class="operator-badge-card">
          <div class="op-meta">
            <strong>Vodafone Idea (Vi)</strong>
            <span>Unlimited &amp; Flexi</span>
          </div>
          <span class="op-status">Active 99.9%</span>
        </div>

        <div class="operator-badge-card">
          <div class="op-meta">
            <strong>BSNL National</strong>
            <span>Topup &amp; Special Plans</span>
          </div>
          <span class="op-status">Active 99.6%</span>
        </div>

        <div class="operator-badge-card">
          <div class="op-meta">
            <strong>Tata Play</strong>
            <span>Instant DTH Recharge</span>
          </div>
          <span class="op-status">Active 100%</span>
        </div>

        <div class="operator-badge-card">
          <div class="op-meta">
            <strong>Dish TV / D2H</strong>
            <span>Auto Pack Active</span>
          </div>
          <span class="op-status">Active 99.9%</span>
        </div>

        <div class="operator-badge-card">
          <div class="op-meta">
            <strong>Sun Direct</strong>
            <span>All Circles</span>
          </div>
          <span class="op-status">Active 99.8%</span>
        </div>

        <div class="operator-badge-card">
          <div class="op-meta">
            <strong>FASTag &amp; Utilities</strong>
            <span>BBPS Connected</span>
          </div>
          <span class="op-status">Active 100%</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Developer API Studio -->
  <section class="section-padding" id="api">
    <div class="container">
      <div class="section-titlebar">
        <span class="section-tag">Developer Friendly</span>
        <h2 class="section-heading">Integrate in Minutes, Not Months</h2>
        <p class="section-desc">Restful JSON APIs, webhook callbacks, and sandbox testing. Plug into our high-speed engine effortlessly.</p>
      </div>

      <div class="api-studio-card">
        <div class="api-header">
          <div class="api-tabs">
            <button class="api-tab-btn active" onclick="switchApiTab('curl')">cURL</button>
            <button class="api-tab-btn" onclick="switchApiTab('node')">Node.js</button>
            <button class="api-tab-btn" onclick="switchApiTab('python')">Python</button>
            <button class="api-tab-btn" onclick="switchApiTab('php')">PHP</button>
          </div>
          <button id="copy-code-btn" class="btn-login" style="padding:4px 12px;font-size:12px;">
            <i class="fa fa-copy"></i> Copy Code
          </button>
        </div>

        <div class="api-body">
          <pre id="api-code-block"><code><span class="code-comment"># Perform a lightning-fast recharge via API</span>
curl -X POST https://exchange.easyrechargesolution.com/api/buyer/recharge \\
  -H <span class="code-str">"Content-Type: application/json"</span> \\
  -H <span class="code-str">"Authorization: Bearer YOUR_API_TOKEN"</span> \\
  -d '{
    <span class="code-key">"mobile"</span>: <span class="code-val">"9876543210"</span>,
    <span class="code-key">"operator"</span>: <span class="code-str">"AIRTEL"</span>,
    <span class="code-key">"amount"</span>: <span class="code-val">299</span>,
    <span class="code-key">"client_txn_id"</span>: <span class="code-str">"TXN_987654321"</span>
  }'</code></pre>
        </div>
      </div>
    </div>
  </section>

  <!-- Contact Us Section -->
  <section class="section-padding" id="contact" style="background: rgba(2, 6, 23, 0.4);">
    <div class="container">
      <div class="section-titlebar">
        <span class="section-tag">Get In Touch</span>
        <h2 class="section-heading">Let's Connect &amp; Scale Your Business</h2>
        <p class="section-desc">Have questions about API integration, distributor pricing, or LAPU stock exchange? Our technical support team is ready 24x7.</p>
      </div>

      <div class="contact-grid">
        <!-- Contact Info Card -->
        <div class="contact-info-card">
          <div class="c-info-row">
            <div class="c-icon"><i class="fa fa-phone"></i></div>
            <div class="c-detail">
              <strong>Phone Support</strong>
              <p><a href="tel:${escapeHtml(s.supportPhone)}">${escapeHtml(s.supportPhone)}</a></p>
            </div>
          </div>

          <div class="c-info-row">
            <div class="c-icon" style="color:#25d366;border-color:rgba(37,211,102,0.3);background:rgba(37,211,102,0.1);"><i class="fa fa-whatsapp"></i></div>
            <div class="c-detail">
              <strong>WhatsApp Business Support</strong>
              <p><a href="https://wa.me/${cleanWhatsapp}?text=Hello%20${encodeURIComponent(s.websiteName)}%20Team,%20I%20am%20interested%20in%20partnering." target="_blank">${escapeHtml(s.supportWhatsapp)}</a></p>
            </div>
          </div>

          <div class="c-info-row">
            <div class="c-icon"><i class="fa fa-envelope"></i></div>
            <div class="c-detail">
              <strong>Official Email</strong>
              <p><a href="mailto:${escapeHtml(s.supportEmail)}">${escapeHtml(s.supportEmail)}</a></p>
            </div>
          </div>

          <div class="c-info-row">
            <div class="c-icon"><i class="fa fa-map-marker"></i></div>
            <div class="c-detail">
              <strong>Head Office Address</strong>
              <p>${escapeHtml(s.officeAddress)}</p>
            </div>
          </div>

          <div class="c-info-row">
            <div class="c-icon"><i class="fa fa-clock-o"></i></div>
            <div class="c-detail">
              <strong>Working Hours</strong>
              <p>${escapeHtml(s.workingHours)}</p>
            </div>
          </div>
        </div>

        <!-- Contact Form -->
        <div class="contact-form-card">
          <h4 style="font-size:20px;font-weight:700;margin-bottom:8px;color:#fff;">Quick Partner Enquiry</h4>
          <p style="color:var(--text-muted);font-size:13.5px;margin-bottom:24px;">Fill in your details and our relationship manager will call you within 15 minutes.</p>

          <form id="contact-form">
            <div class="form-row-2">
              <div class="form-input-box">
                <label>Full Name *</label>
                <input type="text" class="front-input" name="fullname" placeholder="John Doe" required>
              </div>
              <div class="form-input-box">
                <label>Mobile Number (WhatsApp) *</label>
                <input type="tel" class="front-input" name="mobile" placeholder="9876543210" required>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-input-box">
                <label>Business / Shop Name</label>
                <input type="text" class="front-input" name="business" placeholder="ABC Telecom">
              </div>
              <div class="form-input-box">
                <label>Interested In</label>
                <select class="front-input" name="interest" style="background:#0b1329;">
                  <option value="retailer">Retailer Account (Recharge)</option>
                  <option value="stock_seller">LAPU Stock Seller</option>
                  <option value="master_distributor">Master Distributor</option>
                  <option value="api_partner">Recharge API Integration</option>
                </select>
              </div>
            </div>

            <div class="form-input-box">
              <label>Message / Requirements</label>
              <textarea class="front-input" name="message" rows="3" placeholder="Tell us about your daily recharge volume or requirements..."></textarea>
            </div>

            <button type="submit" id="btn-contact-submit" class="btn-submit-contact">
              <i class="fa fa-paper-plane mr-2"></i> Submit Enquiry
            </button>
            <div id="contact-feedback" style="display:none;margin-top:14px;padding:12px;border-radius:8px;font-size:13.5px;"></div>
          </form>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-col">
          <a href="/" class="brand-link mb-3">
            <img src="${s.logoUrl}" alt="${escapeHtml(s.websiteName)}" class="brand-logo-img">
          </a>
          <p style="color:var(--text-muted);font-size:13.5px;line-height:1.6;margin-top:14px;">
            ${escapeHtml(s.footerAbout)}
          </p>
        </div>

        <div class="footer-col">
          <h6>Solutions</h6>
          <ul class="footer-links">
            <li><a href="#solutions">LAPU Stock Exchange</a></li>
            <li><a href="#solutions">Multi-Operator Recharge</a></li>
            <li><a href="#calculator">Dynamic Margins</a></li>
            <li><a href="#solutions">Instant Dynamic UPI QR</a></li>
            <li><a href="#solutions">Traceable Audit Logs</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h6>Quick Links</h6>
          <ul class="footer-links">
            <li><a href="/admin/login">Partner Login</a></li>
            <li><a href="/admin/register">New Registration</a></li>
            <li><a href="/admin/forgot-password">Reset Password</a></li>
            <li><a href="#api">Developer API Hub</a></li>
            <li><a href="#contact">Support Helpdesk</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h6>Direct Contact</h6>
          <p style="color:var(--text-muted);font-size:13.5px;margin-bottom:6px;"><i class="fa fa-phone mr-1"></i> ${escapeHtml(s.supportPhone)}</p>
          <p style="color:var(--text-muted);font-size:13.5px;margin-bottom:6px;"><i class="fa fa-envelope mr-1"></i> ${escapeHtml(s.supportEmail)}</p>
          <p style="color:var(--text-muted);font-size:13.5px;margin-bottom:14px;"><i class="fa fa-clock-o mr-1"></i> ${escapeHtml(s.workingHours)}</p>
          <div class="d-flex gap-2">
            <a href="https://wa.me/${cleanWhatsapp}" target="_blank" class="btn-login" style="padding:6px 12px;font-size:12px;color:#25d366;border-color:rgba(37,211,102,0.4);">
              <i class="fa fa-whatsapp mr-1"></i> WhatsApp
            </a>
            ${s.socialTelegram ? `<a href="${escapeHtml(s.socialTelegram)}" target="_blank" class="btn-login" style="padding:6px 12px;font-size:12px;color:#38bdf8;border-color:rgba(56,189,248,0.4);"><i class="fa fa-telegram mr-1"></i> Telegram</a>` : ''}
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <div>&copy; ${new Date().getFullYear()} ${escapeHtml(s.websiteName)}. All Rights Reserved.</div>
        <div style="display:flex;gap:18px;">
          <span>🔒 256-Bit SSL Encrypted</span>
          <span>🛡️ Bank-Grade Security</span>
          <span>⚡ 99.99% Uptime SLA</span>
        </div>
      </div>
    </div>
  </footer>

  <!-- Floating WhatsApp Action Button -->
  <a href="https://wa.me/${cleanWhatsapp}?text=Hello%20${encodeURIComponent(s.websiteName)}%20Support,%20I%20need%20assistance." target="_blank" class="whatsapp-float-btn" title="Chat on WhatsApp">
    <i class="fa fa-whatsapp"></i>
  </a>

  <!-- Interactive JavaScript -->
  <script>
    // 1. 3D Card Interactive Tilt Effect on Hero Terminal
    (function init3dCard() {
      const card = document.getElementById('terminal3d');
      if (!card) return;
      const wrap = card.parentElement;

      wrap.addEventListener('mousemove', (e) => {
        const rect = wrap.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        const tiltX = (y / (rect.height / 2)) * -10;
        const tiltY = (x / (rect.width / 2)) * 12;
        card.style.transform = 'rotateX(' + tiltX + 'deg) rotateY(' + tiltY + 'deg) translateZ(10px)';
      });

      wrap.addEventListener('mouseleave', () => {
        card.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0)';
      });
    })();

    // 2. Interactive Margin Calculator
    (function initCalculator() {
      const opSelect = document.getElementById('calc-operator-select');
      const volRange = document.getElementById('calc-volume-range');
      const tierSelect = document.getElementById('calc-tier-select');
      const volDisplay = document.getElementById('calc-volume-display');
      const marginPctDisplay = document.getElementById('calc-margin-pct');
      const dailyEarnDisplay = document.getElementById('calc-daily-earn');
      const monthlyEarnDisplay = document.getElementById('calc-monthly-earn');
      const annualEarnDisplay = document.getElementById('calc-annual-earn');

      function calculate() {
        const margin = parseFloat(opSelect.value) || 4.2;
        const volume = parseFloat(volRange.value) || 50000;
        const tierMultiplier = parseFloat(tierSelect.value) || 1;

        volDisplay.textContent = '₹ ' + volume.toLocaleString('en-IN') + ' / Day';
        const effectiveMargin = (margin * tierMultiplier).toFixed(2);
        marginPctDisplay.textContent = effectiveMargin + '% Commission';

        const dailyProfit = Math.round((volume * (effectiveMargin / 100)));
        const monthlyProfit = dailyProfit * 30;
        const annualProfit = dailyProfit * 365;

        dailyEarnDisplay.textContent = '₹ ' + dailyProfit.toLocaleString('en-IN');
        monthlyEarnDisplay.textContent = '₹ ' + monthlyProfit.toLocaleString('en-IN');
        annualEarnDisplay.textContent = '₹ ' + annualProfit.toLocaleString('en-IN');
      }

      opSelect.addEventListener('change', calculate);
      volRange.addEventListener('input', calculate);
      tierSelect.addEventListener('change', calculate);
      calculate();
    })();

    // 3. Simulated Live Volume Counter Ticker
    (function initVolTicker() {
      const counter = document.getElementById('live-vol-counter');
      if (!counter) return;
      let base = 4892450;
      setInterval(() => {
        base += Math.floor(Math.random() * 850) + 150;
        counter.textContent = '₹' + base.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }, 3500);
    })();

    // 4. API Code Switcher
    const codeSnippets = {
      curl: \`# Perform a lightning-fast recharge via API
curl -X POST https://exchange.easyrechargesolution.com/api/buyer/recharge \\\\
  -H "Content-Type: application/json" \\\\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\\\
  -d '{
    "mobile": "9876543210",
    "operator": "AIRTEL",
    "amount": 299,
    "client_txn_id": "TXN_987654321"
  }'\`,
      node: \`// Node.js (Fetch or Axios)
const response = await fetch('https://exchange.easyrechargesolution.com/api/buyer/recharge', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_TOKEN'
  },
  body: JSON.stringify({
    mobile: '9876543210',
    operator: 'AIRTEL',
    amount: 299,
    client_txn_id: 'TXN_' + Date.now()
  })
});
const data = await response.json();
console.log(data); // { status: "SUCCESS", txn_id: "...", balance_after: ... }\`,
      python: \`# Python (requests)
import requests

payload = {
    "mobile": "9876543210",
    "operator": "AIRTEL",
    "amount": 299,
    "client_txn_id": "TXN_987654321"
}
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_TOKEN"
}

response = requests.post("https://exchange.easyrechargesolution.com/api/buyer/recharge", json=payload, headers=headers)
print(response.json())\`,
      php: \`<?php
// PHP cURL
$ch = curl_init("https://exchange.easyrechargesolution.com/api/buyer/recharge");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
  "Content-Type: application/json",
  "Authorization: Bearer YOUR_API_TOKEN"
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
  "mobile" => "9876543210",
  "operator" => "AIRTEL",
  "amount" => 299,
  "client_txn_id" => "TXN_" . time()
]));
$response = curl_exec($ch);
curl_close($ch);
echo $response;\`
    };

    function switchApiTab(lang) {
      document.querySelectorAll('.api-tab-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      const block = document.getElementById('api-code-block');
      if (block && codeSnippets[lang]) {
        block.textContent = codeSnippets[lang];
      }
    }

    // Copy Code Button
    document.getElementById('copy-code-btn').addEventListener('click', function() {
      const code = document.getElementById('api-code-block').textContent;
      navigator.clipboard.writeText(code).then(() => {
        this.innerHTML = '<i class="fa fa-check text-success"></i> Copied!';
        setTimeout(() => {
          this.innerHTML = '<i class="fa fa-copy"></i> Copy Code';
        }, 2000);
      });
    });

    // 5. Contact Form Submission
    document.getElementById('contact-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const btn = document.getElementById('btn-contact-submit');
      const feedback = document.getElementById('contact-feedback');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i> Submitting...';

      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-check mr-2"></i> Enquiry Received!';
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(16, 185, 129, 0.15)';
        feedback.style.border = '1px solid rgba(16, 185, 129, 0.4)';
        feedback.style.color = '#34d399';
        feedback.innerHTML = '<strong><i class="fa fa-check-circle"></i> Thank You!</strong> Your enquiry has been received. Our team will contact you shortly.';
        this.reset();
      }, 900);
    });
  </script>
</body>
</html>`;

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    });
    response.end(html);
  }

  return {
    sendFrontLandingPage,
    getWebsiteSettings,
  };
};
