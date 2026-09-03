import { useState, useEffect, useMemo } from 'react';
import {
  Users, Truck, CalendarDays, Flame, GraduationCap, Sparkles,
  AlertTriangle, CheckCircle2, Clock, TrendingUp,
  ChevronRight, Shield, Activity, Bell, Tv, SlidersHorizontal,
  Wrench, FileText, Scale, Package, Heart, Calendar,
  BookOpen, ClipboardList, DollarSign, Siren, Check, X,
} from 'lucide-react';
import { api } from '../utils/api';
import { canClearCalls, isOfficerPlus } from '../data/auth';
import UnitStatusBoard from './UnitStatusBoard';
import ScreenErrorBoundary from './ScreenErrorBoundary';
import WeatherWidget from './WeatherWidget';
import DutyBoard from './DutyBoard';
import AIActionButton from './AIActionButton';
import { useAttentionCount } from '../hooks/useAttentionCount';
import MorningBriefPanel from './MorningBriefPanel';

// ─── helpers ─────────────────────────────────────────────────────────────────

const today = new Date();
today.setHours(0, 0, 0, 0);

function daysDiff(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr) - today) / 86_400_000);
}

function formatDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${m}/${d}/${y}`;
}

function thisWeekRange() {
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function thisMonthStr() {
  return today.toISOString().slice(0, 7);
}

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 flex items-start gap-4 text-left w-full transition-shadow hover:shadow-md ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`p-2.5 rounded-lg ${color} shrink-0`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </button>
  );
}

// ─── alert row ───────────────────────────────────────────────────────────────

function AlertItem({ icon: Icon, iconColor, bg, border, title, detail, action, onAction }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${bg} border ${border}`}>
      <Icon size={16} className={`${iconColor} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{detail}</p>
      </div>
      {action && (
        <button onClick={onAction} className="text-xs text-red-600 dark:text-red-400 hover:underline whitespace-nowrap font-medium">
          {action}
        </button>
      )}
    </div>
  );
}

// ─── section wrapper ─────────────────────────────────────────────────────────

function Panel({ title, icon: Icon, action, onAction, children, empty, emptyMsg }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">{title}</h2>
        </div>
        {action && (
          <button onClick={onAction} className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline font-medium">
            {action} <ChevronRight size={13} />
          </button>
        )}
      </div>
      {empty ? (
        <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{emptyMsg}</div>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-gray-800">{children}</div>
      )}
    </div>
  );
}

// ─── Today's Calendar Strip ──────────────────────────────────────────────────

function TodayCalendarStrip({ entries, onNavigate }) {
  const ENTRY_COLORS = {
    training: 'border-l-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40',
    meetings: 'border-l-slate-500 bg-slate-50/50 dark:bg-slate-800/40',
    shifts: 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/40',
    equipment: 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/40',
    compliance: 'border-l-green-500 bg-green-50/50 dark:bg-green-950/40',
    finance: 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40',
    personnel: 'border-l-teal-500 bg-teal-50/50 dark:bg-teal-950/40',
    incidents: 'border-l-red-500 bg-red-50/50 dark:bg-red-950/40',
    community: 'border-l-green-500 bg-green-50/50 dark:bg-green-950/40',
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={16} className="text-red-600 dark:text-red-400" />
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Today's Schedule</h2>
        {entries.length > 0 && (
          <span className="text-xs bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full font-medium">{entries.length} item{entries.length !== 1 ? 's' : ''}</span>
        )}
        <button onClick={() => onNavigate('calendar')} className="ml-auto flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline font-medium">
          Full Calendar <ChevronRight size={13} />
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No scheduled activities today</p>
      ) : (
        <div className="space-y-2">
          {entries.slice(0, 8).map(e => (
            <div key={e.id} className={`border-l-4 rounded-lg p-3 ${ENTRY_COLORS[e.category] || 'border-l-gray-400 bg-gray-50/50 dark:bg-gray-800/40'}`}>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{e.title}</p>
                  {e.subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{e.subtitle}</p>}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {e.time && <span className="flex items-center gap-1"><Clock size={10} /> {e.time}</span>}
                  {e.urgency === 'critical' && <AlertTriangle size={12} className="text-red-500" />}
                  <span className="px-1.5 py-0.5 rounded text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-medium">{e.category}</span>
                </div>
              </div>
            </div>
          ))}
          {entries.length > 8 && (
            <button onClick={() => onNavigate('calendar')} className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium">
              +{entries.length - 8} more — view full calendar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Health Scorecard ────────────────────────────────────────────────────────

function HealthScorecard({ scorecard, onNavigate }) {
  if (!scorecard) return null;

  const cards = [
    {
      key: 'staffing',
      label: 'Staffing',
      value: `${scorecard.staffing.active}/${scorecard.staffing.total}`,
      sublabel: 'Active',
      status: scorecard.staffing.status,
      page: 'roster',
    },
    {
      key: 'training',
      label: 'Training',
      // compliance is null when the department has no certification data at all.
      // The server used to score that void as 100% and render GREEN — "we are
      // compliant" read off a screen that meant "we could not read anything".
      // It now sends status:'unknown' + compliance:null, and this must say so
      // rather than print "null%".
      value: scorecard.training.compliance === null ? '—' : `${scorecard.training.compliance}%`,
      sublabel: scorecard.training.compliance === null ? 'No cert data' : 'Compliant',
      status: scorecard.training.status,
      page: 'training',
    },
    {
      key: 'apparatus',
      label: 'Apparatus',
      value: `${scorecard.apparatus.inService}/${scorecard.apparatus.total}`,
      sublabel: 'In Svc',
      status: scorecard.apparatus.status,
      page: 'apparatus',
    },
    {
      key: 'budget',
      label: 'Budget',
      value: scorecard.budget.remaining === null ? '—' : `${scorecard.budget.remaining}%`,
      sublabel: scorecard.budget.remaining === null ? 'No budget set' : 'Remaining',
      status: scorecard.budget.status,
      page: 'budget',
    },
  ];

  const statusColors = {
    green: { bg: 'bg-green-50 dark:bg-green-950/50', border: 'border-l-green-500', indicator: 'bg-green-500', text: 'text-green-700 dark:text-green-300' },
    yellow: { bg: 'bg-yellow-50 dark:bg-yellow-950/50', border: 'border-l-yellow-500', indicator: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-300' },
    red: { bg: 'bg-red-50 dark:bg-red-950/50', border: 'border-l-red-500', indicator: 'bg-red-500', text: 'text-red-700 dark:text-red-300' },
    // 'unknown' = we have no data to score. It is NOT a verdict, so it must not
    // borrow one: green would claim compliance we cannot see, and yellow (the
    // old `|| statusColors.yellow` fallback) claims a warning nobody assessed.
    // Neutral grey, and the card reads "—". Absence is reported, never scored.
    //
    // WEIGHTS ARE NOT ARBITRARY — they follow c06df75's ruling. gray-400 on white
    // is 2.6:1 against a 4.5 floor; that pass replaced every bare `text-gray-400`
    // on this surface with `text-gray-500 dark:text-gray-400`. The swatch and the
    // border are non-text UI (WCAG 1.4.11, 3:1), and every sibling indicator here
    // is a -500 weight, so grey matches at -500 rather than reintroducing the
    // cluster that pass closed.
    unknown: { bg: 'bg-gray-50 dark:bg-gray-950/50', border: 'border-l-gray-500', indicator: 'bg-gray-500', text: 'text-gray-600 dark:text-gray-400' },
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Heart size={16} className="text-red-600 dark:text-red-400" />
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Department Health</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map(({ key, label, value, sublabel, status, page }) => {
          const colors = statusColors[status] || statusColors.yellow;
          return (
            <button
              key={key}
              onClick={() => onNavigate(page)}
              className={`border-l-4 rounded-lg p-4 ${colors.bg} ${colors.border} hover:shadow-md transition-shadow text-left group cursor-pointer`}
            >
              <div className="flex items-start gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${colors.indicator}`} />
              </div>
              <p className={`text-lg font-bold ${colors.text}`}>{value}</p>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{sublabel}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Action Items Scorecard ──────────────────────────────────────────────────

