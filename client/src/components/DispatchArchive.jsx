/**
 * DispatchArchive.jsx — every dispatched call, searchable by date and by unit.
 *
 * This is the department's RETENTION SYSTEM OF RECORD. The federal reporting
 * system went dark in Feb 2026 and USFA now tells departments without a local RMS
 * to "establish a system of record" for their historical incident data. This screen
 * is that system: the run history a chief reaches for when the ISO rater asks about
 * response times, when a grant application wants three years of call volume, when a
 * subpoena asks for every call to an address, or when a volunteer's service credit
 * is challenged.
 *
 * Two invariants the UI must honor:
 *
 *  1. THE UNIT FILTER IS A PICKER, NOT A TEXT BOX. The user chooses a rig from the
 *     fleet and we match on apparatus_id. A text box invites "Engine 1", which in a
 *     substring search silently drags in Engine 10 / Engine 100 AND misses calls
 *     logged as "E1". Verified on our own data: the string search reported Engine 1
 *     ran 18 calls; it actually ran 19.
 *
 *  2. DATES ARE LOCAL. We convert the user's chosen day to instants HERE and send
 *     ISO timestamps. Filtering by UTC calendar date puts an 8pm-Eastern call on the
 *     wrong day.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Archive, Search, Calendar, Truck, Download, X, ChevronRight,
  AlertTriangle, Clock, MapPin, Loader2,
} from 'lucide-react';
import { api } from '../utils/api';

/* Local day boundaries → ISO instants. The whole point of doing this here is that
 * the browser knows the user's timezone and the server must not guess it. */
const startOfLocalDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString(); };
const endOfLocalDay   = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return new Date(x.getTime() + 1).toISOString(); };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

const PRESETS = [
  { id: '7d',   label: 'Last 7 days',  from: () => daysAgo(7)  },
  { id: '30d',  label: 'Last 30 days', from: () => daysAgo(30) },
  { id: '90d',  label: 'Last 90 days', from: () => daysAgo(90) },
  { id: '1y',   label: 'Last year',    from: () => daysAgo(365) },
  { id: 'all',  label: 'All time',     from: () => null },
];

const fmtDateTime = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

