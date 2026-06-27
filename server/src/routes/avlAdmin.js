'use strict';
/**
 * routes/avlAdmin.js — chief-managed AVL connection + device mapping (ADR-0003).
 * AUTHED (mounted after requireAuth) + chief-only + department-scoped. Lets a
 * chief set up a hardware AVL feed with no SQL: create a connection (secret shown
 * ONCE), then map each device_ref to an apparatus. The public ingest lives in
 * routes/avl.js. Secrets are stored as sha256 hashes — never returned after create.
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const { requireChief } = require('../middleware/requireRole');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newSecret = () => 'avl_' + crypto.randomBytes(24).toString('base64url');
const deptOf = (req) => req.user && req.user.department_id;

router.use(requireChief);

// ── Connections ──────────────────────────────────────────────────────────────
router.get('/connections', async (req, res) => {
  const dept = deptOf(req);
  if (!dept) return res.status(401).json({ error: 'No department', code: 'NO_DEPT' });
  const { rows } = await db.pool.query(
    `SELECT id, name, vendor_id, status, last_fix_at, fixes_ingested, created_at,
            (webhook_secret_hash IS NOT NULL) AS secret_set
       FROM avl_connections WHERE department_id = $1 ORDER BY id DESC`, [dept]);
  res.json({ data: rows });
});

router.post('/connections', async (req, res) => {
  const dept = deptOf(req);
  if (!dept) return res.status(401).json({ error: 'No department', code: 'NO_DEPT' });
  const name = String((req.body && req.body.name) || 'AVL Feed').slice(0, 120);
  const vendorId = String((req.body && (req.body.vendorId || req.body.vendor_id)) || 'generic').slice(0, 40);
  const secret = newSecret();
  const { rows } = await db.pool.query(
    `INSERT INTO avl_connections (department_id, name, vendor_id, status, webhook_secret_hash)
     VALUES ($1, $2, $3, 'Active', $4) RETURNING id, name, vendor_id, status`,
    [dept, name, vendorId, sha256(secret)]);
  // Plaintext secret is returned ONCE — it is never recoverable afterward.
  res.status(201).json({ ...rows[0], secret, note: 'Save this secret now — it will not be shown again.' });
});

router.post('/connections/:id/rotate-secret', async (req, res) => {
  const dept = deptOf(req);
  if (!dept) return res.status(401).json({ error: 'No department', code: 'NO_DEPT' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  const secret = newSecret();
  const { rows } = await db.pool.query(
    `UPDATE avl_connections SET webhook_secret_hash = $1, updated_at = NOW()
       WHERE id = $2 AND department_id = $3 RETURNING id`, [sha256(secret), id, dept]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json({ id, secret, note: 'Save this secret now — it will not be shown again.' });
});

router.patch('/connections/:id', async (req, res) => {
  const dept = deptOf(req);
  if (!dept) return res.status(401).json({ error: 'No department', code: 'NO_DEPT' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  const b = req.body || {};
  const sets = []; const vals = []; let i = 1;
  if (b.name != null) { sets.push(`name = $${i++}`); vals.push(String(b.name).slice(0, 120)); }
  if (b.vendorId != null || b.vendor_id != null) { sets.push(`vendor_id = $${i++}`); vals.push(String(b.vendorId || b.vendor_id).slice(0, 40)); }
  if (b.status != null) { sets.push(`status = $${i++}`); vals.push(String(b.status).slice(0, 20)); }
  if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(id, dept);
  const { rows } = await db.pool.query(
    `UPDATE avl_connections SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${i++} AND department_id = $${i} RETURNING id, name, vendor_id, status`, vals);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

router.delete('/connections/:id', async (req, res) => {
  const dept = deptOf(req);
  if (!dept) return res.status(401).json({ error: 'No department', code: 'NO_DEPT' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  await db.pool.query('DELETE FROM avl_connections WHERE id = $1 AND department_id = $2', [id, dept]);
  res.status(204).end();
});

// ── Devices (device_ref -> apparatus mapping) ────────────────────────────────
router.get('/devices', async (req, res) => {
  const dept = deptOf(req);
  if (!dept) return res.status(401).json({ error: 'No department', code: 'NO_DEPT' });
  const { rows } = await db.pool.query(
    `SELECT d.id, d.device_ref, d.apparatus_id, d.label, d.status, a.designation
       FROM avl_devices d LEFT JOIN apparatus a ON a.id = d.apparatus_id AND a.department_id = $1
      WHERE d.department_id = $1 ORDER BY d.device_ref`, [dept]);
  res.json({ data: rows });
});

router.post('/devices', async (req, res) => {
  const dept = deptOf(req);
  if (!dept) return res.status(401).json({ error: 'No department', code: 'NO_DEPT' });
  const deviceRef = String((req.body && req.body.deviceRef) || '').trim().slice(0, 120);
  const apparatusId = Number(req.body && req.body.apparatusId);
  const label = String((req.body && req.body.label) || '').slice(0, 120);
  if (!deviceRef || !Number.isInteger(apparatusId)) {
    return res.status(400).json({ error: 'deviceRef and numeric apparatusId required' });
  }
  // The apparatus must belong to the caller's department.
  const appt = await db.apparatus.findById(apparatusId, dept);
  if (!appt) return res.status(400).json({ error: 'apparatus not in your department' });
  const { rows } = await db.pool.query(
    `INSERT INTO avl_devices (department_id, device_ref, apparatus_id, label, status)
     VALUES ($1, $2, $3, $4, 'Active')
     ON CONFLICT (department_id, device_ref)
       DO UPDATE SET apparatus_id = EXCLUDED.apparatus_id, label = EXCLUDED.label, status = 'Active', updated_at = NOW()
     RETURNING id, device_ref, apparatus_id, label, status`,
    [dept, deviceRef, apparatusId, label]);
  res.status(201).json(rows[0]);
});

router.delete('/devices/:id', async (req, res) => {
  const dept = deptOf(req);
  if (!dept) return res.status(401).json({ error: 'No department', code: 'NO_DEPT' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  await db.pool.query('DELETE FROM avl_devices WHERE id = $1 AND department_id = $2', [id, dept]);
  res.status(204).end();
});

module.exports = router;
