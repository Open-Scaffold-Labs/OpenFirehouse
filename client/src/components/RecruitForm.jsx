import { useState, useEffect } from 'react';
import { X, Save, ChevronRight, ChevronLeft } from 'lucide-react';
import { api } from '../utils/api';
import {
  PIPELINE_STAGES, RECRUIT_SOURCES, CHECKLIST_ITEMS,
} from '../data/recruitment';
import DateDropdown from './DateDropdown';
import DictateTextarea from './DictateTextarea';

const TABS = ['Basic Info', 'Contact', 'Progress'];

const EMPTY = {
  name: '', phone: '', email: '', address: '', dob: '',
  source: 'Ride-Along', recruiter: '',
  stage: 'Prospect',
  dateAdded: new Date().toISOString().slice(0, 10),
  interviewDate: '', physicalDate: '', orientationDate: '',
  notes: '',
  stageHistory: [],
  checklist: Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.id, false])),
};

export default function RecruitForm({ prospect, onSave, onClose }) {
  const isEdit   = !!prospect;
  const [tab, setTab]     = useState(0);
  const [form, setForm]   = useState(prospect ? { ...prospect } : { ...EMPTY });

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

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  function setChecklist(id, value) {
    setForm((f) => ({ ...f, checklist: { ...f.checklist, [id]: value } }));
  }

  function validate() {
    const errs = {};
    if (!form.name.trim())  { errs.name = 'Name is required.';  }
    if (!form.stage)        { errs.stage = 'Stage is required.'; }
    if (!form.source)       { errs.source = 'Source is required.'; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Invalid email address.';
    }
    setErrors(errs);
    const firstErrField = Object.keys(errs)[0];
    if (firstErrField) {
      if (['name', 'source', 'recruiter'].includes(firstErrField)) setTab(0);
      else if (['phone', 'email', 'address'].includes(firstErrField)) setTab(1);
      else setTab(2);
    }
    return Object.keys(errs).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    // If stage changed and not already in history, append
    const lastStage = form.stageHistory.at(-1)?.stage;
    let history = form.stageHistory;
    if (form.stage !== lastStage) {
      history = [
        ...history,
        { stage: form.stage, date: new Date().toISOString().slice(0, 10), notes: '' },
      ];
    }
    onSave({ ...form, stageHistory: history });
  }

  const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1';
  const inputCls = (f) => `w-full border ${errors[f] ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100`;
  const errMsg = (f) => errors[f] ? <p className="text-xs text-red-500 mt-1">{errors[f]}</p> : null;

  if (loadingData) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
            <p className="text-sm text-gray-400">Loading form…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">{isEdit ? 'Edit Prospect' : 'Add New Prospect'}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-700">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                tab === i
                  ? 'border-b-2 border-red-700 text-red-700 dark:text-red-300'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* ── Tab 0: Basic Info ── */}
          {tab === 0 && (
            <>
              <div>
                <label className={labelCls}>Full Name *</label>
                <input className={inputCls('name')} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="First Last" />
                {errMsg('name')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Date Added</label>
                  <input type="date" className={inputCls('dateAdded')} value={form.dateAdded} onChange={(e) => set('dateAdded', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Date of Birth</label>
                  <DateDropdown
                    value={form.dob}
                    onChange={(v) => set('dob', v)}
                    selectClass={inputCls('dob')}
                    yearEnd={new Date().getFullYear() - 16}
                    yearStart={new Date().getFullYear() - 100}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>How They Found Us *</label>
                <select className={inputCls('source')} value={form.source} onChange={(e) => set('source', e.target.value)}>
                  {RECRUIT_SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
                {errMsg('source')}
              </div>
              <div>
                <label className={labelCls}>Assigned Recruiter / Mentor</label>
                <select
                  className={inputCls('recruiter')}
                  value={form.recruiter}
                  onChange={(e) => set('recruiter', e.target.value)}
                >
                  <option value="">Select member…</option>
                  {members
                    .filter(m => m.status !== 'Inactive')
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <DictateTextarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Background, skills, concerns, referral context…"
                  name="notes"
                  id="recruit-notes"
                />
              </div>
            </>
          )}

          {/* ── Tab 1: Contact ── */}
          {tab === 1 && (
            <>
              <div>
                <label className={labelCls}>Phone</label>
                <input className={inputCls('phone')} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 000-0000" />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" className={inputCls('email')} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="prospect@email.com" />
                {errMsg('email')}
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <DictateTextarea
                  rows={2}
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="Street, City, State ZIP"
                  name="address"
                  id="recruit-address"
                />
              </div>
              <p className="text-xs text-gray-400 italic">Contact information is visible to officers and chief only.</p>
            </>
          )}

          {/* ── Tab 2: Progress ── */}
          {tab === 2 && (
            <>
              <div>
                <label className={labelCls}>Current Stage *</label>
                <select className={inputCls('stage')} value={form.stage} onChange={(e) => set('stage', e.target.value)}>
                  {PIPELINE_STAGES.map((s) => <option key={s}>{s}</option>)}
                </select>
                {errMsg('stage')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Interview Date</label>
                  <input type="date" className={inputCls('interviewDate')} value={form.interviewDate} onChange={(e) => set('interviewDate', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Physical Date</label>
                  <input type="date" className={inputCls('physicalDate')} value={form.physicalDate} onChange={(e) => set('physicalDate', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Orientation Date</label>
                  <input type="date" className={inputCls('orientationDate')} value={form.orientationDate} onChange={(e) => set('orientationDate', e.target.value)} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Onboarding Checklist</label>
                <div className="space-y-2 border border-gray-100 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-950">
                  {CHECKLIST_ITEMS.map((item) => (
                    <label key={item.id} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form.checklist[item.id]}
                        onChange={(e) => setChecklist(item.id, e.target.checked)}
                        className="rounded text-red-700 dark:text-red-300 accent-red-700"
                      />
                      <span className={`text-sm ${form.checklist[item.id] ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-b-2xl">
          <div className="flex gap-2">
            <button
              onClick={() => setTab((t) => Math.max(0, t - 1))}
              disabled={tab === 0}
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 disabled:opacity-30 transition-colors font-medium"
            >
              <ChevronLeft size={15} /> Back
            </button>
            <button
              onClick={() => setTab((t) => Math.min(TABS.length - 1, t + 1))}
              disabled={tab === TABS.length - 1}
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 disabled:opacity-30 transition-colors font-medium"
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-800 transition-colors"
            >
              <Save size={14} /> {isEdit ? 'Save Changes' : 'Add Prospect'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
