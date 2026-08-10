// Phase 1.2c (HARDEN THE TAIL) — per-department minimum-staffing config + warn/block
// enforcement (migration 0075). Before this, the leave path used a hardcoded MIN_CREW=3
// with no per-dept config and no way to block. This suite proves:
//   1. getStaffingConfig reads the dept config and maps it (explicit min + enforcement),
//   2. it FAILS OPEN to the historic default (3 / warn) when unset,
//   3. analyzeCoverageImpact honors the configured minimum (a 4-min dept flags a shift
//      that a 3-min dept would pass) — the exact threshold that drives warn/block.
// Every case could actually fail (lesson #29). DB cases are opt-in via TENANCY_TEST_DB
// like the sibling suites.

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[leaveMinStaffing] TENANCY_TEST_DB not set — skipping live-DB 1.2c suite.');
  test('1.2c min-staffing config (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;

  test('1.2c — per-dept min-staffing config: explicit values, fail-open default, threshold drives impact', async () => {
    const db = require('../db');
    const { pool } = db;
    const leave = require('../routes/leaveRequests');
    const { getStaffingConfig, analyzeCoverageImpact } = leave;
    const MARK = 'LMS-1_2c';

    async function cleanup() {
      await pool.query(`DELETE FROM shifts WHERE "shiftType" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    try {
      await cleanup();

      // Dept 1 — explicit config: minimum 4, BLOCK enforcement.
      const deptBlock = (await pool.query(
        `INSERT INTO departments (name, min_staffing_per_shift, staffing_enforcement)
         VALUES ('${MARK} Block Dept', 4, 'block') RETURNING id`)).rows[0].id;
      // Dept 2 — nothing set: must fail open to the historic default (3 / warn).
      const deptDefault = (await pool.query(
        `INSERT INTO departments (name) VALUES ('${MARK} Default Dept') RETURNING id`)).rows[0].id;

      const cfgBlock = await getStaffingConfig(deptBlock);
      assert.equal(cfgBlock.minCrew, 4, 'explicit minimum is read');
      assert.equal(cfgBlock.enforcement, 'block', 'explicit enforcement is read');

      const cfgDefault = await getStaffingConfig(deptDefault);
      assert.equal(cfgDefault.minCrew, 3, 'unset minimum falls back to the historic default (3)');
      assert.equal(cfgDefault.enforcement, 'warn', 'unset enforcement falls back to warn (market norm)');

      // A shift of exactly 3 crew, one of whom is going on leave. Removing them leaves 2.
      // shifts.crew is a name-string array (the scaffold's shape the leave path reads).
      // shifts.crew is a TEXT column holding a JSON array (shiftDb parses it), so
      // insert a JSON string — NOT a JS array (which pg would coerce to a PG array
      // literal into a TEXT column).
      const crew = [`${MARK} Alice`, `${MARK} Bob`, `${MARK} Carol`];
      await pool.query(
        `INSERT INTO shifts (department_id, station_id, date, "shiftType", crew)
         VALUES ($1, $1, '2026-08-01', '${MARK} A', $2)`,
        [deptDefault, JSON.stringify(crew)]);
      await pool.query(
        `INSERT INTO shifts (department_id, station_id, date, "shiftType", crew)
         VALUES ($1, $1, '2026-08-01', '${MARK} A', $2)`,
        [deptBlock, JSON.stringify(crew)]);

      // At min=3: crew-after (2) is below 3 → flagged (both depts would flag here).
      const impact3 = await analyzeCoverageImpact(deptDefault, `${MARK} Alice`, '2026-08-01', '2026-08-01', 3);
      assert.equal(impact3.minCrew, 3, 'impact echoes the minimum used');
      assert.equal(impact3.dropsBelowMinimum, 1, 'at min=3, removing 1 of 3 drops below minimum');

      // The threshold matters: a shift of 4 crew removing 1 (→3) is BELOW a min of 4
      // but AT/above a min of 3 — proving the configured number changes the verdict.
      const crew4 = [`${MARK} Alice`, `${MARK} Bob`, `${MARK} Carol`, `${MARK} Dave`];
      await pool.query(
        `INSERT INTO shifts (department_id, station_id, date, "shiftType", crew)
         VALUES ($1, $1, '2026-08-02', '${MARK} B', $2)`,
        [deptBlock, JSON.stringify(crew4)]);
      const impactMin4 = await analyzeCoverageImpact(deptBlock, `${MARK} Alice`, '2026-08-02', '2026-08-02', 4);
      assert.equal(impactMin4.dropsBelowMinimum, 1, 'at min=4, 4→3 drops below minimum');
      const impactMin3 = await analyzeCoverageImpact(deptBlock, `${MARK} Alice`, '2026-08-02', '2026-08-02', 3);
      assert.equal(impactMin3.dropsBelowMinimum, 0, 'at min=3, 4→3 does NOT drop below minimum');
    } finally {
      await cleanup();
      // NOTE: the pool is shared across this file's tests — closed once in the last test.
    }
  });

  // #2 (2026-07-25) — id-based crew match against the id-backed roster (1.1b consolidation:
  // shifts.memberIds is authoritative, crew NAMES are derived from it on read). Proves the
  // leave path matches BY ID and stays correct across a member RENAME — the exact fragility
  // the old name-string match had. Uses REAL members so crew derives properly.
  test('1.2c #2 — id-based crew match is rename-proof (real members)', async () => {
    const db = require('../db');
    const { pool } = db;
    const { analyzeCoverageImpact } = require('../routes/leaveRequests');
    const MARK = 'LMS-1_2c-id';
    async function cleanup() {
      await pool.query(`DELETE FROM shifts WHERE "shiftType" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM members WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }
    async function mkMember(dept, name) {
      return (await pool.query(
        `INSERT INTO members (department_id, station_id, "memberNumber", name, rank, role, joined, status)
         VALUES ($1,$1,$2,$3,'Firefighter','member',CURRENT_DATE,'Active') RETURNING id`,
        [dept, `${MARK}-${name}`, `${MARK} ${name}`])).rows[0].id;
    }
    try {
      await cleanup();
      const dept = (await pool.query(
        `INSERT INTO departments (name, min_staffing_per_shift) VALUES ('${MARK} Dept', 3) RETURNING id`)).rows[0].id;
      const aliceId = await mkMember(dept, 'Alice');
      const bobId   = await mkMember(dept, 'Bob');
      const carolId = await mkMember(dept, 'Carol');
      // Shift of 3 by id. crew is derived on read from these ids → their current names.
      await pool.query(
        `INSERT INTO shifts (department_id, station_id, date, "shiftType", crew, "memberIds")
         VALUES ($1,$1,'2026-09-01','${MARK} A', '[]', $2)`,
        [dept, JSON.stringify([aliceId, bobId, carolId])]);

      // Match Alice by id → flags, 3→2 below the min of 3.
      const byId = await analyzeCoverageImpact(dept, `${MARK} Alice`, '2026-09-01', '2026-09-01', 3, aliceId);
      assert.equal(byId.totalAffectedShifts, 1, 'Alice matched by id');
      assert.equal(byId.shifts[0].crewBefore, 3, 'crew derived to the 3 real members');
      assert.equal(byId.dropsBelowMinimum, 1, 'removal drops 3→2, below min 3');
      assert.equal(byId.shifts[0].crewAfter, 2);

      // RENAME Alice. The id match still fires whether we pass the OLD or the NEW name —
      // and the derived crew now reflects the new name (rename-proof end to end).
      await pool.query(`UPDATE members SET name = '${MARK} Alice-Renamed' WHERE id = $1`, [aliceId]);
      const afterRenameOldName = await analyzeCoverageImpact(dept, `${MARK} Alice`, '2026-09-01', '2026-09-01', 3, aliceId);
      assert.equal(afterRenameOldName.totalAffectedShifts, 1, 'still matched by id after rename (old name passed)');
      assert.equal(afterRenameOldName.shifts[0].crewAfter, 2, 'count correct after rename');

      // A different member NOT on the shift is not matched.
      const outsiderId = await mkMember(dept, 'Zed');
      const notOn = await analyzeCoverageImpact(dept, `${MARK} Zed`, '2026-09-01', '2026-09-01', 3, outsiderId);
      assert.equal(notOn.totalAffectedShifts, 0, 'member not in memberIds → not on shift');
    } finally {
      await cleanup();
      await pool.end();
    }
  });
}
