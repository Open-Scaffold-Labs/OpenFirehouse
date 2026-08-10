/**
 * flattenEngineErrors.test.js — engine refusals must reach a clerk as sentences.
 *
 * `details` is `string[]` app-wide. routes/fiFeeSchedules.js flattens its engine's structured
 * errors to code-prefixed lines and leaves a comment saying "Do NOT pass an object here".
 * fiInvoices and fiPayments were written later and did NOT inherit that: they passed the raw
 * object arrays, so errorHandler fell back to JSON.stringify and a clerk who fat-fingered an
 * amount was shown
 *   {"code":"BAD_AMOUNT","at":"line 1","message":"amount is not a valid decimal","got":"12.345"}
 * That is the same class as "a guard that exists on one route and not another is not a guard" —
 * here it was a LESSON that existed on one route and not another, which is why the flattener now
 * lives in the shared kit rather than as a third copy of the same `.map()`.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { flattenEngineErrors } = require('../utils/routeKit');

test('a structured engine error becomes a readable line', () => {
  const out = flattenEngineErrors([
    { code: 'BAD_AMOUNT', at: 'line 1', message: 'amount is not a valid decimal', got: '12.345' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0], 'line 1 — BAD_AMOUNT: amount is not a valid decimal (got: "12.345")');
});

test('every entry is a string — nothing survives as an object', () => {
  const out = flattenEngineErrors([
    { code: 'NO_LINES', message: 'an invoice must have at least one line' },
    { code: 'NOT_POSITIVE', message: 'a receipt amount must be greater than zero', got: '0.00' },
  ]);
  assert.ok(out.every((e) => typeof e === 'string'), `got ${JSON.stringify(out)}`);
  // No `at` on these two, so no location prefix is invented.
  assert.equal(out[0], 'NO_LINES: an invoice must have at least one line');
});

test('the value the operator typed is carried through — it is the fastest fix', () => {
  const [line] = flattenEngineErrors([{ code: 'TOO_LARGE', message: 'exceeds NUMERIC(12,2)', got: '1e99' }]);
  assert.ok(line.includes('1e99'), `the offending value must survive: ${line}`);
});

test('a falsy or zero `got` is still shown — 0 is a real answer, not an absent one', () => {
  const [line] = flattenEngineErrors([{ code: 'NOT_POSITIVE', message: 'must be > 0', got: 0 }]);
  assert.ok(line.includes('(got: 0)'), `0 must not be swallowed by a truthiness check: ${line}`);
});

test('an already-flat string array passes through untouched', () => {
  assert.deepEqual(flattenEngineErrors(['MISSING_INPUT: square_footage']),
    ['MISSING_INPUT: square_footage']);
});

test('a non-array is undefined, not a crash — details is optional', () => {
  assert.equal(flattenEngineErrors(undefined), undefined);
  assert.equal(flattenEngineErrors(null), undefined);
  assert.equal(flattenEngineErrors({ code: 'X' }), undefined);
});

test('a malformed entry degrades to something readable rather than throwing', () => {
  assert.deepEqual(flattenEngineErrors([null, 42]), ['null', '42']);
  assert.deepEqual(flattenEngineErrors([{}]), ['ERROR: refused']);
});
