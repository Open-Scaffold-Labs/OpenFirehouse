'use strict';
// Phase 3, module 3.2 Slice A — fee engine unit tests (DB-free; pure functions).
//
// Written against spec §1.7 (the five chaining primitives) and §8 F6/F9. The adversarial cases
// come first-class: a refusal is asserted as loudly as a total, because §1.9's audit finding was
// "two permits assessed NO FEE AT ALL" and a $0 that should have been a refusal is the bug.

const { test } = require('node:test');
const assert = require('node:assert');
const {
  computeFees, ERR, parseDec, formatMoney, formatQty, roundHours, SCALE,
} = require('../utils/feeEngine');

// ── helpers ──────────────────────────────────────────────────────────────────────────────
let nextId = 1;
const item = (over = {}) => ({
  id: nextId++, code: `I${nextId}`, name: 'x', kind: 'flat',
  input_variable: null, input_item_id: null, tier_axis_2: null,
  flat_amount: null, hourly_rate: null, minimum_hours: '0',
  rounding_increment_hours: null, rounding_mode: 'up_any_part', after_hours_multiplier: null,
  percent_rate: null, surchargeable: true, min_amount: null, max_amount: null, sort_order: 0,
  ...over,
});
const tier = (item_id, over = {}) => ({
  id: nextId++, item_id, axis1_min: null, axis1_max: null, axis1_match: null,
  axis2_min: null, axis2_max: null, axis2_match: null, amount: '0',
  per_unit: null, unit_size: null, per_unit_basis: null, sort_order: 0, ...over,
});
const mod = (item_id, seq, kind, value, over = {}) => ({
  id: nextId++, item_id, seq, kind, value, per_unit_variable: null, unit_size: null, ...over,
});

// ═════════ the fixed-point core ═════════════════════════════════════════════════════════

test('parseDec is exact and never routes decimals through a float', () => {
  assert.equal(parseDec('150.00'), 150n * SCALE);
  assert.equal(parseDec('0.0001'), 100000n);
  assert.equal(parseDec('-5.25'), -5250000000n);
  assert.equal(parseDec(3), 3n * SCALE);
  // refusals, not zeros
  assert.equal(parseDec('abc'), null);
  assert.equal(parseDec(''), null);
  assert.equal(parseDec(null), null);
  assert.equal(parseDec('1.2.3'), null);
});

test('cent rounding is half-away-from-zero — and DIVERGES from float toFixed at the tie', () => {
  // These two assertions are the reason this engine is BigInt. IEEE-754 cannot store 1.005 or
  // 1.015, so the stored double is a hair BELOW the tie and toFixed rounds DOWN. Deterministic
  // across engines, and exactly the "errors in BOTH directions" signature of the §1.9 audit.
  assert.equal((1.005).toFixed(2), '1.00');
  assert.equal((1.015).toFixed(2), '1.01');
  // The engine gets the arithmetically correct answer instead.
  assert.equal(formatMoney(parseDec('1.005')), '1.01');
  assert.equal(formatMoney(parseDec('1.015')), '1.02');
  assert.equal(formatMoney(parseDec('2.675')), '2.68');   // the other textbook float case
  assert.equal((2.675).toFixed(2), '2.67');
});

test('roundHours implements "or part thereof" as well as nearest and down', () => {
  const q = parseDec('0.25');
  assert.equal(formatQty(roundHours(parseDec('2.1'), q, 'up_any_part')), '2.25');
  assert.equal(formatQty(roundHours(parseDec('2.25'), q, 'up_any_part')), '2.25'); // exact: no bump
  assert.equal(formatQty(roundHours(parseDec('2.26'), q, 'up_any_part')), '2.5');
  assert.equal(formatQty(roundHours(parseDec('2.1'), q, 'nearest')), '2');
  assert.equal(formatQty(roundHours(parseDec('2.2'), q, 'nearest')), '2.25');
  assert.equal(formatQty(roundHours(parseDec('2.99'), q, 'down')), '2.75');
  assert.equal(formatQty(roundHours(parseDec('2.1'), q, 'none')), '2.1');
  assert.equal(roundHours(parseDec('2.1'), q, 'sideways'), null); // unknown mode → sentinel
});

// ═════════ the primitives ═══════════════════════════════════════════════════════════════

test('flat: the one-amount case (71 of 73 operational types in one county)', () => {
  const a = item({ code: 'OP', kind: 'flat', flat_amount: '150.00' });
  const r = computeFees({ items: [a] });
  assert.equal(r.ok, true);
  assert.equal(r.total, '150.00');
  assert.equal(r.lines[0].amount, '150.00');
});

