'use strict';
/**
 * routes/hiring.js — ordered hiring/callback engine + grievance audit (Phase 1.5).
 * Spec: docs/PHASE1-HIRING-SPEC-2026-07-25.md §4. Migration 0081.
 *
 *   Chief config:
 *     GET/POST            /api/hiring/lists            PATCH /api/hiring/lists/:id
 *     POST                /api/hiring/lists/:id/members       (add / reorder)
 *     DELETE              /api/hiring/lists/:id/members/:memberId
 *     POST                /api/hiring/adjustments      (requires reason → ledger entry)
 *   Officer:
 *     GET                 /api/hiring/events/:id       (the audit view; lazily advanced)
 *     GET                 /api/hiring/events?vacancy_id=
 *     POST                /api/hiring/offers/:id/skip
 *     POST                /api/hiring/events/:id/mandate
 *     POST                /api/hiring/events/:id/cancel
 *     GET                 /api/hiring/events/:id/export (the grievance packet)
 *   Member (self, resolved from the JWT — never a client-sent member id):
 *     GET                 /api/hiring/my-offers        (+ per-list standing)
 *     POST                /api/hiring/offers/:id/accept | /decline
 *
 * (POST /api/vacancies/:id/hire lives in routes/vacancies.js beside the vacancy.)
 * Every event/offer transition goes through utils/hiringEngine — ONE DOOR; there is no
 * raw status/outcome PATCH anywhere. The list snapshot has NO update path (evidence).
 */

const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireOfficer, requireChief } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { canonicalizeCert } = require('../constants/certs');
const { ORDER_METHODS, TIE_BREAKERS, resetWindowStart } = require('../utils/hiringOrder');
const engine = require('../utils/hiringEngine');

const idParam = z.object({ id: z.string().regex(/^\d+$/) });

async function selfMemberId(req, stationId) {
  const r = await pool.query(
    'SELECT id FROM members WHERE user_id = $1 AND department_id = $2 LIMIT 1',
    [req.user.id, stationId]);
  if (!r.rows.length) {
    throw httpError(403, 'Your login is not linked to a roster member.', 'NO_MEMBER_LINK');
  }
  return r.rows[0].id;
}

// ── Chief: list config ────────────────────────────────────────────────────────
const listBase = z.object({
  name: z.string().trim().min(1).max(120),
  list_type: z.enum(['voluntary', 'mandatory']).optional(),
  target_rank: z.string().trim().max(60).optional(),
  required_certs: z.array(z.string().trim().max(40)).max(20).optional(),
  order_method: z.enum(ORDER_METHODS).optional(),
  tie_breakers: z.array(z.enum(TIE_BREAKERS)).max(4).optional(),
  charge_worked: z.boolean().optional(),
  charge_refused: z.boolean().optional(),
  charge_expired: z.boolean().optional(),
  reset_period: z.enum(['annual', 'none']).optional(),
  reset_anchor: z.string().regex(/^\d{2}-\d{2}$/).optional(),
  offer_window_minutes: z.number().int().min(1).max(10080).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

router.get('/lists', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT l.*, (SELECT COUNT(*) FROM hiring_list_members hlm WHERE hlm.list_id = l.id)::int AS member_count
       FROM hiring_lists l WHERE l.department_id = $1
      ORDER BY l.active DESC, l.sort_order, l.id`, [stationId]);
  return { data: rows };
}));

router.post('/lists', requireChief, validate({ body: listBase }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO hiring_lists
         (department_id, name, list_type, target_rank, required_certs, order_method,
          tie_breakers, charge_worked, charge_refused, charge_expired, reset_period,
          reset_anchor, offer_window_minutes, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [stationId, b.name, b.list_type || 'voluntary', b.target_rank || '',
       JSON.stringify((b.required_certs || []).map((c) => canonicalizeCert(c) || c)),
       b.order_method || 'hours_asc',
       JSON.stringify(b.tie_breakers || ['seniority', 'member_id']),
       b.charge_worked ?? true, b.charge_refused ?? false, b.charge_expired ?? false,
       b.reset_period || 'annual', b.reset_anchor || '01-01',
       b.offer_window_minutes ?? 30, b.sort_order ?? 0]);
    await audit(stationId, user, 'create', 'hiring_lists', rows[0].id,
      { name: b.name, list_type: rows[0].list_type, order_method: rows[0].order_method });
    return { data: rows[0], _status: 201 };
  }));

router.patch('/lists/:id', requireChief,
  validate({ params: idParam, body: listBase.partial().extend({ active: z.boolean().optional() }) }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const cols = {
      name: b.name, list_type: b.list_type, target_rank: b.target_rank,
      required_certs: b.required_certs !== undefined
        ? JSON.stringify(b.required_certs.map((c) => canonicalizeCert(c) || c)) : undefined,
      order_method: b.order_method,
      tie_breakers: b.tie_breakers !== undefined ? JSON.stringify(b.tie_breakers) : undefined,
      charge_worked: b.charge_worked, charge_refused: b.charge_refused,
      charge_expired: b.charge_expired, reset_period: b.reset_period,
      reset_anchor: b.reset_anchor, offer_window_minutes: b.offer_window_minutes,
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
      `UPDATE hiring_lists SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${vals.length - 1} AND department_id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) throw httpError(404, 'List not found', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'hiring_lists', rows[0].id,
      { changed: Object.keys(cols).filter((k) => cols[k] !== undefined) });
    return { data: rows[0] };
  }));

