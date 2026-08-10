'use strict';
/**
 * routes/leaveTypes.js — Leave banks foundation (Phase 1.2a).
 *
 * Per-department leave/accrual BANKS: definitions + accrual-rule config
 * (leave_types), member balances (leave_balances, a derived cache), and the
 * append-only movement ledger (leave_accrual_ledger). Migration 0076.
 *
 *   GET    /api/leave-types              — list dept bank types (seeds the market
 *                                          table-stakes set on first read)
 *   POST   /api/leave-types              — chief: create a custom bank type
 *   PATCH  /api/leave-types/:id          — chief: edit a bank type / accrual rule
 *   DELETE /api/leave-types/:id          — chief: DEACTIVATE (never hard-delete)
 *   GET    /api/leave-types/balances     — balances (member=own; officer+=dept/any)
 *   GET    /api/leave-types/ledger       — ledger entries (member=own; officer+=dept/any)
 *   POST   /api/leave-types/ledger       — chief: audited grant / adjustment / reversal
 *
 * Doctrine (spec §6): the ledger is RECORD-grade (append-only; corrections are a
 * 'reversal' entry, never an edit — the DB physically REVOKEs UPDATE/DELETE on it).
 * leave_types is config, leave_balances a cache — both editable but never
 * hard-deleted by the app (deactivate / upsert). Tenancy is department_id from the
 * JWT; every query filters it explicitly AND RLS dept_isolation backstops it.
 */

const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireChief, roleLevel } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { currentBalance, postLeaveMovement, postPeriodMovement } = require('../utils/leaveLedger');
const { yearsOfService, selectAccrualRate, clampAccrual, carryoverExcess, projectBalance } = require('../utils/leaveAccrual');

// ── Market table-stakes bank set, seeded per department on first read ────────────
// Seeded with accrual_method='none' / rate 0 — a chief configures a dept's actual
// accrual rules; we don't presume them. Structural flags ARE set: COMP is the FLSA
// §7(o) comp bank (480-hour public-safety cap, no forfeiture); KELLY is tracked in
// shift units; FMLA defaults unpaid. All are per-dept editable afterward.
const DEFAULT_LEAVE_TYPES = [
  { code: 'VAC',         name: 'Vacation',        unit: 'hours'  },
  { code: 'SICK',        name: 'Sick',            unit: 'hours'  },
  { code: 'PERS',        name: 'Personal',        unit: 'hours'  },
  { code: 'HOL',         name: 'Holiday',         unit: 'hours'  },
  { code: 'COMP',        name: 'FLSA Comp Time',  unit: 'hours', is_flsa_comp: true, accrual_cap: 480 },
  { code: 'ONCALL',      name: 'On-Call',         unit: 'hours'  },
  { code: 'KELLY',       name: 'Kelly Day',       unit: 'shifts' },
  { code: 'BEREAVEMENT', name: 'Bereavement',     unit: 'hours'  },
  { code: 'MILITARY',    name: 'Military Leave',  unit: 'hours'  },
  { code: 'JURY',        name: 'Jury Duty',       unit: 'hours'  },
  { code: 'IOD',         name: 'Injury on Duty',  unit: 'hours'  },
  { code: 'FMLA',        name: 'FMLA',            unit: 'hours', is_paid: false },
];

async function ensureSeeded(deptId) {
  const existing = await pool.query(
    'SELECT 1 FROM leave_types WHERE department_id = $1 LIMIT 1', [deptId]);
  if (existing.rows.length) return;
  for (const t of DEFAULT_LEAVE_TYPES) {
    await pool.query(
      `INSERT INTO leave_types
         (department_id, code, name, unit, is_flsa_comp, accrual_cap, is_paid)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (department_id, code) DO NOTHING`,
      [deptId, t.code, t.name, t.unit || 'hours',
       t.is_flsa_comp === true, t.accrual_cap ?? null, t.is_paid !== false]);
  }
}

