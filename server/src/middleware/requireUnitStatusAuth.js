/**
 * middleware/requireUnitStatusAuth.js — who may change a UNIT's status.
 *
 * Per the dispatch-software model (Phase 2): unit status is owned by the unit
 * itself, the call-close is owned by dispatch. So:
 *   - Dispatch + command (CLEAR_ROLES) may set ANY unit's status.
 *   - The rig's OFFICER may set their OWN unit's status. "Officer" = whoever
 *     holds the officer seat on that rig today (Captain, Lieutenant, OR an
 *     acting officer — A/C, A/LT, OIC), resolved from today's run-list crew.
 *   - Everyone else is read-only.
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

const DENY = 'Only Dispatch, a Chief, or this unit’s officer can change its status.';

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

    // Resolve the caller's member name (users<->members are linked by name).
    const user = await db.users.findById(req.user.id);
    const name = (user?.name || '').trim();
    if (!name) return res.status(403).json({ error: DENY });

    // Target apparatus designation, for an apparatus_name fallback match.
    const appt = await db.apparatus.findById(apparatusId, req.user.stationId);
    const designation = appt?.designation || '';

    // Today's submitted run-list crew snapshot.
    const r = await db.pool.query(
      `SELECT payload FROM run_lists WHERE station_id=$1 AND date=$2 ORDER BY submitted_at DESC LIMIT 1`,
      [req.user.stationId, serverDate()]
    );
    const crew = r.rows[0]?.payload?.crew;
    const list = Array.isArray(crew) ? crew : [];

    const owns = list.some((c) => {
      const matchUnit = (c.apparatus_id != null && Number(c.apparatus_id) === apparatusId)
        || (designation && (c.apparatus_name || '') === designation);
      const matchMember = (c.member_name || '').trim().toLowerCase() === name.toLowerCase();
      return matchUnit && matchMember && isOfficerSeat(c.position_name || c.position || c.member_rank);
    });

    if (owns) return next();
    return res.status(403).json({ error: DENY });
  } catch (e) {
    console.error('requireUnitStatusAuth error:', e);
    return res.status(403).json({ error: 'Could not verify unit-status authority.' });
  }
}

module.exports = { requireUnitStatusAuth, isOfficerSeat };
