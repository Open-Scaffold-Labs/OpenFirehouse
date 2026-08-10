'use strict';
/**
 * tests/nerisEntitySearch.test.js — GET /api/departments/:id/neris-entity-search.
 *
 * The route exists so a chief PICKS their department instead of hand-typing an
 * FD######## entity id. The failure that matters isn't "search found nothing" — it
 * is a department's NATIONAL record being written by the wrong party, or our
 * integration being blocked by FSRI for anomalous traffic. So these attack
 * authorization, tenancy, and the outbound blast radius rather than the happy path.
 *
 * Harness follows cronNerisSweepAuth.test.js: a real http server on port 0 and a
 * real request, so express's own query parsing and the rate limiter's header writes
 * are exercised — not stubbed around. Every assertion below breaks if its guard is
 * deleted from routes/departments.js (of-module-hardening §4 / lesson #29: a check
 * that cannot fail verifies nothing).
 */
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const CLIENT_PATH = require.resolve('../utils/nerisClient');

// NOTE: scoped() gates on req.user.stationId (camelCase) and fails CLOSED 401
// without it. A fixture using snake_case station_id would 401 on every case and
// make these tests look like they pass for the wrong reason.
const CHIEF = { id: 1, department_id: 7, stationId: 3, role: 'chief', name: 'Test Chief' };
const MEMBER = { id: 2, department_id: 7, stationId: 3, role: 'member', name: 'Test FF' };

const ENTITY_ROW = {
  neris_id: 'FD34001022',
  name: 'Richland Volunteer Fire Company',
  address_line_1: '876 Main Ave',
  city: 'Vineland',
  state: 'NJ',
  zip_code: '08360 9346',
  department_type: 'FIRE',
  // Fields the picker must NOT pass through to the browser:
  stations: [{ neris_id: 'FD34001022S000' }],
  region_sets: ['whatever'],
  website: 'http://example.invalid',
};

function stubClient(overrides = {}) {
  const stub = {
    isConfigured: () => true,
    request: async () => ({ status: 200, data: { total_count: 1, entities: [ENTITY_ROW] } }),
    ...overrides,
  };
  require.cache[CLIENT_PATH] = {
    id: CLIENT_PATH, filename: CLIENT_PATH, loaded: true, exports: stub,
  };
  return stub;
}

function buildApp(user) {
  delete require.cache[require.resolve('../routes/departments')];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/departments', require('../routes/departments'));
  // Mirror the app's unified error shape: { error, code?, details? }
  app.use((err, _req, res, _next) => {
    res.status(err.status || err.statusCode || 500)
      .json({ error: err.message || 'error', code: err.code, details: err.details });
  });
  return app;
}

function get(app, path) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      http.get({ host: '127.0.0.1', port, path }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          server.close();
          let body = null;
          try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw }; }
          resolve({ status: res.statusCode, body });
        });
      }).on('error', (e) => { server.close(); reject(e); });
    });
  });
}

function restore() {
  delete require.cache[CLIENT_PATH];
  delete require.cache[require.resolve('../routes/departments')];
}

const URL_OK = '/api/departments/7/neris-entity-search?q=Maplewood';

test('a member is refused — department lookup is chief-only', async () => {
  stubClient();
  const res = await get(buildApp(MEMBER), URL_OK);
  assert.ok(res.status === 401 || res.status === 403, `expected 401/403, got ${res.status}`);
  restore();
});

test('a chief cannot search on behalf of ANOTHER department', async () => {
  stubClient();
  const res = await get(buildApp(CHIEF), '/api/departments/8/neris-entity-search?q=Maplewood');
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  restore();
});

test('a caller with no station fails CLOSED (401), never defaults a tenant', async () => {
  stubClient();
  const res = await get(buildApp({ id: 9, department_id: 7, role: 'chief' }), URL_OK);
  assert.equal(res.status, 401);
  restore();
});

test('a 2-character query is refused BEFORE any outbound call to NERIS', async () => {
  let called = 0;
  stubClient({ request: async () => { called += 1; return { status: 200, data: {} }; } });
  const res = await get(buildApp(CHIEF), '/api/departments/7/neris-entity-search?q=Fi');
  assert.equal(res.status, 400);
  assert.equal(called, 0, 'a short query must never reach NERIS');
  restore();
});

test('a missing query is refused', async () => {
  stubClient();
  const res = await get(buildApp(CHIEF), '/api/departments/7/neris-entity-search');
  assert.equal(res.status, 400);
  restore();
});

test('a malformed state code is refused before any outbound call', async () => {
  let called = 0;
  stubClient({ request: async () => { called += 1; return { status: 200, data: {} }; } });
  const res = await get(buildApp(CHIEF), '/api/departments/7/neris-entity-search?q=Maplewood&state=NewJersey');
  assert.equal(res.status, 400);
  assert.equal(called, 0);
  restore();
});

