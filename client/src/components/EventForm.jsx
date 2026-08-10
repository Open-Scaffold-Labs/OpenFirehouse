import { useState, useEffect } from 'react';
import { X, CalendarDays, Save } from 'lucide-react';
import { api } from '../utils/api';
import { EVENT_TYPES } from '../data/events';
import DictateTextarea from './DictateTextarea';
import { openTimePicker } from '../utils/timeInput';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900';

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

export default function EventForm({ event, onSave, onClose }) {
  const isEdit = Boolean(event?.id);

  const blank = {
    title:        '',
    type:         'Meeting',
    date:         '',
    startTime:    '18:00',
    endTime:      '',
    location:     'Station 14',
    organizer:    '',
    description:  '',
    maxAttendees: '',
    notes:        '',
    rsvps:        event?.rsvps ?? [],
  };

  const [form,   setForm]   = useState(isEdit ? { ...event, maxAttendees: event.maxAttendees ?? '' } : blank);
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

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function validate() {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.date)         errs.date  = 'Date is required';
    if (!form.type)         errs.type  = 'Type is required';
    if (form.startTime && form.endTime && form.endTime <= form.startTime)
      errs.endTime = 'End time must be after start time';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave({
      ...form,
      maxAttendees: form.maxAttendees ? Number(form.maxAttendees) : null,
    });
  }

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
            <CalendarDays size={18} className="text-red-600 dark:text-red-400" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Edit Event' : 'Add Event'}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close event form"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Title */}
          <Field label="Event Title" required>
            <input type="text" className={INPUT} value={form.title}
              onChange={set('title')} placeholder="e.g. Monthly Department Meeting" />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
          </Field>

          {/* Type + Date side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Event Type" required>
              <select className={INPUT} value={form.type} onChange={set('type')}>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {errors.type && <p className="text-xs text-red-500 mt-1">{errors.type}</p>}
            </Field>
            <Field label="Date" required>
              <input type="date" className={INPUT} value={form.date} onChange={set('date')} />
              {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
            </Field>
          </div>

          {/* Start / End time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Start Time">
              <input type="time" onClick={openTimePicker} className={INPUT} value={form.startTime} onChange={set('startTime')} />
            </Field>
            <Field label="End Time">
              <input type="time" onClick={openTimePicker} className={INPUT} value={form.endTime} onChange={set('endTime')} />
              {errors.endTime && <p className="text-xs text-red-500 mt-1">{errors.endTime}</p>}
            </Field>
          </div>

          {/* Location */}
          <Field label="Location">
            <input type="text" className={INPUT} value={form.location}
              onChange={set('location')} placeholder="e.g. Station 14 — Apparatus Bay" />
          </Field>

          {/* Organizer */}
          <Field label="Organizer / Point of Contact">
            <select className={INPUT} value={form.organizer} onChange={set('organizer')}>
              <option value="">— Select member —</option>
              {members.filter((m) => m.status !== 'Inactive').map((m) => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          </Field>

          {/* Description */}
          <Field label="Description">
            <DictateTextarea rows={3}
              value={form.description} onChange={e => set('description')(e.target.value)}
              placeholder="Brief description of the event…" name="description" id="event-description" />
          </Field>

          {/* Max attendees + Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Max Attendees (optional)">
              <input type="number" className={INPUT} value={form.maxAttendees}
                onChange={set('maxAttendees')} placeholder="Leave blank for unlimited"
                min={1} max={200} />
            </Field>
            <Field label="Notes">
              <input type="text" className={INPUT} value={form.notes}
                onChange={set('notes')} placeholder="e.g. Full PPE required" />
            </Field>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 transition-colors">
              <Save size={14} />
              {isEdit ? 'Save Changes' : 'Add Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
