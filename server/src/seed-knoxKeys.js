'use strict';
/**
 * seed-knoxKeys.js — 10 Knox boxes + access logs + inspections.
 * Properties match the pre-incident plans in seed-prePlans.js.
 * Skips if already seeded.
 */

const db = require('./db');

module.exports = async function seedKnoxKeys() {
  const { rows } = await db.query('SELECT COUNT(*) as c FROM knox_boxes WHERE station_id = 1');
  if (parseInt(rows[0].c) > 0) { console.log('Knox keys seed: already seeded, skipping.'); return; }

  console.log('Knox keys seed: inserting demo data...');

  const BOXES = [
    {
      box_number: 'K-047', box_type: 'wall_mount', status: 'active',
      address: '300 Elm Street, Maplewood', location_detail: 'Main entrance, right pillar',
      property_name: 'Maplewood Elementary School', property_type: 'Education',
      installed_date: '2019-08-15', serial_number: 'KNX-2019-04701',
      contents: 'Building master key, gym entrance key, boiler room key',
      notes: 'School buses use rear lot. Key updated Aug 2024.',
      last_inspection_date: '2025-11-10', next_inspection_due: '2026-11-10',
      inspected_by: 'Maria Delgado', inspection_result: 'pass',
    },
    {
      box_number: 'K-022', box_type: 'wall_mount', status: 'active',
      address: '45 Riverside Drive, Maplewood', location_detail: 'Front entrance vestibule',
      property_name: 'Riverside Nursing & Rehabilitation', property_type: 'Healthcare',
      installed_date: '2015-03-22', serial_number: 'KNX-2015-02201',
      contents: 'Master key, med room key, elevator override key, evacuation board key',
      notes: 'CRITICAL OCCUPANCY — 112 non-ambulatory residents. Unit layout map posted inside.',
      last_inspection_date: '2025-10-22', next_inspection_due: '2026-10-22',
      inspected_by: 'Sarah Chen', inspection_result: 'pass',
    },
    {
      box_number: 'K-091', box_type: 'wall_mount', status: 'active',
      address: '775 Route 22, Maplewood', location_detail: 'On building at main entrance',
      property_name: "Hannigan's Fuel & Auto", property_type: 'Commercial',
      installed_date: '2018-06-01', serial_number: 'KNX-2018-09101',
      contents: 'Building key, emergency fuel shutoff key, gate key',
      notes: 'Hazmat property — 3 underground storage tanks. AFFF required for fuel fire.',
      last_inspection_date: '2025-09-18', next_inspection_due: '2026-09-18',
      inspected_by: 'Tracy Benson', inspection_result: 'pass',
    },
    {
      box_number: 'K-068', box_type: 'wall_mount', status: 'active',
      address: '120 Maple Avenue, Maplewood', location_detail: 'Rear entry near parking lot door',
      property_name: 'Maplewood Community Church', property_type: 'Religious',
      installed_date: '2012-09-14', serial_number: 'KNX-2012-06801',
      contents: 'Building master key, bell tower access key, electrical room key',
      notes: 'Heavy timber construction (1921). Peak occupancy 700+ on holidays.',
      last_inspection_date: '2025-06-14', next_inspection_due: '2026-06-14',
      inspected_by: 'Nathan McGee', inspection_result: 'pass',
    },
    {
      box_number: 'K-034', box_type: 'wall_mount', status: 'active',
      address: '500 Valley Road, Maplewood', location_detail: 'Main lobby vestibule',
      property_name: 'Valley View Apartments', property_type: 'Residential (Multi)',
      installed_date: '2003-11-20', serial_number: 'KNX-2003-03401',
      contents: 'Building master key, elevator override, unit layout map, roof access key',
      notes: '120 units, 240-300 residents. Gate code: 7721. Fire command center in lobby.',
      last_inspection_date: '2025-08-30', next_inspection_due: '2026-08-30',
      inspected_by: 'Sarah Chen', inspection_result: 'pass',
    },
    {
      box_number: 'K-PL-006', box_type: 'padlock', status: 'active',
      address: '1200 Commerce Parkway, Maplewood', location_detail: 'South emergency gate',
      property_name: 'Industrial Distribution Center (Lot 7)', property_type: 'Industrial',
      installed_date: '2016-04-10', serial_number: 'KNX-PL-2016-006',
      contents: 'Knox padlock only (gate access)',
      notes: 'After-hours gate keypad: 2288. Hazmat shipments at docks 14-18.',
      last_inspection_date: '2025-07-15', next_inspection_due: '2026-07-15',
      inspected_by: 'Sandra Kim', inspection_result: 'pass',
    },
    {
      box_number: 'K-112', box_type: 'wall_mount', status: 'active',
      address: '50 Township Blvd, Maplewood', location_detail: 'Main entrance right column',
      property_name: 'Maplewood Township Municipal Building', property_type: 'Government',
      installed_date: '2020-01-15', serial_number: 'KNX-2020-11201',
      contents: 'Master key, server room key, evidence room key, elevator key',
      notes: 'PD and FD share building. Police evidence room — do not enter without PD escort.',
      last_inspection_date: '2025-12-01', next_inspection_due: '2026-12-01',
      inspected_by: 'Sarah Chen', inspection_result: 'pass',
    },
    {
      box_number: 'K-003', box_type: 'wall_mount', status: 'active',
      address: '800 Main Street, Maplewood', location_detail: 'Main lobby vestibule left side',
      property_name: 'Maplewood Hotel & Conference Center', property_type: 'Commercial',
      installed_date: '2017-05-22', serial_number: 'KNX-2017-00301',
      contents: 'Master key, roof access key, pool mechanical room key',
      notes: 'Loading dock rear alley access. Conference center capacity 400.',
      last_inspection_date: '2025-05-20', next_inspection_due: '2026-05-20',
      inspected_by: 'Maria Delgado', inspection_result: 'pass',
    },
    {
      box_number: 'K-055', box_type: 'elevator', status: 'active',
      address: '500 Valley Road, Maplewood', location_detail: 'Elevator machine room, roof level',
      property_name: 'Valley View Apartments', property_type: 'Residential (Multi)',
      installed_date: '2003-11-20', serial_number: 'KNX-ELV-2003-055',
      contents: 'Elevator override key (Phase II recall)',
      notes: 'Secondary Knox for elevator override. Primary building Knox is K-034 in lobby.',
      last_inspection_date: '2025-08-30', next_inspection_due: '2026-08-30',
      inspected_by: 'Sarah Chen', inspection_result: 'pass',
    },
    {
      box_number: 'K-PL-009', box_type: 'padlock', status: 'damaged',
      address: '88 Industrial Way, Maplewood', location_detail: 'Perimeter fence — north gate',
      property_name: 'Maplewood Water Treatment Plant', property_type: 'Utility',
      installed_date: '2010-07-01', serial_number: 'KNX-PL-2010-009',
      contents: 'Knox padlock only (perimeter gate)',
      notes: 'DAMAGED — padlock shackle corroded, replacement ordered. Temporary combo lock: 4455.',
      last_inspection_date: '2026-01-15', next_inspection_due: '2026-03-15',
      inspected_by: 'Sarah Chen', inspection_result: 'fail',
    },
  ];

  for (const b of BOXES) {
    await db.query(
      `INSERT INTO knox_boxes (station_id, box_number, box_type, status, address, location_detail,
        property_name, property_type, installed_date, serial_number, contents, notes,
        last_inspection_date, next_inspection_due, inspected_by, inspection_result)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [1, b.box_number, b.box_type, b.status, b.address, b.location_detail,
       b.property_name, b.property_type, b.installed_date, b.serial_number,
       b.contents, b.notes, b.last_inspection_date, b.next_inspection_due,
       b.inspected_by, b.inspection_result]
    );
  }

  // Get inserted box IDs for access logs and inspections
  const { rows: boxes } = await db.query('SELECT id, box_number FROM knox_boxes WHERE station_id = 1 ORDER BY id');
  const boxMap = {};
  for (const b of boxes) boxMap[b.box_number] = b.id;

  // ── Seed access logs ─────────────────────────────────────────────────────
  const ACCESS_LOG = [
    { box: 'K-047', accessed_by: 'Chief Chen', access_type: 'inspection', reason: 'Annual inspection', accessed_at: '2025-11-10T09:30:00Z' },
    { box: 'K-022', accessed_by: 'Capt. Delgado', access_type: 'emergency', incident_number: '2026-0008', reason: 'Fire alarm activation — 2nd floor wing B', accessed_at: '2026-01-22T03:15:00Z' },
    { box: 'K-022', accessed_by: 'FF McGee', access_type: 'key_access', incident_number: '2026-0014', reason: 'Medical emergency — resident room 214', accessed_at: '2026-02-14T11:42:00Z' },
    { box: 'K-091', accessed_by: 'Chief Chen', access_type: 'emergency', incident_number: '2026-0019', reason: 'Structure fire — smoke from service bays', accessed_at: '2026-02-28T17:30:00Z' },
    { box: 'K-034', accessed_by: 'Capt. Delgado', access_type: 'emergency', incident_number: '2026-0022', reason: 'Fire alarm — 3rd floor smoke detector', accessed_at: '2026-03-05T02:10:00Z' },
    { box: 'K-034', accessed_by: 'FF McGee', access_type: 'key_checkout', reason: 'Pre-plan update — unit access for hydrant survey', accessed_at: '2026-03-10T14:00:00Z', returned_at: '2026-03-10T16:30:00Z' },
    { box: 'K-PL-006', accessed_by: 'B/C Simmons', access_type: 'emergency', incident_number: '2026-0025', reason: 'Hazmat response — chemical spill dock area', accessed_at: '2026-03-12T08:45:00Z' },
    { box: 'K-112', accessed_by: 'Chief Chen', access_type: 'key_access', reason: 'After-hours building access for inspection', accessed_at: '2025-12-01T19:00:00Z' },
    { box: 'K-003', accessed_by: 'Capt. Delgado', access_type: 'emergency', incident_number: '2026-0003', reason: 'Fire alarm — kitchen area', accessed_at: '2026-01-08T22:15:00Z' },
    { box: 'K-068', accessed_by: 'FF Nathan McGee', access_type: 'inspection', reason: 'Semi-annual Knox inspection', accessed_at: '2025-06-14T10:00:00Z' },
  ];

  for (const a of ACCESS_LOG) {
    if (!boxMap[a.box]) continue;
    await db.query(
      `INSERT INTO knox_access_log (knox_box_id, station_id, accessed_by, access_type, incident_number, reason, accessed_at, returned_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [boxMap[a.box], 1, a.accessed_by, a.access_type, a.incident_number || '', a.reason, a.accessed_at, a.returned_at || null]
    );
  }

  // ── Seed inspection records ──────────────────────────────────────────────
  const INSPECTIONS = [
    { box: 'K-047', inspected_by: 'Maria Delgado', date: '2025-11-10', result: 'pass', condition: 'good', lock: true, contents: true, weather: 'good' },
    { box: 'K-047', inspected_by: 'Nathan McGee', date: '2024-11-08', result: 'pass', condition: 'good', lock: true, contents: true, weather: 'good' },
    { box: 'K-022', inspected_by: 'Sarah Chen', date: '2025-10-22', result: 'pass', condition: 'excellent', lock: true, contents: true, weather: 'excellent' },
    { box: 'K-091', inspected_by: 'Tracy Benson', date: '2025-09-18', result: 'pass', condition: 'good', lock: true, contents: true, weather: 'fair', notes: 'Minor surface rust on mounting bracket — cosmetic only.' },
    { box: 'K-068', inspected_by: 'Nathan McGee', date: '2025-06-14', result: 'pass', condition: 'fair', lock: true, contents: true, weather: 'fair', notes: 'Weatherproofing seal showing age. Schedule replacement next cycle.' },
    { box: 'K-034', inspected_by: 'Sarah Chen', date: '2025-08-30', result: 'pass', condition: 'good', lock: true, contents: true, weather: 'good' },
    { box: 'K-PL-006', inspected_by: 'Sandra Kim', date: '2025-07-15', result: 'pass', condition: 'good', lock: true, contents: true, weather: 'good' },
    { box: 'K-112', inspected_by: 'Sarah Chen', date: '2025-12-01', result: 'pass', condition: 'excellent', lock: true, contents: true, weather: 'excellent' },
    { box: 'K-PL-009', inspected_by: 'Sarah Chen', date: '2026-01-15', result: 'fail', condition: 'poor', lock: false, contents: true, weather: 'poor', notes: 'Padlock shackle corroded — will not open smoothly. Replacement ordered from Knox Company.' },
  ];

  for (const i of INSPECTIONS) {
    if (!boxMap[i.box]) continue;
    await db.query(
      `INSERT INTO knox_inspections (knox_box_id, station_id, inspected_by, inspection_date, result, box_condition, lock_functional, contents_verified, weatherproofing, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [boxMap[i.box], 1, i.inspected_by, i.date, i.result, i.condition, i.lock, i.contents, i.weather, i.notes || '']
    );
  }

  console.log(`Knox keys seed: inserted ${BOXES.length} boxes, ${ACCESS_LOG.length} access logs, ${INSPECTIONS.length} inspections.`);
};
