'use strict';
/**
 * utils/fiViolationSync.js — keeps fi_violations rows in exact sync with an
 * inspection's violations array (Prevention Core Phase 1, 2026-07-12).
 *
 * PHASE-1 AUTHORITY MODEL (deliberate): the JSON array on fi_inspections stays
 * the API contract and the write source — clients are untouched this phase. These
 * rows are the queryable mirror (dashboards, Phase-2 workflow, reporting). Phase 2
 * flips authority to the rows; until then this function is the ONLY writer.
 *
 * Mechanics: ONE atomic statement (CTE: delete-then-insert) —
 *  - atomic without BEGIN/COMMIT, so it is safe under the prod pool's max:1
 *    connection (never checks out a second client — lesson #12);
 *  - deterministic + idempotent: rows are a pure function of the array;
 *  - a violation REMOVED from the array loses its row (the mirror mirrors);
 *    its history survives in the audit_log and the retained JSON archive.
 *
 * Lives in its OWN file (not db.js) deliberately: db.js was mid-edit by a
 * concurrent session when Phase 1 shipped; route-level wiring avoids the collision.
 */

const { normalizeViolation } = require('../constants/violationStatus');

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/** Nullable ISO day: legacy blob dates are free text — only pass what parses. */
function dayOrNull(v) {
  return typeof v === 'string' && DATE_RE.test(v) ? v.slice(0, 10) : null;
}

/**
 * @param {import('pg').Pool} pool  the shared pool (chokepoint query — auto-released)
 * @param {{id:number, violations:Array<object>}} inspection  post-write, canonicalized
 * @param {number} departmentId
 */
async function syncViolationRows(pool, inspection, departmentId) {
  const violations = Array.isArray(inspection.violations) ? inspection.violations : [];
  const rows = violations
    .filter((v) => v && typeof v === 'object')
    // ENFORCE the @param contract ("post-write, canonicalized") instead of trusting it.
    // A caller handing us a raw row put a legacy word (e.g. 'Pending') into the mirror,
    // where fiReports' positive allowlist — status = ANY('Open','Time Extension') —
    // matched neither and the violation vanished from the open set (2026-07-14). The
    // caller is fixed; this is the fence. normalizeViolation assigns NO id here (no
    // `assignId`), so violation_key still resolves to the SAME key photos are stored
    // under — identity is never re-minted on a mirror sync. status_raw preserves the
    // inspector's original word. Idempotent, so a canonical row passes through unchanged.
    .map((raw) => normalizeViolation(raw))
    .map((v, i) => ({
      violation_key:    String(v.id ?? i),
      position:         i,
      code:             v.code ?? null,
      description:      v.description ?? null,
      status:           v.status ?? 'Open',
      status_raw:       v.status_raw ?? null,
      notes:            v.notes ?? null,
      next_recheck_date: dayOrNull(v.followUpDate),
      repaired_date:     dayOrNull(v.correctedDate),
      imminent_hazard:   v.imminentHazard === true,
      carried_from_key:  typeof v.carriedFrom === 'string' ? v.carriedFrom : null, // reinspection lineage (P2)
    }));

  // UPSERT current rows, then PRUNE stale keys — two statements by design.
  // A delete+insert CTE does NOT work here: inside one statement the INSERT
  // cannot see the CTE's DELETE (same-snapshot rule), so re-syncing an
  // UNCHANGED violation_key hits the unique index (23505 — caught live by the
  // Phase-2 engine e2e; the Phase-1 e2e missed it because its PATCH changed
  // keys). Upsert-first also means a crash between the two statements leaves
  // harmless stale EXTRAS (pruned on the next write) rather than missing rows.
  await pool.query(
    // No `severity` — the column was DROPPED in migration 0055 (2026-07-14). It was an
    // invented field (fire inspection has no Low/Moderate/High grade) that defaulted to
    // 'Moderate' and printed on the served notice. imminent_hazard is the real flag.
    `INSERT INTO fi_violations (
       department_id, inspection_id, violation_key, position, code, description,
       status, status_raw, notes, next_recheck_date, repaired_date,
       imminent_hazard, carried_from_key
     )
     SELECT $2, $1,
            r->>'violation_key', (r->>'position')::int, r->>'code', r->>'description',
            COALESCE(r->>'status','Open'), r->>'status_raw', r->>'notes',
            (r->>'next_recheck_date')::date, (r->>'repaired_date')::date,
            COALESCE((r->>'imminent_hazard')::boolean, false), r->>'carried_from_key'
     FROM jsonb_array_elements($3::jsonb) AS r
     ON CONFLICT (inspection_id, violation_key) DO UPDATE SET
       position = EXCLUDED.position, code = EXCLUDED.code,
       description = EXCLUDED.description,
       status = EXCLUDED.status, status_raw = EXCLUDED.status_raw,
       notes = EXCLUDED.notes, next_recheck_date = EXCLUDED.next_recheck_date,
       repaired_date = EXCLUDED.repaired_date, imminent_hazard = EXCLUDED.imminent_hazard,
       carried_from_key = EXCLUDED.carried_from_key,
       deleted_at = NULL, updated_at = NOW()`,
    [inspection.id, departmentId, JSON.stringify(rows)]
  );
  await pool.query(
    `DELETE FROM fi_violations
     WHERE inspection_id = $1 AND department_id = $2
       AND NOT (violation_key = ANY($3::text[]))`,
    [inspection.id, departmentId, rows.map((r) => r.violation_key)]
  );
}

/** Soft-delete the mirror rows alongside a soft-deleted inspection. */
async function softDeleteViolationRows(pool, inspectionId, departmentId) {
  await pool.query(
    `UPDATE fi_violations SET deleted_at = NOW()
     WHERE inspection_id = $1 AND department_id = $2 AND deleted_at IS NULL`,
    [inspectionId, departmentId]
  );
}

module.exports = { syncViolationRows, softDeleteViolationRows, dayOrNull };
