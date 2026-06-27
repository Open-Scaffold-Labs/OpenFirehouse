'use strict';
/**
 * routes/alerts.js — the live, per-department alert feed.
 *
 *   GET /api/alerts → { data: { alerts: [...] } }
 *
 * Computes the viewer's alerts from LIVE department data (apparatus service,
 * asset/equipment inspections + condition, certification expirations, shift
 * understaffing), applying the rank-notification category gating and the
 * cert-oversight scope SERVER-SIDE (so scope is enforced, not just hidden in the
 * client). Replaces the old client-side static demo-data alert engine — so a real
 * department sees ITS data, and a brand-new department with no data sees a clean
 * empty list (never bundled demo content).
 *
 * Mounted at /api/alerts in index.js (after requireAuth).
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { roleLevel } = require('../middleware/requireRole');
const { tierForRole, mergeMatrix } = require('../config/rankNotifications');
const { resolveCertScope } = require('../lib/certScope');
const { deriveAlerts } = require('../lib/deriveAlerts');

router.get('/', async (req, res) => {
  try {
    const dept = req.user.department_id;
    const tier = tierForRole(req.user.role, roleLevel(req.user.role));

    // Rank-notification category gating (defaults + chief overrides).
    const matrix = mergeMatrix(await db.rankNotifications.getOverrides(dept));
    const settings = matrix[tier] || {};
    const enabled = {
      certs:       settings.certs !== false,
      maintenance: settings.maintenance !== false,
      schedule:    settings.schedule !== false,
    };

    // Cert-oversight scope for this viewer + the LIVE department data, in parallel.
    const [cert, apparatus, assets, shifts, training] = await Promise.all([
      resolveCertScope({ userId: req.user.id, departmentId: dept, stationId: req.user.stationId }, tier),
      db.apparatus.all(dept).catch(() => []),
      db.assets.all(dept).catch(() => []),
      db.shifts.all(dept).catch(() => []),
      db.training.all(dept).catch(() => []),
    ]);

    // Optional per-request thresholds (NotificationsCenter panel), clamped sane.
    const clamp = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined; };
    const thresholds = {};
    for (const [k, lo, hi] of [['certExpiry', 0, 365], ['apparatusService', 0, 365], ['assetInspection', 0, 365], ['shiftMinCrew', 0, 50]]) {
      if (req.query[k] != null) { const c = clamp(req.query[k], lo, hi); if (c != null) thresholds[k] = c; }
    }

    const alerts = deriveAlerts(
      { apparatus, assets, shifts, training },
      { thresholds, enabled, certScope: cert.certScope, certMemberIds: cert.certMemberIds, viewerMemberId: cert.memberId },
    );

    res.set('Cache-Control', 'no-store');
    res.json({ data: { alerts } });
  } catch (e) {
    console.error('GET /alerts error:', e);
    // Surface the failure — the client must NOT render an error as "all clear"
    // (a hidden life-safety alert is the worst outcome).
    res.status(500).json({ error: 'Failed to load alerts' });
  }
});

module.exports = router;
