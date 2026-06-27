'use strict';
const express = require('express');
const router  = express.Router();
const { drills: db } = require('../db');

router.get('/', async (req, res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch drills' }); } });
router.get('/:id', async (req, res) => { try { const r = await db.findById(+req.params.id, req.user.department_id); if (!r) return res.status(404).json({ error: 'Not found' }); res.json({ data: r }); } catch(e) { res.status(500).json({ error: 'Failed' }); } });

router.post('/', async (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ error: 'title is required' });
    if (!req.body.date)  return res.status(400).json({ error: 'date is required' });
    res.status(201).json({ data: await db.create({
      title:      req.body.title,
      type:       req.body.type       || '',
      date:       req.body.date,
      startTime:  req.body.startTime  || '',
      duration:   req.body.duration   != null ? Number(req.body.duration) : 0,
      location:   req.body.location   || '',
      instructor: req.body.instructor || '',
      objectives: req.body.objectives ?? [],
      attendees:  req.body.attendees  ?? [],
      isoHours:   req.body.isoHours   ?? true,
      notes:      req.body.notes      || '',
    }, req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create drill' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    res.json({ data: await db.update(id, req.body, req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update drill' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Drill ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete drill' }); }
});

module.exports = router;
