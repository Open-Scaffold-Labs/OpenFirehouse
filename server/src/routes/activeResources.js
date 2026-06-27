'use strict';
/**
 * routes/activeResources.js — Unified Resource Tracking for Incident Command
 *
 * Aggregates ALL resources responding to an incident across all agencies:
 *  - Own apparatus (from units table / Command Board)
 *  - Mutual aid units (from mutual aid agreements + live shares)
 *  - EMS / ambulances
 *  - Law enforcement
 *  - Utility crews
 *  - Other (hazmat teams, investigators, etc.)
 *
 * GET    /api/active-resources          — all resources for the active incident
 * POST   /api/active-resources          — add a resource (any agency/type)
 * PATCH  /api/active-resources/:id      — update position, status, ETA
 * DELETE /api/active-resources/:id      — remove a resource
 * POST   /api/active-resources/request  — request mutual aid (creates resource + live share)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS active_resources (
    id SERIAL PRIMARY KEY,
    station_id INTEGER DEFAULT 1,
    department_id INTEGER,
    incident_id INTEGER DEFAULT NULL,
    resource_type TEXT DEFAULT 'fire',
    agency TEXT DEFAULT '',
    unit_designation TEXT NOT NULL,
    unit_type TEXT DEFAULT '',
    status TEXT DEFAULT 'dispatched',
    latitude DOUBLE PRECISION DEFAULT NULL,
    longitude DOUBLE PRECISION DEFAULT NULL,
    speed_mph DOUBLE PRECISION DEFAULT NULL,
    heading DOUBLE PRECISION DEFAULT NULL,
    eta_minutes INTEGER DEFAULT NULL,
    crew_count INTEGER DEFAULT 0,
    crew_names TEXT DEFAULT '',
    officer_name TEXT DEFAULT '',
    radio_channel TEXT DEFAULT '',
    contact_phone TEXT DEFAULT '',
    live_share_token TEXT DEFAULT NULL,
    mutual_aid_agreement_id INTEGER DEFAULT NULL,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

let initialized = false;
async function ensureTable() {
  if (initialized) return;
  try { await db.query(INIT_SQL); await db.ensureDeptSyncTrigger('active_resources'); initialized = true; } catch (e) { console.error('active_resources init:', e.message); }
}

// ─── GET / — all active resources ────────────────────────────────────────────

router.get('/', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    const { rows } = await db.query(
      `SELECT ar.*, maa.partner_agency as agreement_partner, maa.partner_phone as agreement_phone
       FROM active_resources ar
       LEFT JOIN mutual_aid_agreements maa ON ar.mutual_aid_agreement_id = maa.id
       WHERE ar.department_id = $1 AND ar.status != 'cleared'
       ORDER BY ar.resource_type, ar.created_at`,
      [stationId]
    );

    // Also pull any active live shares as inbound resources
    let liveShares = [];
    try {
      const ls = await db.query(
        `SELECT * FROM live_shares WHERE station_id = $1 AND closed_at IS NULL AND expires_at > NOW()`,
        [stationId]
      );
      liveShares = ls.rows;
    } catch (_) {}

    res.json({
      data: rows,
      liveShares,
      summary: {
        total: rows.length,
        fire: rows.filter(r => r.resource_type === 'fire').length,
        ems: rows.filter(r => r.resource_type === 'ems').length,
        law: rows.filter(r => r.resource_type === 'law').length,
        utility: rows.filter(r => r.resource_type === 'utility').length,
        other: rows.filter(r => !['fire', 'ems', 'law', 'utility'].includes(r.resource_type)).length,
        onScene: rows.filter(r => r.status === 'on_scene').length,
        enRoute: rows.filter(r => r.status === 'en_route' || r.status === 'dispatched').length,
        staging: rows.filter(r => r.status === 'staging').length,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST / — add resource ───────────────────────────────────────────────────

router.post('/', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    if (!b.unit_designation) return res.status(400).json({ error: 'unit_designation required' });
    const stationId = req.user.department_id;

    const { rows } = await db.query(
      `INSERT INTO active_resources (station_id, incident_id, resource_type, agency, unit_designation,
        unit_type, status, latitude, longitude, eta_minutes, crew_count, crew_names, officer_name,
        radio_channel, contact_phone, live_share_token, mutual_aid_agreement_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [stationId, b.incident_id || null, b.resource_type || 'fire', b.agency || '',
       b.unit_designation, b.unit_type || '', b.status || 'dispatched',
       b.latitude || null, b.longitude || null, b.eta_minutes || null,
       b.crew_count || 0, b.crew_names || '', b.officer_name || '',
       b.radio_channel || '', b.contact_phone || '', b.live_share_token || null,
       b.mutual_aid_agreement_id || null, b.notes || '']
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /:id — update position/status ─────────────────────────────────────

router.patch('/:id', async (req, res) => {
  await ensureTable();
  try {
    const allowed = ['status', 'latitude', 'longitude', 'speed_mph', 'heading', 'eta_minutes',
      'crew_count', 'crew_names', 'officer_name', 'radio_channel', 'notes'];
    const data = {};
    for (const k of allowed) { if (req.body[k] !== undefined) data[k] = req.body[k]; }
    const keys = Object.keys(data);
    if (!keys.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    const values = keys.map(k => data[k]);
    values.push(req.params.id, req.user.department_id);
    const { rows } = await db.query(
      `UPDATE active_resources SET ${sets}, updated_at = NOW() WHERE id = $${values.length - 1} AND department_id = $${values.length} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Resource not found' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DELETE /:id — clear resource ────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  await ensureTable();
  try {
    const { rows } = await db.query(
      `UPDATE active_resources SET status = 'cleared', updated_at = NOW() WHERE id = $1 AND department_id = $2 RETURNING *`,
      [req.params.id, req.user.department_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /request — request mutual aid (creates resource + optional live share)

router.post('/request', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    if (!b.agency) return res.status(400).json({ error: 'agency required' });
    const stationId = req.user.department_id;

    // Look up mutual aid agreement for this agency
    let agreement = null;
    try {
      const ag = await db.query(
        `SELECT * FROM mutual_aid_agreements WHERE department_id = $1 AND partner_agency ILIKE $2 AND status = 'active' LIMIT 1`,
        [stationId, `%${b.agency}%`]
      );
      if (ag.rows.length) agreement = ag.rows[0];
    } catch (_) {}

    // Create the resource entry
    const { rows } = await db.query(
      `INSERT INTO active_resources (station_id, resource_type, agency, unit_designation, unit_type,
        status, eta_minutes, radio_channel, contact_phone, mutual_aid_agreement_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [stationId, b.resource_type || 'fire', b.agency,
       b.unit_designation || `${b.agency} Unit`, b.unit_type || '',
       'dispatched', agreement?.response_time_min || b.eta_minutes || null,
       b.radio_channel || '', agreement?.partner_phone || b.contact_phone || '',
       agreement?.id || null, b.notes || `Mutual aid requested from ${b.agency}`]
    );

    res.status(201).json({
      data: rows[0],
      agreement: agreement ? { id: agreement.id, partner: agreement.partner_agency, phone: agreement.partner_phone } : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
