'use strict';
/**
 * utils/tradeLedger.js — the ONE write path to the append-only shift-trade PAYBACK ledger
 * (migration 0079, shift_trade_ledger). A payback is a record: every movement is an INSERT
 * (of_app is physically REVOKEd UPDATE/DELETE), corrections are a 'reversal' entry, never an
 * edit — the leave-ledger doctrine, applied to member↔member IOU shifts.
 *
 * The balance is DIRECTIONAL and hours-denominated, running member↔member (OPM firefighter
 * trading-time doctrine — not against the employer):
 *   pairNet(A, B) = (hours A owes B) − (hours B owes A)   [> 0 ⇒ A owes B]
 * An 'incurred' row (+delta, owed_by=R, owed_to=C) is written when a covered payback trade is
 * approved (R got the shift off, C worked it, R owes C). A 'settled' row (−delta, same roles)
 * closes it when R repays. A 'reversal' undoes an incurred that never should have stood (the
 * call-out case: C never worked the shift → R owes nothing).
 */

const { pool } = require('../db');

/**
 * Post an append-only payback movement. NON-idempotent (a new row every call) — callers make
 * incurred/reversal idempotent via outstandingForTrade (mirrors the leave path).
 * @returns {object} the inserted ledger row
 */
async function postTradeMovement({
  deptId, owedByMemberId, owedToMemberId, deltaHours, reason,
  sourceKind = 'trade', sourceId = null, shiftId = null, note = null, createdByUserId = null,
}) {
  const ins = await pool.query(
    `INSERT INTO shift_trade_ledger
       (department_id, owed_by_member_id, owed_to_member_id, delta_hours, reason,
        source_kind, source_id, shift_id, note, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [deptId, owedByMemberId, owedToMemberId, deltaHours, reason,
     sourceKind, sourceId, shiftId, note, createdByUserId]);
  return ins.rows[0];
}

/**
 * Net outstanding movement for ONE trade (its incurred is +, settle/reversal are −). This —
 * not the trade's status — decides whether an incurred/reversal should fire, so an incurred can
 * never double-post and a reversal restores EXACTLY what was incurred. > 0 ⇒ a payback stands.
 */
async function outstandingForTrade(deptId, sourceId) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(delta_hours), 0)::numeric AS s
       FROM shift_trade_ledger
      WHERE department_id = $1 AND source_kind = 'trade' AND source_id = $2`,
    [deptId, sourceId]);
  return Number(r.rows[0].s);
}

/** Directional net: hours `a` owes `b` minus hours `b` owes `a` (> 0 ⇒ a owes b). */
async function pairNet(deptId, memberA, memberB) {
  const r = await pool.query(
    `SELECT
       COALESCE(SUM(delta_hours) FILTER (WHERE owed_by_member_id = $2 AND owed_to_member_id = $3), 0)
     - COALESCE(SUM(delta_hours) FILTER (WHERE owed_by_member_id = $3 AND owed_to_member_id = $2), 0)
       AS net
       FROM shift_trade_ledger WHERE department_id = $1`,
    [deptId, memberA, memberB]);
  return Number(r.rows[0].net);
}

/**
 * Per-counterpart payback balances for one member. Returns rows { counterpart_id, net } where
 * net > 0 means THIS member owes the counterpart, net < 0 means the counterpart owes them.
 * Zero-net pairs are dropped (settled).
 */
async function balancesForMember(deptId, memberId) {
  const r = await pool.query(
    `WITH pairs AS (
       SELECT CASE WHEN owed_by_member_id = $2 THEN owed_to_member_id ELSE owed_by_member_id END AS counterpart,
              CASE WHEN owed_by_member_id = $2 THEN delta_hours ELSE -delta_hours END AS signed
         FROM shift_trade_ledger
        WHERE department_id = $1 AND (owed_by_member_id = $2 OR owed_to_member_id = $2)
     )
     SELECT counterpart AS counterpart_id, COALESCE(SUM(signed), 0)::numeric AS net
       FROM pairs GROUP BY counterpart HAVING COALESCE(SUM(signed), 0) <> 0`,
    [deptId, memberId]);
  return r.rows.map((x) => ({ counterpart_id: x.counterpart_id, net: Number(x.net) }));
}

module.exports = { postTradeMovement, outstandingForTrade, pairNet, balancesForMember };
