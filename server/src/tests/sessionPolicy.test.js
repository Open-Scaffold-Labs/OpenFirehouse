'use strict';
/**
 * sessionPolicy.test.js — Phase 5 / migration 0110.
 *
 * These are ADVERSARIAL tests, not happy-path ones (§0 gate + F11). Each case
 * below is one that CAN fail, and several encode a specific regression we would
 * otherwise ship silently:
 *
 *  - a policy-lookup failure must NOT harden a session (it must degrade to the
 *    pre-0110 behaviour, never to a short window that signs out a crew);
 *  - a token minted BEFORE 0110 has no `sst` and must not be treated as
 *    infinitely old — that would sign out every existing session on deploy;
 *  - the absolute cap must actually fire, and must fire on the SESSION START,
 *    not on the last rotation (otherwise a continuously-active client is
 *    immortal, which is exactly the bug the cap exists to prevent).
 */

const assert = require('node:assert');
const { test } = require('node:test');

const {
  LIMITS, DEFAULTS,
  normalizePlatform, idleMinutesFor, isBeyondMaxAge,
} = require('../config/sessionPolicy');

// ── platform normalization ───────────────────────────────────────────────────

test('normalizePlatform: only web and mobile are accepted; everything else is web', () => {
  assert.strictEqual(normalizePlatform('web'), 'web');
  assert.strictEqual(normalizePlatform('mobile'), 'mobile');
  // An attacker-supplied or typo'd value must not select a THIRD behaviour.
  assert.strictEqual(normalizePlatform('desktop'), 'web');
  assert.strictEqual(normalizePlatform(''), 'web');
  assert.strictEqual(normalizePlatform(undefined), 'web');
  assert.strictEqual(normalizePlatform(null), 'web');
  assert.strictEqual(normalizePlatform({ toString: () => 'mobile' }), 'web');
});

// ── the two windows are genuinely independent ────────────────────────────────

test('idleMinutesFor: web and mobile windows do not bleed into each other', () => {
  const policy = {
    session_idle_minutes_web:    30,
    session_idle_minutes_mobile: 720,
    session_max_hours:           12,
  };
  assert.strictEqual(idleMinutesFor(policy, 'web'), 30);
  assert.strictEqual(idleMinutesFor(policy, 'mobile'), 720);
  // An unknown platform must fall to the STRICTER-configured web value here,
  // not silently pick mobile.
  assert.strictEqual(idleMinutesFor(policy, 'nonsense'), 30);
});

test('idleMinutesFor: a missing policy degrades to pre-0110 behaviour, not to a short window', () => {
  // This is the direction that matters. If a policy read fails mid-shift, the
  // wrong answer is a 5-minute window that signs out a captain on an incident.
  assert.strictEqual(idleMinutesFor(null, 'web'), DEFAULTS.session_idle_minutes_web);
  assert.strictEqual(idleMinutesFor(undefined, 'mobile'), DEFAULTS.session_idle_minutes_mobile);
  assert.strictEqual(DEFAULTS.session_idle_minutes_web, 10080);   // 7d == pre-0110
  assert.strictEqual(DEFAULTS.session_idle_minutes_mobile, 10080);
  assert.strictEqual(DEFAULTS.session_max_hours, 168);            // 7d == pre-0110
});

// ── the absolute cap ─────────────────────────────────────────────────────────

test('isBeyondMaxAge: fires strictly AFTER the cap, measured from session start', () => {
  const now   = 1_800_000_000;
  const start = now - (12 * 3600); // exactly 12h ago

  assert.strictEqual(isBeyondMaxAge(start, 13, now), false, '12h old under a 13h cap is alive');
  assert.strictEqual(isBeyondMaxAge(start, 12, now), false, 'exactly at the cap is NOT beyond it');
  assert.strictEqual(isBeyondMaxAge(start, 11, now), true,  '12h old under an 11h cap is expired');
});

test('isBeyondMaxAge: a pre-0110 token (no sst) is treated as fresh, not as infinitely old', () => {
  // Regression guard: the opposite behaviour would sign out every live session
  // the moment this shipped.
  assert.strictEqual(isBeyondMaxAge(undefined, 1), false);
  assert.strictEqual(isBeyondMaxAge(null, 1), false);
  assert.strictEqual(isBeyondMaxAge(NaN, 1), false);
  assert.strictEqual(isBeyondMaxAge('not-a-number', 1), false);
});

test('isBeyondMaxAge: the cap is anchored to session START so rotation cannot extend it forever', () => {
  const now   = 1_800_000_000;
  const start = now - (200 * 3600); // 200h ago — way past any legal cap
  // Even though this session has been refreshed continuously (which is what a
  // rolling idle window permits), the absolute cap must still fire.
  assert.strictEqual(isBeyondMaxAge(start, 168, now), true);
  assert.strictEqual(isBeyondMaxAge(start, LIMITS.maxHoursMax, now), true);
});

test('isBeyondMaxAge: a garbage maxHours falls back to the default cap rather than never expiring', () => {
  const now   = 1_800_000_000;
  const start = now - (200 * 3600);
  // 0 / NaN / undefined must not become "no cap at all".
  assert.strictEqual(isBeyondMaxAge(start, 0, now), true);
  assert.strictEqual(isBeyondMaxAge(start, NaN, now), true);
  assert.strictEqual(isBeyondMaxAge(start, undefined, now), true);
});

// ── the API bounds and the DB CHECK must agree ───────────────────────────────

test('LIMITS mirror migration 0110 CHECK constraints exactly', () => {
  // If these drift, bad input stops being a clean 400 and starts being a
  // Postgres error surfacing as a 500.
  assert.strictEqual(LIMITS.idleMinutesMin, 5);
  assert.strictEqual(LIMITS.idleMinutesMax, 10080);
  assert.strictEqual(LIMITS.maxHoursMin, 1);
  assert.strictEqual(LIMITS.maxHoursMax, 168);
});
