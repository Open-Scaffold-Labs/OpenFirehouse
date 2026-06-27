'use strict';
/**
 * seed-incidentAnalysis.js — Populate incident response analytics and metrics.
 * Generates 12 months of summary analytics showing call volumes, response times, and call type breakdowns.
 */

const { pool } = require('./db');

module.exports = async function seedIncidentAnalysis() {
  // Check if analysis data exists (by checking NFIRS reports with specific structure)
  const check = await pool.query('SELECT COUNT(*) FROM incidents WHERE station_id = 1');
  const incidentCount = parseInt(check.rows[0].count);

  // If we have incidents, don't re-seed analysis (analysis is derived from incidents)
  if (incidentCount > 20) {
    console.log('Incident analysis seed: sufficient incident data exists, deriving analytics.');
    // Analysis happens dynamically from incident data
    return;
  }

  console.log('Incident analysis seed: generating 12-month analytics baseline.');

  // Generate monthly analytics across 12 months
  // These represent call statistics and response metrics
  const now = new Date();
  const analyses = [];

  // Define month range (last 12 months)
  for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo--) {
    const monthDate = new Date(now);
    monthDate.setMonth(monthDate.getMonth() - monthsAgo);
    const monthStr = monthDate.toISOString().slice(0, 7); // YYYY-MM
    const monthLabel = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Vary call counts realistically: 35-55 calls per month
    const totalCalls = Math.floor(Math.random() * 20) + 35;

    // Call type breakdown: fire 15%, EMS 55%, hazmat 3%, service 12%, false alarm 15%
    const fireCount = Math.ceil(totalCalls * 0.15);
    const emsCount = Math.ceil(totalCalls * 0.55);
    const hazmatCount = Math.ceil(totalCalls * 0.03);
    const serviceCount = Math.ceil(totalCalls * 0.12);
    const falseAlarmCount = totalCalls - fireCount - emsCount - hazmatCount - serviceCount;

    // Response times: 4-6 minutes average
    const avgResponseTime = 4 + Math.random() * 2;
    const fastestResponseTime = 2 + Math.random() * 1;
    const slowestResponseTime = 8 + Math.random() * 3;

    // Mutual aid data
    const mutualAidGiven = Math.floor(Math.random() * 3); // 0-2 times
    const mutualAidReceived = Math.floor(Math.random() * 2); // 0-1 times

    analyses.push({
      month: monthStr,
      monthLabel,
      totalCalls,
      fireCount,
      emsCount,
      hazmatCount,
      serviceCount,
      falseAlarmCount,
      avgResponseTime: Math.round(avgResponseTime * 10) / 10,
      fastestResponseTime,
      slowestResponseTime,
      mutualAidGiven,
      mutualAidReceived,
      notes: `${monthLabel} incident analysis: ${totalCalls} total calls. Average response time ${Math.round(avgResponseTime * 10) / 10} minutes.`,
    });
  }

  // Store analyses as NFIRS reports (using them to track monthly analytics)
  let inserted = 0;

  for (const analysis of analyses) {
    await pool.query(
      `INSERT INTO nfirs_reports (
        station_id, "reportDate", "incidentNumber", "reportingArea", status, notes
      )
       VALUES (1, $1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        analysis.month + '-01', // Report date set to first of month
        `ANALYTICS-${analysis.month}`, // Special incident number for analytics
        'Station 14 Monthly Analytics',
        'Complete',
        `Monthly Summary for ${analysis.monthLabel}: Total calls: ${analysis.totalCalls}, Fire: ${analysis.fireCount}, EMS: ${analysis.emsCount}, HazMat: ${analysis.hazmatCount}, Service: ${analysis.serviceCount}, False Alarm: ${analysis.falseAlarmCount}. Avg Response Time: ${analysis.avgResponseTime} min. Mutual Aid Given: ${analysis.mutualAidGiven}, Received: ${analysis.mutualAidReceived}. ${analysis.notes}`,
      ]
    );
    inserted++;
  }

  console.log(`Incident analysis seed complete: ${inserted} monthly summaries inserted.`);

  // Add response time data to existing incidents
  const { rows: incidents } = await pool.query(
    'SELECT id, "dispatchTime", "clearTime" FROM incidents WHERE station_id = 1 LIMIT 30'
  );

  let responseTimeUpdates = 0;
  for (const incident of incidents) {
    if (incident.dispatchTime && incident.clearTime) {
      // Calculate response time from incident dispatch and clear times
      const dispatchMinutes = parseInt(incident.dispatchTime.split(':')[0]) * 60 + parseInt(incident.dispatchTime.split(':')[1]);
      const clearMinutes = parseInt(incident.clearTime.split(':')[0]) * 60 + parseInt(incident.clearTime.split(':')[1]);

      if (clearMinutes > dispatchMinutes) {
        const responseMinutes = clearMinutes - dispatchMinutes;
        // Response time is calculated, no field to update so just log
        responseTimeUpdates++;
      }
    }
  }

  console.log(`Incident analysis: ${responseTimeUpdates} incidents have calculable response times.`);
};
