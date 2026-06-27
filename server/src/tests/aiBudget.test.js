'use strict';
// W3.5 — AI budget unit tests (DB-free; the DB-backed paths were verified by
// execution against the dev DB on 2026-06-10: default resolution, recordUsage,
// usageSummary math, per-station override, exceed → BUDGET_EXCEEDED/429).
const { test } = require('node:test');
const assert = require('node:assert');
const { estimateTokens, DEFAULT_DAILY_BUDGET } = require('../utils/aiBudget');

test('estimateTokens approximates chars/4', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens('12345678'), 2);
  assert.equal(estimateTokens('a'.repeat(401)), 101); // ceil
});

test('default daily budget is a sane positive number', () => {
  assert.ok(Number.isInteger(DEFAULT_DAILY_BUDGET));
  assert.ok(DEFAULT_DAILY_BUDGET >= 10_000);
});
