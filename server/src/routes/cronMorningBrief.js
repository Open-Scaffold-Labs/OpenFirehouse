'use strict';
/**
 * routes/cronMorningBrief.js — weekday morning shift brief (first routine).
 * Mounted at /api/cron/morning-brief; triggered by Vercel Cron.
 *
 * Same JWT/role plug as Ask: each department run loads a real member badge
 * and calls invoke() read verbs. No superuser bot. Silent when the house
 * is calm or nothing changed.
 */

const express = require('express');
const router = express.Router();
const { checkCronAuth } = require('../utils/cronAuth');
const { withCronRun } = require('../utils/cronRun');
const { runScheduledAll } = require('../utils/morningBrief');

router.get('/', withCronRun('morning_brief', async (req, res) => {
  const cronAuth = checkCronAuth(req);
  if (!cronAuth.ok) return res.status(cronAuth.status).json({ error: cronAuth.error });
  try {
    const summary = await runScheduledAll(new Date());
    res.json({ ok: true, ...summary });
  } catch (err) {
    console.error('GET /cron/morning-brief error:', err);
    res.status(500).json({ error: 'Morning brief cron failed' });
  }
}));

module.exports = router;
