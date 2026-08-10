/**
 * ApparatusChecks.jsx — Phase 2.1 apparatus checks (rebuilt on /api/checks, migration 0082).
 *
 * Replaces InspectionChecklists + ChecklistRunner (the pre-hardening surface).
 *  - Due board: per template × rig, server-computed ok/due/overdue (GET /due).
 *  - Runner: per-item pass / fail / N/A + notes. The RESULT IS SERVER-DERIVED —
 *    this UI never sends a result_code; a failed item ⇒ DEFECTS_FOUND, period.
 *  - History: finalized records (no edit path — a completed check is FINAL).
 *  - Template builder (officers+): sections/items; editing items MINTS A NEW VERSION
 *    (completions in flight against the old version are refused server-side with
 *    STALE_TEMPLATE_VERSION and re-rendered here).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, CheckCircle2, AlertTriangle, XCircle, Play, History,
  Plus, Pencil, Trash2, X, Truck, MinusCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api, getStoredUser } from '../utils/api';
import { ROLES } from '../data/auth';
import ReasonDialog from './ReasonDialog';
import ScanModal from './ScanModal';

const localToday = () => new Date().toLocaleDateString('en-CA'); // client's LOCAL day (localDate doctrine)
const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
};

const DUE_STYLES = {
  ok:      { text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500', label: 'Current' },
  due:     { text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', label: 'Due' },
  overdue: { text: 'text-red-700 dark:text-red-300',     dot: 'bg-red-600',   label: 'Overdue' },
  oos:     { text: 'text-gray-500 dark:text-gray-400',   dot: 'bg-gray-400',  label: 'Paused (OOS)' },
};
const RESULT_STYLES = {
  PASS:          { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300', icon: CheckCircle2, label: 'Pass' },
  DEFECTS_FOUND: { bg: 'bg-red-100 dark:bg-red-950/50',     text: 'text-red-700 dark:text-red-300',     icon: AlertTriangle, label: 'Defects found' },
};
const OUTCOME_META = {
  pass: { label: 'Pass', icon: CheckCircle2, on: 'bg-green-600 text-white', off: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
  fail: { label: 'Fail', icon: XCircle,      on: 'bg-red-600 text-white',   off: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
  na:   { label: 'N/A',  icon: MinusCircle,  on: 'bg-gray-500 text-white',  off: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
};

// ─── Runner ──────────────────────────────────────────────────────────────────

function Runner({ template, rig, onClose, onDone }) {
  const items = Array.isArray(template.items) ? template.items : [];
  const [outcomes, setOutcomes] = useState({});
  const [notes, setNotes] = useState({});
  const [checkNotes, setCheckNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const unanswered = items.filter((it) => !outcomes[it.key]);
  const failed = items.filter((it) => outcomes[it.key] === 'fail');

  const sections = [];
  for (const it of items) {
    const name = it.section || 'General';
    let s = sections.find((x) => x.name === name);
    if (!s) { s = { name, items: [] }; sections.push(s); }
    s.items.push(it);
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = {
        template_id: template.id,
        template_version_id: template.version_id,
        apparatus_id: rig.id,
        check_date: localToday(),
        items: items.map((it) => ({
          item_key: it.key,
          outcome: outcomes[it.key],
          ...(notes[it.key] ? { note: notes[it.key] } : {}),
        })),
        ...(checkNotes.trim() ? { notes: checkNotes.trim() } : {}),
      };
      const r = await api.post('/api/checks/completions', body);
      onDone(r?.data || null);
    } catch (e) {
      if (e?.status === 409) {
        // STALE_TEMPLATE_VERSION — an officer published a new version mid-check.
        setError('This checklist was just updated by an officer. Close and reopen it to run the current version.');
      } else {
        setError(e.message || 'Could not save the check.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{template.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" /> {rig.designation} · {fmtDate(localToday())}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {sections.map((s) => (
            <div key={s.name}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">{s.name}</h3>
              <div className="space-y-2">
                {s.items.map((it) => (
                  <div key={it.key} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-800 dark:text-gray-200">{it.label}</span>
                      <div className="flex gap-1 shrink-0">
                        {Object.entries(OUTCOME_META).map(([key, m]) => {
                          const Icon = m.icon;
                          const on = outcomes[it.key] === key;
                          return (
                            <button key={key}
                              onClick={() => setOutcomes((o) => ({ ...o, [it.key]: key }))}
                              // ≥40px targets — this screen gets used on a bay tablet (design-critique)
                              className={`px-3 py-2 min-h-[40px] rounded-md text-sm font-medium flex items-center gap-1 ${on ? m.on : m.off}`}>
                              <Icon className="w-4 h-4" /> {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {outcomes[it.key] === 'fail' && (
                      <input
                        value={notes[it.key] || ''}
                        onChange={(e) => setNotes((n) => ({ ...n, [it.key]: e.target.value }))}
                        placeholder="What's wrong? (goes on the record)"
                        className="mt-2 w-full text-sm rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-2 py-1.5"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <textarea
            value={checkNotes}
            onChange={(e) => setCheckNotes(e.target.value)}
            placeholder="Overall notes (optional)"
            rows={2}
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2"
          />
        </div>
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
          {failed.length > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              {failed.length} failed item{failed.length > 1 ? 's' : ''} — this check will record as “Defects found.”
            </p>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
            <button
              onClick={submit}
              disabled={busy || unanswered.length > 0}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">
              {busy ? 'Saving…' : unanswered.length > 0 ? `${unanswered.length} item${unanswered.length > 1 ? 's' : ''} left` : 'Complete check'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Template builder (officers+) ────────────────────────────────────────────

function TemplateEditor({ template, apparatus, onClose, onSaved }) {
  const editing = !!template;
  const [name, setName] = useState(template?.name || '');
  const [frequency, setFrequency] = useState(template?.frequency || 'daily');
  const [apparatusId, setApparatusId] = useState(template?.apparatus_id || '');
  const [items, setItems] = useState(
    (template?.items || [{ key: '', section: 'General', label: '' }]).map((it) => ({ ...it })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function setItem(i, patch) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const cleaned = items
        .filter((it) => it.label && it.label.trim())
        .map((it) => ({
          ...(it.key ? { key: it.key } : {}),
          ...(it.section && it.section.trim() ? { section: it.section.trim() } : {}),
          label: it.label.trim(),
        }));
      if (!cleaned.length) { setError('Add at least one item.'); setBusy(false); return; }
      const body = {
        name: name.trim(),
        frequency,
        apparatus_id: apparatusId ? Number(apparatusId) : null,
        items: cleaned,
      };
      if (editing) await api.patch(`/api/checks/templates/${template.id}`, body);
      else await api.post('/api/checks/templates', body);
      onSaved();
    } catch (e) {
      setError(e.message || 'Could not save the template.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            {editing ? 'Edit checklist' : 'New checklist'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {editing && (
            <p className="text-xs rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-3 py-2">
              Changing items publishes a new version — anyone mid-check on the old version
              will be asked to reload. Completed checks keep the version they were run against.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Checklist name"
              className="sm:col-span-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}
              className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <select value={apparatusId} onChange={(e) => setApparatusId(e.target.value)}
              className="sm:col-span-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
              <option value="">Every apparatus (pick the rig when running)</option>
              {apparatus.map((a) => <option key={a.id} value={a.id}>{a.designation}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_2fr_auto] gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 px-1">
              <span>Compartment / section</span><span>Item</span><span />
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                <input value={it.section || ''} onChange={(e) => setItem(i, { section: e.target.value })}
                  placeholder="Cab" className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
                <input value={it.label || ''} onChange={(e) => setItem(i, { label: e.target.value })}
                  placeholder="Fuel ≥ 3/4 tank" className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
                <button onClick={() => setItems((arr) => arr.filter((_, idx) => idx !== i))}
                  className="p-2 rounded-lg text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button
              onClick={() => setItems((arr) => [...arr, { key: '', section: arr[arr.length - 1]?.section || '', label: '' }])}
              className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <Plus className="w-4 h-4" /> Add item
            </button>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
            <button onClick={save} disabled={busy || !name.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create checklist'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Completion detail ───────────────────────────────────────────────────────

function CompletionDetail({ id, canDelete, onClose, onDeleted }) {
  const [rec, setRec] = useState(null);
  const [error, setError] = useState(null);
  const [flagged, setFlagged] = useState({}); // item_key → defect id (one-tap 2.2 hook)

  useEffect(() => {
    api.get(`/api/checks/completions/${id}`)
      .then((r) => setRec(r?.data || null))
      .catch((e) => setError(e.message));
  }, [id]);

  async function flagDefect(it) {
    try {
      const r = await api.post('/api/defects', {
        apparatus_id: rec.apparatus_id,
        title: it.label,
        item_key: it.item_key,
        check_id: rec.id,
        ...(it.note ? { detail: it.note } : {}),
      });
      setFlagged((f) => ({ ...f, [it.item_key]: r?.data?.id }));
    } catch (e) { setError(e.message); }
  }

  const [confirmDelete, setConfirmDelete] = useState(false);

  const rs = rec ? (RESULT_STYLES[rec.result_code] || RESULT_STYLES.PASS) : null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Check record</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
        </div>
        {error && <p className="px-5 py-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {rec && (
          <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{rec.template_name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {rec.apparatus_name} · {fmtDate(rec.check_date)} · {rec.completed_by_name}
                </p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${rs.bg} ${rs.text}`}>
                <rs.icon className="w-3.5 h-3.5" /> {rs.label}
              </span>
            </div>
            <div className="space-y-1.5">
              {(rec.items || []).map((it) => {
                const m = OUTCOME_META[it.outcome] || OUTCOME_META.na;
                const Icon = m.icon;
                return (
                  <div key={it.id} className="flex items-start justify-between gap-3 text-sm border-b border-gray-100 dark:border-gray-700/50 pb-1.5">
                    <div>
                      <span className="text-gray-800 dark:text-gray-200">{it.label}</span>
                      {it.section && <span className="text-xs text-gray-500 ml-2">{it.section}</span>}
                      {it.note && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{it.note}</p>}
                      {it.outcome === 'fail' && rec.apparatus_id && (
                        flagged[it.item_key]
                          ? <p className="text-xs text-amber-600 mt-0.5">On the defect board (#{flagged[it.item_key]}) — maintenance sees it.</p>
                          : <button onClick={() => flagDefect(it)}
                              className="text-xs text-amber-600 dark:text-amber-400 underline mt-0.5">
                              Flag as defect → work orders
                            </button>
                      )}
                    </div>
                    <span className={`shrink-0 flex items-center gap-1 text-xs font-medium ${it.outcome === 'fail' ? 'text-red-600' : it.outcome === 'pass' ? 'text-green-600' : 'text-gray-500'}`}>
                      <Icon className="w-3.5 h-3.5" /> {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {rec.notes && <p className="text-sm text-gray-600 dark:text-gray-300">{rec.notes}</p>}
            <p className="text-xs text-gray-500">
              Completed checks are final records. {canDelete ? 'A chief can remove one from the record with a reason (audited).' : ''}
            </p>
            {canDelete && (
              <button onClick={() => setConfirmDelete(true)} className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                <Trash2 className="w-4 h-4" /> Remove from record (reason required)
              </button>
            )}
          </div>
        )}
        {confirmDelete && (
          <ReasonDialog
            title="Remove this check from the record?"
            message="The record is kept and the removal is audited — it just leaves the working views."
            requireReason confirmLabel="Remove"
            onClose={() => setConfirmDelete(false)}
            onConfirm={async (reason) => {
              await api.delete(`/api/checks/completions/${id}`, { reason });
              onDeleted();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ApparatusChecks() {
  const user = getStoredUser();
  const level = ROLES[user?.role]?.level ?? 0;
  const isOfficer = level >= 2;
  const isChief = level >= 3;

  const [templates, setTemplates] = useState([]);
  const [due, setDue] = useState([]);
  const [history, setHistory] = useState([]);
  const [apparatus, setApparatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runner, setRunner] = useState(null);          // { template, rig }
  const [editorTpl, setEditorTpl] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [detailId, setDetailId] = useState(null);
  const [banner, setBanner] = useState(null);
  const [showHistory, setShowHistory] = useState(true);

  const load = useCallback(async () => {
    try {
      const [t, d, c, a] = await Promise.all([
        api.get('/api/checks/templates'),
        api.get(`/api/checks/due?today=${localToday()}`),
        api.get('/api/checks/completions?limit=50'),
        api.get('/api/apparatus'),
      ]);
      setTemplates(t?.data || []);
      setDue(d?.data || []);
      setHistory(c?.data || []);
      setApparatus(Array.isArray(a) ? a : (a?.data || []));
    } catch { /* transient — the poll retries */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  function startCheck(dueRow) {
    const tpl = templates.find((t) => t.id === dueRow.template_id);
    if (!tpl) return;
    setRunner({
      template: { ...tpl, version_id: tpl.version_id, items: tpl.items },
      rig: { id: dueRow.apparatus_id, designation: dueRow.designation },
    });
  }

  const [retireTpl, setRetireTpl] = useState(null);
  const [showScan, setShowScan] = useState(false);

  const overdueCount = due.filter((d) => d.due_state === 'overdue').length;
  const dueCount = due.filter((d) => d.due_state === 'due').length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-blue-600" /> Apparatus Checks
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {overdueCount > 0
              ? `${overdueCount} overdue — the rigs are judging you.`
              : dueCount > 0
                ? `${dueCount} due today.`
                : 'All rigs current. The morning coffee is earned.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowScan(true)}
            className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-gray-300 dark:border-gray-600">
            Scan rig
          </button>
          {isOfficer && (
            <button onClick={() => setEditorTpl(null)}
              className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white flex items-center gap-1">
              <Plus className="w-4 h-4" /> New checklist
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div className={`rounded-xl px-4 py-3 text-sm flex items-center justify-between ${RESULT_STYLES[banner.result_code]?.bg} ${RESULT_STYLES[banner.result_code]?.text}`}>
          <span>
            {banner._msg
              ? banner._msg
              : banner.result_code === 'PASS'
                ? `Check saved — ${banner.apparatus_name} is squared away.`
                : `Check saved with ${banner.failed_count} defect${banner.failed_count > 1 ? 's' : ''} on ${banner.apparatus_name} — flag it to the officer.`}
          </span>
          <button onClick={() => setBanner(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Due board */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-sm text-gray-700 dark:text-gray-200">
          Due board
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">Loading…</p>
        ) : due.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">
            No checklists yet. {isOfficer ? 'Create one — the rigs won’t check themselves.' : 'Ask an officer to set up the first checklist.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {due.map((d) => {
              const s = DUE_STYLES[d.due_state] || DUE_STYLES.ok;
              return (
                <div key={`${d.template_id}-${d.apparatus_id}`} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {d.designation} <span className="text-gray-500 font-normal">· {d.name}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {d.frequency} · last {d.last_check_date ? fmtDate(d.last_check_date) : 'never'}
                      {d.last_result === 'DEFECTS_FOUND' && (
                        <span className="text-red-600 dark:text-red-400"> · defects last time</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
                      <span className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}
                    </span>
                    <button onClick={() => startCheck(d)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white flex items-center gap-1">
                      <Play className="w-3.5 h-3.5" /> Run
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Templates (officer management) */}
      {isOfficer && templates.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-sm text-gray-700 dark:text-gray-200">
            Checklists (v = published version)
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {templates.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {t.name} <span className="text-xs text-gray-500">v{t.version || 1}</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t.frequency} · {t.apparatus_designation || 'every apparatus'} · {(t.items || []).length} items
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditorTpl(t)} className="p-2 rounded-lg text-gray-500 hover:text-blue-600" aria-label="Edit checklist"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setRetireTpl(t)} className="p-2 rounded-lg text-gray-500 hover:text-red-600" aria-label="Retire checklist"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <button onClick={() => setShowHistory((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between font-semibold text-sm text-gray-700 dark:text-gray-200">
          <span className="flex items-center gap-2"><History className="w-4 h-4" /> Recent checks</span>
          {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showHistory && (
          history.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 border-t border-gray-100 dark:border-gray-700/50">
              No checks on the record yet. The first one sets the tone.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50 border-t border-gray-100 dark:border-gray-700/50">
              {history.map((c) => {
                const rs = RESULT_STYLES[c.result_code] || RESULT_STYLES.PASS;
                const Icon = rs.icon;
                return (
                  <button key={c.id} onClick={() => setDetailId(c.id)}
                    className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {c.apparatus_name} <span className="text-gray-500">· {c.template_name}</span>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {fmtDate(c.check_date)} · {c.completed_by_name}
                      </p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${rs.bg} ${rs.text}`}>
                      <Icon className="w-3 h-3" /> {rs.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {runner && (
        <Runner
          template={runner.template}
          rig={runner.rig}
          onClose={() => setRunner(null)}
          onDone={(rec) => { setRunner(null); setBanner(rec); load(); }}
        />
      )}
      {editorTpl !== undefined && (
        <TemplateEditor
          template={editorTpl}
          apparatus={apparatus}
          onClose={() => setEditorTpl(undefined)}
          onSaved={() => { setEditorTpl(undefined); load(); }}
        />
      )}
      {detailId && (
        <CompletionDetail
          id={detailId}
          canDelete={isChief}
          onClose={() => setDetailId(null)}
          onDeleted={() => { setDetailId(null); load(); }}
        />
      )}
      {showScan && (
        <ScanModal
          onClose={() => setShowScan(false)}
          onResolved={(res) => {
            setShowScan(false);
            if (res.kind === 'apparatus') {
              // Jump straight into this rig's most urgent check, if one is waiting.
              const row = due.find((d) => d.apparatus_id === res.record.id && (d.due_state === 'overdue' || d.due_state === 'due'))
                || due.find((d) => d.apparatus_id === res.record.id && d.due_state === 'ok');
              if (row && row.due_state !== 'ok') { startCheck(row); return; }
              setBanner({ result_code: 'PASS', apparatus_name: res.record.name, failed_count: 0,
                _msg: row ? `${res.record.name} is current — nothing due.` : `${res.record.name} has no checklists on the board.` });
              return;
            }
            setBanner({ result_code: 'PASS', apparatus_name: res.record.name, failed_count: 0,
              _msg: `Scanned: ${res.record.name} (${res.kind}) — it lives on the ${res.kind === 'asset' ? 'Asset Testing' : 'Asset & Inventory'} page.` });
          }}
        />
      )}
      {retireTpl && (
        <ReasonDialog
          title={`Retire “${retireTpl.name}”?`}
          message="Completed checks stay on the record; the checklist leaves the due board."
          confirmLabel="Retire"
          onClose={() => setRetireTpl(null)}
          onConfirm={async () => {
            await api.delete(`/api/checks/templates/${retireTpl.id}`);
            setRetireTpl(null); load();
          }}
        />
      )}
    </div>
  );
}
