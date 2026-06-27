'use strict';
const express = require('express');
const router = express.Router();
const { cadets } = require('../db');

function isOfficer(user) {
  return user?.role === 'chief' || user?.role === 'officer';
}

router.get('/', async (req, res) => {
  try {
    const data = await cadets.allForStation(req.user.department_id);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch cadets' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!isOfficer(req.user)) {
      return res.status(403).json({ error: 'Officer or chief access required' });
    }
    if (!req.body.name || String(req.body.name).trim() === '') {
      return res.status(400).json({ error: 'name is required' });
    }
    const data = await cadets.create(req.user.department_id, {
      name: req.body.name,
      date_of_birth: req.body.date_of_birth || null,
      parent_guardian: req.body.parent_guardian || '',
      parent_phone: req.body.parent_phone || '',
      parent_email: req.body.parent_email || '',
      school: req.body.school || '',
      enrolled_date: req.body.enrolled_date || null,
      status: req.body.status || 'Active',
      rank: req.body.rank || 'Cadet',
      notes: req.body.notes || '',
    });
    res.status(201).json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create cadet' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    if (!isOfficer(req.user)) {
      return res.status(403).json({ error: 'Officer or chief access required' });
    }
    const id = Number(req.params.id);
    const data = await cadets.update(id, req.user.department_id, req.body);
    if (!data) {
      return res.status(404).json({ error: 'Cadet not found' });
    }
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update cadet' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isOfficer(req.user)) {
      return res.status(403).json({ error: 'Officer or chief access required' });
    }
    const id = Number(req.params.id);
    const success = await cadets.remove(id, req.user.department_id);
    if (!success) {
      return res.status(404).json({ error: 'Cadet not found' });
    }
    res.json({ message: `Cadet ${id} deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete cadet' });
  }
});

module.exports = router;
