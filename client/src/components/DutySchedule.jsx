import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  Users,
  CheckCircle,
  AlertTriangle,
  Sun,
  Moon,
  Shield,
  Clock,
  Loader2,
  CalendarClock,
  CalendarOff,
  ArrowLeftRight,
} from 'lucide-react';
import { MIN_CREW, SHIFT_TIMES } from '../data/schedule';
import { api } from '../utils/api';
import ShiftForm from './ShiftForm';
import DeleteConfirm from './DeleteConfirm';
import AIActionButton from './AIActionButton';
import PatternManager from './PatternManager';
import LeaveManager from './LeaveManager';
import CoverageWorkbench from './CoverageWorkbench';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SHIFT_ICONS = {
  'Day':          <Sun className="h-3 w-3" />,
  'Night':        <Moon className="h-3 w-3" />,
  'Duty Officer': <Shield className="h-3 w-3" />,
  '24-Hour':      <Clock className="h-3 w-3" />,
};

const SHIFT_COLORS = {
  'Day':          'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  'Night':        'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900',
  'Duty Officer': 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
  '24-Hour':      'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
};

function yyyymmdd(date) {
  return date.toISOString().slice(0, 10);
}

function coverageLevel(shifts) {
  if (!shifts || shifts.length === 0) return 'none';
  const totalCrew = shifts.reduce((sum, s) => sum + s.crew.length, 0);
  if (totalCrew === 0) return 'none';
  if (totalCrew < MIN_CREW) return 'low';
  if (totalCrew < MIN_CREW * 2) return 'ok';
  return 'good';
}

const COVERAGE_STYLES = {
  none: 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900',
  low:  'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50',
  ok:   'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50',
  good: 'border-emerald-200 dark:border-emerald-900 bg-white dark:bg-gray-900',
};

const TABS = [
  { id: 'calendar', label: 'Calendar',  icon: CalendarDays },
  { id: 'patterns', label: 'Patterns',  icon: CalendarClock },
  { id: 'leave',    label: 'Leave',     icon: CalendarOff },
  { id: 'coverage', label: 'Coverage',  icon: Shield },
];

