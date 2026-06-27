import { useState, useEffect, useCallback } from 'react';
import {
  KeyRound, Plus, Search, ChevronDown, ChevronUp, Pencil, Loader2,
  CheckCircle, XCircle, Clock, AlertTriangle, MapPin, Building2,
  ClipboardCheck, History, Shield, X, Trash2,
} from 'lucide-react';
import { api } from '../utils/api';
import Attachments from './Attachments';

// ─── Constants ───────────────────────────────────────────────────────────────

const BOX_TYPES = [
  { value: 'wall_mount', label: 'Wall Mount Box' },
  { value: 'padlock', label: 'Knox Padlock' },
  { value: 'key_switch', label: 'Key Switch' },
  { value: 'elevator', label: 'Elevator Box' },
  { value: 'gate', label: 'Gate Box' },
  { value: 'vault', label: 'Key Vault' },
  { value: 'fdc', label: 'FDC Lock' },
];

const PROPERTY_TYPES = [
  'Commercial', 'Industrial', 'Residential (Multi)', 'Residential (Single)',
  'Government', 'Education', 'Healthcare', 'Religious', 'Utility', 'Other',
];

const STATUS_COLORS = {
  active:       'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900',
  inactive:     'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  damaged:      'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
  missing:      'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  replaced:     'bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900',
};

const ACCESS_TYPES = [
  { value: 'key_access', label: 'Key Access (one-time)' },
  { value: 'key_checkout', label: 'Key Checkout (return required)' },
  { value: 'emergency', label: 'Emergency Access' },
  { value: 'inspection', label: 'Inspection Access' },
  { value: 'maintenance', label: 'Maintenance' },
];

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100';
const BTN_PRIMARY = 'flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition-colors';
const BTN_SECONDARY = 'flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg transition-colors';

// ─── Inspection due helper ───────────────────────────────────────────────────

