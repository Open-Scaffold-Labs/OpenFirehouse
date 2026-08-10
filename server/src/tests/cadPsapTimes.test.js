'use strict';
/**
 * PSAP call-time extraction from CAD webhooks (P2-D4).
 *
 * NERIS requires call_answered / call_arrival — PSAP-side stamps that only the
 * CAD system knows. The pipeline lifts them from webhook payloads when a vendor
 * sends them, tolerantly (ISO / epoch s / epoch ms) but never guessed: a value
 * that doesn't parse to a plausible instant is dropped.
 */
// DATABASE_URL must be set BEFORE any require that transitively pulls in db.js
// (cad/pipeline requires ../db at module load) — else db.js captures the
// postgres:password fallback and the DB-gated test below fails on connect.
if (process.env.TENANCY_TEST_DB) process.env.DATABASE_URL = process.env.TENANCY_TEST_DB;

const test = require('node:test');
const assert = require('node:assert/strict');

const { extractPsapTimes, parsePsapInstant } = require('../cad/pipeline');

// ─── parsePsapInstant ─────────────────────────────────────────────────────────

test('parses ISO strings, epoch seconds, and epoch millis to the same instant', () => {
  const iso = '2026-07-16T18:05:00.000Z';
  const sec = Date.parse(iso) / 1000;
  assert.equal(parsePsapInstant(iso), iso);
  assert.equal(parsePsapInstant(sec), iso);                 // epoch seconds
  assert.equal(parsePsapInstant(sec * 1000), iso);          // epoch millis
  assert.equal(parsePsapInstant(String(sec)), iso);         // numeric string (seconds)
  assert.equal(parsePsapInstant('2026-07-16T14:05:00-04:00'), iso); // offset ISO
});

test('junk, empties, and implausible instants are dropped — never guessed', () => {
  for (const v of [null, undefined, '', 'not-a-date', '25:99', {}, [], true, 0, 12345]) {
    assert.equal(parsePsapInstant(v), null, `should drop ${JSON.stringify(v)}`);
  }
});

// ─── extractPsapTimes ─────────────────────────────────────────────────────────

test('finds compound vendor field names at the top level and one level down', () => {
  const iso = '2026-07-16T18:05:00.000Z';
  assert.deepEqual(extractPsapTimes({ call_answered: iso, call_received: iso }), {
    callAnsweredAt: iso, callArrivalAt: iso,
  });
  // camelCase + nested (vendor payloads often wrap under `incident`/`call`)
  assert.deepEqual(extractPsapTimes({ incident: { callAnsweredAt: iso, call_arrival_time: iso } }), {
    callAnsweredAt: iso, callArrivalAt: iso,
  });
  // epoch-seconds value through a real-looking payload
  assert.deepEqual(extractPsapTimes({ call: { time_call_answered: Date.parse(iso) / 1000 } }).callAnsweredAt, iso);
});

test('bare/ambiguous keys are ignored (a lone `received` could mean anything)', () => {
  const out = extractPsapTimes({ received: '2026-07-16T18:05:00Z', answered: '2026-07-16T18:05:00Z', timestamp: 1784311500 });
  assert.deepEqual(out, { callAnsweredAt: null, callArrivalAt: null });
});

test('unparseable values in matching keys are dropped, not passed through', () => {
  assert.deepEqual(extractPsapTimes({ call_answered: 'pending', call_received: '1999-01-01T00:00:00Z' }), {
    callAnsweredAt: null, callArrivalAt: null, // pre-2000 fails the plausibility floor
  });
});

test('no raw payload → nulls; scanning never throws on odd shapes', () => {
  for (const raw of [null, undefined, 'string', 42, [], { a: [1, 2, { call_answered: 'x' }] }]) {
    const out = extractPsapTimes(raw);
    assert.deepEqual(out, { callAnsweredAt: null, callArrivalAt: null });
  }
});

// ─── DB round-trip (gated like the other DB-backed suites) ────────────────────

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
test('cadAlerts.create persists PSAP columns and the NERIS transformer consumes them', { skip: !TENANCY_TEST_DB && 'requires TENANCY_TEST_DB' }, async () => {
  const db = require('../db');
  await db.ready;
  const iso1 = '2026-07-16T18:01:00.000Z';
  const iso2 = '2026-07-16T18:02:30.000Z';
  const alertId = `psap-test-${Date.now()}`;
  const alert = await db.cadAlerts.create({
    alertId, address: '1 Test St', units: 'E1', description: 'PSAP test',
    stationId: 1, dispatchedAt: '2026-07-16T18:03:00.000Z',
    callArrivalAt: iso1, callAnsweredAt: iso2, raw: { test: true },
  });
  try {
    assert.ok(alert, 'alert created');
    assert.equal(new Date(alert.call_arrival_at).toISOString(), iso1);
    assert.equal(new Date(alert.call_answered_at).toISOString(), iso2);

    // The ONE transformer's PSAP precedence: CAD columns feed the dispatch block.
    const { buildNerisIncidentPayload } = require('../utils/nerisPayload');
    const { payload, validation } = buildNerisIncidentPayload({
      incident: {
        incidentNumber: 'PSAP-1', date: '2026-07-16', time: '14:03',
        address: '1 Test St, Riverton, NJ 08077',
        neris_incident_types: [{ value: 'NOEMERG||CANCELLED', primary: true }],
        neris_noaction: 'CANCELLED',
      },
      department: { id: 1, name: 'Demo', fdid: 'FD12345678' },
      cadAlert: alert,
    });
    assert.equal(payload.dispatch.call_arrival, iso1);
    assert.equal(payload.dispatch.call_answered, iso2);
    assert.equal(validation.errors.filter((e) => e.includes('call_answered') || e.includes('call_arrival')).length, 0,
      'no missing-PSAP errors when CAD supplied them');
  } finally {
    await db.pool.query('DELETE FROM cad_alert_units WHERE alert_id IN (SELECT id FROM cad_alerts WHERE alert_id = $1)', [alertId]).catch(() => {});
    await db.pool.query('DELETE FROM cad_alerts WHERE alert_id = $1', [alertId]);
  }
});
