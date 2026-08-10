'use strict';
/**
 * routes/shiftTrades.js — Shift trades with payback (Phase 1.3). Rebuilt to the market bar
 * (spec docs/PHASE1-TRADES-SPEC-2026-07-25.md): three trade types (give_away / swap / payback),
 * a two-stage configurable approval workflow (peer accept → officer sign-off, per-dept flag,
 * chief override), advisory-with-override guardrails, FLSA §207(p)(3) advisory tagging, an
 * append-only audit trail, an atomic single-winner claim on open shifts, and a payback ledger.
 *
 *   GET    /api/shift-trades                 — list (?status=)
 *   GET    /api/shift-trades/board           — open give-aways the caller may claim
 *   GET    /api/shift-trades/payback-balance — owed/earned per counterpart (?memberId= for officer+)
 *   GET    /api/shift-trades/impact/:id      — FLSA period-hours impact preview (advisory)
 *   POST   /api/shift-trades                 — request a trade (member self-service; ids dept-validated)
 *   POST   /api/shift-trades/:id/accept      — coverer accepts (voluntary; atomic single-winner claim)
 *   POST   /api/shift-trades/:id/approve     — officer/chief sign-off (self-approve blocked)
 *   POST   /api/shift-trades/:id/settle      — record a payback repayment (append-only ledger)
 *   POST   /api/shift-trades/:id/deny        — officer denies
 *   POST   /api/shift-trades/:id/withdraw    — requester withdraws own pending
 *   DELETE /api/shift-trades/:id             — officer removes
 *
 * Doctrine: legal/grievance record → every transition writes audit_log; the payback ledger is
 * append-only (corrections are a reversal entry). Guardrails are ADVISORY — a chief approves at
 * discretion (the OF staffing doctrine). Tenancy: department_id from the JWT; member ids are
 * re-validated to the dept (never trusted as authorization — the 1.2a lesson).
 */

const express = require('express');
const router  = express.Router();
const { pool, shifts: shiftDb } = require('../db');
const { requireOfficer, roleLevel } = require('../middleware/requireRole');
const { audit } = require('../utils/auditLog');
const { tourHours, memberOnShift } = require('../utils/leaveSchedule');
const { postTradeMovement, outstandingForTrade, pairNet, balancesForMember } = require('../utils/tradeLedger');
const { getStaffingConfig, analyzeCoverageImpact } = require('./leaveRequests');
const { addDaysISO, daysBetweenISO, isoDayOfWeek, coerceIsoDay } = require('../utils/localDate');

const ACTIVE_STATUSES = ['open', 'pending_accept', 'pending_approval', 'approved', 'denied', 'withdrawn', 'completed', 'cancelled'];

// ── small helpers ───────────────────────────────────────────────────────────
async function callerMember(req) {
  const r = await pool.query(
    'SELECT id, name FROM members WHERE user_id = $1 AND department_id = $2 LIMIT 1',
    [req.user.id, req.user.department_id]);
  return r.rows[0] || null;
}
async function memberInDept(deptId, memberId) {
  if (memberId == null) return null;
  const r = await pool.query('SELECT id, name FROM members WHERE id = $1 AND department_id = $2', [Number(memberId), deptId]);
  return r.rows[0] || null;
}
async function approvalRequired(deptId) {
  try {
    const r = await pool.query('SELECT trades_require_approval FROM departments WHERE id = $1', [deptId]);
    return r.rows.length ? r.rows[0].trades_require_approval !== false : true;   // fail-safe ON
  } catch (_) { return true; }
}
async function getTrade(deptId, id) {
  const r = await pool.query('SELECT * FROM shift_trades WHERE id = $1 AND department_id = $2', [Number(id), deptId]);
  return r.rows[0] || null;
}

