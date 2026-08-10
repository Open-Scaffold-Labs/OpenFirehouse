'use strict';
// Phase 2.3 (migration 0074) — station-display DEVICE pairing. Adversarial SECURITY suite
// for the PUBLIC redeem/resolve SECURITY DEFINER fns (the of_redeem_member_invite pattern):
// single-use, expiry, wrong-code, revoke, and cross-tenant binding. Every case exercises the
// exact fns the unauthenticated /pair + tvData paths call. DB cases opt-in via TENANCY_TEST_DB.

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[stationDisplayPairing] TENANCY_TEST_DB not set — skipping live-DB 2.3 suite.');
  test('2.3 station-display pairing (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;

  test('2.3 — pairing DEFINER fns: single-use, expiry, wrong-code, revoke, cross-tenant', async () => {
    const { pool } = require('../db');
    const MARK = 'SDP-2_3';

    async function cleanup() {
      await pool.query(`DELETE FROM station_displays WHERE label LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }
    const mkPending = async (dept, stn, code, ttlMin = 15) => (await pool.query(
      `INSERT INTO station_displays (department_id, station_id, label, status, pairing_code_hash, pairing_expires_at)
       VALUES ($1,$2,$3,'pending',$4, now() + ($5 || ' minutes')::interval) RETURNING id`,
      [dept, stn, `${MARK} disp`, sha256(code), String(ttlMin)])).rows[0].id;
    const redeem = (code, tok) => pool.query('SELECT * FROM of_redeem_station_pairing($1,$2)', [sha256(code), sha256(tok)]);
    const resolve = (tok) => pool.query('SELECT * FROM of_resolve_station_display($1)', [sha256(tok)]);

    try {
      await cleanup();
      const deptA = (await pool.query(`INSERT INTO departments (name) VALUES ('${MARK} A') RETURNING id`)).rows[0].id;
      const deptB = (await pool.query(`INSERT INTO departments (name) VALUES ('${MARK} B') RETURNING id`)).rows[0].id;
      const stnA = (await pool.query(`INSERT INTO stations (department_id, name, address, city, state) VALUES ($1,'${MARK} StA','','','') RETURNING id`, [deptA])).rows[0].id;
      const stnB = (await pool.query(`INSERT INTO stations (department_id, name, address, city, state) VALUES ($1,'${MARK} StB','','','') RETURNING id`, [deptB])).rows[0].id;

      // 1) VALID redeem → active + correct binding.
      await mkPending(deptA, stnA, 'CODE-A');
      const tokA = 'tokA-' + crypto.randomBytes(20).toString('hex');
      const r1 = await redeem('CODE-A', tokA);
      assert.equal(r1.rows.length, 1, 'a valid pending code redeems');
      assert.equal(Number(r1.rows[0].dept_id), Number(deptA), 'binds to the code’s department');
      assert.equal(Number(r1.rows[0].stn_id), Number(stnA), 'binds to the code’s station');

      // 2) SINGLE-USE — the same code cannot be redeemed a second time.
      await assert.rejects(() => redeem('CODE-A', 'anotherToken'),
        /invalid, used, or expired/i, 'a used pairing code is refused');

      // 3) WRONG code → refused.
      await assert.rejects(() => redeem('DOES-NOT-EXIST', 'tok'),
        /invalid, used, or expired/i, 'a wrong code is refused');

      // 4) EXPIRED code → refused.
      await mkPending(deptA, stnA, 'CODE-EXP', -1);
      await assert.rejects(() => redeem('CODE-EXP', 'tok2'),
        /invalid, used, or expired/i, 'an expired code is refused');

      // 5) RESOLVE an active device token → binding (last_seen touched).
      const res1 = await resolve(tokA);
      assert.equal(res1.rows.length, 1, 'an active device resolves');
      assert.equal(Number(res1.rows[0].stn_id), Number(stnA), 'resolves to its bound station');

      // 6) REVOKE — a revoked device no longer resolves (token hash cleared).
      await pool.query(`UPDATE station_displays SET status='revoked', device_token_hash=NULL WHERE device_token_hash=$1`, [sha256(tokA)]);
      const res2 = await resolve(tokA);
      assert.equal(res2.rows.length, 0, 'a revoked device does not resolve');

      // 7) CROSS-TENANT — dept B's code binds to B, and B's token never resolves to A.
      await mkPending(deptB, stnB, 'CODE-B');
      const tokB = 'tokB-' + crypto.randomBytes(20).toString('hex');
      const rB = await redeem('CODE-B', tokB);
      assert.equal(Number(rB.rows[0].dept_id), Number(deptB), 'dept B code binds to dept B');
      const resB = await resolve(tokB);
      assert.equal(Number(resB.rows[0].dept_id), Number(deptB), 'dept B token resolves to dept B');
      assert.notEqual(Number(resB.rows[0].stn_id), Number(stnA), 'never resolves to another department’s station');
    } finally {
      await cleanup();
      await pool.end().catch(() => {});
    }
  });
}
