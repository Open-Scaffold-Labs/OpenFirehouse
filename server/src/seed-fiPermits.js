'use strict';
/**
 * seed-fiPermits.js — Populate fi_permits table with fire permit data.
 * Covers various permit types: burn permits, occupancy, pyrotechnics, etc.
 */

const { pool } = require('./db');

module.exports = async function seedFirePermits() {
  const { rows } = await pool.query('SELECT COUNT(*) FROM fi_permits WHERE station_id = $1', [1]);
  if (parseInt(rows[0].count) > 0) {
    console.log('Fire permits seed: already seeded, skipping.');
    return;
  }

  const permits = [
    {
      permit_number: 'FP-2026-001',
      permit_type: 'Open Burning',
      applicant_name: 'Robert Henderson',
      applicant_address: '892 County Road 12, Maplewood, MN',
      applicant_phone: '651-555-0142',
      property_address: '892 County Road 12, Maplewood, MN',
      description: 'Brush and yard waste burning on rural residential property. Pile not to exceed 4 ft diameter. Attended at all times.',
      conditions: JSON.stringify(['Burn pile must be at least 50 ft from any structure', 'Must have charged garden hose within reach', 'Wind speed must be below 10 mph', 'Burning only between 0800-1800', 'No burning of treated lumber, plastics, or household waste']),
      issued_date: '2026-03-01',
      expiration_date: '2026-04-30',
      issued_by: 4, // Sandra Kim
      status: 'active',
      fee: 0,
    },
    {
      permit_number: 'FP-2026-002',
      permit_type: 'Temporary Occupancy',
      applicant_name: 'Maplewood Community Center',
      applicant_address: '200 White Bear Ave, Maplewood, MN',
      applicant_phone: '651-555-0200',
      property_address: '200 White Bear Ave, Maplewood, MN',
      description: 'Temporary increase in occupancy from 200 to 350 for annual charity gala on March 22, 2026. Additional exits and fire watch required.',
      conditions: JSON.stringify(['Fire watch must be posted at all exits during event', 'All exit paths must remain clear and illuminated', 'No open flame decorations', 'Fire extinguishers at all exits plus 2 additional', 'Emergency evacuation plan must be posted at entrance']),
      issued_date: '2026-03-10',
      expiration_date: '2026-03-23',
      issued_by: 2, // Maria Delgado
      status: 'active',
      fee: 75,
    },
    {
      permit_number: 'FP-2026-003',
      permit_type: 'Pyrotechnics/Fireworks',
      applicant_name: 'Maplewood Parks & Recreation',
      applicant_address: '1830 County Rd B E, Maplewood, MN',
      applicant_phone: '651-555-0300',
      property_address: 'Maplewood Nature Center — South Field',
      description: 'Professional fireworks display for July 4th celebration. Licensed pyrotechnician (Pyro Spectaculars) contracted. Estimated 500+ attendees.',
      conditions: JSON.stringify(['Licensed pyrotechnician must be on-site', 'Fallout zone of 300 ft must be secured', 'Fire apparatus must be staged within 500 ft during display', 'Weather conditions must meet NFPA 1123 requirements', 'Rain date: July 5, 2026', 'Post-display sweep required within 1 hour']),
      issued_date: '2026-02-15',
      expiration_date: '2026-07-06',
      issued_by: 1, // Sarah Chen
      status: 'active',
      fee: 250,
    },
    {
      permit_number: 'FP-2025-018',
      permit_type: 'Hot Work',
      applicant_name: 'Midwest Steel Fabrication',
      applicant_address: '45 Commerce Blvd, Maplewood, MN',
      applicant_phone: '651-555-0450',
      property_address: '45 Commerce Blvd — Bay 3, Maplewood, MN',
      description: 'Welding and cutting operations for structural steel fabrication. Ongoing hot work in designated welding bay with fire-rated curtains and ventilation.',
      conditions: JSON.stringify(['Fire watch for 30 min after each hot work session', 'Combustibles cleared within 35 ft', 'Fire extinguisher within 10 ft of work area', 'Sprinkler system must remain operational', 'Daily hot work log maintained']),
      issued_date: '2025-09-01',
      expiration_date: '2026-08-31',
      issued_by: 4,
      status: 'active',
      fee: 150,
    },
    {
      permit_number: 'FP-2025-012',
      permit_type: 'Hazardous Materials Storage',
      applicant_name: 'ABC Chemical Corp',
      applicant_address: '45 Commerce Blvd — Suite 100, Maplewood, MN',
      applicant_phone: '651-555-0451',
      property_address: '45 Commerce Blvd — Suite 100, Maplewood, MN',
      description: 'Storage of flammable liquids (acetone, toluene) exceeding exempt amounts per IFC Table 5003.1.1. Storage in approved flammable liquid cabinet.',
      conditions: JSON.stringify(['Maximum 120 gallons in approved cabinet', 'Secondary containment required', 'SDS maintained within 20 ft of storage', 'Annual inspection required', 'Emergency shutoff clearly labeled', 'Incompatible materials separated per IFC 5003.9.8']),
      issued_date: '2025-06-01',
      expiration_date: '2026-05-31',
      issued_by: 1,
      status: 'active',
      fee: 200,
    },
    {
      permit_number: 'FP-2025-008',
      permit_type: 'Open Burning',
      applicant_name: 'Janet Wilson',
      applicant_address: '1455 Larpenteur Ave, Maplewood, MN',
      applicant_phone: '651-555-0188',
      property_address: '1455 Larpenteur Ave, Maplewood, MN',
      description: 'Fall leaf and brush burning on residential property.',
      conditions: JSON.stringify(['Attended at all times', 'Wind below 10 mph', 'Garden hose within reach']),
      issued_date: '2025-10-01',
      expiration_date: '2025-11-30',
      issued_by: 4,
      status: 'expired',
      fee: 0,
    },
  ];

  let inserted = 0;
  for (const p of permits) {
    await pool.query(
      `INSERT INTO fi_permits (station_id, permit_number, permit_type, applicant_name, applicant_address, applicant_phone, property_address, description, conditions, issued_date, expiration_date, issued_by, status, fee, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [1, p.permit_number, p.permit_type, p.applicant_name, p.applicant_address, p.applicant_phone, p.property_address, p.description, p.conditions, p.issued_date, p.expiration_date, p.issued_by, p.status, p.fee]
    );
    inserted++;
  }

  console.log(`Fire permits seed complete: ${inserted} inserted.`);
};
