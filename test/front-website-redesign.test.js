'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const createFrontLandingPage = require('../pages/front-landing-page');

describe('Front Website Redesign - Saffron & Navy Theme, Bold Fonts & Subpages', () => {

  it('Renders all 5 pages (Home, About Us, Contact Us, Terms & Condition, Login) with Saffron color palette', async () => {
    const fakeDb = {
      async query() {
        return {
          rows: [{
            website_name: 'Easy Recharge Solution',
            website_tagline: "India's Leading B2B Multi-Recharge Platform",
            support_phone: '+91 93358 19686',
            support_whatsapp: '+91 93358 19686',
            support_email: 'easyrechargesolution@gmail.com',
            office_address: 'Meerapur, Prayagraj',
            working_hours: '24x7 Customer Support',
            footer_about: 'Empowering telecom retailers across India',
            news_ticker: 'Welcome to Easy Recharge Solution',
            meta_title: 'Easy Recharge Solution | B2B Recharge & Stock Exchange',
            meta_description: 'Instant Mobile, DTH & Utility Recharge Platform',
          }],
          rowCount: 1,
        };
      },
    };

    const { sendFrontLandingPage } = createFrontLandingPage({
      db: fakeDb,
      sendJson: () => {},
    });

    let capturedHtml = '';
    const mockRes = {
      writeHead(status, headers) {
        assert.strictEqual(status, 200);
        assert.strictEqual(headers['content-type'], 'text/html; charset=utf-8');
      },
      end(html) {
        capturedHtml = html.toString('utf8');
      },
    };

    await sendFrontLandingPage({}, mockRes, 'home');

    // 1. Navigation items for all 5 pages
    assert.match(capturedHtml, /id="nav-home"/i, 'Must have Home nav item');
    assert.match(capturedHtml, /id="nav-about"/i, 'Must have About Us nav item');
    assert.match(capturedHtml, /id="nav-contact"/i, 'Must have Contact Us nav item');
    assert.match(capturedHtml, /id="nav-terms"/i, 'Must have Terms & Condition nav item');
    assert.match(capturedHtml, /href="\/user\/login"/i, 'Must have User Login button');

    // 2. View sections for all pages
    assert.match(capturedHtml, /id="view-home"/i, 'Must have Home view container');
    assert.match(capturedHtml, /id="view-about"/i, 'Must have About Us view container');
    assert.match(capturedHtml, /id="view-contact"/i, 'Must have Contact Us view container');
    assert.match(capturedHtml, /id="view-terms"/i, 'Must have Terms view container');

    // 3. Dynamic content from database
    assert.match(capturedHtml, /Easy Recharge Solution/i, 'Must render dynamic website name');
    assert.match(capturedHtml, /Leading B2B Multi-Recharge Platform/i, 'Must render dynamic tagline');
    assert.match(capturedHtml, /93358 19686/i, 'Must render dynamic support phone/whatsapp');
    assert.match(capturedHtml, /easyrechargesolution@gmail\.com/i, 'Must render dynamic support email');
    assert.match(capturedHtml, /Meerapur, Prayagraj/i, 'Must render dynamic address');
    assert.match(capturedHtml, /Welcome to Easy Recharge Solution/i, 'Must render dynamic news ticker');

    // 4. Saffron & Navy color palette & Bold typography
    assert.match(capturedHtml, /--saffron-main:\s*#FF6B00/i, 'Must have Saffron primary color variable');
    assert.match(capturedHtml, /--navy-dark:\s*#0B132B/i, 'Must have matching Navy dark color variable');
    assert.match(capturedHtml, /font-family:\s*'Outfit'/i, 'Must use bold Outfit font for headings');
    assert.match(capturedHtml, /font-family:\s*'Plus Jakarta Sans'/i, 'Must use Plus Jakarta Sans font');

    // 5. Interactive widgets
    assert.match(capturedHtml, /id="calcOperatorSelect"/i, 'Must have Margin Calculator operator select');
    assert.match(capturedHtml, /id="calcAmountInput"/i, 'Must have Margin Calculator amount input');
    assert.match(capturedHtml, /id="contactInquiryForm"/i, 'Must have Contact inquiry form');
  });

  it('Renders initial active view when subpath is visited directly (about, contact, terms)', async () => {
    const fakeDb = {
      async query() {
        return { rows: [{}], rowCount: 1 };
      },
    };

    const { sendFrontLandingPage } = createFrontLandingPage({
      db: fakeDb,
      sendJson: () => {},
    });

    // Test About initial view
    let aboutHtml = '';
    await sendFrontLandingPage({}, {
      writeHead() {},
      end(html) { aboutHtml = html.toString('utf8'); },
    }, 'about');
    assert.match(aboutHtml, /const initialPage = 'about';/i);

    // Test Contact initial view
    let contactHtml = '';
    await sendFrontLandingPage({}, {
      writeHead() {},
      end(html) { contactHtml = html.toString('utf8'); },
    }, 'contact');
    assert.match(contactHtml, /const initialPage = 'contact';/i);

    // Test Terms initial view
    let termsHtml = '';
    await sendFrontLandingPage({}, {
      writeHead() {},
      end(html) { termsHtml = html.toString('utf8'); },
    }, 'terms');
    assert.match(termsHtml, /const initialPage = 'terms';/i);
  });

});
