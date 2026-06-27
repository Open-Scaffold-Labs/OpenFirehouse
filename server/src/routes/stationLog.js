'use strict';
/**
 * routes/stationLog.js — CRUD REST API for station daily log entries
 *
 * GET    /api/station-log         — list all entries
 * GET    /api/station-log/:id     — get one entry
 * POST   /api/station-log         — create an entry
 * PATCH  /api/station-log/:id     — update an entry
 * DELETE /api/station-log/:id     — delete an entry
 */

const express = require('express');
const router  = express.Router();
const { stationLog: db } = require('../db');

function validate(body, requireAll = true) {
  const errors = [];
  if (requireAll) {
    if (!body.date  || String(body.date).trim()  === '') errors.push('date is required');
    if (!body.shift || String(body.shift).trim() === '') errors.push('shift is required');
  }
  if (body.callCount !== undefined) {
    const n = Number(body.callCount);
    if (isNaN(n) || n < 0) errors.push('callCount must be a non-negative number');
  }
  return errors;
}

function coerce(data) {
  const out = { ...data };
  if (out.callCount !== undefined) out.callCount = parseInt(out.callCount, 10) || 0;
  return out;
}

router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch station log' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const entry = await db.findById(Number(req.params.id), req.user.department_id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json({ data: entry });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch entry' }); }
});

router.post('/', async (req, res) => {
  try {
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const entry = await db.create(coerce({
      date:              req.body.date,
      shift:             req.body.shift             || 'Day',
      officerOnDuty:     req.body.officerOnDuty     || '',
      membersOnDuty:     Array.isArray(req.body.membersOnDuty) ? req.body.membersOnDuty : [],
      weatherConditions: req.body.weatherConditions || '',
      callCount:         req.body.callCount         ?? 0,
      apparatusChecked:  req.body.apparatusChecked  ?? false,
      stationChecked:    req.body.stationChecked    ?? false,
      events:            Array.isArray(req.body.events) ? req.body.events : [],
      visitors:          req.body.visitors          || '',
      notes:             req.body.notes             || '',
    }), req.user.department_id);
    res.status(201).json({ data: entry });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create entry' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Entry not found' });
    const errors = validate(req.body, false);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    res.json({ data: await db.update(id, coerce(req.body), req.user.department_id) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update entry' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Entry not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Station log entry ${id} deleted` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete entry' }); }
});

module.exports = router;
