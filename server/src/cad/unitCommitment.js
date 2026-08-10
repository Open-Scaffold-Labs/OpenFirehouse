'use strict';
/**
 * cad/unitCommitment.js — the single source of truth for "which units are
 * committed to which call" (2026-07-12).
 *
 * Extracted from routes/units.js + routes/cad.js so BOTH can use it without a
 * circular require (units.js needs it for the last-unit clear suggestion;
 * cad.js needs it for the clear-time release prompt). Same alias-aware matcher
 * as the orphan flag, the 0041 archive, and the EN ROUTE precondition.
 */

const db = require('../db');
const { parseUnitList, matchApparatus } = require('./unitMatch');

// The committed (non-dispatchable) statuses — status model 0022 + the EMS
// extension (2026-07-13): transporting + at_hospital are committed too (a rig
// with a patient is on a call; the EN ROUTE-family gate, orphan flag, and
// clear-time release prompt all treat them identically).
const COMMITTED_STATUSES = new Set(['dispatched', 'enroute', 'on_scene', 'transporting', 'at_hospital']);

/** Units of this dept matched to THIS alert's units string AND currently
 * committed. Returns [{ apparatusId, designation, status }]. */
async function committedUnitsForAlert(departmentId, alert) {
  const units = await db.unitStatus.list(departmentId);
  const fleet = units
    .filter((u) => u.apparatus_id != null)
    .map((u) => ({ id: u.apparatus_id, designation: u.designation }));
  const matched = new Set();
  for (const t of parseUnitList(alert.units || '')) {
    const m = matchApparatus(t, fleet);
    if (m) matched.add(m.id);
  }
  return units
    .filter((u) => matched.has(u.apparatus_id) && COMMITTED_STATUSES.has(u.status))
    .map((u) => ({ apparatusId: u.apparatus_id, designation: u.designation, status: u.status }));
}

/** True when this apparatus is named on any UNCLEARED CAD call (alias-aware).
 * Used by the EN ROUTE precondition (a committed status always attaches to an
 * incident — the public CAD functional standard's invariant). */
async function unitOnActiveCall(departmentId, apparatusId, designation) {
  const active = await db.cadAlerts.recent(departmentId, 100); // uncleared only
  const fleet = [{ id: apparatusId, designation: designation || '' }];
  for (const a of active || []) {
    for (const t of parseUnitList(a.units || '')) {
      if (matchApparatus(t, fleet)) return true;
    }
  }
  return false;
}

/** After a unit leaves a committed status: the active calls this unit was on
 * that now have ZERO committed units — the "last unit cleared, close the call
 * too?" suggestion the mature platforms ship. Returns the first such alert or
 * null. Best-effort by design (callers must never fail a status write on it). */
async function clearSuggestionForUnit(departmentId, apparatusId, designation) {
  const active = await db.cadAlerts.recent(departmentId, 100);
  const fleet = [{ id: apparatusId, designation: designation || '' }];
  for (const a of active || []) {
    let onThis = false;
    for (const t of parseUnitList(a.units || '')) {
      if (matchApparatus(t, fleet)) { onThis = true; break; }
    }
    if (!onThis) continue;
    const stillCommitted = await committedUnitsForAlert(departmentId, a);
    if (stillCommitted.length === 0) {
      return { alertId: a.id, description: a.description || '', address: a.address || '' };
    }
  }
  return null;
}

/**
 * Does the rig-side active-call gate apply to this transition? (2026-07-13,
 * refined with the EMS extension — and fixing a live edge in the 2026-07-12
 * gate: a rig enroute whose call was cleared early was 409'd pressing ON SCENE.)
 *
 * The active-call requirement exists to stop a rig ENTERING the committed
 * family with no call (incl. from an orphaned 'dispatched' — doctrine: an
 * orphaned dispatched must never enable EN ROUTE). A rig already legitimately
 * WORKING (enroute / on_scene / transporting / at_hospital) may always progress
 * deeper and walk home: command terminated ≠ released, and a patient transport
 * outlives the call record. Mirrors mobile lib/callLog.ts rigStepAllowed
 * (which gates the first rung only).
 */
const COMMITTED_PROGRESSION_FROM = new Set(['enroute', 'on_scene', 'transporting', 'at_hospital']);
function rigGateApplies(currentStatus, targetStatus) {
  if (!COMMITTED_STATUSES.has(targetStatus)) return false; // tail is never gated
  return !COMMITTED_PROGRESSION_FROM.has(currentStatus);
}

module.exports = { COMMITTED_STATUSES, committedUnitsForAlert, unitOnActiveCall, clearSuggestionForUnit, rigGateApplies };
