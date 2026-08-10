'use strict';
/**
 * middleware/requireRole.js — level-based authority gates for privileged writes.
 *
 * Mirrors the client's role levels (client/src/data/auth.js ROLES). If you
 * change one, change both:
 *   1 = all members            (member)
 *   2 = officers+              (lieutenant, officer/Captain, training_captain, dispatch)
 *   3 = chiefs / command       (battalion_chief, deputy_chief, chief, training_battalion)
 *
 * `admin` is a platform-owner role on the shared users table; it is not in
 * the client ROLES map but is treated as level 3 here so admin accounts are
 * never locked out of server-side actions.
 *
 * Usage:  router.post('/', requireOfficer, handler)
 *         (requireAuth must run first so req.user is populated.)
 */

const ROLE_LEVELS = {
  member:             1,
  lieutenant:         2,
  officer:            2,
  training_captain:   2,
  dispatch:           2,
  battalion_chief:    3,
  deputy_chief:       3,
  chief:              3,
  training_battalion: 3,
  admin:              3, // platform owner — never locked out
};

function roleLevel(role) {
  return ROLE_LEVELS[role] ?? 0;
}

/**
 * 5.7 (0113): the EFFECTIVE level for a request.
 *
 * requireAuth resolves the caller's role — built-in OR department-authored — and
 * stashes the resolved level on req.user.roleLevel. Prefer it when present; fall
 * back to the static ladder otherwise, so anything that builds a req.user without
 * going through requireAuth (tests, internal calls) behaves exactly as before.
 *
 * Both paths FAIL CLOSED: an unknown role resolves to 0, and 0 < every gate.
 */
function effectiveLevel(user) {
  if (!user) return 0;
  return Number.isFinite(user.roleLevel) ? user.roleLevel : roleLevel(user.role);
}

function requireLevel(min, label) {
  return function (req, res, next) {
    if (!req.user || effectiveLevel(req.user) < min) {
      return res.status(403).json({
        error: `This action requires ${label} authority.`,
        code: 'FORBIDDEN_ROLE',
      });
    }
    next();
  };
}

const requireOfficer = requireLevel(2, 'officer');
const requireChief   = requireLevel(3, 'chief');

// 2.2 (0083): the mechanic gate — chief-level OR the fleet_maintenance capability
// grant on the user (phase spec §5 ruling 1: a capability, never a role rung).
function requireMechanic(req, res, next) {
  if (!req.user || (effectiveLevel(req.user) < 3 && req.user.fleet_maintenance !== true)) {
    return res.status(403).json({
      error: 'This action requires chief authority or the fleet-maintenance grant.',
      code: 'FORBIDDEN_MECHANIC',
    });
  }
  next();
}

/** True when the caller may flip a rig's OOS status / manage work orders. */
function isMechanic(user) {
  return !!user && (effectiveLevel(user) >= 3 || user.fleet_maintenance === true);
}

module.exports = { ROLE_LEVELS, roleLevel, effectiveLevel, requireLevel, requireOfficer, requireChief, requireMechanic, isMechanic };
