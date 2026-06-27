'use strict';
const express = require('express');
const router  = express.Router();
const { courses: db } = require('../db');

router.get('/', async (req, res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch courses' }); } });
router.get('/:id', async (req, res) => { try { const r = await db.findById(+req.params.id, req.user.department_id); if (!r) return res.status(404).json({ error: 'Not found' }); res.json({ data: r }); } catch(e) { res.status(500).json({ error: 'Failed' }); } });

router.post('/', async (req, res) => {
  try {
    if (!req.body.courseName) return res.status(400).json({ error: 'courseName is required' });
    res.status(201).json({ data: await db.create({
      courseName:          req.body.courseName,
      type:                req.body.type                || '',
      provider:            req.body.provider            || '',
      startDate:           req.body.startDate           || null,
      endDate:             req.body.endDate             || null,
      location:            req.body.location            || '',
      certificationEarned: req.body.certificationEarned || '',
      certExpireYears:     req.body.certExpireYears     != null ? Number(req.body.certExpireYears) : 0,
      cost:                req.body.cost                != null ? Number(req.body.cost)            : 0,
      instructor:          req.body.instructor          || '',
      attendees:           req.body.attendees           ?? [],
      notes:               req.body.notes               || '',
    }, req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create course' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    res.json({ data: await db.update(id, req.body, req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update course' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Course ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete course' }); }
});

module.exports = router;
