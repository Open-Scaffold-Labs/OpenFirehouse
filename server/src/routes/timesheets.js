const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET / — list timesheets (filter by period, member, status)
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { period_start, period_end, member_id, status } = req.query;
    let sql = `
      SELECT t.*, m.name AS member_name, m.rank AS member_rank
      FROM timesheets t
      LEFT JOIN members m ON m.id = t.member_id
      WHERE t.department_id = $1
    `;
    const params = [stationId];
    if (period_start) { params.push(period_start); sql += ` AND t.period_start >= $${params.length}`; }
    if (period_end)   { params.push(period_end);   sql += ` AND t.period_end <= $${params.length}`; }
    if (member_id)    { params.push(member_id);     sql += ` AND t.member_id = $${params.length}`; }
    if (status)       { params.push(status);        sql += ` AND t.status = $${params.length}`; }
    sql += ' ORDER BY t.period_start DESC, m.name';
    const { rows } = await pool.query(sql, params);
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /api/timesheets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /generate — auto-generate timesheets for a FLSA period
router.post('/generate', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { period_start, period_end } = req.body;
    if (!period_start || !period_end) {
      return res.status(400).json({ error: 'period_start and period_end required' });
    }

    // Get all active members
    const { rows: members } = await pool.query(
      `SELECT id, name FROM members WHERE department_id = $1 AND status IN ('Active', 'Probationary')`,
      [stationId]
    );

    // Get station config for FLSA
    const { rows: cfgRows } = await pool.query(
      `SELECT dept_type, flsa_work_period, flsa_ot_threshold FROM stations WHERE id = $1`,
      [stationId]
    );
    const cfg = cfgRows[0] || {};
    const flsaPeriod = `${cfg.flsa_work_period || 14}-day`;

    let generated = 0;
    for (const member of members) {
      // Check if timesheet already exists for this member/period
      const { rows: existing } = await pool.query(
        `SELECT id FROM timesheets WHERE department_id = $4 AND member_id = $1 AND period_start = $2 AND period_end = $3`,
        [member.id, period_start, period_end, stationId]
      );
      if (existing.length > 0) continue;

      // Calculate hours from daily_staffing
      const { rows: staffing } = await pool.query(`
        SELECT COALESCE(SUM(hours), 0) AS total
        FROM daily_staffing
        WHERE department_id = $4 AND member_id = $1 AND date BETWEEN $2 AND $3
      `, [member.id, period_start, period_end, stationId]);

      // Get OT hours from ot_records
      const { rows: otData } = await pool.query(`
        SELECT COALESCE(SUM(ot_hours), 0) AS total
        FROM ot_records
        WHERE department_id = $4 AND member_id = $1 AND ot_date BETWEEN $2 AND $3
      `, [member.id, period_start, period_end, stationId]);

      // Get leave hours
      const { rows: leaveData } = await pool.query(`
        SELECT COUNT(*) AS days
        FROM leave_requests
        WHERE department_id = $4 AND member_id = $1
          AND status = 'approved'
          AND start_date <= $3 AND end_date >= $2
      `, [member.id, period_start, period_end, stationId]);

      const regularHours = parseFloat(staffing[0].total) || 0;
      const otHours = parseFloat(otData[0].total) || 0;
      const leaveDays = parseInt(leaveData[0].days) || 0;
      const leaveHours = leaveDays * 24; // career = 24h shifts

      await pool.query(`
        INSERT INTO timesheets (station_id, member_id, period_start, period_end, regular_hours, ot_hours, leave_hours, total_hours, flsa_period, status)
        VALUES ($9, $1, $2, $3, $4, $5, $6, $7, $8, 'draft')
      `, [
        member.id, period_start, period_end,
        regularHours, otHours, leaveHours,
        regularHours + otHours, flsaPeriod, stationId,
      ]);
      generated++;
    }

    res.json({ ok: true, generated, totalMembers: members.length });
  } catch (err) {
    console.error('POST /api/timesheets/generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST / — create single timesheet
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { member_id, period_start, period_end, regular_hours, ot_hours, leave_hours, trade_hours, flsa_period, notes } = req.body;
    const total = (parseFloat(regular_hours) || 0) + (parseFloat(ot_hours) || 0);
    const { rows } = await pool.query(`
      INSERT INTO timesheets (station_id, member_id, period_start, period_end, regular_hours, ot_hours, leave_hours, trade_hours, total_hours, flsa_period, notes)
      VALUES ($11, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [member_id, period_start, period_end,
        regular_hours || 0, ot_hours || 0, leave_hours || 0, trade_hours || 0,
        total, flsa_period || '', notes || '', stationId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — update timesheet
router.patch('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const allowed = ['regular_hours', 'ot_hours', 'leave_hours', 'trade_hours', 'total_hours', 'status', 'approved_by', 'notes'];
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`"${key}" = $${idx++}`);
        vals.push(req.body[key]);
      }
    }
    if (req.body.status === 'approved') {
      sets.push(`approved_at = NOW()`);
    }
    if (sets.length === 0) return res.json({ ok: true });
    vals.push(parseInt(req.params.id));
    vals.push(stationId);
    const { rows } = await pool.query(
      `UPDATE timesheets SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $${idx + 1} RETURNING *`, vals
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /export — generate CSV export of timesheets for a period
router.post('/export', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { period_start, period_end } = req.body;
    const { rows } = await pool.query(`
      SELECT t.*, m.name AS member_name, m.rank AS member_rank, m."memberNumber"
      FROM timesheets t
      LEFT JOIN members m ON m.id = t.member_id
      WHERE t.department_id = $3 AND t.period_start >= $1 AND t.period_end <= $2
      ORDER BY m.name
    `, [period_start, period_end, stationId]);

    const headers = ['Member Number', 'Name', 'Rank', 'Period Start', 'Period End', 'Regular Hours', 'OT Hours', 'Leave Hours', 'Trade Hours', 'Total Hours', 'FLSA Period', 'Status'];
    const csvRows = rows.map(r => [
      r.memberNumber || '', r.member_name || '', r.member_rank || '',
      r.period_start, r.period_end,
      r.regular_hours, r.ot_hours, r.leave_hours, r.trade_hours, r.total_hours,
      r.flsa_period, r.status,
    ].join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');
    res.json({ csv, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM timesheets WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