export default function DispatchArchive() {
  const [preset, setPreset]   = useState('30d');   // never open on an unbounded scan
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [selectedUnits, setSelectedUnits] = useState([]);   // apparatus ids
  const [selectedTokens, setSelectedTokens] = useState([]); // unresolved/mutual-aid
  const [q, setQ] = useState('');

  const [fleet, setFleet] = useState([]);
  const [unresolved, setUnresolved] = useState([]);
  const [rows, setRows]   = useState([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  // The active date window, as instants.
  const range = useMemo(() => {
    if (preset === 'custom') {
      return {
        from: customFrom ? startOfLocalDay(customFrom) : null,
        to:   customTo   ? endOfLocalDay(customTo)     : null,
      };
    }
    const p = PRESETS.find(x => x.id === preset);
    const f = p?.from();
    return { from: f ? startOfLocalDay(f) : null, to: null };
  }, [preset, customFrom, customTo]);

  const params = useCallback((extra = {}) => {
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to)   p.set('to', range.to);
    if (selectedUnits.length)  p.set('unitIds', selectedUnits.join(','));
    if (selectedTokens.length) p.set('unitTokens', selectedTokens.join(','));
    if (q.trim()) p.set('q', q.trim());
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p;
  }, [range, selectedUnits, selectedTokens, q]);

  useEffect(() => {
    api.get('/api/cad/archive/units')
      .then(r => { setFleet(r.data?.fleet || []); setUnresolved(r.data?.unresolved || []); })
      .catch(() => { /* the filter degrades to date + text; the archive still works */ });
  }, []);

  const search = useCallback(async () => {
    setLoading(true); setError(null); setCursor(null);
    try {
      const r = await api.get(`/api/cad/archive?${params({ limit: 50 })}`);
      setRows(r.data || []);
      setTotal(r.total || 0);
      setHasMore(!!r.hasMore);
      setCursor(r.nextCursor);
    } catch (e) {
      setError('Could not search the archive. Try narrowing the date range.');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { search(); }, [search]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      // Keyset, not offset — a new call landing mid-scroll can't shift the page
      // and make us skip or repeat a row.
      const r = await api.get(`/api/cad/archive?${params({
        limit: 50, cursorTs: cursor.ts, cursorId: cursor.id })}`);
      setRows(prev => [...prev, ...(r.data || [])]);
      setHasMore(!!r.hasMore);
      setCursor(r.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleUnit = (id) => setSelectedUnits(u =>
    u.includes(id) ? u.filter(x => x !== id) : [...u, id]);
  const toggleToken = (t) => setSelectedTokens(u =>
    u.includes(t) ? u.filter(x => x !== t) : [...u, t]);

  const clearFilters = () => {
    setPreset('30d'); setCustomFrom(''); setCustomTo('');
    setSelectedUnits([]); setSelectedTokens([]); setQ('');
  };
  const filtersActive = selectedUnits.length || selectedTokens.length || q.trim() || preset !== '30d';

  const exportUrl = `/api/cad/archive/export.csv?${params()}`;

  const windowLabel = preset === 'custom'
    ? `${customFrom || '…'} → ${customTo || 'today'}`
    : PRESETS.find(p => p.id === preset)?.label;

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Archive className="w-7 h-7 text-red-500" />
          <h1 className="text-3xl font-bold">Dispatch Archive</h1>
        </div>
        <p className="text-gray-400">
          Every dispatched call, searchable by date and by unit — your department's system of record.
        </p>
      </header>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 mb-5 space-y-4">
        {/* Date */}
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                preset === p.id
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >{p.label}</button>
          ))}
          <button
            onClick={() => setPreset('custom')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              preset === 'custom' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >Custom</button>
          {preset === 'custom' && (
            <span className="flex items-center gap-2 ml-1">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                     className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm" />
              <span className="text-gray-500 text-sm">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                     className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm" />
            </span>
          )}
        </div>

        {/* Unit — a PICKER, never a text box (see the file header) */}
        <div className="flex items-start gap-2">
          <Truck className="w-4 h-4 text-gray-500 mt-2 shrink-0" />
          <div className="flex flex-wrap gap-1.5">
            {fleet.map(u => (
              <button
                key={u.id}
                onClick={() => toggleUnit(u.id)}
                title={`${u.run_count} call${u.run_count === '1' ? '' : 's'} on record`}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition ${
                  selectedUnits.includes(u.id)
                    ? 'bg-red-600 border-red-500 text-white'
                    : 'bg-gray-800/70 border-gray-700 text-gray-300 hover:border-gray-600'}`}
              >
                {u.designation}
                <span className="ml-1.5 opacity-60 font-normal">{u.run_count}</span>
              </button>
            ))}
            {/* Units CAD sent that aren't in the fleet — mutual aid, or an abbreviation
                we refused to guess at. Shown so the gaps are visible and searchable,
                never quietly dropped. */}
            {unresolved.map(u => (
              <button
                key={u.unit_norm}
                onClick={() => toggleToken(u.unit_norm)}
                title={u.ambiguous
                  ? 'Ambiguous abbreviation — map it to a rig in Apparatus settings'
                  : 'Not in your fleet (mutual aid)'}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition flex items-center gap-1 ${
                  selectedTokens.includes(u.unit_norm)
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-gray-800/40 border-dashed border-gray-700 text-gray-400 hover:border-amber-600/60'}`}
              >
                {u.ambiguous && <AlertTriangle className="w-3 h-3" />}
                {u.unit_raw}
                <span className="opacity-60 font-normal">{u.run_count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Text + actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search nature, address, comments, CAD id…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm
                         focus:outline-none focus:border-red-600"
            />
          </div>
          {filtersActive ? (
            <button onClick={clearFilters}
              className="px-3 py-2 rounded-lg text-sm bg-gray-800 hover:bg-gray-700 flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          ) : null}
          <a href={exportUrl}
             className="px-3 py-2 rounded-lg text-sm bg-gray-800 hover:bg-gray-700 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </a>
        </div>
      </div>

      {/* ── Result count — always state the window, never imply "everything" ── */}
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-sm text-gray-400">
          {loading ? 'Searching…' : (
            <>
              <span className="text-white font-semibold">{total.toLocaleString()}</span>
              {' '}call{total === 1 ? '' : 's'} · <span className="text-gray-300">{windowLabel}</span>
              {selectedUnits.length > 0 && (
                <> · {selectedUnits.map(id => fleet.find(f => f.id === id)?.designation).filter(Boolean).join(', ')}</>
              )}
            </>
          )}
        </p>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-900 rounded-lg p-4 text-red-200 text-sm mb-4">{error}</div>
      )}

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl">
          <Archive className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No calls match these filters.</p>
          <p className="text-gray-600 text-sm mt-1">Widen the date range, or clear the unit filter.</p>
        </div>
      ) : (
        <div className="border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/80 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Dispatched</th>
                <th className="text-left px-4 py-3 font-semibold">Nature</th>
                <th className="text-left px-4 py-3 font-semibold">Address (as dispatched)</th>
                <th className="text-left px-4 py-3 font-semibold">Units</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isOpen = expanded === r.id;
                return (
                  <>
                    <tr
                      key={r.id}
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="border-t border-gray-800 hover:bg-gray-900/50 cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                        {fmtDateTime(r.dispatched_at)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-white">{r.description || '—'}</td>
                      <td className="px-4 py-3 text-gray-300">{r.address || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(r.units || []).length === 0 && <span className="text-gray-600">—</span>}
                          {(r.units || []).map((u, i) => (
                            <span key={i}
                              className={`px-1.5 py-0.5 rounded text-xs font-semibold border ${
                                u.ambiguous
                                  ? 'bg-amber-950/40 border-amber-800 text-amber-300'
                                  : u.apparatusId
                                    ? 'bg-red-950/40 border-red-900 text-red-300'
                                    : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                              title={u.ambiguous ? 'Ambiguous — needs mapping'
                                    : u.apparatusId ? '' : 'Not in your fleet (mutual aid)'}
                            >{u.unit}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-gray-600">
                        <ChevronRight className={`w-4 h-4 transition ${isOpen ? 'rotate-90' : ''}`} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.id}-d`} className="bg-gray-950/60 border-t border-gray-800">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="grid md:grid-cols-3 gap-6">
                            <div>
                              <p className="text-xs uppercase text-gray-500 font-semibold mb-1">CAD comments</p>
                              <p className="text-gray-300 whitespace-pre-wrap">{r.details || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-gray-500 font-semibold mb-1">Per-unit timeline</p>
                              {/* Nullable on purpose: a unit cancelled en route never arrives,
                                  and that gap is DATA, not an error to be papered over. */}
                              <table className="text-xs w-full">
                                <thead className="text-gray-600">
                                  <tr><th className="text-left">Unit</th><th className="text-left">En route</th>
                                      <th className="text-left">On scene</th><th className="text-left">Cleared</th></tr>
                                </thead>
                                <tbody>
                                  {(r.units || []).map((u, i) => (
                                    <tr key={i} className="text-gray-300">
                                      <td className="pr-3 py-0.5 font-semibold">{u.unit}</td>
                                      <td className="pr-3">{u.enrouteAt ? fmtDateTime(u.enrouteAt) : '—'}</td>
                                      <td className="pr-3">{u.arrivedAt ? fmtDateTime(u.arrivedAt) : '—'}</td>
                                      <td>{u.clearedAt ? fmtDateTime(u.clearedAt) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="space-y-2 text-xs">
                              <p className="text-gray-500 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                Cleared: <span className="text-gray-300">{r.cleared_at ? fmtDateTime(r.cleared_at) : 'still active'}</span>
                              </p>
                              <p className="text-gray-500 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" />
                                CAD id: <span className="text-gray-300 font-mono">{r.alert_id || '—'}</span>
                              </p>
                              {/* The verbatim CAD string, always available. If our parser is
                                  ever wrong, the truth is still right here. */}
                              <p className="text-gray-600">
                                Units as sent by CAD: <span className="font-mono text-gray-400">{r.units_raw || '—'}</span>
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>

          {hasMore && (
            <div className="p-3 bg-gray-900/40 border-t border-gray-800 text-center">
              <button onClick={loadMore} disabled={loadingMore}
                className="px-4 py-2 rounded-lg text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50">
                {loadingMore ? 'Loading…' : `Load more (${rows.length} of ${total.toLocaleString()})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
