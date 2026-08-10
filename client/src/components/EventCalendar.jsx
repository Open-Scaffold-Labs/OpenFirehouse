// impeccable-disable overused-font: print-template HTML uses web-safe fonts deliberately
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, List, Plus,
  MapPin, Clock, Users, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, HelpCircle, Pencil, Trash2,
  Layers, Filter, AlertTriangle, BookOpen, Wrench, Shield,
  DollarSign, Heart, Siren, ClipboardList, Repeat, Wind,
  Truck, CalendarOff, Flame, HeartPulse, Scale, X,
  Briefcase, Zap, Home, TrendingUp, Activity, Bell,
  CloudRain, Cloud, Sun, Snowflake, Thermometer, Droplets,
  Eye, Sunrise, Sunset, Loader2, RefreshCw, ChevronRight as ChevronR,
  ShieldCheck, GraduationCap, Wallet, UserCheck, CircleDot, Tv,
  Save, Printer, Sparkles,
} from 'lucide-react';
import { EVENT_TYPES, EVENT_TYPE_COLORS, RSVP_STATUSES } from '../data/events';
import { api, getStoredUser } from '../utils/api';
import { actingDisplayRank } from '../utils/actingRank';
import { localToday } from '../utils/localDay';
import EventForm from './EventForm';
import AllStationsBoard from './AllStationsBoard';
import { useBulletinAlerts } from '../hooks/useBulletinAlerts';
import { markRead } from '../utils/bulletinReads';
// RadioFeedZone moved to Incident Operations → Radio Feed nav item

// ─── The Board Header — Whiteboard-style greeting ───────────────────────────
// Inspired by Concept A (The Turnover Board) from the Today Experience White Paper.
// Warm greeting with date, time, and a feel of the physical station whiteboard.

