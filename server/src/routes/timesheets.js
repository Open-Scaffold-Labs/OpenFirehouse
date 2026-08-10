const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireOfficer, requireChief } = require('../middleware/requireRole');

// GET / — list timesheets (filter by period, member, status) (officer+)
// Market gate: a dept-wide timesheet listing is a supervisor view ("officers
// see their station"). Member self-view ("personnel see their own") is a P4
// follow-up — it needs members.user_id populated to map a login to its member
// row (CLAUDE.md: currently unpopulated), so it isn't wired here.
router.get('/', requireOfficer, async (req, res) => {
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

// POST /generate — auto-generate timesheets for a FLSA period (officer+)
router.post('/generate', requireOfficer, async (req, res) => {
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

    // FLSA config — 1.1a: from DEPARTMENTS (the tenant), station fallback.
    // The old read was `stations WHERE id = <dept id>` — wrong row multi-house.
    const { rows: cfgRows } = await pool.query(
      `SELECT flsa_work_period, flsa_ot_threshold FROM departments WHERE id = $1`,
      [stationId]
    );
    let cfg = cfgRows[0] || {};
    if (!cfg.flsa_work_period) {
      const { rows: stRows } = await pool.query(
        `SELECT flsa_work_period, flsa_ot_threshold FROM stations WHERE department_id = $1 ORDER BY id LIMIT 1`,
        [stationId]
      );
      cfg = stRows[0] || {};
    }
    const flsaPeriod = `${cfg.flsa_work_period || 14}-day`;

    let generated = 0;
    for (const member of members) {
      // Check if timesheet already exists for this member/period
      const { rows: existing } = await pool.query(
        `SELECT id FROM timesheets WHERE department_id = $4 AND member_id = $1 AND period_start = $2 AND period_end = $3`,
        [member.id, period_start, period_end, stationId]
      );
      if (existing.length > 0) continue;

      // (0067: generate's INSERT below writes department_id explicitly)
      // Calculate worked hours from the date-keyed riding board (1.1c-b / 0070):
      // the assignment IS the timecard line — daily_staffing was folded into
      // apparatus_assignments, so hours now live on the seat/assignment the member rode.
      const { rows: staffing } = await pool.query(`
        SELECT COALESCE(SUM(hours), 0) AS total
        FROM apparatus_assignments
        WHERE department_id = $4 AND member_id = $1 AND date BETWEEN $2 AND $3
      `, [member.id, period_start, period_end, stationId]);

      // Get OT hours from ot_records
      const { rows: otData } = await pool.query(`
        SELECT COALESCE(SUM(ot_hours), 0) AS total
        FROM ot_records
        WHERE department_id = $4 AND member_id = $1 AND ot_date BETWEEN $2 AND $3
      `, [member.id, period_start, period_end, stationId]);

      // Get leave DAYS overlapping the period — 1.1a fix: the old query used
      // snake_case columns (start_date) that DON'T EXIST on leave_requests
      // (they're camelCase-quoted) and lowercase 'approved' — it THREW on every
      // generate and leave hours never counted. Count only the overlap days.
      const { rows: leaveData } = await pool.query(`
        SELECT COALESCE(SUM(
          (LEAST("endDate"::date, $3::date) - GREATEST("startDate"::date, $2::date)) + 1
        ), 0) AS days
        FROM leave_requests
        WHERE department_id = $4 AND "memberId" = $1
          AND status = 'Approved'
          AND "startDate"::date <= $3::date AND "endDate"::date >= $2::date
      `, [member.id, period_start, period_end, stationId]);

      const regularHours = parseFloat(staffing[0].total) || 0;
      const otHours = parseFloat(otData[0].total) || 0;
      const leaveDays = parseInt(leaveData[0].days) || 0;
      const leaveHours = leaveDays * 24; // career = 24h shifts

      await pool.query(`
        INSERT INTO timesheets (department_id, member_id, period_start, period_end, regular_hours, ot_hours, leave_hours, total_hours, flsa_period, status)
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

// POST / — create single timesheet (officer+; 0067: department_id explicit)
router.post('/', requireOfficer, async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { member_id, period_start, period_end, regular_hours, ot_hours, leave_hours, trade_hours, flsa_period, notes } = req.body;
    const total = (parseFloat(regular_hours) || 0) + (parseFloat(ot_hours) || 0);
    const { rows } = await pool.query(`
      INSERT INTO timesheets (department_id, member_id, period_start, period_end, regular_hours, ot_hours, leave_hours, trade_hours, total_hours, flsa_period, notes)
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

// PATCH /:id — update timesheet (officer+)
router.patch('/:id', requireOfficer, async (req, res) => {
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

// POST /export — generate CSV export of timesheets for a period (chief+)
// Market gate: a full-department payroll export is an admin/HR/chief-scope
// action (viewing others' wages/hours in a payroll export sits above the
// supervisor tier). Consistent with payEntries POST = requireChief.
router.post('/export', requireChief, async (req, res) => {
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

// DELETE /:id (officer+)
router.delete('/:id', requireOfficer, async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM timesheets WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
