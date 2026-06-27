import { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronRight, ShieldCheck, AlertTriangle, CheckCircle, Clock, X, UserCheck } from 'lucide-react';
import { api } from '../utils/api';

const API = import.meta.env.VITE_API_URL || '';
const POLICY_TYPES = ['sog','sop','policy','directive','memo','safety_bulletin','training_requirement','equipment_notice','code_of_conduct','other'];
const TYPE_LABELS = { sog:'SOG',sop:'SOP',policy:'Policy',directive:'Directive',memo:'Memo',safety_bulletin:'Safety Bulletin',training_requirement:'Training Req.',equipment_notice:'Equipment Notice',code_of_conduct:'Code of Conduct',other:'Other' };

function PolicyModal({ members, onSave, onClose, initial }) {
  const [f, setF] = useState(initial || { policy_title:'', policy_ref:'', policy_type:'sog', description:'', effective_date: new Date().toISOString().slice(0,10), review_date:'', required_by:[], total_required:0, created_by:'' });
  const [allMembers, setAllMembers] = useState([]);

  useEffect(() => {
    api.get('/api/members').then(raw => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setAllMembers(arr.filter(m => m.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);

  const toggleRequired = (id, name) => {
    const r = [...(f.required_by || [])];
    const idx = r.findIndex(x => x.id === id);
    idx >= 0 ? r.splice(idx, 1) : r.push({ id, name });
    setF({ ...f, required_by: r, total_required: idx >= 0 ? r.length : r.length });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-10 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg p-6 m-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{initial ? 'Edit Policy' : 'New Policy for Acknowledgment'}</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Policy title *" aria-label="Policy title" value={f.policy_title} onChange={e => setF({...f, policy_title: e.target.value})} />
          <div className="grid grid-cols-2 gap-3">
            <input className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Reference # (e.g. SOG-100)" aria-label="Reference number" value={f.policy_ref || ''} onChange={e => setF({...f, policy_ref: e.target.value})} />
            <select className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" aria-label="Policy type" value={f.policy_type} onChange={e => setF({...f, policy_type: e.target.value})}>
              {POLICY_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" rows={2} placeholder="Description" aria-label="Description" value={f.description || ''} onChange={e => setF({...f, description: e.target.value})} />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 dark:text-gray-400">Effective Date</label><input type="date" className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.effective_date || ''} onChange={e => setF({...f, effective_date: e.target.value})} /></div>
            <div><label className="text-xs text-gray-500 dark:text-gray-400">Review Date</label><input type="date" className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.review_date || ''} onChange={e => setF({...f, review_date: e.target.value})} /></div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Required Members ({(f.required_by||[]).length} selected)</p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {members.map(m => {
                const sel = (f.required_by||[]).some(r => r.id === m.id);
                return <button key={m.id} type="button" onClick={() => toggleRequired(m.id, m.name)}
                  className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${sel ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{m.name}</button>;
              })}
            </div>
            <button type="button" onClick={() => { const all = members.map(m => ({id:m.id, name:m.name})); setF({...f, required_by: all, total_required: all.length}); }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1">Select All</button>
          </div>
          <select className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" aria-label="Created by" value={f.created_by || ''} onChange={e => setF({...f, created_by: e.target.value})}>
            <option value="">— Select a member —</option>
            {allMembers.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
          <button onClick={() => f.policy_title && onSave({...f, total_required: (f.required_by||[]).length})} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}

export default function PolicyAcknowledgments({ user }) {
  const [policies, setPolicies] = useState([]);
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState({});
  const [modal, setModal] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = () => {
    fetch(`${API}/api/policy-acks`).then(r => r.json()).then(d => setPolicies(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`${API}/api/policy-acks/stats`).then(r => r.json()).then(setStats).catch(() => {});
    fetch(`${API}/api/members`).then(r => r.json()).then(d => setMembers(Array.isArray(d) ? d : [])).catch(() => {});
  };
  useEffect(load, []);

  const save = async (data) => {
    const method = data.id ? 'PATCH' : 'POST';
    const url = data.id ? `${API}/api/policy-acks/${data.id}` : `${API}/api/policy-acks`;
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setModal(null); load();
  };

  const acknowledge = async (policyId) => {
    if (!user) return;
    await fetch(`${API}/api/policy-acks/${policyId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acknowledge_member: { member_id: user.id || user.username, name: user.name } })
    });
    load();
  };

  const del = async (id) => {
    if (!confirm('Delete this policy?')) return;
    await fetch(`${API}/api/policy-acks/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Policy Acknowledgments</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track member sign-offs on SOGs, policies, and directives</p>
        </div>
        <button onClick={() => setModal({})} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">
          <Plus size={16} /> New Policy
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Policies', val: stats.totalActive || 0, icon: ShieldCheck, color: 'blue' },
          { label: 'Fully Acknowledged', val: stats.fullyAcknowledged || 0, icon: CheckCircle, color: 'green' },
          { label: 'Pending Sign-offs', val: stats.pendingAcknowledgments || 0, icon: AlertTriangle, color: 'amber' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${s.color}-50`}><s.icon size={18} className={`text-${s.color}-600`} /></div>
              <div><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.val}</p><p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p></div>
            </div>
          </div>
        ))}
      </div>

      {/* Policies List */}
      <div className="space-y-3">
        {policies.map(p => {
          const isOpen = expanded === p.id;
          const required = Array.isArray(p.required_by) ? p.required_by : [];
          const acknowledged = Array.isArray(p.acknowledged_by) ? p.acknowledged_by : [];
          const pct = required.length > 0 ? Math.round((acknowledged.length / required.length) * 100) : 0;
          const userAcked = acknowledged.some(a => a.member_id === (user?.id || user?.username));
          return (
            <div key={p.id} className="bg-white dark:bg-gray-900 rounded-xl border">
              <button onClick={() => setExpanded(isOpen ? null : p.id)} className="w-full flex items-center gap-3 p-4 text-left">
                {isOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{p.policy_title}</p>
                    {p.policy_ref && <span className="text-xs text-gray-400">{p.policy_ref}</span>}
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{TYPE_LABELS[p.policy_type] || p.policy_type}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex-1 max-w-xs bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct > 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{width: `${pct}%`}} />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{acknowledged.length}/{required.length} ({pct}%)</span>
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t pt-3">
                  {p.description && <p className="text-sm text-gray-600 dark:text-gray-300">{p.description}</p>}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-gray-500 dark:text-gray-400">Effective:</span> {p.effective_date ? new Date(p.effective_date).toLocaleDateString() : '—'}</div>
                    <div><span className="text-gray-500 dark:text-gray-400">Review:</span> {p.review_date ? new Date(p.review_date).toLocaleDateString() : '—'}</div>
                  </div>

                  {/* Acknowledgment status per member */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">MEMBER STATUS</p>
                    <div className="grid grid-cols-2 gap-1">
                      {required.map((r, i) => {
                        const acked = acknowledged.find(a => a.member_id === r.id);
                        return (
                          <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded-lg text-sm ${acked ? 'bg-green-50 dark:bg-green-950/50' : 'bg-red-50 dark:bg-red-950/50'}`}>
                            {acked ? <CheckCircle size={14} className="text-green-600 dark:text-green-400" /> : <Clock size={14} className="text-red-400" />}
                            <span className={acked ? 'text-green-800 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>{r.name}</span>
                            {acked && <span className="text-xs text-green-500 ml-auto">{new Date(acked.acknowledged_at).toLocaleDateString()}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    {!userAcked && user && (
                      <button onClick={() => acknowledge(p.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white hover:bg-green-700 rounded-lg font-medium">
                        <UserCheck size={14} /> I Acknowledge
                      </button>
                    )}
                    {userAcked && <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 rounded-lg font-medium"><CheckCircle size={14} /> You've acknowledged</span>}
                    <button onClick={() => setModal(p)} className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-medium">Edit</button>
                    <button onClick={() => del(p.id)} className="px-3 py-1.5 text-xs bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg font-medium">Delete</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {policies.length === 0 && <p className="text-center text-gray-400 py-12">No policies requiring acknowledgment</p>}
      </div>

      {modal && <PolicyModal members={members} initial={modal.id ? modal : null} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}
