'use strict';
// fiNotices.test.js — e2e for the Phase-2.3 violation-notice PDF (2026-07-12):
// generation stores real PDF bytes in the row (append-only), dept-authored text
// blocks flow through, the stream endpoint serves them, email is dormant-safe,
// and nothing crosses tenants. Opt-in (TENANCY_TEST_DB), house harness.

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[fiNotices] TENANCY_TEST_DB not set — skipping.');
  test('fi notices (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.RESEND_API_KEY; // force the dormant path deterministically
  delete process.env.PORT;

  test('fi notices — generate, store, stream, dormant email, isolation', async (t) => {
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

    const MARK = 'FI-NOT';
    async function cleanupFixtures() {
      await pool.query(`DELETE FROM fi_notice_service WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_signatures WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_notices WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_violations WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_inspections WHERE notes LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM fi_properties WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM fi_settings WHERE department_id = 1`);
      await pool.query(`DELETE FROM fi_code_library WHERE department_id = 1 AND code = '1001'`);
      await pool.query(`DELETE FROM users WHERE username IN ('fi_not_chief','fi_not_outsider')`);
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
      const stationBName = 'TEN-ISO Station B (tenancy test)';
      let stationB;
      {
        const found = await pool.query('SELECT id FROM stations WHERE name = $1', [stationBName]);
        stationB = found.rows.length
          ? found.rows[0].id
          : (await pool.query(`INSERT INTO stations (name, fdid, city, state) VALUES ($1,'','','') RETURNING id`, [stationBName])).rows[0].id;
      }
      async function upsertUser(username, stationId) {
        const r = await pool.query(
          `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
           VALUES ($1,$2,'FN','chief','not-a-real-hash',$3)
           ON CONFLICT (username) DO UPDATE SET station_id = EXCLUDED.station_id, role = 'chief' RETURNING id`,
          [username, `Not ${username}`, stationId]);
        return r.rows[0].id;
      }
      const sign = (id, username) => jwt.sign({ sub: id, username, role: 'chief' }, ACCESS_SECRET, { expiresIn: '15m' });
      const chief    = sign(await upsertUser('fi_not_chief', 1), 'fi_not_chief');
      const outsider = sign(await upsertUser('fi_not_outsider', stationB), 'fi_not_outsider');

      // Dept-authored legalese flows into the PDF. P1-2 (2026-07-16): generation
      // now REFUSES while the notice text blocks are unauthored, so this suite
      // models a CONFIGURED department (the refusal has its own subtest below).
      const LEGAL = `${MARK} custom legal wording FINOTICELEGALTOKEN unique enough to find in the page stream`;
      const BODY = `${MARK} dept-authored notice body.`;
      const set = await api('PATCH', '/api/fi-settings', chief, {
        notice_legalese: LEGAL, notice_body: BODY,
        notice_passed_body: `${MARK} passed body.`, signature_agreement_text: `${MARK} signature agreement.`,
      });
      assert.equal(set.status, 200, JSON.stringify(set.json));

      // Decision A (2026-07-16): the notice composes the citation ("IFC 2021 §1032.2")
      // from the department's code library. Seed the row the fixture violation cites.
      const libRow = await api('POST', '/api/fi-code-library', chief, {
        code: '1001', title: `${MARK} exit obstruction`, category: 'Egress',
        section: '1032.2', edition: 'IFC 2021',
      });
      assert.equal(libRow.status, 201, JSON.stringify(libRow.json));

      const prop = await api('POST', '/api/fi-properties', chief, { name: `${MARK} Property`, address: '1 Main St' });
      const insp = await api('POST', '/api/fi-inspections', chief, {
        propertyId: prop.json.data.id, notes: `${MARK} fixture`, completedDate: '2026-07-12',
        violations: [{ code: '1001', description: 'exit blocked', status: 'Open', followUpDate: '2026-08-15' }],
      });
      const inspId = insp.json.data.id;

      // 0053: a notice is the OFFICER'S ATTESTATION — the inspector must sign before
      // one can be issued (an unsigned notice is a defective instrument). The
      // occupant's signature is never a gate. Sign here so this suite exercises the
      // notice itself rather than the gate (fiServiceOfNotice.test.js proves the gate).
      const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const attest = await api('POST', `/api/fi-inspections/${inspId}/signatures`, chief,
        { role: 'inspector', status: 'signed', signerName: 'Insp. Notice Fixture', imageDataUrl: PNG_1PX });
      assert.equal(attest.status, 201, JSON.stringify(attest.json));

      // P1-2 (2026-07-16): a legal instrument must never print "[SAMPLE TEXT …]" —
      // while the department's notice text is unauthored, generation is refused
      // with the exact blocks to fill. Blank one block, prove the 422, restore.
      await t.test('P1-2: generation is REFUSED while the notice text is unauthored', async () => {
        await pool.query(`UPDATE fi_settings SET notice_body = '' WHERE department_id = 1`);
        try {
          const r = await api('POST', `/api/fi-inspections/${inspId}/notice`, chief, {});
          assert.equal(r.status, 422, JSON.stringify(r.json));
          assert.equal(r.json.code, 'NOTICE_TEMPLATES_UNCONFIGURED');
          assert.ok(String(r.json.error).includes('notice_body'), JSON.stringify(r.json));
        } finally {
          // Restore even on assertion failure — the suite's later subtests model a
          // configured department.
          await pool.query(`UPDATE fi_settings SET notice_body = $1 WHERE department_id = 1`, [BODY]);
        }
      });

      let noticeId;
      await t.test('generate: stores real PDF bytes, records the act, dormant email is explicit', async () => {
        const r = await api('POST', `/api/fi-inspections/${inspId}/notice`, chief, { emailTo: 'owner@example.com' });
        assert.equal(r.status, 201, JSON.stringify(r.json));
        noticeId = r.json.data.id;
        assert.ok(r.json.data.bytes > 1500, `PDF has substance (${r.json.data.bytes} bytes)`);
        assert.equal(r.json.data.emailed, false);
        assert.match(r.json.data.emailSkipped, /not configured/, 'dormant email is EXPLICIT, never silent');
        assert.equal(r.json.data.sent_to, '', 'no send recorded on a skipped email');
        const aud = await pool.query(
          `SELECT 1 FROM audit_log WHERE table_name='fi_notices' AND action='create' AND record_id=$1`, [noticeId]);
        assert.ok(aud.rows.length >= 1, 'notice generation audited');
      });

      await t.test('stream: serves the stored PDF with the dept-authored legalese inside', async () => {
        const res = await fetch(`${base}/api/fi-notices/${noticeId}/pdf`, {
          headers: { Authorization: `Bearer ${chief.replace ? chief : chief}` },
        });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'application/pdf');
        const buf = Buffer.from(await res.arrayBuffer());
        assert.equal(buf.subarray(0, 5).toString(), '%PDF-', 'real PDF magic bytes');
        // PDFKit deflate-compresses content streams — inflate each stream and
        // grep the department-authored legalese out of the actual page content.
        const zlib = require('node:zlib');
        let inflated = '';
        let at = 0;
        while (true) {
          const s = buf.indexOf('stream', at); if (s === -1) break;
          const e = buf.indexOf('endstream', s); if (e === -1) break;
          const body = buf.subarray(s + 'stream'.length, e);
          const start = body[0] === 0x0d ? 2 : body[0] === 0x0a ? 1 : 0;
          try { inflated += zlib.inflateSync(body.subarray(start)).toString('latin1'); } catch { /* non-flate stream */ }
          at = e + 'endstream'.length; // never re-match the 'stream' inside 'endstream'
        }
        // PDFKit emits text as HEX string runs with kerning ([<54> 60 <657374>] TJ)
        // — decode every hex run in order, concatenate, and search for an unbroken
        // token from the legalese.
        const decoded = [...inflated.matchAll(/<([0-9a-fA-F]+)>/g)]
          .map((m) => Buffer.from(m[1].length % 2 ? m[1] + '0' : m[1], 'hex').toString('latin1'))
          .join('');
        assert.ok(decoded.includes('FINOTICELEGALTOKEN'),
          'department-authored text made it into the document');
        // Decision A: the violation line cites the composed library citation —
        // edition + section — not the bare stored code.
        assert.ok(decoded.includes('IFC 2021'), 'citation edition rendered into the document');
        assert.ok(decoded.includes('1032.2'), 'citation section rendered into the document');
      });

      await t.test('append-only: regeneration adds a second notice, first is untouched', async () => {
        const again = await api('POST', `/api/fi-inspections/${inspId}/notice`, chief, {});
        assert.equal(again.status, 201);
        assert.notEqual(again.json.data.id, noticeId);
        const list = await api('GET', `/api/fi-inspections/${inspId}/notices`, chief);
        assert.equal(list.json.data.length, 2);
        assert.ok(list.json.data.every((n) => n.bytes > 1500));
      });

      await t.test('isolation: another department can neither generate nor read', async () => {
        assert.equal((await api('POST', `/api/fi-inspections/${inspId}/notice`, outsider, {})).status, 404);
        const res = await fetch(`${base}/api/fi-notices/${noticeId}/pdf`, { headers: { Authorization: `Bearer ${outsider}` } });
        assert.equal(res.status, 404);
      });
    } finally {
      await cleanupFixtures();
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
