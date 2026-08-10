/**
 * ActivityLogger.jsx — Unified Activity Entry (legacy-RMS replacement)
 *
 * Replaces a legacy RMS Activity Entry form with an AI-enhanced inline logger.
 * Categories match Matt's daily workflow: General Journal, Station Journal,
 * Unit Journal. Each category has structured sub-types with smart forms.
 *
 * AI enhancements:
 *  - Auto-suggests entries based on day/time ("It's Monday — aerial check?")
 *  - Pre-fills from context (date, shift, apparatus, crew)
 *  - Completion tracking ("4 of 7 daily activities completed")
 *  - Voice entry via "Hey Firehouse"
 */

import { useState, useEffect, useMemo } from 'react';
import { useActivity } from '../context/ActivityContext';
import {
  Plus, X, Check, Loader2, ChevronRight, ClipboardCheck, Truck,
  Wrench, GraduationCap, Shield, Users, FileText, Fuel, Eye,
  Calendar, AlertTriangle, Clock, Zap, CheckCircle, Search,
  Radio, History, FolderOpen, CheckSquare,
} from 'lucide-react';
import { api } from '../utils/api';
import { NEIGHBOR_DEPARTMENTS } from '../data/members';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950';

// ─── Activity Categories (matching common RMS structure) ────────────────────────

const CATEGORIES = [
  {
    id: 'general', label: 'General Journal', icon: FileText, color: 'bg-gray-600',
    types: [
      { id: 'battalion-checklist', label: 'Battalion Daily Checklist', fields: ['notes'] },
      { id: 'captain-checklist', label: "Captain's Checklist", fields: ['notes'] },
      { id: 'run-list', label: 'Run List Daily', fields: ['notes'] },
      { id: 'notice', label: 'Notice to All Personnel', fields: ['subject', 'body'] },
      { id: 'suggestion', label: 'Suggestion Box', fields: ['subject', 'body'] },
    ],
  },
  {
    id: 'station', label: 'Station Journal', icon: Shield, color: 'bg-blue-600',
    types: [
      { id: 'equip-check-daily', label: 'Equipment Check — Daily', fields: ['apparatus', 'result', 'notes'], defaultResult: 'pass' },
      { id: 'sunday-report', label: 'Sunday Report', fields: ['notes'] },
      { id: 'visitor-log', label: 'Visitor Log', fields: ['visitor_name', 'purpose', 'time_in', 'time_out'] },
      { id: 'maint-station', label: 'Maintenance Request — Station', fields: ['subject', 'priority', 'body'] },
      { id: 'maint-computer', label: 'Maintenance Request — Computer', fields: ['subject', 'priority', 'body'] },
    ],
  },
  {
    id: 'unit', label: 'Unit Journal', icon: Truck, color: 'bg-green-600',
    types: [
      { id: 'apparatus-check', label: 'Apparatus Check — Weekly', fields: ['apparatus', 'result', 'notes'], defaultResult: 'pass' },
      { id: 'aerial-check', label: 'Aerial Check — Monday', fields: ['apparatus', 'result', 'notes'], defaultResult: 'pass' },
      { id: 'fuel', label: 'Fuel Log', fields: ['apparatus', 'gallons', 'fuel_type', 'location', 'notes'] },
      { id: 'preplan-work', label: 'Pre-Incident Planning', fields: ['property', 'notes'] },
      { id: 'ppe-inspection', label: 'PPE Inspection', fields: ['result', 'notes'], defaultResult: 'pass' },
      { id: 'turnout-cleaning', label: 'Turnout Gear Cleaning', fields: ['notes'] },
      { id: 'hydrant-inspection', label: 'Hydrant Inspection', fields: ['hydrant_id', 'result', 'notes'], defaultResult: 'pass' },
      { id: 'public-education', label: 'Public Education', fields: ['event_name', 'attendees', 'notes'] },
      { id: 'community-outreach', label: 'Community Outreach', fields: ['event_name', 'notes'] },
      { id: 'maint-apparatus', label: 'Maintenance Request — Apparatus', fields: ['apparatus', 'subject', 'priority', 'body'] },
      { id: 'mutual-aid-report', label: 'Mutual Aid Report', fields: ['department', 'incident_type', 'notes'] },
      { id: 'post-incident', label: 'Post Incident Analysis', fields: ['incident_number', 'notes'] },
    ],
  },
  {
    id: 'equipment-checks', label: 'Equipment Checks', icon: ClipboardCheck, color: 'bg-red-600',
    types: [
      { id: 'scba-check', label: 'SCBA Check', fields: ['apparatus', 'result', 'notes'], defaultResult: 'pass' },
      { id: 'meter-check', label: 'Meter Check', fields: ['apparatus', 'result', 'notes'], defaultResult: 'pass' },
      { id: 'aerial-check-equip', label: 'Aerial Check', fields: ['apparatus', 'result', 'notes'], defaultResult: 'pass' },
      { id: 'rope-log', label: 'Rope Log', fields: ['apparatus', 'notes'] },
      { id: 'hose-inventory', label: 'Hose Inventory', fields: ['apparatus', 'notes'] },
      { id: 'ladder-inventory', label: 'Ladder Inventory', fields: ['apparatus', 'notes'] },
      { id: 'rig-inventory', label: 'Rig Inventory', fields: ['apparatus', 'result', 'notes'], defaultResult: 'pass' },
    ],
  },
  {
    // Indigo, not purple: at tile size purple reads as the AI violet, and standing
    // ruling #2 reserves that hue for AI surfaces — nothing else wears it. This is
    // the tile that actually renders on the Member Portal's Log Activity card.
    id: 'training', label: 'Training Entry', icon: GraduationCap, color: 'bg-indigo-600',
    types: [
      { id: 'training-drill', label: 'Drill / Training', fields: ['course', 'hours', 'instructor', 'notes'] },
      { id: 'training-class', label: 'Class / Certification', fields: ['course', 'hours', 'instructor', 'result', 'notes'] },
      { id: 'training-online', label: 'Online / Self-Study', fields: ['course', 'hours', 'notes'] },
    ],
  },
  {
    id: 'neris', label: 'NERIS', icon: Radio, color: 'bg-orange-600',
    types: [
      { id: 'neris-reports-due',  label: 'Reports Due',   nerisView: 'reports-due' },
      { id: 'neris-history',      label: 'NERIS History', nerisView: 'history' },
      { id: 'neris-unit-search',  label: 'Unit Search',   nerisView: 'unit-search' },
      { id: 'neris-call-search',  label: 'Call Search',   nerisView: 'call-search' },
    ],
  },
];

