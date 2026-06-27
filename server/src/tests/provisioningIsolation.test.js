'use strict';
/**
 * provisioningIsolation.test.js — P4 provisioning & onboarding attack harness.
 *
 * Complements tenancyIsolation.test.js (same OPT-IN gate: set TENANCY_TEST_DB).
 * Guards the P4 provisioning surface. RED-FIRST: assertions that need P4
 * endpoints are marked `todo` and become real as P4.1-P4.4 land. The
 * privilege-escalation regression runs TODAY — it is the RED baseline that
 * P4.1's `REVOKE INSERT/UPDATE/DELETE ON of_user_departments FROM of_app`
 * (+ routing mapping writes through SECURITY DEFINER fns) turns GREEN.
 *
 * Run locally:
 *   cd server && TENANCY_TEST_DB='postgresql://matthewlavin@localhost:5432/freestation' \
 *     node --test src/tests/provisioningIsolation.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[provisioningIsolation] TENANCY_TEST_DB not set — skipping P4 provisioning suite.');
  test('P4 provisioning isolation (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('P4 provisioning & onboarding — isolation + privilege-escalation regressions', async (t) => {
    const { pool } = require('../db');
    const MARK = 'P4-PROV';
    let httpServer = null; // booted lazily for the P4.3 HTTP gates; closed in finally

    async function cleanup() {
      // FK-safe teardown for BOTH the SQL-built P4-PROV rows and the P4ISO depts
      // created via the real signup + onboarding endpoints. P4.4 adds members
      // (with GENERATED usernames, not the p4iso_ prefix), their linked logins,
      // invites, and exposure records. Order: members first (CASCADEs their
      // exposure_records + of_member_invites), then apparatus, then mappings +
      // users (prefixed chiefs AND generated member-users), then stations, then
      // departments (stations→departments is NO ACTION, so stations go first).
      const depts = (await pool.query(`SELECT id FROM departments WHERE name LIKE '${MARK}%' OR name LIKE 'P4ISO%'`)).rows.map(r => r.id);
      const memberUserIds = depts.length
        ? (await pool.query('SELECT user_id FROM members WHERE department_id = ANY($1) AND user_id IS NOT NULL', [depts])).rows.map(r => r.user_id)
        : [];
      if (depts.length) {
        // 0016 flipped exposure_records + personnel_actions to ON DELETE RESTRICT,
        // so they no longer cascade — clear them explicitly before the member rows.
        // (of_member_invites + the operational child tables are still CASCADE.)
        await pool.query('DELETE FROM exposure_records  WHERE member_id IN (SELECT id FROM members WHERE department_id = ANY($1))', [depts]);
        await pool.query('DELETE FROM personnel_actions WHERE member_id IN (SELECT id FROM members WHERE department_id = ANY($1))', [depts]);
        await pool.query('DELETE FROM members WHERE department_id = ANY($1)', [depts]); // CASCADEs of_member_invites + operational child rows
        await pool.query('DELETE FROM apparatus WHERE department_id = ANY($1)', [depts]);
      }
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'p4prov\\_%' OR username LIKE 'p4iso\\_%')`);
      if (memberUserIds.length) await pool.query('DELETE FROM of_user_departments WHERE user_id = ANY($1)', [memberUserIds]);
      await pool.query(`DELETE FROM users WHERE username LIKE 'p4prov\\_%' OR username LIKE 'p4iso\\_%'`);
      if (memberUserIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1)', [memberUserIds]);
      if (depts.length) await pool.query('DELETE FROM stations WHERE department_id = ANY($1)', [depts]);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%' OR name LIKE 'P4ISO%'`);
    }

    // Preconditions: this suite exercises the P5 enforced-RLS model (the of_app
    // role + dept policies). On a legacy/fresh-install DB without it (e.g. a CI
    // bootstrap that never ran migrations 0006/0007), skip cleanly rather than error.
    const pre = (await pool.query(`SELECT
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname='of_app') AS has_of_app,
      EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='of_user_departments') AS has_oud,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='departments' AND column_name='plan_tier') AS has_plan_tier`)).rows[0];
    if (!pre.has_of_app || !pre.has_oud || !pre.has_plan_tier) {
      console.log(`[provisioningIsolation] skipping live assertions — enforced-RLS env not present ` +
        `(of_app=${pre.has_of_app}, of_user_departments=${pre.has_oud}, plan_tier=${pre.has_plan_tier}).`);
      await pool.end();
      t.skip('requires the P5 enforced-RLS environment (of_app role + dept schema)');
      return;
    }

    try {
      await cleanup();

      // Two throwaway departments; userA legitimately belongs to dept A only.
      const deptA = (await pool.query(
        `INSERT INTO departments (name, plan_tier) VALUES ('${MARK} Dept A', 'independent') RETURNING id`)).rows[0].id;
      const deptB = (await pool.query(
        `INSERT INTO departments (name, plan_tier) VALUES ('${MARK} Dept B', 'independent') RETURNING id`)).rows[0].id;
      const userA = (await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
         VALUES ('p4prov_a', 'P4 Prov A', 'PA', 'member', 'x', $1) RETURNING id`, [deptA])).rows[0].id;
      await pool.query(
        `INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1, $2, 'member')`,
        [userA, deptA]);

      // ───────────────────────────────────────────────────────────────────────
      // SECURITY REGRESSION #1 — of_user_departments privilege escalation.
      // The dept_isolation policy WITH CHECK constrains ONLY user_id (verified
      // prod + local). As of_app, an authenticated user (app.user_id = their id)
      // can INSERT a row binding themselves to ANY department as 'chief' —
      // self-escalation — while of_app retains INSERT on the table. P4.1 closes
      // this by REVOKEing of_app's write + routing mapping writes through the
      // SECURITY DEFINER fns. This asserts the SECURE end-state.
      // ───────────────────────────────────────────────────────────────────────
      // GATING (promoted from red-baseline todo once migration 0012 shipped): of_app
      // must NOT be able to self-bind a user to another department. If this fails,
      // 0012's `REVOKE INSERT/UPDATE/DELETE ON of_user_departments FROM of_app`
      // regressed — the escalation hole is open again.
      await t.test('of_app cannot self-bind a user to another department (0012 REVOKE gate)',
        async () => {
        const client = await pool.connect();
        let escalated = false;
        let denialReason = null;
        try {
          await client.query('BEGIN');
          await client.query('SET LOCAL ROLE of_app');
          await client.query(`SELECT set_config('app.user_id', $1, true)`, [String(userA)]);
          await client.query(`SELECT set_config('app.department_id', $1, true)`, [String(deptA)]);
          await client.query(
            `INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1, $2, 'chief')`,
            [userA, deptB]);
          escalated = true; // reached here ⇒ the cross-dept insert was ALLOWED
        } catch (e) {
          denialReason = e.code || e.message; // expected post-P4.1 (42501 insufficient_privilege)
        } finally {
          await client.query('ROLLBACK').catch(() => {});
          client.release();
        }
        assert.strictEqual(escalated, false,
          'PRIVILEGE ESCALATION OPEN: of_app inserted a cross-department of_user_departments row ' +
          '(userA→deptB as chief). Apply P4.1: REVOKE INSERT/UPDATE/DELETE ON of_user_departments ' +
          `FROM of_app; route mapping writes through SECURITY DEFINER fns. [denialReason=${denialReason}]`);
      });

      // ───────────────────────────────────────────────────────────────────────
      // SECURITY REGRESSION #2 — legal-record FKs must NOT cascade (0016).
      // exposure_records + personnel_actions are subpoenable. Under CASCADE a
      // member hard-DELETE destroyed that history; 0016 flipped both to RESTRICT
      // so the DB itself refuses to delete a member with legal records still
      // attached (defense-in-depth on top of the app's deactivate-never-delete
      // rule). This gate fails loudly if either ever regresses to CASCADE.
      // ───────────────────────────────────────────────────────────────────────
      await t.test('legal-record FKs (exposure_records, personnel_actions) are ON DELETE RESTRICT, not CASCADE', async () => {
        const r = await pool.query(`
          SELECT conname, CASE confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
                                  WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION' END AS on_delete
          FROM pg_constraint
          WHERE conname IN ('exposure_records_member_id_fkey', 'personnel_actions_member_id_fkey')`);
        const byName = Object.fromEntries(r.rows.map(x => [x.conname, x.on_delete]));
        assert.strictEqual(byName['exposure_records_member_id_fkey'], 'RESTRICT',
          'exposure_records→members must be ON DELETE RESTRICT (subpoenable legal records)');
        assert.strictEqual(byName['personnel_actions_member_id_fkey'], 'RESTRICT',
          'personnel_actions→members must be ON DELETE RESTRICT (legal records)');
      });

      // ───────────────────────────────────────────────────────────────────────
      // ENDPOINT-DEPENDENT assertions — over real HTTP, with two departments stood
      // up through the ACTUAL signup endpoint (gameplan §8: "both depts via the
      // real P4 endpoints, not seeds").
      // ───────────────────────────────────────────────────────────────────────
      // [P4.2] signup isolation + no-orphan are real gates in provisioningSignup.test.js.

      // Boot the real Express app once for the P4.3 cross-tenant gates. unref the
      // app's timers so they don't keep the test process alive.
      process.env.P4_SIGNUP = 'on';
      const realSetInterval = global.setInterval;
      global.setInterval = (...args) => {
        const tmr = realSetInterval(...args);
        if (tmr && typeof tmr.unref === 'function') tmr.unref();
        return tmr;
      };
      let app;
      try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
      httpServer = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      const base = `http://127.0.0.1:${httpServer.address().port}`;
      async function api(method, path, token, body) {
        const res = await fetch(base + path, {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        let json = null;
        try { json = await res.json(); } catch { /* non-JSON */ }
        return { status: res.status, json };
      }
      // wait for the lazy-init DB gate
      for (let i = 0; i < 30; i++) {
        try { const r = await fetch(`${base}/api/setup-status`); if (r.status === 200) break; }
        catch { /* warming up */ }
        await new Promise((r2) => setTimeout(r2, 1000));
      }

      // Two departments via the real signup endpoint → a chief token each.
      const sgnA = await api('POST', '/api/auth/signup', null, {
        departmentName: 'P4ISO Dept A', chiefUsername: 'p4iso_a', chiefName: 'ISO Chief A', chiefEmail: 'isoa@p4iso.test',
        chiefPassword: 'correct-horse-battery', attestedMembers: 10, attestedStations: 1, attestedBudgetUsd: 100000 });
      const sgnB = await api('POST', '/api/auth/signup', null, {
        departmentName: 'P4ISO Dept B', chiefUsername: 'p4iso_b', chiefName: 'ISO Chief B', chiefEmail: 'isob@p4iso.test',
        chiefPassword: 'correct-horse-battery', attestedMembers: 10, attestedStations: 1, attestedBudgetUsd: 100000 });
      assert.strictEqual(sgnA.status, 201, `signup A failed: ${JSON.stringify(sgnA.json)}`);
      assert.strictEqual(sgnB.status, 201, `signup B failed: ${JSON.stringify(sgnB.json)}`);
      const tokenA = sgnA.json.token, tokenB = sgnB.json.token;

      // A's mirror station (its first house) + a rig created under A.
      const aStations = await api('GET', '/api/stations', tokenA);
      assert.strictEqual(aStations.status, 200, 'A can list its own stations');
      assert.ok(aStations.json.data.length >= 1, 'A has at least its mirror station');
      const stationA = aStations.json.data[0].id;
      const mkRig = await api('POST', '/api/apparatus', tokenA, { designation: 'ISO-ENG-1', type: 'Engine', year: 2020 });
      assert.strictEqual(mkRig.status, 201, `A can create a rig: ${JSON.stringify(mkRig.json)}`);
      const apparatusA = mkRig.json.data.id;

      await t.test('Dept B chief cannot read/mutate Dept A stations [P4.3]', async () => {
        const list = await api('GET', '/api/stations', tokenB);
        assert.strictEqual(list.status, 200);
        assert.ok(!list.json.data.some((s) => Number(s.id) === Number(stationA)),
          "B's station list must not contain A's house");
        assert.strictEqual((await api('GET', `/api/stations/${stationA}`, tokenB)).status, 404,
          "B cannot read A's station by id");
        assert.strictEqual((await api('PATCH', `/api/stations/${stationA}`, tokenB, { name: 'PWNED' })).status, 404,
          "B cannot patch A's station");
        assert.strictEqual((await api('DELETE', `/api/stations/${stationA}`, tokenB)).status, 404,
          "B cannot delete A's station");
        const after = (await pool.query('SELECT name FROM stations WHERE id = $1', [stationA])).rows[0];
        assert.notStrictEqual(after.name, 'PWNED', "A's station must be untouched by B");
      });

      await t.test('Dept B chief cannot read/mutate Dept A apparatus [P4.3]', async () => {
        const list = await api('GET', '/api/apparatus', tokenB);
        assert.strictEqual(list.status, 200);
        assert.ok(!list.json.data.some((a) => Number(a.id) === Number(apparatusA)),
          "B's apparatus list must not contain A's rig");
        assert.strictEqual((await api('GET', `/api/apparatus/${apparatusA}`, tokenB)).status, 404,
          "B cannot read A's rig by id");
        assert.strictEqual((await api('PATCH', `/api/apparatus/${apparatusA}`, tokenB, { notes: 'pwned' })).status, 404,
          "B cannot patch A's rig");
        assert.strictEqual((await api('DELETE', `/api/apparatus/${apparatusA}`, tokenB)).status, 404,
          "B cannot delete A's rig");
        const after = (await pool.query('SELECT notes FROM apparatus WHERE id = $1', [apparatusA])).rows[0];
        assert.notStrictEqual(after.notes, 'pwned', "A's rig must be untouched by B");
      });

      // P4.4 onboarding: A's chief adds a member, invites them, the member redeems
      // the invite (sets a password + logs in) — all through the real endpoints.
      const mkMember = await api('POST', '/api/members', tokenA, { name: 'Pat Rookie', rank: 'Firefighter', role: 'Firefighter', joined: '2026-01-01' });
      assert.strictEqual(mkMember.status, 201, `A can add a member: ${JSON.stringify(mkMember.json)}`);
      const memberA = mkMember.json.data.id;
      const inv = await api('POST', `/api/members/${memberA}/invite`, tokenA);
      assert.strictEqual(inv.status, 201, `A can invite the member: ${JSON.stringify(inv.json)}`);
      const acc = await api('POST', '/api/auth/accept-invite', null, { token: inv.json.data.token, password: 'rookie-correct-horse' });
      assert.strictEqual(acc.status, 200, `member redeems invite + sets password: ${JSON.stringify(acc.json)}`);
      const memberToken = acc.json.token;

      await t.test('pending/unverified member has zero elevated access [P4.4]', async () => {
        // Logged in but unverified (role pinned to 'member'): every chief surface refuses.
        assert.strictEqual((await api('GET', '/api/members/pending', memberToken)).status, 403,
          'unverified member cannot read the verification queue');
        assert.strictEqual((await api('POST', `/api/members/${memberA}/invite`, memberToken)).status, 403,
          'unverified member cannot issue invites');
        assert.strictEqual((await api('POST', `/api/members/${memberA}/verify`, memberToken, { rank: 'Chief' })).status, 403,
          'unverified member cannot self-promote via verify');
        const u = (await pool.query('SELECT role FROM users WHERE id = (SELECT user_id FROM members WHERE id=$1)', [memberA])).rows[0];
        assert.strictEqual(u.role, 'member', 'invited member is pinned to the lowest role until verified');
      });

      await t.test('Dept B chief cannot verify/link a Dept A member [P4.4]', async () => {
        assert.strictEqual((await api('POST', `/api/members/${memberA}/verify`, tokenB, { rank: 'Captain' })).status, 404,
          "B's chief cannot verify A's member (cross-dept → 404)");
        assert.strictEqual((await api('POST', `/api/members/${memberA}/invite`, tokenB)).status, 404,
          "B's chief cannot invite/link A's member");
        const m = (await pool.query('SELECT rank_verified FROM members WHERE id=$1', [memberA])).rows[0];
        assert.strictEqual(m.rank_verified, false, "A's member stays unverified after B's attempts");
      });

      await t.test('chief verification elevates the member role; member can then log in [P4.4]', async () => {
        const v = await api('POST', `/api/members/${memberA}/verify`, tokenA, { rank: 'Captain' });
        assert.strictEqual(v.status, 200, `chief verifies the member: ${JSON.stringify(v.json)}`);
        assert.strictEqual(v.json.data.rank_verified, true, 'member is now verified');
        const u = (await pool.query('SELECT role FROM users WHERE id = (SELECT user_id FROM members WHERE id=$1)', [memberA])).rows[0];
        assert.strictEqual(u.role, 'officer', "Captain maps to officer-level users.role");
        // the password the member set at accept-invite actually works for login
        const login = await api('POST', '/api/auth/login', null, { username: (await pool.query('SELECT username FROM users WHERE id=(SELECT user_id FROM members WHERE id=$1)', [memberA])).rows[0].username, password: 'rookie-correct-horse' });
        assert.strictEqual(login.status, 200, 'member logs in with the password they set at accept-invite');
      });

      await t.test('member removal deactivates; legal records survive (no hard delete) [P4.4]', async () => {
        // Give the member a subpoenable exposure record, then "remove" them.
        const dept = (await pool.query('SELECT department_id FROM members WHERE id=$1', [memberA])).rows[0].department_id;
        const exp = await pool.query(
          `INSERT INTO exposure_records (member_id, station_id, exposure_date, exposure_type, department_id)
           VALUES ($1, $2, '2026-06-15', 'smoke', $3) RETURNING id`,
          [memberA, stationA, dept]
        );
        const exposureId = exp.rows[0].id;

        const del = await api('DELETE', `/api/members/${memberA}`, tokenA);
        assert.strictEqual(del.status, 200, 'DELETE deactivates (does not hard-delete)');

        const m = (await pool.query('SELECT id, status FROM members WHERE id=$1', [memberA])).rows;
        assert.strictEqual(m.length, 1, 'member row STILL EXISTS (deactivated, not deleted)');
        assert.strictEqual(m[0].status, 'Inactive', 'member is marked Inactive');
        const survived = (await pool.query('SELECT id FROM exposure_records WHERE id=$1', [exposureId])).rows;
        assert.strictEqual(survived.length, 1, 'the exposure record (legal) survives deactivation');
      });

      await t.test('self-claim: valid join code creates a pending member in the right dept; invalid rejected [P4.4]', async () => {
        // Chief A issues a join code; a new member self-registers with it.
        const gen = await api('POST', '/api/departments/join-code', tokenA);
        assert.strictEqual(gen.status, 201, `chief generates a join code: ${JSON.stringify(gen.json)}`);
        const code = gen.json.data.code;
        assert.ok(code && code.length >= 6, 'a join code is returned once');

        const join = await api('POST', '/api/auth/join', null, {
          joinCode: code, username: 'p4iso_join', password: 'joiner-correct-horse', name: 'Jo Joiner', requestedRank: 'Firefighter',
        });
        assert.strictEqual(join.status, 201, `self-claim succeeds: ${JSON.stringify(join.json)}`);
        assert.strictEqual(join.json.pending, true, 'self-claimed member is flagged pending');
        const joinToken = join.json.token;

        // Lands in dept A only, unverified, lowest role, zero elevated reach.
        const deptA = (await pool.query("SELECT id FROM departments WHERE name='P4ISO Dept A'")).rows[0].id;
        const m = (await pool.query("SELECT department_id, rank_verified FROM members WHERE user_id=(SELECT id FROM users WHERE username='p4iso_join')")).rows[0];
        assert.strictEqual(Number(m.department_id), Number(deptA), 'self-claimed member belongs to dept A');
        assert.strictEqual(m.rank_verified, false, 'self-claimed member is unverified');
        assert.strictEqual((await api('GET', '/api/members/pending', joinToken)).status, 403,
          'self-claimed member has zero elevated reach until a chief verifies');

        // An invalid code is rejected (no account created).
        const bad = await api('POST', '/api/auth/join', null, {
          joinCode: 'BADCODE9', username: 'p4iso_badjoin', password: 'whatever-correct-horse', name: 'No One',
        });
        assert.strictEqual(bad.status, 400, 'invalid join code is rejected');
      });

    } finally {
      await cleanup();
      if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
      await pool.end(); // dedicated test process — Lesson #4 (seeds) does not apply
    }
  });
}
