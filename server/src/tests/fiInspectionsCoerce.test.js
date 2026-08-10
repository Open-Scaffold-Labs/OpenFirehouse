'use strict';
/**
 * fiInspectionsCoerce.test.js — freezes the partial-PATCH semantics (2026-07-11).
 *
 * THE BUG THIS PREVENTS (caught by live verification the day it mattered): coerce()
 * unconditionally reset a missing `violations` field to [], so ANY partial update —
 * a result tap, a notes save, marking complete — silently WIPED every cited
 * violation on the record. Partial patches are the mobile client's entire write
 * model; a field officer's citations must survive every unrelated edit. DB-free.
 */
const test = require('node:test');
const assert = require('node:assert');
const { coerce } = require('../routes/fiInspections');

test('a partial patch WITHOUT violations leaves violations untouched (the wipe bug)', () => {
  const out = coerce({ completedDate: '2026-07-11' });
  assert.equal('violations' in out, false, 'violations must not be injected into a partial patch');
});

test('a patch WITH violations keeps them and canonicalizes statuses', () => {
  const out = coerce({ violations: [
    { code: '1005', status: 'Abated' },
    { code: '3002', status: 'New Violation' },
    { code: '2001', status: 'Open' },
  ]});
  assert.deepEqual(out.violations.map(v => v.status), ['Corrected', 'Open', 'Open']);
});

test('violations explicitly present but malformed resets to [] (never a 500, never garbage)', () => {
  assert.deepEqual(coerce({ violations: 'not-an-array' }).violations, []);
});

test('empty-string dates still null out; result empty-string nulls', () => {
  const out = coerce({ scheduledDate: '', completedDate: '', followUpDate: '', result: '' });
  assert.equal(out.scheduledDate, null);
  assert.equal(out.completedDate, null);
  assert.equal(out.followUpDate, null);
  assert.equal(out.result, null);
});
