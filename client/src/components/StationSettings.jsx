import { useState, useEffect } from 'react';
import {
  Building2, Phone, Mail, Globe, User, MapPin, Hash,
  Shield, Clock, Save, RotateCcw, CheckCircle2, Info, Bell, Tv, Copy,
  Bot, Eye, EyeOff, KeyRound, Briefcase, AlertTriangle, Loader2,
  Radio, Package, ChevronDown, Users, Search,
} from 'lucide-react';
import { api } from '../utils/api';
import RolesPanel from './RolesPanel'; // 5.7 (0113) — department-authored roles
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../data/stationSettings';
import PushNotificationSetup from './PushNotificationSetup';
import RankNotificationSettings from './RankNotificationSettings';
import LicenseInfoCard from './LicenseInfoCard';
import StationDisplaysPanel from './StationDisplaysPanel';
import { US_STATES } from '../constants/usStates';

// ─── helpers ─────────────────────────────────────────────────────────────────

// ⚠️ SCOPE NOTE, because this file was edited from a grep once and reverted for it (`7643cc0`):
// this list is the STATION ADDRESS dropdown and nothing else. The NERIS department picker further
// down owns a SEPARATE control — an `<input maxLength={2}>` bound to `nerisStateFilter` with its
// own upper-casing — which never used this array and is untouched here. The list had DC appended
// after WY (original, 2026-04-17), so DC was selectable but sorted last; it is now alphabetical.
// Enforced by server/src/tests/clientStateLists.test.js.

const TIMEZONES = [
  { value: 'America/New_York',   label: 'Eastern (ET)'   },
  { value: 'America/Chicago',    label: 'Central (CT)'   },
  { value: 'America/Denver',     label: 'Mountain (MT)'  },
  { value: 'America/Phoenix',    label: 'Arizona (MT, no DST)' },
  { value: 'America/Los_Angeles',label: 'Pacific (PT)'   },
  { value: 'America/Anchorage',  label: 'Alaska (AKT)'   },
  { value: 'Pacific/Honolulu',   label: 'Hawaii (HT)'    },
];