// Move a member OFF a shift and (optionally) another ON, by member id — the 1.1b roster is
// memberIds-authoritative + crew derived on write. Legacy shift (no memberIds) → name edit, so a
// pre-consolidation shift's stored crew isn't wiped (the leaveRequests.processApproval guard).
async function rosterSwap(deptId, shiftId, outMember, inMember) {
  if (!shiftId) return;
  const shift = await shiftDb.findById(shiftId, deptId);
  if (!shift) return;
  const hadIds = Array.isArray(shift.memberIds) && shift.memberIds.length > 0;
  if (hadIds) {
    let ids = shift.memberIds.map(Number).filter((x) => x !== Number(outMember && outMember.id));
    if (inMember && inMember.id != null && !ids.includes(Number(inMember.id))) ids.push(Number(inMember.id));
    await shiftDb.update(shiftId, { memberIds: ids }, deptId);
  } else {
    const crew = Array.isArray(shift.crew) ? shift.crew : [];
    let next = crew.filter((n) => !(outMember && n === outMember.name));
    if (inMember && inMember.name && !next.includes(inMember.name)) next.push(inMember.name);
    await shiftDb.update(shiftId, { crew: next }, deptId);
  }
}

// Apply a trade to the roster on approval. give_away/payback: coverer takes the requester's
// original shift. swap: also the requester takes the coverer's swap_shift.
async function applyTradeRoster(deptId, trade, requester, coverer) {
  await rosterSwap(deptId, trade.original_shift_id, requester, coverer);
  if (trade.trade_type === 'swap' && trade.swap_shift_id) {
    await rosterSwap(deptId, trade.swap_shift_id, coverer, requester);
  }
}
// The exact inverse — used when an APPROVED trade is undone (delete), so the roster is restored
// and never left desynced from the trade's status.
async function unapplyTradeRoster(deptId, trade) {
  const requester = await memberInDept(deptId, trade.requesting_member_id);
  const coverer = await memberInDept(deptId, trade.covering_member_id);
  await rosterSwap(deptId, trade.original_shift_id, coverer, requester);   // put the requester back
  if (trade.trade_type === 'swap' && trade.swap_shift_id) {
    await rosterSwap(deptId, trade.swap_shift_id, requester, coverer);
  }
}
// The covered tour's length, ONLY if recognized — never a fabricated default (the leaveSchedule
// doctrine). A payback IOU must be a real number of hours, so null blocks the incur.
async function knownTourHours(deptId, shiftId) {
  const r = await pool.query('SELECT "shiftType" FROM shifts WHERE id = $1 AND department_id = $2', [shiftId, deptId]);
  if (!r.rows.length) return null;
  const th = tourHours({ shiftType: r.rows[0].shiftType });
  return th.needsReview ? null : th.hours;
}

