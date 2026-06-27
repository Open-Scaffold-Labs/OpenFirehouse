'use strict';
// Unit tests for the TV PIN hashing scheme (config/tvPin.js).
const { test } = require('node:test');
const assert = require('node:assert');

const { hashTvPin, isHashed, normalize } = require('../config/tvPin');

test('normalize uppercases and trims', () => {
  assert.strictEqual(normalize('  ab12 '), 'AB12');
  assert.strictEqual(normalize(null), '');
});

test('hash is deterministic, case-insensitive, and prefixed', () => {
  const a = hashTvPin('abcd');
  const b = hashTvPin('ABCD');
  assert.strictEqual(a, b);
  assert.ok(a.startsWith('hmac$'));
  assert.match(a.slice(5), /^[0-9a-f]{64}$/);
});

test('different pins hash differently', () => {
  assert.notStrictEqual(hashTvPin('AAAA'), hashTvPin('AAAB'));
});

test('isHashed distinguishes hashed from legacy plaintext', () => {
  assert.ok(isHashed(hashTvPin('1234')));
  assert.ok(!isHashed('1234'));
  assert.ok(!isHashed(null));
});
