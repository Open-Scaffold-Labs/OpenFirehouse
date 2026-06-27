import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Pencil,
  Trash2,
  Search,
  ChevronUp,
  ChevronDown,
  Users,
  Activity,
  Shield,
  Phone,
  Mail,
  MapPin,
  HeartPulse,
  ChevronRight,
  Hash,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { STATUSES } from '../data/members';
import { api, getToken, getStoredUser } from '../utils/api';
import StatusBadge from './StatusBadge';
import MemberForm from './MemberForm';
import DeleteConfirm from './DeleteConfirm';
import UnlinkedMembersCard from './UnlinkedMembersCard';

// Command tier (battalion_chief/deputy_chief/chief) — mirrors server requireChief.
const COMMAND_ROLES = new Set(['chief', 'deputy_chief', 'battalion_chief', 'training_battalion']);

const SORT_FIELDS = ['name', 'rank', 'role', 'status', 'joined', 'seniority_number', 'hire_date', 'employment_type'];

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function yearsOfService(joined) {
  if (!joined) return '—';
  const diff = Date.now() - new Date(joined + 'T00:00:00').getTime();
  const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  return years === 1 ? '1 yr' : `${years} yrs`;
}

// ── Expanded contact row ───────────────────────────────────────────────────────

function ContactDetail({ member }) {
  return (
    <tr className="bg-blue-50 dark:bg-blue-950/50 border-b border-blue-100 dark:border-blue-900">
      <td colSpan={7} className="px-4 pb-4 pt-2">
        {/* Large avatar header in expanded row */}
        {member.photo_url && (
          <div className="flex items-center gap-3 pl-11 mb-3 pt-1">
            <img src={member.photo_url} alt={member.name}
              className="h-14 w-14 rounded-full object-cover ring-2 ring-white shadow-md" />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{member.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{member.rank} · {member.role}</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-11">

          {/* Contact */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-2">Contact</p>
            {member.phone ? (
              <a href={`tel:${member.phone}`}
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-red-700 dark:hover:text-red-300 transition-colors">
                <Phone size={13} className="text-gray-400 flex-shrink-0" />
                {member.phone}
              </a>
            ) : <p className="text-xs text-gray-400 flex items-center gap-2"><Phone size={13} className="text-gray-300 dark:text-gray-600" />No phone on file</p>}
            {member.station_email ? (
              <a href={`mailto:${member.station_email}`}
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-red-700 dark:hover:text-red-300 transition-colors truncate">
                <Mail size={13} className="text-gray-400 flex-shrink-0" />
                <span title={member.station_email}>{member.station_email}</span>
              </a>
            ) : <p className="text-xs text-gray-400 flex items-center gap-2"><Mail size={13} className="text-gray-300 dark:text-gray-600" />No station email on file</p>}
            {member.personal_email ? (
              <a href={`mailto:${member.personal_email}`}
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-red-700 dark:hover:text-red-300 transition-colors truncate">
                <Mail size={13} className="text-gray-400 flex-shrink-0" />
                <span title={member.personal_email}>{member.personal_email}</span>
              </a>
            ) : <p className="text-xs text-gray-400 flex items-center gap-2"><Mail size={13} className="text-gray-300 dark:text-gray-600" />No personal email on file</p>}
            {member.address && (
              <p className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                <MapPin size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
                {member.address}
              </p>
            )}
          </div>

          {/* Personal */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-2">Personal</p>
            {member.memberNumber && (
              <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Hash size={13} className="text-gray-400 flex-shrink-0" />
                Badge #{member.memberNumber}
              </p>
            )}
            {member.dob && (
              <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <HeartPulse size={13} className="text-gray-400 flex-shrink-0" />
                DOB: {formatDate(member.dob)}
              </p>
            )}
            <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Shield size={13} className="text-gray-400 flex-shrink-0" />
              {yearsOfService(member.joined)} of service
            </p>
          </div>

          {/* Emergency */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-2">Emergency Contact</p>
            {member.emergencyContactName ? (
              <>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {member.emergencyContactName}
                  {member.emergencyContactRelation && (
                    <span className="ml-1.5 text-xs text-gray-400 font-normal">({member.emergencyContactRelation})</span>
                  )}
                </p>
                {member.emergencyContactPhone && (
                  <a href={`tel:${member.emergencyContactPhone}`}
                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-red-700 dark:hover:text-red-300 transition-colors">
                    <Phone size={13} className="text-gray-400 flex-shrink-0" />
                    {member.emergencyContactPhone}
                  </a>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400">No emergency contact on file</p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MemberRoster({ selectedStation = null }) {
  const [members, setMembers]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus]     = useState('All');
  const [filterEmpType, setFilterEmpType]  = useState('All');
  const [sortField, setSortField]       = useState('name');
  const [sortDir, setSortDir]           = useState('asc');
  const [expandedId, setExpandedId]     = useState(null);

  const [formOpen, setFormOpen]             = useState(false);
  const [editingMember, setEditingMember]   = useState(null);
  const [deletingMember, setDeletingMember] = useState(null);

  const isCommand = COMMAND_ROLES.has(getStoredUser()?.role);

  // ── Load members from API ──────────────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/api/members');
      setMembers(Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active  = members.filter((m) => m.status === 'Active').length;
    const onLeave = members.filter((m) => m.status === 'On Leave').length;
    const available = members.filter((m) => m.available !== false).length;
    return { total: members.length, active, onLeave, available };
  }, [members]);

  // ── Filtered & sorted list ─────────────────────────────────────────────────
  const displayedMembers = useMemo(() => {
    let list = members.filter((m) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.rank.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        (m.phone || '').includes(q) ||
        (m.station_email || '').toLowerCase().includes(q) ||
        (m.personal_email || '').toLowerCase().includes(q) ||
        (m.memberNumber || '').toLowerCase().includes(q);
      const matchesStatus = filterStatus === 'All' || m.status === filterStatus;
      const matchesEmpType = filterEmpType === 'All' || (m.employment_type || 'volunteer') === filterEmpType;
      const matchesStation = !selectedStation || m.station_id === selectedStation; // P6.3
      return matchesSearch && matchesStatus && matchesEmpType && matchesStation;
    });

    list = [...list].sort((a, b) => {
      let av = a[sortField] ?? '';
      let bv = b[sortField] ?? '';
      // Numeric sort for seniority_number
      if (sortField === 'seniority_number') {
        av = parseInt(av) || 9999;
        bv = parseInt(bv) || 9999;
      } else if (typeof av === 'string') {
        av = av.toLowerCase();
        bv = (bv || '').toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [members, search, filterStatus, filterEmpType, sortField, sortDir]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  async function handleSave(formData) {
    try {
      if (formData.id) {
        const { id, createdAt, updatedAt, ...fields } = formData;
        await api.patch(`/api/members/${id}`, fields);
      } else {
        await api.post('/api/members', formData);
      }
      await fetchMembers();
    } catch (err) {
      alert(`Save failed: ${err.message}`);
      return;
    }
    setFormOpen(false);
    setEditingMember(null);
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/api/members/${id}`);
      await fetchMembers();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
      return;
    }
    setDeletingMember(null);
    if (expandedId === id) setExpandedId(null);
  }

  function openAdd() {
    setEditingMember(null);
    setFormOpen(true);
  }

  function openEdit(member) {
    setEditingMember(member);
    setFormOpen(true);
  }

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleToggleAvailability(id, currentAvailable) {
    try {
      const newAvailable = !currentAvailable;
      await api.patch(`/api/members/${id}/availability`, { available: newAvailable });
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, available: newAvailable } : m))
      );
    } catch (err) {
      alert(`Failed to update availability: ${err.message}`);
    }
  }

  function SortIcon({ field }) {
    if (sortField !== field) return <ChevronUp className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3.5 w-3.5 text-red-500" />
      : <ChevronDown className="h-3.5 w-3.5 text-red-500" />;
  }

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
        <p className="text-xs text-red-500 mb-2">{error}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-mono">
          token: {getToken() ? `PRESENT (${getToken().slice(0, 20)}…)` : 'NULL — this is why auth fails'}
          {' | '}ls: {localStorage.getItem('fs_token') ? 'stored' : 'empty'}
        </p>
        <button
          onClick={fetchMembers}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── P5: chief-only "Roster setup → Unlinked members" confirm-link card.
             Renders nothing when every member is linked (zero-config happy path). */}
      {isCommand && <UnlinkedMembersCard onChanged={fetchMembers} />}

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              <Users className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Members</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/50">
              <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.active}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Active</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/50">
              <Shield className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.onLeave}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">On Leave</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/50">
              <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.available} of {stats.total}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Available Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, rank, role, phone, email…"
            aria-label="Search members by name, rank, role, phone, or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />
        </div>

        <select
          value={filterStatus}
          aria-label="Filter by status"
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 shadow-sm outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
        >
          <option value="All">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={filterEmpType}
          aria-label="Filter by employment type"
          onChange={(e) => setFilterEmpType(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 shadow-sm outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
        >
          <option value="All">All Types</option>
          <option value="volunteer">Volunteer</option>
          <option value="career">Career</option>
          <option value="part-time">Part-Time</option>
          <option value="per-diem">Per Diem</option>
        </select>

        <button onClick={() => { setSortField('seniority_number'); setSortDir('asc'); }}
          className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
            sortField === 'seniority_number'
              ? 'bg-red-700 text-white border-red-700'
              : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-red-400'
          }`}
          title="Sort by seniority number"
        >
          Seniority
        </button>

        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Add Member
        </button>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 overflow-hidden">
        {displayedMembers.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No members match your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-950">
                <tr>
                  <th className="w-8 px-3 py-3" />
                  {[
                    { field: 'name',   label: 'Name'   },
                    { field: 'rank',   label: 'Rank'   },
                    { field: 'role',   label: 'Role'   },
                    { field: 'status', label: 'Status' },
                    { field: 'joined', label: 'Joined' },
                  ].map(({ field, label }) => (
                    <th
                      key={field}
                      scope="col"
                      aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(field)}
                        className="inline-flex items-center gap-1 w-full text-left cursor-pointer select-none"
                      >
                        {label}
                        <SortIcon field={field} />
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="bg-white dark:bg-gray-900">
                {displayedMembers.map((member) => {
                  const expanded = expandedId === member.id;
                  return [
                    <tr
                      key={member.id}
                      onClick={() => toggleExpand(member.id)}
                      className={`cursor-pointer transition-colors divide-x-0 ${
                        expanded ? 'bg-blue-50 dark:bg-blue-950/50 border-b-0' : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700'
                      }`}
                    >
                      {/* Expand chevron */}
                      <td className="pl-3 pr-1 py-3.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(member.id); }}
                          aria-label={`Expand ${member.name} details`}
                          aria-expanded={expanded}
                          className="p-0.5"
                        >
                          <ChevronRight
                            size={14}
                            className={`text-gray-400 transition-transform duration-150 ${expanded ? 'rotate-90 text-blue-500' : ''}`}
                          />
                        </button>
                      </td>

                      {/* Name + contact preview + certs */}
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                          <div
                            className="h-9 w-9 rounded-full flex-shrink-0 cursor-pointer overflow-hidden ring-1 ring-gray-200 bg-red-700 flex items-center justify-center"
                            onClick={() => toggleExpand(member.id)}
                            role="button"
                            tabIndex={0}
                            aria-label={`Toggle contact details for ${member.name}`}
                            aria-expanded={expanded}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(member.id); } }}
                          >
                            {member.photo_url
                              ? <img src={member.photo_url} alt={member.name} className="h-full w-full object-cover" />
                              : <span className="text-white text-xs font-bold">{member.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}</span>
                            }
                          </div>
                          <div className="min-w-0">
                            <p
                              className="text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-red-700 dark:hover:text-red-300 transition-colors"
                              onClick={() => toggleExpand(member.id)}
                            >
                              {member.name}
                            </p>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {member.phone && (
                                <a
                                  href={`tel:${member.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                >
                                  <Phone size={10} />
                                  {member.phone}
                                </a>
                              )}
                              {member.station_email && (
                                <a
                                  href={`mailto:${member.station_email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                >
                                  <Mail size={10} />
                                  {member.station_email}
                                </a>
                              )}
                              {member.personal_email && (
                                <a
                                  href={`mailto:${member.personal_email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                >
                                  <Mail size={10} />
                                  {member.personal_email}
                                </a>
                              )}
                            </div>
                            {member.certifications?.length > 0 && (
                              <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5 truncate max-w-[200px]">
                                {member.certifications.join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Rank */}
                      <td className="px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {member.rank}
                      </td>
                      {/* Role */}
                      <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {member.role}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={member.status} />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleAvailability(member.id, member.available !== false);
                            }}
                            title={member.available !== false ? 'Mark unavailable' : 'Mark available'}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full ring-1 ring-inset transition-colors hover:opacity-80"
                            style={{
                              backgroundColor: member.available !== false ? '#d1fae5' : '#f3f4f6',
                              color: member.available !== false ? '#065f46' : '#6b7280',
                              borderColor: member.available !== false ? '#a7f3d0' : '#e5e7eb',
                            }}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${member.available !== false ? 'bg-emerald-600' : 'bg-gray-400'}`} />
                            {member.available !== false ? 'Available' : 'Unavailable'}
                          </button>
                        </div>
                      </td>
                      {/* Joined */}
                      <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(member.joined)}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(member)}
                            title="Edit"
                            aria-label={`Edit ${member.name}`}
                            className="rounded-lg p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeletingMember(member)}
                            title="Remove"
                            aria-label={`Remove ${member.name}`}
                            className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>,

                    // Expanded contact detail row
                    expanded && <ContactDetail key={`${member.id}-detail`} member={member} />,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-400 text-center">
        Showing {displayedMembers.length} of {members.length} members
        {filterStatus !== 'All' && ` · Filtered by: ${filterStatus}`}
        {' · '}Click any row to expand contact details
      </p>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {formOpen && (
        <MemberForm
          member={editingMember}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditingMember(null); }}
        />
      )}
      {deletingMember && (
        <DeleteConfirm
          member={deletingMember}
          onConfirm={handleDelete}
          onCancel={() => setDeletingMember(null)}
        />
      )}
    </div>
  );
}
