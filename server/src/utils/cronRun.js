'use strict';
/**
 * utils/cronRun.js — record that a scheduled invocation happened. (X-PHASE cron liveness)
 *
 * Migration 0128 put `of_cron_runs` on prod. This is its only writer.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ONE WRAPPER, NOT FIVE COPIES — and that is the point
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The obvious implementation is a couple of extra lines in each of the five cron routes. That
 * produces exactly the shape this repo has been burned by four times: a guard present on one
 * route and absent on its sibling, with nothing in the code saying the sibling was supposed
 * to have it. `withCronRun()` makes the ledger part of what a cron route IS, and
 * `cronRunCoverage.test.js` enumerates the cron route files FROM SOURCE and asserts each one
 * is wrapped — so a sixth cron added without a ledger row fails the suite instead of going
 * quietly unmonitored, which is the very failure this item exists to fix.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 AN AUTH REFUSAL IS NOT A RUN, AND IS DELIBERATELY NOT RECORDED
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * It is tempting: a 401 from a rotated CRON_SECRET is real signal, and we can see it because
 * cronAuth runs inside our own route. It is still wrong, for the reason 4C.2 already settled
 * for the CAD receiver: **an anonymous caller must not be able to append to a permanent log.**
 * These paths are PUBLIC — anyone on the internet can GET /api/cron/retention — so recording
 * refusals hands the world a write amplifier into an append-only table.
 *
 * Nothing is lost. Absence-of-success already catches a rotated secret, because a refused
 * invocation produces no success row either. The refusal is visible in the platform's own
 * request log, which is where an unauthenticated caller's traffic belongs.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE LEDGER MUST NEVER CHANGE THE JOB'S ANSWER — and must be DURABLE BEFORE THE RESPONSE
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A failure to WRITE the row is logged loudly and swallowed: a bookkeeping failure must not
 * turn a job that did its work into an HTTP 500 that tells the scheduler to alarm.
 *
 * But the write is AWAITED BEFORE the response is sent, never fired-and-forgotten. On
 * serverless the function can freeze the moment it responds, and an un-awaited insert is an
 * insert that may never land — the same reason `processDispatch` awaits its realtime ping.
 * That is why this wraps `res.json` to CAPTURE the payload rather than letting it through:
 * the handler is left byte-for-byte unchanged, and the ordering is still ours.
 *
 * Deliberately NOT inside the request transaction: cron paths carry no JWT, so the
 * dbTransaction middleware never runs for them and there is no ambient client to deadlock
 * against on the max:1 pool (lesson #12). A plain pool.query is correct, and needs no
 * department GUC because 0128's policy is `global_read`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 `summary` CARRIES TOTALS ONLY
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `of_cron_runs` is GLOBAL and every department's chief can read it. A summary that grows
 * into per-department detail is a cross-tenant leak through a table with no tenant key to
 * stop it. sanitizeSummary() enforces it mechanically: scalars only, a small key budget, and
 * any array or nested object is DROPPED rather than truncated — a truncated list of
 * departments is still a list of departments.
 */

const { CRON_JOB_NAMES } = require('../constants/cronJobs');

/** Max keys kept from a caller's summary. Small on purpose — a heartbeat, not a log. */
const MAX_SUMMARY_KEYS = 12;

/**
 * Strings that reach this table are retained forever and readable by every chief, so a
 * connection string must never survive in ANY column.
 *
 * 🔴 THIS WAS A HOLE. `sanitizeError` redacted DSNs; `sanitizeSummary` did not — and two cron
 * handlers answer `res.json({ error: err.message })`, so a pooler failure put
 * `postgresql://of_app:PASSWORD@host/db` verbatim into `summary` while the purpose-built
 * `error` column received the useless string "handler answered 500". Found by an audit, not
 * by the tests, because the DSN test only exercised one of the two ingresses.
 */
