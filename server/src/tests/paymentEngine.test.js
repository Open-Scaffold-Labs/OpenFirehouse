'use strict';
/**
 * paymentEngine.test.js — pure money arithmetic for the payment ledger (3.2 Slice C).
 *
 * Includes the mandatory FLOAT-DIVERGENCE tests (the invoiceEngine precedent): each asserts
 * the BigInt path gets an answer a float path would get WRONG, so the reason for the design
 * cannot be forgotten by a later refactor.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { validateReceiptAmount, deriveBalance } = require('../utils/paymentEngine');

test('validateReceiptAmount: accepts a plain decimal and normalises it', () => {
  const r = validateReceiptAmount('250.5');
  assert.equal(r.ok, true);
  assert.equal(r.amount, '250.50');
});

test('validateReceiptAmount: refuses garbage, empty, zero and negatives — never a silent $0', () => {
  for (const bad of ['', 'abc', 'NaN', 'Infinity', null, undefined, '0', '0.00', '-1.00']) {
    const r = validateReceiptAmount(bad);
    assert.equal(r.ok, false, `expected refusal for ${JSON.stringify(bad)}`);
    assert.ok(r.errors.length >= 1);
  }
});

test('validateReceiptAmount: refuses an amount that exceeds NUMERIC(12,2)', () => {
  const r = validateReceiptAmount('10000000000.00'); // 11 digits before the point
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, 'TOO_LARGE');
});

test('FLOAT DIVERGENCE 1: (1.005).toFixed(2) is "1.00"; the BigInt path answers "1.01"', () => {
  // The reason money is BigInt. 1.005 is not representable in binary floating point, so the
  // float path rounds it DOWN; parseDec reads the digits and rounds the true half-cent UP.
  // (The API's zod schema refuses >2dp input anyway — this proves the ENGINE would still be
  // right if a 3dp value ever reached it from another caller.)
  assert.equal((1.005).toFixed(2), '1.00', 'the float premise itself — the WRONG answer');
  const r = validateReceiptAmount('1.005');
  assert.equal(r.ok, true);
  assert.equal(r.amount, '1.01', 'the digit-parser answer the float path cannot produce');
});

test('FLOAT DIVERGENCE 2: summing 0.1+0.2 style lines — derived balance is exact', () => {
  assert.notEqual(0.1 + 0.2, 0.3, 'the float premise itself');
  const r = deriveBalance('0.30', [
    { kind: 'payment', status: 'Recorded', amount: '0.10' },
    { kind: 'payment', status: 'Recorded', amount: '0.20' },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.balance, '0.00', 'exactly zero — a float path leaves 5.5e-17 owing');
});

test('deriveBalance: partial payments, refunds add back, voids count for nothing', () => {
  const r = deriveBalance('100.00', [
    { kind: 'payment', status: 'Recorded', amount: '60.00' },
    { kind: 'payment', status: 'Void',     amount: '999.00' },   // void: nothing
    { kind: 'refund_authorization', status: 'Recorded', amount: '10.00' },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.paid_amount, '60.00');
  assert.equal(r.refunded_amount, '10.00');
  assert.equal(r.balance, '50.00'); // 100 − 60 + 10
});

test('deriveBalance: overpayment is a NEGATIVE balance — representable, not an error', () => {
  const r = deriveBalance('100.00', [
    { kind: 'payment', status: 'Recorded', amount: '150.00' },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.balance, '-50.00');
});

test('deriveBalance: a malformed row is a refusal, never a guessed total', () => {
  const r = deriveBalance('100.00', [{ kind: 'payment', status: 'Recorded', amount: 'oops' }]);
  assert.equal(r.ok, false);
});
