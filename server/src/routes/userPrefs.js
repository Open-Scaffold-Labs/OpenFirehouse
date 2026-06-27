'use strict';
/**
 * routes/userPrefs.js — Per-user view preferences (Phase 6)
 *
 * GET  /api/user/preferences  — return this user's saved preferences
 * PUT  /api/user/preferences  — save preferences for this user
 */

const express = require('express');
const router  = express.Router();
const { users } = require('../db');

router.get('/preferences', async (req, res) => {
  try {
    const prefs = await users.getPreferences(req.user.id);
    res.json({ data: prefs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

router.put('/preferences', async (req, res) => {
  try {
    const prefs = req.body;
    await users.setPreferences(req.user.id, prefs);
    res.json({ data: prefs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

module.exports = router;
