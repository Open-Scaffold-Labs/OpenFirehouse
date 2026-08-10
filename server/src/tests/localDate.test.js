'use strict';
// localDate.test.js — freezes the P2 calendar-math doctrine (2026-07-12).
// Scheduling NEVER derives "today" server-side; this is pure string math and it
// must be immune to DST, leap years, and malformed legacy TEXT dates. DB-free.
const test = require('node:test');
const assert = require('node:assert');
const { isIsoDay, addDaysISO, coerceIsoDay } = require('../utils/localDate');

test('isIsoDay accepts only real calendar days', () => {
  assert.equal(isIsoDay('2026-07-12'), true);
  assert.equal(isIsoDay('2024-02-29'), true,  'leap day is real');
  assert.equal(isIsoDay('2026-02-29'), false, 'non-leap Feb 29 is not');
  assert.equal(isIsoDay('2026-13-01'), false);
  assert.equal(isIsoDay('2026-7-12'), false);
  assert.equal(isIsoDay('2026-07-12T10:00:00Z'), false);
  assert.equal(isIsoDay(''), false);
  assert.equal(isIsoDay(null), false);
});

test('addDaysISO: plain arithmetic', () => {
  assert.equal(addDaysISO('2026-07-12', 365), '2027-07-12');
  assert.equal(addDaysISO('2026-07-12', 0), '2026-07-12');
  assert.equal(addDaysISO('2026-07-12', -1), '2026-07-11');
});

test('addDaysISO: month/year/leap boundaries', () => {
  assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysISO('2024-02-28', 1), '2024-02-29', 'into a leap day');
  assert.equal(addDaysISO('2023-02-28', 1), '2023-03-01', 'non-leap skips to March');
  assert.equal(addDaysISO('2024-02-29', 365), '2025-02-28', '365 across a leap year');
});

test('addDaysISO: US DST transition days cannot shift the calendar day', () => {
  // 2026 US DST: spring forward Mar 8, fall back Nov 1. UTC-noon math must be inert to both.
  assert.equal(addDaysISO('2026-03-07', 1), '2026-03-08');
  assert.equal(addDaysISO('2026-03-08', 1), '2026-03-09');
  assert.equal(addDaysISO('2026-10-31', 1), '2026-11-01');
  assert.equal(addDaysISO('2026-11-01', 1), '2026-11-02');
  assert.equal(addDaysISO('2026-03-01', 30), '2026-03-31', 'a 30-day window spanning spring-forward');
});

test('addDaysISO: fails LOUD on garbage (never guesses a date on a legal record)', () => {
  assert.throws(() => addDaysISO('garbage', 30));
  assert.throws(() => addDaysISO('2026-07-12', 1.5));
  assert.throws(() => addDaysISO(null, 30));
});

test('coerceIsoDay: salvages day-prefixed strings, rejects the rest', () => {
  assert.equal(coerceIsoDay('2026-07-12'), '2026-07-12');
  assert.equal(coerceIsoDay('2026-07-12T15:30:00Z'), '2026-07-12');
  assert.equal(coerceIsoDay('next tuesday'), null);
  assert.equal(coerceIsoDay(''), null);
  assert.equal(coerceIsoDay(undefined), null);
});
