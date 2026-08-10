// ⚠️  GENERATED FILE — DO NOT EDIT.
// Source of truth: server/src/utils/serviceOfNotice.js
// Regenerate: node scripts/gen-shared-client-libs.js
//
// This is the ESM mirror of a PURE, server-owned module (logic or vocabulary),
// shared so the offline client and the server reach the SAME verdict / read the
// SAME closed set. If the two ever disagree, a client can show an inspector a state
// the server rejects. A unit test fails the suite if this file goes stale.
// source-sha256: a870c8703e108374c00dbf3b3e8440cd953ee4086bd1fff478ced3bbd36c933c

'use strict';
/**
 * utils/serviceOfNotice.js — PURE service-of-notice logic. No I/O, unit-tested.
 *
 * THE DOCTRINE (researched against live sources, 2026-07-13):
 *
 * 1. A notice of violation is made valid by SERVICE, not by a signature.
 *    IFC §109.3.1: personal service, OR mail, OR leaving it with "some person of
 *    responsibility on the premises." For unattended/abandoned premises: POST at
 *    the entrance AND mail. The fire codes never mention a recipient signature.
 *
 * 2. The occupant's signature is an ACKNOWLEDGMENT OF RECEIPT. It is not agreement
 *    with the findings, and REFUSAL TO SIGN DOES NOT INVALIDATE THE NOTICE and does
 *    not extend the correction deadline. Refusal is an event to RECORD, not a
 *    failure to handle. (The industry's UX is "get the signature" — that is
 *    legally backwards, and it is why refusal has no product path anywhere.)
 *
 * 3. Jones v. Flowers, 547 U.S. 220 (2006). When mailed notice comes back
 *    unclaimed, the government "cannot simply ignore that information" — it must
 *    take additional reasonable steps before a deprivation. Roberts, C.J.:
 *    certified mail's added security "comes at a price — the State also learns
 *    when notice has NOT been received."
 *
 *    THIS CODE IS WHY THAT MATTERS: the moment we ingest a returned/unclaimed
 *    event we MANUFACTURE the constructive knowledge that triggers the duty. A
 *    system that displays "RETURNED UNCLAIMED" and lets the case march on is WORSE
 *    than paper — the department's own software testifies against it. So the
 *    returned→cure cascade is a HARD GATE (see jonesGate below), not advice.
 *
 *    The Court blessed three cheap cures and required no more: resend by ordinary
 *    first-class mail (no signature needed), address it to "occupant", and POST the
 *    premises. It expressly did NOT require an open-ended search for a new address
 *    — so we must not require one either (setting a bar we then fail is its own
 *    liability).
 *
 * NOTE: local ordinances amend IFC/IPMC freely and UETA §18 leaves e-signature
 * acceptance to each agency. Everything configurable is per-DEPARTMENT. Nothing
 * here encodes one state's law as if it were national.
 */

// Methods that put the document in a human's hands on the premises.
const PERSONAL_METHODS = ['personal_service', 'left_with_responsible_person'];
const MAIL_METHODS = ['certified_mail', 'first_class_mail', 'certificate_of_mailing'];

// Outcomes that mean the mail did NOT reach the addressee, and that we KNOW it.
// These are the Jones triggers.
const MAIL_FAILURE_OUTCOMES = ['returned_undelivered', 'unclaimed'];

// Refusal is SERVICE. The person was there, the document was offered. Refusing to
// sign — or even refusing to take it — does not undo delivery.
const REFUSAL_OUTCOMES = ['refused_signature', 'refused_acceptance'];

const live = (records) => (records || []).filter((r) => r && !r.voided_at);

/**
 * Was service EFFECTED at all — i.e. is there at least one rung of the ladder that
 * legally put the notice in front of the responsible party (or posted it)?
 */
function isEffected(r) {
  if (PERSONAL_METHODS.includes(r.method)) {
    // Present-and-refused still counts. Not-present does not.
    return r.outcome !== 'no_party_present';
  }
  if (r.method === 'posted_premises') return r.outcome === 'posted' || r.outcome === 'served';
  if (MAIL_METHODS.includes(r.method)) {
    // Mailing is the operative act in the model codes ("service complete on
    // deposit") — but a mailing we KNOW came back is not notice. Jones.
    return !MAIL_FAILURE_OUTCOMES.includes(r.outcome);
  }
  if (r.method === 'email') return r.outcome === 'served' || r.outcome === 'delivered';
  return false;
}

/**
 * THE JONES GATE.
 *
 * Returns the cure required when we have ingested knowledge that mailed notice
 * failed. Blocking is deliberate: having the returned event and doing nothing is
 * the exact fact pattern Jones condemns.
 *
 * The gate CLEARS when, after the failure, the department did any of the three
 * blessed cures. Posting is the strongest and is what IPMC §107.3 mandates
 * outright ("if the notice is returned... a copy shall be posted").
 */
