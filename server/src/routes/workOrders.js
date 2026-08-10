'use strict';
/**
 * routes/workOrders.js — work orders + parts + notes + PM schedules (Phase 2.2, 0083).
 * Spec: docs/PHASE2-WORKORDERS-SPEC-2026-07-26.md §5.
 *
 *   GET  /                      queue (status / apparatus / mine filters)
 *   GET  /:id                   with parts + notes + status history (from audit_log)
 *   POST /                      create (officer+ OR mechanic; from defect/pm/bare)
 *   PATCH /:id                  meta only — NEVER status; 409 on terminal
 *   POST /:id/status            THE one transition door (mechanic/chief)
 *   POST|DELETE /:id/parts[/:partId]   line items (mechanic/chief; non-terminal only)
 *   GET|POST /:id/notes         the crew↔mechanic thread (ANY member; append-only)
 *   DELETE /:id                 chief SOFT delete, reason required, audited
 *   GET  /pm | POST /pm | PATCH /pm/:id | DELETE /pm/:id   PM schedules (mechanic/chief)
 *   GET  /pm/due                whichever-first due list, computed on view — a HUMAN
 *                               opens a WO from a due row; nothing auto-generates.
 *
 * Doctrine: closed status enum, RESOLVED/CANCELLED TERMINAL (corrections = a NEW WO via
 * supersedes_id — 409 RECORD_FINALIZED otherwise); priority display-only; resolve requires
 * a resolution note and closes the linked defect / stamps the linked PM schedule.
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireOfficer, requireChief, requireMechanic, isMechanic } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { isIsoDay } = require('../utils/localDate');
const {
  WO_STATUSES, PRIORITIES, isTerminal, canTransition,
} = require('../constants/workOrderVocab');

const idParam = z.object({ id: z.string().regex(/^\d+$/) });

async function fetchWo(stationId, id) {
  const { rows } = await pool.query(
    `SELECT w.*, a.designation AS apparatus_designation, d.title AS defect_title,
            p.task AS pm_task
       FROM work_orders w
       LEFT JOIN apparatus a ON a.id = w.apparatus_id
       LEFT JOIN defects d ON d.id = w.defect_id
       LEFT JOIN pm_schedules p ON p.id = w.pm_schedule_id
      WHERE w.id = $1 AND w.department_id = $2 AND w.deleted_at IS NULL`,
    [id, stationId]);
  return rows[0] || null;
}

/** Total cost = Σ parts + labor×rate + vendor + legacy (NUMERIC in, string out from pg). */
function totalCost(wo, parts) {
  const n = (v) => (v === null || v === undefined ? 0 : Number(v) || 0);
  const partsSum = (parts || []).reduce((s, p) => s + n(p.qty) * n(p.unit_cost), 0);
  const labor = n(wo.labor_hours) * n(wo.labor_rate);
  return Math.round((partsSum + labor + n(wo.vendor_cost) + n(wo.legacy_cost)) * 100) / 100;
}

// ── PM schedules (mounted BEFORE /:id so 'pm' never matches the id param) ────

const pmBase = z.object({
  apparatus_id: z.number().int().positive(),
  task: z.string().trim().min(1).max(200),
  interval_days: z.number().int().min(1).max(3650).nullable().optional(),
  interval_miles: z.number().int().min(1).max(1000000).nullable().optional(),
  interval_hours: z.number().min(0.5).max(100000).nullable().optional(),
  last_done_date: z.string().optional(),
  last_done_mileage: z.number().int().min(0).nullable().optional(),
  last_done_engine_hours: z.number().min(0).nullable().optional(),
  active: z.boolean().optional(),
}).strict();

function pmHasTrigger(b, existing = {}) {
  const days = b.interval_days !== undefined ? b.interval_days : existing.interval_days;
  const miles = b.interval_miles !== undefined ? b.interval_miles : existing.interval_miles;
  const hours = b.interval_hours !== undefined ? b.interval_hours : existing.interval_hours;
  return days != null || miles != null || hours != null;
}

