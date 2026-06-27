'use strict';
/**
 * routes/calendarFeed.js — Unified calendar feed endpoint.
 *
 * GET /api/calendar/feed?start=YYYY-MM-DD&end=YYYY-MM-DD
 *    &tier=station|officer|member|public
 *    &member_id=123
 *    &categories=training,shifts,equipment
 *
 * Returns an array of CalendarEntry objects from all registered modules.
 */
const express = require('express');
const router  = express.Router();
const crypto = require('crypto');
const { pool } = require('../db');
const { aggregateFeeds } = require('../feeds');

// GET /api/calendar/feed
router.get('/feed', async (req, res) => {
  try {
    const { start, end, tier, member_id, categories } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        error: 'start and end query params required (YYYY-MM-DD)',
      });
    }

    const opts = {
      stationId: req.user.department_id,
      tier: tier || null,
      memberId: member_id || null,
      categories: categories ? categories.split(',').map(s => s.trim()) : null,
    };

    const entries = await aggregateFeeds(start, end, opts);

    res.json({
      start,
      end,
      count: entries.length,
      entries,
    });
  } catch (err) {
    console.error('[calendar/feed] error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar feed' });
  }
});

// GET /api/calendar/categories — list all available categories
router.get('/categories', (_req, res) => {
  res.json({
    categories: [
      { key: 'training',   label: 'Training & Drills',      icon: 'book-open',       color: 'indigo' },
      { key: 'meetings',   label: 'Meetings',               icon: 'clipboard-list',  color: 'slate' },
      { key: 'shifts',     label: 'Shifts & Scheduling',    icon: 'users',           color: 'blue' },
      { key: 'equipment',  label: 'Equipment & Maintenance', icon: 'wrench',          color: 'yellow' },
      { key: 'compliance', label: 'Inspections & Compliance', icon: 'shield',         color: 'green' },
      { key: 'finance',    label: 'Grants & Fundraising',   icon: 'dollar-sign',     color: 'emerald' },
      { key: 'personnel',  label: 'Personnel & Wellness',   icon: 'heart-pulse',     color: 'teal' },
      { key: 'incidents',  label: 'Incidents',              icon: 'siren',           color: 'red' },
      { key: 'community',  label: 'Community Events',       icon: 'heart',           color: 'green' },
    ],
  });
});

// GET /api/calendar/feeds — list registered feeds (admin info)
router.get('/feeds', (_req, res) => {
  const { feeds } = require('../feeds');
  res.json({
    count: feeds.length,
    feeds: feeds.map(f => f.name),
  });
});

// ── iCal Subscription Management ──────────────────────────────────────────
// These endpoints are behind auth middleware (protected)

// POST /api/calendar/subscribe — Create or regenerate a calendar subscription
router.post('/subscribe', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { member_id, tier = 'member', categories = [] } = req.body;

    if (!member_id) {
      return res.status(400).json({ error: 'member_id is required' });
    }

    // Verify member exists AND belongs to the caller's station — a caller
    // must never be able to mint feed tokens for another department's members.
    const { rows: members } = await pool.query(
      'SELECT id, name FROM members WHERE id = $1 AND department_id = $2 LIMIT 1',
      [member_id, stationId]
    );
    if (members.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Generate unique token
    const calToken = crypto.randomUUID();

    // Upsert subscription (if exists, regenerate token; if not, create)
    const { rows: existing } = await pool.query(
      'SELECT id FROM calendar_subscriptions WHERE member_id = $1 AND department_id = $2',
      [member_id, stationId]
    );

    if (existing.length > 0) {
      // Update existing subscription
      await pool.query(
        `UPDATE calendar_subscriptions
         SET cal_token = $1, tier = $2, categories = $3
         WHERE member_id = $4 AND department_id = $5`,
        [calToken, tier, JSON.stringify(categories), member_id, stationId]
      );
    } else {
      // Create new subscription
      await pool.query(
        `INSERT INTO calendar_subscriptions (member_id, station_id, cal_token, tier, categories)
         VALUES ($1, $2, $3, $4, $5)`,
        [member_id, stationId, calToken, tier, JSON.stringify(categories)]
      );
    }

    // Return token and subscription URL
    const baseUrl = process.env.BASE_URL || 'http://localhost:3005';
    res.json({
      success: true,
      token: calToken,
      url: `/ical/${calToken}.ics`,
      full_url: `${baseUrl}/ical/${calToken}.ics`,
      member_id,
      tier,
      categories,
    });
  } catch (err) {
    console.error('[calendar/subscribe] error:', err);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// DELETE /api/calendar/subscribe — Delete a calendar subscription
router.delete('/subscribe', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { member_id } = req.body;

    if (!member_id) {
      return res.status(400).json({ error: 'member_id is required' });
    }

    const result = await pool.query(
      'DELETE FROM calendar_subscriptions WHERE member_id = $1 AND department_id = $2',
      [member_id, stationId]
    );

    res.json({
      success: true,
      deleted: result.rowCount > 0,
      message: result.rowCount > 0
        ? 'Subscription deleted'
        : 'No subscription found',
    });
  } catch (err) {
    console.error('[calendar/subscribe DELETE] error:', err);
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

// GET /api/calendar/subscribe/status — Check subscription status
router.get('/subscribe/status', async (req, res) => {
  try {
    const { member_id } = req.query;

    if (!member_id) {
      return res.status(400).json({ error: 'member_id query param required' });
    }

    const { rows: subs } = await pool.query(
      `SELECT cal_token, last_fetched_at, tier, categories
       FROM calendar_subscriptions
       WHERE member_id = $1 AND department_id = $2 LIMIT 1`,
      [member_id, req.user.department_id]
    );

    if (subs.length === 0) {
      return res.json({
        subscribed: false,
        url: null,
        last_fetched_at: null,
      });
    }

    const sub = subs[0];
    const baseUrl = process.env.BASE_URL || 'http://localhost:3005';

    res.json({
      subscribed: true,
      token: sub.cal_token,
      url: `/ical/${sub.cal_token}.ics`,
      full_url: `${baseUrl}/ical/${sub.cal_token}.ics`,
      last_fetched_at: sub.last_fetched_at,
      tier: sub.tier,
      categories: sub.categories || [],
    });
  } catch (err) {
    console.error('[calendar/subscribe status] error:', err);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

module.exports = router;
