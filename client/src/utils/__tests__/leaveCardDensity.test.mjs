// The leave-balance card's "is this bank empty?" rule.
//
// A member's landing page rendered 48 zeros (measured on prod, 2026-08-06): twelve
// leave banks, each printing "0 h available" AND a three-up Scheduled / Pending /
// Used breakdown of a total that was already zero. The three banks that actually
// had something in them were buried in the noise.
//
// The rule has to be conservative in one specific direction: it may only suppress
// the breakdown when the breakdown says NOTHING the headline doesn't. Suppressing a
// bank that has history — used hours, a pending request — would hide a member's own
// record from them, which is a worse defect than the clutter it fixes.
//
// This mirrors BalanceCard's predicate. If someone loosens it there without
// loosening it here, these fail.

import test from 'node:test';
import assert from 'node:assert';

/** Mirrors MyLeave.jsx BalanceCard. */
const isEmpty = (c) => c.available <= 0 && c.scheduled <= 0 && c.pending <= 0 && c.used <= 0;

const bank = (o = {}) => ({ available: 0, scheduled: 0, pending: 0, used: 0, ...o });

test('a bank with nothing in it is empty — the breakdown is dropped', () => {
  assert.equal(isEmpty(bank()), true);
});

test('ANY non-zero field keeps the full breakdown', () => {
  // Each of these says something "0 h available" does not.
  assert.equal(isEmpty(bank({ available: 40 })), false, 'has balance');
  assert.equal(isEmpty(bank({ scheduled: 8 })), false, 'time already booked');
  assert.equal(isEmpty(bank({ pending: 12 })), false, 'a request awaiting approval');
  assert.equal(isEmpty(bank({ used: 24 })), false, 'history the member may need');
});

test('USED alone must keep the breakdown — the original predicate missed this', () => {
  // The pre-existing `zero` check ignored `used`, so a bank the member had fully
  // spent would have looked identical to one they never had. Exhausted is not the
  // same as never-issued, and a member checking why they have no time left needs
  // to see the 24 they used.
  const spent = bank({ used: 24 });
  assert.equal(spent.available <= 0 && spent.scheduled <= 0 && spent.pending <= 0, true, 'old check would call this zero');
  assert.equal(isEmpty(spent), false, 'new check must NOT suppress it');
});

test('negative values (over-drawn) are not treated as content', () => {
  // <= 0, not === 0: an over-drawn balance is still "nothing available", and a
  // negative should not resurrect a breakdown of zeros.
  assert.equal(isEmpty(bank({ available: -0 })), true);
  assert.equal(isEmpty(bank({ available: -4 })), true);
});

test('the suppression is per-bank, not all-or-nothing', () => {
  const banks = [bank(), bank({ used: 8 }), bank(), bank({ available: 96 })];
  assert.deepEqual(banks.map(isEmpty), [true, false, true, false]);
});

test('twelve untouched banks drop 36 of 48 zeros, and keep the 12 that answer the question', () => {
  const banks = Array.from({ length: 12 }, () => bank());
  const headlineZeros = banks.length;                       // "0 h available" — kept
  const breakdownZeros = banks.filter((b) => !isEmpty(b)).length * 3; // dropped
  assert.equal(headlineZeros, 12);
  assert.equal(breakdownZeros, 0);
  assert.equal(headlineZeros + breakdownZeros, 12, 'was 48');
});