// Resolve which member the caller may see. Officers+ (level ≥ 2) may target any
// member in their dept via ?memberId (or omit it to see everyone); a plain member
// is forced to their own member row (?memberId is ignored). Returns:
//   { scope: 'all' }            — officer+, no memberId → whole dept
//   { scope: 'member', id }     — a specific member
//   { scope: 'none' }           — a member with no roster row → sees nothing
async function resolveMemberScope(user, deptId, requestedMemberId, forceSelf = false) {
  const isOfficerPlus = roleLevel(user.role) >= 2;
  if (isOfficerPlus && !forceSelf) {
    if (requestedMemberId == null) return { scope: 'all' };
    return { scope: 'member', id: requestedMemberId };
  }
  // Plain member: force own member_id (never trust a client-sent memberId).
  const r = await pool.query(
    'SELECT id FROM members WHERE user_id = $1 AND department_id = $2 LIMIT 1',
    [user.id, deptId]);
  if (!r.rows.length) return { scope: 'none' };
  return { scope: 'member', id: r.rows[0].id };
}

// ── Validation schemas ───────────────────────────────────────────────────────
const tenureTier = z.object({ years: z.number().int().min(0), rate: z.number() }).strict();
const bankShape = {
  name:           z.string().min(1).max(120),
  unit:           z.enum(['hours', 'shifts', 'days']).default('hours'),
  accrual_method: z.enum(['none', 'per_period', 'annual_grant', 'anniversary', 'per_hours_worked']).default('none'),
  accrual_rate:   z.number().min(0).default(0),
  period:         z.enum(['biweekly', 'monthly', 'annual']).nullable().default(null),
  carryover_cap:  z.number().min(0).nullable().default(null),
  accrual_cap:    z.number().min(0).nullable().default(null),
  allow_negative: z.boolean().default(false),
  negative_floor: z.number().max(0).default(0),   // a floor is <= 0 (how far negative a bank may go)
  tenure_tiers:   z.array(tenureTier).default([]),
  is_flsa_comp:   z.boolean().default(false),
  is_paid:        z.boolean().default(true),
  active:         z.boolean().default(true),
};
const createSchema = z.object({
  code: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/, 'code must be UPPER_SNAKE'),
  ...bankShape,
}).strict();
// PATCH: every field optional (code included, but immutable-in-practice — allowed for typo fixes).
const patchSchema = z.object({
  code: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/).optional(),
  name:           bankShape.name.optional(),
  unit:           z.enum(['hours', 'shifts', 'days']).optional(),
  accrual_method: z.enum(['none', 'per_period', 'annual_grant', 'anniversary', 'per_hours_worked']).optional(),
  accrual_rate:   z.number().min(0).optional(),
  period:         z.enum(['biweekly', 'monthly', 'annual']).nullable().optional(),
  carryover_cap:  z.number().min(0).nullable().optional(),
  accrual_cap:    z.number().min(0).nullable().optional(),
  allow_negative: z.boolean().optional(),
  negative_floor: z.number().max(0).optional(),
  tenure_tiers:   z.array(tenureTier).optional(),
  is_flsa_comp:   z.boolean().optional(),
  is_paid:        z.boolean().optional(),
  active:         z.boolean().optional(),
}).strict();
const idParam = { params: z.object({ id: z.string().regex(/^\d+$/) }) };
const memberQuery = { query: z.object({ memberId: z.coerce.number().int().positive().optional() }) };
// balances additionally accepts ?asOf=YYYY-MM-DD to project each bank forward (1.2 gate #4).
const balancesQuery = { query: z.object({
  memberId: z.coerce.number().int().positive().optional(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'asOf must be YYYY-MM-DD').optional(),
  self: z.coerce.boolean().optional(),   // force own-member resolution regardless of role (My Leave)
}) };
const ledgerPostSchema = z.object({
  memberId:    z.number().int().positive(),
  leaveTypeId: z.number().int().positive(),
  deltaHours:  z.number().gte(-1000000).lte(1000000).refine((n) => n !== 0, 'deltaHours must be non-zero'),
  reason:      z.enum(['grant', 'adjustment', 'reversal']),
  note:        z.string().max(500).optional(),
  rateAtPost:  z.number().min(0).optional(),
  sourceId:    z.number().int().positive().optional(),
}).strict();

