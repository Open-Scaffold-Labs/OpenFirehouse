'use strict';
/**
 * seed-departments-demo.js — Multi-tenant test data in the DEPARTMENT shape.
 *
 * Phase 1 of the multi-tenant gameplan. Seeds TWO departments so the
 * department hierarchy (department → station/house → unit/apparatus → crew)
 * has realistic test data and the two-tenant attack suite can run as two real
 * departments:
 *
 *   • Bayonne Fire Department — a multi-station metro dept (7 houses, ~11
 *     units). Station 2 = Tower Ladder 1 + Engine 2 is the one CONFIRMED real
 *     data point (Matt); the rest is an APPROXIMATION per §9 Q1 (Dale,
 *     2026-06-12) — Matt corrects later. It exists to exercise the
 *     multi-station shape, not as a system of record.
 *   • Demo VFD — a deliberately tiny 1-station volunteer dept, the isolation
 *     foil (the "other tenant").
 *
 * Tenant model (post-EXPAND): every row carries BOTH department_id (the tenant)
 * and station_id (the physical house). Apparatus is tagged with the house it
 * lives in AND the owning department.
 *
 * IDEMPOTENT — re-runnable. Upserts on the per-department natural keys created
 * by migration 0004 (idx_apparatus_dept_designation, idx_members_dept_number).
 * Does NOT touch the existing station_id=1 test department or wipe anything.
 *
 * EXPLICIT INVOCATION ONLY — not wired into boot/runSeeds. Run by hand:
 *   node server/src/seed-departments-demo.js
 * or require + call seedDepartmentsDemo() from a script.
 *
 * Per CLAUDE.md: module.exports + a require.main standalone guard; never call
 * pool.end() on the shared pool unless run as a standalone script.
 */

const db = require('./db');
const pool = db.pool;
const bcrypt = require('bcrypt');

// ── Department definitions ────────────────────────────────────────────────
const BAYONNE = {
  name: 'Bayonne Fire Department',
  fdid: '', dept_type: 'career', plan_tier: 'METRO',
  // house → units. Station 2 confirmed; rest approximated (§9 Q1).
  stations: [
    { name: 'Station 1', address: '14 W 36th St',     units: [['Engine 1','Engine'], ['Rescue 1','Rescue']] },
    { name: 'Station 2', address: '5 E 22nd St',       units: [['Tower Ladder 1','Ladder'], ['Engine 2','Engine']] }, // CONFIRMED
    { name: 'Station 3', address: '3 W 5th St',         units: [['Engine 3','Engine']] },
    { name: 'Station 4', address: 'foot of W 25th St',  units: [['Ladder 2','Ladder'], ['Engine 4','Engine']] },
    { name: 'Station 5', address: '1 Newark Bay',       units: [['Engine 5','Engine']] },
    { name: 'Station 6', address: '598 Ave C',          units: [['Squad 6','Rescue']] },
    { name: 'Station 7', address: '1 Port Terminal',    units: [['Engine 7','Engine'], ['Battalion 1','Command']] },
  ],
  members: [
    { num: 'B-001', name: 'Frank Russo',    rank: 'Fire Chief',  role: 'chief',   station: 'Station 1' },
    { num: 'B-002', name: 'Gina Almeida',   rank: 'Captain',     role: 'officer', station: 'Station 2' },
    { num: 'B-003', name: 'Marcus Webb',    rank: 'Captain',     role: 'officer', station: 'Station 4' },
    { num: 'B-004', name: 'Dion Carter',    rank: 'Firefighter', role: 'member',  station: 'Station 2' },
    { num: 'B-005', name: 'Priya Nair',     rank: 'Firefighter/EMT', role: 'member', station: 'Station 1' },
    { num: 'B-006', name: 'Tom Mancuso',    rank: 'Driver/Engineer', role: 'member', station: 'Station 3' },
  ],
  // login for the chief — maps into of_user_departments.
  chiefLogin: { username: 'bayonne_chief', name: 'Frank Russo' },
};

const DEMO_VFD = {
  name: 'Demo VFD',
  fdid: '', dept_type: 'volunteer', plan_tier: 'CAREER_SMALL',
  stations: [
    { name: 'Main Station', address: '1 Volunteer Way', units: [['Engine 1','Engine'], ['Tanker 1','Tanker']] },
  ],
  members: [
    { num: 'D-001', name: 'Pat Halloran', rank: 'Chief', role: 'chief', station: 'Main Station' },
  ],
  chiefLogin: { username: 'demo_vfd_chief', name: 'Pat Halloran' },
};

