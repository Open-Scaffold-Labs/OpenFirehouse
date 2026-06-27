const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const CATEGORIES = [
  'general', 'fire_suppression', 'ems', 'hazmat', 'technical_rescue',
  'driver_operator', 'officer_development', 'fire_prevention',
  'physical_fitness', 'safety', 'leadership', 'nims_ics', 'specialty',
];

// GET /
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { year, status, category } = req.query;
    let sql = 'SELECT * FROM training_plans WHERE department_id = $1';
    const params = [stationId];
    if (year)     { params.push(parseInt(year)); sql += ` AND year = $${params.length}`; }
    if (status)   { params.push(status);         sql += ` AND status = $${params.length}`; }
    if (category) { params.push(category);       sql += ` AND category = $${params.length}`; }
    sql += ' ORDER BY priority DESC, title';
    const { rows } = await pool.query(sql, params);
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /api/training-plans error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /categories
router.get('/categories', (_req, res) => {
  res.json({ categories: CATEGORIES });
});

// GET /stats
router.get('/stats', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const year = req.query.year || new Date().getFullYear();
    const { rows: plans } = await pool.query(
      `SELECT * FROM training_plans WHERE department_id = $1 AND year = $2`, [stationId, year]
    );
    const totalTarget = plans.reduce((s, p) => s + parseFloat(p.target_hours || 0), 0);
    const totalCompleted = plans.reduce((s, p) => s + parseFloat(p.completed_hours || 0), 0);
    const completion = totalTarget > 0 ? ((totalCompleted / totalTarget) * 100).toFixed(1) : 0;
    const byStatus = {};
    plans.forEach(p => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });

    res.json({
      totalPlans: plans.length,
      totalTargetHours: totalTarget,
      totalCompletedHours: totalCompleted,
      completionPct: parseFloat(completion),
      byStatus,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { title, year, description, category, target_hours, objectives,
            schedule, assigned_to, status, priority, created_by } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO training_plans (station_id, title, year, description, category, target_hours,
        objectives, schedule, assigned_to, status, priority, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      stationId,
      title || '', year || new Date().getFullYear(), description || '',
      category || 'general', target_hours || 0,
      JSON.stringify(objectives || []), JSON.stringify(schedule || []),
      JSON.stringify(assigned_to || []), status || 'planned',
      priority || 'normal', created_by || '',
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/training-plans error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id
router.patch('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const allowed = ['title', 'description', 'category', 'target_hours', 'completed_hours',
      'objectives', 'schedule', 'assigned_to', 'status', 'priority'];
    const sets = ['updated_at = NOW()'];
    const vals = [stationId];
    let idx = 2;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const val = Array.isArray(req.body[key]) ? JSON.stringify(req.body[key]) : req.body[key];
        sets.push(`"${key}" = $${idx++}`);
        vals.push(val);
      }
    }
    vals.push(parseInt(req.params.id));
    const { rows } = await pool.query(
      `UPDATE training_plans SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $1 RETURNING *`, vals
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM training_plans WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
