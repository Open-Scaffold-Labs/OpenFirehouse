'use strict';
// W3.3 — zod validation middleware (2026-06-10)
const { test } = require('node:test');
const assert = require('node:assert');
const { z } = require('zod');
const validate = require('../middleware/validate');

function run(mw, req) {
  let status = null, body = null, nexted = false;
  const res = {
    status(s) { status = s; return this; },
    json(b) { body = b; return this; },
  };
  mw(req, res, () => { nexted = true; });
  return { status, body, nexted, req };
}

test('valid request passes through with parsed data', () => {
  const mw = validate({ query: z.looseObject({ q: z.string().max(10).optional() }) });
  const out = run(mw, { query: { q: 'chlorine', extra: 'kept' } });
  assert.equal(out.nexted, true);
  assert.equal(out.req.query.q, 'chlorine');
  assert.equal(out.req.query.extra, 'kept'); // looseObject keeps unknown keys
});

test('invalid request gets 400 with stable shape', () => {
  const mw = validate({ params: z.object({ un: z.string().regex(/^\d{1,4}$/) }) });
  const out = run(mw, { params: { un: "1'; DROP TABLE x--" } });
  assert.equal(out.nexted, false);
  assert.equal(out.status, 400);
  assert.equal(out.body.error, 'Validation failed');
  assert.ok(Array.isArray(out.body.details));
  assert.match(out.body.details[0], /^params\.un/);
});

test('body schema rejects non-object webhook payloads', () => {
  const mw = validate({ body: z.record(z.string(), z.unknown()) });
  assert.equal(run(mw, { body: { any: 'object' } }).nexted, true);
  assert.equal(run(mw, { body: 'a string' }).status, 400);
  assert.equal(run(mw, { body: 42 }).status, 400);
});

test('hazmat-style schemas accept real-world shapes', () => {
  const guide = z.object({ num: z.string().regex(/^\d{2,3}P?$/i) });
  const material = z.object({ un: z.string().regex(/^(UN|NA)?\s*\d{1,4}$/i) });
  assert.ok(guide.safeParse({ num: '128' }).success);
  assert.ok(guide.safeParse({ num: '128P' }).success);
  assert.equal(guide.safeParse({ num: '<script>' }).success, false);
  assert.ok(material.safeParse({ un: '1017' }).success);
  assert.ok(material.safeParse({ un: 'UN1017' }).success);
  assert.ok(material.safeParse({ un: 'NA 9035' }).success);
  assert.equal(material.safeParse({ un: '1017 OR 1=1' }).success, false);
});
