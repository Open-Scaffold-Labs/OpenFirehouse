'use strict';
/**
 * cad/alertIdentity.js — the identifier a dispatch is deduplicated on.
 *
 * WHAT WAS WRONG
 * --------------
 * Every adapter already synthesized a fallback when the CAD payload carried no
 * call id. They synthesized `${prefix}-${Date.now()}`.
 *
 * CAD vendors RETRY on timeout — pipeline.js says so in its own comment:
 * "vendors treat non-2xx as a delivery failure and may retry, double-dispatching
 * the call." A timestamp-based identifier is different on every attempt, so each
 * retry of an id-less dispatch minted a NEW alert_id, sailed past the duplicate
 * guard, and stored the same call again. The guard was defeated precisely in the
 * case it exists for. Downstream, two alert rows for one call can produce two
 * draft incidents on clear — two incident numbers for one fire.
 *
 * THE FIX, AND WHY IT IS THIS SHAPE
 * ---------------------------------
 * NENA-STA-021.1a does not permit an absent identifier. For data components with
 * no natural identifier it prescribes SYNTHESIZING one, namespaced to the agency
 * that created it. So synthesis was never the mistake — non-determinism was.
 *
 * We hash the STABLE CONTENT of the dispatch, namespaced by department and
 * source. The same dispatch re-delivered produces the same identifier and
 * collapses onto the existing row; two genuinely different calls produce
 * different identifiers and both land.
 *
 * WHAT IS DELIBERATELY NOT IN THE HASH
 * ------------------------------------
 * Anything WE observe rather than the sender states. No `Date.now()`, no
 * received-at, no request id. If our own clock or counter entered the hash, a
 * retry would hash differently and we would be back where we started. Only
 * sender-supplied values participate.
 *
 * `dispatchedAt` IS included — it is the sender's timestamp for the call, so a
 * retry carries the same one, while a genuine second call to the same address
 * for the same nature carries a different one. That is exactly the discrimination
 * we want. When the sender omits it we fall back to the date-less content hash
 * and accept the (rare, and safe-direction) risk of collapsing two identical
 * dispatches — a duplicate suppressed is recoverable; per NENA-STA-024 §3.14 and
 * NFPA 1221 §12.5.3 a dispatch LOST is not, and this direction never loses one
 * that differs in any stated field.
 *
 * PROVENANCE IS RETURNED, NOT INFERRED
 * ------------------------------------
 * The caller gets `{ alertId, source }` where source is 'vendor' | 'synthesized'.
 * A synthesized identifier must never masquerade as a CAD-issued call number —
 * the same standard already applied to fi_inspections.result_code. An operator
 * seeing one needs to know their CAD is misconfigured, not treat it as the call's
 * real number.
 */

const crypto = require('crypto');

const ID_SOURCE = Object.freeze({ VENDOR: 'vendor', SYNTHESIZED: 'synthesized' });

/** Visible marker. A reader can tell at a glance this was not CAD-issued. */
const SYNTH_PREFIX = 'syn';

/** Normalize a free-text field so trivial formatting differences in a retry
 *  (whitespace, case) do not produce a different identifier. */
function norm(v) {
  return String(v === null || v === undefined ? '' : v)
    .trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Resolve the identifier for an inbound dispatch.
 *
 * @param {object} args
 * @param {string|number|null} args.vendorId   the CAD's own call id, if any
 * @param {number|string} args.departmentId    tenant namespace (NENA namespaces
 *                                             its URNs by agency; so do we)
 * @param {string} args.source                 which CAD/adapter this came from
 * @param {string} [args.address]
 * @param {string} [args.units]
 * @param {string} [args.description]          call nature
 * @param {string} [args.dispatchedAt]         the SENDER's timestamp
 * @returns {{ alertId: string, source: 'vendor'|'synthesized' }}
 */
function resolveAlertId({
  vendorId, departmentId, source, address, units, description, dispatchedAt,
}) {
  // A vendor id always wins. It is the call's real number, it is what a
  // dispatcher will read back over the radio, and it is what the CAD will send
  // again on a close event.
  if (vendorId !== null && vendorId !== undefined && String(vendorId).trim() !== '') {
    return { alertId: String(vendorId).trim(), source: ID_SOURCE.VENDOR };
  }

  const material = [
    `d=${departmentId ?? ''}`,
    `s=${norm(source)}`,
    `t=${norm(dispatchedAt)}`,
    `a=${norm(address)}`,
    `u=${norm(units)}`,
    `n=${norm(description)}`,
  ].join('|');

  const digest = crypto.createHash('sha256').update(material, 'utf8').digest('hex');
  // 20 hex chars = 80 bits. At any plausible call volume the collision
  // probability is negligible, and a shorter id stays readable on a console and
  // in a radio read-back.
  return { alertId: `${SYNTH_PREFIX}-${digest.slice(0, 20)}`, source: ID_SOURCE.SYNTHESIZED };
}

/** Did this identifier come from us rather than the CAD? Used by surfaces that
 *  must not present a synthesized id as the call's real number. */
function isSynthesized(alertId) {
  return typeof alertId === 'string' && alertId.startsWith(`${SYNTH_PREFIX}-`);
}

module.exports = { resolveAlertId, isSynthesized, ID_SOURCE, SYNTH_PREFIX };