// FLSA §207(p)(3) advisory impact: the covered hours drop off the SUBSTITUTE's (coverer's) OT;
// the requester is credited as if worked (29 CFR §553.31). Period math from utils/localDate
// (tz-safe). Hours from leaveSchedule.tourHours (never a name-string dupe).
const DEFAULT_TOUR_HOURS = 12;
async function computeFlsaImpact(deptId, trade) {
  // shifts has no start/end clock columns (those live on apparatus_assignments) — tour length
  // comes from the shiftType map via leaveSchedule.tourHours.
  const shiftRes = await pool.query('SELECT date, "shiftType" FROM shifts WHERE id = $1 AND department_id = $2',
    [trade.original_shift_id, deptId]).catch(() => ({ rows: [] }));
  const shift = shiftRes.rows[0];
  if (!shift) return null;
  const deptRes = await pool.query('SELECT flsa_work_period, flsa_ot_threshold, flsa_period_start FROM departments WHERE id = $1', [deptId]);
  let flsa = deptRes.rows[0] || {};
  if (!flsa.flsa_work_period && !flsa.flsa_ot_threshold) {
    const stRes = await pool.query('SELECT flsa_work_period, flsa_ot_threshold, flsa_period_start FROM stations WHERE department_id = $1 ORDER BY id LIMIT 1', [deptId]);
    flsa = stRes.rows[0] || flsa;
  }
  const periodDays = flsa.flsa_work_period || 7;
  const otThreshold = parseFloat(flsa.flsa_ot_threshold) || 40;
  const tradeDay = coerceIsoDay(shift.date);
  if (!tradeDay) return null;
  let startStr;
  const anchorDay = coerceIsoDay(flsa.flsa_period_start);
  if (anchorDay) {
    const periodsElapsed = Math.floor(daysBetweenISO(anchorDay, tradeDay) / periodDays);
    startStr = addDaysISO(anchorDay, periodsElapsed * periodDays);
  } else {
    startStr = addDaysISO(tradeDay, -isoDayOfWeek(tradeDay));
  }
  const endStr = addDaysISO(startStr, periodDays - 1);
  const shiftHours = tourHours({ shiftType: shift.shiftType, start_time: shift.start_time, end_time: shift.end_time }).hours || DEFAULT_TOUR_HOURS;

  const allShifts = await shiftDb.all(deptId);
  function periodHours(memberId, memberName) {
    let h = 0;
    for (const s of allShifts) {
      if (s.date >= startStr && s.date <= endStr && memberOnShift(s, memberId, memberName)) {
        h += tourHours({ shiftType: s.shiftType, start_time: s.start_time, end_time: s.end_time }).hours || DEFAULT_TOUR_HOURS;
      }
    }
    return h;
  }
  const reqM = await memberInDept(deptId, trade.requesting_member_id);
  const covM = await memberInDept(deptId, trade.covering_member_id);
  const requesterHours = reqM ? periodHours(reqM.id, reqM.name) : 0;
  const covererHours = covM ? periodHours(covM.id, covM.name) : 0;
  return {
    shiftHours, periodStart: startStr, periodEnd: endStr, otThreshold,
    // §207(p)(3): substitute (coverer) traded hours are EXCLUDED from the coverer's OT; the
    // requester is credited as if worked → requester OT is unchanged by the trade.
    requester: { currentHours: requesterHours, creditedHours: requesterHours,
      otBefore: Math.max(0, requesterHours - otThreshold), otAfter: Math.max(0, requesterHours - otThreshold) },
    coverer: { currentHours: covererHours, workedHours: covererHours + shiftHours,
      otBefore: Math.max(0, covererHours - otThreshold),
      // Advisory: with the §207(p)(3) exclusion applied, the substitute's traded hours do NOT count toward OT.
      otAfterExcluded: Math.max(0, covererHours - otThreshold),
      otAfterIfCounted: Math.max(0, covererHours + shiftHours - otThreshold) },
    otImpactHours: shiftHours,
  };
}

// Advisory min-staffing impact of removing the requester from the covered shift.
async function staffingImpact(deptId, trade) {
  try {
    const s = await pool.query('SELECT date FROM shifts WHERE id = $1 AND department_id = $2', [trade.original_shift_id, deptId]);
    if (!s.rows.length) return null;
    const reqM = await memberInDept(deptId, trade.requesting_member_id);
    if (!reqM) return null;
    const { minCrew } = await getStaffingConfig(deptId);
    // Removing the requester (the coverer replaces them, so net staffing is usually neutral) — we
    // flag only if the covered shift would fall below minimum with the requester gone.
    return await analyzeCoverageImpact(deptId, reqM.name, s.rows[0].date, s.rows[0].date, minCrew, reqM.id);
  } catch (_) { return null; }
}

// ── list / board / balances ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const { status } = req.query;
    let q = `SELECT st.*, rm.name AS requester_name, rm.rank AS requester_rank,
                    cm.name AS coverer_name, cm.rank AS coverer_rank,
                    s.date AS shift_date, s."shiftType" AS shift_type
             FROM shift_trades st
             JOIN members rm ON st.requesting_member_id = rm.id
             LEFT JOIN members cm ON st.covering_member_id = cm.id
             LEFT JOIN shifts s ON st.original_shift_id = s.id
             WHERE st.department_id = $1`;
    const params = [deptId];
    if (status) { q += ` AND st.status = $${params.length + 1}`; params.push(status); }
    q += ' ORDER BY st.created_at DESC';
    const r = await pool.query(q, params);
    res.json({ data: r.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to load shift trades' }); }
});

