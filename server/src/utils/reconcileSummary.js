'use strict';
/**
 * utils/reconcileSummary.js — decide what a two-mode Stripe reconciliation run REPORTS.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SEPARATE, PURE FUNCTION
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The reconciler talks to Stripe, so the route itself cannot be unit-tested without a network.
 * The DECISION — did the run succeed, which mode failed, what does the operator get told — is
 * where the defect was, so it lives here where it can be tested against every combination.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS FIXES (found live, 2026-08-06, by the cron ledger on its first day)
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `cronReconcile` runs BOTH Stripe modes — that is deliberate and documented in its own header
 * ("For each Stripe mode", ADR-0001 Step 8). But both ran inside ONE try block with test
 * second, so when the TEST key was revoked:
 *   · the exception unwound before the summary was built,
 *   · LIVE's completed result was DISCARDED,
 *   · and the whole job reported 500 with a message naming only the test key.
 * A dead *test* credential therefore made the entire reconciler — including the live half that
 * had just worked — look broken, and told the operator nothing about which half.
 *
 * Note what is NOT changed: both modes still run, and a failure is still a failure. The
 * `permit_expiry` precedent (partial failure → HTTP 200, because one tenant's bad data is not
 * a platform outage) deliberately does NOT apply here — a revoked API key is our own
 * credential, actionable by us, and the operator should see it as a failed run rather than a
 * green tick with a footnote.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY A FAILED RUN LOSES NOTHING
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The reconciler is idempotent by construction: each run re-lists paid invoices from the last
 * three days and diffs them against `licenses` by `stripe_invoice_id`. So a mode that dies
 * partway is fully recovered by the next successful run inside that window, and licences it
 * already back-issued are simply not gaps any more. That is why isolating the modes is safe:
 * the cost of a failed mode is a delay, not a lost licence.
 */

/**
 * @param {Array<{mode: string, failed?: boolean, error?: string, gaps?: number,
 *                back_issued?: number, errors?: number}>} modes
 * @returns {{ok: boolean, status: number, body: object}}
 */
function summarizeReconcile(modes, at = new Date().toISOString()) {
  const list = Array.isArray(modes) ? modes : [];
  const failed = list.filter((m) => m && m.failed);

  const body = {
    heartbeat_at: at,
    // Every mode's result is reported, INCLUDING the ones that ran before a sibling failed.
    // That is the whole point: live's work used to vanish because test threw after it.
    ...Object.fromEntries(list.map((m) => [m.mode, m])),
    total_gaps:        list.reduce((n, m) => n + (m.gaps || 0), 0),
    total_back_issued: list.reduce((n, m) => n + (m.back_issued || 0), 0),
    total_errors:      list.reduce((n, m) => n + (m.errors || 0), 0),
    modes_failed:      failed.map((m) => m.mode),
  };

  if (!failed.length) return { ok: true, status: 200, body: { ok: true, ...body } };

  // Name the MODE and the cause. The panel renders this string to a chief, and "handler
  // answered 500" tells them nothing they can act on. A message that says
  // "test mode: Expired API Key" points straight at the Stripe dashboard.
  const detail = failed.map((m) => `${m.mode} mode: ${m.error || 'unknown error'}`).join('; ');
  return {
    ok: false,
    status: 500,
    body: { ok: false, error: `Stripe reconciliation failed — ${detail}`, ...body },
  };
}

module.exports = { summarizeReconcile };
