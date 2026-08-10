// utils/parClock.js — the fireground PAR clock.
//
// ─── I GOT THIS WRONG ONCE. READ THIS BEFORE CHANGING IT. ────────────────────
//
// The first version of this file anchored the PAR clock to DISPATCH time and
// asserted, in a unit test, that this was correct. That was a JUDGMENT dressed up
// as a fact. Matt (a captain) challenged it, research followed, and the premise
// was half wrong. What the evidence actually says:
//
// 1. THE STANDARD'S ANCHOR IS "FIRST UNIT ON SCENE", NOT DISPATCH.
//    NFPA 1500 §8.2.4: the communications center "shall start an incident clock
//    when the first arriving unit is on-scene of a working structure fire or
//    hazardous materials incident," and §8.2.4.1 requires dispatch to notify the IC
//    "at every 10-minute increment." §8.2.4.2 says the IC may CANCEL it.
//
// 2. BUT DISPATCH-ANCHORING IS EXPLICITLY SANCTIONED FOR *OUR* MARKET.
//    Annex A.8.2.4: "Some fire departments can also wish to be provided with
//    reports of elapsed time-from-dispatch. This method can be more appropriate for
//    fire departments with LONG TRAVEL TIMES where significant incident progress
//    could have occurred prior to the first unit arrival." That is the rural /
//    volunteer profile — OpenFirehouse's core customer. So BOTH anchors are
//    legitimate, and the choice belongs to the department, not to us.
//
// 3. THERE IS NO NFPA-MANDATED PAR INTERVAL. "PAR every 20 minutes" is folklore
//    that departments wrote into their own SOGs. Never cite a standard for it, and
//    never hardcode it. Every shipped competitor makes it configurable; so do we.
//
// 4. PAR IS BENCHMARK-DRIVEN FIRST, CLOCK-DRIVEN SECOND. New Jersey's statewide
//    regulation (N.J.A.C. 5:75-2.4(f)) lists five PAR triggers — missing
//    firefighter, emergency evacuation, incident under control, changing attack
//    modes, IC discretion — and ZERO time intervals. An entire state mandates the
//    benchmarks and no clock at all. A product that only fires on a wall clock is
//    doctrinally wrong. See parBenchmarkTriggers() below.
//
// 5. THE REAL INTEGRATION RISK IS DISAGREEMENT, NOT DATA. In many jurisdictions
//    DISPATCH is already giving the IC 10-minute elapsed-time notifications over
//    the radio (it's their mandated job). If our board's clock is anchored
//    differently from dispatch's clock, THE IC HEARS TWO DIFFERENT NUMBERS FOR THE
//    SAME FIRE. That is the failure mode to design against — which is why the
//    anchor is a department setting AND is labelled on screen. Never show a
//    life-safety value without saying what it counts from.
//
// 6. THE PAR CLOCK IS NOT THE AIR CLOCK. A single incident-wide PAR interval
//    cannot track any crew's SCBA, because crews enter the hazard zone at different
//    times — a 20-minute PAR at T+40 says nothing about the crew that went interior
//    at T+38. The air/work-cycle clock is a SEPARATE, PER-CREW hazard-zone timer.
//    Do not merge them. (Not built yet — Phase 3.)
//
// Pure functions, no React, no I/O. The fireground's most time-critical number does
// not get to live untested inside a 2,900-line component.

/** Where the incident clock counts from. A DEPARTMENT setting, not our opinion. */
export const PAR_ANCHOR = {
  ON_SCENE: 'on_scene',   // NFPA 1500 §8.2.4 default — first unit on scene
  DISPATCH: 'dispatch',   // Annex A.8.2.4 — for long-travel (rural/volunteer) depts
};

/** Human-readable, for the on-screen label. Ambiguity here is a safety defect. */
export const PAR_ANCHOR_LABEL = {
  [PAR_ANCHOR.ON_SCENE]: 'since first unit on scene',
  [PAR_ANCHOR.DISPATCH]: 'since dispatch',
};

