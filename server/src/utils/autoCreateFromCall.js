'use strict';
/**
 * autoCreateFromCall.js — 4.1a-R.4b · mint a draft report when a call clears.
 *
 * Matt's ruling (2026-07-26, Q1): auto-create AND the picker, per the market.
 * The documented market trigger is the department's UNIT CLEAR TIMES — a report
 * is minted when the call is over, and matched on the dispatch run number.
 *
 * ─── WHAT THIS PRODUCES ─────────────────────────────────────────────────────
 * A DRAFT built ONLY from facts CAD already stated: number, date, time, address,
 * units, and the run-number association. Nothing is interpreted.
 *
 *   • `notes` (the subpoenable narrative) stays EMPTY. The officer writes it.
 *     AI never touches it, and neither does this — doctrine 2026-06-10.
 *   • `type` is 'Other'. CAD's free-text description is NOT classified into an
 *     incident type here. The deleted module did that with an AI call plus a
 *     keyword map; both INVENT a classification on a legal record. 'Other' is
 *     visibly unfinished, which is the honest state of a report nobody has
 *     written yet. The officer picks the real type.
 *   • The CAD description is preserved verbatim in `description` so the officer
 *     has what dispatch actually said, unparaphrased.
 *
 * ─── THE GUARDS ─────────────────────────────────────────────────────────────
 * 1. SCRATCH CALLS GET NO REPORT. If no unit of this department ever went
 *    en route or arrived, nothing happened worth a legal record — this is the
 *    market's own documented behaviour ("scratch" calls where "none of your
 *    department's units had en-route or arrival times"). Cancelled-en-route and
 *    never-dispatched calls fall out here.
 * 2. NEVER TWICE. A call already carrying an incident is skipped. The deleted
 *    module's duplicate guard caught its own error and returned false — failing
 *    OPEN on a legal record, so a re-processed alert would have minted a second
 *    incident. Here the check is a plain read with no catch, and the
 *    department-scoped unique index is the backstop.
 * 3. NON-FATAL. This runs off the CAD close webhook. A failure here must never
 *    stop a call from clearing — it is reported and the call closes regardless.
 *    Reconciliation will list the call as MISSING, which is exactly what that
 *    screen is for.
 *
 * ─── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
 * No AI enrichment (not market-required; adds cost and a doctrine surface —
 * returns only on Matt's explicit ask). No runtime DDL. No narrative. No
 * inference of anything a human should decide.
 */

const { pool, incidents: incDb } = require('../db');
const { withMintedIncidentNumber } = require('./incidentNumber');
const { associateCallToIncident, ASSOCIATION_RESULT } = require('./callAssociation');

/** Statuses that mean a unit actually turned out for this call. */
const RESPONDED_STATUSES = ['enroute', 'on_scene', 'transporting', 'at_hospital'];

const RESULT = Object.freeze({
  CREATED: 'created',
  ALREADY_LINKED: 'already_linked',
  SCRATCH: 'scratch',          // nobody responded — no report, by design
  NO_ALERT: 'no_alert',
  FAILED: 'failed',
});

/**
 * @param {{ alertRow: object, departmentId: number }} args
 * @returns {Promise<{result:string, incidentId:number|null, incidentNumber:string|null}>}
 */
async function autoCreateFromCall({ alertRow, departmentId }) {
  const none = (result) => ({ result, incidentId: null, incidentNumber: null });
  if (!alertRow || !departmentId) return none(RESULT.NO_ALERT);

  // GUARD 2 — never twice.
  if (alertRow.incident_id != null) return none(RESULT.ALREADY_LINKED);

  // GUARD 1 — scratch call. Did any unit of ours actually turn out?
  //
  // Bounded at BOTH ends — dispatch to clear. An earlier draft used only
  // `changed_at >= dispatched_at`, which is department-wide and open-ended, so a
  // scratch call overlapping a real one would inherit the OTHER call's response
  // and mint a report for nothing. That is the same cross-attribution this whole
  // design exists to eliminate, and it slipped into the guard against it.
  //
  // ⚠ HONEST LIMIT: this is a time window, not a per-unit attribution, so two
  // genuinely concurrent calls can still bleed into each other. Exact scoping
  // needs unit_status_history.incident_id, which is populated BY the association
  // that happens after this check — a real ordering constraint, not an oversight.
  // The failure direction is chosen deliberately: a false "responded" mints a
  // draft a human then sees and can delete, while a false "scratch" LOSES a
  // report silently. We err toward creating.
  const responded = await pool.query(
    `SELECT 1 FROM unit_status_history
      WHERE department_id = $1
        AND status = ANY($2::text[])
        AND changed_at >= $3
        AND changed_at <= $4
      LIMIT 1`,
    [
      departmentId,
      RESPONDED_STATUSES,
      alertRow.dispatched_at || new Date(0).toISOString(),
      alertRow.cleared_at || new Date().toISOString(),
    ]
  );
  if (responded.rows.length === 0) return none(RESULT.SCRATCH);

  const when = alertRow.dispatched_at ? new Date(alertRow.dispatched_at) : new Date();
  const date = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
  const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  const units = String(alertRow.units || '')
    .split(',').map((u) => u.trim()).filter(Boolean);

  const incident = await withMintedIncidentNumber(departmentId, (incidentNumber) =>
    incDb.create({
      incidentNumber,
      date,
      time,
      // 'Other' is the honest state of a report nobody has written yet. We do
      // not classify CAD's description into a type — that is the officer's call.
      type: 'Other',
      alarmLevel: 'Still',
      address: alertRow.address || '',
      units,
      personnel: [],
      disposition: '',
      injuries: 0,
      notes: '',   // officer-written. Always.
      // NOT copying CAD's description onto the incident: `description` is not in
      // incCreate's column list, so it would be silently dropped — and it does
      // not need copying anyway. The alert is associated, so dispatch's exact
      // words stay one join away on the row that actually said them. Duplicating
      // a source field is how the copy and the original start disagreeing.
    }, departmentId));

  if (!incident || !incident.id) return none(RESULT.FAILED);

  // Bind it through the ONE door, keyed on the run number — same path the picker
  // and Reconciliation use, so an auto-created record has identical provenance.
  const assoc = await associateCallToIncident(departmentId, incident.id, alertRow.alert_id);
  if (assoc.result !== ASSOCIATION_RESULT.LINKED && assoc.result !== ASSOCIATION_RESULT.ALREADY) {
    // The report exists but is unattached. Say so; Reconciliation will show it.
    console.error('[cad] auto-created incident but could not attach it:', assoc.result);
  }

  return { result: RESULT.CREATED, incidentId: incident.id, incidentNumber: incident.incidentNumber };
}

module.exports = { autoCreateFromCall, RESULT, RESPONDED_STATUSES };
