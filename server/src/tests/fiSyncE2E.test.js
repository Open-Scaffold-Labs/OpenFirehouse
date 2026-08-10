'use strict';
// fiSyncE2E.test.js — offline sync, over real HTTP (2026-07-13).
//
// These are ADVERSARIAL. The batch endpoint is the door through which an
// inspector's whole day walks back into a legal record, so it is tested for what
// an attacker or a bad network would do, not for what the happy path does:
//
//   · The SAME write replayed twice must NOT create two violations. (The single
//     most likely field event: the request landed, the ack didn't.)
//   · A finalized record must still refuse edits arriving from the outbox — the
//     offline door must not be a way around the guards the online routes enforce.
//   · One bad op must not take nineteen good writes down with it.
//   · The served notice must be stored VERBATIM. A tampered byte must be caught.
//   · Nothing crosses tenants.
//
// Opt-in (TENANCY_TEST_DB), house harness.

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[fiSyncE2E] TENANCY_TEST_DB not set — skipping.');
  test('fi sync (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.RESEND_API_KEY;
  delete process.env.PORT;

  test('fi sync — idempotency, guard parity, partial batch, verbatim notice, isolation', async (t) => {
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

    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
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
    const uuid = () => crypto.randomUUID();
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const MARK = 'FI-SYNC';
    async function cleanupFixtures() {
      const scope = `(SELECT id FROM fi_inspections WHERE notes LIKE '${MARK}%')`;
      await pool.query(`DELETE FROM fi_sync_ops WHERE inspection_id IN ${scope}`);
      await pool.query(`DELETE FROM fi_notice_service WHERE inspection_id IN ${scope}`);
      await pool.query(`DELETE FROM fi_signatures WHERE inspection_id IN ${scope}`);
      await pool.query(`DELETE FROM fi_notices WHERE inspection_id IN ${scope}`);
      await pool.query(`DELETE FROM fi_violations WHERE inspection_id IN ${scope}`);
      await pool.query(`DELETE FROM fi_inspection_answers WHERE inspection_id IN ${scope}`);
      await pool.query(`DELETE FROM fi_inspections WHERE notes LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM fi_properties WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM pre_plans WHERE "occupancyName" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM users WHERE username IN ('fi_sync_chief','fi_sync_outsider','fi_sync_member')`);
    }

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try { const r = await fetch(`${base}/api/setup-status`); if (r.status === 200) { ready = true; break; } }
        catch { /* warming */ }
        await new Promise((r2) => setTimeout(r2, 1000));
      }
      assert.ok(ready, 'DB never became ready');
      await cleanupFixtures();
      await pool.query(`INSERT INTO stations (id, name, fdid, city, state) VALUES (1,'TEN-ISO Victim Station','','','') ON CONFLICT (id) DO NOTHING`);
      const bName = 'TEN-ISO Station B (tenancy test)';
      const found = await pool.query('SELECT id FROM stations WHERE name = $1', [bName]);
      const stationB = found.rows.length ? found.rows[0].id
        : (await pool.query(`INSERT INTO stations (name, fdid, city, state) VALUES ($1,'','','') RETURNING id`, [bName])).rows[0].id;

      async function upsertUser(username, stationId) {
        const r = await pool.query(
          `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
           VALUES ($1,$2,'FS','chief','x',$3)
           ON CONFLICT (username) DO UPDATE SET station_id = EXCLUDED.station_id, role='chief' RETURNING id`,
          [username, `Insp ${username}`, stationId]);
        return r.rows[0].id;
      }
      const sign = (id, u) => jwt.sign({ sub: id, username: u, role: 'chief' }, ACCESS_SECRET, { expiresIn: '15m' });
      const chief    = sign(await upsertUser('fi_sync_chief', 1), 'fi_sync_chief');
      const outsider = sign(await upsertUser('fi_sync_outsider', stationB), 'fi_sync_outsider');

      const prop = await api('POST', '/api/fi-properties', chief, { name: `${MARK} Property`, address: '9 Basement Way' });
      const insp = await api('POST', '/api/fi-inspections', chief, {
        propertyId: prop.json.data.id, notes: `${MARK} fixture`, violations: [],
      });
      const inspId = insp.json.data.id;

      await t.test('GET /day carries everything needed to work offline (incl. the legal text)', async () => {
        const day = await api('GET', '/api/fi-sync/day', chief);
        assert.equal(day.status, 200, JSON.stringify(day.json));
        const d = day.json.data ?? day.json;
        assert.ok(d.settings, 'the notice legal blocks must ship — the PDF renders OFFLINE');
        assert.ok(Array.isArray(d.codeLibrary), 'the code library must ship — violations are cited offline');
        assert.ok(Array.isArray(d.checklists), 'the checklists must ship — the walk happens offline');
        assert.ok(Array.isArray(d.inspections), 'the day itself');
        assert.ok(d.serverTime, 'server clock, so the client can show honest freshness');
      });

      // ── THE CORE GUARANTEE ────────────────────────────────────────────────
      await t.test('R5: the SAME write replayed does NOT duplicate a violation on a legal record', async () => {
        const clientId = uuid(); // the SAME idempotency key both times — a real retry
        const op = {
          clientId, op: 'inspection.patch', inspectionId: inspId,
          payload: { violations: [{ code: '1001', description: 'exit blocked', status: 'Open' }] },
          clientRecordedAt: new Date().toISOString(),
        };
        const first = await api('POST', '/api/fi-sync/batch', chief, { ops: [op] });
        assert.equal(first.status, 200, JSON.stringify(first.json));
        assert.equal(first.json.results[0].status, 'applied');

        // The ack was lost. The device sends it again, byte for byte.
        const second = await api('POST', '/api/fi-sync/batch', chief, { ops: [op] });
        assert.equal(second.json.results[0].status, 'duplicate',
          'the server must RECOGNIZE the key, not re-apply the write');

        const after = await api('GET', `/api/fi-inspections/${inspId}`, chief);
        assert.equal(after.json.data.violations.length, 1,
          'ONE violation on the record — not two. This is the whole point of the idempotency key.');
      });

      await t.test('one bad op does not take the good ones down with it', async () => {
        const good1 = { clientId: uuid(), op: 'signature.add', inspectionId: inspId,
          payload: { role: 'occupant', status: 'refused', signerName: 'H. Bauer', advisementsRead: true } };
        const bad   = { clientId: uuid(), op: 'service.add', inspectionId: inspId,
          payload: { method: 'posted_premises', outcome: 'posted' } }; // no photo, no GPS → must be refused
        const good2 = { clientId: uuid(), op: 'signature.add', inspectionId: inspId,
          payload: { role: 'inspector', status: 'signed', signerName: 'Insp. Smith', imageDataUrl: PNG } };

        const r = await api('POST', '/api/fi-sync/batch', chief, { ops: [good1, bad, good2] });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const by = Object.fromEntries(r.json.results.map((x) => [x.clientId, x]));
        assert.equal(r.json.results.length, 3, 'every op gets a verdict');
        assert.equal(by[good1.clientId].status, 'applied');
        assert.equal(by[bad.clientId].status, 'rejected');
        assert.equal(by[bad.clientId].code, 'POSTING_PROOF_REQUIRED',
          'the offline door enforces the SAME guard as the online route');
        assert.equal(by[good2.clientId].status, 'applied', 'the good write after the bad one still lands');
      });

      await t.test('a rejected op is NOT filed as done — a corrected retry can still land', async () => {
        const clientId = uuid();
        const bad = { clientId, op: 'service.add', inspectionId: inspId,
          payload: { method: 'posted_premises', outcome: 'posted' } };
        const r1 = await api('POST', '/api/fi-sync/batch', chief, { ops: [bad] });
        assert.equal(r1.json.results[0].status, 'rejected');

        // Same clientId, now WITH the proof. It must not be swallowed as a duplicate.
        const fixed = { clientId, op: 'service.add', inspectionId: inspId,
          payload: { method: 'posted_premises', outcome: 'posted', postingPhotoDataUrl: PNG,
                     postingLat: 40.6, postingLng: -74.1, postingAccuracyM: 8,
                     postingLocationDesc: 'front entrance' } };
        const r2 = await api('POST', '/api/fi-sync/batch', chief, { ops: [fixed] });
        assert.equal(r2.json.results[0].status, 'applied',
          'a rejection must not poison the idempotency key');
      });

      // ── PREPLAN.PATCH — the pre-plan op vocabulary (2026-07-21) ───────────
      await t.test('preplan.patch: applied, idempotent, field-level LWW — and nothing crosses tenants', async () => {
        const plan = await api('POST', '/api/pre-plans', chief, { occupancyName: `${MARK} Occupancy`, address: '9 Basement Way' });
        assert.equal(plan.status, 201, JSON.stringify(plan.json));
        const planId = plan.json.data.id;

        const clientId = uuid();
        const op = { clientId, op: 'preplan.patch', inspectionId: null,
          payload: { prePlanId: planId, tacticalSketch: [{ c: '#fff', p: [[1, 2]] }], notes: 'alpha side hydrant' } };
        const r1 = await api('POST', '/api/fi-sync/batch', chief, { ops: [op] });
        assert.equal(r1.status, 200, JSON.stringify(r1.json));
        assert.equal(r1.json.results[0].status, 'applied', JSON.stringify(r1.json.results[0]));
        assert.equal(r1.json.results[0].id, planId);

        // The ack was lost; the device replays byte-for-byte.
        const r2 = await api('POST', '/api/fi-sync/batch', chief, { ops: [op] });
        assert.equal(r2.json.results[0].status, 'duplicate', 'a replay is recognized, not re-applied');

        // LWW: a NEWER queued state (its own key) overwrites the sketch — and ONLY
        // the sketch. Field-level patch: fields not in the payload survive.
        const later = { clientId: uuid(), op: 'preplan.patch', inspectionId: null,
          payload: { prePlanId: planId, tacticalSketch: [{ c: '#f00', p: [[3, 4]] }] } };
        const r3 = await api('POST', '/api/fi-sync/batch', chief, { ops: [later] });
        assert.equal(r3.json.results[0].status, 'applied');
        const after = await api('GET', `/api/pre-plans/${planId}`, chief);
        assert.equal(after.json.data.notes, 'alpha side hydrant', 'untouched fields survive (field-level patch)');
        assert.equal(after.json.data.tacticalSketch[0].c, '#f00', 'the LAST write is the truth');

        // Tenancy: another department cannot reach this plan through the batch.
        const sneak = { clientId: uuid(), op: 'preplan.patch', inspectionId: null,
          payload: { prePlanId: planId, tacticalSketch: [] } };
        const r4 = await api('POST', '/api/fi-sync/batch', outsider, { ops: [sneak] });
        assert.equal(r4.json.results[0].status, 'rejected');
        assert.equal(r4.json.results[0].code, 'NOT_FOUND');
        const intact = await api('GET', `/api/pre-plans/${planId}`, chief);
        assert.equal(intact.json.data.tacticalSketch[0].c, '#f00', 'the plan is untouched');
      });

      await t.test('per-op authorization: a NON-inspector member syncs pre-plans but is refused fi ops', async () => {
        // A strict bureau-only department: crew inspections OFF. Pre-plan authoring is a
        // CREW capability (the same bar as the online pre-plan routes, and the market's
        // field-capture tools); inspection ops still demand the designation.
        const memberId = (await pool.query(
          `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
           VALUES ('fi_sync_member','FF Member','FM','member','x',$1)
           ON CONFLICT (username) DO UPDATE SET station_id = EXCLUDED.station_id, role='member' RETURNING id`,
          [stationB])).rows[0].id;
        const member = jwt.sign({ sub: memberId, username: 'fi_sync_member', role: 'member' }, ACCESS_SECRET, { expiresIn: '15m' });
        await pool.query(
          `INSERT INTO fi_settings (department_id, allow_crew_inspections) VALUES ($1, FALSE)
           ON CONFLICT (department_id) DO UPDATE SET allow_crew_inspections = FALSE`, [stationB]);
        try {
          const planB = await api('POST', '/api/pre-plans', member, { occupancyName: `${MARK} B-Side Occupancy` });
          assert.equal(planB.status, 201, JSON.stringify(planB.json));
          const ops = [
            { clientId: uuid(), op: 'preplan.patch', inspectionId: null,
              payload: { prePlanId: planB.json.data.id, notes: 'crew-authored' } },
            { clientId: uuid(), op: 'inspection.patch', inspectionId: 999999, payload: { notes: 'nope' } },
          ];
          const r = await api('POST', '/api/fi-sync/batch', member, { ops });
          assert.equal(r.status, 200, JSON.stringify(r.json));
          assert.equal(r.json.results[0].status, 'applied', 'pre-plan authoring is a crew capability');
          assert.equal(r.json.results[1].status, 'rejected', 'inspection ops still demand the designation');
          assert.equal(r.json.results[1].code, 'FORBIDDEN');
        } finally {
          // Restore the default (row absent → allow_crew_inspections TRUE) so no other
          // test inherits a bureau-only station B.
          await pool.query('DELETE FROM fi_settings WHERE department_id = $1', [stationB]);
        }
      });

      // ── THE OFFLINE DOOR MUST NOT BYPASS THE GUARDS ───────────────────────
      let finalizedId;
      await t.test('a FINALIZED record refuses outbox writes too (no back door)', async () => {
        const f = await api('POST', '/api/fi-inspections', chief, {
          propertyId: prop.json.data.id, notes: `${MARK} finalized`, violations: [],
        });
        finalizedId = f.json.data.id;
        await api('POST', `/api/fi-inspections/${finalizedId}/complete`, chief,
          { completedDate: '2026-07-13', result: 'Pass', scheduleNextCycle: false });

        const sneak = { clientId: uuid(), op: 'inspection.patch', inspectionId: finalizedId,
          payload: { violations: [{ code: '9999', description: 'snuck in via the outbox', status: 'Open' }] } };
        const r = await api('POST', '/api/fi-sync/batch', chief, { ops: [sneak] });
        assert.equal(r.json.results[0].status, 'rejected');
        assert.equal(r.json.results[0].code, 'RECORD_FINALIZED');

        const after = await api('GET', `/api/fi-inspections/${finalizedId}`, chief);
        assert.ok(!(after.json.data.violations || []).some((v) => v.code === '9999'),
          'the finalized record is untouched');
      });

      // ── TRAP 1: the served notice is stored VERBATIM ──────────────────────
      await t.test('the offline-served notice is stored byte-for-byte; a tampered byte is caught', async () => {
        const pdf = Buffer.from('%PDF-1.4\nthe exact document handed to the owner in the basement\n%%EOF');
        const sha256 = crypto.createHash('sha256').update(pdf).digest('hex');

        const good = { clientId: uuid(), op: 'notice.upload', inspectionId: inspId,
          payload: { pdfBase64: pdf.toString('base64'), fileName: 'served.pdf', sha256 } };
        const r = await api('POST', '/api/fi-sync/batch', chief, { ops: [good] });
        assert.equal(r.json.results[0].status, 'applied', JSON.stringify(r.json.results[0]));

        const { rows } = await pool.query(
          'SELECT pdf FROM fi_notices WHERE id = $1', [r.json.results[0].id]);
        assert.ok(rows[0].pdf.equals(pdf),
          'THE BYTES ON THE RECORD ARE THE BYTES THAT WERE SERVED — not a server re-render');

        // Now corrupt it in transit. The hash must catch it.
        const tampered = { clientId: uuid(), op: 'notice.upload', inspectionId: inspId,
          payload: { pdfBase64: Buffer.from('%PDF-1.4 a DIFFERENT document').toString('base64'),
                     fileName: 'served.pdf', sha256 } }; // hash of the ORIGINAL
        const bad = await api('POST', '/api/fi-sync/batch', chief, { ops: [tampered] });
        assert.equal(bad.json.results[0].status, 'rejected');
        assert.equal(bad.json.results[0].code, 'NOTICE_HASH_MISMATCH',
          'a notice that did not survive transit intact must never enter the record');
      });

      // ── OFFLINE COMPLETION: the device queues the INTENT, the SERVER mints ────
      await t.test('an offline completion mints the reinspection ON THE SERVER', async () => {
        const c = await api('POST', '/api/fi-inspections', chief, {
          propertyId: prop.json.data.id, notes: `${MARK} offline-complete`,
          violations: [{ code: '1001', description: 'exit blocked', status: 'Open', followUpDate: '2026-08-15' }],
        });
        const cid = c.json.data.id;

        const op = { clientId: uuid(), op: 'inspection.complete', inspectionId: cid,
          payload: { completedDate: '2026-07-14', result: 'Reinspection Required',
                     createReinspection: true, scheduleNextCycle: false } };
        const r = await api('POST', '/api/fi-sync/batch', chief, { ops: [op] });
        assert.equal(r.json.results[0].status, 'applied', JSON.stringify(r.json.results[0]));

        // The record is completed…
        const after = await api('GET', `/api/fi-inspections/${cid}`, chief);
        assert.equal(String(after.json.data.completedDate).slice(0, 10), '2026-07-14');

        // …and the SERVER minted the reinspection, carrying the open violation, with a
        // real server id. The device fabricated nothing.
        const re = r.json.results[0].reinspection;
        assert.ok(re?.id, 'the server minted the reinspection');
        const reIns = await api('GET', `/api/fi-inspections/${re.id}`, chief);
        assert.equal(reIns.json.data.type, 'Reinspection');
        assert.equal(reIns.json.data.violations.length, 1, 'the open violation was carried forward');
        assert.equal(String(reIns.json.data.scheduledDate).slice(0, 10), '2026-08-15',
          'scheduled from the correct-by date — by the SERVER, not the device');
      });

      await t.test('the offline door enforces the pass-with-violations rule too', async () => {
        const c = await api('POST', '/api/fi-inspections', chief, {
          propertyId: prop.json.data.id, notes: `${MARK} offline-pass-guard`,
          violations: [{ code: '1002', description: 'still open', status: 'Open' }],
        });
        const op = { clientId: uuid(), op: 'inspection.complete', inspectionId: c.json.data.id,
          payload: { completedDate: '2026-07-14', result: 'Pass', scheduleNextCycle: false } };
        const r = await api('POST', '/api/fi-sync/batch', chief, { ops: [op] });
        assert.equal(r.json.results[0].status, 'rejected');
        assert.equal(r.json.results[0].code, 'PASS_WITH_OPEN_VIOLATIONS',
          'an inspection cannot pass with unabated violations — signal or no signal');

        const after = await api('GET', `/api/fi-inspections/${c.json.data.id}`, chief);
        assert.equal(after.json.data.completedDate, null, 'and the refusal stamped nothing');
      });

      await t.test('a REPLAYED completion does not complete the inspection twice', async () => {
        const c = await api('POST', '/api/fi-inspections', chief, {
          propertyId: prop.json.data.id, notes: `${MARK} offline-complete-replay`, violations: [],
        });
        const op = { clientId: uuid(), op: 'inspection.complete', inspectionId: c.json.data.id,
          payload: { completedDate: '2026-07-14', result: 'Pass', scheduleNextCycle: false } };

        const first = await api('POST', '/api/fi-sync/batch', chief, { ops: [op] });
        assert.equal(first.json.results[0].status, 'applied');
        // The ack was lost in the basement. The device sends it again.
        const second = await api('POST', '/api/fi-sync/batch', chief, { ops: [op] });
        assert.equal(second.json.results[0].status, 'duplicate',
          'the idempotency key answers it — NOT a second completion, and not an error');
      });

      await t.test('the batch never crosses tenants', async () => {
        const steal = { clientId: uuid(), op: 'inspection.patch', inspectionId: inspId,
          payload: { violations: [{ code: '6666', description: 'from another department', status: 'Open' }] } };
        const r = await api('POST', '/api/fi-sync/batch', chief === outsider ? chief : outsider, { ops: [steal] });
        // Either the whole call is refused, or the op is rejected NOT_FOUND. Never applied.
        const applied = r.status === 200 && r.json?.results?.[0]?.status === 'applied';
        assert.equal(applied, false, 'another department must never write to this inspection');

        const after = await api('GET', `/api/fi-inspections/${inspId}`, chief);
        assert.ok(!(after.json.data.violations || []).some((v) => v.code === '6666'));
      });

      await t.test("another department's /day never shows our inspections", async () => {
        const day = await api('GET', '/api/fi-sync/day', outsider);
        const d = day.json?.data ?? day.json ?? {};
        const leaked = (d.inspections || []).some((i) => i.id === inspId);
        assert.equal(leaked, false, 'no cross-tenant leakage in the offline payload');
      });
    } finally {
      await cleanupFixtures();
      await new Promise((r) => server.close(r));
    }
  });
}
