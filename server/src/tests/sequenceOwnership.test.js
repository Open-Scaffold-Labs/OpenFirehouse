'use strict';
/**
 * sequenceOwnership.test.js — guards the schema invariant that broke the FIRST
 * self-serve signup on a fresh install.
 *
 * Every serial id column must OWN its sequence (an `ALTER SEQUENCE ... OWNED BY`
 * must be present, so pg_get_serial_sequence resolves). When that link is
 * missing — as it was in the catalog-extracted db/baseline.sql — the sequence
 * reconciliation in applyDepartmentExpand()/reconcileSequences() silently
 * no-ops, leaving departments_id_seq behind departments.id. The next
 * nextval() then collides on departments_pkey, and the signup catch historically
 * mislabeled that 23505 as USERNAME_TAKEN. Only the FIRST signup failed, so it
 * surfaced as an order-dependent flake.
 *
 * This test turns that into a LOUD, DETERMINISTIC failure: if the baseline ever
 * loses OWNED BY again, it fails here with the exact offending columns — not as a
 * random CI flake. Schema-only (no app boot); opt-in via TENANCY_TEST_DB.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  test('sequence ownership (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  test('every serial id column owns its sequence (ALTER SEQUENCE ... OWNED BY present)', async () => {
    const pool = new Pool({ connectionString: TENANCY_TEST_DB, max: 1 });
    try {
      const { rows } = await pool.query(`
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_default LIKE 'nextval(%'
          AND pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) IS NULL
        ORDER BY c.table_name, c.column_name
      `);
      assert.strictEqual(
        rows.length, 0,
        'serial columns missing OWNED BY (pg_get_serial_sequence returns NULL) — ' +
        'the baseline is missing ALTER SEQUENCE ... OWNED BY and signup reconciliation ' +
        'will silently fail: ' + rows.map((r) => `${r.table_name}.${r.column_name}`).join(', ')
      );
    } finally {
      await pool.end();
    }
  });
}
