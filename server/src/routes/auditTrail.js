'use strict';
/**
 * auditTrail.js — the CUSTOMER-VISIBLE audit trail (Phase 5, 5.4).
 *
 *   GET /api/audit/record/:table/:id   — the change history of ONE record
 *   GET /api/audit/retention           — what we keep, and for how long
 *
 * MARKET BAR (competitor-shipping inventory, 12 fire/EMS RMS products,
 * 2026-07-26): 7 of 12 expose a customer-visible audit trail, and the SCOPE is
 * the story — what ships is **record-level change history** (per-incident,
 * per-record, patient-data-only, or message-log-only depending on the vendor).
 * We already WROTE this data and exposed no customer route at all.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * No tenant-wide activity feed, and no authentication-event log (logins, failed
 * logins, permission changes, exports). The inventory found that a tenant-wide
 * log including auth events is documented by **essentially nobody** in this
 * market. Building one would be "more than competitors ship", and it would also
 * be a new surface with its own leak profile. The entry point here is a RECORD —
 * exactly as the market ships it.
 *
 * RETENTION: we keep audit rows for the life of the record. The best commitment
 * found anywhere in the market was "90 days to 1 year, varies by configuration"
 * — on a system producing subpoenable records. Ours is stronger and it is stated
 * out loud at /api/audit/retention rather than being left to the customer to
 * discover.
 *
 * SECURITY
 *  - `:table` is matched against a fixed ALLOWLIST and is NEVER interpolated
 *    into SQL. It is a filter value, not an identifier.
 *  - Every query is scoped to the caller's department. A record id from another
 *    department returns an empty history, not another tenant's rows.
 *  - Officer+ only. Audit trails are a compliance surface, not general reading.
 */

const express = require('express');
const { z } = require('zod');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { requireOfficer } = require('../middleware/requireRole');
const { scoped, httpError, validate } = require('../utils/routeKit');

const router = express.Router();
router.use(requireAuth);

/**
 * The record types whose history a department may read, mapped to the label the
 * UI shows. An allowlist rather than a denylist: a table added later is invisible
 * here until someone deliberately adds it, which is the correct default for a
 * surface that reads an audit log.
 *
 * Chosen for LEGAL WEIGHT — these are the records that get subpoenaed:
 */
const VIEWABLE = Object.freeze({
  incidents:        'Incident',
  fi_inspections:   'Fire inspection',
  fi_notices:       'Notice of violation',
  fi_permits:       'Permit',
  fi_violations:    'Violation',
  exposure_records: 'Exposure record',
  grievances:       'Grievance',
  mayday_events:    'Mayday',
  par_checks:       'PAR check',
  cs_events:        'Controlled-substance custody event',
  work_orders:      'Work order',
  apparatus_checks: 'Apparatus check',
});

// Actions rendered in plain language — a chief reading this is not a developer.
const ACTION_LABEL = Object.freeze({
  create:      'Created',
  update:      'Changed',
  soft_delete: 'Deleted',
  restore:     'Restored',
  approve:     'Approved',
  reject:      'Rejected',
  export:      'Exported',
  clear:       'Cleared',
});

// GET /api/audit/retention — the commitment, stated rather than implied.
router.get('/retention', (req, res) => {
  res.json({
    policy: 'life-of-record',
    summary: 'Audit entries are kept for as long as the record they describe exists. They are never pruned on a timer.',
    appendOnly: true,
    appendOnlyDetail: 'The audit writer exposes one function, and it writes. There is no update path and no delete path for a caller to reach.',
    softDelete: 'Records that can be subpoenaed are soft-deleted — removed from every read path, but the row and its history remain.',
    viewableRecordTypes: Object.values(VIEWABLE).sort(),
  });
});

const paramsSchema = z.object({
  table: z.string().min(1).max(64),
  id:    z.string().regex(/^\d+$/, 'record id must be a positive integer'),
});

// GET /api/audit/record/:table/:id
router.get('/record/:table/:id',
  requireOfficer,
  validate({ params: paramsSchema }),
  scoped(async ({ req, user }) => {
    const { table, id } = req.params;

    // The allowlist check happens BEFORE any query. `table` never reaches SQL as
    // an identifier — only as a bound parameter compared to table_name.
    if (!Object.prototype.hasOwnProperty.call(VIEWABLE, table)) {
      throw httpError(404, 'No audit history is available for that record type.', 'RECORD_TYPE_NOT_VIEWABLE');
    }

    const { rows } = await db.pool.query(
      `SELECT id, action, user_id, user_name, detail, at
         FROM audit_log
        WHERE table_name = $1
          AND record_id  = $2
          AND department_id = $3
        ORDER BY at ASC, id ASC
        LIMIT 500`,
      [table, Number(id), user.department_id]
    );

    return {
      data: {
        recordType: table,
        recordTypeLabel: VIEWABLE[table],
        recordId: Number(id),
        // An empty history is a legitimate answer (the record predates auditing,
        // or belongs to another department). Say so plainly rather than 404ing,
        // which would leak whether the record exists elsewhere.
        entries: rows.map((r) => ({
          id: r.id,
          action: r.action,
          actionLabel: ACTION_LABEL[r.action] || r.action,
          by: r.user_name || (r.user_id ? `User ${r.user_id}` : 'System'),
          at: r.at,
          detail: r.detail || null,
        })),
        truncated: rows.length === 500,
      },
    };
  })
);

module.exports = router;
module.exports.VIEWABLE = VIEWABLE;
