'use strict';
/**
 * constants/responseMetrics.js — THE RESPONSE-TIME AXIS. Server-owned. (4.1b)
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * These numbers end up in a written report a fire chief hands to the authority
 * having jurisdiction, and in a Standards-of-Cover document an accreditation
 * team reads. A wrong constant here is the worst bug Phase 4 can ship — worse
 * than a crash, because a crash announces itself.
 *
 * So this is a CLOSED SET, matched exactly. Nothing pattern-matches a segment
 * name and nothing ever will. That rule is not abstract caution: the fire
 * inspection result was once guarded by /^pass\\b/i, and "Passed" silently
 * defeated it (constants/inspectionResult.js). Same discipline, same reason.
 *
 * ── EVERY NUMBER IS CITED ───────────────────────────────────────────────────
 * Each target carries its `source` — edition and section. If you cannot cite
 * it, it does not belong in this file.
 *
 * ⚠ DO NOT SOURCE NUMBERS FROM ANNEX C. NFPA 1710's own Annex C.3.5 states the
 * second-arriving objective as 300 s while the body §4.1.2.1(4) states 360 s,
 * and Annex C silently relabels *travel time* objectives as "on scene time".
 * Annex C is informational; the body governs. The conflict is inside one
 * document and it is a live trap for anyone reading the crib sheet.
 *
 * ⚠ "60-second turnout for fire" is the PRE-2010 edition. Since 2010 it is
 * 80 s fire / 60 s EMS. Any source citing 60 s for fire is stale.
 *
 * ── THE RENUMBER, AND WHY NOTHING HARDCODES "NFPA 1710" ─────────────────────
 * NFPA 1710 and 1720 have been consolidated into NFPA 1750 (1st ed., 2026).
 * The numeric objectives carry over; the section numbers moved
 * (1710 §4.1.2.1 → 1750 §4.2.2.1). A department under review in 2027 may be
 * citing 1750. Report headers therefore render edition + section FROM HERE —
 * a hardcoded "NFPA 1710" in a header is a dated claim with a known expiry.
 *
 * ── THE THREE THINGS CALLED "RESPONSE TIME" ─────────────────────────────────
 * 1. turnout + travel — the field's "5:20" shorthand. NOT NFPA's total.
 * 2. alarm handling + turnout + travel — what every real Standards-of-Cover
 *    document computes and calls total response time.
 * 3. NFPA's literal §3.3.64.6 — PSAP receipt to INITIATING ACTION, which almost
 *    nobody captures.
 * We compute (2), the field convention, and SAY SO in the report footer.
 * Presenting it as (3) would be a claim we cannot support.
 */

/** The edition we are computing to. Rendered in every report footer. */
const EDITION = Object.freeze({
  standard: 'NFPA 1710',
  year: 2020,
  amended_by: 'TIA 20-1 (effective 2022-09-01)',
  successor: 'NFPA 1750 (1st ed., 2026) — objectives carry over; §4.1.2.1 → §4.2.2.1',
});

/**
 * SEGMENTS — NFPA 1710-2020 §3.3.64. Each names what starts and ends it,
 * because "turnout time" means nothing without its anchors.
 */
