'use strict';
/**
 * routes/qualifications.js — Member qualifications & certifications
 *
 * GET    /api/qualifications             — list all qualifications (optionally ?member_id=X)
 * POST   /api/qualifications             — add a qualification
 * PATCH  /api/qualifications/:id         — update a qualification
 * DELETE /api/qualifications/:id         — remove a qualification
 * GET    /api/qualifications/matrix      — cert matrix: members × cert types
 * GET    /api/qualifications/expiring    — certs expiring within N days (?days=90)
 */

const express = require('express');
const { CERT_STATE, classifyCert } = require('../utils/certExpiry');
const router  = express.Router();
const { pool } = require('../db');

// ── Standard cert types for fire departments ─────────────────────────────────
// Canonical taxonomy is the single source of truth (constants/certs.js); the
// display-name list here preserves the legacy /cert-types contract.
const { CERT_TYPES, canonicalizeCert } = require('../constants/certs');

// ── cert_type is stored as a CANONICAL CODE (2026-07-14) ─────────────────────
// It used to be stored as whatever string the caller sent. The web UI's dropdown
// is fed by GET /cert-types below, which serves DISPLAY NAMES ("Firefighter I"),
// so every cert added through the product stored a display name — while
// apparatus_positions.required_certs stores CODES ("firefighter_1"). The staffing
// scorer compares the two, so they never matched: every UI-entered cert scored as
// MISSING, and a qualified firefighter read as unqualified.
//
// Fixed on BOTH sides. staffingScore.buildMemberCertIndex now canonicalizes on
// read (defensively, for historical rows + CSV imports), and the write paths here
// canonicalize on write so the column converges on codes. Canonicalizing here —
// rather than changing the /cert-types contract — means the fix holds for the
// existing client and for any future caller, without a coordinated deploy.
//
// A label we cannot canonicalize is stored VERBATIM rather than dropped: an
// unreadable cert must stay visible (staffingScore surfaces it as `unrecognized`),
// never silently vanish from a member's record.
function toCertCode(label) {
  return canonicalizeCert(label) || label;
}

// GET /cert-types — list available cert types (display names; legacy contract).
router.get('/cert-types', (req, res) => {
  res.json({ data: CERT_TYPES });
});

// GET / — list qualifications
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { member_id } = req.query;
    let q = 'SELECT mq.*, m.name as member_name, m.rank as member_rank FROM member_qualifications mq JOIN members m ON mq.member_id = m.id WHERE mq.department_id = $1';
    const params = [stationId];
    if (member_id) {
      q += ' AND mq.member_id = $2';
      params.push(parseInt(member_id));
    }
    q += ' ORDER BY mq.cert_type, mq.cert_name, m.name';
    const r = await pool.query(q, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load qualifications' });
  }
});

