import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  UserPlus, Search, ChevronDown, ChevronUp, Plus, Pencil,
  CheckCircle2, Circle, Phone, Mail, MapPin, Calendar,
  User, ArrowRight, Flag, Users,
} from 'lucide-react';
import {
  PIPELINE_STAGES, STAGE_COLORS, CHECKLIST_ITEMS,
} from '../data/recruitment';
import { api } from '../utils/api';
import RecruitForm from './RecruitForm';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

// ─── helpers ─────────────────────────────────────────────────────────────────

function StageChip({ stage, small = false }) {
  const c = STAGE_COLORS[stage] ?? { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-300', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold rounded-full ${small ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'} ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`} />
      {stage}
    </span>
  );
}

function ChecklistProgress({ checklist }) {
  const total = CHECKLIST_ITEMS.length;
  const done  = CHECKLIST_ITEMS.filter((i) => checklist[i.id]).length;
  const pct   = Math.round((done / total) * 100);
  const color = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-gray-300';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 w-14 shrink-0">{done}/{total} done</span>
    </div>
  );
}

// ─── expanded detail ──────────────────────────────────────────────────────────

function ProspectDetail({ prospect, onEdit }) {
  const Field = ({ icon: Icon, label, value, href }) => (
    value ? (
      <div className="flex items-start gap-2">
        <Icon size={13} className="text-gray-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
          {href
            ? <a href={href} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">{value}</a>
            : <p className="text-xs text-gray-800 dark:text-gray-100 font-medium">{value}</p>}
        </div>
      </div>
    ) : null
  );

  return (
    <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700 px-5 py-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        {/* Left: contact + dates */}
        <div className="space-y-2 min-w-0">
          <Field icon={Phone}    label="Phone"   value={prospect.phone}    href={`tel:${prospect.phone}`} />
          <Field icon={Mail}     label="Email"   value={prospect.email}    href={`mailto:${prospect.email}`} />
          <Field icon={MapPin}   label="Address" value={prospect.address} />
          <Field icon={Calendar} label="DOB"     value={prospect.dob} />
        </div>
        {/* Middle: key dates */}
        <div className="space-y-2 min-w-0">
          <Field icon={Calendar} label="Date Added"      value={prospect.dateAdded} />
          <Field icon={Calendar} label="Interview Date"  value={prospect.interviewDate || '—'} />
          <Field icon={Calendar} label="Physical Date"   value={prospect.physicalDate || '—'} />
          <Field icon={Calendar} label="Orientation Date" value={prospect.orientationDate || '—'} />
        </div>
        {/* Right: checklist */}
        <div className="min-w-[220px] shrink-0">
          <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Onboarding Checklist</p>
          <div className="space-y-1">
            {CHECKLIST_ITEMS.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                {prospect.checklist[item.id]
                  ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                  : <Circle size={13} className="text-gray-300 dark:text-gray-600 shrink-0" />}
                <span className={`text-xs ${prospect.checklist[item.id] ? 'text-green-700 dark:text-green-300 line-through' : 'text-gray-600 dark:text-gray-300'}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stage history */}
      <div>
        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Stage History</p>
        <div className="flex flex-wrap gap-2 items-center">
          {prospect.stageHistory.map((h, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="text-center">
                <StageChip stage={h.stage} small />
                <p className="text-[9px] text-gray-400 mt-0.5">{h.date}</p>
              </div>
              {i < prospect.stageHistory.length - 1 && (
                <ArrowRight size={12} className="text-gray-300 dark:text-gray-600 shrink-0 mb-2" />
              )}
            </div>
          ))}
        </div>
        {prospect.stageHistory.at(-1)?.notes && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
            Latest note: {prospect.stageHistory.at(-1).notes}
          </p>
        )}
      </div>

      {/* Notes */}
      {prospect.notes && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-100 rounded-lg px-3 py-2">
          <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-0.5">Notes</p>
          <p className="text-xs text-amber-900 dark:text-amber-200">{prospect.notes}</p>
        </div>
      )}

      {/* Linked Meetings */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
        <LinkedMeetings module="recruitment" recordId={prospect.id} recordLabel={prospect.name || 'Prospect'} />
        <Attachments module="recruitment" recordId={prospect.id} recordLabel={prospect.name || 'Prospect'} />
      </div>

      <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={() => onEdit(prospect)}
          className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium transition-colors"
        >
          <Pencil size={12} /> Edit Record
        </button>
      </div>
    </div>
  );
}

// ─── pipeline summary bar ─────────────────────────────────────────────────────

const ACTIVE_STAGES = PIPELINE_STAGES.filter((s) => s !== 'Withdrawn' && s !== 'Declined');

