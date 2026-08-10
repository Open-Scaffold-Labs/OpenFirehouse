'use strict';
/**
 * routes/fiPermits.js — fire-prevention permits (Phase 3, module 3.0 hardening).
 *
 * WHAT THIS FILE WAS, AND WHY IT CHANGED
 * --------------------------------------
 * 63 lines of bare CRUD that predated the prevention designation model entirely.
 * It never imported middleware/fiAuth, so **any authenticated department member —
 * including a probationary firefighter with role:'member' and no inspector
 * designation — could issue, edit and soft-delete permits in production.** That was
 * live exposure, not a theoretical gap.
 *
 * The root cause was structural: permits were never wired into Prevention Center,
 * so they never inherited its gate. Module 3.0 fixes both halves of that — this
 * file adopts the prevention module's own authorization, and the client surface
 * moves inside Prevention Center (spec R6).
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * This is the integrity floor, not the lifecycle engine. There is no issuance
 * door, no finality guard, no fee assessment, no invoice, and no renewal anchoring
 * in this file — those are modules 3.1/3.2, each with its own migration, because a
 * guard without the engine that produces the state it guards is theatre. What 3.0
 * guarantees is: only authorized people write, every write is validated and
 * canonicalized against a SERVER-owned vocabulary, tenancy fails closed, and the
 * database refuses duplicate permit numbers and orphan properties (migration 0090).
 *
 * GATE LEVELS, and why each is where it is
 * ----------------------------------------
 *   GET  (list/detail) — department-scoped, no designation required. Matches
 *                        routes/fiInspections.js exactly: crews need to see what
 *                        permits exist on a building. Reads are still tenant-scoped.
 *   POST / PATCH       — loadFiContext + requireInspector. Same bar as creating or
 *                        editing an inspection.
 *   DELETE             — loadFiContext + requirePreventionAdmin. DELIBERATELY
 *                        STRICTER than fiInspections' delete. A permit is a legal
 *                        instrument, and published municipal audits show that
 *                        VOIDED PERMITS are the first thing an auditor samples —
 *                        one 2025 state comptroller audit pulled *all* voided
 *                        permits and *all* zero-fee permits as its frame. Retiring
 *                        one is a bureau act, not a crew act. This also matches the
 *                        repo's own 2.1 precedent (chief-only reasoned soft delete).
 *
 * Tenancy note: routeKit's scoped() fails closed on req.user.stationId, but the fi_*
 * family keys on department_id. Both are checked here rather than assuming they are
 * interchangeable — they are equal in every current deployment, which is exactly the
 * kind of assumption that stops being true quietly.
 */
const express = require('express');
const { z } = require('zod');
const router  = express.Router();
const { fiPermits: db, fiProperties, pool } = require('../db');
// 3.1b — the term arithmetic that produces a permit's last valid day. Pure and unit-tested
// (utils/permitTerm.test.js) because the value it returns is FROZEN onto a legal record by
// 0094's write-once trigger the moment it is written.
const { computeExpiresDate } = require('../utils/permitLadder');
const { audit } = require('../utils/auditLog');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requireInspector, requirePreventionAdmin } = require('../middleware/fiAuth');
const {
  PERMIT_STATUSES, DEFAULT_PERMIT_STATUS, canonicalizePermitStatus,
  isTerminalPermitStatus,
  // 3.1b fence: status decisions read SETS, never string literals. See permitStatus.js's
  // facet table for why — AboutToExpire (0094) makes `=== 'Active'` silently wrong.
  isIssuedPermitStatus, isRevocablePermitStatus, isTerminablePermitStatus,
  isRenewablePermitStatus, RENEWABLE_PERMIT_STATUSES,
} = require('../constants/permitStatus');
const { REVOCATION_GROUNDS, validateRevocation } = require('../constants/permitGrounds');

/*
 * The 3.1a read-time expiry derivation (`is_expired`, `?today=`, resolveToday, withDerived)
 * is DELETED — its own migration header called it a stopgap "that must be deleted when 3.1b
 * lands", and 3.1b has landed. Expiry is the STORED ladder status, written only by the
 * scheduled permit-expiry job. The market bar is the same: zero documented platforms derive
 * expiry at read time (docs/PHASE3-31B-MARKET-AUDIT-2026-07-27.md §3 row 1). A read must not
 * re-grow a second expiry evaluator — two evaluators of one flag WILL drift.
 */

// ── validation ───────────────────────────────────────────────────────────────
const idParam = z.object({ id: z.string().regex(/^\d+$/, 'id must be numeric') });

// ISO day (YYYY-MM-DD) or empty. "issuedDate"/"expiresDate" are TEXT columns
// (matching fi_inspections' date columns), so the shape is enforced here — the
// old route did zero date validation and would happily store "next tuesday".
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const dateField = z.union([isoDay, z.literal(''), z.null()]).optional();

