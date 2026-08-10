'use strict';
/**
 * constants/cronJobs.js — the closed set of scheduled jobs, and their schedules.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS RATHER THAN READING vercel.json AT RUNTIME
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The staleness check needs to know how often a job is SUPPOSED to run. The authority for
 * that is `vercel.json`, but reading a deployment manifest at request time couples a live
 * route to a build artifact's presence on disk. So the cadence lives here, and the coupling
 * is enforced by a TEST instead: `cronJobsParity.test.js` parses vercel.json FROM SOURCE and
 * asserts this table matches it exactly — same set of paths, same schedules, nothing extra on
 * either side.
 *
 * That is deliberate, and it is the RENDERABLE_PAGES lesson applied before it bites: a
 * hand-kept list drifts from the thing it mirrors, silently, and the drift is invisible
 * because both halves look correct in isolation. A list that a test derives from the source
 * cannot drift without going red.
 *
 * ⚠ ADDING A CRON IS THREE EDITS AND THE TEST WILL TELL YOU IF YOU MISS ONE:
 *   1. vercel.json           — the schedule (the authority)
 *   2. this file             — name, path, cadence
 *   3. the CHECK constraint on of_cron_runs.job_name (a migration)
 * ...plus wrapping the handler in withCronRun(), which `cronRunCoverage.test.js` enumerates
 * from source and asserts for every cron route file.
 */

/**
 * STALENESS RULE — one rule, derived, not five hand-picked numbers.
 *
 * 3.1b chose 36h for a 24h job and wrote down why: "a daily job legitimately drifts by
 * minutes, a deploy can delay a run, and a check that cries wolf gets ignored — which would
 * leave us worse off than having none." That is 1.5x the cadence, and it generalises.
 *
 * An HOURLY job gets 3x instead of 1.5x, for a reason rather than for symmetry: at 1.5x a
 * single skipped hour is a finding, and an hourly job has twenty-four chances a day to
 * recover on its own. Three consecutive misses is a pattern; one is weather.
 */
function staleAfterHours(cadenceHours) {
  return cadenceHours <= 1 ? cadenceHours * 3 : cadenceHours * 1.5;
}

/**
 * The jobs. `name` is the CONTROL value — it is what the of_cron_runs CHECK constraint
 * admits and what the staleness query filters on, matched EXACTLY and never pattern-matched.
 */
const CRON_JOBS = [
  {
    name: 'reconcile',
    path: '/api/cron/reconcile',
    cadenceHours: 24,
    label: 'Licence reconciliation',
    // The one job with no department at all — `licenses` is a global table. It is the reason
    // this ledger is global rather than tenant-scoped.
    scope: 'platform',
  },
  {
    name: 'retention',
    path: '/api/cron/retention',
    cadenceHours: 24,
    label: 'Radio-log retention sweep',
    scope: 'per-department',
  },
  {
    name: 'neris_sweep',
    path: '/api/cron/neris-sweep',
    cadenceHours: 1,
    label: 'NERIS submission sweep',
    scope: 'per-department',
  },
  {
    name: 'report_delivery',
    path: '/api/cron/report-delivery',
    cadenceHours: 24,
    label: 'Scheduled report delivery',
    scope: 'per-department',
  },
  {
    name: 'permit_expiry',
    path: '/api/cron/permit-expiry',
    cadenceHours: 24,
    label: 'Permit expiry ladder',
    scope: 'per-department',
    // This job ALSO writes a per-department domain ledger (fi_job_runs, 0095). The two are
    // not redundant: fi_job_runs records what the ladder DID to a department's permits;
    // of_cron_runs records that the invocation HAPPENED at all. Only the second survives the
    // failure modes where our handler never runs.
    alsoWritesDomainLedger: 'fi_job_runs',
  },
];

const CRON_JOB_NAMES = CRON_JOBS.map((j) => j.name);
const byName = new Map(CRON_JOBS.map((j) => [j.name, j]));

module.exports = { CRON_JOBS, CRON_JOB_NAMES, staleAfterHours, jobByName: (n) => byName.get(n) || null };
