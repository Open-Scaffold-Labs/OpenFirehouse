// routes/activeBoard.js — live Command Board incident broadcast
const express = require('express');
const { z }   = require('zod');
const router  = express.Router();
const db      = require('../db');
const { requireDispatch } = require('../middleware/requireDispatch');
const { validate } = require('../utils/routeKit');
const { audit } = require('../utils/auditLog');
const { broadcastUnitStatusChanged } = require('../config/supabaseRealtime');

// ── Accountability hardening, Phase 0 (2026-07-14) ───────────────────────────
// Three defects fixed here, all found by reading the two sides of the contract
// against each other:
//
//   0.1  PUT had NO ROLE GATE. It sits behind requireAuth, so it was never
//        anonymous — but ANY authed member of the department (a probationary FF,
//        or an in-cab rig terminal: unitGate does not deny this path) could
//        overwrite the department's live command board. Now requireDispatch,
//        matching DELETE / /par / /par-interval / /link-incident, which were all
//        already gated. The board is a life-safety surface; the write side is
//        dispatch/command only.
//
//   0.2  THE FIELD NAMES NEVER MATCHED. The client sends snake_case
//        ({type, address, dispatched_at, personnel_count, units_count});
//        db.activeBoard.upsert destructures camelCase
//        ({incidentType, address, dispatchedAt, personnelCount, unitsCount}).
//        ONLY `address` lined up. So every board row has stored
//        incident_type = '' and — the one that actually hurt — dispatched_at
//        defaulted to NOW() at *board-activation* time instead of the real
//        dispatch time. The PAR countdown is based on dispatched_at, so the PAR
//        clock has been starting from the wrong moment. Normalized below, and
//        zod now REJECTS an unknown shape instead of silently coercing it.
//
//   0.5  No audit trail. Board mutations now write an audit_log row (best-effort
//        by design — audit() never fails the operation).
//
// GET stays open to any authed member ON PURPOSE. It is dept-scoped by RLS and
// it is read by Dashboard, DutyBoard, EventCalendar and TVDisplay — gating it to
// dispatch-only would blank the board for everyone else, and read-only viewers
// are a deliberate design goal (a second console / TV / remote chief must see
// the board without being able to write it).

