'use strict';
/**
 * permitStatus.test.js — freezes the canonical permit-status axis (Phase 3, module 3.0).
 *
 * WHY THESE TESTS EXIST — the two failure modes they hunt:
 *
 *  1. VOCABULARY DRIFT. Permit status was free text on the server and a hard-coded
 *     literal on the client. The repo has already paid for this exact bug twice: the
 *     inspection-result axis drifted across three surfaces (the iPad once shipped a
 *     'Conditional' that existed nowhere else), and violation status had a dropdown
 *     saying 'Abated' while the resolution logic only recognized 'Corrected'. The
 *     client literal is read FROM DISK here and compared, so drift fails the suite.
 *
 *  2. A GUESSED CONTROL VALUE. `/^pass\b/i` let "Passed" silently defeat a life-safety
 *     control. Nothing may ever pattern-match a permit status, and an unrecognized
 *     status must be REFUSED, never defaulted onto a legal record. Note the deliberate
 *     asymmetry with violationStatus, which fails OPEN to 'Open': there the safe
 *     direction is "still a problem". Here there is no safe direction — guessing
 *     'Active' issues a permit and guessing 'Revoked' destroys one — so we refuse.
 *
 * If any of these goes green by being deleted or weakened, the vocabulary is free
 * text again and the drift returns. Do not weaken them. DB-free.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  PERMIT_STATUSES, IN_FORCE_PERMIT_STATUSES, DEFAULT_PERMIT_STATUS,
  canonicalizePermitStatus, isPermitInForce,
} = require('../constants/permitStatus');

test('canonical set is exactly the eight-state axis, in lifecycle order', () => {
  // 'TerminatedByTransfer' added in 3.1a — IFC §105.3.1 makes a change of occupancy,
  // operation, tenancy or ownership a TERMINATING event that requires a new permit, so it
  // is a distinct end-state, not a flavour of Expired or Revoked.
  //
  // AMENDED in 3.1b (0094), reasoning recorded rather than the list quietly flipped:
  // 'AboutToExpire' and 'Delinquent' are the two phases the documented market places
  // BETWEEN in-force and dead, and both are written only by the scheduled expiry job. The
  // ORDER matters — it is the lifecycle reading order the UI renders, and it is also the
  // argument: grace (Delinquent) sits UPSTREAM of Expired, not after it. If a future
  // session is tempted to move 'Expired' before 'Delinquent', that is the inverse of the
  // only behaviour anyone has documented (spec §0.1).
  assert.deepEqual(PERMIT_STATUSES,
    ['Pending', 'Active', 'AboutToExpire', 'Delinquent', 'Expired', 'Revoked', 'Denied',
     'TerminatedByTransfer']);
  // AMENDED: 'Active' alone is no longer the validity answer — that is the entire point of
  // 0094, and a test still asserting ['Active'] would be enforcing the bug.
  assert.deepEqual(IN_FORCE_PERMIT_STATUSES, ['Active', 'AboutToExpire']);
});

test('the create default is Pending — a created permit has NOT been issued', () => {
  // 3.0 found two disagreeing defaults for one column: the route sent 'Pending',
  // db.js fell back to 'Active'. The answer depended on which caller you came
  // through. If this flips to 'Active', creating a record silently ISSUES a permit.
  assert.equal(DEFAULT_PERMIT_STATUS, 'Pending');
  assert.ok(PERMIT_STATUSES.includes(DEFAULT_PERMIT_STATUS));
  assert.equal(isPermitInForce(DEFAULT_PERMIT_STATUS), false,
    'a Pending permit must NOT read as a valid permit to operate');
});

test('case and whitespace normalize onto the axis', () => {
  const cases = {
    'Pending': 'Pending', 'pending': 'Pending', '  ACTIVE  ': 'Active',
    'active': 'Active', 'Expired': 'Expired', 'revoked': 'Revoked', 'DENIED': 'Denied',
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(canonicalizePermitStatus(input), expected, input);
  }
});

test('ABSENT is null (legal — caller applies its default)', () => {
  for (const empty of [undefined, null, '', '   ']) {
    assert.equal(canonicalizePermitStatus(empty), null, JSON.stringify(empty));
  }
});

test('🔴 UNMAPPABLE is undefined — never guessed onto a legal record', () => {
  // Each of these is a plausible thing a human or a legacy row would supply, and
  // each MUST come back undefined so the route 400s. The near-misses matter most:
  // 'Issued' and 'Approved' read like Active to a person, and mapping them would be
  // us inventing a department's vocabulary for it.
  const unmappable = [
    'Issued', 'Approved', 'Actives', 'Active ✓', 'Void', 'Cancelled', 'Suspended',
    'Terminated', 'Closed', 'Withdrawn', 'Conditional', 'Pending Payment',
    'act', 'expire', 'revoke',
  ];
  for (const raw of unmappable) {
    assert.equal(canonicalizePermitStatus(raw), undefined,
      `"${raw}" must be REFUSED, not mapped — see the header`);
  }
});

test('🔴 non-strings are unmappable, not coerced', () => {
  for (const weird of [42, true, {}, [], () => {}]) {
    assert.equal(canonicalizePermitStatus(weird), undefined, String(weird));
  }
});

test('🔴 nothing pattern-matches: a prefix or substring of a status is NOT that status', () => {
  // The inspectionResult lesson, transplanted. "Active" must not be reachable by
  // anything that merely CONTAINS or STARTS WITH "active".
  for (const raw of ['Active permit', 'active-ish', 'Inactive', 'Reactivated',
                     'Pending review', 'Expired?', 'Not Revoked', 'Denied - appealed']) {
    assert.equal(canonicalizePermitStatus(raw), undefined, raw);
  }
  // and the inverse: 'Inactive' contains 'active' but is emphatically not Active
  assert.notEqual(canonicalizePermitStatus('Inactive'), 'Active');
});

test('validity is exact-match only — Pending/Expired/Revoked/Denied are NOT valid permits', () => {
  assert.equal(isPermitInForce('Active'), true);
  for (const s of ['Pending', 'Expired', 'Revoked', 'Denied', 'active', 'ACTIVE', '', null, undefined]) {
    assert.equal(isPermitInForce(s), false, String(s));
  }
});

test('web client PERMIT_STATUSES is in lockstep with the server canonical list', () => {
  const clientFile = path.join(__dirname, '../../../client/src/data/fireInspections.js');
  const src = fs.readFileSync(clientFile, 'utf8');
  const m = src.match(/export const PERMIT_STATUSES\s*=\s*\[([^\]]*)\]/);
  assert.ok(m, 'PERMIT_STATUSES literal not found in client data file');
  const clientList = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  assert.deepEqual(clientList, PERMIT_STATUSES,
    'client/src/data/fireInspections.js PERMIT_STATUSES must match server constants/permitStatus.js — change both together');
});

/* ───────────────────────────────────────────────────────────────────────────────────────
 * 3.1b — THE FACET FENCE.
 *
 * Module 3.1b inserts two job-written statuses (AboutToExpire, Delinquent — migration
 * 0094) between "in force" and "dead". The moment they land, `status === 'Active'` stops
 * being the test for "is this permit valid", and every reader comparing to a literal
 * becomes wrong SILENTLY — nothing throws, the answer is merely false when it should be
 * true. Fourth instance of this repo's set-vs-literal class (unit status, inspection
 * result, violation status).
 *
 * THE FAILURE MODE THESE TESTS HUNT IS NOT A WRONG FACET — IT IS A FORGOTTEN ONE. A
 * status added to the vocabulary without a facet row must fail the suite, because the
 * derived sets would silently exclude it and every predicate would answer "no" for a
 * status nobody classified.
 * ─────────────────────────────────────────────────────────────────────────────────────── */

