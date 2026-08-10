'use strict';
/**
 * constants/checkVocab.js — the apparatus-checks vocabulary (Phase 2.1, migration 0082).
 *
 * CLOSED SETS, server-owned (phase spec §3.2 / the 0056 result_code doctrine): clients
 * render these; they never define them. CHECK constraints enforce the same sets in
 * Postgres. Nothing may ever pattern-match a result (the /^pass\b/i lesson).
 *
 * RESULT_CODES is DERIVED, never client input: any 'fail' item ⇒ DEFECTS_FOUND, else PASS.
 * That derivation IS the locked passed-with-open-defect guard — there is no request field
 * through which a client can assert PASS.
 */

const FREQUENCIES = ['daily', 'weekly', 'monthly'];

/** Due-clock window per frequency, in days (computed on view — no cron, no telemetry). */
const FREQUENCY_DAYS = { daily: 1, weekly: 7, monthly: 30 };

const ITEM_OUTCOMES = ['pass', 'fail', 'na'];

const RESULT_PASS = 'PASS';
const RESULT_DEFECTS = 'DEFECTS_FOUND';
const RESULT_CODES = [RESULT_PASS, RESULT_DEFECTS];

/** The ONE derivation (exact match on the closed set — never a regex). */
function deriveResultCode(outcomes) {
  return outcomes.some((o) => o === 'fail') ? RESULT_DEFECTS : RESULT_PASS;
}

module.exports = {
  FREQUENCIES,
  FREQUENCY_DAYS,
  ITEM_OUTCOMES,
  RESULT_PASS,
  RESULT_DEFECTS,
  RESULT_CODES,
  deriveResultCode,
};
