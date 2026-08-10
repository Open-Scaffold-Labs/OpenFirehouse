'use strict';
/**
 * 4.1g — NFPA 1710 compliance reporting, over real HTTP.
 *
 * These numbers go into a document a chief hands to their AHJ, so the
 * assertions that matter are the ones about honesty: an uncaptured segment must
 * say so rather than read as zero, an out-of-order timestamp must be a counted
 * defect rather than a plausible number, and the objectives we cannot compute
 * must be NAMED rather than quietly absent.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[4.1g] TENANCY_TEST_DB not set — skipping.');
  test('response compliance report', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('4.1g — compliance: real percentiles, honest gaps, defects counted, dept-scoped', async () => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const t = realSetInterval(...a); if (t && t.unref) t.unref(); return t; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }

    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const MARK = 'P4-RPT';
    const DAY = '2026-06-15';

    async function api(path, token) {
      const res = await fetch(baseUrl + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, json };
    }
    async function cleanup() {
      try {
        await pool.query(`DELETE FROM unit_status_history WHERE designation LIKE '${MARK}%'`);
        await pool.query(`DELETE FROM cad_alerts WHERE alert_id LIKE '${MARK}%'`);
        await pool.query(`DELETE FROM incidents WHERE "incidentNumber" LIKE '${MARK}%'`);
        await pool.query(`DELETE FROM apparatus WHERE designation LIKE '${MARK}%'`);
        await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}-HOUSE%' OR name LIKE '${MARK}-FOREIGN%'`);
        await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${MARK}%')`);
        await pool.query(`DELETE FROM users WHERE username LIKE '${MARK}%'`);
      } catch (_) { /* best effort */ }
    }

    try {
      await cleanup();
      const A = await mkAlignedDeptStation(pool, MARK + '-A');
      const B = await mkAlignedDeptStation(pool, MARK + '-B');

      async function mkUser(uname, role, dept) {
        const uid = (await pool.query(
          `INSERT INTO users (username,name,initials,role,"passwordHash",station_id)
           VALUES ($1,$2,'XX',$3,'x',$4) RETURNING id`, [uname, uname, role, dept])).rows[0].id;
        await pool.query('INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [uid, dept, role]);
        return jwt.sign({ sub: uid, username: uname, role }, ACCESS_SECRET, { expiresIn: '15m' });
      }
      const officer = await mkUser(MARK + '-off', 'officer', A);
      const member = await mkUser(MARK + '-mem', 'member', A);
      const officerB = await mkUser(MARK + '-offB', 'officer', B);

      // An Engine, so objective (3) has something to key on.
      const engId = (await pool.query(
        `INSERT INTO apparatus (designation,type,year,station_id,department_id)
         VALUES ($1,'Engine',2020,$2,$2) RETURNING id`, [MARK + '-E1', A])).rows[0].id;

      // Build a call: dispatch 10:00:00, enroute 10:01:00 (turnout 60s),
      // on scene 10:04:00 (travel 180s, total 240s).
      async function mkCall(run, incNum, type, dispIso, enrIso, arrIso, dept, apparatusId) {
        await pool.query(
          `INSERT INTO cad_alerts (alert_id,address,units,dispatched_at,station_id,department_id)
           VALUES ($1,'1 Main St','E1',$2::timestamptz,$3,$3)`, [run, dispIso, dept]);
        const inc = (await pool.query(
          `INSERT INTO incidents ("incidentNumber",date,type,department_id,station_id,cad_run_number)
           VALUES ($1,$2,$3,$4,$4,$5) RETURNING id`, [incNum, DAY, type, dept, run])).rows[0].id;
        await pool.query(`UPDATE cad_alerts SET incident_id=$1 WHERE alert_id=$2`, [inc, run]);
        for (const [st, ts] of [['dispatched', dispIso], ['enroute', enrIso], ['on_scene', arrIso]]) {
          await pool.query(
            `INSERT INTO unit_status_history (station_id,apparatus_id,designation,status,changed_at,incident_id,department_id)
             VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$1)`,
            [dept, apparatusId, MARK + '-E1', st, ts, inc]);
        }
        return inc;
      }

      await mkCall(MARK + '-R1', MARK + '-I1', 'Structure Fire',
        `${DAY}T10:00:00Z`, `${DAY}T10:01:00Z`, `${DAY}T10:04:00Z`, A, engId);

      // 1) MOUNTED + REACHABLE with real numbers.
      const r = await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}`, officer);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const d = r.json.data;

      const turnout = d.segments.find((s) => s.key === 'turnout');
      const travel = d.segments.find((s) => s.key === 'travel');
      const total = d.segments.find((s) => s.key === 'total_response');
      assert.equal(turnout.n, 1);
      assert.equal(turnout.p90_seconds, 60, 'turnout = dispatched -> enroute');
      assert.equal(travel.p90_seconds, 180, 'travel = enroute -> on scene');
      assert.equal(total.p90_seconds, 240, 'total = call dispatch -> first arrival');

      // 2) TOTAL RESPONSE DECLARES ITS ANCHOR. NFPA's total starts at PSAP
      //    receipt; we have no PSAP timestamp, so claiming that anchor would be
      //    a false claim in a document an AHJ reads.
      assert.equal(total.anchor, 'dispatch');
      assert.match(total.anchor_note, /not PSAP/i);

      // 3) ★ ALARM HANDLING IS not_captured, NOT ZERO. Those are different facts
      //    and a zero would read as perfect performance.
      const alarm = d.segments.find((s) => s.key === 'alarm_handling');
      assert.equal(alarm.state, 'not_captured');
      assert.equal(alarm.p90_seconds, null, 'an uncaptured segment must be null, never 0');
      assert.ok(alarm.not_captured_reason);

      // 4) THE OBJECTIVE IS EVALUATED against the standard's target.
      const tf = d.objectives.find((o) => o.key === 'turnout_fire');
      assert.equal(tf.target_seconds, 80, '§4.1.2.1(2) fire turnout');
      assert.equal(tf.fraction_meeting, 1, '60s meets an 80s target');
      assert.equal(tf.meets_objective, true);
      assert.equal(tf.target_is_department_override, false);
      const eng = d.objectives.find((o) => o.key === 'travel_first_engine');
      assert.equal(eng.target_seconds, 240, '§4.1.2.1(3) first engine travel');

      // 5) ★ WHAT WE CANNOT COMPUTE IS NAMED, not silently absent — a shorter
      //    list would read as complete.
      const notKeys = d.not_computed.map((x) => x.key);
      for (const k of ['travel_second_company', 'travel_ems_first_responder', 'travel_ems_als', 'alarm_handling']) {
        assert.ok(notKeys.includes(k), `${k} must be NAMED as not computed`);
      }
      for (const x of d.not_computed) assert.ok(x.reason, 'each must say WHY');

      // 6) ★ AN OUT-OF-ORDER TIMESTAMP IS A DEFECT, not a 24h wrap. The old
      //    responseAnalytics route did `1440 - alarm + arrival`, turning any
      //    negative interval into a plausible positive number.
      await mkCall(MARK + '-R2', MARK + '-I2', 'Structure Fire',
        `${DAY}T12:00:00Z`, `${DAY}T11:58:00Z`, `${DAY}T12:05:00Z`, A, engId);
      const r2 = await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}`, officer);
      const t2 = r2.json.data.segments.find((s) => s.key === 'turnout');
      assert.equal(t2.defects, 1, 'the negative turnout must be COUNTED as a defect');
      assert.equal(t2.n, 1, 'and EXCLUDED from the percentile, not wrapped into ~24h');
      assert.equal(t2.p90_seconds, 60, 'the good value is unaffected');

      // 7) A DEPARTMENT OVERRIDE (0101) beats the standard's default.
      await pool.query(
        `INSERT INTO response_benchmarks (department_id,objective_key,target_seconds,target_fraction)
         VALUES ($1,'turnout_fire',45,0.90)`, [A]);
      const r3 = await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}`, officer);
      const tf3 = r3.json.data.objectives.find((o) => o.key === 'turnout_fire');
      assert.equal(tf3.target_seconds, 45, 'the adopted target overrides the NFPA default');
      assert.equal(tf3.target_is_department_override, true);
      assert.equal(tf3.meets_objective, false, '60s does NOT meet a 45s target');

      // 8) CROSS-TENANT — a COUNT is still data.
      const rb = await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}`, officerB);
      assert.equal(rb.status, 200);
      assert.equal(rb.json.data.segments.find((s) => s.key === 'turnout').n, 0,
        "dept B must not see dept A's incidents");

      // 9) ROLE GATE + 10) zod.
      assert.equal((await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}`, member)).status, 403);
      assert.equal((await api(`/api/response-reports/compliance?from=nope&to=${DAY}`, officer)).status, 400);
      assert.equal((await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}`)).status, 401);

      // 12) ★ PER-STATION SPLIT. NFPA §4.1.2.5.2 evaluates "in each geographic
      //     area" and §4.1.2.6.1 requires the annual report to NAME the areas not
      //     meeting objectives — a department-wide number hides the one house
      //     that is failing behind the ones that are not. A single-station
      //     fixture cannot prove this, so build a SECOND house.
      const house2 = (await pool.query(
        `INSERT INTO stations (name, department_id) VALUES ($1,$2) RETURNING id`,
        [MARK + '-HOUSE2', A])).rows[0].id;
      const eng2 = (await pool.query(
        `INSERT INTO apparatus (designation,type,year,station_id,department_id)
         VALUES ($1,'Engine',2021,$2,$3) RETURNING id`, [MARK + '-E2', house2, A])).rows[0].id;
      // House 2 is SLOWER: turnout 120s (fails the 80s objective).
      await pool.query(
        `INSERT INTO cad_alerts (alert_id,address,units,dispatched_at,station_id,department_id)
         VALUES ($1,'9 Far Rd','E2',$2::timestamptz,$3,$4)`,
        [MARK + '-R3', `${DAY}T14:00:00Z`, house2, A]);
      const inc3 = (await pool.query(
        `INSERT INTO incidents ("incidentNumber",date,type,department_id,station_id,cad_run_number)
         VALUES ($1,$2,'Structure Fire',$3,$4,$5) RETURNING id`,
        [MARK + '-I3', DAY, A, house2, MARK + '-R3'])).rows[0].id;
      await pool.query(`UPDATE cad_alerts SET incident_id=$1 WHERE alert_id=$2`, [inc3, MARK + '-R3']);
      for (const [st, ts] of [['dispatched', `${DAY}T14:00:00Z`], ['enroute', `${DAY}T14:02:00Z`], ['on_scene', `${DAY}T14:06:00Z`]]) {
        await pool.query(
          `INSERT INTO unit_status_history (station_id,apparatus_id,designation,status,changed_at,incident_id,department_id)
           VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7)`,
          [house2, eng2, MARK + '-E2', st, ts, inc3, A]);
      }

      const r4 = await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}`, officer);
      const stations = r4.json.data.by_station;
      assert.ok(stations.length >= 2, 'both houses must appear separately');
      const h2 = stations.find((s) => s.station_id === house2);
      assert.ok(h2, 'the second house must be in the split');
      assert.equal(h2.turnout.p90_seconds, 120, "house 2's own turnout, not the department average");
      assert.equal(h2.station_name, MARK + '-HOUSE2', 'the house is NAMED — §4.1.2.6.1 requires naming');

      // The slow house must NOT be averaged away into a passing number.
      const deptWide = r4.json.data.segments.find((s) => s.key === 'turnout');
      assert.ok(deptWide.p90_seconds > 60,
        'the department-wide p90 is pulled up by house 2 — which is exactly why the split exists');

      // 13) station_id FILTERS to one house.
      const only2 = await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}&station_id=${house2}`, officer);
      assert.equal(only2.json.data.station_filter, house2);
      assert.equal(only2.json.data.by_station.length, 1, 'filtering to one house returns one group');
      assert.equal(only2.json.data.by_station[0].station_id, house2);
      assert.equal(only2.json.data.segments.find((s) => s.key === 'turnout').p90_seconds, 120);

      // 14) A bogus station_id is refused by zod, not silently ignored.
      assert.equal((await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}&station_id=abc`, officer)).status, 400);

      // 15) ★ A station belonging to ANOTHER DEPARTMENT is REFUSED, not quietly
      //     emptied. An empty report reads as "no incidents that period", which
      //     is a different and much worse answer than "that is not your
      //     station". The tenancy guard forced this: a client-supplied
      //     station_id is only allowed when it is validated against the caller's
      //     own department first.
      const foreign = (await pool.query(
        `INSERT INTO stations (name, department_id) VALUES ($1,$2) RETURNING id`,
        [MARK + '-FOREIGN', B])).rows[0].id;
      const stolen = await api(
        `/api/response-reports/compliance?from=${DAY}&to=${DAY}&station_id=${foreign}`, officer);
      assert.equal(stolen.status, 404, "another department's station must be REFUSED");
      assert.equal(stolen.json.code, 'STATION_NOT_FOUND');

      // ...and a station that does not exist at all gets the same answer.
      const ghost = await api(
        `/api/response-reports/compliance?from=${DAY}&to=${DAY}&station_id=99999999`, officer);
      assert.equal(ghost.status, 404);

      // 16) ★ HEAT MAP. Incidents carry NO coordinates — the only geocoded thing
      //     in OF is cad_alerts.latitude/longitude, so an incident is on the map
      //     only via its call. Two calls in one ~200m cell must BIN together,
      //     and an incident with no location must be COUNTED, not dropped: ten
      //     dots would otherwise read as the department's whole call volume.
      await pool.query(
        `UPDATE cad_alerts SET latitude=40.7128, longitude=-74.0060 WHERE alert_id=$1`, [MARK + '-R1']);
      await pool.query(
        `UPDATE cad_alerts SET latitude=40.7129, longitude=-74.0061 WHERE alert_id=$1`, [MARK + '-R2']);
      // -R3 (house 2) deliberately keeps NO coordinates.

      const hm = await api(`/api/response-reports/heatmap?from=${DAY}&to=${DAY}`, officer);
      assert.equal(hm.status, 200, JSON.stringify(hm.json));
      const h = hm.json.data;
      assert.equal(h.cells.length, 1, 'two calls 15m apart must land in ONE ~200m cell');
      assert.equal(h.cells[0].count, 2);
      assert.equal(h.incidents_plotted, 2);
      assert.equal(h.incidents_without_location, 1, 'the un-geocoded incident must be COUNTED');
      assert.ok(h.no_location_reason, 'and the reason stated');
      assert.ok(Number.isFinite(h.cells[0].lat) && Number.isFinite(h.cells[0].lng),
        'cells carry real numbers — pg returns NUMERIC as strings and they must be coerced');

      // 17) Heat map honours the station filter and the tenancy refusal.
      const hmB = await api(`/api/response-reports/heatmap?from=${DAY}&to=${DAY}`, officerB);
      assert.equal(hmB.json.data.cells.length, 0, "dept B sees none of dept A's incidents");
      assert.equal(
        (await api(`/api/response-reports/heatmap?from=${DAY}&to=${DAY}&station_id=${foreign}`, officer)).status,
        404, "another department's station is refused on the map route too");
      assert.equal((await api(`/api/response-reports/heatmap?from=${DAY}&to=${DAY}`, member)).status, 403);

      // 18) ★ CSV EXPORT. ~8 of 9 surveyed platforms ship it. The file must come
      //     from the SAME computation as the screen — a second query is how a
      //     downloaded report starts disagreeing with the page it came from, and
      //     nobody notices until someone at the AHJ compares them.
      const csvRes = await fetch(
        `${baseUrl}/api/response-reports/compliance.csv?from=${DAY}&to=${DAY}`,
        { headers: { Authorization: `Bearer ${officer}` } });
      assert.equal(csvRes.status, 200);
      assert.match(csvRes.headers.get('content-type') || '', /text\/csv/);
      assert.match(csvRes.headers.get('content-disposition') || '', /attachment; filename=/);
      const csv = await csvRes.text();

      // The numbers in the file must MATCH the numbers on the screen.
      const onScreen = (await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}`, officer)).json.data;
      const screenTurnout = onScreen.segments.find((s) => s.key === 'turnout').p90_seconds;
      const mmss = `${Math.floor(screenTurnout / 60)}:${String(Math.round(screenTurnout) % 60).padStart(2, '0')}`;
      assert.ok(csv.includes(mmss), `the CSV must carry the same turnout the page shows (${mmss})`);

      // An uncaptured segment must say so IN THE FILE — a blank cell in a
      // spreadsheet reads as zero, and the file outlives the page that explained it.
      assert.match(csv, /not captured/i, 'alarm handling must be marked not captured in the file');
      // The file carries its own provenance: standard, percentile, and what was
      // NOT measured. A bare table of times is read years later as complete.
      assert.ok(csv.includes('NFPA 1710'), 'the file states its standard');
      assert.ok(csv.includes('90th'), 'the file states its percentile');
      assert.match(csv, /Not measured/, 'the file names what it could not measure');

      // Same gates as the JSON route — an export is not a back door.
      assert.equal((await fetch(`${baseUrl}/api/response-reports/compliance.csv?from=${DAY}&to=${DAY}`,
        { headers: { Authorization: `Bearer ${member}` } })).status, 403);
      assert.equal((await fetch(`${baseUrl}/api/response-reports/compliance.csv?from=${DAY}&to=${DAY}`)).status, 401);
      assert.equal((await fetch(
        `${baseUrl}/api/response-reports/compliance.csv?from=${DAY}&to=${DAY}&station_id=${foreign}`,
        { headers: { Authorization: `Bearer ${officer}` } })).status, 404);

      // 19) ★ THE BENCHMARK WRITE PATH. 0101 created the table and the report
      //     read it, but there was NO WRITE PATH AT ALL — the table could only be
      //     filled by direct SQL. A migration shipped for a feature nobody could
      //     use is exactly the defect I used to argue against building 0102.
      const chiefTok = await mkUser(MARK + '-chief', 'chief', A);

      const bmList = await api('/api/response-reports/benchmarks', officer);
      assert.equal(bmList.status, 200);
      const tfRow = bmList.json.data.find((b) => b.objective_key === 'turnout_fire');
      assert.equal(tfRow.standard_seconds, 80, "the STANDARD's number is always exposed");
      // It was adopted at 45s earlier in this test (case 7).
      assert.equal(tfRow.is_adopted, true);
      assert.equal(tfRow.adopted_seconds, 45);

      // WRITE is chief-only — an officer may read the targets, not set them.
      const officerWrite = await fetch(`${baseUrl}/api/response-reports/benchmarks/turnout_fire`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${officer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_seconds: 30 }),
      });
      assert.equal(officerWrite.status, 403, 'an adopted target needs an attributable chief');

      // A chief CAN adopt, and it takes effect on the report immediately.
      const put = await fetch(`${baseUrl}/api/response-reports/benchmarks/turnout_fire`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${chiefTok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_seconds: 90, rationale: 'adopted after 2026 CRA' }),
      });
      assert.equal(put.status, 200, await put.text());
      const after = await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}`, officer);
      const tfAfter = after.json.data.objectives.find((o) => o.key === 'turnout_fire');
      assert.equal(tfAfter.target_seconds, 90, 'the report measures against the adopted target');
      // By now the fixture holds TWO fire incidents — 60s (house 1) and 120s
      // (house 2). At a 90s target exactly one of two meets, so the 90% rule is
      // correctly NOT satisfied. What matters is that adopting a target CHANGED
      // the evaluation: at 45s neither met, at 90s one does.
      assert.equal(tfAfter.fraction_meeting, 0.5, 'one of two fire turnouts meets a 90s target');
      assert.equal(tfAfter.meets_objective, false, '50% is below the §4.1.2.4 90% rule');

      // ★ An UNKNOWN objective key is REFUSED, not stored blind. A row matching
      //   no objective would sit there forever doing nothing, which reads to a
      //   chief as "I set my target and it was ignored".
      const bogus = await fetch(`${baseUrl}/api/response-reports/benchmarks/not_a_real_objective`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${chiefTok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_seconds: 60 }),
      });
      assert.equal(bogus.status, 404);
      assert.equal((await bogus.json()).code, 'UNKNOWN_OBJECTIVE');

      // An empty body is refused rather than storing a target of nothing.
      const empty = await fetch(`${baseUrl}/api/response-reports/benchmarks/turnout_fire`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${chiefTok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(empty.status, 422);

      // REVERT deletes the row rather than writing the standard back — absence
      // means "use the standard", so a future NFPA correction reaches them.
      const del = await fetch(`${baseUrl}/api/response-reports/benchmarks/turnout_fire`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${chiefTok}` } });
      assert.equal(del.status, 200);
      const reverted = await api('/api/response-reports/benchmarks', officer);
      const tfRev = reverted.json.data.find((b) => b.objective_key === 'turnout_fire');
      assert.equal(tfRev.is_adopted, false, 'reverting must DELETE, not store a copy of the standard');
      assert.equal(tfRev.adopted_seconds, null);
      const back = await api(`/api/response-reports/compliance?from=${DAY}&to=${DAY}`, officer);
      assert.equal(back.json.data.objectives.find((o) => o.key === 'turnout_fire').target_seconds, 80,
        'the report is back on the standard');

      // 20) ★ INCIDENT ACTIVITY — the two most-named analytical reports in
      //     competitor libraries. OF already exported 14 record types, but those
      //     are ROW DUMPS; these are answers.
      const act = await api(`/api/response-reports/incident-activity?from=${DAY}&to=${DAY}`, officer);
      assert.equal(act.status, 200, JSON.stringify(act.json));
      const a2 = act.json.data;

      // Every incident counts toward the type breakdown.
      const fireRow = a2.by_type.find((x) => x.type === 'Structure Fire');
      assert.ok(fireRow && fireRow.count >= 3, 'structure fires are counted by type');
      assert.equal(a2.total_incidents, a2.by_type.reduce((s, x) => s + x.count, 0),
        'the type breakdown must account for EVERY incident, with no silent remainder');

      // A rig that changed status three times on one call is ONE call, not three.
      const e1 = a2.by_apparatus.find((x) => x.designation === MARK + '-E1');
      assert.ok(e1, 'the engine appears in apparatus activity');
      assert.ok(e1.calls <= a2.total_incidents,
        'apparatus counts DISTINCT incidents — a rig with 3 status rows on one call is 1 call');

      // ★ DIFFERENT DENOMINATORS, said out loud. Every incident has a type; only
      //   attributed incidents can be counted per rig. One shared total would lie.
      assert.ok(a2.apparatus_basis.incidents_with_unit_data <= a2.total_incidents);
      assert.ok(a2.apparatus_basis.note, 'the differing basis must be stated, not implied');

      // Same fences as every other report route.
      assert.equal((await api(`/api/response-reports/incident-activity?from=${DAY}&to=${DAY}`, member)).status, 403);
      assert.equal(
        (await api(`/api/response-reports/incident-activity?from=${DAY}&to=${DAY}&station_id=${foreign}`, officer)).status,
        404);
      const actB = await api(`/api/response-reports/incident-activity?from=${DAY}&to=${DAY}`, officerB);
      assert.equal(actB.json.data.total_incidents, 0, "dept B sees none of dept A's incidents");

      // 11) The edition is DATA in the response, not a hardcoded header string.
      assert.equal(r.json.data.edition.standard, 'NFPA 1710');
      assert.match(r.json.data.edition.successor, /1750/);
      assert.equal(r.json.data.percentile, 0.90);
    } finally {
      await cleanup();
      await new Promise((r) => server.close(r));
      try { await pool.end(); } catch { /* already closed */ }
    }
  });
}
