'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const createUserIntegrationRequestPage = require('../pages/user-integration-request');
const createUserFundRedeemPage = require('../pages/user-fund-redeem');
const createUserWalletTopupPage = require('../pages/user-wallet-topup');
const { USER_PANEL_MENU, getUserPanelMenu } = require('../config/user-panel-menu');
const { ADMIN_PANEL_MENU } = require('../config/admin-panel-menu');

test('User Panel Menu Configuration Tests', async (t) => {
  await t.test('Available Margin is removed from Buyer menu and Available Stock is present', () => {
    const singleMenu = getUserPanelMenu('single');
    const buyerMenu = singleMenu.find((m) => m.label === 'Buyer');
    assert.ok(buyerMenu, 'Buyer menu should exist');
    const hasAvailableMargin = buyerMenu.items?.some((item) => item.label.toLowerCase().includes('available margin'));
    assert.equal(hasAvailableMargin, false, 'Available Margin must NOT exist under Buyer menu');

    const hasAvailableStock = singleMenu.some((m) => m.label === 'Available Stock');
    assert.equal(hasAvailableStock, true, 'Available Stock must be present as top-level menu');

    const helpMenu = singleMenu.find((m) => m.label === 'Help');
    assert.ok(helpMenu, 'Help menu should exist');
    const intReq = helpMenu.items?.find((item) => item.path === '/help/integration-requests');
    assert.ok(intReq, 'Integration Requests submenu must exist under Help menu');
  });

  await t.test('Admin Panel Menu has Seller API Requests', () => {
    const sellerApiReq = ADMIN_PANEL_MENU.find((m) => m.label === 'Seller API Requests');
    assert.ok(sellerApiReq, 'Seller API Requests menu must exist in Admin menu');
    assert.equal(sellerApiReq.path, '/admin/seller-api/requests');
  });
});

