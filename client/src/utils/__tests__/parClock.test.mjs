// The PAR clock. The most time-critical number on the fireground.
//
// This test file was REWRITTEN 2026-07-14 after Matt challenged the original
// design. The first version asserted "the PAR clock counts from DISPATCH" as a
// verified fact. It was not — it was my judgment. The evidence says:
//   • NFPA 1500 §8.2.4 anchors the incident clock to FIRST UNIT ON SCENE.
//   • Annex A.8.2.4 explicitly sanctions DISPATCH anchoring for long-travel
//     (rural/volunteer) departments — our market.
//   • There is NO NFPA-mandated PAR interval. "Every 20 minutes" is folklore.
//   • PAR is BENCHMARK-driven first; NJ mandates 5 triggers and ZERO intervals.
// So the anchor is a DEPARTMENT SETTING, and the benchmarks are the doctrine.

import test from 'node:test';
import assert from 'node:assert';
import {
  parRemainingSeconds, parBasis, isParOverdue, fmtMMSS, parChipLabel,
  parChipSeverity, parBenchmarkTriggers, PAR_ANCHOR, PAR_BENCHMARKS, PAR_BENCHMARKS_LIVE,
} from '../parClock.js';

const T0 = new Date('2026-07-14T13:00:00.000Z').getTime();
const at = (m, s = 0) => T0 + m * 60_000 + s * 1000;

// Dispatch 13:00. First unit on scene 13:08 — an eight-minute run, entirely normal
// for a volunteer department, and the exact case that makes the anchor matter.
const INC = {
  parInterval: 20,
  milestones: {
    dispatched: '2026-07-14T13:00:00.000Z',
    onScene:    '2026-07-14T13:08:00.000Z',
  },
};

test('🛑 DEFAULT ANCHOR is DISPATCH (changed 2026-07-14 — market + fail-safe)', () => {
  // The default was on_scene (NFPA §8.2.4's mandatory default), but on-scene time
  // is not guaranteed to exist — the clock silently never started on ~40% of prod
  // calls. Dispatch is present on every call, matches the market-leading board,
  // and is the Annex A.8.2.4 provision for long-travel departments.
  // At 13:14, a 20-min PAR counting from dispatch (13:00) has 6:00 left.
  assert.equal(parBasis(INC).from, 'since dispatch');
  assert.equal(parRemainingSeconds(INC, at(14)), 360);
  assert.equal(parChipLabel(parRemainingSeconds(INC, at(14))), 'PAR in 6:00');
});

test('ON_SCENE is an explicit DEPARTMENT CHOICE (NFPA 1500 §8.2.4), not the default', () => {
  // A department may still choose it — now reliable because CAD can deliver the
  // arrival (cad/processStatusUpdate). Counting from on-scene (13:08) at 13:20
  // leaves 8:00, vs the dispatch default's 0:00.
  assert.equal(parRemainingSeconds(INC, at(20), PAR_ANCHOR.ON_SCENE), 480);
  assert.equal(parBasis(INC, PAR_ANCHOR.ON_SCENE).from, 'since first unit on scene');
});

test('🛑 THE ANCHOR CHANGES THE ANSWER BY THE LENGTH OF THE RUN', () => {
  // This is the whole point, and it is why the anchor must be a department setting
  // AND must be labelled on screen. On an 8-minute run the two anchors disagree by
  // exactly 8 minutes. If our board disagrees with what DISPATCH is announcing over
  // the radio, the IC hears two different numbers for the same fire.
  const onScene  = parRemainingSeconds(INC, at(20), PAR_ANCHOR.ON_SCENE);
  const dispatch = parRemainingSeconds(INC, at(20), PAR_ANCHOR.DISPATCH);
  assert.equal(onScene - dispatch, 480, 'the two anchors differ by the 8-minute run');
  assert.notEqual(parChipLabel(onScene), parChipLabel(dispatch));
});

test('the DISPATCH default always starts — even while units are still responding', () => {
  // This is the whole reason dispatch is the default. Nobody is on scene yet, but
  // the clock must not silently fail to start. Counting from dispatch (13:00) at
  // 13:05 → 15:00 left.
  const responding = { parInterval: 20, milestones: { dispatched: '2026-07-14T13:00:00.000Z' } };
  assert.equal(parRemainingSeconds(responding, at(5)), 900);
});

