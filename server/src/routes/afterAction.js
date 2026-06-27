const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET / — list after-action reports
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { status, year } = req.query;
    let sql = `SELECT * FROM after_action_reports WHERE department_id = $1`;
    const params = [stationId];
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (year) { params.push(parseInt(year)); sql += ` AND EXTRACT(YEAR FROM incident_date) = $${params.length}`; }
    sql += ' ORDER BY conducted_date DESC';
    const { rows } = await pool.query(sql, params);
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /api/after-action error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /stats
router.get('/stats', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows: total } = await pool.query(`SELECT COUNT(*) AS count FROM after_action_reports WHERE department_id = $1`, [stationId]);
    const { rows: draft } = await pool.query(`SELECT COUNT(*) AS count FROM after_action_reports WHERE department_id = $1 AND status = 'draft'`, [stationId]);
    const { rows: openItems } = await pool.query(`
      SELECT COUNT(*) AS count FROM after_action_reports WHERE department_id = $1
        AND action_items::text LIKE '%"status":"open"%'
    `, [stationId]);
    res.json({
      total: parseInt(total[0].count),
      draft: parseInt(draft[0].count),
      openActionItems: parseInt(openItems[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows } = await pool.query('SELECT * FROM after_action_reports WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { incident_id, incident_date, incident_type, location, title, summary,
            strengths, improvements, action_items, lessons_learned, attendees,
            conducted_by, conducted_date, status } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO after_action_reports (station_id, incident_id, incident_date, incident_type, location, title, summary,
        strengths, improvements, action_items, lessons_learned, attendees, conducted_by, conducted_date, status)
      VALUES ($1, $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [
      stationId,
      incident_id || null, incident_date || null, incident_type || '', location || '',
      title || '', summary || '',
      JSON.stringify(strengths || []), JSON.stringify(improvements || []),
      JSON.stringify(action_items || []), lessons_learned || '',
      JSON.stringify(attendees || []), conducted_by || '',
      conducted_date || new Date().toISOString().slice(0, 10), status || 'draft',
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/after-action error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id
router.patch('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const allowed = ['title', 'summary', 'strengths', 'improvements', 'action_items',
      'lessons_learned', 'attendees', 'conducted_by', 'conducted_date', 'status',
      'incident_type', 'location', 'incident_date'];
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
      `UPDATE after_action_reports SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $1 RETURNING *`, vals
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
    await pool.query('DELETE FROM after_action_reports WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
