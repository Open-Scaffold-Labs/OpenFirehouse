const { pool } = require('../db');
const express = require('express');
const router = express.Router();

// AI provider calls go through the ONE guarded helper (utils/aiClient): budget
// check before + usage recording after, centralized model strings, key-safe
// error mapping. Untrusted record data is wrapped via promptGuard at each call.
const { callAI, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

// POST /api/report-writer/after-action - Generate after-action report
router.post('/after-action', async (req, res) => {
  try {
    const { incidentId } = req.body;

    if (!incidentId) {
      return res.status(400).json({ error: 'incidentId is required' });
    }

    // Pull incident data — scoped to caller's station
    const incidentResult = await pool.query(
      'SELECT * FROM incidents WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
      [incidentId, req.user.department_id]
    );

    if (incidentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const incident = incidentResult.rows[0];

    // Pull related responses — scoped to caller's station
    const responsesResult = await pool.query(
      'SELECT * FROM incident_responses WHERE incident_id = $1 AND department_id = $2 ORDER BY arrival_time ASC',
      [incidentId, req.user.department_id]
    );

    const responses = responsesResult.rows || [];

    // Pull incident costs — scoped to caller's station
    const costsResult = await pool.query(
      'SELECT * FROM incident_costs WHERE incident_id = $1 AND department_id = $2',
      [incidentId, req.user.department_id]
    );

    const costs = costsResult.rows || [];

    // Prepare data for AI
    const incidentData = {
      title: incident.title,
      type: incident.type,
      date: incident.date,
      time: incident.time,
      location: incident.location,
      description: incident.description,
      units_dispatched: incident.units_dispatched,
      personnel_involved: incident.personnel_involved,
      duration_minutes: incident.duration_minutes,
      injuries: incident.injuries,
      fatalities: incident.fatalities
    };

    const userPrompt = `Generate a professional after-action report for the following incident:

Incident Details:
${JSON.stringify(incidentData, null, 2)}

Response Information (${responses.length} units):
${responses.map((r, i) => `Unit ${i + 1}: ${r.unit_name}, Arrived: ${r.arrival_time}, Departed: ${r.departure_time}`).join('\n')}

Cost Information:
${costs.length > 0 ? costs.map(c => `${c.category}: $${c.amount}`).join('\n') : 'No cost data recorded'}

Create a structured report with these sections:
1. Executive Summary (2-3 sentences)
2. Incident Overview (type, location, date/time, weather if known)
3. Response Timeline (chronological sequence of events)
4. Response Analysis (unit deployment, response times, effectiveness)
5. Resource Deployment (personnel and equipment used)
6. Lessons Learned (what worked well, what could improve)
7. Recommendations (actionable improvements for future incidents)

Format the response as valid JSON with structure: { sections: [{ heading: "...", content: "..." }, ...] }`;

    const systemPrompt = 'You are an expert fire department report writer. Generate professional, well-structured after-action reports that are clear, factual, and actionable. Always respond with valid JSON.';

    const reportContent = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      { maxTokens: 4096, temperature: 0.7, heavy: false, meta: { stationId: req.user.department_id, action: 'report_after_action' } },
    );

    // Parse AI response
    let parsedReport;
    try {
      parsedReport = JSON.parse(reportContent);
    } catch (e) {
      // If JSON parsing fails, create sections from the text
      parsedReport = {
        sections: [
          {
            heading: 'Report Content',
            content: reportContent
          }
        ]
      };
    }

    const report = {
      title: `After-Action Report: ${incident.title}`,
      date: new Date().toISOString().split('T')[0],
      type: 'After-Action Report',
      sections: parsedReport.sections || []
    };

    res.json({ report });
  } catch (error) {
    if (sendAIError(res, error)) return;
    console.error('After-action report generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/report-writer/monthly - Generate monthly department report
router.post('/monthly', async (req, res) => {
  try {
    const now = new Date();
    const { month = now.getMonth() + 1, year = now.getFullYear() } = req.body;

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);

    // Pull incident count — scoped to caller's station
    const incidentsResult = await pool.query(
      'SELECT COUNT(*) as count, COALESCE(SUM(personnel_involved), 0) as total_personnel FROM incidents WHERE DATE(date) >= $1 AND DATE(date) <= $2 AND department_id = $3 AND deleted_at IS NULL',
      [monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0], req.user.department_id]
    );

    const incidentStats = incidentsResult.rows[0] || { count: 0, total_personnel: 0 };

    // Pull training hours — scoped to caller's station
    const trainingResult = await pool.query(
      'SELECT COUNT(*) as sessions, COALESCE(SUM(hours), 0) as total_hours FROM training WHERE DATE(date) >= $1 AND DATE(date) <= $2 AND department_id = $3',
      [monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0], req.user.department_id]
    );

    const trainingStats = trainingResult.rows[0] || { sessions: 0, total_hours: 0 };

    // Pull apparatus status — scoped to caller's station
    const apparatusResult = await pool.query(
      'SELECT status, COUNT(*) as count FROM apparatus WHERE department_id = $1 GROUP BY status',
      [req.user.department_id]
    );

    const apparatusStatus = {};
    (apparatusResult.rows || []).forEach(row => {
      apparatusStatus[row.status] = row.count;
    });

    // Pull member activity — scoped to caller's station
    const memberResult = await pool.query(
      'SELECT COUNT(DISTINCT member_id) as active_members FROM incident_responses WHERE DATE(created_at) >= $1 AND DATE(created_at) <= $2 AND department_id = $3',
      [monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0], req.user.department_id]
    );

    const memberStats = memberResult.rows[0] || { active_members: 0 };

    const stats = {
      incidentCount: parseInt(incidentStats.count),
      totalPersonnelDeployed: parseInt(incidentStats.total_personnel),
      trainingHours: parseFloat(trainingStats.total_hours),
      trainingSessions: parseInt(trainingStats.sessions),
      activeMembers: parseInt(memberStats.active_members),
      apparatusStatus
    };

    // Generate AI analysis
    const monthName = monthStart.toLocaleString('default', { month: 'long' });
    const userPrompt = `Generate a professional monthly report summary for our fire department for ${monthName} ${year}.

Key Statistics:
- Incidents Responded: ${stats.incidentCount}
- Total Personnel Deployed: ${stats.totalPersonnelDeployed}
- Training Hours Completed: ${stats.trainingHours}
- Training Sessions: ${stats.trainingSessions}
- Active Members: ${stats.activeMembers}
- Apparatus Status: ${JSON.stringify(stats.apparatusStatus)}

Create a report with these sections:
1. Executive Summary (key highlights and overall performance)
2. Operational Analysis (incident trends, response capability)
3. Training & Development (training activities, member engagement)
4. Equipment & Resources (apparatus status, resource notes)
5. Outlook & Priorities (upcoming focus areas, recommendations)

Format as JSON: { sections: [{ heading: "...", content: "..." }, ...] }`;

    const systemPrompt = 'You are a fire department management report expert. Generate professional monthly reports that highlight achievements, identify trends, and provide actionable insights. Always respond with valid JSON.';

    const reportContent = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      { maxTokens: 4096, temperature: 0.7, heavy: false, meta: { stationId: req.user.department_id, action: 'report_monthly' } },
    );

    let parsedReport;
    try {
      parsedReport = JSON.parse(reportContent);
    } catch (e) {
      parsedReport = {
        sections: [
          {
            heading: 'Monthly Summary',
            content: reportContent
          }
        ]
      };
    }

    const report = {
      title: `Monthly Report: ${monthName} ${year}`,
      period: `${monthName} ${year}`,
      sections: parsedReport.sections || [],
      stats
    };

    res.json({ report });
  } catch (error) {
    if (sendAIError(res, error)) return;
    console.error('Monthly report generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/report-writer/executive-summary - Generate executive summary
router.post('/executive-summary', async (req, res) => {
  try {
    const { title, context, data } = req.body;

    if (!title || !context) {
      return res.status(400).json({ error: 'title and context are required' });
    }

    const userPrompt = `Create a professional executive summary with the following details:

Title: ${title}
Context: ${context}

Data/Details:
${data || 'No additional data provided'}

Generate a response with:
1. A concise executive summary (3-4 sentences)
2. Key points (3-5 bullet points)
3. Recommendations (2-4 actionable items)

Format as JSON: { summary: "...", keyPoints: [...], recommendations: [...] }`;

    const systemPrompt = 'You are an executive report writer. Generate clear, professional executive summaries with key points and recommendations. Respond with valid JSON.';

    const summaryContent = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      { maxTokens: 4096, temperature: 0.7, heavy: false, meta: { stationId: req.user.department_id, action: 'report_executive_summary' } },
    );

    let parsedSummary;
    try {
      parsedSummary = JSON.parse(summaryContent);
    } catch (e) {
      parsedSummary = {
        summary: summaryContent,
        keyPoints: [],
        recommendations: []
      };
    }

    res.json({
      summary: parsedSummary.summary || '',
      keyPoints: Array.isArray(parsedSummary.keyPoints) ? parsedSummary.keyPoints : [],
      recommendations: Array.isArray(parsedSummary.recommendations) ? parsedSummary.recommendations : []
    });
  } catch (error) {
    if (sendAIError(res, error)) return;
    console.error('Executive summary generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/report-writer/mutual-aid - Generate mutual aid activity report
router.post('/mutual-aid', async (req, res) => {
  try {
    const { daysBack = 30 } = req.body;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Query mutual aid table — scoped to caller's station
    const mutualAidResult = await pool.query(
      'SELECT * FROM mutual_aid WHERE DATE(date) >= $1 AND department_id = $2 ORDER BY date DESC',
      [startDate.toISOString().split('T')[0], req.user.department_id]
    );

    const mutualAidData = mutualAidResult.rows || [];

    // Count given vs received
    const given = mutualAidData.filter(m => m.type === 'given').length;
    const received = mutualAidData.filter(m => m.type === 'received').length;

    const userPrompt = `Generate a mutual aid activity report for the past ${daysBack} days.

Mutual Aid Activities:
- Aid Given: ${given} instances
- Aid Received: ${received} instances
- Total Activities: ${mutualAidData.length}

Recent Activities:
${mutualAidData.slice(0, 10).map(m => `${m.date}: ${m.type.toUpperCase()} - ${m.description}`).join('\n')}

Create a report with sections:
1. Executive Summary (overview of mutual aid activity)
2. Activity Breakdown (analysis of given vs received aid)
3. Patterns & Insights (trends, frequently helped agencies, mutual aid partners)
4. Recommendations (how to strengthen mutual aid relationships)

Format as JSON: { sections: [{ heading: "...", content: "..." }, ...] }`;

    const systemPrompt = 'You are a fire department mutual aid coordinator. Generate professional reports that highlight mutual aid relationships and activities, analyze patterns, and provide recommendations for strengthening mutual aid networks.';

    const reportContent = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      { maxTokens: 4096, temperature: 0.7, heavy: false, meta: { stationId: req.user.department_id, action: 'report_mutual_aid' } },
    );

    let parsedReport;
    try {
      parsedReport = JSON.parse(reportContent);
    } catch (e) {
      parsedReport = {
        sections: [
          {
            heading: 'Mutual Aid Report',
            content: reportContent
          }
        ]
      };
    }

    const report = {
      title: `Mutual Aid Report - Last ${daysBack} Days`,
      sections: parsedReport.sections || [],
      stats: {
        given,
        received,
        total: mutualAidData.length
      }
    };

    res.json({ report });
  } catch (error) {
    if (sendAIError(res, error)) return;
    console.error('Mutual aid report generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
