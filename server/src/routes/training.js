'use strict';
/**
 * routes/training.js — CRUD REST API for training records + video courses
 *
 * Training Records (existing):
 * GET    /api/training             — list all records
 * GET    /api/training/compliance  — per-member cert status + LOSAP hours
 * GET    /api/training/export      — CSV export for state reporting
 * GET    /api/training/:id         — get one record
 * POST   /api/training             — create a record
 * PATCH  /api/training/:id         — update a record
 * DELETE /api/training/:id         — delete a record
 *
 * Video Courses (Phase 7 — Training Hub):
 * GET    /api/training/courses              — list dept video courses
 * GET    /api/training/courses/:id          — get one course
 * POST   /api/training/courses              — create a course (officer+)
 * PUT    /api/training/courses/:id          — update a course (officer+)
 * DELETE /api/training/courses/:id          — deactivate a course (officer+)
 *
 * Course Completions:
 * GET    /api/training/courses/completions/me          — my completions
 * GET    /api/training/courses/completions/station      — all station completions
 * POST   /api/training/courses/:id/complete             — record a completion
 * POST   /api/training/courses/import                   — bulk CSV import
 */

const express = require('express');
const router  = express.Router();
const { training: db, trainingCourses: tcDb, trainingCourseCompletions: tccDb } = require('../db');

function validate(body, requireAll = true) {
  const errors = [];
  if (requireAll) {
    if (!body.courseName || String(body.courseName).trim() === '') errors.push('courseName is required');
    if (!body.type       || String(body.type).trim()       === '') errors.push('type is required');
  }
  if (body.hours !== undefined && body.hours !== null && body.hours !== '') {
    if (isNaN(Number(body.hours)) || Number(body.hours) < 0) errors.push('hours must be a non-negative number');
  }
  return errors;
}

function coerce(data) {
  const out = { ...data };
  if (out.hours    !== undefined) out.hours    = out.hours    === '' || out.hours    === null ? null : parseFloat(out.hours)    || 0;
  if (out.memberId !== undefined) out.memberId = parseInt(out.memberId, 10) || 0;
  if (out.completedDate === '') out.completedDate = null;
  if (out.expiresDate   === '') out.expiresDate   = null;
  return out;
}

router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch training records' }); }
});