router.get('/lists/:id/members', validate({ params: idParam }),
  scoped(async ({ req, stationId }) => {
    const { rows } = await pool.query(
      `SELECT hlm.*, m.name, m.rank FROM hiring_list_members hlm
         JOIN members m ON m.id = hlm.member_id
        WHERE hlm.list_id = $1 AND hlm.department_id = $2
        ORDER BY hlm.manual_order, m.name`, [req.params.id, stationId]);
    return { data: rows };
  }));

router.post('/lists/:id/members', requireChief,
  validate({
    params: idParam,
    body: z.object({
      member_id: z.number().int().positive(),
      manual_order: z.number().int().min(0).max(9999).optional(),
    }),
  }),
  scoped(async ({ req, stationId, user }) => {
    const list = await pool.query(
      'SELECT id FROM hiring_lists WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    if (!list.rows.length) throw httpError(404, 'List not found', 'NOT_FOUND');
    const member = await pool.query(
      'SELECT id FROM members WHERE id = $1 AND department_id = $2', [req.body.member_id, stationId]);
    if (!member.rows.length) throw httpError(400, 'member_id is not a member of this department', 'INVALID_MEMBER');
    const { rows } = await pool.query(
      `INSERT INTO hiring_list_members (department_id, list_id, member_id, manual_order)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (list_id, member_id) DO UPDATE SET manual_order = EXCLUDED.manual_order
       RETURNING *`,
      [stationId, req.params.id, req.body.member_id, req.body.manual_order ?? 0]);
    await audit(stationId, user, 'update', 'hiring_lists', Number(req.params.id),
      { action: 'member_upsert', member_id: req.body.member_id, manual_order: req.body.manual_order ?? 0 });
    return { data: rows[0], _status: 201 };
  }));

router.delete('/lists/:id/members/:memberId', requireChief,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/), memberId: z.string().regex(/^\d+$/) }) }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `DELETE FROM hiring_list_members WHERE list_id = $1 AND member_id = $2 AND department_id = $3 RETURNING id`,
      [req.params.id, req.params.memberId, stationId]);
    if (!rows.length) throw httpError(404, 'Not on this list', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'hiring_lists', Number(req.params.id),
      { action: 'member_removed', member_id: Number(req.params.memberId) });
    return { ok: true };
  }));

