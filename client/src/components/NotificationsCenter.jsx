import { useState, useMemo } from 'react';
import {
  Bell, BellOff, AlertTriangle, AlertCircle, Info,
  CheckCircle2, Trash2, X, Settings2, ChevronDown,
  Truck, GraduationCap, Package, CalendarDays, Filter, Brain,
  BookOpen, MessageSquare, User, Clock,
} from 'lucide-react';
import { useAlerts } from '../hooks/useAlerts';

// How early to warn (days). The server applies these defaults; the threshold
// panel below can override them per-request via query params.
const DEFAULT_THRESHOLDS = { certExpiry: 30, apparatusService: 30, assetInspection: 30, shiftMinCrew: 3 };
import { useWorkflowAlerts } from '../hooks/useWorkflowAlerts';
import { useBulletinAlerts } from '../hooks/useBulletinAlerts';
import { getStoredUser } from '../utils/api';

// ─── severity config ──────────────────────────────────────────────────────────

const SEV = {
  critical: {
    label: 'Critical',
    bg:    'bg-red-50 dark:bg-red-950/50',
    border:'border-red-200 dark:border-red-900',
    icon:  AlertTriangle,
    iconColor: 'text-red-500',
    badge: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300',
    dot:   'bg-red-500',
  },
  warning: {
    label: 'Warning',
    bg:    'bg-amber-50 dark:bg-amber-950/50',
    border:'border-amber-200 dark:border-amber-900',
    icon:  AlertCircle,
    iconColor: 'text-amber-500',
    badge: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
    dot:   'bg-amber-500',
  },
  info: {
    label: 'Info',
    bg:    'bg-blue-50 dark:bg-blue-950/50',
    border:'border-blue-200 dark:border-blue-900',
    icon:  Info,
    iconColor: 'text-blue-500',
    badge: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    dot:   'bg-blue-400',
  },
};