async function upsertDepartment(d) {
  const found = await pool.query('SELECT id FROM departments WHERE name = $1', [d.name]);
  if (found.rows.length) {
    await pool.query('UPDATE departments SET dept_type=$2, plan_tier=$3 WHERE id=$1', [found.rows[0].id, d.dept_type, d.plan_tier]);
    return found.rows[0].id;
  }
  const ins = await pool.query(
    `INSERT INTO departments (name, fdid, dept_type, plan_tier) VALUES ($1,$2,$3,$4) RETURNING id`,
    [d.name, d.fdid, d.dept_type, d.plan_tier]
  );
  return ins.rows[0].id;
}

async function upsertStation(name, address, deptId) {
  const found = await pool.query('SELECT id FROM stations WHERE name = $1 AND department_id = $2', [name, deptId]);
  if (found.rows.length) return found.rows[0].id;
  const ins = await pool.query(
    `INSERT INTO stations (name, address, city, state, department_id) VALUES ($1,$2,'Bayonne','NJ',$3) RETURNING id`,
    [name, address, deptId]
  );
  return ins.rows[0].id;
}

async function seedOneDept(d) {
  const deptId = await upsertDepartment(d);
  const stationIds = {};
  for (const s of d.stations) {
    const sid = await upsertStation(s.name, s.address, deptId);
    stationIds[s.name] = sid;
    for (const [designation, type] of s.units) {
      await pool.query(
        `INSERT INTO apparatus (designation, type, year, status, station_id, department_id)
         VALUES ($1,$2,$3,'In Service',$4,$5)
         ON CONFLICT (department_id, designation)
         DO UPDATE SET station_id = EXCLUDED.station_id, type = EXCLUDED.type`,
        [designation, type, 2015, stationIds[s.name], deptId]
      );
    }
  }
  for (const m of d.members) {
    await pool.query(
      `INSERT INTO members ("memberNumber", name, rank, role, status, joined, station_id, department_id, certifications)
       VALUES ($1,$2,$3,$4,'Active','2015-01-01',$5,$6,'[]')
       ON CONFLICT (department_id, "memberNumber")
       DO UPDATE SET name = EXCLUDED.name, rank = EXCLUDED.rank, station_id = EXCLUDED.station_id`,
      [m.num, m.name, m.rank, m.role, stationIds[m.station], deptId]
    );
  }
  // Chief login + of_user_departments membership.
  const primaryStation = stationIds[d.members[0].station];
  const hash = bcrypt.hashSync('changeme-' + d.chiefLogin.username, 10);
  const initials = d.chiefLogin.name.split(/\s+/).map(s => s[0] || '').join('').toUpperCase().slice(0, 4) || 'CH';
  const u = await pool.query(
    `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
     VALUES ($1,$2,$3,'chief',$4,$5)
     ON CONFLICT (username) DO UPDATE SET station_id = EXCLUDED.station_id, role = 'chief'
     RETURNING id`,
    [d.chiefLogin.username, d.chiefLogin.name, initials, hash, primaryStation]
  );
  await pool.query(
    `INSERT INTO of_user_departments (user_id, department_id, role)
     VALUES ($1,$2,'chief') ON CONFLICT (user_id, department_id) DO UPDATE SET role = 'chief'`,
    [u.rows[0].id, deptId]
  );
  return { deptId, stations: Object.keys(stationIds).length, units: d.stations.reduce((n, s) => n + s.units.length, 0), members: d.members.length };
}

async function seedDepartmentsDemo() {
  // EXPAND must have run (departments + department_id columns). ensureDb covers
  // it on a normal app DB; guard with a clear message if not.
  const has = await pool.query("SELECT to_regclass('public.departments') AS t");
  if (!has.rows[0].t) {
    throw new Error('departments table missing — run initDb/migration 0004 (EXPAND) before this seed.');
  }
  const bay = await seedOneDept(BAYONNE);
  const demo = await seedOneDept(DEMO_VFD);
  console.log(`[seed-departments-demo] Bayonne FD: dept ${bay.deptId}, ${bay.stations} houses, ${bay.units} units, ${bay.members} members`);
  console.log(`[seed-departments-demo] Demo VFD: dept ${demo.deptId}, ${demo.stations} house, ${demo.units} units, ${demo.members} member`);
  console.log('[seed-departments-demo] done (idempotent — safe to re-run).');
  return { bay, demo };
}

module.exports = seedDepartmentsDemo;

if (require.main === module) {
  seedDepartmentsDemo()
    .then(async () => { await pool.end(); })
    .catch(async (e) => { console.error('[seed-departments-demo] FAILED:', e.message); await pool.end(); process.exit(1); });
}