// ── Chief: manual counter adjustment (reason REQUIRED — who/when/why history) ──
router.post('/adjustments', requireChief,
  validate({ body: z.object({
    list_id: z.number().int().positive(),
    member_id: z.number().int().positive(),
    delta_hours: z.number().min(-2000).max(2000),
    reason_note: z.string().trim().min(1).max(500),
  }) }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const list = await pool.query(
      'SELECT id FROM hiring_lists WHERE id = $1 AND department_id = $2', [b.list_id, stationId]);
    if (!list.rows.length) throw httpError(404, 'List not found', 'NOT_FOUND');
    const member = await pool.query(
      'SELECT id FROM members WHERE id = $1 AND department_id = $2', [b.member_id, stationId]);
    if (!member.rows.length) throw httpError(400, 'member_id is not a member of this department', 'INVALID_MEMBER');
    const row = await engine.charge(stationId, b.list_id, b.member_id, b.delta_hours,
      'adjustment', 'manual', null, b.reason_note, user);
    return { data: row, _status: 201 };
  }));

// ── Officer: the event audit view (lazily advanced on read) ──────────────────
router.get('/events', requireOfficer,
  validate({ query: z.object({ vacancy_id: z.string().regex(/^\d+$/).optional() }) }),
  scoped(async ({ req, stationId }) => {
    const vals = [stationId];
    let where = 'department_id = $1';
    if (req.query.vacancy_id) { vals.push(req.query.vacancy_id); where += ` AND vacancy_id = $${vals.length}`; }
    const { rows } = await pool.query(
      `SELECT * FROM hiring_events WHERE ${where} ORDER BY created_at DESC LIMIT 50`, vals);
    return { data: rows };
  }));

router.get('/events/:id', requireOfficer, validate({ params: idParam }),
  scoped(async ({ req, stationId, user }) => {
    const event = await engine.advanceEvent(stationId, Number(req.params.id), user);
    const offers = await pool.query(
      `SELECT ho.*, m.name AS member_name FROM hiring_offers ho
         JOIN members m ON m.id = ho.member_id
        WHERE ho.event_id = $1 AND ho.department_id = $2
        ORDER BY ho.position_in_list, ho.id`, [event.id, stationId]);
    return { data: { ...event, list_snapshot: JSON.parse(event.list_snapshot || '{}'), offers: offers.rows } };
  }));

// The grievance packet: the full event record in one export (record-keeping, not adjudication).
router.get('/events/:id/export', requireOfficer, validate({ params: idParam }),
  scoped(async ({ req, stationId }) => {
    const ev = await pool.query(
      `SELECT e.*, l.name AS list_name, l.order_method, l.tie_breakers, l.list_type,
              v.shift_date, v.position_name, v.cause
         FROM hiring_events e
         JOIN hiring_lists l ON l.id = e.list_id
         JOIN vacancies v ON v.id = e.vacancy_id
        WHERE e.id = $1 AND e.department_id = $2`, [req.params.id, stationId]);
    if (!ev.rows.length) throw httpError(404, 'Event not found', 'EVENT_NOT_FOUND');
    const offers = await pool.query(
      `SELECT ho.*, m.name AS member_name FROM hiring_offers ho
         JOIN members m ON m.id = ho.member_id
        WHERE ho.event_id = $1 ORDER BY ho.position_in_list, ho.id`, [req.params.id]);
    const charges = await pool.query(
      `SELECT * FROM hiring_charge_ledger
        WHERE department_id = $1 AND ((source_kind = 'hiring_event' AND source_id = $2)
           OR (source_kind = 'hiring_offer' AND source_id = ANY($3)))
        ORDER BY id`, [stationId, req.params.id, offers.rows.map((o) => o.id)]);
    const e = ev.rows[0];
    return { data: {
      generated_at: new Date().toISOString(),
      event: { ...e, list_snapshot: JSON.parse(e.list_snapshot || '{}') },
      offers: offers.rows,
      charges: charges.rows,
      note: 'Complete record of this hiring run: the eligible list in order at the moment of hiring (with per-candidate factors and exclusion reasons), every offer with timestamps and outcomes, skips with attribution, charges posted, and the award.',
    } };
  }));