// fee is NUMERIC(12,2) as of migration 0090. Bounded, non-negative, and money —
// never negative (a refund is its own record in 3.2, not a negative fee).
const feeField = z.union([
  z.number().min(0).max(9999999999),
  z.string().regex(/^\d+(\.\d{1,2})?$/, 'fee must be a non-negative amount'),
  z.literal(''), z.null(),
]).optional();

// `type` is intentionally NOT a closed set in 3.0. The market bar is a
// per-department adopted catalog with three dispositions (required standalone /
// satisfied by certificate of occupancy / not adopted) — IFC §105.6 runs to ~50
// types, the section numbers MOVE between code editions, jurisdictions add their
// own, and one real district requires only 7 of 50 standalone. Hard-coding a list
// here would be wrong for nearly every department. fi_permit_types lands in 3.1.
const permitBase = {
  propertyId:   z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  type:         z.string().trim().min(1).max(120),
  // 3.1b — the link to the department's catalogue. OPTIONAL, and it stays optional: the
  // free-text `type` above remains the legacy path, and prod already holds four permits
  // that predate the catalogue entirely. A permit WITH a type gets the term snapshot at
  // issuance and enters the expiry ladder; a permit WITHOUT one is left alone by the job
  // rather than having terms invented for it.
  permit_type_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/), z.null()]).optional(),
  permitNumber: z.string().trim().min(1).max(64),
  issuedDate:   dateField,
  expiresDate:  dateField,
  status:       z.string().trim().max(40).optional(),
  issuedBy:     z.string().trim().max(160).optional(),
  fee:          feeField,
  conditions:   z.string().max(10000).optional(),
  notes:        z.string().max(10000).optional(),
};

const createSchema = z.object(permitBase).strict();
// PATCH is partial, but still strict: an unknown key is a caller bug or a probe,
// and silently ignoring it is how a field "saves" in the UI and vanishes in the DB.
const patchSchema  = z.object(permitBase).partial().strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'No updatable fields supplied' });

// ── 3.1a lifecycle schemas ───────────────────────────────────────────────────
const issueSchema = z.object({
  // Client-supplied local day, validated server-side — the repo's standing pattern for
  // anything that becomes part of a record (the server must not guess the department's
  // timezone). Optional: omitted means "today, as the client sees it" is not assumable,
  // so the route requires it explicitly rather than defaulting.
  issuedDate:  isoDay,
  expiresDate: z.union([isoDay, z.literal(''), z.null()]).optional(),
}).strict();

const revokeSchema = z.object({
  ground:   z.enum(REVOCATION_GROUNDS),
  citation: z.string().trim().max(240).optional(),
  basis:    z.string().trim().min(1).max(10000),
}).strict();

const terminateSchema = z.object({
  // IFC §105.3.1 names the four triggering changes. Coded so a report can answer
  // "how many permits terminated on a change of ownership last year".
  reason: z.enum(['OCCUPANCY', 'OPERATION', 'TENANCY', 'OWNERSHIP']),
  note:   z.string().trim().max(10000).optional(),
  // The successor. A transfer MINTS a new permit — it never edits the old one — so the
  // caller must supply the new permit's identifying details. Everything else about the
  // successor is copied from the predecessor.
  successorPermitNumber: z.string().trim().min(1).max(64),
}).strict();

const renewSchema = z.object({
  // The renewal is a NEW instrument and gets its own number, exactly like a transfer's
  // successor. Auto-numbering is 3.2's job; until then the operator supplies it, and the
  // unique-number constraint is what refuses a collision (translatePgError surfaces it).
  renewalPermitNumber: z.string().trim().min(1).max(64),
  note: z.string().trim().max(10000).optional(),
}).strict();

// ── helpers ──────────────────────────────────────────────────────────────────

/** fail closed on the tenant key the fi_* family actually uses. */
function deptOf(req) {
  const dept = req.user?.department_id;
  if (!dept) throw httpError(401, 'Authentication required', 'NO_STATION');
  return dept;
}

// W2.5 (2026-06-10): propertyId is client-supplied — verify it references a
// property in the caller's own department. Migration 0090 added a real FK, but
// the FK only proves the property EXISTS; it cannot prove it is OURS. Both checks
// are load-bearing and neither replaces the other.
async function assertOwnProperty(propertyId, departmentId) {
  if (propertyId === undefined || propertyId === null) return true;
  return !!(await fiProperties.findById(+propertyId, departmentId));
}

