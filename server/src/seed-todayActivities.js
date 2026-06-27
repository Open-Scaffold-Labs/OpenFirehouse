'use strict';
/**
 * seed-todayActivities.js — Populate realistic daily fire station activities
 * for TODAY's date so the Station Calendar Crew Board and River have real data.
 *
 * Generates a realistic day: shift turnover, apparatus checks, training,
 * meetings, inspections, and admin tasks assigned to the on-duty crew.
 *
 * Idempotent: skips if events already exist for today.
 */

const { pool } = require('./db');

module.exports = async function seedTodayActivities() {
  const today = new Date().toISOString().slice(0, 10);

  // Check if we already have seeded events for today
  const { rows: existing } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM events WHERE station_id = 1 AND date = $1`,
    [today]
  );

  if (existing[0].cnt >= 12) {
    console.log(`[today-activities] Already have ${existing[0].cnt} events for ${today}, skipping.`);
    return;
  }

  // Find today's Day shift crew and Duty Officer from shifts table
  const { rows: shifts } = await pool.query(
    `SELECT id, "shiftType", crew FROM shifts WHERE station_id = 1 AND date = $1`,
    [today]
  );

  let dayCrewNames = [];
  let dutyOfficerName = null;

  for (const shift of shifts) {
    const crew = typeof shift.crew === 'string' ? JSON.parse(shift.crew || '[]') : (shift.crew || []);
    const names = crew.map(c => typeof c === 'string' ? c.trim() : (c?.name || ''));

    if (shift.shiftType === 'Day') {
      dayCrewNames = names;
    } else if (shift.shiftType === 'Duty Officer') {
      dutyOfficerName = names[0] || null;
    }
  }

  // Combine all on-duty members
  const allOnDuty = [...new Set([...(dutyOfficerName ? [dutyOfficerName] : []), ...dayCrewNames])];

  if (allOnDuty.length === 0) {
    console.log('[today-activities] No shifts found for today, using fallback crew.');
    // Fallback: pick first 4 members
    const { rows: members } = await pool.query(
      `SELECT name FROM members WHERE station_id = 1 AND status IN ('Active', 'Probationary') ORDER BY id LIMIT 4`
    );
    allOnDuty.push(...members.map(m => m.name));
    if (allOnDuty.length > 0) dutyOfficerName = allOnDuty[0];
  }

  console.log(`[today-activities] On-duty crew for ${today}: ${allOnDuty.join(', ')}`);
  console.log(`[today-activities] Duty Officer: ${dutyOfficerName}`);

  // Build a realistic day of activities
  const activities = [
    {
      title: 'Shift Turnover Briefing',
      type: 'Meeting',
      startTime: '07:00',
      endTime: '07:30',
      location: 'Apparatus Bay',
      description: `Outgoing crew briefs incoming shift. ${dutyOfficerName || 'Officer'} leads turnover review of overnight incidents, apparatus status, and pending tasks.`,
    },
    {
      title: 'Morning Apparatus Check',
      type: 'Inspection',
      startTime: '07:30',
      endTime: '08:15',
      location: 'Apparatus Bay',
      description: `Daily apparatus inspection: Engine 14, Ladder 14, Rescue 14. Check lights, siren, pump, medical supplies, SCBA bottles, fuel levels. ${allOnDuty[1] || 'Firefighter'} assigned as lead.`,
    },
    {
      title: 'Engine 14 — Main Engine Maintenance Check',
      type: 'Inspection',
      startTime: '08:15',
      endTime: '09:30',
      location: 'Apparatus Bay',
      description: `Scheduled engine maintenance inspection on Engine 14: oil level, coolant, belts, hoses, pump primer, aerial hydraulic fluid, battery terminals, and tire pressure. ${allOnDuty[0] || 'Officer'} signs off on checklist.`,
    },
    {
      title: 'Station Duties & Housekeeping',
      type: 'Other',
      startTime: '08:15',
      endTime: '09:00',
      location: 'Station 14',
      description: 'Daily station cleanup: kitchen, bathrooms, day room, watch office. Equipment inventory and supply check.',
    },
    {
      title: 'Company Training — Hose Operations',
      type: 'Training',
      startTime: '09:30',
      endTime: '11:30',
      location: 'Training Yard',
      description: `2-hour drill: attack line deployment, supply line hookup, and relay pumping. All crew participates. ${dutyOfficerName || 'Officer'} evaluates performance.`,
    },
    {
      title: 'Lunch Break',
      type: 'Other',
      startTime: '11:30',
      endTime: '12:30',
      location: 'Station Kitchen',
      description: `${allOnDuty[allOnDuty.length - 1] || 'Crew member'} is on cooking duty today.`,
    },
    {
      title: 'Pre-Plan Review — Oak Street Elementary',
      type: 'Inspection',
      startTime: '13:00',
      endTime: '14:00',
      location: '200 Oak Street',
      description: `Building pre-plan walk-through: verify access points, hydrant locations, and FDC connections. ${dutyOfficerName || 'Officer'} and ${allOnDuty[1] || 'Firefighter'} assigned.`,
    },
    {
      title: 'Equipment Maintenance — SCBA Flow Test',
      type: 'Inspection',
      startTime: '14:00',
      endTime: '15:00',
      location: 'SCBA Room',
      description: `Monthly SCBA flow test and regulator check. ${allOnDuty[2] || 'Crew member'} responsible for documentation.`,
    },
    {
      title: 'Ladder 14 — Aerial Ladder Function Test',
      type: 'Inspection',
      startTime: '15:00',
      endTime: '15:45',
      location: 'Apparatus Bay / Parking Lot',
      description: `Weekly aerial ladder function test: extension, rotation, hydraulic pressure check. Verify outrigger indicator lights operational. ${allOnDuty[1] || 'Firefighter'} leads test.`,
    },
    {
      title: 'Administrative Hour',
      type: 'Other',
      startTime: '15:00',
      endTime: '16:00',
      location: 'Watch Office',
      description: `${dutyOfficerName || 'Officer'}: Complete incident reports, review training records, update station log. Crew: personal development time.`,
    },
    {
      title: 'Rescue 14 — Equipment Compartment Inspection',
      type: 'Inspection',
      startTime: '13:30',
      endTime: '14:30',
      location: 'Apparatus Bay',
      description: `Full compartment-by-compartment equipment inspection on Rescue 14: extrication tools, cribbing, struts, rope rescue gear, medical bags, and AED. Verify all items match inventory sheet and are within service dates. ${allOnDuty[2] || 'Crew member'} documents findings.`,
    },
    {
      title: 'Test Prep — Firefighter I Written Exam Review',
      type: 'Training',
      startTime: '15:00',
      endTime: '16:00',
      location: 'Training Room',
      description: `Study session for upcoming Firefighter I certification written exam. Review IFSTA chapters 12–16: fire behavior, building construction, water supply, and fire streams. ${dutyOfficerName || 'Officer'} leads Q&A. Practice tests available.`,
    },
    {
      title: 'Physical Training',
      type: 'Training',
      startTime: '16:00',
      endTime: '17:00',
      location: 'Fitness Room / Bay',
      description: 'Crew PT session: functional fitness circuit — tire flips, sled drag, stair climb with high-rise pack.',
    },
    {
      title: 'Night Shift Briefing',
      type: 'Meeting',
      startTime: '18:00',
      endTime: '18:30',
      location: 'Watch Office',
      description: `Day-to-night shift turnover. ${dutyOfficerName || 'Officer'} reviews outstanding items, apparatus status, and any pending calls or community requests.`,
    },
  ];

  let inserted = 0;
  for (const act of activities) {
    try {
      await pool.query(
        `INSERT INTO events (station_id, title, date, "startTime", "endTime", type, location, description)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7)`,
        [act.title, today, act.startTime, act.endTime, act.type, act.location, act.description]
      );
      inserted++;
    } catch (e) {
      console.error(`[today-activities] Failed to insert "${act.title}":`, e.message);
    }
  }

  console.log(`[today-activities] Seeded ${inserted} activities for ${today}.`);
};
