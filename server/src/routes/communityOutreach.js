'use strict';
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

function isOfficer(user) {
  return user?.role === 'chief' || user?.role === 'officer';
}

// GET /stats — Return counts by status, attendance, volunteer hours, detectors
router.get('/stats', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows } = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'planned') as planned_count,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
        COALESCE(SUM(actual_attendance), 0) as total_attendance,
        COALESCE(SUM(volunteer_hours), 0) as total_volunteer_hours,
        COALESCE(SUM(detectors_installed), 0) as total_detectors_installed
       FROM community_events
       WHERE department_id = $1`,
      [stationId]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET / — List all community events for station, ordered by date DESC
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows } = await pool.query(
      `SELECT * FROM community_events
       WHERE department_id = $1
       ORDER BY date DESC NULLS LAST`,
      [stationId]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch community events' });
  }
});

// GET /:id — Get single event
router.get('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `SELECT * FROM community_events
       WHERE id = $1 AND department_id = $2`,
      [id, stationId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Event not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// POST / — Create event
router.post('/', async (req, res) => {
  try {
    if (!isOfficer(req.user)) {
      return res.status(403).json({ error: 'Officer or chief access required' });
    }
    if (!req.body.title || String(req.body.title).trim() === '') {
      return res.status(400).json({ error: 'title is required' });
    }

    const stationId = req.user.department_id;
    const { rows } = await pool.query(
      `INSERT INTO community_events (
        station_id, title, event_type, date, start_time, end_time, location, address,
        audience_type, audience_age_range, estimated_attendance, actual_attendance,
        partner_org, partner_contact_name, partner_contact_phone, partner_contact_email,
        apparatus_needed, equipment_needed, materials_needed, assigned_members, lead_member_id,
        safety_checklist, safety_notes, special_accommodations, materials_distributed,
        photos_taken, media_coverage, follow_up_notes, follow_up_date,
        volunteer_hours, detectors_installed, cpr_certifications, escape_plans_created,
        status, recurring, recurring_notes, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37)
       RETURNING *`,
      [
        stationId,
        req.body.title,
        req.body.event_type || 'Other',
        req.body.date || null,
        req.body.start_time || null,
        req.body.end_time || null,
        req.body.location || '',
        req.body.address || '',
        req.body.audience_type || 'mixed',
        req.body.audience_age_range || '',
        req.body.estimated_attendance || 0,
        req.body.actual_attendance || null,
        req.body.partner_org || '',
        req.body.partner_contact_name || '',
        req.body.partner_contact_phone || '',
        req.body.partner_contact_email || '',
        req.body.apparatus_needed || '[]',
        req.body.equipment_needed || '[]',
        req.body.materials_needed || '[]',
        req.body.assigned_members || '[]',
        req.body.lead_member_id || null,
        req.body.safety_checklist || '[]',
        req.body.safety_notes || '',
        req.body.special_accommodations || '',
        req.body.materials_distributed || '[]',
        req.body.photos_taken || false,
        req.body.media_coverage || '',
        req.body.follow_up_notes || '',
        req.body.follow_up_date || null,
        req.body.volunteer_hours || 0,
        req.body.detectors_installed || 0,
        req.body.cpr_certifications || 0,
        req.body.escape_plans_created || 0,
        req.body.status || 'planned',
        req.body.recurring || 'none',
        req.body.recurring_notes || '',
        req.body.description || '',
      ]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /:id — Update event
router.put('/:id', async (req, res) => {
  try {
    if (!isOfficer(req.user)) {
      return res.status(403).json({ error: 'Officer or chief access required' });
    }

    const stationId = req.user.department_id;
    const id = Number(req.params.id);

    // Check if exists
    const check = await pool.query(
      `SELECT id FROM community_events WHERE id = $1 AND department_id = $2`,
      [id, stationId]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Event not found' });

    // Build update clause
    const allowed = [
      'title', 'event_type', 'date', 'start_time', 'end_time', 'location', 'address',
      'audience_type', 'audience_age_range', 'estimated_attendance', 'actual_attendance',
      'partner_org', 'partner_contact_name', 'partner_contact_phone', 'partner_contact_email',
      'apparatus_needed', 'equipment_needed', 'materials_needed', 'assigned_members', 'lead_member_id',
      'safety_checklist', 'safety_notes', 'special_accommodations', 'materials_distributed',
      'photos_taken', 'media_coverage', 'follow_up_notes', 'follow_up_date',
      'volunteer_hours', 'detectors_installed', 'cpr_certifications', 'escape_plans_created',
      'status', 'recurring', 'recurring_notes', 'description'
    ];

    const keys = Object.keys(req.body).filter(k => allowed.includes(k));
    const sets = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
    const values = keys.map(k => req.body[k]);

    if (keys.length === 0) {
      return res.json({ data: check.rows[0] });
    }

    const { rows } = await pool.query(
      `UPDATE community_events
       SET ${sets}, updated_at = NOW()
       WHERE id = $1 AND department_id = $${keys.length + 2}
       RETURNING *`,
      [id, ...values, stationId]
    );

    res.json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /:id — Delete event
router.delete('/:id', async (req, res) => {
  try {
    if (!isOfficer(req.user)) {
      return res.status(403).json({ error: 'Officer or chief access required' });
    }

    const stationId = req.user.department_id;
    const id = Number(req.params.id);

    const { rows } = await pool.query(
      `DELETE FROM community_events
       WHERE id = $1 AND department_id = $2
       RETURNING id`,
      [id, stationId]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: `Event ${id} deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

module.exports = router;
