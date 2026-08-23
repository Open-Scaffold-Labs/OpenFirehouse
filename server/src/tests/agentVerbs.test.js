'use strict';
/**
 * agentVerbs.test.js — the department MCP contract, without a live DB.
 *
 * Proves:
 *   1. Tool calls are authz-checked (no user / low role → refuse).
 *   2. Gated verbs are classified as approval (not an immediate write).
 *   3. incident_update strips notes/narrative and never forwards them.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const {
  prepareInvocation, catalog, mcpTools, LEGAL_RECORD_KEYS, VERBS,
} = require('../utils/agentVerbRegistry');

const member = { id: 9, role: 'member', roleLevel: 1, department_id: 4, name: 'Line FF' };
const officer = { id: 3, role: 'officer', roleLevel: 2, department_id: 4, name: 'Capt' };
const chief = { id: 1, role: 'chief', roleLevel: 3, department_id: 4, name: 'Chief' };

test('catalog is the first-slice verb set (not the LLM action list)', () => {
  const names = catalog().map((v) => v.name).sort();
  assert.deepStrictEqual(names, [
    'apparatus_status_read',
    'apparatus_status_update',
    'incident_read',
    'incident_update',
    'neris_submit',
    'notify_chief',
    'roster_read',
    'training_hours_read',
  ]);
  assert.ok(!names.includes('ai_log_incident'), 'LLM draft actions are a different catalog');
  assert.equal(mcpTools().length, names.length);
});

test('unauthenticated and unknown verbs fail closed', () => {
  const noUser = prepareInvocation('incident_read', {}, null);
  assert.equal(noUser.ok, false);
  assert.equal(noUser.status, 401);
  assert.equal(noUser.code, 'UNAUTHENTICATED');

  const unknown = prepareInvocation('cad_enrich_incident', {}, chief);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.status, 400);
  assert.equal(unknown.code, 'UNKNOWN_VERB');
});

test('apparatus_status_update is officer-gated at the verb layer', () => {
  const denied = prepareInvocation('apparatus_status_update', { apparatusId: 1, status: 'in_service' }, member);
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);
  assert.equal(denied.code, 'FORBIDDEN_ROLE');

  const allowed = prepareInvocation('apparatus_status_update', { apparatusId: 1, status: 'in_service' }, officer);
  assert.equal(allowed.ok, true);
  assert.equal(allowed.gate, 'approval');
});

test('gated verbs create an approval plan instead of a write', () => {
  const neris = prepareInvocation('neris_submit', { id: 44 }, member);
  assert.equal(neris.ok, true);
  assert.equal(neris.gate, 'approval');
  assert.equal(neris.executePlan.kind, 'neris_submit');

  const notify = prepareInvocation('notify_chief', { subject: 'Coverage', body: 'Need a driver tonight.' }, member);
  assert.equal(notify.ok, true);
  assert.equal(notify.gate, 'approval');

  const clear = prepareInvocation('apparatus_status_update', { apparatusId: 7, status: 'in_service' }, chief);
  assert.equal(clear.ok, true);
  assert.equal(clear.gate, 'approval');
});

test('reads and fact-only incident update are not approval-gated', () => {
  assert.equal(prepareInvocation('incident_read', {}, member).gate, 'none');
  assert.equal(prepareInvocation('roster_read', {}, member).gate, 'none');
  assert.equal(prepareInvocation('training_hours_read', {}, member).gate, 'none');
  assert.equal(prepareInvocation('apparatus_status_read', {}, member).gate, 'none');

  const update = prepareInvocation('incident_update', { id: 12, type: 'Vehicle Fire', address: '1 Main' }, member);
  assert.equal(update.ok, true);
  assert.equal(update.gate, 'strip_legal_record');
  assert.deepStrictEqual(update.route.body, { type: 'Vehicle Fire', address: '1 Main' });
});

test('incident_update strips notes/narrative and refuses a notes-only write', () => {
  const mixed = prepareInvocation('incident_update', {
    id: 12,
    type: 'Structure Fire',
    notes: 'Heavy smoke showing from side C.',
    narrativeStatement: 'Units arrived to find…',
    description: 'officer-looking prose',
  }, member);
  assert.equal(mixed.ok, true);
  assert.deepStrictEqual(mixed.droppedKeys.sort(), ['description', 'narrativeStatement', 'notes']);
  assert.deepStrictEqual(mixed.route.body, { type: 'Structure Fire' });
  assert.ok(!('notes' in mixed.route.body));

  const notesOnly = prepareInvocation('incident_update', { id: 12, notes: 'do not write this' }, member);
  assert.equal(notesOnly.ok, false);
  assert.equal(notesOnly.code, 'LEGAL_RECORD_FORBIDDEN');
  assert.ok(notesOnly.droppedKeys.includes('notes'));
});

test('legal-record key list stays locked to the AI-narrative guard set plus description', () => {
  // Same closed set ai_log_incident.forbiddenResultKeys uses — listed here so
  // this file never loads aiActionRegistry (which pulls in db/pg).
  const aiLogIncidentForbidden = [
    'notes', 'narrative', 'outcome_narrative', 'impediment_narrative', 'narrativeStatement',
  ];
  for (const key of aiLogIncidentForbidden) {
    assert.ok(LEGAL_RECORD_KEYS.includes(key), `missing ${key}`);
  }
  assert.ok(LEGAL_RECORD_KEYS.includes('description'));
  assert.equal(VERBS.incident_update.gate, 'strip_legal_record');
});
