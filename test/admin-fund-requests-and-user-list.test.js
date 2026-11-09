'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createAdminFundRequestsPage = require('../pages/admin-fund-requests');
const createAdminUserListPage = require('../pages/admin-user-list');

test('Admin Fund Requests Page - Renders KPI Summary Cards, colored badges, and filter tabs', async () => {
  const mockDb = {
    async query(sql) {
      return {
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            amount_minor: '500000', // ₹5,000.00
            bank_code: 'HDFC',
            payment_mode: 'UPI',
            wallet_type: 'buyer',
            proof_mime: 'image/jpeg',
            source_account_ciphertext: 'enc_acc',
            transaction_id_ciphertext: 'enc_tx',
            status: 'pending',
            review_note: null,
            created_at: new Date().toISOString(),
            bank_account_id: '22222222-2222-2222-2222-222222222222',
            username: 'buyer01',
            name: 'Buyer One',
            bank_display: 'HDFC Bank',
            deposit_account_num: '1234567890',
          },
          {
            id: '33333333-3333-3333-3333-333333333333',
            amount_minor: '1000000', // ₹10,000.00
            bank_code: 'ICICI',
            payment_mode: 'IMPS',
            wallet_type: 'seller',
            proof_mime: null,
            source_account_ciphertext: 'enc_acc2',
            transaction_id_ciphertext: 'enc_tx2',
            status: 'approved',
            review_note: 'Verified in bank statement',
            created_at: new Date().toISOString(),
            bank_account_id: null,
            username: 'seller01',
            name: 'Seller One',
            bank_display: 'ICICI Bank',
            deposit_account_num: '9876543210',
          },
        ],
        rowCount: 2,
      };
    },
  };

  const page = createAdminFundRequestsPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    decryptFundField: (v, type) => (type === 'transaction' ? 'UTR123456789' : '9988776655'),
  });

  let capturedHtml = '';
  const res = {
    writeHead(code, headers) {
      assert.equal(code, 200);
      assert.equal(headers['content-type'], 'text/html; charset=utf-8');
    },
    end(html) {
      capturedHtml = html;
    },
  };

  await page.sendAdminFundRequestsPage({ role: 'admin', username: 'admin' }, res);

  // KPI cards
  assert.match(capturedHtml, /Pending Approval/);
  assert.match(capturedHtml, /Approved Requests/);
  assert.match(capturedHtml, /Rejected Requests/);
  assert.match(capturedHtml, /Total Volume/);
  assert.match(capturedHtml, /5000\.00/);
  assert.match(capturedHtml, /10000\.00/);

  // Colored badges & columns
  assert.match(capturedHtml, /UPI/);
  assert.match(capturedHtml, /IMPS/);
  assert.match(capturedHtml, /Buyer/);
  assert.match(capturedHtml, /Seller/);
  assert.match(capturedHtml, /UTR123456789/);
  assert.match(capturedHtml, /copy-btn/);
  assert.match(capturedHtml, /View Slip/);
  assert.match(capturedHtml, /Approve/);
  assert.match(capturedHtml, /Reject/);
  assert.match(capturedHtml, /Verified in bank statement/);
});

test('Admin User List Page - Uses compact top layout to free vertical space', async () => {
  const mockDb = {
    async query(sql) {
      const s = String(sql);
      if (/ALTER TABLE|CREATE INDEX/i.test(s)) return { rows: [] };
      if (/SELECT count\(\*\)/i.test(s)) return { rows: [{ total: 1 }] };
      return {
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            username: 'testuser',
            name: 'Test User',
            email: 'test@example.com',
            phone_ciphertext: null,
            status: 'active',
            created_at: new Date().toISOString(),
            address: '123 Market St',
            pincode: '110001',
            state: 'Delhi',
            city: 'New Delhi',
            callback_url: null,
            api_token: null,
            parent_id: null,
            parent_username: null,
            parent_name: null,
            balance_minor: 50000,
          },
        ],
        rowCount: 1,
      };
    },
  };

  const page = createAdminUserListPage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v) / 100).toFixed(2),
    decryptMobile: () => '9876543210',
    normalizeIndianMobile: (m) => m,
    lookupMobile: () => null,
  });

  let capturedHtml = '';
  const res = {
    writeHead(code, headers) {
      assert.equal(code, 200);
    },
    end(html) {
      capturedHtml = html;
    },
  };

  await page.sendAdminUserListPage({ role: 'admin', username: 'admin' }, res, new URLSearchParams());

  // Compact layout assertions
  assert.match(capturedHtml, /user-page\{padding:4px 8px 12px\}/);
  assert.match(capturedHtml, /Registered Users/);
  assert.match(capturedHtml, /testuser/);
  assert.match(capturedHtml, /Test User/);
  assert.match(capturedHtml, /userFiltersFormWrap/);
});
