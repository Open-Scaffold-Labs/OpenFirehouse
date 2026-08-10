'use strict';
/**
 * routes/runList.js — Daily run list (Phase 1.1b: DERIVED published snapshot).
 *
 * GET  /api/run-list/today   — retrieve today's published run list
 * POST /api/run-list         — PUBLISH: derive the snapshot from the shift's
 *                              apparatus_assignments and stamp it (officer+)
 *
 * The run list is no longer client-authored. It is a DERIVED, provenance-stamped
 * snapshot of the live apparatus_assignments for the date's shift (utils/
 * runListPublish — the one brain). This makes publish-vs-live divergence
 * impossible by construction: the snapshot IS the assignments at publish time.
 * Editing "who's riding" happens on the apparatus-assignments board; publishing
 * freezes it into the dated record the TV + incident baseline read.
 */

const express = require('express');
const { z } = require('zod');
const router  = express.Router();
const { pool } = require('../db');
const { httpError, validate } = require('../utils/routeKit');
const { requireOfficer } = require('../middleware/requireRole');
const { publishSnapshot, resolveRosterStation } = require('../utils/runListPublish');

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function serverLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// GET /today — retrieve today's published run list (client passes ?date=YYYY-MM-DD).
router.get('/today',
  validate({ query: z.object({
    date: z.string().regex(ISO).optional(),
    station_id: z.coerce.number().int().positive().optional(),
  }).partial() }),
  async (req, res, next) => {
    try {
      const deptId = req.user.department_id;
      const today = (req.query.date && ISO.test(req.query.date)) ? req.query.date : serverLocalDate();
      // Per-station roster (0072): a single-house department resolves to its one
      // station automatically (existing clients send no station); a multi-house
      // department must name station_id (the "all stations" rollup is a separate view).
      const stationId = await resolveRosterStation(pool, deptId, req.query.station_id);
      if (stationId == null) throw httpError(400, 'Multiple stations — specify station_id', 'STATION_REQUIRED');
      const r = await pool.query(
        `SELECT payload, submitted_at, published_from_shift_id, source
           FROM run_lists
          WHERE department_id = $1 AND station_id = $2 AND date = $3
          ORDER BY submitted_at DESC LIMIT 1`,
        [deptId, stationId, today]);
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.json({ data: r.rows[0] || null });
    } catch (err) { next(err); }
  });

// GET /all — department-wide rollup (2.1b): every station's published roster for a
// date, for command/dispatch. Each station appears (published or not) with its crew
// count, so a multi-house department sees coverage across all houses at a glance.
router.get('/all',
  validate({ query: z.object({ date: z.string().regex(ISO).optional() }).partial() }),
  async (req, res, next) => {
    try {
      const deptId = req.user.department_id;
      const date = (req.query.date && ISO.test(req.query.date)) ? req.query.date : serverLocalDate();
      const r = await pool.query(
        `SELECT s.id AS station_id, s.name AS station_name,
                rl.payload, rl.submitted_at, rl.source
           FROM stations s
           LEFT JOIN LATERAL (
             SELECT payload, submitted_at, source FROM run_lists
              WHERE department_id = $1 AND station_id = s.id AND date = $2
              ORDER BY submitted_at DESC LIMIT 1
           ) rl ON true
          WHERE s.department_id = $1
          ORDER BY s.name`,
        [deptId, date]);
      const stations = r.rows.map((row) => ({
        station_id:   row.station_id,
        station_name: row.station_name,
        published:    !!row.payload,
        submitted_at: row.submitted_at || null,
        source:       row.source || null,
        crew_count:   Array.isArray(row.payload && row.payload.crew) ? row.payload.crew.length : 0,
        crew:         Array.isArray(row.payload && row.payload.crew) ? row.payload.crew : [],
      }));
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json({ data: { date, stations, total_on_duty: stations.reduce((n, s) => n + s.crew_count, 0) } });
    } catch (err) { next(err); }
  });

// POST / — PUBLISH the run list for a date by deriving it from the shift's
// apparatus_assignments. Body no longer carries crew[] — the assignments board
// is the store of record. Officer+ (a supervisor posts the daily roster).
router.post('/', requireOfficer,
  validate({ body: z.object({
    date:       z.string().regex(ISO).optional(),
    shift_id:   z.number().int().positive().optional(),
    station_id: z.number().int().positive().optional(),
  }).strict() }),
  async (req, res, next) => {
    try {
      const deptId = req.user.department_id;
      let publishDate = (req.body.date && ISO.test(req.body.date)) ? req.body.date : serverLocalDate();
      let rotationShiftId = null;

      // A rotation shift is OPTIONAL. When one is named, validate it belongs to
      // this department and publish for its START date (day-boundary doctrine) —
      // it becomes the snapshot's provenance link. When absent, we publish the
      // riding board for the date directly (volunteer / ad-hoc — no phantom shift).
      if (req.body.shift_id != null) {
        const s = await pool.query(
          'SELECT id, date FROM shifts WHERE id = $1 AND department_id = $2',
          [req.body.shift_id, deptId]);
        if (!s.rows.length) throw httpError(404, 'Shift not found in this department', 'SHIFT_NOT_FOUND');
        rotationShiftId = s.rows[0].id;
        if (s.rows[0].date) publishDate = s.rows[0].date;
      }

      // Resolve the station this roster is published for (0072). Single-house →
      // its one station; multi-house must specify station_id (never guess a station).
      const stationId = await resolveRosterStation(pool, deptId, req.body.station_id);
      if (stationId == null) throw httpError(400, 'This department has multiple stations — specify station_id to publish its roster', 'STATION_REQUIRED');

      const { row, crew } = await publishSnapshot(pool, deptId, stationId, publishDate, { source: 'published', shiftId: rotationShiftId });

      res.json({
        data: row,
        crewCount: crew.length,
        // Tell the user when a publish froze an EMPTY roster — the assignments
        // board is where you fill seats before publishing.
        note: crew.length === 0 ? 'No apparatus assignments for this date yet — published an empty run list.' : undefined,
      });
    } catch (err) { next(err); }
  });

module.exports = router;