test('the outbound call carries the page cap, the name, and an upper-cased state', async () => {
  let seen = null;
  stubClient({ request: async (_m, p) => { seen = p; return { status: 200, data: { total_count: 0, entities: [] } }; } });
  await get(buildApp(CHIEF), '/api/departments/7/neris-entity-search?q=Maplewood&state=nj');
  assert.match(seen, /page_size=25/, `page cap missing: ${seen}`);
  assert.match(seen, /name=Maplewood/, `name not forwarded: ${seen}`);
  assert.match(seen, /state=NJ/, `state not upper-cased/forwarded: ${seen}`);
  restore();
});

test('the response is whitelisted — stations / region_sets / website never leak', async () => {
  stubClient();
  const res = await get(buildApp(CHIEF), '/api/departments/7/neris-entity-search?q=Richland');
  assert.equal(res.status, 200);
  const row = res.body.data.results[0];
  assert.deepEqual(Object.keys(row).sort(), [
    'address_line_1', 'city', 'department_type', 'name', 'neris_id', 'state', 'zip_code',
  ]);
  restore();
});

test('a row with no neris_id is dropped — an unpickable row must never render', async () => {
  stubClient({ request: async () => ({ status: 200, data: { total_count: 2, entities: [
    { neris_id: null, name: 'Broken' }, { neris_id: 'FD00000001', name: 'Good' },
  ] } }) });
  const res = await get(buildApp(CHIEF), '/api/departments/7/neris-entity-search?q=Anything');
  assert.equal(res.body.data.results.length, 1);
  assert.equal(res.body.data.results[0].neris_id, 'FD00000001');
  restore();
});

test('truncation is reported honestly when NERIS holds more than we show', async () => {
  stubClient({ request: async () => ({ status: 200, data: { total_count: 723, entities: [{ neris_id: 'FD1', name: 'A' }] } }) });
  const res = await get(buildApp(CHIEF), '/api/departments/7/neris-entity-search?q=Fire');
  assert.equal(res.body.data.total, 723);
  assert.equal(res.body.data.truncated, true);
  restore();
});

test('unconfigured credentials degrade to 503 NOT_CONFIGURED, never a crash', async () => {
  stubClient({ isConfigured: () => false });
  const res = await get(buildApp(CHIEF), URL_OK);
  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'NOT_CONFIGURED');
  restore();
});

test('a NERIS refusal (4xx) is REFUSED — not reported as unavailable', async () => {
  stubClient({ request: async () => {
    const e = new Error('neris_refused_422'); e.name = 'NerisRefusedError'; e.status = 422; e.detail = 'nope';
    throw e;
  } });
  const res = await get(buildApp(CHIEF), URL_OK);
  assert.equal(res.status, 502);
  assert.equal(res.body.code, 'NERIS_REFUSED');
  restore();
});

test('NERIS being DOWN is UNAVAILABLE — never a refusal of the chief\'s work', async () => {
  stubClient({ request: async () => {
    const e = new Error('neris_unavailable'); e.name = 'NerisUnavailableError';
    throw e;
  } });
  const res = await get(buildApp(CHIEF), URL_OK);
  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'NERIS_UNAVAILABLE');
  restore();
});

test('an HTML gateway error page is NEVER surfaced as raw markup', () => {
  // Verified live 2026-08-03: the settings panel rendered a full nginx 403 HTML
  // document as its failure text. extractDetail must collapse HTML to its title.
  delete require.cache[CLIENT_PATH];
  const realClient = require('../utils/nerisClient');
  const html = '<html>\n<head><title>403 Forbidden</title></head>\n<body>\n<center><h1>403 Forbidden</h1></center>\n<hr><center>nginx</center>\n</body>\n</html>';
  // extractDetail isn't exported; exercise it through the public error path.
  let captured = null;
  realClient._test.setFetch(async () => ({
    ok: false, status: 403, text: async () => html,
  }));
  realClient._test.resetToken();
  process.env.NERIS_CLIENT_ID = 'test-id';
  process.env.NERIS_CLIENT_SECRET = 'test-secret';
  return realClient.getToken()
    .then(() => { throw new Error('expected the 403 to reject'); })
    .catch((err) => {
      captured = String(err.detail || err.message || '');
      assert.ok(!/<html|<head|<title>|<center|nginx<\/center>/i.test(captured),
        `raw HTML leaked into the error detail: ${captured}`);
      assert.match(captured, /403 Forbidden/, 'the meaningful part (the title) should survive');
    })
    .finally(() => {
      realClient._test.setFetch(null);
      realClient._test.resetToken();
      delete process.env.NERIS_CLIENT_ID;
      delete process.env.NERIS_CLIENT_SECRET;
      delete require.cache[CLIENT_PATH];
    });
});

test('the per-department ceiling fires and caps outbound calls to NERIS', async () => {
  let called = 0;
  stubClient({ request: async () => { called += 1; return { status: 200, data: { total_count: 0, entities: [] } }; } });
  const app = buildApp(CHIEF);   // one app instance = one limiter store
  let limited = 0;
  for (let i = 0; i < 70; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await get(app, URL_OK);
    if (res.status === 429) limited += 1;
  }
  assert.ok(limited > 0, 'expected the 60/15min per-department ceiling to fire inside 70 requests');
  assert.ok(called <= 60, `outbound calls must be capped by the limiter; saw ${called}`);
  restore();
});
