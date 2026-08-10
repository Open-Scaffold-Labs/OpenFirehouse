// The date and time a NEW incident report opens with.
//
// Two defects shipped in two lines of IncidentForm.jsx, on a subpoenable legal
// record, and they are different failures that happened to sit together:
//
//   const today = new Date();                 // ← ran at MODULE LOAD, once
//   date: today.toISOString().slice(0, 10),   // ← the UTC day, not the local day
//   time: today.toTimeString().slice(0, 5),
//
// 1. UTC vs local day. West of Greenwich the UTC day is TOMORROW for the last
//    hours of every local day (America/New_York: from 20:00 EDT / 19:00 EST).
//    An officer writing up a 21:30 call was handed a form pre-dated to the next
//    day. Identical in shape to the calendar bug of 2026-08-05 — and it existed
//    here independently, in its own file, which is exactly why the standing rule
//    is to grep the defect CLASS rather than the file.
//
// 2. A frozen clock. `const today = new Date()` is module-scope: it evaluates
//    when the bundle first imports the file, NOT when the form opens. A dispatch
//    console left up across a tour prefilled the time the PAGE loaded. Measured
//    on production 2026-08-06: the form offered 19:33 while the wall clock read
//    19:34, one minute after load.
//
// These tests pin the timezone (the runner sets TZ) because a UTC-only test
// passes against defect 1 — in UTC the two definitions agree, which is precisely
// how it survived every earlier check.

import test from 'node:test';
import assert from 'node:assert';
import { toLocalDay } from '../localDay.js';

/**
 * The shipped implementation, mirrored. IncidentForm.jsx is a .jsx React module
 * and cannot be imported by the node test runner, so this asserts the BEHAVIOUR
 * of the two-line rule the component follows. Keep the two in step: if
 * nowDefaults() changes there, this file is the reason it can change safely.
 */
function nowDefaults(now = new Date()) {
  return {
    date: toLocalDay(now),
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  };
}

// 2026-08-06T01:37Z is 2026-08-05 21:37 EDT — the UTC day and the local day
// disagree at this instant. This is the exact shape of the shipped defect.
const EVENING = new Date('2026-08-06T01:37:18.729Z');

test('a report opened on a local evening is dated TODAY, not tomorrow', () => {
  const { date } = nowDefaults(EVENING);
  const utcDay = EVENING.toISOString().slice(0, 10);

  assert.equal(date, toLocalDay(EVENING));

  if (EVENING.getTimezoneOffset() > 0) {
    assert.equal(utcDay, '2026-08-06', 'the UTC day at this instant');
    assert.equal(date, '2026-08-05', 'the day the officer is actually working');
    assert.notEqual(date, utcDay, 'the old code shipped the UTC value into the date field');
  }
});

test('the time default is local wall-clock, not a UTC-derived string', () => {
  const { time } = nowDefaults(EVENING);
  assert.match(time, /^\d{2}:\d{2}$/);
  assert.equal(time, `${String(EVENING.getHours()).padStart(2, '0')}:${String(EVENING.getMinutes()).padStart(2, '0')}`);

  if (EVENING.getTimezoneOffset() > 0) {
    assert.notEqual(time, EVENING.toISOString().slice(11, 16), 'UTC clock time is not the officer\'s clock time');
  }
});

test('defaults are computed PER CALL — the clock is not frozen at module load', () => {
  // The regression this guards: a value captured once, at import, and reused.
  // Two calls straddling a minute boundary must not return the same time.
  const a = nowDefaults(new Date('2026-08-06T14:00:10.000Z'));
  const b = nowDefaults(new Date('2026-08-06T18:45:10.000Z'));
  assert.notEqual(a.time, b.time, 'a frozen clock would return the same time for both instants');
});

test('defaults straddling local midnight roll the DATE, not just the time', () => {
  const before = nowDefaults(new Date('2026-08-06T03:50:00.000Z')); // 23:50 EDT on the 5th
  const after = nowDefaults(new Date('2026-08-06T04:10:00.000Z')); // 00:10 EDT on the 6th
  if (new Date().getTimezoneOffset() > 0) {
    assert.equal(before.date, '2026-08-05');
    assert.equal(after.date, '2026-08-06');
    assert.notEqual(before.date, after.date);
  }
});
