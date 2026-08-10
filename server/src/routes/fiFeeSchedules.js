'use strict';
/**
 * routes/fiFeeSchedules.js — the fee-schedule writer and the assessment engine's surface
 * (Phase 3, module 3.2 Slice A).
 *
 * 0118 put five tables on prod and, until this file, NOTHING COULD WRITE THEM — the same state
 * fi_permit_types was in between 0093 and the 3.1b route. This is that writer, plus the two
 * read paths and the compute/commit path.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * SEPARATION OF DUTIES IS THE POINT OF THIS FILE (spec §8 F14, §1.9)
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The 2018 fire-marshal audit found, verbatim, *"Inspectors had access rights to change fees
 * in the system"*, alongside coordinators holding custody + authorization + recordkeeping +
 * void rights simultaneously. A third audit found *"an employee modified their own access to
 * screens and tables and modified the access rights of other staff members."*
 *
 * So the split here is deliberate and is not cosmetic:
 *   · requireInspector       — READ a schedule, and COMPUTE a proposal. An inspector must be
 *                              able to see what a permit costs and to produce a figure.
 *   · requirePreventionAdmin — AUTHOR or ADOPT a schedule, COMMIT a charge, RECORD a waiver.
 *
 * The person who computes is therefore not necessarily the person who commits, and an
 * inspector cannot touch the rate table at all. Note this is the SECOND line of defence, not
 * the only one: 0118's triggers refuse an edit to an adopted version regardless of which role
 * asks, so F14 survives someone writing a route wrongly later.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS ROUTE WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * · NO client-supplied totals. `computed_amount` and `computed_breakdown` are produced HERE by
 *   feeEngine and are not accepted from the body under any name. A money figure that arrives
 *   over the wire has no attributable computation behind it.
 * · NO Draft version may be assessed against. A proposal cites the version in force on the
 *   vesting date, and a Draft is by definition not in force.
 * · NO DELETE on a schedule, a version, or an assessment. Retain, never delete — and 0118
 *   revokes DELETE from of_app on all of them anyway. Draft fee LINES are deletable, because
 *   authoring a draft is the one moment numbers are supposed to move.
 * · The waiver dollar band is PER-DEPARTMENT CONFIG, never a hardcoded number (R9, spec
 *   §4b, 2026-08-05 — resolves what used to be open Q7 here). `fi_settings.
 *   waiver_approval_threshold` ships NULL (= no band, the old behaviour); when a department
 *   sets it, a waiver at/above the band needs a SECOND named approver — enforced by the
 *   0126 trigger at the database, with a readable 422 on the waive route. The ground +
 *   written basis + operator stay mandatory at EVERY amount, exactly as 0118 enforces.
 * · NO payments, NO holds. R2 settles it: we own the charge, Finance owns the money, and
 *   permit holds are A15 — a confirmed market absence and therefore a NON-GOAL.
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requireInspector, requirePreventionAdmin } = require('../middleware/fiAuth');
const { isIsoDay } = require('../utils/localDate');
const { computeFees, parseDec } = require('../utils/feeEngine');
const {
  FEE_ITEM_KINDS, FEE_VARIABLES, ROUNDING_MODES, MODIFIER_KINDS, ADOPTING_INSTRUMENTS,
  ASSESSMENT_KINDS, PENALTY_MULTIPLIER_MIN, PENALTY_MULTIPLIER_MAX, PER_UNIT_BASES,
} = require('../constants/feeSchedule');

const deptOf = (req) => req.user.department_id;

const idParam = z.object({ id: z.string().regex(/^\d+$/) });
const isoDay  = z.string().refine(isIsoDay, 'must be YYYY-MM-DD');
/** Money and rates arrive as STRINGS. See feeEngine's header: a float has already lost it. */
const decStr  = (maxDp) => z.string().regex(new RegExp(`^\\d{1,12}(\\.\\d{1,${maxDp}})?$`), `must be a decimal with at most ${maxDp} places`);

const createScheduleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  effective_from: isoDay,
  penalty_multiplier: decStr(2).optional(),
  penalty_stacking_allowed: z.boolean().optional(),
}).strict();

const addVersionSchema = z.object({
  effective_from: isoDay,
  clone_from_version_id: z.number().int().positive().optional(),
  penalty_multiplier: decStr(2).optional(),
  penalty_stacking_allowed: z.boolean().optional(),
}).strict();

const adoptSchema = z.object({
  adopting_instrument: z.enum(ADOPTING_INSTRUMENTS),
  adopting_instrument_ref: z.string().trim().min(1).max(200),
  adopted_by: z.string().trim().min(1).max(200),
  adopted_on: isoDay,
}).strict();

const itemSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  kind: z.enum(FEE_ITEM_KINDS),
  input_variable: z.enum(FEE_VARIABLES).nullish(),
  input_item_id: z.number().int().positive().nullish(),
  tier_axis_2: z.enum(FEE_VARIABLES).nullish(),
  flat_amount: decStr(2).nullish(),
  hourly_rate: decStr(2).nullish(),
  minimum_hours: decStr(2).optional(),
  rounding_increment_hours: decStr(4).nullish(),
  rounding_mode: z.enum(ROUNDING_MODES).optional(),
  after_hours_multiplier: decStr(2).nullish(),
  percent_rate: decStr(4).nullish(),
  surchargeable: z.boolean().optional(),
  min_amount: decStr(2).nullish(),
  max_amount: decStr(2).nullish(),
  sort_order: z.number().int().min(0).max(9999).optional(),
}).strict();