// ─── AI Suggestions ──────────────────────────────────────────────────────────

function getAISuggestions() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon
  const hour = now.getHours();
  const suggestions = [];

  if (hour >= 6 && hour <= 9) {
    suggestions.push({ type: 'equip-check-daily', text: 'Daily equipment check not logged yet', priority: 'high' });
  }
  if (day === 1) { // Monday
    suggestions.push({ type: 'aerial-check', text: "It's Monday — aerial check due", priority: 'medium' });
  }
  if (day === 0) { // Sunday
    suggestions.push({ type: 'sunday-report', text: 'Sunday report due today', priority: 'medium' });
  }
  if (day >= 1 && day <= 5 && hour >= 7 && hour <= 10) {
    suggestions.push({ type: 'apparatus-check', text: 'Weekly apparatus check — have you done it this week?', priority: 'low' });
  }

  return suggestions;
}

// ─── Activity Form ───────────────────────────────────────────────────────────

function ActivityForm({ activityType, onSave, onClose, user }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 'A Shift',
    entered_by: user?.name || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    try {
      await api.post('/api/activity-entries', {
        entry_type: activityType.id,
        category: activityType.label,
        date: form.date,
        shift: form.shift,
        entered_by: form.entered_by,
        apparatus: form.apparatus || '',
        result: form.result || '',
        subject: form.subject || '',
        body: form.body || '',
        priority: form.priority || 'normal',
        visitor_name: form.visitor_name || '',
        purpose: form.purpose || '',
        time_in: form.time_in || '',
        time_out: form.time_out || '',
        gallons: form.gallons || null,
        fuel_type: form.fuel_type || '',
        location: form.location || '',
        property: form.property || '',
        hydrant_id: form.hydrant_id || '',
        event_name: form.event_name || '',
        attendees: form.attendees || null,
        department: form.department || '',
        incident_type: form.incident_type || '',
        incident_number: form.incident_number || '',
        course: form.course || '',
        hours: form.hours || null,
        instructor: form.instructor || '',
        notes: form.notes || '',
      });
      onSave();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  const FIELD_DEFS = {
    notes: { label: 'Notes', type: 'textarea', placeholder: 'Details...' },
    subject: { label: 'Subject', type: 'text', placeholder: 'Brief description' },
    body: { label: 'Description', type: 'textarea', placeholder: 'Full details...' },
    apparatus: { label: 'Apparatus', type: 'select', options: ['Engine 1', 'Engine 2', 'Truck 1', 'Rescue 1', 'Battalion 1'] },
    result: { label: 'Result', type: 'select', options: ['Pass', 'Fail', 'Needs Attention'] },
    priority: { label: 'Priority', type: 'select', options: ['Low', 'Normal', 'High', 'Critical'] },
    visitor_name: { label: 'Visitor Name', type: 'text', placeholder: 'Name' },
    purpose: { label: 'Purpose of Visit', type: 'text', placeholder: 'Reason for visit' },
    time_in: { label: 'Time In', type: 'time' },
    time_out: { label: 'Time Out', type: 'time' },
    gallons: { label: 'Gallons', type: 'number', placeholder: '0' },
    fuel_type: { label: 'Fuel Type', type: 'select', options: ['Diesel', 'Unleaded', 'DEF'] },
    location: { label: 'Location', type: 'text', placeholder: 'Station/fuel stop' },
    property: { label: 'Property', type: 'text', placeholder: 'Property name/address' },
    hydrant_id: { label: 'Hydrant ID', type: 'text', placeholder: 'H-001' },
    event_name: { label: 'Event Name', type: 'text', placeholder: 'Event name' },
    attendees: { label: 'Attendees', type: 'number', placeholder: '0' },
    department: { label: 'Department', type: 'select', options: NEIGHBOR_DEPARTMENTS },
    incident_type: { label: 'Incident Type', type: 'select', options: ['Structure Fire', 'Medical', 'MVA', 'Hazmat', 'Fire Alarm', 'Brush/Wildland', 'Water Rescue', 'Technical Rescue', 'Other'] },
    incident_number: { label: 'Incident Number', type: 'text', placeholder: '2026-XXXX' },
    course: { label: 'Course / Topic', type: 'text', placeholder: 'Training topic' },
    hours: { label: 'Hours', type: 'number', placeholder: '0' },
    instructor: { label: 'Instructor', type: 'text', placeholder: 'Instructor name' },
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
        <div>
          <p className="text-xs font-black text-gray-700 dark:text-gray-300">{activityType.label}</p>
          <p className="text-[10px] text-gray-400">{form.date} — {form.entered_by}</p>
        </div>
        <button onClick={onClose} aria-label="Close activity form" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={16} /></button>
      </div>
      <div className="p-4 space-y-3">
        {(activityType.fields || []).map(fieldId => {
          const def = FIELD_DEFS[fieldId];
          if (!def) return null;

          if (activityType.defaultResult && fieldId === 'result' && !form.result) {
            set('result', activityType.defaultResult === 'pass' ? 'Pass' : 'Fail');
          }

          return (
            <div key={fieldId}>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{def.label}</label>
              {def.type === 'textarea' ? (
                <textarea className={INPUT} rows={3} placeholder={def.placeholder} aria-label={def.label}
                  value={form[fieldId] || ''} onChange={e => set(fieldId, e.target.value)} />
              ) : def.type === 'select' ? (
                <select className={INPUT} value={form[fieldId] || def.options?.[0] || ''} aria-label={def.label}
                  onChange={e => set(fieldId, e.target.value)}>
                  {def.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={def.type || 'text'} className={INPUT} placeholder={def.placeholder} aria-label={def.label}
                  value={form[fieldId] || ''} onChange={e => set(fieldId, e.target.value)} />
              )}
            </div>
          );
        })}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 bg-red-700 text-white font-bold text-sm rounded-xl hover:bg-red-800 disabled:opacity-50 flex items-center justify-center gap-1">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save Entry
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NERIS Panel ─────────────────────────────────────────────────────────────

const NERIS_TABS = [
  { id: 'reports-due',    label: 'Reports Due',   icon: AlertTriangle },
  { id: 'neris-history',  label: 'NERIS History', icon: History },
  { id: 'unit-search',    label: 'Unit Search',   icon: Truck },
  { id: 'call-search',    label: 'Call Search',   icon: Search },
];

const BC_ROLES = ['battalion_chief', 'deputy_chief', 'chief'];

function NerisPanel({ onBack, initialTab = 'reports-due', user }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [reports, setReports] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unitQuery, setUnitQuery] = useState('');
  const [callQuery, setCallQuery] = useState('');
  const [unitResults, setUnitResults] = useState([]);
  const [callResults, setCallResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [actioningId, setActioningId] = useState(null);

  const canApprove = BC_ROLES.includes(user?.role);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await api.get('/api/neris/reports').catch(() => ({ data: [] }));
        const all = res?.data || [];
        setReports(all.filter(r => r.status !== 'approved').sort((a, b) => new Date(b.incident_date || b.created_at || 0) - new Date(a.incident_date || a.created_at || 0)));
        setHistory(all.filter(r => r.status === 'approved').sort((a, b) => new Date(b.incident_date || b.created_at || 0) - new Date(a.incident_date || a.created_at || 0)));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  async function sendForApproval(id) {
    setActioningId(id);
    try {
      await api.patch(`/api/neris/reports/${id}`, { status: 'pending_approval' }).catch(() => {});
      // Notify the BC — server handles routing to riding BC
      await api.post('/api/neris/notify-bc', { report_id: id }).catch(() => {});
      setReports(r => r.map(x => x.id === id ? { ...x, status: 'pending_approval' } : x));
    } catch (e) { console.error(e); }
    finally { setActioningId(null); }
  }

  async function markApproved(id) {
    setActioningId(id);
    try {
      await api.patch(`/api/neris/reports/${id}`, { status: 'approved', approved_by: user?.name }).catch(() => {});
      const approved = reports.find(x => x.id === id);
      setReports(r => r.filter(x => x.id !== id));
      setHistory(h => [{ ...approved, status: 'approved' }, ...h]);
    } catch (e) { console.error(e); }
    finally { setActioningId(null); }
  }

  async function searchUnits() {
    if (!unitQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/api/neris/units?q=${encodeURIComponent(unitQuery)}`).catch(() => ({ data: [] }));
      setUnitResults(res?.data || []);
    } catch (e) { console.error(e); }
    finally { setSearching(false); }
  }

  async function searchCalls() {
    if (!callQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/api/neris/calls?q=${encodeURIComponent(callQuery)}`).catch(() => ({ data: [] }));
      setCallResults(res?.data || []);
    } catch (e) { console.error(e); }
    finally { setSearching(false); }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
        <button onClick={onBack} className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 font-bold">Back</button>
        <Radio size={14} className="text-orange-600 dark:text-orange-400" />
        <span className="text-xs font-black text-gray-700 dark:text-gray-300">NERIS</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-700 overflow-x-auto">
        {NERIS_TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <tab.icon size={11} />
            {tab.label}
            {tab.id === 'reports-due' && reports.length > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full ml-0.5">
                {reports.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-3">

        {/* ── Reports Due ── */}
        {activeTab === 'reports-due' && (
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <Loader2 size={16} className="animate-spin" /> Loading reports...
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle size={24} className="mx-auto text-green-400 mb-2" />
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">All reports submitted</p>
                <p className="text-xs text-gray-400 mt-1">No pending NERIS reports</p>
              </div>
            ) : (
              reports.map(report => {
                const isPendingApproval = report.status === 'pending_approval';
                const isDraft = report.status === 'draft';
                const isActioning = actioningId === report.id;
                return (
                  <div key={report.id} className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-gray-900 dark:text-gray-100">{report.incident_number || report.call_number || 'Pending Report'}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {report.incident_type || report.call_type || 'Unknown Type'} —{' '}
                        {report.incident_date ? new Date(report.incident_date).toLocaleDateString() : 'Date unknown'}
                      </p>
                      <p className={`text-[10px] font-bold mt-1 uppercase tracking-wide ${
                        isPendingApproval ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {isDraft ? 'Draft' : isPendingApproval ? 'Awaiting BC Approval' : 'Not Submitted'}
                      </p>
                      {isPendingApproval && report.bc_name && (
                        <p className="text-[10px] text-gray-400 mt-0.5">Sent to: {report.bc_name}</p>
                      )}
                    </div>
                    {/* BC+ sees Approve button; others see Send for Approval (only if not already sent) */}
                    {canApprove ? (
                      <button onClick={() => markApproved(report.id)} disabled={isActioning}
                        className="flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-950/50 hover:bg-green-200 dark:hover:bg-green-900 disabled:opacity-50 px-2 py-1 rounded-lg flex-shrink-0 transition-colors">
                        {isActioning ? <Loader2 size={10} className="animate-spin" /> : <CheckSquare size={10} />} Approve
                      </button>
                    ) : !isPendingApproval ? (
                      <button onClick={() => sendForApproval(report.id)} disabled={isActioning}
                        className="flex items-center gap-1 text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/50 hover:bg-blue-200 dark:hover:bg-blue-900 disabled:opacity-50 px-2 py-1 rounded-lg flex-shrink-0 transition-colors">
                        {isActioning ? <Loader2 size={10} className="animate-spin" /> : <CheckSquare size={10} />} Send for Approval
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-950/50 px-2 py-1 rounded-lg flex-shrink-0">Sent</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── NERIS History ── */}
        {activeTab === 'neris-history' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <FolderOpen size={14} className="text-orange-500" />
              <span className="text-xs font-black text-gray-700 dark:text-gray-300">Completed NERIS Reports</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <Loader2 size={16} className="animate-spin" /> Loading history...
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8">
                <History size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">No history yet</p>
                <p className="text-xs text-gray-400 mt-1">Approved reports will appear here</p>
              </div>
            ) : (
              history.map(report => (
                <div key={report.id} className="flex items-start gap-3 p-3 rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/50">
                  <CheckCircle size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-gray-900 dark:text-gray-100">{report.incident_number || report.call_number || 'Completed Report'}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {report.incident_type || report.call_type || 'Unknown Type'} —{' '}
                      {report.incident_date ? new Date(report.incident_date).toLocaleDateString() : 'Date unknown'}
                    </p>
                    <p className="text-[10px] font-bold text-green-600 dark:text-green-400 mt-1">Approved</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Unit Search ── */}
        {activeTab === 'unit-search' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100"
                placeholder="Search by unit ID, name, or type..."
                aria-label="Search units"
                value={unitQuery}
                onChange={e => setUnitQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchUnits()}
              />
              <button onClick={searchUnits} disabled={searching || !unitQuery.trim()}
                className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5 text-xs font-bold">
                {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                Search
              </button>
            </div>
            {unitResults.length > 0 ? (
              <div className="space-y-1.5">
                {unitResults.map((u, i) => (
                  <div key={i} className="p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
                    <p className="text-xs font-black text-gray-900 dark:text-gray-100">{u.unit_id || u.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{u.type || ''} {u.station ? `— ${u.station}` : ''}</p>
                  </div>
                ))}
              </div>
            ) : unitQuery && !searching ? (
              <p className="text-xs text-gray-400 text-center py-4">No units found for "{unitQuery}"</p>
            ) : null}
          </div>
        )}

        {/* ── Call Search ── */}
        {activeTab === 'call-search' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100"
                placeholder="Search by call number, address, or type..."
                aria-label="Search calls"
                value={callQuery}
                onChange={e => setCallQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchCalls()}
              />
              <button onClick={searchCalls} disabled={searching || !callQuery.trim()}
                className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5 text-xs font-bold">
                {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                Search
              </button>
            </div>
            {callResults.length > 0 ? (
              <div className="space-y-1.5">
                {callResults.map((c, i) => (
                  <div key={i} className="p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
                    <p className="text-xs font-black text-gray-900 dark:text-gray-100">{c.call_number || c.incident_number}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {c.call_type || c.incident_type || ''}{c.address ? ` — ${c.address}` : ''}
                    </p>
                    {c.date && <p className="text-[10px] text-gray-400 mt-0.5">{new Date(c.date).toLocaleDateString()}</p>}
                  </div>
                ))}
              </div>
            ) : callQuery && !searching ? (
              <p className="text-xs text-gray-400 text-center py-4">No calls found for "{callQuery}"</p>
            ) : null}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ActivityLogger({ user, onNavigate, compact = false, defaultCategory = null }) {
  // Store the category ID string (consistent with setSelectedCategory(cat.id) in the grid)
  const [selectedCategory, setSelectedCategory] = useState(
    defaultCategory && CATEGORIES.some(c => c.id === defaultCategory) ? defaultCategory : null
  );
  const [selectedType, setSelectedType] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const { todayCount, refresh: refreshActivityCount } = useActivity();

  const suggestions = useMemo(() => getAISuggestions(), []);

  function handleSave() {
    setSavedCount(c => c + 1);
    setSelectedType(null);
    setSelectedCategory(null);
    refreshActivityCount(); // bump shared context count immediately
  }

  // ── Compact mode: just the button ──
  // Blue, not red: this is the ordinary primary action on a member's landing page.
  // Red is the emergency vocabulary (active incident, dispatch nav, alert pill), and
  // a full-width red bar for "log a hydrant inspection" was the loudest thing on the
  // portal. THIS is the button that renders — MyPortal.jsx carries a dead local copy
  // of this component; editing that one changed nothing, which the served bundle
  // proved. Second instance of that same trap in one session.
  if (!expanded && compact) {
    return (
      <button onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg transition-all">
        <Plus size={18} />
        <span className="text-sm font-bold flex-1 text-left">Log Activity</span>
        {(todayCount > 0 || savedCount > 0) && (
          <span className="text-[10px] bg-white/20 dark:bg-gray-900/20 px-2 py-0.5 rounded-full">{todayCount + savedCount} logged today</span>
        )}
      </button>
    );
  }

  // ── NERIS view ──
  if (selectedType?.nerisView) {
    return <NerisPanel initialTab={selectedType.nerisView} onBack={() => setSelectedType(null)} user={user} />;
  }

  // ── Active form ──
  if (selectedType) {
    return <ActivityForm activityType={selectedType} onSave={handleSave} onClose={() => setSelectedType(null)} user={user} />;
  }

  // ── Type selection within category ──
  if (selectedCategory) {
    const cat = CATEGORIES.find(c => c.id === selectedCategory);
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <button onClick={() => setSelectedCategory(null)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 font-bold">Back</button>
          <span className="text-xs font-black text-gray-700 dark:text-gray-300">{cat?.label}</span>
        </div>
        <div className="p-2 space-y-1">
          {cat?.types.map(type => (
            <button key={type.id} onClick={() => setSelectedType(type)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors">
              <ClipboardCheck size={14} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">{type.label}</span>
              <ChevronRight size={12} className="text-gray-300 dark:text-gray-600" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Category selection ──
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
        <span className="text-xs font-black text-gray-700 dark:text-gray-300">LOG ACTIVITY</span>
        <div className="flex items-center gap-2">
          {(todayCount > 0 || savedCount > 0) && (
            <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle size={10} /> {todayCount + savedCount} logged today
            </span>
          )}
          {compact && <button onClick={() => setExpanded(false)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-bold">Close</button>}
        </div>
      </div>

      {/* AI Suggestions.
          `bg-amber-50/50` was a LIGHT-ONLY TRANSLUCENT tint with no dark twin, so in
          dark mode it composited over the page to a mid-grey (#888a8a as measured)
          and dragged the amber text on it to 2.03:1 against a 4.5 floor. Third
          instance of this exact class — the unread-bulletin tint and the calendar's
          out-of-month cells were the first two. A light value at partial alpha is not
          "neutral"; it lands on whatever is behind it.
          It also evaded the ratchet for a different reason worth noting: this block
          only renders when suggestions EXIST, so a sweep can pass on the same page
          twice and never see it. */}
      {suggestions.length > 0 && (
        <div className="px-3 py-2 border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/60">
          <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase mb-1 flex items-center gap-1"><Zap size={10} aria-hidden="true" /> AI Suggestions</p>
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => {
              const allTypes = CATEGORIES.flatMap(c => c.types);
              const type = allTypes.find(t => t.id === s.type);
              if (type) setSelectedType(type);
            }}
              className="w-full flex items-center gap-2 px-2 py-1 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900 rounded-lg transition-colors">
              <AlertTriangle size={10} className="text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-left">{s.text}</span>
              <ChevronRight size={10} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {/* Category grid */}
      <div className="grid grid-cols-2 gap-2 p-3">
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
            className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border border-transparent hover:border-gray-200">
            <div className={`w-9 h-9 rounded-lg ${cat.color} flex items-center justify-center flex-shrink-0`}>
              <cat.icon size={16} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{cat.label}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{cat.types.length} {cat.id === 'neris' ? 'sections' : 'types'}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
