// Push notification routes
// POST /api/push/subscribe   — save a web-push subscription
// DELETE /api/push/subscribe — remove a subscription (unsubscribe)
// POST /api/push/test        — send a test notification (chief/officer only)

const express  = require('express');
const webpush  = require('web-push');
const db       = require('../db');

const router = express.Router();

// Configure VAPID — keys come from environment variables
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

let vapidConfigured = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(
      'mailto:support@openfirehouse.app',
      VAPID_PUBLIC,
      VAPID_PRIVATE
    );
    vapidConfigured = true;
  } catch (err) {
    console.warn('⚠️  VAPID key invalid — push notifications disabled:', err.message);
  }
}

// ── Save subscription ──────────────────────────────────────────────────────
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription object' });
    // NOTE: this app has no session middleware — auth is JWT via requireAuth,
    // which sets req.user. (The old session-based lookup here was always
    // undefined, silently landing every subscription in station 1 — fixed
    // 2026-06-10, W2.5 audit.)
    const stationId = req.user.department_id;
    const userId    = req.user.id;
    await db.pushSubscriptions.upsert(subscription, userId, stationId);
    res.json({ ok: true });
  } catch (err) {
    console.error('push subscribe error:', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// ── Remove subscription ────────────────────────────────────────────────────
router.delete('/subscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    await db.pushSubscriptions.remove(endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// ── Test push ──────────────────────────────────────────────────────────────
router.post('/test', async (req, res) => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(503).json({ error: 'Push notifications not configured (missing VAPID keys).' });
  }
  try {
    const stationId = req.user.department_id;
    const subs = await db.pushSubscriptions.allForStation(stationId);
    if (!subs.length) return res.json({ sent: 0, message: 'No subscribers found.' });

    const payload = JSON.stringify({
      title: 'Open Firehouse — Test',
      body:  'Push notifications are working! ✅',
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (e) {
        if (e.statusCode === 410) await db.pushSubscriptions.remove(sub.endpoint);
      }
    }
    res.json({ sent });
  } catch (err) {
    console.error('push test error:', err);
    res.status(500).json({ error: 'Failed to send test push' });
  }
});

// ── Helper: broadcast to a station (used internally by incidents route) ───
async function broadcastToStation(stationId, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    const subs = await db.pushSubscriptions.allForStation(stationId);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (e) {
        if (e.statusCode === 410) await db.pushSubscriptions.remove(sub.endpoint);
      }
    }
  } catch (err) {
    console.error('broadcastToStation error:', err);
  }
}

// ── Expo push (mobile: companion phone + command iPad) ──────────────────────
// The mobile app registers its Expo push token here so a recall/dispatch can wake
// a locked/DND phone. This is the ONE non-recall write a companion phone makes, so
// /api/push/expo-register is on the companionGate allowlist (registering to RECEIVE
// notifications isn't an OF-data write). The token is scoped to the caller (JWT).

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const isExpoToken = (t) => typeof t === 'string' && /^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/.test(t.trim());

// POST /api/push/expo-register { token, deviceName? }
router.post('/expo-register', async (req, res) => {
  try {
    const { token, deviceName = null } = req.body || {};
    if (!isExpoToken(token)) return res.status(400).json({ error: 'Valid Expo push token required.', code: 'BAD_TOKEN' });
    await db.pool.query(
      `INSERT INTO expo_push_tokens (user_id, station_id, department_id, token, device_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (token) DO UPDATE
         SET user_id = $1, station_id = $2, department_id = $3, device_name = $5, updated_at = NOW()`,
      [req.user.id, req.user.stationId, req.user.department_id, token.trim(), deviceName],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('expo-register error:', err);
    res.status(500).json({ error: 'Failed to register push token.' });
  }
});

// DELETE /api/push/expo-register { token } — unregister on logout/disable.
router.delete('/expo-register', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!isExpoToken(token)) return res.status(400).json({ error: 'Valid Expo push token required.', code: 'BAD_TOKEN' });
    // Scope to the caller — a session can only remove its own token.
    await db.pool.query('DELETE FROM expo_push_tokens WHERE token = $1 AND user_id = $2', [token.trim(), req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('expo-unregister error:', err);
    res.status(500).json({ error: 'Failed to unregister push token.' });
  }
});

/**
 * Best-effort Expo fan-out to a department's registered devices. No dependency —
 * a plain HTTPS POST to Expo's push API in ≤100-token chunks. NEVER throws (the
 * caller's DB write is authoritative; push is an enhancement). Prunes tokens Expo
 * reports as DeviceNotRegistered. `interruptionLevel:'critical'` is the INTENT for
 * a dispatch/recall — delivery as a true iOS Critical Alert additionally requires
 * the Apple critical-alerts entitlement on the build (Phase H / device-gated).
 */
async function broadcastExpoToDepartment(departmentId, { title, body, data = {}, critical = false }) {
  if (departmentId == null) return { sent: 0 };
  let sent = 0;
  try {
    const { rows } = await db.pool.query('SELECT token FROM expo_push_tokens WHERE department_id = $1', [departmentId]);
    const tokens = rows.map((r) => r.token).filter(isExpoToken);
    for (let i = 0; i < tokens.length; i += 100) {
      const chunk = tokens.slice(i, i + 100);
      const messages = chunk.map((to) => ({
        to, title, body, data,
        sound: critical ? 'default' : 'default',
        priority: 'high',
        ...(critical ? { interruptionLevel: 'critical' } : { interruptionLevel: 'time-sensitive' }),
      }));
      try {
        const r = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(messages),
        });
        const out = await r.json().catch(() => null);
        const receipts = out?.data || [];
        for (let j = 0; j < receipts.length; j++) {
          if (receipts[j]?.status === 'ok') sent++;
          else if (receipts[j]?.details?.error === 'DeviceNotRegistered') {
            await db.pool.query('DELETE FROM expo_push_tokens WHERE token = $1', [chunk[j]]).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('expo push chunk failed (non-fatal):', e.message);
      }
    }
  } catch (err) {
    console.error('broadcastExpoToDepartment error:', err);
  }
  return { sent };
}

module.exports = { router, broadcastToStation, broadcastExpoToDepartment };
