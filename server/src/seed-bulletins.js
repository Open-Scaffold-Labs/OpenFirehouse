'use strict';
/**
 * seed-bulletins.js — Populate bulletins table with sample data.
 * Covers all 6 categories, 3 priority levels, pinned/unpinned, active/expired.
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedBulletins() {
  const result = await pool.query('SELECT COUNT(*) FROM bulletins WHERE station_id = $1', [1]);
  if (result.rows[0].count > 0) {
    console.log('Bulletins seed: already seeded, skipping.');
    return;
  }

  const records = [
    {
      station_id: 1,
      title: 'Spring Open House — March 22',
      body: 'Our annual Spring Open House is Saturday, March 22 from 10 AM to 2 PM. We need volunteers for the following stations: apparatus display, kids activities (face painting, Jr. firefighter badges), fire safety demos, and refreshments. Sign up on the duty board or see Tracy Benson.\n\nRemember: Class A uniforms for those on apparatus display. Everyone else in department t-shirts.',
      category: 'General',
      priority: 'important',
      pinned: true,
      author_id: 6,
      author_name: 'Tracy Benson',
      expires_at: '2026-03-23T00:00:00Z',
    },
    {
      station_id: 1,
      title: 'SOG 200.01 Updated — Digital Checkout Procedures',
      body: 'SOG 200.01 (Apparatus Checkout Procedures) has been updated effective February 15, 2026. Key changes:\n\n1. All daily checkouts must now be entered in the digital checklist system in addition to the paper form.\n2. Photos required for any damage or deficiency noted.\n3. Out-of-service tagging procedure updated — red tags now require officer notification within 1 hour.\n\nPlease review the full updated SOG in the SOG Library and sign the acknowledgment form.',
      category: 'Policy',
      priority: 'important',
      pinned: true,
      author_id: 2,
      author_name: 'Maria Delgado',
      expires_at: null,
    },
    {
      station_id: 1,
      title: 'CPR/AED Recertification Reminder',
      body: 'The following members have CPR/AED certifications expiring in the next 60 days: Kevin Marsh (March 28), Amy Winters (April 5), Carlos Ruiz (April 12).\n\nA recertification class is scheduled for March 28 at Station 14. Contact Capt. Delgado to confirm your spot.',
      category: 'Training',
      priority: 'urgent',
      pinned: false,
      author_id: 2,
      author_name: 'Maria Delgado',
      expires_at: '2026-04-15T00:00:00Z',
    },
    {
      station_id: 1,
      title: 'February Meeting Minutes Posted',
      body: 'Minutes from the February 4 regular meeting have been approved and posted to Meeting Minutes. Key items: SOG 200.01 update approved, spring open house planning underway, Q1 budget on track.\n\nIf you have corrections, notify Lt. McGee by March 1.',
      category: 'Meeting',
      priority: 'normal',
      pinned: false,
      author_id: 3,
      author_name: 'Nathan McGee',
      expires_at: '2026-04-01T00:00:00Z',
    },
    {
      station_id: 1,
      title: 'Station 14 Softball Team — Season Signup',
      body: 'It\'s that time of year! The Station 14 Smoke Eaters are gearing up for the County Fire Department Softball League. Season runs May through August, games on Wednesday evenings.\n\nWe need at least 12 players. Family members welcome. Sign up on the sheet in the day room or text Mike Harrington. First practice TBD.',
      category: 'Social',
      priority: 'normal',
      pinned: false,
      author_id: 7,
      author_name: 'Mike Harrington',
      expires_at: '2026-04-30T00:00:00Z',
    },
    {
      station_id: 1,
      title: 'IMPORTANT: Carbon Monoxide Detector Recall',
      body: 'The County Fire Marshal has issued a safety bulletin regarding Acme Model XR-200 carbon monoxide detectors manufactured between January 2024 and June 2024. These units may fail to alarm at dangerous CO levels.\n\nAction required: Check all station CO detectors and any units distributed through our community program. If you find affected units, remove from service immediately and contact Eng. Kim for replacements.\n\nSerial number range: XR200-240100001 through XR200-240630000.',
      category: 'Safety',
      priority: 'urgent',
      pinned: true,
      author_id: 4,
      author_name: 'Sandra Kim',
      expires_at: null,
    },
    {
      station_id: 1,
      title: 'Pancake Breakfast Recap — Great Turnout!',
      body: 'Thanks to everyone who helped make the February 8 Pancake Breakfast a success! Final numbers:\n\n- 287 community members served\n- $2,840 raised for the training equipment fund\n- 15 members volunteered\n\nSpecial thanks to Lisa Fontaine for coordinating and the Ladies Auxiliary for their incredible support. Photos are posted on our Facebook page.',
      category: 'General',
      priority: 'normal',
      pinned: false,
      author_id: 1,
      author_name: 'Sarah Chen',
      expires_at: '2026-03-15T00:00:00Z',
    },
    {
      station_id: 1,
      title: 'Multi-Agency MCI Drill — March 8',
      body: 'Reminder: County-wide Mass Casualty Incident drill is Saturday, March 8 at Maplewood High School parking lot. All available members should attend.\n\nReport to staging at 07:30. Full PPE required. Media will be present — professional conduct expected. Lunch provided.\n\nThis counts toward your annual training requirement. See Capt. Delgado for details.',
      category: 'Training',
      priority: 'important',
      pinned: false,
      author_id: 1,
      author_name: 'Sarah Chen',
      expires_at: '2026-03-09T00:00:00Z',
    },
  ];

  let inserted = 0;
  for (const rec of records) {
    await pool.query(
      `INSERT INTO bulletins (station_id, title, body, category, priority, pinned, author_id, author_name, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [
        rec.station_id, rec.title, rec.body, rec.category, rec.priority,
        rec.pinned, rec.author_id, rec.author_name, rec.expires_at,
      ]
    );
    inserted++;
  }

  console.log(`Bulletins seed complete: ${inserted} inserted.`);
};
