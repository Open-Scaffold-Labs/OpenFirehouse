'use strict';
/**
 * routes/liveShare.js — Live Apparatus Tracking Share Links
 *
 * POST   /api/live-share          — create a new share link (auth required)
 * GET    /api/live-share/:token   — get share data (PUBLIC — no auth)
 * PATCH  /api/live-share/:token   — update position (auth required)
 * DELETE /api/live-share/:token   — expire/close a share link (auth required)
 * GET    /api/live-share          — list active shares for this station (auth required)
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../db');

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS live_shares (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    station_id INTEGER DEFAULT 1,
    unit_designation TEXT NOT NULL,
    unit_type TEXT DEFAULT '',
    crew_names TEXT DEFAULT '',
    crew_count INTEGER DEFAULT 0,
    radio_channel TEXT DEFAULT '',
    department_name TEXT DEFAULT '',
    department_phone TEXT DEFAULT '',
    destination_address TEXT DEFAULT '',
    destination_department TEXT DEFAULT '',
    incident_number TEXT DEFAULT '',
    latitude DOUBLE PRECISION DEFAULT NULL,
    longitude DOUBLE PRECISION DEFAULT NULL,
    speed_mph DOUBLE PRECISION DEFAULT NULL,
    heading DOUBLE PRECISION DEFAULT NULL,
    eta_minutes INTEGER DEFAULT NULL,
    status TEXT DEFAULT 'responding',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '4 hours',
    closed_at TIMESTAMPTZ DEFAULT NULL
  );
`;

let initialized = false;
async function ensureTable() {
  if (initialized) return;
  try { await db.query(INIT_SQL); initialized = true; } catch (e) { console.error('live_shares init:', e.message); }
}

function genToken() {
  return crypto.randomBytes(4).toString('hex'); // 8-char hex like "a8f3k2b1"
}

// ─── POST / — create share link (auth required) ─────────────────────────────

router.post('/', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    if (!b.unit_designation) return res.status(400).json({ error: 'unit_designation required' });

    const token = genToken();
    const stationId = req.user.department_id;

    const { rows } = await db.query(
      `INSERT INTO live_shares (token, station_id, unit_designation, unit_type, crew_names, crew_count,
        radio_channel, department_name, department_phone, destination_address, destination_department,
        incident_number, latitude, longitude, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [token, stationId, b.unit_designation, b.unit_type || '', b.crew_names || '',
       b.crew_count || 0, b.radio_channel || '', b.department_name || 'Maplewood VFD',
       b.department_phone || '', b.destination_address || '', b.destination_department || '',
       b.incident_number || '', b.latitude || null, b.longitude || null,
       'responding', b.notes || '']
    );

    const share = rows[0];
    const baseUrl = process.env.PUBLIC_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (req.headers.origin || 'https://open-firehouse-client.vercel.app');

    res.status(201).json({
      data: share,
      shareUrl: `${baseUrl}/track/${token}`,
      token,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /:token — public tracking data (NO AUTH) ───────────────────────────

router.get('/:token', async (req, res) => {
  await ensureTable();
  try {
    const { rows } = await db.query(
      `SELECT * FROM live_shares WHERE token = $1 AND closed_at IS NULL AND expires_at > NOW()`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Share link expired or not found' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /:token — update position (auth required) ─────────────────────────

router.patch('/:token', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    const allowed = ['latitude', 'longitude', 'speed_mph', 'heading', 'eta_minutes', 'status', 'notes', 'crew_names', 'crew_count'];
    const data = {};
    for (const k of allowed) { if (b[k] !== undefined) data[k] = b[k]; }
    const keys = Object.keys(data);
    if (!keys.length) return res.status(400).json({ error: 'No valid fields' });

    const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    const values = keys.map(k => data[k]);
    values.push(req.params.token, req.user.department_id);

    const { rows } = await db.query(
      `UPDATE live_shares SET ${sets}, updated_at = NOW() WHERE token = $${values.length - 1} AND station_id = $${values.length} AND closed_at IS NULL RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Share not found or closed' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DELETE /:token — close/expire share ─────────────────────────────────────

router.delete('/:token', async (req, res) => {
  await ensureTable();
  try {
    const { rows } = await db.query(
      `UPDATE live_shares SET closed_at = NOW(), status = 'closed' WHERE token = $1 AND station_id = $2 RETURNING *`,
      [req.params.token, req.user.department_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Share not found' });
    res.json({ data: rows[0], closed: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET / — list active shares (auth required) ─────────────────────────────

router.get('/', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    const { rows } = await db.query(
      `SELECT * FROM live_shares WHERE station_id = $1 AND closed_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC`,
      [stationId]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