const tierSchema = z.object({
  axis1_min: decStr(4).nullish(), axis1_max: decStr(4).nullish(), axis1_match: z.string().trim().max(60).nullish(),
  axis2_min: decStr(4).nullish(), axis2_max: decStr(4).nullish(), axis2_match: z.string().trim().max(60).nullish(),
  amount: decStr(2),
  per_unit: decStr(4).nullish(),
  unit_size: decStr(4).nullish(),
  // 0120: a per-unit rate MUST state its basis. "$250 plus $15 per 1,000 sq ft" is $370 or $295
  // on the same building depending on this one field, so there is no default to fall back on.
  per_unit_basis: z.enum(PER_UNIT_BASES).nullish(),
  sort_order: z.number().int().min(0).max(9999).optional(),
}).strict().refine(
  (t) => (t.per_unit == null) === (t.per_unit_basis == null),
  { message: 'per_unit and per_unit_basis must be supplied together — a rate with no stated basis is two different fees, and a basis with no rate is a setting that changes nothing',
    path: ['per_unit_basis'] });

const modifierSchema = z.object({
  seq: z.number().int().positive().max(999),
  kind: z.enum(MODIFIER_KINDS),
  value: decStr(4),
  per_unit_variable: z.enum(FEE_VARIABLES).nullish(),
  unit_size: decStr(4).nullish(),
  note: z.string().trim().max(500).nullish(),
}).strict();

/** The engine's inputs. Values stay strings-or-numbers; the engine parses them exactly. */
const inputsSchema = z.record(z.union([z.string().max(60), z.number(), z.boolean()])).default({});

const calculateSchema = z.object({
  schedule_version_id: z.number().int().positive().optional(),
  schedule_id: z.number().int().positive().optional(),
  vesting_date: isoDay.optional(),
  inputs: inputsSchema,
  after_hours: z.boolean().optional(),
}).strict();

const assessmentSchema = z.object({
  permit_id: z.number().int().positive().nullish(),
  inspection_id: z.number().int().positive().nullish(),
  schedule_id: z.number().int().positive().optional(),
  schedule_version_id: z.number().int().positive().optional(),
  assessment_kind: z.enum(ASSESSMENT_KINDS).optional(),
  vesting_date: isoDay,
  inputs: inputsSchema,
  after_hours: z.boolean().optional(),
  // §1.6: a re-inspection fee needs a HUMAN discriminator. Not derivable from the result.
  reason_code: z.string().trim().max(60).nullish(),
  reason_text: z.string().trim().max(2000).nullish(),
}).strict();

const commitSchema = z.object({
  committed_amount: decStr(2),
  override_reason: z.string().trim().max(2000).nullish(),
}).strict();

const waiveSchema = z.object({
  waiver_amount: decStr(2),
  waiver_reason: z.string().trim().min(1).max(2000),
  // The R9 second approver — required by the 0126 band trigger when the department has set
  // `fi_settings.waiver_approval_threshold` and the waiver is at/above it; optional below.
  approving_authority: z.string().trim().min(1).max(200).optional(),
}).strict();

// ── helpers ──────────────────────────────────────────────────────────────────────────────

/** Load a version and assert it belongs to the caller's department. */
async function loadVersion(dept, versionId) {
  const { rows: [v] } = await pool.query(
    `SELECT v.id, v.schedule_id, v.version, v.status, v.effective_from, v.effective_to,
            v.penalty_multiplier, v.penalty_stacking_allowed,
            v.adopting_instrument, v.adopting_instrument_ref, v.adopted_by, v.adopted_on
       FROM fi_fee_schedule_versions v
      WHERE v.id = $1 AND v.department_id = $2`,
    [versionId, dept]
  );
  return v || null;
}

/** Every fee line of one version, ready for the engine. */
async function loadLines(dept, versionId) {
  const { rows: items } = await pool.query(
    `SELECT * FROM fi_fee_items WHERE version_id = $1 AND department_id = $2
      ORDER BY sort_order, id`, [versionId, dept]);
  if (items.length === 0) return { items, tiers: [], modifiers: [] };
  const ids = items.map((i) => i.id);
  const { rows: tiers } = await pool.query(
    `SELECT * FROM fi_fee_item_tiers WHERE item_id = ANY($1::int[]) AND department_id = $2
      ORDER BY sort_order, id`, [ids, dept]);
  const { rows: modifiers } = await pool.query(
    `SELECT * FROM fi_fee_item_modifiers WHERE item_id = ANY($1::int[]) AND department_id = $2
      ORDER BY seq`, [ids, dept]);
  return { items, tiers, modifiers };
}

/**
 * VESTING. §1.7: the vesting rule is ABSENT from every fee schedule read end to end — it lives
 * in the building administrative code — so the version in force is resolved ONCE, here, from an
 * explicit date, and then RECORDED on the assessment. F7 also warns that the vesting date is
 * NOT the renewal anchor; they are separate dates and must not be conflated.
 *
 * A Draft is never in force. Superseded versions still resolve, because something assessed
 * under them must stay reproducible.
 */
async function resolveVersionFor(dept, scheduleId, onDate) {
  const { rows } = await pool.query(
    `SELECT id, version, status FROM fi_fee_schedule_versions
      WHERE schedule_id = $1 AND department_id = $2
        AND status IN ('Adopted','Superseded')
        AND effective_from <= $3::date
        AND (effective_to IS NULL OR effective_to >= $3::date)
      ORDER BY effective_from DESC, version DESC`,
    [scheduleId, dept, onDate]
  );
  if (rows.length === 0) {
    throw httpError(422,
      'No adopted fee-schedule version was in force on that date. A charge cannot cite a '
      + 'schedule that had not been adopted yet.', 'NO_EFFECTIVE_VERSION');
  }
  if (rows.length > 1) {
    // The partial unique index only guarantees one OPEN version; overlapping closed ranges are
    // possible if effective_to was set carelessly. Refusing beats silently picking one.
    throw httpError(409,
      'More than one adopted version covers that date, so "which fee applied" has two answers. '
      + 'Fix the version date ranges before assessing.', 'AMBIGUOUS_EFFECTIVE_VERSION',
      rows.map((r) => `version ${r.version} (id ${r.id}, ${r.status}) also covers this date`));
  }
  return rows[0];
}

