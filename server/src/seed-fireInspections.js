'use strict';
/**
 * seed-fireInspections.js — 5 properties, 5 inspections, 4 permits.
 * Skips if already seeded.
 */

const { fiProperties, fiInspections, fiPermits } = require('./db');

module.exports = async function seedFireInspections() {
  const existingProps = await fiProperties.all(1);
  if (existingProps.length > 0) { console.log('Fire inspections seed: already seeded, skipping.'); return; }

// ── Properties ──────────────────────────────────────────────────────────────
const PROPERTIES = [
  {
    name: 'Maplewood Town Center Mall',
    address: '1200 Commerce Blvd, Maplewood, MN 55117',
    occupancyType: 'Mercantile / Assembly',
    propertyUseCode: '580',
    ownerName: 'Maplewood Properties LLC',
    ownerPhone: '651-555-0101',
    ownerEmail: 'mgmt@maplewoodtowncenter.com',
    contactName: 'Frank Russo',
    contactPhone: '651-555-0102',
    squareFootage: 142000,
    stories: 2,
    occupantLoad: 1800,
    sprinklered: true,
    alarmMonitored: true,
    hazmatOnsite: false,
    notes: 'Main entrance on Commerce Blvd. Fire command panel at main security desk.',
  },
  {
    name: 'Maplewood Elementary School',
    address: '88 Ridgeline Court, Maplewood, MN 55117',
    occupancyType: 'Educational',
    propertyUseCode: '213',
    ownerName: 'Maplewood School District #622',
    ownerPhone: '651-555-0200',
    ownerEmail: 'facilities@maplewoodisd622.org',
    contactName: 'Sharon Tran',
    contactPhone: '651-555-0201',
    squareFootage: 38400,
    stories: 1,
    occupantLoad: 520,
    sprinklered: true,
    alarmMonitored: true,
    hazmatOnsite: false,
    notes: 'Fire drills conducted twice per year. Emergency plan filed with district.',
  },
  {
    name: 'Riverdale Arms Apartments',
    address: '1847 Lakeview Blvd, Maplewood, MN 55117',
    occupancyType: 'Residential Multifamily',
    propertyUseCode: '429',
    ownerName: 'Riverdale Properties Inc.',
    ownerPhone: '651-555-0310',
    ownerEmail: 'management@riverdalearms.com',
    contactName: 'Pete Nance',
    contactPhone: '651-555-0311',
    squareFootage: 52000,
    stories: 3,
    occupantLoad: 180,
    sprinklered: false,
    alarmMonitored: true,
    hazmatOnsite: false,
    notes: 'No sprinkler system — pre-code construction. Annual inspection priority.',
  },
  {
    name: 'Apex Chemical Supply',
    address: '334 Industrial Pkwy, Maplewood, MN 55117',
    occupancyType: 'Industrial / Hazmat',
    propertyUseCode: '600',
    ownerName: 'Apex Supply Co.',
    ownerPhone: '651-555-0400',
    ownerEmail: 'safety@apexchemical.com',
    contactName: 'Raj Mehta',
    contactPhone: '651-555-0401',
    squareFootage: 24000,
    stories: 1,
    occupantLoad: 45,
    sprinklered: true,
    alarmMonitored: true,
    hazmatOnsite: true,
    notes: 'Tier II facility. MSDS on file. Secondary containment in west wing.',
  },
  {
    name: 'Maplewood VFW Post 8984',
    address: '412 Elmwood Drive, Maplewood, MN 55117',
    occupancyType: 'Assembly / Restaurant',
    propertyUseCode: '161',
    ownerName: 'VFW Post 8984',
    ownerPhone: '651-555-0502',
    ownerEmail: 'post8984@vfw.org',
    contactName: 'Harold Bauer',
    contactPhone: '651-555-0503',
    squareFootage: 6800,
    stories: 1,
    occupantLoad: 180,
    sprinklered: false,
    alarmMonitored: true,
    hazmatOnsite: false,
    notes: 'Bar and restaurant. Kitchen suppression hood inspected March 2025.',
  },
];

  const props = [];
  for (const p of PROPERTIES) { props.push(await fiProperties.create(p, 1)); }
  console.log(`Fire inspections seed: ${props.length} properties inserted.`);

// ── Inspections ──────────────────────────────────────────────────────────────
const INSPECTIONS = [
  {
    propertyId: props[0].id,
    type: 'Annual Inspection',
    inspectorName: 'Maria Delgado',
    scheduledDate: '2026-01-15',
    completedDate: '2026-01-15',
    result: 'Pass with Violations',
    violations: [
      { code: '2001', status: 'Corrected', correctedDate: '2026-02-01', notes: 'Extinguisher in food court replaced.' },
      { code: '4002', status: 'Open', followUpDate: '2026-03-15', notes: 'Extension cord in east corridor storage room.' },
    ],
    followUpDate: '2026-03-15',
    notes: 'General compliance good. Two violations noted.',
  },
  {
    propertyId: props[2].id,
    type: 'Annual Inspection',
    inspectorName: 'Maria Delgado',
    scheduledDate: '2026-01-28',
    completedDate: '2026-01-28',
    result: 'Fail',
    violations: [
      { code: '1001', status: 'Pending', followUpDate: '2026-02-28', notes: 'Laundry room exit blocked by resident storage.' },
      { code: '2005', status: 'Pending', followUpDate: '2026-02-28', notes: '4 detectors with dead batteries in units 204, 207, 312, 315.' },
      { code: '1002', status: 'Corrected', correctedDate: '2026-02-10', notes: 'Exit sign 3rd floor stairwell replaced.' },
    ],
    followUpDate: '2026-02-28',
    notes: 'Reinspection required. Building owner contacted — agreed to 30-day correction window.',
  },
  {
    propertyId: props[1].id,
    type: 'Annual Inspection',
    inspectorName: 'Sarah Chen',
    scheduledDate: '2026-02-05',
    completedDate: '2026-02-05',
    result: 'Pass',
    violations: [],
    followUpDate: null,
    notes: 'Full compliance. Excellent recordkeeping by facilities team.',
  },
  {
    propertyId: props[3].id,
    type: 'Annual Inspection',
    inspectorName: 'Maria Delgado',
    scheduledDate: '2026-02-18',
    completedDate: '2026-02-18',
    result: 'Pass with Violations',
    violations: [
      { code: '6002', status: 'Open', followUpDate: '2026-03-18', notes: 'SDS binder not current — 3 chemicals updated since last filing.' },
    ],
    followUpDate: '2026-03-18',
    notes: 'Hazmat storage in good order. SDS update required.',
  },
  {
    propertyId: props[4].id,
    type: 'Annual Inspection',
    inspectorName: 'Sarah Chen',
    scheduledDate: '2026-03-01',
    completedDate: null,
    result: null,
    violations: [],
    followUpDate: null,
    notes: 'Scheduled — not yet completed.',
  },
];

  const ins = [];
  for (const i of INSPECTIONS) { ins.push(await fiInspections.create(i, 1)); }
  console.log(`Fire inspections seed: ${ins.length} inspections inserted.`);

// ── Permits ──────────────────────────────────────────────────────────────────
const PERMITS = [
  {
    propertyId:  props[0].id,
    type:         'Occupancy Permit',
    permitNumber: 'OCC-2024-001',
    issuedDate:   '2024-03-01',
    expiresDate:  '2026-03-01',
    status:       'Expired',
    issuedBy:     'Maria Delgado',
    fee:          350,
    conditions:   'Maximum occupant load 1,800. All emergency exits must remain unlocked during occupancy.',
    notes:        'Renewal application received 2026-02-20 — pending review.',
  },
  {
    propertyId:  props[3].id,
    type:         'Hazardous Materials Storage',
    permitNumber: 'HAZ-2025-004',
    issuedDate:   '2025-04-01',
    expiresDate:  '2026-04-01',
    status:       'Active',
    issuedBy:     'Sarah Chen',
    fee:          500,
    conditions:   'Tier II reporting required. Secondary containment mandatory. Inspector access on demand.',
    notes:        '',
  },
  {
    propertyId:  props[4].id,
    type:         'Special Event Permit',
    permitNumber: 'EVT-2026-011',
    issuedDate:   '2026-02-14',
    expiresDate:  '2026-04-01',
    status:       'Active',
    issuedBy:     'Maria Delgado',
    fee:          75,
    conditions:   'Occupant load not to exceed 200 for special events. No open flame permitted without additional permit.',
    notes:        "St. Patrick's Day event March 17.",
  },
  {
    propertyId:  props[1].id,
    type:         'Fire Alarm System',
    permitNumber: 'FA-2025-002',
    issuedDate:   '2025-09-01',
    expiresDate:  '2027-09-01',
    status:       'Active',
    issuedBy:     'Sarah Chen',
    fee:          200,
    conditions:   'Annual testing required. Test records must be submitted to fire marshal within 30 days of test.',
    notes:        '',
  },
];

  const perms = [];
  for (const p of PERMITS) { perms.push(await fiPermits.create(p, 1)); }
  console.log(`Fire inspections seed: ${perms.length} permits inserted.`);
};