function inspectionDueLabel(nextDue) {
  if (!nextDue) return { label: 'Not inspected', urgent: true };
  const days = Math.round((new Date(nextDue) - new Date()) / 86400000);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, urgent: true };
  if (days === 0) return { label: 'Due today', urgent: true };
  if (days <= 30) return { label: `Due in ${days}d`, urgent: true };
  if (days <= 90) return { label: `Due in ${days}d`, urgent: false };
  return { label: nextDue, urgent: false };
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const icons = { active: CheckCircle, inactive: XCircle, damaged: AlertTriangle, missing: AlertTriangle, replaced: Clock };
  const Icon = icons[status] ?? Clock;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[status] || STATUS_COLORS.active}`}>
      <Icon size={10} /> {status}
    </span>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Knox Box Card ───────────────────────────────────────────────────────────

function KnoxCard({ box, onEdit, onExpand, expanded }) {
  const due = inspectionDueLabel(box.next_inspection_due);
  const typeLabel = BOX_TYPES.find(t => t.value === box.box_type)?.label || box.box_type;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all">
      <button onClick={() => onExpand(box.id)} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center flex-shrink-0">
              <KeyRound size={20} className="text-amber-700 dark:text-amber-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-black text-gray-900 dark:text-gray-100">{box.box_number}</p>
                <StatusBadge status={box.status} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{typeLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {due.urgent && (
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-full">
                {due.label}
              </span>
            )}
            {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
        </div>

        {/* Summary row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
          {box.address && (
            <span className="flex items-center gap-1"><MapPin size={11} /> {box.address}</span>
          )}
          {box.property_name && (
            <span className="flex items-center gap-1"><Building2 size={11} /> {box.property_name}</span>
          )}
          {box.access_count > 0 && (
            <span className="flex items-center gap-1"><History size={11} /> {box.access_count} accesses</span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && <ExpandedDetail box={box} onEdit={onEdit} />}
    </div>
  );
}

// ─── Expanded Detail Panel ───────────────────────────────────────────────────

function ExpandedDetail({ box, onEdit }) {
  const [accessLog, setAccessLog] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/knox-keys/${box.id}`)
      .then(r => {
        setAccessLog(r.data.accessLog || []);
        setInspections(r.data.inspections || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [box.id]);

  const due = inspectionDueLabel(box.next_inspection_due);
  const Row = ({ label, value }) => (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-gray-800 dark:text-gray-100 font-medium">{value || '—'}</p>
    </div>
  );

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-4">
      {/* Details grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Row label="Serial Number" value={box.serial_number} />
        <Row label="Property Type" value={box.property_type} />
        <Row label="Location Detail" value={box.location_detail} />
        <Row label="Contents" value={box.contents} />
        <Row label="Installed" value={box.installed_date} />
        <Row label="Inspection Due" value={
          <span className={due.urgent ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>{due.label}</span>
        } />
        <Row label="Last Inspection" value={box.last_inspection_date} />
        <Row label="Inspected By" value={box.inspected_by} />
        <Row label="Result" value={box.inspection_result} />
      </div>

      {box.notes && (
        <div className="bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-2">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Notes</p>
          <p className="text-xs text-gray-700 dark:text-gray-300">{box.notes}</p>
        </div>
      )}

      {/* Recent Access Log */}
      <div>
        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1.5">
          <History size={13} /> Recent Access Log
        </p>
        {loading ? (
          <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
        ) : accessLog.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">No access records</p>
        ) : (
          <div className="space-y-1">
            {accessLog.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-1.5">
                <span className="font-bold text-gray-700 dark:text-gray-300">{a.accessed_by}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500 dark:text-gray-400">{a.access_type}</span>
                {a.incident_number && <span className="text-red-600 dark:text-red-400 font-mono text-[10px]">#{a.incident_number}</span>}
                <span className="ml-auto text-gray-400 text-[10px]">{new Date(a.accessed_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Inspections */}
      <div>
        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1.5">
          <ClipboardCheck size={13} /> Recent Inspections
        </p>
        {loading ? (
          <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
        ) : inspections.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">No inspections recorded</p>
        ) : (
          <div className="space-y-1">
            {inspections.slice(0, 3).map(i => (
              <div key={i.id} className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-1.5">
                <span className={`w-2 h-2 rounded-full ${i.result === 'pass' ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-bold text-gray-700 dark:text-gray-300">{i.result === 'pass' ? 'Pass' : 'Fail'}</span>
                <span className="text-gray-500 dark:text-gray-400">by {i.inspected_by}</span>
                <span className="ml-auto text-gray-400 text-[10px]">{i.inspection_date}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attachments */}
      <Attachments entityType="knox_box" entityId={box.id} />

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={() => onEdit(box)} className={BTN_SECONDARY}><Pencil size={12} /> Edit</button>
      </div>
    </div>
  );
}

// ─── Knox Box Form Modal ─────────────────────────────────────────────────────

function KnoxBoxForm({ box, onSave, onClose }) {
  const [form, setForm] = useState({
    box_number: '', box_type: 'wall_mount', status: 'active',
    address: '', location_detail: '', property_name: '', property_type: '',
    installed_date: '', serial_number: '', contents: '', notes: '',
    ...box,
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.box_number.trim()) return;
    setSaving(true);
    try {
      if (box?.id) {
        const r = await api.patch(`/api/knox-keys/${box.id}`, form);
        onSave(r.data);
      } else {
        const r = await api.post('/api/knox-keys', form);
        onSave(r.data);
      }
      onClose();
    } catch (e) {
      console.error(e);
    } finally { setSaving(false); }
  }

  const Field = ({ label, children }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );

  return (
    <Modal title={box?.id ? 'Edit Knox Box' : 'Add Knox Box'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Box Number *">
            <input className={INPUT} value={form.box_number} onChange={e => set('box_number', e.target.value)} placeholder="K-047" />
          </Field>
          <Field label="Box Type">
            <select className={INPUT} value={form.box_type} onChange={e => set('box_type', e.target.value)}>
              {BOX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select className={INPUT} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="damaged">Damaged</option>
              <option value="missing">Missing</option>
              <option value="replaced">Replaced</option>
            </select>
          </Field>
          <Field label="Serial Number">
            <input className={INPUT} value={form.serial_number} onChange={e => set('serial_number', e.target.value)} placeholder="SN-123456" />
          </Field>
        </div>

        <Field label="Property Address">
          <input className={INPUT} value={form.address} onChange={e => set('address', e.target.value)} placeholder="775 Route 22, Maplewood, NJ" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Property Name">
            <input className={INPUT} value={form.property_name} onChange={e => set('property_name', e.target.value)} placeholder="Hannigan's Fuel & Auto" />
          </Field>
          <Field label="Property Type">
            <select className={INPUT} value={form.property_type} onChange={e => set('property_type', e.target.value)}>
              <option value="">Select...</option>
              {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Location Detail">
          <input className={INPUT} value={form.location_detail} onChange={e => set('location_detail', e.target.value)} placeholder="Main entrance, right pillar" />
        </Field>

        <Field label="Contents">
          <input className={INPUT} value={form.contents} onChange={e => set('contents', e.target.value)} placeholder="Building master key, elevator key, unit layout map" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Installed Date">
            <input type="date" className={INPUT} value={form.installed_date || ''} onChange={e => set('installed_date', e.target.value)} />
          </Field>
        </div>

        <Field label="Notes">
          <textarea className={INPUT} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes..." />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className={BTN_SECONDARY}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.box_number.trim()} className={BTN_PRIMARY}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {box?.id ? 'Save Changes' : 'Add Knox Box'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Access Log Modal ────────────────────────────────────────────────────────

function AccessLogForm({ box, onSave, onClose }) {
  const [form, setForm] = useState({
    accessed_by: '', access_type: 'key_access', incident_number: '', reason: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.accessed_by.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/knox-keys/${box.id}/access`, form);
      onSave();
      onClose();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  }

  return (
    <Modal title={`Log Access — ${box.box_number}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Accessed By *</label>
          <input className={INPUT} value={form.accessed_by} onChange={e => set('accessed_by', e.target.value)} placeholder="Chief Chen" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Access Type</label>
          <select className={INPUT} value={form.access_type} onChange={e => set('access_type', e.target.value)}>
            {ACCESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Incident Number</label>
          <input className={INPUT} value={form.incident_number} onChange={e => set('incident_number', e.target.value)} placeholder="2026-0042" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Reason</label>
          <input className={INPUT} value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Structure fire response" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Notes</label>
          <textarea className={INPUT} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className={BTN_SECONDARY}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.accessed_by.trim()} className={BTN_PRIMARY}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}
            Log Access
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Inspection Form Modal ───────────────────────────────────────────────────

function InspectionForm({ box, onSave, onClose, user }) {
  const [form, setForm] = useState({
    inspected_by: user?.name || '', inspection_date: new Date().toISOString().split('T')[0],
    result: 'pass', box_condition: 'good', lock_functional: true,
    contents_verified: true, weatherproofing: 'good', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    try {
      await api.post(`/api/knox-keys/${box.id}/inspection`, form);
      onSave();
      onClose();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  }

  return (
    <Modal title={`Inspect — ${box.box_number}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Inspector</label>
            <input className={INPUT} value={form.inspected_by} onChange={e => set('inspected_by', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Date</label>
            <input type="date" className={INPUT} value={form.inspection_date} onChange={e => set('inspection_date', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Result</label>
            <select className={INPUT} value={form.result} onChange={e => set('result', e.target.value)}>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="needs_repair">Needs Repair</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Box Condition</label>
            <select className={INPUT} value={form.box_condition} onChange={e => set('box_condition', e.target.value)}>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.lock_functional} onChange={e => set('lock_functional', e.target.checked)} className="rounded" />
            <span className="font-semibold text-gray-700 dark:text-gray-300">Lock functional</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.contents_verified} onChange={e => set('contents_verified', e.target.checked)} className="rounded" />
            <span className="font-semibold text-gray-700 dark:text-gray-300">Contents verified</span>
          </label>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Notes</label>
          <textarea className={INPUT} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className={BTN_SECONDARY}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
            Save Inspection
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function KnoxKeyManagement({ user }) {
  const [boxes, setBoxes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [showForm, setShowForm] = useState(null); // null | {} (new) | box (edit)
  const [showAccessForm, setShowAccessForm] = useState(null);
  const [showInspectionForm, setShowInspectionForm] = useState(null);

  const load = useCallback(async () => {
    try {
      const [boxRes, statRes] = await Promise.all([
        api.get('/api/knox-keys'),
        api.get('/api/knox-keys/stats'),
      ]);
      setBoxes(boxRes.data || []);
      setStats(statRes);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = boxes.filter(b => {
    if (filterStatus !== 'all' && b.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (b.box_number || '').toLowerCase().includes(q) ||
        (b.address || '').toLowerCase().includes(q) ||
        (b.property_name || '').toLowerCase().includes(q) ||
        (b.serial_number || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  function handleExpand(id) {
    setExpanded(expanded === id ? null : id);
  }

  async function handleDelete(box) {
    if (!confirm(`Delete Knox Box ${box.box_number}? This cannot be undone.`)) return;
    try { await api.delete(`/api/knox-keys/${box.id}`); load(); } catch (e) { console.error(e); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center">
            <KeyRound size={22} className="text-amber-700 dark:text-amber-300" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Knox Key Management</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Track Knox boxes, key access, and inspections across all properties</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAccessForm(filtered[0] || null)} disabled={!filtered.length} className={BTN_SECONDARY}>
            <History size={13} /> Log Access
          </button>
          <button onClick={() => setShowForm({})} className={BTN_PRIMARY}>
            <Plus size={14} /> Add Knox Box
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total Boxes', value: stats.total, color: 'text-gray-900 dark:text-gray-100' },
            { label: 'Active', value: stats.active, color: 'text-green-700 dark:text-green-300' },
            { label: 'Overdue Inspections', value: stats.overdueInspections, color: stats.overdueInspections > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400' },
            { label: 'Total Accesses', value: stats.totalAccesses, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Unreturned Keys', value: stats.unreturnedKeys, color: stats.unreturnedKeys > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
            placeholder="Search boxes, addresses, properties..."
            aria-label="Search Knox boxes, addresses, properties"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select aria-label="Filter by status" className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="damaged">Damaged</option>
          <option value="missing">Missing</option>
        </select>
      </div>

      {/* Box List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <KeyRound size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-bold text-gray-500 dark:text-gray-400">No Knox boxes found</p>
          <p className="text-xs text-gray-400 mt-1">
            {boxes.length === 0 ? 'Add your first Knox Box to get started.' : 'Try adjusting your search or filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(box => (
            <KnoxCard
              key={box.id}
              box={box}
              expanded={expanded === box.id}
              onExpand={handleExpand}
              onEdit={(b) => setShowForm(b)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && <KnoxBoxForm box={showForm.id ? showForm : null} onSave={() => load()} onClose={() => setShowForm(null)} />}
      {showAccessForm && <AccessLogForm box={showAccessForm} onSave={() => load()} onClose={() => setShowAccessForm(null)} />}
      {showInspectionForm && <InspectionForm box={showInspectionForm} onSave={() => load()} onClose={() => setShowInspectionForm(null)} user={user} />}
    </div>
  );
}
