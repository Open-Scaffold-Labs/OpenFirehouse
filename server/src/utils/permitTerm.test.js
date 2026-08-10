'use strict';
/**
 * permitTerm.test.js — the term arithmetic that decides a permit's last valid day.
 *
 * Split from permitLadder.test.js deliberately: the ladder answers "where is this permit
 * today", this answers "when does it end", and the second one is what gets STORED on a legal
 * record at issuance and then frozen by the write-once trigger. A wrong value here is not a
 * display bug — it is a wrong expiry date on an issued instrument that cannot be edited
 * afterwards, only revoked or reissued.
 */
const test = require('node:test');
const assert = require('node:assert');

const { addTerm, computeExpiresDate, computeLadderStatus } = require('./permitLadder');

test('addTerm: days, months and years', () => {
  assert.equal(addTerm('2026-01-01', 30, 'day'),   '2026-01-31');
  assert.equal(addTerm('2026-01-01', 1,  'month'), '2026-02-01');
  assert.equal(addTerm('2026-01-01', 1,  'year'),  '2027-01-01');
  assert.equal(addTerm('2026-01-01', 18, 'month'), '2027-07-01'); // rolls the year
});

test('🔴 addTerm CLAMPS to the end of the month — a 1-month permit must not outlive its month', () => {
  // JS Date rolls over silently here: Date.UTC(2026, 1, 31) is 2026-03-03. That would make a
  // one-month permit issued on the 31st expire in MARCH. Nobody notices until a term lands
  // on a 31st.
  assert.equal(addTerm('2026-01-31', 1, 'month'), '2026-02-28');
  assert.equal(addTerm('2026-03-31', 1, 'month'), '2026-04-30');
  assert.equal(addTerm('2026-05-31', 1, 'month'), '2026-06-30');
  // A leap year clamps to the 29th, not the 28th.
  assert.equal(addTerm('2028-01-31', 1, 'month'), '2028-02-29');
  // ...and the same clamp applies through a year hop.
  assert.equal(addTerm('2028-02-29', 1, 'year'),  '2029-02-28');
});

test('addTerm refuses what it cannot compute rather than returning a plausible wrong day', () => {
  for (const bad of [
    ['2026-1-1', 1, 'month'],     // not ISO
    ['not-a-date', 1, 'year'],
    ['2026-01-01', 1.5, 'month'], // non-integer
    ['2026-01-01', 1, 'fortnight'],
    ['2026-01-01', 1, undefined],
  ]) {
    assert.equal(addTerm(...bad), null, JSON.stringify(bad));
  }
});

test('🔴 CONVENTION: a 1-year permit issued Jan 1 is in force THROUGH Dec 31', () => {
  // Both readings exist in the wild. Ours counts the term INCLUSIVE of the issue day, so the
  // last valid day is (issued + term) − 1. If this ever flips, every permit reads as lapsing
  // a day early or a day late.
  assert.equal(computeExpiresDate('2026-01-01', 1, 'year'),  '2026-12-31');
  assert.equal(computeExpiresDate('2026-01-01', 1, 'month'), '2026-01-31');
  assert.equal(computeExpiresDate('2026-01-01', 30, 'day'),  '2026-01-30');
  // A one-day permit is valid for exactly the day it was issued.
  assert.equal(computeExpiresDate('2026-06-15', 1, 'day'),   '2026-06-15');
});

test('🔴 the term math and the LADDER agree — a permit is in force on its last valid day', () => {
  // The two are written in different functions and must never drift apart: computeExpiresDate
  // produces the stored date, computeLadderStatus reads it. If they disagree by one day, a
  // permit lapses early or late, silently, on a legal record.
  const issued = '2026-01-01';
  const expires = computeExpiresDate(issued, 1, 'year');   // 2026-12-31
  const permit = { status: 'Active', expiresDate: expires, notice_window_days: 0, grace_days: 0 };

  assert.equal(computeLadderStatus(permit, expires), 'AboutToExpire',
    'ON the last valid day the permit is still in force (notice window 0 ⇒ AboutToExpire)');
  assert.equal(computeLadderStatus(permit, '2027-01-01'), 'Expired',
    'the day AFTER the last valid day, with no grace, it is Expired');
  assert.equal(computeLadderStatus(permit, '2026-12-30'), 'Active',
    'the day before is still plainly Active');
});

test('a full year of issue dates round-trips without a gap or an overlap', () => {
  // Issue on every day of 2026 with a 1-month term; the next term must start exactly the day
  // after the previous one ends. This catches clamping bugs that would otherwise only show
  // up on month boundaries.
  let d = '2026-01-01';
  for (let i = 0; i < 365; i += 1) {
    const end = computeExpiresDate(d, 1, 'month');
    assert.ok(end > d, `term must end after it starts (${d} → ${end})`);
    const next = addTerm(d, 1, 'month');
    assert.equal(computeExpiresDate(d, 1, 'month'), require('./permitLadder').addDays(next, -1),
      `last valid day must be one day before the next term starts (${d})`);
    d = require('./permitLadder').addDays(d, 1);
  }
});
