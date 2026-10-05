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

/**
 * Create and configure PostgreSQL connection pool optimized for Supabase
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
    poolConfig.ssl = {
      rejectUnauthorized: false,
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
