'use strict';
/**
 * seed-donations.js — Populate donations table with demo donation records.
 * Links to fundraising_campaigns where applicable.
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedDonations() {
  const { rows } = await pool.query('SELECT COUNT(*) FROM donations WHERE station_id = $1', [1]);
  if (parseInt(rows[0].count) > 0) {
    console.log('Donations seed: already seeded, skipping.');
    return;
  }

  // Get existing campaigns to link donations
  const { rows: campaigns } = await pool.query(
    'SELECT id, name FROM fundraising_campaigns WHERE station_id = $1 ORDER BY id',
    [1]
  );

  // Map campaign names to IDs (fallback to null if campaigns haven't been seeded)
  const campaignMap = {};
  for (const c of campaigns) {
    campaignMap[c.name] = c.id;
  }

  const donations = [
    // Annual Fund Drive donations
    {
      campaign_id: campaignMap['Annual Fund Drive 2025'] || null,
      donor_name: 'Robert & Linda Henderson',
      donor_email: 'henderson.family@gmail.com',
      donor_phone: '651-555-0142',
      donor_address: '892 County Road 12, Maplewood, MN',
      amount: 500,
      method: 'Check',
      reference: 'Check #4512',
      receipt_sent: true,
      notes: 'Annual donation — long-time supporter. Thank-you letter sent.',
      donated_at: '2025-02-10',
    },
    {
      campaign_id: campaignMap['Annual Fund Drive 2025'] || null,
      donor_name: 'Maplewood Rotary Club',
      donor_email: 'treasurer@maplewoodrotary.org',
      donor_phone: '651-555-0300',
      donor_address: '1830 County Rd B E, Maplewood, MN',
      amount: 2500,
      method: 'Check',
      reference: 'Check #8801',
      receipt_sent: true,
      notes: 'Annual organizational grant from Rotary. Requested plaque acknowledgment.',
      donated_at: '2025-03-15',
    },
    {
      campaign_id: campaignMap['Annual Fund Drive 2025'] || null,
      donor_name: 'Janet Wilson',
      donor_email: 'jwilson55@yahoo.com',
      donor_phone: '651-555-0188',
      donor_address: '1455 Larpenteur Ave, Maplewood, MN',
      amount: 100,
      method: 'Cash',
      reference: '',
      receipt_sent: true,
      notes: 'Dropped off at station during open house.',
      donated_at: '2025-04-20',
    },
    // Boot Drive donations
    {
      campaign_id: campaignMap['Boot Drive — Labor Day'] || null,
      donor_name: 'Anonymous — Cub Foods Location',
      donor_email: '',
      donor_phone: '',
      donor_address: '',
      amount: 1842.50,
      method: 'Cash',
      reference: 'Boot Drive Bag #1',
      receipt_sent: false,
      notes: 'Collected at Cub Foods on White Bear Ave during Labor Day weekend.',
      donated_at: '2025-09-01',
    },
    {
      campaign_id: campaignMap['Boot Drive — Labor Day'] || null,
      donor_name: 'Anonymous — Target Location',
      donor_email: '',
      donor_phone: '',
      donor_address: '',
      amount: 1356.25,
      method: 'Cash',
      reference: 'Boot Drive Bag #2',
      receipt_sent: false,
      notes: 'Collected at Target on Beam Ave during Labor Day weekend.',
      donated_at: '2025-09-01',
    },
    // Apparatus Fund donations
    {
      campaign_id: campaignMap['Apparatus Fund'] || null,
      donor_name: 'Midwest Steel Fabrication',
      donor_email: 'accounting@midweststeel.com',
      donor_phone: '651-555-0450',
      donor_address: '45 Commerce Blvd, Maplewood, MN',
      amount: 10000,
      method: 'Wire Transfer',
      reference: 'Wire Ref #WR-2025-0892',
      receipt_sent: true,
      notes: 'Corporate sponsorship — major local employer. Requested logo on apparatus if purchased.',
      donated_at: '2025-07-01',
    },
    {
      campaign_id: campaignMap['Apparatus Fund'] || null,
      donor_name: 'Maplewood Lions Club',
      donor_email: 'lions@maplewoodlions.org',
      donor_phone: '651-555-0225',
      donor_address: '100 Civic Center Dr, Maplewood, MN',
      amount: 5000,
      method: 'Check',
      reference: 'Check #LC-2241',
      receipt_sent: true,
      notes: 'Annual contribution from Lions Club fundraising proceeds.',
      donated_at: '2025-08-15',
    },
    // Spaghetti dinner revenue
    {
      campaign_id: campaignMap['Spaghetti Dinner & Silent Auction'] || null,
      donor_name: 'Ticket Sales — Spaghetti Dinner',
      donor_email: '',
      donor_phone: '',
      donor_address: '',
      amount: 2800,
      method: 'Mixed',
      reference: 'Event Revenue',
      receipt_sent: false,
      notes: '140 tickets sold at $20 each. Mix of cash and card payments.',
      donated_at: '2026-03-14',
    },
    {
      campaign_id: campaignMap['Spaghetti Dinner & Silent Auction'] || null,
      donor_name: 'Silent Auction Proceeds',
      donor_email: '',
      donor_phone: '',
      donor_address: '',
      amount: 1300,
      method: 'Mixed',
      reference: 'Auction Revenue',
      receipt_sent: false,
      notes: '22 auction items. Top item: signed Vikings jersey ($350).',
      donated_at: '2026-03-14',
    },
    // Toys for Kids donations
    {
      campaign_id: campaignMap['Holiday Giving Campaign — Toys for Kids'] || null,
      donor_name: 'Community Donations — Toy Drive',
      donor_email: '',
      donor_phone: '',
      donor_address: '',
      amount: 3200,
      method: 'Mixed',
      reference: 'Toy Drive 2025',
      receipt_sent: false,
      notes: 'Combined cash and toy donations (estimated value). 45 families served.',
      donated_at: '2025-12-15',
    },
    // Individual supporter
    {
      campaign_id: null,
      donor_name: 'Tom & Maria Schultz',
      donor_email: 'tschultz@comcast.net',
      donor_phone: '651-555-0399',
      donor_address: '720 Prosperity Ave, Maplewood, MN',
      amount: 250,
      method: 'Check',
      reference: 'Check #1204',
      receipt_sent: true,
      notes: 'General donation — not linked to specific campaign. Family lost home to fire in 2020, grateful for FD response.',
      donated_at: '2026-01-20',
    },
    {
      campaign_id: null,
      donor_name: 'ABC Chemical Corp',
      donor_email: 'community@abcchem.com',
      donor_phone: '651-555-0451',
      donor_address: '45 Commerce Blvd — Suite 100, Maplewood, MN',
      amount: 1000,
      method: 'Check',
      reference: 'Check #CC-8832',
      receipt_sent: true,
      notes: 'Annual community safety partnership contribution.',
      donated_at: '2026-02-01',
    },
  ];

  let inserted = 0;
  for (const d of donations) {
    await pool.query(
      `INSERT INTO donations (station_id, campaign_id, donor_name, donor_email, donor_phone, donor_address, amount, method, reference, receipt_sent, notes, donated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT DO NOTHING`,
      [
        1, d.campaign_id, d.donor_name, d.donor_email, d.donor_phone,
        d.donor_address, d.amount, d.method, d.reference, d.receipt_sent,
        d.notes, d.donated_at,
      ]
    );
    inserted++;
  }

  console.log(`Donations seed complete: ${inserted} inserted.`);
};
