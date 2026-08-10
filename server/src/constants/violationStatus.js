'use strict';
/**
 * violationStatus.js — THE canonical violation-status vocabulary (2026-07-11).
 *
 * WHY: the audit found a three-way mismatch — the web dropdown offered
 * 'New Violation'/'Abated'/'UnAbated'/'Void'/…, new violations defaulted to 'Open'
 * (not in that list), and the resolution logic counted ONLY the literal string
 * 'Corrected' as resolved. A violation marked 'Abated' stayed "open" forever in
 * every count. On a compliance surface that's an accuracy failure, not a nit.
 *
 * THE RULE: four states, one axis, no synonyms.
 *   Open            — cited, not yet corrected (the default; unknown values land here)
 *   Time Extension  — still open, deadline formally extended
 *   Corrected       — verified corrected/abated
 *   Withdrawn       — cited in error / voided; not counted against the property
 * Resolved = Corrected | Withdrawn. Everything else counts as open — fail-open:
 * an unrecognized status must NEVER silently resolve a violation.
 *
 * Legacy values (old dropdown + seeds) are canonicalized at the API write
 * chokepoint (fiInspections coerce) so stored JSON self-heals as records are
 * touched. The web client keeps its own copy of the list
 * (client/src/data/fireInspections.js — kept in lockstep by
 * tests/violationStatus.test.js) and the mobile app mirrors it
 * (OpenFirehouseMobile constants). Change all three together or the sync test fails.
 */

const VIOLATION_STATUSES = ['Open', 'Time Extension', 'Corrected', 'Withdrawn'];

const RESOLVED_VIOLATION_STATUSES = ['Corrected', 'Withdrawn'];

// legacy → canonical (keys compared case-insensitively, trimmed)
const LEGACY_STATUS_MAP = {
  'new violation':  'Open',
  'unabated':       'Open',
  'pending':        'Open',
  'recommended':    'Open',
  'open':           'Open',
  'abated':         'Corrected',
  'corrected':      'Corrected',
  'void':           'Withdrawn',
  'withdrawn':      'Withdrawn',
  'time extension': 'Time Extension',
};

/**
 * Canonicalize any historical/foreign status string. Unknown or empty values
 * become 'Open' (fail-open: never silently resolve). Idempotent.
 */
function canonicalizeViolationStatus(status) {
  const key = String(status ?? '').trim().toLowerCase();
  return LEGACY_STATUS_MAP[key] ?? 'Open';
}

function isResolvedViolationStatus(status) {
  return RESOLVED_VIOLATION_STATUSES.includes(canonicalizeViolationStatus(status));
}

/**
 * normalizeViolation — the ONE shape-normalizer for a violation element (P0, 2026-07-12).
 *
 * 1. Status: canonicalized onto the four-state axis. The inspector's ORIGINAL word
 *    is preserved once in `status_raw` (legal-record doctrine: normalization must
 *    not destroy what was actually recorded). An existing `status_raw` is never
 *    overwritten — the first raw value wins forever.
 * 2. Identity (`assignId: true`, write path only): a violation with no `id` gets a
 *    UUID. Existing ids of ANY shape are kept — legacy elements were backfilled with
 *    their array position as a STRING id (migration 0045) because violation photos
 *    live under index-based storage paths ({dept}/{inspection}/{violationId}/…);
 *    re-keying them to UUIDs would orphan the evidence photos.
 *    The read path never assigns ids (a fabricated id would change on every read).
 * Idempotent in both modes.
 */
function normalizeViolation(v, { assignId = false } = {}) {
  if (!v || typeof v !== 'object') return v;
  const canonical = canonicalizeViolationStatus(v.status);
  const out = { ...v, status: canonical };
  if (v.status !== undefined && v.status !== null &&
      String(v.status) !== canonical && out.status_raw === undefined) {
    out.status_raw = String(v.status);
  }
  if (assignId && (out.id === undefined || out.id === null || out.id === '')) {
    out.id = require('crypto').randomUUID();
  }
  return out;
}

function normalizeViolations(violations, opts) {
  return Array.isArray(violations) ? violations.map((v) => normalizeViolation(v, opts)) : [];
}

module.exports = {
  VIOLATION_STATUSES,
  RESOLVED_VIOLATION_STATUSES,
  canonicalizeViolationStatus,
  isResolvedViolationStatus,
  normalizeViolation,
  normalizeViolations,
};
