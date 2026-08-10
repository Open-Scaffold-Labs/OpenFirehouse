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
const { requireOfficer, requireChief } = require('../middleware/requireRole');
const { EARN_CODES, EARN_CODE_LABELS, aggregateQualified } = require('../utils/qualifiedOt');

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

// POST / — log an OT record (officer+; 0067: department_id written explicitly —
// station_id was a REAL stations FK receiving department ids, multi-house FK bomb)
router.post('/', requireOfficer, async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const d = req.body;
    // 1.2f: the FLSA earn-code axis (closed set; null = unclassified). Reject a bad code
    // rather than silently mis-classifying a tax figure. regular_rate is the optional
    // half-premium basis. Orthogonal to ot_type (mandatory/voluntary equalization).
    if (d.earn_code != null && d.earn_code !== '' && !EARN_CODES.includes(d.earn_code)) {
      return res.status(400).json({ error: `earn_code must be one of: ${EARN_CODES.join(', ')}`, code: 'INVALID_EARN_CODE' });
    }
    // Non-negative hours + the member must belong to THIS dept (never trust a client id — the
    // OT column now feeds a reported tax figure, so a foreign/typo member must not attach).
    const otHours = parseFloat(d.ot_hours) || 0;
    if (otHours < 0) return res.status(400).json({ error: 'ot_hours must be 0 or more', code: 'INVALID_HOURS' });
    const mCheck = await pool.query('SELECT 1 FROM members WHERE id = $1 AND department_id = $2', [d.member_id, stationId]);
    if (!mCheck.rows.length) return res.status(400).json({ error: 'member_id is not a member of this department', code: 'INVALID_MEMBER' });
    const earnCode = d.earn_code && EARN_CODES.includes(d.earn_code) ? d.earn_code : null;
    const rate = d.regular_rate == null || d.regular_rate === '' ? null : parseFloat(d.regular_rate);
    const r = await pool.query(
      `INSERT INTO ot_records (member_id, department_id, shift_id, ot_date, ot_hours, ot_type, reason, earn_code, regular_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [d.member_id, stationId, d.shift_id || null, d.ot_date, otHours, d.ot_type || 'mandatory', d.reason || '',
       earnCode, (rate != null && !Number.isNaN(rate) && rate >= 0) ? rate : null]
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log OT' });
  }
});

// DELETE /:id (officer+)
router.delete('/:id', requireOfficer, async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM ot_records WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete OT record' });
  }
});

// GET /qualified-export?year=YYYY — chief: the §225 qualified-OT figure per member for a tax
// year, for the payroll system to file W-2 Box 12 Code TT. ADVISORY, never payroll-of-record:
// qualifying = the 0.5x half-premium of FLSA §7/§7(k)-required OT only; dollars are shown where
// a regular_rate is known (else qualifying HOURS + the formula for payroll to apply); an
// unclassified (earn_code null) record is surfaced, never auto-qualified.
router.get('/qualified-export', requireChief, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const year = String(req.query.year || new Date().getFullYear());
    if (!/^\d{4}$/.test(year)) return res.status(400).json({ error: 'year must be YYYY', code: 'INVALID_YEAR' });
    const r = await pool.query(
      `SELECT ot.member_id, m.name AS member_name, ot.ot_hours, ot.earn_code, ot.regular_rate
         FROM ot_records ot JOIN members m ON m.id = ot.member_id
        WHERE ot.department_id = $1 AND ot.ot_date >= $2 AND ot.ot_date <= $3`,
      [deptId, `${year}-01-01`, `${year}-12-31`]
    );
    const byMember = new Map();
    for (const row of r.rows) {
      if (!byMember.has(row.member_id)) byMember.set(row.member_id, { member_id: row.member_id, member_name: row.member_name, records: [] });
      byMember.get(row.member_id).records.push(row);
    }
    const members = [...byMember.values()]
      .map(m => ({ member_id: m.member_id, member_name: m.member_name, ...aggregateQualified(m.records) }))
      .filter(m => m.qualifyingHours > 0 || m.unclassifiedHours > 0)
      .sort((a, b) => b.qualifyingHours - a.qualifyingHours);
    const unclassifiedHoursTotal = Math.round(members.reduce((s, m) => s + m.unclassifiedHours, 0) * 100) / 100;
    res.json({ data: {
      year: Number(year),
      advisory: 'Advisory only — computed for your payroll system to file W-2 Box 12 Code TT (qualified overtime, mandatory TY2026). OpenFirehouse is not payroll-of-record. Qualified OT is the 0.5x half-premium of FLSA §7/§7(k)-required OT only; figures are pre-cap (the §225 $12,500/$25,000 deduction cap and income phase-outs apply on the employee return).',
      earnCodeLabels: EARN_CODE_LABELS,
      unclassifiedHoursTotal,
      members,
    }});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build the qualified-OT export' });
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
