'use strict';
const { grants: db } = require('./db');

module.exports = async function seedGrants() {
  const existing = await db.all(1);
  if (existing.length > 0) { console.log('Grants seed: already seeded, skipping.'); return; }

const SEED = [
  {
    grantName: 'AFG FY2025 — SCBA Replacement',
    type: 'AFG (Assistance to Firefighters Grant)',
    fundingAgency: 'FEMA / DHS — AFG Program',
    programYear: 2025,
    status: 'Active',
    applicationDate: '2025-10-15',
    awardDate: '2026-01-22',
    amountRequested: 85000,
    amountAwarded: 72500,
    matchRequired: true,
    matchPercent: 5,
    matchAmount: 3625,
    grantPeriodStart: '2026-02-01',
    grantPeriodEnd: '2027-01-31',
    reportingDeadlines: [
      { label: 'Mid-Period Progress Report', date: '2026-08-01', submitted: false },
      { label: 'Final Performance Report',   date: '2027-02-28', submitted: false },
    ],
    expenditures: [
      { date: '2026-02-28', description: 'SCBA units — 8 units, Scott X3 Pro', amount: 52400 },
      { date: '2026-03-05', description: 'SCBA cylinders — 16 spare cylinders', amount: 6800 },
    ],
    contactName: 'AFG Help Desk',
    contactEmail: 'afghelp@fema.dhs.gov',
    notes: 'Awarded for SCBA replacement — 8 units replacing 2015-era equipment. Match requirement: $3,625 from operating budget.',
  },
  {
    grantName: 'State Fire Marshal — PPE Replacement FY2025',
    type: 'State Fire Marshal Grant',
    fundingAgency: 'Indiana State Fire Marshal',
    programYear: 2025,
    status: 'Awarded',
    applicationDate: '2025-07-01',
    awardDate: '2025-09-15',
    amountRequested: 18000,
    amountAwarded: 15000,
    matchRequired: false,
    matchPercent: 0,
    matchAmount: 0,
    grantPeriodStart: '2025-10-01',
    grantPeriodEnd: '2026-09-30',
    reportingDeadlines: [
      { label: 'Final Report', date: '2026-10-31', submitted: false },
    ],
    expenditures: [
      { date: '2025-11-12', description: 'Structural PPE — 4 sets, Globe GX-7', amount: 14800 },
    ],
    contactName: 'ISFM Grant Division',
    contactEmail: '',
    notes: 'Replaced 4 sets of expired turnout gear. No match required.',
  },
  {
    grantName: 'AFG FY2024 — Thermal Imaging Cameras',
    type: 'AFG (Assistance to Firefighters Grant)',
    fundingAgency: 'FEMA / DHS — AFG Program',
    programYear: 2024,
    status: 'Closed',
    applicationDate: '2024-09-20',
    awardDate: '2024-12-10',
    amountRequested: 22000,
    amountAwarded: 18500,
    matchRequired: true,
    matchPercent: 5,
    matchAmount: 925,
    grantPeriodStart: '2025-01-15',
    grantPeriodEnd: '2026-01-14',
    reportingDeadlines: [
      { label: 'Final Performance Report', date: '2026-02-14', submitted: true },
    ],
    expenditures: [
      { date: '2025-02-08', description: 'Thermal imaging cameras — 3 units, Bullard T4 MAX', amount: 18500 },
    ],
    contactName: 'AFG Help Desk',
    contactEmail: '',
    notes: 'Grant closed. Final report submitted on time. 3 TICs now on Engine 1, Engine 2, and Rescue 1.',
  },
  {
    grantName: 'AFG FY2026 — Rescue Equipment Upgrade',
    type: 'AFG (Assistance to Firefighters Grant)',
    fundingAgency: 'FEMA / DHS — AFG Program',
    programYear: 2026,
    status: 'Planning',
    applicationDate: null,
    awardDate: null,
    amountRequested: 65000,
    amountAwarded: null,
    matchRequired: true,
    matchPercent: 5,
    matchAmount: null,
    grantPeriodStart: null,
    grantPeriodEnd: null,
    reportingDeadlines: [],
    expenditures: [],
    contactName: '',
    contactEmail: '',
    notes: 'Planning phase — application window opens Oct 2026. Equipment list in progress: new Jaws, cutters, spreaders, and ram set.',
  },
];

  let n = 0;
  for (const row of SEED) { await db.create(row, 1); n++; }
  console.log(`Grants seed: ${n} grants inserted.`);
};
