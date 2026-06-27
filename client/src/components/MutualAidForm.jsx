import DictateTextarea from './DictateTextarea';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api } from '../utils/api';
import {
  AID_DIRECTIONS, AID_INCIDENT_TYPES, AID_STATUSES, NEIGHBORING_DEPARTMENTS,
} from '../data/mutualAid';

const BLANK = {
  id: '',
  date: '',
  direction: 'Given',
  incidentType: 'Structure Fire',
  status: 'Completed',
  partnerDepartment: '',
  customDepartment: '',
  address: '',
  unitsDeployed: [],
  personnelCount: '',
  requestTime: '',
  clearTime: '',
  notes: '',
  incidentNumber: '',
};

function generateId(existing) {
  let n = existing.length + 1;
  let id;
  do { id = `ma-${String(n).padStart(3, '0')}`; n++; } while (existing.includes(id));
  return id;
}

export default function MutualAidForm({ record, onSave, onClose, existingIds }) {
  const isEdit = Boolean(record);

  const [form, setForm] = useState(() => {
    if (!record) return { ...BLANK };
    const isCustom = record.partnerDepartment && !NEIGHBORING_DEPARTMENTS.includes(record.partnerDepartment);
    return {
      ...BLANK,
      ...record,
      partnerDepartment: isCustom ? '__custom__' : (record.partnerDepartment ?? ''),
      customDepartment:  isCustom ? record.partnerDepartment : '',
    };
  });
  const [errors, setErrors] = useState({});
  const [apparatus, setApparatus] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Fetch apparatus on mount
  useEffect(() => {
    async function fetch() {
      try {
        const raw = await api.get('/api/apparatus');
        const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setApparatus(arr);
      } catch (err) {
        console.error('Failed to fetch apparatus:', err);
      } finally {
        setLoadingData(false);
      }
    }
    fetch();
  }, []);

  const unitOptions = apparatus
    .filter((a) => a.status !== 'Out of Service')
    .map((a) => a.designation);

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function toggleUnit(unit) {
    setForm((f) => ({
      ...f,
      unitsDeployed: f.unitsDeployed.includes(unit)
        ? f.unitsDeployed.filter((u) => u !== unit)
        : [...f.unitsDeployed, unit],
    }));
  }

  function validate() {
    const e = {};
    if (!form.date) e.date = 'Required';
    const dept = form.partnerDepartment === '__custom__' ? form.customDepartment : form.partnerDepartment;
    if (!dept?.trim()) e.partnerDepartment = 'Required';
    if (!form.incidentType) e.incidentType = 'Required';
    if (form.personnelCount !== '' && isNaN(Number(form.personnelCount))) e.personnelCount = 'Must be a number';
    return e;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const dept = form.partnerDepartment === '__custom__' ? form.customDepartment : form.partnerDepartment;
    const id = isEdit ? form.id : generateId(existingIds);
    onSave({
      ...form,
      id,
      partnerDepartment: dept,
      personnelCount: form.personnelCount === '' ? 0 : Number(form.personnelCount),
      unitsDeployed: form.unitsDeployed,
    });
  }

  const inputCls = (err) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100 ${err ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'}`;

  const Field = ({ label, error, span, hint, children }) => (
    <div className={span === 2 ? 'md:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );

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
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {isEdit ? 'Edit Mutual Aid Record' : 'Log Mutual Aid'}
          </h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>

        {/* body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* direction pills */}
            <Field label="Direction *" error={errors.direction} span={2}>
              <div className="flex gap-3">
                {AID_DIRECTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set('direction', d)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      form.direction === d
                        ? d === 'Given'
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {d === 'Given' ? '↑ Aid Given' : '↓ Aid Received'}
                  </button>
                ))}
              </div>
            </Field>

            {/* date */}
            <Field label="Date *" error={errors.date}>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputCls(errors.date)} />
            </Field>

            {/* status */}
            <Field label="Status">
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls()}>
                {AID_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>

            {/* partner department */}
            <Field label="Partner Department *" error={errors.partnerDepartment} span={2}>
              <select
                value={form.partnerDepartment}
                onChange={(e) => set('partnerDepartment', e.target.value)}
                className={inputCls(errors.partnerDepartment)}
              >
                <option value="">Select department…</option>
                {NEIGHBORING_DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                <option value="__custom__">Other / Enter manually…</option>
              </select>
              {form.partnerDepartment === '__custom__' && (
                <input
                  type="text"
                  placeholder="Enter department name"
                  value={form.customDepartment}
                  onChange={(e) => set('customDepartment', e.target.value)}
                  className={`mt-2 ${inputCls(errors.partnerDepartment)} dark:bg-gray-900 dark:text-gray-100`}
                />
              )}
            </Field>

            {/* incident type */}
            <Field label="Incident Type *" error={errors.incidentType}>
              <select value={form.incidentType} onChange={(e) => set('incidentType', e.target.value)} className={inputCls(errors.incidentType)}>
                {AID_INCIDENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>

            {/* personnel */}
            <Field label="Personnel Count" error={errors.personnelCount}>
              <input
                type="number" min="0" placeholder="e.g. 4"
                value={form.personnelCount}
                onChange={(e) => set('personnelCount', e.target.value)}
                className={inputCls(errors.personnelCount)}
              />
            </Field>

            {/* address */}
            <Field label="Incident Address" span={2}>
              <input
                type="text" placeholder="Street address or description"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                className={inputCls()}
              />
            </Field>

            {/* times */}
            <Field label="Request Time">
              <input type="time" value={form.requestTime} onChange={(e) => set('requestTime', e.target.value)} className={inputCls()} />
            </Field>
            <Field label="Clear Time">
              <input type="time" value={form.clearTime} onChange={(e) => set('clearTime', e.target.value)} className={inputCls()} />
            </Field>

            {/* units deployed */}
            <Field label="Units Deployed" span={2} hint="Select units that were sent or received">
              <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                {unitOptions.map((unit) => (
                  <label key={unit} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.unitsDeployed.includes(unit)}
                      onChange={() => toggleUnit(unit)}
                      className="accent-red-600"
                    />
                    <span className="text-gray-700 dark:text-gray-300">{unit}</span>
                  </label>
                ))}
              </div>
            </Field>

            {/* incident number */}
            <Field label="Related Incident #" hint="Your department's incident number, if applicable">
              <input
                type="text" placeholder="e.g. INC-2026-0008"
                value={form.incidentNumber}
                onChange={(e) => set('incidentNumber', e.target.value)}
                className={inputCls()}
              />
            </Field>

            {/* notes */}
            <Field label="Notes / Narrative" span={2}>
              <DictateTextarea
                rows={3}
                placeholder="Describe the response, conditions, outcome…"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>

          </div>
        </form>

        {/* footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-b-2xl">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit}
            className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
            {isEdit ? 'Save Changes' : 'Log Mutual Aid'}
          </button>
        </div>
      </div>
    </div>
  );
}
