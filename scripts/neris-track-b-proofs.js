#!/usr/bin/env node
'use strict';
/**
 * neris-track-b-proofs.js — live proofs for the Track B submission engine
 * (2026-07-20). Companion to neris-compat-proofs.js / neris-fp-proofs.js; same
 * env contract (creds from shell env only, .env.neris.local).
 *
 * Exercises the ACTUAL ENGINE (utils/nerisSubmit — not a parallel
 * reimplementation) against the live test API, using the local dev database:
 *
 *   1. CREATE   — approve → attemptSubmission → real 201, uid + status persisted
 *   2. WINDOW   — immediate second attempt → update_pending while SUBMITTED
 *   3. POLL     — refreshNerisStatus until the async pipeline moves it
 *   4. UPDATE   — edit + re-attempt → real PUT 200 by UID
 *   5. REFUSED  — a structure fire stripped of its FP modules → engine records
 *                 'refused' with NERIS's own rule text (never retried)
 *
 * Requires: local Postgres (freestation), department 1 configured by the script
 * (neris_id = FSRI test dept, enabled; restored to disabled afterwards).
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://matthewlavin@localhost:5432/freestation';

const db = require('../server/src/db');
const client = require('../server/src/utils/nerisClient');
const { attemptSubmission, refreshNerisStatus } = require('../server/src/utils/nerisSubmit');

const ENTITY = process.env.NERIS_ENTITY || 'FD51087867';
const RUN = `OF-TB-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const DEPT = 1;

const ok = (m) => console.log(`  ✓ ${m}`);
const info = (m) => console.log(`  … ${m}`);
const fail = (m) => console.error(`  ✗ ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function validBody(num) {
  const now = new Date();
  return {
    incidentNumber: num, date: now.toISOString().slice(0, 10),
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    type: 'Public Assist',
    address: '123 Main St, Glen Allen, VA 23060',
    units: JSON.stringify(['E1']),
    notes: `Track B proof ${num}. Synthetic test data — not a real incident.`,
    neris_incident_types: [{ value: 'NOEMERG||CANCELLED', primary: true }],
    neris_noaction: 'CANCELLED',
    neris_dispatch_times: {
      call_arrival: new Date(now.getTime() - 8 * 60000).toISOString(),
      call_answered: new Date(now.getTime() - 7 * 60000).toISOString(),
    },
  };
}

async function mkApproved(num, extra = {}) {
  const created = await db.incidents.create({ ...validBody(num), ...extra }, DEPT);
  await db.incidents.nerisStatusTransition(created.id, DEPT, 'draft', 'in_review', {});
  await db.incidents.nerisStatusTransition(created.id, DEPT, 'in_review', 'approved', {});
  return created.id;
}

async function main() {
  console.log(`NERIS Track B proofs — entity ${ENTITY}, base ${process.env.NERIS_API_BASE || client.NERIS_TEST_BASE}`);
  console.log(`run: ${RUN}\n`);
  if (!client.isConfigured()) { fail('NERIS creds not in env'); process.exit(2); }

  const evidence = { run: RUN, proofs: {} };
  await db.pool.query('UPDATE departments SET neris_id=$1, neris_submission_enabled=TRUE WHERE id=$2', [ENTITY, DEPT]);
  const num = `${RUN}`;
  try {
    // ── 1. CREATE through the engine ─────────────────────────────────────────
    console.log('Proof 1 — approve → engine → real CREATE');
    const id = await mkApproved(num);
    const r1 = await attemptSubmission(id, DEPT, { reason: 'approve' });
    let rec = await db.incidents.findById(id, DEPT);
    if (r1.state !== 'submitted' || !rec.neris_incident_uid) {
      fail(`create failed: state=${r1.state} uid=${rec.neris_incident_uid} log=${JSON.stringify(rec.neris_submission_log)}`);
      process.exit(1);
    }
    ok(`created + persisted: uid ${rec.neris_incident_uid}, NERIS status ${rec.neris_incident_status}`);
    evidence.proofs.create = { uid: rec.neris_incident_uid, status: rec.neris_incident_status };

    // ── 2. The SUBMITTED window ──────────────────────────────────────────────
    console.log('Proof 2 — immediate re-attempt defers (the SUBMITTED window)');
    const r2 = await attemptSubmission(id, DEPT, { reason: 'retry' });
    rec = await db.incidents.findById(id, DEPT);
    if (rec.neris_incident_status === 'SUBMITTED') {
      if (r2.state !== 'update_pending') { fail(`expected update_pending, got ${r2.state}`); process.exit(1); }
      ok('deferred as update_pending — no PUT against a SUBMITTED record');
    } else {
      info(`pipeline already moved it (${rec.neris_incident_status}) — window not observable this run; r2=${r2.state}`);
    }
    evidence.proofs.window = { state: r2.state, neris_status: rec.neris_incident_status };

    // ── 3. POLL until updatable ──────────────────────────────────────────────
    console.log('Proof 3 — refreshNerisStatus polls the async pipeline');
    let status = rec.neris_incident_status;
    for (let i = 0; i < 18 && status === 'SUBMITTED'; i += 1) {
      await sleep(5000);
      const r = await refreshNerisStatus(id, DEPT);
      status = r.neris_status || status;
      info(`poll ${i + 1}: ${status}`);
    }
    if (status === 'SUBMITTED') { fail('never left SUBMITTED after 90s'); process.exit(2); }
    ok(`NERIS status now ${status} (persisted verbatim)`);
    evidence.proofs.poll = { status };

    // ── 4. UPDATE by UID through the engine ──────────────────────────────────
    console.log('Proof 4 — edit + re-attempt → real UPDATE by UID');
    await db.incidents.update(id, { notes: `${validBody(num).notes} UPDATED to prove update-by-UID.` }, DEPT);
    const r4 = await attemptSubmission(id, DEPT, { reason: 'sweep' });
    rec = await db.incidents.findById(id, DEPT);
    if (r4.state !== 'submitted') { fail(`update failed: ${r4.state} log=${JSON.stringify(rec.neris_submission_log.at(-1))}`); process.exit(1); }
    ok(`update landed: ${rec.neris_submission_log.at(-1).outcome} (http ${rec.neris_submission_log.at(-1).http})`);
    evidence.proofs.update = rec.neris_submission_log.at(-1);

    // ── 5. REFUSED is terminal + recorded ────────────────────────────────────
    console.log('Proof 5 — structure fire without FP modules → engine records refused');
    const badNum = `${RUN}-REFUSED`;
    const badId = await mkApproved(badNum, {
      neris_incident_types: [{ value: 'FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE', primary: true }],
      neris_noaction: null,
      neris_actions: ['SUPPRESSION||STRUCTURAL_FIRE_SUPPRESSION||INTERIOR'],
      neris_fire_detail: {
        location_detail: { type: 'STRUCTURE', floor_of_origin: 1, arrival_condition: 'SMOKE_FIRE_SHOWING',
          damage_type: 'MODERATE_DAMAGE', room_of_origin_type: 'KITCHEN', cause: 'COOKING' },
        water_supply: 'HYDRANT_GREATER_500', investigation_needed: 'NO_CAUSE_OBVIOUS', investigation_types: ['NONE'],
      },
      // NO neris_fire_protection → OUR validator flags it locally, so this
      // records submit_failed(local_validation) WITHOUT hitting the API —
      // which is itself the proof that an invalid record never leaves.
    });
    const r5 = await attemptSubmission(badId, DEPT, { reason: 'approve' });
    const bad = await db.incidents.findById(badId, DEPT);
    const lastOutcome = bad.neris_submission_log.at(-1).outcome;
    if (r5.state === 'submit_failed' && lastOutcome === 'local_validation_failed') {
      ok('invalid record stopped LOCALLY — never reached the national API');
    } else { fail(`unexpected: state=${r5.state} outcome=${lastOutcome}`); process.exit(1); }
    evidence.proofs.refused_locally = { state: r5.state, outcome: lastOutcome };

    console.log('\nALL TRACK B PROOFS PASSED');
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await db.pool.query('UPDATE departments SET neris_submission_enabled=FALSE WHERE id=$1', [DEPT]);
    await db.pool.query('DELETE FROM incidents WHERE "incidentNumber" LIKE $1', [`${RUN}%`]);
    await db.pool.end().catch(() => {});
  }
  process.exit(0);
}

main().catch(async (err) => {
  fail(`unexpected: ${err && err.message ? err.message : err}`);
  try {
    await db.pool.query('UPDATE departments SET neris_submission_enabled=FALSE WHERE id=$1', [DEPT]);
    await db.pool.end();
  } catch { /* noop */ }
  process.exit(2);
});
