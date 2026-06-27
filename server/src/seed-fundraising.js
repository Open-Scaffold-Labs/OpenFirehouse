'use strict';
/**
 * seed-fundraising.js — Populate fundraising_campaigns table
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedFundraising() {
  const countResult = await pool.query('SELECT COUNT(*) FROM fundraising_campaigns WHERE station_id = $1', [1]);
  const count = parseInt(countResult.rows[0].count, 10);
  if (count > 0) { console.log('Fundraising campaigns seed: already seeded, skipping.'); return; }

  const SEED = [
    {
      station_id: 1,
      name: 'Annual Fund Drive 2025',
      description: 'General operating fund for station maintenance, equipment upgrades, and member support.',
      type: 'Fund Drive',
      goal_amount: 25000,
      raised_amount: 18500,
      start_date: '2025-01-15',
      end_date: '2025-12-31',
      status: 'active',
      created_by: 1, // Sarah Chen
    },
    {
      station_id: 1,
      name: 'Boot Drive — Labor Day',
      description: 'Community fundraiser held at local businesses and events during Labor Day weekend.',
      type: 'Community Event',
      goal_amount: 5000,
      raised_amount: 5200,
      start_date: '2025-08-15',
      end_date: '2025-09-10',
      status: 'completed',
      created_by: 4, // Sandra Kim
    },
    {
      station_id: 1,
      name: 'Apparatus Fund',
      description: 'Capital campaign for new engine and equipment acquisition, targeting replacement of aging vehicles.',
      type: 'Equipment Purchase',
      goal_amount: 150000,
      raised_amount: 42000,
      start_date: '2025-06-01',
      end_date: null,
      status: 'active',
      created_by: 1, // Sarah Chen
    },
    {
      station_id: 1,
      name: 'Spaghetti Dinner & Silent Auction',
      description: 'Community spaghetti dinner and silent auction fundraiser featuring Italian cuisine, local vendor donations, and raffle prizes. All proceeds support station operations.',
      type: 'Social Event',
      goal_amount: 3500,
      raised_amount: 4100,
      start_date: '2026-03-14',
      end_date: '2026-03-14',
      status: 'completed',
      created_by: 2, // Maria Delgado
    },
    {
      station_id: 1,
      name: 'Annual Golf Tournament',
      description: 'Charity golf tournament at Maplewood Country Club. Four-person teams competing for prizes. Lunch and awards ceremony included. Benefits wildland fire training program.',
      type: 'Sporting Event',
      goal_amount: 8000,
      raised_amount: 0,
      start_date: '2026-05-15',
      end_date: '2026-05-15',
      status: 'Planning',
      created_by: 1, // Sarah Chen
    },
    {
      station_id: 1,
      name: 'Holiday Giving Campaign — Toys for Kids',
      description: 'Annual holiday campaign collecting new toys and gifts for underprivileged children in Maplewood. Fire department delivers donated gifts before Christmas.',
      type: 'Community Outreach',
      goal_amount: 5000,
      raised_amount: 3200,
      start_date: '2025-11-01',
      end_date: '2025-12-20',
      status: 'completed',
      created_by: 4, // Sandra Kim
    },
  ];

  let inserted = 0;
  for (const row of SEED) {
    await pool.query(
      `INSERT INTO fundraising_campaigns (station_id, name, description, type, goal_amount, raised_amount, start_date, end_date, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [
        row.station_id,
        row.name,
        row.description,
        row.type,
        row.goal_amount,
        row.raised_amount,
        row.start_date,
        row.end_date,
        row.status,
        row.created_by,
      ]
    );
    inserted++;
  }
  console.log(`Fundraising campaigns seed: ${inserted} campaigns inserted.`);
};
