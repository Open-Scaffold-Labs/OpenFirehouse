'use strict';
/**
 * routes/fiChecklists.js — per-type inspection checklists whose items are
 * optionally pre-bound to code-library entries (Prevention Core Phase 1).
 * This is the incumbents' indirection layer: the checklist carries the
 * jurisdiction's vocabulary; the inspector never hunts for a code section.
 *
 * Items are replaced wholesale via PUT /:id/items (order = array order) — the
 * same deterministic-mirror pattern as fiViolationSync, one atomic statement.
 * Gates: reads member+; writes officer+ (designation-gated as of Phase 3 — prevention_admin or chief).
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requirePreventionAdmin } = require('../middleware/fiAuth');
const { audit } = require('../utils/auditLog');

const idParam = validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) });
const listSchema = z.object({ name: z.string().trim().min(1).max(200), active: z.boolean().default(true) });
const itemsSchema = z.object({
  items: z.array(z.object({
    prompt:      z.string().trim().min(1).max(1000),
    code_ref_id: z.number().int().positive().nullable().default(null),
    required:    z.boolean().default(false),
  })).max(500),
});

async function getChecklist(id, stationId) {
  const { rows } = await pool.query(
    `SELECT id, name, active, created_at, updated_at FROM fi_checklists
     WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL`, [id, stationId]);
  return rows[0] || null;
}

async function getItems(checklistId, stationId) {
  const { rows } = await pool.query(
    `SELECT i.id, i.prompt, i.code_ref_id, i.required, i.sort_order,
            c.code AS ref_code, c.title AS ref_title
     FROM fi_checklist_items i
     LEFT JOIN fi_code_library c ON c.id = i.code_ref_id AND c.deleted_at IS NULL
     WHERE i.checklist_id = $1 AND i.department_id = $2
     ORDER BY i.sort_order`, [checklistId, stationId]);
  return rows;
}

router.get('/', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT cl.id, cl.name, cl.active, cl.created_at, cl.updated_at,
            count(i.id)::int AS item_count
     FROM fi_checklists cl
     LEFT JOIN fi_checklist_items i ON i.checklist_id = cl.id
     WHERE cl.department_id = $1 AND cl.deleted_at IS NULL
     GROUP BY cl.id ORDER BY cl.name`, [stationId]);
  return { data: rows };
}));

router.get('/:id', idParam, scoped(async ({ req, stationId }) => {
  const cl = await getChecklist(req.params.id, stationId);
  if (!cl) throw httpError(404, 'Not found', 'NOT_FOUND');
  return { data: { ...cl, items: await getItems(cl.id, stationId) } };
}));

router.post('/', loadFiContext, requirePreventionAdmin, validate({ body: listSchema }), scoped(async ({ req, stationId, user }) => {
  const { rows } = await pool.query(
    `INSERT INTO fi_checklists (department_id, name, active) VALUES ($1,$2,$3)
     RETURNING id, name, active, created_at, updated_at`,
    [stationId, req.body.name, req.body.active]);
  await audit(stationId, user, 'create', 'fi_checklists', rows[0].id, { name: req.body.name });
  return { data: { ...rows[0], items: [] }, _status: 201 };
}));

router.patch('/:id', loadFiContext, requirePreventionAdmin, idParam, validate({ body: listSchema.partial() }), scoped(async ({ req, stationId, user }) => {
  const sets = []; const vals = [];
  for (const k of ['name', 'active']) if (req.body[k] !== undefined) { vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`); }
  if (!sets.length) throw httpError(400, 'No editable fields in request.', 'EMPTY_PATCH');
  vals.push(req.params.id, stationId);
  const { rows } = await pool.query(
    `UPDATE fi_checklists SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${vals.length - 1} AND department_id = $${vals.length} AND deleted_at IS NULL
     RETURNING id, name, active, created_at, updated_at`, vals);
  if (!rows.length) throw httpError(404, 'Not found', 'NOT_FOUND');
  await audit(stationId, user, 'update', 'fi_checklists', rows[0].id, { fields: Object.keys(req.body) });
  return { data: rows[0] };
}));

/** Replace the checklist's items wholesale (order = array order). Atomic CTE. */
router.put('/:id/items', loadFiContext, requirePreventionAdmin, idParam, validate({ body: itemsSchema }), scoped(async ({ req, stationId, user }) => {
  const cl = await getChecklist(req.params.id, stationId);
  if (!cl) throw httpError(404, 'Not found', 'NOT_FOUND');
  // Every referenced code must belong to THIS department (never trust client ids).
  const refIds = [...new Set(req.body.items.map((i) => i.code_ref_id).filter((x) => x != null))];
  if (refIds.length) {
    const ok = await pool.query(
      `SELECT count(*)::int AS n FROM fi_code_library
       WHERE id = ANY($1) AND department_id = $2 AND deleted_at IS NULL`, [refIds, stationId]);
    if (ok.rows[0].n !== refIds.length) throw httpError(404, 'One or more code references not found in this department\'s library.', 'CODE_REF_NOT_FOUND');
  }
  const payload = req.body.items.map((i, idx) => ({
    prompt: i.prompt, code_ref_id: i.code_ref_id, required: i.required, sort_order: idx,
  }));
  await pool.query(
    `WITH del AS (DELETE FROM fi_checklist_items WHERE checklist_id = $1 AND department_id = $2)
     INSERT INTO fi_checklist_items (department_id, checklist_id, prompt, code_ref_id, required, sort_order)
     SELECT $2, $1, r->>'prompt', (r->>'code_ref_id')::int,
            COALESCE((r->>'required')::boolean, false), (r->>'sort_order')::int
     FROM jsonb_array_elements($3::jsonb) AS r`,
    [cl.id, stationId, JSON.stringify(payload)]);
  await audit(stationId, user, 'update', 'fi_checklists', cl.id, { itemsReplaced: payload.length });
  return { data: { ...cl, items: await getItems(cl.id, stationId) } };
}));

router.delete('/:id', loadFiContext, requirePreventionAdmin, idParam, scoped(async ({ req, stationId, user }) => {
  const { rows } = await pool.query(
    `UPDATE fi_checklists SET deleted_at = NOW()
     WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL RETURNING id`,
    [req.params.id, stationId]);
  if (!rows.length) throw httpError(404, 'Not found', 'NOT_FOUND');
  await audit(stationId, user, 'soft_delete', 'fi_checklists', rows[0].id, {});
  return { message: 'Checklist retired.' };
}));

module.exports = router;
