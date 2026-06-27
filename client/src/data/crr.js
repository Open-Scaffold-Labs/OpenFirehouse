// Community Risk Reduction (CRR) data

export const VISIT_TYPES = [
  'Home Safety Visit',
  'Smoke Detector Install',
  'CO Detector Install',
  'Smoke + CO Install',
  'Follow-Up Visit',
  'Referral Check',
];

export const PROGRAM_TYPES = [
  'Home Safety Visit',
  'Juvenile Fire Setter (JFS)',
  'School / Youth Education',
  'Community Event / Fair',
  'Business Safety Visit',
  'Senior Outreach',
  'Disability Access Survey',
  'Social Media Campaign',
  'Station Tour',
  'Fire Extinguisher Class',
];

export const RISK_LEVELS = ['Low', 'Moderate', 'High', 'Critical'];

export const RISK_COLORS = {
  Low:      { bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500'  },
  Moderate: { bg: 'bg-amber-100',  text: 'text-amber-800',  dot: 'bg-amber-500'  },
  High:     { bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500'  },
  Critical: { bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500'    },
};

export const OUTCOME_TYPES = [
  'Detector Installed',
  'Detector Replaced',
  'Detector Declined',
  'Hazard Corrected',
  'Referral Made',
  'No Action Needed',
  'Follow-Up Scheduled',
];

export const JFS_OUTCOMES = [
  'Program Completed',
  'Referred to Counseling',
  'Referred to Juvenile Court',
  'No Further Action',
  'Ongoing',
];

export const DETECTOR_STATUS = ['Good', 'Installed', 'Replaced', 'Declined', 'N/A'];

// Crew members available to assign
export const CRR_MEMBERS = [
  'Sarah Chen',
  'Mike Hanson',
  'Josh Peters',
  'Sara Olson',
  'Tom Birch',
  'Amy Voss',
];

// ── Home Safety Visits ───────────────────────────────────────────────────────
export const initialVisits = [
  {
    id: 'v1',
    date: '2026-03-04',
    type: 'Home Safety Visit',
    address: '412 Elm Street',
    resident: 'Margaret Chen',
    phone: '715-555-0182',
    riskLevel: 'High',
    crew: ['Sarah Chen', 'Amy Voss'],
    smokeDet: 'Installed',
    coDet: 'Installed',
    outcomes: ['Detector Installed', 'Hazard Corrected'],
    hazards: 'Space heater within 12 inches of curtains; corrected on site.',
    notes: 'Resident lives alone, 82 yrs old. Added to 6-month check list.',
    followUpDate: '2026-09-04',
  },
  {
    id: 'v2',
    date: '2026-02-18',
    type: 'Smoke + CO Install',
    address: '88 County Road F',
    resident: 'Jim and Carol Stein',
    phone: '715-555-0341',
    riskLevel: 'Moderate',
    crew: ['Josh Peters', 'Sara Olson'],
    smokeDet: 'Replaced',
    coDet: 'Installed',
    outcomes: ['Detector Replaced', 'Detector Installed'],
    hazards: '',
    notes: 'Old ionization-only detectors replaced with combo units. CO installed near furnace.',
    followUpDate: '',
  },
  {
    id: 'v3',
    date: '2026-01-29',
    type: 'Follow-Up Visit',
    address: '214 Oak Ave',
    resident: 'Robert Tanner',
    phone: '715-555-0294',
    riskLevel: 'Low',
    crew: ['Mike Hanson'],
    smokeDet: 'Good',
    coDet: 'Good',
    outcomes: ['No Action Needed'],
    hazards: '',
    notes: 'Follow-up on Nov install. All detectors functional. Resident tested units with crew.',
    followUpDate: '',
  },
  {
    id: 'v4',
    date: '2026-01-10',
    type: 'Home Safety Visit',
    address: '550 Pine Ridge Rd',
    resident: 'Anita Flores',
    phone: '715-555-0517',
    riskLevel: 'Critical',
    crew: ['Sarah Chen', 'Tom Birch'],
    smokeDet: 'Installed',
    coDet: 'Declined',
    outcomes: ['Detector Installed', 'Detector Declined', 'Referral Made'],
    hazards: 'Improperly stored propane cylinders in attached garage. Extension cord used as permanent wiring.',
    notes: 'Referred to county housing authority re: wiring hazard. Resident declined CO detector (owns no gas appliances). Photos taken.',
    followUpDate: '2026-04-10',
  },
];

// ── Community Programs ────────────────────────────────────────────────────────
export const initialPrograms = [
  {
    id: 'p1',
    date: '2026-02-14',
    type: 'School / Youth Education',
    title: 'Fire Safety Day — Lincoln Elementary',
    location: 'Lincoln Elementary School',
    audience: 'K–4 students',
    attendees: 87,
    crew: ['Sarah Chen', 'Josh Peters', 'Sara Olson', 'Amy Voss'],
    topics: ['Stop, Drop & Roll', 'Home Escape Plan', 'When to Call 911', 'Smoke Alarm Awareness'],
    materials: 'Coloring books, plastic helmets, escape-plan worksheets',
    outcome: 'All 87 students received escape-plan worksheet to take home.',
    notes: 'Teacher feedback very positive. Invited back in October for Fire Prevention Week.',
    jfs: false,
  },
  {
    id: 'p2',
    date: '2026-01-22',
    type: 'Fire Extinguisher Class',
    title: 'Hands-On Extinguisher Training',
    location: 'Town Hall Parking Lot',
    audience: 'General public',
    attendees: 24,
    crew: ['Mike Hanson', 'Tom Birch'],
    topics: ['PASS Technique', 'Extinguisher Classes (A/B/C)', 'When NOT to Fight a Fire'],
    materials: 'Live-fire prop, 6 training extinguishers, handouts',
    outcome: 'All participants completed live-fire evolution.',
    notes: 'Co-sponsored with town insurance agency. Will repeat quarterly.',
    jfs: false,
  },
  {
    id: 'p3',
    date: '2026-01-08',
    type: 'Juvenile Fire Setter (JFS)',
    title: 'JFS Intervention — Case #2026-01',
    location: 'Station 1 / Private (family meeting)',
    audience: 'Youth (age 11) + guardians',
    attendees: 3,
    crew: ['Sarah Chen'],
    topics: ['Fire behavior', 'Consequences', 'Safety contract'],
    materials: 'NFPA JFS curriculum, safety contract form',
    outcome: 'Program Completed',
    jfsOutcome: 'Program Completed',
    notes: 'Case referred by school counselor. One-on-one session with guardian present. Safety contract signed. No further incidents reported as of follow-up.',
    jfs: true,
    jfsFollowUp: '2026-04-08',
  },
  {
    id: 'p4',
    date: '2025-10-08',
    type: 'Community Event / Fair',
    title: 'Fire Prevention Week Open House',
    location: 'Fire Station 1',
    audience: 'General public',
    attendees: 312,
    crew: ['Sarah Chen', 'Mike Hanson', 'Josh Peters', 'Sara Olson', 'Tom Birch', 'Amy Voss'],
    topics: ['Smoke Alarms', 'Escape Planning', 'Apparatus Tours', 'Hydrant Flushing Demo'],
    materials: 'Alarm giveaways (18 units), brochures, coloring books',
    outcome: '18 smoke alarms distributed. 6 home safety visits scheduled from sign-up sheet.',
    notes: 'Best-attended event in department history per Chief.',
    jfs: false,
  },
];

// ── Aggregate stats helpers ───────────────────────────────────────────────────
export function getCRRStats(visits, programs) {
  const detectorsInstalled = visits.filter(v =>
    v.outcomes.includes('Detector Installed') || v.outcomes.includes('Detector Replaced')
  ).length;

  const highRisk = visits.filter(v => v.riskLevel === 'High' || v.riskLevel === 'Critical').length;

  const totalReached = programs.reduce((s, p) => s + p.attendees, 0);

  const jfsCount = programs.filter(p => p.jfs).length;

  return { detectorsInstalled, highRisk, totalReached, jfsCount };
}
