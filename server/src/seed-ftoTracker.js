'use strict';
/**
 * seed-ftoTracker.js — Populate FTO (Field Training Officer) tracker records.
 * Tracks probationary firefighters with daily observation records and scores.
 */

const { pool } = require('./db');

module.exports = async function seedFtoTracker() {
  // Check if already seeded
  const check = await pool.query('SELECT COUNT(*) FROM training_plans WHERE station_id = 1 AND type = $1', ['FTO Tracking']);
  if (parseInt(check.rows[0].count) > 0) {
    console.log('FTO tracker seed: already seeded, skipping.');
    return;
  }

  // Get member IDs
  const { rows: members } = await pool.query('SELECT id, name FROM members WHERE station_id = 1 ORDER BY id');
  if (members.length === 0) {
    console.log('FTO tracker seed: no members found, skipping.');
    return;
  }

  const m = (name) => {
    const found = members.find(r => r.name === name);
    return found ? found.id : null;
  };

  const traineeIds = {
    'Carlos Ruiz': m('Carlos Ruiz'),
    'Amy Winters': m('Amy Winters'),
    'Jordan Hayes': null, // New recruit, will be created inline
  };

  const ftoIds = {
    'Sarah Chen': m('Sarah Chen'),
    'Maria Delgado': m('Maria Delgado'),
    'Nathan McGee': m('Nathan McGee'),
  };

  // Create FTO training plans for the three trainees
  const ftoPlans = [
    {
      member_id: traineeIds['Carlos Ruiz'],
      fto_name: 'Sarah Chen',
      trainee_name: 'Carlos Ruiz',
      start_date: '2025-11-15',
      expected_completion: '2026-04-15',
      status: 'In Progress',
      progress_percentage: 65,
      notes: 'Probationary member. Good performance on apparatus operations. Continue focus on communication and initiative.',
    },
    {
      member_id: traineeIds['Amy Winters'],
      fto_name: 'Maria Delgado',
      trainee_name: 'Amy Winters',
      start_date: '2025-12-01',
      expected_completion: '2026-05-01',
      status: 'In Progress',
      progress_percentage: 55,
      notes: 'Probationary member. Excellent procedural compliance. Needs more field experience with live scenarios.',
    },
    {
      member_id: null, // New recruit Jordan Hayes
      fto_name: 'Nathan McGee',
      trainee_name: 'Jordan Hayes',
      start_date: '2026-01-20',
      expected_completion: '2026-06-20',
      status: 'In Progress',
      progress_percentage: 40,
      notes: 'New probationary recruit. Recent academy graduate. Strong foundation. Ongoing development needed.',
    },
  ];

  let inserted = 0;

  for (const plan of ftoPlans) {
    // Skip if member doesn't exist and it's not a new recruit placeholder
    if (plan.member_id === null && plan.trainee_name !== 'Jordan Hayes') {
      console.warn(`  Skipping FTO plan for ${plan.trainee_name}: member not found`);
      continue;
    }

    await pool.query(
      `INSERT INTO training_plans (
        member_id, member_name, type, start_date, expected_completion, status,
        progress_percentage, notes, station_id, created_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW())
       ON CONFLICT DO NOTHING`,
      [
        plan.member_id,
        plan.trainee_name,
        'FTO Tracking',
        plan.start_date,
        plan.expected_completion,
        plan.status,
        plan.progress_percentage,
        `FTO: ${plan.fto_name}. ${plan.notes}`,
      ]
    );
    inserted++;
  }

  // Note: Detailed FTO skill evaluations and field observations are handled
  // by seed-ftoEvaluations.js, which writes to the dedicated fto_evaluations
  // and fto_observations tables. This seed only manages the high-level
  // training_plans tracking records.

  console.log(`FTO tracker seed complete: ${inserted} training plans inserted.`);
};
