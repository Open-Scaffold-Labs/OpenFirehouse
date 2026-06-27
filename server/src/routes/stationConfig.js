'use strict';
/**
 * routes/stationConfig.js — Station configuration for career features
 *
 * GET    /api/station-config          — get station config (dept type, FLSA, min staffing)
 * PATCH  /api/station-config          — update station config
 * GET    /api/station-config/flsa     — get FLSA work period summary for current period
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { requireChief } = require('../middleware/requireRole');

// ── GET / — read station config ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const r = await pool.query(
      `SELECT dept_type, flsa_work_period, flsa_ot_threshold, flsa_period_start, min_staffing_block
       FROM stations WHERE id = $1`, [stationId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Station not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load station config' });
  }
});

// ── PATCH / — update station config ──────────────────────────────────────────
// Chief-only: department-wide FLSA/staffing config (client settings page is level 3).
router.patch('/', requireChief, async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { dept_type, flsa_work_period, flsa_ot_threshold, flsa_period_start, min_staffing_block } = req.body;

    const sets = [];
    const vals = [];
    let idx = 1;

    if (dept_type !== undefined)        { sets.push(`dept_type = $${idx++}`); vals.push(dept_type); }
    if (flsa_work_period !== undefined)  { sets.push(`flsa_work_period = $${idx++}`); vals.push(Number(flsa_work_period)); }
    if (flsa_ot_threshold !== undefined) { sets.push(`flsa_ot_threshold = $${idx++}`); vals.push(Number(flsa_ot_threshold)); }
    if (flsa_period_start !== undefined) { sets.push(`flsa_period_start = $${idx++}`); vals.push(flsa_period_start); }
    if (min_staffing_block !== undefined){ sets.push(`min_staffing_block = $${idx++}`); vals.push(Boolean(min_staffing_block)); }

    if (sets.length === 0) return res.json({ data: {} });

    vals.push(stationId);
    const r = await pool.query(
      `UPDATE stations SET ${sets.join(', ')} WHERE id = $${idx} RETURNING dept_type, flsa_work_period, flsa_ot_threshold, flsa_period_start, min_staffing_block`,
      vals
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update station config' });
  }
});

// ── GET /flsa — FLSA 207(k) work period summary ─────────────────────────────
// Returns hours worked per member in the current FLSA work period
router.get('/flsa', async (req, res) => {
  try {
    const stationId = req.user.department_id;

    // Get station FLSA config
    const stationRes = await pool.query(
      `SELECT flsa_work_period, flsa_ot_threshold, flsa_period_start FROM stations WHERE id = $1`, [stationId]
    );
    const station = stationRes.rows[0];
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const periodDays = station.flsa_work_period || 7;
    const otThreshold = parseFloat(station.flsa_ot_threshold) || 40;

    // Calculate current work period boundaries
    const today = new Date();
    let periodStart;
    if (station.flsa_period_start) {
      // Calculate the most recent period start from the anchor date
      const anchor = new Date(station.flsa_period_start + 'T00:00:00');
      const daysSinceAnchor = Math.floor((today - anchor) / (24 * 60 * 60 * 1000));
      const periodsElapsed = Math.floor(daysSinceAnchor / periodDays);
      periodStart = new Date(anchor);
      periodStart.setDate(periodStart.getDate() + (periodsElapsed * periodDays));
    } else {
      // Default: period starts on the most recent Sunday
      periodStart = new Date(today);
      periodStart.setDate(periodStart.getDate() - periodStart.getDay());
    }
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + periodDays - 1);

    const startStr = periodStart.toISOString().slice(0, 10);
    const endStr = periodEnd.toISOString().slice(0, 10);

    // Get all shifts in this period
    const shiftRes = await pool.query(
      `SELECT * FROM shifts WHERE department_id = $1 AND date >= $2 AND date <= $3`,
      [stationId, startStr, endStr]
    );

    // SHIFT_HOURS lookup
    const SHIFT_HOURS = { 'Day': 12, 'Night': 12, 'Duty Officer': 24, '24-Hour': 24 };

    // Calculate hours per member
    const memberHours = {};
    for (const shift of shiftRes.rows) {
      const crew = JSON.parse(shift.crew || '[]');
      const hours = SHIFT_HOURS[shift.shiftType] || 12;
      for (const name of crew) {
        if (!memberHours[name]) memberHours[name] = { regularHours: 0, shifts: 0 };
        memberHours[name].regularHours += hours;
        memberHours[name].shifts++;
      }
    }

    // Flag OT
    const summary = Object.entries(memberHours).map(([name, data]) => ({
      name,
      totalHours: data.regularHours,
      shifts: data.shifts,
      otHours: Math.max(0, data.regularHours - otThreshold),
      overThreshold: data.regularHours > otThreshold,
    })).sort((a, b) => b.totalHours - a.totalHours);

    res.json({
      data: {
        periodStart: startStr,
        periodEnd: endStr,
        periodDays,
        otThreshold,
        members: summary,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate FLSA summary' });
  }
});

module.exports = router;
