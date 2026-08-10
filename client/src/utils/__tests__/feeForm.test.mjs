/**
 * feeForm.test.mjs — the fee-schedule forms must not offer a button that always fails.
 *
 * THE DEFECT THIS FENCES. "Add a fee line" was gated on code + name only, so five of the six
 * fee kinds could be submitted incomplete and were refused by a database CHECK every single
 * time. Worse, "Surcharge" was refused on EVERY press with no way to succeed at all: the
 * client sent `surchargeable: true` unconditionally, defeating the server's own correct
 * default, against `CHECK (NOT (kind = 'surcharge' AND surchargeable))` — and the form never
 * showed the percentage field that `CHECK (kind <> 'surcharge' OR percent_rate IS NOT NULL)`
 * requires.
 *
 * These predicates mirror migration 0118. The database remains the authority; this is only
 * so the operator is not walked into a 422 by a form that let them press the button.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./_resolveExtensions.mjs', import.meta.url);
const { itemReady, tierReady, modifierReady } = await import('../../components/prevention/feeForm.js');

const base = (o = {}) => ({ code: 'PERMIT', name: 'Annual operational permit', ...o });

test('a fee line always needs a code and a name', () => {
  assert.equal(itemReady(base({ kind: 'flat', flat_amount: '250.00', code: '' })), false);
  assert.equal(itemReady(base({ kind: 'flat', flat_amount: '250.00', name: '  ' })), false);
});

test('each kind requires the field its CHECK constraint demands', () => {
  // flat → flat_amount
  assert.equal(itemReady(base({ kind: 'flat' })), false, 'flat with no amount');
  assert.equal(itemReady(base({ kind: 'flat', flat_amount: '250.00' })), true);

  // hourly → hourly_rate
  assert.equal(itemReady(base({ kind: 'hourly' })), false, 'hourly with no rate');
  assert.equal(itemReady(base({ kind: 'hourly', hourly_rate: '200.00' })), true);

  // percent_of → BOTH the percentage and the line it chains from
  assert.equal(itemReady(base({ kind: 'percent_of', percent_rate: '25' })), false, 'percent with no base line');
  assert.equal(itemReady(base({ kind: 'percent_of', input_item_id: '4' })), false, 'base line with no percent');
  assert.equal(itemReady(base({ kind: 'percent_of', percent_rate: '25', input_item_id: '4' })), true);

  // tiered / valuation → the measured-by axis. Its select ships on an empty "Choose…".
  assert.equal(itemReady(base({ kind: 'tiered' })), false, 'tiered with no axis');
  assert.equal(itemReady(base({ kind: 'tiered', input_variable: 'square_footage' })), true);
  assert.equal(itemReady(base({ kind: 'valuation' })), false);
  assert.equal(itemReady(base({ kind: 'valuation', input_variable: 'construction_valuation' })), true);
});

test('🔴 SURCHARGE needs a percentage — it was refused on every press', () => {
  assert.equal(itemReady(base({ kind: 'surcharge' })), false, 'no percentage');
  assert.equal(itemReady(base({ kind: 'surcharge', percent_rate: '5' })), true);
});

test('an unknown kind is never submittable', () => {
  assert.equal(itemReady(base({ kind: 'made_up' })), false);
  assert.equal(itemReady(base({})), false, 'no kind at all');
  assert.equal(itemReady(), false);
});

test('a tier needs its amount', () => {
  assert.equal(tierReady({}), false);
  assert.equal(tierReady({ amount: '250.00' }), true);
});

test('per_unit, unit_size and the basis travel together or not at all', () => {
  // CHECK ((per_unit IS NULL) = (unit_size IS NULL)). The first pass paired per_unit with
  // per_unit_basis and MISSED unit_size — which is the half Postgres actually enforces.
  assert.equal(tierReady({ amount: '250.00', per_unit: '15' }), false, 'a rate with no unit size');
  assert.equal(tierReady({ amount: '250.00', unit_size: '1000' }), false, 'a unit size with no rate');
  assert.equal(tierReady({ amount: '250.00', per_unit: '15', unit_size: '1000' }), false,
    'and the basis is never assumed — whole-quantity vs excess is $75 a permit');
  assert.equal(tierReady({ amount: '250.00', per_unit: '15', unit_size: '1000', per_unit_basis: 'whole_quantity' }), true);
  assert.equal(tierReady({ amount: '250.00', per_unit: '15', unit_size: '1000', per_unit_basis: 'excess_above_floor' }), true);
});

test('a modifier needs a value and a POSITIVE step number', () => {
  // Number('') is 0, which the server refuses with a 400 the blank field never warned of.
  assert.equal(modifierReady({ value: '50', seq: '' }), false, 'blank seq is 0, not 1');
  assert.equal(modifierReady({ value: '50', seq: '0' }), false);
  assert.equal(modifierReady({ value: '50', seq: '-1' }), false);
  assert.equal(modifierReady({ value: '50', seq: '1.5' }), false, 'seq is an integer');
  assert.equal(modifierReady({ value: '50', seq: '1000' }), false, 'the server caps at 999');
  assert.equal(modifierReady({ seq: '1' }), false, 'no value');
  assert.equal(modifierReady({ value: '50', seq: '1' }), true);
  assert.equal(modifierReady({ value: '50', seq: '999' }), true);
});
