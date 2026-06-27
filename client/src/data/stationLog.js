// ─── Station Daily Log Data ────────────────────────────────────────────────

export const SHIFTS = ['Day', 'Night', '24-Hour'];

export const LOG_MEMBERS = [
  'Sarah Chen', 'Maria Delgado', 'Nathan McGee', 'Sandra Kim',
  'James Ortega', 'Tracy Benson', 'Mike Harrington', 'Lisa Fontaine',
  'Carlos Ruiz', 'Amy Winters', 'Kevin Marsh', 'Diane Tolliver',
];

export const OFFICERS = [
  'Sarah Chen', 'Maria Delgado', 'Nathan McGee', 'Sandra Kim',
];

export const initialStationLog = [
  {
    id: 1,
    date: '2026-03-05',
    shift: 'Day',
    officerOnDuty: 'Maria Delgado',
    membersOnDuty: ['Nathan McGee', 'Sandra Kim', 'Lisa Fontaine'],
    weatherConditions: 'Clear, 38°F, calm winds',
    callCount: 2,
    apparatusChecked: true,
    stationChecked: true,
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
    id: 2,
    date: '2026-03-04',
    shift: 'Day',
    officerOnDuty: 'James Ortega',
    membersOnDuty: ['Tracy Benson', 'Mike Harrington', 'Nathan McGee'],
    weatherConditions: 'Overcast, 44°F, light rain PM',
    callCount: 1,
    apparatusChecked: true,
    stationChecked: true,
    events: [
      { time: '07:00', entry: 'Shift change. All apparatus checked in service.' },
      { time: '11:30', entry: 'Rescue 1 dispatched — EMS assist, 88 Riverside Dr. Patient transported by county EMS. Units returned 12:20.' },
      { time: '15:00', entry: 'Training: Ortega ran 45-min SCBA refresher. All members on duty participated.' },
    ],
    visitors: '',
    notes: '',
  },
  {
    id: 3,
    date: '2026-03-03',
    shift: 'Day',
    officerOnDuty: 'Maria Delgado',
    membersOnDuty: ['Sandra Kim', 'Lisa Fontaine'],
    weatherConditions: 'Sunny, 51°F',
    callCount: 0,
    apparatusChecked: true,
    stationChecked: true,
    events: [
      { time: '07:00', entry: 'Shift change. All apparatus checked in service.' },
      { time: '10:00', entry: 'Hydrant flow test crew out — tested H-003 and DH-001. Results logged in Hydrant Management.' },
      { time: '14:00', entry: 'Station bay floor cleaning and general housekeeping.' },
    ],
    visitors: 'Springfield Elementary field trip — 22 students, 3 teachers. Apparatus tour and safety presentation by Delgado.',
    notes: 'No calls today. Good day for station work.',
  },
  {
    id: 4,
    date: '2026-02-28',
    shift: 'Day',
    officerOnDuty: 'Sarah Chen',
    membersOnDuty: ['Maria Delgado', 'James Ortega', 'Nathan McGee', 'Tracy Benson'],
    weatherConditions: 'Partly cloudy, 29°F',
    callCount: 3,
    apparatusChecked: true,
    stationChecked: true,
    events: [
      { time: '07:00', entry: 'Shift change. All apparatus in service.' },
      { time: '08:45', entry: 'Engine 1, Tanker 1 dispatched — structure fire, 2200 Industrial Pkwy. 2nd alarm at 09:10. Controlled 11:30. No injuries. Significant property loss — NFIRS report filed.' },
      { time: '13:00', entry: 'Engine 1 dispatched — CO alarm, 540 Elm St. Residence aired out, no occupants affected. Returned 13:45.' },
      { time: '17:20', entry: 'Engine 1 dispatched — brush fire, Industrial Pkwy & Commerce Rd. Contained quickly, 0.5 acres. Returned 18:15.' },
    ],
    visitors: '',
    notes: 'Busy day. Industrial Pkwy fire will require extended NFIRS documentation. State fire marshal notified per protocol.',
  },
];
