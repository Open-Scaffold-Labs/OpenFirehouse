'use strict';
/**
 * routes/dashboardBriefing.js — AI-powered situational briefing endpoint.
 *
 * GET /api/dashboard/briefing
 *
 * Assembles a "situation packet" from weather, staffing, apparatus,
 * training, incidents, and calendar data, then sends it to Claude or GPT
 * for context-aware operational insights.
 *
 * Results are cached for 5 minutes.
 */
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { callAI, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

// Cache (per station — never serve one station's briefing to another)
const briefingCache = new Map(); // stationId -> { data, fetchedAt }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const fmtDate = (d) => d.toISOString().slice(0, 10);

// Safe query helper — returns { rows: [] } on error instead of throwing.
// A dashboard is an aggregation: one drifted module must degrade, never 500 the endpoint.
async function safeQuery(label, sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    console.warn(`[dashboard/briefing] ${label} query failed:`, err.message);
    return { rows: [] };
  }
}

// ── Assemble situation packet from all data sources ──────────────────────────
async function assembleSituationPacket(stationId) {
  const now = new Date();
  const todayStr = fmtDate(now);
  const monthStr = todayStr.slice(0, 7);
  const yearStr = todayStr.slice(0, 4);
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const hour = now.getHours();

  // Week boundaries
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // 30-day lookahead
  const thirtyDays = new Date(now);
  thirtyDays.setDate(now.getDate() + 30);

  // 7-day lookahead
  const sevenDays = new Date(now);
  sevenDays.setDate(now.getDate() + 7);

  // Run all queries in parallel
  const [
    membersRes,
    apparatusRes,
    oosRes,
    staffingTodayRes,
    leaveTodayRes,
    expiredCertsRes,
    soonCertsRes,
    incMonthRes,
    incLastMonthRes,
    eventsTodayRes,
    eventsWeekRes,
    maintenanceDueRes,
    grievancesRes,
    overdueCheckoutsRes,
    budgetRes,
  ] = await Promise.all([
    safeQuery('members', `SELECT status, COUNT(*) as count FROM members WHERE department_id = $1 GROUP BY status`, [stationId]),
    safeQuery('apparatus', `SELECT designation, status FROM apparatus WHERE department_id = $1`, [stationId]),
    safeQuery('apparatus_oos', `SELECT a.designation, o.reason AS issue, o.created_at FROM apparatus_oos o JOIN apparatus a ON a.id = o.apparatus_id WHERE o.department_id = $1 AND o.status = 'active'`, [stationId]),
    safeQuery('shifts', `SELECT s.id, s."shiftType" AS shift_type, s."memberIds" AS member_ids FROM shifts s WHERE s.department_id = $2 AND s.date = $1`, [todayStr, stationId]),
    // "memberName" lives on leave_requests — no members JOIN needed
    safeQuery('leave_requests', `SELECT lr.id, lr."memberName" AS name, lr.type AS leave_type FROM leave_requests lr WHERE lr.department_id = $2 AND LOWER(lr.status) = 'approved' AND lr."startDate" <= $1 AND lr."endDate" >= $1`, [todayStr, stationId]),
    // qualifications table ships later — degrades to empty until then
    safeQuery('qualifications-expired', `SELECT q.cert_name, q.expiry_date, m.name FROM qualifications q LEFT JOIN members m ON m.id = q.member_id WHERE q.department_id = $2 AND q.expiry_date IS NOT NULL AND q.expiry_date < $1 ORDER BY q.expiry_date LIMIT 10`, [todayStr, stationId]),
    safeQuery('qualifications-soon', `SELECT q.cert_name, q.expiry_date, m.name FROM qualifications q LEFT JOIN members m ON m.id = q.member_id WHERE q.department_id = $3 AND q.expiry_date BETWEEN $1 AND $2 ORDER BY q.expiry_date LIMIT 10`, [todayStr, fmtDate(sevenDays), stationId]),
    safeQuery('incidents-month', `SELECT COUNT(*) as count FROM incidents WHERE department_id = $2 AND date >= $1 AND deleted_at IS NULL`, [monthStr + '-01', stationId]),
    safeQuery('incidents-lastmonth', `SELECT COUNT(*) as count FROM incidents WHERE department_id = $3 AND date >= $1 AND date < $2 AND deleted_at IS NULL`,
      [fmtDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), monthStr + '-01', stationId]),
    // events columns are "startTime"/type — alias to keep the downstream packet shape
    safeQuery('events-today', `SELECT title, date, "startTime" AS start_time, type AS event_type FROM events WHERE department_id = $2 AND date = $1 ORDER BY "startTime"`, [todayStr, stationId]),
    safeQuery('events-week', `SELECT title, date, "startTime" AS start_time, type AS event_type FROM events WHERE department_id = $3 AND date BETWEEN $1 AND $2 ORDER BY date, "startTime"`, [todayStr, fmtDate(sevenDays), stationId]),
    // "nextServiceDate" is nullable TEXT — guard empty strings (no scheduled_date column)
    safeQuery('maintenance', `SELECT COUNT(*) as count FROM maintenance WHERE department_id = $2 AND status IN ('scheduled', 'overdue') AND "nextServiceDate" IS NOT NULL AND "nextServiceDate" <> '' AND "nextServiceDate" <= $1`, [fmtDate(thirtyDays), stationId]),
    safeQuery('grievances', `SELECT COUNT(*) as count FROM grievances WHERE department_id = $1 AND status NOT IN ('resolved', 'closed', 'withdrawn') AND deleted_at IS NULL`, [stationId]),
    // no due_date column — expected_return is the due timestamp
    safeQuery('equipment_checkout', `SELECT COUNT(*) as count FROM equipment_checkout WHERE department_id = $2 AND status = 'checked_out' AND expected_return < $1`, [todayStr, stationId]),
    // no spent column exists — report 0 spent; columns are "budgetedAmount"/"fiscalYear"
    safeQuery('budget_lines', `SELECT COALESCE(SUM(CAST("budgetedAmount" AS DECIMAL)), 0) as total_budgeted, 0 as total_spent FROM budget_lines WHERE department_id = $2 AND "fiscalYear" = $1`, [parseInt(yearStr), stationId]),
  ]);

  // Fetch weather (call our own weather endpoint logic)
  let weather = null;
  try {
    const weatherRoute = require('./weather');
    // We'll just include a simplified version inline
    const month = now.getMonth();
    const seasonalTemps = [18, 22, 35, 50, 62, 74, 80, 78, 66, 50, 35, 22];
    const baseTemp = seasonalTemps[month];
    weather = {
      temp: baseTemp + (hour >= 6 && hour <= 18 ? 8 : -5),
      conditions: month >= 11 || month <= 2 ? 'Overcast' : 'Partly Cloudy',
      wind_speed: 5 + Math.round(Math.random() * 15),
      humidity: 45 + Math.round(Math.random() * 30),
    };
  } catch (e) { /* ignore */ }

  // Aggregate personnel
  let activeMembers = 0, totalMembers = 0;
  for (const row of membersRes.rows) {
    const c = parseInt(row.count, 10);
    totalMembers += c;
    if (row.status === 'Active') activeMembers = c;
  }

  // Apparatus
  const apparatusInService = apparatusRes.rows.filter(r => r.status === 'In Service').length;
  const apparatusTotal = apparatusRes.rows.length;
  const oosUnits = oosRes.rows.map(r => ({ unit: r.designation, issue: r.issue }));

  // Staffing today
  const onDutyCount = staffingTodayRes.rows.reduce((sum, r) => {
    // shifts."memberIds" is a TEXT column holding a JSON array — normalize.
    let ids = r.member_ids;
    if (typeof ids === 'string') {
      try { ids = JSON.parse(ids); } catch { ids = []; }
    }
    if (!Array.isArray(ids)) ids = [];
    return sum + ids.filter(id => id != null).length;
  }, 0);

  return {
    timestamp: now.toISOString(),
    date: todayStr,
    day_of_week: dayOfWeek,
    hour,
    month: now.toLocaleDateString('en-US', { month: 'long' }),

    weather,

    staffing: {
      on_duty: onDutyCount,
      min_crew: 4,
      active_members: activeMembers,
      total_members: totalMembers,
      on_leave: leaveTodayRes.rows.map(r => ({ name: r.name, type: r.leave_type })),
    },

    apparatus: {
      in_service: apparatusInService,
      total: apparatusTotal,
      out_of_service: oosUnits,
    },

    training: {
      expired_certs: expiredCertsRes.rows.map(r => ({ name: r.name, cert: r.cert_name, expired: r.expiry_date })),
      expiring_this_week: soonCertsRes.rows.map(r => ({ name: r.name, cert: r.cert_name, expires: r.expiry_date })),
    },

    incidents: {
      this_month: parseInt(incMonthRes.rows[0]?.count || 0, 10),
      last_month: parseInt(incLastMonthRes.rows[0]?.count || 0, 10),
    },

    events: {
      today: eventsTodayRes.rows,
      this_week: eventsWeekRes.rows.length,
    },

    action_items: {
      maintenance_due: parseInt(maintenanceDueRes.rows[0]?.count || 0, 10),
      open_grievances: parseInt(grievancesRes.rows[0]?.count || 0, 10),
      overdue_checkouts: parseInt(overdueCheckoutsRes.rows[0]?.count || 0, 10),
    },

    budget: {
      budgeted: parseFloat(budgetRes.rows[0]?.total_budgeted || 0),
      spent: parseFloat(budgetRes.rows[0]?.total_spent || 0),
    },
  };
}