/** canonicalize + coerce for the db layer. Rejects an unmappable status (never defaults it). */
function normalize(body, { isCreate }) {
  const o = { ...body };

  if (o.propertyId !== undefined) o.propertyId = parseInt(o.propertyId, 10);

  if (o.fee === '' || o.fee === null) o.fee = null;
  else if (o.fee !== undefined) o.fee = Number(o.fee);

  if (o.issuedDate  === '') o.issuedDate  = null;
  if (o.expiresDate === '') o.expiresDate = null;

  if (o.status !== undefined || isCreate) {
    const canon = canonicalizePermitStatus(o.status);
    if (canon === undefined) {
      // UNMAPPABLE — refuse. Never guess a control value onto a legal record.
      // details is string[] per the app-wide error schema (middleware/errorHandler
      // drops anything else), so the allowed set rides there and the received value
      // rides in the message — the caller needs BOTH to fix the request.
      throw httpError(400,
        `Unrecognized permit status: ${JSON.stringify(o.status)}`,
        'INVALID_PERMIT_STATUS',
        PERMIT_STATUSES.slice());
    }
    o.status = canon === null ? (isCreate ? DEFAULT_PERMIT_STATUS : undefined) : canon;
    if (o.status === undefined) delete o.status;
  }

  if (isCreate) {
    o.issuedDate  = o.issuedDate  ?? null;
    o.expiresDate = o.expiresDate ?? null;
    o.issuedBy    = o.issuedBy    ?? '';
    o.fee         = o.fee         ?? null;
    o.conditions  = o.conditions  ?? '';
    o.notes       = o.notes       ?? '';
  }
  return o;
}

/**
 * Migration 0090 put two real constraints on this table. Postgres refusing a write
 * is the CONTROL; this only translates that refusal into an honest client answer.
 * Mapping it to a generic 500 would tell an inspector "something went wrong" when
 * the truth is "that permit number is already used".
 */
/**
 * THE ISSUANCE / FINALITY FENCE — applied to EVERY writer, not just the interesting one.
 *
 * `status` and `issuedDate` are engine-owned. On 2026-07-14 this repo proved what a
 * one-route guard is worth: the same inspection record answered 422 on /complete and
 * **200 OK** on PATCH, and a building was recorded as passing with an unabated violation.
 * A guard that exists on one route and not another is not a guard. So this runs on the
 * create route too — today's POST would otherwise accept status:'Active' and mint a live
 * permit with no issuance event and no attributable issuer.
 */
function refuseEngineOwnedFields(body, { isCreate }) {
  if (body.status !== undefined) {
    // ORDER MATTERS HERE, and it is not cosmetic. An UNRECOGNIZED status is a MALFORMED
    // request (400, and the reply names the value and lists the allowed set so the caller
    // can fix it). A RECOGNIZED status that simply isn't reachable this way is a DOCTRINE
    // violation (409, pointing at the engine). Collapsing both into one code was the first
    // thing this guard got wrong — it told someone who typed "Suspended" to go use the
    // issuance engine, which is not the problem they have.
    const canon = canonicalizePermitStatus(body.status);
    if (canon === undefined) {
      throw httpError(400,
        `Unrecognized permit status: ${JSON.stringify(body.status)}`,
        'INVALID_PERMIT_STATUS', PERMIT_STATUSES.slice());
    }
    // On create the only legal status is the default: a permit is APPLIED FOR, not born
    // issued. On update no status is settable at all.
    const legal = isCreate && (canon === null || canon === DEFAULT_PERMIT_STATUS);
    if (!legal) {
      throw httpError(409,
        '`status` cannot be set directly — issuing a permit mints a legal instrument and must go through the issuance engine. Use POST /api/fi-permits/:id/issue.',
        'ISSUANCE_VIA_ENGINE');
    }
  }
  if (body.issuedDate !== undefined) {
    throw httpError(409,
      '`issuedDate` cannot be set directly — it is stamped by the issuance engine. Use POST /api/fi-permits/:id/issue.',
      'ISSUANCE_VIA_ENGINE');
  }
}

/**
 * A permit that has been issued is a FINALIZED legal instrument. 409 on EVERY field,
 * including the boring ones.
 *
 * The fi core shipped the narrower version of this and paid for it: the guard fired only
 * when `violations` was in the body, which left result, notes, type and followUpDate
 * freely rewritable on a completed, signed, SERVED record — flipping a served "Fail" to
 * "Pass" was a 200. Unconditional is the only version that means anything.
 *
 * Corrections to an issued permit are governed acts, not edits: revoke it, or terminate
 * and reissue. A general amendment path (authored, reasoned, versioned, re-served) does
 * not exist yet, and a clean 409 is a more honest answer than a silent mutation.
 */
function refuseIfFinalized(before) {
  if (isIssuedPermitStatus(before.status) || before.issuedDate) {
    throw httpError(409,
      'This permit has been issued — it is a finalized legal instrument and cannot be edited. Revoke it on an enumerated ground, or terminate and reissue if the occupancy, operation, tenancy or ownership changed.',
      'RECORD_FINALIZED');
  }
  if (isTerminalPermitStatus(before.status)) {
    throw httpError(409,
      `This permit is ${before.status} — a terminal state. It cannot be edited or reopened.`,
      'RECORD_FINALIZED');
  }
}

function translatePgError(e) {
  if (e && e.code === '23505') {
    return httpError(409, 'A permit with that number already exists in this department',
      'DUPLICATE_PERMIT_NUMBER');
  }
  if (e && e.code === '23503') {
    return httpError(409, 'That property does not exist', 'PROPERTY_NOT_FOUND');
  }
  return e;
}

