'use strict';
/**
 * sogFeed.js — Calendar feed for SOG (Standard Operating Guideline) review dates.
 *
 * Produces entries for SOGs with upcoming or overdue review dates.
 * Urgency increases as review date approaches.
 */
const { pool } = require('../db');

module.exports = async function sogFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT id, number, title, "reviewDate", status
    FROM sogs
    WHERE department_id = $3
      AND "reviewDate" IS NOT NULL
      AND "reviewDate" BETWEEN $1 AND $2
    ORDER BY "reviewDate"
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const revDate = typeof r.reviewDate === 'string'
      ? r.reviewDate
      : r.reviewDate?.toISOString?.()?.slice(0, 10);

    // Calculate days until review
    const today = new Date();
    const rev = new Date(revDate);
    const daysUntil = Math.ceil((rev - today) / (1000 * 60 * 60 * 24));

    // Determine urgency
    let urgency = 'info';
    let color = 'blue';
    if (daysUntil < 0) {
      urgency = 'overdue';
      color = 'red';
    } else if (daysUntil <= 30) {
      urgency = 'critical';
      color = 'red';
    } else if (daysUntil === 0) {
      urgency = 'warning';
      color = 'yellow';
    }

    const sogNumber = r.number ? `${r.number} — ` : '';
    return {
      id: `sog-rev-${r.id}`,
      source_module: 'sogs',
      source_record_id: r.id,
      entry_type: 'deadline',
      category: 'compliance',
      title: `${sogNumber}${r.title} Review Due`,
      subtitle: `Status: ${r.status || 'active'}`,
      date: revDate,
      end_date: null,
      time: null,
      end_time: null,
      location: null,
      urgency: urgency,
      visibility: ['officer', 'station'],
      member_ids: [],
      clickthrough: '/sogs',
      icon: 'book-open',
      color: color,
    };
  });
};