/**
 * The timestamp the PAR interval counts from.
 * A completed PAR always wins — it resets the clock, by definition.
 * Otherwise it's the department's configured anchor.
 *
 * DEFAULT = DISPATCH (changed 2026-07-14, after the market/standards research).
 * Why dispatch and not the NFPA §8.2.4 "first on scene" default:
 *   • Dispatch time is present on 100% of calls (CAD hands it to us). ON-SCENE
 *     time only exists if a human — a dispatcher, or now a CAD status feed —
 *     marks it, which happened on only ~60% of prod calls. Anchoring the DEFAULT
 *     to on-scene meant the clock SILENTLY NEVER STARTED on ~40% of calls.
 *   • The market-leading command board anchors its incident clock to the first
 *     dispatcher keystroke (call creation) for exactly this reason. We match it.
 *   • NFPA 1500 Annex A.8.2.4 explicitly sanctions elapsed-from-dispatch for
 *     departments with long travel times — the volunteer/rural profile.
 * A department may still CHOOSE the on-scene anchor (now that CAD-delivered
 * arrival makes it reliable — see cad/processStatusUpdate). That choice is
 * honoured below; it is just not the fail-open default.
 */
export function parBasis(incident, anchor = PAR_ANCHOR.DISPATCH) {
  const last = incident?.parHistory?.at?.(-1)?.time;
  if (last) return { time: last, from: 'last PAR' };

  const dispatched = incident?.milestones?.dispatched || null;

  // ON-SCENE, IN PRIORITY ORDER:
  //   1. `firstOnSceneAt` — DERIVED from unit_status_history: the moment DISPATCH
  //      flipped the first unit to on_scene after radio traffic. This is the real
  //      event, timestamped and attributed. It is what the radio said.
  //   2. `milestones.onScene` — the IC's hand-stamped milestone button. A fallback,
  //      not the truth. It exists only because a department might not be running
  //      unit statuses.
  //
  // The derived time WINS. A safety-critical clock counts from what actually
  // happened, not from what someone remembered to press.
  const onScene = incident?.firstOnSceneAt || incident?.milestones?.onScene || null;

  if (anchor === PAR_ANCHOR.DISPATCH) {
    return dispatched ? { time: dispatched, from: PAR_ANCHOR_LABEL[PAR_ANCHOR.DISPATCH] } : null;
  }
  // ON_SCENE anchor. If nobody is on scene yet, there is nothing to account FOR —
  // crews are still responding, nobody is in a hazard zone. We do NOT silently
  // fall back to dispatch and start a clock the department didn't ask for; we
  // return null and the chip stays off until the first unit arrives.
  return onScene ? { time: onScene, from: PAR_ANCHOR_LABEL[PAR_ANCHOR.ON_SCENE] } : null;
}

/**
 * Seconds until the next PAR is due. NEGATIVE = seconds OVERDUE.
 * null = no timer, or no basis yet (units still responding on an ON_SCENE anchor).
 */
export function parRemainingSeconds(incident, now = Date.now(), anchor = PAR_ANCHOR.DISPATCH) {
  const interval = Number(incident?.parInterval) || 0;
  if (interval <= 0) return null;               // no timer set — NOT the same as "due"

  const basis = parBasis(incident, anchor);
  if (!basis) return null;

  const basisMs = new Date(basis.time).getTime();
  if (Number.isNaN(basisMs)) return null;       // an unparseable basis is NOT "due now"

  const elapsed = Math.floor((now - basisMs) / 1000);
  return interval * 60 - elapsed;               // deliberately NOT clamped at zero
}

export function isParOverdue(remaining) {
  return remaining != null && remaining <= 0;
}

