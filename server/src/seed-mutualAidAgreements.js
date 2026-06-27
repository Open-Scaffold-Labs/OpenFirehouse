'use strict';
/**
 * seed-mutualAidAgreements.js — Populate mutual_aid_agreements table
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedMutualAidAgreements() {
  const countResult = await pool.query('SELECT COUNT(*) FROM mutual_aid_agreements WHERE station_id = $1', [1]);
  const count = parseInt(countResult.rows[0].count, 10);
  if (count > 0) { console.log('Mutual aid agreements seed: already seeded, skipping.'); return; }

  const SEED = [
    {
      station_id: 1,
      partner_agency: 'Maplewood Township Fire Department',
      partner_fdid: 'NJ-MT-001',
      partner_contact: 'Chief Michael J. Patterson',
      partner_phone: '(201) 555-0147',
      partner_email: 'chief@mapletownfd.nj.gov',
      agreement_type: 'automatic',
      services: JSON.stringify(['Structure Fire Response', 'MVA with Entrapment', 'Hazmat Awareness']),
      effective_date: '2020-06-01',
      expiration_date: '2030-05-31',
      auto_renew: true,
      distance_miles: 2.5,
      response_time_min: 8,
      status: 'active',
      document_ref: 'MA-Maplewood-Township-2020.pdf',
      notes: 'Long-standing agreement with neighboring township. Works well — frequent calls together. Annual review meeting in June.',
    },
    {
      station_id: 1,
      partner_agency: 'Maplewood Borough Fire Company',
      partner_fdid: 'NJ-MB-042',
      partner_contact: 'President Robert L. Chen',
      partner_phone: '(201) 555-0198',
      partner_email: 'president@mapleborofd.nj.org',
      agreement_type: 'automatic',
      services: JSON.stringify(['Structure Fire Response', 'Rescue Operations', 'Water Supply']),
      effective_date: '2019-01-15',
      expiration_date: '2029-01-14',
      auto_renew: true,
      distance_miles: 1.2,
      response_time_min: 6,
      status: 'active',
      document_ref: 'MA-Maplewood-Borough-2019.pdf',
      notes: 'Good working relationship. Both departments share some apparatus training. Annual joint drill every October.',
    },
    {
      station_id: 1,
      partner_agency: 'Essex County Hazmat Team',
      partner_fdid: 'NJ-EC-HAZ',
      partner_contact: 'Hazmat Coordinator Dr. Sarah V. Martinez',
      partner_phone: '(201) 555-0266',
      partner_email: 'hazmat@essexcounty.nj.gov',
      agreement_type: 'request',
      services: JSON.stringify(['Hazmat Response', 'Chemical Spill Cleanup', 'Decontamination']),
      effective_date: '2021-03-01',
      expiration_date: '2028-02-28',
      auto_renew: false,
      distance_miles: 8.5,
      response_time_min: 20,
      status: 'active',
      document_ref: 'MA-Essex-County-Hazmat-2021.pdf',
      notes: 'Requested response only. County unit based in Central station. Request submitted via dispatch.',
    },
    {
      station_id: 1,
      partner_agency: 'North Jersey Regional Mutual Aid Network',
      partner_fdid: 'NJ-NRMAN',
      partner_contact: 'Network Coordinator Lt. James P. Williams',
      partner_phone: '(201) 555-0319',
      partner_email: 'coordinator@njrman.org',
      agreement_type: 'regional',
      services: JSON.stringify(['Large Incident Response', 'Mass Casualty Events', 'Specialized Rescue']),
      effective_date: '2018-09-01',
      expiration_date: '2028-08-31',
      auto_renew: true,
      distance_miles: 15.0,
      response_time_min: 30,
      status: 'active',
      document_ref: 'MA-NJ-RMA-Network-2018.pdf',
      notes: 'Regional network with 47 departments. Mutual aid dispatch via county CAD system. Request submitted through dispatch.',
    },
  ];

  let inserted = 0;
  for (const row of SEED) {
    await pool.query(
      `INSERT INTO mutual_aid_agreements (station_id, partner_agency, partner_fdid, partner_contact, partner_phone, partner_email, agreement_type, services, effective_date, expiration_date, auto_renew, distance_miles, response_time_min, status, document_ref, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
       ON CONFLICT DO NOTHING`,
      [
        row.station_id,
        row.partner_agency,
        row.partner_fdid,
        row.partner_contact,
        row.partner_phone,
        row.partner_email,
        row.agreement_type,
        row.services,
        row.effective_date,
        row.expiration_date,
        row.auto_renew,
        row.distance_miles,
        row.response_time_min,
        row.status,
        row.document_ref,
        row.notes,
      ]
    );
    inserted++;
  }
  console.log(`Mutual aid agreements seed: ${inserted} agreements inserted.`);
};