test('hourly supports BOTH mechanisms at once — minimum-hours floor AND after-hours multiplier', () => {
  const h = item({
    code: 'AH', kind: 'hourly', hourly_rate: '200.00', minimum_hours: '3',
    rounding_increment_hours: '0.25', rounding_mode: 'up_any_part', after_hours_multiplier: '1.50',
  });
  // 2.1h → rounds up to 2.25 → floor lifts to 3 → x$200 = $600 → x1.5 after hours = $900
  const after = computeFees({ items: [h], inputs: { hours: '2.1' }, afterHours: true });
  assert.equal(after.ok, true);
  assert.equal(after.total, '900.00');
  // The SAME schedule, in hours: the multiplier must not apply.
  const during = computeFees({ items: [h], inputs: { hours: '2.1' }, afterHours: false });
  assert.equal(during.total, '600.00');
  // And the floor must NOT fire when the rounded hours already exceed it.
  const long = computeFees({ items: [h], inputs: { hours: '5.1' }, afterHours: false });
  assert.equal(long.total, '1050.00');   // 5.25h x 200
});

test('hourly: a floor-only jurisdiction (no multiplier) is expressible', () => {
  const h = item({ code: 'MIN2', kind: 'hourly', hourly_rate: '97.00', minimum_hours: '2', rounding_mode: 'none' });
  const r = computeFees({ items: [h], inputs: { hours: '0.5' }, afterHours: true });
  assert.equal(r.total, '194.00');   // floor to 2h; no multiplier exists to apply
});

test('tiered: half-open ranges mean no boundary is owned by two tiers', () => {
  const t = item({ code: 'SQ', kind: 'tiered', input_variable: 'square_footage' });
  const rows = [
    tier(t.id, { axis1_min: '0', axis1_max: '5000', amount: '100.00', sort_order: 1 }),
    tier(t.id, { axis1_min: '5000', axis1_max: '10000', amount: '250.00', sort_order: 2 }),
  ];
  assert.equal(computeFees({ items: [t], tiers: rows, inputs: { square_footage: 4999 } }).total, '100.00');
  assert.equal(computeFees({ items: [t], tiers: rows, inputs: { square_footage: 5000 } }).total, '250.00');
  assert.equal(computeFees({ items: [t], tiers: rows, inputs: { square_footage: 9999 } }).total, '250.00');
});

test('tiered 2-D matrix: occupancy group x square footage, categorical axis matched EXACTLY', () => {
  const t = item({ code: 'MX', kind: 'tiered', input_variable: 'square_footage', tier_axis_2: 'occupancy_group' });
  const rows = [
    tier(t.id, { axis1_min: '0', axis1_max: '5000', axis2_match: 'A-2', amount: '400.00', sort_order: 1 }),
    tier(t.id, { axis1_min: '0', axis1_max: '5000', axis2_match: 'B', amount: '150.00', sort_order: 2 }),
  ];
  assert.equal(computeFees({ items: [t], tiers: rows, inputs: { square_footage: 3000, occupancy_group: 'A-2' } }).total, '400.00');
  assert.equal(computeFees({ items: [t], tiers: rows, inputs: { square_footage: 3000, occupancy_group: 'B' } }).total, '150.00');
  // F6: near-miss values are REJECTED, never coerced. 'a-2' is not 'A-2'.
  const near = computeFees({ items: [t], tiers: rows, inputs: { square_footage: 3000, occupancy_group: 'a-2' } });
  assert.equal(near.ok, false);
  assert.equal(near.errors[0].code, ERR.NO_TIER_MATCH);
});

test('🔴 per_unit basis: the SAME tier text is $370 or $295 depending on the stated basis', () => {
  const mk = (basis) => {
    const t = item({ code: 'PU', kind: 'tiered', input_variable: 'square_footage' });
    return [t, [tier(t.id, { axis1_min: '5000', axis1_max: null, amount: '250.00',
      per_unit: '15.00', unit_size: '1000', per_unit_basis: basis })]];
  };
  // "$250, plus $15 per 1,000 sq ft" on a 7,200 sq ft building:
  const [tw, rw] = mk('whole_quantity');
  const whole = computeFees({ items: [tw], tiers: rw, inputs: { square_footage: 7200 } });
  assert.equal(whole.total, '370.00');   // all 7,200 → 8 units × $15
  assert.equal(whole.lines[0].steps.find((s) => s.op === 'per_unit').units, '8');

  const [te, re] = mk('excess_above_floor');
  const excess = computeFees({ items: [te], tiers: re, inputs: { square_footage: 7200 } });
  assert.equal(excess.total, '295.00');  // only the 2,200 above 5,000 → 3 units × $15
  assert.equal(excess.lines[0].steps.find((s) => s.op === 'per_unit').units, '3');

  // $75 apart on one permit — which is why the schedule has to say, and why the breakdown
  // records which reading produced the number.
  assert.equal(excess.lines[0].steps.find((s) => s.op === 'per_unit').perUnitBasis, 'excess_above_floor');
  assert.equal(whole.lines[0].steps.find((s) => s.op === 'per_unit').perUnitBasis, 'whole_quantity');

  // At the floor exactly: excess charges nothing extra, whole charges for all 5,000.
  assert.equal(computeFees({ items: [te], tiers: re, inputs: { square_footage: 5000 } }).total, '250.00');
  assert.equal(computeFees({ items: [tw], tiers: rw, inputs: { square_footage: 5000 } }).total, '325.00');
});

