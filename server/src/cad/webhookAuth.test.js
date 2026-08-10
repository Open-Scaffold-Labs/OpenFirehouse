'use strict';
/**
 * webhookAuth.test.js — the central CAD webhook gate, 4C.2 contract.
 *
 * The global CAD_WEBHOOK_SECRET is RETIRED; a department's per-connection
 * secret is the only accepted credential. These tests replace the previous
 * global-secret suite, which encoded a contract that no longer exists.
 *
 * The case that matters most is UNAVAILABLE vs INVALID. Per NENA-STA-024
 * §3.3.5.3.1 a sender does nothing on 401 and retries on 503, so collapsing
 * "we could not check the credential" into "the credential is bad" would make a
 * transient database blip permanently discard a live dispatch. The old
 * implementation did exactly that via `catch (_) {}`.
 *
 * db is required lazily inside resolveConnectionBySecret, so we stub it through
 * require.cache — no database needed.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const MOD    = path.join(__dirname, 'webhookAuth.js');
const DB_MOD = path.join(__dirname, '..', 'db.js');

/** Load webhookAuth with db.pool.query stubbed to `impl`. */
function withDb(impl) {
  require.cache[require.resolve(DB_MOD)] = {
    id: require.resolve(DB_MOD),
    filename: require.resolve(DB_MOD),
    loaded: true,
    exports: { pool: { query: impl } },
  };
  delete require.cache[require.resolve(MOD)];
  return require(MOD);
}

function restore() {
  delete require.cache[require.resolve(DB_MOD)];
  delete require.cache[require.resolve(MOD)];
}

const reqWith = (opts = {}) => ({ headers: opts.headers || {}, query: opts.query || {} });

const CONNECTION_ROW = {
  connection_id: 7,
  department_id: 42,
  station_id: 3,
  vendor_id: 'active911',
};

const matchAll   = async () => ({ rows: [CONNECTION_ROW] });
const matchNone  = async () => ({ rows: [] });
const dbDown     = async () => { throw new Error('connection terminated unexpectedly'); };

test('valid connection secret -> ok, resolves the owning department + house', async () => {
  const { verifyWebhookSecret } = withDb(matchAll);
  const r = await verifyWebhookSecret(reqWith({ headers: { 'x-cad-webhook-secret': 'dept-secret' } }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.connection, { id: 7, departmentId: 42, stationId: 3, vendorId: 'active911' });
  restore();
});

test('all three presentation forms are accepted (header, Bearer, query)', async () => {
  const { verifyWebhookSecret } = withDb(matchAll);
  assert.equal((await verifyWebhookSecret(reqWith({ headers: { 'x-cad-webhook-secret': 's' } }))).ok, true);
  assert.equal((await verifyWebhookSecret(reqWith({ headers: { authorization: 'Bearer s' } }))).ok, true);
  assert.equal((await verifyWebhookSecret(reqWith({ query: { key: 's' } }))).ok, true);
  assert.equal((await verifyWebhookSecret(reqWith({ query: { secret: 's' } }))).ok, true);
  restore();
});

test('no credential presented -> 401 (the lookup is never even attempted)', async () => {
  let called = false;
  const { verifyWebhookSecret } = withDb(async () => { called = true; return { rows: [] }; });
  const r = await verifyWebhookSecret(reqWith({}));
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.equal(r.code, 'CAD_NO_CREDENTIAL');
  assert.equal(called, false, 'must not hit the DB when nothing was presented');
  restore();
});

test('unknown secret -> 401 (lookup ran and matched nothing)', async () => {
  const { verifyWebhookSecret } = withDb(matchNone);
  const r = await verifyWebhookSecret(reqWith({ headers: { 'x-cad-webhook-secret': 'nope' } }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.equal(r.code, 'CAD_BAD_CREDENTIAL');
  restore();
});

// ── The one that would have silently lost dispatches ────────────────────────
test('lookup UNAVAILABLE (db down) -> 503, never 401', async () => {
  const { verifyWebhookSecret } = withDb(dbDown);
  const r = await verifyWebhookSecret(reqWith({ headers: { 'x-cad-webhook-secret': 'a-real-secret' } }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 503, 'a DB outage is OUR failure and is the one retryable case');
  assert.equal(r.code, 'CAD_AUTH_UNAVAILABLE');
  restore();
});

test('resolveConnectionBySecret reports the three outcomes distinctly', async () => {
  let m = withDb(matchAll);
  assert.ok((await m.resolveConnectionBySecret('s')).connection, 'match -> connection');
  restore();
  m = withDb(matchNone);
  assert.equal((await m.resolveConnectionBySecret('s')).none, true, 'no match -> none');
  restore();
  m = withDb(dbDown);
  assert.equal((await m.resolveConnectionBySecret('s')).unavailable, true, 'error -> unavailable');
  restore();
});

// ── No environment can produce an unauthenticated pass ──────────────────────
test('there is no unauthenticated path in ANY environment', async () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL };
  for (const env of [{}, { NODE_ENV: 'development' }, { NODE_ENV: 'test' }, { NODE_ENV: 'production' }, { VERCEL: '1' }]) {
    delete process.env.NODE_ENV; delete process.env.VERCEL;
    Object.assign(process.env, env);
    const { verifyWebhookSecret } = withDb(matchNone);
    const r = await verifyWebhookSecret(reqWith({}));
    assert.equal(r.ok, false, `env ${JSON.stringify(env)} must not allow an unauthenticated webhook`);
    restore();
  }
  delete process.env.NODE_ENV; delete process.env.VERCEL;
  if (saved.NODE_ENV) process.env.NODE_ENV = saved.NODE_ENV;
  if (saved.VERCEL) process.env.VERCEL = saved.VERCEL;
});

test('the retired global secret grants nothing', async () => {
  process.env.CAD_WEBHOOK_SECRET = 'legacy-global';
  const { verifyWebhookSecret } = withDb(matchNone);
  const r = await verifyWebhookSecret(reqWith({ headers: { 'x-cad-webhook-secret': 'legacy-global' } }));
  assert.equal(r.ok, false, 'the global secret must no longer authenticate anything');
  assert.equal(r.status, 401);
  delete process.env.CAD_WEBHOOK_SECRET;
  restore();
});
