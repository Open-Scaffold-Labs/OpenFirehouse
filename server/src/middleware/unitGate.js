'use strict';
/**
 * unitGate — server-side scope guard for unit-login sessions (migration 0025).
 *
 * A unit session (JWT/role 'unit', bound to one apparatus; req.user.session_kind
 * === 'unit') is the in-cab apparatus terminal. It is OPERATIONAL + RIG-scoped:
 * dispatch/size-up, the live map, its own GPS reporting + unit status, and the
 * rig-maintenance surface (apparatus/equipment/inventory/inspection checks,
 * maintenance, fuel log), plus pre-plans, hydrants, hazmat, field tools.
 *
 * Records authoring (subpoenable incident narrative / NFIRS / NERIS) and
 * personnel/admin/billing are NOT done from a shared rig terminal — they require
 * a person to log in (member/officer). Those surfaces are ALREADY fail-closed by
 * the role gates (requireOfficer / requireRole / requireDispatch reject role
 * 'unit'). This middleware is defense-in-depth: it hard-blocks unit-session
 * WRITES to those high-stakes families BEFORE the route runs and before a DB
 * transaction opens — so "the rig terminal can't author the legal record" is
 * enforced on the server, not merely by hiding buttons in the client.
 *
 * It is a conservative DENYLIST (only the clearly-sensitive families), so it can
 * never accidentally block a legitimate rig-operational write. Default behavior
 * for every other session_kind (member/officer, absent/legacy) is unchanged:
 * this middleware is a no-op for them.
 *
 * Must be mounted AFTER requireAuth (it reads req.user.session_kind).
 */

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Write paths a unit (rig terminal) session must NEVER hit. Matched against
// req.path. Legal-record + admin/personnel/billing families only.
const UNIT_WRITE_DENYLIST = [
  /^\/api\/incidents(\/|$)/,        // subpoenable incident record / narrative
  /^\/api\/nfirs(\/|$)/,            // NFIRS legal export source
  /^\/api\/neris(\/|$)/,            // NERIS legal export source
  /^\/api\/narrative-drafts(\/|$)/, // narrative drafts (records)
  /^\/api\/members(\/|$)/,          // personnel
  /^\/api\/users(\/|$)/,            // user accounts
  /^\/api\/departments(\/|$)/,      // tenant/admin
  /^\/api\/stations(\/|$)/,         // admin
  /^\/api\/checkout(\/|$)/,         // billing
  /^\/api\/licenses?(\/|$)/,        // licensing
  /^\/api\/export(\/|$)/,           // bulk data export
];

function isDenied(path) {
  return UNIT_WRITE_DENYLIST.some((re) => re.test(path));
}

module.exports = function unitGate(req, res, next) {
  // Only constrains unit sessions; everyone else passes untouched.
  if (req.user?.session_kind !== 'unit') return next();

  // Reads are always fine — a rig terminal can VIEW anything in its department.
  if (READ_METHODS.has(req.method)) return next();

  // Mutating method from a unit terminal into a sensitive family → block.
  if (isDenied(req.path)) {
    return res.status(403).json({
      error: 'A unit terminal can\'t author records or change administration. Log in as a member to do that.',
      code: 'UNIT_SCOPE',
    });
  }
  return next();
};
