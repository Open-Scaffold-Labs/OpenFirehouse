// ─── Hazmat Module — Constants & Seed Data ────────────────────────────────────

export const HAZMAT_LEVELS = ['Awareness', 'Operations', 'Technician', 'Specialist', 'Incident Commander'];

export const HAZMAT_CLASSES = [
  'Class 1 – Explosives',
  'Class 2 – Gases',
  'Class 3 – Flammable Liquids',
  'Class 4 – Flammable Solids',
  'Class 5 – Oxidizers & Peroxides',
  'Class 6 – Toxic & Infectious',
  'Class 7 – Radioactive',
  'Class 8 – Corrosives',
  'Class 9 – Miscellaneous',
];

export const HAZMAT_INCIDENT_TYPES = [
  'Fuel Spill',
  'Chemical Release',
  'Gas Leak',
  'Radiological Incident',
  'Biological Hazard',
  'Unknown Substance',
  'Transportation Accident',
  'Industrial Accident',
  'Illegal Dump / Clandestine Lab',
];

export const INCIDENT_STATUSES = ['Active', 'Mitigated', 'Closed', 'Referred'];
export const MATERIAL_STATUSES  = ['In Stock', 'Low Stock', 'Out of Stock', 'Expired', 'Quarantined'];
export const CERT_STATUSES      = ['Current', 'Expiring Soon', 'Expired', 'Not Certified'];
export const EQUIPMENT_STATUSES = ['Serviceable', 'Due Inspection', 'Out of Service', 'Decommissioned'];

export const PPE_LEVELS = ['Level A', 'Level B', 'Level C', 'Level D'];

