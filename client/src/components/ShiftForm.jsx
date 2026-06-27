import { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, XCircle } from 'lucide-react';
import { api } from '../utils/api';
import { SHIFT_TYPES, SHIFT_TIMES } from '../data/schedule';
import { validateShift } from '../utils/scheduleRules';
import DictateTextarea from './DictateTextarea';

function ValidationAlerts({ shift, allShifts, leaveRequests, members }) {
  const { errors, warnings } = useMemo(
    () => validateShift(shift, allShifts, leaveRequests, members),
    [shift, allShifts, leaveRequests, members]
  );

  if (!errors.length && !warnings.length) return null;

  return (
    <div className="space-y-2">
      {errors.map((e, i) => (
        <div key={`e-${i}`} className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/50 ring-1 ring-red-200 px-3 py-2">
          <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-red-700 dark:text-red-300">{e}</span>
        </div>
      ))}
      {warnings.map((w, i) => (
        <div key={`w-${i}`} className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 ring-1 ring-amber-200 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-amber-700 dark:text-amber-300">{w}</span>
        </div>
      ))}
    </div>
  );
}

export default function ShiftForm({ shift, date, onSave, onClose }) {
  const [form, setForm] = useState({
    shiftType: 'Day',
    crew: [],
    notes: '',
  });
  const [members, setMembers] = useState([]);
  const [allShifts, setAllShifts] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Fetch members, shifts, and leave on mount
  useEffect(() => {
    async function fetch() {
      try {
        const [mRes, sRes, lRes] = await Promise.all([
          api.get('/api/members'),
          api.get('/api/shifts'),
          api.get('/api/leave'),
        ]);
        const members = Array.isArray(mRes?.data) ? mRes.data : Array.isArray(mRes) ? mRes : [];
        const shifts = Array.isArray(sRes?.data) ? sRes.data : Array.isArray(sRes) ? sRes : [];
        const leave = Array.isArray(lRes?.data) ? lRes.data : Array.isArray(lRes) ? lRes : [];
        setMembers(members);
        setAllShifts(shifts);
        setLeaveRequests(leave.filter(l => l.status === 'Approved'));
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoadingData(false);
      }
    }
    fetch();
  }, []);

  const activeMembers = members
    .filter((m) => m.status === 'Active' || m.status === 'Probationary')
    .map((m) => m.name);

  useEffect(() => {
    if (shift) {
      setForm({ shiftType: shift.shiftType, crew: [...shift.crew], notes: shift.notes || '' });
    } else {
      setForm({ shiftType: 'Day', crew: [], notes: '' });
    }
  }, [shift]);

  function toggleMember(name) {
    setForm((prev) => ({
      ...prev,
      crew: prev.crew.includes(name)
        ? prev.crew.filter((n) => n !== name)
        : [...prev.crew, name],
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, date, id: shift?.id });
  }

  const formatDate = (d) => {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  };

  if (loadingData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
            <p className="text-sm text-gray-400">Loading form…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-red-700">
          <div>
            <h2 className="text-base font-semibold text-white">
              {shift ? 'Edit Shift' : 'Add Shift'}
            </h2>
            <p className="text-xs text-red-200 mt-0.5">{formatDate(date)}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-red-200 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Shift type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Shift Type</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SHIFT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, shiftType: type }))}
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

          {/* Crew selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Assign Crew
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({form.crew.length} selected)
              </span>
            </label>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-700 max-h-52 overflow-y-auto">
              {activeMembers.map((name) => {
                const selected = form.crew.includes(name);
                return (
                  <label
                    key={name}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      selected ? 'bg-red-50 dark:bg-red-950/50' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleMember(name)}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 focus:ring-red-500"
                    />
                    <span className={`text-sm ${selected ? 'font-medium text-red-800 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>
                      {name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <DictateTextarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Optional shift notes…"
              name="notes"
              id="shift-notes"
            />
          </div>

          {/* Scheduling rules validation */}
          <ValidationAlerts
            shift={{ ...form, date, id: shift?.id }}
            allShifts={allShifts}
            leaveRequests={leaveRequests}
            members={members}
          />

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
            >
              {shift ? 'Save Changes' : 'Add Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