// ── routes ───────────────────────────────────────────────────────────────────

router.get('/', scoped(async ({ req }) => {
  const rows = await db.all(deptOf(req));
  return { data: rows };
}));

router.get('/:id',
  validate({ params: idParam }),
  scoped(async ({ req }) => {
    const row = await db.findById(+req.params.id, deptOf(req));
    if (!row) throw httpError(404, 'Permit not found', 'NOT_FOUND');
    return { data: row };
  }));

router.post('/',
  loadFiContext, requireInspector,
  validate({ body: createSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    refuseEngineOwnedFields(req.body, { isCreate: true }); // the create route is a writer too
    if (!await assertOwnProperty(req.body.propertyId, dept)) {
      throw httpError(404, 'Property not found', 'PROPERTY_NOT_FOUND');
    }
    const payload = normalize(req.body, { isCreate: true });
    // issued_by_user_id is NOT set here as of 3.1a.
    //
    // 0090 added the column and the create route filled it, because create was then the
    // only writer. But the column answers "WHO ISSUED THIS PERMIT" — and at create time
    // nobody has: the record is Pending. Filling it here names whoever typed the
    // application, which on a legal instrument is a different person with different
    // authority, and is exactly the kind of quietly-wrong attribution an audit finds.
    // The issuance engine sets it, because that is the event it describes.
    payload.issued_by_user_id = null;

    let created;
    try { created = await db.create(payload, dept); }
    catch (e) { throw translatePgError(e); }

    await audit(dept, req.user, 'create', 'fi_permits', created.id,
      { permitNumber: created.permitNumber, type: created.type, status: created.status });
    return { _status: 201, data: created };
  }));

router.patch('/:id',
  loadFiContext, requireInspector,
  validate({ params: idParam, body: patchSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const before = await db.findById(id, dept);
    if (!before) throw httpError(404, 'Permit not found', 'NOT_FOUND');
    refuseEngineOwnedFields(req.body, { isCreate: false }); // 409 before anything is read further
    refuseIfFinalized(before);                              // unconditional, every field
    if (req.body.propertyId !== undefined && !await assertOwnProperty(req.body.propertyId, dept)) {
      throw httpError(404, 'Property not found', 'PROPERTY_NOT_FOUND');
    }

    let updated;
    try { updated = await db.update(id, normalize(req.body, { isCreate: false }), dept); }
    catch (e) { throw translatePgError(e); }

    await audit(dept, req.user, 'update', 'fi_permits', id, { fields: Object.keys(req.body) });
    return { data: updated };
  }));

// ── THE LIFECYCLE ENGINE ─────────────────────────────────────────────────────
//
// GATE LEVEL: all three are requirePreventionAdmin, NOT requireInspector. Issuing a permit
// mints a legal instrument; revoking and terminating withdraw one. Those are bureau acts,
// matching DELETE's existing bar and the repo's 2.1 precedent.
//
// ⚠ THE HONEST SCOPE OF THAT: fiAuth resolves isInspector as isPreventionAdmin ||
// has('inspector') || fi_settings.allow_crew_inspections, and that setting DEFAULTS TRUE.
// So "a member cannot issue a permit" is true here only because issuance is admin-gated —
// NOT because the crew toggle changed. Both directions are asserted in the suite.
//
// R3 ISSUANCE GATES — one of three is LIVE (3.2 Slice C, 2026-08-05); two remain pending
// their objects, stated rather than hidden:
//   ✅ Gate 1 — FEE PAID IN FULL. Data source: the 0126 payment ledger + the derived
//      fi_invoice_balances view. Two blocking conditions, both below.
//   ⏳ Gate 2 — contractor licence current. The credential object does not exist yet, and
//      the type catalogue's own header flags the licensure gate as UNVERIFIED market
//      research — re-test before building (fiPermitTypes.js header).
//   ⏳ Gate 3 — inspection where the TYPE declares one. `fi_permit_types.requires_inspection`
//      is stored, but fi_inspections carries no permit linkage and NO artifact rules which
//      inspection satisfies the gate or how recent it must be — wiring it now would invent
//      a department's policy. Needs a ruling, not a guess.
//   ❌ NOT a gate, ever without a new ruling: outstanding balance on OTHER obligations —
//      that is a permit HOLD (A15), a confirmed market absence.

/**
 * Returns [] when issuance may proceed, or a list of blocking reasons.
 *
 * GATE 1 — "fee paid in full" — blocks on either of:
 *  (a) a COMMITTED, not-fully-waived fee assessment for this permit that no live invoice
 *      has ever billed — an assessed fee that was never demanded is not paid, and skipping
 *      the invoice must not skip the gate (the 2018 audit's "two permits assessed no fee
 *      at all" is exactly this hole);
 *  (b) an invoice CHAIN (original + its adjustments, transitively) carrying a line for this
 *      permit whose derived balance is still positive. Chains, not single documents: a $100
 *      original corrected by a −$30 adjustment and paid $70 is settled, and judging either
 *      document alone would block a paid-up permit. All arithmetic is NUMERIC in Postgres —
 *      exact, never a JS float.
 */
