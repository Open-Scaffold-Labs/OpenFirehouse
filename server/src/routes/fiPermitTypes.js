'use strict';
/**
 * routes/fiPermitTypes.js — the department-authored permit catalogue (Phase 3, module 3.1b).
 *
 * `fi_permit_types` and `fi_permit_expiration_rule_groups` / `_rules` went live on prod with
 * 0093 and until now NOTHING COULD WRITE THEM. This is that writer.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE SHAPE IS THE MARKET'S, NOT A GUESS
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * · A type is a LINK HUB, not a bag of scalars. Duration does not live on it — neither
 *   documented platform carries a scalar term. It points at an expiration RULE GROUP
 *   carrying term · about-to-expire window · grace period.
 * · Rule versions are EFFECTIVE-DATED: adding one auto-closes the prior, the start date is
 *   immutable after save (0093 grants of_app UPDATE on effective_to and nothing else), and
 *   old versions are retained. COMMON, 2 of 2 platforms.
 * · Types version by CLONE-AND-RETIRE, which is how the one platform that documents type
 *   versioning does it.
 * · RETIRE, NEVER DELETE. A type with issued permits is referenced by legal records.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT HERE
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * · `fee_schedule_id` is a SEAM. 3.2 owns fees; this route neither sets nor reads it.
 * · `requires_inspection` is stored and NOT enforced. The issuance gate is 3.2's, and only
 *   after R3's contractor-licensure gate is re-tested — it is UNVERIFIED and looks sourced
 *   from construction practice (fourth appearance of that trap this session).
 * · No DELETE route at all. Not "a delete that soft-deletes" — no route.
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requireInspector, requirePreventionAdmin } = require('../middleware/fiAuth');
const { isIsoDay } = require('../utils/localDate');

const idParam = z.object({ id: z.string().regex(/^\d+$/) });
const isoDay  = z.string().refine(isIsoDay, 'must be YYYY-MM-DD');

const ruleFields = {
  term_value:         z.number().int().positive(),
  term_unit:          z.enum(['day', 'month', 'year']),
  notice_window_days: z.number().int().min(0).max(3650),
  grace_days:         z.number().int().min(0).max(3650),
};

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  effective_from: isoDay,
  ...ruleFields,
}).strict();

const addVersionSchema = z.object({
  effective_from: isoDay,
  ...ruleFields,
}).strict();

const createTypeSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Z0-9_.-]+$/,
    'code is a control value: A-Z, 0-9, dot, dash, underscore only'),
  name: z.string().trim().min(1).max(160),
  ifc_section: z.string().trim().max(20).optional(),
  expiration_rule_group_id: z.number().int().positive().optional(),
  requires_inspection: z.boolean().optional(),
  allow_renewal: z.boolean().optional(),
  portal_visibility: z.enum(['staff_only', 'view_only', 'apply_online']).optional(),
  autonumber_prefix: z.string().trim().max(16).optional(),
  status: z.enum(['Draft', 'Active']).optional(),   // never 'Retired' via create
}).strict();

// `code` and `version` are absent on purpose. The code is the CONTROL value that issued
// permits were classified by — changing what a code MEANS is clone-and-retire, not an edit.
const patchTypeSchema = createTypeSchema.omit({ code: true }).partial().strict();

const deptOf = (req) => req.user.department_id;

/* ── Expiration rule groups ─────────────────────────────────────────────────────────── */

router.get('/rule-groups',
  loadFiContext, requireInspector,
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const { rows } = await pool.query(
      `SELECT g.id, g.name, g.created_at,
              r.id AS current_version_id, r.version, r.term_value, r.term_unit,
              r.notice_window_days, r.grace_days, r.effective_from
         FROM fi_permit_expiration_rule_groups g
         LEFT JOIN fi_permit_expiration_rules r
                ON r.group_id = g.id AND r.effective_to IS NULL
        WHERE g.department_id = $1
        ORDER BY g.name`,
      [dept]
    );
    return { data: rows };
  }));

