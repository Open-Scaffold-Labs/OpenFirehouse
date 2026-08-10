/**
 * DepartmentSetupWizard.jsx — First-time department configuration
 *
 * Runs when the first chief/admin logs in and the department hasn't been set up.
 * 8 steps that configure the system.
 *
 * P4.3 persistence rewrite (2026-06-15): each data step persists to the REAL
 * server endpoints (the server — NOT localStorage — is the store of record), and
 * the wizard HYDRATES from the server on open so partial completion resumes:
 *   - Identity  → PATCH /api/departments/:id  (name, fdid, dept_type, attested size)
 *                 + the HQ station's address (departments has no address column)
 *   - Stations  → GET/POST/PATCH /api/stations  (the signup "mirror" station is
 *                 edited as house #1 — no phantom row; houses 2+ are POSTed)
 *   - Apparatus → GET/POST/PATCH /api/apparatus  (each tagged to its house's
 *                 server station_id; requires a year, defaulted to current year)
 *   - Mutual aid→ GET/POST/PATCH /api/mutual-aid-agreements (partner roster)
 *   - AI key    → POST /api/assistant/key
 *
 *   - Shift mode → PATCH /api/departments/:id (departments.shift_pattern) — the
 *     mode label ("24/48"); the Duty Schedule expands it into concrete templates later.
 *
 * NOT persisted this pass (deliberately, not for lack of a contract):
 *   - Rank → access-level mapping: that is the P4.4 verification gate's job (it sets
 *     the permission-bearing users.role). Collected here, wired in P4.4.
 *
 * localStorage 'of_dept_setup_complete' remains ONLY as a per-browser "don't
 * re-pop the wizard" UI flag — it is no longer the store of record for any data.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Building2, Truck, Calendar, Users, Handshake, Zap, CheckCircle,
  ChevronRight, ChevronLeft, Plus, X, Loader2, Star, AlertTriangle, FileText,
} from 'lucide-react';
import { api, getStoredUser } from '../utils/api';
import { RANKS } from '../data/members';
import { US_STATES, STATE_CODES, toStateCode } from '../constants/usStates';

// 44px min-height: the shared control was 42px and the compact rows 34px, against a
// WCAG 2.5.5 target of 44. index.css DOES carry a 44px floor, but it is scoped
// `.glove-friendly` AND gated `@media (pointer: coarse)`, and this wizard is a
// top-level overlay that applies neither — so it inherited nothing.
// focus-visible rather than focus: a mouse click should not paint a ring, a Tab should.
// ring-offset separates the ring from the field border so it survives on both themes.
const INPUT = 'w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900 bg-white dark:bg-gray-900';

/** A row control in the compact station/apparatus/partner grids (was 34px). */
const INPUT_COMPACT = 'min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 bg-white dark:bg-gray-900';

/**
 * The remove control on a row. It was a bare 14px <X> with no padding and no height —
 * about 10% of the WCAG 2.5.5 target area and below even the 24px AA (2.5.8) floor,
 * with hover as its only affordance. A mis-tap here deletes a station or a rig.
 */
const REMOVE_BTN = 'flex-shrink-0 grid place-items-center h-11 w-11 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500';

/**
 * ONE state control, used on BOTH screens that ask for a state.
 *
 * Step 1 (the department's HQ address) got a picker on 2026-08-04 and step 2 (each
 * station's address) was left as free text — and step 2 is the field that actually
 * persists, so the data-quality hole was closed on the field that goes nowhere and
 * left open on the one that reaches Postgres.
 *
 * It also never renders blank. A `<select>` handed a stored `New Jersey` sets
 * selectedIndex to -1 and shows nothing, while React still holds the value — the field
 * looks unanswered for a department that answered it. `toStateCode` normalises what it
 * recognises; anything it does not is rendered as its own option and labelled, because
 * showing a value nobody expected beats showing an empty box.
 */