// GET  /api/active-board — Dashboard, DutyBoard, EventCalendar, TVDisplay poll this.
router.get('/', async (req, res) => {
  try {
    const board = await db.activeBoard.get(req.user.department_id);
    if (!board) return res.json({ data: null });

    // THE PAR CLOCK'S ANCHOR — derived, not re-typed. (NFPA 1500 §8.2.4: the
    // incident clock starts when the FIRST ARRIVING UNIT IS ON SCENE.)
    //
    // Dispatch already flipped a unit to `on_scene` after radio traffic, and that
    // is recorded in unit_status_history with a timestamp and an author. The board
    // used to ignore it and make the IC tap a separate "On Scene" milestone — the
    // same fact entered twice, free to disagree, with the PAR clock trusting the
    // wrong copy.
    //
    // Not an inference. No GPS, no geofence, no AI. A human said it on the radio;
    // we are reading what they said. Provenance (which rig, who logged it) rides
    // along, because a life-safety value never travels without it.
    const firstOnScene = await db.activeBoard.firstUnitOnScene(req.user.department_id);

    // WHAT THE PAR CLOCK COUNTS FROM.
    //
    // ⚠️ THE `departments.par_anchor` READ IS DELIBERATELY REMOVED FOR NOW.
    //
    // I shipped code that SELECTed this column while migration 0057 was applied
    // only to the LOCAL dev DB. Vercel auto-deploys on push, so the code went live
    // against a prod schema that does not have the column — the exact failure
    // recorded in CLAUDE.md ("a migration and the code that depends on it are ONE
    // change — either both ship, or neither does"). A try/catch does not save you:
    // under P5_TXN the route runs inside a transaction, and a failed statement
    // POISONS it. Holding the migration back did not make the push safe; it made it
    // worse.
    //
    // It is also premature. Which anchor should be the DEFAULT is an open question:
    //   • on_scene — NFPA 1500 §8.2.4's mandatory default. But on-scene time only
    //     exists if a HUMAN flips the unit on the status board after radio traffic
    //     (CAD only ever gives us `dispatched`). Prod: 17 on-scene flips across 29
    //     dispatches. So on ~4 calls in 10 there is NO on-scene time — and with this
    //     anchor the PAR clock would then never start AT ALL. A clock that silently
    //     does not run is exactly the class of bug we are trying to kill.
    //   • dispatch — Annex A.8.2.4, explicitly sanctioned for LONG-TRAVEL (rural /
    //     volunteer) departments, i.e. our market. CAD always gives us this time, so
    //     the clock ALWAYS starts. Fail-safe.
    //
    // Until that is settled (and matched against how the market actually does it),
    // the board uses the NFPA default and does not read the column. Restore this
    // read ONLY in the same change that applies 0057 to prod.
    // DEFAULT = dispatch. Present on 100% of calls, so the PAR clock always
    // starts; matches the market-leading command board (anchors to call creation);
    // and is the NFPA 1500 Annex A.8.2.4 provision for long-travel (volunteer)
    // departments. on_scene anchoring is a per-department CHOICE (migration 0057,
    // deferred) — not the fail-open default, because on-scene time is not
    // guaranteed to exist. See client/src/utils/parClock.js.
    const parAnchor = 'dispatch';

    res.json({
      data: {
        ...board,
        first_on_scene_at:   firstOnScene?.at ?? null,
        first_on_scene_unit: firstOnScene?.designation ?? null,
        par_anchor:          parAnchor,
      },
    });
  } catch (e) {
    console.error('GET /active-board error:', e);
    res.status(500).json({ error: 'Failed to load the active board' });
  }
});

// The wire shape the Command Board actually sends. Kept snake_case — the client
// is the existing caller and it is not the one that was wrong.
const boardPutSchema = z.object({
  type:            z.string().max(200).optional(),
  address:         z.string().max(500).optional(),
  dispatched_at:   z.string().datetime({ offset: true }).optional(),
  personnel_count: z.number().int().min(0).max(10000).optional(),
  units_count:     z.number().int().min(0).max(10000).optional(),
});

// PUT  /api/active-board — Command Board calls when an incident activates/updates.
router.put('/', requireDispatch, validate({ body: boardPutSchema }), async (req, res) => {
  try {
    const b = req.body;
    // Translate the wire contract to db.activeBoard.upsert's camelCase params.
    // This mapping is the fix for 0.2 — do not "simplify" it away by passing
    // req.body straight through, which is exactly how the fields got dropped.
    const board = await db.activeBoard.upsert(req.user.department_id, {
      incidentType:   b.type,
      address:        b.address,
      dispatchedAt:   b.dispatched_at,   // the REAL dispatch time — the PAR countdown basis
      personnelCount: b.personnel_count,
      unitsCount:     b.units_count,
    });
    audit(req.user.department_id, req.user, 'update', 'active_boards', board?.department_id ?? null, {
      incident_type: b.type ?? '', address: b.address ?? '',
    });
    res.json({ data: board });
  } catch (e) {
    console.error('PUT /active-board error:', e);
    res.status(500).json({ error: 'Failed to update the active board' });
  }
});