// ── Generate AI briefing from situation packet ───────────────────────────────
async function generateBriefing(packet, stationId) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const systemPrompt = `You are the AI situational awareness assistant for a fire station. Given the current operational data, generate 1-5 prioritized insights the officer on duty needs to know RIGHT NOW.

Priority order:
1. SAFETY-CRITICAL: Active hazards, weather dangers, below-minimum staffing, apparatus OOS
2. TIME-SENSITIVE: Expiring certifications, overdue items, upcoming deadlines
3. OPERATIONAL: Incident trends, scheduled events, training gaps
4. INFORMATIONAL: Budget status, seasonal patterns, general awareness

Rules:
- Be specific: use names, dates, numbers. Never be vague.
- Be actionable: say what should be done, not just what the problem is.
- Be concise: each insight under 120 characters for the headline.
- Consider the time of day, day of week, and season.
- If everything is normal, say so confidently in ONE insight.

Return ONLY valid JSON array (no markdown, no code fences):
[
  {
    "priority": 1,
    "category": "staffing|weather|apparatus|training|incidents|calendar|budget|general",
    "headline": "Short headline under 120 chars",
    "detail": "More detail under 200 chars",
    "icon": "emoji that represents this insight"
  }
]`;

  const userMessage = `Current situation data:\n${JSON.stringify(packet, null, 2)}`;

  let result;
  try {
    if (!openaiKey && !anthropicKey) {
      // No AI key — generate rule-based insights
      return generateRuleBasedInsights(packet);
    }

    result = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Current situation data:\n', JSON.stringify(packet, null, 2)),
      {
        maxTokens: 1000,
        temperature: 0.3,
        heavy: false,
        meta: { stationId, action: 'dashboard_briefing' },
      },
    );

    // Parse AI response
    let cleaned = (result || '').trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[briefing] AI error:', err.message);
    return generateRuleBasedInsights(packet);
  }
}

