import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import {
  INSPECTION_TYPES, INSPECTION_RESULTS, PERMIT_TYPES,
  PERMIT_STATUSES, VIOLATION_CODES, VIOLATION_STATUSES,
} from '../data/fireInspections';
import { api } from '../utils/api';
import DictateTextarea from './DictateTextarea';

function Field({ label, required, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = 'text', ...rest }) {
  return (
    <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
      {...rest} />
  );
}

function Select({ value, onChange, options, placeholder = 'Select…', }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
      <option value="">{placeholder}</option>
      {options.map(o => (
        typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.code ?? o.value} value={o.code ?? o.value}>{o.label ?? o.desc ?? o.code}</option>
      ))}
    </select>
  );
}

// ─── Inspection Form ──────────────────────────────────────────────────────────

function InspectionForm({ property, properties, onSave, onClose }) {
  const [form, setForm] = useState({
    propertyId:    property?.id ?? '',
    type:          '',
    inspectorName: '',
    scheduledDate: '',
    completedDate: '',
    result:        '',
    violations:    [],
    followUpDate:  '',
    notes:         '',
  });
  const [members, setMembers] = useState([]);

  useEffect(() => {
    api.get('/api/members').then(raw => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setMembers(arr.filter(m => m.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);

  function set(key) { return val => setForm(f => ({ ...f, [key]: val })); }

  function addViolation() {
    setForm(f => ({
      ...f,
      violations: [...f.violations, { code: '', status: 'Open', followUpDate: '', correctedDate: '', notes: '' }]
    }));
  }

  function updateViolation(idx, key, val) {
    setForm(f => {
      const v = [...f.violations];
      v[idx] = { ...v[idx], [key]: val };
      return { ...f, violations: v };
    });
  }

  function removeViolation(idx) {
    setForm(f => ({ ...f, violations: f.violations.filter((_, i) => i !== idx) }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, id: null });
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      {/* Property */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Property" required>
          <Select
            value={form.propertyId}
            onChange={val => setForm(f => ({ ...f, propertyId: parseInt(val) || val }))}
            options={properties.map(p => ({ code: p.id, label: p.name }))}
            placeholder={property ? property.name : 'Select property…'}
          />
        </Field>
        <Field label="Inspection Type" required>
          <Select value={form.type} onChange={set('type')} options={INSPECTION_TYPES} />
        </Field>
      </div>

      {/* Inspector & Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Inspector" required>
          <Select value={form.inspectorName} onChange={set('inspectorName')}
            options={[
              ...members.map(m => ({ code: m.name, label: m.name })),
              { code: 'Other (external)', label: 'Other (external)' }
            ]} placeholder="Select inspector…" />
        </Field>
        <Field label="Scheduled Date" required>
          <Input type="date" value={form.scheduledDate} onChange={set('scheduledDate')} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Completed Date">
          <Input type="date" value={form.completedDate} onChange={set('completedDate')} />
        </Field>
        <Field label="Result">
          <Select value={form.result} onChange={set('result')} options={INSPECTION_RESULTS} />
        </Field>
        <Field label="Follow-Up Date">
          <Input type="date" value={form.followUpDate} onChange={set('followUpDate')} />
        </Field>
      </div>

      {/* Violations */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Violations Found</label>
          <button type="button" onClick={addViolation}
            className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
            <Plus size={10} /> Add Violation
          </button>
        </div>
        {form.violations.length === 0 && (
          <p className="text-xs text-gray-400 italic">No violations — click Add Violation to document findings.</p>
        )}
        <div className="space-y-2">
          {form.violations.map((v, idx) => (
            <div key={idx} className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-3 items-start">
                <Field label="Violation Code">
                  <Select value={v.code} onChange={val => updateViolation(idx, 'code', val)}
                    options={VIOLATION_CODES.map(c => ({ code: c.code, label: `${c.code} — ${c.desc}` }))}
                    placeholder="Select violation…" />
                </Field>
                <Field label="Status">
                  <Select value={v.status} onChange={val => updateViolation(idx, 'status', val)}
                    options={VIOLATION_STATUSES} />
                </Field>
                <Field label={v.status === 'Corrected' ? 'Corrected Date' : 'Follow-Up Date'}>
                  <Input type="date"
                    value={v.status === 'Corrected' ? v.correctedDate : v.followUpDate}
                    onChange={val => updateViolation(idx, v.status === 'Corrected' ? 'correctedDate' : 'followUpDate', val)} />
                </Field>
                <button type="button" onClick={() => removeViolation(idx)} aria-label="Remove violation" className="mt-5 p-1.5 text-gray-400 hover:text-red-600">
                  <Trash2 size={13} />
                </button>
              </div>
              <Field label="Notes">
                <Input value={v.notes} onChange={val => updateViolation(idx, 'notes', val)} placeholder="Detail the violation…" />
              </Field>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <Field label="Inspection Notes">
        <DictateTextarea value={form.notes} onChange={e => set('notes')(e.target.value)}
          rows={3} placeholder="General observations, follow-up actions required…" name="notes" id="inspection-notes" />
      </Field>

      <div className="flex gap-3 pt-2">
        <button type="submit"
          className="px-6 py-2.5 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700">
          Save Inspection
        </button>
        <button type="button" onClick={onClose}
          className="px-6 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Permit Form ──────────────────────────────────────────────────────────────

function PermitForm({ property, properties, onSave, onClose }) {
  const [form, setForm] = useState({
    propertyId:   property?.id ?? '',
    type:         '',
    permitNumber: '',
    issuedDate:   '',
    expiresDate:  '',
    status:       'Active',
    issuedBy:     '',
    fee:          '',
    conditions:   '',
    notes:        '',
  });
  const [members, setMembers] = useState([]);

  useEffect(() => {
    api.get('/api/members').then(raw => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setMembers(arr.filter(m => m.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);

  function set(key) { return val => setForm(f => ({ ...f, [key]: val })); }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, id: null });
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Property" required>
          <Select value={form.propertyId}
            onChange={val => setForm(f => ({ ...f, propertyId: parseInt(val) || val }))}
            options={properties.map(p => ({ code: p.id, label: p.name }))}
            placeholder={property ? property.name : 'Select property…'} />
        </Field>
        <Field label="Permit Type" required>
          <Select value={form.type} onChange={set('type')} options={PERMIT_TYPES} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Permit Number" required>
          <Input value={form.permitNumber} onChange={set('permitNumber')} placeholder="OCC-2026-001" />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={set('status')} options={PERMIT_STATUSES} />
        </Field>
        <Field label="Issued By">
          <Select value={form.issuedBy} onChange={set('issuedBy')}
            options={[
              ...members.map(m => ({ code: m.name, label: m.name })),
              { code: 'Other (external)', label: 'Other (external)' }
            ]} placeholder="Select officer…" />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Issued Date" required>
          <Input type="date" value={form.issuedDate} onChange={set('issuedDate')} />
        </Field>
        <Field label="Expires Date" required>
          <Input type="date" value={form.expiresDate} onChange={set('expiresDate')} />
        </Field>
        <Field label="Fee ($)">
          <Input type="number" value={form.fee} onChange={set('fee')} min="0" placeholder="0" />
        </Field>
      </div>
      <Field label="Conditions">
        <DictateTextarea value={form.conditions} onChange={e => set('conditions')(e.target.value)}
          rows={3} placeholder="Permit conditions and restrictions…" name="conditions" id="permit-conditions" />
      </Field>
      <Field label="Notes">
        <Input value={form.notes} onChange={set('notes')} placeholder="Internal notes…" />
      </Field>
      <div className="flex gap-3 pt-2">
        <button type="submit"
          className="px-6 py-2.5 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700">
          Save Permit
        </button>
        <button type="button" onClick={onClose}
          className="px-6 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Wrapper ──────────────────────────────────────────────────────────────────

export default function FireInspectionForm({ mode, property, properties, onSaveInspection, onSavePermit, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-red-700 rounded-t-3xl">
          <h2 className="text-base font-black text-white">
            {mode === 'permit' ? 'New Permit' : 'New Inspection'}
            {property && ` — ${property.name}`}
          </h2>
          <button onClick={onClose} aria-label="Close form" className="p-1.5 text-red-200 hover:text-white hover:bg-white/10 rounded-xl">
            <X size={16} />
          </button>
        </div>
        {mode === 'permit'
          ? <PermitForm     property={property} properties={properties} onSave={onSavePermit}     onClose={onClose} />
          : <InspectionForm property={property} properties={properties} onSave={onSaveInspection} onClose={onClose} />
        }
      </div>
    </div>
  );
}
