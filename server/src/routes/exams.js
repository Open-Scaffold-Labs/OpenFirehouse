'use strict';
/**
 * routes/exams.js — Phase 7: Certification Exams
 *
 * GET    /api/exams                    — list exams for the station
 * GET    /api/exams/my-assignments     — list exams assigned to current user
 * GET    /api/exams/my-results         — list current user's submissions
 * GET    /api/exams/:id                — get single exam (with questions if assigned/officer)
 * POST   /api/exams                    — create exam (officer/chief only)
 * PATCH  /api/exams/:id                — update exam (officer/chief only)
 * DELETE /api/exams/:id                — delete exam (officer/chief only)
 * POST   /api/exams/:id/assign         — assign to members (officer/chief only)
 * DELETE /api/exams/:id/assign/:userId  — unassign a member (officer/chief only)
 * GET    /api/exams/:id/submissions    — get all submissions for an exam (officer/chief)
 * POST   /api/exams/:id/submit         — submit completed exam
 */

const express = require('express');
const router  = express.Router();
const { exams, examAssignments, examSubmissions, training } = require('../db');

function isOfficer(req) {
  return req.user?.role === 'chief' || req.user?.role === 'officer';
}

// GET all exams for station
router.get('/', async (req, res) => {
  try {
    const data = await exams.allForStation(req.user.department_id);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch exams' });
  }
});

// GET my assignments
router.get('/my-assignments', async (req, res) => {
  try {
    const data = await examAssignments.forUser(req.user.id, req.user.department_id);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// GET my results
router.get('/my-results', async (req, res) => {
  try {
    const data = await examSubmissions.forUser(req.user.id, req.user.department_id);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// GET single exam
router.get('/:id', async (req, res) => {
  try {
    const exam = await exams.findById(parseInt(req.params.id), req.user.department_id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    // Members only see questions if they have an active assignment
    if (!isOfficer(req)) {
      const assignments = await examAssignments.forUser(req.user.id, req.user.department_id);
      const assigned = assignments.some(a => a.exam_id === exam.id);
      if (!assigned) {
        // Strip questions for unassigned members
        exam.questions = [];
      }
    }
    res.json({ data: exam });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch exam' });
  }
});

// POST create exam (officer/chief)
router.post('/', async (req, res) => {
  if (!isOfficer(req)) return res.status(403).json({ error: 'Officers only' });
  try {
    const exam = await exams.create(req.user.department_id, {
      ...req.body,
      created_by: req.user.id,
    });
    res.status(201).json({ data: exam });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create exam' });
  }
});

// PATCH update exam (officer/chief)
router.patch('/:id', async (req, res) => {
  if (!isOfficer(req)) return res.status(403).json({ error: 'Officers only' });
  try {
    const exam = await exams.update(parseInt(req.params.id), req.user.department_id, req.body);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json({ data: exam });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update exam' });
  }
});

// DELETE exam (officer/chief)
router.delete('/:id', async (req, res) => {
  if (!isOfficer(req)) return res.status(403).json({ error: 'Officers only' });
  try {
    const ok = await exams.remove(parseInt(req.params.id), req.user.department_id);
    if (!ok) return res.status(404).json({ error: 'Exam not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete exam' });
  }
});

// POST assign members to exam (officer/chief)
router.post('/:id/assign', async (req, res) => {
  if (!isOfficer(req)) return res.status(403).json({ error: 'Officers only' });
  try {
    const { userIds } = req.body; // array of user IDs
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array required' });
    }
    const data = await examAssignments.assign(req.user.department_id, parseInt(req.params.id), userIds);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign exam' });
  }
});

// DELETE unassign member from exam (officer/chief)
router.delete('/:id/assign/:userId', async (req, res) => {
  if (!isOfficer(req)) return res.status(403).json({ error: 'Officers only' });
  try {
    const ok = await examAssignments.remove(req.user.department_id, parseInt(req.params.id), parseInt(req.params.userId));
    res.json({ ok });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unassign' });
  }
});

// GET submissions for an exam (officer/chief)
router.get('/:id/submissions', async (req, res) => {
  if (!isOfficer(req)) return res.status(403).json({ error: 'Officers only' });
  try {
    const data = await examSubmissions.forExam(parseInt(req.params.id), req.user.department_id);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// POST submit completed exam
router.post('/:id/submit', async (req, res) => {
  try {
    const examId = parseInt(req.params.id);
    const exam = await exams.findById(examId, req.user.department_id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const { answers, started_at, time_spent } = req.body;
    const questions = typeof exam.questions === 'string' ? JSON.parse(exam.questions) : (exam.questions || []);

    // Score the exam
    let correct = 0;
    const gradedAnswers = (answers || []).map((a, i) => {
      const q = questions[i];
      const isCorrect = q && a.selected === q.correctAnswer;
      if (isCorrect) correct++;
      return { ...a, correct: isCorrect };
    });
    const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    const passed = score >= (exam.passing_score || 70);

    const submission = await examSubmissions.submit(req.user.department_id, {
      exam_id: examId,
      user_id: req.user.id,
      score,
      passed,
      answers: gradedAnswers,
      started_at,
      time_spent: time_spent || 0,
    });

    // Auto-create training record on pass
    let trainingRecord = null;
    if (passed) {
      const today = new Date().toISOString().split('T')[0];
      const memberName = req.user.name || req.user.username || 'Unknown';
      try {
        trainingRecord = await training.create({
          memberId: req.user.id,
          memberName,
          courseName: `Exam: ${exam.title}`,
          type: 'Certification',
          status: 'Passed',
          completedDate: today,
          expiresDate: null,
          hours: Math.max(1, Math.round((time_spent || 0) / 3600)),
          instructor: 'OpenFirehouse Exam System',
          location: 'Online — Certification Exam',
          notes: `Score: ${score}% (${correct}/${questions.length}). ${passed ? 'PASSED' : 'FAILED'}`,
        }, req.user.department_id);
      } catch (tErr) {
        console.warn('Could not auto-create training record for exam:', tErr.message);
      }
    }

    res.json({ data: { submission, trainingRecord, score, passed, correct, total: questions.length } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit exam' });
  }
});

module.exports = router;
