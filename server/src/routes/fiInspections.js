'use strict';
const express = require('express');
const router  = express.Router();
const { fiInspections: db, fiProperties } = require('../db');

// W2.5 audit (2026-06-10): propertyId is client-supplied — verify it
// references a property in the caller's own station.
async function assertOwnProperty(propertyId, stationId) {
  if (propertyId === undefined || propertyId === null) return true;
  return !!(await fiProperties.findById(+propertyId, stationId));
}

function coerce(d) {
  const o = { ...d };
  if (o.propertyId !== undefined) o.propertyId = parseInt(o.propertyId, 10) || 0;
  if (!Array.isArray(o.violations)) o.violations = [];
  if (o.scheduledDate  === '') o.scheduledDate  = null;
  if (o.completedDate  === '') o.completedDate  = null;
  if (o.followUpDate   === '') o.followUpDate   = null;
  if (o.result         === '') o.result         = null;
  return o;
}

router.get('/',     async (req,res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch inspections' }); } });
router.get('/:id',  async (req,res) => { try { const r=await db.findById(+req.params.id, req.user.department_id); if(!r) return res.status(404).json({error:'Not found'}); res.json({data:r}); } catch(e) { res.status(500).json({error:'Failed'}); } });
router.post('/',    async (req,res) => {
  try {
    if (!req.body.propertyId) return res.status(400).json({ error: 'propertyId is required' });
    if (!await assertOwnProperty(req.body.propertyId, req.user.department_id)) return res.status(404).json({ error: 'Property not found' });
    res.status(201).json({ data: await db.create(coerce({
      propertyId:    req.body.propertyId,
      type:          req.body.type          || 'Annual Inspection',
      inspectorName: req.body.inspectorName || '',
      scheduledDate: req.body.scheduledDate || null,
      completedDate: req.body.completedDate || null,
      result:        req.body.result        || null,
      violations:    Array.isArray(req.body.violations) ? req.body.violations : [],
      followUpDate:  req.body.followUpDate  || null,
      notes:         req.body.notes         || '',
    }), req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create inspection' }); }
});
router.patch('/:id', async (req,res) => {
  try {
    const id=+req.params.id; if(!await db.findById(id, req.user.department_id)) return res.status(404).json({error:'Not found'});
    if (req.body.propertyId !== undefined && !await assertOwnProperty(req.body.propertyId, req.user.department_id)) return res.status(404).json({ error: 'Property not found' });
    res.json({ data: await db.update(id, coerce(req.body), req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update inspection' }); }
});
router.delete('/:id', async (req,res) => {
  try {
    const id=+req.params.id; if(!await db.findById(id, req.user.department_id)) return res.status(404).json({error:'Not found'});
    await db.remove(id, req.user.department_id); res.json({ message: `Inspection ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete inspection' }); }
});
module.exports = router;
