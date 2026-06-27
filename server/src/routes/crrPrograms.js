'use strict';
const express = require('express');
const router  = express.Router();
const { crrPrograms: db } = require('../db');

router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (e) { res.status(500).json({ error: 'Failed to fetch CRR programs' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await db.findById(Number(req.params.id), req.user.department_id);
    if (!row) return res.status(404).json({ error: 'Program not found' });
    res.json({ data: row });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch program' }); }
});

router.post('/', async (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ error: 'title is required' });
    const { id: _ignore, ...body } = req.body;
    res.status(201).json({ data: await db.create(body, req.user.department_id) });
  } catch (e) { res.status(500).json({ error: 'Failed to create program' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Program not found' });
    res.json({ data: await db.update(id, req.body, req.user.department_id) });
  } catch (e) { res.status(500).json({ error: 'Failed to update program' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Program not found' });
    await db.remove(id, req.user.department_id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete program' }); }
});

module.exports = router;
