import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, X, Users, Flame, Award, TrendingUp,
  Calendar, User, Phone, Mail, BookOpen, Clock, Zap,
} from 'lucide-react';
import { api } from '../utils/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const RANKS = ['Cadet', 'Senior Cadet', 'Junior Officer'];
const STATUSES = ['Active', 'Inactive', 'Graduated', 'Withdrawn'];

const STATUS_COLORS = {
  Active: { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300' },
  Inactive: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
  Graduated: { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300' },
  Withdrawn: { bg: 'bg-red-100 dark:bg-red-950/50', text: 'text-red-700 dark:text-red-300' },
};

const RANK_COLORS = {
  Cadet: { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300' },
  'Senior Cadet': { bg: 'bg-purple-100 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-300' },
  'Junior Officer': { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-300' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcAge(dob) {
  if (!dob) return null;
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.Active;
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
      {status}
    </span>
  );
}

function RankBadge({ rank }) {
  const colors = RANK_COLORS[rank] || RANK_COLORS.Cadet;
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
      {rank}
    </span>
  );
}

// ─── Cadet Card ───────────────────────────────────────────────────────────────

function CadetCard({ cadet, onEdit, onDelete }) {
  const age = calcAge(cadet.date_of_birth);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">{cadet.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <RankBadge rank={cadet.rank || 'Cadet'} />
              <StatusBadge status={cadet.status || 'Active'} />
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => onEdit(cadet)} aria-label={`Edit ${cadet.name}`}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={() => onDelete(cadet.id)} aria-label={`Remove ${cadet.name}`}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {/* Age and school */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs mb-0.5">Age</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{age !== null ? `${age} years old` : '—'}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs mb-0.5">School</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{cadet.school || '—'}</p>
          </div>
        </div>

        {/* Guardian info */}
        {cadet.parent_guardian && (
          <div className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700 pt-2">
            <span className="flex items-center gap-1.5">
              <User size={12} className="text-gray-400" />
              <span className="font-medium">{cadet.parent_guardian}</span>
            </span>
            {cadet.parent_phone && (
              <span className="flex items-center gap-1.5">
                <Phone size={12} className="text-gray-400" />
                {cadet.parent_phone}
              </span>
            )}
            {cadet.parent_email && (
              <span className="flex items-center gap-1.5">
                <Mail size={12} className="text-gray-400" />
                {cadet.parent_email}
              </span>
            )}
          </div>
        )}

        {/* Training hours */}
        <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-2 text-xs">
          <span className="text-gray-500 dark:text-gray-400">Training Hours</span>
          <span className="font-bold text-gray-900 dark:text-gray-100">{cadet.training_hours || 0}</span>
        </div>

        {/* Enrolled date */}
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-2">
          <Calendar size={11} className="text-gray-400" />
          Enrolled {fmtDate(cadet.enrolled_date)}
        </div>

        {cadet.notes && (
          <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 rounded px-2 py-1 text-xs text-blue-700 dark:text-blue-300">
            📝 {cadet.notes}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cadet Form Modal ─────────────────────────────────────────────────────────

function CadetForm({ cadet, onSave, onCancel }) {
  const [name, setName] = useState(cadet?.name || '');
  const [dob, setDob] = useState(cadet?.date_of_birth || '');
  const [school, setSchool] = useState(cadet?.school || '');
  const [parentGuardian, setParentGuardian] = useState(cadet?.parent_guardian || '');
  const [parentPhone, setParentPhone] = useState(cadet?.parent_phone || '');
  const [parentEmail, setParentEmail] = useState(cadet?.parent_email || '');
  const [rank, setRank] = useState(cadet?.rank || 'Cadet');
  const [status, setStatus] = useState(cadet?.status || 'Active');
  const [trainingHours, setTrainingHours] = useState(cadet?.training_hours || '0');
  const [enrolledDate, setEnrolledDate] = useState(cadet?.enrolled_date || new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(cadet?.notes || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !dob) {
      setError('Name and date of birth are required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        date_of_birth: dob,
        school: school.trim() || null,
        parent_guardian: parentGuardian.trim() || null,
        parent_phone: parentPhone.trim() || null,
        parent_email: parentEmail.trim() || null,
        rank,
        status,
        training_hours: parseInt(trainingHours) || 0,
        enrolled_date: enrolledDate,
        notes: notes.trim() || null,
      };

      if (cadet?.id) {
        await api.patch(`/api/cadets/${cadet.id}`, payload);
      } else {
        await api.post('/api/cadets', payload);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {cadet ? 'Edit Cadet' : 'Add Cadet'}
          </h2>
          <button onClick={onCancel} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="Full name"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Birth *</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                aria-label="Date of birth"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">School</label>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              aria-label="School"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
              placeholder="High school name"
              disabled={loading}
            />
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Parent/Guardian Info</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={parentGuardian}
                  onChange={(e) => setParentGuardian(e.target.value)}
                  aria-label="Parent or guardian name"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Guardian name"
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    aria-label="Parent or guardian phone"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                    placeholder="(555) 123-4567"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    aria-label="Parent or guardian email"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                    placeholder="guardian@example.com"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rank</label>
              <select
                value={rank}
                onChange={(e) => setRank(e.target.value)}
                aria-label="Rank"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                {RANKS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Status"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Training Hours</label>
              <input
                type="number"
                value={trainingHours}
                onChange={(e) => setTrainingHours(e.target.value)}
                aria-label="Training hours"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="0"
                step="1"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enrolled Date</label>
            <input
              type="date"
              value={enrolledDate}
              onChange={(e) => setEnrolledDate(e.target.value)}
              aria-label="Enrolled date"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              aria-label="Notes"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none dark:bg-gray-900 dark:text-gray-100"
              placeholder="Additional notes"
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CadetProgram() {
  const [cadets, setCadets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch cadets on mount
  useEffect(() => {
    const fetchCadets = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.get('/api/cadets');
        setCadets(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchCadets();
  }, []);

  // Calculate stats
  const stats = useMemo(() => {
    const total = cadets.length;
    const active = cadets.filter((c) => c.status === 'Active').length;
    const graduated = cadets.filter((c) => c.status === 'Graduated').length;
    const avgHours = total > 0 ? Math.round(cadets.reduce((sum, c) => sum + (c.training_hours || 0), 0) / total) : 0;

    return { total, active, graduated, avgHours };
  }, [cadets]);

  const handleCreate = () => {
    setEditTarget(null);
    setShowForm(true);
  };

  const handleEdit = (cadet) => {
    setEditTarget(cadet);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this cadet from the program?')) return;
    try {
      await api.delete(`/api/cadets/${id}`);
      setCadets((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSave = async () => {
    setShowForm(false);
    setEditTarget(null);
    // Refetch to reflect changes
    try {
      const data = await api.get('/api/cadets');
      setCadets(data || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditTarget(null);
  };

  if (loading) {
    return (
      <div className="w-full p-6 bg-gray-50 dark:bg-gray-950 rounded-lg">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame size={24} className="text-gray-700 dark:text-gray-300" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cadet Program</h1>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          Add Cadet
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Stats bar */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Total Cadets</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Active</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Graduated</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.graduated}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Avg Training Hours</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.avgHours}</p>
        </div>
      </div>

      {/* Cadets grid */}
      {cadets.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <Users size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No cadets enrolled yet</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
          {cadets.map((cadet) => (
            <CadetCard
              key={cadet.id}
              cadet={cadet}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <CadetForm
          cadet={editTarget}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
