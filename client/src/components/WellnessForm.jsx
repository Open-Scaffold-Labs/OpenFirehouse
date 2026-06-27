import { useState, useEffect } from 'react';
import { X, ShieldAlert, Save } from 'lucide-react';
import { EXPOSURE_TYPES } from '../data/wellness';
import AIWriteTextarea from './AIWriteTextarea';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100';

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

const BLANK = {
  date:           new Date().toISOString().slice(0, 10),
  incidentNumber: '',
  type:           'Smoke / Combustion Products',
  description:    '',
  deconPerformed: false,
  medEval:        false,
  followUp:       false,
  notes:          '',
};

export default function WellnessForm({ exposure, memberName, onSave, onClose }) {
  const isEdit = Boolean(exposure?.id);
  const [form, setForm] = useState(() => ({ ...BLANK, ...(isEdit ? exposure : {}) }));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  function set(field) { return (e) => setForm((f) => ({ ...f, [field]: e.target.value })); }
  function toggle(field) { setForm((f) => ({ ...f, [field]: !f[field] })); }

  function validate() {
    const errs = {};
    if (!form.date)              errs.date        = 'Date required';
    if (!form.type)              errs.type        = 'Type required';
    if (!form.description.trim()) errs.description = 'Description required';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave({ ...form, id: exposure?.id });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-orange-600 dark:text-orange-400" />
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                {isEdit ? 'Edit Exposure Record' : 'Log Exposure'}
              </h2>
              <p className="text-xs text-gray-400">{memberName}</p>
            </div>
          </div>
          <button onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Exposure Date" required>
              <input type="date" className={INPUT} value={form.date} onChange={set('date')}
                max={new Date().toISOString().slice(0, 10)} />
              {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
            </Field>
            <Field label="Incident #">
              <input type="text" className={INPUT} value={form.incidentNumber}
                onChange={set('incidentNumber')} placeholder="e.g. 26-0001" />
            </Field>
          </div>

          <Field label="Exposure Type" required>
            <select className={INPUT} value={form.type} onChange={set('type')}>
              {EXPOSURE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {errors.type && <p className="text-xs text-red-500 mt-1">{errors.type}</p>}
          </Field>

          <Field label="Description" required>
            <AIWriteTextarea
              rows={3} value={form.description} onChange={e => set('description')(e.target.value)}
              placeholder="Describe the nature and circumstances of the exposure…" name="description" id="wellness-description" />
            {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
          </Field>

          {/* Checkboxes */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Response Actions</p>
            {[
              { key: 'deconPerformed', label: 'Decontamination was performed' },
              { key: 'medEval',        label: 'Medical evaluation completed' },
              { key: 'followUp',       label: 'Follow-up required' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer group">
                <div
                  onClick={() => toggle(key)}
                  role="checkbox" aria-checked={form[key]} tabIndex={0} aria-label={label}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(key); } }}
                  className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                    form[key] ? 'bg-red-600 border-red-600' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 group-hover:border-red-400'
                  }`}
                >
                  {form[key] && <span className="text-white text-xs font-black">✓</span>}
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
              </label>
            ))}
          </div>

          <Field label="Notes">
            <AIWriteTextarea
              rows={2} value={form.notes} onChange={e => set('notes')(e.target.value)}
              placeholder="PPE condition, additional context…" name="notes" id="wellness-notes" />
          </Field>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit"
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 transition-colors">
              <Save size={14} />
              {isEdit ? 'Save Changes' : 'Log Exposure'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
