'use strict';
// fiLifecycleE2E.test.js — END-TO-END HTTP proof of the P0 fire-inspection wiring
// (2026-07-12). The building blocks (normalizeViolation, soft-delete helpers,
// audit()) are unit-tested elsewhere; THIS suite proves the actual route wiring by
// booting the real Express app against a real Postgres and firing real HTTP calls:
//
//   POST   → legacy status canonicalized + status_raw preserved + UUID assigned
//   GET    → read-path canonicalization (a raw legacy row renders canonical)
//   PATCH  → audit row with the status transition (who/from→to)
//   DELETE → 404 on re-read, row RETAINED with deleted_at set, soft_delete audit row
//
// Opt-in like tenancyIsolation.test.js: skipped without TENANCY_TEST_DB.
//   cd server && TENANCY_TEST_DB='postgresql://matthewlavin@localhost:5432/freestation' \
//     node --test src/tests/fiLifecycleE2E.test.js

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[fiLifecycleE2E] TENANCY_TEST_DB not set — skipping live fi e2e suite.');
  test('fi lifecycle e2e (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('fi inspections — end-to-end HTTP lifecycle (canonicalize / status_raw / ids / audit / soft-delete)', async (t) => {
    // Unref timers created during app load so the one-shot test process can exit
    // (same pattern as tenancyIsolation.test.js).
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
      try { json = await res.json(); } catch { /* non-JSON */ }
      return { status: res.status, json };
    }

    const MARK = 'FI-E2E';
    async function cleanupFixtures() {
      // Audit rows are deliberately KEPT (append-only doctrine — they are evidence).
      // fi_violations first: its FK to fi_inspections is ON DELETE RESTRICT (0047).
      await pool.query(`DELETE FROM fi_violations WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_inspections WHERE notes LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM fi_properties  WHERE name  LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM users WHERE username = 'fi_e2e_user'`);
    }

    try {
      // Lazy-init DB gate.
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try { const r = await fetch(`${base}/api/setup-status`); if (r.status === 200) { ready = true; break; } }
        catch { /* warming up */ }
        await new Promise((r2) => setTimeout(r2, 1000));
      }
      assert.ok(ready, 'DB never became ready');
      await cleanupFixtures();
      await pool.query(
        `INSERT INTO stations (id, name, fdid, city, state)
         VALUES (1, 'TEN-ISO Victim Station', '', '', '') ON CONFLICT (id) DO NOTHING`
      );
      const userId = (await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
         VALUES ('fi_e2e_user', 'FI E2E User', 'FE', 'chief', 'not-a-real-hash', 1)
         ON CONFLICT (username) DO UPDATE SET station_id = 1, role = 'chief' RETURNING id`
      )).rows[0].id;
      const token = jwt.sign({ sub: userId, username: 'fi_e2e_user', role: 'chief' }, ACCESS_SECRET, { expiresIn: '15m' });

      // ── Fixture property via the real route ─────────────────────────────────
      const prop = await api('POST', '/api/fi-properties', token, { name: `${MARK} Property` });
      assert.equal(prop.status, 201, `property create: ${JSON.stringify(prop.json)}`);
      const propId = prop.json.data.id;

      let inspId;
      await t.test('POST: legacy status canonicalized, original word preserved, stable UUID assigned', async () => {
        const r = await api('POST', '/api/fi-inspections', token, {
          propertyId: propId,
          notes: `${MARK} lifecycle fixture`,
          violations: [
            { code: '1001', description: 'exit blocked', status: 'Abated' },   // legacy resolved word
            { code: '2001', description: 'extinguisher', status: 'Pending' },  // legacy open word
          ],
        });
        assert.equal(r.status, 201, JSON.stringify(r.json));
        inspId = r.json.data.id;
        const [v1, v2] = r.json.data.violations;
        assert.equal(v1.status, 'Corrected');
        assert.equal(v1.status_raw, 'Abated', 'the inspector\'s original word must be preserved');
        assert.match(String(v1.id), /^[0-9a-f-]{36}$/, 'server-assigned UUID');
        assert.equal(v2.status, 'Open');
        assert.equal(v2.status_raw, 'Pending');
        const aud = await pool.query(
          `SELECT 1 FROM audit_log WHERE table_name='fi_inspections' AND action='create' AND record_id=$1`, [inspId]);
        assert.ok(aud.rows.length >= 1, 'create audit row written');
        // P1: the queryable mirror — fi_violations rows must exactly mirror the array.
        const rows = await pool.query(
          `SELECT violation_key, status, status_raw, position FROM fi_violations
           WHERE inspection_id = $1 ORDER BY position`, [inspId]);
        assert.equal(rows.rows.length, 2, 'mirror row per violation element');
        assert.equal(rows.rows[0].status, 'Corrected');
        assert.equal(rows.rows[0].status_raw, 'Abated');
        assert.equal(rows.rows[0].violation_key, String(v1.id));
        assert.equal(rows.rows[1].status, 'Open');
      });

      await t.test('GET: read path canonicalizes a RAW legacy row (pre-canonicalization data)', async () => {
        // Plant raw legacy JSON directly (simulating a row written before 2026-07-11).
        await pool.query(
          `UPDATE fi_inspections SET violations = $1 WHERE id = $2`,
          [JSON.stringify([{ id: '0', code: '3001', status: 'UnAbated' }]), inspId]);
        const r = await api('GET', `/api/fi-inspections/${inspId}`, token);
        assert.equal(r.status, 200);
        const v = r.json.data.violations[0];
        assert.equal(v.status, 'Open', 'legacy UnAbated must render Open');
        assert.equal(v.status_raw, 'UnAbated');
        assert.equal(v.id, '0', 'backfilled position-string id must survive the read untouched');
      });

      await t.test('PATCH: status transition lands in the audit trail (from→to)', async () => {
        const r = await api('PATCH', `/api/fi-inspections/${inspId}`, token, {
          violations: [{ id: '0', code: '3001', status: 'Time Extension' }],
        });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.data.violations[0].status, 'Time Extension');
        const aud = await pool.query(
          `SELECT detail FROM audit_log
           WHERE table_name='fi_inspections' AND action='update' AND record_id=$1
           ORDER BY id DESC LIMIT 1`, [inspId]);
        assert.ok(aud.rows.length, 'update audit row written');
        const detail = typeof aud.rows[0].detail === 'string' ? JSON.parse(aud.rows[0].detail) : aud.rows[0].detail;
        const change = (detail.statusChanges || []).find((c) => c.violationId === '0');
        assert.ok(change, `statusChanges recorded: ${JSON.stringify(detail)}`);
        assert.equal(change.from, 'Open');
        assert.equal(change.to, 'Time Extension');
        // P1: mirror follows the PATCH — one row now, with the new status.
        const rows = await pool.query(
          `SELECT violation_key, status FROM fi_violations WHERE inspection_id = $1 AND deleted_at IS NULL`, [inspId]);
        assert.equal(rows.rows.length, 1, 'mirror replaced wholesale on write');
        assert.equal(rows.rows[0].status, 'Time Extension');
        assert.equal(rows.rows[0].violation_key, '0');
      });

      await t.test('PARTIAL PATCH (no violations): must not corrupt the mirror, the audit trail, or the response', async () => {
        // THE BUG (2026-07-14): PATCH was the ONE route returning its row without
        // normalizeOut. A partial patch — the mobile client's ENTIRE write model — omits
        // `violations`, so coerce() leaves them alone (correctly) and db.update hands back
        // the STORED JSON verbatim. Prod carries live 'Pending' elements. That raw row then
        // (1) mirrored the legacy word into fi_violations, where fiReports' positive
        // allowlist matched NEITHER open nor resolved — the violation VANISHED from the
        // aging dashboard; and (2) diffed raw-vs-normalized into a PHANTOM audit transition
        // on a write that never touched a violation.
        await pool.query(
          `UPDATE fi_inspections SET violations = $1 WHERE id = $2`,
          [JSON.stringify([{ id: '0', code: '3001', status: 'Pending' }]), inspId]);

        const r = await api('PATCH', `/api/fi-inspections/${inspId}`, token, {
          notes: `${MARK} partial patch — notes only, no violations key`,
        });
        assert.equal(r.status, 200, JSON.stringify(r.json));

        // 1. RESPONSE is canonical (this is what the mobile status picker binds to).
        const v = r.json.data.violations[0];
        assert.equal(v.status, 'Open', 'a partial PATCH must not hand a client a legacy status');
        assert.equal(v.status_raw, 'Pending', 'and must not destroy the original word');
        assert.equal(v.id, '0', 'a partial patch must never re-mint identity (photos key on it)');

        // 2. MIRROR stays on the axis — the violation is still COUNTED as open.
        const rows = await pool.query(
          `SELECT status, status_raw FROM fi_violations
           WHERE inspection_id = $1 AND deleted_at IS NULL`, [inspId]);
        assert.equal(rows.rows.length, 1);
        assert.equal(rows.rows[0].status, 'Open',
          'the mirror carried a legacy status → the violation would drop out of the open/aging dashboard');
        assert.equal(rows.rows[0].status_raw, 'Pending');

        // 3. AUDIT TRAIL records NO transition — nothing about the violation changed.
        const aud = await pool.query(
          `SELECT detail FROM audit_log
           WHERE table_name='fi_inspections' AND action='update' AND record_id=$1
           ORDER BY id DESC LIMIT 1`, [inspId]);
        const detail = typeof aud.rows[0].detail === 'string' ? JSON.parse(aud.rows[0].detail) : aud.rows[0].detail;
        assert.ok(!detail.statusChanges,
          `PHANTOM status transition written to the append-only legal audit log: ${JSON.stringify(detail.statusChanges)}`);

        // 4. The load-bearing guard still holds: a partial patch must NOT wipe violations.
        assert.equal(r.json.data.violations.length, 1, 'partial patch silently wiped the violations array');
      });

      await t.test('DELETE: soft — 404 on re-read, row retained with deleted_at, audit row', async () => {
        const del = await api('DELETE', `/api/fi-inspections/${inspId}`, token);
        assert.equal(del.status, 200);
        const gone = await api('GET', `/api/fi-inspections/${inspId}`, token);
        assert.equal(gone.status, 404, 'soft-deleted record must not be readable via the API');
        const list = await api('GET', '/api/fi-inspections', token);
        assert.ok(!(list.json.data || []).some((i) => i.id === inspId), 'soft-deleted record must not appear in lists');
        const raw = await pool.query(`SELECT deleted_at FROM fi_inspections WHERE id = $1`, [inspId]);
        assert.equal(raw.rows.length, 1, 'the row itself is RETAINED (legal record)');
        assert.ok(raw.rows[0].deleted_at, 'deleted_at is set');
        const aud = await pool.query(
          `SELECT 1 FROM audit_log WHERE table_name='fi_inspections' AND action='soft_delete' AND record_id=$1`, [inspId]);
        assert.ok(aud.rows.length >= 1, 'soft_delete audit row written');
        // P1: mirror rows soft-deleted alongside — retained, flagged, never erased.
        const rows = await pool.query(
          `SELECT deleted_at FROM fi_violations WHERE inspection_id = $1`, [inspId]);
        assert.ok(rows.rows.length >= 1, 'mirror rows retained');
        assert.ok(rows.rows.every((r) => r.deleted_at), 'mirror rows carry deleted_at');
      });
    } finally {
      await cleanupFixtures();
      await new Promise((resolve) => server.close(resolve));
      // NO pool.end() here — lesson #4 (never end the shared pool); npm test runs
      // with --test-force-exit, same as tenancyIsolation.test.js.
    }
  });
}
