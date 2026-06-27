'use strict';
const express = require('express');
const router  = express.Router();
const { hydrants: db } = require('../db');

function coerce(d) {
  const o = { ...d };
  if (o.yearInstalled !== undefined) o.yearInstalled = parseInt(o.yearInstalled, 10)    || null;
  if (o.numOutlets    !== undefined) o.numOutlets    = parseInt(o.numOutlets, 10)        || null;
  if (o.staticPressure   !== undefined && o.staticPressure   !== null) o.staticPressure   = parseFloat(o.staticPressure)   || null;
  if (o.residualPressure !== undefined && o.residualPressure !== null) o.residualPressure = parseFloat(o.residualPressure) || null;
  if (o.flowRate         !== undefined && o.flowRate         !== null) o.flowRate         = parseFloat(o.flowRate)         || null;
  if (o.staticPressure   === '') o.staticPressure   = null;
  if (o.residualPressure === '') o.residualPressure = null;
  if (o.flowRate         === '') o.flowRate         = null;
  if (o.lastTestDate         === '') o.lastTestDate         = null;
  if (o.nextTestDue          === '') o.nextTestDue          = null;
  if (o.lastInspectionDate   === '') o.lastInspectionDate   = null;
  if (o.lat !== undefined && o.lat !== null && o.lat !== '') o.lat = parseFloat(o.lat) || null;
  if (o.lng !== undefined && o.lng !== null && o.lng !== '') o.lng = parseFloat(o.lng) || null;
  if (o.lat === '') o.lat = null;
  if (o.lng === '') o.lng = null;
  return o;
}

router.get('/', async (req,res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch hydrants' }); } });

// GET /api/hydrants/geo — all hydrants with GPS coordinates (for map overlay)
router.get('/geo', async (req, res) => {
  try {
    const all = await db.all(req.user.department_id);
    const geo = all.filter(h => h.lat != null && h.lng != null);
    res.json({ data: geo });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch hydrant geo data' });
  }
});

// GET /api/hydrants/nearby?lat=&lng=&radius=500 — hydrants within radius meters of a point
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 500 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });
    const clat = parseFloat(lat);
    const clng = parseFloat(lng);
    const rad  = parseFloat(radius);
    if (isNaN(clat) || isNaN(clng) || isNaN(rad)) return res.status(400).json({ error: 'Invalid coordinates' });

    const all = await db.all(req.user.department_id);
    const nearby = all
      .filter(h => h.lat != null && h.lng != null)
      .map(h => {
        // Haversine distance in meters
        const R = 6371000;
        const dLat = (h.lat - clat) * Math.PI / 180;
        const dLng = (h.lng - clng) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(clat*Math.PI/180)*Math.cos(h.lat*Math.PI/180)*Math.sin(dLng/2)**2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return { ...h, _distanceMeters: Math.round(dist) };
      })
      .filter(h => h._distanceMeters <= rad)
      .sort((a, b) => a._distanceMeters - b._distanceMeters);

    res.json({ data: nearby });
  } catch (e) {
    res.status(500).json({ error: 'Failed to find nearby hydrants' });
  }
});

router.get('/:id', async (req,res) => { try { const r=await db.findById(+req.params.id, req.user.department_id); if(!r) return res.status(404).json({error:'Not found'}); res.json({data:r}); } catch(e) { res.status(500).json({error:'Failed'}); } });
router.post('/', async (req,res) => {
  try {
    if (!req.body.hydrantNumber) return res.status(400).json({ error: 'hydrantNumber is required' });
    res.status(201).json({ data: await db.create(coerce({
      hydrantNumber:      req.body.hydrantNumber,
      streetAddress:      req.body.streetAddress      || '',
      intersection:       req.body.intersection       || '',
      city:               req.body.city               || '',
      state:              req.body.state              || '',
      zip:                req.body.zip                || '',
      type:               req.body.type               || 'Dry Barrel',
      manufacturer:       req.body.manufacturer       || '',
      model:              req.body.model              || '',
      yearInstalled:      req.body.yearInstalled      ?? null,
      mainSize:           req.body.mainSize           || '',
      outletSize:         req.body.outletSize         || '',
      numOutlets:         req.body.numOutlets         ?? null,
      status:             req.body.status             || 'In Service',
      staticPressure:     req.body.staticPressure     ?? null,
      residualPressure:   req.body.residualPressure   ?? null,
      flowRate:           req.body.flowRate           ?? null,
      lastTestDate:       req.body.lastTestDate       || null,
      nextTestDue:        req.body.nextTestDue        || null,
      testedBy:           req.body.testedBy           || '',
      lastInspectionDate: req.body.lastInspectionDate || null,
      ownedBy:            req.body.ownedBy            || '',
      notes:              req.body.notes              || '',
      lat:                req.body.lat                ?? null,
      lng:                req.body.lng                ?? null,
    }), req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create hydrant' }); }
});
router.patch('/:id', async (req,res) => {
  try {
    const id=+req.params.id; if(!await db.findById(id, req.user.department_id)) return res.status(404).json({error:'Not found'});
    res.json({ data: await db.update(id, coerce(req.body), req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update hydrant' }); }
});
router.delete('/:id', async (req,res) => {
  try {
    const id=+req.params.id; if(!await db.findById(id, req.user.department_id)) return res.status(404).json({error:'Not found'});
    await db.remove(id, req.user.department_id); res.json({ message: `Hydrant ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete hydrant' }); }
});
module.exports = router;
