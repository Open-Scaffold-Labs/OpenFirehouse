'use strict';
/**
 * routes/knoxKeys.js — Knox Box & Key Management
 *
 * GET    /api/knox-keys                — list all Knox boxes for the station
 * GET    /api/knox-keys/stats          — summary stats (totals, overdue inspections, etc.)
 * GET    /api/knox-keys/:id            — get one Knox box with its access log
 * POST   /api/knox-keys                — create a new Knox box
 * PATCH  /api/knox-keys/:id            — update a Knox box
 * DELETE /api/knox-keys/:id            — remove a Knox box
 * POST   /api/knox-keys/:id/access     — log a key access event
 * GET    /api/knox-keys/:id/access     — get access log for a box
 * POST   /api/knox-keys/:id/inspection — log an inspection
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── Schema (auto-create tables) ─────────────────────────────────────────────

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS knox_boxes (
    id SERIAL PRIMARY KEY,
    station_id INTEGER DEFAULT 1,
    department_id INTEGER,
    box_number TEXT NOT NULL,
    box_type TEXT DEFAULT 'wall_mount',
    status TEXT DEFAULT 'active',
    address TEXT DEFAULT '',
    location_detail TEXT DEFAULT '',
    property_name TEXT DEFAULT '',
    property_type TEXT DEFAULT '',
    pre_plan_id INTEGER DEFAULT NULL,
    installed_date TEXT DEFAULT NULL,
    serial_number TEXT DEFAULT '',
    contents TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    last_inspection_date TEXT DEFAULT NULL,
    next_inspection_due TEXT DEFAULT NULL,
    inspected_by TEXT DEFAULT '',
    inspection_result TEXT DEFAULT '',
    latitude DOUBLE PRECISION DEFAULT NULL,
    longitude DOUBLE PRECISION DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS knox_access_log (
    id SERIAL PRIMARY KEY,
    knox_box_id INTEGER NOT NULL REFERENCES knox_boxes(id) ON DELETE CASCADE,
    station_id INTEGER DEFAULT 1,
    department_id INTEGER,
    accessed_by TEXT NOT NULL,
    access_type TEXT DEFAULT 'key_access',
    incident_number TEXT DEFAULT '',
    reason TEXT DEFAULT '',
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    returned_at TIMESTAMPTZ DEFAULT NULL,
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS knox_inspections (
    id SERIAL PRIMARY KEY,
    knox_box_id INTEGER NOT NULL REFERENCES knox_boxes(id) ON DELETE CASCADE,
    station_id INTEGER DEFAULT 1,
    department_id INTEGER,
    inspected_by TEXT NOT NULL,
    inspection_date TEXT NOT NULL,
    result TEXT DEFAULT 'pass',
    box_condition TEXT DEFAULT 'good',
    lock_functional BOOLEAN DEFAULT true,
    contents_verified BOOLEAN DEFAULT true,
    weatherproofing TEXT DEFAULT 'good',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

let initialized = false;
async function ensureTables() {
  if (initialized) return;
  try {
    await db.query(INIT_SQL);
    // department_id is in the CREATEs above, but the sync trigger (0005 /
    // applyDepartmentExpand) only attaches to tables that existed at initDb —
    // attach it here for these lazily-created tables so department_id is filled
    // on every insert and the department-scoped reads work.
    await db.ensureDeptSyncTrigger('knox_boxes', 'knox_access_log', 'knox_inspections');
    initialized = true;
  } catch (e) { console.error('Knox tables init error:', e.message); }
}

// ─── GET / — list all Knox boxes ─────────────────────────────────────────────

router.get('/', async (req, res) => {
  await ensureTables();
  try {
    const stationId = req.user.department_id;
    const { rows } = await db.query(
      `SELECT kb.*,
        (SELECT COUNT(*) FROM knox_access_log al WHERE al.knox_box_id = kb.id) as access_count,
        (SELECT COUNT(*) FROM knox_inspections ki WHERE ki.knox_box_id = kb.id) as inspection_count
       FROM knox_boxes kb
       WHERE kb.department_id = $1
       ORDER BY kb.box_number ASC`,
      [stationId]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /stats ──────────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  await ensureTables();
  try {
    const stationId = req.user.department_id;
    const total     = await db.query('SELECT COUNT(*) as c FROM knox_boxes WHERE department_id = $1', [stationId]);
    const active    = await db.query("SELECT COUNT(*) as c FROM knox_boxes WHERE department_id = $1 AND status = 'active'", [stationId]);
    const overdue   = await db.query("SELECT COUNT(*) as c FROM knox_boxes WHERE department_id = $1 AND next_inspection_due IS NOT NULL AND next_inspection_due < CURRENT_DATE::TEXT", [stationId]);
    const accesses  = await db.query('SELECT COUNT(*) as c FROM knox_access_log WHERE department_id = $1', [stationId]);
    const unreturned = await db.query("SELECT COUNT(*) as c FROM knox_access_log WHERE department_id = $1 AND returned_at IS NULL AND access_type = 'key_checkout'", [stationId]);
    res.json({
      total: parseInt(total.rows[0].c),
      active: parseInt(active.rows[0].c),
      overdueInspections: parseInt(overdue.rows[0].c),
      totalAccesses: parseInt(accesses.rows[0].c),
      unreturnedKeys: parseInt(unreturned.rows[0].c),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /:id ────────────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  await ensureTables();
  try {
    const { rows } = await db.query('SELECT * FROM knox_boxes WHERE id = $1 AND department_id = $2', [req.params.id, req.user.department_id]);
    if (!rows.length) return res.status(404).json({ error: 'Knox box not found' });
    // Include recent access log (station-scoped)
    const log = await db.query('SELECT * FROM knox_access_log WHERE knox_box_id = $1 AND department_id = $2 ORDER BY accessed_at DESC LIMIT 20', [req.params.id, req.user.department_id]);
    const inspections = await db.query('SELECT * FROM knox_inspections WHERE knox_box_id = $1 AND department_id = $2 ORDER BY inspection_date DESC LIMIT 10', [req.params.id, req.user.department_id]);
    res.json({ data: { ...rows[0], accessLog: log.rows, inspections: inspections.rows } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST / — create ─────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  await ensureTables();
  try {
    const b = req.body;
    if (!b.box_number) return res.status(400).json({ error: 'box_number is required' });
    const { rows } = await db.query(
      `INSERT INTO knox_boxes (station_id, box_number, box_type, status, address, location_detail,
        property_name, property_type, pre_plan_id, installed_date, serial_number, contents, notes,
        last_inspection_date, next_inspection_due, inspected_by, inspection_result, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        req.user.department_id, b.box_number, b.box_type || 'wall_mount', b.status || 'active',
        b.address || '', b.location_detail || '', b.property_name || '', b.property_type || '',
        b.pre_plan_id || null, b.installed_date || null, b.serial_number || '', b.contents || '',
        b.notes || '', b.last_inspection_date || null, b.next_inspection_due || null,
        b.inspected_by || '', b.inspection_result || '', b.latitude || null, b.longitude || null,
      ]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /:id — update ─────────────────────────────────────────────────────

router.patch('/:id', async (req, res) => {
  await ensureTables();
  try {
    const stationId = req.user.department_id;
    const existing = await db.query('SELECT id FROM knox_boxes WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    const allowed = [
      'box_number', 'box_type', 'status', 'address', 'location_detail', 'property_name',
      'property_type', 'pre_plan_id', 'installed_date', 'serial_number', 'contents', 'notes',
      'last_inspection_date', 'next_inspection_due', 'inspected_by', 'inspection_result',
      'latitude', 'longitude',
    ];
    const data = {};
    for (const k of allowed) { if (req.body[k] !== undefined) data[k] = req.body[k]; }
    const keys = Object.keys(data);
    if (!keys.length) return res.status(400).json({ error: 'No valid fields' });

    const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    const values = keys.map(k => data[k]);
    values.push(req.params.id, stationId);
    const { rows } = await db.query(
      `UPDATE knox_boxes SET ${sets}, updated_at = NOW() WHERE id = $${values.length - 1} AND department_id = $${values.length} RETURNING *`,
      values
    );
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DELETE /:id ─────────────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  await ensureTables();
  try {
    const { rowCount } = await db.query('DELETE FROM knox_boxes WHERE id = $1 AND department_id = $2', [req.params.id, req.user.department_id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /:id/access — log key access ───────────────────────────────────────

router.post('/:id/access', async (req, res) => {
  await ensureTables();
  try {
    const b = req.body;
    if (!b.accessed_by) return res.status(400).json({ error: 'accessed_by is required' });
    const stationId = req.user.department_id;
    // Verify the box belongs to the caller's station before logging against it
    const box = await db.query('SELECT id FROM knox_boxes WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    if (!box.rows.length) return res.status(404).json({ error: 'Knox box not found' });
    const { rows } = await db.query(
      `INSERT INTO knox_access_log (knox_box_id, station_id, accessed_by, access_type, incident_number, reason, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, stationId, b.accessed_by, b.access_type || 'key_access',
       b.incident_number || '', b.reason || '', b.notes || '']
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /:id/access — access log ────────────────────────────────────────────

router.get('/:id/access', async (req, res) => {
  await ensureTables();
  try {
    const { rows } = await db.query(
      'SELECT * FROM knox_access_log WHERE knox_box_id = $1 AND department_id = $2 ORDER BY accessed_at DESC',
      [req.params.id, req.user.department_id]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /:id/inspection — log inspection ───────────────────────────────────

router.post('/:id/inspection', async (req, res) => {
  await ensureTables();
  try {
    const b = req.body;
    if (!b.inspected_by || !b.inspection_date) return res.status(400).json({ error: 'inspected_by and inspection_date required' });
    const stationId = req.user.department_id;
    // Verify the box belongs to the caller's station before logging an inspection
    const box = await db.query('SELECT id FROM knox_boxes WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    if (!box.rows.length) return res.status(404).json({ error: 'Knox box not found' });
    const { rows } = await db.query(
      `INSERT INTO knox_inspections (knox_box_id, station_id, inspected_by, inspection_date, result, box_condition,
        lock_functional, contents_verified, weatherproofing, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, stationId, b.inspected_by, b.inspection_date,
       b.result || 'pass', b.box_condition || 'good', b.lock_functional !== false,
       b.contents_verified !== false, b.weatherproofing || 'good', b.notes || '']
    );
    // Update the box's inspection fields (station-scoped)
    await db.query(
      `UPDATE knox_boxes SET last_inspection_date = $1, inspected_by = $2, inspection_result = $3,
        next_inspection_due = (DATE($1) + INTERVAL '12 months')::TEXT, updated_at = NOW()
       WHERE id = $4 AND department_id = $5`,
      [b.inspection_date, b.inspected_by, b.result || 'pass', req.params.id, stationId]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
