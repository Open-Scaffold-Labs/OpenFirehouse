'use strict';
/**
 * Unit tests for utils/nerisClient — the ONE NERIS HTTP client.
 * Pure — no DB, no network. fetch is injected via the _test seam.
 *
 * Pins the doctrines:
 *  - refused (4xx, terminal) vs unavailable (5xx/network/timeout, retryable)
 *  - client-credentials mint: HTTP Basic + form body, cached, 60s skew, 401 re-mint once
 *  - no secret ever appears in an error message
 *  - test-env base URL is the DEFAULT; prod requires explicit NERIS_API_BASE
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const client = require('./nerisClient');

const CREDS = { NERIS_CLIENT_ID: 'test-client-id', NERIS_CLIENT_SECRET: 'sup3r-secret-value' };

function withEnv(env, fn) {
  const saved = {};
  for (const k of ['NERIS_CLIENT_ID', 'NERIS_CLIENT_SECRET', 'NERIS_API_BASE']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, env);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      client._test.setFetch(null);
      client._test.resetToken();
    });
}

function jsonResponse(status, body, { text = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (text !== null ? text : (body === undefined ? '' : JSON.stringify(body))),
  };
}

const TOKEN_OK = jsonResponse(200, { access_token: 'tok-1', expires_in: 3600, token_type: 'bearer' });

// ── configuration ────────────────────────────────────────────────────────────

test('missing creds → NerisConfigError, never a fetch', () =>
  withEnv({}, async () => {
    let fetched = false;
    client._test.setFetch(async () => { fetched = true; return TOKEN_OK; });
    await assert.rejects(() => client.getToken(), client.NerisConfigError);
    assert.equal(fetched, false);
    assert.equal(client.isConfigured(), false);
  }));

test('default base is the TEST environment; prod requires explicit env', () =>
  withEnv(CREDS, async () => {
    const urls = [];
    client._test.setFetch(async (url) => { urls.push(url); return TOKEN_OK; });
    await client.getToken();
    assert.ok(urls[0].startsWith(client.NERIS_TEST_BASE), `default base must be test env, got ${urls[0]}`);
    assert.equal(client.NERIS_TEST_BASE, 'https://api-test.neris.fsri.org/v1');
    assert.equal(client.NERIS_PROD_BASE, 'https://api.neris.fsri.org/v1');
  }));

// ── token mint ───────────────────────────────────────────────────────────────

test('token mint: HTTP Basic + form-encoded client_credentials', () =>
  withEnv(CREDS, async () => {
    let captured;
    client._test.setFetch(async (url, options) => { captured = { url, options }; return TOKEN_OK; });
    const tok = await client.getToken();
    assert.equal(tok, 'tok-1');
    assert.ok(captured.url.endsWith('/token'));
    const expectedBasic = 'Basic ' + Buffer.from('test-client-id:sup3r-secret-value').toString('base64');
    assert.equal(captured.options.headers['Authorization'], expectedBasic);
    assert.equal(captured.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(captured.options.body, 'grant_type=client_credentials');
  }));

test('token is cached across calls; not re-minted while fresh', () =>
  withEnv(CREDS, async () => {
    let mints = 0;
    client._test.setFetch(async (url) => {
      if (url.endsWith('/token')) { mints += 1; return TOKEN_OK; }
      return jsonResponse(200, { ok: true });
    });
    await client.getToken();
    await client.getToken();
    await client.request('GET', '/entity/FD51087867');
    assert.equal(mints, 1);
  }));

test('401 → exactly one re-mint + retry; second 401 is a refusal', () =>
  withEnv(CREDS, async () => {
    let mints = 0; let calls = 0;
    client._test.setFetch(async (url) => {
      if (url.endsWith('/token')) { mints += 1; return jsonResponse(200, { access_token: `tok-${mints}`, expires_in: 3600 }); }
      calls += 1;
      return jsonResponse(401, { detail: 'expired' });
    });
    await assert.rejects(
      () => client.request('GET', '/entity/FD51087867'),
      (err) => err instanceof client.NerisRefusedError && err.status === 401
    );
    assert.equal(mints, 2, 'one initial mint + one re-mint');
    assert.equal(calls, 2, 'the request was retried exactly once');
  }));

// ── refused vs unavailable taxonomy ──────────────────────────────────────────

test('422 → NerisRefusedError: terminal, not retryable, carries detail', () =>
  withEnv(CREDS, async () => {
    client._test.setFetch(async (url) => {
      if (url.endsWith('/token')) return TOKEN_OK;
      return jsonResponse(422, { detail: [{ loc: ['body', 'dispatch'], msg: 'field required' }] });
    });
    await assert.rejects(
      () => client.createIncident('FD51087867', {}),
      (err) => err instanceof client.NerisRefusedError
        && err.status === 422 && err.terminal === true && err.retryable === false
        && String(err.detail).includes('field required')
    );
  }));

test('500 → NerisUnavailableError: retryable, never terminal', () =>
  withEnv(CREDS, async () => {
    client._test.setFetch(async (url) => {
      if (url.endsWith('/token')) return TOKEN_OK;
      return jsonResponse(500, undefined, { text: 'Internal Server Error' });
    });
    await assert.rejects(
      () => client.createIncident('FD51087867', {}),
      (err) => err instanceof client.NerisUnavailableError
        && err.status === 500 && err.retryable === true && err.terminal === false
    );
  }));

test('network failure → NerisUnavailableError (retryable)', () =>
  withEnv(CREDS, async () => {
    client._test.setFetch(async () => { throw Object.assign(new Error('socket hang up'), { name: 'FetchError' }); });
    await assert.rejects(
      () => client.getToken(),
      (err) => err instanceof client.NerisUnavailableError && err.retryable === true
    );
  }));

test('204 (validate success) → { status: 204, data: null }', () =>
  withEnv(CREDS, async () => {
    client._test.setFetch(async (url) => {
      if (url.endsWith('/token')) return TOKEN_OK;
      return jsonResponse(204, undefined);
    });
    const res = await client.validateIncident('FD51087867', { base: {} });
    assert.equal(res.status, 204);
    assert.equal(res.data, null);
  }));

// ── secrecy ──────────────────────────────────────────────────────────────────

test('no error message ever contains the client secret', () =>
  withEnv(CREDS, async () => {
    client._test.setFetch(async () => jsonResponse(400, { detail: 'bad request' }));
    const errors = [];
    await client.getToken().catch((e) => errors.push(e));
    client._test.setFetch(async () => { throw new Error('connect failure to host'); });
    client._test.resetToken();
    await client.getToken().catch((e) => errors.push(e));
    assert.ok(errors.length >= 2);
    for (const e of errors) {
      assert.ok(!String(e.message).includes(CREDS.NERIS_CLIENT_SECRET), `secret leaked in: ${e.message}`);
      assert.ok(!String(e.stack || '').includes(CREDS.NERIS_CLIENT_SECRET), 'secret leaked in stack');
    }
  }));

// ── path construction ────────────────────────────────────────────────────────

test('API surface hits the spec paths exactly', () =>
  withEnv(CREDS, async () => {
    const hits = [];
    client._test.setFetch(async (url, options) => {
      if (url.endsWith('/token')) return TOKEN_OK;
      hits.push(`${options.method} ${url.replace(client.NERIS_TEST_BASE, '')}`);
      return jsonResponse(201, { neris_id: 'X', incident_status: {}, version: 1, valid_start: 'now' });
    });
    await client.createIncident('FD51087867', {});
    await client.putIncident('FD51087867', 'FD51087867|inc1|1729023498', {});
    await client.createStation('FD51087867', {});
    await client.createUnit('FD51087867', 'STN1', {});
    assert.deepEqual(hits, [
      'POST /incident/FD51087867',
      'PUT /incident/FD51087867/FD51087867%7Cinc1%7C1729023498',
      'POST /entity/FD51087867/station',
      'POST /entity/FD51087867/station/STN1/unit',
    ]);
  }));
