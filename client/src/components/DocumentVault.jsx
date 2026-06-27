import { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen, Plus, Loader2, Trash2, ChevronDown, ChevronUp,
  FileText, Search, Filter, AlertTriangle, Clock, Tag,
  Eye, Edit, Lock, Users,
} from 'lucide-react';
import { api } from '../utils/api';

const CATEGORY_ICONS = {
  policy: FileText, procedure: FileText, sog: FileText, contract: Lock,
  cba: Lock, insurance: Lock, mutual_aid: Users, training: FileText,
};

function DocModal({ categories, docTypes, onSave, onClose }) {
  const [form, setForm] = useState({
    title: '', category: 'policy', doc_type: 'policy', description: '',
    version: '1.0', effective_date: '', review_date: '',
    content: '', tags: '', uploaded_by: '', access_level: 'all',
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Add Document</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
                {categories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Type</label>
              <select value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
                {docTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Version</label>
              <input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Content / Notes</label>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={4} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-mono text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Effective Date</label>
              <input type="date" value={form.effective_date}
                onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Review Date</label>
              <input type="date" value={form.review_date}
                onChange={e => setForm(f => ({ ...f, review_date: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Tags (comma-separated)</label>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" placeholder="safety, annual, nfpa" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Access Level</label>
              <select value={form.access_level} onChange={e => setForm(f => ({ ...f, access_level: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
                {['all', 'officers', 'chief_only'].map(l =>
                  <option key={l} value={l}>{l.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                )}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={() => {
            if (form.title) onSave({
              ...form,
              tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(t => t) : [],
            });
          }}
            disabled={!form.title}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 disabled:opacity-40">
            Save Document
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentVault() {
  const [docs, setDocs] = useState([]);
  const [stats, setStats] = useState({});
  const [categories, setCategories] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [expanded, setExpanded] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      let url = '/api/dept-documents';
      const params = [];
      if (filterCategory) params.push(`category=${filterCategory}`);
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      if (params.length) url += '?' + params.join('&');
      const [dRes, sRes, cRes] = await Promise.all([
        api.get(url),
        api.get('/api/dept-documents/stats'),
        api.get('/api/dept-documents/categories'),
      ]);
      const docs = Array.isArray(dRes?.data?.data) ? dRes.data.data : Array.isArray(dRes?.data) ? dRes.data : Array.isArray(dRes) ? dRes : [];
      const stats = sRes?.data && typeof sRes.data === 'object' ? sRes.data : typeof sRes === 'object' && !Array.isArray(sRes) ? sRes : {};
      const catObj = cRes?.data && typeof cRes.data === 'object' ? cRes.data : typeof cRes === 'object' && !Array.isArray(cRes) ? cRes : {};
      setDocs(docs);
      setStats(stats);
      setCategories(Array.isArray(catObj.categories) ? catObj.categories : []);
      setDocTypes(Array.isArray(catObj.doc_types) ? catObj.doc_types : []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally { setLoading(false); }
  }, [filterCategory, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate(form) {
    try { await api.post('/api/dept-documents', form); setShowModal(false); fetchData(); }
    catch (err) { alert(err.message || 'Failed'); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this document?')) return;
    try { await api.delete(`/api/dept-documents/${id}`); fetchData(); } catch (err) { alert('Failed'); }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="h-8 w-8 animate-spin mr-3" /><span className="text-sm">Loading…</span></div>;
  }

  // Group by category
  const byCategory = {};
  docs.forEach(d => {
    if (!byCategory[d.category]) byCategory[d.category] = [];
    byCategory[d.category].push(d);
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-red-700 dark:text-red-300" />
            Document Vault
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Department policies, contracts, SOGs, and compliance documents</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
          <Plus size={14} /> Add Document
        </button>
      </div>

      {(stats.reviewDue || 0) > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-700 dark:text-amber-300"><strong>{stats.reviewDue}</strong> document{stats.reviewDue !== 1 ? 's' : ''} due for review within 30 days</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Documents', value: stats.total || 0, icon: FileText, color: 'text-gray-700 dark:text-gray-300' },
          { label: 'Active', value: stats.active || 0, icon: FolderOpen, color: 'text-green-700 dark:text-green-300' },
          { label: 'Review Due', value: stats.reviewDue || 0, icon: Clock, color: (stats.reviewDue || 0) > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400' },
          { label: 'Categories', value: Object.keys(byCategory).length, icon: Tag, color: 'text-blue-700 dark:text-blue-300' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={14} className={s.color} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{s.label}</span>
            </div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…" aria-label="Search documents"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} aria-label="Filter by category"
          className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>)}
        </select>
      </div>

      {/* Documents grouped by category */}
      {Object.keys(byCategory).length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 text-center">
          <FolderOpen className="mx-auto h-8 w-8 text-gray-200 mb-2" />
          <p className="text-sm text-gray-400">No documents in vault</p>
        </div>
      ) : (
        Object.entries(byCategory).map(([cat, catDocs]) => (
          <div key={cat} className="space-y-2">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1">
              {cat.replace(/_/g, ' ')} ({catDocs.length})
            </p>
            {catDocs.map(d => {
              const isExpanded = expanded === d.id;
              const tags = typeof d.tags === 'string' ? JSON.parse(d.tags || '[]') : (d.tags || []);
              const Icon = CATEGORY_ICONS[d.category] || FileText;
              const isReviewDue = d.review_date && new Date(d.review_date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
              return (
                <div key={d.id} className={`bg-white dark:bg-gray-900 rounded-2xl border shadow-sm overflow-hidden ${isReviewDue ? 'border-amber-200 dark:border-amber-900' : 'border-gray-100 dark:border-gray-700'}`}>
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => setExpanded(isExpanded ? null : d.id)}
                    role="button" tabIndex={0} aria-label={`Toggle details for ${d.title}`} aria-expanded={isExpanded}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : d.id); } }}>
                    <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800"><Icon size={14} className="text-gray-600 dark:text-gray-300" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{d.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        v{d.version} · {(d.doc_type || '').replace(/_/g, ' ')}
                        {d.effective_date && ` · Effective ${d.effective_date}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isReviewDue && <AlertTriangle size={12} className="text-amber-500" />}
                      {d.access_level !== 'all' && <Lock size={12} className="text-gray-400" />}
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                  {isExpanded && (
                    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 space-y-2">
                      {d.description && <p className="text-sm text-gray-700 dark:text-gray-300">{d.description}</p>}
                      {d.content && (
                        <pre className="text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-100 dark:border-gray-700 overflow-x-auto max-h-48 whitespace-pre-wrap">{d.content}</pre>
                      )}
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div><p className="text-gray-400">Effective</p><p className="font-semibold">{d.effective_date || '—'}</p></div>
                        <div><p className="text-gray-400">Review Date</p><p className={`font-semibold ${isReviewDue ? 'text-amber-700 dark:text-amber-300' : ''}`}>{d.review_date || '—'}</p></div>
                        <div><p className="text-gray-400">Access</p><p className="font-semibold">{(d.access_level || '').replace(/_/g, ' ')}</p></div>
                      </div>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tags.map(t => <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">{t}</span>)}
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button onClick={e => { e.stopPropagation(); handleDelete(d.id); }}
                          className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 px-2 py-1 rounded">
                          <Trash2 size={11} /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}

      {showModal && <DocModal categories={categories} docTypes={docTypes} onSave={handleCreate} onClose={() => setShowModal(false)} />}
    </div>
  );
}
