'use strict';
/**
 * routes/vacancies.js — the unified first-class vacancy record (Phase 1.4).
 * Spec: docs/PHASE1-VACANCY-SPEC-2026-07-25.md §4. Migration 0080.
 * REPLACES routes/vacancyFill.js (retired; live rows backfilled by 0080).
 *
 *   GET    /api/vacancies             — live (open/offering) vacancies
 *   GET    /api/vacancies/history     — terminal (filled/cancelled/expired)
 *   POST   /api/vacancies             — officer+: manual create (the BC-opens flow)
 *   POST   /api/vacancies/:id/fill    — officer+: atomic single-winner fill
 *   POST   /api/vacancies/:id/cancel  — officer+: cancel with recorded reason
 *
 * ONE DOOR: every status transition goes through utils/vacancyEngine — there is
 * deliberately NO PATCH that can write `status`/`filled_*` raw (the fi-suite lesson:
 * a guard that exists on one route and not another is not a guard). Auto-minting from
 * leave approval lives in the leave path; the 1.5 hiring engine will consume these
 * records and write the offer sequence to coverage_outreach.
 */

const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const { scoped, validate } = require('../utils/routeKit');
const { requireOfficer } = require('../middleware/requireRole');
const { pool } = require('../db');
const { LIVE_STATUSES, mintVacancy, fillVacancy, cancelVacancy } = require('../utils/vacancyEngine');
// 1.5: opening a hiring run + the bypass hook. Required lazily inside handlers to keep the
// vacancyEngine↔hiringEngine module graph acyclic (hiringEngine requires vacancyEngine).
const hiringEngine = () => require('../utils/hiringEngine');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── GET / — live vacancies (any authed member; the open board is visible) ───────
router.get('/',
  validate({ query: z.object({
    from: z.string().regex(ISO_DATE).optional(),
    to: z.string().regex(ISO_DATE).optional(),
  }) }),
  scoped(async ({ req, stationId }) => {
    const vals = [stationId, LIVE_STATUSES];
    let where = 'department_id = $1 AND status = ANY($2)';
    if (req.query.from) { vals.push(req.query.from); where += ` AND shift_date >= $${vals.length}`; }
    if (req.query.to)   { vals.push(req.query.to);   where += ` AND shift_date <= $${vals.length}`; }
    const { rows } = await pool.query(
      `SELECT * FROM vacancies WHERE ${where} ORDER BY shift_date, priority, id`, vals);
    return { data: rows };
  }));

// ── GET /history — terminal statuses ────────────────────────────────────────────
router.get('/history', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT * FROM vacancies
      WHERE department_id = $1 AND status IN ('filled','cancelled','expired')
      ORDER BY updated_at DESC LIMIT 100`,
    [stationId]);
  return { data: rows };
}));

// ── POST / — manual create (command opens a vacancy; Matt's field flow) ─────────
router.post('/', requireOfficer,
  validate({ body: z.object({
    shift_date: z.string().regex(ISO_DATE),
    shift_id: z.number().int().positive().optional().nullable(),
    apparatus_id: z.number().int().positive().optional().nullable(),
    position_id: z.number().int().positive().optional().nullable(),
    position_name: z.string().trim().max(120).optional(),
    required_rank: z.string().trim().max(60).optional(),
    required_certs: z.array(z.string().trim().max(40)).max(20).optional(),
    start_ts: z.string().datetime({ offset: true }).optional().nullable(),
    end_ts: z.string().datetime({ offset: true }).optional().nullable(),
    hours: z.number().min(0).max(96).optional().nullable(),
    priority: z.number().int().min(1).max(3).optional(),
    cause: z.enum(['sick_callout', 'open_slot', 'manual']).optional(),
  }) }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const row = await mintVacancy(stationId, {
      shift_date: b.shift_date, shift_id: b.shift_id ?? null,
      apparatus_id: b.apparatus_id ?? null, position_id: b.position_id ?? null,
      position_name: b.position_name || '', required_rank: b.required_rank || '',
      required_certs: b.required_certs || [],
      start_ts: b.start_ts ?? null, end_ts: b.end_ts ?? null, hours: b.hours ?? null,
      cause: b.cause || 'manual', priority: b.priority ?? 2,
    }, user);
    return { data: row, _status: 201 };
  }));

// ── POST /:id/fill — atomic single-winner (engine door) ─────────────────────────
router.post('/:id/fill', requireOfficer,
  validate({
    params: z.object({ id: z.string().regex(/^\d+$/) }),
    body: z.object({
      member_id: z.number().int().positive(),
      method: z.enum(['accepted_offer', 'assigned']).optional(),
    }),
  }),
  scoped(async ({ req, stationId, user }) => {
    const vac = await fillVacancy(stationId, Number(req.params.id),
      { memberId: req.body.member_id, method: req.body.method || 'assigned' }, user);
    // 1.5 bypass hook (recorded, not prevented — the market ceiling): a by-person fill
    // while a hiring run is open closes that run as 'assigned_bypass' with attribution.
    await hiringEngine().closeOpenEventsAsBypass(stationId, vac.id, req.body.member_id, user);
    return { data: vac };
  }));

// ── POST /:id/hire — open an ordered hiring run on this vacancy (1.5) ───────────
router.post('/:id/hire', requireOfficer,
  validate({
    params: z.object({ id: z.string().regex(/^\d+$/) }),
    body: z.object({
      list_id: z.number().int().positive(),
      mode: z.enum(['sequential', 'blast']).optional(),
    }),
  }),
  scoped(async ({ req, stationId, user }) => {
    const event = await hiringEngine().openEvent(
      stationId, Number(req.params.id), req.body.list_id, req.body.mode || 'sequential', user);
    return { data: event, _status: 201 };
  }));

// ── POST /:id/cancel — terminal, with recorded reason ───────────────────────────
router.post('/:id/cancel', requireOfficer,
  validate({
    params: z.object({ id: z.string().regex(/^\d+$/) }),
    body: z.object({ reason: z.string().trim().min(1).max(500) }),
  }),
  scoped(async ({ req, stationId, user }) => {
    const vac = await cancelVacancy(stationId, Number(req.params.id), req.body.reason, user);
    return { data: vac };
  }));

module.exports = router;
