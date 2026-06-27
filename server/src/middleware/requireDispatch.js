/**
 * middleware/requireDispatch.js — authority gate for clearing/closing calls.
 *
 * Single source of truth for "who is allowed to clear or close an active call."
 * Per the dispatch-controlled model: a call is cleared by Dispatch, with the
 * chief / deputy chief / battalion chief able to override. Line firefighters
 * and company officers (Captain/Lieutenant) cannot clear a call.
 *
 * This set is intentionally kept in lock-step with the client's CLEAR_ROLES
 * (see client/src/data/auth.js). If you change one, change both.
 *
 * Usage:  router.delete('/', requireAuth, requireDispatch, handler)
 * (requireAuth must run first so req.user is populated.)
 */

const CLEAR_ROLES = new Set(['dispatch', 'chief', 'deputy_chief', 'battalion_chief']);

function requireDispatch(req, res, next) {
  if (!req.user || !CLEAR_ROLES.has(req.user.role)) {
    return res.status(403).json({
      error: 'Only Dispatch (or a Chief) can clear or close an active call.',
    });
  }
  next();
}

module.exports = { CLEAR_ROLES, requireDispatch };
