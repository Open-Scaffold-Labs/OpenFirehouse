// ─── Occupational Health & Wellness Data ─────────────────────────────────────

export const EXPOSURE_TYPES = [
  'Smoke / Combustion Products',
  'Chemical / Hazmat',
  'Pathogen / Blood-Borne',
  'Carcinogen',
  'Noise',
  'Heat / Thermal',
  'Radiation',
  'Infectious Disease',
  'Other',
];

export const VACCINATION_TYPES = [
  'Hepatitis B',
  'Tdap / Tetanus',
  'Influenza (Flu)',
  'COVID-19',
  'Meningococcal',
  'MMR',
  'Varicella (Chickenpox)',
  'Rabies',
];

export const PHYSICAL_STATUS = {
  current:    { label: 'Current',      color: 'text-green-700',  bg: 'bg-green-50 border-green-200',  dot: 'bg-green-500' },
  dueSoon:    { label: 'Due Soon',     color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',  dot: 'bg-amber-400' },
  overdue:    { label: 'Overdue',      color: 'text-red-700',    bg: 'bg-red-50 border-red-200',      dot: 'bg-red-500'   },
  notOnFile:  { label: 'Not on File',  color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200',    dot: 'bg-gray-400'  },
};

// Determines status relative to today (2026-03-06)
export function getStatus(dueDateStr) {
  if (!dueDateStr) return 'notOnFile';
  const today  = new Date('2026-03-06');
  const due    = new Date(dueDateStr);
  const days   = Math.round((due - today) / 86400000);
  if (days < 0)   return 'overdue';
  if (days <= 90) return 'dueSoon';
  return 'current';
}

// ── Wellness Records (one per member, keyed by memberId) ──────────────────────
export const initialWellnessRecords = [
  {
    memberId: 1,
    memberName: 'Sarah Chen',
    bloodType: 'O+',
    medicalRestrictions: '',
    // NFPA 1582 physicals
    physicals: [
      { id: 101, date: '2023-02-10', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
      { id: 102, date: '2024-02-12', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
      { id: 103, date: '2025-02-15', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: 'BP slightly elevated. Follow-up in 6 months recommended.' },
    ],
    physicalDue: '2026-02-15',   // OVERDUE
    // SCBA fit tests
    scbaFitTests: [
      { id: 201, date: '2024-09-08', mask: 'MSA G1 SCBA', result: 'Pass', notes: '' },
      { id: 202, date: '2025-09-10', mask: 'MSA G1 SCBA', result: 'Pass', notes: '' },
    ],
    scbaFitDue: '2026-09-10',
    // Vaccinations
    vaccinations: [
      { id: 301, type: 'Hepatitis B', dates: ['2004-05-01', '2004-07-01', '2004-11-01'], status: 'Complete' },
      { id: 302, type: 'Tdap / Tetanus', dates: ['2020-03-15'], status: 'Current' },
      { id: 303, type: 'Influenza (Flu)', dates: ['2025-10-20'], status: 'Current' },
      { id: 304, type: 'COVID-19', dates: ['2021-04-10', '2021-05-08', '2022-10-01'], status: 'Complete' },
    ],
    // Exposure log
    exposures: [
      { id: 401, date: '2026-01-04', incidentNumber: '26-0001', type: 'Smoke / Combustion Products', description: 'Extended interior attack — kitchen fire extended to wall cavity.', deconPerformed: true,  medEval: false, followUp: false, notes: '' },
      { id: 402, date: '2026-03-04', incidentNumber: '26-0010', type: 'Smoke / Combustion Products', description: 'Bedroom fire — initial attack crew. Smoke conditions prior to ventilation.', deconPerformed: true,  medEval: false, followUp: false, notes: 'Minor skin irritation reported post-incident.' },
    ],
  },
  {
    memberId: 2,
    memberName: 'Maria Delgado',
    bloodType: 'A+',
    medicalRestrictions: '',
    physicals: [
      { id: 104, date: '2024-06-18', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
      { id: 105, date: '2025-06-20', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
    ],
    physicalDue: '2026-06-20',   // Current
    scbaFitTests: [
      { id: 203, date: '2025-06-20', mask: 'MSA G1 SCBA', result: 'Pass', notes: '' },
    ],
    scbaFitDue: '2026-06-20',
    vaccinations: [
      { id: 305, type: 'Hepatitis B', dates: ['2010-09-01', '2010-11-01', '2011-03-01'], status: 'Complete' },
      { id: 306, type: 'Influenza (Flu)', dates: ['2025-11-05'], status: 'Current' },
      { id: 307, type: 'COVID-19', dates: ['2021-05-01', '2021-05-29'], status: 'Complete' },
    ],
    exposures: [
      { id: 403, date: '2026-01-04', incidentNumber: '26-0001', type: 'Smoke / Combustion Products', description: 'Structure fire — second-in crew, overhaul operations.', deconPerformed: true, medEval: false, followUp: false, notes: '' },
    ],
  },
  {
    memberId: 3,
    memberName: 'Nathan McGee',
    bloodType: 'B-',
    medicalRestrictions: '',
    physicals: [
      { id: 106, date: '2024-01-08', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
      { id: 107, date: '2025-01-10', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
    ],
    physicalDue: '2026-01-10',   // OVERDUE
    scbaFitTests: [
      { id: 204, date: '2025-10-05', mask: 'MSA G1 SCBA', result: 'Pass', notes: '' },
    ],
    scbaFitDue: '2026-10-05',
    vaccinations: [
      { id: 308, type: 'Hepatitis B', dates: ['2013-10-01', '2013-12-01', '2014-04-01'], status: 'Complete' },
      { id: 309, type: 'Influenza (Flu)', dates: ['2025-10-12'], status: 'Current' },
      { id: 310, type: 'COVID-19', dates: ['2021-04-15', '2021-05-13', '2022-09-20'], status: 'Complete' },
    ],
    exposures: [
      { id: 404, date: '2026-01-09', incidentNumber: '26-0002', type: 'Pathogen / Blood-Borne', description: 'MVA patient care — significant hemorrhage, BSI precautions taken.', deconPerformed: false, medEval: false, followUp: false, notes: 'Full PPE worn. No breach.' },
      { id: 405, date: '2026-01-15', incidentNumber: '26-0003', type: 'Pathogen / Blood-Borne', description: 'Cardiac patient — ALS assessment and airway management.', deconPerformed: false, medEval: false, followUp: false, notes: '' },
    ],
  },
  {
    memberId: 4,
    memberName: 'Sandra Kim',
    bloodType: 'AB+',
    medicalRestrictions: '',
    physicals: [
      { id: 108, date: '2024-11-12', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
      { id: 109, date: '2025-11-15', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
    ],
    physicalDue: '2026-11-15',
    scbaFitTests: [
      { id: 205, date: '2025-11-15', mask: 'MSA G1 SCBA', result: 'Pass', notes: '' },
    ],
    scbaFitDue: '2026-11-15',
    vaccinations: [
      { id: 311, type: 'Hepatitis B', dates: ['2015-03-01', '2015-05-01', '2015-09-01'], status: 'Complete' },
      { id: 312, type: 'Influenza (Flu)', dates: ['2025-10-25'], status: 'Current' },
    ],
    exposures: [
      { id: 406, date: '2026-01-04', incidentNumber: '26-0001', type: 'Smoke / Combustion Products', description: 'Structure fire — pump operator, exposure during overhaul.', deconPerformed: true, medEval: false, followUp: false, notes: '' },
      { id: 407, date: '2026-02-11', incidentNumber: '26-0006', type: 'Smoke / Combustion Products', description: 'Vehicle fire — engine compartment fire, initial attack.', deconPerformed: true, medEval: false, followUp: false, notes: '' },
    ],
  },
  {
    memberId: 5,
    memberName: 'Lisa Fontaine',
    bloodType: 'O-',
    medicalRestrictions: 'Currently on medical leave — not cleared for operational response.',
    physicals: [
      { id: 110, date: '2023-08-18', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
      { id: 111, date: '2024-08-20', provider: 'Occ. Health Associates', result: 'Modified Duty — knee injury', notes: 'Right knee meniscus repair. No stair climbs or heavy lifting >50 lbs for 90 days.' },
    ],
    physicalDue: '2025-08-20',   // OVERDUE (on leave)
    scbaFitTests: [
      { id: 206, date: '2024-08-20', mask: 'MSA G1 SCBA', result: 'Pass', notes: '' },
    ],
    scbaFitDue: '2025-08-20',    // OVERDUE
    vaccinations: [
      { id: 313, type: 'Hepatitis B', dates: ['2017-06-01', '2017-08-01', '2017-12-01'], status: 'Complete' },
      { id: 314, type: 'Influenza (Flu)', dates: ['2024-10-15'], status: 'Expired' },
    ],
    exposures: [],
  },
  {
    memberId: 6,
    memberName: 'Tracy Benson',
    bloodType: 'A-',
    medicalRestrictions: '',
    physicals: [
      { id: 112, date: '2024-09-03', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
      { id: 113, date: '2025-09-05', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
    ],
    physicalDue: '2026-09-05',
    scbaFitTests: [
      { id: 207, date: '2025-09-05', mask: 'MSA G1 SCBA', result: 'Pass', notes: '' },
    ],
    scbaFitDue: '2026-09-05',
    vaccinations: [
      { id: 315, type: 'Hepatitis B', dates: ['2018-12-01', '2019-02-01', '2019-06-01'], status: 'Complete' },
      { id: 316, type: 'Influenza (Flu)', dates: ['2025-10-30'], status: 'Current' },
      { id: 317, type: 'COVID-19', dates: ['2021-06-01', '2021-06-29'], status: 'Complete' },
    ],
    exposures: [
      { id: 408, date: '2026-01-22', incidentNumber: '26-0004', type: 'Chemical / Hazmat', description: 'Gas leak response — natural gas odor, building evacuation. Monitoring with CGI.', deconPerformed: false, medEval: false, followUp: false, notes: 'Below LEL at all times. No significant exposure.' },
      { id: 409, date: '2026-02-25', incidentNumber: '26-0008', type: 'Smoke / Combustion Products', description: 'Brush fire — wind-driven, 3 acres. Some smoke inhalation during operations.', deconPerformed: false, medEval: false, followUp: false, notes: '' },
    ],
  },
  {
    memberId: 7,
    memberName: 'James Ortega',
    bloodType: 'B+',
    medicalRestrictions: '',
    physicals: [
      { id: 114, date: '2024-07-20', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
      { id: 115, date: '2025-07-22', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
    ],
    physicalDue: '2026-07-22',
    scbaFitTests: [
      { id: 208, date: '2025-12-01', mask: 'Scott Air-Pak X3 Pro', result: 'Pass', notes: 'Switched from MSA. Quantitative fit, irritant smoke.' },
    ],
    scbaFitDue: '2026-12-01',
    vaccinations: [
      { id: 318, type: 'Hepatitis B', dates: ['2021-04-01', '2021-06-01', '2021-10-01'], status: 'Complete' },
      { id: 319, type: 'Influenza (Flu)', dates: ['2025-11-02'], status: 'Current' },
    ],
    exposures: [
      { id: 410, date: '2026-01-22', incidentNumber: '26-0004', type: 'Chemical / Hazmat', description: 'Gas leak — meter reader, structure survey with CGI prior to utility arrival.', deconPerformed: false, medEval: false, followUp: false, notes: '' },
      { id: 411, date: '2026-02-25', incidentNumber: '26-0008', type: 'Smoke / Combustion Products', description: 'Brush fire — hose line operations, direct flame proximity.', deconPerformed: false, medEval: false, followUp: false, notes: '' },
    ],
  },
  {
    memberId: 8,
    memberName: 'Amy Winters',
    bloodType: '',
    medicalRestrictions: '',
    physicals: [],
    physicalDue: null,   // Never completed — NOT ON FILE
    scbaFitTests: [],
    scbaFitDue: null,    // NOT ON FILE
    vaccinations: [
      { id: 320, type: 'Hepatitis B', dates: ['2025-09-10', '2025-11-10'], status: 'In Progress' },
      { id: 321, type: 'Influenza (Flu)', dates: ['2025-10-15'], status: 'Current' },
    ],
    exposures: [
      { id: 412, date: '2026-02-25', incidentNumber: '26-0008', type: 'Smoke / Combustion Products', description: 'Brush fire — hose line support. First operational exposure as probationary member.', deconPerformed: false, medEval: false, followUp: false, notes: 'Supervised by Lt. McGee.' },
    ],
  },
  {
    memberId: 9,
    memberName: 'Mike Harrington',
    bloodType: 'O+',
    medicalRestrictions: '',
    physicals: [
      { id: 116, date: '2024-04-12', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
      { id: 117, date: '2025-04-15', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
    ],
    physicalDue: '2026-04-15',   // Due Soon (~40 days)
    scbaFitTests: [
      { id: 209, date: '2025-04-15', mask: 'MSA G1 SCBA', result: 'Pass', notes: '' },
    ],
    scbaFitDue: '2026-04-15',    // Due Soon
    vaccinations: [
      { id: 322, type: 'Hepatitis B', dates: ['2019-09-01', '2019-11-01', '2020-03-01'], status: 'Complete' },
      { id: 323, type: 'Influenza (Flu)', dates: ['2025-10-08'], status: 'Current' },
      { id: 324, type: 'COVID-19', dates: ['2021-05-20', '2021-06-17'], status: 'Complete' },
    ],
    exposures: [
      { id: 413, date: '2026-01-09', incidentNumber: '26-0002', type: 'Pathogen / Blood-Borne', description: 'MVA — patient extrication and EMS support. Blood exposure, gloves intact.', deconPerformed: false, medEval: false, followUp: false, notes: '' },
      { id: 414, date: '2026-01-15', incidentNumber: '26-0003', type: 'Pathogen / Blood-Borne', description: 'Cardiac patient — ALS assist, intubation support.', deconPerformed: false, medEval: false, followUp: false, notes: '' },
      { id: 415, date: '2026-02-18', incidentNumber: '26-0007', type: 'Pathogen / Blood-Borne', description: 'Fall, elderly — patient assessment and packaging.', deconPerformed: false, medEval: false, followUp: false, notes: '' },
    ],
  },
  {
    memberId: 10,
    memberName: 'Lisa Fontaine',
    bloodType: 'AB-',
    medicalRestrictions: 'Inactive status — not authorized for emergency response.',
    physicals: [
      { id: 118, date: '2022-05-28', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
      { id: 119, date: '2023-05-30', provider: 'Occ. Health Associates', result: 'Cleared — Full Duty', notes: '' },
    ],
    physicalDue: '2024-05-30',   // OVERDUE (inactive)
    scbaFitTests: [
      { id: 210, date: '2023-05-30', mask: 'MSA G1 SCBA', result: 'Pass', notes: '' },
    ],
    scbaFitDue: '2024-05-30',    // OVERDUE
    vaccinations: [
      { id: 325, type: 'Hepatitis B', dates: ['2011-07-01', '2011-09-01', '2012-01-01'], status: 'Complete' },
      { id: 326, type: 'Influenza (Flu)', dates: ['2023-10-20'], status: 'Expired' },
    ],
    exposures: [],
  },
];
