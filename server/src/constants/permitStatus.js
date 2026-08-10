'use strict';
/**
 * permitStatus.js — THE canonical permit-status vocabulary (Phase 3, module 3.0).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Permit status was FREE TEXT on the server and a hard-coded literal on the client
 * (client/src/data/fireInspections.js PERMIT_STATUSES). That is the exact drift the
 * repo has now paid for twice:
 *   - inspection results: three surfaces, three vocabularies, and a `/^pass\b/i`
 *     regex that let "Passed" and "Passing" silently defeat a life-safety control
 *     (migration 0056 closed it).
 *   - violation status: a violation marked 'Abated' stayed "open" forever in every
 *     count because only the literal 'Corrected' was checked (constants/violationStatus.js).
 * Permit status is a CONTROL VALUE — it decides whether a permit is valid, expired,
 * or revoked. It gets the same treatment: THE ENUM LIVES ON THE SERVER OR IT LIVES
 * NOWHERE, and nothing may ever pattern-match a status.
 *
 * THE TRI-STATE CONTRACT (mirrors constants/inspectionResult.js — deliberately)
 * ---------------------------------------------------------------------------
 * canonicalizePermitStatus(raw) returns THREE distinct things:
 *   - a PERMIT_STATUS string  → recognized, safe to store
 *   - null                    → nothing supplied (legal: caller applies its default)
 *   - undefined               → UNMAPPABLE (illegal: the caller MUST reject, 400)
 * The undefined case is the whole point. A permit status that cannot be mapped is
 * NEVER defaulted to something convenient — a record silently becoming 'Active' is
 * precisely the failure this file exists to prevent. Compare violationStatus.js,
 * which deliberately fails OPEN to 'Open' because there the safe direction is
 * "still a problem"; here there is no safe direction, so we refuse instead.
 *
 * The legacy map holds CASE/WHITESPACE normalization only. It deliberately invents
 * NO synonyms — 'Issued' is not silently mapped to 'Active', because nobody has
 * established that a department using that word means what we would assume. An
 * unmappable legacy value surfaces for a human (spec §5.1), it does not get guessed.
 *
 * SCOPE NOTE (read before adding a value)
 * ---------------------------------------
 * This is the vocabulary that exists TODAY, codified so it cannot drift. The full
 * operational-permit lifecycle — SUSPENDED (distinct from revoked: different due
 * process, reversible, and an appeal STAYS it), TERMINATED_BY_TRANSFER (IFC §105.3.1:
 * a change of occupancy/operation/tenancy/ownership terminates the permit and requires
 * a new one), typed denial reasons, and the enumerated IFC §105.6 revocation grounds
 * — lands in module 3.1 WITH the issuance engine that makes those states mean
 * something, plus its own migration and CHECK constraint. Do not add a state here
 * without the transition that produces it; a status nothing can reach is a lie.
 *
 * KEEP IN LOCKSTEP: client/src/data/fireInspections.js PERMIT_STATUSES.
 * server/src/tests/permitStatus.test.js reads that client literal and FAILS THE
 * SUITE on drift — the same fence violationStatus.js uses. Change both together.
 */

// Order is the lifecycle reading order, not alphabetical — it is what the UI renders.
const PERMIT_STATUSES = Object.freeze([
  'Pending',              // record created / applied for; NOT yet issued. The create default.
  'Active',               // issued and in force. WRITTEN ONLY BY THE ISSUANCE ENGINE (3.1a).
  'AboutToExpire',        // 3.1b (0094) — still IN TERM, inside the notice window. A VALID
                          // permit: the holder is operating lawfully. Renewal opens here.
                          // Written only by the scheduled job.
  'Delinquent',           // 3.1b (0094) — term ENDED, inside grace. Still renewable; late
                          // fees peg to end-of-grace. Whether the OPERATION is lawful during
                          // grace is the department's ruling (treat_delinquent_as_valid).
                          // Written only by the scheduled job.
  'Expired',              // past end-of-grace. THE TRAPDOOR: renewal is WITHDRAWN here.
                          // ⚠ see EXPIRY note below.
  'Revoked',              // withdrawn on an enumerated ground (IFC §105.4 — permitGrounds.js)
  'Denied',               // application refused
  'TerminatedByTransfer', // IFC §105.3.1 — a change of occupancy/operation/tenancy/ownership
                          // terminates the permit; a successor is minted (3.1a)
]);