test('🔴 a per-unit rate with NO stated basis is REFUSED, never guessed', () => {
  const t = item({ code: 'PU', kind: 'tiered', input_variable: 'square_footage' });
  const rows = [tier(t.id, { axis1_min: '5000', axis1_max: null, amount: '250.00',
    per_unit: '15.00', unit_size: '1000', per_unit_basis: null })];
  const r = computeFees({ items: [t], tiers: rows, inputs: { square_footage: 7200 } });
  assert.equal(r.ok, false, 'the engine must not pick a reading on the schedule\'s behalf');
  assert.equal(r.errors[0].code, ERR.MISSING_PARAM);
  assert.ok(r.errors[0].message.includes('per_unit_basis'));
  // An unrecognised basis is refused too — not silently treated as one of the two.
  const bogus = computeFees({ items: [t],
    tiers: [tier(t.id, { axis1_min: '5000', amount: '250.00', per_unit: '15.00', unit_size: '1000', per_unit_basis: 'vibes' })],
    inputs: { square_footage: 7200 } });
  assert.equal(bogus.ok, false);
});

test('percent_of takes a percentage of ONE named item, at cent precision', () => {
  const base = item({ code: 'BLD', kind: 'flat', flat_amount: '1000.50', sort_order: 1 });
  const pct = item({ code: 'FIRE', kind: 'percent_of', percent_rate: '25.0000', input_item_id: base.id, sort_order: 2 });
  const r = computeFees({ items: [base, pct] });
  assert.equal(r.ok, true);
  // 25% of 1000.50 = 250.125 → half-up → 250.13.  (250.125 is not float-representable.)
  assert.equal(r.lines.find((l) => l.code === 'FIRE').amount, '250.13');
  assert.equal(r.total, '1250.63');
});

// ═════════ the surchargeable flag — §1.7's per-fee-line applicability ═══════════════════

test('surcharge sums ONLY surchargeable lines — the "N/A on hourly and appeal lines" city', () => {
  const permit = item({ code: 'PERMIT', kind: 'flat', flat_amount: '200.00', surchargeable: true, sort_order: 1 });
  const hourly = item({ code: 'HOURLY', kind: 'hourly', hourly_rate: '100.00', rounding_mode: 'none', surchargeable: false, sort_order: 2 });
  const it3 = item({ code: 'ITFEE', kind: 'surcharge', percent_rate: '3.0000', surchargeable: false, sort_order: 3 });
  const r = computeFees({ items: [permit, hourly, it3], inputs: { hours: '1' } });
  assert.equal(r.ok, true);
  const sur = r.lines.find((l) => l.code === 'ITFEE');
  // 3% of 200.00 only — NOT of 300.00. A flat "% of invoice total" would give 9.00 and be wrong.
  assert.equal(sur.amount, '6.00');
  const step = sur.steps.find((s) => s.op === 'surcharge');
  assert.deepEqual(step.includedCodes, ['PERMIT']);
  assert.equal(r.total, '306.00');
});

test('a department with no surcharge item is unaffected by the flag', () => {
  const a = item({ code: 'A', kind: 'flat', flat_amount: '75.00' });
  assert.equal(computeFees({ items: [a] }).total, '75.00');
});

// ═════════ the documented chains of §1.7 ════════════════════════════════════════════════

