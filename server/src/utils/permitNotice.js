'use strict';
/**
 * utils/permitNotice.js — expiry notices for the permit ladder (Phase 3, 3.1b).
 * Spec: docs/PHASE3-31B-CATALOGUE-EXPIRY-RENEWAL-SPEC-2026-07-27.md §3.6, §0.1
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * It is the templated about-to-expire / late / expired notice the market ships. Spec §0.1
 * records the agency-layer shape from a large municipal fire department's own operational-
 * permit instructions: invoice at −30 days · late notice at +30 days · a renewable post-term
 * window · then cancellation. Those artifacts are REMINDERS AND INVOICES.
 *
 * It is NOT a violation notice. It does not touch fi_notices, fi_notice_service, the Jones
 * v. Flowers gate, posting photos, GPS or the inspector-attestation gate. No researched
 * source — neither vendor corpus, none of the three government artifacts — puts proof of
 * service on a permit expiry reminder. Attaching it would be MORE than the market, which R1
 * forbids exactly as firmly as it forbids less.
 *
 * It is also not a second notification ENGINE: no new scheduler (it hangs off the existing
 * permit-expiry cron), no new delivery mechanism (the same dormant-safe Resend call shape
 * routes/fiNotices.js already uses), no new template system.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 THE COPY STATES FACTS AND REFUSES TO STATE A LEGAL CONCLUSION
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 0096 dropped `departments.treat_delinquent_as_valid` because "a configurable legal
 * conclusion is still a legal conclusion" — a department that never touched its settings
 * would have got a verdict it never chose. The same restraint binds this copy.
 *
 * So a delinquent notice says the term ended on X and renewal is available until Y. It does
 * NOT say the holder may not operate. Whether a permit in grace is lawful to operate on is a
 * question this product does not answer (Matt, 2026-07-27), and an automated email is the
 * very last place to start answering it.
 *
 * ⚠ DELIVERY: jobs/permitExpiry.js `deliverQueuedNotices` (same Resend shape as
 * routes/fiNotices.js) attempts every queued permittee notice on each nightly run, and is
 * env-conditional: no RESEND_API_KEY → nothing attempted, rows stay 'queued'.
 *
 * 🔴 CORRECTED 2026-08-03: this header (and the 0116 header, and the 08-02 handoff) said
 * the key was "unset in Vercel, outstanding since mid-July". VERIFIED FALSE against the
 * Vercel dashboard — RESEND_API_KEY exists on Production, Sensitive, ADDED JUN 17. Three
 * documents restated one another; none looked. What remains true: the key has never been
 * exercised (0 emailed rows across fi_notices AND fi_permit_notices as of 2026-08-03), so
 * its VALIDITY is unproven until the first live send is observed on the monitor.
 */

const { JOB_WRITABLE_STATUSES, addDays } = require('./permitLadder');
const { isRenewablePermitStatus } = require('../constants/permitStatus');

/**
 * Ladder target status → notice kind. Derived-and-checked rather than hand-listed: if a
 * future migration adds a rung to the ladder, the assertion below fails at require() time
 * instead of that rung silently never notifying. Spec §6 row 5, applied to notices.
 */
const NOTICE_KIND_BY_STATUS = Object.freeze({
  AboutToExpire: 'about_to_expire',
  Delinquent:    'delinquent',
  Expired:       'expired',
});

for (const s of JOB_WRITABLE_STATUSES) {
  if (!NOTICE_KIND_BY_STATUS[s]) {
    throw new Error(
      `permitNotice: ladder status "${s}" has no notice kind. Every status the job can write ` +
      `must be classified here, or that transition would silently never notify.`);
  }
}

/** Both are built because §3.6 names both: "bureau staff AND the permit contact". */
const NOTICE_AUDIENCES = Object.freeze(['permittee', 'bureau']);

const NOTICE_KINDS = Object.freeze(Object.values(NOTICE_KIND_BY_STATUS));

/**
 * The last day of the grace window, or null when the permit carries no grace snapshot.
 *
 * 🔴 Number.isInteger, NOT Number()+isFinite. `Number(null)` is 0, which would silently turn
 * "this permit has no grace snapshot" into "this permit has a zero-day grace period" and
 * render `renewal remains available through <the term end date>` — a date we invented for a
 * legal record. That is the exact failure the job refuses upstream (NO_TERMS), and
 * computeLadderStatus guards it the same way for the same reason. Caught by its own test.
 */
