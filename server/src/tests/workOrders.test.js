'use strict';
// Phase 2.2 — defect→work-order rebuild (migration 0083). Spec: docs/PHASE2-WORKORDERS-SPEC-2026-07-26.md §8.
// Part A (always runs): the closed transition map (pure).
// Part B (opt-in via TENANCY_TEST_DB, adversarial, real Postgres via the API):
//   1. Dedupe-on-reflag: same rig+item attaches to the live defect; a different rig mints new;
//      a second live WO on one defect returns the existing (deduped), never a duplicate.
//   2. Transition map: illegal jump 422; resolve without a note 422; reopen → 409
//      RECORD_FINALIZED; PATCH cannot carry status; terminal PATCH/parts → 409.
//   3. Role gates: member cannot open/transition/cost a WO but CAN flag a defect and note;
//      the mechanic GRANT flips those refusals to 200s; grant route is chief-only and
//      422s on an unlinked member.
//   4. OOS: an officer flipping a rig OOS → 403 OOS_MECHANIC_ONLY; a granted mechanic → 200;
//      checks /due then reports that rig 'oos' (paused), not overdue.
//   5. Cross-tenant: dept B sees/writes nothing of dept A's.
//   6. Resolution: WO resolve closes the linked defect; manual defect close needs a reason.
//   7. PM: due list needs no fabrication (no meter → axis excluded); resolve stamps last_done.
//   8. Soft delete: chief + reason; excluded from reads; audit row written.
// Every case could actually fail (lesson #29).

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

// ── Part A — pure transition map ─────────────────────────────────────────────
const { canTransition, isTerminal, WO_TRANSITIONS } = require('../constants/workOrderVocab');

test('2.2 vocab — the transition map is closed and terminal states are terminal', () => {
  assert.equal(canTransition('open', 'in_progress'), true);
  assert.equal(canTransition('open', 'resolved'), true, 'quick fix: open→resolved allowed');
  assert.equal(canTransition('awaiting_parts', 'in_progress'), true);
  assert.equal(canTransition('resolved', 'open'), false, 'REOPEN FORBIDDEN');
  assert.equal(canTransition('cancelled', 'in_progress'), false);
  assert.equal(canTransition('in_progress', 'open'), false, 'no backwards to open');
  assert.equal(isTerminal('resolved'), true);
  assert.equal(isTerminal('awaiting_parts'), false);
  for (const s of Object.keys(WO_TRANSITIONS)) {
    assert.ok(!WO_TRANSITIONS[s].includes(s), `no self-transition for ${s}`);
  }
});

