// routes/activeBoard.js — live Command Board incident broadcast
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireDispatch } = require('../middleware/requireDispatch');
const { broadcastUnitStatusChanged } = require('../config/supabaseRealtime');

// GET  /api/active-board — Dashboard polls this
router.get('/', async (req, res) => {
  try {
    const board = await db.activeBoard.get(req.user.department_id);
    res.json({ data: board });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT  /api/active-board — Command Board calls when incident activates/updates
router.put('/', async (req, res) => {
  try {
    const board = await db.activeBoard.upsert(req.user.department_id, req.body);
    res.json({ data: board });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/active-board/link-incident — attach the active call to a saved
// incident record so its per-apparatus status history (NFIRS times) is captured.
// Called by the Command Board right after it saves the incident, BEFORE close.
router.post('/link-incident', requireDispatch, async (req, res) => {
  try {
    const incidentId = Number(req.body?.incident_id);
    if (!Number.isInteger(incidentId)) {
      return res.status(400).json({ error: 'incident_id is required' });
    }
    const board = await db.activeBoard.get(req.user.department_id);
    if (!board) return res.status(404).json({ error: 'No active call to link' });
    await db.activeBoard.setIncident(req.user.department_id, incidentId);
    // Stamp this call's history rows so far (dispatched / en route / on scene / …).
    const since = board.dispatched_at || new Date(0).toISOString();
    const backfilled = await db.unitStatus.backfillIncident(req.user.department_id, incidentId, since);
    res.json({ data: { incident_id: incidentId, backfilled } });
  } catch (e) {
    console.error('POST /active-board/link-incident error:', e);
    res.status(500).json({ error: 'Failed to link incident' });
  }
});

// DELETE /api/active-board — clear/close the active call.
// Dispatch-controlled: only Dispatch or a Chief may clear a call (requireDispatch).
router.delete('/', requireDispatch, async (req, res) => {
  try {
    await db.activeBoard.clear(req.user.department_id);
    // RADIO DOCTRINE (2026-06-10): closing the board does NOT touch unit
    // statuses. Command terminated ≠ units released — a rig stays "on scene"
    // until its officer radios back in service and dispatch flips it. Units
    // still committed to a closed call are flagged `orphaned` on the board.
    res.json({ data: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