export function BoardHeader({ officer: officerProp }) {
  const [now, setNow] = useState(new Date());
  const [localOfficer, setLocalOfficer] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const weatherRef = useRef(null);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(iv);
  }, []);

  // Fetch officer from BOTH endpoints for maximum reliability
  useEffect(() => {
    api.get('/api/daily-staffing')
      .then(res => {
        const data = res?.data ?? res ?? [];
        const list = Array.isArray(data) ? data : (data?.data || []);
        const oic = list.find(m => m.position === 'Officer in Charge');
        if (oic) {
          setLocalOfficer(prev => prev || { name: oic.member_name || oic.name, rank: oic.member_rank || oic.rank });
        }
      })
      .catch(() => {});

    api.get('/api/dashboard/today')
      .then(res => {
        const data = res?.data ?? res;
        if (data?.officer) {
          setLocalOfficer(prev => prev || { name: data.officer.name, rank: data.officer.rank || '' });
        }
      })
      .catch(() => {});

    // Fetch weather for inline display
    api.get('/api/weather/current')
      .then(r => setWeather(r?.data ?? r ?? null))
      .catch(() => {});
  }, []);

  // Close weather panel on outside click
  useEffect(() => {
    if (!weatherOpen) return;
    const handler = (e) => {
      if (weatherRef.current && !weatherRef.current.contains(e.target)) setWeatherOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [weatherOpen]);

  const officer = officerProp || localOfficer;

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  // Compact weather icon
  const weatherIcon = (cond) => {
    const lower = (cond || '').toLowerCase();
    if (lower.includes('snow')) return <Snowflake size={18} className="text-blue-300" />;
    if (lower.includes('rain') || lower.includes('drizzle')) return <CloudRain size={18} className="text-blue-400" />;
    if (lower.includes('cloud') || lower.includes('overcast')) return <Cloud size={18} className="text-gray-400" />;
    return <Sun size={18} className="text-amber-400" />;
  };

  return (
    <div className="relative rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gradient-to-br from-stone-50 via-white to-amber-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-amber-950/20 px-6 py-5 shadow-sm overflow-hidden">
      {/* Subtle whiteboard texture line */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 31px, #94a3b8 31px, #94a3b8 32px)',
      }} />

      <div className="relative flex items-center justify-between flex-wrap gap-3">
        {/* Left: Greeting + Date */}
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">{greeting}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 font-medium">{dateStr}</p>
        </div>

        {/* Right: Commander | Weather | Clock | Status */}
        <div className="flex items-center gap-4">
          {/* Shift Commander */}
          {officer && (
            <>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center shadow-sm">
                  <Shield size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-black text-gray-900 dark:text-gray-100 leading-tight">{officer.name}</p>
                  <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">
                    {officer.rank ? `${officer.rank} — ` : ''}Shift Commander
                  </p>
                </div>
              </div>
              <div className="w-px h-10 bg-gray-200 dark:bg-gray-700" />
            </>
          )}

          {/* Clickable Weather with Wind */}
          {weather?.current && (
            <>
              <div className="relative" ref={weatherRef}>
                <button
                  onClick={() => setWeatherOpen(o => !o)}
                  className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors cursor-pointer"
                  title="Click for weather details"
                  aria-expanded={weatherOpen}
                >
                  {weatherIcon(weather.current.conditions)}
                  <div className="text-right">
                    <p className="text-lg font-black text-gray-900 dark:text-gray-100 leading-none">{weather.current.temp}°F</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize truncate max-w-[70px]">{weather.current.conditions}</p>
                  </div>
                  <div className="flex items-center gap-0.5 ml-1">
                    <Wind size={12} className="text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{weather.current.wind_speed} mph {weather.current.wind_direction || ''}</span>
                  </div>
                </button>

                {/* Expanded weather detail card */}
                {weatherOpen && (
                  <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-white">
                        {weatherIcon(weather.current.conditions)}
                        <div>
                          <p className="text-xl font-black leading-none">{weather.current.temp}°F</p>
                          <p className="text-[11px] opacity-80 capitalize">{weather.current.conditions}</p>
                        </div>
                      </div>
                      <button onClick={() => setWeatherOpen(false)} aria-label="Close weather details" className="text-white/60 hover:text-white">
                        <X size={16} />
                      </button>
                    </div>

                    {/* Details grid */}
                    <div className="p-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 rounded-lg px-2.5 py-2">
                        <Thermometer size={14} className="text-orange-500" />
                        <div>
                          <p className="text-gray-400 text-[9px] uppercase font-bold">Feels Like</p>
                          <p className="font-bold text-gray-900 dark:text-gray-100">{weather.current.feels_like}°F</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 rounded-lg px-2.5 py-2">
                        <Wind size={14} className="text-blue-500" />
                        <div>
                          <p className="text-gray-400 text-[9px] uppercase font-bold">Wind</p>
                          <p className="font-bold text-gray-900 dark:text-gray-100">{weather.current.wind_speed} mph {weather.current.wind_direction || ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 rounded-lg px-2.5 py-2">
                        <Droplets size={14} className="text-blue-400" />
                        <div>
                          <p className="text-gray-400 text-[9px] uppercase font-bold">Humidity</p>
                          <p className="font-bold text-gray-900 dark:text-gray-100">{weather.current.humidity}%</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 rounded-lg px-2.5 py-2">
                        <Eye size={14} className="text-gray-500 dark:text-gray-400" />
                        <div>
                          <p className="text-gray-400 text-[9px] uppercase font-bold">Visibility</p>
                          <p className="font-bold text-gray-900 dark:text-gray-100">{weather.current.visibility} mi</p>
                        </div>
                      </div>
                    </div>

                    {/* Today hi/lo + sunrise/sunset */}
                    {weather.today && (
                      <div className="px-3 pb-2 flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-2">
                        <span className="font-bold">Hi {weather.today.high}° / Lo {weather.today.low}°</span>
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-0.5"><Sunrise size={10} /> {weather.today.sunrise}</span>
                          <span className="flex items-center gap-0.5"><Sunset size={10} /> {weather.today.sunset}</span>
                        </div>
                      </div>
                    )}

                    {/* 3-day forecast */}
                    {weather.forecast && weather.forecast.length > 0 && (
                      <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Forecast</p>
                        <div className="flex gap-2">
                          {weather.forecast.map((fc, i) => (
                            <div key={i} className="flex-1 text-center bg-gray-50 dark:bg-gray-950 rounded-lg py-1.5 px-1">
                              <p className="text-[10px] font-bold text-gray-600 dark:text-gray-300">{fc.day}</p>
                              <p className="text-xs font-black text-gray-900 dark:text-gray-100">{fc.high}°</p>
                              <p className="text-[10px] text-gray-400">{fc.low}°</p>
                              {fc.precip_pct > 0 && (
                                <p className="text-[9px] text-blue-500 font-bold">{fc.precip_pct}%</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Operational alerts */}
                    {weather.operational_alerts && weather.operational_alerts.length > 0 && (
                      <div className="border-t border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 px-3 py-2">
                        {weather.operational_alerts.map((alert, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] text-amber-800 dark:text-amber-300">
                            <AlertTriangle size={11} className="text-amber-500 mt-0.5 flex-shrink-0" />
                            <span className="font-medium">{alert.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="w-px h-10 bg-gray-200 dark:bg-gray-700" />
            </>
          )}

          {/* Clock */}
          <div className="text-right">
            <p className="text-2xl font-black text-gray-900 dark:text-gray-100 tabular-nums">{timeStr}</p>
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Station Time</p>
          </div>
          <div className="w-px h-10 bg-gray-200 dark:bg-gray-700" />

          {/* On Duty indicator */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-sm" />
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">On Duty</span>
          </div>

          {/* TV Mode quick-launch */}
          <div className="w-px h-10 bg-gray-200 dark:bg-gray-700" />
          <button
            onClick={async () => {
              // Open blank window immediately (preserves user-gesture for popup policy)
              const win = window.open('', '_blank');
              try {
                const data = await api.get('/api/stations/tv-pin');
                // PINs are stored hashed server-side, so the server can only
                // echo legacy plaintext PINs — fall back to the locally cached
                // PIN (saved whenever this browser generated/used one).
                const pin = data?.pin || data?.data?.pin || localStorage.getItem('tv-display-pin');
                if (pin && win) {
                  localStorage.setItem('tv-display-pin', pin);
                  win.location.href = `${window.location.origin}/tv?pin=${pin}`;
                } else if (win) {
                  win.close();
                }
              } catch (_) { if (win) win.close(); }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            title="Launch TV Display in a new window"
          >
            <Tv size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">TV</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Zone A: AI Briefing Bar ────────────────────────────────────────────────
// Shows the top AI-generated insight from /api/dashboard/briefing.
// Cycles through multiple insights with a gentle pulse effect.

function AIBriefingBar() {
  const [briefing, setBriefing] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/dashboard/briefing')
      .then(r => {
        const d = r?.data ?? r;
        setBriefing(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Auto-cycle through insights every 8 seconds
  useEffect(() => {
    if (!briefing?.insights || briefing.insights.length <= 1) return;
    const iv = setInterval(() => {
      setActiveIdx(i => (i + 1) % briefing.insights.length);
    }, 8000);
    return () => clearInterval(iv);
  }, [briefing]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/40 px-5 py-3 flex items-center gap-3 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-violet-200 dark:bg-violet-900" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-violet-200 dark:bg-violet-900 rounded w-2/3" />
          <div className="h-2.5 bg-violet-100 dark:bg-violet-900/60 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!briefing?.insights?.length) return null;

  const insight = briefing.insights[activeIdx];
  const total = briefing.insights.length;

  // This bar used to paint itself by insight PRIORITY — priority 1 rendered a
  // red gradient, which put an advisory AI note in the same red as the ACTIVE
  // INCIDENT banner directly below it. On a narrow viewport they read as two
  // identical red slabs, so the emergency was chromatically indistinguishable
  // from a maintenance tip. Standing ruling #2 also says AI is SOLID VIOLET, no
  // gradients, and no AI surface wears anything else. Priority now rides as a
  // text label in the meta row: the ordering still decides what shows first,
  // and red stays reserved for things that are actually an emergency.
  const priorityLabel = { 1: 'High priority', 2: 'Medium priority', 5: 'For information' }[insight.priority] || null;

  // WEIGHT, not just hue. Making this bar solid violet-700 fixed the collision
  // with the red ACTIVE INCIDENT banner — but it then became the most saturated
  // element on the page, so an AI advisory out-shouted the actual emergency one
  // row below it. Hierarchy has to be: active incident > AI note. So the surface
  // is now a quiet violet-tinted card with a violet rail carrying the identity —
  // unmistakably the AI colour, deliberately not the loudest thing on screen.
  // The incident banner keeps its saturated fill and its pulse; nothing else does.
  return (
    <div className="rounded-2xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/40 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-l-4 border-violet-600 dark:border-violet-500 px-5 py-3.5">
        <Sparkles size={18} className="shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">
              AI Briefing
            </span>
            {priorityLabel && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700/80 dark:text-violet-300/80">
                {priorityLabel}
              </span>
            )}
            {total > 1 && (
              <span className="text-[10px] text-violet-700/70 dark:text-violet-300/70">
                {activeIdx + 1}/{total}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-snug mt-0.5 truncate">
            {insight.headline}
          </p>
          {insight.detail && (
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 truncate">{insight.detail}</p>
          )}
        </div>
        {total > 1 && (
          <div className="flex gap-1">
            {briefing.insights.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                aria-label={`Show insight ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === activeIdx ? 'bg-violet-600 dark:bg-violet-400 w-4' : 'bg-violet-300 dark:bg-violet-700 w-1.5'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Zone B: Active Incident Banner ─────────────────────────────────────────

function ActiveIncidentBanner() {
  const [activeBoard, setActiveBoard] = useState(null);

  useEffect(() => {
    const poll = () => api.get('/api/active-board')
      .then(({ data: d }) => setActiveBoard(d ?? null))
      .catch(() => setActiveBoard(null));
    poll();
    const iv = setInterval(poll, 15000);
    return () => clearInterval(iv);
  }, []);

  if (!activeBoard) return null;

  return (
    <div className="bg-red-900 text-white rounded-2xl px-5 py-4 shadow-lg border border-red-700" style={{ animation: 'pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite' }}>
      <div className="flex items-center gap-4 text-sm flex-wrap">
        {/* lucide, not an emoji — see the note on the Dashboard's copy of this banner. */}
        <Siren size={20} className="shrink-0 text-white" aria-hidden="true" />
        <span className="font-black uppercase tracking-wide text-red-100">Active Incident</span>
        {/* Only render a separator when there is something on both sides of it —
            an incident with no type printed "ACTIVE INCIDENT | — 123 Main St",
            i.e. a dash standing in for a missing value on the most urgent banner
            in the app. Absent data should be absent, not punctuated. */}
        {activeBoard.type && (
          <>
            <span className="h-4 w-px bg-red-600" aria-hidden="true" />
            <span className="font-bold">{activeBoard.type}</span>
          </>
        )}
        {activeBoard.address && (
          <>
            <span className="h-4 w-px bg-red-600" aria-hidden="true" />
            <span className="font-bold">{activeBoard.address}</span>
          </>
        )}
        <span className="h-4 w-px bg-red-600" aria-hidden="true" />
        <span className="flex items-center gap-2">
          <Users size={14} aria-hidden="true" />
          <span><span className="sr-only">Personnel: </span>{activeBoard.personnel_count ?? 0}</span>
          <Truck size={14} className="ml-2" aria-hidden="true" />
          <span><span className="sr-only">Units: </span>{activeBoard.units_count ?? 0}</span>
        </span>
      </div>
    </div>
  );
}

// ─── Zone C: Readiness Cards ────────────────────────────────────────────────
// 4 compact cards: Staffing, Apparatus, Training, Budget from /api/dashboard/summary

function ReadinessCards() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/api/dashboard/summary')
      .then(r => setData(r?.data ?? r ?? null))
      .catch(() => {});
  }, []);

  if (!data) return null;

  const sc = data.scorecard;
  if (!sc) return null;

  const statusColor = (s) =>
    s === 'green' ? 'text-emerald-500' : s === 'red' ? 'text-red-500' : 'text-amber-500';
  const statusBg = (s) =>
    s === 'green' ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900' : s === 'red' ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900' : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900';
  const statusDot = (s) =>
    s === 'green' ? 'bg-emerald-500' : s === 'red' ? 'bg-red-500' : 'bg-amber-500';

  const cards = [
    {
      key: 'staffing',
      Icon: UserCheck,
      label: 'Staffing',
      value: `${sc.staffing?.active ?? '—'}`,
      sub: `${data.personnel?.active ?? '?'} active members`,
      status: sc.staffing?.status || 'green',
      iconBg: 'bg-blue-500',
    },
    {
      key: 'apparatus',
      Icon: Truck,
      label: 'Apparatus',
      value: `${sc.apparatus?.inService ?? '—'}/${sc.apparatus?.total ?? '?'}`,
      sub: 'in service',
      status: sc.apparatus?.status || 'green',
      iconBg: 'bg-emerald-500',
    },
    {
      key: 'training',
      Icon: GraduationCap,
      label: 'Training',
      value: `${sc.training?.compliance ?? '—'}%`,
      sub: 'compliance rate',
      status: sc.training?.status || 'green',
      iconBg: 'bg-indigo-500',
    },
    {
      key: 'budget',
      Icon: Wallet,
      label: 'Budget',
      value: `${sc.budget?.remaining ?? '—'}%`,
      sub: 'remaining this FY',
      status: sc.budget?.status || 'green',
      // Not violet: ruling #2 reserves violet for AI surfaces, and nothing else
      // wears it. Budget is a plain metric tile sitting one row below the AI
      // briefing bar, which is the surface violet is supposed to identify.
      iconBg: 'bg-teal-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(({ key, Icon, label, value, sub, status, iconBg }) => (
        <div
          key={key}
          className={`relative rounded-2xl border px-4 py-3.5 ${statusBg(status)} transition-all hover:shadow-md`}
        >
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl ${iconBg} shadow-sm`}>
              <Icon size={16} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
              <p className="text-2xl font-black text-gray-900 dark:text-gray-100 leading-none mt-0.5">{value}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>
            </div>
            <div className={`w-2.5 h-2.5 rounded-full ${statusDot(status)} mt-1 flex-shrink-0`} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Daily Notices — shift-specific bulletins posted by BC+ / Training School ─

export function DailyNotices({ highlightId, onHighlightConsumed }) {
  const user = getStoredUser();
  const username = user?.username || 'guest';

  const { dailyNotices, loading, isRead, markRead: markBulletinRead } = useBulletinAlerts();
  const [expanded, setExpanded] = useState(null);
  const highlightRef = useRef(null);

  // Auto-expand + mark read when navigated from Notifications
  useEffect(() => {
    if (!highlightId) return;
    setExpanded(Number(highlightId) || highlightId);
    if (!isRead(highlightId)) {
      markRead(username, highlightId);
      markBulletinRead(highlightId);
    }
    onHighlightConsumed?.();
    // Scroll to after bulletins load
    setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleOpen(b) {
    setExpanded((prev) => (prev === b.id ? null : b.id));
    if (!isRead(b.id)) {
      markRead(username, b.id);
      markBulletinRead(b.id);
    }
  }

  function fmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
          <div className="h-10 bg-gray-50 dark:bg-gray-950 rounded" />
          <div className="h-10 bg-gray-50 dark:bg-gray-950 rounded" />
        </div>
      </div>
    );
  }

  const unreadCount = dailyNotices.filter((b) => !isRead(b.id)).length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-red-50/60 to-white dark:from-red-950/40 dark:to-gray-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-red-600 dark:text-red-400" />
            <span className="text-sm font-black text-gray-900 dark:text-gray-100 uppercase tracking-wide">Daily Notices</span>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
                {unreadCount} unread
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-600 dark:text-gray-400 uppercase tracking-wide">Today's shift</span>
        </div>
      </div>

      {/* Notice rows */}
      <div className="divide-y divide-gray-50 dark:divide-gray-800">
        {dailyNotices.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">
            <Bell size={22} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No notices posted for today's shift.</p>
          </div>
        ) : (
          dailyNotices.map((b) => {
            const read = isRead(b.id);
            const open = expanded === b.id;
            const isHighlighted = String(b.id) === String(highlightId);
            return (
              <div key={b.id} ref={isHighlighted ? highlightRef : null}
                   className={isHighlighted ? 'ring-2 ring-red-400 ring-inset rounded-lg' : ''}>
                {/* Row */}
                <button
                  onClick={() => handleOpen(b)}
                  aria-expanded={open}
                  className={`w-full text-left px-5 py-3 flex items-start gap-3 hover:bg-gray-50/60 dark:hover:bg-gray-800/60 transition-colors ${open ? 'bg-red-50/40 dark:bg-red-950/40' : ''}`}
                >
                  {/* Unread dot */}
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${read ? 'bg-transparent' : 'bg-red-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${read ? 'text-gray-600 dark:text-gray-300' : 'font-bold text-gray-900 dark:text-gray-100'}`}>
                      {b.title}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {b.author_name || 'Station'} · {fmtTime(b.created_at)}
                    </p>
                  </div>
                  <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded body */}
                {open && (
                  <div className="px-5 pb-4 pt-1 bg-red-50/20 dark:bg-red-950/20 border-t border-red-100/60 dark:border-red-900/60">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{b.body}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
                      <CheckCircle2 size={10} className="text-green-500" /> Marked as read
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Zone D-Right: Weather Card ─────────────────────────────────────────────

function WeatherCard() {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/weather/current')
      .then(r => setWeather(r?.data ?? r ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse">
        <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/3 mb-3" />
        <div className="h-16 bg-gray-50 dark:bg-gray-950 rounded mb-3" />
        <div className="space-y-2">
          <div className="h-8 bg-gray-50 dark:bg-gray-950 rounded" />
          <div className="h-8 bg-gray-50 dark:bg-gray-950 rounded" />
        </div>
      </div>
    );
  }

  if (!weather) return null;

  const c = weather.current;
  const t = weather.today;

  // Weather icon mapping
  const condIcon = (cond) => {
    const lower = (cond || '').toLowerCase();
    if (lower.includes('snow')) return <Snowflake size={32} className="text-blue-300" />;
    if (lower.includes('rain') || lower.includes('drizzle')) return <CloudRain size={32} className="text-blue-400" />;
    if (lower.includes('cloud') || lower.includes('overcast')) return <Cloud size={32} className="text-gray-400" />;
    return <Sun size={32} className="text-amber-400" />;
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Current conditions */}
      <div className="px-5 py-4 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/40 dark:to-gray-900">
        <div className="flex items-center gap-2 mb-3">
          <Thermometer size={14} className="text-gray-500 dark:text-gray-400" />
          <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Weather</span>
          {weather.source === 'simulated' && (
            <span className="text-[9px] text-gray-400 ml-auto">(simulated)</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {condIcon(c.conditions)}
          <div>
            <p className="text-3xl font-black text-gray-900 dark:text-gray-100 leading-none">{c.temp}°F</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 capitalize">{c.conditions}</p>
          </div>
        </div>
        {t && (
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="bg-white/80 dark:bg-gray-900/80 rounded-lg py-1.5 px-1">
              <p className="text-[10px] text-gray-400 font-bold">H / L</p>
              <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{t.high}° / {t.low}°</p>
            </div>
            <div className="bg-white/80 dark:bg-gray-900/80 rounded-lg py-1.5 px-1">
              <p className="text-[10px] text-gray-400 font-bold">WIND</p>
              <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{c.wind_speed} mph {c.wind_direction}</p>
            </div>
            <div className="bg-white/80 dark:bg-gray-900/80 rounded-lg py-1.5 px-1">
              <p className="text-[10px] text-gray-400 font-bold">PRECIP</p>
              <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{t.precipitation_pct}%</p>
            </div>
          </div>
        )}
      </div>

      {/* 3-day forecast */}
      {weather.forecast?.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Forecast</p>
          <div className="space-y-2">
            {weather.forecast.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="font-bold text-gray-700 dark:text-gray-300 w-16">{f.day}</span>
                <span className="text-gray-500 dark:text-gray-400 flex-1 truncate px-2">{f.conditions}</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">{f.high}°/{f.low}°</span>
                {f.precip_pct > 15 && (
                  <span className="text-blue-500 ml-2 flex items-center gap-0.5">
                    <Droplets size={10} /> {f.precip_pct}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operational weather alerts */}
      {weather.operational_alerts?.length > 0 && (
        <div className="px-5 py-3 bg-red-50 dark:bg-red-950/50 border-t border-red-100 dark:border-red-900">
          <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1.5">Operational Alerts</p>
          {weather.operational_alerts.map((a, i) => (
            <p key={i} className="text-xs text-red-800 dark:text-red-300 font-medium leading-relaxed">
              ⚠️ {a.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Existing Constants & Helpers ───────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const EVENT_COLORS = {
  drills: { bg: 'bg-orange-500', text: 'text-white', light: 'bg-orange-100 dark:bg-orange-950/50', lightText: 'text-orange-700 dark:text-orange-300' },
  meetings: { bg: 'bg-slate-500', text: 'text-white', light: 'bg-slate-100 dark:bg-slate-800', lightText: 'text-slate-700 dark:text-slate-300' },
  training: { bg: 'bg-indigo-500', text: 'text-white', light: 'bg-indigo-100 dark:bg-indigo-950/50', lightText: 'text-indigo-700 dark:text-indigo-300' },
  fundraisers: { bg: 'bg-pink-500', text: 'text-white', light: 'bg-pink-100 dark:bg-pink-950/50', lightText: 'text-pink-700 dark:text-pink-300' },
  'community events': { bg: 'bg-green-500', text: 'text-white', light: 'bg-green-100 dark:bg-green-950/50', lightText: 'text-green-700 dark:text-green-300' },
  'special details': { bg: 'bg-amber-500', text: 'text-white', light: 'bg-amber-100 dark:bg-amber-950/50', lightText: 'text-amber-700 dark:text-amber-300' },
  inspections: { bg: 'bg-red-500', text: 'text-white', light: 'bg-red-100 dark:bg-red-950/50', lightText: 'text-red-700 dark:text-red-300' },
  shifts: { bg: 'bg-blue-500', text: 'text-white', light: 'bg-blue-100 dark:bg-blue-950/50', lightText: 'text-blue-700 dark:text-blue-300' },
  equipment: { bg: 'bg-yellow-500', text: 'text-white', light: 'bg-yellow-100 dark:bg-yellow-950/50', lightText: 'text-yellow-700 dark:text-yellow-300' },
  personnel: { bg: 'bg-teal-500', text: 'text-white', light: 'bg-teal-100 dark:bg-teal-950/50', lightText: 'text-teal-700 dark:text-teal-300' },
  incidents: { bg: 'bg-red-600', text: 'text-white', light: 'bg-red-100 dark:bg-red-950/50', lightText: 'text-red-700 dark:text-red-300' },
  other: { bg: 'bg-gray-500', text: 'text-white', light: 'bg-gray-100 dark:bg-gray-800', lightText: 'text-gray-700 dark:text-gray-300' },
};

const CREW_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-amber-500', 'bg-indigo-500', 'bg-pink-500'];

function fmt12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDateLong(iso) {
  if (!iso) return '';
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fmtMonthYear(year, month) {
  return `${MONTHS[month]} ${year}`;
}

function isToday(iso) {
  return iso === localToday();
}

function isPast(iso) {
  return iso < localToday();
}

function rsvpCounts(rsvps = []) {
  const going = rsvps.filter((r) => r.status === 'Going').length;
  const notGoing = rsvps.filter((r) => r.status === 'Not Going').length;
  const maybe = rsvps.filter((r) => r.status === 'Maybe').length;
  return { going, notGoing, maybe };
}

function getEventColor(type) {
  const key = (type || 'other').toLowerCase().replace(/\s+/g, ' ');
  return EVENT_COLORS[key] || EVENT_COLORS.other;
}

// ─── Zone E: Run List (Hybrid Layer 2) ────────────────────────────────────────
// Apparatus-centric daily run list: apparatus in service with captain + crew,
// command staff (Riding BC / DC / Fire Chief), and members on recall.
// Submitted once at start of shift, updated throughout the day as needed.

// Demo roster — used as fallback when no daily staffing has been entered yet
const DEMO_CREW = [
  // Command
  { id: 'd-bc',  member_name: 'BC Mitchell',       member_rank: 'Battalion Chief', apparatus_name: '', position: 'Battalion Chief' },
  { id: 'd-dc',  member_name: 'DC Reynolds',        member_rank: 'Deputy Chief',    apparatus_name: '', position: 'Deputy Chief' },
  { id: 'd-fc',  member_name: 'Chief Harrington',   member_rank: 'Fire Chief',      apparatus_name: '', position: 'Fire Chief' },
  // Engine 1
  { id: 'd-e1a', member_name: 'Capt. Rodriguez',    member_rank: 'Captain',         apparatus_name: 'Engine 1',  position: 'Captain' },
  { id: 'd-e1b', member_name: 'FF Johnson',          member_rank: 'Firefighter',     apparatus_name: 'Engine 1',  position: 'Driver/Engineer' },
  { id: 'd-e1c', member_name: 'FF Williams',         member_rank: 'Firefighter',     apparatus_name: 'Engine 1',  position: 'Firefighter' },
  { id: 'd-e1d', member_name: 'FF Davis',            member_rank: 'Firefighter/EMT', apparatus_name: 'Engine 1',  position: 'Firefighter' },
  // Engine 2
  { id: 'd-e2a', member_name: 'Lt. Murphy',          member_rank: 'Lieutenant',      apparatus_name: 'Engine 2',  position: 'Lieutenant' },
  { id: 'd-e2b', member_name: 'FF Taylor',           member_rank: 'Firefighter',     apparatus_name: 'Engine 2',  position: 'Driver/Engineer' },
  { id: 'd-e2c', member_name: 'FF Anderson',         member_rank: 'Firefighter',     apparatus_name: 'Engine 2',  position: 'Firefighter' },
  { id: 'd-e2d', member_name: 'FF Thompson',         member_rank: 'Firefighter/EMT', apparatus_name: 'Engine 2',  position: 'Firefighter' },
  // Engine 3
  { id: 'd-e3a', member_name: 'Capt. Hayes',         member_rank: 'Captain',         apparatus_name: 'Engine 3',  position: 'Captain' },
  { id: 'd-e3b', member_name: 'FF Martinez',         member_rank: 'Firefighter',     apparatus_name: 'Engine 3',  position: 'Driver/Engineer' },
  { id: 'd-e3c', member_name: 'FF Wilson',           member_rank: 'Firefighter',     apparatus_name: 'Engine 3',  position: 'Firefighter' },
  // Engine 4
  { id: 'd-e4a', member_name: 'Lt. Parker',          member_rank: 'Lieutenant',      apparatus_name: 'Engine 4',  position: 'Lieutenant' },
  { id: 'd-e4b', member_name: 'FF White',            member_rank: 'Firefighter',     apparatus_name: 'Engine 4',  position: 'Driver/Engineer' },
  { id: 'd-e4c', member_name: 'FF Harris',           member_rank: 'Firefighter',     apparatus_name: 'Engine 4',  position: 'Firefighter' },
  // Truck 1
  { id: 'd-t1a', member_name: 'Capt. Brooks',        member_rank: 'Captain',         apparatus_name: 'Truck 1',   position: 'Captain' },
  { id: 'd-t1b', member_name: 'FF Lee',              member_rank: 'Firefighter',     apparatus_name: 'Truck 1',   position: 'Driver/Engineer' },
  { id: 'd-t1c', member_name: 'FF Scott',            member_rank: 'Firefighter',     apparatus_name: 'Truck 1',   position: 'Firefighter' },
  { id: 'd-t1d', member_name: 'FF Green',            member_rank: 'Firefighter/EMT', apparatus_name: 'Truck 1',   position: 'Firefighter' },
  // Truck 2
  { id: 'd-t2a', member_name: 'Lt. Adams',           member_rank: 'Lieutenant',      apparatus_name: 'Truck 2',   position: 'Lieutenant' },
  { id: 'd-t2b', member_name: 'FF Baker',            member_rank: 'Firefighter',     apparatus_name: 'Truck 2',   position: 'Driver/Engineer' },
  { id: 'd-t2c', member_name: 'FF Nelson',           member_rank: 'Firefighter',     apparatus_name: 'Truck 2',   position: 'Firefighter' },
];

function getRankColor(rank) {
  const r = (rank || '').toLowerCase();
  if (r.includes('captain') || r.includes('lieutenant')) return 'bg-red-600';
  if (r.includes('chief') || r.includes('bc') || r.includes('dc')) return 'bg-red-800';
  if (r.includes('driver') || r.includes('engineer')) return 'bg-orange-600';
  if (r.includes('paramedic')) return 'bg-emerald-600';
  if (r.includes('emt')) return 'bg-green-600';
  if (r.includes('probationary')) return 'bg-amber-600';
  return 'bg-gray-600';
}

function getInitials(name) {
  return (name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function isCommandRank(rank, position) {
  const r = (rank || '').toLowerCase();
  const p = (position || '').toLowerCase();
  return (
    r.includes('battalion') || r.includes('deputy chief') ||
    r === 'chief' || r === 'fire chief' ||
    p.includes('battalion') || p.includes('officer in charge') || p.includes('deputy chief')
  );
}

function RunList({ onCrewLoaded, selectedStation = null, stations = [], onStationChange = null }) {
  // Multi-house depts post a SEPARATE riding board per station (per-station grain,
  // migration 0072). With no house picked, show the all-houses rollup instead of a
  // single board (the server 400s a station-less run-list read for a multi-house dept).
  const isMultiHouse = Array.isArray(stations) && stations.length > 1;
  const stationName = selectedStation && Array.isArray(stations)
    ? (stations.find((s) => s.id === selectedStation)?.name || null)
    : null;
  const [crew,         setCrew]         = useState([]);
  const [todayData,    setTodayData]    = useState(null);
  const [shiftLabel,   setShiftLabel]   = useState('');
  const [loading,      setLoading]      = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [submittedAt,  setSubmittedAt]  = useState(null);
  const [editMode,     setEditMode]     = useState(false);
  const [recallList,   setRecallList]   = useState([]);
  const [recallInput,  setRecallInput]  = useState('');

  const loadRunList = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);
    const today = localToday();
    // Multi-house + no station picked → the all-houses rollup owns the view; don't
    // fetch a single board (a station-less read 400s STATION_REQUIRED for such depts).
    if (isMultiHouse && !selectedStation) {
      setCrew([]); setSubmittedAt(null);
      if (isInitialLoad) setLoading(false);
      return;
    }
    const stationQ = selectedStation ? `&station_id=${selectedStation}` : '';
    try {
      const [shiftsRaw, tRes, savedRunList] = await Promise.all([
        api.get(`/api/shifts?date=${today}`).catch(() => []),
        api.get('/api/dashboard/today').catch(() => null),
        api.get(`/api/run-list/today?date=${today}${stationQ}&_=${Date.now()}`).catch(() => null),
      ]);

      const allShifts = Array.isArray(shiftsRaw?.data) ? shiftsRaw.data
                      : Array.isArray(shiftsRaw) ? shiftsRaw : [];
      const shifts = allShifts.filter(s => s.date === today);

      const tData = tRes?.items ? tRes : (tRes?.data ?? tRes ?? null);
      if (isInitialLoad) setTodayData(tData);
      if (shifts.length > 0 && !shiftLabel) setShiftLabel(shifts[0].shiftType + ' Shift');

      // Use the saved run list snapshot (written by "Save to Board" on Assignment Board
      // or "Submit Run List" button here). This is the same source the TV display uses,
      // so The Board and the TV always show identical data after a save.
      const saved = savedRunList?.data ?? savedRunList ?? null;
      const savedCrew = saved?.payload?.crew ?? null;

      if (savedCrew && savedCrew.length > 0) {
        const normalized = savedCrew.map(a => {
          const position = a.position_name || a.position || '';
          return {
            ...a,
            position,
            // Display-only: an officer seat never shows "FF" — derive A/C / A/L.
            // Real member_rank is preserved for grouping/officer detection.
            display_rank: actingDisplayRank(a.member_rank || a.rank, position, a.min_rank),
          };
        });
        setCrew(normalized);
        setSubmittedAt(saved.submitted_at || new Date().toISOString());
        if (onCrewLoaded) onCrewLoaded(normalized, tData);
      } else {
        // No saved run list yet — show empty state (not demo data)
        setCrew([]);
        setSubmittedAt(null);
        if (onCrewLoaded) onCrewLoaded([], tData);
      }
    } catch (_) {
      // silent — keep whatever is currently displayed
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, [selectedStation, isMultiHouse]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load on mount and whenever the picked station changes. No auto-refresh —
  // the run list only changes when "Save to Board" is clicked on the Assignment
  // Board (or "Submit Run List" here).
  useEffect(() => {
    loadRunList(true);
  }, [loadRunList]);

  // Instant update when the Assignment Board's "Save to Board" button is clicked.
  // The crew is embedded directly in the broadcast message — no API round-trip,
  // so The Board updates the moment the save completes with zero lag.
  useEffect(() => {
    const bc = new BroadcastChannel('openfirehouse');
    bc.onmessage = (e) => {
      if (e.data?.type !== 'run-list-saved') return;
      const { crew: savedCrew, submitted_at } = e.data;
      if (savedCrew?.length > 0) {
        const normalized = savedCrew.map(a => {
          const position = a.position_name || a.position || '';
          return {
            ...a,
            position,
            // Display-only: an officer seat never shows "FF" — derive A/C / A/L.
            // Real member_rank is preserved for grouping/officer detection.
            display_rank: actingDisplayRank(a.member_rank || a.rank, position, a.min_rank),
          };
        });
        setCrew(normalized);
        setSubmittedAt(submitted_at || new Date().toISOString());
        if (onCrewLoaded) onCrewLoaded(normalized, null);
      }
    };
    return () => bc.close();
  }, [onCrewLoaded]);

  // Group crew into command staff, apparatus buckets, and unassigned
  const { commandStaff, apparatusGroups, unassigned } = useMemo(() => {
    const command = [];
    const groups  = {};
    const unass   = [];

    for (const m of crew) {
      const rank     = m.member_rank || m.rank || '';
      const apparatus = (m.apparatus_name || '').trim();
      const position  = m.position || '';
      const onUnit    = apparatus && apparatus.toLowerCase() !== 'recall';

      if (isCommandRank(rank, position)) {
        command.push(m);
        // A command officer who also rides a unit (e.g. a BC commanding
        // Battalion 1 with an aide) appears on that unit too, as its officer —
        // while still being highlighted up top in Command Staff.
        if (onUnit) {
          if (!groups[apparatus]) groups[apparatus] = [];
          groups[apparatus].push(m);
        }
        continue;
      }
      if (onUnit) {
        if (!groups[apparatus]) groups[apparatus] = [];
        groups[apparatus].push(m);
      } else {
        unass.push(m);
      }
    }
    return { commandStaff: command, apparatusGroups: groups, unassigned: unass };
  }, [crew]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // 1.1b consolidation: the run list is DERIVED server-side from today's
      // apparatus_assignments — we publish by date and re-read the snapshot, we
      // do NOT post a client-authored crew[]. Assign crew on the Assignment
      // Board; this button freezes those assignments into the dated record.
      // Per-station grain: scope the publish to the picked house (multi-house depts
      // require it; single-house depts omit it and the server resolves the one house).
      await api.post('/api/run-list', { date: localToday(), ...(selectedStation ? { station_id: selectedStation } : {}) });
      setSubmittedAt(new Date().toISOString());
      await loadRunList(false); // reflect exactly what the server derived
    } catch (_) {
      // still mark as submitted locally even if server save fails
      setSubmittedAt(new Date().toISOString());
    } finally {
      setSubmitting(false);
    }
  }

  function addRecall() {
    const name = recallInput.trim();
    if (name && !recallList.includes(name)) {
      setRecallList(r => [...r, name]);
      setRecallInput('');
    }
  }

  function removeRecall(name) {
    setRecallList(r => r.filter(n => n !== name));
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-50 dark:bg-gray-950 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-50 dark:bg-gray-950 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  const apparatusNames = Object.keys(apparatusGroups).sort();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Helper: find the OIC/captain on a given apparatus
  function getOfficer(members) {
    return members.find(m => {
      const r = (m.member_rank || m.rank || '').toLowerCase();
      const p = (m.position || '').toLowerCase();
      return r.includes('captain') || r.includes('lieutenant') || r.includes('chief') || r.includes('battalion') || r === 'bc'
        || p === 'captain' || p.includes('officer') || p.includes('chief') || p.includes('battalion');
    });
  }

  // Specific command staff lookups
  const ridingBC  = commandStaff.find(m => {
    const r = (m.member_rank || m.rank || '').toLowerCase();
    const p = (m.position || '').toLowerCase();
    return r.includes('battalion') || p.includes('battalion') || p.includes('officer in charge');
  });
  const ridingDC  = commandStaff.find(m => {
    const r = (m.member_rank || m.rank || '').toLowerCase();
    return r.includes('deputy');
  });
  const fireChief = commandStaff.find(m => {
    const r = (m.member_rank || m.rank || '').toLowerCase();
    return (r === 'chief' || r === 'fire chief') && !r.includes('battalion') && !r.includes('deputy');
  });

  // Print the run list as a clean, page-friendly document (Save as PDF in the
  // browser print dialog). Renders from the same grouped data shown on screen.
  function printRunList() {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const dept = todayData?.station?.name || todayData?.station_name || todayData?.stationName || '';
    const rider = (m, isOfficer) => `<div class="rider"><span class="${isOfficer ? 'officer' : ''}">${esc(m.member_name || m.name || '')}</span><span class="rank">${esc(m.display_rank || m.member_rank || m.rank || m.position || '')}</span></div>`;
    const cmdSlot = (label, m) => `<div class="rider"><span class="cmd-role">${esc(label)}</span><span>${m ? esc(m.member_name || m.name) + ' &middot; ' + esc(m.member_rank || m.rank || '') : '<span class="muted">Unassigned</span>'}</span></div>`;
    const unitNames = Object.keys(apparatusGroups).sort();
    const unitsHtml = unitNames.map((name) => {
      const mems = apparatusGroups[name];
      const officer = getOfficer(mems);
      const ordered = officer ? [officer, ...mems.filter((x) => x !== officer)] : mems;
      return `<div class="unit"><div class="unit-h"><span>${esc(name)}</span><span>${mems.length} riding</span></div>${ordered.map((m) => rider(m, m === officer)).join('')}</div>`;
    }).join('');
    const unassignedHtml = unassigned.length
      ? `<div class="st">On Recall / Unassigned</div><div class="grid"><div class="unit"><div class="unit-h"><span>Unassigned</span><span>${unassigned.length}</span></div>${unassigned.map((m) => rider(m, false)).join('')}</div></div>`
      : '';
    const submitted = submittedAt ? ' &middot; Submitted ' + new Date(submittedAt).toLocaleString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Run List ${esc(today)}</title><style>
      @page{margin:.5in}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}
      h1{font-size:18px;margin:0 0 2px}.sub{color:#555;font-size:12px;margin-bottom:8px}.accent{height:3px;background:#C0392B;margin:6px 0 14px}
      .st{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#888;margin:16px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}
      .grid{display:flex;flex-wrap:wrap;gap:10px}
      .unit{flex:1 1 30%;min-width:30%;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;page-break-inside:avoid;margin-bottom:8px}
      .unit-h{background:#0D1B2A;color:#fff;padding:5px 9px;font-weight:bold;font-size:12px;display:flex;justify-content:space-between}
      .rider{display:flex;justify-content:space-between;align-items:center;padding:4px 9px;border-bottom:1px solid #f0f0f0;font-size:12px}
      .rider:last-child{border-bottom:0}.officer{font-weight:bold;color:#C0392B}.rank{color:#888;font-size:11px}.cmd-role{color:#C0392B;font-weight:bold;font-size:11px}.muted{color:#aaa;font-style:italic}
    </style></head><body>
      <h1>${dept ? esc(dept) + ' &mdash; ' : ''}Daily Run List</h1>
      <div class="sub">${esc(shiftLabel || '')}${shiftLabel ? ' &middot; ' : ''}${esc(today)}${submitted}</div>
      <div class="accent"></div>
      <div class="st">Command Staff</div>
      <div class="grid"><div class="unit">${cmdSlot('Riding B/C', ridingBC)}${cmdSlot('Riding D/C', ridingDC)}${cmdSlot('Fire Chief', fireChief)}</div></div>
      <div class="st">Apparatus in Service &mdash; ${unitNames.length} units</div>
      <div class="grid">${unitsHtml}</div>
      ${unassignedHtml}
    </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups for this site to print the run list.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (_) { /* user can print manually */ } }, 300);
  }

  // Multi-house command view: no single house picked → show every station at a glance.
  if (isMultiHouse && !selectedStation) {
    return <AllStationsBoard onSelectStation={onStationChange || undefined} />;
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-red-600 dark:text-red-400" />
            <span className="text-sm font-black text-gray-900 dark:text-gray-100 uppercase tracking-wide">Run List</span>
            {stationName && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300" title="This board is scoped to one station">
                {stationName}
              </span>
            )}
            {shiftLabel && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">{shiftLabel}</span>
            )}
            <span className="text-[10px] text-gray-400 hidden sm:inline">{today}</span>
          </div>
          <div className="flex items-center gap-2">
            {submittedAt ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300">
                <CheckCircle2 size={10} /> Submitted {new Date(submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">Draft</span>
            )}
            <button
              onClick={printRunList}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Print the run list — choose 'Save as PDF' in the print dialog"
            >
              <Printer size={11} /> Print
            </button>
            <button
              onClick={() => setEditMode(e => !e)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                editMode ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Pencil size={11} /> {editMode ? 'Done' : 'Edit'}
            </button>
            {/* Blue, not red. Red is the app's EMERGENCY colour — the active-incident
                banner, the dispatch nav and the alert pill all wear it. Saving a run
                list is the most ordinary write on this screen; dressing it as danger
                both overstates it and dilutes red where red actually means something. */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition-colors"
            >
              {submitting ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {submittedAt ? 'Update' : 'Submit Run List'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">

        {/* ── Command Staff ── */}
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Command Staff</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">

            {/* Riding BC */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50">
              <div className="w-9 h-9 rounded-lg bg-red-700 flex items-center justify-center text-white font-black text-xs shrink-0">
                {ridingBC ? getInitials(ridingBC.member_name || ridingBC.name) : 'BC'}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Riding B/C</p>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                  {ridingBC ? (ridingBC.member_name || ridingBC.name)
                    : <span className="text-gray-400 font-normal italic text-xs">Unassigned</span>}
                </p>
                {ridingBC && <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{ridingBC.member_rank || ridingBC.rank}</p>}
              </div>
            </div>

            {/* Riding DC */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/50">
              <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center text-white font-black text-xs shrink-0">
                {ridingDC ? getInitials(ridingDC.member_name || ridingDC.name) : 'DC'}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Riding D/C</p>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                  {ridingDC ? (ridingDC.member_name || ridingDC.name)
                    : <span className="text-gray-400 font-normal italic text-xs">Unassigned</span>}
                </p>
                {ridingDC && <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{ridingDC.member_rank || ridingDC.rank}</p>}
              </div>
            </div>

            {/* Fire Chief */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
              <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-white font-black text-xs shrink-0">
                {fireChief ? getInitials(fireChief.member_name || fireChief.name) : 'FC'}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Fire Chief</p>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                  {fireChief ? (fireChief.member_name || fireChief.name)
                    : <span className="text-gray-400 font-normal italic text-xs">Not on duty</span>}
                </p>
                {fireChief && <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{fireChief.member_rank || fireChief.rank}</p>}
              </div>
            </div>

          </div>
        </div>

        {/* ── Apparatus in Service ── */}
        {apparatusNames.length > 0 ? (
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Apparatus in Service
              <span className="ml-1.5 text-gray-300 dark:text-gray-600 font-normal normal-case tracking-normal">{apparatusNames.length} unit{apparatusNames.length !== 1 ? 's' : ''}</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {apparatusNames.map(apName => {
                const members = apparatusGroups[apName];
                const officer = getOfficer(members);
                const firefighters = members.filter(m => m !== officer);

                return (
                  <div key={apName} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden hover:shadow-md transition-shadow">
                    {/* Apparatus name bar */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-white">
                      <Truck size={12} className="text-gray-400 shrink-0" />
                      <span className="text-sm font-black tracking-wide flex-1">{apName}</span>
                      <span className="text-[10px] text-gray-400">{members.length} riding</span>
                    </div>

                    {/* Officer / Captain row */}
                    <div className="px-3 py-2 bg-red-50 dark:bg-red-950/50 border-b border-gray-100 dark:border-gray-700">
                      {officer ? (
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-md ${getRankColor(officer.member_rank || officer.rank)} flex items-center justify-center text-white text-[9px] font-black shrink-0`}>
                            {getInitials(officer.member_name || officer.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{officer.member_name || officer.name}</p>
                            <p className="text-[9px] text-red-600 dark:text-red-400 font-bold capitalize">{officer.display_rank || officer.member_rank || officer.rank}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No officer assigned</p>
                      )}
                    </div>

                    {/* Crew members */}
                    <div className="px-3 py-2.5 space-y-2">
                      {firefighters.length > 0 ? firefighters.map((m, i) => {
                        const name = m.member_name || m.name;
                        const rank = m.display_rank || m.member_rank || m.rank || 'Firefighter';
                        return (
                          <div key={m.id || i} className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded ${getRankColor(rank)} flex items-center justify-center text-white text-[8px] font-black shrink-0`}>
                              {getInitials(name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 truncate flex items-center gap-1">
                                {name}
                                {m.detailed && (
                                  <span
                                    className="shrink-0 px-1 py-px rounded text-[8px] font-black bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                                    title={m.home_station_name ? `Detailed in from ${m.home_station_name}` : 'Detailed in from another station'}
                                  >
                                    DETAIL{m.home_station_name ? ` · ${m.home_station_name}` : ''}
                                  </span>
                                )}
                              </p>
                              <p className="text-[9px] text-gray-400 capitalize">{rank}</p>
                            </div>
                          </div>
                        );
                      }) : (
                        <p className="text-[10px] text-gray-400 italic">No crew assigned</p>
                      )}
                      {editMode && (
                        <button className="w-full mt-1 flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                          <Plus size={10} /> Add member
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : crew.length === 0 ? (
          <div className="text-center py-8">
            <Truck size={28} className="mx-auto mb-2 text-gray-200" />
            <p className="text-sm font-bold text-gray-400">No run list for today yet</p>
            <p className="text-xs text-gray-400 mt-1">Use Daily Staffing to assign apparatus and crew, then submit.</p>
          </div>
        ) : null}

        {/* ── Unassigned members ── */}
        {unassigned.length > 0 && (
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Unassigned</p>
            <div className="flex flex-wrap gap-2">
              {unassigned.map((m, i) => {
                const name = m.member_name || m.name;
                const rank = m.display_rank || m.member_rank || m.rank || 'Firefighter';
                return (
                  <div key={m.id || i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className={`w-5 h-5 rounded ${getRankColor(rank)} flex items-center justify-center text-white text-[8px] font-black shrink-0`}>
                      {getInitials(name)}
                    </div>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Recall List ── */}
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            On Recall
            {recallList.length > 0 && (
              <span className="ml-1.5 text-amber-500 font-bold">{recallList.length} member{recallList.length !== 1 ? 's' : ''}</span>
            )}
          </p>
          {recallList.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {recallList.map((name, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900">
                  <div className="w-5 h-5 rounded bg-amber-500 flex items-center justify-center text-white text-[8px] font-black shrink-0">
                    {name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <span className="text-xs font-medium text-amber-800 dark:text-amber-300">{name}</span>
                  {editMode && (
                    <button onClick={() => removeRecall(name)} aria-label={`Remove ${name} from recall`} className="ml-0.5 text-amber-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic mb-2">No members on recall</p>
          )}
          {editMode && (
            <div className="flex gap-2">
              <input
                type="text"
                value={recallInput}
                onChange={e => setRecallInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRecall()}
                placeholder="Member name..."
                aria-label="Member name to add to recall"
                className="flex-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                onClick={addRecall}
                disabled={!recallInput.trim()}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors"
              >
                <Plus size={11} /> Add
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Zone F: Turnover Intelligence Feed (Hybrid Layer 4) ────────────────────
// AI-powered feed scanning all modules for items that need attention:
// expiring certs, overdue maintenance, open action items, pending trades, etc.

function TurnoverFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Gather intelligence from multiple API endpoints
    Promise.all([
      api.get('/api/dashboard/briefing').catch(() => null),
      api.get('/api/alerts').catch(() => null),
    ]).then(([briefingRes, alertsRes]) => {
      const feed = [];

      // Pull AI insights
      const briefing = briefingRes?.data ?? briefingRes;
      if (briefing?.insights) {
        briefing.insights.forEach(ins => {
          feed.push({
            id: `ai-${ins.headline}`,
            icon: ins.icon || '🤖',
            text: ins.headline,
            detail: ins.detail,
            priority: ins.priority || 3,
            source: 'AI Briefing',
            color: ins.priority === 1 ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50' :
                   ins.priority === 2 ? 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50' :
                   'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50',
          });
        });
      }

      // Pull alerts
      const alerts = Array.isArray(alertsRes) ? alertsRes : (alertsRes?.data || []);
      alerts.slice(0, 8).forEach(alert => {
        const pri = alert.level === 'critical' ? 1 : alert.level === 'warning' ? 2 : 3;
        feed.push({
          id: `alert-${alert.id}`,
          icon: pri === 1 ? '🔴' : pri === 2 ? '🟡' : '🔵',
          text: alert.message || alert.title,
          detail: alert.detail || alert.module,
          priority: pri,
          source: alert.module || 'System',
          color: pri === 1 ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50' :
                 pri === 2 ? 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50' :
                 'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50',
        });
      });

      // Sort by priority (1 = critical first)
      feed.sort((a, b) => a.priority - b.priority);
      setItems(feed.slice(0, 10));
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse">
        <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/4 mb-3" />
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-50 dark:bg-gray-950 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        className="w-full px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-black text-gray-900 dark:text-gray-100 uppercase tracking-wide">Turnover Intelligence</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{items.length}</span>
        </div>
        {collapsed
          ? <ChevronDown size={16} className="text-gray-400" />
          : <ChevronUp size={16} className="text-gray-400" />
        }
      </button>
      {!collapsed && (
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {items.map(item => (
            <div key={item.id} className={`px-5 py-2.5 flex items-start gap-3 ${item.color}`}>
              <span className="text-base mt-0.5 shrink-0">{item.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{item.text}</p>
                {item.detail && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{item.detail}</p>}
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/70 text-gray-500 dark:text-gray-400 shrink-0 mt-0.5">{item.source}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// CSS Animations
function StyleInjector() {
  return (
    <style>{`
      @keyframes pulse-ring {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
        50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
      }

      @keyframes slide-in-right {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes glow-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }

      .today-pulse {
        animation: pulse-ring 2s infinite;
      }

      .panel-slide-in {
        animation: slide-in-right 0.3s ease-out;
      }

      .fade-transition {
        animation: fade-in 0.2s ease-out;
      }

      .crew-badge {
        transition: all 0.2s ease;
      }

      .crew-badge:hover {
        transform: scale(1.15);
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
      }

      .day-cell {
        transition: all 0.2s ease;
      }

      .day-cell:hover {
        transform: translateY(-2px);
      }

      .event-pill {
        transition: all 0.2s ease;
      }

      .event-pill:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        transform: translateY(-1px);
      }
    `}</style>
  );
}

// Type Badge Component
function TypeBadge({ type, size = 'sm' }) {
  const colors = getEventColor(type);
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full font-semibold text-xs ${colors.light} ${colors.lightText}`}>
      {type}
    </span>
  );
}

// ─── Activity Calendar ────────────────────────────────────────────────────────
// Same 7-col month grid as MonthCalendar, but populated with activity-log
// entries from /api/activity-entries instead of events.

const ACTIVITY_TYPE_COLORS = {
  'scba-check':        { bg: 'bg-blue-500',   label: 'SCBA'        },
  'meter-check':       { bg: 'bg-cyan-500',    label: 'Meter'       },
  'aerial-check-equip':{ bg: 'bg-indigo-500',  label: 'Aerial'      },
  'rope-log':          { bg: 'bg-purple-500',  label: 'Rope'        },
  'hose-inventory':    { bg: 'bg-violet-500',  label: 'Hose'        },
  'ladder-inventory':  { bg: 'bg-fuchsia-500', label: 'Ladder'      },
  'rig-inventory':     { bg: 'bg-pink-500',    label: 'Rig'         },
  'apparatus-check':   { bg: 'bg-green-600',   label: 'Apparatus'   },
  'equip-check':       { bg: 'bg-blue-600',    label: 'Equip'       },
  'maintenance':       { bg: 'bg-amber-500',   label: 'Maint.'      },
  'training':          { bg: 'bg-purple-600',  label: 'Training'    },
  'hydrant':           { bg: 'bg-teal-500',    label: 'Hydrant'     },
  'fuel':              { bg: 'bg-orange-500',  label: 'Fuel'        },
  'visitor':           { bg: 'bg-gray-500',    label: 'Visitor'     },
  'note':              { bg: 'bg-red-500',     label: 'Note'        },
};

function activityDotColor(type) {
  return (ACTIVITY_TYPE_COLORS[type] || { bg: 'bg-gray-400' }).bg;
}
function activityLabel(type) {
  return (ACTIVITY_TYPE_COLORS[type] || { label: type || 'Activity' }).label;
}

function ActivityCalendar({ year, month }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  // Fetch entries for the displayed month
  useEffect(() => {
    setLoading(true);
    const mm = String(month + 1).padStart(2, '0');
    api.get(`/api/activity-entries?month=${year}-${mm}`)
      .catch(() => [])
      .then(res => {
        const data = res?.data || res || [];
        setEntries(Array.isArray(data) ? data : []);
      })
      .finally(() => setLoading(false));
  }, [year, month]);

  const firstDay   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Group entries by date string YYYY-MM-DD
  const byDay = useMemo(() => {
    const map = {};
    for (const e of entries) {
      const d = (e.date || '').slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(e);
    }
    return map;
  }, [entries]);

  const todayIso = localToday();

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden animate-pulse">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map(w => (
            <div key={w} className="py-3 px-2 text-center bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-bold text-gray-300 dark:text-gray-600 uppercase">{w}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="aspect-square border border-gray-100 dark:border-gray-700 bg-gray-50/40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
      {/* Weekday header */}
      <div className="grid grid-cols-7 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 dark:border-gray-700">
        {WEEKDAYS.map(w => (
          <div key={w} className="py-3 px-2 text-center">
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-widest">{w}</span>
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0">
        {cells.map((day, idx) => {
          if (!day) {
            // Out-of-month filler. `bg-gray-50/30` had no dark twin, so in dark
            // mode a near-white wash sat over the page and these EMPTY cells
            // became the brightest, highest-contrast thing on the grid — muted
            // content advancing instead of receding. Same class as the light-only
            // unread tint fixed 2026-08-05: a light value with no dark counterpart
            // is not "neutral", it inverts the hierarchy.
            return <div key={`empty-${idx}`} aria-hidden="true" className="aspect-square bg-gray-50/30 dark:bg-gray-950/60 border border-gray-100 dark:border-gray-800" />;
          }

          const iso     = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayEntries = byDay[iso] || [];
          const isToday = iso === todayIso;
          const isPast  = iso < todayIso;
          const selected = selectedDay === iso;

          // Unique types for dots (max 4)
          const typesSeen = [];
          for (const e of dayEntries) {
            if (!typesSeen.includes(e.entry_type)) typesSeen.push(e.entry_type);
            if (typesSeen.length >= 4) break;
          }

          return (
            <button
              key={iso}
              onClick={() => setSelectedDay(selected ? null : iso)}
              className={`relative aspect-square border border-gray-100 dark:border-gray-700 p-1.5 text-left transition-all duration-200 overflow-hidden
                ${isToday ? 'bg-gradient-to-br from-red-50 via-red-50/30 to-white dark:from-red-950/40 dark:via-red-950/20 dark:to-gray-900 border-red-200 dark:border-red-900 border-2' : ''}
                ${isPast && !isToday ? 'bg-gray-50/50 dark:bg-gray-900/50 opacity-70' : ''}
                ${!isPast && !isToday && dayEntries.length > 0 ? 'bg-gradient-to-br from-blue-50/40 to-white dark:from-blue-950/30 dark:to-gray-900' : ''}
                ${selected ? 'ring-2 ring-red-500 ring-inset shadow-lg' : ''}
                ${!isPast ? 'hover:shadow-md' : ''}
              `}
            >
              {isToday && <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500" />}

              {/* Day number */}
              <div className="flex justify-between items-start mb-1">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs
                  ${isToday ? 'bg-red-500 text-white shadow' : 'text-gray-700 dark:text-gray-300'}
                `}>
                  {day}
                </span>
                {dayEntries.length > 0 && (
                  <span className="text-[9px] font-black text-gray-400">{dayEntries.length}</span>
                )}
              </div>

              {/* Activity type dots */}
              <div className="flex flex-wrap gap-0.5">
                {typesSeen.map((type, ti) => (
                  <span key={ti} className={`w-1.5 h-1.5 rounded-full ${activityDotColor(type)}`} />
                ))}
              </div>

              {/* Label for first entry type on larger cells */}
              {dayEntries.length > 0 && (
                <p className="hidden sm:block text-[9px] font-semibold text-gray-500 dark:text-gray-400 mt-0.5 truncate leading-tight">
                  {activityLabel(dayEntries[0].entry_type)}
                  {dayEntries.length > 1 ? ` +${dayEntries.length - 1}` : ''}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Day detail panel */}
      {selectedDay && (
        <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-gray-700 dark:text-gray-300">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <button onClick={() => setSelectedDay(null)} aria-label="Close day details" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X size={14} />
            </button>
          </div>
          {(byDay[selectedDay] || []).length === 0 ? (
            <p className="text-xs text-gray-400 italic">No activities logged this day.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {(byDay[selectedDay] || []).map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${activityDotColor(e.entry_type)}`} />
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{activityLabel(e.entry_type)}</span>
                  {e.apparatus && <span className="text-gray-400">— {e.apparatus}</span>}
                  {e.entered_by && <span className="text-gray-400 ml-auto shrink-0">{e.entered_by}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// MONTH VIEW - THE HERO COMPONENT
function MonthCalendar({ events, year, month, onDaySelect, selectedDay, members }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function getCrewForDay(iso) {
    const dayEvents = events.filter(e => e.date === iso);
    const crewSet = new Set();

    dayEvents.forEach(ev => {
      if (ev.type?.toLowerCase().includes('shift')) {
        ev.rsvps?.forEach(rsvp => {
          if (rsvp.status === 'Going') {
            crewSet.add(rsvp.memberName);
          }
        });
      }
    });

    members.forEach(member => {
      const memberEvents = dayEvents.filter(e =>
        e.rsvps?.some(r => r.memberId === member.id && r.status === 'Going')
      );
      if (memberEvents.length > 0 && !crewSet.has(member.name)) {
        crewSet.add(member.name);
      }
    });

    return Array.from(crewSet).slice(0, 6);
  }

  function getStaffingLevel(crew) {
    if (crew.length === 0) return 'quiet';
    if (crew.length >= 5) return 'full';
    if (crew.length >= 3) return 'staffed';
    return 'minimal';
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 dark:border-gray-700">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-3 px-2 text-center">
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-widest">{w}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0">
        {cells.map((day, idx) => {
          if (!day) {
            // Out-of-month filler. `bg-gray-50/30` had no dark twin, so in dark
            // mode a near-white wash sat over the page and these EMPTY cells
            // became the brightest, highest-contrast thing on the grid — muted
            // content advancing instead of receding. Same class as the light-only
            // unread tint fixed 2026-08-05: a light value with no dark counterpart
            // is not "neutral", it inverts the hierarchy.
            return <div key={`empty-${idx}`} aria-hidden="true" className="aspect-square bg-gray-50/30 dark:bg-gray-950/60 border border-gray-100 dark:border-gray-800" />;
          }

          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayEvents = events.filter((e) => e.date === iso);
          const today = isToday(iso);
          const selected = selectedDay === iso;
          const past = isPast(iso) && !today;
          const crew = getCrewForDay(iso);
          const staffingLevel = getStaffingLevel(crew);

          let bgGradient = 'bg-white dark:bg-gray-900';
          if (today) {
            bgGradient = 'bg-gradient-to-br from-red-50 via-red-50/30 to-white dark:from-red-950/40 dark:via-red-950/20 dark:to-gray-900';
          } else if (past) {
            bgGradient = 'bg-gray-50/50 dark:bg-gray-900/50';
          } else if (dayEvents.length >= 4) {
            bgGradient = 'bg-gradient-to-br from-amber-50/60 to-orange-50/30 dark:from-amber-950/40 dark:to-orange-950/20';
          } else if (dayEvents.length >= 2) {
            bgGradient = 'bg-gradient-to-br from-blue-50/40 to-white dark:from-blue-950/30 dark:to-gray-900';
          }

          return (
            <button
              key={iso}
              onClick={() => onDaySelect(selected ? null : iso)}
              className={`day-cell relative aspect-square border border-gray-100 dark:border-gray-700 p-2 text-left transition-all duration-200 overflow-hidden
                ${bgGradient}
                ${today ? 'today-pulse border-red-200 dark:border-red-900 border-2' : ''}
                ${selected ? 'ring-2 ring-red-500 ring-inset shadow-lg' : ''}
                ${past ? 'opacity-60' : ''}
                ${!past && !today ? 'hover:shadow-md hover:bg-gray-50/50 dark:hover:bg-gray-800/50' : ''}
              `}
            >
              {today && <div className="absolute top-0 left-0 right-0 h-1 bg-red-500" />}

              <div className="flex justify-between items-start mb-1 relative z-10">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs
                  ${today ? 'bg-red-500 text-white shadow-lg' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}
                `}>
                  {day}
                </span>

                {crew.length > 0 && (
                  <div className={`w-2 h-2 rounded-full transition-all
                    ${staffingLevel === 'full' ? 'bg-green-500 shadow-sm' : ''}
                    ${staffingLevel === 'staffed' ? 'bg-amber-500 shadow-sm' : ''}
                    ${staffingLevel === 'minimal' ? 'bg-red-500 shadow-sm' : ''}
                  `} title={`${crew.length} crew members`} />
                )}
              </div>

              {crew.length > 0 && (
                <div className="flex gap-1 mb-1.5 flex-wrap z-10">
                  {crew.map((name, i) => {
                    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                    return (
                      <div
                        key={name}
                        className={`crew-badge w-5 h-5 rounded-full ${CREW_COLORS[i % CREW_COLORS.length]} text-white text-xs font-bold flex items-center justify-center shadow-sm`}
                        title={name}
                      >
                        {initials}
                      </div>
                    );
                  })}
                  {crew.length > 6 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold px-1 leading-5">+{crew.length - 6}</div>
                  )}
                </div>
              )}

              <div className="space-y-0.5 z-10 relative">
                {dayEvents.slice(0, 3).map((ev) => {
                  const colors = getEventColor(ev.type);
                  return (
                    <div
                      key={ev.id}
                      className={`event-pill text-xs px-2 py-1 rounded-full font-semibold truncate leading-tight
                        ${colors.light} ${colors.lightText} border border-gray-200/50
                      `}
                      title={ev.title}
                    >
                      {ev.title}
                    </div>
                  );
                })}

                {dayEvents.length > 3 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold px-2 py-0.5">
                    +{dayEvents.length - 3} more
                  </div>
                )}

                {dayEvents.length === 0 && crew.length === 0 && (
                  <div className="text-xs text-gray-300 dark:text-gray-600 italic px-1 py-1 mt-auto">quiet</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// DAY DETAIL PANEL
function DayDetailPanel({ iso, events, members, onClose, onEdit, onDelete, onRsvpChange }) {
  const dayEvents = events.filter(e => e.date === iso);
  const date = new Date(iso);
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });

  const crew = members.filter(m =>
    dayEvents.some(ev => ev.rsvps?.some(r => r.memberId === m.id && r.status === 'Going'))
  );

  const sortedEvents = [...dayEvents].sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  return (
    <div className="panel-slide-in fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl overflow-y-auto z-50 flex flex-col">
      <div className="sticky top-0 bg-gradient-to-r from-red-600 to-red-700 text-white p-6 border-b border-red-800 shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-red-100 uppercase tracking-wide">{dayOfWeek}</p>
            <h2 className="text-2xl font-bold mt-1">{date.getDate()}</h2>
            <p className="text-sm text-red-100 mt-0.5">{MONTHS[date.getMonth()]} {date.getFullYear()}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-red-500 rounded-lg transition-colors"
            title="Close"
            aria-label="Close day panel"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {crew.length > 0 && (
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Users size={16} className="text-red-600 dark:text-red-400" />
              Crew On Duty ({crew.length})
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {crew.map(member => (
                <div
                  key={member.id}
                  className="bg-gradient-to-r from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex items-center gap-3 hover:shadow-md transition-shadow"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white font-bold flex items-center justify-center text-sm">
                    {member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{member.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{member.role || 'Member'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {sortedEvents.length > 0 && (
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Clock size={16} className="text-red-600 dark:text-red-400" />
              Activities
            </h3>
            <div className="space-y-3">
              {sortedEvents.map((ev) => {
                const colors = getEventColor(ev.type);
                const { going, notGoing, maybe } = rsvpCounts(ev.rsvps);

                return (
                  <div
                    key={ev.id}
                    className="relative border-l-4 pl-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className={`absolute -left-3 top-4 w-5 h-5 rounded-full ${colors.light} border-2 border-white shadow-sm`} />
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <TypeBadge type={ev.type} />
                          <h4 className="font-bold text-gray-900 dark:text-gray-100 mt-1 text-sm">{ev.title}</h4>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => onEdit(ev)}
                            aria-label={`Edit ${ev.title}`}
                            className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => onDelete(ev.id)}
                            aria-label={`Delete ${ev.title}`}
                            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                        {ev.startTime && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} className="text-gray-400" />
                            {fmt12(ev.startTime)}{ev.endTime ? ` – ${fmt12(ev.endTime)}` : ''}
                          </span>
                        )}
                        {ev.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} className="text-gray-400" />
                            {ev.location}
                          </span>
                        )}
                      </div>

                      {ev.description && (
                        <p className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 mt-1">
                          {ev.description}
                        </p>
                      )}

                      {ev.rsvps && ev.rsvps.length > 0 && (
                        <div className="flex items-center gap-3 text-xs font-semibold pt-1 border-t border-gray-200 dark:border-gray-700">
                          {going > 0 && <span className="text-green-700 dark:text-green-300">✓ {going} Going</span>}
                          {notGoing > 0 && <span className="text-red-600 dark:text-red-400">✗ {notGoing} Not Going</span>}
                          {maybe > 0 && <span className="text-amber-600 dark:text-amber-400">? {maybe} Maybe</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sortedEvents.length === 0 && crew.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <CalendarOff size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No activities scheduled</p>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-950 sticky bottom-0">
        <button
          onClick={onClose}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Close Panel
        </button>
      </div>
    </div>
  );
}

// LIST VIEW
function ListView({ events, onEdit, onDelete, onRsvpChange, members = [] }) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
  const groups = sorted.reduce((acc, ev) => {
    (acc[ev.date] = acc[ev.date] || []).push(ev);
    return acc;
  }, {});

  if (sorted.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
        <p className="font-medium">No events to display.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([date, evs]) => (
        <div key={date}>
          <div className={`text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2
            ${isToday(date) ? 'text-red-700 dark:text-red-300' : isPast(date) ? 'text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}>
            <span className={`w-2 h-2 rounded-full inline-block ${isToday(date) ? 'bg-red-600' : isPast(date) ? 'bg-gray-300' : 'bg-gray-400'}`} />
            {fmtDateLong(date)}{isToday(date) && <span className="text-red-600 dark:text-red-400 font-bold ml-1">— TODAY</span>}
          </div>
          <div className="space-y-3">
            {evs.map((ev) => {
              const colors = getEventColor(ev.type);
              const { going, notGoing, maybe } = rsvpCounts(ev.rsvps);

              return (
                <div key={ev.id} className="bg-white dark:bg-gray-900 border-l-4 rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                  style={{ borderLeftColor: colors.bg }}>
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <TypeBadge type={ev.type} />
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 mt-1">{ev.title}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{fmtDateLong(ev.date)}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => onEdit(ev)} aria-label={`Edit ${ev.title}`}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => onDelete(ev.id)} aria-label={`Delete ${ev.title}`}
                          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                      {ev.startTime && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} className="text-gray-400" />
                          {fmt12(ev.startTime)}{ev.endTime ? ` – ${fmt12(ev.endTime)}` : ''}
                        </span>
                      )}
                      {ev.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="text-gray-400" />
                          {ev.location}
                        </span>
                      )}
                      {ev.maxAttendees && (
                        <span className="flex items-center gap-1">
                          <Users size={12} className="text-gray-400" />
                          Max {ev.maxAttendees}
                        </span>
                      )}
                    </div>

                    {ev.description && (
                      <p className="text-sm text-gray-700 dark:text-gray-300">{ev.description}</p>
                    )}

                    {ev.rsvps && ev.rsvps.length > 0 && (
                      <div className="flex items-center gap-3 text-xs font-semibold pt-2 border-t border-gray-100 dark:border-gray-700">
                        {going > 0 && <span className="text-green-700 dark:text-green-300">✓ {going} Going</span>}
                        {notGoing > 0 && <span className="text-red-600 dark:text-red-400">✗ {notGoing} Not Going</span>}
                        {maybe > 0 && <span className="text-amber-600 dark:text-amber-400">? {maybe} Maybe</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// AGENDA VIEW
function AgendaView({ events }) {
  const today = localToday();
  const upcoming = [...events]
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''))
    .slice(0, 20);

  if (upcoming.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <CalendarOff size={40} className="mx-auto mb-3 opacity-30" />
        <p className="font-medium">No upcoming events.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {upcoming.map((ev) => {
        const colors = getEventColor(ev.type);
        const past = isPast(ev.date);

        return (
          <div
            key={ev.id}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
              isToday(ev.date)
                ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900'
                : past
                  ? 'opacity-60 bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-700'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:shadow-md'
            }`}
          >
            <div className={`w-1 h-10 rounded-full ${colors.bg}`} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{ev.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{fmtDateLong(ev.date)}{ev.startTime ? ` at ${fmt12(ev.startTime)}` : ''}</p>
            </div>
            <TypeBadge type={ev.type} />
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function EventCalendar({ highlightBulletinId, onHighlightConsumed, selectedStation = null, stations = [], onStationChange = null }) {
  const today = new Date();
  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calendarTab, setCalendarTab] = useState('events'); // 'events' | 'activity'
  const [view, setView] = useState('month');
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [officer, setOfficer] = useState(null);

  // Fetch data
  const fetchEvents = useCallback(async () => {
    try {
      const [resEvents, resMembers] = await Promise.all([
        api.get('/api/events'),
        api.get('/api/members'),
      ]);
      const eventData = Array.isArray(resEvents?.data) ? resEvents.data : Array.isArray(resEvents) ? resEvents : [];
      const memberData = Array.isArray(resMembers?.data) ? resMembers.data : Array.isArray(resMembers) ? resMembers : [];
      setEvents(eventData);
      setMembers(memberData);
    } catch (e) {
      console.error('Failed to fetch events', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Month navigation
  function prevMonth() {
    if (calMonth === 0) {
      setCalYear(y => y - 1);
      setCalMonth(11);
    } else {
      setCalMonth(m => m - 1);
    }
    setSelectedDay(null);
  }

  function nextMonth() {
    if (calMonth === 11) {
      setCalYear(y => y + 1);
      setCalMonth(0);
    } else {
      setCalMonth(m => m + 1);
    }
    setSelectedDay(null);
  }

  // Get visible events
  const monthEvents = useMemo(() => {
    const prefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
    return events.filter(e => e.date.startsWith(prefix));
  }, [events, calYear, calMonth]);

  // CRUD
  async function handleSave(ev) {
    try {
      if (ev.id) {
        const res = await api.patch(`/api/events/${ev.id}`, ev);
        setEvents(es => es.map(e => e.id === ev.id ? res.data : e));
      } else {
        const res = await api.post('/api/events', { ...ev, rsvps: [] });
        setEvents(es => [...es, res.data]);
      }
    } catch (e) {
      console.error('Failed to save event', e);
    }
    setFormOpen(false);
    setEditing(null);
  }

  function handleEdit(ev) {
    setEditing(ev);
    setFormOpen(true);
  }

  async function handleDelete(id) {
    if (window.confirm('Delete this event?')) {
      try {
        await api.delete(`/api/events/${id}`);
        setEvents(es => es.filter(e => e.id !== id));
        setSelectedDay(null);
      } catch (e) {
        console.error('Failed to delete event', e);
      }
    }
  }

  async function handleRsvpChange(eventId, memberId, memberName, status) {
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    const existing = event.rsvps?.find(r => r.memberId === memberId);
    let rsvps;
    if (existing) {
      rsvps = event.rsvps.map(r => r.memberId === memberId ? { ...r, status } : r);
    } else {
      rsvps = [...(event.rsvps ?? []), { memberId, memberName, status }];
    }
    try {
      const res = await api.patch(`/api/events/${eventId}`, { ...event, rsvps });
      setEvents(es => es.map(e => e.id === eventId ? res.data : e));
    } catch (e) {
      console.error('Failed to update RSVP', e);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-4 border-gray-300 dark:border-gray-700 border-t-red-600 animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading station command center…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <StyleInjector />
      <div className="p-6 space-y-4 max-w-7xl mx-auto">

        {/* ═══ THE BOARD — Whiteboard-style greeting header ═══ */}
        <BoardHeader officer={officer} />

        {/* ═══ LAYER 1: THE PULSE — Status strip + AI Briefing ═══ */}
        <AIBriefingBar />
        <ActiveIncidentBanner />
        <ReadinessCards />

        {/* ═══ LAYER 2: THE RUN LIST — Apparatus-centric daily roster ═══ */}
        <RunList
          selectedStation={selectedStation} stations={stations} onStationChange={onStationChange}
          onCrewLoaded={(c) => {
          const oic = c.find(m => m.position === 'Officer in Charge');
          if (oic) setOfficer({ name: oic.member_name || oic.name, rank: oic.member_rank || oic.rank });
        }} />

        {/* ═══ LAYER 4: CONTEXT — Turnover Intelligence ═══ */}
        <TurnoverFeed />

        {/* ═══ Calendar Section Header + Tabs ═══ */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Calendar</h2>
              {/* Tab switcher */}
              <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                {[
                  { id: 'events',   label: 'Events'   },
                  { id: 'activity', label: 'Activity' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setCalendarTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      calendarTab === tab.id
                        ? 'bg-white dark:bg-gray-900 text-red-700 dark:text-red-300 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {calendarTab === 'events' && (
              <div className="flex items-center gap-3">
                {/* View toggle */}
                <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-1 shadow-sm">
                  {['month', 'list', 'agenda'].map(v => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        view === v
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                      }`}
                    >
                      {v === 'month' ? 'Month' : v === 'list' ? 'List' : 'Agenda'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setEditing(null); setFormOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg text-sm"
                >
                  <Plus size={16} /> Add Event
                </button>
              </div>
            )}
          </div>

          {/* Month/Year nav — shown for both tabs in month view */}
          {(calendarTab === 'activity' || view === 'month') && (
            <div className="flex items-center justify-center gap-3 mb-3">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" title="Previous month" aria-label="Previous month">
                <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
              </button>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 min-w-40 text-center">
                {fmtMonthYear(calYear, calMonth)}
              </h2>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" title="Next month" aria-label="Next month">
                <ChevronRight size={20} className="text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          )}
        </div>

        {/* ═══ ZONE E: Events Calendar or Activity Calendar ═══ */}
        <div className="fade-transition">
          {calendarTab === 'events' ? (
            <>
              {view === 'month' && (
                <MonthCalendar
                  events={monthEvents}
                  year={calYear}
                  month={calMonth}
                  onDaySelect={setSelectedDay}
                  selectedDay={selectedDay}
                  members={members}
                />
              )}
              {view === 'list' && (
                <ListView
                  events={events}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onRsvpChange={handleRsvpChange}
                  members={members}
                />
              )}
              {view === 'agenda' && (
                <AgendaView events={events} />
              )}
            </>
          ) : (
            <ActivityCalendar year={calYear} month={calMonth} />
          )}
        </div>
      </div>

      {/* Day Detail Panel */}
      {selectedDay && view === 'month' && (
        <DayDetailPanel
          iso={selectedDay}
          events={events}
          members={members}
          onClose={() => setSelectedDay(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onRsvpChange={handleRsvpChange}
        />
      )}

      {/* Event Form Modal */}
      {formOpen && (
        <EventForm
          event={editing}
          onSave={handleSave}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
