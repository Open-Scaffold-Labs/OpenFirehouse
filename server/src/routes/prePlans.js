'use strict';
const express = require('express');
const router  = express.Router();
const { prePlans: db } = require('../db');
const { findBestMatch } = require('../utils/addressNormalize');

router.get('/', async (req, res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch pre-plans' }); } });

// GET /api/pre-plans/by-address?address=... — fuzzy match for CAD auto-surface
// Must be before /:id to avoid routing conflict
router.get('/by-address', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address query param required' });
    const all = await db.all(req.user.department_id);
    const match = findBestMatch(address, all);
    if (!match) return res.json({ data: null, score: 0 });
    res.json({ data: match.plan, score: match.score });
  } catch(e) {
    res.status(500).json({ error: 'Failed to match address' });
  }
});

router.get('/:id', async (req, res) => { try { const r = await db.findById(+req.params.id, req.user.department_id); if (!r) return res.status(404).json({ error: 'Not found' }); res.json({ data: r }); } catch(e) { res.status(500).json({ error: 'Failed' }); } });

router.post('/', async (req, res) => {
  try {
    if (!req.body.occupancyName) return res.status(400).json({ error: 'occupancyName is required' });
    res.status(201).json({ data: await db.create({
      occupancyName:    req.body.occupancyName,
      address:          req.body.address          || '',
      occupancyType:    req.body.occupancyType    || '',
      riskLevel:        req.body.riskLevel        || 'Moderate',
      constructionType: req.body.constructionType || '',
      yearBuilt:        req.body.yearBuilt        != null ? Number(req.body.yearBuilt)   : null,
      stories:          req.body.stories          != null ? Number(req.body.stories)     : null,
      sqFootage:        req.body.sqFootage        != null ? Number(req.body.sqFootage)   : null,
      lastInspection:   req.body.lastInspection   || null,
      lastUpdated:      req.body.lastUpdated      || null,
      lastUpdatedBy:    req.body.lastUpdatedBy    || '',
      contacts:         req.body.contacts         ?? [],
      hazards:          req.body.hazards          ?? [],
      access:           req.body.access           ?? {},
      waterSupply:      req.body.waterSupply      ?? [],
      suppression:      req.body.suppression      ?? {},
      utilities:        req.body.utilities        ?? {},
      notes:            req.body.notes            || '',
      evacuationRoutes: req.body.evacuationRoutes || '',
      reviewedBy:       req.body.reviewedBy       || '',
      reviewedAt:       req.body.reviewedAt       || null,
      reviewNotes:      req.body.reviewNotes      || '',
    }, req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create pre-plan' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    res.json({ data: await db.update(id, req.body, req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update pre-plan' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Pre-plan ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete pre-plan' }); }
});

module.exports = router;
