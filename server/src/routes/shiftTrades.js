'use strict';
/**
 * routes/shiftTrades.js — Shift trade management with FLSA impact
 *
 * GET    /api/shift-trades            — list trades (?status=pending)
 * POST   /api/shift-trades            — request a trade
 * PATCH  /api/shift-trades/:id        — update (accept, approve, deny)
 * DELETE /api/shift-trades/:id        — cancel trade
 * GET    /api/shift-trades/impact/:id — FLSA impact preview for a trade
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

const SHIFT_HOURS = { 'Day': 12, 'Night': 12, 'Duty Officer': 24, '24-Hour': 24 };

// GET /
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { status } = req.query;
    let q = `SELECT st.*,
               rm.name as requester_name, rm.rank as requester_rank,
               cm.name as coverer_name, cm.rank as coverer_rank,
               s.date as shift_date, s."shiftType" as shift_type
             FROM shift_trades st
             JOIN members rm ON st.requesting_member_id = rm.id
             LEFT JOIN members cm ON st.covering_member_id = cm.id
             JOIN shifts s ON st.original_shift_id = s.id
             WHERE st.department_id = $1`;
    const params = [stationId];
    if (status) { q += ` AND st.status = $${params.length + 1}`; params.push(status); }
    q += ' ORDER BY st.created_at DESC';
    const r = await pool.query(q, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load shift trades' });
  }
});

// POST / — request a trade
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const d = req.body;
    const r = await pool.query(
      `INSERT INTO shift_trades (station_id, requesting_member_id, covering_member_id, original_shift_id, payback_shift_id, trade_date, payback_date, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [stationId, d.requesting_member_id, d.covering_member_id || null, d.original_shift_id, d.payback_shift_id || null,
       d.trade_date, d.payback_date || '', d.status || 'pending', d.notes || '']
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create trade' });
  }
});

// PATCH /:id — update trade (accept, approve, deny, complete)
router.patch('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { id } = req.params;
    const allowed = ['covering_member_id', 'payback_shift_id', 'payback_date', 'status', 'notes', 'approved_by',
                     'ot_impact_hours', 'flsa_period_hours_requester', 'flsa_period_hours_coverer'];
    const sets = []; const vals = []; let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        vals.push(['ot_impact_hours', 'flsa_period_hours_requester', 'flsa_period_hours_coverer'].includes(key)
          ? parseFloat(req.body[key]) || 0
          : ['covering_member_id', 'payback_shift_id'].includes(key) && req.body[key]
            ? parseInt(req.body[key])
            : req.body[key]);
      }
    }
    if (sets.length === 0) return res.json({ data: {} });
    vals.push(parseInt(id), stationId);
    const r = await pool.query(
      `UPDATE shift_trades SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $${idx + 1} RETURNING *`, vals
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM shift_trades WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete trade' });
  }
});

// GET /impact/:id — FLSA impact preview
router.get('/impact/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const tradeRes = await pool.query(
      `SELECT st.*, s.date, s."shiftType"
       FROM shift_trades st JOIN shifts s ON st.original_shift_id = s.id
       WHERE st.id = $1 AND st.department_id = $2`, [req.params.id, stationId]
    );
    const trade = tradeRes.rows[0];
    if (!trade) return res.status(404).json({ error: 'Trade not found' });

    // Get station FLSA config
    const stationRes = await pool.query(
      'SELECT flsa_work_period, flsa_ot_threshold, flsa_period_start FROM stations WHERE id = $1', [stationId]
    );
    const station = stationRes.rows[0];
    const periodDays = station?.flsa_work_period || 7;
    const otThreshold = parseFloat(station?.flsa_ot_threshold) || 40;

    // Calculate current FLSA period
    const tradeDate = new Date(trade.date + 'T00:00:00');
    let periodStart;
    if (station?.flsa_period_start) {
      const anchor = new Date(station.flsa_period_start + 'T00:00:00');
      const daysSinceAnchor = Math.floor((tradeDate - anchor) / (24 * 60 * 60 * 1000));
      const periodsElapsed = Math.floor(daysSinceAnchor / periodDays);
      periodStart = new Date(anchor);
      periodStart.setDate(periodStart.getDate() + (periodsElapsed * periodDays));
    } else {
      periodStart = new Date(tradeDate);
      periodStart.setDate(periodStart.getDate() - periodStart.getDay());
    }
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + periodDays - 1);
    const startStr = periodStart.toISOString().slice(0, 10);
    const endStr = periodEnd.toISOString().slice(0, 10);

    const shiftHours = SHIFT_HOURS[trade.shiftType] || 12;

    // Calculate hours for both members in this period
    async function memberPeriodHours(memberId) {
      // W2.5 audit (2026-06-10): member lookup station-scoped + hoisted out of
      // the shift loop (it re-fetched the same member once per shift row).
      const memberRes = await pool.query('SELECT name FROM members WHERE id = $1 AND department_id = $2', [memberId, stationId]);
      const memberName = memberRes.rows[0]?.name;
      if (!memberName) return 0;
      const r = await pool.query(
        `SELECT * FROM shifts WHERE department_id = $1 AND date >= $2 AND date <= $3`, [stationId, startStr, endStr]
      );
      let hours = 0;
      for (const s of r.rows) {
        const crew = JSON.parse(s.crew || '[]');
        if (crew.includes(memberName)) {
          hours += SHIFT_HOURS[s.shiftType] || 12;
        }
      }
      return hours;
    }

    const requesterHours = trade.requesting_member_id ? await memberPeriodHours(trade.requesting_member_id) : 0;
    const covererHours = trade.covering_member_id ? await memberPeriodHours(trade.covering_member_id) : 0;

    res.json({
      data: {
        trade,
        shiftHours,
        periodStart: startStr,
        periodEnd: endStr,
        otThreshold,
        requester: {
          currentHours: requesterHours,
          afterTrade: requesterHours - shiftHours,
          otBefore: Math.max(0, requesterHours - otThreshold),
          otAfter: Math.max(0, requesterHours - shiftHours - otThreshold),
        },
        coverer: {
          currentHours: covererHours,
          afterTrade: covererHours + shiftHours,
          otBefore: Math.max(0, covererHours - otThreshold),
          otAfter: Math.max(0, covererHours + shiftHours - otThreshold),
        },
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate trade impact' });
  }
});

module.exports = router;
