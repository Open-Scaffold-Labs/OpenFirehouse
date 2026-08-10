// prevention/InspectionRunner.jsx — the inspection runner (Phase 3 §3.2), the
// hero surface. Incumbent-verified flow: property dossier first (doorway flags)
// → Begin → Yes/No/NA checklist (counters, search, group actions) → violation
// dialog with the code pre-bound → completion summary (reinspection toggle ON
// with a pre-computed date) → occupant-then-inspector signatures → serve the
// notice (view / email / print) before leaving the parking lot.
//
// Answer + violation state persists to the server AS THE INSPECTOR WORKS —
// navigation or a dead battery never loses a walkthrough (risk U3).
//
// ── OFFLINE FIELD OPS (Phase 3.6, Slices B3 + C) ─────────────────────────────
// There is NO "offline mode" and no toggle to forget. Every write in this runner goes
// through the outbox (lib/offline/useOffline) — online it drains in milliseconds and the
// inspector never notices; in a basement it queues and the inspector still never notices.
// The only thing that changes is what the header SAYS, and it says the truth (R9).
//
//   · WRITE-THROUGH (R13): every field change lands in IndexedDB immediately. Nothing
//     lives only in React state, so a killed tab loses nothing.
//   · READS (R15): network first, the pre-downloaded day as the fallback, with the
//     device's own un-synced work overlaid on top. The UI never shows less than the
//     inspector has actually done.
//   · THE NOTICE (TRAP 1): offline it is rendered ON DEVICE and THOSE BYTES are the
//     served instrument — printed, hashed, and uploaded verbatim. Never re-rendered.
//   · THE JONES GATE (TRAP 2): computed on device from the SHARED pure module, never
//     re-implemented, never faked.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, ClipboardList, FileSignature, FileText, ChevronLeft, Check, X as XIcon,
  Minus, Search, Camera, AlertTriangle, Plus, Mail, ExternalLink, CircleCheck,
  MapPin, Ban, CloudOff, RefreshCw, Download,
} from 'lucide-react';
import { fi, localToday } from './fiApi';
import { api, getToken } from '../../utils/api';
import { INSPECTION_RESULTS, VIOLATION_STATUSES, isResolvedViolationStatus,
         IN_FORCE_PERMIT_STATUSES } from '../../data/fireInspections';
import { Field, Input, TextArea, Select, Btn, Modal, Badge, Spinner, EmptyState } from './ui';
import SignaturePad from './SignaturePad';
import { useOffline } from '../../lib/offline/useOffline';
import { cacheGet, cachePut, OUTBOX, idbAll } from '../../lib/offline/db';
import { buildNoticePdf, bytesToBase64, unconfiguredNoticeBlocks } from '../../lib/offline/noticePdf';
// TRAP 2 — the Jones gate is a GENERATED mirror of the server's pure module. It is imported,
// never re-implemented: if the two ever disagreed, an inspector would read "SERVED" for a
// notice the server holds at action_required.
import { serviceStatus } from '../../lib/shared/serviceOfNotice';

const SAMPLE_AGREEMENT =
  'SAMPLE — review with your AHJ: My signature acknowledges receipt of this inspection report and any attached notice of violations. It is not an admission of guilt.';

// The three advisements the inspector reads ALOUD when the occupant refuses to
// sign. Refusal is not a failure state — it is a recorded event, and these three
// sentences are what make the record hold up. A department may replace them
// wholesale (fi_settings.refusal_advisement_text); until it does, they are SAMPLE.
const SAMPLE_REFUSAL_ADVISEMENT = [
  'An acknowledgment of receipt is not an agreement with the findings.',
  'Refusing to sign does not affect your obligation to correct the violations within the times specified.',
  'Your refusal will be recorded in this report.',
];

const SIGNER_ROLE_LABELS = ['Owner', 'Agent', 'Operator', 'Occupant', 'Manager', 'Other'];

// Mirrors server utils/serviceOfNotice.js — keep the wording in step with it; the
// notice PDF prints these same phrases.
const METHOD_LABELS = {
  personal_service:             'Personal service',
  left_with_responsible_person: 'Left with a person of responsibility on the premises',
  posted_premises:              'Posted in a conspicuous place at the premises',
  certified_mail:               'Certified mail, return receipt requested',
  first_class_mail:             'First-class mail',
  certificate_of_mailing:       'Certificate of mailing',
  email:                        'Electronic mail',
};
const OUTCOME_LABELS = {
  served:               'Served',
  refused_signature:    'Served — declined to sign an acknowledgment of receipt',
  refused_acceptance:   'Served — declined to accept the document, which was left with them',
  no_party_present:     'No responsible party present',
  mailed:               'Deposited in the mail, postage prepaid',
  accepted:             'Accepted by the Postal Service',
  delivered:            'Delivered',
  returned_undelivered: 'RETURNED UNDELIVERED',
  unclaimed:            'RETURNED UNCLAIMED',
  posted:               'Posted at the premises',
};
const PERSONAL_METHODS = ['personal_service', 'left_with_responsible_person'];
const MAIL_METHODS = ['certified_mail', 'first_class_mail', 'certificate_of_mailing'];

const OPEN = (v) => v?.status === 'Open' || v?.status === 'Time Extension';

/**
 * Best-effort GPS for a SIGNATURE. Provenance, not a gate — a signature is valid
 * without a fix, so we take one if the device offers it inside 5 s and move on if
 * it doesn't. Never leave an inspector standing in a doorway waiting on a
 * permission prompt. (A POSTING is the opposite — there the fix is required.)
 */
function bestEffortGps() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => finish(null), 5000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(timer); finish({ gpsLat: p.coords.latitude, gpsLng: p.coords.longitude, gpsAccuracyM: p.coords.accuracy }); },
      () => { clearTimeout(timer); finish(null); },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 },
    );
  });
}

// ── offline plumbing shared by the runner's steps ────────────────────────────

/** Everything this device knows about ONE inspection that the server does not yet. */
const localKey = (id) => `insp:${id}`;

/**
 * A new violation gets its permanent id HERE, on the device. The server's
 * normalizeViolation() would mint one on the write path — but offline there is no write
 * path for hours, and the id is what evidence photos are stored under
 * ({dept}/{inspection}/{violationId}/…). A client-minted UUID is stable from the moment of
 * citation, survives the sync, and (being carried in the payload) is idempotent on replay.
 */
const newViolationId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`);

const olderThan = (iso, ms) => !!iso && (Date.now() - new Date(iso).getTime()) > ms;

const agoLabel = (iso) => {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`;
};

/**
 * (R9) THE HONEST STATUS STRIP. We shipped a lie once — "⚠ Save failed — retrying on next
 * change" when nothing retried — and it is not happening again. Every word below comes from
 * syncCore's syncSummary(), which is written to never claim behavior we do not perform.
 */
function SyncStrip({ off }) {
  const { summary, lastSyncedAt } = off;
  const synced = agoLabel(lastSyncedAt);
  return (
    <span className="text-xs font-semibold text-red-100 text-right shrink-0" role="status" aria-live="polite">
      {summary.label}
      {/* (M7/M8) was red-200 on red-700 at 11px = 4.47:1 — under AA, and unreadable at
          arm's length in sun. red-100 = 5.3:1, and text-xs is the floor for a status. */}
      {synced && <span className="block text-xs font-normal text-red-100">Synced {synced}</span>}
    </span>
  );
}

/**
 * The banners that must be impossible to miss. Order is deliberate: a REJECTION (work the
 * server refused) outranks everything, then the storage warning, then the calm offline note.
 */
// (B3) The rejected panel MUST be scoped to THIS inspection.
// It used to read the whole outbox: a rejection from another property raised a
// blocking panel on top of an unrelated walkthrough, the "Copy my notes" export was
// mislabelled with the wrong inspection number, and — worst — "I have recovered this
// work — clear it" hard-deleted rejected entries belonging to inspections the officer
// had never even seen. Work destroyed by a button that says it was recovered. Never.
// (M6) The outbox speaks in op codes. An inspector speaks in findings and signatures.
const OP_LABEL = {
  'answers.put':       'Your checklist answers',
  'inspection.patch':  'Your findings and notes',
  'signature.add':     'A signature you captured',
  'service.add':       'A service record',
  'service.mailEvent': 'A mail result you recorded',
  'notice.upload':     'The notice you served',
  'photo.upload':      'An evidence photo',
};

function OfflineBanners({ off, inspectionId, onCopyWork }) {
  const { online, summary, storage, syncNow, dayFetchedAt } = off;
  const rejected = (off.rejected || []).filter((e) => e.inspectionId === inspectionId);
  const dayStale = olderThan(dayFetchedAt, 24 * 3600 * 1000); // (R12) stale cache, said out loud

  // (M5) A blocking panel the officer can scroll away from is not blocking. Bring it
  // to them once, when it appears — sighted users get no other signal mid-checklist.
  const rejectRef = React.useRef(null);
  const seen = React.useRef(0);
  React.useEffect(() => {
    if (rejected.length && rejected.length !== seen.current) {
      rejectRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      rejectRef.current?.focus?.();
    }
    seen.current = rejected.length;
  }, [rejected.length]);

  return (
    <>
      {/* (R8/R4) The server applied a RULE to work this device already did. Say exactly what
          happened, and never discard it — the inspector must be able to get their words back. */}
      {rejected.length > 0 && (
        <div role="alert" tabIndex={-1} ref={rejectRef}
          className="rounded-2xl border-4 border-red-600 dark:border-red-500 bg-red-50 dark:bg-red-950 p-5 space-y-3">
          <p className="flex items-center gap-2 text-lg font-extrabold text-red-800 dark:text-red-200">
            <AlertTriangle size={22} aria-hidden="true" />
            {rejected.length} change{rejected.length === 1 ? '' : 's'} could not be saved to the record
          </p>
          <p className="text-sm font-semibold text-red-900 dark:text-red-200">
            The work below is still on this device and has NOT been thrown away. Retrying will not help —
            the server refused it for the reason given. Copy what you need, then redo it on the record that is now current.
          </p>
          <ul className="space-y-2">
            {rejected.map((e) => (
              <li key={e.clientId} className="rounded-xl bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900 p-3 text-sm">
                <p className="font-bold text-red-800 dark:text-red-300">{e.lastError || 'Rejected by the server'}</p>
                {/* (M6) An inspector cannot act on "inspection.patch". Say it in their words. */}
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                  {OP_LABEL[e.op] || e.op} · recorded {new Date(e.clientRecordedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" className="min-h-[64px]" onClick={onCopyWork}>Copy my notes</Btn>
            {/* (B3) Clears ONLY this inspection's rejections, and only after a confirm.
                This is an irreversible delete of the officer's own words. */}
            <Btn className="min-h-[64px]" onClick={() => {
              const ok = window.confirm(
                `Clear ${rejected.length} rejected change${rejected.length === 1 ? '' : 's'} for this inspection?\n\n` +
                'This permanently deletes the work from this device. Copy it first if you have not.');
              if (!ok) return;
              rejected.forEach((e) => off.dismissRejected(e.clientId));
            }}>
              I have recovered this work — clear it
            </Btn>
          </div>
        </div>
      )}

      {/* (R1) iOS can evict non-persistent storage. If the browser refused persistence, the
          inspector's day is at risk and they get to know that BEFORE it costs them. */}
      {storage.persisted === false && (
        <p role="alert" className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3 text-sm font-semibold text-amber-900 dark:text-amber-200">
          This browser may clear saved work when storage runs low — it declined to keep it permanently.
          Sync as soon as you have signal.
        </p>
      )}
      {storage.error && (
        <p role="alert" className="rounded-2xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm font-semibold text-red-800 dark:text-red-300">
          {storage.error} Offline work cannot be saved on this device — stay on signal.
        </p>
      )}

      {/* Offline is NOT an error state. The inspector is SUPPOSED to be able to work here. */}
      {!online && (
        <div role="status" aria-live="polite" className="rounded-2xl border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-4">
          <p className="flex items-center gap-2 font-bold text-gray-800 dark:text-gray-200">
            <CloudOff size={18} aria-hidden="true" /> Offline — keep working.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Everything is saved on this device and will sync when you have signal.
            {summary.pending > 0 && ` ${summary.pending} change${summary.pending === 1 ? '' : 's'} waiting.`}
          </p>
          {dayStale && (
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mt-1">
              This inspection was last synced {agoLabel(dayFetchedAt)} — it may not reflect changes made at the office since.
            </p>
          )}
        </div>
      )}

      {online && summary.pending > 0 && (
        <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{summary.label}</p>
          <Btn className="min-h-[44px]" onClick={() => syncNow()}>
            <RefreshCw size={15} aria-hidden="true" /> Sync now
          </Btn>
        </div>
      )}
    </>
  );
}

// ── photos ───────────────────────────────────────────────────────────────────
// (R11) A photo is written to IndexedDB AT CAPTURE and the outbox holds only a reference.
// The grid shows the server's photos AND the ones still on this device, labelled honestly —
// an inspector must never wonder whether the shot they just took survived.
function ViolationPhotos({ inspectionId, violationId, off }) {
  const [remote, setRemote] = useState(null);
  const [local, setLocal] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const loadLocal = useCallback(async () => {
    const rows = await off.photosFor(violationId);
    setLocal(rows.map((r) => ({ id: r.id, url: URL.createObjectURL(r.blob) })));
  }, [off, violationId]);

  const loadRemote = useCallback(async () => {
    if (!off.online) { setRemote([]); return; }
    try {
      const r = await api.get(`/api/fi-inspections/${inspectionId}/photos?violationId=${encodeURIComponent(violationId)}`);
      setRemote(r.data ?? []);
    } catch {
      // Not fatal and not a lie: the photos we hold on device are still shown below.
      setRemote([]);
    }
  }, [inspectionId, violationId, off.online]);

  useEffect(() => { loadRemote(); loadLocal(); }, [loadRemote, loadLocal]);
  // Object URLs are a leak if we don't hand them back.
  useEffect(() => () => local.forEach((p) => URL.revokeObjectURL(p.url)), [local]);

  const add = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      await off.enqueuePhoto(inspectionId, violationId, file);
      await loadLocal();
    } catch (ex) {
      // (R2) The quota pre-flight refuses BEFORE the write fails, so this message is true:
      // the photo was not saved, and the inspector can act on that while still on scene.
      setErr(ex.message);
    } finally { setBusy(false); }
  };

  const shots = [...(remote ?? []).map((p) => ({ ...p, pending: false })), ...local.map((p) => ({ ...p, pending: true }))];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Evidence photos</span>
        <label className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 cursor-pointer">
          <Camera size={16} aria-hidden="true" /> {busy ? 'Saving…' : 'Add photo'}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={add} disabled={busy} />
        </label>
      </div>
      {err && <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2" role="alert">{err}</p>}
      {remote === null && !local.length ? <p className="text-sm text-gray-600 dark:text-gray-400">Loading photos…</p>
        : shots.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">No photos yet.</p>
          : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {shots.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer"
                  className={`relative block aspect-square rounded-lg overflow-hidden border ${p.pending ? 'border-amber-400 dark:border-amber-700' : 'border-gray-200 dark:border-gray-700'}`}>
                  <img src={p.url} alt="Violation evidence" className="w-full h-full object-cover" />
                  {/* (M7) white on amber-500/90 OVER A PHOTO was 2.15:1 — a hard AA fail,
                      on the very badge that says this evidence is NOT uploaded yet.
                      amber-900 gives 8.7:1 and stays legible against any photo. */}
                  {p.pending && (
                    <span className="absolute bottom-0 inset-x-0 bg-amber-900/95 text-xs font-bold text-white text-center">
                      On this device
                    </span>
                  )}
                </a>
              ))}
            </div>
          )}
    </div>
  );
}

