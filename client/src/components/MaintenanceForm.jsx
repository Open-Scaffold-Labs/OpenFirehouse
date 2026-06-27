import DictateTextarea from './DictateTextarea';
import { useState, useEffect } from 'react';
import { X, Wrench, Save } from 'lucide-react';
import { api } from '../utils/api';
import {
  MAINTENANCE_TYPES, MAINTENANCE_STATUSES, MAINTENANCE_PRIORITIES,
} from '../data/maintenance';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100';
const TEXTAREA = `${INPUT} resize-none`;

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
  apparatusId:      '',
  apparatusName:    '',
  type:             'Preventive Maintenance',
  priority:         'Routine',
  status:           'Completed',
  date:             new Date().toISOString().slice(0, 10),
  mileage:          '',
  engineHours:      '',
  description:      '',
  technician:       '',
  vendor:           '',
  laborHours:       '',
  partsCost:        '',
  laborCost:        '',
  totalCost:        '',
  workOrder:        '',
  nextServiceMiles: '',
  nextServiceDate:  '',
  notes:            '',
};

export default function MaintenanceForm({ record, defaultApparatusId, onSave, onClose }) {
  const isEdit = Boolean(record?.id);
  const [apparatus, setApparatus] = useState([]);
  const [members, setMembers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Fetch apparatus and members on mount
  useEffect(() => {
    async function fetch() {
      try {
        const [appRes, memRes] = await Promise.all([
          api.get('/api/apparatus'),
          api.get('/api/members'),
        ]);
        const arr = Array.isArray(appRes?.data) ? appRes.data : Array.isArray(appRes) ? appRes : [];
        const mems = Array.isArray(memRes?.data) ? memRes.data : Array.isArray(memRes) ? memRes : [];
        setApparatus(arr);
        setMembers(mems);
      } catch (err) {
        console.error('Failed to fetch apparatus/members:', err);
      } finally {
        setLoadingData(false);
      }
    }
    fetch();
  }, []);

  const [form,   setForm]   = useState(() => {
    if (isEdit) {
      return {
        ...BLANK,
        ...record,
        mileage:          record.mileage          ?? '',
        engineHours:      record.engineHours      ?? '',
        laborHours:       record.laborHours        ?? '',
        partsCost:        record.partsCost         ?? '',
        laborCost:        record.laborCost         ?? '',
        totalCost:        record.totalCost         ?? '',
        nextServiceMiles: record.nextServiceMiles  ?? '',
        nextServiceDate:  record.nextServiceDate   ?? '',
      };
    }
    const preApparatus = defaultApparatusId
      ? apparatus.find((a) => a.id === defaultApparatusId)
      : null;
    return {
      ...BLANK,
      apparatusId:   preApparatus?.id   ?? '',
      apparatusName: preApparatus?.designation ?? '',
    };
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleApparatusChange(e) {
    const id = Number(e.target.value);
    const ap = apparatus.find((a) => a.id === id);
    setForm((f) => ({
      ...f,
      apparatusId:   id,
      apparatusName: ap?.designation ?? '',
      mileage:       ap?.mileage     ?? f.mileage,
    }));
  }

  // Auto-calculate total cost when parts or labor change
  function handleCostChange(field) {
    return (e) => {
      const val = e.target.value;
      setForm((f) => {
        const next = { ...f, [field]: val };
        const p = parseFloat(next.partsCost) || 0;
        const l = parseFloat(next.laborCost) || 0;
        if (p > 0 || l > 0) next.totalCost = String(p + l);
        return next;
      });
    };
  }

  function validate() {
    const errs = {};
    if (!form.apparatusId)        errs.apparatusId  = 'Select an apparatus';
    if (!form.description?.trim()) errs.description = 'Description required';
    if (!form.date)                errs.date         = 'Date required';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    onSave({
      ...form,
      id:               record?.id,
      apparatusId:      Number(form.apparatusId),
      mileage:          form.mileage          ? Number(form.mileage)          : null,
      engineHours:      form.engineHours      ? Number(form.engineHours)      : null,
      laborHours:       form.laborHours       ? Number(form.laborHours)       : null,
      partsCost:        form.partsCost        !== '' ? Number(form.partsCost)  : null,
      laborCost:        form.laborCost        !== '' ? Number(form.laborCost)  : null,
      totalCost:        form.totalCost        !== '' ? Number(form.totalCost)  : null,
      nextServiceMiles: form.nextServiceMiles ? Number(form.nextServiceMiles) : null,
      nextServiceDate:  form.nextServiceDate  || null,
    });
  }

  if (loadingData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Wrench size={18} className="text-red-600 dark:text-red-400" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Edit Maintenance Record' : 'Add Maintenance Record'}
            </h2>
          </div>
          <button onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Apparatus + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Apparatus" required>
              <select className={INPUT} value={form.apparatusId} onChange={handleApparatusChange}>
                <option value="">— Select unit —</option>
                {apparatus.map((a) => (
                  <option key={a.id} value={a.id}>{a.designation}</option>
                ))}
              </select>
              {errors.apparatusId && <p className="text-xs text-red-500 mt-1">{errors.apparatusId}</p>}
            </Field>
            <Field label="Date" required>
              <input type="date" className={INPUT} value={form.date} onChange={set('date')}
                max={new Date().toISOString().slice(0, 10)} />
              {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
            </Field>
          </div>

          {/* Type + Priority + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Service Type">
              <select className={INPUT} value={form.type} onChange={set('type')}>
                {MAINTENANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className={INPUT} value={form.priority} onChange={set('priority')}>
                {MAINTENANCE_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className={INPUT} value={form.status} onChange={set('status')}>
                {MAINTENANCE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          {/* Description */}
          <Field label="Description / Work Performed" required>
            <DictateTextarea rows={3} value={form.description}
              onChange={set('description')} placeholder="Describe the work performed or issue…" />
            {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
          </Field>

          {/* Mileage + Engine Hours + Work Order */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Mileage at Service">
              <input type="number" className={INPUT} value={form.mileage}
                onChange={set('mileage')} placeholder="e.g. 38420" min={0} />
            </Field>
            <Field label="Engine Hours">
              <input type="number" className={INPUT} value={form.engineHours}
                onChange={set('engineHours')} placeholder="Optional" min={0} step="0.1" />
            </Field>
            <Field label="Work Order #">
              <input type="text" className={INPUT} value={form.workOrder}
                onChange={set('workOrder')} placeholder="e.g. WO-2026-021" />
            </Field>
          </div>

          {/* Technician + Vendor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Technician / Performed By">
              <select className={INPUT} value={form.technician} onChange={set('technician')}>
                <option value="">— None —</option>
                {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
              </select>
            </Field>
            <Field label="Vendor / Shop (if external)">
              <input type="text" className={INPUT} value={form.vendor}
                onChange={set('vendor')} placeholder="e.g. Riverside Apparatus" />
            </Field>
          </div>

          {/* Costs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Parts Cost ($)">
              <input type="number" className={INPUT} value={form.partsCost}
                onChange={handleCostChange('partsCost')} placeholder="0.00" min={0} step="0.01" />
            </Field>
            <Field label="Labor Cost ($)">
              <input type="number" className={INPUT} value={form.laborCost}
                onChange={handleCostChange('laborCost')} placeholder="0.00" min={0} step="0.01" />
            </Field>
            <Field label="Total Cost ($)">
              <input type="number" className={INPUT} value={form.totalCost}
                onChange={set('totalCost')} placeholder="0.00" min={0} step="0.01" />
            </Field>
          </div>
          <div>
            <Field label="Labor Hours">
              <input type="number" className="w-40 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
                value={form.laborHours} onChange={set('laborHours')} placeholder="e.g. 2.5" min={0} step="0.25" />
            </Field>
          </div>

          {/* Next service */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Next Service Miles">
              <input type="number" className={INPUT} value={form.nextServiceMiles}
                onChange={set('nextServiceMiles')} placeholder="e.g. 43100" min={0} />
            </Field>
            <Field label="Next Service Date">
              <input type="date" className={INPUT} value={form.nextServiceDate}
                onChange={set('nextServiceDate')} />
            </Field>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <DictateTextarea rows={2} value={form.notes}
              onChange={set('notes')} placeholder="Additional notes, flagged items, follow-up needed…" />
          </Field>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit"
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 transition-colors">
              <Save size={14} />
              {isEdit ? 'Save Changes' : 'Add Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
