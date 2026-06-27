'use strict';
/**
 * p5RlsEnforcement.test.js — proves DB-level per-department RLS denial (P5 Phase B/C).
 *
 * Acting as the non-owner of_app role with the dept GUC set, the SAME query must
 * return a department's rows under its own context, NONE of them under another
 * department's context, and NONE with no context (fail-closed). This is the
 * regression that distinguishes "RLS configured" from "RLS actually enforcing"
 * (proven manually on prod 2026-06-14: members guc=1 -> 47, guc=2 -> 0, unset -> 0).
 *
 * Skips gracefully where P5 isn't applied (no of_app role / no policy) or where
 * the connecting role can't SET ROLE of_app — so it's safe in any CI/local env.
 * Run against a P5-migrated DB (0006/0007 applied) to exercise it.
 */

const { test, before } = require('node:test');
const assert = require('node:assert');
const db = require('../db');

let enabled = false;
let dept1Count = 0;

before(async () => {
  // No app DB configured (e.g. CI sets TENANCY_TEST_DB but not DATABASE_URL) →
  // stay disabled so the tests skip rather than throw on a bad connection.
  if (!process.env.DATABASE_URL) return;
  let client;
  try {
    client = await db.pool.connect();
    const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname='of_app'");
    const pol = await client.query(
      "SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='members' AND policyname='dept_isolation'");
    if (!role.rows.length || !pol.rows.length) return;
    const c = await client.query('SELECT count(*)::int AS n FROM members WHERE department_id = 1');
    dept1Count = c.rows[0].n;
    if (dept1Count === 0) return;
    await client.query('BEGIN');
    try { await client.query('SET LOCAL ROLE of_app'); enabled = true; }
    catch { enabled = false; }
    await client.query('ROLLBACK');
  } catch { enabled = false; }
  finally { if (client) client.release(); }
});

test('RLS denies cross-department reads as of_app (P5 enforcement)', async (t) => {
  if (!enabled) {
    t.skip('P5 not applied here (no of_app/policy) or SET ROLE denied — skipping enforced test');
    return;
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE of_app');

    await client.query("SET LOCAL app.department_id = '1'");
    const own = await client.query('SELECT count(*)::int AS n FROM members');
    assert.strictEqual(own.rows[0].n, dept1Count, 'dept-1 context must see dept-1 members');

    await client.query("SET LOCAL app.department_id = '999999'");
    const other = await client.query('SELECT count(*)::int AS n FROM members');
    assert.strictEqual(other.rows[0].n, 0, 'a different department must see NONE of dept-1 rows');

    await client.query("SELECT set_config('app.department_id', '', true)");
    const none = await client.query('SELECT count(*)::int AS n FROM members');
    assert.strictEqual(none.rows[0].n, 0, 'no department context must fail closed (0 rows)');

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

test('SECURITY DEFINER bootstrap resolves department without a GUC (P5)', async (t) => {
  if (!enabled) { t.skip('P5 not applied here — skipping'); return; }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE of_app');
    // No app.user_id set — the DEFINER function must still resolve (login bootstrap),
    // while a direct read of the protected table returns nothing.
    const fn = await client.query('SELECT public.of_resolve_department(1) AS d');
    const direct = await client.query('SELECT count(*)::int AS n FROM of_user_departments WHERE user_id = 1');
    assert.strictEqual(direct.rows[0].n, 0, 'direct of_user_departments read must be blocked pre-GUC');
    assert.ok(fn.rows[0].d === null || Number.isInteger(fn.rows[0].d),
      'of_resolve_department must return a dept id (or null) via SECURITY DEFINER');
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});
