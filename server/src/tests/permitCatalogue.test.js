'use strict';
/**
 * permitCatalogue.test.js — the catalogue, the issuance snapshot, and the END-TO-END proof
 * that the expiry ladder is no longer inert (Phase 3, module 3.1b).
 *
 * THE CLAIM THIS SUITE EXISTS TO PROVE, because it is the one worth doubting:
 * before this work, 0093/0094/0095 were all live on prod and the ladder COULD NOT MOVE A
 * SINGLE PERMIT — nothing populated the term snapshot, so every permit was skipped for want
 * of terms while the job reported clean successes forever. The last test here drives the
 * whole chain: author a type → issue a permit under it → run the job → watch the status
 * actually change. If that test is deleted or weakened, the module is decorative again.
 *
 * Also pinned, each because it is a way a legal record could be quietly corrupted:
 *   · role gates in BOTH directions on every writer;
 *   · cross-tenant refusal on the rule-group reference;
 *   · `code` is not patchable — it is the control value issued permits were classified by;
 *   · retire-never-delete, and a retired code being reusable by its own successor;
 *   · a new rule version auto-closes the prior, and one-open-version is enforced;
 *   · R7: the snapshot resolves the version in force ON THE ISSUE DATE, not today's;
 *   · a hand-typed expiry is REFUSED when the catalogue supplies the term.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[permitCatalogue] TENANCY_TEST_DB not set — skipping.');
  test('permit catalogue (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('permit catalogue + the issuance snapshot + the ladder actually moving', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      const tmr = realSetInterval(...args);
      if (tmr && typeof tmr.unref === 'function') tmr.unref();
      return tmr;
    };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const { runPermitExpiry } = require('../jobs/permitExpiry');

    const MARK = `PCAT-${Date.now()}`;

    t.after(async () => {
      try {
        await pool.query(`DELETE FROM fi_job_runs WHERE department_id IN (SELECT id FROM departments WHERE name LIKE $1)`, [`${MARK}%`]);
        await pool.query(`DELETE FROM audit_log WHERE department_id IN (SELECT id FROM departments WHERE name LIKE $1)`, [`${MARK}%`]);
        await pool.query(`DELETE FROM fi_permits WHERE type LIKE $1`, [`${MARK}%`]);
        await pool.query(`DELETE FROM fi_permit_types WHERE department_id IN (SELECT id FROM departments WHERE name LIKE $1)`, [`${MARK}%`]);
        await pool.query(`DELETE FROM fi_permit_expiration_rules WHERE department_id IN (SELECT id FROM departments WHERE name LIKE $1)`, [`${MARK}%`]);
        await pool.query(`DELETE FROM fi_permit_expiration_rule_groups WHERE department_id IN (SELECT id FROM departments WHERE name LIKE $1)`, [`${MARK}%`]);
        await pool.query(`DELETE FROM fi_properties WHERE name LIKE $1`, [`${MARK}%`]);
        await pool.query(`DELETE FROM users WHERE username LIKE $1`, [`${MARK}%`]);
        await pool.query(`DELETE FROM departments WHERE name LIKE $1`, [`${MARK}%`]);
      } catch { /* best effort */ }
      try { await pool.end(); } catch { /* already closed */ }
    });

    const A = await mkAlignedDeptStation(pool, `${MARK}-A`);
    const B = await mkAlignedDeptStation(pool, `${MARK}-B`);

    // ⚠ `users` has NO department_id — it is the SHARED identity table (OF + FireHazmat),
    // scoped by station_id, with department membership carried in of_user_departments. I
    // assumed a department_id column and the fixture blew up on the first insert; copying
    // the shape csCustody.test.js already proves works rather than inventing a second one.
    const mkUser = async (dept, role, tag) => {
      const uname = `${MARK}-${tag}`;
      const { rows } = await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
         VALUES ($1,$2,'XX',$3,'x',$4) RETURNING id`,
        [uname, `${tag} user`, role, dept]
      );
      await pool.query(
        'INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [rows[0].id, dept, role]);
      return jwt.sign({ sub: rows[0].id, username: uname, role }, ACCESS_SECRET, { expiresIn: '1h' });
    };
    const admin  = await mkUser(A, 'chief',  'admin');
    const member = await mkUser(A, 'member', 'member');

    const api = async (method, path, token, body) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let json = null; try { json = await res.json(); } catch { /* no body */ }
      return { status: res.status, json };
    };
    const server = app.listen(0);
    t.after(() => new Promise((r) => server.close(r)));

    /* ── role gates, BOTH directions ─────────────────────────────────────────────────── */
    await t.test('every catalogue writer refuses a member and accepts an admin', async () => {
      const groupBody = { name: `${MARK} annual`, effective_from: '2026-01-01',
                          term_value: 1, term_unit: 'year',
                          notice_window_days: 30, grace_days: 14 };
      const refused = await api('POST', '/api/fi-permit-types/rule-groups', member, groupBody);
      assert.equal(refused.status, 403, JSON.stringify(refused.json));
      const ok = await api('POST', '/api/fi-permit-types/rule-groups', admin, groupBody);
      assert.equal(ok.status, 200, JSON.stringify(ok.json));
      // A refusal test alone passes just as happily against a route broken for everyone.
      assert.ok(ok.json.data.id);
    });

    const groups = await api('GET', '/api/fi-permit-types/rule-groups', admin);
    const groupId = groups.json.data[0].id;

    await t.test('a type cannot borrow ANOTHER department\'s rule group', async () => {
      const { rows: [foreign] } = await pool.query(
        `INSERT INTO fi_permit_expiration_rule_groups (department_id, name)
         VALUES ($1,$2) RETURNING id`, [B, `${MARK} foreign`]);
      const res = await api('POST', '/api/fi-permit-types', admin, {
        code: 'X_FOREIGN', name: 'x', expiration_rule_group_id: foreign.id });
      assert.equal(res.status, 422);
      assert.equal(res.json.code, 'BAD_RULE_GROUP');
    });

    let typeId;
    await t.test('create a type; the code is a control value and is NOT patchable', async () => {
      const res = await api('POST', '/api/fi-permit-types', admin, {
        code: 'ASSEMBLY', name: 'Place of assembly', ifc_section: '105.5.5',
        expiration_rule_group_id: groupId, status: 'Active' });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      typeId = res.json.data.id;
      assert.equal(res.json.data.portal_visibility, 'staff_only', 'the safe default is the market default');

      const patched = await api('PATCH', `/api/fi-permit-types/${typeId}`, admin, { code: 'RENAMED' });
      assert.equal(patched.status, 400, 'strict schema must reject an unknown/forbidden key');
      const renamed = await api('PATCH', `/api/fi-permit-types/${typeId}`, admin, { name: 'Assembly' });
      assert.equal(renamed.status, 200, 'CONTROL: a legitimate edit still works');
    });

    await t.test('a duplicate LIVE code is refused; a retired one frees it for its successor', async () => {
      const dup = await api('POST', '/api/fi-permit-types', admin, { code: 'ASSEMBLY', name: 'dup' });
      assert.equal(dup.status, 409);
      assert.equal(dup.json.code, 'DUPLICATE_CODE');

      const cloned = await api('POST', `/api/fi-permit-types/${typeId}/clone`, admin, { name: 'Assembly v2' });
      assert.equal(cloned.status, 200, JSON.stringify(cloned.json));
      assert.equal(cloned.json.data.code, 'ASSEMBLY', 'the successor keeps the code');
      assert.equal(cloned.json.data.version, 2);
      const { rows: [old] } = await pool.query(
        'SELECT status, superseded_by_type_id FROM fi_permit_types WHERE id = $1', [typeId]);
      assert.equal(old.status, 'Retired', 'clone RETIRES the predecessor — never deletes it');
      assert.equal(String(old.superseded_by_type_id), String(cloned.json.data.id));
      typeId = cloned.json.data.id;
    });

    await t.test('a new rule version auto-closes the prior, and cannot pre-date it', async () => {
      const tooEarly = await api('POST', `/api/fi-permit-types/rule-groups/${groupId}/versions`, admin, {
        effective_from: '2025-06-01', term_value: 2, term_unit: 'year',
        notice_window_days: 60, grace_days: 30 });
      assert.equal(tooEarly.status, 422);
      assert.equal(tooEarly.json.code, 'EFFECTIVE_FROM_NOT_AFTER');

      const v2 = await api('POST', `/api/fi-permit-types/rule-groups/${groupId}/versions`, admin, {
        effective_from: '2026-07-01', term_value: 2, term_unit: 'year',
        notice_window_days: 60, grace_days: 30 });
      assert.equal(v2.status, 200, JSON.stringify(v2.json));
      assert.equal(v2.json.data.version, 2);

      const versions = await api('GET', `/api/fi-permit-types/rule-groups/${groupId}/versions`, admin);
      const open = versions.json.data.filter((v) => v.effective_to === null);
      assert.equal(open.length, 1, 'exactly ONE open version — two answers to "which rule applies" is the bug');
      // ⚠ pg hands a DATE back as a JS Date in-process, but this came over HTTP where it was
      // serialized to a string — so .toISOString() is not available here. Same column, two
      // shapes, depending on which side of the wire you read it from. Slice the first 10
      // characters, which is correct for both an ISO string and a JSON-serialized Date.
      const prior = versions.json.data.find((v) => v.version === 1);
      assert.equal(String(prior.effective_to).slice(0, 10), '2026-06-30',
        'the prior version closes the day before the new one takes effect — no gap, no overlap');
    });

    /* ── R7: the snapshot resolves the version in force ON THE ISSUE DATE ────────────── */
    const mkPermit = async (issueDate, extra = {}) => {
      const { rows: [prop] } = await pool.query(
        `INSERT INTO fi_properties (department_id, station_id, name, address)
         VALUES ($1,$1,$2,'1 Test St') RETURNING id`, [A, `${MARK} prop`]);
      const created = await api('POST', '/api/fi-permits', admin, {
        propertyId: prop.id, type: `${MARK} assembly`,
        permitNumber: `${MARK}-${Math.random().toString(36).slice(2, 8)}`,
        permit_type_id: typeId, ...extra });
      assert.equal(created.status, 201, JSON.stringify(created.json));
      return created.json.data.id;
    };

    await t.test('🔴 R7: a permit issued under the OLD version keeps the OLD terms', async () => {
      // v1 (1 year / 30 / 14) ran to 2026-06-30; v2 (2 years / 60 / 30) from 2026-07-01.
      const id = await mkPermit();
      const issued = await api('POST', `/api/fi-permits/${id}/issue`, admin, { issuedDate: '2026-03-01' });
      assert.equal(issued.status, 200, JSON.stringify(issued.json));
      const d = issued.json.data;
      assert.equal(d.term_value, 1,  'the version in force on the ISSUE DATE, not the one open today');
      assert.equal(d.notice_window_days, 30);
      assert.equal(d.grace_days, 14);
      assert.equal(d.expiresDate, '2027-02-28',
        'issued 2026-03-01 for 1 year ⇒ in force THROUGH 2027-02-28 (term counted inclusive)');

      const later = await mkPermit();
      const issued2 = await api('POST', `/api/fi-permits/${later}/issue`, admin, { issuedDate: '2026-08-01' });
      assert.equal(issued2.json.data.term_value, 2, 'a later issuance picks up v2');
      assert.equal(issued2.json.data.grace_days, 30);
    });

    await t.test('the catalogue owns the term — a hand-typed expiry is REFUSED, not ignored', async () => {
      const id = await mkPermit();
      const res = await api('POST', `/api/fi-permits/${id}/issue`, admin,
        { issuedDate: '2026-03-01', expiresDate: '2099-01-01' });
      assert.equal(res.status, 409);
      assert.equal(res.json.code, 'TERM_FROM_CATALOGUE');
      const { rows: [row] } = await pool.query('SELECT status FROM fi_permits WHERE id = $1', [id]);
      assert.equal(row.status, 'Pending', 'and NOTHING was written — check-then-write');
    });

    await t.test('a type with no expiration rule refuses issuance rather than inventing a term', async () => {
      const bare = await api('POST', '/api/fi-permit-types', admin, { code: 'NO_RULE', name: 'no rule', status: 'Active' });
      const { rows: [prop] } = await pool.query(
        `INSERT INTO fi_properties (department_id, station_id, name, address)
         VALUES ($1,$1,$2,'2 Test St') RETURNING id`, [A, `${MARK} prop`]);
      const created = await api('POST', '/api/fi-permits', admin, {
        propertyId: prop.id, type: `${MARK} bare`, permitNumber: `${MARK}-bare`,
        permit_type_id: bare.json.data.id });
      const res = await api('POST', `/api/fi-permits/${created.json.data.id}/issue`, admin,
        { issuedDate: '2026-03-01' });
      assert.equal(res.status, 422);
      assert.equal(res.json.code, 'TYPE_HAS_NO_RULE');
    });

    /* ── THE END-TO-END PROOF ────────────────────────────────────────────────────────── */
    await t.test('🔴 END-TO-END: the ladder is no longer inert — the job MOVES a real permit', async () => {
      const id = await mkPermit();
      await api('POST', `/api/fi-permits/${id}/issue`, admin, { issuedDate: '2026-03-01' });
      // Term through 2027-02-28, 30-day notice window ⇒ AboutToExpire from 2027-01-29.
      const statusOn = async (today) => {
        await runPermitExpiry({ today, departmentIds: [A] });
        const { rows: [r] } = await pool.query('SELECT status FROM fi_permits WHERE id = $1', [id]);
        return r.status;
      };
      assert.equal(await statusOn('2026-12-01'), 'Active',        'well inside the term');
      assert.equal(await statusOn('2027-02-01'), 'AboutToExpire', 'inside the notice window — STILL VALID');
      assert.equal(await statusOn('2027-03-05'), 'Delinquent',    'term ended, inside the 14-day grace');
      assert.equal(await statusOn('2027-03-20'), 'Expired',       'past end-of-grace — the trapdoor');

      // And the run ledger recorded real work rather than a clean nothing.
      const { rows: [run] } = await pool.query(
        `SELECT transitioned, skipped_no_terms FROM fi_job_runs
          WHERE department_id = $1 ORDER BY id DESC LIMIT 1`, [A]);
      assert.ok(run, 'the job wrote a ledger row');
      assert.equal(Number(run.skipped_no_terms), 0,
        'a permit issued under a catalogue type must NOT be skipped for want of terms — '
        + 'that skip was the entire symptom of the inert ladder');
    });
  });
}
