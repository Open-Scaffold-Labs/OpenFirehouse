'use strict';
/**
 * routes/avl.js — public AVL ingest (ADR-0003). NO JWT — a hardware AVL feed
 * authenticates with its department's shared secret (deviceAuth). Mounted before
 * requireAuth, alongside the other hardware-ingest routes (radio-ingest, cad).
 *
 * POST /api/avl/ingest            — vendor taken from the connection
 * POST /api/avl/ingest/:vendorId  — override the adapter (e.g. 'nmea')
 * Body: JSON (object/array) for the generic contract, or text/plain for NMEA.
 * Best-effort: returns a small summary; a feed posting frequently is expected.
 */
const express = require('express');
const router = express.Router();
const { verifyAvlSecret } = require('../avl/deviceAuth');
const { ingest } = require('../avl');

async function handle(req, res) {
  try {
    const conn = await verifyAvlSecret(req);
    if (!conn) return res.status(401).json({ error: 'Unauthorized AVL feed', code: 'AVL_UNAUTHORIZED' });

    const vendorId = req.params.vendorId || conn.vendorId;
    const deviceRef = req.query.device || req.query.deviceRef || null;
    const result = await ingest(
      { ...conn, vendorId },
      req.body,
      deviceRef ? String(deviceRef) : null,
    );
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('POST /api/avl/ingest error:', e);
    return res.status(500).json({ error: 'AVL ingest failed' });
  }
}

// Accept JSON first; fall back to raw text (NMEA) for any other content-type.
const parsers = [
  express.json({ limit: '512kb' }),
  express.text({ type: () => true, limit: '512kb' }),
];

router.post('/ingest', ...parsers, handle);
router.post('/ingest/:vendorId', ...parsers, handle);

module.exports = router;