// ── violation dialog ─────────────────────────────────────────────────────────
function ViolationDialog({ initial, codes, onSave, onClose, inspectionId, off, readOnly = false }) {
  const [form, setForm] = useState(initial);
  const [codeQ, setCodeQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const savedId = initial.id || null;

  const filteredCodes = useMemo(() => {
    const needle = codeQ.trim().toLowerCase();
    const active = codes.filter((c) => c.active);
    if (!needle) return active.slice(0, 50);
    return active.filter((c) => [c.code, c.title, c.category].some((v) => String(v || '').toLowerCase().includes(needle))).slice(0, 50);
  }, [codes, codeQ]);

  const pickCode = (c) => setForm((f) => ({
    ...f, code: c.code,
    description: f.description?.trim() ? f.description : c.title,
  }));

  const save = async () => {
    setSaving(true); setErr(null);
    try { await onSave(form); } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={savedId ? 'Edit violation' : 'Cite a violation'} onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <span className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Code</span>
          {form.code
            ? (
              <div className="flex items-center gap-2 flex-wrap">
                {/* DECISION A (2026-07-16): the section IS the code — ONE identifier,
                    composed as "IFC 2021 §906.1". Deep-link to the FREE OFFICIAL text.
                    Display-only — the link never enters the record. */}
                {(() => {
                  const sel = codes.find((c) => c.code === form.code);
                  const label = sel?.section
                    ? `${sel.edition ? `${sel.edition} ` : ''}§${sel.section}`
                    : form.code;
                  return (
                    <>
                      <Badge tone="red">{label}</Badge>
                      {sel?.link_url && (
                        <a
                          href={sel.link_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm underline text-blue-700 dark:text-blue-400"
                        >
                          View official text <ExternalLink size={14} aria-hidden="true" />
                        </a>
                      )}
                    </>
                  );
                })()}
                <button className="text-sm underline text-gray-600 dark:text-gray-300" onClick={() => setForm({ ...form, code: '' })}>change</button>
              </div>
            )
            : (
              <div>
                <div className="relative mb-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <Input autoFocus aria-label="Search the code library" placeholder="Search the code library…" value={codeQ} onChange={(e) => setCodeQ(e.target.value)} className="pl-9" />
                </div>
                <ul className="max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                  {filteredCodes.map((c) => (
                    <li key={c.id}>
                      <button className="w-full text-left px-3 py-2 min-h-[44px] hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => pickCode(c)}>
                        {/* DECISION A: one identifier per row — "IFC 2021 §906.1", never a
                            synthetic index next to the real section. */}
                        <span className="font-mono font-bold text-red-700 dark:text-red-400 mr-2">
                          {c.section ? `${c.edition ? `${c.edition} ` : ''}§${c.section}` : c.code}
                        </span>
                        <span className="text-gray-800 dark:text-gray-200">{c.title}</span>
                      </button>
                    </li>
                  ))}
                  {/* An EMPTY library and a search that MISSED are different facts —
                      saying "no matching codes" before a query is even typed reads
                      like a failure (found 2026-07-13). */}
                  {filteredCodes.length === 0 && (
                    <li className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {codes.length === 0
                        ? 'No codes in the library yet — cite without one, or add your department’s codes in Settings › Codes.'
                        : 'Nothing matches that search — cite without a code, or add it in Settings › Codes.'}
                    </li>
                  )}
                </ul>
              </div>
            )}
        </div>
        <Field label="Description">
          <TextArea rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {/* Severity RETIRED 2026-07-14 — fire inspection has no severity grade. A
            condition is an IMMINENT HAZARD (below) or an ordinary violation with a
            correct-by date. Two columns now, not three. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Correct by">
            <Input type="date" value={form.followUpDate || ''} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 min-h-[44px] font-semibold text-red-700 dark:text-red-400">
              <input type="checkbox" className="h-5 w-5 rounded accent-red-600" checked={!!form.imminentHazard}
                onChange={(e) => setForm({ ...form, imminentHazard: e.target.checked })} />
              <AlertTriangle size={16} aria-hidden="true" /> Imminent hazard
            </label>
          </div>
        </div>
        <Field label="Inspector notes">
          <TextArea rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        {savedId
          ? <ViolationPhotos inspectionId={inspectionId} violationId={savedId} off={off} />
          : <p className="text-sm text-gray-500 dark:text-gray-400">Save the violation first — then photos attach to its permanent record id.</p>}
        {err && <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>{savedId || readOnly ? 'Done' : 'Cancel'}</Btn>
          {/* A finalized record's findings are read-only — the evidence stays
              viewable, but nothing here can be rewritten. (2026-07-13) */}
          {!readOnly && (
            <Btn variant="primary" disabled={saving || !(form.description || '').trim()} onClick={save}>
              {saving ? 'Saving…' : 'Save violation'}
            </Btn>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── the runner ───────────────────────────────────────────────────────────────
export default function InspectionRunner({ inspectionId, user, fiCtx, onExit }) {
  const [phase, setPhase] = useState('dossier');
  const [data, setData] = useState(null); // {inspection, property, permits, history, checklist, codes}
  const [answers, setAnswers] = useState([]);
  const [answerQ, setAnswerQ] = useState('');
  const [dialog, setDialog] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [completedInfo, setCompletedInfo] = useState(null);
  // (B4) Holds the rejected work as TEXT when the clipboard refuses it, so the officer
  // can still read and save their own words rather than losing them to a failed copy.
  const [recovery, setRecovery] = useState(null);
  // TWO error channels, deliberately separate (2026-07-13). `fatalErr` is a
  // load failure — there is no inspection to show, so the full-screen takeover
  // is correct. `err` is a RECOVERABLE error inside a dialog. Sharing one state
  // meant a missing reinspection date nuked the whole runner mid-walkthrough and
  // the inspector lost the inspection they were standing in. Never again.
  const [fatalErr, setFatalErr] = useState(null);
  const [err, setErr] = useState(null);

  const off = useOffline();
  // The work THIS inspection still owes the server. It is what decides whether the device's
  // own state or the server's is the truth on screen (R15) — and it is what the honest
  // header counts.
  const queuedHere = useMemo(
    () => off.pending.filter((e) => e.inspectionId === inspectionId),
    [off.pending, inspectionId],
  );
  const hadQueued = useRef(false);
  // P2-4/P2-2 (2026-07-16): a completed record opens at the paperwork step ONCE, on first
  // load. load() re-runs on every refetch (recording service triggers one) — without this
  // guard, each refetch snapped the active step back to Signatures, bouncing the inspector
  // off the Notice step they were working. Redirect only when the phase hasn't moved yet.
  const didInitialPhase = useRef(false);

  /** Write-through (R13): the device's copy of this inspection, updated on EVERY change. */
  const writeLocal = useCallback(async (mutate) => {
    const prev = (await cacheGet(localKey(inspectionId))) || {};
    const next = mutate(prev);
    await cachePut(localKey(inspectionId), next);
    return next;
  }, [inspectionId]);

  /**
   * Rebuild the runner from the PRE-DOWNLOADED DAY (GET /api/fi-sync/day, cached at the
   * firehouse). This is what makes a basement workable at all. Permits are the one dossier
   * nicety the day payload does not carry — they are not part of the record, so their
   * absence is stated by their absence, never faked.
   */
  const fromDay = useCallback((day) => {
    const inspection = (day?.inspections ?? []).find((i) => i.id === inspectionId);
    if (!inspection) return null;
    const codes = day.codeLibrary ?? [];
    const property = (day.properties ?? []).find((p) => p.id === inspection.propertyId) || null;
    const history = (day.history ?? []).filter((h) => h.propertyId === inspection.propertyId && h.id !== inspection.id);
    const type = (day.inspectionTypes ?? []).find((t) => t.name === inspection.type);
    const cl = type?.default_checklist_id
      ? (day.checklists ?? []).find((c) => c.id === type.default_checklist_id) : null;
    // The day ships raw checklist_items (no code join) — resolve ref_code/ref_title from the
    // cached library so the offline walkthrough pre-binds codes exactly like the online one.
    const checklist = cl ? {
      ...cl,
      items: (day.checklistItems ?? [])
        .filter((i) => i.checklist_id === cl.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((i) => {
          const code = codes.find((c) => c.id === i.code_ref_id);
          return { ...i, ref_code: code?.code || '', ref_title: code?.title || '' };
        }),
    } : null;
    return {
      inspection, property, checklist, codes, history, permits: [],
      settings: day.settings ?? null,
      savedAnswers: (day.answers ?? []).filter((a) => a.inspection_id === inspectionId),
      signatures: (day.signatures ?? []).filter((s) => s.inspection_id === inspectionId),
      service: (day.service ?? []).filter((s) => s.inspection_id === inspectionId),
      serverStatus: null,
      fromCache: true,
    };
  }, [inspectionId]);

  const fromServer = useCallback(async () => {
    const [insp, props, permits, allInsp, types, codes, sigs, svc] = await Promise.all([
      fi.inspections.get(inspectionId), fi.properties.list(), fi.permits.list(),
      fi.inspections.list(), fi.types.list(), fi.codes.list(),
      fi.inspections.signatures.list(inspectionId),
      fi.inspections.service.list(inspectionId),
    ]);
    const inspection = insp.data;
    const property = (props.data ?? []).find((p) => p.id === inspection.propertyId) || null;
    const history = (allInsp.data ?? []).filter((i) => i.propertyId === inspection.propertyId && i.id !== inspection.id);
    const type = (types.data ?? []).find((t) => t.name === inspection.type);
    let checklist = null;
    if (type?.default_checklist_id) {
      try { checklist = (await fi.checklists.get(type.default_checklist_id)).data; } catch { checklist = null; }
    }
    let savedAnswers = [];
    try { savedAnswers = (await fi.inspections.answers.get(inspection.id)).data ?? []; } catch { savedAnswers = []; }
    return {
      inspection, property, checklist,
      codes: codes.data ?? [],
      permits: (permits.data ?? []).filter((p) => p.propertyId === inspection.propertyId),
      history,
      settings: fiCtx.settings ?? null,
      savedAnswers,
      signatures: sigs.data ?? [],
      service: svc.data ?? [],
      serverStatus: svc.status ?? null,   // TRAP 2: online, the SERVER's verdict wins
      fromCache: false,
    };
  }, [inspectionId, fiCtx.settings]);

  const load = useCallback(async () => {
    // Network first; the pre-downloaded day is the fallback. A failure here is not fatal as
    // long as the device holds the day — that is the entire promise of the slice.
    let base = null;
    let netErr = null;
    if (off.online) {
      try { base = await fromServer(); } catch (e) { netErr = e; }
    }
    if (!base) {
      const day = await cacheGet('day').catch(() => null);
      base = fromDay(day);
      if (!base) {
        throw netErr || new Error(
          'This inspection is not on this device and there is no signal. Reconnect once to load it — then it works offline.',
        );
      }
    }

    // ── the device's own un-synced work, overlaid on top (R15) ─────────────────
    // ONLY while it is still owed to the server. Once the outbox is drained the server IS
    // the truth, and holding a stale local copy over it would be its own lie.
    const outbox = await idbAll(OUTBOX).catch(() => []);
    const stillQueued = new Set(outbox.filter((e) => e.inspectionId === inspectionId).map((e) => e.clientId));
    const local = (await cacheGet(localKey(inspectionId)).catch(() => null)) || {};
    const localOwed = [...stillQueued].length > 0;

    const inspection = localOwed && local.inspection
      ? { ...base.inspection, ...local.inspection }
      : base.inspection;
    const signatures = [
      ...base.signatures,
      ...(local.signatures ?? []).filter((s) => stillQueued.has(s.client_id)),
    ];
    const service = [
      ...base.service,
      ...(local.service ?? []).filter((s) => stillQueued.has(s.client_id)),
    ];

    const items = base.checklist?.items ?? [];
    const localAnswers = localOwed ? local.answers : null;
    setAnswers(items.map((it, idx) => {
      if (Array.isArray(localAnswers)) return localAnswers[idx] ?? null;
      const match = base.savedAnswers.find((s) => s.position === idx && s.prompt === it.prompt)
        || base.savedAnswers.find((s) => s.prompt === it.prompt);
      return match?.answer ?? null;
    }));

    setData({
      ...base, inspection, signatures, service,
      notices: local.notices ?? [],           // the notices this device rendered and served
      documentSha256: local.documentSha256 ?? null,
    });
    if (inspection.completedDate && !didInitialPhase.current) {
      setPhase('sign'); // resume a completed record at the paperwork — first load only
    }
    didInitialPhase.current = true;
  }, [off.online, fromServer, fromDay, inspectionId]);

  useEffect(() => { load().catch((e) => setFatalErr(e.message)); }, [load]);

  // (R15) The drain succeeded and this inspection owes the server nothing — refetch so the
  // screen shows the SERVER's rows (with their real ids and server-authoritative
  // timestamps) instead of our optimistic ones. Without this the inspector could redo work
  // that already landed.
  useEffect(() => {
    if (queuedHere.length > 0) { hadQueued.current = true; return; }
    if (hadQueued.current && off.online) {
      hadQueued.current = false;
      load().catch(() => {});
    }
  }, [queuedHere.length, off.online, load]);

  /**
   * The ONE inspection write. inspection.patch is a FULL-REPLACE op (syncCore collapses all
   * but the last per inspection), so a patch carrying only `notes` would silently discard a
   * queued `violations` patch. We therefore always send BOTH fields — the collapsed survivor
   * then carries everything the device has changed.
   */
  const patchInspection = useCallback(async (fields) => {
    const nextInspection = { ...data.inspection, ...fields };
    setData((d) => ({ ...d, inspection: nextInspection }));
    await writeLocal((prev) => ({
      ...prev,
      inspection: { ...(prev.inspection || {}), ...fields },
    }));
    await off.enqueue('inspection.patch', inspectionId, {
      violations: nextInspection.violations || [],
      notes: nextInspection.notes ?? '',
    });
    return nextInspection;
  }, [data, writeLocal, off, inspectionId]);

  /**
   * (R13) WRITE-THROUGH, with NO debounce. The old 700 ms timer only delayed the network
   * call — but the outbox entry IS the record of "the server does not have this yet", and a
   * tab killed inside that window would leave the tap on the device with nothing owing it to
   * the server. So every tap queues immediately; syncCore collapses the 40 resulting
   * `answers.put` ops into the one that is true, and the drain lock is what keeps the
   * network calm. Nothing is throttled at the cost of durability.
   */
  const persistAnswers = useCallback((nextAnswers) => {
    if (!data?.checklist) return;
    writeLocal((prev) => ({ ...prev, answers: nextAnswers })).catch((e) => setErr(e.message));
    const items = data.checklist.items ?? [];
    const payload = items
      .map((it, idx) => ({ itemId: it.id, prompt: it.prompt, code: it.ref_code || '', answer: nextAnswers[idx] }))
      .filter((a) => a.answer);
    off.enqueue('answers.put', inspectionId, { checklistId: data.checklist.id, answers: payload })
      .catch((e) => setErr(e.message));
  }, [data, off, writeLocal, inspectionId]);

  const setAnswer = (idx, val) => {
    setAnswers((prev) => {
      const next = prev.map((a, i) => (i === idx ? val : a));
      persistAnswers(next);
      return next;
    });
    if (val === 'no') {
      const it = data.checklist.items[idx];
      setDialog({
        code: it.ref_code || '',
        description: it.ref_code ? (it.ref_title || it.prompt) : it.prompt,
        status: 'Open', followUpDate: '', notes: '', imminentHazard: false,
      });
    }
  };

  const saveViolation = async (form) => {
    const current = data.inspection.violations || [];
    // The id is minted HERE (see newViolationId) so a violation cited in a basement has a
    // permanent identity photos can hang off immediately — no round trip required.
    const saved = form.id ? form : { ...form, id: newViolationId(), status: form.status || 'Open' };
    const next = form.id
      ? current.map((v) => (v.id === form.id ? { ...v, ...form } : v))
      : [...current, saved];
    await patchInspection({ violations: next });
    // Reopen the dialog on the saved violation (now carrying its permanent id) for photos.
    setDialog(form.id ? null : saved);
  };

  const setViolationStatus = async (violation, status) => {
    const next = (data.inspection.violations || []).map((v) => (v.id === violation.id ? { ...v, status } : v));
    await patchInspection({ violations: next });
  };

  const stampDoorway = async (flag) => {
    const stamp = `[${localToday()}] ${flag} — noted at doorway by ${user?.name || user?.username || 'inspector'}.`;
    const notes = data.inspection.notes ? `${data.inspection.notes}\n${stamp}` : stamp;
    await patchInspection({ notes });
  };

  /** A signature the device took. Server ids and signed_at are the SERVER's on sync — this
   *  optimistic row exists so the officer can see, print, and serve what they just captured. */
  const addSignature = useCallback(async (body) => {
    const entry = await off.enqueue('signature.add', inspectionId, body);
    const row = {
      id: `local:${entry.clientId}`, client_id: entry.clientId, inspection_id: inspectionId,
      role: body.role, status: body.status,
      signer_name: body.signerName || '', signer_role_label: body.signerRoleLabel || '',
      refusal_reason: body.refusalReason || '', advisements_read: !!body.advisementsRead,
      document_sha256: body.documentSha256 || '',
      signed_at: entry.clientRecordedAt,   // the DEVICE's clock, and labelled as un-synced
      has_image: body.status === 'signed',
      _pending: true,
    };
    await writeLocal((prev) => ({ ...prev, signatures: [...(prev.signatures ?? []), row] }));
    setData((d) => ({ ...d, signatures: [...d.signatures, row] }));
    return row;
  }, [off, inspectionId, writeLocal]);

  /** A service record the device took. Same doctrine as a signature. */
  const addService = useCallback(async (body) => {
    const entry = await off.enqueue('service.add', inspectionId, body);
    const live = data.service.filter((s) => !s.voided_at);
    const row = {
      id: `local:${entry.clientId}`, client_id: entry.clientId, inspection_id: inspectionId,
      method: body.method, outcome: body.outcome, attempt_seq: live.length + 1,
      served_at: entry.clientRecordedAt, served_by: user?.name || user?.username || '',
      servee_name: body.serveeName || '', servee_relationship: body.serveeRelationship || '',
      address_used: body.addressUsed || '', address_source: body.addressSource || '',
      posting_lat: body.postingLat ?? null, posting_lng: body.postingLng ?? null,
      posting_accuracy_m: body.postingAccuracyM ?? null,
      posting_location_desc: body.postingLocationDesc || '',
      has_posting_photo: !!body.postingPhotoDataUrl,
      mail_class: body.mailClass || '', mail_tracking_number: body.mailTrackingNumber || '',
      notes: body.notes || '', voided_at: null,
      _pending: true,
    };
    await writeLocal((prev) => ({ ...prev, service: [...(prev.service ?? []), row] }));
    setData((d) => ({ ...d, service: [...d.service, row] }));
    return row;
  }, [off, inspectionId, writeLocal, data, user]);

  /**
   * A mail event lands on a SERVER service row (the op payload keys on its server id), so it
   * can only be recorded against a record that has synced. We do not fabricate an id for a
   * row the server has never seen — the UI simply does not offer the buttons until it has.
   */
  const addMailEvent = useCallback(async (record, event) => {
    await off.enqueue('service.mailEvent', inspectionId, { serviceId: record.id, event });
    const outcome = event === 'accepted' ? 'accepted' : event;
    const patch = { outcome, ...(event === 'returned_undelivered' || event === 'unclaimed'
      ? { mail_returned_at: new Date().toISOString() } : {}) };
    setData((d) => ({
      ...d,
      service: d.service.map((s) => (s.id === record.id ? { ...s, ...patch } : s)),
    }));
    // The event may land on a SERVER row, so the local overlay must remember it too —
    // otherwise a reload offline would show the mailing as still outstanding and the Jones
    // gate would silently reopen.
    await writeLocal((prev) => ({
      ...prev,
      mailEvents: { ...(prev.mailEvents || {}), [record.id]: patch },
    }));
  }, [off, inspectionId, writeLocal]);

  /**
   * (TRAP 1) A notice was rendered ON DEVICE and is being served. We remember the hash of
   * THOSE EXACT BYTES — it is what the server will verify the upload against, and it is what
   * any signature taken against this document must be associated with (ESIGN §7001(e) /
   * UETA §§9,12). The bytes themselves live in IndexedDB until the outbox drains them.
   */
  const registerDeviceNotice = useCallback(async (notice) => {
    const meta = {
      clientId: notice.clientId, sha256: notice.sha256, fileName: notice.fileName,
      bytes: notice.size, renderedAt: notice.renderedAt, source: 'device',
    };
    await writeLocal((prev) => ({
      ...prev,
      notices: [...(prev.notices ?? []), meta],
      documentSha256: notice.sha256,
    }));
    setData((d) => ({ ...d, notices: [...(d.notices ?? []), meta], documentSha256: notice.sha256 }));
  }, [writeLocal]);

  // ONLY a load failure takes over the screen — there is nothing to show.
  // Recoverable errors surface in place, inside the dialog that raised them.
  if (fatalErr) return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-950 p-6">
      <p className="text-red-700 dark:text-red-400 font-semibold" role="alert">{fatalErr}</p>
      <Btn className="mt-4" onClick={() => onExit(false)}>Back to the queue</Btn>
    </div>
  );
  if (!data) return <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-950"><Spinner label="Opening inspection…" /></div>;

  const { inspection, property, checklist } = data;
  const violations = inspection.violations || [];
  const openViolations = violations.filter(OPEN);
  const items = checklist?.items ?? [];
  const answered = answers.filter(Boolean).length;
  const noCount = answers.filter((a) => a === 'no').length;

  // A completed inspection is a FINALIZED legal record: it has been signed and its
  // findings printed on a served notice. The walkthrough and findings become
  // read-only — editing them afterwards would put the stored record out of step
  // with the instrument already served, silently. The server refuses these writes
  // too (409 RECORD_FINALIZED); this just stops us offering what cannot succeed.
  const isFinal = !!inspection.completedDate;

  // A checklist item answered "No" with no violation cited is an unreconciled
  // finding — the inspector marked a failure and cited nothing, and the record
  // would go out claiming a clean result. Surfaced at completion, never silent.
  const unreconciled = noCount > 0 && violations.length === 0;

  const steps = [
    ['dossier', 'Property', Building2],
    ['walk', 'Checklist', ClipboardList],
    ['summary', 'Findings', AlertTriangle],
    ['sign', 'Signatures', FileSignature],
    ['serve', 'Notice', FileText],
  ];
  const stepIdx = steps.findIndex(([id]) => id === phase);

  const filteredItems = items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => !answerQ.trim() || it.prompt.toLowerCase().includes(answerQ.trim().toLowerCase()));

  /**
   * (R8) The rejected work, in plain text, on the clipboard. A rejection means the server
   * applied a rule the inspector could not have known about in a basement — their words must
   * never be trapped in a queue they cannot read.
   */
  const copyRejectedWork = () => {
    // (B3) THIS inspection's rejections only — the export used to sweep in payloads
    // from other properties and label them with this inspection's number.
    const mine = (off.rejected || []).filter((e) => e.inspectionId === inspectionId);
    const lines = mine.map((e) => [
      `--- ${OP_LABEL[e.op] || e.op} · recorded ${new Date(e.clientRecordedAt).toLocaleString()}`,
      `REASON: ${e.lastError || 'rejected'}`,
      JSON.stringify(e.payload, null, 2),
    ].join('\n'));
    const text = `Work the server would not accept — Inspection #${inspectionId}\n\n${lines.join('\n\n')}`;

    // (B4) This is the ONLY recovery path for work the server refused, and the next
    // button the officer taps deletes it forever. So we must NEVER say "Copied."
    // unless the copy actually happened. The old code fired-and-forgot the promise
    // and swallowed the rejection — then claimed success. Same dishonesty class as
    // "retrying on next change" (R9), sitting on top of an irreversible delete.
    navigator.clipboard?.writeText(text).then(
      () => window.alert('Copied. Paste it somewhere safe before you clear it.'),
      () => setRecovery(text),   // couldn't copy → SHOW them the text so it is recoverable by hand
    ) ?? setRecovery(text);
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* header */}
      <div className="bg-red-700 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => onExit(true)} aria-label="Exit inspection (progress is saved)"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-red-600">
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-bold truncate">{property?.name || `Property #${inspection.propertyId}`}</p>
          <p className="text-sm text-red-100 truncate">{inspection.type} · {property?.address || 'No address on file'}</p>
        </div>
        {/* (R9) The status is syncCore's, VERBATIM. The old copy here claimed "⚠ Save failed —
            retrying on next change" while nothing retried. Never again: this line only ever
            says what the outbox is actually doing. */}
        <SyncStrip off={off} />
      </div>
      {/* stepper */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2 flex gap-2 overflow-x-auto">
        {steps.map(([id, label, Icon], i) => (
          <button key={id} onClick={() => setPhase(id)}
            disabled={!(i <= stepIdx || inspection.completedDate)}
            aria-current={phase === id ? 'step' : undefined}
            className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-semibold whitespace-nowrap disabled:cursor-not-allowed ${
              phase === id ? 'bg-red-600 text-white'
                : i < stepIdx ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  : 'text-gray-500 dark:text-gray-500'}`}>
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {/* ── iPAD LANDSCAPE IS THE DESIGN TARGET, not an afterthought ──────────────
          This was capped at max-w-4xl (896px). On a 12.9" iPad in landscape (1366pt)
          that left ~235px of dead grey down each side and forced the checklist into a
          single narrow column — a phone layout centred on a tablet, on the surface an
          officer actually mounts in the rig. Widen with the screen; the reading measure
          is protected by the two-column checklist below rather than by starving the page. */}
      {/* The findings rail is fixed to the right on landscape iPads, so the content
          column must yield its width — otherwise the rail sits ON TOP of the checklist.
          mr only kicks in at the same 1150px the rail does. */}
      <div className={`flex-1 overflow-y-auto p-4 sm:p-6 max-w-4xl lg:max-w-6xl xl:max-w-7xl w-full mx-auto space-y-4
        ${phase === 'walk' && items.length > 0 ? '[@media(min-width:1150px)]:pr-[352px]' : ''}`}>
        <OfflineBanners off={off} inspectionId={inspectionId} onCopyWork={copyRejectedWork} />

        {/* (B4) The clipboard refused (Safari user-activation, or an insecure context).
            The work must still be recoverable BY HAND — never trapped behind a failed copy. */}
        {recovery && (
          <div role="alert" className="rounded-2xl border-4 border-red-600 bg-white dark:bg-gray-900 p-4 space-y-2">
            <p className="font-bold text-red-800 dark:text-red-300">
              This browser would not let us copy. Save this text yourself before you clear anything.
            </p>
            <TextArea readOnly rows={10} value={recovery} onFocus={(e) => e.target.select()}
              aria-label="Your rejected work — select and copy it" />
            <Btn className="min-h-[64px]" onClick={() => setRecovery(null)}>I have saved it</Btn>
          </div>
        )}
        {err && <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}

        {/* ── dossier ── */}
        {phase === 'dossier' && (
          <>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-3">
              <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">{property?.name || 'Unknown property'}</h3>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {[['Occupancy', property?.occupancyType], ['Owner', property?.ownerName], ['Contact', property?.contactName],
                  ['Phone', property?.contactPhone || property?.ownerPhone], ['Sq ft', property?.squareFootage], ['Stories', property?.stories]]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}><dt className="text-gray-500 dark:text-gray-400">{k}</dt><dd className="font-semibold text-gray-900 dark:text-gray-100">{v}</dd></div>
                  ))}
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                {property?.sprinklered && <Badge tone="green">Sprinklered</Badge>}
                {property?.alarmMonitored && <Badge tone="green">Monitored alarm</Badge>}
                {property?.hazmatOnsite && <Badge tone="amber">Hazmat on site</Badge>}
                {/* p.type already reads e.g. "Special Event Permit" — appending the
                    word "permit" produced "…Permit permit ·" (found 2026-07-13). */}
                {/* Set membership, not a literal — an AboutToExpire permit (0094) is a VALID
                    permit, and rendering it gray would tell an inspector on site that a
                    lawful permit is not in force. */}
                {data.permits.map((p) => <Badge key={p.id} tone={IN_FORCE_PERMIT_STATUSES.includes(p.status) ? 'green' : 'gray'}>{p.type} · {p.status}</Badge>)}
              </div>
            </div>
            {openViolations.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950 rounded-2xl border border-amber-200 dark:border-amber-900 p-4">
                <p className="font-bold text-amber-900 dark:text-amber-200 mb-1">Open violations on this record ({openViolations.length})</p>
                <ul className="text-sm text-amber-800 dark:text-amber-300 list-disc pl-5">
                  {openViolations.map((v) => <li key={v.id}>{v.code ? `${v.code} — ` : ''}{v.description}</li>)}
                </ul>
              </div>
            )}
            {data.history.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                <p className="font-bold text-gray-900 dark:text-gray-100 mb-2">Inspection history</p>
                <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-800">
                  {data.history.slice(0, 6).map((h) => (
                    <li key={h.id} className="py-1.5 flex justify-between gap-2">
                      <span className="text-gray-700 dark:text-gray-300">{h.type}</span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {h.completedDate ? `${String(h.completedDate).slice(0, 10)}${h.result ? ` · ${h.result}` : ''}` : `Scheduled ${String(h.scheduledDate || '').slice(0, 10) || '—'}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => stampDoorway('BUILDING VACANT')}>Building is vacant</Btn>
              <Btn onClick={() => stampDoorway('OCCUPANCY CHANGED')}>Occupancy changed</Btn>
            </div>
            <Btn variant="primary" className="w-full text-lg" onClick={() => setPhase('walk')} disabled={!!inspection.completedDate}>
              Begin inspection
            </Btn>
          </>
        )}

        {/* ── checklist walk ── */}
        {phase === 'walk' && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-4 text-sm font-bold">
                <span className="text-gray-700 dark:text-gray-300">{answered}/{items.length} answered</span>
                <span className={noCount ? 'text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}>{violations.length} violation{violations.length === 1 ? '' : 's'} cited</span>
              </div>
              {items.length > 8 && (
                <div className="relative w-56">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <Input aria-label="Search checklist" placeholder="Find an item…" value={answerQ} onChange={(e) => setAnswerQ(e.target.value)} className="pl-9 min-h-[40px]" />
                </div>
              )}
            </div>
            {items.length === 0 ? (
              // No checklist bound is a SUPPORTED path — so it must still reach
              // completion. The forward button lives only in the branch below, so
              // without this the inspector is stranded here (found in the 2026-07-13
              // walkthrough: step tabs only navigate backward).
              <>
                {isFinal && (
                  <p role="status" className="rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Completed {String(inspection.completedDate).slice(0, 10)} — this walkthrough is a finalized legal record and is read-only.
                    Record abatement on the reinspection that carries the violation.
                  </p>
                )}
                <EmptyState icon={ClipboardList} title="No checklist bound to this type"
                  body={isFinal
                    ? 'No checklist was bound when this inspection ran. The findings below are the record.'
                    : 'You can still cite violations and complete the inspection. Bind a default checklist to this type in Settings › Types to get the guided walkthrough.'}
                  action={isFinal ? null : (
                    <Btn variant="primary" onClick={() => setDialog({ code: '', description: '', status: 'Open', followUpDate: '', notes: '', imminentHazard: false })}>
                      <Plus size={16} aria-hidden="true" /> Cite a violation
                    </Btn>
                  )} />
                <Btn variant="primary" className="w-full text-lg" onClick={() => setPhase('summary')}>
                  Review findings
                </Btn>
              </>
            ) : (
              <>
                {isFinal && (
                  <p role="status" className="rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Completed {String(inspection.completedDate).slice(0, 10)} — this walkthrough is a finalized legal record and is read-only.
                    Record abatement on the reinspection that carries the violation.
                  </p>
                )}
                {!answerQ && !isFinal && (
                  <div className="flex justify-end">
                    {/* Bulk-yes is a BULK ATTESTATION into a legal record — it must be
                        deliberate, it must state what it is asserting, and it must not
                        answer items the department marked required. (2026-07-13) */}
                    <Btn onClick={() => {
                      const fillable = items
                        .map((it, i) => ({ it, i }))
                        .filter(({ it, i }) => !answers[i] && !it.required);
                      const skipped = items.filter((it, i) => !answers[i] && it.required).length;
                      if (!fillable.length) {
                        window.alert(skipped
                          ? `The ${skipped} remaining item${skipped === 1 ? ' is' : 's are'} marked required — answer ${skipped === 1 ? 'it' : 'them'} deliberately.`
                          : 'Nothing left to answer.');
                        return;
                      }
                      const ok = window.confirm(
                        `Answer ${fillable.length} remaining item${fillable.length === 1 ? '' : 's'} "Yes"?\n\n` +
                        `You are attesting that each was checked and passed. This goes into the legal record.` +
                        (skipped ? `\n\n${skipped} required item${skipped === 1 ? '' : 's'} will be left for you to answer.` : ''));
                      if (!ok) return;
                      const next = [...answers];
                      fillable.forEach(({ i }) => { next[i] = 'yes'; });
                      setAnswers(next); persistAnswers(next);
                    }}>
                      Yes to all remaining
                    </Btn>
                  </div>
                )}
                {/* Two-up on a wide screen: an officer walking a building with a 40-item
                    checklist should scroll half as far.
                    The single-column fallback is NOT for phones — inspections never run on
                    the iPhone (it is the companion: recall + incident-respond only). It is
                    for the NARROW IPAD viewports we must still fit: the mini (744pt) and
                    the 11" (834pt) in portrait, and any iPad in Split View / Slide Over.
                    Below ~1024pt a second column would crush the 64pt answer buttons, which
                    are the most-tapped control in the app. */}
                <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 lg:items-start">
                  {filteredItems.map(({ it, idx }) => (
                    <li key={it.id ?? idx} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {it.prompt}
                        {it.required && (
                          <>
                            <span className="text-red-600 ml-1" aria-hidden="true">*</span>
                            <span className="sr-only">(required)</span>
                          </>
                        )}
                        {it.ref_code && <span className="ml-2 text-xs font-mono text-gray-600 dark:text-gray-400">{it.ref_code}</span>}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label={`Answer: ${it.prompt}`}>
                        {[['yes', 'Yes', Check, 'green'], ['no', 'No', XIcon, 'red'], ['na', 'N/A', Minus, 'gray']].map(([val, label, Icon, tone]) => {
                          const on = answers[idx] === val;
                          const tones = {
                            green: on ? 'bg-green-800 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
                            red:   on ? 'bg-red-600 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
                            gray:  on ? 'bg-gray-500 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
                          };
                          return (
                            <button key={val} onClick={() => setAnswer(idx, val)} aria-pressed={on}
                              disabled={isFinal}
                              className={`min-h-[64px] rounded-xl font-bold inline-flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-700 disabled:opacity-60 disabled:cursor-not-allowed ${tones[tone]}`}>
                              <Icon size={16} aria-hidden="true" /> {label}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between items-center">
                  <Btn disabled={isFinal}
                    onClick={() => setDialog({ code: '', description: '', status: 'Open', followUpDate: '', notes: '', imminentHazard: false })}>
                    <Plus size={16} aria-hidden="true" /> Cite ad-hoc violation
                  </Btn>
                  <Btn variant="primary" onClick={() => setPhase('summary')}>Review findings</Btn>
                </div>
              </>
            )}
          </>
        )}

        {/* ── THE LANDSCAPE FINDINGS RAIL ──────────────────────────────────────
            The iPad IS the field device (the desktop is the after-action, back at the
            office). Mounted in landscape on a 1194–1366pt screen, an officer walking a
            building could not see what they had ALREADY CITED without leaving the
            checklist — so the running record of the walk was invisible during the walk.
            This pins it beside them. Landscape only (min-width 1150px): that is the 11"
            and 13" iPads in landscape, and it deliberately excludes the 13" in PORTRAIT
            (1024pt), where a rail would squeeze the 64pt answer buttons that are the
            most-tapped control in the app.
            Same doctrine as the Size-Up split-pane on the mobile client. */}
        {phase === 'walk' && items.length > 0 && (
          <aside
            className="hidden [@media(min-width:1150px)]:block fixed right-4 top-32 w-[320px] max-h-[calc(100vh-10rem)] overflow-y-auto
                       rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-4 space-y-2"
            aria-label="Findings so far">
            <p className="font-bold text-gray-900 dark:text-gray-100">
              Cited so far
              <span className={`ml-2 ${violations.length ? 'text-red-700 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {violations.length}
              </span>
            </p>
            {violations.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nothing cited yet. A clean walk is a good outcome — this fills in as you find things.
              </p>
            ) : (
              <ul className="space-y-2">
                {violations.map((v) => (
                  <li key={v.id} className="rounded-xl border border-gray-100 dark:border-gray-700 p-2.5">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {v.code && <span className="font-mono text-red-700 dark:text-red-400 mr-1.5">{v.code}</span>}
                      {v.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {v.imminentHazard && <Badge tone="red">Imminent hazard</Badge>}
                      {v.followUpDate && <Badge tone="gray">By {String(v.followUpDate).slice(0, 10)}</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {noCount > 0 && violations.length === 0 && (
              <p role="alert" className="text-sm font-bold text-amber-800 dark:text-amber-300">
                {noCount} item{noCount === 1 ? '' : 's'} failed with nothing cited.
              </p>
            )}
          </aside>
        )}

        {/* ── findings + completion ── */}
        {phase === 'summary' && (
          <>
            <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Findings</h3>
            {violations.length === 0
              ? <EmptyState icon={CircleCheck} title="No violations cited" body="A clean building. Complete the inspection and the notice prints the passed-inspection wording." />
              : (
                <ul className="space-y-2">
                  {violations.map((v) => (
                    <li key={v.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">
                            {v.code && <span className="font-mono text-red-700 dark:text-red-400 mr-2">{v.code}</span>}{v.description}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {v.imminentHazard && <Badge tone="red"><AlertTriangle size={12} aria-hidden="true" /> Imminent hazard</Badge>}
                            {v.followUpDate && <Badge tone="gray">Correct by {String(v.followUpDate).slice(0, 10)}</Badge>}
                            {v.carriedFrom && <Badge tone="yellow">Carried forward</Badge>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {/* P2-4 (2026-07-16): a finalized record's status is a VERDICT, not a
                              control. It was a disabled <Select> — functionally locked (and the
                              server enforces RECORD_FINALIZED regardless), but it still LOOKED
                              like an editable combobox on a legal record. Render a static badge
                              instead, matching the iPad's finalized-record treatment. */}
                          {inspection.completedDate ? (
                            <Badge tone={isResolvedViolationStatus(v.status) ? 'green' : 'amber'}>{v.status}</Badge>
                          ) : (
                          <Select aria-label={`Status for ${v.description}`} className="max-w-[11rem] min-h-[40px]" value={v.status}
                            onChange={(e) => setViolationStatus(v, e.target.value)}>
                            {VIOLATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </Select>
                          )}
                          <button className="text-sm underline text-gray-600 dark:text-gray-300 min-h-[44px] px-2" onClick={() => setDialog(v)}>
                            {isFinal ? 'View / photos' : 'Edit / photos'}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            {/* An item answered "No" with nothing cited would complete as a clean
                record — the inspector marked a failure and the notice says nothing.
                Say so before they finalize. (2026-07-13) */}
            {!isFinal && unreconciled && (
              <p role="alert" className="rounded-2xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 p-4 text-sm font-semibold text-amber-900 dark:text-amber-200">
                {noCount} checklist item{noCount === 1 ? ' was' : 's were'} answered “No” but no violation is cited.
                Cite {noCount === 1 ? 'it' : 'them'}, or change the answer — otherwise this record goes out reporting a clean building.
              </p>
            )}
            {!inspection.completedDate ? (
              <>
                {/* OFFLINE COMPLETION (P3.6, 2026-07-14).
                    The earlier cut BLOCKED this offline, reasoning that completion mints
                    legal records (the reinspection carrying the open violations, the next
                    cycle) and a device must not fabricate them. That reasoning was right —
                    but it conflated two different things: the INTENT to complete, and the
                    MINTING of the records.
                    So: the device queues the intent, and the SERVER mints the records on
                    drain, through the same engine the online route uses. No client-minted
                    reinspection, no invented ids, no legal record authored by a phone —
                    and the officer is no longer stranded in a basement unable to finish
                    the job. What they give up is seeing the reinspection DATE until it
                    syncs, and we say exactly that rather than inventing one. */}
                <Btn variant="primary" className="w-full min-h-[64px] text-lg"
                  onClick={() => {
                    const derived = openViolations.map((v) => String(v.followUpDate || '').slice(0, 10)).filter(Boolean).sort()[0];
                    // P1-5 (2026-07-16): an open IMMINENT HAZARD makes Fail the required
                    // disposition (the critical track, no routine cycle) — preselect it.
                    const hazards = openViolations.some((v) => v.imminentHazard === true);
                    setCompleting({
                      completedDate: localToday(),
                      // An inspection CANNOT pass with unabated violations (Matt, 2026-07-13).
                      // Open violations → the record is not a pass; it awaits reinspection.
                      result: hazards ? 'Fail' : openViolations.length ? 'Reinspection Required' : 'Pass',
                      createReinspection: openViolations.length > 0,
                      reinspectionDate: derived || '',
                      scheduleNextCycle: true,
                    });
                  }}>
                  Complete inspection
                </Btn>
              </>
            ) : (
              // The inspector is standing in front of the occupant with the iPad out.
              // Don't make them hunt the stepper for the next step. (2026-07-13)
              <>
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                  Completed {String(inspection.completedDate).slice(0, 10)}{inspection.result ? ` · ${inspection.result}` : ''}.
                </p>
                <Btn variant="primary" className="w-full text-lg" onClick={() => setPhase('sign')}>
                  Capture signatures →
                </Btn>
              </>
            )}
            {completedInfo && (
              <div role="status" aria-live="polite" className="rounded-2xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 p-4 text-sm text-green-900 dark:text-green-200 space-y-1">
                <p className="font-bold">Inspection completed.</p>
                {/* OFFLINE: the SERVER mints the reinspection and the next cycle when this
                    syncs. We will not invent a date we cannot promise — say what is true. */}
                {completedInfo.pending ? (
                  <>
                    <p>
                      Completed on this device. It will be filed the moment you have signal
                      {completedInfo.createReinspection
                        ? ', and the reinspection carrying the open violations will be scheduled then.'
                        : '.'}
                    </p>
                    <p className="font-semibold">
                      The scheduled date is set by the server on sync — it is not decided on this device.
                    </p>
                  </>
                ) : (
                  <>
                    {completedInfo.reinspection && <p>Reinspection created for {String(completedInfo.reinspection.scheduledDate).slice(0, 10)} carrying {completedInfo.reinspection.violations?.length ?? '—'} open violation(s).</p>}
                    {completedInfo.nextCycle && <p>Next cycle scheduled {String(completedInfo.nextCycle.scheduledDate).slice(0, 10)}{completedInfo.nextCycle.deduplicated ? ' (already on the books — reused)' : ''}.</p>}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ── signatures ── */}
        {phase === 'sign' && (
          <SignStep user={user} fiCtx={fiCtx}
            signatures={data.signatures} documentSha256={data.documentSha256}
            onSign={addSignature} onDone={() => setPhase('serve')} />
        )}

        {/* ── serve ── */}
        {phase === 'serve' && (
          <ServeStep data={data} off={off} user={user}
            onAddService={addService} onMailEvent={addMailEvent} onNoticeRendered={registerDeviceNotice}
            onExit={() => onExit(true)} onNeedInspectorSignature={() => setPhase('sign')} />
        )}
      </div>

      {dialog && (
        <ViolationDialog key={dialog.id || 'new'} initial={dialog} codes={data.codes} inspectionId={inspection.id}
          off={off} readOnly={isFinal} onSave={saveViolation} onClose={() => setDialog(null)} />
      )}
      {completing && (
        <Modal title="Complete inspection" onClose={() => setCompleting(null)}>
          <div className="space-y-4">
            <Field label="Completion date" hint="Your local calendar day — it becomes part of the legal record.">
              <Input type="date" value={completing.completedDate} onChange={(e) => setCompleting({ ...completing, completedDate: e.target.value })} />
            </Field>
            <Field
              label="Result"
              hint={(() => {
                const hz = openViolations.filter((v) => v.imminentHazard === true).length;
                if (hz) return `${hz === 1 ? 'An imminent hazard stands' : `${hz} imminent hazards stand`} — Fail is the required disposition; a dangerous condition cannot ride the routine correction cycle.`;
                if (openViolations.length) return `A passing result is unavailable — ${openViolations.length} violation${openViolations.length === 1 ? ' remains' : 's remain'} unabated. Fail is reserved for imminent-hazard findings.`;
                return undefined;
              })()}
            >
              <Select value={completing.result} onChange={(e) => setCompleting({ ...completing, result: e.target.value })}>
                {/* An inspection cannot pass with unabated violations (Matt, 2026-07-13),
                    and P1-5 (2026-07-16): Fail ⇔ an open imminent hazard — the critical
                    disposition vs the routine cycle. The server 422s all of these
                    (PASS_WITH_OPEN_VIOLATIONS / FAIL_REQUIRES_IMMINENT_HAZARD /
                    IMMINENT_HAZARD_REQUIRES_FAIL); we don't offer the illegal choices.
                    Exact matches against the closed set — nothing pattern-matches a result. */}
                {(() => {
                  const hazards = openViolations.some((v) => v.imminentHazard === true);
                  return INSPECTION_RESULTS
                    .filter((r) => !(openViolations.length && r === 'Pass'))
                    .filter((r) => !(r === 'Fail' && !hazards))
                    .filter((r) => !(r === 'Reinspection Required' && hazards))
                    .map((r) => <option key={r} value={r}>{r}</option>);
                })()}
              </Select>
            </Field>
            {openViolations.length > 0 && (
              <>
                <label className="flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-200 min-h-[44px]">
                  <input type="checkbox" className="h-5 w-5 rounded accent-red-600" checked={completing.createReinspection}
                    onChange={(e) => setCompleting({ ...completing, createReinspection: e.target.checked })} />
                  Schedule a reinspection carrying the {openViolations.length} open violation{openViolations.length === 1 ? '' : 's'}
                </label>
                {completing.createReinspection && (
                  <Field label="Reinspection date"
                  hint={completing.reinspectionDate
                    ? 'Pre-filled from the earliest correct-by date.'
                    : 'Required — no cited violation carries a correct-by date to derive this from. Pick a date, or uncheck the reinspection above.'}>
                    <Input type="date" value={completing.reinspectionDate} onChange={(e) => setCompleting({ ...completing, reinspectionDate: e.target.value })} />
                  </Field>
                )}
              </>
            )}
            <label className="flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-200 min-h-[44px]">
              <input type="checkbox" className="h-5 w-5 rounded accent-red-600" checked={completing.scheduleNextCycle}
                onChange={(e) => setCompleting({ ...completing, scheduleNextCycle: e.target.checked })} />
              Schedule the next cycle from this type's recurrence
            </label>
            {err && <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setCompleting(null)}>Not yet</Btn>
              {/* A reinspection with no date is a guaranteed server refusal — don't
                  offer the inspector a button that cannot succeed (2026-07-13). */}
              <Btn variant="primary"
                disabled={completing.createReinspection && !completing.reinspectionDate}
                onClick={async () => {
                setErr(null);
                const body = {
                  completedDate: completing.completedDate,
                  result: completing.result,
                  createReinspection: completing.createReinspection,
                  scheduleNextCycle: completing.scheduleNextCycle,
                  ...(completing.createReinspection && completing.reinspectionDate ? { reinspectionDate: completing.reinspectionDate } : {}),
                };
                try {
                  if (off.online) {
                    const r = await fi.inspections.complete(inspection.id, body);
                    setData((d) => ({ ...d, inspection: r.data }));
                    setCompletedInfo({ reinspection: r.reinspection, nextCycle: r.nextCycle });
                  } else {
                    // OFFLINE: queue the INTENT. The server mints the reinspection and the
                    // next cycle when this drains — the device never fabricates a legal
                    // record. Stamp the completion locally so the officer sees a finished
                    // inspection, and say plainly that the scheduling happens on sync
                    // rather than inventing a date we cannot promise.
                    await off.enqueue('inspection.complete', inspection.id, body);
                    setData((d) => ({
                      ...d,
                      inspection: { ...d.inspection, completedDate: body.completedDate, result: body.result },
                    }));
                    setCompletedInfo({ pending: true, createReinspection: body.createReinspection });
                  }
                  setCompleting(null);
                } catch (e) { setErr(e.message); }
              }}>
                Complete
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── signatures step ──────────────────────────────────────────────────────────
// THE DOCTRINE, in the UI: a notice is made valid by SERVICE, not by a signature.
//  · The OCCUPANT's signature is an ACKNOWLEDGMENT OF RECEIPT, never agreement
//    with the findings. Refusing it does not invalidate the notice and does not
//    extend a deadline — so refusal is one of three FIRST-CLASS outcomes here, not
//    a dead end or an empty row. (0053: every outcome is stated.)
//  · The INSPECTOR's signature is a mandatory attestation. There is no skip: the
//    server refuses to issue a notice without it (409 INSPECTOR_SIGNATURE_REQUIRED),
//    so offering a skip would only be offering a path that cannot succeed.
//  · OFFLINE: the capture goes through the outbox and the row is shown immediately. The
//    server owns signed_at when it lands (a device clock is not evidence) — so an un-synced
//    row is LABELLED as such rather than dressed up as filed.
function SignStep({ user, fiCtx, signatures, documentSha256, onSign, onDone }) {
  const [name, setName] = useState('');
  const [roleLabel, setRoleLabel] = useState('Occupant');
  const [png, setPng] = useState(null);
  const [refusing, setRefusing] = useState(null); // the scripted-advisement modal
  const [outcome, setOutcome] = useState(null);   // what the last occupant outcome MEANS
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const existing = signatures ?? [];
  // ANY occupant row settles the occupant question — signed, refused, or nobody home are all
  // answers. Only a 'signed' inspector row satisfies the attestation.
  const hasOcc = existing.some((s) => s.role === 'occupant');
  const hasIns = existing.some((s) => s.role === 'inspector' && s.status === 'signed');
  const who = !hasOcc ? 'occupant' : !hasIns ? 'inspector' : 'done';

  const nameRef = useRef(false);
  useEffect(() => {
    // Pre-fill the inspector's own name once we're past the occupant — but never fight the
    // officer for the field after they've started typing.
    if (nameRef.current) return;
    if (who === 'inspector') { setName(user?.name || user?.username || ''); nameRef.current = true; }
  }, [who, user]);

  const agreement = fiCtx.settings?.signature_agreement_text?.trim() || SAMPLE_AGREEMENT;
  const advisementText = fiCtx.settings?.refusal_advisement_text?.trim() || '';

  /** Every capture carries its provenance: the exact consent text SHOWN, the device, and a best-effort fix. */
  const capture = async (body) => {
    setBusy(true); setErr(null);
    try {
      const gps = await bestEffortGps();
      await onSign({
        consentText: agreement,
        deviceLabel: navigator.userAgent.slice(0, 180),
        // (TRAP 1 / C3) A signature is associated with the DOCUMENT that was signed. If a
        // notice has already been rendered on this device, its hash rides along. If none
        // exists yet, we send NOTHING rather than invent an association with a document that
        // did not exist at the moment of signing — a fabricated hash is worse than no hash.
        ...(documentSha256 ? { documentSha256 } : {}),
        ...(gps || {}),
        ...body,
      });
      setPng(null);
      return true;
    } catch (e) { setErr(e.message); return false; }
    finally { setBusy(false); }
  };

  const sigTone = (s) => (s.status === 'signed' ? 'green' : s.status === 'refused' ? 'amber' : 'gray');
  const sigWhat = (s) => ({
    signed: 'signed',
    refused: 'REFUSED to sign — the notice stands',
    unable_no_party_present: 'no responsible party present',
    unable_other: 'present but unable to sign',
    declined_by_policy: 'not collected (department policy)',
  }[s.status] || s.status);

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Signatures</h3>
      {existing.length > 0 && (
        <ul className="text-sm space-y-2">
          {existing.map((s) => (
            <li key={s.id} className="text-gray-700 dark:text-gray-300">
              <Badge tone={sigTone(s)}>{s.role}</Badge>{' '}
              <span className="font-semibold">{s.signer_name || 'declined to identify'}</span>
              {s.signer_role_label ? ` (${s.signer_role_label})` : ''} — {sigWhat(s)} · {new Date(s.signed_at).toLocaleString()}
              {/* Un-synced: the time above is THIS DEVICE's. The record's signed_at is the
                  server's when it lands, and we do not pretend otherwise. */}
              {s._pending && <span className="ml-1"><Badge tone="amber">Saved on this device</Badge></span>}
              {s.refusal_reason && <span className="block text-xs text-gray-500 dark:text-gray-400">Reason given: {s.refusal_reason}</span>}
              {s.status === 'refused' && (
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  {s.advisements_read ? 'Advisements read aloud and a final request to sign was made.' : 'Advisements were NOT recorded as read.'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* The result of the LAST occupant outcome, said plainly. A refusal must never
          read like a failure — the officer is standing in front of the occupant. */}
      {outcome === 'refused' && (
        <div role="status" aria-live="polite" className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-bold">Refusal recorded. The notice still stands.</p>
          <p>Refusal to sign does not invalidate the notice and does not extend the correction deadline. The clock runs from the date service was effected — record that on the next step.</p>
        </div>
      )}
      {outcome === 'unable_no_party_present' && (
        <div role="status" aria-live="polite" className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-bold">No responsible party present — recorded.</p>
          <p>Nobody was there to hand it to, so this notice must be <strong>POSTED at the premises AND MAILED</strong>. Record both on the Notice step; the posting needs a photo and a location.</p>
        </div>
      )}

      {who === 'done' ? (
        <>
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">Signatures complete — the inspector has attested to this record.</p>
          <Btn variant="primary" className="w-full min-h-[64px] text-lg" onClick={onDone}>Continue to the notice</Btn>
        </>
      ) : who === 'occupant' ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <div>
            <p className="font-bold text-gray-900 dark:text-gray-100">Occupant — acknowledgment of receipt</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This signature acknowledges RECEIPT. It is not agreement with the findings — and refusing it changes nothing about the notice.
            </p>
          </div>
          <p className="text-sm rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{agreement}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who signed (print name)">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="e.g. the manager on duty" />
            </Field>
            <Field label="Their role">
              <Select value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)}>
                {SIGNER_ROLE_LABELS.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
          </div>
          <SignaturePad onChange={setPng} />
          {err && <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            <Btn variant="primary" className="min-h-[64px]" disabled={!png || !name.trim() || busy}
              onClick={async () => {
                const ok = await capture({ role: 'occupant', status: 'signed', signerName: name.trim(), signerRoleLabel: roleLabel, imageDataUrl: png });
                if (ok) setOutcome('signed');
              }}>
              {busy ? 'Saving…' : 'Sign'}
            </Btn>
            <Btn variant="danger" className="min-h-[64px]" disabled={busy}
              onClick={() => setRefusing({ name: name.trim(), roleLabel, reason: '', advisementsRead: false })}>
              <Ban size={16} aria-hidden="true" /> Refused to sign
            </Btn>
            <Btn className="min-h-[64px]" disabled={busy}
              onClick={async () => {
                if (!window.confirm('Record that no responsible party was present?\n\nThe notice will then have to be POSTED at the premises AND MAILED.')) return;
                const ok = await capture({ role: 'occupant', status: 'unable_no_party_present', signerName: '', signerRoleLabel: '' });
                if (ok) setOutcome('unable_no_party_present');
              }}>
              No responsible party present
            </Btn>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <div>
            <p className="font-bold text-gray-900 dark:text-gray-100">Inspector attestation — required</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The notice is the officer's attestation to a legal record. It cannot be issued without this signature — there is no skip.
            </p>
          </div>
          <Field label="Inspector name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </Field>
          <SignaturePad onChange={setPng} />
          {err && <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
          <Btn variant="primary" className="w-full min-h-[64px] text-lg" disabled={!png || !name.trim() || busy}
            onClick={() => capture({ role: 'inspector', status: 'signed', signerName: name.trim(), signerRoleLabel: 'Inspector', imageDataUrl: png })}>
            {busy ? 'Saving…' : 'Sign and attest'}
          </Btn>
        </div>
      )}

      {refusing && (
        <Modal title="Refusal to sign — read this aloud" onClose={() => setRefusing(null)} wide>
          <div className="space-y-4">
            {/* The script. The inspector reads it, makes a final request, and the
                fact that they did is itself part of the record (advisementsRead). */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
              {advisementText
                ? <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{advisementText}</p>
                : (
                  <>
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-2">
                      SAMPLE — your department has not set its own advisement text (Settings › Prevention). Review it with your AHJ.
                    </p>
                    <ol className="list-decimal pl-5 space-y-2 text-gray-800 dark:text-gray-200">
                      {SAMPLE_REFUSAL_ADVISEMENT.map((line) => <li key={line}>{line}</li>)}
                    </ol>
                  </>
                )}
            </div>
            <label className="flex items-start gap-2 font-semibold text-gray-800 dark:text-gray-200 min-h-[44px]">
              <input type="checkbox" className="h-5 w-5 mt-0.5 rounded accent-red-600" checked={refusing.advisementsRead}
                onChange={(e) => setRefusing({ ...refusing, advisementsRead: e.target.checked })} />
              I read these advisements aloud and made a final request to sign.
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Who refused (print name)" hint="Leave blank if they would not identify themselves — that is recorded as such.">
                <Input value={refusing.name} onChange={(e) => setRefusing({ ...refusing, name: e.target.value })} maxLength={200} placeholder="declined to identify" />
              </Field>
              <Field label="Their role">
                <Select value={refusing.roleLabel} onChange={(e) => setRefusing({ ...refusing, roleLabel: e.target.value })}>
                  {SIGNER_ROLE_LABELS.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Reason given (optional)" hint="Their words, not your characterization.">
              <TextArea rows={2} value={refusing.reason} onChange={(e) => setRefusing({ ...refusing, reason: e.target.value })} maxLength={1000} />
            </Field>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Recording a refusal does NOT invalidate the notice and does NOT extend the deadline. It is an event on the record.
            </p>
            {err && <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setRefusing(null)}>Back</Btn>
              <Btn variant="primary" disabled={busy}
                onClick={async () => {
                  const ok = await capture({
                    role: 'occupant', status: 'refused',
                    signerName: refusing.name.trim(), signerRoleLabel: refusing.roleLabel,
                    refusalReason: refusing.reason.trim(), advisementsRead: refusing.advisementsRead,
                  });
                  if (ok) { setRefusing(null); setOutcome('refused'); }
                }}>
                {busy ? 'Recording…' : 'Record the refusal'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── serve step ───────────────────────────────────────────────────────────────
// Two things live here, in the order they happen: the DOCUMENT (generate the
// notice PDF) and the SERVICE (how it was actually delivered). The second is what
// makes the first a notice at all — so the derived service status leads the screen,
// and when the Jones gate is closed it takes the whole top of the page.
//
// OFFLINE (the wedge): the notice is rendered ON DEVICE and printed from the device. Those
// bytes are the served instrument — hashed here, stored here, uploaded verbatim (TRAP 1).
// The Jones gate is computed here too, from the SHARED pure module (TRAP 2).
function ServeStep({ data, off, user, onAddService, onMailEvent, onNoticeRendered, onExit, onNeedInspectorSignature }) {
  const { inspection, property, settings, service, signatures } = data;
  const [serverNotices, setServerNotices] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [needsSig, setNeedsSig] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [svcErr, setSvcErr] = useState(null);
  const [svcBusy, setSvcBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState(null); // {record, reason}

  const load = useCallback(async () => {
    if (!off.online) { setServerNotices([]); return; }
    try { setServerNotices((await fi.inspections.notices.list(inspection.id)).data ?? []); }
    catch (e) { setServerNotices([]); setErr(e.message); }
  }, [inspection.id, off.online]);
  useEffect(() => { load(); }, [load]);

  /**
   * (TRAP 2) THE JONES GATE, and where it comes from.
   *   ONLINE and nothing queued → the SERVER's verdict, as before. It is authoritative.
   *   OTHERWISE → computed on device by the SHARED pure module (a generated mirror of the
   *   server's), over the same rows. We do not hand-roll the gate, and we never show a stale
   *   "SUFFICIENT" we cannot stand behind: a returned-mail event recorded in a basement
   *   closes the gate in that basement, exactly as it would on the server.
   */
  const queuedService = off.pending.some(
    (e) => e.inspectionId === inspection.id && (e.op === 'service.add' || e.op === 'service.mailEvent'));
  const status = useMemo(
    () => ((off.online && !queuedService && data.serverStatus) ? data.serverStatus : serviceStatus(service)),
    [off.online, queuedService, data.serverStatus, service],
  );

  /** The one signature that gates a notice: the officer's own attestation. */
  const inspectorSigned = (signatures || []).some((s) => s.role === 'inspector' && s.status === 'signed');

  const generate = async (email) => {
    setBusy(true); setErr(null); setMsg(null); setNeedsSig(false);
    try {
      const r = await fi.inspections.notices.generate(inspection.id, email || undefined);
      setMsg(r.data.emailSkipped
        ? r.data.emailSkipped
        : r.data.emailed ? `Notice generated and emailed to ${email}.` : 'Notice generated and stored.');
      await load();
    } catch (e) {
      setErr(e.message);
      // 409 = INSPECTOR_SIGNATURE_REQUIRED. An unsigned notice is a defective
      // instrument, so the server will never issue one — send the officer back to
      // the signature they are missing rather than leaving them at a dead button.
      if (e.status === 409) setNeedsSig(true);
    }
    finally { setBusy(false); }
  };

  /**
   * ── THE WEDGE (TRAP 1) ─────────────────────────────────────────────────────
   * Render the notice ON DEVICE, show it, print it, hand it over. THOSE BYTES are the served
   * instrument: they are hashed here, kept here, and uploaded verbatim. The server stores
   * them as they are and refuses the write if the hash disagrees. Nothing is ever re-rendered
   * at sync time — a regenerated PDF could differ in any byte and then the filed record would
   * disagree with the paper in the owner's hand.
   */
  /**
   * @param {'view'|'save'} how — 'view' opens it on screen (readback), 'save' downloads it
   *        (the unblockable door; from there the OS can email it — the ONE thing that goes
   *        out in the field). The old 'print' mode is GONE; see openBlob's header.
   */
  const renderOnDevice = async (how) => {
    setBusy(true); setErr(null); setMsg(null); setNeedsSig(false);
    try {
      // Same gate the server applies (INSPECTOR_SIGNATURE_REQUIRED) — offering a button that
      // can only be rejected on sync would be worse than not offering it at all.
      if (settings?.require_inspector_signature !== false && !inspectorSigned) {
        setNeedsSig(true);
        throw new Error('The inspector must sign before a notice can be issued — the notice is the officer\'s attestation, and an unsigned notice is a defective instrument.');
      }
      // Same gate the server applies (NOTICE_TEMPLATES_UNCONFIGURED, P1-2) — a legal
      // instrument must never print "[SAMPLE TEXT …]". Refuse on-device rendering too.
      const missingBlocks = unconfiguredNoticeBlocks(settings, inspection.violations || []);
      if (missingBlocks.length) {
        throw new Error(`The department's notice text is not configured — the notice would print "[SAMPLE TEXT — review with your authority having jurisdiction]" on a legal document. Author it in Prevention Center → Settings → Notices (missing: ${missingBlocks.join(', ')}).`);
      }
      const notice = await buildNoticePdf({
        departmentName: off.department?.name || '',
        settings, property, inspection,
        violations: inspection.violations || [],
        signatures: signatures || [],
        service: (service || []).filter((s) => !s.voided_at),
        // Decision A: compose "IFC 2021 §906.1" from the cached code library —
        // identical content to the office-generated document.
        codeLibrary: data.codes || [],
      });
      // Queue the EXACT bytes we are about to serve, then keep them on the device so the
      // officer can reprint the served instrument at any time, with or without signal.
      const entry = await off.enqueue('notice.upload', inspection.id, {
        pdfBase64: bytesToBase64(notice.bytes),
        fileName: notice.fileName,
        sha256: notice.sha256,
      });
      await cachePut(`notice:${entry.clientId}`, {
        blob: notice.blob, sha256: notice.sha256, fileName: notice.fileName,
      });
      await onNoticeRendered({
        clientId: entry.clientId, sha256: notice.sha256, fileName: notice.fileName,
        size: notice.bytes.length, renderedAt: entry.clientRecordedAt,
      });
      // (B5) NEVER claim the officer has the document if it never reached them. A blocked
      // pop-up would otherwise leave the record saying a notice was produced on this device
      // while nothing actually appeared. Gate the claim on the document arriving.
      // 'save' is the unblockable door: a download always lands.
      const opened = how === 'save'
        ? (downloadBlob(notice.blob, notice.fileName), true)
        : openBlob(notice.blob);
      if (!opened) return;   // openBlob already explained what to do; make NO claim.
      // ⚠️ The old copy here said "Hand it over." It no longer does, because that is not what
      // happens: nothing leaves the inspector's hand in the field (Matt, 2026-07-14). The hard
      // copy is printed at the OFFICE at end of day and served by certified mail. This document
      // is the field record and the courtesy copy — say exactly that, and nothing more.
      setMsg(off.online
        ? 'Notice rendered on this device and filed with the inspection record.'
        : 'Notice rendered on this device. It will be filed, exactly as rendered, when you have signal.');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // ── GETTING THE DOCUMENT OUT ────────────────────────────────────────────────
  //
  // ══════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE PRINT DOORS WERE DELETED 2026-07-14. THEY WERE SOLVING A PROBLEM THAT DOES
  //    NOT EXIST, AND THEY PROBABLY DID NOT WORK.
  // ══════════════════════════════════════════════════════════════════════════════════
  //
  // This code used to be a three-door print cascade (open a tab and call print() → fall
  // back to a hidden iframe and print from there → otherwise download), built on the
  // premise that our wedge was: *"the inspector prints the Notice of Violation on-device,
  // in a basement, and hands the owner the paper before leaving."*
  //
  // Matt — a working fire inspector and captain — on what actually happens (2026-07-14):
  //
  //     "nothing leaves ur hand because there is no way to print a paper in the field,
  //      the only thing that would ever happen in the field is sending an email of an
  //      inspection certificate or notice of violations.... the physical hard copies of
  //      these reports get printed at the end of the day back at the office and are sent
  //      out via certified mail"
  //
  // Nobody prints in the field. The wedge was also falsified independently: at least one
  // incumbent already advertises on-scene printed violation notices, and mobile thermal
  // printers are a commodity accessory. We were building the thing everyone already does.
  //
  // AND THE CODE WAS PROBABLY BROKEN ANYWAY: window.open() was called AFTER two `await`s
  // (the jsPDF render and the SHA-256 digest). Safari does not carry transient user
  // activation across an await — so Door 1 was likely pop-up-blocked on EVERY notice, and
  // we never noticed, because no real inspector ever used it.
  //
  // What survives is what the field actually needs, and it cannot be blocked:
  //   • VIEW — open the rendered notice so the officer can read it back on the tablet.
  //   • SAVE / SHARE — a download. From there the OS can email it (the ONE thing that goes
  //     out in the field) or AirDrop it. A saved file has no pop-up blocker and no
  //     print() to fail.
  //
  // The printed instrument now belongs to the OFFICE, at end of day, where it is printed,
  // mailed certified, and its SERVICE is recorded. See docs/FI-PREVENTION-REPLAN-2026-07-14.md.
  const openBlob = (blob) => {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      // Tell the truth, and point at the door that cannot be blocked. We make NO claim
      // that the officer has the document if the window never opened.
      setErr('Your browser blocked the notice window, so nothing was shown. Use Save / Share — the notice is saved on this device, unchanged, and can be emailed or printed from there.');
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return false;   // NOT shown → the caller must make no "you have it" claim.
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  };

  /** The door that cannot be blocked. A saved file can always be printed or shared. */
  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName || 'violation-notice.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  /** Download works for BOTH kinds: bytes on the device, or bytes on the server. */
  const downloadNotice = async (n) => {
    setErr(null);
    if (n.device) {
      const rec = await cacheGet(`notice:${n.id}`).catch(() => null);
      if (!rec?.blob) { setErr('Those notice bytes are no longer on this device. Once it syncs you can download it from the record.'); return; }
      downloadBlob(rec.blob, rec.fileName);
      return;
    }
    try {
      const res = await fetch(`/api/fi-notices/${n.id}/pdf`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error(`Could not load the PDF (${res.status})`);
      downloadBlob(await res.blob(), n.file_name || `violation-notice-${n.id}.pdf`);
    } catch (e) { setErr(e.message); }
  };

  /** Re-open a notice this DEVICE rendered — works with no signal, because the bytes are here. */
  const openDeviceNotice = async (clientId) => {
    setErr(null);
    const rec = await cacheGet(`notice:${clientId}`).catch(() => null);
    if (!rec?.blob) { setErr('Those notice bytes are no longer on this device. Once it syncs you can open it again from the record.'); return; }
    openBlob(rec.blob);
  };

  const openPdf = async (noticeId) => {
    setErr(null);
    try {
      const res = await fetch(`/api/fi-notices/${noticeId}/pdf`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error(`Could not load the PDF (${res.status})`);
      openBlob(await res.blob());
    } catch (e) { setErr(e.message); }
  };

  const mailEvent = async (record, event) => {
    // Recording a return is the moment the department gains KNOWLEDGE that the
    // notice failed — and that knowledge is exactly what closes the Jones gate.
    // Say so before they tap it; do not let it land as a surprise.
    if (event === 'returned_undelivered' || event === 'unclaimed') {
      const ok = window.confirm(
        `Record that this mailing came back ${event === 'unclaimed' ? 'UNCLAIMED' : 'UNDELIVERED'}?\n\n`
        + 'The department then KNOWS the notice did not arrive. Enforcement cannot proceed until additional steps are taken (Jones v. Flowers) — this will open a required-action block.');
      if (!ok) return;
    }
    setSvcBusy(true); setSvcErr(null);
    try { await onMailEvent(record, event); } catch (e) { setSvcErr(e.message); }
    finally { setSvcBusy(false); }
  };

  // Voiding is an ONLINE action: it retires a row the server owns, and there is no offline op
  // for it. We say that rather than queueing something that would never land.
  const doVoid = async () => {
    setSvcBusy(true); setSvcErr(null);
    try {
      await fi.service.void(voiding.record.id, voiding.reason.trim());
      setVoiding(null);
      window.location.reload();
    } catch (e) { setSvcErr(e.message); setSvcBusy(false); }
  };

  const notices = [
    ...(serverNotices ?? []).map((n) => ({ ...n, device: false })),
    ...(data.notices ?? []).map((n) => ({
      id: n.clientId, created_at: n.renderedAt, generated_by: user?.name || user?.username || '',
      bytes: n.bytes, sha256: n.sha256, device: true,
      pending: off.pending.some((e) => e.clientId === n.clientId),
    })),
  ];

  const blocked = status?.status === 'action_required';
  return (
    <div className="space-y-4">
      {/* ── the derived service status — the fact that decides everything else ── */}
      {blocked ? (
        <div role="alert" data-testid="enforcement-blocked" className="rounded-2xl border-4 border-red-600 dark:border-red-500 bg-red-50 dark:bg-red-950 p-5 space-y-3">
          <p className="flex items-center gap-2 text-lg font-extrabold text-red-800 dark:text-red-200">
            <AlertTriangle size={22} aria-hidden="true" /> ACTION REQUIRED — enforcement cannot proceed
          </p>
          <p className="text-sm font-semibold text-red-900 dark:text-red-200">{status.gate.reason}</p>
          <ul className="space-y-2">
            {(status.gate.required || []).map((step, i) => (
              <li key={step} className="flex items-start gap-2 text-sm font-semibold text-red-900 dark:text-red-100">
                <span className="shrink-0 h-6 w-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center" aria-hidden="true">{i + 1}</span>
                {step}
              </li>
            ))}
          </ul>
          <p className="text-sm text-red-900 dark:text-red-200">
            Record each step below. The block clears when a posting, a first-class re-send, or personal service is recorded <strong>after</strong> the mail came back.
          </p>
        </div>
      ) : (
        <div role="status" aria-live="polite"
          className={`rounded-2xl border p-4 ${status?.status === 'sufficient'
            ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}>
          {status?.status === 'sufficient' ? (
            <>
              <p className="font-extrabold text-green-800 dark:text-green-200">SERVED — {new Date(status.servedAt).toLocaleString()}</p>
              <p className="text-sm text-green-900 dark:text-green-300">The correction clock runs from this date — not from the day the notice was generated.</p>
            </>
          ) : (
            <>
              <p className="font-bold text-gray-700 dark:text-gray-300">Not yet served</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">No clock is running. A notice becomes a notice when it is delivered — record how below.</p>
            </>
          )}
        </div>
      )}

      {/* ── the document ── */}
      <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">The notice</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Each generation is stored exactly as served — regenerating adds a new record and never alters an earlier one.
      </p>
      <div className="flex flex-wrap gap-2">
        {/* ⚠️ "Print the notice now" WAS the primary button here. It is gone (2026-07-14).
            Nothing is printed in the field — the hard copy is produced at the OFFICE at end
            of day and served by certified mail. A button that promised paper in a basement
            promised something that does not happen, and its window.open() was likely
            pop-up-blocked on every press anyway (it ran after two awaits; Safari drops
            transient activation across an await). See openBlob's header.

            SAVE / SHARE is now primary, because it is the door to the one thing that DOES
            leave the building in the field: an emailed copy, via the OS share sheet. It also
            cannot be blocked. */}
        <Btn variant="primary" data-testid="notice-generate" className="min-h-[64px]" disabled={busy} onClick={() => renderOnDevice('save')}>
          <Download size={16} aria-hidden="true" /> {busy ? 'Working…' : 'Save / share the notice'}
        </Btn>
        <Btn className="min-h-[64px]" disabled={busy} onClick={() => renderOnDevice('view')}>
          <ExternalLink size={16} aria-hidden="true" /> Open on this device
        </Btn>
        {off.online && (
          <>
            <Btn disabled={busy} onClick={() => generate()}>
              <FileText size={16} aria-hidden="true" /> {notices.length ? 'Regenerate on the server' : 'Generate on the server'}
            </Btn>
            <div className="flex gap-2 items-center">
              <Input aria-label="Email the notice to" type="email" placeholder="occupant@example.com" value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)} className="max-w-[16rem]" />
              <Btn disabled={busy || !emailTo.includes('@')} onClick={() => generate(emailTo)}>
                <Mail size={16} aria-hidden="true" /> Email
              </Btn>
            </div>
          </>
        )}
      </div>
      {!off.online && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No signal — the notice is rendered on this device from your department&rsquo;s own text.
          The exact document you hand over is what gets filed; it is never re-made later.
        </p>
      )}
      {msg && <p className="text-sm font-semibold text-green-700 dark:text-green-400" role="status">{msg}</p>}
      {err && (
        <div role="alert" className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 space-y-2">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">{err}</p>
          {needsSig && (
            <Btn variant="primary" onClick={onNeedInspectorSignature}>
              <FileSignature size={16} aria-hidden="true" /> Go sign the report
            </Btn>
          )}
        </div>
      )}
      {notices.length > 0 && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4">
          {notices.map((n) => (
            <li key={n.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{new Date(n.created_at).toLocaleString()}</p>
                <p className="text-gray-500 dark:text-gray-400">
                  {n.generated_by || 'unknown'} · {(n.bytes / 1024).toFixed(0)} KB{n.sent_to ? ` · emailed to ${n.sent_to}` : ''}
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {/* The integrity hash of the SERVED bytes. It is the same value the server
                      verifies the upload against, so it is worth showing. */}
                  {n.device && <Badge tone="gray">Served from this device · SHA-256 {String(n.sha256).slice(0, 12)}…</Badge>}
                  {n.pending && <Badge tone="amber">Not yet filed — will upload verbatim</Badge>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Btn onClick={() => (n.device ? openDeviceNotice(n.id) : openPdf(n.id))} aria-label="View PDF">
                  <ExternalLink size={16} aria-hidden="true" /> View
                </Btn>
                {/* (The per-notice "Print" button is GONE — 2026-07-14. Nothing prints in the
                    field; Download is the door to the OS share sheet, and the hard copy is
                    produced at the office.) */}
                {/* The door that cannot be blocked. If the OS PDF viewer swallows print()
                    — which we cannot rule out on iPad Safari — a saved file can still be
                    printed, AirDropped, or emailed. The officer always has a way to the paper. */}
                <Btn onClick={() => downloadNotice(n)} aria-label="Download PDF">
                  <Download size={16} aria-hidden="true" /> Download
                </Btn>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── the service ladder ── */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">How it was served</h3>
        <Btn variant={blocked || status?.status !== 'sufficient' ? 'primary' : 'secondary'} disabled={svcBusy} onClick={() => setRecording(true)}>
          <Plus size={16} aria-hidden="true" /> Record service
        </Btn>
      </div>
      {svcErr && <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{svcErr}</p>}
      {service.length === 0 ? (
        <EmptyState icon={MapPin} title="Nothing served yet"
          body="The notice isn't a notice until it's delivered. Record personal service, a posting, or a mailing — the correction clock starts there." />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4">
          {service.map((r) => {
            const failed = r.outcome === 'returned_undelivered' || r.outcome === 'unclaimed';
            return (
              <li key={r.id} className={`py-3 flex flex-wrap items-start justify-between gap-3 ${r.voided_at ? 'opacity-60' : ''}`}>
                <div className="min-w-0 text-sm">
                  <p className={`font-semibold text-gray-900 dark:text-gray-100 ${r.voided_at ? 'line-through' : ''}`}>
                    #{r.attempt_seq} · {METHOD_LABELS[r.method] || r.method}
                  </p>
                  <p className={`${failed ? 'font-bold text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'} ${r.voided_at ? 'line-through' : ''}`}>
                    {OUTCOME_LABELS[r.outcome] || r.outcome}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400">
                    {new Date(r.served_at).toLocaleString()}{r.served_by ? ` · ${r.served_by}` : ''}
                    {r.servee_name ? ` · to ${r.servee_name}${r.servee_relationship ? ` (${r.servee_relationship})` : ''}` : ''}
                    {r.address_used ? ` · ${r.address_used}` : ''}
                    {r.mail_tracking_number ? ` · #${r.mail_tracking_number}` : ''}
                    {r.posting_location_desc ? ` · ${r.posting_location_desc}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {r.has_posting_photo && <Badge tone="green"><Camera size={12} aria-hidden="true" /> Photo on file</Badge>}
                    {r._pending && <Badge tone="amber">Saved on this device</Badge>}
                    {r.voided_at && <Badge tone="gray">Voided — {r.void_reason}</Badge>}
                  </div>
                  {/* A mail event and a void both act on a row the SERVER owns (they key on its
                      id). A record this device has not yet synced has no such id, and we will
                      not invent one — so the actions appear the moment it lands, and until then
                      we say why they are missing. */}
                  {r._pending && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Mail events and voiding become available once this record syncs.
                    </p>
                  )}
                </div>
                {!r.voided_at && !r._pending && (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {MAIL_METHODS.includes(r.method) && (
                      <>
                        <Btn className="min-h-[44px]" disabled={svcBusy} onClick={() => mailEvent(r, 'delivered')}>Delivered</Btn>
                        <Btn variant="danger" data-testid="notice-returned-mail" className="min-h-[44px]" disabled={svcBusy} onClick={() => mailEvent(r, 'returned_undelivered')}>Returned undelivered</Btn>
                        <Btn variant="danger" className="min-h-[44px]" disabled={svcBusy} onClick={() => mailEvent(r, 'unclaimed')}>Unclaimed</Btn>
                      </>
                    )}
                    <Btn variant="ghost" className="min-h-[44px]" disabled={svcBusy || !off.online}
                      title={off.online ? undefined : 'Voiding a filed record needs signal.'}
                      onClick={() => setVoiding({ record: r, reason: '' })}>
                      Void
                    </Btn>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Btn variant="primary" className="w-full min-h-[64px]" onClick={onExit}>Done — back to the queue</Btn>

      {recording && (
        <RecordServiceModal
          onClose={() => setRecording(false)}
          // Through the outbox, always. The recomputed service status comes from the SHARED
          // gate over the row we just added — so a posting recorded in a basement clears a
          // Jones block in that basement, exactly as it would on the server.
          onSave={async (body) => { await onAddService(body); setRecording(false); }}
        />
      )}
      {voiding && (
        <Modal title="Void this service record" onClose={() => setVoiding(null)}>
          <div className="space-y-4">
            {/* Retired, never deleted — these rows are subpoenable. The reason is
                the record of WHY it was retired. */}
            <p className="text-sm text-gray-700 dark:text-gray-300">
              The record stays on the ladder, struck through, with your reason attached. It is never deleted.
              Voiding can change the derived service status — including reopening a required-action block.
            </p>
            <Field label="Reason" hint="At least a few words — this is what a hearing reads.">
              <TextArea rows={2} autoFocus value={voiding.reason} maxLength={500}
                onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })} />
            </Field>
            {svcErr && <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{svcErr}</p>}
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setVoiding(null)}>Keep it</Btn>
              <Btn variant="danger" disabled={svcBusy || voiding.reason.trim().length < 3} onClick={doVoid}>
                {svcBusy ? 'Voiding…' : 'Void the record'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── record-service modal ─────────────────────────────────────────────────────
// The form ADAPTS to the method, because the methods are not variations of one
// thing: personal service is about WHO took it, a posting is about PROOF (photo +
// GPS — the server 400s without them), and a mailing is about WHERE it went and
// what the Postal Service did with it afterwards.
function RecordServiceModal({ onClose, onSave }) {
  const [method, setMethod] = useState('personal_service');
  const [outcome, setOutcome] = useState('served');
  const [serveeName, setServeeName] = useState('');
  const [serveeRelationship, setServeeRelationship] = useState('Occupant');
  const [addressUsed, setAddressUsed] = useState('');
  const [addressSource, setAddressSource] = useState('');
  const [mailClass, setMailClass] = useState('certified_rrr');
  const [mailTrackingNumber, setMailTrackingNumber] = useState('');
  const [photo, setPhoto] = useState(null);
  const [gps, setGps] = useState(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [postingLocationDesc, setPostingLocationDesc] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const isPersonal = PERSONAL_METHODS.includes(method);
  const isPosting  = method === 'posted_premises';
  const isMail     = MAIL_METHODS.includes(method);

  const pickMethod = (m) => {
    setMethod(m);
    setOutcome(m === 'posted_premises' ? 'posted' : MAIL_METHODS.includes(m) ? 'mailed' : 'served');
    if (MAIL_METHODS.includes(m)) {
      setMailClass(m === 'certified_mail' ? 'certified_rrr' : m === 'certificate_of_mailing' ? 'cert_of_mailing' : 'first_class');
    }
  };

  // A posting without a location proves nothing at a hearing, so the fix is
  // REQUIRED here (unlike a signature's best-effort fix). A coarse fix is allowed
  // but called out — the officer may be standing inside a steel building.
  const captureGps = () => {
    setGpsBusy(true); setErr(null);
    if (!navigator.geolocation) { setGpsBusy(false); setErr('This device has no geolocation — a posting cannot be recorded without a location.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); setGpsBusy(false); },
      (e) => { setGps(null); setGpsBusy(false); setErr(`Could not get a location — ${e.message}. The posting needs one.`); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (!/^data:image\/(png|jpeg);base64,/.test(url)) { setErr('The photo must be a JPEG or PNG.'); return; }
      setPhoto(url);
    };
    reader.onerror = () => setErr('Could not read that photo — try again.');
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      // The posting's photo + GPS are validated HERE too (canSave below), not only on the
      // server: offline, a posting record with no proof would sit in the outbox for hours and
      // then be refused — and the officer would already have left the premises.
      await onSave({
        method, outcome, notes: notes.trim(),
        ...(isPersonal ? { serveeName: serveeName.trim(), serveeRelationship: serveeRelationship.trim() } : {}),
        ...(isPosting ? {
          postingPhotoDataUrl: photo,
          postingLat: gps?.lat, postingLng: gps?.lng, postingAccuracyM: gps?.acc,
          postingLocationDesc: postingLocationDesc.trim(),
        } : {}),
        ...(isMail ? {
          addressUsed: addressUsed.trim(), addressSource: addressSource.trim(),
          mailClass, mailTrackingNumber: mailTrackingNumber.trim(),
        } : {}),
      });
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  const coarse = gps && gps.acc > 100;
  const canSave = !busy && (!isPosting || (!!photo && !!gps));

  return (
    <Modal title="Record service" onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="How was it served?">
          <Select value={method} onChange={(e) => pickMethod(e.target.value)}>
            {Object.entries(METHOD_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Field>

        {isPersonal && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Who took it (print name)">
                <Input value={serveeName} onChange={(e) => setServeeName(e.target.value)} maxLength={200} placeholder="e.g. the manager on duty" />
              </Field>
              <Field label="Their relationship to the premises">
                <Select value={serveeRelationship} onChange={(e) => setServeeRelationship(e.target.value)}>
                  {SIGNER_ROLE_LABELS.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Outcome" hint="A refusal is still SERVICE — the person was there and the document was offered. It does not invalidate the notice.">
              <Select data-testid="service-outcome" data-served={outcome} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="served">Served — they took it</option>
                <option value="refused_signature">Served — they declined to sign for it</option>
                <option value="refused_acceptance">Served — they declined to take it; it was left with them</option>
              </Select>
            </Field>
          </>
        )}

        {isPosting && (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Photo of the posted notice (required)</span>
              <label className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 cursor-pointer">
                <Camera size={16} aria-hidden="true" /> {photo ? 'Retake photo' : 'Take photo'}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pickPhoto} />
              </label>
            </div>
            {photo && <img src={photo} alt="The posted notice" className="w-full max-h-56 object-contain rounded-xl border border-gray-200 dark:border-gray-700 bg-white" />}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Posting location (required)</span>
              <Btn disabled={gpsBusy} onClick={captureGps}>
                <MapPin size={16} aria-hidden="true" /> {gpsBusy ? 'Locating…' : gps ? 'Recapture location' : 'Capture location'}
              </Btn>
            </div>
            {gps && (
              <p className={`text-sm font-semibold ${coarse ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`} role="status" aria-live="polite">
                {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} · ±{Math.round(gps.acc)} m
                {coarse && ' — too coarse to place the posting. Recapture outdoors if you can, or describe the location in writing below.'}
              </p>
            )}
            <Field label="Where it was posted" hint="e.g. “taped to the glass of the front entrance, right of the door”.">
              <Input value={postingLocationDesc} onChange={(e) => setPostingLocationDesc(e.target.value)} maxLength={300} />
            </Field>
          </>
        )}

        {isMail && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Address used">
                <Input value={addressUsed} onChange={(e) => setAddressUsed(e.target.value)} maxLength={400} />
              </Field>
              <Field label="Where that address came from" hint="e.g. the tax roll, the permit application, the occupant.">
                <Input value={addressSource} onChange={(e) => setAddressSource(e.target.value)} maxLength={200} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mail class">
                <Select value={mailClass} onChange={(e) => setMailClass(e.target.value)}>
                  <option value="certified_rrr">Certified, return receipt requested</option>
                  <option value="cert_of_mailing">Certificate of mailing</option>
                  <option value="first_class">First-class</option>
                </Select>
              </Field>
              <Field label="Tracking number">
                <Input value={mailTrackingNumber} onChange={(e) => setMailTrackingNumber(e.target.value)} maxLength={120} />
              </Field>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Recorded as <strong>deposited in the mail</strong>. Come back and record what the Postal Service did with it —
              a return is what triggers the required-action cascade.
            </p>
          </>
        )}

        {method === 'email' && (
          <Field label="Outcome">
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="served">Sent</option>
              <option value="delivered">Delivered</option>
            </Select>
          </Field>
        )}

        <Field label="Notes">
          <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>
        {err && <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!canSave} onClick={save}>
            {busy ? 'Recording…' : 'Record service'}
          </Btn>
        </div>
        {isPosting && !canSave && !busy && (
          <p className="text-sm text-gray-600 dark:text-gray-400 text-right">
            A posting needs both a photo and a location — without them the record proves nothing.
          </p>
        )}
      </div>
    </Modal>
  );
}
