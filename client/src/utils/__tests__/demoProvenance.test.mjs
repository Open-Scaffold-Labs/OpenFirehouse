// The regression fence for the Command Board's demo gate.
//
// If this test ever fails, a real fire can trigger the scripted demo sequence —
// fabricated radio traffic, a fabricated IC, fabricated NFIRS times, a fabricated
// PAR — on a live incident, and that fiction can reach incidents.notes, which is
// the subpoenable narrative and the NERIS export source.
//
// Treat a failure here as a life-safety regression, not a test failure.

import test from 'node:test';
import assert from 'node:assert';
import { isDemoDispatch, DEMO_ID_PREFIX } from '../demoProvenance.js';

test('a demo dispatch is recognised (the demo must keep working)', () => {
  // Exactly what LiveDispatch's fireDispatch() mints.
  assert.equal(isDemoDispatch({ id: 'demo-1752505200000' }), true);
  assert.equal(isDemoDispatch({ alert_id: 'demo-1752505200000' }), true);
  assert.equal(isDemoDispatch({ id: 'demo-1752505200000', alert_id: 'demo-1752505200000' }), true);
  assert.equal(DEMO_ID_PREFIX, 'demo-');
});

test('🛑 a REAL CAD dispatch is NOT a demo — the script must never run on a live call', () => {
  // Shapes a real CAD vendor actually sends.
  assert.equal(isDemoDispatch({ id: '8829371' }), false, 'numeric-string CAD id');
  assert.equal(isDemoDispatch({ id: 8829371 }), false, 'numeric CAD id');
  assert.equal(isDemoDispatch({ id: 'A911-2026-0714-0032' }), false, 'vendor-prefixed id');
  assert.equal(isDemoDispatch({ alert_id: 'ffe1b0c2-6d31-4a51-9f77-0b2e4b6f1a90' }), false, 'uuid id');
  assert.equal(isDemoDispatch({ id: 'CAD-demo-unit-7' }), false,
    'the prefix must be at the START — a real id that merely CONTAINS "demo-" is not a demo');
});

test('fail-SAFE: anything unidentifiable is treated as a REAL incident', () => {
  // The gate fails closed for the demo, which means it fails safe for real calls.
  // An alert we cannot positively identify as fake must never be assumed fake.
  assert.equal(isDemoDispatch(null), false);
  assert.equal(isDemoDispatch(undefined), false);
  assert.equal(isDemoDispatch({}), false, 'an alert with no id at all is NOT a demo');
  assert.equal(isDemoDispatch({ id: '' }), false);
  assert.equal(isDemoDispatch({ id: null }), false);
  assert.equal(isDemoDispatch('demo-123'), false, 'a bare string is not an alert object');
  assert.equal(isDemoDispatch({ description: 'demo-ish structure fire' }), false,
    'provenance comes from the ID, never from free text a dispatcher typed');
});

test('case sensitivity: only the exact lowercase prefix counts', () => {
  // We mint the ids ourselves and we mint them lowercase. Accepting 'DEMO-' would
  // widen the surface for no benefit — and widening a safety gate needs a reason.
  assert.equal(isDemoDispatch({ id: 'DEMO-123' }), false);
  assert.equal(isDemoDispatch({ id: 'Demo-123' }), false);
});
