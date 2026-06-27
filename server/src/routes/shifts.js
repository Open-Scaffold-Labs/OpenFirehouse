'use strict';
/**
 * routes/shifts.js — CRUD REST API for duty schedule shifts
 *
 * GET    /api/shifts         — list all shifts
 * GET    /api/shifts/:id     — get one shift
 * POST   /api/shifts         — create a shift
 * PATCH  /api/shifts/:id     — update a shift
 * DELETE /api/shifts/:id     — delete a shift
 */

const express = require('express');
const router  = express.Router();
const { shifts: db } = require('../db');

function validate(body, requireAll = true) {
  const errors = [];
  if (requireAll) {
    if (!body.date      || String(body.date).trim()      === '') errors.push('date is required');
    if (!body.shiftType || String(body.shiftType).trim() === '') errors.push('shiftType is required');
  }
  return errors;
}

router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch shifts' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const s = await db.findById(Number(req.params.id), req.user.department_id);
    if (!s) return res.status(404).json({ error: 'Shift not found' });
    res.json({ data: s });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch shift' }); }
});

router.post('/', async (req, res) => {
  try {
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const s = await db.create({
      date:      req.body.date,
      shiftType: req.body.shiftType,
      crew:      Array.isArray(req.body.crew) ? req.body.crew : [],
      notes:     req.body.notes || '',
    }, req.user.department_id);
    res.status(201).json({ data: s });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create shift' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Shift not found' });
    const errors = validate(req.body, false);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    res.json({ data: await db.update(id, req.body, req.user.department_id) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update shift' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Shift not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Shift ${id} deleted` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete shift' }); }
});

module.exports = router;
