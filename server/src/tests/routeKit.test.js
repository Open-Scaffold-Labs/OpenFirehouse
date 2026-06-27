'use strict';
// W3.7 — unified error schema + shared route kit (2026-06-10)
const { test } = require('node:test');
const assert = require('node:assert');
const { scoped, asyncRoute, httpError } = require('../utils/routeKit');
const { errorHandler, notFound } = require('../middleware/errorHandler');

function mockRes() {
  return {
    statusCode: null, body: null, headersSent: false, ended: false,
    status(s) { this.statusCode = s; return this; },
    json(b) { this.body = b; this.headersSent = true; return this; },
    end() { this.ended = true; this.headersSent = true; return this; },
  };
}

test('scoped() fails CLOSED without req.user.stationId (never station 1)', async () => {
  const res = mockRes();
  await scoped(async () => ({ data: 'should not run' }))({ user: undefined }, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'NO_STATION');
});

test('scoped() hands the handler stationId and serializes the return', async () => {
  const res = mockRes();
  await scoped(async ({ stationId }) => ({ data: { got: stationId } }))(
    { user: { stationId: 7 } }, res, () => {}
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { data: { got: 7 } });
});

test('scoped() forwards thrown httpError to next()', async () => {
  const res = mockRes();
  let forwarded = null;
  await scoped(async () => { throw httpError(404, 'Not found', 'NOT_FOUND'); })(
    { user: { stationId: 1 } }, res, (e) => { forwarded = e; }
  );
  assert.equal(forwarded.status, 404);
  assert.equal(forwarded.code, 'NOT_FOUND');
});

test('errorHandler emits the unified schema, hides 5xx internals', () => {
  const res = mockRes();
  errorHandler(new Error('pg: relation secret_table does not exist'), { method: 'GET', originalUrl: '/x' }, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Internal server error'); // internals never leak
  assert.equal(res.body.details, undefined);
});

test('errorHandler passes through intentional client errors with code/details', () => {
  const res = mockRes();
  errorHandler(httpError(400, 'Validation failed', 'VALIDATION_FAILED', ['body.x: required']),
    { method: 'POST', originalUrl: '/x' }, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    error: 'Validation failed', code: 'VALIDATION_FAILED', details: ['body.x: required'],
  });
});

test('notFound emits the unified schema', () => {
  const res = mockRes();
  notFound({}, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Not found', code: 'NOT_FOUND' });
});

test('asyncRoute catches rejections into next()', async () => {
  let forwarded = null;
  await asyncRoute(async () => { throw new Error('boom'); })({}, mockRes(), (e) => { forwarded = e; });
  assert.equal(forwarded.message, 'boom');
});
