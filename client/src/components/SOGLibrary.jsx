import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, Search, ChevronDown, ChevronUp,
  Edit2, Trash2, ArrowLeft, Tag, Calendar, User,
  FileText, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import {
  SOG_CATEGORIES, SOG_STATUSES,
  STATUS_COLORS, CATEGORY_COLORS,
} from '../data/sogs';
import { api } from '../utils/api';
import SOGForm from './SOGForm';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

// ─── helpers ──────────────────────────────────────────────────────────────────

function reviewStatus(sog) {
  if (!sog.reviewDate || sog.status === 'Superseded' || sog.status === 'Draft') return null;
  const today = new Date();
  const review = new Date(sog.reviewDate);
  const diffDays = Math.round((review - today) / 86400000);
  if (diffDays < 0)  return { label: 'Overdue',    color: 'text-red-600 dark:text-red-400',   bg: 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900' };
  if (diffDays <= 90) return { label: 'Due Soon',   color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900' };
  return null;
}

function fmt(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function SOGDetail({ sog, onBack, onEdit, onDelete }) {
  const rev = reviewStatus(sog);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-red-700 transition-colors font-medium">
        <ArrowLeft size={16} /> Back to Library
      </button>

      {/* Header card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold text-gray-400">{sog.number}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[sog.status]}`}>
                {sog.status}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[sog.category] ?? 'bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
                {sog.category}
              </span>
              {rev && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${rev.bg} ${rev.color}`}>
                  <AlertTriangle size={11} />
                  Review {rev.label}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{sog.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">{sog.summary}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => onEdit(sog)}
              aria-label="Edit SOG"
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors">
              <Edit2 size={16} />
            </button>
            <button onClick={() => onDelete(sog.id)}
              aria-label="Delete SOG"
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
          <MetaItem icon={FileText} label="Version" value={`v${sog.version}`} />
          <MetaItem icon={Calendar} label="Effective" value={fmt(sog.effectiveDate)} />
          <MetaItem icon={Calendar} label="Next Review" value={fmt(sog.reviewDate)}
            valueClass={rev ? rev.color + ' font-semibold' : ''} />
          <MetaItem icon={Calendar} label="Last Reviewed" value={fmt(sog.lastReviewedDate)} />
          <MetaItem icon={User} label="Author" value={sog.author ?? '—'} />
          <MetaItem icon={CheckCircle2} label="Approved By" value={sog.approvedBy ?? '—'} />
        </div>

        {/* Tags */}
        {sog.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {sog.tags.map((tag) => (
              <span key={tag}
                className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-0.5">
                <Tag size={10} /> {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Full content */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
          <BookOpen size={15} className="text-red-600 dark:text-red-400" /> Policy Content
        </h3>
        {sog.status === 'Draft' && (
          <div className="mb-4 flex items-center gap-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
              This document is a DRAFT and has not been formally approved. Do not use for operational guidance.
            </p>
          </div>
        )}
        {sog.status === 'Under Review' && (
          <div className="mb-4 flex items-center gap-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
            <Clock size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
              This document is currently Under Review. Verify applicability with your officer before relying on this version.
            </p>
          </div>
        )}
        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-sans">
          {sog.content}
        </pre>

        {/* Linked Meetings */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
          <LinkedMeetings module="sogs" recordId={sog.id} recordLabel={sog.title || sog.number} />
          <Attachments module="sogs" recordId={sog.id} recordLabel={sog.title || sog.number} />
        </div>
      </div>
    </div>
  );
}

function MetaItem({ icon: Icon, label, value, valueClass = '' }) {
  return (
    <div>
      <p className="text-xs text-gray-400 flex items-center gap-1 mb-0.5">
        <Icon size={11} /> {label}
      </p>
      <p className={`text-sm font-medium text-gray-800 dark:text-gray-100 ${valueClass}`}>{value}</p>
    </div>
  );
}

// ─── SOG Card ─────────────────────────────────────────────────────────────────

function SOGCard({ sog, onClick }) {
  const rev = reviewStatus(sog);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-red-200 transition-all p-5 group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="text-xs font-mono font-bold text-gray-400">{sog.number}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[sog.status]}`}>
              {sog.status}
            </span>
          </div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 group-hover:text-red-700 transition-colors leading-snug">
            {sog.title}
          </h3>
        </div>
        <ChevronDown size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-red-400 flex-shrink-0 mt-1 transition-colors" />
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed mb-3">
        {sog.summary}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[sog.category] ?? 'bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          {sog.category}
        </span>
        <span className="text-xs text-gray-400">v{sog.version}</span>
        {rev && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 ${rev.color}`}>
            <AlertTriangle size={11} /> Review {rev.label}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SOGLibrary() {
  const [sogs,      setSOGs]     = useState([]);
  const [loading,   setLoading]  = useState(true);
  const [view,      setView]     = useState('library'); // 'library' | 'detail'
  const [selected,  setSelected] = useState(null);
  const [search,    setSearch]   = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showForm,  setShowForm] = useState(false);
  const [editing,   setEditing]  = useState(null);
  const [collapseSignal, setCollapseSignal] = useState(0);

  const fetchSOGs = useCallback(async () => {
    try {
      const res = await api.get('/api/sogs');
      setSOGs(res.data);
    } catch (e) {
      console.error('Failed to fetch SOGs', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSOGs(); }, [fetchSOGs]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total      = sogs.length;
    const active     = sogs.filter((s) => s.status === 'Active').length;
    const overdue    = sogs.filter((s) => reviewStatus(s)?.label === 'Overdue').length;
    const dueSoon    = sogs.filter((s) => reviewStatus(s)?.label === 'Due Soon').length;
    const underReview = sogs.filter((s) => s.status === 'Under Review').length;
    const draft      = sogs.filter((s) => s.status === 'Draft').length;
    return { total, active, overdue, dueSoon, underReview, draft };
  }, [sogs]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sogs.filter((s) => {
      const matchCat    = catFilter === 'All' || s.category === catFilter;
      const matchStatus = statusFilter === 'All' || s.status === statusFilter;
      const matchSearch = !q || [s.number, s.title, s.summary, ...(s.tags ?? [])]
        .join(' ').toLowerCase().includes(q);
      return matchCat && matchStatus && matchSearch;
    });
  }, [sogs, catFilter, statusFilter, search]);

  // ── Group by category ──────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((s) => {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    });
    return map;
  }, [filtered]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function openDetail(sog) {
    setSelected(sog);
    setView('detail');
  }

  async function handleSave(data) {
    try {
      if (data.id) {
        const res = await api.patch(`/api/sogs/${data.id}`, data);
        setSOGs((prev) => prev.map((s) => (s.id === data.id ? res.data : s)));
        if (selected?.id === data.id) setSelected(res.data);
      } else {
        const res = await api.post('/api/sogs', data);
        setSOGs((prev) => [...prev, res.data]);
      }
    } catch (e) { console.error('Failed to save SOG', e); }
    setShowForm(false);
    setEditing(null);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this SOG/policy? This cannot be undone.')) return;
    try {
      await api.delete(`/api/sogs/${id}`);
      setSOGs((prev) => prev.filter((s) => s.id !== id));
      setView('library');
      setSelected(null);
    } catch (e) { console.error('Failed to delete SOG', e); }
  }

  function openEdit(sog) {
    setEditing(sog);
    setShowForm(true);
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  if (view === 'detail' && selected) {
    return (
      <div className="p-6">
        <SOGDetail
          sog={selected}
          onBack={() => setView('library')}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
        {showForm && (
          <SOGForm
            record={editing}
            onSave={handleSave}
            onClose={() => { setShowForm(false); setEditing(null); }}
          />
        )}
      </div>
    );
  }

  // ── Library view ───────────────────────────────────────────────────────────
  if (loading) return <div className="p-6 text-sm text-gray-400">Loading SOG library…</div>;

  return (
    <div className="p-6 space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">SOG / Policy Library</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Standard Operating Guidelines &amp; Department Policies</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 transition-colors shadow-sm"
        >
          <Plus size={16} /> Add SOG
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total SOGs"     value={stats.total}       color="text-gray-900 dark:text-gray-100" />
        <StatCard label="Active"         value={stats.active}      color="text-green-700 dark:text-green-300" />
        <StatCard label="Review Overdue" value={stats.overdue}     color="text-red-600 dark:text-red-400" />
        <StatCard label="Due Within 90d" value={stats.dueSoon}     color="text-amber-600 dark:text-amber-400" />
        <StatCard label="Under Review"   value={stats.underReview} color="text-amber-700 dark:text-amber-300" />
        <StatCard label="Drafts"         value={stats.draft}       color="text-gray-500 dark:text-gray-400" />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100"
            placeholder="Search by number, title, keyword, or tag…"
            aria-label="Search SOGs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-2">
          {['All', ...SOG_STATUSES].map((s) => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                statusFilter === s
                  ? 'bg-red-700 text-white border-red-700'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCatFilter('All')}
            className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
              catFilter === 'All'
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
            }`}
          >
            All Categories
          </button>
          {SOG_CATEGORIES.map((c) => (
            <button key={c}
              onClick={() => setCatFilter(c)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                catFilter === c
                  ? `${CATEGORY_COLORS[c]} font-bold`
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Results count + Collapse All */}
      <div className="flex items-center justify-between -mt-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing {filtered.length} of {sogs.length} policies
          {catFilter !== 'All' ? ` · ${catFilter}` : ''}
          {statusFilter !== 'All' ? ` · ${statusFilter}` : ''}
        </p>
        <button onClick={() => setCollapseSignal(s => s + 1)}
          className="text-xs text-gray-400 hover:text-gray-600 underline">
          Collapse All
        </button>
      </div>

      {/* SOG grid grouped by category */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No policies match your filters.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <CategoryGroup key={category} category={category} items={items} onSelect={openDetail} collapseSignal={collapseSignal} />
        ))
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <SOGForm
          record={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function CategoryGroup({ category, items, onSelect, collapseSignal }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (collapseSignal) setOpen(false);
  }, [collapseSignal]);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full group"
      >
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${CATEGORY_COLORS[category] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          {category}
        </span>
        <span className="text-xs text-gray-400">({items.length})</span>
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors" />
        {open
          ? <ChevronUp size={14} className="text-gray-400" />
          : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((sog) => (
            <SOGCard key={sog.id} sog={sog} onClick={() => onSelect(sog)} />
          ))}
        </div>
      )}
    </div>
  );
}
