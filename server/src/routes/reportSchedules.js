'use strict';
/**
 * routes/reportSchedules.js — a department's standing instructions to deliver a
 * canned report on a cadence.
 *
 * Scheduled delivery is shipped by roughly four of the nine surveyed platforms.
 * Short of a majority; Matt's ruling on 2026-07-27 is that four is still enough
 * to match, so it is built.
 *
 * ─── WHY WRITES ARE CHIEF-GATED AND AUDITED ─────────────────────────────────
 * Every other analytics route reads. This one causes the department's own data
 * to be MAILED to an address, and that address need not belong to a member — a
 * chief legitimately sends these to a mayor, a council member, or an insurance
 * reviewer. That makes this the single egress point in the reporting stack, so:
 * chief only, recipients validated as addresses, count bounded, and every
 * create/update/delete written to the audit log with the recipient list. If data
 * ever leaves by this door, the log says who opened it and to where.
 *
 * The report_key set here is the set the CRON CAN ACTUALLY DELIVER, imported
 * from the sweep rather than restated. Migration 0105's CHECK is deliberately
 * wider (three keys); offering a key with no renderer would let a chief schedule
 * a report that can never arrive, and the failure would surface a month later as
 * an error on a row nobody is looking at.
 */
const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireChief, requireOfficer } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { DELIVERABLE_REPORT_KEYS } = require('./cronReportDelivery');
const { lastCompletePeriod } = require('../utils/reportPeriod');

// Deliberately strict. A typo'd address does not bounce back to the chief — it
// silently goes nowhere, which is the failure this whole module is built to
// avoid, so it is rejected at the door instead.
const email = z.string().trim().toLowerCase().min(3).max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'not a valid email address');

const scheduleBody = z.object({
  report_key: z.enum(DELIVERABLE_REPORT_KEYS),
  cadence: z.enum(['weekly', 'monthly']),
  recipients: z.array(email).min(1).max(20),
  station_id: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
});

/** Validate a station filter belongs to the caller's own department. */
async function assertOwnStation(departmentId, stationId) {
  if (stationId === null || stationId === undefined) return null;
  const { rows } = await pool.query(
    'SELECT id FROM stations WHERE id = $1 AND department_id = $2',
    [stationId, departmentId]
  );
  if (!rows.length) throw httpError(404, 'No such station in your department', 'STATION_NOT_FOUND');
  return stationId;
}

/**
 * GET / — the department's schedules, each with the period it would next cover.
 *
 * `next_period` is computed, not stored: a chief setting this up wants to know
 * what will actually arrive, and "monthly" alone does not answer that.
 */
router.get('/', requireOfficer, scoped(async ({ stationId: departmentId }) => {
  const { rows } = await pool.query(
    `SELECT s.*, st.name AS station_name
       FROM report_schedules s
       LEFT JOIN stations st ON st.id = s.station_id
      WHERE s.department_id = $1
      ORDER BY s.id`,
    [departmentId]
  );
  const now = new Date();
  return {
    data: {
      schedules: rows.map((r) => {
        const next = lastCompletePeriod(r.cadence, now);
        return {
          ...r,
          // If this period is already delivered, the NEXT one is a period from
          // now — we say so rather than showing a period that will not be sent.
          next_period: r.last_period_key === next.key ? null : next.label,
          next_period_key: r.last_period_key === next.key ? null : next.key,
        };
      }),
      // Stated plainly so a chief is never waiting on mail that cannot be sent.
      // This is the ops step, surfaced where the consequence lives.
      email_configured: Boolean(process.env.RESEND_API_KEY),
    },
  };
}));

/** POST / — create a schedule. */
router.post('/',
  requireChief,
  validate({ body: scheduleBody }),
  scoped(async ({ req, stationId: departmentId }) => {
    const b = req.body;
    const station = await assertOwnStation(departmentId, b.station_id ?? null);

    const { rows } = await pool.query(
      `INSERT INTO report_schedules
         (department_id, station_id, report_key, cadence, recipients, enabled, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [departmentId, station, b.report_key, b.cadence, b.recipients,
        b.enabled ?? true, req.user.id]
    );

    // Positional signature: (departmentId, user, action, tableName, recordId, detail).
    // detail is an OBJECT — it is JSON.stringify'd into a jsonb column. recordId
    // must be an INTEGER (lesson #14: a UUID here poisoned a P5 transaction and
    // turned a 201 into a silent rollback).
    await audit(departmentId, req.user, 'create', 'report_schedules', rows[0].id, {
      // The recipient list is the point of this entry, not metadata — this is
      // the department's one data-egress door.
      report_key: b.report_key, cadence: b.cadence, recipients: b.recipients,
      station_id: station,
    });
    return { data: rows[0] };
  }));

/** PATCH /:id — change cadence, recipients, station filter, or pause it. */
router.patch('/:id',
  requireChief,
  validate({ body: scheduleBody.partial() }),
  scoped(async ({ req, stationId: departmentId }) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) throw httpError(400, 'Bad schedule id', 'BAD_ID');
    const b = req.body;
    if (b.station_id !== undefined) await assertOwnStation(departmentId, b.station_id);

    // Whitelist the settable columns. last_period_key / last_status are the
    // SWEEP's record of what it did and are not client-writable — letting a
    // client clear last_period_key would re-send a period already delivered.
    const sets = [];
    const vals = [];
    for (const col of ['report_key', 'cadence', 'recipients', 'station_id', 'enabled']) {
      if (b[col] !== undefined) { vals.push(b[col]); sets.push(`${col} = $${vals.length}`); }
    }
    if (!sets.length) throw httpError(400, 'Nothing to update', 'NO_FIELDS');
    vals.push(id, departmentId);

    const { rows } = await pool.query(
      `UPDATE report_schedules SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${vals.length - 1} AND department_id = $${vals.length}
        RETURNING *`,
      vals
    );
    if (!rows.length) throw httpError(404, 'No such schedule', 'NOT_FOUND');

    await audit(departmentId, req.user, 'update', 'report_schedules', id, { changed: b });
    return { data: rows[0] };
  }));

/** DELETE /:id — stop delivering. A schedule is configuration, not a record;
 *  there is nothing subpoenable here, so this is a real delete. The audit row
 *  survives it and names the recipients that were being mailed. */
router.delete('/:id', requireChief, scoped(async ({ req, stationId: departmentId }) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw httpError(400, 'Bad schedule id', 'BAD_ID');

  const { rows } = await pool.query(
    'DELETE FROM report_schedules WHERE id = $1 AND department_id = $2 RETURNING report_key, cadence, recipients',
    [id, departmentId]
  );
  if (!rows.length) throw httpError(404, 'No such schedule', 'NOT_FOUND');

  await audit(departmentId, req.user, 'delete', 'report_schedules', id, {
    report_key: rows[0].report_key, cadence: rows[0].cadence, recipients: rows[0].recipients,
  });
  return { data: { deleted: id } };
}));

module.exports = router;