router.get('/rule-groups/:id/versions',
  loadFiContext, requireInspector,
  validate({ params: idParam }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const { rows } = await pool.query(
      `SELECT id, version, term_value, term_unit, notice_window_days, grace_days,
              effective_from, effective_to, created_at
         FROM fi_permit_expiration_rules
        WHERE group_id = $1 AND department_id = $2
        ORDER BY version DESC`,
      [+req.params.id, dept]
    );
    return { data: rows };
  }));

router.post('/rule-groups',
  loadFiContext, requirePreventionAdmin,
  validate({ body: createGroupSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const b = req.body;
    let group;
    try {
      ({ rows: [group] } = await pool.query(
        `INSERT INTO fi_permit_expiration_rule_groups (department_id, name)
         VALUES ($1,$2) RETURNING id, name`,
        [dept, b.name]
      ));
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'A rule group with that name already exists.', 'DUPLICATE_NAME');
      throw e;
    }
    const { rows: [version] } = await pool.query(
      `INSERT INTO fi_permit_expiration_rules
         (department_id, group_id, version, term_value, term_unit,
          notice_window_days, grace_days, effective_from, created_by_user_id)
       VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8)
       RETURNING id, version, effective_from`,
      [dept, group.id, b.term_value, b.term_unit, b.notice_window_days, b.grace_days,
       b.effective_from, req.user.id ?? null]
    );
    await audit(dept, req.user, 'create', 'fi_permit_expiration_rule_groups', group.id,
      { action: 'create_group', name: b.name, version: 1 });
    return { data: { ...group, current: version } };
  }));

router.post('/rule-groups/:id/versions',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: addVersionSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const groupId = +req.params.id;
    const b = req.body;

    const { rows: [open] } = await pool.query(
      `SELECT id, version, effective_from FROM fi_permit_expiration_rules
        WHERE group_id = $1 AND department_id = $2 AND effective_to IS NULL`,
      [groupId, dept]
    );
    if (!open) throw httpError(404, 'No open version for that rule group.', 'NOT_FOUND');
    if (!(b.effective_from > open.effective_from.toISOString().slice(0, 10))) {
      throw httpError(422,
        'A new version must take effect AFTER the one it replaces — otherwise "which rule '
        + 'applied on this date" has two answers.', 'EFFECTIVE_FROM_NOT_AFTER');
    }

    // ONE statement, on purpose. The INSERT selects FROM the closing UPDATE, and that data
    // dependency forces the UPDATE to complete first — so the partial unique index
    // (one open version per group) never sees two open rows, with no window between two
    // statements. Splitting this in two would, under P5_TXN=off (local dev), leave a moment
    // where the group has NO open version if the insert then failed.
    let created;
    try {
      ({ rows: [created] } = await pool.query(
        `WITH closed AS (
           UPDATE fi_permit_expiration_rules
              SET effective_to = ($3::date - INTERVAL '1 day')::date
            WHERE id = $1 AND department_id = $2 AND effective_to IS NULL
            RETURNING group_id, version
         )
         INSERT INTO fi_permit_expiration_rules
           (department_id, group_id, version, term_value, term_unit,
            notice_window_days, grace_days, effective_from, created_by_user_id)
         SELECT $2, closed.group_id, closed.version + 1, $4, $5, $6, $7, $3::date, $8
           FROM closed
         RETURNING id, version, effective_from, effective_to`,
        [open.id, dept, b.effective_from, b.term_value, b.term_unit,
         b.notice_window_days, b.grace_days, req.user.id ?? null]
      ));
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'That rule group already has an open version.', 'ALREADY_OPEN');
      throw e;
    }
    if (!created) throw httpError(409, 'The open version changed while you were editing.', 'CONFLICT');

    await audit(dept, req.user, 'update', 'fi_permit_expiration_rule_groups', groupId,
      { action: 'add_version', version: created.version, effective_from: b.effective_from,
        closed_version: open.version });
    return { data: created };
  }));

/* ── Permit types ───────────────────────────────────────────────────────────────────── */