test('ON_SCENE anchor (explicit choice): NO clock while units are still responding', () => {
  // When a department explicitly CHOOSES on-scene, and nobody is on scene yet,
  // there is nothing to account for — the chip stays off rather than counting from
  // a moment the department did not choose.
  const responding = { parInterval: 20, milestones: { dispatched: '2026-07-14T13:00:00.000Z' } };
  assert.equal(parRemainingSeconds(responding, at(5), PAR_ANCHOR.ON_SCENE), null);
  assert.equal(parChipLabel(null), null, 'no chip at all — never a phantom OVERDUE');
});

test('🛑 REGRESSION: OVERDUE COUNTS UP — the IC can see HOW late', () => {
  // Old behaviour clamped at zero: 30 seconds late and 11 minutes late rendered
  // IDENTICALLY. That difference is the entire decision the number supports.
  // Dispatch default → due at 13:20 (13:00 + 20 min).
  assert.equal(parChipLabel(parRemainingSeconds(INC, at(20, 30))), 'PAR OVERDUE 0:30');
  assert.equal(parChipLabel(parRemainingSeconds(INC, at(31, 30))), 'PAR OVERDUE 11:30');
  assert.notEqual(
    parChipLabel(parRemainingSeconds(INC, at(20, 30))),
    parChipLabel(parRemainingSeconds(INC, at(31, 30))),
  );
});

// ─── CAD / UNIT-STATUS INTEGRATION ──────────────────────────────────────────
// The on-scene time is DERIVED from unit_status_history — the moment dispatch
// flipped the first unit to on_scene after radio traffic — not from a milestone
// button the IC had to remember to press.

test('🛑 THE DERIVED ON-SCENE TIME BEATS THE HAND-STAMPED MILESTONE', () => {
  // The real event: dispatch flipped Engine 1 to on_scene at 13:08, over the radio.
  // The IC didn't get round to tapping the milestone button until 13:15 — seven
  // minutes later, because he was, reasonably, running a fire.
  //
  // The PAR clock must count from what the RADIO said (13:08), not from when
  // someone got a free hand (13:15). Trusting the button makes every PAR seven
  // minutes late, and nobody would ever know.
  const inc = {
    parInterval: 20,
    firstOnSceneAt: '2026-07-14T13:08:00.000Z',            // derived — what happened
    milestones: {
      dispatched: '2026-07-14T13:00:00.000Z',
      onScene:    '2026-07-14T13:15:00.000Z',              // hand-stamped — late
    },
  };
  // On the ON_SCENE anchor (the choice this behaviour is about):
  assert.equal(parBasis(inc, PAR_ANCHOR.ON_SCENE).time, '2026-07-14T13:08:00.000Z',
    'the derived on-scene time wins over the hand-stamped milestone');

  // At 13:25 the PAR has 3:00 left counting from 13:08 — but would wrongly show
  // 10:00 if it trusted the button. That 7-minute lie is the bug.
  assert.equal(parRemainingSeconds(inc, at(25), PAR_ANCHOR.ON_SCENE), 180);
  assert.equal(parChipLabel(parRemainingSeconds(inc, at(25), PAR_ANCHOR.ON_SCENE)), 'PAR in 3:00');
});

test('the hand-stamped milestone is a FALLBACK, not dead weight (on the on-scene anchor)', () => {
  // A department that chose on-scene but is not running unit statuses still gets a
  // clock from the IC's milestone tap.
  const inc = {
    parInterval: 20,
    milestones: { dispatched: '2026-07-14T13:00:00.000Z', onScene: '2026-07-14T13:08:00.000Z' },
  };
  assert.equal(parBasis(inc, PAR_ANCHOR.ON_SCENE).time, '2026-07-14T13:08:00.000Z');
  assert.equal(parRemainingSeconds(inc, at(20), PAR_ANCHOR.ON_SCENE), 480);
});

test('a completed PAR resets the basis, under EITHER anchor', () => {
  const inc = { ...INC, parHistory: [{ time: '2026-07-14T13:30:00.000Z' }] };
  assert.equal(parRemainingSeconds(inc, at(35)), 900, 'counts from the last PAR');
  assert.equal(parRemainingSeconds(inc, at(35), PAR_ANCHOR.DISPATCH), 900, 'same — a PAR resets it');
  assert.equal(parBasis(inc).from, 'last PAR');
});

test('the LAST PAR wins when several have run', () => {
  const inc = { ...INC, parHistory: [
    { time: '2026-07-14T13:15:00.000Z' },
    { time: '2026-07-14T13:40:00.000Z' },
  ]};
  assert.equal(parRemainingSeconds(inc, at(45)), 900, 'counts from 13:40');
});

