/**
 * ResourceTracker.jsx — Multi-Agency Resource Tracking Panel
 *
 * Shows ALL resources responding to the incident — fire, EMS, law, utility.
 * Displays on the Command Board alongside the ICS org chart and units.
 * Integrates with mutual aid agreements for auto-populated contact info.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Truck, Heart, Shield, Wrench, Radio, MapPin,
  Loader2, Phone, Clock, ChevronDown, ChevronUp, Share2,
  AlertTriangle, CheckCircle, Users,
} from 'lucide-react';
import { api } from '../utils/api';

const RESOURCE_TYPES = [
  { value: 'fire', label: 'Fire', icon: Truck, color: 'red' },
  { value: 'ems', label: 'EMS', icon: Heart, color: 'green' },
  { value: 'law', label: 'Law Enforcement', icon: Shield, color: 'blue' },
  { value: 'utility', label: 'Utility', icon: Wrench, color: 'amber' },
  { value: 'hazmat', label: 'Hazmat', icon: AlertTriangle, color: 'purple' },
  { value: 'other', label: 'Other', icon: Users, color: 'gray' },
];

const STATUS_COLORS = {
  dispatched: 'bg-gray-500 text-white',
  en_route:   'bg-blue-600 text-white',
  staging:    'bg-yellow-500 text-white',
  on_scene:   'bg-green-600 text-white',
  committed:  'bg-orange-600 text-white',
  cleared:    'bg-gray-400 text-white',
};

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100';

// ─── Add Resource Form ───────────────────────────────────────────────────────

function AddResourceForm({ onClose, onSaved, agreements }) {
  const [form, setForm] = useState({
    resource_type: 'fire', agency: '', unit_designation: '', unit_type: '',
    status: 'dispatched', eta_minutes: '', crew_count: '', officer_name: '',
    radio_channel: '', contact_phone: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [useAgreement, setUseAgreement] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function selectAgreement(ag) {
    setUseAgreement(ag);
    set('agency', ag.partner_agency);
    set('contact_phone', ag.partner_phone || '');
    set('eta_minutes', ag.response_time_min || '');
  }

  async function handleSave() {
    if (!form.unit_designation && !form.agency) return;
    setSaving(true);
    try {
      if (useAgreement) {
        await api.post('/api/active-resources/request', {
          ...form, mutual_aid_agreement_id: useAgreement.id,
        });
      } else {
        await api.post('/api/active-resources', form);
      }
      onSaved();
      onClose();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">Add Resource</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          {/* Quick-add from agreements */}
          {agreements.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Quick Add from Mutual Aid Agreement</p>
              <div className="flex flex-wrap gap-1">
                {agreements.map(ag => (
                  <button key={ag.id} onClick={() => selectAgreement(ag)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                      useAgreement?.id === ag.id ? 'bg-red-100 dark:bg-red-950/50 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300' : 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {ag.partner_agency}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Resource Type</label>
              <select className={INPUT} value={form.resource_type} onChange={e => set('resource_type', e.target.value)}>
                {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Agency / Department</label>
              <input className={INPUT} value={form.agency} onChange={e => set('agency', e.target.value)} placeholder="Springfield FD" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Unit Designation</label>
              <input className={INPUT} value={form.unit_designation} onChange={e => set('unit_designation', e.target.value)} placeholder="Engine 3" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Unit Type</label>
              <input className={INPUT} value={form.unit_type} onChange={e => set('unit_type', e.target.value)} placeholder="Engine, Truck, Rescue" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">ETA (min)</label>
              <input type="number" className={INPUT} value={form.eta_minutes} onChange={e => set('eta_minutes', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Crew Count</label>
              <input type="number" className={INPUT} value={form.crew_count} onChange={e => set('crew_count', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Radio Channel</label>
              <input className={INPUT} value={form.radio_channel} onChange={e => set('radio_channel', e.target.value)} placeholder="Tac 2" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Contact Phone</label>
            <input className={INPUT} value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-red-700 text-white font-bold text-sm rounded-xl hover:bg-red-800 disabled:opacity-50 flex items-center justify-center gap-1">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Resource
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Resource Card ───────────────────────────────────────────────────────────

function ResourceCard({ r, onStatusChange, onRemove }) {
  const typeInfo = RESOURCE_TYPES.find(t => t.value === r.resource_type) || RESOURCE_TYPES[5];
  const Icon = typeInfo.icon;
  const statusCls = STATUS_COLORS[r.status] || STATUS_COLORS.dispatched;

  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 bg-gray-50 dark:bg-gray-950 border border-transparent hover:border-gray-200 transition-all text-xs">
      <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-${typeInfo.color}-100`}>
        <Icon size={12} className={`text-${typeInfo.color}-600`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-gray-900 dark:text-gray-100 truncate">{r.unit_designation}</p>
          {r.agency && <span className="text-gray-400 truncate">— {r.agency}</span>}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
          {r.eta_minutes && r.status !== 'on_scene' && <span className="flex items-center gap-0.5"><Clock size={9} /> ETA {r.eta_minutes}m</span>}
          {r.crew_count > 0 && <span>{r.crew_count} crew</span>}
          {r.radio_channel && <span className="flex items-center gap-0.5"><Radio size={9} /> {r.radio_channel}</span>}
        </div>
      </div>
      <select
        value={r.status}
        onChange={e => onStatusChange(r.id, e.target.value)}
        aria-label={`Status of ${r.unit_designation || 'resource'}`}
        className={`text-[10px] font-bold px-2 py-1 rounded-full border-0 ${statusCls} cursor-pointer`}
      >
        <option value="dispatched">Dispatched</option>
        <option value="en_route">En Route</option>
        <option value="staging">Staging</option>
        <option value="on_scene">On Scene</option>
        <option value="committed">Committed</option>
        <option value="cleared">Cleared</option>
      </select>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ResourceTracker({ compact = false }) {
  const [resources, setResources] = useState([]);
  const [summary, setSummary] = useState(null);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    try {
      const [resData, agData] = await Promise.all([
        api.get('/api/active-resources'),
        api.get('/api/mutual-aid-agreements').catch(() => ({ data: [] })),
      ]);
      setResources(resData.data || []);
      setSummary(resData.summary || null);
      setAgreements((agData.data || []).filter(a => a.status === 'active'));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Auto-refresh every 10 seconds
  useEffect(() => { const id = setInterval(load, 10000); return () => clearInterval(id); }, [load]);

  async function updateStatus(id, status) {
    try { await api.patch(`/api/active-resources/${id}`, { status }); load(); } catch (e) { console.error(e); }
  }
  async function removeResource(id) {
    try { await api.delete(`/api/active-resources/${id}`); load(); } catch (e) { console.error(e); }
  }

  if (loading) return <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800">
        <MapPin size={14} className="text-cyan-600 dark:text-cyan-400" />
        <span className="text-xs font-black text-gray-900 dark:text-gray-100 flex-1">All Resources</span>
        {summary && (
          <div className="flex gap-1.5 text-[10px] font-bold">
            {summary.fire > 0 && <span className="text-red-600 dark:text-red-400">{summary.fire} Fire</span>}
            {summary.ems > 0 && <span className="text-green-600 dark:text-green-400">{summary.ems} EMS</span>}
            {summary.law > 0 && <span className="text-blue-600 dark:text-blue-400">{summary.law} Law</span>}
            {summary.utility > 0 && <span className="text-amber-600 dark:text-amber-400">{summary.utility} Util</span>}
            <span className="text-gray-400">| {summary.onScene} on scene</span>
          </div>
        )}
        {expanded ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2 space-y-1.5">
          {resources.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">No external resources tracked yet</p>
          ) : (
            resources.map(r => (
              <ResourceCard key={r.id} r={r} onStatusChange={updateStatus} onRemove={removeResource} />
            ))
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowAdd(true)} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-red-700 dark:text-red-300 hover:text-red-800 py-1.5 bg-red-50 dark:bg-red-950/50 rounded-lg">
              <Plus size={12} /> Add Resource
            </button>
            <button onClick={async () => {
              try {
                const r = await api.post('/api/live-share', {
                  unit_designation: 'Inbound Aid',
                  department_name: 'Requesting inbound mutual aid',
                  destination_address: '',
                  status: 'pending',
                });
                const token = r.token || r.data?.token;
                const base = window.location.origin;
                const respondUrl = `${base}/respond/${token}`;
                const body = encodeURIComponent(`Maplewood VFD requesting mutual aid. Open this link to share your location with our IC: ${respondUrl}`);
                if (navigator.clipboard) {
                  await navigator.clipboard.writeText(respondUrl);
                  alert(`Respond link copied! Text it to the incoming agency:\n\n${respondUrl}`);
                }
                window.open(`sms:?body=${body}`, '_blank');
              } catch (e) { console.error(e); alert('Failed to create respond link'); }
            }} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300 hover:text-blue-800 py-1.5 bg-blue-50 dark:bg-blue-950/50 rounded-lg">
              <Share2 size={12} /> Request Aid
            </button>
          </div>
        </div>
      )}

      {showAdd && <AddResourceForm onClose={() => setShowAdd(false)} onSaved={load} agreements={agreements} />}
    </div>
  );
}
