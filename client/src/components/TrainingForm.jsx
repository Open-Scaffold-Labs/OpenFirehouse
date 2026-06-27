import DictateTextarea from './DictateTextarea';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api } from '../utils/api';
import { TRAINING_TYPES, TRAINING_STATUSES, CERT_NAMES, DELIVERY_METHODS } from '../data/training';

const BLANK = {
  id: '',
  memberId: '',
  memberName: '',
  courseName: '',
  type: 'Certification',
  status: 'Passed',
  completedDate: '',
  expiresDate: '',
  hours: '',
  instructor: '',
  location: '',
  notes: '',
  delivery_method: 'Classroom',
};

function generateId(existing) {
  let n = existing.length + 1;
  let id;
  do { id = `tr-${String(n).padStart(3, '0')}`; n++; } while (existing.includes(id));
  return id;
}

export default function TrainingForm({ record, onSave, onClose, existingIds }) {
  const isEdit = Boolean(record);
  const [form, setForm] = useState(record ? { ...record, delivery_method: record.delivery_method || 'Classroom' } : { ...BLANK });
  const [errors, setErrors] = useState({});
  const [customCourse, setCustomCourse] = useState(
    record ? !CERT_NAMES.includes(record.courseName) : false
  );
  const [members, setMembers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Bulk entry: only available when adding (not editing)
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkMemberIds, setBulkMemberIds] = useState([]);

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

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  // when member dropdown changes, also set memberName
  function handleMember(memberId) {
    const id = Number(memberId);
    const m = members.find((m) => m.id === id);
    setForm((f) => ({ ...f, memberId: id, memberName: m ? m.name : '' }));
    setErrors((e) => { const n = { ...e }; delete n.memberId; return n; });
  }

  function validate() {
    const e = {};
    if (bulkMode) {
      if (bulkMemberIds.length === 0) e.memberId = 'Select at least one member';
    } else {
      if (!form.memberId) e.memberId = 'Required';
    }
    if (!form.courseName.trim()) e.courseName = 'Required';
    if (!form.type) e.type = 'Required';
    if (!form.status) e.status = 'Required';
    if (form.hours !== '' && isNaN(Number(form.hours))) e.hours = 'Must be a number';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    const shared = {
      ...form,
      hours:         form.hours === '' ? null : Number(form.hours),
      completedDate: form.completedDate || null,
      expiresDate:   form.expiresDate   || null,
      delivery_method: form.delivery_method || 'Classroom',
    };

    if (bulkMode && !isEdit) {
      // Fire one save per selected member
      bulkMemberIds.forEach((mid) => {
        const m = members.find((x) => x.id === mid);
        onSave({ ...shared, id: generateId(existingIds), memberId: mid, memberName: m ? m.name : '' });
      });
    } else {
      onSave({ ...shared, id: isEdit ? form.id : generateId(existingIds), memberId: Number(form.memberId) });
    }
  }

  function toggleBulkMember(id) {
    setBulkMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const Field = ({ label, error, children }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );

  const inputCls = (err) =>
    `w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-300 ${
      err ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'
    }`;

  const activeSortedMembers = members
    .filter((m) => m.status !== 'Inactive')
    .sort((a, b) => a.name.localeCompare(b.name));

  if (loadingData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
            <p className="text-sm text-gray-400">Loading form…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Edit Training Record' : 'Add Training Record'}
            </h2>
            {!isEdit && (
              <p className="text-xs text-gray-400 mt-0.5">
                Entered by captain — saved to member's permanent record
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* bulk toggle — only on new records */}
            {!isEdit && (
              <button
                type="button"
                onClick={() => { setBulkMode((b) => !b); setBulkMemberIds([]); }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  bulkMode
                    ? 'bg-red-700 text-white border-red-700'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300 hover:text-red-600'
                }`}
              >
                {bulkMode ? '✓ Group Entry' : 'Group Entry'}
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* member — single or bulk */}
          {bulkMode ? (
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Members * <span className="font-normal text-gray-400">— select all who attended</span>
              </label>
              <div className={`border rounded-lg max-h-44 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 ${errors.memberId ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'}`}>
                {activeSortedMembers.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkMemberIds.includes(m.id)}
                      onChange={() => toggleBulkMember(m.id)}
                      className="accent-red-600"
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-100">{m.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">{m.rank}</span>
                  </label>
                ))}
              </div>
              {bulkMemberIds.length > 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                  {bulkMemberIds.length} member{bulkMemberIds.length !== 1 ? 's' : ''} selected — one record will be created per member
                </p>
              )}
              {errors.memberId && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.memberId}</p>}
            </div>
          ) : (
            <Field label="Member *" error={errors.memberId}>
              <select
                value={form.memberId}
                onChange={(e) => handleMember(e.target.value)}
                className={inputCls(errors.memberId)}
              >
                <option value="">Select member…</option>
                {activeSortedMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>
                ))}
              </select>
            </Field>
          )}

          {/* course name */}
          <Field label="Course / Certification Name *" error={errors.courseName}>
            {!customCourse ? (
              <div className="flex gap-2">
                <select
                  value={CERT_NAMES.includes(form.courseName) ? form.courseName : ''}
                  onChange={(e) => set('courseName', e.target.value)}
                  className={`flex-1 ${inputCls(errors.courseName)}`}
                >
                  <option value="">Select a common certification…</option>
                  {CERT_NAMES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setCustomCourse(true)}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline whitespace-nowrap"
                >
                  Custom…
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter course name"
                  value={form.courseName}
                  onChange={(e) => set('courseName', e.target.value)}
                  className={`flex-1 ${inputCls(errors.courseName)}`}
                />
                <button
                  type="button"
                  onClick={() => { setCustomCourse(false); set('courseName', ''); }}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:underline whitespace-nowrap"
                >
                  ← List
                </button>
              </div>
            )}
          </Field>

          {/* type + status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Type *" error={errors.type}>
              <select value={form.type} onChange={(e) => set('type', e.target.value)} className={inputCls(errors.type)}>
                {TRAINING_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Status *" error={errors.status}>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls(errors.status)}>
                {TRAINING_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          {/* delivery method */}
          <Field label="Delivery Method *" error={errors.delivery_method}>
            <div className="grid grid-cols-3 gap-2">
              {DELIVERY_METHODS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => set('delivery_method', d.value)}
                  className={`flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    form.delivery_method === d.value
                      ? 'bg-red-50 dark:bg-red-950/50 border-red-400 text-red-700 dark:text-red-300'
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-red-200'
                  }`}
                >
                  <span className="text-xs font-semibold">{d.label}</span>
                  <span className="text-[10px] text-gray-400 mt-0.5 leading-tight">{d.description}</span>
                </button>
              ))}
            </div>
          </Field>

          {/* dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date Completed" error={errors.completedDate}>
              <input
                type="date"
                value={form.completedDate || ''}
                onChange={(e) => set('completedDate', e.target.value)}
                className={inputCls(errors.completedDate)}
              />
            </Field>
            <Field label="Expiration Date" error={errors.expiresDate}>
              <input
                type="date"
                value={form.expiresDate || ''}
                onChange={(e) => set('expiresDate', e.target.value)}
                className={inputCls(errors.expiresDate)}
              />
              <p className="text-xs text-gray-400 mt-1">Leave blank if certification does not expire</p>
            </Field>
          </div>

          {/* hours + instructor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Training Hours" error={errors.hours}>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="e.g. 8"
                value={form.hours ?? ''}
                onChange={(e) => set('hours', e.target.value)}
                className={inputCls(errors.hours)}
              />
            </Field>
            <Field label="Instructor / Provider" error={errors.instructor}>
              <select
                value={activeSortedMembers.some(m => m.name === form.instructor) ? form.instructor : (form.instructor ? '__custom__' : '')}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    set('instructor', '');
                    document.getElementById('instructor-custom')?.focus();
                  } else {
                    set('instructor', e.target.value);
                  }
                }}
                className={inputCls(errors.instructor)}
              >
                <option value="">Select instructor…</option>
                {activeSortedMembers.map((m) => (
                  <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>
                ))}
                <option value="__custom__">Other (external provider)…</option>
              </select>
              {(!activeSortedMembers.some(m => m.name === form.instructor) && form.instructor !== '') && (
                <input
                  id="instructor-custom"
                  type="text"
                  placeholder="e.g. State Fire Academy"
                  value={form.instructor || ''}
                  onChange={(e) => set('instructor', e.target.value)}
                  className={`mt-1 ${inputCls(errors.instructor)}`}
                />
              )}
            </Field>
          </div>

          {/* location */}
          <Field label="Location" error={errors.location}>
            <input
              type="text"
              placeholder="e.g. Station 14, County Training Center, Online"
              value={form.location || ''}
              onChange={(e) => set('location', e.target.value)}
              className={inputCls(errors.location)}
            />
          </Field>

          {/* notes */}
          <Field label="Notes" error={errors.notes}>
            <DictateTextarea
              rows={3}
              placeholder="Additional notes, certificate numbers, follow-up requirements…"
              value={form.notes || ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>
        </form>

        {/* footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            {isEdit ? 'Save Changes' : 'Add Record'}
          </button>
        </div>
      </div>
    </div>
  );
}
