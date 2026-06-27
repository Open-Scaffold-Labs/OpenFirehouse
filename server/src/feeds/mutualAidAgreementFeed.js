'use strict';
/**
 * mutualAidAgreementFeed.js — Calendar feed for mutual aid agreement expirations.
 *
 * Produces entries for agreements that are expiring within the calendar range.
 * Urgency increases as expiration date approaches.
 */
const { pool } = require('../db');

module.exports = async function mutualAidAgreementFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT id, partner_agency, expiration_date, status
    FROM mutual_aid_agreements
    WHERE department_id = $3
      AND expiration_date IS NOT NULL
      AND expiration_date BETWEEN $1 AND $2
    ORDER BY expiration_date
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const expDate = typeof r.expiration_date === 'string'
      ? r.expiration_date
      : r.expiration_date?.toISOString?.()?.slice(0, 10);

    // Calculate days until expiration
    const today = new Date();
    const exp = new Date(expDate);
    const daysUntil = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

    // Determine urgency
    let urgency = 'info';
    let color = 'blue';
    if (daysUntil < 0) {
      urgency = 'overdue';
      color = 'red';
    } else if (daysUntil <= 30) {
      urgency = 'critical';
      color = 'red';
    } else if (daysUntil <= 90) {
      urgency = 'warning';
      color = 'yellow';
    }

    return {
      id: `maa-exp-${r.id}`,
      source_module: 'compliance',
      source_record_id: r.id,
      entry_type: 'expiration',
      category: 'compliance',
      title: `${r.partner_agency} Agreement Expiring`,
      subtitle: `Status: ${r.status || 'active'}`,
      date: expDate,
      end_date: null,
      time: null,
      end_time: null,
      location: null,
      urgency: urgency,
      visibility: ['officer', 'station'],
      member_ids: [],
      clickthrough: '/compliance?tab=mutual-aid-agreements',
      icon: 'handshake',
      color: color,
    };
  });
};