// ── POST /api/active-board/link-incident — DELETED 2026-08-08. DO NOT RECREATE. ──
//
// This route WAS the call → incident linkage write, and it was called by the
// Command Board immediately after the board saved the incident record.
//
// The irony worth preserving: it carried a comment reading "the Command Board does
// NOT own the call -> incident association … Do not reintroduce a linkage write
// here" — written after Matt's 2026-07-26 correction and the `7b25c7d` revert —
// while itself BEING that write, on the board's own call path. The revert removed
// the auto-PICKING logic and left the endpoint standing; the board simply passed an
// explicit incident_id instead. A warning inside the thing it warns about is not a
// guard.
//
// Matt, 2026-07-26, re-affirmed 2026-08-08: "the Command Board is just a separate
// tool, it is not meant to be the activation of this information, it only should
// reflect it." And: the incident record is a legal record — every NERIS time comes
// from the CAD integration, not from a tactical board.
//
// The association has three legitimate doors, ALL keyed on the CAD dispatch/run
// number (utils/callAssociation.js — one door, both edges in a single CTE):
//   · utils/autoCreateFromCall.js  — CAD auto-create
//   · routes/incidents.js          — the CAD picker at incident creation
//   · routes/reconciliation.js     — the chief's audited repair queue
// That is also the market's model: every surveyed platform matches on the run
// number; none derives the link from a tactical board.
//
// `db.activeBoard.setIncident` is now unreferenced. It is left in db.js rather than
// removed in this change — flagged, not silently deleted.

// ── PAR spine (0048): the Command Board's PAR, persisted + synced ────────────
// The PAR UI already shipped on the board; these give it a spine so the
// countdown/overdue state is shared by every surface (second console, TV) and
// every completed PAR is an APPEND-ONLY accountability record. This router is
// mounted AFTER middleware/dbTransaction (two-zone rule) — plain db calls
// inherit the per-request GUC'd client; never runWithDepartment here.

// Exported for tests: a PAR record's counts must be coherent non-negative ints.
function validParCounts(b) {
  const a = Number(b?.accounted), m = Number(b?.missing), t = Number(b?.total);
  if (![a, m, t].every((n) => Number.isInteger(n) && n >= 0)) return null;
  if (a + m !== t) return null;
  return { accounted: a, missing: m, total: t };
}

// PATCH /api/active-board/par-interval — command sets/clears the PAR timer.
router.patch('/par-interval', requireDispatch, async (req, res) => {
  try {
    const raw = req.body?.minutes;
    const minutes = raw == null ? null : Number(raw);
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 120)) {
      return res.status(400).json({ error: 'minutes must be 1–120, or null to disable' });
    }
    const board = await db.activeBoard.setParInterval(req.user.department_id, minutes);
    if (!board) return res.status(404).json({ error: 'No active call' });
    broadcastUnitStatusChanged(req.user.department_id, { par: 'interval' }); // surfaces refetch
    res.json({ data: board });
  } catch (e) {
    console.error('PATCH /active-board/par-interval error:', e);
    res.status(500).json({ error: 'Failed to set PAR interval' });
  }
});