/** m:ss — for both "PAR in 4:12" and "PAR OVERDUE 4:12". */
export function fmtMMSS(totalSecs) {
  const s = Math.max(0, Math.floor(Math.abs(totalSecs)));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The chip label. Overdue reads as a MAGNITUDE — never a flat "OVERDUE".
 * 30 seconds late and 11 minutes late are different situations and must not read
 * the same.
 */
export function parChipLabel(remaining) {
  if (remaining == null) return null;
  return isParOverdue(remaining)
    ? `PAR OVERDUE ${fmtMMSS(-remaining)}`
    : `PAR in ${fmtMMSS(remaining)}`;
}

export function parChipSeverity(remaining) {
  if (remaining == null) return null;
  if (remaining <= 0) return 'overdue';
  if (remaining <= 120) return 'due-soon';
  return 'ok';
}

// ─── BENCHMARK TRIGGERS — the doctrinal core ────────────────────────────────
// The interval is a BACKSTOP. These are the actual doctrine. Sourced from the NJ
// statewide regulation (N.J.A.C. 5:75-2.4(f)) plus the common SOG set.
//
// NEVER auto-run a PAR off these. Same rule as OF's unit-status radio doctrine:
// the system PROMPTS, a HUMAN performs the roll call over the radio and
// acknowledges. An expired timer that self-clears is a lie, and a PAR the machine
// "completed" is not a PAR.
// Each benchmark declares WHICH milestone keys actually fire it. This is not
// decoration — a benchmark whose source event does not exist on the board would
// silently never fire, and we would ship a "benchmark-driven PAR" that reports
// success and delivers nothing. So the gap is written down, in code, honestly:
//
// ⚠️ FIVE OF SIX ARE NOW LIVE (2026-07-14). The Command Board's FIREGROUND EVENTS
//    row declares evacuation / strategyChange / collapse / allClear, and the
//    milestone strip declares underControl. Each stamps the key below and raises
//    the PAR REQUIRED prompt.
//
//    STILL DARK — and it is the most important one:
//      • mayday → needs the MAYDAY button (Phase 4). Until that ships, the single
//        benchmark that matters most CANNOT fire. Do not let anyone call
//        benchmark-driven PAR "finished" while a MAYDAY raises nothing.
export const PAR_BENCHMARKS = [
  { key: 'mayday',          label: 'MAYDAY — firefighter missing or down', milestoneKeys: ['mayday'] },
  { key: 'evacuation',      label: 'Emergency evacuation ordered',         milestoneKeys: ['evacuation'] },
  { key: 'strategy_change', label: 'Strategy change (offensive ⇄ defensive)', milestoneKeys: ['strategyChange'] },
  { key: 'hazardous_event', label: 'Sudden hazardous event',               milestoneKeys: ['collapse', 'flashover', 'explosion'] },
  { key: 'all_clear',       label: 'Primary search all-clear',             milestoneKeys: ['allClear', 'primarySearch'] },
  // The one that is LIVE today. 'controlled' / 'mitigated' are the hazmat and
  // non-structural variants of the same benchmark.
  { key: 'under_control',   label: 'Incident under control',               milestoneKeys: ['underControl', 'controlled', 'mitigated'] },
];

/** Which benchmarks are wired to a real board action TODAY. Used by tests. */
export const PAR_BENCHMARKS_LIVE = [
  'mayday', 'evacuation', 'strategy_change', 'hazardous_event', 'all_clear', 'under_control',
];

/**
 * Which benchmarks have fired but not yet been answered with a PAR?
 * These should be PROMPTING the IC right now.
 *
 * NEVER auto-run a PAR off this. The system prompts; a HUMAN performs the roll
 * call over the radio and acknowledges. A PAR the machine "completed" is not a PAR.
 */
export function parBenchmarkTriggers(incident) {
  const milestones = incident?.milestones || {};
  const lastPar    = incident?.parHistory?.at?.(-1)?.time;
  const lastParMs  = lastPar ? new Date(lastPar).getTime() : 0;

  return PAR_BENCHMARKS.filter((b) => {
    // The EARLIEST stamped source event for this benchmark.
    const stamps = b.milestoneKeys
      .map((k) => milestones[k])
      .filter(Boolean)
      .map((t) => new Date(t).getTime())
      .filter((ms) => !Number.isNaN(ms));
    if (!stamps.length) return false;
    return Math.max(...stamps) > lastParMs;   // fired AFTER the last PAR → still owed
  });
}