// Columns a chief may set on create/patch (whitelist — never trust the body wholesale).
const SETTABLE = ['name', 'unit', 'accrual_method', 'accrual_rate', 'period',
  'carryover_cap', 'accrual_cap', 'allow_negative', 'negative_floor',
  'tenure_tiers', 'is_flsa_comp', 'is_paid', 'active'];

// ── Bank-type CRUD ────────────────────────────────────────────────────────────

router.get('/', scoped(async ({ user }) => {
  const deptId = user.department_id;
  await ensureSeeded(deptId);
  const { rows } = await pool.query(
    'SELECT * FROM leave_types WHERE department_id = $1 ORDER BY active DESC, code', [deptId]);
  return { data: rows };
}));

router.post('/', requireChief, validate({ body: createSchema }), scoped(async ({ req, user }) => {
  const deptId = user.department_id;
  const b = req.body;
  const dup = await pool.query(
    'SELECT 1 FROM leave_types WHERE department_id = $1 AND code = $2', [deptId, b.code]);
  if (dup.rows.length) throw httpError(409, `A bank type with code ${b.code} already exists.`, 'DUPLICATE_CODE');
  const { rows } = await pool.query(
    `INSERT INTO leave_types
       (department_id, code, name, unit, accrual_method, accrual_rate, period,
        carryover_cap, accrual_cap, allow_negative, negative_floor, tenure_tiers,
        is_flsa_comp, is_paid, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)
     RETURNING *`,
    [deptId, b.code, b.name, b.unit, b.accrual_method, b.accrual_rate, b.period,
     b.carryover_cap, b.accrual_cap, b.allow_negative, b.negative_floor,
     JSON.stringify(b.tenure_tiers), b.is_flsa_comp, b.is_paid, b.active]);
  return { _status: 201, data: rows[0] };
}));

router.patch('/:id', requireChief, validate({ ...idParam, body: patchSchema }), scoped(async ({ req, user }) => {
  const deptId = user.department_id;
  const id = Number(req.params.id);
  const sets = [];
  const vals = [];
  let i = 1;
  for (const col of SETTABLE) {
    if (req.body[col] === undefined) continue;
    if (col === 'tenure_tiers') { sets.push(`tenure_tiers = $${i}::jsonb`); vals.push(JSON.stringify(req.body[col])); }
    else { sets.push(`${col} = $${i}`); vals.push(req.body[col]); }
    i++;
  }
  if (req.body.code !== undefined) { sets.push(`code = $${i}`); vals.push(req.body.code); i++; }
  if (!sets.length) throw httpError(400, 'No updatable fields provided.', 'EMPTY_PATCH');
  sets.push('updated_at = NOW()');
  vals.push(id, deptId);
  const { rows } = await pool.query(
    `UPDATE leave_types SET ${sets.join(', ')} WHERE id = $${i} AND department_id = $${i + 1} RETURNING *`, vals);
  if (!rows.length) throw httpError(404, 'Bank type not found.', 'NOT_FOUND');
  return { data: rows[0] };
}));

// DELETE = deactivate (never hard-delete: a bank type carries ledger history, and
// of_app has no DELETE grant on this table). Idempotent.
router.delete('/:id', requireChief, validate(idParam), scoped(async ({ req, user }) => {
  const deptId = user.department_id;
  const { rows } = await pool.query(
    'UPDATE leave_types SET active = FALSE, updated_at = NOW() WHERE id = $1 AND department_id = $2 RETURNING id',
    [Number(req.params.id), deptId]);
  if (!rows.length) throw httpError(404, 'Bank type not found.', 'NOT_FOUND');
  return { ok: true, deactivated: rows[0].id };
}));

