// ─── Drill & Course Management Data ───────────────────────────────────────

export const DRILL_TYPES = [
  'Structural Fire', 'Vehicle Extrication', 'HazMat', 'Water Supply',
  'High-Rise / Multi-Story', 'Wildland / Brush', 'Technical Rescue',
  'EMS / Mass Casualty', 'Mayday / RIT', 'Driver/Operator',
  'Accountability / ICS', 'Live Fire', 'General / Orientation',
];

export const COURSE_TYPES = [
  'Firefighter I', 'Firefighter II', 'Fire Officer I', 'Fire Officer II',
  'EMT Basic', 'EMT Advanced', 'Paramedic', 'HazMat Awareness',
  'HazMat Operations', 'HazMat Technician', 'Apparatus Operator',
  'Incident Command (ICS 100)', 'ICS 200', 'ICS 300', 'ICS 400',
  'Confined Space Rescue', 'High Angle Rescue', 'Water Rescue',
  'Instructor I', 'Instructor II', 'Other',
];

export const DRILL_LOCATIONS = [
  'Station 1', 'Station 2', 'Training Grounds', 'Off-Site', 'Online / Virtual',
];

export const PASS_FAIL = ['Pass', 'Fail', 'Incomplete', 'Excused'];

// Sample member roster for attendance
export const DRILL_MEMBERS = [
  { id: 'M01', name: 'Sarah Chen' },
  { id: 'M02', name: 'Maria Delgado' },
  { id: 'M03', name: 'James Ortega' },
  { id: 'M04', name: 'Nathan McGee' },
  { id: 'M05', name: 'Sandra Kim' },
  { id: 'M06', name: 'Tracy Benson' },
  { id: 'M07', name: 'Mike Harrington' },
  { id: 'M08', name: 'Lisa Fontaine' },
];

export const initialDrills = [
  {
    id: 1,
    title: 'Structural Fire Operations — Search & Rescue',
    type: 'Structural Fire',
    date: '2026-02-18',
    startTime: '19:00',
    duration: 120,
    location: 'Training Grounds',
    instructor: 'Maria Delgado',
    objectives: [
      'Primary and secondary search techniques in zero-visibility conditions',
      'Coordinated attack with RIT standby',
      'Thermal imaging camera operation',
    ],
    attendees: [
      { id: 'M01', name: 'Sarah Chen',       attended: true,  result: 'Pass', score: null },
      { id: 'M02', name: 'Maria Delgado', attended: true,  result: 'Pass', score: null },
      { id: 'M03', name: 'James Ortega',attended: true,  result: 'Pass', score: null },
      { id: 'M04', name: 'Nathan McGee',      attended: true,  result: 'Pass', score: null },
      { id: 'M05', name: 'Sandra Kim',      attended: false, result: 'Excused', score: null },
      { id: 'M06', name: 'Tracy Benson',  attended: true,  result: 'Pass', score: null },
      { id: 'M07', name: 'Mike Harrington',     attended: true,  result: 'Pass', score: null },
      { id: 'M08', name: 'Lisa Fontaine',      attended: false, result: 'Incomplete', score: null },
    ],
    isoHours: true,
    notes: 'Excellent participation. Lisa Fontaine needs makeup session for RIT module.',
  },
  {
    id: 2,
    title: 'Vehicle Extrication — Power Tools',
    type: 'Vehicle Extrication',
    date: '2026-01-28',
    startTime: '18:30',
    duration: 90,
    location: 'Training Grounds',
    instructor: 'James Ortega',
    objectives: [
      'Jaws of Life setup and operation',
      'Door removal and roof evolution',
      'Stabilization of overturned vehicle',
    ],
    attendees: [
      { id: 'M01', name: 'Sarah Chen',       attended: true,  result: 'Pass', score: null },
      { id: 'M02', name: 'Maria Delgado', attended: true,  result: 'Pass', score: null },
      { id: 'M03', name: 'James Ortega',attended: true,  result: 'Pass', score: null },
      { id: 'M04', name: 'Nathan McGee',      attended: true,  result: 'Pass', score: null },
      { id: 'M05', name: 'Sandra Kim',      attended: true,  result: 'Pass', score: null },
      { id: 'M06', name: 'Tracy Benson',  attended: true,  result: 'Pass', score: null },
      { id: 'M07', name: 'Mike Harrington',     attended: false, result: 'Excused', score: null },
      { id: 'M08', name: 'Lisa Fontaine',      attended: true,  result: 'Pass', score: null },
    ],
    isoHours: true,
    notes: '',
  },
  {
    id: 3,
    title: 'Mayday / Rapid Intervention Team Drill',
    type: 'Mayday / RIT',
    date: '2026-01-07',
    startTime: '19:00',
    duration: 150,
    location: 'Station 1',
    instructor: 'Maria Delgado',
    objectives: [
      'Mayday declaration and radio procedure',
      'LUNAR report format',
      'RIT pack deployment and SCBA emergency bypass',
      'Drag rescue techniques',
    ],
    attendees: [
      { id: 'M01', name: 'Sarah Chen',       attended: true,  result: 'Pass', score: null },
      { id: 'M02', name: 'Maria Delgado', attended: true,  result: 'Pass', score: null },
      { id: 'M03', name: 'James Ortega',attended: false, result: 'Excused', score: null },
      { id: 'M04', name: 'Nathan McGee',      attended: true,  result: 'Pass', score: null },
      { id: 'M05', name: 'Sandra Kim',      attended: true,  result: 'Pass', score: null },
      { id: 'M06', name: 'Tracy Benson',  attended: true,  result: 'Pass', score: null },
      { id: 'M07', name: 'Mike Harrington',     attended: true,  result: 'Pass', score: null },
      { id: 'M08', name: 'Lisa Fontaine',      attended: true,  result: 'Pass', score: null },
    ],
    isoHours: true,
    notes: 'Conducted in three rotations. All members who attended demonstrated proficiency.',
  },
];

