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
          supportPhone: r.support_phone || '+91 93358 19686',
          supportWhatsapp: r.support_whatsapp || '+91 93358 19686',
          supportEmail: r.support_email || 'easyrechargesolution@gmail.com',
          officeAddress: r.office_address || 'Meerapur, Prayagraj, Uttar Pradesh, India',
          workingHours: r.working_hours || '24x7 Customer & Stock Support',
          footerAbout: r.footer_about || 'Empowering telecom retailers and master distributors across India with lightning-fast multi-recharge services, automated LAPU stock swapping, and bank-grade APIs.',
          socialTelegram: r.social_telegram || '',
          metaTitle: r.meta_title || 'Easy Recharge Solution | B2B Recharge & Stock Exchange',
          metaDescription: r.meta_description || 'Instant Mobile, DTH, LAPU Stock Exchange & Utility Recharge API Platform with 99.99% uptime.',
          newsTicker: r.news_ticker || 'Welcome to Easy Recharge Solution - India\'s premier B2B multi-recharge trading platform.',
          newsTickerEnabled: r.news_ticker_enabled !== false,
          hasPopup: Boolean(r.login_popup_image_data || r.dashboard_popup_image_data),
          popupEnabled: Boolean((r.login_popup_image_data || r.dashboard_popup_image_data) && (r.login_popup_enabled === true || r.dashboard_popup_enabled === true || (r.login_popup_enabled !== false && r.dashboard_popup_enabled !== false))),
          popupLink: r.login_popup_link || r.dashboard_popup_link || '',
          popupSrc: r.login_popup_image_data ? '/api/login-popup-image' : '/api/dashboard-popup-image',
          popupUpdatedAt: r.updated_at ? String(r.updated_at) : String(Date.now()),
        };
      }
    } catch (_) {}
    return {
      websiteName: 'Easy Recharge Solution',
      websiteTagline: "India's Leading B2B Multi-Recharge & LAPU Stock Exchange Platform",
      logoUrl: '/api/logo',
      faviconUrl: '/api/favicon',
      supportPhone: '+91 93358 19686',
      supportWhatsapp: '+91 93358 19686',
      supportEmail: 'easyrechargesolution@gmail.com',
      officeAddress: 'Meerapur, Prayagraj, Uttar Pradesh, India',
      workingHours: '24x7 Customer & Stock Support',
      footerAbout: 'Empowering telecom retailers and master distributors across India with lightning-fast multi-recharge services, automated LAPU stock swapping, and bank-grade APIs.',
      socialTelegram: '',
      metaTitle: 'Easy Recharge Solution | B2B Recharge & Stock Exchange',
      metaDescription: 'Instant Mobile, DTH, LAPU Stock Exchange & Utility Recharge API Platform with 99.99% uptime.',
      newsTicker: 'Welcome to Easy Recharge Solution - India\'s premier B2B multi-recharge trading platform.',
      newsTickerEnabled: true,
      hasPopup: false,
      popupEnabled: false,
      popupLink: '',
      popupSrc: '/api/login-popup-image',
      popupUpdatedAt: String(Date.now()),
    };
  }

  /**
   * Render HTML Front Landing Page with Saffron & Navy Theme, Bold Fonts & Dynamic Subpages
   * @param {object} request
   * @param {object} response
   * @param {'home'|'about'|'contact'|'terms'} [initialPage='home']
   */
  async function sendFrontLandingPage(request, response, initialPage = 'home') {
    const s = await getWebsiteSettings();
    const cleanWhatsapp = s.supportWhatsapp.replace(/\D/g, '');
    const cleanPhone = s.supportPhone.replace(/\D/g, '');

    const validInitial = ['home', 'about', 'contact', 'terms'].includes(initialPage) ? initialPage : 'home';

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(s.metaTitle)}</title>
  <meta name="description" content="${escapeHtml(s.metaDescription)}">
  <link rel="icon" type="image/x-icon" href="/api/favicon">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root {
      /* Royal Indian Saffron & Matching Navy Palette */
      --saffron-main: #FF6B00;
      --saffron-dark: #E65100;
      --saffron-light: #FF8533;
      --saffron-subtle: #FFF4EC;
      --saffron-glow: rgba(255, 107, 0, 0.25);
      
      --navy-dark: #0B132B;
      --navy-card: #111A38;
      --navy-surface: #17224D;
      --navy-light: #202D63;
      
      --text-heading: #0F172A;
      --text-body: #475569;
      --text-muted: #64748B;
      --text-light: #F8FAFC;
      
      --bg-page: #FFFBF7;
      --bg-white: #FFFFFF;
      --border-light: rgba(255, 107, 0, 0.14);
      --border-card: #F1E5D8;
      
      --gold-accent: #F59E0B;
      --green-accent: #10B981;
      
      --shadow-soft: 0 10px 30px -10px rgba(255, 107, 0, 0.12), 0 4px 12px rgba(15, 23, 42, 0.04);
      --shadow-hover: 0 20px 40px -12px rgba(255, 107, 0, 0.22), 0 8px 24px rgba(15, 23, 42, 0.08);
      --radius-sm: 8px;
      --radius-md: 14px;
      --radius-lg: 22px;
      --radius-pill: 9999px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-page);
      color: var(--text-body);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-x: hidden;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: 'Outfit', 'Plus Jakarta Sans', sans-serif;
      color: var(--text-heading);
      font-weight: 800;
      letter-spacing: -0.025em;
      line-height: 1.25;
    }

    a {
      text-decoration: none;
      color: inherit;
      transition: all 0.25s ease;
    }

    /* Top Running News & Support Bar */
    .topbar {
      background: linear-gradient(90deg, #E65100 0%, #FF6B00 50%, #FF8533 100%);
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 0;
      position: relative;
      z-index: 1001;
      box-shadow: 0 2px 8px rgba(230, 81, 0, 0.25);
    }
    .topbar-container {
      max-width: 1300px;
      margin: 0 auto;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 15px;
    }
    .topbar-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      overflow: hidden;
    }
    .topbar-badge {
      background: rgba(255, 255, 255, 0.25);
      backdrop-filter: blur(4px);
      padding: 3px 10px;
      border-radius: var(--radius-pill);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .topbar-ticker {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 20px;
      white-space: nowrap;
    }
    .topbar-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #FFFFFF;
      opacity: 0.95;
    }
    .topbar-link:hover {
      opacity: 1;
      text-decoration: underline;
    }

    /* Main Navigation Header */
    .navbar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--border-light);
      padding: 14px 0;
      transition: all 0.3s ease;
    }
    .navbar.scrolled {
      padding: 10px 0;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
    }
    .nav-container {
      max-width: 1300px;
      margin: 0 auto;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .nav-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 900;
      font-size: 20px;
      color: var(--navy-dark);
      letter-spacing: -0.02em;
    }
    .nav-logo-img {
      height: 42px;
      max-width: 160px;
      object-fit: contain;
      border-radius: 6px;
    }
    .nav-logo-badge {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, var(--saffron-main), var(--saffron-dark));
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFFFFF;
      font-size: 20px;
      box-shadow: 0 4px 12px var(--saffron-glow);
    }
    .nav-brand-text {
      display: flex;
      flex-direction: column;
    }
    .nav-brand-title {
      font-weight: 900;
      font-size: 21px;
      color: var(--navy-dark);
      line-height: 1.1;
    }
    .nav-brand-sub {
      font-size: 11px;
      font-weight: 700;
      color: var(--saffron-main);
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    /* Nav Links (Tabs) */
    .nav-menu {
      display: flex;
      align-items: center;
      gap: 8px;
      list-style: none;
    }
    .nav-item {
      position: relative;
    }
    .nav-link {
      padding: 8px 18px;
      font-size: 14.5px;
      font-weight: 700;
      color: var(--navy-dark);
      border-radius: var(--radius-pill);
      transition: all 0.25s ease;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    .nav-link:hover {
      color: var(--saffron-main);
      background-color: var(--saffron-subtle);
    }
    .nav-link.active {
      background: linear-gradient(135deg, var(--saffron-main), var(--saffron-dark));
      color: #FFFFFF;
      box-shadow: 0 4px 16px var(--saffron-glow);
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      font-size: 14.5px;
      font-weight: 800;
      border-radius: var(--radius-pill);
      padding: 10px 24px;
      cursor: pointer;
      border: none;
      outline: none;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      letter-spacing: -0.01em;
      white-space: nowrap;
    }
    .btn-saffron {
      background: linear-gradient(135deg, #FF6B00 0%, #E65100 100%);
      color: #FFFFFF;
      box-shadow: 0 6px 20px rgba(255, 107, 0, 0.32);
    }
    .btn-saffron:hover {
      background: linear-gradient(135deg, #FF7D1A 0%, #F55900 100%);
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(255, 107, 0, 0.42);
      color: #FFFFFF;
    }
    .btn-navy {
      background: var(--navy-dark);
      color: #FFFFFF;
      box-shadow: 0 6px 20px rgba(11, 19, 43, 0.2);
    }
    .btn-navy:hover {
      background: #17224D;
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(11, 19, 43, 0.3);
      color: #FFFFFF;
    }
    .btn-outline-saffron {
      background: transparent;
      color: var(--saffron-main);
      border: 2px solid var(--saffron-main);
    }
    .btn-outline-saffron:hover {
      background: var(--saffron-main);
      color: #FFFFFF;
      transform: translateY(-2px);
    }
    .btn-sm {
      padding: 8px 18px;
      font-size: 13.5px;
    }
    .btn-lg {
      padding: 14px 34px;
      font-size: 16px;
    }

    /* Mobile Hamburger */
    .mobile-toggle {
      display: none;
      background: none;
      border: none;
      font-size: 22px;
      color: var(--navy-dark);
      cursor: pointer;
      padding: 6px;
    }

    /* Main Container & View Sections */
    .main-wrapper {
      min-height: 80vh;
    }
    .page-view {
      display: none;
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 0.35s ease, transform 0.35s ease;
    }
    .page-view.active-view {
      display: block;
      opacity: 1;
      transform: translateY(0);
    }

    /* ========================================================
       HOME PAGE STYLES
       ======================================================== */
    .hero-section {
      position: relative;
      padding: 60px 0 80px;
      background: radial-gradient(circle at 85% 15%, rgba(255, 107, 0, 0.12) 0%, transparent 60%),
                  radial-gradient(circle at 10% 80%, rgba(245, 158, 11, 0.08) 0%, transparent 50%),
                  #FFFBF7;
      overflow: hidden;
    }
    .hero-container {
      max-width: 1300px;
      margin: 0 auto;
      padding: 0 20px;
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 50px;
      align-items: center;
    }
    .hero-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #FFF0E5;
      border: 1px solid rgba(255, 107, 0, 0.3);
      color: var(--saffron-dark);
      padding: 7px 18px;
      border-radius: var(--radius-pill);
      font-size: 12.5px;
      font-weight: 800;
      letter-spacing: 0.4px;
      margin-bottom: 22px;
      box-shadow: 0 2px 10px rgba(255, 107, 0, 0.08);
    }
    .hero-title {
      font-size: 50px;
      font-weight: 900;
      color: var(--navy-dark);
      line-height: 1.12;
      margin-bottom: 20px;
    }
    .hero-title-highlight {
      background: linear-gradient(135deg, #FF6B00 20%, #D9480F 80%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: inline-block;
    }
    .hero-desc {
      font-size: 18px;
      color: var(--text-body);
      margin-bottom: 34px;
      font-weight: 500;
      line-height: 1.65;
      max-width: 580px;
    }
    .hero-cta-group {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-bottom: 40px;
    }
    .hero-badges-row {
      display: flex;
      flex-wrap: wrap;
      gap: 25px;
      border-top: 1px solid var(--border-light);
      padding-top: 25px;
    }
    .hero-badge-item {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .hero-badge-icon {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #FFF0E5;
      color: var(--saffron-main);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
    }
    .hero-badge-val {
      font-weight: 800;
      color: var(--navy-dark);
      font-size: 15px;
      line-height: 1.1;
    }
    .hero-badge-label {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 600;
    }

    /* Hero Live Exchange Card */
    .hero-card {
      background: var(--navy-dark);
      border-radius: var(--radius-lg);
      padding: 30px;
      color: #FFFFFF;
      box-shadow: 0 25px 60px -15px rgba(11, 19, 43, 0.4), 0 0 0 1px rgba(255, 107, 0, 0.2);
      position: relative;
    }
    .hero-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 18px;
      margin-bottom: 20px;
    }
    .hero-card-title {
      font-size: 17px;
      font-weight: 800;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .live-dot {
      width: 9px;
      height: 9px;
      background-color: #10B981;
      border-radius: 50%;
      box-shadow: 0 0 10px #10B981;
      animation: pulseGreen 2s infinite;
    }
    @keyframes pulseGreen {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
    }
    .live-feed-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .live-feed-item {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: var(--radius-md);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.25s ease;
    }
    .live-feed-item:hover {
      background: rgba(255, 107, 0, 0.1);
      border-color: rgba(255, 107, 0, 0.3);
      transform: translateX(4px);
    }
    .feed-op-logo {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: var(--navy-surface);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 13px;
      color: #FFFFFF;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .feed-details {
      flex: 1;
      margin: 0 14px;
    }
    .feed-title {
      font-weight: 800;
      font-size: 14px;
      color: #FFFFFF;
    }
    .feed-sub {
      font-size: 11.5px;
      color: #94A3B8;
      font-weight: 600;
    }
    .feed-right {
      text-align: right;
    }
    .feed-amt {
      font-weight: 900;
      font-size: 16px;
      color: #F8FAFC;
    }
    .feed-margin-badge {
      display: inline-block;
      background: rgba(16, 185, 129, 0.2);
      color: #34D399;
      font-size: 11px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: var(--radius-pill);
    }

    /* Section Utilities */
    .section-py {
      padding: 80px 0;
    }
    .section-container {
      max-width: 1300px;
      margin: 0 auto;
      padding: 0 20px;
    }
    .section-header {
      text-align: center;
      max-width: 720px;
      margin: 0 auto 55px;
    }
    .section-tag {
      display: inline-block;
      color: var(--saffron-dark);
      background: #FFF0E5;
      border: 1px solid rgba(255, 107, 0, 0.25);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      padding: 5px 16px;
      border-radius: var(--radius-pill);
      margin-bottom: 14px;
    }
    .section-title {
      font-size: 38px;
      font-weight: 900;
      color: var(--navy-dark);
      margin-bottom: 14px;
    }
    .section-desc {
      font-size: 16.5px;
      color: var(--text-muted);
      font-weight: 500;
    }

    /* Features Grid */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 28px;
    }
    .feature-card {
      background: #FFFFFF;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-lg);
      padding: 34px 28px;
      box-shadow: var(--shadow-soft);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }
    .feature-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 4px;
      background: linear-gradient(90deg, var(--saffron-main), var(--saffron-dark));
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .feature-card:hover {
      transform: translateY(-6px);
      box-shadow: var(--shadow-hover);
      border-color: rgba(255, 107, 0, 0.3);
    }
    .feature-card:hover::before {
      opacity: 1;
    }
    .feature-icon-box {
      width: 58px;
      height: 58px;
      border-radius: 16px;
      background: #FFF4EC;
      color: var(--saffron-main);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      margin-bottom: 22px;
      transition: all 0.3s ease;
    }
    .feature-card:hover .feature-icon-box {
      background: var(--saffron-main);
      color: #FFFFFF;
      transform: scale(1.05);
    }
    .feature-card-title {
      font-size: 21px;
      font-weight: 800;
      margin-bottom: 12px;
      color: var(--navy-dark);
    }
    .feature-card-desc {
      font-size: 15px;
      color: var(--text-body);
      line-height: 1.6;
    }

    /* Operators & Stock Grid */
    .operators-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 16px;
      margin-top: 20px;
    }
    .op-card {
      background: #FFFFFF;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-md);
      padding: 20px 14px;
      text-align: center;
      box-shadow: var(--shadow-soft);
      transition: all 0.25s ease;
    }
    .op-card:hover {
      border-color: var(--saffron-main);
      transform: translateY(-4px);
      box-shadow: var(--shadow-hover);
    }
    .op-icon-pill {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      margin: 0 auto 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 900;
      color: #FFFFFF;
    }
    .op-name {
      font-weight: 800;
      font-size: 14.5px;
      color: var(--navy-dark);
      margin-bottom: 4px;
    }
    .op-margin {
      font-size: 12px;
      font-weight: 800;
      color: var(--saffron-main);
      background: #FFF4EC;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      display: inline-block;
    }

    /* Live Calculator Section */
    .calc-box {
      background: #FFFFFF;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-lg);
      padding: 40px;
      box-shadow: var(--shadow-soft);
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      align-items: center;
    }
    .calc-input-group {
      margin-bottom: 20px;
    }
    .calc-label {
      font-weight: 700;
      font-size: 14px;
      color: var(--navy-dark);
      margin-bottom: 8px;
      display: block;
    }
    .calc-select, .calc-input {
      width: 100%;
      padding: 12px 16px;
      font-size: 15px;
      font-weight: 600;
      border: 1px solid #CBD5E1;
      border-radius: var(--radius-sm);
      outline: none;
      font-family: inherit;
      transition: all 0.2s ease;
    }
    .calc-select:focus, .calc-input:focus {
      border-color: var(--saffron-main);
      box-shadow: 0 0 0 3px var(--saffron-glow);
    }
    .calc-result-box {
      background: linear-gradient(135deg, var(--navy-dark) 0%, #17224D 100%);
      border-radius: var(--radius-md);
      padding: 34px;
      color: #FFFFFF;
      text-align: center;
      box-shadow: 0 15px 35px rgba(11, 19, 43, 0.25);
    }
    .calc-result-val {
      font-size: 42px;
      font-weight: 900;
      color: #FFB366;
      margin: 10px 0;
      font-family: 'Outfit', sans-serif;
    }
    .calc-result-sub {
      font-size: 13.5px;
      color: #CBD5E1;
      font-weight: 500;
    }

    /* Developer API Box */
    .api-preview-card {
      background: #0B132B;
      border: 1px solid rgba(255, 107, 0, 0.25);
      border-radius: var(--radius-lg);
      padding: 30px;
      color: #E2E8F0;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13.5px;
      overflow-x: auto;
      box-shadow: 0 20px 40px rgba(11, 19, 43, 0.4);
    }
    .api-endpoint-badge {
      display: inline-block;
      background: var(--saffron-main);
      color: #FFFFFF;
      font-weight: 800;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 6px;
      margin-right: 10px;
    }

    /* CTA Banner */
    .cta-banner {
      background: linear-gradient(135deg, #0B132B 0%, #17224D 100%);
      border-radius: var(--radius-lg);
      padding: 60px 40px;
      text-align: center;
      color: #FFFFFF;
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(255, 107, 0, 0.25);
      box-shadow: var(--shadow-hover);
    }
    .cta-title {
      font-size: 36px;
      font-weight: 900;
      color: #FFFFFF;
      margin-bottom: 15px;
    }
    .cta-desc {
      font-size: 17px;
      color: #CBD5E1;
      max-width: 600px;
      margin: 0 auto 30px;
    }

    /* ========================================================
       ABOUT US PAGE STYLES
       ======================================================== */
    .page-hero {
      background: linear-gradient(135deg, var(--navy-dark) 0%, #17224D 100%);
      color: #FFFFFF;
      padding: 70px 0 60px;
      text-align: center;
      position: relative;
      border-bottom: 3px solid var(--saffron-main);
    }
    .page-hero-title {
      font-size: 44px;
      font-weight: 900;
      color: #FFFFFF;
      margin-bottom: 12px;
    }
    .page-hero-sub {
      font-size: 18px;
      color: #FFB366;
      max-width: 650px;
      margin: 0 auto;
      font-weight: 600;
    }

    .about-story-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 50px;
      align-items: center;
      margin-bottom: 60px;
    }
    .about-lead-title {
      font-size: 32px;
      font-weight: 900;
      color: var(--navy-dark);
      margin-bottom: 18px;
    }
    .about-paragraph {
      font-size: 16px;
      color: var(--text-body);
      margin-bottom: 16px;
      line-height: 1.7;
    }
    .about-stats-container {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin: 40px 0;
    }
    .about-stat-card {
      background: #FFFFFF;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-md);
      padding: 24px;
      text-align: center;
      box-shadow: var(--shadow-soft);
    }
    .about-stat-num {
      font-size: 36px;
      font-weight: 900;
      color: var(--saffron-main);
      font-family: 'Outfit', sans-serif;
    }
    .about-stat-label {
      font-weight: 700;
      font-size: 13.5px;
      color: var(--navy-dark);
    }

    /* ========================================================
       CONTACT US PAGE STYLES
       ======================================================== */
    .contact-grid {
      display: grid;
      grid-template-columns: 1fr 1.25fr;
      gap: 40px;
      margin-top: 30px;
    }
    .contact-info-card {
      background: #FFFFFF;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-lg);
      padding: 36px 30px;
      box-shadow: var(--shadow-soft);
    }
    .contact-item {
      display: flex;
      align-items: flex-start;
      gap: 18px;
      margin-bottom: 26px;
    }
    .contact-item:last-child {
      margin-bottom: 0;
    }
    .contact-icon-box {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: #FFF4EC;
      color: var(--saffron-main);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .contact-item-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }
    .contact-item-value {
      font-size: 16.5px;
      font-weight: 800;
      color: var(--navy-dark);
      word-break: break-word;
    }

    .contact-form-card {
      background: #FFFFFF;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-lg);
      padding: 40px;
      box-shadow: var(--shadow-soft);
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-label {
      font-weight: 700;
      font-size: 14px;
      color: var(--navy-dark);
      margin-bottom: 8px;
      display: block;
    }
    .form-control {
      width: 100%;
      padding: 12px 16px;
      font-size: 15px;
      font-weight: 600;
      border: 1px solid #CBD5E1;
      border-radius: var(--radius-sm);
      outline: none;
      font-family: inherit;
      transition: all 0.25s ease;
    }
    .form-control:focus {
      border-color: var(--saffron-main);
      box-shadow: 0 0 0 3px var(--saffron-glow);
    }
    textarea.form-control {
      resize: vertical;
      min-height: 110px;
    }

    /* ========================================================
       TERMS & CONDITIONS PAGE STYLES
       ======================================================== */
    .terms-card {
      background: #FFFFFF;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-lg);
      padding: 44px 40px;
      box-shadow: var(--shadow-soft);
      max-width: 1000px;
      margin: 0 auto;
    }
    .terms-section {
      margin-bottom: 36px;
    }
    .terms-section:last-child {
      margin-bottom: 0;
    }
    .terms-section-title {
      font-size: 20px;
      font-weight: 800;
      color: var(--navy-dark);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .terms-section-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #FFF4EC;
      color: var(--saffron-main);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 900;
    }
    .terms-text {
      font-size: 15px;
      color: var(--text-body);
      line-height: 1.7;
    }
    .terms-list {
      margin-top: 10px;
      padding-left: 20px;
    }
    .terms-list li {
      margin-bottom: 8px;
      font-size: 14.5px;
      color: var(--text-body);
    }

    /* ========================================================
       FOOTER STYLES
       ======================================================== */
    .footer {
      background: var(--navy-dark);
      color: #94A3B8;
      padding: 70px 0 30px;
      border-top: 4px solid var(--saffron-main);
    }
    .footer-container {
      max-width: 1300px;
      margin: 0 auto;
      padding: 0 20px;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr 1.2fr;
      gap: 40px;
      margin-bottom: 50px;
    }
    .footer-brand {
      color: #FFFFFF;
      font-weight: 900;
      font-size: 22px;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
    }
    .footer-desc {
      font-size: 14.5px;
      line-height: 1.65;
      margin-bottom: 20px;
      color: #CBD5E1;
    }
    .footer-title {
      color: #FFFFFF;
      font-size: 16px;
      font-weight: 800;
      margin-bottom: 20px;
      position: relative;
      padding-bottom: 8px;
    }
    .footer-title::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 32px;
      height: 3px;
      background: var(--saffron-main);
      border-radius: var(--radius-pill);
    }
    .footer-links {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .footer-link-item {
      font-size: 14px;
      color: #CBD5E1;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }
    .footer-link-item:hover {
      color: var(--saffron-light);
      transform: translateX(4px);
    }
    .footer-bottom {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 25px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13.5px;
      color: #94A3B8;
    }

    /* Popup Notice Modal */
    .home-modal-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(11, 19, 43, 0.75);
      backdrop-filter: blur(8px);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .home-modal-content {
      background: #FFFFFF;
      border-radius: var(--radius-lg);
      max-width: 620px;
      width: 100%;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.4);
      position: relative;
      overflow: hidden;
      animation: modalZoom 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      border: 3px solid var(--saffron-main);
    }
    @keyframes modalZoom {
      from { transform: scale(0.92); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .home-modal-close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.75);
      color: #FFFFFF;
      border: none;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      transition: background 0.2s ease;
    }
    .home-modal-close:hover {
      background: var(--saffron-main);
    }
    .home-modal-img {
      width: 100%;
      height: auto;
      display: block;
      max-height: 75vh;
      object-fit: contain;
    }

    /* Responsive Queries */
    @media (max-width: 992px) {
      .hero-container, .calc-box, .about-story-grid, .contact-grid {
        grid-template-columns: 1fr;
        gap: 35px;
      }
      .features-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .operators-grid {
        grid-template-columns: repeat(3, 1fr);
      }
      .footer-grid {
        grid-template-columns: 1fr 1fr;
      }
      .nav-menu {
        display: none;
      }
      .nav-menu.mobile-open {
        display: flex;
        flex-direction: column;
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        background: #FFFFFF;
        padding: 20px;
        box-shadow: 0 15px 30px rgba(0,0,0,0.1);
        border-bottom: 2px solid var(--saffron-main);
      }
      .nav-link {
        width: 100%;
        padding: 12px 18px;
      }
      .mobile-toggle {
        display: block;
      }
      .hero-title {
        font-size: 38px;
      }
      .topbar-right {
        display: none;
      }
    }

    @media (max-width: 640px) {
      .features-grid, .about-stats-container, .footer-grid {
        grid-template-columns: 1fr;
      }
      .operators-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .hero-title {
        font-size: 30px;
      }
      .hero-desc {
        font-size: 15px;
      }
      .btn-lg {
        padding: 12px 24px;
        font-size: 14.5px;
      }
      .footer-bottom {
        flex-direction: column;
        gap: 12px;
        text-align: center;
      }
      .calc-box, .contact-form-card, .terms-card {
        padding: 24px 18px;
      }
    }
  </style>
</head>
<body>

  <!-- Top Bar: Live News Ticker & Customer Support -->
  <div class="topbar">
    <div class="topbar-container">
      <div class="topbar-left">
        <span class="topbar-badge"><i class="fa fa-bullhorn"></i> Live News</span>
        <div class="topbar-ticker">${escapeHtml(s.newsTicker)}</div>
      </div>
      <div class="topbar-right">
        <a href="tel:${escapeHtml(cleanPhone)}" class="topbar-link">
          <i class="fa fa-phone"></i> ${escapeHtml(s.supportPhone)}
        </a>
        <a href="https://wa.me/${escapeHtml(cleanWhatsapp)}" target="_blank" rel="noopener" class="topbar-link">
          <i class="fa-brands fa-whatsapp"></i> WhatsApp
        </a>
        <span class="topbar-link"><i class="fa fa-clock-o"></i> ${escapeHtml(s.workingHours)}</span>
      </div>
    </div>
  </div>

  <!-- Main Navigation Header -->
  <header class="navbar" id="mainNavbar">
    <div class="nav-container">
      <a href="/" class="nav-brand" onclick="navigatePage('home', event)">
        <img src="/api/logo" alt="${escapeHtml(s.websiteName)}" class="nav-logo-img" onerror="this.style.display='none'; document.getElementById('logoFallbackBadge').style.display='flex';">
        <div class="nav-logo-badge" id="logoFallbackBadge" style="display:none;"><i class="fa fa-bolt"></i></div>
        <div class="nav-brand-text">
          <span class="nav-brand-title">${escapeHtml(s.websiteName)}</span>
          <span class="nav-brand-sub">Recharge Exchange</span>
        </div>
      </a>

      <!-- Desktop Navigation Menu Tabs -->
      <ul class="nav-menu" id="navMenu">
        <li class="nav-item">
          <a class="nav-link" id="nav-home" onclick="navigatePage('home', event)">
            <i class="fa fa-home"></i> Home
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" id="nav-about" onclick="navigatePage('about', event)">
            <i class="fa fa-info-circle"></i> About Us
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" id="nav-contact" onclick="navigatePage('contact', event)">
            <i class="fa fa-envelope"></i> Contact Us
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" id="nav-terms" onclick="navigatePage('terms', event)">
            <i class="fa fa-shield"></i> Terms & Condition
          </a>
        </li>
      </ul>

      <!-- Action Buttons -->
      <div class="nav-actions">
        <a href="/user/login" class="btn btn-saffron btn-sm">
          <i class="fa fa-user"></i> Login <i class="fa fa-arrow-right"></i>
        </a>
        <button class="mobile-toggle" id="mobileToggle" onclick="toggleMobileMenu()" aria-label="Toggle Menu">
          <i class="fa fa-bars"></i>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Page Views Container -->
  <main class="main-wrapper">

    <!-- ========================================================
         VIEW 1: HOME PAGE
         ======================================================== -->
    <div id="view-home" class="page-view">
      
      <!-- Hero Section -->
      <section class="hero-section">
        <div class="hero-container">
          <div class="hero-left">
            <div class="hero-pill">
              <i class="fa fa-bolt text-saffron"></i> INDIA'S PREMIER B2B LAPU RECHARGE EXCHANGE
            </div>
            <h1 class="hero-title">
              Next-Gen Multi-Recharge & <br>
              <span class="hero-title-highlight">Automated LAPU Exchange</span>
            </h1>
            <p class="hero-desc">
              ${escapeHtml(s.websiteTagline)}. Experience bank-grade waterfall routing, 99.99% uptime, dual wallet isolation, and lightning-fast recharge execution.
            </p>
            <div class="hero-cta-group">
              <a href="/user/login" class="btn btn-saffron btn-lg">
                <i class="fa fa-arrow-circle-right"></i> Open User Portal
              </a>
              <a href="https://wa.me/${escapeHtml(cleanWhatsapp)}?text=Hello%2C%20I%20am%20interested%20in%20joining%20${encodeURIComponent(s.websiteName)}" target="_blank" rel="noopener" class="btn btn-outline-saffron btn-lg">
                <i class="fa-brands fa-whatsapp"></i> Chat on WhatsApp
              </a>
            </div>
            <div class="hero-badges-row">
              <div class="hero-badge-item">
                <div class="hero-badge-icon"><i class="fa fa-shield"></i></div>
                <div>
                  <div class="hero-badge-val">99.99% Uptime</div>
                  <div class="hero-badge-label">Carrier SLA Guaranteed</div>
                </div>
              </div>
              <div class="hero-badge-item">
                <div class="hero-badge-icon"><i class="fa fa-tachometer"></i></div>
                <div>
                  <div class="hero-badge-val">&lt; 1.2 Sec</div>
                  <div class="hero-badge-label">Recharge Settlement</div>
                </div>
              </div>
              <div class="hero-badge-item">
                <div class="hero-badge-icon"><i class="fa fa-wallet"></i></div>
                <div>
                  <div class="hero-badge-val">Dual Wallet</div>
                  <div class="hero-badge-label">Separate Buyer / Seller</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Hero Right: Live Exchange Simulator Card -->
          <div class="hero-right">
            <div class="hero-card">
              <div class="hero-card-header">
                <span class="hero-card-title"><i class="fa fa-exchange-alt"></i> Live Stock Exchange Stream</span>
                <span style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #34D399; font-weight: 800;">
                  <span class="live-dot"></span> LIVE AUTO-WATERFALL
                </span>
              </div>
              <div class="live-feed-list">
                <div class="live-feed-item">
                  <div class="feed-op-logo" style="background:#EF4444;">AT</div>
                  <div class="feed-details">
                    <div class="feed-title">Airtel Prepaid - UP East</div>
                    <div class="feed-sub">Routed to Top Seller (Waterfall Step 1)</div>
                  </div>
                  <div class="feed-right">
                    <div class="feed-amt">₹299</div>
                    <span class="feed-margin-badge">+4.2% Margin</span>
                  </div>
                </div>
                <div class="live-feed-item">
                  <div class="feed-op-logo" style="background:#2563EB;">JIO</div>
                  <div class="feed-details">
                    <div class="feed-title">Jio 5G Unlimited - Delhi NCR</div>
                    <div class="feed-sub">LAPU Balance Pre-Debited & Delivered</div>
                  </div>
                  <div class="feed-right">
                    <div class="feed-amt">₹666</div>
                    <span class="feed-margin-badge">+3.9% Margin</span>
                  </div>
                </div>
                <div class="live-feed-item">
                  <div class="feed-op-logo" style="background:#D97706;">VI</div>
                  <div class="feed-details">
                    <div class="feed-title">Vi Hero Unlimited - Maharashtra</div>
                    <div class="feed-sub">Auto Fallback Matchmaker Activated</div>
                  </div>
                  <div class="feed-right">
                    <div class="feed-amt">₹479</div>
                    <span class="feed-margin-badge">+4.8% Margin</span>
                  </div>
                </div>
                <div class="live-feed-item">
                  <div class="feed-op-logo" style="background:#059669;">DTH</div>
                  <div class="feed-details">
                    <div class="feed-title">Tata Play Ultra Pack</div>
                    <div class="feed-sub">Instant Heavy Refresh Confirmed</div>
                  </div>
                  <div class="feed-right">
                    <div class="feed-amt">₹1,200</div>
                    <span class="feed-margin-badge">+4.0% Margin</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Supported Operators & Coverage Section -->
      <section class="section-py" style="background:#FFFFFF; border-top: 1px solid var(--border-card); border-bottom: 1px solid var(--border-card);">
        <div class="section-container">
          <div class="section-header">
            <span class="section-tag">All India Coverage</span>
            <h2 class="section-title">Supported Telecom & Utility Networks</h2>
            <p class="section-desc">Real-time connectivity to every major cellular operator, DTH provider, and bill payment services across all 23 telecom circles.</p>
          </div>
          <div class="operators-grid">
            <div class="op-card">
              <div class="op-icon-pill" style="background:#E11D48;"><i class="fa fa-mobile-alt"></i></div>
              <div class="op-name">Airtel</div>
              <div class="op-margin">Up to 4.2%</div>
            </div>
            <div class="op-card">
              <div class="op-icon-pill" style="background:#2563EB;"><i class="fa fa-wifi"></i></div>
              <div class="op-name">Jio Telecom</div>
              <div class="op-margin">Up to 4.0%</div>
            </div>
            <div class="op-card">
              <div class="op-icon-pill" style="background:#EA580C;"><i class="fa fa-signal"></i></div>
              <div class="op-name">Vi (Vodafone Idea)</div>
              <div class="op-margin">Up to 4.8%</div>
            </div>
            <div class="op-card">
              <div class="op-icon-pill" style="background:#16A34A;"><i class="fa fa-broadcast-tower"></i></div>
              <div class="op-name">BSNL Prepaid</div>
              <div class="op-margin">Up to 5.5%</div>
            </div>
            <div class="op-card">
              <div class="op-icon-pill" style="background:#7C3AED;"><i class="fa fa-tv"></i></div>
              <div class="op-name">Tata Play DTH</div>
              <div class="op-margin">Up to 4.1%</div>
            </div>
            <div class="op-card">
              <div class="op-icon-pill" style="background:#D97706;"><i class="fa fa-satellite-dish"></i></div>
              <div class="op-name">Dish TV / D2H</div>
              <div class="op-margin">Up to 4.5%</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Core Features Grid -->
      <section class="section-py">
        <div class="section-container">
          <div class="section-header">
            <span class="section-tag">Enterprise Architecture</span>
            <h2 class="section-title">Engineered for Telecom Leadership</h2>
            <p class="section-desc">Purpose-built trading platform designed specifically for Master Distributors, Sellers with high LAPU limits, and API Buyers.</p>
          </div>
          <div class="features-grid">
            <div class="feature-card">
              <div class="feature-icon-box"><i class="fa fa-chart-line"></i></div>
              <h3 class="feature-card-title">Dynamic Market Margin</h3>
              <p class="feature-card-desc">Sellers set competitive margins in real-time. Buyers automatically get matched to the highest-margin seller available in the circle.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon-box"><i class="fa fa-layer-group"></i></div>
              <h3 class="feature-card-title">Waterfall Auto-Fallback</h3>
              <p class="feature-card-desc">Never drop a customer's transaction. If the primary seller is slow or out of stock, the engine falls back to alternative sellers in milliseconds.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon-box"><i class="fa fa-wallet"></i></div>
              <h3 class="feature-card-title">Dual Wallet Isolation</h3>
              <p class="feature-card-desc">Separate Buyer and Seller Wallets. Keep recharge purchasing funds cleanly isolated from sales earnings with automatic dispute lien safety.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon-box"><i class="fa fa-code"></i></div>
              <h3 class="feature-card-title">Developer-First APIs</h3>
              <p class="feature-card-desc">Ultra-fast JSON REST APIs for recharge and balance inquiries with instant webhook delivery and cryptographic HMAC authentication.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon-box"><i class="fa fa-receipt"></i></div>
              <h3 class="feature-card-title">Auto SMS & UTR Topup</h3>
              <p class="feature-card-desc">Instant fund addition with automated Bank SMS parsing and UTR matching. Zero waiting time for balance credits.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon-box"><i class="fa fa-lock"></i></div>
              <h3 class="feature-card-title">Bank-Grade Protection</h3>
              <p class="feature-card-desc">Row-Level Security on PostgreSQL, Argon2id password encryption, AES-256 mobile data encryption, and IP-whitelisting.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Interactive Margin Calculator -->
      <section class="section-py" style="background:#FFFFFF; border-top:1px solid var(--border-card); border-bottom:1px solid var(--border-card);">
        <div class="section-container">
          <div class="section-header">
            <span class="section-tag">Calculate Profitability</span>
            <h2 class="section-title">Live Earnings & Margin Calculator</h2>
            <p class="section-desc">Estimate your instant retail commission based on recharge volume and competitive exchange margins.</p>
          </div>
          <div class="calc-box">
            <div class="calc-left">
              <div class="calc-input-group">
                <label class="calc-label" for="calcOperatorSelect">Select Telecom Operator</label>
                <select class="calc-select" id="calcOperatorSelect" onchange="calculateMargin()">
                  <option value="4.2">Airtel Prepaid (Avg. 4.2%)</option>
                  <option value="4.0" selected>Jio Telecom (Avg. 4.0%)</option>
                  <option value="4.8">Vi Vodafone Idea (Avg. 4.8%)</option>
                  <option value="5.5">BSNL Mobile (Avg. 5.5%)</option>
                  <option value="4.1">Tata Play DTH (Avg. 4.1%)</option>
                  <option value="4.5">Dish TV / D2H (Avg. 4.5%)</option>
                </select>
              </div>
              <div class="calc-input-group">
                <label class="calc-label" for="calcAmountInput">Daily Recharge Turnover (₹)</label>
                <input type="number" class="calc-input" id="calcAmountInput" value="50000" min="500" step="500" oninput="calculateMargin()">
              </div>
              <div style="font-size:13px; color:var(--text-muted); font-weight:600;">
                <i class="fa fa-info-circle text-saffron"></i> Margins are automatically credited to your wallet in real-time per transaction.
              </div>
            </div>
            <div class="calc-result-box">
              <div class="calc-result-sub">Estimated Monthly Gross Earnings</div>
              <div class="calc-result-val" id="calcMonthlyResult">₹60,000</div>
              <div class="calc-result-sub" id="calcDailySub">Daily Commission: ₹2,000.00 @ 4.0%</div>
              <div style="margin-top:24px;">
                <a href="/user/login" class="btn btn-saffron btn-sm">Start Earning Today</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Developer API Preview -->
      <section class="section-py">
        <div class="section-container">
          <div class="section-header">
            <span class="section-tag">5-Minute Integration</span>
            <h2 class="section-title">Developer REST API Suite</h2>
            <p class="section-desc">Integrate our high-speed recharge endpoints into your mobile application, ERP, or portal effortlessly.</p>
          </div>
          <div class="api-preview-card">
            <div style="margin-bottom:12px; color:#94A3B8; font-size:12px; font-weight:700;">
              <span class="api-endpoint-badge">POST</span> /webservices/api/recharge
            </div>
            <pre style="color:#A7F3D0; font-family:monospace; line-height:1.5;">{
  "api_token": "YOUR_BUYER_SECRET_TOKEN",
  "number": "9876543210",
  "amount": "299",
  "operator": "AIRTEL",
  "circle": "UP East",
  "ref_id": "ORDER_20261109_001"
}</pre>
            <div style="margin: 16px 0 10px; color:#FDE047; font-size:12px; font-weight:700;">// Instant JSON Response (&lt;1.2s):</div>
            <pre style="color:#FBCFE8; font-family:monospace; line-height:1.5;">{
  "status": "SUCCESS",
  "txnid": "TXN179422001928A4BC",
  "ref_id": "ORDER_20261109_001",
  "operator_ref": "AIRTEL10928374",
  "margin": "12.55",
  "closing_balance": "48750.25"
}</pre>
          </div>
        </div>
      </section>

      <!-- Bottom Call To Action Banner -->
      <section class="section-py" style="padding-top:0;">
        <div class="section-container">
          <div class="cta-banner">
            <h2 class="cta-title">Ready to Elevate Your Telecom Business?</h2>
            <p class="cta-desc">Join hundreds of retail partners, distributors, and API sellers. Create an account today and experience unmatched margins and reliability.</p>
            <a href="/user/login" class="btn btn-saffron btn-lg">
              <i class="fa fa-user-plus"></i> Register / Login to Portal
            </a>
          </div>
        </div>
      </section>
    </div>

    <!-- ========================================================
         VIEW 2: ABOUT US PAGE
         ======================================================== -->
    <div id="view-about" class="page-view">
      <div class="page-hero">
        <div class="section-container">
          <h1 class="page-hero-title">About ${escapeHtml(s.websiteName)}</h1>
          <p class="page-hero-sub">Pioneering transparent, automated, and secure B2B telecom liquidity across India.</p>
        </div>
      </div>

      <section class="section-py">
        <div class="section-container">
          <div class="about-story-grid">
            <div>
              <span class="section-tag">Our Vision & Mission</span>
              <h2 class="about-lead-title">Transforming Telecom Liquidity & Retail Reach</h2>
              <p class="about-paragraph">
                Founded with a mission to eliminate manual stock delays and margin discrepancies in India's fast-moving telecom ecosystem, <strong>${escapeHtml(s.websiteName)}</strong> provides an institutional-grade marketplace connecting retailers, master distributors, and LAPU holders.
              </p>
              <p class="about-paragraph">
                ${escapeHtml(s.footerAbout)}
              </p>
              <p class="about-paragraph">
                Our automated algorithm continuously queries and cascades recharge traffic across registered sellers to guarantee the highest commission to buyers and seamless stock exhaustion to sellers.
              </p>
            </div>
            <div>
              <div class="hero-card" style="background:#FFFFFF; color:var(--text-body); border:1px solid var(--border-card);">
                <h3 style="color:var(--navy-dark); font-size:22px; margin-bottom:15px;"><i class="fa fa-bullseye text-saffron"></i> Our Core Pillars</h3>
                <div style="display:flex; flex-direction:column; gap:16px;">
                  <div style="display:flex; gap:12px; align-items:flex-start;">
                    <div style="background:#FFF4EC; color:var(--saffron-main); width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="fa fa-check"></i></div>
                    <div>
                      <strong style="color:var(--navy-dark); display:block;">100% Real-Time Settlement</strong>
                      <span style="font-size:14px; color:var(--text-muted);">Instant balance debits, margin credits, and automated holding releases.</span>
                    </div>
                  </div>
                  <div style="display:flex; gap:12px; align-items:flex-start;">
                    <div style="background:#FFF4EC; color:var(--saffron-main); width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="fa fa-check"></i></div>
                    <div>
                      <strong style="color:var(--navy-dark); display:block;">Dispute & Lien Security</strong>
                      <span style="font-size:14px; color:var(--text-muted);">Protected trading with auto-liens to safeguard transactions and eliminate bad debt.</span>
                    </div>
                  </div>
                  <div style="display:flex; gap:12px; align-items:flex-start;">
                    <div style="background:#FFF4EC; color:var(--saffron-main); width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="fa fa-check"></i></div>
                    <div>
                      <strong style="color:var(--navy-dark); display:block;">Certified Telecom Carrier SLA</strong>
                      <span style="font-size:14px; color:var(--text-muted);">Direct connectivity with 99.99% system availability round the clock.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="about-stats-container">
            <div class="about-stat-card">
              <div class="about-stat-num">10,000+</div>
              <div class="about-stat-label">Active Retail Partners</div>
            </div>
            <div class="about-stat-card">
              <div class="about-stat-num">&lt; 1.2s</div>
              <div class="about-stat-label">Fast Execution Speed</div>
            </div>
            <div class="about-stat-card">
              <div class="about-stat-num">99.99%</div>
              <div class="about-stat-label">Guaranteed Availability</div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ========================================================
         VIEW 3: CONTACT US PAGE
         ======================================================== -->
    <div id="view-contact" class="page-view">
      <div class="page-hero">
        <div class="section-container">
          <h1 class="page-hero-title">Contact & Help Support</h1>
          <p class="page-hero-sub">We are available 24x7 to assist your telecom business, integrations, and queries.</p>
        </div>
      </div>

      <section class="section-py">
        <div class="section-container">
          <div class="contact-grid">
            
            <!-- Left Info Cards -->
            <div class="contact-info-card">
              <h3 style="font-size:22px; color:var(--navy-dark); margin-bottom:24px;">Direct Helpdesk Channels</h3>
              
              <div class="contact-item">
                <div class="contact-icon-box"><i class="fa fa-phone"></i></div>
                <div>
                  <div class="contact-item-title">Telephone Customer Support</div>
                  <a href="tel:${escapeHtml(cleanPhone)}" class="contact-item-value">${escapeHtml(s.supportPhone)}</a>
                </div>
              </div>

              <div class="contact-item">
                <div class="contact-icon-box" style="background:#DCFCE7; color:#15803D;"><i class="fa-brands fa-whatsapp"></i></div>
                <div>
                  <div class="contact-item-title">WhatsApp Priority Desk</div>
                  <a href="https://wa.me/${escapeHtml(cleanWhatsapp)}" target="_blank" rel="noopener" class="contact-item-value">${escapeHtml(s.supportWhatsapp)}</a>
                </div>
              </div>

              <div class="contact-item">
                <div class="contact-icon-box"><i class="fa fa-envelope"></i></div>
                <div>
                  <div class="contact-item-title">Official Email Helpdesk</div>
                  <a href="mailto:${escapeHtml(s.supportEmail)}" class="contact-item-value">${escapeHtml(s.supportEmail)}</a>
                </div>
              </div>

              <div class="contact-item">
                <div class="contact-icon-box"><i class="fa fa-map-marker-alt"></i></div>
                <div>
                  <div class="contact-item-title">Registered Corporate Address</div>
                  <div class="contact-item-value">${escapeHtml(s.officeAddress)}</div>
                </div>
              </div>

              <div class="contact-item">
                <div class="contact-icon-box"><i class="fa fa-clock"></i></div>
                <div>
                  <div class="contact-item-title">Operating Hours</div>
                  <div class="contact-item-value">${escapeHtml(s.workingHours)}</div>
                </div>
              </div>
            </div>

            <!-- Right: Interactive Message Form -->
            <div class="contact-form-card">
              <h3 style="font-size:22px; color:var(--navy-dark); margin-bottom:10px;">Send Us a Message</h3>
              <p style="font-size:14px; color:var(--text-muted); margin-bottom:24px;">Fill in your details below and our operations desk will get back to you immediately.</p>
              
              <form id="contactInquiryForm" onsubmit="handleContactSubmit(event)">
                <div class="form-group">
                  <label class="form-label" for="contactName">Your Full Name / Business Name *</label>
                  <input type="text" class="form-control" id="contactName" required placeholder="e.g. Ramesh Kumar (Easy Recharge)">
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                  <div class="form-group">
                    <label class="form-label" for="contactMobile">Mobile Number *</label>
                    <input type="tel" class="form-control" id="contactMobile" required placeholder="e.g. 9876543210" maxlength="10">
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="contactEmail">Email Address</label>
                    <input type="email" class="form-control" id="contactEmail" placeholder="e.g. retailer@gmail.com">
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label" for="contactSubject">Inquiry Topic</label>
                  <select class="form-control" id="contactSubject">
                    <option value="General Retailer Inquiry">New Retailer Registration</option>
                    <option value="Seller LAPU Integration">Seller / LAPU Integration</option>
                    <option value="API Webhooks & Integration">API Webhooks & Integration</option>
                    <option value="Wallet Topup & Settlement">Wallet Topup & Settlement</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label" for="contactMessage">Message / Questions *</label>
                  <textarea class="form-control" id="contactMessage" required placeholder="Tell us how we can help your telecom operations..."></textarea>
                </div>

                <button type="submit" class="btn btn-saffron btn-lg" style="width:100%;">
                  <i class="fa fa-paper-plane"></i> Send Inquiry via WhatsApp
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ========================================================
         VIEW 4: TERMS & CONDITIONS PAGE
         ======================================================== -->
    <div id="view-terms" class="page-view">
      <div class="page-hero">
        <div class="section-container">
          <h1 class="page-hero-title">Terms & Conditions</h1>
          <p class="page-hero-sub">Service Level Agreement, Platform Guidelines, and Wallet Policies.</p>
        </div>
      </div>

      <section class="section-py">
        <div class="section-container">
          <div class="terms-card">
            
            <div class="terms-section">
              <h3 class="terms-section-title"><span class="terms-section-num">1</span> Acceptance of Service Terms</h3>
              <p class="terms-text">
                By registering, accessing, or transacting on <strong>${escapeHtml(s.websiteName)}</strong> ("Platform"), you acknowledge that you have read, understood, and agreed to be bound by these Terms and Conditions. These terms constitute a legally binding agreement between you ("User", "Retailer", "Buyer", "Seller") and ${escapeHtml(s.websiteName)}.
              </p>
            </div>

            <div class="terms-section">
              <h3 class="terms-section-title"><span class="terms-section-num">2</span> Account Eligibility & KYC Verification</h3>
              <p class="terms-text">
                To access recharge services, LAPU selling features, and payout facilities, users must complete Know-Your-Customer (KYC) verification by submitting genuine identity documentation, including Aadhaar Card, PAN Card, and active Indian Bank Account details. Providing falsified information will result in immediate suspension.
              </p>
            </div>

            <div class="terms-section">
              <h3 class="terms-section-title"><span class="terms-section-num">3</span> Dual Wallet Operations & Balance Debits</h3>
              <p class="terms-text">
                The Platform operates using segregated Buyer and Seller balance accounting:
              </p>
              <ul class="terms-list">
                <li><strong>Buyer Wallet:</strong> Exclusively utilized for funding incoming recharges and API purchases. Funds are pre-debited under row-level database locks prior to provider dispatch.</li>
                <li><strong>Seller Wallet:</strong> Dedicated to accumulating earnings from fulfilled recharge orders and LAPU liquidity.</li>
                <li><strong>Exchange Delay & Holding:</strong> Seller earnings are subject to admin-configured holding durations to ensure customer dispute resolution and reconciliation.</li>
              </ul>
            </div>

            <div class="terms-section">
              <h3 class="terms-section-title"><span class="terms-section-num">4</span> Automated Waterfall Routing & SLAs</h3>
              <p class="terms-text">
                The Platform provides best-effort automated transaction matching. In the event of seller timeout, operator unavailability, or balance exhaustion, transactions will cascade automatically through secondary eligible sellers. Recharges that cannot be fulfilled across any seller are refunded to the Buyer Wallet instantly.
              </p>
            </div>

            <div class="terms-section">
              <h3 class="terms-section-title"><span class="terms-section-num">5</span> Dispute Resolution & Active Liens</h3>
              <p class="terms-text">
                Recharges marked as successful by upstream carrier APIs may be subject to customer disputes within 24 hours. When a dispute is logged, a dispute lien multiplier is automatically held against the responsible seller's balance until administrative verification.
              </p>
            </div>

            <div class="terms-section">
              <h3 class="terms-section-title"><span class="terms-section-num">6</span> Developer API Usage & Rate Limits</h3>
              <p class="terms-text">
                API buyers agree to respect established burst and sustained rate limits. Automated scripts executing denial-of-service patterns, brute-force requests, or unapproved crawling will have their API keys revoked without prior notice.
              </p>
            </div>

            <div class="terms-section">
              <h3 class="terms-section-title"><span class="terms-section-num">7</span> Jurisdiction & Governing Law</h3>
              <p class="terms-text">
                These terms are governed in accordance with the laws of India. Any disputes arising out of the use of the platform shall be subject to the exclusive jurisdiction of the competent courts in Prayagraj, Uttar Pradesh.
              </p>
            </div>

          </div>
        </div>
      </section>
    </div>

  </main>

  <!-- Global Footer -->
  <footer class="footer">
    <div class="footer-container">
      <div class="footer-grid">
        <div>
          <div class="footer-brand">
            <span style="color:var(--saffron-main);"><i class="fa fa-bolt"></i></span> ${escapeHtml(s.websiteName)}
          </div>
          <p class="footer-desc">${escapeHtml(s.footerAbout)}</p>
          <div style="display:inline-flex; align-items:center; gap:8px; background:rgba(255,107,0,0.15); border:1px solid rgba(255,107,0,0.3); padding:6px 14px; border-radius:var(--radius-pill); font-size:12px; color:#FFB366; font-weight:700;">
            <i class="fa fa-shield"></i> Bank-Grade TLS & RLS Secured
          </div>
        </div>

        <div>
          <h4 class="footer-title">Navigation</h4>
          <ul class="footer-links">
            <li><a class="footer-link-item" onclick="navigatePage('home', event)"><i class="fa fa-angle-right"></i> Home</a></li>
            <li><a class="footer-link-item" onclick="navigatePage('about', event)"><i class="fa fa-angle-right"></i> About Us</a></li>
            <li><a class="footer-link-item" onclick="navigatePage('contact', event)"><i class="fa fa-angle-right"></i> Contact Us</a></li>
            <li><a class="footer-link-item" onclick="navigatePage('terms', event)"><i class="fa fa-angle-right"></i> Terms & Condition</a></li>
            <li><a href="/user/login" class="footer-link-item"><i class="fa fa-angle-right"></i> User Login</a></li>
          </ul>
        </div>

        <div>
          <h4 class="footer-title">B2B Solutions</h4>
          <ul class="footer-links">
            <li class="footer-link-item"><i class="fa fa-check text-saffron"></i> Multi-Recharge API</li>
            <li class="footer-link-item"><i class="fa fa-check text-saffron"></i> LAPU Stock Swapping</li>
            <li class="footer-link-item"><i class="fa fa-check text-saffron"></i> Dual Wallet Accounting</li>
            <li class="footer-link-item"><i class="fa fa-check text-saffron"></i> Real-time Ledger</li>
            <li class="footer-link-item"><i class="fa fa-check text-saffron"></i> Auto SMS Reconciliation</li>
          </ul>
        </div>

        <div>
          <h4 class="footer-title">Contact Office</h4>
          <p style="font-size:14px; line-height:1.6; margin-bottom:12px; color:#CBD5E1;">
            <i class="fa fa-map-marker-alt text-saffron"></i> ${escapeHtml(s.officeAddress)}
          </p>
          <p style="font-size:14px; margin-bottom:8px; color:#CBD5E1;">
            <i class="fa fa-phone text-saffron"></i> <a href="tel:${escapeHtml(cleanPhone)}" style="color:#FFF;">${escapeHtml(s.supportPhone)}</a>
          </p>
          <p style="font-size:14px; margin-bottom:8px; color:#CBD5E1;">
            <i class="fa fa-envelope text-saffron"></i> <a href="mailto:${escapeHtml(s.supportEmail)}" style="color:#FFF;">${escapeHtml(s.supportEmail)}</a>
          </p>
          <p style="font-size:13px; color:#94A3B8; margin-top:10px;">
            <i class="fa fa-clock text-saffron"></i> ${escapeHtml(s.workingHours)}
          </p>
        </div>
      </div>

      <div class="footer-bottom">
        <div>&copy; 2026 ${escapeHtml(s.websiteName)}. All Rights Reserved.</div>
        <div>Engineered with pride in India for Telecom Entrepreneurs.</div>
      </div>
    </div>
  </footer>

  ${s.hasPopup && s.popupEnabled ? `
  <!-- Homepage Notice Modal (Preserved for Admin Popup Banner) -->
  <div id="homeNoticeModal" class="home-modal-backdrop">
    <div class="home-modal-content">
      <button type="button" id="closeHomeNoticeModal" class="home-modal-close" aria-label="Close Notice">&times;</button>
      ${s.popupLink ? `<a href="${escapeHtml(s.popupLink)}" target="_blank" rel="noopener">` : ''}
        <img src="${escapeHtml(s.popupSrc)}?v=${encodeURIComponent(s.popupUpdatedAt)}" alt="Notice" class="home-modal-img" id="homeNoticeImg" onerror="document.getElementById('homeNoticeModal').style.display='none';">
      ${s.popupLink ? `</a>` : ''}
    </div>
  </div>
  ` : ''}

  <!-- Client Script for Smooth Page Routing, Margin Calculator & Notice Modal -->
  <script>
    (function() {
      // 1. Initial Page View Setup
      const initialPage = '${validInitial}';
      
      function showView(pageName) {
        const pages = ['home', 'about', 'contact', 'terms'];
        const target = pages.includes(pageName) ? pageName : 'home';
        
        pages.forEach(p => {
          const el = document.getElementById('view-' + p);
          const navEl = document.getElementById('nav-' + p);
          if (el) {
            if (p === target) {
              el.classList.add('active-view');
            } else {
              el.classList.remove('active-view');
            }
          }
          if (navEl) {
            if (p === target) {
              navEl.classList.add('active');
            } else {
              navEl.classList.remove('active');
            }
          }
        });

        // Close mobile menu if open
        const navMenu = document.getElementById('navMenu');
        if (navMenu) navMenu.classList.remove('mobile-open');

        // Scroll smoothly to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      window.navigatePage = function(pageName, event) {
        if (event) event.preventDefault();
        showView(pageName);
        const path = pageName === 'home' ? '/' : '/' + pageName;
        window.history.pushState({ page: pageName }, '', path);
      };

      window.addEventListener('popstate', function(e) {
        if (e.state && e.state.page) {
          showView(e.state.page);
        } else {
          // Check pathname
          const p = window.location.pathname.replace('/', '') || 'home';
          showView(p);
        }
      });

      // Detect URL pathname on load
      const currentPath = window.location.pathname.replace('/', '').toLowerCase();
      if (['about', 'about-us'].includes(currentPath)) {
        showView('about');
      } else if (['contact', 'contact-us'].includes(currentPath)) {
        showView('contact');
      } else if (['terms', 'terms-and-conditions'].includes(currentPath)) {
        showView('terms');
      } else {
        showView(initialPage);
      }

      // 2. Mobile Menu Toggle
      window.toggleMobileMenu = function() {
        const m = document.getElementById('navMenu');
        if (m) m.classList.toggle('mobile-open');
      };

      // 3. Margin Calculator Logic
      window.calculateMargin = function() {
        const opSelect = document.getElementById('calcOperatorSelect');
        const amtInput = document.getElementById('calcAmountInput');
        const monthlyEl = document.getElementById('calcMonthlyResult');
        const dailySubEl = document.getElementById('calcDailySub');
        
        if (!opSelect || !amtInput || !monthlyEl) return;
        
        const rate = parseFloat(opSelect.value) || 4.0;
        const dailyTurnover = parseFloat(amtInput.value) || 0;
        
        const dailyCommission = (dailyTurnover * rate) / 100;
        const monthlyCommission = dailyCommission * 30;

        monthlyEl.textContent = '₹' + Math.round(monthlyCommission).toLocaleString('en-IN');
        if (dailySubEl) {
          dailySubEl.textContent = 'Daily Commission: ₹' + dailyCommission.toFixed(2) + ' @ ' + rate.toFixed(1) + '%';
        }
      };

      // 4. Contact Us WhatsApp Forwarding
      window.handleContactSubmit = function(e) {
        e.preventDefault();
        const name = document.getElementById('contactName')?.value || '';
        const mobile = document.getElementById('contactMobile')?.value || '';
        const email = document.getElementById('contactEmail')?.value || '';
        const subject = document.getElementById('contactSubject')?.value || 'General Inquiry';
        const msg = document.getElementById('contactMessage')?.value || '';

        const text = 'Hello ${escapeHtml(s.websiteName)},\n\n' +
                     '*Inquiry From Website*\n' +
                     '• *Name:* ' + name + '\n' +
                     '• *Mobile:* ' + mobile + '\n' +
                     (email ? '• *Email:* ' + email + '\n' : '') +
                     '• *Topic:* ' + subject + '\n' +
                     '• *Message:* ' + msg;

        const waUrl = 'https://wa.me/${escapeHtml(cleanWhatsapp)}?text=' + encodeURIComponent(text);
        window.open(waUrl, '_blank');
      };

      // 5. Sticky Navbar Shadow
      window.addEventListener('scroll', function() {
        const nb = document.getElementById('mainNavbar');
        if (!nb) return;
        if (window.scrollY > 20) {
          nb.classList.add('scrolled');
        } else {
          nb.classList.remove('scrolled');
        }
      });

      // 6. Homepage Notice Popup Logic
      const modal = document.getElementById('homeNoticeModal');
      const closeBtn = document.getElementById('closeHomeNoticeModal');
      if (modal && closeBtn) {
        const popupKey = 'popup_shown_${escapeHtml(s.popupUpdatedAt)}';
        const alreadyShown = sessionStorage.getItem(popupKey);
        if (!alreadyShown) {
          setTimeout(() => {
            modal.style.display = 'flex';
            sessionStorage.setItem(popupKey, 'true');
          }, 600);
        }
        closeBtn.addEventListener('click', () => {
          modal.style.display = 'none';
        });
        modal.addEventListener('click', (ev) => {
          if (ev.target === modal) modal.style.display = 'none';
        });
      }
    })();
  </script>
</body>
</html>`;

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=30',
      'x-content-type-options': 'nosniff',
    });
    response.end(html);
  }

  return {
    sendFrontLandingPage,
    getWebsiteSettings,
  };
};
