'use strict';
/**
 * violationStatus.test.js — freezes the canonical violation-status axis (2026-07-11).
 *
 * Guards the two failure modes the parity audit found:
 *  1. Vocabulary drift between server and web client (the old three-way mismatch:
 *     dropdown said 'Abated', default said 'Open', resolution said 'Corrected').
 *     The web client's VIOLATION_STATUSES literal is read from disk and compared.
 *  2. Silent resolution: an unknown/legacy status must NEVER count as resolved.
 * DB-free.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  VIOLATION_STATUSES, RESOLVED_VIOLATION_STATUSES,
  canonicalizeViolationStatus, isResolvedViolationStatus,
} = require('../constants/violationStatus');

test('canonical set is exactly the four-state axis', () => {
  assert.deepEqual(VIOLATION_STATUSES, ['Open', 'Time Extension', 'Corrected', 'Withdrawn']);
  assert.deepEqual(RESOLVED_VIOLATION_STATUSES, ['Corrected', 'Withdrawn']);
});

test('every legacy value canonicalizes onto the axis', () => {
  const cases = {
    'New Violation': 'Open', 'UnAbated': 'Open', 'Pending': 'Open', 'Recommended': 'Open',
    'Abated': 'Corrected', 'Void': 'Withdrawn', 'Time Extension': 'Time Extension',
    'open': 'Open', ' CORRECTED ': 'Corrected', 'withdrawn': 'Withdrawn',
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(canonicalizeViolationStatus(input), expected, input);
  }
});

test('fail-open: unknown/empty statuses become Open and are NEVER resolved', () => {
  for (const weird of ['', null, undefined, 'Fixed?', 'closed', 'resolved', 42]) {
    assert.equal(canonicalizeViolationStatus(weird), 'Open', String(weird));
    assert.equal(isResolvedViolationStatus(weird), false, String(weird));
  }
});

test('resolution semantics: Corrected + Withdrawn resolve (incl. legacy synonyms); Open + Time Extension do not', () => {
  assert.equal(isResolvedViolationStatus('Corrected'), true);
  assert.equal(isResolvedViolationStatus('Abated'), true);     // legacy synonym
  assert.equal(isResolvedViolationStatus('Withdrawn'), true);
  assert.equal(isResolvedViolationStatus('Void'), true);        // legacy synonym
  assert.equal(isResolvedViolationStatus('Open'), false);
  assert.equal(isResolvedViolationStatus('Time Extension'), false);
  assert.equal(isResolvedViolationStatus('New Violation'), false);
});

test('web client VIOLATION_STATUSES is in lockstep with the server canonical list', () => {
  const clientFile = path.join(__dirname, '../../../client/src/data/fireInspections.js');
  const src = fs.readFileSync(clientFile, 'utf8');
  const m = src.match(/export const VIOLATION_STATUSES\s*=\s*\[([^\]]*)\]/);
  assert.ok(m, 'VIOLATION_STATUSES literal not found in client data file');
  const clientList = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  assert.deepEqual(clientList, VIOLATION_STATUSES,
    'client/src/data/fireInspections.js VIOLATION_STATUSES must match server constants/violationStatus.js — change both together');
});
