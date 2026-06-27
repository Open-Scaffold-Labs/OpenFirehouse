'use strict';
/**
 * routes/ftoTracker.js — FTO Tracker Backend
 *
 * Stores skill evaluations and observations for probationary firefighters.
 *
 * GET    /api/fto/:memberId/evaluations   — get all evaluations for a member
 * POST   /api/fto/:memberId/evaluations   — save/update a skill evaluation
 * GET    /api/fto/:memberId/observations  — get all observations
 * POST   /api/fto/:memberId/observations  — log an observation
 * GET    /api/fto/:memberId/report        — generate progress report
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS fto_evaluations (
    id SERIAL PRIMARY KEY,
    station_id INTEGER DEFAULT 1,
    member_id INTEGER NOT NULL,
    skill_id TEXT NOT NULL,
    skill_name TEXT DEFAULT '',
    category TEXT DEFAULT '',
    result TEXT DEFAULT 'Not Evaluated',
    evaluated_by TEXT DEFAULT '',
    evaluated_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT DEFAULT '',
    UNIQUE(station_id, member_id, skill_id)
  );

  CREATE TABLE IF NOT EXISTS fto_observations (
    id SERIAL PRIMARY KEY,
    station_id INTEGER DEFAULT 1,
    member_id INTEGER NOT NULL,
    category TEXT DEFAULT 'General',
    note TEXT NOT NULL,
    observed_by TEXT DEFAULT '',
    observed_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

let initialized = false;
async function ensureTable() {
  if (initialized) return;
  try { await db.query(INIT_SQL); initialized = true; } catch (e) { console.error('fto init:', e.message); }
}

// ─── GET /:memberId/evaluations ──────────────────────────────────────────────

router.get('/:memberId/evaluations', async (req, res) => {
  await ensureTable();
  try {
    const { rows } = await db.query(
      'SELECT * FROM fto_evaluations WHERE department_id = $1 AND member_id = $2 ORDER BY evaluated_at DESC',
      [req.user.department_id, req.params.memberId]
    );
    // Convert to a map keyed by skill_id for easy lookup
    const evaluations = {};
    rows.forEach(r => { evaluations[r.skill_id] = r; });
    res.json({ data: evaluations, rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /:memberId/evaluations — upsert a skill evaluation ─────────────────

router.post('/:memberId/evaluations', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    if (!b.skill_id || !b.result) return res.status(400).json({ error: 'skill_id and result required' });
    const stationId = req.user.department_id;

    const { rows } = await db.query(
      `INSERT INTO fto_evaluations (station_id, member_id, skill_id, skill_name, category, result, evaluated_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (station_id, member_id, skill_id) DO UPDATE SET
         result = EXCLUDED.result, evaluated_by = EXCLUDED.evaluated_by,
         evaluated_at = NOW(), notes = EXCLUDED.notes
       RETURNING *`,
      [stationId, req.params.memberId, b.skill_id, b.skill_name || '', b.category || '',
       b.result, b.evaluated_by || req.user?.name || '', b.notes || '']
    );
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /:memberId/observations ─────────────────────────────────────────────

router.get('/:memberId/observations', async (req, res) => {
  await ensureTable();
  try {
    const { rows } = await db.query(
      'SELECT * FROM fto_observations WHERE department_id = $1 AND member_id = $2 ORDER BY observed_at DESC',
      [req.user.department_id, req.params.memberId]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /:memberId/observations ────────────────────────────────────────────

router.post('/:memberId/observations', async (req, res) => {
  await ensureTable();
  try {
    const b = req.body;
    if (!b.note) return res.status(400).json({ error: 'note required' });
    const { rows } = await db.query(
      `INSERT INTO fto_observations (station_id, member_id, category, note, observed_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.department_id, req.params.memberId, b.category || 'General',
       b.note, b.observed_by || req.user?.name || '']
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /:memberId/report — progress report ─────────────────────────────────

router.get('/:memberId/report', async (req, res) => {
  await ensureTable();
  try {
    const stationId = req.user.department_id;
    const memberId = req.params.memberId;

    const evals = await db.query(
      'SELECT * FROM fto_evaluations WHERE department_id = $1 AND member_id = $2',
      [stationId, memberId]
    );
    const obs = await db.query(
      'SELECT * FROM fto_observations WHERE department_id = $1 AND member_id = $2 ORDER BY observed_at DESC',
      [stationId, memberId]
    );
    const member = await db.query(
      'SELECT name, rank, joined FROM members WHERE id = $1 AND department_id = $2',
      [memberId, stationId]
    );

    const evaluations = evals.rows;
    const passed = evaluations.filter(e => e.result === 'Pass').length;
    const needsWork = evaluations.filter(e => e.result === 'Needs Work').length;
    const failed = evaluations.filter(e => e.result === 'Fail').length;

    res.json({
      member: member.rows[0] || null,
      summary: { total: evaluations.length, passed, needsWork, failed },
      evaluations: evaluations,
      observations: obs.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
