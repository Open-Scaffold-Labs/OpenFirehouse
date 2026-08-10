#!/usr/bin/env node
'use strict';
/**
 * neris-fp-proofs.js — live proofs for the Fire Protection modules build (FP,
 * 2026-07-20). Companion to neris-compat-proofs.js; same client, same ONE
 * transformer, same env contract (creds from shell env only).
 *
 * Proves, against the live NERIS test API, that the structure-fire module gap
 * Track A found is CLOSED — and settles the one deliberately-unverified reading
 * in the FP build (empty aids = modules required):
 *
 *   A. structure fire WITH all four modules      → validate 2xx + create 201
 *   B. structure fire, NO modules, NO aids       → validate REFUSED (422) ← the empty-aids proof
 *   C. structure fire, NO modules, all aids
 *      SUPPORT_AID GIVEN                         → validate 2xx (the waiver)
 *   D. structure fire, NO modules, aids incl.
 *      SUPPORT_AID RECEIVED                      → validate REFUSED (422)
 *
 * B/C/D go through /validate only (no records created); A creates a real test
 * record as regression evidence. B/C/D deliberately BYPASS our local validation
 * gate — the point is to observe the NERIS validator's own behavior.
 */

const path = require('path');
const client = require(path.join(__dirname, '..', 'server', 'src', 'utils', 'nerisClient'));
const { buildNerisIncidentPayload } = require(path.join(__dirname, '..', 'server', 'src', 'utils', 'nerisPayload'));

const ENTITY = process.env.NERIS_ENTITY || 'FD51087867';
const RUN_TAG = `OF-FP-${new Date().toISOString().replace(/[:.]/g, '-')}`;

