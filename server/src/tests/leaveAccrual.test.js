// Phase 1.2d — accrual engine PURE math (migration 0076 schema; no DB). Always runs (no
// TENANCY_TEST_DB gate) so CI covers the boundary cases where accrual engines actually break:
// tenure-tier selection at the exact anniversary + across a leap year, cap CLAMP (not skip),
// and carryover excess. Every assertion could fail.

const { test } = require('node:test');
const assert = require('node:assert');
const { yearsOfService, selectAccrualRate, clampAccrual, carryoverExcess,
        projectBalance, accrualEventDates } = require('../utils/leaveAccrual');

test('yearsOfService — completed years by calendar math, inclusive at the anniversary', () => {
  assert.equal(yearsOfService('2020-06-01', '2026-05-31'), 5, 'day before anniversary → not yet 6');
  assert.equal(yearsOfService('2020-06-01', '2026-06-01'), 6, 'ON the anniversary → 6 (inclusive)');
  assert.equal(yearsOfService('2020-06-01', '2026-07-01'), 6, 'after anniversary → 6');
  assert.equal(yearsOfService('2026-01-01', '2026-06-01'), 0, 'same year → 0');
  assert.equal(yearsOfService(null, '2026-06-01'), 0, 'no hire date → 0');
});

test('yearsOfService — leap-year anniversary does not drift', () => {
  // Feb-29 hire: in a non-leap year the anniversary effectively falls on Mar 1.
  assert.equal(yearsOfService('2020-02-29', '2025-02-28'), 4, 'Feb 28 (non-leap) is before the Feb 29 anniversary → 4');
  assert.equal(yearsOfService('2020-02-29', '2025-03-01'), 5, 'Mar 1 → anniversary reached → 5');
});

test('selectAccrualRate — highest tier whose threshold <= years; base rate otherwise', () => {
  const tiers = [{ years: 0, rate: 3.08 }, { years: 4, rate: 4.62 }, { years: 8, rate: 6.15 }];
  assert.equal(selectAccrualRate(tiers, 0, 1).rate, 3.08, 'year 0 → first tier');
  assert.equal(selectAccrualRate(tiers, 3, 1).rate, 3.08, 'year 3 → still first tier');
  assert.equal(selectAccrualRate(tiers, 4, 1).rate, 4.62, 'year 4 → steps up (inclusive)');
  assert.equal(selectAccrualRate(tiers, 7, 1).rate, 4.62, 'year 7 → second tier');
  assert.equal(selectAccrualRate(tiers, 8, 1).rate, 6.15, 'year 8 → third tier');
  assert.equal(selectAccrualRate(tiers, 25, 1).rate, 6.15, 'beyond top tier → top tier');
  assert.equal(selectAccrualRate([], 10, 5).rate, 5, 'no tiers → base rate');
  // unsorted tiers must still resolve correctly
  assert.equal(selectAccrualRate([{ years: 8, rate: 6 }, { years: 0, rate: 3 }], 8, 1).rate, 6, 'unsorted tiers ok');
});

test('clampAccrual — credit the portion that fits; never skip, never overshoot', () => {
  assert.equal(clampAccrual(8, 470, 480), 8, '470+8 under 480 cap → full 8');
  assert.equal(clampAccrual(20, 470, 480), 10, '470+20 over cap → clamp to +10 (NOT skip, NOT 20)');
  assert.equal(clampAccrual(8, 480, 480), 0, 'at cap → 0');
  assert.equal(clampAccrual(8, 485, 480), 0, 'over cap → 0 (never negative)');
  assert.equal(clampAccrual(8, 100, null), 8, 'no cap → full amount');
  assert.equal(clampAccrual(-5, 100, 480), 0, 'negative proposed → 0');
});

test('carryoverExcess — forfeit only the amount above the carryover cap', () => {
  assert.equal(carryoverExcess(250, 40), 210, '250 with a 40 carryover cap → forfeit 210');
  assert.equal(carryoverExcess(30, 40), 0, 'under the cap → forfeit nothing');
  assert.equal(carryoverExcess(40, 40), 0, 'exactly at cap → nothing');
  assert.equal(carryoverExcess(100, null), 0, 'no carryover cap → nothing forfeits');
});

// ── #4 accrual projection ("balance as of a future date") ──────────────────────

