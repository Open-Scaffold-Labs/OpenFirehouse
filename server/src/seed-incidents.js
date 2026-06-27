'use strict';
/**
 * seed-incidents.js — Populate the database with the 10 initial incidents.
 * Safe to run multiple times (skips existing incident numbers).
 */

const { incidents: db } = require('./db');
const { pool } = require('./db');

const SEED_INCIDENTS = [
  {
    incidentNumber: '26-0001',
    date:           '2026-01-04',
    time:           '02:17',
    type:           'Structure Fire',
    alarmLevel:     '2nd Alarm',
    address:        '412 Elmwood Drive, Maplewood',
    units:          ['Engine 14', 'Ladder 14', 'Rescue 14', 'Command 14'],
    personnel:      ['Sarah Chen', 'Maria Delgado', 'Nathan McGee', 'Sandra Kim', 'Mike Harrington'],
    disposition:    'Controlled / Extinguished',
    injuries:       0,
    notes:          'Kitchen fire extended to wall cavity. Cause: unattended cooking. Mutual aid from Station 12.',
    dispatchTime:   '02:22',
    clearTime:      '04:45',
    description:    'Residential structure fire — kitchen origin, extended to wall cavity',
  },
  {
    incidentNumber: '26-0002',
    date:           '2026-01-09',
    time:           '14:43',
    type:           'Vehicle Accident',
    alarmLevel:     'Still',
    address:        'Rt. 22 & Birch Hill Rd, Maplewood',
    units:          ['Engine 14', 'Rescue 14', 'EMS 14'],
    personnel:      ['Nathan McGee', 'Sandra Kim', 'Lisa Fontaine'],
    disposition:    'Patient Transported',
    injuries:       2,
    notes:          'Two-vehicle MVA. Moderate injuries. Both patients transported to Maplewood General.',
    dispatchTime:   '14:49',
    clearTime:      '15:32',
    description:    'Two-vehicle MVA with moderate injuries, Rt. 22',
  },
  {
    incidentNumber: '26-0003',
    date:           '2026-01-15',
    time:           '09:05',
    type:           'Medical / EMS',
    alarmLevel:     'Still',
    address:        '88 Ridgeline Court, Maplewood',
    units:          ['EMS 14'],
    personnel:      ['Nathan McGee', 'Lisa Fontaine'],
    disposition:    'Patient Transported',
    injuries:       1,
    notes:          'Chest pain, 67M. ALS assessment performed. Transported to cardiac unit.',
    dispatchTime:   '09:11',
    clearTime:      '09:48',
    description:    'Chest pain — elderly male, ALS transport',
  },
  {
    incidentNumber: '26-0004',
    date:           '2026-01-22',
    time:           '18:31',
    type:           'Gas Leak',
    alarmLevel:     'Working',
    address:        '230 Maple Street, Maplewood',
    units:          ['Engine 14', 'Command 14'],
    personnel:      ['Sarah Chen', 'Tracy Benson', 'Mike Harrington'],
    disposition:    'Referred to Other Agency',
    injuries:       0,
    notes:          'Natural gas odor detected. Building evacuated. Utility company notified and responded.',
    dispatchTime:   '18:36',
    clearTime:      '19:15',
    description:    'Natural gas leak — building evacuation, utility response',
  },
  {
    incidentNumber: '26-0005',
    date:           '2026-02-03',
    time:           '11:20',
    type:           'False Alarm',
    alarmLevel:     'Still',
    address:        'Maplewood Community Center, 100 Park Ave',
    units:          ['Engine 14'],
    personnel:      ['Maria Delgado', 'Mike Harrington'],
    disposition:    'Investigated / Unfounded',
    injuries:       0,
    notes:          'Automatic alarm activation. Steam from kitchen triggered detector. No fire.',
    dispatchTime:   '11:25',
    clearTime:      '11:42',
    description:    'False alarm — automatic detector, steam from kitchen',
  },
  {
    incidentNumber: '26-0006',
    date:           '2026-02-11',
    time:           '07:55',
    type:           'Vehicle Fire',
    alarmLevel:     'Working',
    address:        'I-95 Northbound MM 42, Maplewood',
    units:          ['Engine 14', 'Tanker 14'],
    personnel:      ['Sandra Kim', 'Kevin Marsh', 'Lisa Fontaine'],
    disposition:    'Controlled / Extinguished',
    injuries:       0,
    notes:          'Engine compartment fire, tractor-trailer. Fire knocked down on arrival. No injuries.',
    dispatchTime:   '08:02',
    clearTime:      '08:38',
    description:    'Tractor-trailer engine fire — I-95 northbound',
  },
  {
    incidentNumber: '26-0007',
    date:           '2026-02-18',
    time:           '20:44',
    type:           'Medical / EMS',
    alarmLevel:     'Still',
    address:        '5 Foxcroft Lane, Maplewood',
    units:          ['EMS 14', 'Engine 14'],
    personnel:      ['Nathan McGee', 'Lisa Fontaine', 'Carlos Ruiz'],
    disposition:    'Patient Refused Transport',
    injuries:       0,
    notes:          'Fall, elderly female. Assessment performed. Patient refused transport. Family notified.',
    dispatchTime:   '20:49',
    clearTime:      '21:12',
    description:    'Fall — elderly female, patient refused transport',
  },
  {
    incidentNumber: '26-0008',
    date:           '2026-02-25',
    time:           '15:10',
    type:           'Brush / Wildland Fire',
    alarmLevel:     'Working',
    address:        'Maplewood State Forest, Trailhead Rd',
    units:          ['Engine 14', 'Brush 14', 'Tanker 14'],
    personnel:      ['Sarah Chen', 'Tracy Benson', 'Mike Harrington', 'Carlos Ruiz'],
    disposition:    'Controlled / Extinguished',
    injuries:       0,
    notes:          'Approximately 3 acres. Wind-driven. Contained with backfire. Cause under investigation.',
    dispatchTime:   '15:18',
    clearTime:      '17:45',
    description:    'Brush fire — 3 acres, wind-driven, Maplewood State Forest',
  },
  {
    incidentNumber: '26-0009',
    date:           '2026-03-01',
    time:           '08:22',
    type:           'Public Assist',
    alarmLevel:     'Still',
    address:        '19 Willowbrook Way, Maplewood',
    units:          ['Engine 14'],
    personnel:      ['Maria Delgado', 'Lisa Fontaine'],
    disposition:    'No Action Required',
    injuries:       0,
    notes:          'Assist PD with welfare check. Resident located safe.',
    dispatchTime:   '08:26',
    clearTime:      '08:50',
    description:    'Welfare check assist — resident safe',
  },
  {
    incidentNumber: '26-0010',
    date:           '2026-03-04',
    time:           '23:58',
    type:           'Structure Fire',
    alarmLevel:     'Working',
    address:        '77 Cedar Grove Road, Maplewood',
    units:          ['Engine 14', 'Ladder 14', 'Command 14'],
    personnel:      ['Sarah Chen', 'Maria Delgado', 'Sandra Kim', 'Mike Harrington'],
    disposition:    'Controlled / Extinguished',
    injuries:       1,
    notes:          'Bedroom fire, single-family home. One firefighter minor burn injury. Cause: electrical.',
    dispatchTime:   '00:05',
    clearTime:      '02:20',
    description:    'Residential structure fire — bedroom origin, electrical cause',
  },
];

module.exports = async function seedIncidents() {
  let inserted = 0;
  let skipped  = 0;

  for (const inc of SEED_INCIDENTS) {
    if (await db.findByNumber(inc.incidentNumber, 1)) {
      // Update existing records with new fields
      await pool.query(
        `UPDATE incidents SET "dispatchTime" = $1, "clearTime" = $2, description = $3, incident_date = $4::date WHERE "incidentNumber" = $5`,
        [inc.dispatchTime || '', inc.clearTime || '', inc.description || '', inc.date, inc.incidentNumber]
      ).catch(() => {});
      skipped++;
    } else {
      await db.create(inc, 1);
      // Also set the new fields
      await pool.query(
        `UPDATE incidents SET "dispatchTime" = $1, "clearTime" = $2, description = $3, station_id = 1, incident_date = $4::date WHERE "incidentNumber" = $5`,
        [inc.dispatchTime || '', inc.clearTime || '', inc.description || '', inc.date, inc.incidentNumber]
      ).catch(() => {});
      inserted++;
    }
  }

  console.log(`Incidents seed complete: ${inserted} inserted, ${skipped} updated.`);
};
