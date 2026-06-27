import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ArrowLeft, User, Phone, Mail, MapPin, Calendar,
  Award, GraduationCap, Clock, Flame, ChevronDown, ChevronUp,
  ShieldCheck, Search, Loader2,
} from 'lucide-react';
import { api } from '../utils/api';
import { ACTIVITY_COLORS } from '../data/volunteerHours';

// ─── helpers ────────────────────────────────────────────────────────────────

function yearsOfService(joined) {
  const ms = Date.now() - new Date(joined).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
}

function initials(name) {
  return name
    .split(' ')
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

const STATUS_COLORS = {
  Active:       'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
  Inactive:     'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  'On Leave':   'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
  Probationary: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
};

const AVATAR_COLORS = [
  'bg-red-700',
  'bg-slate-700',
  'bg-orange-700',
  'bg-emerald-700',
  'bg-blue-700',
  'bg-violet-700',
  'bg-pink-700',
  'bg-teal-700',
];

function avatarColor(id) {
  return AVATAR_COLORS[(id - 1) % AVATAR_COLORS.length];
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = 'text-gray-700 dark:text-gray-300' }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-start gap-3">
      <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-lg">
        <Icon size={18} className={color} />
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className={`text-2xl font-bold leading-none mt-0.5 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Member Card (grid view) ─────────────────────────────────────────────────

function MemberCard({ member, onClick, trainingRecords, hours, incidents }) {
  const yrs = yearsOfService(member.joined);
  const hrs = useMemo(() => {
    const yr = new Date().getFullYear();
    return hours
      .filter((h) => h.memberId === member.id && h.date.startsWith(String(yr)))
      .reduce((sum, h) => sum + h.hours, 0);
  }, [member.id, hours]);

  const incidentCount = useMemo(
    () => incidents.filter((i) => i.personnel?.includes(member.name)).length,
    [member.name, incidents]
  );

  return (
    <button
      onClick={onClick}
      className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-red-200 transition-all text-left w-full group"
    >
      {/* Avatar + Status */}
      <div className="px-5 pt-5 pb-3 flex items-start gap-4">
        <div className={`w-14 h-14 rounded-full ${avatarColor(member.id)} flex items-center justify-center flex-shrink-0 shadow-inner`}>
          <span className="text-white font-bold text-lg tracking-wide">{initials(member.name)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900 dark:text-gray-100 leading-snug group-hover:text-red-700 transition-colors truncate">
            {member.name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{member.rank}</p>
          <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[member.status]}`}>
            {member.status}
          </span>
        </div>
      </div>

      {/* Mini stats */}
      <div className="border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 text-center py-3">
        <div>
          <p className="text-base font-bold text-gray-800 dark:text-gray-100">{yrs}</p>
          <p className="text-xs text-gray-400">Yrs Service</p>
        </div>
        <div className="border-x border-gray-100 dark:border-gray-700">
          <p className="text-base font-bold text-gray-800 dark:text-gray-100">{incidentCount}</p>
          <p className="text-xs text-gray-400">Incidents</p>
        </div>
        <div>
          <p className="text-base font-bold text-gray-800 dark:text-gray-100">{hrs.toFixed(0)}</p>
          <p className="text-xs text-gray-400">Hrs {new Date().getFullYear()}</p>
        </div>
      </div>

      {/* Role pill */}
      <div className="px-5 pb-4">
        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-0.5">
          {member.role}
        </span>
      </div>
    </button>
  );
}

// ─── Profile View ────────────────────────────────────────────────────────────

