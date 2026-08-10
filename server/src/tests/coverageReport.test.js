'use strict';
/**
 * 4B.4 — measured travel-time performance by area, over real HTTP.
 *
 * The assertions that matter here are about what the map is allowed to IMPLY.
 * A thin cell must still appear (dropping it quietly shrinks the district), an
 * incident that cannot be measured must be counted under the RIGHT reason
 * (the three causes have different fixes), and a negative interval must be
 * discarded rather than read as a very fast response.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('coverage report', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('4B.4 — coverage: thin cells kept, gaps attributed, defects discarded, dept-scoped', async () => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const t = realSetInterval(...a); if (t && t.unref) t.unref(); return t; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }

    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const http = require('http');

    const MARK = `cov${Date.now() % 1e7}`;
    const DAY = '2026-05-11';
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    const port = server.address().port;

    const api = (path, token) => new Promise((resolve, reject) => {
      http.get({ port, path, headers: { Authorization: `Bearer ${token}` } }, (res) => {
        let b = ''; res.on('data', (c) => { b += c; });
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(b || '{}') }); } catch (e) { reject(e); } });
      }).on('error', reject);
    });

    try {
      const dept = async (name) => (await pool.query(
        'INSERT INTO departments (name) VALUES ($1) RETURNING id', [name])).rows[0].id;
      const A = await dept(MARK + '-A');
      const B = await dept(MARK + '-B');
      for (const d of [A, B]) {
        await pool.query('INSERT INTO stations (id,name,department_id) VALUES ($1,$2,$1) ON CONFLICT (id) DO NOTHING',
          [d, `${MARK}-st${d}`]);
      }

      async function mkUser(uname, role, d) {
        const uid = (await pool.query(
          `INSERT INTO users (username,name,initials,role,"passwordHash",station_id)
           VALUES ($1,$2,'XX',$3,'x',$4) RETURNING id`, [uname, uname, role, d])).rows[0].id;
        await pool.query('INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [uid, d, role]);
        return jwt.sign({ sub: uid, username: uname, role }, ACCESS_SECRET, { expiresIn: '15m' });
      }
      const officer = await mkUser(MARK + '-off', 'officer', A);
      const member = await mkUser(MARK + '-mem', 'member', A);

      const engId = (await pool.query(
        `INSERT INTO apparatus (designation,type,year,station_id,department_id)
         VALUES ($1,'Engine',2020,$2,$2) RETURNING id`, [MARK + '-E1', A])).rows[0].id;

      /** A call with coordinates, linked to an incident, with unit statuses. */
      async function mkCall(run, incNum, d, { lat, lng, enr, arr }) {
        await pool.query(
          `INSERT INTO cad_alerts (alert_id,address,units,dispatched_at,latitude,longitude,station_id,department_id)
           VALUES ($1,'1 Main St','E1',$2::timestamptz,$3,$4,$5,$5)`,
          [run, `${DAY}T10:00:00Z`, lat, lng, d]);
        const inc = (await pool.query(
          `INSERT INTO incidents ("incidentNumber",date,type,department_id,station_id,cad_run_number)
           VALUES ($1,$2,'Structure Fire',$3,$3,$4) RETURNING id`, [incNum, DAY, d, run])).rows[0].id;
        await pool.query('UPDATE cad_alerts SET incident_id=$1 WHERE alert_id=$2', [inc, run]);
        if (enr) {
          for (const [st, ts] of [['dispatched', `${DAY}T10:00:00Z`], ['enroute', enr], ['on_scene', arr]]) {
            if (!ts) continue;
            await pool.query(
              `INSERT INTO unit_status_history (station_id,apparatus_id,designation,status,changed_at,incident_id,department_id)
               VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$1)`,
              [d, engId, MARK + '-E1', st, ts, inc]);
          }
        }
        return inc;
      }

      // Cell 1 — three incidents at the same place, travel 120/180/240s.
      // Enough to clear a min_n of 3.
      await mkCall(MARK + '-R1', MARK + '-I1', A,
        { lat: 41.5000, lng: -73.5000, enr: `${DAY}T10:01:00Z`, arr: `${DAY}T10:03:00Z` });
      await mkCall(MARK + '-R2', MARK + '-I2', A,
        { lat: 41.5001, lng: -73.5001, enr: `${DAY}T10:01:00Z`, arr: `${DAY}T10:04:00Z` });
      await mkCall(MARK + '-R3', MARK + '-I3', A,
        { lat: 41.5002, lng: -73.5002, enr: `${DAY}T10:01:00Z`, arr: `${DAY}T10:05:00Z` });

      // Cell 2 — ONE incident, far away. Thin, and must still be returned.
      await mkCall(MARK + '-R4', MARK + '-I4', A,
        { lat: 41.6000, lng: -73.6000, enr: `${DAY}T10:01:00Z`, arr: `${DAY}T10:12:00Z` });

      // A DEFECT: arrival before en route. Not a fast response — a bad record.
      await mkCall(MARK + '-R5', MARK + '-I5', A,
        { lat: 41.7000, lng: -73.7000, enr: `${DAY}T10:05:00Z`, arr: `${DAY}T10:02:00Z` });

      // Geocoded and linked, but nobody recorded an arrival.
      await mkCall(MARK + '-R6', MARK + '-I6', A,
        { lat: 41.8000, lng: -73.8000, enr: null, arr: null });

      // Linked to a call that carried NO coordinates.
      await pool.query(
        `INSERT INTO cad_alerts (alert_id,address,units,dispatched_at,station_id,department_id)
         VALUES ($1,'2 Main St','E1',$2::timestamptz,$3,$3)`, [MARK + '-R7', `${DAY}T11:00:00Z`, A]);
      const inc7 = (await pool.query(
        `INSERT INTO incidents ("incidentNumber",date,type,department_id,station_id)
         VALUES ($1,$2,'Structure Fire',$3,$3) RETURNING id`, [MARK + '-I7', DAY, A])).rows[0].id;
      await pool.query('UPDATE cad_alerts SET incident_id=$1 WHERE alert_id=$2', [inc7, MARK + '-R7']);

      // Not linked to any call at all.
      await pool.query(
        `INSERT INTO incidents ("incidentNumber",date,type,department_id,station_id)
         VALUES ($1,$2,'Structure Fire',$3,$3)`, [MARK + '-I8', DAY, A]);

      // Department B — must never appear in A's report.
      await mkCall(MARK + '-RB', MARK + '-IB', B,
        { lat: 41.5000, lng: -73.5000, enr: `${DAY}T10:01:00Z`, arr: `${DAY}T10:03:00Z` });

      const q = `from=${DAY}&to=${DAY}`;
      const r = await api(`/api/response-reports/coverage?${q}&min_n=3`, officer);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const d = r.body.data;

      // 1) It is labelled as MEASURED, in the payload — an exported or
      //    machine-read copy must carry its own definition, not rely on the UI.
      assert.strictEqual(d.measure, 'travel_first_arriving_unit');
      assert.match(d.measure_note, /not a modeled/i);

      // 2) The defect is DISCARDED, not counted as an 11-second-fast response.
      const cells = d.bins.map((b) => `${b.lat.toFixed(3)},${b.lng.toFixed(3)}`);
      assert.ok(!cells.includes('41.700,-73.700'),
        'an arrival before en route is a defective record, never a fast one');

      // 3) The THIN cell is present and FLAGGED — not silently dropped.
      const thin = d.bins.find((b) => Math.abs(b.lat - 41.6) < 0.01);
      assert.ok(thin, 'a single-incident cell must still appear — dropping it shrinks the district');
      assert.strictEqual(thin.n, 1);
      assert.strictEqual(thin.sufficient, false);

      // 4) The well-evidenced cell clears the threshold and its p90 is real.
      const solid = d.bins.find((b) => Math.abs(b.lat - 41.5) < 0.01);
      assert.ok(solid, 'the three-incident cell must be present');
      assert.strictEqual(solid.n, 3);
      assert.strictEqual(solid.sufficient, true);
      // travel times 120/180/240 → 90th percentile is 228s.
      assert.ok(solid.p90_travel_seconds >= 200 && solid.p90_travel_seconds <= 240,
        `p90 was ${solid.p90_travel_seconds}, expected ~228`);
      assert.strictEqual(d.bins_sufficient, 1);

      // 5) The three unmeasurable causes are attributed SEPARATELY. Summing
      //    them into one number would hide which one a chief can act on.
      assert.strictEqual(d.not_measurable.not_linked_to_a_call, 1);
      assert.strictEqual(d.not_measurable.linked_but_not_geocoded, 1);
      assert.strictEqual(d.not_measurable.no_arrival_recorded, 1);

      // 6) TENANCY. Department B ran an identical call at the same coordinates;
      //    A's cell must still have n=3, not n=4.
      assert.strictEqual(solid.n, 3, "another department's call must not land in this cell");

      // 7) The role gate holds.
      const asMember = await api(`/api/response-reports/coverage?${q}`, member);
      assert.strictEqual(asMember.status, 403);

      // 8) A station filter naming a station outside the department is REFUSED,
      //    not silently answered with an empty map.
      const foreign = await api(`/api/response-reports/coverage?${q}&station_id=${B}`, officer);
      assert.strictEqual(foreign.status, 404);
      assert.strictEqual(foreign.body.code, 'STATION_NOT_FOUND');
    } finally {
      await new Promise((r) => server.close(r));
      const { pool } = require('../db');
      await pool.query(`DELETE FROM unit_status_history WHERE designation LIKE $1`, [MARK + '%']);
      await pool.query(`DELETE FROM cad_alerts WHERE alert_id LIKE $1`, [MARK + '%']);
      await pool.query(`DELETE FROM incidents WHERE "incidentNumber" LIKE $1`, [MARK + '%']);
      await pool.query(`DELETE FROM apparatus WHERE designation LIKE $1`, [MARK + '%']);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`, [MARK + '%']);
      await pool.query(`DELETE FROM users WHERE username LIKE $1`, [MARK + '%']);
      await pool.query(`DELETE FROM stations WHERE name LIKE $1`, [MARK + '%']);
      await pool.query(`DELETE FROM departments WHERE name LIKE $1`, [MARK + '%']);
    }
  });
}
