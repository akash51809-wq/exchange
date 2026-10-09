'use strict';

const { Pool } = require('pg');

/**
 * Get Supabase / PostgreSQL database connection URL from environment variables
 */
function getDatabaseUrl() {
  return (
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    ''
  ).trim();
}

/**
 * Determines whether the connection target is Supabase or a remote PostgreSQL instance requiring SSL
 */
function isSslRequired(url) {
  if (process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production') return true;
  if (!url) return false;
  // Supabase cloud URLs usually match supabase.co, pooler.supabase.com, aws-0-, etc.
  return (
    url.includes('supabase.co') ||
    url.includes('supabase.com') ||
    url.includes('pooler.supabase') ||
    url.includes('sslmode=require') ||
    !url.includes('127.0.0.1') && !url.includes('localhost')
  );
}

const fs = require('fs');
const path = require('path');

const SUPABASE_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

/**
 * Create and configure PostgreSQL connection pool optimized for Supabase with secure SSL
 */
function createSupabaseDbPool() {
  const connectionString = getDatabaseUrl();

  const poolConfig = {
    connectionString: connectionString || undefined,
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: false,
  };

  if (isSslRequired(connectionString)) {
    // Resolve CA certificate: environment variable, file on disk, or bundled Supabase Root CA
    let caCert = process.env.DB_SSL_CA || null;
    if (!caCert) {
      const caFilePath = path.join(__dirname, '..', 'certs', 'supabase-root-ca.crt');
      if (fs.existsSync(caFilePath)) {
        try {
          caCert = fs.readFileSync(caFilePath, 'utf8');
        } catch (_) {}
      }
    }
    if (!caCert) {
      caCert = SUPABASE_ROOT_CA;
    }

    // Enforce strict certificate verification by default
    const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true;

    poolConfig.ssl = {
      rejectUnauthorized,
      ca: caCert,
    };
  }

  const pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    console.error('[Supabase DB Pool Error]:', err.message);
  });

  return pool;
}

/**
 * Initialize Supabase Client (if SUPABASE_URL and key are provided)
 */
function createSupabaseClientInstance() {
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY ||
    ''
  ).trim();

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (err) {
    console.warn('[Supabase Client] Optional @supabase/supabase-js not loaded:', err.message);
    return null;
  }
}

module.exports = {
  getDatabaseUrl,
  isSslRequired,
  createSupabaseDbPool,
  createSupabaseClientInstance,
};