const SEGMENTS = Object.freeze({
  ALARM_TRANSFER: {
    key: 'alarm_transfer',
    label: 'Alarm transfer',
    starts: 'receipt of the alarm at the primary PSAP',
    ends: 'alarm first received at the communication center',
    source: '1710-2020 §3.3.64.4',
    // Annex A: if alarms arrive directly at the fire department's own comm
    // center with no transfer, this is ZERO — not unknown. Those are different
    // facts and the report must not conflate them.
    zero_when_no_transfer: true,
  },
  ALARM_ANSWERING: {
    key: 'alarm_answering',
    label: 'Alarm answering',
    starts: 'alarm received at the communication center',
    ends: 'alarm acknowledged at the communication center',
    source: '1710-2020 §3.3.64.1',
  },
  ALARM_PROCESSING: {
    key: 'alarm_processing',
    label: 'Alarm processing',
    starts: 'alarm acknowledged at the communication center',
    ends: 'response information begins to be transmitted to units',
    source: '1710-2020 §3.3.64.3',
  },
  ALARM_HANDLING: {
    key: 'alarm_handling',
    label: 'Alarm handling',
    starts: 'receipt of the alarm at the primary PSAP',
    ends: 'beginning of transmittal of response information to units',
    source: '1710-2020 §3.3.64.2',
    // A COMPOSITE of transfer + answering + processing, and governed by
    // NFPA 1221, not 1710. Two of its three parts are outside the fire
    // department's control entirely.
    composite_of: ['alarm_transfer', 'alarm_answering', 'alarm_processing'],
    governed_by: 'NFPA 1221',
  },
  TURNOUT: {
    key: 'turnout',
    label: 'Turnout time',
    // NOT "dispatch sent" — they differ by station-alerting latency. We anchor
    // on the CAD `dispatched` transition and disclose that in the footer.
    starts: 'the unit notification process begins (audible and/or visual alarm)',
    ends: 'the beginning point of travel time',
    source: '1710-2020 §3.3.64.8',
  },
  TRAVEL: {
    key: 'travel',
    label: 'Travel time',
    starts: 'the unit is en route',
    ends: 'the unit arrives at the scene',
    source: '1710-2020 §3.3.64.7',
  },
  TOTAL_RESPONSE: {
    key: 'total_response',
    label: 'Total response time',
    starts: 'receipt of the alarm at the primary PSAP',
    // NFPA's literal end is "initiating action or intervening". Nobody captures
    // it, and every published Standards-of-Cover computes to ARRIVAL instead.
    // We follow the field convention and disclose the deviation.
    ends: 'the first unit initiates action (NFPA) — computed to ARRIVAL, per universal field practice',
    source: '1710-2020 §3.3.64.6',
    deviation: 'computed to arrival, not to initiating action — disclosed in the report footer',
  },
});

const SEGMENT_KEYS = Object.freeze(Object.values(SEGMENTS).map((s) => s.key));

/**
 * OBJECTIVES — NFPA 1710-2020 §4.1.2.1.
 *
 * ⚠ OBJECTIVE (6) IS DELIBERATELY ABSENT — CUT 2026-07-26 (Matt).
 * 610 s travel for the initial full alarm assignment at a HIGH-RISE. It is the
 * one target in this standard that NO surveyed platform computes — not one —
 * and unlike the rest of ERF it carries a real extra cost: it needs a high-rise
 * classification of incidents that OF does not have and would have to invent.
 * "Nothing more" applies. Documented here so it is a recorded decision rather
 * than a silent omission; re-add it only alongside a real occupancy
 * classification and evidence someone ships it.
 *
 * Objectives 5 and 6 are EFFECTIVE RESPONSE FORCE targets living inside 1710
 * itself, independent of 1720. No platform surveyed computes (6) at all, and
 * the market's "1710 report" is first-unit percentiles only. A report named
 * after a standard has to meet the standard it names.
 *
 * §4.1.2.4: "The fire department shall establish a performance objective of not
 * less than 90 percent for the achievement of EACH turnout time and travel time
 * performance objective specified in 4.1.2.1."
 *
 * ⚠ The 90 % applies to TURNOUT AND TRAVEL ONLY. Alarm handling carries its own,
 * different percentages — see ALARM_HANDLING_TARGETS.
 */
