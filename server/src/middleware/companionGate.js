'use strict';
/**
 * companionGate — the server-side write-capability gate for the read-only
 * companion (phone) client. (OpenFirehouse Mobile two-client architecture,
 * Phase A; see OpenFirehouseMobile/docs/TWO-CLIENT-ARCHITECTURE-SPEC.md §4.)
 *
 * A companion session (JWT `client_kind: 'companion'`, set when the mobile app
 * signs in on a phone) is READ-ONLY except for a tiny allowlist of self-writes.
 * Every other mutating request (POST/PATCH/PUT/DELETE) is rejected 403 here —
 * BEFORE the route runs and before a DB transaction is opened — so "phones can't
 * write" is enforced on the server, not by hiding buttons in the client.
 *
 * Default behavior for any other client_kind (incl. absent/legacy → 'command')
 * is unchanged: this middleware is a no-op for them.
 *
 * Must be mounted AFTER requireAuth (it reads req.user.client_kind).
 *
 * Self-scope note: the allowlisted endpoints derive the acting member from the
 * JWT (req.user.id), never from the request body — so a companion can only write
 * ITS OWN response, never another member's, and never an officer-only field
 * (a recall's level/close stays off the allowlist → 403 from a phone).
 */

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// The ONLY writes a companion phone may perform. Each entry is matched against
// the full request path (req.path, e.g. "/api/recall/42/respond").
// Add the Phase F response-gated responder-location endpoint here when it ships.
const COMPANION_WRITE_ALLOWLIST = [
  { method: 'POST',   pattern: /^\/api\/recall\/\d+\/respond\/?$/ },     // own recall response
  { method: 'POST',   pattern: /^\/api\/incidents\/\d+\/respond\/?$/ },  // own incident response
  // Registering/unregistering THIS device's Expo push token (to RECEIVE recalls/
  // dispatch on a locked phone) — not an OF-data write; scoped to the caller's JWT.
  { method: 'POST',   pattern: /^\/api\/push\/expo-register\/?$/ },
  { method: 'DELETE', pattern: /^\/api\/push\/expo-register\/?$/ },
  // ── 1.7 member self-service (spec §2) — every route below derives the acting member
  // from the JWT and enforces self-only/ownership internally (1.2e/1.3/1.5 suites).
  // The phone PROPOSES; command DISPOSES: vacancy fill/hire, trade approve/deny, and
  // leave PATCH stay OFF this list deliberately (the market ceiling).
  { method: 'POST',   pattern: /^\/api\/hiring\/offers\/\d+\/accept\/?$/ },   // own OT offer
  { method: 'POST',   pattern: /^\/api\/hiring\/offers\/\d+\/decline\/?$/ },
  { method: 'POST',   pattern: /^\/api\/shift-trades\/?$/ },                  // file own trade
  { method: 'POST',   pattern: /^\/api\/shift-trades\/\d+\/accept\/?$/ },     // peer accept
  { method: 'POST',   pattern: /^\/api\/shift-trades\/\d+\/withdraw\/?$/ },   // own withdraw
  { method: 'POST',   pattern: /^\/api\/shift-trades\/\d+\/settle\/?$/ },     // payback settle
  { method: 'POST',   pattern: /^\/api\/leave\/?$/ },                         // own leave request
];

function isAllowlisted(method, path) {
  return COMPANION_WRITE_ALLOWLIST.some(
    (e) => e.method === method && e.pattern.test(path),
  );
}

module.exports = function companionGate(req, res, next) {
  // Only constrains the companion client; everyone else passes untouched.
  if (req.user?.client_kind !== 'companion') return next();

  // Reads are always fine.
  if (READ_METHODS.has(req.method)) return next();

  // Mutating method from a companion → allow only the self-write allowlist.
  if (isAllowlisted(req.method, req.path)) return next();

  return res.status(403).json({
    error: 'This client is read-only.',
    code: 'COMPANION_READ_ONLY',
  });
};
