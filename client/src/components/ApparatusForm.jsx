import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { APPARATUS_TYPES, APPARATUS_STATUSES } from '../data/apparatus';
import { api } from '../utils/api';
import DictateTextarea from './DictateTextarea';

const emptyForm = {
  designation: '',
  type: 'Engine',
  year: new Date().getFullYear(),
  make: '',
  model: '',
  status: 'In Service',
  mileage: '',
  lastService: '',
  nextServiceDue: '',
  assignedOperator: '',
  notes: '',
};

export default function ApparatusForm({ unit, onSave, onClose }) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [members, setMembers] = useState([]);

  useEffect(() => {
    setForm(unit ? { ...unit } : emptyForm);
    setErrors({});
  }, [unit]);

  useEffect(() => {
    api.get('/api/members').then(r => setMembers(r.data || [])).catch(() => setMembers([]));
  }, []);

  const isEditing = Boolean(unit);

  function validate() {
    const errs = {};
    if (!form.designation.trim()) errs.designation = 'Unit designation is required.';
    if (!form.type) errs.type = 'Type is required.';
    if (!form.year || isNaN(form.year)) errs.year = 'Valid year is required.';
    return errs;
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSave({ ...form, year: parseInt(form.year, 10), mileage: form.mileage === '' ? 0 : parseInt(form.mileage, 10) });
  }

  const field = (label, name, type = 'text', required = false, placeholder = '') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={form[name]}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={label}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 ${
          errors[name] ? 'border-red-400 bg-red-50 dark:bg-red-950/50' : 'border-gray-300 dark:border-gray-700'
        }`}
      />
      {errors[name] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-red-700">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? 'Edit Apparatus' : 'Add Apparatus'}
          </h2>
          <button onClick={onClose} className="text-red-200 hover:text-white transition-colors" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Designation */}
          {field('Unit Designation', 'designation', 'text', true, 'e.g. Engine 14')}

          {/* Type & Year */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                aria-label="Type"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
              >
                {APPARATUS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {field('Year', 'year', 'number', true, '2024')}
          </div>

          {/* Make & Model */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Make', 'make', 'text', false, 'e.g. Pierce')}
            {field('Model', 'model', 'text', false, 'e.g. Enforcer')}
          </div>

          {/* Status & Mileage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                aria-label="Status"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
              >
                {APPARATUS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {field('Mileage', 'mileage', 'number', false, '0')}
          </div>

          {/* Service Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Last Service Date', 'lastService', 'date')}
            {field('Next Service Due', 'nextServiceDue', 'date')}
          </div>

          {/* Assigned Operator */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Assigned Operator
            </label>
            <select
              name="assignedOperator"
              value={form.assignedOperator}
              onChange={handleChange}
              aria-label="Assigned operator"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
            >
              <option value="">— Select member —</option>
              {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <DictateTextarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Tank capacity, equipment notes, current issues…"
              id="apparatus-notes"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors shadow-sm"
            >
              {isEditing ? 'Save Changes' : 'Add Apparatus'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
