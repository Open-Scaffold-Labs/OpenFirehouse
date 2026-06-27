'use strict';
/**
 * routes/shiftPatterns.js — CRUD REST API for shift pattern templates
 *
 * GET    /api/shift-patterns         — list all patterns
 * GET    /api/shift-patterns/:id     — get one pattern
 * POST   /api/shift-patterns         — create a pattern
 * PATCH  /api/shift-patterns/:id     — update a pattern
 * DELETE /api/shift-patterns/:id     — delete a pattern
 * POST   /api/shift-patterns/expand  — expand patterns for a date range
 */

const express = require('express');
const router  = express.Router();
const { shiftPatterns: db } = require('../db');

function validate(body, requireAll = true) {
  const errors = [];
  if (requireAll) {
    if (!body.name || String(body.name).trim() === '') errors.push('name is required');
    if (!body.shiftType || String(body.shiftType).trim() === '') errors.push('shiftType is required');
    if (!body.startDate || String(body.startDate).trim() === '') errors.push('startDate is required');
    if (!body.repeatRule || String(body.repeatRule).trim() === '') errors.push('repeatRule is required');
  }
  return errors;
}

router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch shift patterns' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const p = await db.findById(Number(req.params.id), req.user.department_id);
    if (!p) return res.status(404).json({ error: 'Pattern not found' });
    res.json({ data: p });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch pattern' }); }
});

router.post('/', async (req, res) => {
  try {
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const p = await db.create({
      name:       req.body.name,
      shiftType:  req.body.shiftType,
      startDate:  req.body.startDate,
      endDate:    req.body.endDate || null,
      repeatRule: req.body.repeatRule,
      repeatDays: Array.isArray(req.body.repeatDays) ? req.body.repeatDays : [],
      memberIds:  Array.isArray(req.body.memberIds) ? req.body.memberIds : [],
      minCrew:    Number(req.body.minCrew) || 3,
      isActive:   req.body.isActive !== false,
      notes:      req.body.notes || '',
    }, req.user.department_id);
    res.status(201).json({ data: p });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create pattern' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const p = await db.update(Number(req.params.id), req.body, req.user.department_id);
    if (!p) return res.status(404).json({ error: 'Pattern not found' });
    res.json({ data: p });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update pattern' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.remove(Number(req.params.id), req.user.department_id);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete pattern' }); }
});

// Expand patterns for a date range
router.post('/expand', async (req, res) => {
  try {
    const { startDate, endDate, commit } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const generated = await db.expand(req.user.department_id, startDate, endDate);

    if (commit === true) {
      // Actually insert the generated shifts into the database
      const { shifts: shiftsDb } = require('../db');
      for (const shift of generated) {
        await shiftsDb.create(shift, req.user.department_id);
      }
      res.json({ ok: true, message: `Generated and committed ${generated.length} shifts`, data: generated });
    } else {
      // Just return the generated shifts without inserting
      res.json({ data: generated });
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to expand patterns' }); }
});

module.exports = router;
