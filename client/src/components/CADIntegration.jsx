import { useState, useEffect, useCallback } from 'react';
import {
  Radio, Plus, CheckCircle, XCircle, Clock, AlertTriangle,
  RefreshCw, Settings, ChevronDown, ChevronUp, Plug, Wifi,
  WifiOff, FileText, Map,
} from 'lucide-react';
import {
  CAD_VENDORS, CONNECTION_STATUSES, SYNC_INTERVALS,
  initialImportLog, cadRecentIncidents,
  FIELD_MAP_REFERENCE,
} from '../data/cad';
import { api } from '../utils/api';
import { isBcPlus } from '../data/auth';
import CadIngestFaults from './CadIngestFaults';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function StatusDot({ status }) {
  const map = {
    Active:   'bg-green-500',
    Inactive: 'bg-gray-400',
    Error:    'bg-red-500',
    Testing:  'bg-amber-400 animate-pulse',
    success:  'bg-green-500',
    error:    'bg-red-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${map[status] ?? 'bg-gray-300'}`} />;
}

function VendorLogo({ logo, size = 'sm' }) {
  const sz = size === 'lg' ? 'h-12 w-12 text-sm' : 'h-8 w-8 text-[10px]';
  return (
    <div className={`${sz} rounded-xl bg-gray-800 text-white font-black flex items-center justify-center flex-shrink-0`}>
      {logo}
    </div>
  );
}

// ─── Connection Form ───────────────────────────────────────────────────────────

function ConnectionForm({ initial, onSave, onClose }) {
  const blank = {
    vendorId: CAD_VENDORS[0].id,
    name: '',
    status: 'Inactive',
    host: '',
    apiKey: '',
    syncInterval: 'Every 15 minutes',
    notes: '',
  };
  const [form, setForm] = useState(initial ?? blank);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const vendor = CAD_VENDORS.find(v => v.id === form.vendorId) ?? CAD_VENDORS[0];

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, id: form.id ?? Date.now(), incidentsImported: form.incidentsImported ?? 0 });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-900 rounded-t-2xl">
          <h2 className="text-base font-bold text-white">{initial ? 'Edit Connection' : 'New CAD Connection'}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white"><XCircle size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Vendor selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">CAD / RMS Vendor</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {CAD_VENDORS.map(v => (
                <button key={v.id} type="button" onClick={() => set('vendorId', v.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-colors ${
                    form.vendorId === v.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900'
                  }`}>
                  <VendorLogo logo={v.logo} />
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 leading-tight">{v.name}</span>
                </button>
              ))}
            </div>
            {/* Vendor detail */}
            <div className="mt-3 bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-600 dark:text-gray-300">{vendor.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {vendor.features.map(f => (
                  <span key={f} className="text-[10px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-0.5 text-gray-600 dark:text-gray-300">{f}</span>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">Auth method: <span className="font-semibold text-gray-600 dark:text-gray-300">{vendor.authMethod}</span></p>
            </div>
          </div>

          {/* Connection name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Connection Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. County Dispatch — CentralSquare"
              aria-label="Connection name"
              required
              className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-900 dark:text-gray-100" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Host / endpoint */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Host / Endpoint</label>
              <input value={form.host} onChange={e => set('host', e.target.value)}
                placeholder="dispatch.county.gov"
                aria-label="Host or endpoint"
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-900 dark:text-gray-100" />
            </div>
            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Status</label>
              <select value={form.status} aria-label="Status" onChange={e => set('status', e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-gray-100">
                {CONNECTION_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">API Key / Token</label>
            <input type="password" value={form.apiKey} onChange={e => set('apiKey', e.target.value)}
              placeholder="Paste API key or token"
              aria-label="API key or token"
              className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono dark:bg-gray-900 dark:text-gray-100" />
          </div>

          {/* Sync interval */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Sync Interval</label>
            <select value={form.syncInterval} aria-label="Sync interval" onChange={e => set('syncInterval', e.target.value)}
              className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-gray-100">
              {SYNC_INTERVALS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Notes</label>
            <textarea value={form.notes} aria-label="Notes" onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none dark:bg-gray-900 dark:text-gray-100" />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">Cancel</button>
            <button type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-gray-900 rounded-xl hover:bg-gray-800">
              {initial ? 'Save Changes' : 'Add Connection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function CADIntegration({ onNavigate, currentUser }) {
  // Writes to /api/cad-connections are chief-only on the server (2026-08-05). The controls are
  // hidden here to match, not merely disabled after the fact: a button that always 403s is
  // anti-pattern #61's remedy-not-offered mode. isBcPlus is level >= 3 — the same ladder rung
  // as the server's requireChief, and the two are kept in lock-step deliberately.
  const canManage = isBcPlus(currentUser);
  const [connections,  setConnections]  = useState([]);
  const [importLog]                     = useState(initialImportLog);
  const [loading, setLoading]           = useState(true);
  const [activeTab,    setActiveTab]    = useState('active911');
  const [expandedConn, setExpandedConn] = useState(null);
  const [formOpen,     setFormOpen]     = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [mapOpen,      setMapOpen]      = useState(false);
  const [liveAlerts,   setLiveAlerts]   = useState([]);
  const [webhookUrl,   setWebhookUrl]   = useState('');
  const [newSecret,    setNewSecret]    = useState(null); // one-time per-connection webhook secret (shown once on create)

  const fetchConnections = useCallback(async () => {
    try {
      const raw = await api.get('/api/cad-connections');
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setConnections(arr);
    } catch (e) {
      console.error('Failed to fetch CAD connections', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  // Fetch live CAD alerts and webhook URL
  useEffect(() => {
    api.get('/api/cad/alerts?limit=50')
      .then(raw => {
        const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setLiveAlerts(arr);
      })
      .catch(() => {});
    api.get('/api/cad/webhook-url')
      .then(raw => {
        const obj = raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        setWebhookUrl(obj?.url || '');
      })
      .catch(() => {});
  }, []);

  const activeConnections = connections.filter(c => c.status === 'Active').length;
  const totalImported     = connections.reduce((s, c) => s + (c.incidentsImported ?? 0), 0);

  async function handleSave(data) {
    try {
      if (data.id && connections.find(c => c.id === data.id)) {
        const { id, ...changes } = data;
        const res = await api.patch(`/api/cad-connections/${id}`, changes);
        setConnections(prev => prev.map(c => c.id === res.data.id ? res.data : c));
      } else {
        const { id: _ignore, ...body } = data;
        const res = await api.post('/api/cad-connections', body);
        setConnections(prev => [...prev, res.data]);
        // The webhook secret is returned exactly ONCE, on create — surface it so
        // the chief can copy it into their CAD vendor's webhook config.
        if (res.data?.webhook_secret) setNewSecret({ secret: res.data.webhook_secret, name: res.data.name });
      }
    } catch (e) {
      console.error('Failed to save CAD connection', e);
    }
    setFormOpen(false); setEditing(null);
  }

  function openEdit(conn) { setEditing(conn); setFormOpen(true); }

  if (loading) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading CAD connections…</div>;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">CAD Integration</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Connect to county or regional CAD systems to import dispatch data automatically
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => { setEditing(null); setFormOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-gray-900 text-white rounded-xl hover:bg-gray-800 shadow-sm">
            <Plus size={15} /> Add Connection
          </button>
        )}
      </div>

      {/* One-time per-connection webhook secret (shown once on create) */}
      {newSecret && (
        <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-amber-900 dark:text-amber-200">Webhook secret for “{newSecret.name}” — copy it now</p>
              <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                This is shown <strong>once</strong> and can’t be retrieved later. Add it to your CAD vendor’s webhook
                as the <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded">X-CAD-Webhook-Secret</code> header
                (or <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded">?secret=…</code> on the URL). It routes dispatches to your department automatically.
              </p>
              <code className="block mt-2 font-mono text-sm break-all bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5 text-gray-900 dark:text-gray-100">{newSecret.secret}</code>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => navigator.clipboard.writeText(newSecret.secret)}
                className="px-3 py-1.5 text-xs font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700">Copy</button>
              <button
                onClick={() => setNewSecret(null)}
                className="px-3 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 hover:underline">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Connections',       value: connections.length,   color: 'text-gray-900 dark:text-gray-100' },
          { label: 'Active',            value: activeConnections,    color: 'text-green-700 dark:text-green-300' },
          { label: 'Incidents Imported',value: totalImported,        color: 'text-blue-700 dark:text-blue-300' },
          { label: 'Supported Vendors', value: CAD_VENDORS.length,   color: 'text-gray-500 dark:text-gray-400' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3 shadow-sm">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 flex gap-3">
        <Radio size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-blue-800 dark:text-blue-300">About CAD Integration</p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
            OpenFirehouse can connect to your county or regional CAD system to automatically pull incoming
            dispatch data into the Incident Log. Adapters available for Active911, CentralSquare,
            Motorola PremierOne, and others. For manual import, use the CSV option.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit flex-wrap">
        {[
          { id: 'active911',   label: '🚨 Active911' },
          { id: 'connections', label: 'Connections' },
          { id: 'log',         label: 'Import Log' },
          { id: 'incidents',   label: 'Recent Imports' },
          { id: 'vendors',     label: 'Supported Vendors' },
          { id: 'fieldmap',    label: 'Field Mapping' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === t.id ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ── Active911 Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'active911' && (
        <div className="space-y-4">

          {/* Setup Instructions */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Plug size={16} className="text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-black text-gray-900 dark:text-gray-100">Connect Active911 to <span className="text-gray-900 dark:text-gray-100">OPEN</span><span className="text-red-600 dark:text-red-400">FIREHOUSE</span></h2>
            </div>
            <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-700 text-white text-xs font-black flex items-center justify-center">1</span>
                <span>Log in to your Active911 account at <span className="font-mono text-xs text-blue-700 dark:text-blue-300">app.active911.com</span> as an admin.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-700 text-white text-xs font-black flex items-center justify-center">2</span>
                <span>Go to <strong>Agency Settings → Integrations → Webhooks</strong> and click <strong>Add Webhook</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-700 text-white text-xs font-black flex items-center justify-center">3</span>
                <div className="flex-1">
                  <p>Paste this URL as the webhook endpoint:</p>
                  <div className="mt-1.5 flex items-center gap-2 bg-gray-900 rounded-xl px-3 py-2">
                    <code className="text-xs text-green-400 flex-1 break-all font-mono">
                      {webhookUrl || 'https://your-api.vercel.app/api/cad/active911'}
                    </code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(webhookUrl || '')}
                      className="flex-shrink-0 text-gray-400 hover:text-white text-xs"
                      title="Copy"
                      aria-label="Copy webhook URL"
                    >⎘</button>
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-700 text-white text-xs font-black flex items-center justify-center">4</span>
                <span>Set the trigger to <strong>New Alert</strong> and save. Active911 will POST every incoming dispatch to OpenFirehouse automatically.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-700 text-white text-xs font-black flex items-center justify-center">5</span>
                <span>Optionally, add <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">ACTIVE911_AGENCY_ID</code> to your Vercel environment variables to restrict the webhook to your agency only.</span>
              </li>
            </ol>
          </div>

          {/* 4C.4 — interface faults. Placed ABOVE the alert feed on purpose: a message we
              could not read is invisible in that feed by definition, so the panel that shows
              it must not sit below the one that cannot. */}
          <CadIngestFaults departmentId={currentUser?.department_id ?? null} />

          {/* Live Alerts */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-black text-gray-900 dark:text-gray-100">Recent Dispatch Alerts</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">{liveAlerts.length} received</span>
            </div>
            {liveAlerts.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Radio size={28} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No alerts received yet.</p>
                <p className="text-xs mt-1">Once Active911 is connected, incoming dispatches will appear here.</p>
              </div>
            ) : (
              liveAlerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-4 px-5 py-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 mt-2" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-red-700 dark:text-red-300">{alert.description}</span>
                      {alert.units && <span className="text-xs text-gray-500 dark:text-gray-400">· {alert.units}</span>}
                      {/* 4C.2 spec §5.6 — provenance. alert_id_source was recorded correctly by
                          4C.1 and read by NOTHING for weeks, so an operator whose CAD sends no
                          call number had no way to tell. Read the COLUMN, never the 'syn-'
                          prefix: a vendor id that happens to start with those characters would
                          be misreported by the string test. */}
                      {alert.alert_id_source === 'synthesized' && (
                        <span
                          title="This CAD did not send a call number, so OpenFirehouse assigned one. It will not match the number your dispatcher reads on the radio."
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          number assigned by OpenFirehouse
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5 truncate">{alert.address}</p>
                    {alert.details && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{alert.details}</p>}
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">{fmtTime(alert.dispatched_at)}</p>
                  </div>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate && onNavigate('command')}
                      className="flex-shrink-0 text-xs font-bold text-red-700 dark:text-red-300 hover:underline"
                    >
                      Open Board →
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Connections Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'connections' && (
        <div className="space-y-3">
          {connections.length === 0 && (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">
              <Plug size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No CAD connections configured.</p>
              {/* The remedy named here has to be one the reader can actually take: only a chief
                  can add a connection, so telling everyone else to add one is a dead end. */}
              <p className="text-xs mt-1">
                {canManage
                  ? 'Add a connection to start importing dispatch data.'
                  : 'A chief can add one — dispatches will start importing as soon as they do.'}
              </p>
            </div>
          )}

          {connections.map(conn => {
            const vendor = CAD_VENDORS.find(v => v.id === conn.vendorId);
            const isOpen = expandedConn === conn.id;
            return (
              <div key={conn.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  role="button" tabIndex={0} aria-expanded={isOpen} aria-label={`Toggle details for ${conn.name}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedConn(isOpen ? null : conn.id); } }}
                  onClick={() => setExpandedConn(isOpen ? null : conn.id)}
                >
                  <VendorLogo logo={vendor?.logo ?? '?'} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{conn.name}</p>
                      <StatusDot status={conn.status} />
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        conn.status === 'Active'   ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' :
                        conn.status === 'Error'    ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' :
                        conn.status === 'Testing'  ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' :
                        'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}>{conn.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {vendor?.name} · Sync: {conn.syncInterval} · Last: {fmtTime(conn.lastSync)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-black text-blue-700 dark:text-blue-300">{conn.incidentsImported}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">incidents</p>
                  </div>
                  {isOpen
                    ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" />
                    : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 bg-gray-50 dark:bg-gray-950 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {[
                        { l: 'Host / Endpoint', v: conn.host || '—' },
                        { l: 'Auth Method',     v: vendor?.authMethod ?? '—' },
                        { l: 'Sync Interval',   v: conn.syncInterval },
                      ].map(({ l, v }) => (
                        <div key={l}>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{l}</p>
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 font-mono">{v}</p>
                        </div>
                      ))}
                    </div>
                    {conn.notes && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2">{conn.notes}</p>
                    )}
                    {canManage && (
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(conn)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800">
                          <Settings size={11} /> Configure
                        </button>
                        <button
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                          <RefreshCw size={11} /> Sync Now
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Import Log Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'log' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1.2fr_0.8fr_0.5fr_2fr] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <span>Timestamp</span><span>Connection</span><span>Records</span><span>Result</span>
          </div>
          {importLog.map(entry => {
            const conn = connections.find(c => c.id === entry.connectionId);
            return (
              <div key={entry.id} className="grid grid-cols-[1.2fr_0.8fr_0.5fr_2fr] gap-4 px-5 py-2.5 border-b border-gray-50 last:border-b-0 items-center">
                <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{fmtTime(entry.timestamp)}</span>
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{conn?.name ?? '—'}</span>
                <span className={`text-xs font-bold ${entry.records > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>
                  {entry.records > 0 ? `+${entry.records}` : '—'}
                </span>
                <div className="flex items-center gap-2">
                  {entry.status === 'success'
                    ? <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                    : <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
                  <span className="text-xs text-gray-600 dark:text-gray-300">{entry.message}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Recent Imports Tab ───────────────────────────────────────────────── */}
      {activeTab === 'incidents' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_2fr_1.5fr_1.5fr_0.7fr] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <span>Inc. Number</span><span>Type</span><span>Address</span><span>Dispatch</span><span>Units</span>
          </div>
          {cadRecentIncidents.map(inc => (
            <div key={inc.id} className="grid grid-cols-[1fr_2fr_1.5fr_1.5fr_0.7fr] gap-4 px-5 py-3 border-b border-gray-50 last:border-b-0 items-center">
              <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{inc.id}</span>
              <span className="text-xs text-gray-700 dark:text-gray-300">{inc.type}</span>
              <span className="text-xs text-gray-600 dark:text-gray-300">{inc.address}</span>
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{fmtTime(inc.dispatchTime)}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{inc.units.length}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Supported Vendors Tab ────────────────────────────────────────────── */}
      {activeTab === 'vendors' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CAD_VENDORS.map(v => (
            <div key={v.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 space-y-2">
              <div className="flex items-center gap-3">
                <VendorLogo logo={v.logo} size="lg" />
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{v.name}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Auth: {v.authMethod}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{v.description}</p>
              <div className="flex flex-wrap gap-1">
                {v.features.map(f => (
                  <span key={f} className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full px-2 py-0.5">{f}</span>
                ))}
              </div>
              {v.docsUrl && (
                <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">{v.docsUrl}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Field Mapping Tab ────────────────────────────────────────────────── */}
      {activeTab === 'fieldmap' && (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
            Field mapping tells OpenFirehouse how to translate your CAD system&apos;s field names into the OpenFirehouse
            incident data model. This is configured per connection and handled during the import process.
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="grid grid-cols-[1fr_1.5fr_2fr] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">
              <span>OpenFirehouse Field</span><span>Label</span><span>Common CAD Field Names</span>
            </div>
            {FIELD_MAP_REFERENCE.map(row => (
              <div key={row.freestation} className="grid grid-cols-[1fr_1.5fr_2fr] gap-4 px-5 py-2.5 border-b border-gray-50 last:border-b-0 items-center">
                <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{row.freestation}</span>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{row.label}</span>
                <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{row.examples}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {formOpen && (
        <ConnectionForm
          initial={editing}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
