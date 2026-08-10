'use strict';
/**
 * fiPermitsLifecycle.test.js — the fence for Phase 3 module 3.1a. (2026-07-27)
 *
 * Spec: docs/PHASE3-31A-PERMIT-LIFECYCLE-SPEC-2026-07-26.md §5 (failure-mode matrix).
 * Migration: 0092 (prod-applied + probed 2026-07-27).
 *
 * ── WHY THIS SUITE IS SHAPED THE WAY IT IS ──────────────────────────────────────────────
 * Every test here is written from a FAILURE MODE, not from a feature. The happy path is
 * asserted only where it doubles as a control — because three of these guards would pass
 * trivially against a table that simply refused every write, and a guard that cannot tell
 * you the difference is not evidence of anything.
 *
 * The two failures being fenced are real and both cost this repo a live incident:
 *
 *   1. A GUARD ON ONE WRITER IS NOT A GUARD. 2026-07-14: the same inspection record
 *      answered 422 on /complete and 200 OK on PATCH, and a building was recorded as
 *      passing with an unabated violation. So every assertion below that refuses something
 *      is repeated against EVERY writer — the engine, PATCH, and the create route.
 *
 *   2. A REFUSAL THAT STILL WRITES IS NOT A REFUSAL. Every refusal test RE-READS the row
 *      afterwards and asserts nothing moved. A 409 with a mutation behind it is worse than
 *      no guard, because it is a guard you now trust.
 *
 * ── WHAT IS DELIBERATELY NOT TESTED, BECAUSE IT IS DELIBERATELY NOT BUILT ───────────────
 * Suspension, appeal/stay, typed denial reasons, an immutable issued-document snapshot and
 * an append-only event ledger were specced and then CUT — a competitive audit of 13
 * fire-prevention platforms found ZERO of 13 ship any of them, and the governing rule for
 * this phase is to do exactly what the market does and nothing more. If a future session
 * finds tests here for those, someone has drifted past the line.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[fiPermitsLifecycle] TENANCY_TEST_DB not set — skipping.');
  test('fi permits lifecycle (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('fi_permits: the lifecycle engine is the only door', async (t) => {
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

    const MARK = 'FI-PERMIT-LIFE';
    let deptId = null;
    let priorSetting = null;

    // Registered FIRST, before anything that can throw. A fixture that throws before
    // teardown is registered leaves the http server listening and the suite hangs forever
    // under --test-timeout=0 — a legible failure becomes a mystery.
    t.after(async () => {
      try {
        if (deptId) {
          if (priorSetting) {
            await pool.query(
              `INSERT INTO fi_settings (department_id, allow_crew_inspections) VALUES ($1,$2)
               ON CONFLICT (department_id) DO UPDATE SET allow_crew_inspections = EXCLUDED.allow_crew_inspections`,
              [deptId, priorSetting.allow_crew_inspections]);
          } else {
            await pool.query('DELETE FROM fi_settings WHERE department_id = $1', [deptId]);
          }
        }
        await cleanup();
      } finally {
        await new Promise((r) => server.close(r));
        await pool.end().catch(() => {});
      }
    });

    async function cleanup() {
      // superseded_by_permit_id is a self-FK with ON DELETE RESTRICT, so the link must be
      // broken before the rows can go. Deleting in insertion order would fail on it.
      await pool.query(`UPDATE fi_permits SET superseded_by_permit_id = NULL
                        WHERE type LIKE $1 OR "permitNumber" LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_permits WHERE type LIKE $1 OR "permitNumber" LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_properties WHERE name LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM users WHERE username LIKE $1`, [`${MARK}%`]);
      // Renewal fixtures (L15–L19). Order matters: rules reference their group, and types
      // reference it too, so both go before the group itself.
      await pool.query(`DELETE FROM fi_permit_expiration_rules WHERE group_id IN
                          (SELECT id FROM fi_permit_expiration_rule_groups WHERE name LIKE $1)`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_permit_types WHERE code LIKE $1 OR name LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_permit_expiration_rule_groups WHERE name LIKE $1`, [`${MARK}%`]);
    }
    await cleanup();

    const u = (await pool.query(
      `SELECT id, username, role, station_id FROM users WHERE station_id IS NOT NULL AND role='chief' ORDER BY id LIMIT 1`)).rows[0];
    assert.ok(u, 'need a chief with a station to run this suite');
    deptId = u.station_id;
    const chief = jwt.sign({ sub: u.id, username: u.username, role: u.role, stationId: u.station_id, name: 'Lifecycle Chief' },
      ACCESS_SECRET, { expiresIn: '15m' });

    // A plain member with NO fi_designations row — and the crew toggle left ON (the
    // default), so this member IS an "inspector" by the department's own choice. That is
    // exactly what makes the gate test below meaningful: it proves issuance is gated at a
    // STRICTLY HIGHER bar than inspector, not merely at the inspector bar.
    const memberRow = (await pool.query(
      `INSERT INTO users (username, name, initials, "passwordHash", role, station_id)
       VALUES ($1, 'Probationary FF', 'PF', 'x', 'member', $2) RETURNING id, username`,
      [`${MARK}-member-${Date.now()}`, deptId])).rows[0];
    const member = jwt.sign({ sub: memberRow.id, username: memberRow.username, role: 'member', stationId: deptId, name: 'Probationary FF' },
      ACCESS_SECRET, { expiresIn: '15m' });

    priorSetting = (await pool.query(
      'SELECT allow_crew_inspections FROM fi_settings WHERE department_id = $1', [deptId])).rows[0] || null;
    await pool.query(
      `INSERT INTO fi_settings (department_id, allow_crew_inspections) VALUES ($1, TRUE)
       ON CONFLICT (department_id) DO UPDATE SET allow_crew_inspections = TRUE`, [deptId]);

    const prop = await api('POST', '/api/fi-properties', chief, { name: `${MARK} Firehouse`, address: '1 Lifecycle Way' });
    assert.equal(prop.status, 201, JSON.stringify(prop.json));
    const propertyId = prop.json.data.id;

    let n = 0;
    const num = () => `${MARK}-${Date.now()}-${++n}`;
    const mkBody = (over = {}) => ({ propertyId, type: `${MARK} Occupancy`, permitNumber: num(), ...over });

    async function newPending() {
      const r = await api('POST', '/api/fi-permits', chief, mkBody());
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.data.status, 'Pending', 'a created permit has not been ISSUED');
      return r.json.data;
    }
    async function newIssued() {
      const p = await newPending();
      const r = await api('POST', `/api/fi-permits/${p.id}/issue`, chief, { issuedDate: '2026-07-27' });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      return r.json.data;
    }
    const readRow = async (id) => (await pool.query('SELECT * FROM fi_permits WHERE id = $1', [id])).rows[0];

    // ══ L1 — ISSUANCE HAS EXACTLY ONE DOOR, AND EVERY OTHER WRITER REFUSES ═══════════════
    await t.test('L1 no writer but the engine can set status or issuedDate', async () => {
      const p = await newPending();

      const viaPatch = await api('PATCH', `/api/fi-permits/${p.id}`, chief, { status: 'Active' });
      assert.equal(viaPatch.status, 409, JSON.stringify(viaPatch.json));
      assert.equal(viaPatch.json.code, 'ISSUANCE_VIA_ENGINE');

      const viaDate = await api('PATCH', `/api/fi-permits/${p.id}`, chief, { issuedDate: '2026-07-27' });
      assert.equal(viaDate.status, 409, 'issuedDate is engine-owned too');
      assert.equal(viaDate.json.code, 'ISSUANCE_VIA_ENGINE');

      // THE RE-READ. A 409 with a write behind it is worse than no guard.
      const row = await readRow(p.id);
      assert.equal(row.status, 'Pending', 'the refused PATCH must not have moved the status');
      assert.equal(row.issuedDate, null, 'the refused PATCH must not have stamped an issue date');

      // ...and the CREATE route is a writer too. This is the one that is easy to forget,
      // and it is the one that would mint a live permit with no attributable issuer.
      const born = await api('POST', '/api/fi-permits', chief, mkBody({ status: 'Active' }));
      assert.equal(born.status, 409, `a permit cannot be CREATED issued: ${JSON.stringify(born.json)}`);
      assert.equal(born.json.code, 'ISSUANCE_VIA_ENGINE');

      // CONTROL: the door itself works. Without this, everything above could just mean
      // "writes are broken".
      const issued = await api('POST', `/api/fi-permits/${p.id}/issue`, chief, { issuedDate: '2026-07-27' });
      assert.equal(issued.status, 200, JSON.stringify(issued.json));
      assert.equal(issued.json.data.status, 'Active');
      assert.equal(issued.json.data.issuedDate, '2026-07-27');
      assert.ok(issued.json.data.issued_by_user_id, 'issuance must be attributable to a user id');
    });

    // ══ L2 — AN ISSUED PERMIT IS FINAL. EVERY FIELD. ═════════════════════════════════════
    await t.test('L2 finality is unconditional — including the boring fields', async () => {
      const p = await newIssued();
      // Table-driven over the WHOLE editable surface, not a sample. The fi core's version
      // of this guard fired only when `violations` was present, which left result, notes
      // and type rewritable on a served record — flipping a served Fail to Pass was a 200.
      const fields = {
        notes: 'quietly rewritten',
        type: `${MARK} Something Else`,
        conditions: 'new conditions',
        expiresDate: '2099-01-01',
        issuedBy: 'Someone Else',
        fee: 1.23,
        permitNumber: num(),
        propertyId,
      };
      for (const [field, value] of Object.entries(fields)) {
        const res = await api('PATCH', `/api/fi-permits/${p.id}`, chief, { [field]: value });
        assert.equal(res.status, 409, `PATCH ${field} on an issued permit must be refused: ${JSON.stringify(res.json)}`);
        assert.equal(res.json.code, 'RECORD_FINALIZED', `wrong code for ${field}`);
      }
      const row = await readRow(p.id);
      assert.equal(row.notes, '', 'no refused field may have been written');
      assert.equal(row.type, `${MARK} Occupancy`);
      assert.equal(row.status, 'Active');
    });

    // ══ L3 — NOTHING PATTERN-MATCHES A CONTROL VALUE ═════════════════════════════════════
    await t.test('L3 a near-miss status is refused, never coerced to something adjacent', async () => {
      // 'Issued' is the dangerous one: it reads as correct to a human, and if it were
      // silently mapped to 'Active' the system would be inventing a legal fact. If it were
      // instead stored verbatim it would never match VALID_PERMIT_STATUSES and the permit
      // would be live in the data and invisible to every check.
      for (const bad of ['Issued', 'Approved', 'ACTIVE!', 'Granted']) {
        const res = await api('POST', '/api/fi-permits', chief, mkBody({ status: bad }));
        assert.ok(res.status === 400 || res.status === 409,
          `status ${JSON.stringify(bad)} must be refused, got ${res.status} ${JSON.stringify(res.json)}`);
      }
      const { rows } = await pool.query(
        `SELECT count(*)::int AS c FROM fi_permits WHERE status NOT IN
           ('Pending','Active','Expired','Revoked','Denied','TerminatedByTransfer')`);
      assert.equal(rows[0].c, 0, 'no row may carry a status outside the closed set');
    });

    // ══ L4 — A REVOCATION IS NEVER REASON-FREE ═══════════════════════════════════════════
    await t.test('L4 revocation requires a coded ground, a citation for local grounds, and a basis', async () => {
      const p = await newIssued();

      const noGround = await api('POST', `/api/fi-permits/${p.id}/revoke`, chief, { basis: 'because' });
      assert.equal(noGround.status, 400, JSON.stringify(noGround.json));

      const badGround = await api('POST', `/api/fi-permits/${p.id}/revoke`, chief,
        { ground: 'BECAUSE_I_SAID_SO', basis: 'because' });
      assert.equal(badGround.status, 400, 'an unrecognized ground must be refused, never stored');

      const noBasis = await api('POST', `/api/fi-permits/${p.id}/revoke`, chief,
        { ground: 'MISREPRESENTATION', basis: '   ' });
      assert.equal(noBasis.status, 400, 'a ground without a written basis is not a revocation');

      const localNoCite = await api('POST', `/api/fi-permits/${p.id}/revoke`, chief,
        { ground: 'LOCAL_GROUND', basis: 'operating outside permitted hours' });
      assert.equal(localNoCite.status, 400, JSON.stringify(localNoCite.json));
      assert.equal(localNoCite.json.code, 'LOCAL_GROUND_CITATION_REQUIRED');

      // Nothing moved through any of that.
      let row = await readRow(p.id);
      assert.equal(row.status, 'Active', 'a refused revocation must leave the permit issued');
      assert.equal(row.revocation_ground, null);
      assert.equal(row.revoked_at, null);

      // CONTROL — a well-formed revocation on a ground that only exists AFTER issuance.
      // (CONDITION_VIOLATED is one of the two grounds an earlier draft of the spec had
      // dropped by miscounting IFC §105.4 as five grounds instead of seven.)
      const ok = await api('POST', `/api/fi-permits/${p.id}/revoke`, chief,
        { ground: 'CONDITION_VIOLATED', basis: 'Blocked egress found on reinspection; condition 4 of the permit.' });
      assert.equal(ok.status, 200, JSON.stringify(ok.json));
      assert.equal(ok.json.data.status, 'Revoked');
      row = await readRow(p.id);
      assert.equal(row.revocation_ground, 'CONDITION_VIOLATED');
      assert.ok(row.revoked_at, 'the revocation must be timestamped');
      assert.ok(row.revocation_basis.length > 0);

      // Terminal. No un-revoke, no reopen, no second revocation.
      const again = await api('POST', `/api/fi-permits/${p.id}/revoke`, chief,
        { ground: 'ISSUED_IN_ERROR', basis: 'changed my mind' });
      assert.equal(again.status, 409, 'a revoked permit is terminal');
      const edit = await api('PATCH', `/api/fi-permits/${p.id}`, chief, { notes: 'reopening' });
      assert.equal(edit.status, 409, 'a revoked permit cannot be edited back into shape');
      assert.equal(edit.json.code, 'RECORD_FINALIZED');
    });

    // ══ L5 — NO TIMER MAY EVER PRODUCE A REVOCATION ══════════════════════════════════════
    await t.test('L5 revocation has exactly one writer and it requires an actor', async () => {
      // Enumerated grounds, written notice and a hearing right make automatic revocation
      // statutorily impossible — a timer cannot find a material misrepresentation. This is
      // a source fence, in the same spirit as the repo's other doctrine greps: if a second
      // writer of 'Revoked' ever appears, this fails and someone has to justify it.
      const fs = require('node:fs');
      const path = require('node:path');
      const srcDir = path.join(__dirname, '..');
      const offenders = [];
      const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) { if (e.name !== 'tests' && e.name !== 'node_modules') walk(full); continue; }
          if (!e.name.endsWith('.js')) continue;
          const src = fs.readFileSync(full, 'utf8');
          // A literal write of the Revoked status outside the two files allowed to name it.
          if (/status\s*=\s*'Revoked'/.test(src) && !/constants[/\\]permitStatus\.js$/.test(full)) {
            if (!full.endsWith(path.join('src', 'db.js'))) offenders.push(path.relative(srcDir, full));
          }
        }
      };
      walk(srcDir);
      assert.deepEqual(offenders, [],
        `only db.js fiPermRevoke may write status='Revoked' — found other writers: ${offenders.join(', ')}`);
    });

    // ══ L6/L7 — TRANSFER TERMINATES AND MINTS A SUCCESSOR; THE SUCCESSOR IS NOT LIVE ═════
    await t.test('L6/L7 a transfer terminates and reissues — it never edits the holder', async () => {
      const p = await newIssued();

      const res = await api('POST', `/api/fi-permits/${p.id}/terminate`, chief, {
        reason: 'OWNERSHIP',
        successorPermitNumber: num(),
        note: 'Sold to a new operator.',
      });
      assert.equal(res.status, 201, JSON.stringify(res.json));

      const { terminated, successor } = res.json.data;
      assert.equal(terminated.status, 'TerminatedByTransfer');
      assert.equal(String(terminated.superseded_by_permit_id), String(successor.id),
        'the chain must point at the successor');
      assert.ok(terminated.terminated_at, 'the termination must be timestamped');

      // L7 — THE SUCCESSOR IS BORN PENDING. A transfer must not launder an unissued permit
      // into a live one; it goes through the issuance door like anything else.
      assert.equal(successor.status, 'Pending', 'the successor must NOT be born Active');
      assert.equal(successor.issuedDate, null);
      assert.notEqual(successor.permitNumber, terminated.permitNumber,
        'a document number is consumed once and never reused');

      // The predecessor is terminal.
      const edit = await api('PATCH', `/api/fi-permits/${p.id}`, chief, { issuedBy: 'New Owner LLC' });
      assert.equal(edit.status, 409, 'the holder cannot be edited on a terminated permit');
    });

    // ══ L8 — A DUPLICATE PERMIT NUMBER IS REFUSED (0090's index, via the transfer path) ═══
    await t.test('L8 a successor cannot reuse an existing permit number', async () => {
      const existing = await newPending();
      const p = await newIssued();
      const res = await api('POST', `/api/fi-permits/${p.id}/terminate`, chief, {
        reason: 'TENANCY', successorPermitNumber: existing.permitNumber,
      });
      assert.equal(res.status, 409, JSON.stringify(res.json));
      assert.equal(res.json.code, 'DUPLICATE_PERMIT_NUMBER');
      // The predecessor must be untouched — a failed successor must not terminate anything.
      const row = await readRow(p.id);
      assert.equal(row.status, 'Active', 'a failed transfer must leave the original issued');
      assert.equal(row.terminated_at, null);
    });

    // ══ L10 — THE GATE IS STRICTLY ABOVE INSPECTOR ═══════════════════════════════════════
    await t.test('L10 lifecycle acts are prevention-admin only, even where crew inspections are ON', async () => {
      // The crew toggle is ON for this whole suite, so `member` IS an inspector by the
      // department's own configuration — and can indeed create a draft permit. That is
      // what makes this meaningful: it proves issuance sits at a HIGHER bar, not the same one.
      const draft = await api('POST', '/api/fi-permits', member, mkBody());
      assert.equal(draft.status, 201, `crew workflow is ON, so a draft is the member's to write: ${JSON.stringify(draft.json)}`);

      const issue = await api('POST', `/api/fi-permits/${draft.json.data.id}/issue`, member, { issuedDate: '2026-07-27' });
      assert.equal(issue.status, 403, 'issuing is a bureau act');
      assert.equal(issue.json.code, 'FORBIDDEN_FI');

      const issued = await newIssued();
      const revoke = await api('POST', `/api/fi-permits/${issued.id}/revoke`, member,
        { ground: 'ISSUED_IN_ERROR', basis: 'nope' });
      assert.equal(revoke.status, 403, 'revoking is a bureau act');

      const term = await api('POST', `/api/fi-permits/${issued.id}/terminate`, member,
        { reason: 'OWNERSHIP', successorPermitNumber: num() });
      assert.equal(term.status, 403, 'terminating is a bureau act');

      // And none of the three refusals wrote anything.
      const row = await readRow(issued.id);
      assert.equal(row.status, 'Active');
      assert.equal(row.revocation_ground, null);
      assert.equal(row.superseded_by_permit_id, null);
    });

    // ══ L12 — EXPIRY IS THE STORED STATUS; THE DERIVED FLAG IS DELETED ═══════════════════
    //
    // 3.1a's read-time `is_expired` was a stopgap its own header said must die when 3.1b's
    // stored ladder landed. It has landed: expiry is the STORED status, written only by the
    // scheduled permit-expiry job — the market model (zero documented platforms derive
    // expiry at read time; PHASE3-31B-MARKET-AUDIT §3 row 1). This test is the tombstone:
    // if `is_expired` ever reappears on a read, a second expiry evaluator exists again, and
    // two evaluators of one flag WILL drift (anti-pattern #46).
    await t.test('L12 reads carry no derived is_expired — the stored status is the answer', async () => {
      const p = await newPending();
      await api('PATCH', `/api/fi-permits/${p.id}`, chief, { expiresDate: '2000-01-01' });
      const issued = await api('POST', `/api/fi-permits/${p.id}/issue`, chief, { issuedDate: '1999-01-01' });
      assert.equal(issued.status, 200, JSON.stringify(issued.json));

      const got = await api('GET', `/api/fi-permits/${p.id}`, chief);
      assert.equal(got.status, 200);
      assert.ok(!('is_expired' in got.json.data),
        'the derived flag is deleted — a read must not re-grow a second expiry evaluator');
      assert.equal(got.json.data.status, 'Active',
        'no read path flips status — only the scheduled job writes the ladder');

      // The register answers the same way — one reader gated differently than another is
      // the same shape as one writer gated differently than another.
      const list = await api('GET', '/api/fi-permits', chief);
      const inList = list.json.data.find((r) => r.id === p.id);
      assert.ok(inList, 'the permit appears in the register');
      assert.ok(!('is_expired' in inList), 'the register carries no derived flag either');

      // A legacy caller still sending ?today= must not break — the param is simply ignored
      // now that nothing derives against it.
      const legacy = await api('GET', `/api/fi-permits?today=2026-06-16`, chief);
      assert.equal(legacy.status, 200, 'a stale client sending ?today= still gets its register');

      const row = await readRow(p.id);
      assert.equal(row.status, 'Active',
        'nothing in a read wrote Expired — that transition belongs to the job alone');
    });

    // ══ L13 — THE CLIENT VOCABULARY CANNOT DRIFT FROM THE SERVER ═════════════════════════
    await t.test('L13 client revocation-ground literal matches the server', async () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const { REVOCATION_GROUNDS } = require('../constants/permitGrounds');
      const src = fs.readFileSync(
        path.join(__dirname, '../../../client/src/data/fireInspections.js'), 'utf8');
      const m = src.match(/export const REVOCATION_GROUNDS\s*=\s*\[([\s\S]*?)\];/);
      assert.ok(m, 'REVOCATION_GROUNDS literal not found in the client data file');
      const codes = [...m[1].matchAll(/code:\s*'([A-Z_]+)'/g)].map((x) => x[1]);
      assert.deepEqual(codes, [...REVOCATION_GROUNDS],
        'client REVOCATION_GROUNDS must match server constants/permitGrounds.js — change both together');
    });

    // ══ RENEWAL (3.1b, spec §3.4) ════════════════════════════════════════════════════════
    // A renewal is a NEW instrument pre-populated from the parent, never an edit, and it is
    // offered ONLY while the parent is AboutToExpire or Delinquent. Every refusal below is a
    // way renewal could quietly produce a wrong legal record; L19 is the CONTROL that proves
    // the refusals are not simply a path that never works (lesson #29).
    //
    // The parent statuses these need (AboutToExpire / Delinquent) are written ONLY by the
    // expiry job, so the fixtures set them with direct SQL. That is deliberate: going through
    // the job would be testing the job, which permitExpiryJob.test.js already does.
    async function mkCatalogueType({ allowRenewal = true } = {}) {
      const g = (await pool.query(
        `INSERT INTO fi_permit_expiration_rule_groups (department_id, name)
         VALUES ($1, $2) RETURNING id`, [deptId, `${MARK} group ${++n}`])).rows[0];
      await pool.query(
        `INSERT INTO fi_permit_expiration_rules
           (department_id, group_id, version, term_value, term_unit,
            notice_window_days, grace_days, effective_from)
         VALUES ($1, $2, 1, 1, 'year', 30, 15, '2020-01-01')`, [deptId, g.id]);
      const ty = (await pool.query(
        `INSERT INTO fi_permit_types
           (department_id, code, name, expiration_rule_group_id, allow_renewal, status)
         VALUES ($1, $2, $3, $4, $5, 'Active') RETURNING id, code`,
        [deptId, `${MARK}-TY-${++n}`, `${MARK} Renewable`, g.id, allowRenewal])).rows[0];
      return ty;
    }

    /** An ISSUED permit carrying a catalogue type, forced to `status` by SQL. */
    async function newRenewable(status = 'AboutToExpire', { allowRenewal = true } = {}) {
      const ty = await mkCatalogueType({ allowRenewal });
      const p = await newPending();
      await pool.query('UPDATE fi_permits SET permit_type_id = $1 WHERE id = $2', [ty.id, p.id]);
      const iss = await api('POST', `/api/fi-permits/${p.id}/issue`, chief, { issuedDate: '2026-07-27' });
      assert.equal(iss.status, 200, JSON.stringify(iss.json));
      await pool.query('UPDATE fi_permits SET status = $1 WHERE id = $2', [status, p.id]);
      return { permit: iss.json.data, type: ty };
    }

    // ══ L14b — A TRANSFER CARRIES THE CATALOGUE TYPE, EXACTLY AS RENEWAL DOES ════════════
    // The successor's TERMS still resolve fresh at its own issuance (R7); what must carry
    // is the TYPE — the link that makes that resolution possible at all. This path shipped
    // without it: a transferred permit silently lost its type, could never resolve a term,
    // and could never renew (TYPE_REQUIRED). Same class as gating one write path and
    // forgetting its sibling (#44) — renewal carried the type, terminate did not.
    await t.test('L14b a transfer successor keeps the catalogue type', async () => {
      const { permit, type } = await newRenewable('Active');
      const res = await api('POST', `/api/fi-permits/${permit.id}/terminate`, chief, {
        reason: 'OWNERSHIP', successorPermitNumber: num(),
      });
      assert.equal(res.status, 201, JSON.stringify(res.json));
      const { successor } = res.json.data;
      assert.equal(String(successor.permit_type_id), String(type.id),
        'the successor must keep the catalogue type — without it, it can never resolve a term or renew');
      // And straight from the database, not just the response shape.
      const row = await readRow(successor.id);
      assert.equal(String(row.permit_type_id), String(type.id));
    });

    await t.test('L15 renewal is withdrawn at Expired — an expired permit is a new application', async () => {
      const { permit } = await newRenewable('Expired');
      const r = await api('POST', `/api/fi-permits/${permit.id}/renew`, chief,
        { renewalPermitNumber: num() });
      assert.equal(r.status, 409, JSON.stringify(r.json));
      assert.equal(r.json.code, 'NOT_RENEWABLE');
      // And nothing was minted on the way to the refusal.
      const after = await readRow(permit.id);
      assert.equal(after.superseded_by_permit_id, null, 'a refused renewal must not link a child');
    });

    await t.test('L16 a second renewal is refused — ONE child per parent, not two', async () => {
      const { permit } = await newRenewable('AboutToExpire');
      const first = await api('POST', `/api/fi-permits/${permit.id}/renew`, chief,
        { renewalPermitNumber: num() });
      assert.equal(first.status, 201, JSON.stringify(first.json));
      const childId = first.json.data.renewal.id;

      const second = await api('POST', `/api/fi-permits/${permit.id}/renew`, chief,
        { renewalPermitNumber: num() });
      assert.equal(second.status, 409, JSON.stringify(second.json));
      assert.equal(second.json.code, 'ALREADY_RENEWED');
      // The link still points at the FIRST child — the refusal did not repoint it.
      const after = await readRow(permit.id);
      assert.equal(String(after.superseded_by_permit_id), String(childId));
    });

    await t.test('L17 a type with allow_renewal = false refuses', async () => {
      const { permit } = await newRenewable('Delinquent', { allowRenewal: false });
      const r = await api('POST', `/api/fi-permits/${permit.id}/renew`, chief,
        { renewalPermitNumber: num() });
      assert.equal(r.status, 409, JSON.stringify(r.json));
      assert.equal(r.json.code, 'RENEWAL_NOT_ALLOWED');
    });

    await t.test('L18 renewal is prevention-admin only, and cross-tenant is invisible', async () => {
      const { permit } = await newRenewable('AboutToExpire');
      const asMember = await api('POST', `/api/fi-permits/${permit.id}/renew`, member,
        { renewalPermitNumber: num() });
      assert.ok(asMember.status === 403 || asMember.status === 401,
        `a plain member must not renew — got ${asMember.status}`);

      // A chief of a DIFFERENT department must not even find the permit. This needs a REAL
      // user row in that department: `department_id` is resolved from the user record in
      // middleware/auth.js, NOT from the token, so signing the SAME user with a different
      // `stationId` claim proves nothing — the server correctly ignores the forged claim and
      // the request still runs as this department. (My first attempt did exactly that and
      // "failed" with a 201 that was actually correct behaviour.) The adversary that matters
      // is fully authorized in their OWN tenant.
      const otherDept = (await pool.query(
        `SELECT id FROM departments WHERE id <> $1 ORDER BY id LIMIT 1`, [deptId])).rows[0];
      if (otherDept) {
        const strangerRow = (await pool.query(
          `INSERT INTO users (username, name, initials, "passwordHash", role, station_id)
           VALUES ($1, 'Other Dept Chief', 'OD', 'x', 'chief', $2) RETURNING id, username`,
          [`${MARK}-stranger-${Date.now()}`, otherDept.id])).rows[0];
        const stranger = jwt.sign(
          { sub: strangerRow.id, username: strangerRow.username, role: 'chief',
            stationId: otherDept.id, name: 'Other Dept Chief' },
          ACCESS_SECRET, { expiresIn: '15m' });
        const r = await api('POST', `/api/fi-permits/${permit.id}/renew`, stranger,
          { renewalPermitNumber: num() });
        assert.equal(r.status, 404, `cross-tenant renewal must 404, got ${r.status}`);
      }
      const after = await readRow(permit.id);
      assert.equal(after.superseded_by_permit_id, null, 'no refused caller may link a child');
    });

    await t.test('L21 a renewal cannot reuse an existing permit number, and nothing is linked', async () => {
      const { permit } = await newRenewable('AboutToExpire');
      const taken = (await newPending()).permitNumber;
      const r = await api('POST', `/api/fi-permits/${permit.id}/renew`, chief,
        { renewalPermitNumber: taken });
      assert.equal(r.status, 409, JSON.stringify(r.json));
      assert.equal(r.json.code, 'DUPLICATE_PERMIT_NUMBER');
      // The parent must be untouched: the child insert failed, so there is nothing to link.
      assert.equal((await readRow(permit.id)).superseded_by_permit_id, null);
    });

    await t.test('L20 revoke and terminate work on AboutToExpire/Delinquent, not just Active', async () => {
      // REGRESSION GUARD for a latent prod defect found 2026-08-01. db.js's fiPermRevoke and
      // fiPermTerminate guarded on `status = 'Active'` while their ROUTES admitted the full
      // revocable/terminable sets — which migration 0094 widened to include AboutToExpire and
      // Delinquent. So the route passed its gate and the write matched zero rows:
      //   · revoke → flat 409; an IFC §105.4 revocation was impossible on those statuses.
      //   · terminate → the successor is minted BEFORE the guarded update, so the caller got a
      //     409 AND an orphaned permit was left holding a consumed permit number.
      // Dormant only because prod's permits all predate the catalogue, so the expiry job has
      // never moved one onto those rungs (5 runs, 0 transitioned, 3 skipped_no_terms/day).
      const { permit: toRevoke } = await newRenewable('AboutToExpire');
      const rev = await api('POST', `/api/fi-permits/${toRevoke.id}/revoke`, chief,
        { ground: 'MISREPRESENTATION', basis: 'Application misstated the stored quantity.' });
      assert.equal(rev.status, 200, `revoke must work on AboutToExpire: ${JSON.stringify(rev.json)}`);
      assert.equal((await readRow(toRevoke.id)).status, 'Revoked');

      const { permit: toTerm } = await newRenewable('Delinquent');
      const before = (await pool.query('SELECT COUNT(*)::int AS c FROM fi_permits')).rows[0].c;
      const term = await api('POST', `/api/fi-permits/${toTerm.id}/terminate`, chief,
        { reason: 'OWNERSHIP', successorPermitNumber: num() });
      assert.equal(term.status, 201, `terminate must work on Delinquent: ${JSON.stringify(term.json)}`);
      const termRow = await readRow(toTerm.id);
      assert.equal(termRow.status, 'TerminatedByTransfer');
      assert.ok(termRow.superseded_by_permit_id, 'the successor must be linked, not orphaned');
      // Exactly ONE new row: the successor. The bug's signature was a successor with no
      // terminated parent — a row created and then abandoned.
      const after = (await pool.query('SELECT COUNT(*)::int AS c FROM fi_permits')).rows[0].c;
      assert.equal(after, before + 1, 'terminate must mint exactly one successor, and keep it');
    });

    await t.test('L19 CONTROL — a legitimate renewal SUCCEEDS, and the child carries no term', async () => {
      const { permit, type } = await newRenewable('AboutToExpire');
      const r = await api('POST', `/api/fi-permits/${permit.id}/renew`, chief,
        { renewalPermitNumber: num(), note: 'annual' });
      assert.equal(r.status, 201, JSON.stringify(r.json));

      const child = r.json.data.renewal;
      assert.equal(child.status, 'Pending', 'a renewal is born Pending and issued through the normal door');
      assert.equal(child.issuedDate, null, 'a renewal is not pre-issued');

      const childRow = await readRow(child.id);
      // R7: the child resolves its OWN term at ITS issuance. Copying the parent's frozen term
      // forward would defeat the whole point, so none of it may be present yet.
      assert.equal(childRow.expiresDate, null, 'the parent term must NOT be carried forward');
      assert.equal(childRow.term_value, null, 'no term snapshot before the child is issued');
      assert.equal(childRow.expiration_rule_id, null, 'no rule frozen before the child is issued');
      // …but the TYPE is carried, which is what lets it resolve a term at all.
      assert.equal(String(childRow.permit_type_id), String(type.id),
        'the catalogue type must carry forward or the child can never resolve a term');

      // The parent is untouched apart from the link: a renewal is a successor, not an ending.
      const parentRow = await readRow(permit.id);
      assert.equal(String(parentRow.superseded_by_permit_id), String(child.id));
      assert.equal(parentRow.status, 'AboutToExpire', 'renewing must not move the parent\'s status');
      assert.equal(parentRow.terminated_at, null, 'a renewal is not a termination');

      // And the child issues cleanly, resolving its own term from the same type.
      const iss = await api('POST', `/api/fi-permits/${child.id}/issue`, chief, { issuedDate: '2026-08-01' });
      assert.equal(iss.status, 200, JSON.stringify(iss.json));
      const issuedChild = await readRow(child.id);
      assert.equal(issuedChild.term_value, 1, 'the child resolved its own term at its own issuance');
      // 2027-07-31, not 2027-08-01: `expiresDate` is the permit's LAST VALID DAY, so
      // computeExpiresDate subtracts a day from the term end (permitLadder.js states this
      // boundary explicitly). The point of the assertion is that the term is measured from
      // the CHILD's issue date (2026-08-01), not inherited from the parent's (2026-07-27).
      assert.equal(issuedChild.expiresDate, '2027-07-31', 'one year from the CHILD\'s issue date');
    });
  });
}
