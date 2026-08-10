import { useState, useMemo, useEffect, useCallback } from 'react';
import { Fragment } from 'react';
import {
  GraduationCap, AlertTriangle, Clock, CheckCircle2, Award,
  Search, ChevronDown, ChevronUp, ChevronRight, Plus, Pencil, Trash2,
  Calendar, User, MapPin, BookOpen, Timer, Loader2, ShieldCheck, Cpu, Target,
} from 'lucide-react';
import { TRAINING_TYPES, TRAINING_STATUSES } from '../data/training';
import { ROLES } from '../data/auth';
import { api, getStoredUser } from '../utils/api';
import TrainingForm from './TrainingForm';
import DeleteConfirm from './DeleteConfirm';
import TrainingCompliance from './TrainingCompliance';
import TrainingModules from './TrainingModules';
import ModulePlayer from './ModulePlayer';
import ScenarioLibrary from './ScenarioLibrary';
import ExamDashboard from './ExamDashboard';
import ExamBuilder from './ExamBuilder';
import ExamPlayer from './ExamPlayer';
import ScenarioPlayer from './ScenarioPlayer';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';
import AIActionButton from './AIActionButton';

// ─── helpers ────────────────────────────────────────────────────────────────

const today = new Date();
today.setHours(0, 0, 0, 0);

const WARN_DAYS = 30; // days-ahead threshold for "expiring soon"

function daysDiff(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Math.round((d - today) / 86_400_000);
}

function expiryStatus(rec) {
  const diff = daysDiff(rec.expiresDate);
  if (diff === null) return null;
  if (diff < 0) return 'expired';
  if (diff <= WARN_DAYS) return 'soon';
  return 'ok';
}

function formatDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${m}/${d}/${y}`;
}

function ExpiryBadge({ record }) {
  const st = expiryStatus(record);
  if (!st) return null;
  const diff = daysDiff(record.expiresDate);
  if (st === 'expired')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
        <AlertTriangle size={11} /> Expired
      </span>
    );
  if (st === 'soon')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
        <Clock size={11} /> Expires in {diff}d
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 size={11} /> Valid
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    Passed:      'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
    Failed:      'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300',
    'In Progress': 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    Scheduled:   'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
      {status}
    </span>
  );
}

function TypeBadge({ type }) {
  const map = {
    Certification:        'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300',
    Recertification:      'bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300',
    Drill:                'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300',
    'Continuing Education': 'bg-cyan-100 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300',
    HazMat:               'bg-yellow-100 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-300',
    'Technical Rescue':   'bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300',
    'EMS/Medical':        'bg-pink-100 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300',
    'Wildland/Brush':     'bg-lime-100 dark:bg-lime-950/50 text-lime-700 dark:text-lime-300',
    Leadership:           'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    Safety:               'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[type] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
      {type}
    </span>
  );
}

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-start gap-4 shadow-sm">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function TrainingRecords() {
  const [activeTab, setActiveTab] = useState('records');
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState('');
  const [filterType, setFilterType]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [filterExpiry, setFilterExpiry] = useState('');
  const [sortKey, setSortKey]   = useState('completedDate');
  const [sortAsc, setSortAsc]   = useState(false);
  const [expanded, setExpanded] = useState(null);

  const [showForm, setShowForm]         = useState(false);
  const [editRecord, setEditRecord]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // module player
  const [activeModule, setActiveModule] = useState(null);

  // scenario player
  const [activeScenario, setActiveScenario] = useState(null);

  // exam system
  const [examBuilderTarget, setExamBuilderTarget] = useState(null); // null=closed, {}=new, {id,...}=edit
  const [examPlayerTarget, setExamPlayerTarget]   = useState(null);
  const [examMembers, setExamMembers]             = useState([]);
  const user = getStoredUser();
  // Captains and above (role level >= 2) can add, edit, and delete records.
  // Members (level 1) have read-only access.
  const canEdit = user ? (ROLES[user.role]?.level ?? 1) >= 2 : false;

  const fetchRecords = useCallback(async () => {
    try {
      setError(null);
      const raw = await api.get('/api/training');
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setRecords(arr);
    } catch (err) {
      setError(err.message || 'Could not load training records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // unique member names for dropdown
  const memberNames = useMemo(
    () => [...new Set(records.map((r) => r.memberName))].sort(),
    [records]
  );

  // ── stats ──
  const totalHours = useMemo(
    () => records.filter((r) => r.status === 'Passed').reduce((s, r) => s + (r.hours || 0), 0),
    [records]
  );
  const expiredCount = useMemo(
    () => records.filter((r) => expiryStatus(r) === 'expired').length,
    [records]
  );
  const soonCount = useMemo(
    () => records.filter((r) => expiryStatus(r) === 'soon').length,
    [records]
  );
  const certCount = useMemo(
    () => records.filter((r) => r.type === 'Certification' && r.status === 'Passed').length,
    [records]
  );

  // ── filter + sort ──
  const visible = useMemo(() => {
    let r = records;
    if (search)
      r = r.filter(
        (x) =>
          x.courseName.toLowerCase().includes(search.toLowerCase()) ||
          x.memberName.toLowerCase().includes(search.toLowerCase()) ||
          x.instructor?.toLowerCase().includes(search.toLowerCase())
      );
    if (filterType)   r = r.filter((x) => x.type === filterType);
    if (filterStatus) r = r.filter((x) => x.status === filterStatus);
    if (filterMember) r = r.filter((x) => x.memberName === filterMember);
    if (filterExpiry === 'expired') r = r.filter((x) => expiryStatus(x) === 'expired');
    if (filterExpiry === 'soon')    r = r.filter((x) => expiryStatus(x) === 'soon');
    if (filterExpiry === 'valid')   r = r.filter((x) => expiryStatus(x) === 'ok');

    return [...r].sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
      if (sortKey === 'hours') { av = Number(av); bv = Number(bv); }
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [records, search, filterType, filterStatus, filterMember, filterExpiry, sortKey, sortAsc]);

  // ── sort toggle ──
  function toggleSort(key) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  }
  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronDown size={14} className="text-gray-400" />;
    return sortAsc
      ? <ChevronUp size={14} className="text-red-600 dark:text-red-400" />
      : <ChevronDown size={14} className="text-red-600 dark:text-red-400" />;
  }

  // ── crud ──
  async function handleSave(rec) {
    try {
      if (editRecord) {
        await api.patch(`/api/training/${rec.id}`, rec);
      } else {
        await api.post('/api/training', rec);
      }
      await fetchRecords();
    } catch (err) {
      alert(err.message || 'Failed to save training record');
    }
    setShowForm(false);
    setEditRecord(null);
  }

  async function handleDelete() {
    try {
      await api.delete(`/api/training/${deleteTarget.id}`);
      await fetchRecords();
    } catch (err) {
      alert(err.message || 'Failed to delete training record');
    }
    setDeleteTarget(null);
  }

  // ─── render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <Loader2 className="h-8 w-8 animate-spin mr-3" />
      <span className="text-sm">Loading training records…</span>
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-red-50 dark:bg-red-950/50 ring-1 ring-red-200 p-8 text-center">
      <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Could not load training records</p>
      <p className="text-xs text-red-500 mb-4">{error}</p>
      <button onClick={fetchRecords} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">Retry</button>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── tab bar ── */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit flex-wrap">
        {[
          { id: 'records',    label: 'Records',            icon: BookOpen },
          { id: 'compliance', label: 'Compliance & LOSAP', icon: ShieldCheck },
          { id: 'modules',    label: 'On-Demand Modules',  icon: Cpu },
          { id: 'scenarios',  label: 'Scenarios',          icon: Target },
          { id: 'exams',     label: 'Exams',             icon: Award },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-white dark:bg-gray-900 text-red-700 dark:text-red-300 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── compliance tab ── */}
      {activeTab === 'compliance' && <TrainingCompliance />}

      {/* ── modules tab ── */}
      {activeTab === 'modules' && (
        <>
          <TrainingModules onLaunch={setActiveModule} />
          {activeModule && (
            <ModulePlayer
              module={activeModule}
              onClose={() => setActiveModule(null)}
              onCompleted={() => {
                setActiveModule(null);
                fetchRecords();
              }}
            />
          )}
        </>
      )}

      {/* ── scenarios tab ── */}
      {activeTab === 'scenarios' && (
        <>
          <ScenarioLibrary onLaunch={setActiveScenario} />
          {activeScenario && (
            <ScenarioPlayer
              scenario={activeScenario}
              onClose={() => setActiveScenario(null)}
              onCompleted={() => {
                fetchRecords();
              }}
            />
          )}
        </>
      )}

      {/* ── exams tab ── */}
      {activeTab === 'exams' && (
        <>
          {examPlayerTarget ? (
            <ExamPlayer
              exam={examPlayerTarget}
              onSubmit={async (submission) => {
                try {
                  await api.post(`/api/exams/${examPlayerTarget.id}/submit`, submission);
                } catch { /* demo/offline — ExamPlayer shows results locally */ }
                // Don't close player here — ExamPlayer shows its own results screen.
                // Player will call onCancel (Done button) when user is finished reviewing.
                fetchRecords();
              }}
              onCancel={() => setExamPlayerTarget(null)}
            />
          ) : examBuilderTarget ? (
            <ExamBuilder
              exam={examBuilderTarget.id ? examBuilderTarget : null}
              members={examMembers}
              onSave={async (examData) => {
                try {
                  if (examData.id) {
                    await api.patch(`/api/exams/${examData.id}`, examData);
                  } else {
                    const res = await api.post('/api/exams', examData);
                    // assign members if selected
                    if (examData.assignedMembers?.length > 0 && res.data?.id) {
                      await api.post(`/api/exams/${res.data.id}/assign`, { userIds: examData.assignedMembers });
                    }
                  }
                } catch (err) {
                  console.error('Failed to save exam:', err);
                }
                setExamBuilderTarget(null);
              }}
              onCancel={() => setExamBuilderTarget(null)}
            />
          ) : (
            <ExamDashboard
              user={user}
              onNavigateToBuilder={async (exam) => {
                // Fetch members for assignment selector
                try {
                  const raw = await api.get('/api/members');
                  const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
                  setExamMembers(arr);
                } catch { setExamMembers([]); }
                setExamBuilderTarget(exam || {});
              }}
              onNavigateToPlayer={async (examSummary) => {
                // Fetch full exam with questions; fall back to local data for demo/offline
                try {
                  const res = await api.get(`/api/exams/${examSummary.id || examSummary.exam_id}`);
                  setExamPlayerTarget(res.data);
                } catch (err) {
                  console.error('Failed to load exam from API, using local data:', err);
                  // If the examSummary already has questions (demo mode), use it directly
                  if (examSummary.questions && examSummary.questions.length > 0) {
                    setExamPlayerTarget(examSummary);
                  }
                }
              }}
            />
          )}
        </>
      )}

      {/* ── records tab ── */}
      {activeTab === 'records' && <>

      {/* ── alert bar ── */}
      {(expiredCount > 0 || soonCount > 0) && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${expiredCount > 0 ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900' : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900'}`}>
          <AlertTriangle size={18} className={expiredCount > 0 ? 'text-red-600 dark:text-red-400 mt-0.5' : 'text-amber-600 dark:text-amber-400 mt-0.5'} />
          <div className="text-sm">
            {expiredCount > 0 && (
              <span className="font-semibold text-red-700 dark:text-red-300">{expiredCount} expired certification{expiredCount > 1 ? 's' : ''} require renewal. </span>
            )}
            {soonCount > 0 && (
              <span className={`font-semibold ${expiredCount > 0 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>{soonCount} certification{soonCount > 1 ? 's' : ''} expiring within {WARN_DAYS} days.</span>
            )}
          </div>
        </div>
      )}

      {/* ── stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Records"     value={records.length} icon={BookOpen}      color="bg-indigo-500" />
        <StatCard label="Training Hours"    value={totalHours}     icon={Timer}          color="bg-emerald-500" sub="from completed courses" />
        <StatCard label="Active Certs"      value={certCount}      icon={Award}          color="bg-blue-500" />
        <StatCard label="Expiry Alerts"     value={expiredCount + soonCount} icon={AlertTriangle} color={expiredCount > 0 ? 'bg-red-500' : 'bg-amber-500'} sub={expiredCount > 0 ? `${expiredCount} expired` : `${soonCount} expiring soon`} />
      </div>

      {/* ── toolbar ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3 flex-1">
            {/* search */}
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search courses, members, instructors…"
                aria-label="Search training records"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            {/* member filter */}
            <select
              value={filterMember}
              onChange={(e) => setFilterMember(e.target.value)}
              aria-label="Filter by member"
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">All Members</option>
              {memberNames.map((n) => <option key={n}>{n}</option>)}
            </select>

            {/* type filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              aria-label="Filter by type"
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">All Types</option>
              {TRAINING_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>

            {/* status filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Filter by status"
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">All Statuses</option>
              {TRAINING_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>

            {/* expiry filter */}
            <select
              value={filterExpiry}
              onChange={(e) => setFilterExpiry(e.target.value)}
              aria-label="Filter by expiry"
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">All Expiry</option>
              <option value="expired">Expired</option>
              <option value="soon">Expiring Soon</option>
              <option value="valid">Valid</option>
            </select>
          </div>

          <AIActionButton
            action="training_compliance_check"
            context={{ module: 'training' }}
            label="Compliance Check"
            variant="button"
            resultType="json"
          />
          {canEdit && (
            <button
              onClick={() => { setEditRecord(null); setShowForm(true); }}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus size={15} /> Add Record
            </button>
          )}
        </div>
      </div>

      {/* ── table ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th scope="col" aria-sort={sortKey === 'memberName' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('memberName')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Member <SortIcon col="memberName" /></button>
                </th>
                <th scope="col" aria-sort={sortKey === 'courseName' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('courseName')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Course / Certification <SortIcon col="courseName" /></button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th scope="col" aria-sort={sortKey === 'completedDate' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('completedDate')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Completed <SortIcon col="completedDate" /></button>
                </th>
                <th scope="col" aria-sort={sortKey === 'expiresDate' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('expiresDate')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Expires <SortIcon col="expiresDate" /></button>
                </th>
                <th scope="col" aria-sort={sortKey === 'hours' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('hours')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Hrs <SortIcon col="hours" /></button>
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    No training records match your filters.
                  </td>
                </tr>
              )}
              {visible.map((rec) => (
                <Fragment key={rec.id}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpanded(expanded === rec.id ? null : rec.id); }}
                          aria-label={`Expand ${rec.memberName} ${rec.courseName} training record details`}
                          aria-expanded={expanded === rec.id}
                          className="p-0.5"
                        >
                          <ChevronRight size={14} className="text-gray-400" />
                        </button>
                        <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 flex items-center justify-center text-xs font-bold shrink-0">
                          {rec.memberName.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{rec.memberName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{rec.courseName}</td>
                    <td className="px-4 py-3"><TypeBadge type={rec.type} /></td>
                    <td className="px-4 py-3"><StatusBadge status={rec.status} /></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(rec.completedDate)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {rec.expiresDate ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-600 dark:text-gray-300">{formatDate(rec.expiresDate)}</span>
                          <ExpiryBadge record={rec} />
                        </div>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400 text-xs">No expiry</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{rec.hours ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                        <button
                          onClick={() => { setEditRecord(rec); setShowForm(true); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors"
                          title="Edit"
                          aria-label="Edit training record"
                        >
                          <Pencil size={14} />
                        </button>
                        )}
                        {canEdit && (
                        <button
                          onClick={() => setDeleteTarget(rec)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
                          title="Delete"
                          aria-label="Delete training record"
                        >
                          <Trash2 size={14} />
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* ── expanded detail row ── */}
                  {expanded === rec.id && (
                    <tr className="bg-gray-50 dark:bg-gray-950">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="flex items-start gap-2">
                            <User size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Instructor</p>
                              <p className="text-gray-700 dark:text-gray-300">{rec.instructor || '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Location</p>
                              <p className="text-gray-700 dark:text-gray-300">{rec.location || '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Date Completed</p>
                              <p className="text-gray-700 dark:text-gray-300">{formatDate(rec.completedDate)}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <GraduationCap size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Hours</p>
                              <p className="text-gray-700 dark:text-gray-300">{rec.hours ?? '—'} hrs</p>
                            </div>
                          </div>
                          {rec.notes && (
                            <div className="col-span-2 md:col-span-4 flex items-start gap-2">
                              <BookOpen size={14} className="text-gray-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Notes</p>
                                <p className="text-gray-700 dark:text-gray-300">{rec.notes}</p>
                              </div>
                            </div>
                          )}
                          {/* AI Actions */}
                          <div className="col-span-2 md:col-span-4 border-t border-gray-200 dark:border-gray-700 pt-3 mt-1">
                            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">AI Actions</p>
                            <div className="flex flex-wrap gap-2">
                              <AIActionButton
                                action="recommend_training"
                                context={{ module: 'training', recordId: rec.memberId || rec.id, data: { memberName: rec.memberName, record: rec } }}
                                label={`Recommend for ${rec.memberName?.split(' ')[0] || 'Member'}`}
                                variant="inline"
                                resultType="json"
                              />
                            </div>
                          </div>
                          {/* Linked Meetings */}
                          <div className="col-span-2 md:col-span-4 border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                            <LinkedMeetings module="training" recordId={rec.id} recordLabel={rec.courseName || rec.title} />
                            <Attachments module="training" recordId={rec.id} recordLabel={rec.courseName || rec.title} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* footer count */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-xs text-gray-500 dark:text-gray-400">
          Showing {visible.length} of {records.length} record{records.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── modals ── */}
      {showForm && (
        <TrainingForm
          record={editRecord}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditRecord(null); }}
          existingIds={records.map((r) => r.id)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          member={{ name: `${deleteTarget.courseName} — ${deleteTarget.memberName}`, id: deleteTarget.id }}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      </> /* end records tab */}
    </div>
  );
}
