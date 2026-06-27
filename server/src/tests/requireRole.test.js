'use strict';
/**
 * requireRole.test.js — the level gates fail closed and match the client map.
 */
const test = require('node:test');
const assert = require('node:assert');
const { ROLE_LEVELS, roleLevel, requireOfficer, requireChief } = require('../middleware/requireRole');

function run(mw, role) {
  let status = null, body = null, nexted = false;
  const req = role === undefined ? {} : { user: { role } };
  const res = {
    status(s) { status = s; return this; },
    json(b)   { body = b; return this; },
  };
  mw(req, res, () => { nexted = true; });
  return { status, body, nexted };
}

test('unknown / missing roles fail closed (level 0)', () => {
  assert.equal(roleLevel(undefined), 0);
  assert.equal(roleLevel('Firefighter'), 0); // display labels are NOT keys
  assert.equal(roleLevel('Captain'), 0);
  assert.equal(run(requireOfficer).nexted, false);
  assert.equal(run(requireOfficer, 'Firefighter').status, 403);
  assert.equal(run(requireOfficer, 'Firefighter').body.code, 'FORBIDDEN_ROLE');
});

test('member passes nothing privileged; officer passes officer but not chief', () => {
  assert.equal(run(requireOfficer, 'member').status, 403);
  assert.equal(run(requireChief, 'member').status, 403);
  assert.equal(run(requireOfficer, 'officer').nexted, true);
  assert.equal(run(requireOfficer, 'lieutenant').nexted, true);
  assert.equal(run(requireOfficer, 'dispatch').nexted, true);
  assert.equal(run(requireChief, 'officer').status, 403);
  assert.equal(run(requireChief, 'lieutenant').status, 403);
});

test('chiefs and admin pass everything', () => {
  for (const r of ['chief', 'deputy_chief', 'battalion_chief', 'training_battalion', 'admin']) {
    assert.equal(run(requireOfficer, r).nexted, true, r);
    assert.equal(run(requireChief, r).nexted, true, r);
  }
});

test('level map matches the client taxonomy (lock-step guard)', () => {
  // client/src/data/auth.js ROLES — if you change one, change both.
  assert.deepEqual(
    Object.fromEntries(Object.entries(ROLE_LEVELS).filter(([k]) => k !== 'admin')),
    {
      member: 1,
      lieutenant: 2, officer: 2, training_captain: 2, dispatch: 2,
      battalion_chief: 3, deputy_chief: 3, chief: 3, training_battalion: 3,
    }
  );
});
