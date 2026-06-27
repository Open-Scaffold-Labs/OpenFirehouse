'use strict';
/**
 * aiActionRegistry.js — Central registry of all contextual AI actions
 *
 * Each action defines:
 *   systemPrompt   — The AI system prompt
 *   buildContext()  — Async function that enriches data from the DB
 *   formatResult()  — Transforms the raw AI response before sending to client
 *   maxTokens       — Token limit for this action
 *   temperature     — Model temperature (default 0.4)
 *   responseFormat  — "text" | "json" (default "text")
 */

const { pool } = require('../db');

// ── Action definitions ──────────────────────────────────────────────────────

const actions = {

  // ═══════════════════════════════════════════════════════════════════════════
  // INCIDENT LOG
  // ═══════════════════════════════════════════════════════════════════════════

  // DOCTRINE (Matt, 2026-06-10): AI never writes incident narratives. This
  // action auto-fills FACTS only (type, address, units, personnel, times,
  // alarm level, disposition, confidence) — the narrative (incidents.notes,
  // the NERIS/NFIRS legal record) is written entirely by the officer.
  ai_log_incident: {
    systemPrompt: `You are a fire department incident logging AI. You have been given REAL DATA from the station's systems — radio logs, CAD dispatch alerts, command board status, who's on duty, apparatus status, and pre-plan intelligence. Your job is to assemble the FACTUAL fields of an incident form from this data. Do NOT write a narrative — the incident narrative is written by the officer, never by AI.

Return ONLY valid JSON (no markdown fences) with this structure:
{
  "type": "one of: Structure Fire, Vehicle Fire, Brush / Wildland Fire, Dumpster / Rubbish Fire, Vehicle Accident, Technical Rescue, Water Rescue, Medical / EMS, Hazmat, Gas Leak, Public Assist, False Alarm, Mutual Aid, Other",
  "alarmLevel": "one of: Still, Working, 2nd Alarm, 3rd Alarm, General Alarm",
  "address": "full street address from CAD or radio",
  "disposition": "one of: Controlled / Extinguished, Patient Transported, Patient Refused Transport, Cancelled En Route, No Action Required, Referred to Other Agency, Investigated / Unfounded, Mutual Aid Given, Mutual Aid Received",
  "injuries": 0,
  "units": ["exact apparatus names from the station's apparatus list that responded"],
  "personnel": ["exact member names from the duty roster who were on duty/responded"],
  "dispatchTime": "HH:MM from CAD timestamp if available",
  "time": "HH:MM — arrival or incident time from radio/CAD",
  "confidence": "high|medium|low — how confident you are in the auto-fill based on available data"
}

RULES:
- Use EXACT apparatus names and member names from the provided lists — do not invent names
- Cross-reference CAD alerts with radio logs to build the timeline
- If command board is active, use its data as primary source
- Personnel should include everyone on today's duty roster who would have responded
- Do NOT include a "notes" field or any narrative prose — narratives are officer-written only
- Infer alarm level from number of units dispatched (1 unit = Still, 2+ = Working, 4+ = 2nd Alarm)
- Infer disposition from the most recent radio traffic (e.g., "all clear" = Controlled/Extinguished)
- If data is sparse, still fill in everything you can and set confidence to "low"`,
    buildContext: async ({ data, stationId }) => {
      const today = new Date().toISOString().slice(0, 10);
      const context = {};

      // 1. Latest CAD/dispatch alerts
      try {
        const { rows: cadAlerts } = await pool.query(
          'SELECT * FROM cad_alerts WHERE department_id = $1 ORDER BY dispatched_at DESC LIMIT 5',
          [stationId]
        );
        context.cadAlerts = cadAlerts;
      } catch { context.cadAlerts = []; }

      // 2. Recent radio logs (last 30 minutes of traffic)
      try {
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { rows: radioLogs } = await pool.query(
          'SELECT timestamp, talkgroup, transcript, is_dispatch, priority FROM radio_log WHERE department_id = $1 AND timestamp >= $2 ORDER BY timestamp ASC',
          [stationId, thirtyMinsAgo]
        );
        context.radioLogs = radioLogs;
      } catch { context.radioLogs = []; }

      // 3. Active command board
      try {
        const { rows: board } = await pool.query(
          'SELECT * FROM active_boards WHERE department_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
          [stationId, 'active']
        );
        context.activeBoard = board[0] || null;
      } catch { context.activeBoard = null; }

      // 4. Who's on duty today
      try {
        const { rows: staffing } = await pool.query(
          'SELECT member_name, member_rank, position, apparatus_name, status FROM daily_staffing WHERE department_id = $1 AND date = $2',
          [stationId, today]
        );
        if (staffing.length > 0) {
          context.dutyRoster = staffing;
        } else {
          // Fall back to shifts table
          const { rows: shifts } = await pool.query(
            'SELECT s.*, m.name as member_name, m.rank FROM shifts s LEFT JOIN members m ON s.member = m.name AND m.department_id = $1 WHERE s.department_id = $1 AND s.date = $2',
            [stationId, today]
          );
          context.dutyRoster = shifts.map(s => ({ member_name: s.member || s.member_name, member_rank: s.rank, position: s.shiftType || s.shift_type }));
        }
      } catch { context.dutyRoster = []; }

      // 5. Apparatus status
      try {
        const { rows: apparatus } = await pool.query(
          'SELECT name, type, status FROM apparatus WHERE department_id = $1 ORDER BY name',
          [stationId]
        );
        context.apparatus = apparatus;
      } catch { context.apparatus = []; }

      // 6. All active members (for name matching)
      try {
        const { rows: members } = await pool.query(
          'SELECT name, rank FROM members WHERE department_id = $1 AND status IN ($2, $3) ORDER BY name',
          [stationId, 'Active', 'Probationary']
        );
        context.allMembers = members;
      } catch { context.allMembers = []; }

      // 7. Pre-plan match (if we have an address from CAD)
      if (context.cadAlerts?.[0]?.address) {
        try {
          const addr = context.cadAlerts[0].address;
          const { rows: plans } = await pool.query(
            'SELECT "occupancyName", address, "occupancyType", "riskLevel", "constructionType", hazards, "waterSupply" FROM pre_plans WHERE department_id = $1 AND LOWER(address) LIKE $2 LIMIT 1',
            [stationId, `%${addr.split(',')[0].trim().toLowerCase()}%`]
          );
          context.matchedPrePlan = plans[0] || null;
        } catch { context.matchedPrePlan = null; }
      }

      // 8. Incident responses (who clicked "responding")
      try {
        const { rows: responses } = await pool.query(
          'SELECT member_name, status, responded_at FROM incident_responses WHERE department_id = $1 ORDER BY responded_at DESC LIMIT 20',
          [stationId]
        );
        context.incidentResponses = responses;
      } catch { context.incidentResponses = []; }

      // Include any additional user context (e.g., a quick note)
      if (data?.note) context.userNote = data.note;

      return JSON.stringify(context, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2000,
    temperature: 0.2,
    responseFormat: 'json',
  },

  analyze_incident: {
    systemPrompt: `You are a fire department incident analyst and post-incident review expert. Given structured data about a fire/EMS incident, produce an intelligent analysis. Return ONLY valid JSON (no markdown fences) with this structure:
{
  "summary": "2-3 sentence plain-English summary",
  "responseTimeAssessment": { "rating": "excellent|good|fair|slow", "details": "specific timing analysis", "benchmark": "NFPA comparison" },
  "resourceDeployment": { "rating": "appropriate|under-resourced|over-resourced", "details": "units/personnel analysis", "suggestion": "recommendation" },
  "tacticalObservations": ["observation 1", "observation 2"],
  "safetyConsiderations": ["safety point 1"],
  "trainingOpportunities": ["training idea 1"],
  "overallGrade": "A|B|C|D|F",
  "keyTakeaway": "single most important lesson"
}
Be specific to the data provided. Reference NFPA 1710/1720 standards. For volunteer departments, use NFPA 1720. Be constructive.`,
    buildContext: async ({ record_id, data, stationId }) => {
      if (data) return JSON.stringify(data, null, 2);
      if (record_id) {
        const { rows } = await pool.query('SELECT * FROM incidents WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [record_id, stationId]);
        return JSON.stringify(rows[0] || {}, null, 2);
      }
      return '{}';
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2000,
    temperature: 0.4,
    responseFormat: 'json',
  },

  // DOCTRINE (Matt, 2026-06-10): the draft_narrative action was removed
  // entirely. AI plays zero role in incident narratives — they are written
  // by the officer directly. Do not reintroduce.

  incident_trends: {
    systemPrompt: `You are a fire department data analyst. Given a list of recent incidents, identify trends, patterns, and actionable intelligence. Return ONLY valid JSON:
{
  "executiveSummary": "3-5 sentence overview",
  "volumeTrend": { "direction": "increasing|decreasing|stable", "details": "specifics" },
  "typeAnalysis": { "dominantTypes": [], "emerging": "description" },
  "temporalPatterns": { "busyDays": "", "busyHours": "", "seasonal": "" },
  "geographicHotspots": [{ "location": "", "count": 0, "concern": "" }],
  "resourceRecommendations": [],
  "trainingPriorities": [],
  "riskAlerts": []
}
Be specific — reference actual data.`,
    buildContext: async ({ stationId }) => {
      const { rows } = await pool.query(
        'SELECT id, "incidentNumber", date, time, type, "alarmLevel", address, units, personnel, disposition, "dispatchTime", "clearTime" FROM incidents WHERE department_id = $1 AND deleted_at IS NULL ORDER BY date DESC LIMIT 100',
        [stationId]
      );
      return JSON.stringify(rows, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 3000,
    temperature: 0.5,
    responseFormat: 'json',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAINING RECORDS
  // ═══════════════════════════════════════════════════════════════════════════

  recommend_training: {
    systemPrompt: `You are a fire department training officer AI assistant. Given a member's training history and qualifications, recommend specific courses, certifications, or drills they should complete. Return ONLY valid JSON:
{
  "memberSummary": "1-2 sentence summary of current training status",
  "recommendations": [
    { "course": "course name", "priority": "high|medium|low", "reason": "why this is needed", "deadline": "suggested timeline" }
  ],
  "complianceGaps": ["gap 1", "gap 2"],
  "strengthAreas": ["strength 1"],
  "overallReadiness": "excellent|good|fair|needs-improvement"
}
Focus on NFPA standards, state requirements, and practical skill development.`,
    buildContext: async ({ record_id, stationId }) => {
      // record_id is the member id
      const { rows: training } = await pool.query(
        'SELECT * FROM training WHERE department_id = $1 AND member = (SELECT name FROM members WHERE id = $2 AND department_id = $1) ORDER BY date DESC LIMIT 50',
        [stationId, record_id]
      );
      const { rows: quals } = await pool.query(
        'SELECT * FROM member_qualifications WHERE department_id = $1 AND member_id = $2',
        [stationId, record_id]
      );
      const { rows: member } = await pool.query(
        'SELECT name, rank, badge, status FROM members WHERE id = $1 AND department_id = $2',
        [record_id, stationId]
      );
      return JSON.stringify({ member: member[0], trainingHistory: training, qualifications: quals }, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2000,
    temperature: 0.5,
    responseFormat: 'json',
  },

  training_compliance_check: {
    systemPrompt: `You are a fire department compliance analyst. Given the department's training records, assess overall compliance status. Return ONLY valid JSON:
{
  "overallScore": 85,
  "summary": "2-3 sentence compliance overview",
  "criticalGaps": [{ "area": "gap area", "affectedMembers": 3, "requirement": "NFPA/state requirement", "urgency": "immediate|soon|planned" }],
  "upcomingDeadlines": [{ "certification": "cert name", "membersExpiring": 2, "deadline": "date" }],
  "recommendations": ["action 1", "action 2"]
}
Reference NFPA 1001, 1002, 1021, 1500 and typical state firefighter certification requirements.`,
    buildContext: async ({ stationId }) => {
      const { rows: training } = await pool.query(
        'SELECT * FROM training WHERE department_id = $1 ORDER BY date DESC LIMIT 200',
        [stationId]
      );
      const { rows: quals } = await pool.query(
        'SELECT mq.*, m.name, m.rank FROM member_qualifications mq JOIN members m ON mq.member_id = m.id WHERE mq.department_id = $1',
        [stationId]
      );
      const { rows: members } = await pool.query(
        'SELECT id, name, rank, status FROM members WHERE department_id = $1 AND status = $2',
        [stationId, 'Active']
      );
      return JSON.stringify({ members, recentTraining: training, qualifications: quals }, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2500,
    temperature: 0.4,
    responseFormat: 'json',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-INCIDENT PLANS
  // ═══════════════════════════════════════════════════════════════════════════

  enhance_preplan: {
    systemPrompt: `You are a fire service pre-incident planning expert. Given an existing pre-plan, suggest enhancements to improve tactical readiness. Return ONLY valid JSON:
{
  "currentAssessment": "Brief assessment of the existing plan",
  "suggestedEnhancements": [
    { "area": "area name", "current": "what exists", "suggested": "what to add/change", "priority": "high|medium|low" }
  ],
  "hazardWarnings": ["hazard 1", "hazard 2"],
  "tacticalConsiderations": ["consideration 1"],
  "waterSupplyNotes": "water supply analysis",
  "accessEgressNotes": "access/egress points"
}
Reference NFPA 1620 (Standard for Pre-Incident Planning). Be specific to the building type and occupancy.`,
    buildContext: async ({ record_id, data, stationId }) => {
      if (data) return JSON.stringify(data, null, 2);
      if (record_id) {
        const { rows } = await pool.query('SELECT * FROM pre_plans WHERE id = $1 AND department_id = $2', [record_id, stationId]);
        return JSON.stringify(rows[0] || {}, null, 2);
      }
      return '{}';
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2500,
    temperature: 0.5,
    responseFormat: 'json',
  },

  generate_sizeup: {
    systemPrompt: `You are a fire ground tactical expert. Given a pre-incident plan, generate a tactical size-up checklist that an officer can reference during response. Return ONLY valid JSON:
{
  "buildingSummary": "1-2 sentence overview",
  "initialActions": ["action 1", "action 2"],
  "hazards": [{ "type": "hazard type", "location": "where", "mitigation": "how to handle" }],
  "waterSupply": { "primary": "description", "secondary": "backup options" },
  "ventilation": "ventilation strategy",
  "exposures": ["exposure 1"],
  "rics": "RIC/RIT staging recommendation",
  "commandPost": "suggested CP location",
  "evacuationSignals": "PAR/evac protocol notes"
}
Keep it tactical and field-usable. This is for officers on scene.`,
    buildContext: async ({ record_id, data, stationId }) => {
      if (data) return JSON.stringify(data, null, 2);
      if (record_id) {
        const { rows } = await pool.query('SELECT * FROM pre_plans WHERE id = $1 AND department_id = $2', [record_id, stationId]);
        return JSON.stringify(rows[0] || {}, null, 2);
      }
      return '{}';
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2000,
    temperature: 0.3,
    responseFormat: 'json',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STAFFING / DUTY SCHEDULE
  // ═══════════════════════════════════════════════════════════════════════════

  forecast_staffing: {
    systemPrompt: `You are a fire department staffing analyst. Given current schedule data, leave requests, and historical patterns, forecast staffing gaps for the next 7 days. Return ONLY valid JSON:
{
  "forecast": [
    { "date": "YYYY-MM-DD", "day": "Monday", "projected": 12, "minimum": 10, "status": "adequate|tight|critical", "notes": "any concerns" }
  ],
  "alerts": ["alert 1 — specific shortage risk"],
  "overtimeEstimate": "estimated OT hours needed",
  "recommendations": ["recommendation 1"]
}
Consider minimum staffing requirements, typical sick call patterns, and any upcoming events.`,
    buildContext: async ({ stationId }) => {
      const today = new Date().toISOString().slice(0, 10);
      const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const { rows: shifts } = await pool.query(
        'SELECT * FROM shifts WHERE department_id = $1 AND date >= $2 AND date <= $3 ORDER BY date',
        [stationId, today, weekOut]
      );
      const { rows: leave } = await pool.query(
        'SELECT * FROM leave_requests WHERE department_id = $1 AND status = $2 AND start_date <= $3 AND end_date >= $4',
        [stationId, 'approved', weekOut, today]
      );
      const { rows: members } = await pool.query(
        'SELECT id, name, rank, status FROM members WHERE department_id = $1 AND status = $2',
        [stationId, 'Active']
      );
      return JSON.stringify({ shifts, approvedLeave: leave, activeMembers: members, dateRange: { from: today, to: weekOut } }, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2000,
    temperature: 0.4,
    responseFormat: 'json',
  },

  optimize_schedule: {
    systemPrompt: `You are a fire department scheduling optimization expert. Given current shift assignments, leave requests, and member qualifications, suggest schedule adjustments to optimize coverage and fairness. Return ONLY valid JSON:
{
  "summary": "Overview of current schedule state",
  "issues": [{ "type": "gap|imbalance|compliance", "details": "specific issue", "severity": "high|medium|low" }],
  "swapSuggestions": [{ "date": "", "current": "member name", "suggested": "replacement", "reason": "" }],
  "overtimeReduction": "ideas to reduce OT",
  "fairnessScore": 75,
  "notes": "additional observations"
}`,
    buildContext: async ({ stationId }) => {
      const today = new Date().toISOString().slice(0, 10);
      const monthOut = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const { rows: shifts } = await pool.query(
        'SELECT * FROM shifts WHERE department_id = $1 AND date >= $2 AND date <= $3 ORDER BY date',
        [stationId, today, monthOut]
      );
      const { rows: members } = await pool.query(
        'SELECT id, name, rank, status FROM members WHERE department_id = $1 AND status = $2',
        [stationId, 'Active']
      );
      return JSON.stringify({ shifts, members, period: { from: today, to: monthOut } }, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2500,
    temperature: 0.5,
    responseFormat: 'json',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRIEVANCES
  // ═══════════════════════════════════════════════════════════════════════════

  summarize_grievance: {
    systemPrompt: `You are a labor relations specialist familiar with fire department collective bargaining agreements. Given a grievance record, provide a neutral, factual summary and analysis. Return ONLY valid JSON:
{
  "summary": "Clear 2-3 sentence summary of the grievance",
  "keyFacts": ["fact 1", "fact 2"],
  "contractReferences": ["relevant CBA section"],
  "precedentNotes": "any common precedents for this type of grievance",
  "riskAssessment": "low|moderate|high — likelihood of escalation",
  "suggestedNextSteps": ["step 1", "step 2"],
  "timelineConcerns": "any deadline or timing issues"
}
Be neutral and factual. Do not take sides. Reference standard labor relations practices.`,
    buildContext: async ({ record_id, data, stationId }) => {
      if (data) return JSON.stringify(data, null, 2);
      if (record_id) {
        const { rows } = await pool.query('SELECT * FROM grievances WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [record_id, stationId]);
        return JSON.stringify(rows[0] || {}, null, 2);
      }
      return '{}';
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2000,
    temperature: 0.3,
    responseFormat: 'json',
  },

  draft_grievance_response: {
    systemPrompt: `You are a fire department management representative drafting a formal response to a grievance. Write a professional, neutral response that:
- Acknowledges the grievance
- States the department's position
- References relevant CBA provisions
- Proposes resolution or next steps
- Maintains a respectful, professional tone

Return ONLY the response text — no JSON, no formatting. Just the professional letter/memo text.`,
    buildContext: async ({ record_id, data, stationId }) => {
      if (data) return JSON.stringify(data, null, 2);
      if (record_id) {
        const { rows } = await pool.query('SELECT * FROM grievances WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [record_id, stationId]);
        return JSON.stringify(rows[0] || {}, null, 2);
      }
      return '{}';
    },
    formatResult: (raw) => ({ result: raw.trim(), type: 'text' }),
    maxTokens: 1500,
    temperature: 0.4,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AFTER-ACTION REPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  draft_after_action: {
    systemPrompt: `You are a fire department after-action report writer. Given incident data, write a comprehensive after-action review. Return ONLY the report text as a formatted document with these sections:
1. INCIDENT OVERVIEW — date, type, location, resources
2. TIMELINE — chronological account
3. WHAT WENT WELL — positive aspects
4. AREAS FOR IMPROVEMENT — constructive feedback
5. LESSONS LEARNED — key takeaways
6. RECOMMENDATIONS — specific action items

Use professional fire service language. Be constructive and specific. 400-600 words.`,
    buildContext: async ({ record_id, data, stationId }) => {
      if (data) return JSON.stringify(data, null, 2);
      if (record_id) {
        const { rows } = await pool.query('SELECT * FROM incidents WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [record_id, stationId]);
        return JSON.stringify(rows[0] || {}, null, 2);
      }
      return '{}';
    },
    formatResult: (raw) => ({ result: raw.trim(), type: 'text' }),
    maxTokens: 2000,
    temperature: 0.4,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PREDICTIVE & ADVANCED ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  predict_incidents: {
    systemPrompt: `You are a fire department predictive analytics engine. Given historical incident data, weather conditions, day-of-week patterns, and community demographics, predict incident volume and type distribution for the next 7 days. Return ONLY valid JSON:
{
  "forecast": [
    { "date": "YYYY-MM-DD", "day": "Monday", "predictedVolume": 3, "dominantType": "Medical / EMS", "riskLevel": "normal|elevated|high", "factors": "reason for prediction" }
  ],
  "weekSummary": "2-3 sentence overview of the coming week",
  "staffingImplication": "how this should affect staffing decisions",
  "highRiskPeriods": [{ "window": "description", "reason": "why" }],
  "confidence": "high|medium|low"
}
Base predictions on actual patterns in the data. Reference day-of-week trends, seasonal patterns, and incident type clustering.`,
    buildContext: async ({ stationId }) => {
      const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
      const { rows: incidents } = await pool.query(
        'SELECT date, time, type, "alarmLevel", address FROM incidents WHERE department_id = $1 AND date >= $2 AND deleted_at IS NULL ORDER BY date DESC',
        [stationId, sixMonthsAgo]
      );
      return JSON.stringify({ incidents, totalCount: incidents.length, periodStart: sixMonthsAgo, today: new Date().toISOString().slice(0, 10) }, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2500,
    temperature: 0.4,
    responseFormat: 'json',
  },

  retention_risk: {
    systemPrompt: `You are a fire department HR analytics specialist. Given member activity data — training participation, shift patterns, overtime trends, certification status, and years of service — assess retention risk. Return ONLY valid JSON:
{
  "departmentRisk": "low|moderate|high",
  "summary": "2-3 sentence overview of department retention health",
  "atRiskMembers": [
    { "name": "member name", "riskScore": 75, "factors": ["factor 1", "factor 2"], "suggestedIntervention": "specific action for leadership" }
  ],
  "positiveIndicators": ["indicator 1"],
  "recommendations": ["recommendation 1"],
  "burnoutWarnings": ["warning 1"]
}
Focus on actionable interventions. Be specific about which behaviors indicate risk.`,
    buildContext: async ({ stationId }) => {
      const { rows: members } = await pool.query(
        'SELECT id, name, rank, status, "hireDate", "certExpiry" FROM members WHERE department_id = $1 AND status = $2',
        [stationId, 'Active']
      );
      const { rows: training } = await pool.query(
        'SELECT member, date, type, hours FROM training WHERE department_id = $1 ORDER BY date DESC LIMIT 500',
        [stationId]
      );
      const { rows: shifts } = await pool.query(
        'SELECT member, date, "shiftType" FROM shifts WHERE department_id = $1 AND date >= $2 ORDER BY date DESC',
        [stationId, new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)]
      );
      return JSON.stringify({ members, recentTraining: training, recentShifts: shifts }, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2500,
    temperature: 0.4,
    responseFormat: 'json',
  },

  auto_exposure: {
    systemPrompt: `You are a fire department occupational health specialist. Given incident data (type, materials involved, personnel on scene, duration), determine if exposure records should be generated. Return ONLY valid JSON:
{
  "exposureRequired": true,
  "reason": "why exposures should be tracked",
  "exposureType": "chemical|smoke|biological|radiation|noise|thermal",
  "material": "specific material or substance",
  "affectedPersonnel": ["member name 1", "member name 2"],
  "severity": "minimal|moderate|significant|severe",
  "recommendedActions": ["medical follow-up type 1"],
  "sdsReference": "SDS lookup suggestion if chemical",
  "documentation": "what should be recorded in the exposure log",
  "followUpTimeline": "when medical monitoring should occur"
}
If the incident does not warrant exposure tracking (e.g., false alarm, public assist), return: { "exposureRequired": false, "reason": "explanation" }`,
    buildContext: async ({ data }) => {
      return JSON.stringify(data || {}, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 1500,
    temperature: 0.3,
    responseFormat: 'json',
    // W3.4: writes to exposure_records (legal table) — must go through the
    // explicit /api/ai/action/apply confirmation, never package auto-save.
    requiresConfirmation: true,
  },

  draft_grant_narrative: {
    systemPrompt: `You are a fire department grant writer. Given department statistics and grant program details, draft a compelling grant application narrative. Return ONLY the narrative text.

Write in professional grant language that:
- Clearly states the need with supporting data
- References specific department metrics (response times, call volume, staffing, equipment age)
- Aligns the request with the grant program's priorities
- Demonstrates community impact
- Includes measurable outcomes and evaluation criteria
- 400-800 words, structured with clear paragraphs

Reference FEMA AFG, SAFER, and state grant program language where appropriate.`,
    buildContext: async ({ data, stationId }) => {
      const { rows: incidents } = await pool.query(
        'SELECT type, COUNT(*) as count FROM incidents WHERE department_id = $1 AND date >= $2 AND deleted_at IS NULL GROUP BY type ORDER BY count DESC',
        [stationId, new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)]
      );
      const { rows: members } = await pool.query(
        'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = $2) as active FROM members WHERE department_id = $1',
        [stationId, 'Active']
      );
      const { rows: apparatus } = await pool.query(
        'SELECT name, type, year, status FROM apparatus WHERE department_id = $1',
        [stationId]
      );
      return JSON.stringify({ grantDetails: data, departmentStats: { incidentsByType: incidents, memberCount: members[0], apparatus } }, null, 2);
    },
    formatResult: (raw) => ({ result: raw.trim(), type: 'text' }),
    maxTokens: 2000,
    temperature: 0.5,
  },

  generate_mutual_aid_docs: {
    systemPrompt: `You are a fire department mutual aid coordinator. Given mutual aid activation details, generate required documentation. Return ONLY valid JSON:
{
  "activationSummary": "formal summary of the mutual aid event",
  "resourceTracking": [{ "unit": "apparatus/team", "deployedAt": "time", "returnedAt": "time or TBD", "personnelCount": 4 }],
  "costAccounting": { "estimatedPersonnelCost": "$0", "estimatedFuelCost": "$0", "estimatedEquipmentCost": "$0", "total": "$0", "basis": "calculation method" },
  "agreementCompliance": { "withinScope": true, "agreementRef": "agreement reference", "notes": "compliance notes" },
  "afterActionNotes": "key observations from the deployment",
  "reimbursementRequired": true,
  "followUpActions": ["action 1", "action 2"]
}
Use standard mutual aid documentation practices. Reference NIMS/ICS resource typing where applicable.`,
    buildContext: async ({ record_id, data, stationId }) => {
      if (data) return JSON.stringify(data, null, 2);
      if (record_id) {
        const { rows } = await pool.query('SELECT * FROM mutual_aid WHERE id = $1 AND department_id = $2', [record_id, stationId]);
        return JSON.stringify(rows[0] || {}, null, 2);
      }
      return '{}';
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2000,
    temperature: 0.3,
    responseFormat: 'json',
  },

  crr_analysis: {
    systemPrompt: `You are a Community Risk Reduction (CRR) specialist. Given incident patterns and inspection data, identify high-risk areas and recommend targeted interventions. Return ONLY valid JSON:
{
  "riskProfile": "overall community risk assessment",
  "highRiskAreas": [{ "location": "area", "riskType": "fire|ems|hazmat", "incidentCount": 0, "trend": "increasing|stable|decreasing", "factors": ["contributing factor"] }],
  "targetedInterventions": [{ "program": "program name", "targetPopulation": "who", "expectedImpact": "outcome", "priority": "high|medium|low" }],
  "inspectionPriorities": ["priority 1"],
  "publicEducationTopics": ["topic 1"],
  "dataGaps": ["gap 1"],
  "crrMethodologyNotes": "alignment with NFPA 1300 CRR framework"
}
Reference NFPA 1300 (Standard on Community Risk Assessment). Be specific and actionable.`,
    buildContext: async ({ stationId }) => {
      const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      const { rows: incidents } = await pool.query(
        'SELECT type, address, date, "alarmLevel", injuries FROM incidents WHERE department_id = $1 AND date >= $2 AND deleted_at IS NULL ORDER BY date DESC',
        [stationId, yearAgo]
      );
      let inspections = [];
      try {
        const { rows } = await pool.query(
          'SELECT address, "propertyType", status, "violationCount", "lastInspection" FROM fi_properties WHERE department_id = $1',
          [stationId]
        );
        inspections = rows;
      } catch { /* fi_properties may not exist */ }
      return JSON.stringify({ incidents, inspections, period: { from: yearAgo, to: new Date().toISOString().slice(0, 10) } }, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 3000,
    temperature: 0.4,
    responseFormat: 'json',
  },

  investigate_incident: {
    systemPrompt: `You are a fire investigation analyst. Given incident data, scene observations, and evidence, provide an investigative analysis. Return ONLY valid JSON:
{
  "causeHypotheses": [{ "cause": "possible cause", "likelihood": "high|medium|low", "supportingEvidence": ["evidence point"], "additionalInvestigationNeeded": "what to look for" }],
  "originAnalysis": { "areaOfOrigin": "area", "pointOfOrigin": "specific point if determinable", "confidence": "high|medium|low" },
  "evidenceCollectionPriorities": ["priority 1"],
  "arsonIndicators": { "present": false, "indicators": [], "recommendation": "referral recommendation if any" },
  "interviewSuggestions": [{ "who": "person/role", "keyQuestions": ["question 1"] }],
  "timelineReconstruction": [{ "time": "", "event": "" }],
  "nfpa921References": ["relevant NFPA 921 section"],
  "nextSteps": ["step 1"]
}
Reference NFPA 921 (Guide for Fire and Explosion Investigations). Be methodical and evidence-based.`,
    buildContext: async ({ record_id, data, stationId }) => {
      if (data) return JSON.stringify(data, null, 2);
      if (record_id) {
        const { rows } = await pool.query('SELECT * FROM fire_investigations WHERE id = $1 AND department_id = $2', [record_id, stationId]);
        const inv = rows[0] || {};
        if (inv.incident_id) {
          try {
            const { rows: inc } = await pool.query('SELECT * FROM incidents WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [inv.incident_id, stationId]);
            inv.linkedIncident = inc[0] || null;
          } catch { /* ok */ }
        }
        return JSON.stringify(inv, null, 2);
      }
      return '{}';
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 3000,
    temperature: 0.3,
    responseFormat: 'json',
  },

  analyze_inspection: {
    systemPrompt: `You are a fire prevention and code enforcement specialist. Given property inspection data, provide analysis. Return ONLY valid JSON:
{
  "riskAssessment": { "overall": "low|moderate|high|critical", "factors": ["factor 1"] },
  "violationAnalysis": { "pattern": "recurring violation pattern if any", "rootCause": "likely root cause", "complianceTrend": "improving|stable|declining" },
  "priorityActions": [{ "action": "specific action", "urgency": "immediate|30-day|90-day", "code": "relevant fire code section" }],
  "preplanRecommendations": "should a pre-plan be created/updated",
  "communityRiskNotes": "how this property fits into broader CRR picture",
  "reinspectionTimeline": "recommended reinspection schedule"
}
Reference IFC (International Fire Code). Be specific about code sections.`,
    buildContext: async ({ record_id, data, stationId }) => {
      if (data) return JSON.stringify(data, null, 2);
      if (record_id) {
        const { rows } = await pool.query('SELECT * FROM fi_properties WHERE id = $1 AND department_id = $2', [record_id, stationId]);
        return JSON.stringify(rows[0] || {}, null, 2);
      }
      return '{}';
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 2000,
    temperature: 0.3,
    responseFormat: 'json',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD / GENERAL
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 3: CAD AUTO-PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════

  // DOCTRINE (Matt, 2026-06-10): AI never writes incident narratives. This
  // enrichment fills FACTS only — the "notes" narrative field was removed;
  // the officer writes the narrative directly.
  cad_enrich_incident: {
    systemPrompt: `You are a fire department CAD-to-incident AI. Given a raw CAD dispatch alert and a draft incident record, enrich the incident's FACTUAL fields. You have access to the station's duty roster and apparatus list — use EXACT names from these lists. Do NOT write a narrative — the incident narrative is written by the officer, never by AI.

Return ONLY valid JSON (no markdown fences):
{
  "type": "refined incident type from: Structure Fire, Vehicle Fire, Brush / Wildland Fire, Dumpster / Rubbish Fire, Vehicle Accident, Technical Rescue, Water Rescue, Medical / EMS, Hazmat, Gas Leak, Public Assist, False Alarm, Mutual Aid, Other",
  "alarmLevel": "Still, Working, 2nd Alarm, 3rd Alarm, or General Alarm",
  "units": ["exact apparatus names from the station apparatus list that match the CAD units field"],
  "personnel": ["names of on-duty members from today's roster who would have responded on the matched apparatus"],
  "disposition": "best guess from CAD details, or empty string if unknown"
}

RULES:
- Use EXACT apparatus names and member names — do NOT invent names
- Match CAD unit designations to the station's apparatus list (e.g., "E1" → "Engine 1")
- If duty roster is available, assign personnel who are on duty today
- Do NOT include a "notes" field or any narrative prose — narratives are officer-written only`,
    buildContext: async ({ data, stationId }) => {
      const context = {
        cadAlert: data.alert,
        draftIncident: data.draftIncident,
      };

      const today = new Date().toISOString().slice(0, 10);

      // Get apparatus list for unit matching
      try {
        const { rows } = await pool.query(
          'SELECT name, designation, type, status FROM apparatus WHERE department_id = $1 ORDER BY name',
          [stationId]
        );
        context.apparatus = rows;
      } catch { context.apparatus = []; }

      // Get today's duty roster
      try {
        const { rows: staffing } = await pool.query(
          'SELECT member_name, member_rank, position, apparatus_name, status FROM daily_staffing WHERE department_id = $1 AND date = $2',
          [stationId, today]
        );
        if (staffing.length > 0) {
          context.dutyRoster = staffing;
        } else {
          const { rows: shifts } = await pool.query(
            'SELECT s.*, m.name as member_name, m.rank FROM shifts s LEFT JOIN members m ON s.member = m.name AND m.department_id = $1 WHERE s.department_id = $1 AND s.date = $2',
            [stationId, today]
          );
          context.dutyRoster = shifts.map(s => ({ member_name: s.member || s.member_name, member_rank: s.rank, position: s.shiftType || s.shift_type }));
        }
      } catch { context.dutyRoster = []; }

      // Get active members for name matching
      try {
        const { rows } = await pool.query(
          'SELECT name, rank FROM members WHERE department_id = $1 AND status IN ($2, $3) ORDER BY name',
          [stationId, 'Active', 'Probationary']
        );
        context.allMembers = rows;
      } catch { context.allMembers = []; }

      // Pre-plan match on address
      if (data.alert?.address) {
        try {
          const addr = data.alert.address.split(',')[0].trim().toLowerCase();
          const { rows } = await pool.query(
            'SELECT "occupancyName", address, "occupancyType", "riskLevel", hazards FROM pre_plans WHERE department_id = $1 AND LOWER(address) LIKE $2 LIMIT 1',
            [stationId, `%${addr}%`]
          );
          context.matchedPrePlan = rows[0] || null;
        } catch { context.matchedPrePlan = null; }
      }

      return JSON.stringify(context, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 1500,
    temperature: 0.3,
    responseFormat: 'json',
  },

  recommend_mutual_aid: {
    systemPrompt: `You are a fire department mutual aid coordinator AI. Given an active incident and a ranked list of mutual aid partner recommendations, provide tactical context for each recommendation.

Return ONLY valid JSON (no markdown fences):
{
  "overallAssessment": "1-2 sentence tactical assessment of mutual aid needs for this incident",
  "recommendations": [
    {
      "partnerAgency": "exact partner name from input",
      "priority": "critical | high | medium | low",
      "tacticalNote": "1-2 sentences: why this partner specifically, what resources to request, tactical considerations",
      "resourcesNeeded": "specific resources to request (e.g., 'Engine company + 4 firefighters for RIT')"
    }
  ]
}

RULES:
- Match partner capabilities to specific tactical needs of this incident type
- For structure fires: consider RIT, water supply, aerial operations, rehab
- For hazmat: ensure decon capability and ALS standby
- For MVAs: consider extrication equipment and ALS transport
- For water/technical rescue: match specialized team capabilities
- Factor in response time — closer partners for immediate needs, farther for sustained ops
- Automatic agreements can be dispatched immediately; request-based need IC authorization
- Be specific about what to request from each partner
- Keep tactical notes actionable and concise`,
    buildContext: async ({ data }) => {
      return JSON.stringify({
        incident: data.incident,
        rankedPartners: data.recommendations,
      }, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 1500,
    temperature: 0.3,
    responseFormat: 'json',
  },

  nfirs_auto_complete: {
    systemPrompt: `You are an NFIRS (National Fire Incident Reporting System) expert AI. Given a partially-filled NFIRS report, the linked incident data, and any available pre-plan data, fill in the missing fire investigation fields.

Return ONLY valid JSON (no markdown fences) with ONLY the fields you can determine. Omit any field you cannot reasonably infer:
{
  "fireOriginCode": "NFIRS area of origin code (e.g., 02=bedroom, 11=hallway, 21=kitchen, 24=bathroom, 41=garage, 93=lawn/field)",
  "fireCauseCode": "NFIRS cause code (1=intentional, 2=unintentional, 3=failure of equipment, 4=act of nature, 5=under investigation, U=undetermined)",
  "contributingFactor1": "primary contributing factor",
  "humanFactors1": "human factor if applicable",
  "detectorPresence": "Y if detector mentioned/likely, N if confirmed none, U if unknown",
  "detectorOperation": "1=operated, 2=did not operate, U=unknown",
  "sprinklerPresence": "Y/N/U",
  "sprinklerOperation": "1/2/U",
  "estimatedPropertyLoss": "dollar estimate as number (no $ or commas)",
  "propertyLoss": "dollar loss as number",
  "contentsLoss": "dollar contents loss as number",
  "buildingStatus": "occupied or unoccupied",
  "structureType": "1=enclosed, 2=portable, 3=open structure"
}

RULES:
- Only include fields you have reasonable confidence about
- For fire origin/cause: use the incident description and narrative to infer
- For detectors/sprinklers: infer from building type (residential → likely Y for detectors) if no specific data
- For loss estimates: use incident type and severity to make reasonable estimates. Structure fires range $5,000-$500,000+. Use the pre-plan property value if available.
- NEVER write or modify the narrativeStatement — incident narratives are officer-written only, AI plays zero role in them
- Be conservative — "U" (undetermined) is always acceptable for unknown fields
- All dollar amounts should be plain numbers (no formatting)`,
    buildContext: async ({ data }) => {
      return JSON.stringify({
        currentReport: data.report,
        linkedIncident: data.incident,
        prePlan: data.prePlan || null,
      }, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 1500,
    temperature: 0.3,
    responseFormat: 'json',
  },

  daily_briefing: {
    systemPrompt: `You are a fire station AI assistant generating a daily briefing for the officer on duty. Given today's schedule, recent incidents, and department data, produce a concise morning briefing. Return ONLY valid JSON:
{
  "greeting": "Good morning, [rank]. Here's your briefing for [date].",
  "staffing": { "onDuty": 0, "minimum": 0, "status": "adequate|tight|critical", "notes": "" },
  "recentActivity": "1-2 sentence summary of last 24h incidents",
  "todaysSchedule": ["event 1", "event 2"],
  "weatherImpact": "any weather-related operational considerations",
  "maintenanceDue": ["item 1"],
  "reminders": ["reminder 1"],
  "motivationalNote": "brief positive note for the crew"
}`,
    buildContext: async ({ stationId }) => {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const { rows: recentIncidents } = await pool.query(
        'SELECT * FROM incidents WHERE department_id = $1 AND date >= $2 AND deleted_at IS NULL ORDER BY date DESC LIMIT 5',
        [stationId, yesterday]
      );
      const { rows: shifts } = await pool.query(
        'SELECT * FROM shifts WHERE department_id = $1 AND date = $2',
        [stationId, today]
      );
      const { rows: members } = await pool.query(
        'SELECT id, name, rank FROM members WHERE department_id = $1 AND status = $2',
        [stationId, 'Active']
      );
      return JSON.stringify({ today, recentIncidents, todayShifts: shifts, activeMembers: members }, null, 2);
    },
    formatResult: (raw) => {
      try { return { result: JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')), type: 'json' }; }
      catch { return { result: raw, type: 'text' }; }
    },
    maxTokens: 1500,
    temperature: 0.5,
    responseFormat: 'json',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SAVE HANDLERS — persist AI results back to the database
// Used by POST /api/ai/action/apply
// ═══════════════════════════════════════════════════════════════════════════════

const saveHandlers = {
  // DOCTRINE (Matt, 2026-06-10): there is deliberately NO draft_narrative
  // save handler (the earlier approval-gate version was removed along with
  // the action itself). AI plays zero role in incident narratives — the
  // officer writes incidents.notes (the NERIS/NFIRS legal record) directly.

  draft_after_action: async ({ record_id, result, stationId, userId }) => {
    const text = typeof result === 'string' ? result : result?.result || '';
    if (!text.trim()) throw new Error('No after-action content to save');

    // Check if one already exists
    const { rows: existing } = await pool.query(
      'SELECT id FROM after_action_reports WHERE incident_id = $1 AND department_id = $2',
      [record_id, stationId]
    );

    if (existing.length > 0) {
      // Update existing
      await pool.query(
        'UPDATE after_action_reports SET summary = $1, status = $2, updated_at = NOW() WHERE id = $3',
        [text.trim(), 'AI Draft', existing[0].id]
      );
      return { saved: true, id: existing[0].id, message: 'After-action report updated' };
    }

    // Create new
    const { rows } = await pool.query(
      `INSERT INTO after_action_reports (incident_id, station_id, title, summary, status, conducted_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
      [record_id, stationId, 'AI-Generated After-Action Review', text.trim(), 'AI Draft', 'AI Assistant']
    );
    return { saved: true, id: rows[0].id, message: 'After-action report created' };
  },

  // W3.4 rewrite (2026-06-10): the old handler inserted nonexistent columns
  // (material, severity) and omitted NOT-NULL exposure_date, so it ALWAYS
  // failed at runtime. It also trusted AI-returned personnel verbatim and
  // wrote a LEGAL table with no audit trail. Now: names are resolved to
  // in-station members (unresolvable names are skipped and reported, never
  // guessed), real columns are used, and every create is audited. Only
  // reachable via the explicit /api/ai/action/apply confirmation
  // (requiresConfirmation on the action def keeps package auto-save away).
  auto_exposure: async ({ record_id, result, stationId, userId, userName }) => {
    const data = typeof result === 'object' ? result : JSON.parse(result);
    if (!data.exposureRequired) {
      return { saved: false, message: 'No exposure records needed for this incident' };
    }

    const { audit } = require('./auditLog');
    const personnel = (data.affectedPersonnel || []).filter(p => typeof p === 'string' && p.trim());
    let created = 0;
    const skipped = [];

    for (const name of personnel) {
      // AI returns NAMES — resolve to an in-station member id; never trust ids
      // or names that don't match this station's roster.
      const { rows: members } = await pool.query(
        'SELECT id FROM members WHERE department_id = $1 AND LOWER(name) = LOWER($2)',
        [stationId, name.trim()]
      );
      if (!members.length) { skipped.push(name); continue; }
      const memberId = members[0].id;

      // Avoid duplicates
      const { rows: exists } = await pool.query(
        'SELECT id FROM exposure_records WHERE incident_id = $1 AND department_id = $2 AND member_id = $3 AND deleted_at IS NULL',
        [record_id, stationId, memberId]
      );
      if (exists.length === 0) {
        const { rows } = await pool.query(
          `INSERT INTO exposure_records (incident_id, station_id, member_id, exposure_date, exposure_type, substance, symptoms, reported_by, status, created_at)
           VALUES ($1, $2, $3, CURRENT_DATE::TEXT, $4, $5, $6, $7, 'reported', NOW()) RETURNING id`,
          [record_id, stationId, memberId, data.exposureType || 'smoke',
           data.material || 'Unknown', data.documentation || '',
           userName ? `${userName} (AI-assisted)` : 'AI-assisted']
        );
        audit(stationId, { id: userId, username: userName }, 'create', 'exposure_records', rows[0]?.id, {
          source: 'ai_auto_exposure', incident_id: record_id, member_id: memberId,
        });
        created++;
      }
    }

    return {
      saved: created > 0,
      created,
      skipped,
      message: `${created} exposure record(s) created${skipped.length ? `; ${skipped.length} name(s) not on roster, skipped: ${skipped.join(', ')}` : ''}`,
    };
  },

  nfirs_auto_complete: async ({ record_id, result, stationId }) => {
    const data = typeof result === 'object' ? result : JSON.parse(result);
    const { nfirsReports: nfDb } = require('../db');
    const updates = {};
    let count = 0;

    // DOCTRINE (Matt, 2026-06-10): narrativeStatement is deliberately NOT in
    // this list — AI never writes incident narratives; officers do.
    const ALLOWED = [
      'fireOriginCode', 'fireCauseCode', 'contributingFactor1', 'contributingFactor2',
      'humanFactors1', 'humanFactors2', 'detectorPresence', 'detectorOperation',
      'detectorEffectiveness', 'sprinklerPresence', 'sprinklerOperation',
      'estimatedPropertyLoss', 'estimatedPropertyValue', 'propertyLoss', 'contentsLoss',
      'buildingStatus', 'structureType',
    ];

    for (const key of ALLOWED) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
        updates[key] = data[key];
        count++;
      }
    }

    if (count > 0) {
      await nfDb.update(record_id, updates, stationId);
    }

    return { saved: true, fieldsUpdated: count, message: `${count} NFIRS field(s) updated` };
  },
};

module.exports = actions;
module.exports.saveHandlers = saveHandlers;
