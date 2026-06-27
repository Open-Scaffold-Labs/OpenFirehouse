'use strict';
/**
 * routes/respond.js — Live Incident Response tracking + qualification-weighted
 * staffing (Phase 6 + Phase E).
 *
 * POST /api/incidents/:id/respond     — upsert a responder's status + (optional)
 *                                       declared apparatus/seat
 * GET  /api/incidents/:id/responders  — list who's responding
 * GET  /api/incidents/:id/staffing    — per-apparatus staffing board: required
 *                                       positions filled from the run-list crew
 *                                       (career) + seat-declared responders
 *                                       (volunteer), each scored by qualification.
 *                                       ADVISORY ONLY — never flips a unit status.
 *
 * Mounted AFTER companionGate; respond is in the companion allowlist (a phone
 * may write its OWN response). The staffing board is a command surface.
 */

const express = require('express');
const router  = express.Router();
const { pool, incidentResponses } = require('../db');
const { canonicalCerts, CERT_BY_CODE } = require('../constants/certs');
const { buildMemberCertIndex, scoreSeat, apparatusVerdict, actingInfo } = require('../utils/staffingScore');

const certLabel = (code) => (CERT_BY_CODE[code] && CERT_BY_CODE[code].name) || code;

// POST — mark this user as responding / on_scene / cleared (+ optional seat)
router.post('/:incidentId/respond', async (req, res) => {
  try {
    const incidentId = parseInt(req.params.incidentId, 10) || 0;
    const { status = 'responding', certLevel = 'probationary' } = req.body;
    const apparatusId = req.body.apparatusId != null ? parseInt(req.body.apparatusId, 10) : null;
    const positionId  = req.body.positionId  != null ? parseInt(req.body.positionId, 10)  : null;
    const deptId = req.user.department_id;
    const memberName = req.user.name || req.user.username || 'Unknown';

    // Validate any declared seat belongs to the caller's department.
    const seat = {};
    if (apparatusId != null && !Number.isNaN(apparatusId)) {
      const ap = await pool.query(
        'SELECT id FROM apparatus WHERE id = $1 AND department_id = $2', [apparatusId, deptId]);
      if (ap.rowCount === 0) {
        return res.status(400).json({ error: 'Unknown apparatus for this department', code: 'BAD_APPARATUS' });
      }
      seat.apparatusId = apparatusId;
      if (positionId != null && !Number.isNaN(positionId)) {
        const pos = await pool.query(
          'SELECT id, position_name FROM apparatus_positions WHERE id = $1 AND apparatus_id = $2 AND department_id = $3',
          [positionId, apparatusId, deptId]);
        if (pos.rowCount === 0) {
          return res.status(400).json({ error: 'Position is not on that apparatus', code: 'BAD_POSITION' });
        }
        seat.positionId = positionId;
        seat.positionName = pos.rows[0].position_name;
      }
    }

    // Resolve the STABLE responder<->person link (P3). members.user_id is the
    // clean key; this deterministic resolution happens at WRITE time so the
    // accountability record carries member_id, not just a name. An unlinked
    // caller stores member_id NULL (+ member_name) and renders downstream as the
    // explicit "Unlinked — not scored" state. Single pool.query (max:1-safe).
    const memRes = await pool.query(
      'SELECT id FROM members WHERE user_id = $1 AND department_id = $2 LIMIT 1',
      [req.user.id, deptId]);
    seat.memberId = memRes.rows[0] ? memRes.rows[0].id : null;

    const record = await incidentResponses.upsert(
      deptId, incidentId, req.user.id, memberName, status, certLevel, seat);
    res.json({ data: record });
  } catch (err) {
    console.error('Response tracking error:', err);
    res.status(500).json({ error: 'Failed to record response' });
  }
});

