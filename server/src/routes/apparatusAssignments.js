'use strict';
/**
 * routes/apparatusAssignments.js — Daily apparatus position assignments
 *
 * GET    /api/apparatus-assignments?shift_id=X   — assignments for a shift
 * POST   /api/apparatus-assignments              — assign member to apparatus position
 * DELETE /api/apparatus-assignments/:id          — remove assignment
 * GET    /api/apparatus-positions                — position templates per apparatus
 * POST   /api/apparatus-positions                — create position template
 * PATCH  /api/apparatus-positions/:id            — update position
 * DELETE /api/apparatus-positions/:id            — delete position
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { canonicalCerts, CERT_BY_CODE } = require('../constants/certs');
const { buildMemberCertIndex, scoreSeat, apparatusVerdict, actingInfo } = require('../utils/staffingScore');

const certLabel = (code) => (CERT_BY_CODE[code] && CERT_BY_CODE[code].name) || code;

// ── Assignments ──────────────────────────────────────────────────────────────

// GET / — assignments for a shift
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { shift_id, date } = req.query;
    let q = `SELECT aa.*, m.name as member_name, m.rank as member_rank, a.designation as apparatus_name, a.type as apparatus_type
             FROM apparatus_assignments aa
             JOIN members m ON aa.member_id = m.id
             JOIN apparatus a ON aa.apparatus_id = a.id
             WHERE aa.department_id = $1`;
    const params = [stationId];
    if (shift_id) {
      q += ` AND aa.shift_id = $${params.length + 1}`;
      params.push(parseInt(shift_id));
    }
    q += ' ORDER BY a.designation, aa.position_name';
    const r = await pool.query(q, params);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.json({ data: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load assignments' });
  }
});

// POST / — create assignment (upsert: remove any existing assignment for this slot first)
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const d = req.body;
    // Delete any pre-existing assignment for this exact slot AND any other
    // assignment for this same member in this shift (a member can only ride
    // one apparatus at a time — moving them removes the old spot automatically).
    await pool.query(
      `DELETE FROM apparatus_assignments
       WHERE department_id = $1 AND shift_id = $2
         AND (
           (apparatus_id = $3 AND (position_name = $4 OR (position_id IS NOT NULL AND position_id = $5)))
           OR member_id = $6
         )`,
      [stationId, d.shift_id, d.apparatus_id, d.position_name || '', d.position_id || null, d.member_id]
    );
    const r = await pool.query(
      `INSERT INTO apparatus_assignments (shift_id, apparatus_id, position_id, member_id, station_id, position_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [d.shift_id, d.apparatus_id, d.position_id || null, d.member_id, stationId, d.position_name || '']
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM apparatus_assignments WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

// GET /staffing?shift_id=X — qualification-weighted staffing for a shift's
// saved apparatus assignments (career run-list context). Same scoring lib as
// the incident /staffing endpoint — one source of truth. ADVISORY ONLY.
router.get('/staffing', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const shiftId = req.query.shift_id ? parseInt(req.query.shift_id, 10) : null;

    const posRes = await pool.query(
      `SELECT ap.id, ap.apparatus_id, ap.position_name, ap.required_certs, ap.min_rank, ap.sort_order,
              a.designation, a.type
         FROM apparatus_positions ap
         JOIN apparatus a ON a.id = ap.apparatus_id
        WHERE ap.department_id = $1
        ORDER BY a.id, ap.sort_order`, [deptId]);

    const qRes = await pool.query(
      'SELECT member_id, cert_type, status, expiry_date FROM member_qualifications WHERE department_id = $1', [deptId]);
    const certIndex = buildMemberCertIndex(qRes.rows);

    // Saved assignments for the shift, keyed by position.
    const byPosId = new Map();
    const byApPos = new Map();
    if (shiftId) {
      const aRes = await pool.query(
        `SELECT aa.apparatus_id, aa.position_id, aa.position_name, aa.member_id,
                m.name AS member_name, m.rank AS member_rank
           FROM apparatus_assignments aa
           JOIN members m ON m.id = aa.member_id
          WHERE aa.department_id = $1 AND aa.shift_id = $2`, [deptId, shiftId]);
      for (const a of aRes.rows) {
        if (a.position_id != null) byPosId.set(a.position_id, a);
        byApPos.set(`${a.apparatus_id}::${a.position_name}`, a);
      }
    }

    const apparatusMap = new Map();
    for (const p of posRes.rows) {
      if (!apparatusMap.has(p.apparatus_id)) {
        apparatusMap.set(p.apparatus_id, {
          apparatusId: p.apparatus_id, designation: p.designation, type: p.type, positions: [],
        });
      }
      const required = canonicalCerts(p.required_certs);
      const a = byPosId.get(p.id) || byApPos.get(`${p.apparatus_id}::${p.position_name}`) || null;
      const member = a ? { rank: a.member_rank, certs: certIndex.get(a.member_id) || { valid: new Set(), hasAny: false } } : null;
      const score = scoreSeat({ requiredCerts: required, minRank: p.min_rank, member });
      const acting = a ? actingInfo(a.member_rank, p.min_rank, p.position_name) : null;
      apparatusMap.get(p.apparatus_id).positions.push({
        positionId: p.id, positionName: p.position_name, sortOrder: p.sort_order, minRank: p.min_rank,
        requiredCerts: required, requiredCertLabels: required.map(certLabel),
        qualification: score.qualification, filled: score.filled, rankMet: score.rankMet,
        missingCerts: score.missingCerts, missingCertLabels: score.missingCerts.map(certLabel),
        filledBy: a ? {
          source: 'assignment', memberName: a.member_name, memberRank: a.member_rank,
          displayRank: acting.displayRank, acting: acting.acting,
        } : null,
      });
    }

    const apparatus = [];
    let apparatusStaffed = 0, apparatusShort = 0;
    for (const ap of apparatusMap.values()) {
      const verdict = apparatusVerdict(ap.positions);
      if (verdict === 'staffed') apparatusStaffed++; else if (verdict === 'short') apparatusShort++;
      apparatus.push({
        apparatusId: ap.apparatusId, designation: ap.designation, type: ap.type,
        minStaffing: ap.positions.length,
        filledCount: ap.positions.filter((s) => s.filled).length,
        qualifiedCount: ap.positions.filter((s) => s.qualification === 'qualified').length,
        openCount: ap.positions.filter((s) => s.qualification === 'open').length,
        verdict, positions: ap.positions,
      });
    }

    res.json({ data: { shiftId, generatedAt: new Date().toISOString(), apparatus, totals: { apparatusStaffed, apparatusShort } } });
  } catch (err) {
    console.error('Assignment staffing error:', err);
    res.status(500).json({ error: 'Failed to compute staffing' });
  }
});

// ── Position Templates ───────────────────────────────────────────────────────

// GET /positions — list position templates
router.get('/positions', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { apparatus_id } = req.query;
    let q = `SELECT ap.*, a.designation as apparatus_name
             FROM apparatus_positions ap
             JOIN apparatus a ON ap.apparatus_id = a.id
             WHERE ap.department_id = $1`;
    const params = [stationId];
    if (apparatus_id) {
      q += ` AND ap.apparatus_id = $${params.length + 1}`;
      params.push(parseInt(apparatus_id));
    }
    q += ' ORDER BY a.designation, ap.sort_order, ap.position_name';
    const r = await pool.query(q, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load positions' });
  }
});

// POST /positions — create position template
router.post('/positions', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const d = req.body;
    const r = await pool.query(
      `INSERT INTO apparatus_positions (apparatus_id, station_id, position_name, required_certs, min_rank, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [d.apparatus_id, stationId, d.position_name, JSON.stringify(canonicalCerts(d.required_certs || [])), d.min_rank || '', d.sort_order || 0]
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create position' });
  }
});

// PATCH /positions/:id
router.patch('/positions/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { id } = req.params;
    const allowed = ['position_name', 'required_certs', 'min_rank', 'sort_order'];
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        vals.push(key === 'required_certs' ? JSON.stringify(canonicalCerts(req.body[key])) : req.body[key]);
      }
    }
    if (sets.length === 0) return res.json({ data: {} });
    vals.push(parseInt(id), stationId);
    const r = await pool.query(
      `UPDATE apparatus_positions SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $${idx + 1} RETURNING *`,
      vals
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// DELETE /positions/:id
router.delete('/positions/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM apparatus_positions WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete position' });
  }
});

module.exports = router;
