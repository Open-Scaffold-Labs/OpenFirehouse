'use strict';
/**
 * reconcileSummary.test.js — one dead Stripe key must not hide the other mode's result.
 *
 * Pure, no DB, no network. The bug this fences was found in production by the cron ledger on
 * its first day: both modes ran in ONE try block with test second, so a revoked TEST key threw
 * before the summary was built, live's completed result was DISCARDED, and the operator was
 * told only "handler answered 500".
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { summarizeReconcile } = require('../utils/reconcileSummary');

const ok   = (mode, extra = {}) => ({ mode, checked: 3, gaps: 0, back_issued: 0, errors: 0, ...extra });
const dead = (mode, error) => ({ mode, failed: true, error, checked: 0, gaps: 0, back_issued: 0, errors: 0 });

test('both modes healthy → ok, 200, and both results reported', () => {
  const r = summarizeReconcile([ok('live', { gaps: 1, back_issued: 1 }), ok('test')], 'T');
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.total_back_issued, 1);
  assert.deepEqual(r.body.modes_failed, []);
  assert.ok(r.body.live && r.body.test, 'every mode appears in the body');
});

test("🔴 THE REGRESSION: a dead TEST key must not erase LIVE's result", () => {
  const live = ok('live', { checked: 12, gaps: 2, back_issued: 2 });
  const r = summarizeReconcile([live, dead('test', 'Expired API Key provided: sk_test_***')], 'T');

  // The half that matters. Before the fix this object did not exist at all — the exception
  // unwound past the point where the summary was assembled.
  assert.deepEqual(r.body.live, live, "live's completed work must survive its sibling failing");
  assert.equal(r.body.total_back_issued, 2, 'and its counters must still be totalled');

  // Still a failure — a revoked credential is ours to fix, not a tenant data problem, so this
  // deliberately does NOT follow permit_expiry's partial-failure-is-a-200 precedent.
  assert.equal(r.ok, false);
  assert.equal(r.status, 500);
  assert.deepEqual(r.body.modes_failed, ['test'], 'and it names WHICH mode');
  assert.match(r.body.error, /test mode: Expired API Key/,
    'the operator needs the mode and the cause, not "handler answered 500"');
  assert.ok(!/live mode/.test(r.body.error), 'and must not implicate the mode that worked');
});

test('a dead LIVE key is reported the same way, without hiding test', () => {
  const r = summarizeReconcile([dead('live', 'Invalid API Key'), ok('test', { gaps: 1 })], 'T');
  assert.equal(r.status, 500);
  assert.deepEqual(r.body.modes_failed, ['live']);
  assert.equal(r.body.total_gaps, 1, "test's findings still count");
  assert.match(r.body.error, /live mode: Invalid API Key/);
});

test('both modes dead → both named, in order', () => {
  const r = summarizeReconcile([dead('live', 'A'), dead('test', 'B')], 'T');
  assert.deepEqual(r.body.modes_failed, ['live', 'test']);
  assert.match(r.body.error, /live mode: A; test mode: B/);
});

test('a failed mode with no message still says something actionable', () => {
  const r = summarizeReconcile([ok('live'), { mode: 'test', failed: true }], 'T');
  assert.match(r.body.error, /test mode: unknown error/,
    'an empty cause must not render as an empty sentence');
});

test('the shape is defensive — no modes, or junk, does not throw', () => {
  assert.equal(summarizeReconcile([], 'T').ok, true);
  assert.equal(summarizeReconcile(null, 'T').ok, true);
  assert.equal(summarizeReconcile(undefined, 'T').status, 200);
});

test('totals ignore missing counters rather than producing NaN', () => {
  const r = summarizeReconcile([{ mode: 'live' }, { mode: 'test', gaps: 2 }], 'T');
  assert.equal(r.body.total_gaps, 2);
  assert.equal(r.body.total_back_issued, 0);
  assert.equal(r.body.total_errors, 0);
});

/*
 * MUTATION LOG — proven able to fail, 2026-08-06:
 *   · returning only the failed modes in the body        → "a dead TEST key" test RED
 *   · `status: 200` on failure                            → RED
 *   · dropping the mode name from the message             → RED
 *   · `total_* ` summing only successful modes            → "a dead LIVE key" RED
 *   · `m.error || 'unknown error'` → `m.error`            → "no message" RED
 * File byte-identical after restore.
 */
