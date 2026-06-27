'use strict';
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

function parseTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
}

function timeToMinutes(time) {
  if (!time) return null;
  return time.hours * 60 + time.minutes;
}

function calculateTurnoutMinutes(alarmTime, arrivalTime) {
  const alarm = parseTime(alarmTime);
  const arrival = parseTime(arrivalTime);
  if (!alarm || !arrival) return null;
  const alarmMin = timeToMinutes(alarm);
  const arrivalMin = timeToMinutes(arrival);
  if (arrivalMin < alarmMin) {
    return (24 * 60) - alarmMin + arrivalMin;
  }
  return arrivalMin - alarmMin;
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, "incidentNumber", date, time, type, "dispatchTime", "clearTime"
       FROM incidents
       WHERE department_id = $1 AND deleted_at IS NULL
       ORDER BY date DESC, time DESC`,
      [req.user.department_id]
    );

    const incidents = [];
    let totalTurnout = 0;
    let countWithData = 0;

    for (const row of rows) {
      const turnoutMin = calculateTurnoutMinutes(row.time, row.dispatchTime);
      if (turnoutMin !== null) {
        incidents.push({
          incidentNumber: row.incidentNumber,
          date: row.date,
          type: row.type,
          alarmTime: row.time,
          arrivalTime: row.dispatchTime,
          turnoutMinutes: Math.round(turnoutMin * 100) / 100,
        });
        totalTurnout += turnoutMin;
        countWithData++;
      }
    }

    const monthlyAverages = {};
    for (const inc of incidents) {
      const month = inc.date.substring(0, 7);
      if (!monthlyAverages[month]) {
        monthlyAverages[month] = { total: 0, count: 0 };
      }
      monthlyAverages[month].total += inc.turnoutMinutes;
      monthlyAverages[month].count++;
    }

    const monthlyData = Object.entries(monthlyAverages).map(([month, data]) => ({
      month,
      averageTurnout: Math.round((data.total / data.count) * 100) / 100,
      incidentCount: data.count,
    }));

    res.json({
      data: {
        averageTurnout: countWithData > 0 ? Math.round((totalTurnout / countWithData) * 100) / 100 : 0,
        totalIncidents: rows.length,
        incidentsWithData: countWithData,
        incidents,
        monthlyAverages: monthlyData,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute response analytics' });
  }
});

module.exports = router;
