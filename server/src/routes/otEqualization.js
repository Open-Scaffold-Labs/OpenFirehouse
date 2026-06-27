'use strict';
/**
 * routes/otEqualization.js — Overtime equalization tracking
 *
 * GET    /api/ot-equalization             — OT hours per member (ranked)
 * POST   /api/ot-equalization             — log OT record
 * DELETE /api/ot-equalization/:id         — remove OT record
 * GET    /api/ot-equalization/board       — equalization board with rotation ranking
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// GET / — all OT records (optionally filtered by ?year=YYYY or ?member_id=X)
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { year, member_id } = req.query;
    let q = `SELECT ot.*, m.name as member_name, m.rank as member_rank
             FROM ot_records ot JOIN members m ON ot.member_id = m.id
             WHERE ot.department_id = $1`;
    const params = [stationId];
    if (year) {
      q += ` AND ot.ot_date >= $${params.length + 1} AND ot.ot_date <= $${params.length + 2}`;
      params.push(`${year}-01-01`, `${year}-12-31`);
    }
    if (member_id) {
      q += ` AND ot.member_id = $${params.length + 1}`;
      params.push(parseInt(member_id));
    }
    q += ' ORDER BY ot.ot_date DESC';
    const r = await pool.query(q, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load OT records' });
  }
});

// POST / — log an OT record
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const d = req.body;
    const r = await pool.query(
      `INSERT INTO ot_records (member_id, station_id, shift_id, ot_date, ot_hours, ot_type, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [d.member_id, stationId, d.shift_id || null, d.ot_date, parseFloat(d.ot_hours) || 0, d.ot_type || 'mandatory', d.reason || '']
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log OT' });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM ot_records WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete OT record' });
  }
});

// GET /board — equalization board: members ranked by OT hours, lowest-first rotation
router.get('/board', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const year = req.query.year || new Date().getFullYear();

    // Get all active members
    const membersRes = await pool.query(
      `SELECT id, name, rank, employment_type, seniority_number FROM members
       WHERE department_id = $1 AND (status = 'Active' OR status = 'Probationary')
       ORDER BY name`, [stationId]
    );

    // Get OT totals per member for this year
    const otRes = await pool.query(
      `SELECT member_id, SUM(ot_hours) as total_ot, COUNT(*) as ot_count,
              SUM(CASE WHEN ot_type = 'mandatory' THEN ot_hours ELSE 0 END) as mandatory_ot,
              SUM(CASE WHEN ot_type = 'voluntary' THEN ot_hours ELSE 0 END) as voluntary_ot,
              MAX(ot_date) as last_ot_date
       FROM ot_records WHERE department_id = $1 AND ot_date >= $2 AND ot_date <= $3
       GROUP BY member_id`,
      [stationId, `${year}-01-01`, `${year}-12-31`]
    );

    const otMap = {};
    otRes.rows.forEach(r => { otMap[r.member_id] = r; });

    const board = membersRes.rows
      .filter(m => m.employment_type === 'career' || m.employment_type === 'part-time')
      .map(m => {
        const ot = otMap[m.id] || { total_ot: 0, ot_count: 0, mandatory_ot: 0, voluntary_ot: 0, last_ot_date: null };
        return {
          ...m,
          totalOT: parseFloat(ot.total_ot) || 0,
          otCount: parseInt(ot.ot_count) || 0,
          mandatoryOT: parseFloat(ot.mandatory_ot) || 0,
          voluntaryOT: parseFloat(ot.voluntary_ot) || 0,
          lastOTDate: ot.last_ot_date,
        };
      })
      .sort((a, b) => a.totalOT - b.totalOT); // lowest OT first = next in rotation

    const avgOT = board.length > 0 ? board.reduce((s, m) => s + m.totalOT, 0) / board.length : 0;
    const maxDeviation = board.length > 0 ? Math.max(...board.map(m => Math.abs(m.totalOT - avgOT))) : 0;

    res.json({
      data: {
        year: parseInt(year),
        members: board,
        stats: {
          avgOT: Math.round(avgOT * 10) / 10,
          maxDeviation: Math.round(maxDeviation * 10) / 10,
          totalMembers: board.length,
          totalOTHours: board.reduce((s, m) => s + m.totalOT, 0),
        },
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build OT board' });
  }
});

module.exports = router;