async function evaluateIssuanceGates(permit, dept) {
  const blockers = [];

  // (a) committed but never invoiced
  const { rows: uninvoiced } = await pool.query(
    `SELECT a.id, (a.committed_amount - COALESCE(a.waiver_amount, 0))::text AS due
       FROM fi_fee_assessments a
      WHERE a.permit_id = $1 AND a.department_id = $2
        AND a.committed_at IS NOT NULL
        AND (a.committed_amount - COALESCE(a.waiver_amount, 0)) > 0
        AND NOT EXISTS (
              SELECT 1 FROM fi_invoice_lines l
                JOIN fi_invoices i ON i.id = l.invoice_id AND i.status <> 'Void'
               WHERE l.assessment_id = a.id AND l.department_id = a.department_id)`,
    [permit.id, dept]);
  for (const a of uninvoiced) {
    // Lead with the money and the remedy — the internal id rides along in parentheses for
    // the clerk who goes looking, never as the headline (a record id is plumbing).
    blockers.push(`a committed fee of $${a.due} on this permit has not been invoiced — issue the invoice, then record its payment (fee assessment ${a.id})`);
  }

  // (b) unpaid invoice chains citing this permit
  const { rows: chains } = await pool.query(
    `WITH RECURSIVE chain AS (
       SELECT id, id AS root_id FROM fi_invoices
        WHERE department_id = $2 AND adjusts_invoice_id IS NULL
       UNION ALL
       SELECT i.id, c.root_id FROM fi_invoices i
         JOIN chain c ON i.adjusts_invoice_id = c.id
        WHERE i.department_id = $2
     ),
     permit_chains AS (
       SELECT DISTINCT c.root_id
         FROM chain c
         JOIN fi_invoices ci ON ci.id = c.id AND ci.status <> 'Void'
         JOIN fi_invoice_lines l
           ON l.invoice_id = c.id AND l.department_id = $2 AND l.permit_id = $1
     )
     SELECT r.invoice_number AS root_number,
            (COALESCE(SUM(i.invoice_amount) FILTER (WHERE i.status <> 'Void'), 0)
             - COALESCE(SUM(pay.paid), 0) + COALESCE(SUM(pay.refunded), 0))::text AS balance
       FROM chain c
       JOIN permit_chains pc ON pc.root_id = c.root_id
       JOIN fi_invoices i ON i.id = c.id
       JOIN fi_invoices r ON r.id = c.root_id
       LEFT JOIN LATERAL (
         SELECT SUM(p.amount) FILTER (WHERE p.kind = 'payment')              AS paid,
                SUM(p.amount) FILTER (WHERE p.kind = 'refund_authorization') AS refunded
           FROM fi_payments p
          WHERE p.invoice_id = i.id AND p.status <> 'Void'
       ) pay ON TRUE
      GROUP BY c.root_id, r.invoice_number
     HAVING (COALESCE(SUM(i.invoice_amount) FILTER (WHERE i.status <> 'Void'), 0)
             - COALESCE(SUM(pay.paid), 0) + COALESCE(SUM(pay.refunded), 0)) > 0`,
    [permit.id, dept]);
  for (const ch of chains) {
    // ch.balance is a NUMERIC computed in Postgres and delivered as a string — money never
    // touches a JS float, not even for a message.
    blockers.push(`fee not paid in full: invoice ${ch.root_number} has an outstanding balance of $${ch.balance}`);
  }

  return blockers;
}

/**
 * Resolve the R7 term snapshot for a permit being issued (3.1b).
 *
 * Returns null when the permit carries no catalogue type — the legacy path, unchanged.
 * Otherwise returns the values to FREEZE onto the record, resolved against the rule version
 * that was in force ON THE ISSUE DATE, not the version that is open today. That distinction
 * is the whole of R7: a permit issued in March under a 30-day notice window keeps the 30-day
 * window even if the department widened it in June.
 *
 * ⚠ Throws rather than guessing. A type with no rule group, or a rule group with no version
 * covering the issue date, means the term is UNKNOWN — and a permit is a legal instrument
 * whose expiry date must not be invented. The operator gets an honest refusal naming the
 * fix. (0056's doctrine: an unmappable value is surfaced for a human, never defaulted.)
 */
