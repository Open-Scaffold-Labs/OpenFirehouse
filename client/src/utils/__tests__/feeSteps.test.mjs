/**
 * feeSteps.test.mjs — the fee-calculation breakdown must actually say something.
 *
 * THE DEFECT THIS FENCES. The breakdown panel renders each engine step. The first version
 * read `s.kind`, `s.step`, `s.detail` and `s.note` — and server/src/utils/feeEngine.js emits
 * NONE of those. Every step is keyed on `op` with shape-specific fields, and many carry no
 * `amount` at all (they carry `base`, `after`, `added`, `to`). So every step rendered as
 * "→ $250.00" at best and a bare "→" at worst.
 *
 * That matters more than a cosmetic bug: this panel is the ONE place module 3.2 deliberately
 * exceeds the documented fire-market bar, justified on the grounds that a commit gate is
 * meaningless if the approver cannot see what they are ratifying. A blank panel pays the
 * cost of that departure and delivers none of the benefit.
 *
 * The shapes below are transcribed from the `steps.push(...)` calls in feeEngine.js. If the
 * engine changes and these drift, the fallback assertion at the bottom is the safety net —
 * an unknown op must still READ as something.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// feeSteps.js imports `./money` without an extension, the way every other file in the
// prevention module does — Vite resolves that, plain Node ESM does not. `_resolveExtensions`
// exists for exactly this and its header says it is "registered from the test file via
// module.register()", but until now NO test actually did, so it was dead. The import has to
// be dynamic: a static one is hoisted above the register() call.
register('./_resolveExtensions.mjs', import.meta.url);
const { describeStep, modifierValueIsMoney } = await import('../../components/prevention/feeSteps.js');

/** Every step the engine can emit must produce a non-empty, dash-free sentence. */
const readable = (s, label) => {
  const out = describeStep(s);
  assert.ok(out && out.trim().length > 0, `${label}: rendered empty`);
  assert.ok(!/^\s*→/.test(out), `${label}: rendered as a bare arrow — "${out}"`);
  assert.ok(!out.includes('—') || !out.startsWith('—'), `${label}: leads with the unknown dash — "${out}"`);
  return out;
};

test('flat, hours and the hourly chain read as sentences', () => {
  assert.equal(readable({ op: 'flat', amount: '250.00' }, 'flat'), 'Flat amount $250.00');
  assert.match(readable({ op: 'hours', raw: '2.3', rounded: '2.5', increment: '0.25', mode: 'up_any_part' }, 'hours'),
    /2\.3.*2\.5.*0\.25-hour steps, up any part/);
  assert.match(readable({ op: 'minimum_hours', floor: '3', billable: '3' }, 'min hours'), /Minimum of 3 hours/);
  assert.equal(readable({ op: 'hours_x_rate', hours: '3', rate: '200.0000', amount: '600.00' }, 'hours×rate'),
    '3 hours × $200.00 = $600.00');
  assert.match(readable({ op: 'after_hours_multiplier', multiplier: '1.5', amount: '900.00' }, 'after hours'),
    /After-hours ×1\.5 → \$900\.00/);
});

test('the tier + per-unit chain shows the number a clerk has to check', () => {
  assert.equal(readable({ op: 'tier', tierId: 9, base: '250.00' }, 'tier'), 'Matched a tier — $250.00');
  // "$250 plus $15 per 1,000 sq ft" is $370 or $295 on the same building depending on the
  // basis. If the panel does not say WHICH, it has not explained the number.
  const whole = readable({ op: 'per_unit', perUnitBasis: 'whole_quantity', measured: '8000',
    unitSize: '1000', units: '8', rate: '15.0000', added: '120.00' }, 'per_unit whole');
  assert.match(whole, /\$15\.00 per 1,000/);
  assert.match(whole, /whole quantity/);
  assert.match(whole, /8 units, \$120\.00/);

  const excess = describeStep({ op: 'per_unit', perUnitBasis: 'excess_above_floor', measured: '3000',
    unitSize: '1000', units: '3', rate: '15.0000', added: '45.00' });
  assert.match(excess, /above the band floor/, 'the basis must be visible — it is worth $75 a permit');
  assert.notEqual(whole, excess, 'the two bases must not render identically');
});

test('a rate is money and a percentage is not — the screen must not confuse them', () => {
  const pct = readable({ op: 'percent_of', fromItemId: 4, base: '1000.00', percent: '25', amount: '250.00' }, 'percent_of');
  assert.match(pct, /^25% of fee line #4/, 'a percentage must not carry a dollar sign');
  const sur = readable({ op: 'surcharge', subtotal: '1000.00', includedCodes: ['BASE', 'PLAN'],
    percent: '5', amount: '50.00' }, 'surcharge');
  assert.match(sur, /5% surcharge on \$1,000\.00/);
  assert.match(sur, /BASE, PLAN/, 'which lines it applied to is the whole point of per-line applicability');
});

test('modifier steps name the step, the verb and both sides of the change', () => {
  const add = readable({ op: 'modifier:percent_add', seq: 1, value: '50', before: '100.00', after: '150.00' }, 'percent_add');
  assert.match(add, /^Step 1: plus 50% — \$100\.00 → \$150\.00$/);
  const amt = readable({ op: 'modifier:amount_add', seq: 2, value: '10.0000', before: '150.00', after: '160.00' }, 'amount_add');
  assert.match(amt, /plus \$10\.00/, 'an amount_add is DOLLARS and must look like dollars');
  assert.ok(!add.includes('$50'), 'a percent_add is NOT dollars and must not look like it');
  assert.match(readable({ op: 'modifier:cap', seq: 3, value: '500.0000', before: '600.00', after: '500.00' }, 'cap'),
    /capped at \$500\.00/);
});

test('modifierValueIsMoney splits the six kinds correctly', () => {
  for (const k of ['amount_add', 'per_unit_add', 'floor', 'cap']) {
    assert.equal(modifierValueIsMoney(k), true, `${k} is a dollar amount`);
  }
  for (const k of ['percent_add', 'percent_multiply']) {
    assert.equal(modifierValueIsMoney(k), false, `${k} is a percentage`);
  }
});

test('floor and cap steps say which way the number moved', () => {
  assert.match(readable({ op: 'min_amount', from: '10.00', to: '50.00' }, 'min'), /raised from \$10\.00 to \$50\.00/);
  assert.match(readable({ op: 'max_amount', from: '900.00', to: '500.00' }, 'max'), /reduced from \$900\.00 to \$500\.00/);
});

test('the passthrough and axis chain steps name the line they came from', () => {
  assert.match(readable({ op: 'passthrough', fromItemId: 7, amount: '80.00' }, 'passthrough'), /fee line #7/);
  assert.match(readable({ op: 'axis_from_item', fromItemId: 7, value: '80.00' }, 'axis'), /fee line #7/);
});

test('AN OP THIS MODULE HAS NOT LEARNED STILL READS — an empty line is worse than an ugly one', () => {
  // The engine can grow a step without this file being updated. That must degrade, not vanish.
  const out = describeStep({ op: 'some_future_op', amount: '12.00' });
  assert.ok(out.includes('some future op'), `got "${out}"`);
  assert.ok(out.includes('$12.00'));
  assert.ok(describeStep({ op: 'bare_future_op' }).length > 0, 'even with no amount');
});

test('garbage in does not throw', () => {
  assert.equal(describeStep(null), '');
  assert.equal(describeStep(undefined), '');
  assert.equal(describeStep({}), '', 'no op means nothing to say');
  assert.equal(describeStep('already a sentence'), 'already a sentence');
});
