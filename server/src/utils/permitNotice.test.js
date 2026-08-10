'use strict';
/**
 * permitNotice.test.js — the notice renderer, pure and DB-free (Phase 3, module 3.1b).
 *
 * These are the assertions that do not need a database, and every one of them is a way the
 * copy could quietly do harm:
 *
 *   1. THE KIND MAP COVERS THE LADDER — a rung with no notice kind notifies nobody, forever,
 *      silently. This is the §6-row-5 failure mode applied to notices.
 *   2. NO LEGAL CONCLUSION — 0096 dropped `treat_delinquent_as_valid` because a configurable
 *      legal conclusion is still a legal conclusion. An automated email is a worse place to
 *      make one than a settings toggle.
 *   3. RENEWABILITY IS READ FROM THE FACET, NEVER A LITERAL — §6 row 4.
 *   4. CONTROL — the renderer actually produces distinct, populated copy. Without this the
 *      refusals above are satisfied by a function returning empty strings.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const {
  NOTICE_KIND_BY_STATUS, NOTICE_KINDS, NOTICE_AUDIENCES,
  graceEndsOn, renderPermitNotice, permitteeEmail,
} = require('./permitNotice');
const { JOB_WRITABLE_STATUSES } = require('./permitLadder');
const { isRenewablePermitStatus } = require('../constants/permitStatus');

const PERMIT = Object.freeze({
  id: 42, permitNumber: 'OCC-2025-100', expiresDate: '2026-08-20',
  notice_window_days: 30, grace_days: 15,
});
const PROPERTY = Object.freeze({ name: 'Harbor Assembly Hall', ownerEmail: 'owner@example.test' });

test('every ladder rung the job can write has a notice kind', () => {
  for (const status of JOB_WRITABLE_STATUSES) {
    assert.ok(NOTICE_KIND_BY_STATUS[status],
      `ladder status "${status}" has no notice kind — that rung would silently never notify`);
  }
  // And the reverse: no orphan kind that no rung produces.
  assert.equal(NOTICE_KINDS.length, JOB_WRITABLE_STATUSES.length,
    'the kind set and the job-writable status set must stay 1:1');
});

test('grace end is derived from the snapshot, and absent when the snapshot is', () => {
  assert.equal(graceEndsOn(PERMIT), '2026-09-04', '2026-08-20 + 15 days');
  assert.equal(graceEndsOn({ expiresDate: '2026-08-20', grace_days: null }), null);
  assert.equal(graceEndsOn({ expiresDate: null, grace_days: 15 }), null);
  assert.equal(graceEndsOn(null), null);
});

test('CONTROL: each kind renders distinct, populated copy for both audiences', () => {
  const seen = new Set();
  for (const [status, kind] of Object.entries(NOTICE_KIND_BY_STATUS)) {
    for (const audience of NOTICE_AUDIENCES) {
      const { subject, body } = renderPermitNotice({
        audience, kind, permit: PERMIT, property: PROPERTY,
        departmentName: 'Harbor Fire', toStatus: status,
      });
      assert.ok(subject.length > 10, `${kind}/${audience} subject is too thin to be real copy`);
      assert.ok(body.length > 40, `${kind}/${audience} body is too thin to be real copy`);
      assert.ok(subject.includes('OCC-2025-100'),
        `${kind}/${audience} subject must name the permit`);
      assert.ok(!/\[SAMPLE|TODO|undefined|null|NaN/.test(subject + body),
        `${kind}/${audience} rendered a placeholder or a broken value into real copy`);
      assert.ok(!seen.has(subject + body), `${kind}/${audience} is a duplicate of another notice`);
      seen.add(subject + body);
    }
  }
  assert.equal(seen.size, NOTICE_KINDS.length * NOTICE_AUDIENCES.length);
});

test('the copy states facts and refuses to state a legal conclusion', () => {
  // The exact sentences 0096 exists to prevent. A notice must never tell a permit holder
  // whether they may lawfully operate — this product does not answer that question.
  const FORBIDDEN = [
    /may not operate/i, /cannot operate/i, /must cease/i, /shall cease/i,
    /unlawful/i, /illegal/i, /you are in violation/i, /shut down/i,
  ];
  for (const [status, kind] of Object.entries(NOTICE_KIND_BY_STATUS)) {
    for (const audience of NOTICE_AUDIENCES) {
      const { subject, body } = renderPermitNotice({
        audience, kind, permit: PERMIT, property: PROPERTY,
        departmentName: 'Harbor Fire', toStatus: status,
      });
      for (const pattern of FORBIDDEN) {
        assert.ok(!pattern.test(subject + body),
          `${kind}/${audience} states a legal conclusion (${pattern}) — 0096's whole point`);
      }
    }
  }
});

test('the renewal sentence follows the status facet, not a hardcoded status name', () => {
  const renderFor = (status) => renderPermitNotice({
    audience: 'permittee', kind: NOTICE_KIND_BY_STATUS[status], permit: PERMIT,
    property: PROPERTY, departmentName: 'Harbor Fire', toStatus: status,
  }).body;

  for (const status of JOB_WRITABLE_STATUSES) {
    const body = renderFor(status);
    if (isRenewablePermitStatus(status)) {
      assert.match(body, /can still be renewed/,
        `${status} is renewable per the facet, so the copy must say so`);
      assert.doesNotMatch(body, /no longer available/,
        `${status} is renewable — the copy must not withdraw renewal`);
    } else {
      assert.match(body, /no longer available/,
        `${status} is NOT renewable per the facet, so the copy must not offer renewal`);
    }
  }
  // Pin the ruling settled 2026-08-01 so a future edit cannot quietly widen it.
  assert.equal(isRenewablePermitStatus('Expired'), false,
    'renewal is withdrawn at Expired — settled 2026-08-01');
});

test('a permit with no grace snapshot still renders, without inventing a date', () => {
  const bare = { id: 7, permitNumber: 'X-1', expiresDate: '2026-08-20', grace_days: null };
  const { body } = renderPermitNotice({
    audience: 'permittee', kind: 'delinquent', permit: bare, property: PROPERTY,
    departmentName: 'Harbor Fire', toStatus: 'Delinquent',
  });
  assert.match(body, /can still be renewed/);
  assert.doesNotMatch(body, /through\s*$|through undefined|through null/,
    'a missing grace date must drop the clause, never render a broken one');
});

test('a permit with no number and a property with no name still render safely', () => {
  const { subject, body } = renderPermitNotice({
    audience: 'permittee', kind: 'about_to_expire',
    permit: { id: 99, expiresDate: '2026-08-20', grace_days: 15 },
    property: {}, departmentName: '', toStatus: 'AboutToExpire',
  });
  assert.match(subject, /#99/, 'falls back to the id rather than printing nothing');
  assert.match(body, /the permitted premises/);
  assert.match(subject, /The fire department/, 'falls back to a neutral department name');
  assert.ok(!/undefined|null|NaN/.test(subject + body));
});

test('permitteeEmail resolves the property owner and is honest about absence', () => {
  assert.equal(permitteeEmail({ ownerEmail: ' owner@example.test ' }), 'owner@example.test');
  assert.equal(permitteeEmail({ ownerEmail: '' }), '');
  assert.equal(permitteeEmail({}), '');
  assert.equal(permitteeEmail(null), '');
});

test('an unknown audience or kind is refused rather than rendered', () => {
  assert.throws(() => renderPermitNotice({
    audience: 'the_press', kind: 'expired', permit: PERMIT, property: PROPERTY,
    departmentName: 'Harbor Fire', toStatus: 'Expired',
  }), /unknown audience/);
  assert.throws(() => renderPermitNotice({
    audience: 'permittee', kind: 'revoked', permit: PERMIT, property: PROPERTY,
    departmentName: 'Harbor Fire', toStatus: 'Expired',
  }), /unknown notice kind/);
});
