'use strict';
/**
 * constants/inspectionResult.js — THE INSPECTION RESULT AXIS. Server-owned. (2026-07-14)
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────
 * The result of a fire inspection decides whether a building is safe to occupy. Until
 * today it was a FREE-TEXT column (`z.string().trim().max(60)`), and the doctrine that
 * an inspection cannot pass with unabated violations was enforced by a REGEX:
 *
 *     /^pass\b/i.test(String(b.result ?? ''))
 *
 * That is not a guard. It is a coin flip on English morphology. Executed, 2026-07-14:
 *
 *     "Pass"                → guard FIRES   ✅
 *     "Pass with Violations"→ guard FIRES   ✅
 *     "Pass, see notes"     → guard FIRES   ✅
 *     "Passed"              → guard SILENT  ❌  ← passes a building with open violations
 *     "PASSED"              → guard SILENT  ❌
 *     "Passing"             → guard SILENT  ❌
 *
 * One verb tense away from failing open on a life-safety control. And because `result`
 * was free text with THREE writers (server, web, mobile), the three had drifted into
 * three different vocabularies:
 *
 *     server : (no enum — anything ≤60 chars)
 *     web    : ['Pass','Fail','Reinspection Required','Not Completed']
 *     mobile : ['Pass','Fail','Conditional']            ← 'Conditional' exists nowhere else
 *
 * And prod already carries a value in NEITHER client's list: "Pass with Violations"
 * (2 rows, both completed, each with 1 unabated violation). Neither surface can render it.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────────
 * The enum lives on the server or it lives nowhere. `result_code` is the CONTROL value —
 * a closed set, matched exactly, never pattern-matched. `result` (the free-text column)
 * is retained for the historical record and is now DISPLAY-ONLY: it is never the input to
 * a decision. Nothing in this file pattern-matches a prefix, and nothing ever will.
 *
 * ── WHY WE DON'T REWRITE THE LEGACY ROWS ────────────────────────────────────────────
 * "Pass with Violations" is semantically closest to REINSPECTION_REQUIRED. We do NOT map
 * it. Rewriting a recorded result to a different result obscures previously recorded
 * information — precisely what 21 CFR §11.10(e) forbids of an audit trail, and precisely
 * the "method or circumstances of preparation" attack FRE 803(6) invites. Those rows keep
 * their verbatim text, get `result_code = NULL`, and are surfaced for a HUMAN decision.
 * An unmappable row is LOGGED, never DEFAULTED. (Migration 0056.)
 */

/** The closed set. A result is one of these or it is not a result. */
const RESULT_CODES = Object.freeze(['PASS', 'FAIL', 'REINSPECTION_REQUIRED', 'NOT_COMPLETED']);

/** Code → the words a human reads. Display only; never an input to a decision. */
const RESULT_LABELS = Object.freeze({
  PASS:                  'Pass',
  FAIL:                  'Fail',
  REINSPECTION_REQUIRED: 'Reinspection Required',
  NOT_COMPLETED:         'Not Completed',
});

/**
 * The ONLY safe legacy mappings — exact, case-insensitive, whitespace-trimmed.
 * Deliberately NOT here (and therefore unmappable → NULL → human review):
 *   - "Pass with Violations"  — a passing word on a record with unabated violations. The
 *                               doctrine now forbids the state; rewriting it would launder
 *                               a doctrine violation into a clean pass, or rewrite history
 *                               into a failure. Neither is ours to do. → Matt decides.
 *   - "Conditional"           — mobile-only; means nothing on the server or the web.
 *   - "Passed" / "Passing"    — the values that silently defeated the old regex guard.
 */
const LEGACY_RESULT_MAP = Object.freeze({
  'pass':                  'PASS',
  'fail':                  'FAIL',
  'reinspection required': 'REINSPECTION_REQUIRED',
  'not completed':         'NOT_COMPLETED',
});

/**
 * Canonicalize an inbound result to a code.
 * @returns {string|null} a member of RESULT_CODES, or null when there is nothing to record.
 * @throws never — callers decide what an UNMAPPABLE value means (the routes 400 on it).
 *
 * Accepts a code ('PASS') or a known label ('Pass'). Everything else is unmappable and
 * comes back as `undefined` — DISTINCT from `null`:
 *     null      → "no result recorded"     (legal: an inspection in progress)
 *     undefined → "I don't know what that is" (illegal: the caller must be rejected)
 */
function canonicalizeResult(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  const upper = s.toUpperCase().replace(/\s+/g, '_');
  if (RESULT_CODES.includes(upper)) return upper;
  const mapped = LEGACY_RESULT_MAP[s.toLowerCase().replace(/\s+/g, ' ')];
  return mapped !== undefined ? mapped : undefined;   // undefined = UNMAPPABLE
}

/** True only for the exact code. No regex. No prefix. No morphology. */
function isPassingResult(code) {
  return code === 'PASS';
}

/** Did the caller hand us something we cannot record? */
function isUnmappableResult(raw) {
  return canonicalizeResult(raw) === undefined;
}

module.exports = {
  RESULT_CODES,
  RESULT_LABELS,
  LEGACY_RESULT_MAP,
  canonicalizeResult,
  isPassingResult,
  isUnmappableResult,
};