/**
 * ─────────────────────────────────────────────────────────────────────────────────────
 * THE FACET TABLE — 3.1b's fence. READ THIS BEFORE ADDING A STATUS.
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY IT EXISTS. 3.1b inserts two job-written statuses between "in force" and "dead"
 * (AboutToExpire, Delinquent — migration 0094). The moment those land, the question
 * "is this permit valid?" STOPS being `status === 'Active'`: an about-to-expire permit
 * is a perfectly valid permit whose holder is operating lawfully. Every reader of the
 * column that compares to a literal becomes wrong SILENTLY, because nothing throws —
 * the answer is merely false when it should be true.
 *
 * This repo has paid for that exact shape three times already:
 *   - unit status: `dispatchable` is a SET, not `=== 'available'` (migration 0022, and
 *     `returning` being dispatchable is the whole subtlety);
 *   - inspection result: a `/^pass\b/i` regex let "Passed" and "Passing" through a
 *     life-safety control (migration 0056);
 *   - violation status: 'Abated' counted as open forever because only 'Corrected' was
 *     checked (constants/violationStatus.js).
 *
 * SO: every status carries an explicit facet row, the sets are DERIVED from it, and
 * tests/permitStatus.test.js asserts the facet keys and PERMIT_STATUSES are the same
 * set in both directions. Adding a status without classifying it FAILS THE SUITE. That
 * is deliberate — the failure mode is not a wrong facet, it is a forgotten one.
 *
 * ⚠ THIS FILE RENDERS NO LEGAL VERDICT. Matt's ruling, 2026-07-27: "we shouldn't say
 * anything about it being lawful, that's not our job." The facet below is `inForce` — a
 * statement about what the RECORD says (the permit is inside its term) — and deliberately
 * NOT `valid`, which reads as a conclusion about whether a business may lawfully operate.
 * That conclusion belongs to the AHJ, made by a human with the rest of the context.
 *
 * A previous draft of this file made it a per-department boolean. That looked humble and
 * was not: a CONFIGURABLE legal conclusion is still a legal conclusion, and a department
 * that never opened its settings would have received a verdict it never chose. The only
 * safe number of legal verdicts for this product to render is ZERO, and "configurable" is
 * not zero. The column was dropped in 0096. See its header.
 *
 * Facets:
 *   issued   — an issuance event happened; the record is a finalized legal instrument.
 *   inForce  — the permit is inside its term, per the record. A FACT, not a verdict.
 *   revocable / terminable — the permit is live enough to be withdrawn (IFC §105.4) or
 *              to be terminated by a transfer (§105.3.1).
 *   terminal — end of the lifecycle. Nothing transitions out. No un-revoke, no reopen.
 *
 * The two 3.1b rows and why they carry what they carry (spec §2, §3.4):
 *   AboutToExpire → issued, inForce, revocable, terminable, not terminal, RENEWABLE.
 *                   Inside its term. The row that makes `=== 'Active'` wrong.
 *   Delinquent    → issued, NOT inForce (the term ended — a fact), revocable, terminable,
 *                   not terminal, RENEWABLE. What the operator needs is the DATES, not a
 *                   verdict: term ended on X, renewable until Y. Say those and stop.
 *   Expired       → renewal is WITHDRAWN. It is the trapdoor, not the start of grace;
 *                   grace lives UPSTREAM of it (spec §0.1 — the market shape, verified).
 */
const PERMIT_STATUS_FACETS = Object.freeze({
  Pending:              { issued: false, inForce: false, revocable: false, terminable: false, terminal: false, renewable: false },
  Active:               { issued: true,  inForce: true,  revocable: true,  terminable: true,  terminal: false, renewable: false },
  // In term, inside the notice window. IN FORCE — this is the row that makes `=== 'Active'`
  // wrong, and the whole reason the facet table exists.
  AboutToExpire:        { issued: true,  inForce: true,  revocable: true,  terminable: true,  terminal: false, renewable: true  },
  // Term ended, in grace. inForce is FALSE — that is a FACT about the record (the term
  // ended), not a verdict about whether the business may operate. What the operator needs
  // here is the DATES: term ended on X, renewable until Y. Still revocable and terminable:
  // a permit in grace is an outstanding instrument that can be withdrawn on a §105.4
  // ground or ended by a transfer.
  Delinquent:           { issued: true,  inForce: false, revocable: true,  terminable: true,  terminal: false, renewable: true  },
  // The trapdoor. Renewal is WITHDRAWN — the documented market behaviour, verified twice.
  Expired:              { issued: true,  inForce: false, revocable: false, terminable: false, terminal: false, renewable: false },
  Revoked:              { issued: true,  inForce: false, revocable: false, terminable: false, terminal: true,  renewable: false },
  Denied:               { issued: false, inForce: false, revocable: false, terminable: false, terminal: true,  renewable: false },
  TerminatedByTransfer: { issued: true,  inForce: false, revocable: false, terminable: false, terminal: true,  renewable: false },
});

