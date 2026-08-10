// tvData.js — Public TV display endpoint, no JWT required
// Protected only by a station TV PIN stored in the stations table.
const express = require('express');
const router  = express.Router();
const { pool, runWithDepartment } = require('../db');
const { findStationByPin } = require('../config/tvPin');
const { resolveDeviceToken } = require('./stationDisplays'); // 2.3: paired-device auth

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
  try {
    // 2.3 (0074): a PAIRED device authenticates with its device token (header or query)
    // and is bound to exactly one station. Falls back to the legacy per-station TV PIN.
    let station = null;
    // SECURITY (2.3 audit): the device token is a persistent bearer credential, so it is
    // accepted ONLY via header — never the query string (which leaks into access logs,
    // history, and Referer). The legacy shared PIN may still come by query.
    const deviceToken = req.get('x-device-token');
    if (deviceToken) {
      const bound = await resolveDeviceToken(deviceToken); // touches last_seen; null if revoked/unknown
      if (bound) {
        const s = await pool.query('SELECT * FROM stations WHERE id = $1 AND department_id = $2', [bound.station_id, bound.department_id]);
        station = s.rows[0] || null;
      }
      if (!station) return res.status(401).json({ error: 'Invalid or revoked device' });
    } else {
      const { pin } = req.query;
      if (!pin) return res.status(401).json({ error: 'TV PIN or device token required' });
      // Validate PIN against stations table (hashed; legacy plaintext upgraded)
      station = await findStationByPin(pool, pin);
      if (!station) {
        return res.status(401).json({ error: 'Invalid TV PIN' });
      }
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
    // SECURITY (2.3 audit): department-scoped filters + the RLS GUC use the real
    // department_id (station.department_id), NEVER station.id — the two are separate
    // keyspaces and only coincide in legacy single-house data. station.id is used only
    // where a STATION column is meant (run_lists.station_id).
    const data = await runWithDepartment(station.department_id, null, async () => {
      const [membersRes, apparatusRes, boardRes, radioRes, assignmentsRes, runListRes, unitStatusRes] = await Promise.all([
      pool.query(
        `SELECT id, name, rank, status, available FROM members
         WHERE department_id = $1 AND status IN ('Active','Probationary')
         ORDER BY name`,
        [station.department_id]
      ),
      pool.query(
        `SELECT id, designation, type, status, year FROM apparatus
         WHERE department_id = $1
         ORDER BY designation`,
        [station.department_id]
      ),
      pool.query(
        `SELECT * FROM active_boards WHERE department_id = $1 LIMIT 1`,
        [station.department_id]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT * FROM radio_log WHERE department_id = $1 ORDER BY timestamp DESC LIMIT 10`,
        [station.department_id]
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
        [station.department_id, dateWindow]
      ).catch(() => ({ rows: [] })),
      // Saved run list — the BC's submitted snapshot (most recent for today).
      // 0072: a TV is bound to ONE station, so it shows THAT station's roster —
      // keyed on (department_id, station_id, date). (station.department_id and
      // station.id are equal in legacy single-house data, distinct once multi-house.)
      pool.query(
        `SELECT payload, submitted_at FROM run_lists
         WHERE department_id = $1 AND station_id = $2 AND date = ANY($3)
         ORDER BY submitted_at DESC LIMIT 1`,
        [station.department_id, station.id, dateWindow]
      ).catch(() => ({ rows: [] })),
      // Live per-unit status (Phase 2) — every fleet apparatus, defaulting to 'in_service'.
      pool.query(
        `SELECT a.id AS apparatus_id, a.designation, a.type,
                COALESCE(us.status, 'in_service') AS status, us.updated_at
         FROM apparatus a
         LEFT JOIN unit_statuses us ON us.apparatus_id = a.id AND us.department_id = $1
         WHERE a.department_id = $1
         ORDER BY a.designation`,
        [station.department_id]
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
