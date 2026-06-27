import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Edit2, Trash2, Star, X, AlertCircle, BookOpen,
  Calendar, User, Clock, ChevronDown, CheckCircle2,
} from 'lucide-react';
import { api } from '../utils/api';
import { getStoredUser } from '../utils/api';
import { markRead, isRead } from '../utils/bulletinReads';
import { useBulletinAlerts } from '../hooks/useBulletinAlerts';
import { ROLES, isBcPlus } from '../data/auth';

// ─── Constants ────────────────────────────────────────────────────────────────

// Full category list — includes original seeded categories + new ones
const CATEGORIES = [
  'General',
  'Operations',
  'Safety',
  'Training',
  'Meeting',
  'Policy',
  'Administrative',
  'Events',
  'Facilities',
  'Social',
  'Daily Notice',
];

const CATEGORY_COLORS = {
  General:        { bg: 'bg-gray-100 dark:bg-gray-800',   text: 'text-gray-700 dark:text-gray-300'   },
  Operations:     { bg: 'bg-blue-100 dark:bg-blue-950/50',   text: 'text-blue-700 dark:text-blue-300'   },
  Safety:         { bg: 'bg-red-100 dark:bg-red-950/50',    text: 'text-red-700 dark:text-red-300'    },
  Training:       { bg: 'bg-amber-100 dark:bg-amber-950/50',  text: 'text-amber-700 dark:text-amber-300'  },
  Meeting:        { bg: 'bg-indigo-100 dark:bg-indigo-950/50', text: 'text-indigo-700 dark:text-indigo-300' },
  Policy:         { bg: 'bg-purple-100 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-300' },
  Administrative: { bg: 'bg-slate-100',  text: 'text-slate-700'  },
  Events:         { bg: 'bg-green-100 dark:bg-green-950/50',  text: 'text-green-700 dark:text-green-300'  },
  Facilities:     { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-300' },
  Social:         { bg: 'bg-pink-100 dark:bg-pink-950/50',   text: 'text-pink-700 dark:text-pink-300'   },
  'Daily Notice': { bg: 'bg-rose-100 dark:bg-rose-950/50',   text: 'text-rose-700 dark:text-rose-300'   },
};

const PRIORITY_DOT = {
  normal:    '',
  important: 'text-amber-500',
  urgent:    'text-red-500',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Category Badge ───────────────────────────────────────────────────────────

function CategoryBadge({ category }) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.General;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors.bg} ${colors.text}`}>
      {category}
    </span>
  );
}

// ─── Bulletin Row (compact) ───────────────────────────────────────────────────

function BulletinRow({ bulletin, username, onEdit, onDelete, canEdit, autoExpand, onHighlightConsumed }) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(() => isRead(username, bulletin.id));

  // Auto-expand when navigated to from Notifications (marks read automatically)
  useEffect(() => {
    if (autoExpand && !open) {
      setOpen(true);
      if (!read) {
        markRead(username, bulletin.id);
        setRead(true);
      }
      onHighlightConsumed?.();
    }
  }, [autoExpand]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleOpen() {
    setOpen((v) => !v);
    if (!read) {
      markRead(username, bulletin.id);
      setRead(true);
    }
  }

  return (
    <div className={`border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${read ? '' : 'bg-blue-50/30'}`}>
      {/* ── Compact row ── */}
      <button
        onClick={handleOpen}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {/* Unread dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${read ? 'bg-transparent' : 'bg-blue-500'}`} />

        {/* Pinned star */}
        {bulletin.pinned && (
          <Star size={12} className="text-amber-500 fill-amber-500 flex-shrink-0" />
        )}

        {/* Priority indicator */}
        {bulletin.priority !== 'normal' && (
          <AlertCircle size={13} className={`flex-shrink-0 ${PRIORITY_DOT[bulletin.priority]}`} />
        )}

        {/* Date */}
        <span className="text-xs text-gray-400 flex-shrink-0 w-24 hidden sm:block">
          {fmtDate(bulletin.created_at)}
        </span>

        {/* Title */}
        <span className={`flex-1 text-sm truncate ${read ? 'text-gray-600 dark:text-gray-300' : 'font-bold text-gray-900 dark:text-gray-100'}`}>
          {bulletin.title}
        </span>

        {/* Category + Author */}
        <span className="flex items-center gap-2 flex-shrink-0 ml-2">
          <CategoryBadge category={bulletin.category} />
          <span className="text-xs text-gray-400 hidden md:block">{bulletin.author_name || 'Station'}</span>
        </span>

        <ChevronDown
          size={14}
          className={`text-gray-400 flex-shrink-0 ml-1 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div className="px-5 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900">
          {/* Meta row */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
            <span className="flex items-center gap-1">
              <User size={11} /> {bulletin.author_name || 'Station'}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} /> {fmtDate(bulletin.created_at)}
            </span>
            {bulletin.expires_at && (
              <span className="flex items-center gap-1">
                <Calendar size={11} /> Expires {fmtDate(bulletin.expires_at)}
              </span>
            )}
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 size={11} /> Marked as read
            </span>
          </div>

          {/* Body */}
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{bulletin.body}</p>

          {/* Edit / Delete actions for officers */}
          {canEdit && (
            <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(bulletin); }}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 px-2 py-1 rounded transition-colors"
              >
                <Edit2 size={11} /> Edit
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(bulletin.id); }}
                className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-950/50 px-2 py-1 rounded transition-colors"
              >
                <Trash2 size={11} /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Bulletin Form Modal ──────────────────────────────────────────────────────

function BulletinForm({ bulletin, onSave, onCancel }) {
  const [title,     setTitle]     = useState(bulletin?.title    || '');
  const [body,      setBody]      = useState(bulletin?.body     || '');
  const [category,  setCategory]  = useState(bulletin?.category || 'General');
  const [priority,  setPriority]  = useState(bulletin?.priority || 'normal');
  const [pinned,    setPinned]    = useState(bulletin?.pinned   || false);
  const [expiresAt, setExpiresAt] = useState(bulletin?.expires_at || '');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { setError('Title and body are required'); return; }
    setLoading(true);
    setError('');
    try {
      const payload = {
        title:      title.trim(),
        body:       body.trim(),
        category,
        priority,
        pinned,
        expires_at: expiresAt || null,
      };
      if (bulletin?.id) {
        await api.patch(`/api/bulletins/${bulletin.id}`, payload);
      } else {
        await api.post('/api/bulletins', payload);
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
            {bulletin ? 'Edit Bulletin' : 'New Bulletin'}
          </h2>
          <button onClick={onCancel} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
            <input
              type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              aria-label="Title"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
              placeholder="Bulletin title" disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body *</label>
            <textarea
              value={body} onChange={(e) => setBody(e.target.value)} rows={6}
              aria-label="Body"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none dark:bg-gray-900 dark:text-gray-100"
              placeholder="Bulletin content" disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
              <select
                value={category} onChange={(e) => setCategory(e.target.value)}
                aria-label="Category"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              {category === 'Daily Notice' && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                  Daily Notices appear on The Board for today's shift only.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
              <select
                value={priority} onChange={(e) => setPriority(e.target.value)}
                aria-label="Priority"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                <option value="normal">Normal</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expires At</label>
              <input
                type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                aria-label="Expires at"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 p-2 border border-gray-300 dark:border-gray-700 rounded-lg w-full cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)}
                  className="rounded" disabled={loading}
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Pin this bulletin</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button" onClick={onCancel} disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BulletinBoard({ highlightId, onHighlightConsumed }) {
  const [showForm,   setShowForm]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [error,      setError]      = useState('');
  const highlightRef = useRef(null);

  // Use shared cache — no extra fetch
  const { sortedBulletins: bulletins, loading, refresh } = useBulletinAlerts();

  const user     = getStoredUser();
  const username = user?.username || 'guest';
  // Only BC+ can post, edit, or delete bulletins (enforced client + server)
  const canEdit  = user && isBcPlus(user);

  // Scroll to and expand the highlighted bulletin when navigated from Notifications
  useEffect(() => {
    if (!highlightId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, bulletins]);

  const fetchBulletins = useCallback(async () => {
    setError('');
    try { await refresh(); } catch (err) { setError(err.message); }
  }, [refresh]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bulletin?')) return;
    try {
      await api.delete(`/api/bulletins/${id}`);
      await fetchBulletins();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSave = async () => {
    setShowForm(false);
    setEditTarget(null);
    await fetchBulletins();
  };

  // Count unread for header badge
  const unreadCount = bulletins.filter((b) => !isRead(username, b.id)).length;

  if (loading) {
    return (
      <div className="w-full p-6 bg-gray-50 dark:bg-gray-950 rounded-lg">
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 h-12 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen size={22} className="text-gray-700 dark:text-gray-300" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bulletin Board</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
              {unreadCount} unread
            </span>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} /> Post Bulletin
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {/* Bulletin list */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Column headers */}
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 hidden sm:flex items-center gap-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          <span className="w-2 ml-0.5 flex-shrink-0" />
          <span className="w-24 flex-shrink-0">Date</span>
          <span className="flex-1">Subject</span>
          <span className="flex-shrink-0">Category / Author</span>
          <span className="w-5 flex-shrink-0" />
        </div>

        {bulletins.length === 0 ? (
          <div className="p-10 text-center">
            <BookOpen size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No bulletins yet.</p>
          </div>
        ) : (
          bulletins.map((b) => {
            const isHighlighted = String(b.id) === String(highlightId);
            return (
              <div key={b.id} ref={isHighlighted ? highlightRef : null}>
                <BulletinRow
                  bulletin={b}
                  username={username}
                  onEdit={(bul) => { setEditTarget(bul); setShowForm(true); }}
                  onDelete={handleDelete}
                  canEdit={canEdit}
                  // Auto-expand if this is the bulletin navigated to from Notifications
                  autoExpand={isHighlighted}
                  onHighlightConsumed={onHighlightConsumed}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <BulletinForm
          bulletin={editTarget}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
