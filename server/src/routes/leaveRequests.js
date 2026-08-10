'use strict';
/**
 * routes/leaveRequests.js — Leave request management with workflow automation
 *
 * GET    /api/leave                    — list all leave requests
 * GET    /api/leave/member/:memberId   — get all leave for a specific member
 * GET    /api/leave/coverage-gaps      — get shifts needing coverage
 * POST   /api/leave/impact             — analyze coverage impact of a proposed leave
 * GET    /api/leave/:id                — get one request
 * POST   /api/leave                    — create a leave request (+ auto impact analysis)
 * PATCH  /api/leave/:id                — update a request (triggers workflow on approval)
 * DELETE /api/leave/:id                — delete a request
 */

const express = require('express');
const router  = express.Router();
const { requireOfficer, roleLevel } = require('../middleware/requireRole');
const { leaveRequests: db, shifts: shiftDb, shiftSwaps: swapDb, pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { currentBalance, postLeaveMovement, outstandingForLeave } = require('../utils/leaveLedger');
const { tourHours, memberOnShift, crewCountAfterRemoval, removeMemberFromShift } = require('../utils/leaveSchedule');
const { mintVacancy, getVacancyConfig } = require('../utils/vacancyEngine');

// ── Bank tie-in (1.2b) ────────────────────────────────────────────────────────
// A leave request draws from a bank only when it carries BOTH a leave_type_id and a
// positive hours figure. Legacy / unspecified requests (either NULL) skip the ledger
// entirely — the approval path is unchanged for them (no fabricated movement).
function leaveBankRef(leave) {
  const typeId = leave && leave.leave_type_id != null ? Number(leave.leave_type_id) : null;
  const hrs = leave && leave.hours != null ? Number(leave.hours) : null;
  if (!typeId || !hrs || !(hrs > 0)) return null;
  return { typeId, hours: hrs };
}

// Pre-approval balance guard. Respects the bank's own allow_negative / negative_floor
// (1.2a). Returns { ok, skipped?, code?, current?, projected?, floor?, code_label? }.
// Never blocks a legacy request or one whose bank is missing/inactive (skip → audit-only).
async function checkLeaveBankBalance(deptId, leave) {
  const ref = leaveBankRef(leave);
  if (!ref) return { ok: true, skipped: true };
  const b = await pool.query(
    'SELECT code, allow_negative, negative_floor, active FROM leave_types WHERE id = $1 AND department_id = $2',
    [ref.typeId, deptId]);
  if (!b.rows.length) return { ok: true, skipped: true, bankMissing: true };
  const bank = b.rows[0];
  const current = await currentBalance(deptId, leave.memberId, ref.typeId);
  const projected = current - ref.hours;
  const floor = bank.allow_negative ? Number(bank.negative_floor) : 0;
  if (projected < floor) {
    return { ok: false, code: 'INSUFFICIENT_BALANCE', bankCode: bank.code, current, projected, floor, hours: ref.hours };
  }
  return { ok: true, current, projected, bankCode: bank.code, hours: ref.hours };
}

// Post a usage debit (−hours) or a reversal credit for a leave against its bank, then
// audit-link it. IDEMPOTENT against the ledger (not the request's status), so it is safe
// under concurrency and status churn:
//   * usage    → only if nothing is currently outstanding for this leave (outstanding >= 0);
//                debits −hours. A second concurrent approve (holding the same advisory lock)
//                sees outstanding < 0 and no-ops → never double-debits.
//   * reversal → only if a debit stands (outstanding < 0); restores EXACTLY −outstanding
//                (the net actually debited), so a later edit to the request's hours/bank
//                cannot make the reversal drift, and a second delete/cancel no-ops.
// Callers MUST hold the (dept, member, bank) advisory lock (bankLockKey) around this.
// Returns null when there is no bank ref or nothing to do.
async function applyLeaveBankMovement(deptId, leave, reason, user) {
  const ref = leaveBankRef(leave);
  if (!ref) return null;
  const outstanding = await outstandingForLeave(deptId, leave.id);
  let delta;
  if (reason === 'usage') {
    if (outstanding < 0) return null;            // already debited — idempotent no-op
    delta = -Math.abs(ref.hours);
  } else { // reversal
    if (outstanding >= 0) return null;           // nothing to reverse — idempotent no-op
    delta = -outstanding;                        // restore exactly the net debited (positive)
  }
  const { ledger, balanceHours } = await postLeaveMovement({
    deptId, memberId: leave.memberId, leaveTypeId: ref.typeId, deltaHours: delta,
    reason, sourceKind: 'leave_request', sourceId: leave.id, createdByUserId: user && user.id,
  });
  await audit(deptId, user, 'create', 'leave_accrual_ledger', ledger.id,
    { reason, source: 'leave_request', leaveId: leave.id, leaveTypeId: ref.typeId, deltaHours: delta });
  return { ledger, balanceHours };
}

// The advisory-lock key for a leave's bank — MUST match routes/leaveTypes.js's manual
// ledger-post key format `${memberId}:${leaveTypeId}` so approvals, cancellations, and
// chief manual posts against the SAME member+bank all serialize (M1: the balance floor
// gate must not be raceable across sibling operations). Returns null for a legacy/no-bank
// leave (nothing to serialize).
async function lockLeaveBank(deptId, leave) {
  const ref = leaveBankRef(leave);
  if (!ref) return null;
  await pool.query('SELECT pg_advisory_xact_lock($1, hashtext($2))',
    [deptId, `${leave.memberId}:${ref.typeId}`]);
  return ref;
}

// Fallback when a department hasn't set an explicit per-shift minimum (0075).
const DEFAULT_MIN_CREW = 3;

// Per-department min-staffing config (migration 0075). WARN (default) surfaces a
// shortfall to the approver; BLOCK (opt-in) refuses an approval that would breach.
// Fail-open to the historic default so a missing/errored read never blocks leave.
async function getStaffingConfig(departmentId) {
  try {
    const r = await pool.query(
      'SELECT min_staffing_per_shift, staffing_enforcement FROM departments WHERE id = $1',
      [departmentId]);
    const row = r.rows[0] || {};
    const min = Number.isInteger(row.min_staffing_per_shift) ? row.min_staffing_per_shift : DEFAULT_MIN_CREW;
    const enforcement = row.staffing_enforcement === 'block' ? 'block' : 'warn';
    return { minCrew: min > 0 ? min : DEFAULT_MIN_CREW, enforcement };
  } catch (_) {
    return { minCrew: DEFAULT_MIN_CREW, enforcement: 'warn' };
  }
}

function validate(body, requireAll = true) {
  const errors = [];
  if (requireAll) {
    if (!body.memberId && body.memberId !== 0) errors.push('memberId is required');
    if (!body.memberName || String(body.memberName).trim() === '') errors.push('memberName is required');
    if (!body.type || String(body.type).trim() === '') errors.push('type is required');
    if (!body.startDate || String(body.startDate).trim() === '') errors.push('startDate is required');
    if (!body.endDate || String(body.endDate).trim() === '') errors.push('endDate is required');
  }
  return errors;
}

// ── Coverage impact analysis ──────────────────────────────────────────────────
// Given a member name and date range, find all affected shifts and calculate
// what happens to coverage when this member is removed.

// memberId (1.2c #2, 2026-07-25) makes membership matching rename-proof: a shift that
// carries a memberIds array is matched BY ID; only a legacy shift with no memberIds falls
// back to the name string. The old name-only match silently missed a renamed member (their
// covered shifts wouldn't flag) and could false-match two similar names. memberId is
// optional so legacy callers/tests that pass only a name keep working.
async function analyzeCoverageImpact(stationId, memberName, startDate, endDate, minCrew = DEFAULT_MIN_CREW, memberId = null) {
  const allShifts = await shiftDb.all(stationId);
  const affectedShifts = allShifts.filter(
    s => s.date >= startDate && s.date <= endDate && memberOnShift(s, memberId, memberName)
  );

  const impact = {
    totalAffectedShifts: affectedShifts.length,
    minCrew,
    dropsBelowMinimum: 0,
    dropsToZero: 0,
    shifts: [],
  };

  for (const shift of affectedShifts) {
    const crewBefore = Array.isArray(shift.crew) ? shift.crew.length : 0;
    const crewAfter = crewCountAfterRemoval(shift, memberId, memberName);
    const wasBelowMin = crewBefore < minCrew;
    const nowBelowMin = crewAfter < minCrew;
    const dropsToZero = crewAfter === 0;

    if (nowBelowMin && !wasBelowMin) impact.dropsBelowMinimum++;
    if (dropsToZero) impact.dropsToZero++;

    impact.shifts.push({
      shiftId: shift.id,
      date: shift.date,
      shiftType: shift.shiftType,
      crewBefore,
      crewAfter,
      needsCoverage: nowBelowMin,
      critical: dropsToZero,
    });
  }

  return impact;
}

// ── Approval workflow: remove member from shifts + auto-create swap requests ──

async function processApproval(stationId, leaveRequest, minCrew = DEFAULT_MIN_CREW) {
  const allShifts = await shiftDb.all(stationId);
  const affectedShifts = allShifts.filter(
    s => s.date >= leaveRequest.startDate &&
         s.date <= leaveRequest.endDate &&
         memberOnShift(s, leaveRequest.memberId, leaveRequest.memberName)
  );

  const results = {
    shiftsModified: 0,
    swapRequestsCreated: 0,   // legacy key (client renders it) — the auto-swap island is retired; stays 0
    vacanciesCreated: 0,      // 1.4: the unified vacancy object is what leave approval mints now
    coverageGaps: [],
  };

  for (const shift of affectedShifts) {
    // Remove the member. For an ID-BACKED shift (1.1b: memberIds authoritative, crew derived
    // from it on read/write) strip the ID — shiftDb.update re-derives the crew-names snapshot.
    // For a LEGACY shift (no memberIds) strip the NAME only; passing memberIds:[] would make
    // shiftDb re-derive crew from an empty id list and WIPE the remaining legacy names.
    const hadIds = Array.isArray(shift.memberIds) && shift.memberIds.length > 0;
    const { crew: newCrew, memberIds: newMemberIds } = removeMemberFromShift(shift, leaveRequest.memberId, leaveRequest.memberName);
    await shiftDb.update(shift.id, hadIds ? { memberIds: newMemberIds } : { crew: newCrew }, stationId);
    results.shiftsModified++;

    // If this shift now drops below minimum, mint a first-class VACANCY (1.4 / 0080 —
    // the unified object; the old auto-swap island is retired). The absence transaction
    // and the vacancy are one event (market high-end model); the partial unique index
    // uq_vacancies_live_cause makes a re-approval a no-op, race-proof at the DB. Honors
    // the per-dept vacancy_auto_open posture inside mintVacancy's caller path here via
    // getVacancyConfig — a dept that turned auto-open off still sees the shortfall on
    // the coverage view (detection and minting are decoupled there, the lighter market
    // posture).
    if (newCrew.length < minCrew) {
      const vcfg = await getVacancyConfig(stationId);
      if (vcfg.autoOpen) {
        const th = tourHours(shift);
        const minted = await mintVacancy(stationId, {
          shift_date: shift.date,
          shift_id: shift.id,
          position_name: '',
          hours: th.hours ?? null,
          cause: 'leave', cause_kind: 'leave_request', cause_id: leaveRequest.id,
          priority: newCrew.length === 0 ? 1 : 2,
        }, null);
        if (minted) results.vacanciesCreated++;
      }

      results.coverageGaps.push({
        shiftId: shift.id,
        date: shift.date,
        shiftType: shift.shiftType,
        crewRemaining: newCrew.length,
        needed: minCrew - newCrew.length,
      });
    }
  }

  return results;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch leave requests' }); }
});