// ── Compliance dashboard — per-member cert & LOSAP summary ─────────────────
router.get('/compliance', async (req, res) => {
  try {
    const records = await db.all(req.user.department_id);
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    const yearStart = new Date(today.getFullYear(), 0, 1);

    // LOSAP threshold: 50 training hours per calendar year (NJ standard)
    const LOSAP_THRESHOLD = 50;

    // Certs that require periodic renewal (track per member)
    const TRACKED_CERTS = [
      'Firefighter I',
      'Firefighter II',
      'HazMat Awareness',
      'HazMat Operations',
      'Driver/Operator',
      'ICS-100', 'ICS-200', 'NIMS-700', 'NIMS-800',
      'CPR/AED',
      'First Responder',
      'EMT-Basic',
    ];

    // Group by member
    const memberMap = {};
    for (const rec of records) {
      const name = rec.memberName || 'Unknown';
      if (!memberMap[name]) {
        memberMap[name] = {
          memberName: name,
          memberId:   rec.memberId || 0,
          certifications: [],
          losapHoursYTD: 0,
          totalRecords:  0,
        };
      }
      const m = memberMap[name];
      m.totalRecords++;

      // LOSAP hours: passed records in current calendar year
      if (rec.status === 'Passed' && rec.completedDate) {
        const d = new Date(rec.completedDate);
        if (d >= yearStart) {
          m.losapHoursYTD += (rec.hours || 0);
        }
      }

      // Certification tracking: keep latest record per course
      if (rec.status === 'Passed' && rec.expiresDate) {
        const existing = m.certifications.find((c) => c.courseName === rec.courseName);
        if (!existing || rec.expiresDate > existing.expiresDate) {
          if (existing) {
            m.certifications = m.certifications.filter((c) => c.courseName !== rec.courseName);
          }
          const exp  = new Date(rec.expiresDate);
          const diff = Math.round((exp - today) / 86400000);
          let status = 'ok';
          if (diff < 0)   status = 'expired';
          else if (diff <= 30)  status = 'critical';
          else if (diff <= 60)  status = 'warning';
          else if (diff <= 90)  status = 'caution';
          m.certifications.push({
            courseName:   rec.courseName,
            expiresDate:  rec.expiresDate,
            daysRemaining: diff,
            status,
          });
        }
      }
    }

    const members = Object.values(memberMap).map((m) => ({
      ...m,
      losapStatus:    m.losapHoursYTD >= LOSAP_THRESHOLD ? 'met' : m.losapHoursYTD >= LOSAP_THRESHOLD * 0.7 ? 'on-track' : 'at-risk',
      losapThreshold: LOSAP_THRESHOLD,
      expiredCount:   m.certifications.filter((c) => c.status === 'expired').length,
      alertCount:     m.certifications.filter((c) => ['critical','warning','caution'].includes(c.status)).length,
    })).sort((a, b) => a.memberName.localeCompare(b.memberName));

    // Summary counts
    const summary = {
      totalMembers:    members.length,
      membersWithExpired: members.filter((m) => m.expiredCount > 0).length,
      membersWithAlerts:  members.filter((m) => m.alertCount > 0).length,
      membersLosapMet:    members.filter((m) => m.losapStatus === 'met').length,
      membersLosapAtRisk: members.filter((m) => m.losapStatus === 'at-risk').length,
      year: today.getFullYear(),
      losapThreshold: LOSAP_THRESHOLD,
    };

    res.json({ data: { summary, members } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to generate compliance report' }); }
});

// ── CSV export for state reporting ──────────────────────────────────────────
router.get('/export', async (req, res) => {
  try {
    const records = await db.all(req.user.department_id);
    const year    = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd   = new Date(year + 1, 0, 1);

    const filtered = records.filter((r) => {
      if (!r.completedDate) return false;
      const d = new Date(r.completedDate);
      return d >= yearStart && d < yearEnd;
    });

    const headers = [
      'Member Name', 'Course Name', 'Type', 'Status',
      'Completed Date', 'Expires Date', 'Hours', 'Instructor', 'Location', 'Notes',
    ];

    function csvCell(val) {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    const rows = filtered.map((r) => [
      r.memberName, r.courseName, r.type, r.status,
      r.completedDate || '', r.expiresDate || '',
      r.hours != null ? r.hours : '',
      r.instructor || '', r.location || '', r.notes || '',
    ].map(csvCell).join(','));

    const csv = [headers.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="training_report_${year}.csv"`);
    res.send(csv);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to export training records' }); }
});

router.post('/', async (req, res) => {
  try {
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const rec = await db.create(coerce({
      memberId:        req.body.memberId        ?? 0,
      memberName:      req.body.memberName      || '',
      courseName:      req.body.courseName,
      type:            req.body.type,
      status:          req.body.status          || 'Passed',
      completedDate:   req.body.completedDate   || null,
      expiresDate:     req.body.expiresDate     || null,
      hours:           req.body.hours           ?? 0,
      instructor:      req.body.instructor      || '',
      location:        req.body.location        || '',
      notes:           req.body.notes           || '',
      delivery_method: req.body.delivery_method || 'Classroom',
    }), req.user.department_id);
    res.status(201).json({ data: rec });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create record' }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// Video Courses (Phase 7 — Training Hub)
// ═══════════════════════════════════════════════════════════════════════════

// List all department video courses
router.get('/courses', async (req, res) => {
  try { res.json({ data: await tcDb.all(req.user.department_id) }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch courses' }); }
});

// My course completions
router.get('/courses/completions/me', async (req, res) => {
  try { res.json({ data: await tccDb.allForUser(req.user.id, req.user.department_id) }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch completions' }); }
});

// All station completions (officer+)
router.get('/courses/completions/station', async (req, res) => {
  try { res.json({ data: await tccDb.allForStation(req.user.department_id) }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch completions' }); }
});

// Bulk import completions (CSV parsed on client, sent as JSON array)
router.post('/courses/import', async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array is required' });
    }
    // Each record needs at minimum: member_name, courseName, completedDate, hours
    // We create training records (not course completions) for external platform imports
    const imported = [];
    for (const rec of records) {
      const row = await db.create(coerce({
        memberId:        rec.memberId        ?? 0,
        memberName:      rec.memberName      || rec.member_name || '',
        courseName:      rec.courseName      || rec.course_name || '',
        type:            rec.type            || 'External Course',
        status:          rec.status          || 'Passed',
        completedDate:   rec.completedDate   || rec.completed_date || null,
        expiresDate:     rec.expiresDate     || rec.expires_date || null,
        hours:           rec.hours           ?? rec.ceu_hours ?? 0,
        instructor:      rec.instructor      || '',
        location:        rec.location        || rec.provider || '',
        notes:           rec.notes           || `Imported from ${rec.source || 'external platform'}`,
        delivery_method: rec.delivery_method || 'Online',
      }), req.user.department_id);
      imported.push(row);
    }
    res.status(201).json({ data: imported, count: imported.length });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to import records' }); }
});

// Get one course
router.get('/courses/:id', async (req, res) => {
  try {
    const course = await tcDb.findById(Number(req.params.id), req.user.department_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    res.json({ data: course });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch course' }); }
});

// Create a course (officer+)
router.post('/courses', async (req, res) => {
  try {
    if (!req.body.title || String(req.body.title).trim() === '') {
      return res.status(400).json({ error: 'title is required' });
    }
    const course = await tcDb.create({
      title:            req.body.title,
      description:      req.body.description      || '',
      video_url:        req.body.video_url         || req.body.videoUrl || '',
      video_type:       req.body.video_type        || req.body.videoType || 'youtube',
      iso_category:     req.body.iso_category      || req.body.isoCategory || 'general-ceu',
      ceu_hours:        parseFloat(req.body.ceu_hours || req.body.ceuHours || 0),
      duration_minutes: parseInt(req.body.duration_minutes || req.body.durationMinutes || 0, 10),
      level:            req.body.level             || 'awareness',
      passing_score:    parseInt(req.body.passing_score || req.body.passingScore || 80, 10),
      instructor:       req.body.instructor        || '',
      provider:         req.body.provider          || '',
      tags:             req.body.tags              || [],
      prerequisites:    req.body.prerequisites     || [],
      quiz:             req.body.quiz              || [],
      source:           req.body.source            || 'department',
      external_id:      req.body.external_id       || '',
      created_by:       req.user.name              || '',
    }, req.user.department_id);
    res.status(201).json({ data: course });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create course' }); }
});

// Update a course
router.put('/courses/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await tcDb.findById(id, req.user.department_id)) {
      return res.status(404).json({ error: 'Course not found' });
    }
    const updated = await tcDb.update(id, {
      title:            req.body.title,
      description:      req.body.description,
      video_url:        req.body.video_url         ?? req.body.videoUrl,
      video_type:       req.body.video_type        ?? req.body.videoType,
      iso_category:     req.body.iso_category      ?? req.body.isoCategory,
      ceu_hours:        req.body.ceu_hours != null ? parseFloat(req.body.ceu_hours) : undefined,
      duration_minutes: req.body.duration_minutes != null ? parseInt(req.body.duration_minutes, 10) : undefined,
      level:            req.body.level,
      passing_score:    req.body.passing_score != null ? parseInt(req.body.passing_score, 10) : undefined,
      instructor:       req.body.instructor,
      provider:         req.body.provider,
      tags:             req.body.tags,
      prerequisites:    req.body.prerequisites,
      quiz:             req.body.quiz,
      source:           req.body.source,
      external_id:      req.body.external_id,
      active:           req.body.active,
    }, req.user.department_id);
    res.json({ data: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update course' }); }
});

// Deactivate a course (soft delete)
router.delete('/courses/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await tcDb.findById(id, req.user.department_id)) {
      return res.status(404).json({ error: 'Course not found' });
    }
    await tcDb.remove(id, req.user.department_id);
    res.json({ message: `Course ${id} deactivated` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to deactivate course' }); }
});

// Record a course completion
router.post('/courses/:id/complete', async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const course = await tcDb.findById(courseId, req.user.department_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const completion = await tccDb.upsert(req.user.department_id, {
      course_id:      courseId,
      user_id:        req.user.id,
      member_name:    req.user.name || '',
      quiz_score:     req.body.quiz_score     ?? req.body.quizScore ?? 0,
      quiz_passed:    req.body.quiz_passed    ?? req.body.quizPassed ?? false,
      ceu_awarded:    req.body.ceu_awarded    ?? req.body.ceuAwarded ?? 0,
      attempts:       req.body.attempts       ?? 1,
      started_at:     req.body.started_at     || new Date().toISOString(),
      completed_at:   req.body.completed_at   || (req.body.quiz_passed || req.body.quizPassed ? new Date().toISOString() : null),
      certificate_id: req.body.certificate_id || '',
      source:         'internal',
    });

    // Also create a training record for unified reporting
    if (req.body.quiz_passed || req.body.quizPassed) {
      await db.create(coerce({
        memberId:        req.user.id,
        memberName:      req.user.name || '',
        courseName:      course.title,
        type:            'Video Course',
        status:          'Passed',
        completedDate:   new Date().toISOString().split('T')[0],
        hours:           course.ceu_hours || 0,
        instructor:      course.instructor || '',
        location:        course.provider || 'OpenFirehouse Video Course',
        notes:           `Score: ${req.body.quiz_score || req.body.quizScore || 0}% | ISO: ${course.iso_category}`,
        delivery_method: 'Online',
      }), req.user.department_id);
    }

    res.status(201).json({ data: completion });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to record completion' }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// Generic :id routes MUST come last (after /courses/* routes)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/:id', async (req, res) => {
  try {
    const rec = await db.findById(Number(req.params.id), req.user.department_id);
    if (!rec) return res.status(404).json({ error: 'Record not found' });
    res.json({ data: rec });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch record' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Record not found' });
    const errors = validate(req.body, false);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    res.json({ data: await db.update(id, coerce(req.body), req.user.department_id) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update record' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Record not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Training record ${id} deleted` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete record' }); }
});

module.exports = router;
