'use strict';
/**
 * mutualAidRecommender.js — Layer 3: AI-Powered Mutual Aid Coordination
 *
 * When an incident exceeds station capacity or matches mutual aid criteria,
 * this engine:
 *   1. Evaluates incident severity and resource needs
 *   2. Queries active mutual aid agreements
 *   3. Matches incident requirements to partner capabilities
 *   4. Ranks partners by relevance, proximity, and response time
 *   5. Optionally calls AI for nuanced recommendations
 *   6. Returns ranked activation recommendations
 *
 * Triggers:
 *   - High alarm levels (Working, 2nd Alarm+)
 *   - Specialty incident types (Hazmat, Water Rescue, Technical Rescue)
 *   - Explicitly requested by user
 *   - Incident type is "Mutual Aid"
 */

const { pool } = require('../db');

// ── Service Matching ────────────────────────────────────────────────────────
// Maps incident types to mutual aid service categories they'd need.
const INCIDENT_SERVICE_MAP = {
  'Structure Fire':         ['fire_suppression', 'aerial_operations', 'tanker_shuttle', 'rehab', 'command_staff'],
  'Vehicle Fire':           ['fire_suppression'],
  'Brush / Wildland Fire':  ['wildland', 'fire_suppression', 'tanker_shuttle'],
  'Vehicle Accident':       ['ems_als', 'ems_bls', 'technical_rescue'],
  'Technical Rescue':       ['technical_rescue', 'command_staff'],
  'Water Rescue':           ['water_rescue', 'dive_team', 'ems_als'],
  'Medical / EMS':          ['ems_als', 'ems_bls'],
  'Hazmat':                 ['hazmat', 'ems_als', 'rehab'],
  'Gas Leak':               ['hazmat', 'fire_suppression'],
  'Mutual Aid':             ['fire_suppression', 'ems_als', 'command_staff'],
};

// Alarm level → severity multiplier (higher = more partners recommended)
const ALARM_SEVERITY = {
  'Still':         1,
  'Working':       2,
  '2nd Alarm':     3,
  '3rd Alarm':     4,
  'General Alarm': 5,
};

// ── Should We Recommend? ────────────────────────────────────────────────────
// Auto-trigger conditions for mutual aid recommendations.
function shouldRecommend(incident) {
  const reasons = [];

  // High alarm level
  const severity = ALARM_SEVERITY[incident.alarmLevel] || 1;
  if (severity >= 2) reasons.push(`Alarm level: ${incident.alarmLevel}`);

  // Specialty incidents that typically need outside help
  const specialtyTypes = ['Hazmat', 'Water Rescue', 'Technical Rescue'];
  if (specialtyTypes.includes(incident.type)) reasons.push(`Specialty incident: ${incident.type}`);

  // Explicit mutual aid type
  if (incident.type === 'Mutual Aid') reasons.push('Incident type is Mutual Aid');

  // Disposition indicates mutual aid
  if (incident.disposition && /mutual\s*aid/i.test(incident.disposition)) {
    reasons.push(`Disposition: ${incident.disposition}`);
  }

  return { should: reasons.length > 0, reasons };
}

