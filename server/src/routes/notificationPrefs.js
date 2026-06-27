'use strict';
/**
 * routes/notificationPrefs.js — rank-derived notification configuration.
 *
 * Notifications are determined by RANK TIER, not per member. This exposes the
 * department's effective matrix (fixed defaults + chief overrides) and lets a
 * chief edit it. Mounted at /api/notifications in index.js (after requireAuth).
 *
 *   GET   /api/notifications/rank-config   — any authed user; returns the full
 *           matrix, plus THIS caller's tier + effective settings + cert scope.
 *   PATCH /api/notifications/rank-config   — chief only; upserts overrides.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireChief } = require('../middleware/requireRole');
const { roleLevel }    = require('../middleware/requireRole');
const { TIERS, NOTIF_TYPES, CERT_SCOPE, tierForRole, mergeMatrix } = require('../config/rankNotifications');
const { resolveCertScope } = require('../lib/certScope');

// ── GET /api/notifications/rank-config ────────────────────────────────────────
router.get('/rank-config', async (req, res) => {
  try {
    const overrides = await db.rankNotifications.getOverrides(req.user.department_id);
    const matrix = mergeMatrix(overrides);
    const tier = tierForRole(req.user.role, roleLevel(req.user.role));
    const cert = await resolveCertScope({ userId: req.user.id, departmentId: req.user.department_id, stationId: req.user.stationId }, tier);
    res.set('Cache-Control', 'no-store');
    res.json({
      data: {
        matrix,                       // { tier: { type: bool } }
        tiers: TIERS,
        types: NOTIF_TYPES,
        certScope: CERT_SCOPE,        // doctrine labels for the chief UI display
        me: { tier, settings: matrix[tier], certScope: cert.certScope, certMemberIds: cert.certMemberIds, memberId: cert.memberId },
      },
    });
  } catch (e) {
    console.error('GET /notifications/rank-config error:', e);
    res.status(500).json({ error: 'Failed to load notification config' });
  }
});

// ── PATCH /api/notifications/rank-config ──────────────────────────────────────
// Body: { overrides: [{ tier, notif_type, enabled }] }. Chief only.
router.patch('/rank-config', requireChief, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.overrides) ? req.body.overrides : null;
    if (!rows) return res.status(400).json({ error: 'overrides[] required' });
    const clean = [];
    for (const r of rows) {
      if (!TIERS.includes(r.tier) || !NOTIF_TYPES.includes(r.notif_type)) {
        return res.status(400).json({ error: `Invalid tier/notif_type: ${r.tier}/${r.notif_type}` });
      }
      clean.push({ tier: r.tier, notif_type: r.notif_type, enabled: !!r.enabled });
    }
    await db.rankNotifications.setOverrides(req.user.department_id, clean);
    const matrix = mergeMatrix(await db.rankNotifications.getOverrides(req.user.department_id));
    res.json({ data: { matrix } });
  } catch (e) {
    console.error('PATCH /notifications/rank-config error:', e);
    res.status(500).json({ error: 'Failed to save notification config' });
  }
});

module.exports = router;
