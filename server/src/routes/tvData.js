// tvData.js — Public TV display endpoint, no JWT required
// Protected only by a station TV PIN stored in the stations table.
const express = require('express');
const router  = express.Router();
const { pool, runWithDepartment } = require('../db');
const { findStationByPin } = require('../config/tvPin');

// W3.3 — zod on the unauthenticated surface
const { z } = require('zod');
const validate = require('../middleware/validate');
const tvQuerySchema = z.looseObject({
  pin:  z.string().min(1).max(64).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// GET /api/tv-data?pin=XXXX[&date=YYYY-MM-DD]
// Returns everything the TV display needs in one shot.
// The optional `date` param lets the TV client pass its LOCAL date so we
// fetch the right run list even when the server clock is in a different UTC offset.
router.get('/', validate({ query: tvQuerySchema }), async (req, res) => {
  const { pin } = req.query;
  if (!pin) return res.status(401).json({ error: 'TV PIN required' });

  try {
    // Validate PIN against stations table (hashed; legacy plaintext upgraded)
    const station = await findStationByPin(pool, pin);
    if (!station) {
      return res.status(401).json({ error: 'Invalid TV PIN' });
    }

    // Build a ±1-day window in local time so shift dates (stored as text by clients)
    // are always found even if the server clock is in a different UTC offset.
    // shifts.date is stored as 'YYYY-MM-DD' local-time text, so we cast to text for comparison.
    const d = new Date();
    function localDate(offset) {
      const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
      return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
    }
    const dateWindow = [localDate(-1), localDate(0), localDate(1)];

    // If the TV client sends its local date, include it too (avoids any timezone gaps)
    const clientDate = req.query.date;
    if (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate) && !dateWindow.includes(clientDate)) {
      dateWindow.push(clientDate);
    }

    // Fetch all TV data in parallel, inside a department context so queries run
    // with app.department_id set (RLS-ready; behavior-neutral until P5_TXN=on).
    const data = await runWithDepartment(station.id, null, async () => {
      const [membersRes, apparatusRes, boardRes, radioRes, assignmentsRes, runListRes, unitStatusRes] = await Promise.all([
      pool.query(
        `SELECT id, name, rank, status, available FROM members
         WHERE department_id = $1 AND status IN ('Active','Probationary')
         ORDER BY name`,
        [station.id]
      ),
      pool.query(
        `SELECT id, designation, type, status, year FROM apparatus
         WHERE department_id = $1
         ORDER BY designation`,
        [station.id]
      ),
      pool.query(
        `SELECT * FROM active_boards WHERE department_id = $1 LIMIT 1`,
        [station.id]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT * FROM radio_log WHERE department_id = $1 ORDER BY timestamp DESC LIMIT 10`,
        [station.id]
      ).catch(() => ({ rows: [] })),
      // Apparatus assignments for today's shifts — live data, also used as fallback
      pool.query(
        `SELECT aa.apparatus_id, aa.member_id, aa.position_name,
                m.name  AS member_name, m.rank  AS member_rank,
                a.designation AS apparatus_name, a.type AS apparatus_type
         FROM apparatus_assignments aa
         JOIN members  m ON aa.member_id   = m.id
         JOIN apparatus a ON aa.apparatus_id = a.id
         JOIN shifts    s ON aa.shift_id    = s.id
         WHERE aa.department_id = $1 AND s.date = ANY($2)
         ORDER BY a.designation, aa.position_name`,
        [station.id, dateWindow]
      ).catch(() => ({ rows: [] })),
      // Saved run list — the BC's submitted snapshot (most recent for today)
      // This is the canonical source of truth for the TV display once submitted.
      pool.query(
        `SELECT payload, submitted_at FROM run_lists
         WHERE department_id = $1 AND date = ANY($2)
         ORDER BY submitted_at DESC LIMIT 1`,
        [station.id, dateWindow]
      ).catch(() => ({ rows: [] })),
      // Live per-unit status (Phase 2) — every fleet apparatus, defaulting to 'in_service'.
      pool.query(
        `SELECT a.id AS apparatus_id, a.designation, a.type,
                COALESCE(us.status, 'in_service') AS status, us.updated_at
         FROM apparatus a
         LEFT JOIN unit_statuses us ON us.apparatus_id = a.id AND us.department_id = $1
         WHERE a.department_id = $1
         ORDER BY a.designation`,
        [station.id]
      ).catch(() => ({ rows: [] })),
      ]);
      return {
        members:      membersRes.rows,
        apparatus:    apparatusRes.rows,
        activeBoard:  boardRes.rows[0] || null,
        radioFeed:    radioRes.rows,
        assignments:  assignmentsRes.rows,  // live apparatus assignments (used before run list is submitted)
        runList:      runListRes.rows[0] || null,  // submitted run list snapshot (used once BC submits)
        unitStatuses: unitStatusRes.rows,  // live per-unit status (Phase 2)
      };
    });

    res.json({
      station: {
        id:             station.id,
        departmentId:   station.department_id,  // for the dept-keyed realtime topic (P6.2)
        name:           station.name,
        departmentName: station.department_name || station.name,
        city:           station.city,
        state:          station.state,
      },
      ...data,
    });
  } catch (err) {
    console.error('TV data error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
