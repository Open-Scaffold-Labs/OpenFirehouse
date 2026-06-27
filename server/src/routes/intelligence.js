'use strict';
/**
 * routes/intelligence.js — Layer 3: Intelligence Feed API
 *
 * Unified intelligence stream from all inbound sources (radio, email).
 *
 * GET  /api/intelligence/feed          — unified signal feed
 * GET  /api/intelligence/feed/:incidentId — signals for specific incident
 * GET  /api/intelligence/stats         — 24h intelligence summary
 */

const express = require('express');
const router  = express.Router();
const { getIntelligenceFeed } = require('../utils/inboundIntelligence');

// GET /api/intelligence/feed — all signals, filterable
router.get('/feed', async (req, res) => {
  try {
    const { limit, priority, source } = req.query;
    const result = await getIntelligenceFeed(req.user.department_id, {
      limit: parseInt(limit) || 50,
      priority: priority || null,
      source: source || null,
    });
    res.json({ data: result });
  } catch (err) {
    console.error('Intelligence feed error:', err);
    res.status(500).json({ error: 'Failed to fetch intelligence feed' });
  }
});

// GET /api/intelligence/feed/:incidentId — signals linked to a specific incident
router.get('/feed/:incidentId', async (req, res) => {
  try {
    const result = await getIntelligenceFeed(req.user.department_id, {
      incidentId: Number(req.params.incidentId),
      limit: parseInt(req.query.limit) || 50,
    });
    res.json({ data: result });
  } catch (err) {
    console.error('Intelligence feed error:', err);
    res.status(500).json({ error: 'Failed to fetch intelligence feed' });
  }
});

// GET /api/intelligence/stats — 24h summary
router.get('/stats', async (req, res) => {
  try {
    const result = await getIntelligenceFeed(req.user.department_id, { limit: 0 });
    res.json({ data: result.stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch intelligence stats' });
  }
});

module.exports = router;