router.get('/',
  loadFiContext, requireInspector,
  validate({ query: z.object({ includeRetired: z.enum(['1', 'true']).optional() }).strict() }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const includeRetired = req.query.includeRetired === '1' || req.query.includeRetired === 'true';
    const { rows } = await pool.query(
      `SELECT t.id, t.code, t.name, t.ifc_section, t.expiration_rule_group_id,
              t.fee_schedule_id, t.requires_inspection, t.allow_renewal, t.portal_visibility,
              t.autonumber_prefix, t.status, t.valid_from, t.valid_to, t.version,
              t.superseded_by_type_id,
              g.name AS rule_group_name,
              r.term_value, r.term_unit, r.notice_window_days, r.grace_days
         FROM fi_permit_types t
         LEFT JOIN fi_permit_expiration_rule_groups g ON g.id = t.expiration_rule_group_id
         LEFT JOIN fi_permit_expiration_rules r
                ON r.group_id = t.expiration_rule_group_id AND r.effective_to IS NULL
        WHERE t.department_id = $1
          AND ($2::boolean OR t.status <> 'Retired')
        ORDER BY t.status, t.code`,
      [dept, includeRetired]
    );
    return { data: rows };
  }));

router.post('/',
  loadFiContext, requirePreventionAdmin,
  validate({ body: createTypeSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const b = req.body;
    if (b.expiration_rule_group_id) await assertGroupInDept(b.expiration_rule_group_id, dept);
    let row;
    try {
      ({ rows: [row] } = await pool.query(
        `INSERT INTO fi_permit_types
           (department_id, code, name, ifc_section, expiration_rule_group_id,
            requires_inspection, allow_renewal, portal_visibility, autonumber_prefix,
            status, valid_from)
         VALUES ($1,$2,$3,$4,$5,
                 COALESCE($6,FALSE), COALESCE($7,TRUE), COALESCE($8,'staff_only'), $9,
                 COALESCE($10,'Draft'), CURRENT_DATE)
         RETURNING *`,
        [dept, b.code, b.name, b.ifc_section ?? null, b.expiration_rule_group_id ?? null,
         b.requires_inspection ?? null, b.allow_renewal ?? null, b.portal_visibility ?? null,
         b.autonumber_prefix ?? null, b.status ?? null]
      ));
    } catch (e) {
      if (e.code === '23505') throw httpError(409,
        `A live permit type with code "${b.code}" already exists. Retire it first, or clone it to make a new version.`,
        'DUPLICATE_CODE');
      throw e;
    }
    await audit(dept, req.user, 'create', 'fi_permit_types', row.id,
      { action: 'create_type', code: row.code, name: row.name });
    return { data: row };
  }));

router.patch('/:id',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: patchTypeSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const before = await getType(id, dept);
    if (!before) throw httpError(404, 'Permit type not found', 'NOT_FOUND');
    if (before.status === 'Retired') {
      throw httpError(409,
        'This permit type is retired. Retired types are kept so permits issued under them '
        + 'still resolve; clone it if you need a live version.', 'TYPE_RETIRED');
    }
    if (req.body.expiration_rule_group_id) {
      await assertGroupInDept(req.body.expiration_rule_group_id, dept);
    }

    const allowed = ['name', 'ifc_section', 'expiration_rule_group_id', 'requires_inspection',
                     'allow_renewal', 'portal_visibility', 'autonumber_prefix', 'status'];
    const keys = Object.keys(req.body).filter((k) => allowed.includes(k));
    if (!keys.length) throw httpError(400, 'Nothing to update', 'NO_FIELDS');
    const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
    const { rows: [row] } = await pool.query(
      `UPDATE fi_permit_types SET ${sets}, updated_at = NOW()
        WHERE id = $1 AND department_id = $2 RETURNING *`,
      [id, dept, ...keys.map((k) => req.body[k])]
    );
    await audit(dept, req.user, 'update', 'fi_permit_types', id,
      { action: 'update_type', code: before.code, fields: keys });
    return { data: row };
  }));

