'use strict';
/**
 * dbAudit.js — Diagnostic route to audit database table population.
 * GET /api/admin/db-audit       — row counts for every table
 * POST /api/admin/force-reseed  — re-run all seeds, bypassing "already seeded" checks
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// ── All known tables ────────────────────────────────────────────────────────
const ALL_TABLES = [
  'stations', 'users', 'members', 'apparatus', 'incidents', 'training',
  'maintenance', 'shifts', 'shift_patterns', 'leave_requests', 'shift_swaps',
  'coverage_outreach', 'station_log', 'fi_properties', 'fi_inspections',
  'fi_permits', 'hydrants', 'volunteer_hours', 'grants', 'mutual_aid',
  'sogs', 'wellness', 'recruitment', 'events', 'pre_plans', 'drills',
  'courses', 'assets', 'cylinders', 'fill_stations', 'cad_connections',
  'investigations', 'pay_entries', 'crr_visits', 'crr_programs',
  'budget_lines', 'budget_transactions', 'nfirs_reports',
  'checklist_templates', 'checklist_completions', 'member_qualifications',
  'apparatus_positions', 'apparatus_assignments', 'ot_records',
  'personnel_actions', 'exposure_records', 'shift_trades',
  'module_completions', 'scenario_completions', 'incident_responses',
  'push_subscriptions', 'recall_events', 'cad_alerts', 'recall_responses',
  'active_boards', 'exams', 'exam_assignments', 'exam_submissions',
  'member_availability', 'bulletins', 'fundraising_campaigns', 'donations',
  'community_events', 'cadets', 'daily_staffing', 'apparatus_oos',
  'timesheets', 'grievances', 'after_action_reports', 'mutual_aid_agreements',
  'training_plans', 'dept_documents', 'meeting_minutes',
  'policy_acknowledgments', 'equipment_checkout', 'incident_costs',
  'attachments', 'calendar_subscriptions', 'assistant_preferences',
  'assistant_alerts', 'assistant_feedback',
];

// Tables that are naturally empty (runtime/event-driven, no seed needed)
const RUNTIME_TABLES = new Set([
  'push_subscriptions', 'recall_events', 'recall_responses', 'cad_alerts',
  'active_boards', 'incident_responses', 'member_availability',
  'coverage_outreach', 'shift_swaps', 'module_completions',
  'scenario_completions', 'calendar_subscriptions', 'checklist_completions',
]);

// ── GET /api/admin/db-audit ─────────────────────────────────────────────────
// Privileged endpoint — only the chief role can audit the database
function requireChief(req, res, next) {
  if (req.user?.role !== 'chief') {
    return res.status(403).json({ error: 'Chief role required for database audit.' });
  }
  next();
}

router.get('/', requireChief, async (req, res) => {
  try {
    const results = [];
    let emptyCount = 0;
    let totalRows = 0;

    for (const table of ALL_TABLES) {
      try {
        const { rows } = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(rows[0].count);
        const isRuntime = RUNTIME_TABLES.has(table);
        const status = count > 0 ? 'populated' : (isRuntime ? 'runtime (OK)' : 'EMPTY');
        if (count === 0 && !isRuntime) emptyCount++;
        totalRows += count;
        results.push({ table, count, status });
      } catch (e) {
        results.push({ table, count: -1, status: `ERROR: ${e.message}` });
      }
    }

    // Sort: empty first, then by name
    results.sort((a, b) => {
      if (a.status === 'EMPTY' && b.status !== 'EMPTY') return -1;
      if (a.status !== 'EMPTY' && b.status === 'EMPTY') return 1;
      return a.table.localeCompare(b.table);
    });

    res.json({
      summary: {
        totalTables: ALL_TABLES.length,
        populated: results.filter(r => r.status === 'populated').length,
        empty: emptyCount,
        runtime: results.filter(r => r.status === 'runtime (OK)').length,
        totalRows,
      },
      tables: results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/force-reseed ────────────────────────────────────────────
// Deletes existing seed data for EMPTY tables and re-runs all seeds.
// Privileged — chief-role only. This is destructive and can wipe demo state.
router.post('/force-reseed', requireChief, async (req, res) => {
  try {
    const seedModules = [
      '../seed.js', '../seed-apparatus.js', '../seed-incidents.js',
      '../seed-training.js', '../seed-maintenance.js', '../seed-shifts.js',
      '../seed-stationLog.js', '../seed-fireInspections.js', '../seed-hydrants.js',
      '../seed-volunteerHours.js', '../seed-grants.js', '../seed-mutualAid.js',
      '../seed-sogs.js', '../seed-wellness.js', '../seed-recruitment.js',
      '../seed-events.js', '../seed-prePlans.js', '../seed-drills.js',
      '../seed-assets.js', '../seed-scba.js', '../seed-cad.js',
      '../seed-investigations.js', '../seed-payroll.js', '../seed-crr.js',
      '../seed-budget.js', '../seed-nfirs.js', '../seed-afterAction.js',
      '../seed-apparatusAssignments.js', '../seed-apparatusOOS.js',
      '../seed-cadets.js', '../seed-courses.js', '../seed-dailyStaffing.js',
      '../seed-deptDocuments.js', '../seed-exposureRecords.js',
      '../seed-qualifications.js', '../seed-trainingPlans.js',
      '../seed-fundraising.js', '../seed-communityOutreach.js',
      '../seed-fillStations.js', '../seed-leaveRequests.js',
      '../seed-mutualAidAgreements.js', '../seed-otRecords.js',
      '../seed-personnelActions.js', '../seed-shiftPatterns.js',
      '../seed-shiftTrades.js', '../seed-timesheets.js', '../seed-exams.js',
      '../seed-grievances.js', '../seed-meetingMinutes.js',
      '../seed-bulletins.js', '../seed-equipmentCheckout.js', '../seed-knoxKeys.js',
      '../seed-attachments.js', '../seed-assistant.js',
      '../seed-apparatusPositions.js', '../seed-policyAcknowledgments.js',
      '../seed-fiPermits.js', '../seed-examAssignments.js',
      '../seed-donations.js', '../seed-assistantFeedback.js',
    ];

    const results = [];
    for (const mod of seedModules) {
      try {
        // Clear require cache to get fresh module
        delete require.cache[require.resolve(mod)];
        const fn = require(mod);
        if (typeof fn === 'function') {
          await fn();
          results.push({ module: mod, status: 'OK' });
        } else {
          results.push({ module: mod, status: 'skipped (not a function)' });
        }
      } catch (e) {
        results.push({ module: mod, status: `FAILED: ${e.message}` });
      }
    }

    res.json({ message: 'Force reseed complete', results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
