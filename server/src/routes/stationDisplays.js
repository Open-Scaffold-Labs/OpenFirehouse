'use strict';
/**
 * routes/stationDisplays.js — station-display DEVICE PAIRING (Phase 2.3 / migration 0074).
 *
 * Market model (2026-07-23 pass, unanimous): a wall display binds to ONE station via a
 * single-use pairing code and then renders only that station's data; identity is set at
 * PAIRING time, never inferred. This upgrades the shared per-station TV PIN to a
 * registered, revocable per-DEVICE model.
 *
 *   chief  POST   /api/station-displays          → issue a pairing code for a station (authed)
 *   any    GET    /api/station-displays          → list this dept's displays (authed, no secrets)
 *   chief  POST   /api/station-displays/:id/revoke → revoke a device (authed)
 *   PUBLIC POST   /api/station-displays/pair      → redeem a code → { device_token, station }
 *
 * Security: the public /pair redeem runs with NO app.department_id GUC, so it goes through
 * the SECURITY DEFINER fn of_redeem_station_pairing (owner-side, single-use, authorized by
 * the hashed code) — the exact of_redeem_member_invite pattern (0016). Secrets are hashed
 * at rest (sha256); the plaintext code (to the chief) and device token (to the display) are
 * each shown ONCE and never stored. ⚠️ Public-auth/DEFINER surface — flagged for Dale review.
 */

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireChief } = require('../middleware/requireRole');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const PAIRING_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ── Authenticated (chief/officer) router — mounted AFTER requireAuth ──────────
const authedRouter = express.Router();

// POST / — chief issues a single-use pairing code for one of THEIR stations.
authedRouter.post('/', requireChief, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const { station_id, label } = req.body || {};
    const st = await pool.query('SELECT id, name FROM stations WHERE id = $1 AND department_id = $2', [Number(station_id), deptId]);
    if (!st.rows.length) return res.status(400).json({ error: 'station_id must be a station in your department', code: 'BAD_STATION' });

    const code = crypto.randomBytes(9).toString('base64url'); // ~72 bits, shown ONCE
    const expires = new Date(Date.now() + PAIRING_TTL_MS);
    const r = await pool.query(
      `INSERT INTO station_displays (department_id, station_id, label, status, pairing_code_hash, pairing_expires_at)
       VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING id, station_id, label`,
      [deptId, st.rows[0].id, String(label || '').slice(0, 80), sha256(code), expires]);
    res.status(201).json({ data: {
      id: r.rows[0].id, station_id: r.rows[0].station_id, station_name: st.rows[0].name,
      label: r.rows[0].label, pairing_code: code, pairing_expires_at: expires.toISOString(),
    } });
  } catch (err) {
    console.error('POST /api/station-displays error:', err);
    res.status(500).json({ error: 'Failed to create pairing' });
  }
});

// GET / — list the dept's displays (no secrets ever leave the server).
authedRouter.get('/', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const r = await pool.query(
      `SELECT sd.id, sd.station_id, s.name AS station_name, sd.label, sd.status,
              sd.paired_at, sd.last_seen_at, sd.created_at,
              (sd.status = 'pending' AND sd.pairing_expires_at > now()) AS pairing_active
         FROM station_displays sd
         LEFT JOIN stations s ON s.id = sd.station_id
        WHERE sd.department_id = $1
        ORDER BY s.name, sd.created_at DESC`, [deptId]);
    res.set('Cache-Control', 'no-store');
    res.json({ data: r.rows });
  } catch (err) {
    console.error('GET /api/station-displays error:', err);
    res.status(500).json({ error: 'Failed to list displays' });
  }
});

// POST /:id/revoke — chief revokes a device (kills its token + any pending code).
authedRouter.post('/:id/revoke', requireChief, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const r = await pool.query(
      `UPDATE station_displays SET status = 'revoked', device_token_hash = NULL, pairing_code_hash = NULL
        WHERE id = $1 AND department_id = $2 RETURNING id`, [Number(req.params.id), deptId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Display not found' });
    res.json({ data: { id: r.rows[0].id, status: 'revoked' } });
  } catch (err) {
    console.error('POST /api/station-displays/:id/revoke error:', err);
    res.status(500).json({ error: 'Failed to revoke display' });
  }
});

// ── Public router — mounted BEFORE requireAuth (the display is unauthenticated) ──
const publicRouter = express.Router();

// POST /pair — a display redeems its pairing code for a persistent device token.
// Single-use + expiry enforced atomically inside the DEFINER fn. We never reveal
// WHY a code failed (invalid vs used vs expired) — one generic 400.
publicRouter.post('/pair', async (req, res) => {
  try {
    const code = req.body && req.body.code;
    if (!code || typeof code !== 'string' || code.length > 400) return res.status(400).json({ error: 'code required' });
    const deviceToken = crypto.randomBytes(32).toString('base64url'); // ~256 bits, shown ONCE
    let row;
    try {
      const r = await pool.query('SELECT * FROM of_redeem_station_pairing($1, $2)', [sha256(code), sha256(deviceToken)]);
      row = r.rows[0];
    } catch (e) {
      return res.status(400).json({ error: 'Invalid or expired pairing code', code: 'PAIRING_INVALID' });
    }
    if (!row) return res.status(400).json({ error: 'Invalid or expired pairing code', code: 'PAIRING_INVALID' });
    res.json({ data: { device_token: deviceToken, department_id: row.dept_id, station_id: row.stn_id, label: row.display_label || '' } });
  } catch (err) {
    console.error('POST /api/station-displays/pair error:', err);
    res.status(500).json({ error: 'Failed to pair' });
  }
});

// Resolve a device token (used by tvData) → { department_id, station_id } or null.
// Runs the DEFINER resolve fn (touches last_seen); a revoked/unknown token → null.
async function resolveDeviceToken(deviceToken) {
  if (!deviceToken || typeof deviceToken !== 'string') return null;
  try {
    const r = await pool.query('SELECT * FROM of_resolve_station_display($1)', [sha256(deviceToken)]);
    return r.rows[0] ? { department_id: r.rows[0].dept_id, station_id: r.rows[0].stn_id } : null;
  } catch { return null; }
}

module.exports = { authedRouter, publicRouter, resolveDeviceToken };