// GET — who is responding to this incident
router.get('/:incidentId/responders', async (req, res) => {
  try {
    const incidentId = parseInt(req.params.incidentId, 10) || 0;
    const responders = await incidentResponses.forIncident(req.user.department_id, incidentId);
    res.json({ data: responders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch responders' });
  }
});

// GET — qualification-weighted staffing board for this incident
router.get('/:incidentId/staffing', async (req, res) => {
  try {
    const incidentId = parseInt(req.params.incidentId, 10) || 0;
    const deptId = req.user.department_id;

    const inc = await pool.query(
      'SELECT id, station_id, date FROM incidents WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
      [incidentId, deptId]);
    if (inc.rowCount === 0) return res.status(404).json({ error: 'Incident not found', code: 'NOT_FOUND' });
    const incidentDate = inc.rows[0].date;

    // Position template (required certs + min rank per seat) joined to apparatus.
    const posRes = await pool.query(
      `SELECT ap.id, ap.apparatus_id, ap.position_name, ap.required_certs, ap.min_rank, ap.sort_order,
              a.designation, a.type
         FROM apparatus_positions ap
         JOIN apparatus a ON a.id = ap.apparatus_id
        WHERE ap.department_id = $1
        ORDER BY a.id, ap.sort_order`, [deptId]);

    // Cert index (authoritative: dept-verified member_qualifications).
    const qRes = await pool.query(
      'SELECT member_id, cert_type, status, expiry_date FROM member_qualifications WHERE department_id = $1',
      [deptId]);
    const certIndex = buildMemberCertIndex(qRes.rows);

    // Members: rank + responder→member mapping. Resolution priority (P3/P4):
    //   1. member_id — the STABLE link stored on the response (deterministic).
    //   2. user_id   — the account→person link (also stable).
    //   3. name      — LAST-DITCH only; mis-resolves duplicate names (Nathan
    //                  McGee vs Nathan P. McGee). A name-only match is flagged
    //                  `nameMatched` so the seat renders "Unlinked — confirm in
    //                  Roster setup" rather than being silently scored (Principle
    //                  #4). Once prod member_id is populated (P5 confirm-link),
    //                  the name tier is dead weight and can be removed (P4).
    const mRes = await pool.query(
      'SELECT id, name, rank, user_id FROM members WHERE department_id = $1', [deptId]);
    const normName = (s) => String(s || '').trim().toLowerCase();
    const memberById = new Map(mRes.rows.map((m) => [m.id, m]));
    const memberByUserId = new Map(mRes.rows.filter((m) => m.user_id != null).map((m) => [m.user_id, m]));
    const memberByName = new Map(mRes.rows.map((m) => [normName(m.name), m]));
    // Returns { member, linked } — `linked:false` means resolved only by name
    // (or not at all), i.e. NOT a trustworthy identity for scoring.
    const resolveMember = (memberId, userId, name) => {
      if (memberId != null && memberById.get(memberId)) return { member: memberById.get(memberId), linked: true };
      if (userId != null && memberByUserId.get(userId)) return { member: memberByUserId.get(userId), linked: true };
      const byName = memberByName.get(normName(name));
      return { member: byName || null, linked: false };
    };

    // Career baseline: the run list FOR THE INCIDENT'S DATE — the SAME date-keyed
    // read the web run-list board uses (GET /api/run-list/today?date=…), so the
    // iPad staffing board and the web run list always reflect the same run_lists
    // row. (The board then overlays incident responders + qualification scoring.)
    const rlRes = await pool.query(
      'SELECT date, payload FROM run_lists WHERE department_id = $1 AND date = $2 ORDER BY submitted_at DESC LIMIT 1',
      [deptId, incidentDate]);
    const runList = rlRes.rows[0] || null;
    const crewByPosition = new Map();
    if (runList) {
      let crew = [];
      try {
        const payload = typeof runList.payload === 'string' ? JSON.parse(runList.payload) : runList.payload;
        crew = (payload && payload.crew) || [];
      } catch (_) { crew = []; }
      for (const c of crew) if (c.position_id != null) crewByPosition.set(c.position_id, c);
    }

    // Volunteer: seat-declared responders, keyed by position_id.
    const rRes = await pool.query(
      `SELECT user_id, member_id, member_name, status, cert_level, apparatus_id, position_id, responded_at, on_scene_at
         FROM incident_responses WHERE department_id = $1 AND incident_id = $2`, [deptId, incidentId]);
    const responders = rRes.rows;
    const respByPosition = new Map();
    for (const r of responders) if (r.position_id != null) respByPosition.set(r.position_id, r);
    const usedResponderUserIds = new Set();

    const certCtx = (memberId, rank) => ({
      rank,
      certs: certIndex.get(memberId) || { valid: new Set(), all: new Set(), hasAny: false },
    });

    // Build + score each seat, grouped by apparatus.
    const apparatusMap = new Map();
    for (const p of posRes.rows) {
      if (!apparatusMap.has(p.apparatus_id)) {
        apparatusMap.set(p.apparatus_id, {
          apparatusId: p.apparatus_id, designation: p.designation, type: p.type, positions: [],
        });
      }
      const required = canonicalCerts(p.required_certs);

      let fill = null;
      const resp = respByPosition.get(p.id);
      const crew = crewByPosition.get(p.id);
      if (resp) {
        usedResponderUserIds.add(resp.user_id);
        const { member: mem, linked } = resolveMember(resp.member_id, resp.user_id, resp.member_name);
        // Score ONLY against a STABLE-linked member's certs. A responder resolved
        // only by name (or not at all) is NOT scored against a guessed person's
        // certs (Principle #4 — never silently mis-score); the seat is surfaced as
        // `unlinked` so the board renders the distinct "Unlinked — confirm in
        // Roster setup" state instead of a (possibly wrong) qualification.
        const trusted = linked && mem;
        // D2 (P8.2): a live responder takes the seat (they're actually there), but
        // if the run-list PLANNED a different person for it, surface BOTH so command
        // sees "planned X · responding Y" rather than the planned name silently
        // vanishing. Information-preserving — never hides who was expected.
        const plannedName = (crew && crew.member_name && crew.member_name !== resp.member_name)
          ? crew.member_name : null;
        fill = {
          source: 'responder',
          memberName: resp.member_name || null,
          memberRank: trusted ? mem.rank : null,
          certLevel: resp.cert_level,
          status: resp.status,
          respondedAt: resp.responded_at,
          onSceneAt: resp.on_scene_at,
          unlinked: !trusted,
          plannedCrewName: plannedName,
          ctx: trusted ? certCtx(mem.id, mem.rank) : { rank: null, certs: { valid: new Set(), hasAny: false } },
        };
      } else if (crew) {
        fill = {
          source: 'run_list',
          memberName: crew.member_name || null,
          memberRank: crew.member_rank || null,
          ctx: certCtx(crew.member_id, crew.member_rank),
        };
      }

      const score = scoreSeat({ requiredCerts: required, minRank: p.min_rank, member: fill ? fill.ctx : null });
      const acting = fill ? actingInfo(fill.memberRank, p.min_rank, p.position_name) : null;
      apparatusMap.get(p.apparatus_id).positions.push({
        positionId: p.id, positionName: p.position_name, sortOrder: p.sort_order,
        minRank: p.min_rank, requiredCerts: required, requiredCertLabels: required.map(certLabel),
        qualification: score.qualification, filled: score.filled, rankMet: score.rankMet,
        missingCerts: score.missingCerts, missingCertLabels: score.missingCerts.map(certLabel),
        filledBy: fill ? {
          source: fill.source, memberName: fill.memberName, memberRank: fill.memberRank || null,
          displayRank: acting.displayRank, acting: acting.acting,
          certLevel: fill.certLevel || null, status: fill.status || null,
          respondedAt: fill.respondedAt || null, onSceneAt: fill.onSceneAt || null,
          // true when a responder filled the seat but couldn't be resolved to a
          // member by a STABLE id — render the "Unlinked — confirm in Roster
          // setup" state (distinct token from qualified/partial/open).
          unlinked: fill.source === 'responder' ? !!fill.unlinked : false,
          // D2: the run-list-planned person for this seat, if a different live
          // responder took it (so command sees "planned X · responding Y").
          plannedCrewName: fill.plannedCrewName || null,
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
        verdict,
        positions: ap.positions,
      });
    }

    const unassignedResponders = responders
      .filter((r) => !usedResponderUserIds.has(r.user_id) && r.status !== 'cleared')
      .map((r) => ({
        memberName: r.member_name, certLevel: r.cert_level, status: r.status,
        apparatusId: r.apparatus_id, respondedAt: r.responded_at,
      }));

    res.json({ data: {
      incidentId,
      mode: runList ? 'career' : 'volunteer',
      runListDate: runList ? runList.date : null,
      generatedAt: new Date().toISOString(),
      apparatus,
      unassignedResponders,
      totals: {
        apparatusStaffed, apparatusShort,
        respondersResponding: responders.filter((r) => String(r.status).startsWith('responding')).length,
        respondersOnScene: responders.filter((r) => r.status === 'on_scene').length,
      },
    } });
  } catch (err) {
    console.error('Staffing compute error:', err);
    res.status(500).json({ error: 'Failed to compute staffing' });
  }
});

module.exports = router;
