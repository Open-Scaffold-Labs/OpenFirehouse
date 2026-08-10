'use strict';
/**
 * routes/permitJobs.js — the job monitor and the R8 staleness check (Phase 3, 3.1b).
 *
 * GET /api/permit-jobs/runs   → recent runs + last successful run + the staleness verdict
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * TWO CAPABILITIES AT TWO DIFFERENT HEIGHTS — labelled, because the difference matters
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AT THE MARKET BAR — the monitor itself. Both enterprise platforms with reachable
 * documentation ship a customer-admin view of scheduled jobs (name, status, timestamps,
 * drill-through to a run). This is a copy.
 *
 * A DELIBERATE, REASONED DEPARTURE (R8) — `stale`. NO platform reached documents detecting a
 * job that STOPS FIRING, and a state licensing/permitting RFP requirements matrix (~125
 * scored requirements, read end-to-end) asks for zero batch-job-health items. Matt approved
 * it as a departure, not as a market finding, and it is recorded that way wherever it
 * appears so nobody later cites it back as "what the market does".
 *
 * WHY IT EARNS ITS KEEP HERE SPECIFICALLY: the expiry transition is the ONLY status change
 * in this module that no human authors, so nobody would notice its absence. Every documented
 * alerting mechanism in the market is either pull-based (an admin goes and looks) or fires
 * BECAUSE the job ran — and all three ways this job goes quiet (a rotated CRON_SECRET
 * refusing the invocation before our handler runs; the vercel.json entry being dropped in a
 * merge; the function timing out every night) produce SILENCE. Absence-of-success is the
 * only signal that catches them.
 *
 * The cost of not having it is domain-specific and concrete: the register keeps showing
 * LAPSED assembly and hazmat permits as current, and a bureau clerk reads that as fact. Same
 * class as the Daily Staffing page that sat dead on production with nobody aware.
 */
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requirePreventionAdmin } = require('../middleware/fiAuth');
const { JOB_NAME } = require('../jobs/permitExpiry');
const { z } = require('zod');

/**
 * The cadence this job is scheduled at, and the age past which a missing success is a
 * finding rather than a normal gap.
 *
 * Deliberately CONSTANTS and not another configuration column. The lesson from 0096 earlier
 * today cuts the other way here and it is worth being precise about why: 0096 removed a
 * setting because it configured a JUDGMENT the product should not be making. This is not a
 * judgment — it is an operational fact about a schedule WE control, in a file we own. A
 * config column would let a department set it to 30 days and silently disable the check.
 *
 * 36h, not 24h: a daily job legitimately drifts by minutes, a deploy can delay a run, and a
 * check that cries wolf gets ignored — which would leave us worse off than having none.
 */
const EXPECTED_CADENCE_HOURS = 24;
const STALE_AFTER_HOURS = 36;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

router.get('/runs',
  loadFiContext, requirePreventionAdmin,
  validate({ query: querySchema }),
  scoped(async ({ req }) => {
    const dept = req.user.department_id;
    if (!dept) throw httpError(401, 'No department context', 'NO_DEPARTMENT');
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const { rows: runs } = await pool.query(
      `SELECT id, job_name, started_at, finished_at, outcome, evaluated_for,
              examined, transitioned, skipped_no_terms, notified, error
         FROM fi_job_runs
        WHERE department_id = $1 AND job_name = $2
        ORDER BY finished_at DESC
        LIMIT $3`,
      [dept, JOB_NAME, limit]
    );

    const { rows: [last] } = await pool.query(
      `SELECT finished_at, evaluated_for, transitioned, skipped_no_terms
         FROM fi_job_runs
        WHERE department_id = $1 AND job_name = $2 AND outcome = 'success'
        ORDER BY finished_at DESC
        LIMIT 1`,
      [dept, JOB_NAME]
    );

    // The expiry-notice tally (0116). Two of these four numbers are actionable and two are
    // just honest: `noRecipient` is a to-do list — permit holders with no email on file, a
    // gap only a clerk can close — while `queued` is a PLATFORM state, because outbound mail
    // is unconfigured (RESEND_API_KEY unset) and nothing has been sent by anyone.
    // COUNT returns BIGINT, which pg hands back as a STRING; coerced here so the client is
    // never comparing '0' to 0. (The repo has been bitten by exactly this before.)
    const { rows: [tally] } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE delivery_state = 'queued')       AS queued,
              COUNT(*) FILTER (WHERE delivery_state = 'no_recipient') AS no_recipient,
              COUNT(*) FILTER (WHERE delivery_state = 'sent')         AS sent,
              COUNT(*) FILTER (WHERE delivery_state = 'failed')       AS failed
         FROM fi_permit_notices WHERE department_id = $1`,
      [dept]
    );

    const lastSuccessAt = last ? last.finished_at : null;
    const hoursSince = lastSuccessAt
      ? (Date.now() - new Date(lastSuccessAt).getTime()) / 3600000
      : null;

    // NEVER succeeded is reported as its own thing, not folded into "stale". On a department
    // that has only just been provisioned the honest answer is "it has not run yet", and
    // calling that stale would train people to ignore the indicator.
    const neverRun = !lastSuccessAt;
    const stale = !neverRun && hoursSince > STALE_AFTER_HOURS;

    return {
      data: {
        job: JOB_NAME,
        expectedCadenceHours: EXPECTED_CADENCE_HOURS,
        staleAfterHours: STALE_AFTER_HOURS,
        lastSuccessAt,
        hoursSinceLastSuccess: hoursSince === null ? null : Math.round(hoursSince * 10) / 10,
        neverRun,
        stale,
        // Carried up so the UI can surface it without a second call: permits that cannot be
        // evaluated at all because they were issued before the catalogue existed. This
        // number is not an error — it is a to-do list for a human.
        lastSkippedNoTerms: last ? last.skipped_no_terms : null,
        notices: {
          queued:      Number(tally?.queued ?? 0),
          noRecipient: Number(tally?.no_recipient ?? 0),
          sent:        Number(tally?.sent ?? 0),
          failed:      Number(tally?.failed ?? 0),
        },
        runs,
      },
    };
  }));

module.exports = router;
module.exports.STALE_AFTER_HOURS = STALE_AFTER_HOURS;
