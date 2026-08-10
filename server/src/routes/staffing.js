'use strict';
/**
 * routes/staffing.js — min-staffing rules config + the daily coverage view (Phase 1.4).
 * Spec: docs/PHASE1-VACANCY-SPEC-2026-07-25.md §4. Migration 0080.
 *
 *   GET    /api/staffing/rules          — list dept rules (any authed member)
 *   POST   /api/staffing/rules          — chief: create a rule
 *   PATCH  /api/staffing/rules/:id      — chief: edit / deactivate (active=false) a rule
 *   GET    /api/staffing/coverage?date= — per-rule verdicts + rollup + open vacancies
 *
 * No DELETE — rules deactivate (a grievance can turn on "what was the rule that date";
 * effective dating + the audit trail answer it). Enforcement posture is unchanged 0075
 * two-tier: these verdicts WARN; only employee self-service paths consult 'block'.
 */

const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireChief } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { canonicalizeCert } = require('../constants/certs');
const { evaluateStaffing } = require('../utils/staffingRules');
const { LIVE_STATUSES } = require('../utils/vacancyEngine');

const HHMM = /^\d{1,2}:\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ruleBase = z.object({
  name: z.string().trim().min(1).max(120),
  rule_type: z.enum(['shift_count', 'rank_count', 'cert_count', 'apparatus_seats']),
  target: z.string().trim().max(120).optional().nullable(),
  min_count: z.number().int().min(0).max(999),
  shift_type: z.string().trim().max(60).optional().nullable(),
  time_start: z.string().regex(HHMM).optional().nullable(),
  time_end: z.string().regex(HHMM).optional().nullable(),
  days_of_week: z.array(z.number().int().min(0).max(6)).max(7).optional().nullable(),
  effective_from: z.string().regex(ISO_DATE).optional().nullable(),
  effective_to: z.string().regex(ISO_DATE).optional().nullable(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
// POST requires target for non-count-of-people-on-shift rules; PATCH takes the bare partial
// (zod v4: .partial() cannot ride a refined schema, so refine only the create shape).
const ruleBody = ruleBase.superRefine((b, ctx) => {
  if (b.rule_type !== 'shift_count' && !(b.target && b.target.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target'],
      message: 'target is required for rank_count / cert_count / apparatus_seats rules' });
  }
});

// A cert target is stored as the canonical CODE (the qualifications-route convention) so
// rule↔qual matching is code-to-code, never label-to-label.
function normalizeTarget(ruleType, target) {
  if (target == null) return null;
  if (ruleType === 'cert_count') return canonicalizeCert(target) || String(target).trim();
  return String(target).trim();
}

// ── GET /rules ───────────────────────────────────────────────────────────────
router.get('/rules', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT * FROM min_staffing_rules WHERE department_id = $1
      ORDER BY active DESC, sort_order, id`,
    [stationId]);
  return { data: rows };
}));

// ── POST /rules (chief) ──────────────────────────────────────────────────────
router.post('/rules', requireChief, validate({ body: ruleBody }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO min_staffing_rules
         (department_id, name, rule_type, target, min_count, shift_type,
          time_start, time_end, days_of_week, effective_from, effective_to, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [stationId, b.name, b.rule_type, normalizeTarget(b.rule_type, b.target),
       b.min_count, b.shift_type || null, b.time_start || null, b.time_end || null,
       b.days_of_week ? JSON.stringify(b.days_of_week) : null,
       b.effective_from || null, b.effective_to || null, b.sort_order ?? 0]);
    await audit(stationId, user, 'create', 'min_staffing_rules', rows[0].id,
      { rule_type: b.rule_type, target: rows[0].target, min_count: b.min_count });
    return { data: rows[0], _status: 201 };
  }));

// ── PATCH /rules/:id (chief; deactivate via active=false, never DELETE) ──────
router.patch('/rules/:id', requireChief,
  validate({
    params: z.object({ id: z.string().regex(/^\d+$/) }),
    body: ruleBase.partial().extend({ active: z.boolean().optional() }),
  }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const cols = {
      name: b.name, rule_type: b.rule_type,
      target: b.target !== undefined ? normalizeTarget(b.rule_type || 'other', b.target) : undefined,
      min_count: b.min_count, shift_type: b.shift_type,
      time_start: b.time_start, time_end: b.time_end,
      days_of_week: b.days_of_week !== undefined
        ? (b.days_of_week ? JSON.stringify(b.days_of_week) : null) : undefined,
      effective_from: b.effective_from, effective_to: b.effective_to,
      sort_order: b.sort_order, active: b.active,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(cols)) {
      if (v === undefined) continue;
      vals.push(v); sets.push(`"${k}" = $${vals.length}`);
    }
    if (!sets.length) throw httpError(400, 'No valid fields', 'NO_FIELDS');
    vals.push(req.params.id, stationId);
    const { rows } = await pool.query(
      `UPDATE min_staffing_rules SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${vals.length - 1} AND department_id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) throw httpError(404, 'Rule not found', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'min_staffing_rules', rows[0].id,
      { changed: Object.keys(cols).filter((k) => cols[k] !== undefined) });
    return { data: rows[0] };
  }));

