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

const PLATOON_NAMES = ['A', 'B', 'C', 'D'];

function PatternFormModal({ pattern, members, presets, onSave, onClose }) {
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
    // 1.1b: named preset key + generalized on/off day-state cycle (2-2-3, DuPont…)
    preset_key: '',
    cycle_pattern: [],
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
        preset_key: pattern.preset_key || '',
        cycle_pattern: Array.isArray(pattern.cycle_pattern) ? pattern.cycle_pattern : [],
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

              {/* Named rotation presets (1.1b) — the full fire-service set,
                  sourced from the server so client + engine never drift. Picking
                  one fills the cycle; a department can then hand-tune it. */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Rotation Pattern</label>
                <div className="grid grid-cols-3 gap-2">
                  {(presets || []).map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setForm(prev => ({
                        ...prev,
                        preset_key: p.key,
                        cycle_type: p.key,
                        // Keep repeatRule 'platoon' so this section stays visible;
                        // the engine reads cycle_pattern first regardless of rule.
                        cycle_on: p.cycle_on,
                        cycle_off: p.cycle_off,
                        cycle_pattern: Array.isArray(p.cycle_pattern) ? p.cycle_pattern : [],
                        // Default the anchor to the start date so the cycle has a
                        // concrete reference the moment a preset is picked (the
                        // engine falls back to startDate anyway — this makes it visible).
                        anchor_date: prev.anchor_date || prev.startDate,
                      }))}
                      className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        form.preset_key === p.key
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      <span className="block font-bold">{p.label}</span>
                      <span className={`block text-[10px] ${form.preset_key === p.key ? 'text-blue-200' : 'text-gray-400'}`}>
                        {p.cycleLength ? `${p.cycleLength}-day` : 'cycle'}
                      </span>
                    </button>
                  ))}
                  {/* Custom */}
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, preset_key: 'custom', cycle_type: 'custom', cycle_pattern: [] }))}
                    className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      form.preset_key === 'custom'
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-blue-400'
                    }`}
                  >
                    <span className="block font-bold">Custom</span>
                    <span className={`block text-[10px] ${form.preset_key === 'custom' ? 'text-blue-200' : 'text-gray-400'}`}>set your own</span>
                  </button>
                </div>
              </div>

              {/* Custom on/off days */}
              {form.preset_key === 'custom' && (
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

              {/* Kelly Day interval — only meaningful for a simple on/off ratio.
                  A pattern-based preset (2-2-3, DuPont, Kelly 9-day) already encodes
                  its off-days in the cycle, so the field is hidden for those. */}
              {(!Array.isArray(form.cycle_pattern) || form.cycle_pattern.length === 0) && (
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
              )}

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

              {/* Cycle preview — handles the simple ratio AND a generalized
                  day-state cycle (2-2-3, DuPont), so pattern-based presets show too. */}
              {(() => {
                const cp = Array.isArray(form.cycle_pattern) ? form.cycle_pattern : [];
                const usePattern = cp.length > 0;
                const cycleLen = usePattern ? cp.length : (form.cycle_on + form.cycle_off);
                const onDays = usePattern ? cp.filter(v => v).length : form.cycle_on;
                if (!cycleLen) return null;
                return (
                  <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900 rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Cycle Preview</p>
                    {usePattern ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-tight">
                        {cp.map((v, i) => <span key={i} className={v ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-300 dark:text-gray-600'}>{v ? '■' : '·'}</span>)}
                        <span className="ml-2 font-sans">{onDays}/{cycleLen} days · ≈{Math.round(onDays / cycleLen * 168)} hrs/wk</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {form.cycle_on} day{form.cycle_on > 1 ? 's' : ''} on → {form.cycle_off} day{form.cycle_off > 1 ? 's' : ''} off
                        {form.kelly_day_interval > 0 && ` (Kelly Day every ${form.kelly_day_interval} on-duty days)`}
                        {' '}= {cycleLen}-day cycle ≈ {Math.round(form.cycle_on / cycleLen * 168)} hrs/week avg
                      </p>
                    )}
                  </div>
                );
              })()}
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
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [expanding, setExpanding] = useState(false);
  const [expandResult, setExpandResult] = useState(null);
  const [conflicts, setConflicts] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [pRes, mRes, presetRes] = await Promise.all([
        api.get('/api/shift-patterns'),
        api.get('/api/members'),
        api.get('/api/shift-patterns/presets').catch(() => ({ data: [] })),
      ]);
      const patterns = Array.isArray(pRes?.data) ? pRes.data : Array.isArray(pRes) ? pRes : [];
      const members = Array.isArray(mRes?.data) ? mRes.data : Array.isArray(mRes) ? mRes : [];
      setPatterns(patterns);
      setMembers(members);
      setPresets(Array.isArray(presetRes?.data) ? presetRes.data : []);
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
    setConflicts(null);
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      // 1.1b conflict-check on apply: PREVIEW first (commit:false) so overlaps are
      // shown BEFORE anything is written — the apply never silently overwrites.
      const preview = await api.post('/api/shift-patterns/expand', { startDate: start, endDate: end, commit: false });
      const conf = preview.conflicts || preview.data?.conflicts || [];
      if (conf.length) { setConflicts(conf); setExpanding(false); return; }
      const res = await api.post('/api/shift-patterns/expand', { startDate: start, endDate: end, commit: true });
      setExpandResult(res);
      await fetchData();
    } catch (err) {
      // If the commit itself 409'd (a race between preview and apply), surface WHAT collided,
      // not a bare "there was a conflict".
      //
      // ⚠️ This used to read `err.details.conflicts` — a structured object — and it could never
      // have worked: the server's `details` channel is `string[]` app-wide, and until 2026-08-04
      // an object payload was dropped by errorHandler entirely, so `err.details` was undefined.
      // The structured read is kept first because it costs nothing if a future route sends one,
      // but the array is now the real path: utils/api.js only attaches `details` when it IS an
      // array, and the server flattens `{ conflicts: [...] }` to one line per conflict.
      const structured = err?.details?.conflicts || err?.body?.details?.conflicts || err?.data?.details?.conflicts;
      if (structured && structured.length) {
        setConflicts(structured);
      } else if (Array.isArray(err?.details) && err.details.length) {
        // Flattened lines. Rendered through the same amber panel so the race case looks like the
        // preview case instead of a browser alert — `note` is the panel's plain-text branch.
        setConflicts(err.details.map((line) => ({ note: String(line) })));
      } else {
        alert(err.message || 'Failed to expand patterns');
      }
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
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
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
              Generated {expandResult.committed ?? expandResult.data?.length ?? 0} shifts from patterns
            </span>
          </div>
          <button onClick={() => setExpandResult(null)} aria-label="Dismiss notification" className="text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Conflict-check banner (1.1b) — the apply refuses to overwrite; the
          overlaps are shown so the officer resolves them, then re-applies. */}
      {conflicts && conflicts.length > 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 ring-1 ring-amber-300 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} — nothing was generated
            </span>
            <button onClick={() => setConflicts(null)} aria-label="Dismiss" className="text-amber-400 hover:text-amber-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300 mb-2">
            Applying would collide with shifts that already exist. Resolve these (remove the overlapping pattern or existing shift), then generate again.
          </p>
          <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5 max-h-40 overflow-y-auto">
            {conflicts.slice(0, 30).map((c, i) => (
              c.note ? (
                // The flattened-detail branch (a 409 race). One line per detail, verbatim —
                // better a raw line than a browser alert with the list thrown away.
                <li key={i} className="font-mono break-all">{c.note}</li>
              ) : (
                <li key={i} className="flex items-center gap-2">
                  <span className="font-mono">{c.date}</span>
                  <span className="font-medium">{c.shiftType}</span>
                  <span className="text-amber-600 dark:text-amber-400">
                    {c.kind === 'override' ? 'manual override exists'
                      : c.kind === 'double_apply' ? 'two patterns claim this slot'
                      : 'another pattern already here'}
                  </span>
                </li>
              )
            ))}
          </ul>
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
          presets={presets}
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
