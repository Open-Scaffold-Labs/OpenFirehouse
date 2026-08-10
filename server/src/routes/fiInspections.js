'use strict';
const express = require('express');
const router  = express.Router();
const { fiInspections: db, fiProperties, pool } = require('../db');
const { normalizeViolations, isResolvedViolationStatus } = require('../constants/violationStatus');
const { canonicalizeResult, isPassingResult, isUnmappableResult, RESULT_CODES } = require('../constants/inspectionResult');
const { audit } = require('../utils/auditLog');
const { syncViolationRows, softDeleteViolationRows } = require('../utils/fiViolationSync');
const { loadFiContext, requireInspector, requirePreventionAdmin } = require('../middleware/fiAuth');

// P3 (2026-07-13): the assignment identity doctrine (0051) — the durable link is
// assigned_to_user_id; the assignee must belong to the caller's department.
async function assertOwnAssignee(userId, stationId) {
  if (userId == null) return true;
  const r = await pool.query(
    `SELECT 1 FROM users u
     WHERE u.id = $1 AND (u.station_id = $2
       OR EXISTS (SELECT 1 FROM of_user_departments m WHERE m.user_id = u.id AND m.department_id = $2))`,
    [userId, stationId]);
  return !!r.rows.length;
}

// P0 (2026-07-12): read-path normalization. Write-time canonicalization has existed
// since 2026-07-11, but rows written BEFORE it (prod audit found live 'Pending'
// elements) rendered open-forever on clients that compare raw strings. Normalizing
// on the way out means server and clients always see the same axis. No id
// assignment here — a read must never fabricate identity.
function normalizeOut(row) {
  if (!row) return row;
  return { ...row, violations: normalizeViolations(row.violations) };
}

// W2.5 audit (2026-06-10): propertyId is client-supplied — verify it
// references a property in the caller's own station.
async function assertOwnProperty(propertyId, stationId) {
  if (propertyId === undefined || propertyId === null) return true;
  return !!(await fiProperties.findById(+propertyId, stationId));
}

function coerce(d) {
  const o = { ...d };
  if (o.propertyId !== undefined) o.propertyId = parseInt(o.propertyId, 10) || 0;
  // ⚠️ Only touch `violations` when the PATCH actually carries it (fixed 2026-07-11,
  // caught by live verification): the old unconditional `if (!Array.isArray(...)) = []`
  // meant ANY partial update that omitted violations — a result tap, a notes save, a
  // completion date — SILENTLY WIPED every cited violation on the record. Partial
  // patches are the mobile client's entire write model.
  if (o.violations !== undefined) {
    if (!Array.isArray(o.violations)) o.violations = [];
    // Write chokepoint (see constants/violationStatus.js normalizeViolation):
    // canonicalize status onto the four-state axis, preserve the inspector's
    // original word in status_raw, and assign a stable UUID to any violation
    // arriving without an id (photos key on this id — never reuse array position).
    o.violations = normalizeViolations(o.violations, { assignId: true });
  }
  if (o.scheduledDate  === '') o.scheduledDate  = null;
  if (o.completedDate  === '') o.completedDate  = null;
  if (o.followUpDate   === '') o.followUpDate   = null;
  if (o.result         === '') o.result         = null;
  // 0056 — derive the CONTROL value from the recorded words. `result` stays verbatim (it is
  // the historical record); `result_code` is what any decision is ever allowed to read.
  // canonicalizeResult returns `undefined` for an UNMAPPABLE value — callers must 400 on it
  // (see assertMappableResult) rather than store a result nothing can interpret.
  if (o.result !== undefined) o.result_code = canonicalizeResult(o.result) ?? null;
  // P3: accept the camelCase API name for the 0051 column (either spelling in,
  // one column out; '' / 0 / NaN all normalize to null — unassigned is legal).
  if (o.assignedToUserId !== undefined) {
    o.assigned_to_user_id = o.assignedToUserId === null ? null : (parseInt(o.assignedToUserId, 10) || null);
    delete o.assignedToUserId;
  } else if (o.assigned_to_user_id !== undefined) {
    o.assigned_to_user_id = o.assigned_to_user_id === null ? null : (parseInt(o.assigned_to_user_id, 10) || null);
  }
  return o;
}

