'use strict';

/*
 * Exchange — मोबाइल रिचार्ज पोर्टल के लिए एकल-फ़ाइल API आधार
 *
 * फ़ाइल का नक्शा:
 *  1. कॉन्फ़िगरेशन       : पर्यावरण चर, होस्ट, पोर्ट और अनुरोध सीमा
 *  2. साझा सुरक्षा       : सुरक्षा हेडर, सीमित JSON पढ़ना, सामान्य त्रुटियाँ
 *  3. रूट हैंडलर         : नीचे allow-list में API के रास्ते और उनका तर्क
 *  4. व्यवस्थापक UI      : ADMIN UI का Horizontal-Light टेम्पलेट /admin पर
 *  5. सर्वर प्रवाह       : हर अनुरोध को जाँचना, रूट करना और लॉग करना
 *  6. प्रारंभ/बंद करना  : सर्वर शुरू करना और व्यवस्थित रूप से बंद होना
 *
 * अनुरोध प्रवाह:
 * क्लाइंट → सुरक्षा हेडर → URL/विधि जाँच → allow-list रूट → उत्तर
 * गलती आने पर → सुरक्षित त्रुटि उत्तर; आंतरिक विवरण केवल सर्वर लॉग में।
 *
 * सुरक्षा:
 * - केवल घोषित रूट चलते हैं; मनमाने फ़ाइल पथ या कोड निष्पादन नहीं हैं।
 * - JSON अनुरोध आकार सीमित है; Content-Type और JSON रचना जाँची जाती है।
 * - सुरक्षा हेडर लगते हैं और उपयोगकर्ता का इनपुट HTML के रूप में नहीं लौटता।
 * - लॉग में अनुरोध का body, query string या credentials नहीं लिखे जाते।
 * - डिफ़ॉल्ट रूप से केवल localhost पर सुनता है। सार्वजनिक उपयोग से पहले
 *   authentication, authorization, HTTPS proxy, durable storage और rate limit
 *   अपनी ज़रूरत के अनुसार जोड़ें। यह आधार production-ready सेवा का दावा नहीं करता।
 *
 * पोर्टल की सुरक्षा रूपरेखा (अभी लागू नहीं; डेटाबेस/auth जोड़ते समय अनिवार्य):
 * - User और Admin अलग भूमिका होंगे; हर route पर server-side RBAC जाँच होगी।
 * - प्रत्येक recharge/order/wallet रिकॉर्ड को owner user ID से बाँधें और हर
 *   query में ownership जाँचें; client से आए userId पर भरोसा न करें।
 * - Password Argon2id hash में रहता है; mobile field AES-256-GCM से encrypted है।
 * - Recharge provider/API credentials केवल server secret store में रखें;
 *   browser/mobile app या logs में कभी न भेजें।
 * - Login पर throttling, MFA (विशेषकर Admin), session/token expiry/revocation,
 *   audit log, database least-privilege और backup encryption लगाएँ।
 * - सार्वजनिक deployment में TLS/HTTPS अनिवार्य करें; database/storage पर
 *   encryption-at-rest लगाएँ। TLS और storage encryption अलग सुरक्षा परतें हैं।
 * - हर recharge request पर idempotency, transaction state validation, limits,
 *   provider response verification और fraud/rate controls जोड़ें।
 * - WAF/firewall, monitoring/alerts, dependency updates और नियमित security review
 *   नेटवर्क/हॉस्टिंग पर लागू होंगे; केवल application code पर्याप्त नहीं है।
 *
 * वर्तमान सीमा: OTP केवल local development में दिखता है; production SMS provider
 * जुड़ा नहीं है। Recharge और admin business actions अभी बाकी हैं। Public use से
 * पहले HTTPS, SMS delivery, durable rate limiting और deployment सुरक्षा जोड़ें।
 */

const http = require('node:http');
const { URL } = require('node:url');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Load environment variables from .env if present
try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env')) {
    process.loadEnvFile();
  }
} catch (_) {}

const { createSupabaseDbPool, createSupabaseClientInstance, getDatabaseUrl } = require('./lib/supabase');
const createUserDashboardPage = require('./pages/user-dashboard');
const createUserPlaceholderPage = require('./pages/user-placeholder');
const createUserFundOrderPage = require('./pages/user-fund-order');
const createUserWalletTopupPage = require('./pages/user-wallet-topup');
const createUserSalesMarginPage = require('./pages/user-sales-margin');
const createUserBuyerMarginPage = require('./pages/user-buyer-margin');
const createUserAvailableStockPage = require('./pages/user-available-stock');
const createUserSellerSalesTxnPage = require('./pages/user-seller-sales-txn');
const createUserBuyerPurchaseTxnPage = require('./pages/user-buyer-purchase-txn');
const createUserSellerSalesDisputePage = require('./pages/user-seller-sales-dispute');
const createAdminDisputesPage = require('./pages/admin-disputes');
const createAdminFundRequestsPage = require('./pages/admin-fund-requests');
const createAdminCreateOperatorPage = require('./pages/admin-create-operator');
const createAdminShowOperatorsPage = require('./pages/admin-show-operators');
const createAdminUserListPage = require('./pages/admin-user-list');
const createAdminSellerApiRequestsPage = require('./pages/admin-seller-api-requests');
const createAdminServiceSettingsPage = require('./pages/admin-service-settings');
const createAdminStaticUi = require('./pages/admin-static-ui');
const { calculateTransactionMargin } = require('./lib/margin-calculator');
const { executeStockApiCall, extractValueByPath } = require('./lib/stock-api-helper');
const createBuyerApiService = require('./lib/buyer-api-service');
const { sendWhatsappNotification, sendEmailNotification } = require('./lib/notification-service');
const { fetchOperatorLookup } = require('./lib/plan-api-service');

// 1) कॉन्फ़िगरेशन: PORT और HOST को चलाते समय environment से बदला जा सकता है।
const PORT = parsePort(process.env.PORT, 3000);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' || process.env.RENDER ? '0.0.0.0' : '0.0.0.0');
const MAX_JSON_BYTES = 1_000_000; // अधिकतम JSON body: 1 MB
const REQUEST_TIMEOUT_MS = 15_000;
const ADMIN_UI_ROOT = path.resolve(__dirname, 'ADMIN UI/HTML/zendash/HTML-LTR/Horizontal-Light');
const ADMIN_ASSETS_ROOT = path.resolve(__dirname, 'ADMIN UI/HTML/zendash/assets');
const DATABASE_URL = getDatabaseUrl();
const APP_SECRET = process.env.APP_SECRET || (process.env.NODE_ENV === 'production' ? '' : '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
let ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : 'Admin@123');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_COOKIE = 'exchange_session';
const SESSION_DURATION_SECONDS = 12 * 60 * 60;
const authRateLimits = new Map();

function getServerIp() {
  const envIp = process.env.SERVER_PUBLIC_IP || process.env.SERVER_IP;
  if (envIp) return envIp;
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || '127.0.0.1';
}

// Supabase PostgreSQL Pool & Supabase Client
const db = createSupabaseDbPool();
const supabase = createSupabaseClientInstance();

const { sendUserDashboard } = createUserDashboardPage({ db, adminUiRoot: ADMIN_UI_ROOT });
const { sendUserPanelPage } = createUserPlaceholderPage({ db });
const { sendUserFundOrderPage } = createUserFundOrderPage({ db, formatMinorUnits, fundFieldHash, decryptFundField });
const { sendWalletTopupRequestPage } = createUserWalletTopupPage({ db, formatMinorUnits });
const {
  sendUserSalesMarginPage,
  createSellerMargin,
  updateSellerMargin,
  setSellerMarginActive,
  deleteSellerMargin,
} = createUserSalesMarginPage({ db, formatMinorUnits, getSession, readJson, checkSameOrigin, httpError, sendJson, allowRate });
const {
  sendUserBuyerMarginPage,
  createBuyerMargin,
  updateBuyerMargin,
  setBuyerMarginActive,
  deleteBuyerMargin,
} = createUserBuyerMarginPage({ db, formatMinorUnits, getSession, readJson, checkSameOrigin, httpError, sendJson, allowRate });
const { sendUserAvailableStockPage } = createUserAvailableStockPage({ db, formatMinorUnits, decryptServiceConfig, getSession, httpError });
const { sendUserSellerSalesTxnPage } = createUserSellerSalesTxnPage({ db, formatMinorUnits, decryptMobile });
const { sendUserBuyerPurchaseTxnPage } = createUserBuyerPurchaseTxnPage({ db, formatMinorUnits, decryptMobile });
const { sendUserSellerSalesDisputePage } = createUserSellerSalesDisputePage({ db, formatMinorUnits, decryptMobile });
const { sendAdminDisputesPage } = createAdminDisputesPage({ db, formatMinorUnits, decryptMobile });
const {
  handleBuyerRecharge,
  handleBuyerStatus,
  handleBuyerBalance,
  handleBuyerDispute,
  handleBuyerOperators,
  handleBuyerOperatorLookup,
  handleGetCredentials,
} = createBuyerApiService({ db, formatMinorUnits, encryptMobile, decryptMobile, decryptSellerApiConfig, decryptServiceConfig, fetchOperatorLookup, sendJson, httpError });
const { sendAdminFundRequestsPage } = createAdminFundRequestsPage({ db, formatMinorUnits, decryptFundField });
const { sendAdminCreateOperatorPage } = createAdminCreateOperatorPage({});
const { sendAdminShowOperatorsPage } = createAdminShowOperatorsPage({ db, formatMinorUnits });
const { sendAdminUserListPage } = createAdminUserListPage({ db, formatMinorUnits, decryptMobile, normalizeIndianMobile, lookupMobile });
const { sendAdminSellerApiRequestsPage } = createAdminSellerApiRequestsPage({ db, formatMinorUnits, decryptMobile });
const {
  sendAdminServiceSettingsPage,
  handleGetServices,
  handleSaveEmailSettings,
  handleTestEmail,
  handleSaveWhatsappSettings,
  handleTestWhatsapp,
  handleSavePlanApiSettings,
  handleTestPlanApi,
  handleSaveMarginDifferenceSettings,
} = createAdminServiceSettingsPage({ db, encryptServiceConfig, decryptServiceConfig, sendJson, httpError });
const { serveAdminUi } = createAdminStaticUi({ fs, fsp, path, adminUiRoot: ADMIN_UI_ROOT, adminAssetsRoot: ADMIN_ASSETS_ROOT, sendJson });

// PostgreSQL का शुरुआती पोर्टल स्कीमा। पासवर्ड केवल password hash के रूप में।
// पैसे की रकम छोटे मुद्रा-इकाइयों में BIGINT है; floating point नहीं।
const DATABASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT,
    name TEXT,
    email TEXT,
    phone_ciphertext BYTEA,
    phone_lookup_hash TEXT,
    parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    address TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'pending')),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_ciphertext BYTEA;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_lookup_hash TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
  UPDATE users SET username = 'u' || substr(replace(id::text, '-', ''), 1, 12) WHERE username IS NULL;
  UPDATE users SET name = 'User' WHERE name IS NULL;
  ALTER TABLE users ALTER COLUMN username SET NOT NULL;
  ALTER TABLE users ALTER COLUMN name SET NOT NULL;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS api_token TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS callback_url TEXT;
  UPDATE users SET api_token = 'tok_' || replace(gen_random_uuid()::text, '-', '') WHERE api_token IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS users_api_token_unique ON users (api_token) WHERE api_token IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (lower(username));
  CREATE UNIQUE INDEX IF NOT EXISTS users_phone_lookup_unique ON users (phone_lookup_hash) WHERE phone_lookup_hash IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email)) WHERE email IS NOT NULL;
  CREATE INDEX IF NOT EXISTS users_parent_user_idx ON users (parent_user_id) WHERE parent_user_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS otp_challenges (
    phone_lookup_hash TEXT PRIMARY KEY,
    otp_hash BYTEA NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'signup',
    expires_at TIMESTAMPTZ NOT NULL,
    attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at TIMESTAMPTZ
  );
  ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'signup';
  ALTER TABLE otp_challenges DROP CONSTRAINT IF EXISTS otp_challenges_purpose_check;

  CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx ON user_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

  CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, currency),
    UNIQUE (id, user_id)
  );
  INSERT INTO wallets (user_id, currency)
    SELECT id, 'INR' FROM users WHERE role = 'user'
    ON CONFLICT (user_id, currency) DO NOTHING;

  CREATE TABLE IF NOT EXISTS wallet_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL,
    user_id UUID NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor <> 0),
    entry_type TEXT NOT NULL CHECK (entry_type IN ('credit', 'debit', 'refund', 'adjustment')),
    reference_type TEXT NOT NULL,
    reference_id UUID,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (wallet_id, user_id) REFERENCES wallets(id, user_id) ON DELETE RESTRICT,
    UNIQUE (wallet_id, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS wallet_entries_user_created_idx ON wallet_entries (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS wallet_fund_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    bank_code TEXT NOT NULL CHECK (bank_code IN ('axis')),
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('Bank Transfer', 'UPI', 'Cash Deposit')),
    wallet_type TEXT NOT NULL DEFAULT 'Prepaid' CHECK (wallet_type IN ('Prepaid')),
    proof_mime TEXT CHECK (proof_mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
    proof_data BYTEA,
    source_account_ciphertext BYTEA,
    source_account_hash TEXT,
    transaction_id_ciphertext BYTEA,
    transaction_id_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    CHECK ((proof_data IS NULL) = (proof_mime IS NULL))
  );
  ALTER TABLE wallet_fund_requests ADD COLUMN IF NOT EXISTS source_account_ciphertext BYTEA;
  ALTER TABLE wallet_fund_requests ADD COLUMN IF NOT EXISTS source_account_hash TEXT;
  ALTER TABLE wallet_fund_requests ADD COLUMN IF NOT EXISTS transaction_id_ciphertext BYTEA;
  ALTER TABLE wallet_fund_requests ADD COLUMN IF NOT EXISTS transaction_id_hash TEXT;
  CREATE INDEX IF NOT EXISTS wallet_fund_requests_user_created_idx ON wallet_fund_requests (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS wallet_fund_requests_status_created_idx ON wallet_fund_requests (status, created_at DESC);
  CREATE INDEX IF NOT EXISTS wallet_fund_requests_account_hash_idx ON wallet_fund_requests (user_id, source_account_hash);
  CREATE INDEX IF NOT EXISTS wallet_fund_requests_transaction_hash_idx ON wallet_fund_requests (user_id, transaction_id_hash);

  CREATE TABLE IF NOT EXISTS operator_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_name TEXT NOT NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('Mobile Recharge', 'DTH', 'Postpaid', 'Electricity', 'Gas', 'Water', 'Broadband', 'Insurance', 'FASTag', 'Other')),
    operator_code TEXT NOT NULL,
    minimum_amount_minor BIGINT NOT NULL CHECK (minimum_amount_minor >= 0),
    maximum_amount_minor BIGINT NOT NULL CHECK (maximum_amount_minor > 0),
    stop_amounts_minor BIGINT[] NOT NULL DEFAULT '{}',
    operator_number_length SMALLINT CHECK (operator_number_length BETWEEN 1 AND 30),
    bill_payment_parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    deleted_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (maximum_amount_minor >= minimum_amount_minor)
  );
  ALTER TABLE operator_definitions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
  ALTER TABLE operator_definitions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  CREATE UNIQUE INDEX IF NOT EXISTS operator_definitions_code_lower_unique ON operator_definitions (lower(operator_code));

  CREATE TABLE IF NOT EXISTS seller_margin_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    operator_id UUID NOT NULL REFERENCES operator_definitions(id) ON DELETE RESTRICT,
    api_name TEXT NOT NULL DEFAULT 'Exchange API',
    circle_name TEXT NOT NULL,
    amount_type TEXT NOT NULL CHECK (amount_type IN ('all', 'range', 'fixed')),
    amount_min_minor BIGINT,
    amount_max_minor BIGINT,
    commission_percent NUMERIC(7,4) NOT NULL CHECK (commission_percent BETWEEN 0 AND 100),
    required_min_roffer_minor BIGINT NOT NULL DEFAULT 0 CHECK (required_min_roffer_minor >= 0),
    limit_minor BIGINT NOT NULL DEFAULT 0 CHECK (limit_minor >= 0),
    limit_type TEXT NOT NULL DEFAULT 'daily' CHECK (limit_type IN ('daily', 'monthly', 'lifetime', 'unlimited')),
    with_gst BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT false,
    is_admin_approved BOOLEAN NOT NULL DEFAULT true,
    is_roffer TEXT NOT NULL DEFAULT 'all' CHECK (is_roffer IN ('all', 'roffer_only', 'no_roffer')),
    operator_code TEXT,
    limit_used_minor BIGINT NOT NULL DEFAULT 0 CHECK (limit_used_minor >= 0),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
      (amount_type = 'all' AND amount_min_minor IS NULL AND amount_max_minor IS NULL) OR
      (amount_type = 'range' AND amount_min_minor IS NOT NULL AND amount_min_minor >= 0 AND amount_max_minor >= amount_min_minor) OR
      (amount_type = 'fixed' AND amount_min_minor IS NOT NULL AND amount_min_minor >= 0 AND amount_max_minor = amount_min_minor)
    )
  );
  CREATE INDEX IF NOT EXISTS seller_margin_user_created_idx ON seller_margin_settings (user_id, created_at DESC) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS seller_margin_user_active_idx ON seller_margin_settings (user_id, is_active) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS buyer_margin_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    operator_id UUID NOT NULL REFERENCES operator_definitions(id) ON DELETE RESTRICT,
    api_name TEXT NOT NULL DEFAULT 'Exchange API',
    circle_name TEXT NOT NULL,
    amount_type TEXT NOT NULL CHECK (amount_type IN ('all', 'range', 'fixed')),
    amount_min_minor BIGINT,
    amount_max_minor BIGINT,
    commission_percent NUMERIC(7,4) NOT NULL CHECK (commission_percent BETWEEN 0 AND 100),
    required_min_roffer_minor BIGINT NOT NULL DEFAULT 0 CHECK (required_min_roffer_minor >= 0),
    limit_minor BIGINT NOT NULL DEFAULT 0 CHECK (limit_minor >= 0),
    limit_type TEXT NOT NULL DEFAULT 'daily' CHECK (limit_type IN ('daily', 'monthly', 'lifetime', 'unlimited')),
    with_gst BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT false,
    is_admin_approved BOOLEAN NOT NULL DEFAULT true,
    is_roffer TEXT NOT NULL DEFAULT 'all' CHECK (is_roffer IN ('all', 'roffer_only', 'no_roffer')),
    operator_code TEXT,
    limit_used_minor BIGINT NOT NULL DEFAULT 0 CHECK (limit_used_minor >= 0),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
      (amount_type = 'all' AND amount_min_minor IS NULL AND amount_max_minor IS NULL) OR
      (amount_type = 'range' AND amount_min_minor IS NOT NULL AND amount_min_minor >= 0 AND amount_max_minor >= amount_min_minor) OR
      (amount_type = 'fixed' AND amount_min_minor IS NOT NULL AND amount_min_minor >= 0 AND amount_max_minor = amount_min_minor)
    )
  );
  CREATE INDEX IF NOT EXISTS buyer_margin_user_created_idx ON buyer_margin_settings (user_id, created_at DESC) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS buyer_margin_user_active_idx ON buyer_margin_settings (user_id, is_active) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS seller_api_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    short_name TEXT DEFAULT '',
    services TEXT DEFAULT 'Mobile',
    mode TEXT DEFAULT 'manual',
    config_ciphertext BYTEA NOT NULL,
    balance_value TEXT DEFAULT '',
    balance_key TEXT DEFAULT '',
    last_balance_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS balance_value TEXT DEFAULT '';
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS balance_key TEXT DEFAULT '';
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS last_balance_at TIMESTAMPTZ;
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS is_admin_approved BOOLEAN DEFAULT false;
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'waiting';
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT '';
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS callback_ip TEXT DEFAULT '';
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS valid_till TIMESTAMPTZ;
  ALTER TABLE seller_api_settings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  ALTER TABLE seller_api_settings ALTER COLUMN short_name DROP NOT NULL;
  ALTER TABLE seller_api_settings ALTER COLUMN services DROP NOT NULL;
  ALTER TABLE seller_api_settings ALTER COLUMN mode DROP NOT NULL;
  UPDATE seller_api_settings SET approval_status = 'waiting', is_admin_approved = false WHERE approval_status IS NULL;
  CREATE INDEX IF NOT EXISTS seller_api_settings_user_created_idx ON seller_api_settings (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS seller_api_settings_user_active_idx ON seller_api_settings (user_id, created_at DESC) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS recharge_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    mobile_ciphertext BYTEA NOT NULL,
    operator_code TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'processing', 'successful', 'failed', 'refunded')),
    idempotency_key TEXT NOT NULL,
    provider_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)
  );
  DROP INDEX IF EXISTS recharge_provider_reference_unique;
  CREATE INDEX IF NOT EXISTS recharge_provider_reference_idx ON recharge_orders (provider_reference) WHERE provider_reference IS NOT NULL;

  CREATE INDEX IF NOT EXISTS recharge_orders_user_created_idx ON recharge_orders (user_id, created_at DESC);
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS mobile_number TEXT;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS circle_name TEXT DEFAULT 'All';
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS operator_name TEXT;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES operator_definitions(id) ON DELETE SET NULL;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS margin_minor BIGINT DEFAULT 0;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS cost_minor BIGINT DEFAULT 0;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS seller_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS seller_api_id UUID REFERENCES seller_api_settings(id) ON DELETE SET NULL;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS response_payload JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS with_gst BOOLEAN DEFAULT false;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS dispute_status TEXT DEFAULT 'none';
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS dispute_reason TEXT DEFAULT '';
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS dispute_created_at TIMESTAMPTZ;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS dispute_resolved_at TIMESTAMPTZ;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS dispute_resolved_by UUID REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS dispute_resolution_note TEXT DEFAULT '';

  CREATE TABLE IF NOT EXISTS recharge_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES recharge_orders(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
    dispute_code TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    resolution_note TEXT,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS recharge_disputes_order_idx ON recharge_disputes (order_id);
  CREATE INDEX IF NOT EXISTS recharge_disputes_buyer_idx ON recharge_disputes (buyer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS recharge_disputes_seller_idx ON recharge_disputes (seller_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS recharge_disputes_status_idx ON recharge_disputes (status, created_at DESC);

  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs (created_at DESC);

  CREATE TABLE IF NOT EXISTS admin_service_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_key TEXT UNIQUE NOT NULL,
    is_enabled BOOLEAN DEFAULT false,
    config_ciphertext BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

async function initializeDatabase() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    throw new Error('DATABASE_URL या SUPABASE_DB_URL सेट नहीं है। कृपया .env फ़ाइल में Supabase PostgreSQL Connection String सेट करें।');
  }
  if (!/^[a-f0-9]{64}$/i.test(APP_SECRET)) {
    throw new Error('APP_SECRET में 32-byte hex secret सेट करें (जैसे 64 वर्णों का hex स्ट्रिंग)।');
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(DATABASE_SCHEMA);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await bootstrapAdmin();
}

function deriveKey(purpose) {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(APP_SECRET, 'hex'), Buffer.alloc(0), Buffer.from(`exchange:${purpose}`), 32));
}

