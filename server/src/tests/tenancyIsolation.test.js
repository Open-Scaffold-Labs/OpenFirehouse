'use strict';
// Tenancy-isolation live-DB suite (Dale roadmap 1.3) — proves at the API level
// that a station-B user cannot read or mutate station-A (station 1) rows.
//
// This is the dynamic companion to tenancyGuard.test.js (static analysis).
// It boots the real Express app in-process against a REAL Postgres database
// and fires actual HTTP requests with two JWTs — one user in station 1, one
// in a second station — asserting every cross-tenant read returns nothing and
// every cross-tenant write is a 404/no-op verified by direct SQL.
//
// It is OPT-IN: without TENANCY_TEST_DB set the whole suite is skipped, so CI
// without a database stays green. Run it for real with:
//
//   cd server && TENANCY_TEST_DB='postgresql://matthewlavin@localhost:5432/freestation' \
//     node --test src/tests/tenancyIsolation.test.js
//
// Route families covered: incidents, members, grievances, exposure-records,
// and — added with the W2.5 line-by-line audit (2026-06-10 late) — the exact
// families whose cross-tenant holes that audit fixed: vacancy-fill writes,
// knox-keys access logging, ng911 call reads/conversion, training-AI member
// enumeration, active-resources writes, and messages recipient injection.
// (The narrative-drafts family was removed 2026-06-10 along with all AI
// narrative generation — officers write incident narratives directly.)
//
// P0 expansion (2026-06-12, multi-tenant gameplan Phase 0): a data-driven
// matrix adds apparatus, training, dept-documents, sogs, budget-lines,
// hydrants, investigations, personnel-actions, wellness, nfirs-reports,
// pre-plans, station-log, timesheets, leave, attachments — plus custom
// cad-alerts (list/read/clear) and export/all (full-department export)
// attacks. 27 families total.
//
// Fixture hygiene: every fixture row carries the TEN-ISO marker and is removed
// in a finally block (pre-cleaned at start too, so a crashed previous run never
// poisons this one). The test station ("TEN-ISO Station B …") intentionally
// REMAINS so repeated runs reuse it. Audit-log rows written by the server while
// recording the blocked attempts are deliberately kept — the audit trail is
// append-only by project doctrine and those rows are evidence, not litter.

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  // No DB provided (normal CI path) — skip cleanly and loudly.
  console.log('[tenancyIsolation] TENANCY_TEST_DB not set — skipping live tenancy-isolation suite.');
  test('tenancy isolation (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  // Must be set BEFORE requiring index.js/db.js — db.js builds its pool from
  // DATABASE_URL at require time, and dotenv (loaded inside index.js) never
  // overrides an already-set env var.
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('DB-level tenancy isolation — station B cannot read or mutate station A rows', async (t) => {
    // index.js's module graph starts module-level keep-alive timers (e.g. the
    // old SSE heartbeat, since retired). In the real server those are
    // wanted; in a one-shot test process they hold the event loop open forever
    // after the suite finishes. Unref every timer created during app load so
    // the process can exit once the tests (and cleanup) are done.
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      const tmr = realSetInterval(...args);
      if (tmr && typeof tmr.unref === 'function') tmr.unref();
      return tmr;
    };
    let app;                                          // exports the Express app (Vercel pattern)
    try {
      app = require('../index');
    } finally {
      global.setInterval = realSetInterval;
    }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    // Required AFTER index.js so dotenv has run — guarantees the test signs
    // with the exact secret the server verifies against.
    const { ACCESS_SECRET } = require('../config/jwtSecret');

    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;

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
      try { json = await res.json(); } catch { /* non-JSON body */ }
      return { status: res.status, json };
    }

    const MARK = 'TEN-ISO';
    async function cleanupFixtures() {
      // FK-safe order. exposure_records.member_id cascades from members, but
      // delete explicitly anyway; incidents delete is safe because
      // exposure_records.incident_id is ON DELETE SET NULL.
      const counts = {};
      const sweeps = [
        ['exposure_records',    `DELETE FROM exposure_records WHERE reported_by = '${MARK}'`],
        ['grievances',          `DELETE FROM grievances WHERE grievance_number LIKE '${MARK}%'`],
        ['incidents',           `DELETE FROM incidents WHERE "incidentNumber" LIKE '${MARK}%'`],
        ['vacancy_fill',        `DELETE FROM vacancy_fill WHERE shift_name LIKE '${MARK}%'`],
        ['knox_access_log',     `DELETE FROM knox_access_log WHERE knox_box_id IN (SELECT id FROM knox_boxes WHERE box_number LIKE '${MARK}%')`],
        ['knox_boxes',          `DELETE FROM knox_boxes WHERE box_number LIKE '${MARK}%'`],
        ['ng911_calls',         `DELETE FROM ng911_calls WHERE call_id LIKE '${MARK}%'`],
        ['active_resources',    `DELETE FROM active_resources WHERE unit_designation LIKE '${MARK}%'`],
        ['messages',            `DELETE FROM messages WHERE subject LIKE '${MARK}%'`],
        // P0 matrix families (2026-06-12) — all fixtures carry the MARK in a text column
        ['cad_alerts',          `DELETE FROM cad_alerts WHERE alert_id LIKE '${MARK}%'`],
        // P0 round-2 families (2026-06-12)
        ['shifts',              `DELETE FROM shifts WHERE notes LIKE '${MARK}%'`],
        ['mutual_aid',          `DELETE FROM mutual_aid WHERE notes LIKE '${MARK}%'`],
        ['mutual_aid_agreements', `DELETE FROM mutual_aid_agreements WHERE partner_agency LIKE '${MARK}%'`],
        // fi_violations first — FK to fi_inspections is ON DELETE RESTRICT (0047).
        ['fi_violations',       `DELETE FROM fi_violations WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '${MARK}%')`],
        ['fi_inspections',      `DELETE FROM fi_inspections WHERE notes LIKE '${MARK}%'`],
        ['fi_permits',          `DELETE FROM fi_permits WHERE notes LIKE '${MARK}%'`],
        ['fi_properties',       `DELETE FROM fi_properties WHERE name LIKE '${MARK}%'`],
        ['recall_events',       `DELETE FROM recall_events WHERE message LIKE '${MARK}%'`],
        ['workflow_tasks',      `DELETE FROM workflow_tasks WHERE title LIKE '${MARK}%'`],
        ['run_lists',           `DELETE FROM run_lists WHERE payload::text LIKE '%${MARK}%'`],
        ['apparatus',           `DELETE FROM apparatus WHERE designation LIKE '${MARK}%'`],
        ['training',            `DELETE FROM training WHERE "courseName" LIKE '${MARK}%'`],
        ['dept_documents',      `DELETE FROM dept_documents WHERE title LIKE '${MARK}%'`],
        ['sogs',                `DELETE FROM sogs WHERE title LIKE '${MARK}%'`],
        ['budget_lines',        `DELETE FROM budget_lines WHERE "lineNumber" LIKE '${MARK}%'`],
        ['hydrants',            `DELETE FROM hydrants WHERE "hydrantNumber" LIKE '${MARK}%'`],
        ['investigations',      `DELETE FROM investigations WHERE "caseNumber" LIKE '${MARK}%'`],
        ['personnel_actions',   `DELETE FROM personnel_actions WHERE action_type LIKE '${MARK}%'`],
        ['wellness',            `DELETE FROM wellness WHERE "memberName" LIKE '${MARK}%'`],
        ['nfirs_reports',       `DELETE FROM nfirs_reports WHERE "incidentNumber" LIKE '${MARK}%'`],
        ['pre_plans',           `DELETE FROM pre_plans WHERE "occupancyName" LIKE '${MARK}%'`],
        ['station_log',         `DELETE FROM station_log WHERE "officerOnDuty" LIKE '${MARK}%'`],
        ['timesheets',          `DELETE FROM timesheets WHERE notes LIKE '${MARK}%'`],
        ['leave_requests',      `DELETE FROM leave_requests WHERE "memberName" LIKE '${MARK}%'`],
        ['attachments',         `DELETE FROM attachments WHERE file_name LIKE '${MARK}%'`],
        ['members',             `DELETE FROM members WHERE "memberNumber" LIKE '${MARK}%'`],
        // exam_assignments FK to exams(exam_id) AND users(user_id) — delete it
        // before exams AND before the ten_iso users sweep below.
        ['exam_assignments',    `DELETE FROM exam_assignments WHERE exam_id IN (SELECT id FROM exams WHERE title LIKE '${MARK}%')`],
        ['exams',               `DELETE FROM exams WHERE title LIKE '${MARK}%'`],
        ['users',               `DELETE FROM users WHERE username LIKE 'ten_iso_%'`],
      ];
      for (const [name, sql] of sweeps) {
        try {
          const r = await pool.query(sql);
          counts[name] = r.rowCount;
        } catch (e) {
          counts[name] = `cleanup error: ${e.message}`;
        }
      }
      return counts;
    }

    try {
      // ── Wait for the lazy-init DB gate (first /api request triggers ensureDb) ──
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try {
          const r = await fetch(`${base}/api/setup-status`);
          if (r.status === 200) { ready = true; break; }
        } catch { /* server warming up */ }
        await new Promise((r2) => setTimeout(r2, 1000));
      }
      assert.ok(ready, 'DB never became ready (lazy init gate kept failing)');

      // ── Pre-clean leftovers from any previous crashed run ──────────────────
      await cleanupFixtures();

      // ── Station B: find-or-create (intentionally persistent across runs) ───
      const stationBName = 'TEN-ISO Station B (tenancy test)';
      let stationB;
      {
        const found = await pool.query('SELECT id FROM stations WHERE name = $1', [stationBName]);
        if (found.rows.length) {
          stationB = found.rows[0].id;
        } else {
          const ins = await pool.query(
            `INSERT INTO stations (name, fdid, city, state) VALUES ($1, '', '', '') RETURNING id`,
            [stationBName]
          );
          stationB = ins.rows[0].id;
        }
      }
      assert.notStrictEqual(Number(stationB), 1, 'test station must not be station 1');

      // Ensure the victim station (id=1) exists. Boot seeds run in the background
      // (index.js), so in the shared-DB suite this setup can reach here before the
      // seeded station lands — and the seeded station may not be id=1 anyway. The
      // isolation assertions below are unchanged; this only guarantees the
      // station-1 fixture rows have a parent station to reference.
      await pool.query(
        `INSERT INTO stations (id, name, fdid, city, state)
         VALUES (1, 'TEN-ISO Victim Station', '', '', '') ON CONFLICT (id) DO NOTHING`
      );

      // ── Two REAL users (requireAuth does db.users.findById on every request,
      //    and stationId comes from the DB row — exactly the path under test) ─
      async function upsertUser(username, stationId) {
        const r = await pool.query(
          `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
           VALUES ($1, $2, 'TI', 'chief', 'not-a-real-hash', $3)
           ON CONFLICT (username) DO UPDATE SET station_id = EXCLUDED.station_id, role = 'chief'
           RETURNING id`,
          [username, `Tenancy Test ${username}`, stationId]
        );
        return r.rows[0].id;
      }
      const userAId = await upsertUser('ten_iso_user_a', 1);
      const userBId = await upsertUser('ten_iso_user_b', stationB);

      const sign = (id, username) =>
        jwt.sign({ sub: id, username, role: 'chief' }, ACCESS_SECRET, { expiresIn: '15m' });
      const tokenA = sign(userAId, 'ten_iso_user_a'); // station 1 — the victim tenant
      const tokenB = sign(userBId, 'ten_iso_user_b'); // station B — the attacker tenant

      // ── Station-1 fixture rows (direct SQL, one per route family) ──────────
      const inc = (await pool.query(
        `INSERT INTO incidents ("incidentNumber", date, type, notes, station_id)
         VALUES ('${MARK}-INC-1', '2026-06-10', 'Test Call', 'original notes', 1) RETURNING id`
      )).rows[0].id;

      const mem = (await pool.query(
        `INSERT INTO members ("memberNumber", name, rank, role, status, joined, station_id)
         VALUES ('${MARK}-M-1', 'Tenancy Fixture Member', 'Firefighter', 'member', 'Active', '2020-01-01', 1)
         RETURNING id`
      )).rows[0].id;

      const grv = (await pool.query(
        `INSERT INTO grievances (station_id, grievance_number, subject, description)
         VALUES (1, '${MARK}-GR-1', 'original subject', 'fixture') RETURNING id`
      )).rows[0].id;

      const exp = (await pool.query(
        `INSERT INTO exposure_records (member_id, station_id, exposure_date, exposure_type, substance, reported_by)
         VALUES ($1, 1, '2026-06-10', 'Chemical', 'original-substance', '${MARK}') RETURNING id`,
        [mem]
      )).rows[0].id;

      const idsOf = (json) => (json?.data || []).map((r) => Number(r.id));

      // ════════════════════ incidents ════════════════════
      await t.test('incidents: station B cannot see or mutate a station-1 incident', async () => {
        // Positive control — station A sees its own row (proves the harness works).
        const ctrl = await api('GET', `/api/incidents/${inc}`, tokenA);
        assert.strictEqual(ctrl.status, 200, 'control: station A must read its own incident');

        const list = await api('GET', '/api/incidents', tokenB);
        assert.strictEqual(list.status, 200);
        assert.ok(!idsOf(list.json).includes(Number(inc)), 'station-1 incident leaked into station-B list');

        const one = await api('GET', `/api/incidents/${inc}`, tokenB);
        assert.strictEqual(one.status, 404, 'cross-tenant GET /:id must 404');

        const patch = await api('PATCH', `/api/incidents/${inc}`, tokenB, { notes: 'pwned-by-station-b' });
        assert.strictEqual(patch.status, 404, 'cross-tenant PATCH must 404');

        const del = await api('DELETE', `/api/incidents/${inc}`, tokenB);
        assert.strictEqual(del.status, 404, 'cross-tenant DELETE must 404');

        const row = (await pool.query('SELECT notes, deleted_at FROM incidents WHERE id = $1', [inc])).rows[0];
        assert.strictEqual(row.notes, 'original notes', 'incident notes were mutated cross-tenant');
        assert.strictEqual(row.deleted_at, null, 'incident was soft-deleted cross-tenant');
      });

      // ════════════════════ members ════════════════════
      await t.test('members: station B cannot see or mutate a station-1 member', async () => {
        const ctrl = await api('GET', `/api/members/${mem}`, tokenA);
        assert.strictEqual(ctrl.status, 200, 'control: station A must read its own member');

        const list = await api('GET', '/api/members', tokenB);
        assert.strictEqual(list.status, 200);
        assert.ok(!idsOf(list.json).includes(Number(mem)), 'station-1 member leaked into station-B list');

        const one = await api('GET', `/api/members/${mem}`, tokenB);
        assert.strictEqual(one.status, 404, 'cross-tenant GET /:id must 404');

        const patch = await api('PATCH', `/api/members/${mem}`, tokenB, { name: 'Pwned Name' });
        assert.strictEqual(patch.status, 404, 'cross-tenant PATCH must 404');

        const del = await api('DELETE', `/api/members/${mem}`, tokenB);
        assert.strictEqual(del.status, 404, 'cross-tenant DELETE must 404');

        const row = (await pool.query('SELECT name FROM members WHERE id = $1', [mem])).rows[0];
        assert.ok(row, 'member row was hard-deleted cross-tenant');
        assert.strictEqual(row.name, 'Tenancy Fixture Member', 'member name was mutated cross-tenant');
      });

      // ════════════════════ grievances ════════════════════
      await t.test('grievances: station B cannot see or mutate a station-1 grievance', async () => {
        const ctrl = await api('GET', `/api/grievances/${grv}`, tokenA);
        assert.strictEqual(ctrl.status, 200, 'control: station A must read its own grievance');

        const list = await api('GET', '/api/grievances', tokenB);
        assert.strictEqual(list.status, 200);
        assert.ok(!idsOf(list.json).includes(Number(grv)), 'station-1 grievance leaked into station-B list');

        const one = await api('GET', `/api/grievances/${grv}`, tokenB);
        assert.strictEqual(one.status, 404, 'cross-tenant GET /:id must 404');

        // PATCH route returns rows[0] || {} — the contract is "no row, no leak".
        const patch = await api('PATCH', `/api/grievances/${grv}`, tokenB, { subject: 'pwned subject' });
        assert.ok(patch.status < 500, `PATCH errored: ${patch.status}`);
        assert.strictEqual(patch.json?.id, undefined, 'cross-tenant PATCH leaked the row back');

        // DELETE route answers ok:true unconditionally — the DB is the proof.
        const del = await api('DELETE', `/api/grievances/${grv}`, tokenB);
        assert.ok(del.status < 500, `DELETE errored: ${del.status}`);

        const row = (await pool.query('SELECT subject, deleted_at FROM grievances WHERE id = $1', [grv])).rows[0];
        assert.strictEqual(row.subject, 'original subject', 'grievance subject was mutated cross-tenant');
        assert.strictEqual(row.deleted_at, null, 'grievance was soft-deleted cross-tenant');
      });

      // ════════════════════ exposure-records ════════════════════
      await t.test('exposure-records: station B cannot see or mutate a station-1 record', async () => {
        const ctrl = await api('GET', '/api/exposure-records', tokenA);
        assert.strictEqual(ctrl.status, 200);
        assert.ok(idsOf(ctrl.json).includes(Number(exp)), 'control: station A must see its own exposure record');

        const list = await api('GET', '/api/exposure-records', tokenB);
        assert.strictEqual(list.status, 200);
        assert.ok(!idsOf(list.json).includes(Number(exp)), 'station-1 exposure record leaked into station-B list');

        const patch = await api('PATCH', `/api/exposure-records/${exp}`, tokenB, { substance: 'pwned-substance' });
        assert.ok(patch.status < 500, `PATCH errored: ${patch.status}`);
        assert.strictEqual(patch.json?.data?.id, undefined, 'cross-tenant PATCH leaked the row back');

        const del = await api('DELETE', `/api/exposure-records/${exp}`, tokenB);
        assert.ok(del.status < 500, `DELETE errored: ${del.status}`);

        const row = (await pool.query('SELECT substance, deleted_at FROM exposure_records WHERE id = $1', [exp])).rows[0];
        assert.strictEqual(row.substance, 'original-substance', 'exposure substance was mutated cross-tenant');
        assert.strictEqual(row.deleted_at, null, 'exposure record was soft-deleted cross-tenant');
      });
      // ═══════════ W2.5 regression families (added 2026-06-10 late) ═══════════
      // Fixtures for these are created through the API as station A — the same
      // code path real departments use — so schema drift can't silently break
      // the fixtures.

      // ════════════════════ vacancies (1.4 — replaces vacancy-fill) ════════════════════
      await t.test('vacancies: station B cannot fill/cancel a station-1 vacancy', async () => {
        const created = await api('POST', '/api/vacancies', tokenA, { shift_date: '2026-06-10', position_name: `${MARK}-POS` });
        assert.strictEqual(created.status, 201, 'control: station A creates its vacancy');
        const vid = created.json.data.id;

        // Guarded engine updates find no row in the attacker's department → 409
        // VACANCY_NOT_OPEN (never a 200, never a leak of the row's existence state).
        const fill = await api('POST', `/api/vacancies/${vid}/fill`, tokenB, { member_id: 999 });
        assert.strictEqual(fill.status, 409, 'cross-tenant fill must be refused');

        const cancel = await api('POST', `/api/vacancies/${vid}/cancel`, tokenB, { reason: 'pwned' });
        assert.strictEqual(cancel.status, 409, 'cross-tenant cancel must be refused');

        // The retired island stays retired: the old route is gone entirely.
        const legacy = await api('POST', '/api/vacancy-fill', tokenA, { shift_date: '2026-06-10' });
        assert.strictEqual(legacy.status, 404, 'retired /api/vacancy-fill must not resurface');

        const row = (await pool.query('SELECT status FROM vacancies WHERE id = $1', [vid])).rows[0];
        assert.strictEqual(row.status, 'open', 'vacancy status was mutated cross-tenant');
        await pool.query(`DELETE FROM vacancies WHERE id = $1`, [vid]);
      });

      // ════════════════════ knox-keys ════════════════════
      await t.test('knox-keys: station B cannot read or log against a station-1 box', async () => {
        const created = await api('POST', '/api/knox-keys', tokenA, { box_number: `${MARK}-BOX-1`, address: '1 Test Way' });
        assert.strictEqual(created.status, 201, 'control: station A creates its knox box');
        const kid = created.json.data.id;

        // Owner read-back: the department-scoped read must still find the box
        // for its owner. Guards against a NULL department_id on this lazily-
        // created table making the flipped read return nothing (which would let
        // the cross-tenant 404s below pass vacuously).
        const ownerGet = await api('GET', `/api/knox-keys/${kid}`, tokenA);
        assert.strictEqual(ownerGet.status, 200, 'control: station A must read its own knox box back (department_id populated)');

        const one = await api('GET', `/api/knox-keys/${kid}`, tokenB);
        assert.strictEqual(one.status, 404, 'cross-tenant GET /:id must 404');

        const access = await api('POST', `/api/knox-keys/${kid}/access`, tokenB, { accessed_by: 'Station B Attacker' });
        assert.strictEqual(access.status, 404, 'cross-tenant access log must 404');

        const inspection = await api('POST', `/api/knox-keys/${kid}/inspection`, tokenB, { inspected_by: 'Attacker', inspection_date: '2026-06-10' });
        assert.strictEqual(inspection.status, 404, 'cross-tenant inspection must 404');

        const logList = await api('GET', `/api/knox-keys/${kid}/access`, tokenB);
        assert.ok((logList.json?.data || []).length === 0, 'cross-tenant access-log read leaked rows');

        const logs = (await pool.query('SELECT COUNT(*)::int AS c FROM knox_access_log WHERE knox_box_id = $1', [kid])).rows[0];
        assert.strictEqual(logs.c, 0, 'an access-log row was written against the foreign box');
      });

      // ════════════════════ ng911 ════════════════════
      await t.test('ng911: station B cannot read or convert a station-1 call', async () => {
        const created = await api('POST', '/api/ng911/call', tokenA, { call_id: `${MARK}-CALL-1`, caller_name: 'Private Caller', caller_phone: '555-0100' });
        assert.strictEqual(created.status, 201, 'control: station A ingests its call');
        const cid = created.json.data.id;
        assert.strictEqual(Number(created.json.data.station_id), 1, 'call must land in station 1, not a hardcoded default');

        // Owner read-back (de-vacuums the cross-tenant 404 below; see knox).
        const ownerGet = await api('GET', `/api/ng911/calls/${cid}`, tokenA);
        assert.strictEqual(ownerGet.status, 200, 'control: station A must read its own ng911 call back (department_id populated)');

        const one = await api('GET', `/api/ng911/calls/${cid}`, tokenB);
        assert.strictEqual(one.status, 404, 'cross-tenant call read (911 caller PII) must 404');

        const convert = await api('POST', `/api/ng911/calls/${cid}/create-incident`, tokenB);
        assert.strictEqual(convert.status, 404, 'cross-tenant create-incident must 404');

        const row = (await pool.query('SELECT incident_created FROM ng911_calls WHERE id = $1', [cid])).rows[0];
        assert.strictEqual(row.incident_created, false, 'call was converted cross-tenant');
      });

      // ════════════════════ training-ai (member enumeration) ════════════════════
      await t.test('training-ai: station B cannot enumerate station-1 personnel', async () => {
        // /recommend with a station-1 member id must 404 for station B (the
        // W2.5 fix for cross-tenant personnel-record reads by id enumeration).
        const rec = await api('POST', '/api/training-ai/recommend', tokenB, { memberId: mem });
        assert.strictEqual(rec.status, 404, 'cross-tenant /recommend must 404 (was: returned full training history)');

        // /gaps for station B must not contain the station-1 fixture member.
        const gaps = await api('GET', '/api/training-ai/gaps', tokenB);
        assert.strictEqual(gaps.status, 200);
        assert.ok(!JSON.stringify(gaps.json).includes('Tenancy Fixture Member'),
          'station-1 member name leaked into station-B training gaps');
      });

      // ════════════════════ active-resources ════════════════════
      await t.test('active-resources: station B cannot update or clear a station-1 resource', async () => {
        const created = await api('POST', '/api/active-resources', tokenA, { unit_designation: `${MARK}-E99`, status: 'dispatched' });
        assert.strictEqual(created.status, 201, 'control: station A creates its resource');
        const rid = created.json.data.id;

        const patch = await api('PATCH', `/api/active-resources/${rid}`, tokenB, { status: 'cleared', notes: 'pwned' });
        assert.strictEqual(patch.status, 404, 'cross-tenant PATCH must 404');

        const del = await api('DELETE', `/api/active-resources/${rid}`, tokenB);
        assert.strictEqual(del.status, 404, 'cross-tenant clear must 404');

        const row = (await pool.query('SELECT status FROM active_resources WHERE id = $1', [rid])).rows[0];
        assert.strictEqual(row.status, 'dispatched', 'resource status was mutated cross-tenant');
      });

      // ════════════════════ messages (recipient injection) ════════════════════
      await t.test('messages: station B cannot inject into a station-1 inbox', async () => {
        // Control: station A can message itself.
        const ctrl = await api('POST', '/api/messages', tokenA, { recipients: ['ten_iso_user_a'], subject: `${MARK} control`, body: 'hello' });
        assert.strictEqual(ctrl.status, 201, 'control: same-station message must send');

        // Attack: station B addressing a station-1 username must be rejected.
        const attack = await api('POST', '/api/messages', tokenB, { recipients: ['ten_iso_user_a'], subject: `${MARK} pwned`, body: 'injected' });
        assert.strictEqual(attack.status, 400, 'cross-station recipient must be rejected (was: injected into the inbox)');

        const injected = (await pool.query(
          `SELECT COUNT(*)::int AS c FROM messages WHERE subject = '${MARK} pwned'`
        )).rows[0];
        assert.strictEqual(injected.c, 0, 'cross-station message row was written');
      });

      // ═══════ P0 expansion (2026-06-12): data-driven cross-tenant matrix ═══════
      // One generic attack per route family: fixture row in station 1 (direct
      // SQL, MARK in a text guard column), then as station B — list must not
      // contain it, GET /:id must not leak it, PATCH/PUT must not mutate it,
      // DELETE must not remove it. Positive controls as station A keep the
      // assertions honest (a family whose list control fails would otherwise
      // pass vacuously). Verb coverage is self-calibrating: B's mutations are
      // judged by the DB row afterward, so families without a PATCH route
      // still get a meaningful "nothing changed" assertion.

      // A station-1 fire-inspection property — fi_inspections/fi_permits FK to it.
      const fiProp = (await pool.query(
        `INSERT INTO fi_properties (name, station_id) VALUES ('${MARK} Property', 1) RETURNING id`
      )).rows[0].id;

      const FAMILIES = [
        { name: 'apparatus', base: '/api/apparatus', table: 'apparatus', guardCol: 'designation',
          insert: `INSERT INTO apparatus (designation, type, year, station_id) VALUES ('${MARK}-APP-1', 'Engine', 2020, 1) RETURNING id`,
          patchBody: { designation: 'PWNED', type: 'Pwned' } },
        { name: 'shifts', base: '/api/shifts', table: 'shifts', guardCol: 'notes',
          insert: `INSERT INTO shifts (date, "shiftType", notes, station_id) VALUES ('2026-06-12', 'Day', '${MARK} shift', 1) RETURNING id`,
          patchBody: { notes: 'PWNED' } },
        { name: 'mutual-aid', base: '/api/mutual-aid', table: 'mutual_aid', guardCol: 'notes',
          insert: `INSERT INTO mutual_aid (date, notes, station_id) VALUES ('2026-06-12', '${MARK} aid run', 1) RETURNING id`,
          patchBody: { notes: 'PWNED' } },
        { name: 'mutual-aid-agreements', base: '/api/mutual-aid-agreements', table: 'mutual_aid_agreements', guardCol: 'partner_agency',
          insert: `INSERT INTO mutual_aid_agreements (partner_agency, station_id) VALUES ('${MARK} Partner FD', 1) RETURNING id`,
          patchBody: { partner_agency: 'PWNED' } },
        { name: 'fi-properties', base: '/api/fi-properties', table: 'fi_properties', guardCol: 'name',
          insert: `INSERT INTO fi_properties (name, station_id) VALUES ('${MARK} Property 2', 1) RETURNING id`,
          patchBody: { name: 'PWNED' } },
        { name: 'fi-inspections', base: '/api/fi-inspections', table: 'fi_inspections', guardCol: 'notes',
          insert: `INSERT INTO fi_inspections ("propertyId", notes, station_id) VALUES (${fiProp}, '${MARK} inspection', 1) RETURNING id`,
          patchBody: { notes: 'PWNED' } },
        { name: 'fi-permits', base: '/api/fi-permits', table: 'fi_permits', guardCol: 'notes',
          insert: `INSERT INTO fi_permits ("propertyId", type, notes, station_id) VALUES (${fiProp}, 'Burn', '${MARK} permit', 1) RETURNING id`,
          patchBody: { notes: 'PWNED' } },
        { name: 'workflows', base: '/api/workflows', table: 'workflow_tasks', guardCol: 'title',
          insert: `INSERT INTO workflow_tasks (title, station_id) VALUES ('${MARK} workflow', 1) RETURNING id`,
          patchBody: { title: 'PWNED' } },
        { name: 'training', base: '/api/training', table: 'training', guardCol: '"courseName"',
          insert: `INSERT INTO training ("courseName", type, station_id) VALUES ('${MARK} Course', 'Drill', 1) RETURNING id`,
          patchBody: { courseName: 'PWNED' } },
        { name: 'dept-documents', base: '/api/dept-documents', table: 'dept_documents', guardCol: 'title',
          insert: `INSERT INTO dept_documents (title, station_id) VALUES ('${MARK} Document', 1) RETURNING id`,
          patchBody: { title: 'PWNED' } },
        { name: 'sogs', base: '/api/sogs', table: 'sogs', guardCol: 'title',
          insert: `INSERT INTO sogs (title, station_id) VALUES ('${MARK} SOG', 1) RETURNING id`,
          patchBody: { title: 'PWNED' } },
        { name: 'budget-lines', base: '/api/budget-lines', table: 'budget_lines', guardCol: '"lineNumber"',
          insert: `INSERT INTO budget_lines ("lineNumber", station_id) VALUES ('${MARK}-BL-1', 1) RETURNING id`,
          patchBody: { lineNumber: 'PWNED' } },
        { name: 'hydrants', base: '/api/hydrants', table: 'hydrants', guardCol: '"hydrantNumber"',
          insert: `INSERT INTO hydrants ("hydrantNumber", station_id) VALUES ('${MARK}-HYD-1', 1) RETURNING id`,
          patchBody: { hydrantNumber: 'PWNED' } },
        { name: 'investigations', base: '/api/investigations', table: 'investigations', guardCol: '"caseNumber"',
          insert: `INSERT INTO investigations ("caseNumber", station_id) VALUES ('${MARK}-CASE-1', 1) RETURNING id`,
          patchBody: { caseNumber: 'PWNED' } },
        { name: 'personnel-actions', base: '/api/personnel-actions', table: 'personnel_actions', guardCol: 'action_type',
          insert: `INSERT INTO personnel_actions (member_id, station_id, action_type, action_date) VALUES (${mem}, 1, '${MARK}-ACTION', '2026-06-12') RETURNING id`,
          patchBody: { action_type: 'PWNED' } },
        { name: 'wellness', base: '/api/wellness', table: 'wellness', guardCol: '"memberName"',
          insert: `INSERT INTO wellness ("memberId", "memberName", station_id) VALUES (${mem}, '${MARK} Wellness Member', 1) RETURNING id`,
          patchBody: { memberName: 'PWNED' } },
        { name: 'nfirs-reports', base: '/api/nfirs-reports', table: 'nfirs_reports', guardCol: '"incidentNumber"',
          insert: `INSERT INTO nfirs_reports ("incidentNumber", station_id) VALUES ('${MARK}-NFIRS-1', 1) RETURNING id`,
          patchBody: { incidentNumber: 'PWNED' } },
        { name: 'pre-plans', base: '/api/pre-plans', table: 'pre_plans', guardCol: '"occupancyName"',
          insert: `INSERT INTO pre_plans ("occupancyName", station_id) VALUES ('${MARK} Occupancy', 1) RETURNING id`,
          patchBody: { occupancyName: 'PWNED' } },
        { name: 'station-log', base: '/api/station-log', table: 'station_log', guardCol: '"officerOnDuty"',
          insert: `INSERT INTO station_log (date, "officerOnDuty", station_id) VALUES ('2026-06-12', '${MARK} Officer', 1) RETURNING id`,
          patchBody: { officerOnDuty: 'PWNED' } },
        { name: 'timesheets', base: '/api/timesheets', table: 'timesheets', guardCol: 'notes',
          insert: `INSERT INTO timesheets (station_id, member_id, period_start, period_end, notes) VALUES (1, ${mem}, '2026-06-01', '2026-06-14', '${MARK} timesheet') RETURNING id`,
          patchBody: { notes: 'PWNED' } },
        { name: 'leave', base: '/api/leave', table: 'leave_requests', guardCol: '"memberName"',
          insert: `INSERT INTO leave_requests ("memberId", "memberName", "startDate", "endDate", station_id) VALUES (${mem}, '${MARK} Leave Member', '2026-06-12', '2026-06-13', 1) RETURNING id`,
          patchBody: { memberName: 'PWNED' } },
        { name: 'attachments', base: '/api/attachments', table: 'attachments', guardCol: 'file_name',
          insert: `INSERT INTO attachments (station_id, module, record_id, file_name, file_url) VALUES (1, 'incidents', ${inc}, '${MARK}-file.pdf', 'https://example.com/${MARK}.pdf') RETURNING id`,
          patchBody: { file_name: 'PWNED' },
          listQuery: `?module=incidents&record_id=${inc}` },
      ];

      const rowsOf = (j) => (Array.isArray(j) ? j : (j?.data && Array.isArray(j.data) ? j.data : []));
      const leaks = (resp) => JSON.stringify(resp.json ?? '').includes(MARK);

      for (const f of FAMILIES) {
        await t.test(`${f.name}: station B cannot read or mutate a station-1 row`, async () => {
          const fid = (await pool.query(f.insert)).rows[0].id;

          // List — positive control as A, no leak as B.
          const listPath = f.base + (f.listQuery || '');
          const listA = await api('GET', listPath, tokenA);
          assert.strictEqual(listA.status, 200, `control: station A list must 200 (got ${listA.status})`);
          assert.ok(leaks(listA), 'control: station A must see its own row in the list');
          const listB = await api('GET', listPath, tokenB);
          assert.ok(listB.status < 500, `station B list errored (${listB.status})`);
          assert.ok(!rowsOf(listB.json).some((r) => Number(r.id) === Number(fid)) && !leaks(listB),
            'station-1 row leaked into station-B list');

          // GET /:id — only meaningful if the route exists (A control 200).
          const oneA = await api('GET', `${f.base}/${fid}`, tokenA);
          if (oneA.status === 200) {
            const oneB = await api('GET', `${f.base}/${fid}`, tokenB);
            assert.ok(oneB.status === 404 || !leaks(oneB),
              `cross-tenant GET /:id leaked the row (status ${oneB.status})`);
          }

          // PATCH + PUT as B — never 5xx, never echo the foreign row.
          for (const verb of ['PATCH', 'PUT']) {
            const r = await api(verb, `${f.base}/${fid}`, tokenB, f.patchBody);
            assert.ok(r.status < 500, `cross-tenant ${verb} errored (${r.status})`);
            assert.ok(!leaks(r), `cross-tenant ${verb} echoed the foreign row`);
          }
          let row = (await pool.query(`SELECT ${f.guardCol} AS guard FROM ${f.table} WHERE id = $1`, [fid])).rows[0];
          assert.ok(row, 'row vanished after cross-tenant PATCH/PUT');
          assert.ok(String(row.guard).includes(MARK), `${f.guardCol} was mutated cross-tenant`);

          // DELETE as B — the row must survive (and stay un-soft-deleted).
          const del = await api('DELETE', `${f.base}/${fid}`, tokenB);
          assert.ok(del.status < 500, `cross-tenant DELETE errored (${del.status})`);
          row = (await pool.query(`SELECT ${f.guardCol} AS guard FROM ${f.table} WHERE id = $1`, [fid])).rows[0];
          assert.ok(row, 'row was hard-deleted cross-tenant');
          assert.ok(String(row.guard).includes(MARK), `${f.guardCol} was mutated by cross-tenant DELETE`);
        });
      }

      // ════════════════════ cad-alerts (dispatch core) ════════════════════
      await t.test('cad-alerts: station B cannot see or clear a station-1 alert', async () => {
        const cid = (await pool.query(
          `INSERT INTO cad_alerts (alert_id, address, description, station_id)
           VALUES ('${MARK}-CAD-1', '${MARK} 1 Test Way', 'Test dispatch', 1) RETURNING id`
        )).rows[0].id;

        const listA = await api('GET', '/api/cad/alerts', tokenA);
        assert.strictEqual(listA.status, 200, 'control: station A must list its alerts');
        assert.ok(leaks(listA), 'control: station A must see its own alert');

        const listB = await api('GET', '/api/cad/alerts', tokenB);
        assert.ok(listB.status < 500);
        assert.ok(!leaks(listB), 'station-1 CAD alert leaked into station-B list');

        const oneB = await api('GET', `/api/cad/alerts/${cid}`, tokenB);
        assert.ok(oneB.status === 404 || !leaks(oneB), 'cross-tenant alert read leaked');

        const clearB = await api('POST', `/api/cad/alerts/${cid}/clear`, tokenB);
        assert.ok(clearB.status < 500, `cross-tenant clear errored (${clearB.status})`);
        const row = (await pool.query('SELECT cleared_at FROM cad_alerts WHERE id = $1', [cid])).rows[0];
        assert.ok(row, 'alert row vanished');
        assert.strictEqual(row.cleared_at, null, 'station-1 alert was cleared cross-tenant');
      });

      // ════════════════════ recall (no plain CRUD — list/read/close) ════════════════════
      await t.test('recall: station B cannot see or close a station-1 recall', async () => {
        const rid = (await pool.query(
          `INSERT INTO recall_events (station_id, level, message, issued_by, status)
           VALUES (1, 'full', '${MARK} all hands recall', '${MARK} Chief', 'active') RETURNING id`
        )).rows[0].id;

        const listA = await api('GET', '/api/recall', tokenA);
        assert.strictEqual(listA.status, 200, 'control: station A must list its recalls');
        assert.ok(leaks(listA), 'control: station A must see its own recall');

        const listB = await api('GET', '/api/recall', tokenB);
        assert.ok(listB.status < 500);
        assert.ok(!leaks(listB), 'station-1 recall leaked into station-B list');

        const oneB = await api('GET', `/api/recall/${rid}`, tokenB);
        assert.ok(oneB.status === 404 || !leaks(oneB), 'cross-tenant recall read leaked');

        const closeB = await api('PATCH', `/api/recall/${rid}/close`, tokenB);
        assert.strictEqual(closeB.status, 404, 'cross-tenant recall close must 404');
        const row = (await pool.query('SELECT status FROM recall_events WHERE id = $1', [rid])).rows[0];
        assert.strictEqual(row.status, 'active', 'station-1 recall was closed cross-tenant');
      });

      // ════════════════════ run-list (date+station scoped /today snapshot) ════════════════════
      await t.test('run-list: station B /today never returns station-1 crew', async () => {
        const today = new Date().toISOString().slice(0, 10);
        // Per-station roster grain (0072): run_lists is keyed on (department_id, station_id,
        // date) and station_id is NOT NULL — supply station 1's department explicitly.
        await pool.query(
          `INSERT INTO run_lists (department_id, station_id, date, payload)
           VALUES ((SELECT department_id FROM stations WHERE id = 1), 1, $1, $2)`,
          [today, JSON.stringify({ crew: [{ name: `${MARK} Firefighter` }] })]
        );
        const ctrlA = await api('GET', `/api/run-list/today?date=${today}`, tokenA);
        assert.strictEqual(ctrlA.status, 200, 'control: station A run-list must 200');
        assert.ok(leaks(ctrlA), 'control: station A must see its own run list');

        const b = await api('GET', `/api/run-list/today?date=${today}`, tokenB);
        assert.ok(b.status < 500, `station B run-list errored (${b.status})`);
        assert.ok(!leaks(b), 'station-1 run-list crew leaked into station-B /today');
      });

      // ════════════════════ exams / exam-assignments ════════════════════
      // Regression guard for the Phase-3 flip that wrongly keyed assign()'s
      // user-validation on users.department_id — a column `users` does NOT have
      // (shared platform identity; membership lives in of_user_departments). It
      // threw 42703 and 500'd exam assignment for EVERY tenant, but no family
      // exercised this path so CI stayed green. The owner positive control below
      // (A assigns its own user → 200, non-empty) fails loudly if it recurs; the
      // cross-tenant check proves B can't assign a station-1 user.
      await t.test('exams: owner can assign its own user; station B cannot assign cross-tenant', async () => {
        const mk = await api('POST', '/api/exams', tokenA, {
          title: `${MARK} Pump Ops Exam`, category: 'Certification', questions: [],
        });
        assert.strictEqual(mk.status, 201, `control: station A must create an exam (got ${mk.status})`);
        const examId = mk.json?.data?.id;
        assert.ok(examId, 'exam id missing from create response');

        // Positive control / regression guard: A assigns its OWN user.
        const assignA = await api('POST', `/api/exams/${examId}/assign`, tokenA, { userIds: [userAId] });
        assert.strictEqual(assignA.status, 200, `control: station A assign must 200 (got ${assignA.status})`);
        assert.ok(Array.isArray(assignA.json?.data) && assignA.json.data.length === 1,
          'control: station A must successfully assign its own user (regresses to 500 if users.department_id returns)');

        // Cross-tenant: B tries to assign A's user to A's exam — must be dropped.
        const assignB = await api('POST', `/api/exams/${examId}/assign`, tokenB, { userIds: [userAId] });
        assert.ok(assignB.status < 500, `cross-tenant assign errored (${assignB.status})`);
        assert.ok(!Array.isArray(assignB.json?.data) || assignB.json.data.length === 0,
          'station B assigned a station-1 user across tenants');

        // DB truth: exactly one assignment for (examId, userAId), owned by station 1.
        const rows = (await pool.query(
          'SELECT station_id FROM exam_assignments WHERE exam_id = $1 AND user_id = $2', [examId, userAId]
        )).rows;
        assert.strictEqual(rows.length, 1, 'exam assignment count wrong after cross-tenant attempt');
        assert.strictEqual(Number(rows[0].station_id), 1, 'assignment landed under the wrong tenant');
      });

      // ═══════ Phase 2 — department resolution (auth EXPAND) ═══════
      // requireAuth now resolves req.user.department_id via
      // db.users.resolveDepartmentId (of_user_departments, falling back to the
      // station-mirrored department). The 40 HTTP tests above already prove the
      // middleware change is non-breaking (all pass through requireAuth); this
      // asserts the resolver's contract directly.
      await t.test('department resolution: membership wins, station is the fallback, null fails closed', async () => {
        // Fallback: a user with no membership row resolves to its station
        // (dept.id == station_id after the 0004 backfill).
        const fb = await pool.query('SELECT department_id FROM of_user_departments WHERE user_id = $1', [userAId]);
        if (fb.rows.length === 0) {
          assert.strictEqual(await require('../db').users.resolveDepartmentId(userAId, 1), 1,
            'no-membership user must fall back to its station as department');
        }
        // Precedence: an explicit of_user_departments row overrides the station
        // fallback. of_user_departments.department_id FKs to departments, so
        // create a real throwaway department to map userA into (stationB is a
        // station with no matching department — EXPAND ran before it existed).
        const otherDept = (await pool.query(
          `INSERT INTO departments (name, plan_tier) VALUES ('${MARK} Other Dept', 'CAREER_SMALL') RETURNING id`
        )).rows[0].id;
        await pool.query(
          `INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1, $2, 'member')
           ON CONFLICT (user_id, department_id) DO NOTHING`,
          [userAId, otherDept]
        );
        try {
          const resolved = await require('../db').users.resolveDepartmentId(userAId, 1);
          assert.strictEqual(Number(resolved), Number(otherDept),
            'of_user_departments membership must win over the station fallback');
        } finally {
          await pool.query('DELETE FROM of_user_departments WHERE user_id = $1 AND department_id = $2', [userAId, otherDept]);
          await pool.query('DELETE FROM departments WHERE id = $1', [otherDept]);
        }
        // Fail closed: userB has no membership row, so with no station passed
        // the resolver returns null → middleware answers 403 NO_DEPARTMENT.
        const noMembership = await pool.query('SELECT 1 FROM of_user_departments WHERE user_id = $1', [userBId]);
        if (noMembership.rows.length === 0) {
          assert.strictEqual(await require('../db').users.resolveDepartmentId(userBId, null), null,
            'no membership + no station must resolve to null (fail closed)');
        }
      });

      // ═══════ no-JWT tenant paths (gameplan Phase 5 no-context sweep) ═══════
      // These surfaces resolve their tenant from a PUBLIC credential, not a
      // JWT: the TV display from a station PIN, radio hardware from a per-
      // station API key, the iCal feed from a subscription token. Each must
      // resolve to EXACTLY one tenant — station B's credential must never
      // surface station-1 data, and a bad credential must be rejected (not
      // silently defaulted to station 1, the CAD_DEFAULT_STATION_ID||1 trap).
      const { hashTvPin } = require('../config/tvPin');

      // ── tv-data (station TV PIN) ──
      await t.test('tv-data: a station-B PIN returns zero station-1 data', async () => {
        const bPin = `${MARK}PINB`;
        await pool.query('UPDATE stations SET tv_pin = $1 WHERE id = $2', [hashTvPin(bPin), stationB]);

        // Invalid PIN must be rejected outright — never defaulted to a tenant.
        const bad = await api('GET', '/api/tv-data?pin=ZZ-not-a-real-pin', null);
        assert.strictEqual(bad.status, 401, 'an unknown TV PIN must 401, not resolve to a default station');

        const tv = await api('GET', `/api/tv-data?pin=${bPin}`, null);
        assert.strictEqual(tv.status, 200, 'valid station-B PIN must return data');
        // NOTE: don't use the generic MARK check — station B's OWN name is
        // "TEN-ISO Station B …", so assert on station-1 fixture markers.
        const tvBody = JSON.stringify(tv.json ?? '');
        assert.ok(!tvBody.includes('Tenancy Fixture Member'),
          'station-1 member surfaced on the station-B TV display (PIN resolved wrong tenant)');
        assert.ok(!tvBody.includes(`${MARK}-APP-1`),
          'station-1 apparatus surfaced on the station-B TV display');
      });

      // ── radio-ingest (per-station radio API key) ──
      await t.test('radio-ingest: a station-B API key writes only to station B', async () => {
        const bKey = `${MARK}-radio-key-B`;
        await pool.query(
          `INSERT INTO radio_config (station_id, enabled, api_key) VALUES ($1, true, $2)
           ON CONFLICT DO NOTHING`, [stationB, bKey]
        );

        // Unknown key → 403, and nothing written.
        const bad = await fetch(`${base}/api/radio-ingest`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Radio-API-Key': 'not-a-real-key' },
          body: JSON.stringify({ transcript: `${MARK} should-not-write` }),
        });
        assert.strictEqual(bad.status, 403, 'an unknown radio API key must 403, not default to station 1');

        // Valid B key → row lands in station B, never station 1.
        const ok = await fetch(`${base}/api/radio-ingest`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Radio-API-Key': bKey },
          body: JSON.stringify({ transcript: `${MARK} radio from station B` }),
        });
        assert.ok(ok.status < 500, `radio-ingest errored (${ok.status})`);

        const landed = (await pool.query(
          `SELECT station_id FROM radio_log WHERE transcript LIKE '${MARK}%'`
        )).rows;
        assert.ok(landed.length >= 1, 'radio-ingest wrote no row for a valid key');
        for (const r of landed) {
          assert.strictEqual(Number(r.station_id), Number(stationB),
            'radio-ingest wrote to the wrong tenant (or defaulted to station 1)');
        }
        // The rejected key wrote nothing.
        const stray = (await pool.query(
          `SELECT COUNT(*)::int AS c FROM radio_log WHERE transcript = '${MARK} should-not-write'`
        )).rows[0];
        assert.strictEqual(stray.c, 0, 'a rejected radio key still wrote a row');
        await pool.query(`DELETE FROM radio_log WHERE transcript LIKE '${MARK}%'`);
        await pool.query(`DELETE FROM radio_config WHERE api_key = '${bKey}'`);
      });

      // ── iCal feed (subscription token) ──
      await t.test('ical: a station-B token serves no station-1 data', async () => {
        const bToken = `${MARK}-cal-token-b`;
        // member_id FKs to members(id) and is nullable — a station-tier feed
        // isn't member-specific, so leave it NULL rather than inventing a member.
        await pool.query(
          `INSERT INTO calendar_subscriptions (member_id, station_id, cal_token, tier)
           VALUES (NULL, $1, $2, 'station')`, [stationB, bToken]
        );
        const res2 = await fetch(`${base}/ical/${bToken}.ics`);
        assert.ok(res2.status < 500, `ical errored (${res2.status})`);
        if (res2.status === 200) {
          const body = await res2.text();
          assert.ok(!body.includes('Tenancy Fixture Member') && !body.includes(`${MARK}-INC-1`),
            'station-1 data leaked into the station-B iCal feed');
        }
        await pool.query(`DELETE FROM calendar_subscriptions WHERE cal_token = '${bToken}'`);
      });

      // ════════════════════ export/all (chief full-department export) ════════════════════
      await t.test('export/all: station B export contains zero station-1 data', async () => {
        // NOTE: a plain MARK-substring check false-positives here — station B's
        // OWN stations row is named "TEN-ISO Station B (tenancy test)". Assert
        // on specific station-1 fixture markers instead.
        const station1Markers = [
          `${MARK}-INC-1`, `${MARK}-M-1`, `${MARK}-GR-1`, `${MARK}-CAD-1`,
          `${MARK}-APP-1`, `${MARK}-HYD-1`, `${MARK}-CASE-1`, `${MARK}-NFIRS-1`,
          `${MARK} Course`, `${MARK} Document`, `${MARK} Occupancy`,
          'Tenancy Fixture Member',
        ];
        const expB = await api('GET', '/api/export/all', tokenB);
        assert.ok(expB.status < 500, `station B export errored (${expB.status})`);
        if (expB.status === 200) {
          const body = JSON.stringify(expB.json ?? '');
          for (const m of station1Markers) {
            assert.ok(!body.includes(m), `station-1 fixture "${m}" leaked into station-B full export`);
          }
        }
        const expA = await api('GET', '/api/export/all', tokenA);
        if (expA.status === 200) {
          const bodyA = JSON.stringify(expA.json ?? '');
          assert.ok(bodyA.includes(`${MARK}-INC-1`), 'control: station A export must include its own fixture rows');
        }
      });
    } finally {
      // ── Cleanup runs even on assertion failure ──────────────────────────────
      const removed = await cleanupFixtures();
      const leftovers = (await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM incidents           WHERE "incidentNumber" LIKE '${MARK}%')::int AS incidents,
           (SELECT COUNT(*) FROM members             WHERE "memberNumber"  LIKE '${MARK}%')::int AS members,
           (SELECT COUNT(*) FROM grievances          WHERE grievance_number LIKE '${MARK}%')::int AS grievances,
           (SELECT COUNT(*) FROM exposure_records    WHERE reported_by = '${MARK}')::int          AS exposure_records,
           (SELECT COUNT(*) FROM users               WHERE username LIKE 'ten_iso_%')::int        AS users`
      )).rows[0];
      console.log('[tenancyIsolation] cleanup removed:', JSON.stringify(removed));
      console.log('[tenancyIsolation] leftover fixture rows (must all be 0):', JSON.stringify(leftovers));

      await new Promise((resolve) => server.close(resolve));
      // Safe here: this is a dedicated test process at the very end of its
      // life — NOT the shared server runtime (Lesson #4 applies to seeds).
      await pool.end();
    }
  });
}
