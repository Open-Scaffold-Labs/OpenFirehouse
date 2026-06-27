// Event & Activity Calendar data for OpenFirehouse

export const EVENT_TYPES = [
  'Drill',
  'Meeting',
  'Training',
  'Fundraiser',
  'Community Event',
  'Special Detail',
  'Inspection',
  'Other',
];

export const EVENT_TYPE_COLORS = {
  'Drill':           { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500', border: 'border-orange-200' },
  'Meeting':         { bg: 'bg-slate-100',  text: 'text-slate-700',  dot: 'bg-slate-500',  border: 'border-slate-200' },
  'Training':        { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500', border: 'border-indigo-200' },
  'Fundraiser':      { bg: 'bg-pink-100',   text: 'text-pink-700',   dot: 'bg-pink-500',   border: 'border-pink-200' },
  'Community Event': { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  border: 'border-green-200' },
  'Special Detail':  { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500',  border: 'border-amber-200' },
  'Inspection':      { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    border: 'border-red-200' },
  'Other':           { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400',   border: 'border-gray-200' },
};

export const RSVP_STATUSES = ['Going', 'Not Going', 'Maybe'];

// Sample members for RSVP data
const RSVPS = {
  all: [
    { memberId: 1, memberName: 'Sarah Chen',        status: 'Going'     },
    { memberId: 2, memberName: 'Maria Delgado',     status: 'Going'     },
    { memberId: 3, memberName: 'Nathan McGee',      status: 'Going'     },
    { memberId: 4, memberName: 'Sandra Kim',        status: 'Going'     },
    { memberId: 5, memberName: 'James Ortega',      status: 'Not Going' },
    { memberId: 6, memberName: 'Tracy Benson',      status: 'Going'     },
    { memberId: 7, memberName: 'Mike Harrington',   status: 'Going'     },
    { memberId: 8, memberName: 'Lisa Fontaine',     status: 'Going'     },
    { memberId: 9, memberName: 'Carlos Ruiz',       status: 'Going'     },
  ],
  officers: [
    { memberId: 1, memberName: 'Sarah Chen',    status: 'Going' },
    { memberId: 2, memberName: 'Maria Delgado', status: 'Going' },
    { memberId: 3, memberName: 'Nathan McGee',  status: 'Going' },
  ],
  partial: [
    { memberId: 1, memberName: 'Sarah Chen',      status: 'Going'     },
    { memberId: 2, memberName: 'Maria Delgado',   status: 'Going'     },
    { memberId: 4, memberName: 'Sandra Kim',      status: 'Going'     },
    { memberId: 6, memberName: 'Tracy Benson',    status: 'Maybe'     },
    { memberId: 3, memberName: 'Nathan McGee',    status: 'Not Going' },
    { memberId: 9, memberName: 'Carlos Ruiz',     status: 'Going'     },
  ],
  few: [
    { memberId: 2, memberName: 'Maria Delgado',    status: 'Going' },
    { memberId: 3, memberName: 'Nathan McGee',     status: 'Going' },
    { memberId: 7, memberName: 'Mike Harrington',  status: 'Going' },
    { memberId: 8, memberName: 'Lisa Fontaine',    status: 'Going' },
  ],
};

const yr = new Date().getFullYear();
const d  = (mo, day) =>
  `${yr}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

let _id = 1;
const id = () => `evt-${String(_id++).padStart(3,'0')}`;

export const initialEvents = [
  // January
  {
    id: id(), title: 'Monthly Department Meeting', type: 'Meeting',
    date: d(1, 7), startTime: '19:00', endTime: '20:30',
    location: 'Station 14 — Apparatus Bay',
    organizer: 'Sarah Chen',
    description: 'Monthly business meeting covering budget review, apparatus status, and upcoming events.',
    maxAttendees: null,
    rsvps: RSVPS.all,
    notes: 'Bring updated training logs.',
  },
  {
    id: id(), title: 'Hose Evolution Drill', type: 'Drill',
    date: d(1, 14), startTime: '18:00', endTime: '21:00',
    location: 'Station 14 — Drill Yard',
    organizer: 'Maria Delgado',
    description: 'Live hose operations — deploy and advance 1¾" and 2½" lines. Focus on water supply relay.',
    maxAttendees: null,
    rsvps: RSVPS.partial,
    notes: 'Full PPE and SCBA required.',
  },
  {
    id: id(), title: 'Annual Apparatus Inspection', type: 'Inspection',
    date: d(1, 21), startTime: '08:00', endTime: '12:00',
    location: 'Station 14 — Apparatus Bay',
    organizer: 'Sandra Kim',
    description: 'State-required annual inspection of Engine 14, Ladder 14, and Rescue 14. Pump tests included.',
    maxAttendees: null,
    rsvps: RSVPS.officers,
    notes: 'All apparatus must be fueled and clean by 07:30.',
  },
  {
    id: id(), title: 'CPR/AED Recertification', type: 'Training',
    date: d(1, 28), startTime: '09:00', endTime: '13:00',
    location: 'Station 14 — Training Room',
    organizer: 'Nathan McGee',
    description: 'Required CPR/AED recertification for all members. Bring existing card for verification.',
    maxAttendees: 16,
    rsvps: RSVPS.all,
    notes: 'Certification cards issued same day.',
  },

  // February
  {
    id: id(), title: 'Monthly Department Meeting', type: 'Meeting',
    date: d(2, 4), startTime: '19:00', endTime: '20:30',
    location: 'Station 14 — Apparatus Bay',
    organizer: 'Sarah Chen',
    description: 'Monthly business meeting. SOG review and winter incident after-action discussion.',
    maxAttendees: null,
    rsvps: RSVPS.all,
    notes: '',
  },
  {
    id: id(), title: 'Pancake Breakfast Fundraiser', type: 'Fundraiser',
    date: d(2, 8), startTime: '07:00', endTime: '12:00',
    location: 'Station 14 — Community Hall',
    organizer: 'Mike Harrington',
    description: 'Annual pancake breakfast fundraiser open to the public. Proceeds support training equipment fund.',
    maxAttendees: null,
    rsvps: RSVPS.all,
    notes: 'Ticket sales start 06:30. Bring aprons.',
  },
  {
    id: id(), title: 'SCBA Confidence Course', type: 'Drill',
    date: d(2, 11), startTime: '18:00', endTime: '21:00',
    location: 'Station 14 — Training Maze',
    organizer: 'Maria Delgado',
    description: 'Zero-visibility SCBA drill through training maze. Buddy-pair system. Focus on search patterns.',
    maxAttendees: 12,
    rsvps: RSVPS.partial,
    notes: 'Pass SCBA fit test required before participation.',
  },
  {
    id: id(), title: 'Fire Prevention Week Planning', type: 'Meeting',
    date: d(2, 18), startTime: '18:30', endTime: '19:30',
    location: 'Station 14 — Training Room',
    organizer: 'Tracy Benson',
    description: 'Planning session for Fall Fire Prevention Week activities and school visits.',
    maxAttendees: null,
    rsvps: RSVPS.officers,
    notes: '',
  },
  {
    id: id(), title: "Cupid's Chili Cook-Off", type: 'Fundraiser',
    date: d(2, 14), startTime: '11:00', endTime: '15:00',
    location: 'Station 14 — Community Hall',
    organizer: 'Carlos Ruiz',
    description: "Valentine's Day chili cook-off — open to public. Entry fee $5, vote for your favorite.",
    maxAttendees: null,
    rsvps: RSVPS.few,
    notes: 'Entries must be registered by Feb 10.',
  },
  {
    id: id(), title: 'ICS-200 Online Course Deadline', type: 'Training',
    date: d(2, 28), startTime: '23:59', endTime: '23:59',
    location: 'Online (FEMA EMI)',
    organizer: 'Maria Delgado',
    description: 'Last day to complete ICS-200 online course per county training requirement. Self-paced.',
    maxAttendees: null,
    rsvps: RSVPS.all,
    notes: 'Certificate of completion must be submitted to Training Officer.',
  },

  // March
  {
    id: id(), title: 'Monthly Department Meeting', type: 'Meeting',
    date: d(3, 4), startTime: '19:00', endTime: '20:30',
    location: 'Station 14 — Apparatus Bay',
    organizer: 'Sarah Chen',
    description: "Monthly business meeting. Q1 budget review and spring drill schedule vote.",
    maxAttendees: null,
    rsvps: RSVPS.all,
    notes: '',
  },
  {
    id: id(), title: 'Multi-Agency Mass Casualty Drill', type: 'Drill',
    date: d(3, 8), startTime: '08:00', endTime: '14:00',
    location: 'Maplewood High School — Parking Lot',
    organizer: 'Sarah Chen',
    description: 'County-wide MCI drill with EMS, law enforcement, and mutual aid companies. Simulated bus accident.',
    maxAttendees: null,
    rsvps: RSVPS.all,
    notes: 'Report to staging at 07:30. Media will be present.',
  },
  {
    id: id(), title: "St. Patrick's Day Parade Detail", type: 'Special Detail',
    date: d(3, 17), startTime: '10:00', endTime: '14:00',
    location: 'Main Street, Maplewood — Parade Route',
    organizer: 'Nathan McGee',
    description: 'Apparatus and personnel detail for annual parade. Engine 14 and Ladder 14 in procession.',
    maxAttendees: null,
    rsvps: RSVPS.partial,
    notes: 'Dress uniform required. Arrive at staging by 09:30.',
  },
  {
    id: id(), title: 'Spring Open House', type: 'Community Event',
    date: d(3, 22), startTime: '10:00', endTime: '14:00',
    location: 'Station 14',
    organizer: 'Tracy Benson',
    description: 'Annual spring open house. Tours, fire safety demos, junior firefighter activities.',
    maxAttendees: null,
    rsvps: RSVPS.all,
    notes: 'Volunteers needed for face painting and kids activities.',
  },
  {
    id: id(), title: 'Wildland Fire Ops Training', type: 'Training',
    date: d(3, 29), startTime: '08:00', endTime: '17:00',
    location: 'County Training Center',
    organizer: 'Maria Delgado',
    description: 'Full-day wildland firefighting operations course. Red card certification eligibility.',
    maxAttendees: 8,
    rsvps: RSVPS.few,
    notes: 'Work boots and high-visibility vest required. Lunch provided.',
  },
];
