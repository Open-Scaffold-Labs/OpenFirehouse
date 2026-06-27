'use strict';
/**
 * routes/ng911.js — Next Generation 911 Ingest & Display
 *
 * Accepts NG911 i3-format call data from PSAPs (Public Safety Answering Points):
 *  - Caller GPS location (verified via ECRF/LVF)
 *  - Call type and priority
 *  - Multimedia attachments (photos, video, text messages from caller)
 *  - Supplemental location data (building name, floor, room)
 *  - Automatic incident creation from NG911 data
 *
 * POST   /api/ng911/call         — ingest an NG911 call (auth required — mounted
 *                                  behind requireAuth in index.js; a true PSAP
 *                                  webhook would need an API-key→station mapping
 *                                  like radioIngest.js before moving it pre-auth)
 * GET    /api/ng911/calls        — list recent NG911 calls (auth required)
 * GET    /api/ng911/calls/:id    — get one call with media (auth required)
 * POST   /api/ng911/calls/:id/create-incident — create incident from NG911 call (auth)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS ng911_calls (
    id SERIAL PRIMARY KEY,
    station_id INTEGER DEFAULT 1,
    department_id INTEGER,
    call_id TEXT DEFAULT '',
    call_type TEXT DEFAULT 'fire',
    priority TEXT DEFAULT 'emergency',
    caller_name TEXT DEFAULT '',
    caller_phone TEXT DEFAULT '',
    caller_latitude DOUBLE PRECISION DEFAULT NULL,
    caller_longitude DOUBLE PRECISION DEFAULT NULL,
    caller_accuracy_meters DOUBLE PRECISION DEFAULT NULL,
    location_method TEXT DEFAULT 'gps',
    verified_address TEXT DEFAULT '',
    verified_city TEXT DEFAULT '',
    verified_state TEXT DEFAULT '',
    verified_zip TEXT DEFAULT '',
    building_name TEXT DEFAULT '',
    floor TEXT DEFAULT '',
    room TEXT DEFAULT '',
    supplemental_data JSONB DEFAULT '{}',
    call_narrative TEXT DEFAULT '',
    caller_text_messages JSONB DEFAULT '[]',
    media_urls JSONB DEFAULT '[]',
    psap_name TEXT DEFAULT '',
    psap_id TEXT DEFAULT '',
    ani TEXT DEFAULT '',
    ali TEXT DEFAULT '',
    esn TEXT DEFAULT '',
    incident_created BOOLEAN DEFAULT false,
    incident_id INTEGER DEFAULT NULL,
    status TEXT DEFAULT 'new',
    received_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

let initialized = false;
async function ensureTable() {
  if (initialized) return;
  try { await db.query(INIT_SQL); await db.ensureDeptSyncTrigger('ng911_calls'); initialized = true; } catch (e) { console.error('ng911_calls init:', e.message); }
}

// ─── POST /call — ingest NG911 call (authed; see header note) ────────────────

router.post('/call', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    const stationId = req.user.department_id;
    const { rows } = await db.query(
      `INSERT INTO ng911_calls (station_id, call_id, call_type, priority, caller_name, caller_phone,
        caller_latitude, caller_longitude, caller_accuracy_meters, location_method,
        verified_address, verified_city, verified_state, verified_zip,
        building_name, floor, room, supplemental_data, call_narrative,
        caller_text_messages, media_urls, psap_name, psap_id, ani, ali, esn, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
       RETURNING *`,
      [
        stationId, b.call_id || `NG911-${Date.now()}`,
        b.call_type || 'fire', b.priority || 'emergency',
        b.caller_name || '', b.caller_phone || b.ani || '',
        b.caller_latitude || b.latitude || null,
        b.caller_longitude || b.longitude || null,
        b.caller_accuracy_meters || b.accuracy || null,
        b.location_method || 'gps',
        b.verified_address || b.address || '',
        b.verified_city || b.city || '',
        b.verified_state || b.state || '',
        b.verified_zip || b.zip || '',
        b.building_name || '', b.floor || '', b.room || '',
        JSON.stringify(b.supplemental_data || {}),
        b.call_narrative || b.narrative || '',
        JSON.stringify(b.caller_text_messages || b.texts || []),
        JSON.stringify(b.media_urls || b.media || []),
        b.psap_name || '', b.psap_id || '',
        b.ani || '', b.ali || '', b.esn || '',
        'new',
      ]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /calls — list recent calls (auth) ───────────────────────────────────

router.get('/calls', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    const { rows } = await db.query(
      `SELECT * FROM ng911_calls WHERE department_id = $1 ORDER BY received_at DESC LIMIT 50`,
      [stationId]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /calls/:id — get one call with full detail ──────────────────────────

router.get('/calls/:id', async (req, res) => {
  await ensureTable();
  try {
    const { rows } = await db.query('SELECT * FROM ng911_calls WHERE id = $1 AND department_id = $2', [req.params.id, req.user.department_id]);
    if (!rows.length) return res.status(404).json({ error: 'Call not found' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /calls/:id/create-incident — auto-create incident from call ────────

router.post('/calls/:id/create-incident', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    const { rows: calls } = await db.query('SELECT * FROM ng911_calls WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    if (!calls.length) return res.status(404).json({ error: 'Call not found' });
    const call = calls[0];

    if (call.incident_created) return res.status(400).json({ error: 'Incident already created from this call' });

    // Create incident from NG911 data
    const address = [call.verified_address, call.verified_city, call.verified_state].filter(Boolean).join(', ');
    const { rows: incidents } = await db.query(
      `INSERT INTO incidents (station_id, date, time, type, address, latitude, longitude, status, notes, "createdAt")
       VALUES ($1, CURRENT_DATE::TEXT, CURRENT_TIME::TEXT, $2, $3, $4, $5, 'Active', $6, NOW())
       RETURNING *`,
      [stationId, call.call_type || 'Fire', address, call.caller_latitude, call.caller_longitude,
       `NG911 Call: ${call.call_narrative || ''}\nCaller: ${call.caller_name || 'Unknown'} (${call.caller_phone || 'Unknown'})\n${call.building_name ? 'Building: ' + call.building_name : ''}${call.floor ? ', Floor: ' + call.floor : ''}${call.room ? ', Room: ' + call.room : ''}`]
    );

    // Mark call as processed
    await db.query(
      `UPDATE ng911_calls SET incident_created = true, incident_id = $1, status = 'dispatched', processed_at = NOW() WHERE id = $2 AND department_id = $3`,
      [incidents[0].id, req.params.id, stationId]
    );

    res.status(201).json({ data: incidents[0], call: { ...call, incident_created: true, incident_id: incidents[0].id } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
