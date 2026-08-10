// Phase 1.2e-c — pure chief leave-bank config helpers. Runs under `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { accrualSummary, methodNeeds, validateBank } = await import('../leaveBankSummary.js');

test('accrualSummary — plain-language rule string', () => {
  assert.equal(
    accrualSummary({ unit: 'hours', accrual_method: 'per_period', accrual_rate: 8, period: 'biweekly', accrual_cap: 480, carryover_cap: 40 }),
    '8h per pay period · max 480h · 40h carryover');
  assert.equal(accrualSummary({ accrual_method: 'none' }), 'No automatic accrual (manual only)');
  assert.match(accrualSummary({ accrual_method: 'annual_grant', accrual_rate: 96, unit: 'hours' }), /96h granted each year/);
  assert.equal(accrualSummary({ accrual_method: 'anniversary', accrual_rate: 1, unit: 'shifts' }), '1 shifts on each work anniversary');
  assert.match(accrualSummary({ accrual_method: 'per_period', accrual_rate: 6, is_flsa_comp: true, accrual_cap: 480 }), /^FLSA comp · /);
  assert.match(accrualSummary({ accrual_method: 'per_period', accrual_rate: 3, tenure_tiers: [{ years: 5, rate: 6 }] }), /tiered by years of service/);
  assert.match(accrualSummary({ accrual_method: 'per_period', accrual_rate: 3, allow_negative: true, negative_floor: -8 }), /may go negative to -8h/);
});

test('methodNeeds — conditional field disclosure by method', () => {
  assert.deepEqual(methodNeeds('per_period'), { rate: true, period: true, tiers: true });
  assert.deepEqual(methodNeeds('annual_grant'), { rate: true, period: false, tiers: true });
  assert.deepEqual(methodNeeds('none'), { rate: false, period: false, tiers: false });
});

test('validateBank — required fields, code shape, cap sanity', () => {
  const ok = { code: 'VAC', name: 'Vacation', accrual_method: 'per_period', accrual_rate: 8, period: 'biweekly' };
  assert.deepEqual(validateBank(ok), []);
  assert.ok(validateBank({ ...ok, code: '' }).some((e) => /Code is required/.test(e)));
  assert.ok(validateBank({ ...ok, code: 'vac-1' }).some((e) => /UPPER_SNAKE/.test(e)));
  assert.ok(validateBank({ ...ok, name: '' }).some((e) => /Name is required/.test(e)));
  assert.ok(validateBank({ ...ok, accrual_rate: 0 }).some((e) => /rate greater than 0/.test(e)));
  assert.ok(validateBank({ ...ok, period: '' }).some((e) => /needs a period/.test(e)));
  assert.ok(validateBank({ ...ok, allow_negative: true, negative_floor: 5 }).some((e) => /0 or below/.test(e)));
  // a manual (none) bank needs only code + name
  assert.deepEqual(validateBank({ code: 'JURY', name: 'Jury Duty', accrual_method: 'none' }), []);
  // a fractional tier year is rejected client-side (server wants integer years)
  assert.ok(validateBank({ ...ok, tenure_tiers: [{ years: 5.5, rate: 6 }] }).some((e) => /whole number/.test(e)));
  assert.ok(validateBank({ ...ok, tenure_tiers: [{ years: 5, rate: -1 }] }).some((e) => /rate must be 0 or more/.test(e)));
  // tiers on a MANUAL bank are ignored (they'll be dropped on save) — no false error
  assert.deepEqual(validateBank({ code: 'X', name: 'X', accrual_method: 'none', tenure_tiers: [{ years: 5.5, rate: 6 }] }), []);
  // an empty tier row is not an error
  assert.deepEqual(validateBank({ ...ok, tenure_tiers: [{ years: '', rate: '' }] }), []);
});
