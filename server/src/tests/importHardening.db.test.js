'use strict';
// DB-backed /api/import hardening test (M4, 2026-06-15).
//
// Proves the hardening for ALL FIVE record types: idempotent (re-import never
// duplicates), per-row validation, within-batch dedup. The all-or-nothing
// transaction property is structurally guaranteed by runInTransaction (the same
// runner the proven importRunList uses).
//
// Opt-in via TENANCY_TEST_DB; uses station/dept 1 (present in the test DB so the
// trg_sync_department_id trigger resolves a real department) with clearly-marked
// fixtures, cleaned up before and after. Never calls pool.end() (shared
// singleton across the run — db.js Lesson #4).

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[importHardening] TENANCY_TEST_DB not set — skipping live import suite.');
  test('import hardening (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  const { runImport } = require('../routes/import');
  const { pool, runInTransaction } = require('../db');

  const DEPT = 1; // station 1 / dept 1 exists in the test DB

  // One valid fixture row per type + a cleanup query that removes only it.
  const FIX = {
    members:   { row: { firstName: 'ZZIMP', lastName: 'Tester', rank: 'Firefighter' },
                 cleanup: "DELETE FROM members WHERE name = 'ZZIMP Tester'" },
    incidents: { row: { incidentNumber: 'ZZ-IMP-INC-9001', date: '2025-01-01', type: 'ZZ Test', units: 'Engine 1, Rescue 1' },
                 cleanup: `DELETE FROM incidents WHERE "incidentNumber" = 'ZZ-IMP-INC-9001'` },
    training:  { row: { memberName: 'ZZIMP Tester', courseName: 'ZZ-IMP Course', completionDate: '2025-01-01', hoursCompleted: '4' },
                 cleanup: `DELETE FROM training WHERE "courseName" = 'ZZ-IMP Course'` },
    apparatus: { row: { unitId: 'ZZ-IMPORT-TEST-E1', type: 'Engine' },
                 cleanup: "DELETE FROM apparatus WHERE designation LIKE 'ZZ-IMPORT-TEST%'" },
    assets:    { row: { name: 'ZZ-IMP Asset', serialNumber: 'ZZ-IMP-SN-1' },
                 cleanup: "DELETE FROM assets WHERE name = 'ZZ-IMP Asset'" },
  };

  // Every type: a valid row inserts once, then a re-import is a no-op (idempotent).
  for (const [type, { row, cleanup }] of Object.entries(FIX)) {
    test(`import ${type}: inserts then is idempotent on re-import (M4)`, async () => {
      await pool.query(cleanup);
      try {
        const r1 = await runInTransaction((c) => runImport(type, [row], DEPT, c));
        assert.equal(r1.imported, 1, `${type}: first import inserts the row`);
        assert.equal(r1.failed, 0, `${type}: no failures on first import`);

        const r2 = await runInTransaction((c) => runImport(type, [row], DEPT, c));
        assert.equal(r2.imported, 0, `${type}: re-import inserts nothing (idempotent)`);
        assert.equal(r2.failed, 1, `${type}: the existing row is reported as skipped`);
      } finally {
        await pool.query(cleanup);
      }
    });
  }

  // Apparatus also exercises within-batch dedup + per-row validation in one batch.
  test('import apparatus: within-batch dedup + validation (M4)', async () => {
    const TAG = 'ZZ-IMPORT-TEST';
    const clean = () => pool.query('DELETE FROM apparatus WHERE designation LIKE $1', [`${TAG}%`]);
    await clean();
    try {
      const rows = [
        { unitId: `${TAG}-E1`, type: 'Engine' },
        { unitId: `${TAG}-L1`, type: 'Ladder' },
        { unitId: `${TAG}-E1`, type: 'Engine' }, // duplicate within the same batch
        { unitId: '',          type: 'Engine' }, // invalid — no unitId
      ];
      const r = await runInTransaction((c) => runImport('apparatus', rows, DEPT, c));
      assert.equal(r.imported, 2, 'inserts the 2 unique valid rows');
      assert.equal(r.failed, 2, '1 within-batch duplicate + 1 invalid row');

      const { rows: countRows } = await pool.query(
        'SELECT count(*)::int AS n FROM apparatus WHERE designation LIKE $1', [`${TAG}%`]);
      assert.equal(countRows[0].n, 2, 'exactly 2 rows on disk — no duplicates');
    } finally {
      await clean();
    }
  });
}