async function bootstrapAdmin() {
  const bootstrapPassword = ADMIN_BOOTSTRAP_PASSWORD;
  ADMIN_BOOTSTRAP_PASSWORD = undefined;
  delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!bootstrapPassword) return;
  const existing = await db.query("SELECT id FROM users WHERE lower(username) = 'admin'");
  if (existing.rowCount) return;
  const hash = await argon2.hash(bootstrapPassword, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  await db.query(
    "INSERT INTO users (username, name, password_hash, role) VALUES ('admin', 'Administrator', $1, 'admin') ON CONFLICT DO NOTHING",
    [hash],
  );
  console.log('प्रारंभिक admin खाता बनाया गया।');
}

function parsePort(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT का मान 1 से 65535 के बीच पूर्णांक होना चाहिए।');
  }
  return port;
}

// 2) साझा उत्तर और सुरक्षा हेडर। JSON उत्तर में untrusted HTML render नहीं होता।
function sendJson(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; connect-src 'self'; frame-ancestors 'none';",
    ...extraHeaders,
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const contentType = String(request.headers['content-type'] || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();

    if (contentType !== 'application/json') {
      reject(Object.assign(new Error('Content-Type application/json होना चाहिए।'), { statusCode: 415 }));
      request.resume();
      return;
    }

    const declaredLength = Number(request.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
      reject(Object.assign(new Error('अनुरोध का आकार सीमा से बड़ा है।'), { statusCode: 413 }));
      request.resume();
      return;
    }

    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        reject(Object.assign(new Error('अनुरोध का आकार सीमा से बड़ा है।'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          reject(Object.assign(new Error('JSON object अपेक्षित है।'), { statusCode: 400 }));
          return;
        }
        resolve(value);
      } catch {
        reject(Object.assign(new Error('JSON सही प्रारूप में नहीं है।'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeIndianMobile(value) {
  const digits = String(value || '').replace(/[\s()-]/g, '');
  const normalized = /^\d{10}$/.test(digits) ? `+91${digits}` : digits.startsWith('91') && digits.length === 12 ? `+${digits}` : digits;
  if (!/^\+91[6-9]\d{9}$/.test(normalized)) throw httpError('भारत का सही 10 अंकों का मोबाइल नंबर दर्ज करें।', 400);
  return normalized;
}

function lookupMobile(mobile) {
  return crypto.createHmac('sha256', deriveKey('mobile-lookup')).update(mobile).digest('hex');
}

function lookupEmail(email) {
  return crypto.createHmac('sha256', deriveKey('email-lookup')).update(String(email || '').trim().toLowerCase()).digest('hex');
}

function encryptMobile(mobile) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('mobile-encryption'), iv);
  const ciphertext = Buffer.concat([cipher.update(mobile, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptMobile(data) {
  if (!data) return '';
  const bytes = Buffer.from(data);
  if (bytes.length < 29) throw new Error('Stored mobile value is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('mobile-encryption'), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

function encryptFundProof(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('fund-proof-encryption'), iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptFundProof(data) {
  const bytes = Buffer.from(data);
  if (bytes.length < 29) throw new Error('Stored fund proof is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('fund-proof-encryption'), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
}

function encryptFundField(value, fieldName) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(`fund-request-${fieldName}`), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptFundField(data, fieldName) {
  const bytes = Buffer.from(data);
  if (bytes.length < 29) throw new Error('Stored fund request value is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(`fund-request-${fieldName}`), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

function fundFieldHash(fieldName, normalizedValue) {
  return crypto.createHmac('sha256', deriveKey('fund-request-search'))
    .update(`${fieldName}:${normalizedValue}`).digest('hex');
}

function otpDigest(phoneHash, otp, purpose = 'signup') {
  return crypto.createHmac('sha256', deriveKey('otp')).update(`${purpose}:${phoneHash}:${otp}`).digest();
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function allowRate(key, limit, windowMs) {
  const now = Date.now();
  let bucket = authRateLimits.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  authRateLimits.set(key, bucket);
  if (authRateLimits.size > 5_000) {
    for (const [oldKey, oldBucket] of authRateLimits) if (oldBucket.resetAt <= now) authRateLimits.delete(oldKey);
  }
  return bucket.count <= limit;
}

function clientAddress(request) {
  return request.socket.remoteAddress || 'unknown';
}

function checkSameOrigin(request) {
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
    throw httpError('यह अनुरोध स्वीकार नहीं किया गया।', 403);
  }
}

async function requestWhatsappOtp(request, response) {
  checkSameOrigin(request);
  const input = await readJson(request);
  const mobile = normalizeIndianMobile(input.mobile || input.whatsapp);
  const phoneHash = lookupMobile(mobile);

  if (!allowRate(`otp-wa:${phoneHash}`, 6, 60 * 60_000)) {
    throw httpError('बहुत अधिक OTP अनुरोध हुए; कृपया 1 मिनट बाद फिर कोशिश करें।', 429);
  }

  const userId = mobile.slice(-10);
  const existing = await db.query('SELECT 1 FROM users WHERE lower(username) = lower($1) OR phone_lookup_hash = $2', [userId, phoneHash]);
  if (existing.rowCount) {
    throw httpError('यह WhatsApp नंबर (User ID: ' + userId + ') पहले से रजिस्टर्ड है। कृपया लॉगिन करें या दूसरा नंबर प्रयोग करें।', 409);
  }

  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const saved = await db.query(
    `INSERT INTO otp_challenges (phone_lookup_hash, otp_hash, purpose, expires_at, attempts, sent_at, consumed_at)
     VALUES ($1, $2, 'signup_whatsapp', now() + interval '5 minutes', 0, now(), NULL)
     ON CONFLICT (phone_lookup_hash) DO UPDATE SET
       otp_hash = EXCLUDED.otp_hash, purpose = 'signup_whatsapp', expires_at = EXCLUDED.expires_at, attempts = 0,
       sent_at = now(), consumed_at = NULL
     WHERE otp_challenges.sent_at < now() - interval '30 seconds'
     RETURNING phone_lookup_hash`,
    [phoneHash, otpDigest(phoneHash, otp, 'signup_whatsapp')],
  );
  if (!saved.rowCount) {
    throw httpError('OTP दोबारा भेजने के लिए 30 सेकंड प्रतीक्षा करें।', 429);
  }

  const waMsg = `Exchange Portal Verification OTP: ${otp}\n\nYour WhatsApp OTP for new account registration is ${otp}. Valid for 5 minutes. Do not share with anyone.`;
  const waResult = await sendWhatsappNotification({
    db,
    decryptServiceConfig,
    toNumber: mobile,
    message: waMsg,
  });

  sendJson(response, 200, {
    ok: true,
    message: waResult.sent
      ? 'WhatsApp पर OTP सफलतापूर्वक भेज दिया गया है।'
      : 'WhatsApp OTP जारी हुआ। (विकास परीक्षण OTP: ' + otp + ')',
    developmentOtp: otp,
    whatsappSent: waResult.sent,
  });
}

// Alias requestOtp to requestWhatsappOtp for backward compatibility
const requestOtp = requestWhatsappOtp;

async function requestEmailOtp(request, response) {
  checkSameOrigin(request);
  const input = await readJson(request);
  const email = String(input.email || '').trim().toLowerCase();
  const mobileInput = input.mobile || input.whatsapp;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError('सही ईमेल आईडी दर्ज करें।', 400);
  }

  const emailHash = lookupEmail(email);

  if (!allowRate(`otp-email:${emailHash}`, 6, 60 * 60_000)) {
    throw httpError('बहुत अधिक Email OTP अनुरोध हुए; कृपया 1 मिनट बाद फिर कोशिश करें।', 429);
  }

  const existing = await db.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing.rowCount) {
    throw httpError('यह ईमेल आईडी पहले से किसी खाते से जुड़ी हुई है।', 409);
  }

  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const saved = await db.query(
    `INSERT INTO otp_challenges (phone_lookup_hash, otp_hash, purpose, expires_at, attempts, sent_at, consumed_at)
     VALUES ($1, $2, 'signup_email', now() + interval '5 minutes', 0, now(), NULL)
     ON CONFLICT (phone_lookup_hash) DO UPDATE SET
       otp_hash = EXCLUDED.otp_hash, purpose = 'signup_email', expires_at = EXCLUDED.expires_at, attempts = 0,
       sent_at = now(), consumed_at = NULL
     WHERE otp_challenges.sent_at < now() - interval '30 seconds'
     RETURNING phone_lookup_hash`,
    [emailHash, otpDigest(emailHash, otp, 'signup_email')],
  );
  if (!saved.rowCount) {
    throw httpError('OTP दोबारा भेजने के लिए 30 सेकंड प्रतीक्षा करें।', 429);
  }

  // Send Email OTP to user's WhatsApp number as requested
  let waSent = false;
  if (mobileInput) {
    try {
      const normalizedMobile = normalizeIndianMobile(mobileInput);
      const waMsg = `Exchange Portal Email Verification OTP: ${otp}\n(For Email: ${email})\n\nयह OTP 5 मिनट के लिए मान्य है।`;
      const waRes = await sendWhatsappNotification({
        db,
        decryptServiceConfig,
        toNumber: normalizedMobile,
        message: waMsg,
      });
      waSent = waRes.sent;
    } catch (waErr) {
      console.warn('Failed to send email OTP via WhatsApp:', waErr.message);
    }
  }

  // Also send to Email inbox if SMTP is configured
  let emailSent = false;
  try {
    const emailRes = await sendEmailNotification({
      db,
      decryptServiceConfig,
      toEmail: email,
      subject: '[Exchange Portal] Email Verification OTP',
      text: `Hello,\n\nYour Email verification OTP for Exchange Portal is: ${otp}\nValid for 5 minutes.\n\nRegards,\nExchange Portal Admin`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1e3a8a; margin-top: 0;">Exchange Portal</h2>
          <p>Hello,</p>
          <p>Your Email verification OTP for registration is:</p>
          <div style="background: #eff6ff; border: 1px dashed #3b82f6; padding: 12px; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; color: #1e3a8a; border-radius: 6px; margin: 16px 0;">
            ${otp}
          </div>
          <p style="font-size: 13px; color: #64748b;">This OTP is valid for 5 minutes. Do not share it with anyone.</p>
        </div>
      `,
    });
    emailSent = emailRes.sent;
  } catch (mailErr) {
    console.warn('Failed to send OTP via SMTP:', mailErr.message);
  }

  sendJson(response, 200, {
    ok: true,
    message: waSent
      ? 'Email OTP आपके WhatsApp नंबर पर भेज दिया गया है।'
      : (emailSent ? 'Email OTP आपके ईमेल पर भेज दिया गया है।' : 'Email OTP जारी हुआ। (विकास परीक्षण OTP: ' + otp + ')'),
    developmentOtp: otp,
    whatsappSent: waSent,
    emailSent,
  });
}

async function requestPasswordResetOtp(request, response) {
  checkSameOrigin(request);
  const address = clientAddress(request);
  if (!allowRate(`reset-otp:${address}`, 5, 60 * 60_000)) throw httpError('बहुत अधिक OTP अनुरोध हुए; बाद में फिर कोशिश करें।', 429);

  const input = await readJson(request);
  const mobile = normalizeIndianMobile(input.mobile);
  const phoneHash = lookupMobile(mobile);
  const existing = await db.query("SELECT 1 FROM users WHERE phone_lookup_hash = $1 AND role = 'user' AND status = 'active'", [phoneHash]);
  if (!existing.rowCount) {
    sendJson(response, 200, { message: 'यदि इस मोबाइल पर सक्रिय खाता है, तो OTP जारी किया गया है।' });
    return;
  }

  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const saved = await db.query(
    `INSERT INTO otp_challenges (phone_lookup_hash, otp_hash, purpose, expires_at, attempts, sent_at, consumed_at)
     VALUES ($1, $2, 'password_reset', now() + interval '5 minutes', 0, now(), NULL)
     ON CONFLICT (phone_lookup_hash) DO UPDATE SET
       otp_hash = EXCLUDED.otp_hash, purpose = 'password_reset', expires_at = EXCLUDED.expires_at,
       attempts = 0, sent_at = now(), consumed_at = NULL
     WHERE otp_challenges.sent_at < now() - interval '60 seconds'
     RETURNING phone_lookup_hash`,
    [phoneHash, otpDigest(phoneHash, otp, 'password_reset')],
  );
  if (!saved.rowCount) throw httpError('इस नंबर पर OTP भेजने के लिए 60 सेकंड प्रतीक्षा करें।', 429);

  // Send Password Reset OTP on WhatsApp
  const waMsg = `Exchange Portal Password Reset OTP: ${otp}\n\nयह OTP 5 मिनट के लिए मान्य है। किसी के साथ शेयर न करें।`;
  await sendWhatsappNotification({
    db,
    decryptServiceConfig,
    toNumber: mobile,
    message: waMsg,
  });

  sendJson(response, 200, {
    message: 'यदि इस मोबाइल पर सक्रिय खाता है, तो WhatsApp पर OTP भेजा गया है।',
    developmentOtp: otp,
  });
}

async function resetPassword(request, response) {
  checkSameOrigin(request);
  const input = await readJson(request);
  const mobile = normalizeIndianMobile(input.mobile);
  const phoneHash = lookupMobile(mobile);
  const otp = String(input.otp || '');
  const password = String(input.password || '');
  if (!/^\d{6}$/.test(otp) || !/^\d{6}$/.test(password)) {
    throw httpError('OTP और नया पासवर्ड, दोनों ठीक छह अंकों के होने चाहिए।', 400);
  }
  const address = clientAddress(request);
  if (!allowRate(`reset:${address}:${phoneHash}`, 10, 15 * 60_000)) throw httpError('बहुत अधिक रीसेट प्रयास हुए; 15 मिनट बाद फिर कोशिश करें।', 429);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const challenge = await client.query(
      `SELECT otp_hash, purpose, expires_at, attempts, consumed_at FROM otp_challenges
       WHERE phone_lookup_hash = $1 FOR UPDATE`,
      [phoneHash],
    );
    const row = challenge.rows[0];
    if (!row || row.purpose !== 'password_reset' || row.consumed_at || new Date(row.expires_at) <= new Date() || row.attempts >= 5) {
      throw httpError('OTP गलत है या उसकी समय-सीमा समाप्त हो गई है।', 400);
    }
    if (!constantTimeEqual(row.otp_hash, otpDigest(phoneHash, otp, 'password_reset'))) {
      await client.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE phone_lookup_hash = $1', [phoneHash]);
      await client.query('COMMIT');
      throw httpError('OTP गलत है या उसकी समय-सीमा समाप्त हो गई है।', 400);
    }

    const account = await client.query("SELECT id FROM users WHERE phone_lookup_hash = $1 AND role = 'user' AND status = 'active' FOR UPDATE", [phoneHash]);
    if (!account.rowCount) throw httpError('OTP गलत है या उसकी समय-सीमा समाप्त हो गई है।', 400);
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, account.rows[0].id]);
    await client.query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [account.rows[0].id]);
    await client.query('UPDATE otp_challenges SET consumed_at = now() WHERE phone_lookup_hash = $1', [phoneHash]);
    await client.query('COMMIT');
    sendJson(response, 200, { message: 'पासवर्ड बदल गया है। अब नए छह अंकों के पासवर्ड से लॉगिन करें।' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function registerUser(request, response) {
  checkSameOrigin(request);
  if (!allowRate(`signup:${clientAddress(request)}`, 15, 60 * 60_000)) throw httpError('बहुत अधिक पंजीकरण प्रयास हुए; बाद में फिर कोशिश करें।', 429);

  const input = await readJson(request);
  const businessName = String(input.businessName || input.name || '').trim();
  if (businessName.length < 2 || businessName.length > 100) throw httpError('Business Name / Full Name 2 से 100 अक्षरों के बीच होना चाहिए।', 400);

  const mobile = normalizeIndianMobile(input.mobile || input.whatsapp);
  const phoneHash = lookupMobile(mobile);
  const email = String(input.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError('सही ईमेल पता दर्ज करें।', 400);
  }
  const emailHash = lookupEmail(email);

  const waOtp = String(input.whatsappOtp || input.otp || '').trim();
  const emailOtp = String(input.emailOtp || input.whatsappOtp || input.otp || '').trim();

  if (!/^\d{6}$/.test(waOtp)) throw httpError('WhatsApp का 6-अंकों का OTP दर्ज करें।', 400);
  if (!/^\d{6}$/.test(emailOtp)) throw httpError('Email का 6-अंकों का OTP दर्ज करें।', 400);

  const client = await db.connect();
  let credentials;
  try {
    await client.query('BEGIN');

    // 1. Verify WhatsApp OTP
    const waChallenge = await client.query(
      `SELECT otp_hash, purpose, expires_at, attempts, consumed_at FROM otp_challenges
       WHERE phone_lookup_hash = $1 FOR UPDATE`,
      [phoneHash],
    );
    const waRow = waChallenge.rows[0];
    if (!waRow || !['signup_whatsapp', 'signup'].includes(waRow.purpose) || waRow.consumed_at || new Date(waRow.expires_at) <= new Date()) {
      throw httpError('WhatsApp OTP की समय-सीमा समाप्त है; नया OTP लें।', 400);
    }
    if (waRow.attempts >= 5) throw httpError('WhatsApp OTP प्रयास सीमा पूरी हुई; नया OTP लें।', 429);
    if (!constantTimeEqual(waRow.otp_hash, otpDigest(phoneHash, waOtp, waRow.purpose))) {
      await client.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE phone_lookup_hash = $1', [phoneHash]);
      await client.query('COMMIT');
      throw httpError('WhatsApp OTP सही नहीं है।', 400);
    }

    // 2. Verify Email OTP
    const emailChallenge = await client.query(
      `SELECT otp_hash, purpose, expires_at, attempts, consumed_at FROM otp_challenges
       WHERE phone_lookup_hash = $1 FOR UPDATE`,
      [emailHash],
    );
    const emailRow = emailChallenge.rows[0];
    if (!emailRow || emailRow.purpose !== 'signup_email' || emailRow.consumed_at || new Date(emailRow.expires_at) <= new Date()) {
      throw httpError('Email OTP की समय-सीमा समाप्त है; नया OTP भेजें।', 400);
    }
    if (emailRow.attempts >= 5) throw httpError('Email OTP प्रयास सीमा पूरी हुई; नया OTP लें।', 429);
    if (!constantTimeEqual(emailRow.otp_hash, otpDigest(emailHash, emailOtp, 'signup_email'))) {
      await client.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE phone_lookup_hash = $1', [emailHash]);
      await client.query('COMMIT');
      throw httpError('Email OTP सही नहीं है।', 400);
    }

    // 3. Duplicate checks
    const userId = mobile.slice(-10);
    const existingPhone = await client.query('SELECT 1 FROM users WHERE lower(username) = lower($1) OR phone_lookup_hash = $2', [userId, phoneHash]);
    if (existingPhone.rowCount) throw httpError('यह WhatsApp नंबर (User ID: ' + userId + ') पहले से रजिस्टर्ड है। कृपया लॉगिन करें।', 409);

    const existingEmail = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]);
    if (existingEmail.rowCount) throw httpError('यह ईमेल आईडी पहले से किसी खाते से जुड़ी हुई है।', 409);
    const password = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    const created = await client.query(
      `INSERT INTO users (username, name, business_name, email, phone_ciphertext, phone_lookup_hash, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'user', 'active') RETURNING id`,
      [userId, businessName, businessName, email, encryptMobile(mobile), phoneHash, passwordHash],
    );

    await client.query('INSERT INTO wallets (user_id, currency) VALUES ($1, \'INR\')', [created.rows[0].id]);
    await client.query('UPDATE otp_challenges SET consumed_at = now() WHERE phone_lookup_hash IN ($1, $2)', [phoneHash, emailHash]);
    await client.query('COMMIT');
    credentials = { userId, password, businessName, email, mobile };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  // Send Welcome Message via WhatsApp & Email
  const requestHost = request.headers['x-forwarded-host'] || request.headers.host || 'exchange.easyrechargesolution.com';
  const requestProto = request.headers['x-forwarded-proto'] || (IS_PRODUCTION ? 'https' : 'http');
  const loginUrl = `${requestProto}://${requestHost}/admin/login`;

  try {
    const welcomeWaMsg =
      `🎉 *Welcome to Exchange Portal!*\n\n` +
      `आपका खाता सफलतापूर्वक बन गया है।\n\n` +
      `🏢 *Business:* ${credentials.businessName}\n` +
      `👤 *User ID:* ${credentials.userId}\n` +
      `🔑 *Password:* ${credentials.password}\n\n` +
      `🌐 *Login URL:* ${loginUrl}\n\n` +
      `कृपया अपना पासवर्ड सुरक्षित रखें।`;

    await sendWhatsappNotification({
      db,
      decryptServiceConfig,
      toNumber: credentials.mobile,
      message: welcomeWaMsg,
    });
  } catch (waErr) {
    console.warn('Welcome WhatsApp notification error:', waErr.message);
  }

  try {
    await sendEmailNotification({
      db,
      decryptServiceConfig,
      toEmail: credentials.email,
      subject: '🎉 Welcome to Exchange Portal - Registration Details',
      text: `Hello ${credentials.businessName},\n\nWelcome to Exchange Portal!\n\nYour account has been registered successfully.\n\nUser ID: ${credentials.userId}\nPassword: ${credentials.password}\nLogin: ${loginUrl}\n\nRegards,\nExchange Portal Admin`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
          <div style="background: #1e3a8a; color: #ffffff; padding: 20px 24px;">
            <h2 style="margin: 0; font-size: 22px;">Exchange Portal</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #bfdbfe;">Registration Successful</p>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 15px; color: #1e293b; margin-top: 0;">Hello <strong>${credentials.businessName}</strong>,</p>
            <p style="color: #334155;">Your Exchange Portal account has been created. Here are your login credentials:</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr><td style="padding: 6px 0; color: #64748b; width: 130px;"><strong>User ID (Mobile):</strong></td><td style="color: #0f172a; font-weight: bold; font-family: monospace; font-size: 16px;">${credentials.userId}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;"><strong>Password:</strong></td><td style="color: #0f172a; font-weight: bold; font-family: monospace; font-size: 16px;">${credentials.password}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;"><strong>Business Name:</strong></td><td style="color: #0f172a;">${credentials.businessName}</td></tr>
              </table>
            </div>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${loginUrl}" style="background: #1e3a8a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Login to Your Account</a>
            </div>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Please keep your password confidential.</p>
          </div>
        </div>
      `,
    });
  } catch (emailErr) {
    console.warn('Welcome Email notification error:', emailErr.message);
  }

  sendJson(response, 201, {
    ok: true,
    message: 'खाता सफलतापूर्वक बन गया! आपकी यूजर आईडी और पासवर्ड आपके WhatsApp और Email पर भेज दिए गए हैं।',
    userId: credentials.userId,
    redirect: '/admin/login?userId=' + encodeURIComponent(credentials.userId),
  });
}

function readSessionToken(request) {
  const cookieHeader = String(request.headers.cookie || '');
  const entry = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return entry ? decodeURIComponent(entry.slice(SESSION_COOKIE.length + 1)) : null;
}

async function getSession(request) {
  const token = readSessionToken(request);
  if (!token || token.length > 128) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest();
  const result = await db.query(
    `SELECT u.id, u.username, u.name, u.role FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active' AND u.deleted_at IS NULL`,
    [tokenHash],
  );
  return result.rows[0] || null;
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${IS_PRODUCTION ? '; Secure' : ''}`;
}

async function loginUser(request, response) {
  checkSameOrigin(request);
  const input = await readJson(request);
  const userId = String(input.userId || '').trim();
  const password = String(input.password || '');
  const address = clientAddress(request);
  const rateKey = `login:${address}:${userId.toLowerCase().slice(0, 80)}`;
  if (!allowRate(`login-ip:${address}`, 30, 15 * 60_000) || !allowRate(rateKey, 10, 15 * 60_000)) {
    throw httpError('बहुत अधिक लॉगिन प्रयास हुए; 15 मिनट बाद फिर कोशिश करें।', 429);
  }
  if (userId.length > 80 || password.length > 256) throw httpError('यूज़र आईडी या पासवर्ड सही नहीं है।', 401);

  const result = await db.query(
    'SELECT id, username, name, role, password_hash FROM users WHERE lower(username) = lower($1) AND status = \'active\' AND deleted_at IS NULL',
    [userId],
  );
  const user = result.rows[0];
  const passwordMatches = user
    ? await argon2.verify(user.password_hash, password).catch(() => false)
    : await argon2.hash(password || 'invalid-password', { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 }).then(() => false);
  if (!user || !passwordMatches) throw httpError('यूज़र आईडी या पासवर्ड सही नहीं है।', 401);

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest();
  await db.query(
    'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval \'12 hours\')',
    [user.id, tokenHash],
  );
  sendJson(response, 200, {
    message: 'लॉगिन सफल।',
    redirect: user.role === 'admin' ? '/admin/' : '/dashboard',
    user: { userId: user.username, name: user.name, role: user.role },
  }, { 'set-cookie': sessionCookie(token, SESSION_DURATION_SECONDS) });
}

async function logoutUser(request, response) {
  checkSameOrigin(request);
  const token = readSessionToken(request);
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest();
    await db.query('UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash]);
  }
  sendJson(response, 200, { message: 'लॉगआउट हो गया।' }, { 'set-cookie': sessionCookie('', 0) });
}

const { USER_PANEL_PAGES } = require('./config/user-panel-menu');

function formatMinorUnits(value) {
  const minor = BigInt(value);
  return (minor / 100n).toString() + '.' + String(minor % 100n).padStart(2, '0');
}

function encryptSellerApiConfig(config) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('seller-api-config'), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptSellerApiConfig(data) {
  const bytes = Buffer.from(data);
  if (bytes.length < 29) throw new Error('Stored API settings are invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('seller-api-config'), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}

function encryptServiceConfig(config) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('admin-service-settings'), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptServiceConfig(data) {
  const bytes = Buffer.from(data);
  if (bytes.length < 29) throw new Error('Stored service settings are invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('admin-service-settings'), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}

async function quoteTransactionMargin(request, response) {
  checkSameOrigin(request);
  const user = await getSession(request);
  if (!user) throw httpError('लॉगिन आवश्यक है।', 401);
  if (user.role !== 'user') throw httpError('यह सुविधा केवल यूज़र के लिए है।', 403);
  if (!allowRate(`margin-quote:${user.id}`, 60, 60 * 60_000)) throw httpError('बहुत सारे अनुरोध हुए; थोड़ी देर बाद फिर कोशिश करें।', 429);
  const input = await readJson(request);
  const quote = await calculateTransactionMargin(db, user.id, input);
  sendJson(response, 200, quote);
}

async function createFundRequest(request, response) {
  checkSameOrigin(request);
  const user = await getSession(request);
  if (!user) throw httpError('à¤²à¥‰à¤—à¤¿à¤¨ à¤†à¤µà¤¶à¥à¤¯à¤• à¤¹à¥ˆà¥¤', 401);
  if (user.role !== 'user') throw httpError('à¤¯à¤¹ à¤•à¤¾à¤® à¤•à¥‡à¤µà¤² user account à¤•à¤° à¤¸à¤•à¤¤à¤¾ à¤¹à¥ˆà¥¤', 403);
  if (!allowRate(`fund-request:${user.id}`, 10, 60 * 60_000)) throw httpError('à¤¬à¤¹à¥à¤¤ à¤¸à¤¾à¤°à¥‡ request à¤¹à¥‹ à¤—à¤; à¤à¤• à¤˜à¤‚à¤Ÿà¥‡ à¤¬à¤¾à¤¦ à¤«à¤¿à¤° à¤•à¥‹à¤¶à¤¿à¤¶ à¤•à¤°à¥‡à¤‚à¥¤', 429);
  const input = await readJson(request);
  const amount = String(input.amount || '').trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(amount)) throw httpError('à¤°à¤¾à¤¶à¤¿ 0.01 à¤¸à¥‡ 10,000,000 à¤°à¥‚à¤ªà¤¯à¥‡ à¤•à¥‡ à¤¬à¥€à¤š à¤¸à¤¹à¥€ à¤°à¥‚à¤ª à¤®à¥‡à¤‚ à¤²à¤¿à¤–à¥‡à¤‚à¥¤', 400);
  const [whole, fraction = ''] = amount.split('.');
  const amountMinor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amountMinor < 1n || amountMinor > 1_000_000_000n) throw httpError('à¤°à¤¾à¤¶à¤¿ 0.01 à¤¸à¥‡ 10,000,000 à¤°à¥‚à¤ªà¤¯à¥‡ à¤•à¥‡ à¤¬à¥€à¤š à¤¹à¥‹à¤¨à¥€ à¤šà¤¾à¤¹à¤¿à¤à¥¤', 400);
  if (input.bankCode !== 'axis') throw httpError('à¤¬à¥ˆà¤‚à¤• à¤šà¥à¤¨à¤¨à¤¾ à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤', 400);
  const paymentModes = ['Bank Transfer', 'UPI', 'Cash Deposit'];
  if (!paymentModes.includes(input.paymentMode)) throw httpError('à¤­à¥à¤—à¤¤à¤¾à¤¨ à¤¤à¤°à¥€à¤•à¤¾ à¤šà¥à¤¨à¤¨à¤¾ à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤', 400);
  if (input.walletType !== 'Prepaid') throw httpError('à¤…à¤­à¥€ à¤•à¥‡à¤µà¤² Prepaid wallet à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¹à¥ˆà¥¤', 400);
  const accountInput = String(input.accountNumber || '').trim();
  const accountNumber = accountInput ? accountInput.replace(/[\s-]/g, '').toUpperCase() : '';
  if (accountNumber && !/^[A-Z0-9]{5,34}$/.test(accountNumber)) throw httpError('Depositor account number à¤•à¤¾ à¤°à¥‚à¤ª à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤', 400);
  const transactionInput = String(input.transactionId || '').trim();
  const transactionId = transactionInput ? transactionInput.toUpperCase() : '';
  if (transactionId && !/^[A-Z0-9/._-]{3,80}$/.test(transactionId)) throw httpError('Transaction ID à¤•à¤¾ à¤°à¥‚à¤ª à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤', 400);

  let proofMime = null;
  let proofData = null;
  if (input.proof !== undefined && input.proof !== null) {
    const validMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (!input.proof || typeof input.proof !== 'object' || !validMimes.has(input.proof.mime) || typeof input.proof.base64 !== 'string' || input.proof.base64.length > 700_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.proof.base64)) {
      throw httpError('à¤‡à¤®à¥‡à¤œ à¤«à¤¼à¤¾à¤‡à¤² à¤•à¤¾ à¤°à¥‚à¤ª à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤', 400);
    }
    proofData = Buffer.from(input.proof.base64, 'base64');
    if (!proofData.length || proofData.length > 512 * 1024 || proofData.toString('base64') !== input.proof.base64) throw httpError('à¤‡à¤®à¥‡à¤œ 512 KB à¤¸à¥‡ à¤›à¥‹à¤Ÿà¥€ à¤”à¤° à¤¸à¤¹à¥€ à¤¹à¥‹à¤¨à¥€ à¤šà¤¾à¤¹à¤¿à¤à¥¤', 400);
    const signatures = {
      'image/png': (data) => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'image/jpeg': (data) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
      'image/webp': (data) => data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP',
      'image/gif': (data) => data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6)),
    };
    if (!signatures[input.proof.mime](proofData)) throw httpError('à¤‡à¤®à¥‡à¤œ à¤•à¤¾ à¤ªà¥à¤°à¤•à¤¾à¤° à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤', 400);
    proofMime = input.proof.mime;
  }

  const saved = await db.query(
    `INSERT INTO wallet_fund_requests
       (user_id, amount_minor, bank_code, payment_mode, wallet_type, proof_mime, proof_data,
        source_account_ciphertext, source_account_hash, transaction_id_ciphertext, transaction_id_hash)
     VALUES ($1, $2, 'axis', $3, 'Prepaid', $4, $5, $6, $7, $8, $9) RETURNING id, status, created_at`,
    [
      user.id, amountMinor.toString(), input.paymentMode, proofMime, proofData ? encryptFundProof(proofData) : null,
      accountNumber ? encryptFundField(accountNumber, 'account') : null,
      accountNumber ? fundFieldHash('account', accountNumber) : null,
      transactionId ? encryptFundField(transactionId, 'transaction') : null,
      transactionId ? fundFieldHash('transaction', transactionId) : null,
    ],
  );
  sendJson(response, 201, { requestId: saved.rows[0].id, status: saved.rows[0].status, amount: formatMinorUnits(amountMinor) });
}

async function decideFundRequest(request, response, requestId) {
  checkSameOrigin(request);
  const admin = await getSession(request);
  if (!admin) throw httpError('à¤²à¥‰à¤—à¤¿à¤¨ à¤†à¤µà¤¶à¥à¤¯à¤• à¤¹à¥ˆà¥¤', 401);
  if (admin.role !== 'admin') throw httpError('à¤•à¥‡à¤µà¤² admin à¤¯à¤¹ à¤•à¤¾à¤® à¤•à¤° à¤¸à¤•à¤¤à¤¾ à¤¹à¥ˆà¥¤', 403);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw httpError('à¤°à¤¿à¤•à¥‰à¤°à¥à¤¡ ID à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤', 400);
  const input = await readJson(request);
  if (!['approve', 'reject'].includes(input.action)) throw httpError('à¤•à¤¾à¤°à¥à¤°à¤µà¤¾à¤ˆ à¤šà¥à¤¨à¤¨à¤¾ à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤', 400);
  const note = String(input.note || '').trim();
  if (note.length > 500) throw httpError('Admin note 500 à¤…à¤•à¥à¤·à¤° à¤¤à¤• à¤°à¤–à¥‡à¤‚à¥¤', 400);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT * FROM wallet_fund_requests WHERE id = $1 FOR UPDATE', [requestId]);
    if (!locked.rowCount) throw httpError('Fund request à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¥€à¥¤', 404);
    const fundRequest = locked.rows[0];
    if (fundRequest.status !== 'pending') throw httpError('à¤‡à¤¸ request à¤ªà¤° à¤ªà¤¹à¤²à¥‡ à¤¹à¥€ à¤«à¥ˆà¤¸à¤²à¤¾ à¤¹à¥‹ à¤šà¥à¤•à¤¾ à¤¹à¥ˆà¥¤', 409);

    if (input.action === 'approve') {
      await client.query(
        `INSERT INTO wallets (user_id, currency) VALUES ($1, 'INR')
         ON CONFLICT (user_id, currency) DO NOTHING`,
        [fundRequest.user_id],
      );
      const wallet = await client.query("SELECT id FROM wallets WHERE user_id = $1 AND currency = 'INR' FOR UPDATE", [fundRequest.user_id]);
      if (!wallet.rowCount) throw httpError('User wallet à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤', 409);
      await client.query("UPDATE wallets SET balance_minor = balance_minor + $1::bigint, updated_at = now() WHERE id = $2", [fundRequest.amount_minor, wallet.rows[0].id]);
      await client.query(
        `INSERT INTO wallet_entries (wallet_id, user_id, amount_minor, entry_type, reference_type, reference_id, idempotency_key)
         VALUES ($1, $2, $3, 'credit', 'fund_request', $4, $5)`,
        [wallet.rows[0].id, fundRequest.user_id, fundRequest.amount_minor, fundRequest.id, `fund-request:${fundRequest.id}`],
      );
    }
    const newStatus = input.action === 'approve' ? 'approved' : 'rejected';
    await client.query('UPDATE wallet_fund_requests SET status = $1, reviewed_by = $2, review_note = $3, reviewed_at = now() WHERE id = $4', [newStatus, admin.id, note || null, fundRequest.id]);
    await client.query(
      'INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
      [admin.id, `fund_request_${newStatus}`, 'wallet_fund_request', fundRequest.id, { amountMinor: fundRequest.amount_minor, userId: fundRequest.user_id }],
    );
    await client.query('COMMIT');
    sendJson(response, 200, { status: newStatus });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function createOperator(request, response) {
  checkSameOrigin(request);
  const admin = await getSession(request);
  if (!admin) throw httpError('à¤²à¥‰à¤—à¤¿à¤¨ à¤†à¤µà¤¶à¥à¤¯à¤• à¤¹à¥ˆà¥¤', 401);
  if (admin.role !== 'admin') throw httpError('à¤•à¥‡à¤µà¤² admin operator à¤¬à¤¨à¤¾ à¤¸à¤•à¤¤à¤¾ à¤¹à¥ˆà¥¤', 403);
  if (!allowRate(`operator-create:${admin.id}`, 30, 15 * 60_000)) throw httpError('à¤¬à¤¹à¥à¤¤ à¤¸à¤¾à¤°à¥‡ operator save à¤¹à¥‹à¤—à¤; à¤¬à¤¾à¤¦ à¤®à¥‡à¤‚ à¤•à¥‹à¤¶à¤¿à¤¶ à¤•à¤°à¥‡à¤‚à¥¤', 429);
  const input = await readJson(request);
  const operatorName = String(input.operatorName || '').trim();
  const serviceType = String(input.serviceType || '').trim();
  const operatorCode = String(input.operatorCode || '').trim().toUpperCase();
  const serviceTypes = ['Mobile Recharge', 'DTH', 'Postpaid', 'Electricity', 'Gas', 'Water', 'Broadband', 'Insurance', 'FASTag', 'Other'];
  if (operatorName.length < 2 || operatorName.length > 100) throw httpError('Operator Name 2 à¤¸à¥‡ 100 à¤…à¤•à¥à¤·à¤° à¤•à¤¾ à¤°à¤–à¥‡à¤‚à¥¤', 400);
  if (!serviceTypes.includes(serviceType)) throw httpError('Service Type à¤šà¥à¤¨à¤¨à¤¾ à¤†à¤µà¤¶à¥à¤¯à¤• à¤¹à¥ˆà¥¤', 400);
  if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(operatorCode)) throw httpError('Operator Code 2–40 letters, numbers, dot, underscore à¤¯à¤¾ hyphen à¤•à¤¾ à¤°à¤–à¥‡à¤‚à¥¤', 400);
  const moneyToMinor = (value, label, allowZero = false) => {
    const textValue = String(value ?? '').trim();
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(textValue)) throw httpError(`${label} à¤•à¤¾ amount à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤`, 400);
    const [whole, fraction = ''] = textValue.split('.');
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if ((!allowZero && minor < 1n) || minor > 10_000_000_000n) throw httpError(`${label} 0 à¤¸à¥‡ 100,000,000 à¤°à¥‚à¤ªà¤¯à¥‡ à¤•à¥‡ à¤¬à¥€à¤š à¤¹à¥‹à¥¤`, 400);
    return minor;
  };
  const minimumMinor = moneyToMinor(input.minimumAmount, 'Minimum Amount', true);
  const maximumMinor = moneyToMinor(input.maximumAmount, 'Maximum Amount');
  if (maximumMinor < minimumMinor) throw httpError('Maximum Amount, Minimum Amount à¤¸à¥‡ à¤•à¤® à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹à¤¨à¤¾ à¤šà¤¾à¤¹à¤¿à¤à¥¤', 400);
  const stopInput = String(input.stopAmounts || '').trim();
  const stopAmounts = stopInput ? stopInput.split(',').map((item) => moneyToMinor(item.trim(), 'Stop Amount')) : [];
  if (stopAmounts.length > 100) throw httpError('Stop Amounts à¤•à¥€ à¤¸à¤‚à¤–à¥à¤¯à¤¾ 100 à¤¸à¥‡ à¤•à¤® à¤°à¤–à¥‡à¤‚à¥¤', 400);
  let operatorNumberLength = null;
  if (input.operatorNumberLength !== undefined && String(input.operatorNumberLength).trim() !== '') {
    operatorNumberLength = Number(input.operatorNumberLength);
    if (!Number.isInteger(operatorNumberLength) || operatorNumberLength < 1 || operatorNumberLength > 30) throw httpError('Operator Number Length 1 à¤¸à¥‡ 30 à¤•à¥‡ à¤¬à¥€à¤š à¤•à¤¾ à¤°à¤–à¥‡à¤‚à¥¤', 400);
  }
  if (!Array.isArray(input.parameters) || input.parameters.length > 30) throw httpError('Bill Payment Parameters à¤•à¥€ à¤¸à¤‚à¤–à¥à¤¯à¤¾ 30 à¤¤à¤• à¤°à¤–à¥‡à¤‚à¥¤', 400);
  const parameterTypes = ['text', 'number', 'mobile', 'date', 'dropdown'];
  const keys = new Set();
  const parameters = input.parameters.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw httpError('Parameter row à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤', 400);
    const name = String(item.name || '').trim();
    const hint = String(item.hint || '').trim();
    const type = String(item.type || '').trim();
    const options = String(item.options || '').trim();
    const key = String(item.key || '').trim();
    if (!name.length || name.length > 80 || hint.length > 160 || options.length > 500 || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) || !parameterTypes.includes(type)) throw httpError('Bill Payment Parameter ka Name, Hint, Type, Option ya Key sahi karein.', 400);
    if (keys.has(key.toLowerCase())) throw httpError('Har parameter ka Key alag hona chahiye.', 400);
    keys.add(key.toLowerCase());
    if (type === 'dropdown' && !options) throw httpError('Dropdown parameter ke List / Option bharna zaroori hai.', 400);
    return { name, hint, type, options, key };
  });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const saved = await client.query(
      `INSERT INTO operator_definitions
       (operator_name, service_type, operator_code, minimum_amount_minor, maximum_amount_minor,
        stop_amounts_minor, operator_number_length, bill_payment_parameters, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::bigint[], $7, $8::jsonb, $9)
       RETURNING id, operator_name, operator_code, created_at`,
      [operatorName, serviceType, operatorCode, minimumMinor.toString(), maximumMinor.toString(), stopAmounts.map(String), operatorNumberLength, JSON.stringify(parameters), admin.id],
    );
    await client.query(
      'INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
      [admin.id, 'operator_created', 'operator_definition', saved.rows[0].id, { operatorCode, serviceType }],
    );
    await client.query('COMMIT');
    sendJson(response, 201, { id: saved.rows[0].id, operatorName: saved.rows[0].operator_name, operatorCode: saved.rows[0].operator_code });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') throw httpError('Is Operator Code ka record pehle se maujood hai.', 409);
    throw error;
  } finally {
    client.release();
  }
}

async function updateOperator(request, response, operatorId) {
  checkSameOrigin(request);
  const admin = await getSession(request);
  if (!admin) throw httpError('लॉगिन आवश्यक है।', 401);
  if (admin.role !== 'admin') throw httpError('केवल Admin ऑपरेटर बदल सकता है।', 403);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operatorId)) throw httpError('ऑपरेटर ID सही नहीं है।', 400);
  if (!allowRate(`operator-update:${admin.id}`, 30, 15 * 60_000)) throw httpError('बहुत सारे operator बदलाव हुए; बाद में प्रयास करें।', 429);
  const input = await readJson(request);
  const operatorName = String(input.operatorName || '').trim();
  const serviceType = String(input.serviceType || '').trim();
  const operatorCode = String(input.operatorCode || '').trim().toUpperCase();
  const serviceTypes = ['Mobile Recharge', 'DTH', 'Postpaid', 'Electricity', 'Gas', 'Water', 'Broadband', 'Insurance', 'FASTag', 'Other'];
  if (operatorName.length < 2 || operatorName.length > 100) throw httpError('Operator Name 2 से 100 अक्षर का रखें।', 400);
  if (!serviceTypes.includes(serviceType)) throw httpError('Service Type चुनना आवश्यक है।', 400);
  if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(operatorCode)) throw httpError('Operator Code 2–40 अक्षर, अंक, dot, underscore या hyphen का रखें।', 400);
  const moneyToMinor = (value, label, allowZero = false) => {
    const text = String(value ?? '').trim();
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw httpError(`${label} की राशि सही नहीं है।`, 400);
    const [whole, fraction = ''] = text.split('.');
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if ((!allowZero && minor < 1n) || minor > 10_000_000_000n) throw httpError(`${label} 0 से 100,000,000 रुपये की सीमा में रखें।`, 400);
    return minor;
  };
  const minimumMinor = moneyToMinor(input.minimumAmount, 'Minimum Amount', true);
  const maximumMinor = moneyToMinor(input.maximumAmount, 'Maximum Amount');
  if (maximumMinor < minimumMinor) throw httpError('Maximum Amount, Minimum Amount से कम नहीं हो सकता।', 400);
  const stopInput = String(input.stopAmounts || '').trim();
  const stopAmounts = stopInput ? stopInput.split(',').map((item) => moneyToMinor(item.trim(), 'Stop Amount')) : [];
  if (stopAmounts.length > 100) throw httpError('Stop Amounts की संख्या 100 से कम रखें।', 400);
  let numberLength = null;
  if (String(input.operatorNumberLength ?? '').trim()) {
    numberLength = Number(input.operatorNumberLength);
    if (!Number.isInteger(numberLength) || numberLength < 1 || numberLength > 30) throw httpError('Operator Number Length 1 से 30 के बीच रखें।', 400);
  }
  try {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE operator_definitions SET operator_name=$2, service_type=$3, operator_code=$4,
           minimum_amount_minor=$5, maximum_amount_minor=$6, stop_amounts_minor=$7::bigint[],
           operator_number_length=$8, updated_at=now()
         WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
        [operatorId, operatorName, serviceType, operatorCode, minimumMinor.toString(), maximumMinor.toString(), stopAmounts.map(String), numberLength],
      );
      if (!updated.rowCount) throw httpError('ऑपरेटर नहीं मिला।', 404);
      await client.query(
        'INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)',
        [admin.id, 'operator_updated', 'operator_definition', operatorId, { operatorCode, serviceType }],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') throw httpError('यह Operator Code पहले से मौजूद है।', 409);
      throw error;
    } finally { client.release(); }
  } catch (error) { throw error; }
  sendJson(response, 200, { message: 'ऑपरेटर अपडेट हो गया।' });
}

async function setOperatorStatus(request, response, operatorId) {
  checkSameOrigin(request);
  const admin = await getSession(request);
  if (!admin) throw httpError('लॉगिन आवश्यक है।', 401);
  if (admin.role !== 'admin') throw httpError('केवल Admin ऑपरेटर की स्थिति बदल सकता है।', 403);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operatorId)) throw httpError('ऑपरेटर ID सही नहीं है।', 400);
  const input = await readJson(request);
  if (!['active', 'inactive'].includes(input.status)) throw httpError('स्थिति Active या Inactive होनी चाहिए।', 400);
  if (!allowRate(`operator-status:${admin.id}`, 60, 15 * 60_000)) throw httpError('बहुत सारे operator बदलाव हुए; बाद में प्रयास करें।', 429);
  const result = await db.query('UPDATE operator_definitions SET status=$2, updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id, status', [operatorId, input.status]);
  if (!result.rowCount) throw httpError('ऑपरेटर नहीं मिला।', 404);
  await db.query(
    'INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)',
    [admin.id, `operator_${input.status}`, 'operator_definition', operatorId, {}],
  );
  sendJson(response, 200, { status: result.rows[0].status });
}

async function deleteOperator(request, response, operatorId) {
  checkSameOrigin(request);
  const admin = await getSession(request);
  if (!admin) throw httpError('लॉगिन आवश्यक है।', 401);
  if (admin.role !== 'admin') throw httpError('केवल Admin ऑपरेटर हटा सकता है।', 403);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operatorId)) throw httpError('ऑपरेटर ID सही नहीं है।', 400);
  await readJson(request);
  if (!allowRate(`operator-delete:${admin.id}`, 30, 15 * 60_000)) throw httpError('बहुत सारे operator बदलाव हुए; बाद में प्रयास करें।', 429);
  const result = await db.query(
    `UPDATE operator_definitions SET status='inactive', deleted_at=now(), updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL RETURNING id`, [operatorId],
  );
  if (!result.rowCount) throw httpError('ऑपरेटर नहीं मिला।', 404);
  await db.query(
    'INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)',
    [admin.id, 'operator_deleted', 'operator_definition', operatorId, {}],
  );
  sendJson(response, 200, { message: 'ऑपरेटर सूची से हटा दिया गया।' });
}

async function requireAdminAndUser(request, userId) {
  checkSameOrigin(request);
  const admin = await getSession(request);
  if (!admin) throw httpError('लॉगिन आवश्यक है।', 401);
  if (admin.role !== 'admin') throw httpError('यह सुविधा केवल Admin के लिए है।', 403);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) throw httpError('यूज़र ID सही नहीं है।', 400);
  return admin;
}

async function updateManagedUser(request, response, userId) {
  const admin = await requireAdminAndUser(request, userId);
  if (!allowRate(`admin-user-update:${admin.id}`, 40, 15 * 60_000)) throw httpError('बहुत सारे user बदलाव हुए; बाद में प्रयास करें।', 429);
  const input = await readJson(request);
  const name = String(input.name || '').trim();
  const mobile = normalizeIndianMobile(input.mobile);
  const emailInput = String(input.email || '').trim().toLowerCase();
  const email = emailInput || null;
  const address = String(input.address || '').trim();
  const parentInput = String(input.parentUser || '').trim();
  if (name.length < 2 || name.length > 80) throw httpError('नाम 2 से 80 अक्षर का रखें।', 400);
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw httpError('ईमेल पता सही दर्ज करें।', 400);
  if (address.length > 300) throw httpError('पता अधिकतम 300 अक्षरों का हो सकता है।', 400);
  if (parentInput.length > 80) throw httpError('Parent यूज़र आईडी अधिकतम 80 अक्षरों की हो सकती है।', 400);
  let parentId = null;
  if (parentInput) {
    const parent = await db.query(
      `SELECT id FROM users WHERE role='user' AND deleted_at IS NULL AND status='active'
       AND (lower(username)=lower($1) OR id::text=$1) LIMIT 1`, [parentInput],
    );
    if (!parent.rowCount) throw httpError('दिया गया Parent User ID नहीं मिला या सक्रिय नहीं है।', 400);
    parentId = parent.rows[0].id;
    if (parentId === userId) throw httpError('यूज़र को स्वयं का Parent नहीं बनाया जा सकता।', 400);
    const cycle = await db.query(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM users WHERE parent_user_id=$1
         UNION
         SELECT u.id FROM users u JOIN descendants d ON u.parent_user_id=d.id
       ) SELECT EXISTS(SELECT 1 FROM descendants WHERE id=$2) AS creates_cycle`,
      [userId, parentId],
    );
    if (cycle.rows[0].creates_cycle) throw httpError('इस Parent से user hierarchy में circular link बनेगा।', 400);
  }
  let result;
  try {
    result = await db.query(
      `UPDATE users SET name=$2, email=$3, phone_ciphertext=$4, phone_lookup_hash=$5,
         address=$6, parent_user_id=$7, updated_at=now()
       WHERE id=$1 AND role='user' AND deleted_at IS NULL RETURNING id`,
      [userId, name, email, encryptMobile(mobile), lookupMobile(mobile), address || null, parentId],
    );
  } catch (error) {
    if (error.code === '23505') throw httpError('यह मोबाइल या ईमेल दूसरे खाते में उपयोग हो रहा है।', 409);
    throw error;
  }
  if (!result.rowCount) throw httpError('यूज़र नहीं मिला।', 404);
  await db.query(
    'INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)',
    [admin.id, 'user_updated', 'user', userId, { emailChanged: true, mobileChanged: true, addressChanged: true, parentChanged: true }],
  ).catch(() => {});
  sendJson(response, 200, { message: 'यूज़र विवरण अपडेट हो गया।' });
}

async function changeManagedUserPassword(request, response, userId) {
  const admin = await requireAdminAndUser(request, userId);
  if (!allowRate(`admin-user-password:${admin.id}`, 20, 15 * 60_000)) throw httpError('बहुत सारे password बदलाव हुए; बाद में प्रयास करें।', 429);
  const input = await readJson(request);
  const password = String(input.password || '');
  if (!/^\d{6}$/.test(password)) throw httpError('पासवर्ड केवल छह अंकों का होना चाहिए।', 400);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query("UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1 AND role='user' AND deleted_at IS NULL RETURNING id", [userId, passwordHash]);
    if (!updated.rowCount) throw httpError('यूज़र नहीं मिला।', 404);
    await client.query('UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
    await client.query('INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)', [admin.id, 'user_password_changed', 'user', userId, {}]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
  sendJson(response, 200, { message: 'पासवर्ड बदल दिया गया और पुराने login sessions बंद कर दिए गए।' });
}

async function setManagedUserStatus(request, response, userId) {
  const admin = await requireAdminAndUser(request, userId);
  const input = await readJson(request);
  if (!['active', 'blocked', 'pending'].includes(input.status)) throw httpError('स्थिति Active, Inactive या Pending होनी चाहिए।', 400);
  if (!allowRate(`admin-user-status:${admin.id}`, 60, 15 * 60_000)) throw httpError('बहुत सारे user status बदलाव हुए; बाद में प्रयास करें।', 429);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query("UPDATE users SET status=$2, updated_at=now() WHERE id=$1 AND role='user' AND deleted_at IS NULL RETURNING id", [userId, input.status]);
    if (!updated.rowCount) throw httpError('यूज़र नहीं मिला।', 404);
    if (input.status !== 'active') await client.query('UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
    await client.query('INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)', [admin.id, `user_${input.status}`, 'user', userId, {}]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
  sendJson(response, 200, { status: input.status });
}

async function deleteManagedUser(request, response, userId) {
  const admin = await requireAdminAndUser(request, userId);
  await readJson(request);
  if (!allowRate(`admin-user-delete:${admin.id}`, 15, 15 * 60_000)) throw httpError('बहुत सारे user delete अनुरोध हुए; बाद में प्रयास करें।', 429);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query("UPDATE users SET status='blocked', deleted_at=now(), updated_at=now() WHERE id=$1 AND role='user' AND deleted_at IS NULL RETURNING id", [userId]);
    if (!updated.rowCount) throw httpError('यूज़र नहीं मिला।', 404);
    await client.query('UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
    await client.query('INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)', [admin.id, 'user_deleted', 'user', userId, { softDelete: true }]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
  sendJson(response, 200, { message: 'यूज़र account बंद करके सूची से छिपा दिया गया।' });
}

async function getManagedUserMargins(request, response, userId) {
  await requireAdminAndUser(request, userId);
  const userResult = await db.query("SELECT id FROM users WHERE id=$1 AND role='user' AND deleted_at IS NULL", [userId]);
  if (!userResult.rowCount) throw httpError('यूज़र नहीं मिला।', 404);
  const load = async (table) => {
    const result = await db.query(
      `SELECT o.operator_name, m.circle_name, m.commission_percent, m.is_active
       FROM ${table} m JOIN operator_definitions o ON o.id=m.operator_id
       WHERE m.user_id=$1 AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 100`, [userId],
    );
    return result.rows.map((row) => ({ operatorName: row.operator_name, circleName: row.circle_name, commissionPercent: String(row.commission_percent), active: row.is_active }));
  };
  sendJson(response, 200, { buyer: await load('buyer_margin_settings'), seller: await load('seller_margin_settings') });
}

async function sendFundRequestProof(request, response, requestId) {
  const admin = await getSession(request);
  if (!admin || admin.role !== 'admin') throw httpError('à¤•à¥‡à¤µà¤² admin à¤¯à¤¹ à¤«à¤¼à¤¾à¤‡à¤² à¤¦à¥‡à¤– à¤¸à¤•à¤¤à¤¾ à¤¹à¥ˆà¥¤', admin ? 403 : 401);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw httpError('à¤°à¤¿à¤•à¥‰à¤°à¥à¤¡ ID à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤', 400);
  const result = await db.query('SELECT proof_mime, proof_data FROM wallet_fund_requests WHERE id = $1', [requestId]);
  if (!result.rowCount || !result.rows[0].proof_data) throw httpError('à¤‡à¤®à¥‡à¤œ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¥€à¥¤', 404);
  let proofData;
  try {
    proofData = decryptFundProof(result.rows[0].proof_data);
  } catch {
    throw httpError('à¤ªà¥à¤°à¥‚à¤«à¤¼ decrypt à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¤¾à¥¤', 500);
  }
  response.writeHead(200, {
    'content-type': result.rows[0].proof_mime, 'content-length': proofData.length,
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-disposition': 'inline',
    'x-frame-options': 'DENY', 'content-security-policy': "default-src 'none'; frame-ancestors 'none';",
  });
  response.end(proofData);
}

const AUTH_CLIENT_JS = `
(() => {
  const byId = (id) => document.getElementById(id);
  const message = (text, isError = false) => {
    const target = byId('auth-message');
    if (!target) return;
    target.textContent = text;
    target.className = isError ? 'alert alert-danger mt-3' : 'alert alert-info mt-3';
  };
  const post = async (url, payload) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || body.message || 'अनुरोध पूरा नहीं हुआ।');
    return body;
  };

  const loginForm = byId('login-form');
  if (loginForm) {
    const userIdFromUrl = new URLSearchParams(location.search).get('userId');
    if (userIdFromUrl) byId('login-user-id').value = userIdFromUrl;
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const result = await post('/api/auth/login', {
          userId: byId('login-user-id').value,
          password: byId('login-password').value,
        });
        location.assign(result.redirect);
      } catch (error) {
        message(error.message, true);
      }
    });
  }

  const signupForm = byId('signup-form');
  if (signupForm) {
    // WhatsApp OTP button
    const btnSendWaOtp = byId('btn-send-wa-otp') || byId('send-otp');
    if (btnSendWaOtp) {
      btnSendWaOtp.addEventListener('click', async () => {
        const mobileEl = byId('signup-whatsapp') || byId('signup-mobile');
        const mobileVal = mobileEl ? mobileEl.value.trim() : '';
        if (!mobileVal || mobileVal.length < 10) {
          message('कृपया 10 अंकों का वैध WhatsApp नंबर दर्ज करें।', true);
          if (mobileEl) mobileEl.focus();
          return;
        }
        btnSendWaOtp.disabled = true;
        btnSendWaOtp.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Sending...';
        try {
          const result = await post('/api/auth/otp/whatsapp', { mobile: mobileVal });
          const waRow = byId('wa-otp-row') || byId('otp-step');
          if (waRow) {
            waRow.hidden = false;
            waRow.style.display = 'block';
          }
          const waOtpInput = byId('signup-wa-otp') || byId('signup-otp');
          if (waOtpInput) waOtpInput.focus();
          message(result.developmentOtp
            ? result.message + ' (Dev OTP: ' + result.developmentOtp + ')'
            : result.message);
          btnSendWaOtp.innerHTML = '<i class="fa fa-refresh mr-1"></i> Resend OTP';
        } catch (error) {
          message(error.message, true);
          btnSendWaOtp.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send OTP';
        } finally {
          btnSendWaOtp.disabled = false;
        }
      });
    }

    // Email OTP button
    const btnSendEmailOtp = byId('btn-send-email-otp');
    if (btnSendEmailOtp) {
      btnSendEmailOtp.addEventListener('click', async () => {
        const emailEl = byId('signup-email');
        const emailVal = emailEl ? emailEl.value.trim() : '';
        const mobileEl = byId('signup-whatsapp') || byId('signup-mobile');
        const mobileVal = mobileEl ? mobileEl.value.trim() : '';
        if (!emailVal || !emailVal.includes('@')) {
          message('कृपया सही ईमेल पता दर्ज करें।', true);
          if (emailEl) emailEl.focus();
          return;
        }
        btnSendEmailOtp.disabled = true;
        btnSendEmailOtp.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Sending...';
        try {
          const result = await post('/api/auth/otp/email', { email: emailVal, mobile: mobileVal });
          const emailRow = byId('email-otp-row');
          if (emailRow) {
            emailRow.hidden = false;
            emailRow.style.display = 'block';
          }
          const emailOtpInput = byId('signup-email-otp');
          if (emailOtpInput) emailOtpInput.focus();
          message(result.developmentOtp
            ? result.message + ' (Dev OTP: ' + result.developmentOtp + ')'
            : result.message);
          btnSendEmailOtp.innerHTML = '<i class="fa fa-refresh mr-1"></i> Resend OTP';
        } catch (error) {
          message(error.message, true);
          btnSendEmailOtp.innerHTML = '<i class="fa fa-paper-plane mr-1"></i> Send OTP';
        } finally {
          btnSendEmailOtp.disabled = false;
        }
      });
    }

    // Signup Submit
    signupForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitBtn = byId('btn-submit-signup') || signupForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Creating Account...';
      }

      const businessName = byId('signup-business-name') ? byId('signup-business-name').value.trim() : (byId('signup-name') ? byId('signup-name').value.trim() : '');
      const mobile = byId('signup-whatsapp') ? byId('signup-whatsapp').value.trim() : (byId('signup-mobile') ? byId('signup-mobile').value.trim() : '');
      const email = byId('signup-email') ? byId('signup-email').value.trim() : '';
      const whatsappOtp = byId('signup-wa-otp') ? byId('signup-wa-otp').value.trim() : (byId('signup-otp') ? byId('signup-otp').value.trim() : '');
      const emailOtp = byId('signup-email-otp') ? byId('signup-email-otp').value.trim() : whatsappOtp;

      try {
        const result = await post('/api/auth/signup', {
          businessName,
          name: businessName,
          mobile,
          email,
          whatsappOtp,
          emailOtp,
          otp: whatsappOtp,
        });
        signupForm.hidden = true;
        signupForm.style.display = 'none';
        const credentials = byId('signup-credentials');
        if (credentials) {
          credentials.hidden = false;
          credentials.style.display = 'block';
        }
        if (byId('created-user-id')) byId('created-user-id').textContent = result.userId;
        if (byId('created-password')) byId('created-password').textContent = result.password;
        if (byId('credentials-warning')) byId('credentials-warning').textContent = result.message;
        if (byId('created-login-link')) byId('created-login-link').href = '/admin/login?userId=' + encodeURIComponent(result.userId);
        message('खाता सफलतापूर्वक बनाया गया!', false);
      } catch (error) {
        message(error.message, true);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa fa-user-plus mr-1"></i> Verify &amp; Create Account';
        }
      }
    });
  }

  const resetOtpButton = byId('reset-send-otp');
  if (resetOtpButton) resetOtpButton.addEventListener('click', async () => {
    try {
      const result = await post('/api/auth/password-reset-otp', { mobile: byId('reset-mobile').value });
      byId('reset-otp-step').hidden = false;
      byId('reset-otp').focus();
      message(result.developmentOtp
        ? 'स्थानीय परीक्षण OTP: ' + result.developmentOtp + ' (यह उत्पादन में कभी नहीं दिखेगा)'
        : result.message);
    } catch (error) {
      message(error.message, true);
    }
  });

  const resetForm = byId('reset-password-form');
  if (resetForm) resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = byId('reset-password').value;
    if (password !== byId('reset-password-confirm').value) {
      message('दोनों पासवर्ड एक जैसे होने चाहिए।', true);
      return;
    }
    try {
      const result = await post('/api/auth/password-reset', {
        mobile: byId('reset-mobile').value,
        otp: byId('reset-otp').value,
        password,
      });
      resetForm.hidden = true;
      message(result.message);
    } catch (error) {
      message(error.message, true);
    }
  });

  document.querySelectorAll('a').forEach((anchor) => {
    if (anchor.textContent.trim().toLowerCase() === 'sign out') {
      anchor.id = 'logout-button';
      anchor.href = '/login';
    }
  });

  const logoutButton = byId('logout-button');
  if (logoutButton) logoutButton.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      await post('/api/auth/logout', {});
      location.assign('/login');
    } catch (error) {
      message(error.message, true);
    }
  });
})();
`;

// 3) रूट allow-list: व्यावसायिक काम के लिए नए handlers यहीं जोड़ें।
const routes = new Map([
  ['GET /health', async () => ({
    statusCode: 200,
    body: { status: 'ok', service: 'exchange', timestamp: new Date().toISOString(), uptime: Math.floor(process.uptime()) },
  })],
  ['GET /ping', async () => ({
    statusCode: 200,
    body: { status: 'pong', timestamp: new Date().toISOString() },
  })],
]);

// Auto Keep-Alive Pinger (Render Free Tier Sleep Prevention)
function startKeepAlivePinger() {
  const targetUrl = (process.env.PING_URL || process.env.RENDER_EXTERNAL_URL || 'https://exchange.easyrechargesolution.com').trim();
  if (!targetUrl || targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1')) return;

  const pingEndpoint = targetUrl.replace(/\/$/, '') + '/health';
  const INTERVAL_MS = 4 * 60 * 1000; // हर 4 मिनट में पिंग (Render 15 मिनट में सोता है)

  setInterval(() => {
    fetch(pingEndpoint)
      .then((res) => {
        if (res.ok) {
          // console.log(`[Keep-Alive] Pinged ${pingEndpoint} - HTTP ${res.status}`);
        }
      })
      .catch((err) => {
        console.warn(`[Keep-Alive Warning] Ping failed:`, err.message);
      });
  }, INTERVAL_MS).unref();
}
startKeepAlivePinger();

async function handleRequest(request, response) {
  const startedAt = Date.now();
  let statusCode = 500;
  let url;

  try {
    // गलत URL और असमर्थित HTTP method रोकें। URL query लॉग/उत्तर में नहीं जाता।
    url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.length > 2_048) {
      statusCode = 414;
      sendJson(response, statusCode, { error: 'URL बहुत लंबा है।' });
      return;
    }

    const callbackMatch = url.pathname.match(/^\/CallBack\/([0-9a-f-]{36})$/i);
    if (callbackMatch) {
      const apiId = callbackMatch[1];
      const clientIp = getClientIp(request);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      let postBody = {};
      if (request.method === 'POST') {
        try {
          postBody = await readJson(request);
        } catch {}
      }
      const incomingPayload = { ...queryParams, ...postBody };

      const row = await db.query(
        'SELECT id, name, callback_ip, config_ciphertext FROM seller_api_settings WHERE id = $1 AND deleted_at IS NULL',
        [apiId],
      );
      if (!row.rowCount) {
        sendJson(response, 404, { error: 'Callback API endpoint not found.' });
        statusCode = 404;
        return;
      }

      const allowedIp = (row.rows[0].callback_ip || '').trim();
      if (allowedIp && !allowedIp.split(',').map(s => s.trim()).includes(clientIp) && clientIp !== '127.0.0.1') {
        console.warn(`[CALLBACK WARNING] IP ${clientIp} not in whitelist (${allowedIp}) for API ${row.rows[0].name}`);
      }

      console.log(`[CALLBACK RECEIVED] API ${row.rows[0].name} (${apiId}) from IP ${clientIp}:`, incomingPayload);

      const callbackRow = row.rows[0];
      let config = {};
      try {
        config = decryptSellerApiConfig(callbackRow.config_ciphertext);
      } catch {}

      const callbackConfig = config.callback || {};
      const ourTxnKey = callbackConfig.ourTxnIdKey || 'our_txn_id';
      const supplierTxnKey = callbackConfig.supplierTxnIdKey || 'supplier_txn_id';
      const operatorTxnKey = callbackConfig.operatorTxnIdKey || 'operator_txn_id';
      const statusKey = callbackConfig.statusKey || 'status';
      const successVal = (callbackConfig.successValue || 'SUCCESS,0,SUCCESSFUL,200,TRUE,OK').split(',').map((s) => s.trim().toUpperCase());
      const failureVal = (callbackConfig.failureValue || 'FAILED,FAILURE,ERR,ERROR,1,REJECTED').split(',').map((s) => s.trim().toUpperCase());

      const ourTxnId = String(extractValueByPath(incomingPayload, ourTxnKey) || incomingPayload.ref_id || incomingPayload.recharge_id || incomingPayload.txnid || '').trim();
      const supplierTxnId = String(extractValueByPath(incomingPayload, supplierTxnKey) || incomingPayload.supplier_id || '').trim();
      const operatorTxnId = String(extractValueByPath(incomingPayload, operatorTxnKey) || incomingPayload.operator_id || incomingPayload.op_ref || supplierTxnId).trim();
      const statusVal = String(extractValueByPath(incomingPayload, statusKey) || incomingPayload.status || '').trim().toUpperCase();

      let matchedOrderId = null;
      let orderUpdated = false;

      if (ourTxnId || supplierTxnId) {
        const orderRes = await db.query(
          `SELECT id, user_id, amount_minor, cost_minor, status, provider_reference, idempotency_key
           FROM recharge_orders
           WHERE (id::text = $1 OR idempotency_key = $1 OR provider_reference = $1 OR provider_reference = $2)
           LIMIT 1`,
          [ourTxnId, supplierTxnId],
        );

        if (orderRes.rowCount > 0) {
          const order = orderRes.rows[0];
          matchedOrderId = order.id;

          let newDbStatus = order.status;
          if (successVal.includes(statusVal)) {
            newDbStatus = 'successful';
          } else if (failureVal.includes(statusVal)) {
            newDbStatus = 'failed';
          }

          if (newDbStatus === 'failed' && order.status !== 'failed' && order.status !== 'refunded') {
            const refundAmount = BigInt(order.cost_minor || order.amount_minor);
            await db.query(
              "UPDATE wallets SET balance_minor = balance_minor + $1, updated_at = now() WHERE user_id = $2 AND currency = 'INR'",
              [refundAmount, order.user_id],
            );
            await db.query(
              `INSERT INTO wallet_entries (wallet_id, user_id, amount_minor, entry_type, reference_type, reference_id, idempotency_key)
               SELECT id, $1, $2, 'refund', 'recharge_refund', $3, $4
               FROM wallets WHERE user_id = $1 AND currency = 'INR'`,
              [order.user_id, refundAmount, order.id, `cb_refund_${order.id}_${Date.now()}`],
            );
          }

          await db.query(
            `UPDATE recharge_orders
             SET status = $1,
                 provider_reference = COALESCE(NULLIF($2, ''), provider_reference),
                 response_payload = $3,
                 updated_at = now()
             WHERE id = $4`,
            [newDbStatus, operatorTxnId || supplierTxnId, JSON.stringify(incomingPayload), order.id],
          );
          orderUpdated = true;
        }
      }

      sendJson(response, 200, {
        status: 'SUCCESS',
        message: 'Callback received and acknowledged successfully.',
        apiName: row.rows[0].name,
        matchedOrderId,
        orderUpdated,
        received: incomingPayload,
        timestamp: new Date().toISOString(),
      });
      statusCode = 200;
      return;
    }

    // Buyer WebService API Endpoints (Recharge, Status, Balance, Dispute, Operators, Operator Lookup)
    if (url.pathname === '/webservices/api/recharge') {
      await handleBuyerRecharge(request, response, url);
      return;
    }
    if (url.pathname === '/webservices/api/status') {
      await handleBuyerStatus(request, response, url);
      return;
    }
    if (url.pathname === '/webservices/api/balance') {
      await handleBuyerBalance(request, response, url);
      return;
    }
    if (url.pathname === '/webservices/api/dispute') {
      await handleBuyerDispute(request, response, url);
      return;
    }
    if (url.pathname === '/webservices/api/operators') {
      await handleBuyerOperators(request, response, url);
      return;
    }
    if (url.pathname === '/webservices/api/operator-lookup' || url.pathname === '/webservices/api/operator-look') {
      await handleBuyerOperatorLookup(request, response, url);
      return;
    }
    if (url.pathname === '/api/buyer/credentials') {
      const session = await getSession(request);
      if (!session) {
        sendJson(response, 401, { error: 'Login required' });
        return;
      }
      await handleGetCredentials(request, response, session);
      return;
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      if (url.pathname === '/api/seller/api-settings') {
        const session = await getSession(request);
        if (!session) throw httpError('लॉगिन आवश्यक है।', 401);
        if (session.role !== 'user') throw httpError('यूज़र access आवश्यक है।', 403);
        const saved = await db.query(
          `SELECT s.id, s.name, s.short_name, s.services, s.mode, s.balance_value, s.balance_key, s.last_balance_at,
                  s.is_active, s.is_admin_approved, s.approval_status, s.rejection_reason, s.callback_ip, s.valid_till, s.config_ciphertext, s.created_at,
                  u.name as owner_name, u.phone_ciphertext as owner_phone_cipher, u.username as owner_username
           FROM seller_api_settings s
           JOIN users u ON u.id = s.user_id
           WHERE s.user_id = $1 AND s.deleted_at IS NULL
           ORDER BY s.created_at DESC`,
          [session.id],
        );
        const host = request.headers.host || '127.0.0.1:3000';
        const serverIp = getServerIp();

        const items = saved.rows.map((row) => {
          let config = {};
          try {
            config = decryptSellerApiConfig(row.config_ciphertext);
          } catch {}

          let safeUrl = config.url || config.request?.url || '';
          try {
            const parsed = new URL(safeUrl);
            for (const key of parsed.searchParams.keys()) {
              if (/token|key|secret|password|auth/i.test(key)) parsed.searchParams.set(key, '••••••');
            }
            safeUrl = parsed.toString();
          } catch {}

          let ownerPhone = '';
          if (row.owner_phone_cipher) {
            try { ownerPhone = decryptMobile(row.owner_phone_cipher); } catch {}
          }
          const ownerDisplay = row.owner_name
            ? `${row.owner_name} ~ ${ownerPhone || row.owner_username || ''}`
            : (row.owner_username || 'User');

          const callbackUrl = `http://${host}/CallBack/${row.id}`;

          return {
            id: row.id,
            name: row.name,
            ownerName: ownerDisplay,
            urlType: config.urlType || 'Balance URL',
            requestType: config.requestType || config.request?.method || 'GET',
            responseType: config.responseType || config.response?.type || 'JSON',
            url: safeUrl,
            rawUrl: config.url || config.request?.url || '',
            parameters: config.parameters || config.request?.parameters || [],
            headers: config.headers || config.request?.headers || [],
            body: config.body || config.request?.body || '',
            rechargeUrl: config.recharge?.url || '',
            statusCheckUrl: config.statusCheck?.url || '',
            disputeUrl: config.dispute?.url || '',
            balanceKey: row.balance_key || config.balanceKey || '',
            balanceValue: row.balance_value || '',
            lastBalanceAt: row.last_balance_at,
            createdAt: row.created_at,
            recharge: config.recharge || null,
            statusCheck: config.statusCheck || null,
            dispute: config.dispute || null,
            callbackConfig: config.callback || null,
            isActive: row.is_active !== false,
            isAdminApproved: row.is_admin_approved === true,
            approvalStatus: row.approval_status || (row.is_admin_approved ? 'approved' : 'waiting'),
            rejectionReason: row.rejection_reason || '',
            callbackIp: row.callback_ip || '',
            callbackUrl,
            currentQueue: 0,
            validTill: row.valid_till ? new Date(row.valid_till).toLocaleDateString() : 'N/A',
          };
        });

        sendJson(response, 200, { items, serverIp, totalCount: items.length });
        statusCode = 200;
        return;
      }
      if (url.pathname === '/') {
        statusCode = 302;
        response.writeHead(statusCode, { location: '/admin/login' });
        response.end();
        return;
      }

      // Legacy & clean auth redirects
      const legacyRedirects = {
        '/admin/login-2.html': '/admin/login',
        '/admin/login.html': '/admin/login',
        '/login-2.html': '/admin/login',
        '/login.html': '/admin/login',
        '/admin/register-2.html': '/admin/register',
        '/admin/register.html': '/admin/register',
        '/register-2.html': '/admin/register',
        '/register.html': '/admin/register',
        '/admin/signup-2.html': '/admin/register',
        '/admin/signup.html': '/admin/register',
        '/signup-2.html': '/admin/register',
        '/signup.html': '/admin/register',
        '/admin/forgot-password-2.html': '/admin/forgot-password',
        '/admin/forgot-password.html': '/admin/forgot-password',
        '/forgot-password-2.html': '/admin/forgot-password',
        '/forgot-password.html': '/admin/forgot-password',
      };
      if (legacyRedirects[url.pathname]) {
        statusCode = 301;
        const query = url.search || '';
        response.writeHead(statusCode, { location: legacyRedirects[url.pathname] + query });
        response.end();
        return;
      }

      if (url.pathname === '/login') {
        statusCode = 302;
        const query = url.search || '';
        response.writeHead(statusCode, { location: '/admin/login' + query });
        response.end();
        return;
      }
      if (url.pathname === '/signup' || url.pathname === '/register') {
        statusCode = 302;
        const query = url.search || '';
        response.writeHead(statusCode, { location: '/admin/register' + query });
        response.end();
        return;
      }
      if (url.pathname === '/forgot-password') {
        statusCode = 302;
        const query = url.search || '';
        response.writeHead(statusCode, { location: '/admin/forgot-password' + query });
        response.end();
        return;
      }

      if (url.pathname === '/dashboard') {
        const session = await getSession(request);
        if (!session) {
          statusCode = 302;
          response.writeHead(statusCode, { location: '/admin/login' });
          response.end();
          return;
        }
        if (session.role === 'admin') {
          statusCode = 302;
          response.writeHead(statusCode, { location: '/admin/' });
          response.end();
          return;
        }
        await sendUserDashboard(session, response);
        statusCode = 200;
        return;
      }

      const userPage = USER_PANEL_PAGES.get(url.pathname);
      if (userPage) {
        const session = await getSession(request);
        if (!session) {
          statusCode = 302;
          response.writeHead(statusCode, { location: '/admin/login' });
          response.end();
          return;
        }
        if (session.role !== 'user') {
          statusCode = 302;
          response.writeHead(statusCode, { location: '/admin/' });
          response.end();
          return;
        }
        if (url.pathname === '/fund/wallet-topup-request') {
          await sendWalletTopupRequestPage(session, response);
        } else if (url.pathname === '/report/fund-order') {
          await sendUserFundOrderPage(session, response, url.searchParams);
        } else if (url.pathname === '/seller/sales-margin') {
          await sendUserSalesMarginPage(session, response, url.searchParams);
        } else if (url.pathname === '/buyer/margin') {
          await sendUserBuyerMarginPage(session, response, url.searchParams);
        } else if (url.pathname === '/seller/sales-txn') {
          await sendUserSellerSalesTxnPage(session, response, url.searchParams);
        } else if (url.pathname === '/buyer/purchase-txn' || url.pathname === '/buyer/recharge-dispute') {
          await sendUserBuyerPurchaseTxnPage(session, response, url.searchParams);
        } else if (url.pathname === '/seller/sales-dispute') {
          await sendUserSellerSalesDisputePage(session, response, url.searchParams);
        } else if (url.pathname === '/available-stock' || url.pathname === '/buyer/available-margin' || url.pathname === '/buyer/available-stock') {
          await sendUserAvailableStockPage(session, response, url.searchParams);
        } else {
          await sendUserPanelPage(session, userPage, response);
        }
        statusCode = 200;
        return;
      }

      if (url.pathname === '/auth-client.js') {
        statusCode = 200;
        response.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none';",
        });
        response.end(AUTH_CLIENT_JS);
        return;
      }

      if (url.pathname === '/admin/disputes' || url.pathname === '/admin/payment/disputes') {
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        await sendAdminDisputesPage(admin, response, url.searchParams);
        statusCode = 200;
        return;
      }

      if (url.pathname === '/admin/payment/fund-request') {
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        await sendAdminFundRequestsPage(admin, response);
        statusCode = 200;
        return;
      }
      if (url.pathname === '/admin/settings/create-operator') {
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        await sendAdminCreateOperatorPage(admin, response);
        statusCode = 200;
        return;
      }
      if (url.pathname === '/admin/settings/show-operator') {
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        await sendAdminShowOperatorsPage(admin, response, url.searchParams);
        statusCode = 200;
        return;
      }
      if (url.pathname === '/admin/settings/service-settings' || url.pathname === '/admin/settings/plan-api') {
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        await sendAdminServiceSettingsPage(admin, response);
        statusCode = 200;
        return;
      }
      if (url.pathname === '/api/admin/settings/services') {
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        await handleGetServices(request, response);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/recharge/operator-lookup' || url.pathname === '/api/operator/lookup') {
        const mobile = String(url.searchParams.get('mobile') || url.searchParams.get('number') || '').trim();
        if (!mobile || mobile.replace(/\D/g, '').length < 10) {
          throw httpError('10-digit mobile number is required.', 400);
        }
        const lookup = await fetchOperatorLookup({
          db,
          decryptServiceConfig,
          mobile,
        });
        sendJson(response, 200, lookup);
        statusCode = 200;
        return;
      }
      if (url.pathname === '/admin/users/list') {
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        await sendAdminUserListPage(admin, response, url.searchParams);
        statusCode = 200;
        return;
      }
      if (url.pathname === '/admin/seller-api/requests') {
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        await sendAdminSellerApiRequestsPage(admin, response, url.searchParams);
        statusCode = 200;
        return;
      }
      if (url.pathname === '/api/admin/users/list-balances') {
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        const ids = url.searchParams.getAll('id');
        if (!ids.length || ids.length > 500 || ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
          throw httpError('यूज़र सूची सही नहीं है।', 400);
        }
        const balances = await db.query(
          `SELECT u.id, COALESCE(w.balance_minor, 0) AS balance_minor
           FROM users u LEFT JOIN wallets w ON w.user_id = u.id AND w.currency = 'INR'
           WHERE u.role = 'user' AND u.deleted_at IS NULL AND u.id = ANY($1::uuid[])`, [ids],
        );
        sendJson(response, 200, { balances: balances.rows.map((row) => ({ userId: row.id, balance: formatMinorUnits(row.balance_minor) })) });
        statusCode = 200;
        return;
      }
      if (url.pathname === '/admin/users/list-client.js') {
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        const script = await fsp.readFile(path.join(__dirname, 'pages', 'admin-user-list-client.js'));
        response.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8', 'content-length': script.length,
          'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none';",
        });
        response.end(script);
        statusCode = 200;
        return;
      }
      const userMarginsMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/margins$/i);
      if (userMarginsMatch) {
        await getManagedUserMargins(request, response, userMarginsMatch[1]);
        statusCode = response.statusCode || 200;
        return;
      }
      const proofMatch = url.pathname.match(/^\/admin\/payment\/fund-request\/proof\/([0-9a-f-]{36})$/i);
      if (proofMatch) {
        await sendFundRequestProof(request, response, proofMatch[1]);
        statusCode = 200;
        return;
      }

      if (url.pathname === '/api/auth/me') {
        const session = await getSession(request);
        if (!session) throw httpError('लॉगिन आवश्यक है।', 401);
        statusCode = 200;
        sendJson(response, statusCode, { user: { userId: session.username, name: session.name, role: session.role } });
        return;
      }

      const publicAdminPaths = [
        '/admin/login',
        '/admin/login-2.html',
        '/admin/register',
        '/admin/register-2.html',
        '/admin/signup',
        '/admin/forgot-password',
        '/admin/forgot-password-2.html',
      ];
      if ((url.pathname === '/admin' || url.pathname.startsWith('/admin/')) && !publicAdminPaths.includes(url.pathname)) {
        const session = await getSession(request);
        if (!session) {
          statusCode = 302;
          response.writeHead(statusCode, { location: '/admin/login' });
          response.end();
          return;
        }
        if (session.role !== 'admin') {
          statusCode = 302;
          response.writeHead(statusCode, { location: '/dashboard' });
          response.end();
          return;
        }
      }

      if (url.pathname === '/admin/user/list') {
        statusCode = 302;
        response.writeHead(statusCode, { location: '/admin/users/list' });
        response.end();
        return;
      }

      const served = await serveAdminUi(url.pathname, request.method, response);
      if (served) {
        statusCode = response.statusCode || 200;
        return;
      }
    }

    if (request.method === 'POST') {
      if (url.pathname === '/api/seller/fetch-response') {
        checkSameOrigin(request);
        const session = await getSession(request);
        if (!session) throw httpError('लॉगिन आवश्यक है।', 401);
        if (session.role !== 'user') throw httpError('यूज़र access आवश्यक है।', 403);
        const input = await readJson(request);
        const targetUrl = String(input.url || '').trim();
        if (!targetUrl) throw httpError('Stock API URL आवश्यक है।', 400);

        try {
          const apiResult = await executeStockApiCall({
            url: targetUrl,
            method: input.method || input.requestType || 'GET',
            requestType: input.requestType || 'GET',
            responseType: input.responseType || 'json',
            parameters: input.parameters || [],
            headers: input.headers || [],
            body: input.body || '',
            balanceKey: input.balanceKey || '',
          });
          sendJson(response, 200, apiResult);
          statusCode = 200;
          return;
        } catch (apiErr) {
          throw httpError(apiErr.message || 'API कॉल असफल रही।', 400);
        }
      }

      if (url.pathname === '/api/seller/api-settings') {
        checkSameOrigin(request);
        const session = await getSession(request);
        if (!session) throw httpError('लॉगिन आवश्यक है।', 401);
        if (session.role !== 'user') throw httpError('यूज़र access आवश्यक है।', 403);
        const input = await readJson(request);
        const name = String(input.name || '').trim();
        const targetUrl = String(input.url || (input.request && input.request.url) || '').trim();
        const urlType = String(input.urlType || 'Balance URL').trim();
        const requestType = String(input.requestType || (input.request && input.request.method) || 'GET').trim().toUpperCase();
        const responseType = String(input.responseType || (input.response && input.response.type) || 'JSON').trim().toUpperCase();
        const parameters = Array.isArray(input.parameters) ? input.parameters : (input.request?.parameters || []);
        const balanceKey = String(input.balanceKey || (input.response?.mapping?.stock) || '').trim();

        if (!name || name.length > 100) throw httpError('API Name 1 से 100 अक्षरों का होना चाहिए।', 400);
        if (!targetUrl || targetUrl.length > 2_000) throw httpError('Stock API URL आवश्यक है।', 400);

        let parsedUrl;
        try { parsedUrl = new URL(targetUrl); } catch { throw httpError('API URL सही नहीं है (http:// या https:// आवश्यक है)।', 400); }

        // Attempt automatic live balance fetch to verify and get initial balance
        let balanceValue = '';
        let lastBalanceAt = new Date();
        try {
          const testRes = await executeStockApiCall({
            url: targetUrl,
            requestType,
            responseType,
            parameters,
            headers: input.headers || [],
            body: input.body || '',
            balanceKey,
          });
          if (testRes.extractedBalance !== null) {
            balanceValue = String(testRes.extractedBalance);
          }
        } catch (err) {
          console.warn('Initial balance check warning:', err.message);
        }

        const configToStore = {
          name,
          urlType,
          requestType,
          responseType,
          url: targetUrl,
          parameters,
          headers: input.headers || [],
          body: input.body || '',
          balanceKey,
          lastBalanceValue: balanceValue,
        };

        const saved = await db.query(
          `INSERT INTO seller_api_settings (user_id, name, short_name, services, mode, config_ciphertext, balance_value, balance_key, last_balance_at, is_admin_approved, approval_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, 'waiting') RETURNING id`,
          [
            session.id,
            name,
            name.slice(0, 20),
            'Mobile',
            'manual',
            encryptSellerApiConfig(configToStore),
            balanceValue,
            balanceKey,
            lastBalanceAt,
          ],
        );

        sendJson(response, 201, {
          id: saved.rows[0].id,
          name,
          balance: balanceValue,
          message: 'Stock API successfully saved.',
        });
        statusCode = 201;
        return;
      }

      const sellerApiActionMatch = url.pathname.match(/^\/api\/seller\/api-settings\/([0-9a-f-]{36})\/(refresh|delete|update|recharge-config|status-config|dispute-config|callback-config|toggle-active|set-callback-ip)$/i);
      if (sellerApiActionMatch) {
        checkSameOrigin(request);
        const session = await getSession(request);
        if (!session) throw httpError('लॉगिन आवश्यक है।', 401);
        if (session.role !== 'user') throw httpError('यूज़र access आवश्यक है।', 403);
        const [, apiId, action] = sellerApiActionMatch;

        if (action === 'delete') {
          await db.query(
            'UPDATE seller_api_settings SET deleted_at = now() WHERE id = $1 AND user_id = $2',
            [apiId, session.id],
          );
          sendJson(response, 200, { message: 'API settings deleted.' });
          statusCode = 200;
          return;
        }

        if (action === 'update') {
          const input = await readJson(request);
          const name = String(input.name || '').trim();
          const targetUrl = String(input.url || (input.request && input.request.url) || '').trim();
          const urlType = String(input.urlType || 'Balance URL').trim();
          const requestType = String(input.requestType || (input.request && input.request.method) || 'GET').trim().toUpperCase();
          const responseType = String(input.responseType || (input.response && input.response.type) || 'JSON').trim().toUpperCase();
          const parameters = Array.isArray(input.parameters) ? input.parameters : (input.request?.parameters || []);
          const balanceKey = String(input.balanceKey || (input.response?.mapping?.stock) || '').trim();

          if (!name || name.length > 100) throw httpError('API Name 1 से 100 अक्षरों का होना चाहिए।', 400);
          if (!targetUrl || targetUrl.length > 2_000) throw httpError('Stock API URL आवश्यक है।', 400);

          const row = await db.query(
            'SELECT config_ciphertext, balance_value, last_balance_at FROM seller_api_settings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
            [apiId, session.id],
          );
          if (!row.rowCount) throw httpError('API सेटिंग नहीं मिली।', 404);

          let config = {};
          try {
            config = decryptSellerApiConfig(row.rows[0].config_ciphertext);
          } catch {}

          let balanceValue = row.rows[0].balance_value || '';
          let lastBalanceAt = row.rows[0].last_balance_at;

          try {
            const balanceResult = await executeStockApiCall({
              url: targetUrl,
              requestType,
              responseType,
              parameters,
              headers: input.headers || config.headers || [],
              body: input.body || config.body || '',
              balanceKey,
            });
            if (balanceResult && balanceResult.extractedBalance !== null && balanceResult.extractedBalance !== undefined) {
              balanceValue = String(balanceResult.extractedBalance);
              lastBalanceAt = new Date().toISOString();
            }
          } catch (err) {
            console.warn('Balance check warning on update:', err.message);
          }

          config.name = name;
          config.urlType = urlType;
          config.requestType = requestType;
          config.responseType = responseType;
          config.url = targetUrl;
          config.parameters = parameters;
          config.headers = input.headers || config.headers || [];
          config.body = input.body || config.body || '';
          config.balanceKey = balanceKey;
          if (balanceValue) config.lastBalanceValue = balanceValue;
          if (input.recharge) config.recharge = input.recharge;
          if (input.statusCheck) config.statusCheck = input.statusCheck;
          if (input.dispute) config.dispute = input.dispute;
          if (input.callbackConfig || input.callback) config.callback = input.callbackConfig || input.callback;

          await db.query(
            `UPDATE seller_api_settings
             SET name = $1, config_ciphertext = $2, balance_value = $3, balance_key = $4,
                 last_balance_at = COALESCE($5, last_balance_at), updated_at = now()
             WHERE id = $6 AND user_id = $7`,
            [
              name,
              encryptSellerApiConfig(config),
              balanceValue,
              balanceKey,
              lastBalanceAt,
              apiId,
              session.id,
            ],
          );

          sendJson(response, 200, {
            id: apiId,
            name,
            balance: balanceValue,
            message: 'API settings updated successfully.',
          });
          statusCode = 200;
          return;
        }

        if (action === 'toggle-active') {
          const input = await readJson(request);
          const active = Boolean(input.active);
          await db.query(
            'UPDATE seller_api_settings SET is_active = $1, updated_at = now() WHERE id = $2 AND user_id = $3',
            [active, apiId, session.id],
          );
          sendJson(response, 200, { active, message: active ? 'API activated.' : 'API deactivated.' });
          statusCode = 200;
          return;
        }

        if (action === 'set-callback-ip') {
          const input = await readJson(request);
          const callbackIp = String(input.callbackIp || '').trim();
          await db.query(
            'UPDATE seller_api_settings SET callback_ip = $1, updated_at = now() WHERE id = $2 AND user_id = $3',
            [callbackIp, apiId, session.id],
          );
          sendJson(response, 200, { callbackIp, message: 'Callback IP updated.' });
          statusCode = 200;
          return;
        }

        if (action === 'recharge-config') {
          const input = await readJson(request);
          const recharge = input.recharge || input;
          const targetUrl = String(recharge.url || '').trim();
          if (!targetUrl) throw httpError('Recharge API URL आवश्यक है।', 400);

          const row = await db.query(
            'SELECT config_ciphertext FROM seller_api_settings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
            [apiId, session.id],
          );
          if (!row.rowCount) throw httpError('API सेटिंग नहीं मिली।', 404);

          let config = {};
          try {
            config = decryptSellerApiConfig(row.rows[0].config_ciphertext);
          } catch {}

          config.recharge = {
            url: targetUrl,
            requestType: String(recharge.requestType || 'GET').toUpperCase(),
            responseType: String(recharge.responseType || 'JSON').toUpperCase(),
            parameters: Array.isArray(recharge.parameters) ? recharge.parameters : [],
            headers: Array.isArray(recharge.headers) ? recharge.headers : [],
            statusKey: String(recharge.statusKey || '').trim(),
            successCodes: String(recharge.successCodes || '').trim(),
            failedCodes: String(recharge.failedCodes || '').trim(),
            supplierIdKey: String(recharge.supplierIdKey || '').trim(),
            operatorIdKey: String(recharge.operatorIdKey || '').trim(),
            balanceKey: String(recharge.balanceKey || '').trim(),
            marginKey: String(recharge.marginKey || '').trim(),
            updatedAt: new Date().toISOString(),
          };

          await db.query(
            'UPDATE seller_api_settings SET config_ciphertext = $1, updated_at = now() WHERE id = $2 AND user_id = $3',
            [encryptSellerApiConfig(config), apiId, session.id],
          );

          sendJson(response, 200, { message: 'Recharge API configuration updated successfully.', recharge: config.recharge });
          statusCode = 200;
          return;
        }

        if (action === 'status-config') {
          const input = await readJson(request);
          const statusCheck = input.statusCheck || input;
          const targetUrl = String(statusCheck.url || '').trim();
          if (!targetUrl) throw httpError('Status Check API URL आवश्यक है।', 400);

          const row = await db.query(
            'SELECT config_ciphertext FROM seller_api_settings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
            [apiId, session.id],
          );
          if (!row.rowCount) throw httpError('API सेटिंग नहीं मिली।', 404);

          let config = {};
          try {
            config = decryptSellerApiConfig(row.rows[0].config_ciphertext);
          } catch {}

          config.statusCheck = {
            url: targetUrl,
            requestType: String(statusCheck.requestType || 'GET').toUpperCase(),
            responseType: String(statusCheck.responseType || 'JSON').toUpperCase(),
            parameters: Array.isArray(statusCheck.parameters) ? statusCheck.parameters : [],
            headers: Array.isArray(statusCheck.headers) ? statusCheck.headers : [],
            statusKey: String(statusCheck.statusKey || '').trim(),
            successCodes: String(statusCheck.successCodes || '').trim(),
            failedCodes: String(statusCheck.failedCodes || '').trim(),
            ourRechargeIdKey: String(statusCheck.ourRechargeIdKey || '').trim(),
            supplierIdKey: String(statusCheck.supplierIdKey || '').trim(),
            operatorIdKey: String(statusCheck.operatorIdKey || '').trim(),
            balanceKey: String(statusCheck.balanceKey || '').trim(),
            marginKey: String(statusCheck.marginKey || '').trim(),
            updatedAt: new Date().toISOString(),
          };

          await db.query(
            'UPDATE seller_api_settings SET config_ciphertext = $1, updated_at = now() WHERE id = $2 AND user_id = $3',
            [encryptSellerApiConfig(config), apiId, session.id],
          );

          sendJson(response, 200, { message: 'Status Check API configuration updated successfully.', statusCheck: config.statusCheck });
          statusCode = 200;
          return;
        }

        if (action === 'dispute-config') {
          const input = await readJson(request);
          const dispute = input.dispute || input;
          const targetUrl = String(dispute.url || '').trim();
          if (!targetUrl) throw httpError('Dispute API URL आवश्यक है।', 400);

          const row = await db.query(
            'SELECT config_ciphertext FROM seller_api_settings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
            [apiId, session.id],
          );
          if (!row.rowCount) throw httpError('API सेटिंग नहीं मिली।', 404);

          let config = {};
          try {
            config = decryptSellerApiConfig(row.rows[0].config_ciphertext);
          } catch {}

          config.dispute = {
            url: targetUrl,
            requestType: String(dispute.requestType || 'GET').toUpperCase(),
            responseType: String(dispute.responseType || 'JSON').toUpperCase(),
            parameters: Array.isArray(dispute.parameters) ? dispute.parameters : [],
            headers: Array.isArray(dispute.headers) ? dispute.headers : [],
            statusKey: String(dispute.statusKey || '').trim(),
            disputeIdKey: String(dispute.disputeIdKey || '').trim(),
            updatedAt: new Date().toISOString(),
          };

          await db.query(
            'UPDATE seller_api_settings SET config_ciphertext = $1, updated_at = now() WHERE id = $2 AND user_id = $3',
            [encryptSellerApiConfig(config), apiId, session.id],
          );

          sendJson(response, 200, { message: 'Dispute API configuration updated successfully.', dispute: config.dispute });
          statusCode = 200;
          return;
        }

        if (action === 'callback-config') {
          const input = await readJson(request);
          const callbackData = input.callback || input;

          const row = await db.query(
            'SELECT config_ciphertext FROM seller_api_settings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
            [apiId, session.id],
          );
          if (!row.rowCount) throw httpError('API सेटिंग नहीं मिली।', 404);

          let config = {};
          try {
            config = decryptSellerApiConfig(row.rows[0].config_ciphertext);
          } catch {}

          config.callback = {
            ourTxnIdKey: String(callbackData.ourTxnIdKey || '').trim(),
            supplierTxnIdKey: String(callbackData.supplierTxnIdKey || '').trim(),
            operatorTxnIdKey: String(callbackData.operatorTxnIdKey || '').trim(),
            statusKey: String(callbackData.statusKey || '').trim(),
            successValue: String(callbackData.successValue || '').trim(),
            failureValue: String(callbackData.failureValue || '').trim(),
            balanceKey: String(callbackData.balanceKey || '').trim(),
            marginKey: String(callbackData.marginKey || '').trim(),
            sampleUrl: String(callbackData.sampleUrl || '').trim(),
            updatedAt: new Date().toISOString(),
          };

          await db.query(
            'UPDATE seller_api_settings SET config_ciphertext = $1, updated_at = now() WHERE id = $2 AND user_id = $3',
            [encryptSellerApiConfig(config), apiId, session.id],
          );

          sendJson(response, 200, { message: 'Callback configuration updated successfully.', callbackConfig: config.callback });
          statusCode = 200;
          return;
        }

        if (action === 'refresh') {
          const row = await db.query(
            'SELECT config_ciphertext, balance_key FROM seller_api_settings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
            [apiId, session.id],
          );
          if (!row.rowCount) throw httpError('API सेटिंग नहीं मिली।', 404);
          let config = {};
          try {
            config = decryptSellerApiConfig(row.rows[0].config_ciphertext);
          } catch {}
          const balanceKey = row.rows[0].balance_key || config.balanceKey || '';

          const testRes = await executeStockApiCall({
            url: config.url || config.request?.url,
            requestType: config.requestType || config.request?.method || 'GET',
            responseType: config.responseType || config.response?.type || 'json',
            parameters: config.parameters || config.request?.parameters || [],
            headers: config.headers || config.request?.headers || [],
            body: config.body || config.request?.body || '',
            balanceKey,
          });

          const newBalance = testRes.extractedBalance !== null ? String(testRes.extractedBalance) : '0.00';
          await db.query(
            'UPDATE seller_api_settings SET balance_value = $1, last_balance_at = now(), updated_at = now() WHERE id = $2 AND user_id = $3',
            [newBalance, apiId, session.id],
          );

          sendJson(response, 200, { balance: newBalance, status: testRes.status, latencyMs: testRes.latencyMs });
          statusCode = 200;
          return;
        }
      }
      const managedUserAction = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/(update|password|status|delete)$/i);
      if (managedUserAction) {
        const [, managedUserId, action] = managedUserAction;
        if (action === 'update') await updateManagedUser(request, response, managedUserId);
        else if (action === 'password') await changeManagedUserPassword(request, response, managedUserId);
        else if (action === 'status') await setManagedUserStatus(request, response, managedUserId);
        else await deleteManagedUser(request, response, managedUserId);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/margins/calculate') {
        await quoteTransactionMargin(request, response);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/seller/margins') {
        await createSellerMargin(request, response);
        statusCode = response.statusCode || 201;
        return;
      }
      if (url.pathname === '/api/buyer/margins') {
        await createBuyerMargin(request, response);
        statusCode = response.statusCode || 201;
        return;
      }
      const sellerMarginMatch = url.pathname.match(/^\/api\/seller\/margins\/([0-9a-f-]{36})\/(update|active|delete)$/i);
      if (sellerMarginMatch) {
        const [, marginId, action] = sellerMarginMatch;
        if (action === 'update') await updateSellerMargin(request, response, marginId);
        else if (action === 'active') await setSellerMarginActive(request, response, marginId);
        else await deleteSellerMargin(request, response, marginId);
        statusCode = response.statusCode || 200;
        return;
      }
      const buyerMarginMatch = url.pathname.match(/^\/api\/buyer\/margins\/([0-9a-f-]{36})\/(update|active|delete)$/i);
      if (buyerMarginMatch) {
        const [, marginId, action] = buyerMarginMatch;
        if (action === 'update') await updateBuyerMargin(request, response, marginId);
        else if (action === 'active') await setBuyerMarginActive(request, response, marginId);
        else await deleteBuyerMargin(request, response, marginId);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/admin/operators') {
        await createOperator(request, response);
        statusCode = response.statusCode || 201;
        return;
      }
      const operatorActionMatch = url.pathname.match(/^\/api\/admin\/operators\/([0-9a-f-]{36})\/(update|status|delete)$/i);
      if (operatorActionMatch) {
        const [, operatorId, action] = operatorActionMatch;
        if (action === 'update') await updateOperator(request, response, operatorId);
        else if (action === 'status') await setOperatorStatus(request, response, operatorId);
        else await deleteOperator(request, response, operatorId);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/fund-requests') {
        await createFundRequest(request, response);
        statusCode = response.statusCode || 201;
        return;
      }
      const decisionMatch = url.pathname.match(/^\/api\/admin\/fund-requests\/([0-9a-f-]{36})\/decision$/i);
      if (decisionMatch) {
        await decideFundRequest(request, response, decisionMatch[1]);
        statusCode = response.statusCode || 200;
        return;
      }

      const sellerApiDecisionMatch = url.pathname.match(/^\/api\/admin\/seller-api-requests\/([0-9a-f-]{36})\/decision$/i);
      if (sellerApiDecisionMatch) {
        checkSameOrigin(request);
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        const apiId = sellerApiDecisionMatch[1];
        const input = await readJson(request);
        const action = String(input.action || '').toLowerCase();
        const note = String(input.note || '').trim();

        if (action === 'approve') {
          await db.query(
            `UPDATE seller_api_settings
             SET approval_status = 'approved', is_admin_approved = true, approved_at = now(),
                 reviewed_by = $1, rejection_reason = '', updated_at = now()
             WHERE id = $2 AND deleted_at IS NULL`,
            [admin.id, apiId],
          );
          sendJson(response, 200, { success: true, status: 'approved', message: 'API approved successfully.' });
          statusCode = 200;
          return;
        }

        if (action === 'reject') {
          await db.query(
            `UPDATE seller_api_settings
             SET approval_status = 'rejected', is_admin_approved = false, approved_at = NULL,
                 reviewed_by = $1, rejection_reason = $2, updated_at = now()
             WHERE id = $3 AND deleted_at IS NULL`,
            [admin.id, note, apiId],
          );
          sendJson(response, 200, { success: true, status: 'rejected', message: 'API rejected.' });
          statusCode = 200;
          return;
        }

        throw httpError('अमान्य action।', 400);
      }
      if (url.pathname === '/api/admin/settings/services/email') {
        checkSameOrigin(request);
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        const input = await readJson(request);
        await handleSaveEmailSettings(request, response, input);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/admin/settings/services/email/test') {
        checkSameOrigin(request);
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        const input = await readJson(request);
        await handleTestEmail(request, response, input);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/admin/settings/services/whatsapp') {
        checkSameOrigin(request);
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        const input = await readJson(request);
        await handleSaveWhatsappSettings(request, response, input);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/admin/settings/services/whatsapp/test') {
        checkSameOrigin(request);
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        const input = await readJson(request);
        await handleTestWhatsapp(request, response, input);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/admin/settings/services/plan-api') {
        checkSameOrigin(request);
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        const input = await readJson(request);
        await handleSavePlanApiSettings(request, response, input);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/admin/settings/services/plan-api/test') {
        checkSameOrigin(request);
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        const input = await readJson(request);
        await handleTestPlanApi(request, response, input);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/admin/settings/services/margin-difference') {
        checkSameOrigin(request);
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);
        const input = await readJson(request);
        await handleSaveMarginDifferenceSettings(request, response, input);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/buyer/disputes') {
        checkSameOrigin(request);
        const session = await getSession(request);
        if (!session) throw httpError('लॉगिन आवश्यक है।', 401);
        if (session.role !== 'user') throw httpError('यूज़र access आवश्यक है।', 403);

        const input = await readJson(request);
        const orderId = String(input.orderId || input.order_id || '').trim();
        const refId = String(input.refId || input.ref_id || '').trim();
        const reason = String(input.reason || 'Recharge not received on customer mobile number').trim().slice(0, 255);

        if (!orderId && !refId) throw httpError('Order ID or Ref ID is required to raise a dispute.', 400);

        const orderRes = await db.query(
          `SELECT id, user_id, seller_user_id, status, dispute_status
           FROM recharge_orders
           WHERE user_id = $1 AND (id::text = $2 OR idempotency_key = $3)
           LIMIT 1`,
          [session.id, orderId || '00000000-0000-0000-0000-000000000000', refId || ''],
        );

        if (!orderRes.rowCount) throw httpError('Transaction not found to dispute.', 404);
        const order = orderRes.rows[0];

        if (order.dispute_status === 'accepted') {
          throw httpError('This transaction has already been refunded.', 400);
        }

        const dispCode = 'DSP-' + order.id.slice(0, 8).toUpperCase();
        await db.query(
          `UPDATE recharge_orders
           SET dispute_status = 'pending', dispute_reason = $1, dispute_created_at = now(), updated_at = now()
           WHERE id = $2`,
          [reason, order.id],
        );

        try {
          await db.query(
            `INSERT INTO recharge_disputes (order_id, buyer_id, seller_id, dispute_code, reason, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'pending', now(), now())`,
            [order.id, session.id, order.seller_user_id || null, dispCode, reason],
          );
        } catch {}

        sendJson(response, 200, { ok: true, message: 'Dispute submitted successfully.', disputeCode: dispCode });
        statusCode = 200;
        return;
      }
      if (url.pathname === '/api/seller/disputes/accept') {
        checkSameOrigin(request);
        const session = await getSession(request);
        if (!session) throw httpError('लॉगिन आवश्यक है।', 401);
        if (session.role !== 'user') throw httpError('यूज़र access आवश्यक है।', 403);

        const input = await readJson(request);
        const orderId = String(input.orderId || input.order_id || '').trim();
        const note = String(input.note || 'Accepted and refunded by seller').trim();
        if (!orderId) throw httpError('Order ID is required.', 400);

        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const orderRes = await client.query(
            'SELECT id, user_id, seller_user_id, amount_minor, cost_minor, margin_minor, status, dispute_status FROM recharge_orders WHERE id = $1 AND seller_user_id = $2 FOR UPDATE',
            [orderId, session.id],
          );
          if (!orderRes.rowCount) throw httpError('Dispute not found or not assigned to your account.', 404);
          const order = orderRes.rows[0];

          if (order.dispute_status === 'accepted' || order.status === 'refunded') {
            throw httpError('This dispute has already been accepted and refunded.', 400);
          }

          const buyerId = order.user_id;
          const refundAmountMinor = BigInt(order.cost_minor || order.amount_minor || '0');

          const buyerWalletRes = await client.query(
            "SELECT id, balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR' FOR UPDATE",
            [buyerId],
          );
          if (!buyerWalletRes.rowCount) throw httpError('Buyer wallet not found.', 404);
          const buyerWallet = buyerWalletRes.rows[0];
          const newBal = BigInt(buyerWallet.balance_minor || 0) + refundAmountMinor;

          await client.query(
            "UPDATE wallets SET balance_minor = $1, updated_at = now() WHERE user_id = $2 AND currency = 'INR'",
            [newBal, buyerId],
          );

          const refundKey = `disp_ref_${order.id}`;
          await client.query(
            `INSERT INTO wallet_entries (
               wallet_id, user_id, amount_minor, entry_type, reference_type, reference_id, idempotency_key
             ) VALUES (
               $1, $2, $3, 'refund', 'recharge_dispute_refund', $4, $5
             ) ON CONFLICT (wallet_id, idempotency_key) DO NOTHING`,
            [buyerWallet.id, buyerId, refundAmountMinor, order.id, refundKey],
          );

          await client.query(
            `UPDATE recharge_orders
             SET dispute_status = 'accepted', status = 'refunded', dispute_resolved_at = now(),
                 dispute_resolved_by = $1, dispute_resolution_note = $2, updated_at = now()
             WHERE id = $3`,
            [session.id, note, order.id],
          );

          await client.query(
            `UPDATE recharge_disputes
             SET status = 'accepted', resolution_note = $1, resolved_by = $2, resolved_at = now(), updated_at = now()
             WHERE order_id = $3`,
            [note, session.id, order.id],
          ).catch(() => {});

          await client.query('COMMIT');
          sendJson(response, 200, { ok: true, message: 'Dispute accepted and full refund credited to Buyer successfully.' });
          statusCode = 200;
          return;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }
      if (url.pathname === '/api/seller/disputes/reject') {
        checkSameOrigin(request);
        const session = await getSession(request);
        if (!session) throw httpError('लॉगिन आवश्यक है।', 401);
        if (session.role !== 'user') throw httpError('यूज़र access आवश्यक है।', 403);

        const input = await readJson(request);
        const orderId = String(input.orderId || input.order_id || '').trim();
        const reason = String(input.reason || input.note || 'Rejected by seller').trim();
        if (!orderId) throw httpError('Order ID is required.', 400);

        const orderRes = await db.query(
          'SELECT id, dispute_status FROM recharge_orders WHERE id = $1 AND seller_user_id = $2',
          [orderId, session.id],
        );
        if (!orderRes.rowCount) throw httpError('Dispute not found or not assigned to your account.', 404);
        if (orderRes.rows[0].dispute_status === 'accepted') {
          throw httpError('Cannot reject a dispute that has already been accepted and refunded.', 400);
        }

        await db.query(
          `UPDATE recharge_orders
           SET dispute_status = 'rejected', dispute_resolution_note = $1, dispute_resolved_at = now(),
               dispute_resolved_by = $2, updated_at = now()
           WHERE id = $3`,
          [reason, session.id, orderId],
        );

        await db.query(
          `UPDATE recharge_disputes
           SET status = 'rejected', resolution_note = $1, resolved_by = $2, resolved_at = now(), updated_at = now()
           WHERE order_id = $3`,
          [reason, session.id, orderId],
        ).catch(() => {});

        sendJson(response, 200, { ok: true, message: 'Dispute rejected.' });
        statusCode = 200;
        return;
      }
      if (url.pathname === '/api/admin/disputes/accept') {
        checkSameOrigin(request);
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);

        const input = await readJson(request);
        const orderId = String(input.orderId || input.order_id || '').trim();
        const note = String(input.note || 'Accepted and refunded by Administrator').trim();
        if (!orderId) throw httpError('Order ID is required.', 400);

        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const orderRes = await client.query(
            'SELECT id, user_id, seller_user_id, amount_minor, cost_minor, margin_minor, status, dispute_status FROM recharge_orders WHERE id = $1 FOR UPDATE',
            [orderId],
          );
          if (!orderRes.rowCount) throw httpError('Transaction not found.', 404);
          const order = orderRes.rows[0];

          if (order.dispute_status === 'accepted' || order.status === 'refunded') {
            throw httpError('This transaction has already been refunded.', 400);
          }

          const buyerId = order.user_id;
          const refundAmountMinor = BigInt(order.cost_minor || order.amount_minor || '0');

          const buyerWalletRes = await client.query(
            "SELECT id, balance_minor FROM wallets WHERE user_id = $1 AND currency = 'INR' FOR UPDATE",
            [buyerId],
          );
          if (!buyerWalletRes.rowCount) throw httpError('Buyer wallet not found.', 404);
          const buyerWallet = buyerWalletRes.rows[0];
          const newBal = BigInt(buyerWallet.balance_minor || 0) + refundAmountMinor;

          await client.query(
            "UPDATE wallets SET balance_minor = $1, updated_at = now() WHERE user_id = $2 AND currency = 'INR'",
            [newBal, buyerId],
          );

          const refundKey = `admin_disp_ref_${order.id}`;
          await client.query(
            `INSERT INTO wallet_entries (
               wallet_id, user_id, amount_minor, entry_type, reference_type, reference_id, idempotency_key
             ) VALUES (
               $1, $2, $3, 'refund', 'recharge_dispute_refund', $4, $5
             ) ON CONFLICT (wallet_id, idempotency_key) DO NOTHING`,
            [buyerWallet.id, buyerId, refundAmountMinor, order.id, refundKey],
          );

          await client.query(
            `UPDATE recharge_orders
             SET dispute_status = 'accepted', status = 'refunded', dispute_resolved_at = now(),
                 dispute_resolved_by = $1, dispute_resolution_note = $2, updated_at = now()
             WHERE id = $3`,
            [admin.id, note, order.id],
          );

          await client.query(
            `UPDATE recharge_disputes
             SET status = 'accepted', resolution_note = $1, resolved_by = $2, resolved_at = now(), updated_at = now()
             WHERE order_id = $3`,
            [note, admin.id, order.id],
          ).catch(() => {});

          await client.query('COMMIT');
          sendJson(response, 200, { ok: true, message: 'Dispute accepted and refunded successfully.' });
          statusCode = 200;
          return;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }
      if (url.pathname === '/api/admin/disputes/reject') {
        checkSameOrigin(request);
        const admin = await getSession(request);
        if (!admin) throw httpError('login required', 401);
        if (admin.role !== 'admin') throw httpError('admin access required', 403);

        const input = await readJson(request);
        const orderId = String(input.orderId || input.order_id || '').trim();
        const note = String(input.note || 'Rejected by Administrator').trim();
        if (!orderId) throw httpError('Order ID is required.', 400);

        const orderRes = await db.query(
          'SELECT id, dispute_status FROM recharge_orders WHERE id = $1',
          [orderId],
        );
        if (!orderRes.rowCount) throw httpError('Transaction not found.', 404);
        if (orderRes.rows[0].dispute_status === 'accepted') {
          throw httpError('Cannot reject an already accepted/refunded dispute.', 400);
        }

        await db.query(
          `UPDATE recharge_orders
           SET dispute_status = 'rejected', dispute_resolution_note = $1, dispute_resolved_at = now(),
               dispute_resolved_by = $2, updated_at = now()
           WHERE id = $3`,
          [note, admin.id, orderId],
        );

        await db.query(
          `UPDATE recharge_disputes
           SET status = 'rejected', resolution_note = $1, resolved_by = $2, resolved_at = now(), updated_at = now()
           WHERE order_id = $3`,
          [note, admin.id, orderId],
        ).catch(() => {});

        sendJson(response, 200, { ok: true, message: 'Dispute rejected.' });
        statusCode = 200;
        return;
      }
      if (url.pathname === '/api/recharge/operator-lookup' || url.pathname === '/api/operator/lookup') {
        const input = await readJson(request).catch(() => ({}));
        const mobile = String(input.mobile || input.number || url.searchParams.get('mobile') || '').trim();
        if (!mobile || mobile.replace(/\D/g, '').length < 10) {
          throw httpError('10-digit mobile number is required.', 400);
        }
        const lookup = await fetchOperatorLookup({
          db,
          decryptServiceConfig,
          mobile,
        });
        sendJson(response, 200, lookup);
        statusCode = 200;
        return;
      }
      if (url.pathname === '/api/auth/otp' || url.pathname === '/api/auth/otp/whatsapp') {
        await requestWhatsappOtp(request, response);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/auth/otp/email') {
        await requestEmailOtp(request, response);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/auth/password-reset-otp') {
        await requestPasswordResetOtp(request, response);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/auth/password-reset') {
        await resetPassword(request, response);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/auth/signup') {
        await registerUser(request, response);
        statusCode = response.statusCode || 201;
        return;
      }
      if (url.pathname === '/api/auth/login') {
        await loginUser(request, response);
        statusCode = response.statusCode || 200;
        return;
      }
      if (url.pathname === '/api/auth/logout') {
        await logoutUser(request, response);
        statusCode = response.statusCode || 200;
        return;
      }
    }

    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      response.setHeader('allow', 'GET, HEAD, POST, PUT, PATCH, DELETE');
      statusCode = 405;
      sendJson(response, statusCode, { error: 'यह HTTP method समर्थित नहीं है।' });
      return;
    }

    // HEAD के लिए GET रूट का status/header दें, लेकिन body न भेजें।
    const routeKey = `${request.method === 'HEAD' ? 'GET' : request.method} ${url.pathname}`;
    const route = routes.get(routeKey);
    if (!route) {
      statusCode = 404;
      sendJson(response, statusCode, { error: 'यह रास्ता उपलब्ध नहीं है।' });
      return;
    }

    const result = await route(request, url);
    statusCode = result.statusCode;
    if (request.method === 'HEAD') {
      const body = JSON.stringify(result.body);
      response.writeHead(statusCode, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none';",
      });
      response.end();
    } else {
      sendJson(response, statusCode, result.body);
    }
  } catch (error) {
    statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    // विवरण केवल स्थानीय server log में; ग्राहक को stack trace नहीं भेजते।
    if (statusCode === 500) {
      console.error('अनुरोध संसाधित करने में त्रुटि:', error);
      const diagnostic = `${new Date().toISOString()} ${request.method} ${url?.pathname || safePath(request.url)}\n${String(error?.stack || error).slice(0, 6000)}\n\n`;
      await fsp.appendFile(path.join(__dirname, 'exchange-local-error.log'), diagnostic, 'utf8').catch(() => {});
    }
    if (!response.headersSent && !response.destroyed) {
      const message = statusCode === 500 ? 'सर्वर में आंतरिक त्रुटि हुई।' : error.message;
      sendJson(response, statusCode, { error: message });
    }
  } finally {
    // संवेदनशील query/body के बिना छोटा संचालन लॉग।
    console.log(`${request.method} ${safePath(request.url)} ${statusCode} ${Date.now() - startedAt}ms`);
  }
}

function safePath(requestUrl) {
  try {
    return new URL(requestUrl || '/', 'http://localhost').pathname.slice(0, 200);
  } catch {
    return '/[invalid-url]';
  }
}

// 5–6) सर्वर बनाना, टाइमआउट सीमित करना और बंद होते समय अनुरोध पूरे करने देना।
const server = http.createServer((request, response) => {
  void handleRequest(request, response);
});
server.requestTimeout = REQUEST_TIMEOUT_MS;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

server.on('clientError', (_error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});
server.on('error', (error) => {
  console.error('HTTP सर्वर शुरू नहीं हो सका:', error.code || 'अज्ञात त्रुटि');
  process.exitCode = 1;
  void db.end();
});

async function startServer() {
  try {
    await initializeDatabase();
    server.listen(PORT, HOST, () => {
      console.log(`Exchange API http://${HOST}:${PORT} पर चल रहा है।`);
      console.log('✓ Supabase / PostgreSQL डेटाबेस कनेक्शन सक्रिय और तैयार है।');
    });
  } catch (error) {
    console.error('✗ डेटाबेस कनेक्शन विफल; API शुरू नहीं की गई:', error.message);
    process.exitCode = 1;
    await db.end();
  }
}
void startServer();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`${signal} मिला; सर्वर व्यवस्थित रूप से बंद हो रहा है।`);
    server.close((error) => {
      if (error) {
        console.error('सर्वर बंद करने में त्रुटि:', error);
        process.exitCode = 1;
      }
      void db.end();
    });
    // लंबे समय तक खुले रहने वाले कनेक्शन पर बंद करना अटका न रहे।
    setTimeout(() => server.closeAllConnections(), 5_000).unref();
  });
}