test('CHAIN: square footage → valuation → building permit fee → 25% of it', () => {
  const val = item({ code: 'VAL', kind: 'valuation', input_variable: 'square_footage', sort_order: 1 });
  const bld = item({ code: 'BLD', kind: 'valuation', input_item_id: val.id, sort_order: 2 });
  const fire = item({ code: 'FIRE', kind: 'percent_of', percent_rate: '25.0000', input_item_id: bld.id, sort_order: 3 });
  const tiers = [
    // leg 1: sq ft → an estimated construction valuation, in dollars
    tier(val.id, { axis1_min: '0', axis1_max: '10000', amount: '0', per_unit: '120.00', unit_size: '1',
                   per_unit_basis: 'whole_quantity', sort_order: 1 }),
    // leg 2: a table keyed on VALUATION DOLLARS — the value leg 1 produced, not an input
    tier(bld.id, { axis1_min: '0', axis1_max: '500000', amount: '2000.00', sort_order: 1 }),
    tier(bld.id, { axis1_min: '500000', axis1_max: null, amount: '5000.00', sort_order: 2 }),
  ];
  // 5,000 sq ft x $120 = $600,000 valuation → lands in the upper band → $5,000 → fire = $1,250
  const r = computeFees({ items: [val, bld, fire], tiers, inputs: { square_footage: 5000 } });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.lines.find((l) => l.code === 'VAL').amount, '600000.00');
  assert.equal(r.lines.find((l) => l.code === 'BLD').amount, '5000.00');
  assert.equal(r.lines.find((l) => l.code === 'FIRE').amount, '1250.00');
  // Leg 2 must record that its axis came from a chained item, not from an input.
  assert.ok(r.lines.find((l) => l.code === 'BLD').steps.some((s) => s.op === 'axis_from_item'));
  // And the boundary really is load-bearing: 4,000 sq ft = $480,000 → the LOWER band.
  const small = computeFees({ items: [val, bld, fire], tiers, inputs: { square_footage: 4000 } });
  assert.equal(small.lines.find((l) => l.code === 'BLD').amount, '2000.00');
  assert.equal(small.lines.find((l) => l.code === 'FIRE').amount, '500.00');
});

test('CHAIN: base hours → hourly rate → "plus 50%" → "+$10 per bed", and seq is load-bearing', () => {
  const h = item({ code: 'H', kind: 'hourly', hourly_rate: '200.00', rounding_mode: 'none' });
  const mods = [
    mod(h.id, 1, 'percent_add', '50'),
    mod(h.id, 2, 'per_unit_add', '10.00', { per_unit_variable: 'licensed_beds', unit_size: '1' }),
  ];
  // 2h x 200 = 400 → +50% = 600 → +$10 x 40 beds = 1000
  const r = computeFees({ items: [h], modifiers: mods, inputs: { hours: '2', licensed_beds: 40 } });
  assert.equal(r.ok, true);
  assert.equal(r.total, '1000.00');

  // Reversed order is DIFFERENT money — which is why these are ordered rows, not columns.
  const reversed = [
    mod(h.id, 1, 'per_unit_add', '10.00', { per_unit_variable: 'licensed_beds', unit_size: '1' }),
    mod(h.id, 2, 'percent_add', '50'),
  ];
  const r2 = computeFees({ items: [h], modifiers: reversed, inputs: { hours: '2', licensed_beds: 40 } });
  assert.equal(r2.total, '1200.00');   // (400 + 400) x 1.5
  assert.notEqual(r.total, r2.total);
});

test('CHAIN REFUSED: an hourly item fed from another item (valuation → hours of credit)', () => {
  const val = item({ code: 'VAL', kind: 'flat', flat_amount: '600000.00', sort_order: 1 });
  const h = item({ code: 'CREDIT', kind: 'hourly', hourly_rate: '200.00', input_item_id: val.id, sort_order: 2 });
  const r = computeFees({ items: [val, h], inputs: { hours: '4' } });
  // Critically: it must NOT quietly bill the 4 supplied hours and return a confident number.
  assert.equal(r.ok, false);
  assert.equal(r.total, null);
  assert.equal(r.errors[0].code, ERR.UNSUPPORTED_CHAIN);
});

// ═════════ refusals — a $0 is never a fallback ══════════════════════════════════════════

test('a missing input is a REFUSAL, not a zero (the "no fee at all" audit finding)', () => {
  const t = item({ code: 'SQ', kind: 'tiered', input_variable: 'square_footage' });
  const rows = [tier(t.id, { axis1_min: '0', axis1_max: '5000', amount: '100.00' })];
  const r = computeFees({ items: [t], tiers: rows, inputs: {} });
  assert.equal(r.ok, false);
  assert.equal(r.total, null);
  assert.equal(r.errors[0].code, ERR.MISSING_INPUT);
  assert.equal(r.errors[0].variable, 'square_footage');
});

