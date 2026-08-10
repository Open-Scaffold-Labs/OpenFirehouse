'use strict';
/**
 * utils/leaveLedger.js — the ONE write path to the append-only leave-bank ledger
 * (migration 0076). Both the chief manual ledger-post (routes/leaveTypes.js) and the
 * leave-approval usage/reversal (routes/leaveRequests.js) go through here, so a bank
 * movement is written in exactly one place — the "one door" discipline the append-only
 * record demands.
 *
 * Every movement is an INSERT (never an UPDATE/DELETE — of_app is physically REVOKEd
 * those), followed by a recompute of the balance cache from the ledger itself (the
 * source of truth), so leave_balances.balance_hours == SUM(delta_hours) by construction
 * and can never drift. Runs on the shared pool.query chokepoint (GUC-aware; on prod the
 * whole request is one txn under P5_TXN, so the INSERT + recompute commit atomically).
 */

const { pool } = require('../db');

/** Current balance for a bank = SUM(ledger). The ledger is the source of truth. */
async function currentBalance(deptId, memberId, leaveTypeId) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(delta_hours), 0)::numeric AS bal
       FROM leave_accrual_ledger
      WHERE department_id = $1 AND member_id = $2 AND leave_type_id = $3`,
    [deptId, memberId, leaveTypeId]);
  return Number(r.rows[0].bal);
}

// Recompute the balance cache for one bank from the ledger (source of truth) → parity by
// construction. Used by every write path so leave_balances can never drift from Σ ledger.
async function recomputeBalance(deptId, memberId, leaveTypeId) {
  const bal = await pool.query(
    `INSERT INTO leave_balances (department_id, member_id, leave_type_id, balance_hours, updated_at)
     VALUES ($1, $2, $3,
       (SELECT COALESCE(SUM(delta_hours), 0) FROM leave_accrual_ledger
          WHERE department_id = $1 AND member_id = $2 AND leave_type_id = $3), NOW())
     ON CONFLICT (department_id, member_id, leave_type_id)
     DO UPDATE SET balance_hours =
       (SELECT COALESCE(SUM(delta_hours), 0) FROM leave_accrual_ledger
          WHERE department_id = $1 AND member_id = $2 AND leave_type_id = $3),
       updated_at = NOW()
     RETURNING balance_hours`,
    [deptId, memberId, leaveTypeId]);
  return Number(bal.rows[0].balance_hours);
}

/**
 * Post an append-only bank movement (NON-idempotent — a new row every call) and recompute
 * the balance cache. Used for manual posts + leave usage/reversal.
 * @returns {{ ledger: object, balanceHours: number }}
 */
async function postLeaveMovement({
  deptId, memberId, leaveTypeId, deltaHours, reason,
  sourceKind = 'manual', sourceId = null, periodKey = null,
  rateAtPost = null, note = null, createdByUserId = null,
}) {
  const ins = await pool.query(
    `INSERT INTO leave_accrual_ledger
       (department_id, member_id, leave_type_id, delta_hours, reason, source_kind,
        source_id, period_key, rate_at_post, note, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [deptId, memberId, leaveTypeId, deltaHours, reason, sourceKind,
     sourceId, periodKey, rateAtPost, note, createdByUserId]);
  const balanceHours = await recomputeBalance(deptId, memberId, leaveTypeId);
  return { ledger: ins.rows[0], balanceHours };
}

/**
 * IDEMPOTENT period-keyed movement for the accrual engine (1.2d). The 0076 partial unique
 * index on (department_id, leave_type_id, member_id, period_key) is the arbiter: a re-run, a
 * double-click, or a concurrent second trigger of the SAME (member, bank, period) takes the
 * ON CONFLICT path and posts nothing. So re-running an already-COMPLETED run for a period is a
 * safe no-op. A `duplicate` (posted:false) is SUCCESS, not an error. Used for both accrual
 * credits (reason='accrual') and year-end carryover forfeitures (reason='adjustment').
 *
 * NOTE on resumability: under P5_TXN the whole run request is ONE transaction, so a run is
 * all-or-nothing per invocation (a mid-run failure rolls the whole sweep back, then a re-run
 * redoes it from scratch — the unique index keeps that safe). True resume-a-partial-run
 * (per-member commit) + chunking is a documented scale follow-up for very large departments.
 * @returns {{ posted:boolean, ledger?:object, balanceHours?:number }}
 */
async function postPeriodMovement({
  deptId, memberId, leaveTypeId, deltaHours, reason, periodKey,
  rateAtPost = null, note = null, createdByUserId = null,
}) {
  if (!periodKey) throw new Error('postPeriodMovement requires a periodKey (idempotency key)');
  const ins = await pool.query(
    `INSERT INTO leave_accrual_ledger
       (department_id, member_id, leave_type_id, delta_hours, reason, source_kind,
        period_key, rate_at_post, note, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,'accrual_run',$6,$7,$8,$9)
     ON CONFLICT (department_id, leave_type_id, member_id, period_key) WHERE period_key IS NOT NULL
     DO NOTHING
     RETURNING *`,
    [deptId, memberId, leaveTypeId, deltaHours, reason, periodKey,
     rateAtPost, note, createdByUserId]);
  if (!ins.rows.length) return { posted: false };
  const balanceHours = await recomputeBalance(deptId, memberId, leaveTypeId);
  return { posted: true, ledger: ins.rows[0], balanceHours };
}

/**
 * Net outstanding movement for ONE leave request (its usage debits are negative, its
 * reversals positive). 0 = nothing owed (never debited, or fully reversed); < 0 = a debit
 * stands. This — not the request's status string — is the source of truth for whether a
 * usage/reversal should fire, so a debit can never double-post and a reversal always
 * restores EXACTLY what was debited (regardless of later edits to the request's hours).
 */
async function outstandingForLeave(deptId, sourceId) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(delta_hours), 0)::numeric AS s
       FROM leave_accrual_ledger
      WHERE department_id = $1 AND source_kind = 'leave_request' AND source_id = $2`,
    [deptId, sourceId]);
  return Number(r.rows[0].s);
}

module.exports = { currentBalance, postLeaveMovement, postPeriodMovement, recomputeBalance, outstandingForLeave };
