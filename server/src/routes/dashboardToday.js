'use strict';
/**
 * routes/dashboardToday.js — Today's Timeline endpoint.
 *
 * GET /api/dashboard/today
 *
 * Merges events, shifts, and deadlines into a single chronological
 * timeline for the landing page "Today" view.
 *
 * SCHEMA NOTES (station_id added via ALTER TABLE on all legacy tables):
 *   events:         id, title, type, date(TEXT), "startTime", "endTime", location, description, station_id
 *   shifts:         id, date(TEXT), "shiftType", crew(JSON TEXT), notes, station_id
 *   training:       id, "courseName", "completedDate"(TEXT), type, location, hours, station_id
 *   maintenance:    id, "apparatusName", date(TEXT), description, status, type, priority, station_id
 *   meeting_minutes: id, station_id, title, meeting_date(DATE), meeting_type, location, called_by, status
 *   leave_requests: id, station_id, "memberId", "memberName", type, "startDate"(TEXT), "endDate"(TEXT), status
 */
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

const fmtDate = (d) => d.toISOString().slice(0, 10);

// Safe query helper — returns { rows: [] } on error instead of throwing
async function safeQuery(label, sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    console.error(`[dashboard/today] ${label} query failed:`, err.message);
    return { rows: [] };
  }
}

