// Phase 1.2e — pure "My Leave" request-form helpers. Runs under `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { projectedAfter, requestWarning, statusMeta, canSubmitRequest } = await import('../leaveForm.js');

test('projectedAfter — available minus requested hours', () => {
  assert.equal(projectedAfter(40, 8), 32);
  assert.equal(projectedAfter(40, 50), -10);      // can go negative (a soft-warned request)
  assert.equal(projectedAfter(16, 0), 16);
  assert.equal(projectedAfter('28.00', '6'), 22); // string-safe (API numerics)
});

test('requestWarning — soft warning only when hours exceed available (never a block)', () => {
  const w = requestWarning(16, 24, 'Vacation');
  assert.ok(w && w.level === 'warning', 'over-available → warning');
  assert.match(w.message, /8h more/);
  assert.match(w.message, /still submit/);         // it does NOT block — copy says so
  assert.equal(requestWarning(16, 8), null, 'within balance → no warning');
  assert.equal(requestWarning(16, 16), null, 'exactly available → no warning');
  assert.equal(requestWarning(16, 0), null, 'no hours yet → no warning');
});

test('statusMeta — label + semantic key (never color alone)', () => {
  assert.deepEqual(statusMeta('Approved'), { key: 'approved', label: 'Approved', tone: 'green' });
  assert.deepEqual(statusMeta('Denied'),   { key: 'denied',   label: 'Denied',   tone: 'red' });
  assert.equal(statusMeta('Pending').key, 'pending');
  assert.equal(statusMeta(undefined).key, 'pending', 'unknown → pending');
  assert.equal(statusMeta('Cancelled').label, 'Cancelled');
});

test('canSubmitRequest — required fields only (insufficient balance does NOT block)', () => {
  const ok = { leaveTypeId: 3, startDate: '2027-01-01', endDate: '2027-01-01', hours: 8 };
  assert.equal(canSubmitRequest(ok), true);
  assert.equal(canSubmitRequest({ ...ok, leaveTypeId: null }), false, 'no bank → cannot submit');
  assert.equal(canSubmitRequest({ ...ok, hours: 0 }), false, 'zero hours → cannot submit');
  assert.equal(canSubmitRequest({ ...ok, endDate: '' }), false, 'missing end date → cannot submit');
  assert.equal(canSubmitRequest(), false, 'nothing → cannot submit');
});
