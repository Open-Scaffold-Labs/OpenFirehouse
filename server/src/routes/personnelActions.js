'use strict';
/**
 * routes/personnelActions.js — Personnel action tracking
 *
 * GET    /api/personnel-actions               — list all (optionally ?member_id=X&type=Y)
 * POST   /api/personnel-actions               — create action
 * PATCH  /api/personnel-actions/:id           — update action
 * DELETE /api/personnel-actions/:id           — delete action
 * GET    /api/personnel-actions/member/:id    — full personnel file for a member
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

const ACTION_TYPES = [
  'promotion', 'demotion', 'lateral_transfer', 'assignment_change',
  'commendation', 'unit_citation', 'merit_award',
  'verbal_warning', 'written_warning', 'suspension', 'termination',
  'performance_review', 'probation_completion', 'annual_evaluation',
  'hire', 'resignation', 'retirement', 'leave_of_absence',
  'injury_report', 'return_to_duty',
  'other',
];

// GET /action-types
router.get('/action-types', (req, res) => {
  res.json({ data: ACTION_TYPES });
});

// GET / — list personnel actions
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { member_id, type, year } = req.query;
    let q = `SELECT pa.*, m.name as member_name, m.rank as member_rank
             FROM personnel_actions pa JOIN members m ON pa.member_id = m.id
             WHERE pa.department_id = $1`;
    const params = [stationId];
    if (member_id) { q += ` AND pa.member_id = $${params.length + 1}`; params.push(parseInt(member_id)); }
    if (type)      { q += ` AND pa.action_type = $${params.length + 1}`; params.push(type); }
    if (year)      { q += ` AND pa.action_date >= $${params.length + 1} AND pa.action_date <= $${params.length + 2}`; params.push(`${year}-01-01`, `${year}-12-31`); }
    q += ' ORDER BY pa.action_date DESC, pa.created_at DESC';
    const r = await pool.query(q, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load personnel actions' });
  }
});

// POST /
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const d = req.body;
    const r = await pool.query(
      `INSERT INTO personnel_actions (member_id, station_id, action_type, action_date, description, details, issued_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [d.member_id, stationId, d.action_type, d.action_date, d.description || '', JSON.stringify(d.details || {}), d.issued_by || '', d.status || 'active']
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create personnel action' });
  }
});

// PATCH /:id
router.patch('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { id } = req.params;
    const allowed = ['action_type', 'action_date', 'description', 'details', 'issued_by', 'status'];
    const sets = []; const vals = []; let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        vals.push(key === 'details' ? JSON.stringify(req.body[key]) : req.body[key]);
      }
    }
    if (sets.length === 0) return res.json({ data: {} });
    vals.push(parseInt(id), stationId);
    const r = await pool.query(
      `UPDATE personnel_actions SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $${idx + 1} RETURNING *`, vals
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update personnel action' });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM personnel_actions WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete personnel action' });
  }
});

// GET /member/:id — full personnel file
router.get('/member/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const memberId = parseInt(req.params.id);
    const [actionsRes, memberRes] = await Promise.all([
      pool.query('SELECT * FROM personnel_actions WHERE member_id = $1 AND department_id = $2 ORDER BY action_date DESC', [memberId, stationId]),
      pool.query('SELECT id, name, rank, role, status, joined, hire_date, rank_date, seniority_number, employment_type FROM members WHERE id = $1 AND department_id = $2', [memberId, stationId]),
    ]);

    const actions = actionsRes.rows;
    const member = memberRes.rows[0];
    const summary = {
      promotions: actions.filter(a => a.action_type === 'promotion').length,
      commendations: actions.filter(a => ['commendation', 'unit_citation', 'merit_award'].includes(a.action_type)).length,
      disciplinary: actions.filter(a => ['verbal_warning', 'written_warning', 'suspension'].includes(a.action_type)).length,
      reviews: actions.filter(a => ['performance_review', 'annual_evaluation'].includes(a.action_type)).length,
      total: actions.length,
    };

    res.json({ data: { member, actions, summary } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load personnel file' });
  }
});

module.exports = router;
