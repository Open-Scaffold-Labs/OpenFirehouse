'use strict';
/**
 * 4.1b — the response-time axis. Pure; always runs.
 *
 * These constants end up in a report a chief hands to the AHJ. A wrong number
 * here is the worst bug Phase 4 can ship, because unlike a crash it does not
 * announce itself — it just publishes.
 *
 * So these assertions are deliberately DUMB and LITERAL. They are not testing
 * logic; they are pinning values to their cited sections so a future edit that
 * "tidies" 360 into 300 has to argue with a test that names the trap.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const M = require('../constants/responseMetrics');

test('4.1b — every §4.1.2.1 objective is present except (5) and (6), cut on purpose', () => {
  // The market's "1710 report" is first-unit percentiles and skips (5) and (6);
  // no surveyed platform computes (6) at all. A report named after a standard
  // has to meet the standard it names.
  const ns = M.OBJECTIVES.map((o) => o.n);
  // Iterate 1..8 from THE STANDARD, not from what happens to be in the array.
  // The previous version of this assertion listed [2..8] — it matched the file
  // instead of the standard, so it passed while objective (1) was missing. A
  // completeness test that cannot detect the missing item proves nothing.
  // (5) and (6) are the ERF travel targets, CUT 2026-07-26: computing them needs
  // a department's critical task analysis, which we can store but never
  // generate. Everything else in §4.1.2.1 must be present, and this loop names
  // the omissions explicitly so they stay decisions rather than decaying into
  // accidents.
  for (const n of [1, 2, 3, 4, 7, 8]) {
    assert.ok(ns.includes(n), `§4.1.2.1(${n}) is missing from OBJECTIVES`);
  }
  assert.ok(!ns.includes(5), '§4.1.2.1(5) ERF is CUT on purpose');
  assert.ok(!ns.includes(6), '§4.1.2.1(6) ERF high-rise is CUT on purpose');
  assert.equal(new Set(ns).size, 6, 'six DISTINCT objectives (of eight; both ERF targets cut)');
  // (1) delegates rather than carrying a number — assert that explicitly so it
  // cannot be "tidied" into a bogus single target later.
  const one = M.objectiveByKey('alarm_handling');
  assert.equal(one.seconds, null, '(1) has no single target — it delegates to §4.1.2.3');
  assert.equal(one.delegates_to, 'ALARM_HANDLING_TARGETS');
  // No ERF objective survives the cut. Asserted so a future edit cannot quietly
  // reintroduce one without a critical task analysis behind it.
  assert.equal(M.OBJECTIVES.filter((o) => o.erf).length, 0, 'no ERF objective is computed');
});

test('4.1b — turnout is 80s fire / 60s EMS (60s for fire is the PRE-2010 edition)', () => {
  assert.equal(M.objectiveByKey('turnout_fire').seconds, 80);
  assert.equal(M.objectiveByKey('turnout_ems').seconds, 60);
});

test('4.1b — second company is 360s from the BODY, not 300s from Annex C', () => {
  // NFPA 1710's own Annex C.3.5 says 300 s while §4.1.2.1(4) says 360 s, and
  // Annex C also relabels travel-time objectives as "on scene time". The body
  // governs. This assertion exists so nobody "fixes" it from the crib sheet.
  const o = M.objectiveByKey('travel_second_company');
  assert.equal(o.seconds, 360);
  assert.match(o.annex_conflict, /300/, 'the conflict must stay documented on the constant');
});

test('4.1b — the 90% rule applies to turnout and travel, and alarm handling has its own', () => {
  // §4.1.2.4 covers "each turnout time and travel time performance objective"
  // — objective (1) is alarm handling and is explicitly NOT under the 90% rule,
  // which is the whole distinction this test exists to hold.
  const timed = M.OBJECTIVES.filter((o) => o.n !== 1);
  for (const o of timed) {
    assert.equal(o.fraction, 0.90, `${o.key} must carry the §4.1.2.4 90% objective`);
    assert.ok(['turnout', 'travel'].includes(o.segment), 'only turnout/travel take the 90% rule');
  }
  const alarmObjective = M.objectiveByKey('alarm_handling');
  assert.equal(alarmObjective.fraction, null,
    'objective (1) must NOT carry the 90% rule — alarm handling has its own fractions');
  // Alarm handling carries FIVE different fractions across one segment.
  const fractions = new Set(M.ALARM_HANDLING_TARGETS.map((t) => t.fraction));
  assert.ok(fractions.size >= 2, 'alarm handling is not a single 90% target');
  assert.ok(M.ALARM_HANDLING_TARGETS.some((t) => t.seconds === 64 && t.fraction === 0.90),
    'alarm processing 64s/90% (TIA 20-1) must be present');
  assert.ok(M.ALARM_HANDLING_TARGETS.some((t) => t.seconds === 15 && t.fraction === 0.95),
    'alarm answering 15s/95% (TIA 20-1) must be present');
});

test('4.1b — the eight special call types are a closed list', () => {
  assert.equal(M.SPECIAL_CALL_TYPES.length, 8, '§4.1.2.3.3.1 enumerates exactly eight');
  assert.ok(Object.isFrozen(M.SPECIAL_CALL_TYPES));
});

test('4.1b — every target cites its edition and section', () => {
  // If you cannot cite it, it does not belong in this file.
  for (const o of M.OBJECTIVES) {
    assert.match(o.source, /§4\.1\.2\.1\(\d\)/, `${o.key} must cite its section`);
  }
  for (const t of M.ALARM_HANDLING_TARGETS) {
    assert.match(t.source, /TIA 20-1/, `${t.key} must cite TIA 20-1, which supersedes the 2020 printing`);
  }
});

test('4.1b — reporting is the 90th percentile and nothing accreditation-only', () => {
  assert.equal(M.REPORTING.PERCENTILE, 0.90, 'the fire service reports at the 90th percentile');
  // These came from the accreditation body, not from what competitors ship, and
  // were cut 2026-07-26. Asserted absent so they cannot drift back in.
  assert.equal(M.REPORTING.MIN_N_FOR_BASELINE, undefined,
    'n<=10 suppression is CUT — the market publishes percentiles at n=2');
  assert.equal(M.REPORTING.MULTI_YEAR_IS_POOLED, undefined,
    'multi-year aggregates are CUT — no surveyed platform ships that column');
});

test('4.1b — the CFAI vocabulary is gone', () => {
  // Its four remaining measures were just the NFPA segments under an
  // accreditation label, for a niche we decided not to serve.
  assert.equal(M.CFAI_MEASURES, undefined);
  assert.equal(M.CFAI_MEASURES_NOT_COMPUTED, undefined);
});

test('4.1b — the metric states never collapse into each other', () => {
  const v = Object.values(M.METRIC_STATE);
  assert.equal(new Set(v).size, v.length, 'each state is distinct');
  for (const k of ['not_captured', 'not_applicable', 'not_achieved']) {
    assert.ok(v.includes(k), `${k} must be its own state — not_captured is NOT zero`);
  }
});

test('4.1b — alarm transfer is ZERO when no transfer occurred, not unknown', () => {
  assert.equal(M.SEGMENTS.ALARM_TRANSFER.zero_when_no_transfer, true);
});

test('4.1b — alarm handling is a composite governed by NFPA 1221, not 1710', () => {
  assert.deepEqual(M.SEGMENTS.ALARM_HANDLING.composite_of,
    ['alarm_transfer', 'alarm_answering', 'alarm_processing']);
  assert.equal(M.SEGMENTS.ALARM_HANDLING.governed_by, 'NFPA 1221');
});

test('4.1b — total response discloses that it is computed to ARRIVAL', () => {
  // NFPA's literal end is "initiating action", which nobody captures; every
  // published SOC computes to arrival. Following the convention is fine.
  // Following it SILENTLY is not.
  assert.match(M.SEGMENTS.TOTAL_RESPONSE.deviation, /arrival/i);
});

test('4.1b — every segment names what starts and ends it', () => {
  for (const s of Object.values(M.SEGMENTS)) {
    assert.ok(s.starts && s.ends, `${s.key} must name its anchors — a segment name alone means nothing`);
    assert.ok(s.source, `${s.key} must cite its section`);
  }
});

test('4.1b — the edition is data, never a hardcoded string in a header', () => {
  assert.equal(M.EDITION.standard, 'NFPA 1710');
  assert.equal(M.EDITION.year, 2020);
  assert.match(M.EDITION.amended_by, /TIA 20-1/);
  assert.match(M.EDITION.successor, /1750/, 'the renumber must be carried, not discovered in 2027');
});

test('4.1b — lookups are EXACT: no prefix, no regex, no fuzzy match', () => {
  // The FI result axis was once guarded by /^pass\b/i and "Passed" defeated it.
  assert.equal(M.segmentByKey('turnout').key, 'turnout');
  assert.equal(M.segmentByKey('turn'), null, 'a prefix must NOT resolve');
  assert.equal(M.segmentByKey('TURNOUT'), null, 'case must NOT be normalised away');
  assert.equal(M.objectiveByKey('turnout_fire').seconds, 80);
  assert.equal(M.objectiveByKey('turnout'), null, 'a partial key must NOT resolve');
});
