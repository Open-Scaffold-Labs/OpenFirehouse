'use strict';
/**
 * cadIngestMonitor.test.js — 4C.4. The fence on the interface-fault console.
 *
 * DB-backed; runs only when TENANCY_TEST_DB is set (house pattern), skips clean otherwise.
 *
 *   TENANCY_TEST_DB='postgresql://matthewlavin@localhost:5432/freestation' \
 *     node --test server/src/tests/cadIngestMonitor.test.js
 *
 * WHY EVERY CASE IS PAIRED
 * ------------------------
 * A refusal test alone passes just as happily against a route that is broken for everyone.
 * So each refusal here is paired with the caller who must still SUCCEED, and each refusal
 * re-reads the table afterwards — a 403 with a mutation behind it is worse than no gate,
 * because it is a gate you now trust.
 *
 * WHAT IS DELIBERATELY NOT TESTED HERE
 * ------------------------------------
 * The physical append-only guarantee (of_app UPDATE/DELETE -> 42501) CANNOT be asserted on a
 * local database: local has no `of_app` role and no Supabase default privileges, so the
 * assertion would be vacuously true — the 0118 lesson, where a grant probe passed locally and
 * was FALSE on prod. That one is a prod probe (docs/probes/probe-0127-prod.sql), run as of_app
 * inside a transaction and rolled back.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[cadIngestMonitor] TENANCY_TEST_DB not set — skipping.');
  test('cad ingest monitor (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('4C.4 — the interface-fault console is scoped, gated, and append-only', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      const tmr = realSetInterval(...args);
      if (tmr && typeof tmr.unref === 'function') tmr.unref();
      return tmr;
    };
    let app;
    try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');

    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function api(method, path, token, body) {
      const res = await fetch(base + path, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null; try { json = await res.json(); } catch { /* */ }
      return { status: res.status, json };
    }

    const MARK = `CIM-${Date.now()}`;

    // Registered FIRST, before any fixture that can throw — otherwise the http server stays
    // listening and the suite hangs forever under --test-timeout=0.
    t.after(async () => {
      try { await cleanup(); } finally {
        await new Promise((r) => server.close(r));
        await pool.end().catch(() => {});
      }
    });

    async function cleanup() {
      // Children first: cad_ingest_review -> cad_ingest_outcome -> cad_ingest_log (FKs are
      // RESTRICT by default and the tables carry no cascade).
      await pool.query(
        `DELETE FROM cad_ingest_review WHERE outcome_id IN (
           SELECT o.id FROM cad_ingest_outcome o JOIN cad_ingest_log l USING (log_event_id)
            WHERE l.vendor LIKE $1)`, [`${MARK}%`]);
      await pool.query(
        `DELETE FROM cad_ingest_outcome WHERE log_event_id IN (
           SELECT log_event_id FROM cad_ingest_log WHERE vendor LIKE $1)`, [`${MARK}%`]);
      await pool.query(`DELETE FROM cad_ingest_log WHERE vendor LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM users WHERE username LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM cad_connections WHERE name LIKE $1`, [`${MARK}%`]);
    }
    await cleanup();

    // ── Fixtures ────────────────────────────────────────────────────────────────────────
    const chiefRow = (await pool.query(
      `SELECT id, username, role, station_id FROM users
        WHERE station_id IS NOT NULL AND role='chief' ORDER BY id LIMIT 1`)).rows[0];
    assert.ok(chiefRow, 'need a chief with a station to run this suite');
    const deptId = chiefRow.station_id;

    // A SECOND department, so cross-tenant is tested against real data rather than an
    // id that simply does not exist (which any broken route would also 404).
    const otherDeptId = (await pool.query(
      `SELECT id FROM departments WHERE id <> $1 ORDER BY id LIMIT 1`, [deptId])).rows[0]?.id;
    assert.ok(otherDeptId, 'need a second department to prove cross-tenant refusal');

    const tok = (row, role, name) => jwt.sign(
      { sub: row.id, username: row.username, role, stationId: row.station_id ?? deptId, name },
      ACCESS_SECRET, { expiresIn: '15m' });

    const chief = tok(chiefRow, chiefRow.role, 'Fault Chief');

    const mk = async (username, role, name) => (await pool.query(
      `INSERT INTO users (username, name, initials, "passwordHash", role, station_id)
       VALUES ($1, $2, 'XX', 'x', $3, $4) RETURNING id, username, station_id`,
      [username, name, role, deptId])).rows[0];

    const officerRow = await mk(`${MARK}-officer`, 'officer', 'Fault Officer');
    const memberRow  = await mk(`${MARK}-member`,  'member',  'Fault Member');
    const officer = tok(officerRow, 'officer', 'Fault Officer');
    const member  = tok(memberRow,  'member',  'Fault Member');

    /** Write a receipt + outcome directly — the same shape cad/ingestLog.js writes. */
    async function seedFault(dept, status, body, err) {
      const l = (await pool.query(
        `INSERT INTO cad_ingest_log (department_id, vendor, source_ip, raw_body, headers)
         VALUES ($1, $2, '203.0.113.9', $3, '{}'::jsonb) RETURNING log_event_id`,
        [dept, `${MARK}-vendor`, body])).rows[0];
      const o = (await pool.query(
        `INSERT INTO cad_ingest_outcome (log_event_id, department_id, parse_status, parse_error, responded_status)
         VALUES ($1, $2, $3, $4, 200) RETURNING id`,
        [l.log_event_id, dept, status, err ?? null])).rows[0];
      return { logEventId: l.log_event_id, outcomeId: Number(o.id) };
    }

    const mine   = await seedFault(deptId, 'unparseable', '{"nature":"STRUCTURE FIRE", TRUNCATED', 'Unexpected token');
    const parsed = await seedFault(deptId, 'parsed', '{"nature":"MVA"}', null);
    const theirs = await seedFault(otherDeptId, 'unparseable', '{"nature":"SOMEONE ELSE", TRUNC', 'Unexpected token');

    // ══ ROLE GATE — refusal, then the control that proves the route works at all ═════════
    await t.test('a member is refused the fault list', async () => {
      const res = await api('GET', '/api/cad-ingest/faults', member);
      assert.equal(res.status, 403, JSON.stringify(res.json));
      assert.equal(res.json.code, 'FORBIDDEN_ROLE');
    });

    await t.test('an officer CAN read the fault list (the control)', async () => {
      const res = await api('GET', '/api/cad-ingest/faults', officer);
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.ok(res.json.data.some(f => Number(f.id) === mine.outcomeId),
        'the officer path must actually return this department\'s fault');
    });

    // ══ THE PII FENCE ═══════════════════════════════════════════════════════════════════
    await t.test('the LIST never carries the raw payload', async () => {
      const res = await api('GET', '/api/cad-ingest/faults', officer);
      assert.equal(res.status, 200);
      const row = res.json.data.find(f => Number(f.id) === mine.outcomeId);
      assert.ok(row, 'fixture: the fault must be listed');
      // Asserted as an ABSENT KEY, not a falsy value: `raw_body: null` would satisfy a
      // truthiness check while still proving the column was selected.
      assert.ok(!('raw_body' in row), 'raw_body must never be selected into the list payload');
      assert.ok(!('headers'  in row), 'headers must never be selected into the list payload');
      assert.equal(typeof row.raw_bytes, 'number', 'the SIZE is what the list shows instead');
    });

    // ══ TENANCY ═════════════════════════════════════════════════════════════════════════
    await t.test('another department\'s fault is invisible and unreviewable', async () => {
      const list = await api('GET', '/api/cad-ingest/faults?scope=all', officer);
      assert.equal(list.status, 200);
      assert.ok(!list.json.data.some(f => Number(f.id) === theirs.outcomeId),
        'a fault belonging to another department must not appear');

      const raw = await api('GET', `/api/cad-ingest/faults/${theirs.logEventId}/raw`, officer);
      assert.equal(raw.status, 404, 'the raw bytes of another tenant must 404, not leak');

      const rev = await api('POST', `/api/cad-ingest/faults/${theirs.outcomeId}/review`, officer, {});
      assert.equal(rev.status, 404, JSON.stringify(rev.json));
      const after = await pool.query(`SELECT count(*)::int n FROM cad_ingest_review WHERE outcome_id = $1`, [theirs.outcomeId]);
      assert.equal(after.rows[0].n, 0, 'a refused cross-tenant review must write NOTHING');
    });

    // ══ REVIEW IS AN APPEND, AND THE OUTCOME ROW NEVER CHANGES ══════════════════════════
    await t.test('reviewing appends a row and leaves the outcome byte-identical', async () => {
      const before = (await pool.query(
        `SELECT md5(o.*::text) AS h FROM cad_ingest_outcome o WHERE id = $1`, [mine.outcomeId])).rows[0].h;

      const res = await api('POST', `/api/cad-ingest/faults/${mine.outcomeId}/review`, officer,
        { note: 'Called the vendor; entered the call by hand.' });
      assert.equal(res.status, 201, JSON.stringify(res.json));
      assert.equal(res.json.data.reviewer_name, 'Fault Officer');

      const after = (await pool.query(
        `SELECT md5(o.*::text) AS h FROM cad_ingest_outcome o WHERE id = $1`, [mine.outcomeId])).rows[0].h;
      // THE POINT OF THE THIRD TABLE. If review had been a column seam, this would differ.
      assert.equal(after, before, 'the outcome row must be byte-identical after a review');
    });

    await t.test('a second review APPENDS — review is a history, not a flag', async () => {
      const res = await api('POST', `/api/cad-ingest/faults/${mine.outcomeId}/review`, chief, { note: 'Confirmed.' });
      assert.equal(res.status, 201, JSON.stringify(res.json));
      const n = (await pool.query(
        `SELECT count(*)::int n FROM cad_ingest_review WHERE outcome_id = $1`, [mine.outcomeId])).rows[0].n;
      assert.equal(n, 2, 'both reviews must survive; nothing is overwritten');
    });

    await t.test('the list shows the MOST RECENT review', async () => {
      const res = await api('GET', '/api/cad-ingest/faults?scope=all', officer);
      const row = res.json.data.find(f => Number(f.id) === mine.outcomeId);
      assert.equal(row.review_note, 'Confirmed.', 'the latest review is the one displayed');
    });

    // ══ SCOPE ═══════════════════════════════════════════════════════════════════════════
    await t.test('scope=open hides a reviewed fault; scope=all shows it', async () => {
      const open = await api('GET', '/api/cad-ingest/faults?scope=open', officer);
      assert.ok(!open.json.data.some(f => Number(f.id) === mine.outcomeId),
        'a reviewed fault must drop out of the worklist');
      const all = await api('GET', '/api/cad-ingest/faults?scope=all', officer);
      assert.ok(all.json.data.some(f => Number(f.id) === mine.outcomeId),
        'and must remain in the history — the review duty needs an auditable record');
    });

    await t.test('a successfully parsed message is never a fault', async () => {
      const all = await api('GET', '/api/cad-ingest/faults?scope=all', officer);
      assert.ok(!all.json.data.some(f => Number(f.id) === parsed.outcomeId),
        'parsed messages must not appear in the fault console at all');

      const rev = await api('POST', `/api/cad-ingest/faults/${parsed.outcomeId}/review`, officer, {});
      assert.equal(rev.status, 422, JSON.stringify(rev.json));
      assert.equal(rev.json.code, 'NOT_A_FAULT');
    });

    // ══ THE AUDITED READ ════════════════════════════════════════════════════════════════
    await t.test('reading the raw payload writes an audit row', async () => {
      const before = (await pool.query(
        `SELECT count(*)::int n FROM audit_log WHERE table_name = 'cad_ingest_log' AND record_id = $1`,
        [mine.outcomeId])).rows[0].n;

      const res = await api('GET', `/api/cad-ingest/faults/${mine.logEventId}/raw`, officer);
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.match(res.json.data.raw_body, /STRUCTURE FIRE/, 'the operator must get the real bytes');

      const after = (await pool.query(
        `SELECT count(*)::int n FROM audit_log WHERE table_name = 'cad_ingest_log' AND record_id = $1`,
        [mine.outcomeId])).rows[0].n;
      assert.equal(after, before + 1, 'every read of a retained-forever PII payload is recorded');
    });

    // ══ THE SUMMARY ═════════════════════════════════════════════════════════════════════
    await t.test('the summary counts this department only, and names its own threshold', async () => {
      const res = await api('GET', '/api/cad-ingest/summary', officer);
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(typeof res.json.data.unreviewed, 'number');
      assert.equal(res.json.data.burstThreshold, 3, 'the constant is reported, not hidden');
      assert.equal(res.json.data.burstWindowMinutes, 60);
      assert.equal(typeof res.json.data.burst, 'boolean');
    });

    await t.test('a member is refused the summary too', async () => {
      const res = await api('GET', '/api/cad-ingest/summary', member);
      assert.equal(res.status, 403);
    });

    // ══ THE ADJACENT HOLE: minting a CAD webhook secret ══════════════════════════════════
    // Since 4C.2 the per-connection secret is the ONLY credential the ingest accepts, so
    // creating a connection IS the ability to inject dispatches. It was ungated.
    await t.test('a member cannot create a CAD connection, and nothing is written', async () => {
      const res = await api('POST', '/api/cad-connections', member, { name: `${MARK}-member-attempt` });
      assert.equal(res.status, 403, JSON.stringify(res.json));
      assert.equal(res.json.code, 'FORBIDDEN_ROLE');
      const n = (await pool.query(`SELECT count(*)::int n FROM cad_connections WHERE name = $1`,
        [`${MARK}-member-attempt`])).rows[0].n;
      assert.equal(n, 0, 'a refused connection must not exist — it would carry a live secret');
    });

    await t.test('an OFFICER cannot either — this is an administrator function', async () => {
      const res = await api('POST', '/api/cad-connections', officer, { name: `${MARK}-officer-attempt` });
      assert.equal(res.status, 403, JSON.stringify(res.json));
      const n = (await pool.query(`SELECT count(*)::int n FROM cad_connections WHERE name = $1`,
        [`${MARK}-officer-attempt`])).rows[0].n;
      assert.equal(n, 0);
    });

    await t.test('a chief CAN create, edit and delete one (the control)', async () => {
      const made = await api('POST', '/api/cad-connections', chief, { name: `${MARK}-chief-ok` });
      assert.equal(made.status, 201, JSON.stringify(made.json));
      const id = made.json.data.id;
      assert.ok(made.json.data.webhook_secret, 'the secret is returned exactly once, on create');

      const patched = await api('PATCH', `/api/cad-connections/${id}`, chief, { notes: 'renamed by chief' });
      assert.equal(patched.status, 200, JSON.stringify(patched.json));

      // ...and a member still cannot touch the one that now exists.
      const memberPatch = await api('PATCH', `/api/cad-connections/${id}`, member, { notes: 'member edit' });
      assert.equal(memberPatch.status, 403);
      const memberDelete = await api('DELETE', `/api/cad-connections/${id}`, member);
      assert.equal(memberDelete.status, 403);
      const stillThere = (await pool.query(`SELECT count(*)::int n FROM cad_connections WHERE id = $1`, [id])).rows[0].n;
      assert.equal(stillThere, 1, 'a refused delete must leave the department\'s CAD routing intact');

      const gone = await api('DELETE', `/api/cad-connections/${id}`, chief);
      assert.equal(gone.status, 200, JSON.stringify(gone.json));
    });

    await t.test('reads stay open — a crew must be able to see its own integration status', async () => {
      const res = await api('GET', '/api/cad-connections', member);
      assert.equal(res.status, 200, 'gating reads would stop a member reporting that CAD is down');
      for (const c of res.json.data || []) {
        assert.ok(!('webhook_secret_hash' in c), 'no read may ever expose the secret hash');
      }
    });
  });
}
