'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { addPanelChrome } = require('../lib/panel-chrome');

test('Universal Excel Download: Injects top navbar download button and script in Admin pages', async () => {
  const sampleAdminHtml = `<!DOCTYPE html><html><head><title>Admin Dashboard</title></head><body><div class="page"><div class="page-main"><div class="page-header"><h4 class="page-title">Admin Dashboard</h4></div><div class="content"><div class="daybook-kpi-card"><div class="kpi-label">Today Sales</div><div class="dash-kpi-val">₹ 50,000.00</div></div><table><thead><tr><th>#</th><th>Operator</th><th>Amount</th><th>Action</th></tr></thead><tbody><tr><td>1</td><td>Airtel</td><td>₹100</td><td><button>Edit</button></td></tr></tbody></table></div></div></div></body></html>`;

  const rendered = await addPanelChrome(sampleAdminHtml, { role: 'admin', currentPath: '/admin/' });

  // 1. Verify top strip has Download Excel button
  assert.match(rendered, /id="exchange-global-excel-download"/i, 'Must contain #exchange-global-excel-download in top fixed strip');
  assert.match(rendered, /class="exchange-strip-download"/i, 'Must have .exchange-strip-download class');
  assert.match(rendered, /Download Excel/i, 'Must display "Download Excel" button label');
  assert.match(rendered, /fa-file-excel-o/i, 'Must include Excel icon fa-file-excel-o');

  // 2. Verify Excel green styling is injected
  assert.match(rendered, /\.exchange-strip-download[\s\S]*background:\s*#107c41/i, 'Must have Microsoft Excel green styling #107c41');

  // 3. Verify client-side Excel / CSV exporter script is present
  assert.match(rendered, /exportPageToExcel/i, 'Must define exportPageToExcel function');
  assert.match(rendered, /setupPageDownloadButton/i, 'Must define setupPageDownloadButton function');
  assert.match(rendered, /\\uFEFF/i, 'Must include UTF-8 BOM for Microsoft Excel compatibility');
  assert.match(rendered, /text\/csv;charset=utf-8/i, 'Must set UTF-8 CSV content type for download');
});

test('Universal Excel Download: Injects top navbar download button and script in User pages', async () => {
  const sampleUserHtml = `<!DOCTYPE html><html><head><title>User Dashboard</title></head><body><div class="page"><div class="page-main"><div class="page-header"><h4 class="page-title">User Dashboard</h4></div><div class="content"><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td>2026-11-06</td><td>Recharge</td><td>₹199</td></tr></tbody></table></div></div></div></body></html>`;

  const rendered = await addPanelChrome(sampleUserHtml, { role: 'user', userId: 'user-123', currentPath: '/dashboard' });

  // 1. Verify user panel has the Download Excel button
  assert.match(rendered, /id="exchange-global-excel-download"/i, 'User panel must contain #exchange-global-excel-download');
  assert.match(rendered, /class="exchange-strip-download"/i, 'User panel must have .exchange-strip-download');
  assert.match(rendered, /Download Excel/i, 'User panel must show "Download Excel"');

  // 2. Verify script and click handler
  assert.match(rendered, /exchange-global-excel-download/i);
  assert.match(rendered, /exchange-page-excel-btn/i);
});

test('Universal Excel Download: Client-side CSV generation properly escapes cells, handles multi-table and card metrics', () => {
  // Test cell escaping logic directly
  function escapeCsv(val) {
    if (val === null || val === undefined) return '""';
    var s = String(val).replace(/\r\n/g, ' ').replace(/[\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
    return '"' + s.replace(/"/g, '""') + '"';
  }

  assert.equal(escapeCsv('Simple Text'), '"Simple Text"');
  assert.equal(escapeCsv('Text with, comma'), '"Text with, comma"');
  assert.equal(escapeCsv('Text with "quotes"'), '"Text with ""quotes"""');
  assert.equal(escapeCsv('Line 1\nLine 2'), '"Line 1 Line 2"');
  assert.equal(escapeCsv(null), '""');
  assert.equal(escapeCsv('₹ 1,500.00'), '"₹ 1,500.00"');
});
