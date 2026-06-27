'use strict';
/**
 * communityFeed.js — Calendar feed for community outreach events.
 *
 * Queries the community_events table for events in the given date range.
 */
const { pool } = require('../db');

module.exports = async function communityFeed(start, end, options) {
  try {
    const { rows } = await pool.query(`
      SELECT id, title, date, location, event_type, status, audience_type, actual_attendance
      FROM community_events
      WHERE department_id = $3
        AND date BETWEEN $1 AND $2
      ORDER BY date ASC
    `, [start, end, options.stationId]);

    return rows.map(r => {
      const evtDate = typeof r.date === 'string'
        ? r.date
        : r.date?.toISOString?.()?.slice(0, 10);

      const audienceLabel = r.audience_type === 'mixed'
        ? 'Community Event'
        : `${r.audience_type} Audience`;

      const attendanceInfo = r.actual_attendance
        ? ` · ${r.actual_attendance} attendees`
        : '';

      return {
        id: `comm-evt-${r.id}`,
        source_module: 'community-outreach',
        source_record_id: r.id,
        entry_type: 'event',
        category: 'community',
        title: r.title || 'Community Event',
        subtitle: `${r.event_type || 'Outreach'} · ${audienceLabel}${attendanceInfo}`,
        date: evtDate,
        end_date: null,
        time: null,
        end_time: null,
        location: r.location || null,
        urgency: 'info',
        visibility: ['all'],
        member_ids: [],
        clickthrough: '/community-outreach',
        icon: 'heart',
        color: 'green',
      };
    });
  } catch (err) {
    console.error('Error in communityFeed:', err);
    return [];
  }
};