// POST /api/active-board/par — record a completed PAR (the Run PAR modal's
// submit). Append-only; resets the countdown basis (last_par_at = NOW()).
router.post('/par', requireDispatch, async (req, res) => {
  try {
    const counts = validParCounts(req.body);
    if (!counts) return res.status(400).json({ error: 'accounted/missing/total must be non-negative integers with accounted + missing = total' });
    // Per-person results: [{name, accounted}] — names only, no PII beyond the
    // roster names the department already holds; capped defensively.
    let results = null;
    if (Array.isArray(req.body?.results)) {
      results = req.body.results.slice(0, 200).map((r) => ({
        name: String(r?.name ?? '').slice(0, 120),
        accounted: r?.accounted === true,
      }));
    }
    // Replayable write (0058): the client mints a UUID (idempotency), sends the
    // real time the PAR happened (ranAt) and an incident snapshot, so a PAR queued
    // during an outage can land AFTER the call closes without double-recording.
    // A missing board no longer 404s — a PAR is always recordable.
    const b = req.body || {};
    const clientId = typeof b.client_id === 'string' && b.client_id ? b.client_id : null;
    const ranAt = typeof b.ran_at === 'string' && b.ran_at ? b.ran_at : null;
    const out = await db.activeBoard.recordPar(req.user.department_id, {
      ...counts, results, ranBy: req.user.id,
      clientId, ranAt,
      // snapshot fallbacks for a board-less (late) write:
      incidentId:   Number.isInteger(b.incident_id) ? b.incident_id : null,
      incidentType: typeof b.incident_type === 'string' ? b.incident_type.slice(0, 200) : null,
      address:      typeof b.address === 'string' ? b.address.slice(0, 500) : null,
    });
    if (!out?.check) return res.status(500).json({ error: 'Failed to record PAR' });
    // A duplicate is a SUCCESS (the record already exists) — do not re-audit or
    // re-broadcast it.
    if (!out.duplicate) {
      audit(req.user.department_id, req.user, 'create', 'par_checks', out.check.id, counts);
      broadcastUnitStatusChanged(req.user.department_id, { par: 'recorded' });
    }
    res.status(out.duplicate ? 200 : 201).json({
      data: { checkId: out.check.id, duplicate: !!out.duplicate,
              lastParAt: out.board?.last_par_at ?? null, ...counts },
    });
  } catch (e) {
    console.error('POST /active-board/par error:', e);
    res.status(500).json({ error: 'Failed to record PAR' });
  }
});