const OBJECTIVES = Object.freeze([
  // (1) is the alarm-handling objective. It carries NO single number of its own —
  // §4.1.2.1(1) delegates entirely to §4.1.2.3, which is seven targets across
  // three sub-segments at five different fractions (ALARM_HANDLING_TARGETS).
  // It is listed here anyway so this array IS the eight objectives; an earlier
  // version omitted it, claimed "all eight" in a comment, and shipped a
  // completeness test that iterated 2..8 and therefore could not notice.
  { n: 1, key: 'alarm_handling', segment: 'alarm_handling', seconds: null,
    fraction: null, applies_to: 'all incidents',
    source: '1710-2020 §4.1.2.1(1) → §4.1.2.3 (as amended by TIA 20-1)',
    delegates_to: 'ALARM_HANDLING_TARGETS',
    note: 'no single target — §4.1.2.3 sets seven, split by sub-segment and call type' },
  { n: 2, key: 'turnout_fire', segment: 'turnout', seconds: 80,
    fraction: 0.90, applies_to: 'fire and special operations',
    source: '1710-2020 §4.1.2.1(2)' },
  { n: 2, key: 'turnout_ems', segment: 'turnout', seconds: 60,
    fraction: 0.90, applies_to: 'EMS',
    source: '1710-2020 §4.1.2.1(2)' },
  { n: 3, key: 'travel_first_engine', segment: 'travel', seconds: 240,
    fraction: 0.90, applies_to: 'first engine company, fire suppression',
    source: '1710-2020 §4.1.2.1(3)' },
  { n: 4, key: 'travel_second_company', segment: 'travel', seconds: 360,
    fraction: 0.90, applies_to: 'second company, minimum staffing of 4',
    source: '1710-2020 §4.1.2.1(4)',
    // Annex C.3.5 says 300 s. The body governs. Do not "correct" this to 300.
    annex_conflict: 'Annex C.3.5 states 300 s; the body §4.1.2.1(4) states 360 s and governs',
  },
  { n: 7, key: 'travel_ems_first_responder', segment: 'travel', seconds: 240,
    fraction: 0.90, applies_to: 'first responder with AED or higher, EMS incident',
    source: '1710-2020 §4.1.2.1(7)' },
  { n: 8, key: 'travel_ems_als', segment: 'travel', seconds: 480,
    fraction: 0.90, applies_to: 'ALS unit, EMS incident',
    source: '1710-2020 §4.1.2.1(8)',
    conditional_on: 'travel_ems_first_responder',
    note: 'conditional — applies only where a first responder with AED or a BLS unit arrived within 240 s travel' },
]);

/**
 * ALARM HANDLING — §4.1.2.3 as amended by TIA 20-1 (NFPA-published, effective
 * 2022-09-01). This SUPERSEDES the 2020 printing.
 *
 * Five different percentile targets across one segment, split by call type — so
 * an honest alarm-handling metric needs a call-type dimension, not one number.
 */
const ALARM_HANDLING_TARGETS = Object.freeze([
  { key: 'answering_15', segment: 'alarm_answering', seconds: 15, fraction: 0.95, source: 'TIA 20-1 §4.1.2.3.1' },
  { key: 'answering_40', segment: 'alarm_answering', seconds: 40, fraction: 0.99, source: 'TIA 20-1 §4.1.2.3.1' },
  { key: 'transfer_30', segment: 'alarm_transfer', seconds: 30, fraction: 0.95, source: 'TIA 20-1 §4.1.2.3.2' },
  { key: 'processing_64', segment: 'alarm_processing', seconds: 64, fraction: 0.90, source: 'TIA 20-1 §4.1.2.3.3' },
  { key: 'processing_106', segment: 'alarm_processing', seconds: 106, fraction: 0.95, source: 'TIA 20-1 §4.1.2.3.3' },
  { key: 'processing_special_90', segment: 'alarm_processing', seconds: 90, fraction: 0.90,
    applies_to: 'special call types', source: 'TIA 20-1 §4.1.2.3.3.1' },
  { key: 'processing_special_120', segment: 'alarm_processing', seconds: 120, fraction: 0.99,
    applies_to: 'special call types', source: 'TIA 20-1 §4.1.2.3.3.1' },
]);

/** The eight enumerated "special call types" — §4.1.2.3.3.1. A closed list. */
const SPECIAL_CALL_TYPES = Object.freeze([
  'emd_questioning_or_prearrival_instructions',
  'language_translation',
  'tty_tdd_or_relay',
  'criminal_activity_requiring_responder_safety_info',
  'hazardous_materials',
  'technical_rescue',
  'location_determination_insufficient_information',
  'received_by_text_message',
]);

