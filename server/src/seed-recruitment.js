'use strict';
const { recruitment: db } = require('./db');

const records = [
  {
    name: 'Kevin Marsh', phone: '(555) 301-7741', email: 'tbarton@email.com',
    address: '88 Maple Court, Maplewood, OH 44302', dob: '1998-04-15',
    source: 'Community Event', recruiter: 'Nathan McGee',
    stage: 'Background Check', dateAdded: '2026-01-10',
    stageHistory: [
      { stage: 'Prospect',          date: '2026-01-10', notes: 'Met at open house. Very enthusiastic.' },
      { stage: 'Applied',           date: '2026-01-18', notes: 'Application received and reviewed.' },
      { stage: 'Background Check',  date: '2026-02-01', notes: 'Submitted to county sheriff.' },
    ],
    checklist: { application: true, background: false, references: true, interview: false, physical: false, orientation: false, gear: false, scba_fit: false, member_added: false },
    notes: 'Strong candidate. Works as an EMT-B at Mercy Hospital. Eager to join operations.',
    interviewDate: '', physicalDate: '', orientationDate: '',
  },
  {
    name: 'Tracy Benson', phone: '(555) 302-5588', email: 'tbenson22@gmail.com',
    address: '14 Birchwood Lane, Maplewood, OH 44302', dob: '2001-09-22',
    source: 'Referral — Member', recruiter: 'Sandra Kim',
    stage: 'Interview', dateAdded: '2026-01-22',
    stageHistory: [
      { stage: 'Prospect',          date: '2026-01-22', notes: 'Referred by Sandra Kim.' },
      { stage: 'Applied',           date: '2026-01-28', notes: 'Application on file.' },
      { stage: 'Background Check',  date: '2026-02-05', notes: 'Cleared by county.' },
      { stage: 'Interview',         date: '2026-02-20', notes: 'Interview scheduled with Chief and Lt. McGee.' },
    ],
    checklist: { application: true, background: true, references: true, interview: false, physical: false, orientation: false, gear: false, scba_fit: false, member_added: false },
    notes: 'College student studying Emergency Management. Prior volunteer experience in another county.',
    interviewDate: '2026-03-10', physicalDate: '', orientationDate: '',
  },
  {
    name: 'Carlos Ruiz', phone: '(555) 303-9012', email: 'cwalsh1995@yahoo.com',
    address: '229 Oak Street, Maplewood, OH 44302', dob: '1995-12-03',
    source: 'Website / Online', recruiter: 'Sarah Chen',
    stage: 'Orientation', dateAdded: '2025-11-05',
    stageHistory: [
      { stage: 'Prospect',           date: '2025-11-05', notes: 'Online inquiry via department website.' },
      { stage: 'Applied',            date: '2025-11-12', notes: 'Full application submitted.' },
      { stage: 'Background Check',   date: '2025-11-20', notes: 'Cleared.' },
      { stage: 'Interview',          date: '2025-12-02', notes: 'Excellent interview. Prior military (Army).' },
      { stage: 'Physical / Medical', date: '2025-12-15', notes: 'Passed NFPA 1582 physical.' },
      { stage: 'Orientation',        date: '2026-01-08', notes: 'Orientation started. Two sessions remaining.' },
    ],
    checklist: { application: true, background: true, references: true, interview: true, physical: true, orientation: false, gear: true, scba_fit: false, member_added: false },
    notes: 'Prior Army combat medic. Has FF I from Texas — checking transferability with OSFM.',
    interviewDate: '2025-12-02', physicalDate: '2025-12-15', orientationDate: '2026-01-08',
  },
  {
    name: 'Maria Delgado', phone: '(555) 304-2233', email: 'dfoley@email.com',
    address: '671 Cedar Ridge Drive, Maplewood, OH 44302', dob: '1990-06-17',
    source: 'Ride-Along', recruiter: 'Nathan McGee',
    stage: 'Probationary Member', dateAdded: '2025-09-14',
    stageHistory: [
      { stage: 'Prospect',             date: '2025-09-14', notes: 'Completed ride-along. Requested application same day.' },
      { stage: 'Applied',              date: '2025-09-20', notes: 'Application submitted.' },
      { stage: 'Background Check',     date: '2025-09-28', notes: 'Cleared.' },
      { stage: 'Interview',            date: '2025-10-10', notes: 'Passed. Strong community ties.' },
      { stage: 'Physical / Medical',   date: '2025-10-22', notes: 'Passed physical.' },
      { stage: 'Orientation',          date: '2025-11-03', notes: 'Completed all 4 orientation sessions.' },
      { stage: 'Probationary Member',  date: '2025-11-10', notes: 'Sworn in. Added to Member Roster (ID: MVF-011).' },
    ],
    checklist: { application: true, background: true, references: true, interview: true, physical: true, orientation: true, gear: true, scba_fit: true, member_added: true },
    notes: 'Completed probationary period on track. Enrolled in FF I class starting April.',
    interviewDate: '2025-10-10', physicalDate: '2025-10-22', orientationDate: '2025-11-03',
  },
  {
    name: 'Sarah Chen', phone: '(555) 305-6677', email: 'meverett77@gmail.com',
    address: '34 Pinecrest Road, Maplewood, OH 44302', dob: '1977-03-29',
    source: 'Referral — Family', recruiter: 'Sandra Kim',
    stage: 'Prospect', dateAdded: '2026-02-28',
    stageHistory: [
      { stage: 'Prospect', date: '2026-02-28', notes: 'Brother-in-law of Mike Harrington. Expressed interest at February meeting.' },
    ],
    checklist: { application: false, background: false, references: false, interview: false, physical: false, orientation: false, gear: false, scba_fit: false, member_added: false },
    notes: 'Construction supervisor. Strong physically. Has not yet submitted an application.',
    interviewDate: '', physicalDate: '', orientationDate: '',
  },
  {
    name: 'Diane Tolliver', phone: '(555) 306-8844', email: 'rnguyen_fire@outlook.com',
    address: '102 Elm View Court, Maplewood, OH 44302', dob: '2003-08-11',
    source: 'Career Fair / School', recruiter: 'Sarah Chen',
    stage: 'Withdrawn', dateAdded: '2025-10-01',
    stageHistory: [
      { stage: 'Prospect',  date: '2025-10-01', notes: 'Met at high school career fair.' },
      { stage: 'Applied',   date: '2025-10-15', notes: 'Application received.' },
      { stage: 'Withdrawn', date: '2025-12-01', notes: 'Moved out of state for college. May reapply.' },
    ],
    checklist: { application: true, background: false, references: false, interview: false, physical: false, orientation: false, gear: false, scba_fit: false, member_added: false },
    notes: 'Left for out-of-state university. Chief wrote her a recommendation letter. Open to return.',
    interviewDate: '', physicalDate: '', orientationDate: '',
  },
];

module.exports = async function seedRecruitment() {
  const existing = await db.all(1);
  if (existing.length > 0) {
    console.log('Recruitment seed: already seeded, skipping.');
  } else {
    for (const r of records) { await db.create(r, 1); }
    console.log(`Recruitment seed complete: ${records.length} inserted.`);
  }
};
