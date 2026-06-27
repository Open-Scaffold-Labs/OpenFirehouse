'use strict';
/**
 * routes/isoReport.js — ISO Grading Data Package Generator
 *
 * Aggregates data across all modules to produce an ISO-style report.
 * ISO grading evaluates: equipment testing, training participation,
 * response times, apparatus readiness, hydrant testing, and pre-plans.
 *
 * GET /api/iso-report?year=2026  — generate ISO data package for a year
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const year = req.query.year || new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // ── 1. Member Training Participation ──────────────────────────────────
    const membersRes = await pool.query(
      `SELECT id, name, rank, status, certifications FROM members WHERE department_id = $1 AND (status = 'Active' OR status = 'Probationary')`,
      [stationId]
    );
    const activeMembers = membersRes.rows;

    const trainingRes = await pool.query(
      `SELECT * FROM training WHERE department_id = $1 AND date >= $2 AND date <= $3`,
      [stationId, startDate, endDate]
    );
    const trainingRecords = trainingRes.rows;

    // Training hours per member
    const trainingByMember = {};
    for (const m of activeMembers) {
      trainingByMember[m.id] = { name: m.name, rank: m.rank, hours: 0, sessions: 0, certsCurrent: 0, certsExpired: 0 };
    }
    for (const t of trainingRecords) {
      if (trainingByMember[t.memberId]) {
        trainingByMember[t.memberId].hours += parseFloat(t.hours || 0);
        trainingByMember[t.memberId].sessions++;
      }
    }

    // Certification status
    const today = new Date().toISOString().slice(0, 10);
    for (const t of trainingRes.rows) {
      if (t.expirationDate && trainingByMember[t.memberId]) {
        if (t.expirationDate >= today) trainingByMember[t.memberId].certsCurrent++;
        else trainingByMember[t.memberId].certsExpired++;
      }
    }

    const trainingParticipation = Object.values(trainingByMember);
    const avgTrainingHours = trainingParticipation.length > 0
      ? trainingParticipation.reduce((s, m) => s + m.hours, 0) / trainingParticipation.length
      : 0;

    // ── 2. Apparatus Readiness ────────────────────────────────────────────
    const appRes = await pool.query(
      `SELECT id, designation, type, status, "lastService", "nextServiceDue" FROM apparatus WHERE department_id = $1`,
      [stationId]
    );
    const apparatus = appRes.rows;
    const appInService = apparatus.filter(a => a.status === 'In Service').length;
    const appTotal = apparatus.length;

    // Maintenance records this year
    const maintRes = await pool.query(
      `SELECT * FROM maintenance WHERE department_id = $1 AND date >= $2 AND date <= $3`,
      [stationId, startDate, endDate]
    );
    const maintenanceCount = maintRes.rows.length;

    // ── 3. Response Time Analysis ─────────────────────────────────────────
    const incRes = await pool.query(
      `SELECT * FROM incidents WHERE department_id = $1 AND date >= $2 AND date <= $3 AND deleted_at IS NULL`,
      [stationId, startDate, endDate]
    );
    const incidents = incRes.rows;
    const totalIncidents = incidents.length;

    // Parse response times where available
    let responseTimes = [];
    for (const inc of incidents) {
      if (inc.dispatchTime && inc.time) {
        // Simple minute difference
        const dispatch = inc.dispatchTime.replace(':', '');
        const arrival = inc.time.replace(':', '');
        if (dispatch && arrival) {
          const diff = parseInt(arrival) - parseInt(dispatch);
          if (diff > 0 && diff < 60) responseTimes.push(diff);
        }
      }
    }
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length
      : null;

    // ── 4. Hydrant Testing ────────────────────────────────────────────────
    const hydRes = await pool.query(
      `SELECT id, "hydrantNumber", status, "lastTestDate", "nextTestDue", "flowRate" FROM hydrants WHERE department_id = $1`,
      [stationId]
    );
    const hydrants = hydRes.rows;
    const hydrantsTested = hydrants.filter(h => h.lastTestDate && h.lastTestDate >= startDate).length;
    const hydrantsTotal = hydrants.length;
    const hydrantsOverdue = hydrants.filter(h => h.nextTestDue && h.nextTestDue < today).length;

    // ── 5. Pre-Incident Plans ─────────────────────────────────────────────
    const ppRes = await pool.query(
      `SELECT id, "occupancyName", "occupancyType", "lastSurveyDate" FROM pre_plans WHERE department_id = $1`,
      [stationId]
    );
    const prePlans = ppRes.rows;
    const prePlansCurrent = prePlans.filter(p => p.lastSurveyDate && p.lastSurveyDate >= startDate).length;

    // ── 6. Fire Inspections ───────────────────────────────────────────────
    const fiRes = await pool.query(
      `SELECT * FROM fi_inspections WHERE department_id = $1 AND date >= $2 AND date <= $3`,
      [stationId, startDate, endDate]
    );
    const inspections = fiRes.rows;

    // ── 7. Drills ─────────────────────────────────────────────────────────
    const drillRes = await pool.query(
      `SELECT * FROM drills WHERE department_id = $1 AND date >= $2 AND date <= $3`,
      [stationId, startDate, endDate]
    );
    const drills = drillRes.rows;

    // ── Build ISO Score Breakdown ─────────────────────────────────────────
    // ISO grading areas with scoring (simplified Public Protection Classification)
    const scores = {
      emergencyCommunications: {
        label: 'Emergency Communications',
        weight: 10,
        items: [
          { metric: 'CAD Integration Active', value: true, target: true },
        ]
      },
      fireCompany: {
        label: 'Fire Company / Personnel',
        weight: 50,
        items: [
          { metric: 'Active Members', value: activeMembers.length, target: 15, unit: 'members' },
          { metric: 'Avg Training Hours/Member', value: Math.round(avgTrainingHours * 10) / 10, target: 40, unit: 'hrs' },
          { metric: 'Training Sessions YTD', value: trainingRecords.length, target: 24 },
          { metric: 'Drills Conducted YTD', value: drills.length, target: 12 },
          { metric: 'Apparatus In Service', value: appInService, target: appTotal, unit: `of ${appTotal}` },
          { metric: 'Maintenance Records YTD', value: maintenanceCount, target: appTotal * 12 },
          { metric: 'Members with Expired Certs', value: trainingParticipation.filter(m => m.certsExpired > 0).length, target: 0, lowerIsBetter: true },
        ]
      },
      waterSupply: {
        label: 'Water Supply',
        weight: 40,
        items: [
          { metric: 'Hydrants Tested YTD', value: hydrantsTested, target: hydrantsTotal, unit: `of ${hydrantsTotal}` },
          { metric: 'Hydrants Overdue', value: hydrantsOverdue, target: 0, lowerIsBetter: true },
        ]
      },
      communityRiskReduction: {
        label: 'Community Risk Reduction',
        weight: 5.5,
        items: [
          { metric: 'Fire Inspections YTD', value: inspections.length, target: 24 },
          { metric: 'Pre-Plans Updated YTD', value: prePlansCurrent, target: prePlans.length, unit: `of ${prePlans.length}` },
        ]
      },
    };

    // Calculate per-section scores and build array for client
    const sectionsArray = [];
    for (const [key, section] of Object.entries(scores)) {
      let sectionScore = 0;
      let itemCount = 0;
      const recommendations = [];
      for (const item of section.items) {
        itemCount++;
        let itemScore;
        if (item.lowerIsBetter) {
          itemScore = item.value <= item.target ? 1 : Math.max(0, 1 - (item.value - item.target) / Math.max(item.target, 1));
          if (item.value > item.target) recommendations.push(`Reduce ${item.metric} from ${item.value} to ${item.target}`);
        } else if (typeof item.target === 'boolean') {
          itemScore = item.value === item.target ? 1 : 0;
          if (item.value !== item.target) recommendations.push(`Enable ${item.metric}`);
        } else {
          itemScore = item.target > 0 ? Math.min(1, item.value / item.target) : 1;
          if (item.target > 0 && item.value < item.target) recommendations.push(`Increase ${item.metric} from ${item.value} to ${item.target}`);
        }
        sectionScore += itemScore;
      }
      const maxScore = section.weight;
      const score = itemCount > 0 ? Math.round((sectionScore / itemCount) * maxScore * 10) / 10 : 0;
      sectionsArray.push({
        name: section.label,
        weight: section.weight,
        maxScore,
        score,
        metrics: section.items.map(i => ({
          label: i.metric,
          value: typeof i.value === 'boolean' ? (i.value ? 1 : 0) : i.value,
          target: typeof i.target === 'boolean' ? 1 : i.target,
        })),
        recommendations: recommendations.length > 0 ? recommendations : undefined,
      });
    }

    // Overall weighted score (0-100)
    const totalWeight = sectionsArray.reduce((s, sec) => s + sec.weight, 0);
    const overallScore = totalWeight > 0
      ? Math.round(sectionsArray.reduce((s, sec) => s + sec.score, 0) / totalWeight * 100)
      : 0;

    res.json({
      year: Number(year),
      generatedAt: new Date().toISOString(),
      overallScore,
      sections: sectionsArray,
      summary: {
        activeMembers: activeMembers.length,
        totalIncidents,
        avgResponseTime: avgResponseTime ? Math.round(avgResponseTime * 10) / 10 : null,
        avgTrainingHours: Math.round(avgTrainingHours * 10) / 10,
        apparatusReadiness: appTotal > 0 ? Math.round(appInService / appTotal * 100) : 0,
        hydrantCompliance: hydrantsTotal > 0 ? Math.round(hydrantsTested / hydrantsTotal * 100) : 0,
        prePlanCoverage: prePlans.length > 0 ? Math.round(prePlansCurrent / prePlans.length * 100) : 0,
        inspectionsCompleted: inspections.length,
        drillsConducted: drills.length,
      },
      memberTraining: trainingParticipation,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate ISO report' });
  }
});

module.exports = router;
