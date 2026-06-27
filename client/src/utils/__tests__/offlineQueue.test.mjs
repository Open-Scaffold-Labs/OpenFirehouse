/**
 * W4.4 — offline queue hardening tests (2026-06-10).
 * Runs under plain `node --test` with a localStorage stub.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// localStorage stub before importing the module under test
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { offlineQueue, flushQueue } = await import('../offlineQueue.js');

beforeEach(() => { store.clear(); });

function apiMock(impl) {
  const calls = [];
  const fn = (method) => async (url, body) => {
    calls.push({ method, url, body });
    return impl(method, url, body);
  };
  return { post: fn('POST'), put: fn('PUT'), patch: fn('PATCH'), delete: fn('DELETE'), calls };
}

test('push validates method and url shape (roadmap: "no endpoint validation")', () => {
  assert.equal(offlineQueue.push({ method: 'POST', url: '/api/incidents', body: {} }), true);
  assert.equal(offlineQueue.push({ method: 'GET', url: '/api/incidents' }), false);   // reads aren't queued
  assert.equal(offlineQueue.push({ method: 'POST', url: 'https://evil.com/x' }), false);
  assert.equal(offlineQueue.push({ method: 'POST', url: '/not-api/x' }), false);
  assert.equal(offlineQueue.push({ method: 'FETCH', url: '/api/incidents' }), false);
  assert.equal(offlineQueue.count(), 1);
});

test('flush replays good entries and removes them', async () => {
  offlineQueue.push({ method: 'POST', url: '/api/incidents', body: { a: 1 }, label: 'inc' });
  offlineQueue.push({ method: 'PATCH', url: '/api/units/5', body: { s: 'available' }, label: 'unit' });
  const api = apiMock(async () => ({ ok: true }));
  const r = await flushQueue(api);
  assert.equal(r.replayed, 2);
  assert.equal(r.failed, 0);
  assert.equal(r.dropped, 0);
  assert.equal(offlineQueue.count(), 0);
  assert.equal(api.calls.length, 2);
});

test('permanent 4xx rejections are DROPPED, not retried forever (the roadmap bug)', async () => {
  offlineQueue.push({ method: 'POST', url: '/api/incidents', body: {}, label: 'bad incident' });
  const api = apiMock(async () => { const e = new Error('Validation failed'); e.status = 400; throw e; });
  const r = await flushQueue(api);
  assert.equal(r.dropped, 1);
  assert.deepEqual(r.droppedLabels, ['bad incident']);
  assert.equal(offlineQueue.count(), 0); // gone — never retried again
});

test('transient failures (network/5xx/401) stay queued with attempt count', async () => {
  offlineQueue.push({ method: 'POST', url: '/api/incidents', body: {}, label: 'keep me' });
  const netFail = apiMock(async () => { throw new Error('Failed to fetch'); }); // no status
  let r = await flushQueue(netFail);
  assert.equal(r.failed, 1);
  assert.equal(offlineQueue.count(), 1);
  assert.equal(offlineQueue.getAll()[0].attempts, 1);

  const fiveHundred = apiMock(async () => { const e = new Error('boom'); e.status = 503; throw e; });
  r = await flushQueue(fiveHundred);
  assert.equal(offlineQueue.getAll()[0].attempts, 2);

  const authFail = apiMock(async () => { const e = new Error('expired'); e.status = 401; throw e; });
  r = await flushQueue(authFail);
  assert.equal(offlineQueue.count(), 1); // 401 is transient — re-login fixes it
});

test('entries expire after max attempts', async () => {
  offlineQueue.push({ method: 'POST', url: '/api/incidents', body: {}, label: 'tired' });
  // simulate 10 prior attempts
  const all = offlineQueue.getAll(); all[0].attempts = 10;
  localStorage.setItem('openfirehouse_offline_queue', JSON.stringify(all));
  const api = apiMock(async () => ({ ok: true }));
  const r = await flushQueue(api);
  assert.equal(r.dropped, 1);
  assert.equal(r.replayed, 0); // never even attempted
  assert.equal(offlineQueue.count(), 0);
});

test('entries expire after 72h', async () => {
  offlineQueue.push({ method: 'POST', url: '/api/incidents', body: {}, label: 'ancient' });
  const all = offlineQueue.getAll(); all[0].timestamp = Date.now() - 73 * 3600 * 1000;
  localStorage.setItem('openfirehouse_offline_queue', JSON.stringify(all));
  const r = await flushQueue(apiMock(async () => ({})));
  assert.equal(r.dropped, 1);
  assert.equal(offlineQueue.count(), 0);
});
