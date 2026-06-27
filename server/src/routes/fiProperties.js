'use strict';
const express = require('express');
const router  = express.Router();
const { fiProperties: db } = require('../db');

router.get('/',     async (req,res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch properties' }); } });
router.get('/:id',  async (req,res) => { try { const r=await db.findById(+req.params.id, req.user.department_id); if(!r) return res.status(404).json({error:'Not found'}); res.json({data:r}); } catch(e) { res.status(500).json({error:'Failed'}); } });
router.post('/',    async (req,res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'name is required' });
    res.status(201).json({ data: await db.create(req.body, req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to create property' }); }
});
router.patch('/:id', async (req,res) => {
  try {
    const id=+req.params.id; if(!await db.findById(id, req.user.department_id)) return res.status(404).json({error:'Not found'});
    res.json({ data: await db.update(id, req.body, req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update property' }); }
});
router.delete('/:id', async (req,res) => {
  try {
    const id=+req.params.id; if(!await db.findById(id, req.user.department_id)) return res.status(404).json({error:'Not found'});
    await db.remove(id, req.user.department_id); res.json({ message: `Property ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete property' }); }
});
module.exports = router;
