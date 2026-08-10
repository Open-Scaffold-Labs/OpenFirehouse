/**
 * fiSettingsBilling.test.js — the 3.2 billing config on /api/fi-settings (Slice D).
 *
 * WHY THIS SUITE EXISTS. Migrations 0125 and 0126 added three columns to fi_settings —
 * invoice_number_prefix, fiscal_year_start_month, waiver_approval_threshold — and NOTHING
 * IN THE APPLICATION COULD WRITE ANY OF THEM. The settings route selected a fixed column
 * list that omitted all three, and its PATCH body was a bare z.object, so sending one was
 * STRIPPED IN SILENCE and answered 200 having changed nothing.
 *
 * The consequence was not cosmetic: POST /api/fi-invoices and POST /api/fi-payments both
 * refuse with 409 INVOICE_PREFIX_NOT_CONFIGURED until a prefix is set, so the ENTIRE
 * invoice and receipt surface was unreachable except by hand-written SQL. Slices B and C
 * shipped and could not be used.
 *
 * The claims proved here:
 *   · the three columns round-trip through the API at all (the blocker itself);
 *   · an unknown key is now a LOUD 400, not a silent 200 — the failure mode above;
 *   · GET returns nothing PATCH will not accept. PreventionSettings PATCHes the entire GET
 *     response back, so any divergence breaks saving outright. That coupling was implicit
 *     and is now fenced;
 *   · the app's validation MIRRORS the database CHECKs, so the refusal is the same refusal;
 *   · NULL means "no waiver band" and survives as NULL — it is not coerced to 0, which
 *     would be the opposite policy (every waiver needing a second approver);
 *   · writes are chief-gated, with a read CONTROL so a 403 cannot be a mounting error.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[fiSettingsBilling] TENANCY_TEST_DB not set — skipping.');
  test('fi-settings billing config (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('fi-settings: the 3.2 billing config is reachable, validated and chief-gated', async (t) => {
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

    const MARK = `FISET-${Date.now()}`;

    t.after(async () => {
      const like = [`${MARK}%`];
      const deptFilter = `(SELECT id FROM departments WHERE name LIKE $1)`;
      const step = async (label, sql, params = like) => {
        try { await pool.query(sql, params); } catch (e) {
          console.error(`[fiSettingsBilling teardown] ${label} FAILED: ${e.message}`);
        }
      };
      await step('audit', `DELETE FROM audit_log WHERE department_id IN ${deptFilter}`);
      await step('settings', `DELETE FROM fi_settings WHERE department_id IN ${deptFilter}`);
      await step('user depts', `DELETE FROM of_user_departments WHERE department_id IN ${deptFilter}`);
      await step('users', `DELETE FROM users WHERE station_id IN ${deptFilter}`);
      await step('stations', `DELETE FROM stations WHERE department_id IN ${deptFilter}`);
      await step('departments', `DELETE FROM departments WHERE name LIKE $1`);
    });

    const A = await mkAlignedDeptStation(pool, `${MARK} A`);

    const mkUser = async (dept, role, tag) => {
      const uname = `${MARK}-${tag}`.toLowerCase();
      const { rows } = await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
         VALUES ($1,$2,'XX',$3,'x',$4) RETURNING id`,
        [uname, `${tag} user`, role, dept]);
      await pool.query(
        'INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [rows[0].id, dept, role]);
      return jwt.sign({ sub: rows[0].id, username: uname, role }, ACCESS_SECRET, { expiresIn: '1h' });
    };
    const chief  = await mkUser(A, 'chief',  'chief');
    const member = await mkUser(A, 'member', 'member');

    const server = app.listen(0);
    t.after(() => new Promise((r) => server.close(r)));

    const api = async (method, path, token, body) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let json = null; try { json = await res.json(); } catch { /* no body */ }
      return { status: res.status, json };
    };
    const BASE = '/api/fi-settings';

    /* ── The blocker: the three columns are READABLE ─────────────────────────────────── */

    const initial = await api('GET', BASE, chief);
    assert.equal(initial.status, 200, JSON.stringify(initial.json));
    for (const col of ['invoice_number_prefix', 'fiscal_year_start_month', 'waiver_approval_threshold']) {
      assert.ok(col in initial.json.data, `${col} must be readable — the UI cannot set what it cannot see`);
    }
    assert.equal(initial.json.data.invoice_number_prefix, '',
      "'' is the shipped value and means NOT CONFIGURED — the mint routes refuse on it");
    assert.equal(initial.json.data.fiscal_year_start_month, 1);
    assert.equal(initial.json.data.waiver_approval_threshold, null,
      'the R9 band ships UNSET — an unchosen default is a decision nobody made');

    /* ── …and WRITABLE. This is the whole point of the slice ─────────────────────────── */

    const set = await api('PATCH', BASE, chief, {
      invoice_number_prefix: 'AFD', fiscal_year_start_month: 7, waiver_approval_threshold: '250.00',
    });
    assert.equal(set.status, 200, JSON.stringify(set.json));

    // A 200 is not persistence. Read it back — from the DATABASE, not from the response.
    const { rows: [stored] } = await pool.query(
      `SELECT invoice_number_prefix, fiscal_year_start_month, waiver_approval_threshold
         FROM fi_settings WHERE department_id = $1`, [A]);
    assert.equal(stored.invoice_number_prefix, 'AFD',
      'the prefix must actually land in fi_settings — a silent strip answering 200 is the bug this fixes');
    assert.equal(Number(stored.fiscal_year_start_month), 7);
    assert.equal(String(stored.waiver_approval_threshold), '250.00');

    /* ── NULL is a value, not an absence ─────────────────────────────────────────────── */

    const clearBand = await api('PATCH', BASE, chief, { waiver_approval_threshold: null });
    assert.equal(clearBand.status, 200, JSON.stringify(clearBand.json));
    const { rows: [cleared] } = await pool.query(
      'SELECT waiver_approval_threshold FROM fi_settings WHERE department_id = $1', [A]);
    assert.equal(cleared.waiver_approval_threshold, null,
      'clearing the band must store NULL — 0 would mean EVERY waiver needs a second approver');

    /* ── The app refuses exactly what the database refuses ───────────────────────────── */

    // CHECK (invoice_number_prefix ~ '^[A-Z0-9]{0,12}$'). The prefix goes into a document
    // number retained forever, so a hyphen (the field separator) or a space would corrupt
    // the parse of every number ever issued under it.
    for (const bad of ['afd', 'A-FD', 'A FD', 'TOOLONGPREFIX13', 'A_FD']) {
      const r = await api('PATCH', BASE, chief, { invoice_number_prefix: bad });
      assert.equal(r.status, 400, `prefix ${JSON.stringify(bad)} must be refused, got ${r.status}`);
    }
    for (const bad of [0, 13, -1, 1.5]) {
      const r = await api('PATCH', BASE, chief, { fiscal_year_start_month: bad });
      assert.equal(r.status, 400, `month ${bad} must be refused, got ${r.status}`);
    }
    // Money is a STRING over the wire in this module, like every other amount. A JSON
    // number is refused rather than coerced.
    assert.equal((await api('PATCH', BASE, chief, { waiver_approval_threshold: 250 })).status, 400,
      'a JSON number is not money here — every amount in 3.2 travels as a decimal string');
    assert.equal((await api('PATCH', BASE, chief, { waiver_approval_threshold: '-5.00' })).status, 400);

    // CONTROL: a well-formed value on the same field still passes, so the four refusals
    // above are the VALIDATION talking and not a route that rejects everything.
    assert.equal((await api('PATCH', BASE, chief, { waiver_approval_threshold: '0.00' })).status, 200,
      'zero is a legitimate band — every waiver needs a second approver — and must be settable');

    /* ── An unknown key is LOUD. This is the exact shape of the original defect ──────── */

    const typo = await api('PATCH', BASE, chief, { invoice_number_prefx: 'AFD' });
    assert.equal(typo.status, 400,
      'a misspelled key must be REFUSED — answering 200 while changing nothing is how three '
      + 'columns stayed unreachable for two migrations while looking settable');

    /* ── GET returns nothing PATCH will not accept ───────────────────────────────────── */

    // PreventionSettings does `fi.settings.patch(form)` where `form` IS the GET response.
    // If the two column sets ever diverge, saving breaks outright — so round-trip the whole
    // thing unchanged and require a 200.
    const full = await api('GET', BASE, chief);
    const roundTrip = await api('PATCH', BASE, chief, full.json.data);
    assert.equal(roundTrip.status, 200,
      'every column GET returns must be a column PATCH accepts — the client sends the whole '
      + `object back. Rejected: ${JSON.stringify(roundTrip.json)}`);

    /* ── Chief-gated, with a read control ────────────────────────────────────────────── */

    assert.equal((await api('PATCH', BASE, member, { invoice_number_prefix: 'XXX' })).status, 403,
      'department money policy is not a member-level setting');
    assert.equal((await api('GET', BASE, member)).status, 200,
      'CONTROL: the same member CAN read — so the 403 above is the ROLE, not a broken route');
    // …and the refused write changed nothing.
    const { rows: [afterDenied] } = await pool.query(
      'SELECT invoice_number_prefix FROM fi_settings WHERE department_id = $1', [A]);
    assert.equal(afterDenied.invoice_number_prefix, 'AFD', 'a refused write must not have landed');
  });
}