export const STATUS_COLORS = {
  // incidents
  Active:      { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  Mitigated:   { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  Closed:      { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  Referred:    { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  // materials
  'In Stock':     { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'Low Stock':    { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  'Out of Stock': { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  Expired:        { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  Quarantined:    { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  // certs
  Current:         { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'Expiring Soon': { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  'Not Certified': { bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-400'   },
  // equipment
  Serviceable:       { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'Due Inspection':  { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  'Out of Service':  { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  Decommissioned:    { bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-400'   },
};

// ─── Seed Data ────────────────────────────────────────────────────────────────

export const SEED_INCIDENTS = [
  {
    id: 1,
    date: '2026-02-14',
    type: 'Fuel Spill',
    location: '1800 Industrial Blvd',
    material: 'Diesel Fuel',
    hazmatClass: 'Class 3 – Flammable Liquids',
    quantity: '50 gallons',
    status: 'Closed',
    responders: ['Sarah Chen', 'Maria Delgado'],
    narrative: 'Fuel spill from tanker truck during loading. Contained with absorbent materials. Environmental contractor notified.',
    deconRequired: true,
    injuries: 0,
    reportNumber: 'HZ-2026-001',
  },
  {
    id: 2,
    date: '2026-03-01',
    type: 'Gas Leak',
    location: '412 Main St — Maplewood Diner',
    material: 'Natural Gas',
    hazmatClass: 'Class 2 – Gases',
    quantity: 'Unknown',
    status: 'Mitigated',
    responders: ['Sarah Chen', 'Nathan McGee'],
    narrative: 'Gas odor reported inside structure. Utility company contacted. Leak isolated at meter. Building ventilated.',
    deconRequired: false,
    injuries: 0,
    reportNumber: 'HZ-2026-002',
  },
];

export const SEED_MATERIALS = [
  {
    id: 1,
    name: 'Absorbent Pads (Universal)',
    hazmatClass: 'Class 3 – Flammable Liquids',
    quantity: 200,
    unit: 'pads',
    location: 'Hazmat Trailer – Bay 3',
    status: 'In Stock',
    expirationDate: null,
    msdsNumber: 'N/A',
    notes: 'Universal absorbent — oil, fuel, chemicals',
  },
  {
    id: 2,
    name: 'Neutralizing Agent (Acid)',
    hazmatClass: 'Class 8 – Corrosives',
    quantity: 10,
    unit: 'lbs',
    location: 'Hazmat Trailer – Bay 3',
    status: 'Low Stock',
    expirationDate: '2026-09-01',
    msdsNumber: 'SDS-0042',
    notes: 'Sodium bicarbonate — for acid spills',
  },
  {
    id: 3,
    name: 'Decon Soap (Hazmat Grade)',
    hazmatClass: 'Class 6 – Toxic & Infectious',
    quantity: 4,
    unit: 'gallons',
    location: 'Hazmat Trailer – Bay 1',
    status: 'In Stock',
    expirationDate: '2027-01-15',
    msdsNumber: 'SDS-0099',
    notes: 'Used for personnel and equipment decontamination',
  },
];

export const SEED_CERTS = [
  {
    id: 1,
    memberName: 'Sarah Chen',
    level: 'Technician',
    certNumber: 'HM-IL-4421',
    issuedDate: '2023-06-10',
    expirationDate: '2026-06-10',
    issuingBody: 'IFSAC',
    status: 'Expiring Soon',
    notes: 'Renewal class scheduled for May 2026',
  },
  {
    id: 2,
    memberName: 'Maria Delgado',
    level: 'Technician',
    certNumber: 'HM-IL-3812',
    issuedDate: '2024-04-20',
    expirationDate: '2027-04-20',
    issuingBody: 'IFSAC',
    status: 'Current',
    notes: '',
  },
  {
    id: 3,
    memberName: 'Nathan McGee',
    level: 'Operations',
    certNumber: 'HM-IL-5501',
    issuedDate: '2025-01-15',
    expirationDate: '2028-01-15',
    issuingBody: 'IFSAC',
    status: 'Current',
    notes: 'Pursuing Technician certification',
  },
];

export const SEED_EQUIPMENT = [
  {
    id: 1,
    name: 'Level A Encapsulated Suit',
    type: 'PPE',
    ppeLevel: 'Level A',
    serialNumber: 'LA-0021',
    manufacturer: 'DuPont',
    purchaseDate: '2022-03-01',
    lastInspection: '2025-12-10',
    nextInspection: '2026-06-10',
    status: 'Serviceable',
    location: 'Hazmat Trailer – Bay 2',
    notes: 'Size: XL. Inspect seams quarterly.',
  },
  {
    id: 2,
    name: 'Level B Splash Suit (x2)',
    type: 'PPE',
    ppeLevel: 'Level B',
    serialNumber: 'LB-0034',
    manufacturer: 'Kappler',
    purchaseDate: '2023-07-15',
    lastInspection: '2025-12-10',
    nextInspection: '2026-06-10',
    status: 'Serviceable',
    location: 'Hazmat Trailer – Bay 2',
    notes: 'Two suits — sizes L and XL',
  },
  {
    id: 3,
    name: 'MultiRAE Gas Monitor',
    type: 'Detection',
    ppeLevel: null,
    serialNumber: 'MR-7741',
    manufacturer: 'RAE Systems',
    purchaseDate: '2021-11-01',
    lastInspection: '2026-01-15',
    nextInspection: '2026-07-15',
    status: 'Due Inspection',
    location: 'Hazmat Trailer – Bay 1',
    notes: 'Monitors LEL, O2, CO, H2S. Battery replaced Jan 2026.',
  },
  {
    id: 4,
    name: 'Portable Decon Shower',
    type: 'Decontamination',
    ppeLevel: null,
    serialNumber: 'DS-0018',
    manufacturer: 'Cascade',
    purchaseDate: '2020-06-01',
    lastInspection: '2025-06-01',
    nextInspection: '2026-06-01',
    status: 'Serviceable',
    location: 'Hazmat Trailer – Bay 4',
    notes: 'Includes hot/cold water mixing valve',
  },
];
