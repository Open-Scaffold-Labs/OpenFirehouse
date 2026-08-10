'use strict';
// Phase 1.1b (HARDEN THE TAIL) — scheduling calendar core + run-store
// consolidation + roster canonicalization adversarial suite.
//
// Every live-DB case here was first run as a manual probe this session; this
// file makes them permanent and could-actually-fail (lesson #29). DB cases are
// opt-in via TENANCY_TEST_DB like the sibling suites.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  isOnDutyForDate, resolvePatternConfig, PATTERN_PRESETS, detectConflicts,
} = require('../utils/shiftPatternEngine');
const { addDaysISO } = require('../utils/localDate');

// ── Pure: named presets + generalized cycle produce the right tours ──────────
function seq(pattern, anchor, days) {
  let out = '';
  let d = anchor;
  for (let i = 0; i < days; i++) { out += isOnDutyForDate(pattern, d) ? '1' : '0'; d = addDaysISO(d, 1); }
  return out;
}
test('engine — simple ratio presets (backward-compatible with pre-1.1b cycles)', () => {
  const A = '2026-07-01';
  assert.equal(seq({ preset_key: '24_48', anchor_date: A }, A, 9), '100100100');
  assert.equal(seq({ preset_key: '48_96', anchor_date: A }, A, 12), '110000110000');
  assert.equal(seq({ preset_key: '24_72', anchor_date: A }, A, 8), '10001000');
  assert.equal(seq({ preset_key: 'four_on_four_off', anchor_date: A }, A, 8), '11110000');
  // A raw platoon pattern (the pre-1.1b shape) must equal its named preset.
  assert.equal(seq({ repeatRule: 'platoon', cycle_on: 1, cycle_off: 2, anchor_date: A }, A, 9), '100100100');
});
test('engine — generalized cycle expresses 2-2-3 / Pitman (two integers cannot)', () => {
  const A = '2026-07-01';
  assert.equal(seq({ preset_key: 'pitman_223', anchor_date: A }, A, 14), '11001110011000');
  // a hand-authored custom cycle WINS over any simple ratio on the same row
  assert.equal(seq({ cycle_pattern: [1, 1, 1, 0], cycle_on: 5, cycle_off: 5, anchor_date: A }, A, 8), '11101110');
});
test('engine — DST + pre-anchor dates never throw or drift', () => {
  // spring-forward (2026-03-08) and fall-back (2026-11-01) days are ordinary
  // calendar days on ISO-string math — the cycle index must not jump.
  const A = '2026-03-01';
  const s = seq({ preset_key: '24_48', anchor_date: A }, A, 20);
  assert.equal(s.length, 20);
  assert.equal(s, '10010010010010010010'); // steady 1/2 across the DST boundary
  // a date BEFORE the anchor must resolve without crashing (negative offset).
  assert.doesNotThrow(() => isOnDutyForDate({ preset_key: '24_48', anchor_date: '2026-07-10' }, '2026-07-01'));
});
test('engine — conflict detection reports override, other-pattern, and double-award', () => {
  const conflicts = detectConflicts(
    [{ date: '2026-07-01', shiftType: 'Day', patternId: 2 },
     { date: '2026-07-01', shiftType: 'Day', patternId: 7 }],   // two patterns, one slot
    [{ date: '2026-07-01', shiftType: 'Day', patternId: 5, isOverride: false },
     { date: '2026-07-02', shiftType: 'Day', patternId: 9, isOverride: true }]);
  const kinds = conflicts.map((c) => c.kind).sort();
  assert.ok(kinds.includes('other_pattern'), 'existing different-pattern collision');
  assert.ok(kinds.includes('double_apply'), 'two candidates claiming one slot');
  // a same-pattern re-generation is NOT a conflict (idempotent apply)
  assert.equal(detectConflicts(
    [{ date: '2026-07-01', shiftType: 'Day', patternId: 5 }],
    [{ date: '2026-07-01', shiftType: 'Day', patternId: 5, isOverride: false }]).length, 0);
});
test('engine — a preset is a starting point config resolves, not a black box', () => {
  const cfg = resolvePatternConfig({ preset_key: 'pitman_223', anchor_date: '2026-07-01' });
  assert.equal(cfg.cyclePattern.length, 14);
  assert.ok(PATTERN_PRESETS.kelly && PATTERN_PRESETS.dupont, 'kelly + dupont presets exist');
});

