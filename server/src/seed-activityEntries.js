'use strict';
/**
 * seed-activityEntries.js — Populate the unified activity_entries log.
 * Records daily station activities: apparatus checks, fuel logs, visitor logs,
 * maintenance requests, training entries, and more.
 *
 * Note: The activity_entries table is self-created by routes/activityEntries.js,
 * so this seed ensures the table exists before inserting.
 *
 * Idempotent: skips if activity_entries already has data.
 */

const { pool } = require('./db');

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS activity_entries (
    id SERIAL PRIMARY KEY,
    station_id INTEGER DEFAULT 1,
    entry_type TEXT NOT NULL,
    category TEXT DEFAULT '',
    date TEXT NOT NULL,
    shift TEXT DEFAULT '',
    entered_by TEXT DEFAULT '',
    entered_by_id INTEGER DEFAULT NULL,
    apparatus TEXT DEFAULT '',
    result TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    body TEXT DEFAULT '',
    priority TEXT DEFAULT 'normal',
    visitor_name TEXT DEFAULT '',
    purpose TEXT DEFAULT '',
    time_in TEXT DEFAULT '',
    time_out TEXT DEFAULT '',
    gallons DOUBLE PRECISION DEFAULT NULL,
    fuel_type TEXT DEFAULT '',
    location TEXT DEFAULT '',
    property TEXT DEFAULT '',
    hydrant_id TEXT DEFAULT '',
    event_name TEXT DEFAULT '',
    attendees INTEGER DEFAULT NULL,
    department TEXT DEFAULT '',
    incident_type TEXT DEFAULT '',
    incident_number TEXT DEFAULT '',
    course TEXT DEFAULT '',
    hours DOUBLE PRECISION DEFAULT NULL,
    instructor TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

module.exports = async function seedActivityEntries() {
  // Ensure table exists (self-creating route may not have run yet)
  await pool.query(INIT_SQL);

  const { rows: check } = await pool.query(
    'SELECT COUNT(*) as c FROM activity_entries WHERE station_id = 1'
  );
  if (parseInt(check[0].c) > 0) {
    console.log('Activity entries seed: already seeded, skipping.');
    return;
  }

  const now = new Date();
  const officers = ['Sarah Chen', 'Maria Delgado', 'Nathan McGee'];
  const apparatusList = ['Engine 1', 'Engine 2', 'Ladder 1', 'Rescue 1', 'Medic 1', 'Tanker 1'];

  const entries = [];

  // Generate 21 days of activity entries
  for (let daysAgo = 20; daysAgo >= 0; daysAgo--) {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    const date = d.toISOString().split('T')[0];
    const shift = daysAgo % 2 === 0 ? 'Day' : 'Night';
    const officer = officers[daysAgo % 3];

    // Daily apparatus check — every apparatus, every day
    for (const app of apparatusList) {
      const isDeficiency = daysAgo === 8 && app === 'Engine 2';
      entries.push({
        entry_type: 'apparatus_check',
        category: 'Daily Check',
        date,
        shift,
        entered_by: officer,
        apparatus: app,
        result: isDeficiency ? 'Deficiency Found' : 'Satisfactory',
        notes: isDeficiency
          ? 'Engine 2: Left rear tire pressure low — 78 PSI. Inflated to 105 PSI. Monitor for slow leak. Reported to maintenance.'
          : `${app} daily check complete. All systems operational. Fuel, fluids, lighting, SCBA, medical supplies verified.`,
      });
    }

    // Fuel log (every 3 days)
    if (daysAgo % 3 === 0) {
      entries.push({
        entry_type: 'fuel_log',
        category: 'Fuel',
        date,
        shift,
        entered_by: officer,
        apparatus: apparatusList[daysAgo % apparatusList.length],
        gallons: parseFloat((Math.random() * 40 + 15).toFixed(1)),
        fuel_type: 'Diesel',
        location: 'Station 14 — Bay fuel station',
        notes: 'Fueled after response. Mileage logged.',
      });
    }

    // Visitor log (every 5 days)
    if (daysAgo % 5 === 0) {
      const visitors = [
        { name: 'Maplewood Elementary — Class 3B', purpose: 'Station tour and fire safety education', attendees: 24 },
        { name: 'Township Inspector Richardson', purpose: 'Annual facility inspection', attendees: 1 },
        { name: 'Boy Scout Troop 42', purpose: 'Fire safety merit badge requirements', attendees: 18 },
        { name: 'MFD Volunteer Applicants', purpose: 'Orientation — 4 new recruit candidates', attendees: 4 },
        { name: 'Greater Maplewood Community Advisory', purpose: 'Station operations overview meeting', attendees: 6 },
      ];
      const v = visitors[Math.floor(daysAgo / 5) % visitors.length];
      entries.push({
        entry_type: 'visitor_log',
        category: 'Visitor',
        date,
        shift,
        entered_by: officer,
        visitor_name: v.name,
        purpose: v.purpose,
        attendees: v.attendees,
        time_in: '10:00',
        time_out: '11:30',
        notes: `Visitor group: ${v.name}. Purpose: ${v.purpose}.`,
      });
    }

    // Training entry (every 4 days)
    if (daysAgo % 4 === 1) {
      const trainings = [
        { course: 'Pump Operations Drill', hours: 2, instructor: 'Maria Delgado', notes: 'Engine 1 and Engine 2. Attack line deployment, relay pumping, standpipe operations.' },
        { course: 'SCBA Confidence Training', hours: 1.5, instructor: 'Nathan McGee', notes: 'Full face-piece donning, doff, buddy checks, low-air alarm response.' },
        { course: 'Rapid Intervention Team (RIT) Drill', hours: 2, instructor: 'Sarah Chen', notes: 'All crew participated. MAYDAY procedures, air management, radio protocol.' },
        { course: 'Hazmat Operations Review', hours: 1, instructor: 'Maria Delgado', notes: 'ERG review, chemical detection, decon procedures refresher.' },
        { course: 'Aerial Ladder Operations', hours: 1.5, instructor: 'Kevin Marsh', notes: 'Ladder 1 operation: extension, rotation, tip loading, outrigger placement.' },
      ];
      const t = trainings[Math.floor(daysAgo / 4) % trainings.length];
      entries.push({
        entry_type: 'training',
        category: 'Company Training',
        date,
        shift,
        entered_by: officer,
        course: t.course,
        hours: t.hours,
        instructor: t.instructor,
        location: 'Station 14',
        notes: t.notes,
      });
    }

    // Maintenance request (every 7 days)
    if (daysAgo % 7 === 3) {
      const mxRequests = [
        { apparatus: 'Medic 1',   subject: 'Generator service overdue',                   notes: 'Medic 1 generator has not been serviced in 6 months. Scheduled with fleet maintenance for next week.', priority: 'high' },
        { apparatus: 'Rescue 1',  subject: 'Extrication tool hydraulic line weep',         notes: 'Small hydraulic fluid weep on port spreader line. Not critical. Scheduled replacement next OOS window.', priority: 'normal' },
        { apparatus: 'Engine 1',  subject: 'Pump panel gauge recalibration needed',        notes: 'Discharge pressure gauge reading 5 PSI off from master gauge. Submitted for calibration service.', priority: 'normal' },
      ];
      const mx = mxRequests[Math.floor(daysAgo / 7) % mxRequests.length];
      entries.push({
        entry_type: 'maintenance_request',
        category: 'Maintenance',
        date,
        shift,
        entered_by: officer,
        apparatus: mx.apparatus,
        subject: mx.subject,
        notes: mx.notes,
        priority: mx.priority,
      });
    }
  }

  // Insert all entries
  let inserted = 0;
  for (const entry of entries) {
    await pool.query(
      `INSERT INTO activity_entries (
        station_id, entry_type, category, date, shift, entered_by,
        apparatus, result, subject, notes, priority,
        visitor_name, purpose, attendees, time_in, time_out,
        gallons, fuel_type, location, course, hours, instructor
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        1,
        entry.entry_type,
        entry.category || '',
        entry.date,
        entry.shift || '',
        entry.entered_by || '',
        entry.apparatus || '',
        entry.result || '',
        entry.subject || '',
        entry.notes || '',
        entry.priority || 'normal',
        entry.visitor_name || '',
        entry.purpose || '',
        entry.attendees || null,
        entry.time_in || '',
        entry.time_out || '',
        entry.gallons || null,
        entry.fuel_type || '',
        entry.location || '',
        entry.course || '',
        entry.hours || null,
        entry.instructor || '',
      ]
    );
    inserted++;
  }

  console.log(`Activity entries seed complete: ${inserted} entries inserted into activity_entries.`);
};
