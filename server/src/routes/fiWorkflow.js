'use strict';
/**
 * routes/fiWorkflow.js — the Prevention Core workflow engine (Phase 2, 2026-07-12).
 *
 * POST /api/fi-inspections/:id/complete — the deliberate, HUMAN-triggered
 * completion act (nothing here is ever automatic — the client asks, the server
 * does exactly what was asked, mirroring the incumbents' completion prompts):
 *   1. Stamps completedDate (+ optional result). The date comes from the CLIENT
 *      (the inspector's local day — doctrine 8); the server only validates it.
 *   2. createReinspection (default true when open violations exist): creates the
 *      linked reinspection with every OPEN violation carried over — each carried
 *      element gets a fresh id (its photos stay with the ORIGINAL inspection) and
 *      a `carriedFrom` lineage marker ("<inspectionId>:<violationKey>").
 *   3. scheduleNextCycle (default true): if the inspection's type has a
 *      default_frequency_days, schedules the next cycle at completedDate + N days
 *      (pure calendar math, utils/localDate). Idempotent: an identical already-
 *      scheduled inspection short-circuits (safe on client retry).
 *
 * PUT /api/fi-inspections/:id/answers — the checklist findings (yes/no/na),
 * snapshotting prompt + bound code at answer time (IFC §104.6 "findings").
 *
 * Gates (middleware/fiAuth): completion = requireCommit (inspector + the
 * department's admin_only_commit toggle); answers = requireInspector.
 * Everything audited.
 */
const express = require('express');
const router  = express.Router({ mergeParams: true });
const { z } = require('zod');
const { pool, fiInspections: db } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requireCommit, requireInspector } = require('../middleware/fiAuth');
const { audit } = require('../utils/auditLog');
const { normalizeViolations, isResolvedViolationStatus } = require('../constants/violationStatus');
const { canonicalizeResult, isPassingResult, RESULT_CODES } = require('../constants/inspectionResult');
const { syncViolationRows } = require('../utils/fiViolationSync');
const { isIsoDay, addDaysISO, coerceIsoDay } = require('../utils/localDate');

const idParam = validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) });

const completeSchema = z.object({
  completedDate:      z.string().refine(isIsoDay, 'completedDate must be a real YYYY-MM-DD day'),
  // 0056 — the result is a CLOSED SET, validated at the door. It was `z.string().max(60)`,
  // and the pass doctrine below was a regex against it — so "Passed" and "Passing" recorded
  // a passing inspection and SKIPPED THE GUARD. An uninterpretable result is a hole, not a
  // result. Accepts a code ('PASS') or its label ('Pass'); rejects everything else.
  result: z.string().trim().max(60).optional().refine(
    (v) => v === undefined || canonicalizeResult(v) !== undefined,
    { message: `result must be one of: ${RESULT_CODES.join(', ')}` }),
  createReinspection: z.boolean().optional(),           // default: true when open violations exist
  reinspectionDate:   z.string().refine(isIsoDay).optional(),
  scheduleNextCycle:  z.boolean().default(true),
});

/**
 * THE COMPLETION ENGINE — extracted 2026-07-14 so the OFFLINE path can reuse it.
 *
 * Completion MINTS legal records: the reinspection carrying every open violation, and
 * the next cycle. A device must never fabricate those — a client-minted reinspection
 * is a legal record no human authored. So offline we queue the INTENT
 * (`inspection.complete`), and THIS function mints the records on the server when the
 * outbox drains — exactly as it does online.
 *
 * One engine, two doors. If this were copy-pasted into the sync route, the two would
 * drift, and the day they disagree an inspection completes differently depending on
 * whether the inspector had signal. That is not acceptable on a legal record.
 */