function ok(msg) { console.log(`  ✓ ${msg}`); }
function info(msg) { console.log(`  … ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); }

const FP_MODULES = {
  smoke_alarm: { presence: { type: 'PRESENT', working: true,
    alarm_types: ['HARDWIRED', 'INTERCONNECTED'],
    operation: { alerted_failed_other: { type: 'OPERATED_ALERTED_OCCUPANT', occupant_action: 'EVACUATED' } } } },
  fire_alarm: { presence: { type: 'NOT_PRESENT' } },
  other_alarm: { presence: { type: 'PRESENT', alarm_types: ['CARBON_MONOXIDE'] } },
  fire_suppression: { presence: { type: 'PRESENT',
    suppression_types: [{ type: 'WET_PIPE_SPRINKLER_SYSTEM', full_partial: 'PARTIAL' }],
    operation_type: { effectiveness: { type: 'OPERATED_EFFECTIVE', sprinklers_activated: 2 } } } },
};

function buildStructureFire({ withModules, aids, label }) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const incident = {
    incidentNumber: `${RUN_TAG}-${label}`,
    date, time: hhmm,
    address: '123 Main St, Glen Allen, VA 23060',
    units: JSON.stringify(['E1']),
    notes: `FP proof record ${RUN_TAG}-${label}. Synthetic test data — not a real incident.`,
    neris_incident_types: [
      { value: 'FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE', primary: true },
    ],
    neris_actions: ['SUPPRESSION||STRUCTURAL_FIRE_SUPPRESSION||INTERIOR'],
    neris_fire_detail: {
      location_detail: {
        type: 'STRUCTURE', floor_of_origin: 1, arrival_condition: 'SMOKE_FIRE_SHOWING',
        damage_type: 'MODERATE_DAMAGE', room_of_origin_type: 'KITCHEN', cause: 'COOKING',
      },
      water_supply: 'HYDRANT_GREATER_500',
      investigation_needed: 'NO_CAUSE_OBVIOUS',
      investigation_types: ['NONE'],
    },
    neris_dispatch_times: {
      call_arrival: new Date(now.getTime() - 8 * 60_000).toISOString(),
      call_answered: new Date(now.getTime() - 7 * 60_000).toISOString(),
    },
  };
  if (withModules) incident.neris_fire_protection = FP_MODULES;
  if (aids) incident.neris_aids = aids;
  return buildNerisIncidentPayload({
    incident,
    nfirsReport: { incidentDate: date, alarmTime: hhmm, arrivalTime: hhmm, clearedTime: hhmm },
    department: { id: 0, name: 'Open Scaffold Labs Test Fire Department', fdid: ENTITY },
    options: { departmentNerisId: ENTITY, defaultState: 'VA' },
  });
}

/** Run /validate expecting acceptance. */
async function expectAccepted(name, payload) {
  const v = await client.validateIncident(ENTITY, payload);
  ok(`${name}: remote validate → HTTP ${v.status} (accepted)`);
  return { accepted: true, status: v.status };
}

/** Run /validate expecting a refusal; returns the refusal detail. */
async function expectRefused(name, payload) {
  try {
    const v = await client.validateIncident(ENTITY, payload);
    fail(`${name}: expected a refusal but validate returned HTTP ${v.status}`);
    return { accepted: true, status: v.status };
  } catch (err) {
    if (err && err.name === 'NerisRefusedError') {
      ok(`${name}: NERIS refused as expected (${err.status})`);
      info(`detail: ${String(err.detail || err.message).slice(0, 300)}`);
      return { accepted: false, status: err.status, detail: err.detail || err.message };
    }
    throw err;
  }
}

async function main() {
  console.log(`NERIS Fire Protection proofs — entity ${ENTITY}, base ${process.env.NERIS_API_BASE || client.NERIS_TEST_BASE}`);
  console.log(`run tag: ${RUN_TAG}\n`);
  if (!client.isConfigured()) { fail('NERIS_CLIENT_ID / NERIS_CLIENT_SECRET not set.'); process.exit(2); }

  const evidence = { run_tag: RUN_TAG, entity: ENTITY, proofs: {} };
  await client.getToken();
  ok('token minted\n');

  // ── A: full structure fire WITH modules → accepted + created ──────────────
  console.log('Proof A — structure fire WITH all four modules (validate + create)');
  const a = buildStructureFire({ withModules: true, label: 'A' });
  if (!a.validation.valid) {
    fail('local validation failed — the build is wrong, not NERIS:');
    for (const e of a.validation.errors) fail(`  ${e}`);
    process.exit(1);
  }
  ok(`local validation clean (completeness ${a.validation.completeness})`);
  evidence.proofs.A_validate = await expectAccepted('A', a.payload);
  const created = await client.createIncident(ENTITY, a.payload);
  const nerisId = created.data && created.data.neris_id;
  if (!nerisId) { fail(`create returned no neris_id: ${JSON.stringify(created.data)}`); process.exit(1); }
  ok(`A: created → HTTP ${created.status}, neris_id ${nerisId}\n`);
  evidence.proofs.A_create = { status: created.status, neris_id: nerisId };

  // ── B: NO modules, NO aids → must be refused (the empty-aids proof) ───────
  console.log('Proof B — structure fire, NO modules, NO aids (expect 422; settles empty-aids = required)');
  const b = buildStructureFire({ withModules: false, label: 'B' });
  info(`local validator agrees: ${b.validation.errors.filter((e) => e.startsWith('Fire protection')).length} FP errors locally`);
  evidence.proofs.B = await expectRefused('B', b.payload);
  console.log('');

  // ── C: NO modules, all aids SUPPORT_AID GIVEN → waiver should accept ──────
  console.log('Proof C — structure fire, NO modules, ALL aids SUPPORT_AID GIVEN (expect accepted)');
  const c = buildStructureFire({ withModules: false, label: 'C',
    aids: [{ department_neris_id: 'FD99999999', aid_type: 'SUPPORT_AID', aid_direction: 'GIVEN' }] });
  try {
    evidence.proofs.C = await expectAccepted('C', c.payload);
  } catch (err) {
    if (err && err.name === 'NerisRefusedError') {
      fail(`C: refused (${err.status}) — inspect whether this is the module rule or an aid-entity check:`);
      fail(`detail: ${String(err.detail || err.message).slice(0, 300)}`);
      evidence.proofs.C = { accepted: false, status: err.status, detail: err.detail || err.message };
    } else throw err;
  }
  console.log('');

  // ── D: NO modules, aids incl. RECEIVED → waiver must NOT apply ────────────
  console.log('Proof D — structure fire, NO modules, aids incl. SUPPORT_AID RECEIVED (expect 422)');
  const d = buildStructureFire({ withModules: false, label: 'D',
    aids: [{ department_neris_id: 'FD99999999', aid_type: 'SUPPORT_AID', aid_direction: 'RECEIVED' }] });
  evidence.proofs.D = await expectRefused('D', d.payload);

  console.log('\nFP PROOF EVIDENCE:');
  console.log(JSON.stringify(evidence, null, 2));
  const pass = evidence.proofs.A_create && evidence.proofs.A_create.status === 201
    && evidence.proofs.B && evidence.proofs.B.accepted === false
    && evidence.proofs.D && evidence.proofs.D.accepted === false;
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  if (err && err.name === 'NerisRefusedError') {
    fail(`NERIS REFUSED (${err.status}): ${err.detail || err.message}`);
    process.exit(1);
  }
  if (err && err.name === 'NerisUnavailableError') {
    fail(`NERIS unavailable (${err.status || 'network'}): ${err.reason || err.message} — safe to re-run.`);
    process.exit(2);
  }
  fail(`unexpected: ${err && err.message ? err.message : err}`);
  process.exit(2);
});
