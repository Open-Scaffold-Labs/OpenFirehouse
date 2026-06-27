'use strict';
/**
 * personnelFeed.js — Calendar feed for personnel actions (promotions, ceremonies, hearings, etc).
 *
 * Produces entries for personnel events like promotions, disciplinary hearings, and commendations.
 * Disciplinary hearings marked as warnings; others are info level.
 */
const { pool } = require('../db');

module.exports = async function personnelFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT pa.id, pa.member_id, pa.action_type, pa.action_date, pa.description, pa.status,
           m.name AS member_name
    FROM personnel_actions pa
    LEFT JOIN members m ON m.id = pa.member_id
    WHERE pa.department_id = $3
      AND pa.action_date BETWEEN $1 AND $2
    ORDER BY pa.action_date
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const actDate = typeof r.action_date === 'string'
      ? r.action_date
      : r.action_date?.toISOString?.()?.slice(0, 10);

    // Determine urgency based on action type
    const isDisciplinary = r.action_type?.toLowerCase().includes('disciplinary') ||
                          r.action_type?.toLowerCase().includes('hearing');
    const urgency = isDisciplinary ? 'warning' : 'info';
    const color = isDisciplinary ? 'orange' : 'pink';

    // Format action type for title
    const actionLabel = r.action_type || 'Personnel Action';
    const titleCase = actionLabel
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    return {
      id: `pa-${r.id}`,
      source_module: 'personnel_actions',
      source_record_id: r.id,
      entry_type: 'event',
      category: 'personnel',
      title: titleCase,
      subtitle: r.member_name || 'Unknown member',
      date: actDate,
      end_date: null,
      time: null,
      end_time: null,
      location: null,
      urgency: urgency,
      visibility: ['officer', 'station'],
      member_ids: r.member_id ? [r.member_id] : [],
      clickthrough: '/personnel-actions',
      icon: 'user-check',
      color: color,
    };
  });
};
