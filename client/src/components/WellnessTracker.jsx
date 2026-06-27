import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Heart, ShieldAlert, ArrowLeft, AlertTriangle,
  CheckCircle2, Clock, Plus, Edit2, Trash2,
  ChevronDown, ChevronUp, User, Syringe, Wind, Activity,
} from 'lucide-react';
import {
  PHYSICAL_STATUS, getStatus,
  EXPOSURE_TYPES, VACCINATION_TYPES,
} from '../data/wellness';
import { api } from '../utils/api';
import WellnessForm from './WellnessForm';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date('2026-03-06');
  const due   = new Date(dateStr);
  return Math.round((due - today) / 86400000);
}

function StatusPill({ status }) {
  const s = PHYSICAL_STATUS[status] ?? PHYSICAL_STATUS.notOnFile;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${s.bg} ${s.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function SectionHeader({ icon: Icon, title }) {
  return (
    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-3">
      <Icon size={14} className="text-red-600 dark:text-red-400" /> {title}
    </h3>
  );
}

// ─── Member Detail View ───────────────────────────────────────────────────────

function MemberDetail({ record, member, onBack, onAddExposure, onEditExposure, onDeleteExposure }) {
  const physStatus  = getStatus(record.physicalDue);
  const scbaStatus  = getStatus(record.scbaFitDue);
  const [openSect, setOpenSect] = useState({ physicals: true, scba: true, vaccinations: true, exposures: true });

  function toggle(key) { setOpenSect((p) => ({ ...p, [key]: !p[key] })); }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-red-700 transition-colors font-medium">
        <ArrowLeft size={16} /> Back to Wellness Dashboard
      </button>

      {/* Member header */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-black text-red-700 dark:text-red-300">
              {record.memberName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
            </span>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{record.memberName}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{member?.rank} · {member?.role}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <StatusPill status={physStatus} />
              {record.bloodType && (
                <span className="text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 px-2 py-0.5 rounded-full">
                  Blood Type: {record.bloodType}
                </span>
              )}
            </div>
          </div>
        </div>
        {record.medicalRestrictions && (
          <div className="mt-4 flex items-start gap-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
            <AlertTriangle size={14} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-800 dark:text-red-300 font-semibold">{record.medicalRestrictions}</p>
          </div>
        )}
      </div>

      {/* Status summary bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-3">
        <StatusCard label="NFPA 1582 Physical" status={physStatus} dueDate={record.physicalDue} />
        <StatusCard label="SCBA Fit Test" status={scbaStatus} dueDate={record.scbaFitDue} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 text-center">
          <p className="text-2xl font-black text-gray-800 dark:text-gray-100">{record.exposures.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Exposure Records</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 text-center">
          <p className="text-2xl font-black text-gray-800 dark:text-gray-100">{record.vaccinations.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Vaccination Types</p>
        </div>
      </div>

      {/* Physical history */}
      <CollapsibleCard
        title="NFPA 1582 Physical Examinations" icon={Activity}
        open={openSect.physicals} onToggle={() => toggle('physicals')}
        badge={physStatus === 'overdue' || physStatus === 'dueSoon' ? (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            {physStatus === 'overdue' ? `Overdue ${fmt(record.physicalDue)}` : `Due ${fmt(record.physicalDue)}`}
          </span>
        ) : null}
      >
        {record.physicals.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No physicals on file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="py-1.5 pr-4 text-xs font-semibold text-gray-500 dark:text-gray-400">Date</th>
                  <th className="py-1.5 pr-4 text-xs font-semibold text-gray-500 dark:text-gray-400">Provider</th>
                  <th className="py-1.5 pr-4 text-xs font-semibold text-gray-500 dark:text-gray-400">Result</th>
                  <th className="py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...record.physicals].reverse().map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-4 text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmt(p.date)}</td>
                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">{p.provider}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        p.result.includes('Full Duty') ? 'bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300' : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                      }`}>{p.result}</span>
                    </td>
                    <td className="py-2 text-xs text-gray-500 dark:text-gray-400">{p.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>

      {/* SCBA Fit Tests */}
      <CollapsibleCard
        title="SCBA Fit Tests" icon={Wind}
        open={openSect.scba} onToggle={() => toggle('scba')}
      >
        {record.scbaFitTests.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No SCBA fit tests on file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="py-1.5 pr-4 text-xs font-semibold text-gray-500 dark:text-gray-400">Date</th>
                  <th className="py-1.5 pr-4 text-xs font-semibold text-gray-500 dark:text-gray-400">Mask / Unit</th>
                  <th className="py-1.5 pr-4 text-xs font-semibold text-gray-500 dark:text-gray-400">Result</th>
                  <th className="py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...record.scbaFitTests].reverse().map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 pr-4 text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmt(t.date)}</td>
                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">{t.mask}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        t.result === 'Pass' ? 'bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                      }`}>{t.result}</span>
                    </td>
                    <td className="py-2 text-xs text-gray-500 dark:text-gray-400">{t.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>

      {/* Vaccinations */}
      <CollapsibleCard
        title="Vaccinations & Immunizations" icon={Syringe}
        open={openSect.vaccinations} onToggle={() => toggle('vaccinations')}
      >
        {record.vaccinations.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No vaccination records on file.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {record.vaccinations.map((v) => (
              <div key={v.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-950 rounded-xl px-3 py-2">
                <Syringe size={13} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{v.type}</p>
                  <p className="text-[10px] text-gray-400">{v.dates.join(', ')}</p>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  v.status === 'Complete' || v.status === 'Current' ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' :
                  v.status === 'In Progress' ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' : 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                }`}>{v.status}</span>
              </div>
            ))}
          </div>
        )}
      </CollapsibleCard>

      {/* Exposures */}
      <CollapsibleCard
        title="Exposure Log" icon={ShieldAlert}
        open={openSect.exposures} onToggle={() => toggle('exposures')}
        action={
          <button onClick={onAddExposure}
            className="flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-300 hover:text-red-800 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors">
            <Plus size={12} /> Log Exposure
          </button>
        }
      >
        {record.exposures.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No exposures on file.</p>
        ) : (
          <div className="space-y-2">
            {[...record.exposures].reverse().map((exp) => (
              <div key={exp.id} className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{fmt(exp.date)}</span>
                      {exp.incidentNumber && (
                        <span className="text-xs font-mono text-gray-400">#{exp.incidentNumber}</span>
                      )}
                      <span className="text-xs font-semibold bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">
                        {exp.type}
                      </span>
                      {exp.deconPerformed && (
                        <span className="text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                          Decon ✓
                        </span>
                      )}
                      {exp.followUp && (
                        <span className="text-xs font-semibold bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">
                          Follow-up Req.
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300">{exp.description}</p>
                    {exp.notes && <p className="text-xs text-gray-400 italic mt-0.5">{exp.notes}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => onEditExposure(exp)}
                      aria-label="Edit exposure"
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors">
                      <Edit2 size={12} />
                    </button>
                    <button onClick={() => onDeleteExposure(exp.id)}
                      aria-label="Delete exposure"
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleCard>

      {/* Linked Meetings */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <LinkedMeetings module="wellness" recordId={member.id} recordLabel={member.name || 'Wellness'} />
        <Attachments module="wellness" recordId={member.id} recordLabel={member.name || 'Wellness'} />
      </div>
    </div>
  );
}

function StatusCard({ label, status, dueDate }) {
  const s   = PHYSICAL_STATUS[status] ?? PHYSICAL_STATUS.notOnFile;
  const days = daysUntil(dueDate);
  return (
    <div className={`rounded-xl border p-3 text-center ${s.bg}`}>
      <p className={`text-sm font-bold ${s.color}`}>{s.label}</p>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-medium">{label}</p>
      {dueDate && (
        <p className={`text-[10px] mt-1 font-semibold ${s.color}`}>
          {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `Due in ${days}d`}
        </p>
      )}
    </div>
  );
}

function CollapsibleCard({ title, icon: Icon, open, onToggle, badge, action, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-b border-gray-100 dark:border-gray-700"
      >
        <Icon size={15} className="text-red-600 dark:text-red-400 flex-shrink-0" />
        <span className="flex-1 text-sm font-bold text-gray-800 dark:text-gray-100">{title}</span>
        {badge}
        {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && <div className="px-5 py-4">{children}</div>}
    </div>
  );
}

// ─── Member Card (grid) ───────────────────────────────────────────────────────

function MemberCard({ record, member, onClick }) {
  const physStatus = getStatus(record.physicalDue);
  const scbaStatus = getStatus(record.scbaFitDue);
  const hasAlert   = physStatus === 'overdue' || physStatus === 'notOnFile' || scbaStatus === 'overdue' || scbaStatus === 'notOnFile';
  const hasWarn    = !hasAlert && (physStatus === 'dueSoon' || scbaStatus === 'dueSoon');
  const ytdExp     = record.exposures.filter((e) => e.date?.startsWith('2026')).length;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white dark:bg-gray-900 rounded-2xl border shadow-sm hover:shadow-md transition-all p-4 group ${
        hasAlert ? 'border-red-200 dark:border-red-900 hover:border-red-400' :
        hasWarn  ? 'border-amber-200 dark:border-amber-900 hover:border-amber-400' :
                   'border-gray-100 dark:border-gray-700 hover:border-red-200'
      }`}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-black text-red-700 dark:text-red-300">
            {record.memberName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 group-hover:text-red-700 transition-colors truncate">
            {record.memberName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{member?.rank}</p>
        </div>
        {(hasAlert || hasWarn) && (
          <AlertTriangle size={15} className={hasAlert ? 'text-red-500' : 'text-amber-500'} />
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">Physical</span>
          <StatusPill status={physStatus} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">SCBA Fit</span>
          <StatusPill status={scbaStatus} />
        </div>
        {ytdExp > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">YTD Exposures</span>
            <span className="text-xs font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/50 px-2 py-0.5 rounded-full">{ytdExp}</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WellnessTracker() {
  const [records,    setRecords]   = useState([]);
  const [members,    setMembers]   = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [view,       setView]      = useState('grid');   // grid | detail
  const [selected,   setSelected]  = useState(null);
  const [filter,     setFilter]    = useState('All');    // All | Alerts | Due Soon
  const [showForm,   setShowForm]  = useState(false);
  const [editingExp, setEditingExp] = useState(null);

  const fetchRecords = useCallback(async () => {
    try {
      const [resWellness, resMembers] = await Promise.all([
        api.get('/api/wellness'),
        api.get('/api/members'),
      ]);
      const wellness = Array.isArray(resWellness?.data) ? resWellness.data : Array.isArray(resWellness) ? resWellness : [];
      const members = Array.isArray(resMembers?.data) ? resMembers.data : Array.isArray(resMembers) ? resMembers : [];
      setRecords(wellness);
      setMembers(members);
    } catch (e) {
      console.error('Failed to fetch wellness records', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active    = records.filter((r) => {
      const m = members.find((m) => m.id === r.memberId);
      return m?.status === 'Active' || m?.status === 'Probationary';
    });
    const physOverdue  = records.filter((r) => getStatus(r.physicalDue) === 'overdue').length;
    const physDueSoon  = records.filter((r) => getStatus(r.physicalDue) === 'dueSoon').length;
    const physNotOnFile = records.filter((r) => getStatus(r.physicalDue) === 'notOnFile').length;
    const scbaOverdue  = records.filter((r) => getStatus(r.scbaFitDue) === 'overdue').length;
    const ytdExposures = records.reduce((s, r) => s + r.exposures.filter((e) => e.date?.startsWith('2026')).length, 0);
    return { total: records.length, active: active.length, physOverdue, physDueSoon, physNotOnFile, scbaOverdue, ytdExposures };
  }, [records, members]);

  // ── Filtered records ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return records.filter((r) => {
      const ps = getStatus(r.physicalDue);
      const ss = getStatus(r.scbaFitDue);
      if (filter === 'Alerts')   return ps === 'overdue' || ps === 'notOnFile' || ss === 'overdue' || ss === 'notOnFile';
      if (filter === 'Due Soon') return ps === 'dueSoon' || ss === 'dueSoon';
      return true;
    });
  }, [records, filter]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function openDetail(record) { setSelected(record); setView('detail'); }

  async function handleSaveExposure(data) {
    try {
      const currentRecord = records.find((r) => r.memberId === selected.memberId);
      const exps = data.id
        ? currentRecord.exposures.map((e) => (e.id === data.id ? data : e))
        : [...currentRecord.exposures, { ...data, id: Date.now() }];
      const res = await api.patch(`/api/wellness/${selected.memberId}`, { ...currentRecord, exposures: exps });
      setRecords((prev) => prev.map((r) => r.memberId === selected.memberId ? res.data : r));
      setSelected(res.data);
    } catch (e) { console.error('Failed to save exposure', e); }
    setShowForm(false);
    setEditingExp(null);
  }

  async function handleDeleteExposure(expId) {
    if (!confirm('Delete this exposure record?')) return;
    try {
      const currentRecord = records.find((r) => r.memberId === selected.memberId);
      const exps = currentRecord.exposures.filter((e) => e.id !== expId);
      const res = await api.patch(`/api/wellness/${selected.memberId}`, { ...currentRecord, exposures: exps });
      setRecords((prev) => prev.map((r) => r.memberId === selected.memberId ? res.data : r));
      setSelected(res.data);
    } catch (e) { console.error('Failed to delete exposure', e); }
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  if (view === 'detail' && selected) {
    const member = members.find((m) => m.id === selected.memberId);
    return (
      <div className="p-6">
        <MemberDetail
          record={selected}
          member={member}
          onBack={() => setView('grid')}
          onAddExposure={() => { setEditingExp(null); setShowForm(true); }}
          onEditExposure={(exp) => { setEditingExp(exp); setShowForm(true); }}
          onDeleteExposure={handleDeleteExposure}
        />
        {showForm && (
          <WellnessForm
            exposure={editingExp}
            memberName={selected.memberName}
            onSave={handleSaveExposure}
            onClose={() => { setShowForm(false); setEditingExp(null); }}
          />
        )}
      </div>
    );
  }

  // ── Grid view ──────────────────────────────────────────────────────────────
  if (loading) return <div className="p-6 text-sm text-gray-400">Loading wellness records…</div>;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Occupational Health &amp; Wellness</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">NFPA 1582 physicals · SCBA fit tests · Exposure tracking · Vaccinations</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Members Tracked"     value={stats.total}          color="text-gray-800 dark:text-gray-100"    bg="bg-gray-50 dark:bg-gray-950"    icon={User} />
        <StatCard label="Physicals Overdue"   value={stats.physOverdue}    color="text-red-700 dark:text-red-300"     bg="bg-red-50 dark:bg-red-950/50"     icon={AlertTriangle} />
        <StatCard label="Physicals Due Soon"  value={stats.physDueSoon}    color="text-amber-700 dark:text-amber-300"   bg="bg-amber-50 dark:bg-amber-950/50"   icon={Clock} />
        <StatCard label="Not on File"         value={stats.physNotOnFile}  color="text-gray-500 dark:text-gray-400"    bg="bg-gray-50 dark:bg-gray-950"    icon={User} />
        <StatCard label="SCBA Tests Overdue"  value={stats.scbaOverdue}    color="text-red-700 dark:text-red-300"     bg="bg-red-50 dark:bg-red-950/50"     icon={Wind} />
        <StatCard label="YTD Exposures"       value={stats.ytdExposures}   color="text-orange-700 dark:text-orange-300"  bg="bg-orange-50 dark:bg-orange-950/50"  icon={ShieldAlert} />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {['All', 'Alerts', 'Due Soon'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-semibold rounded-xl border transition-colors ${
              filter === f
                ? 'bg-red-700 text-white border-red-700'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300'
            }`}>
            {f}
            {f === 'Alerts' && stats.physOverdue + stats.physNotOnFile + stats.scbaOverdue > 0 && (
              <span className="ml-1.5 bg-white dark:bg-gray-900 text-red-700 dark:text-red-300 text-xs font-black px-1.5 py-0.5 rounded-full">
                {stats.physOverdue + stats.physNotOnFile + stats.scbaOverdue}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Member grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((record) => {
          const member = members.find((m) => m.id === record.memberId);
          return (
            <MemberCard
              key={record.memberId}
              record={record}
              member={member}
              onClick={() => openDetail(record)}
            />
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle2 size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No members match this filter. All clear!</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 text-center">
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}