/** Run the engine, or turn its refusal into a 422 that names what is missing. */
function runEngine({ items, tiers, modifiers }, inputs, afterHours) {
  const result = computeFees({ items, tiers, modifiers, inputs, afterHours });
  if (!result.ok) {
    throw httpError(422,
      'The fee could not be computed from this schedule. See details — nothing was assumed to '
      + 'be zero.', 'FEE_NOT_COMPUTABLE',
      // `details` is string[] app-wide (middleware/errorHandler.js drops anything else), so the
      // engine's structured errors are flattened to code-prefixed lines: readable to a clerk,
      // greppable by a caller. Do NOT pass an object here — it vanishes silently.
      result.errors.map((e) => `${e.code}: ${e.message}`));
  }
  return result;
}

/* ── Reads (inspector) ─────────────────────────────────────────────────────────────────── */

router.get('/',
  loadFiContext, requireInspector,
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.created_at,
              (SELECT count(*)::int FROM fi_fee_schedule_versions v
                WHERE v.schedule_id = s.id AND v.department_id = s.department_id) AS version_count,
              (SELECT to_jsonb(x) FROM (
                 SELECT v.id, v.version, v.status, v.effective_from, v.effective_to,
                        v.adopting_instrument, v.adopting_instrument_ref, v.adopted_by, v.adopted_on
                   FROM fi_fee_schedule_versions v
                  WHERE v.schedule_id = s.id AND v.department_id = s.department_id
                    AND v.status = 'Adopted'
                  ORDER BY v.effective_from DESC, v.version DESC LIMIT 1) x) AS current_version
         FROM fi_fee_schedules s
        WHERE s.department_id = $1
        ORDER BY s.name`, [dept]);
    return { data: rows };
  }));

router.get('/:id/versions',
  loadFiContext, requireInspector,
  validate({ params: idParam }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const { rows } = await pool.query(
      `SELECT id, version, status, effective_from, effective_to, penalty_multiplier,
              penalty_stacking_allowed, adopting_instrument, adopting_instrument_ref,
              adopted_by, adopted_on, created_at, created_by_user_id
         FROM fi_fee_schedule_versions
        WHERE schedule_id = $1 AND department_id = $2
        ORDER BY version DESC`, [+req.params.id, dept]);
    return { data: rows };
  }));

router.get('/versions/:id',
  loadFiContext, requireInspector,
  validate({ params: idParam }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const version = await loadVersion(dept, +req.params.id);
    if (!version) throw httpError(404, 'No such fee schedule version.', 'NOT_FOUND');
    const { items, tiers, modifiers } = await loadLines(dept, version.id);
    return {
      data: {
        ...version,
        items: items.map((i) => ({
          ...i,
          tiers: tiers.filter((t) => t.item_id === i.id),
          modifiers: modifiers.filter((m) => m.item_id === i.id),
        })),
      },
    };
  }));

/* ── Authoring (prevention admin only — F14) ───────────────────────────────────────────── */

router.post('/',
  loadFiContext, requirePreventionAdmin,
  validate({ body: createScheduleSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const b = req.body;
    if (b.penalty_multiplier !== undefined) assertPenaltyBand(b.penalty_multiplier);
    let schedule;
    try {
      ({ rows: [schedule] } = await pool.query(
        `INSERT INTO fi_fee_schedules (department_id, name) VALUES ($1,$2) RETURNING id, name`,
        [dept, b.name]));
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'A fee schedule with that name already exists.', 'DUPLICATE_NAME');
      throw e;
    }
    // Version 1 starts as a DRAFT. It is not in force and cannot be assessed against until it
    // is adopted with its instrument named — which is the whole point of the rate-table control.
    const { rows: [version] } = await pool.query(
      `INSERT INTO fi_fee_schedule_versions
         (department_id, schedule_id, version, status, effective_from,
          penalty_multiplier, penalty_stacking_allowed, created_by_user_id)
       VALUES ($1,$2,1,'Draft',$3,COALESCE($4::numeric,2.00),COALESCE($5,FALSE),$6)
       RETURNING id, version, status, effective_from, penalty_multiplier, penalty_stacking_allowed`,
      [dept, schedule.id, b.effective_from, b.penalty_multiplier ?? null,
       b.penalty_stacking_allowed ?? null, req.user.id ?? null]);
    await audit(dept, req.user, 'create', 'fi_fee_schedules', schedule.id,
      { action: 'create_schedule', name: b.name, version: 1 });
    return { data: { ...schedule, draft: version } };
  }));

router.post('/:id/versions',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: addVersionSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const scheduleId = +req.params.id;
    const b = req.body;
    if (b.penalty_multiplier !== undefined) assertPenaltyBand(b.penalty_multiplier);

    const { rows: [sched] } = await pool.query(
      `SELECT id FROM fi_fee_schedules WHERE id = $1 AND department_id = $2`, [scheduleId, dept]);
    if (!sched) throw httpError(404, 'No such fee schedule.', 'NOT_FOUND');

    const { rows: [{ max: maxVersion }] } = await pool.query(
      `SELECT COALESCE(MAX(version),0) AS max FROM fi_fee_schedule_versions
        WHERE schedule_id = $1 AND department_id = $2`, [scheduleId, dept]);

    // A new DRAFT must be closed-ended-free but must not collide with the open version. The
    // partial unique index allows exactly one row with effective_to IS NULL per schedule, so a
    // draft is created CLOSED (effective_to = effective_from) and the adopt step opens it.
    // That keeps "which version is open" unambiguous while a draft is being authored.
    let created;
    try {
      ({ rows: [created] } = await pool.query(
        `INSERT INTO fi_fee_schedule_versions
           (department_id, schedule_id, version, status, effective_from, effective_to,
            penalty_multiplier, penalty_stacking_allowed, created_by_user_id)
         VALUES ($1,$2,$3,'Draft',$4,$4,COALESCE($5::numeric,2.00),COALESCE($6,FALSE),$7)
         RETURNING id, version, status, effective_from, effective_to`,
        [dept, scheduleId, maxVersion + 1, b.effective_from,
         b.penalty_multiplier ?? null, b.penalty_stacking_allowed ?? null, req.user.id ?? null]));
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'That version number already exists.', 'DUPLICATE_VERSION');
      throw e;
    }

    let cloned = 0;
    if (b.clone_from_version_id) {
      const src = await loadVersion(dept, b.clone_from_version_id);
      if (!src || src.schedule_id !== scheduleId) {
        throw httpError(404, 'The version to clone from does not belong to this schedule.', 'NOT_FOUND');
      }
      cloned = await cloneLines(dept, src.id, created.id);
    }

    await audit(dept, req.user, 'create', 'fi_fee_schedule_versions', created.id,
      { action: 'add_draft_version', schedule_id: scheduleId, version: created.version,
        cloned_from: b.clone_from_version_id ?? null, cloned_items: cloned });
    return { data: { ...created, cloned_items: cloned } };
  }));

/**
 * Adopt a Draft. THIS is the control the §1.9 rate-table audit is about: 5 of 15 sampled entries
 * did not match the board-approved schedule and the schedule in force traced to a board action
 * SEVEN YEARS earlier. After this call the numbers are frozen and they name the instrument that
 * authorises them; changing a fee means a NEW version, which 0118's trigger enforces.
 */
router.post('/versions/:id/adopt',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: adoptSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const b = req.body;
    const version = await loadVersion(dept, +req.params.id);
    if (!version) throw httpError(404, 'No such fee schedule version.', 'NOT_FOUND');
    if (version.status !== 'Draft') {
      throw httpError(409, `That version is already ${version.status}. Adopted fee terms are frozen — author a new version.`, 'NOT_A_DRAFT');
    }
    const { items } = await loadLines(dept, version.id);
    if (items.length === 0) {
      // An adopted schedule with no lines computes nothing and would refuse every assessment.
      throw httpError(422, 'A fee schedule version cannot be adopted with no fee lines.', 'EMPTY_VERSION');
    }

    const effFrom = version.effective_from.toISOString().slice(0, 10);
    const { rows: [open] } = await pool.query(
      `SELECT id, version, effective_from FROM fi_fee_schedule_versions
        WHERE schedule_id = $1 AND department_id = $2 AND effective_to IS NULL
          AND status IN ('Adopted','Superseded')`,
      [version.schedule_id, dept]);
    if (open && !(effFrom > open.effective_from.toISOString().slice(0, 10))) {
      throw httpError(422,
        'A new version must take effect AFTER the one it replaces — otherwise "which fee '
        + 'applied on this date" has two answers.', 'EFFECTIVE_FROM_NOT_AFTER');
    }

    // One statement: close the incumbent and open the newcomer together. The data dependency
    // forces the UPDATE first, so the partial unique index never sees two open rows — the same
    // idiom the 3.1b rule-version route uses, and for the same reason.
    let adopted;
    try {
      ({ rows: [adopted] } = await pool.query(
        `WITH closed AS (
           UPDATE fi_fee_schedule_versions
              SET effective_to = ($2::date - INTERVAL '1 day')::date, status = 'Superseded'
            WHERE department_id = $3 AND schedule_id = $4 AND effective_to IS NULL
              AND status IN ('Adopted','Superseded')
            RETURNING id
         )
         UPDATE fi_fee_schedule_versions v
            SET status = 'Adopted', effective_to = NULL,
                adopting_instrument = $5, adopting_instrument_ref = $6,
                adopted_by = $7, adopted_on = $8::date
          WHERE v.id = $1 AND v.department_id = $3 AND v.status = 'Draft'
          RETURNING v.id, v.version, v.status, v.effective_from, v.effective_to,
                    v.adopting_instrument, v.adopting_instrument_ref, v.adopted_by, v.adopted_on`,
        [version.id, effFrom, dept, version.schedule_id,
         b.adopting_instrument, b.adopting_instrument_ref, b.adopted_by, b.adopted_on]));
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'Another version is already open for this schedule.', 'ALREADY_OPEN');
      throw e;
    }
    if (!adopted) throw httpError(409, 'The version changed while you were adopting it.', 'CONFLICT');

    await audit(dept, req.user, 'approve', 'fi_fee_schedule_versions', adopted.id,
      { action: 'adopt', schedule_id: version.schedule_id, version: adopted.version,
        adopting_instrument: b.adopting_instrument, adopting_instrument_ref: b.adopting_instrument_ref,
        adopted_by: b.adopted_by, adopted_on: b.adopted_on,
        superseded_version_id: open?.id ?? null, item_count: items.length });
    return { data: adopted };
  }));

/* ── Fee lines. Draft only — 0118's trigger also refuses once adopted. ─────────────────── */

router.post('/versions/:id/items',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: itemSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const version = await assertDraft(dept, +req.params.id);
    const b = req.body;
    if (b.input_item_id) await assertSameVersion(dept, version.id, b.input_item_id);
    const cols = [
      'department_id', 'version_id', 'code', 'name', 'kind', 'input_variable', 'input_item_id',
      'tier_axis_2', 'flat_amount', 'hourly_rate', 'minimum_hours', 'rounding_increment_hours',
      'rounding_mode', 'after_hours_multiplier', 'percent_rate', 'surchargeable',
      'min_amount', 'max_amount', 'sort_order',
    ];
    const vals = [
      dept, version.id, b.code, b.name, b.kind, b.input_variable ?? null, b.input_item_id ?? null,
      b.tier_axis_2 ?? null, b.flat_amount ?? null, b.hourly_rate ?? null, b.minimum_hours ?? '0',
      b.rounding_increment_hours ?? null, b.rounding_mode ?? 'up_any_part',
      b.after_hours_multiplier ?? null, b.percent_rate ?? null,
      b.surchargeable ?? (b.kind === 'surcharge' ? false : true),
      b.min_amount ?? null, b.max_amount ?? null, b.sort_order ?? 0,
    ];
    const row = await insertRow('fi_fee_items', cols, vals, {
      23505: ['That fee code already exists in this version.', 'DUPLICATE_CODE'],
    });
    await audit(dept, req.user, 'create', 'fi_fee_items', row.id,
      { action: 'add_fee_item', version_id: version.id, code: b.code, kind: b.kind });
    return { data: row };
  }));

router.patch('/versions/:id/items/:itemId',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam.extend({ itemId: z.string().regex(/^\d+$/) }), body: itemSchema.partial().strict() }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const version = await assertDraft(dept, +req.params.id);
    const itemId = +req.params.itemId;
    const b = req.body;
    // `code` is the CONTROL value a stored assessment's breakdown refers to by name, so it is
    // not patchable even in a draft — delete the line and add it under the intended code.
    if (b.code !== undefined) {
      throw httpError(409, 'A fee code cannot be renamed. Delete the line and add it under the intended code.', 'CODE_IMMUTABLE');
    }
    const fields = Object.keys(b);
    if (fields.length === 0) throw httpError(422, 'Nothing to update.', 'EMPTY_PATCH');
    if (b.input_item_id) await assertSameVersion(dept, version.id, b.input_item_id);

    const sets = fields.map((f, i) => `${f} = $${i + 3}`);
    const { rows: [row] } = await pool.query(
      `UPDATE fi_fee_items SET ${sets.join(', ')}
        WHERE id = $1 AND department_id = $2 AND version_id = $${fields.length + 3}
        RETURNING *`,
      [itemId, dept, ...fields.map((f) => b[f]), version.id]);
    if (!row) throw httpError(404, 'No such fee line on that version.', 'NOT_FOUND');
    await audit(dept, req.user, 'update', 'fi_fee_items', itemId,
      { action: 'edit_fee_item', version_id: version.id, fields });
    return { data: row };
  }));

router.delete('/versions/:id/items/:itemId',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam.extend({ itemId: z.string().regex(/^\d+$/) }) }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const version = await assertDraft(dept, +req.params.id);
    const itemId = +req.params.itemId;
    // Deleting a line another line chains from would leave a dangling base; RESTRICT catches it.
    let deleted;
    try {
      ({ rows: [deleted] } = await pool.query(
        `DELETE FROM fi_fee_items WHERE id = $1 AND department_id = $2 AND version_id = $3
          RETURNING id, code`, [itemId, dept, version.id]));
    } catch (e) {
      if (e.code === '23503') throw httpError(409, 'Another fee line chains from this one. Remove that line first.', 'REFERENCED');
      throw e;
    }
    if (!deleted) throw httpError(404, 'No such fee line on that version.', 'NOT_FOUND');
    await audit(dept, req.user, 'soft_delete', 'fi_fee_items', itemId,
      { action: 'delete_draft_fee_item', version_id: version.id, code: deleted.code });
    return { data: deleted };
  }));

router.post('/versions/:id/items/:itemId/tiers',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam.extend({ itemId: z.string().regex(/^\d+$/) }), body: tierSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const version = await assertDraft(dept, +req.params.id);
    const itemId = await assertItemOnVersion(dept, version.id, +req.params.itemId);
    const b = req.body;
    const row = await insertRow('fi_fee_item_tiers',
      ['department_id', 'item_id', 'axis1_min', 'axis1_max', 'axis1_match',
       'axis2_min', 'axis2_max', 'axis2_match', 'amount', 'per_unit', 'unit_size',
       'per_unit_basis', 'sort_order'],
      [dept, itemId, b.axis1_min ?? null, b.axis1_max ?? null, b.axis1_match ?? null,
       b.axis2_min ?? null, b.axis2_max ?? null, b.axis2_match ?? null,
       b.amount, b.per_unit ?? null, b.unit_size ?? null, b.per_unit_basis ?? null,
       b.sort_order ?? 0]);
    await audit(dept, req.user, 'create', 'fi_fee_item_tiers', row.id,
      { action: 'add_tier', version_id: version.id, item_id: itemId });
    return { data: row };
  }));

router.post('/versions/:id/items/:itemId/modifiers',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam.extend({ itemId: z.string().regex(/^\d+$/) }), body: modifierSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const version = await assertDraft(dept, +req.params.id);
    const itemId = await assertItemOnVersion(dept, version.id, +req.params.itemId);
    const b = req.body;
    const row = await insertRow('fi_fee_item_modifiers',
      ['department_id', 'item_id', 'seq', 'kind', 'value', 'per_unit_variable', 'unit_size', 'note'],
      [dept, itemId, b.seq, b.kind, b.value, b.per_unit_variable ?? null, b.unit_size ?? null, b.note ?? null],
      { 23505: ['That sequence position is already taken on this fee line.', 'DUPLICATE_SEQ'] });
    await audit(dept, req.user, 'create', 'fi_fee_item_modifiers', row.id,
      { action: 'add_modifier', version_id: version.id, item_id: itemId, seq: b.seq, kind: b.kind });
    return { data: row };
  }));

/* ── Compute (inspector may compute; only an admin may commit) ─────────────────────────── */

/**
 * A DRY RUN. Writes nothing, so it is the safe way to see what a schedule does — including
 * against a Draft, which is how an author checks their work before adopting it.
 */
router.post('/calculate',
  loadFiContext, requireInspector,
  validate({ body: calculateSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const b = req.body;
    let versionId = b.schedule_version_id;
    if (!versionId) {
      if (!b.schedule_id || !b.vesting_date) {
        throw httpError(422, 'Provide schedule_version_id, or schedule_id with vesting_date.', 'VERSION_UNRESOLVED');
      }
      versionId = (await resolveVersionFor(dept, b.schedule_id, b.vesting_date)).id;
    }
    const version = await loadVersion(dept, versionId);
    if (!version) throw httpError(404, 'No such fee schedule version.', 'NOT_FOUND');
    const lines = await loadLines(dept, version.id);
    const result = runEngine(lines, b.inputs, b.after_hours === true);
    return { data: { schedule_version_id: version.id, version: version.version,
                     status: version.status, total: result.total, lines: result.lines } };
  }));

/**
 * Create an ASSESSMENT — the computed proposal, persisted. The engine runs HERE; no total is
 * accepted from the body. Append-only from the moment it exists (0118's trigger).
 */
router.post('/assessments',
  loadFiContext, requireInspector,
  validate({ body: assessmentSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const b = req.body;
    if (!!b.permit_id === !!b.inspection_id) {
      throw httpError(422, 'An assessment attaches to exactly one of a permit or an inspection.', 'SUBJECT_REQUIRED');
    }
    const kind = b.assessment_kind ?? 'base';
    // §1.6, enforced here as well as by the CHECK: a re-inspection fee CANNOT be derived from
    // the inspection result. One county's published matrix has two rows near-identical in text
    // and OPPOSITE in outcome, discriminated only by a human judgment about fault.
    if (kind === 'reinspection' && !b.reason_code) {
      throw httpError(422,
        'A re-inspection fee needs an inspector-attested reason code — it cannot be derived '
        + 'from the inspection result.', 'REINSPECTION_REASON_REQUIRED');
    }

    let versionId = b.schedule_version_id;
    if (!versionId) {
      if (!b.schedule_id) throw httpError(422, 'Provide schedule_version_id or schedule_id.', 'VERSION_UNRESOLVED');
      versionId = (await resolveVersionFor(dept, b.schedule_id, b.vesting_date)).id;
    }
    const version = await loadVersion(dept, versionId);
    if (!version) throw httpError(404, 'No such fee schedule version.', 'NOT_FOUND');
    if (version.status === 'Draft') {
      throw httpError(422, 'A Draft fee schedule is not in force and cannot be charged against.', 'DRAFT_NOT_CHARGEABLE');
    }

    const lines = await loadLines(dept, version.id);
    const result = runEngine(lines, b.inputs, b.after_hours === true);

    const row = await insertRow('fi_fee_assessments',
      ['department_id', 'permit_id', 'inspection_id', 'assessment_kind', 'schedule_version_id',
       'vesting_date', 'inputs', 'computed_amount', 'computed_breakdown',
       'reason_code', 'reason_text', 'attested_by_user_id'],
      [dept, b.permit_id ?? null, b.inspection_id ?? null, kind, version.id,
       b.vesting_date, JSON.stringify(b.inputs ?? {}), result.total, JSON.stringify(result.lines),
       b.reason_code ?? null, b.reason_text ?? null,
       // The attestation belongs to whoever asserted the reason, which is this caller.
       (kind === 'reinspection' ? (req.user.id ?? null) : null)],
      { 23503: ['That permit or inspection does not exist.', 'SUBJECT_NOT_FOUND'] });

    await audit(dept, req.user, 'create', 'fi_fee_assessments', row.id,
      { action: 'assess', kind, schedule_version_id: version.id, vesting_date: b.vesting_date,
        computed_amount: result.total, permit_id: b.permit_id ?? null,
        inspection_id: b.inspection_id ?? null, reason_code: b.reason_code ?? null });
    return { data: row };
  }));

/**
 * COMMIT — the human act. A different amount is allowed; an UNEXPLAINED different amount is not
 * (the "$11,127 of errors in both directions" control). Once committed it cannot be re-committed
 * in place: a correction is a NEW linked record, which is Slice B.
 */
router.post('/assessments/:id/commit',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: commitSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const b = req.body;
    const { rows: [existing] } = await pool.query(
      `SELECT id, computed_amount, committed_at FROM fi_fee_assessments
        WHERE id = $1 AND department_id = $2`, [id, dept]);
    if (!existing) throw httpError(404, 'No such assessment.', 'NOT_FOUND');
    if (existing.committed_at) {
      throw httpError(409,
        'That charge is already committed. A committed charge is corrected by a new linked '
        + 'record, never in place.', 'ALREADY_COMMITTED');
    }
    // 🔴 THIS WAS A STRING COMPARISON, AND IT WROTE A FALSE AUDIT ROW.
    // computed_amount arrives from formatMoney as "350.00"; the schema accepts "350"
    // and "350.0". So a clerk committing EXACTLY the computed amount, typed without
    // trailing zeros, was (a) refused 422 OVERRIDE_REASON_REQUIRED for an override they
    // did not make, and then (b) once they complied, recorded with an override_reason
    // and audited `overridden: true` — a false claim that a human overrode the engine,
    // in the one module whose entire purpose is auditability.
    // Compared with parseDec (scaled BigInt), the same path the waiver gate below uses.
    // NOT Number: (1.005).toFixed(2) === "1.00" is why this module is BigInt throughout.
    // parseDec returns null on garbage; the zod regex has already passed, so null here
    // would be a genuine surprise — treat it as "differs" and demand a reason rather
    // than silently calling an unparseable amount equal to the computed one.
    const computedScaled  = parseDec(String(existing.computed_amount));
    const committedScaled = parseDec(String(b.committed_amount));
    const differs = computedScaled === null || committedScaled === null
      || computedScaled !== committedScaled;
    if (differs && !(b.override_reason && b.override_reason.trim())) {
      throw httpError(422,
        'Committing an amount different from the computed one requires a written reason.',
        'OVERRIDE_REASON_REQUIRED');
    }

    const { rows: [row] } = await pool.query(
      `UPDATE fi_fee_assessments
          SET committed_amount = $3::numeric, committed_at = NOW(),
              committed_by_user_id = $4, override_reason = $5
        WHERE id = $1 AND department_id = $2 AND committed_at IS NULL
        RETURNING *`,
      [id, dept, b.committed_amount, req.user.id ?? null, differs ? b.override_reason.trim() : null]);
    if (!row) throw httpError(409, 'The assessment was committed while you were committing it.', 'CONFLICT');

    await audit(dept, req.user, 'approve', 'fi_fee_assessments', id,
      { action: 'commit', computed_amount: existing.computed_amount,
        committed_amount: b.committed_amount, overridden: differs,
        override_reason: differs ? b.override_reason.trim() : null });
    return { data: row };
  }));

/**
 * WAIVE. Auditors sample waivers and voids FIRST (§1.9), so a waiver is never anonymous and
 * never unreasoned.
 *
 * R9 (2026-08-05, spec §4b — resolves what this comment used to call open Q7): the dollar
 * band is per-department CONFIG (`fi_settings.waiver_approval_threshold`) and SHIPS UNSET —
 * NULL = no band = the old behaviour, because the state auditor's manual requires approval
 * "above a dollar threshold" but publishes no figure, and a hardcoded default would put
 * unratified policy inside a money control. When a department sets the band, a waiver
 * at/above it requires a SECOND named approver (`approving_authority`), enforced by the
 * 0126 trigger at the database and given a readable 422 here.
 */
router.post('/assessments/:id/waive',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: waiveSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const b = req.body;

    // Readable path to the trigger's refusal. BigInt via parseDec — never a float.
    const band = req.fi.settings.waiver_approval_threshold;
    if (band !== null && band !== undefined
        && parseDec(String(b.waiver_amount)) >= parseDec(String(band))
        && !b.approving_authority) {
      throw httpError(422,
        `A waiver of $${b.waiver_amount} is at or above this department's approval threshold `
        + `($${band}) and requires a second named approver.`, 'SECOND_APPROVER_REQUIRED');
    }

    const { rows: [row] } = await pool.query(
      `UPDATE fi_fee_assessments
          SET waiver_amount = $3::numeric, waiver_reason = $4,
              waived_by_user_id = $5, waived_at = NOW(),
              waiver_approving_authority = $6
        WHERE id = $1 AND department_id = $2 AND waived_at IS NULL
        RETURNING *`,
      [id, dept, b.waiver_amount, b.waiver_reason.trim(), req.user.id ?? null,
       b.approving_authority ?? null]);
    if (!row) {
      const { rows: [exists] } = await pool.query(
        `SELECT waived_at FROM fi_fee_assessments WHERE id = $1 AND department_id = $2`, [id, dept]);
      if (!exists) throw httpError(404, 'No such assessment.', 'NOT_FOUND');
      throw httpError(409, 'A waiver is already recorded on that assessment and cannot be rewritten.', 'ALREADY_WAIVED');
    }
    await audit(dept, req.user, 'approve', 'fi_fee_assessments', id,
      { action: 'waive', waiver_amount: b.waiver_amount, waiver_reason: b.waiver_reason.trim(),
        approving_authority: b.approving_authority ?? null });
    return { data: row };
  }));

