'use strict';
/**
 * seed-examAssignments.js — Populate exam_assignments and exam_submissions.
 * Schema: exam_assignments has (station_id, exam_id, user_id, assigned_at)
 * Schema: exam_submissions has (station_id, exam_id, user_id, score, passed, answers, started_at, completed_at, time_spent)
 */

const { pool } = require('./db');

module.exports = async function seedExamAssignments() {
  const { rows } = await pool.query('SELECT COUNT(*) FROM exam_assignments WHERE station_id = $1', [1]);
  if (parseInt(rows[0].count) > 0) {
    console.log('Exam assignments seed: already seeded, skipping.');
    return;
  }

  // Get existing exams
  const { rows: exams } = await pool.query('SELECT id, title FROM exams WHERE station_id = $1 ORDER BY id', [1]);
  if (exams.length === 0) {
    console.log('Exam assignments seed: no exams found, skipping.');
    return;
  }

  // Dynamic member lookup
  const { rows: members } = await pool.query('SELECT id, name FROM members WHERE station_id = 1 ORDER BY id');
  if (members.length === 0) { console.log('Exam assignments seed: no members found, skipping.'); return; }
  const m = (name) => { const found = members.find(r => r.name === name); return found ? found.id : null; };

  const assignments = [
    { user_id: m('Carlos Ruiz'),     exam_id: exams[0]?.id },
    { user_id: m('Carlos Ruiz'),     exam_id: exams[1]?.id },
    { user_id: m('Carlos Ruiz'),     exam_id: exams[2]?.id },
    { user_id: m('Amy Winters'),     exam_id: exams[0]?.id },
    { user_id: m('Amy Winters'),     exam_id: exams[1]?.id },
    { user_id: m('Amy Winters'),     exam_id: exams[2]?.id },
    { user_id: m('Nathan McGee'),    exam_id: exams[0]?.id },
    { user_id: m('James Ortega'),    exam_id: exams[0]?.id },
    { user_id: m('Tracy Benson'),    exam_id: exams[1]?.id },
    { user_id: m('Mike Harrington'), exam_id: exams[0]?.id },
  ];

  let assignInserted = 0;
  for (const a of assignments) {
    if (!a.exam_id || !a.user_id) continue;
    await pool.query(
      `INSERT INTO exam_assignments (station_id, exam_id, user_id, assigned_at)
       VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
      [1, a.exam_id, a.user_id]
    );
    assignInserted++;
  }

  // Create submissions for some completed assignments
  const { rows: subCheck } = await pool.query('SELECT COUNT(*) FROM exam_submissions WHERE station_id = $1', [1]);
  if (parseInt(subCheck[0].count) === 0) {
    const submissions = [
      { user_id: m('Carlos Ruiz'),     exam_id: exams[0]?.id, score: 88, passed: true, time_spent: 1200 },
      { user_id: m('Carlos Ruiz'),     exam_id: exams[1]?.id, score: 92, passed: true, time_spent: 900 },
      { user_id: m('Amy Winters'),     exam_id: exams[0]?.id, score: 76, passed: true, time_spent: 1500 },
      { user_id: m('Nathan McGee'),    exam_id: exams[0]?.id, score: 95, passed: true, time_spent: 720 },
      { user_id: m('Mike Harrington'), exam_id: exams[0]?.id, score: 84, passed: true, time_spent: 1080 },
    ];

    let subInserted = 0;
    for (const s of submissions) {
      if (!s.exam_id || !s.user_id) continue;
      await pool.query(
        `INSERT INTO exam_submissions (station_id, exam_id, user_id, score, passed, answers, started_at, completed_at, time_spent)
         VALUES ($1, $2, $3, $4, $5, '[]', NOW() - INTERVAL '1 hour', NOW(), $6) ON CONFLICT DO NOTHING`,
        [1, s.exam_id, s.user_id, s.score, s.passed, s.time_spent]
      );
      subInserted++;
    }
    console.log(`Exam submissions seed complete: ${subInserted} inserted.`);
  }

  console.log(`Exam assignments seed complete: ${assignInserted} inserted.`);
};
