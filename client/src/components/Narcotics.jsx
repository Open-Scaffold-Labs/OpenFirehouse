/**
 * Narcotics.jsx — controlled-substance chain of custody (Phase 2.7, migration 0087).
 * Spec: docs/PHASE2-NARCOTICS-SPEC-2026-07-26.md · 21 CFR §1304.27. DALE-GATED.
 *
 * Doctrine surfaced in UI terms:
 *  · Every event re-proves identity with the actor's CS PIN; waste/expire/break/destroy
 *    add a WITNESS — a different person, their PIN, and a drawn signature.
 *  · The shift count needs two different people, both PINs, second signs.
 *  · Nothing here edits history: corrections are new ledger entries.
 *  · ONLINE-ONLY by design (no offline narcotics authoring — deliberate ceiling).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Syringe, Package, AlertTriangle, ClipboardCheck, Plus, X,
  KeyRound, History, Bell,
} from 'lucide-react';
import { api } from '../utils/api';
import SignaturePad from './prevention/SignaturePad';

const TABS = [
  { id: 'vaults', label: 'Vault Board', icon: ShieldCheck },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'activity', label: 'Activity', icon: History },
  { id: 'issues', label: 'Discrepancies & Notices', icon: AlertTriangle },
  { id: 'catalog', label: 'Catalog', icon: Plus, managerOnly: true },
];

export default function Narcotics({ currentUser }) {
  const [tab, setTab] = useState('vaults');
  const [enrolled, setEnrolled] = useState(null);
  const [locations, setLocations] = useState([]);
  const [items, setItems] = useState([]);
  const [substances, setSubstances] = useState([]);
  const [members, setMembers] = useState([]);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [counts, setCounts] = useState([]);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // {kind:'count',loc} | {kind:'event',...} | {kind:'acquire'} | {kind:'history',item}
  const isChief = (currentUser?.roleLevel ?? 0) >= 3 || ['chief', 'battalion_chief', 'deputy_chief', 'admin'].includes(currentUser?.role);
  // CS-manager = chief-level OR the capability grant (server enforces regardless).
  const isManager = isChief || currentUser?.cs_manager === true;

  const load = useCallback(async () => {
    try {
      const [pin, locs, its, subs, mem, disc, notif, cnts] = await Promise.all([
        api.get('/api/cs/pin/status'),
        api.get('/api/cs/locations'),
        api.get('/api/cs/items?status=in_stock'),
        api.get('/api/cs/substances'),
        api.get('/api/members').catch(() => ({ data: [] })),
        api.get('/api/cs/discrepancies'),
        api.get('/api/cs/notifications'),
        api.get('/api/cs/counts'),
      ]);
      setEnrolled(pin?.data?.enrolled === true);
      setLocations(locs?.data || []);
      setItems(its?.data || []);
      setSubstances(subs?.data || []);
      setMembers(Array.isArray(mem?.data) ? mem.data : (Array.isArray(mem) ? mem : []));
      setDiscrepancies(disc?.data || []);
      setNotifications(notif?.data || []);
      setCounts(cnts?.data || []);
      setError(null);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openDisc = discrepancies.filter((d) => d.status === 'open');
  const openNotif = notifications.filter((n) => !n.acknowledged_at);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Syringe className="w-6 h-6 text-red-600" /> Controlled Substances
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Chain of custody per 21 CFR §1304.27 — every movement signed, nothing rewritten.
          </p>
        </div>
        <div className="flex gap-2">
          {isChief && (
            <button onClick={() => setModal({ kind: 'acquire' })}
              className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white flex items-center gap-1">
              <Plus className="w-4 h-4" /> Receive stock
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3" role="alert">{error}</p>}

      {enrolled === false && <PinEnroll onDone={load} />}

      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {TABS.filter((t) => !t.managerOnly || isManager).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 min-h-[40px] text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
            {t.id === 'issues' && (openDisc.length + openNotif.length) > 0 && (
              <span className="ml-1 px-1.5 rounded-full bg-red-600 text-white text-xs">{openDisc.length + openNotif.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'vaults' && (
        <div className="grid md:grid-cols-2 gap-4">
          {locations.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 md:col-span-2">
              Every vial gets a home before it gets logged.{' '}
              {isManager
                ? <>Set up your vaults and rig boxes in the <button onClick={() => setTab('catalog')} className="underline text-red-600 dark:text-red-400">Catalog</button> tab, then receive stock into them.</>
                : 'A chief or CS manager sets up the vaults and rig boxes; your counts and events land here once they do.'}
            </p>
          )}
          {locations.map((l) => (
            <div key={l.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{l.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {l.kind}{l.apparatus_designation ? ` · ${l.apparatus_designation}` : ''}
                    {l.seal_mode !== 'none' && l.current_seals ? ` · seal ${l.current_seals}` : ''}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  l.par_level && l.on_hand < l.par_level
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                  {l.on_hand} on hand{l.par_level ? ` / par ${l.par_level}` : ''}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setModal({ kind: 'count', loc: l })}
                  className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-red-600 text-white flex items-center gap-1">
                  <ClipboardCheck className="w-4 h-4" /> Shift count
                </button>
              </div>
              {counts.filter((c) => c.location_id === l.id).slice(0, 1).map((c) => (
                <p key={c.id} className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Last count: {new Date(c.counted_at).toLocaleString()} · {c.kind.replace('_', '-')} ·{' '}
                  {c.clean
                    ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">clean</span>
                    : <span className="text-red-600 dark:text-red-400 font-semibold">DISCREPANCY</span>}
                  {' '}· {c.verifier1_name} + {c.verifier2_name}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'inventory' && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2">Substance</th><th className="px-3 py-2">Control #</th>
                <th className="px-3 py-2">Lot / Exp</th><th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Remaining</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                    {i.substance_name} <span className="text-xs text-gray-500">Sch {i.schedule} · {i.finished_form}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">{i.control_no}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                    {i.lot_no || '—'}{i.expiration ? ` / ${String(i.expiration).slice(0, 10)}` : ''}
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{i.location_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{Number(i.remaining_units)} {i.unit_label}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => setModal({ kind: 'event', event: 'administer', item: i })}
                        className="px-2 py-1.5 min-h-[36px] text-xs rounded-lg bg-blue-600 text-white">Administer</button>
                      <button onClick={() => setModal({ kind: 'event', event: 'waste', item: i })}
                        className="px-2 py-1.5 min-h-[36px] text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Waste</button>
                      <button onClick={() => setModal({ kind: 'history', item: i })}
                        className="px-2 py-1.5 min-h-[36px] text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">History</button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                  Nothing in stock. Every vial your department receives gets logged here at intake.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'activity' && <ActivityFeed />}

      {tab === 'catalog' && isManager && (
        <CatalogTab substances={substances} locations={locations} onChanged={load} />
      )}

      {tab === 'issues' && (
        <div className="space-y-4">
          <section>
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-600" /> Discrepancies
            </h2>
            {discrepancies.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">None on record. The count keeps it that way.</p>}
            {discrepancies.map((d) => (
              <DiscrepancyRow key={d.id} d={d} isChief={isChief} onResolved={load} />
            ))}
          </section>
          <section>
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-amber-600" /> 72-hour notifications (§1304.27(c))
            </h2>
            {notifications.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No hospital-restock notifications pending.</p>}
            {notifications.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 mb-2">
                <div className="text-sm text-gray-800 dark:text-gray-200">
                  Restock from <b>{n.counterpart_name || 'hospital'}</b> · {new Date(n.occurred_at).toLocaleString()}
                  <span className={`ml-2 text-xs ${!n.acknowledged_at && new Date(n.due_by) < new Date() ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                    {n.acknowledged_at ? `acknowledged ${new Date(n.acknowledged_at).toLocaleDateString()}`
                      : `notify registered location by ${new Date(n.due_by).toLocaleString()}`}
                  </span>
                </div>
                {!n.acknowledged_at && (
                  <button onClick={async () => { try { await api.post(`/api/cs/notifications/${n.id}/ack`); load(); } catch (e) { setError(e.message); } }}
                    className="px-3 py-1.5 min-h-[36px] text-xs rounded-lg bg-amber-600 text-white">Mark notified</button>
                )}
              </div>
            ))}
          </section>
        </div>
      )}

      {modal?.kind === 'count' && (
        <CountModal loc={modal.loc} items={items.filter((i) => i.location_id === modal.loc.id)}
          members={members} currentUser={currentUser}
          onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />
      )}
      {modal?.kind === 'event' && (
        <EventModal event={modal.event} item={modal.item} members={members} currentUser={currentUser}
          onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />
      )}
      {modal?.kind === 'acquire' && (
        <AcquireModal substances={substances} locations={locations}
          onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />
      )}
      {modal?.kind === 'history' && (
        <HistoryModal item={modal.item} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

// ── PIN enrollment ───────────────────────────────────────────────────────────

function PinEnroll({ onDone }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(null);
  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 mb-4">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
        <KeyRound className="w-4 h-4" /> Set your controlled-substance PIN
      </p>
      <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
        Every narcotics action re-proves who you are with a 4–8 digit PIN. It's yours alone — a chief can reset it but never see it.
      </p>
      <div className="flex gap-2 mt-2">
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)}
          placeholder="4–8 digits" className="text-sm rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 px-3 py-2 w-36" />
        <button onClick={async () => {
          try { await api.post('/api/cs/pin', { pin }); onDone(); }
          catch (e) { setErr(e.message); }
        }} disabled={!/^\d{4,8}$/.test(pin)}
          className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-amber-600 text-white disabled:opacity-40">Enroll</button>
      </div>
      {err && <p className="text-xs text-red-600 mt-1" role="alert">{err}</p>}
    </div>
  );
}

// ── Shared modal chrome ──────────────────────────────────────────────────────

function ModalShell({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-start justify-center overflow-y-auto p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} my-8`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

const field = 'w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100';
const label = 'text-xs font-semibold text-gray-600 dark:text-gray-300';

function WitnessBlock({ members, currentUser, witness, setWitness }) {
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-900 p-3 space-y-2">
      <p className="text-xs font-bold text-red-700 dark:text-red-400">WITNESS REQUIRED — a second person verifies and signs</p>
      <label className={label}>Witness
        <select value={witness.user_id} onChange={(e) => setWitness({ ...witness, user_id: e.target.value })} className={field}>
          <option value="">Select…</option>
          {members.filter((m) => String(m.id) !== String(currentUser?.id))
            .map((m) => <option key={m.id} value={m.id}>{m.name || m.username}</option>)}
        </select>
      </label>
      <label className={label}>Witness PIN
        <input type="password" inputMode="numeric" value={witness.pin}
          onChange={(e) => setWitness({ ...witness, pin: e.target.value })} className={field} placeholder="Their CS PIN" />
      </label>
      <div>
        <p className={label}>Witness signature</p>
        <SignaturePad onChange={(sig) => setWitness((w) => ({ ...w, signature: sig }))} height={120} />
      </div>
    </div>
  );
}

// ── Administer / Waste ───────────────────────────────────────────────────────

function EventModal({ event, item, members, currentUser, onClose, onDone }) {
  const isWaste = event === 'waste';
  const remaining = Number(item.remaining_units);
  const [form, setForm] = useState({
    amount: isWaste ? String(remaining) : '', incident: '', patient: '',
    standing: true, authorizer: '', manner: '', pin: '',
  });
  const [witness, setWitness] = useState({ user_id: '', pin: '', signature: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const payload = isWaste ? {
        kind: 'waste', item_id: item.id, amount_disposed: Number(form.amount),
        manner_disposed: form.manner, actor_pin: form.pin,
        witness_user_id: Number(witness.user_id) || undefined,
        witness_pin: witness.pin || undefined, witness_signature: witness.signature || undefined,
        ...(form.incident ? { incident_number: form.incident } : {}),
      } : {
        kind: 'administer', item_id: item.id, amount_administered: Number(form.amount),
        incident_number: form.incident, actor_pin: form.pin,
        ...(form.patient ? { patient_identifier: form.patient } : {}),
        standing_order: form.standing,
        ...(form.authorizer ? { authorizer_name: form.authorizer } : {}),
      };
      await api.post('/api/cs/events', payload);
      onDone();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <ModalShell title={`${isWaste ? 'Waste' : 'Administer'} — ${item.substance_name} ${item.control_no}`} onClose={onClose}>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {item.finished_form} · {remaining} {item.unit_label} {item.status === 'administered' ? 'remaining' : 'on hand'}
      </p>
      <label className={label}>{isWaste ? `Amount wasted (${item.unit_label}) — must equal the remainder` : `Amount administered (${item.unit_label})`}
        <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={field} />
      </label>
      {!isWaste && (
        <>
          <label className={label}>Incident number (required)
            <input value={form.incident} onChange={(e) => setForm({ ...form, incident: e.target.value })} className={field} />
          </label>
          <label className={label}>Patient identifier (PCR / run #, never name + DOB)
            <input value={form.patient} onChange={(e) => setForm({ ...form, patient: e.target.value })} className={field} />
          </label>
          <label className={label}>Authorizing physician (standing order)
            <input value={form.authorizer} onChange={(e) => setForm({ ...form, authorizer: e.target.value })} className={field} />
          </label>
        </>
      )}
      {isWaste && (
        <label className={label}>Manner of disposal (§1304.27(a)(10))
          <input value={form.manner} onChange={(e) => setForm({ ...form, manner: e.target.value })} className={field}
            placeholder="e.g. expelled to sink with witness" />
        </label>
      )}
      <label className={label}>Your CS PIN
        <input type="password" inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className={field} />
      </label>
      {isWaste && <WitnessBlock members={members} currentUser={currentUser} witness={witness} setWitness={setWitness} />}
      {err && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
        <button onClick={submit} disabled={busy || !form.amount || !form.pin || (isWaste && (!witness.user_id || !witness.pin || !witness.signature))}
          className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-red-600 text-white disabled:opacity-40">
          {busy ? 'Recording…' : 'Record on the ledger'}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Shift count ──────────────────────────────────────────────────────────────

function CountModal({ loc, items, members, currentUser, onClose, onDone }) {
  const [present, setPresent] = useState(() => new Set(items.map((i) => i.id)));
  const [kind, setKind] = useState('on_coming');
  const [sealsOk, setSealsOk] = useState(true);
  const [sealsRead, setSealsRead] = useState(loc.current_seals || '');
  const [pin1, setPin1] = useState('');
  const [witness, setWitness] = useState({ user_id: '', pin: '', signature: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await api.post('/api/cs/counts', {
        location_id: loc.id, kind, seals_intact: sealsOk,
        ...(sealsRead ? { seals_verified: sealsRead } : {}),
        verifier1_pin: pin1,
        verifier2_user_id: Number(witness.user_id), verifier2_pin: witness.pin,
        verifier2_signature: witness.signature,
        present_item_ids: [...present],
      });
      onDone();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <ModalShell title={`Shift count — ${loc.name}`} onClose={onClose} wide>
      <div className="flex gap-2 flex-wrap">
        {['on_coming', 'off_going', 'audit', 'biennial'].map((k) => (
          <button key={k} onClick={() => setKind(k)}
            className={`px-3 py-1.5 min-h-[36px] text-xs rounded-full border ${kind === k
              ? 'bg-red-600 border-red-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}>
            {k.replace('_', '-')}
          </button>
        ))}
      </div>
      {loc.seal_mode !== 'none' && (
        <div className="flex items-center gap-3">
          <label className={label + ' flex-1'}>Seal number(s) as read
            <input value={sealsRead} onChange={(e) => setSealsRead(e.target.value)} className={field} />
          </label>
          <label className="text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2 mt-4">
            <input type="checkbox" checked={sealsOk} onChange={(e) => setSealsOk(e.target.checked)} /> Seals intact
          </label>
        </div>
      )}
      <div className="max-h-[35vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
        {items.length === 0 && <p className="p-3 text-sm text-gray-500">Nothing expected in this location.</p>}
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-800 dark:text-gray-200">
            <input type="checkbox" checked={present.has(i.id)} onChange={(e) => {
              const next = new Set(present);
              if (e.target.checked) next.add(i.id); else next.delete(i.id);
              setPresent(next);
            }} />
            <span className="font-mono">{i.control_no}</span> {i.substance_name} · {i.finished_form}
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Uncheck anything not physically in the box. A mismatch opens a discrepancy the chief must resolve — that's the point.
      </p>
      <label className={label}>Your CS PIN (first verifier)
        <input type="password" inputMode="numeric" value={pin1} onChange={(e) => setPin1(e.target.value)} className={field} />
      </label>
      <WitnessBlock members={members} currentUser={currentUser} witness={witness} setWitness={setWitness} />
      {err && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
        <button onClick={submit} disabled={busy || !pin1 || !witness.user_id || !witness.pin || !witness.signature}
          className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-red-600 text-white disabled:opacity-40">
          {busy ? 'Recording…' : 'Record count'}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Receive stock (acquire / hospital restock) ───────────────────────────────

function AcquireModal({ substances, locations, onClose, onDone }) {
  const [kind, setKind] = useState('acquire');
  const [subId, setSubId] = useState('');
  const [locId, setLocId] = useState('');
  const [counterpart, setCounterpart] = useState({ name: '', address: '', dea: '' });
  const [vials, setVials] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const newItems = vials.split(/\n|,/).map((s) => s.trim()).filter(Boolean)
        .map((control_no) => ({ control_no }));
      await api.post('/api/cs/events', {
        kind, substance_id: Number(subId), location_id: Number(locId),
        counterpart_name: counterpart.name,
        ...(counterpart.address ? { counterpart_address: counterpart.address } : {}),
        ...(counterpart.dea ? { counterpart_dea_no: counterpart.dea } : {}),
        containers: newItems.length, new_items: newItems, actor_pin: pin,
      });
      onDone();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <ModalShell title="Receive controlled substances" onClose={onClose} wide>
      <div className="flex gap-2">
        {[['acquire', 'From pharmacy / vendor'], ['restock_hospital', 'Hospital restock (72-h notice)']].map(([k, lbl]) => (
          <button key={k} onClick={() => setKind(k)}
            className={`px-3 py-1.5 min-h-[36px] text-xs rounded-full border ${kind === k
              ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}>{lbl}</button>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <label className={label}>Substance
          <select value={subId} onChange={(e) => setSubId(e.target.value)} className={field}>
            <option value="">Select…</option>
            {substances.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name} — {s.finished_form}</option>)}
          </select>
        </label>
        <label className={label}>Into location
          <select value={locId} onChange={(e) => setLocId(e.target.value)} className={field}>
            <option value="">Select…</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>
      <label className={label}>{kind === 'restock_hospital' ? 'Hospital / ED pharmacy' : 'Supplier'} name (§1304.27(b))
        <input value={counterpart.name} onChange={(e) => setCounterpart({ ...counterpart, name: e.target.value })} className={field} />
      </label>
      <div className="grid md:grid-cols-2 gap-3">
        <label className={label}>Address
          <input value={counterpart.address} onChange={(e) => setCounterpart({ ...counterpart, address: e.target.value })} className={field} />
        </label>
        <label className={label}>DEA number
          <input value={counterpart.dea} onChange={(e) => setCounterpart({ ...counterpart, dea: e.target.value })} className={field} />
        </label>
      </div>
      <label className={label}>Control numbers — one per line (each vial gets its own)
        <textarea value={vials} onChange={(e) => setVials(e.target.value)} rows={4} className={field}
          placeholder={'F-2026-0141\nF-2026-0142'} />
      </label>
      <label className={label}>Your CS PIN
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} className={field} />
      </label>
      {err && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
        <button onClick={submit} disabled={busy || !subId || !locId || !counterpart.name || !vials.trim() || !pin}
          className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">
          {busy ? 'Recording…' : 'Receive & log'}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Catalog (CS managers): the setup surface a fresh department starts from ──
// Found on the 2.7 prod design walk: the create APIs existed with NO UI door —
// a new department could never get started. This tab is that door.

function CatalogTab({ substances, locations, onChanged }) {
  const [sub, setSub] = useState({ name: '', schedule: 'II', finished_form: '', unit_label: 'mg', units: '' });
  const [loc, setLoc] = useState({ name: '', kind: 'box', seal_mode: 'single', par: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function addSubstance() {
    setBusy(true); setErr(null);
    try {
      await api.post('/api/cs/substances', {
        name: sub.name, schedule: sub.schedule, finished_form: sub.finished_form,
        unit_label: sub.unit_label, units_per_container: Number(sub.units),
      });
      setSub({ name: '', schedule: 'II', finished_form: '', unit_label: 'mg', units: '' });
      onChanged();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function addLocation() {
    setBusy(true); setErr(null);
    try {
      await api.post('/api/cs/locations', {
        name: loc.name, kind: loc.kind, seal_mode: loc.seal_mode,
        ...(loc.par ? { par_level: Number(loc.par) } : {}),
      });
      setLoc({ name: '', kind: 'box', seal_mode: 'single', par: '' });
      onChanged();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Substances</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The drugs your department carries — name, schedule, and the finished form exactly
          as the label reads (§1304.27(a)(2)).
        </p>
        {substances.map((s) => (
          <p key={s.id} className="text-sm text-gray-700 dark:text-gray-200">
            {s.name} · Sch {s.schedule} · {s.finished_form} · {Number(s.units_per_container)} {s.unit_label}/vial
          </p>
        ))}
        <label className={label}>Name
          <input value={sub.name} onChange={(e) => setSub({ ...sub, name: e.target.value })} className={field} placeholder="Fentanyl citrate" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>Schedule
            <select value={sub.schedule} onChange={(e) => setSub({ ...sub, schedule: e.target.value })} className={field}>
              {['II', 'III', 'IV', 'V'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className={label}>Unit
            <input value={sub.unit_label} onChange={(e) => setSub({ ...sub, unit_label: e.target.value })} className={field} placeholder="mcg" />
          </label>
        </div>
        <label className={label}>Finished form (as the label reads)
          <input value={sub.finished_form} onChange={(e) => setSub({ ...sub, finished_form: e.target.value })} className={field} placeholder="100 mcg / 2 mL vial" />
        </label>
        <label className={label}>Units per vial
          <input type="number" value={sub.units} onChange={(e) => setSub({ ...sub, units: e.target.value })} className={field} placeholder="100" />
        </label>
        <button onClick={addSubstance} disabled={busy || !sub.name || !sub.finished_form || !sub.units}
          className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">Add substance</button>
      </section>
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Locations</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Every safe, vault, and rig box that holds narcotics. Counts and custody run per location.
        </p>
        {locations.map((l) => (
          <p key={l.id} className="text-sm text-gray-700 dark:text-gray-200">
            {l.name} · {l.kind}{l.par_level ? ` · par ${l.par_level}` : ''}
          </p>
        ))}
        <label className={label}>Name
          <input value={loc.name} onChange={(e) => setLoc({ ...loc, name: e.target.value })} className={field} placeholder="Medic 1 narc box" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className={label}>Kind
            <select value={loc.kind} onChange={(e) => setLoc({ ...loc, kind: e.target.value })} className={field}>
              {['box', 'safe', 'vault', 'other'].map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className={label}>Seals
            <select value={loc.seal_mode} onChange={(e) => setLoc({ ...loc, seal_mode: e.target.value })} className={field}>
              {['single', 'multi', 'none'].map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className={label}>Par
            <input type="number" value={loc.par} onChange={(e) => setLoc({ ...loc, par: e.target.value })} className={field} placeholder="4" />
          </label>
        </div>
        <button onClick={addLocation} disabled={busy || !loc.name}
          className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">Add location</button>
      </section>
      {err && <p className="text-sm text-red-600 dark:text-red-400 md:col-span-2" role="alert">{err}</p>}
    </div>
  );
}

// ── Activity + history ───────────────────────────────────────────────────────

const KIND_LABELS = {
  acquire: 'Received', deliver: 'Delivered', restock_hospital: 'Hospital restock',
  transfer: 'Transferred', administer: 'Administered', waste: 'Wasted',
  expire: 'Expired', break: 'Broken', destroy: 'Destroyed', count_adjust: 'Correction',
};

function EventLine({ e }) {
  return (
    <div className="px-3 py-2 text-sm">
      <p className="text-gray-900 dark:text-gray-100">
        <b>{KIND_LABELS[e.kind] || e.kind}</b>
        {e.amount_administered ? ` · ${Number(e.amount_administered)} given` : ''}
        {e.amount_disposed ? ` · ${Number(e.amount_disposed)} disposed (${e.manner_disposed})` : ''}
        {e.incident_number ? ` · inc ${e.incident_number}` : ''}
        {e.counterpart_name ? ` · ${e.counterpart_name}` : ''}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {new Date(e.occurred_at).toLocaleString()} · by {e.actor_name}
        {e.witness_name ? ` · witnessed by ${e.witness_name}` : ''}
        {e.authorizer_name ? ` · order: ${e.authorizer_name}${e.standing_order ? ' (standing)' : ''}` : ''}
      </p>
      {e.note ? <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{e.note}</p> : null}
    </div>
  );
}

function HistoryModal({ item, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.get(`/api/cs/items/${item.id}/history`).then((r) => setData(r?.data)).catch((e) => setErr(e.message));
  }, [item.id]);
  return (
    <ModalShell title={`Custody history — ${item.control_no}`} onClose={onClose} wide>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      {!data ? <p className="text-sm text-gray-500">Loading…</p> : (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {data.item.substance_name} · Sch {data.item.schedule} · {data.item.finished_form} ·
            lot {data.item.lot_no || '—'} · status <b>{data.item.status}</b>
          </p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-[50vh] overflow-y-auto">
            {data.events.map((e) => <EventLine key={e.id} e={e} />)}
          </div>
        </>
      )}
    </ModalShell>
  );
}

function ActivityFeed() {
  // The department-wide custody ledger (market bar: the full activity history is
  // core, not an add-on) + the count log beneath it.
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState([]);
  useEffect(() => {
    api.get('/api/cs/events').then((r) => setEvents(r?.data || [])).catch(() => {});
    api.get('/api/cs/counts').then((r) => setCounts(r?.data || [])).catch(() => {});
  }, []);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
        {events.length === 0 && <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No ledger entries yet.</p>}
        {events.map((e) => (
          <div key={e.id} className="flex items-baseline gap-2 px-1">
            <span className="pl-2 font-mono text-xs text-gray-500 dark:text-gray-400 shrink-0">{e.control_no || '—'}</span>
            <div className="flex-1"><EventLine e={e} /></div>
          </div>
        ))}
      </div>
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Counts</h3>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
        {counts.length === 0 && <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No counts recorded yet.</p>}
        {counts.map((c) => (
          <div key={c.id} className="px-3 py-2 text-sm">
            <p className="text-gray-900 dark:text-gray-100">
              <b>{c.kind.replace('_', '-')}</b> count · {c.location_name} ·{' '}
              {c.clean ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">clean</span>
                : <span className="text-red-600 dark:text-red-400 font-semibold">DISCREPANCY</span>}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(c.counted_at).toLocaleString()} · {c.verifier1_name} + {c.verifier2_name}
              {c.seals_verified ? ` · seals ${c.seals_verified}${c.seals_intact ? ' intact' : ' NOT INTACT'}` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiscrepancyRow({ d, isChief, onResolved }) {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState('found');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  return (
    <div className={`rounded-lg border px-3 py-2 mb-2 ${d.status === 'open'
      ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-gray-900 dark:text-gray-100">
          {d.control_no ? <span className="font-mono mr-1">{d.control_no}</span> : null}{d.detail}
          <span className="text-xs text-gray-500 ml-2">{new Date(d.opened_at).toLocaleString()}{d.location_name ? ` · ${d.location_name}` : ''}</span>
        </div>
        {d.status === 'open'
          ? (isChief && <button onClick={() => setOpen(!open)} className="px-3 py-1.5 min-h-[36px] text-xs rounded-lg bg-red-600 text-white">Resolve</button>)
          : <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">resolved: {d.resolution}</span>}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            {['found', 'documentation_error', 'reported'].map((r) => (
              <button key={r} onClick={() => setResolution(r)}
                className={`px-3 py-1.5 min-h-[36px] text-xs rounded-full border ${resolution === r
                  ? 'bg-red-600 border-red-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}>
                {r.replace('_', ' ')}
              </button>
            ))}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={field}
            placeholder="What happened, exactly? This is the record." />
          {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
          <button onClick={async () => {
            try { await api.post(`/api/cs/discrepancies/${d.id}/resolve`, { resolution, note }); onResolved(); }
            catch (e) { setErr(e.message); }
          }} disabled={note.trim().length < 3}
            className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-red-600 text-white disabled:opacity-40">Record resolution</button>
        </div>
      )}
    </div>
  );
}