test('no timer set is NOT the same as "due now"', () => {
  assert.equal(parRemainingSeconds({ ...INC, parInterval: 0 }, at(90)), null);
  assert.equal(isParOverdue(null), false, 'null must NEVER read as overdue');
});

test('an unparseable basis is NOT "overdue"', () => {
  // Fail safe. We do not scream OVERDUE at an IC on the strength of a bad timestamp.
  const bad = { parInterval: 20, milestones: { dispatched: 'garbage' } };
  assert.equal(parRemainingSeconds(bad, T0), null);
});

// ─── BENCHMARKS: the doctrinal core, not the wall clock ─────────────────────

test('🛑 A BENCHMARK OWES A PAR — even if the timer has plenty left', () => {
  // NJ statewide reg (N.J.A.C. 5:75-2.4(f)) mandates benchmark triggers and ZERO
  // time intervals. A product that only fires on a clock is doctrinally wrong.
  // 'underControl' is a milestone the board really stamps today.
  const inc = {
    ...INC,
    milestones: { ...INC.milestones, underControl: '2026-07-14T13:12:00.000Z' },
  };
  // Clock says we're fine (13:14 — 14 min left on a 20-min on-scene anchor)...
  assert.ok(parRemainingSeconds(inc, at(14)) > 0, 'the timer is NOT due');
  // ...but the incident went under control, so a PAR is owed RIGHT NOW.
  const owed = parBenchmarkTriggers(inc);
  assert.deepEqual(owed.map(b => b.key), ['under_control']);
});

test('a PAR clears the benchmarks that preceded it — and only those', () => {
  const inc = {
    ...INC,
    milestones: {
      ...INC.milestones,
      underControl: '2026-07-14T13:12:00.000Z',   // BEFORE the PAR → answered
      mayday:       '2026-07-14T13:25:00.000Z',   // AFTER the PAR  → still owed
    },
    parHistory: [{ time: '2026-07-14T13:20:00.000Z' }],
  };
  assert.deepEqual(parBenchmarkTriggers(inc).map(b => b.key), ['mayday'],
    'a MAYDAY after the last PAR still owes a PAR; the under-control was answered');
});

test('hazmat / non-structural variants fire the same under-control benchmark', () => {
  for (const key of ['controlled', 'mitigated']) {
    const inc = { ...INC, milestones: { ...INC.milestones, [key]: '2026-07-14T13:12:00.000Z' } };
    assert.deepEqual(parBenchmarkTriggers(inc).map(b => b.key), ['under_control'],
      `${key} must fire the under-control PAR benchmark`);
  }
});

test('🛑 HONESTY FENCE: all 6 benchmarks are live — MAYDAY shipped (Phase 4, 2026-07-15)', () => {
  // All six PAR benchmarks are now wired to a real board action. MAYDAY (Phase 4)
  // ships the DECLARE MAYDAY button, which stamps milestones.mayday and raises the
  // PAR REQUIRED prompt exactly like the other five fireground events.
  //
  // This test exists so nobody — including a future me — can claim "benchmark-driven
  // PAR" is done while any are dark, and equally so nobody REGRESSES one to dark.
  // If this list ever silently drifts, that is the bug.
  assert.deepEqual(
    [...PAR_BENCHMARKS_LIVE].sort(),
    ['all_clear', 'evacuation', 'hazardous_event', 'mayday', 'strategy_change', 'under_control'],
    'If you unwired a benchmark from its board action, update PAR_BENCHMARKS_LIVE. ' +
    'If you wired a new one, add it here.');

  // Nothing is dark: every declared benchmark has a live board action.
  const dark = PAR_BENCHMARKS.filter(b => !PAR_BENCHMARKS_LIVE.includes(b.key));
  assert.deepEqual(dark.map(b => b.key), [],
    'Every PAR benchmark now has a board action. If one goes dark again, that is a ' +
    'regression of a life-safety trigger — fix it, do not ship it.');
});

test('no benchmarks stamped → nothing owed', () => {
  assert.deepEqual(parBenchmarkTriggers(INC), []);
});

test('severity thresholds', () => {
  assert.equal(parChipSeverity(600), 'ok');
  assert.equal(parChipSeverity(120), 'due-soon');
  assert.equal(parChipSeverity(0), 'overdue');   // due == overdue. No grace period.
  assert.equal(parChipSeverity(-1), 'overdue');
});

test('fmtMMSS pads and never renders a negative', () => {
  assert.equal(fmtMMSS(9), '0:09');
  assert.equal(fmtMMSS(600), '10:00');
  assert.equal(fmtMMSS(-90), '1:30', 'magnitude only — the label supplies the word OVERDUE');
});
