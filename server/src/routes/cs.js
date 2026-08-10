'use strict';
/**
 * routes/cs.js — controlled-substance chain of custody (Phase 2.7, migration 0087).
 * Spec: docs/PHASE2-NARCOTICS-SPEC-2026-07-26.md · 21 CFR §1304.27 (91 FR 5241).
 *
 * ⚠ DALE-GATED MODULE: builds + tests locally; ships only after Dale's review.
 *
 * The doctrines (fi-grade — this module exists to be read by a DEA investigator):
 *   · cs_events is APPEND-ONLY (DB-enforced, 0087). Corrections are count_adjust
 *     events referencing what they correct. Nothing is edited. Nothing is deleted.
 *   · ONE DOOR: item status/location/remaining are written only inside the event
 *     door, from the event's own semantics. No PATCH on items.
 *   · DUAL AUTH: the actor re-proves identity with their CS PIN on every event;
 *     wasting/expiring/breaking/destroying also require a WITNESS — a second,
 *     DISTINCT human presenting their own PIN + e-signature (§1304.27(a)(11)).
 *     A failed PIN is a generic CS_AUTH_FAILED (never say which factor), audited.
 *   · ONLINE-ONLY. No sync-brain vocabulary. Deliberate market ceiling.
 *   · Server-authoritative time. `clientRecordedAt` is metadata, never the record.
 *   · Every read of the custody surface is audit-logged (the operator-console
 *     posture): this data's purpose is inspection.
 */

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { z } = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireOfficer, requireChief, roleLevel } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const {
  SCHEDULES, LOCATION_KINDS, SEAL_MODES, EVENT_KINDS, COUNT_KINDS,
  DISCREPANCY_RESOLUTIONS, NOTIFY_HOURS,
} = require('../constants/csVocab');
const { DATA_URL_RE, MAX_SIGNATURE_BYTES } = require('./fiSignatures');

const idParam = z.object({ id: z.string().regex(/^\d+$/) });
const PIN_RE = /^\d{4,8}$/;
const KIND_MIN_LEVEL = { member: 1, officer: 2, chief: 3 };

/**
 * CS PIN throttle (0114 — Dale's 2026-07-27 review).
 * PIN_RE permits 4 digits, so the weakest allowed PIN is 10,000 combinations.
 *
 * PER-USER, not per-IP, on purpose: index.js states the standing doctrine
 * "never rate-limit a firehouse during operations" — an IP bucket would punish
 * a whole station sharing one NAT address. The credential under attack belongs
 * to one user, so the counter lives on that user's row.
 *
 * COOLDOWN, not lockout: this gates the controlled-substance RECORD. A lock
 * needing an admin to clear is a 3am failure mode — the drug is administered
 * regardless and only the record stops, which pushes a crew to paper. Every
 * cooldown expires on its own; there is deliberately no unlock endpoint.
 */
const CS_PIN_FREE_ATTEMPTS = 5;                    // attempts before any cooldown
const CS_PIN_COOLDOWN_S = [30, 60, 120, 300];      // progressive, capped at 5 min
// Fixed cost-10 hash (matches bcrypt.hash(pin, 10) at enrolment) used so the
// no-PIN-enrolled path spends the same time as a real comparison. Generated from
// 32 random bytes; no 4-8 digit PIN can match it.
const CS_PIN_DUMMY_HASH = '$2b$10$S91NJGgHPjPp3vQxE/s.WuhnLL00xcT0lMl1ZqZW8lx/eJf88qt2.';
const CS_PIN_DUMMY_PIN = '00000000';

/**
 * The CS-manager capability grant (market ruling 2026-07-26: every platform in
 * this class ships admin-CONFIGURABLE CS access — mirrored on our 2.2
 * fleet_maintenance precedent, never a role rung). Chief-level always qualifies.
 */
function isCsManager(user) {
  return !!user && (roleLevel(user.role) >= 3 || user.cs_manager === true);
}
function requireCsManager(req, res, next) {
  if (!isCsManager(req.user)) {
    return res.status(403).json({
      error: 'This action requires chief authority or the controlled-substance manager grant.',
      code: 'FORBIDDEN_CS_MANAGER',
    });
  }
  next();
}

// ── CS PIN infrastructure ────────────────────────────────────────────────────

/**
 * Verify a user's CS PIN. Returns the user row {id, name, username} on success;
 * throws 403 CS_AUTH_FAILED otherwise. Deliberately does NOT distinguish
 * "no PIN enrolled" from "wrong PIN" — and the refusal is audited either way.
 */