router.get('/pm', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT p.*, a.designation AS apparatus_designation, a.mileage AS apparatus_mileage
       FROM pm_schedules p JOIN apparatus a ON a.id = p.apparatus_id
      WHERE p.department_id = $1 AND p.deleted_at IS NULL
      ORDER BY a.designation, p.task`, [stationId]);
  return { data: rows };
}));

// Whichever-comes-first due derivation, computed on view. ?today= is the client's
// local day (localDate doctrine). An axis with no meter reading is EXCLUDED, never
// fabricated; a schedule with no usable axis reports due_state 'unknown'.
router.get('/pm/due',
  validate({ query: z.object({ today: z.string().optional() }).partial() }),
  scoped(async ({ req, stationId }) => {
    const today = (req.query.today && isIsoDay(req.query.today))
      ? req.query.today : new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `SELECT p.*, a.designation AS apparatus_designation, a.mileage AS apparatus_mileage,
              w.id AS live_work_order_id
         FROM pm_schedules p
         JOIN apparatus a ON a.id = p.apparatus_id
         LEFT JOIN work_orders w
           ON w.pm_schedule_id = p.id AND w.status IN ('open','in_progress','awaiting_parts')
        WHERE p.department_id = $1 AND p.deleted_at IS NULL AND p.active = TRUE
        ORDER BY a.designation, p.task`, [stationId]);
    const data = rows.map((p) => {
      const axes = [];
      if (p.interval_days != null && p.last_done_date) {
        const last = (p.last_done_date instanceof Date)
          ? p.last_done_date.toISOString().slice(0, 10) : String(p.last_done_date).slice(0, 10);
        const due = new Date(`${last}T12:00:00Z`);
        due.setUTCDate(due.getUTCDate() + p.interval_days);
        const dueDay = due.toISOString().slice(0, 10);
        axes.push({ axis: 'days', due_at: dueDay, overdue: today > dueDay, due: today >= dueDay });
      } else if (p.interval_days != null && !p.last_done_date) {
        axes.push({ axis: 'days', due_at: null, overdue: false, due: true }); // never done ⇒ due
      }
      if (p.interval_miles != null && p.last_done_mileage != null && p.apparatus_mileage != null) {
        const dueAt = Number(p.last_done_mileage) + Number(p.interval_miles);
        axes.push({ axis: 'miles', due_at: dueAt, overdue: Number(p.apparatus_mileage) > dueAt,
          due: Number(p.apparatus_mileage) >= dueAt });
      }
      if (p.interval_hours != null && p.last_done_engine_hours != null) {
        // apparatus has no engine-hours meter column today — the hours axis compares
        // only when a reading is supplied at resolve; absent a current reading it is
        // EXCLUDED (surfaced via axes, never guessed).
        axes.push({ axis: 'hours', due_at: Number(p.last_done_engine_hours) + Number(p.interval_hours),
          overdue: false, due: false, no_current_reading: true });
      }
      const comparable = axes.filter((x) => !x.no_current_reading);
      let due_state = 'unknown';
      if (comparable.length) {
        due_state = comparable.some((x) => x.overdue) ? 'overdue'
          : comparable.some((x) => x.due) ? 'due' : 'ok';
      }
      return { ...p, axes, due_state };
    });
    return { data };
  }));

router.post('/pm', requireMechanic, validate({ body: pmBase }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    if (!pmHasTrigger(b)) throw httpError(422, 'At least one trigger (days, miles, or hours) is required.', 'NO_TRIGGER');
    if (b.last_done_date && !isIsoDay(b.last_done_date)) throw httpError(422, 'last_done_date must be YYYY-MM-DD.', 'BAD_DATE');
    const app = await pool.query('SELECT id FROM apparatus WHERE id = $1 AND department_id = $2', [b.apparatus_id, stationId]);
    if (!app.rows.length) throw httpError(422, 'Apparatus not found in your department.', 'BAD_APPARATUS');
    const { rows } = await pool.query(
      `INSERT INTO pm_schedules
         (department_id, station_id, apparatus_id, task, interval_days, interval_miles,
          interval_hours, last_done_date, last_done_mileage, last_done_engine_hours, created_by_user_id)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [stationId, b.apparatus_id, b.task, b.interval_days ?? null, b.interval_miles ?? null,
       b.interval_hours ?? null, b.last_done_date || null, b.last_done_mileage ?? null,
       b.last_done_engine_hours ?? null, user.id]);
    await audit(stationId, user, 'create', 'pm_schedules', rows[0].id, { task: b.task, apparatus_id: b.apparatus_id });
    return { data: rows[0], _status: 201 };
  }));

