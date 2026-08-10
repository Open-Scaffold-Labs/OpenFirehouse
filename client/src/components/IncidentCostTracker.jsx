import { useState, useEffect } from 'react';
import { Plus, DollarSign, FileText, AlertTriangle, ChevronDown, ChevronRight, Trash2, X, TrendingUp } from 'lucide-react';
import { localToday } from '../utils/localDay';
import useDialog from '../hooks/useDialog';

const API = import.meta.env.VITE_API_URL || '';
const PAYMENT_LABELS = { not_billed:'Not Billed', billed:'Billed', partial:'Partial', paid:'Paid', waived:'Waived', collections:'Collections' };
const PAYMENT_COLORS = { not_billed:'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300', billed:'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300', partial:'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300', paid:'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300', waived:'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400', collections:'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' };

function CostLineEditor({ label, items, onChange, placeholder }) {
  const addLine = () => onChange([...items, { description: '', quantity: 1, rate: 0, cost: 0 }]);
  const updateLine = (i, field, val) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: val };
    if (field === 'quantity' || field === 'rate') next[i].cost = (parseFloat(next[i].quantity) || 0) * (parseFloat(next[i].rate) || 0);
    onChange(next);
  };
  const removeLine = (i) => onChange(items.filter((_, j) => j !== i));
  const total = items.reduce((s, c) => s + (parseFloat(c.cost) || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</p>
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      </div>
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-12 gap-1.5 mb-1">
          <input className="col-span-5 border rounded px-2 py-1 text-xs dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" aria-label={`${label} description`} placeholder={placeholder} value={item.description} onChange={e => updateLine(i, 'description', e.target.value)} />
          <input className="col-span-2 border rounded px-2 py-1 text-xs text-right dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" type="number" aria-label="Quantity" placeholder="Qty" value={item.quantity} onChange={e => updateLine(i, 'quantity', e.target.value)} />
          <input className="col-span-2 border rounded px-2 py-1 text-xs text-right dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" type="number" step="0.01" aria-label="Rate" placeholder="Rate" value={item.rate} onChange={e => updateLine(i, 'rate', e.target.value)} />
          <span className="col-span-2 text-xs text-right py-1 font-medium">${(parseFloat(item.cost)||0).toFixed(2)}</span>
          <button onClick={() => removeLine(i)} aria-label="Remove cost line" className="col-span-1 text-red-400 hover:text-red-600 flex items-center justify-center"><Trash2 size={12} /></button>
        </div>
      ))}
      <button type="button" onClick={addLine} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">+ Add line</button>
    </div>
  );
}