// Open give-aways the caller is eligible to claim: status 'open', not their own, and they are
// not already on that shift. (Cert/rank equivalence is surfaced advisory at accept time.)
router.get('/board', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const me = await callerMember(req);
    const r = await pool.query(
      `SELECT st.*, rm.name AS requester_name, s.date AS shift_date, s."shiftType" AS shift_type
         FROM shift_trades st
         JOIN members rm ON st.requesting_member_id = rm.id
         LEFT JOIN shifts s ON st.original_shift_id = s.id
        WHERE st.department_id = $1 AND st.status = 'open'
        ORDER BY s.date`, [deptId]);
    const rows = me ? r.rows.filter((t) => Number(t.requesting_member_id) !== Number(me.id)) : r.rows;
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to load trade board' }); }
});

// Payback balances per counterpart. Member sees own; officer+ may pass ?memberId.
router.get('/payback-balance', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    let memberId;
    if (roleLevel(req.user.role) >= 2 && req.query.memberId) {
      const m = await memberInDept(deptId, req.query.memberId);
      if (!m) return res.status(400).json({ error: 'memberId is not a member of this department', code: 'INVALID_MEMBER' });
      memberId = m.id;
    } else {
      const me = await callerMember(req);
      if (!me) return res.json({ data: { memberId: null, balances: [] } });
      memberId = me.id;
    }
    const balances = await balancesForMember(deptId, memberId);
    // Enrich with counterpart names.
    const ids = balances.map((b) => b.counterpart_id);
    let names = {};
    if (ids.length) {
      const nr = await pool.query('SELECT id, name FROM members WHERE department_id = $1 AND id = ANY($2)', [deptId, ids]);
      names = Object.fromEntries(nr.rows.map((m) => [m.id, m.name]));
    }
    res.json({ data: { memberId, balances: balances.map((b) => ({ ...b, counterpart_name: names[b.counterpart_id] || null })) } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to load payback balance' }); }
});

router.get('/impact/:id', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const trade = await getTrade(deptId, req.params.id);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    const flsa = await computeFlsaImpact(deptId, trade);
    res.json({ data: { trade, flsa } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to calculate trade impact' }); }
});

// ── request ──────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const d = req.body || {};
    const tradeType = ['give_away', 'swap', 'payback'].includes(d.trade_type) ? d.trade_type : 'give_away';

    // Member self-service: a plain member (below officer) files only their OWN trade — resolve
    // the requester from the JWT, never a client id. Officer+ may file for any dept member.
    let requesterId = d.requesting_member_id != null ? Number(d.requesting_member_id) : null;
    if (roleLevel(req.user.role) < 2) {
      const me = await callerMember(req);
      if (!me) return res.status(403).json({ error: 'No member record for your account.', code: 'NO_MEMBER' });
      if (requesterId != null && requesterId !== me.id) {
        return res.status(403).json({ error: 'You can only request a trade for yourself.', code: 'SELF_ONLY' });
      }
      requesterId = me.id;
    }
    const requester = await memberInDept(deptId, requesterId);
    if (!requester) return res.status(400).json({ error: 'requesting_member_id is not a member of this department', code: 'INVALID_MEMBER' });

    // Coverer optional (a give-away with none is an OPEN board post). If named, validate in dept.
    let coverer = null;
    if (d.covering_member_id != null && d.covering_member_id !== '') {
      coverer = await memberInDept(deptId, d.covering_member_id);
      if (!coverer) return res.status(400).json({ error: 'covering_member_id is not a member of this department', code: 'INVALID_COVERER' });
      if (coverer.id === requester.id) return res.status(400).json({ error: 'A member cannot cover their own trade.', code: 'SELF_COVER' });
    }
    if (!d.original_shift_id) return res.status(400).json({ error: 'original_shift_id is required', code: 'MISSING_SHIFT' });
    // Validate the shift is in this dept + default trade_date to its date (trade_date is NOT NULL).
    const shiftRow = await pool.query('SELECT id, date FROM shifts WHERE id = $1 AND department_id = $2', [Number(d.original_shift_id), deptId]);
    if (!shiftRow.rows.length) return res.status(400).json({ error: 'original_shift_id is not a shift in this department', code: 'INVALID_SHIFT' });
    const tradeDate = d.trade_date || coerceIsoDay(shiftRow.rows[0].date) || String(shiftRow.rows[0].date).slice(0, 10);

    // Status is server-forced (never caller-writable): a named coverer → pending_accept; an
    // unassigned give-away → open (the board). A swap must name the counterpart + their shift.
    let status;
    if (tradeType === 'swap') {
      if (!coverer || !d.swap_shift_id) return res.status(400).json({ error: 'A swap requires a covering member and their shift (swap_shift_id).', code: 'SWAP_INCOMPLETE' });
      // Validate the swap counterpart shift to the dept too — else a swap half-applies on approval
      // (coverer moved off the original, requester never added to a foreign/missing swap shift).
      const swRow = await pool.query('SELECT id FROM shifts WHERE id = $1 AND department_id = $2', [Number(d.swap_shift_id), deptId]);
      if (!swRow.rows.length) return res.status(400).json({ error: 'swap_shift_id is not a shift in this department', code: 'INVALID_SWAP_SHIFT' });
      status = 'pending_accept';
    } else {
      status = coverer ? 'pending_accept' : 'open';
    }

    const r = await pool.query(
      `INSERT INTO shift_trades
         (department_id, requesting_member_id, covering_member_id, original_shift_id, swap_shift_id,
          payback_shift_id, trade_date, payback_date, trade_type, status, reason, notes, client_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (department_id, client_key) WHERE client_key IS NOT NULL DO NOTHING
       RETURNING *`,
      [deptId, requester.id, coverer ? coverer.id : null, Number(d.original_shift_id),
       d.swap_shift_id ? Number(d.swap_shift_id) : null, d.payback_shift_id ? Number(d.payback_shift_id) : null,
       tradeDate, d.payback_date || null, tradeType, status, d.reason || null, d.notes || '',
       d.client_key || null]);
    if (!r.rows.length) {  // idempotent replay of the same client_key
      const existing = await pool.query('SELECT * FROM shift_trades WHERE department_id = $1 AND client_key = $2', [deptId, d.client_key]);
      return res.status(200).json({ data: existing.rows[0] || null, duplicate: true });
    }
    const trade = r.rows[0];
    await audit(deptId, req.user, 'create', 'shift_trades', trade.id,
      { trade_type: tradeType, status, requester: requester.id, coverer: coverer ? coverer.id : null });
    res.status(201).json({ data: trade });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create trade' }); }
});

