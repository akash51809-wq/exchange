'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateGstAmounts,
  getLastMonthYear,
  isSameState,
  getMonthRange,
} = require('../lib/invoice-utils');
const createAdminInvoicePage = require('../pages/admin-invoice');
const createUserInvoicePages = require('../pages/user-invoice');

test('GST Invoice Calculation - Taxable, CGST, SGST, IGST (User Example: 118,000)', () => {
  // Test case 1: Seller/Buyer is from UP (same state as admin)
  // Total = 118,000 (11,800,000 paise)
  const upAmounts = calculateGstAmounts(11800000n, 'Uttar Pradesh', 'Uttar Pradesh');
  assert.equal(upAmounts.taxableMinor, 10000000n, 'Taxable amount should be 100,000.00');
  assert.equal(upAmounts.cgstMinor, 900000n, 'CGST should be 9,000.00 (9%)');
  assert.equal(upAmounts.sgstMinor, 900000n, 'SGST should be 9,000.00 (9%)');
  assert.equal(upAmounts.igstMinor, 0n, 'IGST should be 0.00 for intra-state');
  assert.equal(upAmounts.totalMinor, 11800000n, 'Total amount should be 118,000.00');
  assert.equal(upAmounts.isSameState, true);

  // Test case 2: UP abbreviation check ('UP' vs 'Uttar Pradesh')
  const upAbbrAmounts = calculateGstAmounts(11800000n, 'UP', 'Uttar Pradesh');
  assert.equal(upAbbrAmounts.cgstMinor, 900000n);
  assert.equal(upAbbrAmounts.sgstMinor, 900000n);
  assert.equal(upAbbrAmounts.igstMinor, 0n);

  // Test case 3: Seller/Buyer is from another state (inter-state, e.g. Delhi, Maharashtra, Bihar)
  const interAmounts = calculateGstAmounts(11800000n, 'Maharashtra', 'Uttar Pradesh');
  assert.equal(interAmounts.taxableMinor, 10000000n, 'Taxable amount should be 100,000.00');
  assert.equal(interAmounts.cgstMinor, 0n, 'CGST should be 0.00 for inter-state');
  assert.equal(interAmounts.sgstMinor, 0n, 'SGST should be 0.00 for inter-state');
  assert.equal(interAmounts.igstMinor, 1800000n, 'IGST should be 18,000.00 (18%) for inter-state');
  assert.equal(interAmounts.totalMinor, 11800000n);
  assert.equal(interAmounts.isSameState, false);
});

test('GST Invoice Utilities - Date Range and Last Month Defaults', () => {
  const last = getLastMonthYear();
  assert.ok(last.year, 'Year should be present');
  assert.ok(last.month, 'Month should be present');
  assert.match(last.month, /^\d{2}$/, 'Month should be 2 digits');
  assert.equal(last.monthYear, `${last.year}-${last.month}`);

  const range = getMonthRange('2026', '09');
  assert.equal(range.start, '2026-09-01 00:00:00+05:30');
  assert.equal(range.end, '2026-10-01 00:00:00+05:30');

  assert.equal(isSameState('Uttar Pradesh', 'Uttar Pradesh'), true);
  assert.equal(isSameState('UP', 'Uttar Pradesh'), true);
  assert.equal(isSameState('Bihar', 'Uttar Pradesh'), false);
});