// ── Balances (derived cache) ──────────────────────────────────────────────────

router.get('/balances', validate(balancesQuery), scoped(async ({ req, user }) => {
  const deptId = user.department_id;
  const scope = await resolveMemberScope(user, deptId, req.query.memberId, req.query.self === true);
  if (scope.scope === 'none') return { data: [] };
  const params = [deptId];
  let where = 'b.department_id = $1';
  if (scope.scope === 'member') { params.push(scope.id); where += ` AND b.member_id = $2`; }
  // Enrich each posted balance with the member's request-derived picture — the market's
  // "two numbers" (1.2e). pending = submitted, not yet debited; scheduled = approved-future
  // (ALREADY debited at approval, 1.2b); used = approved past. IMPORTANT: OF debits at
  // approval, so posted_balance ALREADY excludes scheduled — so available_to_request =
  // posted − pending ONLY (subtracting scheduled again would double-count the same leave).
  // The accrual-rule columns (method/rate/period/cap/tenure_tiers) + member hire_date power
  // the ?asOf projection (#4) — the "future time-off adjustments" the market surfaces.
  const { rows } = await pool.query(
    `SELECT b.id, b.member_id, b.leave_type_id, b.balance_hours, b.updated_at,
            t.code, t.name, t.unit, t.is_flsa_comp, t.accrual_cap,
            t.accrual_method, t.accrual_rate, t.period, t.tenure_tiers,
            COALESCE(NULLIF(m.hire_date, ''), m.joined) AS hire_date,  -- hire_date is TEXT DEFAULT '' → NULLIF so the joined fallback actually fires
            COALESCE(r.pending_hours, 0)   AS pending_hours,
            COALESCE(r.scheduled_hours, 0) AS scheduled_hours,
            COALESCE(r.used_hours, 0)      AS used_hours
       FROM leave_balances b
       JOIN leave_types t ON t.id = b.leave_type_id
       LEFT JOIN members m ON m.id = b.member_id AND m.department_id = b.department_id
       LEFT JOIN (
         SELECT "memberId" AS member_id, leave_type_id,
                SUM(hours) FILTER (WHERE status = 'Pending') AS pending_hours,
                SUM(hours) FILTER (WHERE status = 'Approved' AND "endDate" >= to_char(CURRENT_DATE,'YYYY-MM-DD')) AS scheduled_hours,
                SUM(hours) FILTER (WHERE status = 'Approved' AND "endDate" <  to_char(CURRENT_DATE,'YYYY-MM-DD')) AS used_hours
           FROM leave_requests
          WHERE department_id = $1 AND leave_type_id IS NOT NULL AND hours IS NOT NULL
          GROUP BY "memberId", leave_type_id
       ) r ON r.member_id = b.member_id AND r.leave_type_id = b.leave_type_id
      WHERE ${where}
      ORDER BY b.member_id, t.code`, params);
  const asOf = req.query.asOf || null;                       // YYYY-MM-DD, already validated
  const today = new Date().toISOString().slice(0, 10);
  const data = rows.map((row) => {
    const out = {
      ...row,
      pending_hours: Number(row.pending_hours),
      scheduled_hours: Number(row.scheduled_hours),
      used_hours: Number(row.used_hours),
      available_to_request: Number(row.balance_hours) - Number(row.pending_hours),
    };
    if (asOf && asOf > today) {
      const proj = projectBalance(
        { accrual_method: row.accrual_method, accrual_rate: row.accrual_rate,
          period: row.period, accrual_cap: row.accrual_cap, tenure_tiers: row.tenure_tiers },
        { current: Number(row.balance_hours), hireDate: row.hire_date, from: today, to: asOf });
      out.projected_balance = proj.projected;
      out.projected_accrual = proj.estimatedAccrual;
      out.projected_events = proj.accrualEvents;
      out.projectable = proj.projectable;
      out.projected_as_of = asOf;
    }
    // Strip the projection-only config columns from the wire (kept internal).
    delete out.accrual_method; delete out.accrual_rate; delete out.period;
    delete out.tenure_tiers; delete out.hire_date;
    return out;
  });
  return { data };
}));