test('Wallet Topup Request - UTR Validation & Form Attributes', async (t) => {
  await t.test('wallet topup page enforces mandatory UTR and removes optional depositor account field', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('admin_bank_accounts')) {
          return {
            rows: [
              {
                id: '11111111-1111-1111-1111-111111111111',
                bank_name: 'AXIS BANK',
                branch_name: 'MAIN',
                account_holder: 'S3 SOLUTION',
                account_number: '918239129312',
                ifsc_code: 'UTIB0001234',
                billing_info: '24x7 Auto',
                cash_deposit_charges: 0,
                is_active: true,
                has_logo: false,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const { sendWalletTopupRequestPage } = createUserWalletTopupPage({
      db: mockDb,
      formatMinorUnits: (m) => (Number(m) / 100).toFixed(2),
    });

    let renderedHtml = '';
    const mockRes = {
      writeHead: () => {},
      end: (content) => { renderedHtml = content; },
    };

    await sendWalletTopupRequestPage({ id: 'user-1' }, mockRes);

    // Verify UTR is required
    assert.ok(renderedHtml.includes('UTR / Transaction Reference ID'), 'Form must have UTR / Transaction Reference ID label');
    assert.ok(renderedHtml.includes('id="topup-transaction-id"'), 'Form must have topup-transaction-id input');
    assert.ok(renderedHtml.includes('required'), 'topup-transaction-id input must be marked required');
    assert.ok(renderedHtml.includes('1 UTR can only be submitted once lifetime across the entire system'), 'Help text should explain lifetime global UTR uniqueness');

    // Verify depositor account is removed
    assert.ok(!renderedHtml.includes('Your Depositor Account No. (Optional)'), 'Depositor Account No (Optional) must be removed');

    // Verify spin buttons are removed via CSS
    assert.ok(renderedHtml.includes('input[type=number]::-webkit-inner-spin-button'), 'CSS should hide spin buttons on number inputs');
  });
});

test('Fund Redeem - Indian Banks Dropdown & Approval-Gated Redeem Feature', async (t) => {
  await t.test('hides redeem form and button when no bank accounts are approved', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('user_bank_accounts')) {
          // User has one bank account, but it is pending approval
          return {
            rows: [
              {
                id: 'b1',
                bank_name: 'State Bank of India',
                account_holder_name: 'John Doe',
                account_number: '123456789012',
                ifsc_code: 'SBIN0001234',
                status: 'pending',
                admin_note: '',
                created_at: new Date().toISOString(),
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('payout_requests')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const { sendUserFundRedeemPage } = createUserFundRedeemPage({
      db: mockDb,
      formatMinorUnits: (m) => (Number(m) / 100).toFixed(2),
    });

    let renderedHtml = '';
    const mockRes = {
      writeHead: () => {},
      end: (content) => { renderedHtml = content; },
    };

    await sendUserFundRedeemPage({ id: 'user-1' }, mockRes, new URLSearchParams());

    // Redeem form and submit button should NOT be rendered when approvedBanks.length === 0
    assert.ok(!renderedHtml.includes('id="btnSubmitPayout"'), 'Payout submit button must not be visible when no bank is approved');
    assert.ok(renderedHtml.includes('Bank Approval Required') || renderedHtml.includes('No Approved Bank Account'), 'Must show bank approval notice');

    // Verify Indian Banks dropdown exists in Add Bank modal
    assert.ok(renderedHtml.includes('id="mbBankSelect"'), 'Add bank modal must have select dropdown with Indian banks');
    assert.ok(renderedHtml.includes('State Bank of India (SBI)'), 'Must list State Bank of India');
    assert.ok(renderedHtml.includes('HDFC Bank'), 'Must list HDFC Bank');
    assert.ok(renderedHtml.includes('ICICI Bank'), 'Must list ICICI Bank');
    assert.ok(renderedHtml.includes('Punjab National Bank (PNB)'), 'Must list PNB');
    assert.ok(renderedHtml.includes('Axis Bank'), 'Must list Axis Bank');
  });

  await t.test('shows redeem form and submit button when bank account is approved', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('user_bank_accounts')) {
          return {
            rows: [
              {
                id: 'b-approved',
                bank_name: 'HDFC Bank',
                account_holder_name: 'John Doe',
                account_number: '5010023456789',
                ifsc_code: 'HDFC0001234',
                status: 'approved',
                admin_note: '',
                created_at: new Date().toISOString(),
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const { sendUserFundRedeemPage } = createUserFundRedeemPage({
      db: mockDb,
      formatMinorUnits: (m) => (Number(m) / 100).toFixed(2),
    });

    let renderedHtml = '';
    const mockRes = {
      writeHead: () => {},
      end: (content) => { renderedHtml = content; },
    };

    await sendUserFundRedeemPage({ id: 'user-1' }, mockRes, new URLSearchParams());

    // Redeem form and submit button should be rendered when approvedBanks.length > 0
    assert.ok(renderedHtml.includes('id="btnSubmitPayout"'), 'Payout submit button must be visible when bank is approved');
    assert.ok(renderedHtml.includes('id="payoutBankId"'), 'Bank selection input must be visible in payout form');
  });
});

test('Integration Requests Page Form Elements', async (t) => {
  await t.test('renders all requested columns and fields in user integration request page', async () => {
    const mockDb = {
      query: async () => ({ rows: [], rowCount: 0 }),
    };

    const { sendUserIntegrationRequestPage } = createUserIntegrationRequestPage({ db: mockDb });

    let renderedHtml = '';
    const mockRes = {
      writeHead: () => {},
      end: (content) => { renderedHtml = content; },
    };

    await sendUserIntegrationRequestPage({ id: 'user-1' }, mockRes);

    // Verify all requested inputs
    assert.ok(renderedHtml.includes('id="apiWebsite"'), 'API Website input required');
    assert.ok(renderedHtml.includes('id="apiUsername"'), 'API Username input required');
    assert.ok(renderedHtml.includes('id="websitePassword"'), 'Website Password input required');
    assert.ok(renderedHtml.includes('id="supportNumber"'), 'Support Number input required');
    assert.ok(renderedHtml.includes('id="serverIp"'), 'Server IP Address input required');
    assert.ok(renderedHtml.includes('id="apiToken"'), 'API Token input required');
    assert.ok(renderedHtml.includes('id="apiPin"'), 'API Pin input required');
    assert.ok(renderedHtml.includes('id="apiRemark"'), 'API Remark input required');
    assert.ok(renderedHtml.includes('id="apiDocument"'), 'API Document upload required');
    assert.ok(renderedHtml.includes('id="btnSubmit"'), 'Submit button required');
  });
});
