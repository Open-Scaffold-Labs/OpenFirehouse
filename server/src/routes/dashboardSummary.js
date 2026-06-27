'use strict';
/**
 * routes/dashboardSummary.js — Unified dashboard summary endpoint.
 *
 * GET /api/dashboard/summary
 *
 * Returns a single JSON payload with cross-module aggregated data:
 * - Personnel overview (active, on leave, probationary)
 * - Apparatus status (in service, OOS count)
 * - Shift staffing (this week, understaffed count)
 * - Incident stats (this month, YTD)
 * - Training compliance (expired, expiring soon, valid certs)
 * - Calendar summary (today/this week event count from calendar feed)
 * - Open action items (grievances, meetings, maintenance)
 * - Critical alerts aggregated from all modules
 */
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// Helper: format YYYY-MM-DD
const fmtDate = (d) => d.toISOString().slice(0, 10);

// Safe query helper — returns { rows: [] } on error instead of throwing.
// A dashboard is an aggregation: one drifted module must degrade, never 500 the endpoint.
async function safeQuery(label, sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    console.warn(`[dashboard/summary] ${label} query failed:`, err.message);
    return { rows: [] };
  }
}

router.get('/summary', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const now = new Date();
    const todayStr = fmtDate(now);
    const monthStr = todayStr.slice(0, 7); // "YYYY-MM"
    const yearStr  = todayStr.slice(0, 4);

    // Week boundaries (Sunday–Saturday)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // 30-day lookahead for cert expirations
    const thirtyDays = new Date(now);
    thirtyDays.setDate(now.getDate() + 30);

    // Run all queries in parallel
    const [
      membersRes,
      apparatusRes,
      oosRes,
      shiftsWeekRes,
      incMonthRes,
      incYearRes,
      expiredCertsRes,
      soonCertsRes,
      validCertsRes,
      grievancesOpenRes,
      maintenanceDueRes,
      meetingDraftsRes,
      leaveTodayRes,
      eventsWeekRes,
      overdueCheckoutsRes,
      budgetStatusRes,
      incidentsMonthRes,
      incidentsLastMonthRes,
    ] = await Promise.all([
      // Personnel
      safeQuery('members', `SELECT status, COUNT(*) as count FROM members WHERE department_id = $1 GROUP BY status`, [stationId]),
      // Apparatus
      safeQuery('apparatus', `SELECT status, COUNT(*) as count FROM apparatus WHERE department_id = $1 GROUP BY status`, [stationId]),
      // Apparatus OOS (active)
      safeQuery('apparatus_oos', `SELECT COUNT(*) as count FROM apparatus_oos WHERE department_id = $1 AND status = 'active'`, [stationId]),
      // Shifts this week
      safeQuery('shifts', `SELECT id, date, "shiftType" AS shift_type FROM shifts WHERE department_id = $3 AND date BETWEEN $1 AND $2`, [fmtDate(weekStart), fmtDate(weekEnd), stationId]),
      // Incidents this month
      safeQuery('incidents-month', `SELECT COUNT(*) as count FROM incidents WHERE department_id = $2 AND date >= $1 AND deleted_at IS NULL`, [monthStr + '-01', stationId]),
      // Incidents YTD
      safeQuery('incidents-ytd', `SELECT COUNT(*) as count FROM incidents WHERE department_id = $2 AND date >= $1 AND deleted_at IS NULL`, [yearStr + '-01-01', stationId]),
      // Expired certifications (qualifications table ships later — degrades to empty until then)
      safeQuery('qualifications-expired', `SELECT q.id, q.cert_name, q.expiry_date, m.name FROM qualifications q LEFT JOIN members m ON m.id = q.member_id WHERE q.department_id = $2 AND q.expiry_date IS NOT NULL AND q.expiry_date < $1 ORDER BY q.expiry_date LIMIT 20`, [todayStr, stationId]),
      // Expiring soon (next 30 days)
      safeQuery('qualifications-soon', `SELECT q.id, q.cert_name, q.expiry_date, m.name FROM qualifications q LEFT JOIN members m ON m.id = q.member_id WHERE q.department_id = $3 AND q.expiry_date BETWEEN $1 AND $2 ORDER BY q.expiry_date LIMIT 20`, [todayStr, fmtDate(thirtyDays), stationId]),
      // Valid certs
      safeQuery('qualifications-valid', `SELECT COUNT(*) as count FROM qualifications WHERE department_id = $2 AND (expiry_date IS NULL OR expiry_date > $1)`, [fmtDate(thirtyDays), stationId]),
      // Open grievances
      safeQuery('grievances', `SELECT COUNT(*) as count FROM grievances WHERE department_id = $1 AND status NOT IN ('resolved', 'closed', 'withdrawn') AND deleted_at IS NULL`, [stationId]),
      // Maintenance due in 30 days ("nextServiceDate" is nullable TEXT — guard empty strings)
      safeQuery('maintenance', `SELECT COUNT(*) as count FROM maintenance WHERE department_id = $2 AND status IN ('scheduled', 'overdue') AND "nextServiceDate" IS NOT NULL AND "nextServiceDate" <> '' AND "nextServiceDate" <= $1`, [fmtDate(thirtyDays), stationId]),
      // Meeting drafts
      safeQuery('meeting_minutes', `SELECT COUNT(*) as count FROM meeting_minutes WHERE department_id = $1 AND status = 'draft'`, [stationId]),
      // Members on leave today ("memberName" lives on leave_requests — no members JOIN needed)
      safeQuery('leave_requests', `SELECT lr.id, lr."memberName" AS name, lr.type AS leave_type FROM leave_requests lr WHERE lr.department_id = $2 AND LOWER(lr.status) = 'approved' AND lr."startDate" <= $1 AND lr."endDate" >= $1`, [todayStr, stationId]),
      // Events this week
      safeQuery('events', `SELECT COUNT(*) as count FROM events WHERE department_id = $3 AND date BETWEEN $1 AND $2`, [fmtDate(weekStart), fmtDate(weekEnd), stationId]),
      // Overdue equipment checkouts (no due_date column — expected_return is the due timestamp)
      safeQuery('equipment_checkout', `SELECT COUNT(*) as count FROM equipment_checkout WHERE department_id = $2 AND status = 'checked_out' AND expected_return < $1`, [todayStr, stationId]),
      // Budget status — this fiscal year (no spent column exists; report 0 spent)
      safeQuery('budget_lines', `SELECT COALESCE(SUM(CAST("budgetedAmount" AS DECIMAL)), 0) as total_budgeted, 0 as total_spent FROM budget_lines WHERE department_id = $2 AND "fiscalYear" = $1`, [parseInt(yearStr, 10), stationId]),
      // Incidents this month for response time (no response_time/dispatch_to_arrival columns —
      // NULLs keep the downstream trend math empty-safe so responseTrend stays null)
      safeQuery('incidents-response-month', `SELECT NULL AS response_time, NULL AS dispatch_to_arrival FROM incidents WHERE department_id = $2 AND date >= $1 AND deleted_at IS NULL`, [monthStr + '-01', stationId]),
      // Incidents last month for comparison
      safeQuery('incidents-response-lastmonth', `SELECT NULL AS response_time, NULL AS dispatch_to_arrival FROM incidents WHERE department_id = $3 AND date >= $1 AND date < $2 AND deleted_at IS NULL`,
        [(new Date(now.getFullYear(), now.getMonth() - 1, 1)).toISOString().slice(0, 7) + '-01',
         monthStr + '-01', stationId]),
    ]);

    // Aggregate personnel
    const personnel = { active: 0, probationary: 0, on_leave: 0, inactive: 0, total: 0 };
    for (const row of membersRes.rows) {
      const s = (row.status || '').toLowerCase();
      const c = parseInt(row.count, 10);
      if (s === 'active') personnel.active = c;
      else if (s === 'probationary') personnel.probationary = c;
      else if (s === 'on leave') personnel.on_leave = c;
      else if (s === 'inactive') personnel.inactive = c;
      personnel.total += c;
    }

    // Aggregate apparatus
    const apparatus = { in_service: 0, out_of_service: 0, total: 0 };
    for (const row of apparatusRes.rows) {
      const s = (row.status || '').toLowerCase();
      const c = parseInt(row.count, 10);
      if (s === 'in service') apparatus.in_service = c;
      else apparatus.out_of_service += c;
      apparatus.total += c;
    }
    apparatus.active_oos = parseInt(oosRes.rows[0]?.count || 0, 10);

    // Build alerts array
    const alerts = [];

    // Expired certs
    for (const r of expiredCertsRes.rows) {
      alerts.push({
        level: 'critical',
        category: 'training',
        title: `Expired: ${r.cert_name}`,
        detail: `${r.name} — expired ${r.expiry_date}`,
        module: 'training',
      });
    }
    // Soon certs
    for (const r of soonCertsRes.rows) {
      const days = Math.round((new Date(r.expiry_date) - now) / 86400000);
      alerts.push({
        level: 'warning',
        category: 'training',
        title: `Expiring Soon: ${r.cert_name}`,
        detail: `${r.name} — expires in ${days}d`,
        module: 'training',
      });
    }
    // Maintenance
    if (parseInt(maintenanceDueRes.rows[0]?.count || 0, 10) > 0) {
      alerts.push({
        level: 'warning',
        category: 'equipment',
        title: `${maintenanceDueRes.rows[0].count} maintenance items due`,
        detail: 'Within the next 30 days',
        module: 'maintenance',
      });
    }
    // Open grievances
    const openGrievances = parseInt(grievancesOpenRes.rows[0]?.count || 0, 10);
    if (openGrievances > 0) {
      alerts.push({
        level: 'warning',
        category: 'personnel',
        title: `${openGrievances} open grievance${openGrievances > 1 ? 's' : ''}`,
        detail: 'Requiring attention',
        module: 'grievances',
      });
    }
    // Overdue checkouts
    const overdueCheckouts = parseInt(overdueCheckoutsRes.rows[0]?.count || 0, 10);
    if (overdueCheckouts > 0) {
      alerts.push({
        level: 'warning',
        category: 'equipment',
        title: `${overdueCheckouts} overdue equipment checkout${overdueCheckouts > 1 ? 's' : ''}`,
        detail: 'Past due date',
        module: 'equipment-checkout',
      });
    }
    // Apparatus OOS
    if (apparatus.active_oos > 0) {
      alerts.push({
        level: 'critical',
        category: 'equipment',
        title: `${apparatus.active_oos} apparatus out of service`,
        detail: 'Active OOS records',
        module: 'apparatus',
      });
    }

    // Sort alerts: critical first
    alerts.sort((a, b) => (a.level === 'critical' ? -1 : 1) - (b.level === 'critical' ? -1 : 1));

    // ── Calculate Department Health Scorecard ───────────────────────────────
    const totalBudget = parseFloat(budgetStatusRes.rows[0]?.total_budgeted || 0);
    const totalSpent = parseFloat(budgetStatusRes.rows[0]?.total_spent || 0);
    const budgetRemaining = totalBudget > 0 ? ((totalBudget - totalSpent) / totalBudget) * 100 : 0;
    const budgetStatus = budgetRemaining >= 40 ? 'green' : budgetRemaining >= 20 ? 'yellow' : 'red';

    // Training compliance: validCerts / (validCerts + expiredCerts + soonCerts) * 100
    const validCertCount = parseInt(validCertsRes.rows[0]?.count || 0, 10);
    const expiredCertCount = expiredCertsRes.rows.length;
    const soonCertCount = soonCertsRes.rows.length;
    const totalCerts = validCertCount + expiredCertCount + soonCertCount;
    const trainingCompliance = totalCerts > 0 ? (validCertCount / totalCerts) * 100 : 100;
    const trainingStatus = trainingCompliance >= 90 ? 'green' : trainingCompliance >= 75 ? 'yellow' : 'red';

    // Apparatus status
    const apparatusTotal = apparatus.total;
    const apparatusOutOfService = apparatus.active_oos;
    const apparatusStatus = apparatusOutOfService === 0 ? 'green' : apparatusOutOfService === 1 ? 'yellow' : 'red';

    // Staffing: active >= 80% = green, >= 60% = yellow, else red
    const staffingPercentage = personnel.total > 0 ? (personnel.active / personnel.total) * 100 : 0;
    const staffingStatus = staffingPercentage >= 80 ? 'green' : staffingPercentage >= 60 ? 'yellow' : 'red';

    // Response time trend (optional — average response_time or dispatch_to_arrival for this month vs last)
    let responseTimeTrend = null;
    if (incidentsMonthRes.rows.length > 0 || incidentsLastMonthRes.rows.length > 0) {
      const thisMonthTimes = incidentsMonthRes.rows
        .map(r => parseFloat(r.response_time || r.dispatch_to_arrival || 0))
        .filter(t => t > 0);
      const lastMonthTimes = incidentsLastMonthRes.rows
        .map(r => parseFloat(r.response_time || r.dispatch_to_arrival || 0))
        .filter(t => t > 0);
      if (thisMonthTimes.length > 0 && lastMonthTimes.length > 0) {
        const thisMonthAvg = thisMonthTimes.reduce((a, b) => a + b, 0) / thisMonthTimes.length;
        const lastMonthAvg = lastMonthTimes.reduce((a, b) => a + b, 0) / lastMonthTimes.length;
        responseTimeTrend = {
          this_month: Math.round(thisMonthAvg),
          last_month: Math.round(lastMonthAvg),
          improving: thisMonthAvg < lastMonthAvg,
        };
      }
    }

    res.json({
      generated_at: now.toISOString(),
      personnel,
      apparatus,
      shifts: {
        this_week: shiftsWeekRes.rows.length,
      },
      incidents: {
        this_month: parseInt(incMonthRes.rows[0]?.count || 0, 10),
        ytd: parseInt(incYearRes.rows[0]?.count || 0, 10),
      },
      training: {
        expired_certs: expiredCertsRes.rows.length,
        expiring_soon: soonCertsRes.rows.length,
        valid_certs: parseInt(validCertsRes.rows[0]?.count || 0, 10),
      },
      calendar: {
        events_this_week: parseInt(eventsWeekRes.rows[0]?.count || 0, 10),
      },
      action_items: {
        meeting_drafts: parseInt(meetingDraftsRes.rows[0]?.count || 0, 10),
        open_grievances: openGrievances,
        maintenance_due: parseInt(maintenanceDueRes.rows[0]?.count || 0, 10),
        overdue_checkouts: overdueCheckouts,
      },
      leave_today: leaveTodayRes.rows.map(r => ({
        id: r.id, name: r.name, type: r.leave_type,
      })),
      alerts,
      scorecard: {
        staffing: {
          status: staffingStatus,
          active: personnel.active,
          total: personnel.total,
          percentage: Math.round(staffingPercentage),
        },
        training: {
          status: trainingStatus,
          compliance: Math.round(trainingCompliance),
        },
        apparatus: {
          status: apparatusStatus,
          inService: apparatus.in_service,
          total: apparatusTotal,
          outOfService: apparatusOutOfService,
        },
        budget: {
          status: budgetStatus,
          remaining: Math.round(budgetRemaining),
          budgeted: Math.round(totalBudget),
          spent: Math.round(totalSpent),
        },
        responseTrend: responseTimeTrend,
      },
    });
  } catch (err) {
    console.error('[dashboard/summary] error:', err);
    res.status(500).json({ error: 'Failed to generate dashboard summary' });
  }
});

module.exports = router;