router.patch('/pm/:id', requireMechanic,
  validate({ params: idParam, body: pmBase.partial() }),
  scoped(async ({ req, stationId, user }) => {
    const cur = await pool.query(
      'SELECT * FROM pm_schedules WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
      [req.params.id, stationId]);
    if (!cur.rows.length) throw httpError(404, 'Schedule not found.', 'NOT_FOUND');
    const b = req.body;
    if (!pmHasTrigger(b, cur.rows[0])) throw httpError(422, 'At least one trigger must remain.', 'NO_TRIGGER');
    if (b.last_done_date && !isIsoDay(b.last_done_date)) throw httpError(422, 'last_done_date must be YYYY-MM-DD.', 'BAD_DATE');
    if (b.apparatus_id) {
      const app = await pool.query('SELECT id FROM apparatus WHERE id = $1 AND department_id = $2', [b.apparatus_id, stationId]);
      if (!app.rows.length) throw httpError(422, 'Apparatus not found in your department.', 'BAD_APPARATUS');
    }
    const cols = ['apparatus_id', 'task', 'interval_days', 'interval_miles', 'interval_hours',
      'last_done_date', 'last_done_mileage', 'last_done_engine_hours', 'active'];
    const sets = []; const vals = [];
    for (const k of cols) {
      if (b[k] === undefined) continue;
      vals.push(b[k]); sets.push(`${k} = $${vals.length}`);
    }
    if (!sets.length) throw httpError(400, 'No valid fields', 'NO_FIELDS');
    vals.push(req.params.id, stationId);
    const { rows } = await pool.query(
      `UPDATE pm_schedules SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${vals.length - 1} AND department_id = $${vals.length} RETURNING *`, vals);
    await audit(stationId, user, 'update', 'pm_schedules', rows[0].id, { fields: sets.length });
    return { data: rows[0] };
  }));