function PipelineBar({ prospects }) {
  const counts = {};
  PIPELINE_STAGES.forEach((s) => { counts[s] = 0; });
  prospects.forEach((p) => { counts[p.stage] = (counts[p.stage] || 0) + 1; });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Recruitment Pipeline</p>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {ACTIVE_STAGES.map((stage, i) => {
          const c = STAGE_COLORS[stage];
          const count = counts[stage] || 0;
          return (
            <div key={stage} className="flex-1 min-w-[80px] text-center">
              <div className={`rounded-lg py-2 px-1 ${count > 0 ? c.bg : 'bg-gray-50 dark:bg-gray-950'}`}>
                <p className={`text-xl font-bold ${count > 0 ? c.text : 'text-gray-300 dark:text-gray-600'}`}>{count}</p>
                <p className={`text-[9px] font-semibold leading-tight mt-0.5 ${count > 0 ? c.text : 'text-gray-400'}`}>
                  {stage}
                </p>
              </div>
              {i < ACTIVE_STAGES.length - 1 && (
                <div className="flex justify-end pr-0.5 mt-1">
                  <ArrowRight size={10} className="text-gray-300 dark:text-gray-600" />
                </div>
              )}
            </div>
          );
        })}
        {/* Withdrawn / Declined summary */}
        <div className="flex-1 min-w-[70px] text-center border-l border-gray-100 dark:border-gray-700 pl-1">
          <div className="rounded-lg py-2 px-1 bg-red-50 dark:bg-red-950/50">
            <p className="text-xl font-bold text-red-300">{(counts['Withdrawn'] || 0) + (counts['Declined'] || 0)}</p>
            <p className="text-[9px] font-semibold leading-tight mt-0.5 text-red-400">Closed</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

const STAGE_FILTER_OPTIONS = ['All Active', ...PIPELINE_STAGES];

export default function RecruitmentTracker({ user }) {
  const [prospects, setProspects]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [stageFilter, setStageFilter] = useState('All Active');
  const [expandedId, setExpandedId]   = useState(null);
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState(null);

  const fetchProspects = useCallback(async () => {
    try {
      const res = await api.get('/api/recruitment');
      setProspects(res.data);
    } catch (e) {
      console.error('Failed to fetch prospects', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  const filtered = useMemo(() => {
    return prospects.filter((p) => {
      const matchStage = stageFilter === 'All Active'
        ? p.stage !== 'Withdrawn' && p.stage !== 'Declined'
        : p.stage === stageFilter;
      const q = search.toLowerCase();
      const matchSearch = !q || [p.name, p.phone, p.email, p.stage, p.recruiter, p.source]
        .some((v) => v?.toLowerCase().includes(q));
      return matchStage && matchSearch;
    });
  }, [prospects, search, stageFilter]);

  async function handleSave(data) {
    try {
      if (data.id) {
        const res = await api.patch(`/api/recruitment/${data.id}`, data);
        setProspects((prev) => prev.map((p) => p.id === data.id ? res.data : p));
      } else {
        const res = await api.post('/api/recruitment', data);
        setProspects((prev) => [...prev, res.data]);
        // Reset filter so the new prospect is always visible
        setStageFilter('All Active');
      }
    } catch (e) { console.error('Failed to save prospect', e); }
    setShowForm(false);
    setEditing(null);
  }

  function handleEdit(prospect) {
    setEditing(prospect);
    setShowForm(true);
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading recruitment data…</div>;

  const activeCount = prospects.filter((p) => p.stage !== 'Withdrawn' && p.stage !== 'Declined').length;

  return (
    <div className="space-y-6">

      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Recruitment &amp; Onboarding</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Track prospects through the full pipeline from first contact to probationary member.
            {activeCount > 0 && <span className="ml-2 font-medium text-gray-700 dark:text-gray-300">{activeCount} active prospect{activeCount !== 1 ? 's' : ''}.</span>}
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-800 transition-colors shrink-0"
        >
          <Plus size={15} /> Add Prospect
        </button>
      </div>

      {/* pipeline bar */}
      <PipelineBar prospects={prospects} />

      {/* filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email, recruiter…"
              aria-label="Search prospects"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STAGE_FILTER_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStageFilter(s)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  stageFilter === s
                    ? 'bg-red-700 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* list */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users size={32} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No prospects match your filter.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-left">
                <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Prospect</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Stage</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Source</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Recruiter</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Progress</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Added</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((p) => {
                const isOpen = expandedId === p.id;
                return (
                  <React.Fragment key={p.id}>
                    <tr
                      onClick={() => setExpandedId(isOpen ? null : p.id)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{p.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{p.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StageChip stage={p.stage} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden md:table-cell">{p.source}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5">
                          <User size={12} className="text-gray-400" />
                          {p.recruiter}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell w-36">
                        <ChecklistProgress checklist={p.checklist} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{p.dateAdded}</td>
                      <td className="px-4 py-3 text-gray-400">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpandedId(isOpen ? null : p.id); }}
                          aria-label={`Expand ${p.name} prospect details`}
                          aria-expanded={isOpen}
                          className="p-0.5"
                        >
                          {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <ProspectDetail prospect={p} onEdit={handleEdit} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* form modal */}
      {showForm && (
        <RecruitForm
          prospect={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

    </div>
  );
}
