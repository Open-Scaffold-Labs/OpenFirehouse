// ─── Payroll & Stipend Tracking data ──────────────────────────────────────────

export const PAY_TYPES = [
  'Per-Call',
  'Meeting Attendance',
  'Training / Drill',
  'Annual Stipend',
  'Administrative',
  'Special Assignment',
];

export const PAY_STATUSES = ['Pending', 'Approved', 'Paid'];

export const STATUS_COLORS = {
  'Pending':  { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  'Approved': { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  'Paid':     { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-600'  },
};

export const TYPE_COLORS = {
  'Per-Call':           'bg-red-100 text-red-700',
  'Meeting Attendance': 'bg-indigo-100 text-indigo-700',
  'Training / Drill':   'bg-purple-100 text-purple-700',
  'Annual Stipend':     'bg-amber-100 text-amber-700',
  'Administrative':     'bg-gray-100 text-gray-700',
  'Special Assignment': 'bg-teal-100 text-teal-700',
};

// Default rate card — editable per department
export const DEFAULT_RATES = {
  'Per-Call':           25.00,
  'Meeting Attendance': 15.00,
  'Training / Drill':   20.00,
  'Annual Stipend':     0,     // variable by rank
  'Administrative':     15.00,
  'Special Assignment': 30.00,
};

export const ANNUAL_STIPENDS = {
  chief:   2400.00,
  officer: 1200.00,
  member:   600.00,
};

export const PAY_PERIODS = [
  { id: 'Q1-2026', label: 'Q1 2026',   start: '2026-01-01', end: '2026-03-31', status: 'Open'   },
  { id: 'Q4-2025', label: 'Q4 2025',   start: '2025-10-01', end: '2025-12-31', status: 'Closed' },
  { id: 'Q3-2025', label: 'Q3 2025',   start: '2025-07-01', end: '2025-09-30', status: 'Closed' },
  { id: 'Q2-2025', label: 'Q2 2025',   start: '2025-04-01', end: '2025-06-30', status: 'Closed' },
];

export const initialPayEntries = [
  // ── Q1 2026 ──────────────────────────────────────────────────────────────────
  {
    id: 1,
    memberName: 'Nathan McGee', memberRole: 'officer',
    type: 'Per-Call', amount: 25.00,
    date: '2026-01-08', period: 'Q1-2026',
    description: 'Structure fire — 112 Elm St',
    status: 'Approved', approvedBy: 'Sarah Chen',
  },
  {
    id: 2,
    memberName: 'Sandra Kim', memberRole: 'officer',
    type: 'Per-Call', amount: 25.00,
    date: '2026-01-08', period: 'Q1-2026',
    description: 'Structure fire — 112 Elm St',
    status: 'Approved', approvedBy: 'Sarah Chen',
  },
  {
    id: 3,
    memberName: 'Nathan McGee', memberRole: 'member',
    type: 'Per-Call', amount: 25.00,
    date: '2026-01-08', period: 'Q1-2026',
    description: 'Structure fire — 112 Elm St',
    status: 'Approved', approvedBy: 'Sarah Chen',
  },
  {
    id: 4,
    memberName: 'Sarah Chen', memberRole: 'officer',
    type: 'Meeting Attendance', amount: 15.00,
    date: '2026-01-14', period: 'Q1-2026',
    description: 'January general meeting',
    status: 'Approved', approvedBy: 'Sarah Chen',
  },
  {
    id: 5,
    memberName: 'Nathan McGee', memberRole: 'officer',
    type: 'Meeting Attendance', amount: 15.00,
    date: '2026-01-14', period: 'Q1-2026',
    description: 'January general meeting',
    status: 'Approved', approvedBy: 'Sarah Chen',
  },
  {
    id: 6,
    memberName: 'Nathan McGee', memberRole: 'member',
    type: 'Meeting Attendance', amount: 15.00,
    date: '2026-01-14', period: 'Q1-2026',
    description: 'January general meeting',
    status: 'Approved', approvedBy: 'Sarah Chen',
  },
  {
    id: 7,
    memberName: 'Sandra Kim', memberRole: 'officer',
    type: 'Training / Drill', amount: 20.00,
    date: '2026-01-22', period: 'Q1-2026',
    description: 'Live burn drill — mutual aid training site',
    status: 'Approved', approvedBy: 'Sarah Chen',
  },
  {
    id: 8,
    memberName: 'Sarah Chen', memberRole: 'officer',
    type: 'Per-Call', amount: 25.00,
    date: '2026-02-03', period: 'Q1-2026',
    description: 'MVA with entrapment — Route 14',
    status: 'Approved', approvedBy: 'Sarah Chen',
  },
  {
    id: 9,
    memberName: 'Nathan McGee', memberRole: 'member',
    type: 'Per-Call', amount: 25.00,
    date: '2026-02-03', period: 'Q1-2026',
    description: 'MVA with entrapment — Route 14',
    status: 'Approved', approvedBy: 'Sarah Chen',
  },
  {
    id: 10,
    memberName: 'Maria Delgado', memberRole: 'officer',
    type: 'Training / Drill', amount: 20.00,
    date: '2026-02-12', period: 'Q1-2026',
    description: 'Haz-Mat operations refresher (4 hrs)',
    status: 'Approved', approvedBy: 'Sarah Chen',
  },
  {
    id: 11,
    memberName: 'Nathan McGee', memberRole: 'officer',
    type: 'Meeting Attendance', amount: 15.00,
    date: '2026-02-11', period: 'Q1-2026',
    description: 'February general meeting',
    status: 'Approved', approvedBy: 'Sarah Chen',
  },
  {
    id: 12,
    memberName: 'Nathan McGee', memberRole: 'member',
    type: 'Meeting Attendance', amount: 15.00,
    date: '2026-02-11', period: 'Q1-2026',
    description: 'February general meeting',
    status: 'Pending', approvedBy: '',
  },
  {
    id: 13,
    memberName: 'Sandra Kim', memberRole: 'officer',
    type: 'Administrative', amount: 15.00,
    date: '2026-02-20', period: 'Q1-2026',
    description: 'Recruitment file maintenance (2 hrs)',
    status: 'Pending', approvedBy: '',
  },
  {
    id: 14,
    memberName: 'Sarah Chen', memberRole: 'officer',
    type: 'Per-Call', amount: 25.00,
    date: '2026-03-01', period: 'Q1-2026',
    description: 'Brush fire — County Road 7',
    status: 'Pending', approvedBy: '',
  },
  {
    id: 15,
    memberName: 'Maria Delgado', memberRole: 'officer',
    type: 'Per-Call', amount: 25.00,
    date: '2026-03-01', period: 'Q1-2026',
    description: 'Brush fire — County Road 7',
    status: 'Pending', approvedBy: '',
  },

  // ── Q4 2025 (Paid / closed period) ───────────────────────────────────────────
  {
    id: 16,
    memberName: 'Sarah Chen', memberRole: 'chief',
    type: 'Annual Stipend', amount: 2400.00,
    date: '2025-12-31', period: 'Q4-2025',
    description: 'Annual chief stipend — FY 2025',
    status: 'Paid', approvedBy: 'Board of Directors',
  },
  {
    id: 17,
    memberName: 'Nathan McGee', memberRole: 'officer',
    type: 'Annual Stipend', amount: 1200.00,
    date: '2025-12-31', period: 'Q4-2025',
    description: 'Annual officer stipend — FY 2025',
    status: 'Paid', approvedBy: 'Sarah Chen',
  },
  {
    id: 18,
    memberName: 'Sandra Kim', memberRole: 'officer',
    type: 'Annual Stipend', amount: 1200.00,
    date: '2025-12-31', period: 'Q4-2025',
    description: 'Annual officer stipend — FY 2025',
    status: 'Paid', approvedBy: 'Sarah Chen',
  },
  {
    id: 19,
    memberName: 'Nathan McGee', memberRole: 'member',
    type: 'Annual Stipend', amount: 600.00,
    date: '2025-12-31', period: 'Q4-2025',
    description: 'Annual member stipend — FY 2025',
    status: 'Paid', approvedBy: 'Sarah Chen',
  },
  {
    id: 20,
    memberName: 'Sarah Chen', memberRole: 'officer',
    type: 'Annual Stipend', amount: 1200.00,
    date: '2025-12-31', period: 'Q4-2025',
    description: 'Annual officer stipend — FY 2025',
    status: 'Paid', approvedBy: 'Sarah Chen',
  },
  {
    id: 21,
    memberName: 'Maria Delgado', memberRole: 'officer',
    type: 'Annual Stipend', amount: 1200.00,
    date: '2025-12-31', period: 'Q4-2025',
    description: 'Annual officer stipend — FY 2025',
    status: 'Paid', approvedBy: 'Sarah Chen',
  },
  {
    id: 22,
    memberName: 'Nathan McGee', memberRole: 'officer',
    type: 'Per-Call', amount: 25.00,
    date: '2025-11-14', period: 'Q4-2025',
    description: 'Carbon monoxide alarm — 88 Elm Court',
    status: 'Paid', approvedBy: 'Sarah Chen',
  },
  {
    id: 23,
    memberName: 'Nathan McGee', memberRole: 'member',
    type: 'Per-Call', amount: 25.00,
    date: '2025-11-14', period: 'Q4-2025',
    description: 'Carbon monoxide alarm — 88 Elm Court',
    status: 'Paid', approvedBy: 'Sarah Chen',
  },
  {
    id: 24,
    memberName: 'Maria Delgado', memberRole: 'officer',
    type: 'Special Assignment', amount: 30.00,
    date: '2025-10-18', period: 'Q4-2025',
    description: 'County training officer conference — Columbus (2 days)',
    status: 'Paid', approvedBy: 'Sarah Chen',
  },
];
