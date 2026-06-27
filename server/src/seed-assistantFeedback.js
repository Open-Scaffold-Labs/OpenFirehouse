'use strict';
/**
 * seed-assistantFeedback.js — Populate assistant_feedback table.
 * Creates sample feedback on assistant alerts from members.
 * Depends on assistant_alerts being populated first.
 */

const { pool } = require('./db');

module.exports = async function seedAssistantFeedback() {
  const { rows } = await pool.query('SELECT COUNT(*) FROM assistant_feedback WHERE station_id = $1', [1]);
  if (parseInt(rows[0].count) > 0) {
    console.log('Assistant feedback seed: already seeded, skipping.');
    return;
  }

  // Get existing alerts to link feedback
  const { rows: alerts } = await pool.query(
    'SELECT id, member_id, title FROM assistant_alerts WHERE station_id = $1 ORDER BY id LIMIT 10',
    [1]
  );

  if (alerts.length === 0) {
    console.log('Assistant feedback seed: no alerts found, skipping.');
    return;
  }

  const feedback = [
    {
      member_id: 1, // Sarah Chen
      alert_id: alerts[0]?.id || null,
      feedback: 'helpful',
      reason: 'Good reminder — I almost missed this deadline.',
    },
    {
      member_id: 2, // Maria Delgado
      alert_id: alerts[1]?.id || null,
      feedback: 'helpful',
      reason: 'Accurate and timely. This is exactly the kind of heads-up I need.',
    },
    {
      member_id: 3, // Nathan McGee
      alert_id: alerts[2]?.id || null,
      feedback: 'not_helpful',
      reason: 'Already handled this. Alert came after I had completed the task.',
    },
    {
      member_id: 5, // James Ortega
      alert_id: alerts.length > 3 ? alerts[3].id : alerts[0]?.id,
      feedback: 'helpful',
      reason: null,
    },
    {
      member_id: 4, // Sandra Kim
      alert_id: alerts.length > 4 ? alerts[4].id : alerts[0]?.id,
      feedback: 'dismiss',
      reason: 'Not relevant to my role.',
    },
    {
      member_id: 7, // Mike Harrington
      alert_id: alerts.length > 2 ? alerts[2].id : alerts[0]?.id,
      feedback: 'helpful',
      reason: 'This saved me a trip — the equipment was already checked out.',
    },
  ];

  let inserted = 0;
  for (const f of feedback) {
    if (!f.alert_id) continue;
    await pool.query(
      `INSERT INTO assistant_feedback (station_id, member_id, alert_id, feedback, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [1, f.member_id, f.alert_id, f.feedback, f.reason]
    );
    inserted++;
  }

  console.log(`Assistant feedback seed complete: ${inserted} inserted.`);
};
