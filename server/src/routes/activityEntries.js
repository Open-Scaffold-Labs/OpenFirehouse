'use strict';
/**
 * routes/activityEntries.js — Unified Activity Entry (legacy-RMS replacement)
 *
 * One entry per activity: equipment checks, apparatus checks, fuel logs,
 * maintenance requests, visitor logs, training entries, etc.
 *
 * GET    /api/activity-entries              — list entries (filterable)
 * GET    /api/activity-entries/today        — today's entries for current user
 * GET    /api/activity-entries/stats        — completion stats for the shift
 * POST   /api/activity-entries              — create an entry
 * PATCH  /api/activity-entries/:id          — update an entry
 * DELETE /api/activity-entries/:id          — delete an entry
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS activity_entries (
    id SERIAL PRIMARY KEY,
    station_id INTEGER DEFAULT 1,
    entry_type TEXT NOT NULL,
    category TEXT DEFAULT '',
    date TEXT NOT NULL,
    shift TEXT DEFAULT '',
    entered_by TEXT DEFAULT '',
    entered_by_id INTEGER DEFAULT NULL,
    apparatus TEXT DEFAULT '',
    result TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    body TEXT DEFAULT '',
    priority TEXT DEFAULT 'normal',
    visitor_name TEXT DEFAULT '',
    purpose TEXT DEFAULT '',
    time_in TEXT DEFAULT '',
    time_out TEXT DEFAULT '',
    gallons DOUBLE PRECISION DEFAULT NULL,
    fuel_type TEXT DEFAULT '',
    location TEXT DEFAULT '',
    property TEXT DEFAULT '',
    hydrant_id TEXT DEFAULT '',
    event_name TEXT DEFAULT '',
    attendees INTEGER DEFAULT NULL,
    department TEXT DEFAULT '',
    incident_type TEXT DEFAULT '',
    incident_number TEXT DEFAULT '',
    course TEXT DEFAULT '',
    hours DOUBLE PRECISION DEFAULT NULL,
    instructor TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

let initialized = false;
async function ensureTable() {
  if (initialized) return;
  try { await db.query(INIT_SQL); initialized = true; } catch (e) { console.error('activity_entries init:', e.message); }
}

// ─── GET / — list entries ────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    let sql = 'SELECT * FROM activity_entries WHERE department_id = $1';
    const params = [stationId];

    if (req.query.date) { sql += ` AND date = $${params.length + 1}`; params.push(req.query.date); }
    if (req.query.entered_by) { sql += ` AND entered_by = $${params.length + 1}`; params.push(req.query.entered_by); }
    if (req.query.entry_type) { sql += ` AND entry_type = $${params.length + 1}`; params.push(req.query.entry_type); }
    if (req.query.category) { sql += ` AND category = $${params.length + 1}`; params.push(req.query.category); }

    sql += ' ORDER BY created_at DESC LIMIT 100';
    const { rows } = await db.query(sql, params);
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /today — today's entries for current user ───────────────────────────

router.get('/today', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    const today = new Date().toISOString().split('T')[0];
    const userName = req.user?.name || req.query.user || '';

    const { rows } = await db.query(
      `SELECT * FROM activity_entries WHERE department_id = $1 AND date = $2 ${userName ? 'AND entered_by = $3' : ''}
       ORDER BY created_at DESC`,
      userName ? [stationId, today, userName] : [stationId, today]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /stats — shift completion stats ─────────────────────────────────────

router.get('/stats', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    const today = new Date().toISOString().split('T')[0];

    const total = await db.query(
      'SELECT COUNT(*) as c FROM activity_entries WHERE department_id = $1 AND date = $2',
      [stationId, today]
    );
    const byType = await db.query(
      'SELECT entry_type, COUNT(*) as c FROM activity_entries WHERE department_id = $1 AND date = $2 GROUP BY entry_type',
      [stationId, today]
    );
    const byUser = await db.query(
      'SELECT entered_by, COUNT(*) as c FROM activity_entries WHERE department_id = $1 AND date = $2 GROUP BY entered_by',
      [stationId, today]
    );

    res.json({
      today: parseInt(total.rows[0].c),
      byType: byType.rows.reduce((acc, r) => { acc[r.entry_type] = parseInt(r.c); return acc; }, {}),
      byUser: byUser.rows.reduce((acc, r) => { acc[r.entered_by] = parseInt(r.c); return acc; }, {}),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST / — create entry ───────────────────────────────────────────────────

router.post('/', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    if (!b.entry_type) return res.status(400).json({ error: 'entry_type required' });

    const { rows } = await db.query(
      `INSERT INTO activity_entries (station_id, entry_type, category, date, shift, entered_by,
        apparatus, result, subject, body, priority, visitor_name, purpose, time_in, time_out,
        gallons, fuel_type, location, property, hydrant_id, event_name, attendees,
        department, incident_type, incident_number, course, hours, instructor, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
       RETURNING *`,
      [
        req.user.department_id, b.entry_type, b.category || '',
        b.date || new Date().toISOString().split('T')[0], b.shift || '',
        b.entered_by || req.user?.name || '',
        b.apparatus || '', b.result || '', b.subject || '', b.body || '',
        b.priority || 'normal', b.visitor_name || '', b.purpose || '',
        b.time_in || '', b.time_out || '',
        b.gallons ? parseFloat(b.gallons) : null, b.fuel_type || '', b.location || '',
        b.property || '', b.hydrant_id || '', b.event_name || '',
        b.attendees ? parseInt(b.attendees) : null,
        b.department || '', b.incident_type || '', b.incident_number || '',
        b.course || '', b.hours ? parseFloat(b.hours) : null, b.instructor || '',
        b.notes || '',
      ]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /:id ──────────────────────────────────────────────────────────────

router.patch('/:id', async (req, res) => {
  await ensureTable();
  try {
    const allowed = ['entry_type', 'category', 'date', 'shift', 'apparatus', 'result',
      'subject', 'body', 'priority', 'visitor_name', 'purpose', 'time_in', 'time_out',
      'gallons', 'fuel_type', 'location', 'property', 'hydrant_id', 'event_name',
      'attendees', 'department', 'incident_type', 'incident_number', 'course', 'hours',
      'instructor', 'notes'];
    const data = {};
    for (const k of allowed) { if (req.body[k] !== undefined) data[k] = req.body[k]; }
    const keys = Object.keys(data);
    if (!keys.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    const values = keys.map(k => data[k]);
    values.push(req.params.id, req.user.department_id);
    const { rows } = await db.query(
      `UPDATE activity_entries SET ${sets} WHERE id = $${values.length - 1} AND department_id = $${values.length} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DELETE /:id ─────────────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  await ensureTable();
  try {
    const { rowCount } = await db.query('DELETE FROM activity_entries WHERE id = $1 AND department_id = $2', [req.params.id, req.user.department_id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
