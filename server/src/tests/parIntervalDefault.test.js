'use strict';
/**
 * 0062 — departments.par_interval_default_min (the SOG default PAR interval).
 *
 * NULL = no timer until command sets one (there is NO NFPA-mandated PAR
 * interval — the default is the department's own SOG number, never ours).
 * The DB CHECK guards the range because a typo here mis-arms a life-safety
 * reminder: 0 would silently disable what the department asked for.
 */

// DATABASE_URL must be set BEFORE any require that pulls in db.js.
if (process.env.TENANCY_TEST_DB) process.env.DATABASE_URL = process.env.TENANCY_TEST_DB;

const test = require('node:test');
const assert = require('node:assert/strict');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

test('par_interval_default_min: persists, clears, and the CHECK rejects bad cadences', { skip: !TENANCY_TEST_DB && 'requires TENANCY_TEST_DB' }, async () => {
  const db = require('../db');
  await db.ready;
  const { pool } = db;

  // A throwaway department so we never touch dept 1's real settings.
  const { rows: [dept] } = await pool.query(
    `INSERT INTO departments (name, fdid) VALUES ('PAR Default Test FD', '') RETURNING id`
  );
  try {
    // Default state: NULL (no timer until command sets one).
    const { rows: [fresh] } = await pool.query(
      'SELECT par_interval_default_min FROM departments WHERE id = $1', [dept.id]);
    assert.equal(fresh.par_interval_default_min, null);

    // A legal SOG cadence persists and reads back as a NUMBER (F10: pg types).
    await pool.query('UPDATE departments SET par_interval_default_min = $2 WHERE id = $1', [dept.id, 20]);
    const { rows: [set] } = await pool.query(
      'SELECT par_interval_default_min FROM departments WHERE id = $1', [dept.id]);
    assert.equal(set.par_interval_default_min, 20);
    assert.equal(typeof set.par_interval_default_min, 'number');

    // Clearing back to NULL is the explicit "off" spelling.
    await pool.query('UPDATE departments SET par_interval_default_min = NULL WHERE id = $1', [dept.id]);
    const { rows: [cleared] } = await pool.query(
      'SELECT par_interval_default_min FROM departments WHERE id = $1', [dept.id]);
    assert.equal(cleared.par_interval_default_min, null);

    // The CHECK fires on every out-of-range cadence — probes that CAN fail.
    for (const bad of [0, -5, 181, 1000]) {
      await assert.rejects(
        pool.query('UPDATE departments SET par_interval_default_min = $2 WHERE id = $1', [dept.id, bad]),
        /departments_par_interval_default_chk/,
        `CHECK should reject ${bad}`
      );
    }

    // Nothing persisted from the rejected updates.
    const { rows: [after] } = await pool.query(
      'SELECT par_interval_default_min FROM departments WHERE id = $1', [dept.id]);
    assert.equal(after.par_interval_default_min, null);
  } finally {
    await pool.query('DELETE FROM departments WHERE id = $1', [dept.id]);
  }
});

test('PATCH schema: the route vocabulary matches the DB CHECK range', () => {
  // The zod bound and the DB CHECK must agree — a value the route accepts but
  // the DB refuses becomes an opaque 500 in a chief's face.
  const src = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '../routes/departments.js'), 'utf8');
  assert.ok(/par_interval_default_min:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(180\)\.nullable\(\)\.optional\(\)/.test(src),
    'departments PATCH schema carries the 1-180 nullable int field');
});
