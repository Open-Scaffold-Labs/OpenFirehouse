'use strict';
/**
 * server/scripts/migrate.js — minimal forward-only SQL migration runner.
 *
 * Per docs/RLS-AND-MIGRATIONS-PLAN.md §4. Run MANUALLY from Matt's Mac with the
 * prod DATABASE_URL — NEVER from Vercel deploys (DDL must not ride app cold
 * starts; the initDb() fast-path stays as-is).
 *
 *   DATABASE_URL=postgres://… node server/scripts/migrate.js            # apply pending
 *   DATABASE_URL=postgres://… node server/scripts/migrate.js --dry-run  # list only
 *
 * Contract:
 *   - Migrations live in docs/migrations/NNNN-*.sql, applied in filename order.
 *   - Each file runs in ONE transaction; recorded in of_schema_migrations on
 *     success only. First failure stops the run (forward-only, no auto-rollback
 *     of earlier files — they already committed).
 *   - A Postgres advisory lock prevents two runners racing.
 *   - Files must be idempotent (IF NOT EXISTS / guarded) so a re-run is safe.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { buildSslConfig } = require('../src/sslConfig');

const MIGRATIONS_DIR = path.join(__dirname, '../../docs/migrations');
const LOCK_KEY = 4815162342; // arbitrary, stable advisory-lock id for OF migrations
const dryRun = process.argv.includes('--dry-run');

function fail(msg, err) {
  console.error(`✗ ${msg}${err ? ' — ' + err.message : ''}`);
  process.exitCode = 1;
}

(async () => {
  if (!process.env.DATABASE_URL) return fail('DATABASE_URL not set');
  const url = process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
  const remote = !url.includes('localhost') && !url.includes('127.0.0.1');
  const pool = new Pool({
    connectionString: url,
    ssl: buildSslConfig(remote), // pin Supabase CA when DATABASE_CA is set; see docs/ops/prod-db-tls-ca-pinning.md
    max: 1,
    connectionTimeoutMillis: 8000,
  });

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS of_schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    // serialize concurrent runners
    const lock = await pool.query('SELECT pg_try_advisory_lock($1) AS got', [LOCK_KEY]);
    if (!lock.rows[0].got) return fail('another migration run holds the lock; aborting');

    try {
      const applied = new Set(
        (await pool.query('SELECT filename FROM of_schema_migrations')).rows.map(r => r.filename)
      );
      const all = fs.existsSync(MIGRATIONS_DIR)
        ? fs.readdirSync(MIGRATIONS_DIR).filter(f => /^\d{4}-.*\.sql$/.test(f)).sort()
        : [];
      const pending = all.filter(f => !applied.has(f));

      console.log(`of_schema_migrations: ${applied.size} applied, ${all.length} on disk, ${pending.length} pending`);
      if (!pending.length) { console.log('Nothing to do.'); return; }

      for (const f of pending) {
        if (dryRun) { console.log(`[dry-run] would apply ${f}`); continue; }
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('INSERT INTO of_schema_migrations (filename) VALUES ($1)', [f]);
          await client.query('COMMIT');
          console.log(`✓ applied ${f}`);
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          fail(`${f} rolled back; stopping`, err);
          break;
        } finally {
          client.release();
        }
      }
    } finally {
      await pool.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    }
  } catch (err) {
    fail('runner error', err);
  } finally {
    await pool.end().catch(() => {});
  }
})();
