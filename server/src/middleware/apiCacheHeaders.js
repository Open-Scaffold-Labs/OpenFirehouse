'use strict';
/**
 * apiCacheHeaders.js — default cache policy for API reads: NOTHING is cacheable
 * unless a route deliberately says so.
 *
 * WHY (2026-07-11): the old app-level default was
 * `private, max-age=30, stale-while-revalidate=60` on every GET /api/*. That let any
 * HTTP cache legally serve operational data up to 30s stale (90s with SWR) — and it
 * did: the iPad client's iOS URL cache served a pre-edit /api/fi-inspections list
 * right after the offline sync queue had PATCHed the server (OpenFirehouseMobile
 * launch-checklist T.7, device-verified). The same exposure existed on the web for
 * every endpoint that hadn't individually opted out — including /api/cad/alerts,
 * where the Realtime "ping → refetch" could legally be answered from browser cache,
 * delaying a NEW dispatch render. Several routes (units, run-list, alerts,
 * apparatus-assignments, hazmat…) had already patched themselves with route-level
 * no-store — evidence the default was wrong, one surface at a time.
 *
 * THE RULE: operational freshness is the default; caching is a deliberate,
 * per-route, reviewed decision. Routes that WANT caching set their own header
 * AFTER this middleware runs and therefore win (express: last set wins) — e.g.
 * streetview (public, max-age=86400; imagery of a fixed address) and mapkit-token
 * (private, max-age=1500; deliberately under the token TTL). A route nobody
 * thought about is safe by default. Do NOT reintroduce a blanket max-age.
 */

/** Express middleware: default `Cache-Control: no-store` on every GET/HEAD /api/* read. */
function apiCacheHeaders(req, res, next) {
  if ((req.method === 'GET' || req.method === 'HEAD') && req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
}

module.exports = apiCacheHeaders;
