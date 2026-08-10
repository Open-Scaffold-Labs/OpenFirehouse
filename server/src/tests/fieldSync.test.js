'use strict';
// Phase 2.6 — field logistics ops on the ONE sync brain (no migration; ops land in
// 0082/0083 tables). Spec: docs/PHASE2-OFM-FIELD-SPEC-2026-07-26.md §4.
// Opt-in via TENANCY_TEST_DB (live Postgres through the real API). Every case could
// actually fail (lesson #29):
//   1. Crew member drains check.complete through /api/fi-sync/batch → applied; the
//      result_code is SERVER-derived (a failed item ⇒ DEFECTS_FOUND) and the check +
//      its items exist in the DB.
//   2. Byte-for-byte replay → `duplicate`; check count UNCHANGED (never double-written).
//   3. defect.create with check_client_id in the SAME batch → the defect lands with
//      check_id resolved through the idempotency ledger.
//   4. Linkage DEGRADES: check op rejected (stale version) ⇒ its dependent defect still
//      lands, check_id null — the rig problem is real even when the check record died.
//   5. STALE_TEMPLATE_VERSION arrives as a per-op rejection; sibling ops still apply.
//   6. Reflag dedupe across the offline boundary: a live web-created defect for the same
//      rig+item answers the offline flag with deduped, same id — never a copy.
//   7. Cross-tenant: dept B's batch citing dept A's template/rig is refused per-op.
//   8. A client-supplied result_code is refused (strict schema — INVALID_PAYLOAD).
//   9. Mixed-batch authorization: with crew inspections OFF, a plain member's check +
//      defect ops APPLY while the fi op in the same batch is refused FORBIDDEN.
//  10. offline-pack: crew-readable; carries templates w/ item snapshots + apparatus +
//      due board; dept B's pack never leaks dept A rows.

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[fieldSync] TENANCY_TEST_DB not set — skipping live-DB 2.6 suite.');
  test('2.6 field sync ops (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('2.6 — check.complete + defect.create ride the sync brain under its guarantees', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const h = realSetInterval(...a); if (h && h.unref) h.unref(); return h; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const uuid = () => crypto.randomUUID();
    async function api(method, path, token, body) {
      const res = await fetch(baseUrl + path, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, json };
    }

    const MARK = 'FLD-2_6';
    let deptA, deptB, rigA, rigB;
    async function cleanup() {
      for (const dept of [deptA, deptB]) {
        if (!dept) continue;
        await pool.query('DELETE FROM work_order_notes WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM work_orders WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM defects WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM apparatus_check_items WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM apparatus_checks WHERE department_id = $1', [dept]);
        await pool.query('UPDATE check_templates SET current_version_id = NULL WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM check_template_versions WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM check_templates WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM fi_sync_ops WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM fi_settings WHERE department_id = $1', [dept]);
        await pool.query(`DELETE FROM audit_log WHERE department_id = $1 AND table_name IN ('check_templates','apparatus_checks','defects','fi_sync_ops')`, [dept]);
      }
      await pool.query(`DELETE FROM apparatus WHERE designation LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'fld_2_6_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'fld_2_6_%'`);
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

      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept A`);
      deptB = await mkAlignedDeptStation(pool, `${MARK} Dept B`);

      const officer = await mkUser('fld_2_6_officer', 'officer', deptA, deptA);
      const member  = await mkUser('fld_2_6_member', 'member', deptA, deptA);
      const memberB = await mkUser('fld_2_6_memberb', 'member', deptB, deptB);

      rigA = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, station_id, department_id) VALUES ('${MARK} Engine 1','Engine',2020,$1,$1) RETURNING id`,
        [deptA])).rows[0].id;
      rigB = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, station_id, department_id) VALUES ('${MARK} Engine B','Engine',2019,$1,$1) RETURNING id`,
        [deptB])).rows[0].id;

      // Officer mints the template the crew will run offline (v1, two items).
      let r = await api('POST', '/api/checks/templates', officer.token, {
        name: `${MARK} Engine 1 Daily`, frequency: 'daily', apparatus_id: rigA,
        items: [
          { key: 'fuel', section: 'Cab', label: 'Fuel ≥ 3/4' },
          { key: 'brakes', section: 'Chassis', label: 'Air brake check' },
        ],
      });
      assert.equal(r.status, 201, `template create failed: ${JSON.stringify(r.json)}`);
      const tplId = r.json.data.id;
      const v1Id = r.json.data.version_id;

      const checkPayload = {
        template_id: tplId, template_version_id: v1Id, apparatus_id: rigA, check_date: today,
        items: [
          { item_key: 'fuel', outcome: 'pass' },
          { item_key: 'brakes', outcome: 'fail', note: 'slow air build' },
        ],
      };

      let checkServerId; // resolved by test 1, used by later reads
      const checkOpId = uuid();
      const defectOpId = uuid();

      await t.test('1+3 · a drained check applies with a SERVER-derived result; the same-batch defect resolves its check linkage through the ledger', async () => {
        const ops = [
          { clientId: checkOpId, op: 'check.complete', inspectionId: null, payload: checkPayload },
          { clientId: defectOpId, op: 'defect.create', inspectionId: null,
            payload: { apparatus_id: rigA, title: 'Slow air build', item_key: 'brakes',
                       priority: 'urgent', check_client_id: checkOpId } },
        ];
        const res = await api('POST', '/api/fi-sync/batch', member.token, { ops });
        assert.equal(res.status, 200, JSON.stringify(res.json));
        const by = Object.fromEntries(res.json.results.map((x) => [x.clientId, x]));
        assert.equal(by[checkOpId].status, 'applied', JSON.stringify(by[checkOpId]));
        assert.equal(by[checkOpId].result_code, 'DEFECTS_FOUND',
          'the SERVER derived the result — a failed item is a defect, no matter what the device shows');
        assert.equal(by[defectOpId].status, 'applied', JSON.stringify(by[defectOpId]));
        checkServerId = by[checkOpId].id;

        const chk = await pool.query('SELECT * FROM apparatus_checks WHERE id = $1', [checkServerId]);
        assert.equal(chk.rows.length, 1, 'the check row exists');
        assert.equal(chk.rows[0].result_code, 'DEFECTS_FOUND');
        assert.equal(Number(chk.rows[0].failed_count), 1);
        const items = await pool.query('SELECT * FROM apparatus_check_items WHERE check_id = $1', [checkServerId]);
        assert.equal(items.rows.length, 2, 'both item outcomes persisted');

        const d = await pool.query('SELECT * FROM defects WHERE id = $1', [by[defectOpId].id]);
        assert.equal(d.rows.length, 1);
        assert.equal(Number(d.rows[0].check_id), Number(checkServerId),
          'check_client_id resolved to the REAL check id through the fi_sync_ops ledger');
        assert.equal(d.rows[0].source, 'check');
        assert.equal(d.rows[0].item_key, 'brakes');
      });

      await t.test('2 · a byte-for-byte replay is answered duplicate and writes NOTHING twice', async () => {
        const before = await pool.query('SELECT COUNT(*)::int AS n FROM apparatus_checks WHERE department_id = $1 AND deleted_at IS NULL', [deptA]);
        const beforeDef = await pool.query('SELECT COUNT(*)::int AS n FROM defects WHERE department_id = $1', [deptA]);
        const res = await api('POST', '/api/fi-sync/batch', member.token, { ops: [
          { clientId: checkOpId, op: 'check.complete', inspectionId: null, payload: checkPayload },
          { clientId: defectOpId, op: 'defect.create', inspectionId: null,
            payload: { apparatus_id: rigA, title: 'Slow air build', item_key: 'brakes',
                       priority: 'urgent', check_client_id: checkOpId } },
        ] });
        const by = Object.fromEntries(res.json.results.map((x) => [x.clientId, x]));
        assert.equal(by[checkOpId].status, 'duplicate', 'the key was recognized, not re-applied');
        assert.equal(by[defectOpId].status, 'duplicate');
        assert.equal(Number(by[checkOpId].id), Number(checkServerId), 'the replay hands back the ORIGINAL id');
        const after = await pool.query('SELECT COUNT(*)::int AS n FROM apparatus_checks WHERE department_id = $1 AND deleted_at IS NULL', [deptA]);
        const afterDef = await pool.query('SELECT COUNT(*)::int AS n FROM defects WHERE department_id = $1', [deptA]);
        assert.equal(after.rows[0].n, before.rows[0].n, 'check count unchanged — the whole point of the key');
        assert.equal(afterDef.rows[0].n, beforeDef.rows[0].n, 'defect count unchanged');
      });

      await t.test('6 · the offline reflag dedupes against the live defect — same id, never a copy', async () => {
        const res = await api('POST', '/api/fi-sync/batch', member.token, { ops: [
          { clientId: uuid(), op: 'defect.create', inspectionId: null,
            payload: { apparatus_id: rigA, title: 'Air brakes again', item_key: 'brakes' } },
        ] });
        const out = res.json.results[0];
        assert.equal(out.status, 'applied');
        assert.equal(out.deduped, true, 'the live defect answered — not a duplicate row');
        const n = await pool.query(
          `SELECT COUNT(*)::int AS n FROM defects WHERE department_id = $1 AND apparatus_id = $2 AND item_key = 'brakes' AND status IN ('open','in_work')`,
          [deptA, rigA]);
        assert.equal(n.rows[0].n, 1, 'exactly ONE live defect for the rig+item');
      });

      await t.test('5+4 · a stale template version is refused per-op; its dependent defect still lands, linkage degraded to null', async () => {
        // Officer edits items → mints v2; the device still holds v1.
        const patch = await api('PATCH', `/api/checks/templates/${tplId}`, officer.token, {
          items: [
            { key: 'fuel', section: 'Cab', label: 'Fuel ≥ 3/4' },
            { key: 'brakes', section: 'Chassis', label: 'Air brake check' },
            { key: 'lights', section: 'Exterior', label: 'Emergency lights' },
          ],
        });
        assert.equal(patch.status, 200, JSON.stringify(patch.json));

        const staleCheckOp = uuid();
        const orphanDefectOp = uuid();
        const res = await api('POST', '/api/fi-sync/batch', member.token, { ops: [
          { clientId: staleCheckOp, op: 'check.complete', inspectionId: null, payload: checkPayload },
          { clientId: orphanDefectOp, op: 'defect.create', inspectionId: null,
            payload: { apparatus_id: rigA, title: 'Wiper blade torn', item_key: 'wipers',
                       check_client_id: staleCheckOp } },
        ] });
        const by = Object.fromEntries(res.json.results.map((x) => [x.clientId, x]));
        assert.equal(by[staleCheckOp].status, 'rejected');
        assert.equal(by[staleCheckOp].code, 'STALE_TEMPLATE_VERSION',
          'the offline door enforces the SAME version guard as the online route');
        assert.equal(by[orphanDefectOp].status, 'applied',
          'one op failing never takes its siblings down');
        const d = await pool.query('SELECT check_id FROM defects WHERE id = $1', [by[orphanDefectOp].id]);
        assert.equal(d.rows[0].check_id, null,
          'linkage degrades honestly — the defect stands alone on rig+item');
        // The rejected claim was RELEASED: a corrected retry must not read as duplicate.
        const claim = await pool.query('SELECT 1 FROM fi_sync_ops WHERE department_id = $1 AND client_id = $2', [deptA, staleCheckOp]);
        assert.equal(claim.rows.length, 0, 'a rejection records NOTHING in the ledger');
      });

      await t.test('7 · dept B cannot drain ops against dept A\'s template or rig', async () => {
        const res = await api('POST', '/api/fi-sync/batch', memberB.token, { ops: [
          { clientId: uuid(), op: 'check.complete', inspectionId: null, payload: checkPayload },
          { clientId: uuid(), op: 'defect.create', inspectionId: null,
            payload: { apparatus_id: rigA, title: 'X', item_key: 'fuel' } },
        ] });
        for (const out of res.json.results) {
          assert.equal(out.status, 'rejected', JSON.stringify(out));
          assert.ok(['NOT_FOUND', 'BAD_APPARATUS'].includes(out.code),
            `cross-tenant refusal, got ${out.code}`);
        }
        const leaked = await pool.query(
          `SELECT COUNT(*)::int AS n FROM defects WHERE department_id = $1`, [deptB]);
        assert.equal(leaked.rows[0].n, 0, 'nothing landed in dept B either');
      });

      await t.test('8 · a client-supplied result_code is REFUSED, not ignored (strict schema)', async () => {
        const res = await api('POST', '/api/fi-sync/batch', member.token, { ops: [
          { clientId: uuid(), op: 'check.complete', inspectionId: null,
            payload: { ...checkPayload, result_code: 'PASS' } },
        ] });
        const out = res.json.results[0];
        assert.equal(out.status, 'rejected');
        assert.equal(out.code, 'INVALID_PAYLOAD',
          'the device does not get to assert pass/fail — ever, on any transport');
      });

      await t.test('9 · mixed batch: crew ops apply while the fi op is refused FORBIDDEN (crew inspections OFF)', async () => {
        await pool.query(
          `INSERT INTO fi_settings (department_id, allow_crew_inspections) VALUES ($1, FALSE)
           ON CONFLICT (department_id) DO UPDATE SET allow_crew_inspections = FALSE`, [deptA]);
        try {
          const crewOp = uuid(); const fiOp = uuid();
          const res = await api('POST', '/api/fi-sync/batch', member.token, { ops: [
            { clientId: crewOp, op: 'defect.create', inspectionId: null,
              payload: { apparatus_id: rigA, title: 'Cracked mirror' } },
            { clientId: fiOp, op: 'inspection.patch', inspectionId: 999999, payload: { notes: 'x' } },
          ] });
          const by = Object.fromEntries(res.json.results.map((x) => [x.clientId, x]));
          assert.equal(by[crewOp].status, 'applied', 'crew logistics work needs no inspector designation');
          assert.equal(by[fiOp].status, 'rejected');
          assert.equal(by[fiOp].code, 'FORBIDDEN', 'the fi op still demands the designation — per-op, not per-envelope');
        } finally {
          await pool.query('DELETE FROM fi_settings WHERE department_id = $1', [deptA]);
        }
      });

      await t.test('10 · offline-pack is crew-readable, carries the runnable snapshot, and never leaks cross-tenant', async () => {
        const res = await api('GET', `/api/checks/offline-pack?today=${today}`, member.token);
        assert.equal(res.status, 200, JSON.stringify(res.json));
        const pack = res.json.data;
        const tpl = pack.templates.find((x) => x.id === tplId);
        assert.ok(tpl, 'the template is in the pack');
        assert.ok(Array.isArray(tpl.current_items) && tpl.current_items.length === 3,
          'the pack pins the CURRENT version items (v2 has three)');
        assert.ok(pack.apparatus.some((a) => a.id === rigA), 'the rig is in the pack');
        assert.ok(Array.isArray(pack.due), 'due board present');
        assert.ok(pack.packedAt, 'staleness anchor present');

        const packB = await api('GET', '/api/checks/offline-pack', memberB.token);
        assert.ok(!packB.json.data.templates.some((x) => x.id === tplId), 'dept B pack has no dept A template');
        assert.ok(!packB.json.data.apparatus.some((a) => a.id === rigA), 'dept B pack has no dept A rig');
      });
    } finally {
      try { await cleanup(); } catch (e) { console.error('[fieldSync] cleanup failed:', e.message); }
      await new Promise((res) => server.close(res));
      try { await pool.end(); } catch {}
    }
  });
}
