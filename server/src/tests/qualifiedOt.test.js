// Phase 1.2f — §225 qualified-OT PURE math (no DB). Always runs in CI. The crux the market
// warns about: qualified = the 0.5x HALF-premium of FLSA-required OT only; CBA/policy excluded;
// unclassified never auto-qualifies; dollars only where a regular rate is known.

const { test } = require('node:test');
const assert = require('node:assert');
const { isQualifying, qualifiedOt, aggregateQualified } = require('../utils/qualifiedOt');

test('isQualifying — only FLSA-required OT + comp-cashout of FLSA OT', () => {
  assert.equal(isQualifying('flsa_ot'), true);
  assert.equal(isQualifying('comp_cashout'), true);
  assert.equal(isQualifying('cba_ot'), false);
  assert.equal(isQualifying('other_premium'), false);
  assert.equal(isQualifying(null), false, 'unclassified never qualifies');
  assert.equal(isQualifying('bogus'), false);
});

test('qualifiedOt — HALF-premium (0.5x rate) of FLSA OT; hours-only when no rate', () => {
  assert.deepEqual(qualifiedOt({ earnCode: 'flsa_ot', otHours: 10, regularRate: 30 }),
    { qualifies: true, qualifyingHours: 10, halfPremium: 150 }, '0.5 * 30 * 10 = 150 (NOT the gross 300)');
  assert.deepEqual(qualifiedOt({ earnCode: 'flsa_ot', otHours: 10, regularRate: null }),
    { qualifies: true, qualifyingHours: 10, halfPremium: null }, 'no rate → qualifying hours, dollars deferred to payroll');
  assert.deepEqual(qualifiedOt({ earnCode: 'comp_cashout', otHours: 8, regularRate: 40 }),
    { qualifies: true, qualifyingHours: 8, halfPremium: 160 });
  assert.deepEqual(qualifiedOt({ earnCode: 'cba_ot', otHours: 10, regularRate: 30 }),
    { qualifies: false, qualifyingHours: 0, halfPremium: null }, 'CBA OT does NOT qualify');
  assert.deepEqual(qualifiedOt({ earnCode: 'other_premium', otHours: 12, regularRate: 25 }),
    { qualifies: false, qualifyingHours: 0, halfPremium: null }, 'holiday/callback does NOT qualify');
  assert.deepEqual(qualifiedOt({ earnCode: null, otHours: 10, regularRate: 30 }),
    { qualifies: false, qualifyingHours: 0, halfPremium: null }, 'unclassified never auto-qualifies');
  assert.equal(qualifiedOt({ earnCode: 'flsa_ot', otHours: '7.5', regularRate: '20' }).halfPremium, 75, 'string-safe (0.5*20*7.5)');
});

test('aggregateQualified — YTD sum, partial dollars flag, unclassified surfaced, breakdown', () => {
  const agg = aggregateQualified([
    { earn_code: 'flsa_ot', ot_hours: 10, regular_rate: 30 },   // qualifies, +150
    { earn_code: 'flsa_ot', ot_hours: 5, regular_rate: null },  // qualifies hours, no rate → dollars incomplete
    { earn_code: 'cba_ot', ot_hours: 20, regular_rate: 50 },    // excluded
    { earn_code: 'other_premium', ot_hours: 4 },                // excluded
    { earn_code: null, ot_hours: 6, regular_rate: 30 },         // unclassified → surfaced, not qualified
  ]);
  assert.equal(agg.qualifyingHours, 15, 'qualifying hours = 10 + 5 (FLSA rows only)');
  assert.equal(agg.halfPremiumDollars, 150, 'partial dollars = only the row with a rate');
  assert.equal(agg.dollarsComplete, false, 'a qualifying row lacked a rate → incomplete');
  assert.equal(agg.unclassifiedHours, 6, 'unclassified hours surfaced for a human');
  assert.deepEqual(agg.hoursByEarnCode, { flsa_ot: 15, cba_ot: 20, other_premium: 4, unclassified: 6 });
});

test('aggregateQualified — all rates known → dollarsComplete true', () => {
  const agg = aggregateQualified([
    { earn_code: 'flsa_ot', ot_hours: 10, regular_rate: 30 },
    { earn_code: 'comp_cashout', ot_hours: 4, regular_rate: 40 },
  ]);
  assert.equal(agg.qualifyingHours, 14);
  assert.equal(agg.halfPremiumDollars, 230, '150 + 80');
  assert.equal(agg.dollarsComplete, true);
  assert.equal(agg.unclassifiedHours, 0);
});