const {
  PERMIT_STATUS_FACETS, ISSUED_PERMIT_STATUSES, REVOCABLE_PERMIT_STATUSES,
  TERMINABLE_PERMIT_STATUSES, RENEWABLE_PERMIT_STATUSES, TERMINAL_PERMIT_STATUSES,
  isIssuedPermitStatus, isRevocablePermitStatus, isTerminablePermitStatus,
  isRenewablePermitStatus, isTerminalPermitStatus,
} = require('../constants/permitStatus');

// 'inForce', deliberately not 'valid' — this product renders no verdict on whether a
// business may lawfully operate (Matt, 2026-07-27). inForce is a statement about the
// RECORD: the permit is inside its term. See permitStatus.js's header and 0096.
const FACET_KEYS = ['issued', 'inForce', 'revocable', 'terminable', 'terminal', 'renewable'];

test('FENCE: every status is classified, and every classification is a real status', () => {
  const facetKeys = Object.keys(PERMIT_STATUS_FACETS).sort();
  assert.deepEqual(facetKeys, [...PERMIT_STATUSES].sort(),
    'A status was added to PERMIT_STATUSES without a PERMIT_STATUS_FACETS row (or vice versa). '
    + 'Classify it — an unclassified status is excluded from every derived set and every '
    + 'predicate answers "no" for it, silently.');
});

test('FENCE: every facet row declares every facet, as an actual boolean', () => {
  for (const [status, facets] of Object.entries(PERMIT_STATUS_FACETS)) {
    assert.deepEqual(Object.keys(facets).sort(), [...FACET_KEYS].sort(),
      `${status} is missing or has an extra facet key`);
    for (const k of FACET_KEYS) {
      assert.equal(typeof facets[k], 'boolean',
        `${status}.${k} must be a boolean — a typo'd key reads as undefined, which is falsy, `
        + 'so the status would quietly drop out of that set');
    }
  }
});

