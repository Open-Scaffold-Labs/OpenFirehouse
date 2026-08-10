'use strict';
/**
 * tests/inspectionResult.test.js — the result axis is a LIFE-SAFETY CONTROL.
 *
 * The old guard was /^pass\b/i against a free-text column. "Passed" and "Passing" sailed
 * straight through it, so a building with unabated violations could be recorded as passing.
 * These tests exist so that can never come back. Every value that DEFEATED the old regex is
 * pinned here by name.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RESULT_CODES, RESULT_LABELS, canonicalizeResult, isPassingResult, isUnmappableResult,
} = require('../constants/inspectionResult');

test('the closed set is exactly the four codes', () => {
  assert.deepEqual([...RESULT_CODES], ['PASS', 'FAIL', 'REINSPECTION_REQUIRED', 'NOT_COMPLETED']);
  for (const c of RESULT_CODES) assert.ok(RESULT_LABELS[c], `${c} needs a human label`);
});

test('codes and known labels canonicalize', () => {
  assert.equal(canonicalizeResult('PASS'), 'PASS');
  assert.equal(canonicalizeResult('Pass'), 'PASS');
  assert.equal(canonicalizeResult('  pass  '), 'PASS');
  assert.equal(canonicalizeResult('Fail'), 'FAIL');
  assert.equal(canonicalizeResult('Reinspection Required'), 'REINSPECTION_REQUIRED');
  assert.equal(canonicalizeResult('REINSPECTION_REQUIRED'), 'REINSPECTION_REQUIRED');
  assert.equal(canonicalizeResult('Not Completed'), 'NOT_COMPLETED');
});

test('empty / absent means NO RESULT (null) — a legal state for an inspection in progress', () => {
  assert.equal(canonicalizeResult(null), null);
  assert.equal(canonicalizeResult(undefined), null);
  assert.equal(canonicalizeResult(''), null);
  assert.equal(canonicalizeResult('   '), null);
  assert.equal(isUnmappableResult(''), false, 'blank is a legal absence, not garbage');
});

// ── THE REGRESSION THAT MATTERS ────────────────────────────────────────────────────────
// Each of these DEFEATED the old /^pass\b/i guard and would have recorded a passing result
// on a building with open violations. They must now be UNMAPPABLE — rejected at the door,
// never silently accepted.
test('the values that silently defeated the old regex are now UNMAPPABLE', () => {
  for (const evil of ['Passed', 'PASSED', 'Passing', 'passed inspection', 'Pass with Violations',
                      'Pass, see notes', 'Pass/Fail pending', 'Conditional', 'Pass - conditional']) {
    assert.equal(canonicalizeResult(evil), undefined, `${JSON.stringify(evil)} must be unmappable`);
    assert.equal(isUnmappableResult(evil), true, `${JSON.stringify(evil)} must be rejected`);
  }
});

// ── THE GUARD ITSELF ───────────────────────────────────────────────────────────────────
test('isPassingResult matches the EXACT code and nothing else — no regex, no morphology', () => {
  assert.equal(isPassingResult('PASS'), true);
  for (const notPass of ['FAIL', 'REINSPECTION_REQUIRED', 'NOT_COMPLETED', null, undefined,
                         'Pass', 'pass', 'Passed', 'PASSED', 'Passing', 'Pass with Violations']) {
    assert.equal(isPassingResult(notPass), false,
      `${JSON.stringify(notPass)} must NOT read as passing — only the canonical code 'PASS' does`);
  }
});

// Proves the pipeline (canonicalize → isPassingResult) can never be tricked by word form.
test('END TO END: no string form of "pass" reaches the passing branch except the real one', () => {
  const reaches = (raw) => isPassingResult(canonicalizeResult(raw));
  assert.equal(reaches('Pass'), true, 'the legitimate pass must still work');
  assert.equal(reaches('PASS'), true);
  for (const evil of ['Passed', 'PASSED', 'Passing', 'Pass with Violations', 'Pass, see notes']) {
    assert.equal(reaches(evil), false,
      `${JSON.stringify(evil)} must not reach the passing branch — but it is also unmappable, so the route 400s before this even matters`);
  }
});
