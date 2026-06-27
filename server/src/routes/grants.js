'use strict';
const express = require('express');
const router  = express.Router();
const { grants: db } = require('../db');

function coerce(d) {
  const o = { ...d };
  if (o.programYear      !== undefined) o.programYear      = parseInt(o.programYear, 10)    || null;
  if (o.amountRequested  !== undefined) o.amountRequested  = parseFloat(o.amountRequested)  || 0;
  if (o.amountAwarded    !== undefined && o.amountAwarded    !== null) o.amountAwarded    = parseFloat(o.amountAwarded)    || null;
  if (o.matchPercent     !== undefined) o.matchPercent     = parseFloat(o.matchPercent)     || 0;
  if (o.matchAmount      !== undefined && o.matchAmount      !== null) o.matchAmount      = parseFloat(o.matchAmount)      || null;
  if (o.applicationDate  === '') o.applicationDate  = null;
  if (o.awardDate        === '') o.awardDate        = null;
  if (o.grantPeriodStart === '') o.grantPeriodStart = null;
  if (o.grantPeriodEnd   === '') o.grantPeriodEnd   = null;
  if (o.amountAwarded    === '') o.amountAwarded    = null;
  if (o.matchAmount      === '') o.matchAmount      = null;
  return o;
}

router.get('/', async (req, res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch grants' }); } });
router.get('/:id', async (req, res) => { try { const r = await db.findById(+req.params.id, req.user.department_id); if (!r) return res.status(404).json({ error: 'Not found' }); res.json({ data: r }); } catch(e) { res.status(500).json({ error: 'Failed' }); } });

router.post('/', async (req, res) => {
  try {
    if (!req.body.grantName) return res.status(400).json({ error: 'grantName is required' });
    res.status(201).json({ data: await db.create(coerce({
      grantName:           req.body.grantName,
      type:                req.body.type                || '',
      fundingAgency:       req.body.fundingAgency       || '',
      programYear:         req.body.programYear         ?? null,
      status:              req.body.status              || 'Planning',
      applicationDate:     req.body.applicationDate     || null,
      awardDate:           req.body.awardDate           || null,
      amountRequested:     req.body.amountRequested     ?? 0,
      amountAwarded:       req.body.amountAwarded       ?? null,
      matchRequired:       req.body.matchRequired       ?? false,
      matchPercent:        req.body.matchPercent        ?? 0,
      matchAmount:         req.body.matchAmount         ?? null,
      grantPeriodStart:    req.body.grantPeriodStart    || null,
      grantPeriodEnd:      req.body.grantPeriodEnd      || null,
      reportingDeadlines:  req.body.reportingDeadlines  ?? [],
      expenditures:        req.body.expenditures        ?? [],
      contactName:         req.body.contactName         || '',
      contactEmail:        req.body.contactEmail        || '',
      notes:               req.body.notes               || '',
    }), req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create grant' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    res.json({ data: await db.update(id, coerce(req.body), req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update grant' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Grant ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete grant' }); }
});

module.exports = router;
