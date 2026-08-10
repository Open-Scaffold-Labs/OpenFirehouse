import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Trash2, Loader2, ChevronLeft, ChevronRight,
  Calendar, Truck, UserCheck, UserX, Download, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { api } from '../utils/api';
import { openTimePicker } from '../utils/timeInput';

function AssignModal({ availableMembers, apparatus, onSave, onClose, date }) {
  const [form, setForm] = useState({
    member_id: '', position: '', apparatus_id: '',
    start_time: '08:00', end_time: '08:00', hours: 24,
  });

  const POSITIONS = [
    'Officer', 'Driver/Engineer', 'Firefighter', 'EMT', 'Paramedic',
    'Tillerman', 'Acting Officer', 'Acting Driver', 'Callback', 'Holdover',
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Assign to {date}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Member</label>
            <select value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
              <option value="">Select member…</option>
              {availableMembers.map(m => <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Position</label>
              <select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
                <option value="">Select…</option>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Apparatus</label>
              <select value={form.apparatus_id} onChange={e => setForm(f => ({ ...f, apparatus_id: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
                <option value="">Unassigned</option>
                {apparatus.map(a => <option key={a.id} value={a.id}>{a.designation}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Start</label>
              <input type="time" onClick={openTimePicker} value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                className="cursor-pointer w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">End</label>
              <input type="time" onClick={openTimePicker} value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                className="cursor-pointer w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Hours</label>
              <input type="number" step="0.5" value={form.hours}
                onChange={e => setForm(f => ({ ...f, hours: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={() => { if (form.member_id) onSave({ ...form, member_id: parseInt(form.member_id), apparatus_id: form.apparatus_id ? parseInt(form.apparatus_id) : null, date }); }}
            disabled={!form.member_id}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40">
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}

/** Return YYYY-MM-DD in local time (avoids UTC midnight roll-over bug) */
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DailyStaffingBoard() {
  const [date, setDate] = useState(localDate());
  const [staffing, setStaffing] = useState([]);
  const [available, setAvailable] = useState([]);
  const [apparatus, setApparatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [source, setSource] = useState('manual'); // 'manual' or 'schedule'
  const [coverage, setCoverage] = useState(null); // 1.4: rule verdicts + open vacancies
  const [drill, setDrill] = useState(null); // 1.4 critique: chip → inline detail {kind:'rule'|'vacancy', item}

  const fetchData = useCallback(async () => {
    try {
      const [sRes, rRes, aRes, cRes] = await Promise.all([
        api.get(`/api/daily-staffing?date=${date}`),
        api.get(`/api/daily-staffing/roster?date=${date}`),
        api.get('/api/apparatus'),
        api.get(`/api/staffing/coverage?date=${date}`).catch(() => null),
      ]);
      const staffing = Array.isArray(sRes?.data?.data) ? sRes.data.data : Array.isArray(sRes?.data) ? sRes.data : Array.isArray(sRes) ? sRes : [];
      const available = Array.isArray(rRes?.data?.data) ? rRes.data.data : Array.isArray(rRes?.data) ? rRes.data : Array.isArray(rRes) ? rRes : [];
      const apparatus = Array.isArray(aRes?.data) ? aRes.data : Array.isArray(aRes) ? aRes : [];
      setStaffing(staffing);
      setAvailable(available);
      setApparatus(apparatus.filter(a => a.status !== 'Decommissioned'));
      setSource(sRes?.data?.source || 'manual');
      setCoverage(cRes?.data || null);
    } catch (err) {
      console.error('Failed to load staffing:', err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function shiftDate(days) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(localDate(d));
  }

  async function handleAssign(form) {
    try {
      await api.post('/api/daily-staffing', form);
      setShowAssign(false);
      fetchData();
    } catch (err) { alert(err.message || 'Failed to assign'); }
  }

  async function handleRemove(id) {
    if (!confirm('Remove this assignment?')) return;
    try {
      await api.delete(`/api/daily-staffing/${id}`);
      fetchData();
    } catch (err) { alert(err.message || 'Failed'); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-600 dark:text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading staffing…</span>
      </div>
    );
  }

  // Group by apparatus
  const byApparatus = {};
  const unassigned = [];
  staffing.forEach(s => {
    if (s.apparatus_id) {
      if (!byApparatus[s.apparatus_id]) byApparatus[s.apparatus_id] = { name: s.apparatus_name || `Apparatus #${s.apparatus_id}`, members: [] };
      byApparatus[s.apparatus_id].members.push(s);
    } else {
      unassigned.push(s);
    }
  });

  const isToday = date === localDate();
  const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  // 1.4: staffing state comes from the rule engine (layered per-dept minimums, migration
  // 0080) — the old hardcoded 4 is gone. Fallback keeps the stat neutral if coverage
  // hasn't loaded.
  const rollup = coverage?.rollup || null;
  const onDutyColor = rollup === 'ok' ? 'text-green-700 dark:text-green-300'
    : (rollup === 'short' || rollup === 'critical') ? 'text-red-700 dark:text-red-300'
    : 'text-gray-700 dark:text-gray-300';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Users className="h-6 w-6 text-red-700 dark:text-red-300" />
            Daily Staffing Board
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Real-time duty assignments and minimum staffing status</p>
        </div>
        {/* Blue per the action-colour vocabulary — seating someone on a shift is the
            ordinary primary action here, not an emergency. */}
        <button onClick={() => setShowAssign(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
          <Plus size={14} /> Assign
        </button>
      </div>

      {/* Date navigator */}
      <div className="flex items-center justify-center gap-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
        <button onClick={() => shiftDate(-1)} aria-label="Previous day" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <ChevronLeft size={16} className="text-gray-600 dark:text-gray-300" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{dayLabel}</p>
          {/* green-700, measured: green-600 on white is 3.22:1 against a 4.5 floor
              for this 10px label — the same shade-step trap as the respond button. */}
          {isToday && <span className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase">Today</span>}
        </div>
        <button onClick={() => shiftDate(1)} aria-label="Next day" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <ChevronRight size={16} className="text-gray-600 dark:text-gray-300" />
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Staffing date"
          className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm" />
        {!isToday && (
          <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline">Today</button>
        )}
      </div>

      {/* Coverage strip (1.4) — per-rule verdicts + open vacancies for the date */}
      {coverage && coverage.rollup !== 'no_schedule' && (coverage.verdicts?.length > 0 || coverage.vacancies?.length > 0) && (
        <div className={`rounded-2xl border shadow-sm p-4 ${
          coverage.rollup === 'ok' ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900'
          : coverage.rollup === 'critical' ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'
          : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'}`}>
          <div className="flex items-center gap-2 mb-2">
            {/* The ICON has to agree with the verdict. This was always a warning
                triangle, recoloured green for the OK case — so the most common
                state on this page read "⚠ MINIMUM STAFFING MET", a caution sign
                announcing that nothing is wrong. On a staffing board a chief scans
                for trouble, and a triangle is the shape they scan FOR. */}
            {coverage.rollup === 'ok'
              ? <CheckCircle2 size={14} className="text-green-600 dark:text-green-400" aria-hidden="true" />
              : <AlertTriangle size={14} className={coverage.rollup === 'critical'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'} aria-hidden="true" />}
            <span className="text-xs font-black uppercase tracking-wide text-gray-700 dark:text-gray-200">
              {coverage.rollup === 'ok' ? 'Minimum staffing met'
                : coverage.rollup === 'critical' ? 'Critical staffing gap'
                : 'Below minimum staffing'}
            </span>
            {coverage.enforcement === 'block' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">BLOCK mode</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(coverage.verdicts || []).map((v, i) => (
              <button key={i} title="Show rule detail"
                onClick={() => setDrill(d => d?.kind === 'rule' && d.i === i ? null : { kind: 'rule', i, item: v })}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg cursor-pointer ${
                  v.ok ? 'bg-white/70 dark:bg-gray-900/60 text-green-700 dark:text-green-300'
                  : v.critical ? 'bg-red-600 text-white'
                  : 'bg-amber-600 text-white'}`}>
                {/* THE SHIFT LABEL IS NOT DECORATION. A per-shift rule is evaluated ONCE
                    PER SHIFT, so a department with a Day and a Night tour legitimately
                    produces two verdicts for the same rule — and without this label they
                    render as the identical chip twice and read as a duplicate-verdict BUG.
                    (Reported as exactly that on 2026-07-27; the server was right and the
                    display was hiding the distinction. Prod that day: shifts 570 Day and
                    571 Night, both 3/3.) */}
                {v.shiftType ? `${v.shiftType} · ` : ''}
                {v.name}{v.target ? ` (${v.target})` : ''}: {v.actual}/{v.required}
                {!v.ok && ` — short ${v.short}`}
              </button>
            ))}
            {(coverage.vacancies || []).map((v) => (
              <button key={`vac-${v.id}`} title="Show vacancy detail"
                onClick={() => setDrill(d => d?.kind === 'vacancy' && d.item.id === v.id ? null : { kind: 'vacancy', item: v })}
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg cursor-pointer bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-400 dark:border-amber-800">
                Vacancy{v.position_name ? ` · ${v.position_name}` : ''} · P{v.priority} · {v.status}
              </button>
            ))}
          </div>
          {drill && (
            <div className="mt-2 text-[12px] text-gray-700 dark:text-gray-200 bg-white/70 dark:bg-gray-900/60 rounded-lg px-3 py-2">
              {drill.kind === 'rule' ? (
                <>
                  <span className="font-black">{drill.item.name}</span>
                  {' — '}{drill.item.ruleType === 'shift_count' ? 'crew headcount'
                    : drill.item.ruleType === 'rank_count' ? `count of rank "${drill.item.target}"`
                    : drill.item.ruleType === 'cert_count' ? `count holding cert "${drill.item.target}"`
                    : `apparatus #${drill.item.target} crew`}
                  {drill.item.shiftType ? ` on the ${drill.item.shiftType} shift` : ''}
                  {': '}{drill.item.actual} of {drill.item.required} required
                  {drill.item.short > 0 ? ` (short ${drill.item.short}${drill.item.critical ? ' — nobody riding' : ''})` : ' — met'}
                  {drill.item.implicit ? '. This is the department default minimum (no explicit rule configured — a chief can add layered rules under Staffing).' : ''}
                </>
              ) : (
                <>
                  <span className="font-black">Vacancy #{drill.item.id}</span>
                  {drill.item.position_name ? ` · ${drill.item.position_name}` : ''}
                  {drill.item.hours != null ? ` · ${Number(drill.item.hours)}h` : ''}
                  {` · priority P${drill.item.priority} · ${drill.item.status}`}
                  {drill.item.cause ? ` · cause: ${String(drill.item.cause).replace('_', ' ')}` : ''}
                  {' — work it from the Vacancies page (fill by person or start a hiring run).'}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* "Apparatus Staffed" was BLUE — the action colour — regardless of value, so
            a zero (nobody riding anything) read as calm and informational while sitting
            next to a green "On Duty 3". If crew are on duty and no apparatus is staffed
            that is the thing on this page worth looking at; it now goes amber. Blue
            belongs to actions, not to metrics. */}
        {[
          { label: 'On Duty', value: staffing.length, icon: UserCheck, color: onDutyColor },
          { label: 'Available (off)', value: available.length, icon: UserX, color: 'text-gray-600 dark:text-gray-300' },
          {
            label: 'Apparatus Staffed',
            value: Object.keys(byApparatus).length,
            icon: Truck,
            color: (Object.keys(byApparatus).length === 0 && staffing.length > 0)
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-gray-700 dark:text-gray-300',
          },
          { label: 'Total Hours', value: staffing.reduce((s, e) => s + parseFloat(e.hours || 0), 0).toFixed(0), icon: Calendar, color: 'text-gray-700 dark:text-gray-300' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={14} className={s.color} />
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{s.label}</span>
            </div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Schedule source banner */}
      {source === 'schedule' && staffing.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 flex items-center gap-2">
          <Calendar size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Showing from Duty Schedule.</strong> Use the Assign button to make manual adjustments for this date.
          </p>
        </div>
      )}

      {/* The min-staffing alert that used to live here is GONE, and its absence is the fix.
          1.4 replaced the hardcoded `minCrew = 4` with the coverage rule engine (layered
          per-department minimums, migration 0080) — the panel above renders that verdict.
          But the variable was deleted while TWO references to it were left behind, so this
          block threw `minCrew is not defined` on every render and the whole Daily Staffing
          page sat in the ErrorBoundary on prod. Nothing caught it: a green client build
          bundles a free identifier happily, and the server suite never renders a page.

          Deleted rather than repaired, because the feature is not missing — it was rebuilt
          properly above. Resurrecting a hardcoded "4" would be worse than the crash: it is
          wrong for most departments, which is precisely why 1.4 removed it. */}
      {/* Apparatus cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(byApparatus).map(([appId, data]) => (
          <div key={appId} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <Truck size={14} className="text-red-700 dark:text-red-300" />
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{data.name}</p>
              <span className="ml-auto text-[10px] font-bold text-gray-600 dark:text-gray-400">{data.members.length} crew</span>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {data.members.map(m => (
                <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-[10px] font-bold text-red-700 dark:text-red-300">
                    {(m.member_name || '').split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.member_name}</p>
                    <p className="text-[10px] text-gray-600 dark:text-gray-400">{m.position || 'Unassigned'} · {m.member_rank}</p>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">{m.start_time}–{m.end_time}</span>
                  <button onClick={() => handleRemove(m.id)} aria-label="Remove assignment" className="p-1 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Unassigned to apparatus */}
        {unassigned.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-amber-200 dark:border-amber-900 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-100 dark:border-amber-900 flex items-center gap-2">
              <Users size={14} className="text-amber-700 dark:text-amber-300" />
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">No Apparatus Assigned</p>
              <span className="ml-auto text-[10px] font-bold text-amber-600 dark:text-amber-400">{unassigned.length}</span>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {unassigned.map(m => (
                <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center text-[10px] font-bold text-amber-700 dark:text-amber-300">
                    {(m.member_name || '').split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.member_name}</p>
                    <p className="text-[10px] text-gray-600 dark:text-gray-400">{m.position || 'TBD'} · {m.member_rank}</p>
                  </div>
                  <button onClick={() => handleRemove(m.id)} aria-label="Remove assignment" className="p-1 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Available for callback */}
      {available.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Available for Callback ({available.length})
            </p>
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-2">
            {available.map(m => (
              <span key={m.id} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {m.name} <span className="text-gray-600 dark:text-gray-400">· {m.rank}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {showAssign && (
        <AssignModal
          availableMembers={available}
          apparatus={apparatus}
          date={date}
          onSave={handleAssign}
          onClose={() => setShowAssign(false)}
        />
      )}
    </div>
  );
}
