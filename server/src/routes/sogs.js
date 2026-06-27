'use strict';
const express = require('express');
const router  = express.Router();
const { sogs: db } = require('../db');

function coerce(d) {
  const o = { ...d };
  if (o.effectiveDate    === '') o.effectiveDate    = null;
  if (o.reviewDate       === '') o.reviewDate       = null;
  if (o.lastReviewedDate === '') o.lastReviewedDate = null;
  if (o.approvedBy       === '') o.approvedBy       = null;
  return o;
}

router.get('/', async (req, res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch SOGs' }); } });
router.get('/:id', async (req, res) => { try { const r = await db.findById(+req.params.id, req.user.department_id); if (!r) return res.status(404).json({ error: 'Not found' }); res.json({ data: r }); } catch(e) { res.status(500).json({ error: 'Failed' }); } });

router.post('/', async (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ error: 'title is required' });
    res.status(201).json({ data: await db.create(coerce({
      number:           req.body.number           || '',
      title:            req.body.title,
      category:         req.body.category         || 'Operations',
      status:           req.body.status           || 'Active',
      version:          req.body.version          || '1.0',
      effectiveDate:    req.body.effectiveDate     || null,
      reviewDate:       req.body.reviewDate        || null,
      lastReviewedDate: req.body.lastReviewedDate  || null,
      author:           req.body.author            || '',
      approvedBy:       req.body.approvedBy        || '',
      summary:          req.body.summary           || '',
      content:          req.body.content           || '',
      tags:             req.body.tags              ?? [],
    }), req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create SOG' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    res.json({ data: await db.update(id, coerce(req.body), req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update SOG' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `SOG ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete SOG' }); }
});

module.exports = router;
