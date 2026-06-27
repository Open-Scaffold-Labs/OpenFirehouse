'use strict';
// Step 1/2 — rank-derived notification model unit tests (DB-free).
// Covers the pure functions that decide WHO gets WHICH notifications and HOW the
// cert-oversight scope resolves per rank/member. The DB-backed name queries
// (crewMemberNames/stationMemberNames) + the full authenticated resolver were
// verified by live execution against prod (officer login → certScope 'crew' with
// the exact crew). These tests fence the pure decision logic against regression.
const { test } = require('node:test');
const assert = require('node:assert');
const {
  TIERS, NOTIF_TYPES, DEFAULT_MATRIX, CERT_SCOPE, tierForRole, mergeMatrix, decideCertScope,
} = require('../config/rankNotifications');

// ── tierForRole ──────────────────────────────────────────────────────────────
test('tierForRole maps role level to tier', () => {
  assert.equal(tierForRole('chief', 3), 'command');
  assert.equal(tierForRole('battalion_chief', 3), 'command');
  assert.equal(tierForRole('officer', 2), 'officer');
  assert.equal(tierForRole('lieutenant', 2), 'officer');
  assert.equal(tierForRole('member', 1), 'firefighter');
  // Unknown / level 0 (e.g. unit terminal) falls to firefighter, never crashes.
  assert.equal(tierForRole('unit', 0), 'firefighter');
  assert.equal(tierForRole(undefined, undefined), 'firefighter');
});

// ── DEFAULT_MATRIX shape ─────────────────────────────────────────────────────
test('DEFAULT_MATRIX covers every tier × type and matches the relevance doctrine', () => {
  for (const tier of TIERS) {
    assert.ok(DEFAULT_MATRIX[tier], `missing tier ${tier}`);
    for (const type of NOTIF_TYPES) {
      assert.equal(typeof DEFAULT_MATRIX[tier][type], 'boolean', `${tier}.${type} not boolean`);
    }
  }
  // Everyone gets the safety/operational essentials.
  for (const tier of TIERS) {
    for (const type of ['dispatch', 'training', 'certs', 'bulletins', 'schedule']) {
      assert.equal(DEFAULT_MATRIX[tier][type], true, `${tier} should get ${type}`);
    }
  }
  // maintenance + meetings: officers-and-up only.
  assert.equal(DEFAULT_MATRIX.firefighter.maintenance, false);
  assert.equal(DEFAULT_MATRIX.firefighter.meetings, false);
  assert.equal(DEFAULT_MATRIX.officer.maintenance, true);
  assert.equal(DEFAULT_MATRIX.command.meetings, true);
});

// ── mergeMatrix ──────────────────────────────────────────────────────────────
test('mergeMatrix returns defaults when there are no overrides', () => {
  assert.deepEqual(mergeMatrix([]), DEFAULT_MATRIX);
  assert.deepEqual(mergeMatrix(undefined), DEFAULT_MATRIX);
});

test('mergeMatrix applies only valid overrides and is non-mutating', () => {
  const before = JSON.stringify(DEFAULT_MATRIX);
  const m = mergeMatrix([
    { tier: 'firefighter', notif_type: 'maintenance', enabled: true },  // flip on
    { tier: 'command',     notif_type: 'meetings',    enabled: false }, // flip off
    { tier: 'bogus',       notif_type: 'dispatch',    enabled: false }, // ignored (bad tier)
    { tier: 'officer',     notif_type: 'bogus',       enabled: false }, // ignored (bad type)
  ]);
  assert.equal(m.firefighter.maintenance, true);
  assert.equal(m.command.meetings, false);
  assert.equal(m.officer.dispatch, true);            // untouched
  assert.equal(m.firefighter.meetings, false);       // untouched default
  // defaults object itself was not mutated
  assert.equal(JSON.stringify(DEFAULT_MATRIX), before);
});

test('mergeMatrix coerces enabled to a real boolean', () => {
  const m = mergeMatrix([{ tier: 'firefighter', notif_type: 'meetings', enabled: 1 }]);
  assert.strictEqual(m.firefighter.meetings, true);
});

// ── decideCertScope (the load-bearing per-member branch) ─────────────────────
test('firefighter → own (no member set queried)', () => {
  assert.deepEqual(decideCertScope('firefighter', null, 1), { scope: 'own', source: null });
});

test('command → all (no member set queried)', () => {
  const member = { employment_type: 'career', assigned_unit_id: 3, assigned_group: '4', station_id: 1 };
  assert.deepEqual(decideCertScope('command', member, 1), { scope: 'all', source: null });
});

test('career officer with unit + group → crew (their crew)', () => {
  const member = { employment_type: 'career', assigned_unit_id: 3, assigned_group: '4', station_id: 1 };
  assert.deepEqual(decideCertScope('officer', member, 9), {
    scope: 'crew', source: { kind: 'crew', unitId: 3, group: '4' },
  });
});

test('career officer missing group → station fallback (never crew without both)', () => {
  const member = { employment_type: 'career', assigned_unit_id: 3, assigned_group: null, station_id: 7 };
  assert.deepEqual(decideCertScope('officer', member, 9), {
    scope: 'station', source: { kind: 'station', stationId: 7 },
  });
});

test('volunteer officer → station (member station preferred over JWT fallback)', () => {
  const member = { employment_type: 'volunteer', assigned_unit_id: null, assigned_group: null, station_id: 5 };
  assert.deepEqual(decideCertScope('officer', member, 9), {
    scope: 'station', source: { kind: 'station', stationId: 5 },
  });
});

test('officer with no member row → station via JWT fallback station', () => {
  assert.deepEqual(decideCertScope('officer', null, 9), {
    scope: 'station', source: { kind: 'station', stationId: 9 },
  });
});

test('officer with no member and no resolvable station → station scope, source null (show all, never hide-all)', () => {
  assert.deepEqual(decideCertScope('officer', null, null), { scope: 'station', source: null });
  assert.deepEqual(decideCertScope('officer', null, undefined), { scope: 'station', source: null });
});

test('career officer assigned unit but the rig has no group → station (career data incomplete)', () => {
  // assigned_unit_id set, assigned_group '' (falsy) → not a valid crew key.
  const member = { employment_type: 'career', assigned_unit_id: 3, assigned_group: '', station_id: 2 };
  assert.equal(decideCertScope('officer', member, 9).scope, 'station');
});
