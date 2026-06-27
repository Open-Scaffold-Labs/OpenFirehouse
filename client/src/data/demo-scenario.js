// ─── demo-scenario.js ────────────────────────────────────────────────────────
// Full scripted demo scenario for the Dispatch & Command module.
// Drives DemoTimeline.jsx — each event fires at `t` seconds from demo start.
//
// Event types:
//   step            — updates the visible step label in the demo banner
//   comms           — adds a radio transmission to the comms log
//   unit_status     — updates a unit's status by index (0-based)
//   milestone       — stamps an incident milestone
//   timeline_event  — adds an entry to the incident timeline
//   command_established — sets IC name and marks command as assumed
//   par_complete    — records a PAR check result
//   demo_complete   — signals the timeline is finished

export const DEMO_SCENARIO = {
  id:            'evergreen-structure-fire',
  title:         'Structure Fire — 742 Evergreen Terrace',
  description:   '2-story wood-frame residential. Heavy smoke 2nd floor. Full lifecycle: dispatch → size-up → attack → PAR → knockdown → overhaul.',
  totalDuration: 140, // seconds

  // ── Incident created at t=0 ──────────────────────────────────────────────
  incident: {
    type:           'Structure Fire',
    address:        '742 Evergreen Terrace, Maplewood, NJ',
    crossStreet:    'Oak Avenue',
    incidentNumber: 'MFD-2026-0342',
    notes:          'Caller reports smoke showing from 2nd floor. Occupants may still be inside.',
    nearestHydrant: 'Oak Ave & Maple St — est. 150 ft',
    prePlan:        'Single-family residence, 2-story, wood frame. No hazmat. Owner: J. Crawford.',
    units: [
      { designation: 'Engine 1',    status: 'Dispatched', fromDispatch: true },
      { designation: 'Engine 2',    status: 'Dispatched', fromDispatch: true },
      { designation: 'Truck 1',     status: 'Dispatched', fromDispatch: true },
      { designation: 'Battalion 1', status: 'Dispatched', fromDispatch: true },
    ],
  },

  // ── Narrator cues ────────────────────────────────────────────────────────
  // Shown in the demo panel as talking points. Not auto-fired — for the presenter.
  narratorCues: [
    {
      t: 0,
      text: "A 911 call just came in. Watch the system — it's already pulling the address, finding the nearest hydrants, and loading the pre-incident plan. Nobody typed a thing.",
    },
    {
      t: 10,
      text: 'Tones are dropping now. Notice how it automatically assigns first-alarm units based on station proximity and apparatus availability. Zero manual lookup needed.',
    },
    {
      t: 22,
      text: 'Units are flipping from green to yellow as they go en route. Watch the status board update in real time — no one had to touch anything.',
    },
    {
      t: 38,
      text: "Engine 1 is on scene giving their size-up — on radio, like they always have. Look at the right panel. The ICS org chart just built itself.",
    },
    {
      t: 55,
      text: 'Watch how assignments flow from Command directly into the unit board. The IC spoke once — the app captured all of it.',
    },
    {
      t: 75,
      text: "This is where the app really shines. PAR check. Every firefighter tracked. The system flags anyone who hasn't reported in. That's 45 minutes of paperwork happening automatically.",
    },
    {
      t: 108,
      text: 'Fire under control. One click will generate the exposure records and NFIRS fact pre-fill — the officer writes the narrative. The IC never left the scene.',
    },
    {
      t: 135,
      text: 'That was a full incident lifecycle — dispatch to under-control — in under three minutes. In real life this takes hours of manual entry. OpenFirehouse does it live.',
    },
  ],

  // ── Timed events ─────────────────────────────────────────────────────────
  events: [

    // ── DISPATCH ──────────────────────────────────────────────────────────
    {
      t: 0,
      type: 'step',
      label: '🚨 Dispatch — tones dropping',
    },
    {
      t: 2,
      type: 'comms',
      from: 'Dispatch',
      channel: 'Dispatch',
      message: 'Engine 1, Engine 2, Truck 1, Battalion 1 — respond to a reported structure fire, 742 Evergreen Terrace. Cross street of Oak Avenue. Caller reports smoke showing from the second floor. Time out: fourteen thirty-two.',
    },
    {
      t: 8,
      type: 'milestone',
      key: 'dispatched',
    },
    {
      t: 8,
      type: 'timeline_event',
      event: 'First alarm dispatched — E1, E2, T1, BC1',
      eventType: 'milestone',
    },

    // ── EN ROUTE ──────────────────────────────────────────────────────────
    {
      t: 12,
      type: 'step',
      label: '🚒 Units responding',
    },
    {
      t: 12,
      type: 'unit_status',
      unit: 0,
      status: 'En Route',
    },
    {
      t: 12,
      type: 'comms',
      from: 'Engine 1',
      channel: 'Dispatch',
      message: 'Engine 1 responding.',
    },
    {
      t: 14,
      type: 'unit_status',
      unit: 1,
      status: 'En Route',
    },
    {
      t: 14,
      type: 'comms',
      from: 'Engine 2',
      channel: 'Dispatch',
      message: 'Engine 2 en route.',
    },
    {
      t: 16,
      type: 'unit_status',
      unit: 2,
      status: 'En Route',
    },
    {
      t: 16,
      type: 'comms',
      from: 'Truck 1',
      channel: 'Dispatch',
      message: 'Truck 1 responding.',
    },
    {
      t: 18,
      type: 'unit_status',
      unit: 3,
      status: 'En Route',
    },
    {
      t: 18,
      type: 'comms',
      from: 'Battalion 1',
      channel: 'Dispatch',
      message: 'Battalion 1 en route, copying.',
    },
    {
      t: 18,
      type: 'milestone',
      key: 'enRoute',
    },
    {
      t: 20,
      type: 'timeline_event',
      event: 'All first-alarm units en route',
      eventType: 'radio',
    },

    // ── ON SCENE / SIZE-UP ────────────────────────────────────────────────
    {
      t: 35,
      type: 'step',
      label: '📍 Engine 1 on scene — size-up',
    },
    {
      t: 35,
      type: 'unit_status',
      unit: 0,
      status: 'On Scene',
    },
    {
      t: 35,
      type: 'milestone',
      key: 'onScene',
    },
    {
      t: 35,
      type: 'comms',
      from: 'Engine 1',
      channel: 'Tac 1',
      message: 'Engine 1 on scene. We have a two-story, wood-frame residential, approximately twenty-five by forty. Heavy smoke showing from the second floor, side Charlie. Nothing showing side Alpha. Engine 1 will be Evergreen Command, established at fourteen thirty-seven.',
    },
    {
      t: 37,
      type: 'command_established',
      ic: 'Capt. Delgado — Engine 1',
      commandName: 'Evergreen Command',
    },
    {
      t: 40,
      type: 'unit_status',
      unit: 1,
      status: 'On Scene',
    },
    {
      t: 40,
      type: 'comms',
      from: 'Engine 2',
      channel: 'Tac 1',
      message: 'Engine 2 on scene.',
    },
    {
      t: 43,
      type: 'unit_status',
      unit: 2,
      status: 'On Scene',
    },
    {
      t: 43,
      type: 'comms',
      from: 'Truck 1',
      channel: 'Tac 1',
      message: 'Truck 1 on scene.',
    },
    {
      t: 46,
      type: 'unit_status',
      unit: 3,
      status: 'On Scene',
    },
    {
      t: 46,
      type: 'comms',
      from: 'Battalion 1',
      channel: 'Tac 1',
      message: 'Battalion 1 on scene, assuming command from Engine 1. IC is Battalion 1.',
    },

    // ── COMMAND / ASSIGNMENTS ─────────────────────────────────────────────
    {
      t: 50,
      type: 'step',
      label: '⚡ Command established — assigning units',
    },
    {
      t: 50,
      type: 'comms',
      from: 'Evergreen Command',
      channel: 'Tac 1',
      message: 'Evergreen Command to all units — Engine 1, fire attack, second floor. Truck 1, vertical ventilation, side Charlie. Engine 2, establish water supply, hydrant at Oak and Maple.',
    },

    // ── ICS roles build out progressively as command structure forms ──
    { t: 39, type: 'add_role', role: 'Safety Officer', assignee: 'Lt. McGee — Truck 1' },
    { t: 48, type: 'add_role', role: 'Operations Section Chief', assignee: 'B/C Simmons — Battalion 1' },
    { t: 51, type: 'add_role', role: 'Division 2 Supervisor', assignee: 'Capt. Delgado — Engine 1' },
    { t: 52, type: 'add_role', role: 'Attack Group', assignee: 'Lt. McGee — Engine 2' },
    { t: 54, type: 'add_role', role: 'Ventilation Group', assignee: 'Lt. McGee — Truck 1' },
    { t: 56, type: 'add_role', role: 'Water Supply', assignee: 'FF Ortega — Engine 2' },
    { t: 63, type: 'add_role', role: 'Staging Manager', assignee: 'Capt. Delgado — Engine 3 (M/A)' },
    { t: 65, type: 'add_role', role: 'RIC/RIT Officer', assignee: 'Lt. McGee — Rescue 1 (M/A)' },
    { t: 76, type: 'add_role', role: 'Accountability Officer', assignee: 'FF Ruiz — Battalion 1' },
    { t: 115, type: 'add_role', role: 'Fire Investigator', assignee: 'Inv. Marchetti — en route' },

    // ── Personnel check in as they arrive on scene ──
    { t: 36, type: 'add_personnel', name: 'Capt. Delgado', assignment: 'Entry Team A', status: 'On Scene' },
    { t: 36, type: 'add_personnel', name: 'FF Benson', assignment: 'Entry Team A', status: 'On Scene' },
    { t: 36, type: 'add_personnel', name: 'FF Ortega', assignment: 'Entry Team A', status: 'On Scene' },
    { t: 36, type: 'add_personnel', name: 'FF Tolliver', assignment: 'Entry Team A', status: 'On Scene' },
    { t: 41, type: 'add_personnel', name: 'Lt. McGee', assignment: 'Water Supply', status: 'On Scene' },
    { t: 41, type: 'add_personnel', name: 'FF Ortega', assignment: 'Water Supply', status: 'On Scene' },
    { t: 41, type: 'add_personnel', name: 'FF Ruiz', assignment: 'Water Supply', status: 'On Scene' },
    { t: 44, type: 'add_personnel', name: 'Lt. McGee', assignment: 'Roof Group', status: 'On Scene' },
    { t: 44, type: 'add_personnel', name: 'FF Harrington', assignment: 'Roof Group', status: 'On Scene' },
    { t: 44, type: 'add_personnel', name: 'FF Harrington', assignment: 'Aerial Operations', status: 'On Scene' },
    { t: 44, type: 'add_personnel', name: 'FF Fontaine', assignment: 'Roof Group', status: 'On Scene' },
    { t: 47, type: 'add_personnel', name: 'B/C Simmons', assignment: 'Command', status: 'On Scene' },
    { t: 47, type: 'add_personnel', name: 'FF Ruiz', assignment: 'Command', status: 'On Scene' },

    // ── Personnel go into structure during attack ──
    { t: 53, type: 'update_personnel', name: 'Capt. Delgado', status: 'In Structure' },
    { t: 53, type: 'update_personnel', name: 'FF Benson', status: 'In Structure' },
    { t: 53, type: 'update_personnel', name: 'FF Ortega', status: 'In Structure' },
    { t: 53, type: 'update_personnel', name: 'FF Tolliver', status: 'In Structure' },
    { t: 55, type: 'update_personnel', name: 'Lt. McGee', status: 'In Structure' },
    { t: 55, type: 'update_personnel', name: 'FF Harrington', status: 'In Structure' },

    // ── Mutual aid personnel arrive (2nd alarm) ──
    { t: 66, type: 'add_personnel', name: 'Capt. Delgado', assignment: 'Staging', status: 'On Scene' },
    { t: 66, type: 'add_personnel', name: 'FF Marsh', assignment: 'RIC / RIT', status: 'On Scene' },
    { t: 66, type: 'add_personnel', name: 'FF Winters', assignment: 'RIC / RIT', status: 'On Scene' },
    { t: 67, type: 'add_personnel', name: 'FF DiMaggio', assignment: 'Staging', status: 'On Scene' },
    { t: 67, type: 'add_personnel', name: 'FF Ortega', assignment: 'Staging', status: 'On Scene' },
    { t: 68, type: 'add_personnel', name: 'Lt. McGee', assignment: 'RIC / RIT', status: 'On Scene' },
    { t: 68, type: 'add_personnel', name: 'FF Marsh', assignment: 'EMS Group', status: 'On Scene' },
    { t: 69, type: 'add_personnel', name: 'FF Tolliver', assignment: 'EMS Group', status: 'On Scene' },

    // ── Rehab rotation after knockdown ──
    { t: 102, type: 'update_personnel', name: 'Capt. Delgado', status: 'Rehab' },
    { t: 102, type: 'update_personnel', name: 'FF Benson', status: 'Rehab' },
    { t: 103, type: 'update_personnel', name: 'FF Ortega', status: 'On Scene' },
    { t: 103, type: 'update_personnel', name: 'FF Tolliver', status: 'On Scene' },
    { t: 104, type: 'update_personnel', name: 'Lt. McGee', status: 'On Scene' },
    { t: 104, type: 'update_personnel', name: 'FF Harrington', status: 'On Scene' },

    {
      t: 52,
      type: 'unit_status',
      unit: 0,
      status: 'Committed',
    },
    {
      t: 54,
      type: 'unit_status',
      unit: 2,
      status: 'Committed',
    },
    {
      t: 56,
      type: 'milestone',
      key: 'waterOn',
    },
    {
      t: 56,
      type: 'comms',
      from: 'Engine 1',
      channel: 'Tac 1',
      message: 'Engine 1 has a line stretched, water on the fire.',
    },
    {
      t: 56,
      type: 'timeline_event',
      event: 'Water on the fire — Engine 1',
      eventType: 'milestone',
    },

    // ── 2ND ALARM ─────────────────────────────────────────────────────────
    {
      t: 62,
      type: 'step',
      label: '📟 2nd alarm struck — mutual aid en route',
    },
    {
      t: 62,
      type: 'comms',
      from: 'Evergreen Command',
      channel: 'Dispatch',
      message: 'Dispatch from Command — strike a second alarm. Heavy fire involvement, exposure concerns on side Bravo.',
    },
    {
      t: 64,
      type: 'comms',
      from: 'Dispatch',
      channel: 'Dispatch',
      message: 'Second alarm struck. Mutual aid Engine 3, Engine 4, and Rescue 1 responding.',
    },
    {
      t: 64,
      type: 'timeline_event',
      event: '2nd alarm struck — mutual aid responding',
      eventType: 'radio',
    },

    // ── PAR CHECK ─────────────────────────────────────────────────────────
    {
      t: 75,
      type: 'step',
      label: '👥 PAR check — all units report in',
    },
    {
      t: 75,
      type: 'comms',
      from: 'Evergreen Command',
      channel: 'Tac 1',
      message: 'All companies — PAR check. Report your personnel count.',
    },
    {
      t: 78,
      type: 'comms',
      from: 'Engine 1',
      channel: 'Tac 1',
      message: 'Engine 1 — PAR, four personnel, all accounted for.',
    },
    {
      t: 80,
      type: 'comms',
      from: 'Engine 2',
      channel: 'Tac 1',
      message: 'Engine 2 — PAR complete, three personnel.',
    },
    {
      t: 82,
      type: 'comms',
      from: 'Truck 1',
      channel: 'Tac 1',
      message: 'Truck 1 — PAR, four members, all accounted for.',
    },
    {
      t: 84,
      type: 'comms',
      from: 'Battalion 1',
      channel: 'Tac 1',
      message: 'Battalion 1 — PAR complete, IC and aide accounted for.',
    },
    {
      t: 86,
      type: 'par_complete',
      count: 14,
      missing: 0,
    },
    {
      t: 86,
      type: 'timeline_event',
      event: 'PAR complete — 14 of 14 personnel accounted for',
      eventType: 'par',
    },

    // ── KNOCKDOWN ─────────────────────────────────────────────────────────
    {
      t: 100,
      type: 'step',
      label: '🔥 Fire knocked down — checking extension',
    },
    {
      t: 100,
      type: 'comms',
      from: 'Engine 1',
      channel: 'Tac 1',
      message: "Engine 1 to Command. Fire is knocked down. We're checking for extension in the attic.",
    },
    {
      t: 105,
      type: 'milestone',
      key: 'underControl',
    },
    {
      t: 105,
      type: 'comms',
      from: 'Evergreen Command',
      channel: 'Dispatch',
      message: 'Dispatch from Command — fire is under control. Hold the working fire assignment.',
    },
    {
      t: 107,
      type: 'timeline_event',
      event: 'Fire under control',
      eventType: 'milestone',
    },

    // ── OVERHAUL ──────────────────────────────────────────────────────────
    {
      t: 112,
      type: 'step',
      label: '🔄 Transitioning to overhaul',
    },
    {
      t: 112,
      type: 'comms',
      from: 'Evergreen Command',
      channel: 'Tac 1',
      message: 'All units, transition to overhaul. Truck 1 and Engine 2, begin salvage operations.',
    },
    {
      t: 114,
      type: 'unit_status',
      unit: 0,
      status: 'On Scene',
    },
    {
      t: 114,
      type: 'unit_status',
      unit: 2,
      status: 'On Scene',
    },

    // ── RELEASE / INVESTIGATOR ────────────────────────────────────────────
    {
      t: 122,
      type: 'step',
      label: '✅ Releasing 2nd alarm — investigator requested',
    },
    {
      t: 122,
      type: 'comms',
      from: 'Evergreen Command',
      channel: 'Dispatch',
      message: 'Dispatch, Evergreen Command. Release second-alarm companies. Request a fire investigator.',
    },
    {
      t: 124,
      type: 'comms',
      from: 'Dispatch',
      channel: 'Dispatch',
      message: 'Copy Command. Second alarm released. Fire investigator notified, en route.',
    },
    {
      t: 124,
      type: 'timeline_event',
      event: 'Fire investigator requested — notified and en route',
      eventType: 'radio',
    },

    // ── INCIDENT UNDER CONTROL ────────────────────────────────────────────
    {
      t: 132,
      type: 'step',
      label: '📝 Incident under control at 15:12',
    },
    {
      t: 132,
      type: 'comms',
      from: 'Dispatch',
      channel: 'Dispatch',
      message: 'Incident under control at fifteen twelve. Mark time.',
    },
    {
      t: 132,
      type: 'timeline_event',
      event: 'Incident under control — AI generating exposure records and NFIRS fact pre-fill',
      eventType: 'milestone',
    },

    // ── DEMO COMPLETE ──────────────────────────────────────────────────────
    {
      t: 140,
      type: 'demo_complete',
      label: '✅ Demo complete',
    },
  ],
};
