'use strict';
/**
 * routes/cadIngestMonitor.js — 4C.4. The half of the remedy 4C.2 did not build.
 *
 * Spec: docs/CAD-INGEST-4C4-SPEC-2026-08-05.md
 * Parent: docs/CAD-INGEST-4C2-SPEC-2026-07-27.md §3.4 (the standard), §5.5 (surfacing).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 4C.2 made a dispatch we could not parse DURABLE. That is half a remedy. Per
 * NENA-STA-024.1.1-2025 §3.3.5.3.1 the sending CAD's action on our 400/500 is NOTHING — it
 * will not send that call again and it believes we have it. So bytes sitting in a table
 * nobody opens are, to the department, indistinguishable from a call that never arrived.
 *
 * 09 NCAC 06C .0213(a)(4) — ⚠ ONE STATE'S rule, deliberately not described as a norm; the
 * parent spec's market pass looked for equivalents and found none — requires "visual and
 * audible indications to personnel designated by the PSAP" on an interface fault. NFPA 1221
 * §3.3.85 names the artifact: a Trouble Signal. CJIS AU-6a's periodic-review duty is
 * discharged by this panel, not by any cron job.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS ROUTE WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * · NO mute, NO snooze, NO dismiss-without-review. Parent spec §5.5: a CAD emitting
 *   unparseable payloads is a configuration defect to fix with that vendor; the panel exists
 *   to make that conversation happen, not to be silenced. (The per-workstation speaker
 *   toggle is the one audio opt-out and it is already app-wide.)
 * · NO write to cad_ingest_log or cad_ingest_outcome, ever. Neither grants UPDATE or DELETE
 *   to any role; review is a THIRD append-only row (0127). See the spec §4 for why that is a
 *   deliberate divergence from §5.5's "the only write the table permits" sketch.
 * · NO replay/reprocess. Re-running a parse that already failed against unchanged code is
 *   theatre; hand-working the call is the remedy. A real replay path is its own build.
 * · NO retention. These three tables are archive-forever and must never enter
 *   `retention_policy` (Matt, 2026-07-27).
 * · NO raw body in the LIST payload. Reading the bytes is a separate, gated, audited act —
 *   a raw CAD payload carries caller address, complainant name and sometimes medical detail,
 *   and it is retained forever. "Forever raises the bar on protecting it, it does not lower
 *   it" (parent spec §5.7).
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireOfficer } = require('../middleware/requireRole');

/**
 * The burst constant. A DERIVED signal, not configuration.
 *
 * The tracker asked to "consider an alert threshold (N unparseable in M minutes = a vendor
 * changed their format)". It ships as a named constant rather than a per-department column
 * on purpose: "make it configurable" is a framing-checkpoint trigger in this repo's standing
 * rules — 0096 dropped a column 0094 had added hours earlier for exactly this reason. No
 * department has asked for a different number, and inventing the knob invents a decision
 * nobody made. One line to change if one ever does.
 */
const BURST_WINDOW_MINUTES = 60;
const BURST_THRESHOLD      = 3;

/**
 * parse_status values that mean "a human needs to look at this".
 *
 * IMPORTED, not redeclared. The writer (cad/ingestLog.js) decides what a fault IS — it is the
 * thing that broadcasts the trouble signal — so the reader must not carry a second copy that
 * can drift. Three writers drifting into three vocabularies for one control value is the
 * fi_inspections result_code lesson, and it cost a live back door.
 */
const { FAULT_STATUSES } = require('../cad/ingestLog');

const listQuery = z.object({
  // 'open' (default) = not yet reviewed. 'all' includes reviewed faults so the weekly-review
  // duty has an auditable history, not just a worklist that empties.
  scope: z.enum(['open', 'all']).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
}).strict();

const idParam        = z.object({ id: z.string().regex(/^\d{1,18}$/) });
const logEventParam  = z.object({ logEventId: z.string().uuid() });
const reviewSchema   = z.object({ note: z.string().trim().min(1).max(2000).optional() }).strict();