async function verifyCsPin(stationId, actingUser, userId, pin, roleLabel) {
  const { rows } = await pool.query(
    `SELECT id, name, username, cs_pin_hash, cs_pin_fail_count,
            cs_pin_locked_until,
            GREATEST(0, CEIL(EXTRACT(EPOCH FROM (cs_pin_locked_until - now()))))::int AS cooldown_left
       FROM users WHERE id = $1`, [userId]);
  const u = rows[0];

  // Cooldown still running — refuse BEFORE spending a bcrypt round, so the
  // throttle cannot itself be used as a timing oracle.
  if (u && u.cooldown_left > 0) {
    await audit(stationId, actingUser, 'update', 'cs_events', null,
      { cs_auth_throttled_for: userId, as: roleLabel, retry_after_s: u.cooldown_left });
    throw httpError(429,
      `Too many failed attempts. Try again in ${u.cooldown_left}s.`, 'CS_AUTH_THROTTLED');
  }

  // ALWAYS spend a bcrypt round, even with no PIN enrolled and no user row.
  // The refusal above this function is deliberately identical for "no PIN" and
  // "wrong PIN"; without a dummy compare the RESPONSE TIME still separates them,
  // which leaks enrollment state. (Dale, 2026-07-27.)
  const hash = (u && u.cs_pin_hash) ? u.cs_pin_hash : CS_PIN_DUMMY_HASH;
  const candidate = (typeof pin === 'string' && PIN_RE.test(pin)) ? pin : CS_PIN_DUMMY_PIN;
  const matched = await bcrypt.compare(candidate, hash);
  const ok = Boolean(u && u.cs_pin_hash && matched);

  if (!ok) {
    const fails = (u ? u.cs_pin_fail_count : 0) + 1;
    let lockSeconds = 0;
    if (u && fails >= CS_PIN_FREE_ATTEMPTS) {
      const tier = Math.min(fails - CS_PIN_FREE_ATTEMPTS, CS_PIN_COOLDOWN_S.length - 1);
      lockSeconds = CS_PIN_COOLDOWN_S[tier];
      await pool.query(
        `UPDATE users SET cs_pin_fail_count = $2,
                          cs_pin_locked_until = now() + make_interval(secs => $3)
          WHERE id = $1`, [userId, fails, lockSeconds]);
    } else if (u) {
      await pool.query('UPDATE users SET cs_pin_fail_count = $2 WHERE id = $1', [userId, fails]);
    }
    await audit(stationId, actingUser, 'update', 'cs_events', null,
      { cs_auth_failed_for: userId, as: roleLabel, fail_count: fails, cooldown_s: lockSeconds });
    throw httpError(403, 'Controlled-substance verification failed.', 'CS_AUTH_FAILED');
  }

  // Success clears the counter — a correct PIN always restores full speed.
  if (u.cs_pin_fail_count > 0 || u.cs_pin_locked_until) {
    await pool.query(
      'UPDATE users SET cs_pin_fail_count = 0, cs_pin_locked_until = NULL WHERE id = $1', [userId]);
  }
  return { id: u.id, name: u.name || u.username || '' };
}

// Set/rotate YOUR OWN PIN. If one exists, the old PIN must be presented.
router.post('/pin',
  validate({ body: z.object({
    pin: z.string().regex(PIN_RE, 'PIN must be 4–8 digits'),
    old_pin: z.string().optional(),
  }).strict() }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query('SELECT cs_pin_hash FROM users WHERE id = $1', [user.id]);
    if (rows[0]?.cs_pin_hash) {
      const ok = req.body.old_pin ? await bcrypt.compare(req.body.old_pin, rows[0].cs_pin_hash) : false;
      if (!ok) throw httpError(403, 'Controlled-substance verification failed.', 'CS_AUTH_FAILED');
    }
    const hash = await bcrypt.hash(req.body.pin, 10);
    await pool.query('UPDATE users SET cs_pin_hash = $1 WHERE id = $2', [hash, user.id]);
    await audit(stationId, user, 'update', 'users', user.id, { cs_pin: 'set' });
    return { data: { enrolled: true } };
  }));

// Chief clears a member's PIN (forces re-enrollment). Never sets one FOR them.
router.post('/pin/reset/:id', requireCsManager, validate({ params: idParam }),
  scoped(async ({ req, stationId, user }) => {
    // Membership first, then the update by id — `users` has no department_id
    // column, and the tenancy guard (rightly) refuses dept filters near it.
    const member = await pool.query(
      'SELECT user_id FROM of_user_departments WHERE user_id = $1 AND department_id = $2',
      [req.params.id, stationId]);
    if (!member.rows.length) throw httpError(404, 'Member not found in your department.', 'NOT_FOUND');
    const { rows } = await pool.query(
      'UPDATE users SET cs_pin_hash = NULL WHERE id = $1 RETURNING id', [req.params.id]);
    await audit(stationId, user, 'update', 'users', rows[0].id, { cs_pin: 'reset' });
    return { data: { reset: true } };
  }));

// Enrollment status (self) — the client needs to know whether to prompt enroll.
router.get('/pin/status', scoped(async ({ user }) => {
  const { rows } = await pool.query('SELECT cs_pin_hash IS NOT NULL AS enrolled FROM users WHERE id = $1', [user.id]);
  return { data: { enrolled: rows[0]?.enrolled === true } };
}));

// ── Catalog: substances + locations (chief) ──────────────────────────────────

const substanceBody = z.object({
  name: z.string().trim().min(1).max(120),
  schedule: z.enum(SCHEDULES),
  finished_form: z.string().trim().min(1).max(160),   // §1304.27(a)(2)
  unit_label: z.string().trim().min(1).max(20),
  units_per_container: z.number().positive(),
  active: z.boolean().optional(),
}).strict();

