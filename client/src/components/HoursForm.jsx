import { useState, useEffect } from 'react';
import { X, Clock, Save } from 'lucide-react';
import { api } from '../utils/api';
import { ACTIVITY_TYPES } from '../data/volunteerHours';

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100';

export default function HoursForm({ entry, onSave, onClose }) {
  const isEdit = Boolean(entry);

  const blank = {
    memberId:     '',
    memberName:   '',
    date:         new Date().toISOString().slice(0, 10),
    activityType: 'Duty Shift',
    hours:        '',
    description:  '',
    reference:    '',
  };

  const [form, setForm] = useState(isEdit ? { ...entry } : blank);
  const [errors, setErrors] = useState({});
  const [members, setMembers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Fetch members on mount
  useEffect(() => {
    async function fetch() {
      try {
        const raw = await api.get('/api/members');
        const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setMembers(arr);
      } catch (err) {
        console.error('Failed to fetch members:', err);
      } finally {
        setLoadingData(false);
      }
    }
    fetch();
  }, []);

  const ACTIVE_MEMBERS = members.filter((m) => m.status !== 'Inactive');

  // When member dropdown changes, also update memberName
  function handleMemberChange(e) {
    const id = Number(e.target.value);
    const member = ACTIVE_MEMBERS.find((m) => m.id === id);
    setForm((f) => ({
      ...f,
      memberId:   id,
      memberName: member ? member.name : '',
    }));
  }

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function validate() {
    const errs = {};
    if (!form.memberId)     errs.memberId     = 'Member is required';
    if (!form.date)         errs.date         = 'Date is required';
    if (!form.activityType) errs.activityType = 'Activity type is required';
    const h = parseFloat(form.hours);
    if (!form.hours || isNaN(h) || h <= 0 || h > 24)
      errs.hours = 'Enter a valid number of hours (0.25 – 24)';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const saved = {
      ...form,
      memberId: Number(form.memberId),
      hours:    parseFloat(form.hours),
    };
    onSave(saved);
  }

  // Dismiss on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (loadingData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
            <p className="text-sm text-gray-400">Loading form…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-red-600 dark:text-red-400" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Edit Hours Entry' : 'Log Volunteer Hours'}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close form"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Member */}
          <Field label="Member" required>
            <select
              className={INPUT}
              aria-label="Member"
              value={form.memberId}
              onChange={handleMemberChange}
            >
              <option value="">— Select member —</option>
              {ACTIVE_MEMBERS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {errors.memberId && <p className="text-xs text-red-500 mt-1">{errors.memberId}</p>}
          </Field>

          {/* Date + Hours (side by side) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date" required>
              <input
                type="date"
                className={INPUT}
                aria-label="Date"
                value={form.date}
                onChange={set('date')}
                max={new Date().toISOString().slice(0, 10)}
              />
              {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
            </Field>

            <Field label="Hours" required>
              <input
                type="number"
                className={INPUT}
                aria-label="Hours"
                value={form.hours}
                onChange={set('hours')}
                placeholder="e.g. 3.5"
                min="0.25"
                max="24"
                step="0.25"
              />
              {errors.hours && <p className="text-xs text-red-500 mt-1">{errors.hours}</p>}
            </Field>
          </div>

          {/* Activity Type */}
          <Field label="Activity Type" required>
            <select
              className={INPUT}
              aria-label="Activity Type"
              value={form.activityType}
              onChange={set('activityType')}
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {errors.activityType && <p className="text-xs text-red-500 mt-1">{errors.activityType}</p>}
          </Field>

          {/* Description */}
          <Field label="Description / Notes">
            <textarea
              className={`${INPUT} resize-none`}
              aria-label="Description / Notes"
              rows={3}
              value={form.description}
              onChange={set('description')}
              placeholder="Brief description of the activity…"
            />
          </Field>

          {/* Reference Number */}
          <Field label="Reference # (optional)">
            <input
              type="text"
              className={INPUT}
              aria-label="Reference number"
              value={form.reference}
              onChange={set('reference')}
              placeholder="e.g. INC-2026-0042"
            />
          </Field>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors"
            >
              <Save size={14} />
              {isEdit ? 'Save Changes' : 'Log Hours'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