router.get('/assessments',
  loadFiContext, requireInspector,
  validate({ query: z.object({
    permit_id: z.string().regex(/^\d+$/).optional(),
    inspection_id: z.string().regex(/^\d+$/).optional(),
    // F18: the auditor's first stop. Zero-fee records must be reachable as a first-class query,
    // not discovered by scrolling.
    zero_fee: z.enum(['1', 'true']).optional(),
    uncommitted: z.enum(['1', 'true']).optional(),
  }).strict() }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const q = req.query;
    const where = ['department_id = $1'];
    const vals = [dept];
    if (q.permit_id) { vals.push(+q.permit_id); where.push(`permit_id = $${vals.length}`); }
    if (q.inspection_id) { vals.push(+q.inspection_id); where.push(`inspection_id = $${vals.length}`); }
    if (q.zero_fee === '1' || q.zero_fee === 'true') where.push('(computed_amount = 0 OR committed_amount = 0)');
    if (q.uncommitted === '1' || q.uncommitted === 'true') where.push('committed_at IS NULL');
    const { rows } = await pool.query(
      `SELECT * FROM fi_fee_assessments WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC LIMIT 500`, vals);
    return { data: rows };
  }));

// ── small shared helpers ─────────────────────────────────────────────────────────────────

function assertPenaltyBand(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < PENALTY_MULTIPLIER_MIN || n > PENALTY_MULTIPLIER_MAX) {
    throw httpError(422,
      `The work-without-a-permit penalty multiplier must be between ${PENALTY_MULTIPLIER_MIN} `
      + `and ${PENALTY_MULTIPLIER_MAX} — the band the market actually runs.`, 'PENALTY_OUT_OF_BAND');
  }
}

