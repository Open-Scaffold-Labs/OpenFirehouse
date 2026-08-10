'use strict';
/**
 * callAssociation.js — THE ONE DOOR for binding a CAD call to an incident record.
 *
 * Spec: docs/PHASE4-1aR-CALL-INCIDENT-ASSOCIATION-2026-07-26.md
 * Migrations: 0100 (cad_alerts.incident_id), 0103 (incidents.cad_run_number).
 *
 * ─── THE RULE ───────────────────────────────────────────────────────────────
 * THE RUN NUMBER IS THE LINK. Every surveyed platform keys this association on
 * the CAD dispatch/run number — from a middleware vendor's integration docs, the
 * decision turns on unit clear times plus "the existence of another report with
 * the same 'Dispatch Run Number'". No time proximity. No unit overlap. No
 * "which call is currently open".
 *
 * That is why this file exists at all. The reverted 4.1a writer picked "the one
 * open call" and then refused to guess when two were open — an elegant answer to
 * a question the correct key never asks. UNDER A RUN-NUMBER KEY, CONCURRENT
 * CALLS ARE NOT AMBIGUOUS.
 *
 * ─── WHAT MUST NEVER HAPPEN HERE ────────────────────────────────────────────
 * • No timing match, no geo match, no unit-overlap inference, no confidence
 *   score, no "most recent open call". If the run number does not resolve, the
 *   answer is `not_found` and NOTHING is written.
 * • No tactical surface calls this. The Command Board REFLECTS state; it never
 *   activates it (Matt, 2026-07-26). Enforced by a test, not by this comment.
 * • No silent re-pointing. An incident already bound to a different call is a
 *   `conflict` — repair is admin-side and audited, never an automatic overwrite.
 *
 * ─── WHY ONE STATEMENT ──────────────────────────────────────────────────────
 * Both edges are written by a single data-modifying CTE, so Postgres gives us
 * atomicity for free: both, or neither. A half-written association reports a
 * response time nobody can trace back to a call.
 *
 * This deliberately avoids pool.connect()+BEGIN. The prod pool is `max: 1`
 * (db.js) and a request may already hold the connection under P5_TXN — checking
 * out a second one deadlocks until timeout (lesson #12, which bit accept-invite
 * and the signup audit). One statement sidesteps the whole hazard.
 *
 * The alert edge is guarded by `EXISTS (SELECT 1 FROM inc)` so it cannot land
 * when the incident edge was refused.
 */

const { pool } = require('../db');

/** Outcomes. Closed set — callers match exactly, nothing pattern-matches. */
const ASSOCIATION_RESULT = Object.freeze({
  LINKED: 'linked',           // written now
  ALREADY: 'already_linked',  // same pair already bound — idempotent success
  NOT_FOUND: 'not_found',     // no call with that run number in this department
  CONFLICT: 'conflict',       // incident already bound to a DIFFERENT call
  NO_INCIDENT: 'no_incident', // incident missing, soft-deleted, or another dept's
});

/**
 * Bind a CAD call to an incident, keyed on the run number.
 *
 * @param {number} departmentId  tenant scope — never optional, never defaulted
 * @param {number} incidentId
 * @param {string} runNumber     the CAD-supplied run number, opaque to us
 * @returns {Promise<{result:string, alertId:number|null, runNumber:string|null}>}
 */
async function associateCallToIncident(departmentId, incidentId, runNumber) {
  const run = typeof runNumber === 'string' ? runNumber.trim() : '';
  if (!departmentId || !incidentId || !run) {
    return { result: ASSOCIATION_RESULT.NOT_FOUND, alertId: null, runNumber: null };
  }

  const { rows } = await pool.query(
    `WITH target AS (
        SELECT id FROM cad_alerts
         WHERE department_id = $1 AND alert_id = $2
         ORDER BY id DESC LIMIT 1
     ),
     inc AS (
        UPDATE incidents
           SET cad_run_number = $2
         WHERE id = $3
           AND department_id = $1
           AND deleted_at IS NULL
           AND (cad_run_number IS NULL OR cad_run_number = $2)
           AND EXISTS (SELECT 1 FROM target)
        RETURNING id
     ),
     alert AS (
        UPDATE cad_alerts
           SET incident_id = $3
         WHERE id = (SELECT id FROM target)
           AND department_id = $1
           AND (incident_id IS NULL OR incident_id = $3)
           AND EXISTS (SELECT 1 FROM inc)
        RETURNING id
     )
     SELECT
       (SELECT id FROM target)                                   AS alert_id,
       (SELECT count(*) FROM inc)::int                           AS inc_rows,
       (SELECT count(*) FROM alert)::int                         AS alert_rows,
       -- PRE-update state. Every CTE and this SELECT share one snapshot, so
       -- these read the values as they were BEFORE the UPDATEs above — which is
       -- what lets us tell "just bound" from "was already bound".
       (SELECT cad_run_number FROM incidents
         WHERE id = $3 AND department_id = $1)                   AS existing_run,
       (SELECT incident_id FROM cad_alerts
         WHERE id = (SELECT id FROM target))                     AS existing_alert_inc,
       (SELECT 1 FROM incidents
         WHERE id = $3 AND department_id = $1 AND deleted_at IS NULL) AS incident_ok`,
    [departmentId, run, incidentId]
  );

  const r = rows[0] || {};

  if (!r.incident_ok) {
    return { result: ASSOCIATION_RESULT.NO_INCIDENT, alertId: null, runNumber: null };
  }
  if (r.alert_id == null) {
    // No call carries this run number in this department. Say so; write nothing.
    return { result: ASSOCIATION_RESULT.NOT_FOUND, alertId: null, runNumber: run };
  }
  // Checked BEFORE the row counts: a replay re-writes the same values and so
  // still reports 1 row updated on each edge. Only the pre-update snapshot can
  // distinguish "just bound" from "was already bound" — and the caller needs
  // that distinction, or it logs a linkage event on every replay.
  if (r.existing_run === run && r.existing_alert_inc === incidentId) {
    return { result: ASSOCIATION_RESULT.ALREADY, alertId: r.alert_id, runNumber: run };
  }
  if (r.inc_rows === 1 && r.alert_rows === 1) {
    return { result: ASSOCIATION_RESULT.LINKED, alertId: r.alert_id, runNumber: run };
  }
  // The incident is bound to a different call. Admin repair, never an overwrite.
  return { result: ASSOCIATION_RESULT.CONFLICT, alertId: r.alert_id, runNumber: r.existing_run || null };
}

module.exports = { associateCallToIncident, ASSOCIATION_RESULT };
