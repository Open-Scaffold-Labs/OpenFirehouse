'use strict';
// Phase 2.7 — controlled-substance chain of custody (migration 0087, DALE-GATED).
// Spec: docs/PHASE2-NARCOTICS-SPEC-2026-07-26.md §5. Opt-in via TENANCY_TEST_DB.
// Every case could actually fail (lesson #29):
//   1. PIN discipline: wrong actor PIN → CS_AUTH_FAILED (generic, audited); event NOT written.
//   2. Acquire mints vials tied to the event; §1304.27(b) counterpart required.
//   3. Administer: needs incident #, amount ≤ vial, actor PIN; status via the ONE door.
//   4. Waste: witness REQUIRED, distinct human, with signature; amount must equal remainder.
//   5. Self-witness refused.
//   6. Append-only AT THE DB: UPDATE/DELETE on cs_events refused for of_app (42501) —
//      probed only when the role exists (managed installs); code-level: no PATCH route.
//   7. Count: expected computed server-side; a missing vial mints EXACTLY ONE discrepancy;
//      two DISTINCT verifiers enforced; chief resolution requires a reason.
//   8. restock_hospital mints the §1304.27(c) 72-hour notification.
//   9. Cross-tenant: dept B cannot read dept A's items or write events against them.
//  10. History report carries every §1304.27(a) field for each event.

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');
// A pooled query is not a session — see helpers/withRole.js and sessionStateProbes.test.js.
const { withRole, expectRefused } = require('./helpers/withRole');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[csCustody] TENANCY_TEST_DB not set — skipping live-DB 2.7 suite.');
  test('2.7 CS custody (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('2.7 — CS custody: dual auth, one door, append-only, counts, tenancy', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const h = realSetInterval(...a); if (h && h.unref) h.unref(); return h; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const bcrypt = require('bcrypt');
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
    const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const MARK = 'CS-2_7';
    let deptA, deptB;
    async function cleanup() {
      for (const dept of [deptA, deptB]) {
        if (!dept) continue;
        await pool.query('DELETE FROM cs_notifications WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM cs_discrepancies WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM cs_count_lines WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM cs_counts WHERE department_id = $1', [dept]);
        await pool.query('UPDATE cs_items SET acquired_event_id = NULL WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM cs_events WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM cs_items WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM cs_locations WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM cs_substances WHERE department_id = $1', [dept]);
        await pool.query(`DELETE FROM audit_log WHERE department_id = $1 AND table_name LIKE 'cs_%'`, [dept]);
      }
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'cs_2_7_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'cs_2_7_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }
    async function mkUser(uname, role, dept, pin) {
      const pinHash = pin ? bcrypt.hashSync(pin, 4) : null;
      const uid = (await pool.query(
        `INSERT INTO users (username,name,initials,role,"passwordHash",station_id,cs_pin_hash)
         VALUES ($1,$2,'XX',$3,'x',$4,$5) RETURNING id`,
        [uname, `${uname} Name`, role, dept, pinHash])).rows[0].id;
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
      const chief  = await mkUser('cs_2_7_chief', 'chief', deptA, '1111');
      const medic  = await mkUser('cs_2_7_medic', 'member', deptA, '2222');
      const buddy  = await mkUser('cs_2_7_buddy', 'member', deptA, '3333');
      const noPin  = await mkUser('cs_2_7_nopin', 'member', deptA, null);
      const outsdr = await mkUser('cs_2_7_outsider', 'chief', deptB, '4444');

      // Catalog + vault (chief).
      let r = await api('POST', '/api/cs/substances', chief.token,
        { name: `${MARK} Fentanyl`, schedule: 'II', finished_form: '100 mcg / 2 mL vial', unit_label: 'mcg', units_per_container: 100 });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      const subId = r.json.data.id;
      r = await api('POST', '/api/cs/locations', chief.token,
        { name: `${MARK} Medic 1 Box`, kind: 'box', seal_mode: 'single' });
      assert.equal(r.status, 201);
      const locId = r.json.data.id;
      r = await api('POST', '/api/cs/substances', medic.token,
        { name: 'X', schedule: 'II', finished_form: 'x', unit_label: 'mg', units_per_container: 1 });
      assert.equal(r.status, 403, 'catalog is chief-gated');

      let vial1, vial2;
      await t.test('1+2 · acquire needs the counterpart and a good PIN; mints vials tied to the event', async () => {
        // Wrong PIN → generic refusal, nothing written.
        let res = await api('POST', '/api/cs/events', chief.token, {
          kind: 'acquire', substance_id: subId, location_id: locId,
          counterpart_name: 'County Hospital Pharmacy', counterpart_dea_no: 'AB1234567',
          new_items: [{ control_no: `${MARK}-001` }], actor_pin: '9999',
        });
        assert.equal(res.status, 403);
        assert.equal(res.json.code, 'CS_AUTH_FAILED');
        const none = await pool.query('SELECT COUNT(*)::int AS n FROM cs_events WHERE department_id = $1', [deptA]);
        assert.equal(none.rows[0].n, 0, 'a refused event writes NOTHING');

        // Missing counterpart → refused (§1304.27(b)).
        res = await api('POST', '/api/cs/events', chief.token, {
          kind: 'acquire', substance_id: subId, location_id: locId,
          new_items: [{ control_no: `${MARK}-001` }], actor_pin: '1111',
        });
        assert.equal(res.json.code, 'COUNTERPART_REQUIRED');

        res = await api('POST', '/api/cs/events', chief.token, {
          kind: 'acquire', substance_id: subId, location_id: locId,
          counterpart_name: 'County Hospital Pharmacy', counterpart_address: '1 Main St',
          counterpart_dea_no: 'AB1234567', containers: 2,
          new_items: [{ control_no: `${MARK}-001`, lot_no: 'L1', expiration: '2027-01-01' },
                      { control_no: `${MARK}-002`, lot_no: 'L1', expiration: '2027-01-01' }],
          actor_pin: '1111',
        });
        assert.equal(res.status, 201, JSON.stringify(res.json));
        assert.equal(res.json.data.minted.length, 2);
        [vial1, vial2] = res.json.data.minted;
        assert.equal(Number(vial1.acquired_event_id), Number(res.json.data.event.id),
          'the vial is born pointing at its acquisition event');
        assert.equal(Number(res.json.data.event.units_per_container), 100, '§1304.27(b)(1)(iii) on the ledger row');
      });

      await t.test('3 · administer: crew-authored, incident # required, amount bounded, one door', async () => {
        let res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'administer', item_id: vial1.id, amount_administered: 50, actor_pin: '2222',
        });
        assert.equal(res.json.code, 'INCIDENT_REQUIRED');
        res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'administer', item_id: vial1.id, amount_administered: 150,
          incident_number: '2026-1234', actor_pin: '2222',
        });
        assert.equal(res.json.code, 'AMOUNT_EXCEEDS_VIAL');
        res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'administer', item_id: vial1.id, amount_administered: 50,
          incident_number: '2026-1234', patient_identifier: 'PCR-889',
          standing_order: true, authorizer_name: 'Dr. Reyes', actor_pin: '2222',
        });
        assert.equal(res.status, 201, JSON.stringify(res.json));
        const it = await pool.query('SELECT status, remaining_units FROM cs_items WHERE id = $1', [vial1.id]);
        assert.equal(it.rows[0].status, 'administered');
        assert.equal(Number(it.rows[0].remaining_units), 50, 'the remainder is on the vial');
      });

      await t.test('4+5 · waste: witness with own PIN + signature; never yourself; full remainder', async () => {
        let res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'waste', item_id: vial1.id, amount_disposed: 50, manner_disposed: 'sink w/ witness',
          actor_pin: '2222',
        });
        assert.equal(res.json.code, 'WITNESS_REQUIRED');
        res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'waste', item_id: vial1.id, amount_disposed: 50, manner_disposed: 'sink w/ witness',
          actor_pin: '2222', witness_user_id: medic.uid, witness_pin: '2222', witness_signature: SIG,
        });
        assert.equal(res.json.code, 'SELF_WITNESS');
        res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'waste', item_id: vial1.id, amount_disposed: 25, manner_disposed: 'sink w/ witness',
          actor_pin: '2222', witness_user_id: buddy.uid, witness_pin: '3333', witness_signature: SIG,
        });
        assert.equal(res.json.code, 'WASTE_MISMATCH', 'waste must account for the FULL remainder');
        res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'waste', item_id: vial1.id, amount_disposed: 50, manner_disposed: 'sink w/ witness',
          actor_pin: '2222', witness_user_id: buddy.uid, witness_pin: '3333', witness_signature: SIG,
        });
        assert.equal(res.status, 201, JSON.stringify(res.json));
        const it = await pool.query('SELECT status, remaining_units FROM cs_items WHERE id = $1', [vial1.id]);
        assert.equal(it.rows[0].status, 'wasted');
        assert.equal(Number(it.rows[0].remaining_units), 0);
        // A user with NO PIN enrolled can never be a witness (generic refusal).
        res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'waste', item_id: vial2.id, amount_disposed: 100, manner_disposed: 'x',
          actor_pin: '2222', witness_user_id: noPin.uid, witness_pin: '0000', witness_signature: SIG,
        });
        assert.equal(res.json.code, 'CS_AUTH_FAILED');
      });

      await t.test('5b · a witness from ANOTHER department is refused (Dale review, 2026-07-27)', async () => {
        // The route enforces this (BAD_WITNESS); the DATABASE does not — cs_events
        // has only the no-self-witness CHECK and an unscoped FK to users(id), with
        // no trigger. RLS scopes the ROW's department, not the witness's. So this
        // test is the only thing standing between a refactor and a cross-department
        // signature on a controlled-substance record.
        const res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'waste', item_id: vial2.id, amount_disposed: 100, manner_disposed: 'x',
          actor_pin: '2222', witness_user_id: outsdr.uid, witness_pin: '4444', witness_signature: SIG,
        });
        assert.equal(res.json.code, 'BAD_WITNESS', 'witness must be in the actor\'s department');
        const n = await pool.query(
          'SELECT count(*)::int c FROM cs_events WHERE witness_user_id = $1', [outsdr.uid]);
        assert.equal(n.rows[0].c, 0, 'and nothing was written');
      });

      await t.test('1b · CS PIN throttle: cooldown after repeated failures, self-clearing (0114)', async () => {
        // Dale: "a 4-digit PIN on a shared tablet is 10,000 guesses; an audited
        // brute force is still a brute force." Per-USER, never per-IP — index.js
        // doctrine is "never rate-limit a firehouse during operations".
        const victim = await mkUser('cs_2_7_throttle', 'member', deptA, '7777');
        await pool.query(
          'UPDATE users SET cs_pin_fail_count = 0, cs_pin_locked_until = NULL WHERE id = $1',
          [victim.uid]);

        // Five wrong guesses are allowed through (still refused, still audited).
        for (let i = 0; i < 5; i += 1) {
          const r = await api('POST', '/api/cs/events', medic.token, {
            kind: 'waste', item_id: vial2.id, amount_disposed: 100, manner_disposed: 'x',
            actor_pin: '2222', witness_user_id: victim.uid, witness_pin: '0001', witness_signature: SIG,
          });
          assert.equal(r.json.code, 'CS_AUTH_FAILED', `attempt ${i + 1} refused, not throttled`);
        }
        // The sixth is throttled, and says how long to wait.
        const sixth = await api('POST', '/api/cs/events', medic.token, {
          kind: 'waste', item_id: vial2.id, amount_disposed: 100, manner_disposed: 'x',
          actor_pin: '2222', witness_user_id: victim.uid, witness_pin: '0001', witness_signature: SIG,
        });
        assert.equal(sixth.status, 429);
        assert.equal(sixth.json.code, 'CS_AUTH_THROTTLED');
        assert.match(sixth.json.error, /Try again in \d+s/);

        const locked = await pool.query(
          'SELECT cs_pin_fail_count, cs_pin_locked_until FROM users WHERE id = $1', [victim.uid]);
        assert.ok(locked.rows[0].cs_pin_fail_count >= 5);
        assert.ok(locked.rows[0].cs_pin_locked_until, 'cooldown recorded on the user, not an IP');

        // It self-clears — there is deliberately no admin unlock endpoint. Simulate
        // the wait rather than sleeping 30s, then prove the RIGHT PIN resets state.
        await pool.query('UPDATE users SET cs_pin_locked_until = now() - interval \'1 second\' WHERE id = $1',
          [victim.uid]);
        // Deliberately a WRONG amount: verifyCsPin (route line ~399) runs BEFORE the
        // waste-remainder check (~462) and the INSERT (~479), so the correct PIN is
        // accepted — resetting the counter — and the request still fails without
        // consuming the vial or writing an event. Later cases keep their fixture.
        const good = await api('POST', '/api/cs/events', medic.token, {
          kind: 'waste', item_id: vial2.id, amount_disposed: 1, manner_disposed: 'sink w/ witness',
          actor_pin: '2222', witness_user_id: victim.uid, witness_pin: '7777', witness_signature: SIG,
        });
        assert.equal(good.json.code, 'WASTE_MISMATCH', 'PIN accepted; failed later, on the amount');
        const cleared = await pool.query(
          'SELECT cs_pin_fail_count, cs_pin_locked_until FROM users WHERE id = $1', [victim.uid]);
        assert.equal(cleared.rows[0].cs_pin_fail_count, 0, 'a correct PIN restores full speed');
        assert.equal(cleared.rows[0].cs_pin_locked_until, null);
        const untouched = await pool.query(
          'SELECT status, remaining_units FROM cs_items WHERE id = $1', [vial2.id]);
        // 0087 CHECK: ('in_stock','administered','wasted','expired','broken',
        // 'transferred','destroyed') — 'in_stock' is the untouched state.
        assert.equal(untouched.rows[0].status, 'in_stock', 'vial2 left for the later cases');
      });

      await t.test('6 · the ledger is append-only at the DB (of_app cannot rewrite history)', async () => {
        const hasRole = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'of_app'`);
        if (!hasRole.rows.length) {
          console.log('[csCustody] of_app role not on this DB — physical probe covered by the 0087 prod probes.');
          return;
        }
        const ev = await pool.query('SELECT id FROM cs_events WHERE department_id = $1 LIMIT 1', [deptA]);

        // 🔴 REWRITTEN 2026-07-27. This probe used to run BEGIN / SET LOCAL ROLE / <stmt> as
        // three separate pool.query calls. A POOLED QUERY IS NOT A SESSION: pool.query checks
        // out a connection PER CALL, so the statement being probed could run on a DIFFERENT
        // connection — still as the SUPERUSER — while the role change applied to another.
        //
        // That was observed for real the same day in the 3.1b job tests: a DELETE that should
        // have been refused ran as the superuser and actually removed the row. Here the risk
        // ran the OTHER way and is worse: this probe could PASS while never executing as
        // of_app at all, certifying that the narcotics custody ledger (21 CFR §1304.27) is
        // physically append-only without ever having tested it. A green safety test that
        // proves nothing is worse than no test, because it ends the conversation.
        //
        // withRole pins ONE client for the whole probe, and expectRefused gives each
        // statement its own transaction — the first failure aborts a transaction, and every
        // later statement in it returns 25P02, which is an error and would satisfy a naive
        // rejection assertion FOR THE WRONG REASON even if the grant were removed.
        for (const [stmt, params] of [
          [`UPDATE cs_events SET note = 'rewritten' WHERE id = $1`, [ev.rows[0].id]],
          [`DELETE FROM cs_events WHERE id = $1`, [ev.rows[0].id]],
        ]) {
          const r = await expectRefused(pool, 'of_app', deptA, stmt, params);
          assert.ok(r.refused,
            `of_app must be refused (42501) for: ${stmt} — got ${r.code}`);
        }

        // CONTROL: of_app MUST still be able to APPEND. Without this, the two refusals above
        // are equally satisfied by a role that cannot touch the table at all, or by a probe
        // that silently never ran.
        const appended = await withRole(pool, 'of_app', deptA, async (client) => {
          const { rows } = await client.query(
            `SELECT has_table_privilege('of_app', 'cs_events', 'INSERT') AS can_insert`);
          return rows[0].can_insert;
        });
        assert.equal(appended, true,
          'CONTROL: of_app must retain INSERT on cs_events — an append-only ledger it cannot '
          + 'append to would make the refusals above meaningless');
      });

      await t.test('7 · the count: server-computed expectation, one discrepancy per missing vial, chief resolution', async () => {
        // vial2 is expected in the box. The count says the box is EMPTY.
        let res = await api('POST', '/api/cs/counts', medic.token, {
          location_id: locId, kind: 'on_coming', seals_intact: true,
          verifier1_pin: '2222', verifier2_user_id: medic.uid, verifier2_pin: '2222',
          verifier2_signature: SIG, present_item_ids: [],
        });
        assert.equal(res.json.code, 'SELF_WITNESS', 'two DISTINCT humans');
        res = await api('POST', '/api/cs/counts', medic.token, {
          location_id: locId, kind: 'on_coming', seals_intact: true,
          verifier1_pin: '2222', verifier2_user_id: buddy.uid, verifier2_pin: '3333',
          verifier2_signature: SIG, present_item_ids: [],
        });
        assert.equal(res.status, 201, JSON.stringify(res.json));
        assert.equal(res.json.data.count.clean, false);
        assert.equal(res.json.data.discrepancies.length, 1, 'EXACTLY one discrepancy for the one missing vial');
        const disc = res.json.data.discrepancies[0];

        let rr = await api('POST', `/api/cs/discrepancies/${disc.id}/resolve`, medic.token,
          { resolution: 'found', note: 'was in the other pouch' });
        assert.equal(rr.status, 403, 'resolution is chief work');
        rr = await api('POST', `/api/cs/discrepancies/${disc.id}/resolve`, chief.token,
          { resolution: 'found', note: 'located in secondary pouch during audit' });
        assert.equal(rr.status, 200, JSON.stringify(rr.json));
        rr = await api('POST', `/api/cs/discrepancies/${disc.id}/resolve`, chief.token,
          { resolution: 'found', note: 'again' });
        assert.equal(rr.status, 404, 'a resolved discrepancy is closed — no re-resolution');
      });

      await t.test('8 · restock_hospital mints the 72-hour §1304.27(c) notification', async () => {
        const res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'restock_hospital', substance_id: subId, location_id: locId,
          counterpart_name: 'St. Mary ED Pharmacy',
          new_items: [{ control_no: `${MARK}-003` }], actor_pin: '2222',
        });
        assert.equal(res.status, 201, JSON.stringify(res.json));
        const n = await pool.query(
          'SELECT * FROM cs_notifications WHERE department_id = $1 AND event_id = $2', [deptA, res.json.data.event.id]);
        assert.equal(n.rows.length, 1, 'the notification exists');
        assert.ok(new Date(n.rows[0].due_by) > new Date(), 'due in the future (72h window)');
        const ack = await api('POST', `/api/cs/notifications/${n.rows[0].id}/ack`, chief.token);
        assert.equal(ack.status, 200);
      });

      await t.test('11 · market rulings: cs_manager grant gates destruction; §1317.95 demands BOTH signatures; the dept feed is live', async () => {
        // A plain member cannot destroy — even with a witness lined up.
        let res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'destroy', item_id: vial2.id, counterpart_name: 'Reverse Distributor Inc',
          actor_pin: '2222', actor_signature: SIG,
          witness_user_id: buddy.uid, witness_pin: '3333', witness_signature: SIG,
        });
        assert.equal(res.json.code, 'FORBIDDEN_CS_MANAGER');
        // Chief grants the medic the CS-manager capability (the fleet pattern).
        let g = await api('POST', `/api/cs/grants/${medic.uid}`, medic.token, { granted: true });
        assert.equal(g.status, 403, 'granting is chief work');
        g = await api('POST', `/api/cs/grants/${medic.uid}`, chief.token, { granted: true });
        assert.equal(g.status, 200, JSON.stringify(g.json));
        // Destruction WITHOUT the actor's own signature is refused (§1317.95(c):
        // the record carries the name and signature of BOTH employees).
        res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'destroy', item_id: vial2.id, counterpart_name: 'Reverse Distributor Inc',
          actor_pin: '2222',
          witness_user_id: buddy.uid, witness_pin: '3333', witness_signature: SIG,
        });
        assert.equal(res.json.code, 'SIGNATURE_REQUIRED');
        res = await api('POST', '/api/cs/events', medic.token, {
          kind: 'destroy', item_id: vial2.id, counterpart_name: 'Reverse Distributor Inc',
          manner_disposed: 'transferred to reverse distributor',
          actor_pin: '2222', actor_signature: SIG,
          witness_user_id: buddy.uid, witness_pin: '3333', witness_signature: SIG,
        });
        assert.equal(res.status, 201, JSON.stringify(res.json));
        const ev = await pool.query('SELECT actor_signature, witness_signature FROM cs_events WHERE id = $1', [res.json.data.event.id]);
        assert.ok(ev.rows[0].actor_signature.length > 0 && ev.rows[0].witness_signature.length > 0,
          'BOTH signatures are on the destruction record');
        const it = await pool.query('SELECT status FROM cs_items WHERE id = $1', [vial2.id]);
        assert.equal(it.rows[0].status, 'destroyed');
        // The department-wide feed (market bar) carries the whole ledger, newest first.
        const feed = await api('GET', '/api/cs/events', chief.token);
        assert.equal(feed.status, 200);
        assert.ok(feed.json.data.length >= 5, 'acquire+administer+waste+restock+destroy all on the feed');
        assert.equal(feed.json.data[0].kind, 'destroy', 'newest first');
        // Revoke works too.
        g = await api('POST', `/api/cs/grants/${medic.uid}`, chief.token, { granted: false });
        assert.equal(g.json.data.cs_manager, false);
      });

      await t.test('9 · cross-tenant: dept B sees nothing and can write nothing', async () => {
        let res = await api('GET', '/api/cs/items', outsdr.token);
        assert.equal(res.status, 200);
        assert.equal(res.json.data.length, 0, 'dept B sees no dept A vials');
        res = await api('POST', '/api/cs/events', outsdr.token, {
          kind: 'administer', item_id: vial2.id, amount_administered: 10,
          incident_number: 'X', actor_pin: '4444',
        });
        assert.equal(res.status, 404, 'dept A vial does not exist for dept B');
      });

      await t.test('10 · the history report carries the §1304.27(a) record, complete', async () => {
        const res = await api('GET', `/api/cs/items/${vial1.id}/history`, chief.token);
        assert.equal(res.status, 200);
        const evs = res.json.data.events;
        assert.equal(evs.length, 3, 'acquire + administer + waste');
        const adm = evs.find((e) => e.kind === 'administer');
        // (a)(1)+(2) come from the item join; the event carries the rest:
        assert.equal(Number(adm.amount_administered), 50);              // (a)(5)
        assert.equal(adm.patient_identifier, 'PCR-889');                // (a)(4)
        assert.ok(adm.actor_name.length > 0);                           // (a)(6)
        assert.equal(adm.authorizer_name, 'Dr. Reyes');                 // (a)(7)
        assert.equal(adm.standing_order, true);                         // (a)(8)
        assert.ok(adm.occurred_at, '(a)(3) server-authoritative');
        const wst = evs.find((e) => e.kind === 'waste');
        assert.equal(Number(wst.amount_disposed), 50);                  // (a)(9)
        assert.ok(wst.manner_disposed.length > 0);                      // (a)(10)
        assert.ok(wst.witness_name.length > 0, '(a)(11) witness on the record');
      });
    } finally {
      try { await cleanup(); } catch (e) { console.error('[csCustody] cleanup failed:', e.message); }
      await new Promise((res) => server.close(res));
      try { await pool.end(); } catch {}
    }
  });
}
