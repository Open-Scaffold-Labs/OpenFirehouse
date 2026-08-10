'use strict';
/**
 * CAD retry deduplication, through the REAL pipeline (0106).
 *
 * alertIdentity.test.js proves the hash is stable. This proves the property that
 * actually matters: an id-less dispatch, re-delivered by a vendor retry, lands
 * ONCE in cad_alerts — and two genuinely different id-less calls both land.
 *
 * Before 0106 the adapters synthesized `${prefix}-${Date.now()}`, so the retry
 * arrived with a different identifier, missed the ON CONFLICT, and stored the
 * call a second time. Two alert rows for one call can become two draft incidents
 * on clear: two incident numbers for one fire.
 */
const assert = require('assert');
const { test, before, after } = require('node:test');

const DSN = process.env.TENANCY_TEST_DB;
const maybe = DSN ? test : test.skip;

let pool;
let MARK;

before(async () => {
  if (!DSN) return;
  process.env.DATABASE_URL = DSN;
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: DSN });
  MARK = `rtd${Date.now() % 1e7}`;
});

after(async () => {
  if (!pool) return;
  await pool.query("DELETE FROM cad_alerts WHERE address LIKE $1", [`${MARK}%`]);
  await pool.end();
});

/** The exact statement shape cadAlertCreate uses, including its ON CONFLICT. */
async function ingest({ alertId, alertIdSource, address, units, dispatchedAt }) {
  const r = await pool.query(
    `INSERT INTO cad_alerts (alert_id, alert_id_source, address, units, dispatched_at, station_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (department_id, alert_id) DO NOTHING
     RETURNING id`,
    [alertId, alertIdSource, address, units, dispatchedAt, 1]
  );
  return r.rowCount;   // 1 = stored, 0 = deduped
}

maybe('a vendor RETRY of an id-less dispatch stores the call exactly once', async () => {
  const { resolveAlertId } = require('../cad/alertIdentity');
  const call = {
    vendorId: null, departmentId: 1, source: 'generic',
    address: `${MARK} 11 First St`, units: 'E1,L2',
    description: 'Structure Fire', dispatchedAt: '2026-07-27T14:02:00Z',
  };

  const first = resolveAlertId(call);
  const retry = resolveAlertId(call);          // the vendor sends it again

  const a = await ingest({ alertId: first.alertId, alertIdSource: first.source,
    address: call.address, units: call.units, dispatchedAt: call.dispatchedAt });
  const b = await ingest({ alertId: retry.alertId, alertIdSource: retry.source,
    address: call.address, units: call.units, dispatchedAt: call.dispatchedAt });

  assert.strictEqual(a, 1, 'the first delivery must store the call');
  assert.strictEqual(b, 0, 'the retry must dedupe — this is the whole defect');

  const { rows } = await pool.query(
    'SELECT count(*)::int AS n FROM cad_alerts WHERE address = $1', [call.address]);
  assert.strictEqual(rows[0].n, 1, 'one call, one row');
});

maybe('two genuinely different id-less calls BOTH land — no call is lost', async () => {
  const { resolveAlertId } = require('../cad/alertIdentity');
  const base = {
    vendorId: null, departmentId: 1, source: 'generic',
    units: 'E1', description: 'EMS Call',
  };
  const one = { ...base, address: `${MARK} 22 Second Ave`, dispatchedAt: '2026-07-27T15:00:00Z' };
  const two = { ...base, address: `${MARK} 33 Third Blvd`,  dispatchedAt: '2026-07-27T15:40:00Z' };

  const i1 = resolveAlertId(one);
  const i2 = resolveAlertId(two);
  assert.notStrictEqual(i1.alertId, i2.alertId);

  assert.strictEqual(await ingest({ alertId: i1.alertId, alertIdSource: i1.source,
    address: one.address, units: one.units, dispatchedAt: one.dispatchedAt }), 1);
  assert.strictEqual(await ingest({ alertId: i2.alertId, alertIdSource: i2.source,
    address: two.address, units: two.units, dispatchedAt: two.dispatchedAt }), 1,
    'a real second call must NEVER be swallowed — a lost dispatch is undetectable');
});

