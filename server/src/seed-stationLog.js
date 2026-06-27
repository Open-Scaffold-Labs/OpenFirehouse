'use strict';
/**
 * seed-stationLog.js — 4 initial station log entries.
 * Skips if already seeded.
 */

const { stationLog: db } = require('./db');

module.exports = async function seedStationLog() {
  const existing = await db.all(1);
  if (existing.length > 0) { console.log('Station log seed: already seeded, skipping.'); return; }

const SEED = [
  {
    date: '2026-03-05', shift: 'Day',
    officerOnDuty: 'Maria Delgado',
    membersOnDuty: ['Mike Harrington', 'Sandra Kim', 'James Ortega'],
    weatherConditions: 'Clear, 38°F, calm winds',
    callCount: 2, apparatusChecked: true, stationChecked: true,
    events: [
      { time: '07:00', entry: 'Shift change. Apparatus and station checks completed. All units in service.' },
      { time: '09:15', entry: 'Engine 1 dispatched — structure fire, 412 Main St. Controlled at 10:42. All units returned in service.' },
      { time: '14:00', entry: 'Monthly equipment inventory check completed. Low stock flagged on 4" hose washers — logged in Asset & Inventory.' },
      { time: '19:30', entry: 'Engine 1 dispatched — MVA, Riverside Dr & Bridge St. 2 patients transported. Units cleared at 20:45.' },
    ],
    visitors: 'Ron Briggs, City Public Works — confirmed H-004 repair timeline, est. 2 weeks.',
    notes: 'Tanker 1 due for oil change per Maint. Log — scheduled for Saturday.',
  },
  {
    date: '2026-03-04', shift: 'Day',
    officerOnDuty: 'Sarah Chen',
    membersOnDuty: ['Nathan McGee', 'Tracy Benson', 'Mike Harrington'],
    weatherConditions: 'Overcast, 44°F, light rain PM',
    callCount: 1, apparatusChecked: true, stationChecked: true,
    events: [
      { time: '07:00', entry: 'Shift change. All apparatus checked in service.' },
      { time: '11:30', entry: 'Rescue 1 dispatched — EMS assist, 88 Riverside Dr. Patient transported by county EMS. Units returned 12:20.' },
      { time: '15:00', entry: 'Training: Chen ran 45-min SCBA refresher. All members on duty participated.' },
    ],
    visitors: '',
    notes: '',
  },
  {
    date: '2026-03-03', shift: 'Day',
    officerOnDuty: 'Maria Delgado',
    membersOnDuty: ['Sandra Kim', 'James Ortega'],
    weatherConditions: 'Sunny, 51°F',
    callCount: 0, apparatusChecked: true, stationChecked: true,
    events: [
      { time: '07:00', entry: 'Shift change. All apparatus checked in service.' },
      { time: '10:00', entry: 'Hydrant flow test crew out — tested H-003 and DH-001. Results logged in Hydrant Management.' },
      { time: '14:00', entry: 'Station bay floor cleaning and general housekeeping.' },
    ],
    visitors: 'Springfield Elementary field trip — 22 students, 3 teachers. Apparatus tour and safety presentation by Maria Delgado.',
    notes: 'No calls today. Good day for station work.',
  },
  {
    date: '2026-02-28', shift: 'Day',
    officerOnDuty: 'Sarah Chen',
    membersOnDuty: ['Maria Delgado', 'Nathan McGee', 'Mike Harrington', 'Kevin Marsh'],
    weatherConditions: 'Partly cloudy, 29°F',
    callCount: 3, apparatusChecked: true, stationChecked: true,
    events: [
      { time: '07:00', entry: 'Shift change. All apparatus in service.' },
      { time: '08:45', entry: 'Engine 1, Tanker 1 dispatched — structure fire, 2200 Industrial Pkwy. 2nd alarm at 09:10. Controlled 11:30. No injuries. Significant property loss — NFIRS report filed.' },
      { time: '13:00', entry: 'Engine 1 dispatched — CO alarm, 540 Elm St. Residence aired out, no occupants affected. Returned 13:45.' },
      { time: '17:20', entry: 'Engine 1 dispatched — brush fire, Industrial Pkwy & Commerce Rd. Contained quickly, 0.5 acres. Returned 18:15.' },
    ],
    visitors: '',
    notes: 'Busy day. Industrial Pkwy fire will require extended NFIRS documentation. State fire marshal notified per protocol.',
  },
  {
    date: '2026-02-15', shift: 'Night',
    officerOnDuty: 'Nathan McGee',
    membersOnDuty: ['Lisa Fontaine', 'Carlos Ruiz', 'Amy Winters'],
    weatherConditions: 'Clear, 22°F, calm',
    callCount: 1, apparatusChecked: true, stationChecked: true,
    events: [
      { time: '20:00', entry: 'Shift change. All apparatus and equipment checked. Station secure.' },
      { time: '22:45', entry: 'Rescue 1 dispatched — EMS assist with cardiac patient, 156 Oak Ave. Advanced life support provided. Patient transported by Ambulance 2. Units returned 23:30.' },
      { time: '23:45', entry: 'Post-call equipment check completed. Patient report filed.' },
    ],
    visitors: '',
    notes: 'Quiet night overall. One significant EMS call requiring full ALS protocol.',
  },
  {
    date: '2026-02-01', shift: 'Day',
    officerOnDuty: 'Maria Delgado',
    membersOnDuty: ['Sandra Kim', 'Tracy Benson', 'Lisa Fontaine'],
    weatherConditions: 'Cloudy, 35°F, light wind',
    callCount: 2, apparatusChecked: true, stationChecked: true,
    events: [
      { time: '07:00', entry: 'Shift change. All apparatus in service. Station checks completed.' },
      { time: '09:30', entry: 'Engine 1 dispatched — residential structure fire, 823 Birch St. Fire confined to kitchen. Extinguished at 10:15. One minor injury transported. NFIRS filed.' },
      { time: '14:00', entry: 'Training: 1-hour CPR recertification review for shift. All members current.' },
      { time: '16:30', entry: 'Engine 1 dispatched — minor vehicle accident, Riverside Dr & Park Ave. 1 patient transported as precaution. Returned 17:15.' },
    ],
    visitors: 'Fire Prevention Specialist — site prep discussion for Spring Open House planning.',
    notes: 'February starts with activity. Both calls handled efficiently. Spring event planning underway.',
  },
  {
    date: '2026-01-18', shift: 'Night',
    officerOnDuty: 'Nathan McGee',
    membersOnDuty: ['Diane Tolliver', 'James Ortega', 'Mike Harrington'],
    weatherConditions: 'Overcast, 18°F, light snow flurries',
    callCount: 0, apparatusChecked: true, stationChecked: true,
    events: [
      { time: '19:00', entry: 'Shift change. Night crew briefed on weather conditions. All apparatus in service.' },
      { time: '20:30', entry: 'Conducted hydrant flow test on H-012 per maintenance schedule. Test passed. Documented in system.' },
      { time: '22:00', entry: 'Training: Winter safety response scenarios. Focus on cold-weather medical emergencies and vehicle extrication.' },
      { time: '23:45', entry: 'Station security check complete. All doors locked and systems armed.' },
    ],
    visitors: '',
    notes: 'Quiet night. Good opportunity for training and preventive equipment checks. Winter weather watch in effect.',
  },
];

  let inserted = 0;
  for (const entry of SEED) { await db.create(entry, 1); inserted++; }
  console.log(`Station log seed complete: ${inserted} inserted.`);
};
