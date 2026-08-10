/**
 * certExpiry — the classifier that replaced two drifted inline implementations.
 *
 * The first two blocks REPRODUCE the shipped defects. They are written so that
 * they fail against the old logic and pass against the new one; a test that
 * could not have failed verifies nothing.
 */
const assert = require('assert');
const { test } = require('node:test');
const { CERT_STATE, classifyCert, tallyCerts, isIsoDay } = require('../utils/certExpiry');

const ASOF = '2026-07-27';

// ── DEFECT 1 ────────────────────────────────────────────────────────────────
// GET /matrix computed expiring_soon as `expiry_date && !cert.expired && …`.
// `cert` is a raw member_qualifications row and there is no `expired` column,
// so `!cert.expired` was always true. An expired cert was returned flagged
// BOTH expired and expiring_soon — two contradictory facts in one body.
test('an expired cert is EXPIRED and is not also EXPIRING', () => {
  const state = classifyCert('2025-01-01', ASOF, 90);
  assert.strictEqual(state, CERT_STATE.EXPIRED);
  assert.notStrictEqual(state, CERT_STATE.EXPIRING);
});

test('yesterday is expired; today is not yet expired', () => {
  assert.strictEqual(classifyCert('2026-07-26', ASOF, 90), CERT_STATE.EXPIRED);
  assert.strictEqual(classifyCert('2026-07-27', ASOF, 90), CERT_STATE.EXPIRING);
});

// ── DEFECT 2 ────────────────────────────────────────────────────────────────
// GET /expiring filtered in SQL with `expiry_date <= $cutoff` on a TEXT column.
// '7/27/26' sorts ABOVE '2026-10-25', fails the <=, and dropped out of the
// result set entirely — a typo'd date made the cert invisible rather than
// visible as a problem.
test('a malformed expiry date is UNREADABLE, never silently dropped', () => {
  for (const bad of ['7/27/26', '27-07-2026', '2026/07/27', 'soon', '2026-7-27']) {
    assert.strictEqual(classifyCert(bad, ASOF, 90), CERT_STATE.UNREADABLE, bad);
  }
});

test('a malformed date is neither current nor expired', () => {
  const s = classifyCert('7/27/26', ASOF, 90);
  assert.notStrictEqual(s, CERT_STATE.CURRENT);
  assert.notStrictEqual(s, CERT_STATE.EXPIRED);
});

// A regex alone would accept a calendar-impossible day and then compare it as
// though it were real.
test('a calendar-impossible day is UNREADABLE, not a valid date', () => {
  assert.strictEqual(classifyCert('2026-02-31', ASOF, 90), CERT_STATE.UNREADABLE);
  assert.strictEqual(classifyCert('2026-13-01', ASOF, 90), CERT_STATE.UNREADABLE);
});

// ── The three null states never collapse into each other ───────────────────
test('missing expiry is NO_EXPIRY_RECORDED — not current, not expired', () => {
  for (const empty of [null, undefined, '']) {
    assert.strictEqual(classifyCert(empty, ASOF, 90), CERT_STATE.NO_EXPIRY_RECORDED);
  }
});

// ── Window boundaries ──────────────────────────────────────────────────────
test('the expiring window is inclusive of its last day and excludes the next', () => {
  assert.strictEqual(classifyCert('2026-10-25', ASOF, 90), CERT_STATE.EXPIRING);
  assert.strictEqual(classifyCert('2026-10-26', ASOF, 90), CERT_STATE.CURRENT);
});

test('the window crosses a year boundary without arithmetic drift', () => {
  assert.strictEqual(classifyCert('2027-01-25', '2026-12-27', 30), CERT_STATE.EXPIRING);
  assert.strictEqual(classifyCert('2027-02-01', '2026-12-27', 30), CERT_STATE.CURRENT);
});

test('a leap day is a real date and classifies normally', () => {
  assert.strictEqual(classifyCert('2028-02-29', '2028-02-28', 7), CERT_STATE.EXPIRING);
  assert.strictEqual(classifyCert('2027-02-29', ASOF, 90), CERT_STATE.UNREADABLE);
});

// ── The server does not decide what day it is ──────────────────────────────
test('asOf is required and must be a real ISO day', () => {
  for (const bad of [undefined, null, '', 'today', '2026-13-01']) {
    assert.throws(() => classifyCert('2026-08-01', bad, 90), TypeError);
  }
});

// ── Nothing can be hidden ──────────────────────────────────────────────────
test('every input lands in exactly one bucket, so counts cannot hide an omission', () => {
  const input = ['2025-01-01', '2026-08-01', '2027-01-01', '', null, '7/27/26', '2026-07-27'];
  const counts = tallyCerts(input, ASOF, 90);
  const summed = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.strictEqual(summed, input.length);
  assert.deepStrictEqual(counts, {
    current: 1, expiring: 2, expired: 1, no_expiry_recorded: 2, unreadable: 1,
  });
});

test('isIsoDay is strict about shape and about the calendar', () => {
  assert.ok(isIsoDay('2026-07-27'));
  for (const bad of ['2026-7-27', '26-07-27', '2026-07-27T00:00:00Z', 2026, null]) {
    assert.strictEqual(isIsoDay(bad), false, String(bad));
  }
});