function ActionScorecard({ summary, onNavigate }) {
  const items = [
    { label: 'Meeting Drafts', value: summary?.action_items?.meeting_drafts || 0, icon: ClipboardList, color: 'text-slate-600 dark:text-slate-400', page: 'meeting-minutes' },
    { label: 'Open Grievances', value: summary?.action_items?.open_grievances || 0, icon: Scale, color: 'text-purple-600 dark:text-purple-400', page: 'grievances' },
    { label: 'Maintenance Due', value: summary?.action_items?.maintenance_due || 0, icon: Wrench, color: 'text-yellow-600 dark:text-yellow-400', page: 'maintenance' },
    { label: 'Overdue Checkouts', value: summary?.action_items?.overdue_checkouts || 0, icon: Package, color: 'text-cyan-600 dark:text-cyan-400', page: 'equipment-checkout' },
  ];
  const totalActions = items.reduce((s, i) => s + i.value, 0);

  if (totalActions === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-red-600 dark:text-red-400" />
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Action Items</h2>
        <span className="text-xs bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">{totalActions} pending</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.filter(i => i.value > 0).map(({ label, value, icon: Icon, color, page }) => (
          <button key={label} onClick={() => onNavigate(page)}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-900 hover:bg-red-50/50 dark:hover:bg-red-950/50 transition-colors text-left">
            <Icon size={18} className={color} />
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Agent approval queue (department MCP gated writes) ──────────────────────

function AgentApprovalQueue() {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/agent/approvals?status=pending')
      .then((r) => setItems(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setItems([]));
  }

  useEffect(() => { load(); }, []);

  async function resolve(id, action) {
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/api/agent/approvals/${id}/${action}`, {});
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      setError(err.message || `Failed to ${action}`);
    } finally {
      setBusyId(null);
    }
  }

  if (!items.length && !error) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Agent approvals</h2>
        </div>
        {items.length > 0 && (
          <span className="text-xs bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">
            {items.length} pending
          </span>
        )}
      </div>
      {error && (
        <p className="px-5 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="divide-y divide-gray-50 dark:divide-gray-800">
        {items.map((item) => (
          <div key={item.id} className="px-5 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.summary}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {item.verb} · requested by {item.requested_by_name || item.requested_by_role || 'agent'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => resolve(item.id, 'accept')}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline disabled:opacity-50"
                aria-label={`Accept ${item.summary}`}
              >
                <Check size={13} /> Accept
              </button>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => resolve(item.id, 'reject')}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                aria-label={`Reject ${item.summary}`}
              >
                <X size={13} /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function Dashboard({ onNavigate, settings, prefs, onRespond, user, selectedStation = null, unreadMessageCount = 0 }) {
  const stationName = settings?.stationName    || 'Station 14';
  const deptName    = settings?.departmentName || 'Maplewood VFD';
  const minCrew     = settings?.minCrewSize    || 3;

  // ── Role-based visibility helpers ──
  const isOfficer = ['Chief', 'Deputy Chief', 'Assistant Chief', 'Captain', 'Lieutenant'].includes(user?.rank);
  const isChief = ['Chief', 'Deputy Chief', 'Assistant Chief'].includes(user?.rank);
  const isFirefighter = ['Firefighter', 'Probationary', 'Recruit'].includes(user?.rank);

  const [members,   setMembers]   = useState([]);
  const [apparatus, setApparatus] = useState([]);
  const [shifts,    setShifts]    = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [training,  setTraining]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [activeBoard, setActiveBoard] = useState(null);
  const [showDutyBoard, setShowDutyBoard] = useState(false);

  // Unified summary + calendar feed
  const [summary, setSummary]         = useState(null);
  const [todayEntries, setTodayEntries] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/api/members'),
      api.get('/api/apparatus'),
      api.get('/api/shifts'),
      api.get('/api/incidents'),
      api.get('/api/training'),
    ]).then(([m, a, s, i, t]) => {
      setMembers(Array.isArray(m)      ? m      : (m?.data  ?? []));
      setApparatus(Array.isArray(a)    ? a      : (a?.data  ?? []));
      setShifts(Array.isArray(s)       ? s      : (s?.data  ?? []));
      setIncidents(Array.isArray(i)    ? i      : (i?.data  ?? []));
      setTraining(Array.isArray(t)     ? t      : (t?.data  ?? []));
    }).catch(() => {}).finally(() => setLoading(false));

    // Fetch dashboard summary (non-blocking — enhances alerts if available)
    api.get('/api/dashboard/summary')
      .then(r => setSummary(r?.data ?? r ?? null))
      .catch(() => {});

    // Fetch today's calendar entries
    const todayStr = new Date().toISOString().slice(0, 10);
    api.get(`/api/calendar/feed?start=${todayStr}&end=${todayStr}`)
      .then(r => {
        const data = r?.data ?? r;
        setTodayEntries(Array.isArray(data?.entries) ? data.entries : []);
      })
      .catch(() => {});
  }, []);

  // Poll active board every 20 seconds
  useEffect(() => {
    const pollActiveBoard = () => {
      api.get('/api/active-board')
        .then(({ data }) => setActiveBoard(data ?? null))
        .catch(() => setActiveBoard(null));
    };
    pollActiveBoard();
    const interval = setInterval(pollActiveBoard, 20000);
    return () => clearInterval(interval);
  }, []);

  // ── member stats ──
  const activeMembers  = useMemo(() => members.filter((m) => m.status === 'Active' || m.status === 'Probationary'), [members]);
  const onLeaveMembers = useMemo(() => members.filter((m) => m.status === 'On Leave'), [members]);

  // ── apparatus stats ──
  const inServiceApparatus = useMemo(() => apparatus.filter((a) => a.status === 'In Service'), [apparatus]);
  const serviceAlerts      = useMemo(
    () => apparatus.filter((a) => a.nextServiceDue && daysDiff(a.nextServiceDue) <= 30),
    [apparatus]
  );

  // ── schedule stats ──
  const { start: weekStart, end: weekEnd } = thisWeekRange();
  const shiftsThisWeek = useMemo(
    () => shifts.filter((s) => {
      const d = new Date(s.date);
      return d >= weekStart && d <= weekEnd;
    }),
    [shifts]
  );
  const understaffedShifts = useMemo(
    () => shiftsThisWeek.filter((s) => (s.crew?.length ?? 0) < minCrew),
    [shiftsThisWeek, minCrew]
  );

  // ── incident stats ──
  const monthStr = thisMonthStr();
  const incidentsThisMonth = useMemo(
    () => incidents.filter((i) => i.date?.startsWith(monthStr)),
    [incidents]
  );
  const recentIncidents = useMemo(
    () => [...incidents].sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 5),
    [incidents]
  );

  // ── training alerts ──
  const expiredCerts = useMemo(
    () => training.filter((r) => r.expiresDate && daysDiff(r.expiresDate) < 0),
    [training]
  );
  const soonCerts = useMemo(
    () => training.filter((r) => r.expiresDate && daysDiff(r.expiresDate) >= 0 && daysDiff(r.expiresDate) <= 30),
    [training]
  );

  // ── upcoming shifts (next 7 days) ──
  const upcomingShifts = useMemo(() => {
    const end = new Date(today);
    end.setDate(today.getDate() + 7);
    return shifts
      .filter((s) => { const d = new Date(s.date); return d >= today && d <= end; })
      .sort((a, b) => a.date > b.date ? 1 : -1)
      .slice(0, 6);
  }, [shifts]);

  // ── alerts ──
  // TWO numbers here, deliberately, because they are two different claims:
  //
  //   attentionCount — the shell-wide "needs attention" figure, from the ONE
  //     definition (hooks/useAttentionCount.js). The header pill makes the same
  //     claim the sidebar bell makes, so it must be the same number. It used to
  //     be derived locally from this page's summary data and read "1" while the
  //     bell read "47".
  //   panelAlerts — the count of rows the Alerts PANEL below actually lists. A
  //     container's count has to equal its contents; showing the shell-wide
  //     figure on a panel that lists three items would be a new lie, not a fix.
  const summaryAlerts = summary?.alerts || [];
  const panelAlerts = summaryAlerts.length || (expiredCerts.length + soonCerts.length + serviceAlerts.length + understaffedShifts.length);
  const { total: attentionCount } = useAttentionCount(user, unreadMessageCount);

  // ── greeting ──
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  if (showDutyBoard) {
    return <DutyBoard settings={settings} onClose={() => setShowDutyBoard(false)} />;
  }

  const dh = prefs?.dashboard?.hidden ?? [];
  const show = {
    stats:        !dh.includes('stats'),
    alerts:       !dh.includes('alerts'),
    shifts:       !dh.includes('shifts'),
    incidents:    !dh.includes('incidents'),
    training:     !dh.includes('training'),
    quickactions: !dh.includes('quickactions'),
    calendar:     !dh.includes('calendar'),
    actionitems:  !dh.includes('actionitems'),
  };
  const hiddenCount = Object.values(show).filter(v => !v).length;

  return (
    <div className="space-y-6">

      {/* ── welcome ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{greeting}, {stationName}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            {' · '}{deptName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AIActionButton
            action="daily_briefing"
            context={{ module: 'dashboard' }}
            label="Daily Briefing"
            variant="button"
            resultType="json"
          />
          <AIActionButton
            action="predict_incidents"
            context={{ module: 'dashboard' }}
            label="7-Day Forecast"
            variant="button"
            resultType="json"
          />
          <button
            onClick={() => setShowDutyBoard(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-800 text-white px-4 py-2 text-sm font-semibold hover:bg-gray-900 transition-colors"
          >
            <Tv size={16} /> TV Mode
          </button>
          {attentionCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2 rounded-lg">
              <Bell size={15} className="text-red-600 dark:text-red-400" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">{attentionCount} item{attentionCount === 1 ? '' : 's'} need{attentionCount === 1 ? 's' : ''} attention</span>
            </div>
          )}
        </div>
      </div>

      {/* ── active incident banner ── */}
      {activeBoard && (
        <div className="relative">
          <style>{`
            @keyframes pulse-banner { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
            .animate-pulse-banner { animation: pulse-banner 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
          `}</style>
          <div className="bg-red-900 text-white rounded-xl p-4 animate-pulse-banner">
            <div className="flex items-center gap-3 text-sm flex-wrap">
              {/* lucide, not an emoji. Emoji render per-platform (a different glyph
                  on Windows, Android and macOS), don't inherit currentColor or font
                  weight, and a screen reader announces "police cars revolving light"
                  in the middle of an emergency banner. Everything else in this app
                  is lucide; the most important banner in it should not be the
                  exception. */}
              <Siren size={20} className="shrink-0 text-white" aria-hidden="true" />
              {/* "ACTIVE INCIDENT", matching The Board and the duty board — the
                  same banner was called INCIDENT ACTIVE here and ACTIVE INCIDENT
                  one click away. Segments are built and FILTERED, because the
                  separators used to render around absent values: an incident with
                  no type printed a bare "| |" on the most urgent row on screen. */}
              {(() => {
                const elapsed = Math.max(0, Math.floor((Date.now() - new Date(activeBoard.dispatched_at).getTime()) / 1000));
                const d = Math.floor(elapsed / 86400);
                const h = Math.floor((elapsed % 86400) / 3600);
                const m = Math.floor((elapsed % 3600) / 60);
                const s = elapsed % 60;
                const pad = (n) => String(n).padStart(2, '0');
                // Days are spelled out. A 34-hour call rendered "34:53:15", which
                // reads as a wall-clock time, not as "this has been running a day
                // and a half".
                const clock = d > 0
                  ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`
                  : h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

                const segments = [
                  { key: 'label', node: <span className="font-bold">ACTIVE INCIDENT</span> },
                  activeBoard.type    && { key: 'type',    node: <span className="font-semibold">{activeBoard.type}</span> },
                  activeBoard.address && { key: 'address', node: <span className="font-semibold">{activeBoard.address}</span> },
                  { key: 'clock', node: <span className="font-mono font-semibold">{clock}</span> },
                  Number.isFinite(Number(activeBoard.personnel_count)) && { key: 'personnel', node: <span className="inline-flex items-center gap-1.5"><Users size={14} aria-hidden="true" />{activeBoard.personnel_count} personnel</span> },
                  Number.isFinite(Number(activeBoard.units_count))     && { key: 'units',     node: <span className="inline-flex items-center gap-1.5"><Truck size={14} aria-hidden="true" />{activeBoard.units_count} units</span> },
                ].filter(Boolean);

                return segments.map((seg, i) => (
                  <span key={seg.key} className="flex items-center gap-3">
                    {i > 0 && <span className="text-red-200" aria-hidden="true">|</span>}
                    {seg.node}
                  </span>
                ));
              })()}
              <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => onRespond && onRespond({
                    id: activeBoard.id,
                    type: activeBoard.type || 'Unknown',
                    address: activeBoard.address || '',
                    units: activeBoard.units || '',
                    dispatched_at: activeBoard.dispatched_at || new Date().toISOString(),
                  })}
                  /* green-700, measured. White 12px bold needs 4.5:1 — green-500
                     (shipped) is 2.22:1 and green-600 is 3.22:1, so the obvious
                     one-step darkening would still have failed. green-700 is
                     4.94:1. Numbers computed from the built stylesheet's own
                     oklch tokens, sanity-checked white-on-black = 21.00. */
                  className="inline-flex items-center gap-1.5 bg-green-700 text-white font-black text-xs px-4 py-1.5 rounded-xl hover:bg-green-800 transition-colors shadow-lg"
                >
                  <Truck size={14} aria-hidden="true" /> I&apos;m Responding
                </button>
                {/* Dispatch-controlled: only Dispatch or a Chief can clear the call. */}
                {canClearCalls(user) && (
                  <button
                    onClick={async () => {
                      if (!window.confirm('Clear this active call? This closes the incident banner for the whole station.')) return;
                      try {
                        await api.delete('/api/active-board');
                        setActiveBoard(null);
                      } catch (e) {
                        alert(e.message || 'Failed to clear the call.');
                      }
                    }}
                    className="bg-white/15 hover:bg-white/25 text-white font-black text-xs px-4 py-1.5 rounded-xl transition-colors border border-white/30"
                    title="Clear this call (Dispatch / Chief only)"
                  >
                    Clear Call
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── live unit status ── */}
      <ScreenErrorBoundary label="Unit Status">
        <UnitStatusBoard user={user} title="Unit Status — Live" selectedStation={selectedStation} />
      </ScreenErrorBoundary>

      {/* ── hidden widgets notice ── */}
      {hiddenCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5">
          <SlidersHorizontal size={13} />
          <span>{hiddenCount} widget{hiddenCount !== 1 ? 's' : ''} hidden — change this in your account menu → <strong>Customize My View</strong></span>
        </div>
      )}

      {/* ── leave today banner ── */}
      {summary?.leave_today?.length > 0 && (
        <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 rounded-xl p-3 flex items-center gap-3">
          <Users size={16} className="text-purple-600 dark:text-purple-400 shrink-0" />
          <p className="text-sm text-purple-800 dark:text-purple-300">
            <span className="font-semibold">On leave today:</span>{' '}
            {summary.leave_today.map((l, i) => (
              <span key={l.id}>{i > 0 ? ', ' : ''}{l.name} ({l.type})</span>
            ))}
          </p>
        </div>
      )}

      {/* ── weather + stat cards ── */}
      {show.stats && <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-1 min-w-0 overflow-hidden">
          <WeatherWidget settings={settings} />
        </div>
        <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Members" value={summary?.personnel?.active || activeMembers.length} icon={Users} color="bg-blue-500"
            sub={`${summary?.personnel?.on_leave || onLeaveMembers.length} on leave`} onClick={() => onNavigate('roster')} />
          <StatCard label="Apparatus In Service" value={summary?.apparatus?.in_service || inServiceApparatus.length} icon={Truck} color="bg-emerald-500"
            sub={summary?.apparatus?.active_oos > 0 ? `${summary.apparatus.active_oos} currently OOS` : `of ${summary?.apparatus?.total || apparatus.length} total`}
            onClick={() => onNavigate('apparatus')} />
          <StatCard label="Shifts This Week" value={summary?.shifts?.this_week || shiftsThisWeek.length} icon={CalendarDays}
            color={understaffedShifts.length > 0 ? 'bg-amber-500' : 'bg-indigo-500'}
            sub={understaffedShifts.length > 0 ? `${understaffedShifts.length} understaffed` : 'Fully staffed'}
            onClick={() => onNavigate('schedule')} />
          <StatCard label="Incidents This Month" value={summary?.incidents?.this_month ?? incidentsThisMonth.length} icon={Flame} color="bg-red-500"
            sub={`${summary?.incidents?.ytd || incidents.length} YTD`} onClick={() => onNavigate('incidents')} />
        </div>
      </div>}

      {/* ── Today's Calendar (the heart of the station) ── */}
      {show.calendar && <TodayCalendarStrip entries={todayEntries} onNavigate={onNavigate} />}

      {/* ── Morning brief + agent approval queue (same Ask / invoke plug) ── */}
      <MorningBriefPanel />
      {(isOfficerPlus(user) || (Number(user?.roleLevel) || 0) >= 2) && <AgentApprovalQueue />}

      {/* ── Action Items Scorecard (officers+ only) ── */}
      {show.actionitems && summary && isOfficer && <ActionScorecard summary={summary} onNavigate={onNavigate} />}

      {/* ── Department Health Scorecard (visible to officers and chief) ── */}
      {isOfficer && summary?.scorecard && <HealthScorecard scorecard={summary.scorecard} onNavigate={onNavigate} />}

      {/* ── alerts + upcoming shifts ── */}
      {(show.alerts || show.shifts) && (
      <div className={`grid ${show.alerts && show.shifts && isOfficer ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} gap-6`}>
        {show.alerts && isOfficer && <Panel title={`Alerts${panelAlerts > 0 ? ` (${panelAlerts})` : ''}`} icon={Bell} empty={panelAlerts === 0} emptyMsg="No active alerts — station looks good!">
          {summaryAlerts.length > 0 ? (
            summaryAlerts.map((a, i) => (
              <div key={i} className="px-4 py-3">
                <AlertItem icon={a.level === 'critical' ? AlertTriangle : Clock}
                  iconColor={a.level === 'critical' ? 'text-red-500' : 'text-amber-500'}
                  bg={a.level === 'critical' ? 'bg-red-50 dark:bg-red-950/50' : 'bg-amber-50 dark:bg-amber-950/50'}
                  border={a.level === 'critical' ? 'border-red-200 dark:border-red-900' : 'border-amber-200 dark:border-amber-900'}
                  title={a.title} detail={a.detail} action="View" onAction={() => onNavigate(a.module)} />
              </div>
            ))
          ) : (
            <>
              {expiredCerts.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <AlertItem icon={AlertTriangle} iconColor="text-red-500" bg="bg-red-50 dark:bg-red-950/50" border="border-red-200 dark:border-red-900"
                    title={`Expired: ${r.courseName}`} detail={`${r.memberName} · expired ${formatDate(r.expiresDate)}`}
                    action="View" onAction={() => onNavigate('training')} />
                </div>
              ))}
              {soonCerts.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <AlertItem icon={Clock} iconColor="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/50" border="border-amber-200 dark:border-amber-900"
                    title={`Expiring Soon: ${r.courseName}`} detail={`${r.memberName} · ${daysDiff(r.expiresDate)}d`}
                    action="View" onAction={() => onNavigate('training')} />
                </div>
              ))}
              {serviceAlerts.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <AlertItem icon={Truck} iconColor={daysDiff(a.nextServiceDue) < 0 ? 'text-red-500' : 'text-amber-500'}
                    bg={daysDiff(a.nextServiceDue) < 0 ? 'bg-red-50 dark:bg-red-950/50' : 'bg-amber-50 dark:bg-amber-950/50'} border={daysDiff(a.nextServiceDue) < 0 ? 'border-red-200 dark:border-red-900' : 'border-amber-200 dark:border-amber-900'}
                    title={`${daysDiff(a.nextServiceDue) < 0 ? 'Overdue' : 'Service Due'}: ${a.designation}`}
                    detail={`${a.year} ${a.make} ${a.model} · due ${formatDate(a.nextServiceDue)}`}
                    action="View" onAction={() => onNavigate('apparatus')} />
                </div>
              ))}
              {understaffedShifts.map((s) => (
                <div key={s.id} className="px-4 py-3">
                  <AlertItem icon={Users} iconColor="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/50" border="border-amber-200 dark:border-amber-900"
                    title={`Understaffed: ${s.type} Shift`} detail={`${formatDate(s.date)} · ${s.crew?.length ?? 0} of ${minCrew} required`}
                    action="View" onAction={() => onNavigate('schedule')} />
                </div>
              ))}
            </>
          )}
        </Panel>}

        {show.shifts && <Panel title="Upcoming Shifts" icon={CalendarDays} action="View Calendar" onAction={() => onNavigate('schedule')}
          empty={upcomingShifts.length === 0} emptyMsg="No shifts scheduled in the next 7 days.">
          {upcomingShifts.map((s) => {
            const crewCount = s.crew?.length ?? 0;
            const staffed = crewCount >= minCrew;
            return (
              <div key={s.id} role="button" tabIndex={0} aria-label={`View ${s.type} shift on schedule`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate('schedule'); } }} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => onNavigate('schedule')}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${staffed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{s.type} Shift</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(s.date)}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <Users size={12} />
                  <span className={staffed ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600 dark:text-amber-400 font-medium'}>{crewCount}</span>
                  <span>/ {minCrew}</span>
                </div>
              </div>
            );
          })}
        </Panel>}
      </div>)}

      {/* ── recent incidents + training ── */}
      {(show.incidents || show.training) && (
      <div className={`grid ${show.incidents && show.training ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} gap-6`}>
        {show.incidents && <Panel title="Recent Incidents" icon={Flame} action="View Log" onAction={() => onNavigate('incidents')}
          empty={recentIncidents.length === 0} emptyMsg="No incidents on record.">
          {recentIncidents.map((inc) => (
            <div key={inc.id} role="button" tabIndex={0} aria-label={`View incident: ${inc.type}`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate('incidents'); } }} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => onNavigate('incidents')}>
              <div className="mt-0.5 shrink-0"><Flame size={14} className="text-red-400" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{inc.type}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{inc.address}</p>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(inc.date)}</span>
            </div>
          ))}
        </Panel>}

        {show.training && <Panel title="Training Snapshot" icon={GraduationCap} action="View Records" onAction={() => onNavigate('training')}>
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2"><AlertTriangle size={14} className="text-red-500" /><span className="text-gray-700 dark:text-gray-300">Expired certifications</span></div>
              <span className={`font-bold ${(summary?.training?.expired_certs || expiredCerts.length) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {summary?.training?.expired_certs ?? expiredCerts.length}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2"><Clock size={14} className="text-amber-500" /><span className="text-gray-700 dark:text-gray-300">Expiring within 30 days</span></div>
              <span className={`font-bold ${(summary?.training?.expiring_soon || soonCerts.length) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {summary?.training?.expiring_soon ?? soonCerts.length}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /><span className="text-gray-700 dark:text-gray-300">Valid certifications</span></div>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{summary?.training?.valid_certs ?? training.filter((r) => r.expiresDate && daysDiff(r.expiresDate) > 30).length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2"><TrendingUp size={14} className="text-blue-500" /><span className="text-gray-700 dark:text-gray-300">Total hours logged</span></div>
              <span className="font-bold text-blue-600 dark:text-blue-400">{training.filter((r) => r.status === 'Passed').reduce((s, r) => s + (r.hours || 0), 0)}</span>
            </div>
          </div>
          {(expiredCerts.length > 0 || soonCerts.length > 0) && (
            <div className="px-5 pb-4 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Action Required</p>
              {[...expiredCerts, ...soonCerts].slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${daysDiff(r.expiresDate) < 0 ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <span className="text-gray-700 dark:text-gray-300 truncate">{r.memberName} — {r.courseName}</span>
                  <span className={`ml-auto whitespace-nowrap font-medium ${daysDiff(r.expiresDate) < 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {daysDiff(r.expiresDate) < 0 ? 'Expired' : `${daysDiff(r.expiresDate)}d`}
                  </span>
                </div>
              ))}
              {expiredCerts.length + soonCerts.length > 3 && <p className="text-xs text-gray-500 dark:text-gray-400">+{expiredCerts.length + soonCerts.length - 3} more</p>}
            </div>
          )}
        </Panel>}
      </div>)}

      {/* ── quick actions ── */}
      {show.quickactions && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {(() => {
            const allActions = [
              { label: 'Add Member',    icon: Users,          page: 'roster',    minRole: 'officer' },
              { label: 'Log Incident',  icon: Flame,          page: 'incidents', minRole: 'any' },
              { label: 'Add Shift',     icon: CalendarDays,   page: 'schedule',  minRole: 'officer' },
              { label: 'Log Training',  icon: GraduationCap,  page: 'training',  minRole: 'any' },
              { label: 'New Meeting',   icon: ClipboardList,  page: 'meeting-minutes', minRole: 'officer' },
              { label: 'Calendar',      icon: Calendar,       page: 'calendar',  minRole: 'any' },
              { label: 'AI Schedule',   icon: Sparkles,       page: 'ai',        minRole: 'officer' },
              { label: 'Settings',      icon: Shield,         page: 'settings',  minRole: 'chief' },
            ];
            // Firefighters see limited actions
            const visibleActions = isFirefighter ? allActions.filter(a => a.minRole === 'any') : allActions;
            return visibleActions;
          })().map(({ label, icon: Icon, page }) => (
            <button key={page} onClick={() => onNavigate(page)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors text-center group">
              <Icon size={20} className="text-gray-500 dark:text-gray-400 group-hover:text-red-600 transition-colors" />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300 group-hover:text-red-700">{label}</span>
            </button>
          ))}
        </div>
      </div>}

    </div>
  );
}
