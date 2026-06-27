// Apparatus Maintenance Log data for OpenFirehouse

export const MAINTENANCE_TYPES = [
  'Preventive Maintenance',
  'Corrective Repair',
  'Annual Inspection',
  'Pump Test',
  'Electrical / Electronics',
  'Body / Exterior',
  'Tires',
  'Brake Service',
  'Transmission Service',
  'SCBA / Equipment',
  'Ladder Test',
  'Other',
];

export const MAINTENANCE_STATUSES = ['Completed', 'In Progress', 'Pending', 'Deferred'];

export const MAINTENANCE_PRIORITIES = ['Routine', 'Urgent', 'Critical'];

export const STATUS_COLORS = {
  'Completed':   { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'In Progress': { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  'Pending':     { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  'Deferred':    { bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-400'   },
};

export const PRIORITY_COLORS = {
  'Routine':  { bg: 'bg-gray-100',    text: 'text-gray-600'    },
  'Urgent':   { bg: 'bg-orange-100',  text: 'text-orange-700'  },
  'Critical': { bg: 'bg-red-100',     text: 'text-red-700'     },
};

// ─── Service Interval Definitions (per apparatus) ────────────────────────────
// Used to show "due soon" warnings similar to the apparatus tracker

export const serviceIntervals = [
  {
    apparatusId: 1,
    apparatusName: 'Engine 14',
    intervals: [
      { service: 'Oil & Filter Change',        everyMiles: 5000,  everyDays: 180 },
      { service: 'Annual Pump Test',            everyMiles: null,  everyDays: 365 },
      { service: 'Annual Inspection (State)',   everyMiles: null,  everyDays: 365 },
      { service: 'Transmission Service',        everyMiles: 50000, everyDays: null },
      { service: 'Tire Rotation / Inspection',  everyMiles: 15000, everyDays: 365 },
    ],
  },
  {
    apparatusId: 3,
    apparatusName: 'Ladder 14',
    intervals: [
      { service: 'Oil & Filter Change',         everyMiles: 5000,  everyDays: 180 },
      { service: 'Annual Aerial Test (NFPA 1)',  everyMiles: null,  everyDays: 365 },
      { service: 'Annual Inspection (State)',    everyMiles: null,  everyDays: 365 },
      { service: 'Stabilizer / Outrigger Test',  everyMiles: null,  everyDays: 180 },
    ],
  },
  {
    apparatusId: 5,
    apparatusName: 'Rescue 14',
    intervals: [
      { service: 'Oil & Filter Change',         everyMiles: 5000,  everyDays: 180 },
      { service: 'Annual Inspection (State)',    everyMiles: null,  everyDays: 365 },
      { service: 'Hydraulic Tool Service',       everyMiles: null,  everyDays: 365 },
      { service: 'Generator Service',            everyMiles: null,  everyDays: 180 },
    ],
  },
  {
    apparatusId: 8,
    apparatusName: 'EMS 14',
    intervals: [
      { service: 'Oil & Filter Change',         everyMiles: 5000,  everyDays: 180 },
      { service: 'Annual Inspection (State)',    everyMiles: null,  everyDays: 365 },
      { service: 'AED / Cardiac Monitor PM',    everyMiles: null,  everyDays: 365 },
      { service: 'Stretcher Certification',      everyMiles: null,  everyDays: 365 },
    ],
  },
];

// ─── Sample Maintenance Records ───────────────────────────────────────────────

const yr = new Date().getFullYear();
const d  = (mo, day) => `${yr}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
const py = (mo, day) => `${yr - 1}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

let _id = 1;
const mid = () => `mnt-${String(_id++).padStart(3,'0')}`;

export const initialMaintenance = [

  // ── Engine 14 ────────────────────────────────────────────────────────────
  {
    id: mid(), apparatusId: 1, apparatusName: 'Engine 14',
    type: 'Preventive Maintenance', priority: 'Routine', status: 'Completed',
    date: d(2, 10), mileage: 38100, engineHours: null,
    description: 'Oil & filter change, coolant top-off, belt/hose inspection, all fluid levels checked.',
    technician: 'Sandra Kim', vendor: '',
    laborHours: 1.5, partsCost: 68, laborCost: 0, totalCost: 68,
    workOrder: 'WO-2026-014',
    nextServiceMiles: 43100, nextServiceDate: d(8, 10),
    notes: 'All fluids normal. Fan belt showing minor wear — flagged for next service.',
  },
  {
    id: mid(), apparatusId: 1, apparatusName: 'Engine 14',
    type: 'Corrective Repair', priority: 'Urgent', status: 'Completed',
    date: d(1, 22), mileage: 37950, engineHours: null,
    description: 'Replaced passenger-side scene light (Unit #2) — fixture housing cracked, intermittent connection.',
    technician: 'Riverside Apparatus', vendor: 'Riverside Apparatus & Equipment',
    laborHours: 2.0, partsCost: 210, laborCost: 140, totalCost: 350,
    workOrder: 'WO-2026-009',
    nextServiceMiles: null, nextServiceDate: null,
    notes: 'New LED fixture installed. Original was factory unit from 2018 with corrosion on ground wire.',
  },
  {
    id: mid(), apparatusId: 1, apparatusName: 'Engine 14',
    type: 'Pump Test', priority: 'Routine', status: 'Completed',
    date: py(12, 14), mileage: 36800, engineHours: null,
    description: 'Annual NFPA 1911 pump service test — 100% capacity at 150 PSI, 70% at 200 PSI, 50% at 250 PSI, vacuum test.',
    technician: 'Sandra Kim', vendor: '',
    laborHours: 3.0, partsCost: 0, laborCost: 0, totalCost: 0,
    workOrder: 'WO-2025-089',
    nextServiceMiles: null, nextServiceDate: d(12, 14),
    notes: 'All tests passed within NFPA spec. Primer evacuated 10 ft dry hose in 22 seconds. No leaks detected.',
  },
  {
    id: mid(), apparatusId: 1, apparatusName: 'Engine 14',
    type: 'Annual Inspection', priority: 'Routine', status: 'Completed',
    date: py(11, 8), mileage: 36200, engineHours: null,
    description: 'State DOT annual safety inspection — brakes, lights, tires, steering, exhaust, coupling devices.',
    technician: 'County Fleet Services', vendor: 'County Fleet Services',
    laborHours: 4.0, partsCost: 0, laborCost: 0, totalCost: 0,
    workOrder: 'WO-2025-077',
    nextServiceMiles: null, nextServiceDate: d(11, 8),
    notes: 'Passed all items. Inspector noted minor surface rust on rear frame — not a defect at this time, monitor.',
  },
  {
    id: mid(), apparatusId: 1, apparatusName: 'Engine 14',
    type: 'Corrective Repair', priority: 'Critical', status: 'In Progress',
    date: d(3, 2), mileage: 38420, engineHours: null,
    description: 'Check engine light on — P0401 code (EGR flow insufficient). Unit placed on limited service pending diagnosis.',
    technician: 'Riverside Apparatus', vendor: 'Riverside Apparatus & Equipment',
    laborHours: null, partsCost: null, laborCost: null, totalCost: null,
    workOrder: 'WO-2026-021',
    nextServiceMiles: null, nextServiceDate: null,
    notes: 'EGR valve and passages being cleaned/tested. Parts on order if replacement needed. Estimated completion 3–5 days.',
  },
  {
    id: mid(), apparatusId: 1, apparatusName: 'Engine 14',
    type: 'Tires', priority: 'Routine', status: 'Completed',
    date: py(9, 20), mileage: 34500, engineHours: null,
    description: 'Replaced all 6 tires (steer axle + drive axle). Installed Michelin XZE2+ commercial all-season.',
    technician: 'County Fleet Services', vendor: 'County Fleet Services',
    laborHours: 3.0, partsCost: 2800, laborCost: 240, totalCost: 3040,
    workOrder: 'WO-2025-061',
    nextServiceMiles: null, nextServiceDate: null,
    notes: 'All tires torqued to spec. Spare checked and serviceable.',
  },

  // ── Ladder 14 ────────────────────────────────────────────────────────────
  {
    id: mid(), apparatusId: 3, apparatusName: 'Ladder 14',
    type: 'Annual Inspection', priority: 'Routine', status: 'Completed',
    date: py(10, 15), mileage: 22800, engineHours: null,
    description: 'NFPA 1911 aerial ladder test — full extension, rotation, load test at 750 lbs. Hydraulic system check.',
    technician: 'Pierce Manufacturing Service', vendor: 'Pierce Manufacturing Service Center',
    laborHours: 6.0, partsCost: 0, laborCost: 480, totalCost: 480,
    workOrder: 'WO-2025-072',
    nextServiceMiles: null, nextServiceDate: d(10, 15),
    notes: 'Aerial passed all load tests. Hydraulic fluid changed, cylinders inspected — no cracks or deformation. Recommend stabilizer pad replacement at next service (cosmetic wear only).',
  },
  {
    id: mid(), apparatusId: 3, apparatusName: 'Ladder 14',
    type: 'Preventive Maintenance', priority: 'Routine', status: 'Completed',
    date: d(1, 30), mileage: 23100, engineHours: null,
    description: 'Oil & filter change, air filter, fuel filter, transmission fluid check, all chassis lubrication points.',
    technician: 'Sandra Kim', vendor: '',
    laborHours: 2.0, partsCost: 112, laborCost: 0, totalCost: 112,
    workOrder: 'WO-2026-011',
    nextServiceMiles: 28100, nextServiceDate: d(7, 30),
    notes: 'Transmission fluid slightly dark — not yet at replacement interval but flagged. All other fluids good.',
  },
  {
    id: mid(), apparatusId: 3, apparatusName: 'Ladder 14',
    type: 'Corrective Repair', priority: 'Urgent', status: 'Pending',
    date: d(3, 1), mileage: 23180, engineHours: null,
    description: 'Outrigger indicator light (driver side rear) inoperable — light does not illuminate when pad is deployed.',
    technician: '', vendor: '',
    laborHours: null, partsCost: null, laborCost: null, totalCost: null,
    workOrder: 'WO-2026-020',
    nextServiceMiles: null, nextServiceDate: null,
    notes: 'Operational workaround in place — spotter required on driver side. Part ordered from Pierce, ETA 1 week.',
  },

  // ── Rescue 14 ────────────────────────────────────────────────────────────
  {
    id: mid(), apparatusId: 5, apparatusName: 'Rescue 14',
    type: 'Preventive Maintenance', priority: 'Routine', status: 'Completed',
    date: d(2, 5), mileage: 29400, engineHours: null,
    description: 'Oil & filter change, serpentine belt replacement (scheduled), power steering fluid, brake fluid inspection.',
    technician: 'Sandra Kim', vendor: '',
    laborHours: 2.5, partsCost: 148, laborCost: 0, totalCost: 148,
    workOrder: 'WO-2026-012',
    nextServiceMiles: 34400, nextServiceDate: d(8, 5),
    notes: 'Serpentine belt replaced at 28,900 mi (slightly ahead of 30k interval — had the time). Brake fluid moisture test borderline — schedule flush at next PM.',
  },
  {
    id: mid(), apparatusId: 5, apparatusName: 'Rescue 14',
    type: 'SCBA / Equipment', priority: 'Routine', status: 'Completed',
    date: py(11, 20), mileage: 28100, engineHours: null,
    description: 'Annual hydraulic rescue tool service — spreader, cutter, and two rams. Fluid change, seals inspected, test cuts.',
    technician: 'Hurst eDraulic Service', vendor: 'Hurst eDraulic',
    laborHours: 4.0, partsCost: 340, laborCost: 380, totalCost: 720,
    workOrder: 'WO-2025-082',
    nextServiceMiles: null, nextServiceDate: d(11, 20),
    notes: 'All tools within manufacturer spec. Cutter blade edge serviceable — will need replacement within 2 service cycles.',
  },
  {
    id: mid(), apparatusId: 5, apparatusName: 'Rescue 14',
    type: 'Corrective Repair', priority: 'Urgent', status: 'Completed',
    date: d(1, 14), mileage: 29050, engineHours: null,
    description: 'Generator — unit failed to start during weekly check. Carburetor cleaned, fuel lines flushed, spark plug replaced.',
    technician: 'Sandra Kim', vendor: '',
    laborHours: 2.0, partsCost: 42, laborCost: 0, totalCost: 42,
    workOrder: 'WO-2026-007',
    nextServiceMiles: null, nextServiceDate: null,
    notes: 'Old fuel had gummed carburetor (unit sat ~6 weeks over holidays). Running clean after service. Run generator weekly per SOG.',
  },

  // ── EMS 14 ───────────────────────────────────────────────────────────────
  {
    id: mid(), apparatusId: 8, apparatusName: 'EMS 14',
    type: 'Preventive Maintenance', priority: 'Routine', status: 'Completed',
    date: d(1, 25), mileage: 22050, engineHours: null,
    description: 'Oil & filter change, tire rotation, cabin air filter, wiper blades, battery voltage check.',
    technician: 'Sandra Kim', vendor: '',
    laborHours: 1.5, partsCost: 78, laborCost: 0, totalCost: 78,
    workOrder: 'WO-2026-010',
    nextServiceMiles: 27050, nextServiceDate: d(7, 25),
    notes: 'Battery at 12.4V cold — adequate but flagged. Budget for replacement before winter 2026.',
  },
  {
    id: mid(), apparatusId: 8, apparatusName: 'EMS 14',
    type: 'SCBA / Equipment', priority: 'Routine', status: 'Completed',
    date: py(12, 1), mileage: 21400, engineHours: null,
    description: 'Stretcher annual certification and weight test per NFPA 1917. AED battery and pad replacement.',
    technician: 'Nathan McGee', vendor: 'Stryker Medical Service',
    laborHours: 2.0, partsCost: 185, laborCost: 95, totalCost: 280,
    workOrder: 'WO-2025-092',
    nextServiceMiles: null, nextServiceDate: d(12, 1),
    notes: 'Stretcher passed weight test. AED pads replaced (expiry Dec 2025). Cardiac monitor calibration current through March 2026.',
  },
  {
    id: mid(), apparatusId: 8, apparatusName: 'EMS 14',
    type: 'Corrective Repair', priority: 'Routine', status: 'Pending',
    date: d(2, 28), mileage: 22180, engineHours: null,
    description: 'Rear compartment door latch sticking — requires excessive force to open from exterior. Door alignment adjustment needed.',
    technician: '', vendor: '',
    laborHours: null, partsCost: null, laborCost: null, totalCost: null,
    workOrder: 'WO-2026-019',
    nextServiceMiles: null, nextServiceDate: null,
    notes: 'Door opens fine from interior. Not a safety issue — operational workaround until repaired. Scheduled for next available bay time.',
  },

  // ── Command 14 ───────────────────────────────────────────────────────────
  {
    id: mid(), apparatusId: 7, apparatusName: 'Command 14',
    type: 'Preventive Maintenance', priority: 'Routine', status: 'Completed',
    date: d(1, 15), mileage: 41200, engineHours: null,
    description: 'Oil change, tire rotation, brake inspection, 4WD system check, cabin filter.',
    technician: 'Town Fleet Garage', vendor: 'Town of Maplewood Fleet',
    laborHours: 2.0, partsCost: 88, laborCost: 75, totalCost: 163,
    workOrder: 'WO-2026-006',
    nextServiceMiles: 46200, nextServiceDate: d(7, 15),
    notes: 'Front brake pads at 35% — schedule replacement within 10,000 miles. 4WD engages cleanly.',
  },
  {
    id: mid(), apparatusId: 7, apparatusName: 'Command 14',
    type: 'Electrical / Electronics', priority: 'Routine', status: 'Completed',
    date: py(10, 5), mileage: 39800, engineHours: null,
    description: 'MDT mount replaced (broken pivot), new radio antenna installed, light bar firmware update.',
    technician: 'Communications Division', vendor: 'County Communications',
    laborHours: 3.0, partsCost: 220, laborCost: 185, totalCost: 405,
    workOrder: 'WO-2025-068',
    nextServiceMiles: null, nextServiceDate: null,
    notes: 'All electronic systems functional post-install. MDT pivot lock is secure.',
  },
];
