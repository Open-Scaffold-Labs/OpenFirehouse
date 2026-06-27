'use strict';
const { pool } = require('./db');

module.exports = async function seedMessages() {
  const { rows: [{ c }] } = await pool.query(
    `SELECT COUNT(*) AS c FROM messages WHERE station_id = 1`
  );
  if (parseInt(c) > 0) return;

  const MESSAGES = [
    // Messages TO chief (Sarah Chen)
    {
      from_name: 'Maria Delgado',
      from_username: 'officer',
      to_username: 'chief',
      subject: 'Shift Coverage — Saturday',
      body: 'Chief, just a heads up that Kevin Marsh called out for Saturday\'s shift. I have Tracy Benson lined up to cover. Wanted to make sure you were in the loop before I confirm it.',
      sent_at: '2026-03-18T08:14:00Z',
      read_at: '2026-03-18T09:02:00Z',
    },
    {
      from_name: 'Nathan McGee',
      from_username: 'member',
      to_username: 'chief',
      subject: 'Training Proposal — Confined Space Rescue',
      body: 'Chief, I\'d like to put together a confined space rescue drill for next month. We haven\'t run one in over a year and two of our newer members haven\'t completed hands-on training. Could we set aside a Saturday morning? I can coordinate with County for the prop.',
      sent_at: '2026-03-17T14:33:00Z',
      read_at: null,
    },
    {
      from_name: 'Maria Delgado',
      from_username: 'officer',
      to_username: 'chief',
      subject: 'Apparatus Check — Rescue 14',
      body: 'Chief, during this morning\'s apparatus check I noticed the rear compartment door latch on Rescue 14 is sticking again. Flagged it for maintenance but wanted you to know. I\'ve noted it in the station log.',
      sent_at: '2026-03-16T07:55:00Z',
      read_at: '2026-03-16T08:30:00Z',
    },
    {
      from_name: 'Dispatch Center',
      from_username: 'dispatch',
      to_username: 'chief',
      subject: 'Mutual Aid Request — Oakdale FD',
      body: 'Chief Chen, Oakdale FD is requesting a tanker for a working structure fire at 4120 Ridgeline Rd. They have two engines on scene and need water supply support. Please advise on availability of Tanker 14.',
      sent_at: '2026-03-15T21:12:00Z',
      read_at: '2026-03-15T21:15:00Z',
    },
    {
      from_name: 'Nathan McGee',
      from_username: 'member',
      to_username: 'chief',
      subject: 'SCBA Fit Test Reminders',
      body: 'Chief, just a reminder that Carlos Ruiz, Amy Winters, and Diane Tolliver are due for annual SCBA fit testing by end of March. I can schedule them for the 28th if that works. Let me know and I\'ll send them a notice.',
      sent_at: '2026-03-14T11:20:00Z',
      read_at: '2026-03-14T13:45:00Z',
    },

    // Messages TO officer (Maria Delgado)
    {
      from_name: 'Sarah Chen',
      from_username: 'chief',
      to_username: 'officer',
      subject: 'RE: Shift Coverage — Saturday',
      body: 'Maria, thanks for the heads up. Tracy covering is fine. Please make sure the timesheet reflects the swap. Also remind her to sign in on the apparatus log if she takes out any units.',
      sent_at: '2026-03-18T09:05:00Z',
      read_at: '2026-03-18T09:30:00Z',
    },
    {
      from_name: 'Nathan McGee',
      from_username: 'member',
      to_username: 'officer',
      subject: 'Question about Drill Schedule',
      body: 'Captain, is there a drill scheduled for April? I want to coordinate the confined space proposal with whatever is already on the calendar so we\'re not doubling up.',
      sent_at: '2026-03-17T15:00:00Z',
      read_at: null,
    },
    {
      from_name: 'Tracy Benson',
      from_username: 'member',
      to_username: 'officer',
      subject: 'Leave Request — April 5-6',
      body: 'Captain Delgado, I\'d like to request leave for April 5th and 6th for a family commitment. I have coverage arranged with James Ortega if that\'s acceptable. Please let me know.',
      sent_at: '2026-03-16T16:40:00Z',
      read_at: '2026-03-17T08:10:00Z',
    },

    // Messages TO member (Nathan McGee)
    {
      from_name: 'Sarah Chen',
      from_username: 'chief',
      to_username: 'member',
      subject: 'RE: Training Proposal — Confined Space Rescue',
      body: 'Nathan, great idea. Let\'s target April 19th. Reach out to County and confirm the prop is available. Copy Maria on the coordination. Budget shouldn\'t be an issue — use the training line.',
      sent_at: '2026-03-17T16:00:00Z',
      read_at: '2026-03-17T16:45:00Z',
    },
    {
      from_name: 'Maria Delgado',
      from_username: 'officer',
      to_username: 'member',
      subject: 'April Drill — Confirmed',
      body: 'Nathan, April calendar is clear except for the 12th (community event). April 19th works great for the confined space drill. Go ahead and coordinate. I\'ll add it to the schedule.',
      sent_at: '2026-03-18T10:15:00Z',
      read_at: null,
    },
    {
      from_name: 'Sarah Chen',
      from_username: 'chief',
      to_username: 'member',
      subject: 'ISO Report — Data Needed',
      body: 'Lt. McGee, can you pull the training hours and drill attendance records for Q1 2026? We have an ISO evaluation coming up and I want to make sure our documentation is solid. Need it by the 25th.',
      sent_at: '2026-03-13T09:30:00Z',
      read_at: '2026-03-13T10:00:00Z',
    },

    // Broadcast-style messages
    {
      from_name: 'Sarah Chen',
      from_username: 'chief',
      to_username: 'member',
      subject: 'Station Meeting — March 25th at 1900',
      body: 'All members: Monthly station meeting is scheduled for Tuesday March 25th at 7:00 PM. Agenda includes budget update, apparatus status, upcoming drills, and ISO prep. Attendance is strongly encouraged. Light refreshments provided.',
      sent_at: '2026-03-12T14:00:00Z',
      read_at: '2026-03-12T18:30:00Z',
    },
    {
      from_name: 'Maria Delgado',
      from_username: 'officer',
      to_username: 'member',
      subject: 'PPE Inspection — This Week',
      body: 'All members: Please bring your structural PPE in for inspection this week during your shift. We are verifying gear condition ahead of the ISO visit. Any gear needing repair should be tagged and turned in to the supply room.',
      sent_at: '2026-03-11T08:00:00Z',
      read_at: '2026-03-11T09:15:00Z',
    },
  ];

  let count = 0;
  for (const msg of MESSAGES) {
    // Look up the from_id if possible
    const { rows: users } = await pool.query(
      `SELECT id FROM users WHERE username = $1 LIMIT 1`,
      [msg.from_username]
    );
    const from_id = users[0]?.id || null;

    await pool.query(
      `INSERT INTO messages
         (station_id, from_id, from_name, from_username, to_username, subject, body, sent_at, read_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING`,
      [
        1,
        from_id,
        msg.from_name,
        msg.from_username,
        msg.to_username,
        msg.subject,
        msg.body,
        msg.sent_at,
        msg.read_at || null,
      ]
    );
    count++;
  }

  console.log(`  ✓ seed-messages: ${count} messages inserted`);
};
