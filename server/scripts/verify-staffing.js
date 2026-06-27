'use strict';
/**
 * verify-staffing.js — end-to-end check for the Phase E staffing endpoint.
 * Assumes the dev server is running on PORT (default 3030) against the local DB.
 * Seeds seat-declared responders on the latest incident, mints an officer JWT,
 * hits GET /api/incidents/:id/staffing + POST /respond, and asserts the result.
 *
 *   DATABASE_URL=postgresql://matthewlavin@localhost:5432/freestation \
 *   PORT=3030 node scripts/verify-staffing.js
 */
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const { ACCESS_SECRET } = require('../src/config/jwtSecret');

const BASE = `http://localhost:${process.env.PORT || 3030}`;
const DB = process.env.DATABASE_URL || 'postgresql://matthewlavin@localhost:5432/freestation';
let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✔', msg); } else { failed++; console.log('  ✘', msg); } };

async function getJSON(path, token) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(BASE + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (r.status !== 503) return { status: r.status, body: await r.json().catch(() => ({})) };
    await new Promise((res) => setTimeout(res, 1000)); // wait for lazy initDb
  }
  throw new Error('server stayed 503 (db not ready)');
}
async function postJSON(path, token, payload) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

(async () => {
  const db = new Client({ connectionString: DB });
  await db.connect();

  const { rows: incs } = await db.query(
    'SELECT id FROM incidents WHERE department_id=1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1');
  if (!incs.length) throw new Error('no incident to test against');
  const incidentId = incs[0].id;
  console.log(`\nTesting incident ${incidentId}\n`);

  // Seed seat-declared responders (Engine 1 = apparatus 1; pos 1 Driver, 2 Officer, 3 Nozzle).
  const seed = [
    [9001, 'Maria T. Delgado', 1, 2],   // Captain → Officer seat: expect qualified
    [9002, 'Robert L. Huang', 1, 3],    // FF II   → Nozzle seat:  expect qualified
    [9003, 'Carlos Ruiz', 1, 1],        // Prob FF → Driver seat:  expect partial (no D/O certs, under rank)
    [9004, 'Amy Winters', null, null],  // no seat → expect unassigned
  ];
  await db.query('DELETE FROM incident_responses WHERE incident_id=$1 AND user_id = ANY($2)',
    [incidentId, seed.map((s) => s[0])]);
  for (const [uid, name, app, pos] of seed) {
    await db.query(
      `INSERT INTO incident_responses
         (station_id, department_id, incident_id, user_id, member_name, status, cert_level, apparatus_id, position_id, responded_at)
       VALUES (1,1,$1,$2,$3,'responding','probationary',$4,$5,NOW())`,
      [incidentId, uid, name, app, pos]);
  }

  const officerTok = jwt.sign({ sub: 2, username: 'officer', role: 'officer', client_kind: 'command' }, ACCESS_SECRET, { expiresIn: '1h' });
  const memberTok  = jwt.sign({ sub: 3, username: 'member',  role: 'member',  client_kind: 'companion' }, ACCESS_SECRET, { expiresIn: '1h' });

  // ── GET staffing ──────────────────────────────────────────────────────────
  const { status, body } = await getJSON(`/api/incidents/${incidentId}/staffing`, officerTok);
  ok(status === 200, `GET staffing → 200 (got ${status})`);
  const data = body.data || {};
  ok(Array.isArray(data.apparatus) && data.apparatus.length > 0, `apparatus[] non-empty (${(data.apparatus || []).length})`);
  ok(data.mode === 'career', `mode === 'career' (run list present) (got ${data.mode})`);
  ok(!!data.generatedAt, 'generatedAt present (provenance)');

  const e1 = (data.apparatus || []).find((a) => a.designation === 'Engine 1');
  ok(!!e1, 'Engine 1 present');
  if (e1) {
    const seat = (n) => e1.positions.find((p) => p.positionName === n);
    const officer = seat('Officer'); const nozzle = seat('Nozzle'); const driver = seat('Driver/Engineer');
    ok(officer && officer.filledBy && officer.filledBy.source === 'responder', 'Engine 1 Officer filled by responder');
    ok(officer && officer.qualification === 'qualified', `Engine 1 Officer qualified (got ${officer && officer.qualification})`);
    ok(nozzle && nozzle.qualification === 'qualified', `Engine 1 Nozzle qualified (got ${nozzle && nozzle.qualification})`);
    ok(driver && driver.qualification === 'partial', `Engine 1 Driver partial (got ${driver && driver.qualification})`);
    ok(driver && driver.missingCerts.length > 0, `Engine 1 Driver lists missing certs (${driver && JSON.stringify(driver.missingCerts)})`);
    console.log('\n  Engine 1 readout:', JSON.stringify({ verdict: e1.verdict, minStaffing: e1.minStaffing, filled: e1.filledCount, qualified: e1.qualifiedCount, open: e1.openCount }));
  }
  const unassigned = (data.unassignedResponders || []).map((r) => r.memberName);
  ok(unassigned.includes('Amy Winters'), `unassignedResponders includes Amy Winters (${JSON.stringify(unassigned)})`);
  ok(data.totals && data.totals.respondersResponding >= 4, `totals.respondersResponding >= 4 (got ${data.totals && data.totals.respondersResponding})`);

  // ── POST respond seat validation ────────────────────────────────────────────
  const bad = await postJSON(`/api/incidents/${incidentId}/respond`, memberTok, { status: 'responding', apparatusId: 99999 });
  ok(bad.status === 400 && bad.body.code === 'BAD_APPARATUS', `POST respond bad apparatus → 400 BAD_APPARATUS (got ${bad.status}/${bad.body.code})`);

  const good = await postJSON(`/api/incidents/${incidentId}/respond`, memberTok, { status: 'responding', apparatusId: 1, positionId: 4 });
  ok(good.status === 200 && good.body.data && good.body.data.apparatus_id === 1 && good.body.data.position_id === 4,
    `POST respond valid seat → 200 with apparatus_id=1 position_id=4 (got ${good.status}, app=${good.body.data && good.body.data.apparatus_id}, pos=${good.body.data && good.body.data.position_id})`);

  // cleanup seeded responders
  await db.query('DELETE FROM incident_responses WHERE incident_id=$1 AND user_id = ANY($2)',
    [incidentId, [...seed.map((s) => s[0]), 3]]);
  await db.end();

  console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'}: ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('verify-staffing error:', e); process.exit(1); });
