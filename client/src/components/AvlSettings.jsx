/**
 * AvlSettings.jsx — chief admin for hardware AVL (vehicle GPS) feeds (ADR-0003).
 *
 * Set up a department's existing in-vehicle AVL so rigs appear on the command map
 * independent of any iPad — no SQL. Create a feed (secret shown ONCE), point the
 * department's AVL provider/gateway at the ingest URL, then map each device id to
 * an apparatus. Chief-only (page access level 3); the iPad GPS path is unaffected.
 */
import { useState, useEffect, useCallback } from 'react';
import { Truck, Plus, RefreshCw, Trash2, Copy, CheckCircle, KeyRound, Radio } from 'lucide-react';
import { api } from '../utils/api';

const VENDORS = [
  { id: 'generic', label: 'Generic JSON (any integrator / forwarder)' },
  { id: 'nmea', label: 'NMEA-0183 (raw GPS sentences)' },
];

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AvlSettings() {
  const [connections, setConnections] = useState([]);
  const [devices, setDevices] = useState([]);
  const [apparatus, setApparatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [revealed, setRevealed] = useState(null); // { id, secret } shown once
  const [copied, setCopied] = useState(false);

  const [cName, setCName] = useState('');
  const [cVendor, setCVendor] = useState('generic');
  const [dRef, setDRef] = useState('');
  const [dApp, setDApp] = useState('');

  const ingestUrl = `${window.location.origin}/api/avl/ingest`;

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [c, d, a] = await Promise.all([
        api.get('/api/avl/connections'),
        api.get('/api/avl/devices'),
        api.get('/api/apparatus'),
      ]);
      setConnections((c && c.data) || []);
      setDevices((d && d.data) || []);
      setApparatus(Array.isArray(a) ? a : (a && a.data) || []);
    } catch (e) {
      setErr('Could not load AVL settings.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createConnection = async () => {
    try {
      const r = await api.post('/api/avl/connections', { name: cName || 'AVL Feed', vendorId: cVendor });
      setRevealed({ id: r.id, secret: r.secret });
      setCName('');
      await load();
    } catch { setErr('Create failed.'); }
  };
  const rotate = async (id) => {
    try { const r = await api.post(`/api/avl/connections/${id}/rotate-secret`); setRevealed({ id, secret: r.secret }); }
    catch { setErr('Rotate failed.'); }
  };
  const delConnection = async (id) => {
    try { await api.delete(`/api/avl/connections/${id}`); await load(); } catch { setErr('Delete failed.'); }
  };
  const addDevice = async () => {
    if (!dRef || !dApp) return;
    try { await api.post('/api/avl/devices', { deviceRef: dRef, apparatusId: Number(dApp) }); setDRef(''); setDApp(''); await load(); }
    catch { setErr('Add device failed (is the apparatus in your department?).'); }
  };
  const delDevice = async (id) => {
    try { await api.delete(`/api/avl/devices/${id}`); await load(); } catch { setErr('Delete failed.'); }
  };
  const copy = (t) => { try { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ } };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
          <Truck size={22} className="text-blue-700 dark:text-blue-300" />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Vehicle AVL Feeds</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Show rigs on the command map from in-vehicle GPS hardware — independent of any iPad.</p>
        </div>
      </div>

      {err && <div className="text-xs font-bold text-red-600 dark:text-red-400">{err}</div>}

      {/* One-time secret reveal */}
      {revealed && (
        <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-black text-sm"><KeyRound size={15} /> Save this secret now — it won't be shown again</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white dark:bg-gray-900 rounded px-2 py-1.5 break-all border border-amber-200 dark:border-amber-800">{revealed.secret}</code>
            <button onClick={() => copy(revealed.secret)} className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded bg-amber-600 text-white">{copied ? <CheckCircle size={13} /> : <Copy size={13} />} Copy</button>
          </div>
          <p className="text-[11px] text-amber-700 dark:text-amber-400">Configure your AVL provider/gateway to POST to <code className="font-bold">{ingestUrl}</code> with header <code className="font-bold">X-AVL-Secret: &lt;this secret&gt;</code>. For raw NMEA use <code>{ingestUrl}/nmea?device=&lt;unit id&gt;</code>.</p>
          <button onClick={() => setRevealed(null)} className="text-[11px] font-bold text-amber-700 dark:text-amber-400 underline">Dismiss</button>
        </div>
      )}

      {/* Connections */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3"><Radio size={15} className="text-blue-600" /><h3 className="font-black text-sm text-gray-800 dark:text-gray-200">Feeds</h3></div>
        <div className="flex flex-wrap gap-2 mb-3">
          <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Feed name (e.g. Fleet AVL)" className="flex-1 min-w-[180px] text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5" />
          <select value={cVendor} onChange={(e) => setCVendor(e.target.value)} className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5">
            {VENDORS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          <button onClick={createConnection} className="flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-blue-600 text-white"><Plus size={15} /> Add Feed</button>
        </div>
        {loading ? <p className="text-xs text-gray-400">Loading…</p> : connections.length === 0 ? (
          <p className="text-xs text-gray-400">No feeds yet. Add one, then point your AVL provider at the ingest URL.</p>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-sm rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2">
                <span className={`w-2.5 h-2.5 rounded-full ${c.status === 'Active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="font-bold text-gray-800 dark:text-gray-100">{c.name}</span>
                <span className="text-[11px] text-gray-500 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{c.vendor_id}</span>
                <span className="text-[11px] text-gray-400 flex-1">{c.fixes_ingested || 0} fixes · last {fmt(c.last_fix_at)}</span>
                <button onClick={() => rotate(c.id)} title="Rotate secret" className="text-gray-400 hover:text-blue-600"><RefreshCw size={15} /></button>
                <button onClick={() => delConnection(c.id)} title="Delete" className="text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Devices */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-1"><Truck size={15} className="text-blue-600" /><h3 className="font-black text-sm text-gray-800 dark:text-gray-200">Device → Apparatus</h3></div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">Map each GPS/modem device id (as it appears in your feed) to the apparatus it's mounted in.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          <input value={dRef} onChange={(e) => setDRef(e.target.value)} placeholder="Device id (e.g. modem serial / unit id)" className="flex-1 min-w-[180px] text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5" />
          <select value={dApp} onChange={(e) => setDApp(e.target.value)} className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5">
            <option value="">Select apparatus…</option>
            {apparatus.map((a) => <option key={a.id} value={a.id}>{a.designation || a.name || `#${a.id}`}</option>)}
          </select>
          <button onClick={addDevice} className="flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-blue-600 text-white"><Plus size={15} /> Map</button>
        </div>
        {devices.length === 0 ? <p className="text-xs text-gray-400">No devices mapped yet.</p> : (
          <div className="space-y-2">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center gap-3 text-sm rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2">
                <code className="text-xs text-gray-700 dark:text-gray-300">{d.device_ref}</code>
                <span className="text-gray-400">→</span>
                <span className="font-bold text-gray-800 dark:text-gray-100 flex-1">{d.designation || `apparatus #${d.apparatus_id}`}</span>
                <button onClick={() => delDevice(d.id)} title="Remove" className="text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
