'use strict';
/**
 * routes/incidentAnalysis.js — AI-Powered Incident Intelligence
 *
 * POST /api/incident-analysis/analyze     — AI analysis of a single incident
 * POST /api/incident-analysis/trends      — AI trend analysis across incidents
 * GET  /api/incident-analysis/stats        — Quick stats for the intelligence dashboard
 *
 * (POST /narrative was removed 2026-06-10 — AI plays zero role in incident
 * narratives; officers write them directly.)
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// AI provider calls go through the ONE guarded helper (utils/aiClient): budget
// check before + usage recording after, centralized model strings, key-safe
// error mapping. Untrusted record data is wrapped via promptGuard at each call.
const { callAI, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

function parseJSON(raw) {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }
  return JSON.parse(cleaned);
}

// ── GET /stats — dashboard quick stats ──────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const sid = req.user.department_id;
    const year = new Date().getFullYear();
    const startDate = `${year}-01-01`;

    // All incidents this year
    const { rows: incidents } = await pool.query(
      'SELECT * FROM incidents WHERE department_id = $1 AND date >= $2 AND deleted_at IS NULL ORDER BY date DESC',
      [sid, startDate]
    );

    // RESPONSE-TIME ANALYSIS REMOVED — 4.1h.
    //
    // This computed `dispatchTime -> time` from free-text HH:MM columns and
    // required arr > dt. On production that filter matched ZERO of the 18 live
    // incidents, so avgResponseTime and p90Response have always been null here —
    // the route reported nothing and said nothing about reporting nothing.
    //
    // It was also the OPPOSITE direction to the other analytics route, which
    // read `time -> dispatchTime`, and it used a nearest-rank percentile while
    // that one used none at all. Three surfaces, three answers, off a column
    // (`dispatchTime`) that has no live writer at all.
    //
    // Response times now have exactly one owner: GET
    // /api/response-reports/compliance, computed from the unit-status ladder and
    // attributed to a call by its CAD run number. A second implementation of a
    // number a chief publishes is not redundancy, it is a disagreement waiting
    // to be discovered by an auditor.
    // Type breakdown
    const typeCounts = {};
    for (const inc of incidents) {
      const t = inc.type || 'Unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    // Monthly trend
    const monthlyData = {};
    for (const inc of incidents) {
      const month = inc.date?.slice(0, 7) || 'Unknown';
      monthlyData[month] = (monthlyData[month] || 0) + 1;
    }

    // Day of week distribution
    const dayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    for (const inc of incidents) {
      if (inc.date) {
        const d = new Date(inc.date + 'T12:00:00');
        if (!isNaN(d)) dayOfWeek[d.getDay()]++;
      }
    }

    // Hour of day distribution
    const hourOfDay = new Array(24).fill(0);
    for (const inc of incidents) {
      if (inc.time) {
        const h = parseInt(inc.time.split(':')[0]);
        if (!isNaN(h) && h >= 0 && h < 24) hourOfDay[h]++;
      }
    }

    // Top addresses (repeat locations)
    const addrCounts = {};
    for (const inc of incidents) {
      if (inc.address && inc.address.trim()) {
        const addr = inc.address.trim().toLowerCase();
        addrCounts[addr] = (addrCounts[addr] || { count: 0, address: inc.address, types: [] });
        addrCounts[addr].count++;
        if (!addrCounts[addr].types.includes(inc.type)) addrCounts[addr].types.push(inc.type);
      }
    }
    const repeatLocations = Object.values(addrCounts)
      .filter(a => a.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);





    res.json({
      totalIncidents: incidents.length,
      // Response times live at /api/response-reports/compliance now (4.1h).
      // These stay as explicit nulls rather than disappearing, so a client
      // reading them gets "not measured here" instead of undefined.
      avgResponseTime: null,
      p90ResponseTime: null,
      avgDuration: null,   // same: derived from the writer-less dispatchTime column
      typeCounts,
      monthlyData,
      dayOfWeek,
      hourOfDay,
      repeatLocations,
      recentIncidents: incidents.slice(0, 20).map(i => ({
        id: i.id,
        incidentNumber: i.incidentNumber,
        date: i.date,
        time: i.time,
        type: i.type,
        address: i.address,
        alarmLevel: i.alarmLevel,
        disposition: i.disposition,
        dispatchTime: i.dispatchTime,
        clearTime: i.clearTime,
        units: i.units,
        personnel: i.personnel,
      })),
    });
  } catch (err) {
    console.error('Incident analysis stats error:', err);
    res.status(500).json({ error: 'Failed to generate stats' });
  }
});

// ── POST /analyze — deep AI analysis of a single incident ───────────────────

router.post('/analyze', async (req, res) => {
  try {
    const sid = req.user.department_id;
    const { incident } = req.body;
    if (!incident) return res.status(400).json({ error: 'incident data required' });

    const systemPrompt = `You are a fire department incident analyst and post-incident review expert. Given structured data about a fire/EMS incident, produce an intelligent analysis. Return ONLY valid JSON (no markdown fences) with this structure:
{
  "summary": "2-3 sentence plain-English summary of what happened",
  "responseTimeAssessment": {
    "rating": "excellent|good|fair|slow|critical",
    "details": "specific analysis of response timing",
    "benchmark": "how this compares to NFPA standards"
  },
  "resourceDeployment": {
    "rating": "appropriate|under-resourced|over-resourced|optimal",
    "details": "analysis of units and personnel sent",
    "suggestion": "any recommended changes"
  },
  "tacticalObservations": ["observation 1", "observation 2"],
  "safetyConsiderations": ["safety point 1", "safety point 2"],
  "trainingOpportunities": ["training idea 1", "training idea 2"],
  "similarIncidentPatterns": "note any patterns if this is a repeat location or type",
  "overallGrade": "A|B|C|D|F",
  "keyTakeaway": "single most important lesson from this incident"
}
Be specific to the data provided. Reference NFPA 1710/1720 standards where relevant. For volunteer departments, use NFPA 1720 (14 minutes for suburban). Be constructive, not punitive.`;

    const result = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Incident data:\n', JSON.stringify(incident, null, 2)),
      { maxTokens: 2000, temperature: 0.4, heavy: true, meta: { stationId: sid, action: 'incident_analyze' } },
    );
    const analysis = parseJSON(result);
    res.json({ analysis });
  } catch (err) {
    if (sendAIError(res, err)) return;
    const { sanitizeAIError } = require('../config/aiModel');
    console.error('Incident analyze error:', sanitizeAIError(err.stack || err.message));
    res.status(500).json({ error: 'Analysis failed', raw: sanitizeAIError(err.message) });
  }
});

// ── POST /trends — AI trend analysis across multiple incidents ──────────────

router.post('/trends', async (req, res) => {
  try {
    const sid = req.user.department_id;
    const { rows: incidents } = await pool.query(
      'SELECT * FROM incidents WHERE department_id = $1 AND deleted_at IS NULL ORDER BY date DESC LIMIT 100',
      [sid]
    );

    if (incidents.length < 3) {
      return res.status(400).json({ error: 'Need at least 3 incidents for trend analysis' });
    }

    // Build a summary for the AI (don't send everything, just key fields)
    const incidentSummary = incidents.map(i => ({
      number: i.incidentNumber,
      date: i.date,
      time: i.time,
      type: i.type,
      alarm: i.alarmLevel,
      address: i.address,
      units: i.units,
      personnel: i.personnel,
      disposition: i.disposition,
      dispatch: i.dispatchTime,
      clear: i.clearTime,
    }));

    const systemPrompt = `You are a fire department data analyst. Given a list of recent incidents from a single fire department, identify trends, patterns, and actionable intelligence. Return ONLY valid JSON (no markdown fences):
{
  "executiveSummary": "3-5 sentence overview of department activity and key findings",
  "volumeTrend": { "direction": "increasing|decreasing|stable", "details": "specifics about call volume changes" },
  "typeAnalysis": { "dominantTypes": ["type1", "type2"], "emerging": "any new or increasing incident types", "details": "analysis" },
  "temporalPatterns": { "busyDays": "which days see most activity", "busyHours": "which hours see most activity", "seasonal": "any seasonal patterns" },
  "geographicHotspots": [{ "location": "address or area", "count": 0, "concern": "why this matters" }],
  "responsePerformance": { "trend": "improving|declining|stable", "details": "specifics about response times" },
  "resourceRecommendations": ["recommendation 1", "recommendation 2"],
  "trainingPriorities": ["priority 1", "priority 2"],
  "riskAlerts": ["alert 1 — specific risk to watch for"],
  "quarterlyGoals": ["goal 1", "goal 2", "goal 3"]
}
Be specific to the data. Reference actual incident numbers, dates, and addresses from the data. Focus on actionable intelligence, not generic advice.`;

    const result = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt(`Department incidents (most recent first, ${incidents.length} total):\n`, JSON.stringify(incidentSummary, null, 2)),
      { maxTokens: 3000, temperature: 0.4, heavy: true, meta: { stationId: sid, action: 'incident_trends' } },
    );
    const trends = parseJSON(result);
    res.json({ trends, incidentCount: incidents.length });
  } catch (err) {
    if (sendAIError(res, err)) return;
    const { sanitizeAIError } = require('../config/aiModel');
    console.error('Trend analysis error:', sanitizeAIError(err.stack || err.message));
    res.status(500).json({ error: 'Trend analysis failed', raw: sanitizeAIError(err.message) });
  }
});

// NOTE: the old POST /narrative endpoint (AI-generated NFIRS narrative) was
// removed entirely per doctrine 2026-06-10 — AI plays zero role in incident
// narratives; the officer writes them directly. Do not reintroduce.

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

module.exports = router;
