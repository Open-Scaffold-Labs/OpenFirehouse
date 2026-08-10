'use strict';
/**
 * scbaFeed.js — calendar feed for asset-test due dates (rebuilt in 2.3 / 0084).
 *
 * The pre-0084 version selected columns that never existed on cylinders
 * (serial_number / next_hydro_date / next_flow_date) — every call threw 42703,
 * swallowed by feeds/index.js, so test due dates NEVER reached any calendar.
 * Now derives due dates from the asset-test engine (last event + interval,
 * calendar axis only; targets with no anchor are 'unknown' and don't plot —
 * never guessed).
 */
const { pool } = require('../db');

module.exports = async function scbaFeed(start, end, options) {
  const { rows } = await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (e.test_type_id, e.asset_id)
             e.test_type_id, e.asset_id, e.event_date
        FROM asset_test_events e
       WHERE e.department_id = $3 AND e.deleted_at IS NULL AND e.asset_id IS NOT NULL
       ORDER BY e.test_type_id, e.asset_id, e.event_date DESC, e.id DESC
    )
    SELECT t.id AS asset_id, t.name AS asset_name, t.family,
           tt.id AS type_id, tt.name AS type_name,
           (l.event_date + tt.interval_days) AS due_date
      FROM tracked_assets t
      JOIN asset_test_types tt
        ON tt.department_id = t.department_id AND tt.family = t.family
       AND tt.target = 'asset' AND tt.active = TRUE AND tt.deleted_at IS NULL
      JOIN latest l ON l.test_type_id = tt.id AND l.asset_id = t.id
     WHERE t.department_id = $3 AND t.deleted_at IS NULL
       AND t.status NOT IN ('condemned','retired','out_of_service')
       AND (l.event_date + tt.interval_days) BETWEEN $1::date AND $2::date
     ORDER BY due_date
  `, [start, end, options.stationId]);

  return rows.map((r) => {
    const dt = r.due_date instanceof Date
      ? r.due_date.toISOString().slice(0, 10) : String(r.due_date).slice(0, 10);
    return {
      id: `atest-${r.type_id}-${r.asset_id}`,
      source_module: 'asset_tests',
      source_record_id: r.asset_id,
      entry_type: 'deadline',
      category: 'equipment',
      title: `${r.type_name} — ${r.asset_name}`,
      subtitle: 'Test due',
      date: dt,
      end_date: null, time: null, end_time: null, location: null,
      urgency: 'warning',
      visibility: ['officer', 'station'],
      member_ids: [],
      clickthrough: '/scba',
      icon: 'gauge',
      color: 'yellow',
    };
  });
};
