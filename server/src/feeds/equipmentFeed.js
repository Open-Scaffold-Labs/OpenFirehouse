'use strict';
/**
 * equipmentFeed.js — Calendar feed for equipment checkout return deadlines.
 *
 * Produces entries for checked-out equipment with upcoming or overdue return dates.
 * Only shows items with status 'checked_out' or 'overdue'.
 */
const { pool } = require('../db');

module.exports = async function equipmentFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT ec.id, ec.item_name, ec.expected_return, ec.checked_out_by, ec.status
    FROM equipment_checkout ec
    WHERE ec.department_id = $3
      AND ec.status IN ('checked_out', 'overdue')
      AND ec.expected_return IS NOT NULL
      AND DATE(ec.expected_return) BETWEEN $1 AND $2
    ORDER BY ec.expected_return
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const retDate = typeof r.expected_return === 'string'
      ? r.expected_return.slice(0, 10)
      : r.expected_return?.toISOString?.()?.slice(0, 10);

    // Calculate days until return
    const today = new Date();
    const ret = new Date(r.expected_return);
    const daysUntil = Math.ceil((ret - today) / (1000 * 60 * 60 * 24));

    // Determine urgency
    let urgency = 'info';
    let color = 'blue';
    if (r.status === 'overdue' || daysUntil < 0) {
      urgency = 'overdue';
      color = 'red';
    } else if (daysUntil <= 2) {
      urgency = 'critical';
      color = 'red';
    } else if (daysUntil <= 7) {
      urgency = 'warning';
      color = 'yellow';
    }

    return {
      id: `equip-ret-${r.id}`,
      source_module: 'equipment_checkout',
      source_record_id: r.id,
      entry_type: 'deadline',
      category: 'equipment',
      title: `${r.item_name} Return Due`,
      subtitle: `Status: ${r.status === 'checked_out' ? 'checked out' : 'overdue'}`,
      date: retDate,
      end_date: null,
      time: null,
      end_time: null,
      location: null,
      urgency: urgency,
      visibility: ['all'],
      member_ids: r.checked_out_by ? [r.checked_out_by] : [],
      clickthrough: '/equipment-checkout',
      icon: 'package',
      color: color,
    };
  });
};
