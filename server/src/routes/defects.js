'use strict';
/**
 * routes/defects.js — flagged apparatus problems (Phase 2.2, migration 0083).
 * Spec: docs/PHASE2-WORKORDERS-SPEC-2026-07-26.md §5.
 *
 * The defect is FIRST-CLASS and separate from the work order (the market pattern):
 * a failed check item mints one — or ATTACHES to the live one for the same rig+item
 * (dedupe-on-reflag, enforced by uq_defects_live_check_item). A defect resolves ONLY
 * via a resolved work order or an explicit reasoned manual close. Crew (any member,
 * incl. unit sessions) CREATE defects; closing them is mechanic/chief work.
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireMechanic } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { PRIORITIES, DEFECT_STATUSES } = require('../constants/workOrderVocab');

const idParam = z.object({ id: z.string().regex(/^\d+$/) });

router.get('/',
  validate({
    query: z.object({
      status: z.enum(DEFECT_STATUSES).optional(),
      apparatus_id: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
    }).partial(),
  }),
  scoped(async ({ req, stationId }) => {
    const conds = ['d.department_id = $1'];
    const vals = [stationId];
    if (req.query.status) { vals.push(req.query.status); conds.push(`d.status = $${vals.length}`); }
    if (req.query.apparatus_id) { vals.push(req.query.apparatus_id); conds.push(`d.apparatus_id = $${vals.length}`); }
    const limit = Math.min(Number(req.query.limit || 200), 500);
    vals.push(limit);
    const { rows } = await pool.query(
      `SELECT d.*, a.designation AS apparatus_designation,
              w.id AS live_work_order_id, w.status AS live_work_order_status
         FROM defects d
         JOIN apparatus a ON a.id = d.apparatus_id
         LEFT JOIN work_orders w
           ON w.defect_id = d.id AND w.status IN ('open','in_progress','awaiting_parts')
        WHERE ${conds.join(' AND ')}
        ORDER BY CASE d.status WHEN 'open' THEN 0 WHEN 'in_work' THEN 1 ELSE 2 END,
                 CASE d.priority WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
                 d.created_at DESC
        LIMIT $${vals.length}`, vals);
    return { data: rows };
  }));

// Any member (incl. a rig terminal) can flag a problem — one tap from a failed
// check item (source 'check' + item_key) or manual. Check-sourced posts hit the
// dedupe index and RETURN the existing live defect (deduped: true) — never a copy.
const defectCreateBody = z.object({
  apparatus_id: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(2000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  check_id: z.number().int().positive().optional(),
  item_key: z.string().trim().min(1).max(80).optional(),
}).strict();

/**
 * THE defect-create engine — the ONE door (2.6). The online route below and the
 * fi-sync `defect.create` applier both call THIS function. `body` must already
 * be defectCreateBody-validated. Returns { row, created } — dedupe-on-reflag
 * hands back the existing live defect instead of a copy.
 */
async function createDefect({ stationId, user, body }) {
    const b = body;
    const app = await pool.query(
      'SELECT id FROM apparatus WHERE id = $1 AND department_id = $2', [b.apparatus_id, stationId]);
    if (!app.rows.length) throw httpError(422, 'Apparatus not found in your department.', 'BAD_APPARATUS');
    if (b.check_id) {
      const chk = await pool.query(
        'SELECT id FROM apparatus_checks WHERE id = $1 AND department_id = $2', [b.check_id, stationId]);
      if (!chk.rows.length) throw httpError(422, 'Check not found in your department.', 'BAD_CHECK');
    }
    const source = b.item_key ? 'check' : 'manual';
    if (source === 'check') {
      const live = await pool.query(
        `SELECT * FROM defects
          WHERE department_id = $1 AND apparatus_id = $2 AND item_key = $3
            AND status IN ('open','in_work') AND source = 'check'`,
        [stationId, b.apparatus_id, b.item_key]);
      if (live.rows.length) {
        // Dedupe-on-reflag: the problem is already on the books — attach, don't copy.
        return { row: { ...live.rows[0], deduped: true }, created: false };
      }
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO defects
           (department_id, station_id, apparatus_id, source, check_id, item_key,
            title, detail, priority, reported_by_user_id, reported_by_name)
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [stationId, b.apparatus_id, source, b.check_id || null, b.item_key || '',
         b.title, b.detail || '', b.priority || 'routine',
         user.id, user.name || user.username || '']);
      await audit(stationId, user, 'create', 'defects', rows[0].id,
        { apparatus_id: b.apparatus_id, source, item_key: b.item_key || null, priority: rows[0].priority });
      return { row: rows[0], created: true };
    } catch (e) {
      if (e.code === '23505') {
        // Concurrent reflag raced us — return the winner (dedupe holds under a race).
        const live = await pool.query(
          `SELECT * FROM defects
            WHERE department_id = $1 AND apparatus_id = $2 AND item_key = $3
              AND status IN ('open','in_work') AND source = 'check'`,
          [stationId, b.apparatus_id, b.item_key]);
        if (live.rows.length) return { row: { ...live.rows[0], deduped: true }, created: false };
      }
      throw e;
    }
}

router.post('/',
  validate({ body: defectCreateBody }),
  scoped(async ({ req, stationId, user }) => {
    const { row, created } = await createDefect({ stationId, user, body: req.body });
    return created ? { data: row, _status: 201 } : { data: row };
  }));

// Manual close (no work order): mechanic/chief, reason REQUIRED — a defect never
// just disappears. The work-order path closes defects via the WO resolve door.
router.post('/:id/close', requireMechanic,
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(1000) }).strict() }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE defects
          SET status = 'resolved', resolution_kind = 'manual', resolution_note = $3,
              resolved_at = NOW(), resolved_by_user_id = $4, updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND status IN ('open','in_work')
        RETURNING *`,
      [req.params.id, stationId, req.body.reason, user.id]);
    if (!rows.length) throw httpError(404, 'Defect not found or already closed.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'defects', rows[0].id,
      { action: 'manual_close', reason: req.body.reason });
    return { data: rows[0] };
  }));

module.exports = router;
module.exports.defectCreateBody = defectCreateBody;
module.exports.createDefect = createDefect;
