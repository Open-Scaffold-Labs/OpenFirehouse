'use strict';
const express = require('express');
const router  = express.Router();
const { fiProperties: db } = require('../db');
const { audit } = require('../utils/auditLog');

router.get('/',     async (req,res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch properties' }); } });
router.get('/:id',  async (req,res) => { try { const r=await db.findById(+req.params.id, req.user.department_id); if(!r) return res.status(404).json({error:'Not found'}); res.json({data:r}); } catch(e) { res.status(500).json({error:'Failed'}); } });
router.post('/',    async (req,res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'name is required' });
    const created = await db.create(req.body, req.user.department_id);
    await audit(req.user.department_id, req.user, 'create', 'fi_properties', created.id, { name: created.name });
    res.status(201).json({ data: created });
  } catch(e) { res.status(500).json({ error: 'Failed to create property' }); }
});
router.patch('/:id', async (req,res) => {
  try {
    const id=+req.params.id; if(!await db.findById(id, req.user.department_id)) return res.status(404).json({error:'Not found'});
    const updated = await db.update(id, req.body, req.user.department_id);
    await audit(req.user.department_id, req.user, 'update', 'fi_properties', id, { fields: Object.keys(req.body) });
    res.json({ data: updated });
  } catch(e) { res.status(500).json({ error: 'Failed to update property' }); }
});
router.delete('/:id', async (req,res) => {
  try {
    const id=+req.params.id; if(!await db.findById(id, req.user.department_id)) return res.status(404).json({error:'Not found'});
    await db.remove(id, req.user.department_id); // soft delete (P0.2)
    await audit(req.user.department_id, req.user, 'soft_delete', 'fi_properties', id, {});
    res.json({ message: `Property ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete property' }); }
});
module.exports = router;
