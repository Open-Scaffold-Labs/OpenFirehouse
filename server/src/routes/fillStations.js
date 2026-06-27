'use strict';
const express = require('express');
const router  = express.Router();
const { fillStations: db } = require('../db');

// Read-only — fill stations are seeded once, not editable via UI
router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (e) { res.status(500).json({ error: 'Failed to fetch fill stations' }); }
});

module.exports = router;
