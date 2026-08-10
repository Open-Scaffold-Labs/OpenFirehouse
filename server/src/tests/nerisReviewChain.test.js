'use strict';
/**
 * tests/nerisReviewChain.test.js — the NERIS review chain (P2-D6, F22, F23).
 *
 * Two layers, mirroring nerisIncidentFields:
 *   1. PURE: the transition table, the approved-lock guard (the seam the real
 *      PATCH handler calls — a guard tested only by compiling is not a guard),
 *      and the review-history merge. Always run.
 *   2. DB (gated on TENANCY_TEST_DB): the full compare-and-set walk
 *      draft → in_review → approved → draft against real Postgres, the CAS
 *      losing a race (0 rows → STALE_STATUS at the route), and the audit row
 *      landing with an INTEGER record_id (lesson #14).
 */
const test   = require('node:test');
const assert = require('node:assert');

const {
  NERIS_STATUS_VALUES,
  nerisStatusTransitionFor,
  nerisStatusGuard,
  mergeNerisReview,
} = require('../utils/nerisValidate');

// ── 1. The transition table is CLOSED ─────────────────────────────────────────

test('the legal transitions — and ONLY those — resolve', () => {
  assert.equal(nerisStatusTransitionFor('submit_review', 'draft'), 'in_review');
  assert.equal(nerisStatusTransitionFor('approve', 'in_review'), 'approved');
  assert.equal(nerisStatusTransitionFor('return_to_draft', 'in_review'), 'draft');
  assert.equal(nerisStatusTransitionFor('return_to_draft', 'approved'), 'draft');

  // everything else is null → the route answers 409 INVALID_TRANSITION
  assert.equal(nerisStatusTransitionFor('approve', 'draft'), null, 'cannot approve a draft');
  assert.equal(nerisStatusTransitionFor('approve', 'approved'), null, 'cannot re-approve');
  assert.equal(nerisStatusTransitionFor('submit_review', 'in_review'), null, 'cannot re-submit');
  assert.equal(nerisStatusTransitionFor('submit_review', 'approved'), null);
  assert.equal(nerisStatusTransitionFor('return_to_draft', 'draft'), null);
  // vocabulary is exact — no case-folding, no unknown actions (the /^pass\b/i lesson)
  assert.equal(nerisStatusTransitionFor('APPROVE', 'in_review'), null);
  assert.equal(nerisStatusTransitionFor('approve', 'IN_REVIEW'), null);
  assert.equal(nerisStatusTransitionFor('reopen', 'approved'), null);
  assert.deepEqual(NERIS_STATUS_VALUES, ['draft', 'in_review', 'approved']);
});

// ── 2. The approved-lock guard (wired into the real PATCH handler) ───────────

test('nerisStatusGuard blocks NERIS fields on an approved record — and nothing else', () => {
  const approved = { id: 1, neris_status: 'approved' };

  const hit = nerisStatusGuard(approved, { neris_actions: ['INVESTIGATION'], notes: 'x' });
  assert.equal(hit.blocked, true, 'NERIS field on approved → blocked');
  assert.deepEqual(hit.fields, ['neris_actions'], 'names exactly the offending fields');

  // Phase-2 fields are covered too (the whitelist is shared — no drift)
  assert.equal(nerisStatusGuard(approved, { neris_casualty_rescues: [] }).blocked, true);
  assert.equal(nerisStatusGuard(approved, { neris_dispatch_times: {} }).blocked, true);
  // null = clear-the-field is still a NERIS write — blocked while approved
  assert.equal(nerisStatusGuard(approved, { neris_noaction: null }).blocked, true);

  // non-NERIS fields stay editable while approved (F22 — a lock, not finality)
  assert.equal(nerisStatusGuard(approved, { notes: 'amended narrative', injuries: 2 }).blocked, false);

  // not approved → never blocked
  assert.equal(nerisStatusGuard({ neris_status: 'draft' }, { neris_actions: [] }).blocked, false);
  assert.equal(nerisStatusGuard({ neris_status: 'in_review' }, { neris_actions: [] }).blocked, false);
  // exact match on the status value — 'APPROVED' is not a status
  assert.equal(nerisStatusGuard({ neris_status: 'APPROVED' }, { neris_actions: [] }).blocked, false);
});

// ── 3. Review-history merge ───────────────────────────────────────────────────

test('mergeNerisReview appends history and maintains the top-level stamps', () => {
  const t1 = '2026-07-16T18:00:00.000Z';
  const t2 = '2026-07-16T19:00:00.000Z';
  const r1 = mergeNerisReview(null, { action: 'submit_review', by: 7, by_name: 'ff.smith', at: t1 });
  assert.equal(r1.submitted_by, 7);
  assert.equal(r1.submitted_at, t1);
  assert.equal(r1.history.length, 1);
  assert.equal(r1.history[0].action, 'submit_review');

  const r2 = mergeNerisReview(r1, { action: 'approve', by: 3, by_name: 'capt.jones', at: t2, notes: 'looks complete' });
  assert.equal(r2.reviewed_by, 3);
  assert.equal(r2.reviewed_at, t2);
  assert.equal(r2.notes, 'looks complete');
  assert.equal(r2.history.length, 2);
  assert.equal(r2.history[1].notes, 'looks complete');
  // earlier stamps survive later transitions
  assert.equal(r2.submitted_by, 7);
  // pure: the input object was not mutated
  assert.equal(r1.history.length, 1);
});