router.get('/substances', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    'SELECT * FROM cs_substances WHERE department_id = $1 ORDER BY name', [stationId]);
  return { data: rows };
}));

router.post('/substances', requireCsManager, validate({ body: substanceBody }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO cs_substances (department_id, station_id, name, schedule, finished_form, unit_label, units_per_container)
       VALUES ($1,$1,$2,$3,$4,$5,$6) RETURNING *`,
      [stationId, b.name, b.schedule, b.finished_form, b.unit_label, b.units_per_container]);
    await audit(stationId, user, 'create', 'cs_substances', rows[0].id, { name: b.name, schedule: b.schedule });
    return { data: rows[0], _status: 201 };
  }));

router.patch('/substances/:id', requireCsManager,
  validate({ params: idParam, body: substanceBody.partial() }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const sets = []; const vals = [req.params.id, stationId];
    for (const k of ['name', 'schedule', 'finished_form', 'unit_label', 'units_per_container', 'active']) {
      if (b[k] !== undefined) { vals.push(b[k]); sets.push(`${k} = $${vals.length}`); }
    }
    if (!sets.length) throw httpError(422, 'Nothing to update.', 'EMPTY_PATCH');
    const { rows } = await pool.query(
      `UPDATE cs_substances SET ${sets.join(', ')} WHERE id = $1 AND department_id = $2 RETURNING *`, vals);
    if (!rows.length) throw httpError(404, 'Substance not found.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'cs_substances', rows[0].id, { fields: Object.keys(b) });
    return { data: rows[0] };
  }));

const locationBody = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(LOCATION_KINDS),
  home_station_id: z.number().int().positive().nullable().optional(),
  apparatus_id: z.number().int().positive().nullable().optional(),
  seal_mode: z.enum(SEAL_MODES).optional(),
  par_level: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
}).strict();

router.get('/locations', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT l.*, a.designation AS apparatus_designation,
            (SELECT COUNT(*)::int FROM cs_items i WHERE i.location_id = l.id AND i.status = 'in_stock') AS on_hand
       FROM cs_locations l LEFT JOIN apparatus a ON a.id = l.apparatus_id
      WHERE l.department_id = $1 ORDER BY l.name`, [stationId]);
  return { data: rows };
}));

