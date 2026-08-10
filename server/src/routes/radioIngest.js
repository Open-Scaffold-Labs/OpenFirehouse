// routes/radioIngest.js — Public radio ingest endpoint
// POST /api/radio-ingest — station hardware posts here (API key auth, no JWT)
// This is the endpoint the Raspberry Pi / SDR gateway calls from the station.
// Authentication is via the station's radio API key (not JWT).

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { processRadioIntelligence } = require('../utils/inboundIntelligence');

// A MISLABELLED POST USED TO BE ACCEPTED AND DISCARDED, SILENTLY.
// The global express.json() parses only `application/json`. The SDR/Pi gateway
// posting the identical body as text/plain, form-urlencoded, or with no
// content-type left `req.body === {}` — so `entries` became `[{}]`, the
// transcript check skipped it, and the station was answered
// `200 {ok:true, count:0}`. The transcript was gone and the gateway was told it
// had succeeded. Reproduced against the real parser before this fix.
//
// Fixed the way routes/avl.js already does it: json first, then a catch-all text
// parser so nothing silently becomes an empty object. Anything the text parser
// picks up is parsed here, and a body we cannot read is REFUSED (400) rather
// than answered with a cheerful zero.
//
// Note the deliberate difference from CAD ingest: radio has no
// persist-before-parse receipt. CAD needs one because NENA-STA-024 gives the
// sender no retry, so an unreadable dispatch must still be kept. Radio has no
// such constraint and a retryable client, so failing loudly is the correct and
// proportionate answer — do not copy the CAD ingest-log machinery here.
const parsers = [
  express.json({ limit: '512kb' }),
  express.text({ type: () => true, limit: '512kb' }),
];

/**
 * Normalize whatever the parsers produced into an array of entry objects.
 * @returns {{ entries: object[] } | { error: string }}
 */
function normalizeEntries(body) {
  let parsed = body;

  if (typeof parsed === 'string') {
    const raw = parsed.trim();
    if (!raw) return { error: 'Empty request body' };
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { error: `Body is not valid JSON: ${e.message}` };
    }
  }

  if (parsed == null || typeof parsed !== 'object') {
    return { error: 'Body must be a JSON object or an array of them' };
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed];
  if (!entries.length) return { error: 'Empty batch' };
  return { entries };
}

router.post('/', ...parsers, async (req, res) => {
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

    // Accept single or batch entries. A body we cannot read is refused here,
    // loudly — never counted as zero and acknowledged.
    const norm = normalizeEntries(req.body);
    if (norm.error) {
      return res.status(400).json({ error: norm.error, code: 'RADIO_UNPARSEABLE' });
    }
    const entries = norm.entries;
    // Persist all rows inside the resolved station's department context
    // (RLS-ready; behavior-neutral until P5_TXN=on).
    // An entry with no transcript is skipped — but the skip is COUNTED and
    // returned, never swallowed. Same doctrine as the CAD status pipeline: a
    // sender that posted something and had it dropped must be able to tell from
    // the response, rather than reading `count: 0` as success.
    let skipped = 0;
    const results = await db.runWithDepartment(stationId, null, async () => {
      const out = [];
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object' ||
            !entry.transcript || String(entry.transcript).trim() === '') {
          skipped++;
          continue;
        }
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

    res.json({ ok: true, count: results.length, received: entries.length, skipped });
  } catch (e) {
    console.error('radio-ingest error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
// Exported for tests/radioIngestBody.test.js — the mislabelled-content-type
// regression lives in the parser + normalizer, so the test exercises those
// directly rather than needing a database.
module.exports.normalizeEntries = normalizeEntries;
module.exports.parsers = parsers;
