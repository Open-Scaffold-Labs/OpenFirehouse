const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const OOS_TYPES = [
  'mechanical', 'electrical', 'body_damage', 'accident', 'pump_failure',
  'aerial_failure', 'tire', 'brakes', 'transmission', 'scheduled_maintenance',
  'annual_inspection', 'emission_testing', 'staffing', 'weather', 'other',
];

const IMPACT_LEVELS = ['low', 'moderate', 'high', 'critical'];

// GET / — all OOS records (optionally filter by status)
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const status = req.query.status || '';
    let sql = `
      SELECT oos.*, a.designation AS apparatus_name, a.type AS apparatus_type
      FROM apparatus_oos oos
      LEFT JOIN apparatus a ON a.id = oos.apparatus_id
      WHERE oos.department_id = $1
    `;
    const params = [stationId];
    if (status) {
      params.push(status);
      sql += ` AND oos.status = $${params.length}`;
    }
    sql += ' ORDER BY oos.start_date DESC';
    const { rows } = await pool.query(sql, params);
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /api/apparatus-oos error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /types — return OOS types and impact levels
router.get('/types', (_req, res) => {
  res.json({ oos_types: OOS_TYPES, impact_levels: IMPACT_LEVELS });
});

// GET /active — currently OOS apparatus
router.get('/active', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows } = await pool.query(`
      SELECT oos.*, a.designation AS apparatus_name, a.type AS apparatus_type
      FROM apparatus_oos oos
      LEFT JOIN apparatus a ON a.id = oos.apparatus_id
      WHERE oos.department_id = $1 AND oos.status = 'active'
      ORDER BY oos.impact_level DESC, oos.start_date
    `, [stationId]);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats — OOS statistics
router.get('/stats', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows: active } = await pool.query(
      `SELECT COUNT(*) AS count FROM apparatus_oos WHERE department_id = $1 AND status = 'active'`, [stationId]
    );
    const { rows: critical } = await pool.query(
      `SELECT COUNT(*) AS count FROM apparatus_oos WHERE department_id = $1 AND status = 'active' AND impact_level IN ('high', 'critical')`, [stationId]
    );
    const { rows: total } = await pool.query(
      `SELECT COUNT(*) AS count FROM apparatus_oos WHERE department_id = $1`, [stationId]
    );
    const { rows: avgDays } = await pool.query(`
      SELECT AVG(CASE WHEN end_date IS NOT NULL THEN end_date - start_date ELSE CURRENT_DATE - start_date END) AS avg_days
      FROM apparatus_oos WHERE department_id = $1
    `, [stationId]);
    res.json({
      active: parseInt(active[0].count),
      critical: parseInt(critical[0].count),
      total: parseInt(total[0].count),
      avgDaysOOS: parseFloat(avgDays[0].avg_days || 0).toFixed(1),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create OOS record
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { apparatus_id, reason, oos_type, start_date, estimated_return, impact_level, coverage_plan, reported_by, notes } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO apparatus_oos (station_id, apparatus_id, reason, oos_type, start_date, estimated_return, impact_level, coverage_plan, reported_by, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      stationId,
      apparatus_id, reason || '', oos_type || 'mechanical',
      start_date || new Date().toISOString().slice(0, 10),
      estimated_return || null, impact_level || 'moderate',
      coverage_plan || '', reported_by || '', notes || '',
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/apparatus-oos error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — update OOS record (including resolving)
router.patch('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const allowed = ['reason', 'oos_type', 'end_date', 'estimated_return', 'impact_level', 'coverage_plan', 'reported_by', 'status', 'notes'];
    const sets = ['updated_at = NOW()'];
    const vals = [stationId];
    let idx = 2;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`"${key}" = $${idx++}`);
        vals.push(req.body[key]);
      }
    }
    vals.push(parseInt(req.params.id));
    const { rows } = await pool.query(
      `UPDATE apparatus_oos SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $1 RETURNING *`, vals
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
    await pool.query('DELETE FROM apparatus_oos WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
