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

function requireLevel(min, label) {
  return function (req, res, next) {
    if (!req.user || roleLevel(req.user.role) < min) {
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

module.exports = { ROLE_LEVELS, roleLevel, requireLevel, requireOfficer, requireChief };