// Must be before /:id
router.get('/member/:memberId', async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    const allLeave = await db.all(req.user.department_id);
    const memberLeave = allLeave.filter(l => l.memberId === memberId);
    res.json({ data: memberLeave });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch member leave' }); }
});

// The caller's OWN leave requests (member self-service, 1.2e) — resolves the member from
// the JWT (members.user_id), never a client-sent id, so a member sees only their own leave
// (incl. the denial reason). Must be declared before '/:id'.
router.get('/mine', async (req, res) => {
  try {
    const m = await pool.query(
      'SELECT id FROM members WHERE user_id = $1 AND department_id = $2 LIMIT 1',
      [req.user.id, req.user.department_id]);
    if (!m.rows.length) return res.json({ data: [] });
    const memberId = m.rows[0].id;
    const all = await db.all(req.user.department_id);
    res.json({ data: all.filter((l) => l.memberId === memberId) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch your leave' }); }
});

// GET /api/leave/scheduled-hours?memberId=&start=&end= — derive the hours a leave would draw
// from the member's ACTUALLY-scheduled tours in the window (1.2 gate #1), so the request form
// prefills real hours instead of a guessed flat per-day number. A plain member is forced to
// their own member (never trusts a client id); officer+ may target any dept member.
// Source of truth is apparatus_assignments (structured per-seat rows carrying real hours);
// if that store has nothing for the window, fall back to the shifts roster (memberIds/crew
// match → tour length from clock times / shiftType). A tour we can't quantify is surfaced
// (needsReview) — never a fabricated default. Whole-tour charging is the conservative market
// behavior; OF has no partial-day leave model, so there is nothing to prorate down.
router.get('/scheduled-hours', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end (YYYY-MM-DD) are required', code: 'MISSING_RANGE' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return res.status(400).json({ error: 'start and end must be YYYY-MM-DD', code: 'BAD_DATE' });
    }

    // Resolve the member. A plain member (level < 2) is ALWAYS forced to their own row (a
    // client-sent memberId is ignored — never trusted as authorization). An officer+ may pass
    // ?memberId for any dept member (re-validated to the dept); with NO memberId they, too,
    // resolve to their OWN row — the self-service form (MyLeave) sends no id and can't know it.
    let memberId, memberName;
    const requested = req.query.memberId != null ? Number(req.query.memberId) : null;
    if (roleLevel(req.user.role) >= 2 && requested) {
      const m = await pool.query('SELECT id, name FROM members WHERE id = $1 AND department_id = $2', [requested, deptId]);
      if (!m.rows.length) return res.status(400).json({ error: 'memberId is not a member of this department', code: 'INVALID_MEMBER' });
      memberId = m.rows[0].id; memberName = m.rows[0].name;
    } else {
      const self = await pool.query(
        'SELECT id, name FROM members WHERE user_id = $1 AND department_id = $2 LIMIT 1',
        [req.user.id, deptId]);
      if (!self.rows.length) return res.json({ data: { hours: 0, source: 'none', days: 0, tours: [] } });
      memberId = self.rows[0].id; memberName = self.rows[0].name;
    }

    // 1) apparatus_assignments — the structured store of record (real per-seat hours).
    const aa = await pool.query(
      `SELECT date, hours, start_time, end_time, position_name
         FROM apparatus_assignments
        WHERE department_id = $1 AND member_id = $2 AND date >= $3 AND date <= $4
          AND (status IS NULL OR status <> 'cancelled')
        ORDER BY date`, [deptId, memberId, start, end]);
    let tours = [];
    let source = 'none';
    if (aa.rows.length) {
      source = 'assignments';
      // Dedupe by DATE — a member rides ONE tour per calendar day; two seat rows on one date
      // (a data anomaly) must not double-charge the leave. Keep the longest tour per date.
      const byDate = new Map();
      for (const r of aa.rows) {
        const date = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date);
        const th = tourHours({ hours: r.hours, start_time: r.start_time, end_time: r.end_time });
        const prev = byDate.get(date);
        if (!prev || (th.hours != null && (prev.hours == null || th.hours > prev.hours))) {
          byDate.set(date, { date, hours: th.hours, source: th.source, needsReview: th.needsReview, label: r.position_name || null });
        }
      }
      tours = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    } else {
      // 2) fallback — the shifts roster (memberIds id-match, name fallback).
      const allShifts = await shiftDb.all(deptId);
      const affected = allShifts.filter(
        (s) => s.date >= start && s.date <= end && memberOnShift(s, memberId, memberName));
      if (affected.length) {
        source = 'shifts';
        tours = affected.map((s) => {
          const th = tourHours({ shiftType: s.shiftType });
          return { date: s.date, hours: th.hours, source: th.source, needsReview: th.needsReview, label: s.shiftType || null };
        });
      }
    }

    const known = tours.filter((t) => t.hours != null);
    const hours = Math.round(known.reduce((sum, t) => sum + Number(t.hours), 0) * 100) / 100;
    const needsReview = tours.some((t) => t.needsReview);
    res.json({ data: { hours, source, days: tours.length, needsReview, tours } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to derive scheduled hours' }); }
});

// Coverage gaps: all open swap requests from leave-related gaps
router.get('/coverage-gaps', async (req, res) => {
  try {
    const { minCrew } = await getStaffingConfig(req.user.department_id);
    const allSwaps = await swapDb.all(req.user.department_id);
    const openSwaps = allSwaps.filter(s => s.status === 'Open' || s.status === 'Claimed');

    // Enrich with shift details
    const gaps = [];
    for (const swap of openSwaps) {
      const shift = await shiftDb.findById(swap.shiftId, req.user.department_id);
      if (shift) {
        gaps.push({
          swap,
          shift: {
            id: shift.id,
            date: shift.date,
            shiftType: shift.shiftType,
            crewCount: shift.crew.length,
            crew: shift.crew,
          },
          needsCoverage: shift.crew.length < minCrew,
        });
      }
    }

    // Sort by date
    gaps.sort((a, b) => a.shift.date.localeCompare(b.shift.date));
    res.json({ data: gaps });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch coverage gaps' }); }
});

// Impact analysis: preview what happens if leave is approved
router.post('/impact', async (req, res) => {
  try {
    const { memberName, startDate, endDate } = req.body;
    if (!memberName || !startDate || !endDate) {
      return res.status(400).json({ error: 'memberName, startDate, and endDate are required' });
    }
    const memberId = req.body.memberId != null ? Number(req.body.memberId) : null;
    const { minCrew, enforcement } = await getStaffingConfig(req.user.department_id);
    const impact = await analyzeCoverageImpact(req.user.department_id, memberName, startDate, endDate, minCrew, memberId);
    res.json({ data: { ...impact, enforcement } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to analyze impact' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const l = await db.findById(Number(req.params.id), req.user.department_id);
    if (!l) return res.status(404).json({ error: 'Leave request not found' });
    res.json({ data: l });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch leave request' }); }
});

// Create leave request — auto-runs impact analysis and returns it with the request
router.post('/', async (req, res) => {
  try {
    // Member self-service (1.2e): a plain member (below officer) may file only their OWN leave.
    // Resolve their member row from the JWT so the client needn't know its member id; if they
    // pass a memberId that isn't theirs, refuse. Officers+ may file for any dept member.
    if (roleLevel(req.user.role) < 2) {
      // A member self-request is ALWAYS Pending — approval (and the min-staffing gate) is
      // officer-only via PATCH. Strip any client-supplied status/approver so a member can't
      // self-approve or fabricate an approver.
      req.body.status = 'Pending';
      req.body.approvedBy = null;
      req.body.approvedAt = null;
      const self = await pool.query(
        'SELECT id, name FROM members WHERE user_id = $1 AND department_id = $2 LIMIT 1',
        [req.user.id, req.user.department_id]);
      const selfId = self.rows.length ? self.rows[0].id : null;
      if (req.body.memberId == null) {
        req.body.memberId = selfId;
        req.body.memberName = req.body.memberName || (self.rows.length ? self.rows[0].name : '');
      } else if (Number(req.body.memberId) !== selfId) {
        return res.status(403).json({ error: 'You can only request leave for yourself.', code: 'SELF_ONLY' });
      }
    }

    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    // Optional bank tie-in (1.2b): a request may name the bank it draws from + the hours.
    // ONLY a BANKED request feeds the ledger, so only then do we require the member + bank
    // to belong to this dept (never trust a client id — the 1.2a M1 lesson). A plain,
    // non-banked leave keeps its historic behavior (no roster gate, allows the id-0 sentinel).
    const leaveTypeId = req.body.leaveTypeId != null ? Number(req.body.leaveTypeId) : null;
    const hours = req.body.hours != null ? Number(req.body.hours) : null;
    if (leaveTypeId != null) {
      const mCheck = await pool.query('SELECT 1 FROM members WHERE id = $1 AND department_id = $2',
        [Number(req.body.memberId), req.user.department_id]);
      if (!mCheck.rows.length) return res.status(400).json({ error: 'memberId is not a member of this department', code: 'INVALID_MEMBER' });
      const b = await pool.query(
        'SELECT active FROM leave_types WHERE id = $1 AND department_id = $2', [leaveTypeId, req.user.department_id]);
      if (!b.rows.length) return res.status(400).json({ error: 'leaveTypeId is not a bank in this department', code: 'INVALID_BANK' });
      // A BANKED leave must go through the approve transition so the ledger debit fires — a
      // request created directly as Approved would count as scheduled/used yet never debit the
      // bank (posted vs scheduled drift). Force banked creation through Pending → Approved.
      if (req.body.status && req.body.status !== 'Pending') {
        return res.status(400).json({
          error: 'A banked leave must be created as Pending and then approved, so the bank debit is recorded.',
          code: 'BANKED_MUST_BE_PENDING' });
      }
    }
    if (hours != null && !(hours > 0)) return res.status(400).json({ error: 'hours must be a positive number', code: 'INVALID_HOURS' });

    const l = await db.create({
      memberId:   Number(req.body.memberId),
      memberName: req.body.memberName,
      type:       req.body.type,
      startDate:  req.body.startDate,
      endDate:    req.body.endDate,
      status:     req.body.status || 'Pending',
      approvedBy: req.body.approvedBy || null,
      approvedAt: req.body.approvedAt || null,
      reason:     req.body.reason || '',
      notes:      req.body.notes || '',
      leave_type_id: leaveTypeId,
      hours,
    }, req.user.department_id);

    // Auto-analyze impact against the department's configured minimum (0075).
    const { minCrew, enforcement } = await getStaffingConfig(req.user.department_id);
    const impact = await analyzeCoverageImpact(
      req.user.department_id, l.memberName, l.startDate, l.endDate, minCrew, l.memberId
    );

    res.status(201).json({ data: l, impact: { ...impact, enforcement } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create leave request' }); }
});

// Update leave request — triggers workflow on status change to Approved
router.patch('/:id', requireOfficer, async (req, res) => {
  try {
    const id = Number(req.params.id);

    // Get current state before update
    const before = await db.findById(id, req.user.department_id);
    if (!before) return res.status(404).json({ error: 'Leave request not found' });

    // Transitions (depend only on status, not on the lock). Debit fires ENTERING Approved;
    // reversal fires LEAVING Approved for ANY non-Approved target (Denied/Cancelled/Pending) —
    // symmetric or a debit strands (H2). Both are additionally idempotent at the ledger.
    const changesBank = req.body.leave_type_id !== undefined || req.body.hours !== undefined;
    const isApproving = req.body.status === 'Approved' && before.status !== 'Approved';
    const leavingApproved = before.status === 'Approved' && req.body.status !== undefined && req.body.status !== 'Approved';
    const isDenying = req.body.status === 'Denied' && before.status !== 'Denied';

    // Bank-field FREEZE (1.2b): once Approved, bank + hours are locked so a reversal always
    // matches the posted debit (no amendment path yet). (PATCH edits the snake columns
    // leave_type_id/hours — the only ones that reach lrUpdate.)
    if (before.status === 'Approved' && changesBank) {
      return res.status(409).json({
        error: 'The bank and hours of an approved leave are frozen. Cancel it first, then re-file.',
        code: 'BANK_FROZEN' });
    }
    // N1: never approve AND re-bank in ONE PATCH — the floor guard + lock below read the
    // PRE-merge bank/hours, so a combined change would debit an unchecked bank. Set the bank
    // first, then approve in a separate step. (Guarantees before == the effective bank ref.)
    if (isApproving && changesBank) {
      return res.status(409).json({
        error: 'Set the leave bank and hours before approving, in a separate step.',
        code: 'BANK_CHANGE_ON_APPROVE' });
    }
    // Re-validate a bank/hours change on a still-editable request — never trust a client id.
    if (req.body.leave_type_id != null) {
      const b = await pool.query('SELECT 1 FROM leave_types WHERE id = $1 AND department_id = $2',
        [Number(req.body.leave_type_id), req.user.department_id]);
      if (!b.rows.length) return res.status(400).json({ error: 'leave_type_id is not a bank in this department', code: 'INVALID_BANK' });
    }
    if (req.body.hours != null && !(Number(req.body.hours) > 0)) {
      return res.status(400).json({ error: 'hours must be a positive number', code: 'INVALID_HOURS' });
    }

    // Serialize ALL balance-affecting ops on this member+bank — approvals, cancellations,
    // and chief manual /ledger posts share the key format `${memberId}:${leaveTypeId}` — so
    // the floor gate + debit can't be raced (H1/M1). Txn-scoped. Legacy/no-bank → no lock.
    await lockLeaveBank(req.user.department_id, before);

    // Min-staffing enforcement (0075). When the department opts into BLOCK, an
    // approval that would drop a covered shift below the configured minimum is
    // refused (422) BEFORE any state changes — the approver must resolve coverage
    // first. WARN (the default/market norm) never blocks; the shortfall is returned
    // for the UI to surface. Never auto-denies.
    const { minCrew, enforcement } = await getStaffingConfig(req.user.department_id);
    let approvalImpact = null;
    if (isApproving) {
      // Evaluate the EFFECTIVE window: a single PATCH can transition to Approved AND
      // change the dates, and processApproval acts on the updated record — so the block
      // gate must look at the post-merge dates, not the stale before.* values.
      const effStart = req.body.startDate ?? before.startDate;
      const effEnd   = req.body.endDate   ?? before.endDate;
      approvalImpact = await analyzeCoverageImpact(
        req.user.department_id, before.memberName, effStart, effEnd, minCrew, before.memberId);
      if (enforcement === 'block' && (approvalImpact.dropsBelowMinimum > 0 || approvalImpact.dropsToZero > 0)) {
        return res.status(422).json({
          error: 'Approving this leave would drop a shift below the department minimum staffing. Resolve coverage first, or set enforcement to warn.',
          code: 'UNDERSTAFFED_BLOCK',
          impact: { ...approvalImpact, enforcement },
        });
      }
    }

    // Bank balance guard (1.2b). BEFORE any state change: if the request draws from a
    // bank and the debit would take it below its allowed floor (the bank's own
    // allow_negative / negative_floor from 1.2a), refuse the approval — the approver
    // sees the projected balance. Legacy requests (no bank/hours) skip this entirely.
    let bankCheck = null;
    if (isApproving) {
      bankCheck = await checkLeaveBankBalance(req.user.department_id, before);
      if (!bankCheck.ok) {
        return res.status(422).json({
          error: `Approving this leave would take the ${bankCheck.bankCode} balance to ${bankCheck.projected}, below its floor of ${bankCheck.floor}. Grant hours or allow a negative balance first.`,
          code: 'INSUFFICIENT_BALANCE',
          balance: bankCheck,
        });
      }
    }

    // If approving, set the approvedAt timestamp
    const updateData = { ...req.body };
    if (isApproving) updateData.approvedAt = new Date().toISOString();

    const l = await db.update(id, updateData, req.user.department_id);

    // If status changed to Approved, trigger the approval workflow
    let workflowResult = null;
    if (l.status === 'Approved' && before.status !== 'Approved') {
      workflowResult = await processApproval(req.user.department_id, l, minCrew);
    }

    // Bank movement (1.2b): approval posts a USAGE debit against the bank; cancelling an
    // already-approved leave (Approved → Denied) posts a REVERSAL that restores it. Both
    // ride the ONE append-only ledger write path (utils/leaveLedger). The debit fires
    // ONLY on the approve transition (idempotent: a re-PATCH of an already-Approved row
    // has isApproving=false → no second debit). Legacy/no-bank requests → no movement.
    let bankMovement = null;
    if (isApproving) {
      bankMovement = await applyLeaveBankMovement(req.user.department_id, l, 'usage', req.user);
    } else if (leavingApproved) {
      bankMovement = await applyLeaveBankMovement(req.user.department_id, before, 'reversal', req.user);
    }

    // Leave approvals/denials/cancellations are RECORD-grade (scheduling spec §6): append an
    // audit_log row. Best-effort + SAVEPOINT-wrapped in audit(); record_id is the SERIAL
    // leave id (integer). Never blocks the response.
    if (isApproving) {
      await audit(req.user.department_id, req.user, 'approve', 'leave_requests', id,
        { from: before.status, to: 'Approved', enforcement,
          dropsBelowMinimum: approvalImpact ? approvalImpact.dropsBelowMinimum : 0,
          bankDebitHours: bankMovement ? bankMovement.ledger.delta_hours : null });
    } else if (isDenying || leavingApproved) {
      await audit(req.user.department_id, req.user, 'reject', 'leave_requests', id,
        { from: before.status, to: req.body.status || 'Denied', reason: req.body.reason || null,
          bankReversalHours: bankMovement ? bankMovement.ledger.delta_hours : null });
    }

    res.json({
      data: l,
      workflow: workflowResult,
      impact: approvalImpact ? { ...approvalImpact, enforcement } : null,
      bank: bankMovement ? { balance_hours: bankMovement.balanceHours, movement: bankMovement.ledger.reason } : null,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update leave request' }); }
});

router.delete('/:id', requireOfficer, async (req, res) => {
  try {
    const id = Number(req.params.id);
    // Deleting an already-APPROVED banked leave must restore the balance — post a
    // reversal against the ledger BEFORE removing the request (the ledger is independent
    // of the request row; source_id preserves the link even after the request is gone).
    const before = await db.findById(id, req.user.department_id);
    if (before && before.status === 'Approved') {
      // Serialize on the member+bank key (shared with approvals + manual posts); the
      // reversal is idempotent at the ledger, so a concurrent/second delete no-ops.
      await lockLeaveBank(req.user.department_id, before);
      await applyLeaveBankMovement(req.user.department_id, before, 'reversal', req.user);
    }
    await db.remove(id, req.user.department_id);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete leave request' }); }
});

module.exports = router;
// Exposed for the Phase 1.2c min-staffing test suite (leaveMinStaffing.test.js).
module.exports.getStaffingConfig = getStaffingConfig;
module.exports.analyzeCoverageImpact = analyzeCoverageImpact;
