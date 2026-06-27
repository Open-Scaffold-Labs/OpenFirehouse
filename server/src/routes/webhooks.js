'use strict';
/**
 * routes/webhooks.js — Layer 3: Webhook Subscription Management API
 *
 * GET    /api/webhooks              — list subscriptions
 * GET    /api/webhooks/events       — list available event types
 * POST   /api/webhooks              — create subscription
 * PATCH  /api/webhooks/:id          — update subscription
 * DELETE /api/webhooks/:id          — delete subscription
 * POST   /api/webhooks/:id/test     — send test ping
 * GET    /api/webhooks/:id/log      — delivery log for a subscription
 */

const express = require('express');
const router  = express.Router();
const {
  listSubscriptions, createSubscription, updateSubscription,
  deleteSubscription, testSubscription, getDeliveryLog, AVAILABLE_EVENTS,
} = require('../utils/webhookOrchestrator');

// GET /api/webhooks — list all subscriptions
router.get('/', async (req, res) => {
  try {
    const subs = await listSubscriptions(req.user.department_id);
    res.json({ data: subs, count: subs.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch webhook subscriptions' });
  }
});

// GET /api/webhooks/events — list available event types
router.get('/events', (req, res) => {
  res.json({ data: AVAILABLE_EVENTS });
});

// POST /api/webhooks — create subscription
router.post('/', async (req, res) => {
  try {
    if (!req.body.url) return res.status(400).json({ error: 'url is required' });
    const sub = await createSubscription(req.body, req.user.department_id);
    res.status(201).json({ data: sub });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create subscription', details: err.message });
  }
});

// PATCH /api/webhooks/:id — update subscription
router.patch('/:id', async (req, res) => {
  try {
    const sub = await updateSubscription(Number(req.params.id), req.body, req.user.department_id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    res.json({ data: sub });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// DELETE /api/webhooks/:id
router.delete('/:id', async (req, res) => {
  try {
    await deleteSubscription(Number(req.params.id), req.user.department_id);
    res.json({ message: 'Subscription deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

// POST /api/webhooks/:id/test — send test ping
router.post('/:id/test', async (req, res) => {
  try {
    const result = await testSubscription(Number(req.params.id), req.user.department_id);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: 'Test failed', details: err.message });
  }
});

// GET /api/webhooks/:id/log — delivery log
router.get('/:id/log', async (req, res) => {
  try {
    const log = await getDeliveryLog(
      Number(req.params.id),
      req.user.department_id,
      parseInt(req.query.limit) || 50
    );
    res.json({ data: log, count: log.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch delivery log' });
  }
});

module.exports = router;
