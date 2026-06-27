'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');

const POLICY_TYPES = [
  'sog', 'sop', 'policy', 'directive', 'memo', 'safety_bulletin',
  'training_requirement', 'equipment_notice', 'code_of_conduct', 'other'
];

// GET / — list policies
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    let sql = 'SELECT * FROM policy_acknowledgments WHERE department_id = $1';
    const params = [stationId];
    if (req.query.status) { sql += ` AND status = $${params.length + 1}`; params.push(req.query.status); }
    sql += ' ORDER BY effective_date DESC';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /types
router.get('/types', (_req, res) => res.json(POLICY_TYPES));

// GET /stats
router.get('/stats', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const total = await db.query("SELECT COUNT(*) as c FROM policy_acknowledgments WHERE department_id = $1 AND status = 'active'", [stationId]);
    const full = await db.query("SELECT COUNT(*) as c FROM policy_acknowledgments WHERE department_id = $1 AND status = 'active' AND total_required > 0 AND total_acknowledged >= total_required", [stationId]);
    const pending = await db.query("SELECT COUNT(*) as c FROM policy_acknowledgments WHERE department_id = $1 AND status = 'active' AND total_required > 0 AND total_acknowledged < total_required", [stationId]);
    res.json({
      totalActive: parseInt(total.rows[0].c),
      fullyAcknowledged: parseInt(full.rows[0].c),
      pendingAcknowledgments: parseInt(pending.rows[0].c),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await db.query(
      `INSERT INTO policy_acknowledgments (station_id, policy_title, policy_ref, policy_type, description, effective_date, review_date, required_by, total_required, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.department_id, b.policy_title, b.policy_ref, b.policy_type || 'sog', b.description,
       b.effective_date, b.review_date, JSON.stringify(b.required_by || []),
       b.total_required || 0, b.created_by, b.status || 'active']
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /:id — update policy or add acknowledgment
router.patch('/:id', async (req, res) => {
  try {
    const b = req.body;
    // If acknowledging, append to acknowledged_by array
    if (b.acknowledge_member) {
      const { rows: current } = await db.query('SELECT acknowledged_by, total_acknowledged FROM policy_acknowledgments WHERE id = $1 AND department_id = $2', [req.params.id, req.user.department_id]);
      if (!current.length) return res.status(404).json({ error: 'Not found' });
      const acked = Array.isArray(current[0].acknowledged_by) ? current[0].acknowledged_by : [];
      if (!acked.find(a => a.member_id === b.acknowledge_member.member_id)) {
        acked.push({ ...b.acknowledge_member, acknowledged_at: new Date().toISOString() });
      }
      const { rows } = await db.query(
        'UPDATE policy_acknowledgments SET acknowledged_by = $1, total_acknowledged = $2, updated_at = NOW() WHERE id = $3 AND department_id = $4 RETURNING *',
        [JSON.stringify(acked), acked.length, req.params.id, req.user.department_id]
      );
      return res.json(rows[0]);
    }
    const jsonFields = ['required_by', 'acknowledged_by'];
    const allowed = ['policy_title', 'policy_ref', 'policy_type', 'description', 'effective_date', 'review_date', 'required_by', 'total_required', 'status'];
    const data = {};
    for (const k of allowed) {
      if (b[k] !== undefined) data[k] = jsonFields.includes(k) ? JSON.stringify(b[k]) : b[k];
    }
    const { sets, values, nextIdx } = db.buildSetClause(data, Object.keys(data), 1);
    if (!sets) return res.status(400).json({ error: 'No valid fields' });
    values.push(req.params.id, req.user.department_id);
    const { rows } = await db.query(`UPDATE policy_acknowledgments SET ${sets}, updated_at = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx + 1} RETURNING *`, values);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM policy_acknowledgments WHERE id = $1 AND department_id = $2', [req.params.id, req.user.department_id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
