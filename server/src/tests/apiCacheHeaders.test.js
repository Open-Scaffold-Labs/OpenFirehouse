'use strict';
/**
 * apiCacheHeaders.test.js — freezes the API cache invariant (2026-07-11).
 *
 * THE INVARIANT: every GET/HEAD under /api/* defaults to `Cache-Control: no-store`.
 * Operational data (dispatch, unit status, incidents, field tools) must never be
 * legally servable from an HTTP cache — a 30s-stale /api/cad/alerts answer to the
 * Realtime ping→refetch, or a pre-edit /api/fi-inspections list right after the
 * mobile sync queue drained (the bug that shipped, device-verified on the iPad),
 * is a life-safety accuracy failure. Caching is a deliberate per-route decision
 * (the route sets its own header AFTER the middleware and wins).
 *
 * If a future change reintroduces a blanket max-age on /api/*, this test fails.
 * DB-free (mirrors companionGate.test.js).
 */
const test = require('node:test');
const assert = require('node:assert');
const apiCacheHeaders = require('../middleware/apiCacheHeaders');

function run(method, path) {
  const headers = {};
  let nexted = false;
  const req = { method, path };
  const res = { set(name, value) { headers[name] = value; return this; } };
  apiCacheHeaders(req, res, () => { nexted = true; });
  return { headers, nexted };
}

test('every GET /api/* read defaults to no-store (operational surfaces named)', () => {
  for (const path of [
    '/api/cad/alerts',            // the dispatch feed — the ping→refetch must never hit cache
    '/api/units/status',          // unit status board
    '/api/units/locations',       // live rig GPS
    '/api/fi-inspections',        // the iPad T.7 incident surface
    '/api/pre-plans',
    '/api/hydrants/nearby',
    '/api/incidents',
    '/api/members',
    '/api/active-board',
    '/api/some-future-endpoint',  // safe-by-default: unknown routes are covered too
  ]) {
    const { headers, nexted } = run('GET', path);
    assert.equal(headers['Cache-Control'], 'no-store', path);
    assert.equal(nexted, true, path);
  }
});

test('HEAD is covered like GET', () => {
  assert.equal(run('HEAD', '/api/cad/alerts').headers['Cache-Control'], 'no-store');
});

test('mutations are left alone (never cached by HTTP anyway; no header noise)', () => {
  for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const { headers, nexted } = run(m, '/api/incidents');
    assert.equal(headers['Cache-Control'], undefined, m);
    assert.equal(nexted, true, m);
  }
});

test('non-API paths are untouched (static assets keep their own caching)', () => {
  for (const path of ['/health', '/', '/assets/index-abc123.js', '/license']) {
    assert.equal(run('GET', path).headers['Cache-Control'], undefined, path);
  }
});

test('a route-level override set after the middleware wins (deliberate caching stays possible)', () => {
  // Express semantics: res.set replaces. The middleware runs first; the route runs after.
  const headers = {};
  const res = { set(n, v) { headers[n] = v; return this; } };
  apiCacheHeaders({ method: 'GET', path: '/api/streetview' }, res, () => {});
  assert.equal(headers['Cache-Control'], 'no-store'); // default applied first…
  res.set('Cache-Control', 'public, max-age=86400');  // …then the route decides deliberately
  assert.equal(headers['Cache-Control'], 'public, max-age=86400');
});