function ProfileSection({ title, icon: Icon, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-red-600 dark:text-red-400" />
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{title}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function MemberProfile({ member, onBack, training, allHours, incidents }) {
  const yrs = yearsOfService(member.joined);

  const trainingRecords = useMemo(
    () => training.filter((r) => r.memberId === member.id)
          .sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || '')),
    [member.id, training]
  );

  const memberHours = useMemo(
    () => allHours.filter((h) => h.memberId === member.id)
          .sort((a, b) => b.date.localeCompare(a.date)),
    [member.id, allHours]
  );

  const thisYearHours = useMemo(() => {
    const yr = String(new Date().getFullYear());
    return memberHours.filter((h) => h.date.startsWith(yr));
  }, [memberHours]);

  const totalHoursYTD = thisYearHours.reduce((s, h) => s + h.hours, 0);
  const totalHoursAll  = memberHours.reduce((s, h) => s + h.hours, 0);

  // Hours by activity type (YTD)
  const hoursByType = useMemo(() => {
    const map = {};
    thisYearHours.forEach((h) => {
      map[h.activityType] = (map[h.activityType] || 0) + h.hours;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [thisYearHours]);

  const memberIncidents = useMemo(
    () => incidents
          .filter((i) => i.personnel?.includes(member.name))
          .sort((a, b) => b.date.localeCompare(a.date)),
    [member.name, incidents]
  );

  const activeCerts = member.certifications?.length ?? 0;

  // Cert expiry awareness from training records
  const expiredCerts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return trainingRecords.filter(
      (r) => r.expiresDate && r.expiresDate < today && r.status === 'Passed'
    );
  }, [trainingRecords]);

  const expiringSoon = useMemo(() => {
    const today = new Date();
    const soon  = new Date(today); soon.setDate(today.getDate() + 30);
    const todayStr = today.toISOString().slice(0, 10);
    const soonStr  = soon.toISOString().slice(0, 10);
    return trainingRecords.filter(
      (r) => r.expiresDate && r.expiresDate >= todayStr && r.expiresDate <= soonStr && r.status === 'Passed'
    );
  }, [trainingRecords]);

  return (
    <div className="space-y-5">

      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-red-700 dark:hover:text-red-300 transition-colors font-medium"
      >
        <ArrowLeft size={16} />
        Back to Member Portal
      </button>

      {/* Profile header card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-red-700 to-red-900" />
        <div className="px-6 pb-5">
          <div className="flex items-end gap-4 -mt-10 mb-4">
            <div className={`w-20 h-20 rounded-2xl ${avatarColor(member.id)} border-4 border-white shadow-md flex items-center justify-center flex-shrink-0`}>
              <span className="text-white font-bold text-2xl tracking-wide">{initials(member.name)}</span>
            </div>
            <div className="pb-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{member.name}</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{member.rank} · {member.role}</p>
            </div>
            <div className="ml-auto pb-1">
              <span className={`text-sm font-semibold px-3 py-1 rounded-full ${STATUS_COLORS[member.status]}`}>
                {member.status}
              </span>
            </div>
          </div>

          {/* Info row */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <Calendar size={13} className="text-gray-400" />
              Joined {fmtDate(member.joined)}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-gray-400" />
              {yrs} {yrs === 1 ? 'year' : 'years'} of service
            </span>
            {expiredCerts.length > 0 && (
              <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                ⚠ {expiredCerts.length} expired cert{expiredCerts.length > 1 ? 's' : ''}
              </span>
            )}
            {expiringSoon.length > 0 && (
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                ⚠ {expiringSoon.length} cert{expiringSoon.length > 1 ? 's' : ''} expiring soon
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={ShieldCheck} label="Years of Service" value={yrs}       color="text-red-700 dark:text-red-300" />
        <StatCard icon={Flame}       label="Incidents Responded" value={incidents.length} color="text-orange-600 dark:text-orange-400" />
        <StatCard icon={Clock}       label={`Hours (${new Date().getFullYear()})`} value={totalHoursYTD.toFixed(1)} sub={`${totalHoursAll.toFixed(0)} total`} color="text-blue-700 dark:text-blue-300" />
        <StatCard icon={Award}       label="Certifications" value={activeCerts} color="text-emerald-700 dark:text-emerald-300" />
      </div>

      {/* Certifications */}
      <ProfileSection title="Certifications" icon={Award}>
        {member.certifications && member.certifications.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {member.certifications.map((cert) => (
              <span
                key={cert}
                className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900"
              >
                {cert}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 pt-1">No certifications on file.</p>
        )}
      </ProfileSection>

      {/* Training History */}
      <ProfileSection title={`Training History (${trainingRecords.length} records)`} icon={GraduationCap}>
        {trainingRecords.length === 0 ? (
          <p className="text-sm text-gray-400 pt-1">No training records found.</p>
        ) : (
          <div className="overflow-x-auto -mx-1 pt-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  <th className="text-left py-2 px-1">Course</th>
                  <th className="text-left py-2 px-1">Type</th>
                  <th className="text-left py-2 px-1">Date</th>
                  <th className="text-left py-2 px-1">Hrs</th>
                  <th className="text-left py-2 px-1">Expires</th>
                  <th className="text-left py-2 px-1">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {trainingRecords.map((r) => {
                  const today = new Date().toISOString().slice(0, 10);
                  const isExpired = r.expiresDate && r.expiresDate < today;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-2 px-1 font-medium text-gray-800 dark:text-gray-100">{r.courseName}</td>
                      <td className="py-2 px-1 text-gray-500 dark:text-gray-400 text-xs">{r.type}</td>
                      <td className="py-2 px-1 text-gray-500 dark:text-gray-400">{fmtDate(r.completedDate)}</td>
                      <td className="py-2 px-1 text-gray-500 dark:text-gray-400">{r.hours}</td>
                      <td className={`py-2 px-1 text-xs font-medium ${isExpired ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {r.expiresDate ? fmtDate(r.expiresDate) : '—'}
                        {isExpired && <span className="ml-1">⚠</span>}
                      </td>
                      <td className="py-2 px-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          r.status === 'Passed'      ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300'  :
                          r.status === 'Failed'      ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'      :
                          r.status === 'In Progress' ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'    :
                                                       'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                        }`}>{r.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ProfileSection>

      {/* Volunteer Hours */}
      <ProfileSection title={`Volunteer Hours — ${new Date().getFullYear()} YTD`} icon={Clock}>
        {thisYearHours.length === 0 ? (
          <p className="text-sm text-gray-400 pt-1">No hours logged this year.</p>
        ) : (
          <div className="pt-1 space-y-3">
            {/* Hours by type — visual bars */}
            <div className="space-y-2">
              {hoursByType.map(([type, hrs]) => {
                const pct = Math.round((hrs / totalHoursYTD) * 100);
                const colorClass = ACTIVITY_COLORS[type] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400';
                const barColor = colorClass.split(' ')[0].replace('bg-', 'bg-').replace('-100', '-400');
                return (
                  <div key={type}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>{type}</span>
                      <span className="text-gray-500 dark:text-gray-400 font-medium">{hrs.toFixed(1)} hrs · {pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                      <div className={`h-2 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 text-right">Total: <span className="font-semibold text-gray-700 dark:text-gray-300">{totalHoursYTD.toFixed(1)} hrs</span></p>
          </div>
        )}
      </ProfileSection>

      {/* Incident History */}
      <ProfileSection title={`Incident Response (${memberIncidents.length} responses)`} icon={Flame}>
        {memberIncidents.length === 0 ? (
          <p className="text-sm text-gray-400 pt-1">No incident responses on record.</p>
        ) : (
          <div className="overflow-x-auto -mx-1 pt-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  <th className="text-left py-2 px-1">#</th>
                  <th className="text-left py-2 px-1">Date</th>
                  <th className="text-left py-2 px-1">Type</th>
                  <th className="text-left py-2 px-1">Address</th>
                  <th className="text-left py-2 px-1">Disposition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {memberIncidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-2 px-1 text-xs text-gray-400 font-mono">{inc.incidentNumber}</td>
                    <td className="py-2 px-1 text-gray-600 dark:text-gray-300">{fmtDate(inc.date)}</td>
                    <td className="py-2 px-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        inc.type === 'Structure Fire' || inc.type === 'Vehicle Fire' || inc.type === 'Brush / Wildland Fire'
                          ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                          : inc.type === 'Medical / EMS'
                          ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                          : inc.type === 'Vehicle Accident' || inc.type === 'Technical Rescue'
                          ? 'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}>{inc.type}</span>
                    </td>
                    <td className="py-2 px-1 text-gray-500 dark:text-gray-400 text-xs max-w-[180px] truncate">{inc.address}</td>
                    <td className="py-2 px-1 text-gray-500 dark:text-gray-400 text-xs">{inc.disposition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ProfileSection>

    </div>
  );
}

// ─── Main Portal Component ───────────────────────────────────────────────────

const STATUS_FILTERS = ['All', 'Active', 'On Leave', 'Probationary', 'Inactive'];

export default function MemberPortal({ user }) {
  const [members,        setMembers]        = useState([]);
  const [training,       setTraining]       = useState([]);
  const [hours,          setHours]          = useState([]);
  const [incidents,      setIncidents]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [autoSelected,   setAutoSelected]   = useState(false);
  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState('All');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [memRes, trainRes, hourRes, incRes] = await Promise.all([
        api.get('/api/members'),
        api.get('/api/training'),
        api.get('/api/volunteer-hours'),
        api.get('/api/incidents'),
      ]);
      const members = Array.isArray(memRes?.data) ? memRes.data : Array.isArray(memRes) ? memRes : [];
      const training = Array.isArray(trainRes?.data) ? trainRes.data : Array.isArray(trainRes) ? trainRes : [];
      const hours = Array.isArray(hourRes?.data) ? hourRes.data : Array.isArray(hourRes) ? hourRes : [];
      const incidents = Array.isArray(incRes?.data) ? incRes.data : Array.isArray(incRes) ? incRes : [];
      setMembers(members);
      setTraining(training);
      setHours(hours);
      setIncidents(incidents);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-select the logged-in user's member profile when navigating from "My Portal"
  useEffect(() => {
    if (!autoSelected && user?.name && members.length > 0 && !selectedMember) {
      const me = members.find(m => m.name === user.name);
      if (me) { setSelectedMember(me); setAutoSelected(true); }
    }
  }, [members, user, autoSelected, selectedMember]);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      const matchStatus = statusFilter === 'All' || m.status === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q || m.name.toLowerCase().includes(q) || m.rank.toLowerCase().includes(q) || m.role.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [members, search, statusFilter]);

  // Summary stats
  const stats = useMemo(() => {
    const active   = members.filter((m) => m.status === 'Active').length;
    const onLeave  = members.filter((m) => m.status === 'On Leave').length;
    const probat   = members.filter((m) => m.status === 'Probationary').length;
    const inactive = members.filter((m) => m.status === 'Inactive').length;
    return { active, onLeave, probat, inactive, total: members.length };
  }, [members]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Loading members…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-950/50 ring-1 ring-red-200 p-6 text-center">
        <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Could not load members</p>
        <p className="text-xs text-red-500 mb-4">{error}</p>
        <button
          onClick={fetchMembers}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (selectedMember) {
    return (
      <div className="p-6">
        <MemberProfile
          member={selectedMember}
          onBack={() => setSelectedMember(null)}
          training={training}
          allHours={hours}
          incidents={incidents}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Member Portal</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Individual profiles with training, hours, and incident history.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={User}       label="Total Members"  value={stats.total}    color="text-gray-700 dark:text-gray-300" />
        <StatCard icon={ShieldCheck} label="Active"        value={stats.active}   color="text-green-700 dark:text-green-300" />
        <StatCard icon={Clock}       label="On Leave"      value={stats.onLeave}  color="text-amber-600 dark:text-amber-400" />
        <StatCard icon={GraduationCap} label="Probationary" value={stats.probat} color="text-blue-700 dark:text-blue-300" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, rank, or role…"
            aria-label="Search members by name, rank, or role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                statusFilter === s
                  ? 'bg-red-700 text-white border-red-700'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Member Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <User size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No members match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              onClick={() => setSelectedMember(m)}
              trainingRecords={training}
              hours={hours}
              incidents={incidents}
            />
          ))}
        </div>
      )}
    </div>
  );
}
