'use strict';
/**
 * routes/vacancyFill.js — Auto Vacancy Fill
 *
 * When a member calls out, the system automatically:
 *  1. Identifies the vacancy (shift, position, date)
 *  2. Ranks eligible members by availability, qualifications, OT balance, hours
 *  3. Sends notifications to top-ranked candidates
 *  4. First to accept gets the shift
 *
 * GET    /api/vacancy-fill              — list active vacancies
 * GET    /api/vacancy-fill/history      — past filled/expired vacancies
 * POST   /api/vacancy-fill              — create a vacancy (member called out)
 * POST   /api/vacancy-fill/:id/accept   — member accepts the shift
 * POST   /api/vacancy-fill/:id/decline  — member declines
 * PATCH  /api/vacancy-fill/:id          — update vacancy details
 * DELETE /api/vacancy-fill/:id          — cancel/withdraw vacancy
 * GET    /api/vacancy-fill/:id/candidates — ranked eligible candidates
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS vacancy_fill (
    id SERIAL PRIMARY KEY,
    station_id INTEGER DEFAULT 1,
    department_id INTEGER,
    shift_date TEXT NOT NULL,
    shift_name TEXT DEFAULT '',
    position TEXT DEFAULT '',
    callout_member_id INTEGER DEFAULT NULL,
    callout_member_name TEXT DEFAULT '',
    callout_reason TEXT DEFAULT '',
    status TEXT DEFAULT 'open',
    priority TEXT DEFAULT 'normal',
    filled_by_id INTEGER DEFAULT NULL,
    filled_by_name TEXT DEFAULT '',
    filled_at TIMESTAMPTZ DEFAULT NULL,
    notifications_sent INTEGER DEFAULT 0,
    candidates_contacted TEXT DEFAULT '[]',
    candidates_declined TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NULL
  );
`;

let initialized = false;
async function ensureTable() {
  if (initialized) return;
  try { await db.query(INIT_SQL); await db.ensureDeptSyncTrigger('vacancy_fill'); initialized = true; } catch (e) { console.error('vacancy_fill init:', e.message); }
}

// ─── GET / — active vacancies ────────────────────────────────────────────────

router.get('/', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    const { rows } = await db.query(
      `SELECT * FROM vacancy_fill WHERE department_id = $1 AND status IN ('open', 'notifying')
       ORDER BY shift_date ASC, created_at DESC`,
      [stationId]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /history — filled/expired/cancelled ─────────────────────────────────

router.get('/history', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    const { rows } = await db.query(
      `SELECT * FROM vacancy_fill WHERE department_id = $1 AND status IN ('filled', 'expired', 'cancelled')
       ORDER BY updated_at DESC LIMIT 50`,
      [stationId]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST / — create vacancy ─────────────────────────────────────────────────

router.post('/', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    if (!b.shift_date) return res.status(400).json({ error: 'shift_date required' });
    const stationId = req.user.department_id;
    const { rows } = await db.query(
      `INSERT INTO vacancy_fill (station_id, shift_date, shift_name, position, callout_member_id,
        callout_member_name, callout_reason, status, priority, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [stationId, b.shift_date, b.shift_name || '', b.position || '', b.callout_member_id || null,
       b.callout_member_name || '', b.callout_reason || '', 'open', b.priority || 'normal',
       b.notes || '', b.created_by || req.user?.name || '']
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /:id/candidates — ranked eligible members ───────────────────────────

router.get('/:id/candidates', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    // Get the vacancy
    const vac = await db.query('SELECT * FROM vacancy_fill WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    if (!vac.rows.length) return res.status(404).json({ error: 'Vacancy not found' });
    const vacancy = vac.rows[0];

    // Get all active members (exclude the one who called out)
    const { rows: members } = await db.query(
      `SELECT id, name, rank, role, phone, email FROM members
       WHERE department_id = $1 AND status = 'Active' AND id != $2
       ORDER BY name`,
      [stationId, vacancy.callout_member_id || 0]
    );

    // Get recent hours for overtime balancing
    const { rows: hours } = await db.query(
      `SELECT member_id, SUM(hours) as total_hours FROM volunteer_hours
       WHERE department_id = $1 AND date > CURRENT_DATE - INTERVAL '30 days'
       GROUP BY member_id`,
      [stationId]
    );
    const hoursMap = {};
    hours.forEach(h => { hoursMap[h.member_id] = parseFloat(h.total_hours) || 0; });

    // Get availability
    const { rows: avail } = await db.query(
      `SELECT member_id, status FROM member_availability WHERE department_id = $1`,
      [stationId]
    );
    const availMap = {};
    avail.forEach(a => { availMap[a.member_id] = a.status; });

    // Get already-declined members
    let declined = [];
    try { declined = JSON.parse(vacancy.candidates_declined || '[]'); } catch (_) {}

    // Score and rank candidates
    const candidates = members.map(m => {
      let score = 50; // base score
      const availability = availMap[m.id] || 'unknown';
      const recentHours = hoursMap[m.id] || 0;

      // Availability boost
      if (availability === 'available') score += 30;
      else if (availability === 'limited') score += 10;
      else if (availability === 'unavailable') score -= 50;

      // Lower hours = higher priority (equalization)
      score -= Math.min(recentHours * 0.5, 20);

      // Officers get slight boost for leadership positions
      if (['officer', 'chief', 'captain', 'lieutenant'].some(r => (m.rank || '').toLowerCase().includes(r))) {
        if (vacancy.position?.toLowerCase().includes('officer')) score += 15;
      }

      // Already declined = remove
      if (declined.includes(m.id)) score = -100;

      return {
        ...m,
        availability,
        recentHours: Math.round(recentHours * 10) / 10,
        score: Math.round(score),
        declined: declined.includes(m.id),
      };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

    res.json({ data: candidates, vacancy });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /:id/accept — member accepts ───────────────────────────────────────

router.post('/:id/accept', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    const { rows } = await db.query(
      `UPDATE vacancy_fill SET status = 'filled', filled_by_id = $1, filled_by_name = $2,
        filled_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND department_id = $4 AND status IN ('open', 'notifying') RETURNING *`,
      [b.member_id || null, b.member_name || '', req.params.id, req.user.department_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Vacancy not found or already filled' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /:id/decline — member declines ─────────────────────────────────────

router.post('/:id/decline', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    const vac = await db.query('SELECT candidates_declined FROM vacancy_fill WHERE id = $1 AND department_id = $2', [req.params.id, req.user.department_id]);
    if (!vac.rows.length) return res.status(404).json({ error: 'Not found' });
    let declined = [];
    try { declined = JSON.parse(vac.rows[0].candidates_declined || '[]'); } catch (_) {}
    if (b.member_id && !declined.includes(b.member_id)) declined.push(b.member_id);

    const { rows } = await db.query(
      `UPDATE vacancy_fill SET candidates_declined = $1, updated_at = NOW() WHERE id = $2 AND department_id = $3 RETURNING *`,
      [JSON.stringify(declined), req.params.id, req.user.department_id]
    );
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /:id — update ─────────────────────────────────────────────────────

router.patch('/:id', async (req, res) => {
  await ensureTable();
  try {
    const allowed = ['shift_date', 'shift_name', 'position', 'callout_reason', 'status', 'priority', 'notes'];
    const data = {};
    for (const k of allowed) { if (req.body[k] !== undefined) data[k] = req.body[k]; }
    const keys = Object.keys(data);
    if (!keys.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    const values = keys.map(k => data[k]);
    values.push(req.params.id);
    values.push(req.user.department_id);
    const { rows } = await db.query(
      `UPDATE vacancy_fill SET ${sets}, updated_at = NOW() WHERE id = $${values.length - 1} AND department_id = $${values.length} RETURNING *`,
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
    const { rows } = await db.query(
      `UPDATE vacancy_fill SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND department_id = $2 RETURNING *`,
      [req.params.id, req.user.department_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0], cancelled: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
