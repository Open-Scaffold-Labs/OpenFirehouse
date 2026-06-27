'use strict';
const { crrVisits: visitsDb, crrPrograms: programsDb } = require('./db');

module.exports = async function seedCrr() {
// ── Visits ────────────────────────────────────────────────────────────────────
  const existingVisits = await visitsDb.all(1);
  if (existingVisits.length > 0) {
    console.log(`CRR visits seed: already seeded (${existingVisits.length} records) — skipping.`);
  } else {
  const visits = [
    {
      date: '2026-03-04', type: 'Home Safety Visit',
      address: '412 Elm Street', resident: 'Margaret Chen', phone: '715-555-0182',
      riskLevel: 'High', crew: ['Sarah Chen', 'Amy Winters'],
      smokeDet: 'Installed', coDet: 'Installed',
      outcomes: ['Detector Installed', 'Hazard Corrected'],
      hazards: 'Space heater within 12 inches of curtains; corrected on site.',
      notes: 'Resident lives alone, 82 yrs old. Added to 6-month check list.',
      followUpDate: '2026-09-04',
    },
    {
      date: '2026-02-18', type: 'Smoke + CO Install',
      address: '88 County Road F', resident: 'Jim and Carol Stein', phone: '715-555-0341',
      riskLevel: 'Moderate', crew: ['Kevin Marsh', 'Diane Tolliver'],
      smokeDet: 'Replaced', coDet: 'Installed',
      outcomes: ['Detector Replaced', 'Detector Installed'],
      hazards: '',
      notes: 'Old ionization-only detectors replaced with combo units. CO installed near furnace.',
      followUpDate: '',
    },
    {
      date: '2026-01-29', type: 'Follow-Up Visit',
      address: '214 Oak Ave', resident: 'Robert Tanner', phone: '715-555-0294',
      riskLevel: 'Low', crew: ['Mike Harrington'],
      smokeDet: 'Good', coDet: 'Good',
      outcomes: ['No Action Needed'],
      hazards: '',
      notes: 'Follow-up on Nov install. All detectors functional. Resident tested units with crew.',
      followUpDate: '',
    },
    {
      date: '2026-01-10', type: 'Home Safety Visit',
      address: '550 Pine Ridge Rd', resident: 'Anita Flores', phone: '715-555-0517',
      riskLevel: 'Critical', crew: ['Sarah Chen', 'Tracy Benson'],
      smokeDet: 'Installed', coDet: 'Declined',
      outcomes: ['Detector Installed', 'Detector Declined', 'Referral Made'],
      hazards: 'Improperly stored propane cylinders in attached garage. Extension cord used as permanent wiring.',
      notes: 'Referred to county housing authority re: wiring hazard. Resident declined CO detector (owns no gas appliances). Photos taken.',
      followUpDate: '2026-04-10',
    },
  ];

    for (const r of visits) { await visitsDb.create(r, 1); }
    console.log(`CRR visits seed: inserted ${visits.length} records.`);
  }

// ── Programs ──────────────────────────────────────────────────────────────────
  const existingPrograms = await programsDb.all(1);
  if (existingPrograms.length > 0) {
    console.log(`CRR programs seed: already seeded (${existingPrograms.length} records) — skipping.`);
  } else {
  const programs = [
    {
      name: 'Fire Safety Day — Lincoln Elementary',
      coordinator: 'Sarah Chen',
      startDate: '2026-02-14', endDate: '2026-02-14',
      budget: 0, status: 'Completed',
      description: 'School / Youth Education. Location: Lincoln Elementary School. Audience: K–4 students (87 attendees). Topics: Stop Drop & Roll, Home Escape Plan, When to Call 911, Smoke Alarm Awareness. Crew: Sarah Chen, Kevin Marsh, Diane Tolliver, Amy Winters.',
      participants: ['Sarah Chen', 'Kevin Marsh', 'Diane Tolliver', 'Amy Winters'],
      notes: 'All 87 students received escape-plan worksheet to take home. Teacher feedback very positive. Invited back in October for Fire Prevention Week.',
    },
    {
      name: 'Hands-On Extinguisher Training',
      coordinator: 'Mike Harrington',
      startDate: '2026-01-22', endDate: '2026-01-22',
      budget: 0, status: 'Completed',
      description: 'Fire Extinguisher Class. Location: Town Hall Parking Lot. Audience: General public (24 attendees). Topics: PASS Technique, Extinguisher Classes A/B/C, When NOT to Fight a Fire. Crew: Mike Harrington, Tracy Benson.',
      participants: ['Mike Harrington', 'Tracy Benson'],
      notes: 'All participants completed live-fire evolution. Co-sponsored with town insurance agency. Will repeat quarterly.',
    },
    {
      name: 'JFS Intervention — Case #2026-01',
      coordinator: 'Sarah Chen',
      startDate: '2026-01-08', endDate: '2026-01-08',
      budget: 0, status: 'Completed',
      description: 'Juvenile Fire Setter (JFS) Intervention. Location: Station 1 / Private family meeting. Audience: Youth (age 11) + guardians (3 attendees). Topics: Fire behavior, Consequences, Safety contract.',
      participants: ['Sarah Chen'],
      notes: 'Case referred by school counselor. One-on-one session with guardian present. Safety contract signed. No further incidents reported as of follow-up.',
    },
    {
      name: 'Fire Prevention Week Open House',
      coordinator: 'Sarah Chen',
      startDate: '2025-10-08', endDate: '2025-10-08',
      budget: 500, status: 'Completed',
      description: 'Community Event / Fair. Location: Fire Station 1. Audience: General public (312 attendees). Topics: Smoke Alarms, Escape Planning, Apparatus Tours, Hydrant Flushing Demo. Materials: Alarm giveaways (18 units), brochures, coloring books.',
      participants: ['Sarah Chen', 'Mike Harrington', 'Kevin Marsh', 'Diane Tolliver', 'Tracy Benson', 'Amy Winters'],
      notes: '18 smoke alarms distributed. 6 home safety visits scheduled from sign-up sheet. Best-attended event in department history per Chief.',
    },
  ];

    for (const r of programs) { await programsDb.create(r, 1); }
    console.log(`CRR programs seed: inserted ${programs.length} records.`);
  }
};