export const initialCourses = [
  {
    id: 101,
    courseName: 'Firefighter I Certification',
    type: 'Firefighter I',
    provider: 'Indiana Fire Training System',
    startDate: '2025-09-06',
    endDate: '2025-11-22',
    location: 'State Fire Academy, Indianapolis',
    certificationEarned: 'Firefighter I',
    certExpireYears: 0,
    cost: 650,
    instructor: 'State Fire Academy Staff',
    attendees: [
      { id: 'M04', name: 'Nathan McGee',   enrolled: true, passed: true,  score: 88 },
      { id: 'M08', name: 'Lisa Fontaine',   enrolled: true, passed: true,  score: 84 },
    ],
    notes: 'Both members passed written and practical exams on first attempt.',
  },
  {
    id: 102,
    courseName: 'ICS 300 — Intermediate ICS',
    type: 'ICS 300',
    provider: 'FEMA / National Fire Academy',
    startDate: '2025-10-14',
    endDate: '2025-10-15',
    location: 'County Emergency Management Office',
    certificationEarned: 'ICS 300',
    certExpireYears: 0,
    cost: 0,
    instructor: 'FEMA Contractor',
    attendees: [
      { id: 'M01', name: 'Sarah Chen',       enrolled: true, passed: true,  score: null },
      { id: 'M02', name: 'Maria Delgado', enrolled: true, passed: true,  score: null },
      { id: 'M03', name: 'James Ortega',enrolled: true, passed: false, score: null },
    ],
    notes: 'Ortega must retake written exam. Makeup scheduled for Nov.',
  },
  {
    id: 103,
    courseName: 'HazMat Operations Recertification',
    type: 'HazMat Operations',
    provider: 'Regional HazMat Team',
    startDate: '2025-08-23',
    endDate: '2025-08-23',
    location: 'County HazMat Facility',
    certificationEarned: 'HazMat Operations',
    certExpireYears: 3,
    cost: 0,
    instructor: 'Lt. McGee Fosse, County HazMat',
    attendees: [
      { id: 'M01', name: 'Sarah Chen',       enrolled: true, passed: true,  score: null },
      { id: 'M02', name: 'Maria Delgado', enrolled: true, passed: true,  score: null },
      { id: 'M03', name: 'James Ortega',enrolled: true, passed: true,  score: null },
      { id: 'M05', name: 'Sandra Kim',      enrolled: true, passed: true,  score: null },
      { id: 'M06', name: 'Tracy Benson',  enrolled: true, passed: true,  score: null },
    ],
    notes: 'All 5 members recertified. Next recert due: Aug 2028.',
  },
];
