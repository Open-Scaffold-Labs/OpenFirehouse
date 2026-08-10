'use strict';
/**
 * tests/cadWebhookRouting.test.js — the WIRING between the adapter and the pipeline.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * cadStatusUpdate.test.js covers the status-word normaliser and the generic
 * adapter's parse. Both were green. Between them sits handleVendorWebhook, which
 * decides which pipeline function a parsed event goes to — and NOTHING exercised
 * it. On 2026-07-15 `4bfde8b` added the unit-status branch and called
 * `processStatusUpdate` without adding it to the require on line 14. Every
 * CAD-relayed unit status has answered 500 since.
 *
 * That matters more than an ordinary 500. Per NENA-STA-024.1.1-2025's
 * eventResponse table a 500 produces NO sender action — there is no dead-letter
 * queue and no redelivery in the standard — so the arrival time, which anchors
 * the PAR clock, was lost with nothing left to look for. NENA-STA-024 §3.14
 * makes logging every message MUST-level and NFPA 1221 §12.5.3 makes keeping a
 * record of every dispatch signal SHALL.
 *
 * So: this file calls handleVendorWebhook itself, for every lifecycle branch it
 * routes. A branch that is only reachable in production is not covered.
 */
const assert = require('assert');
const { test, before, after } = require('node:test');

const DSN = process.env.TENANCY_TEST_DB;
const maybe = DSN ? test : test.skip;

let handleVendorWebhook;
let MARK;
let SECRET, deptId, connId;

before(async () => {
  if (!DSN) return;
  process.env.DATABASE_URL = DSN;
  ({ handleVendorWebhook } = require('../cad'));
  MARK = `cwr${Date.now() % 1e7}`;

  // 4C.2: a department's own per-connection secret is now the ONLY accepted
  // credential (the global CAD_WEBHOOK_SECRET and its non-production bypass are
  // both retired), so these cases have to authenticate like a real relay does.
  // That is an improvement to this file, not a workaround: the handler's tenant,
  // its ingest receipt, and the RLS context all derive from this connection, so
  // going through it exercises the real path instead of a test-only shortcut.
  const crypto = require('crypto');
  const { pool } = require('../db');
  SECRET = `cwr-secret-${crypto.randomUUID()}`;
  const hash = crypto.createHash('sha256').update(SECRET).digest('hex');
  const d = await pool.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [`CWR Test ${MARK}`]);
  deptId = d.rows[0].id;
  const c = await pool.query(
    `INSERT INTO cad_connections ("vendorId", name, status, department_id, webhook_secret_hash)
     VALUES ('generic', $1, 'active', $2, $3) RETURNING id`,
    [`CWR ${MARK}`, deptId, hash]
  );
  connId = c.rows[0].id;
});

after(async () => {
  if (!DSN) return;
  const { pool } = require('../db');
  await pool.query('DELETE FROM cad_alerts WHERE address LIKE $1', [`${MARK}%`]);
  if (deptId) {
    await pool.query('DELETE FROM cad_ingest_outcome WHERE department_id=$1', [deptId]).catch(() => {});
    await pool.query('DELETE FROM cad_ingest_log     WHERE department_id=$1', [deptId]).catch(() => {});
    await pool.query('DELETE FROM cad_alerts         WHERE department_id=$1', [deptId]).catch(() => {});
    await pool.query('DELETE FROM cad_connections    WHERE id=$1', [connId]).catch(() => {});
    await pool.query('DELETE FROM departments        WHERE id=$1', [deptId]).catch(() => {});
  }
  await pool.end();
});

/** Minimal Express double. Records the status the handler actually chose. */
function call(body) {
  const req = {
    params: { vendor: 'generic' },
    headers: { 'x-cad-webhook-secret': SECRET },
    query: {},
    body,
    // rawCapture supplies this in the real app; the handler stores it verbatim.
    rawBody: JSON.stringify(body),
    ip: '203.0.113.5',
  };
  const res = {
    statusCode: 200, body: null,
    status(s) { this.statusCode = s; return this; },
    json(b) { this.body = b; return this; },
  };
  return handleVendorWebhook(req, res).then(() => res);
}

// ── the branch that was dead ────────────────────────────────────────────────

maybe('a CAD unit-STATUS event reaches the pipeline — it must not 500', async () => {
  // A deliberately unmatchable unit token: processStatusUpdate is fail-safe and
  // RETURNS the skip, so this asserts the wiring without mutating any rig.
  const res = await call({
    event: 'status',
    unit: `${MARK}-NO-SUCH-RIG`,
    unit_status: 'on scene',
  });

  assert.notStrictEqual(res.statusCode, 500,
    'the status branch 500s — a CAD-relayed arrival is lost and NENA-STA-024 gives the sender no retry');
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.statusUpdate, true);
  // Fail-safe, and REPORTED: an unmatched unit is skipped with a reason, never
  // silently swallowed and never guessed at.
  assert.ok(Array.isArray(res.body.skipped), 'skips must be returned to the sender');
  assert.strictEqual(res.body.applied.length, 0, 'an unmatchable token must flip nothing');
});

// ── the branches that were already wired, now actually covered ──────────────

maybe('a DISPATCH routes to processDispatch and stores the call', async () => {
  const res = await call({
    incident_number: `${MARK}-D1`,
    description: 'Structure Fire',
    address: `${MARK} 1 Main St`,
    units: 'E1',
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.ok, true);
  assert.ok(res.body.id || res.body.duplicate, 'a dispatch must land or be recognised as a duplicate');
});

maybe('a CLOSE event routes to processClose rather than storing a new call', async () => {
  const res = await call({ event: 'closed', incident_number: `${MARK}-D1` });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.close, true);
});

// ── the guard that would have caught the original defect on its own ─────────

maybe('every pipeline function the handler calls is actually imported', () => {
  // The defect was a free identifier: `processStatusUpdate` was called but never
  // destructured from './pipeline'. Node only raises that when the line executes,
  // which is why a green suite and a green build both missed it. This reads the
  // source and checks the two lists agree.
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '..', 'cad', 'index.js'), 'utf8');

  const imported = new Set(
    (/const\s*\{([^}]*)\}\s*=\s*require\('\.\/pipeline'\)/.exec(src)?.[1] || '')
      .split(',').map(s => s.trim()).filter(Boolean)
  );
  const exported = Object.keys(require('../cad/pipeline'));
  const codeOnly = src.split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');

  for (const fn of exported) {
    if (new RegExp(`(?<![\\w.])${fn}\\s*\\(`).test(codeOnly)) {
      assert.ok(imported.has(fn),
        `cad/index.js calls ${fn}() but never imports it — a ReferenceError at runtime, invisible to the build`);
    }
  }
});
