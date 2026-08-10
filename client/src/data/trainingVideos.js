/**
 * trainingVideos.js — Video-based training courses with CEU credits & ISO PPC mapping
 *
 * Each course contains:
 *   id, title, description, category, isoCategory, ceuHours, durationMinutes,
 *   videoUrl, videoType, thumbnail, instructor, provider, level,
 *   passingScore, quiz[], prerequisites[]
 *
 * videoType: 'youtube' | 'vimeo' | 'hosted' | 'department'
 * level: 'awareness' | 'operations' | 'advanced'
 */

// ─── FSRS Item 580 — Credit for Training ────────────────────────────────────
//
// SOURCE OF TRUTH, verified 2026-08-08 against the primary document:
//   Public Protection Classification (PPC) Summary Report, Glenwood Springs CO,
//   prepared by Insurance Services Office, Inc., created September 2025,
//   effective January 1, 2026 — Item 581/580 table, page 17.
//   Cross-checked against Verisk's published "Items Considered in the FSRS".
//
// Item 580 is worth 9 FSRS points and is scored on an INTERNAL 100 that is then
// scaled: (internal earned / 100) x 9. The eight sub-items below sum to exactly
// 100. Verified by reproducing the source report's own arithmetic:
//   14 + 11.77 + 12 + 2.33 + 5 + 1 + 5 + 12 = 63.10 -> 63.10/100 x 9 = 5.68,
//   which is the figure that report prints for Item 581.
//
// TWO THINGS THIS TABLE DELIBERATELY DOES NOT DO:
//
//  1. It does not compute earned credit. `maxCredit` is the ceiling ISO makes
//     available for the sub-item; the earned figure depends on DEPARTMENT-wide
//     compliance under a formula ISO owns. A per-member linear share of the
//     maximum is not that formula. The scorer (server-owned, planned) will be
//     the only thing that ever produces an earned number.
//
//  2. It does not invent an hours requirement where ISO does not state one.
//     580.H is a COVERAGE requirement (every qualifying building inspected
//     annually), not an hours requirement, so `annualRequirement` is null and
//     the hours dashboards skip it. A previous version of this table carried a
//     fabricated "8 hours" here.
//
// `annualRequirement` is the per-firefighter hours ISO states, annualized.
// `requirement` is ISO's own wording, kept verbatim so it can be re-checked.
// Do not edit a value here without re-reading the source and updating `edition`.

export const FSRS_ITEM_580 = {
  item: '580',
  name: 'Credit for Training',
  fsrsPoints: 9,
  internalTotal: 100,
  edition: 'PPC Summary Report, ISO, effective 2026-01-01',
};

export const ISO_CATEGORIES = [
  {
    id: 'facilities-use',
    label: 'Facilities, and Use',
    description: 'Structure-fire training conducted at or using department training facilities — training tower, burn building, drill ground.',
    ppcSection: '580.A',
    requirement: 'Each firefighter should receive 18 hours per year in structure fire related subjects as outlined in NFPA 1001.',
    nfpa: 'NFPA 1001',
    annualRequirement: 18,
    maxCredit: 35,
    color: 'bg-indigo-100 text-indigo-700',
  },
  {
    id: 'company-training',
    label: 'Company Training',
    description: 'Structure-fire training conducted at the fire station at company level — drills, evolutions, in-service training.',
    ppcSection: '580.B',
    requirement: 'Each firefighter should receive 16 hours per month in structure fire related subjects as outlined in NFPA 1001.',
    nfpa: 'NFPA 1001',
    annualRequirement: 192,       // 16 hrs/month x 12
    maxCredit: 25,
    color: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'officer-training',
    label: 'Classes for Officers',
    description: 'Officer certification and continuing education for company and chief officers.',
    ppcSection: '580.C',
    requirement: 'Each officer should be certified in accordance with the general criteria of NFPA 1021. Additionally, each officer should receive 12 hours of continuing education on or off site.',
    nfpa: 'NFPA 1021',
    annualRequirement: 12,        // the CE hours; the certification half is not an hours measure
    maxCredit: 12,
    color: 'bg-purple-100 text-purple-700',
  },
  {
    id: 'driver-new',
    label: 'New Driver/Operator Training',
    description: 'Driver and pump/aerial operator training for NEW drivers and operators.',
    ppcSection: '580.D',
    requirement: 'Each new driver and operator should receive 60 hours of driver/operator training per year in accordance with NFPA 1002 and NFPA 1451.',
    nfpa: 'NFPA 1002, NFPA 1451',
    annualRequirement: 60,
    maxCredit: 5,
    color: 'bg-amber-100 text-amber-800',
  },
  {
    id: 'driver-existing',
    label: 'Existing Driver/Operator Training',
    description: 'Ongoing driver and pump/aerial operator training for established drivers and operators.',
    ppcSection: '580.E',
    requirement: 'Each existing driver and operator should receive 12 hours of driver/operator training per year in accordance with NFPA 1002 and NFPA 1451.',
    nfpa: 'NFPA 1002, NFPA 1451',
    annualRequirement: 12,
    maxCredit: 5,
    color: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'hazmat-training',
    label: 'Training on Hazardous Materials',
    description: 'Hazardous materials awareness, operations, and technician-level training.',
    ppcSection: '580.F',
    requirement: 'Each firefighter should receive 6 hours of training for incidents involving hazardous materials in accordance with NFPA 472.',
    nfpa: 'NFPA 472',
    annualRequirement: 6,
    maxCredit: 1,
    color: 'bg-yellow-100 text-yellow-800',
  },
  {
    id: 'recruit-training',
    label: 'Recruit Training',
    description: 'Entry-level structure-fire training within a member\'s first year — FF I/II academy and orientation.',
    ppcSection: '580.G',
    requirement: 'Each firefighter should receive 240 hours of structure fire related training in accordance with NFPA 1001 within the first year of employment or tenure.',
    nfpa: 'NFPA 1001',
    annualRequirement: 240,       // within the FIRST YEAR, not recurring annually
    maxCredit: 5,
    color: 'bg-green-100 text-green-700',
  },
  {
    id: 'pre-fire-planning',
    label: 'Pre-Fire Planning Inspections',
    description: 'Annual pre-fire planning inspections of commercial, industrial, institutional and similar buildings by company members, with up-to-date notes and sketches.',
    ppcSection: '580.H',
    requirement: 'Pre-fire planning inspections of each commercial, industrial, institutional, and other similar type building (all buildings except 1-4 family dwellings) should be made annually by company members. Records of inspections should include up-to-date notes and sketches.',
    nfpa: null,
    annualRequirement: null,      // COVERAGE, not hours — ISO states no hours figure here
    maxCredit: 12,
    color: 'bg-teal-100 text-teal-700',
  },
  {
    id: 'general-ceu',
    label: 'General CEU',
    description: 'Continuing education hours that count toward general CEU requirements but don\'t map to a specific FSRS Item 580 sub-item.',
    ppcSection: null,
    requirement: null,
    nfpa: null,
    annualRequirement: null,
    maxCredit: 0,
    color: 'bg-gray-100 text-gray-700',
  },
];

