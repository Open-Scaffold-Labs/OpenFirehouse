'use strict';
/**
 * routes/cadConnections.js — the department's CAD interface configuration.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 WRITES ARE CHIEF-ONLY (added 2026-08-05, 4C.4). Until this change there was NO role gate
 * on ANY verb here, and that was a real hole, not a tidiness point:
 *
 *   · POST returns a LIVE webhook secret. Since 4C.2 the per-connection webhook secret is the
 *     ONLY credential the ingest accepts (the global CAD_WEBHOOK_SECRET was retired), so
 *     minting one is the ability to inject arbitrary dispatches into the department.
 *   · DELETE removes the connection that routes the real CAD, silently.
 *
 * Both were reachable by any authenticated `member`. This is the fourth instance of this
 * repo's standing CHECK — "same table, two write routes, only one gated": the ingest end of
 * the secret is hardened to NENA grade while the end that MINTS it was open.
 *
 * Chief, not officer: CAD interface configuration is an administrator function everywhere in
 * the market, and it is department infrastructure rather than an operational verb.
 *
 * READS STAY OPEN — deliberately, matching the riding-board precedent (d093d98). A crew that
 * cannot read its own integration status cannot report that it is broken, and cadDeserialize
 * already strips `webhook_secret_hash` from every read.
 *
 * The client hides Add/Configure for non-chiefs in the same change. A guard that 403s a
 * button the UI still offers is anti-pattern #61's remedy-not-offered mode.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const express = require('express');
const router  = express.Router();
const { cadConnections: db } = require('../db');
const { requireChief } = require('../middleware/requireRole');

router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (e) { res.status(500).json({ error: 'Failed to fetch CAD connections' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await db.findById(Number(req.params.id), req.user.department_id);
    if (!row) return res.status(404).json({ error: 'CAD connection not found' });
    res.json({ data: row });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch CAD connection' }); }
});

router.post('/', requireChief, async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'name is required' });
    const { id: _ignore, ...body } = req.body;
    res.status(201).json({ data: await db.create(body, req.user.department_id) });
  } catch (e) { res.status(500).json({ error: 'Failed to create CAD connection' }); }
});

router.patch('/:id', requireChief, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'CAD connection not found' });
    res.json({ data: await db.update(id, req.body, req.user.department_id) });
  } catch (e) { res.status(500).json({ error: 'Failed to update CAD connection' }); }
});

router.delete('/:id', requireChief, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'CAD connection not found' });
    await db.remove(id, req.user.department_id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete CAD connection' }); }
});

module.exports = router;
