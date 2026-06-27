import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, X, RefreshCw, CalendarClock,
  Users, CheckCircle, Loader2, Pause, Play,
} from 'lucide-react';
import { api } from '../utils/api';
import { SHIFT_TYPES, SHIFT_TIMES } from '../data/schedule';
import DeleteConfirm from './DeleteConfirm';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const REPEAT_RULES = [
  { value: 'daily',    label: 'Every Day' },
  { value: 'weekly',   label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 Weeks' },
  { value: 'platoon',  label: 'Platoon Cycle' },
];

const CYCLE_TYPES = [
  { value: '24/48', label: '24/48', on: 1, off: 2, desc: '24 on, 48 off' },
  { value: '48/96', label: '48/96', on: 2, off: 4, desc: '48 on, 96 off' },
  { value: 'custom', label: 'Custom', on: 0, off: 0, desc: 'Set your own cycle' },
];

const PLATOON_NAMES = ['A', 'B', 'C', 'D'];

function PatternFormModal({ pattern, members, onSave, onClose }) {
  const [form, setForm] = useState({
    name: '',
    shiftType: 'Day',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    repeatRule: 'weekly',
    repeatDays: [1, 2, 3, 4, 5], // Mon–Fri default
    memberIds: [],
    minCrew: 3,
    notes: '',
    // Platoon scheduling fields
    platoon: '',
    cycle_type: '24/48',
    cycle_on: 1,
    cycle_off: 2,
    kelly_day_interval: 0,
    anchor_date: '',
  });

  useEffect(() => {
    if (pattern) {
      setForm({
        name: pattern.name || '',
        shiftType: pattern.shiftType || 'Day',
        startDate: pattern.startDate || '',
        endDate: pattern.endDate || '',
        repeatRule: pattern.repeatRule || 'weekly',
        repeatDays: pattern.repeatDays || [],
        memberIds: pattern.memberIds || [],
        minCrew: pattern.minCrew || 3,
        notes: pattern.notes || '',
        platoon: pattern.platoon || '',
        cycle_type: pattern.cycle_type || '24/48',
        cycle_on: pattern.cycle_on || 1,
        cycle_off: pattern.cycle_off || 2,
        kelly_day_interval: pattern.kelly_day_interval || 0,
        anchor_date: pattern.anchor_date || '',
      });
    }
  }, [pattern]);

  function toggleDay(d) {
    setForm(prev => ({
      ...prev,
      repeatDays: prev.repeatDays.includes(d)
        ? prev.repeatDays.filter(x => x !== d)
        : [...prev.repeatDays, d].sort(),
    }));
  }

  function toggleMember(id) {
    setForm(prev => ({
      ...prev,
      memberIds: prev.memberIds.includes(id)
        ? prev.memberIds.filter(x => x !== id)
        : [...prev.memberIds, id],
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, id: pattern?.id });
  }

  const activeMembers = members.filter(m => m.status === 'Active' || m.status === 'Probationary');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-red-700">
          <div>
            <h2 className="text-base font-semibold text-white">
              {pattern ? 'Edit Pattern' : 'New Recurring Pattern'}
            </h2>
            <p className="text-xs text-red-200 mt-0.5">Define a repeating shift schedule</p>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="text-red-200 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Pattern name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pattern Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Engine 1 — Weekday Day Shift"
              required
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
            />
          </div>

          {/* Shift type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Shift Type</label>
            <div className="grid grid-cols-2 gap-2">
              {SHIFT_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, shiftType: type }))}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors text-left ${
                    form.shiftType === type
                      ? 'bg-red-700 text-white border-red-700'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-red-400'
                  }`}
                >
                  <span className="block font-semibold">{type}</span>
                  <span className={`block text-xs ${form.shiftType === type ? 'text-red-200' : 'text-gray-400'}`}>
                    {SHIFT_TIMES[type].label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Repeat rule */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Repeat</label>
            <div className="flex gap-2">
              {REPEAT_RULES.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, repeatRule: r.value }))}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.repeatRule === r.value
                      ? 'bg-red-700 text-white border-red-700'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-red-400'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Days of week (for weekly/biweekly) */}
          {(form.repeatRule === 'weekly' || form.repeatRule === 'biweekly') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Active Days</label>
              <div className="flex gap-1.5">
                {DAYS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      form.repeatDays.includes(i)
                        ? 'bg-red-700 text-white border-red-700'
                        : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-red-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Platoon scheduling fields */}
          {form.repeatRule === 'platoon' && (
            <div className="space-y-4 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
              <p className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide">Platoon / Rotation Settings</p>

              {/* Platoon name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Platoon</label>
                <div className="flex gap-2">
                  {PLATOON_NAMES.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, platoon: p }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${
                        form.platoon === p
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      {p} Platoon
                    </button>
                  ))}
                </div>
              </div>

              {/* Cycle type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cycle Type</label>
                <div className="flex gap-2">
                  {CYCLE_TYPES.map(ct => (
                    <button
                      key={ct.value}
                      type="button"
                      onClick={() => setForm(prev => ({
                        ...prev,
                        cycle_type: ct.value,
                        ...(ct.value !== 'custom' ? { cycle_on: ct.on, cycle_off: ct.off } : {}),
                      }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.cycle_type === ct.value
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      <span className="block font-bold">{ct.label}</span>
                      <span className={`block text-xs ${form.cycle_type === ct.value ? 'text-blue-200' : 'text-gray-400'}`}>
                        {ct.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom on/off days */}
              {form.cycle_type === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Days On</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={form.cycle_on}
                      onChange={e => setForm(p => ({ ...p, cycle_on: parseInt(e.target.value) || 1 }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Days Off</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={form.cycle_off}
                      onChange={e => setForm(p => ({ ...p, cycle_off: parseInt(e.target.value) || 2 }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900"
                    />
                  </div>
                </div>
              )}

              {/* Kelly Day interval */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Kelly Day Interval
                  <span className="ml-1 text-xs font-normal text-gray-400">(0 = none)</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Every Nth on-duty day is a Kelly Day (scheduled day off to reduce average hours).
                </p>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={form.kelly_day_interval}
                  onChange={e => setForm(p => ({ ...p, kelly_day_interval: parseInt(e.target.value) || 0 }))}
                  className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900"
                />
              </div>

              {/* Anchor date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Anchor Date
                  <span className="ml-1 text-xs font-normal text-gray-400">(cycle start reference)</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  The date this platoon started their rotation. The engine calculates on/off days from this anchor.
                </p>
                <input
                  type="date"
                  value={form.anchor_date}
                  onChange={e => setForm(p => ({ ...p, anchor_date: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900"
                />
              </div>

              {/* Cycle preview */}
              {form.cycle_on > 0 && form.cycle_off > 0 && (
                <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Cycle Preview</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {form.cycle_on} day{form.cycle_on > 1 ? 's' : ''} on → {form.cycle_off} day{form.cycle_off > 1 ? 's' : ''} off
                    {form.kelly_day_interval > 0 && ` (Kelly Day every ${form.kelly_day_interval} on-duty days)`}
                    {' '}= {form.cycle_on + form.cycle_off}-day cycle
                    {' '}≈ {Math.round(form.cycle_on / (form.cycle_on + form.cycle_off) * 168)} hrs/week avg
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                required
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date (optional)</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
              />
            </div>
          </div>

          {/* Min crew */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Minimum Crew</label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.minCrew}
              onChange={e => setForm(p => ({ ...p, minCrew: parseInt(e.target.value) || 3 }))}
              className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
            />
          </div>

          {/* Member assignment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Default Crew
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({form.memberIds.length} selected)
              </span>
            </label>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-700 max-h-44 overflow-y-auto">
              {activeMembers.map(m => {
                const selected = form.memberIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                      selected ? 'bg-red-50 dark:bg-red-950/50' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleMember(m.id)}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 focus:ring-red-500"
                    />
                    <div>
                      <span className={`text-sm ${selected ? 'font-medium text-red-800 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>{m.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{m.rank}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Optional pattern notes…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 resize-none dark:bg-gray-900"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors">
              {pattern ? 'Save Changes' : 'Create Pattern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PatternManager({ onBack }) {
  const [patterns, setPatterns] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [expanding, setExpanding] = useState(false);
  const [expandResult, setExpandResult] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [pRes, mRes] = await Promise.all([
        api.get('/api/shift-patterns'),
        api.get('/api/members'),
      ]);
      const patterns = Array.isArray(pRes?.data) ? pRes.data : Array.isArray(pRes) ? pRes : [];
      const members = Array.isArray(mRes?.data) ? mRes.data : Array.isArray(mRes) ? mRes : [];
      setPatterns(patterns);
      setMembers(members);
    } catch (err) {
      console.error('Failed to load patterns:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave(formData) {
    try {
      if (formData.id) {
        await api.patch(`/api/shift-patterns/${formData.id}`, formData);
      } else {
        await api.post('/api/shift-patterns', formData);
      }
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to save pattern');
    }
    setFormOpen(false);
    setEditing(null);
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/api/shift-patterns/${id}`);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to delete pattern');
    }
    setDeleting(null);
  }

  async function toggleActive(pattern) {
    try {
      await api.patch(`/api/shift-patterns/${pattern.id}`, { isActive: !pattern.isActive });
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to update pattern');
    }
  }

  async function handleExpand() {
    setExpanding(true);
    setExpandResult(null);
    try {
      // Expand for next 30 days
      const start = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const res = await api.post('/api/shift-patterns/expand', {
        startDate: start,
        endDate: end,
        commit: true,
      });
      setExpandResult(res.data || res);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to expand patterns');
    } finally {
      setExpanding(false);
    }
  }

  const memberMap = {};
  members.forEach(m => { memberMap[m.id] = m; });

  function memberNames(ids) {
    return (ids || []).map(id => memberMap[id]?.name || `#${id}`).join(', ');
  }

  function repeatLabel(pattern) {
    if (pattern.repeatRule === 'daily') return 'Every day';
    if (pattern.repeatRule === 'platoon') {
      const cycle = `${pattern.cycle_on || '?'}/${pattern.cycle_off || '?'}`;
      const kelly = pattern.kelly_day_interval > 0 ? ` + Kelly/${pattern.kelly_day_interval}` : '';
      return `${pattern.platoon || '?'} Platoon · ${cycle} cycle${kelly}`;
    }
    const days = (pattern.repeatDays || []).map(d => DAYS[d]).join(', ');
    if (pattern.repeatRule === 'biweekly') return `Every 2 weeks: ${days}`;
    return `Weekly: ${days}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading patterns…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              ← Back to Schedule
            </button>
          )}
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-red-700 dark:text-red-300" />
              Recurring Shift Patterns
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{patterns.length} pattern{patterns.length !== 1 ? 's' : ''} defined</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExpand} disabled={expanding || patterns.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${expanding ? 'animate-spin' : ''}`} />
            Generate Next 30 Days
          </button>
          <button onClick={() => { setEditing(null); setFormOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 transition-colors">
            <Plus className="h-3.5 w-3.5" /> New Pattern
          </button>
        </div>
      </div>

      {/* Expand result banner */}
      {expandResult && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 ring-1 ring-emerald-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm text-emerald-800 dark:text-emerald-300">
              Generated {expandResult.inserted || expandResult.generated?.length || 0} shifts from patterns
            </span>
          </div>
          <button onClick={() => setExpandResult(null)} aria-label="Dismiss notification" className="text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Pattern list */}
      {patterns.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 p-12 text-center">
          <CalendarClock className="mx-auto h-10 w-10 text-gray-200 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No recurring patterns yet</p>
          <p className="text-xs text-gray-400 mt-1">Create a pattern to auto-generate shifts on a schedule</p>
        </div>
      ) : (
        <div className="space-y-3">
          {patterns.map(p => (
            <div key={p.id}
              className={`rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 overflow-hidden ${
                !p.isActive ? 'opacity-60' : ''
              }`}
            >
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{p.name}</h3>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${
                      p.isActive
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    }`}>
                      {p.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => toggleActive(p)}
                      className="p-1.5 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                      title={p.isActive ? 'Pause pattern' : 'Activate pattern'}
                      aria-label={p.isActive ? 'Pause pattern' : 'Activate pattern'}>
                      {p.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => { setEditing(p); setFormOpen(true); }}
                      aria-label="Edit pattern"
                      className="p-1.5 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleting({ ...p, name: p.name })}
                      aria-label="Delete pattern"
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-600 dark:text-gray-300">
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Shift:</span>{' '}
                    {p.shiftType} ({SHIFT_TIMES[p.shiftType]?.label})
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Repeat:</span>{' '}
                    {repeatLabel(p)}
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Min Crew:</span>{' '}
                    {p.minCrew}
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <Users className="h-3 w-3" />
                  {p.memberIds?.length > 0
                    ? memberNames(p.memberIds)
                    : <span className="italic text-gray-400">No members assigned</span>
                  }
                </div>

                {p.notes && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">{p.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {formOpen && (
        <PatternFormModal
          pattern={editing}
          members={members}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
      {deleting && (
        <DeleteConfirm
          member={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
