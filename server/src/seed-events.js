'use strict';
const { events: db, pool } = require('./db');

module.exports = async function seedEvents() {
  const existing = await db.all(1);
  if (existing.length > 0) {
    console.log(`Events seed: already seeded (${existing.length} records), skipping.`);
    return;
  }

  // Fetch all members to map names to IDs
  const { rows: memberRows } = await pool.query('SELECT id, name FROM members WHERE station_id = 1 ORDER BY id');
  if (memberRows.length === 0) {
    console.log('Events seed: no members found, skipping.');
    return;
  }

  const m = (name) => memberRows.find(r => r.name === name);

  const yr = 2026;
  const d = (mo, day) =>
    `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Helper: Get nth occurrence of day-of-week in month (e.g., 1st Tuesday)
  const getNthDayOfMonth = (mo, dayOfWeek, occurrence) => {
    let found = 0;
    for (let day = 1; day <= 31; day++) {
      const testDate = new Date(yr, mo - 1, day);
      if (testDate.getMonth() !== mo - 1) break; // End of month
      if (testDate.getDay() === dayOfWeek) {
        found++;
        if (found === occurrence) return day;
      }
    }
    return null;
  };

  // RSVP groups with dynamic member IDs
  const rsvpAll = [
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', status: 'Going' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', status: 'Going' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', status: 'Going' },
    { memberId: m('Sandra Kim').id, memberName: 'Sandra Kim', status: 'Going' },
    { memberId: m('James Ortega').id, memberName: 'James Ortega', status: 'Not Going' },
    { memberId: m('Tracy Benson').id, memberName: 'Tracy Benson', status: 'Going' },
    { memberId: m('Mike Harrington').id, memberName: 'Mike Harrington', status: 'Going' },
    { memberId: m('Lisa Fontaine').id, memberName: 'Lisa Fontaine', status: 'Going' },
    { memberId: m('Carlos Ruiz').id, memberName: 'Carlos Ruiz', status: 'Going' },
    { memberId: m('Amy Winters').id, memberName: 'Amy Winters', status: 'Going' },
    { memberId: m('Kevin Marsh').id, memberName: 'Kevin Marsh', status: 'Going' },
    { memberId: m('Diane Tolliver').id, memberName: 'Diane Tolliver', status: 'Going' },
  ];

  const rsvpOfficers = [
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', status: 'Going' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', status: 'Going' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', status: 'Going' },
  ];

  const rsvpPartial = [
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', status: 'Going' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', status: 'Going' },
    { memberId: m('Sandra Kim').id, memberName: 'Sandra Kim', status: 'Going' },
    { memberId: m('Tracy Benson').id, memberName: 'Tracy Benson', status: 'Maybe' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', status: 'Not Going' },
    { memberId: m('Carlos Ruiz').id, memberName: 'Carlos Ruiz', status: 'Going' },
  ];

  const rsvpFew = [
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', status: 'Going' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', status: 'Going' },
    { memberId: m('Mike Harrington').id, memberName: 'Mike Harrington', status: 'Going' },
    { memberId: m('Lisa Fontaine').id, memberName: 'Lisa Fontaine', status: 'Going' },
  ];

  const rsvpDrivers = [
    { memberId: m('Kevin Marsh').id, memberName: 'Kevin Marsh', status: 'Going' },
    { memberId: m('Diane Tolliver').id, memberName: 'Diane Tolliver', status: 'Going' },
    { memberId: m('Mike Harrington').id, memberName: 'Mike Harrington', status: 'Going' },
  ];

  const records = [
    // ===== JANUARY 2026 =====
    { title: 'Monthly Department Meeting', type: 'Meeting', date: d(1, 6), startTime: '19:00', endTime: '20:30', location: 'Station 14 — Apparatus Bay', organizer: 'Sarah Chen', description: 'Monthly business meeting covering budget review, apparatus status, and upcoming events.', maxAttendees: null, rsvps: rsvpAll, notes: 'Bring updated training logs.' },
    { title: 'Hose Evolution Drill', type: 'Drill', date: d(1, 13), startTime: '18:00', endTime: '21:00', location: 'Station 14 — Drill Yard', organizer: 'Maria Delgado', description: 'Live hose operations — deploy and advance 1¾" and 2½" lines. Focus on water supply relay.', maxAttendees: null, rsvps: rsvpPartial, notes: 'Full PPE and SCBA required.' },
    { title: 'Monthly Drill — Structural Fire', type: 'Drill', date: d(1, 14), startTime: '18:00', endTime: '21:00', location: 'Station 14 — Training Grounds', organizer: 'Maria Delgado', description: 'Structural fire operations with search and rescue emphasis. Zero-visibility drill.', maxAttendees: null, rsvps: rsvpPartial, notes: 'SCBA required. TIC operation.' },
    { title: 'Annual Apparatus Inspection', type: 'Inspection', date: d(1, 20), startTime: '08:00', endTime: '12:00', location: 'Station 14 — Apparatus Bay', organizer: 'Sandra Kim', description: 'State-required annual inspection of Engine 14, Ladder 14, and Rescue 14. Pump tests included.', maxAttendees: null, rsvps: rsvpOfficers, notes: 'All apparatus must be fueled and clean by 07:30.' },
    { title: 'CPR/AED Recertification', type: 'Training', date: d(1, 27), startTime: '09:00', endTime: '13:00', location: 'Station 14 — Training Room', organizer: 'Nathan McGee', description: 'Required CPR/AED recertification for all members. Bring existing card for verification.', maxAttendees: 16, rsvps: rsvpAll, notes: 'Certification cards issued same day.' },

    // ===== FEBRUARY 2026 =====
    { title: 'Monthly Department Meeting', type: 'Meeting', date: d(2, 3), startTime: '19:00', endTime: '20:30', location: 'Station 14 — Apparatus Bay', organizer: 'Sarah Chen', description: 'Monthly business meeting. SOG review and winter incident after-action discussion.', maxAttendees: null, rsvps: rsvpAll, notes: '' },
    { title: 'Monthly Drill — SCBA Confidence', type: 'Drill', date: d(2, 10), startTime: '18:00', endTime: '21:00', location: 'Station 14 — Training Maze', organizer: 'Maria Delgado', description: 'Zero-visibility SCBA drill through training maze. Buddy-pair system. Focus on search patterns.', maxAttendees: 12, rsvps: rsvpPartial, notes: 'Pass SCBA fit test required before participation.' },
    { title: 'Pancake Breakfast Fundraiser', type: 'Fundraiser', date: d(2, 8), startTime: '07:00', endTime: '12:00', location: 'Station 14 — Community Hall', organizer: 'Nathan McGee', description: 'Annual pancake breakfast fundraiser open to the public. Proceeds support training equipment fund.', maxAttendees: null, rsvps: rsvpAll, notes: 'Ticket sales start 06:30. Bring aprons.' },
    { title: "Cupid's Chili Cook-Off", type: 'Fundraiser', date: d(2, 14), startTime: '11:00', endTime: '15:00', location: 'Station 14 — Community Hall', organizer: 'Carlos Ruiz', description: "Valentine's Day chili cook-off — open to public. Entry fee $5, vote for your favorite.", maxAttendees: null, rsvps: rsvpFew, notes: 'Entries must be registered by Feb 10.' },
    { title: 'Fire Prevention Week Planning', type: 'Meeting', date: d(2, 18), startTime: '18:30', endTime: '19:30', location: 'Station 14 — Training Room', organizer: 'Tracy Benson', description: 'Planning session for Fall Fire Prevention Week activities and school visits.', maxAttendees: null, rsvps: rsvpOfficers, notes: '' },
    { title: 'ICS-200 Online Course Deadline', type: 'Training', date: d(2, 28), startTime: '23:59', endTime: '23:59', location: 'Online (FEMA EMI)', organizer: 'Maria Delgado', description: 'Last day to complete ICS-200 online course per county training requirement. Self-paced.', maxAttendees: null, rsvps: rsvpAll, notes: 'Certificate of completion must be submitted to Training Officer.' },
    { title: 'Driver Training — Apparatus Dynamics', type: 'Training', date: d(2, 22), startTime: '14:00', endTime: '17:00', location: 'Station 14 — Apparatus Yard', organizer: 'Kevin Marsh', description: 'Aerial ladder setup, weight distribution, and handling. Driver/Operator I cert renewal.', maxAttendees: 4, rsvps: rsvpDrivers, notes: 'Drivers and driver-in-charge personnel only.' },

    // ===== MARCH 2026 =====
    { title: 'Monthly Department Meeting', type: 'Meeting', date: d(3, 3), startTime: '19:00', endTime: '20:30', location: 'Station 14 — Apparatus Bay', organizer: 'Sarah Chen', description: 'Monthly business meeting. Q1 budget review and spring drill schedule vote.', maxAttendees: null, rsvps: rsvpAll, notes: '' },
    { title: 'Monthly Drill — Ladder Operations', type: 'Drill', date: d(3, 10), startTime: '18:00', endTime: '21:00', location: 'Station 14 — Apparatus Yard', organizer: 'Maria Delgado', description: 'Advanced ladder operations covering extension techniques, rescue scenarios, and safety protocols.', maxAttendees: null, rsvps: rsvpPartial, notes: 'Full PPE required. Weather dependent.' },
    { title: 'Truck Day at Elementary School', type: 'Community Event', date: d(3, 6), startTime: '09:00', endTime: '11:00', location: 'Lincoln Elementary School', organizer: 'Tracy Benson', description: 'Fire truck display and fire safety education for students. Apparatus on-site for tours and photos.', maxAttendees: null, rsvps: rsvpPartial, notes: 'Dress uniform. Arrive 30 min early for setup.' },
    { title: 'Multi-Agency Mass Casualty Drill', type: 'Drill', date: d(3, 8), startTime: '08:00', endTime: '14:00', location: 'Maplewood High School — Parking Lot', organizer: 'Sarah Chen', description: 'County-wide MCI drill with EMS, law enforcement, and mutual aid companies. Simulated bus accident.', maxAttendees: null, rsvps: rsvpAll, notes: 'Report to staging at 07:30. Media will be present.' },
    { title: 'Equipment Inventory Audit', type: 'Inspection', date: d(3, 13), startTime: '10:00', endTime: '14:00', location: 'Station 14 — Equipment Room', organizer: 'Mike Harrington', description: 'Quarterly equipment and supply inventory audit with physical count and system reconciliation.', maxAttendees: null, rsvps: rsvpPartial, notes: 'All crew members should attend their assigned rotation time.' },
    { title: "St. Patrick's Day Parade Detail", type: 'Special Detail', date: d(3, 17), startTime: '10:00', endTime: '14:00', location: 'Main Street, Maplewood — Parade Route', organizer: 'Nathan McGee', description: 'Apparatus and personnel detail for annual parade. Engine 14 and Ladder 14 in procession.', maxAttendees: null, rsvps: rsvpPartial, notes: 'Dress uniform required. Arrive at staging by 09:30.' },
    { title: 'Fire Prevention Demo Prep', type: 'Meeting', date: d(3, 19), startTime: '17:30', endTime: '19:00', location: 'Station 14 — Training Room', organizer: 'Tracy Benson', description: 'Planning and preparation for fire prevention demonstrations for upcoming community events and school visits.', maxAttendees: null, rsvps: rsvpOfficers, notes: '' },
    { title: 'Spring Open House', type: 'Community Event', date: d(3, 22), startTime: '10:00', endTime: '14:00', location: 'Station 14', organizer: 'Tracy Benson', description: 'Annual spring open house. Tours, fire safety demos, junior firefighter activities, and pancake breakfast.', maxAttendees: null, rsvps: rsvpAll, notes: 'Volunteers needed for face painting, tours, and activities. Setup starts 09:00.' },
    { title: 'CPR Class at Community Center', type: 'Training', date: d(3, 11), startTime: '18:00', endTime: '22:00', location: 'Maplewood Community Center', organizer: 'Nathan McGee', description: 'Public CPR and first aid certification class. Open to community members. Lunch break at 20:00.', maxAttendees: 30, rsvps: rsvpPartial, notes: 'Instructors: McGee, Kim. Materials provided.' },
    { title: 'Driver Training — Ladder Operations', type: 'Training', date: d(3, 23), startTime: '14:00', endTime: '17:00', location: 'Station 14 — Apparatus Yard', organizer: 'Maria Delgado', description: 'Aerial ladder setup, extension, and safety procedures training for drivers and operators.', maxAttendees: 6, rsvps: rsvpDrivers, notes: 'Participants must have Driver/Operator I certification.' },
    { title: 'Wildland Fire Ops Training', type: 'Training', date: d(3, 29), startTime: '08:00', endTime: '17:00', location: 'County Training Center', organizer: 'Maria Delgado', description: 'Full-day wildland firefighting operations course. Red card certification eligibility.', maxAttendees: 8, rsvps: rsvpFew, notes: 'Work boots and high-visibility vest required. Lunch provided.' },
    { title: 'Equipment Inspection Day', type: 'Inspection', date: d(3, 31), startTime: '09:00', endTime: '12:00', location: 'Station 14 — Apparatus Bay', organizer: 'Sandra Kim', description: 'Monthly equipment inspection and maintenance check for all apparatus and gear.', maxAttendees: null, rsvps: rsvpPartial, notes: 'Critical items must pass inspection by end of day.' },

    // ===== APRIL 2026 =====
    { title: 'Monthly Department Meeting', type: 'Meeting', date: d(4, 7), startTime: '19:00', endTime: '20:30', location: 'Station 14 — Apparatus Bay', organizer: 'Sarah Chen', description: 'Monthly business meeting. Spring equipment purchases and Q2 training schedule.', maxAttendees: null, rsvps: rsvpAll, notes: '' },
    { title: 'Monthly Drill — Vehicle Extrication', type: 'Drill', date: d(4, 14), startTime: '18:00', endTime: '21:00', location: 'Station 14 — Training Grounds', organizer: 'Maria Delgado', description: 'Vehicle extrication drill with power tools. Door removal, roof evolution, and rescue scenarios.', maxAttendees: null, rsvps: rsvpPartial, notes: 'Jaws of Life and spreaders. PPE required.' },
    { title: 'Hydrant Flow Testing Program', type: 'Inspection', date: d(4, 9), startTime: '08:00', endTime: '12:00', location: 'Various Locations — Maplewood', organizer: 'Sandra Kim', description: 'Quarterly hydrant flow testing and documentation. Water supply reliability assessment.', maxAttendees: null, rsvps: rsvpPartial, notes: 'Crew will visit 15+ hydrants on assigned routes.' },
    { title: 'Fire Safety Demonstration — High School', type: 'Community Event', date: d(4, 16), startTime: '10:00', endTime: '12:00', location: 'Maplewood High School — Gymnasium', organizer: 'Tracy Benson', description: 'Fire safety education demonstration for high school students. Car extrication demo and equipment tour.', maxAttendees: null, rsvps: rsvpPartial, notes: 'Bring demo vehicle. Arrange for student questions.' },
    { title: 'Mutual Aid Drill — County-Wide', type: 'Drill', date: d(4, 18), startTime: '10:00', endTime: '14:00', location: 'County Fairgrounds', organizer: 'Sarah Chen', description: 'Multi-station mutual aid drill. Communication, resource sharing, and unified command.', maxAttendees: null, rsvps: rsvpAll, notes: 'All personnel expected. Uniform of the day: Class B.' },
    { title: 'Hazmat Operations Training', type: 'Training', date: d(4, 20), startTime: '14:00', endTime: '18:00', location: 'Station 14 — Training Room', organizer: 'Nathan McGee', description: 'Refresher on hazardous materials recognition, scene safety, and notification procedures.', maxAttendees: null, rsvps: rsvpAll, notes: 'County hazmat technician will present.' },
    { title: 'Spring Fundraiser — Car Wash', type: 'Fundraiser', date: d(4, 25), startTime: '09:00', endTime: '14:00', location: 'Station 14 — Parking Lot', organizer: 'Carlos Ruiz', description: 'Community car wash fundraiser. $15 per vehicle. Proceeds to equipment replacement fund.', maxAttendees: null, rsvps: rsvpAll, notes: 'Setup starts 08:00. Donate supplies if possible.' },

    // ===== MAY 2026 =====
    { title: 'Monthly Department Meeting', type: 'Meeting', date: d(5, 5), startTime: '19:00', endTime: '20:30', location: 'Station 14 — Apparatus Bay', organizer: 'Sarah Chen', description: 'Monthly business meeting. Summer schedule and training plan finalization.', maxAttendees: null, rsvps: rsvpAll, notes: '' },
    { title: 'Monthly Drill — Rope Rescue', type: 'Drill', date: d(5, 12), startTime: '18:00', endTime: '21:00', location: 'County Fairgrounds — Training Tower', organizer: 'Maria Delgado', description: 'High-angle rope rescue operations. Rigging, anchor points, and victim extraction.', maxAttendees: null, rsvps: rsvpPartial, notes: 'Full harnesses and helmets required. Experienced climbers lead.' },
    { title: 'Spring Inspection — Building Systems', type: 'Inspection', date: d(5, 10), startTime: '09:00', endTime: '12:00', location: 'Station 14 — All Areas', organizer: 'Mike Harrington', description: 'Annual spring building inspection: HVAC, electrical, plumbing, and safety equipment.', maxAttendees: null, rsvps: rsvpPartial, notes: 'County inspector will conduct. Document all findings.' },
    { title: 'Community Safety Expo', type: 'Community Event', date: d(5, 17), startTime: '10:00', endTime: '14:00', location: 'Maplewood Town Square', organizer: 'Tracy Benson', description: 'Community safety expo with fire, EMS, police booths. Home fire safety assessments.', maxAttendees: null, rsvps: rsvpAll, notes: 'Apparatus on display. Handouts and promotional items.' },
    { title: 'Memorial Day Ceremony & All-Staff Drill', type: 'Special Detail', date: d(5, 26), startTime: '08:00', endTime: '14:00', location: 'Station 14 & Veteran\'s Park', organizer: 'Sarah Chen', description: 'Morning: Memorial Day ceremony. Afternoon: All-staff functional drill at station. Full attendance expected.', maxAttendees: null, rsvps: rsvpAll, notes: 'Dress uniform for ceremony. Casual for drill. Bring lunch or catering provided.' },
    { title: 'Advanced EMT Refresher Course', type: 'Training', date: d(5, 19), startTime: '09:00', endTime: '17:00', location: 'Station 14 — Training Room', organizer: 'Lisa Fontaine', description: 'Advanced EMT skills refresher: cardiac rhythms, airway management, medication protocols.', maxAttendees: 10, rsvps: rsvpPartial, notes: 'EMT-P instructors from county EMS. Recertification accepted.' },

    // ===== JUNE 2026 =====
    { title: 'Monthly Department Meeting', type: 'Meeting', date: d(6, 2), startTime: '19:00', endTime: '20:30', location: 'Station 14 — Apparatus Bay', organizer: 'Sarah Chen', description: 'Monthly business meeting. End-of-quarter Q2 review and summer schedule finalization.', maxAttendees: null, rsvps: rsvpAll, notes: '' },
    { title: 'Monthly Drill — Forcible Entry', type: 'Drill', date: d(6, 9), startTime: '18:00', endTime: '21:00', location: 'Station 14 — Training Grounds', organizer: 'Maria Delgado', description: 'Forcible entry techniques: doors, windows, walls. Tactics and tool proficiency.', maxAttendees: null, rsvps: rsvpPartial, notes: 'Pry bars, axes, and power tools. Safety observers assigned.' },
    { title: 'Mid-Year Equipment Audit', type: 'Inspection', date: d(6, 13), startTime: '10:00', endTime: '14:00', location: 'Station 14 — Equipment Room', organizer: 'Mike Harrington', description: 'Mid-year equipment and supply inventory. Identify wear items and replacements needed.', maxAttendees: null, rsvps: rsvpPartial, notes: 'Budget planning for Q3 purchases.' },
    { title: 'Junior Firefighter Academy — Summer Program', type: 'Training', date: d(6, 15), startTime: '09:00', endTime: '17:00', location: 'Station 14 — Training Areas', organizer: 'Nathan McGee', description: 'Week-long summer program for youth (ages 12-18). Fire science basics, apparatus tours, drills.', maxAttendees: 20, rsvps: rsvpAll, notes: 'Sign-up required. First aid kit and refreshments provided.' },
    { title: 'Probationary Firefighter Final Evaluation', type: 'Training', date: d(6, 20), startTime: '08:00', endTime: '12:00', location: 'Station 14 — All Areas', organizer: 'Maria Delgado', description: 'Final practical and written evaluation for probationary members Carlos Ruiz and Amy Winters.', maxAttendees: null, rsvps: rsvpOfficers, notes: 'Pass/Fail determination. Feedback session scheduled.' },
    { title: 'Summer Safety Campaign Kickoff', type: 'Community Event', date: d(6, 22), startTime: '10:00', endTime: '14:00', location: 'Station 14', organizer: 'Tracy Benson', description: 'Launch of summer fire safety campaign. Public open house, safety tips, and giveaways.', maxAttendees: null, rsvps: rsvpAll, notes: 'Volunteers needed for outreach. Free ice cream social.' },
    { title: 'County Firefighters\' Day Parade', type: 'Special Detail', date: d(6, 28), startTime: '09:00', endTime: '13:00', location: 'Main Street, Maplewood — Parade Route', organizer: 'Nathan McGee', description: 'Annual County Firefighters\' Day parade. All apparatus and personnel participate.', maxAttendees: null, rsvps: rsvpAll, notes: 'Dress uniform required. Assembly 08:30 at fire station.' },
  ];

  for (const r of records) {
    await db.create(r, 1);
  }
  console.log(`Events seed complete: ${records.length} inserted.`);
};
