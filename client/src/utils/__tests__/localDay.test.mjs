// localDay — "what day is it, HERE?"
//
// Written after a live defect on The Board (2026-08-05): the calendar grid put
// its "today" pill on the WRONG DAY every evening. Cause: `isToday()` compared a
// local calendar date against `new Date().toISOString().slice(0,10)`, which is
// the UTC date. Measured on prod at 21:37 America/New_York — local date 5, UTC
// date 6, pill on the 6th, and the real today styled as PAST.
//
// These tests pin the timezone explicitly (TZ=America/New_York, via the runner's
// process env below) because a test that only passes in UTC would have passed
// against the buggy code too — the two definitions agree in UTC, which is
// precisely why this survived every previous check.

import test from 'node:test';
import assert from 'node:assert';
import { localToday, toLocalDay, localDayPlus, displayDay } from '../localDay.js';

// 2026-08-06T01:37Z is 2026-08-05 21:37 EDT. The UTC day and the local day
// DISAGREE here — this instant is the whole reason the file exists.
const EVENING = new Date('2026-08-06T01:37:18.729Z');

test('toLocalDay uses the local wall-clock day, not the UTC day', () => {
  const local = toLocalDay(EVENING);
  const utc = EVENING.toISOString().slice(0, 10);

  // In a US timezone these differ. In UTC itself they are equal, and the assertion
  // below would be vacuous — so assert against the actual local date parts rather
  // than against "not equal to UTC".
  const expected = `${EVENING.getFullYear()}-${String(EVENING.getMonth() + 1).padStart(2, '0')}-${String(EVENING.getDate()).padStart(2, '0')}`;
  assert.equal(local, expected);

  if (EVENING.getTimezoneOffset() > 0) {
    // West of Greenwich: this is the divergence the bug rode on.
    assert.notEqual(local, utc, 'expected the UTC day to be AHEAD of the local day at 21:37 EDT');
    assert.equal(utc, '2026-08-06');
    assert.equal(local, '2026-08-05');
  }
});

test('toLocalDay zero-pads month and day', () => {
  assert.equal(toLocalDay(new Date(2026, 0, 3, 12, 0, 0)), '2026-01-03');
  assert.equal(toLocalDay(new Date(2026, 10, 30, 12, 0, 0)), '2026-11-30');
});

test('localToday agrees with the local Date parts', () => {
  const now = new Date();
  const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  assert.equal(localToday(), expected);
});

test('localToday is a well-formed YYYY-MM-DD', () => {
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test('localDayPlus walks whole local days in both directions', () => {
  assert.match(localDayPlus(90), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(localDayPlus(90) > localToday(), '+90 days must sort after today');
  assert.ok(localDayPlus(-1) < localToday(), '-1 day must sort before today');
  assert.equal(localDayPlus(0), localToday());
});

// ── displayDay ───────────────────────────────────────────────────────────────
// Added 2026-08-06 (design-polish module 4). `#/after-action` was rendering
// `r.conducted_date` raw, so a fire officer read "2026-03-21T00:00:00.000Z" on
// an after-action report. The obvious fix is the WORSE bug: a Postgres `date`
// serialises to midnight UTC, so `new Date(v).toLocaleDateString()` walks it
// back to 20:00 the PREVIOUS day in America/New_York and silently re-dates the
// record. These tests exist to stop that fix from being made later.

test('displayDay formats a Postgres date-at-midnight-UTC WITHOUT shifting the day', () => {
  assert.equal(displayDay('2026-03-21T00:00:00.000Z'), '03/21/2026');

  if (new Date().getTimezoneOffset() > 0) {
    // The trap, executed: constructing a Date from that string and asking for a
    // local date yields the 20th. Asserting it here so the divergence is on file
    // as a measured fact, not a claim.
    const naive = new Date('2026-03-21T00:00:00.000Z');
    assert.equal(naive.getDate(), 20, 'expected midnight UTC to land on the 20th locally');
    assert.notEqual(displayDay('2026-03-21T00:00:00.000Z'), `03/${naive.getDate()}/2026`);
  }
});

test('displayDay accepts a bare YYYY-MM-DD unchanged in meaning', () => {
  assert.equal(displayDay('2026-01-03'), '01/03/2026');
  assert.equal(displayDay('2026-12-31'), '12/31/2026');
});

test('displayDay renders nothing for empty input rather than "Invalid Date"', () => {
  for (const v of [null, undefined, '']) assert.equal(displayDay(v), '');
});

test('displayDay passes through a value it cannot parse instead of inventing one', () => {
  assert.equal(displayDay('not a date'), 'not a date');
});

test('localDayPlus crosses a month boundary correctly', () => {
  // Not a date-arithmetic reimplementation: Date.setDate handles the rollover,
  // this asserts we did not defeat it by formatting from the wrong fields.
  const base = new Date();
  const plus = new Date();
  plus.setDate(plus.getDate() + 40);
  assert.equal(localDayPlus(40), toLocalDay(plus));
  assert.notEqual(toLocalDay(base), toLocalDay(plus));
});
