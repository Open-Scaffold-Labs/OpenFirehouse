// RadioFeed.jsx — Live radio communications feed
// Used on The Board, CommandBoard, and as a standalone Radio Log page.
// Connects to the WebSocket radio feed and displays transcribed radio traffic.

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Radio, Wifi, WifiOff, Volume2, AlertTriangle,
  Search, Filter, Play,
  Pause, Zap, Clock, RefreshCw, TestTube2,
} from 'lucide-react';
import { useRadioFeed } from '../hooks/useRadioFeed';
import { api } from '../utils/api';

// ─── Talkgroup color mapping ─────────────────────────────────────────────────
const TG_COLORS = {
  'Fire Dispatch':     { bg: 'bg-red-100 dark:bg-red-950/50',    text: 'text-red-800 dark:text-red-300',    border: 'border-red-300 dark:border-red-800',    dot: 'bg-red-500' },
  'Fireground Tac 1':  { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-800 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-800', dot: 'bg-orange-500' },
  'Fireground Tac 2':  { bg: 'bg-amber-100 dark:bg-amber-950/50',  text: 'text-amber-800 dark:text-amber-300',  border: 'border-amber-300 dark:border-amber-800',  dot: 'bg-amber-500' },
  'EMS':               { bg: 'bg-green-100 dark:bg-green-950/50',   text: 'text-green-800 dark:text-green-300',  border: 'border-green-300 dark:border-green-800',  dot: 'bg-green-500' },
  'Mutual Aid':        { bg: 'bg-purple-100 dark:bg-purple-950/50',  text: 'text-purple-800 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-800', dot: 'bg-purple-500' },
  'Command':           { bg: 'bg-blue-100 dark:bg-blue-950/50',    text: 'text-blue-800 dark:text-blue-300',   border: 'border-blue-300 dark:border-blue-800',   dot: 'bg-blue-500' },
};
const DEFAULT_TG = { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-300 dark:border-gray-700', dot: 'bg-gray-400' };

function getTgColor(tg) {
  return TG_COLORS[tg] || DEFAULT_TG;
}

const PRIORITY_STYLES = {
  emergency: { ring: 'ring-2 ring-red-400 bg-red-50 dark:bg-red-950/50',  dot: 'bg-red-500 animate-pulse', label: 'EMERGENCY' },
  urgent:    { ring: 'ring-1 ring-amber-300 bg-amber-50 dark:bg-amber-950/50', dot: 'bg-amber-500', label: 'URGENT' },
  normal:    { ring: '', dot: 'bg-emerald-500', label: '' },
};

// ─── Time formatting ─────────────────────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeAgo(ts) {
  if (!ts) return '';
  const secs = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return fmtDate(ts);
}

// ─── Single radio entry card ─────────────────────────────────────────────────
function RadioEntry({ entry, compact = false }) {
  const tg = getTgColor(entry.talkgroup);
  const pri = PRIORITY_STYLES[entry.priority] || PRIORITY_STYLES.normal;

  if (compact) {
    return (
      <div className={`flex items-start gap-2 py-1.5 px-2 rounded-lg ${pri.ring} transition-all duration-300`}>
        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${pri.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tg.bg} ${tg.text}`}>
              {entry.talkgroup || 'Unknown'}
            </span>
            <span className="text-[10px] text-gray-400 tabular-nums">{fmtTime(entry.timestamp)}</span>
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug">{entry.transcript}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${pri.ring || 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'} p-3 transition-all duration-300 hover:shadow-sm`}>
      <div className="flex items-start gap-3">
        {/* Priority dot + timestamp */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
          <div className={`w-2.5 h-2.5 rounded-full ${pri.dot}`} />
          <span className="text-[10px] text-gray-400 tabular-nums whitespace-nowrap">{fmtTime(entry.timestamp)}</span>
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${tg.bg} ${tg.text} border ${tg.border}`}>
              {entry.talkgroup || 'Unknown'}
            </span>
            {entry.is_dispatch && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white uppercase">
                Dispatch
              </span>
            )}
            {pri.label && entry.priority !== 'normal' && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${entry.priority === 'emergency' ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'}`}>
                {pri.label}
              </span>
            )}
            {entry.duration_sec > 0 && (
              <span className="text-[10px] text-gray-400">{Math.round(entry.duration_sec)}s</span>
            )}
          </div>
          <p className={`text-sm leading-relaxed ${entry.confidence < 0.8 ? 'text-gray-500 dark:text-gray-400 italic' : 'text-gray-800 dark:text-gray-100'}`}>
            {entry.transcript}
          </p>
          {entry.confidence < 0.8 && (
            <p className="text-[10px] text-gray-400 mt-1">Low confidence ({Math.round(entry.confidence * 100)}%)</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TV ticker: horizontal scrolling radio feed for TV display ───────────────
export function RadioTicker({ entries = [], pin }) {
  const feedData = useRadioFeed({ pin, limit: 5, enabled: !!pin });
  const displayEntries = feedData.entries.length > 0 ? feedData.entries : entries;

  if (displayEntries.length === 0) return null;

  return (
    <div className="bg-gray-900/95 border-t border-gray-700 px-6 py-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Radio size={16} className="text-red-400" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Radio</span>
          {feedData.connected && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </div>
        <div className="overflow-hidden flex-1">
          <div className="flex gap-6 animate-scroll-left">
            {displayEntries.map((entry) => {
              const tg = getTgColor(entry.talkgroup);
              return (
                <div key={entry.id} className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${tg.bg} ${tg.text}`}>
                    {entry.talkgroup}
                  </span>
                  <span className="text-sm text-gray-300 dark:text-gray-600 max-w-[500px] truncate">{entry.transcript}</span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">{fmtTime(entry.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Full-page Radio Log ─────────────────────────────────────────────────────
export default function RadioLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tgFilter, setTgFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const { entries: liveEntries, connected, simulate } = useRadioFeed({
    limit: 100,
    enabled: true,
  });

  // Load historical entries
  useEffect(() => {
    setLoading(true);
    api.get('/api/radio/recent?limit=200')
      .then(r => {
        const data = r?.data ?? r ?? [];
        setEntries(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Merge live entries with loaded entries (dedupe by id)
  const allEntries = useMemo(() => {
    const map = new Map();
    for (const e of liveEntries) map.set(e.id, e);
    for (const e of entries) if (!map.has(e.id)) map.set(e.id, e);
    return [...map.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [entries, liveEntries]);

  // Filter
  const filtered = useMemo(() => {
    return allEntries.filter(e => {
      if (search && !e.transcript.toLowerCase().includes(search.toLowerCase())) return false;
      if (tgFilter && e.talkgroup !== tgFilter) return false;
      return true;
    });
  }, [allEntries, search, tgFilter]);

  // Unique talkgroups for filter
  const talkgroups = useMemo(() => {
    return [...new Set(allEntries.map(e => e.talkgroup).filter(Boolean))].sort();
  }, [allEntries]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center">
            <Radio size={20} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 dark:text-gray-100">Radio Log</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Live and historical radio communications</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {connected ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
              <WifiOff size={12} />
              Offline
            </span>
          )}
          <button
            onClick={simulate}
            className="flex items-center gap-1.5 text-xs bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <TestTube2 size={12} />
            Simulate
          </button>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search radio transcripts..."
            aria-label="Search radio transcripts"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <select
          value={tgFilter}
          onChange={e => setTgFilter(e.target.value)}
          aria-label="Filter by talkgroup"
          className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">All Talkgroups</option>
          {talkgroups.map(tg => (
            <option key={tg} value={tg}>{tg}</option>
          ))}
        </select>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500 dark:text-gray-400">
        <span>{filtered.length} transmission{filtered.length !== 1 ? 's' : ''}</span>
        {allEntries.length > 0 && (
          <span>Latest: {timeAgo(allEntries[0].timestamp)}</span>
        )}
      </div>

      {/* Entries */}
      {loading ? (
        <div className="py-12 text-center">
          <RefreshCw size={24} className="mx-auto text-gray-300 dark:text-gray-600 animate-spin mb-2" />
          <p className="text-sm text-gray-400">Loading radio log...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <Radio size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {search || tgFilter ? 'No matching transmissions' : 'No radio traffic recorded yet'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {search || tgFilter
              ? 'Try adjusting your search or filters'
              : 'Connect your station radio hardware or use the Simulate button to test'}
          </p>
          {!search && !tgFilter && (
            <button
              onClick={simulate}
              className="mt-4 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Simulate Radio Traffic
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <RadioEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