router.post('/locations', requireCsManager, validate({ body: locationBody }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    if (b.apparatus_id) {
      const a = await pool.query('SELECT id FROM apparatus WHERE id = $1 AND department_id = $2', [b.apparatus_id, stationId]);
      if (!a.rows.length) throw httpError(422, 'Apparatus not found in your department.', 'BAD_APPARATUS');
    }
    const { rows } = await pool.query(
      `INSERT INTO cs_locations (department_id, station_id, name, kind, home_station_id, apparatus_id, seal_mode, par_level)
       VALUES ($1,$1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [stationId, b.name, b.kind, b.home_station_id || null, b.apparatus_id || null,
       b.seal_mode || 'single', b.par_level || null]);
    await audit(stationId, user, 'create', 'cs_locations', rows[0].id, { name: b.name, kind: b.kind });
    return { data: rows[0], _status: 201 };
  }));

router.patch('/locations/:id', requireCsManager,
  validate({ params: idParam, body: locationBody.partial() }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const sets = []; const vals = [req.params.id, stationId];
    for (const k of ['name', 'kind', 'home_station_id', 'apparatus_id', 'seal_mode', 'par_level', 'active']) {
      if (b[k] !== undefined) { vals.push(b[k]); sets.push(`${k} = $${vals.length}`); }
    }
    if (!sets.length) throw httpError(422, 'Nothing to update.', 'EMPTY_PATCH');
    const { rows } = await pool.query(
      `UPDATE cs_locations SET ${sets.join(', ')} WHERE id = $1 AND department_id = $2 RETURNING *`, vals);
    if (!rows.length) throw httpError(404, 'Location not found.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'cs_locations', rows[0].id, { fields: Object.keys(b) });
    return { data: rows[0] };
  }));

// ── Items (read-only surface — writes happen through the event door) ─────────

router.get('/items',
  validate({ query: z.object({
    status: z.string().optional(), location_id: z.string().regex(/^\d+$/).optional(),
  }).partial() }),
  scoped(async ({ req, stationId, user }) => {
    const conds = ['i.department_id = $1']; const vals = [stationId];
    if (req.query.status) { vals.push(req.query.status); conds.push(`i.status = $${vals.length}`); }
    if (req.query.location_id) { vals.push(req.query.location_id); conds.push(`i.location_id = $${vals.length}`); }
    const { rows } = await pool.query(
      `SELECT i.*, s.name AS substance_name, s.schedule, s.finished_form, s.unit_label,
              l.name AS location_name
         FROM cs_items i
         JOIN cs_substances s ON s.id = i.substance_id
         LEFT JOIN cs_locations l ON l.id = i.location_id
        WHERE ${conds.join(' AND ')}
        ORDER BY s.name, i.control_no`, vals);
    await audit(stationId, user, 'update', 'cs_events', null, { cs_read: 'items', n: rows.length });
    return { data: rows };
  }));

// The §1304.27 completeness surface: one vial, its whole custody life.
router.get('/items/:id/history', validate({ params: idParam }),
  scoped(async ({ req, stationId, user }) => {
    const item = await pool.query(
      `SELECT i.*, s.name AS substance_name, s.schedule, s.finished_form, s.unit_label, s.units_per_container
         FROM cs_items i JOIN cs_substances s ON s.id = i.substance_id
        WHERE i.id = $1 AND i.department_id = $2`, [req.params.id, stationId]);
    if (!item.rows.length) throw httpError(404, 'Item not found.', 'NOT_FOUND');
    const events = await pool.query(
      `SELECT e.*, fl.name AS location_name, tl.name AS to_location_name
         FROM cs_events e
         LEFT JOIN cs_locations fl ON fl.id = e.location_id
         LEFT JOIN cs_locations tl ON tl.id = e.to_location_id
        WHERE e.department_id = $2
          AND (e.item_id = $1
               -- the vial's BIRTH record: acquisition events carry no item_id (they
               -- mint a batch) — the item points back at its event instead. Without
               -- this branch the §1304.27 history would omit the acquisition.
               OR e.id = (SELECT acquired_event_id FROM cs_items WHERE id = $1 AND department_id = $2))
        ORDER BY e.occurred_at, e.id`, [req.params.id, stationId]);
    await audit(stationId, user, 'update', 'cs_events', null, { cs_read: 'history', item: Number(req.params.id) });
    return { data: { item: item.rows[0], events: events.rows } };
  }));

// ── THE EVENT DOOR ───────────────────────────────────────────────────────────

const newItemShape = z.object({
  control_no: z.string().trim().min(1).max(60),
  lot_no: z.string().trim().max(60).optional(),
  expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

const eventBody = z.object({
  kind: z.enum(Object.keys(EVENT_KINDS)),
  item_id: z.number().int().positive().optional(),
  location_id: z.number().int().positive().optional(),
  to_location_id: z.number().int().positive().optional(),
  substance_id: z.number().int().positive().optional(),     // acquire/restock
  new_items: z.array(newItemShape).max(200).optional(),     // acquire/restock mint vials
  amount_administered: z.number().positive().optional(),
  amount_disposed: z.number().positive().optional(),
  manner_disposed: z.string().trim().max(200).optional(),
  patient_identifier: z.string().trim().max(80).optional(), // run/patient ID — never name+DOB prose
  incident_number: z.string().trim().max(60).optional(),
  standing_order: z.boolean().optional(),
  authorizer_name: z.string().trim().max(120).optional(),
  counterpart_name: z.string().trim().max(200).optional(),
  counterpart_address: z.string().trim().max(300).optional(),
  counterpart_dea_no: z.string().trim().max(30).optional(),
  containers: z.number().int().positive().optional(),
  seals_broken: z.string().trim().max(200).optional(),
  seals_applied: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
  corrects_event_id: z.number().int().positive().optional(), // count_adjust references its target
  client_recorded_at: z.string().datetime().optional(),     // METADATA only
  actor_pin: z.string(),                                    // dual-auth factor 1
  actor_signature: z.string().optional(),                   // REQUIRED for destroy (§1317.95: both employees sign)
  witness_user_id: z.number().int().positive().optional(),
  witness_pin: z.string().optional(),
  witness_signature: z.string().optional(),                 // data-URL
}).strict();                                                // strict ⇒ unknown fields REFUSED

router.post('/events', validate({ body: eventBody }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const spec = EVENT_KINDS[b.kind];

    // Role floor per kind (the crew administers; command acquires/destroys).
    // Destruction + corrections are CS-MANAGER work (market ruling 2026-07-26:
    // admin-configurable access, the fleet_maintenance pattern).
    if (spec.role === 'cs_manager') {
      if (!isCsManager(user)) {
        throw httpError(403, `A '${b.kind}' event requires the controlled-substance manager grant.`, 'FORBIDDEN_CS_MANAGER');
      }
    } else if (roleLevel(user.role) < KIND_MIN_LEVEL[spec.role]) {
      throw httpError(403, `A '${b.kind}' event requires ${spec.role} authority.`, 'FORBIDDEN_ROLE');
    }

    // §1317.95(c): destruction records carry BOTH employees' signatures.
    if (b.kind === 'destroy') {
      if (!b.actor_signature || !DATA_URL_RE.test(b.actor_signature)
          || b.actor_signature.length > MAX_SIGNATURE_BYTES) {
        throw httpError(422, 'Destruction requires YOUR signature as well as the witness\'s (§1317.95).', 'SIGNATURE_REQUIRED');
      }
    }

    // Dual-auth factor 1: the ACTOR re-proves identity with their CS PIN.
    const actor = await verifyCsPin(stationId, user, user.id, b.actor_pin, 'actor');

    // Witness where the doctrine demands one — a second, DISTINCT human with
    // their own PIN and a captured e-signature (§1304.27(a)(11)).
    let witness = null;
    if (spec.witness) {
      if (!b.witness_user_id || !b.witness_pin) {
        throw httpError(422, `A '${b.kind}' event requires a witness.`, 'WITNESS_REQUIRED');
      }
      if (b.witness_user_id === user.id) {
        throw httpError(422, 'You cannot witness your own event.', 'SELF_WITNESS');
      }
      const member = await pool.query(
        'SELECT 1 FROM of_user_departments WHERE user_id = $1 AND department_id = $2',
        [b.witness_user_id, stationId]);
      if (!member.rows.length) throw httpError(422, 'Witness is not a member of your department.', 'BAD_WITNESS');
      witness = await verifyCsPin(stationId, user, b.witness_user_id, b.witness_pin, 'witness');
      if (!b.witness_signature || !DATA_URL_RE.test(b.witness_signature)
          || b.witness_signature.length > MAX_SIGNATURE_BYTES) {
        throw httpError(422, 'A witness e-signature is required.', 'SIGNATURE_REQUIRED');
      }
    }

    // Counterpart registrant fields where §1304.27(b) demands them.
    if (spec.counterpart && !(b.counterpart_name && b.counterpart_name.trim())) {
      throw httpError(422, `A '${b.kind}' event must name the counterpart (hospital/vendor/reverse distributor).`,
        'COUNTERPART_REQUIRED');
    }

    // ── Kind-specific semantics ─────────────────────────────────────────────
    let item = null;
    if (['transfer', 'deliver', 'administer', 'waste', 'expire', 'break', 'destroy', 'count_adjust'].includes(b.kind)) {
      if (!b.item_id) throw httpError(422, 'item_id is required for this event.', 'ITEM_REQUIRED');
      const r = await pool.query(
        `SELECT i.*, s.units_per_container FROM cs_items i
           JOIN cs_substances s ON s.id = i.substance_id
          WHERE i.id = $1 AND i.department_id = $2`, [b.item_id, stationId]);
      if (!r.rows.length) throw httpError(404, 'Item not found.', 'NOT_FOUND');
      item = r.rows[0];
    }
    if ((b.kind === 'acquire' || b.kind === 'restock_hospital')) {
      if (!b.substance_id || !Array.isArray(b.new_items) || !b.new_items.length) {
        throw httpError(422, 'Acquisition needs a substance and at least one vial (control numbers).', 'ITEMS_REQUIRED');
      }
      if (!b.location_id) throw httpError(422, 'Acquisition needs the receiving location.', 'LOCATION_REQUIRED');
      const s = await pool.query(
        'SELECT id, units_per_container FROM cs_substances WHERE id = $1 AND department_id = $2',
        [b.substance_id, stationId]);
      if (!s.rows.length) throw httpError(422, 'Substance not in your catalog.', 'BAD_SUBSTANCE');
      b._units_per_container = Number(s.rows[0].units_per_container); // §1304.27(b)(1)(iii) on the ledger row
    }
    if (b.kind === 'count_adjust' && b.corrects_event_id) {
      const ce = await pool.query('SELECT id FROM cs_events WHERE id = $1 AND department_id = $2', [b.corrects_event_id, stationId]);
      if (!ce.rows.length) throw httpError(422, 'The event being corrected is not on your books.', 'BAD_CORRECTION_TARGET');
    }
    for (const locKey of ['location_id', 'to_location_id']) {
      if (b[locKey]) {
        const l = await pool.query('SELECT id FROM cs_locations WHERE id = $1 AND department_id = $2', [b[locKey], stationId]);
        if (!l.rows.length) throw httpError(422, 'Location not in your department.', 'BAD_LOCATION');
      }
    }

    // Custody math + the one-door state machine.
    if (b.kind === 'administer') {
      if (item.status !== 'in_stock') throw httpError(409, 'This vial is not in stock.', 'NOT_IN_STOCK');
      if (!b.amount_administered) throw httpError(422, 'amount_administered is required.', 'AMOUNT_REQUIRED');
      const full = Number(item.remaining_units ?? item.units_per_container);
      if (b.amount_administered > full) {
        throw httpError(422, `Amount exceeds what the vial holds (${full}).`, 'AMOUNT_EXCEEDS_VIAL');
      }
      if (!b.incident_number) throw httpError(422, 'The incident number is required.', 'INCIDENT_REQUIRED');
    }
    if (b.kind === 'waste') {
      if (!['in_stock', 'administered'].includes(item.status)) {
        throw httpError(409, 'This vial cannot be wasted from its current state.', 'BAD_STATE');
      }
      const remaining = Number(item.remaining_units ?? item.units_per_container);
      if (!b.amount_disposed) throw httpError(422, 'amount_disposed is required.', 'AMOUNT_REQUIRED');
      if (Number(b.amount_disposed) !== remaining) {
        throw httpError(422, `Waste must account for the full remainder (${remaining}).`, 'WASTE_MISMATCH');
      }
      if (!b.manner_disposed) throw httpError(422, 'manner_disposed is required (§1304.27(a)(10)).', 'MANNER_REQUIRED');
    }
    if (['transfer', 'deliver'].includes(b.kind)) {
      if (item.status !== 'in_stock') throw httpError(409, 'Only an in-stock vial can move.', 'NOT_IN_STOCK');
      if (!b.to_location_id) throw httpError(422, 'to_location_id is required.', 'LOCATION_REQUIRED');
    }
    if (['expire', 'break', 'destroy'].includes(b.kind) && !['in_stock', 'administered'].includes(item.status)) {
      throw httpError(409, 'This vial is already out of custody.', 'BAD_STATE');
    }
    if (b.kind === 'count_adjust' && !b.note) {
      throw httpError(422, 'A correction must say what it corrects and why.', 'NOTE_REQUIRED');
    }

    // ── Write the ledger row (server time; client time is metadata) ─────────
    const { rows: evRows } = await pool.query(
      `INSERT INTO cs_events
         (department_id, station_id, kind, item_id, location_id, to_location_id,
          client_recorded_at, amount_administered, amount_disposed, manner_disposed,
          patient_identifier, incident_number, standing_order, authorizer_name,
          counterpart_name, counterpart_address, counterpart_dea_no, containers, units_per_container,
          seals_broken, seals_applied, actor_user_id, actor_name, actor_signature,
          witness_user_id, witness_name, witness_signature, corrects_event_id, note)
       VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       RETURNING *`,
      [stationId, b.kind, b.item_id || null, b.location_id || item?.location_id || null,
       b.to_location_id || null, b.client_recorded_at || null,
       b.amount_administered || null, b.amount_disposed || null, b.manner_disposed || '',
       b.patient_identifier || '', b.incident_number || '', b.standing_order ?? null,
       b.authorizer_name || '', b.counterpart_name || '', b.counterpart_address || '',
       b.counterpart_dea_no || '', b.containers || null,
       b._units_per_container ?? null,
       b.seals_broken || '', b.seals_applied || '',
       actor.id, actor.name, b.actor_signature || '',
       witness?.id || null, witness?.name || '',
       b.witness_signature || '', b.corrects_event_id || null, b.note || '']);
    const ev = evRows[0];

    // ── Apply the event's consequences (the ONE door writes item state) ─────
    const minted = [];
    if (b.kind === 'acquire' || b.kind === 'restock_hospital') {
      for (const ni of b.new_items) {
        const { rows: ir } = await pool.query(
          `INSERT INTO cs_items (department_id, station_id, substance_id, control_no, lot_no, expiration,
                                 location_id, remaining_units, acquired_event_id)
           SELECT $1, $1, $2, $3, $4, $5, $6, s.units_per_container, $7
             FROM cs_substances s WHERE s.id = $2 RETURNING *`,
          [stationId, b.substance_id, ni.control_no, ni.lot_no || '', ni.expiration || null,
           b.location_id, ev.id]);
        minted.push(ir[0]);
      }
      if (b.kind === 'restock_hospital') {
        // §1304.27(c): the designated location must notify within 72 hours.
        await pool.query(
          `INSERT INTO cs_notifications (department_id, station_id, event_id, due_by)
           VALUES ($1,$1,$2, NOW() + INTERVAL '${NOTIFY_HOURS} hours')`, [stationId, ev.id]);
      }
    } else if (b.kind === 'administer') {
      const full = Number(item.remaining_units ?? item.units_per_container);
      await pool.query(
        `UPDATE cs_items SET status = 'administered', remaining_units = $3 WHERE id = $1 AND department_id = $2`,
        [item.id, stationId, full - b.amount_administered]);
    } else if (b.kind === 'waste') {
      await pool.query(
        `UPDATE cs_items SET status = 'wasted', remaining_units = 0 WHERE id = $1 AND department_id = $2`,
        [item.id, stationId]);
    } else if (['transfer', 'deliver'].includes(b.kind)) {
      await pool.query(
        `UPDATE cs_items SET location_id = $3 WHERE id = $1 AND department_id = $2`,
        [item.id, stationId, b.to_location_id]);
    } else if (['expire', 'break', 'destroy'].includes(b.kind)) {
      await pool.query(
        `UPDATE cs_items SET status = $3, remaining_units = 0 WHERE id = $1 AND department_id = $2`,
        [item.id, stationId, EVENT_KINDS[b.kind].terminal]);
    }

    await audit(stationId, user, 'create', 'cs_events', ev.id,
      { kind: b.kind, item: b.item_id || null, minted: minted.length, witness: witness?.id || null });
    return { data: { event: ev, minted }, _status: 201 };
  }));

// ── The shift count (two DISTINCT verifiers, both PIN-proved) ────────────────

router.post('/counts',
  validate({ body: z.object({
    location_id: z.number().int().positive(),
    kind: z.enum(COUNT_KINDS),
    seals_verified: z.string().trim().max(200).optional(),
    seals_intact: z.boolean(),
    verifier1_pin: z.string(),
    verifier2_user_id: z.number().int().positive(),
    verifier2_pin: z.string(),
    verifier2_signature: z.string(),
    present_item_ids: z.array(z.number().int().positive()).max(500),
    note: z.string().trim().max(2000).optional(),
  }).strict() }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    if (b.verifier2_user_id === user.id) {
      throw httpError(422, 'A count needs two different people.', 'SELF_WITNESS');
    }
    const loc = await pool.query('SELECT * FROM cs_locations WHERE id = $1 AND department_id = $2', [b.location_id, stationId]);
    if (!loc.rows.length) throw httpError(404, 'Location not found.', 'NOT_FOUND');
    const member = await pool.query(
      'SELECT 1 FROM of_user_departments WHERE user_id = $1 AND department_id = $2', [b.verifier2_user_id, stationId]);
    if (!member.rows.length) throw httpError(422, 'Second verifier is not a member of your department.', 'BAD_WITNESS');

    const v1 = await verifyCsPin(stationId, user, user.id, b.verifier1_pin, 'verifier1');
    const v2 = await verifyCsPin(stationId, user, b.verifier2_user_id, b.verifier2_pin, 'verifier2');
    if (!DATA_URL_RE.test(b.verifier2_signature) || b.verifier2_signature.length > MAX_SIGNATURE_BYTES) {
      throw httpError(422, 'The second verifier must sign.', 'SIGNATURE_REQUIRED');
    }

    // EXPECTED is computed by the SERVER from the ledger — never client-supplied.
    const expected = await pool.query(
      `SELECT id FROM cs_items WHERE department_id = $1 AND location_id = $2 AND status = 'in_stock'`,
      [stationId, b.location_id]);
    const expectedIds = new Set(expected.rows.map((r) => r.id));
    const presentIds = new Set(b.present_item_ids);
    for (const pid of presentIds) {
      if (!expectedIds.has(pid)) {
        const known = await pool.query('SELECT id, status FROM cs_items WHERE id = $1 AND department_id = $2', [pid, stationId]);
        if (!known.rows.length) throw httpError(422, `Unknown item in the count: ${pid}`, 'UNKNOWN_ITEM');
      }
    }

    const lines = [];
    for (const id of expectedIds) lines.push({ item_id: id, expected: true, actual: presentIds.has(id) });
    for (const id of presentIds) if (!expectedIds.has(id)) lines.push({ item_id: id, expected: false, actual: true });
    const clean = lines.every((l) => l.expected === l.actual);

    const { rows: cRows } = await pool.query(
      `INSERT INTO cs_counts (department_id, station_id, location_id, kind, seals_verified, seals_intact,
                              verifier1_user_id, verifier1_name, verifier2_user_id, verifier2_name,
                              verifier2_signature, clean, note)
       VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [stationId, b.location_id, b.kind, b.seals_verified || '', b.seals_intact,
       v1.id, v1.name, v2.id, v2.name, b.verifier2_signature, clean, b.note || '']);
    const count = cRows[0];

    const discrepancies = [];
    for (const l of lines) {
      await pool.query(
        `INSERT INTO cs_count_lines (count_id, department_id, item_id, expected_present, actual_present)
         VALUES ($1,$2,$3,$4,$5)`, [count.id, stationId, l.item_id, l.expected, l.actual]);
      if (l.expected !== l.actual) {
        const { rows: dr } = await pool.query(
          `INSERT INTO cs_discrepancies (department_id, station_id, count_id, item_id, detail)
           VALUES ($1,$1,$2,$3,$4) RETURNING *`,
          [stationId, count.id, l.item_id,
           l.expected ? 'Expected in this location but NOT found at count.' : 'Found at count but not expected here.']);
        discrepancies.push(dr[0]);
      }
    }
    if (!b.seals_intact) {
      const { rows: dr } = await pool.query(
        `INSERT INTO cs_discrepancies (department_id, station_id, count_id, detail)
         VALUES ($1,$1,$2,'Seals not intact at count.') RETURNING *`, [stationId, count.id]);
      discrepancies.push(dr[0]);
    }

    await audit(stationId, user, 'create', 'cs_counts', count.id,
      { location: b.location_id, kind: b.kind, clean, discrepancies: discrepancies.length });
    return { data: { count, lines, discrepancies }, _status: 201 };
  }));

