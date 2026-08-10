'use strict';
/**
 * routes/cronHealth.js — is every scheduled job still firing? (X-PHASE cron liveness)
 *
 * GET /api/cron-health → one row per job in constants/cronJobs.js: last run, last SUCCESS,
 *                        the staleness verdict, and the recent runs behind it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY A READ AND NOT AN ALERT — this is the market-consistent shape, not a shortcut
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 3.1b already answered this question for one job and Matt ruled on it (R8): every documented
 * alerting mechanism in the market is either pull-based (an admin opens a monitor) or fires
 * BECAUSE the job ran. So a monitor is a copy of the market; the STALENESS VERDICT is the
 * deliberate departure Matt approved, and it is labelled as one wherever it appears so nobody
 * later cites it back as "what the market does".
 *
 * It deliberately does NOT annunciate app-wide the way the CAD trouble signal does (4C.4).
 * That difference is the point: a lost dispatch is life-safety and time-critical, while a
 * cron that is four hours late is operational. Copying the louder treatment here would exceed
 * the bar in the direction R1 forbids just as clearly as falling short of it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THE VERDICTS MEAN, AND WHY `never_run` IS ITS OWN THING
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *   healthy   — a success inside the stale window.
 *   stale     — the last success is older than the window. That is the finding: the schedule
 *               says it should have run since.
 *   failing   — the job HAS run and has NEVER succeeded. Distinct from stale because the
 *               remedy is different: stale means "it stopped being invoked", failing means
 *               "it is invoked and it breaks every time". Both need attention.
 *   never_run — no run of any kind recorded, AND the ledger has not yet been collecting for
 *               longer than this job's window. On the day this ledger ships that is true of
 *               every job, and calling it stale would light five alarms on the deploy that
 *               added the check — which is how an indicator gets ignored.
 *
 * 🔴 `never_run` EXPIRES, and the first version's did not. It said in this very comment that
 * it "stays true for a job until its next scheduled time" — and then nothing implemented the
 * expiry, so a cron dropped from vercel.json BEFORE it ever succeeded once would have sat
 * permanently at a grey "Not yet seen", excluded from the overdue count. That is the defect
 * this ledger exists to detect, reproduced inside the detector. The anchor is the ledger's own
 * first row: once it has been collecting longer than a job's window, silence from that job is
 * a finding, not a fresh install.
 *
 * The window is 1.5x cadence (3x for hourly) — derived in constants/cronJobs.js, one rule
 * rather than five hand-picked numbers, with the reasoning written where the rule lives.
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { scoped, validate } = require('../utils/routeKit');
const { requireChief } = require('../middleware/requireRole');
const { CRON_JOBS, staleAfterHours } = require('../constants/cronJobs');

const querySchema = z.object({
  runs: z.coerce.number().int().min(0).max(20).optional(),
}).strict();

router.get('/',
  // Chief: this is platform operations, and the table is GLOBAL — it is not a tenant record,
  // so there is no per-department read to scope. Authorization is the whole gate here, which
  // is exactly why it is at the top rung.
  requireChief,
  validate({ query: querySchema }),
  scoped(async ({ req }) => {
    const runsWanted = req.query.runs === undefined ? 5 : Number(req.query.runs);

    // One pass over the ledger rather than 2N queries. The partial index on
    // (job_name, finished_at DESC) WHERE outcome='success' serves the success half.
    const { rows: lastSuccess } = await pool.query(
      `SELECT DISTINCT ON (job_name) job_name, finished_at, summary
         FROM of_cron_runs WHERE outcome = 'success'
        ORDER BY job_name, finished_at DESC`
    );
    const { rows: lastAny } = await pool.query(
      `SELECT DISTINCT ON (job_name) job_name, finished_at, outcome, error
         FROM of_cron_runs ORDER BY job_name, finished_at DESC`
    );
    // The ledger's own age. Without an anchor, "no success yet" is indistinguishable from
    // "this check was installed five minutes ago" forever.
    const { rows: [anchor] } = await pool.query(
      `SELECT min(finished_at) AS ledger_since FROM of_cron_runs`
    );

    const recent = runsWanted > 0
      ? (await pool.query(
          `SELECT id, job_name, started_at, finished_at, outcome, summary, error
             FROM (SELECT *, row_number() OVER (PARTITION BY job_name ORDER BY finished_at DESC) rn
                     FROM of_cron_runs) t
            WHERE rn <= $1 ORDER BY job_name, finished_at DESC`, [runsWanted])).rows
      : [];

    const successBy = new Map(lastSuccess.map((r) => [r.job_name, r]));
    const anyBy     = new Map(lastAny.map((r) => [r.job_name, r]));
    const now = Date.now();
    const ledgerSince = anchor && anchor.ledger_since ? new Date(anchor.ledger_since).getTime() : null;

    const jobs = CRON_JOBS.map((j) => {
      const s = successBy.get(j.name) || null;
      const a = anyBy.get(j.name) || null;
      const staleHours = staleAfterHours(j.cadenceHours);
      const hoursSinceSuccess = s ? (now - new Date(s.finished_at).getTime()) / 3600000 : null;
      const ledgerAgeHours = ledgerSince === null ? 0 : (now - ledgerSince) / 3600000;
      let verdict;
      if (s) {
        verdict = hoursSinceSuccess > staleHours ? 'stale' : 'healthy';
      } else if (a) {
        // It runs and never succeeds. Always a finding — a nightly failure must never be
        // counted as "not yet seen".
        verdict = 'failing';
      } else {
        // No run at all. Benign only while the ledger itself is younger than this job's window.
        verdict = ledgerAgeHours > staleHours ? 'stale' : 'never_run';
      }
      return {
        name: j.name,
        label: j.label,
        path: j.path,
        scope: j.scope,
        cadenceHours: j.cadenceHours,
        staleAfterHours: staleHours,
        lastSuccessAt: s ? s.finished_at : null,
        hoursSinceSuccess: hoursSinceSuccess === null ? null : Math.round(hoursSinceSuccess * 10) / 10,
        lastRunAt: a ? a.finished_at : null,
        lastRunOutcome: a ? a.outcome : null,
        lastRunError: a ? a.error : null,
        verdict,
        runs: recent.filter((r) => r.job_name === j.name),
      };
    });

    return {
      data: {
        jobs,
        stale: jobs.filter((j) => j.verdict === 'stale').length,
        failing: jobs.filter((j) => j.verdict === 'failing').length,
        neverRun: jobs.filter((j) => j.verdict === 'never_run').length,
        // The number the badge renders. `stale` alone under-reported: a job that runs and
        // fails every single night was counted as never_run and badged as nothing.
        needsAttention: jobs.filter((j) => j.verdict === 'stale' || j.verdict === 'failing').length,
        ledgerSince: anchor ? anchor.ledger_since : null,
        // Stated so the client never has to guess whether "the market does this": it does not.
        // R8, Matt-approved as a reasoned departure.
        stalenessIsADeparture: true,
      },
    };
  })
);

module.exports = router;