test('an unmatched tier is a REFUSAL — a gap in the adopted schedule needs a human', () => {
  const t = item({ code: 'SQ', kind: 'tiered', input_variable: 'square_footage' });
  const rows = [tier(t.id, { axis1_min: '0', axis1_max: '5000', amount: '100.00' })];
  const r = computeFees({ items: [t], tiers: rows, inputs: { square_footage: 900000 } });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, ERR.NO_TIER_MATCH);
});

test('an unknown axis or kind is refused before any arithmetic happens (F9)', () => {
  const bad = item({ code: 'DOGS', kind: 'tiered', input_variable: 'number_of_dogs' });
  const r = computeFees({ items: [bad], inputs: { number_of_dogs: 3 } });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, ERR.UNKNOWN_VARIABLE);

  const badKind = computeFees({ items: [item({ code: 'K', kind: 'vibes' })] });
  assert.equal(badKind.ok, false);
  assert.equal(badKind.errors[0].code, ERR.UNKNOWN_KIND);
});

test('non-numeric and negative inputs are refused, not coerced', () => {
  const t = item({ code: 'SQ', kind: 'tiered', input_variable: 'square_footage' });
  const rows = [tier(t.id, { axis1_min: '0', axis1_max: '5000', amount: '100.00' })];
  assert.equal(computeFees({ items: [t], tiers: rows, inputs: { square_footage: 'big' } }).errors[0].code, ERR.BAD_INPUT);
  assert.equal(computeFees({ items: [t], tiers: rows, inputs: { square_footage: -5 } }).errors[0].code, ERR.BAD_INPUT);
});

test('a dependency cycle is detected and NAMED, not run forever', () => {
  const a = item({ code: 'A', kind: 'percent_of', percent_rate: '50' });
  const b = item({ code: 'B', kind: 'percent_of', percent_rate: '50' });
  a.input_item_id = b.id;
  b.input_item_id = a.id;
  const r = computeFees({ items: [a, b] });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, ERR.CYCLE);
  assert.ok(r.errors[0].cycle.includes('A') && r.errors[0].cycle.includes('B'));
});

test('every error is collected, not just the first — one pass surfaces the whole broken schedule', () => {
  const a = item({ code: 'A', kind: 'tiered', input_variable: 'square_footage', sort_order: 1 });
  const b = item({ code: 'B', kind: 'tiered', input_variable: 'occupant_load', sort_order: 2 });
  const rows = [
    tier(a.id, { axis1_min: '0', axis1_max: '10', amount: '1.00' }),
    tier(b.id, { axis1_min: '0', axis1_max: '10', amount: '1.00' }),
  ];
  const r = computeFees({ items: [a, b], tiers: rows, inputs: {} });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
  assert.deepEqual(r.errors.map((e) => e.variable).sort(), ['occupant_load', 'square_footage']);
});

// ═════════ clamps, and the audit trail ══════════════════════════════════════════════════

test('min_amount and max_amount clamp, and the clamp is recorded in the trace', () => {
  const lo = item({ code: 'LO', kind: 'flat', flat_amount: '5.00', min_amount: '50.00' });
  const rLo = computeFees({ items: [lo] });
  assert.equal(rLo.total, '50.00');
  assert.ok(rLo.lines[0].steps.some((s) => s.op === 'min_amount'));

  const hi = item({ code: 'HI', kind: 'flat', flat_amount: '5000.00', max_amount: '1000.00' });
  const rHi = computeFees({ items: [hi] });
  assert.equal(rHi.total, '1000.00');
  assert.ok(rHi.lines[0].steps.some((s) => s.op === 'max_amount'));
});

test('the breakdown reproduces the arithmetic line by line (the auditable-total requirement)', () => {
  const h = item({ code: 'H', kind: 'hourly', hourly_rate: '200.00', minimum_hours: '3', rounding_increment_hours: '0.25', after_hours_multiplier: '2.00' });
  const r = computeFees({ items: [h], inputs: { hours: '2.1' }, afterHours: true });
  const ops = r.lines[0].steps.map((s) => s.op);
  assert.deepEqual(ops, ['hours', 'minimum_hours', 'hours_x_rate', 'after_hours_multiplier']);
  const hoursStep = r.lines[0].steps[0];
  assert.equal(hoursStep.raw, '2.1');
  assert.equal(hoursStep.rounded, '2.25');
  assert.equal(r.total, '1200.00');   // 3h (floor) x 200 x 2.0
});

test('an empty schedule totals 0.00 and is ok — distinct from a refusal', () => {
  const r = computeFees({ items: [] });
  assert.equal(r.ok, true);
  assert.equal(r.total, '0.00');
  assert.equal(r.lines.length, 0);
});