async function completeInspection({ id, body: b, stationId, user }) {
    const before = await db.findById(id, stationId);
    if (!before) throw httpError(404, 'Not found', 'NOT_FOUND');
    if (before.completedDate) {
      throw httpError(409, 'This inspection is already completed. Reopen it first if it must be amended.', 'ALREADY_COMPLETED');
    }

    // Matt's doctrine (2026-07-13, working-inspector correction): an inspection
    // CANNOT pass with unabated violations. A passing result is only legal when
    // every violation on the record is resolved (Corrected / Withdrawn).
    // Enforced HERE — the server is the control; the client dropdown is UX.
    //
    // 🔴 THE GUARD USED TO BE A REGEX: /^pass\b/i.test(String(b.result ?? ''))
    // Executed against real values 2026-07-14 — it was one verb tense from failing open:
    //     'Pass', 'Pass with Violations', 'Pass, see notes' → FIRES  ✅
    //     'Passed', 'PASSED', 'Passing'                     → SILENT ❌
    // A building with unabated violations could be recorded as passing by using the past
    // tense. The result is now a CLOSED SET matched EXACTLY (constants/inspectionResult.js);
    // completeSchema rejects anything unmappable before we ever get here. NOTHING in this
    // file pattern-matches a result, and nothing ever may again.
    const resultCode = canonicalizeResult(b.result);
    const openBefore = normalizeViolations(before.violations)
      .filter((v) => v && typeof v === 'object' && !isResolvedViolationStatus(v.status));
    if (openBefore.length && isPassingResult(resultCode)) {
      throw httpError(422,
        `Cannot record a passing result with ${openBefore.length} unabated violation${openBefore.length === 1 ? '' : 's'} — resolve them first or record a non-passing result (e.g. Reinspection Required).`,
        'PASS_WITH_OPEN_VIOLATIONS');
    }

    // ── P1-5 (2026-07-16, Matt's call): FAIL and REINSPECTION_REQUIRED are DISTINCT ──
    // They used to be behaviorally identical (both minted the same routine reinspection),
    // forcing the inspector to pick between two labels that did the same thing. The field
    // distinguishes them by SEVERITY, and so does NJ's own code (NJAC 5:70 — 15/30-day
    // routine abatement vs ≤3 days for a dangerous condition):
    //   REINSPECTION_REQUIRED — correctable violations → grace period → routine
    //     reinspection driven by the violations' correct-by dates. (Unchanged.)
    //   FAIL — CRITICAL findings (the imminent-hazard flag IS the critical category) →
    //     no grace period: the reinspection lands inside the dangerous-condition window
    //     (≤3 days from completion), the enforcement track.
    // Enforced in BOTH directions, here in the one completion door (online + offline):
    // Fail without a critical finding is a category error, and a standing imminent
    // hazard cannot ride the routine cycle. The client pickers mirror this as courtesy.
    // The enum itself is UNCHANGED (NERIS CRR dispositions not yet public — revisit).
    // Historical records entering through the create door are not re-litigated.
    const hazardsBefore = openBefore.filter((v) => v.imminentHazard === true);
    if (resultCode === 'FAIL' && hazardsBefore.length === 0) {
      throw httpError(422,
        'Fail is the critical/enforcement disposition — it requires at least one open violation flagged as an IMMINENT HAZARD. Flag the dangerous condition, or record Reinspection Required for the routine correction cycle.',
        'FAIL_REQUIRES_IMMINENT_HAZARD');
    }
    if (resultCode === 'REINSPECTION_REQUIRED' && hazardsBefore.length > 0) {
      throw httpError(422,
        `${hazardsBefore.length === 1 ? 'An imminent hazard is' : `${hazardsBefore.length} imminent hazards are`} standing — a dangerous condition cannot ride the routine correction cycle. Record Fail (the critical disposition), or resolve the hazard first.`,
        'IMMINENT_HAZARD_REQUIRES_FAIL');
    }

    // VALIDATE EVERYTHING BEFORE WE STAMP ANYTHING (2026-07-13).
    // These preconditions used to be checked AFTER the completedDate was written,
    // so a rejected reinspection left the record COMPLETED, carrying an unabated
    // violation, with NO reinspection on the books — and un-retryable (409). A
    // violation could fall silently out of the loop. Completion is now
    // check-then-write: nothing is stamped until the whole operation is legal.
    const wantReinspection = b.createReinspection ?? openBefore.length > 0;
    let reinspectWhen = null;
    if (wantReinspection) {
      if (!openBefore.length) {
        throw httpError(400, 'No open violations to carry — a reinspection needs at least one.', 'NOTHING_TO_REINSPECT');
      }
      const derived = openBefore.map((v) => coerceIsoDay(v.followUpDate)).filter(Boolean).sort()[0];
      reinspectWhen = b.reinspectionDate ?? derived;
      // P1-5: a FAILED inspection carries a dangerous condition — NO grace period.
      // The reinspection lands inside the dangerous-condition window (3 days from the
      // completion date, NJAC 5:70's line), never out at a routine correct-by date.
      // A provided/derived date EARLIER than the window is kept (sooner is fine).
      if (resultCode === 'FAIL') {
        const completedDay = coerceIsoDay(b.completedDate);
        if (completedDay) {
          const d = new Date(`${completedDay}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 3);
          const windowDay = d.toISOString().slice(0, 10);
          if (!reinspectWhen || reinspectWhen > windowDay) reinspectWhen = windowDay;
        }
      }
      if (!reinspectWhen) {
        throw httpError(400, 'Provide reinspectionDate — no open violation carries a follow-up date to derive it from.', 'REINSPECTION_DATE_REQUIRED');
      }
    }

    // 1 — stamp the completion (client-supplied local day; server validates only).
    // `result` keeps the inspector's words VERBATIM (the historical record). `result_code`
    // is the CONTROL value written alongside it — the only thing any decision may read
    // (0056). They are written together, here, and nowhere else: this engine is the sole
    // writer of a completion, because the routes now refuse these fields on a plain PATCH.
    const completed = await db.update(id, {
      completedDate: b.completedDate,
      ...(b.result !== undefined ? { result: b.result, result_code: resultCode } : {}),
    }, stationId);
    await syncViolationRows(pool, completed, stationId);

    const openViolations = normalizeViolations(completed.violations)
      .filter((v) => v && typeof v === 'object' && !isResolvedViolationStatus(v.status));

    // 2 — the reinspection loop (preconditions already proven above).
    let reinspection = null;
    if (wantReinspection) {
      const when = reinspectWhen;
      const carried = normalizeViolations(
        openViolations.map((v) => {
          const { id: origKey, correctedDate, ...rest } = v;
          return { ...rest, carriedFrom: `${id}:${origKey}` }; // fresh id assigned below; photos stay with the original
        }),
        { assignId: true }
      );
      reinspection = await db.create({
        propertyId:    completed.propertyId,
        type:          'Reinspection',
        inspectorName: completed.inspectorName || '',
        scheduledDate: when,
        violations:    carried,
        notes:         `Reinspection of inspection #${id} (${openViolations.length} open violation${openViolations.length === 1 ? '' : 's'} carried).`,
        // P3 (0051): the reinspection follows the same inspector by default —
        // the incumbent workflow; rebalancing moves it via bulk-assign.
        assigned_to_user_id: completed.assigned_to_user_id ?? null,
      }, stationId);
      await syncViolationRows(pool, reinspection, stationId);
      await audit(stationId, user, 'create', 'fi_inspections', reinspection.id,
        { reinspectionOf: id, carried: carried.length, scheduledDate: when });
    }

    // 3 — the next cycle (the incumbents' completing-the-annual-schedules-next-year's).
    let nextCycle = null;
    if (b.scheduleNextCycle) {
      const { rows: types } = await pool.query(
        `SELECT default_frequency_days FROM fi_inspection_types
         WHERE department_id = $1 AND name = $2 AND active = TRUE AND deleted_at IS NULL
           AND default_frequency_days IS NOT NULL`,
        [stationId, completed.type]);
      if (types.length) {
        const target = addDaysISO(b.completedDate, types[0].default_frequency_days);
        // Idempotency guard: identical pending cycle already on the books → skip.
        const { rows: dupes } = await pool.query(
          `SELECT id FROM fi_inspections
           WHERE department_id = $1 AND "propertyId" = $2 AND type = $3
             AND "completedDate" IS NULL AND deleted_at IS NULL AND "scheduledDate" = $4`,
          [stationId, completed.propertyId, completed.type, target]);
        if (dupes.length) {
          nextCycle = { id: dupes[0].id, scheduledDate: target, deduplicated: true };
        } else {
          const created = await db.create({
            propertyId:    completed.propertyId,
            type:          completed.type,
            inspectorName: '',
            scheduledDate: target,
            violations:    [],
            notes:         '',
          }, stationId);
          await audit(stationId, user, 'create', 'fi_inspections', created.id,
            { nextCycleOf: id, scheduledDate: target });
          nextCycle = { id: created.id, scheduledDate: target };
        }
      }
    }

    await audit(stationId, user, 'update', 'fi_inspections', id, {
      completed: true, completedDate: b.completedDate,
      ...(reinspection ? { reinspectionId: reinspection.id } : {}),
      ...(nextCycle ? { nextCycleId: nextCycle.id } : {}),
    });
    return { data: completed, reinspection, nextCycle };
}

// The ONLINE door. Thin — all the judgment lives in the engine above, which the
// offline outbox calls through the same signature.
router.post('/:id/complete', idParam, loadFiContext, requireCommit,
  validate({ body: completeSchema }), scoped(async ({ req, stationId, user }) =>
    completeInspection({ id: +req.params.id, body: req.body, stationId, user })));

const answersSchema = z.object({
  checklistId: z.number().int().positive().nullable().default(null),
  answers: z.array(z.object({
    itemId: z.number().int().positive().nullable().default(null),
    prompt: z.string().trim().min(1).max(1000),
    code:   z.string().trim().max(40).default(''),
    answer: z.enum(['yes', 'no', 'na']),
  })).max(500),
});

router.put('/:id/answers', idParam, loadFiContext, requireInspector,
  validate({ body: answersSchema }), scoped(async ({ req, stationId, user }) => {
    const id = +req.params.id;
    const target = await db.findById(id, stationId);
    if (!target) throw httpError(404, 'Not found', 'NOT_FOUND');
    // The answers ARE the walkthrough of record. Once the inspection is completed
    // and served, they are finalized — a later edit would rewrite what the
    // inspector attested to, silently. (2026-07-13)
    if (target.completedDate) {
      throw httpError(409,
        'This inspection is completed — the checklist is a finalized legal record and cannot be edited.',
        'RECORD_FINALIZED');
    }
    if (req.body.checklistId != null) {
      const chk = await pool.query(
        'SELECT 1 FROM fi_checklists WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
        [req.body.checklistId, stationId]);
      if (!chk.rows.length) throw httpError(404, 'Checklist not found', 'CHECKLIST_NOT_FOUND');
    }
    const payload = req.body.answers.map((a, i) => ({
      item_id: a.itemId, prompt: a.prompt, code_snapshot: a.code, answer: a.answer, position: i,
    }));
    await pool.query(
      `WITH del AS (DELETE FROM fi_inspection_answers WHERE inspection_id = $1 AND department_id = $2)
       INSERT INTO fi_inspection_answers (department_id, inspection_id, checklist_id, item_id, prompt, code_snapshot, answer, position)
       SELECT $2, $1, $4, (r->>'item_id')::int, r->>'prompt', r->>'code_snapshot', r->>'answer', (r->>'position')::int
       FROM jsonb_array_elements($3::jsonb) AS r`,
      [id, stationId, JSON.stringify(payload), req.body.checklistId]);
    await audit(stationId, user, 'update', 'fi_inspection_answers', id,
      { answers: payload.length, no: payload.filter((a) => a.answer === 'no').length });
    return { data: { inspectionId: id, saved: payload.length } };
  }));

router.get('/:id/answers', idParam, scoped(async ({ req, stationId }) => {
  const { rows } = await pool.query(
    `SELECT item_id, prompt, code_snapshot, answer, position, answered_at
     FROM fi_inspection_answers
     WHERE inspection_id = $1 AND department_id = $2 ORDER BY position`,
    [+req.params.id, stationId]);
  return { data: rows };
}));

module.exports = router;
// Exported for the offline batch (routes/fiSync.js, P3.6): a queued 'answers.put'
// must be validated by the SAME schema this route uses — a second, copy-pasted
// schema would drift and quietly weaken the guard.
module.exports.answersSchema = answersSchema;
// P3.6 — offline completion. The device queues the INTENT; the SERVER mints the
// reinspection and the next cycle by calling this exact engine on drain. Same
// schema, same guards, same records — signal or no signal.
module.exports.completeSchema = completeSchema;
module.exports.completeInspection = completeInspection;
