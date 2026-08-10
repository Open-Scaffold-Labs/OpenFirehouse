import { useState, useEffect, useCallback } from 'react';
import { MonitorSmartphone, Plus, Copy, Trash2, Radio, Clock } from 'lucide-react';
import { api } from '../utils/api';

// Chief-facing management for STATION DISPLAYS (migration 0074) — the registered
// upgrade of the shared TV PIN. A display is bound to ONE station at PAIRING time
// via a single-use code (never inferred). Market bar (2026 pass, Q4, unanimous):
// station-scoped displays paired by code at setup. Create → show the pairing code
// + launch link ONCE; list bound displays; revoke. Server: routes/stationDisplays.js.

function fmt(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return '—'; }
}

export default function StationDisplaysPanel() {
  const [stations, setStations] = useState([]);
  const [displays, setDisplays] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [stationId, setStationId] = useState('');
  const [label, setLabel]       = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState(null);
  const [issued, setIssued]     = useState(null); // { station_name, label, pairing_code, launch_url }
  const [copied, setCopied]     = useState('');

  const loadDisplays = useCallback(async () => {
    try {
      const res = await api.get('/api/station-displays');
      setDisplays(res?.data ?? []);
    } catch (_) { /* keep prior list */ }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const st = await api.get('/api/stations').catch(() => null);
        setStations(st?.data ?? []);
      } catch (_) { /* noop */ }
      await loadDisplays();
      setLoading(false);
    })();
  }, [loadDisplays]);

  async function handleCreate() {
    setError(null);
    if (!stationId) { setError('Choose which station this display belongs to.'); return; }
    setCreating(true);
    try {
      const res = await api.post('/api/station-displays', {
        station_id: Number(stationId),
        label: label.trim() || null,
      });
      const d = res?.data;
      if (d?.pairing_code) {
        const launch = `${window.location.origin}/tv?pair=${encodeURIComponent(d.pairing_code)}`;
        setIssued({ station_name: d.station_name, label: d.label, pairing_code: d.pairing_code, launch_url: launch, expires: d.pairing_expires_at });
        setLabel('');
        await loadDisplays();
      } else {
        setError('Could not create the display. Try again.');
      }
    } catch (err) {
      setError(err?.message || 'Could not create the display.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id) {
    if (!window.confirm('Revoke this display? Its screen will stop updating until re-paired.')) return;
    try {
      await api.post(`/api/station-displays/${id}/revoke`, {});
      await loadDisplays();
    } catch (_) { /* surfaced on next refresh */ }
  }

  function copy(text, key) {
    try { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 2000); } catch (_) { /* noop */ }
  }

  const isMultiHouse = stations.length > 1;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
        <MonitorSmartphone size={16} className="text-red-600 dark:text-red-400" />
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Station Displays</h2>
      </div>
      <div className="px-6 py-5 space-y-5">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          A station display is bound to <strong>one station</strong> with a single-use pairing code —
          the screen then shows only that station's crew, apparatus, and dispatches. This is the
          registered upgrade of the shared TV PIN: pair once and the device is remembered.
        </p>

        {/* Create */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Add a display</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
            >
              <option value="">{isMultiHouse ? 'Choose a station…' : 'Station'}</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. Day Room TV)"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center justify-center gap-1.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              <Plus size={14} /> {creating ? 'Creating…' : 'Create + get code'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        {/* Issued code (shown once) */}
        {issued && (
          <div className="rounded-xl border border-green-300 dark:border-green-800 bg-green-50/70 dark:bg-green-950/40 p-4">
            <p className="text-xs font-bold text-green-800 dark:text-green-300 uppercase tracking-wider mb-2">
              Pairing code for {issued.station_name}{issued.label ? ` · ${issued.label}` : ''}
            </p>
            <p className="text-2xl font-mono font-black tracking-widest text-gray-900 dark:text-gray-100 mb-2">{issued.pairing_code}</p>
            <p className="text-[11px] text-green-700 dark:text-green-400 mb-3">
              Shown once. Open the launch link on the display, or enter this code there. It expires: {fmt(issued.expires)}.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => copy(issued.pairing_code, 'code')}
                className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-lg text-xs font-semibold">
                <Copy size={12} /> {copied === 'code' ? 'Copied!' : 'Copy code'}
              </button>
              <button type="button" onClick={() => copy(issued.launch_url, 'url')}
                className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-lg text-xs font-semibold">
                <Copy size={12} /> {copied === 'url' ? 'Copied!' : 'Copy launch link'}
              </button>
              <button type="button" onClick={() => window.open(issued.launch_url, '_blank')}
                className="flex items-center gap-1.5 bg-green-600/80 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
                <Radio size={12} /> Launch on this screen
              </button>
              <button type="button" onClick={() => setIssued(null)}
                className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1.5">Done</button>
            </div>
          </div>
        )}

        {/* List */}
        <div>
          <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Paired displays</p>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : displays.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No displays yet. Create one above.</p>
          ) : (
            <div className="space-y-2">
              {displays.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {d.station_name}{d.label ? ` · ${d.label}` : ''}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded-full font-bold ${
                        d.status === 'paired' ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300'
                        : d.status === 'revoked' ? 'bg-gray-200 dark:bg-gray-800 text-gray-500'
                        : 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'}`}>
                        {d.status}
                      </span>
                      <span className="flex items-center gap-1"><Clock size={10} /> last seen {fmt(d.last_seen_at)}</span>
                    </p>
                  </div>
                  {d.status !== 'revoked' && (
                    <button type="button" onClick={() => handleRevoke(d.id)}
                      className="shrink-0 flex items-center gap-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors">
                      <Trash2 size={12} /> Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
