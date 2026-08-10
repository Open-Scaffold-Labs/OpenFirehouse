'use strict';
/**
 * routes/cronNerisSweep.js — the hourly NERIS submission sweep (Track B, TB-D4).
 * Mounted at /api/cron/neris-sweep; triggered by Vercel Cron.
 *
 * Three jobs, all batched + backoff-aware (NERIS best practices: batch, back off
 * on 429, never hammer):
 *   1. RETRY  — approved incidents stuck in submit_failed / update_pending
 *               (NERIS was down, or the SUBMITTED window deferred an update).
 *   2. POLL   — non-terminal NERIS statuses (SUBMITTED / PENDING_*) with a
 *               staleness gate, so REJECTED surfaces without a human asking —
 *               the market's documented failure is silent divergence discovered
 *               weeks later; this closes it.
 *   3. AGE    — anything that has sat non-terminal or retryable for > AGING_DAYS
 *               is logged loudly for the ops surface (no silent stuck states).
 *
 * The engine (utils/nerisSubmit) is the ONE brain — this route only selects
 * candidates and invokes it. A NerisUnavailableError anywhere stops the batch
 * early (NERIS is down; the next run retries — no hammering a sick API).
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkCronAuth } = require('../utils/cronAuth');
// X-PHASE cron liveness (0128): every cron records its invocation through ONE wrapper,
// so a cron cannot be added without a ledger row. cronRunCoverage.test.js enumerates these
// files from source and asserts it. An auth REFUSAL is deliberately not a run — see
// utils/cronRun.js; a public path must not let an anonymous caller append to a permanent log.
const { withCronRun } = require('../utils/cronRun');
const { attemptSubmission, refreshNerisStatus, POLLABLE_NERIS_STATUSES } = require('../utils/nerisSubmit');

const BATCH_LIMIT = 25;
const STALE_MINUTES = 55;   // just under the hourly cadence — each run re-polls
const AGING_DAYS = 5;       // non-terminal for longer than this = flag loudly

router.get('/', withCronRun('neris_sweep', async (req, res) => {
  // checkCronAuth returns { ok, status?, error? } — NOT a boolean. Treating it
  // as one made the gate a no-op (an object is always truthy): caught live
  // 2026-07-20 when the unauthed probe returned 200 instead of 401/503.
  const cronAuth = checkCronAuth(req);
  if (!cronAuth.ok) return res.status(cronAuth.status).json({ error: cronAuth.error });
  const summary = { retried: 0, polled: 0, aged: 0, stopped_early: false, results: [] };
  try {
    const candidates = await db.incidents.nerisSweepCandidates(BATCH_LIMIT, STALE_MINUTES);
    for (const c of candidates) {
      const needsRetry = c.neris_submission_state === 'submit_failed'
        || c.neris_submission_state === 'update_pending';
      let outcome;
      if (needsRetry) {
        outcome = await attemptSubmission(c.id, c.department_id, { reason: 'sweep' });
        summary.retried += 1;
      } else if (c.neris_incident_uid && POLLABLE_NERIS_STATUSES.has(c.neris_incident_status)) {
        outcome = await refreshNerisStatus(c.id, c.department_id);
        summary.polled += 1;
      } else {
        continue;
      }
      summary.results.push({ id: c.id, dept: c.department_id, outcome });
      // The engine never throws — but a retryable failure recorded by it means
      // NERIS is likely down. One failure signal → stop this run (no hammering).
      if (outcome && (outcome.state === 'submit_failed' || outcome.state === 'update_pending')
          && needsRetry) {
        summary.stopped_early = true;
        break;
      }
    }

    // Aging pass: loud log lines only (ids, no PII) — the ops-visible trail for
    // "submitted N days ago and NERIS still hasn't moved it".
    const { rows: aged } = await db.pool.query(
      `SELECT id, department_id, neris_submission_state, neris_incident_status, neris_submitted_at
       FROM incidents
       WHERE deleted_at IS NULL
         AND (
           (neris_submission_state IN ('submit_failed','update_pending','refused'))
           OR (neris_incident_status IN ('SUBMITTED','PENDING_APPROVAL','PENDING_INCIDENT_DATA'))
         )
         AND COALESCE(neris_submitted_at, "updatedAt") < NOW() - ($1 || ' days')::interval
       LIMIT 50`,
      [String(AGING_DAYS)]
    );
    summary.aged = aged.length;
    for (const a of aged) {
      console.warn(`[neris-sweep] AGING: incident ${a.id} (dept ${a.department_id}) `
        + `state=${a.neris_submission_state} neris=${a.neris_incident_status || '—'} `
        + `since=${a.neris_submitted_at || 'n/a'}`);
    }

    res.json({ ok: true, ...summary, results: summary.results.slice(0, BATCH_LIMIT) });
  } catch (err) {
    console.error('[neris-sweep] error:', err.message);
    res.status(500).json({ ok: false, error: 'sweep failed', ...summary });
  }
}));

module.exports = router;