// ── Ledger (append-only movements) ────────────────────────────────────────────

router.get('/ledger', validate(memberQuery), scoped(async ({ req, user }) => {
  const deptId = user.department_id;
  const scope = await resolveMemberScope(user, deptId, req.query.memberId);
  if (scope.scope === 'none') return { data: [] };
  const params = [deptId];
  let where = 'department_id = $1';
  if (scope.scope === 'member') { params.push(scope.id); where += ` AND member_id = $2`; }
  const { rows } = await pool.query(
    `SELECT * FROM leave_accrual_ledger WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT 500`, params);
  return { data: rows };
}));

// Chief grant / adjustment / reversal. Posts an append-only ledger row, recomputes
// the balance cache from the ledger (= source of truth → parity by construction),
// and writes an audit_log row. Bounds are enforced for grant/adjustment (a decrement
// may not breach the bank's negative floor; an increment may not exceed its cap —
// e.g. the FLSA comp 480). A 'reversal' bypasses bounds (it restores).
router.post('/ledger', requireChief, validate({ body: ledgerPostSchema }), scoped(async ({ req, user }) => {
  const deptId = user.department_id;
  const { memberId, leaveTypeId, deltaHours, reason, note, rateAtPost, sourceId } = req.body;

  // Serialize concurrent posts to the SAME bank so the read-check-insert bounds guard
  // below can't be raced (TOCTOU: two grants each reading sum=470 and both passing the
  // 480-cap check → committed 510, over the FLSA §7(o) cap). Transaction-scoped — under
  // P5_TXN the request is one txn, so the lock releases on commit.
  await pool.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [deptId, `${memberId}:${leaveTypeId}`]);

  const t = await pool.query(
    'SELECT id, code, allow_negative, negative_floor, accrual_cap FROM leave_types WHERE id = $1 AND department_id = $2',
    [leaveTypeId, deptId]);
  if (!t.rows.length) throw httpError(404, 'Bank type not found for this department.', 'NOT_FOUND');
  const bank = t.rows[0];

  // Re-validate the target member belongs to THIS department — never trust a client-sent
  // id as an authorization input (member_id is a loose ref with no FK; a foreign/typo id
  // would otherwise attach a dept-A record to a dept-B person or an orphan balance).
  const m = await pool.query('SELECT 1 FROM members WHERE id = $1 AND department_id = $2', [memberId, deptId]);
  if (!m.rows.length) throw httpError(404, 'Member not found for this department.', 'MEMBER_NOT_FOUND');

  const current = await currentBalance(deptId, memberId, leaveTypeId);
  const next = current + deltaHours;

  if (reason !== 'reversal') {
    const floor = bank.allow_negative ? Number(bank.negative_floor) : 0;
    if (deltaHours < 0 && next < floor) {
      throw httpError(422,
        `This would drop the ${bank.code} balance to ${next}, below the allowed floor of ${floor}.`,
        'NEGATIVE_FLOOR', { current, delta: deltaHours, floor });
    }
    if (deltaHours > 0 && bank.accrual_cap != null && next > Number(bank.accrual_cap)) {
      throw httpError(422,
        `This would raise the ${bank.code} balance to ${next}, above the cap of ${bank.accrual_cap}.`,
        'ACCRUAL_CAP', { current, delta: deltaHours, cap: Number(bank.accrual_cap) });
    }
  }

  const { ledger, balanceHours } = await postLeaveMovement({
    deptId, memberId, leaveTypeId, deltaHours, reason, sourceKind: 'manual',
    sourceId: sourceId ?? null, rateAtPost: rateAtPost ?? null, note: note ?? null,
    createdByUserId: user.id ?? null,
  });

  await audit(deptId, user, 'create', 'leave_accrual_ledger', ledger.id,
    { reason, leaveTypeId, memberId, deltaHours, code: bank.code });

  return { _status: 201, data: { ledger, balance_hours: balanceHours } };
}));

