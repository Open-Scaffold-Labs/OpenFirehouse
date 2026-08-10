'use strict';
/**
 * routes/fiReports.js — violation reporting reads (Prevention Core Phase 3).
 *
 * THE AUTHORITY DECISION MADE REAL (2026-07-13, incumbent research): every
 * leading platform treats a violation as a first-class record whose lifecycle
 * spans inspections, keyed to the property, preserving the ORIGINAL reported
 * date across reinspection carry-forward. Our fi_violations rows are that
 * record; this endpoint is the read authority for dashboards/dossiers.
 *
 * GET /api/fi-reports/open-violations
 *   The CURRENT open set: rows with an unresolved status (Open / Time
 *   Extension) that have NOT been superseded by a carried copy on a later
 *   inspection (a successor row whose carried_from_key points at them). Each
 *   row is returned with its lineage ROOT — the inspection where the violation
 *   was first cited — so the client can show the original reported date and
 *   compute aging against the inspector's LOCAL today (doctrine 8: the server
 *   never derives "today"; it returns dates only).
 *
 * Reads are member+ (same posture as every fi read). Dept-scoped, RLS-covered.
 */
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { scoped } = require('../utils/routeKit');

// Unresolved statuses on the canonical four-state axis (constants/violationStatus.js):
// resolution = Corrected | Withdrawn; everything else is open work.
const OPEN_STATUSES = ['Open', 'Time Extension'];

router.get('/open-violations', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `WITH RECURSIVE current_open AS (
       SELECT v.*
       FROM fi_violations v
       JOIN fi_inspections i ON i.id = v.inspection_id AND i.deleted_at IS NULL
       WHERE v.department_id = $1 AND v.deleted_at IS NULL
         AND v.status = ANY($2)
         AND NOT EXISTS (            -- not superseded by a carried copy downstream
           SELECT 1 FROM fi_violations s
           WHERE s.department_id = $1 AND s.deleted_at IS NULL
             AND s.carried_from_key = v.inspection_id::text || ':' || v.violation_key)
     ),
     lineage AS (                    -- walk carried_from_key back to the first citation
       SELECT co.id AS leaf_id, co.inspection_id, co.carried_from_key, 0 AS depth
       FROM current_open co
       UNION ALL
       SELECT l.leaf_id, p.inspection_id, p.carried_from_key, l.depth + 1
       FROM lineage l
       JOIN fi_violations p
         ON p.department_id = $1
        AND p.inspection_id = split_part(l.carried_from_key, ':', 1)::int
        AND p.violation_key = substr(l.carried_from_key, position(':' IN l.carried_from_key) + 1)
       WHERE l.carried_from_key IS NOT NULL AND l.depth < 20
     ),
     roots AS (
       SELECT DISTINCT ON (leaf_id) leaf_id, inspection_id AS root_inspection_id, depth
       FROM lineage ORDER BY leaf_id, depth DESC
     )
     SELECT co.id, co.inspection_id, co.violation_key, co.code, co.description,
            co.status, co.notes, co.next_recheck_date, co.imminent_hazard,
            co.carried_from_key,
            r.root_inspection_id, r.depth AS reinspection_count,
            ri."completedDate"        AS root_completed_date,
            ri."scheduledDate"        AS root_scheduled_date,
            to_char(ri."createdAt", 'YYYY-MM-DD') AS root_created_date,
            i."propertyId"            AS property_id,
            p.name                    AS property_name,
            p.address                 AS property_address,
            i.type                    AS inspection_type,
            i."scheduledDate"         AS inspection_scheduled_date,
            i."completedDate"         AS inspection_completed_date,
            i."inspectorName"         AS inspector_name,
            i.assigned_to_user_id
     FROM current_open co
     JOIN roots r           ON r.leaf_id = co.id
     JOIN fi_inspections ri ON ri.id = r.root_inspection_id
     JOIN fi_inspections i  ON i.id = co.inspection_id
     JOIN fi_properties p   ON p.id = i."propertyId" AND p.department_id = $1
     ORDER BY COALESCE(ri."completedDate", ri."scheduledDate", to_char(ri."createdAt", 'YYYY-MM-DD')) ASC,
              co.imminent_hazard DESC`,
    [stationId, OPEN_STATUSES]);

  return { data: rows };
}));

module.exports = router;
