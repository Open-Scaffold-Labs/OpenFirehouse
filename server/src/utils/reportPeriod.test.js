'use strict';
/**
 * reportPeriod — the idempotency core of scheduled delivery.
 *
 * These tests carry more weight than most, because the failure they guard
 * against is invisible: a schedule that quietly sends twice, or quietly stops
 * sending, produces no error anywhere. The only thing standing between a chief
 * and a month that never arrived is this comparison.
 */
const assert = require('assert');
const { test } = require('node:test');
const { CADENCE, lastCompletePeriod, isDeliveryDue, isoWeek } = require('./reportPeriod');

const at = (s) => new Date(`${s}T14:15:00Z`);   // the sweep's actual hour

// ── Never report a period that is still in progress ────────────────────────
test('monthly returns the PREVIOUS month, never the one in progress', () => {
  const p = lastCompletePeriod(CADENCE.MONTHLY, at('2026-07-27'));
  assert.deepStrictEqual(
    { key: p.key, from: p.from, to: p.to },
    { key: '2026-06', from: '2026-06-01', to: '2026-06-30' });
  assert.strictEqual(p.label, 'June 2026');
});

test('on the 1st, the month that just ended is the one delivered', () => {
  const p = lastCompletePeriod(CADENCE.MONTHLY, at('2026-07-01'));
  assert.strictEqual(p.key, '2026-06');
  assert.strictEqual(p.to, '2026-06-30');
});

// ── Month-length edge cases, which is why there is no "send on day N" ──────
test('January reports December of the previous year', () => {
  const p = lastCompletePeriod(CADENCE.MONTHLY, at('2027-01-01'));
  assert.deepStrictEqual([p.key, p.from, p.to], ['2026-12', '2026-12-01', '2026-12-31']);
});

test('March reports February with its real last day — 28, and 29 in a leap year', () => {
  assert.strictEqual(lastCompletePeriod(CADENCE.MONTHLY, at('2026-03-05')).to, '2026-02-28');
  assert.strictEqual(lastCompletePeriod(CADENCE.MONTHLY, at('2028-03-05')).to, '2028-02-29');
});

test('a 31-day month ends on the 31st', () => {
  assert.strictEqual(lastCompletePeriod(CADENCE.MONTHLY, at('2026-02-10')).to, '2026-01-31');
});

// ── Weekly: ISO weeks, Monday–Sunday ───────────────────────────────────────
test('weekly returns the last COMPLETE Monday-to-Sunday week', () => {
  // 2026-07-27 is a Monday; the last complete week is Mon 20th – Sun 26th.
  const p = lastCompletePeriod(CADENCE.WEEKLY, at('2026-07-27'));
  assert.strictEqual(p.from, '2026-07-20');
  assert.strictEqual(p.to, '2026-07-26');
});

test('Sunday belongs to the week that is ending, not the one starting', () => {
  // Sunday 2026-07-26 — the last COMPLETE week is still 13th–19th.
  const p = lastCompletePeriod(CADENCE.WEEKLY, at('2026-07-26'));
  assert.strictEqual(p.from, '2026-07-13');
  assert.strictEqual(p.to, '2026-07-19');
});

test('every day of one week resolves to the same period key', () => {
  const keys = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23',
    '2026-07-24', '2026-07-25', '2026-07-26']
    .map((d) => lastCompletePeriod(CADENCE.WEEKLY, at(d)).key);
  assert.strictEqual(new Set(keys).size, 1, `expected one key, got ${[...new Set(keys)].join()}`);
});

test('a weekly period is always exactly 7 days', () => {
  for (const d of ['2026-01-01', '2026-03-01', '2026-12-31', '2028-02-29']) {
    const p = lastCompletePeriod(CADENCE.WEEKLY, at(d));
    const span = (new Date(p.to) - new Date(p.from)) / 86400000;
    assert.strictEqual(span, 6, `${d} produced a ${span + 1}-day week`);
  }
});

test('ISO week numbering puts a year-straddling week in the right year', () => {
  // 2026-01-01 is a Thursday, so that week is 2026-W01.
  assert.deepStrictEqual(isoWeek(new Date('2026-01-01T00:00:00Z')), { year: 2026, week: 1 });
  // 2027-01-01 is a Friday — its week belongs to 2026 (W53).
  assert.strictEqual(isoWeek(new Date('2027-01-01T00:00:00Z')).year, 2026);
});

// ── The delivery decision: this is the double-send guard ───────────────────
test('a never-sent schedule is due', () => {
  const due = isDeliveryDue(
    { cadence: 'monthly', enabled: true, last_period_key: null }, at('2026-07-27'));
  assert.ok(due);
  assert.strictEqual(due.key, '2026-06');
});

test('a schedule already sent for this period is NOT due — the retry guard', () => {
  assert.strictEqual(
    isDeliveryDue({ cadence: 'monthly', enabled: true, last_period_key: '2026-06' }, at('2026-07-27')),
    null);
});

test('every daily run within the same month is a no-op after the first', () => {
  const schedule = { cadence: 'monthly', enabled: true, last_period_key: null };
  const first = isDeliveryDue(schedule, at('2026-07-01'));
  assert.ok(first);
  schedule.last_period_key = first.key;             // delivery claims the period
  for (const d of ['2026-07-02', '2026-07-15', '2026-07-31']) {
    assert.strictEqual(isDeliveryDue(schedule, at(d)), null, `re-fired on ${d}`);
  }
  // …and the next month is due again.
  assert.ok(isDeliveryDue(schedule, at('2026-08-01')));
});

test('a MISSED period self-heals: the next run still owes the newest period', () => {
  // Sent May, then the sweep did not run for weeks. In July, June is owed.
  const due = isDeliveryDue(
    { cadence: 'monthly', enabled: true, last_period_key: '2026-05' }, at('2026-07-27'));
  assert.ok(due, 'a missed month must not be skipped silently');
  assert.strictEqual(due.key, '2026-06');
});

test('a disabled schedule is never due', () => {
  assert.strictEqual(
    isDeliveryDue({ cadence: 'monthly', enabled: false, last_period_key: null }, at('2026-07-27')),
    null);
});

// ── Refuse to guess ────────────────────────────────────────────────────────
test('an unknown cadence throws rather than defaulting to one', () => {
  assert.throws(() => lastCompletePeriod('quarterly', at('2026-07-27')), TypeError);
  assert.throws(() => lastCompletePeriod(undefined, at('2026-07-27')), TypeError);
});

test('an invalid clock throws rather than producing a period', () => {
  assert.throws(() => lastCompletePeriod(CADENCE.MONTHLY, new Date('nope')), TypeError);
  assert.throws(() => lastCompletePeriod(CADENCE.MONTHLY, '2026-07-27'), TypeError);
});
