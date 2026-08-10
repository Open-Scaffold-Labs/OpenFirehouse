'use strict';
/**
 * tests/cronNerisSweepAuth.test.js — the sweep cron's auth GATE.
 *
 * Exists because the gate shipped as a no-op: checkCronAuth returns an object
 * ({ ok, status, error }), the route treated it as a boolean, and an object is
 * always truthy — so an unauthenticated GET ran the sweep on prod (caught by
 * the post-deploy probe, 2026-07-20). A guard that only compiles is not a
 * guard; this test CALLS the route unauthenticated and asserts the refusal.
 */
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

function requestOnce(app, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      http.get({ host: '127.0.0.1', port, path: '/', headers }, (res) => {
        res.resume();
        res.on('end', () => { server.close(); resolve(res.statusCode); });
      }).on('error', (e) => { server.close(); reject(e); });
    });
  });
}

test('sweep cron: wrong/missing bearer is REFUSED when CRON_SECRET is set', async () => {
  process.env.CRON_SECRET = 'test-secret-for-gate';
  delete require.cache[require.resolve('../routes/cronNerisSweep')];
  const app = express();
  app.use('/', require('../routes/cronNerisSweep'));

  assert.equal(await requestOnce(app), 401, 'no header → 401');
  assert.equal(await requestOnce(app, { authorization: 'Bearer wrong' }), 401, 'wrong secret → 401');
  delete process.env.CRON_SECRET;
});
