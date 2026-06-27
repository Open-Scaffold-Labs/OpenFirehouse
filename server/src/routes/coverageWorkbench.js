'use strict';
/**
 * routes/coverageWorkbench.js — Coverage tracking and member availability for scheduling officers
 *
 * GET    /api/coverage/available/:shiftId  — find available members for a shift
 * GET    /api/coverage/outreach/:leaveId   — get all outreach for a leave request
 * POST   /api/coverage/outreach            — record outreach attempt
 * PATCH  /api/coverage/outreach/:id        — update outreach (response received)
 * POST   /api/coverage/assign              — assign a member to cover (updates shift + swap + outreach)
 * GET    /api/coverage/dashboard           — officer dashboard: all pending leave with coverage status
 */

const express = require('express');
const router  = express.Router();
const { members: memberDb, shifts: shiftDb, leaveRequests: leaveDb, shiftSwaps: swapDb, coverageOutreach: outreachDb } = require('../db');

// ── Helper: Check if two shift times overlap ────────────────────────────────
// Shift types: 'Day' (06:00-18:00), 'Night' (18:00-06:00+1), 'Duty Officer', '24-Hour'
// Day and Night DON'T overlap each other. But Duty Officer and 24-Hour overlap with EVERYTHING.
function shiftsOverlap(type1, type2) {
  if (type1 === type2) return true;
  const nonOverlapping = new Set([
    JSON.stringify(['Day', 'Night']),
    JSON.stringify(['Night', 'Day']),
  ]);
  if (nonOverlapping.has(JSON.stringify([type1, type2]))) return false;
  // Duty Officer and 24-Hour overlap with everything
  return true;
}

// ── GET /available/:shiftId ────────────────────────────────────────────────
// Find members who could cover a shift. Logic:
// 1. Get the shift details (date, shiftType)
// 2. Get all members (active/probationary only)
// 3. Exclude members already on that shift
// 4. Exclude members on approved leave that day
// 5. Exclude members already on an overlapping shift that same day
// 6. For each available member, include their phone and email
// 7. Check outreach records — mark if this member has already been contacted
// 8. Sort: members with no outreach first, then by name
router.get('/available/:shiftId', async (req, res) => {
  try {
    const shiftId = Number(req.params.shiftId);
    const stationId = req.user.department_id;

    // Get shift
    const shift = await shiftDb.findById(shiftId, stationId);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });

    // Get all active/probationary members
    const allMembers = await memberDb.all(stationId);
    const activeMembers = allMembers.filter(m => m.status === 'Active' || m.status === 'Probationary');

    // Get all approved leave for the shift date
    const allLeave = await leaveDb.all(stationId);
    const leaveThatDay = allLeave.filter(l =>
      l.status === 'Approved' &&
      l.startDate <= shift.date &&
      l.endDate >= shift.date
    );

    // Get all shifts for that date to check overlaps
    const allShifts = await shiftDb.all(stationId);
    const shiftsOnDate = allShifts.filter(s => s.date === shift.date);

    // Get all outreach attempts for this shift (to mark contacted members)
    const outreachForShift = await outreachDb.allForShift(shiftId, stationId);
    const outreachByMemberId = {};
    for (const o of outreachForShift) {
      outreachByMemberId[o.memberId] = { status: o.status, outreachId: o.id };
    }

    const available = [];

    for (const member of activeMembers) {
      // Check if already on this shift
      if (shift.crew && shift.crew.includes(member.name)) continue;

      // Check if on approved leave that day
      const onLeave = leaveThatDay.some(l => l.memberId === member.id);
      if (onLeave) continue;

      // Check if on overlapping shift that day
      const onOverlappingShift = shiftsOnDate.some(s =>
        s.id !== shiftId &&
        shiftsOverlap(shift.shiftType, s.shiftType) &&
        s.crew && s.crew.includes(member.name)
      );
      if (onOverlappingShift) continue;

      // Add to available
      const outreach = outreachByMemberId[member.id];
      available.push({
        id: member.id,
        name: member.name,
        rank: member.rank,
        phone: member.phone || '',
        personal_email: member.personal_email || '',
        outreachStatus: outreach ? outreach.status : null,
        outreachId: outreach ? outreach.outreachId : null,
      });
    }

    // Sort: no outreach first, then by name
    available.sort((a, b) => {
      if (!a.outreachStatus && b.outreachStatus) return -1;
      if (a.outreachStatus && !b.outreachStatus) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ data: available });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to find available members' });
  }
});

// ── GET /outreach/:leaveId ─────────────────────────────────────────────────
// Get all outreach attempts for a specific leave request
router.get('/outreach/:leaveId', async (req, res) => {
  try {
    const leaveId = Number(req.params.leaveId);
    const stationId = req.user.department_id;

    const outreach = await outreachDb.allForLeave(leaveId, stationId);
    res.json({ data: outreach });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch outreach records' });
  }
});