async function assertDraft(dept, versionId) {
  const version = await loadVersion(dept, versionId);
  if (!version) throw httpError(404, 'No such fee schedule version.', 'NOT_FOUND');
  if (version.status !== 'Draft') {
    throw httpError(409,
      `That version is ${version.status} — adopted fee terms are frozen. Author a new version.`,
      'VERSION_FROZEN');
  }
  return version;
}

async function assertItemOnVersion(dept, versionId, itemId) {
  const { rows: [row] } = await pool.query(
    `SELECT id FROM fi_fee_items WHERE id = $1 AND department_id = $2 AND version_id = $3`,
    [itemId, dept, versionId]);
  if (!row) throw httpError(404, 'No such fee line on that version.', 'NOT_FOUND');
  return row.id;
}

/** A chained base item must live on the SAME version — cross-version chaining is incoherent. */
async function assertSameVersion(dept, versionId, baseItemId) {
  const { rows: [row] } = await pool.query(
    `SELECT id FROM fi_fee_items WHERE id = $1 AND department_id = $2 AND version_id = $3`,
    [baseItemId, dept, versionId]);
  if (!row) {
    throw httpError(422,
      'A fee line can only chain from another line on the SAME schedule version.',
      'BASE_ITEM_OFF_VERSION');
  }
}

