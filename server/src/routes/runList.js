'use strict';
/**
 * routes/runList.js — Daily run list persistence
 *
 * POST /api/run-list         — save (upsert) today's submitted run list
 * GET  /api/run-list/today   — retrieve today's saved run list
 *
 * The run list is the BC's submitted crew snapshot. Saving it here lets the
 * TV display show exactly what was submitted, independent of live apparatus
 * assignment edits that may happen after submission.
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// GET /today — retrieve today's saved run list (uses client-supplied date if provided)
router.get('/today', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    // Client can pass ?date=YYYY-MM-DD (local date) to avoid UTC-offset issues
    const clientDate = req.query.date;
    const d = new Date();
    const serverDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const today = clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate) ? clientDate : serverDate;

    const r = await pool.query(
      `SELECT payload, submitted_at FROM run_lists
       WHERE department_id = $1 AND date = $2
       ORDER BY submitted_at DESC LIMIT 1`,
      [stationId, today]
    );
    // Prevent browser/proxy caching — run list must always be fresh
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.json({ data: r.rows[0] || null });
  } catch (err) {
    console.error('run-list GET error:', err);
    res.status(500).json({ error: 'Failed to load run list' });
  }
});

// POST / — upsert today's run list (one record per station per date)
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const body = req.body;
    // Use the date the client sends (local date); fall back to server UTC date
    const d = new Date();
    const serverDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const date = (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) ? body.date : serverDate;

    const r = await pool.query(
      `INSERT INTO run_lists (station_id, date, payload, submitted_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (station_id, date)
         DO UPDATE SET payload = EXCLUDED.payload, submitted_at = NOW()
       RETURNING id, date, submitted_at`,
      [stationId, date, JSON.stringify(body)]
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('run-list POST error:', err);
    res.status(500).json({ error: 'Failed to save run list' });
  }
});

module.exports = router;
