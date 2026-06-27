'use strict';
/**
 * companionGate.test.js — the read-only companion (phone) write-capability gate.
 *
 * Proves: a 'companion' session may READ anything but may WRITE only its own
 * recall/incident response; every other mutation is 403 COMPANION_READ_ONLY.
 * 'command' / absent (legacy) sessions are unaffected. DB-free.
 */
const test = require('node:test');
const assert = require('node:assert');
const companionGate = require('../middleware/companionGate');

function run(client_kind, method, path) {
  let status = null, body = null, nexted = false;
  const req = { method, path, user: client_kind === undefined ? {} : { client_kind } };
  const res = {
    status(s) { status = s; return this; },
    json(b)   { body = b; return this; },
  };
  companionGate(req, res, () => { nexted = true; });
  return { status, body, nexted };
}

test('command sessions are unaffected (every method passes)', () => {
  for (const m of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
    assert.equal(run('command', m, '/api/members/3').nexted, true, m);
  }
});

test('absent/legacy client_kind defaults to command (passes)', () => {
  assert.equal(run(undefined, 'POST', '/api/recall').nexted, true);
  assert.equal(run(undefined, 'DELETE', '/api/members/3').nexted, true);
});

test('companion may READ anything', () => {
  for (const m of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(run('companion', m, '/api/members').nexted, true, m);
    assert.equal(run('companion', m, '/api/cad/alerts').nexted, true, m);
  }
});

test('companion may write ONLY its own recall/incident response + register its push token', () => {
  assert.equal(run('companion', 'POST', '/api/recall/42/respond').nexted, true);
  assert.equal(run('companion', 'POST', '/api/recall/42/respond/').nexted, true); // trailing slash
  assert.equal(run('companion', 'POST', '/api/incidents/7/respond').nexted, true);
  assert.equal(run('companion', 'POST', '/api/push/expo-register').nexted, true);   // receive recalls/dispatch
  assert.equal(run('companion', 'DELETE', '/api/push/expo-register').nexted, true); // unregister on logout
});

test('companion is 403 on every other mutation', () => {
  const blocked = [
    ['POST',   '/api/recall'],                 // issuing a recall (officer)
    ['PATCH',  '/api/recall/42/close'],        // closing a recall (officer)
    ['PATCH',  '/api/units/5/location'],       // the 24/7 apparatus tracker — NOT companion's
    ['POST',   '/api/incidents'],              // creating an incident
    ['DELETE', '/api/members/3'],
    ['PUT',    '/api/apparatus/1'],
    ['POST',   '/api/recall/abc/respond'],     // non-numeric id must not match the allowlist
    ['POST',   '/api/incidents/respond'],      // missing id segment
  ];
  for (const [m, p] of blocked) {
    const r = run('companion', m, p);
    assert.equal(r.status, 403, `${m} ${p}`);
    assert.equal(r.body.code, 'COMPANION_READ_ONLY', `${m} ${p}`);
    assert.equal(r.nexted, false, `${m} ${p}`);
  }
});