test('FENCE: the facet relationships that must hold whatever statuses exist', () => {
  for (const s of PERMIT_STATUSES) {
    const f = PERMIT_STATUS_FACETS[s];
    // A permit cannot be valid to operate on unless it was actually issued.
    if (f.inForce) assert.equal(f.issued, true, `${s}: inForce implies issued`);
    // Revoking or transferring presupposes a live instrument.
    if (f.revocable) assert.equal(f.issued, true, `${s}: revocable implies issued`);
    if (f.terminable) assert.equal(f.issued, true, `${s}: terminable implies issued`);
    // Terminal means the lifecycle is over — nothing further may be done to it.
    if (f.terminal) {
      assert.equal(f.inForce, false, `${s}: terminal cannot be inForce`);
      assert.equal(f.revocable, false, `${s}: terminal cannot be revoked again`);
      assert.equal(f.terminable, false, `${s}: terminal cannot be terminated again`);
      assert.equal(f.renewable, false, `${s}: terminal cannot be renewed`);
    }
  }
});

test('the derived sets contain only real statuses, and the predicates agree with them', () => {
  for (const set of [ISSUED_PERMIT_STATUSES, IN_FORCE_PERMIT_STATUSES, REVOCABLE_PERMIT_STATUSES,
                     TERMINABLE_PERMIT_STATUSES, RENEWABLE_PERMIT_STATUSES,
                     TERMINAL_PERMIT_STATUSES]) {
    for (const s of set) assert.ok(PERMIT_STATUSES.includes(s), `${s} is not a real status`);
  }
  for (const s of PERMIT_STATUSES) {
    const f = PERMIT_STATUS_FACETS[s];
    assert.equal(isIssuedPermitStatus(s), f.issued, s);
    assert.equal(isRevocablePermitStatus(s), f.revocable, s);
    assert.equal(isTerminablePermitStatus(s), f.terminable, s);
    assert.equal(isRenewablePermitStatus(s), f.renewable, s);
  }
});

test('🔴 renewal opens in the notice window and is WITHDRAWN at Expired', () => {
  // AMENDED from "renewal is EMPTY until 3.1b ships the path" now that 0094 is live on prod.
  //
  // This is the finding the market audit got WRONG and a second research pass corrected, so
  // it is asserted rather than commented. The audit graded the renewal window a genuine
  // policy SPLIT between two platforms; it is a status-NAMING difference. Grace and penalty
  // sit UPSTREAM of 'Expired' (one platform's administrator guide tells implementers to run
  // them "before record statuses change to Expired"; a municipal fire department's own
  // operational-permit instructions describe the same 90-day-then-cancel-then-reinstate
  // ladder). 'Expired' is the TRAPDOOR.
  //
  // If 'Expired' ever appears in this set, we have rebuilt the inverse of the only
  // documented behaviour — and a bureau would be renewing instruments that lapsed for good.
  assert.deepEqual(RENEWABLE_PERMIT_STATUSES, ['AboutToExpire', 'Delinquent']);
  assert.equal(isRenewablePermitStatus('Expired'), false,
    'renewal is WITHDRAWN at Expired — the holder files a new application');
  assert.equal(isRenewablePermitStatus('Active'), false,
    'renewal opens in the NOTICE WINDOW, not the moment a permit is issued');
  for (const s of ['Pending', 'Revoked', 'Denied', 'TerminatedByTransfer']) {
    assert.equal(isRenewablePermitStatus(s), false, s);
  }
});

test('🔴 AboutToExpire is VALID — the holder is operating lawfully inside the notice window', () => {
  // The single most consequential row in the facet table. If this ever flips to false, an
  // inspector on site reads a lawful permit as not in force, and the bureau's own register
  // says a compliant business is out of compliance.
  assert.equal(isPermitInForce('AboutToExpire'), true);
  assert.equal(isIssuedPermitStatus('AboutToExpire'), true);
  assert.equal(isRevocablePermitStatus('AboutToExpire'), true,
    'a permit in its notice window is still live enough to revoke on a §105.4 ground');
  assert.equal(isTerminablePermitStatus('AboutToExpire'), true,
    'a transfer during the notice window still terminates and mints a successor');
});

test('Delinquent is past term but still revocable and terminable — it is an OUTSTANDING instrument', () => {
  assert.equal(isRevocablePermitStatus('Delinquent'), true);
  assert.equal(isTerminablePermitStatus('Delinquent'), true);
  assert.equal(isTerminalPermitStatus('Delinquent'), false);
  // Expired, by contrast, is past end-of-grace: nothing further is done TO it, only a new
  // application is done INSTEAD of it.
  assert.equal(isRevocablePermitStatus('Expired'), false);
  assert.equal(isTerminablePermitStatus('Expired'), false);
});

