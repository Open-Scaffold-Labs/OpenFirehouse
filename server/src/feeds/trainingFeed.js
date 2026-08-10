'use strict';
/**
 * trainingFeed.js — Calendar feed for training records AND certification expirations.
 *
 * Produces two kinds of entries:
 *  1. "event" — scheduled training sessions with a date in range
 *  2. "expiration" — cert/qualification expiry dates falling in range (high urgency)
 */
const { pool } = require('../db');

module.exports = async function trainingFeed(start, end, options) {
  // ── Training sessions ─────────────────────────────────────────────────────
  const { rows: sessions } = await pool.query(`
    SELECT id, "courseName" AS title, type, "completedDate" AS date,
           hours, instructor, location, status
    FROM training
    WHERE department_id = $3 AND "completedDate" BETWEEN $1 AND $2
    ORDER BY "completedDate"
  `, [start, end, options.stationId]);

  const sessionEntries = sessions.map(r => ({
    id: `training-${r.id}`,
    source_module: 'training',
    source_record_id: r.id,
    entry_type: 'event',
    category: 'training',
    title: r.title || `${r.type || 'Training'} Session`,
    subtitle: r.instructor ? `Instructor: ${r.instructor}` : `${r.hours || 0}h`,
    date: typeof r.date === 'string' ? r.date : r.date?.toISOString?.()?.slice(0, 10),
    end_date: null,
    time: null,
    end_time: null,
    location: r.location || null,
    urgency: 'info',
    visibility: ['all'],
    member_ids: [],
    clickthrough: '/training',
    icon: 'book-open',
    color: 'indigo',
  }));

  // ── Certification expirations ─────────────────────────────────────────────
  const { rows: certs } = await pool.query(`
    SELECT q.id, q.member_id, q.cert_name, q.expiry_date,
           m.name AS member_name
    FROM member_qualifications q
    LEFT JOIN members m ON m.id = q.member_id
    WHERE q.department_id = $3
      AND q.expiry_date IS NOT NULL
      AND q.expiry_date BETWEEN $1 AND $2
    ORDER BY q.expiry_date
  `, [start, end, options.stationId]);

  const certEntries = certs.map(r => {
    const expDate = typeof r.expiry_date === 'string'
      ? r.expiry_date
      : r.expiry_date?.toISOString?.()?.slice(0, 10);
    return {
      id: `cert-exp-${r.id}`,
      source_module: 'qualifications',
      source_record_id: r.id,
      entry_type: 'expiration',
      category: 'training',
      title: `${r.cert_name} Expiring`,
      subtitle: r.member_name || 'Unknown member',
      date: expDate,
      end_date: null,
      time: null,
      end_time: null,
      location: null,
      urgency: 'critical',
      visibility: ['officer', 'station'],
      member_ids: r.member_id ? [r.member_id] : [],
      clickthrough: '/training?tab=qualifications',
      icon: 'alert-triangle',
      color: 'red',
    };
  });

  return [...sessionEntries, ...certEntries];
};