function graceEndsOn(permit) {
  if (!permit || !permit.expiresDate) return null;
  if (!Number.isInteger(permit.grace_days) || permit.grace_days < 0) return null;
  return addDays(permit.expiresDate, permit.grace_days);
}

const label = (permit) => (permit?.permitNumber ? String(permit.permitNumber) : `#${permit?.id}`);
const place = (property) =>
  (property?.name || property?.address || '').toString().trim() || 'the permitted premises';

/**
 * Render one notice. PURE — no I/O, no clock, no env. Everything it needs is an argument, so
 * every branch is unit-testable without a database.
 *
 * @returns {{subject: string, body: string}}
 */
function renderPermitNotice({ audience, kind, permit, property, departmentName, toStatus }) {
  if (!NOTICE_AUDIENCES.includes(audience)) throw new Error(`unknown audience: ${audience}`);
  if (!NOTICE_KINDS.includes(kind)) throw new Error(`unknown notice kind: ${kind}`);

  const dept   = (departmentName || '').trim() || 'The fire department';
  const num    = label(permit);
  const where  = place(property);
  const ends   = permit?.expiresDate || null;
  const grace  = graceEndsOn(permit);
  // Read the exported set, never a status literal — spec §6 row 4.
  const renewable = isRenewablePermitStatus(toStatus);

  // The renewal sentence is derived from the status facet, so if renewability is ever
  // re-ruled the copy follows automatically instead of lying.
  const renewalLine = renewable
    ? (grace
        ? `This permit can still be renewed. Renewal remains available through ${grace}.`
        : 'This permit can still be renewed.')
    : 'Renewal is no longer available for this permit.';

  if (audience === 'bureau') {
    const subject = `[${dept}] Permit ${num} — ${kind.replace(/_/g, ' ')}`;
    const facts = [
      `Permit ${num} for ${where} moved to "${toStatus}".`,
      ends ? `Term end date on the record: ${ends}.` : 'This permit carries no term end date.',
      grace ? `Grace period ends: ${grace}.` : null,
      renewalLine,
      '',
      'This is an automatic notice from the permit expiry job. No action is recorded against',
      'this message; it exists so the bureau has the same record the permit holder does.',
    ].filter((l) => l !== null);
    return { subject, body: facts.join('\n') };
  }

  // ── permittee ──────────────────────────────────────────────────────────────────────────
  let subject;
  let opening;
  if (kind === 'about_to_expire') {
    subject = `${dept}: permit ${num} expires ${ends || 'soon'}`;
    opening = ends
      ? `Your fire permit ${num} for ${where} is scheduled to expire on ${ends}.`
      : `Your fire permit ${num} for ${where} is approaching its expiration date.`;
  } else if (kind === 'delinquent') {
    subject = `${dept}: permit ${num} has passed its expiration date`;
    opening = ends
      ? `The term of your fire permit ${num} for ${where} ended on ${ends}.`
      : `The term of your fire permit ${num} for ${where} has ended.`;
  } else {
    subject = `${dept}: permit ${num} has expired`;
    opening = ends
      ? `Your fire permit ${num} for ${where} expired on ${ends}${grace ? `, and the grace period ended on ${grace}` : ''}.`
      : `Your fire permit ${num} for ${where} has expired.`;
  }

  const body = [
    opening,
    '',
    renewalLine,
    '',
    `Please contact ${dept} with any questions about this permit.`,
    '',
    'This is an automatic message. Please do not reply to it.',
  ].join('\n');

  return { subject, body };
}

/**
 * Resolve the permittee's address. Permits carry no contact of their own (verified against
 * prod, 2026-08-02) — the permit contact is the property's owner email, which is the only
 * address the data model actually holds.
 *
 * Returns '' when there is nothing to send to. The caller records that as 'no_recipient'
 * rather than dropping the notice: an unmappable value is SURFACED for a human, never
 * silently defaulted away (the 0056 doctrine).
 */
function permitteeEmail(property) {
  const raw = (property?.ownerEmail ?? '').toString().trim();
  // Deliberately shallow: a syntactically-broken address should still be RECORDED as what the
  // department has on file, not silently blanked. The send attempt is what discovers it is bad.
  return raw;
}

module.exports = {
  NOTICE_KIND_BY_STATUS,
  NOTICE_KINDS,
  NOTICE_AUDIENCES,
  graceEndsOn,
  renderPermitNotice,
  permitteeEmail,
};