router.get('/counts',
  validate({ query: z.object({ location_id: z.string().regex(/^\d+$/).optional() }).partial() }),
  scoped(async ({ req, stationId }) => {
    const conds = ['c.department_id = $1']; const vals = [stationId];
    if (req.query.location_id) { vals.push(req.query.location_id); conds.push(`c.location_id = $${vals.length}`); }
    const { rows } = await pool.query(
      `SELECT c.*, l.name AS location_name FROM cs_counts c
         JOIN cs_locations l ON l.id = c.location_id
        WHERE ${conds.join(' AND ')} ORDER BY c.counted_at DESC LIMIT 200`, vals);
    return { data: rows };
  }));

// ── Discrepancies (chief resolves, with a reasoned disposition) ──────────────

router.get('/discrepancies', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT d.*, i.control_no, l.name AS location_name
       FROM cs_discrepancies d
       LEFT JOIN cs_items i ON i.id = d.item_id
       LEFT JOIN cs_counts c ON c.id = d.count_id
       LEFT JOIN cs_locations l ON l.id = c.location_id
      WHERE d.department_id = $1
      ORDER BY CASE d.status WHEN 'open' THEN 0 ELSE 1 END, d.opened_at DESC LIMIT 200`, [stationId]);
  return { data: rows };
}));

router.post('/discrepancies/:id/resolve', requireCsManager,
  validate({ params: idParam, body: z.object({
    resolution: z.enum(DISCREPANCY_RESOLUTIONS),
    note: z.string().trim().min(3).max(2000),
    resolving_event_id: z.number().int().positive().optional(),
  }).strict() }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE cs_discrepancies
          SET status = 'resolved', resolution = $3, resolution_note = $4,
              resolved_at = NOW(), resolved_by_user_id = $5, resolving_event_id = $6
        WHERE id = $1 AND department_id = $2 AND status = 'open' RETURNING *`,
      [req.params.id, stationId, req.body.resolution, req.body.note, user.id,
       req.body.resolving_event_id || null]);
    if (!rows.length) throw httpError(404, 'Discrepancy not found or already resolved.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'cs_discrepancies', rows[0].id,
      { resolution: req.body.resolution });
    return { data: rows[0] };
  }));

