const express = require('express');
const router = express.Router();

// 4.3 zod rollout (2026-06-10 late): grievances is a LEGAL table.
const { z } = require('zod');
const validateReq = require('../middleware/validate');
const idParam = z.object({ id: z.string().regex(/^\d+$/, 'numeric id') });
const grievanceCreateSchema = z.looseObject({
  grievance_number: z.string().max(60).optional().nullable(),
  filed_by: z.string().max(120).optional().nullable(),
  filed_date: z.string().max(40).optional().nullable(),
  cba_article: z.string().max(120).optional().nullable(),
  subject: z.string().min(1).max(300),
  description: z.string().max(20000).optional().nullable(),
  grievance_type: z.string().max(60).optional().nullable(),
  union_rep: z.string().max(120).optional().nullable(),
  management_rep: z.string().max(120).optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
});

const { pool } = require('../db');
const { audit } = require('../utils/auditLog');

const GRIEVANCE_TYPES = [
  'contract_violation', 'working_conditions', 'discipline_dispute',
  'pay_dispute', 'scheduling', 'safety', 'harassment', 'discrimination',
  'benefits', 'seniority', 'assignment', 'overtime', 'leave_denial',
  'equipment', 'training', 'promotion', 'other',
];

const STEPS = [
  { id: 'step_1', label: 'Step 1 — Verbal / Informal' },
  { id: 'step_2', label: 'Step 2 — Written Grievance' },
  { id: 'step_3', label: 'Step 3 — Department Head Review' },
  { id: 'step_4', label: 'Step 4 — Arbitration / Mediation' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'withdrawn', label: 'Withdrawn' },
];

// GET / — all grievances (filter by status, type)
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { status, grievance_type } = req.query;
    let sql = `
      SELECT g.*, m.name AS filed_by_name, m.rank AS filed_by_rank
      FROM grievances g
      LEFT JOIN members m ON m.id = g.filed_by
      WHERE g.department_id = $1 AND g.deleted_at IS NULL
    `;
    const params = [stationId];
    if (status) { params.push(status); sql += ` AND g.status = $${params.length}`; }
    if (grievance_type) { params.push(grievance_type); sql += ` AND g.grievance_type = $${params.length}`; }
    sql += ' ORDER BY g.filed_date DESC';
    const { rows } = await pool.query(sql, params);
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /api/grievances error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /types — return grievance types and steps
router.get('/types', (_req, res) => {
  res.json({ types: GRIEVANCE_TYPES, steps: STEPS });
});

// GET /stats — grievance statistics
router.get('/stats', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows: open } = await pool.query(
      `SELECT COUNT(*) AS count FROM grievances WHERE department_id = $1 AND status = 'open' AND deleted_at IS NULL`, [stationId]
    );
    const { rows: total } = await pool.query(
      `SELECT COUNT(*) AS count FROM grievances WHERE department_id = $1 AND deleted_at IS NULL`, [stationId]
    );
    const { rows: byStep } = await pool.query(`
      SELECT current_step, COUNT(*) AS count
      FROM grievances WHERE department_id = $1 AND status = 'open' AND deleted_at IS NULL
      GROUP BY current_step
    `, [stationId]);
    const { rows: byType } = await pool.query(`
      SELECT grievance_type, COUNT(*) AS count
      FROM grievances WHERE department_id = $1 AND deleted_at IS NULL
      GROUP BY grievance_type ORDER BY count DESC LIMIT 5
    `, [stationId]);
    const { rows: avgResolution } = await pool.query(`
      SELECT AVG(resolved_date - filed_date) AS avg_days
      FROM grievances WHERE department_id = $1 AND status = 'resolved' AND resolved_date IS NOT NULL AND deleted_at IS NULL
    `, [stationId]);
    res.json({
      open: parseInt(open[0].count),
      total: parseInt(total[0].count),
      byStep,
      topTypes: byType,
      avgResolutionDays: parseFloat(avgResolution[0]?.avg_days || 0).toFixed(1),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — single grievance with timeline
router.get('/:id', validateReq({ params: idParam }), async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows } = await pool.query(`
      SELECT g.*, m.name AS filed_by_name, m.rank AS filed_by_rank
      FROM grievances g
      LEFT JOIN members m ON m.id = g.filed_by
      WHERE g.id = $1 AND g.department_id = $2 AND g.deleted_at IS NULL
    `, [req.params.id, stationId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — file a new grievance
router.post('/', validateReq({ body: grievanceCreateSchema }), async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const {
      grievance_number, filed_by, filed_date, cba_article, subject,
      description, grievance_type, union_rep, management_rep, notes,
    } = req.body;

    const timeline = [{
      date: filed_date || new Date().toISOString().slice(0, 10),
      step: 'step_1',
      action: 'Grievance filed',
      by: union_rep || '',
      notes: notes || '',
    }];

    const { rows } = await pool.query(`
      INSERT INTO grievances (station_id, grievance_number, filed_by, filed_date, cba_article, subject, description, grievance_type, union_rep, management_rep, notes, timeline)
      VALUES ($12, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      grievance_number || `GR-${Date.now().toString().slice(-6)}`,
      filed_by || null, filed_date || new Date().toISOString().slice(0, 10),
      cba_article || '', subject || '', description || '',
      grievance_type || 'contract_violation',
      union_rep || '', management_rep || '', notes || '',
      JSON.stringify(timeline),
      stationId,
    ]);
    await audit(stationId, req.user, 'create', 'grievances', rows[0].id, { grievance_type: rows[0].grievance_type });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/grievances error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — update grievance (advance step, resolve, etc.)
router.patch('/:id', validateReq({ params: idParam }), async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const allowed = ['subject', 'description', 'cba_article', 'grievance_type', 'current_step', 'status', 'resolution', 'resolved_date', 'assigned_to', 'union_rep', 'management_rep', 'notes'];
    const sets = ['updated_at = NOW()'];
    const vals = [];
    let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`"${key}" = $${idx++}`);
        vals.push(req.body[key]);
      }
    }

    // Add timeline entry if advancing step
    if (req.body.timeline_entry) {
      const { rows: current } = await pool.query('SELECT timeline FROM grievances WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [req.params.id, stationId]);
      const existingTimeline = typeof current[0]?.timeline === 'string' ? JSON.parse(current[0].timeline) : (current[0]?.timeline || []);
      existingTimeline.push({
        date: new Date().toISOString().slice(0, 10),
        ...req.body.timeline_entry,
      });
      sets.push(`timeline = $${idx++}`);
      vals.push(JSON.stringify(existingTimeline));
    }

    vals.push(parseInt(req.params.id));
    vals.push(stationId);
    const { rows } = await pool.query(
      `UPDATE grievances SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $${idx + 1} AND deleted_at IS NULL RETURNING *`, vals
    );
    if (rows[0]) {
      await audit(stationId, req.user, 'update', 'grievances', parseInt(req.params.id), { fields: Object.keys(req.body || {}) });
    }
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — SOFT delete (Phase 2.2): grievances are legal records and are
// never hard-deleted; we stamp deleted_at and every read path filters it out.
router.delete('/:id', validateReq({ params: idParam }), async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('UPDATE grievances SET deleted_at = NOW() WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [req.params.id, stationId]);
    await audit(stationId, req.user, 'soft_delete', 'grievances', parseInt(req.params.id), {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
