'use strict';
/**
 * fiViolationNormalize.test.js — freezes the P0 normalize semantics (2026-07-12).
 *
 * Guards three legal-record invariants:
 *  1. status_raw: canonicalization must PRESERVE the inspector's original word,
 *     exactly once — the first raw value wins forever, later writes never clobber it.
 *  2. Stable identity: write-path normalization assigns a UUID only when an id is
 *     missing; ANY existing id (including the migration-0045 position-string ids
 *     that keep photos attached) is kept verbatim. Read path never assigns.
 *  3. Fail-open stays: unknown statuses land on 'Open', never on a resolved state.
 * DB-free.
 */
const test = require('node:test');
const assert = require('node:assert');
const { normalizeViolation, normalizeViolations } = require('../constants/violationStatus');

test('legacy status canonicalizes and the original word is preserved in status_raw', () => {
  const v = normalizeViolation({ code: '1001', status: 'Abated' });
  assert.equal(v.status, 'Corrected');
  assert.equal(v.status_raw, 'Abated');
});

test('canonical statuses do not grow a status_raw', () => {
  const v = normalizeViolation({ code: '1001', status: 'Open' });
  assert.equal(v.status, 'Open');
  assert.equal('status_raw' in v, false);
});

test('an existing status_raw is never overwritten (first raw wins)', () => {
  const once  = normalizeViolation({ status: 'UnAbated' });            // → Open, raw 'UnAbated'
  const again = normalizeViolation({ ...once, status: 'Abated' });     // user later corrects it
  assert.equal(again.status, 'Corrected');
  assert.equal(again.status_raw, 'UnAbated', 'first raw value must win forever');
});

test('idempotent: normalizing twice changes nothing', () => {
  const v1 = normalizeViolation({ code: '2001', status: 'Pending' });
  const v2 = normalizeViolation(v1);
  assert.deepEqual(v2, v1);
});

test('write path assigns a UUID only when id is missing; existing ids kept verbatim', () => {
  const fresh = normalizeViolation({ status: 'Open' }, { assignId: true });
  assert.match(String(fresh.id), /^[0-9a-f-]{36}$/, 'missing id → UUID');

  const legacy = normalizeViolation({ id: '2', status: 'Open' }, { assignId: true });
  assert.equal(legacy.id, '2', 'migration position-string ids must survive (photo paths key on them)');

  const uuid = 'a1b2c3d4-0000-4000-8000-000000000000';
  assert.equal(normalizeViolation({ id: uuid, status: 'Open' }, { assignId: true }).id, uuid);
});

test('read path never fabricates an id', () => {
  const v = normalizeViolation({ status: 'Corrected' });
  assert.equal('id' in v, false);
});

test('fail-open survives normalization: unknown statuses are Open, never resolved', () => {
  for (const weird of ['Fixed?', '', null, undefined]) {
    assert.equal(normalizeViolation({ status: weird }).status, 'Open', String(weird));
  }
});

test('normalizeViolations maps arrays and tolerates junk', () => {
  const out = normalizeViolations([{ status: 'Void' }, null, 'junk'], { assignId: true });
  assert.equal(out[0].status, 'Withdrawn');
  assert.equal(out[0].status_raw, 'Void');
  assert.ok(out[0].id);
  assert.equal(out[1], null);
  assert.equal(out[2], 'junk');
  assert.deepEqual(normalizeViolations('not-an-array'), []);
});
