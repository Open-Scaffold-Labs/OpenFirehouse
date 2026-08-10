/**
 * middleware/requireUnitStatusAuth.js — who may change a UNIT's status.
 *
 * Per the dispatch-software model (Phase 2): unit status is owned by the unit
 * itself, the call-close is owned by dispatch. So:
 *   - Dispatch + command (CLEAR_ROLES) may set ANY unit's status.
 *   - A UNIT LOGIN (role='unit' + users.apparatus_id, migration 0025 — the
 *     in-cab MDT) may set its OWN unit's status, never another's. (Added
 *     2026-07-11, Matt's call: match the crew-self-statusing model the major
 *     MDT platforms ship, with tighter authority — own unit only.)
 *   - The rig's OFFICER may set their OWN unit's status. "Officer" = whoever
 *     holds the officer seat on that rig today (Captain, Lieutenant, OR an
 *     acting officer — A/C, A/LT, OIC), resolved from today's run-list crew.
 *   - Everyone else is read-only.
 *
 * Both rig-side paths (unit login + run-list officer) are gated by the
 * per-department `departments.allow_rig_status` toggle (0040, default TRUE)
 * so strict dispatch-only houses can opt out. Dispatch/command are never
 * gated. RADIO DOCTRINE UNCHANGED: every flip is a HUMAN action — the app
 * still never infers a status (no geofence / AVL / AI).
 *
 * Fail CLOSED: if ownership can't be confidently established, deny.
 * Note: users<->members are linked by NAME in this codebase (no FK), matching
 * the existing pattern (incident_responses, dailyStaffing). Name collisions are
 * a known v1 limitation; v1.1 should add an explicit user.member_id link.
 *
 * Must run AFTER requireAuth (needs req.user). Used on PATCH /api/units/:apparatusId/status.
 */

const db = require('../db');
const { CLEAR_ROLES } = require('./requireDispatch');

const DENY = 'Only Dispatch, a Chief, or this unit’s own crew can change its status.';

/**
 * Per-dept rig self-statusing gate (0040). A FEATURE gate, not a security
 * boundary — the security boundary is the role/ownership checks in the
 * middleware (those fail closed). Only an explicit FALSE disables rig
 * statusing; a read error defaults OPEN so a transient DB hiccup can't
 * strand a responding rig mid-ladder.
 */
async function rigStatusAllowed(departmentId) {
  try {
    const r = await db.pool.query(
      'SELECT allow_rig_status FROM departments WHERE id = $1',
      [departmentId]
    );
    return r.rows[0]?.allow_rig_status !== false;
  } catch (e) {
    console.warn('rigStatusAllowed read failed (defaulting open):', e.message);
    return true;
  }
}

/** True if a run-list position/rank represents the officer seat (incl. acting). */
function isOfficerSeat(position) {
  const p = (position || '').toLowerCase();
  return /\b(captain|lieutenant|officer|oic)\b/.test(p)
    || p.includes('acting') || p.includes('a/c') || p.includes('a/lt');
}

function serverDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function requireUnitStatusAuth(req, res, next) {
  try {
    // Dispatch + command can set ANY unit.
    if (req.user && CLEAR_ROLES.has(req.user.role)) return next();

    const apparatusId = Number(req.params.apparatusId);
    if (!Number.isInteger(apparatusId)) {
      return res.status(403).json({ error: DENY });
    }

    // Unit-login terminal (the in-cab MDT): the rig may status ITSELF only.
    // Ownership check FIRST (fail closed), then the per-dept feature gate.
    if (req.user?.session_kind === 'unit' && req.user.apparatusId != null) {
      if (Number(req.user.apparatusId) !== apparatusId) {
        return res.status(403).json({ error: DENY });
      }
      if (!(await rigStatusAllowed(req.user.department_id))) {
        return res.status(403).json({ error: DENY });
      }
      req.rigActor = true; // rig-side actor — committed statuses need an active call (route enforces)
      return next();
    }

    // Resolve the caller's member name (users<->members are linked by name).
    const user = await db.users.findById(req.user.id);
    const name = (user?.name || '').trim();
    if (!name) return res.status(403).json({ error: DENY });

    // Target apparatus designation, for an apparatus_name fallback match.
    const appt = await db.apparatus.findById(apparatusId, req.user.stationId);
    const designation = appt?.designation || '';

    // Today's submitted run-list crew snapshot for the caller's station (0072:
    // per-station grain). Scoped by department_id too for tenant safety.
    const r = await db.pool.query(
      `SELECT payload FROM run_lists WHERE department_id=$1 AND station_id=$2 AND date=$3 ORDER BY submitted_at DESC LIMIT 1`,
      [req.user.department_id, req.user.stationId, serverDate()]
    );
    const crew = r.rows[0]?.payload?.crew;
    const list = Array.isArray(crew) ? crew : [];

    const owns = list.some((c) => {
      const matchUnit = (c.apparatus_id != null && Number(c.apparatus_id) === apparatusId)
        || (designation && (c.apparatus_name || '') === designation);
      const matchMember = (c.member_name || '').trim().toLowerCase() === name.toLowerCase();
      return matchUnit && matchMember && isOfficerSeat(c.position_name || c.position || c.member_rank);
    });

    if (owns) {
      // Run-list officer statusing their own rig — same per-dept gate as the
      // unit-login path (dispatch/command above are never gated).
      if (!(await rigStatusAllowed(req.user.department_id))) {
        return res.status(403).json({ error: DENY });
      }
      req.rigActor = true; // rig-side actor — committed statuses need an active call (route enforces)
      return next();
    }
    return res.status(403).json({ error: DENY });
  } catch (e) {
    console.error('requireUnitStatusAuth error:', e);
    return res.status(403).json({ error: 'Could not verify unit-status authority.' });
  }
}

module.exports = { requireUnitStatusAuth, isOfficerSeat };