// ── Static: hardened routes carry their gates + the consolidation contract ───
test('1.1b routes — RBAC floors + no client-authored crew on publish', () => {
  const sp = fs.readFileSync(path.join(__dirname, '..', 'routes', 'shiftPatterns.js'), 'utf8');
  assert.ok(sp.includes("router.post('/', requireOfficer"), 'pattern create officer-gated');
  assert.ok(sp.includes("router.post('/expand', requireOfficer"), 'expand/apply officer-gated');
  assert.ok(sp.includes("validate({ body: expandSchema })"), 'expand is zod-validated');

  const rl = fs.readFileSync(path.join(__dirname, '..', 'routes', 'runList.js'), 'utf8');
  assert.ok(rl.includes("router.post('/', requireOfficer"), 'publish officer-gated');
  // The publish route must NOT accept a client-authored crew[] — it derives it.
  assert.ok(!/req\.body\.crew/.test(rl), 'publish never reads req.body.crew');
  assert.ok(rl.includes('publishSnapshot'), 'publish derives via the one-brain helper');
});

// ── Live DB: consolidation, cross-tenant, roster rename-proof ────────────────
const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[schedulingCalendar] TENANCY_TEST_DB not set — skipping live-DB 1.1b suite.');
  test('1.1b calendar/consolidation (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;

  test('1.1c-a — date-keyed riding board: seat integrity, cross-tenant, optional rotation, rename-proof', async () => {
    const db = require('../db');
    const { pool } = db;
    const { publishSnapshot, deriveCrewFromAssignments } = require('../utils/runListPublish');
    const MARK = 'SC-1_1c';

    async function cleanup() {
      await pool.query(`DELETE FROM run_lists WHERE payload::text LIKE '%${MARK}%'`);
      await pool.query(`DELETE FROM apparatus_assignments WHERE position_name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM shifts WHERE notes LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM apparatus WHERE designation LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM members WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    try {
      await cleanup();
      const deptA = (await pool.query(`INSERT INTO departments (name) VALUES ('${MARK} A') RETURNING id`)).rows[0].id;
      const deptB = (await pool.query(`INSERT INTO departments (name) VALUES ('${MARK} B') RETURNING id`)).rows[0].id;
      // Per-station roster grain (0072): each apparatus MUST carry a real station_id so
      // the BEFORE-INSERT trigger stamps its assignments' station_id — give each dept a house.
      const stnA = (await pool.query(
        `INSERT INTO stations (department_id, name, address, city, state) VALUES ($1, '${MARK} Station', '', '', '') RETURNING id`,
        [deptA])).rows[0].id;
      const stnB = (await pool.query(
        `INSERT INTO stations (department_id, name, address, city, state) VALUES ($1, '${MARK} Station B', '', '', '') RETURNING id`,
        [deptB])).rows[0].id;
      const mem = (await pool.query(
        `INSERT INTO members ("memberNumber", name, rank, role, joined, status, department_id, station_id)
         VALUES ('${MARK}-1', '${MARK} Member', 'Captain', 'Officer', '2026-01-01', 'Active', $1, NULL) RETURNING id`,
        [deptA])).rows[0].id;
      const mem2 = (await pool.query(
        `INSERT INTO members ("memberNumber", name, rank, role, joined, status, department_id, station_id)
         VALUES ('${MARK}-2', '${MARK} Member2', 'Firefighter', 'Member', '2026-01-01', 'Active', $1, NULL) RETURNING id`,
        [deptA])).rows[0].id;
      const app = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, department_id, station_id) VALUES ('${MARK} E1', 'Engine', 2020, $1, $2) RETURNING id`,
        [deptA, stnA])).rows[0].id;

      const D = '2099-06-01';

      // 1) DATE-KEYED PUBLISH — NO SHIFT NEEDED. The riding board is keyed on the
      //    date; a rotation shift is optional (none here → provenance is NULL).
      await pool.query(
        `INSERT INTO apparatus_assignments (apparatus_id, position_id, member_id, department_id, position_name, date)
         VALUES ($1,NULL,$2,$3,$4,$5)`, [app, mem, deptA, `${MARK} Officer`, D]);
      const p1 = await publishSnapshot(pool, deptA, stnA, D, { source: 'published' });
      assert.equal(p1.crew.length, 1, 'snapshot has the one assigned rider — no shift was created');
      assert.equal(p1.row.source, 'published');
      assert.equal(p1.row.published_from_shift_id, null, 'no rotation link when none is supplied');

      // 2) SEAT INTEGRITY (DB, race-proof): a second person cannot hold the same
      //    seat on the same (dept, date, apparatus, position_name).
      let blocked = false;
      try {
        await pool.query(
          `INSERT INTO apparatus_assignments (apparatus_id, position_id, member_id, department_id, position_name, date)
           VALUES ($1,NULL,$2,$3,$4,$5)`, [app, mem2, deptA, `${MARK} Officer`, D]);
      } catch (e) { blocked = (e.code === '23505'); }
      assert.ok(blocked, 'uq_apparatus_assignments_seat rejects two people in one seat that day');

      // 3) divergence impossible: snapshot == a fresh (dept, STATION, date) assignments read.
      const direct = await deriveCrewFromAssignments(pool, deptA, stnA, D);
      assert.deepEqual(direct, p1.crew, 'published snapshot equals the assignments at publish time');

      // 4) idempotent: republish -> still one run_lists row for (dept, station, date).
      await publishSnapshot(pool, deptA, stnA, D, { source: 'published' });
      const cnt = (await pool.query('SELECT count(*)::int n FROM run_lists WHERE department_id=$1 AND station_id=$2 AND date=$3', [deptA, stnA, D])).rows[0].n;
      assert.equal(cnt, 1, 'republish upserts, never duplicates the dated record');

      // 5) CROSS-TENANT: dept B reads none of dept A's riding board for the date.
      const bCrew = await deriveCrewFromAssignments(pool, deptB, stnB, D);
      assert.equal(bCrew.length, 0, 'dept B sees none of dept A assignments');

      // 6) OPTIONAL ROTATION LINK: publishing with a shift id stamps provenance
      //    (the rotation that generated the on-duty list — still date-keyed crew).
      const s1 = (await pool.query(
        `INSERT INTO shifts (date, "shiftType", crew, "memberIds", notes, department_id)
         VALUES ($1, 'Day', '[]', '[]', '${MARK} rot', $2) RETURNING id`, [D, deptA])).rows[0].id;
      const p2 = await publishSnapshot(pool, deptA, stnA, D, { source: 'published', shiftId: s1 });
      assert.equal(Number(p2.row.published_from_shift_id), Number(s1), 'rotation link stamped when supplied');
      assert.equal(p2.crew.length, 1, 'crew still derived from the date, not the shift');

      // 7) ROSTER RENAME-PROOF: a shift keyed on memberIds derives crew from the
      //    member record, so a rename propagates without touching the shift.
      const s2 = await db.shifts.create({ date: '2099-06-02', shiftType: `${MARK} R`, memberIds: [mem], notes: `${MARK} roster` }, deptA);
      let read = await db.shifts.findById(s2.id, deptA);
      assert.deepEqual(read.crew, [`${MARK} Member`], 'crew derived from the member id');
      await pool.query('UPDATE members SET name=$1 WHERE id=$2', [`${MARK} Renamed`, mem]);
      read = await db.shifts.findById(s2.id, deptA);
      assert.deepEqual(read.crew, [`${MARK} Renamed`], 'rename propagates to crew without a shift write');
    } finally {
      await cleanup();
      await pool.end().catch(() => {});
    }
  });
}
