'use strict';
/**
 * webhookAuth.test.js — the central CAD webhook gate fails closed correctly.
 *
 * verifyWebhookSecret reads process.env at call time, so each case sets the
 * env it needs. IS_PROD is captured at module load, so we test the prod vs
 * dev branch by re-requiring the module with a fresh env (via jest-less
 * node:test + delete require.cache).
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const MOD = path.join(__dirname, 'webhookAuth.js');
function freshModule(env) {
  for (const k of ['NODE_ENV', 'VERCEL', 'CAD_WEBHOOK_SECRET']) delete process.env[k];
  Object.assign(process.env, env);
  delete require.cache[require.resolve(MOD)];
  return require(MOD);
}
const reqWith = (opts = {}) => ({ headers: opts.headers || {}, query: opts.query || {} });

// verifyWebhookSecret is async (it first checks per-department connection secrets
// via the DB, then falls back to the global secret). These global-secret cases
// present non-connection secrets, so the per-connection lookup returns null and
// the global-secret path decides — same outcomes as before, now awaited.
test('secret configured: correct header secret passes', async () => {
  const { verifyWebhookSecret } = freshModule({ NODE_ENV: 'production', CAD_WEBHOOK_SECRET: 's3cret' });
  assert.deepEqual(await verifyWebhookSecret(reqWith({ headers: { 'x-cad-webhook-secret': 's3cret' } })), { ok: true });
});

test('secret configured: Bearer and query forms pass', async () => {
  const { verifyWebhookSecret } = freshModule({ NODE_ENV: 'production', CAD_WEBHOOK_SECRET: 's3cret' });
  assert.equal((await verifyWebhookSecret(reqWith({ headers: { authorization: 'Bearer s3cret' } }))).ok, true);
  assert.equal((await verifyWebhookSecret(reqWith({ query: { key: 's3cret' } }))).ok, true);
  assert.equal((await verifyWebhookSecret(reqWith({ query: { secret: 's3cret' } }))).ok, true);
});

test('secret configured: wrong secret -> 401', async () => {
  const { verifyWebhookSecret } = freshModule({ NODE_ENV: 'production', CAD_WEBHOOK_SECRET: 's3cret' });
  const r = await verifyWebhookSecret(reqWith({ headers: { 'x-cad-webhook-secret': 'nope' } }));
  assert.equal(r.ok, false); assert.equal(r.status, 401);
});

test('secret configured: missing secret -> 401', async () => {
  const { verifyWebhookSecret } = freshModule({ NODE_ENV: 'production', CAD_WEBHOOK_SECRET: 's3cret' });
  const r = await verifyWebhookSecret(reqWith({}));
  assert.equal(r.ok, false); assert.equal(r.status, 401);
});

test('secret UNSET + production -> 503 fail closed (the M2 fix)', async () => {
  const { verifyWebhookSecret } = freshModule({ NODE_ENV: 'production' });
  const r = await verifyWebhookSecret(reqWith({}));
  assert.equal(r.ok, false); assert.equal(r.status, 503);
});

test('secret UNSET + VERCEL set (no NODE_ENV) -> 503 fail closed', async () => {
  const { verifyWebhookSecret } = freshModule({ VERCEL: '1' });
  assert.equal((await verifyWebhookSecret(reqWith({}))).status, 503);
});

test('secret UNSET + non-production -> allowed (dev convenience)', async () => {
  const { verifyWebhookSecret } = freshModule({ NODE_ENV: 'test' });
  assert.deepEqual(await verifyWebhookSecret(reqWith({})), { ok: true });
});

// restore a clean env for the rest of the suite
test('cleanup env', () => { freshModule({ NODE_ENV: 'test' }); assert.ok(true); });
