'use strict';
/**
 * errorHandlerDetails.test.js — the unified error schema's `details` channel.
 *
 * THE BUG THIS SUITE EXISTS TO PIN: `errorHandler` used to forward `details` only when it was
 * already an array, and **dropped anything else in silence**. Six call sites passed an object,
 * and for three of them `details` was the ONLY place the user could learn which item was wrong
 * (which property wasn't found · which shifts conflict · why NERIS refused). A response that
 * says "one or more properties were not found" and nothing else is not an error message, it is
 * a shrug.
 *
 * Also pinned: `details` must NOT ride a 5xx. The 5xx message is deliberately genericized so
 * internals cannot reach a client, and forwarding details would have walked past that guard.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { errorHandler, normalizeDetails } = require('../middleware/errorHandler');

// Minimal express res/req doubles — enough to capture status + body.
const mkRes = () => {
  const res = { statusCode: null, body: null, headersSent: false };
  res.status = (s) => { res.statusCode = s; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const mkReq = () => ({ method: 'POST', originalUrl: '/api/test' });
const run = (err) => {
  const res = mkRes();
  errorHandler(err, mkReq(), res, () => {});
  return res;
};
const mkErr = (status, message, code, details) => {
  const e = new Error(message);
  e.status = status; if (code) e.code = code; if (details !== undefined) e.details = details;
  return e;
};

test('an ARRAY of strings passes through unchanged (the documented shape)', () => {
  const res = run(mkErr(422, 'nope', 'X', ['a: 1', 'b: 2']));
  assert.deepEqual(res.body.details, ['a: 1', 'b: 2']);
});

test('🔴 an OBJECT is flattened, not dropped — the six-call-site bug', () => {
  const res = run(mkErr(404, 'One or more properties were not found.', 'PROPERTY_NOT_FOUND',
    { missing: [7, 9] }));
  assert.ok(Array.isArray(res.body.details), 'details must survive as an array');
  // One line per element, so a list reads as a list.
  assert.deepEqual(res.body.details, ['missing: 7', 'missing: 9']);
});

test('an array of OBJECTS (the shift-conflict shape) yields one readable line each', () => {
  const conflicts = [{ date: '2026-09-01', unit: 'E1' }, { date: '2026-09-02', unit: 'L1' }];
  const res = run(mkErr(409, 'Pattern apply conflicts with existing shifts', 'PATTERN_CONFLICTS',
    { conflicts, generatedCount: 14 }));
  assert.equal(res.body.details.length, 3);
  assert.ok(res.body.details[0].startsWith('conflicts: {'));
  assert.ok(res.body.details[0].includes('2026-09-01'), 'the actual conflicting date must survive');
  assert.equal(res.body.details[2], 'generatedCount: 14');
});

test('scalar-valued keys flatten to "key: value"', () => {
  const res = run(mkErr(422, 'Bad shape.', 'BAD', { status: 403, detail: 'Not allowed' }));
  assert.deepEqual(res.body.details, ['status: 403', 'detail: Not allowed']);
});

/**
 * 🔴 THE ONE SITE THIS FIX DOES NOT REACH, pinned so nobody thinks it was covered.
 * `routes/departments.js:414` throws **502** NERIS_REFUSED with `{ status, detail }`. A 502 is a
 * 5xx, so its details are suppressed — and its message is genericized too. So the upstream
 * refusal reason is STILL unavailable to the client, and now for a documented reason rather than
 * silently.
 *
 * The real question is whether that should be a 502 at all: a NERIS refusal usually means the
 * DEPARTMENT has not authorised us yet, which is a client-actionable state, not a server fault
 * — 409/422 would surface both the message and the detail. But the status code is part of a
 * shipped client contract, so changing it is its own change with its own verification, NOT a
 * drive-by inside an error-plumbing fix. Flagged, not silently altered.
 */
test('a 502 with details stays suppressed — departments.js NERIS_REFUSED is NOT fixed by this', () => {
  const res = run(mkErr(502, 'NERIS refused the lookup.', 'NERIS_REFUSED',
    { status: 403, detail: 'Not allowed' }));
  assert.equal(res.body.error, 'Internal server error');
  assert.equal(res.body.details, undefined);
  assert.equal(res.body.code, 'NERIS_REFUSED', 'the machine code still survives, which is the hook a client has');
});

test('🔴 details NEVER ride a 5xx — the genericized message must not be undone', () => {
  const res = run(mkErr(500, 'connection string postgres://user:pw@host/db', 'BOOM',
    { internal: 'postgres://user:pw@host/db' }));
  assert.equal(res.body.error, 'Internal server error');
  assert.equal(res.body.details, undefined, 'a 5xx must carry no details at all');
  // And the leaky message itself must not appear anywhere in the response.
  assert.ok(!JSON.stringify(res.body).includes('postgres://'));
});

test('a 4xx still gets its real message; a 5xx does not', () => {
  assert.equal(run(mkErr(422, 'say this to the officer', 'X')).body.error, 'say this to the officer');
  assert.equal(run(mkErr(503, 'do not say this', 'X')).body.error, 'Internal server error');
});

test('missing, null and empty details produce NO details key (not an empty array)', () => {
  assert.equal(run(mkErr(422, 'x', 'X')).body.details, undefined);
  assert.equal(run(mkErr(422, 'x', 'X', null)).body.details, undefined);
  assert.equal(run(mkErr(422, 'x', 'X', [])).body.details, undefined);
  assert.equal(run(mkErr(422, 'x', 'X', {})).body.details, undefined);
});

test('entries are BOUNDED — a huge payload cannot become the response', () => {
  const huge = { blob: 'x'.repeat(5000) };
  const res = run(mkErr(422, 'x', 'X', huge));
  assert.ok(res.body.details[0].length <= 520, `entry must be capped, got ${res.body.details[0].length}`);

  const many = Array.from({ length: 500 }, (_, i) => `entry ${i}`);
  assert.equal(run(mkErr(422, 'x', 'X', many)).body.details.length, 50);
});

test('an unserializable value degrades to a marker instead of throwing', () => {
  const circular = {}; circular.self = circular;
  const res = run(mkErr(422, 'x', 'X', { circular }));
  assert.equal(res.body.details[0], 'circular: [unserializable]');
});

test('normalizeDetails is exported and total — it never throws on odd input', () => {
  for (const input of [undefined, null, '', 'a string', 0, false, [], {}, [[1]], { a: undefined }]) {
    assert.doesNotThrow(() => normalizeDetails(input), `threw on ${JSON.stringify(input)}`);
  }
  assert.deepEqual(normalizeDetails('a string'), ['a string']);
});

test('headersSent short-circuits to next() rather than double-sending', () => {
  const res = mkRes();
  res.headersSent = true;
  let nexted = false;
  errorHandler(mkErr(500, 'x'), mkReq(), res, () => { nexted = true; });
  assert.equal(nexted, true);
  assert.equal(res.body, null, 'nothing may be written once headers are sent');
});