// ── Score a Partner ─────────────────────────────────────────────────────────
// Scores a mutual aid agreement against an incident's needs.
// Higher score = better match.
function scorePartner(agreement, incident) {
  let score = 0;
  const matchReasons = [];

  const neededServices = INCIDENT_SERVICE_MAP[incident.type] || ['fire_suppression'];
  const partnerServices = Array.isArray(agreement.services) ? agreement.services : [];

  // Service match (0-50 points)
  let serviceMatches = 0;
  for (const needed of neededServices) {
    // Flexible matching — partner services may be descriptive strings
    const matched = partnerServices.some(svc => {
      const svcLower = (typeof svc === 'string' ? svc : '').toLowerCase();
      const neededLower = needed.replace(/_/g, ' ');
      return svcLower.includes(neededLower) || svcLower.includes(needed);
    });
    if (matched) {
      serviceMatches++;
      matchReasons.push(needed.replace(/_/g, ' '));
    }
  }
  score += Math.round((serviceMatches / Math.max(neededServices.length, 1)) * 50);

  // Proximity bonus (0-25 points, closer = better)
  const distance = parseFloat(agreement.distance_miles) || 0;
  if (distance > 0 && distance <= 3)       score += 25;
  else if (distance > 3 && distance <= 5)  score += 20;
  else if (distance > 5 && distance <= 10) score += 15;
  else if (distance > 10 && distance <= 20) score += 10;
  else if (distance > 20)                  score += 5;

  // Response time bonus (0-15 points)
  const responseTime = parseInt(agreement.response_time_min) || 0;
  if (responseTime > 0 && responseTime <= 5)       score += 15;
  else if (responseTime > 5 && responseTime <= 10)  score += 12;
  else if (responseTime > 10 && responseTime <= 15) score += 8;
  else if (responseTime > 15 && responseTime <= 30) score += 5;

  // Agreement type bonus (0-10 points)
  if (agreement.agreement_type === 'automatic')        score += 10;
  else if (agreement.agreement_type === 'regional_compact') score += 8;
  else if (agreement.agreement_type === 'request_based')    score += 6;

  return { score, matchReasons, serviceMatches, totalNeeded: neededServices.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RECOMMENDATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get mutual aid partner recommendations for an incident.
 *
 * @param {Object} incident   — The incident record
 * @param {number} stationId  — Multi-tenancy station ID
 * @param {Function} callAI   — Optional AI caller for enhanced recommendations
 * @returns {Object}          — { recommendations[], triggerReasons[], severity }
 */
async function recommendPartners(incident, stationId, callAI) {
  const startTime = Date.now();

  try {
    // 1. Check if recommendation is warranted
    const trigger = shouldRecommend(incident);
    const severity = ALARM_SEVERITY[incident.alarmLevel] || 1;

    // 2. Fetch all active agreements
    const { rows: agreements } = await pool.query(
      `SELECT * FROM mutual_aid_agreements
       WHERE department_id = $1 AND status = 'active'
         AND (expiration_date IS NULL OR expiration_date > NOW())
       ORDER BY distance_miles ASC`,
      [stationId]
    );

    if (agreements.length === 0) {
      return {
        recommendations: [],
        triggerReasons: trigger.reasons,
        severity,
        message: 'No active mutual aid agreements found',
        duration: Date.now() - startTime,
      };
    }

    // 3. Parse services JSONB
    for (const a of agreements) {
      if (typeof a.services === 'string') {
        try { a.services = JSON.parse(a.services); } catch { a.services = []; }
      }
    }

    // 4. Score each partner
    const scored = agreements.map(agreement => {
      const { score, matchReasons, serviceMatches, totalNeeded } = scorePartner(agreement, incident);
      return {
        agreementId: agreement.id,
        partnerAgency: agreement.partner_agency,
        partnerFdid: agreement.partner_fdid,
        contactName: agreement.partner_contact,
        contactPhone: agreement.partner_phone,
        contactEmail: agreement.partner_email,
        agreementType: agreement.agreement_type,
        distanceMiles: parseFloat(agreement.distance_miles) || 0,
        responseTimeMin: parseInt(agreement.response_time_min) || 0,
        services: agreement.services,
        score,
        matchReasons,
        serviceMatchRate: totalNeeded > 0 ? Math.round((serviceMatches / totalNeeded) * 100) : 0,
        priority: score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low',
        activationType: agreement.agreement_type === 'automatic' ? 'Auto-dispatch' : 'Request required',
      };
    });

    // 5. Sort by score (highest first) and filter to relevant matches
    scored.sort((a, b) => b.score - a.score);
    const recommendations = scored.filter(s => s.score > 10);

    // 6. Determine how many partners to recommend based on severity
    const recommendCount = Math.min(
      recommendations.length,
      severity >= 4 ? 5 : severity >= 3 ? 4 : severity >= 2 ? 3 : 2
    );
    const topRecommendations = recommendations.slice(0, recommendCount);

    // 7. AI enrichment — add context-aware reasoning
    if (callAI && topRecommendations.length > 0) {
      try {
        const aiResult = await callAI('recommend_mutual_aid', {
          data: { incident, recommendations: topRecommendations },
          stationId,
        });

        if (aiResult && typeof aiResult === 'object') {
          // AI can refine priority, add tactical notes, or reorder
          if (Array.isArray(aiResult.recommendations)) {
            for (const aiRec of aiResult.recommendations) {
              const match = topRecommendations.find(r => r.partnerAgency === aiRec.partnerAgency);
              if (match) {
                if (aiRec.tacticalNote) match.tacticalNote = aiRec.tacticalNote;
                if (aiRec.priority) match.priority = aiRec.priority;
                if (aiRec.resourcesNeeded) match.resourcesNeeded = aiRec.resourcesNeeded;
              }
            }
          }
          if (aiResult.overallAssessment) {
            topRecommendations._aiAssessment = aiResult.overallAssessment;
          }
        }
      } catch (err) {
        console.warn('[Mutual Aid] AI enrichment failed:', err.message);
      }
    }

    // 8. Fetch historical usage for each recommended partner
    for (const rec of topRecommendations) {
      try {
        const { rows: history } = await pool.query(
          `SELECT COUNT(*) as times_activated,
                  MAX(date) as last_activated,
                  SUM("personnelCount") as total_personnel_deployed
           FROM mutual_aid
           WHERE department_id = $1 AND "partnerDepartment" ILIKE $2`,
          [stationId, `%${rec.partnerAgency}%`]
        );
        if (history[0]) {
          rec.history = {
            timesActivated: parseInt(history[0].times_activated) || 0,
            lastActivated: history[0].last_activated || null,
            totalPersonnelDeployed: parseInt(history[0].total_personnel_deployed) || 0,
          };
        }
      } catch { rec.history = null; }
    }

    const duration = Date.now() - startTime;
    console.log(`[Mutual Aid] ✔ ${topRecommendations.length} recommendations for ${incident.type} (${incident.alarmLevel}) in ${duration}ms`);

    return {
      recommendations: topRecommendations,
      allScored: scored.length,
      triggerReasons: trigger.reasons,
      autoTriggered: trigger.should,
      severity,
      incidentSummary: `${incident.type} at ${incident.address || 'unknown address'} — ${incident.alarmLevel}`,
      aiAssessment: topRecommendations._aiAssessment || null,
      duration,
    };
  } catch (err) {
    console.error('[Mutual Aid] ✘ Recommendation failed:', err.message);
    return { recommendations: [], error: err.message };
  }
}

/**
 * Quick check — should this incident trigger mutual aid recommendations?
 * Lightweight function for use in incident creation hooks.
 */
function checkMutualAidTrigger(incident) {
  return shouldRecommend(incident);
}

module.exports = {
  recommendPartners,
  checkMutualAidTrigger,
  shouldRecommend,
  scorePartner,
  INCIDENT_SERVICE_MAP,
  ALARM_SEVERITY,
};
