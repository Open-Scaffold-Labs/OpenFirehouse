/**
 * AssetTesting.jsx — Phase 2.3 generic asset-test engine (rebuilt on /api/asset-tests,
 * migration 0084). Replaces SCBATracker.
 *
 *  - Due board: per (target × test type), server-computed ok/due/overdue/unknown/paused —
 *    'unknown' means a missing anchor is REPORTED, never guessed. Retirement clocks are
 *    alert-only (a human retires) with year-only approximations flagged.
 *  - Registry: SCBA / hose / ladder / PPE assets with a closed lifecycle status; the
 *    disposition door requires a reason (ReasonDialog) — a FAIL only ever SUGGESTS it.
 *  - Record-a-test: type → date → result → tester/company → pressure (hose) → note;
 *    recorded tests are FINAL (corrections = a new test).
 *  - Fill Stations tab: the existing /api/fill-stations feature, preserved read-only here.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Gauge, Plus, X, AlertTriangle, CheckCircle2, XCircle, History, Wind, Wrench,
} from 'lucide-react';
import { api, getStoredUser } from '../utils/api';
import { ROLES } from '../data/auth';
import ReasonDialog from './ReasonDialog';
import ScanModal from './ScanModal';
import LabelSheet from './LabelSheet';

const localToday = () => new Date().toLocaleDateString('en-CA');
const fmtDate = (v) => {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-');
  return m && d ? `${m}/${d}/${y}` : s;
};

const FAMILY_LABELS = { scba: 'SCBA', hose: 'Hose', ladder: 'Ladders', ppe: 'PPE', other: 'Other' };
const DUE_STYLES = {
  ok:       { text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500', label: 'Current' },
  due:      { text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', label: 'Due' },
  overdue:  { text: 'text-red-700 dark:text-red-300',     dot: 'bg-red-600',   label: 'Overdue' },
  unknown:  { text: 'text-gray-500 dark:text-gray-400',   dot: 'bg-gray-300',  label: 'No anchor date' },
  paused:   { text: 'text-gray-500 dark:text-gray-400',   dot: 'bg-gray-400',  label: 'Paused (OOS)' },
};
const STATUS_META = {
  in_service:     { label: 'In service',     cls: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' },
  out_of_service: { label: 'Out of service', cls: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' },
  condemned:      { label: 'Condemned',      cls: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' },
  retired:        { label: 'Retired',        cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
};
const RESULT_META = {
  PASS: { label: 'Pass', cls: 'text-green-600', icon: CheckCircle2 },
  FAIL: { label: 'Fail', cls: 'text-red-600', icon: XCircle },
  NOT_COMPLETED: { label: 'Not completed', cls: 'text-gray-500', icon: X },
  UNRECORDED: { label: 'Recorded (legacy — outcome not recorded)', cls: 'text-gray-500', icon: History },
};

export default function AssetTesting() {
  const user = getStoredUser();
  const level = ROLES[user?.role]?.level ?? 0;
  const isChief = level >= 3;
  const isMech = isChief || user?.fleet_maintenance === true;

  const [tab, setTab] = useState('due');
  const [due, setDue] = useState({ tests: [], retirement: [] });
  const [assets, setAssets] = useState([]);
  const [types, setTypes] = useState([]);
  const [fills, setFills] = useState([]);
  const [family, setFamily] = useState('');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [recordFor, setRecordFor] = useState(null);   // { target_kind, target_id, target_label, family } | 'new'
  const [assetDetail, setAssetDetail] = useState(null);
  const [showNewAsset, setShowNewAsset] = useState(false);
  const [banner, setBanner] = useState(null);
  const [showScan, setShowScan] = useState(false);
  const [showLabels, setShowLabels] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, a, t, f] = await Promise.all([
        api.get(`/api/asset-tests/due?today=${localToday()}`),
        api.get('/api/asset-tests/assets'),
        api.get('/api/asset-tests/types'),
        api.get('/api/fill-stations').catch(() => null),
      ]);
      setDue(d?.data || { tests: [], retirement: [] });
      setAssets(a?.data || []);
      setTypes(t?.data || []);
      const fr = f && (Array.isArray(f) ? f : f?.data);
      setFills(fr || []);
    } catch (e) { setPageError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const hot = due.tests.filter((x) => x.due_state === 'due' || x.due_state === 'overdue');
  const retHot = due.retirement.filter((x) => x.retire_state === 'approaching' || x.retire_state === 'overdue');
  const filteredTests = family ? due.tests.filter((x) => x.family === family) : due.tests;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Gauge className="w-6 h-6 text-blue-600" /> Asset Testing
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {hot.length > 0
              ? `${hot.length} test${hot.length > 1 ? 's' : ''} due${retHot.length ? ` · ${retHot.length} retirement clock${retHot.length > 1 ? 's' : ''} ticking` : ''}.`
              : retHot.length > 0 ? `${retHot.length} retirement clock${retHot.length > 1 ? 's' : ''} ticking.` : 'Everything tested and in date. NFPA would be proud.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowScan(true)}
            className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-gray-300 dark:border-gray-600">
            Scan
          </button>
          {isMech && (
            <>
              <button onClick={() => setShowLabels(true)}
                className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-gray-300 dark:border-gray-600">
                Labels
              </button>
              <button onClick={() => setShowNewAsset(true)}
                className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-gray-300 dark:border-gray-600 flex items-center gap-1">
                <Plus className="w-4 h-4" /> Asset
              </button>
              <button onClick={() => setRecordFor('new')}
                className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white flex items-center gap-1">
                <Plus className="w-4 h-4" /> Record test
              </button>
            </>
          )}
        </div>
      </div>

      {pageError && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{pageError}</span>
          <button onClick={() => setPageError(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
      {banner && (
        <div className={`rounded-xl px-4 py-3 text-sm flex items-center justify-between ${banner.fail ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' : 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300'}`}>
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 text-sm">
        {[['due', `Due board (${hot.length})`], ['assets', `Assets (${assets.length})`],
          ['retire', `Retirement (${retHot.length})`], ['fill', 'Fill stations']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-2 -mb-px border-b-2 ${tab === id ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'due' && (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            <button onClick={() => setFamily('')}
              className={`px-2.5 py-1.5 text-xs rounded-lg ${family === '' ? 'bg-blue-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>All</button>
            {Object.entries(FAMILY_LABELS).map(([k, l]) => (
              <button key={k} onClick={() => setFamily(k)}
                className={`px-2.5 py-1.5 text-xs rounded-lg ${family === k ? 'bg-blue-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>{l}</button>
            ))}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
            {loading ? <p className="px-4 py-6 text-sm text-gray-400">Loading…</p>
              : filteredTests.length === 0 ? <p className="px-4 py-6 text-sm text-gray-400">Nothing to test in this view. {isMech ? 'Add assets and the schedules follow.' : ''}</p>
                : [...filteredTests] // copy — .sort() in place would mutate React state (design-critique)
                  .sort((a, b) => ['overdue', 'due', 'unknown', 'ok', 'paused'].indexOf(a.due_state) - ['overdue', 'due', 'unknown', 'ok', 'paused'].indexOf(b.due_state))
                  .map((x) => {
                    const s = DUE_STYLES[x.due_state] || DUE_STYLES.unknown;
                    return (
                      <div key={`${x.test_type_id}-${x.target_kind}-${x.target_id}`} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                            {x.target_label} <span className="text-gray-500 font-normal">· {x.test_type_name}</span>
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {x.last_event_date ? `last ${fmtDate(x.last_event_date)}` : x.anchor_kind !== 'last_event' ? `anchored on ${x.anchor_kind.replace('_', ' ')}` : 'never tested'}
                            {x.due_date ? ` · next ${fmtDate(x.due_date)}` : x.due_state === 'unknown' ? ' · set a manufacture/in-service date or record the first test' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
                            <span className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}
                          </span>
                          {isMech && x.due_state !== 'paused' && (
                            <button onClick={() => setRecordFor(x)}
                              className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white">Record</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
          </div>
        </div>
      )}

      {tab === 'assets' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
          {assets.length === 0 ? <p className="px-4 py-6 text-sm text-gray-400">No tracked assets yet. {isMech ? 'Add the first cylinder, hose length, ladder, or set of gear.' : ''}</p>
            : assets.map((a) => {
              const sm = STATUS_META[a.status] || STATUS_META.in_service;
              return (
                <button key={a.id} onClick={() => setAssetDetail(a)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {a.name} <span className="text-gray-500 font-normal">· {FAMILY_LABELS[a.family]}{a.serial ? ` · ${a.serial}` : ''}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {a.manufacture_date ? `mfr ${fmtDate(a.manufacture_date)}` : a.manufacture_year ? `mfr ${a.manufacture_year} (year only — date not recorded)` : 'manufacture date not recorded'}
                      {a.assigned_member_name ? ` · ${a.assigned_member_name}` : ''}
                      {a.apparatus_designation ? ` · ${a.apparatus_designation}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${sm.cls}`}>{sm.label}</span>
                </button>
              );
            })}
        </div>
      )}

      {tab === 'retire' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
          {due.retirement.length === 0 ? <p className="px-4 py-6 text-sm text-gray-400">No retirement clocks configured.</p>
            : due.retirement.map((x) => {
              const s = x.retire_state === 'overdue' ? { cls: 'text-red-600', label: x.advisory ? 'Past advisory service life' : 'Past mandatory retirement' }
                : x.retire_state === 'approaching' ? { cls: 'text-amber-600', label: 'Approaching (≤6 months)' }
                  : x.retire_state === 'ok' ? { cls: 'text-green-600', label: 'OK' } : { cls: 'text-gray-500', label: 'Manufacture date not recorded' };
              return (
                <div key={x.asset_id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{x.name} <span className="text-gray-500 font-normal">· {FAMILY_LABELS[x.family]}</span></p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {x.retire_date ? `${x.advisory ? 'advisory ' : ''}retire ${fmtDate(x.retire_date)}` : 'clock cannot run without a date'}
                      {x.year_only_approximation ? ' · estimated from year only (conservative Jan 1)' : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${s.cls}`}>{s.label}</span>
                </div>
              );
            })}
          <p className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">Retirement clocks alert — they never retire anything. A person does, with a reason, from the asset's page.</p>
        </div>
      )}

      {tab === 'fill' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
          {fills.length === 0 ? <p className="px-4 py-6 text-sm text-gray-400">No fill stations on record.</p>
            : fills.map((f) => (
              <div key={f.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5"><Wind className="w-4 h-4 text-blue-500" /> {f.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {f.type || '—'} · bank {f.bankPressure ?? '—'} / {f.maxPressure ?? '—'} psi
                    {f.lastInspectionDate ? ` · inspected ${fmtDate(f.lastInspectionDate)}` : ''}
                  </p>
                </div>
                <span className="text-xs text-gray-500">{f.status || ''}</span>
              </div>
            ))}
        </div>
      )}

      {showNewAsset && (
        <NewAsset onClose={() => setShowNewAsset(false)}
          onDone={() => { setShowNewAsset(false); load(); }} />
      )}
      {recordFor && (
        <RecordTest
          preset={recordFor === 'new' ? null : recordFor}
          types={types} assets={assets}
          onClose={() => setRecordFor(null)}
          onDone={(ev) => {
            setRecordFor(null); load();
            setBanner(ev?.result === 'FAIL'
              ? { fail: true, text: 'Test recorded as FAILED. The asset stays in service until a person dispositions it — open the asset to place it out of service.' }
              : { fail: false, text: 'Test recorded.' });
          }}
        />
      )}
      {assetDetail && (
        <AssetDetail asset={assetDetail} isMech={isMech}
          onClose={() => setAssetDetail(null)}
          onChanged={() => { setAssetDetail(null); load(); }} />
      )}
      {showScan && (
        <ScanModal
          onClose={() => setShowScan(false)}
          onResolved={(res) => {
            setShowScan(false);
            if (res.kind === 'asset') {
              const a = assets.find((x) => x.id === res.record.id);
              if (a) { setAssetDetail(a); setTab('assets'); return; }
            }
            setBanner({
              fail: false,
              text: `Scanned: ${res.record.name} (${res.kind}). ${res.kind === 'item' || res.kind === 'location' ? 'Manage it from the Supplies tab of Asset & Inventory.' : res.kind === 'apparatus' ? 'Its checks live on the Apparatus Checks page.' : ''}`,
            });
          }}
        />
      )}
      {showLabels && (
        <LabelSheet kind="asset"
          records={assets.map((a) => ({ id: a.id, label: `${a.name}${a.serial ? ` (${a.serial})` : ''}` }))}
          onClose={() => setShowLabels(false)} />
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls = 'w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2';
const selectCls = 'w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2';

function NewAsset({ onClose, onDone }) {
  const [f, setF] = useState({ family: 'scba', name: '', serial: '', manufacture_date: '', in_service_date: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function save() {
    setBusy(true); setError(null);
    try {
      await api.post('/api/asset-tests/assets', {
        family: f.family, name: f.name.trim(),
        ...(f.serial.trim() ? { serial: f.serial.trim() } : {}),
        ...(f.manufacture_date ? { manufacture_date: f.manufacture_date } : {}),
        ...(f.in_service_date ? { in_service_date: f.in_service_date } : {}),
      });
      onDone();
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return (
    <Modal title="New tracked asset" onClose={onClose}>
      <div className="px-5 py-4 space-y-3">
        <select value={f.family} onChange={(e) => setF({ ...f, family: e.target.value })} className={selectCls}>
          {Object.entries(FAMILY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name (e.g., Cylinder 12, Attack line 3)" className={inputCls} />
        <input value={f.serial} onChange={(e) => setF({ ...f, serial: e.target.value })} placeholder="Serial (optional)" className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">Manufacture date</label>
            <input type="date" value={f.manufacture_date} onChange={(e) => setF({ ...f, manufacture_date: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500">In service</label>
            <input type="date" value={f.in_service_date} onChange={(e) => setF({ ...f, in_service_date: e.target.value })} className={inputCls} />
          </div>
        </div>
        <p className="text-xs text-gray-500">Retirement clocks and first-test anchors come from these dates — leave blank if unknown and the boards will say so honestly.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
          <button onClick={save} disabled={busy || !f.name.trim()} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">Add asset</button>
        </div>
      </div>
    </Modal>
  );
}

function RecordTest({ preset, types, assets, onClose, onDone }) {
  const [f, setF] = useState({
    test_type_id: preset ? String(preset.test_type_id) : '',
    target_id: preset ? String(preset.target_id) : '',
    event_date: localToday(),
    result: 'PASS', outside_company: '', pressure_used: '', note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const type = types.find((t) => String(t.id) === f.test_type_id);
  const targets = type
    ? (type.target === 'apparatus' ? null : assets.filter((a) => a.family === type.family && a.status !== 'condemned' && a.status !== 'retired'))
    : [];
  async function save() {
    setBusy(true); setError(null);
    try {
      const body = {
        test_type_id: Number(f.test_type_id),
        event_date: f.event_date,
        result: f.result,
        ...(type.target === 'apparatus' ? { apparatus_id: Number(f.target_id) } : { asset_id: Number(f.target_id) }),
        ...(f.outside_company.trim() ? { outside_company: f.outside_company.trim() } : {}),
        ...(f.pressure_used ? { pressure_used: Number(f.pressure_used) } : {}),
        ...(f.note.trim() ? { note: f.note.trim() } : {}),
      };
      const r = await api.post('/api/asset-tests/events', body);
      onDone(r?.data);
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return (
    <Modal title="Record a test" onClose={onClose}>
      <div className="px-5 py-4 space-y-3">
        <select value={f.test_type_id} onChange={(e) => setF({ ...f, test_type_id: e.target.value, target_id: '' })} className={selectCls} disabled={!!preset}>
          <option value="">Which test?</option>
          {types.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {type && type.target === 'asset' && (
          <select value={f.target_id} onChange={(e) => setF({ ...f, target_id: e.target.value })} className={selectCls} disabled={!!preset}>
            <option value="">Which {FAMILY_LABELS[type.family]} asset?</option>
            {targets.map((a) => <option key={a.id} value={a.id}>{a.name}{a.serial ? ` (${a.serial})` : ''}</option>)}
          </select>
        )}
        {type && type.target === 'apparatus' && preset && (
          <p className="text-sm text-gray-600 dark:text-gray-300">Apparatus: {preset.target_label}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">Test date</label>
            <input type="date" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Result</label>
            <select value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })} className={selectCls}>
              <option value="PASS">Pass</option><option value="FAIL">Fail</option>
              <option value="NOT_COMPLETED">Not completed</option>
            </select>
          </div>
        </div>
        <input value={f.outside_company} onChange={(e) => setF({ ...f, outside_company: e.target.value })}
          placeholder="Testing company (if outsourced)" className={inputCls} />
        {type && type.family === 'hose' && (
          <input value={f.pressure_used} onChange={(e) => setF({ ...f, pressure_used: e.target.value })}
            placeholder="Test pressure used, psi (goes on the hose record — NFPA 1962)" className={inputCls} />
        )}
        <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} placeholder="Notes (attach the test report from the record afterward)" className={inputCls} />
        {f.result === 'FAIL' && (
          <p className="text-xs rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-3 py-2">
            A failed test never changes the asset's status by itself — after recording, open the asset and place it out of service or condemn it, with a reason.
          </p>
        )}
        <p className="text-xs text-gray-500">A recorded test is final — a correction is a new test.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
          <button onClick={save} disabled={busy || !f.test_type_id || !f.target_id || !f.event_date}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">Record</button>
        </div>
      </div>
    </Modal>
  );
}

function AssetDetail({ asset, isMech, onClose, onChanged }) {
  const [events, setEvents] = useState([]);
  const [statusTo, setStatusTo] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get(`/api/asset-tests/events?asset_id=${asset.id}`)
      .then((r) => setEvents(r?.data || [])).catch((e) => setError(e.message));
  }, [asset.id]);
  const sm = STATUS_META[asset.status] || STATUS_META.in_service;
  return (
    <Modal title={asset.name} onClose={onClose}>
      <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {FAMILY_LABELS[asset.family]}{asset.serial ? ` · ${asset.serial}` : ''}
            {asset.manufacture_date ? ` · mfr ${fmtDate(asset.manufacture_date)}` : asset.manufacture_year ? ` · mfr ${asset.manufacture_year} (year only)` : ''}
          </p>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sm.cls}`}>{sm.label}</span>
        </div>
        {asset.status_reason && <p className="text-xs text-gray-500">Status reason: {asset.status_reason}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Test history</h3>
          {events.length === 0 ? <p className="text-sm text-gray-400">No tests on record.</p>
            : (
              <div className="space-y-1.5">
                {events.map((e) => {
                  const rm = RESULT_META[e.result] || RESULT_META.NOT_COMPLETED;
                  const Icon = rm.icon;
                  return (
                    <div key={e.id} className="flex items-start justify-between gap-3 text-sm border-b border-gray-100 dark:border-gray-700/50 pb-1.5">
                      <div>
                        <span className="text-gray-800 dark:text-gray-200">{e.test_type_name}</span>
                        <span className="text-xs text-gray-500 ml-2">{fmtDate(e.event_date)}{e.outside_company ? ` · ${e.outside_company}` : ''}{e.pressure_used ? ` · ${e.pressure_used} psi` : ''}</span>
                        {e.note && <p className="text-xs text-gray-500 mt-0.5">{e.note}</p>}
                      </div>
                      <span className={`shrink-0 flex items-center gap-1 text-xs font-medium ${rm.cls}`}>
                        <Icon className="w-3.5 h-3.5" /> {rm.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
        {isMech && (
          <div className="flex flex-wrap gap-2">
            {asset.status !== 'in_service' && asset.status !== 'retired' && asset.status !== 'condemned' && (
              <button onClick={() => setStatusTo('in_service')} className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white">Return to service</button>
            )}
            {asset.status === 'in_service' && (
              <button onClick={() => setStatusTo('out_of_service')} className="px-3 py-1.5 text-xs rounded-lg border border-amber-300 text-amber-700 dark:text-amber-400">Out of service…</button>
            )}
            {asset.status !== 'condemned' && asset.status !== 'retired' && (
              <>
                <button onClick={() => setStatusTo('condemned')} className="px-3 py-1.5 text-xs rounded-lg border border-red-300 text-red-600">Condemn…</button>
                <button onClick={() => setStatusTo('retired')} className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">Retire…</button>
              </>
            )}
          </div>
        )}
      </div>
      {statusTo && (
        <ReasonDialog
          title={statusTo === 'in_service' ? 'Return this asset to service?' : `Mark ${asset.name} ${STATUS_META[statusTo].label.toLowerCase()}?`}
          message={statusTo === 'in_service' ? 'Its test schedules resume.' : 'This is the human disposition a failed test suggests but never performs.'}
          requireReason={statusTo !== 'in_service'}
          destructive={statusTo !== 'in_service'}
          confirmLabel={STATUS_META[statusTo].label}
          onClose={() => setStatusTo(null)}
          onConfirm={async (reason) => {
            await api.post(`/api/asset-tests/assets/${asset.id}/status`,
              { status: statusTo, ...(reason ? { reason } : {}) });
            setStatusTo(null); onChanged();
          }}
        />
      )}
    </Modal>
  );
}