/**
 * Copy every fee line of one version onto another (a fresh Draft). Clone is how a department
 * amends a schedule: adopted terms are frozen, so "raise the inspection fee" means clone the
 * current version, edit the clone, adopt it.
 *
 * The id REMAP is the whole difficulty. `input_item_id` points at a SIBLING line, so a naive copy
 * would leave the clone's lines chained to the ORIGINAL version's items — silently computing off
 * a frozen schedule, and exactly the kind of bug that never announces itself.
 *
 * 🔴 THE OBVIOUS IMPLEMENTATION DOES NOT WORK, AND THE TEST CAUGHT IT. The natural approach is
 * two passes: insert everything with input_item_id NULL, build an old→new map, then re-point.
 * That is impossible here, because 0118 CHECKs
 *   kind <> 'percent_of' OR (percent_rate IS NOT NULL AND input_item_id IS NOT NULL)
 * so a percent_of line CANNOT EXIST with a null base even for one statement (23514,
 * fi_fee_items_check5). The constraint is right and the algorithm was wrong: insert in
 * DEPENDENCY ORDER instead, so a base line always exists before the line that chains from it and
 * no invalid intermediate state is ever created.
 */
async function cloneLines(dept, fromVersionId, toVersionId) {
  const { items, tiers, modifiers } = await loadLines(dept, fromVersionId);
  if (items.length === 0) return 0;

  const idMap = new Map();
  let remaining = items.slice();
  while (remaining.length) {
    const ready = remaining.filter((it) => !it.input_item_id || idMap.has(it.input_item_id));
    if (ready.length === 0) {
      // Either a chain points off-version, or the stored data contains a cycle (the DB blocks
      // only self-reference). Both mean the version cannot be reproduced faithfully, and a
      // faithful copy is the entire point — so refuse rather than clone something different.
      throw httpError(422,
        `This version cannot be cloned faithfully: ${remaining.map((r) => r.code).join(', ')} `
        + 'chain from a line outside the version, or form a cycle.', 'UNCLONEABLE_CHAIN',
        remaining.map((r) => `unresolvable chain on fee line ${r.code}`));
    }
    for (const it of ready) {
      let row;
      try {
        ({ rows: [row] } = await pool.query(
          `INSERT INTO fi_fee_items
             (department_id, version_id, code, name, kind, input_variable, input_item_id,
              tier_axis_2, flat_amount, hourly_rate, minimum_hours, rounding_increment_hours,
              rounding_mode, after_hours_multiplier, percent_rate, surchargeable,
              min_amount, max_amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           RETURNING id`,
          [dept, toVersionId, it.code, it.name, it.kind, it.input_variable,
           it.input_item_id ? idMap.get(it.input_item_id) : null,
           it.tier_axis_2, it.flat_amount, it.hourly_rate, it.minimum_hours,
           it.rounding_increment_hours, it.rounding_mode, it.after_hours_multiplier,
           it.percent_rate, it.surchargeable, it.min_amount, it.max_amount, it.sort_order]));
      } catch (e) {
        if (e.code === '23514') {
          throw httpError(422,
            `Fee line ${it.code} could not be cloned — the copy would not satisfy the schema.`,
            'UNCLONEABLE_LINE', [`fee line ${it.code}`, `constraint: ${e.constraint ?? 'unknown'}`]);
        }
        throw e;
      }
      idMap.set(it.id, row.id);
    }
    remaining = remaining.filter((it) => !idMap.has(it.id));
  }
  for (const t of tiers) {
    await pool.query(
      `INSERT INTO fi_fee_item_tiers
         (department_id, item_id, axis1_min, axis1_max, axis1_match,
          axis2_min, axis2_max, axis2_match, amount, per_unit, unit_size, per_unit_basis, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [dept, idMap.get(t.item_id), t.axis1_min, t.axis1_max, t.axis1_match,
       t.axis2_min, t.axis2_max, t.axis2_match, t.amount, t.per_unit, t.unit_size,
       t.per_unit_basis, t.sort_order]);
  }
  for (const m of modifiers) {
    await pool.query(
      `INSERT INTO fi_fee_item_modifiers
         (department_id, item_id, seq, kind, value, per_unit_variable, unit_size, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [dept, idMap.get(m.item_id), m.seq, m.kind, m.value, m.per_unit_variable, m.unit_size, m.note]);
  }
  return items.length;
}

async function insertRow(table, cols, vals, errorMap = {}) {
  const params = cols.map((_, i) => `$${i + 1}`).join(',');
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${params}) RETURNING *`, vals);
    return row;
  } catch (e) {
    const mapped = errorMap[e.code];
    if (mapped) throw httpError(409, mapped[0], mapped[1]);
    // A CHECK violation here is the schema refusing an incoherent fee line. Surface it as a
    // 422 with the constraint name rather than a 500 — the caller can act on it.
    if (e.code === '23514') {
      throw httpError(422,
        'That fee definition is not internally consistent (a primitive is missing the parameter '
        + 'it cannot compute without, or two settings contradict).', 'INCONSISTENT_FEE_DEFINITION',
        [`constraint: ${e.constraint ?? 'unknown'}`]);
    }
    if (e.code === '23503') {
      throw httpError(422, 'A referenced record does not exist.', 'BAD_REFERENCE',
        [`constraint: ${e.constraint ?? 'unknown'}`]);
    }
    throw e;
  }
}

module.exports = router;
