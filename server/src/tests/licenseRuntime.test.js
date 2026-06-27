'use strict';
/**
 * licenseRuntime.test.js — per-department license runtime guards.
 *
 * The licensing runtime uses the RLS-bypassing service_role key, so its
 * department scoping is the isolation boundary. These tests pin the guards that
 * enforce it — they run BEFORE any Supabase call, so no env is needed.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const rt = require('../lib/licenseRuntime');

test('persistActivation refuses a license with no dept_id (cannot scope)', async () => {
  await assert.rejects(
    () => rt.persistActivation('tok', { jti: 'j', license_id: 'l', dept_id: null }, null),
    /dept_id/,
  );
});

test('loadActivatedJwt returns null when no department is given', async () => {
  assert.strictEqual(await rt.loadActivatedJwt(null), null);
  assert.strictEqual(await rt.loadActivatedJwt(undefined), null);
});

test('clearActivation requires a departmentId', async () => {
  await assert.rejects(() => rt.clearActivation(null), /departmentId/);
  await assert.rejects(() => rt.clearActivation(undefined), /departmentId/);
});

test('verifyOffline rejects an empty token', () => {
  assert.strictEqual(rt.verifyOffline('').ok, false);
  assert.strictEqual(rt.verifyOffline('   ').ok, false);
});