// ── accept (coverer, voluntary; atomic single-winner claim) ───────────────────
router.post('/:id/accept', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const me = await callerMember(req);
    if (!me) return res.status(403).json({ error: 'No member record for your account.', code: 'NO_MEMBER' });
    const trade = await getTrade(deptId, req.params.id);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (Number(trade.requesting_member_id) === Number(me.id)) {
      return res.status(400).json({ error: 'You cannot accept your own trade.', code: 'SELF_ACCEPT' });
    }
    const requireApproval = await approvalRequired(deptId);
    // The claim ALWAYS lands on pending_approval — the atomic single-winner gate. If the dept
    // doesn't require officer approval we immediately finalizeApproval() (which atomically flips
    // pending_approval→approved), so acceptance and approval share ONE transition gate.
    const CLAIM = 'pending_approval';

    // ATOMIC single-winner claim. Open board: only if still unclaimed. Directed: only if the
    // caller is the named coverer. A losing racer / wrong caller gets 0 rows → clean 409.
    let upd;
    if (trade.status === 'open') {
      upd = await pool.query(
        `UPDATE shift_trades SET covering_member_id = $1, accepted_by_member_id = $1, accepted_at = NOW(), status = $2
         WHERE id = $3 AND department_id = $4 AND status = 'open' AND covering_member_id IS NULL
         RETURNING *`, [me.id, CLAIM, trade.id, deptId]);
    } else if (trade.status === 'pending_accept') {
      upd = await pool.query(
        `UPDATE shift_trades SET accepted_by_member_id = $1, accepted_at = NOW(), status = $2
         WHERE id = $3 AND department_id = $4 AND status = 'pending_accept' AND covering_member_id = $1
         RETURNING *`, [me.id, CLAIM, trade.id, deptId]);
    } else {
      return res.status(409).json({ error: `This trade is ${trade.status} and can no longer be accepted.`, code: 'NOT_ACCEPTABLE' });
    }
    if (!upd.rows.length) {
      return res.status(409).json({ error: 'This shift was already claimed or is not yours to accept.', code: 'ALREADY_CLAIMED' });
    }
    const accepted = upd.rows[0];
    await audit(deptId, req.user, 'update', 'shift_trades', accepted.id, { action: 'accept', by: me.id, status: CLAIM });

    // If the dept does not require officer approval, acceptance finalizes: apply roster + ledger.
    if (!requireApproval) {
      const finalized = await finalizeApproval(deptId, accepted, req.user);
      if (finalized && finalized.blocked === 'UNKNOWN_TOUR_HOURS') {
        return res.status(422).json({ error: 'The covered shift has no recognized tour length; set its shift type before this payback can be finalized.', code: 'UNKNOWN_TOUR_HOURS', data: accepted });
      }
      if (finalized && finalized.trade) {
        return res.json({ data: finalized.trade, autoApproved: true, impact: finalized.impact });
      }
    }
    res.json({ data: accepted, autoApproved: false });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to accept trade' }); }
});