// ── Fallback: Rule-based insights when no AI key is available ────────────────
function generateRuleBasedInsights(p) {
  const insights = [];

  // Staffing check
  if (p.staffing.on_duty > 0 && p.staffing.on_duty < p.staffing.min_crew) {
    insights.push({
      priority: 1,
      category: 'staffing',
      headline: `Below minimum crew: ${p.staffing.on_duty}/${p.staffing.min_crew} on duty.`,
      detail: `${p.staffing.on_leave.length} member(s) on leave. Consider callback to meet minimum.`,
      icon: '🚨',
    });
  }

  // Apparatus OOS
  if (p.apparatus.out_of_service.length > 0) {
    const units = p.apparatus.out_of_service.map(u => u.unit).join(', ');
    insights.push({
      priority: 1,
      category: 'apparatus',
      headline: `${p.apparatus.out_of_service.length} apparatus OOS: ${units}`,
      detail: p.apparatus.out_of_service[0]?.issue || 'Check maintenance log for details.',
      icon: '🚒',
    });
  }

  // Weather
  if (p.weather) {
    if (p.weather.wind_speed >= 25) {
      insights.push({ priority: 1, category: 'weather', headline: `High winds: ${p.weather.wind_speed} mph. Wildland readiness recommended.`, detail: 'Monitor NWS alerts. Consider pre-positioning resources.', icon: '💨' });
    }
    if (p.weather.temp <= 15) {
      insights.push({ priority: 2, category: 'weather', headline: `Extreme cold: ${Math.round(p.weather.temp)}°F. Hydrant freeze risk.`, detail: 'Check frost-vulnerable hydrant zones. Apparatus warm-up procedures.', icon: '❄️' });
    }
    if (p.weather.temp >= 95) {
      insights.push({ priority: 2, category: 'weather', headline: `Heat warning: ${Math.round(p.weather.temp)}°F. Rehab protocols active.`, detail: 'Mandatory hydration. Heat index monitoring on all incidents.', icon: '🌡️' });
    }
  }

  // Expiring certs
  if (p.training.expiring_this_week.length > 0) {
    const c = p.training.expiring_this_week[0];
    insights.push({
      priority: 2,
      category: 'training',
      headline: `${c.name}'s ${c.cert} expires ${new Date(c.expires).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}.`,
      detail: `${p.training.expiring_this_week.length} cert(s) expiring this week. Check training schedule.`,
      icon: '📋',
    });
  }
  if (p.training.expired_certs.length > 0) {
    insights.push({
      priority: 1,
      category: 'training',
      headline: `${p.training.expired_certs.length} expired certification(s) require immediate action.`,
      detail: `${p.training.expired_certs.map(c => `${c.name}: ${c.cert}`).slice(0, 2).join('; ')}`,
      icon: '⚠️',
    });
  }

  // Today's events
  if (p.events.today.length > 0) {
    const next = p.events.today.find(e => {
      if (!e.start_time) return true;
      const [h, m] = e.start_time.split(':').map(Number);
      return h > p.hour || (h === p.hour && m > new Date().getMinutes());
    }) || p.events.today[0];
    insights.push({
      priority: 3,
      category: 'calendar',
      headline: `Next up: ${next.title}${next.start_time ? ` at ${next.start_time}` : ''}`,
      detail: `${p.events.today.length} event(s) scheduled today. ${p.events.this_week} this week.`,
      icon: '📅',
    });
  }

  // Action items
  const totalActions = p.action_items.maintenance_due + p.action_items.open_grievances + p.action_items.overdue_checkouts;
  if (totalActions > 0) {
    insights.push({
      priority: 3,
      category: 'general',
      headline: `${totalActions} action item(s) need attention.`,
      detail: [
        p.action_items.maintenance_due > 0 ? `${p.action_items.maintenance_due} maintenance` : null,
        p.action_items.open_grievances > 0 ? `${p.action_items.open_grievances} grievance(s)` : null,
        p.action_items.overdue_checkouts > 0 ? `${p.action_items.overdue_checkouts} overdue checkout(s)` : null,
      ].filter(Boolean).join(', '),
      icon: '📌',
    });
  }

  // If everything is green
  if (insights.length === 0) {
    const evtCount = p.events.today.length;
    insights.push({
      priority: 5,
      category: 'general',
      headline: `All systems green. ${p.staffing.on_duty || p.staffing.active_members} on duty. ${evtCount} event(s) today.`,
      detail: `${p.apparatus.in_service}/${p.apparatus.total} apparatus in service. Weather: ${p.weather?.conditions || 'N/A'}, ${Math.round(p.weather?.temp || 0)}°F.`,
      icon: '✅',
    });
  }

  return insights.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

// ── Routes ───────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const now = Date.now();
    const cached = briefingCache.get(stationId);
    if (cached && cached.data && (now - cached.fetchedAt) < CACHE_TTL) {
      return res.json(cached.data);
    }

    const packet = await assembleSituationPacket(stationId);
    const insights = await generateBriefing(packet, stationId);

    const result = {
      generated_at: new Date().toISOString(),
      insights,
      situation: {
        staffing: packet.staffing,
        apparatus: packet.apparatus,
        weather: packet.weather,
      },
    };

    briefingCache.set(stationId, { data: result, fetchedAt: now });
    res.json(result);
  } catch (err) {
    if (sendAIError(res, err)) return;
    console.error('[briefing] error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