router.post('/:id/retire',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: z.object({}).strict().optional() }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    // Guarded: only a non-retired type retires, so a double-click cannot rewrite valid_to.
    const { rows: [row] } = await pool.query(
      `UPDATE fi_permit_types
          SET status = 'Retired', valid_to = CURRENT_DATE, updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND status <> 'Retired'
        RETURNING *`,
      [id, dept]
    );
    if (!row) {
      const exists = await getType(id, dept);
      throw exists
        ? httpError(409, 'That permit type is already retired.', 'ALREADY_RETIRED')
        : httpError(404, 'Permit type not found', 'NOT_FOUND');
    }
    await audit(dept, req.user, 'update', 'fi_permit_types', id,
      { action: 'retire_type', code: row.code });
    return { data: row };
  }));

/**
 * Clone-and-retire: the market's documented mechanic for versioning a TYPE (as opposed to
 * the rule group's effective-dated versions). The successor carries the same code — which is
 * exactly why the unique index is partial on `status <> 'Retired'`.
 */
router.post('/:id/clone',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: patchTypeSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const before = await getType(id, dept);
    if (!before) throw httpError(404, 'Permit type not found', 'NOT_FOUND');
    if (before.status === 'Retired') throw httpError(409, 'That permit type is already retired.', 'ALREADY_RETIRED');
    if (req.body.expiration_rule_group_id) {
      await assertGroupInDept(req.body.expiration_rule_group_id, dept);
    }

    // Retire the predecessor FIRST: the partial unique index refuses two live rows sharing a
    // code, so the order is forced by the schema rather than by convention.
    const { rows: [retired] } = await pool.query(
      `UPDATE fi_permit_types SET status='Retired', valid_to=CURRENT_DATE, updated_at=NOW()
        WHERE id=$1 AND department_id=$2 AND status <> 'Retired' RETURNING id, version`,
      [id, dept]
    );
    if (!retired) throw httpError(409, 'That permit type was retired by someone else a moment ago.', 'ALREADY_RETIRED');

    const merged = (k, fallback) => (req.body[k] !== undefined ? req.body[k] : fallback);
    const { rows: [row] } = await pool.query(
      `INSERT INTO fi_permit_types
         (department_id, code, name, ifc_section, expiration_rule_group_id, fee_schedule_id,
          requires_inspection, allow_renewal, portal_visibility, autonumber_prefix,
          status, valid_from, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Active',CURRENT_DATE,$11)
       RETURNING *`,
      [dept, before.code, merged('name', before.name), merged('ifc_section', before.ifc_section),
       merged('expiration_rule_group_id', before.expiration_rule_group_id), before.fee_schedule_id,
       merged('requires_inspection', before.requires_inspection),
       merged('allow_renewal', before.allow_renewal),
       merged('portal_visibility', before.portal_visibility),
       merged('autonumber_prefix', before.autonumber_prefix),
       (before.version || 1) + 1]
    );
    await pool.query(
      `UPDATE fi_permit_types SET superseded_by_type_id = $1, updated_at = NOW()
        WHERE id = $2 AND department_id = $3`,
      [row.id, id, dept]
    );
    await audit(dept, req.user, 'create', 'fi_permit_types', row.id,
      { action: 'clone_type', code: row.code, from_type_id: id, version: row.version });
    return { data: row };
  }));

/* ── helpers ────────────────────────────────────────────────────────────────────────── */

async function getType(id, dept) {
  const { rows: [row] } = await pool.query(
    'SELECT * FROM fi_permit_types WHERE id = $1 AND department_id = $2', [id, dept]);
  return row || null;
}

/**
 * A rule group id arriving in a body is caller-supplied. RLS already scopes the read, but an
 * explicit refusal gives the operator an honest 422 instead of a foreign-key 500 — and makes
 * the cross-tenant intent visible in the tests.
 */
async function assertGroupInDept(groupId, dept) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM fi_permit_expiration_rule_groups WHERE id = $1 AND department_id = $2',
    [groupId, dept]);
  if (!rowCount) throw httpError(422, 'That expiration rule group does not belong to your department.', 'BAD_RULE_GROUP');
}

module.exports = router;
