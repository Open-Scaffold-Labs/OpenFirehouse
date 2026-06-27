'use strict';
/**
 * webhookOrchestrator.js — Layer 3: External Webhook Orchestration
 *
 * Unified outbound notification system that pushes events to external
 * systems when key things happen in OpenFirehouse.
 *
 * Event Types:
 *   - incident.created       — New incident (manual or auto from CAD)
 *   - incident.updated       — Incident fields changed
 *   - incident.closed        — Incident disposition set / cleared
 *   - nfirs.ready            — NFIRS report status → Complete
 *   - mutual_aid.activated   — Mutual aid partner activated
 *   - mutual_aid.recommended — AI recommends mutual aid
 *   - intelligence.critical  — Critical radio/email signal detected
 *   - cad.alert              — New CAD alert received
 *   - exposure.created       — Exposure record created
 *
 * Architecture:
 *   - webhook_subscriptions table stores external endpoint configs
 *   - Each subscription filters on event types
 *   - Delivery with retry (3 attempts, exponential backoff)
 *   - webhook_deliveries table logs all attempts for audit
 *   - HMAC signature on every payload for security
 */

const crypto = require('crypto');
const { pool } = require('../db');

// ── Schema Migration ────────────────────────────────────────────────────────
let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id SERIAL PRIMARY KEY,
        station_id INTEGER DEFAULT 1,
        name TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL,
        secret TEXT DEFAULT '',
        events JSONB DEFAULT '["*"]',
        headers JSONB DEFAULT '{}',
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id SERIAL PRIMARY KEY,
        subscription_id INTEGER REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
        station_id INTEGER DEFAULT 1,
        event TEXT NOT NULL,
        payload JSONB,
        response_status INTEGER,
        response_body TEXT DEFAULT '',
        attempt INTEGER DEFAULT 1,
        delivered BOOLEAN DEFAULT false,
        error TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_del_sub
      ON webhook_deliveries (subscription_id, created_at DESC)
    `);
    schemaReady = true;
  } catch (err) {
    console.warn('[Webhooks] Schema creation note:', err.message);
  }
}

// ── HMAC Signature ──────────────────────────────────────────────────────────
function signPayload(payload, secret) {
  if (!secret) return '';
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// ── Deliver to a Single Subscription ────────────────────────────────────────
async function deliverWebhook(subscription, event, payload, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    source: 'OpenFirehouse',
    data: payload,
  });

  const signature = signPayload(body, subscription.secret);

  const headers = {
    'Content-Type': 'application/json',
    'X-OpenFirehouse-Event': event,
    'X-OpenFirehouse-Signature': signature ? `sha256=${signature}` : '',
    'X-OpenFirehouse-Delivery': `${subscription.id}-${Date.now()}`,
    ...(typeof subscription.headers === 'object' ? subscription.headers : {}),
  };

  let responseStatus = 0;
  let responseBody = '';
  let delivered = false;
  let error = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const resp = await fetch(subscription.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    responseStatus = resp.status;
    responseBody = await resp.text().catch(() => '');
    delivered = resp.ok; // 2xx = success
  } catch (err) {
    error = err.message || 'Delivery failed';
  }

  // Log the delivery attempt
  try {
    await pool.query(
      `INSERT INTO webhook_deliveries
       (subscription_id, station_id, event, payload, response_status, response_body, attempt, delivered, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [subscription.id, subscription.station_id, event, JSON.stringify(payload),
       responseStatus, responseBody.substring(0, 1000), attempt, delivered, error]
    );
  } catch { /* logging failure is non-fatal */ }

  // Retry on failure with exponential backoff
  if (!delivered && attempt < MAX_ATTEMPTS) {
    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
    setTimeout(() => {
      deliverWebhook(subscription, event, payload, attempt + 1).catch(() => {});
    }, delay);
  }

  return { delivered, responseStatus, attempt, error };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DISPATCH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dispatch an event to all matching webhook subscriptions.
 *
 * @param {string} event     — Event type (e.g., 'incident.created')
 * @param {Object} payload   — Event data
 * @param {number} stationId — Multi-tenancy station ID
 */