async function resolveTermSnapshot(permit, dept, issuedDate) {
  const typeId = permit.permit_type_id;
  if (!typeId) return null;

  const { rows: [type] } = await pool.query(
    `SELECT t.id, t.code, t.status, t.expiration_rule_group_id
       FROM fi_permit_types t WHERE t.id = $1 AND t.department_id = $2`,
    [typeId, dept]
  );
  if (!type) throw httpError(422, 'This permit references a type that no longer exists.', 'TYPE_NOT_FOUND');
  // A RETIRED type still issues: retirement stops it being CHOSEN for new applications, and
  // this application already chose it. Blocking here would strand a permit mid-process for a
  // decision made after it was applied for.
  if (!type.expiration_rule_group_id) {
    throw httpError(422,
      `Permit type "${type.code}" has no expiration rule, so this permit's term is unknown. `
      + 'Attach a rule group to the type before issuing.', 'TYPE_HAS_NO_RULE');
  }

  const { rows: [rule] } = await pool.query(
    `SELECT id, term_value, term_unit, notice_window_days, grace_days
       FROM fi_permit_expiration_rules
      WHERE group_id = $1 AND department_id = $2
        AND effective_from <= $3::date
        AND (effective_to IS NULL OR effective_to >= $3::date)
      ORDER BY effective_from DESC
      LIMIT 1`,
    [type.expiration_rule_group_id, dept, issuedDate]
  );
  if (!rule) {
    throw httpError(422,
      `No expiration rule for permit type "${type.code}" was in effect on ${issuedDate}. `
      + 'Add a rule version covering that date before issuing.', 'NO_RULE_IN_EFFECT');
  }

  const expiresDate = computeExpiresDate(issuedDate, rule.term_value, rule.term_unit);
  if (!expiresDate) throw httpError(422, 'The permit type\'s term could not be applied to that issue date.', 'BAD_TERM');

  return {
    expiration_rule_id: rule.id,
    term_value: rule.term_value,
    term_unit: rule.term_unit,
    notice_window_days: rule.notice_window_days,
    grace_days: rule.grace_days,
    expiresDate,
  };
}

router.post('/:id/issue',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: issueSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const before = await db.findById(id, dept);
    if (!before) throw httpError(404, 'Permit not found', 'NOT_FOUND');

    // Check-then-write: nothing is stamped until the whole operation is legal. The fi core
    // learned this the hard way — preconditions used to be checked AFTER the completion was
    // written, leaving a record completed, un-retryable, and missing the records it should
    // have minted.
    if (before.status !== 'Pending') {
      throw httpError(409,
        isIssuedPermitStatus(before.status)
          ? 'This permit has already been issued.'
          : `A ${before.status} permit cannot be issued. Only a Pending permit can be issued.`,
        'NOT_ISSUABLE');
    }
    const blocked = await evaluateIssuanceGates(before, dept);
    if (blocked.length) {
      throw httpError(422, `Issuance is blocked: ${blocked.join('; ')}`, 'ISSUANCE_BLOCKED', blocked);
    }

    // 3.1b — the R7 snapshot. Resolved BEFORE anything is written, so a type with no rule in
    // effect refuses the whole issuance rather than half-stamping the record.
    const snapshot = await resolveTermSnapshot(before, dept, req.body.issuedDate);

    // ONE SOURCE OF TRUTH FOR THE TERM. When the catalogue supplies it, a hand-typed
    // expiresDate is refused rather than silently ignored or silently preferred — the two
    // could disagree, and a permit whose printed expiry differs from the one the ladder
    // reads is precisely the drift this module exists to end. Without a catalogue type the
    // legacy behaviour is untouched.
    if (snapshot && req.body.expiresDate) {
      throw httpError(409,
        `This permit's term comes from its type: ${snapshot.term_value} ${snapshot.term_unit}(s), `
        + `expiring ${snapshot.expiresDate}. Change the type's expiration rule rather than `
        + 'setting a date here.', 'TERM_FROM_CATALOGUE');
    }

    // expiresDate is an ordinary field, so it rides the normal update path BEFORE the
    // status moves — once Active, the finality guard closes that door for good.
    if (!snapshot && req.body.expiresDate !== undefined) {
      await db.update(id, { expiresDate: req.body.expiresDate || null }, dept);
    }

    const issued = await db.issue(id, {
      issuedDate:     req.body.issuedDate,
      issuedByUserId: req.user.id ?? null,
      issuedByName:   req.user.name ?? '',
      snapshot,
    }, dept);
    // A zero-row result means the precondition stopped being true between the read and the
    // write — a concurrent issue. Report the refusal; never retry, never claim success.
    if (!issued) throw httpError(409, 'This permit was issued by someone else a moment ago.', 'NOT_ISSUABLE');

    await audit(dept, req.user, 'update', 'fi_permits', id,
      { action: 'issue', permitNumber: issued.permitNumber, issuedDate: issued.issuedDate,
        // Record WHICH rule version the term came from: R7 freezes the values, and this is
        // how a later dispute reconstructs where they came from.
        permitTypeId: before.permit_type_id ?? null,
        expirationRuleId: snapshot ? snapshot.expiration_rule_id : null,
        expiresDate: issued.expiresDate ?? null });
    return { data: issued };
  }));