/**
 * The fault list. Unreviewed first, then newest first — the ordering the partial index
 * `idx_cad_ingest_outcome_unparseable` was created for in 0115.
 *
 * Deliberately NOT selected: cad_ingest_log.raw_body and .headers. See the header.
 */
router.get('/faults',
  requireOfficer,
  validate({ query: listQuery }),
  scoped(async ({ req }) => {
    const departmentId = req.user.department_id;
    const scope = req.query.scope || 'open';
    const limit = Math.min(Number(req.query.limit || 100), 200);

    const { rows } = await pool.query(
      `SELECT o.id,
              o.log_event_id,
              o.at,
              o.parse_status,
              o.parse_error,
              o.alert_id,
              o.responded_status,
              l.received_at,
              l.vendor,
              l.source_ip,
              l.connection_id,
              c.name        AS connection_name,
              octet_length(l.raw_body) AS raw_bytes,
              r.reviewed_at,
              r.reviewer_name,
              r.note        AS review_note
         FROM cad_ingest_outcome o
         JOIN cad_ingest_log     l ON l.log_event_id = o.log_event_id
         LEFT JOIN cad_connections c ON c.id = l.connection_id AND c.department_id = o.department_id
         LEFT JOIN LATERAL (
                SELECT reviewed_at, reviewer_name, note
                  FROM cad_ingest_review v
                 WHERE v.outcome_id = o.id AND v.department_id = o.department_id
                 ORDER BY v.reviewed_at DESC
                 LIMIT 1
              ) r ON TRUE
        WHERE o.department_id = $1
          AND o.parse_status = ANY($2)
          AND ($3 = 'all' OR r.reviewed_at IS NULL)
        ORDER BY (r.reviewed_at IS NULL) DESC, o.at DESC
        LIMIT $4`,
      [departmentId, FAULT_STATUSES, scope, limit]
    );
    return { data: rows };
  })
);

/**
 * The annunciator's read. Cheap, polled, and the source of the badge count.
 *
 * `burst` is the "a vendor changed their format" signal: several faults inside the window is
 * a different event from one, and it deserves different copy on the panel.
 */
router.get('/summary',
  requireOfficer,
  scoped(async ({ req }) => {
    const departmentId = req.user.department_id;
    const { rows } = await pool.query(
      `SELECT
         count(*) FILTER (WHERE r.reviewed_at IS NULL)                              AS unreviewed,
         count(*) FILTER (WHERE o.at > now() - ($2 || ' minutes')::interval)        AS last_window,
         count(*) FILTER (WHERE o.at > now() - interval '24 hours')                 AS last_24h,
         min(o.at) FILTER (WHERE r.reviewed_at IS NULL)                             AS oldest_unreviewed_at,
         max(o.at)                                                                  AS newest_at
         FROM cad_ingest_outcome o
         LEFT JOIN LATERAL (
                SELECT reviewed_at FROM cad_ingest_review v
                 WHERE v.outcome_id = o.id AND v.department_id = o.department_id LIMIT 1
              ) r ON TRUE
        WHERE o.department_id = $1 AND o.parse_status = ANY($3)`,
      [departmentId, String(BURST_WINDOW_MINUTES), FAULT_STATUSES]
    );
    const s = rows[0] || {};
    const lastWindow = Number(s.last_window || 0);
    return {
      data: {
        unreviewed:          Number(s.unreviewed || 0),
        lastWindow,
        last24h:             Number(s.last_24h || 0),
        oldestUnreviewedAt:  s.oldest_unreviewed_at || null,
        newestAt:            s.newest_at || null,
        burst:               lastWindow >= BURST_THRESHOLD,
        burstWindowMinutes:  BURST_WINDOW_MINUTES,
        burstThreshold:      BURST_THRESHOLD,
      },
    };
  })
);

/**
 * The raw message. THE point of 4C.2 — a dispatch we could not parse can still be READ by a
 * human and worked by hand. Gated at officer+ and AUDITED on every read, because the payload
 * carries caller PII and is retained forever.
 *
 * `headers` was already allowlisted and credential-redacted at write time (cad/ingestLog.js),
 * so it is safe to return as stored.
 */
