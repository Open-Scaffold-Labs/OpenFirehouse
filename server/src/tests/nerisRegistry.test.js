'use strict';
/**
 * tests/nerisRegistry.test.js — the SR station/unit registrar.
 *
 * Pins the doctrine branches with an INJECTED fake client: reconcile-before-
 * create (adoption by internal_id / station_id / cad_designation — the
 * mechanical fix for the market's documented duplicate-ids failure), the
 * nothing-guessed refusals (type/staffing/station prerequisites), the
 * refused-vs-unavailable taxonomy, and that the NERIS-issued ids PERSIST
 * (a returned id is not a stored id — read back). DB-gated like the peers.
 */
const test = require('node:test');
const assert = require('node:assert');

if (process.env.TENANCY_TEST_DB) process.env.DATABASE_URL = process.env.TENANCY_TEST_DB;

const { stationPayloadFor, CAD_DESIGNATION_RE } = require('../utils/nerisRegistry');
const { NERIS_UNIT_TYPE_VALUES } = require('../constants/nerisUnitTypes');

test('stationPayloadFor: maps our columns to the spec fields + our deterministic internal_id', () => {
  const p = stationPayloadFor({ id: 7, name: 'Station 14', address: '1400 Elm St', city: 'Maplewood', state: 'PA', zip: '17001' });
  assert.deepEqual(p, {
    address_line_1: '1400 Elm St', city: 'Maplewood', state: 'PA', zip_code: '17001',
    station_id: 'Station 14', internal_id: '7',
  });
});

