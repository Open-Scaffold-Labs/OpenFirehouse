'use strict';
/**
 * seed-exams.js — Populate exams and exam_assignments tables
 * exams schema: station_id, title, description, category, time_limit (INTEGER), passing_score, randomize, questions (JSONB), created_by (INTEGER), status, due_date, created_at
 * exam_assignments schema: station_id, exam_id, user_id, assigned_at
 * Skips if already seeded.
 */

const { pool } = require('./db');

const examQuestions = [
    {
      question: 'What is the primary purpose of a fire extinguisher classification system?',
      options: ['To organize extinguishers by color', 'To indicate the types of fires each extinguisher can safely suppress', 'To identify the manufacturer', 'To indicate the expiration date'],
      correct: 1,
    },
    {
      question: 'Under NFPA 1001, what is the minimum requirement for breathing apparatus use?',
      options: ['Self-contained breathing apparatus must be used during all interior firefighting operations', 'Breathing apparatus is optional for experienced firefighters', 'Breathing apparatus is only required in smoke', 'Breathing apparatus is not required for volunteer departments'],
      correct: 0,
    },
    {
      question: 'What does SCBA stand for?',
      options: ['Safety Certified Breathing Apparatus', 'Self-Contained Breathing Apparatus', 'Station Certified Breathing Apparatus', 'Standard Certified Breathing Apparatus'],
      correct: 1,
    },
    {
      question: 'How often should SCBA cylinders be hydrostatic tested?',
      options: ['Every year', 'Every 3 years', 'Every 5 years', 'Only when damaged'],
      correct: 2,
    },
    {
      question: 'What is the correct procedure for donning an SCBA unit in a non-emergency situation?',
      options: ['Place mask first, then secure harness', 'Secure harness first, then check seal and don mask', 'Don mask while standing', 'There is no standard procedure'],
      correct: 1,
    },
  ];

const scbaQuestions = [
    {
      question: 'What is the maximum air consumption rate for an average firefighter wearing an SCBA?',
      options: ['0.5 cubic feet per minute', '1.0 cubic feet per minute', '2.0 cubic feet per minute', '3.5 cubic feet per minute'],
      correct: 2,
    },
    {
      question: 'How should you respond if your SCBA alarm activates during interior operations?',
      options: ['Continue operations until alarm stops', 'Exit the hazard zone immediately and replace cylinder', 'Reduce work pace to conserve air', 'Switch to buddy breathing only'],
      correct: 1,
    },
    {
      question: 'What is the purpose of the face seal check on an SCBA mask?',
      options: ['To ensure proper fit and prevent external air leakage', 'To adjust the mask size', 'To test the air pressure', 'To clean the lens'],
      correct: 0,
    },
    {
      question: 'Which of the following is NOT a required component of an SCBA system?',
      options: ['Facepiece', 'Air cylinder', 'Regulator', 'Whistle'],
      correct: 3,
    },
    {
      question: 'What should you do if you experience difficulty breathing while wearing an SCBA?',
      options: ['Adjust the mask and continue', 'Signal your partner and exit immediately', 'Increase the regulator pressure', 'Remove the mask to verify fit'],
      correct: 1,
    },
  ];

// Exported so db.js can also reference for its own seeding
const EXAM_BANK = [
  {
    title: 'Fire Safety Fundamentals Exam',
    description: 'Basic fire safety and equipment knowledge covering NFPA 1001 fundamentals. Required for all firefighters.',
    category: 'Certification',
    questions: examQuestions,
    passing_score: 70,
    time_limit: 30,
    randomize: false,
    status: 'active',
    due_date: '2026-03-20',
  },
  {
    title: 'SCBA Proficiency Assessment',
    description: 'Advanced SCBA operation and safety procedures. Required for interior firefighting operations.',
    category: 'Certification',
    questions: scbaQuestions,
    passing_score: 75,
    time_limit: 40,
    randomize: false,
    status: 'active',
    due_date: '2026-04-01',
  },
];

async function seedExams() {
  const countResult = await pool.query('SELECT COUNT(*) FROM exams WHERE station_id = $1', [1]);
  const count = parseInt(countResult.rows[0].count, 10);
  if (count > 0) { console.log('Exams seed: already seeded, skipping.'); return; }

  let insertedExams = 0;
  let insertedAssignments = 0;

  for (const exam of EXAM_BANK) {
    const res = await pool.query(
      `INSERT INTO exams (station_id, title, description, category, questions, passing_score, time_limit, randomize, status, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [1, exam.title, exam.description, exam.category, JSON.stringify(exam.questions), exam.passing_score, exam.time_limit, exam.randomize, exam.status, exam.due_date, 1]
    );
    insertedExams++;

    if (res.rows.length > 0) {
      const examId = res.rows[0].id;
      // Assign to first 3 members
      for (const userId of [1, 2, 3]) {
        await pool.query(
          `INSERT INTO exam_assignments (station_id, exam_id, user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [1, examId, userId]
        );
        insertedAssignments++;
      }
    }
  }

  console.log(`Exams seed: ${insertedExams} exams and ${insertedAssignments} assignments inserted.`);
}

module.exports = seedExams;
module.exports.EXAM_BANK = EXAM_BANK;
