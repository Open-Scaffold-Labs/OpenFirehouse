'use strict';
const express = require('express');
const router  = express.Router();
const { recruitment: db } = require('../db');

router.get('/', async (req, res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch prospects' }); } });
router.get('/:id', async (req, res) => { try { const r = await db.findById(+req.params.id, req.user.department_id); if (!r) return res.status(404).json({ error: 'Not found' }); res.json({ data: r }); } catch(e) { res.status(500).json({ error: 'Failed' }); } });

router.post('/', async (req, res) => {
  try {
    if (!req.body.name)      return res.status(400).json({ error: 'name is required' });
    if (!req.body.dateAdded) return res.status(400).json({ error: 'dateAdded is required' });
    res.status(201).json({ data: await db.create({
      name:            req.body.name,
      phone:           req.body.phone           || '',
      email:           req.body.email           || '',
      address:         req.body.address         || '',
      dob:             req.body.dob             || null,
      source:          req.body.source          || '',
      recruiter:       req.body.recruiter       || '',
      stage:           req.body.stage           || 'Prospect',
      dateAdded:       req.body.dateAdded,
      stageHistory:    req.body.stageHistory    ?? [],
      checklist:       req.body.checklist       ?? {},
      notes:           req.body.notes           || '',
      interviewDate:   req.body.interviewDate   || '',
      physicalDate:    req.body.physicalDate    || '',
      orientationDate: req.body.orientationDate || '',
    }, req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create prospect' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    res.json({ data: await db.update(id, req.body, req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update prospect' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Prospect ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete prospect' }); }
});

module.exports = router;