maybe('the SAME address dispatched twice at different times is two calls', async () => {
  // The dangerous over-collapse: a second run to the same address for the same
  // nature is a real, separate call. The sender's timestamp discriminates them.
  const { resolveAlertId } = require('../cad/alertIdentity');
  const base = {
    vendorId: null, departmentId: 1, source: 'generic',
    address: `${MARK} 44 Repeat Rd`, units: 'E1', description: 'Alarm Activation',
  };
  const morning = resolveAlertId({ ...base, dispatchedAt: '2026-07-27T09:00:00Z' });
  const evening = resolveAlertId({ ...base, dispatchedAt: '2026-07-27T21:00:00Z' });

  assert.notStrictEqual(morning.alertId, evening.alertId);
  assert.strictEqual(await ingest({ alertId: morning.alertId, alertIdSource: morning.source,
    address: base.address, units: base.units, dispatchedAt: '2026-07-27T09:00:00Z' }), 1);
  assert.strictEqual(await ingest({ alertId: evening.alertId, alertIdSource: evening.source,
    address: base.address, units: base.units, dispatchedAt: '2026-07-27T21:00:00Z' }), 1);
});

maybe('provenance is stored, so a synthesized id never masquerades', async () => {
  const { resolveAlertId } = require('../cad/alertIdentity');
  const synth = resolveAlertId({
    vendorId: null, departmentId: 1, source: 'generic',
    address: `${MARK} 55 Provenance Way`, units: 'E1',
    description: 'Wires Down', dispatchedAt: '2026-07-27T12:00:00Z',
  });
  await ingest({ alertId: synth.alertId, alertIdSource: synth.source,
    address: `${MARK} 55 Provenance Way`, units: 'E1', dispatchedAt: '2026-07-27T12:00:00Z' });

  const vend = resolveAlertId({ vendorId: `${MARK}-CAD-991`, departmentId: 1, source: 'generic' });
  await ingest({ alertId: vend.alertId, alertIdSource: vend.source,
    address: `${MARK} 66 Vendor Ln`, units: 'E1', dispatchedAt: '2026-07-27T13:00:00Z' });

  const { rows } = await pool.query(
    `SELECT alert_id, alert_id_source FROM cad_alerts
      WHERE address IN ($1,$2) ORDER BY address`,
    [`${MARK} 55 Provenance Way`, `${MARK} 66 Vendor Ln`]);
  assert.strictEqual(rows[0].alert_id_source, 'synthesized');
  assert.ok(rows[0].alert_id.startsWith('syn-'), 'it must be visibly ours');
  assert.strictEqual(rows[1].alert_id_source, 'vendor');
  assert.strictEqual(rows[1].alert_id, `${MARK}-CAD-991`, 'a vendor id is stored verbatim');
});

maybe('a null identifier can no longer reach the table at all', async () => {
  // The trap 0106 closes: with 0104's NULLS NOT DISTINCT index, a second
  // null-id call in a department would have been refused 23505 and dropped.
  await assert.rejects(
    () => ingest({ alertId: null, alertIdSource: 'synthesized',
      address: `${MARK} 77 Null St`, units: 'E1', dispatchedAt: '2026-07-27T14:00:00Z' }),
    (e) => e.code === '23502',
    'alert_id must be NOT NULL so the dropped-dispatch trap cannot be sprung');
});

maybe('no adapter can still emit a timestamp-based identifier', async () => {
  // Mechanical guard: the old `${prefix}-${Date.now()}` fallback is what made a
  // retry look like a new call. If it reappears in any adapter, fail here.
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'cad', 'adapters');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/Date\.now\(\)/.test(code),
      `${f} synthesizes an identifier from the clock — a vendor retry would mint a new call`);
  }
});
