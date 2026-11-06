'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const createAdminStaticUi = require('../pages/admin-static-ui');

test('Login Side Banner: Eliminates blue box, prevents scroll down, and displays banner cleanly', async () => {
  const adminUiRoot = path.resolve(__dirname, '../ADMIN UI/HTML/zendash/HTML-LTR/Horizontal-Light');
  const adminAssetsRoot = path.resolve(__dirname, '../ADMIN UI/HTML/zendash/assets');

  const mockDb = {
    async query() {
      return {
        rowCount: 1,
        rows: [{
          has_side_image: true,
          login_side_image_enabled: true,
          has_popup: false,
          login_popup_enabled: false,
        }],
      };
    },
  };

  const { serveAdminUi } = createAdminStaticUi({
    fs,
    fsp,
    path,
    adminUiRoot,
    adminAssetsRoot,
    sendJson: () => {},
    db: mockDb,
  });

  let capturedHtml = '';
  const mockResponse = {
    writeHead() {},
    end(html) {
      capturedHtml = html ? html.toString('utf8') : '';
    },
  };

  const served = await serveAdminUi('/user/login', 'GET', mockResponse);
  assert.equal(served, true, 'Must serve user login page');

  // 1. Verify blue box overlay is eliminated
  assert.match(capturedHtml, /\.bg-style:before[\s\S]*display:\s*none\s*!important/i, 'Blue box overlay must be removed');
  assert.match(capturedHtml, /\.bg-style[\s\S]*background:\s*#f1f5f9\s*!important/i, 'Background must be clean neutral #f1f5f9');

  // 2. Verify scroll down is eliminated
  assert.match(capturedHtml, /html,\s*body\.custom-page1[\s\S]*overflow:\s*hidden\s*!important/i, 'Body must have overflow: hidden to prevent scroll down');
  assert.match(capturedHtml, /\.d-md-flex[\s\S]*height:\s*100vh\s*!important/i, 'Wrapper must have height: 100vh');

  // 3. Verify side banner image is displayed cleanly
  assert.match(capturedHtml, /class="login-side-banner-img"/i, 'Must have login-side-banner-img class');
  assert.match(capturedHtml, /src="\/api\/login-side-image"/i, 'Must load /api/login-side-image');
  assert.match(capturedHtml, /\.login-side-banner-img[\s\S]*object-fit:\s*contain\s*!important/i, 'Image must have object-fit: contain');
  assert.match(capturedHtml, /\.login-side-banner-img[\s\S]*max-height:\s*94vh\s*!important/i, 'Image must have max-height: 94vh');
});
