// routes/radio.js — Radio integration API
// POST /api/radio/ingest      — receive transcribed radio messages (from station hardware)
// GET  /api/radio/recent      — recent radio log entries
// GET  /api/radio/search      — search radio log
// GET  /api/radio/config      — get station radio configuration
// PUT  /api/radio/config      — update station radio configuration
// POST /api/radio/simulate    — inject test radio messages (for development)

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── Ingest: station hardware posts transcribed radio messages ─────────────
// This is the primary endpoint that the Raspberry Pi / SDR gateway calls.
// It also broadcasts the message to all connected WebSocket clients.
router.post('/ingest', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    for (const entry of entries) {
      if (!entry.transcript || entry.transcript.trim() === '') continue;
      const row = await db.radioLog.insert(stationId, entry);
      results.push(row);

      // Broadcast to WebSocket clients if available
      if (global.radioWsBroadcast) {
        global.radioWsBroadcast(stationId, row);
      }
    }

    res.json({ data: results, count: results.length });
  } catch (e) {
    console.error('radio ingest error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Recent: get last N radio log entries ──────────────────────────────────
router.get('/recent', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const rows = await db.radioLog.recent(stationId, limit);
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Search: full-text search with filters ─────────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { q, talkgroup, startDate, endDate, limit } = req.query;
    const rows = await db.radioLog.search(stationId, {
      q, talkgroup, startDate, endDate,
      limit: Math.min(parseInt(limit) || 100, 500),
    });
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Config: get radio configuration ───────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const config = await db.radioConfig.get(stationId);
    res.json({ data: config || { enabled: false, talkgroups: [], dispatch_keywords: [], whisper_mode: 'cloud', retention_days: 30 } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Config: update radio configuration ────────────────────────────────────
router.put('/config', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const config = await db.radioConfig.upsert(stationId, req.body);
    res.json({ data: config });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Simulate: inject fake radio messages for testing ──────────────────────
router.post('/simulate', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const messages = [
      { talkgroup: 'Fire Dispatch', talkgroup_id: 1, transcript: 'Engine 14, respond to 200 Elm Street for a reported structure fire, caller reports smoke showing from the second floor.', confidence: 0.94, duration_sec: 8.2, is_dispatch: true, priority: 'emergency', source: 'simulate' },
      { talkgroup: 'Fire Dispatch', talkgroup_id: 1, transcript: 'Engine 14 responding, 200 Elm Street, structure fire.', confidence: 0.97, duration_sec: 3.1, is_dispatch: false, priority: 'normal', source: 'simulate' },
      { talkgroup: 'Fireground Tac 1', talkgroup_id: 3, transcript: 'Command from Engine 14, on scene 200 Elm Street, two-story ordinary, smoke showing side Alpha, establishing Elm Street command.', confidence: 0.91, duration_sec: 7.5, is_dispatch: false, priority: 'urgent', source: 'simulate' },
      { talkgroup: 'Fire Dispatch', talkgroup_id: 1, transcript: 'Ladder 14 responding, 200 Elm Street.', confidence: 0.98, duration_sec: 2.4, is_dispatch: false, priority: 'normal', source: 'simulate' },
      { talkgroup: 'Fireground Tac 1', talkgroup_id: 3, transcript: 'Elm Street command, give me a second alarm, fire extending to the attic through the Charlie side.', confidence: 0.88, duration_sec: 5.8, is_dispatch: false, priority: 'emergency', source: 'simulate' },
      { talkgroup: 'EMS', talkgroup_id: 5, transcript: 'Medic 1 is available at Maplewood Regional, returning to quarters.', confidence: 0.96, duration_sec: 3.8, is_dispatch: false, priority: 'normal', source: 'simulate' },
      { talkgroup: 'Fireground Tac 1', talkgroup_id: 3, transcript: 'Entry team to command, fire knocked on the second floor, checking for extension.', confidence: 0.90, duration_sec: 4.2, is_dispatch: false, priority: 'normal', source: 'simulate' },
      { talkgroup: 'Fire Dispatch', talkgroup_id: 1, transcript: 'All units on the second alarm, Elm Street command reports fire under control at this time.', confidence: 0.95, duration_sec: 5.1, is_dispatch: true, priority: 'normal', source: 'simulate' },
    ];

    const results = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      // Stagger timestamps so they appear in order
      const row = await db.radioLog.insert(stationId, msg);
      results.push(row);
      // Broadcast to WebSocket clients
      if (global.radioWsBroadcast) {
        global.radioWsBroadcast(stationId, row);
      }
    }

    res.json({ data: results, count: results.length, message: 'Simulated 8 radio transmissions' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