// Shared finalizer: roster change + payback 'incurred' + FLSA tag. Used by approve and by
// auto-approve-on-accept. The status transition IS the atomic idempotency gate — only the request
// that flips pending_approval→approved proceeds, so roster + ledger apply EXACTLY once even under
// two concurrent approves. Returns { trade, impact } on success, null if another request already
// finalized, or { blocked: 'CODE' } if a precondition failed (nothing changed).
async function finalizeApproval(deptId, trade, user) {
  // A payback IOU must be real hours — never fabricate (leaveSchedule doctrine). Check BEFORE the
  // transition so a blocked payback leaves the trade untouched (still pending_approval).
  if (trade.trade_type === 'payback') {
    const h = await knownTourHours(deptId, trade.original_shift_id);
    if (h == null) return { blocked: 'UNKNOWN_TOUR_HOURS' };
  }
  // Win the transition atomically (the single gate). 0 rows ⇒ someone else already finalized.
  const claim = await pool.query(
    `UPDATE shift_trades SET status = 'approved', approved_at = NOW(), approved_by = $1, approved_by_user_id = $2
     WHERE id = $3 AND department_id = $4 AND status = 'pending_approval' RETURNING *`,
    [user && user.name ? user.name : (user && user.username) || null, user && user.id ? user.id : null, trade.id, deptId]);
  if (!claim.rows.length) return null;
  const won = claim.rows[0];

  const requester = await memberInDept(deptId, won.requesting_member_id);
  const coverer = await memberInDept(deptId, won.covering_member_id);
  await applyTradeRoster(deptId, won, requester, coverer);

  const flsa = await computeFlsaImpact(deptId, won).catch(() => null);
  const otImpact = flsa ? flsa.otImpactHours : null;

  // Payback ledger: the requester owes the coverer the covered hours. Idempotent against the
  // ledger (outstandingForTrade) as a second guard behind the atomic status win.
  if (won.trade_type === 'payback' && requester && coverer) {
    const outstanding = await outstandingForTrade(deptId, won.id);
    if (outstanding <= 0) {
      const hrs = await knownTourHours(deptId, won.original_shift_id);   // known (pre-checked above)
      const led = await postTradeMovement({
        deptId, owedByMemberId: requester.id, owedToMemberId: coverer.id, deltaHours: Math.abs(hrs),
        reason: 'incurred', sourceId: won.id, shiftId: won.original_shift_id,
        note: `payback incurred: ${requester.name} owes ${coverer.name}`, createdByUserId: user && user.id,
      });
      await audit(deptId, user, 'create', 'shift_trade_ledger', led.id,
        { reason: 'incurred', trade: won.id, owed_by: requester.id, owed_to: coverer.id, hours: Math.abs(hrs) });
    }
  }
  await pool.query(
    `UPDATE shift_trades SET ot_impact_hours = $1, flsa_period_hours_requester = $2, flsa_period_hours_coverer = $3
     WHERE id = $4 AND department_id = $5`,
    [otImpact, flsa ? flsa.requester.currentHours : null, flsa ? flsa.coverer.currentHours : null, won.id, deptId]);
  return { trade: { ...won, ot_impact_hours: otImpact }, impact: { flsa } };
}

