import { useState, useEffect, useCallback } from 'react';
import {
  Heart, Home, Users, ShieldCheck, ChevronDown, ChevronUp,
  Plus, X, AlertTriangle, BookOpen, Calendar, Phone,
  CheckCircle2, Flame, MapPin, ClipboardList,
} from 'lucide-react';
import {
  VISIT_TYPES, PROGRAM_TYPES, RISK_LEVELS, RISK_COLORS,
  OUTCOME_TYPES, JFS_OUTCOMES, DETECTOR_STATUS, CRR_MEMBERS,
  getCRRStats,
} from '../data/crr';
import { api } from '../utils/api';

// ── Small helpers ─────────────────────────────────────────────────────────────
function RiskBadge({ level }) {
  const c = RISK_COLORS[level] ?? RISK_COLORS['Low'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {level}
    </span>
  );
}

function Tag({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 text-xs px-2 py-0.5 rounded-full font-medium">
      {label}
      {onRemove && (
        <button onClick={onRemove} aria-label={`Remove ${label}`} className="hover:text-blue-600"><X size={10} /></button>
      )}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-50 dark:bg-blue-950/50  border-blue-100 dark:border-blue-900  text-blue-600 dark:text-blue-400',
    green:  'bg-green-50 dark:bg-green-950/50 border-green-100 dark:border-green-900 text-green-600 dark:text-green-400',
    amber:  'bg-amber-50 dark:bg-amber-950/50 border-amber-100 dark:border-amber-900 text-amber-600 dark:text-amber-400',
    red:    'bg-red-50 dark:bg-red-950/50   border-red-100 dark:border-red-900   text-red-600 dark:text-red-400',
    purple: 'bg-purple-50 dark:bg-purple-950/50 border-purple-100 dark:border-purple-900 text-purple-600 dark:text-purple-400',
  };
  return (
    <div className={`rounded-2xl border p-4 flex items-start gap-3 ${colors[color]}`}>
      <div className="p-2 rounded-xl bg-white/70 dark:bg-gray-900/70 shadow-sm">
        <Icon size={18} className="current" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Visit Form ────────────────────────────────────────────────────────────────
function VisitForm({ initial, onSave, onCancel }) {
  const blank = {
    date: '', type: 'Home Safety Visit', address: '', resident: '',
    phone: '', riskLevel: 'Moderate', crew: [], smokeDet: 'N/A', coDet: 'N/A',
    outcomes: [], hazards: '', notes: '', followUpDate: '',
  };
  const [f, setF] = useState(initial ?? blank);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const toggleItem = (key, val) =>
    set(key, f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val]);

  const handleSave = () => {
    if (!f.date || !f.address || !f.resident) {
      alert('Date, address, and resident name are required.'); return;
    }
    onSave({ ...f, id: initial?.id ?? `v${Date.now()}` });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 rounded-t-3xl border-b border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">{initial ? 'Edit Visit' : 'Log Home Safety Visit'}</h2>
          <button onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"><X size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          {/* Row 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Date *</label>
              <input type="date" value={f.date} onChange={e => set('date', e.target.value)} aria-label="Date"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Visit Type</label>
              <select value={f.type} onChange={e => set('type', e.target.value)} aria-label="Visit type"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
                {VISIT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {/* Address / Resident */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Address *</label>
            <input value={f.address} onChange={e => set('address', e.target.value)} aria-label="Address"
              placeholder="412 Elm Street" className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Resident Name *</label>
              <input value={f.resident} onChange={e => set('resident', e.target.value)} aria-label="Resident name"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Phone</label>
              <input value={f.phone} onChange={e => set('phone', e.target.value)} aria-label="Phone"
                placeholder="715-555-0000" className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
          </div>
          {/* Risk Level */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Risk Level</label>
            <div className="flex gap-2 flex-wrap">
              {RISK_LEVELS.map(lvl => {
                const c = RISK_COLORS[lvl];
                const sel = f.riskLevel === lvl;
                return (
                  <button key={lvl} onClick={() => set('riskLevel', lvl)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${sel ? `${c.bg} ${c.text} border-transparent shadow` : 'bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Detectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Smoke Detector</label>
              <select value={f.smokeDet} onChange={e => set('smokeDet', e.target.value)} aria-label="Smoke detector status"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
                {DETECTOR_STATUS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">CO Detector</label>
              <select value={f.coDet} onChange={e => set('coDet', e.target.value)} aria-label="CO detector status"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
                {DETECTOR_STATUS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {/* Outcomes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Outcomes</label>
            <div className="flex flex-wrap gap-2">
              {OUTCOME_TYPES.map(o => (
                <button key={o} onClick={() => toggleItem('outcomes', o)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${f.outcomes.includes(o) ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          {/* Crew */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Crew</label>
            <div className="flex flex-wrap gap-2">
              {CRR_MEMBERS.map(m => (
                <button key={m} onClick={() => toggleItem('crew', m)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${f.crew.includes(m) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          {/* Hazards / Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Hazards Found</label>
            <textarea value={f.hazards} onChange={e => set('hazards', e.target.value)} aria-label="Hazards found"
              rows={2} placeholder="Describe any hazards identified and corrected..."
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm resize-none dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Notes</label>
            <textarea value={f.notes} onChange={e => set('notes', e.target.value)} aria-label="Notes"
              rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm resize-none dark:bg-gray-900 dark:text-gray-100" />
          </div>
          {/* Follow-Up */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Follow-Up Date</label>
            <input type="date" value={f.followUpDate} onChange={e => set('followUpDate', e.target.value)} aria-label="Follow-up date"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 rounded-b-3xl border-t border-gray-100 dark:border-gray-700 px-6 py-4 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={handleSave} className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Save Visit</button>
        </div>
      </div>
    </div>
  );
}

// ── Program Form ──────────────────────────────────────────────────────────────
function ProgramForm({ initial, onSave, onCancel }) {
  const blank = {
    date: '', type: 'School / Youth Education', title: '', location: '',
    audience: '', attendees: '', crew: [], topics: [], materials: '',
    outcome: '', notes: '', jfs: false, jfsOutcome: '', jfsFollowUp: '',
  };
  const [f, setF] = useState(initial ?? blank);
  const [topicInput, setTopicInput] = useState('');
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const toggleMember = m =>
    set('crew', f.crew.includes(m) ? f.crew.filter(x => x !== m) : [...f.crew, m]);

  const addTopic = () => {
    const t = topicInput.trim();
    if (t && !f.topics.includes(t)) { set('topics', [...f.topics, t]); setTopicInput(''); }
  };

  const handleSave = () => {
    if (!f.date || !f.title || !f.type) { alert('Date and title are required.'); return; }
    onSave({ ...f, attendees: Number(f.attendees) || 0, id: initial?.id ?? `p${Date.now()}` });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 rounded-t-3xl border-b border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">{initial ? 'Edit Program' : 'Log Community Program'}</h2>
          <button onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"><X size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Date *</label>
              <input type="date" value={f.date} onChange={e => set('date', e.target.value)} aria-label="Date"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Program Type</label>
              <select value={f.type} onChange={e => set('type', e.target.value)} aria-label="Program type"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
                {PROGRAM_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Title / Event Name *</label>
            <input value={f.title} onChange={e => set('title', e.target.value)} aria-label="Title or event name"
              placeholder="Fire Safety Day — Lincoln Elementary"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Location</label>
              <input value={f.location} onChange={e => set('location', e.target.value)} aria-label="Location"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Audience</label>
              <input value={f.audience} onChange={e => set('audience', e.target.value)} aria-label="Audience"
                placeholder="K–4 students, General public..."
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Attendees / People Reached</label>
            <input type="number" min="0" value={f.attendees} onChange={e => set('attendees', e.target.value)} aria-label="Attendees or people reached"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
          {/* Topics */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Topics Covered</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {f.topics.map(t => (
                <Tag key={t} label={t} onRemove={() => set('topics', f.topics.filter(x => x !== t))} />
              ))}
            </div>
            <div className="flex gap-2">
              <input value={topicInput} onChange={e => setTopicInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTopic()}
                placeholder="Add topic and press Enter"
                aria-label="Add topic"
                className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
              <button onClick={addTopic}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">Add</button>
            </div>
          </div>
          {/* Crew */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Crew</label>
            <div className="flex flex-wrap gap-2">
              {CRR_MEMBERS.map(m => (
                <button key={m} onClick={() => toggleMember(m)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${f.crew.includes(m) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Materials / Giveaways</label>
            <input value={f.materials} onChange={e => set('materials', e.target.value)} aria-label="Materials or giveaways"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Outcome / Result</label>
            <textarea value={f.outcome} onChange={e => set('outcome', e.target.value)} aria-label="Outcome or result"
              rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm resize-none dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Notes</label>
            <textarea value={f.notes} onChange={e => set('notes', e.target.value)} aria-label="Notes"
              rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm resize-none dark:bg-gray-900 dark:text-gray-100" />
          </div>
          {/* JFS Toggle */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => set('jfs', !f.jfs)}
                role="button" tabIndex={0} aria-label="Toggle Juvenile Fire Setter case" aria-expanded={f.jfs}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set('jfs', !f.jfs); } }}
                className={`w-10 h-5 rounded-full transition-colors relative ${f.jfs ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                <div className={`w-4 h-4 bg-white dark:bg-gray-900 rounded-full shadow absolute top-0.5 transition-all ${f.jfs ? 'left-5' : 'left-0.5'}`} />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Juvenile Fire Setter (JFS) Case</span>
            </label>
          </div>
          {f.jfs && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-4 border-l-2 border-orange-200 dark:border-orange-900">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">JFS Outcome</label>
                <select value={f.jfsOutcome} onChange={e => set('jfsOutcome', e.target.value)} aria-label="JFS outcome"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
                  <option value="">Select…</option>
                  {JFS_OUTCOMES.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">JFS Follow-Up Date</label>
                <input type="date" value={f.jfsFollowUp} onChange={e => set('jfsFollowUp', e.target.value)} aria-label="JFS follow-up date"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
              </div>
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 rounded-b-3xl border-t border-gray-100 dark:border-gray-700 px-6 py-4 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={handleSave} className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Save Program</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CommunityRisk() {
  const [visits, setVisits]       = useState([]);
  const [programs, setPrograms]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('visits');
  const [expandedId, setExpandedId] = useState(null);
  const [visitForm, setVisitForm]   = useState(null); // null | 'new' | visit obj
  const [progForm, setProgForm]     = useState(null);
  const [riskFilter, setRiskFilter] = useState('All');

  const fetchData = useCallback(async () => {
    try {
      const [visRes, progRes] = await Promise.all([
        api.get('/api/crr-visits'),
        api.get('/api/crr-programs'),
      ]);
      setVisits(visRes.data ?? []);
      setPrograms(progRes.data ?? []);
    } catch (e) {
      console.error('Failed to fetch CRR data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = getCRRStats(visits, programs);

  // ── Save handlers ─────────────────────────────────────────────────────────
  const saveVisit = async (v) => {
    try {
      if (visits.find(x => x.id === v.id)) {
        const { id, ...changes } = v;
        const res = await api.patch(`/api/crr-visits/${id}`, changes);
        setVisits(prev => prev.map(x => x.id === res.data.id ? res.data : x));
      } else {
        const { id: _ignore, ...body } = v;
        const res = await api.post('/api/crr-visits', body);
        setVisits(prev => [res.data, ...prev]);
      }
    } catch (e) {
      console.error('Failed to save visit', e);
    }
    setVisitForm(null);
  };
  const saveProgram = async (p) => {
    try {
      if (programs.find(x => x.id === p.id)) {
        const { id, ...changes } = p;
        const res = await api.patch(`/api/crr-programs/${id}`, changes);
        setPrograms(prev => prev.map(x => x.id === res.data.id ? res.data : x));
      } else {
        const { id: _ignore, ...body } = p;
        const res = await api.post('/api/crr-programs', body);
        setPrograms(prev => [res.data, ...prev]);
      }
    } catch (e) {
      console.error('Failed to save program', e);
    }
    setProgForm(null);
  };

  // ── Filtered visits ───────────────────────────────────────────────────────
  const filteredVisits = riskFilter === 'All' ? visits : visits.filter(v => v.riskLevel === riskFilter);

  // ── Upcoming follow-ups ───────────────────────────────────────────────────
  const today = new Date();
  const upcoming = visits
    .filter(v => v.followUpDate)
    .map(v => ({ ...v, daysUntil: Math.ceil((new Date(v.followUpDate) - today) / 86400000) }))
    .filter(v => v.daysUntil <= 90)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Community Risk Reduction</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Home safety visits, community programs, and prevention tracking</p>
        </div>
        <button
          onClick={() => activeTab === 'visits' ? setVisitForm('new') : setProgForm('new')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow transition-colors">
          <Plus size={16} />
          {activeTab === 'visits' ? 'Log Visit' : 'Log Program'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Home}        label="Home Visits"         value={visits.length}             color="blue"   />
        <StatCard icon={ShieldCheck} label="Detectors Installed" value={stats.detectorsInstalled}  color="green"  sub="this year" />
        <StatCard icon={AlertTriangle} label="High/Critical Risk" value={stats.highRisk}           color="red"    />
        <StatCard icon={Users}       label="People Reached"      value={stats.totalReached.toLocaleString()} color="purple" />
      </div>

      {/* Upcoming Follow-Ups Banner */}
      {upcoming.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} className="text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Upcoming Follow-Up Visits ({upcoming.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.map(v => (
              <span key={v.id}
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${v.daysUntil <= 7 ? 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'}`}>
                {v.daysUntil <= 0 ? '⚠ Overdue' : `${v.daysUntil}d`} — {v.address}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 w-fit">
        {[
          { id: 'visits',   label: 'Home Safety Visits', icon: Home },
          { id: 'programs', label: 'Community Programs', icon: BookOpen },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === t.id ? 'bg-white dark:bg-gray-900 text-blue-700 dark:text-blue-300 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Visits Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'visits' && (
        <div className="space-y-3">
          {/* Risk filter */}
          <div className="flex gap-2 flex-wrap">
            {['All', ...RISK_LEVELS].map(lvl => {
              const sel = riskFilter === lvl;
              const c = lvl === 'All' ? null : RISK_COLORS[lvl];
              return (
                <button key={lvl} onClick={() => setRiskFilter(lvl)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    sel
                      ? (c ? `${c.bg} ${c.text} border-transparent shadow` : 'bg-gray-800 text-white border-transparent shadow')
                      : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}>
                  {lvl} {lvl !== 'All' && `(${visits.filter(v => v.riskLevel === lvl).length})`}
                </button>
              );
            })}
          </div>

          {filteredVisits.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Home size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No visits match this filter.</p>
            </div>
          )}

          {filteredVisits.map(v => {
            const open = expandedId === v.id;
            return (
              <div key={v.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(open ? null : v.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                  <div className="flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${RISK_COLORS[v.riskLevel].bg}`}>
                      <Home size={16} className={RISK_COLORS[v.riskLevel].text} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{v.address}</span>
                      <RiskBadge level={v.riskLevel} />
                      {v.followUpDate && new Date(v.followUpDate) <= new Date(Date.now() + 30*86400000) && (
                        <span className="text-xs bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">Follow-up soon</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {v.resident} · {v.date} · {v.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex gap-1">
                      {v.outcomes.slice(0, 2).map(o => (
                        <span key={o} className="text-xs bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">{o}</span>
                      ))}
                      {v.outcomes.length > 2 && (
                        <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">+{v.outcomes.length - 2}</span>
                      )}
                    </div>
                    {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </button>

                {/* Detail */}
                {open && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 bg-gray-50 dark:bg-gray-950 space-y-4">
                    {/* Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Visit Type',       value: v.type },
                        { label: 'Resident',         value: v.resident },
                        { label: 'Phone',            value: v.phone || '—' },
                        { label: 'Follow-Up Date',   value: v.followUpDate || 'None' },
                        { label: 'Smoke Detector',   value: v.smokeDet },
                        { label: 'CO Detector',      value: v.coDet },
                        { label: 'Crew',             value: v.crew.join(', ') || '—' },
                        { label: 'Outcomes',         value: v.outcomes.join(', ') || '—' },
                      ].map(cell => (
                        <div key={cell.label} className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                          <p className="text-xs text-gray-400 font-medium">{cell.label}</p>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5">{cell.value}</p>
                        </div>
                      ))}
                    </div>
                    {/* Hazards */}
                    {v.hazards && (
                      <div className="flex gap-3 bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-900 rounded-xl px-4 py-3">
                        <AlertTriangle size={14} className="text-orange-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-0.5">Hazards Found</p>
                          <p className="text-xs text-orange-700 dark:text-orange-300">{v.hazards}</p>
                        </div>
                      </div>
                    )}
                    {/* Notes */}
                    {v.notes && (
                      <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-400 font-medium mb-1">Notes</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{v.notes}</p>
                      </div>
                    )}
                    {/* Actions */}
                    <div className="flex gap-2">
                      <button onClick={() => setVisitForm(v)}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Programs Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'programs' && (
        <div className="space-y-3">
          {programs.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <BookOpen size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No programs logged yet.</p>
            </div>
          )}
          {programs.map(p => {
            const open = expandedId === p.id;
            return (
              <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(open ? null : p.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                  <div className="flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${p.jfs ? 'bg-orange-100 dark:bg-orange-950/50' : 'bg-blue-50 dark:bg-blue-950/50'}`}>
                      {p.jfs ? <Flame size={16} className="text-orange-600 dark:text-orange-400" /> : <Users size={16} className="text-blue-600 dark:text-blue-400" />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{p.title}</span>
                      {p.jfs && <span className="text-xs bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full font-semibold">JFS</span>}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {p.date} · {p.type} · {p.attendees} attendees
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">
                      {p.crew.length} crew
                    </span>
                    {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </button>

                {/* Detail */}
                {open && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 bg-gray-50 dark:bg-gray-950 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Type',      value: p.type },
                        { label: 'Location',  value: p.location || '—' },
                        { label: 'Audience',  value: p.audience || '—' },
                        { label: 'Attendees', value: p.attendees },
                        { label: 'Crew',      value: p.crew.join(', ') || '—' },
                        { label: 'Materials', value: p.materials || '—' },
                      ].map(cell => (
                        <div key={cell.label} className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                          <p className="text-xs text-gray-400 font-medium">{cell.label}</p>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5">{cell.value}</p>
                        </div>
                      ))}
                    </div>
                    {/* Topics */}
                    {p.topics.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 font-semibold mb-2">Topics Covered</p>
                        <div className="flex flex-wrap gap-2">
                          {p.topics.map(t => <Tag key={t} label={t} />)}
                        </div>
                      </div>
                    )}
                    {/* Outcome */}
                    {p.outcome && (
                      <div className="flex gap-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3">
                        <CheckCircle2 size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-green-800 dark:text-green-300 mb-0.5">Outcome</p>
                          <p className="text-xs text-green-700 dark:text-green-300">{p.outcome}</p>
                        </div>
                      </div>
                    )}
                    {/* JFS detail */}
                    {p.jfs && (
                      <div className="flex gap-3 bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-900 rounded-xl px-4 py-3">
                        <Flame size={14} className="text-orange-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-0.5">JFS Intervention</p>
                          <p className="text-xs text-orange-700 dark:text-orange-300">
                            Outcome: {p.jfsOutcome || '—'}
                            {p.jfsFollowUp ? ` · Follow-up: ${p.jfsFollowUp}` : ''}
                          </p>
                        </div>
                      </div>
                    )}
                    {/* Notes */}
                    {p.notes && (
                      <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-400 font-medium mb-1">Notes</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{p.notes}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => setProgForm(p)}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {visitForm && (
        <VisitForm
          initial={visitForm === 'new' ? null : visitForm}
          onSave={saveVisit}
          onCancel={() => setVisitForm(null)}
        />
      )}
      {progForm && (
        <ProgramForm
          initial={progForm === 'new' ? null : progForm}
          onSave={saveProgram}
          onCancel={() => setProgForm(null)}
        />
      )}
    </div>
  );
}
