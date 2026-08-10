#!/usr/bin/env node
'use strict';
/**
 * neris-compat-proofs.js — the NERIS V1 Data Exchange Compatibility proofs.
 *
 * Runs the four API operations the compatibility checklist requires, in order,
 * against the FSRI test department, using the ONE canonical transformer
 * (utils/nerisPayload) and the ONE client (utils/nerisClient):
 *
 *   1. mint token (client_credentials)          — implicit
 *   2. POST /incident/{entity}/validate         — preflight (not required by the
 *      checklist; run because submitting an invalid record to a legal system is
 *      not how this project operates)
 *   3. POST /incident/{entity}                  — "Create a valid incident"
 *   4. PUT  /incident/{entity}/{uid}            — "Using the UID … submit an update"
 *   5. POST /entity/{entity}/station            — "Create a new station"
 *   6. POST /entity/{entity}/station/{id}/unit  — "Add a unit to that created station"
 *
 * Usage:
 *   NERIS_CLIENT_ID=… NERIS_CLIENT_SECRET=… node scripts/neris-compat-proofs.js
 *   Optional env:
 *     NERIS_ENTITY    target department entity (default FD51087867 — FSRI test FD)
 *     NERIS_API_BASE  API base (default: the TEST env, api-test.neris.fsri.org/v1)
 *
 * Credentials come from the SHELL ENV ONLY — never hardcoded, never committed
 * (verify-dispatch-realtime.js precedent). Exit codes: 0 all proofs pass ·
 * 1 a proof failed (refused) · 2 unexpected/environment error.
 *
 * Every request/response is printed (ids + statuses only — never the secret) so a
 * successful run IS the evidence for the compatibility-check helpdesk ticket.
 */

const path = require('path');
const client = require(path.join(__dirname, '..', 'server', 'src', 'utils', 'nerisClient'));
const { buildNerisIncidentPayload } = require(path.join(__dirname, '..', 'server', 'src', 'utils', 'nerisPayload'));

const ENTITY = process.env.NERIS_ENTITY || 'FD51087867'; // FSRI test department
const RUN_TAG = `OF-COMPAT-${new Date().toISOString().replace(/[:.]/g, '-')}`;

function ok(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); }

/** The proof incident — synthetic, clearly labeled, built by the ONE transformer. */
function buildProofPayload({ narrative }) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const incident = {
    incidentNumber: RUN_TAG,
    date,
    time: hhmm,
    address: '123 Main St, Glen Allen, VA 23060',
    units: JSON.stringify(['E1']),
    notes: narrative,
    // A cancelled-en-route no-action record: the minimal honest "valid incident."
    // (A FIRE||STRUCTURE_FIRE proof record hit NERIS's module rule — structure fires
    // require smoke_alarm/fire_alarm/other_alarm/fire_suppression modules, which OF
    // does not capture yet. Logged as a Phase 2 follow-up, 2026-07-20.)
    neris_incident_types: [
      { value: 'NOEMERG||CANCELLED', primary: true },
    ],
    neris_noaction: 'CANCELLED',
    // PSAP call times are REQUIRED (P2-D4: captured, never invented). NERIS rule
    // (learned from a live 422): call_arrival (rings at the PSAP) precedes
    // call_answered (dispatcher picks up), which precedes call_create (CAD entry).
    neris_dispatch_times: {
      call_arrival: new Date(now.getTime() - 8 * 60_000).toISOString(),
      call_answered: new Date(now.getTime() - 7 * 60_000).toISOString(),
    },
  };
  const built = buildNerisIncidentPayload({
    incident,
    nfirsReport: { incidentDate: date, alarmTime: hhmm, arrivalTime: hhmm, clearedTime: hhmm },
    department: { id: 0, name: 'Open Scaffold Labs Test Fire Department', fdid: ENTITY },
    options: { departmentNerisId: ENTITY, defaultState: 'VA' },
  });
  return built;
}