export function getIsoCategoryById(id) {
  return ISO_CATEGORIES.find(c => c.id === id) || null;
}


// ─── Video Courses ──────────────────────────────────────────────────────────

export const VIDEO_COURSES = [

  // ── 1. Fireground Search & Rescue ─────────────────────────────────────────
  {
    id: 'vc-search-rescue',
    title: 'Fireground Search & Rescue Operations',
    description: 'Primary and secondary search techniques, oriented search, vent-enter-isolate-search (VEIS), and thermal imaging camera use in zero-visibility conditions.',
    category: 'Company Training',
    isoCategory: 'company-training',
    ceuHours: 1.5,
    durationMinutes: 0,
    videoUrl: '',
    videoType: 'youtube',
    thumbnail: '',
    instructor: '',
    provider: '',
    level: 'operations',
    passingScore: 80,
    prerequisites: [],
    tags: ['search', 'rescue', 'VEIS', 'thermal imaging', 'interior operations'],
    quiz: [],
  },

  // ── 2. Fire Officer Leadership ────────────────────────────────────────────
  {
    id: 'vc-officer-leadership',
    title: 'Fire Officer Leadership & Decision-Making',
    description: 'Company officer responsibilities: size-up, initial radio report, tactical decision-making under pressure, crew accountability, and the art of command presence.',
    category: 'Officer Training',
    isoCategory: 'officer-training',
    ceuHours: 1.0,
    durationMinutes: 0,
    videoUrl: '',
    videoType: 'youtube',
    thumbnail: '',
    instructor: '',
    provider: '',
    level: 'advanced',
    passingScore: 80,
    prerequisites: ['Firefighter II', 'ICS-200'],
    tags: ['officer', 'leadership', 'size-up', 'command', 'decision-making'],
    quiz: [],
  },

  // ── 3. Pump Operations ────────────────────────────────────────────────────
  {
    id: 'vc-pump-ops',
    title: 'Pump Operations: From Hydrant to Nozzle',
    description: 'Hydrant connections, intake pressure management, discharge calculations, relay pumping, and drafting from static sources. Covers NFPA 1002 competencies.',
    category: 'Driver/Operator Training',
    isoCategory: 'driver-existing',
    ceuHours: 1.5,
    durationMinutes: 0,
    videoUrl: '',
    videoType: 'youtube',
    thumbnail: '',
    instructor: '',
    provider: '',
    level: 'operations',
    passingScore: 80,
    prerequisites: ['Driver/Operator – Pumper'],
    tags: ['pumper', 'driver/operator', 'hydraulics', 'water supply', 'drafting', 'relay'],
    quiz: [],
  },

  // ── 4. HazMat Operations Refresher ────────────────────────────────────────
  {
    id: 'vc-hazmat-ops',
    title: 'HazMat Operations Level Refresher',
    description: 'Annual refresher covering defensive HazMat operations: product identification, isolation zones, decontamination procedures, PPE selection, and ERG usage. Satisfies OSHA 1910.120 annual refresher.',
    category: 'Hazmat Training',
    isoCategory: 'hazmat-training',
    ceuHours: 1.0,
    durationMinutes: 0,
    videoUrl: '',
    videoType: 'youtube',
    thumbnail: '',
    instructor: '',
    provider: '',
    level: 'operations',
    passingScore: 80,
    prerequisites: ['HazMat Awareness'],
    tags: ['hazmat', 'decon', 'PPE', 'ERG', 'isolation', 'defensive ops'],
    quiz: [],
  },

  // ── 5. Recruit Firefighter Orientation ────────────────────────────────────
  {
    id: 'vc-recruit-orientation',
    title: 'New Recruit Orientation: Your First 90 Days',
    description: 'Department orientation for probationary firefighters: chain of command, station operations, equipment familiarization, safety culture, and expectations for the probationary period.',
    category: 'New Recruit Training',
    isoCategory: 'recruit-training',
    ceuHours: 1.0,
    durationMinutes: 0,
    videoUrl: '',
    videoType: 'department',
    thumbnail: '',
    instructor: '',
    provider: '',
    level: 'awareness',
    passingScore: 80,
    prerequisites: [],
    tags: ['recruit', 'orientation', 'probationary', 'station', 'safety'],
    quiz: [],
  },

  // ── 6. Pre-Fire Planning ──────────────────────────────────────────────────
  {
    id: 'vc-prefire-planning',
    title: 'Pre-Fire Planning: Know Your Buildings Before the Fire',
    description: 'Building construction types, pre-incident survey techniques, target hazard identification, drawing site plans, and using pre-plans on the fireground. Covers NFPA 1620.',
    category: 'Pre-Fire Planning',
    isoCategory: 'pre-fire-planning',
    ceuHours: 1.0,
    durationMinutes: 0,
    videoUrl: '',
    videoType: 'youtube',
    thumbnail: '',
    instructor: '',
    provider: '',
    level: 'operations',
    passingScore: 80,
    prerequisites: [],
    tags: ['pre-plan', 'building construction', 'target hazard', 'NFPA 1620', 'site survey'],
    quiz: [],
  },

  // ── 7. SCBA Emergency Procedures ──────────────────────────────────────────
  {
    id: 'vc-scba-emergencies',
    title: 'SCBA Emergency Procedures & Air Management',
    description: 'Low-air emergencies, buddy breathing, SCBA doffing in tight spaces, emergency SCBA bypass, and the "Rule of Air Management" (ROAM). Critical survival skills.',
    category: 'Company Training',
    isoCategory: 'company-training',
    ceuHours: 1.0,
    durationMinutes: 0,
    videoUrl: '',
    videoType: 'youtube',
    thumbnail: '',
    instructor: '',
    provider: '',
    level: 'operations',
    passingScore: 85,
    prerequisites: ['SCBA Fit Test'],
    tags: ['SCBA', 'air management', 'ROAM', 'survival', 'emergency procedures', 'RIT'],
    quiz: [],
  },

  // ── 8. Vehicle Extrication Fundamentals ───────────────────────────────────
  {
    id: 'vc-extrication',
    title: 'Vehicle Extrication: Modern Car Construction',
    description: 'Updated extrication techniques for modern vehicles: ultra-high-strength steel, hybrid/EV battery hazards, airbag systems, stabilization, and patient-centered extrication.',
    category: 'Company Training',
    isoCategory: 'company-training',
    ceuHours: 1.5,
    durationMinutes: 0,
    videoUrl: '',
    videoType: 'youtube',
    thumbnail: '',
    instructor: '',
    provider: '',
    level: 'operations',
    passingScore: 80,
    prerequisites: [],
    tags: ['extrication', 'vehicle rescue', 'EV', 'hybrid', 'stabilization', 'hydraulic tools'],
    quiz: [],
  },
];


// ─── User Progress Tracking (client-side state) ─────────────────────────────

/**
 * Shape of a completed course record (stored in the member's training profile):
 * {
 *   courseId: string,
 *   memberId: number,
 *   startedAt: ISO string,
 *   completedAt: ISO string | null,
 *   quizScore: number | null,      // percentage 0-100
 *   quizPassed: boolean,
 *   attempts: number,
 *   ceuAwarded: number,
 *   certificateId: string | null,   // generated UUID for the CEU certificate
 * }
 */

export function getCourseById(id) {
  return VIDEO_COURSES.find(c => c.id === id) || null;
}

export function getCoursesByIsoCategory(isoCategoryId) {
  return VIDEO_COURSES.filter(c => c.isoCategory === isoCategoryId);
}

export function getCoursesByLevel(level) {
  return VIDEO_COURSES.filter(c => c.level === level);
}

export function getTotalCeuHours() {
  return VIDEO_COURSES.reduce((sum, c) => sum + c.ceuHours, 0);
}