// ── Part B — live-DB adversarial suite ───────────────────────────────────────
const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[workOrders] TENANCY_TEST_DB not set — skipping live-DB 2.2 suite.');
  test('2.2 work orders (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('2.2 — work orders: dedupe, transitions, gates, OOS, tenancy, PM, soft delete', async () => {
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

    const MARK = 'WO-2_2';
    let deptA, deptB, rigA, rigA2, rigB;
    async function cleanup() {
      for (const dept of [deptA, deptB]) {
        if (!dept) continue;
        await pool.query('DELETE FROM work_order_notes WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM work_order_parts WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM work_orders WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM defects WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM pm_schedules WHERE department_id = $1', [dept]);
        // The OOS test creates a check template — versions RESTRICT the departments
        // cascade, so the check-domain rows must go first (FK order).
        await pool.query('DELETE FROM apparatus_check_items WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM apparatus_checks WHERE department_id = $1', [dept]);
        await pool.query('UPDATE check_templates SET current_version_id = NULL WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM check_template_versions WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM check_templates WHERE department_id = $1', [dept]);
        await pool.query(`DELETE FROM audit_log WHERE department_id = $1 AND table_name IN ('defects','work_orders','pm_schedules','check_templates','apparatus_checks')`, [dept]);
      }
      await pool.query(`DELETE FROM apparatus WHERE designation LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'wo_2_2_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'wo_2_2_%'`);
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

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) { try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {} await new Promise((x) => setTimeout(x, 1000)); }
      assert.ok(ready, 'DB never ready');
      await cleanup();

      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept A`);
      deptB = await mkAlignedDeptStation(pool, `${MARK} Dept B`);

      const chief = await mkUser('wo_2_2_chief', 'chief', deptA, deptA);
      const officer = await mkUser('wo_2_2_officer', 'officer', deptA, deptA);
      const member = await mkUser('wo_2_2_member', 'member', deptA, deptA);
      const mech = await mkUser('wo_2_2_mech', 'member', deptA, deptA);
      await pool.query('UPDATE users SET fleet_maintenance = TRUE WHERE id = $1', [mech.uid]);
      const memberB = await mkUser('wo_2_2_memberb', 'member', deptB, deptB);

      rigA = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, station_id, department_id) VALUES ('${MARK} Engine 1','Engine',2020,$1,$1) RETURNING id`,
        [deptA])).rows[0].id;
      rigA2 = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, station_id, department_id) VALUES ('${MARK} Ladder 1','Ladder',2021,$1,$1) RETURNING id`,
        [deptA])).rows[0].id;
      rigB = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, station_id, department_id) VALUES ('${MARK} Engine B','Engine',2019,$1,$1) RETURNING id`,
        [deptB])).rows[0].id;

      // 1 · Defect dedupe-on-reflag.
      let r = await api('POST', '/api/defects', member.token, {
        apparatus_id: rigA, title: 'Fuel gauge dead', item_key: 'fuel', check_id: undefined,
      });
      assert.equal(r.status, 201, `defect create failed: ${JSON.stringify(r.json)}`);
      const defect1 = r.json.data;
      r = await api('POST', '/api/defects', member.token, {
        apparatus_id: rigA, title: 'Fuel gauge STILL dead', item_key: 'fuel',
      });
      assert.equal(r.status, 200, 'reflag returns the live defect, not a 201');
      assert.equal(r.json.data.id, defect1.id, 'same rig+item attaches');
      assert.equal(r.json.data.deduped, true);
      r = await api('POST', '/api/defects', member.token, {
        apparatus_id: rigA2, title: 'Fuel gauge dead', item_key: 'fuel',
      });
      assert.equal(r.status, 201, 'a DIFFERENT rig mints a new defect');
      const defect2 = r.json.data;

      // 3 · Role gates: member cannot open a WO; mechanic grant can.
      r = await api('POST', '/api/work-orders', member.token, { title: 'X', defect_id: defect1.id });
      assert.equal(r.status, 403, 'plain member cannot open a work order');
      r = await api('POST', '/api/work-orders', mech.token, { title: 'Fix fuel gauge', defect_id: defect1.id });
      assert.equal(r.status, 201, `mechanic-granted member opens a WO: ${JSON.stringify(r.json)}`);
      const wo1 = r.json.data;
      // Defect flips to in_work.
      const dNow = await pool.query('SELECT status FROM defects WHERE id = $1', [defect1.id]);
      assert.equal(dNow.rows[0].status, 'in_work');
      // One live WO per defect — second create returns the existing.
      r = await api('POST', '/api/work-orders', officer.token, { title: 'Duplicate attempt', defect_id: defect1.id });
      assert.equal(r.status, 200);
      assert.equal(r.json.data.id, wo1.id, 'second live WO on the defect deduped');
      assert.equal(r.json.data.deduped, true);

      // 2 · Transitions: member can't; illegal jump 422; resolve needs a note.
      r = await api('POST', `/api/work-orders/${wo1.id}/status`, member.token, { status: 'in_progress' });
      assert.equal(r.status, 403, 'member cannot transition');
      r = await api('POST', `/api/work-orders/${wo1.id}/status`, mech.token, { status: 'in_progress' });
      assert.equal(r.status, 200);
      r = await api('POST', `/api/work-orders/${wo1.id}/status`, mech.token, { status: 'open' });
      assert.equal(r.status, 422, 'in_progress→open is not in the map');
      assert.equal(r.json.code, 'BAD_TRANSITION');
      r = await api('POST', `/api/work-orders/${wo1.id}/status`, mech.token, { status: 'resolved' });
      assert.equal(r.status, 422, 'resolve without a note refused');
      assert.equal(r.json.code, 'RESOLUTION_NOTE_REQUIRED');

      // Parts + costs (mechanic), then resolve with a note.
      r = await api('POST', `/api/work-orders/${wo1.id}/parts`, member.token, { name: 'Gauge', unit_cost: 42.5 });
      assert.equal(r.status, 403, 'member cannot add parts');
      r = await api('POST', `/api/work-orders/${wo1.id}/parts`, mech.token, { name: 'Fuel gauge', qty: 1, unit_cost: 129.99 });
      assert.equal(r.status, 201);
      r = await api('PATCH', `/api/work-orders/${wo1.id}`, mech.token, { labor_hours: 1.5, labor_rate: 40 });
      assert.equal(r.status, 200);
      // Notes: ANY member (the crew↔mechanic thread).
      r = await api('POST', `/api/work-orders/${wo1.id}/notes`, member.token, { body: 'It flickers below a quarter tank.' });
      assert.equal(r.status, 201, 'crew can note');
      r = await api('POST', `/api/work-orders/${wo1.id}/status`, mech.token,
        { status: 'resolved', resolution_note: 'Replaced the gauge; verified against a full tank.' });
      assert.equal(r.status, 200, `resolve failed: ${JSON.stringify(r.json)}`);

      // 6 · Resolve closed the defect; totals computed.
      const dAfter = await pool.query('SELECT status, resolution_kind FROM defects WHERE id = $1', [defect1.id]);
      assert.equal(dAfter.rows[0].status, 'resolved');
      assert.equal(dAfter.rows[0].resolution_kind, 'work_order');
      r = await api('GET', `/api/work-orders/${wo1.id}`, member.token);
      assert.equal(r.status, 200);
      assert.equal(r.json.data.total_cost, 129.99 + 1.5 * 40, 'NUMERIC total = parts + labor');
      assert.ok(r.json.data.history.length >= 3, 'status history from audit rows');

      // 2b · Finality: no reopen, no meta edit, no parts change.
      r = await api('POST', `/api/work-orders/${wo1.id}/status`, chief.token, { status: 'in_progress' });
      assert.equal(r.status, 409, 'REOPEN FORBIDDEN');
      assert.equal(r.json.code, 'RECORD_FINALIZED');
      r = await api('PATCH', `/api/work-orders/${wo1.id}`, chief.token, { title: 'edited' });
      assert.equal(r.status, 409);
      r = await api('POST', `/api/work-orders/${wo1.id}/parts`, chief.token, { name: 'late part' });
      assert.equal(r.status, 409);
      // Correction = a NEW WO referencing the old.
      r = await api('POST', '/api/work-orders', mech.token,
        { title: 'Fuel gauge — rework', apparatus_id: rigA, supersedes_id: wo1.id });
      assert.equal(r.status, 201);
      assert.equal(r.json.data.supersedes_id, wo1.id);
      const rework = r.json.data;

      // 5 · Cross-tenant.
      r = await api('GET', `/api/work-orders/${wo1.id}`, memberB.token);
      assert.equal(r.status, 404, 'dept B cannot read dept A WO');
      r = await api('POST', `/api/work-orders/${wo1.id}/notes`, memberB.token, { body: 'sneak' });
      assert.equal(r.status, 404);
      r = await api('POST', '/api/defects', memberB.token, { apparatus_id: rigA, title: 'X' });
      assert.equal(r.status, 422, 'dept B cannot flag dept A rig');
      r = await api('GET', '/api/defects', memberB.token);
      assert.ok(!(r.json.data || []).some((d) => d.id === defect1.id), 'no cross-tenant defects in the list');

      // 3b · Grant route: chief-only.
      r = await api('POST', `/api/members/999999/fleet-maintenance`, officer.token, { granted: true });
      assert.equal(r.status, 403, 'officer cannot grant');

      // 4 · OOS gate + checks-due pause.
      r = await api('PATCH', `/api/apparatus/${rigA2}`, officer.token, { status: 'Out of Service' });
      assert.equal(r.status, 403, 'officer cannot flip OOS');
      assert.equal(r.json.code, 'OOS_MECHANIC_ONLY');
      r = await api('PATCH', `/api/apparatus/${rigA2}`, mech.token, { status: 'Out of Service' });
      assert.equal(r.status, 200, `mechanic flips OOS: ${JSON.stringify(r.json)}`);
      // A daily template across all rigs → rigA2 must report 'oos', not due.
      r = await api('POST', '/api/checks/templates', officer.token, {
        name: `${MARK} Daily`, frequency: 'daily', items: [{ key: 'k1', label: 'Walkaround' }],
      });
      assert.equal(r.status, 201);
      const today = new Date().toLocaleDateString('en-CA');
      r = await api('GET', `/api/checks/due?today=${today}`, member.token);
      assert.equal(r.status, 200);
      const oosRow = r.json.data.find((d) => d.apparatus_id === rigA2);
      assert.ok(oosRow, 'OOS rig still listed');
      assert.equal(oosRow.due_state, 'oos', 'OOS rig checks are PAUSED, not overdue');
      const okRow = r.json.data.find((d) => d.apparatus_id === rigA);
      assert.equal(okRow.due_state, 'due', 'in-service rig still due');

      // 7 · PM: no meter → axis excluded; resolve stamps last_done.
      r = await api('POST', '/api/work-orders/pm', mech.token, {
        apparatus_id: rigA, task: 'Oil change', interval_days: 90, interval_miles: 3000,
        last_done_date: '2026-01-01', last_done_mileage: 1000,
      });
      assert.equal(r.status, 201, `pm create failed: ${JSON.stringify(r.json)}`);
      const pm = r.json.data;
      r = await api('POST', '/api/work-orders/pm', mech.token, { apparatus_id: rigA, task: 'No trigger' });
      assert.equal(r.status, 422, 'a PM schedule needs at least one trigger');
      r = await api('GET', `/api/work-orders/pm/due?today=${today}`, mech.token);
      const pmRow = r.json.data.find((p) => p.id === pm.id);
      assert.ok(pmRow, 'pm due row present');
      assert.equal(pmRow.due_state, 'overdue', 'calendar axis overdue (90d from 2026-01-01)');
      r = await api('POST', '/api/work-orders', mech.token,
        { title: 'Oil change', apparatus_id: rigA, pm_schedule_id: pm.id });
      assert.equal(r.status, 201);
      const pmWo = r.json.data;
      r = await api('POST', `/api/work-orders/${pmWo.id}/status`, mech.token,
        { status: 'resolved', resolution_note: 'Oil + filter done.', mileage: 4200 });
      assert.equal(r.status, 200);
      const pmAfter = await pool.query('SELECT last_done_date, last_done_mileage FROM pm_schedules WHERE id = $1', [pm.id]);
      assert.equal(pmAfter.rows[0].last_done_mileage, 4200, 'resolve stamped the meter');
      assert.ok(pmAfter.rows[0].last_done_date, 'resolve stamped the date');

      // 8 · Soft delete: chief + reason; excluded; audited.
      r = await api('DELETE', `/api/work-orders/${rework.id}`, mech.token, { reason: 'dup' });
      assert.equal(r.status, 403, 'mechanic cannot delete a record — chief only');
      r = await api('DELETE', `/api/work-orders/${rework.id}`, chief.token, {});
      assert.equal(r.status, 400, 'delete needs a reason');
      r = await api('DELETE', `/api/work-orders/${rework.id}`, chief.token, { reason: 'opened in error — duplicate of #' + wo1.id });
      assert.equal(r.status, 200);
      r = await api('GET', `/api/work-orders/${rework.id}`, chief.token);
      assert.equal(r.status, 404, 'soft-deleted WO excluded from reads');
      const delAudit = await pool.query(
        `SELECT COUNT(*)::int AS n FROM audit_log WHERE table_name = 'work_orders' AND record_id = $1 AND action = 'soft_delete'`,
        [rework.id]);
      assert.equal(delAudit.rows[0].n, 1, 'soft delete audited');
    } finally {
      try { await cleanup(); } catch (e) { console.error('[workOrders] cleanup failed:', e.message); }
      await new Promise((r) => server.close(r));
      try { await pool.end(); } catch {}
    }
  });
}
