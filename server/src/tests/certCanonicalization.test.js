// tests/certCanonicalization.test.js — Phase 0.4b regression fence.
//
// THE BUG (live in prod until 2026-07-14, in TWO shipped endpoints):
//
//   The web UI's cert dropdown is fed by GET /api/qualifications/cert-types, which
//   serves DISPLAY NAMES ("Firefighter I"). POST /api/qualifications stored that
//   string verbatim into member_qualifications.cert_type.
//
//   Meanwhile apparatus_positions.required_certs stores CODES ("firefighter_1"),
//   and both staffing endpoints (routes/respond.js GET /:id/staffing, and
//   routes/apparatusAssignments.js GET /staffing) canonicalize the REQUIREMENT
//   but indexed the member's HELD certs by their raw column value.
//
//   So the comparison was code-vs-display-name. It could never match. Every
//   certification entered through OpenFirehouse scored as MISSING — a qualified
//   firefighter read as UNQUALIFIED on a life-safety advisory.
//
//   It was invisible in prod only because seed-qualifications.js writes CODES.
//   The seeded data partly worked; a real department's data would not have.
//
// These tests fail if either side of the comparison ever drifts again.

const test   = require('node:test');
const assert = require('node:assert');

const { canonicalizeCert, canonicalCerts, CERTS } = require('../constants/certs');
const { buildMemberCertIndex, scoreSeat } = require('../utils/staffingScore');

test('0.4b — THE REGRESSION: a cert added through the UI scores QUALIFIED', () => {
  // Exactly what the product produces today: the dropdown's display name.
  const heldFromUI = [{ member_id: 1, cert_type: 'Firefighter I', status: 'active', expiry_date: null }];
  // Exactly what a seat template holds: canonical codes, as a JSON string in a
  // TEXT column (which is how apparatus_positions.required_certs is really typed).
  const required = canonicalCerts('["firefighter_1"]');

  const index = buildMemberCertIndex(heldFromUI);
  const score = scoreSeat({
    requiredCerts: required,
    minRank: null,
    member: { rank: 'Firefighter', certs: index.get(1) },
  });

  assert.equal(score.qualification, 'qualified',
    'a firefighter who holds Firefighter I must score QUALIFIED for a seat requiring firefighter_1. ' +
    'Before this fix it scored "partial" (missing cert) — the exact false negative that makes the ' +
    'advisory worse than useless.');
  assert.deepEqual(score.missingCerts, [], 'nothing may be reported missing');
});

test('0.4b — every display name the UI can serve canonicalizes to a real code', () => {
  // The dropdown is CERTS.map(c => c.name). If ANY of them fails to canonicalize,
  // that cert is unscoreable the moment a user picks it.
  const unresolvable = CERTS
    .map((c) => ({ name: c.name, code: canonicalizeCert(c.name) }))
    .filter((x) => x.code === null);

  assert.deepEqual(unresolvable, [],
    `every cert display name must canonicalize. Unresolvable: ${JSON.stringify(unresolvable)}`);
});

test('0.4b — every canonical code round-trips to itself', () => {
  for (const c of CERTS) {
    assert.equal(canonicalizeCert(c.code), c.code, `${c.code} must round-trip`);
  }
});

test('0.4b — the cert values actually sitting in PROD all resolve', () => {
  // Pulled live from prod 2026-07-14:
  //   SELECT DISTINCT cert_type FROM member_qualifications;
  // Historical rows use codes (seeded). Two drifted forms were present. If any of
  // these stops resolving, real members silently lose their qualifications.
  const PROD_CERT_VALUES = [
    'acls', 'cdl_b', 'confined_space_rescue', 'driver_aerial', 'driver_operator',
    'driver_operator_aerial', 'driver_operator_pumper', 'emt_basic', 'evoc',
    'fire_officer_1', 'fire_officer_2', 'firefighter_1', 'firefighter_2',
    'hazmat_ops', 'pals', 'paramedic', 'tech_rescue_operations', 'technical_rescue',
  ];
  const unresolved = PROD_CERT_VALUES.filter((v) => canonicalizeCert(v) === null);
  assert.deepEqual(unresolved, [],
    `every cert value in prod must canonicalize. Unresolved: ${JSON.stringify(unresolved)}`);

  // The four drifted forms must land on their real codes — these are the same
  // qualification under a second name, and treating them as different was
  // producing false negatives.
  assert.equal(canonicalizeCert('driver_aerial'), 'driver_operator_aerial');
  assert.equal(canonicalizeCert('driver_operator'), 'driver_operator_pumper');
  assert.equal(canonicalizeCert('technical_rescue'), 'tech_rescue_operations');
  assert.equal(canonicalizeCert('hazmat_ops'), 'hazmat_operations');
});

test('0.4b — an UNREADABLE cert is surfaced, never silently dropped', () => {
  // Doctrine: never silently discard a life-safety value. If we cannot read a
  // cert we must say so, so the UI can render "1 cert not recognized" rather than
  // scoring the member short for something they may well hold.
  const index = buildMemberCertIndex([
    { member_id: 7, cert_type: 'Firefighter I', status: 'active', expiry_date: null },
    { member_id: 7, cert_type: 'Underwater Basket Weaving', status: 'active', expiry_date: null },
  ]);
  const e = index.get(7);
  assert.ok(e.valid.has('firefighter_1'), 'the readable cert is indexed by code');
  assert.ok(e.unrecognized.has('Underwater Basket Weaving'),
    'the unreadable cert must be SURFACED as unrecognized, not dropped on the floor');
  assert.equal(e.hasAny, true);
});

test('0.4b — an EXPIRED cert is held but not valid (scores partial, not qualified)', () => {
  const index = buildMemberCertIndex([
    { member_id: 3, cert_type: 'Firefighter I', status: 'active', expiry_date: '2020-01-01' },
  ]);
  const score = scoreSeat({
    requiredCerts: canonicalCerts('["firefighter_1"]'),
    minRank: null,
    member: { rank: 'Firefighter', certs: index.get(3) },
  });
  assert.equal(score.qualification, 'partial', 'an expired cert must not satisfy a requirement');
  assert.deepEqual(score.missingCerts, ['firefighter_1']);
});

test('0.4b — NO cert records still reads as "unverified", never "unqualified"', () => {
  // Never downgrade to "short" purely from missing data. This is the D12 rule:
  // an unknown cert is NOT a missing cert.
  const index = buildMemberCertIndex([]);
  const score = scoreSeat({
    requiredCerts: canonicalCerts('["firefighter_1"]'),
    minRank: null,
    member: { rank: 'Firefighter', certs: index.get(99) || { valid: new Set(), hasAny: false } },
  });
  assert.equal(score.qualification, 'unverified',
    'no data must read as UNVERIFIED (we do not know), not as unqualified (we know they lack it)');
});