router.delete('/pm/:id', requireMechanic, validate({ params: idParam }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE pm_schedules SET deleted_at = NOW(), active = FALSE, updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL RETURNING id, task`,
      [req.params.id, stationId]);
    if (!rows.length) throw httpError(404, 'Schedule not found.', 'NOT_FOUND');
    await audit(stationId, user, 'soft_delete', 'pm_schedules', rows[0].id, { task: rows[0].task });
    return { data: { id: rows[0].id, deleted: true } };
  }));

// ── Work orders ──────────────────────────────────────────────────────────────

router.get('/',
  validate({
    query: z.object({
      status: z.enum(WO_STATUSES).optional(),
      apparatus_id: z.string().regex(/^\d+$/).optional(),
      mine: z.enum(['1']).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
    }).partial(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const conds = ['w.department_id = $1', 'w.deleted_at IS NULL'];
    const vals = [stationId];
    if (req.query.status) { vals.push(req.query.status); conds.push(`w.status = $${vals.length}`); }
    if (req.query.apparatus_id) { vals.push(req.query.apparatus_id); conds.push(`w.apparatus_id = $${vals.length}`); }
    if (req.query.mine === '1') { vals.push(user.id); conds.push(`w.assigned_to_user_id = $${vals.length}`); }
    const limit = Math.min(Number(req.query.limit || 200), 500);
    vals.push(limit);
    const { rows } = await pool.query(
      `SELECT w.*, a.designation AS apparatus_designation,
              (SELECT COUNT(*)::int FROM work_order_notes n WHERE n.work_order_id = w.id) AS note_count
         FROM work_orders w
         LEFT JOIN apparatus a ON a.id = w.apparatus_id
        WHERE ${conds.join(' AND ')}
        ORDER BY CASE w.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'awaiting_parts' THEN 2 ELSE 3 END,
                 CASE w.priority WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
                 w.created_at DESC
        LIMIT $${vals.length}`, vals);
    return { data: rows };
  }));

router.get('/:id', validate({ params: idParam }),
  scoped(async ({ req, stationId }) => {
    const wo = await fetchWo(stationId, req.params.id);
    if (!wo) throw httpError(404, 'Work order not found.', 'NOT_FOUND');
    const [parts, notes, history] = await Promise.all([
      pool.query('SELECT * FROM work_order_parts WHERE work_order_id = $1 ORDER BY id', [wo.id]),
      pool.query('SELECT * FROM work_order_notes WHERE work_order_id = $1 ORDER BY id', [wo.id]),
      pool.query(
        `SELECT action, user_name, detail, at AS created_at FROM audit_log
          WHERE department_id = $1 AND table_name = 'work_orders' AND record_id = $2
          ORDER BY id`, [stationId, wo.id]),
    ]);
    return {
      data: {
        ...wo, parts: parts.rows, notes: notes.rows, history: history.rows,
        total_cost: totalCost(wo, parts.rows),
      },
    };
  }));

const woCreate = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  apparatus_id: z.number().int().positive().optional(),
  asset_label: z.string().trim().max(120).optional(),
  defect_id: z.number().int().positive().optional(),
  pm_schedule_id: z.number().int().positive().optional(),
  assigned_to_user_id: z.number().int().positive().optional(),
  supersedes_id: z.number().int().positive().optional(),
}).strict();

// Create: officers OR mechanics (crew flags DEFECTS; opening the repair ticket is
// maintenance/command work). One live WO per defect — a second attempt returns the
// existing one (deduped), the documented market behavior.
router.post('/', validate({ body: woCreate }),
  scoped(async ({ req, res, stationId, user }) => {
    const { roleLevel } = require('../middleware/requireRole');
    if (roleLevel(user.role) < 2 && user.fleet_maintenance !== true) {
      throw httpError(403, 'Opening a work order requires officer authority or the fleet-maintenance grant.', 'FORBIDDEN_ROLE');
    }
    const b = req.body;
    if (b.apparatus_id) {
      const app = await pool.query('SELECT id FROM apparatus WHERE id = $1 AND department_id = $2', [b.apparatus_id, stationId]);
      if (!app.rows.length) throw httpError(422, 'Apparatus not found in your department.', 'BAD_APPARATUS');
    }
    let defect = null;
    if (b.defect_id) {
      const d = await pool.query(
        `SELECT * FROM defects WHERE id = $1 AND department_id = $2 AND status IN ('open','in_work')`,
        [b.defect_id, stationId]);
      if (!d.rows.length) throw httpError(422, 'Defect not found or already closed.', 'BAD_DEFECT');
      defect = d.rows[0];
      const live = await pool.query(
        `SELECT id FROM work_orders WHERE defect_id = $1 AND status IN ('open','in_progress','awaiting_parts')`,
        [defect.id]);
      if (live.rows.length) {
        const existing = await fetchWo(stationId, live.rows[0].id);
        return { data: { ...existing, deduped: true } };
      }
    }
    if (b.pm_schedule_id) {
      const p = await pool.query(
        'SELECT id FROM pm_schedules WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
        [b.pm_schedule_id, stationId]);
      if (!p.rows.length) throw httpError(422, 'PM schedule not found.', 'BAD_PM');
    }
    // Target check AFTER defect resolution — a defect-sourced WO inherits its rig.
    if (!b.apparatus_id && !defect && !(b.asset_label && b.asset_label.trim())) {
      throw httpError(422, 'A work order needs an apparatus or an asset label.', 'NO_TARGET');
    }
    if (b.supersedes_id) {
      const s = await pool.query(
        'SELECT id FROM work_orders WHERE id = $1 AND department_id = $2', [b.supersedes_id, stationId]);
      if (!s.rows.length) throw httpError(422, 'Superseded work order not found.', 'BAD_SUPERSEDES');
    }
    let assignedName = '';
    if (b.assigned_to_user_id) {
      const u = await pool.query('SELECT name, username FROM users WHERE id = $1', [b.assigned_to_user_id]);
      assignedName = u.rows[0] ? (u.rows[0].name || u.rows[0].username || '') : '';
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO work_orders
           (department_id, station_id, apparatus_id, asset_label, defect_id, pm_schedule_id,
            title, description, priority, assigned_to_user_id, assigned_to_name,
            supersedes_id, opened_by_user_id, opened_by_name)
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [stationId, b.apparatus_id || (defect ? defect.apparatus_id : null),
         b.asset_label || '', b.defect_id || null, b.pm_schedule_id || null,
         b.title, b.description || '', b.priority || (defect ? defect.priority : 'routine'),
         b.assigned_to_user_id || null, assignedName, b.supersedes_id || null,
         user.id, user.name || user.username || '']);
      const wo = rows[0];
      if (defect) {
        await pool.query(
          `UPDATE defects SET status = 'in_work', updated_at = NOW() WHERE id = $1 AND status = 'open'`,
          [defect.id]);
      }
      await audit(stationId, user, 'create', 'work_orders', wo.id, {
        defect_id: b.defect_id || null, pm_schedule_id: b.pm_schedule_id || null,
        priority: wo.priority, supersedes_id: b.supersedes_id || null,
      });
      return { data: wo, _status: 201 };
    } catch (e) {
      if (e.code === '23505' && b.defect_id) {
        // Concurrent create on the same defect — return the winner.
        const live = await pool.query(
          `SELECT id FROM work_orders WHERE defect_id = $1 AND status IN ('open','in_progress','awaiting_parts')`,
          [b.defect_id]);
        if (live.rows.length) {
          const existing = await fetchWo(stationId, live.rows[0].id);
          return { data: { ...existing, deduped: true } };
        }
      }
      throw e;
    }
  }));

// Meta only. Status is NOT here (the one-door rule); a terminal WO is immutable.
router.patch('/:id', requireMechanic,
  validate({
    params: idParam,
    body: z.object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(4000).optional(),
      priority: z.enum(PRIORITIES).optional(),
      assigned_to_user_id: z.number().int().positive().nullable().optional(),
      vendor_name: z.string().trim().max(200).optional(),
      vendor_cost: z.number().min(0).max(9999999).nullable().optional(),
      labor_hours: z.number().min(0).max(9999).nullable().optional(),
      labor_rate: z.number().min(0).max(99999).nullable().optional(),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const wo = await fetchWo(stationId, req.params.id);
    if (!wo) throw httpError(404, 'Work order not found.', 'NOT_FOUND');
    if (isTerminal(wo.status)) {
      throw httpError(409, 'A resolved or cancelled work order is final — open a new one that references it.', 'RECORD_FINALIZED');
    }
    const b = req.body;
    const cols = {
      title: b.title, description: b.description, priority: b.priority,
      vendor_name: b.vendor_name, vendor_cost: b.vendor_cost,
      labor_hours: b.labor_hours, labor_rate: b.labor_rate,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(cols)) {
      if (v === undefined) continue;
      vals.push(v); sets.push(`${k} = $${vals.length}`);
    }
    if (b.assigned_to_user_id !== undefined) {
      let nm = '';
      if (b.assigned_to_user_id) {
        const u = await pool.query('SELECT name, username FROM users WHERE id = $1', [b.assigned_to_user_id]);
        nm = u.rows[0] ? (u.rows[0].name || u.rows[0].username || '') : '';
      }
      vals.push(b.assigned_to_user_id); sets.push(`assigned_to_user_id = $${vals.length}`);
      vals.push(nm); sets.push(`assigned_to_name = $${vals.length}`);
    }
    if (!sets.length) throw httpError(400, 'No valid fields', 'NO_FIELDS');
    vals.push(wo.id, stationId);
    const { rows } = await pool.query(
      `UPDATE work_orders SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${vals.length - 1} AND department_id = $${vals.length} AND deleted_at IS NULL
        RETURNING *`, vals);
    await audit(stationId, user, 'update', 'work_orders', wo.id,
      { fields: Object.keys(b) });
    return { data: rows[0] };
  }));

// THE one transition door. Resolve requires the note; it closes the linked defect
// and stamps the linked PM schedule (from optional meter readings — never guessed).
router.post('/:id/status', requireMechanic,
  validate({
    params: idParam,
    body: z.object({
      status: z.enum(WO_STATUSES),
      resolution_note: z.string().trim().max(2000).optional(),
      mileage: z.number().int().min(0).optional(),
      engine_hours: z.number().min(0).optional(),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const wo = await fetchWo(stationId, req.params.id);
    if (!wo) throw httpError(404, 'Work order not found.', 'NOT_FOUND');
    const to = req.body.status;
    if (isTerminal(wo.status)) {
      throw httpError(409, 'A resolved or cancelled work order is final — open a new one that references it.', 'RECORD_FINALIZED');
    }
    if (!canTransition(wo.status, to)) {
      throw httpError(422, `Cannot move a work order from ${wo.status} to ${to}.`, 'BAD_TRANSITION');
    }
    if (to === 'resolved' && !(req.body.resolution_note && req.body.resolution_note.length >= 3)) {
      throw httpError(422, 'Resolving requires a resolution note — what was done.', 'RESOLUTION_NOTE_REQUIRED');
    }
    const { rows } = await pool.query(
      `UPDATE work_orders
          SET status = $3,
              resolution_note = CASE WHEN $3 = 'resolved' THEN $4 ELSE resolution_note END,
              resolved_at = CASE WHEN $3 IN ('resolved','cancelled') THEN NOW() ELSE resolved_at END,
              resolved_by_user_id = CASE WHEN $3 IN ('resolved','cancelled') THEN $5 ELSE resolved_by_user_id END,
              updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL
          AND status NOT IN ('resolved','cancelled')
        RETURNING *`,
      [wo.id, stationId, to, req.body.resolution_note || '', user.id]);
    if (!rows.length) throw httpError(409, 'The work order changed — reload and retry.', 'CONFLICT');
    const updated = rows[0];
    if (to === 'resolved') {
      if (wo.defect_id) {
        await pool.query(
          `UPDATE defects
              SET status = 'resolved', resolution_kind = 'work_order',
                  resolution_note = $2, resolved_at = NOW(), resolved_by_user_id = $3, updated_at = NOW()
            WHERE id = $1 AND status IN ('open','in_work')`,
          [wo.defect_id, `Resolved by work order #${wo.id}: ${req.body.resolution_note}`, user.id]);
      }
      if (wo.pm_schedule_id) {
        await pool.query(
          `UPDATE pm_schedules
              SET last_done_date = CURRENT_DATE,
                  last_done_mileage = COALESCE($2, last_done_mileage),
                  last_done_engine_hours = COALESCE($3, last_done_engine_hours),
                  updated_at = NOW()
            WHERE id = $1 AND department_id = $4`,
          [wo.pm_schedule_id, req.body.mileage ?? null, req.body.engine_hours ?? null, stationId]);
      }
    }
    await audit(stationId, user, 'update', 'work_orders', wo.id, {
      action: 'status', from: wo.status, to,
      ...(to === 'resolved' ? { resolution_note: req.body.resolution_note } : {}),
    });
    return { data: updated };
  }));

