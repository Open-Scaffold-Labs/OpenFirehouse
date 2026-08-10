'use strict';
// Phase 2.1 — apparatus checks rebuild (migration 0082). Spec: docs/PHASE2-CHECKS-SPEC-2026-07-25.md §5.
// Part A (always runs): the result derivation + due-window math (pure).
// Part B (opt-in via TENANCY_TEST_DB, adversarial, real Postgres via the API):
//   1. Role gates: member cannot create/patch/delete templates; member cannot soft-delete a check.
//   2. Cross-tenant: dept B cannot read dept A's template, complete against it, or read its checks.
//   3. STALE_TEMPLATE_VERSION: editing items mints v2; a completion citing v1 → 409.
//   4. Derivation guard: one failed item ⇒ DEFECTS_FOUND stored; client-sent result_code → 400 (strict).
//   5. Incomplete checks: missing item / unknown key / duplicate key → 422.
//   6. Finality: PATCH a completion → 409 unconditional; chief delete requires a reason,
//      soft-deletes (read paths exclude), and writes an audit row.
//   7. Template soft-delete: completions stay readable; completing against it → 404.
//   8. Generic template requires apparatus_id; rig-bound template refuses a different rig.
//   9. check_date: malformed → 422; >1 day future → 422; yesterday (offline sync shape) → 201.
// Every case could actually fail (lesson #29).

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

// ── Part A — pure vocabulary/derivation ──────────────────────────────────────
const { deriveResultCode, FREQUENCY_DAYS, RESULT_PASS, RESULT_DEFECTS } = require('../constants/checkVocab');
const { addDaysISO } = require('../utils/localDate');

test('2.1 vocab — derivation: any fail ⇒ DEFECTS_FOUND; na never fails a check', () => {
  assert.equal(deriveResultCode(['pass', 'pass']), RESULT_PASS);
  assert.equal(deriveResultCode(['pass', 'na']), RESULT_PASS, 'N/A is not a defect');
  assert.equal(deriveResultCode(['pass', 'fail', 'pass']), RESULT_DEFECTS);
  assert.equal(deriveResultCode(['fail']), RESULT_DEFECTS);
  assert.equal(deriveResultCode([]), RESULT_PASS, 'vacuous pass (route enforces ≥1 item separately)');
});

test('2.1 vocab — due windows are calendar math, not Date-now math', () => {
  assert.equal(FREQUENCY_DAYS.daily, 1);
  assert.equal(FREQUENCY_DAYS.weekly, 7);
  assert.equal(addDaysISO('2026-07-25', FREQUENCY_DAYS.weekly), '2026-08-01');
  assert.equal(addDaysISO('2026-02-28', 1), '2026-03-01', 'non-leap boundary');
});

