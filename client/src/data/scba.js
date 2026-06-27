// ─── SCBA / Air Management data ───────────────────────────────────────────────

export const SCBA_STATUSES = ['In Service', 'Out of Service', 'In Repair', 'Retired'];

export const STATUS_COLORS = {
  'In Service':    { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'Out of Service':{ bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  'In Repair':     { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  'Retired':       { bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-400'   },
};

export const CYLINDER_SIZES = ['30 min / 45 cu ft', '45 min / 66 cu ft', '60 min / 88 cu ft', '75 min / 110 cu ft'];
export const CYLINDER_MATERIALS = ['Carbon Fiber Composite', 'Fiberglass Composite', 'Steel'];
export const MASK_SIZES = ['Small', 'Medium', 'Large', 'Extra Large'];
export const FILL_STATIONS = ['Station 14 Cascade', 'County Air Unit', 'Mutual Aid Fill'];

export const SCBA_MAKES = ['Scott Air-Pak', 'MSA G1', 'Drager PA90', 'Interspiro SCBA', 'Avon Protection'];

// NFPA 1852 test intervals (years)
export const HYDRO_INTERVAL_YEARS = {
  'Carbon Fiber Composite': 5,
  'Fiberglass Composite':   5,
  'Steel':                  5,
};

export const ANNUAL_INSPECTION_MONTHS = 12;
export const LOW_AIR_THRESHOLD_PSI = 1000; // flag fills below this

// ── Sample cylinders ──────────────────────────────────────────────────────────
export const initialCylinders = [
  {
    id: 1, unitId: 'CYL-001', make: 'Scott', model: 'Air-Pak X3 Pro',
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
    id: 2, unitId: 'CYL-002', make: 'Scott', model: 'Air-Pak X3 Pro',
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
    id: 3, unitId: 'CYL-003', make: 'MSA', model: 'G1 SCBA',
    size: '60 min / 88 cu ft', material: 'Carbon Fiber Composite',
    serial: 'MSA-2021-8801', manufactureYear: 2021,
    currentPressure: 4500, maxPressure: 4500,
    lastHydroDate: '2021-08-01', nextHydroDate: '2026-08-01',
    lastInspectionDate: '2025-12-05', nextInspectionDate: '2026-12-05',
    assignedMember: 'Sandra Kim', assignedUnit: 'Engine 14',
    status: 'In Service', notes: 'Hydro due August 2026 — schedule soon.',
    fillLog: [
      { date: '2026-03-04', psi: 4500, filledBy: 'James Ortega', station: 'Station 14 Cascade', pre: 3200 },
    ],
  },
  {
    id: 4, unitId: 'CYL-004', make: 'Scott', model: 'Air-Pak 75',
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
    id: 5, unitId: 'CYL-005', make: 'Scott', model: 'Air-Pak X3 Pro',
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
    id: 6, unitId: 'CYL-006', make: 'MSA', model: 'G1 SCBA',
    size: '45 min / 66 cu ft', material: 'Carbon Fiber Composite',
    serial: 'MSA-2022-6601', manufactureYear: 2022,
    currentPressure: 4500, maxPressure: 4500,
    lastHydroDate: '2022-05-12', nextHydroDate: '2027-05-12',
    lastInspectionDate: '2026-01-10', nextInspectionDate: '2027-01-10',
    assignedMember: 'James Ortega', assignedUnit: 'Engine 14',
    status: 'In Service', notes: '',
    fillLog: [
      { date: '2026-03-05', psi: 4500, filledBy: 'Nathan McGee', station: 'Station 14 Cascade', pre: 2900 },
    ],
  },
  {
    id: 7, unitId: 'CYL-007', make: 'Scott', model: 'Air-Pak X3 Pro',
    size: '60 min / 88 cu ft', material: 'Carbon Fiber Composite',
    serial: 'SP-2021-88101', manufactureYear: 2021,
    currentPressure: 4500, maxPressure: 4500,
    lastHydroDate: '2021-11-01', nextHydroDate: '2026-11-01',
    lastInspectionDate: '2026-02-01', nextInspectionDate: '2027-02-01',
    assignedMember: 'Mike Harrington', assignedUnit: 'Ladder 14',
    status: 'In Repair', notes: 'Facepiece strap replaced — out for valve recertification.',
    fillLog: [],
  },
  {
    id: 8, unitId: 'CYL-008', make: 'Drager', model: 'PA90 Plus',
    size: '30 min / 45 cu ft', material: 'Steel',
    serial: 'DR-2017-45201', manufactureYear: 2017,
    currentPressure: 4500, maxPressure: 4500,
    lastHydroDate: '2022-09-14', nextHydroDate: '2027-09-14',
    lastInspectionDate: '2026-01-10', nextInspectionDate: '2027-01-10',
    assignedMember: '', assignedUnit: 'Tanker 14',
    status: 'In Service', notes: 'Spare / unassigned. Used for training.',
    fillLog: [
      { date: '2026-01-20', psi: 4500, filledBy: 'James Ortega', station: 'Station 14 Cascade', pre: 3400 },
    ],
  },
];

// ── Cascade / fill station status ─────────────────────────────────────────────
export const initialFillStations = [
  {
    id: 1, name: 'Station 14 Cascade',
    type: 'Cascade System',
    bankPressure: 6000, maxPressure: 6000,
    lastInspectionDate: '2025-12-01',
    nextInspectionDate: '2026-12-01',
    status: 'Operational',
    notes: 'Three-bottle cascade. Bottle C at 4,200 PSI — schedule refill from county.',
  },
  {
    id: 2, name: 'County Air Unit',
    type: 'Mobile Compressor',
    bankPressure: null, maxPressure: 4500,
    lastInspectionDate: '2025-10-15',
    nextInspectionDate: '2026-10-15',
    status: 'Operational',
    notes: 'Available via mutual aid request. 2-hour response time.',
  },
];
