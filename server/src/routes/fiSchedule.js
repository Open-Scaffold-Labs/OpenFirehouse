'use strict';
/**
 * routes/fiSchedule.js — scheduling administration (Prevention Core Phase 3).
 *
 * The two batch capabilities the incumbent research verified as table stakes:
 *   POST /api/fi-inspections/batch-schedule — the batch wizard's commit: create
 *     one pending inspection per selected property (one atomic INSERT..SELECT;
 *     max:1-pool-safe). Idempotent per (property, type, scheduledDate): a
 *     property that already has an identical PENDING inspection is skipped and
 *     reported, never duplicated.
 *   POST /api/fi-inspections/bulk-assign — workload rebalancing: multi-select
 *     inspections → reassign to another inspector in one act. Only PENDING
 *     (uncompleted, undeleted) inspections move; completed records are history.
 *
 * Assignment identity doctrine (0051): the durable link is assigned_to_user_id;
 * "inspectorName" is display text resolved server-side from the user when not
 * supplied. Dates are client-supplied local days (doctrine 8) — the server
 * validates format only and never derives "today".
 *
 * Gate: requirePreventionAdmin — scheduling is bureau administration.
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requirePreventionAdmin } = require('../middleware/fiAuth');
const { audit } = require('../utils/auditLog');
const { isIsoDay } = require('../utils/localDate');

/** The target user must belong to THIS department (station tag or P4 mapping). */
async function resolveAssignee(userId, stationId) {
  if (userId == null) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.username FROM users u
     WHERE u.id = $1 AND (u.station_id = $2
       OR EXISTS (SELECT 1 FROM of_user_departments m WHERE m.user_id = u.id AND m.department_id = $2))`,
    [userId, stationId]);
  if (!rows.length) throw httpError(404, 'Assignee not found in this department.', 'USER_NOT_IN_DEPT');
  return rows[0];
}

const batchSchema = z.object({
  propertyIds:      z.array(z.number().int().positive()).min(1).max(500),
  type:             z.string().trim().min(1).max(200),
  scheduledDate:    z.string().refine(isIsoDay, 'scheduledDate must be a real YYYY-MM-DD day'),
  assignedToUserId: z.number().int().positive().nullable().default(null),
  inspectorName:    z.string().trim().max(200).default(''),
});

router.post('/batch-schedule', loadFiContext, requirePreventionAdmin,
  validate({ body: batchSchema }), scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const ids = [...new Set(b.propertyIds)];

    // Every selected property must be the department's own (never trust client ids).
    const owned = await pool.query(
      `SELECT id FROM fi_properties WHERE id = ANY($1) AND department_id = $2 AND deleted_at IS NULL`,
      [ids, stationId]);
    if (owned.rows.length !== ids.length) {
      const found = new Set(owned.rows.map((r) => r.id));
      throw httpError(404, 'One or more properties were not found in this department.',
        'PROPERTY_NOT_FOUND', { missing: ids.filter((i) => !found.has(i)) });
    }

    const assignee = await resolveAssignee(b.assignedToUserId, stationId);
    const inspectorName = b.inspectorName || assignee?.name || assignee?.username || '';

    // One atomic INSERT..SELECT; identical PENDING inspections are skipped.
    const { rows: created } = await pool.query(
      `INSERT INTO fi_inspections
         ("propertyId", type, "inspectorName", "scheduledDate", violations, notes,
          assigned_to_user_id, station_id)
       SELECT pid, $2, $3, $4, '[]', '', $5, $6
       FROM unnest($1::int[]) AS pid
       WHERE NOT EXISTS (
         SELECT 1 FROM fi_inspections e
         WHERE e.department_id = $6 AND e."propertyId" = pid AND e.type = $2
           AND e."scheduledDate" = $4 AND e."completedDate" IS NULL AND e.deleted_at IS NULL)
       RETURNING id, "propertyId"`,
      [ids, b.type, inspectorName, b.scheduledDate, b.assignedToUserId, stationId]);

    await audit(stationId, user, 'create', 'fi_inspections', null, {
      batchSchedule: true, type: b.type, scheduledDate: b.scheduledDate,
      requested: ids.length, created: created.length, skippedExisting: ids.length - created.length,
      ...(b.assignedToUserId ? { assignedToUserId: b.assignedToUserId } : {}),
    });
    return {
      data: {
        created,
        createdCount: created.length,
        skippedExisting: ids.length - created.length,
      },
      _status: 201,
    };
  }));

const assignSchema = z.object({
  inspectionIds:    z.array(z.number().int().positive()).min(1).max(500),
  assignedToUserId: z.number().int().positive().nullable(),
  inspectorName:    z.string().trim().max(200).default(''),
});

router.post('/bulk-assign', loadFiContext, requirePreventionAdmin,
  validate({ body: assignSchema }), scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const ids = [...new Set(b.inspectionIds)];
    const assignee = await resolveAssignee(b.assignedToUserId, stationId);
    const inspectorName = b.inspectorName || assignee?.name || assignee?.username || '';

    const { rows } = await pool.query(
      `UPDATE fi_inspections
       SET assigned_to_user_id = $1, "inspectorName" = $2, "updatedAt" = NOW()
       WHERE id = ANY($3) AND department_id = $4
         AND "completedDate" IS NULL AND deleted_at IS NULL
       RETURNING id`,
      [b.assignedToUserId, inspectorName, ids, stationId]);

    await audit(stationId, user, 'update', 'fi_inspections', null, {
      bulkAssign: true, requested: ids.length, updated: rows.length,
      assignedToUserId: b.assignedToUserId, inspectorName,
    });
    return {
      data: {
        updated: rows.map((r) => r.id),
        updatedCount: rows.length,
        skipped: ids.length - rows.length, // completed/foreign/deleted — never moved
      },
    };
  }));

module.exports = router;
