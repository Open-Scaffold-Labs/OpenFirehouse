'use strict';
/**
 * seed-meetingMinutes.js — Populate meeting_minutes table with sample data.
 * Covers multiple meeting types, statuses, linked modules.
 * Skips if already seeded.
 *
 * DIAGNOSTIC: Added detailed logging to debug production seeding issue.
 */

const { pool } = require('./db');

module.exports = async function seedMeetingMinutes() {
  console.log('[meeting-minutes-seed] ▶ Starting seedMeetingMinutes()');

  // Step 1: Verify the table exists
  try {
    const tableCheck = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'meeting_minutes') AS exists`
    );
    console.log('[meeting-minutes-seed] Table exists:', tableCheck.rows[0].exists);
    if (!tableCheck.rows[0].exists) {
      console.error('[meeting-minutes-seed] ❌ meeting_minutes table does NOT exist — aborting seed');
      return;
    }
  } catch (e) {
    console.error('[meeting-minutes-seed] ❌ Table existence check failed:', e.message);
    return;
  }

  // Step 2: Verify station_id=1 exists
  try {
    const stationCheck = await pool.query('SELECT id FROM stations WHERE id = 1');
    console.log('[meeting-minutes-seed] Station 1 exists:', stationCheck.rows.length > 0);
    if (stationCheck.rows.length === 0) {
      console.error('[meeting-minutes-seed] ❌ station_id=1 does not exist — cannot seed meeting minutes (FK would fail)');
      return;
    }
  } catch (e) {
    console.error('[meeting-minutes-seed] ❌ Station check failed:', e.message);
    return;
  }

  // Step 3: Check current count
  let currentCount;
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS cnt FROM meeting_minutes WHERE station_id = $1', [1]);
    currentCount = result.rows[0].cnt;
    console.log('[meeting-minutes-seed] Current row count for station_id=1:', currentCount);
  } catch (e) {
    console.error('[meeting-minutes-seed] ❌ Count check failed:', e.message);
    return;
  }

  if (currentCount > 0) {
    console.log('[meeting-minutes-seed] ✔ Already seeded (' + currentCount + ' rows), skipping.');
    return;
  }

  // Step 4: Define records
  const records = [
    {
      station_id: 1,
      title: 'January Regular Meeting',
      meeting_date: '2026-01-07',
      meeting_type: 'regular',
      location: 'Station 14 — Apparatus Bay',
      called_by: 'Sarah Chen',
      attendees: JSON.stringify([
        { name: 'Sarah Chen', role: 'Chief' },
        { name: 'Maria Delgado', role: 'Captain' },
        { name: 'Nathan McGee', role: 'Lieutenant' },
        { name: 'Sandra Kim', role: 'Engineer' },
        { name: 'James Ortega', role: 'Firefighter II' },
        { name: 'Tracy Benson', role: 'Firefighter II' },
        { name: 'Mike Harrington', role: 'Firefighter II' },
        { name: 'Carlos Ruiz', role: 'Probationary' },
        { name: 'Lisa Fontaine', role: 'Firefighter II' },
      ]),
      agenda: JSON.stringify([
        { item: 'Call to order and roll call', presenter: 'Sarah Chen' },
        { item: 'Approval of December meeting minutes', presenter: 'Sarah Chen' },
        { item: 'Treasurer report — Q4 budget review', presenter: 'Sandra Kim' },
        { item: 'Training officer report — 2026 training calendar', presenter: 'Maria Delgado' },
        { item: 'Old business: Station heating system repairs', presenter: 'Mike Harrington' },
        { item: 'New business: Pancake breakfast planning', presenter: 'Lisa Fontaine' },
        { item: 'Adjournment', presenter: 'Sarah Chen' },
      ]),
      motions: JSON.stringify([
        { text: 'Motion to approve December minutes as read', moved_by: 'Nathan McGee', seconded_by: 'Tracy Benson', result: 'Passed unanimously' },
        { text: 'Motion to allocate $500 for pancake breakfast supplies', moved_by: 'Mike Harrington', seconded_by: 'Sandra Kim', result: 'Passed 8-1' },
        { text: 'Motion to approve 2026 training calendar as presented', moved_by: 'Maria Delgado', seconded_by: 'Nathan McGee', result: 'Passed unanimously' },
      ]),
      action_items: JSON.stringify([
        { task: 'Get HVAC contractor quote for bunk room heater', assigned_to: 'Mike Harrington', due_date: '2026-01-21', status: 'completed' },
        { task: 'Order pancake breakfast supplies', assigned_to: 'Lisa Fontaine', due_date: '2026-02-01', status: 'completed' },
        { task: 'Distribute 2026 training calendar to all members', assigned_to: 'Maria Delgado', due_date: '2026-01-14', status: 'completed' },
      ]),
      notes: 'Good attendance. Budget is in healthy shape entering 2026. Training calendar received positive feedback.',
      next_meeting: '2026-02-04',
      recorded_by: 'Nathan McGee',
      status: 'approved',
      linked_module: null,
      linked_record_id: null,
      linked_label: null,
    },
    {
      station_id: 1,
      title: 'February Regular Meeting',
      meeting_date: '2026-02-04',
      meeting_type: 'regular',
      location: 'Station 14 — Apparatus Bay',
      called_by: 'Sarah Chen',
      attendees: JSON.stringify([
        { name: 'Sarah Chen', role: 'Chief' },
        { name: 'Maria Delgado', role: 'Captain' },
        { name: 'Nathan McGee', role: 'Lieutenant' },
        { name: 'Sandra Kim', role: 'Engineer' },
        { name: 'Tracy Benson', role: 'Firefighter II' },
        { name: 'Mike Harrington', role: 'Firefighter II' },
        { name: 'Lisa Fontaine', role: 'Firefighter II' },
      ]),
      agenda: JSON.stringify([
        { item: 'Call to order and roll call', presenter: 'Sarah Chen' },
        { item: 'Approval of January minutes', presenter: 'Sarah Chen' },
        { item: 'Pancake breakfast final logistics', presenter: 'Lisa Fontaine' },
        { item: 'SOG review: Apparatus checkout procedures', presenter: 'Maria Delgado' },
        { item: 'Grievance update (general, no names)', presenter: 'Mike Harrington' },
        { item: 'Spring open house planning', presenter: 'Tracy Benson' },
      ]),
      motions: JSON.stringify([
        { text: 'Motion to approve January minutes', moved_by: 'Sandra Kim', seconded_by: 'Mike Harrington', result: 'Passed unanimously' },
        { text: 'Motion to update SOG 200.01 checkout procedures to include digital backup', moved_by: 'Maria Delgado', seconded_by: 'Nathan McGee', result: 'Passed unanimously' },
      ]),
      action_items: JSON.stringify([
        { task: 'Coordinate pancake breakfast volunteer shifts', assigned_to: 'Lisa Fontaine', due_date: '2026-02-06', status: 'completed' },
        { task: 'Draft updated SOG 200.01 for review', assigned_to: 'Maria Delgado', due_date: '2026-02-18', status: 'completed' },
        { task: 'Contact local businesses for open house donations', assigned_to: 'Tracy Benson', due_date: '2026-03-01', status: 'in_progress' },
      ]),
      notes: 'Kevin Marsh and Amy Winters absent. Pancake breakfast is on track. SOG update approved — digital checklist backup added.',
      next_meeting: '2026-03-04',
      recorded_by: 'Nathan McGee',
      status: 'approved',
      linked_module: null,
      linked_record_id: null,
      linked_label: null,
    },
    {
      station_id: 1,
      title: 'Emergency Meeting — Kitchen Fire After-Action',
      meeting_date: '2026-01-06',
      meeting_type: 'emergency',
      location: 'Station 14 — Training Room',
      called_by: 'Sarah Chen',
      attendees: JSON.stringify([
        { name: 'Sarah Chen', role: 'Chief' },
        { name: 'Maria Delgado', role: 'Captain' },
        { name: 'Nathan McGee', role: 'Lieutenant' },
      ]),
      agenda: JSON.stringify([
        { item: 'Review of January 4 kitchen fire response', presenter: 'Sarah Chen' },
        { item: 'Mutual aid coordination assessment', presenter: 'Maria Delgado' },
        { item: 'Training gaps identified', presenter: 'Nathan McGee' },
      ]),
      motions: JSON.stringify([]),
      action_items: JSON.stringify([
        { task: 'Schedule ventilation drill within 30 days', assigned_to: 'Maria Delgado', due_date: '2026-02-06', status: 'completed' },
        { task: 'Update pre-plans for Elmwood Drive residential area', assigned_to: 'Nathan McGee', due_date: '2026-01-31', status: 'completed' },
      ]),
      notes: 'Officers-only debrief following the Elmwood Drive structure fire. Overall response was strong. Key learning: ventilation timing and pre-plan availability need improvement.',
      next_meeting: null,
      recorded_by: 'Maria Delgado',
      status: 'approved',
      linked_module: 'incidents',
      linked_record_id: 1,
      linked_label: 'Kitchen Fire — 412 Elmwood Drive',
    },
    {
      station_id: 1,
      title: 'Budget Committee — Q1 Review',
      meeting_date: '2026-02-12',
      meeting_type: 'budget',
      location: 'Station 14 — Training Room',
      called_by: 'Sandra Kim',
      attendees: JSON.stringify([
        { name: 'Sarah Chen', role: 'Chief' },
        { name: 'Sandra Kim', role: 'Engineer / Treasurer' },
        { name: 'Maria Delgado', role: 'Captain' },
      ]),
      agenda: JSON.stringify([
        { item: 'Q1 expense tracking review', presenter: 'Sandra Kim' },
        { item: 'AFG grant spending timeline', presenter: 'Sarah Chen' },
        { item: 'Fundraising revenue projections', presenter: 'Sandra Kim' },
      ]),
      motions: JSON.stringify([
        { text: 'Motion to approve $2,400 for SCBA flow testing', moved_by: 'Sarah Chen', seconded_by: 'Maria Delgado', result: 'Passed unanimously' },
      ]),
      action_items: JSON.stringify([
        { task: 'Submit AFG quarterly spending report', assigned_to: 'Sandra Kim', due_date: '2026-03-15', status: 'in_progress' },
        { task: 'Schedule SCBA flow testing with vendor', assigned_to: 'Maria Delgado', due_date: '2026-02-28', status: 'completed' },
      ]),
      notes: 'Budget on track. AFG grant funds being drawn down on schedule. Pancake breakfast revenue exceeded projections.',
      next_meeting: null,
      recorded_by: 'Sandra Kim',
      status: 'approved',
      linked_module: 'budget',
      linked_record_id: null,
      linked_label: 'Q1 2026 Budget Review',
    },
    {
      station_id: 1,
      title: 'March Regular Meeting',
      meeting_date: '2026-03-04',
      meeting_type: 'regular',
      location: 'Station 14 — Apparatus Bay',
      called_by: 'Sarah Chen',
      attendees: JSON.stringify([
        { name: 'Sarah Chen', role: 'Chief' },
        { name: 'Maria Delgado', role: 'Captain' },
        { name: 'Nathan McGee', role: 'Lieutenant' },
        { name: 'Sandra Kim', role: 'Engineer' },
        { name: 'James Ortega', role: 'Firefighter II' },
        { name: 'Tracy Benson', role: 'Firefighter II' },
        { name: 'Mike Harrington', role: 'Firefighter II' },
        { name: 'Carlos Ruiz', role: 'Probationary' },
      ]),
      agenda: JSON.stringify([
        { item: 'Call to order and roll call', presenter: 'Sarah Chen' },
        { item: 'Approval of February minutes', presenter: 'Sarah Chen' },
        { item: 'Q1 budget review', presenter: 'Sandra Kim' },
        { item: 'Spring drill schedule', presenter: 'Maria Delgado' },
        { item: 'Multi-agency MCI drill recap (March 8)', presenter: 'Sarah Chen' },
        { item: 'Spring open house final details', presenter: 'Tracy Benson' },
      ]),
      motions: JSON.stringify([
        { text: 'Motion to approve February minutes as read', moved_by: 'Mike Harrington', seconded_by: 'James Ortega', result: 'Passed unanimously' },
      ]),
      action_items: JSON.stringify([
        { task: 'Finalize open house activity stations', assigned_to: 'Tracy Benson', due_date: '2026-03-18', status: 'pending' },
        { task: 'Confirm mutual aid participation for MCI drill', assigned_to: 'Sarah Chen', due_date: '2026-03-06', status: 'completed' },
      ]),
      notes: 'Draft minutes — pending review. Diane Tolliver absent due to work conflict.',
      next_meeting: '2026-04-01',
      recorded_by: 'Nathan McGee',
      status: 'draft',
      linked_module: null,
      linked_record_id: null,
      linked_label: null,
    },
    {
      station_id: 1,
      title: 'Training Committee — Wildland Season Prep',
      meeting_date: '2026-03-10',
      meeting_type: 'training',
      location: 'Station 14 — Training Room',
      called_by: 'Maria Delgado',
      attendees: JSON.stringify([
        { name: 'Maria Delgado', role: 'Training Officer' },
        { name: 'Nathan McGee', role: 'Lieutenant' },
        { name: 'James Ortega', role: 'Firefighter II' },
        { name: 'Carlos Ruiz', role: 'Probationary' },
      ]),
      agenda: JSON.stringify([
        { item: 'Wildland certification status review', presenter: 'Maria Delgado' },
        { item: 'Red card eligibility updates', presenter: 'Maria Delgado' },
        { item: 'Spring burn season mutual aid coordination', presenter: 'Nathan McGee' },
      ]),
      motions: JSON.stringify([]),
      action_items: JSON.stringify([
        { task: 'Register Ortega and Ruiz for wildland ops course March 29', assigned_to: 'Maria Delgado', due_date: '2026-03-15', status: 'pending' },
        { task: 'Inventory wildland PPE cache', assigned_to: 'James Ortega', due_date: '2026-03-20', status: 'pending' },
      ]),
      notes: 'Four members currently red-card eligible. Two more need wildland ops course before season. PPE inventory needed to confirm we have enough cache sets.',
      next_meeting: null,
      recorded_by: 'Maria Delgado',
      status: 'draft',
      linked_module: 'training',
      linked_record_id: null,
      linked_label: 'Wildland Fire Operations',
    },
  ];

  // Step 5: Insert records one by one with per-record error handling
  let inserted = 0;
  let failed = 0;
  for (const rec of records) {
    try {
      await pool.query(
        `INSERT INTO meeting_minutes (station_id, title, meeting_date, meeting_type, location, called_by, attendees, agenda, motions, action_items, notes, next_meeting, recorded_by, status, linked_module, linked_record_id, linked_label, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())`,
        [
          rec.station_id, rec.title, rec.meeting_date, rec.meeting_type, rec.location,
          rec.called_by, rec.attendees, rec.agenda, rec.motions, rec.action_items,
          rec.notes, rec.next_meeting, rec.recorded_by, rec.status,
          rec.linked_module, rec.linked_record_id, rec.linked_label,
        ]
      );
      inserted++;
      console.log(`[meeting-minutes-seed]   ✔ Inserted: "${rec.title}"`);
    } catch (e) {
      failed++;
      console.error(`[meeting-minutes-seed]   ❌ FAILED "${rec.title}":`, e.message);
    }
  }

  // Step 6: Verify final count
  try {
    const verify = await pool.query('SELECT COUNT(*)::int AS cnt FROM meeting_minutes WHERE station_id = 1');
    console.log(`[meeting-minutes-seed] ✅ Done. Inserted: ${inserted}, Failed: ${failed}, Total in DB: ${verify.rows[0].cnt}`);
  } catch (e) {
    console.log(`[meeting-minutes-seed] ✅ Done. Inserted: ${inserted}, Failed: ${failed}. (verify count failed: ${e.message})`);
  }
};
