import DictateTextarea from './DictateTextarea';
import { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap, Plus, Search, ChevronDown, ChevronUp,
  Users, Clock, CheckCircle, XCircle, BookOpen, Flame,
  CalendarDays, Pencil, AlertTriangle,
} from 'lucide-react';
import {
  DRILL_TYPES, COURSE_TYPES,
  DRILL_LOCATIONS, PASS_FAIL, DRILL_MEMBERS,
} from '../data/drills';
import { api } from '../utils/api';
import Attachments from './Attachments';

let cachedMembers = [];

// ─── Helpers ──────────────────────────────────────────────────────────────

function attendanceStats(attendees) {
  const attended = attendees.filter(a => a.attended).length;
  const passed   = attendees.filter(a => a.result === 'Pass').length;
  return { attended, total: attendees.length, passed };
}

function hoursFromMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
}

// ─── Attendance chip ──────────────────────────────────────────────────────

function AttendanceBar({ attendees }) {
  const { attended, total } = attendanceStats(attendees);
  const pct = total ? Math.round((attended / total) * 100) : 0;
  const color = pct === 100 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 w-12 text-right">{attended}/{total}</span>
    </div>
  );
}

// ─── Drill expanded detail ────────────────────────────────────────────────

function DrillDetail({ drill, onEdit }) {
  const stats = attendanceStats(drill.attendees);
  return (
    <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-4">

      {/* Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { l: 'Date',       v: drill.date },
          { l: 'Start Time', v: drill.startTime },
          { l: 'Duration',   v: hoursFromMinutes(drill.duration) },
          { l: 'Location',   v: drill.location },
          { l: 'Instructor', v: drill.instructor },
          { l: 'Type',       v: drill.type },
          { l: 'ISO Hours',  v: drill.isoHours ? 'Yes — credited' : 'No' },
          { l: 'Attended',   v: `${stats.attended} of ${stats.total}` },
        ].map(({ l, v }) => (
          <div key={l}>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{l}</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 font-medium">{v}</p>
          </div>
        ))}
      </div>

      {/* Objectives */}
      {drill.objectives?.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Training Objectives</p>
          <ul className="space-y-1">
            {drill.objectives.map((o, i) => (
              <li key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300">
                <span className="text-red-500 font-bold flex-shrink-0">›</span> {o}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Attendance roster */}
      <div>
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Attendance Roster</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {drill.attendees.map(a => (
            <div key={a.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${a.attended ? 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700' : 'bg-gray-100 dark:bg-gray-800'}`}>
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                a.result === 'Pass' ? 'bg-green-500' :
                a.result === 'Fail' ? 'bg-red-500' :
                a.result === 'Excused' ? 'bg-blue-400' : 'bg-gray-300'
              }`} />
              <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">{a.name}</span>
              <span className={`text-[10px] font-bold ${
                a.result === 'Pass' ? 'text-green-700 dark:text-green-300' :
                a.result === 'Fail' ? 'text-red-700 dark:text-red-300' :
                a.result === 'Excused' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
              }`}>{a.result}</span>
              {a.score != null && <span className="text-[10px] text-gray-500 dark:text-gray-400">{a.score}%</span>}
            </div>
          ))}
        </div>
      </div>

      {drill.notes && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 leading-relaxed">{drill.notes}</p>
        </div>
      )}

      <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-700 mt-3">
        <button onClick={() => onEdit(drill)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">
          <Pencil size={11} /> Edit Drill
        </button>
      </div>

      {/* Attachments */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
        <Attachments module="drills" recordId={drill.id} recordLabel={drill.title || 'Drill'} />
      </div>
    </div>
  );
}

// ─── Course expanded detail ───────────────────────────────────────────────

function CourseDetail({ course, onEdit }) {
  const passed = course.attendees.filter(a => a.passed).length;
  return (
    <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-4">

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { l: 'Provider',        v: course.provider },
          { l: 'Instructor',      v: course.instructor },
          { l: 'Start Date',      v: course.startDate },
          { l: 'End Date',        v: course.endDate },
          { l: 'Location',        v: course.location },
          { l: 'Certification',   v: course.certificationEarned },
          { l: 'Cert Renewal',    v: course.certExpireYears > 0 ? `Every ${course.certExpireYears} years` : 'Does not expire' },
          { l: 'Cost',            v: course.cost > 0 ? `$${course.cost.toLocaleString()}` : 'No cost' },
        ].map(({ l, v }) => (
          <div key={l}>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{l}</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 font-medium">{v || '—'}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Enrollment — {passed}/{course.attendees.length} passed
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {course.attendees.map(a => (
            <div key={a.id} className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-1.5">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.passed ? 'bg-green-500' : 'bg-red-400'}`} />
              <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">{a.name}</span>
              <span className={`text-[10px] font-bold ${a.passed ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                {a.passed ? 'Passed' : 'Failed'}
              </span>
              {a.score != null && <span className="text-[10px] text-gray-500 dark:text-gray-400">{a.score}%</span>}
            </div>
          ))}
        </div>
      </div>

      {course.notes && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 leading-relaxed">{course.notes}</p>
        </div>
      )}

      <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-700 mt-3">
        <button onClick={() => onEdit(course)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">
          <Pencil size={11} /> Edit Course
        </button>
      </div>

      {/* Attachments */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
        <Attachments module="courses" recordId={course.id} recordLabel={course.courseName || 'Course'} />
      </div>
    </div>
  );
}

// ─── Drill Form ───────────────────────────────────────────────────────────

function DrillForm({ initial, onSave, onClose }) {
  const blank = {
    title: '', type: 'Structural Fire', date: '', startTime: '19:00',
    duration: 90, location: 'Station 1', instructor: '',
    objectives: [''],
    attendees: DRILL_MEMBERS.map(m => ({ ...m, attended: true, result: 'Pass', score: null })),
    isoHours: true, notes: '',
  };
  const [form, setForm] = useState(initial ?? blank);
  const [members, setMembers] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (cachedMembers.length === 0) {
      api.get('/api/members').then(r => {
        cachedMembers = r.data || [];
        setMembers(cachedMembers);
      }).catch(() => setMembers([]));
    } else {
      setMembers(cachedMembers);
    }
  }, []);

  function setAttendee(id, key, value) {
    setForm(f => ({ ...f, attendees: f.attendees.map(a => a.id === id ? { ...a, [key]: value } : a) }));
  }
  function setObjective(i, value) {
    setForm(f => {
      const objs = [...f.objectives];
      objs[i] = value;
      return { ...f, objectives: objs };
    });
  }
  function addObjective() { setForm(f => ({ ...f, objectives: [...f.objectives, ''] })); }
  function removeObjective(i) { setForm(f => ({ ...f, objectives: f.objectives.filter((_, j) => j !== i) })); }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, objectives: form.objectives.filter(o => o.trim()) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-red-700 rounded-t-2xl">
          <h2 className="text-base font-bold text-white">{initial ? 'Edit Drill' : 'Log Drill'}</h2>
          <button onClick={onClose} aria-label="Close drill form" className="text-red-200 hover:text-white"><XCircle size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Drill Title <span className="text-red-500">*</span></label>
            <input value={form.title} onChange={e => set('title', e.target.value)} required
              className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { l: 'Type',    k: 'type',     opts: DRILL_TYPES },
              { l: 'Location', k: 'location', opts: DRILL_LOCATIONS },
            ].map(({ l, k, opts }) => (
              <div key={k}>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{l}</label>
                <select value={form[k]} onChange={e => set(k, e.target.value)}
                  className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300">
                  {opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { l: 'Date',     k: 'date',      t: 'date' },
              { l: 'Start Time', k: 'startTime', t: 'time' },
              { l: 'Duration (min)', k: 'duration', t: 'number' },
            ].map(({ l, k, t }) => (
              <div key={k}>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{l}</label>
                <input type={t} value={form[k]} onChange={e => set(k, t === 'number' ? +e.target.value : e.target.value)}
                  className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Instructor</label>
              <select value={form.instructor} onChange={e => set('instructor', e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300">
                <option value="">— Select member —</option>
                {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isoHours} onChange={e => set('isoHours', e.target.checked)}
                  className="rounded" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Count toward ISO training hours</span>
              </label>
            </div>
          </div>

          {/* Objectives */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Training Objectives</label>
              <button type="button" onClick={addObjective}
                className="text-[10px] font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">+ Add</button>
            </div>
            <div className="space-y-2">
              {form.objectives.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input value={o} onChange={e => setObjective(i, e.target.value)} placeholder={`Objective ${i + 1}`} aria-label={`Objective ${i + 1}`}
                    className="flex-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300" />
                  {form.objectives.length > 1 && (
                    <button type="button" onClick={() => removeObjective(i)} aria-label={`Remove objective ${i + 1}`}
                      className="text-gray-300 dark:text-gray-600 hover:text-red-500"><XCircle size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Attendance */}
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Attendance</p>
            <div className="space-y-1.5">
              {form.attendees.map(a => (
                <div key={a.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-1.5">
                  <input type="checkbox" checked={a.attended} onChange={e => setAttendee(a.id, 'attended', e.target.checked)} aria-label={`${a.name} attended`}
                    className="rounded flex-shrink-0" />
                  <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 font-medium">{a.name}</span>
                  <select value={a.result} onChange={e => setAttendee(a.id, 'result', e.target.value)} aria-label={`Result for ${a.name}`}
                    className="text-[10px] border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 bg-white dark:bg-gray-900 focus:outline-none">
                    {PASS_FAIL.map(r => <option key={r}>{r}</option>)}
                  </select>
                  <input type="number" placeholder="Score" value={a.score ?? ''} onChange={e => setAttendee(a.id, 'score', e.target.value ? +e.target.value : null)} aria-label={`Score for ${a.name}`}
                    className="w-14 text-[10px] border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 focus:outline-none" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Notes</label>
            <DictateTextarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">Cancel</button>
            <button type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700">
              {initial ? 'Save Changes' : 'Log Drill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Course Form ──────────────────────────────────────────────────────────

function CourseForm({ initial, onSave, onClose }) {
  const blank = {
    courseName: '', type: 'Other', provider: '', startDate: '', endDate: '',
    location: '', certificationEarned: '', certExpireYears: 0, cost: 0,
    instructor: '',
    attendees: DRILL_MEMBERS.map(m => ({ ...m, enrolled: true, passed: true, score: null })),
    notes: '',
  };
  const [form, setForm] = useState(initial ?? blank);
  const [members, setMembers] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (cachedMembers.length === 0) {
      api.get('/api/members').then(r => {
        cachedMembers = r.data || [];
        setMembers(cachedMembers);
      }).catch(() => setMembers([]));
    } else {
      setMembers(cachedMembers);
    }
  }, []);
  function setAttendee(id, key, value) {
    setForm(f => ({ ...f, attendees: f.attendees.map(a => a.id === id ? { ...a, [key]: value } : a) }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, attendees: form.attendees.filter(a => a.enrolled) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-red-700 rounded-t-2xl">
          <h2 className="text-base font-bold text-white">{initial ? 'Edit Course' : 'Log Course'}</h2>
          <button onClick={onClose} aria-label="Close course form" className="text-red-200 hover:text-white"><XCircle size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Course Name <span className="text-red-500">*</span></label>
            <input value={form.courseName} onChange={e => set('courseName', e.target.value)} required
              className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300">
                {COURSE_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Provider</label>
              <input value={form.provider} onChange={e => set('provider', e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { l: 'Start Date', k: 'startDate', t: 'date' },
              { l: 'End Date',   k: 'endDate',   t: 'date' },
              { l: 'Cost ($)',   k: 'cost',      t: 'number' },
            ].map(({ l, k, t }) => (
              <div key={k}>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{l}</label>
                <input type={t} value={form[k]} onChange={e => set(k, t === 'number' ? +e.target.value : e.target.value)}
                  className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Location</label>
              <input value={form.location} onChange={e => set('location', e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Instructor</label>
              <select value={form.instructor} onChange={e => set('instructor', e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300">
                <option value="">— Select member —</option>
                {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Certification Earned</label>
              <input value={form.certificationEarned} onChange={e => set('certificationEarned', e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Renewal Interval (years, 0 = no expiry)</label>
              <input type="number" value={form.certExpireYears} onChange={e => set('certExpireYears', +e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300" />
            </div>
          </div>

          {/* Enrollment */}
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Enrollment & Results</p>
            <div className="space-y-1.5">
              {form.attendees.map(a => (
                <div key={a.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-1.5">
                  <input type="checkbox" checked={a.enrolled} onChange={e => setAttendee(a.id, 'enrolled', e.target.checked)} aria-label={`${a.name} enrolled`}
                    className="rounded flex-shrink-0" />
                  <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 font-medium">{a.name}</span>
                  <label className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                    <input type="checkbox" checked={a.passed} onChange={e => setAttendee(a.id, 'passed', e.target.checked)} className="rounded" />
                    Passed
                  </label>
                  <input type="number" placeholder="Score %" value={a.score ?? ''} onChange={e => setAttendee(a.id, 'score', e.target.value ? +e.target.value : null)} aria-label={`Score for ${a.name}`}
                    className="w-16 text-[10px] border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 focus:outline-none" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Notes</label>
            <DictateTextarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">Cancel</button>
            <button type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700">
              {initial ? 'Save Changes' : 'Log Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function DrillManager() {
  const [drills,     setDrills]     = useState([]);
  const [courses,    setCourses]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState('drills');
  const [search,     setSearch]     = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [formOpen,   setFormOpen]   = useState(false);
  const [editing,    setEditing]    = useState(null);

  const fetchDrills = useCallback(async () => {
    try {
      const [drillsRes, coursesRes] = await Promise.all([
        api.get('/api/drills'),
        api.get('/api/courses'),
      ]);
      setDrills(drillsRes.data);
      setCourses(coursesRes.data);
    } catch (e) { console.error('Failed to fetch drills/courses', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDrills(); }, [fetchDrills]);

  const isoHours = drills.filter(d => d.isoHours).reduce((sum, d) => sum + d.duration, 0);
  const totalDrillHours = Math.round(isoHours / 60 * 10) / 10;
  const uniqueAttended  = new Set(drills.flatMap(d => d.attendees.filter(a => a.attended).map(a => a.id))).size;

  const filteredDrills = drills.filter(d => {
    const q = search.toLowerCase();
    return !q || d.title.toLowerCase().includes(q) || d.type.toLowerCase().includes(q) || d.instructor.toLowerCase().includes(q);
  });

  const filteredCourses = courses.filter(c => {
    const q = search.toLowerCase();
    return !q || c.courseName.toLowerCase().includes(q) || c.provider.toLowerCase().includes(q);
  });

  async function handleSaveDrill(data) {
    try {
      if (data.id && drills.find(d => d.id === data.id)) {
        const res = await api.patch(`/api/drills/${data.id}`, data);
        setDrills(prev => prev.map(d => d.id === data.id ? res.data : d));
      } else {
        const res = await api.post('/api/drills', data);
        setDrills(prev => [res.data, ...prev]);
      }
    } catch (e) { console.error('Failed to save drill', e); }
    setFormOpen(false); setEditing(null);
  }
  async function handleSaveCourse(data) {
    try {
      if (data.id && courses.find(c => c.id === data.id)) {
        const res = await api.patch(`/api/courses/${data.id}`, data);
        setCourses(prev => prev.map(c => c.id === data.id ? res.data : c));
      } else {
        const res = await api.post('/api/courses', data);
        setCourses(prev => [res.data, ...prev]);
      }
    } catch (e) { console.error('Failed to save course', e); }
    setFormOpen(false); setEditing(null);
  }
  function openEdit(item) { setEditing(item); setFormOpen(true); }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading drills &amp; courses…</div>;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">Drills & Courses</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Department training activity · ISO hour tracking · Certifications</p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-sm">
          <Plus size={15} /> {activeTab === 'drills' ? 'Log Drill' : 'Log Course'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Drills YTD',       value: drills.length,       color: 'text-gray-900 dark:text-gray-100' },
          { label: 'ISO Hours YTD',    value: `${totalDrillHours}h`, color: 'text-red-700 dark:text-red-300' },
          { label: 'Courses YTD',      value: courses.length,      color: 'text-blue-700 dark:text-blue-300' },
          { label: 'Members Active',   value: uniqueAttended,      color: 'text-green-700 dark:text-green-300' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3 shadow-sm">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Search */}
      <div className="flex gap-3 items-center">
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button onClick={() => { setActiveTab('drills'); setExpandedId(null); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'drills' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <Flame size={13} /> Drills ({drills.length})
          </button>
          <button onClick={() => { setActiveTab('courses'); setExpandedId(null); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'courses' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <BookOpen size={13} /> Courses ({courses.length})
          </button>
        </div>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === 'drills' ? 'Search drills…' : 'Search courses…'}
            aria-label={activeTab === 'drills' ? 'Search drills' : 'Search courses'}
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300" />
        </div>
      </div>

      {/* Drills list */}
      {activeTab === 'drills' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="grid grid-cols-[2fr_1.2fr_0.8fr_0.8fr_1.2fr_1.5fr_24px] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <span>Drill</span><span>Type</span><span>Date</span><span>Duration</span><span>Instructor</span><span>Attendance</span><span />
          </div>
          {filteredDrills.length === 0 && <p className="text-center text-sm text-gray-400 py-12">No drills found.</p>}
          {filteredDrills.map(d => {
            const { attended, total } = attendanceStats(d.attendees);
            const isOpen = expandedId === d.id;
            return (
              <div key={d.id} className="border-b border-gray-50 last:border-b-0">
                <div onClick={() => setExpandedId(isOpen ? null : d.id)}
                  role="button" tabIndex={0} aria-label={`Toggle details for ${d.title}`} aria-expanded={isOpen}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isOpen ? null : d.id); } }}
                  className="grid grid-cols-[2fr_1.2fr_0.8fr_0.8fr_1.2fr_1.5fr_24px] gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 items-center">
                  <div>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{d.title}</p>
                    {d.isoHours && <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded-full">ISO Hours</span>}
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-300">{d.type}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300">{d.date}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300">{hoursFromMinutes(d.duration)}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{d.instructor}</span>
                  <AttendanceBar attendees={d.attendees} />
                  {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>
                {isOpen && <DrillDetail drill={d} onEdit={openEdit} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Courses list */}
      {activeTab === 'courses' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_0.8fr_1fr_24px] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <span>Course</span><span>Provider</span><span>Dates</span><span>Certification</span><span>Cost</span><span>Enrollment</span><span />
          </div>
          {filteredCourses.length === 0 && <p className="text-center text-sm text-gray-400 py-12">No courses found.</p>}
          {filteredCourses.map(c => {
            const passed = c.attendees.filter(a => a.passed).length;
            const isOpen = expandedId === c.id;
            return (
              <div key={c.id} className="border-b border-gray-50 last:border-b-0">
                <div onClick={() => setExpandedId(isOpen ? null : c.id)}
                  role="button" tabIndex={0} aria-label={`Toggle details for ${c.courseName}`} aria-expanded={isOpen}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isOpen ? null : c.id); } }}
                  className="grid grid-cols-[2fr_1.5fr_1fr_1fr_0.8fr_1fr_24px] gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 items-center">
                  <div>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{c.courseName}</p>
                    <p className="text-[10px] text-gray-400">{c.type}</p>
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{c.provider}</span>
                  <div>
                    <p className="text-xs text-gray-700 dark:text-gray-300">{c.startDate}</p>
                    {c.endDate !== c.startDate && <p className="text-[10px] text-gray-400">→ {c.endDate}</p>}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{c.certificationEarned || '—'}</p>
                    <p className="text-[10px] text-gray-400">{c.certExpireYears > 0 ? `Renews every ${c.certExpireYears}yr` : 'No expiry'}</p>
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-300">{c.cost > 0 ? `$${c.cost.toLocaleString()}` : 'Free'}</span>
                  <div className="flex items-center gap-1.5">
                    <Users size={11} className="text-gray-400" />
                    <span className="text-xs text-gray-600 dark:text-gray-300">{passed}/{c.attendees.length} passed</span>
                  </div>
                  {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>
                {isOpen && <CourseDetail course={c} onEdit={openEdit} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Forms */}
      {formOpen && activeTab === 'drills' && (
        <DrillForm initial={editing} onSave={handleSaveDrill} onClose={() => { setFormOpen(false); setEditing(null); }} />
      )}
      {formOpen && activeTab === 'courses' && (
        <CourseForm initial={editing} onSave={handleSaveCourse} onClose={() => { setFormOpen(false); setEditing(null); }} />
      )}
    </div>
  );
}