// ── Accrual engine (1.2d) ─────────────────────────────────────────────────────
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const accrualRunSchema = z.object({
  periodKey:   z.string().min(1).max(40),      // the idempotency key (pay-period id / YYYY-MM)
  periodStart: isoDate.optional(),             // for the waiting-period eligibility (per_period)
  periodEnd:   isoDate,                         // tenure computed AS OF here
  leaveTypeId: z.number().int().positive().optional(), // limit to one bank; else all accruing banks
  dryRun:      z.boolean().optional(),         // preview only — compute, post nothing
  limit:       z.number().int().min(1).max(2000).optional(),  // chunk: process at most N members (resumable large-dept run)
  afterMemberId: z.number().int().positive().optional(),      // cursor: only members with id > this
}).strict();
const carryoverRunSchema = z.object({
  year:        z.number().int().min(2000).max(2100),
  leaveTypeId: z.number().int().positive().optional(),
  dryRun:      z.boolean().optional(),
}).strict();

// POST /api/leave-types/accrual-run — chief-triggered per-period accrual. Posts one 'accrual'
// entry per active accruing bank × active member, idempotent per (dept,type,member,periodKey).
// Tenure-tiered rate, cap-CLAMPED (never skips the whole accrual), waiting-period eligibility
// for mid-period hires. RESUMABLE for large departments: pass `limit` (+ the returned
// `nextCursor` as `afterMemberId`) to process members in chunks across several requests —
// the (dept,type,member,periodKey) unique index makes every chunk exactly-once and any replay
// a safe no-op, so a run can be resumed or retried without double-crediting. (A fully
// autonomous background runner would need a job queue / pg_cron, which isn't installed — that
// piece is infra-gated, not a framing deferral; see the spec §9 note.) NOTE: paid-hours
// proration + LWOP suspension + the per_hours_worked method still need the run-store — spec §9.
router.post('/accrual-run', requireChief, validate({ body: accrualRunSchema }), scoped(async ({ req, user }) => {
  const deptId = user.department_id;
  const { periodKey, periodStart, periodEnd, leaveTypeId } = req.body;
  const limit = req.body.limit || null;
  const afterMemberId = req.body.afterMemberId || 0;

  const banksRes = leaveTypeId
    ? await pool.query(`SELECT * FROM leave_types WHERE id = $1 AND department_id = $2 AND active`, [leaveTypeId, deptId])
    : await pool.query(
        `SELECT * FROM leave_types WHERE department_id = $1 AND active
           AND accrual_method IN ('per_period','annual_grant','anniversary')`, [deptId]);
  const banks = banksRes.rows.filter((b) => ['per_period', 'annual_grant', 'anniversary'].includes(b.accrual_method));
  // Cursor-paged, id-ordered, so chunks are stable and resumable.
  const memParams = [deptId];
  let memWhere = `department_id = $1 AND status = 'Active'`;
  if (afterMemberId) { memParams.push(afterMemberId); memWhere += ` AND id > $${memParams.length}`; }
  let memSql = `SELECT id, name, hire_date, joined FROM members WHERE ${memWhere} ORDER BY id ASC`;
  if (limit) { memParams.push(limit); memSql += ` LIMIT $${memParams.length}`; }
  const members = (await pool.query(memSql, memParams)).rows;
  // A full chunk means there may be more members after it — hand back the cursor to resume.
  const nextCursor = (limit && members.length === limit) ? members[members.length - 1].id : null;
  const dryRun = req.body.dryRun === true;

  // Compute one member×bank line: eligibility → tenure-tier rate → cap-clamped amount. Shared
  // by the preview and the real post so they can never disagree.
  async function plan(bank, m) {
    const hire = m.hire_date || m.joined || null;
    // Waiting-period eligibility: for per_period, only members employed the WHOLE period accrue.
    if (bank.accrual_method === 'per_period' && periodStart && hire && new Date(hire) > new Date(periodStart)) {
      return { skip: 'waiting_period' };
    }
    const years = yearsOfService(hire, periodEnd);
    const { rate, tier } = selectAccrualRate(bank.tenure_tiers, years, bank.accrual_rate);
    if (!(rate > 0)) return { skip: 'no_rate' };
    const current = await currentBalance(deptId, m.id, bank.id);
    const amount = clampAccrual(rate, current, bank.accrual_cap);
    if (amount <= 0) return { skip: 'at_cap', capClamped: bank.accrual_cap != null };
    return { rate, tier, current, amount, clamped: amount < rate };
  }

  // ── DRY RUN: compute the plan, flag rows already accrued for this period, post NOTHING ──
  if (dryRun) {
    const preview = [];
    let willCredit = 0, willSkip = 0, willClamp = 0, totalHours = 0;
    for (const bank of banks) {
      for (const m of members) {
        const p = await plan(bank, m);
        if (p.skip) { willSkip++; if (p.capClamped) willClamp++; continue; }
        const ex = await pool.query(
          'SELECT 1 FROM leave_accrual_ledger WHERE department_id=$1 AND leave_type_id=$2 AND member_id=$3 AND period_key=$4',
          [deptId, bank.id, m.id, periodKey]);
        const already = ex.rows.length > 0;
        preview.push({ member_id: m.id, member_name: m.name, leave_type_id: bank.id, code: bank.code,
          current: p.current, amount: p.amount, new_balance: already ? p.current : p.current + p.amount,
          already_accrued: already, clamped: p.clamped });
        if (already) willSkip++; else { willCredit++; totalHours += p.amount; if (p.clamped) willClamp++; }
      }
    }
    return { data: { dryRun: true, periodKey, banks: banks.length, members: members.length,
      willCredit, willSkip, willClamp, totalHours, nextCursor, preview } };
  }

  // ── REAL RUN. ONE dept-scoped run lock — serializes accrual runs against each other with a
  // single advisory lock, NOT one per member×bank (which would accumulate thousands of locks in
  // the request txn). The period_key unique index remains the exactly-once arbiter.
  await pool.query(`SELECT pg_advisory_xact_lock($1, hashtext('leave-accrual-run'))`, [deptId]);
  let credited = 0, skipped = 0, clamped = 0, totalHours = 0;
  for (const bank of banks) {
    for (const m of members) {
      const p = await plan(bank, m);
      if (p.skip) { skipped++; if (p.capClamped) clamped++; continue; }
      const res = await postPeriodMovement({
        deptId, memberId: m.id, leaveTypeId: bank.id, deltaHours: p.amount, reason: 'accrual',
        periodKey, rateAtPost: p.rate, createdByUserId: user.id,
        note: p.tier ? `tier ${p.tier.years}yr @ ${p.rate}` : `base @ ${p.rate}`,
      });
      if (res.posted) { credited++; totalHours += p.amount; if (p.clamped) clamped++; }
      else { skipped++; } // duplicate for this period = already accrued (idempotent success)
    }
  }
  await audit(deptId, user, 'accrual_run', 'leave_accrual_ledger', null,
    { periodKey, banks: banks.length, members: members.length, credited, skipped, clamped, totalHours, chunked: !!limit });
  return { data: { periodKey, banks: banks.length, members: members.length, credited, skipped, clamped, totalHours, nextCursor } };
}));