function jonesGate(records) {
  const rows = live(records);
  const failures = rows.filter((r) => MAIL_FAILURE_OUTCOMES.includes(r.outcome));
  if (!failures.length) return { blocked: false, cures: [] };

  const earliestFailure = failures
    .map((r) => new Date(r.mail_returned_at || r.served_at).getTime())
    .sort((a, b) => a - b)[0];

  // A cure must come AFTER we learned the mail failed — a posting from before the
  // letter bounced is not a response to it.
  const curedBy = rows.filter((r) => {
    const t = new Date(r.served_at).getTime();
    if (!(t >= earliestFailure)) return false;
    if (r.method === 'posted_premises' && (r.outcome === 'posted' || r.outcome === 'served')) return true;
    if (r.method === 'first_class_mail' && !MAIL_FAILURE_OUTCOMES.includes(r.outcome)) return true;
    if (PERSONAL_METHODS.includes(r.method) && r.outcome !== 'no_party_present') return true;
    return false;
  });

  if (curedBy.length) return { blocked: false, cures: curedBy.map((r) => r.id) };

  return {
    blocked: true,
    cures: [],
    // The three steps the Supreme Court actually blessed. No open-ended skip trace.
    required: [
      'Post a copy of the notice in a conspicuous place at or near the entrance (photo + GPS required).',
      'Re-send by ordinary first-class mail — no signature required, so it can simply be left in the box.',
      'Address the re-send to "Occupant" as well as the owner of record.',
    ],
    reason: 'Mailed notice came back undelivered/unclaimed. Because the department now KNOWS the notice did not arrive, it must take additional reasonable steps before enforcement proceeds (Jones v. Flowers, 547 U.S. 220). Posting is also required outright by IPMC §107.3.',
  };
}

/**
 * Derived service status for a notice/inspection.
 *   pending         — nothing served yet
 *   action_required — the Jones gate is blocking (we know the mail failed)
 *   sufficient      — at least one rung of the ladder was effected
 * Also returns the CONTROLLING served_at: every clock (correction deadline, appeal
 * window) runs from the date service was effected, NEVER from the generation date.
 * A wrong clock is a dismissed case.
 */
function serviceStatus(records) {
  const rows = live(records);
  if (!rows.length) {
    return { status: 'pending', servedAt: null, gate: { blocked: false, cures: [] }, effected: [] };
  }
  const gate = jonesGate(rows);
  const effected = rows.filter(isEffected);

  if (gate.blocked) {
    return { status: 'action_required', servedAt: null, gate, effected: effected.map((r) => r.id) };
  }
  if (!effected.length) {
    return { status: 'pending', servedAt: null, gate, effected: [] };
  }
  // The controlling date is the EARLIEST effected service — that's when the
  // responsible party was first put on notice.
  const servedAt = effected
    .map((r) => new Date(r.served_at))
    .sort((a, b) => a - b)[0]
    .toISOString();
  return { status: 'sufficient', servedAt, gate, effected: effected.map((r) => r.id) };
}

/** What a posting record must carry to be worth anything as evidence. */
function postingDefects(r) {
  const defects = [];
  if (!r.posting_photo && !r.posting_photo_present) defects.push('A photo of the posted notice is required.');
  if (r.posting_lat == null || r.posting_lng == null) defects.push('The posting location (GPS) was not captured.');
  // Same doctrine as the dispatch surface: a fix worse than 100 m is not a fix.
  if (r.posting_accuracy_m != null && r.posting_accuracy_m > 100) {
    defects.push(`GPS accuracy was ${Math.round(r.posting_accuracy_m)} m — too coarse to place the posting. Recapture, or note the location in writing.`);
  }
  return defects;
}

const METHOD_LABELS = {
  personal_service:            'Personal service',
  left_with_responsible_person:'Left with a person of responsibility on the premises',
  posted_premises:             'Posted in a conspicuous place at the premises',
  certified_mail:              'Certified mail, return receipt requested',
  first_class_mail:            'First-class mail',
  certificate_of_mailing:      'Certificate of mailing',
  email:                       'Electronic mail',
};

const OUTCOME_LABELS = {
  served:              'served',
  refused_signature:   'served; the recipient declined to sign an acknowledgment of receipt',
  refused_acceptance:  'served; the recipient declined to accept the document, which was left with them',
  no_party_present:    'no responsible party present',
  mailed:              'deposited in the United States Mail, postage prepaid',
  accepted:            'accepted by the Postal Service',
  delivered:           'delivered',
  returned_undelivered:'RETURNED UNDELIVERED',
  unclaimed:           'RETURNED UNCLAIMED',
  posted:              'posted at the premises',
};

export { PERSONAL_METHODS, MAIL_METHODS, MAIL_FAILURE_OUTCOMES, REFUSAL_OUTCOMES, METHOD_LABELS, OUTCOME_LABELS, isEffected, jonesGate, serviceStatus, postingDefects };