// ── Parts (line items; non-terminal only) ────────────────────────────────────

router.post('/:id/parts', requireMechanic,
  validate({
    params: idParam,
    body: z.object({
      name: z.string().trim().min(1).max(200),
      qty: z.number().min(0.01).max(99999).optional(),
      unit_cost: z.number().min(0).max(999999).optional(),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const wo = await fetchWo(stationId, req.params.id);
    if (!wo) throw httpError(404, 'Work order not found.', 'NOT_FOUND');
    if (isTerminal(wo.status)) throw httpError(409, 'Parts cannot change on a finalized work order.', 'RECORD_FINALIZED');
    const { rows } = await pool.query(
      `INSERT INTO work_order_parts (work_order_id, department_id, name, qty, unit_cost, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [wo.id, stationId, req.body.name, req.body.qty ?? 1, req.body.unit_cost ?? 0, user.id]);
    await audit(stationId, user, 'update', 'work_orders', wo.id,
      { action: 'part_add', name: req.body.name, qty: req.body.qty ?? 1, unit_cost: req.body.unit_cost ?? 0 });
    return { data: rows[0], _status: 201 };
  }));

router.delete('/:id/parts/:partId', requireMechanic,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/), partId: z.string().regex(/^\d+$/) }) }),
  scoped(async ({ req, stationId, user }) => {
    const wo = await fetchWo(stationId, req.params.id);
    if (!wo) throw httpError(404, 'Work order not found.', 'NOT_FOUND');
    if (isTerminal(wo.status)) throw httpError(409, 'Parts cannot change on a finalized work order.', 'RECORD_FINALIZED');
    const { rows } = await pool.query(
      'DELETE FROM work_order_parts WHERE id = $1 AND work_order_id = $2 AND department_id = $3 RETURNING id, name',
      [req.params.partId, wo.id, stationId]);
    if (!rows.length) throw httpError(404, 'Part not found.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'work_orders', wo.id, { action: 'part_remove', name: rows[0].name });
    return { data: { id: rows[0].id, deleted: true } };
  }));

// ── Notes: the crew↔mechanic thread (ANY member; append-only) ────────────────

router.get('/:id/notes', validate({ params: idParam }),
  scoped(async ({ req, stationId }) => {
    const wo = await fetchWo(stationId, req.params.id);
    if (!wo) throw httpError(404, 'Work order not found.', 'NOT_FOUND');
    const { rows } = await pool.query(
      'SELECT * FROM work_order_notes WHERE work_order_id = $1 ORDER BY id', [wo.id]);
    return { data: rows };
  }));

router.post('/:id/notes',
  validate({ params: idParam, body: z.object({ body: z.string().trim().min(1).max(2000) }).strict() }),
  scoped(async ({ req, stationId, user }) => {
    const wo = await fetchWo(stationId, req.params.id);
    if (!wo) throw httpError(404, 'Work order not found.', 'NOT_FOUND');
    const { rows } = await pool.query(
      `INSERT INTO work_order_notes (work_order_id, department_id, author_user_id, author_name, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [wo.id, stationId, user.id, user.name || user.username || '', req.body.body]);
    return { data: rows[0], _status: 201 };
  }));

// ── Soft delete (chief; reason; audited) ─────────────────────────────────────

router.delete('/:id', requireChief,
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(500) }).strict() }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE work_orders SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL RETURNING id, status`,
      [req.params.id, stationId]);
    if (!rows.length) throw httpError(404, 'Work order not found.', 'NOT_FOUND');
    await audit(stationId, user, 'soft_delete', 'work_orders', rows[0].id,
      { reason: req.body.reason, status: rows[0].status });
    return { data: { id: rows[0].id, deleted: true } };
  }));

module.exports = router;
