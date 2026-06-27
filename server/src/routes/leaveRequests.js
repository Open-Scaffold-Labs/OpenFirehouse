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
const { leaveRequests: db, shifts: shiftDb, shiftSwaps: swapDb } = require('../db');

const MIN_CREW = 3;

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

async function analyzeCoverageImpact(stationId, memberName, startDate, endDate) {
  const allShifts = await shiftDb.all(stationId);
  const affectedShifts = allShifts.filter(
    s => s.date >= startDate && s.date <= endDate && s.crew.includes(memberName)
  );

  const impact = {
    totalAffectedShifts: affectedShifts.length,
    dropsBelowMinimum: 0,
    dropsToZero: 0,
    shifts: [],
  };

  for (const shift of affectedShifts) {
    const crewAfter = shift.crew.filter(n => n !== memberName);
    const wasBelowMin = shift.crew.length < MIN_CREW;
    const nowBelowMin = crewAfter.length < MIN_CREW;
    const dropsToZero = crewAfter.length === 0;

    if (nowBelowMin && !wasBelowMin) impact.dropsBelowMinimum++;
    if (dropsToZero) impact.dropsToZero++;

    impact.shifts.push({
      shiftId: shift.id,
      date: shift.date,
      shiftType: shift.shiftType,
      crewBefore: shift.crew.length,
      crewAfter: crewAfter.length,
      needsCoverage: nowBelowMin,
      critical: dropsToZero,
    });
  }

  return impact;
}

// ── Approval workflow: remove member from shifts + auto-create swap requests ──

async function processApproval(stationId, leaveRequest) {
  const allShifts = await shiftDb.all(stationId);
  const affectedShifts = allShifts.filter(
    s => s.date >= leaveRequest.startDate &&
         s.date <= leaveRequest.endDate &&
         s.crew.includes(leaveRequest.memberName)
  );

  const results = {
    shiftsModified: 0,
    swapRequestsCreated: 0,
    coverageGaps: [],
  };

  for (const shift of affectedShifts) {
    // Remove the member from the crew
    const newCrew = shift.crew.filter(n => n !== leaveRequest.memberName);
    await shiftDb.update(shift.id, { crew: newCrew }, stationId);
    results.shiftsModified++;

    // If this shift now drops below minimum, auto-create a swap request
    if (newCrew.length < MIN_CREW) {
      // Check if there's already an open swap for this shift from this leave
      const existingSwaps = await swapDb.allForShift(shift.id, stationId);
      const alreadyOpen = existingSwaps.some(
        sw => sw.requesterId === leaveRequest.memberId && (sw.status === 'Open' || sw.status === 'Claimed')
      );

      if (!alreadyOpen) {
        await swapDb.create({
          shiftId: shift.id,
          requesterId: leaveRequest.memberId,
          requesterName: leaveRequest.memberName,
          coveredById: null,
          coveredByName: null,
          status: 'Open',
          reason: `${leaveRequest.type} leave: ${leaveRequest.startDate} – ${leaveRequest.endDate}`,
          notes: `Auto-created from approved leave request #${leaveRequest.id}`,
        }, stationId);
        results.swapRequestsCreated++;
      }

      results.coverageGaps.push({
        shiftId: shift.id,
        date: shift.date,
        shiftType: shift.shiftType,
        crewRemaining: newCrew.length,
        needed: MIN_CREW - newCrew.length,
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

// Coverage gaps: all open swap requests from leave-related gaps
router.get('/coverage-gaps', async (req, res) => {
  try {
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
          needsCoverage: shift.crew.length < MIN_CREW,
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
    const impact = await analyzeCoverageImpact(req.user.department_id, memberName, startDate, endDate);
    res.json({ data: impact });
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
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
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
    }, req.user.department_id);

    // Auto-analyze impact
    const impact = await analyzeCoverageImpact(
      req.user.department_id, l.memberName, l.startDate, l.endDate
    );

    res.status(201).json({ data: l, impact });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create leave request' }); }
});

// Update leave request — triggers workflow on status change to Approved
router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    // Get current state before update
    const before = await db.findById(id, req.user.department_id);
    if (!before) return res.status(404).json({ error: 'Leave request not found' });

    // If approving, set the approvedAt timestamp
    const updateData = { ...req.body };
    if (updateData.status === 'Approved' && before.status !== 'Approved') {
      updateData.approvedAt = new Date().toISOString();
    }

    const l = await db.update(id, updateData, req.user.department_id);

    // If status changed to Approved, trigger the approval workflow
    let workflowResult = null;
    if (l.status === 'Approved' && before.status !== 'Approved') {
      workflowResult = await processApproval(req.user.department_id, l);
    }

    res.json({ data: l, workflow: workflowResult });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update leave request' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.remove(Number(req.params.id), req.user.department_id);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete leave request' }); }
});

module.exports = router;