// ── approve (officer/chief; self-approve blocked) ─────────────────────────────
router.post('/:id/approve', requireOfficer, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const trade = await getTrade(deptId, req.params.id);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.status !== 'pending_approval') {
      return res.status(409).json({ error: `Only an accepted trade (pending_approval) can be approved; this is ${trade.status}.`, code: 'NOT_APPROVABLE' });
    }
    // Self-approve guard: the approver may not be the requester or the coverer (String-coerced,
    // the canonical ownership check). Resolve the approver's member row from the JWT.
    const me = await callerMember(req);
    if (me && (String(me.id) === String(trade.requesting_member_id) || String(me.id) === String(trade.covering_member_id))) {
      return res.status(403).json({ error: 'You cannot approve a trade you are part of.', code: 'SELF_APPROVE' });
    }
    const finalized = await finalizeApproval(deptId, trade, req.user);
    if (finalized && finalized.blocked === 'UNKNOWN_TOUR_HOURS') {
      return res.status(422).json({ error: 'The covered shift has no recognized tour length; set its shift type before approving a payback.', code: 'UNKNOWN_TOUR_HOURS' });
    }
    if (!finalized || !finalized.trade) {   // another request already finalized (race lost)
      return res.status(409).json({ error: 'This trade was already finalized.', code: 'ALREADY_FINALIZED' });
    }
    await audit(deptId, req.user, 'approve', 'shift_trades', trade.id,
      { from: 'pending_approval', to: 'approved', ot_impact_hours: finalized.trade.ot_impact_hours });
    res.json({ data: finalized.trade, impact: finalized.impact });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to approve trade' }); }
});

// ── settle a payback (append-only credit toward the owed balance) ─────────────
router.post('/:id/settle', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const trade = await getTrade(deptId, req.params.id);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.trade_type !== 'payback') return res.status(400).json({ error: 'Only a payback trade can be settled.', code: 'NOT_PAYBACK' });
    // The owing member (requester) or an officer may settle. Members settle only their own debt.
    const me = await callerMember(req);
    const isOfficer = roleLevel(req.user.role) >= 2;
    if (!isOfficer && !(me && Number(me.id) === Number(trade.requesting_member_id))) {
      return res.status(403).json({ error: 'Only the member who owes the payback (or an officer) may settle it.', code: 'NOT_YOURS' });
    }
    const outstanding = await outstandingForTrade(deptId, trade.id);
    if (outstanding <= 0) return res.status(409).json({ error: 'This payback has nothing outstanding to settle.', code: 'NOTHING_OWED' });
    const hrs = req.body && req.body.hours != null ? Math.abs(Number(req.body.hours)) : outstanding;
    if (!(hrs > 0)) return res.status(400).json({ error: 'hours must be positive', code: 'INVALID_HOURS' });
    const settleHrs = Math.min(hrs, outstanding);   // never over-settle past the balance
    const led = await postTradeMovement({
      deptId, owedByMemberId: trade.requesting_member_id, owedToMemberId: trade.covering_member_id,
      deltaHours: -settleHrs, reason: 'settled', sourceId: trade.id,
      shiftId: req.body && req.body.shift_id ? Number(req.body.shift_id) : null,
      note: req.body && req.body.note ? String(req.body.note).slice(0, 300) : 'payback settled', createdByUserId: req.user.id,
    });
    await audit(deptId, req.user, 'update', 'shift_trade_ledger', led.id, { reason: 'settled', trade: trade.id, hours: settleHrs });
    const remaining = await outstandingForTrade(deptId, trade.id);
    if (remaining <= 0) {
      await pool.query(`UPDATE shift_trades SET status = 'completed' WHERE id = $1 AND department_id = $2`, [trade.id, deptId]);
    }
    res.json({ data: { settled: settleHrs, remaining } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to settle payback' }); }
});

