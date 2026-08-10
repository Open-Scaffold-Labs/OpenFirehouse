'use strict';
/**
 * routes/shiftSwaps.js — CRUD REST API for shift swap requests
 *
 * GET    /api/shift-swaps         — list all swap requests
 * GET    /api/shift-swaps/:id     — get one swap request
 * POST   /api/shift-swaps         — create a swap request
 * PATCH  /api/shift-swaps/:id     — update a swap request
 * DELETE /api/shift-swaps/:id     — delete a swap request
 */

const express = require('express');
const router  = express.Router();
const { requireOfficer } = require('../middleware/requireRole');
const { shiftSwaps: db } = require('../db');

function validate(body, requireAll = true) {
  const errors = [];
  if (requireAll) {
    if (!body.shiftId && body.shiftId !== 0) errors.push('shiftId is required');
    if (!body.requesterId && body.requesterId !== 0) errors.push('requesterId is required');
    if (!body.requesterName || String(body.requesterName).trim() === '') errors.push('requesterName is required');
  }
  return errors;
}

router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch shift swaps' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const s = await db.findById(Number(req.params.id), req.user.department_id);
    if (!s) return res.status(404).json({ error: 'Shift swap not found' });
    res.json({ data: s });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch shift swap' }); }
});

router.post('/', async (req, res) => {
  try {
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const s = await db.create({
      shiftId:       Number(req.body.shiftId),
      requesterId:   Number(req.body.requesterId),
      requesterName: req.body.requesterName,
      coveredById:   req.body.coveredById ? Number(req.body.coveredById) : null,
      coveredByName: req.body.coveredByName || null,
      status:        req.body.status || 'Open',
      reason:        req.body.reason || '',
      notes:         req.body.notes || '',
    }, req.user.department_id);
    res.status(201).json({ data: s });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create shift swap' }); }
});

router.patch('/:id', requireOfficer, async (req, res) => {
  try {
    const s = await db.update(Number(req.params.id), req.body, req.user.department_id);
    if (!s) return res.status(404).json({ error: 'Shift swap not found' });
    res.json({ data: s });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update shift swap' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.remove(Number(req.params.id), req.user.department_id);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete shift swap' }); }
});

module.exports = router;
