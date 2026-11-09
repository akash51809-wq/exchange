'use strict';

/**
 * Supabase Security Hardening Script
 * -----------------------------------
 * Resolves Supabase Security Advisor Critical Issues:
 * 1. rls_disabled_in_public (Table publicly accessible without Row-Level Security)
 * 2. sensitive_columns_exposed (Sensitive tables accessible via Supabase PostgREST API)
 *
 * Actions:
 * - Enables Row-Level Security (RLS) on all tables in schema 'public'.
 * - Revokes ALL permissions from 'anon' and 'authenticated' roles in schema 'public'.
 * - Revokes default privileges for future tables/sequences/routines from 'anon' and 'authenticated'.
 * - Preserves full access for the application's 'postgres' database owner/superuser.
 */

if (typeof process.loadEnvFile === 'function') {
  process.loadEnvFile();
}

const { createSupabaseDbPool } = require('../lib/supabase');

async function applySecurityHardening() {
  const pool = createSupabaseDbPool();
  const client = await pool.connect();

  console.log('--- Starting Supabase Security Hardening ---');

  try {
    await client.query('BEGIN');

    // 1. Enable RLS on all existing tables in public schema
    const tablesRes = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    console.log(`Found ${tablesRes.rows.length} tables in schema 'public'. Enabling Row Level Security...`);

    for (const row of tablesRes.rows) {
      const tableName = row.tablename;
      // Quote table identifier safely
      await client.query(`ALTER TABLE public."${tableName}" ENABLE ROW LEVEL SECURITY;`);
      console.log(`  [OK] ENABLE ROW LEVEL SECURITY on public."${tableName}"`);
    }

    // 2. Revoke permissions from 'anon' and 'authenticated' if those roles exist
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
          REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
          REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
          REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
          REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM authenticated;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM authenticated;
        END IF;
      END $$;
    `);
    console.log('  [OK] Revoked public schema privileges and default privileges from anon and authenticated.');

    await client.query('COMMIT');
    console.log('--- Hardening committed successfully! ---');

    // 3. Verification
    const verifyRls = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public' AND rowsecurity = false;
    `);

    if (verifyRls.rows.length === 0) {
      console.log('Verification Passed: 100% of tables in public schema have RLS ENABLED.');
    } else {
      console.warn('Warning: Some tables still have RLS disabled:', verifyRls.rows);
    }

    const verifyGrants = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM information_schema.role_table_grants 
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
    `);

    console.log(`Remaining table grants for anon/authenticated: ${verifyGrants.rows[0].count} (Expected: 0)`);

    // Verify application query works
    const testQuery = await client.query('SELECT count(*)::int AS user_count FROM users;');
    console.log(`Application DB query test: users count = ${testQuery.rows[0].user_count} (Success)`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during security hardening:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  applySecurityHardening();
}

module.exports = { applySecurityHardening };
