import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api } from '../utils/api';
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_LOCATIONS } from '../data/assets';
import DictateTextarea from './DictateTextarea';

const BLANK = {
  id: '',
  name: '',
  category: 'PPE',
  condition: 'Serviceable',
  serialNumber: '',
  assignedTo: '',
  location: '',
  purchaseDate: '',
  lastInspection: '',
  nextInspectionDue: '',
  notes: '',
};

function generateId(existing) {
  let n = existing.length + 1;
  let id;
  do { id = `ast-${String(n).padStart(3, '0')}`; n++; } while (existing.includes(id));
  return id;
}

export default function AssetForm({ asset, onSave, onClose, existingIds }) {
  const isEdit = Boolean(asset);
  const [form, setForm]   = useState(asset ? { ...asset } : { ...BLANK });
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

  const memberNames = members
    .filter((m) => m.status !== 'Inactive')
    .map((m) => m.name)
    .sort();

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function validate() {
    const e = {};
    if (!form.name?.trim()) e.name = 'Required';
    if (!form.category)     e.category = 'Required';
    if (!form.condition)    e.condition = 'Required';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const id = isEdit ? form.id : generateId(existingIds);
    onSave({
      ...form,
      id,
      assignedTo: form.assignedTo || null,
      purchaseDate:       form.purchaseDate       || null,
      lastInspection:     form.lastInspection     || null,
      nextInspectionDue:  form.nextInspectionDue  || null,
    });
  }

  const inputCls = (err) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 ${err ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'}`;

  const Field = ({ label, error, span, hint, children }) => (
    <div className={span === 2 ? 'md:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}</label>
      {children}
      {hint  && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
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
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{isEdit ? 'Edit Asset' : 'Add Asset'}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>

        {/* body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* name */}
            <Field label="Asset Name *" error={errors.name} span={2}>
              <input type="text" placeholder="e.g. SCBA Unit #4, Turnout Coat — Wells" aria-label="Asset name"
                value={form.name} onChange={(e) => set('name', e.target.value)}
                className={inputCls(errors.name)} />
            </Field>

            {/* category + condition */}
            <Field label="Category *" error={errors.category}>
              <select value={form.category} aria-label="Category" onChange={(e) => set('category', e.target.value)} className={inputCls(errors.category)}>
                {ASSET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Condition *" error={errors.condition}>
              <select value={form.condition} aria-label="Condition" onChange={(e) => set('condition', e.target.value)} className={inputCls(errors.condition)}>
                {ASSET_CONDITIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>

            {/* serial number */}
            <Field label="Serial Number" hint="Manufacturer serial or department asset tag">
              <input type="text" placeholder="e.g. SCBA-MSA-2024-004" aria-label="Serial number"
                value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)}
                className={inputCls()} />
            </Field>

            {/* location */}
            <Field label="Location">
              <select value={form.location ?? ''} aria-label="Location" onChange={(e) => set('location', e.target.value)} className={inputCls()}>
                <option value="">Select location…</option>
                {ASSET_LOCATIONS.map((l) => <option key={l}>{l}</option>)}
                <option value="__other__">Other…</option>
              </select>
              {form.location === '__other__' && (
                <input type="text" placeholder="Enter location" aria-label="Custom location"
                  onChange={(e) => set('location', e.target.value)}
                  className={`mt-2 ${inputCls()} dark:bg-gray-900 dark:text-gray-100`} />
              )}
            </Field>

            {/* assigned to */}
            <Field label="Assigned To" hint="Leave blank if apparatus or station-assigned" span={2}>
              <select value={form.assignedTo ?? ''} aria-label="Assigned to" onChange={(e) => set('assignedTo', e.target.value)} className={inputCls()}>
                <option value="">Unassigned</option>
                {memberNames.map((n) => <option key={n}>{n}</option>)}
              </select>
            </Field>

            {/* purchase date */}
            <Field label="Purchase Date">
              <input type="date" value={form.purchaseDate ?? ''} aria-label="Purchase date"
                onChange={(e) => set('purchaseDate', e.target.value)} className={inputCls()} />
            </Field>

            {/* last inspection */}
            <Field label="Last Inspection Date">
              <input type="date" value={form.lastInspection ?? ''} aria-label="Last inspection date"
                onChange={(e) => set('lastInspection', e.target.value)} className={inputCls()} />
            </Field>

            {/* next inspection */}
            <Field label="Next Inspection Due" span={2}>
              <input type="date" value={form.nextInspectionDue ?? ''} aria-label="Next inspection due"
                onChange={(e) => set('nextInspectionDue', e.target.value)} className={inputCls()} />
            </Field>

            {/* notes */}
            <Field label="Notes" span={2}>
              <DictateTextarea rows={3} placeholder="Manufacturer, model, maintenance history, special notes…"
                value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)}
                name="notes" id="asset-notes" />
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
            {isEdit ? 'Save Changes' : 'Add Asset'}
          </button>
        </div>
      </div>
    </div>
  );
}
