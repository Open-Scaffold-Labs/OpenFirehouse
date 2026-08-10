'use strict';
// PAR spine (0048) — the append-only PAR record's count validation.
// A PAR is an accountability record: incoherent counts must never persist.
const test = require('node:test');
const assert = require('node:assert');
const { validParCounts } = require('../routes/activeBoard');

test('coherent counts pass (accounted + missing = total)', () => {
  assert.deepEqual(validParCounts({ accounted: 12, missing: 0, total: 12 }), { accounted: 12, missing: 0, total: 12 });
  assert.deepEqual(validParCounts({ accounted: 10, missing: 2, total: 12 }), { accounted: 10, missing: 2, total: 12 });
  assert.deepEqual(validParCounts({ accounted: 0, missing: 0, total: 0 }), { accounted: 0, missing: 0, total: 0 });
});

test('incoherent or malformed counts are rejected', () => {
  assert.equal(validParCounts({ accounted: 10, missing: 1, total: 12 }), null); // doesn't add up
  assert.equal(validParCounts({ accounted: -1, missing: 13, total: 12 }), null); // negative
  assert.equal(validParCounts({ accounted: 1.5, missing: 0.5, total: 2 }), null); // non-integer
  assert.equal(validParCounts({ accounted: 'ten', missing: 0, total: 10 }), null);
  assert.equal(validParCounts({}), null);
  assert.equal(validParCounts(null), null);
});
