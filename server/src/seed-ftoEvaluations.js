'use strict';
/**
 * seed-ftoEvaluations.js — Demo FTO skill evaluations and field observations.
 * Populates fto_evaluations and fto_observations for the two probationary members:
 * Carlos Ruiz (FTO: Sarah Chen) and Amy Winters (FTO: Maria Delgado).
 *
 * The fto_evaluations and fto_observations tables are self-created by
 * routes/ftoTracker.js, so this seed ensures those tables exist first.
 *
 * Idempotent: skips if fto_evaluations already has data.
 */

const { pool } = require('./db');

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS fto_evaluations (
    id SERIAL PRIMARY KEY,
    station_id INTEGER DEFAULT 1,
    member_id INTEGER NOT NULL,
    skill_id TEXT NOT NULL,
    skill_name TEXT DEFAULT '',
    category TEXT DEFAULT '',
    result TEXT DEFAULT 'Not Evaluated',
    evaluated_by TEXT DEFAULT '',
    evaluated_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT DEFAULT '',
    UNIQUE(station_id, member_id, skill_id)
  );

  CREATE TABLE IF NOT EXISTS fto_observations (
    id SERIAL PRIMARY KEY,
    station_id INTEGER DEFAULT 1,
    member_id INTEGER NOT NULL,
    category TEXT DEFAULT 'General',
    note TEXT NOT NULL,
    observed_by TEXT DEFAULT '',
    observed_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

// FTO skill checklist aligned with IFSTA Firefighter I standards
const SKILLS = [
  // Personal Protective Equipment
  { id: 'ppe-01', name: 'Don/doff full structural PPE within 60 seconds',        category: 'PPE & SCBA' },
  { id: 'ppe-02', name: 'Don SCBA from wall mount in under 60 seconds',           category: 'PPE & SCBA' },
  { id: 'ppe-03', name: 'Don SCBA from seat mount while in moving apparatus',     category: 'PPE & SCBA' },
  { id: 'ppe-04', name: 'Perform SCBA buddy check',                               category: 'PPE & SCBA' },
  { id: 'ppe-05', name: 'Respond correctly to low-air alarm and emergency exit',  category: 'PPE & SCBA' },
  // Hose & Nozzle
  { id: 'hose-01', name: 'Deploy and advance 1¾" attack line — 150 ft',          category: 'Hose & Nozzle' },
  { id: 'hose-02', name: 'Deploy and advance 2½" attack line — 100 ft',          category: 'Hose & Nozzle' },
  { id: 'hose-03', name: 'Connect supply line to hydrant and charge',             category: 'Hose & Nozzle' },
  { id: 'hose-04', name: 'Open/close nozzle, select proper pattern',             category: 'Hose & Nozzle' },
  { id: 'hose-05', name: 'Perform hose load (flat, minuteman, or accordion)',     category: 'Hose & Nozzle' },
  // Search & Rescue
  { id: 'sar-01', name: 'Perform oriented search pattern in zero-visibility',    category: 'Search & Rescue' },
  { id: 'sar-02', name: 'Drag unconscious victim 30 ft via rescue drag',         category: 'Search & Rescue' },
  { id: 'sar-03', name: 'Conduct primary search of single-family structure',      category: 'Search & Rescue' },
  // Ladders
  { id: 'ldr-01', name: 'Carry, raise, and extend 24-ft extension ladder solo',  category: 'Ground Ladders' },
  { id: 'ldr-02', name: 'Deploy roof ladder with hooks',                          category: 'Ground Ladders' },
  { id: 'ldr-03', name: 'Climb ladder while carrying tools',                     category: 'Ground Ladders' },
  // Forcible Entry
  { id: 'fe-01', name: 'Force inward-opening door using flat head axe and Halligan', category: 'Forcible Entry' },
  { id: 'fe-02', name: 'Perform conventional through-the-lock entry',            category: 'Forcible Entry' },
  // Vehicle Operations
  { id: 'veh-01', name: 'Perform daily apparatus inspection and document findings', category: 'Apparatus' },
  { id: 'veh-02', name: 'Demonstrate pump startup and panel operations',          category: 'Apparatus' },
  // EMS
  { id: 'ems-01', name: 'Perform CPR — adult, child, infant',                    category: 'EMS First Response' },
  { id: 'ems-02', name: 'Apply oxygen via NRB mask and BVM',                     category: 'EMS First Response' },
  { id: 'ems-03', name: 'Control bleeding and apply tourniquet',                 category: 'EMS First Response' },
  // Communications
  { id: 'com-01', name: 'Initiate and respond to radio transmissions per SOG',   category: 'Communications' },
  { id: 'com-02', name: 'Activate MAYDAY and provide LUNAR report',             category: 'Communications' },
];

module.exports = async function seedFtoEvaluations() {
  // Ensure tables exist
  await pool.query(INIT_SQL);

  const { rows: check } = await pool.query(
    'SELECT COUNT(*) as c FROM fto_evaluations WHERE station_id = 1'
  );
  if (parseInt(check[0].c) > 0) {
    console.log('FTO evaluations seed: already seeded, skipping.');
    return;
  }

  // Get probationary members
  const { rows: members } = await pool.query(
    `SELECT id, name FROM members WHERE station_id = 1 AND status = 'Probationary' ORDER BY id`
  );
  if (members.length === 0) {
    console.log('FTO evaluations seed: no probationary members found, skipping.');
    return;
  }

  const carlosId = members.find(m => m.name === 'Carlos Ruiz')?.id;
  const amyId    = members.find(m => m.name === 'Amy Winters')?.id;

  // ── Carlos Ruiz evaluations (65% through program — mostly satisfactory) ────
  if (carlosId) {
    const carlosResults = {
      // PPE & SCBA — solid, mostly satisfactory
      'ppe-01': { result: 'Satisfactory',     notes: 'Consistent. Under 55 seconds consistently.' },
      'ppe-02': { result: 'Satisfactory',     notes: 'Good technique. 52 seconds on last eval.' },
      'ppe-03': { result: 'Satisfactory',     notes: 'Improving. Initially struggled, now reliable.' },
      'ppe-04': { result: 'Satisfactory',     notes: 'Thorough buddy checks, no misses.' },
      'ppe-05': { result: 'Remedial Needed',  notes: 'Slow to react to low-air alarm. Required second eval. Passed with coaching.' },
      // Hose — competent
      'hose-01': { result: 'Satisfactory',    notes: 'Good body mechanics. Efficient deployment.' },
      'hose-02': { result: 'Satisfactory',    notes: 'Passed. Needs work on nozzle control at full flow.' },
      'hose-03': { result: 'Satisfactory',    notes: 'Hydrant connection solid. Good communication with pump op.' },
      'hose-04': { result: 'Satisfactory',    notes: 'Pattern selection appropriate for fuel type.' },
      'hose-05': { result: 'Not Evaluated',   notes: '' },
      // S&R
      'sar-01': { result: 'Satisfactory',     notes: 'Good rope technique and crew communication.' },
      'sar-02': { result: 'Satisfactory',     notes: 'Passed all rescue drag scenarios.' },
      'sar-03': { result: 'Satisfactory',     notes: 'Systematic primary search, called clear correctly.' },
      // Ladders
      'ldr-01': { result: 'Satisfactory',     notes: 'Footing and heel angle correct.' },
      'ldr-02': { result: 'Not Evaluated',    notes: '' },
      'ldr-03': { result: 'Satisfactory',     notes: 'Comfortable on ladder. Three-point contact maintained.' },
      // Forcible Entry
      'fe-01': { result: 'Needs Improvement', notes: 'Halligan placement needs work. Not splitting door efficiently. Scheduled re-eval.' },
      'fe-02': { result: 'Not Evaluated',     notes: '' },
      // Apparatus
      'veh-01': { result: 'Satisfactory',     notes: 'Thorough. Catches deficiencies. Documents well.' },
      'veh-02': { result: 'Satisfactory',     notes: 'Engine panel basics solid. Learning relay pumping.' },
      // EMS
      'ems-01': { result: 'Satisfactory',     notes: 'CPR quality good. Rate and depth consistent.' },
      'ems-02': { result: 'Satisfactory',     notes: 'Passed. Good O2 setup and BVM seal.' },
      'ems-03': { result: 'Satisfactory',     notes: 'Tourniquet application within 30 seconds.' },
      // Comms
      'com-01': { result: 'Needs Improvement', notes: 'Radio discipline improving but still occasional dead keying and unclear traffic. Ongoing coaching.' },
      'com-02': { result: 'Not Evaluated',    notes: '' },
    };

    for (const skill of SKILLS) {
      const r = carlosResults[skill.id] || { result: 'Not Evaluated', notes: '' };
      if (r.result === 'Not Evaluated') continue;
      await pool.query(
        `INSERT INTO fto_evaluations (station_id, member_id, skill_id, skill_name, category, result, evaluated_by, notes, evaluated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (station_id, member_id, skill_id) DO NOTHING`,
        [1, carlosId, skill.id, skill.name, skill.category, r.result, 'Sarah Chen', r.notes,
         new Date(Date.now() - Math.floor(Math.random() * 30 + 5) * 24 * 60 * 60 * 1000).toISOString()]
      );
    }

    // Carlos observations
    const carlosObs = [
      { category: 'Initiative',    note: 'Carlos proactively asked to observe pump panel operations during a non-emergency return. Good self-directed learning.', observed_by: 'Sarah Chen', daysAgo: 25 },
      { category: 'Scene Safety',  note: 'On the MVA at Rt. 47, Carlos correctly identified a fuel leak before any officer called it out. Good hazard awareness.', observed_by: 'Sarah Chen', daysAgo: 20 },
      { category: 'Communication', note: 'Radio traffic still needs polish. Keyed up mid-sentence twice. Will practice structured LUNAR format this week.', observed_by: 'Sarah Chen', daysAgo: 15 },
      { category: 'Teamwork',      note: 'Helped Amy Winters with hose load after finishing his own. Good crew mentality.', observed_by: 'Maria Delgado', daysAgo: 12 },
      { category: 'Forcible Entry', note: 'Carlos requested extra reps on the forcible entry prop on off-days. Showing the right attitude to address weakness.', observed_by: 'Sarah Chen', daysAgo: 8 },
      { category: 'General',       note: 'Strong shift today. Carlos led the morning apparatus check without prompting and caught the Engine 2 tire issue first.', observed_by: 'Sarah Chen', daysAgo: 4 },
    ];

    for (const obs of carlosObs) {
      await pool.query(
        `INSERT INTO fto_observations (station_id, member_id, category, note, observed_by, observed_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [1, carlosId, obs.category, obs.note, obs.observed_by,
         new Date(Date.now() - obs.daysAgo * 24 * 60 * 60 * 1000).toISOString()]
      );
    }
  }

  // ── Amy Winters evaluations (55% through — excellent compliance, less experience) ──
  if (amyId) {
    const amyResults = {
      // PPE & SCBA
      'ppe-01': { result: 'Satisfactory',     notes: 'Exceptional. Under 45 seconds every time. Best in recruit class.' },
      'ppe-02': { result: 'Satisfactory',     notes: 'Quick and precise. Excellent procedural compliance.' },
      'ppe-03': { result: 'Satisfactory',     notes: 'Passed on first attempt. Good spatial awareness in tight cab.' },
      'ppe-04': { result: 'Satisfactory',     notes: 'Zero misses on any buddy check eval.' },
      'ppe-05': { result: 'Satisfactory',     notes: 'Calm and methodical response to alarm activation.' },
      // Hose
      'hose-01': { result: 'Satisfactory',    notes: 'Good form. Would benefit from more reps on broken ground.' },
      'hose-02': { result: 'Needs Improvement', notes: 'Struggled with 2½" line weight on stairs. Scheduled re-eval. Physical conditioning needed.' },
      'hose-03': { result: 'Satisfactory',    notes: 'Good. Communication with pump op was clear.' },
      'hose-04': { result: 'Satisfactory',    notes: 'Correct pattern selected for all scenarios.' },
      'hose-05': { result: 'Not Evaluated',   notes: '' },
      // S&R
      'sar-01': { result: 'Satisfactory',     notes: 'Systematic and calm in zero-vis environment.' },
      'sar-02': { result: 'Not Evaluated',    notes: '' },
      'sar-03': { result: 'Satisfactory',     notes: 'Clear verbal announcements during search. Good pattern.' },
      // Ladders
      'ldr-01': { result: 'Not Evaluated',    notes: '' },
      'ldr-02': { result: 'Not Evaluated',    notes: '' },
      'ldr-03': { result: 'Satisfactory',     notes: 'Three-point contact, no issues.' },
      // Forcible Entry
      'fe-01': { result: 'Satisfactory',      notes: 'Good technique on first attempt. Halligan placement correct.' },
      'fe-02': { result: 'Not Evaluated',     notes: '' },
      // Apparatus
      'veh-01': { result: 'Satisfactory',     notes: 'Excellent documentation. Most thorough recruit we have had.' },
      'veh-02': { result: 'Not Evaluated',    notes: '' },
      // EMS
      'ems-01': { result: 'Satisfactory',     notes: 'CPR quality excellent. Rate 105 BPM, depth adequate.' },
      'ems-02': { result: 'Satisfactory',     notes: 'BVM seal tight. O2 setup quick.' },
      'ems-03': { result: 'Satisfactory',     notes: 'Passed. 24-second tourniquet application.' },
      // Comms
      'com-01': { result: 'Satisfactory',     notes: 'Radio traffic clear and concise. Good brevity.' },
      'com-02': { result: 'Not Evaluated',    notes: '' },
    };

    for (const skill of SKILLS) {
      const r = amyResults[skill.id] || { result: 'Not Evaluated', notes: '' };
      if (r.result === 'Not Evaluated') continue;
      await pool.query(
        `INSERT INTO fto_evaluations (station_id, member_id, skill_id, skill_name, category, result, evaluated_by, notes, evaluated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (station_id, member_id, skill_id) DO NOTHING`,
        [1, amyId, skill.id, skill.name, skill.category, r.result, 'Maria Delgado', r.notes,
         new Date(Date.now() - Math.floor(Math.random() * 25 + 5) * 24 * 60 * 60 * 1000).toISOString()]
      );
    }

    // Amy observations
    const amyObs = [
      { category: 'Procedures',   note: 'Amy is the most procedurally compliant recruit I have evaluated. Reads every SOG before each drill.', observed_by: 'Maria Delgado', daysAgo: 22 },
      { category: 'Physical',     note: '2½" hose line is a challenge on stairs. She knows it and asked to do extra weight training. Right mindset.', observed_by: 'Maria Delgado', daysAgo: 17 },
      { category: 'Teamwork',     note: 'Stayed after shift to help reload hose with Carlos. Does not watch the clock.', observed_by: 'Nathan McGee', daysAgo: 13 },
      { category: 'Initiative',   note: 'Completed IFSTA chapters 14–16 independently over the weekend and asked questions at Monday drill. Impressive.', observed_by: 'Maria Delgado', daysAgo: 9 },
      { category: 'General',      note: 'First time on a confirmed working fire (the Oak Ave kitchen fire). Stayed calm, followed orders, good situational awareness for her experience level.', observed_by: 'Maria Delgado', daysAgo: 5 },
    ];

    for (const obs of amyObs) {
      await pool.query(
        `INSERT INTO fto_observations (station_id, member_id, category, note, observed_by, observed_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [1, amyId, obs.category, obs.note, obs.observed_by,
         new Date(Date.now() - obs.daysAgo * 24 * 60 * 60 * 1000).toISOString()]
      );
    }
  }

  const evalCount = await pool.query('SELECT COUNT(*) as c FROM fto_evaluations WHERE station_id = 1');
  const obsCount  = await pool.query('SELECT COUNT(*) as c FROM fto_observations WHERE station_id = 1');
  console.log(`FTO evaluations seed complete: ${evalCount.rows[0].c} evaluations, ${obsCount.rows[0].c} observations inserted.`);
};
