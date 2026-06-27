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

// ─── ISO PPC Credit Categories ──────────────────────────────────────────────
// Based on ISO/PPC Schedule — Fire Department Section
// These map to the credit areas that affect a department's ISO rating.

export const ISO_CATEGORIES = [
  {
    id: 'company-training',
    label: 'Company Training',
    description: 'Training conducted at the company/station level — drills, evolutions, and in-service training.',
    ppcSection: '580.B',
    annualRequirement: 192,       // hours per year for max credit (16 hrs/member × 12 months)
    maxPpcCredit: 35,             // max PPC points available
    color: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'officer-training',
    label: 'Officer Training',
    description: 'Leadership, command, and management training for company officers and chief officers.',
    ppcSection: '580.C',
    annualRequirement: 12,        // hours per officer per year
    maxPpcCredit: 12,
    color: 'bg-purple-100 text-purple-700',
  },
  {
    id: 'driver-operator',
    label: 'Driver/Operator Training',
    description: 'Apparatus operation, pump operations, aerial operations, and EVOC training.',
    ppcSection: '580.D',
    annualRequirement: 12,        // hours per driver/operator per year
    maxPpcCredit: 12,
    color: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'hazmat-training',
    label: 'Hazmat Training',
    description: 'Hazardous materials awareness, operations, and technician-level training.',
    ppcSection: '580.E',
    annualRequirement: 6,
    maxPpcCredit: 5,
    color: 'bg-yellow-100 text-yellow-800',
  },
  {
    id: 'new-recruit',
    label: 'New Recruit Training',
    description: 'Entry-level training for probationary firefighters — FF I/II academy and orientation.',
    ppcSection: '580.F',
    annualRequirement: 240,       // total recruit academy hours
    maxPpcCredit: 25,
    color: 'bg-green-100 text-green-700',
  },
  {
    id: 'pre-fire-planning',
    label: 'Pre-Fire Planning',
    description: 'Pre-incident planning, building familiarization, and target hazard inspections.',
    ppcSection: '580.G',
    annualRequirement: 8,
    maxPpcCredit: 8,
    color: 'bg-teal-100 text-teal-700',
  },
  {
    id: 'general-ceu',
    label: 'General CEU',
    description: 'Continuing education hours that count toward general CEU requirements but don\'t map to a specific ISO category.',
    ppcSection: null,
    annualRequirement: null,
    maxPpcCredit: 0,
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
    isoCategory: 'driver-operator',
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
    isoCategory: 'new-recruit',
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
