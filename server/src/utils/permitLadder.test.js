'use strict';
/**
 * permitLadder.test.js — every boundary on the permit expiry ladder, pinned.
 *
 * These are adversarial, not happy-path. The ladder decides when a legal instrument stops
 * being in force, so the interesting cases are all the ones where an off-by-one or a
 * missing guard would silently mis-state a permit's standing:
 *   · the day the notice window opens, and the day before it;
 *   · the LAST VALID DAY of the term (a permit expiring the 1st is in force ON the 1st);
 *   · grace_days = 0, where 'Delinquent' is legitimately never occupied;
 *   · a permit with no term snapshot, which must be REFUSED rather than guessed;
 *   · terminal statuses, which no timer may ever touch;
 *   · backwards movement, which would silently un-lapse a recorded expiry.
 */
const test = require('node:test');
const assert = require('node:assert');

const {
  NO_TERMS, JOB_WRITABLE_STATUSES, addDays, computeLadderStatus, nextStatusFor,
} = require('./permitLadder');

// A permit with a 1-year term, a 30-day notice window and 14 days of grace.
// Term ends 2026-06-30 → notice opens 2026-05-31 → grace ends 2026-07-14.
const P = (over = {}) => ({
  status: 'Active', expiresDate: '2026-06-30',
  notice_window_days: 30, grace_days: 14, ...over,
});

test('addDays is UTC-anchored and crosses months, years and a leap day', () => {
  assert.equal(addDays('2026-06-30', 1),  '2026-07-01');
  assert.equal(addDays('2026-06-30', -30), '2026-05-31');
  assert.equal(addDays('2026-12-31', 1),  '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2028-02-28', 1),  '2028-02-29'); // 2028 is a leap year
  assert.equal(addDays('2026-02-28', 1),  '2026-03-01'); // 2026 is not
});

test('🔴 BOUNDARY: the notice window opens on its first day, and not the day before', () => {
  assert.equal(computeLadderStatus(P(), '2026-05-30'), 'Active');
  assert.equal(computeLadderStatus(P(), '2026-05-31'), 'AboutToExpire'); // opens, inclusive
});

test('🔴 BOUNDARY: a permit expiring the 30th is IN FORCE ON the 30th', () => {
  // This is how a permit reads to the person holding it. An off-by-one here would report a
  // business as lapsed on a day its permit was still good.
  assert.equal(computeLadderStatus(P(), '2026-06-30'), 'AboutToExpire');
  assert.equal(computeLadderStatus(P(), '2026-07-01'), 'Delinquent'); // grace starts the day AFTER
});

test('🔴 BOUNDARY: grace runs THROUGH its last day, and Expired begins the day after', () => {
  assert.equal(computeLadderStatus(P(), '2026-07-14'), 'Delinquent'); // grace ends, inclusive
  assert.equal(computeLadderStatus(P(), '2026-07-15'), 'Expired');
});

test('grace_days = 0 is a legitimate department setting — Delinquent is simply never occupied', () => {
  const noGrace = P({ grace_days: 0 });
  assert.equal(computeLadderStatus(noGrace, '2026-06-30'), 'AboutToExpire'); // last valid day
  assert.equal(computeLadderStatus(noGrace, '2026-07-01'), 'Expired');       // straight through
});

test('notice_window_days = 0 means renewal opens on the last day of the term', () => {
  const noNotice = P({ notice_window_days: 0 });
  assert.equal(computeLadderStatus(noNotice, '2026-06-29'), 'Active');
  assert.equal(computeLadderStatus(noNotice, '2026-06-30'), 'AboutToExpire');
});