function redact(str) {
  return String(str).replace(/postgres(ql)?:\/\/[^\s'"]+/gi, '[redacted-dsn]');
}

/** Totals only. Arrays and objects are DROPPED, not flattened. See the header. */
function sanitizeSummary(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(summary)) {
    if (n >= MAX_SUMMARY_KEYS) break;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') { out[k] = v; n++; continue; }
    if (typeof v === 'string') { out[k] = redact(v).slice(0, 120); n++; continue; }
    // arrays / objects: deliberately skipped.
  }
  return Object.keys(out).length ? out : null;
}

/**
 * An error string safe to keep forever in a table every chief can read. Never a raw driver
 * dump — a pg error can echo a connection string.
 */
function sanitizeError(err) {
  // 🔴 `(err && err.message) || err` is WRONG and the test caught it: an Error with an EMPTY
  // message has a falsy `.message`, so the `||` falls through to the Error object itself and
  // String()s it to the literal "Error" — a stored cause that says nothing, past a fallback
  // written specifically to prevent that. Same shape as the `MyPortal.user` bug this repo
  // already has on file: a falsy value slipping through a `||` that was meant to catch absent.
  const hasMessage = err && typeof err.message === 'string';
  const msg = String(hasMessage ? err.message : (err ?? '')).trim();
  // The CHECK refuses an empty string, so an error with no message still gets a reason.
  if (!msg || msg === 'Error') return 'Job failed with no message';
  return redact(msg).slice(0, 1000);
}

/** Write one run row. Returns true if it landed. Never throws — see the header. */
async function recordCronRun({ jobName, startedAt, finishedAt, outcome, summary, error }) {
  if (!CRON_JOB_NAMES.includes(jobName)) {
    // The CHECK would refuse it anyway; failing here gives a readable reason instead of a
    // constraint violation buried in a catch.
    console.error(`[cronRun] refusing to record an unknown job name: ${jobName}`);
    return false;
  }
  try {
    const { pool } = require('../db');
    // ⚠ BOTH TIMESTAMPS COME FROM THE SAME CLOCK, deliberately.
    // 0128 defaults `finished_at` to the DATABASE's clock_timestamp() while `started_at` comes
    // from the application host, and a CHECK enforces finished_at >= started_at. Any forward
    // skew of the app host larger than the handler's duration would REJECT the insert — and
    // recordCronRun swallows its own errors, so the job would silently report "never run".
    // Fast jobs (a permit-expiry sweep with nothing to do runs in single-digit ms) have almost
    // no margin. Writing both ends from one Date removes the comparison between two clocks.
    await pool.query(
      `INSERT INTO of_cron_runs (job_name, started_at, finished_at, outcome, summary, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        jobName,
        new Date(startedAt).toISOString(),
        new Date(finishedAt || Date.now()).toISOString(),
        outcome,
        summary ? JSON.stringify(sanitizeSummary(summary)) : null,
        outcome === 'failed' ? sanitizeError(error) : null,
      ]
    );
    return true;
  } catch (e) {
    console.error(`[cronRun] FAILED to record the ${jobName} run (the job itself is unaffected): ${e.message}`);
    return false;
  }
}

/** Statuses that mean "we never entered the job" — see the auth-refusal note in the header. */
const NOT_A_RUN = new Set([401, 403, 503]);

/**
 * Wrap a cron handler so its invocation is recorded exactly once, at the END.
 * The handler keeps the ordinary `(req, res)` signature and is not modified.
 *
 * @param {string} jobName one of constants/cronJobs.js CRON_JOB_NAMES
 * @param {(req: any, res: any) => any} handler
 */
function withCronRun(jobName, handler) {
  return async function cronRunWrapper(req, res) {
    const startedAt = new Date();

    // Capture instead of send, so the ledger row is durable before the response goes out.
    let captured = null;
    const realJson = res.json.bind(res);
    res.json = (body) => {
      // A second res.json() is a bug in the handler. Unwrapped Express raises
      // ERR_HTTP_HEADERS_SENT; silently overwriting `captured` would turn a loud bug into a
      // quietly different answer, so keep the FIRST response and say so.
      if (captured) {
        console.error(`[cronRun] ${jobName} called res.json() more than once; keeping the first response`);
        return res;
      }
      captured = { status: res.statusCode || 200, body };
      return res;
    };

    // `threw` is tracked with a separate boolean: `catch (e) { threw = e }` followed by
    // `if (threw)` treats `throw null` / `throw ''` as success — the same falsy-through-a-
    // truthiness-check family that sanitizeError was already fixed for.
    let didThrow = false;
    let thrown = null;
    try {
      await handler(req, res);
    } catch (e) {
      didThrow = true; thrown = e;
    } finally {
      res.json = realJson;   // always restore, even on the throw path
    }

    // 🔴 A HANDLER THAT NEVER RESPONDED IS NOT A SUCCESS. res.statusCode defaults to 200, so
    // a handler that falls out of a branch without doing its work used to be ledgered
    // `success` — a job that quietly does nothing every night looking perfectly alive, which
    // is the exact false positive this wrapper exists to prevent.
    const responded = !!captured || res.headersSent;
    const status = didThrow ? 500 : (captured ? captured.status : (res.statusCode || 200));

    if (!NOT_A_RUN.has(status)) {
      // Prefer the handler's OWN message over "handler answered 500". Every cron here answers
      // `{ error: <cause> }` on failure, and the panel renders this string to a chief — a
      // generic status echo tells them nothing they could act on.
      const bodyError = captured && captured.body && typeof captured.body.error === 'string'
        ? captured.body.error : null;
      const failed = didThrow || !responded || status >= 400;
      await recordCronRun({
        jobName, startedAt, finishedAt: Date.now(),
        outcome: failed ? 'failed' : 'success',
        summary: captured && captured.body,
        error: !failed ? null
          : didThrow ? thrown
          : !responded ? 'handler produced no response'
          : (bodyError || `handler answered ${status}`),
      });
    }

    if (didThrow) {
      console.error(`[cronRun] ${jobName} threw: ${thrown && thrown.message}`);
      if (res.headersSent) return;
      return res.status(500).json({ error: `${jobName} failed` });
    }
    if (res.headersSent) return;                       // handler responded some other way
    if (captured) return res.status(captured.status).json(captured.body);
    // No response at all — answer 500, not 204. The scheduler should see this as a failure
    // for the same reason the ledger does.
    console.error(`[cronRun] ${jobName} produced no response`);
    return res.status(500).json({ error: `${jobName} produced no response` });
  };
}

module.exports = {
  withCronRun, recordCronRun, sanitizeSummary, sanitizeError,
  MAX_SUMMARY_KEYS, NOT_A_RUN,
};
