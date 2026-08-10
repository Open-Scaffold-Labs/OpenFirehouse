'use strict';
// 0066 — department-keyed run foundation (HARDEN THE TAIL, Phase 0.4).
//
// The four "who's riding" tables (active_boards, run_lists,
// apparatus_assignments, apparatus_positions) used to carry a station_id FK
// that every writer populated with req.user.department_id. It held only
// because seed installs have station.id == department_id — the first
// multi-house department would have either FK-failed every board write or,
// worse, had trg_sync_department_id stamp ANOTHER department's id on the row
// (cross-tenant corruption). 0066 re-keys all four on department_id.
//
// This suite is the MULTI-HOUSE ADVERSARIAL test: it uses department ids that
// deliberately do NOT rely on a same-id station existing, and proves the exact
// operations that would have broken pre-0066 now work — plus that the schema
// REFUSES a tenant-less write (the door is closed, not just repainted).
//
// Opt-in like the other live-DB suites:
//   cd server && TENANCY_TEST_DB='postgresql://matthewlavin@localhost:5432/freestation' npm test

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

// Static regression guard (runs even without a DB): routes/importRunList.js
// CALLS resolveCrewSeats — it must REQUIRE it. Before 2026-07-22 it did not,
// so every import request died with a ReferenceError inside its transaction.
// This check failed on the pre-fix file; that is what makes it verification.
test('importRunList requires the seat resolver it calls', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'importRunList.js'), 'utf8');
  if (/\bresolveCrewSeats\s*\(/.test(src)) {
    assert.match(
      src,
      /require\(['"]\.\.\/utils\/resolveCrewSeats['"]\)/,
      'importRunList.js calls resolveCrewSeats but never requires it (ReferenceError at runtime)'
    );
  }
});

if (!TENANCY_TEST_DB) {
  console.log('[departmentKeyFoundation] TENANCY_TEST_DB not set — skipping live-DB 0066 suite.');
  test('0066 department-key foundation (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;

  test('0066 — department-keyed run foundation (multi-house adversarial)', async (t) => {
    const db = require('../db');
    const { pool } = db;
    const MARK = 'DKF-0066';
    let deptA = null;
    let deptB = null;

    async function cleanup() {
      await pool.query(`DELETE FROM run_lists WHERE payload::text LIKE '%${MARK}%'`);
      await pool.query(`DELETE FROM active_boards WHERE incident_type LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    try {
      await cleanup(); // a crashed previous run never poisons this one

      // Two fresh departments. Their ids come off the departments sequence and
      // are NOT required to match any station id — that independence is the
      // exact condition that broke the old schema.
      const a = await pool.query(
        `INSERT INTO departments (name) VALUES ('${MARK} Dept A') RETURNING id`);
      const b = await pool.query(
        `INSERT INTO departments (name) VALUES ('${MARK} Dept B') RETURNING id`);
      deptA = a.rows[0].id;
      deptB = b.rows[0].id;

      // Per-station roster grain (0072): run_lists is keyed on (department, STATION, date),
      // and station_id is NOT NULL — each dept needs a house to publish a board under.
      const stnA = (await pool.query(
        `INSERT INTO stations (department_id, name, address, city, state) VALUES ($1, '${MARK} Station A', '', '', '') RETURNING id`,
        [deptA])).rows[0].id;
      const stnB = (await pool.query(
        `INSERT INTO stations (department_id, name, address, city, state) VALUES ($1, '${MARK} Station B', '', '', '') RETURNING id`,
        [deptB])).rows[0].id;

      const aHasTwinStation = (await pool.query(
        'SELECT 1 FROM stations WHERE id = $1', [deptA])).rowCount > 0;

      // ── active_boards: the board write that was the time bomb ──────────────
      const board = await db.activeBoard.upsert(deptA, {
        incidentType: `${MARK} Structure Fire`, address: '1 Main St',
        personnelCount: 4, unitsCount: 2,
      });
      assert.equal(Number(board.department_id), Number(deptA), 'board keys on department_id');
      assert.equal(board.station_id, null,
        `station_id must not be written by the board upsert${aHasTwinStation ? ' (a same-id station exists — proving independence matters here)' : ''}`);

      // Upsert is idempotent per department (ON CONFLICT department_id)
      await db.activeBoard.upsert(deptA, { incidentType: `${MARK} Updated`, address: '1 Main St' });
      const count = await pool.query(
        'SELECT count(*)::int AS n FROM active_boards WHERE department_id = $1', [deptA]);
      assert.equal(count.rows[0].n, 1, 'one board row per department');

      // Department isolation: B's board is B's alone; clearing A leaves B.
      await db.activeBoard.upsert(deptB, { incidentType: `${MARK} MVA`, address: '2 Oak St' });
      const gotA = await db.activeBoard.get(deptA);
      const gotB = await db.activeBoard.get(deptB);
      assert.equal(gotA.incident_type, `${MARK} Updated`);
      assert.equal(gotB.incident_type, `${MARK} MVA`);
      await db.activeBoard.clear(deptA);
      assert.equal(await db.activeBoard.get(deptA), null, 'A cleared');
      assert.ok(await db.activeBoard.get(deptB), 'B untouched by A clear');

      // ── run_lists: snapshot anchors on (department_id, station_id, date) ────
      const date = '2099-01-01';
      const payload = (tag) => JSON.stringify({ date, crew: [], tag: `${MARK}-${tag}` });
      await pool.query(
        `INSERT INTO run_lists (department_id, station_id, date, payload, submitted_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (department_id, station_id, date) DO UPDATE SET payload = EXCLUDED.payload`,
        [deptA, stnA, date, payload('a1')]);
      await pool.query(
        `INSERT INTO run_lists (department_id, station_id, date, payload, submitted_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (department_id, station_id, date) DO UPDATE SET payload = EXCLUDED.payload`,
        [deptA, stnA, date, payload('a2')]);
      await pool.query(
        `INSERT INTO run_lists (department_id, station_id, date, payload, submitted_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (department_id, station_id, date) DO UPDATE SET payload = EXCLUDED.payload`,
        [deptB, stnB, date, payload('b1')]);
      const rl = await pool.query(
        `SELECT department_id, payload->>'tag' AS tag FROM run_lists
          WHERE date = $1 AND payload::text LIKE '%${MARK}%' ORDER BY department_id`, [date]);
      assert.equal(rl.rowCount, 2, 'same date, two departments, two rows — upsert collapsed A to one');
      assert.deepEqual(rl.rows.map((r) => r.tag).sort(), [`${MARK}-a2`, `${MARK}-b1`]);

      // ── the door is CLOSED: a tenant-less write is refused by the schema ───
      await assert.rejects(
        () => pool.query(
          `INSERT INTO run_lists (date, payload) VALUES ('2099-01-02', $1)`,
          [payload('orphan')]),
        (e) => e.code === '23502',
        'run_lists without department_id (and no station to derive it from) must be a NOT NULL violation'
      );
      await assert.rejects(
        () => pool.query(
          `INSERT INTO active_boards (incident_type) VALUES ('${MARK} orphan')`),
        (e) => e.code === '23502',
        'active_boards without department_id must be a NOT NULL violation'
      );
    } finally {
      await cleanup();
      await pool.end().catch(() => {});
    }
  });
}
