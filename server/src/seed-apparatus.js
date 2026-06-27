'use strict';
/**
 * seed-apparatus.js — Populate the database with the 8 initial apparatus units.
 * Safe to run multiple times (skips existing designations).
 *
 * Usage:  node src/seed-apparatus.js
 */

const { apparatus: db } = require('./db');

const SEED_UNITS = [
  {
    designation:      'Engine 14',
    type:             'Engine',
    year:             2018,
    make:             'Pierce',
    model:            'Enforcer',
    status:           'In Service',
    mileage:          42310,
    lastService:      '2026-01-15',
    nextServiceDue:   '2026-07-15',
    assignedOperator: 'Sandra Kim',
    notes:            'Primary attack engine. 1,500 GPM pump. 750-gal tank.',
  },
  {
    designation:      'Engine 142',
    type:             'Engine',
    year:             2011,
    make:             'KME',
    model:            'Predator',
    status:           'Reserve',
    mileage:          98450,
    lastService:      '2025-11-01',
    nextServiceDue:   '2026-05-01',
    assignedOperator: '',
    notes:            'Reserve engine. Available for mutual aid.',
  },
  {
    designation:      'Ladder 14',
    type:             'Ladder / Aerial',
    year:             2020,
    make:             'Sutphen',
    model:            'Metro 100',
    status:           'In Service',
    mileage:          18760,
    lastService:      '2026-02-01',
    nextServiceDue:   '2026-08-01',
    assignedOperator: 'Nathan McGee',
    notes:            '100-ft aerial ladder. Pre-piped waterway.',
  },
  {
    designation:      'Tanker 14',
    type:             'Tanker',
    year:             2015,
    make:             'Freightliner',
    model:            'Custom',
    status:           'In Service',
    mileage:          61200,
    lastService:      '2025-12-10',
    nextServiceDue:   '2026-06-10',
    assignedOperator: 'James Ortega',
    notes:            '3,000-gal water tank. Rural ops support.',
  },
  {
    designation:      'Rescue 14',
    type:             'Rescue',
    year:             2017,
    make:             'Rosenbauer',
    model:            'Commander',
    status:           'Maintenance',
    mileage:          55890,
    lastService:      '2026-03-01',
    nextServiceDue:   '2026-03-15',
    assignedOperator: '',
    notes:            'Heavy rescue. Extrication and confined space equipment onboard. In for annual pump test.',
  },
  {
    designation:      'Brush 14',
    type:             'Brush',
    year:             2014,
    make:             'Ford',
    model:            'F-550',
    status:           'In Service',
    mileage:          34100,
    lastService:      '2025-10-20',
    nextServiceDue:   '2026-04-20',
    assignedOperator: 'Mike Harrington',
    notes:            'Wildland interface unit. 300-gal skid unit.',
  },
  {
    designation:      'Command 14',
    type:             'Command',
    year:             2022,
    make:             'Chevrolet',
    model:            'Tahoe',
    status:           'In Service',
    mileage:          12450,
    lastService:      '2026-01-05',
    nextServiceDue:   '2026-07-05',
    assignedOperator: 'Sarah Chen',
    notes:            'Chief\'s command vehicle. Mobile command capability.',
  },
  {
    designation:      'EMS 14',
    type:             'Ambulance / EMS',
    year:             2019,
    make:             'Ford',
    model:            'E-450 Type III',
    status:           'Out of Service',
    mileage:          78300,
    lastService:      '2025-09-15',
    nextServiceDue:   '2026-03-15',
    assignedOperator: '',
    notes:            'ALS-capable transport unit. Out of service — awaiting parts for stretcher lift mechanism.',
  },
];

module.exports = async function seedApparatus() {
  let inserted = 0;
  let skipped  = 0;

  for (const unit of SEED_UNITS) {
    if (await db.findByDesignation(unit.designation, 1)) {
      skipped++;
    } else {
      await db.create(unit, 1);
      inserted++;
    }
  }

  console.log(`Apparatus seed complete: ${inserted} inserted, ${skipped} skipped.`);
};
