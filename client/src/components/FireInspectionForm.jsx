import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import {
  INSPECTION_TYPES, INSPECTION_RESULTS, VIOLATION_CODES, VIOLATION_STATUSES,
  isResolvedViolationStatus,
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

// date fields may arrive as ISO timestamps from the API — inputs need YYYY-MM-DD
const d10 = (v) => (typeof v === 'string' ? v.slice(0, 10) : '');

function InspectionForm({ property, properties, initial, onSave, onClose }) {
  // `initial` = an existing inspection → EDIT mode (2026-07-11: this was the dead
  // edit path — the form always sent id:null, so the parent's PATCH branch was
  // unreachable and no inspection could ever be corrected or completed).
  const [form, setForm] = useState({
    propertyId:    initial?.propertyId ?? property?.id ?? '',
    type:          initial?.type ?? '',
    inspectorName: initial?.inspectorName ?? '',
    scheduledDate: d10(initial?.scheduledDate),
    completedDate: d10(initial?.completedDate),
    result:        initial?.result ?? '',
    violations:    Array.isArray(initial?.violations) ? initial.violations : [],
    followUpDate:  d10(initial?.followUpDate),
    notes:         initial?.notes ?? '',
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
      // No `severity` — RETIRED 2026-07-14. This default ('Moderate') was the bug: an
      // inspector who never touched the field still had a grading printed on the notice
      // served on the owner. The record must never say something the officer didn't say.
      violations: [...f.violations, { code: '', description: '', status: 'Open', followUpDate: '', correctedDate: '', notes: '' }]
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
    onSave({ ...form, id: initial?.id ?? null });
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
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-start">
                <Field label="Violation Code">
                  <Select value={v.code} onChange={val => updateViolation(idx, 'code', val)}
                    options={VIOLATION_CODES.map(c => ({ code: c.code, label: `${c.code} — ${c.desc}` }))}
                    placeholder="Select violation…" />
                </Field>
                {/* Severity RETIRED 2026-07-14 — see data/fireInspections.js. */}
                <Field label="Status">
                  <Select value={v.status} onChange={val => updateViolation(idx, 'status', val)}
                    options={VIOLATION_STATUSES} />
                </Field>
                {/* P0 (2026-07-12): resolved-set membership, not a 'Corrected' literal —
                    the old compare gave Withdrawn (resolved, needs no follow-up) a
                    Follow-Up Date field. Resolved → date it was closed; open → follow-up. */}
                <Field label={isResolvedViolationStatus(v.status) ? 'Corrected Date' : 'Follow-Up Date'}>
                  <Input type="date"
                    value={isResolvedViolationStatus(v.status) ? v.correctedDate : v.followUpDate}
                    onChange={val => updateViolation(idx, isResolvedViolationStatus(v.status) ? 'correctedDate' : 'followUpDate', val)} />
                </Field>
                <button type="button" onClick={() => removeViolation(idx)} aria-label="Remove violation" className="mt-5 p-1.5 text-gray-400 hover:text-red-600">
                  <Trash2 size={13} />
                </button>
              </div>
              <Field label="Description">
                <Input value={v.description ?? ''} onChange={val => updateViolation(idx, 'description', val)}
                  placeholder="What was observed (as it should read on the notice)…" />
              </Field>
              <Field label="Notes">
                <Input value={v.notes} onChange={val => updateViolation(idx, 'notes', val)} placeholder="Internal notes…" />
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

// ─── Wrapper ──────────────────────────────────────────────────────────────────

export default function FireInspectionForm({ property, properties, initial, onSaveInspection, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-red-700 rounded-t-3xl">
          <h2 className="text-base font-black text-white">
            {initial ? 'Edit Inspection' : 'New Inspection'}
            {property && ` — ${property.name}`}
          </h2>
          <button onClick={onClose} aria-label="Close form" className="p-1.5 text-red-200 hover:text-white hover:bg-white/10 rounded-xl">
            <X size={16} />
          </button>
        </div>
        <InspectionForm property={property} properties={properties} initial={initial} onSave={onSaveInspection} onClose={onClose} />
      </div>
    </div>
  );
}
