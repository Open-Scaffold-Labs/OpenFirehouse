'use strict';
/**
 * shiftTradeFeed.js — Calendar feed for approved shift trades.
 */
const { pool } = require('../db');

module.exports = async function shiftTradeFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT st.id, st.trade_date AS date, st.status,
           m1.name AS requester_name, m2.name AS covering_name,
           st.requesting_member_id AS requester_id,
           st.covering_member_id AS covering_id
    FROM shift_trades st
    LEFT JOIN members m1 ON m1.id = st.requesting_member_id
    LEFT JOIN members m2 ON m2.id = st.covering_member_id
    WHERE st.department_id = $3
      AND st.status = 'approved'
      AND st.trade_date BETWEEN $1 AND $2
    ORDER BY st.trade_date
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const dt = typeof r.date === 'string'
      ? r.date : r.date?.toISOString?.()?.slice(0, 10);
    const ids = [r.requester_id, r.covering_id].filter(Boolean);
    return {
      id: `trade-${r.id}`,
      source_module: 'shift-trades',
      source_record_id: r.id,
      entry_type: 'event',
      category: 'shifts',
      title: 'Shift Trade',
      subtitle: `${r.requester_name || '?'} ↔ ${r.covering_name || '?'}`,
      date: dt,
      end_date: null, time: null, end_time: null, location: null,
      urgency: 'info',
      visibility: ['officer', 'station'],
      member_ids: ids,
      clickthrough: '/schedule?tab=trades',
      icon: 'repeat',
      color: 'violet',
    };
  });
};
