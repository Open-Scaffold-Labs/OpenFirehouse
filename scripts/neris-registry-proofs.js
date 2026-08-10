#!/usr/bin/env node
'use strict';
/**
 * neris-registry-proofs.js — live proofs for the SR station/unit registrar
 * (2026-07-20). Same env contract as the other proof scripts (.env.neris.local).
 *
 * Through the REAL engine against the live test API:
 *   1. Register a station        → real 201, NERIS id persisted locally
 *   2. Re-run                    → already/adopted — NO duplicate created
 *   3. Register a unit under it  → real 201, id persisted
 *   4. Lost-ACK simulation       → wipe local id, re-run → ADOPTS the same
 *                                  national record by cad_designation
 *   5. Incident submission       → the payload carries unit_neris_id for the
 *                                  registered rig; live validate accepts it
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://matthewlavin@localhost:5432/freestation';

const db = require('../server/src/db');
const client = require('../server/src/utils/nerisClient');
const { registerStation, registerUnit, registeredUnitMap } = require('../server/src/utils/nerisRegistry');
const { buildNerisIncidentPayload } = require('../server/src/utils/nerisPayload');
const { NERIS_UNIT_TYPE_VALUES } = require('../server/src/constants/nerisUnitTypes');

const ENTITY = process.env.NERIS_ENTITY || 'FD51087867';
const RUN = `OF-SR-${Date.now()}`;
const DEPT = 1;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => console.error(`  ✗ ${m}`);

async function main() {
  console.log(`NERIS registry proofs — entity ${ENTITY}, base ${process.env.NERIS_API_BASE || client.NERIS_TEST_BASE}\nrun: ${RUN}\n`);
  if (!client.isConfigured()) { fail('creds missing'); process.exit(2); }
  const ids = { stations: [], rigs: [] };
  const evidence = { run: RUN };
  try {
    await db.pool.query('UPDATE departments SET neris_id=$1 WHERE id=$2', [ENTITY, DEPT]);
    // NERIS dedupes stations by station_id AND address (live-learned this run):
    // a unique street number per run avoids colliding with prior proof stations.
    const { rows: srows } = await db.pool.query(
      `INSERT INTO stations (name, address, city, state, zip, department_id)
       VALUES ($1,$2,'Glen Allen','VA',$3,$4) RETURNING id`,
      [`${RUN}-HOUSE`, `${String(Date.now()).slice(-5)} Registry Proof Way`,
       `230${String(10 + (Date.now() % 89))}`, DEPT]);
    const sid = srows[0].id; ids.stations.push(sid);
    const desig = `SR${String(Date.now()).slice(-6)}`;
    const { rows: arows } = await db.pool.query(
      `INSERT INTO apparatus (designation, type, year, neris_type, station_id, department_id)
       VALUES ($1,'Engine',2020,$2,$3,$4) RETURNING id`,
      [desig, NERIS_UNIT_TYPE_VALUES.includes('ENGINE') ? 'ENGINE' : NERIS_UNIT_TYPE_VALUES[0], sid, DEPT]);
    const rid = arows[0].id; ids.rigs.push(rid);

    console.log('Proof 1 — register station (real create)');
    const r1 = await registerStation(sid, DEPT);
    if (!r1.ok) { fail(JSON.stringify(r1)); process.exit(1); }
    const s1 = (await db.pool.query('SELECT neris_station_id FROM stations WHERE id=$1', [sid])).rows[0];
    ok(`station ${r1.adopted ? 'ADOPTED' : 'created'}: ${s1.neris_station_id} (persisted)`);
    evidence.station = { id: s1.neris_station_id, adopted: r1.adopted };

    console.log('Proof 2 — re-run is idempotent (no duplicate)');
    const r2 = await registerStation(sid, DEPT);
    if (!(r2.ok && r2.already)) { fail(JSON.stringify(r2)); process.exit(1); }
    ok('second run: already registered, no network create');

    console.log('Proof 3 — register unit under the house (real create)');
    const r3 = await registerUnit(rid, DEPT, { staffing: 4 });
    if (!r3.ok) { fail(JSON.stringify(r3)); process.exit(1); }
    const a1 = (await db.pool.query('SELECT neris_unit_id FROM apparatus WHERE id=$1', [rid])).rows[0];
    ok(`unit ${r3.adopted ? 'ADOPTED' : 'created'}: ${a1.neris_unit_id} (persisted)`);
    evidence.unit = { id: a1.neris_unit_id, adopted: r3.adopted };

    console.log('Proof 4 — lost-ACK: wipe local id → re-run ADOPTS the same national record');
    await db.pool.query('UPDATE apparatus SET neris_unit_id=NULL WHERE id=$1', [rid]);
    const r4 = await registerUnit(rid, DEPT, { staffing: 4 });
    if (!(r4.ok && r4.adopted && r4.neris_unit_id === a1.neris_unit_id)) { fail(JSON.stringify(r4)); process.exit(1); }
    ok(`re-adopted the SAME id ${r4.neris_unit_id} — no duplicate national unit`);

    console.log('Proof 5 — incident payload carries unit_neris_id; live validate accepts');
    const map = await registeredUnitMap(DEPT);
    const now = new Date();
    const { payload, validation } = buildNerisIncidentPayload({
      incident: {
        incidentNumber: `${RUN}-INC`,
        // LOCAL date (not the UTC slice — past midnight UTC that builds a
        // future local timestamp and NERIS refuses future times)
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        address: '123 Main St, Glen Allen, VA 23060', units: JSON.stringify([desig]),
        notes: `SR proof ${RUN}. Synthetic.`,
        neris_incident_types: [{ value: 'NOEMERG||CANCELLED', primary: true }],
        neris_noaction: 'CANCELLED',
        neris_dispatch_times: {
          call_arrival: new Date(now.getTime() - 8 * 60000).toISOString(),
          call_answered: new Date(now.getTime() - 7 * 60000).toISOString(),
        },
      },
      nfirsReport: {}, department: { id: 0, name: 'OSL Test FD', fdid: ENTITY },
      options: { departmentNerisId: ENTITY, registeredUnits: map },
    });
    const linked = payload.unit_responses.find((r) => r.reported_unit_id === desig);
    if (!linked || linked.unit_neris_id !== a1.neris_unit_id) { fail(`linkage missing: ${JSON.stringify(linked)}`); process.exit(1); }
    if (!validation.valid) { fail(`local validation: ${validation.errors.join('; ')}`); process.exit(1); }
    const v = await client.validateIncident(ENTITY, payload);
    ok(`unit_neris_id ${linked.unit_neris_id} attached; live validate → HTTP ${v.status}`);
    evidence.linkage = { unit_neris_id: linked.unit_neris_id, validate: v.status };

    console.log('Proof 6 — edit + "Update in NERIS" → real PATCH lands');
    const { pushUnitUpdate } = require('../server/src/utils/nerisRegistry');
    const r6 = await pushUnitUpdate(rid, DEPT, { staffing: 5 });
    if (!r6.ok) { fail(JSON.stringify(r6)); process.exit(1); }
    ok(`unit update PATCHed → HTTP ${r6.http} (staffing 4 → 5 on ${r6.neris_unit_id})`);
    evidence.update = { http: r6.http };

    console.log('\nALL REGISTRY PROOFS PASSED');
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    if (ids.rigs.length) await db.pool.query('DELETE FROM apparatus WHERE id = ANY($1)', [ids.rigs]);
    if (ids.stations.length) await db.pool.query('DELETE FROM stations WHERE id = ANY($1)', [ids.stations]);
    await db.pool.query(`UPDATE departments SET neris_id='' WHERE id=$1`, [DEPT]);
    await db.pool.end().catch(() => {});
  }
  process.exit(0);
}

main().catch(async (err) => {
  fail(`unexpected: ${err && err.message ? err.message : err}`);
  try { await db.pool.end(); } catch { /* noop */ }
  process.exit(2);
});
