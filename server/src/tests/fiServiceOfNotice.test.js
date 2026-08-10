'use strict';
// fiServiceOfNotice.test.js — e2e for Phase 3.5 (0053), 2026-07-13.
//
// Proves, over real HTTP, the doctrine the research established:
//   · The INSPECTOR's signature gates the notice (an unsigned notice is a
//     defective instrument). The OCCUPANT's never does.
//   · Refusal to sign is a RECORDED OUTCOME and still constitutes service — the
//     notice stands and the correction clock still runs.
//   · Posting without proof (photo + location) is refused.
//   · THE JONES GATE: once a returned/unclaimed mail event is ingested, the
//     department KNOWS the notice failed, and service reads action_required until
//     a blessed cure (posting / first-class resend / personal service) is recorded.
//   · Nothing crosses tenants.
// Opt-in (TENANCY_TEST_DB), house harness.

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[fiServiceOfNotice] TENANCY_TEST_DB not set — skipping.');
  test('fi service of notice (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.RESEND_API_KEY;
  delete process.env.PORT;

  test('fi service of notice — signature gate, refusal, posting proof, Jones gate', async (t) => {
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

    // A 1x1 PNG — enough to be a real image without bloating the test.
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const MARK = 'FI-SVC';
    async function cleanupFixtures() {
      await pool.query(`DELETE FROM fi_notice_service WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_signatures WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_notices WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_violations WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_inspections WHERE notes LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM fi_properties WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM users WHERE username IN ('fi_svc_chief','fi_svc_outsider')`);
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
      const found = await pool.query('SELECT id FROM stations WHERE name = $1', [stationBName]);
      const stationB = found.rows.length
        ? found.rows[0].id
        : (await pool.query(`INSERT INTO stations (name, fdid, city, state) VALUES ($1,'','','') RETURNING id`, [stationBName])).rows[0].id;

      async function upsertUser(username, stationId) {
        const r = await pool.query(
          `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
           VALUES ($1,$2,'FS','chief','not-a-real-hash',$3)
           ON CONFLICT (username) DO UPDATE SET station_id = EXCLUDED.station_id, role = 'chief' RETURNING id`,
          [username, `Insp ${username}`, stationId]);
        return r.rows[0].id;
      }
      const sign = (id, username) => jwt.sign({ sub: id, username, role: 'chief' }, ACCESS_SECRET, { expiresIn: '15m' });
      const chief    = sign(await upsertUser('fi_svc_chief', 1), 'fi_svc_chief');
      const outsider = sign(await upsertUser('fi_svc_outsider', stationB), 'fi_svc_outsider');

      // P1-2 (2026-07-16): notice generation refuses while the notice text blocks
      // are unauthored (NOTICE_TEMPLATES_UNCONFIGURED). This suite proves the
      // SERVICE doctrines, so it models a configured department.
      const cfg = await api('PATCH', '/api/fi-settings', chief, {
        notice_body: `${MARK} body.`, notice_legalese: `${MARK} legalese.`,
        notice_passed_body: `${MARK} passed body.`, signature_agreement_text: `${MARK} signature agreement.`,
      });
      assert.equal(cfg.status, 200, JSON.stringify(cfg.json));

      const prop = await api('POST', '/api/fi-properties', chief, { name: `${MARK} Property`, address: '412 Elmwood Dr' });
      const insp = await api('POST', '/api/fi-inspections', chief, {
        propertyId: prop.json.data.id, notes: `${MARK} fixture`, completedDate: '2026-07-13',
        violations: [{ code: '1001', description: 'exit blocked', status: 'Open', followUpDate: '2026-08-15' }],
      });
      const inspId = insp.json.data.id;

      await t.test('the NOTICE is gated on the INSPECTOR signature — never on the occupant\'s', async () => {
        const early = await api('POST', `/api/fi-inspections/${inspId}/notice`, chief, {});
        assert.equal(early.status, 409, JSON.stringify(early.json));
        assert.equal(early.json.code, 'INSPECTOR_SIGNATURE_REQUIRED');
      });

      await t.test('the inspector signature is an attestation — it cannot be refused', async () => {
        const bad = await api('POST', `/api/fi-inspections/${inspId}/signatures`, chief,
          { role: 'inspector', status: 'refused', signerName: 'Insp. Smith' });
        assert.equal(bad.status, 400, JSON.stringify(bad.json));
        assert.equal(bad.json.code, 'INSPECTOR_MUST_SIGN');
      });

      await t.test('REFUSAL is recorded as an outcome, not an absent row', async () => {
        const r = await api('POST', `/api/fi-inspections/${inspId}/signatures`, chief, {
          role: 'occupant', status: 'refused', signerName: 'Harold Bauer',
          signerRoleLabel: 'Manager', advisementsRead: true,
          refusalReason: 'Disputes the finding',
        });
        assert.equal(r.status, 201, JSON.stringify(r.json));
        assert.equal(r.json.data.status, 'refused');
        assert.equal(r.json.data.advisements_read, true,
          'the three advisements must be recorded as read — that is what makes the refusal defensible');
      });

      await t.test('a refused occupant signature does NOT block the notice', async () => {
        const sig = await api('POST', `/api/fi-inspections/${inspId}/signatures`, chief, {
          role: 'inspector', status: 'signed', signerName: 'Insp. R. Smith',
          imageDataUrl: PNG, documentSha256: 'a'.repeat(64),
        });
        assert.equal(sig.status, 201, JSON.stringify(sig.json));
        const notice = await api('POST', `/api/fi-inspections/${inspId}/notice`, chief, {});
        assert.ok(notice.status === 200 || notice.status === 201, JSON.stringify(notice.json));
        assert.ok(notice.json.data.bytes > 500, 'a real PDF was produced');
      });

      await t.test('POSTING without proof is refused — a posting record with no photo proves nothing', async () => {
        const bare = await api('POST', `/api/fi-inspections/${inspId}/service`, chief,
          { method: 'posted_premises', outcome: 'posted' });
        assert.equal(bare.status, 400, JSON.stringify(bare.json));
        assert.equal(bare.json.code, 'POSTING_PROOF_REQUIRED');
      });

      await t.test('"personally served" cannot be claimed when nobody was there', async () => {
        const lie = await api('POST', `/api/fi-inspections/${inspId}/service`, chief,
          { method: 'personal_service', outcome: 'no_party_present' });
        assert.equal(lie.status, 400, JSON.stringify(lie.json));
        assert.equal(lie.json.code, 'NOT_PERSONAL_SERVICE');
      });

      let mailId;
      await t.test('refusal still constitutes SERVICE — the clock runs', async () => {
        const r = await api('POST', `/api/fi-inspections/${inspId}/service`, chief, {
          method: 'personal_service', outcome: 'refused_signature',
          serveeName: 'Harold Bauer', serveeRelationship: 'Manager', addressUsed: '412 Elmwood Dr',
        });
        assert.equal(r.status, 201, JSON.stringify(r.json));
        assert.equal(r.json.status.status, 'sufficient',
          'the person was there and the document was offered — that is service');
        assert.ok(r.json.status.servedAt, 'and the correction clock starts from it');
      });

      await t.test('THE JONES GATE — an ingested returned-mail event BLOCKS until cured', async () => {
        const mailed = await api('POST', `/api/fi-inspections/${inspId}/service`, chief, {
          method: 'certified_mail', outcome: 'mailed', mailClass: 'certified_rrr',
          mailTrackingNumber: '9407111899', addressUsed: '412 Elmwood Dr',
          addressSource: 'county assessor roll, 2026-01',
        });
        assert.equal(mailed.status, 201, JSON.stringify(mailed.json));
        mailId = mailed.json.data.id;

        // The Postal Service brings it back. THIS is the moment the department
        // acquires knowledge — and with it, the constitutional duty.
        const returned = await api('POST', `/api/fi-service/${mailId}/mail-event`, chief,
          { event: 'returned_undelivered' });
        assert.equal(returned.status, 200, JSON.stringify(returned.json));
        assert.equal(returned.json.status.status, 'action_required',
          'knowing the mail failed and proceeding anyway is exactly what Jones v. Flowers condemns');
        assert.equal(returned.json.status.gate.blocked, true);
        assert.match(returned.json.status.gate.reason, /Jones v\. Flowers/);
        assert.equal(returned.json.status.gate.required.length, 3, 'the three blessed cures — and no open-ended address search');
      });

      await t.test('THE JONES GATE — posting the premises (with proof) clears it', async () => {
        const posted = await api('POST', `/api/fi-inspections/${inspId}/service`, chief, {
          method: 'posted_premises', outcome: 'posted',
          postingPhotoDataUrl: PNG, postingLat: 44.9, postingLng: -93.0, postingAccuracyM: 6,
          postingLocationDesc: 'front entrance, north door',
        });
        assert.equal(posted.status, 201, JSON.stringify(posted.json));
        assert.equal(posted.json.status.status, 'sufficient', 'the cure discharges the duty');
        assert.equal(posted.json.status.gate.blocked, false);
        assert.equal(posted.json.data.has_posting_photo, true, 'the proof is on the record');
      });

      await t.test('the Certificate of Service is rendered INTO the notice', async () => {
        const notice = await api('POST', `/api/fi-inspections/${inspId}/notice`, chief, {});
        assert.ok(notice.status === 200 || notice.status === 201, JSON.stringify(notice.json));
        const list = await api('GET', `/api/fi-inspections/${inspId}/notices`, chief);
        const newest = list.json.data[0];
        const res = await fetch(`${base}/api/fi-notices/${newest.id}/pdf`, {
          headers: { Authorization: `Bearer ${chief}` },
        });
        assert.equal(res.status, 200);
        const pdf = Buffer.from(await res.arrayBuffer());
        // PDFKit compresses page content, so assert on the structure + size rather
        // than grepping the stream (the fiNotices suite already proves text lands).
        assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
        assert.ok(pdf.length > 1500, 'the notice now carries the acknowledgment + certificate blocks');
      });

      await t.test('records are RETIRED, never deleted', async () => {
        const v = await api('POST', `/api/fi-service/${mailId}/void`, chief, { reason: 'wrong tracking number keyed' });
        assert.equal(v.status, 200, JSON.stringify(v.json));
        assert.ok(v.json.data.voided_at, 'voided, still on the record');
        const still = await pool.query('SELECT id FROM fi_notice_service WHERE id = $1', [mailId]);
        assert.equal(still.rows.length, 1, 'the row is retained — it is subpoenable');
      });

      await t.test('service records never cross tenants', async () => {
        const peek = await api('GET', `/api/fi-inspections/${inspId}/service`, outsider);
        assert.ok(peek.status === 404 || (peek.json?.data || []).length === 0,
          `another department must not see this ladder (got ${peek.status})`);
        const write = await api('POST', `/api/fi-inspections/${inspId}/service`, outsider,
          { method: 'personal_service', outcome: 'served' });
        assert.equal(write.status, 404, 'and must not be able to write to it');
      });
    } finally {
      await cleanupFixtures();
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
