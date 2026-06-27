'use strict';
const express = require('express');
const router  = express.Router();
const { volunteerHours: db } = require('../db');

function coerce(d) {
  const o = { ...d };
  if (o.memberId !== undefined) o.memberId = parseInt(o.memberId, 10) || 0;
  if (o.hours    !== undefined) o.hours    = parseFloat(o.hours)      || 0;
  return o;
}

router.get('/', async (req, res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch hours' }); } });
router.get('/:id', async (req, res) => { try { const r = await db.findById(+req.params.id, req.user.department_id); if (!r) return res.status(404).json({ error: 'Not found' }); res.json({ data: r }); } catch(e) { res.status(500).json({ error: 'Failed' }); } });

router.post('/', async (req, res) => {
  try {
    if (!req.body.memberId)     return res.status(400).json({ error: 'memberId is required' });
    if (!req.body.memberName)   return res.status(400).json({ error: 'memberName is required' });
    if (!req.body.date)         return res.status(400).json({ error: 'date is required' });
    if (!req.body.activityType) return res.status(400).json({ error: 'activityType is required' });
    res.status(201).json({ data: await db.create(coerce({
      memberId:     req.body.memberId,
      memberName:   req.body.memberName,
      date:         req.body.date,
      activityType: req.body.activityType,
      hours:        req.body.hours        ?? 0,
      description:  req.body.description  || '',
      reference:    req.body.reference    || '',
    }), req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create entry' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    res.json({ data: await db.update(id, coerce(req.body), req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update entry' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Entry ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete entry' }); }
});

module.exports = router;
