'use strict';
const jwt = require('jsonwebtoken');
const db = require('../db');

const { ACCESS_SECRET } = require('../config/jwtSecret');

module.exports = async function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, ACCESS_SECRET);
    const user = await db.users.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }
    // Quick-win (2026-06-10): the `|| 1` fallback is gone — prod + dev both
    // verified 0 NULL-station users. A user with no station now fails CLOSED
    // instead of silently becoming department 1.
    if (!user.station_id) {
      return res.status(403).json({ error: 'Account has no station assigned. Contact your chief.', code: 'NO_STATION' });
    }
    // Multi-tenant Phase 2: resolve the ACTIVE department (of_user_departments,
    // falling back to the station-mirrored department during EXPAND). Carried
    // alongside stationId — code still reads stationId until the Phase 3 query
    // migration; department_id is present so routes can begin pivoting. Fails
    // CLOSED (mirrors NO_STATION) if no department resolves.
    const departmentId = await db.users.resolveDepartmentId(payload.sub, user.station_id);
    if (!departmentId) {
      return res.status(403).json({ error: 'Account has no department assigned. Contact your chief.', code: 'NO_DEPARTMENT' });
    }
    // Unit-login accounts (migration 0025): role='unit' bound to one apparatus.
    // Derived from the freshly-resolved row (never trusted from the token alone),
    // so this is additive — member/officer sessions get session_kind 'member' and
    // a null apparatusId, exactly as before. The unitGate middleware reads
    // session_kind to enforce the rig scope server-side.
    const isUnit = user.role === 'unit' && !!user.apparatus_id;
    req.user = {
      id: payload.sub,
      username: payload.username,
      // Real display name from the user record (NOT the username) so anything that
      // records "who" — e.g. an incident response — stores the member's actual name
      // and resolves to their roster/cert record. (members.user_id is the stable
      // link; until it's populated everywhere, name resolution is the fallback.)
      name: user.name || payload.username,
      role: payload.role,
      stationId: user.station_id,
      department_id: departmentId,
      // Unit-session binding: the apparatus this in-cab terminal is logged in as.
      apparatusId: isUnit ? user.apparatus_id : null,
      session_kind: isUnit ? 'unit' : 'member',
      // Client capability label (form-factor guardrail). Absent/legacy tokens →
      // 'command' (full access) so existing sessions are unaffected. The
      // companionGate middleware reads this to enforce phone read-only.
      client_kind: payload.client_kind === 'companion' ? 'companion' : 'command',
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};
