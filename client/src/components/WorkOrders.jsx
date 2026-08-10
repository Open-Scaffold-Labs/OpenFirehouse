/**
 * WorkOrders.jsx — Phase 2.2 defect→work-order surface (rebuilt on /api/work-orders +
 * /api/defects + /api/work-orders/pm, migration 0083). Replaces MaintenanceLog/Form.
 *
 *  - Defects: crew-flagged problems (first-class; from failed check items or manual);
 *    "Open work order" one-tap (deduped server-side — one live WO per defect).
 *  - Work orders: mechanic queue (status/priority sort, My-orders filter), detail with
 *    the crew↔mechanic notes thread, NUMERIC parts/labor/vendor costs, the closed
 *    transition map, and a resolve modal that REQUIRES the resolution note. Resolved/
 *    cancelled are FINAL — corrections open a new WO referencing the old.
 *  - PM board: whichever-first due list (server-computed) — a human opens the WO.
 *  - Technicians (chief): grant/revoke the fleet-maintenance capability per member.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Wrench, AlertTriangle, CheckCircle2, XCircle, Plus, X, Clock,
  MessageSquare, Trash2, ChevronRight, Gauge, UserCog, PackageOpen,
} from 'lucide-react';
import { api, getStoredUser } from '../utils/api';
import { ROLES } from '../data/auth';
import ReasonDialog from './ReasonDialog';

const localToday = () => new Date().toLocaleDateString('en-CA');
const fmtDate = (v) => {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-');
  return m && d ? `${m}/${d}/${y}` : s;
};
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const STATUS_META = {
  open:           { label: 'Open',           cls: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300' },
  in_progress:    { label: 'In progress',    cls: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' },
  awaiting_parts: { label: 'Awaiting parts', cls: 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300' },
  resolved:       { label: 'Resolved',       cls: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' },
  cancelled:      { label: 'Cancelled',      cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
};
const PRIORITY_META = {
  routine:   { label: 'Routine',   cls: 'text-gray-500' },
  urgent:    { label: 'Urgent',    cls: 'text-amber-600 dark:text-amber-400 font-medium' },
  emergency: { label: 'Emergency', cls: 'text-red-600 dark:text-red-400 font-semibold' },
};
const NEXT_STATUSES = {
  open: ['in_progress', 'awaiting_parts', 'resolved', 'cancelled'],
  in_progress: ['awaiting_parts', 'resolved', 'cancelled'],
  awaiting_parts: ['in_progress', 'resolved', 'cancelled'],
  resolved: [], cancelled: [],
};

// ─── Work-order detail ───────────────────────────────────────────────────────

function WoDetail({ id, isMechanic, isChief, onClose, onChanged, onOpenOther }) {
  const [wo, setWo] = useState(null);
  const [error, setError] = useState(null);
  const [noteBody, setNoteBody] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resNote, setResNote] = useState('');
  const [resMileage, setResMileage] = useState('');
  const [partForm, setPartForm] = useState(null); // {name, qty, unit_cost}

  const load = useCallback(() => {
    api.get(`/api/work-orders/${id}`).then((r) => setWo(r?.data || null)).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function transition(status) {
    if (status === 'resolved') { setResolving(true); return; }
    try { await api.post(`/api/work-orders/${id}/status`, { status }); load(); onChanged(); }
    catch (e) { setError(e.message); }
  }
  async function submitResolve() {
    try {
      const body = { status: 'resolved', resolution_note: resNote.trim() };
      if (wo.pm_schedule_id && resMileage) body.mileage = Number(resMileage);
      await api.post(`/api/work-orders/${id}/status`, body);
      setResolving(false); load(); onChanged();
    } catch (e) { setError(e.message); }
  }
  async function addNote() {
    if (!noteBody.trim()) return;
    try { await api.post(`/api/work-orders/${id}/notes`, { body: noteBody.trim() }); setNoteBody(''); load(); }
    catch (e) { setError(e.message); }
  }
  async function addPart() {
    try {
      await api.post(`/api/work-orders/${id}/parts`, {
        name: partForm.name.trim(),
        qty: Number(partForm.qty) || 1,
        unit_cost: Number(partForm.unit_cost) || 0,
      });
      setPartForm(null); load();
    } catch (e) { setError(e.message); }
  }
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function openRework() {
    try {
      const r = await api.post('/api/work-orders', {
        title: `${wo.title} — rework`,
        ...(wo.apparatus_id ? { apparatus_id: wo.apparatus_id } : { asset_label: wo.asset_label || 'equipment' }),
        supersedes_id: wo.id,
      });
      onChanged();
      onOpenOther(r?.data?.id); // jump straight into the rework order (no alert())
    } catch (e) { setError(e.message); }
  }

  if (!wo) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-sm text-gray-500">{error || 'Loading…'}</div>
      </div>
    );
  }
  const sm = STATUS_META[wo.status] || STATUS_META.open;
  const terminal = wo.status === 'resolved' || wo.status === 'cancelled';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 truncate">#{wo.id} · {wo.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {wo.apparatus_designation || wo.asset_label || '—'} · opened {fmtDate(wo.created_at)} by {wo.opened_by_name || '—'}
              {wo.assigned_to_name ? ` · assigned ${wo.assigned_to_name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${sm.cls}`}>{sm.label}</span>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[62vh] overflow-y-auto">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {wo.description && <p className="text-sm text-gray-700 dark:text-gray-300">{wo.description}</p>}
          {wo.defect_title && (
            <p className="text-xs text-gray-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> From defect: {wo.defect_title}</p>
          )}
          {wo.pm_task && (
            <p className="text-xs text-gray-500 flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> Preventive maintenance: {wo.pm_task}</p>
          )}
          {wo.supersedes_id && <p className="text-xs text-gray-500">Supersedes work order #{wo.supersedes_id}</p>}
          {terminal && wo.resolution_note && (
            <div className="rounded-lg bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-800 dark:text-green-300">
              {wo.resolution_note}
            </div>
          )}

          {/* Costs */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100 dark:border-gray-700/50">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Costs</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{money(wo.total_cost)}</span>
            </div>
            <div className="px-3 py-2 space-y-1 text-sm">
              {(wo.parts || []).map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="text-gray-700 dark:text-gray-300">{p.name} × {Number(p.qty)}</span>
                  <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    {money(Number(p.qty) * Number(p.unit_cost))}
                    {isMechanic && !terminal && (
                      <button onClick={async () => { try { await api.delete(`/api/work-orders/${id}/parts/${p.id}`); load(); } catch (e) { setError(e.message); } }}
                        className="text-gray-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </span>
                </div>
              ))}
              {wo.labor_hours != null && (
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Labor {Number(wo.labor_hours)}h{wo.labor_rate != null ? ` × ${money(wo.labor_rate)}` : ''}</span>
                  <span>{wo.labor_rate != null ? money(Number(wo.labor_hours) * Number(wo.labor_rate)) : '—'}</span>
                </div>
              )}
              {wo.vendor_cost != null && (
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Vendor{wo.vendor_name ? ` — ${wo.vendor_name}` : ''}</span><span>{money(wo.vendor_cost)}</span>
                </div>
              )}
              {wo.legacy_cost != null && (
                <div className="flex justify-between text-gray-500"><span>Legacy record cost</span><span>{money(wo.legacy_cost)}</span></div>
              )}
              {isMechanic && !terminal && (
                partForm ? (
                  <div className="flex gap-2 pt-1">
                    <input autoFocus value={partForm.name} onChange={(e) => setPartForm({ ...partForm, name: e.target.value })}
                      placeholder="Part" className="flex-1 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1" />
                    <input value={partForm.qty} onChange={(e) => setPartForm({ ...partForm, qty: e.target.value })}
                      placeholder="Qty" className="w-14 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1" />
                    <input value={partForm.unit_cost} onChange={(e) => setPartForm({ ...partForm, unit_cost: e.target.value })}
                      placeholder="$ each" className="w-20 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1" />
                    <button onClick={addPart} disabled={!partForm.name.trim()} className="px-2 py-1 text-xs rounded-md bg-blue-600 text-white disabled:opacity-40">Add</button>
                    <button onClick={() => setPartForm(null)} className="px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600">✕</button>
                  </div>
                ) : (
                  <button onClick={() => setPartForm({ name: '', qty: '1', unit_cost: '' })}
                    className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 pt-1"><Plus className="w-3.5 h-3.5" /> Add part</button>
                )
              )}
            </div>
          </div>

          {/* Notes thread */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> Notes ({(wo.notes || []).length})
            </h3>
            <div className="space-y-2">
              {(wo.notes || []).map((n) => (
                <div key={n.id} className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2">
                  <p className="text-sm text-gray-800 dark:text-gray-200">{n.body}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{n.author_name || 'Unknown'} · {new Date(n.created_at).toLocaleString()}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }}
                  placeholder="Add a note (crew and maintenance both see this)"
                  className="flex-1 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
                <button onClick={addNote} disabled={!noteBody.trim()}
                  className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">Post</button>
              </div>
            </div>
          </div>

          {/* History */}
          {(wo.history || []).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> History
              </h3>
              <div className="space-y-0.5">
                {wo.history.map((h, i) => (
                  <p key={i} className="text-xs text-gray-500">
                    {new Date(h.created_at).toLocaleString()} · {h.user_name || '—'} · {h.detail?.action === 'status'
                      ? `${h.detail.from} → ${h.detail.to}` : (h.detail?.action || h.action)}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
          {resolving ? (
            <div className="space-y-2">
              <textarea autoFocus value={resNote} onChange={(e) => setResNote(e.target.value)} rows={2}
                placeholder="Resolution note (required) — what was done"
                className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
              {wo.pm_schedule_id && (
                <input value={resMileage} onChange={(e) => setResMileage(e.target.value)} placeholder="Current mileage (optional — stamps the PM schedule)"
                  className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setResolving(false)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Back</button>
                <button onClick={submitResolve} disabled={resNote.trim().length < 3}
                  className="px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white disabled:opacity-40">Resolve</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {isMechanic && (NEXT_STATUSES[wo.status] || []).map((s) => (
                <button key={s} onClick={() => transition(s)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium ${s === 'resolved' ? 'bg-green-600 text-white' : s === 'cancelled' ? 'border border-red-300 text-red-600' : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                  {s === 'resolved' ? 'Resolve…' : `→ ${STATUS_META[s].label}`}
                </button>
              ))}
              {terminal && (
                <span className="text-xs text-gray-500">
                  Finalized — {isMechanic ? 'open a rework order for corrections.' : 'a finalized order can\'t be edited.'}
                </span>
              )}
              {terminal && isMechanic && wo.status === 'resolved' && (
                <button onClick={openRework} className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 flex items-center gap-1">
                  <ChevronRight className="w-3.5 h-3.5" /> Open rework order
                </button>
              )}
              {isChief && <button onClick={() => setConfirmDelete(true)} className="ml-auto text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Remove (reason required)</button>}
            </div>
          )}
        </div>
        {confirmDelete && (
          <ReasonDialog
            title="Remove this work order from the record?"
            message="The record is kept and the removal is audited — it just leaves the working views."
            requireReason confirmLabel="Remove"
            onClose={() => setConfirmDelete(false)}
            onConfirm={async (reason) => {
              await api.delete(`/api/work-orders/${id}`, { reason });
              onChanged(); onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function WorkOrders() {
  const user = getStoredUser();
  const level = ROLES[user?.role]?.level ?? 0;
  const isChief = level >= 3;
  const isMech = isChief || user?.fleet_maintenance === true;
  const isOfficer = level >= 2;

  const [tab, setTab] = useState('orders');
  const [wos, setWos] = useState([]);
  const [defects, setDefects] = useState([]);
  const [pmDue, setPmDue] = useState([]);
  const [apparatus, setApparatus] = useState([]);
  const [members, setMembers] = useState([]);
  const [mineOnly, setMineOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [showNewWo, setShowNewWo] = useState(false);
  const [showNewDefect, setShowNewDefect] = useState(false);
  const [showNewPm, setShowNewPm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      if (mineOnly) qs.set('mine', '1');
      const [w, d, p, a] = await Promise.all([
        api.get(`/api/work-orders?${qs}`),
        api.get('/api/defects'),
        api.get(`/api/work-orders/pm/due?today=${localToday()}`),
        api.get('/api/apparatus'),
      ]);
      setWos(w?.data || []);
      setDefects(d?.data || []);
      setPmDue(p?.data || []);
      setApparatus(Array.isArray(a) ? a : (a?.data || []));
      if (isChief) {
        // Real grant state per member (design-critique 🔴: never render neutral
        // toggles for a status the app isn't reading).
        const m = await api.get('/api/members/fleet-maintenance-grants');
        setMembers(m?.data || []);
      }
    } catch { /* transient */ }
    setLoading(false);
  }, [statusFilter, mineOnly, isChief]);

  useEffect(() => {
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const openDefects = defects.filter((d) => d.status === 'open' || d.status === 'in_work');
  const pmHot = pmDue.filter((p) => p.due_state === 'due' || p.due_state === 'overdue');
  const [pageError, setPageError] = useState(null);

  async function openWoFromDefect(d) {
    try {
      const r = await api.post('/api/work-orders', { title: d.title, defect_id: d.id });
      setDetailId(r?.data?.id || null);
      load();
    } catch (e) { setPageError(e.message); }
  }
  async function openWoFromPm(p) {
    try {
      const r = await api.post('/api/work-orders', {
        title: `${p.task} — ${p.apparatus_designation}`, apparatus_id: p.apparatus_id, pm_schedule_id: p.id,
      });
      setDetailId(r?.data?.id || null);
      load();
    } catch (e) { setPageError(e.message); }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {pageError && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{pageError}</span>
          <button onClick={() => setPageError(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-blue-600" /> Work Orders
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {openDefects.length > 0
              ? `${openDefects.length} open defect${openDefects.length > 1 ? 's' : ''}${pmHot.length ? ` · ${pmHot.length} PM due` : ''} — the shop earns its coffee today.`
              : pmHot.length > 0 ? `${pmHot.length} preventive job${pmHot.length > 1 ? 's' : ''} due.` : 'Fleet clean. Nothing on the board.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNewDefect(true)}
            className="px-3 py-2 text-sm rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> Flag defect
          </button>
          {(isOfficer || isMech) && (
            <button onClick={() => setShowNewWo(true)}
              className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white flex items-center gap-1">
              <Plus className="w-4 h-4" /> New order
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 text-sm">
        {[['orders', `Orders (${wos.filter((w) => w.status !== 'resolved' && w.status !== 'cancelled').length})`],
          ['defects', `Defects (${openDefects.length})`],
          ['pm', `Preventive (${pmHot.length} due)`],
          ...(isChief ? [['techs', 'Technicians']] : [])].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-2 -mb-px border-b-2 ${tab === id ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm">
              <option value="">All statuses</option>
              {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Assigned to me
            </label>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
            {loading ? <p className="px-4 py-6 text-sm text-gray-500">Loading…</p>
              : wos.length === 0 ? <p className="px-4 py-6 text-sm text-gray-500">No work orders match. The wrenches rest.</p>
                : wos.map((w) => {
                  const sm = STATUS_META[w.status] || STATUS_META.open;
                  const pm = PRIORITY_META[w.priority] || PRIORITY_META.routine;
                  return (
                    <button key={w.id} onClick={() => setDetailId(w.id)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          #{w.id} · {w.title}
                        </p>
                        <p className="text-xs text-gray-500">
                          {w.apparatus_designation || w.asset_label || '—'} · {fmtDate(w.created_at)}
                          {w.assigned_to_name ? ` · ${w.assigned_to_name}` : ''}
                          {Number(w.note_count) > 0 ? ` · ${w.note_count} note${w.note_count > 1 ? 's' : ''}` : ''}
                        </p>
                      </div>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs ${pm.cls}`}>{pm.label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sm.cls}`}>{sm.label}</span>
                      </span>
                    </button>
                  );
                })}
          </div>
        </div>
      )}

      {tab === 'defects' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
          {defects.length === 0 ? <p className="px-4 py-6 text-sm text-gray-500">Nothing flagged. The rigs are behaving.</p>
            : defects.map((d) => {
              const pm = PRIORITY_META[d.priority] || PRIORITY_META.routine;
              const live = d.status === 'open' || d.status === 'in_work';
              return (
                <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${live ? 'text-gray-800 dark:text-gray-200 font-medium' : 'text-gray-500'}`}>
                      {d.title} <span className="font-normal text-gray-500">· {d.apparatus_designation}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {d.source === 'check' ? `from a check (${d.item_key})` : 'manually flagged'} · {d.reported_by_name || '—'} · {fmtDate(d.created_at)}
                      {d.status === 'resolved' && ' · resolved'}
                      {d.status === 'cancelled' && ' · cancelled'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs ${pm.cls}`}>{pm.label}</span>
                    {live && (d.live_work_order_id
                      ? <button onClick={() => setDetailId(d.live_work_order_id)} className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600">WO #{d.live_work_order_id}</button>
                      : (isOfficer || isMech)
                        ? <button onClick={() => openWoFromDefect(d)} className="px-2.5 py-1 text-xs rounded-lg bg-blue-600 text-white">Open work order</button>
                        : <span className="text-xs text-amber-600">awaiting maintenance</span>)}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {tab === 'pm' && (
        <div className="space-y-3">
          {isMech && (
            <button onClick={() => setShowNewPm(true)} className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <Plus className="w-4 h-4" /> New PM schedule
            </button>
          )}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
            {pmDue.length === 0 ? <p className="px-4 py-6 text-sm text-gray-500">No preventive schedules yet.{isMech ? ' Set the first one — future-you says thanks.' : ''}</p>
              : pmDue.map((p) => {
                const s = p.due_state === 'overdue' ? { dot: 'bg-red-600', label: 'Overdue', text: 'text-red-600' }
                  : p.due_state === 'due' ? { dot: 'bg-amber-500', label: 'Due', text: 'text-amber-600' }
                    : p.due_state === 'ok' ? { dot: 'bg-green-500', label: 'OK', text: 'text-green-600' }
                      : { dot: 'bg-gray-300', label: 'No reading', text: 'text-gray-500' };
                return (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {p.apparatus_designation} <span className="text-gray-500 font-normal">· {p.task}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {[p.interval_days ? `${p.interval_days}d` : null, p.interval_miles ? `${p.interval_miles}mi` : null,
                          p.interval_hours ? `${p.interval_hours}h` : null].filter(Boolean).join(' / ')} · last {fmtDate(p.last_done_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
                        <span className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}
                      </span>
                      {(p.due_state === 'due' || p.due_state === 'overdue') && (isOfficer || isMech) && (
                        p.live_work_order_id
                          ? <button onClick={() => setDetailId(p.live_work_order_id)} className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600">WO #{p.live_work_order_id}</button>
                          : <button onClick={() => openWoFromPm(p)} className="px-2.5 py-1 text-xs rounded-lg bg-blue-600 text-white">Open work order</button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {tab === 'techs' && isChief && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1"><UserCog className="w-4 h-4" /> Fleet-maintenance grants</p>
            <p className="text-xs text-gray-500">A granted member can manage work orders, PM schedules, and place rigs in or out of service. Chiefs always can.</p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {members.length === 0
              ? <p className="px-4 py-6 text-sm text-gray-500">No members with linked logins yet.</p>
              : members.map((m) => (
                <div key={m.member_id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.rank || '—'}</p>
                  </div>
                  <Grant memberId={m.member_id} initial={m.granted === true} onDone={load} />
                </div>
              ))}
          </div>
        </div>
      )}

      {detailId && (
        <WoDetail id={detailId} isMechanic={isMech} isChief={isChief}
          onClose={() => setDetailId(null)} onChanged={load}
          onOpenOther={(otherId) => setDetailId(otherId || null)} />
      )}
      {showNewDefect && (
        <NewDefect apparatus={apparatus} onClose={() => setShowNewDefect(false)}
          onDone={() => { setShowNewDefect(false); setTab('defects'); load(); }} />
      )}
      {showNewWo && (
        <NewWo apparatus={apparatus} onClose={() => setShowNewWo(false)}
          onDone={(id) => { setShowNewWo(false); setDetailId(id); load(); }} />
      )}
      {showNewPm && (
        <NewPm apparatus={apparatus} onClose={() => setShowNewPm(false)}
          onDone={() => { setShowNewPm(false); load(); }} />
      )}
    </div>
  );
}

function Grant({ memberId, initial, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [granted, setGranted] = useState(initial === true); // REAL current state, server-read
  async function toggle(next) {
    setBusy(true);
    try {
      const r = await api.post(`/api/members/${memberId}/fleet-maintenance`, { granted: next });
      setGranted(r?.data?.fleet_maintenance === true);
      setErr(null);
      onDone();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-xs text-red-600 dark:text-red-400">{err}</span>}
      <button onClick={() => toggle(true)} disabled={busy}
        className={`px-2.5 py-1 text-xs rounded-lg ${granted === true ? 'bg-blue-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
        Granted
      </button>
      <button onClick={() => toggle(false)} disabled={busy}
        className={`px-2.5 py-1 text-xs rounded-lg ${granted === false ? 'bg-gray-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
        Revoked
      </button>
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

function NewDefect({ apparatus, onClose, onDone }) {
  const [f, setF] = useState({ apparatus_id: '', title: '', detail: '', priority: 'routine' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function save() {
    setBusy(true); setError(null);
    try {
      await api.post('/api/defects', {
        apparatus_id: Number(f.apparatus_id), title: f.title.trim(),
        ...(f.detail.trim() ? { detail: f.detail.trim() } : {}), priority: f.priority,
      });
      onDone();
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return (
    <Modal title="Flag a defect" onClose={onClose}>
      <div className="px-5 py-4 space-y-3">
        <select value={f.apparatus_id} onChange={(e) => setF({ ...f, apparatus_id: e.target.value })}
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
          <option value="">Which rig?</option>
          {apparatus.map((a) => <option key={a.id} value={a.id}>{a.designation}</option>)}
        </select>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What's wrong?"
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
        <textarea value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} rows={2} placeholder="Details (optional)"
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
        <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
          <option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option>
        </select>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
          <button onClick={save} disabled={busy || !f.apparatus_id || !f.title.trim()}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">Flag it</button>
        </div>
      </div>
    </Modal>
  );
}

function NewWo({ apparatus, onClose, onDone }) {
  const [f, setF] = useState({ apparatus_id: '', asset_label: '', title: '', description: '', priority: 'routine' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function save() {
    setBusy(true); setError(null);
    try {
      const r = await api.post('/api/work-orders', {
        title: f.title.trim(),
        ...(f.apparatus_id ? { apparatus_id: Number(f.apparatus_id) } : {}),
        ...(!f.apparatus_id && f.asset_label.trim() ? { asset_label: f.asset_label.trim() } : {}),
        ...(f.description.trim() ? { description: f.description.trim() } : {}),
        priority: f.priority,
      });
      onDone(r?.data?.id);
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return (
    <Modal title="New work order" onClose={onClose}>
      <div className="px-5 py-4 space-y-3">
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title"
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
        <select value={f.apparatus_id} onChange={(e) => setF({ ...f, apparatus_id: e.target.value })}
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
          <option value="">Not rig-specific (name the asset below)</option>
          {apparatus.map((a) => <option key={a.id} value={a.id}>{a.designation}</option>)}
        </select>
        {!f.apparatus_id && (
          <input value={f.asset_label} onChange={(e) => setF({ ...f, asset_label: e.target.value })} placeholder="Asset (e.g., station generator)"
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
        )}
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} placeholder="Description (optional)"
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
        <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
          <option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option>
        </select>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
          <button onClick={save} disabled={busy || !f.title.trim() || (!f.apparatus_id && !f.asset_label.trim())}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">Open order</button>
        </div>
      </div>
    </Modal>
  );
}

function NewPm({ apparatus, onClose, onDone }) {
  const [f, setF] = useState({ apparatus_id: '', task: '', interval_days: '', interval_miles: '', last_done_date: '', last_done_mileage: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function save() {
    setBusy(true); setError(null);
    try {
      await api.post('/api/work-orders/pm', {
        apparatus_id: Number(f.apparatus_id), task: f.task.trim(),
        ...(f.interval_days ? { interval_days: Number(f.interval_days) } : {}),
        ...(f.interval_miles ? { interval_miles: Number(f.interval_miles) } : {}),
        ...(f.last_done_date ? { last_done_date: f.last_done_date } : {}),
        ...(f.last_done_mileage ? { last_done_mileage: Number(f.last_done_mileage) } : {}),
      });
      onDone();
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return (
    <Modal title="New PM schedule" onClose={onClose}>
      <div className="px-5 py-4 space-y-3">
        <select value={f.apparatus_id} onChange={(e) => setF({ ...f, apparatus_id: e.target.value })}
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
          <option value="">Which rig?</option>
          {apparatus.map((a) => <option key={a.id} value={a.id}>{a.designation}</option>)}
        </select>
        <input value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })} placeholder="Task (e.g., Oil change)"
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
        <div className="grid grid-cols-2 gap-2">
          <input value={f.interval_days} onChange={(e) => setF({ ...f, interval_days: e.target.value })} placeholder="Every N days"
            className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
          <input value={f.interval_miles} onChange={(e) => setF({ ...f, interval_miles: e.target.value })} placeholder="Every N miles"
            className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
          <input type="date" value={f.last_done_date} onChange={(e) => setF({ ...f, last_done_date: e.target.value })}
            className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
          <input value={f.last_done_mileage} onChange={(e) => setF({ ...f, last_done_mileage: e.target.value })} placeholder="Mileage then"
            className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
        </div>
        <p className="text-xs text-gray-500">Whichever trigger comes first makes it due. Due jobs appear on the board — a person opens the work order; nothing is created automatically.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
          <button onClick={save} disabled={busy || !f.apparatus_id || !f.task.trim() || (!f.interval_days && !f.interval_miles)}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">Create</button>
        </div>
      </div>
    </Modal>
  );
}
