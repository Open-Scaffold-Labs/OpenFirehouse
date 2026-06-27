const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// AI provider calls go through the ONE guarded helper (utils/aiClient): budget
// check before + usage recording after, centralized model strings, key-safe
// error mapping. Untrusted record data is wrapped via promptGuard at each call.
const { callAI, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

// Helper: Get date in YYYY-MM-DD format
function getDateString(date) {
  return date.toISOString().split('T')[0];
}

// Helper: Get next 7 days
function getNext7Days() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

// Helper: Get day of week name
function getDayOfWeek(date) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
}

// Endpoint 1: GET /api/staffing-ai/forecast - 7-day staffing forecast
router.get('/forecast', async (req, res) => {
  try {
    const days = getNext7Days();
    const forecast = [];
    const alerts = [];
    const minimumRequired = 3; // Default minimum staffing threshold

    for (const date of days) {
      const dateStr = getDateString(date);
      const dayOfWeek = getDayOfWeek(date);

      // Get scheduled shifts for this date — scoped to caller's station.
      // (W2.5 audit 2026-06-10: real schema is shifts(date TEXT, crew JSON of
      // member NAMES) — the old shift_date/member_id columns don't exist and
      // this endpoint 500'd.)
      const shiftsResult = await pool.query(
        `SELECT id, crew FROM shifts WHERE date = $1 AND department_id = $2`,
        [dateStr, req.user.department_id]
      );

      // Get leave requests for this date — scoped to caller's station
      const leaveResult = await pool.query(
        `SELECT "memberName" FROM leave_requests WHERE "startDate" <= $1 AND "endDate" >= $1 AND department_id = $2`,
        [dateStr, req.user.department_id]
      );

      const onLeave = new Set(leaveResult.rows.map(r => r.memberName));
      const crewNames = new Set();
      for (const s of shiftsResult.rows) {
        let crew = [];
        try { crew = JSON.parse(s.crew || '[]'); } catch (_) {}
        for (const name of crew) crewNames.add(name);
      }
      const scheduledMembers = [...crewNames].filter(name => !onLeave.has(name));

      const expectedCount = scheduledMembers.length;
      let status = 'Covered';
      if (expectedCount < minimumRequired) {
        status = 'Gap';
        alerts.push({
          date: dateStr,
          dayOfWeek,
          message: `Critical gap on ${dayOfWeek}: only ${expectedCount} of ${minimumRequired} minimum staffed`,
          severity: 'critical'
        });
      } else if (expectedCount <= minimumRequired + 1) {
        status = 'Tight';
      }

      forecast.push({
        date: dateStr,
        dayOfWeek,
        expectedCount,
        minimumRequired,
        status,
        gaps: expectedCount < minimumRequired ? minimumRequired - expectedCount : 0,
        scheduledMembers
      });
    }

    res.json({ forecast, alerts });
  } catch (error) {
    console.error('Forecast error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint 2: POST /api/staffing-ai/optimize - AI-powered staffing optimization
router.post('/optimize', async (req, res) => {
  try {
    const { dateRange, constraints } = req.body;
    const startDate = dateRange?.start || getDateString(new Date());
    const endDate = dateRange?.end || getDateString(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    // Pull scheduling data for the range — scoped to caller's station
    // (real schema: shifts.date TEXT — W2.5 audit 2026-06-10)
    const shiftsResult = await pool.query(
      `SELECT id, date FROM shifts WHERE date >= $1 AND date <= $2 AND department_id = $3`,
      [startDate, endDate, req.user.department_id]
    );

    const membersResult = await pool.query(
      `SELECT id, name FROM members WHERE department_id = $1`,
      [req.user.department_id]
    );
    const members = membersResult.rows;

    const leaveResult = await pool.query(
      `SELECT "memberId" FROM leave_requests WHERE "startDate" <= $1 AND "endDate" >= $2 AND department_id = $3`,
      [endDate, startDate, req.user.department_id]
    );
    const onLeave = new Set(leaveResult.rows.map(r => r.memberId));

    // Build scheduling summary for AI
    const schedulingSummary = {
      dateRange: { start: startDate, end: endDate },
      totalMembers: members.length,
      availableMembers: members.length - onLeave.size,
      scheduledShifts: shiftsResult.rows.length,
      constraints: constraints || {}
    };

    const systemPrompt = `You are an expert fire department staffing optimizer. Analyze staffing data and suggest optimal adjustments to meet coverage needs while balancing member workload.`;

    const userPrompt = `Analyze this staffing data and suggest optimizations:\n${JSON.stringify(schedulingSummary, null, 2)}\n\nProvide 3-5 specific, actionable recommendations to improve coverage.`;

    const aiRecommendations = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      { maxTokens: 4096, temperature: 0.7, heavy: false, meta: { stationId: req.user.department_id, action: 'staffing_optimize' } },
    );

    // Calculate a basic coverage score
    const expectedDaily = shiftsResult.rows.length / 7;
    const coverageScore = Math.min(100, Math.round((expectedDaily / 5) * 100));

    // Identify risk areas
    const riskAreas = [];
    if (shiftsResult.rows.length < 10) {
      riskAreas.push({ area: 'Understaffed period', description: 'Low shift coverage across date range' });
    }
    if (onLeave.size > members.length * 0.3) {
      riskAreas.push({ area: 'High leave volume', description: 'More than 30% of staff on leave during this period' });
    }

    res.json({
      recommendations: [aiRecommendations],
      coverageScore,
      riskAreas
    });
  } catch (error) {
    if (sendAIError(res, error)) return;
    console.error('Optimize error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint 3: GET /api/staffing-ai/patterns - Historical staffing pattern analysis
router.get('/patterns', async (req, res) => {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = getDateString(ninetyDaysAgo);

    // Get historical shifts data — scoped to caller's station
    // (real schema: shifts.date / incidents.date+time TEXT — W2.5 audit)
    const shiftsResult = await pool.query(
      `SELECT date FROM shifts WHERE date >= $1 AND department_id = $2 ORDER BY date`,
      [dateStr, req.user.department_id]
    );

    // Get historical incidents — scoped to caller's station
    const incidentsResult = await pool.query(
      `SELECT date, time FROM incidents WHERE date >= $1 AND department_id = $2 AND deleted_at IS NULL`,
      [dateStr, req.user.department_id]
    );

    // Analyze patterns by day of week
    const dayOfWeekStats = {};
    ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].forEach(day => {
      dayOfWeekStats[day] = { count: 0, shifts: 0 };
    });

    shiftsResult.rows.forEach(row => {
      const date = new Date(row.date);
      const day = getDayOfWeek(date);
      dayOfWeekStats[day].shifts++;
    });

    // Analyze peak hours (incidents.time is TEXT like "HH:MM")
    const peakHours = {};
    incidentsResult.rows.forEach(row => {
      const hour = parseInt(String(row.time || '').split(':')[0], 10) || 0;
      peakHours[hour] = (peakHours[hour] || 0) + 1;
    });

    const topPeakHours = Object.entries(peakHours)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour, count]) => ({ hour: parseInt(hour), incidents: count }));

    // Calculate monthly trend
    const monthlyTrend = [];
    for (let i = 0; i < 3; i++) {
      const monthStart = new Date(ninetyDaysAgo);
      monthStart.setMonth(monthStart.getMonth() + i);
      monthStart.setDate(1);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);

      const monthShifts = shiftsResult.rows.filter(row => {
        const d = new Date(row.date);
        return d >= monthStart && d <= monthEnd;
      }).length;

      monthlyTrend.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        shifts: monthShifts
      });
    }

    res.json({
      patterns: {
        dayOfWeek: dayOfWeekStats,
        monthlyTrend,
        peakHours: topPeakHours
      },
      correlations: {
        staffingVsResponse: 'Incidents increase during shift transitions (5-7 AM, 5-6 PM). Ensure adequate overlap staffing during these periods.'
      }
    });
  } catch (error) {
    console.error('Patterns error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint 4: POST /api/staffing-ai/scenario - What-if scenario modeling
router.post('/scenario', async (req, res) => {
  try {
    const { scenario } = req.body;

    if (!scenario) {
      return res.status(400).json({ error: 'Scenario description required' });
    }

    // Get current staffing data — scoped to caller's station
    const membersResult = await pool.query(
      `SELECT id, name FROM members WHERE department_id = $1`,
      [req.user.department_id]
    );
    const members = membersResult.rows;

    const currentShiftsResult = await pool.query(
      `SELECT COUNT(*) as count FROM shifts WHERE date >= $2 AND date < $3 AND department_id = $1`,
      [req.user.department_id, getDateString(new Date()), getDateString(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))]
    );
    const currentShifts = currentShiftsResult.rows[0].count;

    const systemPrompt = `You are a fire department strategic planner. Model what-if scenarios realistically, considering staffing impacts, coverage gaps, and operational implications.`;

    const userPrompt = `Current department status: ${members.length} members, ${currentShifts} shifts scheduled for next week.\n\nScenario: ${scenario}\n\nAnalyze the impact and provide recommendations.`;

    const analysis = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      { maxTokens: 4096, temperature: 0.7, heavy: false, meta: { stationId: req.user.department_id, action: 'staffing_scenario' } },
    );

    const impact = {
      estimatedCoverageChange: scenario.includes('leave') ? -15 : scenario.includes('add') ? 20 : 0,
      operationalRisk: scenario.includes('leave') ? 'Increased' : 'Normal',
      affectedShifts: 'Days 3-5 of forecast'
    };

    res.json({
      analysis,
      impact,
      recommendations: [
        'Review critical shift coverage',
        'Activate backup protocols if needed',
        'Monitor incident response times'
      ]
    });
  } catch (error) {
    if (sendAIError(res, error)) return;
    console.error('Scenario error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint 5: GET /api/staffing-ai/burnout - Member workload/burnout risk analysis
router.get('/burnout', async (req, res) => {
  try {
    // Scoped to caller's station — burnout analysis only across this department's members
    const membersResult = await pool.query(
      `SELECT id, name FROM members WHERE department_id = $1`,
      [req.user.department_id]
    );
    const members = membersResult.rows;

    const atRisk = [];
    const healthy = [];
    let totalHours = 0;
    let maxHours = 0;
    const responderCounts = {};

    // W2.5 audit (2026-06-10): real schema — shifts(date TEXT, crew = JSON
    // array of member NAMES, no member_id) and incident_responses(member_name,
    // responded_at). Fetch once, count in JS (also kills the per-member N+1).
    const thirtyDaysAgo = getDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const sevenDaysAgo  = getDateString(new Date(Date.now() -  7 * 24 * 60 * 60 * 1000));
    const recentShifts = await pool.query(
      `SELECT date, crew FROM shifts WHERE date >= $1 AND department_id = $2`,
      [thirtyDaysAgo, req.user.department_id]
    );
    const crews = recentShifts.rows.map(r => {
      let crew = [];
      try { crew = JSON.parse(r.crew || '[]'); } catch (_) {}
      return { date: r.date, crew: new Set(crew) };
    });
    // P3/P4: count responses by the STABLE member_id where present, falling back
    // to name only for legacy/unlinked rows. This stops a duplicate name (Nathan
    // McGee vs Nathan P. McGee) from being double-counted or mis-attributed.
    const responsesResult = await pool.query(
      `SELECT member_id, member_name, COUNT(*) AS count
       FROM incident_responses
       WHERE responded_at >= CURRENT_DATE - INTERVAL '30 days' AND department_id = $1
       GROUP BY member_id, member_name`,
      [req.user.department_id]
    );
    const responsesById = {};
    const responsesByName = {};
    for (const r of responsesResult.rows) {
      const n = parseInt(r.count, 10);
      if (r.member_id != null) responsesById[r.member_id] = (responsesById[r.member_id] || 0) + n;
      else responsesByName[r.member_name] = (responsesByName[r.member_name] || 0) + n;
    }

    // Analyze each member's workload
    for (const member of members) {
      // Shift hours (approximating 12 hours per shift for fire departments)
      const shiftCount = crews.filter(s => s.crew.has(member.name)).length;
      const hoursThisMonth = shiftCount * 12;
      totalHours += hoursThisMonth;

      // Shifts in the last 7 days
      const consecutiveShifts = crews.filter(s => s.date >= sevenDaysAgo && s.crew.has(member.name)).length;

      // Incident responses — prefer the STABLE member_id link (P3), fall back to
      // name only for legacy/unlinked rows.
      const incidentResponses = responsesById[member.id] || responsesByName[member.name] || 0;

      responderCounts[member.name] = incidentResponses;

      if (maxHours < hoursThisMonth) {
        maxHours = hoursThisMonth;
      }

      // Determine risk level
      const riskScore = (hoursThisMonth / 160) + (consecutiveShifts / 14) + (incidentResponses / 20);
      const riskLevel = riskScore > 1.5 ? 'Critical' : riskScore > 1 ? 'High' : 'Normal';

      const memberData = {
        name: member.name,
        hoursThisMonth,
        consecutiveShifts,
        incidentResponses,
        riskLevel
      };

      if (riskLevel !== 'Normal') {
        atRisk.push(memberData);
      } else {
        healthy.push(memberData);
      }
    }

    const avgHoursPerWeek = members.length ? Math.round(totalHours / members.length / 4) : 0;
    const topResponders = Object.entries(responderCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, incidents: count }));

    res.json({
      atRisk: atRisk.sort((a, b) => {
        const riskOrder = { Critical: 0, High: 1, Normal: 2 };
        return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      }),
      healthy,
      stats: {
        avgHoursPerWeek,
        maxHoursThisMonth: maxHours,
        topResponders
      }
    });
  } catch (error) {
    console.error('Burnout error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
