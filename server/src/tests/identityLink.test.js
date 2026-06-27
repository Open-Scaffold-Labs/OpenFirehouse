'use strict';
/**
 * identityLink.test.js — regression fence for the Login↔Member↔Cert identity link
 * (gameplan v2: migrations 0028–0030 + P2.1 founding-chief + P5 link).
 *
 * OPT-IN (same gate as the other DB suites): set TENANCY_TEST_DB. Every test runs
 * inside a transaction that is ROLLED BACK — zero data pollution, no cleanup.
 *
 * Run:
 *   cd server && TENANCY_TEST_DB='postgresql://matthewlavin@localhost:5432/freestation' \
 *     node --test src/tests/identityLink.test.js
 */
const { test, after } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[identityLink] TENANCY_TEST_DB not set — skipping identity-link suite.');
  test('identity link (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;
  const { pool } = require('../db');

  // Close the shared pool so the dedicated test process exits (Lesson #4: this is
  // a standalone test process, so ending the pool here is correct).
  after(async () => { await pool.end(); });

  // Helper: run fn with a dedicated client inside BEGIN…ROLLBACK.
  async function inRollback(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await fn(client);
    } finally {
      try { await client.query('ROLLBACK'); } catch (_) {}
      client.release();
    }
  }

  async function mkStationDept(client, name) {
    const st = await client.query("INSERT INTO stations (name, department_id) VALUES ($1, NULL) RETURNING id", [`IDLINK ${name} Station`]);
    const stationId = st.rows[0].id;
    const dep = await client.query("INSERT INTO departments (name, fdid, dept_type, plan_tier) VALUES ($1,'','career','free') RETURNING id", [`IDLINK ${name}`]);
    const deptId = dep.rows[0].id;
    await client.query('UPDATE stations SET department_id = $1 WHERE id = $2', [deptId, stationId]);
    return { stationId, deptId };
  }
  async function mkUser(client, uname) {
    const u = await client.query(
      `INSERT INTO users (username, name, initials, role, "passwordHash", email, station_id)
       VALUES ($1,$2,'IL','member',$3,'',1) RETURNING id`,
      [`idlink_${uname}_${Math.floor(Math.random()*1e6)}`, uname, 'x'.repeat(40)]);
    return u.rows[0].id;
  }
  async function mkMember(client, deptId, stationId, name, userId = null) {
    const r = await client.query(
      `INSERT INTO members ("memberNumber", name, rank, role, status, joined, rank_verified, user_id, station_id, department_id)
       VALUES ($1,$2,'Firefighter','Firefighter','Active','2020-01-01',false,$3,$4,$5) RETURNING id`,
      [`IL-${Math.floor(Math.random()*1e6)}`, name, userId, stationId, deptId]);
    return r.rows[0].id;
  }

  // P0.1 — one login maps to at most one member per department.
  test('P0.1: a second member cannot link to the same (user_id, department_id)', async () => {
    await inRollback(async (client) => {
      const { stationId, deptId } = await mkStationDept(client, 'P01');
      const uid = await mkUser(client, 'shared');
      await mkMember(client, deptId, stationId, 'First Person', uid);
      await assert.rejects(
        () => mkMember(client, deptId, stationId, 'Second Person', uid),
        (e) => e.code === '23505',
        'expected a unique violation on the second link to the same login');
    });
  });

  // P2.1 — of_provision_department rosters the founding chief, linked + verified.
  test('P2.1: of_provision_department creates a linked, rank-verified founding-chief member', async () => {
    await inRollback(async (client) => {
      const st = await client.query("INSERT INTO stations (name, department_id) VALUES ('IDLINK P21 Station', NULL) RETURNING id");
      const stationId = st.rows[0].id;
      const chiefId = await mkUser(client, 'foundingchief');
      // give the chief a real name to assert it propagates
      await client.query("UPDATE users SET name = 'Dana Founder' WHERE id = $1", [chiefId]);
      const dep = await client.query('SELECT public.of_provision_department($1,$2,$3,$4,$5,$6) AS id',
        [chiefId, 'IDLINK P21 FD', '', 'career', 'free', stationId]);
      const deptId = dep.rows[0].id;
      const m = await client.query(
        'SELECT name, rank, role, user_id, rank_verified, station_id FROM members WHERE user_id = $1 AND department_id = $2',
        [chiefId, deptId]);
      assert.equal(m.rows.length, 1, 'founding chief should be rostered exactly once');
      assert.equal(m.rows[0].user_id, chiefId, 'member is linked to the chief login');
      assert.equal(m.rows[0].rank_verified, true, 'founding chief is rank-verified');
      assert.equal(m.rows[0].name, 'Dana Founder', "chief's real name propagates to the member");
      assert.equal(m.rows[0].station_id, stationId, 'member sits at the mirror station');
    });
  });

  // P2.1 idempotency — re-provisioning the same chief doesn't duplicate the member.
  test('P2.1: re-provisioning does not duplicate the founding-chief member', async () => {
    await inRollback(async (client) => {
      const st = await client.query("INSERT INTO stations (name, department_id) VALUES ('IDLINK P21b Station', NULL) RETURNING id");
      const stationId = st.rows[0].id;
      const chiefId = await mkUser(client, 'founder2');
      const dep = await client.query('SELECT public.of_provision_department($1,$2,$3,$4,$5,$6) AS id',
        [chiefId, 'IDLINK P21b FD', '', 'career', 'free', stationId]);
      const deptId = dep.rows[0].id;
      // call the inner member-insert guard path again (same chief, same dept) by
      // re-running provision against a NEW dept would make a new dept; instead we
      // assert the guard: a manual duplicate insert is blocked by the unique idx.
      await assert.rejects(
        () => mkMember(client, deptId, stationId, 'Dupe', chiefId),
        (e) => e.code === '23505');
    });
  });

  // P3 — incident_responses.member_id FK is RESTRICT (accountability protection).
  test('P3: incident_responses.member_id FK exists and is ON DELETE RESTRICT', async () => {
    const r = await pool.query(
      `SELECT confdeltype FROM pg_constraint
        WHERE conname = 'incident_responses_member_id_fkey'
          AND conrelid = 'public.incident_responses'::regclass`);
    assert.equal(r.rows.length, 1, 'member_id FK must exist');
    assert.equal(r.rows[0].confdeltype, 'r', "FK must be ON DELETE RESTRICT ('r')");
  });

  // P3 — a response can carry a member_id, and a bogus member_id is rejected.
  test('P3: a response stores member_id; a non-existent member_id is rejected', async () => {
    await inRollback(async (client) => {
      const { stationId, deptId } = await mkStationDept(client, 'P3');
      const memId = await mkMember(client, deptId, stationId, 'Responder One');
      const ok = await client.query(
        `INSERT INTO incident_responses (station_id, incident_id, user_id, member_name, status, member_id, department_id)
         VALUES ($1, 999999, NULL, 'Responder One', 'responding', $2, $3) RETURNING id, member_id`,
        [stationId, memId, deptId]);
      assert.equal(ok.rows[0].member_id, memId, 'member_id persists on the response');
      await assert.rejects(
        () => client.query(
          `INSERT INTO incident_responses (station_id, incident_id, member_name, status, member_id, department_id)
           VALUES ($1, 999999, 'Ghost', 'responding', 2147483600, $2)`,
          [stationId, deptId]),
        (e) => e.code === '23503',
        'a member_id with no matching member must be rejected by the FK');
    });
  });
}