router.get('/',     async (req,res) => { try { res.json({ data: (await db.all(req.user.department_id)).map(normalizeOut) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch inspections' }); } });
router.get('/:id',  async (req,res) => { try { const r=await db.findById(+req.params.id, req.user.department_id); if(!r) return res.status(404).json({error:'Not found'}); res.json({data:normalizeOut(r)}); } catch(e) { res.status(500).json({error:'Failed'}); } });
/**
 * The result must be a value the system can actually interpret. (2026-07-14)
 *
 * `result` was free text (`z.string().max(60)`), and the pass doctrine was a REGEX
 * (/^pass\b/i) — so "Passed" and "Passing" recorded a PASSING inspection while silently
 * skipping the guard. An uninterpretable result is not a result; it is a hole. 400 it at
 * the door rather than store a word no surface can render (prod already carries
 * 'Pass with Violations', which is in NEITHER client's vocabulary).
 */
function assertMappableResult(res, raw) {
  if (raw === undefined || !isUnmappableResult(raw)) return true;
  res.status(400).json({
    error: `Unrecognized inspection result ${JSON.stringify(String(raw))}. A result must be one of: ${RESULT_CODES.join(', ')}.`,
    code: 'INVALID_RESULT',
    details: { allowed: [...RESULT_CODES] },
  });
  return false;
}

/**
 * THE DOCTRINE, at the create door: an inspection CANNOT PASS with unabated violations.
 * completeInspection() enforces this for the completion path. POST can ALSO land a record
 * already-completed-and-passing with open violations in one shot, so it needs the same
 * guard — otherwise closing the PATCH door just moves the hole one route over.
 */
function assertNotPassingWithOpenViolations(res, resultRaw, violations) {
  if (!isPassingResult(canonicalizeResult(resultRaw))) return true;
  const open = normalizeViolations(violations).filter((v) => v && typeof v === 'object' && !isResolvedViolationStatus(v.status));
  if (!open.length) return true;
  res.status(422).json({
    error: `Cannot record a passing result with ${open.length} unabated violation${open.length === 1 ? '' : 's'} — resolve them first or record a non-passing result (e.g. Reinspection Required).`,
    code: 'PASS_WITH_OPEN_VIOLATIONS',
  });
  return false;
}

router.post('/', loadFiContext, requireInspector, async (req,res) => {
  try {
    if (!req.body.propertyId) return res.status(400).json({ error: 'propertyId is required' });
    if (!await assertOwnProperty(req.body.propertyId, req.user.department_id)) return res.status(404).json({ error: 'Property not found' });
    if (!assertMappableResult(res, req.body.result)) return;
    if (!assertNotPassingWithOpenViolations(res, req.body.result, req.body.violations)) return;
    const body = coerce({
      propertyId:    req.body.propertyId,
      type:          req.body.type          || 'Annual Inspection',
      inspectorName: req.body.inspectorName || '',
      scheduledDate: req.body.scheduledDate || null,
      completedDate: req.body.completedDate || null,
      result:        req.body.result        || null,
      violations:    Array.isArray(req.body.violations) ? req.body.violations : [],
      followUpDate:  req.body.followUpDate  || null,
      notes:         req.body.notes         || '',
      ...(req.body.assignedToUserId !== undefined ? { assignedToUserId: req.body.assignedToUserId } : {}),
    });
    if (!await assertOwnAssignee(body.assigned_to_user_id, req.user.department_id)) return res.status(404).json({ error: 'Assignee not found in this department' });
    const created = await db.create(body, req.user.department_id);
    await audit(req.user.department_id, req.user, 'create', 'fi_inspections', created.id,
      { propertyId: created.propertyId, type: created.type, violations: (created.violations || []).length });
    await syncViolationRows(pool, created, req.user.department_id); // P1: queryable mirror rows
    res.status(201).json({ data: created });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create inspection' }); }
});
router.patch('/:id', loadFiContext, requireInspector, async (req,res) => {
  try {
    const id=+req.params.id;
    const before = await db.findById(id, req.user.department_id);
    if(!before) return res.status(404).json({error:'Not found'});

    // ── GUARD 1 — COMPLETION HAS EXACTLY ONE DOOR (2026-07-14) ─────────────────────────
    // PROVEN back door, live, 2026-07-14: this route accepted
    //     PATCH /api/fi-inspections/9  {"result":"Pass","completedDate":"2026-07-14"}
    // with 200 OK on an inspection carrying an unabated violation — while the SAME payload
    // to POST /:id/complete correctly returned 422 PASS_WITH_OPEN_VIOLATIONS. The mobile
    // client writes exclusively through this route, so on the surface inspectors actually
    // hold, the doctrine was not enforced AT ALL.
    //
    // Completion MINTS legal records (the reinspection carrying every open violation, the
    // next cycle) and is CHECK-THEN-WRITE. A PATCH that stamps completedDate/result skips
    // all of it: no guard, no reinspection, no next cycle — the violations fall silently
    // out of the loop, forever.
    //
    // So these three fields are NOT PATCHABLE. Ever. The completion engine
    // (routes/fiWorkflow.completeInspection) is their only writer. One engine, one door.
    for (const f of ['result', 'result_code', 'completedDate']) {
      if (req.body[f] !== undefined) {
        return res.status(409).json({
          error: `\`${f}\` cannot be set by a direct update — completing an inspection mints legal records (the reinspection carrying any open violations, and the next cycle) and must go through the completion engine. Use POST /api/fi-inspections/${id}/complete (or the offline op 'inspection.complete').`,
          code: 'COMPLETION_VIA_ENGINE',
        });
      }
    }

    // ── GUARD 2 — A COMPLETED INSPECTION IS FINAL. ALL OF IT. (2026-07-14) ─────────────
    // A COMPLETED inspection is a finalized legal record: its findings are what was signed
    // and what was served on the notice. They cannot be quietly rewritten afterwards, or
    // the stored record and the served instrument disagree with nobody noticing.
    //
    // This guard USED TO fire only when `violations` was in the body — which meant
    // `result`, `notes`, `type`, `inspectorName`, `followUpDate`, `propertyId` and
    // `assigned_to_user_id` were all freely rewritable on a completed, signed, SERVED
    // record. Flipping a served "Fail" to "Pass" was a 200. It is now UNCONDITIONAL.
    //
    // Abatement is recorded on the REINSPECTION (which carries the violation forward), not
    // by editing history. A correction to a finalized record is an AMENDMENT — a new,
    // authored, reasoned version that supersedes and (if already served) must be RE-SERVED.
    // That path is P4 and does not exist yet; until it does, the answer is a clean 409 —
    // NOT a silent mutation of a legal record.
    if (before.completedDate) {
      return res.status(409).json({
        error: 'This inspection is completed — it is a finalized legal record and cannot be edited. Record abatement on the reinspection that carries the violation forward.',
        code: 'RECORD_FINALIZED',
      });
    }
    if (req.body.propertyId !== undefined && !await assertOwnProperty(req.body.propertyId, req.user.department_id)) return res.status(404).json({ error: 'Property not found' });
    const patch = coerce(req.body);
    if (patch.assigned_to_user_id !== undefined && !await assertOwnAssignee(patch.assigned_to_user_id, req.user.department_id)) return res.status(404).json({ error: 'Assignee not found in this department' });
    const updatedRaw = await db.update(id, patch, req.user.department_id);
    // 🔴 Normalize ONCE here, and use the normalized row for EVERYTHING downstream
    // (audit diff, mirror sync, response). This was the ONLY route in the file that
    // returned a row without normalizeOut, and it caused three bugs (2026-07-14).
    //
    // WHY IT BIT: a partial PATCH — the mobile client's entire write model — does not
    // carry `violations`, so coerce() correctly leaves them alone (that guard is load-
    // bearing; see above) and db.update returns the STORED JSON verbatim, legacy words
    // and all. Prod carries live 'Pending' elements. Passing that raw row downstream:
    //   1. AUDIT TRAIL: the diff below compares a NORMALIZED `before` against the row's
    //      statuses — raw 'Pending' vs normalized 'Open' read as a change, writing a
    //      PHANTOM transition (Open→Pending) into the append-only legal audit log on a
    //      write that never touched a violation.
    //   2. QUERYABLE MIRROR: syncViolationRows wrote the legacy word into fi_violations,
    //      where fiReports selects the open set with a POSITIVE allowlist
    //      (status = ANY('Open','Time Extension')). 'Pending' matches NEITHER — so the
    //      violation silently dropped out of the open/aging dashboard. Fails CLOSED:
    //      the exact "a violation falls out of the count" bug the four-state axis exists
    //      to prevent.
    //   3. CLIENTS: mobile compares raw strings, so its status picker showed no selection.
    // normalizeOut assigns NO ids (a read must never fabricate identity) and preserves
    // the inspector's original word in status_raw, so nothing is destroyed.
    const updated = normalizeOut(updatedRaw);
    // Audit with the status transitions this write caused (who/when/from→to) —
    // violation status changes are the legally interesting event on this record.
    // Both sides are normalized, so this reports only REAL transitions.
    const beforeById = new Map(normalizeViolations(before.violations).map((v, i) => [String(v.id ?? i), v.status]));
    const statusChanges = (updated.violations || []).flatMap((v, i) => {
      const key = String(v.id ?? i);
      const from = beforeById.get(key);
      return from !== undefined && from !== v.status ? [{ violationId: key, from, to: v.status }] : [];
    });
    await audit(req.user.department_id, req.user, 'update', 'fi_inspections', id,
      { fields: Object.keys(req.body), ...(statusChanges.length ? { statusChanges } : {}) });
    await syncViolationRows(pool, updated, req.user.department_id); // P1: queryable mirror rows
    res.json({ data: updated });
  } catch(e) { res.status(500).json({ error: 'Failed to update inspection' }); }
});
router.delete('/:id', loadFiContext, requireInspector, async (req,res) => {
  try {
    const id=+req.params.id; if(!await db.findById(id, req.user.department_id)) return res.status(404).json({error:'Not found'});
    await db.remove(id, req.user.department_id); // soft delete (P0.2) — row retained, deleted_at set
    await softDeleteViolationRows(pool, id, req.user.department_id); // P1: mirror rows follow
    await audit(req.user.department_id, req.user, 'soft_delete', 'fi_inspections', id, {});
    res.json({ message: `Inspection ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete inspection' }); }
});

// ── REASSIGNMENT (2026-07-15) ────────────────────────────────────────────────
// A clerk/officer hands a PENDING reinspection to a different inspector — the ONE
// multi-person case the domain expert allows (original inspector out sick / off / gone).
// It is an ownership transfer of a separate, not-yet-performed record — NEVER a rewrite of
// a completed one, and NEVER a co-edit. Dedicated, GUARDED path (not a bare PATCH of the
// assignment column) so the finalization + role + dept checks cannot be bypassed — the same
// completion-has-one-door lesson. Competitor-standard MVP: supervisor/clerk only (prevention
// admin), refuses a finalized record, validates the new assignee is in the department, writes
// an append-only audit event (from -> to, actor, reason). The record then moves into the new
// inspector's queue (assigned_to_user_id) — that queue move is the notification for now; an
// explicit push needs an in-app notification system OF does not yet have (flagged follow-up).
router.post('/:id/reassign', loadFiContext, requirePreventionAdmin, async (req, res) => {
  try {
    const stationId = req.user.department_id;
    if (!stationId) return res.status(401).json({ error: 'Authentication required', code: 'NO_STATION' });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad inspection id' });

    const toUserId = parseInt(req.body?.toUserId, 10);
    if (!Number.isFinite(toUserId) || toUserId <= 0) {
      return res.status(400).json({ error: 'toUserId (the new inspector) is required.', code: 'TO_USER_REQUIRED' });
    }
    const reason = String(req.body?.reason || '').trim().slice(0, 500);

    const before = await db.findById(id, stationId);
    if (!before) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

    // A completed inspection is a finalized legal record — its author is fixed. Only a
    // PENDING (not-yet-performed) inspection/reinspection can change hands.
    if (before.completedDate) {
      return res.status(409).json({
        error: 'A completed inspection is a finalized legal record and cannot be reassigned. Reassignment is for a pending reinspection.',
        code: 'RECORD_FINALIZED',
      });
    }
    if (!await assertOwnAssignee(toUserId, stationId)) {
      return res.status(404).json({ error: 'That inspector is not in this department.', code: 'ASSIGNEE_NOT_IN_DEPT' });
    }
    const fromUserId = before.assigned_to_user_id ?? before.assignedToUserId ?? null;
    if (fromUserId != null && String(fromUserId) === String(toUserId)) {
      return res.status(400).json({ error: 'That inspection is already assigned to this inspector.', code: 'ALREADY_ASSIGNED' });
    }

    const updated = await db.update(id, { assigned_to_user_id: toUserId }, stationId);
    // Append-only audit — a custody transfer of the pending reinspection. Uses the allowed
    // 'update' action (so the row is guaranteed to land) with a reassign-tagged detail.
    await audit(stationId, req.user, 'update', 'fi_inspections', id,
      { reassign: true, from_user_id: fromUserId, to_user_id: toUserId, reason: reason || null });
    return res.json({ data: normalizeOut(updated) });
  } catch (e) {
    console.error('reassign error', e);
    res.status(500).json({ error: 'Failed to reassign inspection' });
  }
});

module.exports = router;
// Exposed for the regression test only (tests/fiInspectionsCoerce.test.js) — the
// partial-PATCH wipe bug must never come back.
module.exports.coerce = coerce;