test('Admin Invoice Page - Color Contrast & Table Column Structure', async () => {
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('SELECT state FROM users WHERE role = \'admin\'')) {
        return { rows: [{ state: 'Uttar Pradesh' }] };
      }
      if (sql.includes('FROM seller_gst_invoices')) {
        return {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              user_id: 'u-1',
              month_year: '2026-09',
              redeem_amount_minor: '11800000',
              taxable_amount_minor: '10000000',
              cgst_amount_minor: '900000',
              sgst_amount_minor: '900000',
              igst_amount_minor: '0',
              status: 'waiting_for_approval',
              created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
              updated_at: new Date('2026-10-02T10:00:00Z').toISOString(),
              user_name: 'Goyal Telecom',
              username: 'goyalpay',
              business_name: 'Goyal Solution',
              user_state: 'Uttar Pradesh',
              gst_number: '09AABCU9603R1ZX',
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM buyer_gst_invoices')) {
        return {
          rows: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              user_id: 'b-1',
              month_year: '2026-09',
              topup_amount_minor: '11800000',
              taxable_amount_minor: '10000000',
              cgst_amount_minor: '0',
              sgst_amount_minor: '0',
              igst_amount_minor: '1800000',
              status: 'pending',
              created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
              updated_at: new Date('2026-10-01T00:00:00Z').toISOString(),
              user_name: 'Amit Kumar',
              username: 'amit01',
              business_name: 'Kumar Recharge',
              user_state: 'Delhi',
              gst_number: '07AAECU9603R1ZX',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const { sendAdminInvoicePage } = createAdminInvoicePage({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v || 0) / 100).toFixed(2),
  });

  // 1. Seller Tab View
  let sellerHtml = '';
  await sendAdminInvoicePage({ id: 'admin-1', role: 'admin' }, {
    writeHead: () => {},
    end: (html) => { sellerHtml = html; },
  }, new URLSearchParams('tab=seller&year=2026&month=09'));

  // Check Top Black Box Strip (Logo & Logout Button) & Horizontal Menu Bar
  assert.ok(sellerHtml.includes('id="exchange-fixed-strip"'), 'Must render top fixed black strip');
  assert.ok(sellerHtml.includes('exchange-brand-img'), 'Must include brand logo in top strip');
  assert.ok(sellerHtml.includes('id="logout-button"'), 'Must include Logout button in top strip');
  assert.ok(sellerHtml.includes('class="horizontalMenu'), 'Must include horizontal menu bar');
  assert.ok(sellerHtml.indexOf('id="exchange-fixed-strip"') < sellerHtml.lastIndexOf('</body>'), 'Top strip must be injected into HTML body, not inside script');

  // Verify scripts compile with zero syntax errors
  const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(sellerHtml)) !== null) {
    const code = match[1].trim();
    if (code) {
      assert.doesNotThrow(() => new Function(code), 'All inline scripts must compile without syntax errors');
    }
  }

  // Check Tab Contrast Styling
  assert.ok(sellerHtml.includes('invoice-tab-btn'), 'Should use modern invoice-tab-btn classes');
  assert.ok(sellerHtml.includes('background: #1e3a8a !important;') && sellerHtml.includes('color: #ffffff !important;'), 'Active tab button must have high-contrast deep blue background and white text');
  assert.ok(sellerHtml.includes('background: #ffffff !important;') && sellerHtml.includes('color: #334155 !important;'), 'Inactive tab button must have clean white background with clear dark text');

  // Check Seller Table Headers
  assert.ok(sellerHtml.includes('Year</th>'), 'Must have Year column');
  assert.ok(sellerHtml.includes('Month</th>'), 'Must have Month column');
  assert.ok(sellerHtml.includes('Seller Name</th>'), 'Must have Seller Name column');
  assert.ok(sellerHtml.includes('Seller GST No</th>'), 'Must have Seller GST No column');
  assert.ok(sellerHtml.includes('Taxable Amount</th>'), 'Must have Taxable Amount column');
  assert.ok(sellerHtml.includes('CGST Amt</th>'), 'Must have CGST Amt column');
  assert.ok(sellerHtml.includes('SGST Amt</th>'), 'Must have SGST Amt column');
  assert.ok(sellerHtml.includes('IGST Amt</th>'), 'Must have IGST Amt column');
  assert.ok(sellerHtml.includes('Invoice Amount</th>'), 'Must have Invoice Amount column');
  assert.ok(sellerHtml.includes('Status</th>'), 'Must have Status column');
  assert.ok(sellerHtml.includes('Added Date</th>'), 'Must have Added Date column');
  assert.ok(sellerHtml.includes('Updated Date</th>'), 'Must have Updated Date column');
  assert.ok(sellerHtml.includes('Action / View</th>'), 'Must have Action / View column');

  // Check Row values & Status
  assert.ok(sellerHtml.includes('Goyal Telecom'), 'Must show seller name');
  assert.ok(sellerHtml.includes('09AABCU9603R1ZX'), 'Must show GST number');
  assert.ok(sellerHtml.includes('₹100000.00'), 'Must show taxable amount');
  assert.ok(sellerHtml.includes('₹9000.00'), 'Must show CGST/SGST amounts for UP seller');
  assert.ok(sellerHtml.includes('₹118000.00'), 'Must show invoice amount');
  assert.ok(sellerHtml.includes('Waiting for Approval'), 'Must show Waiting for Approval status for uploaded invoice');

  // 2. Buyer Tab View
  let buyerHtml = '';
  await sendAdminInvoicePage({ id: 'admin-1', role: 'admin' }, {
    writeHead: () => {},
    end: (html) => { buyerHtml = html; },
  }, new URLSearchParams('tab=buyer&year=2026&month=09'));

  assert.ok(buyerHtml.includes('selectAllBuyers'), 'Buyer view must include selectAll checkbox for bulk approve');
  assert.ok(buyerHtml.includes('btnBulkApproveBuyers'), 'Buyer view must have Approve Selected button');
  assert.ok(buyerHtml.includes('Amit Kumar'), 'Must show buyer name');
  assert.ok(buyerHtml.includes('₹18000.00'), 'Must show IGST amount for Delhi buyer');
  assert.ok(buyerHtml.includes('btn-view-buyer-invoice'), 'Must have View Invoice button');
  assert.ok(buyerHtml.includes('btn-approve-buyer'), 'Must have single Approve button for pending buyer');
});