// ── deny (officer) / withdraw (requester's own pending) ───────────────────────
async function reverseIfIncurred(deptId, trade, user) {
  const outstanding = await outstandingForTrade(deptId, trade.id);
  if (outstanding > 0) {   // an incurred payback stands → reverse EXACTLY it (append-only)
    const led = await postTradeMovement({
      deptId, owedByMemberId: trade.requesting_member_id, owedToMemberId: trade.covering_member_id,
      deltaHours: -outstanding, reason: 'reversal', sourceId: trade.id,
      note: 'payback reversed (trade undone)', createdByUserId: user && user.id });
    await audit(deptId, user, 'update', 'shift_trade_ledger', led.id, { reason: 'reversal', trade: trade.id, hours: outstanding });
  }
}
router.post('/:id/deny', requireOfficer, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const trade = await getTrade(deptId, req.params.id);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    // An APPROVED trade has already changed the roster — deny can't cleanly undo that, so it is
    // NOT deniable (use Remove/delete, which restores the roster, or file a reversing trade).
    if (['approved', 'completed', 'cancelled', 'denied', 'withdrawn'].includes(trade.status)) {
      return res.status(409).json({ error: `A ${trade.status} trade can't be denied. Remove it instead to restore the roster.`, code: 'NOT_DENIABLE' });
    }
    await reverseIfIncurred(deptId, trade, req.user);   // defensive — a pre-approval trade has none
    const r = await pool.query(
      `UPDATE shift_trades SET status = 'denied', reason = COALESCE($1, reason)       WHERE id = $2 AND department_id = $3 RETURNING *`,
      [req.body && req.body.reason ? String(req.body.reason).slice(0, 500) : null, trade.id, deptId]);
    await audit(deptId, req.user, 'reject', 'shift_trades', trade.id, { to: 'denied', reason: req.body && req.body.reason });
    res.json({ data: r.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to deny trade' }); }
});
router.post('/:id/withdraw', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const trade = await getTrade(deptId, req.params.id);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    const me = await callerMember(req);
    const isOfficer = roleLevel(req.user.role) >= 2;
    // Only the requester (String-coerced) or an officer may withdraw, and only while still pending.
    if (!isOfficer && !(me && String(me.id) === String(trade.requesting_member_id))) {
      return res.status(403).json({ error: 'You can only withdraw your own trade.', code: 'NOT_YOURS' });
    }
    if (!['open', 'pending_accept', 'pending_approval'].includes(trade.status)) {
      return res.status(409).json({ error: `A ${trade.status} trade can't be withdrawn.`, code: 'NOT_WITHDRAWABLE' });
    }
    await reverseIfIncurred(deptId, trade, req.user);   // defensive (a pending trade shouldn't have incurred)
    const r = await pool.query(
      `UPDATE shift_trades SET status = 'withdrawn' WHERE id = $1 AND department_id = $2 RETURNING *`,
      [trade.id, deptId]);
    await audit(deptId, req.user, 'update', 'shift_trades', trade.id, { action: 'withdraw', to: 'withdrawn' });
    res.json({ data: r.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to withdraw trade' }); }
});

router.delete('/:id', requireOfficer, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const trade = await getTrade(deptId, req.params.id);
    if (trade) {
      // An approved trade already moved the roster — restore it BEFORE removing, so the shift is
      // never left covered by a member whose trade no longer exists; then reverse any payback IOU.
      if (trade.status === 'approved') await unapplyTradeRoster(deptId, trade);
      await reverseIfIncurred(deptId, trade, req.user);
    }
    await pool.query('DELETE FROM shift_trades WHERE id = $1 AND department_id = $2', [Number(req.params.id), deptId]);
    if (trade) await audit(deptId, req.user, 'delete', 'shift_trades', trade.id, { action: 'delete', restoredRoster: trade.status === 'approved' });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete trade' }); }
});

module.exports = router;
module.exports.computeFlsaImpact = computeFlsaImpact;
