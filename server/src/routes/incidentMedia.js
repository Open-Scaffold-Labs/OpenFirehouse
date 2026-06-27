'use strict';
/**
 * routes/incidentMedia.js — Incident Scene Media (Photos/Video)
 *
 * Handles photo/video uploads from the fireground. Anyone with the
 * incident upload token can submit media — no login required.
 *
 * POST   /api/incident-media/upload/:token  — PUBLIC upload (no auth)
 * GET    /api/incident-media/:incidentId     — list media for an incident (auth)
 * POST   /api/incident-media/token           — generate upload token (auth)
 * DELETE /api/incident-media/:id             — delete a media item (auth)
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');

// Ensure upload directory exists
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'incident-media');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) {}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|heic|heif/i;
    const ext = allowed.test(path.extname(file.originalname));
    const mime = allowed.test(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    cb(null, ext || mime);
  },
});

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS incident_media (
    id SERIAL PRIMARY KEY,
    station_id INTEGER DEFAULT 1,
    incident_id INTEGER DEFAULT NULL,
    upload_token TEXT DEFAULT '',
    filename TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    uploaded_by TEXT DEFAULT '',
    caption TEXT DEFAULT '',
    latitude DOUBLE PRECISION DEFAULT NULL,
    longitude DOUBLE PRECISION DEFAULT NULL,
    phase TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS incident_media_tokens (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    station_id INTEGER DEFAULT 1,
    incident_id INTEGER DEFAULT NULL,
    incident_address TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '12 hours'
  );
`;

let initialized = false;
async function ensureTable() {
  if (initialized) return;
  try { await db.query(INIT_SQL); initialized = true; } catch (e) { console.error('incident_media init:', e.message); }
}

// ─── POST /token — generate upload token (auth required) ─────────────────────

router.post('/token', async (req, res) => {
  await ensureTable();
  try {
    const token = crypto.randomBytes(6).toString('hex');
    const b = req.body;
    await db.query(
      `INSERT INTO incident_media_tokens (token, station_id, incident_id, incident_address, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [token, req.user.department_id, b.incident_id || null, b.incident_address || '', b.created_by || req.user?.name || '']
    );

    const baseUrl = req.headers.origin || 'https://open-firehouse-client.vercel.app';
    res.status(201).json({
      token,
      uploadUrl: `${baseUrl}/upload/${token}`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /upload/:token — PUBLIC photo upload (no auth) ─────────────────────

router.post('/upload/:token', upload.single('photo'), async (req, res) => {
  await ensureTable();
  try {
    // Validate token
    const { rows: tokens } = await db.query(
      `SELECT * FROM incident_media_tokens WHERE token = $1 AND expires_at > NOW()`,
      [req.params.token]
    );
    if (!tokens.length) return res.status(403).json({ error: 'Invalid or expired upload token' });
    const tokenData = tokens[0];

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const b = req.body;
    const { rows } = await db.query(
      `INSERT INTO incident_media (station_id, incident_id, upload_token, filename, original_name,
        mime_type, file_size, uploaded_by, caption, latitude, longitude, phase, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [tokenData.station_id, tokenData.incident_id, req.params.token,
       req.file.filename, req.file.originalname, req.file.mimetype, req.file.size,
       b.uploaded_by || 'Scene Personnel', b.caption || '',
       parseFloat(b.latitude) || null, parseFloat(b.longitude) || null,
       b.phase || '', b.tags || '']
    );

    res.status(201).json({ data: rows[0], message: 'Photo uploaded successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /:incidentId — list media for incident (auth required) ──────────────

router.get('/:incidentId', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    const { rows } = await db.query(
      `SELECT * FROM incident_media WHERE station_id = $1 AND incident_id = $2
       ORDER BY created_at DESC`,
      [stationId, req.params.incidentId]
    );
    // Build URLs for serving files
    const media = rows.map(r => ({
      ...r,
      url: `/uploads/incident-media/${r.filename}`,
    }));
    res.json({ data: media });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DELETE /:id — delete media item (auth required) ─────────────────────────

router.delete('/:id', async (req, res) => {
  await ensureTable();
  try {
    const { rows } = await db.query('SELECT filename FROM incident_media WHERE id = $1 AND station_id = $2', [req.params.id, req.user.department_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    // Delete file
    const filepath = path.join(UPLOAD_DIR, rows[0].filename);
    try { fs.unlinkSync(filepath); } catch (_) {}

    await db.query('DELETE FROM incident_media WHERE id = $1 AND station_id = $2', [req.params.id, req.user.department_id]);
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
