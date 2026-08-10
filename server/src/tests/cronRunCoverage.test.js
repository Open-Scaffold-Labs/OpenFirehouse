'use strict';
/**
 * cronRunCoverage.test.js — the two checks that keep cron liveness from rotting.
 *
 * Pure static analysis, no database. Runs everywhere, every time.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THESE ARE DERIVED FROM SOURCE AND NOT FROM A LIST
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The whole item this backs is "nothing notices when a scheduled job stops". The obvious
 * failure of any fix for that is a SIXTH cron added later without a ledger row — monitored by
 * nothing, and invisible because everything about it looks normal. A hand-kept list of jobs
 * would drift from vercel.json exactly the way RENDERABLE_PAGES drifted from the router, and
 * for the same reason: both halves read as correct in isolation.
 *
 * So both checks ENUMERATE:
 *   1. every `crons` entry in vercel.json  ↔  constants/cronJobs.js, both directions;
 *   2. every server/src/routes/cron*.js file  →  must be wrapped in withCronRun().
 *
 * Each is proven able to fail by mutation (documented at the end of this file), and the
 * comment-stripper asserts it did not empty the file — the trap the §5b writer-coverage check
 * hit, where a check ran happily against nothing.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const ROUTES = path.join(__dirname, '..', 'routes');
const { CRON_JOBS, CRON_JOB_NAMES, staleAfterHours } = require('../constants/cronJobs');

/** Strip // and /* *​/ comments so a job name quoted INSIDE a comment cannot satisfy a check. */
function stripComments(src) {
  const out = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  // The trap the writer-coverage check hit: a stripper that eats everything makes every
  // assertion below vacuously true.
  assert.ok(out.trim().length > src.length * 0.2,
    'the comment stripper emptied the file — every assertion after this would be vacuous');
  return out;
}

test('vercel.json crons and constants/cronJobs.js agree — both directions', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const declared = vercel.crons || [];
  assert.ok(declared.length > 0, 'vercel.json must declare crons for this check to mean anything');

  const byPath = new Map(CRON_JOBS.map((j) => [j.path, j]));

  for (const entry of declared) {
    const job = byPath.get(entry.path);
    assert.ok(job, `vercel.json schedules ${entry.path} but constants/cronJobs.js does not know it — ` +
      'it would run forever with no liveness ledger and nothing would notice');

    // The cadence must match the schedule, or the staleness window is measured against a
    // cadence the job does not actually have.
    const fields = entry.schedule.trim().split(/\s+/);
    assert.equal(fields.length, 5, `unexpected cron expression for ${entry.path}: ${entry.schedule}`);
    const [, hour] = fields;
    const expectedCadence = hour === '*' ? 1 : 24;
    assert.equal(job.cadenceHours, expectedCadence,
      `${entry.path} is scheduled "${entry.schedule}" (every ${expectedCadence}h) but cronJobs.js ` +
      `declares cadenceHours=${job.cadenceHours}`);
  }

  // The other direction: a job we monitor but no longer schedule would sit permanently "stale"
  // and train people to ignore the indicator.
  const scheduledPaths = new Set(declared.map((e) => e.path));
  for (const job of CRON_JOBS) {
    assert.ok(scheduledPaths.has(job.path),
      `constants/cronJobs.js declares ${job.name} (${job.path}) but vercel.json does not schedule it`);
  }
});

/**
 * A cron INVOCATION route is not identified by its filename — it is identified by the thing
 * every one of them must do: gate on `checkCronAuth`. Enumerating by name matched
 * `cronHealth.js` on the first run, which is the MONITOR (a read), not a job.
 *
 * That miss is worth keeping in the file: a filename convention is a hand-kept list wearing a
 * different hat, and it drifts the moment somebody names a file sensibly. Behaviour does not.
 */
function cronInvocationRoutes() {
  return fs.readdirSync(ROUTES)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => /checkCronAuth/.test(stripComments(fs.readFileSync(path.join(ROUTES, f), 'utf8'))));
}

test('every cron route file records its invocation through the ONE wrapper', () => {
  const files = cronInvocationRoutes();
  assert.ok(files.length >= 5,
    `expected to find the cron invocation routes by enumeration, found ${files.length} — ` +
    'if the auth gate was renamed, this check is looking at nothing');

  const missing = [];
  for (const f of files) {
    const src = stripComments(fs.readFileSync(path.join(ROUTES, f), 'utf8'));
    const wrapped = /withCronRun\(\s*'([a-z_]+)'/.exec(src);
    if (!wrapped) { missing.push(f); continue; }
    assert.ok(CRON_JOB_NAMES.includes(wrapped[1]),
      `${f} records itself as "${wrapped[1]}", which is not in CRON_JOB_NAMES — the CHECK ` +
      'constraint on of_cron_runs would refuse every row and the job would look never-run forever');
  }
  assert.deepEqual(missing, [],
    'these cron routes are not wrapped in withCronRun(), so they run with no liveness ledger ' +
    'and nothing would notice if they stopped');
});

test('every scheduled job is claimed by exactly one route file — no duplicates, no orphans', () => {
  const files = cronInvocationRoutes();
  const claimed = files
    .map((f) => /withCronRun\(\s*'([a-z_]+)'/.exec(stripComments(fs.readFileSync(path.join(ROUTES, f), 'utf8'))))
    .filter(Boolean).map((m) => m[1]);

  assert.equal(new Set(claimed).size, claimed.length,
    `two route files record under the same job name (${claimed.join(', ')}) — one would mask the ` +
    "other's silence");
  for (const name of CRON_JOB_NAMES) {
    assert.ok(claimed.includes(name), `no route file records runs for the "${name}" job`);
  }
});

test('nothing is wrapped in withCronRun without also gating on checkCronAuth', () => {
  // The converse of the check above. A route that records runs but does not authenticate is a
  // publicly triggerable job — a worse bug than the one this file exists to prevent, and it
  // would sail past a check that only looks at authenticated files.
  const all = fs.readdirSync(ROUTES).filter((f) => f.endsWith('.js'));
  const ungated = all.filter((f) => {
    const src = stripComments(fs.readFileSync(path.join(ROUTES, f), 'utf8'));
    return /withCronRun\(/.test(src) && !/checkCronAuth/.test(src);
  });
  assert.deepEqual(ungated, [], 'these routes record cron runs but do not authenticate as crons');
});

test('the staleness rule is 1.5x cadence, and 3x for hourly — derived, not hand-picked', () => {
  assert.equal(staleAfterHours(24), 36, 'a daily job matches the 36h window 3.1b reasoned out');
  assert.equal(staleAfterHours(1), 3, 'an hourly job gets 3x — one miss is weather, three is a pattern');
  assert.ok(staleAfterHours(1) > 1, 'the window must exceed the cadence or every job is always stale');
});

/*
 * MUTATION LOG — each assertion above proven able to fail, 2026-08-06:
 *   · removed the `neris_sweep` entry from constants/cronJobs.js  → parity test RED
 *     ("vercel.json schedules /api/cron/neris-sweep but constants/cronJobs.js does not know it")
 *   · changed neris_sweep cadenceHours 1 → 24                     → parity test RED (cadence mismatch)
 *   · unwrapped cronRetention.js                                  → coverage test RED
 *   · pointed cronRetention at 'retentionx'                       → coverage test RED (unknown name)
 *   · made two files claim 'retention'                            → duplicate test RED
 *   · staleAfterHours returning the cadence unchanged             → rule test RED
 * Files byte-identical after restore.
 */
