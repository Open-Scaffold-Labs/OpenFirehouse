// prevention/fiApi.js — shared data layer for the Prevention Center (Phase 3).
// Every call goes through utils/api (Bearer + refresh + unified errors). The
// violations JSON array on the inspection stays the WRITE contract; fi_violations
// rows are the READ authority for dashboards/dossiers (/api/fi-reports/*).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { ROLES } from '../../data/auth';

// ── Date doctrine: the CLIENT supplies the inspector's local day. ────────────
// toLocaleDateString('en-CA') renders YYYY-MM-DD in LOCAL time — never
// toISOString(), which flips to UTC and drifts a day at the edges.
export function localToday() {
  return new Date().toLocaleDateString('en-CA');
}

/** Pure calendar math between two ISO days (DST/leap-proof via UTC anchors). */
export function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const [fy, fm, fd] = String(fromIso).slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = String(toIso).slice(0, 10).split('-').map(Number);
  if (!fy || !ty) return null;
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export function isOverdue(inspection, today = localToday()) {
  return !inspection.completedDate && !!inspection.scheduledDate
    && String(inspection.scheduledDate).slice(0, 10) < today;
}

/** Incumbent-verified queue color code: red = initial, yellow = reinspection. */
export function isReinspection(inspection) {
  return /re-?inspection/i.test(inspection?.type || '');
}

