'use strict';
const express = require('express');
const router  = express.Router();
const { budgetTransactions: db } = require('../db');

router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (e) { res.status(500).json({ error: 'Failed to fetch budget transactions' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await db.findById(Number(req.params.id), req.user.department_id);
    if (!row) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ data: row });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch transaction' }); }
});

router.post('/', async (req, res) => {
  try {
    if (!req.body.description) return res.status(400).json({ error: 'description is required' });
    const { id: _ignore, ...body } = req.body;
    res.status(201).json({ data: await db.create(body, req.user.department_id) });
  } catch (e) { res.status(500).json({ error: 'Failed to create transaction' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ data: await db.update(id, req.body, req.user.department_id) });
  } catch (e) { res.status(500).json({ error: 'Failed to update transaction' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Transaction not found' });
    await db.remove(id, req.user.department_id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete transaction' }); }
});

module.exports = router;
