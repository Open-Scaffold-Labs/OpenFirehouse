'use strict';
/**
 * routes/fiInspectionTypes.js — schedulable inspection types with default
 * frequency (Prevention Core Phase 1, 2026-07-12). The Phase-2 scheduler keys on
 * default_frequency_days: completing a type-N inspection proposes the next one.
 *
 * Gates: reads member+; writes officer+ (designation-gated as of Phase 3 — prevention_admin or chief).
 * Retire-don't-delete: types in use should be PATCHed {active:false}; DELETE
 * soft-deletes (audited).
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requirePreventionAdmin } = require('../middleware/fiAuth');
const { audit } = require('../utils/auditLog');

const idParam = validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) });
const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  default_frequency_days: z.number().int().positive().max(3650).nullable().default(null),
  default_checklist_id:   z.number().int().positive().nullable().default(null),
  active: z.boolean().default(true),
});

const COLS = 'id, name, default_frequency_days, default_checklist_id, active, created_at, updated_at';

router.get('/', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM fi_inspection_types
     WHERE department_id = $1 AND deleted_at IS NULL ORDER BY name`, [stationId]);
  return { data: rows };
}));

router.post('/', loadFiContext, requirePreventionAdmin, validate({ body: bodySchema }), scoped(async ({ req, stationId, user }) => {
  const b = req.body;
  if (b.default_checklist_id != null) {
    const chk = await pool.query(
      'SELECT 1 FROM fi_checklists WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
      [b.default_checklist_id, stationId]);
    if (!chk.rows.length) throw httpError(404, 'Checklist not found', 'CHECKLIST_NOT_FOUND');
  }
  const { rows } = await pool.query(
    `INSERT INTO fi_inspection_types (department_id, name, default_frequency_days, default_checklist_id, active)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (department_id, name) DO NOTHING RETURNING ${COLS}`,
    [stationId, b.name, b.default_frequency_days, b.default_checklist_id, b.active]);
  if (!rows.length) throw httpError(409, `Inspection type '${b.name}' already exists.`, 'DUPLICATE_TYPE');
  await audit(stationId, user, 'create', 'fi_inspection_types', rows[0].id, { name: b.name });
  return { data: rows[0], _status: 201 };
}));

router.patch('/:id', loadFiContext, requirePreventionAdmin, idParam, validate({ body: bodySchema.partial() }), scoped(async ({ req, stationId, user }) => {
  if (req.body.default_checklist_id != null) {
    const chk = await pool.query(
      'SELECT 1 FROM fi_checklists WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
      [req.body.default_checklist_id, stationId]);
    if (!chk.rows.length) throw httpError(404, 'Checklist not found', 'CHECKLIST_NOT_FOUND');
  }
  const allowed = ['name','default_frequency_days','default_checklist_id','active'];
  const sets = []; const vals = [];
  for (const k of allowed) if (req.body[k] !== undefined) { vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`); }
  if (!sets.length) throw httpError(400, 'No editable fields in request.', 'EMPTY_PATCH');
  vals.push(req.params.id, stationId);
  const { rows } = await pool.query(
    `UPDATE fi_inspection_types SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${vals.length - 1} AND department_id = $${vals.length} AND deleted_at IS NULL
     RETURNING ${COLS}`, vals);
  if (!rows.length) throw httpError(404, 'Not found', 'NOT_FOUND');
  await audit(stationId, user, 'update', 'fi_inspection_types', rows[0].id, { fields: Object.keys(req.body) });
  return { data: rows[0] };
}));

router.delete('/:id', loadFiContext, requirePreventionAdmin, idParam, scoped(async ({ req, stationId, user }) => {
  const { rows } = await pool.query(
    `UPDATE fi_inspection_types SET deleted_at = NOW()
     WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL RETURNING id`,
    [req.params.id, stationId]);
  if (!rows.length) throw httpError(404, 'Not found', 'NOT_FOUND');
  await audit(stationId, user, 'soft_delete', 'fi_inspection_types', rows[0].id, {});
  return { message: 'Inspection type retired.' };
}));

// Starter set mirrors the list clients have used since the module shipped;
// Annual gets the 365-day default. Explicit, idempotent, officer-invoked.
const STARTER = [
  ['Annual Inspection', 365], ['Follow-Up Inspection', null], ['Complaint Investigation', null],
  ['New Construction', null], ['Change of Occupancy', null], ['Special Event', null],
  ['Reinspection', null], ['Courtesy / Educational', null],
];

router.post('/seed-starter', loadFiContext, requirePreventionAdmin, scoped(async ({ stationId, user }) => {
  const { rows } = await pool.query(
    `INSERT INTO fi_inspection_types (department_id, name, default_frequency_days)
     SELECT $1, s->>0, NULLIF(s->>1, '')::int
     FROM jsonb_array_elements($2::jsonb) AS s
     ON CONFLICT (department_id, name) DO NOTHING RETURNING id`,
    [stationId, JSON.stringify(STARTER.map(([n, d]) => [n, d == null ? '' : String(d)]))]);
  await audit(stationId, user, 'create', 'fi_inspection_types', null, { seedStarter: rows.length });
  return { message: `Starter types loaded: ${rows.length} added.`, added: rows.length };
}));

module.exports = router;