// POST /api/leave-types/carryover-run — chief-triggered YEAR-END forfeiture. A SEPARATE event
// from accrual: for each active bank with a carryover_cap, forfeit (balance − cap) as a NEGATIVE
// 'adjustment' entry (never a silent overwrite), idempotent per (dept,type,member,'CARRYOVER-YYYY').
// FLSA §7(o) COMP BANKS ARE EXEMPT — forfeiting comp time is illegal; is_flsa_comp banks are skipped.
router.post('/carryover-run', requireChief, validate({ body: carryoverRunSchema }), scoped(async ({ req, user }) => {
  const deptId = user.department_id;
  const { year, leaveTypeId } = req.body;
  const periodKey = `CARRYOVER-${year}`;

  const banksRes = leaveTypeId
    ? await pool.query(`SELECT * FROM leave_types WHERE id = $1 AND department_id = $2 AND active`, [leaveTypeId, deptId])
    : await pool.query(
        `SELECT * FROM leave_types WHERE department_id = $1 AND active AND carryover_cap IS NOT NULL`, [deptId]);
  const members = (await pool.query(
    `SELECT id, name FROM members WHERE department_id = $1 AND status = 'Active'`, [deptId])).rows;
  const dryRun = req.body.dryRun === true;

  // ── DRY RUN: compute the forfeitures, flag rows already forfeited, post NOTHING. Comp banks
  // are shown as exempt (never forfeited). ──
  if (dryRun) {
    const preview = [];
    let willForfeit = 0, totalForfeited = 0, exemptSkipped = 0, willSkip = 0;
    for (const bank of banksRes.rows) {
      if (bank.is_flsa_comp) { exemptSkipped++; continue; }
      if (bank.carryover_cap == null) { willSkip++; continue; }
      for (const m of members) {
        const current = await currentBalance(deptId, m.id, bank.id);
        const excess = carryoverExcess(current, bank.carryover_cap);
        if (excess <= 0) { willSkip++; continue; }
        const ex = await pool.query(
          'SELECT 1 FROM leave_accrual_ledger WHERE department_id=$1 AND leave_type_id=$2 AND member_id=$3 AND period_key=$4',
          [deptId, bank.id, m.id, periodKey]);
        const already = ex.rows.length > 0;
        preview.push({ member_id: m.id, member_name: m.name, leave_type_id: bank.id, code: bank.code,
          current, forfeit: excess, new_balance: already ? current : Number(bank.carryover_cap), already_forfeited: already });
        if (already) willSkip++; else { willForfeit++; totalForfeited += excess; }
      }
    }
    return { data: { dryRun: true, periodKey, willForfeit, totalForfeited, comp_banks_exempted: exemptSkipped, willSkip, preview } };
  }

  // ── REAL RUN. ONE dept-scoped run lock (see accrual-run note); period_key is the arbiter. ──
  await pool.query(`SELECT pg_advisory_xact_lock($1, hashtext('leave-carryover-run'))`, [deptId]);
  let forfeited = 0, totalForfeited = 0, exemptSkipped = 0, skipped = 0;
  for (const bank of banksRes.rows) {
    if (bank.is_flsa_comp) { exemptSkipped++; continue; }   // FLSA §7(o): comp cannot be forfeited
    if (bank.carryover_cap == null) { skipped++; continue; }
    for (const m of members) {
      const current = await currentBalance(deptId, m.id, bank.id);
      const excess = carryoverExcess(current, bank.carryover_cap);
      if (excess <= 0) { skipped++; continue; }
      const res = await postPeriodMovement({
        deptId, memberId: m.id, leaveTypeId: bank.id, deltaHours: -excess, reason: 'adjustment',
        periodKey, createdByUserId: user.id, note: `year-end carryover forfeiture (cap ${bank.carryover_cap})`,
      });
      if (res.posted) { forfeited++; totalForfeited += excess; } else { skipped++; }
    }
  }
  await audit(deptId, user, 'carryover_run', 'leave_accrual_ledger', null,
    { periodKey, forfeited, totalForfeited, exemptSkipped, skipped });
  return { data: { periodKey, forfeited, totalForfeited, comp_banks_exempted: exemptSkipped, skipped } };
}));

module.exports = router;
// Exposed for the 1.2a adversarial suite (leaveBanks.test.js).
module.exports.DEFAULT_LEAVE_TYPES = DEFAULT_LEAVE_TYPES;
