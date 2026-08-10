'use strict';
/**
 * permitGrounds.js — THE canonical revocation-ground vocabulary (Phase 3, module 3.1a).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A revocation withdraws a legal instrument from a business. It can never be reason-free,
 * and the reason can never be a free-text box — that is the same failure class as the
 * `/^pass\b/i` regex that let "Passed" silently defeat a life-safety control (closed by
 * migration 0056), and it is also, notably, exactly what the one competitor product that
 * ships revocation at all does. A free-text reason cannot be counted, cannot be reported
 * on, and cannot be defended when someone asks "on what ground did you revoke this?"
 *
 * THE CORRECTION THIS FILE ENCODES (read before editing the list)
 * --------------------------------------------------------------
 * An earlier draft of the Phase 3 spec said IFC §105.4 enumerates FIVE grounds. It
 * enumerates SEVEN. The two it had dropped are the two that fire AFTER issuance —
 * CONDITION_VIOLATED and NONCOMPLIANCE_WITH_ORDER — which are the most common real-world
 * revocations, because they arise from what an inspector finds rather than from a defect
 * in the original application. A product built on the five-ground list could not have
 * expressed the ordinary case.
 *
 * WHY THE SET IS NOT HARD-CLOSED, AND WHY THAT IS NOT A LOOPHOLE
 * -------------------------------------------------------------
 * The model code introduces its list with "including, but not limited to". It is
 * ILLUSTRATIVE, not exhaustive, and adopting jurisdictions add their own grounds. So a
 * hard-closed set of seven would BLOCK A LAWFUL REVOCATION — the product would tell a
 * fire official they may not do something their code plainly permits.
 *
 * LOCAL_GROUND is the answer, and it is a coded value with a CONTRACT, not an escape
 * hatch back to free text: it is refused unless a citation to the local provision
 * accompanies it (enforced in the engine AND by a Postgres CHECK, migration 0092). The
 * control value therefore stays exactly-matched and enumerable in a report, while the
 * code's own "not limited to" stays lawful.
 *
 * THE GROUND AND THE BASIS ARE BOTH REQUIRED, AND ARE NOT THE SAME THING
 * ---------------------------------------------------------------------
 * The ground says what KIND of failure this is (a closed, countable control value).
 * The basis says what actually HAPPENED (free text, the historical record).
 * Neither substitutes for the other. Same shape as inspectionResult.js, where the coded
 * `result_code` is the only thing any decision may read and the free-text `result` is
 * retained verbatim as the record.
 *
 * NOTHING HERE MAY EVER BE PATTERN-MATCHED. Exact comparison only.
 *
 * NO TIMER MAY EVER PRODUCE A REVOCATION. Enumerated grounds, written notice and a
 * hearing right make automatic revocation statutorily impossible — a timer cannot find a
 * material misrepresentation. Auto-EXPIRY is fine and universal in the market;
 * auto-REVOCATION must never be built. Same doctrine as "a timer must not decide a call
 * is over."
 *
 * KEEP IN LOCKSTEP: the CHECK constraint in migration 0092 / db.js, and the client
 * picker in client/src/data/fireInspections.js. permitGrounds.test.js reads the client
 * literal from disk and FAILS THE SUITE on drift — the same fence permitStatus.js uses.
 */

/** The seven model grounds (IFC §105.4 in the 2021/2024 editions; §105.5 in 2018). */
const MODEL_REVOCATION_GROUNDS = Object.freeze([
  'MISREPRESENTATION',        // false statement / misrepresentation of material fact in the
                              // application, plans, or a condition of the permit
  'DIFFERENT_LOCATION',       // permit used for a location or establishment other than issued
  'DIFFERENT_ACTIVITY',       // permit used for a condition or activity other than listed
  'CONDITION_VIOLATED',       // conditions and limitations set forth in the permit violated
  'DIFFERENT_PERSON',         // permit used by a person or firm other than the name issued to
  'NONCOMPLIANCE_WITH_ORDER', // permittee failed, refused or neglected to comply with orders
                              // or notices duly served, within the time provided
  'ISSUED_IN_ERROR',          // issued in error or in violation of an ordinance, regulation
                              // or the code
]);

/** A ground adopted locally beyond the model code. REQUIRES a citation — see the header. */
const LOCAL_REVOCATION_GROUND = 'LOCAL_GROUND';

const REVOCATION_GROUNDS = Object.freeze([
  ...MODEL_REVOCATION_GROUNDS,
  LOCAL_REVOCATION_GROUND,
]);

/** Human labels for the UI. Display only — NEVER an input to a decision. */
const REVOCATION_GROUND_LABELS = Object.freeze({
  MISREPRESENTATION:        'Material misrepresentation in the application',
  DIFFERENT_LOCATION:       'Used at a location other than the one permitted',
  DIFFERENT_ACTIVITY:       'Used for an activity other than the one permitted',
  CONDITION_VIOLATED:       'A condition of the permit was violated',
  DIFFERENT_PERSON:         'Used by a person or firm other than the permittee',
  NONCOMPLIANCE_WITH_ORDER: 'Failure to comply with a served order or notice in time',
  ISSUED_IN_ERROR:          'Issued in error or contrary to code',
  LOCAL_GROUND:             'A ground adopted locally (citation required)',
});

/**
 * Exact match only. No trimming, no case folding, no synonyms — unlike permitStatus.js,
 * this value is never supplied by a legacy record or a free-text import. It comes from a
 * picker the server defined. If it does not match exactly, it is wrong, and guessing what
 * an operator "meant" on a revocation is precisely the thing that must not happen.
 */
function isValidRevocationGround(ground) {
  return REVOCATION_GROUNDS.includes(ground);
}

/** True when this ground carries the citation contract. */
function requiresCitation(ground) {
  return ground === LOCAL_REVOCATION_GROUND;
}

/**
 * The single validation entry point. Returns null when the revocation is well-formed,
 * or { code, message } describing exactly what is missing.
 *
 * Callers MUST use this rather than re-deriving the rules — the Postgres CHECKs in 0092
 * enforce the same three things independently, and the two must not drift. The database
 * is the control; this exists to give the operator an honest answer instead of a 500.
 */
function validateRevocation({ ground, citation, basis } = {}) {
  if (ground === undefined || ground === null || ground === '') {
    return { code: 'REVOCATION_GROUND_REQUIRED',
      message: 'A revocation requires a ground. It can never be reason-free.' };
  }
  if (!isValidRevocationGround(ground)) {
    return { code: 'INVALID_REVOCATION_GROUND',
      message: `Unrecognized revocation ground: ${JSON.stringify(ground)}` };
  }
  if (requiresCitation(ground) && !String(citation ?? '').trim()) {
    return { code: 'LOCAL_GROUND_CITATION_REQUIRED',
      message: 'A local ground must cite the local provision it rests on. Without a citation it is not a coded ground — it is free text wearing a code.' };
  }
  if (!String(basis ?? '').trim()) {
    return { code: 'REVOCATION_BASIS_REQUIRED',
      message: 'A revocation requires a written basis describing what happened. The ground says what kind; the basis says what occurred.' };
  }
  return null;
}

module.exports = {
  MODEL_REVOCATION_GROUNDS,
  LOCAL_REVOCATION_GROUND,
  REVOCATION_GROUNDS,
  REVOCATION_GROUND_LABELS,
  isValidRevocationGround,
  requiresCitation,
  validateRevocation,
};