test('CAD designation pattern: spec-verbatim accepts/rejects', () => {
  for (const good of ['E1', 'TL-1', 'SQUAD (2)', 'BC#1', 'Engine 84']) assert.ok(CAD_DESIGNATION_RE.test(good), good);
  for (const bad of ['', 'E1!', 'x'.repeat(65), 'Engine/84']) assert.ok(!CAD_DESIGNATION_RE.test(bad), bad);
});

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('nerisRegistry engine (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  const db = require('../db');
  const { registerStation, registerUnit, registeredUnitMap } = require('../utils/nerisRegistry');
  const DEPT = 1;
  const ENTITY = 'FD51087867';
  const GOOD_TYPE = NERIS_UNIT_TYPE_VALUES[0];

  async function deptNeris(nerisId) {
    await db.pool.query('UPDATE departments SET neris_id = $1 WHERE id = $2', [nerisId, DEPT]);
  }
  async function mkStation(extra = {}) {
    const { rows } = await db.pool.query(
      `INSERT INTO stations (name, address, city, state, zip, department_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [extra.name || `SR Test House ${Date.now()}`, extra.address ?? '1 Test Way', extra.city ?? 'Glen Allen',
       extra.state ?? 'VA', extra.zip ?? '23060', DEPT]);
    return rows[0].id;
  }
  async function mkRig(stationId, extra = {}) {
    const { rows } = await db.pool.query(
      `INSERT INTO apparatus (designation, type, year, neris_type, station_id, department_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [extra.designation || `SR-E${Date.now() % 100000}`, 'Engine', 2020,
       extra.neris_type === undefined ? GOOD_TYPE : extra.neris_type, stationId, DEPT]);
    return rows[0].id;
  }
  async function cleanup(ids) {
    if (ids.rigs?.length) await db.pool.query('DELETE FROM apparatus WHERE id = ANY($1)', [ids.rigs]);
    if (ids.stations?.length) await db.pool.query('DELETE FROM stations WHERE id = ANY($1)', [ids.stations]);
    await deptNeris('');
  }

  const fake = (over = {}) => ({
    isConfigured: () => true,
    getEntity: async () => ({ status: 200, data: { stations: [] } }),
    createStation: async () => ({ status: 201, data: { neris_id: `${ENTITY}S900` } }),
    createUnit: async () => ({ status: 201, data: { neris_id: `${ENTITY}S900U900` } }),
    ...over,
  });

  test('registerStation: happy create → id PERSISTED on the row', async () => {
    const ids = { stations: [] };
    try {
      await deptNeris(ENTITY);
      const sid = await mkStation(); ids.stations.push(sid);
      const r = await registerStation(sid, DEPT, { client: fake() });
      assert.deepEqual({ ok: r.ok, adopted: r.adopted }, { ok: true, adopted: false });
      const { rows } = await db.pool.query('SELECT neris_station_id FROM stations WHERE id=$1', [sid]);
      assert.equal(rows[0].neris_station_id, `${ENTITY}S900`);
    } finally { await cleanup(ids); }
  });

  test('registerStation: ADOPTS an existing NERIS station by our internal_id — never re-creates', async () => {
    const ids = { stations: [] };
    try {
      await deptNeris(ENTITY);
      const sid = await mkStation(); ids.stations.push(sid);
      let created = 0;
      const r = await registerStation(sid, DEPT, { client: fake({
        getEntity: async () => ({ status: 200, data: { stations: [
          { neris_id: `${ENTITY}S123`, station_id: 'whatever', internal_id: String(sid), units: [] },
        ] } }),
        createStation: async () => { created += 1; return { status: 201, data: { neris_id: 'DUP' } }; },
      }) });
      assert.equal(created, 0, 'no create after adoption');
      assert.deepEqual({ ok: r.ok, adopted: r.adopted, id: r.neris_station_id },
        { ok: true, adopted: true, id: `${ENTITY}S123` });
    } finally { await cleanup(ids); }
  });

  test('registerStation: missing address fields refuse LOCALLY with the field list', async () => {
    const ids = { stations: [] };
    try {
      await deptNeris(ENTITY);
      const sid = await mkStation({ address: '', zip: '' }); ids.stations.push(sid);
      let touched = 0;
      const r = await registerStation(sid, DEPT, { client: fake({ getEntity: async () => { touched += 1; return { status: 200, data: { stations: [] } }; } }) });
      assert.equal(touched, 0, 'never reaches the network');
      assert.equal(r.needs, 'fields');
      assert.deepEqual(r.missing.sort(), ['address_line_1', 'zip_code']);
    } finally { await cleanup(ids); }
  });

  test('registerUnit: the nothing-guessed gates — type, staffing, station-first', async () => {
    const ids = { stations: [], rigs: [] };
    try {
      await deptNeris(ENTITY);
      const sid = await mkStation(); ids.stations.push(sid);
      const noType = await mkRig(sid, { neris_type: null }); ids.rigs.push(noType);
      assert.equal((await registerUnit(noType, DEPT, { staffing: 4 }, { client: fake() })).needs, 'type');
      const rig = await mkRig(sid); ids.rigs.push(rig);
      assert.equal((await registerUnit(rig, DEPT, {}, { client: fake() })).needs, 'staffing');
      assert.equal((await registerUnit(rig, DEPT, { staffing: 2.5 }, { client: fake() })).needs, 'staffing');
      // house not registered yet → station-first
      assert.equal((await registerUnit(rig, DEPT, { staffing: 4 }, { client: fake() })).needs, 'station');
    } finally { await cleanup(ids); }
  });

  test('registerUnit: happy create under the registered house → id persisted; then ADOPTS on re-run', async () => {
    const ids = { stations: [], rigs: [] };
    try {
      await deptNeris(ENTITY);
      const sid = await mkStation(); ids.stations.push(sid);
      await db.pool.query('UPDATE stations SET neris_station_id=$1 WHERE id=$2', [`${ENTITY}S900`, sid]);
      const rig = await mkRig(sid, { designation: `SR-U${Date.now() % 100000}` }); ids.rigs.push(rig);
      const r1 = await registerUnit(rig, DEPT, { staffing: 4, dedicated_staffing: true }, { client: fake() });
      assert.deepEqual({ ok: r1.ok, adopted: r1.adopted }, { ok: true, adopted: false });
      const { rows } = await db.pool.query('SELECT neris_unit_id, designation FROM apparatus WHERE id=$1', [rig]);
      assert.equal(rows[0].neris_unit_id, `${ENTITY}S900U900`);
      // wipe the local id (simulated lost ACK) → re-run must ADOPT by cad_designation
      await db.pool.query('UPDATE apparatus SET neris_unit_id=NULL WHERE id=$1', [rig]);
      let created = 0;
      const r2 = await registerUnit(rig, DEPT, { staffing: 4 }, { client: fake({
        getEntity: async () => ({ status: 200, data: { stations: [
          { neris_id: `${ENTITY}S900`, internal_id: String(sid), station_id: 'x',
            units: [{ neris_id: `${ENTITY}S900U777`, cad_designation_1: rows[0].designation }] },
        ] } }),
        createUnit: async () => { created += 1; return { status: 201, data: { neris_id: 'DUP' } }; },
      }) });
      assert.equal(created, 0, 'no second create — adopted');
      assert.deepEqual({ ok: r2.ok, adopted: r2.adopted, id: r2.neris_unit_id },
        { ok: true, adopted: true, id: `${ENTITY}S900U777` });
    } finally { await cleanup(ids); }
  });

  test('taxonomy: refused vs unavailable both surface without throwing', async () => {
    const ids = { stations: [] };
    try {
      await deptNeris(ENTITY);
      const sid = await mkStation(); ids.stations.push(sid);
      const refused = await registerStation(sid, DEPT, { client: fake({
        createStation: async () => { throw { name: 'NerisRefusedError', status: 422, detail: 'bad zip' }; } }) });
      assert.deepEqual({ ok: refused.ok, refused: refused.refused }, { ok: false, refused: true });
      const down = await registerStation(sid, DEPT, { client: fake({
        getEntity: async () => { throw { name: 'NerisUnavailableError', reason: 'timeout' }; } }) });
      assert.deepEqual({ ok: down.ok, refused: down.refused }, { ok: false, refused: false });
    } finally { await cleanup(ids); }
  });

  test('registeredUnitMap: exact designations of registered rigs only', async () => {
    const ids = { stations: [], rigs: [] };
    try {
      const sid = await mkStation(); ids.stations.push(sid);
      const reg = await mkRig(sid, { designation: `SR-MAP-${Date.now() % 100000}` }); ids.rigs.push(reg);
      const unreg = await mkRig(sid, { designation: `SR-NOPE-${Date.now() % 100000}` }); ids.rigs.push(unreg);
      await db.pool.query('UPDATE apparatus SET neris_unit_id=$1 WHERE id=$2', [`${ENTITY}S900U901`, reg]);
      const map = await registeredUnitMap(DEPT);
      const { rows } = await db.pool.query('SELECT designation FROM apparatus WHERE id=$1', [reg]);
      assert.equal(map[rows[0].designation], `${ENTITY}S900U901`);
      const { rows: u } = await db.pool.query('SELECT designation FROM apparatus WHERE id=$1', [unreg]);
      assert.ok(!(u[0].designation in map));
    } finally { await cleanup(ids); }
  });
}


// ─── Update re-push (the market's manual "Update in NERIS" pattern) ──────────
if (TENANCY_TEST_DB) {
  const db2 = require('../db');
  const { pushStationUpdate, pushUnitUpdate } = require('../utils/nerisRegistry');
  const DEPT2 = 1;
  const ENTITY2 = 'FD51087867';

  test('pushStationUpdate: not-registered refuses locally; registered PATCHes current fields', async () => {
    const ids = { stations: [] };
    try {
      await db2.pool.query('UPDATE departments SET neris_id=$1 WHERE id=$2', [ENTITY2, DEPT2]);
      const { rows } = await db2.pool.query(
        `INSERT INTO stations (name, address, city, state, zip, department_id)
         VALUES ('SR-UPD House','9 Upd Way','Glen Allen','VA','23060',$1) RETURNING id`, [DEPT2]);
      const sid = rows[0].id; ids.stations.push(sid);
      const notReg = await pushStationUpdate(sid, DEPT2, { client: { isConfigured: () => true } });
      assert.equal(notReg.needs, 'not_registered');
      await db2.pool.query('UPDATE stations SET neris_station_id=$1 WHERE id=$2', [`${ENTITY2}S955`, sid]);
      let patched = null;
      const r = await pushStationUpdate(sid, DEPT2, { client: {
        isConfigured: () => true,
        patchStation: async (e, nid, payload) => { patched = { e, nid, payload }; return { status: 200, data: {} }; },
      } });
      assert.deepEqual({ ok: r.ok, http: r.http }, { ok: true, http: 200 });
      assert.equal(patched.nid, `${ENTITY2}S955`);
      assert.equal(patched.payload.address_line_1, '9 Upd Way', 'CURRENT local fields pushed');
      assert.equal(patched.payload.internal_id, String(sid));
    } finally {
      if (ids.stations.length) await db2.pool.query('DELETE FROM stations WHERE id = ANY($1)', [ids.stations]);
      await db2.pool.query(`UPDATE departments SET neris_id='' WHERE id=$1`, [DEPT2]);
    }
  });

  test('pushUnitUpdate: same gates as register (type/staffing/station), PATCHes under the house', async () => {
    const ids = { stations: [], rigs: [] };
    try {
      await db2.pool.query('UPDATE departments SET neris_id=$1 WHERE id=$2', [ENTITY2, DEPT2]);
      const { rows: s } = await db2.pool.query(
        `INSERT INTO stations (name, address, city, state, zip, department_id, neris_station_id)
         VALUES ('SR-UPD House2','9 Upd Way2','Glen Allen','VA','23060',$1,$2) RETURNING id`,
        [DEPT2, `${ENTITY2}S956`]);
      const sid = s.rows ? s.rows[0].id : s[0].id; ids.stations.push(sid);
      const { NERIS_UNIT_TYPE_VALUES: V } = require('../constants/nerisUnitTypes');
      const { rows: a } = await db2.pool.query(
        `INSERT INTO apparatus (designation, type, year, neris_type, station_id, department_id, neris_unit_id)
         VALUES ($1,'Engine',2020,$2,$3,$4,$5) RETURNING id`,
        [`SR-UPD-${Date.now() % 100000}`, V[0], sid, DEPT2, `${ENTITY2}S956U000`]);
      const rid = a[0].id; ids.rigs.push(rid);
      assert.equal((await pushUnitUpdate(rid, DEPT2, {}, { client: { isConfigured: () => true } })).needs, 'staffing');
      let patched = null;
      const r = await pushUnitUpdate(rid, DEPT2, { staffing: 3 }, { client: {
        isConfigured: () => true,
        patchUnit: async (e, snid, unid, payload) => { patched = { snid, unid, payload }; return { status: 200, data: {} }; },
      } });
      assert.deepEqual({ ok: r.ok, http: r.http }, { ok: true, http: 200 });
      assert.equal(patched.snid, `${ENTITY2}S956`);
      assert.equal(patched.unid, `${ENTITY2}S956U000`);
      assert.equal(patched.payload.staffing, 3);
    } finally {
      if (ids.rigs.length) await db2.pool.query('DELETE FROM apparatus WHERE id = ANY($1)', [ids.rigs]);
      if (ids.stations.length) await db2.pool.query('DELETE FROM stations WHERE id = ANY($1)', [ids.stations]);
      await db2.pool.query(`UPDATE departments SET neris_id='' WHERE id=$1`, [DEPT2]);
    }
  });
}
