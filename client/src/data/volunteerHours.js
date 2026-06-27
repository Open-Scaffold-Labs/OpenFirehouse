// Volunteer Hours data and constants for OpenFirehouse

export const ACTIVITY_TYPES = [
  'Incident Response',
  'Drill / Training Exercise',
  'Formal Training / Class',
  'Duty Shift',
  'Meeting',
  'Community Event',
  'Station Maintenance',
  'Administrative',
  'Mutual Aid',
  'Fundraising',
  'Other',
];

export const ACTIVITY_COLORS = {
  'Incident Response':        'bg-red-100 text-red-700',
  'Drill / Training Exercise':'bg-orange-100 text-orange-700',
  'Formal Training / Class':  'bg-indigo-100 text-indigo-700',
  'Duty Shift':               'bg-blue-100 text-blue-700',
  'Meeting':                  'bg-gray-100 text-gray-600',
  'Community Event':          'bg-green-100 text-green-700',
  'Station Maintenance':      'bg-yellow-100 text-yellow-700',
  'Administrative':           'bg-slate-100 text-slate-600',
  'Mutual Aid':               'bg-violet-100 text-violet-700',
  'Fundraising':              'bg-pink-100 text-pink-700',
  'Other':                    'bg-gray-100 text-gray-500',
};