export const fi = {
  settings:      { get: () => api.get('/api/fi-settings'), patch: (b) => api.patch('/api/fi-settings', b) },
  designations:  {
    list:   () => api.get('/api/fi-designations'),
    grant:  (userId, role) => api.post('/api/fi-designations', { userId, role }),
    revoke: (id) => api.delete(`/api/fi-designations/${id}`),
    eligibleUsers: () => api.get('/api/fi-designations/eligible-users'),
  },
  types: {
    list:   () => api.get('/api/fi-inspection-types'),
    create: (b) => api.post('/api/fi-inspection-types', b),
    patch:  (id, b) => api.patch(`/api/fi-inspection-types/${id}`, b),
    retire: (id) => api.delete(`/api/fi-inspection-types/${id}`),
    seedStarter: () => api.post('/api/fi-inspection-types/seed-starter', {}),
  },
  codes: {
    list:   () => api.get('/api/fi-code-library'),
    create: (b) => api.post('/api/fi-code-library', b),
    patch:  (id, b) => api.patch(`/api/fi-code-library/${id}`, b),
    retire: (id) => api.delete(`/api/fi-code-library/${id}`),
    seedStarter: () => api.post('/api/fi-code-library/seed-starter', {}),
    // Bulk CSV — the server generates/parses (injection-safe, validated, one authoritative
    // parser). import(dryRun:true) returns a preview and writes NOTHING.
    exportCsv: () => api.get('/api/fi-code-library/export'),
    template:  () => api.get('/api/fi-code-library/template'),
    import:    (csv, dryRun = false) => api.post('/api/fi-code-library/import', { csv, dryRun }),
  },
  checklists: {
    list:   () => api.get('/api/fi-checklists'),
    get:    (id) => api.get(`/api/fi-checklists/${id}`),
    create: (b) => api.post('/api/fi-checklists', b),
    patch:  (id, b) => api.patch(`/api/fi-checklists/${id}`, b),
    setItems: (id, items) => api.put(`/api/fi-checklists/${id}/items`, { items }),
    retire: (id) => api.delete(`/api/fi-checklists/${id}`),
  },
  properties:  { list: () => api.get('/api/fi-properties') },
  // Permits gained a WRITE surface in Phase 3 module 3.0 (R6): the only create/edit
  // path used to live on a legacy screen outside Prevention Center, which is why the
  // routes never inherited the fiAuth designation gate. Writes are server-gated —
  // create/patch need an inspector, remove needs a prevention admin.
  permits: {
    // No `?today=` — the read-time expiry derivation is deleted (3.1b's stored ladder is
    // authoritative; the job owns every status flip). A read is just a read.
    list:   () => api.get('/api/fi-permits'),
    get:    (id) => api.get(`/api/fi-permits/${id}`),
    create: (b) => api.post('/api/fi-permits', b),
    patch:  (id, b) => api.patch(`/api/fi-permits/${id}`, b),
    remove: (id) => api.delete(`/api/fi-permits/${id}`),
    // ── the 3.1a lifecycle engine — the ONLY paths that move a permit's status ──────────
    // Each is a governed act on a legal instrument, not an edit, which is why each is its
    // own verb rather than a PATCH. All three are prevention-admin only, server-enforced.
    issue:     (id, b) => api.post(`/api/fi-permits/${id}/issue`, b),
    revoke:    (id, b) => api.post(`/api/fi-permits/${id}/revoke`, b),
    // Returns { terminated, successor } — a transfer MINTS a successor, it never edits the
    // predecessor. The successor is born Pending and goes through the issuance door itself.
    terminate: (id, b) => api.post(`/api/fi-permits/${id}/terminate`, b),
    // 3.1b — renewal. Returns { parent, renewal }. Like a transfer it MINTS a new permit
    // rather than editing the old one, but unlike a transfer it does NOT end the parent:
    // the parent keeps its status and runs its term out. Offered only while the parent is
    // AboutToExpire or Delinquent, and withdrawn at Expired.
    renew:     (id, b) => api.post(`/api/fi-permits/${id}/renew`, b),
  },
  // ── 3.1b: the department-authored catalogue ──────────────────────────────────────────
  // A type is a LINK HUB, not a bag of scalars — duration lives in an effective-dated rule
  // GROUP (term · notice window · grace), because neither documented platform carries a
  // scalar term on the type. Writes are prevention-admin, server-enforced.
  //
  // There is deliberately NO remove()/delete here, and that is not an oversight: a type with
  // issued permits is referenced by legal records. Retire it; the code frees up for a
  // successor, and permits issued under the old one still resolve.
  permitTypes: {
    list:   (includeRetired = false) =>
      api.get(`/api/fi-permit-types${includeRetired ? '?includeRetired=1' : ''}`),
    create: (b) => api.post('/api/fi-permit-types', b),
    patch:  (id, b) => api.patch(`/api/fi-permit-types/${id}`, b),
    retire: (id) => api.post(`/api/fi-permit-types/${id}/retire`, {}),
    // Clone-and-retire: the market's documented mechanic for versioning a TYPE. The
    // successor keeps the code and the predecessor is retired, never deleted.
    clone:  (id, b) => api.post(`/api/fi-permit-types/${id}/clone`, b || {}),
    ruleGroups: {
      list:       () => api.get('/api/fi-permit-types/rule-groups'),
      create:     (b) => api.post('/api/fi-permit-types/rule-groups', b),
      versions:   (id) => api.get(`/api/fi-permit-types/rule-groups/${id}/versions`),
      // Adding a version AUTO-CLOSES the prior one. Old versions are retained so "what did
      // the catalogue say on the day this permit was issued" always has an answer.
      addVersion: (id, b) => api.post(`/api/fi-permit-types/rule-groups/${id}/versions`, b),
    },
  },
  // The scheduled expiry job's run ledger + the R8 staleness verdict. The monitor is at the
  // market bar; the staleness flag is a deliberate departure — no platform we reached
  // documents detecting a job that STOPS FIRING.
  permitJobs: {
    runs: (limit) => api.get(`/api/permit-jobs/runs${limit ? `?limit=${limit}` : ''}`),
  },
  inspections: {
    list:   () => api.get('/api/fi-inspections'),
    get:    (id) => api.get(`/api/fi-inspections/${id}`),
    create: (b) => api.post('/api/fi-inspections', b),
    patch:  (id, b) => api.patch(`/api/fi-inspections/${id}`, b),
    complete: (id, b) => api.post(`/api/fi-inspections/${id}/complete`, b),
    answers: {
      get: (id) => api.get(`/api/fi-inspections/${id}/answers`),
      put: (id, checklistId, answers) => api.put(`/api/fi-inspections/${id}/answers`, { checklistId, answers }),
    },
    batchSchedule: (b) => api.post('/api/fi-inspections/batch-schedule', b),
    bulkAssign:    (b) => api.post('/api/fi-inspections/bulk-assign', b),
    // Hand a PENDING reinspection to another inspector (clerk/officer only, server-gated).
    reassign:      (id, b) => api.post(`/api/fi-inspections/${id}/reassign`, b),
    signatures: {
      // The body is the full outcome model (0053): {role, status, signerName,
      // signerRoleLabel, imageDataUrl, refusalReason, advisementsRead,
      // documentSha256, consentText, deviceLabel, gpsLat, gpsLng, gpsAccuracyM}.
      // A refusal carries NO image — it is a recorded event, not a missing row.
      list: (id) => api.get(`/api/fi-inspections/${id}/signatures`),
      add:  (id, b) => api.post(`/api/fi-inspections/${id}/signatures`, b),
    },
    // Service of notice — the ladder plus the DERIVED status the server computes
    // (pending | sufficient | action_required). Both list() and add() return
    // { data, status } so the Jones gate is never inferred client-side.
    service: {
      list: (id) => api.get(`/api/fi-inspections/${id}/service`),
      add:  (id, b) => api.post(`/api/fi-inspections/${id}/service`, b),
    },
    notices: {
      list:     (id) => api.get(`/api/fi-inspections/${id}/notices`),
      generate: (id, emailTo) => api.post(`/api/fi-inspections/${id}/notice`, emailTo ? { emailTo } : {}),
    },
  },
  // Per-service-record actions. Records are RETIRED, never deleted — they are
  // subpoenable, so void() takes a reason and the row stays on the ladder.
  service: {
    mailEvent: (sid, b) => api.post(`/api/fi-service/${sid}/mail-event`, b),
    void:      (sid, reason) => api.post(`/api/fi-service/${sid}/void`, { reason }),
  },
  reports: { openViolations: () => api.get('/api/fi-reports/open-violations') },
  // The end-of-day mailroom list: every generated notice + its property + served status.
  notices: { list: () => api.get('/api/fi-notices') },

  // ══ Module 3.2 — the money ledger (Slices A/B/C, migrations 0118–0126) ═══════════════
  //
  // ⚠️ EACH OF THESE IS AN OBJECT OF FUNCTIONS AND MUST STAY ONE. `fi.service` and
  // `fi.inspections.service` already coexist at different depths in this file, and the
  // repo carries a scar from `api.me()` being clobbered the day `api.me.notifsLastSeen`
  // was added. Never write `fi.invoices = () => …` and later hang a method off it.
  //
  // MONEY IS A STRING IN BOTH DIRECTIONS. The server's zod refuses a JSON number outright
  // (it does not coerce), and pg returns NUMERIC as a string. Do not route an amount
  // through Number() on its way to any of these calls — see ./money.js.
  //
  // SEPARATION OF DUTIES, mirrored from the routes: every GET here is requireInspector,
  // plus fees.calculate and fees.assess (an inspector may COMPUTE and PROPOSE). Every
  // other POST is requirePreventionAdmin. The server enforces regardless; this only
  // decides what we OFFER.

  fees: {
    schedules:   () => api.get('/api/fi-fee-schedules'),
    versions:    (scheduleId) => api.get(`/api/fi-fee-schedules/${scheduleId}/versions`),
    version:     (versionId) => api.get(`/api/fi-fee-schedules/versions/${versionId}`),
    createSchedule: (b) => api.post('/api/fi-fee-schedules', b),
    createVersion:  (scheduleId, b) => api.post(`/api/fi-fee-schedules/${scheduleId}/versions`, b),
    // Adoption FREEZES the version. There is no un-adopt and no revert-to-draft: the only
    // path onward is clone → edit → adopt a successor.
    adopt:       (versionId, b) => api.post(`/api/fi-fee-schedules/versions/${versionId}/adopt`, b),
    addItem:     (versionId, b) => api.post(`/api/fi-fee-schedules/versions/${versionId}/items`, b),
    patchItem:   (versionId, itemId, b) => api.patch(`/api/fi-fee-schedules/versions/${versionId}/items/${itemId}`, b),
    deleteItem:  (versionId, itemId) => api.delete(`/api/fi-fee-schedules/versions/${versionId}/items/${itemId}`),
    // Tiers and modifiers are POST-ONLY on the server — there is no PATCH and no DELETE,
    // even on a draft. Do not add edit/remove affordances for them; the button would be
    // refused every single time it was pressed.
    addTier:     (versionId, itemId, b) => api.post(`/api/fi-fee-schedules/versions/${versionId}/items/${itemId}/tiers`, b),
    addModifier: (versionId, itemId, b) => api.post(`/api/fi-fee-schedules/versions/${versionId}/items/${itemId}/modifiers`, b),
    // Dry run. Writes NOTHING, and works against a Draft — that is how a bureau checks a
    // rate table before adopting it.
    calculate:   (b) => api.post('/api/fi-fee-schedules/calculate', b),
    assessments: (q = {}) => api.get(`/api/fi-fee-schedules/assessments${qs(q)}`),
    assess:      (b) => api.post('/api/fi-fee-schedules/assessments', b),
    commit:      (id, b) => api.post(`/api/fi-fee-schedules/assessments/${id}/commit`, b),
    waive:       (id, b) => api.post(`/api/fi-fee-schedules/assessments/${id}/waive`, b),
  },

  invoices: {
    list:      (q = {}) => api.get(`/api/fi-invoices${qs(q)}`),
    get:       (id) => api.get(`/api/fi-invoices/${id}`),
    gapReport: () => api.get('/api/fi-invoices/gap-report'),
    create:    (b) => api.post('/api/fi-invoices', b),
    // An issued invoice is APPEND-ONLY. A correction is a NEW linked record carrying its
    // reason and approver; the original renders unchanged forever. There is no PATCH.
    adjust:    (id, b) => api.post(`/api/fi-invoices/${id}/adjust`, b),
    void:      (id, b) => api.post(`/api/fi-invoices/${id}/void`, b),
    // Dunning is DATE STAMPS ON THE INVOICE, never an engine. Each stamp is write-once and
    // nothing escalates on a timer — a human records that a notice went out.
    stamp:     (id, b) => api.post(`/api/fi-invoices/${id}/stamp`, b),
  },

  payments: {
    list:      (q = {}) => api.get(`/api/fi-payments${qs(q)}`),
    get:       (id) => api.get(`/api/fi-payments/${id}`),
    gapReport: () => api.get('/api/fi-payments/gap-report'),
    // Balance is DERIVED from the ledger (invoice − payments + refunds), never stored.
    // A NEGATIVE balance is legal: it is an overpayment, not an error.
    balances:  (q = {}) => api.get(`/api/fi-payments/balances${qs(q)}`),
    // Records money ALREADY RECEIVED — at a counter, by mail, or by the city's processor.
    // We are not the merchant of record and this never moves money.
    record:    (b) => api.post('/api/fi-payments', b),
    // An AUTHORISATION, not a disbursement: we record that a refund was authorised and by
    // whom. Finance disburses via AP. Note there is deliberately no `method` on a refund.
    refund:    (b) => api.post('/api/fi-payments/refund', b),
    void:      (id, b) => api.post(`/api/fi-payments/${id}/void`, b),
    exportCsv: (q = {}) => api.download(`/api/fi-payments/export${qs({ ...q, format: 'csv' })}`,
      'fi-transactions.csv'),
  },
};

/** Query string from a plain object, skipping empty values. '' when nothing is set. */
function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * useFiContext — mirrors middleware/fiAuth.js for UI gating ONLY (the server
 * remains the control): prevention admin = chief authority or a
 * prevention_admin designation; inspector = admin, an inspector designation,
 * or the crew-inspections toggle.
 */
export function useFiContext(user) {
  const [state, setState] = useState({ loading: true, settings: null, designations: [], error: null });

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([fi.settings.get(), fi.designations.list()]);
      setState({ loading: false, settings: s.data, designations: d.data ?? [], error: null });
    } catch (e) {
      setState((prev) => ({ ...prev, loading: false, error: e.message || 'Failed to load prevention settings' }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const mine = (role) => state.designations.some(
    (d) => String(d.user_id) === String(user?.id) && d.role === role);
  const chiefLevel = (ROLES[user?.role]?.level ?? 0) >= 3;
  const isPreventionAdmin = chiefLevel || mine('prevention_admin');
  const isInspector = isPreventionAdmin || mine('inspector') || state.settings?.allow_crew_inspections === true;

  return { ...state, isPreventionAdmin, isInspector, isChief: chiefLevel, reload: load };
}
