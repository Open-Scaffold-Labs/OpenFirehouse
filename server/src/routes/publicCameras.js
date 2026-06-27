'use strict';
/**
 * routes/publicCameras.js — Public Camera Integration Shell
 *
 * Architecture for connecting to public safety camera networks:
 *  - NYC Domain Awareness System (DAS): 18,000+ cameras
 *  - LAPD Live: 10,000 cameras
 *  - ALERTCalifornia: 1,000+ wildfire cameras
 *  - Caltrans / DOT traffic cameras
 *  - Municipal and NYCHA cameras
 *
 * This is the connector shell — camera feeds are proxied through here.
 * In production, each camera system has its own API adapter.
 *
 * GET  /api/cameras/nearby          — find cameras near an address/GPS
 * GET  /api/cameras/:id/feed        — get a camera feed URL
 * GET  /api/cameras/systems         — list configured camera systems
 * POST /api/cameras/search          — search by area/type
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS camera_systems (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'municipal',
    api_endpoint TEXT DEFAULT '',
    api_key_encrypted TEXT DEFAULT '',
    coverage_area TEXT DEFAULT '',
    camera_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'configured',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS camera_feeds (
    id SERIAL PRIMARY KEY,
    system_id INTEGER REFERENCES camera_systems(id),
    camera_id TEXT NOT NULL,
    name TEXT DEFAULT '',
    latitude DOUBLE PRECISION DEFAULT NULL,
    longitude DOUBLE PRECISION DEFAULT NULL,
    address TEXT DEFAULT '',
    type TEXT DEFAULT 'fixed',
    feed_url TEXT DEFAULT '',
    thumbnail_url TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    last_accessed TIMESTAMPTZ DEFAULT NULL,
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS camera_access_log (
    id SERIAL PRIMARY KEY,
    camera_id INTEGER REFERENCES camera_feeds(id),
    incident_id INTEGER DEFAULT NULL,
    accessed_by TEXT DEFAULT '',
    access_reason TEXT DEFAULT '',
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ DEFAULT NULL
  );
`;

let initialized = false;
async function ensureTable() {
  if (initialized) return;
  try { await db.query(INIT_SQL); initialized = true; } catch (e) { console.error('cameras init:', e.message); }
}

// ─── GET /systems — list configured camera systems ───────────────────────────

router.get('/systems', async (req, res) => {
  await ensureTable();
  try {
    const { rows } = await db.query('SELECT id, name, type, coverage_area, camera_count, status FROM camera_systems ORDER BY name');
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /nearby — find cameras near a GPS coordinate ────────────────────────

router.get('/nearby', async (req, res) => {
  await ensureTable();
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius) || 0.01; // ~1km default

    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

    const { rows } = await db.query(
      `SELECT cf.*, cs.name as system_name, cs.type as system_type
       FROM camera_feeds cf
       JOIN camera_systems cs ON cf.system_id = cs.id
       WHERE cf.status = 'active'
         AND cf.latitude BETWEEN $1 AND $2
         AND cf.longitude BETWEEN $3 AND $4
       ORDER BY ABS(cf.latitude - $5) + ABS(cf.longitude - $6)
       LIMIT 10`,
      [lat - radius, lat + radius, lng - radius, lng + radius, lat, lng]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /:id/feed — get camera feed URL (with access logging) ───────────────

router.get('/:id/feed', async (req, res) => {
  await ensureTable();
  try {
    const { rows } = await db.query('SELECT * FROM camera_feeds WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Camera not found' });

    // Log access
    await db.query(
      `INSERT INTO camera_access_log (camera_id, incident_id, accessed_by, access_reason)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, req.query.incident_id || null, req.user?.name || 'Unknown', req.query.reason || 'Incident response']
    );

    // Update last accessed
    await db.query('UPDATE camera_feeds SET last_accessed = NOW() WHERE id = $1', [req.params.id]);

    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /search — search cameras by area ───────────────────────────────────

router.post('/search', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    let sql = `SELECT cf.*, cs.name as system_name FROM camera_feeds cf JOIN camera_systems cs ON cf.system_id = cs.id WHERE cf.status = 'active'`;
    const params = [];

    if (b.address) {
      params.push(`%${b.address}%`);
      sql += ` AND cf.address ILIKE $${params.length}`;
    }
    if (b.type) {
      params.push(b.type);
      sql += ` AND cf.type = $${params.length}`;
    }
    if (b.system_id) {
      params.push(b.system_id);
      sql += ` AND cf.system_id = $${params.length}`;
    }

    sql += ' ORDER BY cf.name LIMIT 20';
    const { rows } = await db.query(sql, params);
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
