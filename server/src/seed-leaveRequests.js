'use strict';
/**
 * seed-leaveRequests.js — Populate leave_requests table
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedLeaveRequests() {
  const countResult = await pool.query('SELECT COUNT(*) FROM leave_requests WHERE station_id = $1', [1]);
  const count = parseInt(countResult.rows[0].count, 10);
  if (count > 0) { console.log('Leave requests seed: already seeded, skipping.'); return; }

  // Fetch all members to enable dynamic ID lookup
  const { rows: members } = await pool.query('SELECT id, name, rank FROM members WHERE station_id = 1 ORDER BY id');
  if (members.length === 0) { console.log('Leave requests seed: no members found, skipping.'); return; }

  const m = (name) => members.find(r => r.name === name);

  const SEED = [
    {
      station_id: 1,
      member_id: m('Sarah Chen').id,
      leave_type: 'vacation',
      start_date: '2026-03-20',
      end_date: '2026-03-27',
      reason: 'Annual vacation — planned family trip to Florida',
      status: 'Approved',
      approved_by: 'Sarah Chen',
      created_at: new Date('2026-03-01').toISOString(),
    },
    {
      station_id: 1,
      member_id: m('Maria Delgado').id,
      leave_type: 'personal',
      start_date: '2026-04-10',
      end_date: '2026-04-12',
      reason: 'Family commitment — assist with parent relocation',
      status: 'Approved',
      approved_by: 'Sarah Chen',
      created_at: new Date('2026-03-05').toISOString(),
    },
    {
      station_id: 1,
      member_id: m('Nathan McGee').id,
      leave_type: 'medical',
      start_date: '2026-03-15',
      end_date: '2026-04-05', // estimated return (~3 weeks); leave_requests."endDate" is NOT NULL
      reason: 'Minor surgery follow-up — expected return after 3 weeks',
      status: 'Pending',
      approved_by: null,
      created_at: new Date('2026-03-12').toISOString(),
    },
    {
      station_id: 1,
      member_id: m('Sandra Kim').id,
      leave_type: 'vacation',
      start_date: '2026-04-05',
      end_date: '2026-04-08',
      reason: 'Vacation request — conflicts with scheduled drill',
      status: 'Denied',
      approved_by: 'Sarah Chen',
      created_at: new Date('2026-02-28').toISOString(),
    },
    {
      station_id: 1,
      member_id: m('James Ortega').id,
      leave_type: 'sick',
      start_date: '2026-02-10',
      end_date: '2026-02-12',
      reason: 'Illness — flu-like symptoms',
      status: 'Approved',
      approved_by: 'Maria Delgado',
      created_at: new Date('2026-02-09').toISOString(),
    },
    {
      station_id: 1,
      member_id: m('Tracy Benson').id,
      leave_type: 'training',
      start_date: '2026-03-25',
      end_date: '2026-03-27',
      reason: 'Certified Pump Operator training course',
      status: 'Approved',
      approved_by: 'Sarah Chen',
      created_at: new Date('2026-02-20').toISOString(),
    },
    {
      station_id: 1,
      member_id: m('Lisa Fontaine').id,
      leave_type: 'vacation',
      start_date: '2026-04-17',
      end_date: '2026-04-24',
      reason: 'Vacation — annual family trip to Outer Banks',
      status: 'Approved',
      approved_by: 'Sarah Chen',
      created_at: new Date('2026-03-10').toISOString(),
    },
    {
      station_id: 1,
      member_id: m('Kevin Marsh').id,
      leave_type: 'bereavement',
      start_date: '2026-02-18',
      end_date: '2026-02-20',
      reason: 'Death of grandmother — funeral services',
      status: 'Approved',
      approved_by: 'Maria Delgado',
      created_at: new Date('2026-02-17').toISOString(),
    },
  ];

  // Build a memberId → name lookup so we can populate "memberName" directly
  // (the column is NOT NULL and we ran into NULL violations with a subquery).
  const idToName = new Map(members.map(m2 => [m2.id, m2.name]));

  let inserted = 0;
  for (const row of SEED) {
    const memberName = idToName.get(row.member_id) || 'Unknown';
    await pool.query(
      `INSERT INTO leave_requests (station_id, "memberId", "memberName", type, "startDate", "endDate", reason, status, "approvedBy", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING`,
      [
        row.station_id,
        row.member_id,
        memberName,
        row.leave_type,
        row.start_date,
        row.end_date,
        row.reason,
        row.status,
        row.approved_by,
        row.created_at,
      ]
    );
    inserted++;
  }
  console.log(`Leave requests seed: ${inserted} requests inserted.`);
};