router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const now = new Date();
    const todayStr = fmtDate(now);
    console.log(`[dashboard/today] Querying for date: ${todayStr}`);

    const [
      eventsRes,
      shiftsRes,
      drillsRes,
      maintenanceRes,
      meetingsRes,
      leaveRes,
    ] = await Promise.all([
      safeQuery('events',
        `SELECT id, title, date, "startTime", "endTime", type, location, description
         FROM events WHERE department_id = $2 AND date = $1 ORDER BY "startTime" NULLS LAST`,
        [todayStr, stationId]
      ),
      safeQuery('shifts',
        `SELECT id, "shiftType", date, crew, notes
         FROM shifts WHERE department_id = $2 AND date = $1`,
        [todayStr, stationId]
      ),
      safeQuery('training',
        `SELECT id, "courseName" as title, "completedDate" as date, type, location
         FROM training WHERE department_id = $2 AND "completedDate" = $1`,
        [todayStr, stationId]
      ),
      safeQuery('maintenance',
        `SELECT id, description, date, "apparatusName" as apparatus, type, priority
         FROM maintenance WHERE department_id = $2 AND date = $1 AND (status = 'scheduled' OR status = 'Pending')`,
        [todayStr, stationId]
      ),
      safeQuery('meetings',
        `SELECT id, title, meeting_date, meeting_type, location, called_by, status
         FROM meeting_minutes WHERE department_id = $2 AND meeting_date = $1
         ORDER BY created_at`,
        [todayStr, stationId]
      ),
      safeQuery('leave',
        `SELECT lr.id, lr."memberName" as name, lr.type, lr."startDate", lr."endDate"
         FROM leave_requests lr
         WHERE lr.department_id = $2 AND lr.status = 'Approved'
           AND lr."startDate" <= $1 AND lr."endDate" >= $1`,
        [todayStr, stationId]
      ),
    ]);

    console.log(`[dashboard/today] Results — events: ${eventsRes.rows.length}, shifts: ${shiftsRes.rows.length}, training: ${drillsRes.rows.length}, maintenance: ${maintenanceRes.rows.length}, meetings: ${meetingsRes.rows.length}, leave: ${leaveRes.rows.length}`);

    // Build unified timeline items
    const items = [];

    // Calendar events
    for (const e of eventsRes.rows) {
      items.push({
        id: `event-${e.id}`,
        type: 'event',
        time: e.startTime || e.starttime || null,
        end_time: e.endTime || e.endtime || null,
        title: e.title,
        subtitle: e.type,
        location: e.location,
        description: e.description,
        category: e.type,
        module: 'calendar',
        record_id: e.id,
      });
    }

    // Shifts — crew is a JSON string in TEXT column
    for (const s of shiftsRes.rows) {
      let crew = [];
      try {
        const parsed = typeof s.crew === 'string' ? JSON.parse(s.crew) : (s.crew || []);
        crew = Array.isArray(parsed) ? parsed.filter(c => c && (c.name || typeof c === 'string')) : [];
      } catch (e) { /* ignore parse errors */ }
      const shiftType = s.shiftType || 'Day';
      items.push({
        id: `shift-${s.id}`,
        type: 'shift',
        time: shiftType === 'Day' ? '07:00' : shiftType === 'Night' ? '19:00' : '07:00',
        title: `${shiftType} Shift`,
        subtitle: `${crew.length} crew on duty`,
        crew: crew.map(c => typeof c === 'string' ? { name: c } : { name: c.name, rank: c.rank }),
        category: 'shift',
        module: 'shifts',
        record_id: s.id,
      });
    }

    // Drills/Training
    for (const d of drillsRes.rows) {
      items.push({
        id: `drill-${d.id}`,
        type: 'training',
        time: null,
        title: d.title,
        subtitle: d.type,
        location: d.location,
        category: 'training',
        module: 'training',
        record_id: d.id,
      });
    }

    // Maintenance
    for (const m of maintenanceRes.rows) {
      items.push({
        id: `maint-${m.id}`,
        type: 'maintenance',
        time: null,
        title: m.description || 'Scheduled maintenance',
        subtitle: m.apparatus ? `Apparatus: ${m.apparatus}` : (m.type || null),
        category: 'equipment',
        module: 'maintenance',
        record_id: m.id,
      });
    }

    // Meetings
    for (const m of meetingsRes.rows) {
      items.push({
        id: `meeting-${m.id}`,
        type: 'meeting',
        time: null,
        title: m.title,
        subtitle: `${m.meeting_type} meeting`,
        location: m.location,
        called_by: m.called_by,
        status: m.status,
        category: 'meeting',
        module: 'meeting-minutes',
        record_id: m.id,
      });
    }

    // Sort by time (items without time go to end)
    items.sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    // Mark past/current/future
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    for (const item of items) {
      if (item.time) {
        const [h, m] = item.time.split(':').map(Number);
        const itemMinutes = h * 60 + m;
        if (itemMinutes < nowMinutes - 60) item.status_time = 'past';
        else if (itemMinutes <= nowMinutes + 30) item.status_time = 'current';
        else item.status_time = 'upcoming';
      } else {
        item.status_time = 'unscheduled';
      }
    }

    // Extract Duty Officer / Shift Commander from shifts data
    let officer = null;
    const dutyOfficerShift = shiftsRes.rows.find(s => (s.shiftType || '') === 'Duty Officer');
    if (dutyOfficerShift) {
      try {
        const parsed = typeof dutyOfficerShift.crew === 'string'
          ? JSON.parse(dutyOfficerShift.crew) : (dutyOfficerShift.crew || []);
        const first = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
        if (first) {
          const name = typeof first === 'string' ? first : first.name;
          const rank = typeof first === 'object' ? first.rank : null;
          // Look up rank from members table if we only have a name
          if (name && !rank) {
            try {
              const memberRes = await pool.query('SELECT name, rank FROM members WHERE name = $1 AND department_id = $2 LIMIT 1', [name, stationId]);
              if (memberRes.rows.length > 0) {
                officer = { name: memberRes.rows[0].name, rank: memberRes.rows[0].rank };
              } else {
                officer = { name, rank: '' };
              }
            } catch { officer = { name, rank: '' }; }
          } else if (name) {
            officer = { name, rank: rank || '' };
          }
        }
      } catch (e) { console.error('[dashboard/today] Failed to parse duty officer:', e.message); }
    }
    console.log(`[dashboard/today] Returning ${items.length} total items, officer: ${officer ? officer.name : 'NONE'}`);

    res.json({
      date: todayStr,
      day: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      officer,
      items,
      on_leave: leaveRes.rows.map(r => ({
        name: r.name,
        rank: r.rank || '',
        type: r.type,
      })),
      counts: {
        events: eventsRes.rows.length,
        shifts: shiftsRes.rows.length,
        training: drillsRes.rows.length,
        maintenance: maintenanceRes.rows.length,
        meetings: meetingsRes.rows.length,
        on_leave: leaveRes.rows.length,
      },
    });
  } catch (err) {
    console.error('[dashboard/today] error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