// ── 4. DB layer (real Postgres) — gated on TENANCY_TEST_DB ───────────────────
const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('NERIS review chain (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  const db = require('../db');
  const { audit } = require('../utils/auditLog');
  const DEPT = 1;
  const NUM = `NERIS-P2W3-${Date.now()}`;

  async function cleanup(incidentNumber) {
    await db.pool.query('DELETE FROM workflow_tasks WHERE target_module=$1 AND target_record_id IN (SELECT id FROM incidents WHERE "incidentNumber"=$2)', ['incidents', incidentNumber]).catch(() => {});
    await db.pool.query('DELETE FROM audit_log WHERE table_name=$1 AND record_id IN (SELECT id FROM incidents WHERE "incidentNumber"=$2)', ['incidents', incidentNumber]).catch(() => {});
    await db.pool.query('DELETE FROM incidents WHERE "incidentNumber"=$1', [incidentNumber]);
  }

  const USER = { id: 3, username: 'capt.jones', name: 'Capt. Jones' };

  test('full CAS walk: draft → in_review → approved → draft, with history intact', async () => {
    const num = `${NUM}-WALK`;
    try {
      const created = await db.incidents.create({ incidentNumber: num, date: '2026-07-16', type: 'Structure Fire' }, DEPT);
      assert.equal(created.neris_status, 'draft');

      // draft → in_review
      let review = mergeNerisReview(created.neris_review, { action: 'submit_review', by: 7, by_name: 'ff.smith', at: new Date().toISOString() });
      let row = await db.incidents.nerisStatusTransition(created.id, DEPT, 'draft', 'in_review', review);
      assert.ok(row, 'CAS from draft landed');
      assert.equal(row.neris_status, 'in_review');

      // in_review → approved
      review = mergeNerisReview(row.neris_review, { action: 'approve', by: 3, by_name: 'capt.jones', at: new Date().toISOString(), notes: 'complete' });
      row = await db.incidents.nerisStatusTransition(created.id, DEPT, 'in_review', 'approved', review);
      assert.ok(row, 'CAS from in_review landed');
      assert.equal(row.neris_status, 'approved');

      // approved → draft (the revertible unlock, F22)
      review = mergeNerisReview(row.neris_review, { action: 'return_to_draft', by: 3, by_name: 'capt.jones', at: new Date().toISOString() });
      row = await db.incidents.nerisStatusTransition(created.id, DEPT, 'approved', 'draft', review);
      assert.ok(row, 'CAS from approved landed');
      assert.equal(row.neris_status, 'draft');

      // read back through the normal read path — a RETURNING row is not persistence
      const back = await db.incidents.findById(created.id, DEPT);
      assert.equal(back.neris_status, 'draft');
      assert.equal(back.neris_review.history.length, 3, 'all three transitions in history');
      assert.deepEqual(back.neris_review.history.map((h) => h.action),
        ['submit_review', 'approve', 'return_to_draft']);
      assert.equal(back.neris_review.submitted_by, 7);
      assert.equal(back.neris_review.reviewed_by, 3);
      assert.equal(back.neris_review.notes, 'complete');
    } finally { await cleanup(num); }
  });

  test('CAS race (F23): a stale expected-status gets 0 rows and changes NOTHING', async () => {
    const num = `${NUM}-RACE`;
    try {
      const created = await db.incidents.create({ incidentNumber: num, date: '2026-07-16', type: 'Structure Fire' }, DEPT);
      // The row is 'draft'; a racing reviewer believes it is 'in_review' and
      // tries to approve — exactly the two-reviewers race.
      const stale = await db.incidents.nerisStatusTransition(created.id, DEPT, 'in_review', 'approved', { history: [] });
      assert.equal(stale, null, '0 rows → the route answers 409 STALE_STATUS');
      const back = await db.incidents.findById(created.id, DEPT);
      assert.equal(back.neris_status, 'draft', 'the loser changed nothing');
      assert.equal(back.neris_review, null, 'no review history was written');
    } finally { await cleanup(num); }
  });

  test('cross-department CAS never lands (tenancy)', async () => {
    const num = `${NUM}-XDEPT`;
    try {
      const created = await db.incidents.create({ incidentNumber: num, date: '2026-07-16', type: 'Structure Fire' }, DEPT);
      const other = await db.incidents.nerisStatusTransition(created.id, DEPT + 999, 'draft', 'in_review', { history: [] });
      assert.equal(other, null, 'another department cannot transition this record');
    } finally { await cleanup(num); }
  });

  test('a transition audit row lands with an INTEGER record_id (lesson #14)', async () => {
    const num = `${NUM}-AUDIT`;
    try {
      const created = await db.incidents.create({ incidentNumber: num, date: '2026-07-16', type: 'Structure Fire' }, DEPT);
      // The route calls audit() exactly like this after a landed transition.
      await audit(DEPT, USER, 'neris_status_submit_review', 'incidents', created.id, { from: 'draft', to: 'in_review' });
      const { rows } = await db.pool.query(
        'SELECT record_id, action, user_name FROM audit_log WHERE table_name=$1 AND record_id=$2 ORDER BY id DESC LIMIT 1',
        ['incidents', created.id]);
      assert.equal(rows.length, 1, 'audit row written (a swallowed audit is a silent failure)');
      assert.equal(rows[0].action, 'neris_status_submit_review');
      assert.equal(Number(rows[0].record_id), created.id, 'record_id is the incident INTEGER id');
      assert.equal(rows[0].user_name, 'capt.jones');
    } finally { await cleanup(num); }
  });
}