// Helpers
const yr = new Date().getFullYear();
const d  = (mo, day) => `${yr}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

export const initialHours = [
  // ── January ─────────────────────────────────────────────────────────────
  // Structure fire — INC-2026-0001 (all hands)
  { id:'vh-001', memberId:1, memberName:'Sarah Chen',  date:d(1,8),  activityType:'Incident Response',         hours:4.5, description:'Structure fire, 2nd alarm — mutual aid to Riverside VFD', reference:'INC-2026-0001' },
  { id:'vh-002', memberId:2, memberName:'Maria Delgado',   date:d(1,8),  activityType:'Incident Response',         hours:4.5, description:'Structure fire, 2nd alarm', reference:'INC-2026-0001' },
  { id:'vh-003', memberId:3, memberName:'Nathan McGee',   date:d(1,8),  activityType:'Incident Response',         hours:4.5, description:'Structure fire, 2nd alarm', reference:'INC-2026-0001' },
  { id:'vh-004', memberId:4, memberName:'Sandra Kim',   date:d(1,8),  activityType:'Incident Response',         hours:4.5, description:'Engine operator', reference:'INC-2026-0001' },
  { id:'vh-005', memberId:5, memberName:'Tracy Benson',  date:d(1,8),  activityType:'Incident Response',         hours:4.5, description:'Interior attack crew', reference:'INC-2026-0001' },
  { id:'vh-006', memberId:7, memberName:'Mike Harrington',   date:d(1,8),  activityType:'Incident Response',         hours:4.5, description:'RIT assignment', reference:'INC-2026-0001' },

  // January duty shifts
  { id:'vh-007', memberId:1, memberName:'Sarah Chen',  date:d(1,5),  activityType:'Duty Shift',                hours:12,  description:'Day shift — Duty Officer', reference:'' },
  { id:'vh-008', memberId:3, memberName:'Nathan McGee',   date:d(1,5),  activityType:'Duty Shift',                hours:12,  description:'Day shift crew', reference:'' },
  { id:'vh-009', memberId:4, memberName:'Sandra Kim',   date:d(1,5),  activityType:'Duty Shift',                hours:12,  description:'Day shift crew', reference:'' },
  { id:'vh-010', memberId:6, memberName:'James Ortega',    date:d(1,12), activityType:'Duty Shift',                hours:12,  description:'Night shift crew', reference:'' },
  { id:'vh-011', memberId:8, memberName:'Amy Winters',   date:d(1,12), activityType:'Duty Shift',                hours:12,  description:'Night shift crew — probationary observation', reference:'' },

  // January monthly meeting
  { id:'vh-012', memberId:1, memberName:'Sarah Chen',  date:d(1,14), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },
  { id:'vh-013', memberId:2, memberName:'Maria Delgado',   date:d(1,14), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },
  { id:'vh-014', memberId:3, memberName:'Nathan McGee',   date:d(1,14), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },
  { id:'vh-015', memberId:5, memberName:'Tracy Benson',  date:d(1,14), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },
  { id:'vh-016', memberId:6, memberName:'James Ortega',    date:d(1,14), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },
  { id:'vh-017', memberId:7, memberName:'Mike Harrington',   date:d(1,14), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },
  { id:'vh-018', memberId:8, memberName:'Amy Winters',   date:d(1,14), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },

  // ── February ─────────────────────────────────────────────────────────────
  // February pump operations drill
  { id:'vh-019', memberId:1, memberName:'Sarah Chen',  date:d(2,5),  activityType:'Drill / Training Exercise', hours:3,   description:'Monthly drill — pump operations & relay pumping', reference:'' },
  { id:'vh-020', memberId:2, memberName:'Maria Delgado',   date:d(2,5),  activityType:'Drill / Training Exercise', hours:3,   description:'Monthly drill — pump operations', reference:'' },
  { id:'vh-021', memberId:3, memberName:'Nathan McGee',   date:d(2,5),  activityType:'Drill / Training Exercise', hours:3,   description:'Monthly drill — pump operations', reference:'' },
  { id:'vh-022', memberId:4, memberName:'Sandra Kim',   date:d(2,5),  activityType:'Drill / Training Exercise', hours:3,   description:'Monthly drill — pump operations (instructor)', reference:'' },
  { id:'vh-023', memberId:5, memberName:'Tracy Benson',  date:d(2,5),  activityType:'Drill / Training Exercise', hours:3,   description:'Monthly drill', reference:'' },
  { id:'vh-024', memberId:7, memberName:'Mike Harrington',   date:d(2,5),  activityType:'Drill / Training Exercise', hours:3,   description:'Monthly drill', reference:'' },

  // 2nd alarm commercial fire — INC-2026-0006
  { id:'vh-025', memberId:1, memberName:'Sarah Chen',  date:d(2,3),  activityType:'Incident Response',         hours:5.5, description:'2nd alarm commercial structure fire — IC', reference:'INC-2026-0006' },
  { id:'vh-026', memberId:2, memberName:'Maria Delgado',   date:d(2,3),  activityType:'Incident Response',         hours:5.5, description:'2nd alarm — interior attack', reference:'INC-2026-0006' },
  { id:'vh-027', memberId:3, memberName:'Nathan McGee',   date:d(2,3),  activityType:'Incident Response',         hours:5.5, description:'2nd alarm — water supply', reference:'INC-2026-0006' },
  { id:'vh-028', memberId:4, memberName:'Sandra Kim',   date:d(2,3),  activityType:'Incident Response',         hours:5.5, description:'Engine operator', reference:'INC-2026-0006' },
  { id:'vh-029', memberId:7, memberName:'Mike Harrington',   date:d(2,3),  activityType:'Incident Response',         hours:5.5, description:'RIT team', reference:'INC-2026-0006' },

  // February duty shifts
  { id:'vh-030', memberId:2, memberName:'Maria Delgado',   date:d(2,9),  activityType:'Duty Shift',                hours:12,  description:'Duty Officer shift', reference:'' },
  { id:'vh-031', memberId:5, memberName:'Tracy Benson',  date:d(2,9),  activityType:'Duty Shift',                hours:12,  description:'Day shift crew', reference:'' },
  { id:'vh-032', memberId:6, memberName:'James Ortega',    date:d(2,9),  activityType:'Duty Shift',                hours:12,  description:'Day shift crew', reference:'' },
  { id:'vh-033', memberId:8, memberName:'Amy Winters',   date:d(2,16), activityType:'Duty Shift',                hours:12,  description:'Night shift — probationary', reference:'' },

  // HazMat class — Delgado
  { id:'vh-034', memberId:2, memberName:'Maria Delgado',   date:d(2,15), activityType:'Formal Training / Class',   hours:24,  description:'HazMat Operations certification course', reference:'' },

  // Station maintenance
  { id:'vh-035', memberId:6, memberName:'James Ortega',    date:d(2,22), activityType:'Station Maintenance',       hours:4,   description:'Bay floor cleaning, hose testing', reference:'' },
  { id:'vh-036', memberId:8, memberName:'Amy Winters',   date:d(2,22), activityType:'Station Maintenance',       hours:4,   description:'Equipment inventory and storage', reference:'' },

  // February meeting
  { id:'vh-037', memberId:1, memberName:'Sarah Chen',  date:d(2,11), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },
  { id:'vh-038', memberId:2, memberName:'Maria Delgado',   date:d(2,11), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },
  { id:'vh-039', memberId:3, memberName:'Nathan McGee',   date:d(2,11), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },
  { id:'vh-040', memberId:6, memberName:'James Ortega',    date:d(2,11), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },
  { id:'vh-041', memberId:7, memberName:'Mike Harrington',   date:d(2,11), activityType:'Meeting',                   hours:2,   description:'Monthly general meeting', reference:'' },

  // ── March ────────────────────────────────────────────────────────────────
  // Water rescue
  { id:'vh-042', memberId:1, memberName:'Sarah Chen',  date:d(3,1),  activityType:'Incident Response',         hours:3.5, description:'Swift water rescue — 2 subjects', reference:'INC-2026-0009' },
  { id:'vh-043', memberId:2, memberName:'Maria Delgado',   date:d(3,1),  activityType:'Incident Response',         hours:3.5, description:'Swift water rescue', reference:'INC-2026-0009' },
  { id:'vh-044', memberId:5, memberName:'Tracy Benson',  date:d(3,1),  activityType:'Incident Response',         hours:3.5, description:'Swift water rescue — entry team', reference:'INC-2026-0009' },
  { id:'vh-045', memberId:7, memberName:'Mike Harrington',   date:d(3,1),  activityType:'Incident Response',         hours:3.5, description:'Swift water rescue — entry team', reference:'INC-2026-0009' },

  // Community pancake breakfast fundraiser
  { id:'vh-046', memberId:1, memberName:'Sarah Chen',  date:d(3,2),  activityType:'Fundraising',               hours:5,   description:'Annual pancake breakfast fundraiser', reference:'' },
  { id:'vh-047', memberId:3, memberName:'Nathan McGee',   date:d(3,2),  activityType:'Fundraising',               hours:5,   description:'Annual pancake breakfast fundraiser', reference:'' },
  { id:'vh-048', memberId:6, memberName:'James Ortega',    date:d(3,2),  activityType:'Community Event',           hours:5,   description:'Pancake breakfast — public education booth', reference:'' },
  { id:'vh-049', memberId:8, memberName:'Amy Winters',   date:d(3,2),  activityType:'Community Event',           hours:5,   description:'Pancake breakfast — fire safety demonstrations', reference:'' },

  // March duty shifts
  { id:'vh-050', memberId:3, memberName:'Nathan McGee',   date:d(3,3),  activityType:'Duty Shift',                hours:12,  description:'Day shift — Duty Officer', reference:'' },
  { id:'vh-051', memberId:4, memberName:'Sandra Kim',   date:d(3,3),  activityType:'Duty Shift',                hours:12,  description:'Day shift — engine operator', reference:'' },
  { id:'vh-052', memberId:5, memberName:'Tracy Benson',  date:d(3,3),  activityType:'Duty Shift',                hours:12,  description:'Day shift crew', reference:'' },

  // Wildland training — Torres
  { id:'vh-053', memberId:5, memberName:'Tracy Benson',  date:d(3,5),  activityType:'Formal Training / Class',   hours:16,  description:'Wildland Firefighter certification — state forestry', reference:'' },

  // Technical rescue — Okafor
  { id:'vh-054', memberId:7, memberName:'Mike Harrington',   date:d(3,5),  activityType:'Formal Training / Class',   hours:32,  description:'Technical Rescue – Rope certification', reference:'' },
];
