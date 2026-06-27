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
const router  = express.Router();
const { pool } = require('../db');

// ── Standard cert types for fire departments ─────────────────────────────────
// Canonical taxonomy is the single source of truth (constants/certs.js); the
// display-name list here preserves the legacy /cert-types contract.
const { CERT_TYPES } = require('../constants/certs');

// GET /cert-types — list available cert types
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
      [d.member_id, stationId, d.cert_type, d.cert_name || d.cert_type, d.issued_date || '', d.expiry_date || '', d.issuing_authority || '', d.cert_number || '', d.status || 'active', d.notes || '']
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
        vals.push(req.body[key]);
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
        certs[ct] = cert ? {
          held: true,
          expiry_date: cert.expiry_date,
          expired: cert.expiry_date && cert.expiry_date < new Date().toISOString().slice(0, 10),
          expiring_soon: cert.expiry_date && !cert.expired &&
            cert.expiry_date < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
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
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const r = await pool.query(
      `SELECT mq.*, m.name as member_name, m.rank as member_rank
       FROM member_qualifications mq
       JOIN members m ON mq.member_id = m.id
       WHERE mq.department_id = $1 AND mq.status = 'active' AND mq.expiry_date != '' AND mq.expiry_date <= $2
       ORDER BY mq.expiry_date ASC`,
      [stationId, cutoff]
    );

    const expired = r.rows.filter(q => q.expiry_date < today);
    const expiringSoon = r.rows.filter(q => q.expiry_date >= today);

    res.json({ data: { expired, expiringSoon, total: r.rows.length } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check expiring certs' });
  }
});

module.exports = router;
