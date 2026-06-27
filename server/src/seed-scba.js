'use strict';
const { cylinders: cylDb, fillStations: fsDb } = require('./db');

module.exports = async function seedScba() {
// ── Cylinders ─────────────────────────────────────────────────────────────────
  const existingCylinders = await cylDb.all(1);
  if (existingCylinders.length > 0) {
    console.log(`SCBA cylinders seed: already seeded (${existingCylinders.length} records) — skipping.`);
  } else {
  const cylinders = [
    {
      unitId: 'CYL-001', make: 'Scott', model: 'Air-Pak X3 Pro',
      size: '45 min / 66 cu ft', material: 'Carbon Fiber Composite',
      serial: 'SP-2019-44301', manufactureYear: 2019,
      currentPressure: 4500, maxPressure: 4500,
      lastHydroDate: '2024-03-15', nextHydroDate: '2029-03-15',
      lastInspectionDate: '2026-01-10', nextInspectionDate: '2027-01-10',
      assignedMember: 'Sarah Chen', assignedUnit: 'Command 14',
      status: 'In Service', notes: '',
      fillLog: [
        { date: '2026-03-01', psi: 4500, filledBy: 'Nathan McGee', station: 'Station 14 Cascade', pre: 2200 },
        { date: '2026-02-12', psi: 4500, filledBy: 'Sandra Kim',  station: 'Station 14 Cascade', pre: 1800 },
      ],
    },
    {
      unitId: 'CYL-002', make: 'Scott', model: 'Air-Pak X3 Pro',
      size: '45 min / 66 cu ft', material: 'Carbon Fiber Composite',
      serial: 'SP-2019-44302', manufactureYear: 2019,
      currentPressure: 4500, maxPressure: 4500,
      lastHydroDate: '2024-03-15', nextHydroDate: '2029-03-15',
      lastInspectionDate: '2026-01-10', nextInspectionDate: '2027-01-10',
      assignedMember: 'Nathan McGee', assignedUnit: 'Engine 14',
      status: 'In Service', notes: '',
      fillLog: [
        { date: '2026-02-28', psi: 4500, filledBy: 'Nathan McGee', station: 'Station 14 Cascade', pre: 2400 },
      ],
    },
    {
      unitId: 'CYL-003', make: 'MSA', model: 'G1 SCBA',
      size: '60 min / 88 cu ft', material: 'Carbon Fiber Composite',
      serial: 'MSA-2021-8801', manufactureYear: 2021,
      currentPressure: 4500, maxPressure: 4500,
      lastHydroDate: '2021-08-01', nextHydroDate: '2026-08-01',
      lastInspectionDate: '2025-12-05', nextInspectionDate: '2026-12-05',
      assignedMember: 'Sandra Kim', assignedUnit: 'Engine 14',
      status: 'In Service', notes: 'Hydro due August 2026 — schedule soon.',
      fillLog: [
        { date: '2026-03-04', psi: 4500, filledBy: 'Mike Harrington', station: 'Station 14 Cascade', pre: 3200 },
      ],
    },
    {
      unitId: 'CYL-004', make: 'Scott', model: 'Air-Pak 75',
      size: '30 min / 45 cu ft', material: 'Fiberglass Composite',
      serial: 'SP-2015-45104', manufactureYear: 2015,
      currentPressure: 0, maxPressure: 4500,
      lastHydroDate: '2020-06-10', nextHydroDate: '2025-06-10',
      lastInspectionDate: '2025-11-20', nextInspectionDate: '2026-11-20',
      assignedMember: '', assignedUnit: 'Rescue 14',
      status: 'Out of Service', notes: 'Hydro overdue. Pull from service until retested or retired.',
      fillLog: [],
    },
    {
      unitId: 'CYL-005', make: 'Scott', model: 'Air-Pak X3 Pro',
      size: '45 min / 66 cu ft', material: 'Carbon Fiber Composite',
      serial: 'SP-2020-44305', manufactureYear: 2020,
      currentPressure: 2800, maxPressure: 4500,
      lastHydroDate: '2025-01-20', nextHydroDate: '2030-01-20',
      lastInspectionDate: '2026-01-10', nextInspectionDate: '2027-01-10',
      assignedMember: 'Tracy Benson', assignedUnit: 'Engine 142',
      status: 'In Service', notes: '',
      fillLog: [
        { date: '2026-02-15', psi: 4500, filledBy: 'Sandra Kim', station: 'Station 14 Cascade', pre: 1600 },
      ],
    },
    {
      unitId: 'CYL-006', make: 'MSA', model: 'G1 SCBA',
      size: '45 min / 66 cu ft', material: 'Carbon Fiber Composite',
      serial: 'MSA-2022-6601', manufactureYear: 2022,
      currentPressure: 4500, maxPressure: 4500,
      lastHydroDate: '2022-05-12', nextHydroDate: '2027-05-12',
      lastInspectionDate: '2026-01-10', nextInspectionDate: '2027-01-10',
      assignedMember: 'Mike Harrington', assignedUnit: 'Engine 14',
      status: 'In Service', notes: '',
      fillLog: [
        { date: '2026-03-05', psi: 4500, filledBy: 'Nathan McGee', station: 'Station 14 Cascade', pre: 2900 },
      ],
    },
    {
      unitId: 'CYL-007', make: 'Scott', model: 'Air-Pak X3 Pro',
      size: '60 min / 88 cu ft', material: 'Carbon Fiber Composite',
      serial: 'SP-2021-88101', manufactureYear: 2021,
      currentPressure: 4500, maxPressure: 4500,
      lastHydroDate: '2021-11-01', nextHydroDate: '2026-11-01',
      lastInspectionDate: '2026-02-01', nextInspectionDate: '2027-02-01',
      assignedMember: 'Lisa Fontaine', assignedUnit: 'Ladder 14',
      status: 'In Repair', notes: 'Facepiece strap replaced — out for valve recertification.',
      fillLog: [],
    },
    {
      unitId: 'CYL-008', make: 'Drager', model: 'PA90 Plus',
      size: '30 min / 45 cu ft', material: 'Steel',
      serial: 'DR-2017-45201', manufactureYear: 2017,
      currentPressure: 4500, maxPressure: 4500,
      lastHydroDate: '2022-09-14', nextHydroDate: '2027-09-14',
      lastInspectionDate: '2026-01-10', nextInspectionDate: '2027-01-10',
      assignedMember: '', assignedUnit: 'Tanker 14',
      status: 'In Service', notes: 'Spare / unassigned. Used for training.',
      fillLog: [
        { date: '2026-01-20', psi: 4500, filledBy: 'Mike Harrington', station: 'Station 14 Cascade', pre: 3400 },
      ],
    },
  ];

    for (const r of cylinders) { await cylDb.create(r, 1); }
    console.log(`SCBA cylinders seed: inserted ${cylinders.length} records.`);
  }

// ── Fill stations ─────────────────────────────────────────────────────────────
  const existingStations = await fsDb.all(1);
  if (existingStations.length > 0) {
    console.log(`Fill stations seed: already seeded (${existingStations.length} records) — skipping.`);
  } else {
  const stations = [
    {
      name: 'Station 14 Cascade', type: 'Cascade System',
      bankPressure: 6000, maxPressure: 6000,
      lastInspectionDate: '2025-12-01', nextInspectionDate: '2026-12-01',
      status: 'Operational',
      notes: 'Three-bottle cascade. Bottle C at 4,200 PSI — schedule refill from county.',
    },
    {
      name: 'County Air Unit', type: 'Mobile Compressor',
      bankPressure: null, maxPressure: 4500,
      lastInspectionDate: '2025-10-15', nextInspectionDate: '2026-10-15',
      status: 'Operational',
      notes: 'Available via mutual aid request. 2-hour response time.',
    },
  ];

    for (const r of stations) { await fsDb.create(r, 1); }
    console.log(`Fill stations seed: inserted ${stations.length} records.`);
  }
};
