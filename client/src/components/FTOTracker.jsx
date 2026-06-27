/**
 * FTOTracker.jsx — Field Training Officer Probationary Firefighter Tracker
 *
 * Tracks probationary firefighter progress through NFPA 1001 competencies:
 *  - Skill checklist with pass/fail/not-evaluated status
 *  - Daily observation notes from the FTO
 *  - Milestone tracking at 30/60/90/180 days
 *  - AI suggestions for what to evaluate next
 *  - Auto-generated progress reports
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  GraduationCap, User, CheckCircle, XCircle, Clock, Plus, ChevronRight,
  ChevronDown, ChevronUp, FileText, AlertTriangle, Star, Loader2, X,
  Calendar, Award, ClipboardCheck, Zap, Search,
} from 'lucide-react';
import { api } from '../utils/api';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950';

// ─── NFPA 1001 Skill Categories ──────────────────────────────────────────────

const SKILL_CATEGORIES = [
  {
    id: 'fire-behavior', name: 'Fire Behavior & Combustion',
    skills: [
      { id: 'fb-1', name: 'Describe fire behavior principles', level: 'FFI' },
      { id: 'fb-2', name: 'Identify stages of fire development', level: 'FFI' },
      { id: 'fb-3', name: 'Recognize flashover indicators', level: 'FFI' },
      { id: 'fb-4', name: 'Describe methods of heat transfer', level: 'FFI' },
    ],
  },
  {
    id: 'ppe', name: 'Personal Protective Equipment',
    skills: [
      { id: 'ppe-1', name: 'Don and doff full PPE within time standard', level: 'FFI' },
      { id: 'ppe-2', name: 'Perform SCBA emergency procedures', level: 'FFI' },
      { id: 'ppe-3', name: 'Demonstrate PASS device operation', level: 'FFI' },
      { id: 'ppe-4', name: 'Inspect and maintain PPE', level: 'FFI' },
    ],
  },
  {
    id: 'hose-ops', name: 'Hose Operations',
    skills: [
      { id: 'ho-1', name: 'Advance 1.75" attack line', level: 'FFI' },
      { id: 'ho-2', name: 'Advance 2.5" supply line', level: 'FFI' },
      { id: 'ho-3', name: 'Operate combination nozzle', level: 'FFI' },
      { id: 'ho-4', name: 'Connect to hydrant and supply engine', level: 'FFI' },
      { id: 'ho-5', name: 'Extend hose line (add sections)', level: 'FFI' },
      { id: 'ho-6', name: 'Replace burst hose section', level: 'FFII' },
    ],
  },
  {
    id: 'ladder-ops', name: 'Ladder Operations',
    skills: [
      { id: 'lo-1', name: 'Carry and raise ground ladder (24ft)', level: 'FFI' },
      { id: 'lo-2', name: 'Properly place ladder for rescue/ventilation', level: 'FFI' },
      { id: 'lo-3', name: 'Climb ladder with tools', level: 'FFI' },
      { id: 'lo-4', name: 'Inspect and maintain ground ladders', level: 'FFI' },
    ],
  },
  {
    id: 'search-rescue', name: 'Search & Rescue',
    skills: [
      { id: 'sr-1', name: 'Conduct primary search (team of 2)', level: 'FFI' },
      { id: 'sr-2', name: 'Perform victim carry/drag techniques', level: 'FFI' },
      { id: 'sr-3', name: 'Navigate zero-visibility environment', level: 'FFI' },
      { id: 'sr-4', name: 'Use thermal imaging camera', level: 'FFII' },
    ],
  },
  {
    id: 'ventilation', name: 'Ventilation',
    skills: [
      { id: 'vt-1', name: 'Perform horizontal ventilation', level: 'FFI' },
      { id: 'vt-2', name: 'Perform vertical ventilation (roof)', level: 'FFII' },
      { id: 'vt-3', name: 'Operate positive pressure ventilation fan', level: 'FFI' },
      { id: 'vt-4', name: 'Assess ventilation conditions', level: 'FFII' },
    ],
  },
  {
    id: 'forcible-entry', name: 'Forcible Entry',
    skills: [
      { id: 'fe-1', name: 'Force inward-opening door', level: 'FFI' },
      { id: 'fe-2', name: 'Force outward-opening door', level: 'FFI' },
      { id: 'fe-3', name: 'Through-the-lock entry', level: 'FFI' },
      { id: 'fe-4', name: 'Breach wall (wood frame/drywall)', level: 'FFII' },
    ],
  },
  {
    id: 'pump-ops', name: 'Pump Operations',
    skills: [
      { id: 'po-1', name: 'Engage pump from hydrant supply', level: 'FFII' },
      { id: 'po-2', name: 'Calculate pump discharge pressure', level: 'FFII' },
      { id: 'po-3', name: 'Operate pump panel controls', level: 'FFII' },
      { id: 'po-4', name: 'Supply multiple handlines simultaneously', level: 'FFII' },
    ],
  },
  {
    id: 'ems', name: 'Emergency Medical',
    skills: [
      { id: 'ems-1', name: 'Patient assessment (primary survey)', level: 'FFI' },
      { id: 'ems-2', name: 'CPR and AED operation', level: 'FFI' },
      { id: 'ems-3', name: 'Bleeding control and shock management', level: 'FFI' },
      { id: 'ems-4', name: 'Spinal immobilization', level: 'FFI' },
    ],
  },
  {
    id: 'radio-comms', name: 'Radio Communications',
    skills: [
      { id: 'rc-1', name: 'Operate portable radio properly', level: 'FFI' },
      { id: 'rc-2', name: 'Transmit clear, concise radio messages', level: 'FFI' },
      { id: 'rc-3', name: 'Demonstrate Mayday procedures', level: 'FFI' },
      { id: 'rc-4', name: 'Use LUNAR reporting format', level: 'FFI' },
    ],
  },
];

const ALL_SKILLS = SKILL_CATEGORIES.flatMap(c => c.skills.map(s => ({ ...s, category: c.name })));

// ─── Milestone Dates ─────────────────────────────────────────────────────────

function getMilestones(startDate) {
  const start = new Date(startDate);
  return [
    { days: 30, label: '30-Day Review', date: new Date(start.getTime() + 30 * 86400000).toISOString().split('T')[0] },
    { days: 60, label: '60-Day Review', date: new Date(start.getTime() + 60 * 86400000).toISOString().split('T')[0] },
    { days: 90, label: '90-Day Review', date: new Date(start.getTime() + 90 * 86400000).toISOString().split('T')[0] },
    { days: 180, label: '6-Month Review', date: new Date(start.getTime() + 180 * 86400000).toISOString().split('T')[0] },
    { days: 365, label: '1-Year Review', date: new Date(start.getTime() + 365 * 86400000).toISOString().split('T')[0] },
  ];
}

// ─── AI Suggestions ──────────────────────────────────────────────────────────

function getAISuggestions(evaluations) {
  const evaluated = new Set(Object.keys(evaluations));
  const notEvaluated = ALL_SKILLS.filter(s => !evaluated.has(s.id));
  const ffi = notEvaluated.filter(s => s.level === 'FFI');
  const suggestions = [];

  if (ffi.length > 0) {
    const random = ffi[Math.floor(Math.random() * ffi.length)];
    suggestions.push({ skill: random, text: `${random.name} has not been evaluated yet. Good opportunity today.` });
  }

  const failed = Object.entries(evaluations).filter(([, v]) => v.result === 'Needs Work');
  if (failed.length > 0) {
    const skill = ALL_SKILLS.find(s => s.id === failed[0][0]);
    if (skill) suggestions.push({ skill, text: `${skill.name} was marked "Needs Work" — consider re-evaluation.` });
  }

  return suggestions;
}

// ─── Observation Note Form ───────────────────────────────────────────────────

function ObservationForm({ onSave, onClose }) {
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('General');

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-md p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-gray-700 dark:text-gray-300">LOG OBSERVATION</span>
        <button onClick={onClose} aria-label="Close observation form" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={14} /></button>
      </div>
      <select className={INPUT} value={category} onChange={e => setCategory(e.target.value)} aria-label="Observation category">
        <option>General</option><option>Strength</option><option>Needs Improvement</option>
        <option>Safety Concern</option><option>Milestone Achievement</option>
      </select>
      <textarea className={INPUT} rows={3} placeholder="What did you observe today?" aria-label="Observation note" value={note} onChange={e => setNote(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300">Cancel</button>
        <button onClick={() => { onSave({ note, category, date: new Date().toISOString() }); onClose(); }}
          disabled={!note.trim()}
          className="flex-1 py-2 bg-red-700 text-white font-bold text-sm rounded-xl disabled:opacity-50">
          Save Note
        </button>
      </div>
    </div>
  );
}

// ─── Skill Evaluation Row ────────────────────────────────────────────────────

function SkillRow({ skill, evaluation, onEvaluate }) {
  const status = evaluation?.result || 'Not Evaluated';
  const colors = {
    'Pass': 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900',
    'Needs Work': 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    'Fail': 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
    'Not Evaluated': 'bg-gray-50 dark:bg-gray-950 text-gray-400 border-gray-100 dark:border-gray-700',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${colors[status]} transition-all`}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{skill.name}</p>
        <p className="text-[10px] text-gray-400">{skill.level} — {skill.category}</p>
      </div>
      <select value={status} onChange={e => onEvaluate(skill.id, e.target.value)} aria-label={`Evaluation result for ${skill.name}`}
        className="text-[10px] font-bold border rounded-lg px-2 py-1 bg-white dark:bg-gray-900 cursor-pointer">
        <option>Not Evaluated</option>
        <option>Pass</option>
        <option>Needs Work</option>
        <option>Fail</option>
      </select>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function FTOTracker({ user }) {
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [evaluations, setEvaluations] = useState({});
  const [observations, setObservations] = useState([]);
  const [showObsForm, setShowObsForm] = useState(false);
  const [expandedCat, setExpandedCat] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/members').then(r => {
      const all = r?.data || r || [];
      setMembers(all.filter(m => m.status === 'Probationary'));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Stats
  const stats = useMemo(() => {
    const total = ALL_SKILLS.length;
    const passed = Object.values(evaluations).filter(e => e.result === 'Pass').length;
    const needsWork = Object.values(evaluations).filter(e => e.result === 'Needs Work').length;
    const notEval = total - Object.keys(evaluations).length;
    return { total, passed, needsWork, notEval, pct: Math.round((passed / total) * 100) };
  }, [evaluations]);

  const suggestions = useMemo(() => getAISuggestions(evaluations), [evaluations]);

  const milestones = useMemo(() => {
    if (!selectedMember?.joined) return [];
    return getMilestones(selectedMember.joined);
  }, [selectedMember]);

  // Load evaluations and observations when a member is selected
  useEffect(() => {
    if (!selectedMember) return;
    api.get(`/api/fto/${selectedMember.id}/evaluations`)
      .then(r => setEvaluations(r.data || {}))
      .catch(() => {});
    api.get(`/api/fto/${selectedMember.id}/observations`)
      .then(r => setObservations(r.data || []))
      .catch(() => {});
  }, [selectedMember]);

  function handleEvaluate(skillId, result) {
    const skill = ALL_SKILLS.find(s => s.id === skillId);
    setEvaluations(prev => ({
      ...prev,
      [skillId]: { result, evaluated_by: user?.name || 'FTO', evaluated_at: new Date().toISOString() },
    }));
    // Persist to backend
    if (selectedMember) {
      api.post(`/api/fto/${selectedMember.id}/evaluations`, {
        skill_id: skillId, skill_name: skill?.name || '', category: skill?.category || '', result,
      }).catch(e => console.error('Failed to save evaluation:', e));
    }
  }

  // ── Member not selected ──
  if (!selectedMember) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/50 flex items-center justify-center">
            <GraduationCap size={22} className="text-purple-700 dark:text-purple-300" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">FTO Tracker</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Field Training Officer — Probationary Firefighter Progress</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : members.length === 0 ? (
          <div className="text-center py-12">
            <GraduationCap size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm font-bold text-gray-500 dark:text-gray-400">No probationary firefighters</p>
            <p className="text-xs text-gray-400 mt-1">Members with "Probationary" status will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map(m => (
              <button key={m.id} onClick={() => setSelectedMember(m)}
                className="w-full flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-purple-200 transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/50 flex items-center justify-center font-black text-sm text-purple-700 dark:text-purple-300">
                  {m.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{m.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{m.rank} — Joined {m.joined}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 dark:text-gray-600" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Member selected — full tracker ──
  const filteredCategories = search
    ? SKILL_CATEGORIES.map(c => ({ ...c, skills: c.skills.filter(s => s.name.toLowerCase().includes(search.toLowerCase())) })).filter(c => c.skills.length > 0)
    : SKILL_CATEGORIES;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => setSelectedMember(null)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 font-bold">Back</button>
        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/50 flex items-center justify-center font-black text-sm text-purple-700 dark:text-purple-300">
          {selectedMember.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
        </div>
        <div>
          <p className="text-sm font-black text-gray-900 dark:text-gray-100">{selectedMember.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Probationary — Joined {selectedMember.joined}</p>
        </div>
      </div>

      {/* Progress stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-green-600 dark:text-green-400">{stats.passed}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Passed</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-amber-600 dark:text-amber-400">{stats.needsWork}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Needs Work</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-gray-400">{stats.notEval}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Not Evaluated</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-blue-600 dark:text-blue-400">{stats.pct}%</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Complete</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all" style={{ width: `${stats.pct}%` }} />
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-2.5">
          <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1 mb-1"><Zap size={10} /> AI Suggestions</p>
          {suggestions.map((s, i) => (
            <p key={i} className="text-xs text-amber-800 dark:text-amber-300">{s.text}</p>
          ))}
        </div>
      )}

      {/* Milestones */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {milestones.map(m => {
          const isPast = new Date(m.date) <= new Date();
          return (
            <div key={m.days} className={`flex-shrink-0 px-3 py-2 rounded-xl border text-center ${isPast ? 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900' : 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700'}`}>
              <p className="text-[10px] font-bold text-gray-600 dark:text-gray-300">{m.label}</p>
              <p className="text-[9px] text-gray-400">{m.date}</p>
              {isPast && <CheckCircle size={10} className="text-green-500 mx-auto mt-0.5" />}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => setShowObsForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl">
          <Plus size={13} /> Log Observation
        </button>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-2 text-xs dark:bg-gray-900 dark:text-gray-100" placeholder="Search skills..." aria-label="Search skills"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {showObsForm && (
        <ObservationForm
          onSave={(obs) => {
            setObservations(prev => [obs, ...prev]);
            if (selectedMember) {
              api.post(`/api/fto/${selectedMember.id}/observations`, {
                category: obs.category, note: obs.note, observed_by: user?.name || 'FTO',
              }).catch(e => console.error('Failed to save observation:', e));
            }
          }}
          onClose={() => setShowObsForm(false)}
        />
      )}

      {/* Observations */}
      {observations.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 space-y-2">
          <p className="text-xs font-black text-gray-700 dark:text-gray-300">Recent Observations</p>
          {observations.slice(0, 5).map((obs, i) => (
            <div key={i} className="flex items-start gap-2 text-xs bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-2">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${obs.category === 'Safety Concern' ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' : obs.category === 'Strength' ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                {obs.category}
              </span>
              <p className="text-gray-700 dark:text-gray-300 flex-1">{obs.note}</p>
              <span className="text-gray-400 text-[10px]">{new Date(obs.date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Skill Categories */}
      <div className="space-y-2">
        {filteredCategories.map(cat => (
          <div key={cat.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <button onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
              aria-expanded={expandedCat === cat.id}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <ClipboardCheck size={14} className="text-purple-600 dark:text-purple-400" />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex-1 text-left">{cat.name}</span>
              <span className="text-[10px] text-gray-400">
                {cat.skills.filter(s => evaluations[s.id]?.result === 'Pass').length}/{cat.skills.length}
              </span>
              {expandedCat === cat.id ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
            </button>
            {expandedCat === cat.id && (
              <div className="px-3 pb-3 space-y-1">
                {cat.skills.map(skill => (
                  <SkillRow key={skill.id} skill={{ ...skill, category: cat.name }}
                    evaluation={evaluations[skill.id]}
                    onEvaluate={handleEvaluate} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
