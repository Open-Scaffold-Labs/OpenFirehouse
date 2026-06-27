'use strict';
/**
 * routes/exposureTracking.js — OSHA exposure & safety record tracking
 *
 * GET    /api/exposure-records             — list all (optionally ?member_id=X)
 * POST   /api/exposure-records             — create exposure record
 * PATCH  /api/exposure-records/:id         — update record
 * DELETE /api/exposure-records/:id         — remove record
 * GET    /api/exposure-records/summary     — exposure summary by member
 */

const express = require('express');
const router  = express.Router();

// W4.3-followup/4.3 zod rollout (2026-06-10 late): exposure_records is a
// LEGAL table — typed input + in-station member validation at the door.
const { z } = require('zod');
const validateReq = require('../middleware/validate');
const idParam = z.object({ id: z.string().regex(/^\d+$/, 'numeric id') });
const exposureCreateSchema = z.looseObject({
  member_id: z.coerce.number().int().positive(),
  exposure_date: z.string().min(1).max(40),
  exposure_type: z.string().min(1).max(60),
  substance: z.string().max(300).optional().nullable(),
  duration_minutes: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  symptoms: z.string().max(5000).optional().nullable(),
  followup_notes: z.string().max(5000).optional().nullable(),
  reported_by: z.string().max(120).optional().nullable(),
});

const { pool } = require('../db');
const { audit } = require('../utils/auditLog');

const EXPOSURE_TYPES = [
  'Smoke/Products of Combustion', 'Chemical', 'Biological/Bloodborne',
  'Asbestos', 'Carbon Monoxide', 'Hydrogen Cyanide',
  'Radiation', 'Noise (>85dB sustained)', 'Heat Stress',
  'Structural Collapse', 'Electrical', 'PFAS/AFFF',
  'Diesel Exhaust', 'Other',
];

const PPE_OPTIONS = [
  'SCBA', 'Turnout Gear', 'Gloves (structural)', 'Gloves (medical)',
  'Eye Protection', 'Hearing Protection', 'N95/P100 Respirator',
  'Tyvek Suit', 'Level A Suit', 'Level B Suit', 'None',
];

router.get('/types', (req, res) => {
  res.json({ data: { exposureTypes: EXPOSURE_TYPES, ppeOptions: PPE_OPTIONS } });
});

// GET /
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { member_id } = req.query;
    let q = `SELECT er.*, m.name as member_name, m.rank as member_rank
             FROM exposure_records er JOIN members m ON er.member_id = m.id
             WHERE er.department_id = $1 AND er.deleted_at IS NULL`;
    const params = [stationId];
    if (member_id) { q += ` AND er.member_id = $${params.length + 1}`; params.push(parseInt(member_id)); }
    q += ' ORDER BY er.exposure_date DESC';
    const r = await pool.query(q, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load exposure records' });
  }
});

// POST /
router.post('/', validateReq({ body: exposureCreateSchema }), async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const d = req.body;
    // member_id is client-supplied — must reference a member of THIS station
    // (legal record; same FK rule as incidentCosts/exams from W2.5b).
    const own = await pool.query('SELECT id FROM members WHERE id = $1 AND department_id = $2', [d.member_id, stationId]);
    if (!own.rows.length) return res.status(404).json({ error: 'Member not found' });
    const r = await pool.query(
      `INSERT INTO exposure_records (member_id, station_id, incident_id, exposure_date, exposure_type, substance, duration_minutes, ppe_worn, symptoms, medical_followup, followup_date, followup_notes, reported_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [d.member_id, stationId, d.incident_id || null, d.exposure_date, d.exposure_type, d.substance || '',
       parseInt(d.duration_minutes) || 0, JSON.stringify(d.ppe_worn || []), d.symptoms || '',
       d.medical_followup || false, d.followup_date || '', d.followup_notes || '', d.reported_by || '', d.status || 'reported']
    );
    audit(stationId, req.user, 'create', 'exposure_records', r.rows[0]?.id, {
      member_id: d.member_id, exposure_type: d.exposure_type,
    });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create exposure record' });
  }
});

// PATCH /:id
router.patch('/:id', validateReq({ params: idParam }), async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { id } = req.params;
    const allowed = ['exposure_type', 'substance', 'duration_minutes', 'ppe_worn', 'symptoms', 'medical_followup', 'followup_date', 'followup_notes', 'status'];
    const sets = []; const vals = []; let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        vals.push(key === 'ppe_worn' ? JSON.stringify(req.body[key])
          : key === 'medical_followup' ? Boolean(req.body[key])
          : key === 'duration_minutes' ? parseInt(req.body[key]) || 0
          : req.body[key]);
      }
    }
    if (sets.length === 0) return res.json({ data: {} });
    vals.push(parseInt(id), stationId);
    const r = await pool.query(
      `UPDATE exposure_records SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $${idx + 1} AND deleted_at IS NULL RETURNING *`, vals
    );
    audit(stationId, req.user, 'update', 'exposure_records', parseInt(id), {
      fields: Object.keys(req.body || {}),
    });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update exposure record' });
  }
});

// DELETE /:id — SOFT delete (Phase 2.2): exposure records are HIPAA-adjacent
// legal records; the row is retained with deleted_at set + an audit entry.
router.delete('/:id', validateReq({ params: idParam }), async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('UPDATE exposure_records SET deleted_at = NOW() WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [req.params.id, stationId]);
    audit(stationId, req.user, 'soft_delete', 'exposure_records', parseInt(req.params.id), {});
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete exposure record' });
  }
});

// GET /summary — exposure summary by member
router.get('/summary', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const r = await pool.query(`
      SELECT m.id, m.name, m.rank,
        COUNT(er.id) as total_exposures,
        COUNT(CASE WHEN er.medical_followup = true THEN 1 END) as medical_followups,
        COUNT(CASE WHEN er.status = 'reported' THEN 1 END) as pending,
        MAX(er.exposure_date) as last_exposure,
        ARRAY_AGG(DISTINCT er.exposure_type) FILTER (WHERE er.exposure_type IS NOT NULL) as exposure_types
      FROM members m
      LEFT JOIN exposure_records er ON m.id = er.member_id AND er.department_id = $1
      WHERE m.department_id = $1 AND (m.status = 'Active' OR m.status = 'Probationary')
      GROUP BY m.id, m.name, m.rank
      HAVING COUNT(er.id) > 0
      ORDER BY COUNT(er.id) DESC
    `, [stationId]);
    res.json({ data: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build exposure summary' });
  }
});

module.exports = router;
