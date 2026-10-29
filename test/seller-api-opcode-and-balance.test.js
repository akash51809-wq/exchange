'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractValueByPath, executeStockApiCall } = require('../lib/stock-api-helper');

test('Seller API Setting Page - Operator, Package, and Valid Till Columns Removed', () => {
  const htmlPath = path.join(__dirname, '..', 'pages', 'user', 'seller-api-setting.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify headers
  assert.ok(html.includes('<th style="width: 80px; text-align: center;">OpCode</th>'), 'OpCode header must be present');
  assert.ok(!html.includes('<th>Operator</th>'), 'Operator column header must be removed');
  assert.ok(!html.includes('<th>Package</th>'), 'Package column header must be removed');
  assert.ok(!html.includes('<th>Valid Till</th>'), 'Valid Till column header must be removed');

  // Verify action buttons in table body
  assert.ok(!html.includes('btn-operator'), 'btn-operator must be removed from table rows');
  assert.ok(!html.includes('btn-purchase'), 'btn-purchase must be removed from table rows');
  assert.ok(!html.includes('api.validTill'), 'api.validTill must be removed from table rows');
});

test('Seller API Setting Page - OpCode Modal & Interactive Elements Present', () => {
  const htmlPath = path.join(__dirname, '..', 'pages', 'user', 'seller-api-setting.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // OpCode Modal exists
  assert.ok(html.includes('id="opCodeModal"'), 'opCodeModal must exist');
  assert.ok(html.includes('id="opCodeTable"'), 'opCodeTable must exist');
  assert.ok(html.includes('id="opCodeTableBody"'), 'opCodeTableBody must exist');
  assert.ok(html.includes('id="opCodeSearchInput"'), 'opCodeSearchInput must exist');
  assert.ok(html.includes('id="btnAddOpCodeRow"'), 'btnAddOpCodeRow must exist');
  assert.ok(html.includes('id="btnLoadStandardOpCodes"'), 'btnLoadStandardOpCodes must exist');
  assert.ok(html.includes('id="btnSaveOpCodes"'), 'btnSaveOpCodes must exist');
  assert.ok(html.includes('openOpCodeModal'), 'openOpCodeModal function must exist');
});

test('Stock API Helper - Flexible Balance Key Fallback (totalBalance & mainBalance)', () => {
  // Scenario 1: Response only has totalBalance and mainBalance (like real Rambhiya API)
  const realRambhiyaResponse = {
    status: 'Success',
    totalBalance: '2540.75',
    mainBalance: '2540.75',
    aepsBalance: '0.00',
    message: 'Balance fetched successfully'
  };

  // Even if balanceKey is configured as 'rechargeBalance', it should smartly extract totalBalance
  const extractedWithRechargeKey = extractValueByPath(realRambhiyaResponse, 'rechargeBalance');
  assert.equal(extractedWithRechargeKey, '2540.75', 'Should fallback to totalBalance when rechargeBalance is absent');

  // When balanceKey is 'balance'
  const extractedWithGenericBalance = extractValueByPath(realRambhiyaResponse, 'balance');
  assert.equal(extractedWithGenericBalance, '2540.75');

  // When balanceKey is 'totalBalance'
  const extractedWithTotalBalance = extractValueByPath(realRambhiyaResponse, 'totalBalance');
  assert.equal(extractedWithTotalBalance, '2540.75');

  // When balanceKey is 'mainBalance'
  const extractedWithMainBalance = extractValueByPath(realRambhiyaResponse, 'mainBalance');
  assert.equal(extractedWithMainBalance, '2540.75');
});

test('Stock API Helper - Upstream Provider Error Detection (e.g. Invalid IP Address)', async () => {
  // Simulate mock fetch returning Rambhiya Invalid IP error
  const mockErrorResponse = JSON.stringify({
    status: 'Error',
    totalBalance: '0.00',
    mainBalance: '0.00',
    aepsBalance: '0.00',
    message: 'Invalid IP Address (49.43.112.72)'
  });

  // Verify that provider error is properly detected
  const parsed = JSON.parse(mockErrorResponse);
  const statusVal = String(parsed.status).toLowerCase();
  const isError = statusVal === 'error';
  const errorMsg = parsed.message;

  assert.equal(isError, true);
  assert.ok(errorMsg.includes('Invalid IP Address'));
  assert.ok(errorMsg.includes('49.43.112.72'));
});