const statusesWhere = (facet) =>
  Object.freeze(PERMIT_STATUSES.filter((s) => PERMIT_STATUS_FACETS[s]?.[facet]));

/**
 * An issuance event happened. NOT the same as "valid" — an expired or revoked permit was
 * still issued, and that is precisely why it is finalized and no longer editable.
 */
const ISSUED_PERMIT_STATUSES = statusesWhere('issued');

/** Statuses under which a permit is currently valid to operate. */
const IN_FORCE_PERMIT_STATUSES = statusesWhere('inForce');

/** Live enough to withdraw on an enumerated ground (IFC §105.4). */
const REVOCABLE_PERMIT_STATUSES = statusesWhere('revocable');

/** Live enough for a transfer to terminate it and mint a successor (IFC §105.3.1). */
const TERMINABLE_PERMIT_STATUSES = statusesWhere('terminable');

/**
 * Renewal is available. EMPTY UNTIL 3.1b — there is no renewal path yet, and a set that
 * claims otherwise would be a lie the UI could act on. When 0094 lands this becomes
 * [AboutToExpire, Delinquent], and `Expired` stays OUT: the documented market behaviour
 * is that the renewal option is REMOVED at Expired (spec §0.1).
 */
const RENEWABLE_PERMIT_STATUSES = statusesWhere('renewable');

/**
 * Terminal states — a permit here has reached the end of its own lifecycle. Nothing
 * transitions OUT of these in 3.1a: there is no un-revoke, no un-terminate, and no
 * "reopen". Corrections to a terminal legal act are a governed amendment, and that path
 * does not exist yet — so the honest answer is a clean refusal, not a silent mutation.
 *
 * ⚠ 'Expired' is deliberately NOT terminal. A term simply ended; the record is finalized
 * (issued: true) but 3.1b's renewal path reaches back to it through the supersession
 * spine. Terminal means "no further lifecycle", not "no longer valid".
 */
const TERMINAL_PERMIT_STATUSES = statusesWhere('terminal');

/**
 * ⚠ EXPIRY — READ THIS BEFORE WIRING ANYTHING TO 'Expired'.
 *
 * Expiry is the STORED ladder status (Active → AboutToExpire → Delinquent → Expired),
 * written ONLY by the scheduled permit-expiry job (3.1b — utils/permitLadder.js,
 * jobs/permitExpiry.js). The 3.1a read-time derivation (`is_expired`, isDerivedExpired)
 * is DELETED: its own header called it a stopgap, and the market audit found ZERO
 * platforms that derive expiry at read time (PHASE3-31B-MARKET-AUDIT §3 row 1). Do not
 * re-grow a second evaluator on a read path — two evaluators of one flag WILL drift.
 *
 * The asymmetry that governs this, and it is not arbitrary: auto-EXPIRY is fine and is
 * universal in the market — a term simply ends. Auto-REVOCATION must NEVER be built:
 * enumerated grounds, written notice and a hearing right make it statutorily impossible,
 * and a timer cannot find a material misrepresentation. Same doctrine as "a timer must
 * not decide a call is over."
 */

// The default for a newly created permit record. This reconciles a real
// disagreement found in 3.0: routes/fiPermits.js POST sent 'Pending' while
// db.js fiPermCreate fell back to 'Active' — two defaults for one column, so the
// answer depended on which caller you came through. 'Pending' wins because a
// permit record that has been created has NOT yet been issued, and the market
// lifecycle gates issuance behind payment/licence/inspection (spec R3).
const DEFAULT_PERMIT_STATUS = 'Pending';

