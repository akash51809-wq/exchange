'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const createUserDashboardPage = require('../pages/user-dashboard');
const { clearPolicyCache } = require('../lib/wallet-helper');

describe('User Dashboard Component Tests', () => {
  it('renders running news ticker bar, single wallet mode, lean balance, and all 6 KPI cards with counts and values', async () => {
    clearPolicyCache();
    const mockDb = {
      query: async (sql, params) => {
        if (sql.includes('FROM website_settings')) {
          return {
            rows: [{
              wallet_mode: 'single',
              news_ticker: 'Breaking: Super fast recharge server live 24x7!',
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM wallets')) {
          return {
            rows: [{
              id: 'w-1',
              balance_minor: 125000n,
              buyer_balance_minor: 125000n,
              seller_balance_minor: 0n,
              lien_balance_minor: 5000n,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM seller_wallet_liens')) {
          return { rows: [{ total_lien: 5000n }], rowCount: 1 };
        }
        if (sql.includes('ORDER BY r.created_at DESC')) {
          return {
            rows: [{
              id: 'rec-1',
              mobile_number: '9876543210',
              operator_name: 'Jio',
              circle_name: 'Delhi',
              amount_minor: 23900n,
              status: 'successful',
              provider_reference: 'PR123',
              idempotency_key: 'IDEM1',
              created_at: new Date().toISOString(),
              txn_role: 'Purchase',
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('seller_user_id = $1') && sql.includes('created_at AT TIME ZONE')) {
          // Today sales
          return {
            rows: [{ total_count: 8, total_val: 250000n, success_count: 7, success_val: 220000n }],
            rowCount: 1,
          };
        }
        if (sql.includes('user_id = $1') && sql.includes('created_at AT TIME ZONE')) {
          // Today purchase
          return {
            rows: [{ total_count: 5, total_val: 125000n, success_count: 4, success_val: 100000n }],
            rowCount: 1,
          };
        }
        if (sql.includes('seller_user_id = $1') && sql.includes('dispute_status IN')) {
          // Today sales dispute
          return {
            rows: [{ count: 2, val: 49900n }],
            rowCount: 1,
          };
        }
        if (sql.includes('user_id = $1') && sql.includes('dispute_status IN')) {
          // Today purchase dispute
          return {
            rows: [{ count: 1, val: 29900n }],
            rowCount: 1,
          };
        }
        if (sql.includes('seller_user_id = $1') && sql.includes("status IN ('pending', 'processing')")) {
          // Pending sales
          return {
            rows: [{ count: 1, val: 19900n }],
            rowCount: 1,
          };
        }
        if (sql.includes('user_id = $1') && sql.includes("status IN ('pending', 'processing')")) {
          // Pending purchase
          return {
            rows: [{ count: 3, val: 65000n }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const { sendUserDashboard } = createUserDashboardPage({ db: mockDb, adminUiRoot: '' });

    let writtenStatus = 0;
    let writtenHeaders = {};
    let writtenBody = '';

    const mockResponse = {
      writeHead: (status, headers) => {
        writtenStatus = status;
        writtenHeaders = headers;
      },
      end: (content) => {
        writtenBody = content;
      },
    };

    const testUser = {
      id: 'u-1',
      username: 'demouser',
      name: 'Demo User',
      role: 'user',
    };

    await sendUserDashboard(testUser, mockResponse);

    assert.strictEqual(writtenStatus, 200);
    assert.match(writtenHeaders['content-type'], /text\/html/);

    // 1. Verify running news ticker bar is rendered touching below menu
    assert.match(writtenBody, /class="user-news-ticker-strip"/);
    assert.match(writtenBody, /LIVE NEWS/);
    assert.match(writtenBody, /Breaking: Super fast recharge server live 24x7!/);

    // 2. Verify Single Wallet Mode is rendered with Lean Balance
    assert.match(writtenBody, /Main Wallet Balance/i);
    assert.match(writtenBody, /₹1250\.00/);
    assert.match(writtenBody, /Lean Balance \(Lien Hold\)/i);
    assert.match(writtenBody, /₹50\.00/);
    assert.match(writtenBody, /Net Available Balance/i);
    assert.match(writtenBody, /₹1200\.00/); // 1250 - 50 = 1200

    // 3. Verify all 6 KPI cards with both count and value
    // Today Purchase
    assert.match(writtenBody, /Today Purchase/i);
    assert.match(writtenBody, /4 Orders/);
    assert.match(writtenBody, /₹1000\.00/);

    // Today Sales
    assert.match(writtenBody, /Today Sales/i);
    assert.match(writtenBody, /7 Orders/);
    assert.match(writtenBody, /₹2200\.00/);

    // Today Purchase Dispute
    assert.match(writtenBody, /Today Purchase Dispute/i);
    assert.match(writtenBody, /1 Disputes/);
    assert.match(writtenBody, /₹299\.00/);

    // Today Sales Dispute
    assert.match(writtenBody, /Today Sales Dispute/i);
    assert.match(writtenBody, /2 Disputes/);
    assert.match(writtenBody, /₹499\.00/);

    // Pending Purchase
    assert.match(writtenBody, /Pending Purchase/i);
    assert.match(writtenBody, /3 Pending/);
    assert.match(writtenBody, /₹650\.00/);

    // Pending Sales
    assert.match(writtenBody, /Pending Sales/i);
    assert.match(writtenBody, /1 Pending/);
    assert.match(writtenBody, /₹199\.00/);
  });

  it('renders Separate Wallet mode showing Buyer Wallet, Seller Wallet, and Lean Balance', async () => {
    clearPolicyCache();
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('FROM website_settings')) {
          return {
            rows: [{ wallet_mode: 'separate', news_ticker: 'Dual wallet active' }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM wallets')) {
          return {
            rows: [{
              id: 'w-dual',
              balance_minor: 90000n,
              buyer_balance_minor: 40000n,
              seller_balance_minor: 50000n,
              lien_balance_minor: 3000n,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM seller_wallet_liens')) {
          return { rows: [{ total_lien: 3000n }], rowCount: 1 };
        }
        return { rows: [{ count: 0, val: 0n, total_count: 0, total_val: 0n }], rowCount: 1 };
      },
    };

    const { sendUserDashboard } = createUserDashboardPage({ db: mockDb, adminUiRoot: '' });
    let writtenBody = '';
    const mockResponse = {
      writeHead: () => {},
      end: (c) => { writtenBody = c; },
    };

    await sendUserDashboard({ id: 'u-dual', username: 'dualuser', name: 'Dual User' }, mockResponse);

    // Verify dual wallets are rendered
    assert.match(writtenBody, /Buyer Wallet/i);
    assert.match(writtenBody, /₹400\.00/);
    assert.match(writtenBody, /Seller Wallet/i);
    assert.match(writtenBody, /₹500\.00/);
    assert.match(writtenBody, /Lean Balance \(Lien Hold\)/i);
    assert.match(writtenBody, /₹30\.00/);
    assert.match(writtenBody, /Exchange Wallet/i);
  });
});