function StateSelect({ id, value, onChange, className, ariaLabel }) {
  const code = toStateCode(value);
  const known = STATE_CODES.includes(code);
  return (
    <select id={id} className={className} aria-label={ariaLabel}
      value={code} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select…</option>
      {!known && code && <option value={code}>{code} — unrecognised, please reselect</option>}
      {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
    </select>
  );
}
const SELECT = INPUT;

const STEPS = [
  { id: 'identity', label: 'Department', icon: Shield, color: 'bg-red-600' },
  { id: 'stations', label: 'Stations', icon: Building2, color: 'bg-blue-600' },
  { id: 'apparatus', label: 'Apparatus', icon: Truck, color: 'bg-green-600' },
  { id: 'shifts', label: 'Shifts', icon: Calendar, color: 'bg-purple-600' },
  { id: 'ranks', label: 'Ranks', icon: Users, color: 'bg-amber-600' },
  { id: 'mutualaid', label: 'Mutual Aid', icon: Handshake, color: 'bg-cyan-600' },
  { id: 'notices', label: 'Notices', icon: FileText, color: 'bg-orange-600' },
  { id: 'ai', label: 'AI Setup', icon: Zap, color: 'bg-pink-600' },
  { id: 'review', label: 'Launch', icon: CheckCircle, color: 'bg-red-700' },
];

/**
 * Starting text for the department's notice blocks (2026-07-16, P1-2 follow-up).
 * Notice generation REFUSES while these are unauthored (a legal instrument must
 * never print "[SAMPLE TEXT …]"), so the wizard offers authoring up front. The
 * text below is deliberately generic paraphrase — inserting it is the CHIEF's
 * act of adoption (it lands editable, and the AHJ warning sits right above it);
 * we never silently ship legalese as if the department wrote it.
 * Wording mirrors the renderer defaults (server utils/fiNoticePdf.js) minus the
 * SAMPLE flag, which exists precisely because nobody had adopted them.
 */
const NOTICE_BLOCKS = [
  { key: 'notice_body', label: 'Notice body (violations found)',
    hint: 'Opens the Notice of Violation, above the violation list.',
    starter: 'An inspection of the premises identified below found the following conditions in violation of the fire code adopted by this jurisdiction. You are directed to correct each violation on or before its listed reinspection date.' },
  { key: 'notice_legalese', label: 'Enforcement / appeal language',
    hint: 'The legal consequences and appeal rights paragraph.',
    starter: 'Failure to correct the violations listed on this notice within the time allowed may result in further enforcement action as provided by law. You may have the right to request an extension of time or to appeal this notice; contact the issuing office for the applicable procedure.' },
  { key: 'notice_passed_body', label: 'Passed-inspection wording',
    hint: 'Used when an inspection finds no outstanding violations.',
    starter: 'An inspection of the premises identified below found no outstanding violations at the time of inspection. Thank you for helping keep your community fire-safe.' },
  { key: 'signature_agreement_text', label: 'Signature acknowledgment',
    hint: 'Shown beside the occupant’s signature line.',
    starter: 'Signature acknowledges receipt of this notice only and does not constitute an admission of any violation.' },
];

const DEPT_TYPES = ['Volunteer', 'Career', 'Combination', 'Industrial', 'Military', 'Private'];
const SHIFT_PATTERNS = ['24/48', 'Kelly Schedule', '48/96', 'Day/Night (12hr)', 'Volunteer (No Shifts)', '10/14', 'Custom'];
const APPARATUS_TYPES = ['Engine', 'Truck/Ladder', 'Rescue', 'Tanker/Tender', 'Squad', 'Ambulance/EMS', 'Chief', 'Brush', 'Marine', 'Hazmat', 'Air/Light', 'Utility', 'Other'];
const CURRENT_YEAR = new Date().getFullYear();

export default function DepartmentSetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [error, setError] = useState(null);

  // ── Form state ──
  const [dept, setDept] = useState({
    id: null, name: '', fdid: '', address: '', city: '', state: '', zip: '',
    county: '', phone: '', email: '', website: '',
    type: 'Volunteer', memberCount: '',
  });

  // Each station carries its server `id` once persisted. The HQ (house #1) is the
  // signup mirror station — the lowest id — which we EDIT rather than duplicate.
  const [stations, setStations] = useState([
    { id: null, name: 'Station 1', address: '', city: '', state: '', isHQ: true },
  ]);

  // Apparatus tag a house by its server station_id (resolved/defaulted at save).
  const [apparatus, setApparatus] = useState([
    { id: null, designation: 'Engine 1', type: 'Engine', station_id: null, year: CURRENT_YEAR, status: 'In Service' },
  ]);

  const [shiftPattern, setShiftPattern] = useState('Volunteer (No Shifts)');
  const [ranks, setRanks] = useState(RANKS.map((r, i) => ({
    name: r, level: i === 0 ? 'Admin' : i < 3 ? 'Officer' : 'Member',
  })));
  const [mutualAid, setMutualAid] = useState([]); // { id?, name, phone, distance }
  const [aiConfig, setAiConfig] = useState({ provider: 'anthropic', apiKey: '', enableAI: true });
  // The department's notice text blocks (fi_settings). Empty = unauthored; the
  // Prevention gate (NOTICE_TEMPLATES_UNCONFIGURED) refuses notices until authored.
  const [noticeText, setNoticeText] = useState({
    notice_body: '', notice_legalese: '', notice_passed_body: '', signature_agreement_text: '',
  });
  // Rows removed in the UI after being persisted must be DELETED server-side on the
  // next save — without this, a removed house/rig/partner silently survives as a
  // ghost row (found in the 2026-07-16 wizard audit).
  const [removedIds, setRemovedIds] = useState({ stations: [], apparatus: [], partners: [] });

  // ── Hydrate from the server on open (resume partial setup) ──────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, stRes, apRes, maRes, fiRes] = await Promise.allSettled([
          api.get('/api/departments/me'),
          api.get('/api/stations'),
          api.get('/api/apparatus'),
          api.get('/api/mutual-aid-agreements'),
          api.get('/api/fi-settings'),
        ]);
        if (cancelled) return;

        if (meRes.status === 'fulfilled' && meRes.value?.data) {
          const d = meRes.value.data;
          setDept((prev) => ({ ...prev, id: d.id, name: d.name || prev.name, fdid: d.fdid || prev.fdid, type: d.dept_type || prev.type }));
          if (d.shift_pattern) setShiftPattern(d.shift_pattern);
        }

        let serverStations = [];
        if (stRes.status === 'fulfilled' && Array.isArray(stRes.value?.data) && stRes.value.data.length) {
          // Lowest id = the HQ / mirror house.
          serverStations = [...stRes.value.data].sort((a, b) => a.id - b.id);
          const hqId = serverStations[0].id;
          setStations(serverStations.map((s) => ({
            id: s.id, name: s.name || '', address: s.address || '', city: s.city || '', state: s.state || '',
            isHQ: s.id === hqId,
          })));
          // Pull the dept contact fields up from the HQ house (departments has no
          // address/zip/phone/email columns — house #1 carries them).
          setDept((prev) => ({
            ...prev,
            address: prev.address || serverStations[0].address || '',
            city: prev.city || serverStations[0].city || '',
            state: prev.state || serverStations[0].state || '',
            zip: prev.zip || serverStations[0].zip || '',
            phone: prev.phone || serverStations[0].phone || '',
            email: prev.email || serverStations[0].email || '',
          }));
        }

        if (fiRes.status === 'fulfilled' && fiRes.value?.data) {
          const f = fiRes.value.data;
          setNoticeText({
            notice_body: f.notice_body || '',
            notice_legalese: f.notice_legalese || '',
            notice_passed_body: f.notice_passed_body || '',
            signature_agreement_text: f.signature_agreement_text || '',
          });
        }

        if (apRes.status === 'fulfilled' && Array.isArray(apRes.value?.data) && apRes.value.data.length) {
          setApparatus(apRes.value.data.map((a) => ({
            id: a.id, designation: a.designation || '', type: a.type || 'Engine',
            station_id: a.station_id ?? (serverStations[0]?.id ?? null),
            year: a.year || CURRENT_YEAR, status: a.status || 'In Service',
          })));
        }

        if (maRes.status === 'fulfilled' && Array.isArray(maRes.value?.data) && maRes.value.data.length) {
          setMutualAid(maRes.value.data.map((m) => ({
            id: m.id, name: m.partner_agency || '', phone: m.partner_phone || '',
            distance: m.distance_miles != null ? String(m.distance_miles) : '',
          })));
        }
      } catch {
        /* hydration is best-effort; a fresh dept simply starts from defaults */
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Local helpers ──
  const addStation = () => setStations((s) => [...s, { id: null, name: `Station ${s.length + 1}`, address: '', city: '', state: '', isHQ: false }]);
  const removeStation = (i) => {
    // NEVER re-parent a rig without consent. saveApparatus() re-homes any apparatus
    // whose station_id is no longer valid to the HQ house — correct as a safety net,
    // silent as a behaviour. A chief who deletes Station 2 has not agreed to move
    // Engine 2, and would not find out until the fleet list looked wrong later.
    const gone = stations[i];
    const moving = apparatus.filter((a) => gone?.id && a.station_id === gone.id && a.designation?.trim());
    if (moving.length) {
      const names = moving.map((a) => a.designation.trim()).join(', ');
      const hq = stations[0]?.name || 'the first station';
      // eslint-disable-next-line no-alert
      if (!window.confirm(
        `${gone.name || 'This station'} has ${moving.length} apparatus assigned.\n\n`
        + `Removing it will reassign ${names} to ${hq}.\n\nRemove the station?`,
      )) return;
    }
    setStations((s) => {
      const g = s[i];
      if (g?.id) setRemovedIds((r) => ({ ...r, stations: [...r.stations, g.id] }));
      return s.filter((_, idx) => idx !== i);
    });
  };
  const updateStation = (i, k, v) => setStations((s) => s.map((st, idx) => (idx === i ? { ...st, [k]: v } : st)));

  const addApparatus = () => setApparatus((a) => [...a, { id: null, designation: '', type: 'Engine', station_id: stations[0]?.id ?? null, year: CURRENT_YEAR, status: 'In Service' }]);
  const removeApparatus = (i) => {
    // Second-order risk of allowing the LAST row to be removed: a chief with one
    // already-persisted rig can now delete it with a single 44px tap, and
    // flushRemovals issues the server DELETE at the next save. So confirm — but only
    // for a row that exists on the server. Confirming an unsaved blank row would be
    // nagging, and nagging is how a confirm stops being read.
    const gone = apparatus[i];
    if (gone?.id) {
      const what = gone.designation?.trim() || 'this apparatus';
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Remove ${what} from your fleet?\n\nIt will be deleted when this step saves.`)) return;
    }
    setApparatus((a) => {
      const g = a[i];
      if (g?.id) setRemovedIds((r) => ({ ...r, apparatus: [...r.apparatus, g.id] }));
      return a.filter((_, idx) => idx !== i);
    });
  };
  // `_touched` records that the CHIEF edited this row, which is the only reliable
  // signal that a nameless row represents intended work rather than an untouched
  // default. It is UI-only — every save path builds its payload field by field, so
  // this never reaches the server.
  const updateApparatus = (i, k, v) => setApparatus((a) => a.map((ap, idx) => (idx === i ? { ...ap, [k]: v, _touched: true } : ap)));

  const addPartner = () => setMutualAid((m) => [...m, { id: null, name: '', phone: '', distance: '' }]);
  const removePartner = (i) => setMutualAid((m) => {
    const gone = m[i];
    if (gone?.id) setRemovedIds((r) => ({ ...r, partners: [...r.partners, gone.id] }));
    return m.filter((_, idx) => idx !== i);
  });
  const updatePartner = (i, k, v) => setMutualAid((m) => m.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));

  // Rows deleted in the UI get deleted on the server at the next save of their
  // step — otherwise a removed house/rig/partner survives as a ghost row.
  async function flushRemovals(kind, path) {
    const ids = removedIds[kind];
    if (!ids.length) return;
    for (const id of ids) {
      try { await api.delete(`${path}/${id}`); }
      catch (e) {
        // 404 = already gone (double-remove or another session) — that's the goal state.
        if (e?.status !== 404) throw e;
      }
    }
    setRemovedIds((r) => ({ ...r, [kind]: [] }));
  }

  const singleStation = stations.length <= 1; // size-aware rendering

  // ── AI suggestion (advisory copy only) ──
  function getAISuggestion() {
    if (dept.type === 'Volunteer' && parseInt(dept.memberCount) < 30) {
      return "Small volunteer department — defaults simplified: single station, volunteer (sign-up) scheduling, LOSAP tracking on.";
    }
    if (dept.type === 'Career') {
      return "Career department — 24/48 shift defaults and full staffing tools enabled.";
    }
    return null;
  }

  // ── Per-step server persistence (idempotent: server id ⇒ PATCH, else POST) ──

  async function saveIdentity() {
    if (!dept.id) return; // hydrate failed to find the dept; launch reconcile retries
    const body = { name: dept.name.trim(), fdid: dept.fdid || undefined, dept_type: dept.type, shift_pattern: shiftPattern };
    const members = parseInt(dept.memberCount, 10);
    if (!Number.isNaN(members)) body.attestedMembers = members;
    await api.patch(`/api/departments/${dept.id}`, body);
  }

  // Persists every house and returns the updated station list (with server ids).
  async function saveStations() {
    await flushRemovals('stations', '/api/stations');
    const next = [...stations];
    for (let i = 0; i < next.length; i++) {
      const s = next[i];
      const payload = { name: (s.name || '').trim() || `Station ${i + 1}`, address: s.address || '', city: s.city || '', state: s.state || '' };
      // House #1 carries the department's contact fields (departments has no
      // address/zip/phone/email columns). Before 2026-07-16 the wizard COLLECTED
      // phone/zip and silently dropped them — collected means persisted.
      if (i === 0) {
        // ...and on 2026-08-04 that same sentence was found to be false three lines
        // below itself: the 07-16 fix lifted zip/phone/email and left address/city/
        // state behind, so the HQ address a chief types on step 1 under the label
        // "Address (your HQ station)" went nowhere. `stations` genuinely owns these
        // columns — do NOT send them to PATCH /api/departments, whose schema is a
        // looseObject that returns 200 and discards unknown keys, i.e. a fix that
        // looks like it worked.
        // Order is load-bearing: dept value first, then whatever step 2 already holds,
        // so advancing step 2 can never blank an address the chief typed there.
        payload.address = dept.address || s.address || '';
        payload.city = dept.city || s.city || '';
        // Only send state when we have one — a blank must not overwrite a good value.
        if (dept.state || s.state) payload.state = dept.state || s.state;
        payload.zip = dept.zip || '';
        payload.phone = dept.phone || '';
        payload.email = dept.email || '';
      }
      if (s.id) {
        const r = await api.patch(`/api/stations/${s.id}`, payload);
        next[i] = { ...s, ...payload, id: r.data.id };
      } else {
        const r = await api.post('/api/stations', payload);
        next[i] = { ...s, ...payload, id: r.data.id };
      }
    }
    setStations(next);
    return next;
  }

  // Persists apparatus; resolves each rig's house to a server station_id.
  async function saveApparatus(savedStations) {
    await flushRemovals('apparatus', '/api/apparatus');
    const houses = savedStations || stations;
    const hqId = houses[0]?.id ?? null;
    const validHouseIds = new Set(houses.map((h) => h.id).filter(Boolean));
    const next = [...apparatus];
    for (let i = 0; i < next.length; i++) {
      const a = next[i];
      if (!a.designation || !a.designation.trim()) continue; // skip blank rows
      const houseId = validHouseIds.has(a.station_id) ? a.station_id : hqId;
      const payload = {
        designation: a.designation.trim(), type: a.type, year: Number(a.year) || CURRENT_YEAR,
        status: a.status || 'In Service',
        ...(houseId ? { station_id: houseId } : {}),
      };
      if (a.id) {
        const r = await api.patch(`/api/apparatus/${a.id}`, payload);
        next[i] = { ...a, ...payload, id: r.data.id };
      } else {
        const r = await api.post('/api/apparatus', payload);
        next[i] = { ...a, ...payload, id: r.data.id };
      }
    }
    setApparatus(next);
  }

  async function savePartners() {
    await flushRemovals('partners', '/api/mutual-aid-agreements');
    const next = [...mutualAid];
    for (let i = 0; i < next.length; i++) {
      const p = next[i];
      if (!p.name || !p.name.trim()) continue; // skip blank rows
      const payload = {
        partner_agency: p.name.trim(),
        partner_phone: p.phone || '',
        distance_miles: parseFloat(p.distance) || 0,
      };
      if (p.id) {
        await api.patch(`/api/mutual-aid-agreements/${p.id}`, payload);
      } else {
        const row = await api.post('/api/mutual-aid-agreements', payload); // returns the row directly
        next[i] = { ...p, id: row?.id ?? p.id };
      }
    }
    setMutualAid(next);
  }

  async function saveAiKey() {
    if (aiConfig.enableAI && aiConfig.apiKey) {
      await api.post('/api/assistant/key', { apiKey: aiConfig.apiKey });
    }
  }

  // Persists whichever notice blocks the chief authored. Sends ONLY non-empty
  // values — re-running the wizard must never blank text a department already
  // wrote in Prevention Settings. All four empty = nothing to save (the step is
  // skippable; the Prevention gate keeps protecting the notice).
  async function saveNoticeText() {
    const body = {};
    for (const { key } of NOTICE_BLOCKS) {
      const v = (noticeText[key] || '').trim();
      if (v) body[key] = v;
    }
    if (Object.keys(body).length) await api.patch('/api/fi-settings', body);
  }

  // Persist the data step we're leaving, dispatched by STEP ID — the 2026-07-16
  // audit found this switch keyed on raw indices, which silently mis-saves the
  // moment anyone inserts or reorders a step (exactly what adding Notices did).
  // Throws bubble up to advance()/handleLaunch.
  async function persistStep(idx) {
    switch (STEPS[idx]?.id) {
      case 'identity': return saveIdentity();
      case 'stations': { await saveStations(); return; }
      case 'apparatus': { await saveApparatus(); return; }
      case 'shifts': return saveIdentity();   // shift_pattern is a department field
      case 'mutualaid': return savePartners();
      case 'notices': return saveNoticeText();
      case 'ai': return saveAiKey();
      // 'ranks' (rank→role) is the P4.4 verification gate's job — collected, not persisted here.
      default: return;
    }
  }

  async function advance() {
    if (!canAdvance()) return;
    setError(null);
    setSaving(true);
    try {
      await persistStep(step);
      setStep((s) => s + 1);
    } catch (e) {
      setError(e?.message || 'Could not save this step. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    setError(null);
    if (step > 0) setStep(step - 1);
  }

  async function handleLaunch() {
    setError(null);
    setSaving(true);
    try {
      // Reconcile everything (covers Quick Setup, which jumps straight here).
      await saveIdentity();
      const savedStations = await saveStations();
      await saveApparatus(savedStations);
      await savePartners();
      await saveNoticeText();
      await saveAiKey();
      localStorage.setItem('of_dept_setup_complete', 'true'); // UI "seen" flag only
      setSaving(false);
      onComplete();
    } catch (e) {
      setSaving(false);
      setError(e?.message || 'Launch failed while saving to the server. Nothing was lost — fix the issue and try again.');
    }
  }

  // Is this a demo run? `?demo=1` on the URL, or a dev build. Read once per render;
  // the wizard is a modal so there is no navigation to invalidate it.
  const showQuickSetup = (() => {
    if (import.meta.env?.DEV) return true;
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('demo') === '1') return true;
      // Hash-routed app: `?demo=1` can land after the hash too.
      const h = window.location.hash || '';
      return /[?&]demo=1(&|$)/.test(h);
    } catch (_) { return false; }
  })();

  // Quick Setup — fills demo defaults and jumps to launch (still persists for real).
  // Reachable ONLY when showQuickSetup is true; see the gate at its call site.
  function quickSetup() {
    setDept((d) => ({ ...d, name: 'Maplewood VFD', fdid: '34567', address: '100 Main St', city: 'Maplewood', state: 'NJ', zip: '07040', county: 'Essex', phone: '(555) 555-0100', email: 'chief@maplewoodvfd.org', website: '', type: 'Volunteer', memberCount: '25' }));
    setStations((s) => [{ ...(s[0] || {}), id: s[0]?.id ?? null, name: 'Station 14', address: '100 Main St', city: 'Maplewood', state: 'NJ', isHQ: true }]);
    setApparatus([
      { id: null, designation: 'Engine 1', type: 'Engine', station_id: stations[0]?.id ?? null, year: CURRENT_YEAR, status: 'In Service' },
      { id: null, designation: 'Truck 1', type: 'Truck/Ladder', station_id: stations[0]?.id ?? null, year: CURRENT_YEAR, status: 'In Service' },
      { id: null, designation: 'Rescue 1', type: 'Rescue', station_id: stations[0]?.id ?? null, year: CURRENT_YEAR, status: 'In Service' },
    ]);
    setShiftPattern('Volunteer (No Shifts)');
    setStep(STEPS.length - 1); // the review/launch step — never a raw index (audit 2026-07-16)
  }

  /**
   * Why this is more than a name check.
   *
   * `saveApparatus` and `savePartners` both `continue` past a row whose key field is
   * blank ("skip blank rows"). That is right for an untouched row the chief added and
   * ignored — and it is DATA LOSS for a row they half-filled. Select Tanker/Tender,
   * type 2011, pick a house, forget the designation: the row stays on screen, Next
   * looks like it worked, and the rig is gone with no message. The save layer cannot
   * tell those two cases apart, so the wizard has to: a row with SOME content and no
   * key field blocks Next and says which field is missing.
   *
   * Returns null when the step may advance, or a human sentence explaining what to fix.
   */
  const blockingReason = useCallback(() => {
    const id = STEPS[step]?.id;
    if (id === 'identity') {
      if (!dept.name.trim()) return 'Enter your department name to continue.';
      if (dept.fdid && !/^\d{5}$/.test(dept.fdid.trim())) {
        return 'FDID is the 5-digit identifier your state assigned your department. Leave it blank if you do not know it — a wrong FDID follows every state report you file.';
      }
      const yr = dept.memberCount && Number(dept.memberCount);
      if (dept.memberCount && (!Number.isFinite(yr) || yr < 0 || yr > 5000)) {
        return 'Approximate members should be a plain number.';
      }
      return null;
    }
    if (id === 'apparatus') {
      // `_touched` is set by updateApparatus, so this is what the chief actually
      // EDITED — never inferred from how a row compares to its defaults. The first
      // version of this check did infer, and it deadlocked the step: once stations
      // save and receive real ids, an untouched default row's station_id no longer
      // equalled stations[0].id, so the row read as half-filled and Next stayed
      // disabled forever — and with a single row the remove button is hidden, so a
      // department that owns no apparatus could not leave step 3 at all. Caught by
      // the contrast runner walking the steps, one hour after I shipped it.
      const half = apparatus.findIndex((a) => a._touched && !a.designation?.trim());
      if (half !== -1) return `Give apparatus #${half + 1} a designation (for example "Engine 1"), or remove the row — otherwise it will not be saved.`;
      const badYear = apparatus.find((a) => a.designation?.trim() && a.year
        && (Number(a.year) < 1900 || Number(a.year) > CURRENT_YEAR + 1));
      if (badYear) return `${badYear.designation.trim()} has a year of ${badYear.year}. Use a year between 1900 and ${CURRENT_YEAR + 1}.`;
      return null;
    }
    if (id === 'mutualaid') {
      // A row counts as "half-filled" only when the chief actually put data in it.
      // distance_miles has a DB DEFAULT of 0 and hydration stringifies it ("0.0"),
      // so a zero/blank distance is NOT data — `String(p.distance).trim()` treated
      // it as data and deadlocked this step on any legacy all-empty row (found live
      // 2026-08-05: an empty agreements row from before the silent-discard guard
      // blocked Next forever, in both themes). Same class of bug as the apparatus
      // check inferring from defaults; the comment that used to sit here claimed
      // this check read "only fields the chief types into" — it did not.
      const hasData = (p) => !!(p.phone?.trim() || parseFloat(p.distance) > 0);
      const half = mutualAid.findIndex((p) => !p.name?.trim() && hasData(p));
      if (half !== -1) return `Name the department in mutual-aid row #${half + 1}, or remove the row — otherwise it will not be saved.`;
      return null;
    }
    return null;
  }, [step, dept.name, dept.fdid, dept.memberCount, apparatus, mutualAid, stations]);

  const canAdvance = useCallback(() => blockingReason() === null, [blockingReason]);

  // ── Render step content (dispatched by STEP ID — see persistStep) ──
  function renderStep() {
    switch (STEPS[step]?.id) {
      case 'identity': return (
        <div className="space-y-4">
          {/* DEMO-ONLY, GATED. This card was the loudest element on the first screen a
              fire chief ever sees — border-2, font-black, above the form — and it writes
              a fictional department ("Maplewood VFD", FDID 34567, a Station 14 that does
              not even match the department name, three invented rigs) into the chief's
              REAL department and jumps to Launch, which persists it for real. Its own
              subtitle, "Still saved to the server", was worded as reassurance when its
              actual meaning is a warning, and this wizard has no start-over path.
              A non-technical chief clicking the brightest thing on screen is the
              expected behaviour, not the edge case.
              It stays because it is genuinely useful for demos — but only where a demo
              is what is happening: `?demo=1`, or a dev build. Never in the customer path. */}
          {showQuickSetup && (
            <button onClick={quickSetup}
              className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-950/50 border-2 border-dashed border-amber-400 dark:border-amber-700 rounded-xl transition-all text-left">
              <Zap size={20} className="text-amber-700 dark:text-amber-300 flex-shrink-0" />
              <div>
                <p className="text-sm font-black text-amber-900 dark:text-amber-200">Demo only — fill with sample data</p>
                <p className="text-xs text-amber-800 dark:text-amber-300">Overwrites your entries with a fictional department (Maplewood VFD) and saves it to this department for real. Not for live setup.</p>
              </div>
              <ChevronRight size={16} className="text-amber-600 dark:text-amber-400 ml-auto" />
            </button>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-300">Tell us about your department. This information configures the entire system.</p>
          {/* Every control below is id/htmlFor-associated. They used to be SIBLING
              labels with no htmlFor and no id, so the whole of step 1 — the first screen
              of onboarding — was programmatically unlabelled and a screen reader
              announced eight bare edit fields (WCAG 3.3.2 / 4.1.2). `required` and
              `aria-describedby` carry what the bare `*` and the grey hint only implied. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="dept-name" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Department Name *</label>
              <input id="dept-name" required className={INPUT} value={dept.name} onChange={e => setDept(d => ({ ...d, name: e.target.value }))} placeholder="Maplewood Volunteer Fire Department" />
            </div>
            <div>
              <label htmlFor="dept-fdid" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">FDID</label>
              <input id="dept-fdid" inputMode="numeric" aria-describedby="dept-fdid-help" className={INPUT} value={dept.fdid} onChange={e => setDept(d => ({ ...d, fdid: e.target.value }))} placeholder="12345" />
              {/* FDID had no help text at all, and it is the field a chief stalls on 30
                  seconds in. It is optional here, and a guessed value follows every state
                  report they ever file — so say both. */}
              <p id="dept-fdid-help" className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">Your state-assigned 5-digit ID. Optional — leave blank rather than guess.</p>
            </div>
            <div>
              <label htmlFor="dept-type" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Department Type</label>
              <select id="dept-type" className={SELECT} value={dept.type} onChange={e => setDept(d => ({ ...d, type: e.target.value }))}>
                {DEPT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label htmlFor="dept-address" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Address <span className="text-gray-600 dark:text-gray-400 font-normal">(your HQ station)</span></label>
              <input id="dept-address" autoComplete="street-address" className={INPUT} value={dept.address} onChange={e => setDept(d => ({ ...d, address: e.target.value }))} placeholder="123 Main Street" />
            </div>
            <div>
              <label htmlFor="dept-city" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">City</label>
              <input id="dept-city" autoComplete="address-level2" className={INPUT} value={dept.city} onChange={e => setDept(d => ({ ...d, city: e.target.value }))} placeholder="Maplewood" />
            </div>
            <div>
              <label htmlFor="dept-state" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">State</label>
              {/* A closed set typed as free text is a data-quality hole: "NJ", "N.J.",
                  "New Jersey" and "nj" all reached the server and every state report. */}
              <StateSelect id="dept-state" className={SELECT} value={dept.state}
                onChange={(v) => setDept(d => ({ ...d, state: v }))} />
            </div>
            <div>
              <label htmlFor="dept-members" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Approximate Members</label>
              <input id="dept-members" type="number" min="0" max="5000" aria-describedby="dept-members-help" className={INPUT} value={dept.memberCount} onChange={e => setDept(d => ({ ...d, memberCount: e.target.value }))} placeholder="25" />
              {/* This is an attestation — saveIdentity sends it as attestedMembers and it
                  drives tier classification. The field gave no sign it did anything. */}
              <p id="dept-members-help" className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">A rough count is fine. Used to size your plan.</p>
            </div>
            <div>
              <label htmlFor="dept-phone" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Phone</label>
              <input id="dept-phone" type="tel" autoComplete="tel" className={INPUT} value={dept.phone} onChange={e => setDept(d => ({ ...d, phone: e.target.value }))} placeholder="(555) 555-0100" />
            </div>
          </div>
          {getAISuggestion() && (
            <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 rounded-xl px-4 py-3 flex items-start gap-3">
              <Zap size={16} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-purple-700 dark:text-purple-300">{getAISuggestion()}</p>
            </div>
          )}
        </div>
      );

      case 'stations': return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {singleStation
              ? "Your firehouse. Most volunteer departments run a single station — add more only if you operate several."
              : "Your firehouses. House #1 is your HQ; add the rest below."}
          </p>
          {stations.map((s, i) => (
            <div key={s.id ?? i} className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-700 space-y-2">
              <div className="flex items-center gap-2">
                <input className={INPUT} value={s.name} onChange={e => updateStation(i, 'name', e.target.value)} placeholder="Station name" aria-label="Station name" />
                {s.isHQ && <span className="text-[10px] font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded-full">HQ</span>}
                {stations.length > 1 && !s.isHQ && <button onClick={() => removeStation(i)} aria-label="Remove station" className={REMOVE_BTN}><X size={18} /></button>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input className={INPUT} value={s.address} onChange={e => updateStation(i, 'address', e.target.value)} placeholder="Address" aria-label="Station address" />
                <input className={INPUT} value={s.city} onChange={e => updateStation(i, 'city', e.target.value)} placeholder="City" aria-label="Station city" />
                {/* The SAME control as step 1. This is the field that actually reaches
                    Postgres, so leaving it as free text closed the data-quality hole on
                    the field that goes nowhere and left it open on the one that counts. */}
                <StateSelect className={INPUT} value={s.state}
                  onChange={(v) => updateStation(i, 'state', v)} ariaLabel="Station state" />
              </div>
            </div>
          ))}
          <button onClick={addStation} className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300">
            <Plus size={13} /> Add Station
          </button>
        </div>
      );

      case 'apparatus': return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Add your apparatus and assign each to a house.</p>
          {apparatus.map((a, i) => (
            <div key={a.id ?? i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 rounded-lg p-2 border border-gray-200 dark:border-gray-700 flex-wrap">
              <input className={`flex-1 min-w-[120px] ${INPUT_COMPACT}`} value={a.designation} onChange={e => updateApparatus(i, 'designation', e.target.value)} placeholder="Engine 1" aria-label="Apparatus designation" />
              <select className={INPUT_COMPACT} value={a.type} onChange={e => updateApparatus(i, 'type', e.target.value)} aria-label="Apparatus type">
                {APPARATUS_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input type="number" className={`w-20 ${INPUT_COMPACT}`} value={a.year} onChange={e => updateApparatus(i, 'year', e.target.value)} placeholder="Year" aria-label="Apparatus year" />
              {!singleStation && (
                <select className={INPUT_COMPACT} value={a.station_id ?? ''} onChange={e => updateApparatus(i, 'station_id', e.target.value ? Number(e.target.value) : null)} aria-label="Assigned station">
                  <option value="">House…</option>
                  {stations.filter(s => s.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              {/* `> 0`, not `> 1`. blockingReason() tells the chief to "remove the row"
                  when a designation is blank — and this button was hidden in exactly
                  that state on a single-row list, so the guard's own remedy did not
                  exist. A department that owns no apparatus must be able to say so by
                  having none. (Stations deliberately keep `> 1`: the server answers 409
                  LAST_STATION, so offering it there would fail server-side.) */}
              {apparatus.length > 0 && <button onClick={() => removeApparatus(i)} aria-label="Remove apparatus" className={REMOVE_BTN}><X size={18} /></button>}
            </div>
          ))}
          <button onClick={addApparatus} className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300">
            <Plus size={13} /> Add Apparatus
          </button>
        </div>
      );

      case 'shifts': return (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">How does your department schedule shifts?</p>
          <div className="grid grid-cols-2 gap-2">
            {SHIFT_PATTERNS.map(p => (
              <button key={p} onClick={() => setShiftPattern(p)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  shiftPattern === p ? 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800 shadow-sm' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
                <p className={`text-sm font-bold ${shiftPattern === p ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>{p}</p>
              </button>
            ))}
          </div>
          {shiftPattern === 'Volunteer (No Shifts)' && (
            <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">Volunteer mode: no fixed shifts. Members sign up for availability instead of assigned rotations.</p>
            </div>
          )}
          <p className="text-[11px] text-gray-600 dark:text-gray-400">You'll build concrete shift templates in Duty Schedule after launch — this just sets your starting style.</p>
        </div>
      );

      case 'ranks': return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Your rank structure (pre-loaded — customize as needed). Mapping ranks to access levels happens when you verify members.</p>
          {ranks.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-5">{i + 1}</span>
              <input className={`flex-1 ${INPUT_COMPACT}`} value={r.name} aria-label="Rank name"
                onChange={e => setRanks(rs => rs.map((rk, idx) => idx === i ? { ...rk, name: e.target.value } : rk))} />
              <select className={INPUT_COMPACT} value={r.level} aria-label="Rank access level"
                onChange={e => setRanks(rs => rs.map((rk, idx) => idx === i ? { ...rk, level: e.target.value } : rk))}>
                <option>Admin</option><option>Officer</option><option>Member</option>
              </select>
              {ranks.length > 3 && <button onClick={() => setRanks(rs => rs.filter((_, idx) => idx !== i))} aria-label="Remove rank" className={REMOVE_BTN}><X size={18} /></button>}
            </div>
          ))}
          <button onClick={() => setRanks(rs => [...rs, { name: '', level: 'Member' }])} className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300">
            <Plus size={13} /> Add Rank
          </button>
        </div>
      );

      case 'mutualaid': return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Neighboring departments you exchange mutual aid with. You can add more later.</p>
          {mutualAid.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No partners yet. Add one below, or skip this step.</p>
          )}
          {mutualAid.map((p, i) => (
            <div key={p.id ?? i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
              <input className={`flex-1 ${INPUT_COMPACT}`} value={p.name} onChange={e => updatePartner(i, 'name', e.target.value)} placeholder="Department name" aria-label="Partner department name" />
              <input className={`w-32 ${INPUT_COMPACT}`} value={p.phone} onChange={e => updatePartner(i, 'phone', e.target.value)} placeholder="Phone" aria-label="Partner phone" />
              <input className={`w-20 ${INPUT_COMPACT}`} value={p.distance} onChange={e => updatePartner(i, 'distance', e.target.value)} placeholder="Miles" aria-label="Distance in miles" />
              <button onClick={() => removePartner(i)} aria-label="Remove partner department" className={REMOVE_BTN}><X size={18} /></button>
            </div>
          ))}
          <button onClick={addPartner} className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300">
            <Plus size={13} /> Add Partner Department
          </button>
        </div>
      );

      case 'notices': return (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            When an inspection cites violations, OpenFirehouse generates a <strong>Notice of
            Violation</strong> — a legal document served on the property owner. The wording is
            YOUR department's, and a notice cannot be generated until it's written. Author it
            now, or skip and do it later in Prevention Center → Settings → Notices.
          </p>
          <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Review this wording with your authority having jurisdiction.</strong> The
              starting text is a generic template — inserting it adopts it as your department's
              own, and it prints on served legal documents exactly as written here.
            </p>
          </div>
          {NOTICE_BLOCKS.map(({ key, label, hint, starter }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor={`notice-${key}`} className="block text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</label>
                {!(noticeText[key] || '').trim() && (
                  <button
                    onClick={() => setNoticeText((t) => ({ ...t, [key]: starter }))}
                    className="text-[11px] font-bold text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200"
                  >
                    Insert starting text
                  </button>
                )}
              </div>
              <textarea
                id={`notice-${key}`}
                className={`${INPUT} min-h-[72px] resize-y`}
                value={noticeText[key]}
                onChange={(e) => setNoticeText((t) => ({ ...t, [key]: e.target.value }))}
                placeholder={starter}
              />
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">{hint}</p>
            </div>
          ))}
        </div>
      );

      case 'ai': return (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">OpenFirehouse's AI features turn on with an API key. Add one now, or skip and add later in Settings.</p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={aiConfig.enableAI} onChange={e => setAiConfig(c => ({ ...c, enableAI: e.target.checked }))} className="rounded" />
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Enable AI features</span>
            </label>
          </div>
          {aiConfig.enableAI && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">AI Provider</label>
                <select className={SELECT} value={aiConfig.provider} onChange={e => setAiConfig(c => ({ ...c, provider: e.target.value }))}>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">API Key</label>
                <input type="password" className={INPUT} value={aiConfig.apiKey} onChange={e => setAiConfig(c => ({ ...c, apiKey: e.target.value }))} placeholder="sk-..." />
                <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">Your key is encrypted and stored on the server. Never sent to the browser.</p>
              </div>
            </div>
          )}
          <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">The platform works fully without AI — it just gets smarter with it.</p>
          </div>
        </div>
      );

      case 'review': return (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-950/50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">Ready to Launch!</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Launch saves everything to your department on the server.</p>
          </div>
          <div className="space-y-2">
            <SummaryRow icon={<Shield size={14} className="text-red-600 dark:text-red-400" />} text={<span><strong>{dept.name || '—'}</strong> — {dept.type}</span>} />
            <SummaryRow icon={<Building2 size={14} className="text-blue-600 dark:text-blue-400" />} text={`${stations.length} station${stations.length > 1 ? 's' : ''}`} />
            <SummaryRow icon={<Truck size={14} className="text-green-600 dark:text-green-400" />} text={`${apparatus.filter(a => a.designation && a.designation.trim()).length} apparatus`} />
            <SummaryRow icon={<Calendar size={14} className="text-purple-600 dark:text-purple-400" />} text={shiftPattern} />
            <SummaryRow icon={<Users size={14} className="text-amber-600 dark:text-amber-400" />} text={`${ranks.length} ranks defined`} />
            <SummaryRow icon={<Handshake size={14} className="text-cyan-600 dark:text-cyan-400" />} text={`${mutualAid.filter(p => p.name && p.name.trim()).length} mutual aid partner${mutualAid.filter(p => p.name && p.name.trim()).length !== 1 ? 's' : ''}`} />
            {(() => {
              const authored = NOTICE_BLOCKS.filter(({ key }) => (noticeText[key] || '').trim()).length;
              return (
                <SummaryRow icon={<FileText size={14} className="text-orange-600 dark:text-orange-400" />}
                  text={authored === NOTICE_BLOCKS.length
                    ? 'Notice wording authored (all 4 blocks)'
                    : authored > 0
                      ? `Notice wording: ${authored} of ${NOTICE_BLOCKS.length} blocks — finish in Prevention Center → Settings`
                      : 'Notice wording: not yet — required before serving a Notice of Violation'}
                  ok={authored === NOTICE_BLOCKS.length} />
              );
            })()}
            <SummaryRow icon={<Zap size={14} className="text-pink-600 dark:text-pink-400" />} text={`AI: ${aiConfig.enableAI ? 'Enabled' : 'Disabled'}`} ok={aiConfig.enableAI} />
          </div>
        </div>
      );

      default: return null;
    }
  }

  if (hydrating) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col items-center justify-center gap-3">
        <Loader2 size={28} className="animate-spin text-red-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading your department setup…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-700 to-red-900 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black">OpenFirehouse Setup</h1>
            <p className="text-xs text-red-100">Step {step + 1} of {STEPS.length} — {STEPS[step].label}</p>
          </div>
          {/* Audit 2026-07-16: "Finish later" used to set the PERMANENT completed flag —
              a half-configured department never saw the wizard again (and there is no
              other way back in). It now snoozes for THIS browser session only; setup
              resumes (server-hydrated) on the next login. Only Launch completes. */}
          <button onClick={() => { sessionStorage.setItem('of_dept_setup_snooze', '1'); onComplete(); }}
            className="ml-auto text-red-100 hover:text-white text-xs font-bold">
            Finish later
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1 px-6 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex-1 flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
              i < step ? 'bg-green-500 text-white' : i === step ? `${s.color} text-white` : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-[11px] font-bold hidden sm:block ${i === step ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl mx-auto w-full">
        {getStoredUser()?.email_verified === false && (
          <div className="mb-4 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3">
            {/* Audit 2026-07-16: don't claim an email was SENT — sending is dormant until
                the deployment configures email. State the requirement, not the delivery. */}
            <p className="text-xs text-blue-700 dark:text-blue-300">Your department's contact address hasn't been verified yet — that doesn't block setup. You'll find the verification link in your email once it arrives.</p>
          </div>
        )}
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}
        {renderStep()}
      </div>

      {/* Footer buttons */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {/* A greyed-out Next with no reason is the same silence the save layer had — the
            chief can see they are stuck and not why. Say it, and announce it, because a
            keyboard/screen-reader user gets no hover and no visual cue at all. */}
        {blockingReason() && !saving && (
          <p role="status" aria-live="polite"
            className="mb-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            {blockingReason()}
          </p>
        )}
        <div className="flex items-center justify-between">
        <button onClick={goBack} disabled={step === 0 || saving}
          className="flex items-center gap-1.5 px-4 py-3 min-h-[44px] text-sm font-bold text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 disabled:opacity-30">
          <ChevronLeft size={14} /> Back
        </button>
        <div className="flex gap-2">
          {step < STEPS.length - 1 ? (
            <button onClick={advance} disabled={!canAdvance() || saving}
              className="flex items-center gap-1.5 px-6 py-3 min-h-[44px] bg-red-700 hover:bg-red-800 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-all">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? 'Saving…' : 'Next'} <ChevronRight size={14} />
            </button>
          ) : (
            <button onClick={handleLaunch} disabled={saving}
              className="flex items-center gap-1.5 px-8 py-3 min-h-[44px] bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-all">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
              {saving ? 'Saving your department…' : 'Launch Your Department'}
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ icon, text, ok = true }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-2">
      {icon}
      <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{text}</span>
      {ok ? <CheckCircle size={14} className="text-green-500" /> : <span className="text-xs text-gray-500 dark:text-gray-400">Skip</span>}
    </div>
  );
}