// ── GET /coverage?date=YYYY-MM-DD ────────────────────────────────────────────
// The coverage view: per-rule verdicts + rollup + the open vacancies for the date.
// Pure evaluation over fetched state (utils/staffingRules) — computed on view, never
// cached, never cron'd. Any authed member may look at the board's coverage state.
router.get('/coverage',
  validate({ query: z.object({ date: z.string().regex(ISO_DATE).optional() }) }),
  scoped(async ({ req, stationId }) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    // getStaffingConfig lives on the leave router module (0075) — require lazily to keep
    // module-load order acyclic (leaveRequests requires vacancyEngine at load).
    const { getStaffingConfig } = require('./leaveRequests');
    const cfg = await getStaffingConfig(stationId);

    const [rules, shifts, members, quals, board, vacancies] = await Promise.all([
      pool.query('SELECT * FROM min_staffing_rules WHERE department_id = $1 AND active = TRUE', [stationId]),
      pool.query('SELECT id, date, "shiftType", crew, "memberIds" FROM shifts WHERE department_id = $1 AND date = $2', [stationId, date]),
      pool.query(`SELECT id, name, rank FROM members WHERE department_id = $1 AND status IN ('Active','Probationary')`, [stationId]),
      pool.query(
        `SELECT member_id, cert_type FROM member_qualifications
          WHERE department_id = $1 AND status = 'active'
            AND (expiry_date IS NULL OR expiry_date = '' OR expiry_date >= $2)`,
        [stationId, date]),
      pool.query('SELECT apparatus_id, member_id FROM apparatus_assignments WHERE department_id = $1 AND date = $2', [stationId, date]),
      pool.query(
        `SELECT * FROM vacancies WHERE department_id = $1 AND shift_date = $2 AND status = ANY($3)
          ORDER BY priority, id`,
        [stationId, date, LIVE_STATUSES]),
    ]);

    const membersById = {}; const membersByName = {};
    for (const m of members.rows) { membersById[String(m.id)] = m; membersByName[m.name] = m; }
    const activeCertsByMemberId = {};
    for (const q of quals.rows) {
      const k = String(q.member_id);
      (activeCertsByMemberId[k] = activeCertsByMemberId[k] || []).push(q.cert_type);
    }
    const parsedShifts = shifts.rows.map((s) => ({
      ...s,
      crew: typeof s.crew === 'string' ? JSON.parse(s.crew || '[]') : (s.crew || []),
      memberIds: typeof s.memberIds === 'string' ? JSON.parse(s.memberIds || '[]') : (s.memberIds || []),
    }));

    const result = evaluateStaffing({
      date, rules: rules.rows, minCrewFallback: cfg.minCrew, shifts: parsedShifts,
      membersById, membersByName, activeCertsByMemberId, boardRows: board.rows,
    });
    return { data: { ...result, enforcement: cfg.enforcement, vacancies: vacancies.rows } };
  }));

module.exports = router;
