import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Trash2, Loader2, ChevronLeft, ChevronRight,
  Calendar, Truck, UserCheck, UserX, Download, AlertTriangle,
} from 'lucide-react';
import { api } from '../utils/api';

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
              <input type="time" value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">End</label>
              <input type="time" value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
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
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 disabled:opacity-40">
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

  const fetchData = useCallback(async () => {
    try {
      const [sRes, rRes, aRes] = await Promise.all([
        api.get(`/api/daily-staffing?date=${date}`),
        api.get(`/api/daily-staffing/roster?date=${date}`),
        api.get('/api/apparatus'),
      ]);
      const staffing = Array.isArray(sRes?.data?.data) ? sRes.data.data : Array.isArray(sRes?.data) ? sRes.data : Array.isArray(sRes) ? sRes : [];
      const available = Array.isArray(rRes?.data?.data) ? rRes.data.data : Array.isArray(rRes?.data) ? rRes.data : Array.isArray(rRes) ? rRes : [];
      const apparatus = Array.isArray(aRes?.data) ? aRes.data : Array.isArray(aRes) ? aRes : [];
      setStaffing(staffing);
      setAvailable(available);
      setApparatus(apparatus.filter(a => a.status !== 'Decommissioned'));
      setSource(sRes?.data?.source || 'manual');
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
      <div className="flex items-center justify-center py-24 text-gray-400">
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
  const minCrew = 4; // TODO: pull from station config

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
        <button onClick={() => setShowAssign(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
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
          {isToday && <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase">Today</span>}
        </div>
        <button onClick={() => shiftDate(1)} aria-label="Next day" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <ChevronRight size={16} className="text-gray-600 dark:text-gray-300" />
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Staffing date"
          className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm" />
        {!isToday && (
          <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="text-xs font-semibold text-red-700 dark:text-red-300 hover:underline">Today</button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'On Duty', value: staffing.length, icon: UserCheck, color: staffing.length >= minCrew ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300' },
          { label: 'Available (off)', value: available.length, icon: UserX, color: 'text-gray-600 dark:text-gray-300' },
          { label: 'Apparatus Staffed', value: Object.keys(byApparatus).length, icon: Truck, color: 'text-blue-700 dark:text-blue-300' },
          { label: 'Total Hours', value: staffing.reduce((s, e) => s + parseFloat(e.hours || 0), 0).toFixed(0), icon: Calendar, color: 'text-gray-700 dark:text-gray-300' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={14} className={s.color} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{s.label}</span>
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

      {/* Min staffing alert */}
      {staffing.length < minCrew && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">
            <strong>Below minimum staffing!</strong> {staffing.length} of {minCrew} required crew assigned.
          </p>
        </div>
      )}

      {/* Apparatus cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(byApparatus).map(([appId, data]) => (
          <div key={appId} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <Truck size={14} className="text-red-700 dark:text-red-300" />
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{data.name}</p>
              <span className="ml-auto text-[10px] font-bold text-gray-400">{data.members.length} crew</span>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {data.members.map(m => (
                <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-[10px] font-bold text-red-700 dark:text-red-300">
                    {(m.member_name || '').split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.member_name}</p>
                    <p className="text-[10px] text-gray-400">{m.position || 'Unassigned'} · {m.member_rank}</p>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">{m.start_time}–{m.end_time}</span>
                  <button onClick={() => handleRemove(m.id)} aria-label="Remove assignment" className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400">
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
                    <p className="text-[10px] text-gray-400">{m.position || 'TBD'} · {m.member_rank}</p>
                  </div>
                  <button onClick={() => handleRemove(m.id)} aria-label="Remove assignment" className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400">
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
                {m.name} <span className="text-gray-400">· {m.rank}</span>
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
