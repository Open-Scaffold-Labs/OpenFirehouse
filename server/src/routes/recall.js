'use strict';
/**
 * routes/recall.js — Recall / All-Call system
 *
 * POST   /api/recall              — issue a new recall (officer+)
 *                                   → broadcasts push + SMS to all active members
 * GET    /api/recall              — list all recalls for the station
 * GET    /api/recall/active       — get the current active recall (if any)
 * GET    /api/recall/:id          — get a specific recall with all responses
 * POST   /api/recall/:id/respond  — member responds (Responding / Not Available + ETA)
 * PATCH  /api/recall/:id/close    — officer closes the recall
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { broadcastToStation, broadcastExpoToDepartment } = require('./push');
const { broadcastRecallPing } = require('../config/supabaseRealtime');

const LEVEL_LABELS = {
  additional: 'Request for Additional Resources',
  full:       'Full Department Recall',
  standby:    'Standby Alert',
};

// ── Twilio SMS helper ──────────────────────────────────────────────────────
// Lazily initialised — only if the three env vars are present.
// If not configured, sendSms() is a no-op so the rest of the recall flow
// continues normally (push notifications still fire).

function getTwilioClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  try {
    return require('twilio')(sid, token);
  } catch (e) {
    console.warn('Twilio not available:', e.message);
    return null;
  }
}

// Normalise any common phone format to E.164 (+1XXXXXXXXXX for US numbers).
// Returns null if the number can't be normalised.
function toE164(raw) {
  if (!raw) return null;
  // Strip everything except digits and leading +
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;               // 5551234567
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`; // 15551234567
  if (raw.startsWith('+') && digits.length >= 10) return `+${digits}`; // already E.164-ish
  return null; // unrecognisable
}

// Send SMS to a single E.164 number. Swallows errors per-number so one bad
// number doesn't abort the rest of the blast.
async function sendSms(client, from, to, body) {
  try {
    await client.messages.create({ from, to, body });
  } catch (e) {
    console.warn(`SMS to ${to} failed:`, e.message);
  }
}

// Blast an SMS to every active member with a phone number.
// Returns { sent, skipped } counts.
async function smsBlastMembers(stationId, messageBody) {
  const client = getTwilioClient();
  const from   = process.env.TWILIO_FROM_NUMBER;
  console.log(`[SMS] TWILIO_ACCOUNT_SID=${process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'MISSING'} TWILIO_AUTH_TOKEN=${process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'MISSING'} TWILIO_FROM_NUMBER=${from || 'MISSING'} client=${client ? 'OK' : 'NULL'}`);
  if (!client || !from) {
    console.warn('[SMS] Aborting — Twilio not fully configured');
    return { sent: 0, skipped: 0, reason: 'not_configured' };
  }

  let sent = 0, skipped = 0;
  try {
    // db.members.all returns a plain array
    const rows = await db.members.all(stationId);

    console.log(`[SMS] ${rows.length} total members found for station ${stationId}`);
    for (const m of rows) {
      if (!['Active', 'Probationary'].includes(m.status)) {
        console.log(`[SMS] Skipping ${m.name} — status: ${m.status}`);
        skipped++; continue;
      }
      const e164 = toE164(m.phone);
      if (!e164) {
        console.log(`[SMS] Skipping ${m.name} — phone "${m.phone}" could not be converted to E.164`);
        skipped++; continue;
      }
      console.log(`[SMS] Sending to ${m.name} at ${e164}`);
      await sendSms(client, from, e164, messageBody);
      sent++;
    }
  } catch (e) {
    console.error('smsBlastMembers error:', e);
  }
  return { sent, skipped };
}

// ── Issue a recall ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    if (!['officer', 'chief'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Officer or Chief role required to issue a recall.' });
    }

    const { level = 'additional', incidentType = '', location = '', message = '' } = req.body;
    const issuedBy = req.user.name || req.user.username || 'Officer';

    const recall = await db.recall.create(req.user.department_id, {
      level, incidentType, location, message, issuedBy,
    });

    const levelLabel = LEVEL_LABELS[level] || level;

    // ── Push notification ────────────────────────────────────────────────
    const pushTitle = `🚨 ${levelLabel.toUpperCase()}`;
    const pushBody  = [
      incidentType && `${incidentType}`,
      location     && `@ ${location}`,
      message      && `— ${message}`,
    ].filter(Boolean).join(' ') || 'All available members requested.';

    await broadcastToStation(req.user.department_id, {
      title: pushTitle,
      body:  pushBody,
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [300, 100, 300, 100, 300],
      data: {
        url:      `/?page=recall&id=${recall.id}`,
        recallId: recall.id,
        type:     'recall',
      },
      tag:               `recall-${recall.id}`,
      requireInteraction: true,
    });

    // ── SMS blast ────────────────────────────────────────────────────────
    const appUrl    = process.env.APP_URL || 'https://open-firehouse-client.vercel.app';
    const respondUrl = `${appUrl}/?page=recall&id=${recall.id}`;

    const smsLines = [
      `🚨 ${levelLabel}`,
      incidentType && incidentType,
      location     && `Location: ${location}`,
      message      && message,
      `Respond: ${respondUrl}`,
    ].filter(Boolean);

    const smsBody = smsLines.join('\n');

    // Fire-and-forget — don't block the HTTP response waiting for every SMS
    smsBlastMembers(req.user.department_id, smsBody)
      .then(({ sent, skipped, reason }) => {
        if (reason !== 'not_configured') {
          console.log(`Recall ${recall.id}: SMS sent=${sent} skipped=${skipped}`);
        }
      })
      .catch(e => console.error('SMS blast error:', e));

    // Realtime ping (id only) so in-app clients (companion Recall tab) raise the
    // recall instantly — push/SMS are the locked-phone path; this is the foreground one.
    await broadcastRecallPing(req.user.department_id, recall.id);

    // Expo push fan-out to mobile devices (locked-phone path), best-effort. critical
    // = the intent; true Critical-Alert delivery also needs the iOS entitlement.
    void broadcastExpoToDepartment(req.user.department_id, {
      title: `🚨 ${levelLabel.toUpperCase()}`,
      body: pushBody,
      data: { type: 'recall', recallId: recall.id },
      critical: true,
    });

    res.status(201).json({ data: recall });
  } catch (err) {
    console.error('POST /recall error:', err);
    res.status(500).json({ error: 'Failed to issue recall' });
  }
});

// ── List all recalls ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const list = await db.recall.allForStation(req.user.department_id);
    res.json({ data: list, count: list.length });
  } catch (err) {
    console.error('GET /recall error:', err);
    res.status(500).json({ error: 'Failed to fetch recalls' });
  }
});

// ── Get active recall ──────────────────────────────────────────────────────
router.get('/active', async (req, res) => {
  try {
    const recall = await db.recall.active(req.user.department_id);
    res.json({ data: recall || null });
  } catch (err) {
    console.error('GET /recall/active error:', err);
    res.status(500).json({ error: 'Failed to fetch active recall' });
  }
});

// ── Get one recall ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const recall = await db.recall.findById(Number(req.params.id), req.user.department_id);
    if (!recall) return res.status(404).json({ error: 'Recall not found' });
    res.json({ data: recall });
  } catch (err) {
    console.error('GET /recall/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch recall' });
  }
});

// ── Member responds ────────────────────────────────────────────────────────
router.post('/:id/respond', async (req, res) => {
  try {
    const { response, eta = '', destination = null } = req.body;
    if (!['responding', 'unavailable'].includes(response)) {
      return res.status(400).json({ error: 'response must be "responding" or "unavailable"' });
    }
    // 0037 structured destination (Station/Scene/Unable). Optional + additive:
    // old clients omit it (NULL = responding, unspecified). Only valid with
    // "responding"; "unavailable" IS the Unable state.
    if (destination != null && !['station', 'scene'].includes(destination)) {
      return res.status(400).json({ error: 'destination must be "station" or "scene"' });
    }
    if (destination != null && response !== 'responding') {
      return res.status(400).json({ error: 'destination only applies to "responding"' });
    }

    const recall = await db.recall.findById(Number(req.params.id), req.user.department_id);
    if (!recall) return res.status(404).json({ error: 'Recall not found' });
    if (recall.status !== 'active') {
      return res.status(400).json({ error: 'Recall is no longer active' });
    }

    const memberName = req.user.name || req.user.username || 'Member';
    const result = await db.recall.respond(
      Number(req.params.id),
      req.user.id,
      memberName,
      response,
      eta,
      destination
    );
    res.json({ data: result });
  } catch (err) {
    console.error('POST /recall/:id/respond error:', err);
    res.status(500).json({ error: 'Failed to record response' });
  }
});

// ── Close a recall ─────────────────────────────────────────────────────────
router.patch('/:id/close', async (req, res) => {
  try {
    if (!['officer', 'chief'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Officer or Chief role required.' });
    }
    const closed = await db.recall.close(Number(req.params.id), req.user.department_id);
    if (!closed) return res.status(404).json({ error: 'Recall not found' });
    await broadcastRecallPing(req.user.department_id, closed.id); // clients refetch → active recall clears
    res.json({ data: closed });
  } catch (err) {
    console.error('PATCH /recall/:id/close error:', err);
    res.status(500).json({ error: 'Failed to close recall' });
  }
});

module.exports = router;