test('accrualEventDates — biweekly counts every 14 days within (from, to]', () => {
  // 2026-01-01 → 2026-03-01 is 59 days → 4 biweekly events (14,28,42,56).
  const ev = accrualEventDates('per_period', 'biweekly', '2026-01-01', '2026-03-01');
  assert.equal(ev.length, 4, 'four biweekly events in ~2 months');
});

test('accrualEventDates — monthly lands once per month, clamps day-of-month', () => {
  // From Jan 31 → next event Feb 28 (clamped), then Mar 31, Apr 30.
  const ev = accrualEventDates('per_period', 'monthly', '2026-01-31', '2026-04-30');
  assert.equal(ev.length, 3, 'Feb, Mar, Apr');
  assert.equal(ev[0].toISOString().slice(0, 10), '2026-02-28', 'Feb clamps to 28');
});

test('accrualEventDates — annual lands on Jan 1 boundaries after `from`', () => {
  const ev = accrualEventDates('per_period', 'annual', '2026-06-01', '2028-06-01');
  // Jan 1 2027 and Jan 1 2028 fall in the window; Jan 1 2026 is before `from`.
  assert.equal(ev.length, 2, 'two annual boundaries');
});

test('accrualEventDates — anniversary lands on the hire month/day', () => {
  const ev = accrualEventDates('anniversary', null, '2026-01-01', '2027-12-31', '2020-06-15');
  assert.equal(ev.length, 2, 'two anniversaries (2026 + 2027)');
  assert.equal(ev[0].toISOString().slice(0, 10), '2026-06-15', 'on the hire month/day');
});

test('projectBalance — projects biweekly accrual forward, clamped to cap', () => {
  const bank = { accrual_method: 'per_period', accrual_rate: 4, period: 'biweekly', accrual_cap: null, tenure_tiers: [] };
  // 4 events × 4h = +16 on top of 100 → 116.
  const p = projectBalance(bank, { current: 100, hireDate: '2015-01-01', from: '2026-01-01', to: '2026-03-01' });
  assert.equal(p.accrualEvents, 4);
  assert.equal(p.estimatedAccrual, 16);
  assert.equal(p.projected, 116);
  assert.equal(p.projectable, true);
});

test('projectBalance — respects the accrual cap (never overshoots)', () => {
  const bank = { accrual_method: 'per_period', accrual_rate: 4, period: 'biweekly', accrual_cap: 108, tenure_tiers: [] };
  // 100 → +4,+4 = 108 (cap), remaining events add nothing.
  const p = projectBalance(bank, { current: 100, hireDate: '2015-01-01', from: '2026-01-01', to: '2026-03-01' });
  assert.equal(p.projected, 108, 'clamped at the 108 cap');
  assert.equal(p.estimatedAccrual, 8, 'only the 8 that fit under the cap');
});

test('projectBalance — tenure tier can bump the rate across an anniversary in-window', () => {
  const bank = { accrual_method: 'anniversary', accrual_rate: 40, period: null, accrual_cap: null,
    tenure_tiers: [{ years: 0, rate: 40 }, { years: 6, rate: 80 }] };
  // Hire 2020-06-15. Window 2026-01-01 → 2026-12-31: one anniversary (2026-06-15) at which
  // years-of-service = 6 → the 80h tier fires. current 0 → projected 80.
  const p = projectBalance(bank, { current: 0, hireDate: '2020-06-15', from: '2026-01-01', to: '2026-12-31' });
  assert.equal(p.accrualEvents, 1);
  assert.equal(p.projected, 80, 'the 6-year tier rate applies at that anniversary');
});

test('projectBalance — non-projectable banks return the current balance unchanged', () => {
  assert.equal(projectBalance({ accrual_method: 'none', accrual_rate: 0 }, { current: 50, from: '2026-01-01', to: '2027-01-01' }).projected, 50);
  assert.equal(projectBalance({ accrual_method: 'per_hours_worked', accrual_rate: 0.05 }, { current: 50, from: '2026-01-01', to: '2027-01-01' }).projectable, false);
  assert.equal(projectBalance({ accrual_method: 'per_period', accrual_rate: 0, period: 'monthly' }, { current: 50, from: '2026-01-01', to: '2027-01-01' }).projected, 50, 'zero rate → no projection');
});