// DELETE /api/active-board — clear/close the active call.
// Dispatch-controlled: only Dispatch or a Chief may clear a call (requireDispatch).
router.delete('/', requireDispatch, async (req, res) => {
  try {
    audit(req.user.department_id, req.user, 'soft_delete', 'active_boards', req.user.department_id, { reason: 'call closed' });
    await db.activeBoard.clear(req.user.department_id);
    // RADIO DOCTRINE (2026-06-10): closing the board does NOT touch unit
    // statuses. Command terminated ≠ units released — a rig stays "on scene"
    // until its officer radios back in service and dispatch flips it. Units
    // still committed to a closed call are flagged `orphaned` on the board.
    res.json({ data: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── MAYDAY (Phase 4): sealed declaration + append-only log (0059) ────────────
// Tap-and-snapshot, matching the market: the client freezes a board snapshot and
// POSTs it here; the server stamps declared_at = NOW() and seals it. Append-only,
// idempotent on the client-minted client_id. The auto-PAR is raised CLIENT-side
// (the board stamps its `mayday` milestone, which parBenchmarkTriggers reads) —
// the server records the accountability event. There is NO typed LUNAR form, NO
// air, NO channel field (decisions log 2026-07-15). requireDispatch: command only.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const maydayDeclareSchema = z.object({
  client_id:          z.string().uuid(),
  incident_id:        z.number().int().optional(),
  board_key:          z.string().max(200).optional(),
  client_recorded_at: z.string().datetime({ offset: true }).optional(),
  victim_unit:        z.string().max(120).optional(),   // one tap: a unit already on the board
  nature:             z.enum(['lost','trapped','collapse','low_air','unaccounted','other']).optional(),
  scene_snapshot:     z.any().optional(),               // sealed board state (units/zones/crews-inside)
});

router.post('/mayday', requireDispatch, validate({ body: maydayDeclareSchema }), async (req, res) => {
  try {
    const b = req.body;
    const out = await db.mayday.declare(req.user.department_id, {
      clientId: b.client_id, incidentId: b.incident_id ?? null, boardKey: b.board_key ?? null,
      clientRecordedAt: b.client_recorded_at ?? null, declaredByUserId: req.user.id,
      victimUnit: b.victim_unit ?? null, nature: b.nature ?? null, sceneSnapshot: b.scene_snapshot ?? {},
    });
    if (!out?.mayday) return res.status(500).json({ error: 'Failed to declare MAYDAY' });
    if (!out.duplicate) {
      // record_id is an INTEGER column — NEVER pass the UUID client_id here or the
      // failed audit INSERT poisons the P5 transaction and the declare silently
      // rolls back (returns 201, persists nothing). client_id goes in detail.
      audit(req.user.department_id, req.user, 'create', 'mayday_events', null, { client_id: out.mayday.client_id, nature: b.nature ?? null });
      broadcastUnitStatusChanged(req.user.department_id, { mayday: 'declared' });
    }
    res.status(out.duplicate ? 200 : 201).json({ data: { ...out.mayday, duplicate: !!out.duplicate } });
  } catch (e) {
    console.error('POST /active-board/mayday error:', e);
    res.status(500).json({ error: 'Failed to declare MAYDAY' });
  }
});

const maydayEventsSchema = z.object({
  events: z.array(z.object({
    client_id: z.string().uuid(),
    kind:      z.enum(['checklist_item','par_requested','par_result','note','resolved']),
    payload:   z.any().optional(),
  })).min(1).max(50),
});

// Append-only batch. Idempotent per row (client_id). 'resolved' is GATED on a
// whole-scene PAR — a rejected resolve is reported per-item (never silently passed).
router.post('/mayday/:id/events', requireDispatch, validate({ body: maydayEventsSchema }), async (req, res) => {
  try {
    const maydayId = req.params.id;
    if (!UUID_RE.test(maydayId)) return res.status(404).json({ error: 'MAYDAY not found', code: 'NOT_FOUND' });
    const m = await db.mayday.getById(req.user.department_id, maydayId);
    if (!m) return res.status(404).json({ error: 'MAYDAY not found', code: 'NOT_FOUND' });
    const results = [];
    for (const ev of req.body.events) {
      if (ev.kind === 'resolved') {
        const ok = await db.mayday.parCompleteForScene(req.user.department_id, maydayId);
        if (!ok) { results.push({ client_id: ev.client_id, status: 'rejected', code: 'MAYDAY_RESOLVE_REQUIRES_PAR' }); continue; }
      }
      const out = await db.mayday.appendEvent(req.user.department_id, maydayId, {
        clientId: ev.client_id, actorUserId: req.user.id, kind: ev.kind, payload: ev.payload ?? null,
      });
      results.push({ client_id: ev.client_id, status: out.duplicate ? 'duplicate' : 'applied' });
      if (!out.duplicate) audit(req.user.department_id, req.user, 'create', 'mayday_event_log', null, { client_id: out.event?.client_id ?? null, kind: ev.kind });
    }
    broadcastUnitStatusChanged(req.user.department_id, { mayday: 'event' });
    res.json({ data: { results } });
  } catch (e) {
    console.error('POST /active-board/mayday/:id/events error:', e);
    res.status(500).json({ error: 'Failed to record MAYDAY events' });
  }
});

// GET active MAYDAY (drives viewer render + rehydration on reload). Open to any
// authed dept member (read-only viewers), like GET /. '/active' MUST precede '/:id'.
router.get('/mayday/active', async (req, res) => {
  try {
    res.json({ data: await db.mayday.getActive(req.user.department_id) });
  } catch (e) {
    console.error('GET /active-board/mayday/active error:', e);
    res.status(500).json({ error: 'Failed to load active MAYDAY' });
  }
});

router.get('/mayday/:id', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'MAYDAY not found', code: 'NOT_FOUND' });
    const m = await db.mayday.getById(req.user.department_id, req.params.id);
    if (!m) return res.status(404).json({ error: 'MAYDAY not found', code: 'NOT_FOUND' });
    res.json({ data: m });
  } catch (e) {
    console.error('GET /active-board/mayday/:id error:', e);
    res.status(500).json({ error: 'Failed to load MAYDAY' });
  }
});

module.exports = router;
// Exported for tests (parPersistence.test.js, activeBoardAuth.test.js) — the
// house idiom: keep the pure rule at module level, hang it off the router.
module.exports.validParCounts = validParCounts;
module.exports.boardPutSchema = boardPutSchema;
