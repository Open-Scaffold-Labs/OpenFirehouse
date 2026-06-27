'use strict';
/**
 * routes/maintenance.js — CRUD REST API for maintenance records
 *
 * GET    /api/maintenance        — list all records
 * GET    /api/maintenance/:id    — get one record
 * POST   /api/maintenance        — create a record
 * PATCH  /api/maintenance/:id    — update a record
 * DELETE /api/maintenance/:id    — delete a record
 */

const express = require('express');
const router  = express.Router();
const { maintenance: db } = require('../db');

function validate(body, requireAll = true) {
  const errors = [];
  if (requireAll) {
    if (!body.type || String(body.type).trim() === '') errors.push('type is required');
    if (!body.date || String(body.date).trim() === '') errors.push('date is required');
  }
  return errors;
}

function coerce(data) {
  const out = { ...data };
  const nullableNum = (v) => (v === '' || v === undefined || v === null) ? null : Number(v);
  out.apparatusId      = parseInt(out.apparatusId, 10) || 0;
  out.mileage          = nullableNum(out.mileage);
  out.engineHours      = nullableNum(out.engineHours);
  out.laborHours       = nullableNum(out.laborHours);
  out.partsCost        = nullableNum(out.partsCost);
  out.laborCost        = nullableNum(out.laborCost);
  out.totalCost        = nullableNum(out.totalCost);
  out.nextServiceMiles = nullableNum(out.nextServiceMiles);
  if (out.nextServiceDate === '') out.nextServiceDate = null;
  return out;
}

router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch maintenance records' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const rec = await db.findById(Number(req.params.id), req.user.department_id);
    if (!rec) return res.status(404).json({ error: 'Record not found' });
    res.json({ data: rec });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch record' }); }
});

router.post('/', async (req, res) => {
  try {
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const rec = await db.create(coerce({
      apparatusId:      req.body.apparatusId      ?? 0,
      apparatusName:    req.body.apparatusName    || '',
      type:             req.body.type,
      priority:         req.body.priority         || 'Routine',
      status:           req.body.status           || 'Pending',
      date:             req.body.date,
      mileage:          req.body.mileage          ?? null,
      engineHours:      req.body.engineHours      ?? null,
      description:      req.body.description      || '',
      technician:       req.body.technician       || '',
      vendor:           req.body.vendor           || '',
      laborHours:       req.body.laborHours       ?? null,
      partsCost:        req.body.partsCost        ?? null,
      laborCost:        req.body.laborCost        ?? null,
      totalCost:        req.body.totalCost        ?? null,
      workOrder:        req.body.workOrder        || '',
      nextServiceMiles: req.body.nextServiceMiles ?? null,
      nextServiceDate:  req.body.nextServiceDate  || null,
      notes:            req.body.notes            || '',
    }), req.user.department_id);
    res.status(201).json({ data: rec });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create record' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Record not found' });
    const errors = validate(req.body, false);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    res.json({ data: await db.update(id, coerce(req.body), req.user.department_id) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update record' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Record not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Maintenance record ${id} deleted` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete record' }); }
});

module.exports = router;
