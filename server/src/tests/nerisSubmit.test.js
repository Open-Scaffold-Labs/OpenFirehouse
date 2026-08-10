'use strict';
/**
 * tests/nerisSubmit.test.js — the Track B submission engine's state machine.
 *
 * The engine is the ONE brain between the approve event and the national API.
 * These tests pin every branch with an INJECTED fake client (no network):
 * create · refused-terminal · unavailable-retryable · the SUBMITTED window ·
 * update-by-UID · the lost-ACK adoption probe · dept-gating · status refresh.
 * DB-backed (gated on TENANCY_TEST_DB like the other NERIS suites) because the
 * engine's contract includes what it PERSISTS — a 2xx is not persistence.
 */
const test = require('node:test');
const assert = require('node:assert');

// nerisSubmit transitively requires ../db — point it at the test DB BEFORE the
// first require, or the pool initializes against the wrong database.
if (process.env.TENANCY_TEST_DB) process.env.DATABASE_URL = process.env.TENANCY_TEST_DB;

const { expectedNerisId } = require('../utils/nerisSubmit');

// ── Pure: the deterministic neris_id used by the lost-ACK probe ──────────────
test('expectedNerisId: dept|incident_number|epoch(call_create), null when unbuildable', () => {
  const payload = { dispatch: { incident_number: 'T-9', call_create: '2026-07-20T22:00:00.000Z' } };
  assert.strictEqual(expectedNerisId('FD51087867', payload),
    `FD51087867|T-9|${Math.floor(new Date('2026-07-20T22:00:00.000Z').getTime() / 1000)}`);
  assert.strictEqual(expectedNerisId('FD51087867', { dispatch: { incident_number: 'T-9' } }), null);
  assert.strictEqual(expectedNerisId('', payload), null);
});

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('nerisSubmit engine (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  const db = require('../db');
  const { attemptSubmission, refreshNerisStatus } = require('../utils/nerisSubmit');
  const DEPT = 1;
  const ENTITY = 'FD51087867';

  // A minimal VALID record (the proof-script recipe): cancelled-en-route
  // no-action — passes the transformer with no fire modules needed.
  function validIncidentBody(num) {
    const now = new Date('2026-07-20T22:03:00.000Z');
    return {
      incidentNumber: num, date: '2026-07-20', time: '18:03', type: 'Public Assist',
      address: '123 Main St, Glen Allen, VA 23060',
      units: JSON.stringify(['E1']),
      notes: 'Engine test record — synthetic.',
      neris_incident_types: [{ value: 'NOEMERG||CANCELLED', primary: true }],
      neris_noaction: 'CANCELLED',
      // All THREE PSAP times, stated explicitly. NERIS v1.4.78 requires all three on
      // DispatchPayload, and none of them may be derived by us.
      //
      // 🔴 `call_create` was ADDED here 2026-08-08 and its absence was the point. This
      // fixture used to carry only two, and these tests passed anyway — because the
      // transformer manufactured `call_create` out of `time: '18:03'`, a generic incident
      // column typed for a different purpose. Nobody ever stated when the 911 call came
      // in; the software invented it and stamped it on a federal report. Removing that
      // inference is what turned these seven red, which is the correct reaction: they
      // were green on a fabricated value.
      neris_dispatch_times: {
        call_create: new Date(now.getTime() - 9 * 60000).toISOString(),
        call_arrival: new Date(now.getTime() - 8 * 60000).toISOString(),
        call_answered: new Date(now.getTime() - 7 * 60000).toISOString(),
      },
    };
  }

  async function mkIncident(num, extra = {}) {
    const created = await db.incidents.create({ ...validIncidentBody(num), ...extra }, DEPT);
    // Approve via the CAS transition (draft → in_review → approved)
    await db.incidents.nerisStatusTransition(created.id, DEPT, 'draft', 'in_review', {});
    await db.incidents.nerisStatusTransition(created.id, DEPT, 'in_review', 'approved', {});
    return created.id;
  }

  async function deptNeris(enabled, nerisId = ENTITY) {
    await db.pool.query('UPDATE departments SET neris_id = $1, neris_submission_enabled = $2 WHERE id = $3',
      [nerisId, enabled, DEPT]);
  }

  async function cleanup(num) {
    await db.pool.query('DELETE FROM incidents WHERE "incidentNumber" LIKE $1', [`${num}%`]);
  }

  const okClient = (overrides = {}) => ({
    isConfigured: () => true,
    validateIncident: async () => ({ status: 204, data: null }),
    createIncident: async () => ({ status: 201, data: { neris_id: `${ENTITY}|X|1`, incident_status: { status: 'SUBMITTED' } } }),
    putIncident: async () => ({ status: 200, data: { last_modified: 'now' } }),
    getIncident: async () => ({ status: 200, data: { incident_status: { status: 'APPROVED' } } }),
    ...overrides,
  });

  test('engine: happy create → uid + submitted + their status verbatim + log entry', async () => {
    const num = `TB-CREATE-${Date.now()}`;
    try {
      await deptNeris(true);
      const id = await mkIncident(num);
      const r = await attemptSubmission(id, DEPT, { client: okClient(), reason: 'approve' });
      assert.deepEqual({ attempted: r.attempted, state: r.state }, { attempted: true, state: 'submitted' });
      const back = await db.incidents.findById(id, DEPT);
      assert.equal(back.neris_incident_uid, `${ENTITY}|X|1`);
      assert.equal(back.neris_submission_state, 'submitted');
      assert.equal(back.neris_incident_status, 'SUBMITTED');
      assert.ok(back.neris_submitted_at, 'submitted_at stamped');
      assert.ok(Array.isArray(back.neris_submission_log) && back.neris_submission_log.length >= 1);
      assert.equal(back.neris_submission_log.at(-1).outcome, 'created');
    } finally { await deptNeris(false, ''); await cleanup(num); }
  });

  test('engine: department gate — disabled or missing entity id never touches the network', async () => {
    const num = `TB-GATE-${Date.now()}`;
    try {
      await deptNeris(false, ENTITY);
      const id = await mkIncident(num);
      let called = 0;
      const spy = okClient({ validateIncident: async () => { called += 1; return { status: 204 }; } });
      const r1 = await attemptSubmission(id, DEPT, { client: spy });
      assert.equal(r1.attempted, false);
      await deptNeris(true, '');
      const r2 = await attemptSubmission(id, DEPT, { client: spy });
      assert.equal(r2.attempted, false);
      assert.equal(called, 0, 'no network call through the gate');
      const back = await db.incidents.findById(id, DEPT);
      assert.equal(back.neris_submission_state, 'not_submitted');
    } finally { await deptNeris(false, ''); await cleanup(num); }
  });

  test('engine: non-approved report is never submitted', async () => {
    const num = `TB-DRAFT-${Date.now()}`;
    try {
      await deptNeris(true);
      const created = await db.incidents.create(validIncidentBody(num), DEPT); // stays draft
      const r = await attemptSubmission(created.id, DEPT, { client: okClient() });
      assert.equal(r.attempted, false);
    } finally { await deptNeris(false, ''); await cleanup(num); }
  });

  test('engine: NERIS refusal is TERMINAL — state refused, loud log, no uid', async () => {
    const num = `TB-REFUSED-${Date.now()}`;
    try {
      await deptNeris(true);
      const id = await mkIncident(num);
      const r = await attemptSubmission(id, DEPT, {
        client: okClient({ validateIncident: async () => { throw { name: 'NerisRefusedError', status: 422, detail: 'rule X violated' }; } }),
      });
      assert.equal(r.state, 'refused');
      const back = await db.incidents.findById(id, DEPT);
      assert.equal(back.neris_submission_state, 'refused');
      assert.equal(back.neris_incident_uid, null);
      assert.equal(back.neris_submission_log.at(-1).outcome, 'refused');
      assert.ok(back.neris_submission_log.at(-1).error.includes('rule X'));
    } finally { await deptNeris(false, ''); await cleanup(num); }
  });

  test('engine: NERIS unavailable is RETRYABLE — submit_failed, quiet', async () => {
    const num = `TB-UNAVAIL-${Date.now()}`;
    try {
      await deptNeris(true);
      const id = await mkIncident(num);
      const r = await attemptSubmission(id, DEPT, {
        client: okClient({ createIncident: async () => { throw { name: 'NerisUnavailableError', status: 503, reason: 'down' }; } }),
      });
      assert.equal(r.state, 'submit_failed');
      const back = await db.incidents.findById(id, DEPT);
      assert.equal(back.neris_submission_state, 'submit_failed');
      assert.equal(back.neris_submission_log.at(-1).outcome, 'failed_retryable');
    } finally { await deptNeris(false, ''); await cleanup(num); }
  });

  test('engine: local validation failure never reaches the network — loud submit_failed', async () => {
    const num = `TB-INVALID-${Date.now()}`;
    try {
      await deptNeris(true);
      // Genuinely unmappable: no NERIS types, no noaction, AND a legacy type
      // outside the crosswalk (the transformer's honest F8 error path).
      const id = await mkIncident(num, { neris_incident_types: null, neris_noaction: null, type: 'Totally Unknown Type' });
      let called = 0;
      const spy = okClient({ validateIncident: async () => { called += 1; return { status: 204 }; } });
      const r = await attemptSubmission(id, DEPT, { client: spy });
      assert.equal(called, 0);
      assert.equal(r.state, 'submit_failed');
      const back = await db.incidents.findById(id, DEPT);
      assert.equal(back.neris_submission_log.at(-1).outcome, 'local_validation_failed');
      assert.ok(Array.isArray(back.neris_submission_log.at(-1).errors));
    } finally { await deptNeris(false, ''); await cleanup(num); }
  });

  test('engine: the SUBMITTED window defers an update as update_pending — never an error', async () => {
    const num = `TB-WINDOW-${Date.now()}`;
    try {
      await deptNeris(true);
      const id = await mkIncident(num);
      await db.incidents.nerisSubmissionUpdate(id, DEPT, {
        neris_incident_uid: `${ENTITY}|W|1`, neris_submission_state: 'submitted',
        neris_incident_status: 'SUBMITTED',
      }, null);
      let putCalled = 0;
      const r = await attemptSubmission(id, DEPT, {
        client: okClient({
          getIncident: async () => ({ status: 200, data: { incident_status: { status: 'SUBMITTED' } } }),
          putIncident: async () => { putCalled += 1; return { status: 200, data: {} }; },
        }),
      });
      assert.equal(putCalled, 0, 'no PUT during the window');
      assert.equal(r.state, 'update_pending');
      const back = await db.incidents.findById(id, DEPT);
      assert.equal(back.neris_submission_log.at(-1).outcome, 'update_deferred_window');
    } finally { await deptNeris(false, ''); await cleanup(num); }
  });

  test('engine: a 404 on GET during ingest is "not yet visible" — update_pending, NEVER refused (live-learned)', async () => {
    const num = `TB-404-${Date.now()}`;
    try {
      await deptNeris(true);
      const id = await mkIncident(num);
      await db.incidents.nerisSubmissionUpdate(id, DEPT, {
        neris_incident_uid: `${ENTITY}|N|1`, neris_submission_state: 'submitted',
        neris_incident_status: 'SUBMITTED',
      }, null);
      const r = await attemptSubmission(id, DEPT, {
        client: okClient({ getIncident: async () => { throw { name: 'NerisRefusedError', status: 404, detail: 'not found' }; } }),
      });
      assert.equal(r.state, 'update_pending', 'transient 404 must not be terminal');
      const back = await db.incidents.findById(id, DEPT);
      assert.equal(back.neris_submission_state, 'update_pending');
      assert.equal(back.neris_submission_log.at(-1).outcome, 'update_deferred_not_visible');
    } finally { await deptNeris(false, ''); await cleanup(num); }
  });

  test('engine: update-by-UID lands once the status is updatable', async () => {
    const num = `TB-UPDATE-${Date.now()}`;
    try {
      await deptNeris(true);
      const id = await mkIncident(num);
      await db.incidents.nerisSubmissionUpdate(id, DEPT, {
        neris_incident_uid: `${ENTITY}|U|1`, neris_submission_state: 'update_pending',
        neris_incident_status: 'SUBMITTED',
      }, null);
      const r = await attemptSubmission(id, DEPT, { client: okClient(), reason: 'sweep' });
      assert.equal(r.state, 'submitted');
      const back = await db.incidents.findById(id, DEPT);
      assert.equal(back.neris_submission_state, 'submitted');
      assert.equal(back.neris_incident_status, 'APPROVED', 'their status refreshed from the GET');
      assert.equal(back.neris_submission_log.at(-1).outcome, 'updated');
    } finally { await deptNeris(false, ''); await cleanup(num); }
  });

  test('engine: lost-ACK recovery — a failed create finds + ADOPTS the existing record, never double-creates', async () => {
    const num = `TB-ADOPT-${Date.now()}`;
    try {
      await deptNeris(true);
      const id = await mkIncident(num);
      await db.incidents.nerisSubmissionUpdate(id, DEPT,
        { neris_submission_state: 'submit_failed' }, null);
      let createCalled = 0;
      const r = await attemptSubmission(id, DEPT, {
        client: okClient({
          getIncident: async (entity, uid) => ({ status: 200, data: { neris_id: uid, incident_status: { status: 'APPROVED' } } }),
          createIncident: async () => { createCalled += 1; return { status: 201, data: { neris_id: 'DUP' } }; },
        }),
        reason: 'retry',
      });
      assert.equal(createCalled, 0, 'no second create after adoption');
      assert.equal(r.state, 'submitted');
      const back = await db.incidents.findById(id, DEPT);
      assert.ok(back.neris_incident_uid.startsWith(`${ENTITY}|${num}|`), 'adopted the DETERMINISTIC id');
      assert.equal(back.neris_submission_log.at(-1).outcome, 'adopted_existing');
    } finally { await deptNeris(false, ''); await cleanup(num); }
  });

  test('refreshNerisStatus: paints their status verbatim + stamps checked_at; REJECTED logged loudly', async () => {
    const num = `TB-POLL-${Date.now()}`;
    try {
      await deptNeris(true);
      const id = await mkIncident(num);
      await db.incidents.nerisSubmissionUpdate(id, DEPT, {
        neris_incident_uid: `${ENTITY}|P|1`, neris_submission_state: 'submitted',
        neris_incident_status: 'SUBMITTED',
      }, null);
      const r = await refreshNerisStatus(id, DEPT, {
        client: okClient({ getIncident: async () => ({ status: 200, data: { incident_status: { status: 'REJECTED' } } }) }),
      });
      assert.deepEqual(r, { refreshed: true, neris_status: 'REJECTED' });
      const back = await db.incidents.findById(id, DEPT);
      assert.equal(back.neris_incident_status, 'REJECTED');
      assert.ok(back.neris_status_checked_at);
      assert.equal(back.neris_submission_log.at(-1).outcome, 'rejected_observed');
    } finally { await deptNeris(false, ''); await cleanup(num); }
  });

  test('submission log: repeated appends stay CHRONOLOGICAL, newest last, capped at 20', async () => {
    const num = `TB-LOG-${Date.now()}`;
    try {
      const created = await db.incidents.create(validIncidentBody(num), DEPT);
      for (let n = 1; n <= 23; n += 1) {
        await db.incidents.nerisSubmissionUpdate(created.id, DEPT, {}, { at: `t${n}`, op: 'x', outcome: `o${n}` });
      }
      const back = await db.incidents.findById(created.id, DEPT);
      const log = back.neris_submission_log;
      assert.equal(log.length, 20, 'capped at 20');
      assert.equal(log.at(-1).outcome, 'o23', 'newest entry is LAST');
      assert.equal(log[0].outcome, 'o4', 'oldest kept entry first (o1-o3 dropped)');
      const order = log.map((e) => Number(e.outcome.slice(1)));
      assert.deepEqual(order, [...order].sort((a, b) => a - b), 'strictly chronological');
    } finally { await cleanup(num); }
  });

  test('submission fields are NOT client-writable through the incident update whitelist', async () => {
    const num = `TB-OWNED-${Date.now()}`;
    try {
      const created = await db.incidents.create(validIncidentBody(num), DEPT);
      await db.incidents.update(created.id, {
        neris_submission_state: 'submitted', neris_incident_uid: 'FORGED', notes: 'legit edit',
      }, DEPT);
      const back = await db.incidents.findById(created.id, DEPT);
      assert.equal(back.neris_submission_state, 'not_submitted', 'state not client-writable');
      assert.equal(back.neris_incident_uid, null, 'uid not client-writable');
      assert.equal(back.notes, 'legit edit', 'legitimate fields still write');
    } finally { await cleanup(num); }
  });
}