// legacy/raw → canonical. Keys are compared lowercased + trimmed.
// NORMALIZATION ONLY. No invented synonyms. See the header.
const LEGACY_PERMIT_STATUS_MAP = Object.freeze({
  pending: 'Pending',
  active:  'Active',
  expired: 'Expired',
  // 3.1b (0094). Both spellings normalize for the same reason TerminatedByTransfer does:
  // the wire format is camel-case and a hand-written query or import may use the spaced
  // label. Case/whitespace normalization of the same word — still not a synonym.
  abouttoexpire:     'AboutToExpire',
  'about to expire': 'AboutToExpire',
  delinquent:        'Delinquent',
  revoked: 'Revoked',
  denied:  'Denied',
  // 3.1a. Both spellings normalize because the wire format is camel-case and a hand-written
  // query or import may use the spaced label. This is CASE/WHITESPACE normalization of the
  // same word — still not a synonym. 'Issued' is deliberately NOT mapped to 'Active': nobody
  // has established that a department writing "Issued" means what we would assume, and
  // guessing a control value onto a legal record is the whole thing this file prevents.
  terminatedbytransfer:   'TerminatedByTransfer',
  'terminated by transfer': 'TerminatedByTransfer',
});

/**
 * @returns {string|null|undefined} canonical status · null (none supplied) ·
 *          undefined (UNMAPPABLE — caller must reject with 400, never default)
 */
function canonicalizePermitStatus(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return undefined;
  const key = raw.trim().toLowerCase();
  if (key === '') return null;
  return LEGACY_PERMIT_STATUS_MAP[key]; // undefined when unmappable — deliberate
}

/**
 * Exact match only. Nothing here ever pattern-matches.
 *
 * Answers ONE narrow question: is this permit inside its term, per the record? That is a
 * fact the record knows. It is NOT a ruling on whether a business may lawfully operate —
 * this product does not make that call (Matt, 2026-07-27), and a caller that needs it
 * should show the dates and let the AHJ decide.
 *
 * ⚠ THIS FUNCTION USED TO TAKE AN `opts` ARGUMENT, and removing it is the point. It
 * carried `treatDelinquentAsValid`, a per-department switch deciding whether an in-grace
 * permit counted as lawful. Making it configurable LOOKED like deferring to the department
 * and was not: a configurable legal conclusion is still a legal conclusion, and a
 * department that never opened its settings would have received a verdict it never chose.
 * The only safe number of legal verdicts here is ZERO, and "configurable" is not zero.
 * Column dropped in 0096; do not reintroduce either the argument or the column.
 */
function isPermitInForce(status) {
  return IN_FORCE_PERMIT_STATUSES.includes(status);
}

/** Exact match only. An issuance event happened — the record is a finalized instrument. */
function isIssuedPermitStatus(status) {
  return ISSUED_PERMIT_STATUSES.includes(status);
}

/** Exact match only. IFC §105.4 revocation is available. */
function isRevocablePermitStatus(status) {
  return REVOCABLE_PERMIT_STATUSES.includes(status);
}

/** Exact match only. IFC §105.3.1 terminate-and-reissue is available. */
function isTerminablePermitStatus(status) {
  return TERMINABLE_PERMIT_STATUSES.includes(status);
}

/** Exact match only. EMPTY until 3.1b ships the renewal path — see the set's note. */
function isRenewablePermitStatus(status) {
  return RENEWABLE_PERMIT_STATUSES.includes(status);
}

/** Exact match only. A terminal permit accepts no further lifecycle transition. */
function isTerminalPermitStatus(status) {
  return TERMINAL_PERMIT_STATUSES.includes(status);
}

module.exports = {
  PERMIT_STATUSES,
  PERMIT_STATUS_FACETS,
  ISSUED_PERMIT_STATUSES,
  IN_FORCE_PERMIT_STATUSES,
  REVOCABLE_PERMIT_STATUSES,
  TERMINABLE_PERMIT_STATUSES,
  RENEWABLE_PERMIT_STATUSES,
  TERMINAL_PERMIT_STATUSES,
  DEFAULT_PERMIT_STATUS,
  LEGACY_PERMIT_STATUS_MAP,
  canonicalizePermitStatus,
  isPermitInForce,
  isIssuedPermitStatus,
  isRevocablePermitStatus,
  isTerminablePermitStatus,
  isRenewablePermitStatus,
  isTerminalPermitStatus,
};