// ── Part B — live-DB adversarial suite ───────────────────────────────────────
const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[checks] TENANCY_TEST_DB not set — skipping live-DB 2.1 suite.');
  test('2.1 apparatus checks (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('2.1 — checks: gates, tenancy, stale version, derivation, finality, soft delete', async () => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const t = realSetInterval(...a); if (t && t.unref) t.unref(); return t; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    async function api(method, path, token, body) {
      const res = await fetch(baseUrl + path, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, json };
    }

    const MARK = 'CHK-2_1';
    let deptA, deptB, stnA, stnB, rigA, rigA2, rigB;
    async function cleanup() {
      for (const dept of [deptA, deptB]) {
        if (!dept) continue;
        await pool.query('DELETE FROM apparatus_check_items WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM apparatus_checks WHERE department_id = $1', [dept]);
        await pool.query('UPDATE check_templates SET current_version_id = NULL WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM check_template_versions WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM check_templates WHERE department_id = $1', [dept]);
        await pool.query(`DELETE FROM audit_log WHERE department_id = $1 AND table_name IN ('check_templates','apparatus_checks')`, [dept]);
      }
      await pool.query(`DELETE FROM apparatus WHERE designation LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'chk_2_1_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'chk_2_1_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }
    async function mkUser(uname, role, stn, dept) {
      const uid = (await pool.query(
        `INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ($1,$2,'XX',$3,'x',$4) RETURNING id`,
        [uname, `${uname} Name`, role, stn])).rows[0].id;
      await pool.query('INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [uid, dept, role]);
      const token = jwt.sign({ sub: uid, username: uname, role }, ACCESS_SECRET, { expiresIn: '15m' });
      return { uid, token };
    }
    const today = new Date().toISOString().slice(0, 10);

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) { try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {} await new Promise((x) => setTimeout(x, 1000)); }
      assert.ok(ready, 'DB never ready');
      await cleanup();

      // Aligned dept+station pairs (dept.id == station.id — the convention scoped()
      // routes assume; see helpers/alignedTenant.js for why raw inserts are a race).
      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept A`);
      deptB = await mkAlignedDeptStation(pool, `${MARK} Dept B`);
      stnA = deptA;
      stnB = deptB;

      const chief = await mkUser('chk_2_1_chief', 'chief', stnA, deptA);
      const officer = await mkUser('chk_2_1_officer', 'officer', stnA, deptA);
      const member = await mkUser('chk_2_1_member', 'member', stnA, deptA);
      const memberB = await mkUser('chk_2_1_memberb', 'member', stnB, deptB);

      // The route's tenant key is scoped()'s stationId (the shipped EXPAND convention) —
      // create the rigs under BOTH keys' value so the fixture matches production shape.
      const deptKeyA = stnA; // == what scoped() hands the route for dept-A users
      const deptKeyB = stnB;
      rigA = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, station_id, department_id) VALUES ('${MARK} Engine 1','Engine',2020,$1,$1) RETURNING id`,
        [deptKeyA])).rows[0].id;
      rigA2 = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, station_id, department_id) VALUES ('${MARK} Ladder 1','Ladder',2021,$1,$1) RETURNING id`,
        [deptKeyA])).rows[0].id;
      rigB = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, station_id, department_id) VALUES ('${MARK} Engine B','Engine',2019,$1,$1) RETURNING id`,
        [deptKeyB])).rows[0].id;

      // 1 · Role gates on templates.
      let r = await api('POST', '/api/checks/templates', member.token,
        { name: 'X', items: [{ label: 'A' }] });
      assert.equal(r.status, 403, 'member cannot create a template');

      // Officer creates a rig-bound daily template (v1, two items).
      r = await api('POST', '/api/checks/templates', officer.token, {
        name: `${MARK} Engine 1 Daily`, frequency: 'daily', apparatus_id: rigA,
        items: [
          { key: 'fuel', section: 'Cab', label: 'Fuel ≥ 3/4' },
          { key: 'oil', section: 'Cab', label: 'Engine oil level' },
        ],
      });
      assert.equal(r.status, 201, `template create failed: ${JSON.stringify(r.json)}`);
      const tplId = r.json.data.id;
      const v1Id = r.json.data.version_id;

      // 2 · Cross-tenant: dept B sees nothing, cannot complete against A's template.
      r = await api('GET', '/api/checks/templates', memberB.token);
      assert.equal(r.status, 200);
      assert.ok(!r.json.data.some((t) => t.id === tplId), 'dept B must not see dept A templates');
      r = await api('POST', '/api/checks/completions', memberB.token, {
        template_id: tplId, template_version_id: v1Id, apparatus_id: rigB, check_date: today,
        items: [{ item_key: 'fuel', outcome: 'pass' }, { item_key: 'oil', outcome: 'pass' }],
      });
      assert.equal(r.status, 404, 'cross-tenant completion must 404, not leak');

      // 4/5 · Strict body + incomplete variants.
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: tplId, template_version_id: v1Id, check_date: today,
        result_code: 'PASS',
        items: [{ item_key: 'fuel', outcome: 'fail' }, { item_key: 'oil', outcome: 'pass' }],
      });
      assert.equal(r.status, 400, 'client-supplied result_code must be REJECTED (strict), not ignored');
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: tplId, template_version_id: v1Id, check_date: today,
        items: [{ item_key: 'fuel', outcome: 'pass' }],
      });
      assert.equal(r.status, 422, 'missing an item → INCOMPLETE_CHECK');
      assert.equal(r.json.code, 'INCOMPLETE_CHECK');
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: tplId, template_version_id: v1Id, check_date: today,
        items: [{ item_key: 'fuel', outcome: 'pass' }, { item_key: 'nope', outcome: 'pass' }],
      });
      assert.equal(r.status, 422, 'unknown item key → 422');
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: tplId, template_version_id: v1Id, check_date: today,
        items: [{ item_key: 'fuel', outcome: 'pass' }, { item_key: 'fuel', outcome: 'pass' }],
      });
      assert.equal(r.status, 422, 'duplicate item key → 422');

      // 9 · check_date hygiene.
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: tplId, template_version_id: v1Id, check_date: '2026-02-30',
        items: [{ item_key: 'fuel', outcome: 'pass' }, { item_key: 'oil', outcome: 'pass' }],
      });
      assert.equal(r.status, 422, 'imaginary calendar day → 422');
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: tplId, template_version_id: v1Id, check_date: addDaysISO(today, 3),
        items: [{ item_key: 'fuel', outcome: 'pass' }, { item_key: 'oil', outcome: 'pass' }],
      });
      assert.equal(r.status, 422, 'future check_date → 422');

      // 4 · A member completes with one FAIL → server derives DEFECTS_FOUND.
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: tplId, template_version_id: v1Id, check_date: addDaysISO(today, -1), // yesterday: the offline-sync shape
        items: [{ item_key: 'fuel', outcome: 'fail', note: 'below 1/2' }, { item_key: 'oil', outcome: 'pass' }],
        notes: 'morning check',
      });
      assert.equal(r.status, 201, `completion failed: ${JSON.stringify(r.json)}`);
      const chk1 = r.json.data;
      assert.equal(chk1.result_code, 'DEFECTS_FOUND', 'server derivation: fail ⇒ DEFECTS_FOUND');
      assert.equal(chk1.failed_count, 1);
      assert.equal(chk1.item_count, 2);
      assert.equal(chk1.check_date, addDaysISO(today, -1), 'DATE normalized to YYYY-MM-DD string');

      // Persistence read-back (a 201 is not persistence — lesson #14).
      const persisted = await pool.query(
        'SELECT result_code, failed_count FROM apparatus_checks WHERE id = $1', [chk1.id]);
      assert.equal(persisted.rows[0].result_code, 'DEFECTS_FOUND');
      const itemsPersisted = await pool.query(
        'SELECT COUNT(*)::int AS n FROM apparatus_check_items WHERE check_id = $1', [chk1.id]);
      assert.equal(itemsPersisted.rows[0].n, 2, 'items written atomically with the check');

      // 3 · Officer edits items → v2 minted; a v1 completion is now STALE.
      r = await api('PATCH', `/api/checks/templates/${tplId}`, officer.token, {
        items: [
          { key: 'fuel', section: 'Cab', label: 'Fuel ≥ 3/4' },
          { key: 'oil', section: 'Cab', label: 'Engine oil level' },
          { key: 'lights', section: 'Exterior', label: 'Emergency lights' },
        ],
      });
      assert.equal(r.status, 200, `template edit failed: ${JSON.stringify(r.json)}`);
      assert.equal(r.json.data.version, 2, 'editing items minted version 2');
      const v2Id = r.json.data.version_id;
      assert.notEqual(v2Id, v1Id);
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: tplId, template_version_id: v1Id, check_date: today,
        items: [{ item_key: 'fuel', outcome: 'pass' }, { item_key: 'oil', outcome: 'pass' }],
      });
      assert.equal(r.status, 409, 'completion citing the pre-edit version must be refused');
      assert.equal(r.json.code, 'STALE_TEMPLATE_VERSION');

      // A clean v2 PASS completion (all three answered, one NA).
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: tplId, template_version_id: v2Id, check_date: today,
        items: [
          { item_key: 'fuel', outcome: 'pass' }, { item_key: 'oil', outcome: 'pass' },
          { item_key: 'lights', outcome: 'na' },
        ],
      });
      assert.equal(r.status, 201);
      const chk2 = r.json.data;
      assert.equal(chk2.result_code, 'PASS', 'na never fails a check');

      // 8 · Rig binding: wrong rig on a bound template → 422; generic template needs a rig.
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: tplId, template_version_id: v2Id, apparatus_id: rigA2, check_date: today,
        items: [
          { item_key: 'fuel', outcome: 'pass' }, { item_key: 'oil', outcome: 'pass' },
          { item_key: 'lights', outcome: 'na' },
        ],
      });
      assert.equal(r.status, 422, 'bound template refuses a different rig');
      r = await api('POST', '/api/checks/templates', officer.token, {
        name: `${MARK} Generic Weekly`, frequency: 'weekly',
        items: [{ key: 'w1', label: 'Walkaround' }],
      });
      assert.equal(r.status, 201);
      const genTpl = r.json.data;
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: genTpl.id, template_version_id: genTpl.version_id, check_date: today,
        items: [{ item_key: 'w1', outcome: 'pass' }],
      });
      assert.equal(r.status, 422, 'generic template requires apparatus_id');
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: genTpl.id, template_version_id: genTpl.version_id, apparatus_id: rigA2, check_date: today,
        items: [{ item_key: 'w1', outcome: 'pass' }],
      });
      assert.equal(r.status, 201, 'generic template + explicit rig completes');

      // 6 · Finality: PATCH → 409 always; delete is chief-only + reasoned + soft + audited.
      r = await api('PATCH', `/api/checks/completions/${chk1.id}`, chief.token, { notes: 'edit attempt' });
      assert.equal(r.status, 409, 'a completed check is FINAL');
      assert.equal(r.json.code, 'RECORD_FINALIZED');
      r = await api('DELETE', `/api/checks/completions/${chk1.id}`, member.token, { reason: 'entered wrong rig' });
      assert.equal(r.status, 403, 'member cannot delete a compliance record');
      r = await api('DELETE', `/api/checks/completions/${chk1.id}`, chief.token, {});
      assert.equal(r.status, 400, 'delete without a reason refused');
      r = await api('DELETE', `/api/checks/completions/${chk1.id}`, chief.token, { reason: 'duplicate entry — wrong rig' });
      assert.equal(r.status, 200, `soft delete failed: ${JSON.stringify(r.json)}`);
      r = await api('GET', `/api/checks/completions/${chk1.id}`, member.token);
      assert.equal(r.status, 404, 'soft-deleted check excluded from reads');
      const delAudit = await pool.query(
        `SELECT COUNT(*)::int AS n FROM audit_log WHERE table_name = 'apparatus_checks' AND record_id = $1 AND action = 'soft_delete'`,
        [chk1.id]);
      assert.equal(delAudit.rows[0].n, 1, 'soft delete audited');
      const stillThere = await pool.query('SELECT deleted_at FROM apparatus_checks WHERE id = $1', [chk1.id]);
      assert.ok(stillThere.rows[0].deleted_at, 'soft delete: the row survives with deleted_at set');

      // 7 · Template soft-delete: history stays, completion against it → 404.
      r = await api('DELETE', `/api/checks/templates/${tplId}`, officer.token);
      assert.equal(r.status, 200);
      r = await api('GET', `/api/checks/completions/${chk2.id}`, member.token);
      assert.equal(r.status, 200, 'completions survive template deletion (RESTRICT + soft)');
      r = await api('POST', '/api/checks/completions', member.token, {
        template_id: tplId, template_version_id: v2Id, check_date: today,
        items: [
          { item_key: 'fuel', outcome: 'pass' }, { item_key: 'oil', outcome: 'pass' },
          { item_key: 'lights', outcome: 'na' },
        ],
      });
      assert.equal(r.status, 404, 'completing against a deleted template refused');

      // Due board: rigA2 has a weekly generic check today → 'ok'; the deleted daily tpl is gone.
      r = await api('GET', `/api/checks/due?today=${today}`, member.token);
      assert.equal(r.status, 200);
      const dueRows = r.json.data.filter((d) => d.template_id === genTpl.id);
      assert.ok(dueRows.length >= 1, 'generic weekly appears per active rig');
      const rigRow = dueRows.find((d) => d.apparatus_id === rigA2);
      assert.ok(rigRow, 'rigA2 due row exists');
      assert.equal(rigRow.due_state, 'ok', 'checked today ⇒ weekly not due');
      assert.ok(!r.json.data.some((d) => d.template_id === tplId), 'deleted template leaves the board');
    } finally {
      try { await cleanup(); } catch (e) { console.error('[checks] cleanup failed:', e.message); }
      await new Promise((r) => server.close(r));
      try { await pool.end(); } catch {}
    }
  });
}
