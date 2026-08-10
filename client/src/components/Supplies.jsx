/**
 * Supplies.jsx — Phase 2.4 par-level inventory + requisitions (migration 0085).
 * Rendered as tabs of the Asset & Inventory page (view: 'supplies' | 'requisitions').
 *
 * Ledger-backed honesty: every quantity change is a person + verb + row; crew record
 * usage/counts (variance needs a reason); officers/mechanics restock, transfer, and
 * decide/fulfill requisitions — acceptance never moves stock, fulfillment records do.
 */
import { useState, useEffect, useCallback } from 'react';
import { Package, AlertTriangle, X, Plus, Send } from 'lucide-react';
import { api, getStoredUser } from '../utils/api';
import { ROLES } from '../data/auth';
import ScanModal from './ScanModal';
import LabelSheet from './LabelSheet';

const inputCls = 'w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2';
const selectCls = 'w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2';
const fmtDate = (v) => {
  if (!v) return '—';
  const s = String(v).slice(0, 10); const [y, m, d] = s.split('-');
  return m && d ? `${m}/${d}/${y}` : s;
};

export default function Supplies({ view }) {
  const user = getStoredUser();
  const level = ROLES[user?.role]?.level ?? 0;
  const isPriv = level >= 2 || user?.fleet_maintenance === true; // restock/transfer/decide
  const isMech = level >= 3 || user?.fleet_maintenance === true; // catalog/par config

  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [stock, setStock] = useState([]);
  const [alerts, setAlerts] = useState({ below_par: [], expiring: [] });
  const [reqs, setReqs] = useState([]);
  const [locFilter, setLocFilter] = useState('');
  const [modal, setModal] = useState(null); // {kind: 'use'|'count'|'restock'|'transfer'|'newItem'|'newLoc'|'par'|'newReq'|'fulfill', ...}
  const [pageError, setPageError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showScan, setShowScan] = useState(false);
  const [labelKind, setLabelKind] = useState(null); // 'item' | 'location'

  const load = useCallback(async () => {
    try {
      const [i, l, s, a, r] = await Promise.all([
        api.get('/api/inventory/items'),
        api.get('/api/inventory/locations'),
        api.get(`/api/inventory/stock${locFilter ? `?location_id=${locFilter}` : ''}`),
        api.get('/api/inventory/alerts'),
        api.get('/api/inventory/requisitions'),
      ]);
      setItems(i?.data || []); setLocations(l?.data || []); setStock(s?.data || []);
      setAlerts(a?.data || { below_par: [], expiring: [] }); setReqs(r?.data || []);
    } catch (e) { setPageError(e.message); }
  }, [locFilter]);

  useEffect(() => {
    load();
    const onVis = () => { if (!document.hidden) load(); };
    const iv = setInterval(onVis, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const act = (kind, extra = {}) => setModal({ kind, ...extra });
  const done = (msg) => { setModal(null); setNotice(msg || null); load(); };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      {pageError && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{pageError}</span><button onClick={() => setPageError(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
      {notice && (
        <div className="rounded-xl bg-green-50 dark:bg-green-950/40 px-4 py-3 text-sm text-green-700 dark:text-green-300 flex items-center justify-between">
          <span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}

      {view === 'supplies' && (
        <>
          {(alerts.below_par.length > 0 || alerts.expiring.length > 0) && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-amber-200 dark:border-amber-900">
              <div className="px-4 py-2.5 text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 border-b border-amber-100 dark:border-amber-900/50">
                <AlertTriangle className="w-4 h-4" /> Pick report &amp; expirations
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {alerts.below_par.map((x, i) => (
                  <div key={`bp-${i}`} className="px-4 py-2 text-sm flex justify-between">
                    <span className="text-gray-800 dark:text-gray-200">{x.item_name} <span className="text-gray-500">@ {x.location_name}</span></span>
                    <span className="text-amber-700 dark:text-amber-400">{Number(x.qty)} / min {Number(x.par_min)} — pick {Number(x.suggest)} {x.unit}</span>
                  </div>
                ))}
                {alerts.expiring.map((x) => (
                  <div key={`ex-${x.id}`} className="px-4 py-2 text-sm flex justify-between">
                    <span className="text-gray-800 dark:text-gray-200">{x.item_name} <span className="text-gray-500">lot {x.lot_number || '—'} @ {x.location_name}</span></span>
                    <span className={x.expired ? 'text-red-600 font-medium' : 'text-amber-700 dark:text-amber-400'}>
                      {x.expired ? 'EXPIRED' : 'expires'} {fmtDate(x.expiration_date)} · {Number(x.qty)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select value={locFilter} onChange={(e) => setLocFilter(e.target.value)}
              className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-2">
              <option value="">All locations</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={() => setShowScan(true)} className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-gray-300 dark:border-gray-600">Scan</button>
            <button onClick={() => act('use')} className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white">Log usage</button>
            <button onClick={() => act('count')} className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-gray-300 dark:border-gray-600">Count</button>
            {isPriv && <button onClick={() => act('restock')} className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-gray-300 dark:border-gray-600">Restock</button>}
            {isPriv && <button onClick={() => act('transfer')} className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-gray-300 dark:border-gray-600">Transfer</button>}
            {isMech && (
              <span className="ml-auto flex gap-2">
                <button onClick={() => setLabelKind('item')} className="px-2.5 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600">Item labels</button>
                <button onClick={() => setLabelKind('location')} className="px-2.5 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600">Location labels</button>
                <button onClick={() => act('newItem')} className="px-2.5 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Item</button>
                <button onClick={() => act('newLoc')} className="px-2.5 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Location</button>
              </span>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
            {stock.length === 0
              ? <p className="px-4 py-6 text-sm text-gray-400">No supplies on the books yet.{isMech ? ' Add items and locations, then restock — the ledger starts there.' : ''}</p>
              : stock.map((s) => (
                <div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {s.item_name} <span className="text-gray-500 font-normal">@ {s.location_name}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {s.par_min != null ? `par ${Number(s.par_min)}–${s.par_max != null ? Number(s.par_max) : '—'}` : 'no par set'}
                      {s.tracks_lots ? ' · lot-tracked' : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold ${s.par_min != null && Number(s.qty) < Number(s.par_min) ? 'text-amber-600' : 'text-gray-800 dark:text-gray-200'}`}>
                    {Number(s.qty)} {s.unit}
                    {isMech && <button onClick={() => act('par', { stock: s })} className="ml-2 text-xs text-blue-600 dark:text-blue-400 underline font-normal">par</button>}
                  </span>
                </div>
              ))}
          </div>
        </>
      )}

      {view === 'requisitions' && (
        <>
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Crew request; an officer decides; fulfillment is what actually moves stock.</p>
            <button onClick={() => act('newReq')} className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white flex items-center gap-1"><Send className="w-4 h-4" /> New request</button>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
            {reqs.length === 0
              ? <p className="px-4 py-6 text-sm text-gray-400">No requests. The shelves must be stocked.</p>
              : reqs.map((r) => <ReqRow key={r.id} r={r} user={user} isPriv={isPriv} onAct={act} onDone={done} />)}
          </div>
        </>
      )}

      {modal && (
        <SupplyModal modal={modal} items={items} locations={locations}
          onClose={() => setModal(null)} onDone={done} />
      )}
      {showScan && (
        <ScanModal
          onClose={() => setShowScan(false)}
          onResolved={(res) => {
            setShowScan(false);
            if (res.kind === 'item') {
              act('use', { prefill: { item_id: String(res.record.id) } });
            } else if (res.kind === 'location') {
              act('count', { prefill: { location_id: String(res.record.id) } });
            } else {
              setNotice(`Scanned: ${res.record.name} (${res.kind}) — ${res.kind === 'asset' ? 'it lives on the Asset Testing page.' : 'its checks live on the Apparatus Checks page.'}`);
            }
          }}
        />
      )}
      {labelKind && (
        <LabelSheet kind={labelKind}
          records={(labelKind === 'item' ? items : locations).map((r) => ({ id: r.id, label: r.name }))}
          onClose={() => setLabelKind(null)} />
      )}
    </div>
  );
}

function ReqRow({ r, user, isPriv, onAct, onDone }) {
  const [err, setErr] = useState(null);
  const S = {
    submitted: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    accepted: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
    fulfilled: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
    denied: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300',
    cancelled: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  };
  async function decide(decision) {
    try {
      await api.post(`/api/inventory/requisitions/${r.id}/decide`, { decision });
      onDone();
    } catch (e) { setErr(e.message); }
  }
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            #{r.id} → {r.to_location_name} <span className="text-gray-500 font-normal">· {r.requested_by_name} · {fmtDate(r.created_at)}</span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {(r.lines || []).map((l) => `${Number(l.qty_requested)} ${l.item_name}${l.qty_fulfilled != null ? ` (got ${Number(l.qty_fulfilled)})` : ''}`).join(' · ')}
            {r.note ? ` — ${r.note}` : ''}
            {r.decide_note ? ` — ${r.decide_note}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${S[r.status] || S.cancelled}`}>{r.status}</span>
          {r.status === 'submitted' && isPriv && (
            <>
              <button onClick={() => decide('accepted')} className="px-2.5 py-1.5 text-xs rounded-lg bg-blue-600 text-white">Accept</button>
              <button onClick={() => onAct('deny', { req: r })} className="px-2.5 py-1.5 text-xs rounded-lg border border-red-300 text-red-600">Deny…</button>
            </>
          )}
          {r.status === 'submitted' && r.requested_by_user_id === user?.id && (
            <button onClick={async () => { try { await api.post(`/api/inventory/requisitions/${r.id}/cancel`); onDone(); } catch (e) { setErr(e.message); } }}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
          )}
          {r.status === 'accepted' && isPriv && (
            <button onClick={() => onAct('fulfill', { req: r })} className="px-2.5 py-1.5 text-xs rounded-lg bg-green-600 text-white">Fulfill…</button>
          )}
        </div>
      </div>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  );
}

function SupplyModal({ modal, items, locations, onClose, onDone }) {
  const [f, setF] = useState(modal.prefill || {}); // scan resolution prefills item/location
  const [lots, setLots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const item = items.find((i) => String(i.id) === String(f.item_id));

  useEffect(() => {
    if (item?.tracks_lots && f.location_id) {
      api.get(`/api/inventory/lots?item_id=${item.id}&location_id=${f.location_id}`)
        .then((r) => setLots(r?.data || [])).catch(() => setLots([]));
    } else setLots([]);
  }, [item, f.location_id]);

  const T = {
    use: 'Log usage', count: 'Record a count', restock: 'Restock (vendor receipt)',
    transfer: 'Transfer', newItem: 'New supply item', newLoc: 'New location',
    par: 'Set par levels', newReq: 'New supply request', fulfill: `Fulfill request #${modal.req?.id}`,
    deny: `Deny request #${modal.req?.id}`,
  };

  async function go() {
    setBusy(true); setError(null);
    try {
      if (modal.kind === 'use') {
        await api.post('/api/inventory/usage', {
          item_id: Number(f.item_id), location_id: Number(f.location_id),
          ...(f.lot_id ? { lot_id: Number(f.lot_id) } : {}), qty: Number(f.qty),
          ...(f.incident_ref ? { incident_ref: f.incident_ref } : {}),
        });
        onDone('Usage recorded.');
      } else if (modal.kind === 'count') {
        await api.post('/api/inventory/count', {
          location_id: Number(f.location_id),
          lines: [{
            item_id: Number(f.item_id), ...(f.lot_id ? { lot_id: Number(f.lot_id) } : {}),
            counted_qty: Number(f.qty), ...(f.reason ? { reason: f.reason } : {}),
          }],
        });
        onDone('Count recorded — variance (if any) posted with your reason.');
      } else if (modal.kind === 'restock') {
        await api.post('/api/inventory/restock', {
          item_id: Number(f.item_id), location_id: Number(f.location_id), qty: Number(f.qty),
          ...(f.lot_number ? { lot_number: f.lot_number } : {}),
          ...(f.expiration_date ? { expiration_date: f.expiration_date } : {}),
        });
        onDone('Received into stock.');
      } else if (modal.kind === 'transfer') {
        await api.post('/api/inventory/transfer', {
          item_id: Number(f.item_id), from_location_id: Number(f.location_id),
          to_location_id: Number(f.to_location_id),
          ...(f.lot_id ? { from_lot_id: Number(f.lot_id) } : {}), qty: Number(f.qty),
        });
        onDone('Transferred.');
      } else if (modal.kind === 'newItem') {
        await api.post('/api/inventory/items', {
          name: f.name?.trim(), ...(f.category ? { category: f.category } : {}),
          ...(f.unit ? { unit: f.unit } : {}), tracks_lots: !!f.tracks_lots,
        });
        onDone('Item added.');
      } else if (modal.kind === 'newLoc') {
        await api.post('/api/inventory/locations', { name: f.name?.trim(), kind: f.kind || 'supply_room' });
        onDone('Location added.');
      } else if (modal.kind === 'par') {
        await api.post('/api/inventory/par', {
          item_id: modal.stock.item_id, location_id: modal.stock.location_id,
          par_min: f.par_min === '' || f.par_min == null ? null : Number(f.par_min),
          par_max: f.par_max === '' || f.par_max == null ? null : Number(f.par_max),
        });
        onDone('Par updated.');
      } else if (modal.kind === 'newReq') {
        await api.post('/api/inventory/requisitions', {
          to_location_id: Number(f.location_id), ...(f.note ? { note: f.note } : {}),
          lines: [{ item_id: Number(f.item_id), qty_requested: Number(f.qty) }],
        });
        onDone('Request submitted.');
      } else if (modal.kind === 'deny') {
        await api.post(`/api/inventory/requisitions/${modal.req.id}/decide`,
          { decision: 'denied', note: f.reason?.trim() });
        onDone('Denied — the requester sees your reason.');
      } else if (modal.kind === 'fulfill') {
        await api.post(`/api/inventory/requisitions/${modal.req.id}/fulfill`, {
          ...(f.location_id ? { from_location_id: Number(f.location_id) } : {}),
          lines: (modal.req.lines || []).map((l) => ({
            line_id: l.id, qty_fulfilled: Number(f[`line_${l.id}`] ?? 0),
          })),
        });
        onDone('Fulfilled — stock moved exactly as recorded.');
      }
    } catch (e) { setError(e.message); setBusy(false); }
  }

  const needsItem = ['use', 'count', 'restock', 'transfer', 'newReq'].includes(modal.kind);
  const needsQty = ['use', 'count', 'restock', 'transfer', 'newReq'].includes(modal.kind);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{T[modal.kind]}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {needsItem && (
            <select value={f.item_id || ''} onChange={(e) => setF({ ...f, item_id: e.target.value, lot_id: '' })} className={selectCls}>
              <option value="">Which item?</option>
              {items.filter((i) => i.active).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          )}
          {(needsItem || modal.kind === 'newReq') && (
            <select value={f.location_id || ''} onChange={(e) => setF({ ...f, location_id: e.target.value, lot_id: '' })} className={selectCls}>
              <option value="">{modal.kind === 'transfer' ? 'From location' : modal.kind === 'newReq' ? 'For which location?' : modal.kind === 'fulfill' ? 'From location' : 'Which location?'}</option>
              {locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {modal.kind === 'fulfill' && (
            <select value={f.location_id || ''} onChange={(e) => setF({ ...f, location_id: e.target.value })} className={selectCls}>
              <option value="">Fulfill from…</option>
              {locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {modal.kind === 'transfer' && (
            <select value={f.to_location_id || ''} onChange={(e) => setF({ ...f, to_location_id: e.target.value })} className={selectCls}>
              <option value="">To location</option>
              {locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {item?.tracks_lots && ['use', 'count', 'transfer'].includes(modal.kind) && (
            <select value={f.lot_id || ''} onChange={(e) => setF({ ...f, lot_id: e.target.value })} className={selectCls}>
              <option value="">Which lot? (required — never guessed)</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.lot_number || '(no lot #)'} · exp {fmtDate(l.expiration_date)} · {Number(l.qty)}</option>)}
            </select>
          )}
          {needsQty && (
            <input value={f.qty || ''} onChange={(e) => setF({ ...f, qty: e.target.value })}
              placeholder={modal.kind === 'count' ? 'Counted quantity' : 'Quantity'} className={inputCls} />
          )}
          {modal.kind === 'use' && (
            <input value={f.incident_ref || ''} onChange={(e) => setF({ ...f, incident_ref: e.target.value })}
              placeholder="Incident # (optional)" className={inputCls} />
          )}
          {modal.kind === 'count' && (
            <input value={f.reason || ''} onChange={(e) => setF({ ...f, reason: e.target.value })}
              placeholder="Reason (required if the count differs)" className={inputCls} />
          )}
          {modal.kind === 'restock' && (
            <div className="grid grid-cols-2 gap-2">
              <input value={f.lot_number || ''} onChange={(e) => setF({ ...f, lot_number: e.target.value })} placeholder="Lot #" className={inputCls} />
              <input type="date" value={f.expiration_date || ''} onChange={(e) => setF({ ...f, expiration_date: e.target.value })} className={inputCls} />
            </div>
          )}
          {modal.kind === 'newItem' && (
            <>
              <input value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Item name" className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                <input value={f.category || ''} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Category" className={inputCls} />
                <input value={f.unit || ''} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="Unit (each)" className={inputCls} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={!!f.tracks_lots} onChange={(e) => setF({ ...f, tracks_lots: e.target.checked })} />
                Track lots &amp; expiration dates (meds, dated goods)
              </label>
            </>
          )}
          {modal.kind === 'newLoc' && (
            <>
              <input value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Location name" className={inputCls} />
              <select value={f.kind || 'supply_room'} onChange={(e) => setF({ ...f, kind: e.target.value })} className={selectCls}>
                <option value="supply_room">Supply room</option><option value="station">Station</option>
                <option value="apparatus">Apparatus</option><option value="kit">Kit</option><option value="other">Other</option>
              </select>
            </>
          )}
          {modal.kind === 'par' && (
            <div className="grid grid-cols-2 gap-2">
              <input value={f.par_min ?? (modal.stock.par_min ?? '')} onChange={(e) => setF({ ...f, par_min: e.target.value })} placeholder="Min (alert)" className={inputCls} />
              <input value={f.par_max ?? (modal.stock.par_max ?? '')} onChange={(e) => setF({ ...f, par_max: e.target.value })} placeholder="Max (pick target)" className={inputCls} />
            </div>
          )}
          {modal.kind === 'newReq' && (
            <input value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (optional)" className={inputCls} />
          )}
          {modal.kind === 'deny' && (
            <input autoFocus value={f.reason || ''} onChange={(e) => setF({ ...f, reason: e.target.value })}
              placeholder="Reason (the requester sees this)" className={inputCls} />
          )}
          {modal.kind === 'fulfill' && (modal.req.lines || []).map((l) => (
            <div key={l.id} className="flex items-center gap-2">
              <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{l.item_name} (asked {Number(l.qty_requested)})</span>
              <input value={f[`line_${l.id}`] ?? ''} onChange={(e) => setF({ ...f, [`line_${l.id}`]: e.target.value })}
                placeholder="Qty" className="w-20 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1.5" />
            </div>
          ))}
          {modal.kind === 'fulfill' && <p className="text-xs text-gray-500">Partial quantities are fine — record what physically moves; that recording is what changes stock.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
            <button onClick={go} disabled={busy} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">
              {busy ? 'Working…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
