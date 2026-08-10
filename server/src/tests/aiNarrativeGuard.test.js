'use strict';
/**
 * aiNarrativeGuard.test.js — the AI-narrative boundary must hold in CODE.
 *
 * The regression this fences: `ai_log_incident`'s prompt said "Do NOT include a
 * notes field", the client read `notes` off the result and wrote it into the
 * narrative box, and nothing in between enforced anything. Every test here feeds a
 * result that IGNORES the instruction — because that is the only case that matters.
 * A test that feeds a compliant result proves nothing.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { stripForbiddenKeys } = require('../utils/aiNarrativeGuard');
const registry = require('../utils/aiActionRegistry');

const LOG_INCIDENT_FORBIDDEN = registry.ai_log_incident.forbiddenResultKeys;

test('the model ignored its instruction: `notes` is removed from the result', () => {
  const result = {
    type: 'Structure Fire',
    address: '77 Cedar Grove Road',
    notes: 'Units arrived to find heavy smoke showing from side C...',
  };
  const dropped = stripForbiddenKeys(result, LOG_INCIDENT_FORBIDDEN);
  assert.deepStrictEqual(dropped, ['notes']);
  assert.ok(!('notes' in result), 'notes must not survive — it is the subpoenable narrative');
  assert.strictEqual(result.type, 'Structure Fire', 'factual auto-fill is ALLOWED and must survive');
  assert.strictEqual(result.address, '77 Cedar Grove Road');
});

test('every narrative alias is stripped, not just `notes`', () => {
  const result = {
    type: 'Vehicle Fire',
    notes: 'x', narrative: 'x', outcome_narrative: 'x',
    impediment_narrative: 'x', narrativeStatement: 'x',
  };
  const dropped = stripForbiddenKeys(result, LOG_INCIDENT_FORBIDDEN);
  assert.strictEqual(dropped.length, 5);
  assert.deepStrictEqual(Object.keys(result), ['type']);
});

test('a present-but-empty narrative still counts as emitted, and is removed', () => {
  // '' and null are falsy. The old client guard was `if (aiPrefill.notes)`, which
  // would have skipped these — so the guard must key on PRESENCE, not truthiness,
  // or the two mechanisms disagree about what happened.
  for (const empty of ['', null, 0, false]) {
    const result = { type: 'Medical / EMS', notes: empty };
    const dropped = stripForbiddenKeys(result, LOG_INCIDENT_FORBIDDEN);
    assert.deepStrictEqual(dropped, ['notes'], `presence of notes=${JSON.stringify(empty)} must be detected`);
    assert.ok(!('notes' in result));
  }
});

test('a compliant result is left completely alone, and reports nothing dropped', () => {
  const result = { type: 'Gas Leak', units: ['Engine 1'], personnel: ['Capt. Lavin'] };
  const before = JSON.stringify(result);
  const dropped = stripForbiddenKeys(result, LOG_INCIDENT_FORBIDDEN);
  assert.deepStrictEqual(dropped, []);
  assert.strictEqual(JSON.stringify(result), before);
});

test('actions that do NOT declare forbidden keys are untouched — the staffing forecast keeps its notes', () => {
  // Scope check. A blanket strip of `notes` would break this: the staffing
  // forecast's `notes` is coverage advice on an internal document, not a legal record.
  const forecast = { forecast: [{ date: '2026-08-08', notes: 'two members on leave' }] };
  const dropped = stripForbiddenKeys(forecast, undefined);
  assert.deepStrictEqual(dropped, []);
  assert.strictEqual(forecast.forecast[0].notes, 'two members on leave');
});

test('the strip is TOP-LEVEL only — it never reaches into nested objects', () => {
  const result = { type: 'Hazmat', notes: 'strip me', detail: { notes: 'keep me' } };
  stripForbiddenKeys(result, LOG_INCIDENT_FORBIDDEN);
  assert.ok(!('notes' in result));
  assert.strictEqual(result.detail.notes, 'keep me');
});

test('malformed results do not throw — a crash here would 500 the whole action', () => {
  for (const bad of [null, undefined, 'a string', 42, ['an', 'array']]) {
    assert.deepStrictEqual(stripForbiddenKeys(bad, LOG_INCIDENT_FORBIDDEN), []);
  }
});

test("the registry still DECLARES the boundary — deleting the declaration must fail a test", () => {
  // Without this, someone could silently drop `forbiddenResultKeys` from the action
  // and every test above would still pass while the hole reopened.
  assert.ok(Array.isArray(registry.ai_log_incident.forbiddenResultKeys),
    'ai_log_incident must declare forbiddenResultKeys');
  assert.ok(registry.ai_log_incident.forbiddenResultKeys.includes('notes'),
    'notes is the subpoenable narrative — it must be in the forbidden list');
});
