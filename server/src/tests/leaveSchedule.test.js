// Phase 1.2 gates #1 (auto-hours from schedule) + #2 (id-based crew match) — PURE helpers,
// no DB. Always runs (no TENANCY_TEST_DB gate). These cover the exact boundaries the old
// name-string path got wrong: a renamed member (id match still fires; name match misses), a
// midnight-spanning tour's duration, and an unknown shift-type that must NOT get a fabricated
// default. Every assertion could fail.

const { test } = require('node:test');
const assert = require('node:assert');
const {
  tourHours, clockDurationHours, memberOnShift, crewCountAfterRemoval, removeMemberFromShift,
} = require('../utils/leaveSchedule');

test('clockDurationHours — spans midnight and treats equal times as a full 24h tour', () => {
  assert.equal(clockDurationHours('06:00', '18:00'), 12, 'day tour');
  assert.equal(clockDurationHours('18:00', '06:00'), 12, 'night tour wraps midnight');
  assert.equal(clockDurationHours('08:00', '08:00'), 24, 'equal → full 24h tour');
  assert.equal(clockDurationHours('bad', '06:00'), null, 'unparseable → null');
});

test('tourHours — prefers explicit hours, then clock, then shift-type; unknown → needsReview', () => {
  assert.deepEqual(tourHours({ hours: 24 }), { hours: 24, source: 'hours', needsReview: false });
  assert.equal(tourHours({ start_time: '18:00', end_time: '06:00' }).hours, 12, 'clock duration');
  assert.equal(tourHours({ shiftType: 'Day' }).hours, 12, 'shift-type map (case-insensitive)');
  assert.equal(tourHours({ shiftType: '24-Hour' }).hours, 24);
  const unknown = tourHours({ shiftType: 'Mutual Aid Detail' });
  assert.equal(unknown.hours, null, 'unknown label → no fabricated number');
  assert.equal(unknown.needsReview, true, 'unknown label is surfaced for review');
  assert.equal(tourHours(null).needsReview, true, 'null tour → needsReview');
});

test('memberOnShift — UNION of id and name (safe direction for a coverage warning)', () => {
  // Shift carries memberIds → matched BY ID even though the crew name is stale (renamed).
  const renamed = { memberIds: [7, 9, 11], crew: ['Alice-Renamed', 'Bob', 'Carol'] };
  assert.equal(memberOnShift(renamed, 7, 'New Name'), true, 'id 7 rides — name changed but id matches');
  assert.equal(memberOnShift(renamed, 99, 'Nobody Here'), false, 'neither id nor name on shift → false');
  // Union: a name present in crew still flags even if the id is absent (never a false-negative
  // for a safety warning — better to over-flag coverage than miss a member).
  assert.equal(memberOnShift(renamed, 99, 'Bob'), true, 'name in crew flags even without an id match');
  // pg BIGINT comes back as a string — both sides coerce.
  assert.equal(memberOnShift({ memberIds: ['7'], crew: [] }, 7, 'x'), true, 'string/number id coercion');
  // Legacy shift with no memberIds → name match.
  const legacy = { crew: ['Alice', 'Bob'] };
  assert.equal(memberOnShift(legacy, 7, 'Alice'), true, 'no memberIds → matches by name');
  assert.equal(memberOnShift(legacy, 7, 'Zed'), false, 'name not present → false');
});

test('crewCountAfterRemoval — counts the removal even on a rename (id matched, name stale)', () => {
  const renamed = { memberIds: [7, 9, 11], crew: ['Old Name', 'Bob', 'Carol'] };
  assert.equal(crewCountAfterRemoval(renamed, 7, 'New Name'), 2, 'id matched → 3 crew drop to 2 even though name is stale');
  const normal = { memberIds: [7, 9, 11], crew: ['Alice', 'Bob', 'Carol'] };
  assert.equal(crewCountAfterRemoval(normal, 7, 'Alice'), 2, 'name matched → normal decrement');
  const notOn = { memberIds: [9, 11], crew: ['Bob', 'Carol'] };
  assert.equal(crewCountAfterRemoval(notOn, 7, 'Alice'), 2, 'not on shift → count unchanged');
});

test('removeMemberFromShift — strips the name from crew AND the id from memberIds', () => {
  const shift = { memberIds: [7, 9, 11], crew: ['Alice', 'Bob', 'Carol'] };
  const out = removeMemberFromShift(shift, 7, 'Alice');
  assert.deepEqual(out.crew, ['Bob', 'Carol'], 'name removed from crew');
  assert.deepEqual(out.memberIds, [9, 11], 'id removed from memberIds');
  // Rename case: id removed from memberIds even though the name is stale in crew.
  const renamed = { memberIds: [7, 9], crew: ['Old', 'Bob'] };
  const out2 = removeMemberFromShift(renamed, 7, 'New');
  assert.deepEqual(out2.memberIds, [9], 'stale id cleaned from memberIds');
});