// Copy text to the clipboard and report HONESTLY. navigator.clipboard.writeText
// can hang without ever settling (observed live 2026-08-04: permission granted,
// document focused, promise never resolved — the old fire-and-forget pattern
// showed "Copied!" over a clipboard that never changed). Race it with a timeout,
// then fall back to the legacy textarea + execCommand path. Callers must only
// show success when this returns true.
async function copyTextToClipboard(text) {
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => setTimeout(reject, 1500, new Error('clipboard write timed out'))),
    ]);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
        <Icon size={16} className="text-red-600 dark:text-red-400" />
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, span, children }) {
  return (
    <div className={span === 2 ? 'md:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function StationSettings({ onSettingsChange }) {
  const [form, setForm]       = useState(() => loadSettings());
  const [saved, setSaved]     = useState(false);
  const [dirty, setDirty]     = useState(false);
  const [tvPin, setTvPin]     = useState(null);
  const [copied, setCopied]   = useState(false);

  // Generate random alphanumeric PIN in format XXXX-XXXX
  const generatePin = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pin = '';
    for (let i = 0; i < 8; i++) {
      pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${pin.slice(0, 4)}-${pin.slice(4)}`;
  };

  // Career / Station config state (stored server-side via /api/station-config)
  const [careerConfig, setCareerConfig] = useState({
    dept_type: 'volunteer',
    flsa_work_period: 7,
    flsa_ot_threshold: 40,
    flsa_period_start: '',
    min_staffing_block: false,
  });
  const [careerLoading, setCareerLoading] = useState(true);
  const [careerSaving,  setCareerSaving]  = useState(false);
  const [careerSaved,   setCareerSaved]   = useState(false);

  // ── Unit statusing — rig self-status gate (migration 0040) ──────────────
  const [rigStatus, setRigStatus] = useState(null);   // null = loading
  // ── PAR interval default (0062) — the department's SOG cadence ──────────
  const [parDefault, setParDefault] = useState(null); // null = loading; '' = unset
  const [parSaving, setParSaving] = useState(false);
  const [rigDeptId, setRigDeptId] = useState(null);
  const [rigSaving, setRigSaving] = useState(false);

  useEffect(() => {
    api.get('/api/station-config')
      .then(res => { if (res?.data) setCareerConfig(prev => ({ ...prev, ...res.data })); })
      .catch(() => {})
      .finally(() => setCareerLoading(false));
  }, []);

  async function saveCareerConfig() {
    setCareerSaving(true);
    try {
      const res = await api.patch('/api/station-config', careerConfig);
      if (res?.data) setCareerConfig(prev => ({ ...prev, ...res.data }));
      setCareerSaved(true);
      setTimeout(() => setCareerSaved(false), 3000);
    } catch (err) {
      alert('Failed to save career config: ' + (err.message || 'Unknown error'));
    } finally {
      setCareerSaving(false);
    }
  }

  // AI Assistant API key state (stored server-side)
  const [aiKey,        setAiKey]        = useState('');
  const [aiKeyVisible, setAiKeyVisible] = useState(false);
  const [aiKeySaving,  setAiKeySaving]  = useState(false);
  const [aiKeySaved,   setAiKeySaved]   = useState(false);
  const [aiKeyError,   setAiKeyError]   = useState(null);
  const [aiKeySet,     setAiKeySet]     = useState(false);

  useEffect(() => {
    api.get('/api/assistant/key')
      .then((d) => { if (d) setAiKeySet(!!d.configured); })
      .catch(() => {});
  }, []);

  // Initialize TV PIN from server (source of truth)
  useEffect(() => {
    api.get('/api/stations/tv-pin')
      .then((d) => {
        const pin = d?.pin || d?.data?.pin || null;
        if (pin) {
          setTvPin(pin);
          localStorage.setItem('tv-display-pin', pin);
        }
      })
      .catch(() => {});
  }, []);

  // Rig self-status gate — read the current value from the department record.
  useEffect(() => {
    api.get('/api/departments/me')
      .then((d) => {
        const dept = d?.data;
        if (dept) {
          setRigDeptId(dept.id);
          setRigStatus(dept.allow_rig_status !== false);
          setTimerCfg(dept.status_timer_config || {});
          setParDefault(dept.par_interval_default_min ?? '');
          setMinStaffing(dept.min_staffing_per_shift ?? '');
          setStaffingEnforcement(dept.staffing_enforcement === 'block' ? 'block' : 'warn');
          // 0110 — session + idle timeout. Absent → the pre-0110 defaults, so a
          // department that has never touched these shows exactly what it has.
          setIdleWeb(dept.session_idle_minutes_web ?? 10080);
          setIdleMobile(dept.session_idle_minutes_mobile ?? 10080);
          setMaxHours(dept.session_max_hours ?? 168);
          setMfaRequired(dept.mfa_required === true); // 0111
          // NERIS Track B: enrollment surface
          setNerisId(dept.neris_id || '');
          setNerisEnabled(dept.neris_submission_enabled === true);
          api.get(`/api/departments/${dept.id}/neris-info`)
            .then((info) => setNerisInfo(info?.data || null))
            .catch(() => setNerisInfo(null));
          loadNerisRegistry(dept.id);
        }
      })
      .catch(() => {});
  }, []);

  // Status timers (0046): per-status thresholds in minutes; blank = default,
  // 0 = off. Defaults mirror the server (utils/statusTimers.js).
  const TIMER_DEFAULTS = { dispatched: 10, enroute: 10, on_scene: 30, transporting: 10, at_hospital: 0, returning: 0, on_the_air: 0, out_of_service: 0 };
  const TIMER_LABELS = { dispatched: 'Dispatched', enroute: 'En Route', on_scene: 'On Scene', transporting: 'Transporting', at_hospital: 'At Hospital', returning: 'Returning', on_the_air: 'On the Air', out_of_service: 'Out of Service' };
  const [timerCfg, setTimerCfg] = useState(null); // null = loading
  const [timerSaving, setTimerSaving] = useState(false);

  // 0110 (Phase 5) — session + idle timeout. Two independent windows because a
  // browser on a desk and an iPad bolted into an apparatus are not the same
  // risk: the desk should lock quickly, the rig must not sign a crew out on a
  // call. Shipped defaults reproduce the pre-0110 behaviour exactly.
  const SESSION_PRESETS = [
    { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: '1 hour',     value: 60 },
    { label: '4 hours',    value: 240 },
    { label: '12 hours',   value: 720 },
    { label: '24 hours',   value: 1440 },
    { label: '7 days',     value: 10080 },
  ];
  const [idleWeb, setIdleWeb]       = useState(10080);
  const [idleMobile, setIdleMobile] = useState(10080);
  const [maxHours, setMaxHours]     = useState(168);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionSaved, setSessionSaved]   = useState(false);

  // 0111 (Phase 5) — TOTP MFA. Two surfaces in one panel: the member's OWN
  // enrolment, and (chief only) the department-wide mandate.
  const [mfaStatus, setMfaStatus]   = useState(null); // null = loading
  const [mfaEnroll, setMfaEnroll]   = useState(null); // { secret, otpauthUri, manualEntryKey }
  const [mfaCode, setMfaCode]       = useState('');
  const [mfaCodes, setMfaCodes]     = useState(null); // recovery codes, shown ONCE
  const [mfaBusy, setMfaBusy]       = useState(false);
  const [mfaErr, setMfaErr]         = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);

  async function loadMfa() {
    try { setMfaStatus(await api.get('/api/mfa/status')); }
    catch { setMfaStatus({ enabled: false, departmentRequired: false }); }
  }
  useEffect(() => { loadMfa(); }, []);

  async function startEnroll() {
    setMfaBusy(true); setMfaErr('');
    try { setMfaEnroll(await api.post('/api/mfa/enroll', {})); }
    catch (e) { setMfaErr(e?.message || 'Could not start enrolment.'); }
    finally { setMfaBusy(false); }
  }

  async function confirmEnroll() {
    setMfaBusy(true); setMfaErr('');
    try {
      const r = await api.post('/api/mfa/confirm', { code: mfaCode.trim() });
      setMfaCodes(r.recoveryCodes);   // shown once, never retrievable again
      setMfaEnroll(null); setMfaCode('');
      await loadMfa();
    } catch (e) {
      setMfaErr(e?.message || 'That code is not right.');
    } finally { setMfaBusy(false); }
  }

  async function disableMfa() {
    const pw = window.prompt('Enter your password to turn off multi-factor authentication:');
    if (!pw) return;
    setMfaBusy(true); setMfaErr('');
    try {
      await api.post('/api/mfa/disable', { password: pw });
      setMfaCodes(null);
      await loadMfa();
    } catch (e) {
      setMfaErr(e?.message || 'Could not turn off MFA.');
    } finally { setMfaBusy(false); }
  }

  async function toggleMfaRequired() {
    if (rigDeptId == null) return;
    const next = !mfaRequired;
    if (next && !window.confirm(
      'Require multi-factor authentication for EVERY member of this department?\n\n' +
      'Members without it will be asked to set it up. Make sure your people can ' +
      'install an authenticator app before you turn this on.'
    )) return;
    setMfaBusy(true);
    try {
      await api.patch(`/api/departments/${rigDeptId}`, { mfa_required: next });
      setMfaRequired(next);
      await loadMfa();
    } catch (e) {
      alert(e?.message || 'Could not change the requirement.');
    } finally { setMfaBusy(false); }
  }

  async function saveSessionPolicy() {
    if (rigDeptId == null || sessionSaving) return;
    const web = Number(idleWeb), mob = Number(idleMobile), max = Number(maxHours);
    // Mirrors the server zod schema and the 0110 CHECK constraints. Validating
    // here is a courtesy; the server is the control.
    if (![web, mob].every((n) => Number.isInteger(n) && n >= 5 && n <= 10080)) {
      alert('Idle timeout must be between 5 minutes and 7 days.');
      return;
    }
    if (!Number.isInteger(max) || max < 1 || max > 168) {
      alert('Maximum session length must be between 1 and 168 hours.');
      return;
    }
    setSessionSaving(true);
    try {
      await api.patch(`/api/departments/${rigDeptId}`, {
        session_idle_minutes_web: web,
        session_idle_minutes_mobile: mob,
        session_max_hours: max,
      });
      setSessionSaved(true);
      setTimeout(() => setSessionSaved(false), 2000);
    } catch (e) {
      alert(e?.message || 'Could not save session settings.');
    } finally {
      setSessionSaving(false);
    }
  }

  // 0075 — per-department minimum-staffing config + warn/block enforcement.
  const [minStaffing, setMinStaffing] = useState('');
  const [staffingEnforcement, setStaffingEnforcement] = useState('warn');
  const [staffingSaving, setStaffingSaving] = useState(false);
  const [staffingSaved, setStaffingSaved] = useState(false);

  async function saveStaffing() {
    if (rigDeptId == null || staffingSaving) return;
    let min = null;
    if (minStaffing !== '' && minStaffing !== null) {
      const n = Number(minStaffing);
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        alert('Minimum staffing must be a whole number 0–100, or blank for none.');
        return;
      }
      min = n;
    }
    setStaffingSaving(true);
    try {
      await api.patch(`/api/departments/${rigDeptId}`, {
        min_staffing_per_shift: min,
        staffing_enforcement: staffingEnforcement === 'block' ? 'block' : 'warn',
      });
      setMinStaffing(min ?? '');
      setStaffingSaved(true);
      setTimeout(() => setStaffingSaved(false), 2000);
    } catch (err) {
      alert('Failed to update minimum staffing: ' + (err.message || 'Unknown error'));
    } finally {
      setStaffingSaving(false);
    }
  }

  async function saveTimerCfg() {
    if (rigDeptId == null || timerSaving) return;
    const cfg = {};
    for (const [k, v] of Object.entries(timerCfg || {})) {
      if (v === '' || v === null || v === undefined) continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 1440) {
        alert(`${TIMER_LABELS[k] || k}: threshold must be 0–1440 minutes (0 = off).`);
        return;
      }
      cfg[k] = n;
    }
    setTimerSaving(true);
    try {
      await api.patch(`/api/departments/${rigDeptId}`, { status_timer_config: Object.keys(cfg).length ? cfg : null });
      setTimerCfg(cfg);
    } catch (err) {
      alert('Failed to update status timers: ' + (err.message || 'Unknown error'));
    } finally {
      setTimerSaving(false);
    }
  }

  // 0062 — save the department's default PAR interval. Blank = NULL = no timer
  // until command sets one (never impose the folklore-20 on anyone).
  async function saveParDefault() {
    if (rigDeptId == null || parSaving) return;
    let value = null;
    if (parDefault !== '' && parDefault !== null) {
      const n = Number(parDefault);
      if (!Number.isInteger(n) || n < 1 || n > 180) {
        alert('Default PAR interval must be 1–180 minutes, or blank for none.');
        return;
      }
      value = n;
    }
    setParSaving(true);
    try {
      await api.patch(`/api/departments/${rigDeptId}`, { par_interval_default_min: value });
      setParDefault(value ?? '');
    } catch (err) {
      alert('Failed to update the PAR interval default: ' + (err.message || 'Unknown error'));
    } finally {
      setParSaving(false);
    }
  }

  // ── NERIS Track B: entity id + submission gate + connection check ──────────
  const [nerisId, setNerisId] = useState(null);          // null = loading
  const [nerisEnabled, setNerisEnabled] = useState(false);
  const [nerisInfo, setNerisInfo] = useState(null);       // { client_id, configured, environment }
  const [nerisSaving, setNerisSaving] = useState(false);
  const [nerisCheck, setNerisCheck] = useState(null);     // last probe result
  const [nerisChecking, setNerisChecking] = useState(false);
  const [nerisIdCopied, setNerisIdCopied] = useState(false); // Client ID copy feedback

  // ── NERIS department lookup (picker) ───────────────────────────────────────
  // A chief should never have to hand-type an FD######## id. A transcription slip
  // either fails at submit or resolves to ANOTHER department's national record, so
  // the id is RESOLVED from NERIS and the chief confirms a name and street address
  // they recognize. Manual entry stays as a first-class fallback: a department that
  // registered with NERIS minutes ago may not be searchable yet, and search depends
  // on a third party being reachable.
  const NERIS_SEARCH_MIN_Q = 3;
  const [nerisQuery, setNerisQuery] = useState('');
  const [nerisStateFilter, setNerisStateFilter] = useState('');
  const [nerisResults, setNerisResults] = useState(null);   // null = never searched
  const [nerisSearching, setNerisSearching] = useState(false);
  const [nerisSearchError, setNerisSearchError] = useState(null);
  const [nerisManual, setNerisManual] = useState(false);
  const [nerisPicked, setNerisPicked] = useState(null);      // the row the chief chose
  const [nerisActiveIdx, setNerisActiveIdx] = useState(-1);  // keyboard cursor in the result list

  // The list scrolls, so arrowing the cursor onto a row below the fold would move it
  // somewhere the chief cannot see — a keyboard user would lose their place entirely.
  // Keep the active option in view. 'nearest' so it never jumps when already visible.
  useEffect(() => {
    if (nerisActiveIdx < 0) return;
    const el = document.getElementById(`neris-opt-${nerisActiveIdx}`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [nerisActiveIdx]);

  // Debounced so a chief typing "Maplewood" costs ONE outbound call to NERIS, not
  // nine. FSRI's integration guidance warns anomalous traffic risks blocking.
  useEffect(() => {
    const q = nerisQuery.trim();
    if (rigDeptId == null || nerisManual) return undefined;
    if (q.length < NERIS_SEARCH_MIN_Q) { setNerisResults(null); setNerisSearchError(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setNerisSearching(true);
      setNerisSearchError(null);
      try {
        const qs = new URLSearchParams({ q });
        if (/^[A-Za-z]{2}$/.test(nerisStateFilter.trim())) qs.set('state', nerisStateFilter.trim().toUpperCase());
        const res = await api.get(`/api/departments/${rigDeptId}/neris-entity-search?${qs.toString()}`);
        if (cancelled) return;
        setNerisResults(res?.data || { results: [], total: 0, truncated: false });
        setNerisActiveIdx(-1);   // a new result set must never inherit the old cursor
      } catch (err) {
        if (cancelled) return;
        setNerisResults(null);
        // Honest, distinguishable failures — never a generic "something went wrong".
        setNerisSearchError(err?.message || 'Lookup failed.');
      } finally {
        if (!cancelled) setNerisSearching(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [nerisQuery, nerisStateFilter, rigDeptId, nerisManual]);

  // Selecting a result saves through the SAME PATCH the manual field uses — one
  // door for this write — then immediately probes so the chief sees NERIS confirm
  // the department by name rather than trusting a code they can't read.
  async function pickNerisEntity(row) {
    if (!row || !row.neris_id || rigDeptId == null || nerisSaving) return;
    setNerisSaving(true);
    try {
      await api.patch(`/api/departments/${rigDeptId}`, { neris_id: row.neris_id });
      setNerisId(row.neris_id);
      setNerisPicked(row);
      setNerisResults(null);
      setNerisQuery('');
      setNerisCheck(null);
    } catch (err) {
      alert('Failed to save the NERIS entity ID: ' + (err.message || 'Unknown error'));
    } finally { setNerisSaving(false); }
    // Deliberately NO auto-probe here. NERIS only lets us read an entity once that
    // department has enrolled us, and enrollment happens AFTER this step, in their
    // portal. Auto-checking meant picking your own department correctly was
    // immediately answered with a failure (verified live 2026-08-03) — the worst
    // possible moment to show one. The card tells them the next step instead, and
    // Check connection is right there for after they've enrolled.
  }

  async function saveNerisId() {
    if (rigDeptId == null || nerisSaving) return;
    const v = String(nerisId || '').trim().toUpperCase();
    if (v !== '' && !/^[A-Z]{2}\d{8}$/.test(v)) {
      alert('NERIS entity ID must be two letters + 8 digits (e.g. FD12345678), or blank to clear.');
      return;
    }
    setNerisSaving(true);
    try {
      await api.patch(`/api/departments/${rigDeptId}`, { neris_id: v });
      setNerisId(v);
      setNerisCheck(null);
    } catch (err) {
      alert('Failed to save the NERIS entity ID: ' + (err.message || 'Unknown error'));
    } finally { setNerisSaving(false); }
  }

  async function toggleNerisEnabled() {
    if (rigDeptId == null || nerisSaving) return;
    const next = !nerisEnabled;
    if (next && !String(nerisId || '').trim()) {
      alert('Set your NERIS entity ID first — submissions need to know which department they belong to.');
      return;
    }
    setNerisSaving(true);
    try {
      await api.patch(`/api/departments/${rigDeptId}`, { neris_submission_enabled: next });
      setNerisEnabled(next);
    } catch (err) {
      alert('Failed to update NERIS submission: ' + (err.message || 'Unknown error'));
    } finally { setNerisSaving(false); }
  }

  // ── NERIS station/unit registration (SR) ───────────────────────────────────
  const [nerisRegistry, setNerisRegistry] = useState(null);   // { stations, apparatus } | null
  const [regBusy, setRegBusy] = useState(null);               // 'station-3' | 'unit-7' | null
  const [regError, setRegError] = useState(null);
  const [unitStaffing, setUnitStaffing] = useState({});       // apparatusId → input value

  async function loadNerisRegistry(deptId) {
    try {
      const res = await api.get(`/api/neris-registry/overview`);
      const data = res?.data;
      if (data) {
        setNerisRegistry(data);
        setUnitStaffing((cur) => {
          const next = { ...cur };
          for (const a of data.apparatus) {
            if (next[a.id] === undefined && a.staffing_prefill != null) next[a.id] = String(a.staffing_prefill);
          }
          return next;
        });
      }
    } catch { setNerisRegistry(null); }
  }

  async function registerHouse(id) {
    setRegBusy(`station-${id}`); setRegError(null);
    try {
      await api.post(`/api/neris-registry/stations/${id}/register`, {});
      await loadNerisRegistry();
    } catch (err) { setRegError(err.message || 'Station registration failed.'); }
    finally { setRegBusy(null); }
  }

  async function registerRig(id) {
    const staffing = Number(unitStaffing[id]);
    if (!Number.isInteger(staffing) || staffing < 0) {
      setRegError('Enter the unit\'s minimum staffing (a whole number, 0 or more) before registering.');
      return;
    }
    setRegBusy(`unit-${id}`); setRegError(null);
    try {
      await api.post(`/api/neris-registry/apparatus/${id}/register`, { staffing });
      await loadNerisRegistry();
    } catch (err) { setRegError(err.message || 'Unit registration failed.'); }
    finally { setRegBusy(null); }
  }

  // Explicit re-push of local edits to an already-registered record (the
  // market's manual "Update in NERIS" pattern — nothing auto-syncs).
  async function pushHouseUpdate(id) {
    setRegBusy(`station-${id}`); setRegError(null);
    try {
      await api.post(`/api/neris-registry/stations/${id}/push-update`, {});
      await loadNerisRegistry();
    } catch (err) { setRegError(err.message || 'Station update failed.'); }
    finally { setRegBusy(null); }
  }
  async function pushRigUpdate(id) {
    const staffing = Number(unitStaffing[id]);
    if (!Number.isInteger(staffing) || staffing < 0) {
      setRegError('Enter the unit\'s minimum staffing before pushing an update.');
      return;
    }
    setRegBusy(`unit-${id}`); setRegError(null);
    try {
      await api.post(`/api/neris-registry/apparatus/${id}/push-update`, { staffing });
      await loadNerisRegistry();
    } catch (err) { setRegError(err.message || 'Unit update failed.'); }
    finally { setRegBusy(null); }
  }

  async function runNerisCheck() {
    if (rigDeptId == null || nerisChecking) return;
    setNerisChecking(true);
    setNerisCheck(null);
    try {
      const res = await api.post(`/api/departments/${rigDeptId}/neris-check`, {});
      setNerisCheck(res?.data || { ok: false, reason: 'no response' });
    } catch (err) {
      setNerisCheck({ ok: false, reason: err.message || 'check failed' });
    } finally { setNerisChecking(false); }
  }

  async function toggleRigStatus() {
    if (rigDeptId == null || rigSaving) return;
    const next = !rigStatus;
    setRigSaving(true);
    try {
      await api.patch(`/api/departments/${rigDeptId}`, { allow_rig_status: next });
      setRigStatus(next);
    } catch (err) {
      alert('Failed to update unit statusing: ' + (err.message || 'Unknown error'));
    } finally {
      setRigSaving(false);
    }
  }

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
    setSaved(false);
  }

  function handleSave(e) {
    e.preventDefault();
    saveSettings(form);
    setDirty(false);
    setSaved(true);
    onSettingsChange?.(form);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleReset() {
    if (!window.confirm('Reset all settings to defaults? This cannot be undone.')) return;
    setForm({ ...DEFAULT_SETTINGS });
    saveSettings(DEFAULT_SETTINGS);
    onSettingsChange?.(DEFAULT_SETTINGS);
    setDirty(false);
    setSaved(false);
  }

  function regenerateTvPin() {
    const newPin = generatePin();
    localStorage.setItem('tv-display-pin', newPin);
    setTvPin(newPin);
    api.put('/api/stations/tv-pin', { pin: newPin }).catch(() => {});
  }

  const inp = (key, extra = {}) => ({
    value: form[key] ?? '',
    onChange: (e) => set(key, e.target.value),
    className: `w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm
      focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100 ${extra.className ?? ''}`,
    ...extra,
  });

  // live preview of top-bar display name
  const displayName = [form.stationName, form.departmentName].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">

      {/* ── License info (ADR-0001 Step 13) ── */}
      <LicenseInfoCard />

      {/* ── header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Station Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Configure your department's profile, contact info, and operational defaults.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RotateCcw size={14} /> Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {saved ? <><CheckCircle2 size={15} /> Saved!</> : <><Save size={15} /> Save Settings</>}
          </button>
        </div>
      </div>

      {/* ── live preview ── */}
      <div className="bg-red-700 rounded-xl px-5 py-3 flex items-center gap-3 shadow">
        <Shield size={20} className="text-white opacity-80 shrink-0" />
        <div>
          <p className="text-white font-bold text-base leading-tight">{displayName || 'Your Station Name'}</p>
          <p className="text-red-100 text-xs">{form.address ? `${form.address}, ${form.city}, ${form.state} ${form.zip}` : 'Address not set'}</p>
        </div>
        <span className="ml-auto text-red-100 text-xs italic">Top bar preview</span>
      </div>

      {/* ── unsaved warning ── */}
      {dirty && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg text-sm text-amber-700 dark:text-amber-300">
          <Info size={15} className="shrink-0" />
          You have unsaved changes. Click <strong>Save Settings</strong> to apply them.
        </div>
      )}

      {/* ── station identity ── */}
      <Section icon={Building2} title="Station Identity">
        <Field label="Station Name" hint='Displayed in the top bar (e.g. "Station 14")'>
          <input {...inp('stationName')} placeholder="Station 14" />
        </Field>
        <Field label="Department Name" hint='Full department name (e.g. "Maplewood VFD")'>
          <input {...inp('departmentName')} placeholder="Maplewood VFD" />
        </Field>
        <Field label="Station Number">
          <input {...inp('stationNumber')} placeholder="14" />
        </Field>
        <Field label="Year Founded">
          <input {...inp('founded')} placeholder="1952" />
        </Field>
        <Field label="County">
          <input {...inp('county')} placeholder="Maplewood County" />
        </Field>
        <Field label="Fire District">
          <input {...inp('district')} placeholder="Fire District 3" />
        </Field>
        <Field label="FDID (NFIRS)" hint="Fire Department ID used for federal incident reporting">
          <input {...inp('fdid')} placeholder="PA-4214" />
        </Field>
      </Section>

      {/* ── address ── */}
      <Section icon={MapPin} title="Station Address">
        <Field label="Street Address" span={2}>
          <input {...inp('address')} placeholder="1400 Elm Street" />
        </Field>
        <Field label="City">
          <input {...inp('city')} placeholder="Maplewood" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="State">
            <select
              value={form.state ?? ''}
              onChange={(e) => set('state', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
            >
              {/* Value stays the 2-letter code — prod stations hold codes ('NJ') or empty. */}
              {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}
            </select>
          </Field>
          <Field label="ZIP Code">
            <input {...inp('zip')} placeholder="17001" />
          </Field>
        </div>
      </Section>

      {/* ── contact ── */}
      <Section icon={Phone} title="Contact Information">
        <Field label="Station Phone">
          <div className="relative">
            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input {...inp('phone', { className: 'pl-8' })} placeholder="(717) 555-0114" />
          </div>
        </Field>
        <Field label="Station Email">
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input {...inp('email', { className: 'pl-8' })} type="email" placeholder="station14@maplewoodvfd.org" />
          </div>
        </Field>
        <Field label="Website" span={2}>
          <div className="relative">
            <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input {...inp('website', { className: 'pl-8' })} placeholder="www.maplewoodvfd.org" />
          </div>
        </Field>
      </Section>

      {/* ── chief / officer ── */}
      <Section icon={User} title="Fire Chief / Primary Contact">
        <Field label="Chief's Name">
          <input {...inp('chiefName')} placeholder="Full name" />
        </Field>
        <Field label="Chief's Phone">
          <div className="relative">
            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input {...inp('chiefPhone', { className: 'pl-8' })} placeholder="(717) 555-0100" />
          </div>
        </Field>
        <Field label="Chief's Email" span={2}>
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input {...inp('chiefEmail', { className: 'pl-8' })} type="email" placeholder="chief@maplewoodvfd.org" />
          </div>
        </Field>
      </Section>

      {/* ── operational defaults ── */}
      <Section icon={Clock} title="Operational Defaults">
        <Field label="Minimum Crew Size" hint="Minimum members required for a fully-staffed shift">
          <input
            type="number"
            min={1}
            max={20}
            {...inp('minCrewSize')}
            placeholder="3"
          />
        </Field>
        <Field label="Default Shift Length (hours)">
          <select
            value={form.shiftLength ?? 12}
            onChange={(e) => set('shiftLength', Number(e.target.value))}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
          >
            {[8, 10, 12, 16, 24].map((h) => (
              <option key={h} value={h}>{h} hours</option>
            ))}
          </select>
        </Field>
        <Field label="Time Zone" span={2}>
          <select
            value={form.timezone ?? 'America/New_York'}
            onChange={(e) => set('timezone', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </Field>
      </Section>

      {/* ── NFIRS / IDs ── */}
      <Section icon={Hash} title="Identifiers & Reporting">
        <Field label="FDID" hint="Used in NFIRS incident exports">
          <input {...inp('fdid')} placeholder="PA-4214" />
        </Field>
        <Field label="Fire District">
          <input {...inp('district')} placeholder="Fire District 3" />
        </Field>
      </Section>

      {/* Mobile / Push Notifications */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Bell size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Mobile Notifications</h2>
        </div>
        <div className="px-6 py-5">
          <PushNotificationSetup />
        </div>
      </div>

      {/* Notifications by Rank (chief-configurable; migration 0026) */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Bell size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Notifications by Rank</h2>
        </div>
        <div className="px-6 py-5">
          <RankNotificationSettings />
        </div>
      </div>

      {/* ── Minimum staffing (per-department, warn/block) ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Users size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Minimum Staffing</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            The per-shift minimum used when reviewing leave. When an approval would drop a shift
            below this, <strong>Warn</strong> flags it for the approver (the norm); <strong>Block</strong>
            refuses the approval until coverage is resolved. Leave blank to use the default (3).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <label className="block">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Minimum per shift</span>
              <input type="number" min="0" max="100" value={minStaffing}
                onChange={(e) => setMinStaffing(e.target.value)} placeholder="3"
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-900" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">When below minimum</span>
              <select value={staffingEnforcement} onChange={(e) => setStaffingEnforcement(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-900">
                <option value="warn">Warn (recommended)</option>
                <option value="block">Block approval</option>
              </select>
            </label>
            <button type="button" onClick={saveStaffing} disabled={staffingSaving}
              className="flex items-center justify-center gap-1.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors">
              {staffingSaving ? 'Saving…' : staffingSaved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Station Displays (paired devices, per-station) ── */}
      <StationDisplaysPanel />

      {/* ── TV Display — All Device Options (legacy shared PIN) ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Tv size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">TV Display Setup (shared PIN)</h2>
        </div>
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Open Firehouse includes a dedicated TV display designed for station day rooms. It shows live crew status, apparatus readiness, today's schedule, weather, and automatically switches to incident mode when the Command Board goes active. Zero interaction required — firefighters walk in, glance at the TV, and know everything about their day.
          </p>

          {tvPin ? (
            <div className="space-y-5">
              {/* TV URL + PIN Section */}
              <div className="bg-gray-900 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Your TV Display URL</p>
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400">PIN: {tvPin}</span>
                </div>
                <p className="text-sm font-mono text-green-400 break-all mb-4">
                  {window.location.origin}/tv?pin={tvPin}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyTextToClipboard(`${window.location.origin}/tv?pin=${tvPin}`);
                      setCopied(ok); // only claim "Copied!" when a copy path actually succeeded
                      if (ok) setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Copy size={12} /> {copied ? 'Copied!' : 'Copy URL'}
                  </button>
                  <button
                    type="button"
                    onClick={regenerateTvPin}
                    className="flex items-center gap-1.5 bg-red-600/30 hover:bg-red-600/50 text-red-300 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <RotateCcw size={12} /> New PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(`${window.location.origin}/tv?pin=${tvPin}`, '_blank')}
                    className="flex items-center gap-1.5 bg-green-600/40 hover:bg-green-600/60 text-green-300 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Tv size={12} /> Launch TV Mode
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">This URL works on any device with a web browser. The PIN keeps the display private to your station.</p>
              </div>

              {/* ── Device Setup Guides ── */}
              <div>
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Setup Guide by Device</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">All options use the same TV URL above. Pick whichever hardware you have or want to buy.</p>

                {/* Apple TV */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">🍎</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Apple TV</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Best for Apple-ecosystem stations · $129–$199</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Requirements</p>
                    <p>Apple TV HD (4th gen) or Apple TV 4K. Any TV with HDMI input.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Connect Apple TV to your TV via HDMI and to the station WiFi.</li>
                      <li>Open the <strong>Safari</strong> browser (or install any web browser from the App Store).</li>
                      <li>Enter the TV URL above (use the Apple TV remote's text entry, or AirPlay from your phone to type it).</li>
                      <li>Bookmark the page for easy access.</li>
                      <li>Go to <strong>Settings → General → Sleep After</strong> and set to <strong>Never</strong> to keep the display always on.</li>
                      <li>Optional: Use <strong>Guided Access</strong> (Settings → Accessibility) to lock the Apple TV into the browser app so nobody accidentally switches away.</li>
                    </ol>
                    <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg p-2.5 mt-3">
                      <p className="text-blue-800 dark:text-blue-300"><strong>Pro tip:</strong> AirPlay from an iPhone or Mac to type the URL more easily. You can also use the free "Remote" app on your iPhone to control the Apple TV.</p>
                    </div>
                  </div>
                </details>

                {/* Raspberry Pi */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">🍓</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Raspberry Pi (Recommended)</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Best budget option · Kiosk mode · $35–$80</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Why Raspberry Pi?</p>
                    <p>This is our top recommendation for dedicated station displays. It's inexpensive, runs silently, boots directly into your TV display in kiosk mode, and auto-recovers from power outages. Many fire stations use them.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Requirements</p>
                    <p>Raspberry Pi 4 or Pi 5 (2GB+ RAM), micro SD card (16GB+), USB-C power supply, micro-HDMI to HDMI cable. Any TV with HDMI input.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Flash <strong>Raspberry Pi OS Lite (64-bit)</strong> to the SD card using Raspberry Pi Imager.</li>
                      <li>Connect the Pi to your TV via HDMI and to the station network (WiFi or Ethernet).</li>
                      <li>Install Chromium browser: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">sudo apt install chromium-browser</code></li>
                      <li>Create a kiosk startup script that launches Chromium in full-screen mode pointing to your TV URL.</li>
                      <li>Add the script to <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">/etc/xdg/lxsession/LXDE-pi/autostart</code> so it runs on boot.</li>
                      <li>Disable screen blanking: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">sudo raspi-config</code> → Display Options → Screen Blanking → Off.</li>
                    </ol>
                    <div className="bg-gray-900 rounded-lg p-3 mt-3 font-mono text-[11px] text-green-400 leading-relaxed">
                      <p className="text-gray-500 dark:text-gray-400 mb-1"># Example kiosk autostart script</p>
                      <p>@xset s off</p>
                      <p>@xset -dpms</p>
                      <p>@xset s noblank</p>
                      <p>@chromium-browser --noerrdialogs --disable-infobars \</p>
                      <p className="ml-4">--kiosk {window.location.origin}/tv?pin={tvPin}</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg p-2.5 mt-3">
                      <p className="text-green-800 dark:text-green-300"><strong>Power recovery:</strong> The Pi auto-boots when power returns after an outage, and the kiosk script restarts Chromium automatically. No manual intervention needed.</p>
                    </div>
                  </div>
                </details>

                {/* Amazon Fire TV Stick */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">🔥</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Amazon Fire TV Stick</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Easy plug-and-play · $30–$50</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Requirements</p>
                    <p>Amazon Fire TV Stick (any model). Any TV with HDMI. Station WiFi.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Plug the Fire TV Stick into your TV's HDMI port and connect to station WiFi.</li>
                      <li>Install <strong>Amazon Silk Browser</strong> from the Fire TV app store (it's free and pre-installed on most models).</li>
                      <li>Open Silk Browser and enter the TV URL above.</li>
                      <li>Bookmark the page. You can set it as the Silk homepage under browser settings.</li>
                      <li>Go to <strong>Settings → Display & Sounds → Screen Saver → Start Time</strong> and set to <strong>Never</strong>.</li>
                      <li>Optional: Install the free <strong>"Fully Kiosk Browser"</strong> app for more robust kiosk features (auto-restart, screen dimming on schedule, wake-on-motion).</li>
                    </ol>
                    <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg p-2.5 mt-3">
                      <p className="text-amber-800 dark:text-amber-300"><strong>Note:</strong> The Silk browser works well for basic use. For a dedicated 24/7 display, we recommend Fully Kiosk Browser ($7.90 one-time) — it auto-relaunches after crashes and can dim the screen on a schedule to extend TV life.</p>
                    </div>
                  </div>
                </details>

                {/* Google Chromecast */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">📡</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Google Chromecast / Google TV</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Cast from any device · $30–$50</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Requirements</p>
                    <p>Chromecast with Google TV (recommended) or classic Chromecast. Any TV with HDMI.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Option A: Chromecast with Google TV (built-in browser)</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Plug in the Chromecast and connect to station WiFi.</li>
                      <li>Sideload or install a web browser (Chrome is not included by default — install <strong>"TV Bro"</strong> or sideload Chrome via <strong>"Downloader"</strong> app).</li>
                      <li>Open the browser and navigate to your TV URL. Bookmark it.</li>
                      <li>Go to Settings → System → Screen saver → Start time: <strong>Never</strong>.</li>
                    </ol>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Option B: Cast a Chrome tab from a station computer</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>On a station computer, open Chrome and navigate to the TV URL.</li>
                      <li>Click the three-dot menu → <strong>Save and share → Cast…</strong></li>
                      <li>Select your Chromecast. The tab will mirror to the TV.</li>
                      <li>The computer must stay on and connected for this to work.</li>
                    </ol>
                    <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg p-2.5 mt-3">
                      <p className="text-blue-800 dark:text-blue-300"><strong>Recommendation:</strong> Chromecast with Google TV running a browser directly is better than tab casting. Tab casting depends on the source computer staying on and can have slight lag.</p>
                    </div>
                  </div>
                </details>

                {/* Smart TV Built-in Browser */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">📺</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Smart TV Built-in Browser</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">No extra hardware needed · Samsung, LG, Vizio, etc.</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Requirements</p>
                    <p>Any Smart TV from 2018 or later with a built-in web browser (Samsung, LG, Sony, Vizio, Hisense, TCL all include one). Station WiFi.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Connect your Smart TV to the station WiFi network.</li>
                      <li>Open the TV's built-in web browser (usually in the app drawer or home screen).</li>
                      <li>Enter the TV URL above. Bookmark it for quick access.</li>
                      <li>Most Smart TVs have a "Set as Homepage" option — use it so the display loads on browser launch.</li>
                      <li>Disable screen saver / auto-sleep in the TV's settings menu.</li>
                    </ol>
                    <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg p-2.5 mt-3">
                      <p className="text-amber-800 dark:text-amber-300"><strong>Limitations:</strong> Smart TV browsers are often underpowered and may not auto-refresh reliably over 24+ hours. They can also be slow to render. For a dedicated 24/7 display, a Raspberry Pi or Fire TV Stick plugged into the same TV is more reliable. The built-in browser works fine for occasional or shift-based viewing.</p>
                    </div>
                  </div>
                </details>

                {/* Old Laptop / Mini PC */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">💻</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Old Laptop or Mini PC</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Repurpose existing hardware · Free</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Why this works</p>
                    <p>An old laptop or mini PC (Intel NUC, etc.) running Chrome in kiosk mode is essentially the same as a Raspberry Pi — but you might already have one sitting in a closet. Connect it to the TV via HDMI and you're done.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps (Windows)</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Connect the laptop/PC to the TV via HDMI.</li>
                      <li>Install Chrome and create a shortcut with the flag: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">--kiosk {window.location.origin}/tv?pin={tvPin}</code></li>
                      <li>Place the shortcut in the Windows Startup folder (<code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">shell:startup</code>).</li>
                      <li>Set Windows to auto-login, disable sleep, and disable the lock screen.</li>
                      <li>Set the TV as the primary display in Display Settings.</li>
                    </ol>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps (Mac)</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Connect the Mac to the TV via HDMI (or USB-C adapter).</li>
                      <li>Open Chrome and navigate to the TV URL.</li>
                      <li>Press <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">Cmd+Shift+F</code> for full-screen mode.</li>
                      <li>Add Chrome to Login Items (System Settings → General → Login Items) so it opens on boot.</li>
                      <li>Disable sleep in Energy Saver settings.</li>
                    </ol>
                    <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg p-2.5 mt-3">
                      <p className="text-green-800 dark:text-green-300"><strong>Bonus:</strong> If the laptop has a webcam, you can double-purpose it as a station camera for remote monitoring. Close the laptop lid (set "close lid action" to "do nothing") and tuck it behind the TV.</p>
                    </div>
                  </div>
                </details>

                {/* HDMI Wireless Adapter */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">📶</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Wireless Display Adapter (Miracast / AirPlay)</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Mirror from phone or tablet · $20–$40</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">How it works</p>
                    <p>A wireless display adapter (Microsoft Wireless Display Adapter, AnyCast, or similar) plugs into your TV's HDMI port and receives a screen mirror from a phone, tablet, or computer. Open the TV URL on the source device and cast the screen to the adapter.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">When to use this</p>
                    <p>This is best for <strong>temporary displays</strong> — training nights, open houses, or special events. It's not ideal for 24/7 use because the source device must stay on and connected. For permanent station displays, use one of the dedicated options above.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Protocols supported</p>
                    <ul className="list-disc list-inside space-y-1 ml-1">
                      <li><strong>AirPlay:</strong> iPhone, iPad, Mac → Apple TV or AirPlay-compatible adapter</li>
                      <li><strong>Miracast:</strong> Windows, Android → Miracast adapter (most wireless HDMI dongles)</li>
                      <li><strong>Google Cast:</strong> Chrome browser → Chromecast</li>
                    </ul>
                  </div>
                </details>
              </div>

              {/* Comparison Table */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-950 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Quick Comparison</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-300">
                        <th className="text-left px-3 py-2 font-bold">Device</th>
                        <th className="text-left px-3 py-2 font-bold">Cost</th>
                        <th className="text-left px-3 py-2 font-bold">24/7 Ready</th>
                        <th className="text-left px-3 py-2 font-bold">Kiosk Mode</th>
                        <th className="text-left px-3 py-2 font-bold">Auto-Recovery</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      <tr className="bg-green-50 dark:bg-green-950/50">
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">🍓 Raspberry Pi</td>
                        <td className="px-3 py-2">$35–$80</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Excellent</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Native</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Auto-boot</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">🔥 Fire TV Stick</td>
                        <td className="px-3 py-2">$30–$50</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Good</td>
                        <td className="px-3 py-2 text-amber-600 dark:text-amber-400">With Fully Kiosk</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Auto-boot</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">🍎 Apple TV</td>
                        <td className="px-3 py-2">$129–$199</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Good</td>
                        <td className="px-3 py-2 text-amber-600 dark:text-amber-400">Guided Access</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Auto-boot</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">📡 Chromecast w/ Google TV</td>
                        <td className="px-3 py-2">$30–$50</td>
                        <td className="px-3 py-2 text-amber-600 dark:text-amber-400">Moderate</td>
                        <td className="px-3 py-2 text-amber-600 dark:text-amber-400">With sideload</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Auto-boot</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">📺 Smart TV Browser</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Free</td>
                        <td className="px-3 py-2 text-red-600 dark:text-red-400">Limited</td>
                        <td className="px-3 py-2 text-red-600 dark:text-red-400">None</td>
                        <td className="px-3 py-2 text-amber-600 dark:text-amber-400">Manual</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">💻 Old Laptop/PC</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Free</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Excellent</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Native</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Auto-boot</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Display Features */}
              <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">What the TV Display Shows</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>Live clock</strong> with station name and date</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>On-duty crew</strong> with rank and status</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>Apparatus status</strong> — green/amber/red</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>Today's schedule</strong> — events, training, meetings</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>Live weather</strong> with wind speed and fire weather alerts</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>AI briefing</strong> — rotating actionable insights</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>Readiness scorecard</strong> — staffing, apparatus, training, budget</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">●</span>
                    <span><strong>Incident mode</strong> — auto-switches when Command Board goes active</span>
                  </div>
                </div>
              </div>

              {/* Troubleshooting */}
              <details className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-100 flex-1">Troubleshooting</span>
                  <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="px-4 py-4 space-y-3 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="font-bold text-gray-800 dark:text-gray-100">Display shows "No TV PIN provided"</p>
                    <p>The URL is missing the <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">?pin=XXXX-XXXX</code> parameter. Copy the full URL from above, including the pin.</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 dark:text-gray-100">Display shows "Connection Error"</p>
                    <p>The device can't reach the Open Firehouse server. Check that the device is on the same WiFi network or has internet access. Verify the server is running.</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 dark:text-gray-100">Screen goes black after a while</p>
                    <p>The device's screensaver or sleep mode kicked in. Disable sleep/screen saver in the device settings (see setup steps above for your specific device).</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 dark:text-gray-100">Display seems frozen or stale</p>
                    <p>The TV display auto-refreshes every 15–60 seconds. If it appears frozen, the browser may have crashed. Restart the browser or reboot the device. For Raspberry Pi, the kiosk autostart script handles this automatically.</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 dark:text-gray-100">Incident mode didn't activate</p>
                    <p>Incident mode triggers when an active incident exists on the Command Board. Make sure the incident was created through the Command Board (not just the Incident Log). The TV checks every 15 seconds.</p>
                  </div>
                </div>
              </details>
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">Initializing TV PIN…</p>
          )}
        </div>
      </div>

      {/* ── Radio Integration ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Radio size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Radio Integration</h2>
        </div>
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Open Firehouse can display live radio communications on The Board, the Command Board during incidents, and the TV Display. Radio traffic is captured by station hardware (SDR receiver), transcribed by AI, and streamed to all connected displays in real time.
          </p>

          <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-2">How Radio Integration Works</p>
            <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
              <p>1. An RTL-SDR USB dongle + Raspberry Pi at the station captures your radio frequencies.</p>
              <p>2. Trunk Recorder decodes P25/analog transmissions into individual audio files.</p>
              <p>3. OpenAI Whisper transcribes the audio to text with timestamps and talkgroup IDs.</p>
              <p>4. The Pi sends transcriptions to Open Firehouse via the Radio Ingest API.</p>
              <p>5. All Board, Command Board, and TV displays update in real time via WebSocket.</p>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">Coming Soon — Hardware Setup Guide</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              The station hardware kit (RTL-SDR + Raspberry Pi + antenna, ~$140 total) and one-click installer are being developed. For now, you can test radio features using the Simulate button on The Board or the Radio Log page.
            </p>
          </div>

          {/* API Key for station hardware */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Radio Ingest API Key</label>
            <p className="text-xs text-gray-500 dark:text-gray-400">Station hardware uses this key to authenticate when sending transcribed radio messages. The Pi sends POST requests to <code className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-[11px]">/api/radio-ingest</code> with header <code className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-[11px]">X-Radio-API-Key</code>.</p>
            <div className="bg-gray-900 rounded-lg p-3 font-mono text-sm text-green-400 flex items-center justify-between gap-2">
              <span className="text-gray-400 select-none">Key: </span>
              <span className="flex-1 select-all">Configure in Radio Config API (PUT /api/radio/config)</span>
            </div>
          </div>

          {/* Where radio appears */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Where Radio Appears</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-xs font-bold text-gray-800 dark:text-gray-100">The Board</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Scrolling feed of all radio traffic between the Crew Board and River Timeline. Shows talkgroup badges, timestamps, and priority indicators.</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-xs font-bold text-gray-800 dark:text-gray-100">Command Board</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Live radio panel integrated into the incident control screen. All tactical and dispatch traffic visible during active incidents alongside unit tracking and personnel accountability.</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-xs font-bold text-gray-800 dark:text-gray-100">TV Display</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Ticker bar at the bottom of the wall display showing the last 5 radio transmissions. Updates in real time via WebSocket — no polling delay.</p>
              </div>
            </div>
          </div>

          {/* Hardware shopping list */}
          <details className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Package size={14} className="text-blue-500" />
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100 flex-1">Hardware Shopping List (~$140/station)</span>
              <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
              <div className="flex justify-between"><span className="font-bold">RTL-SDR Blog V4 USB Dongle</span><span>~$36</span></div>
              <div className="flex justify-between"><span className="font-bold">Raspberry Pi 5 (4GB)</span><span>~$60</span></div>
              <div className="flex justify-between"><span className="font-bold">Discone or whip antenna</span><span>~$15–30</span></div>
              <div className="flex justify-between"><span className="font-bold">64GB MicroSD card</span><span>~$10</span></div>
              <div className="flex justify-between"><span className="font-bold">Power supply + case</span><span>~$15</span></div>
              <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2 flex justify-between font-bold text-gray-800 dark:text-gray-100">
                <span>Total per Station</span><span>~$136–$175</span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-2">The Raspberry Pi can double as your TV display kiosk, serving both functions from a single device.</p>
            </div>
          </details>
        </div>
      </div>

      {/* ── Career & Staffing Configuration ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <div className="flex items-center gap-3">
            <Briefcase size={16} className="text-red-600 dark:text-red-400" />
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Career & Staffing Configuration</h2>
          </div>
          {careerConfig.dept_type !== 'volunteer' && (
            <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 px-2 py-0.5 rounded-full">
              CAREER MODE
            </span>
          )}
        </div>
        <div className="px-6 py-5 space-y-5">
          {careerLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading career config…
            </div>
          ) : (
            <>
              {/* Dept Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label="Department Type" hint="Controls which career features are visible. 'Volunteer' hides FLSA/platoon features.">
                  <select
                    value={careerConfig.dept_type}
                    onChange={e => setCareerConfig(c => ({ ...c, dept_type: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100"
                  >
                    <option value="volunteer">Volunteer</option>
                    <option value="career">Career (Paid)</option>
                    <option value="combination">Combination</option>
                    <option value="industrial">Industrial</option>
                  </select>
                </Field>

                <Field label="Minimum Staffing Hard-Block" hint="When ON, shifts below minimum crew cannot be saved.">
                  <button
                    type="button"
                    onClick={() => setCareerConfig(c => ({ ...c, min_staffing_block: !c.min_staffing_block }))}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                      careerConfig.min_staffing_block
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <Shield size={14} />
                    {careerConfig.min_staffing_block ? 'Hard-Block ENABLED' : 'Hard-Block Off (warnings only)'}
                  </button>
                </Field>
              </div>

              {/* FLSA Section — only show for career/combination */}
              {(careerConfig.dept_type === 'career' || careerConfig.dept_type === 'combination') && (
                <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-blue-700 dark:text-blue-300" />
                    <p className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide">FLSA §207(k) Work Period</p>
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    The FLSA allows fire departments to use work periods of 7–28 days for overtime calculation instead of the standard 40hr/week.
                    Configure your work period length, OT threshold, and anchor date below.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Work Period (days)</label>
                      <select
                        value={careerConfig.flsa_work_period}
                        onChange={e => setCareerConfig(c => ({ ...c, flsa_work_period: parseInt(e.target.value) }))}
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-gray-100"
                      >
                        {[7, 14, 21, 28].map(d => (
                          <option key={d} value={d}>{d} days{d === 7 ? ' (standard week)' : d === 28 ? ' (most common for fire)' : ''}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">FLSA §207(k) allows 7–28 day periods</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">OT Threshold (hours)</label>
                      <input
                        type="number"
                        min={40}
                        max={212}
                        value={careerConfig.flsa_ot_threshold}
                        onChange={e => setCareerConfig(c => ({ ...c, flsa_ot_threshold: parseFloat(e.target.value) || 40 }))}
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-gray-100"
                      />
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                        FLSA max: {careerConfig.flsa_work_period === 28 ? '212' : careerConfig.flsa_work_period === 14 ? '106' : '53'}h for {careerConfig.flsa_work_period}-day period
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Period Start (anchor)</label>
                      <input
                        type="date"
                        value={careerConfig.flsa_period_start}
                        onChange={e => setCareerConfig(c => ({ ...c, flsa_period_start: e.target.value }))}
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-gray-100"
                      />
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">The date your first FLSA work period began</p>
                    </div>
                  </div>

                  {careerConfig.min_staffing_block && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                      <AlertTriangle size={12} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[10px] text-red-700 dark:text-red-300">
                        Hard-block mode is active. Officers will not be able to save shifts with fewer crew than the minimum. Make sure your minimum crew setting (in the schedule) is correct before enabling this.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Save button */}
              <div className="flex justify-end">
                <button
                  onClick={saveCareerConfig}
                  disabled={careerSaving}
                  className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    careerSaved
                      ? 'bg-emerald-600 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white disabled:opacity-50'
                  }`}
                >
                  {careerSaved ? <><CheckCircle2 size={14} /> Saved!</> : careerSaving ? 'Saving…' : <><Save size={14} /> Save Career Config</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 5.7 (0113) — department-authored roles ── */}
      <RolesPanel />

      {/* ── Sign-in security — session + idle timeout (migration 0110) ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Shield size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Sign-in Security</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            How long a signed-in session survives without activity. Browsers and mounted apparatus
            devices get <span className="font-semibold">separate</span> windows on purpose — a browser on
            a desk in a public hallway should lock quickly; an iPad bolted into a rig must not sign a
            crew out mid-call. Changes take effect at each member&rsquo;s next sign-in or token refresh
            and never end a session already underway. (Chief-only setting.)
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="idle-web" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Browser idle timeout
              </label>
              <select
                id="idle-web"
                value={idleWeb}
                onChange={(e) => setIdleWeb(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {SESSION_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="idle-mobile" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Apparatus &amp; phone app idle timeout
              </label>
              <select
                id="idle-mobile"
                value={idleMobile}
                onChange={(e) => setIdleMobile(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {SESSION_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="max-hours" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Maximum session length (hours, 1&ndash;168)
            </label>
            <input
              id="max-hours"
              type="number"
              min={1}
              max={168}
              value={maxHours}
              onChange={(e) => setMaxHours(e.target.value)}
              className="w-full sm:w-48 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              A hard ceiling on one sign-in, no matter how active. Reaching it always requires signing in again.
            </p>
          </div>

          <button
            type="button"
            onClick={saveSessionPolicy}
            disabled={sessionSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border bg-red-600 text-white border-red-600 disabled:opacity-60"
          >
            {sessionSaving ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
            {sessionSaved ? 'Saved' : 'Save sign-in security'}
          </button>

          {/* ── 0111 — Multi-factor authentication ── */}
          <div className="pt-5 mt-1 border-t border-gray-100 dark:border-gray-800 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">
                Multi-factor authentication
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                A 6-digit code from an authenticator app, on top of your password. Codes are
                generated on your phone and work with no signal.
              </p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-3">
                For your account only
              </p>
            </div>

            {mfaErr && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">{mfaErr}</p>
            )}

            {/* Recovery codes — shown exactly once, immediately after enrolling. */}
            {mfaCodes && (
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Save these recovery codes now — this is the only time they are shown.
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  If you lose your phone, these are the only way back into your account. Print them
                  or put them somewhere safe. Each one works once.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
                  {mfaCodes.map((c) => (
                    <code key={c} className="text-xs font-mono bg-white dark:bg-gray-900 rounded px-2 py-1 text-center text-gray-900 dark:text-gray-100">
                      {c}
                    </code>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setMfaCodes(null)}
                  className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 underline"
                >
                  I have saved them
                </button>
              </div>
            )}

            {/* Enrolment in progress */}
            {mfaEnroll ? (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Add this key to your authenticator app, then enter the code it shows to finish.
                </p>
                <div>
                  <span className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Setup key</span>
                  <code className="block text-sm font-mono bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 break-all text-gray-900 dark:text-gray-100">
                    {mfaEnroll.manualEntryKey}
                  </code>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label htmlFor="mfa-confirm" className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      Code from your app
                    </label>
                    <input
                      id="mfa-confirm"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      placeholder="000000"
                      className="w-40 px-3 py-2 text-sm font-mono tracking-widest rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={confirmEnroll}
                    disabled={mfaBusy || mfaCode.trim().length < 6}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white disabled:opacity-50"
                  >
                    {mfaBusy ? 'Checking…' : 'Turn on'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMfaEnroll(null); setMfaCode(''); setMfaErr(''); }}
                    className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : mfaStatus === null ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : mfaStatus.enabled ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300">
                  <Shield size={13} /> ON for your account
                </span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {mfaStatus.recoveryCodesRemaining} recovery code{mfaStatus.recoveryCodesRemaining === 1 ? '' : 's'} left
                </span>
                <button
                  type="button"
                  onClick={disableMfa}
                  disabled={mfaBusy || mfaStatus.departmentRequired}
                  title={mfaStatus.departmentRequired ? 'Your department requires MFA' : undefined}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50"
                >
                  Turn off
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={startEnroll}
                  disabled={mfaBusy}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white disabled:opacity-60"
                >
                  {mfaBusy ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                  Set up on this account
                </button>
                {mfaStatus.departmentRequired && (
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Your department requires this.
                  </span>
                )}
              </div>
            )}

            {/* Chief-only: the department-wide mandate.
                Design-critique fix (live walk, 2026-07-27): this sat inches below
                "Set up on this account" with no scope cue, so a chief could mistake
                a personal action for a department-wide one. The two are now visually
                and verbally separated. */}
            <div className="pt-4 mt-2 border-t-2 border-gray-200 dark:border-gray-700">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                For the whole department
              </p>
              <button
                type="button"
                onClick={toggleMfaRequired}
                disabled={mfaBusy || rigDeptId == null}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  mfaRequired
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                }`}
              >
                <Shield size={14} />
                {mfaRequired
                  ? 'Required for every member'
                  : 'Not required department-wide'}
              </button>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                Turning this on asks every member to set up an authenticator app. Nobody is locked
                out of a session they are already in. (Chief-only setting.)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Unit Statusing — rig self-status gate (migration 0040) ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Shield size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Unit Statusing</h2>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            When ON, a rig may status <span className="font-semibold">its own unit</span> from the cab
            (En Route / On Scene / Back in Service / In Quarters, two-tap confirm on the mounted iPad).
            Dispatch and command can always status any unit and retain override. Statuses are only ever
            changed by a person — never inferred from GPS, geofences, or AI. Turn this OFF to run strict
            dispatch-only statusing. (Chief-only setting.)
          </p>
          {rigStatus === null ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <button
              type="button"
              onClick={toggleRigStatus}
              disabled={rigSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                rigStatus
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}
            >
              {rigSaving ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              {rigStatus ? 'Rig self-statusing ENABLED (own unit only)' : 'Rig self-statusing OFF (dispatch-only)'}
            </button>
          )}

          {/* PAR interval default (0062) */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Default PAR interval (minutes)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Your SOG's PAR cadence. When set, a newly activated Command Board starts its PAR timer
              at this interval automatically; command can still change it per incident. Blank = no
              timer until command sets one. (There is no NFPA-mandated interval — this is your
              department's own SOG number.)
            </p>
            {parDefault === null ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="180" step="1" placeholder="none"
                  value={parDefault}
                  onChange={(e) => setParDefault(e.target.value)}
                  className="w-24 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 dark:text-gray-100"
                  aria-label="Default PAR interval in minutes"
                />
                <button
                  type="button"
                  onClick={saveParDefault}
                  disabled={parSaving}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {parSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Save
                </button>
              </div>
            )}
          </div>

          {/* Status timers (0046) */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Status timers (minutes)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              A unit sitting in a status past its threshold flashes on the board with a
              <span className="font-semibold"> Status check</span> button — radio the rig, confirm,
              click; the check is recorded and the timer resets. Blank = default shown, 0 = off.
              Nothing ever changes a status automatically.
            </p>
            {timerCfg === null ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                {Object.keys(TIMER_DEFAULTS).map((k) => (
                  <div key={k}>
                    <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">{TIMER_LABELS[k]}</label>
                    <input
                      type="number" min="0" max="1440"
                      placeholder={String(TIMER_DEFAULTS[k])}
                      value={timerCfg[k] ?? ''}
                      onChange={(e) => setTimerCfg((c) => ({ ...c, [k]: e.target.value }))}
                      className="w-20 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-2 py-1.5"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  disabled={timerSaving}
                  onClick={saveTimerCfg}
                  className="px-3 py-2 rounded-lg text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:border-gray-300 disabled:opacity-50"
                >
                  {timerSaving ? 'Saving…' : 'Save timers'}
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── NERIS Reporting (Track B) — entity id, submission gate, enrollment ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Shield size={16} className="text-sky-600 dark:text-sky-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">NERIS Reporting</h2>
          {nerisInfo && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              nerisInfo.environment === 'live'
                ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300'
                : 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
            }`}>
              {nerisInfo.environment === 'live' ? 'LIVE environment' : 'TEST environment'}
            </span>
          )}
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            When enabled, an <span className="font-semibold">approved</span> incident report submits to
            NERIS automatically (and re-submits when an approved report is edited). Rejections and
            failures surface on the report itself; retries run hourly. Submission is OFF by default —
            nothing leaves this system until you turn it on. (Chief-only.)
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Your department in NERIS</label>

            {nerisId === null ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 size={14} className="animate-spin" /> Loading…</div>
            ) : String(nerisId).trim() && !nerisManual ? (
              /* ── Already connected: show WHO, not just a code the chief can't read ── */
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {nerisPicked?.name || nerisCheck?.name || 'Entity set'}
                    </p>
                    {(nerisPicked?.address_line_1 || nerisPicked?.city) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {[nerisPicked.address_line_1, [nerisPicked.city, nerisPicked.state].filter(Boolean).join(', ')]
                          .filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="mt-1 text-xs font-mono text-gray-600 dark:text-gray-300">{nerisId}</p>
                    {!nerisCheck?.ok && (
                      <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <span className="font-semibold">Next:</span> do the one-time enrollment below in the NERIS portal, then Check connection.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button type="button" onClick={runNerisCheck} disabled={nerisChecking}
                      className="px-3 py-1.5 rounded-full text-[11px] font-semibold border bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900 hover:bg-sky-100 dark:hover:bg-sky-950/70 transition-colors disabled:opacity-50">
                      {nerisChecking ? 'Checking…' : 'Check connection'}
                    </button>
                    <button type="button" onClick={() => { setNerisId(''); setNerisPicked(null); setNerisCheck(null); }}
                      className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      Change
                    </button>
                  </div>
                </div>
              </div>
            ) : nerisManual ? (
              /* ── Manual fallback: search is down, or the department registered with
                   NERIS too recently to be searchable yet. ── */
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  From your NERIS onboarding (or your State Fire Marshal) — looks like FD12345678.
                </p>
                <div className="flex items-center gap-2">
                  <input type="text" value={nerisId} placeholder="FD12345678" maxLength={10}
                    onChange={(e) => setNerisId(e.target.value.toUpperCase())}
                    aria-label="NERIS entity ID"
                    className="w-40 px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 dark:text-gray-100" />
                  <button type="button" onClick={saveNerisId} disabled={nerisSaving}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
                    {nerisSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={runNerisCheck} disabled={nerisChecking || !String(nerisId || '').trim()}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900 hover:bg-sky-100 dark:hover:bg-sky-950/70 transition-colors disabled:opacity-50">
                    {nerisChecking ? 'Checking…' : 'Check connection'}
                  </button>
                </div>
                <button type="button" onClick={() => { setNerisManual(false); setNerisSearchError(null); }}
                  className="mt-2 text-xs text-sky-700 dark:text-sky-400 hover:underline">
                  Search for my department instead
                </button>
              </div>
            ) : (
              /* ── Default: find the department, don't type its id ── */
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Search the national NERIS registry and pick your department — we'll store its ID for you.
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={nerisQuery}
                      onChange={(e) => setNerisQuery(e.target.value)}
                      onKeyDown={(e) => {
                        const list = nerisResults?.results || [];
                        if (!list.length) return;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setNerisActiveIdx((i) => (i + 1) % list.length);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setNerisActiveIdx((i) => (i <= 0 ? list.length - 1 : i - 1));
                        } else if (e.key === 'Enter' && nerisActiveIdx >= 0) {
                          e.preventDefault();
                          pickNerisEntity(list[nerisActiveIdx]);
                        } else if (e.key === 'Escape') {
                          setNerisResults(null); setNerisActiveIdx(-1);
                        }
                      }}
                      placeholder="Department name — e.g. Maplewood"
                      aria-label="Search NERIS for your department"
                      role="combobox"
                      aria-expanded={Boolean(nerisResults?.results?.length)}
                      aria-controls="neris-entity-listbox"
                      aria-autocomplete="list"
                      aria-activedescendant={nerisActiveIdx >= 0 ? `neris-opt-${nerisActiveIdx}` : undefined}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 dark:text-gray-100" />
                  </div>
                  <input type="text" value={nerisStateFilter} maxLength={2}
                    onChange={(e) => setNerisStateFilter(e.target.value.toUpperCase())}
                    placeholder="ST" aria-label="Narrow by state (2-letter code)"
                    className="w-16 px-3 py-2 text-sm font-mono text-center border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 dark:text-gray-100" />
                </div>

                {nerisQuery.trim().length > 0 && nerisQuery.trim().length < NERIS_SEARCH_MIN_Q && (
                  <p className="mt-2 text-xs text-gray-400">Keep typing — at least {NERIS_SEARCH_MIN_Q} characters.</p>
                )}
                {nerisSearching && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Searching NERIS…</p>
                )}
                {nerisSearchError && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">{nerisSearchError}</p>
                )}
                {nerisResults && !nerisSearching && (
                  nerisResults.results.length === 0 ? (
                    /* An empty result is USUALLY not a search problem — it is a department
                       that has not completed NERIS onboarding. Verified 2026-08-03: the
                       registry holds 30,829 entities and "Maplewood"+NJ returns nothing,
                       while "Richland"+NJ returns FD34001022, so coverage is high but not
                       universal. Telling that chief to "enter the ID manually" is a dead
                       end: an unregistered department HAS no entity id, and no RMS can
                       substitute for registering with FSRI. Name both cases honestly. */
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                      <p className="font-semibold">No match in the NERIS registry.</p>
                      {/* NOT a hyperlink, deliberately. NERIS Terms of Use §5 requires UL
                          Research Institutes' prior written approval to "establish a hyperlink
                          to NERIS", and only with text/images they approve, in the location they
                          specify. We have approval to display the V1 badge; we have no link
                          approval. Plain text naming the site is not a hyperlink. Do not turn
                          this into an anchor without asking FSRI first. */}
                      <p>
                        If your department hasn&apos;t completed NERIS onboarding yet, it has to register
                        with FSRI first — no reporting software can do that step for you. Onboarding
                        starts from the NERIS site (neris.fsri.org).
                      </p>
                      <p>Already registered and you know your ID? Enter it manually below.</p>
                    </div>
                  ) : (
                    <>
                      {/* The count is ALWAYS shown, not only when truncated. The list
                          scrolls, and a chief who can't see that a 5th row exists may
                          pick the wrong one — searching "Maplewood" returns two
                          departments with the IDENTICAL name in different states
                          (verified live 2026-08-03). Knowing how many matched is part
                          of picking correctly. */}
                      <p className={`mt-2 text-xs ${nerisResults.truncated ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {nerisResults.truncated
                          ? `${nerisResults.total} departments match — showing the first ${nerisResults.results.length}. Add your state or more of the name.`
                          : `${nerisResults.total} ${nerisResults.total === 1 ? 'department matches' : 'departments match'}${nerisResults.results.length > 3 ? ' — scroll for all of them' : ''}.`}
                      </p>
                      <div id="neris-entity-listbox" role="listbox" aria-label="Matching NERIS departments"
                        className="relative mt-1 space-y-1 max-h-96 overflow-y-auto">
                        {nerisResults.results.map((r, idx) => {
                          // When two rows share a name, the name is NOT the discriminator —
                          // the location is. Promote it to the same weight so the thing that
                          // actually tells them apart isn't the quietest text in the row.
                          const dupName = nerisResults.results.filter((o) => o.name === r.name).length > 1;
                          const where = [r.city, r.state].filter(Boolean).join(', ');
                          const active = idx === nerisActiveIdx;
                          return (
                            <button key={r.neris_id} id={`neris-opt-${idx}`} type="button"
                              role="option" aria-selected={active}
                              onClick={() => pickNerisEntity(r)} onMouseEnter={() => setNerisActiveIdx(idx)}
                              disabled={nerisSaving}
                              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                                active
                                  ? 'border-sky-400 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40'
                                  : 'border-gray-200 dark:border-gray-700 hover:border-sky-300 dark:hover:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-950/30'
                              }`}>
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{r.name || r.neris_id}</span>
                                {r.department_type && (
                                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{r.department_type}</span>
                                )}
                              </div>
                              <div className={dupName
                                ? 'text-sm font-semibold text-sky-800 dark:text-sky-300 truncate'
                                : 'text-xs text-gray-500 dark:text-gray-400 truncate'}>
                                {where || r.address_line_1 || ''}
                              </div>
                              {(dupName || !where) && r.address_line_1 && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.address_line_1}</div>
                              )}
                              {!dupName && where && r.address_line_1 && (
                                <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{r.address_line_1}</div>
                              )}
                              {/* gray-500/400, not gray-400/500: measured on prod 2026-08-03 the
                                  lighter pair failed WCAG AA at 11px/400 in BOTH themes
                                  (2.60:1 light, 3.67:1 dark, AA needs 4.5:1). Same pair the
                                  address line already uses, which passes at 4.84 / 6.82. */}
                              <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400">{r.neris_id}</div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )
                )}
                <button type="button" onClick={() => { setNerisManual(true); setNerisResults(null); }}
                  className="mt-2 text-xs text-sky-700 dark:text-sky-400 hover:underline">
                  Enter the ID manually instead
                </button>
              </div>
            )}

            {nerisCheck && (
              <p className={`mt-2 text-xs ${nerisCheck.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {nerisCheck.ok
                  ? `Connected — NERIS knows ${nerisCheck.name || nerisCheck.entity}.`
                  : `Check failed: ${nerisCheck.reason || 'unknown'}. Verify the department and that it has enrolled the integration (below).`}
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
            <button type="button" onClick={toggleNerisEnabled} disabled={nerisSaving || nerisId === null}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50 ${
                nerisEnabled
                  ? 'bg-sky-700 text-white border-sky-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}>
              {nerisSaving ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              {nerisEnabled ? 'NERIS submission ENABLED — approved reports submit automatically' : 'NERIS submission OFF'}
            </button>
          </div>

          <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">One-time enrollment (in the NERIS portal)</label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              A department admin signs into the NERIS portal → <span className="font-semibold">Enrollments</span> →
              pastes OpenFirehouse's integration Client ID below → Enroll. That authorizes OpenFirehouse to
              submit for your department (revocable there at any time).
            </p>
            <div className="mt-2 flex items-stretch gap-2">
              <p className="flex-1 text-sm font-mono px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 break-all">
                {nerisInfo ? (nerisInfo.client_id || 'Not configured on this server yet') : '…'}
              </p>
              {nerisInfo?.client_id && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyTextToClipboard(nerisInfo.client_id);
                    setNerisIdCopied(ok ? 'ok' : 'fail');
                    setTimeout(() => setNerisIdCopied(false), 2500);
                  }}
                  className="flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  title="Copy the Client ID for the NERIS enrollment step"
                >
                  <Copy size={12} /> {nerisIdCopied === 'ok' ? 'Copied!' : nerisIdCopied === 'fail' ? 'Copy failed — select it manually' : 'Copy'}
                </button>
              )}
            </div>
            {nerisInfo && !nerisInfo.configured && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                Server credentials are not configured — submissions will hold (and retry) until they are.
              </p>
            )}
          </div>

          {/* Station & unit registration (SR) */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Register your stations &amp; units in NERIS</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Registering from here keeps OpenFirehouse the single writer of your national records
              (creating them directly in the NERIS portal causes duplicate or mismatched unit IDs).
              Stations register first; each rig then registers under its house with its minimum
              staffing. Registered units get clean national attribution on every submitted incident.
              A rig deleted locally is <span className="font-semibold">never</span> auto-deleted from NERIS.
            </p>
            {regError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{regError}</p>}
            {!nerisRegistry ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 size={14} className="animate-spin" /> Loading…</div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  {nerisRegistry.stations.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-gray-800 dark:text-gray-200 truncate">{s.name}</span>
                      {s.registered ? (
                        <>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300" title={s.neris_station_id}>{s.neris_station_id}</span>
                          <button type="button" disabled={regBusy === `station-${s.id}`} onClick={() => pushHouseUpdate(s.id)}
                            title="Re-send this station's current local details to NERIS (after an address or name change)"
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">
                            {regBusy === `station-${s.id}` ? '…' : 'Update in NERIS'}
                          </button>
                        </>
                      ) : s.missing_fields.length ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300" title={`Missing: ${s.missing_fields.join(', ')}`}>needs {s.missing_fields.join(', ')}</span>
                      ) : (
                        <button type="button" disabled={regBusy === `station-${s.id}`} onClick={() => registerHouse(s.id)}
                          className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-sky-200 dark:border-sky-900 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-40">
                          {regBusy === `station-${s.id}` ? 'Registering…' : 'Register station'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="space-y-1 pt-2 border-t border-gray-100 dark:border-gray-800">
                  {nerisRegistry.apparatus.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-gray-800 dark:text-gray-200 truncate">{a.designation} <span className="text-gray-500 dark:text-gray-400 text-xs">({a.type})</span></span>
                      {a.registered ? (
                        <>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300" title={a.neris_unit_id}>{a.neris_unit_id}</span>
                          <input type="number" min="0" step="1" placeholder="staffing"
                            value={unitStaffing[a.id] ?? ''}
                            onChange={(e) => setUnitStaffing((c) => ({ ...c, [a.id]: e.target.value }))}
                            aria-label={`Minimum staffing for ${a.designation}`}
                            className="w-16 px-2 py-0.5 text-[10px] border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 dark:text-gray-100" />
                          <button type="button" disabled={regBusy === `unit-${a.id}`} onClick={() => pushRigUpdate(a.id)}
                            title="Re-send this rig's current designation/type/staffing to NERIS (after a change)"
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">
                            {regBusy === `unit-${a.id}` ? '…' : 'Update in NERIS'}
                          </button>
                        </>
                      ) : a.needs_type ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300" title="Choose the NERIS unit type on the Apparatus page — the legacy label is ambiguous and is never guessed.">needs NERIS type</span>
                      ) : a.needs_station ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">register its station first</span>
                      ) : (
                        <>
                          <input type="number" min="0" step="1" placeholder="staffing"
                            value={unitStaffing[a.id] ?? ''}
                            onChange={(e) => setUnitStaffing((c) => ({ ...c, [a.id]: e.target.value }))}
                            aria-label={`Minimum staffing for ${a.designation}`}
                            className="w-20 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 dark:text-gray-100" />
                          <button type="button" disabled={regBusy === `unit-${a.id}`} onClick={() => registerRig(a.id)}
                            className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-sky-200 dark:border-sky-900 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-40">
                            {regBusy === `unit-${a.id}` ? 'Registering…' : 'Register unit'}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Assistant ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Bot size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">AI Assistant</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Anthropic API Key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={aiKeyVisible ? 'text' : 'password'}
                  value={aiKey}
                  onChange={(e) => { setAiKey(e.target.value); setAiKeySaved(false); setAiKeyError(null); }}
                  placeholder={aiKeySet ? '••••••••••••••••••••••••••••••••' : 'sk-ant-api03-...'}
                  className="w-full pl-9 pr-10 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => setAiKeyVisible((v) => !v)}
                  aria-label={aiKeyVisible ? 'Hide API key' : 'Show API key'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {aiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                type="button"
                disabled={aiKeySaving || !aiKey.trim()}
                onClick={async () => {
                  setAiKeySaving(true);
                  setAiKeyError(null);
                  try {
                    await api.post('/api/assistant/key', { key: aiKey.trim() });
                    setAiKeySaved(true);
                    setAiKeySet(true);
                    setAiKey('');
                    setTimeout(() => setAiKeySaved(false), 3000);
                  } catch (err) {
                    setAiKeyError(err.message || 'Failed to save key');
                  } finally {
                    setAiKeySaving(false);
                  }
                }}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  aiKeySaved
                    ? 'bg-emerald-600 text-white'
                    : 'bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white'
                }`}
              >
                {aiKeySaved ? <><CheckCircle2 size={14} className="inline mr-1" />Saved</> : aiKeySaving ? 'Saving…' : 'Save Key'}
              </button>
            </div>
            {aiKeyError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{aiKeyError}</p>}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              {aiKeySet
                ? 'A key is currently configured. Enter a new key above to replace it.'
                : 'No key configured. Get one at '}
              {!aiKeySet && (
                <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-red-600 dark:text-red-400 underline">console.anthropic.com</a>
              )}
              {!aiKeySet && '. The key is stored securely on the server — never sent to the browser.'}
            </p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Powers the AI Assistant chat widget — answers questions about OpenFirehouse features, NFIRS codes, LOSAP rules, and NJ certification requirements. Uses Claude Haiku (fast, low cost).
          </p>
        </div>
      </div>

      {/* bottom save bar */}
      <div className="flex justify-end gap-3 pb-4">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <RotateCcw size={14} /> Reset to Defaults
        </button>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
            saved ? 'bg-emerald-600 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {saved ? <><CheckCircle2 size={15} /> Saved!</> : <><Save size={15} /> Save Settings</>}
        </button>
      </div>

    </div>
  );
}
