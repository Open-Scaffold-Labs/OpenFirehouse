'use strict';
/**
 * cronAuth.test.js — the cron gate fails closed correctly.
 *
 * IS_PROD is captured at module load, so we exercise the prod-vs-dev branch by
 * re-requiring the module with a fresh env (node:test + delete require.cache),
 * mirroring webhookAuth.test.js.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const MOD = path.join(__dirname, 'cronAuth.js');
function freshModule(env) {
  for (const k of ['NODE_ENV', 'VERCEL', 'CRON_SECRET']) delete process.env[k];
  Object.assign(process.env, env);
  delete require.cache[require.resolve(MOD)];
  return require(MOD);
}
const reqWith = (headers = {}) => ({ headers });

test('secret configured: correct Bearer token passes', () => {
  const { checkCronAuth } = freshModule({ NODE_ENV: 'production', CRON_SECRET: 's3cret' });
  assert.deepEqual(checkCronAuth(reqWith({ authorization: 'Bearer s3cret' })), { ok: true });
});

test('secret configured: wrong token -> 401', () => {
  const { checkCronAuth } = freshModule({ NODE_ENV: 'production', CRON_SECRET: 's3cret' });
  const r = checkCronAuth(reqWith({ authorization: 'Bearer nope' }));
  assert.equal(r.ok, false); assert.equal(r.status, 401);
});

test('secret configured: missing header -> 401', () => {
  const { checkCronAuth } = freshModule({ NODE_ENV: 'production', CRON_SECRET: 's3cret' });
  const r = checkCronAuth(reqWith({}));
  assert.equal(r.ok, false); assert.equal(r.status, 401);
});

test('secret UNSET + production -> 503 fail closed (the M3 fix)', () => {
  const { checkCronAuth } = freshModule({ NODE_ENV: 'production' });
  const r = checkCronAuth(reqWith({}));
  assert.equal(r.ok, false); assert.equal(r.status, 503);
});

test('secret UNSET + VERCEL set (no NODE_ENV) -> 503 fail closed', () => {
  const { checkCronAuth } = freshModule({ VERCEL: '1' });
  assert.equal(checkCronAuth(reqWith({})).status, 503);
});

test('secret UNSET + non-production -> allowed (dev convenience)', () => {
  const { checkCronAuth } = freshModule({ NODE_ENV: 'test' });
  assert.deepEqual(checkCronAuth(reqWith({})), { ok: true });
});

// restore a clean env for the rest of the suite
test('cleanup env', () => { freshModule({ NODE_ENV: 'test' }); assert.ok(true); });
