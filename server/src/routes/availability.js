'use strict';
const express = require('express');
const router = express.Router();
const { availability } = require('../db');

router.get('/', async (req, res) => {
  try {
    const data = await availability.allForStation(req.user.department_id);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

router.post('/toggle', async (req, res) => {
  try {
    if (typeof req.body.available !== 'boolean') {
      return res.status(400).json({ error: 'available must be a boolean' });
    }
    const data = await availability.toggle(
      req.user.department_id,
      req.user.id,
      req.user.name || req.user.username,
      req.body.available
    );
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle availability' });
  }
});

module.exports = router;