test('🔴 NO TERMS: a permit issued before the catalogue existed is REFUSED, never guessed', () => {
  // Prod holds four of these today, two already past their term date. Defaulting them would
  // be inventing terms for a legal record (the 0056 doctrine, applied to a transition).
  for (const missing of [{ notice_window_days: null }, { grace_days: null },
                         { notice_window_days: undefined }, { grace_days: undefined },
                         { notice_window_days: '30' }, { grace_days: '14' },  // pg strings
                         { notice_window_days: -1 },   { grace_days: -1 }]) {
    assert.equal(computeLadderStatus(P(missing), '2026-08-01'), NO_TERMS, JSON.stringify(missing));
  }
  // ...and the same for a missing or malformed term date.
  for (const bad of [{ expiresDate: null }, { expiresDate: '' }, { expiresDate: '30/06/2026' },
                     { expiresDate: '2026-6-30' }]) {
    assert.equal(computeLadderStatus(P(bad), '2026-08-01'), NO_TERMS, JSON.stringify(bad));
  }
  // ...and for a malformed evaluation day, which would otherwise string-compare nonsensically.
  for (const t of ['', '2026-8-1', 'today', null, undefined, 20260801]) {
    assert.equal(computeLadderStatus(P(), t), NO_TERMS, String(t));
  }
});

test('🔴 NO TIMER MAY EVER TOUCH A TERMINAL STATUS — Revoked above all', () => {
  // Enumerated grounds, written notice and a hearing right make automatic revocation
  // statutorily impossible; a timer cannot find a material misrepresentation.
  for (const s of ['Revoked', 'Denied', 'TerminatedByTransfer']) {
    assert.equal(nextStatusFor(P({ status: s }), '2027-01-01'), null, s);
  }
});

test('Pending is an application — nothing expires that was never issued', () => {
  assert.equal(nextStatusFor(P({ status: 'Pending' }), '2027-01-01'), null);
});

test('🔴 FORWARD ONLY — a date edit can never walk a recorded expiry backwards', () => {
  // Without this, correcting a typo'd expiry date would silently un-lapse a legal record as
  // a side effect of a nightly job. A correction must be a human act with a record.
  assert.equal(nextStatusFor(P({ status: 'Expired' }),    '2026-06-01'), null);
  assert.equal(nextStatusFor(P({ status: 'Delinquent' }), '2026-06-01'), null);
  assert.equal(nextStatusFor(P({ status: 'AboutToExpire' }), '2026-01-01'), null);
});

test('idempotent: a second run on the same day writes nothing', () => {
  // The job is expected to be re-run — a retry, a manual trigger, a catch-up after a missed
  // night. A second pass must be a no-op, not a second transition.
  assert.equal(nextStatusFor(P({ status: 'AboutToExpire' }), '2026-06-15'), null);
  assert.equal(nextStatusFor(P({ status: 'Delinquent' }),    '2026-07-05'), null);
  assert.equal(nextStatusFor(P({ status: 'Expired' }),       '2026-08-01'), null);
});

test('the job CAN skip a rung — a missed week lands the permit where the dates say', () => {
  // If the job does not run for ten days, the catch-up must be correct rather than stepwise.
  assert.equal(nextStatusFor(P({ status: 'Active' }), '2026-07-05'), 'Delinquent');
  assert.equal(nextStatusFor(P({ status: 'Active' }), '2026-08-01'), 'Expired');
});

test('CONTROL — the ordinary forward transitions DO happen', () => {
  // Without this, every refusal above could be satisfied by a function that returns null
  // unconditionally.
  assert.equal(nextStatusFor(P({ status: 'Active' }),        '2026-05-31'), 'AboutToExpire');
  assert.equal(nextStatusFor(P({ status: 'AboutToExpire' }), '2026-07-01'), 'Delinquent');
  assert.equal(nextStatusFor(P({ status: 'Delinquent' }),    '2026-07-15'), 'Expired');
});

test('the job can only ever write the three ladder statuses', () => {
  const written = new Set();
  // Sweep a full year around the term for every movable starting status.
  for (const status of ['Active', 'AboutToExpire', 'Delinquent']) {
    for (let d = -400; d <= 400; d += 1) {
      const t = addDays('2026-06-30', d);
      const n = nextStatusFor(P({ status }), t);
      if (n) written.add(n);
    }
  }
  for (const s of written) {
    assert.ok(JOB_WRITABLE_STATUSES.includes(s), `${s} must never be written by the job`);
  }
  // And the sweep must actually have written something, or this proves nothing.
  assert.ok(written.size > 0, 'the sweep produced no transitions — the test is vacuous');
});