/**
 * REPORTING — only what the market demonstrably ships.
 *
 * The 90th percentile is the fire service's universal reporting convention and
 * vendors advertise "90th percentile reports" by name. It stays.
 *
 * CUT 2026-07-26, because they came from the accreditation body rather than
 * from what competitors ship:
 *   • n<=10 baseline suppression (CPSE's rule). The market PUBLISHES percentiles
 *     at n=2 and n=4 — real accredited documents do exactly that. Suppressing is
 *     above the bar, so we print what the math gives and let the reader judge.
 *   • Multi-year pooled aggregates. A CFAI report-template artifact; no evidence
 *     any surveyed platform ships a multi-year percentile column. Period reports
 *     (monthly / quarterly / annual) are what vendors ship, and that is what we
 *     build.
 *
 * We ship NO outlier filter. That is the absence of a feature, not a feature.
 */
const REPORTING = Object.freeze({
  PERCENTILE: 0.90,
  TIME_FORMAT: 'hh:mm:ss',
});

/**
 * The three states a metric can be in, and they never collapse into each other.
 * NOT_CAPTURED is not zero. NOT_ACHIEVED is not missing. NOT_APPLICABLE is a
 * real, known fact (alarm transfer where no transfer happened is ZERO).
 */
const METRIC_STATE = Object.freeze({
  OK: 'ok',
  NOT_CAPTURED: 'not_captured',
  NOT_APPLICABLE: 'not_applicable',
  NOT_ACHIEVED: 'not_achieved',
});


/**
 * INCIDENT CLASS — fire vs EMS, for the turnout objective's two targets
 * (80 s fire / 60 s EMS, §4.1.2.1(2)).
 *
 * EXACT MATCH ONLY, closed set. Prod carries legacy and current vocabularies
 * side by side ('Brush Fire' and 'Brush / Wildland Fire'; 'EMS - Cardiac' and
 * 'Medical / EMS'), so both are listed. A type in NEITHER list is UNCLASSIFIED:
 * it still counts in the raw segment percentile, but it is excluded from the
 * fire/EMS split rather than guessed into one.
 *
 * Nothing here pattern-matches. Substring-matching 'EMS' would sweep in a type
 * nobody checked, which is the /^pass\b/i failure in a different costume.
 */
const INCIDENT_CLASS = Object.freeze({
  FIRE: Object.freeze([
    'Structure Fire', 'Vehicle Fire', 'Brush / Wildland Fire', 'Brush Fire',
    'Wildland Fire', 'Dumpster / Rubbish Fire',
  ]),
  EMS: Object.freeze([
    'Medical / EMS', 'EMS - Cardiac', 'EMS - Trauma',
  ]),
});

/** 'fire' | 'ems' | null. Null means unclassified — never guessed. */
function classifyIncidentType(type) {
  if (typeof type !== 'string') return null;
  if (INCIDENT_CLASS.FIRE.includes(type)) return 'fire';
  if (INCIDENT_CLASS.EMS.includes(type)) return 'ems';
  return null;
}

/**
 * Objectives OF cannot compute, and exactly why. Named in the report rather
 * than omitted, so a chief reads "not captured" instead of a shorter list that
 * looks complete.
 */
const OBJECTIVES_NOT_COMPUTED = Object.freeze([
  { key: 'travel_second_company', n: 4,
    reason: 'needs the staffing on each rig at the moment it arrived (minimum 4) — OF does not join arrival to the riding board' },
  { key: 'travel_ems_first_responder', n: 7,
    reason: 'needs to know which units carry an AED — OF has no unit capability flag' },
  { key: 'travel_ems_als', n: 8,
    reason: 'needs an ALS designation per unit — apparatus type "Ambulance" does not imply ALS' },
]);

/** Exact lookup. Never a prefix, never a regex, never a fuzzy match. */
function segmentByKey(key) {
  return Object.values(SEGMENTS).find((s) => s.key === key) || null;
}
function objectiveByKey(key) {
  return OBJECTIVES.find((o) => o.key === key) || null;
}

module.exports = {
  EDITION,
  INCIDENT_CLASS,
  classifyIncidentType,
  OBJECTIVES_NOT_COMPUTED,
  SEGMENTS,
  SEGMENT_KEYS,
  OBJECTIVES,
  ALARM_HANDLING_TARGETS,
  SPECIAL_CALL_TYPES,
  REPORTING,
  METRIC_STATE,
  segmentByKey,
  objectiveByKey,
};
