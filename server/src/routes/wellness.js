'use strict';
const express = require('express');
const router  = express.Router();
const { wellness: db } = require('../db');

// GET all wellness records
router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch(e) { res.status(500).json({ error: 'Failed to fetch wellness records' }); }
});

// GET by memberId
// (W2.5 audit 2026-06-10: path was the typo '/:.*', so req.params.memberId was
// always undefined → +undefined = NaN → this route could never return a record)
router.get('/:memberId', async (req, res) => {
  try {
    const r = await db.findByMemberId(+req.params.memberId, req.user.department_id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// POST — create new wellness record
router.post('/', async (req, res) => {
  try {
    if (!req.body.memberId) return res.status(400).json({ error: 'memberId is required' });
    if (!req.body.memberName) return res.status(400).json({ error: 'memberName is required' });
    res.status(201).json({ data: await db.create({
      memberId:            req.body.memberId,
      memberName:          req.body.memberName,
      bloodType:           req.body.bloodType           || '',
      medicalRestrictions: req.body.medicalRestrictions || '',
      physicalDue:         req.body.physicalDue         || null,
      scbaFitDue:          req.body.scbaFitDue          || null,
      physicals:           req.body.physicals           ?? [],
      scbaFitTests:        req.body.scbaFitTests        ?? [],
      vaccinations:        req.body.vaccinations        ?? [],
      exposures:           req.body.exposures           ?? [],
    }, req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create wellness record' }); }
});

// PATCH — update by memberId (used when saving exposures/physicals/etc.)
router.patch('/:memberId', async (req, res) => {
  try {
    const memberId = +req.params.memberId;
    if (!await db.findByMemberId(memberId, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    res.json({ data: await db.update(memberId, req.body, req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update wellness record' }); }
});

// DELETE by memberId
router.delete('/:memberId', async (req, res) => {
  try {
    const memberId = +req.params.memberId;
    if (!await db.findByMemberId(memberId, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    await db.remove(memberId, req.user.department_id);
    res.json({ message: `Wellness record for member ${memberId} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete wellness record' }); }
});

module.exports = router;