router.get('/faults/:logEventId/raw',
  requireOfficer,
  validate({ params: logEventParam }),
  scoped(async ({ req }) => {
    const departmentId = req.user.department_id;
    const { rows } = await pool.query(
      `SELECT l.log_event_id, l.received_at, l.vendor, l.source_ip, l.headers, l.raw_body,
              o.id AS outcome_id, o.parse_status, o.parse_error, o.responded_status
         FROM cad_ingest_log l
         LEFT JOIN LATERAL (
                SELECT id, parse_status, parse_error, responded_status
                  FROM cad_ingest_outcome oo
                 WHERE oo.log_event_id = l.log_event_id AND oo.department_id = l.department_id
                 ORDER BY oo.at DESC LIMIT 1
              ) o ON TRUE
        WHERE l.log_event_id = $1 AND l.department_id = $2`,
      [req.params.logEventId, departmentId]
    );
    if (!rows.length) throw httpError(404, 'No such ingest receipt', 'NOT_FOUND');

    // record_id must be an INTEGER (lesson #14 — a UUID here poisoned a P5 transaction and a
    // MAYDAY returned 201 while persisting nothing). The outcome id is the integer handle;
    // the uuid rides in the detail payload, which is JSON.
    await audit(departmentId, req.user, 'export', 'cad_ingest_log',
      rows[0].outcome_id ?? null,
      { logEventId: rows[0].log_event_id, reason: 'operator read the raw CAD payload' });

    return { data: rows[0] };
  })
);

/**
 * Review a fault. An INSERT, never an UPDATE — cad_ingest_outcome grants no UPDATE to any
 * role and this route does not ask it to. Re-review is allowed and additive; the panel shows
 * the most recent.
 */
router.post('/faults/:id/review',
  requireOfficer,
  validate({ params: idParam, body: reviewSchema }),
  scoped(async ({ req }) => {
    const departmentId = req.user.department_id;
    const outcomeId = Number(req.params.id);

    // Confirm the fault exists IN THIS DEPARTMENT and really is a fault. Reviewing a 'parsed'
    // row would be a meaningless record, and a cross-tenant id must 404, never 500 on the FK.
    const { rows: found } = await pool.query(
      `SELECT id, parse_status FROM cad_ingest_outcome
        WHERE id = $1 AND department_id = $2`,
      [outcomeId, departmentId]
    );
    if (!found.length) throw httpError(404, 'No such ingest fault', 'NOT_FOUND');
    if (!FAULT_STATUSES.includes(found[0].parse_status)) {
      throw httpError(422, 'That ingest record parsed successfully — there is nothing to review.',
        'NOT_A_FAULT');
    }

    const reviewerName = String(req.user.name || req.user.username || '').trim();
    if (!reviewerName) {
      // The DB CHECK would refuse it anyway; refusing here gives a readable reason instead of
      // a constraint violation, and names what to fix.
      throw httpError(422, 'Your account has no name recorded, so the review could not be attributed. Add a name in your profile and try again.',
        'NO_REVIEWER_NAME');
    }

    const { rows } = await pool.query(
      `INSERT INTO cad_ingest_review (outcome_id, department_id, reviewed_by, reviewer_name, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, outcome_id, reviewed_at, reviewer_name, note`,
      [outcomeId, departmentId, req.user.id ?? null, reviewerName, req.body.note || null]
    );

    await audit(departmentId, req.user, 'update', 'cad_ingest_review', Number(rows[0].id),
      { outcomeId, note: req.body.note ? 'present' : 'none' });

    return { data: rows[0], _status: 201 };
  })
);

module.exports = router;
module.exports.BURST_WINDOW_MINUTES = BURST_WINDOW_MINUTES;
module.exports.BURST_THRESHOLD = BURST_THRESHOLD;
module.exports.FAULT_STATUSES = FAULT_STATUSES;