// ── POST /outreach ─────────────────────────────────────────────────────────
// Record that the officer reached out to a member
router.post('/outreach', async (req, res) => {
  try {
    const { leaveRequestId, shiftId, memberId, memberName, contactMethod, status, sentAt } = req.body;
    const stationId = req.user.department_id;

    const errors = [];
    if (!leaveRequestId && leaveRequestId !== 0) errors.push('leaveRequestId is required');
    if (!shiftId && shiftId !== 0) errors.push('shiftId is required');
    if (!memberId && memberId !== 0) errors.push('memberId is required');
    if (!memberName || String(memberName).trim() === '') errors.push('memberName is required');
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const outreach = await outreachDb.create({
      leaveRequestId: Number(leaveRequestId),
      shiftId: Number(shiftId),
      memberId: Number(memberId),
      memberName,
      contactMethod: contactMethod || 'sms',
      status: status || 'Sent',
      sentAt: sentAt || new Date().toISOString(),
      respondedAt: null,
      response: '',
      notes: '',
    }, stationId);

    res.status(201).json({ data: outreach });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create outreach record' });
  }
});

// ── PATCH /outreach/:id ────────────────────────────────────────────────────
// Update outreach when member responds
router.patch('/outreach/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const stationId = req.user.department_id;

    const outreach = await outreachDb.update(id, req.body, stationId);
    if (!outreach) return res.status(404).json({ error: 'Outreach record not found' });

    res.json({ data: outreach });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update outreach record' });
  }
});

// ── POST /assign ────────────────────────────────────────────────────────────
// Assign a member to cover a shift:
// 1. Add member to shift crew
// 2. If swapId provided, mark swap as Approved with coveredBy info
// 3. If outreachId provided, mark outreach as Accepted
// 4. Return the updated shift
router.post('/assign', async (req, res) => {
  try {
    const { shiftId, memberId, memberName, swapId, outreachId } = req.body;
    const stationId = req.user.department_id;

    const errors = [];
    if (!shiftId && shiftId !== 0) errors.push('shiftId is required');
    if (!memberId && memberId !== 0) errors.push('memberId is required');
    if (!memberName || String(memberName).trim() === '') errors.push('memberName is required');
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    // Get the shift
    const shift = await shiftDb.findById(Number(shiftId), stationId);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });

    // Add member to crew if not already there
    const updatedCrew = Array.isArray(shift.crew) ? [...shift.crew] : [];
    if (!updatedCrew.includes(memberName)) {
      updatedCrew.push(memberName);
    }

    // Update shift
    const updatedShift = await shiftDb.update(Number(shiftId), { crew: updatedCrew }, stationId);

    // If swapId provided, mark swap as Approved
    if (swapId && swapId !== 0) {
      await swapDb.update(Number(swapId), {
        status: 'Approved',
        coveredById: Number(memberId),
        coveredByName: memberName
      }, stationId);
    }

    // If outreachId provided, mark outreach as Accepted
    if (outreachId && outreachId !== 0) {
      await outreachDb.update(Number(outreachId), {
        status: 'Accepted',
        respondedAt: new Date().toISOString(),
        response: 'Accepted coverage assignment'
      }, stationId);
    }

    res.json({ data: updatedShift });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign member to shift' });
  }
});

// ── GET /dashboard ─────────────────────────────────────────────────────────
// Officer dashboard: all pending leave with coverage status
router.get('/dashboard', async (req, res) => {
  try {
    const stationId = req.user.department_id;

    // Get all pending leave requests
    const allLeave = await leaveDb.all(stationId);
    const pendingLeave = allLeave.filter(l => l.status === 'Pending');

    // Get all shifts and outreach
    const allShifts = await shiftDb.all(stationId);
    const allOutreach = await outreachDb.all(stationId);
    const allSwaps = await swapDb.all(stationId);

    const dashboard = [];

    for (const leave of pendingLeave) {
      // Find affected shifts
      const affectedShifts = allShifts.filter(s =>
        s.date >= leave.startDate &&
        s.date <= leave.endDate &&
        s.crew && s.crew.includes(leave.memberName)
      );

      const shiftStatus = [];

      for (const shift of affectedShifts) {
        const outreachForShift = allOutreach.filter(o =>
          o.leaveRequestId === leave.id && o.shiftId === shift.id
        );

        const swapForShift = allSwaps.find(s =>
          s.shiftId === shift.id &&
          s.requesterId === leave.memberId &&
          (s.status === 'Open' || s.status === 'Claimed' || s.status === 'Approved')
        );

        const coverageStatus = {
          shiftId: shift.id,
          date: shift.date,
          shiftType: shift.shiftType,
          crewBefore: shift.crew.length,
          hasSwap: swapForShift ? true : false,
          swapStatus: swapForShift ? swapForShift.status : null,
          outreachAttempts: outreachForShift.length,
          responses: outreachForShift.filter(o => o.status !== 'Pending' && o.status !== 'Sent').length,
          acceptedCount: outreachForShift.filter(o => o.status === 'Accepted').length,
        };

        shiftStatus.push(coverageStatus);
      }

      dashboard.push({
        leaveId: leave.id,
        memberId: leave.memberId,
        memberName: leave.memberName,
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        reason: leave.reason,
        affectedShifts: affectedShifts.length,
        shifts: shiftStatus,
      });
    }

    // Get open swap requests
    const openSwaps = allSwaps.filter(s => s.status === 'Open' || s.status === 'Claimed');

    res.json({
      data: {
        pendingLeave: dashboard,
        openSwaps: openSwaps.length,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

module.exports = router;