function CostModal({ onSave, onClose, initial }) {
  // Dialog semantics + focus management (see hooks/useDialog.js). NO Escape-to-close.
  const dlg = useDialog();

  const [members, setMembers] = useState([]);
  const [f, setF] = useState(initial || {
    // localToday(), not toISOString() — the UTC day is tomorrow after 20:00 EDT.
    incident_number:'', incident_date: localToday(), incident_type:'', location:'',
    apparatus_costs:[], personnel_costs:[], material_costs:[], other_costs:[],
    billable: false, billed_to:'', notes:'', calculated_by:''
  });
  useEffect(() => {
    fetch('/api/members').then(r => r.json()).then(d => setMembers(d.data || [])).catch(() => {});
  }, []);

  const grandTotal = [f.apparatus_costs, f.personnel_costs, f.material_costs, f.other_costs]
    .flat().reduce((s, c) => s + (parseFloat(c.cost) || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-6 z-50 overflow-y-auto">
      <div {...dlg.dialogProps} className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl p-6 m-4">
        <div className="flex justify-between items-center mb-4">
          <h3 id={dlg.titleId} className="text-lg font-bold text-gray-900 dark:text-gray-100">{initial ? 'Edit Incident Cost' : 'New Incident Cost Report'}</h3>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-3">
            <input className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" aria-label="Incident number" placeholder="Incident # *" value={f.incident_number} onChange={e => setF({...f, incident_number: e.target.value})} />
            <input type="date" aria-label="Incident date" className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.incident_date} onChange={e => setF({...f, incident_date: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" aria-label="Incident type" placeholder="Incident type" value={f.incident_type} onChange={e => setF({...f, incident_type: e.target.value})} />
            <input className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" aria-label="Location" placeholder="Location" value={f.location} onChange={e => setF({...f, location: e.target.value})} />
          </div>

          <div className="space-y-3 border-t pt-3">
            <CostLineEditor label="APPARATUS COSTS" items={f.apparatus_costs||[]} onChange={v => setF({...f, apparatus_costs:v})} placeholder="Engine 14, Ladder 14..." />
            <CostLineEditor label="PERSONNEL COSTS" items={f.personnel_costs||[]} onChange={v => setF({...f, personnel_costs:v})} placeholder="Firefighter hours, OT..." />
            <CostLineEditor label="MATERIAL COSTS" items={f.material_costs||[]} onChange={v => setF({...f, material_costs:v})} placeholder="Foam, absorbent, hose..." />
            <CostLineEditor label="OTHER COSTS" items={f.other_costs||[]} onChange={v => setF({...f, other_costs:v})} placeholder="Mutual aid, rehab..." />
          </div>

          <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">GRAND TOTAL</span>
            <span className="text-xl font-bold text-gray-900 dark:text-gray-100">${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.billable} onChange={e => setF({...f, billable: e.target.checked})} className="rounded" />
              Billable incident
            </label>
            {f.billable && <input className="flex-1 border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" aria-label="Bill to" placeholder="Bill to (property owner, insurance...)" value={f.billed_to||''} onChange={e => setF({...f, billed_to: e.target.value})} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" aria-label="Calculated by" value={f.calculated_by||''} onChange={e => setF({...f, calculated_by: e.target.value})}>
              <option value="">— Select member —</option>
              {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank || 'N/A'}</option>)}
            </select>
            <textarea className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" rows={1} aria-label="Notes" placeholder="Notes" value={f.notes||''} onChange={e => setF({...f, notes: e.target.value})} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
          <button onClick={() => f.incident_number && onSave(f)} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Save Report</button>
        </div>
      </div>
    </div>
  );
}

export default function IncidentCostTracker() {
  const [costs, setCosts] = useState([]);
  const [stats, setStats] = useState({});
  const [modal, setModal] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = () => {
    fetch(`${API}/api/incident-costs`).then(r => r.json()).then(setCosts).catch(() => {});
    fetch(`${API}/api/incident-costs/stats`).then(r => r.json()).then(setStats).catch(() => {});
  };
  useEffect(load, []);

  const save = async (data) => {
    const method = data.id ? 'PATCH' : 'POST';
    const url = data.id ? `${API}/api/incident-costs/${data.id}` : `${API}/api/incident-costs`;
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setModal(null); load();
  };

  const del = async (id) => {
    if (!confirm('Delete this cost report?')) return;
    await fetch(`${API}/api/incident-costs/${id}`, { method: 'DELETE' });
    load();
  };

  const fmt = (n) => '$' + (parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Incident Cost Tracking</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Calculate and track per-incident costs for billing and budgeting</p>
        </div>
        <button onClick={() => setModal({})} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">
          <Plus size={16} /> New Cost Report
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Costs', val: fmt(stats.totalCosts), icon: DollarSign, color: 'blue' },
          { label: 'Year to Date', val: fmt(stats.yearToDate), icon: TrendingUp, color: 'green' },
          { label: 'Billable', val: `${stats.billableCount || 0} (${fmt(stats.billableTotal)})`, icon: FileText, color: 'amber' },
          { label: 'Unpaid', val: `${stats.unpaidCount || 0} (${fmt(stats.unpaidTotal)})`, icon: AlertTriangle, color: 'red' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${s.color}-50`}><s.icon size={18} className={`text-${s.color}-600`} /></div>
              <div><p className="text-lg font-bold text-gray-900 dark:text-gray-100">{s.val}</p><p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p></div>
            </div>
          </div>
        ))}
      </div>

      {/* Cost reports */}
      <div className="space-y-3">
        {costs.map(c => {
          const isOpen = expanded === c.id;
          const appCosts = Array.isArray(c.apparatus_costs) ? c.apparatus_costs : [];
          const persCosts = Array.isArray(c.personnel_costs) ? c.personnel_costs : [];
          const matCosts = Array.isArray(c.material_costs) ? c.material_costs : [];
          const othCosts = Array.isArray(c.other_costs) ? c.other_costs : [];
          return (
            <div key={c.id} className="bg-white dark:bg-gray-900 rounded-xl border">
              <button onClick={() => setExpanded(isOpen ? null : c.id)} className="w-full flex items-center gap-3 p-4 text-left">
                {isOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">#{c.incident_number}</p>
                    {c.incident_type && <span className="text-xs text-gray-500 dark:text-gray-400">{c.incident_type}</span>}
                    {c.billable && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">Billable</span>}
                    {c.payment_status && c.payment_status !== 'not_billed' && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_COLORS[c.payment_status]||''}`}>{PAYMENT_LABELS[c.payment_status]}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.incident_date ? new Date(c.incident_date).toLocaleDateString() : ''} · {c.location || ''} · <span className="font-bold text-gray-700 dark:text-gray-300">{fmt(c.total_cost)}</span></p>
                </div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(c.total_cost)}</p>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t pt-3">
                  {[
                    { label: 'Apparatus', items: appCosts, color: 'blue' },
                    { label: 'Personnel', items: persCosts, color: 'green' },
                    { label: 'Materials', items: matCosts, color: 'amber' },
                    { label: 'Other', items: othCosts, color: 'gray' },
                  ].filter(g => g.items.length > 0).map(g => (
                    <div key={g.label}>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{g.label.toUpperCase()}</p>
                      {g.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm py-0.5">
                          <span className="text-gray-700 dark:text-gray-300">{item.description || '(unnamed)'}</span>
                          <span className="text-gray-500 dark:text-gray-400">{item.quantity} × ${parseFloat(item.rate||0).toFixed(2)} = <span className="font-medium text-gray-800 dark:text-gray-100">{fmt(item.cost)}</span></span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {c.billable && c.billed_to && <p className="text-sm text-gray-600 dark:text-gray-300"><span className="font-medium">Billed to:</span> {c.billed_to}</p>}
                  {c.notes && <p className="text-sm text-gray-600 dark:text-gray-300"><span className="font-medium">Notes:</span> {c.notes}</p>}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setModal(c)} className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-medium">Edit</button>
                    <button onClick={() => del(c.id)} className="px-3 py-1.5 text-xs bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-lg font-medium">Delete</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {costs.length === 0 && <p className="text-center text-gray-400 py-12">No incident cost reports yet</p>}
      </div>

      {modal && <CostModal initial={modal.id ? modal : null} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}
