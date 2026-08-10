'use strict';
/**
 * setupStatusContract.test.js — freezes the /api/setup-status response contract.
 *
 * WHY THIS EXISTS (2026-08-04)
 * ---------------------------
 * /api/setup-status looks like a trivial first-run helper. It is not. It is the
 * READINESS PROBE FOR ESSENTIALLY THE ENTIRE TEST ESTATE, plus two app surfaces,
 * and NOTHING anywhere said so:
 *
 *   · 20+ server test files poll it before running (checks, fieldSync, csCustody,
 *     hiringEngine, workOrders, inventory, provisioningIsolation, …). Those only
 *     check `status === 200`, so they survive a shape change.
 *   · .github/workflows/e2e.yml — the CI readiness gate — string-matches the raw
 *     body for `"needsFirstRun":false` to know the demo seed finished.
 *   · client/src/App.jsx — first-run detection.
 *   · client/src/components/LoginScreen.jsx — reads `demoMode` to decide whether
 *     this deployment may offer the quick demo login at all.
 *
 * On 2026-08-04 this endpoint was edited TWICE in one session by someone who did
 * not know any of that. Renaming or dropping a field would have been silent at
 * edit time — and the resulting failure is the expensive kind:
 *
 *   the e2e gate polls 45x, never matches, FALLS THROUGH ANYWAY (it has no
 *   failure branch), the app runs unseeded, chief/1234 does not exist, and every
 *   journey spec fails with "login for chief should succeed (401)" — pointing
 *   the reader straight at auth, which is perfectly healthy. The real cause is
 *   one renamed JSON key in an unrelated endpoint.
 *
 * This test converts that invisible cross-file coupling into one loud assertion
 * in the suite that already runs on every push (ci.yml → npm test --workspace=server).
 *
 * It is the same defect class as two other things found the same day: the
 * realtime verifier that failed identically whether the system was broken or the
 * harness was unconfigured, and `_broadcast()` awaiting a fetch while checking
 * nothing. A check that cannot report its own failure is worse than no check,
 * because it turns "broken" into "confusing".
 *
 * IF YOU ARE HERE BECAUSE THIS TEST FAILED: you changed the shape of
 * /api/setup-status. Update EVERY consumer listed above — especially the shell
 * string-match in e2e.yml, which no type system will catch for you.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[setup-status] TENANCY_TEST_DB not set — skipping live contract test.');
  test('/api/setup-status contract (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('/api/setup-status keeps the fields its consumers depend on', async () => {
    // Same boot dance as the other live-DB suites: unref the app's timers so the
    // test process can exit.
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const t = realSetInterval(...a); if (t && t.unref) t.unref(); return t; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }

    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      // The endpoint is itself the readiness probe, so poll it the way every
      // other suite does before asserting on it.
      let res = null;
      for (let i = 0; i < 30; i++) {
        try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { res = r; break; } } catch { /* booting */ }
        await new Promise((x) => setTimeout(x, 1000));
      }
      assert.ok(res, 'DB never became ready — /api/setup-status did not return 200');

      const raw = await res.text();
      const body = JSON.parse(raw);

      // ── The three fields, by name. Renaming any of them breaks a consumer. ──
      assert.ok(Object.hasOwn(body, 'usersExist'),
        'usersExist missing — client/src/App.jsx first-run detection depends on it');
      assert.ok(Object.hasOwn(body, 'needsFirstRun'),
        'needsFirstRun missing — the e2e.yml CI readiness gate string-matches this key');
      assert.ok(Object.hasOwn(body, 'demoMode'),
        'demoMode missing — LoginScreen.jsx uses it to decide whether the quick demo login may render');

      assert.equal(typeof body.usersExist, 'boolean', 'usersExist must be a boolean');
      assert.equal(typeof body.needsFirstRun, 'boolean', 'needsFirstRun must be a boolean');
      assert.equal(typeof body.demoMode, 'boolean', 'demoMode must be a boolean');

      // The invariant the CI gate actually relies on: once users exist,
      // needsFirstRun goes false. If these ever drift apart the gate either
      // hangs forever or releases early.
      assert.equal(body.needsFirstRun, !body.usersExist,
        'needsFirstRun must be the negation of usersExist');

      // The gate does a RAW STRING match on the body, not a JSON parse. Assert
      // the literal it looks for, so a serializer change (or a field reordering
      // that introduced whitespace) cannot silently break CI.
      if (!body.needsFirstRun) {
        assert.ok(raw.includes('"needsFirstRun":false'),
          'e2e.yml matches the literal string `"needsFirstRun":false` in the raw body');
      }

      // demoMode must reflect REALITY (do the demo accounts exist), not an env
      // var read at boot. Gating it on SEED_DEMO shipped on 2026-08-04 and hid a
      // working demo login from production, because db.js fast-paths on
      // stations.seeded_at — so a once-seeded deployment keeps the accounts long
      // after the env var is gone.
      const { pool } = require('../db');
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM users
          WHERE username = ANY(ARRAY['chief','officer','bchief','member','dispatch'])`
      );
      if (rows[0].n > 0) {
        assert.equal(body.demoMode, true,
          'demo accounts exist in this database, so demoMode must be true regardless of SEED_DEMO');
      }
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
}