async function main() {
  console.log(`NERIS compatibility proofs — entity ${ENTITY}, base ${process.env.NERIS_API_BASE || client.NERIS_TEST_BASE}`);
  console.log(`run tag: ${RUN_TAG}\n`);

  if (!client.isConfigured()) {
    fail('NERIS_CLIENT_ID / NERIS_CLIENT_SECRET not set in the environment.');
    process.exit(2);
  }

  const evidence = { run_tag: RUN_TAG, entity: ENTITY, steps: {} };

  // ── 1. token ──────────────────────────────────────────────────────────────
  console.log('Proof 0 — mint client_credentials token');
  await client.getToken();
  ok('token minted (client_credentials)');

  // ── 2. local build + remote validate ─────────────────────────────────────
  console.log('Proof 1 — build via the ONE transformer + POST …/validate');
  const { payload, validation, _meta } = buildProofPayload({
    narrative: `Compatibility proof record ${RUN_TAG}. Synthetic test data — not a real incident.`,
  });
  if (!validation.valid) {
    fail(`local validation failed before any API call:`);
    for (const e of validation.errors) fail(`  ${e}`);
    process.exit(1);
  }
  ok(`local validation clean (completeness ${validation.completeness ?? 'n/a'}, shape ${_meta.payload_shape})`);
  const v = await client.validateIncident(ENTITY, payload);
  ok(`remote validate → HTTP ${v.status} (payload accepted by the NERIS validator)`);
  evidence.steps.validate = { status: v.status };

  // ── 3. create incident ────────────────────────────────────────────────────
  console.log('Proof 2 — POST /incident/{entity} (create a valid incident)');
  const created = await client.createIncident(ENTITY, payload);
  const nerisId = created.data && created.data.neris_id;
  if (!nerisId) { fail(`created but no neris_id in response: ${JSON.stringify(created.data)}`); process.exit(1); }
  ok(`created → HTTP ${created.status}, neris_id ${nerisId}`);
  ok(`incident_status: ${JSON.stringify(created.data.incident_status && created.data.incident_status.status)}`);
  evidence.steps.create = { status: created.status, neris_id: nerisId };

  // ── 3b. wait out the SUBMITTED window ────────────────────────────────────
  // NERIS processes a submission asynchronously: updates are refused until the
  // status leaves SUBMITTED (learned from a live 422 — updatable statuses are
  // REJECTED / PENDING_INCIDENT_DATA / APPROVED / PENDING_APPROVAL).
  const UPDATABLE = new Set(['REJECTED', 'PENDING_INCIDENT_DATA', 'APPROVED', 'PENDING_APPROVAL']);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let status = created.data.incident_status && created.data.incident_status.status
    ? created.data.incident_status.status : String(created.data.incident_status);
  for (let attempt = 0; attempt < 18 && !UPDATABLE.has(status); attempt += 1) {
    await sleep(5000);
    const got = await client.getIncident(ENTITY, nerisId);
    const s = got.data && (got.data.incident_status && got.data.incident_status.status
      ? got.data.incident_status.status
      : (typeof got.data.incident_status === 'string' ? got.data.incident_status : got.data.status));
    status = s || status;
    console.log(`  … status ${status} (poll ${attempt + 1})`);
  }
  if (!UPDATABLE.has(status)) {
    fail(`incident never left SUBMITTED after 90s (status ${status}) — re-run later; the record exists`);
    process.exit(2);
  }

  // ── 4. update by UID ─────────────────────────────────────────────────────
  console.log('Proof 3 — PUT /incident/{entity}/{uid} (update by UID)');
  const { payload: updated, validation: v2 } = buildProofPayload({
    narrative: `Compatibility proof record ${RUN_TAG} — UPDATED by UID to prove update-by-UID. Synthetic test data.`,
  });
  if (!v2.valid) { fail('updated payload failed local validation'); process.exit(1); }
  const put = await client.putIncident(ENTITY, nerisId, updated);
  ok(`updated → HTTP ${put.status}, last_modified ${put.data && put.data.last_modified}`);
  evidence.steps.update = { status: put.status, last_modified: put.data && put.data.last_modified };

  // ── 5. create station ────────────────────────────────────────────────────
  console.log('Proof 4 — POST /entity/{entity}/station (create a station)');
  const station = await client.createStation(ENTITY, {
    address_line_1: '123 Compatibility Way',
    city: 'Glen Allen',
    state: 'VA',
    zip_code: '23060',
    station_id: `OF-TEST-STN-${Date.now()}`,
  });
  const stationId = station.data && station.data.neris_id;
  if (!stationId) { fail(`station created but no neris_id: ${JSON.stringify(station.data)}`); process.exit(1); }
  ok(`station created → HTTP ${station.status}, neris_id ${stationId}`);
  evidence.steps.station = { status: station.status, neris_id: stationId };

  // ── 6. add unit ──────────────────────────────────────────────────────────
  console.log('Proof 5 — POST …/station/{station}/unit (add a unit)');
  const unit = await client.createUnit(ENTITY, stationId, {
    staffing: 4,
    type: 'ENGINE_STRUCT',            // NERIS TypeUnitValue, verbatim
    cad_designation_1: `OF-TEST-E-${Date.now()}`,
  });
  const unitId = unit.data && unit.data.neris_id;
  if (!unitId) { fail(`unit created but no neris_id: ${JSON.stringify(unit.data)}`); process.exit(1); }
  ok(`unit created → HTTP ${unit.status}, neris_id ${unitId}`);
  evidence.steps.unit = { status: unit.status, neris_id: unitId };

  // ── summary ──────────────────────────────────────────────────────────────
  console.log('\nALL PROOFS PASSED — evidence for the compatibility-check request:');
  console.log(JSON.stringify(evidence, null, 2));
  process.exit(0);
}

main().catch((err) => {
  if (err && err.name === 'NerisRefusedError') {
    fail(`NERIS REFUSED (${err.status}): ${err.detail || err.message}`);
    fail('This is terminal — fix the payload/credentials and re-run. Do not blind-retry.');
    process.exit(1);
  }
  if (err && err.name === 'NerisUnavailableError') {
    fail(`NERIS unavailable (${err.status || 'network'}): ${err.reason || err.message}`);
    fail('This is the server failing, not a refusal — safe to re-run.');
    process.exit(2);
  }
  fail(`unexpected: ${err && err.message ? err.message : err}`);
  process.exit(2);
});
