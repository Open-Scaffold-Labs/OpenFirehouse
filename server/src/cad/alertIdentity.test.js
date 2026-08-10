'use strict';
/**
 * cad/alertIdentity — the dedup identifier for an inbound dispatch.
 *
 * The first test is the whole reason this module exists: it FAILS against the
 * old `${prefix}-${Date.now()}` scheme, because that scheme cannot make a retry
 * hash to the same thing. Everything else guards the two directions of harm —
 * a real second call must never be swallowed, and a retry must never duplicate.
 */
const assert = require('assert');
const { test } = require('node:test');
const { resolveAlertId, isSynthesized, ID_SOURCE } = require('./alertIdentity');

const call = (over = {}) => ({
  vendorId: null,
  departmentId: 1,
  source: 'generic',
  address: '11 First St',
  units: 'E1,L2',
  description: 'Structure Fire',
  dispatchedAt: '2026-07-27T14:02:00Z',
  ...over,
});

// ── THE DEFECT THIS MODULE FIXES ───────────────────────────────────────────
// A CAD vendor retrying the same dispatch (they retry on timeout) used to mint
// a NEW alert_id each attempt, defeating the duplicate guard and storing the
// call twice. Two alert rows for one call can become two draft incidents on
// clear — two incident numbers for one fire.
test('a retried dispatch resolves to the SAME id — the duplicate guard holds', () => {
  const first = resolveAlertId(call());
  const retry = resolveAlertId(call());
  assert.strictEqual(first.alertId, retry.alertId);
});

test('the id does not drift over time — no clock in the hash', async () => {
  const a = resolveAlertId(call());
  await new Promise((r) => setTimeout(r, 25));
  const b = resolveAlertId(call());
  assert.strictEqual(a.alertId, b.alertId,
    'anything we observe rather than the sender states must stay out of the hash');
});

// ── A REAL SECOND CALL MUST NEVER COLLAPSE ONTO THE FIRST ──────────────────
// This is the dangerous direction. A suppressed duplicate is recoverable; a
// dispatch that never lands is undetectable.
test('any differing stated field produces a different id', () => {
  const base = resolveAlertId(call()).alertId;
  const variants = {
    address: { address: '99 Second Ave' },
    units: { units: 'E3' },
    nature: { description: 'EMS Call' },
    time: { dispatchedAt: '2026-07-27T15:40:00Z' },
    source: { source: 'zuercher' },
  };
  for (const [label, over] of Object.entries(variants)) {
    assert.notStrictEqual(resolveAlertId(call(over)).alertId, base,
      `a call differing only in ${label} was collapsed onto another call`);
  }
});

test('two departments dispatching identically do NOT share an id', () => {
  // NENA namespaces its identifiers by agency; so do we. Without this, one
  // department's call could suppress another's under 0104's unique index.
  assert.notStrictEqual(
    resolveAlertId(call({ departmentId: 1 })).alertId,
    resolveAlertId(call({ departmentId: 2 })).alertId);
});

// ── COSMETIC DIFFERENCES IN A RETRY MUST NOT DEFEAT IT ─────────────────────
test('whitespace and case differences in a retry still match', () => {
  const a = resolveAlertId(call()).alertId;
  const b = resolveAlertId(call({
    address: '  11  First   St ', units: 'e1,l2', description: 'STRUCTURE FIRE',
  })).alertId;
  assert.strictEqual(a, b);
});

// ── A VENDOR ID ALWAYS WINS, AND IS NEVER RELABELLED ───────────────────────
test('a vendor id is used verbatim and marked as the vendor\'s', () => {
  const r = resolveAlertId(call({ vendorId: 'CAD-2026-000481' }));
  assert.strictEqual(r.alertId, 'CAD-2026-000481');
  assert.strictEqual(r.source, ID_SOURCE.VENDOR);
  assert.strictEqual(isSynthesized(r.alertId), false);
});

test('a numeric or padded vendor id survives intact', () => {
  assert.strictEqual(resolveAlertId(call({ vendorId: 481 })).alertId, '481');
  assert.strictEqual(resolveAlertId(call({ vendorId: '  481  ' })).alertId, '481');
});

test('an empty-ish vendor id is NOT a vendor id', () => {
  // '' and '   ' would otherwise be stored as the call's real number.
  for (const empty of ['', '   ', null, undefined]) {
    const r = resolveAlertId(call({ vendorId: empty }));
    assert.strictEqual(r.source, ID_SOURCE.SYNTHESIZED, `${JSON.stringify(empty)} was treated as a vendor id`);
  }
});

// ── PROVENANCE MUST NEVER MASQUERADE ───────────────────────────────────────
test('a synthesized id is visibly synthesized', () => {
  const r = resolveAlertId(call());
  assert.strictEqual(r.source, ID_SOURCE.SYNTHESIZED);
  assert.ok(isSynthesized(r.alertId), 'an operator must be able to see this was not CAD-issued');
  assert.match(r.alertId, /^syn-[0-9a-f]{20}$/);
});

test('an id is always produced — never null, never empty', () => {
  // 0104 made (department_id, alert_id) unique with NULLS NOT DISTINCT, so a
  // null would make the SECOND such call in a department a refused duplicate.
  const bare = resolveAlertId({ vendorId: null, departmentId: 1, source: 'generic' });
  assert.ok(bare.alertId && bare.alertId.length > 4);
  assert.strictEqual(bare.source, ID_SOURCE.SYNTHESIZED);
});

test('a missing sender timestamp still yields a stable id', () => {
  const a = resolveAlertId(call({ dispatchedAt: null }));
  const b = resolveAlertId(call({ dispatchedAt: null }));
  assert.strictEqual(a.alertId, b.alertId);
  // …and is still distinct from the same call WITH a timestamp.
  assert.notStrictEqual(a.alertId, resolveAlertId(call()).alertId);
});
