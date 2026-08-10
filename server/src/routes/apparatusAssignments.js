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
 *
 * ── AUTHORIZATION (added 2026-07-27, closing a live gap) ────────────────────
 * Every WRITE here is `requireOfficer`. Reads stay open to the department.
 *
 * WHY THIS WAS WRONG, AND WHY IT IS THE SAME BUG TWICE
 * ----------------------------------------------------
 * These routes shipped with NO role gate at all, so **any authenticated
 * department member could seat or unseat anyone on the riding board** — decide
 * who rides the engine tomorrow, or remove a firefighter from a seat.
 *
 * The tell is that the OTHER door into this exact table was already gated:
 * `POST /api/daily-staffing` is `requireOfficer` (routes/dailyStaffing.js), and
 * since migration 0070 folded `daily_staffing` in, both routes write
 * `apparatus_assignments`. **Same table, two doors, one locked.** That is
 * verbatim the 2026-07-14 lesson — an inspection record answered 422 on
 * /complete and 200 OK on PATCH — and verbatim the Phase 3 R6 finding, where
 * `routes/fiPermits.js` never imported `fiAuth` and any member could issue a
 * permit. **A guard that exists on one route and not another is not a guard.**
 *
 * MARKET CHECK (2026-07-27, timeboxed): role-gated roster editing is UNIVERSAL
 * in principle across the fire-scheduling products reachable, and **a member
 * self-assigning to an arbitrary seat is ABSENT** — self-service exists only as
 * *claiming an open slot*, supervisor-approved. So the gate is the market
 * posture, not a local preference. ⚠ Coverage was thin (mostly vendor marketing;
 * one government RFP requirement matrix was the strong source).
 *
 * WHAT THIS DELIBERATELY DOES NOT BREAK: the member-facing "claim an open
 * vacancy" flow does NOT come through here — `utils/vacancyEngine.js` writes the
 * riding board in-transaction through the 1.4 fill door, which carries its own
 * atomic single-winner semantics. Verified before gating; this route's only HTTP
 * writer is the officer-facing Assignment Board.
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { requireOfficer } = require('../middleware/requireRole');
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
    } else if (date) {
      // 1.1c-a: the riding board is date-keyed — read it for a (dept, date).
      q += ` AND aa.date = $${params.length + 1}`;
      params.push(date);
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

// POST / — assign a member to an apparatus seat on a DATE (the riding-board grain).
// 1.1c-a: the board is keyed on (department, date). A rotation shift is optional —
// when the client posts a shift_id, the date is taken from that shift and the id is
// retained as a provenance link; a date may also be posted directly (volunteer /
// ad-hoc, no shift). Seat integrity is a DB constraint
// (uq_apparatus_assignments_seat: one person per dept/date/apparatus/position_name),
// so the seat fill is an ON CONFLICT upsert — race-proof, not a read-then-write.
router.post('/', requireOfficer, async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const d = req.body;

    // Resolve the board date: an explicit date wins; else the rotation shift's date.
    let date = (typeof d.date === 'string' && d.date) ? d.date : null;
    let shiftId = d.shift_id || null;
    if (!date && shiftId) {
      const s = await pool.query('SELECT date FROM shifts WHERE id = $1 AND department_id = $2', [shiftId, stationId]);
      if (!s.rows.length) return res.status(404).json({ error: 'Shift not found' });
      date = s.rows[0].date;
    }
    if (!date) return res.status(400).json({ error: 'date or shift_id required' });

    // Move-semantic: a member rides ONE seat that day — vacate any other seat this
    // member holds on this (dept, date) before placing them (this is the app-layer
    // member-not-double-booked guard; the seat uniqueness is the DB guarantee).
    // 1.1c-b (0070): the board now also carries PAYROLL HOURS rows — a seat move must
    // NEVER erase recorded tour hours, so only vacate pure seat rows (hours IS NULL).
    await pool.query(
      `DELETE FROM apparatus_assignments WHERE department_id = $1 AND date = $2 AND member_id = $3 AND hours IS NULL`,
      [stationId, date, d.member_id]
    );
    // Fill the seat. If another member held it, DO UPDATE reassigns it to this one —
    // but never onto an hours-bearing row (that would reattribute payroll hours).
    const r = await pool.query(
      `INSERT INTO apparatus_assignments (shift_id, apparatus_id, position_id, member_id, department_id, position_name, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (department_id, date, apparatus_id, position_name)
         DO UPDATE SET member_id = EXCLUDED.member_id, position_id = EXCLUDED.position_id, shift_id = EXCLUDED.shift_id
         WHERE apparatus_assignments.hours IS NULL
       RETURNING *`,
      [shiftId, d.apparatus_id, d.position_id || null, d.member_id, stationId, d.position_name || '', date]
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

// DELETE /:id
router.delete('/:id', requireOfficer, async (req, res) => {
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

// GET /staffing/stations?date=YYYY-MM-DD — PER-STATION daily min-staffing rollup (2.4).
// For each station's apparatus, score the date's riding-board seats against the position
// template and flag understaffed apparatus/stations. Market: minimum staffing is per
// apparatus (⇒ per station), and understaffing alerts fire at the station/rig that's short.
// Reuses the Phase-E scoring lib (one source of truth). ADVISORY — never a control.
router.get('/staffing/stations', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const date = (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
      ? req.query.date : new Date().toISOString().slice(0, 10);

    const posRes = await pool.query(
      `SELECT ap.id, ap.apparatus_id, ap.position_name, ap.required_certs, ap.min_rank, ap.sort_order,
              a.designation, a.type, a.station_id
         FROM apparatus_positions ap JOIN apparatus a ON a.id = ap.apparatus_id
        WHERE ap.department_id = $1 ORDER BY a.station_id, a.id, ap.sort_order`, [deptId]);
    const qRes = await pool.query(
      'SELECT member_id, cert_type, status, expiry_date FROM member_qualifications WHERE department_id = $1', [deptId]);
    const certIndex = buildMemberCertIndex(qRes.rows);

    // The date's riding-board assignments, keyed by seat.
    const aRes = await pool.query(
      `SELECT aa.apparatus_id, aa.position_id, aa.position_name, aa.member_id,
              m.rank AS member_rank
         FROM apparatus_assignments aa JOIN members m ON m.id = aa.member_id
        WHERE aa.department_id = $1 AND aa.date = $2`, [deptId, date]);
    const byPosId = new Map(), byApPos = new Map();
    for (const a of aRes.rows) {
      if (a.position_id != null) byPosId.set(a.position_id, a);
      byApPos.set(`${a.apparatus_id}::${a.position_name}`, a);
    }

    // Every station appears (a house with no template still shows, staffed:0).
    const stRes = await pool.query('SELECT id, name FROM stations WHERE department_id = $1 ORDER BY name', [deptId]);
    const stationMap = new Map(stRes.rows.map((s) => [s.id, { station_id: s.id, station_name: s.name, apparatus: [] }]));

    const apparatusMap = new Map();
    for (const p of posRes.rows) {
      if (!apparatusMap.has(p.apparatus_id)) {
        apparatusMap.set(p.apparatus_id, { apparatusId: p.apparatus_id, designation: p.designation, type: p.type, stationId: p.station_id, positions: [] });
      }
      const required = canonicalCerts(p.required_certs);
      const a = byPosId.get(p.id) || byApPos.get(`${p.apparatus_id}::${p.position_name}`) || null;
      const member = a ? { rank: a.member_rank, certs: certIndex.get(a.member_id) || { valid: new Set(), hasAny: false } } : null;
      const score = scoreSeat({ requiredCerts: required, minRank: p.min_rank, member });
      apparatusMap.get(p.apparatus_id).positions.push({
        positionName: p.position_name, minRank: p.min_rank,
        qualification: score.qualification, filled: score.filled,
        missingCertLabels: score.missingCerts.map(certLabel),
      });
    }
    for (const ap of apparatusMap.values()) {
      const verdict = apparatusVerdict(ap.positions);
      const seats = ap.positions.length;
      const filled = ap.positions.filter((p) => p.filled).length;
      const st = stationMap.get(ap.stationId);
      if (st) st.apparatus.push({ apparatusId: ap.apparatusId, designation: ap.designation, type: ap.type, verdict, seats, filled, open: seats - filled, positions: ap.positions });
    }
    const stations = [...stationMap.values()].map((s) => {
      const short = s.apparatus.filter((a) => a.verdict !== 'staffed').length;
      return { ...s, apparatus_total: s.apparatus.length, apparatus_short: short, understaffed: short > 0 };
    });
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ data: { date, stations, department_understaffed: stations.some((s) => s.understaffed) } });
  } catch (err) {
    console.error('GET /apparatus-assignments/staffing/stations error:', err);
    res.status(500).json({ error: 'Failed to load per-station staffing' });
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
router.post('/positions', requireOfficer, async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const d = req.body;
    // 0066: department_id written explicitly (see the assignments INSERT note).
    const r = await pool.query(
      `INSERT INTO apparatus_positions (apparatus_id, department_id, position_name, required_certs, min_rank, sort_order)
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
router.patch('/positions/:id', requireOfficer, async (req, res) => {
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
router.delete('/positions/:id', requireOfficer, async (req, res) => {
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