test('Expired is issued and finalized, but NOT terminal — a term ending is not the end of the lifecycle', () => {
  // 3.1b's renewal path reaches back to an expired permit through the supersession spine,
  // so 'terminal' must keep meaning "no further lifecycle", not "no longer valid".
  assert.equal(isIssuedPermitStatus('Expired'), true);
  assert.equal(isTerminalPermitStatus('Expired'), false);
  assert.equal(isPermitInForce('Expired'), false);
});

test('🔴 THIS PRODUCT RENDERS NO LEGAL VERDICT — isPermitInForce takes exactly ONE argument', () => {
  // Matt's ruling, 2026-07-27: "we shouldn't say anything about it being lawful, that's not
  // our job." An earlier draft made it a per-department switch (treatDelinquentAsValid).
  // That LOOKED humble and was not — a configurable legal conclusion is still a legal
  // conclusion, and a department that never opened its settings would have received a
  // verdict it never chose. The only safe number of legal verdicts here is ZERO, and
  // "configurable" is not zero. Column dropped in 0096.
  //
  // Asserted on the ARITY, not just the behaviour: an options bag that silently ignores an
  // unknown key would let the switch creep back in without a single test noticing.
  assert.equal(isPermitInForce.length, 1,
    'isPermitInForce must take only a status — a second argument is how a policy switch '
    + 'gets reintroduced');
  // Delinquent means the TERM ENDED. That is a fact about the record, and it is the whole
  // of what we say. Whether the business may operate is the AHJ's call.
  assert.equal(isPermitInForce('Delinquent'), false);
  assert.equal(isRenewablePermitStatus('Delinquent'), true,
    'and the market DOES answer this one: an in-grace permit is renewable');
  // Extra arguments must change nothing.
  assert.equal(isPermitInForce('Delinquent', { treatDelinquentAsValid: true }), false,
    'no options bag may launder a status into being in force');
});

test('FENCE: the web client FACET TABLE is in lockstep with the server\'s', () => {
  // The client cannot import server constants, so it mirrors the table — and a mirror
  // nobody checks is just a second source of truth waiting to disagree. This reads the
  // client literal FROM DISK, the same fence PERMIT_STATUSES already has.
  //
  // What drift would cost, concretely: the client decides whether to OFFER Revoke and
  // Terminate. If its table says a status is not revocable and the server's says it is,
  // the control silently disappears for a live permit and the operator has no way to
  // know why. That is the "a control whose every use is refused" failure, inverted.
  const clientFile = path.join(__dirname, '../../../client/src/data/fireInspections.js');
  const src = fs.readFileSync(clientFile, 'utf8');
  const m = src.match(/export const PERMIT_STATUS_FACETS\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(m, 'PERMIT_STATUS_FACETS literal not found in client data file');

  const clientFacets = {};
  for (const line of m[1].split('\n')) {
    const row = line.match(/^\s*([A-Za-z]+)\s*:\s*\{(.+)\},?\s*$/);
    if (!row) continue;
    const facets = {};
    for (const pair of row[2].split(',')) {
      // [a-zA-Z], not [a-z]: a lowercase-only class silently truncated `inForce` to `orce`
      // and the mismatch it produced looked like a real drift. A parser that mangles the
      // thing it is comparing will accuse the innocent.
      const kv = pair.match(/([a-zA-Z]+)\s*:\s*(true|false)/);
      if (kv) facets[kv[1]] = kv[2] === 'true';
    }
    clientFacets[row[1]] = facets;
  }

  assert.deepEqual(Object.keys(clientFacets).sort(), Object.keys(PERMIT_STATUS_FACETS).sort(),
    'client PERMIT_STATUS_FACETS rows must match the server\'s — change both together');
  for (const status of Object.keys(PERMIT_STATUS_FACETS)) {
    assert.deepEqual(clientFacets[status], { ...PERMIT_STATUS_FACETS[status] },
      `client facets for ${status} disagree with the server — the client would offer (or hide) `
      + 'an act the server does not');
  }
});

test('FENCE: the web client DEFAULT_PERMIT_STATUS matches the server\'s', () => {
  const clientFile = path.join(__dirname, '../../../client/src/data/fireInspections.js');
  const src = fs.readFileSync(clientFile, 'utf8');
  const m = src.match(/export const DEFAULT_PERMIT_STATUS\s*=\s*'([^']+)'/);
  assert.ok(m, 'DEFAULT_PERMIT_STATUS literal not found in client data file');
  assert.equal(m[1], DEFAULT_PERMIT_STATUS,
    'the create/issue boundary must have ONE spelling on both sides of the wire');
});