test('User Invoice Page - Seller and Buyer Workflows & Approval Gate', async () => {
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('SELECT state FROM users WHERE role = \'admin\'')) {
        return { rows: [{ state: 'Uttar Pradesh' }] };
      }
      if (sql.includes('FROM buyer_gst_invoices')) {
        return {
          rows: [
            {
              id: 'b-inv-1',
              month_year: '2026-09',
              topup_amount_minor: '11800000',
              taxable_amount_minor: '10000000',
              cgst_amount_minor: '900000',
              sgst_amount_minor: '900000',
              igst_amount_minor: '0',
              status: 'pending',
              created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
              updated_at: new Date('2026-10-01T00:00:00Z').toISOString(),
              user_name: 'Buyer User',
              username: 'buyer01',
              gst_number: '09AABCU9603R1ZX',
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM seller_gst_invoices')) {
        return {
          rows: [
            {
              id: 's-inv-1',
              month_year: '2026-09',
              redeem_amount_minor: '11800000',
              taxable_amount_minor: '10000000',
              cgst_amount_minor: '900000',
              sgst_amount_minor: '900000',
              igst_amount_minor: '0',
              status: 'pending',
              created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
              updated_at: new Date('2026-10-01T00:00:00Z').toISOString(),
              user_name: 'Seller User',
              username: 'seller01',
              gst_number: '09AABCU9603R1ZX',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const { sendUserInvoicePage } = createUserInvoicePages({
    db: mockDb,
    formatMinorUnits: (v) => (Number(v || 0) / 100).toFixed(2),
  });

  // 1. Buyer panel: When invoice is pending approval, buyer cannot download and sees pending notice
  let buyerHtml = '';
  await sendUserInvoicePage({ id: 'u-1', name: 'Buyer User', username: 'buyer01', role: 'user' }, 'buyer-gst', {
    writeHead: () => {},
    end: (html) => { buyerHtml = html; },
  }, new URLSearchParams('year=2026&month=09'));

  assert.ok(buyerHtml.includes('Invoice Pending Admin Approval'), 'Must display pending admin approval notice to buyer');
  assert.ok(buyerHtml.includes('pending confirmation from Admin'), 'Must inform buyer that invoice is awaiting admin verification');
  assert.ok(buyerHtml.includes('Available After Approval'), 'Actions must show Available After Approval when pending');

  // 2. Seller panel: Shows pending status and Upload Invoice action
  let sellerHtml = '';
  await sendUserInvoicePage({ id: 'u-2', name: 'Seller User', username: 'seller01', role: 'user' }, 'seller-gst', {
    writeHead: () => {},
    end: (html) => { sellerHtml = html; },
  }, new URLSearchParams('year=2026&month=09'));

  assert.ok(sellerHtml.includes('Upload Invoice'), 'Seller must have Upload Invoice button');
  assert.ok(sellerHtml.includes('Pending'), 'Seller status must show Pending before upload');
  assert.ok(sellerHtml.includes('uploadInvoiceModal'), 'Seller page must have upload invoice modal');
});
