'use strict';
/**
 * seed-personnelActions.js — Populate personnel_actions table
 * Schema: member_id, station_id, action_type, action_date, description, details (JSONB), issued_by, status, attachments, created_at
 * Looks up real member IDs to avoid FK violations.
 */

const { pool } = require('./db');

module.exports = async function seedPersonnelActions() {
  const countResult = await pool.query('SELECT COUNT(*) FROM personnel_actions WHERE station_id = $1', [1]);
  const count = parseInt(countResult.rows[0].count, 10);
  if (count > 0) { console.log('Personnel actions seed: already seeded, skipping.'); return; }

  const { rows: members } = await pool.query('SELECT id FROM members WHERE station_id = 1 ORDER BY id LIMIT 7');
  if (members.length < 2) { console.log('Personnel actions seed: not enough members, skipping.'); return; }
  const mid = (idx) => members[Math.min(idx, members.length - 1)].id;

  const SEED = [
    {
      mIdx: 1,
      action_type: 'promotion',
      action_date: '2026-01-15',
      description: 'Promoted to Lieutenant — based on test score (92%) and 8 years of service',
      details: JSON.stringify({ notes: 'Promotion approved by board vote on 1/10/2026. Formal ceremony held on 1/15/2026.' }),
      issued_by: 'Sarah Chen',
      status: 'active',
    },
    {
      mIdx: 3,
      action_type: 'certification_earned',
      action_date: '2026-02-20',
      description: 'Achieved Firefighter II certification (NFPA 1001 Level II)',
      details: JSON.stringify({ notes: 'Completed state exam and practical skills test. Certificate on file. Eligible for interior operations.' }),
      issued_by: 'Sandra Kim',
      status: 'active',
    },
    {
      mIdx: 6,
      action_type: 'probation_completed',
      action_date: '2026-03-01',
      description: 'Probationary period completed — full member status effective',
      details: JSON.stringify({ notes: 'Member completed 6-month probation satisfactorily. Recommend renewal for 3-year commitment.' }),
      issued_by: 'Sarah Chen',
      status: 'active',
    },
    {
      mIdx: 4,
      action_type: 'leave_of_absence',
      action_date: '2026-03-15',
      description: 'Leave of absence — personal reasons (family relocation)',
      details: JSON.stringify({ notes: 'Approved for 6-month LOA starting 3/15. Expected return date: 9/15/2026. Maintain membership status.' }),
      issued_by: 'Sarah Chen',
      status: 'active',
    },
    {
      mIdx: 5,
      action_type: 'disciplinary_warning',
      action_date: '2026-02-25',
      description: 'Written warning — violation of vehicle operation procedures',
      details: JSON.stringify({ notes: 'Unsafe backing of apparatus during training. Repeat driver education required. Review on 5/25/2026.' }),
      issued_by: 'Nathan McGee',
      status: 'active',
    },
    {
      mIdx: 2,
      action_type: 'retirement',
      action_date: '2026-02-28',
      description: 'Retirement from Maplewood VFD — 22 years of service',
      details: JSON.stringify({ notes: 'Member retiring with pension eligibility. Final shift worked 2/28/2026. Retirement party held 3/6/2026. Emeritus status granted.' }),
      issued_by: 'Sarah Chen',
      status: 'inactive',
    },
    {
      mIdx: 0,
      action_type: 'new_hire',
      action_date: '2026-03-10',
      description: 'New hire appointment — Firefighter Academy graduate',
      details: JSON.stringify({ notes: 'Completed state Firefighter Academy. Certified Firefighter I & II. Assigned to B-Shift. Probation period: 6 months ending 9/10/2026.' }),
      issued_by: 'Sarah Chen',
      status: 'active',
    },
    {
      mIdx: 2,
      action_type: 'reassignment',
      action_date: '2026-03-01',
      description: 'Shift reassignment from A-Shift to B-Shift',
      details: JSON.stringify({ notes: 'Voluntary shift change for family schedule accommodation. Effective 3/1/2026. Station assignment: Engine 14, Ladder 14.' }),
      issued_by: 'Nathan McGee',
      status: 'active',
    },
    {
      mIdx: 4,
      action_type: 'special_assignment',
      action_date: '2026-02-15',
      description: 'Special assignment — Training Officer designation',
      details: JSON.stringify({ notes: 'Appointed as Training Officer for recruit training program. Responsible for curriculum development and instructor coordination. 6-month assignment with renewal option.' }),
      issued_by: 'Sarah Chen',
      status: 'active',
    },
    {
      mIdx: 6,
      action_type: 'annual_review',
      action_date: '2026-03-08',
      description: 'Annual performance review — Exceeds Expectations',
      details: JSON.stringify({ notes: 'Rating: 4.2/5.0. Strengths: Reliability, teamwork, technical competency. Areas for development: Mentoring junior staff. Merit increase 3% recommended.' }),
      issued_by: 'Nathan McGee',
      status: 'active',
    },
  ];

  let inserted = 0;
  for (const row of SEED) {
    await pool.query(
      `INSERT INTO personnel_actions (station_id, member_id, action_type, action_date, description, details, issued_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [1, mid(row.mIdx), row.action_type, row.action_date, row.description, row.details, row.issued_by, row.status]
    );
    inserted++;
  }
  console.log(`Personnel actions seed: ${inserted} actions inserted.`);
};
