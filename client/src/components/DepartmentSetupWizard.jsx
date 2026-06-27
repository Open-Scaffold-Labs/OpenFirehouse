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
  ChevronRight, ChevronLeft, Plus, X, Loader2, Star, AlertTriangle,
} from 'lucide-react';
import { api, getStoredUser } from '../utils/api';
import { RANKS } from '../data/members';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900';
const SELECT = INPUT;

const STEPS = [
  { id: 'identity', label: 'Department', icon: Shield, color: 'bg-red-600' },
  { id: 'stations', label: 'Stations', icon: Building2, color: 'bg-blue-600' },
  { id: 'apparatus', label: 'Apparatus', icon: Truck, color: 'bg-green-600' },
  { id: 'shifts', label: 'Shifts', icon: Calendar, color: 'bg-purple-600' },
  { id: 'ranks', label: 'Ranks', icon: Users, color: 'bg-amber-600' },
  { id: 'mutualaid', label: 'Mutual Aid', icon: Handshake, color: 'bg-cyan-600' },
  { id: 'ai', label: 'AI Setup', icon: Zap, color: 'bg-pink-600' },
  { id: 'review', label: 'Launch', icon: CheckCircle, color: 'bg-red-700' },
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

  // ── Hydrate from the server on open (resume partial setup) ──────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, stRes, apRes, maRes] = await Promise.allSettled([
          api.get('/api/departments/me'),
          api.get('/api/stations'),
          api.get('/api/apparatus'),
          api.get('/api/mutual-aid-agreements'),
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
          // Pull the dept address up from the HQ house (departments has no address).
          setDept((prev) => ({
            ...prev,
            address: prev.address || serverStations[0].address || '',
            city: prev.city || serverStations[0].city || '',
            state: prev.state || serverStations[0].state || '',
          }));
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
  const removeStation = (i) => setStations((s) => s.filter((_, idx) => idx !== i));
  const updateStation = (i, k, v) => setStations((s) => s.map((st, idx) => (idx === i ? { ...st, [k]: v } : st)));

  const addApparatus = () => setApparatus((a) => [...a, { id: null, designation: '', type: 'Engine', station_id: stations[0]?.id ?? null, year: CURRENT_YEAR, status: 'In Service' }]);
  const removeApparatus = (i) => setApparatus((a) => a.filter((_, idx) => idx !== i));
  const updateApparatus = (i, k, v) => setApparatus((a) => a.map((ap, idx) => (idx === i ? { ...ap, [k]: v } : ap)));

  const addPartner = () => setMutualAid((m) => [...m, { id: null, name: '', phone: '', distance: '' }]);
  const removePartner = (i) => setMutualAid((m) => m.filter((_, idx) => idx !== i));
  const updatePartner = (i, k, v) => setMutualAid((m) => m.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));

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
    const next = [...stations];
    for (let i = 0; i < next.length; i++) {
      const s = next[i];
      const payload = { name: (s.name || '').trim() || `Station ${i + 1}`, address: s.address || '', city: s.city || '', state: s.state || '' };
      // House #1 also carries the department's primary address fields (already in payload).
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

  // Persist the data step we're leaving. Throws bubble up to advance()/handleLaunch.
  async function persistStep(idx) {
    if (idx === 0) return saveIdentity();
    if (idx === 1) { await saveStations(); return; }
    if (idx === 2) { await saveApparatus(); return; }
    if (idx === 3) return saveIdentity();   // shift_pattern is a department field
    if (idx === 5) return savePartners();
    if (idx === 6) return saveAiKey();
    // Step 4 (rank→role) is the P4.4 verification gate's job — collected, not persisted here.
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
      await saveAiKey();
      localStorage.setItem('of_dept_setup_complete', 'true'); // UI "seen" flag only
      setSaving(false);
      onComplete();
    } catch (e) {
      setSaving(false);
      setError(e?.message || 'Launch failed while saving to the server. Nothing was lost — fix the issue and try again.');
    }
  }

  // Quick Setup — fills demo defaults and jumps to launch (still persists for real).
  function quickSetup() {
    setDept((d) => ({ ...d, name: 'Maplewood VFD', fdid: '34567', address: '100 Main St', city: 'Maplewood', state: 'NJ', zip: '07040', county: 'Essex', phone: '(555) 555-0100', email: 'chief@maplewoodvfd.org', website: '', type: 'Volunteer', memberCount: '25' }));
    setStations((s) => [{ ...(s[0] || {}), id: s[0]?.id ?? null, name: 'Station 14', address: '100 Main St', city: 'Maplewood', state: 'NJ', isHQ: true }]);
    setApparatus([
      { id: null, designation: 'Engine 1', type: 'Engine', station_id: stations[0]?.id ?? null, year: CURRENT_YEAR, status: 'In Service' },
      { id: null, designation: 'Truck 1', type: 'Truck/Ladder', station_id: stations[0]?.id ?? null, year: CURRENT_YEAR, status: 'In Service' },
      { id: null, designation: 'Rescue 1', type: 'Rescue', station_id: stations[0]?.id ?? null, year: CURRENT_YEAR, status: 'In Service' },
    ]);
    setShiftPattern('Volunteer (No Shifts)');
    setStep(7);
  }

  const canAdvance = useCallback(() => {
    if (step === 0) return dept.name.trim().length > 0;
    return true;
  }, [step, dept.name]);

  // ── Render step content ──
  function renderStep() {
    switch (step) {
      case 0: return (
        <div className="space-y-4">
          <button onClick={quickSetup}
            className="w-full flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-950/50 hover:bg-green-100 dark:hover:bg-green-950/50 border-2 border-green-300 dark:border-green-800 rounded-xl transition-all text-left">
            <Zap size={20} className="text-green-600 dark:text-green-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-black text-green-800 dark:text-green-300">Quick Setup — Use Demo Defaults</p>
              <p className="text-xs text-green-600 dark:text-green-400">Pre-fills Maplewood VFD data and jumps to launch. Still saved to the server.</p>
            </div>
            <ChevronRight size={16} className="text-green-400 ml-auto" />
          </button>
          <div className="text-center text-xs text-gray-400">— or set up manually —</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tell us about your department. This information configures the entire system.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Department Name *</label>
              <input className={INPUT} value={dept.name} onChange={e => setDept(d => ({ ...d, name: e.target.value }))} placeholder="Maplewood Volunteer Fire Department" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">FDID</label>
              <input className={INPUT} value={dept.fdid} onChange={e => setDept(d => ({ ...d, fdid: e.target.value }))} placeholder="12345" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Department Type</label>
              <select className={SELECT} value={dept.type} onChange={e => setDept(d => ({ ...d, type: e.target.value }))}>
                {DEPT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Address <span className="text-gray-400 font-normal">(your HQ station)</span></label>
              <input className={INPUT} value={dept.address} onChange={e => setDept(d => ({ ...d, address: e.target.value }))} placeholder="123 Main Street" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">City</label>
              <input className={INPUT} value={dept.city} onChange={e => setDept(d => ({ ...d, city: e.target.value }))} placeholder="Maplewood" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">State</label>
              <input className={INPUT} value={dept.state} onChange={e => setDept(d => ({ ...d, state: e.target.value }))} placeholder="NJ" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Approximate Members</label>
              <input type="number" className={INPUT} value={dept.memberCount} onChange={e => setDept(d => ({ ...d, memberCount: e.target.value }))} placeholder="25" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Phone</label>
              <input className={INPUT} value={dept.phone} onChange={e => setDept(d => ({ ...d, phone: e.target.value }))} placeholder="(555) 555-0100" />
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

      case 1: return (
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
                {s.isHQ && <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded-full">HQ</span>}
                {stations.length > 1 && !s.isHQ && <button onClick={() => removeStation(i)} aria-label="Remove station" className="text-gray-400 hover:text-red-500"><X size={14} /></button>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input className={INPUT} value={s.address} onChange={e => updateStation(i, 'address', e.target.value)} placeholder="Address" aria-label="Station address" />
                <input className={INPUT} value={s.city} onChange={e => updateStation(i, 'city', e.target.value)} placeholder="City" aria-label="Station city" />
                <input className={INPUT} value={s.state} onChange={e => updateStation(i, 'state', e.target.value)} placeholder="State" aria-label="Station state" />
              </div>
            </div>
          ))}
          <button onClick={addStation} className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300">
            <Plus size={13} /> Add Station
          </button>
        </div>
      );

      case 2: return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Add your apparatus and assign each to a house.</p>
          {apparatus.map((a, i) => (
            <div key={a.id ?? i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 rounded-lg p-2 border border-gray-200 dark:border-gray-700 flex-wrap">
              <input className="flex-1 min-w-[120px] border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900" value={a.designation} onChange={e => updateApparatus(i, 'designation', e.target.value)} placeholder="Engine 1" aria-label="Apparatus designation" />
              <select className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900" value={a.type} onChange={e => updateApparatus(i, 'type', e.target.value)} aria-label="Apparatus type">
                {APPARATUS_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input type="number" className="w-20 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900" value={a.year} onChange={e => updateApparatus(i, 'year', e.target.value)} placeholder="Year" aria-label="Apparatus year" />
              {!singleStation && (
                <select className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900" value={a.station_id ?? ''} onChange={e => updateApparatus(i, 'station_id', e.target.value ? Number(e.target.value) : null)} aria-label="Assigned station">
                  <option value="">House…</option>
                  {stations.filter(s => s.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              {apparatus.length > 1 && <button onClick={() => removeApparatus(i)} aria-label="Remove apparatus" className="text-gray-400 hover:text-red-500"><X size={14} /></button>}
            </div>
          ))}
          <button onClick={addApparatus} className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300">
            <Plus size={13} /> Add Apparatus
          </button>
        </div>
      );

      case 3: return (
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
          <p className="text-[11px] text-gray-400">You'll build concrete shift templates in Duty Schedule after launch — this just sets your starting style.</p>
        </div>
      );

      case 4: return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Your rank structure (pre-loaded — customize as needed). Mapping ranks to access levels happens when you verify members.</p>
          {ranks.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-5">{i + 1}</span>
              <input className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900" value={r.name} aria-label="Rank name"
                onChange={e => setRanks(rs => rs.map((rk, idx) => idx === i ? { ...rk, name: e.target.value } : rk))} />
              <select className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900" value={r.level} aria-label="Rank access level"
                onChange={e => setRanks(rs => rs.map((rk, idx) => idx === i ? { ...rk, level: e.target.value } : rk))}>
                <option>Admin</option><option>Officer</option><option>Member</option>
              </select>
              {ranks.length > 3 && <button onClick={() => setRanks(rs => rs.filter((_, idx) => idx !== i))} aria-label="Remove rank" className="text-gray-400 hover:text-red-500"><X size={14} /></button>}
            </div>
          ))}
          <button onClick={() => setRanks(rs => [...rs, { name: '', level: 'Member' }])} className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300">
            <Plus size={13} /> Add Rank
          </button>
        </div>
      );

      case 5: return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Neighboring departments you exchange mutual aid with. You can add more later.</p>
          {mutualAid.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No partners yet. Add one below, or skip this step.</p>
          )}
          {mutualAid.map((p, i) => (
            <div key={p.id ?? i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
              <input className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900" value={p.name} onChange={e => updatePartner(i, 'name', e.target.value)} placeholder="Department name" aria-label="Partner department name" />
              <input className="w-32 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900" value={p.phone} onChange={e => updatePartner(i, 'phone', e.target.value)} placeholder="Phone" aria-label="Partner phone" />
              <input className="w-20 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900" value={p.distance} onChange={e => updatePartner(i, 'distance', e.target.value)} placeholder="Miles" aria-label="Distance in miles" />
              <button onClick={() => removePartner(i)} aria-label="Remove partner department" className="text-gray-400 hover:text-red-500"><X size={14} /></button>
            </div>
          ))}
          <button onClick={addPartner} className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300">
            <Plus size={13} /> Add Partner Department
          </button>
        </div>
      );

      case 6: return (
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
                <p className="text-[10px] text-gray-400 mt-1">Your key is encrypted and stored on the server. Never sent to the browser.</p>
              </div>
            </div>
          )}
          <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">The platform works fully without AI — it just gets smarter with it.</p>
          </div>
        </div>
      );

      case 7: return (
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
            <p className="text-xs text-red-200">Step {step + 1} of {STEPS.length} — {STEPS[step].label}</p>
          </div>
          <button onClick={() => { localStorage.setItem('of_dept_setup_complete', 'true'); onComplete(); }}
            className="ml-auto text-red-200 hover:text-white text-xs font-bold">
            Finish later
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1 px-6 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex-1 flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i < step ? 'bg-green-500 text-white' : i === step ? `${s.color} text-white` : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-[10px] font-bold hidden sm:block ${i === step ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl mx-auto w-full">
        {getStoredUser()?.email_verified === false && (
          <div className="mb-4 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-700 dark:text-blue-300">We've emailed a link to verify your department's contact address. You can finish setup now — verifying just confirms your email.</p>
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
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between">
        <button onClick={goBack} disabled={step === 0 || saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30">
          <ChevronLeft size={14} /> Back
        </button>
        <div className="flex gap-2">
          {step < STEPS.length - 1 ? (
            <button onClick={advance} disabled={!canAdvance() || saving}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-red-700 hover:bg-red-800 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-all">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button onClick={handleLaunch} disabled={saving}
              className="flex items-center gap-1.5 px-8 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-all">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
              Launch Your Department
            </button>
          )}
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
      {ok ? <CheckCircle size={14} className="text-green-500" /> : <span className="text-xs text-gray-400">Skip</span>}
    </div>
  );
}
