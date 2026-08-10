import { useState, useEffect, useCallback } from 'react';
import {
  Award, Plus, Trash2, X, Loader2, AlertTriangle, CheckCircle,
  Clock, Search, ChevronDown, ChevronUp, RefreshCw, Grid3X3,
} from 'lucide-react';
import { api } from '../utils/api';

// ── Add Qualification Modal ──────────────────────────────────────────────────

function AddQualModal({ members, certTypes, onSave, onClose }) {
  const [form, setForm] = useState({
    member_id: '',
    cert_type: '',
    cert_name: '',
    issued_date: '',
    expiry_date: '',
    issuing_authority: '',
    cert_number: '',
    notes: '',
  });

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, cert_name: form.cert_name || form.cert_type });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-red-700">
          <h2 className="text-base font-semibold text-white">Add Qualification</h2>
          <button onClick={onClose} aria-label="Close" className="text-red-200 hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Member *</label>
            <select
              value={form.member_id}
              onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}
              required
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Select member…</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Certification Type *</label>
            <select
              value={form.cert_type}
              onChange={e => setForm(f => ({ ...f, cert_type: e.target.value, cert_name: e.target.value }))}
              required
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Select cert type…</option>
              {certTypes.map(ct => <option key={ct} value={ct}>{ct}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Issued Date</label>
              <input type="date" value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expiry Date</label>
              <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Issuing Authority</label>
              <input type="text" value={form.issuing_authority} onChange={e => setForm(f => ({ ...f, issuing_authority: e.target.value }))}
                placeholder="e.g. NJ DFS" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cert Number</label>
              <input type="text" value={form.cert_number} onChange={e => setForm(f => ({ ...f, cert_number: e.target.value }))}
                placeholder="Optional" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm resize-none dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
              Add Qualification
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function QualificationsManager() {
  const [quals, setQuals] = useState([]);
  const [members, setMembers] = useState([]);
  const [certTypes, setCertTypes] = useState([]);
  const [matrix, setMatrix] = useState(null);
  const [expiring, setExpiring] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list'); // list | matrix | expiring
  const [filterMember, setFilterMember] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [qRes, mRes, ctRes] = await Promise.all([
        api.get('/api/qualifications'),
        api.get('/api/members'),
        api.get('/api/qualifications/cert-types'),
      ]);
      setQuals(Array.isArray(qRes.data) ? qRes.data : Array.isArray(qRes) ? qRes : []);
      const mArr = Array.isArray(mRes.data) ? mRes.data : Array.isArray(mRes) ? mRes : [];
      setMembers(mArr.filter(m => m.status === 'Active' || m.status === 'Probationary'));
      setCertTypes(Array.isArray(ctRes.data) ? ctRes.data : Array.isArray(ctRes) ? ctRes : []);
    } catch (err) {
      console.error('Failed to load qualifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMatrix = useCallback(async () => {
    try {
      const res = await api.get('/api/qualifications/matrix');
      setMatrix(res.data || res);
    } catch (err) {
      console.error('Failed to load matrix:', err);
    }
  }, []);

  const fetchExpiring = useCallback(async () => {
    try {
      const res = await api.get('/api/qualifications/expiring?days=90');
      setExpiring(res.data || res);
    } catch (err) {
      console.error('Failed to load expiring:', err);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (view === 'matrix') fetchMatrix(); }, [view, fetchMatrix]);
  useEffect(() => { if (view === 'expiring') fetchExpiring(); }, [view, fetchExpiring]);

  async function handleAdd(formData) {
    try {
      await api.post('/api/qualifications', formData);
      await fetchData();
      if (view === 'matrix') fetchMatrix();
    } catch (err) {
      alert(err.message || 'Failed to add qualification');
    }
    setAddOpen(false);
  }

  async function handleDelete(id) {
    if (!confirm('Remove this qualification?')) return;
    try {
      await api.delete(`/api/qualifications/${id}`);
      setQuals(prev => prev.filter(q => q.id !== id));
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const filtered = quals.filter(q => {
    const matchSearch = !search || q.member_name?.toLowerCase().includes(search.toLowerCase()) || q.cert_type?.toLowerCase().includes(search.toLowerCase());
    const matchMember = !filterMember || q.member_id === parseInt(filterMember);
    return matchSearch && matchMember;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading qualifications…</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Award className="h-6 w-6 text-red-700 dark:text-red-300" />
            Qualifications & Certifications
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{quals.length} qualification{quals.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <div className="flex gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            {[
              { id: 'list', label: 'List' },
              { id: 'matrix', label: 'Matrix' },
              { id: 'expiring', label: 'Expiring' },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  view === v.id ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>{v.label}</button>
            ))}
          </div>
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700">
            <Plus size={15} /> Add Qualification
          </button>
        </div>
      </div>

      {/* ── List View ── */}
      {view === 'list' && (
        <>
          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search member or cert type…" aria-label="Search qualifications"
                className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100" />
            </div>
            <select value={filterMember} onChange={e => setFilterMember(e.target.value)} aria-label="Filter by member"
              className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
              <option value="">All Members</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_0.5fr] gap-3 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <span>Member</span>
              <span>Certification</span>
              <span>Issued</span>
              <span>Expires</span>
              <span>Authority</span>
              <span />
            </div>
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">No qualifications found.</p>
            ) : (
              filtered.map(q => {
                const expired = q.expiry_date && q.expiry_date < today;
                const expiringSoon = q.expiry_date && !expired && q.expiry_date < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                return (
                  <div key={q.id} className={`grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_0.5fr] gap-3 px-5 py-3 border-b border-gray-50 items-center ${
                    expired ? 'bg-red-50 dark:bg-red-950/50' : expiringSoon ? 'bg-amber-50 dark:bg-amber-950/50' : ''
                  }`}>
                    <div>
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{q.member_name}</p>
                      <p className="text-[10px] text-gray-400">{q.member_rank}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Award size={12} className={expired ? 'text-red-500' : expiringSoon ? 'text-amber-500' : 'text-green-500'} />
                      <span className="text-xs font-medium text-gray-800 dark:text-gray-100">{q.cert_type}</span>
                    </div>
                    <span className="text-xs text-gray-600 dark:text-gray-300">{q.issued_date || '—'}</span>
                    <span className={`text-xs font-medium ${expired ? 'text-red-700 dark:text-red-300' : expiringSoon ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-300'}`}>
                      {q.expiry_date || 'No expiry'}
                      {expired && <span className="ml-1 text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/50 px-1 py-0.5 rounded">EXPIRED</span>}
                      {expiringSoon && <span className="ml-1 text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/50 px-1 py-0.5 rounded">SOON</span>}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{q.issuing_authority || '—'}</span>
                    <button onClick={() => handleDelete(q.id)}
                      aria-label="Delete qualification"
                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50">
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ── Matrix View ── */}
      {view === 'matrix' && matrix && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-x-auto">
          <div className="px-5 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <Grid3X3 size={14} className="text-red-700 dark:text-red-300" />
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Certification Matrix</p>
            <span className="text-xs text-gray-400 ml-2">{matrix.members?.length || 0} members × {matrix.certTypes?.length || 0} cert types</span>
          </div>
          {(!matrix.certTypes || matrix.certTypes.length === 0) ? (
            <div className="px-5 py-12 text-center">
              <Award className="mx-auto h-8 w-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No certifications recorded yet</p>
              <p className="text-xs text-gray-400 mt-1">Add qualifications to see the matrix</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="px-3 py-2 text-left font-bold text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-900 z-10 min-w-[150px]">Member</th>
                    {matrix.certTypes.map(ct => (
                      <th key={ct} className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400 min-w-[80px]">
                        <span className="block truncate max-w-[80px]" title={ct}>{ct}</span>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-bold text-gray-600 dark:text-gray-300">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.members?.map(m => (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-3 py-2 font-semibold text-gray-800 dark:text-gray-100 sticky left-0 bg-white dark:bg-gray-900 z-10">
                        {m.name}
                        <span className="block text-[10px] text-gray-400 font-normal">{m.rank}</span>
                      </td>
                      {matrix.certTypes.map(ct => {
                        const cert = m.certs[ct];
                        if (!cert?.held) return <td key={ct} className="px-2 py-2 text-center text-gray-300 dark:text-gray-600">—</td>;
                        return (
                          <td key={ct} className={`px-2 py-2 text-center ${
                            cert.expired ? 'bg-red-50 dark:bg-red-950/50' : cert.expiring_soon ? 'bg-amber-50 dark:bg-amber-950/50' : 'bg-green-50 dark:bg-green-950/50'
                          }`}>
                            <CheckCircle size={12} className={`mx-auto ${
                              cert.expired ? 'text-red-500' : cert.expiring_soon ? 'text-amber-500' : 'text-green-500'
                            }`} />
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center font-bold text-gray-700 dark:text-gray-300">{m.certCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-5 py-2 border-t border-gray-100 dark:border-gray-700 flex gap-4 text-[10px] text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><CheckCircle size={10} className="text-green-500" /> Active</span>
            <span className="flex items-center gap-1"><CheckCircle size={10} className="text-amber-500" /> Expiring &lt;90d</span>
            <span className="flex items-center gap-1"><CheckCircle size={10} className="text-red-500" /> Expired</span>
            <span>— Not held</span>
          </div>
        </div>
      )}

      {/* ── Expiring View ── */}
      {view === 'expiring' && expiring && (
        <div className="space-y-4">
          {expiring.expired?.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-red-200 dark:border-red-900 flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-600 dark:text-red-400" />
                <p className="text-sm font-bold text-red-800 dark:text-red-300">Expired ({expiring.expired.length})</p>
              </div>
              {expiring.expired.map(q => (
                <div key={q.id} className="px-5 py-3 border-b border-red-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{q.member_name} — {q.cert_type}</p>
                    <p className="text-[10px] text-red-600 dark:text-red-400">Expired {q.expiry_date}</p>
                  </div>
                  <span className="text-[9px] font-bold text-red-700 dark:text-red-300 bg-red-200 dark:bg-red-900 px-2 py-0.5 rounded-full">EXPIRED</span>
                </div>
              ))}
            </div>
          )}

          {expiring.expiringSoon?.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-200 dark:border-amber-900 flex items-center gap-2">
                <Clock size={14} className="text-amber-600 dark:text-amber-400" />
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Expiring Within {expiring.days_ahead ?? 90} Days ({expiring.expiringSoon.length})</p>
              </div>
              {expiring.expiringSoon.map(q => (
                <div key={q.id} className="px-5 py-3 border-b border-amber-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{q.member_name} — {q.cert_type}</p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">Expires {q.expiry_date}</p>
                  </div>
                  <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-200 dark:bg-amber-900 px-2 py-0.5 rounded-full">
                    {Math.ceil((new Date(q.expiry_date) - new Date()) / (24 * 60 * 60 * 1000))}d
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* A cert whose expiry date we cannot read is not current and not
              expired — it is a record somebody has to go fix. It used to fail
              the SQL date comparison and drop out of this report entirely, so
              a typo'd date made the certification INVISIBLE instead of
              flagging it. It gets its own panel, above the all-clear. */}
          {expiring.unreadable?.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <AlertTriangle size={14} className="text-gray-500 dark:text-gray-400" />
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  Expiry date unreadable ({expiring.unreadable.length})
                </p>
              </div>
              <p className="px-5 pt-3 text-[11px] text-gray-600 dark:text-gray-400">
                These certifications have an expiry date that isn't a valid
                calendar date, so they can't be checked. Correct the date to
                include them in the report.
              </p>
              {expiring.unreadable.map(q => (
                <div key={q.id} className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{q.member_name} — {q.cert_type}</p>
                  <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                    {q.expiry_date || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* The all-clear is only honest when there is nothing outstanding in
              ANY bucket. Claiming "all current" while unreadable rows sit
              unchecked would be asserting a status we did not read. */}
          {(!expiring.expired?.length && !expiring.expiringSoon?.length
            && !expiring.unreadable?.length) && (
            <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-xl px-5 py-8 text-center">
              <CheckCircle className="mx-auto h-8 w-8 text-green-400 mb-2" />
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">All certifications current</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Nothing expired or expiring in the next {expiring.days_ahead ?? 90} days
              </p>
            </div>
          )}
        </div>
      )}

      {/* Add Modal */}
      {addOpen && (
        <AddQualModal
          members={members}
          certTypes={certTypes}
          onSave={handleAdd}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}