router.post('/:id/revoke',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: revokeSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const before = await db.findById(id, dept);
    if (!before) throw httpError(404, 'Permit not found', 'NOT_FOUND');
    if (!isRevocablePermitStatus(before.status)) {
      throw httpError(409,
        `Only an issued, in-force permit can be revoked — this one is ${before.status}.`,
        'NOT_REVOCABLE');
    }

    // The ground/citation/basis contract. Postgres enforces the same three things
    // independently (0092); this exists so the operator gets an honest answer, not a 500.
    const bad = validateRevocation(req.body);
    if (bad) throw httpError(400, bad.message, bad.code, [bad.code]);

    let revoked;
    try {
      revoked = await db.revoke(id, req.body, dept);
    } catch (e) { throw translatePgError(e); }
    if (!revoked) throw httpError(409, 'That permit is no longer active.', 'NOT_REVOCABLE');

    await audit(dept, req.user, 'update', 'fi_permits', id, {
      action: 'revoke', permitNumber: before.permitNumber,
      ground: req.body.ground, citation: req.body.citation ?? null,
    });
    return { data: revoked };
  }));

router.post('/:id/terminate',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: terminateSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const before = await db.findById(id, dept);
    if (!before) throw httpError(404, 'Permit not found', 'NOT_FOUND');
    if (!isTerminablePermitStatus(before.status)) {
      throw httpError(409,
        `Only an issued, in-force permit can be terminated on a transfer — this one is ${before.status}.`,
        'NOT_TERMINABLE');
    }

    // IFC §105.3.1: "Permits are not transferable and any change in occupancy, operation,
    // tenancy or ownership shall require that a new permit be issued." The permit is bound
    // to a (person x location x activity x period) tuple — mutating any leg is not an edit,
    // it is a terminating event that mints a successor. That is why the holder fields are
    // unreachable on an issued permit and this is the only path.
    let successor;
    try {
      successor = await db.create({
        propertyId:   before.propertyId,
        type:         before.type,
        permitNumber: req.body.successorPermitNumber,
        // The successor is born PENDING and goes through the issuance door like anything
        // else. A transfer must not launder an unissued permit into a live one.
        status:       DEFAULT_PERMIT_STATUS,
        issuedDate:   null,
        expiresDate:  before.expiresDate ?? null,
        issuedBy:     '',
        fee:          null,          // the successor is priced on its own terms (3.2)
        conditions:   before.conditions ?? '',
        notes:        `Successor to permit ${before.permitNumber} (#${id}), terminated on a change of ${req.body.reason.toLowerCase()}.${req.body.note ? ` ${req.body.note}` : ''}`,
        issued_by_user_id: null,
        // The catalogue type IS carried — same reason renewal carries it (see /renew): the
        // type is what lets the successor resolve its own term/notice/grace at issuance.
        // This path shipped without it, so a transferred permit silently lost its type and
        // could never resolve terms or renew — the one-door-updated/sibling-forgotten bug
        // class (fixed 2026-08-03; the successor's TERMS still resolve fresh at its own
        // issuance, never copied — R7).
        permit_type_id: before.permit_type_id ?? null,
      }, dept);
    } catch (e) { throw translatePgError(e); }

    const terminated = await db.terminate(id, { successorId: successor.id }, dept);
    if (!terminated) {
      // The predecessor moved under us after the successor was minted. Refuse loudly and
      // name the orphan rather than leaving it to be discovered later — the successor's
      // number is already consumed and cannot be silently reused.
      throw httpError(409,
        `That permit is no longer active. A successor permit (#${successor.id}, ${successor.permitNumber}) was created and is now orphaned — retire it before retrying.`,
        'NOT_TERMINABLE');
    }

    await audit(dept, req.user, 'update', 'fi_permits', id, {
      action: 'terminate', reason: req.body.reason,
      permitNumber: before.permitNumber, supersededBy: successor.id,
    });
    await audit(dept, req.user, 'create', 'fi_permits', successor.id,
      { action: 'successor', permitNumber: successor.permitNumber, supersedes: id });

    return { _status: 201, data: { terminated, successor } };
  }));

/**
 * RENEWAL (3.1b, spec §3.4). The market graded this UNIVERSAL.
 *
 * A renewal is a NEW permit record pre-populated from the prior one — never an edit of it.
 * The parent's lifecycle is untouched: it keeps its status and runs its term out. The linkage
 * reuses `superseded_by_permit_id`, the column terminate-and-reissue already uses, because a
 * second linkage for the same "this record replaces that one" relationship would be two
 * answers to one question.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO — the renewal takes a FRESH R7 snapshot at ITS OWN
 * issuance, so no term is resolved here and `expiresDate` is NOT carried forward. The child is
 * born Pending with a null term and goes through `POST /:id/issue` like anything else, which
 * already calls resolveTermSnapshot against the rule version in force on the child's issue
 * date. Copying the parent's frozen term forward would defeat R7 exactly: a permit renewed
 * after the department widened its notice window must get the NEW window, and only resolving
 * at the child's own issuance produces that. `permit_type_id` IS carried, because that is what
 * lets the child resolve its own term at all.
 */