function TabNav({ activeTab, setActiveTab }) {
  return (
    <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default function DutySchedule() {
  const today = new Date();
  const [activeTab, setActiveTab] = useState('calendar');
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [shifts, setShifts]       = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [formOpen, setFormOpen]   = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [deletingShift, setDeletingShift] = useState(null);
  const [detailDate, setDetailDate] = useState(null);

  const fetchShifts = useCallback(async () => {
    try {
      setError(null);
      const [sRes, lRes] = await Promise.all([
        api.get('/api/shifts'),
        api.get('/api/leave'),
      ]);
      const shifts = Array.isArray(sRes?.data) ? sRes.data : Array.isArray(sRes) ? sRes : [];
      const leave = Array.isArray(lRes?.data) ? lRes.data : Array.isArray(lRes) ? lRes : [];
      setShifts(shifts);
      setLeaveRequests(leave.filter(l => l.status === 'Approved'));
    } catch (err) {
      setError(err.message || 'Could not load schedule');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  // ── Calendar grid ────────────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(yyyymmdd(new Date(viewYear, viewMonth, d)));
    }
    return cells;
  }, [viewYear, viewMonth]);

  // ── Shifts indexed by date ───────────────────────────────────────────────
  const shiftsByDate = useMemo(() => {
    const map = {};
    shifts.forEach((s) => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    return map;
  }, [shifts]);

  // ── Leave indexed by date ───────────────────────────────────────────────
  const leaveByDate = useMemo(() => {
    const map = {};
    leaveRequests.forEach(l => {
      let cur = new Date(l.startDate + 'T00:00:00');
      const end = new Date(l.endDate + 'T00:00:00');
      while (cur <= end) {
        const d = cur.toISOString().slice(0, 10);
        if (!map[d]) map[d] = [];
        map[d].push(l);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [leaveRequests]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    let covered = 0, understaffed = 0, empty = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = yyyymmdd(new Date(viewYear, viewMonth, d));
      const level = coverageLevel(shiftsByDate[date]);
      if (level === 'good' || level === 'ok') covered++;
      else if (level === 'low') understaffed++;
      else empty++;
    }
    return { covered, understaffed, empty };
  }, [shiftsByDate, viewYear, viewMonth]);

  // ── Navigation ──────────────────────────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  const monthLabel = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ── CRUD ─────────────────────────────────────────────────────────────────
  async function handleSave(formData) {
    try {
      if (formData.id) {
        await api.patch(`/api/shifts/${formData.id}`, formData);
      } else {
        await api.post('/api/shifts', formData);
      }
      await fetchShifts();
    } catch (err) {
      alert(err.message || 'Failed to save shift');
    }
    setFormOpen(false);
    setEditingShift(null);
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/api/shifts/${id}`);
      await fetchShifts();
    } catch (err) {
      alert(err.message || 'Failed to delete shift');
    }
    setDeletingShift(null);
  }

  // ── Detail panel shifts ──────────────────────────────────────────────────
  const detailShifts = detailDate ? (shiftsByDate[detailDate] || []) : [];
  const isToday = (date) => date === yyyymmdd(today);

  // ── Tab: Patterns or Leave ──────────────────────────────────────────────
  if (activeTab === 'patterns') {
    return (
      <div className="space-y-6">
        <TabNav activeTab={activeTab} setActiveTab={setActiveTab} />
        <PatternManager onBack={() => setActiveTab('calendar')} />
      </div>
    );
  }
  if (activeTab === 'leave') {
    return (
      <div className="space-y-6">
        <TabNav activeTab={activeTab} setActiveTab={setActiveTab} />
        <LeaveManager onBack={() => setActiveTab('calendar')} onOpenCoverage={() => setActiveTab('coverage')} />
      </div>
    );
  }
  if (activeTab === 'coverage') {
    return (
      <div className="space-y-6">
        <TabNav activeTab={activeTab} setActiveTab={setActiveTab} />
        <CoverageWorkbench onClose={() => setActiveTab('calendar')} onRefresh={fetchShifts} />
      </div>
    );
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <Loader2 className="h-8 w-8 animate-spin mr-3" />
      <span className="text-sm">Loading schedule…</span>
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-red-50 dark:bg-red-950/50 ring-1 ring-red-200 p-8 text-center">
      <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Could not load schedule</p>
      <p className="text-xs text-red-500 mb-4">{error}</p>
      <button onClick={fetchShifts} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">Retry</button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Tab navigation ─────────────────────────────────────────────────── */}
      <TabNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Days Covered',     value: stats.covered,      icon: <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
          { label: 'Understaffed Days', value: stats.understaffed, icon: <AlertTriangle className="h-5 w-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-950/50' },
          { label: 'No Coverage',       value: stats.empty,        icon: <CalendarDays className="h-5 w-5 text-gray-400" />,   bg: 'bg-gray-100 dark:bg-gray-800' },
        ].map(({ label, value, icon, bg }) => (
          <div key={label} className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-gray-200">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>{icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── AI Actions ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <AIActionButton
          action="forecast_staffing"
          context={{ module: 'schedule' }}
          label="7-Day Forecast"
          variant="button"
          resultType="json"
        />
        <AIActionButton
          action="optimize_schedule"
          context={{ module: 'schedule' }}
          label="Optimize Schedule"
          variant="button"
          resultType="json"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Calendar ─────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <button onClick={prevMonth} aria-label="Previous month" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{monthLabel}</h2>
            <button onClick={nextMonth} aria-label="Next month" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
            {DAYS_OF_WEEK.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7">
            {calendarDays.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} className="min-h-[90px] border-b border-r border-gray-100 dark:border-gray-700 bg-gray-50/50" />;
              const dayShifts = shiftsByDate[date] || [];
              const level = coverageLevel(dayShifts);
              const active = detailDate === date;
              const todayCell = isToday(date);
              const dayNum = parseInt(date.slice(-2), 10);

              return (
                <div
                  key={date}
                  onClick={() => setDetailDate(active ? null : date)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select day ${date}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailDate(active ? null : date); } }}
                  className={`min-h-[90px] border-b border-r border-gray-100 dark:border-gray-700 p-1.5 cursor-pointer transition-colors
                    ${active ? 'ring-2 ring-inset ring-red-500' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
                    ${COVERAGE_STYLES[level]}`}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
                      ${todayCell ? 'bg-red-700 text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                      {dayNum}
                    </span>
                    {dayShifts.length > 0 && (
                      <span className="text-xs text-gray-400">
                        <Users className="h-3 w-3 inline mr-0.5" />
                        {dayShifts.reduce((n, s) => n + s.crew.length, 0)}
                      </span>
                    )}
                  </div>

                  {/* Shift chips */}
                  <div className="space-y-0.5">
                    {dayShifts.slice(0, 3).map((s) => (
                      <div
                        key={s.id}
                        className={`flex items-center gap-1 rounded px-1 py-0.5 text-xs border ${SHIFT_COLORS[s.shiftType]}`}
                      >
                        {SHIFT_ICONS[s.shiftType]}
                        <span className="truncate">{s.shiftType}</span>
                      </div>
                    ))}
                    {dayShifts.length > 3 && (
                      <p className="text-xs text-gray-400 pl-1">+{dayShifts.length - 3} more</p>
                    )}
                  </div>

                  {/* Leave indicator */}
                  {(leaveByDate[date] || []).length > 0 && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                      <CalendarOff className="h-2.5 w-2.5" />
                      <span className="truncate">{leaveByDate[date].length} off</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-5 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 inline-block" /> Good coverage</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 inline-block" /> Understaffed</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 inline-block" /> Below minimum</span>
          </div>
        </div>

        {/* ── Day detail panel ─────────────────────────────────────────────── */}
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 overflow-hidden flex flex-col">
          {detailDate ? (
            <>
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 font-medium">Selected</p>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {new Date(detailDate + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long', month: 'short', day: 'numeric',
                    })}
                  </h3>
                </div>
                <button
                  onClick={() => { setEditingShift(null); setFormOpen(true); setSelectedDate(detailDate); }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Shift
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                {detailShifts.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400">
                    <CalendarDays className="mx-auto h-8 w-8 text-gray-200 mb-2" />
                    No shifts scheduled
                  </div>
                ) : (
                  detailShifts.map((shift) => (
                    <div key={shift.id} className="px-5 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${SHIFT_COLORS[shift.shiftType]}`}>
                            {SHIFT_ICONS[shift.shiftType]}
                            {shift.shiftType}
                          </span>
                          <span className="text-xs text-gray-400">{SHIFT_TIMES[shift.shiftType].label}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setEditingShift(shift); setSelectedDate(detailDate); setFormOpen(true); }}
                            aria-label={`Edit ${shift.shiftType} shift`}
                            className="p-1 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingShift({ ...shift, name: `${shift.shiftType} shift` })}
                            aria-label={`Delete ${shift.shiftType} shift`}
                            className="p-1 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {shift.crew.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No crew assigned</p>
                      ) : (
                        <ul className="space-y-1">
                          {shift.crew.map((name) => (
                            <li key={name} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                              <span className="h-5 w-5 rounded-full bg-red-700 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                                {name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                              </span>
                              {name}
                            </li>
                          ))}
                        </ul>
                      )}

                      {shift.notes && (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic border-t border-gray-100 dark:border-gray-700 pt-2">{shift.notes}</p>
                      )}
                    </div>
                  ))
                )}

                {/* Leave for this day */}
                {(leaveByDate[detailDate] || []).length > 0 && (
                  <div className="px-5 py-3 border-t border-orange-100 dark:border-orange-900 bg-orange-50/50">
                    <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-2 flex items-center gap-1.5">
                      <CalendarOff className="h-3.5 w-3.5" /> Members on Leave
                    </p>
                    {leaveByDate[detailDate].map((l, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-orange-800 dark:text-orange-300 mb-1">
                        <span className="h-5 w-5 rounded-full bg-orange-200 dark:bg-orange-900 text-orange-700 dark:text-orange-300 text-xs flex items-center justify-center font-bold flex-shrink-0">
                          {(l.memberName || '?').split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </span>
                        <span>{l.memberName}</span>
                        <span className="text-orange-500">({l.type})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
              <CalendarDays className="h-10 w-10 text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Select a day</p>
              <p className="text-xs text-gray-400 mt-1">Click any date on the calendar to view or manage shifts</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {formOpen && (
        <ShiftForm
          shift={editingShift}
          date={selectedDate || detailDate}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditingShift(null); }}
        />
      )}
      {deletingShift && (
        <DeleteConfirm
          member={deletingShift}
          onConfirm={handleDelete}
          onCancel={() => setDeletingShift(null)}
        />
      )}
    </div>
  );
}
