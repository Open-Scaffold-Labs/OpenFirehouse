'use strict';
/**
 * statusTimers.test.js — unit status timers (0046, LEITSC §1.7.3 parity).
 * The pure computation the board's overdue state derives from.
 */
const test = require('node:test');
const assert = require('node:assert');
const { DEFAULT_THRESHOLDS, effectiveThresholds, computeTimer } = require('../utils/statusTimers');

const NOW = new Date('2026-07-12T22:00:00Z');
const min = (n) => new Date(NOW - n * 60000).toISOString();

test('defaults: committed statuses timed, dispatchable statuses off', () => {
  assert.equal(DEFAULT_THRESHOLDS.dispatched, 10);
  assert.equal(DEFAULT_THRESHOLDS.enroute, 10);
  assert.equal(DEFAULT_THRESHOLDS.on_scene, 30);
  assert.equal(DEFAULT_THRESHOLDS.in_service, 0);
  assert.equal(DEFAULT_THRESHOLDS.returning, 0);
  assert.equal(DEFAULT_THRESHOLDS.on_the_air, 0);
});

test('effectiveThresholds: dept config overrides, clamps, ignores junk', () => {
  const t = effectiveThresholds({ on_scene: 20, dispatched: 0, bogus: 99, enroute: 99999, returning: -5 });
  assert.equal(t.on_scene, 20);       // override
  assert.equal(t.dispatched, 0);      // dept turned it off
  assert.equal(t.enroute, 1440);      // clamped high
  assert.equal(t.returning, 0);       // clamped low
  assert.equal(t.bogus, undefined);   // unknown key ignored
  // null / garbage config → pure defaults
  assert.deepEqual(effectiveThresholds(null), DEFAULT_THRESHOLDS);
  assert.deepEqual(effectiveThresholds([1, 2]), DEFAULT_THRESHOLDS);
});

test('computeTimer: not overdue before threshold, overdue after', () => {
  const before = computeTimer('dispatched', min(9), null, null, NOW);
  assert.equal(before.overdue, false);
  assert.equal(before.thresholdMin, 10);
  const after = computeTimer('dispatched', min(11), null, null, NOW);
  assert.equal(after.overdue, true);
  assert.equal(after.elapsedSec, 11 * 60);
});

test('computeTimer: null when the status has no timer or no timestamp', () => {
  assert.equal(computeTimer('in_service', min(500), null, null, NOW), null); // status off
  assert.equal(computeTimer('dispatched', null, null, null, NOW), null);     // no timestamp
  assert.equal(computeTimer('dispatched', 'garbage', null, null, NOW), null);
});

test('ack resets the timer basis — and only for the CURRENT stint', () => {
  // Overdue unit acked 2 min ago → timer restarts from the ack, not overdue.
  const acked = computeTimer('on_scene', min(45), min(2), null, NOW);
  assert.equal(acked.overdue, false);
  assert.equal(acked.elapsedSec, 2 * 60);
  assert.ok(acked.ackedAt);
  // An ack OLDER than the status change belongs to a previous stint — ignored.
  const stale = computeTimer('on_scene', min(45), min(50), null, NOW);
  assert.equal(stale.overdue, true);
  assert.equal(stale.elapsedSec, 45 * 60);
  assert.equal(stale.ackedAt, null);
});

test('ack becomes overdue AGAIN once the threshold passes post-ack (LEITSC: ack resets, not silences)', () => {
  const t = computeTimer('on_scene', min(90), min(31), null, NOW);
  assert.equal(t.overdue, true);           // 31 min since the last status check
  assert.equal(t.elapsedSec, 31 * 60);
});

test('dept override drives overdue: 5-min on_scene threshold', () => {
  const t = computeTimer('on_scene', min(6), null, { on_scene: 5 }, NOW);
  assert.equal(t.overdue, true);
  assert.equal(t.thresholdMin, 5);
});
