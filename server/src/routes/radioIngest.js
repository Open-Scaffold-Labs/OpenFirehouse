// routes/radioIngest.js — Public radio ingest endpoint
// POST /api/radio-ingest — station hardware posts here (API key auth, no JWT)
// This is the endpoint the Raspberry Pi / SDR gateway calls from the station.
// Authentication is via the station's radio API key (not JWT).

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { processRadioIntelligence } = require('../utils/inboundIntelligence');

router.post('/', async (req, res) => {
  try {
    const apiKey = req.headers['x-radio-api-key'] || req.query.key;
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing X-Radio-API-Key header or ?key= parameter' });
    }

    // Look up station by radio API key
    const config = await db.query(
      'SELECT station_id FROM radio_config WHERE api_key = $1 AND enabled = true',
      [apiKey]
    );
    if (!config.rows.length) {
      return res.status(403).json({ error: 'Invalid or disabled radio API key' });
    }
    const stationId = config.rows[0].station_id;

    // Accept single or batch entries
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    // Persist all rows inside the resolved station's department context
    // (RLS-ready; behavior-neutral until P5_TXN=on).
    const results = await db.runWithDepartment(stationId, null, async () => {
      const out = [];
      for (const entry of entries) {
        if (!entry.transcript || entry.transcript.trim() === '') continue;
        out.push(await db.radioLog.insert(stationId, entry));
      }
      return out;
    });

    // Side effects AFTER commit, OUTSIDE the txn context — the intelligence
    // pipeline does its own DB work and must not run on the committed/released
    // request client.
    for (const row of results) {
      if (global.radioWsBroadcast) global.radioWsBroadcast(stationId, row);
      processRadioIntelligence(row, stationId).then(intel => {
        if (intel.isCritical && global.radioWsBroadcast) {
          global.radioWsBroadcast(stationId, {
            type: 'intelligence_alert',
            priority: intel.priority,
            tags: intel.tags,
            incidentMatch: intel.incidentMatch,
            transcript: row.transcript,
          });
        }
      }).catch(() => {});
    }

    res.json({ ok: true, count: results.length });
  } catch (e) {
    console.error('radio-ingest error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
