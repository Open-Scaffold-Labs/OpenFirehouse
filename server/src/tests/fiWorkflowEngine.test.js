'use strict';
// fiWorkflowEngine.test.js — e2e for the Phase-2 completion engine (2026-07-12):
// reinspection loop with lineage, next-cycle spawn with idempotency, the
// admin_only_commit gate, rank-independent designations, and checklist answers.
// Opt-in (TENANCY_TEST_DB), same harness as the other fi e2e suites.

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[fiWorkflowEngine] TENANCY_TEST_DB not set — skipping.');
  test('fi workflow engine (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('fi workflow engine — complete → reinspection + next cycle, gates, answers', async (t) => {
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

    const MARK = 'FI-ENG';
    async function cleanupFixtures() {
      await pool.query(`DELETE FROM fi_inspection_answers WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '%${MARK}%' OR notes LIKE 'Reinspection of inspection%')`);
      await pool.query(`DELETE FROM fi_violations WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '%${MARK}%' OR notes LIKE 'Reinspection of inspection%' OR "propertyId" IN (SELECT id FROM fi_properties WHERE name LIKE '${MARK}%'))`);
      await pool.query(`DELETE FROM fi_inspections WHERE notes LIKE '%${MARK}%' OR "propertyId" IN (SELECT id FROM fi_properties WHERE name LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_properties WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM fi_inspection_types WHERE department_id = 1 AND name = '${MARK} Annual'`);
      await pool.query(`DELETE FROM fi_designations WHERE department_id = 1`);
      await pool.query(`DELETE FROM fi_settings WHERE department_id = 1`);
      await pool.query(`DELETE FROM users WHERE username IN ('fi_eng_chief','fi_eng_member')`);
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
      async function upsertUser(username, role) {
        const r = await pool.query(
          `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
           VALUES ($1,$2,'FE',$3,'not-a-real-hash',1)
           ON CONFLICT (username) DO UPDATE SET station_id = 1, role = EXCLUDED.role RETURNING id`,
          [username, `Eng ${username}`, role]);
        return r.rows[0].id;
      }
      const chiefId  = await upsertUser('fi_eng_chief', 'chief');
      const memberId = await upsertUser('fi_eng_member', 'member');
      const sign = (id, username, role) => jwt.sign({ sub: id, username, role }, ACCESS_SECRET, { expiresIn: '15m' });
      const chief  = sign(chiefId, 'fi_eng_chief', 'chief');
      const member = sign(memberId, 'fi_eng_member', 'member');

      // Fixtures: a type with a 365-day frequency + a property + an inspection
      // with one OPEN violation (with follow-up) and one corrected.
      const typ = await api('POST', '/api/fi-inspection-types', chief, { name: `${MARK} Annual`, default_frequency_days: 365 });
      assert.equal(typ.status, 201, JSON.stringify(typ.json));
      const prop = await api('POST', '/api/fi-properties', chief, { name: `${MARK} Property` });
      const propId = prop.json.data.id;
      const insp = await api('POST', '/api/fi-inspections', chief, {
        propertyId: propId, type: `${MARK} Annual`, notes: `${MARK} annual fixture`,
        violations: [
          { code: '1001', description: 'exit blocked', status: 'Open', followUpDate: '2026-08-15' },
          { code: '2001', description: 'fixed on site', status: 'Corrected' },
        ],
      });
      const inspId = insp.json.data.id;
      const openKey = insp.json.data.violations[0].id;

      let reinspectionId, nextCycleId;
      // Matt's correction, 2026-07-13: an inspection CANNOT pass with unabated
      // violations. The legal record must never assert a pass over open findings.
      await t.test('a passing result is REFUSED while violations stand unabated', async () => {
        // A RECOGNIZED passing result → 422, blocked by the doctrine.
        for (const result of ['Pass', 'pass', 'PASS']) {
          const r = await api('POST', `/api/fi-inspections/${inspId}/complete`, chief,
            { completedDate: '2026-07-12', result });
          assert.equal(r.status, 422, `"${result}" must be refused by the doctrine: ${JSON.stringify(r.json)}`);
          assert.equal(r.json.code, 'PASS_WITH_OPEN_VIOLATIONS');
        }
        // …and the refusal did NOT stamp the record.
        const still = await api('GET', `/api/fi-inspections/${inspId}`, chief);
        assert.equal(still.json.data.completedDate, null, 'a refused completion leaves the record open');
      });

      // 0055 (2026-07-14). The doctrine used to be enforced by a REGEX (/^pass\b/i) against
      // a free-text column, so the guard's behavior depended on English morphology:
      //     'Passed' / 'PASSED' / 'Passing'  → the guard NEVER FIRED.
      // A building with unabated violations could be recorded as passing by using the past
      // tense. The result is now a CLOSED SET: these are not "a pass that slips the guard",
      // they are NOT A RESULT AT ALL, and they are refused at the door.
      await t.test('the word-forms that defeated the old regex are now refused OUTRIGHT', async () => {
        for (const result of ['Passed', 'PASSED', 'Passing', 'Pass with Violations', 'Conditional']) {
          const r = await api('POST', `/api/fi-inspections/${inspId}/complete`, chief,
            { completedDate: '2026-07-12', result });
          assert.equal(r.status, 400,
            `"${result}" is not a recognized result and must be refused: ${JSON.stringify(r.json)}`);
        }
        // The refusal stamped NOTHING — which is the whole point. Under the old regex,
        // 'Passed' would have COMPLETED this record with an unabated violation on it.
        const still = await api('GET', `/api/fi-inspections/${inspId}`, chief);
        assert.equal(still.json.data.completedDate, null,
          'an unrecognized result must never stamp the record');
        assert.equal(still.json.data.result, null);
      });

      // Completion is CHECK-THEN-WRITE. A rejected reinspection must not leave a
      // completed record carrying an unabated violation with no reinspection —
      // that silently drops the violation out of the loop (found live 2026-07-13).
      await t.test('a refused reinspection leaves the record UNSTAMPED (no partial completion)', async () => {
        // The open violation on this inspection carries a followUpDate, so force
        // the failure with the other precondition: ask to carry nothing.
        const clean = await api('POST', '/api/fi-inspections', chief, {
          propertyId: propId, type: `${MARK} Annual`, notes: `${MARK} no-violations`, violations: [],
        });
        const cleanId = clean.json.data.id;
        const bad = await api('POST', `/api/fi-inspections/${cleanId}/complete`, chief,
          { completedDate: '2026-07-13', result: 'Pass', createReinspection: true });
        assert.equal(bad.status, 400, JSON.stringify(bad.json));
        assert.equal(bad.json.code, 'NOTHING_TO_REINSPECT');
        const after = await api('GET', `/api/fi-inspections/${cleanId}`, chief);
        assert.equal(after.json.data.completedDate, null,
          'the record must NOT be stamped when the reinspection step is refused');
        assert.equal(after.json.data.result, null, 'no result written either');
      });

      // P1-5 (2026-07-16, Matt's call — the field's severity model, NJAC 5:70's line):
      // FAIL is the critical/enforcement disposition (imminent hazards, no grace period);
      // REINSPECTION_REQUIRED is the routine correction cycle. Both directions enforced
      // at the one completion door.
      await t.test('P1-5: FAIL needs a critical finding; a standing imminent hazard cannot ride the routine cycle', async () => {
        // This fixture's open violation is NOT flagged imminent → Fail is a category error.
        const failNoHazard = await api('POST', `/api/fi-inspections/${inspId}/complete`, chief,
          { completedDate: '2026-07-12', result: 'Fail' });
        assert.equal(failNoHazard.status, 422, JSON.stringify(failNoHazard.json));
        assert.equal(failNoHazard.json.code, 'FAIL_REQUIRES_IMMINENT_HAZARD');

        // A fixture WITH an imminent hazard: the routine cycle is refused…
        const hz = await api('POST', '/api/fi-inspections', chief, {
          propertyId: propId, type: `${MARK} Hazard`, notes: `${MARK} hazard fixture`,
          violations: [{ code: '1005', description: 'egress chained shut', status: 'Open',
                         imminentHazard: true, followUpDate: '2026-08-15' }],
        });
        const hzId = hz.json.data.id;
        const rr = await api('POST', `/api/fi-inspections/${hzId}/complete`, chief,
          { completedDate: '2026-07-12', result: 'Reinspection Required' });
        assert.equal(rr.status, 422, JSON.stringify(rr.json));
        assert.equal(rr.json.code, 'IMMINENT_HAZARD_REQUIRES_FAIL');
        const still = await api('GET', `/api/fi-inspections/${hzId}`, chief);
        assert.equal(still.json.data.completedDate, null, 'a refused completion stamps nothing');

        // …and FAIL completes with NO grace period: the reinspection lands inside the
        // dangerous-condition window (completion + 3 days), NOT at the routine
        // 2026-08-15 correct-by the violation carries.
        const fail = await api('POST', `/api/fi-inspections/${hzId}/complete`, chief,
          { completedDate: '2026-07-12', result: 'Fail' });
        assert.equal(fail.status, 200, JSON.stringify(fail.json));
        assert.ok(fail.json.reinspection, 'a critical fail still carries the hazard onto a reinspection');
        assert.equal(String(fail.json.reinspection.scheduledDate).slice(0, 10), '2026-07-15',
          'dangerous-condition window (≤3 days), not the routine correct-by');
      });

      await t.test('complete → carries the open violation with lineage + spawns next cycle at +365', async () => {
        const r = await api('POST', `/api/fi-inspections/${inspId}/complete`, chief,
          { completedDate: '2026-07-12', result: 'Reinspection Required' });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.data.completedDate.slice(0, 10), '2026-07-12');
        // Reinspection: derived date = the open violation's follow-up.
        assert.ok(r.json.reinspection, 'reinspection created');
        reinspectionId = r.json.reinspection.id;
        assert.equal(String(r.json.reinspection.scheduledDate).slice(0, 10), '2026-08-15');
        const carried = r.json.reinspection.violations;
        assert.equal(carried.length, 1, 'only the OPEN violation carries');
        assert.equal(carried[0].code, '1001');
        assert.equal(carried[0].status, 'Open');
        assert.equal(carried[0].carriedFrom, `${inspId}:${openKey}`, 'lineage marker');
        assert.notEqual(carried[0].id, openKey, 'fresh id — photos stay with the original');
        const rowLineage = await pool.query(
          'SELECT carried_from_key FROM fi_violations WHERE inspection_id = $1', [reinspectionId]);
        assert.equal(rowLineage.rows[0].carried_from_key, `${inspId}:${openKey}`, 'lineage in the mirror rows');
        // Next cycle: 2026-07-12 + 365 = 2027-07-12.
        assert.ok(r.json.nextCycle, 'next cycle scheduled');
        nextCycleId = r.json.nextCycle.id;
        assert.equal(r.json.nextCycle.scheduledDate, '2027-07-12');
      });

      // A completed inspection has been SIGNED and its findings SERVED on a notice.
      // Editing it afterwards silently desynchronizes the stored record from the
      // served instrument. The record is final (found live 2026-07-13).
      await t.test('a completed record refuses edits to its findings and checklist', async () => {
        const viol = await api('PATCH', `/api/fi-inspections/${inspId}`, chief,
          { violations: [{ code: '9999', description: 'snuck in after the fact', status: 'Open' }] });
        assert.equal(viol.status, 409, JSON.stringify(viol.json));
        assert.equal(viol.json.code, 'RECORD_FINALIZED');

        const ans = await api('PUT', `/api/fi-inspections/${inspId}/answers`, chief,
          { answers: [{ itemId: 1, prompt: 'rewritten after the fact', answer: 'yes' }] });
        assert.equal(ans.status, 409, JSON.stringify(ans.json));
        assert.equal(ans.json.code, 'RECORD_FINALIZED');

        // The original findings are intact.
        const after = await api('GET', `/api/fi-inspections/${inspId}`, chief);
        assert.ok(!after.json.data.violations.some((v) => v.code === '9999'),
          'the injected violation must not be on the record');
      });

      await t.test('completion is not repeatable; next-cycle spawn is idempotent', async () => {
        const again = await api('POST', `/api/fi-inspections/${inspId}/complete`, chief, { completedDate: '2026-07-12' });
        assert.equal(again.status, 409, 'already completed → 409');
        // The reinspection exists to VERIFY the correction. Resolve the carried
        // violation first — only THEN is a passing result legal (2026-07-13).
        const re = await api('GET', `/api/fi-inspections/${reinspectionId}`, chief);
        const resolved = re.json.data.violations.map((v) => ({ ...v, status: 'Corrected' }));
        const fix = await api('PATCH', `/api/fi-inspections/${reinspectionId}`, chief, { violations: resolved });
        assert.equal(fix.status, 200, JSON.stringify(fix.json));
        // Complete the REINSPECTION clean on the same calendar — no duplicate annual.
        const r = await api('POST', `/api/fi-inspections/${reinspectionId}/complete`, chief,
          { completedDate: '2026-08-15', result: 'Pass', createReinspection: false, scheduleNextCycle: false });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.reinspection, null);
        const dupeProbe = await api('POST', '/api/fi-inspections', chief, {
          propertyId: propId, type: `${MARK} Annual`, notes: `${MARK} second annual`, completedDate: null,
          violations: [],
        });
        const secondId = dupeProbe.json.data.id;
        const c2 = await api('POST', `/api/fi-inspections/${secondId}/complete`, chief, { completedDate: '2026-07-12' });
        assert.equal(c2.status, 200);
        assert.equal(c2.json.nextCycle.id, nextCycleId, 'identical pending cycle reused, not duplicated');
        assert.equal(c2.json.nextCycle.deduplicated, true);
      });

      await t.test('admin_only_commit gate + rank-independent designation unlock', async () => {
        // Crew default ON: a plain member may complete. Then tighten.
        const set = await api('PATCH', '/api/fi-settings', chief, { admin_only_commit: true });
        assert.equal(set.status, 200);
        const fx = await api('POST', '/api/fi-inspections', chief, {
          propertyId: propId, type: 'Follow-Up Inspection', notes: `${MARK} gate fixture`, violations: [],
        });
        const fxId = fx.json.data.id;
        const denied = await api('POST', `/api/fi-inspections/${fxId}/complete`, member,
          { completedDate: '2026-07-12', scheduleNextCycle: false });
        assert.equal(denied.status, 403, 'member blocked by admin_only_commit');
        // Grant the MEMBER (lowest rank) prevention_admin — the bureau model.
        const grant = await api('POST', '/api/fi-designations', chief, { userId: memberId, role: 'prevention_admin' });
        assert.equal(grant.status, 201, JSON.stringify(grant.json));
        const allowed = await api('POST', `/api/fi-inspections/${fxId}/complete`, member,
          { completedDate: '2026-07-12', scheduleNextCycle: false });
        assert.equal(allowed.status, 200, 'designated member commits regardless of rank');
        // Chiefs can't grant to foreign users.
        const foreign = await api('POST', '/api/fi-designations', chief, { userId: 999999999, role: 'inspector' });
        assert.equal(foreign.status, 404);
      });

      await t.test('answers: snapshot findings round-trip', async () => {
        // NOTE: a fresh, OPEN inspection — `inspId` is completed by the subtests
        // above, and a completed record now refuses answer edits (RECORD_FINALIZED).
        const open = await api('POST', '/api/fi-inspections', chief, {
          propertyId: propId, type: `${MARK} Annual`, notes: `${MARK} answers round-trip`, violations: [],
        });
        const openId = open.json.data.id;
        const put = await api('PUT', `/api/fi-inspections/${openId}/answers`, chief, {
          checklistId: null,
          answers: [
            { itemId: null, prompt: 'Exits clear?', code: '1001', answer: 'no' },
            { itemId: null, prompt: 'Housekeeping acceptable?', code: '', answer: 'yes' },
            { itemId: null, prompt: 'Sprinkler riser accessible?', code: '', answer: 'na' },
          ],
        });
        assert.equal(put.status, 200, JSON.stringify(put.json));
        const got = await api('GET', `/api/fi-inspections/${openId}/answers`, chief);
        assert.equal(got.json.data.length, 3);
        assert.equal(got.json.data[0].answer, 'no');
        assert.equal(got.json.data[0].code_snapshot, '1001');
      });
    } finally {
      await cleanupFixtures();
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
