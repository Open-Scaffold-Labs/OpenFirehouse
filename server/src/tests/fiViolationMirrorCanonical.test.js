'use strict';
/**
 * fiViolationMirrorCanonical.test.js — the queryable mirror may NEVER carry a status
 * that is off the canonical axis. (2026-07-14)
 *
 * THE BUG THIS FREEZES (found live; prod was carrying two 'Pending' elements):
 *   1. PATCH /api/fi-inspections/:id was the ONE route returning its row without
 *      normalizeOut. A partial patch — the mobile client's entire write model — omits
 *      `violations`, so coerce() correctly left them alone and db.update handed back the
 *      STORED JSON verbatim, legacy words and all.
 *   2. That raw row went to syncViolationRows, which mirrored the legacy word into
 *      fi_violations.
 *   3. fiReports selects the open set with a POSITIVE ALLOWLIST:
 *          OPEN_STATUSES = ['Open', 'Time Extension'];  ... WHERE v.status = ANY($2)
 *      'Pending' matches NEITHER that allowlist NOR the resolved set — so the violation
 *      silently DROPPED OUT of the open/aging dashboard entirely. It fails CLOSED, which
 *      is the dangerous direction: an open violation stops being counted as anything.
 *      That is precisely the "a violation falls out of the count" failure the four-state
 *      axis was created to kill, resurrected through the mirror table.
 *
 * The route is fixed at the source (normalizeOut before audit/sync/response). This suite
 * is the fence: it proves the mirror writer ENFORCES its own @param contract
 * ("post-write, canonicalized") rather than trusting the caller, and that the reports
 * allowlist actually covers the whole axis. DB-free — a fake pool captures the rows.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { syncViolationRows } = require('../utils/fiViolationSync');
const {
  VIOLATION_STATUSES, RESOLVED_VIOLATION_STATUSES,
} = require('../constants/violationStatus');

/** Capture the JSON rows syncViolationRows would UPSERT, without touching a DB. */
async function mirrorOf(violations) {
  let captured = null;
  const fakePool = {
    query: async (sql, params) => {
      if (/INSERT INTO fi_violations/.test(sql)) captured = JSON.parse(params[2]);
      return { rows: [] };
    },
  };
  await syncViolationRows(fakePool, { id: 1, violations }, 7);
  return captured;
}

test('a LEGACY status is canonicalized before it reaches the mirror', async () => {
  const rows = await mirrorOf([
    { id: 'a', status: 'Pending' },   // prod actually carries these
    { id: 'b', status: 'Abated' },
    { id: 'c', status: 'Void' },
  ]);
  assert.equal(rows[0].status, 'Open');        // NOT 'Pending'
  assert.equal(rows[1].status, 'Corrected');   // NOT 'Abated'
  assert.equal(rows[2].status, 'Withdrawn');   // NOT 'Void'
});

test('the inspector’s ORIGINAL word survives in status_raw (nothing is destroyed)', async () => {
  const rows = await mirrorOf([{ id: 'a', status: 'Pending' }]);
  assert.equal(rows[0].status, 'Open');
  assert.equal(rows[0].status_raw, 'Pending');
});

test('an existing status_raw is NEVER overwritten — the first raw value wins forever', async () => {
  const rows = await mirrorOf([{ id: 'a', status: 'Abated', status_raw: 'UnAbated' }]);
  assert.equal(rows[0].status, 'Corrected');
  assert.equal(rows[0].status_raw, 'UnAbated');  // not clobbered to 'Abated'
});

test('EVERY mirrored status lands on the canonical axis — even garbage (fail-open)', async () => {
  const rows = await mirrorOf([
    { id: 'a', status: 'Pending' }, { id: 'b', status: 'xyzzy' }, { id: 'c', status: '' },
    { id: 'd', status: null },      { id: 'e' },                  { id: 'f', status: 'Corrected' },
  ]);
  for (const r of rows) {
    assert.ok(VIOLATION_STATUSES.includes(r.status),
      `mirror row carried an OFF-AXIS status ${JSON.stringify(r.status)} — it would vanish from the dashboard`);
  }
  // Unknown/empty must read as OPEN, never silently resolved.
  assert.equal(rows[1].status, 'Open');
  assert.equal(rows[2].status, 'Open');
  assert.equal(rows[3].status, 'Open');
  assert.equal(rows[4].status, 'Open');
});

test('identity is NOT re-minted on a mirror sync (photos key on violation_key)', async () => {
  const rows = await mirrorOf([
    { id: 'stable-uuid-1', status: 'Pending' },
    { id: '0', status: 'Open' },        // legacy: array-position ids backfilled by 0045
    { status: 'Open' },                  // no id at all → falls back to position
  ]);
  assert.equal(rows[0].violation_key, 'stable-uuid-1');
  assert.equal(rows[1].violation_key, '0');
  assert.equal(rows[2].violation_key, '2');   // position, NOT a fabricated uuid
});

test('canonical rows pass through unchanged (idempotent)', async () => {
  const once  = await mirrorOf([{ id: 'a', status: 'Corrected', status_raw: 'Abated' }]);
  const twice = await mirrorOf(once.map((r) => ({ id: r.violation_key, status: r.status, status_raw: r.status_raw })));
  assert.equal(twice[0].status, 'Corrected');
  assert.equal(twice[0].status_raw, 'Abated');
});

/**
 * THE CROSS-FILE GUARD. fiReports decides "open" with a positive allowlist. If someone
 * adds a fifth state to the axis and forgets fiReports, violations in that state would
 * silently stop being counted as open AND not be resolved — they'd vanish. This asserts
 * the allowlist literal on disk still partitions the axis exactly:
 *      OPEN_STATUSES  ∪  RESOLVED_VIOLATION_STATUSES  ===  VIOLATION_STATUSES
 */
test('fiReports’ OPEN_STATUSES allowlist covers the whole axis (no state can vanish)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../routes/fiReports.js'), 'utf8');
  const m = src.match(/const OPEN_STATUSES\s*=\s*(\[[^\]]*\])/);
  assert.ok(m, 'could not find the OPEN_STATUSES literal in fiReports.js');
  const openStatuses = JSON.parse(m[1].replace(/'/g, '"'));

  const covered = [...openStatuses, ...RESOLVED_VIOLATION_STATUSES].sort();
  assert.deepEqual(covered, [...VIOLATION_STATUSES].sort(),
    'a canonical status is in NEITHER the open allowlist nor the resolved set — it would ' +
    'disappear from the dashboard instead of being counted');

  // and the two halves must not overlap (a status cannot be open AND resolved)
  for (const s of openStatuses) {
    assert.ok(!RESOLVED_VIOLATION_STATUSES.includes(s), `${s} is both open and resolved`);
  }
});