async function dispatch(event, payload, stationId) {
  try {
    await ensureSchema();

    // Find matching subscriptions
    const { rows: subscriptions } = await pool.query(
      `SELECT * FROM webhook_subscriptions
       WHERE department_id = $1 AND enabled = true`,
      [stationId]
    );

    if (subscriptions.length === 0) return { dispatched: 0 };

    // Filter by event type
    const matching = subscriptions.filter(sub => {
      let events = sub.events;
      if (typeof events === 'string') {
        try { events = JSON.parse(events); } catch { events = ['*']; }
      }
      if (!Array.isArray(events)) events = ['*'];
      return events.includes('*') || events.includes(event);
    });

    if (matching.length === 0) return { dispatched: 0 };

    // Deliver to all matching subscriptions (non-blocking)
    const deliveries = matching.map(sub =>
      deliverWebhook(sub, event, payload).catch(err => ({
        delivered: false, error: err.message,
      }))
    );

    // Wait for first delivery attempt (retries happen in background)
    const results = await Promise.all(deliveries);

    console.log(`[Webhooks] ✔ Dispatched "${event}" to ${results.length} endpoint(s)`);

    return {
      dispatched: results.length,
      delivered: results.filter(r => r.delivered).length,
      failed: results.filter(r => !r.delivered).length,
    };
  } catch (err) {
    console.error('[Webhooks] Dispatch error:', err.message);
    return { dispatched: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function listSubscriptions(stationId) {
  await ensureSchema();
  const { rows } = await pool.query(
    'SELECT * FROM webhook_subscriptions WHERE department_id = $1 ORDER BY created_at DESC',
    [stationId]
  );
  return rows;
}

async function createSubscription(data, stationId) {
  await ensureSchema();
  const { rows } = await pool.query(
    `INSERT INTO webhook_subscriptions (station_id, name, url, secret, events, headers, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      stationId,
      data.name || '',
      data.url,
      data.secret || crypto.randomBytes(32).toString('hex'),
      JSON.stringify(data.events || ['*']),
      JSON.stringify(data.headers || {}),
      data.enabled !== false,
    ]
  );
  return rows[0];
}

async function updateSubscription(id, data, stationId) {
  await ensureSchema();
  const allowed = ['name', 'url', 'secret', 'events', 'headers', 'enabled'];
  const sets = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (data[key] !== undefined) {
      const val = (key === 'events' || key === 'headers') ? JSON.stringify(data[key]) : data[key];
      sets.push(`${key} = $${idx}`);
      values.push(val);
      idx++;
    }
  }

  if (sets.length === 0) return null;

  values.push(id, stationId);
  const { rows } = await pool.query(
    `UPDATE webhook_subscriptions SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${idx} AND department_id = $${idx + 1} RETURNING *`,
    values
  );
  return rows[0] || null;
}

async function deleteSubscription(id, stationId) {
  await ensureSchema();
  await pool.query(
    'DELETE FROM webhook_subscriptions WHERE id = $1 AND department_id = $2',
    [id, stationId]
  );
}

async function getDeliveryLog(subscriptionId, stationId, limit = 50) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT * FROM webhook_deliveries
     WHERE subscription_id = $1 AND department_id = $2
     ORDER BY created_at DESC LIMIT $3`,
    [subscriptionId, stationId, Math.min(limit, 200)]
  );
  return rows;
}

async function testSubscription(id, stationId) {
  await ensureSchema();
  const { rows } = await pool.query(
    'SELECT * FROM webhook_subscriptions WHERE id = $1 AND department_id = $2',
    [id, stationId]
  );
  if (!rows[0]) return { error: 'Subscription not found' };

  return deliverWebhook(rows[0], 'test.ping', {
    message: 'OpenFirehouse webhook test',
    timestamp: new Date().toISOString(),
  });
}

// ── Available Events ────────────────────────────────────────────────────────
const AVAILABLE_EVENTS = [
  { event: 'incident.created',        description: 'New incident created (manual or auto from CAD)' },
  { event: 'incident.updated',        description: 'Incident record updated' },
  { event: 'incident.closed',         description: 'Incident cleared / disposition set' },
  { event: 'cad.alert',               description: 'New CAD/dispatch alert received' },
  { event: 'nfirs.ready',             description: 'NFIRS report status changed to Complete' },
  { event: 'mutual_aid.activated',    description: 'Mutual aid partner activated' },
  { event: 'mutual_aid.recommended',  description: 'AI recommends mutual aid activation' },
  { event: 'intelligence.critical',   description: 'Critical intelligence signal (MAYDAY, FF_DOWN, etc.)' },
  { event: 'exposure.created',        description: 'Exposure record created for personnel' },
  { event: 'test.ping',               description: 'Test event for verifying webhook delivery' },
  { event: '*',                        description: 'Subscribe to all events' },
];

module.exports = {
  dispatch,
  listSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  getDeliveryLog,
  testSubscription,
  AVAILABLE_EVENTS,
  signPayload,
};