router.post('/:id/renew',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: renewSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const before = await db.findById(id, dept);
    if (!before) throw httpError(404, 'Permit not found', 'NOT_FOUND');

    // Gate 1 — the status window. Withdrawn at Expired ON PURPOSE: that is the documented
    // market behaviour, and a previous session's research finding to the contrary was
    // corrected in the spec. Do not "helpfully" widen this; an expired permit is a new
    // application, which is a different legal act with different fees and gates.
    if (!isRenewablePermitStatus(before.status)) {
      throw httpError(409,
        before.status === 'Expired'
          ? 'This permit has expired and cannot be renewed — an expired permit requires a new application.'
          : `A ${before.status} permit cannot be renewed. Renewal is offered while a permit is `
            + `${RENEWABLE_PERMIT_STATUSES.join(' or ')}.`,
        'NOT_RENEWABLE');
    }

    // Gate 2 — the type's own switch. A department can turn renewal off per permit type
    // (0093's `allow_renewal`), e.g. a one-time event permit that must always be re-applied
    // for. A permit with no catalogue type predates the catalogue and cannot be renewed
    // through this path, because there is nothing to resolve the child's term from.
    if (!before.permit_type_id) {
      throw httpError(422,
        'This permit has no catalogue type, so a renewal has no term to resolve. '
        + 'Issue a new permit against a catalogue type instead.', 'TYPE_REQUIRED');
    }
    const { rows: [type] } = await pool.query(
      `SELECT id, code, name, allow_renewal FROM fi_permit_types
        WHERE id = $1 AND department_id = $2`,
      [before.permit_type_id, dept]
    );
    if (!type) throw httpError(422, 'This permit references a type that no longer exists.', 'TYPE_NOT_FOUND');
    if (!type.allow_renewal) {
      throw httpError(409,
        `Permit type "${type.code}" does not allow renewal — a new application is required.`,
        'RENEWAL_NOT_ALLOWED');
    }

    // Gate 3 — ONE renewal in flight per parent. Pre-checked here so the common case answers
    // cleanly and names the existing child; the same condition is ALSO in renewLink's WHERE
    // clause, which is what actually decides a concurrent race. Checking only here would let
    // two simultaneous requests both pass and mint two children.
    if (before.superseded_by_permit_id) {
      throw httpError(409,
        `This permit already has a renewal in flight (#${before.superseded_by_permit_id}). `
        + 'Finish or void that one before starting another.', 'ALREADY_RENEWED');
    }

    let renewal;
    try {
      renewal = await db.create({
        propertyId:   before.propertyId,
        type:         before.type,
        permitNumber: req.body.renewalPermitNumber,
        // Born Pending and issued through the normal door. A renewal must not launder an
        // unissued permit into a live one — same rule as a transfer's successor.
        status:       DEFAULT_PERMIT_STATUS,
        issuedDate:   null,
        // NOT carried forward — see the note above. The child's term is resolved at its own
        // issuance, against the rule version in force then.
        expiresDate:  null,
        issuedBy:     '',
        fee:          null,          // priced on its own terms (3.2)
        conditions:   before.conditions ?? '',
        notes:        `Renewal of permit ${before.permitNumber} (#${id}).${req.body.note ? ` ${req.body.note}` : ''}`,
        issued_by_user_id: null,
        permit_type_id: before.permit_type_id,
      }, dept);
    } catch (e) { throw translatePgError(e); }

    const parent = await db.renewLink(id, { renewalId: renewal.id }, dept);
    if (!parent) {
      // The parent moved (or was renewed by someone else) between the read and the link.
      // Name the orphan rather than leaving it to be found later — its permit number is
      // already consumed and must not be silently reused. Same discipline as terminate.
      throw httpError(409,
        `That permit is no longer renewable. A renewal permit (#${renewal.id}, `
        + `${renewal.permitNumber}) was created and is now orphaned — retire it before retrying.`,
        'NOT_RENEWABLE');
    }

    await audit(dept, req.user, 'update', 'fi_permits', id, {
      action: 'renew', permitNumber: before.permitNumber,
      renewedBy: renewal.id, permitTypeId: before.permit_type_id,
    });
    await audit(dept, req.user, 'create', 'fi_permits', renewal.id, {
      action: 'renewal', permitNumber: renewal.permitNumber, renews: id,
    });

    return { _status: 201, data: { parent, renewal } };
  }));

router.delete('/:id',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const before = await db.findById(id, dept);
    if (!before) throw httpError(404, 'Permit not found', 'NOT_FOUND');
    await db.remove(id, dept); // soft delete (P0.2) — subpoenable, never hard-deleted
    // Record WHAT was retired, not just that something was: a void with no
    // recoverable subject is the audit finding, not the fix.
    await audit(dept, req.user, 'soft_delete', 'fi_permits', id,
      { permitNumber: before.permitNumber, type: before.type, status: before.status });
    return { message: `Permit ${id} deleted` };
  }));

module.exports = router;
