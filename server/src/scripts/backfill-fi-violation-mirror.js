'use strict';
/**
 * scripts/backfill-fi-violation-mirror.js — one-time backfill (P1-3, 2026-07-16).
 *
 * fi_violations (the queryable mirror, migration 0047) is written by the app's
 * inspection writers — but inspections whose violations JSON predates the mirror
 * (or arrived via seeds/tests that bypassed the writers) have NO mirror rows, so
 * /api/fi-reports/open-violations silently under-reports the open set.
 *
 * Idempotent: syncViolationRows upserts by (inspection_id, violation_key) and
 * never re-mints violation identity. Refuses to run without an explicit
 * DATABASE_URL (house rule — never silently default to localhost).
 *
 *   DATABASE_URL=postgresql://… node server/src/scripts/backfill-fi-violation-mirror.js
 */
const { Pool } = require('pg');
const { syncViolationRows } = require('../utils/fiViolationSync');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Refusing to run: set DATABASE_URL explicitly.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const { rows } = await pool.query(
    `SELECT id, department_id, violations FROM fi_inspections
     WHERE deleted_at IS NULL AND violations IS NOT NULL ORDER BY id`);
  let synced = 0, empty = 0;
  for (const r of rows) {
    let violations = r.violations;
    if (typeof violations === 'string') { try { violations = JSON.parse(violations); } catch { violations = []; } }
    if (!Array.isArray(violations) || violations.length === 0) { empty += 1; continue; }
    await syncViolationRows(pool, { id: r.id, violations }, r.department_id);
    synced += 1;
  }
  console.log(JSON.stringify({ inspections_seen: rows.length, synced, empty }));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
