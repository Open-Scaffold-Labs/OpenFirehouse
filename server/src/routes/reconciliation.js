'use strict';
/**
 * reconciliation.js — 4.1a-R.5 · the call ↔ report reconciliation queue.
 *
 * Spec: docs/PHASE4-1aR-CALL-INCIDENT-ASSOCIATION-2026-07-26.md §4.1a-R.5
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * This is the market bar for a failed call→report association, and it is the
 * ONLY thing that stops a missed association from surfacing months later as a
 * hole in an annual compliance report.
 *
 * Every platform surveyed ships one, admin-gated, with a MISSING status for CAD
 * records that have no matching report — and "reconciliation" is the industry's
 * own word for it. (Searches for "exceptions queue", "unmatched", "orphaned
 * records" and "pending review" return ZERO hits across fire/EMS documentation,
 * while the same searches surface deep pages on those sites. The vocabulary
 * difference is real; using ours would have meant nothing to a customer.)
 *
 * It is deliberately a QUEUE, not a toast. A notice an officer dismisses at 0300
 * and a list a records clerk can actually work through in March are different
 * artifacts, and the market ships the second one — reviewed by exactly the
 * person who compiles the annual report.
 *
 * ─── DOCTRINE ───────────────────────────────────────────────────────────────
 * • READ is officer+; the REPAIR WRITE is chief-only. No surveyed platform lets
 *   a field user re-associate after record creation — every repair surface found
 *   is admin-gated. A repaired association needs an attributable operator.
 * • Repair goes through the SAME one door as creation (utils/callAssociation),
 *   so a reconciled record and a picked one are indistinguishable afterwards.
 * • Every repair is audited. This is a legal record's provenance.
 * • Nothing here is a guess. A call with no report is REPORTED, never auto-matched
 *   on timing — that is the cross-attribution this whole design exists to kill.
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireChief } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { associateCallToIncident, ASSOCIATION_RESULT } = require('../utils/callAssociation');

const windowQuery = z.object({
  days: z.string().regex(/^\d{1,3}$/).optional(),
  limit: z.string().regex(/^\d{1,4}$/).optional(),
});

function clampWindow(q) {
  const days = Math.min(Math.max(parseInt(q.days, 10) || 30, 1), 365);
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 200, 1), 500);
  return { days, limit };
}

/**
 * GET /api/reconciliation — the queue.
 *
 * Two directions, because the market's reconciliation summary compares CAD
 * against RMS in both:
 *   missing_report — a CAD call nobody filed a report for. THE actionable one.
 *   missing_call   — a report with no CAD call. Often entirely legitimate (a
 *                    walk-in, a still alarm, a department with no feed), so it
 *                    is presented as information, never as an error to clear.
 *
 * The server does NOT derive "today" (fiReports doctrine 8 / checks.js): the
 * window is a parameter and dates come back as they are stored.
 */
router.get('/',
  validate({ query: windowQuery }),
  scoped(async ({ req, stationId }) => {
    const { days, limit } = clampWindow(req.query);

    const missingReport = await pool.query(
      `SELECT a.id, a.alert_id, a.address, a.units, a.description,
              a.dispatched_at, a.cleared_at
         FROM cad_alerts a
        WHERE a.department_id = $1
          AND a.incident_id IS NULL
          AND a.dispatched_at >= NOW() - ($2 || ' days')::interval
        ORDER BY a.dispatched_at DESC
        LIMIT $3`,
      [stationId, String(days), limit]
    );

    const missingCall = await pool.query(
      `SELECT i.id, i."incidentNumber", i.date, i.time, i.type, i.address
         FROM incidents i
        WHERE i.department_id = $1
          AND i.cad_run_number IS NULL
          AND i.deleted_at IS NULL
          AND i.date >= to_char(NOW() - ($2 || ' days')::interval, 'YYYY-MM-DD')
        ORDER BY i.date DESC, i.time DESC
        LIMIT $3`,
      [stationId, String(days), limit]
    );

    const linked = await pool.query(
      `SELECT count(*)::int AS n FROM cad_alerts
        WHERE department_id = $1 AND incident_id IS NOT NULL
          AND dispatched_at >= NOW() - ($2 || ' days')::interval`,
      [stationId, String(days)]
    );

    return {
      data: {
        window_days: days,
        missing_report: missingReport.rows,
        missing_call: missingCall.rows,
        linked_count: linked.rows[0]?.n ?? 0,
      },
    };
  }));

/**
 * POST /api/reconciliation/associate — the repair. CHIEF ONLY, audited.
 *
 * Goes through the same single door as the picker. Refuses exactly what the
 * picker refuses — an unknown run number, a re-point of an already-bound
 * report — so a reconciled record has no weaker provenance than a picked one.
 */
router.post('/associate',
  requireChief,
  validate({ body: z.object({
    incident_id: z.number().int().positive(),
    cad_run_number: z.string().min(1).max(120),
  }) }),
  scoped(async ({ req, stationId }) => {
    const { incident_id: incidentId, cad_run_number: runNumber } = req.body;

    const outcome = await associateCallToIncident(stationId, incidentId, runNumber);

    if (outcome.result === ASSOCIATION_RESULT.NOT_FOUND) {
      throw httpError(404, `No CAD call with run number "${runNumber}" in this department`, 'CALL_NOT_FOUND');
    }
    if (outcome.result === ASSOCIATION_RESULT.NO_INCIDENT) {
      throw httpError(404, 'Incident not found in this department', 'INCIDENT_NOT_FOUND');
    }
    if (outcome.result === ASSOCIATION_RESULT.CONFLICT) {
      // Never a silent overwrite — the operator is told what it is already bound
      // to and has to decide, which is the point of a human repair surface.
      // `details` is a STRING ARRAY app-wide (middleware/errorHandler.js drops
      // anything else) — an object here was silently discarded until a test
      // caught it. The run number rides in the message AND in details, so the
      // operator sees it and a client can read it without parsing prose.
      throw httpError(409,
        `That report is already attached to CAD run "${outcome.runNumber}"`,
        'ALREADY_ASSOCIATED', [String(outcome.runNumber)]);
    }

    if (outcome.result === ASSOCIATION_RESULT.LINKED) {
      audit(stationId, req.user, 'update', 'incidents', incidentId, {
        reconciled: true, cad_run_number: outcome.runNumber, cad_alert_id: outcome.alertId,
      });
    }
    return { data: outcome };
  }));

module.exports = router;