// ── §1304.27(c) notifications ────────────────────────────────────────────────

router.get('/notifications', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT n.*, e.kind, e.occurred_at, e.counterpart_name
       FROM cs_notifications n JOIN cs_events e ON e.id = n.event_id
      WHERE n.department_id = $1
      ORDER BY (n.acknowledged_at IS NULL) DESC, n.due_by ASC LIMIT 100`, [stationId]);
  return { data: rows };
}));

router.post('/notifications/:id/ack', requireOfficer, validate({ params: idParam }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE cs_notifications SET acknowledged_at = NOW(), acknowledged_by_user_id = $3
        WHERE id = $1 AND department_id = $2 AND acknowledged_at IS NULL RETURNING *`,
      [req.params.id, stationId, user.id]);
    if (!rows.length) throw httpError(404, 'Notification not found or already acknowledged.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'cs_notifications', rows[0].id, { ack: true });
    return { data: rows[0] };
  }));

// ── CS-manager grants (chief manages; the 2.2 fleet-grant pattern) ───────────

router.get('/grants', requireChief, scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.username, u.role, u.cs_manager
       FROM users u JOIN of_user_departments d ON d.user_id = u.id
      WHERE d.department_id = $1 ORDER BY u.name`, [stationId]);
  return { data: rows };
}));

router.post('/grants/:id', requireChief,
  validate({ params: idParam, body: z.object({ granted: z.boolean() }).strict() }),
  scoped(async ({ req, stationId, user }) => {
    const member = await pool.query(
      'SELECT user_id FROM of_user_departments WHERE user_id = $1 AND department_id = $2',
      [req.params.id, stationId]);
    if (!member.rows.length) throw httpError(404, 'Member not found in your department.', 'NOT_FOUND');
    const { rows } = await pool.query(
      'UPDATE users SET cs_manager = $2 WHERE id = $1 RETURNING id, cs_manager', [req.params.id, req.body.granted]);
    await audit(stationId, user, 'update', 'users', rows[0].id, { cs_manager: req.body.granted });
    return { data: rows[0] };
  }));

// ── The department-wide custody feed (market bar: full activity histories) ───

router.get('/events',
  validate({ query: z.object({
    kind: z.string().optional(),
    location_id: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  }).partial() }),
  scoped(async ({ req, stationId, user }) => {
    const conds = ['e.department_id = $1']; const vals = [stationId];
    if (req.query.kind && Object.prototype.hasOwnProperty.call(EVENT_KINDS, req.query.kind)) {
      vals.push(req.query.kind); conds.push(`e.kind = $${vals.length}`);
    }
    if (req.query.location_id) {
      vals.push(req.query.location_id);
      conds.push(`(e.location_id = $${vals.length} OR e.to_location_id = $${vals.length})`);
    }
    const limit = Math.min(Number(req.query.limit || 100), 300);
    vals.push(limit);
    const { rows } = await pool.query(
      `SELECT e.*, i.control_no, s.name AS substance_name, s.finished_form,
              fl.name AS location_name, tl.name AS to_location_name
         FROM cs_events e
         LEFT JOIN cs_items i ON i.id = e.item_id
         LEFT JOIN cs_substances s ON s.id = i.substance_id
         LEFT JOIN cs_locations fl ON fl.id = e.location_id
         LEFT JOIN cs_locations tl ON tl.id = e.to_location_id
        WHERE ${conds.join(' AND ')}
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT $${vals.length}`, vals);
    await audit(stationId, user, 'update', 'cs_events', null, { cs_read: 'feed', n: rows.length });
    return { data: rows };
  }));

// ── Reports ──────────────────────────────────────────────────────────────────

// Current inventory (the "be ready for an inspection in minutes" surface).
router.get('/reports/inventory', scoped(async ({ stationId, user }) => {
  const { rows } = await pool.query(
    `SELECT s.name, s.schedule, s.finished_form, l.name AS location_name,
            COUNT(*)::int AS vials, l.par_level
       FROM cs_items i
       JOIN cs_substances s ON s.id = i.substance_id
       LEFT JOIN cs_locations l ON l.id = i.location_id
      WHERE i.department_id = $1 AND i.status = 'in_stock'
      GROUP BY s.name, s.schedule, s.finished_form, l.name, l.par_level
      ORDER BY s.name, l.name`, [stationId]);
  await audit(stationId, user, 'update', 'cs_events', null, { cs_read: 'inventory_report' });
  return { data: rows };
}));

module.exports = router;