router.post('/offers/:id/skip', requireOfficer,
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(1).max(500) }) }),
  scoped(async ({ req, stationId, user }) => {
    const offer = await engine.skipOffer(stationId, Number(req.params.id), req.body.reason, user);
    return { data: offer };
  }));

router.post('/events/:id/mandate', requireOfficer,
  validate({ params: idParam, body: z.object({ member_id: z.number().int().positive() }) }),
  scoped(async ({ req, stationId, user }) => {
    const result = await engine.mandate(stationId, Number(req.params.id), req.body.member_id, user);
    return { data: result };
  }));

router.post('/events/:id/cancel', requireOfficer,
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(1).max(500) }) }),
  scoped(async ({ req, stationId, user }) => {
    const event = await engine.cancelEvent(stationId, Number(req.params.id), req.body.reason, user);
    return { data: event };
  }));

// ── Member: my offers + standing (self-resolved, transparency is the market bar) ──
router.get('/my-offers', scoped(async ({ req, stationId, user }) => {
  const memberId = await selfMemberId(req, stationId);
  // Lazy-advance any open events with my pending offers so expiries are honest on read.
  const evs = await pool.query(
    `SELECT DISTINCT e.id FROM hiring_events e
       JOIN hiring_offers ho ON ho.event_id = e.id
      WHERE e.department_id = $1 AND e.status = 'open' AND ho.member_id = $2`,
    [stationId, memberId]);
  for (const e of evs.rows) { try { await engine.advanceEvent(stationId, e.id, user); } catch (_) {} }

  const offers = await pool.query(
    `SELECT ho.*, e.status AS event_status, v.shift_date, v.position_name, v.hours AS vacancy_hours
       FROM hiring_offers ho
       JOIN hiring_events e ON e.id = ho.event_id
       JOIN vacancies v ON v.id = e.vacancy_id
      WHERE ho.department_id = $1 AND ho.member_id = $2
      ORDER BY ho.offered_at DESC LIMIT 50`, [stationId, memberId]);

  const lists = await pool.query(
    `SELECT l.id, l.name, l.order_method, l.reset_period, l.reset_anchor
       FROM hiring_lists l JOIN hiring_list_members hlm ON hlm.list_id = l.id
      WHERE l.department_id = $1 AND hlm.member_id = $2 AND l.active = TRUE`,
    [stationId, memberId]);
  const standing = [];
  for (const l of lists.rows) {
    const since = resetWindowStart(l, new Date().toISOString());
    const bal = await pool.query(
      `SELECT COALESCE(SUM(delta_hours), 0) AS balance FROM hiring_charge_ledger
        WHERE department_id = $1 AND list_id = $2 AND member_id = $3 AND created_at >= $4`,
      [stationId, l.id, memberId, since]);
    standing.push({ list_id: l.id, list_name: l.name, order_method: l.order_method,
      balance: Number(bal.rows[0].balance), window_start: since });
  }
  return { data: { member_id: memberId, offers: offers.rows, standing } };
}));

router.post('/offers/:id/accept', validate({ params: idParam }),
  scoped(async ({ req, stationId, user }) => {
    const memberId = await selfMemberId(req, stationId);
    const result = await engine.acceptOffer(stationId, Number(req.params.id), memberId, user);
    return { data: result };
  }));

router.post('/offers/:id/decline', validate({ params: idParam }),
  scoped(async ({ req, stationId, user }) => {
    const memberId = await selfMemberId(req, stationId);
    const offer = await engine.declineOffer(stationId, Number(req.params.id), memberId, user);
    return { data: offer };
  }));

module.exports = router;