const CAT_ICONS = {
  Training: GraduationCap,
  Apparatus: Truck,
  Assets: Package,
  Schedule: CalendarDays,
  Workflows: Brain,
};

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, dot, sub }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 flex items-start gap-3">
      <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${dot}`} />
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── single alert card ────────────────────────────────────────────────────────

function AlertCard({ alert, dismissed, onDismiss, onRestore, onNavigate }) {
  const s = SEV[alert.severity] ?? SEV.info;
  const Icon = s.icon;
  const CatIcon = CAT_ICONS[alert.category] ?? Bell;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border transition-opacity ${s.bg} ${s.border} ${dismissed ? 'opacity-40' : ''}`}>
      <Icon size={16} className={`${s.iconColor} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.badge}`}>{s.label}</span>
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <CatIcon size={11} /> {alert.category}
          </span>
        </div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-1">{alert.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{alert.detail}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!dismissed && (
          <button
            onClick={() => onNavigate(alert.module)}
            className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium px-2 py-1"
          >
            View
          </button>
        )}
        {dismissed ? (
          <button
            onClick={() => onRestore(alert.id)}
            title="Restore"
            aria-label="Restore alert"
            className="p-1.5 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded transition-colors"
          >
            <CheckCircle2 size={14} />
          </button>
        ) : (
          <button
            onClick={() => onDismiss(alert.id)}
            title="Dismiss"
            aria-label="Dismiss alert"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 rounded transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── threshold settings panel ─────────────────────────────────────────────────

function ThresholdPanel({ thresholds, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 size={15} className="text-red-600 dark:text-red-400" />
          Alert Thresholds
        </div>
        <ChevronDown size={15} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 border-t border-gray-100 dark:border-gray-700 pt-4">
          {[
            { key: 'certExpiry',       label: 'Cert Expiry Warning',      unit: 'days before' },
            { key: 'apparatusService', label: 'Apparatus Service Warning', unit: 'days before' },
            { key: 'assetInspection',  label: 'Asset Inspection Warning',  unit: 'days before' },
            { key: 'shiftMinCrew',     label: 'Minimum Crew Size',         unit: 'members'     },
          ].map(({ key, label, unit }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={key === 'shiftMinCrew' ? 20 : 365}
                  value={thresholds[key]}
                  onChange={(e) => onChange(key, Number(e.target.value))}
                  className="w-20 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
                />
                <span className="text-xs text-gray-400">{unit}</span>
              </div>
            </div>
          ))}
          <div className="sm:col-span-2 lg:col-span-4 text-xs text-gray-400">
            Changes apply immediately. Alerts are re-evaluated each time you visit this page.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Unread Bulletin Row ──────────────────────────────────────────────────────

function UnreadBulletinRow({ bulletin, onRead, type }) {
  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl border bg-white dark:bg-gray-900 border-blue-100 dark:border-blue-900 hover:bg-blue-50/40 transition-colors cursor-pointer"
      onClick={() => onRead(bulletin)}
      role="button"
      tabIndex={0}
      aria-label={`Read ${type === 'notice' ? 'daily notice' : 'bulletin'}: ${bulletin.title}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRead(bulletin); } }}
    >
      {type === 'notice'
        ? <Bell size={14} className="text-rose-500 mt-0.5 shrink-0" />
        : <BookOpen size={14} className="text-blue-500 mt-0.5 shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            type === 'notice' ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300' : 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
          }`}>
            {type === 'notice' ? 'Daily Notice' : 'Bulletin'}
          </span>
        </div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{bulletin.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
          <User size={10} /> {bulletin.author_name || 'Station'}
          <Clock size={10} /> {fmtDate(bulletin.created_at)}
        </p>
      </div>
      <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium px-2 py-1 flex-shrink-0">
        Read
      </button>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function NotificationsCenter({ onNavigate, user }) {
  const [thresholds, setThresholds] = useState({ ...DEFAULT_THRESHOLDS });
  const [dismissed,  setDismissed]  = useState(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [filterSev,  setFilterSev]  = useState('');
  const [filterCat,  setFilterCat]  = useState('');

  // Live, server-scoped department alerts (rank + cert crew-scope applied server-side).
  const { alerts: staticAlerts, error: alertsError } = useAlerts(user, thresholds);
  const { alerts: workflowAlerts } = useWorkflowAlerts();

  // Bulletin / Daily Notice unread tracking — uses shared cache, no extra fetch
  const {
    unreadDaily, unreadBulletin,
  } = useBulletinAlerts();

  // Merge static + workflow alerts, sorted by severity then date
  const allAlerts = useMemo(() => {
    const merged = [...staticAlerts, ...workflowAlerts];
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    merged.sort((a, b) => {
      const sd = (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
      if (sd !== 0) return sd;
      return (a.date ?? '9999') > (b.date ?? '9999') ? 1 : -1;
    });
    return merged;
  }, [staticAlerts, workflowAlerts]);

  function updateThreshold(key, val) {
    setThresholds((t) => ({ ...t, [key]: val }));
  }

  function dismiss(id)  { setDismissed((s) => new Set([...s, id])); }
  function restore(id)  { setDismissed((s) => { const n = new Set(s); n.delete(id); return n; }); }
  function dismissAll() { setDismissed(new Set(allAlerts.map((a) => a.id))); }
  function clearAll()   { setDismissed(new Set()); }

  const activeAlerts    = useMemo(() => allAlerts.filter((a) => !dismissed.has(a.id)), [allAlerts, dismissed]);
  const dismissedAlerts = useMemo(() => allAlerts.filter((a) => dismissed.has(a.id)),  [allAlerts, dismissed]);

  const criticalCount = useMemo(() => activeAlerts.filter((a) => a.severity === 'critical').length, [activeAlerts]);
  const warningCount  = useMemo(() => activeAlerts.filter((a) => a.severity === 'warning').length,  [activeAlerts]);
  const infoCount     = useMemo(() => activeAlerts.filter((a) => a.severity === 'info').length,     [activeAlerts]);

  const categories = useMemo(() => [...new Set(allAlerts.map((a) => a.category))].sort(), [allAlerts]);

  const visibleActive = useMemo(() => {
    let r = activeAlerts;
    if (filterSev) r = r.filter((a) => a.severity === filterSev);
    if (filterCat) r = r.filter((a) => a.category === filterCat);
    return r;
  }, [activeAlerts, filterSev, filterCat]);

  return (
    <div className="space-y-6">

      {/* header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Notifications &amp; Alerts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">All active alerts across every module, in one place.</p>
        </div>
        {activeAlerts.length > 0 && (
          <button
            onClick={dismissAll}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <BellOff size={14} /> Dismiss All
          </button>
        )}
      </div>

      {/* Load-failure banner — a failed fetch must NEVER read as "all clear." */}
      {alertsError && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={15} className="shrink-0" />
          Couldn’t refresh alerts just now — showing the last loaded results. Check your connection; this list may be out of date.
        </div>
      )}

      {/* stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total Active"   value={activeAlerts.length}  dot="bg-gray-400"   sub="across all modules" />
        <StatCard label="Critical"       value={criticalCount}        dot="bg-red-500"    sub="require immediate action" />
        <StatCard label="Warnings"       value={warningCount}         dot="bg-amber-500"  sub="need attention soon" />
        <StatCard label="Unread Messages" value={unreadDaily.length + unreadBulletin.length} dot="bg-blue-500" sub="bulletins & notices" />
        <StatCard label="Dismissed"      value={dismissedAlerts.length} dot="bg-emerald-400" sub="resolved or snoozed" />
      </div>

      {/* thresholds */}
      <ThresholdPanel thresholds={thresholds} onChange={updateThreshold} />

      {/* toolbar */}
      {allAlerts.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Filter size={13} /> Filter:
            </div>
            <select
              value={filterSev}
              aria-label="Filter by severity"
              onChange={(e) => setFilterSev(e.target.value)}
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select
              value={filterCat}
              aria-label="Filter by module"
              onChange={(e) => setFilterCat(e.target.value)}
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">All Modules</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            {(filterSev || filterCat) && (
              <button onClick={() => { setFilterSev(''); setFilterCat(''); }}
                className="text-sm text-red-600 dark:text-red-400 hover:underline">Clear filters</button>
            )}
          </div>
        </div>
      )}

      {/* active alerts */}
      <div className="space-y-3">
        {activeAlerts.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-6 py-12 text-center">
            <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">All clear!</p>
            <p className="text-sm text-gray-400 mt-1">No active alerts across any module.</p>
          </div>
        ) : visibleActive.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-6 py-8 text-center text-sm text-gray-400">
            No alerts match your current filters.
          </div>
        ) : (
          <>
            {/* group by severity */}
            {['critical', 'warning', 'info'].map((sev) => {
              const group = visibleActive.filter((a) => a.severity === sev);
              if (group.length === 0) return null;
              const s = SEV[sev];
              return (
                <div key={sev} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {s.label} ({group.length})
                    </span>
                  </div>
                  {group.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      dismissed={false}
                      onDismiss={dismiss}
                      onRestore={restore}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* dismissed section */}
      {dismissedAlerts.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowDismissed((v) => !v)}
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <ChevronDown size={15} className={`transition-transform ${showDismissed ? 'rotate-180' : ''}`} />
            {showDismissed ? 'Hide' : 'Show'} dismissed alerts ({dismissedAlerts.length})
          </button>
          {showDismissed && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button onClick={clearAll}
                  className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline">
                  <Trash2 size={12} /> Clear all dismissed
                </button>
              </div>
              {dismissedAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  dismissed={true}
                  onDismiss={dismiss}
                  onRestore={restore}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Unread Messages: Daily Notices + Bulletin Board ── */}
      {(unreadDaily.length > 0 || unreadBulletin.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Unread Messages ({unreadDaily.length + unreadBulletin.length})
            </span>
          </div>

          <p className="text-xs text-gray-400 px-1">
            Click any message to read it and remove it from notifications.
          </p>

          {/* Daily Notices */}
          {unreadDaily.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-1">
                <Bell size={11} className="text-rose-500" />
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                  Daily Notices ({unreadDaily.length})
                </span>
              </div>
              {unreadDaily.map((b) => (
                <UnreadBulletinRow
                  key={b.id}
                  bulletin={b}
                  type="notice"
                  onRead={(bul) => {
                    // Navigate to The Board and highlight the specific notice.
                    // DailyNotices component marks it read when the user expands it.
                    onNavigate?.('calendar', { highlightId: bul.id });
                  }}
                />
              ))}
            </div>
          )}

          {/* Bulletin Board */}
          {unreadBulletin.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-1">
                <BookOpen size={11} className="text-blue-500" />
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                  Bulletin Board ({unreadBulletin.length})
                </span>
              </div>
              {unreadBulletin.map((b) => (
                <UnreadBulletinRow
                  key={b.id}
                  bulletin={b}
                  type="bulletin"
                  onRead={(bul) => {
                    // Navigate to Bulletin Board and highlight the specific post.
                    // BulletinBoard marks it read when the user expands it.
                    onNavigate?.('bulletins', { highlightId: bul.id });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