// POST / — add a qualification
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const d = req.body;
    const r = await pool.query(
      `INSERT INTO member_qualifications (member_id, station_id, cert_type, cert_name, issued_date, expiry_date, issuing_authority, cert_number, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      // cert_type -> canonical CODE (matched against required_certs).
      // cert_name -> the human label, preserved for display.
      [d.member_id, stationId, toCertCode(d.cert_type), d.cert_name || d.cert_type, d.issued_date || '', d.expiry_date || '', d.issuing_authority || '', d.cert_number || '', d.status || 'active', d.notes || '']
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add qualification' });
  }
});

// PATCH /:id — update
router.patch('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { id } = req.params;
    const allowed = ['cert_type', 'cert_name', 'issued_date', 'expiry_date', 'issuing_authority', 'cert_number', 'status', 'notes'];
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        // Same canonicalization as POST — an edit must not re-introduce a display
        // name into cert_type and silently un-qualify the member again.
        vals.push(key === 'cert_type' ? toCertCode(req.body[key]) : req.body[key]);
      }
    }
    if (sets.length === 0) return res.json({ data: {} });
    vals.push(parseInt(id), stationId);
    const r = await pool.query(
      `UPDATE member_qualifications SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $${idx + 1} RETURNING *`,
      vals
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update qualification' });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM member_qualifications WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete qualification' });
  }
});

// GET /matrix — cert matrix: members × cert types
router.get('/matrix', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    // The caller owns which day the question is about; the server does not
    // decide that for them (same rule the inspection/checks reports run on).
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(req.query.as_of || '')
      ? req.query.as_of : new Date().toISOString().slice(0, 10);
    const daysAhead = Math.min(Math.max(parseInt(req.query.days, 10) || 90, 1), 365);
    // Get all active members
    const membersRes = await pool.query(
      `SELECT id, name, rank, employment_type FROM members WHERE department_id = $1 AND (status = 'Active' OR status = 'Probationary') ORDER BY name`,
      [stationId]
    );
    // Get all qualifications
    const qualsRes = await pool.query(
      `SELECT * FROM member_qualifications WHERE department_id = $1 AND status = 'active'`,
      [stationId]
    );

    // Build matrix
    const certTypesUsed = [...new Set(qualsRes.rows.map(q => q.cert_type))].sort();
    const matrix = membersRes.rows.map(m => {
      const memberCerts = qualsRes.rows.filter(q => q.member_id === m.id);
      const certs = {};
      for (const ct of certTypesUsed) {
        const cert = memberCerts.find(q => q.cert_type === ct);
        // One classification, one state. The previous inline version read
        // `cert.expired` — a property that does not exist on this row — so its
        // `!cert.expired` guard was always true and an expired cert came back
        // flagged BOTH expired and expiring_soon.
        const state = cert ? classifyCert(cert.expiry_date, asOf, daysAhead) : null;
        certs[ct] = cert ? {
          held: true,
          expiry_date: cert.expiry_date,
          state,
          expired:       state === CERT_STATE.EXPIRED,
          expiring_soon: state === CERT_STATE.EXPIRING,
          // Surfaced, never folded into a verdict — somebody has to go fix it.
          unreadable:    state === CERT_STATE.UNREADABLE,
        } : { held: false };
      }
      return { ...m, certs, certCount: memberCerts.length };
    });

    res.json({ data: { members: matrix, certTypes: certTypesUsed, allCertTypes: CERT_TYPES } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build cert matrix' });
  }
});

// GET /expiring — certs expiring within N days
router.get('/expiring', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const days = parseInt(req.query.days) || 90;
    const today = new Date().toISOString().slice(0, 10);

    // Deliberately NOT filtered by date in SQL. Lexicographic comparison on a
    // TEXT column is only chronological while the value is a well-formed ISO
    // day — a row reading '7/27/26' sorts above any '2026-…' cutoff, fails the
    // `<=`, and vanishes from the report with no trace. A cert with a typo'd
    // expiry date must show up as a PROBLEM, not disappear. So we pull the
    // candidates and classify in one place.
    const r = await pool.query(
      `SELECT mq.*, m.name as member_name, m.rank as member_rank
       FROM member_qualifications mq
       JOIN members m ON mq.member_id = m.id
       WHERE mq.department_id = $1 AND mq.status = 'active'
       ORDER BY mq.expiry_date ASC`,
      [stationId]
    );

    const expired = [];
    const expiringSoon = [];
    const unreadable = [];
    for (const q of r.rows) {
      const state = classifyCert(q.expiry_date, today, days);
      if (state === CERT_STATE.EXPIRED) expired.push({ ...q, state });
      else if (state === CERT_STATE.EXPIRING) expiringSoon.push({ ...q, state });
      else if (state === CERT_STATE.UNREADABLE) unreadable.push({ ...q, state });
      // CURRENT and NO_EXPIRY_RECORDED are not answers to "what is expiring".
    }

    res.json({
      data: {
        expired, expiringSoon, unreadable,
        as_of: today, days_ahead: days,
        total: expired.length + expiringSoon.length + unreadable.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check expiring certs' });
  }
});

module.exports = router;
