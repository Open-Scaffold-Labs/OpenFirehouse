'use strict';
const jwt = require('jsonwebtoken');
const db = require('../db');

const { ACCESS_SECRET } = require('../config/jwtSecret');
const { resolveRole } = require('../utils/roleResolver'); // 5.7 (0113)

module.exports = async function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, ACCESS_SECRET);

    // Phase 5 / 0111 — MFA challenge tokens are NOT sessions.
    // /api/auth/login issues a short-lived token carrying mfa:'pending' when an
    // account has a second factor. It is signed with ACCESS_SECRET and carries a
    // real `sub`, so without this check it would authenticate every normal route
    // — and a client could simply skip the code prompt. It has exactly ONE valid
    // destination: POST /api/auth/mfa. Refuse it everywhere else.
    if (payload.mfa === 'pending') {
      return res.status(401).json({
        error: 'Multi-factor authentication is not complete.',
        code:  'MFA_REQUIRED',
      });
    }

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

    // 5.7 (0113) — resolve the role to a LEVEL, built-in or department-authored.
    // Built-ins resolve from code (so a DB problem can never dissolve them and
    // lock a department out); custom roles resolve from of_roles for THIS
    // department only. Anything unresolvable → level 0, which fails every gate.
    // `unit` is intentionally not on the ladder: it runs off an explicit page
    // allowlist, so 0 is correct for it too.
    const resolvedRole = await resolveRole(payload.role, departmentId);

    req.user = {
      id: payload.sub,
      username: payload.username,
      // Real display name from the user record (NOT the username) so anything that
      // records "who" — e.g. an incident response — stores the member's actual name
      // and resolves to their roster/cert record. (members.user_id is the stable
      // link; until it's populated everywhere, name resolution is the fallback.)
      name: user.name || payload.username,
      role: payload.role,
      // 5.7 — the effective level for every gate. requireRole.effectiveLevel()
      // prefers this over the static ladder, so a custom role works everywhere a
      // built-in does without rewriting a single route.
      roleLevel: resolvedRole.level,
      roleLabel: resolvedRole.label,
      roleIsBuiltin: resolvedRole.isBuiltin,
      // null = not page-restricted (built-in behaviour, PAGE_ACCESS governs);
      // an array = this custom role's explicit page allowlist.
      rolePages: resolvedRole.pages,
      stationId: user.station_id,
      department_id: departmentId,
      // 2.2 (0083): the mechanic capability grant — NOT a role rung (phase spec §5
      // ruling 1). Read fresh from the user row so a chief's grant/revoke takes
      // effect on the member's next request, not their next login.
      fleet_maintenance: user.fleet_maintenance === true,
      // 2.7 (0087): the CS-manager capability grant — same pattern, same reasons.
      cs_manager: user.cs_manager === true,
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
