import { useState, useMemo } from 'react';
import {
  Handshake, Plus, Trash2, Pencil, ChevronDown, ChevronUp,
  AlertTriangle, Clock, MapPin, Phone, Mail, CheckCircle, XCircle,
  Filter, Search, FileText, Shield, DollarSign, Radio, Users,
  Calendar, Building2, Globe, Siren, Eye, X, Save,
} from 'lucide-react';
import DictateTextarea from './DictateTextarea';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';
import {
  AGREEMENT_TYPES, AGREEMENT_STATUSES, RESOURCE_TYPES,
  INCIDENT_TYPE_ACTIVATIONS, REIMBURSEMENT_MODELS, COMPLIANCE_STATUSES,
  initialAgreements,
} from '../data/mutualAid';

// ─── helpers ────────────────────────────────────────────────────────────────

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusColor(status) {
  const map = {
    'Active': 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
    'Expiring Soon': 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300',
    'Expired': 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300',
    'Under Review': 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    'Suspended': 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    'Draft': 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300',
  };
  return map[status] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300';
}

function complianceColor(status) {
  const map = {
    'Compliant': 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
    'Review Needed': 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300',
    'Renewal Required': 'bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300',
    'Non-Compliant': 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300',
    'Pending Signatures': 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    'Under Negotiation': 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300',
  };
  return map[status] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300';
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className={`p-1.5 rounded-lg ${color}`}><Icon size={14} className="text-white" /></div>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Detail Section Component ───────────────────────────────────────────────

function DetailRow({ label, value, icon: Icon, full }) {
  return (
    <div className={full ? 'col-span-full' : ''}>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5 flex items-center gap-1">
        {Icon && <Icon size={10} />} {label}
      </p>
      <p className="text-sm text-gray-800 dark:text-gray-100">{value || '—'}</p>
    </div>
  );
}

function TagList({ items, color = 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300' }) {
  if (!items || items.length === 0) return <span className="text-sm text-gray-400">None specified</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(item => (
        <span key={item} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{item}</span>
      ))}
    </div>
  );
}

// ─── Agreement Detail Panel ─────────────────────────────────────────────────

function AgreementDetail({ agreement: a, onEdit, onDelete, onNavigateToMeetings }) {
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'coverage', label: 'Coverage & Scope', icon: Shield },
    { id: 'dispatch', label: 'Dispatch', icon: Radio },
    { id: 'financial', label: 'Financial', icon: DollarSign },
    { id: 'compliance', label: 'Compliance', icon: CheckCircle },
    { id: 'meetings', label: 'Meetings', icon: FileText },
  ];

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
      {/* tabs */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 px-4 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={e => { e.stopPropagation(); setActiveTab(tab.id); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-red-600 text-red-700 dark:text-red-300' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <tab.icon size={12} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="px-5 py-4 space-y-4">

        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <>
            {/* Party Agency */}
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Building2 size={12} /> Party Agency
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <DetailRow label="Agency" value={a.partnerAgency} />
                <DetailRow label="FDID" value={a.partnerFDID} />
                <DetailRow label="Address" value={a.partnerAddress} full />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                <DetailRow label="Jurisdiction" value={a.partnerJurisdiction} />
                <DetailRow label="Boundaries" value={a.jurisdictionBoundaries} full />
              </div>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Phone size={12} /> Contact Information
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <DetailRow label="Contact" value={a.partnerContact} icon={Users} />
                <DetailRow label="Phone" value={a.partnerPhone} icon={Phone} />
                <DetailRow label="Email" value={a.partnerEmail} icon={Mail} />
              </div>
            </div>

            {/* Agreement Dates */}
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Calendar size={12} /> Agreement Dates
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <DetailRow label="Effective Date" value={formatDate(a.effectiveDate)} />
                <DetailRow label="Expiration Date" value={formatDate(a.expirationDate)} />
                <DetailRow label="Auto-Renew" value={a.autoRenew ? `Yes (${a.renewalTermMonths || '—'} months)` : 'No'} />
                <DetailRow label="Days Remaining" value={
                  a.expirationDate ? (daysUntil(a.expirationDate) > 0 ? `${daysUntil(a.expirationDate)} days` : 'Expired') : 'No expiration'
                } />
              </div>
            </div>

            {/* Signatory Officials */}
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FileText size={12} /> Signatory Officials
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Our Side</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{a.ourSignatory || '—'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{a.ourSignatoryTitle || '—'}</p>
                  <p className="text-xs text-gray-400">Authority: {a.ourSignatoryAuthority || '—'}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Partner Side</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{a.partnerSignatory || '—'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{a.partnerSignatoryTitle || '—'}</p>
                  <p className="text-xs text-gray-400">Authority: {a.partnerSignatoryAuthority || '—'}</p>
                </div>
              </div>
            </div>

            {/* PDF & Notes */}
            {a.pdfFileName && (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <FileText size={14} />
                <span className="font-medium">{a.pdfFileName}</span>
                <span className="text-xs text-gray-400">(stored)</span>
              </div>
            )}
            {a.notes && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">{a.notes}</p>
              </div>
            )}
          </>
        )}

        {/* ── Coverage & Scope Tab ── */}
        {activeTab === 'coverage' && (
          <>
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Resource Types Covered</h4>
              <TagList items={a.resourcesCovered} color="bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Geography / Coverage Zones</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">{a.geographyCoverageZones || '—'}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Incident Type Activations</h4>
              <TagList items={a.incidentTypeActivations} color="bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300" />
            </div>
            <div>
              <DetailRow label="Activation Threshold / Dispatch Rules" value={a.activationThreshold} full />
            </div>
            <div>
              <DetailRow label="Response Time Expectation" value={a.responseTimeExpectation} />
            </div>
          </>
        )}

        {/* ── Dispatch Tab ── */}
        {activeTab === 'dispatch' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Radio size={12} /> Radio Channels
                </h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 font-mono">{a.radioChannels || '—'}</p>
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Interoperability</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">{a.interoperabilityNotes || '—'}</p>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Dispatch Notes</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">{a.dispatchNotes || '—'}</p>
            </div>
            <div>
              <DetailRow label="Response Time Expectation" value={a.responseTimeExpectation} />
            </div>
          </>
        )}

        {/* ── Financial Tab ── */}
        {activeTab === 'financial' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <DetailRow label="Reimbursement Model" value={a.reimbursementModel} />
              <DetailRow label="Payment Terms" value={a.paymentTerms} />
              <DetailRow label="Agreement Type" value={a.agreementType} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Billing Procedures</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">{a.billingProcedures || '—'}</p>
            </div>
          </>
        )}

        {/* ── Compliance Tab ── */}
        {activeTab === 'compliance' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Compliance Status</p>
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${complianceColor(a.complianceStatus)}`}>
                  {a.complianceStatus || '—'}
                </span>
              </div>
              <DetailRow label="Last Review" value={formatDate(a.lastReviewDate)} />
              <DetailRow label="Next Review" value={formatDate(a.nextReviewDate)} />
              <DetailRow label="Expiration" value={formatDate(a.expirationDate)} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Globe size={12} /> Governing Authority
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="Authority" value={a.governingAuthorityName} />
                <DetailRow label="Contact" value={a.governingAuthorityContact} />
              </div>
            </div>
          </>
        )}

        {/* ── Meetings Tab ── */}
        {activeTab === 'meetings' && (
          <>
            <LinkedMeetings
              module="aid-agreements"
              recordId={a.id}
              recordLabel={a.partnerAgency || 'Aid Agreement'}
              onNavigateToMeetings={onNavigateToMeetings}
            />
            <Attachments
              module="aid-agreements"
              recordId={a.id}
              recordLabel={a.partnerAgency || 'Aid Agreement'}
            />
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button onClick={e => { e.stopPropagation(); onEdit(a); }}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 px-3 py-1.5 rounded-lg transition-colors">
            <Pencil size={12} /> Edit
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(a.id); }}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 px-3 py-1.5 rounded-lg transition-colors">
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agreement Form Modal ───────────────────────────────────────────────────

const BLANK_AGREEMENT = {
  id: '', agreementType: 'Mutual Aid', status: 'Active', complianceStatus: 'Compliant',
  partnerAgency: '', partnerFDID: '', partnerAddress: '', partnerJurisdiction: '',
  jurisdictionBoundaries: '', partnerContact: '', partnerPhone: '', partnerEmail: '',
  effectiveDate: '', expirationDate: '', autoRenew: true, renewalTermMonths: 36,
  lastReviewDate: '', nextReviewDate: '',
  ourSignatory: '', ourSignatoryTitle: '', ourSignatoryAuthority: '',
  partnerSignatory: '', partnerSignatoryTitle: '', partnerSignatoryAuthority: '',
  resourcesCovered: [], geographyCoverageZones: '', incidentTypeActivations: [],
  activationThreshold: '', dispatchNotes: '', radioChannels: '', interoperabilityNotes: '',
  responseTimeExpectation: '', reimbursementModel: 'No Cost / Reciprocal',
  billingProcedures: '', paymentTerms: '',
  governingAuthorityName: '', governingAuthorityContact: '',
  notes: '', pdfFileName: '',
};

function AgreementFormModal({ record, onSave, onClose }) {
  const isEdit = Boolean(record);
  const [form, setForm] = useState(() => record ? { ...BLANK_AGREEMENT, ...record } : { ...BLANK_AGREEMENT });
  const [formTab, setFormTab] = useState('agency');

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }
  function toggleArrayItem(key, item) {
    setForm(f => ({
      ...f,
      [key]: f[key].includes(item) ? f[key].filter(i => i !== item) : [...f[key], item],
    }));
  }

  function handleSubmit() {
    if (!form.partnerAgency.trim()) return alert('Partner Agency is required');
    const id = isEdit ? form.id : `agr-${String(Date.now()).slice(-6)}`;
    onSave({ ...form, id });
  }

  const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100';
  const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1';

  const formTabs = [
    { id: 'agency', label: 'Agency' },
    { id: 'dates', label: 'Dates & Signatories' },
    { id: 'coverage', label: 'Coverage' },
    { id: 'dispatch', label: 'Dispatch' },
    { id: 'financial', label: 'Financial' },
    { id: 'compliance', label: 'Compliance' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{isEdit ? 'Edit Agreement' : 'New Mutual Aid Agreement'}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>

        {/* Form Tabs */}
        <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 px-4 overflow-x-auto">
          {formTabs.map(tab => (
            <button key={tab.id} onClick={() => setFormTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                formTab === tab.id ? 'border-red-600 text-red-700 dark:text-red-300' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {formTab === 'agency' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Partner Agency *</label>
                  <input value={form.partnerAgency} onChange={e => set('partnerAgency', e.target.value)} className={inputCls} placeholder="Department name" />
                </div>
                <div>
                  <label className={labelCls}>FDID</label>
                  <input value={form.partnerFDID} onChange={e => set('partnerFDID', e.target.value)} className={inputCls} placeholder="e.g. 39-0712" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <input value={form.partnerAddress} onChange={e => set('partnerAddress', e.target.value)} className={inputCls} placeholder="Full street address" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Jurisdiction</label>
                  <input value={form.partnerJurisdiction} onChange={e => set('partnerJurisdiction', e.target.value)} className={inputCls} placeholder="e.g. Riverside Township" />
                </div>
                <div>
                  <label className={labelCls}>Agreement Type</label>
                  <select value={form.agreementType} onChange={e => set('agreementType', e.target.value)} className={inputCls}>
                    {AGREEMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Jurisdiction Boundaries</label>
                <DictateTextarea rows={2} value={form.jurisdictionBoundaries} onChange={e => set('jurisdictionBoundaries', e.target.value)}
                  placeholder="Describe boundary lines, roads, landmarks..." />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Contact Name</label>
                  <input value={form.partnerContact} onChange={e => set('partnerContact', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input value={form.partnerPhone} onChange={e => set('partnerPhone', e.target.value)} className={inputCls} placeholder="(xxx) xxx-xxxx" />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input value={form.partnerEmail} onChange={e => set('partnerEmail', e.target.value)} className={inputCls} />
                </div>
              </div>
            </>
          )}

          {formTab === 'dates' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Effective Date</label>
                  <input type="date" value={form.effectiveDate} onChange={e => set('effectiveDate', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Expiration Date</label>
                  <input type="date" value={form.expirationDate} onChange={e => set('expirationDate', e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                    <input type="checkbox" checked={form.autoRenew} onChange={e => set('autoRenew', e.target.checked)} className="rounded accent-red-600" />
                    Auto-Renew
                  </label>
                </div>
                <div>
                  <label className={labelCls}>Renewal Term (months)</label>
                  <input type="number" value={form.renewalTermMonths} onChange={e => set('renewalTermMonths', e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Last Review Date</label>
                  <input type="date" value={form.lastReviewDate} onChange={e => set('lastReviewDate', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Next Review Date</label>
                  <input type="date" value={form.nextReviewDate} onChange={e => set('nextReviewDate', e.target.value)} className={inputCls} />
                </div>
              </div>

              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide pt-2">Our Signatory</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Name</label>
                  <input value={form.ourSignatory} onChange={e => set('ourSignatory', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Title</label>
                  <input value={form.ourSignatoryTitle} onChange={e => set('ourSignatoryTitle', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Authority</label>
                  <input value={form.ourSignatoryAuthority} onChange={e => set('ourSignatoryAuthority', e.target.value)} className={inputCls} placeholder="e.g. Board of Fire Commissioners" />
                </div>
              </div>

              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide pt-2">Partner Signatory</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Name</label>
                  <input value={form.partnerSignatory} onChange={e => set('partnerSignatory', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Title</label>
                  <input value={form.partnerSignatoryTitle} onChange={e => set('partnerSignatoryTitle', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Authority</label>
                  <input value={form.partnerSignatoryAuthority} onChange={e => set('partnerSignatoryAuthority', e.target.value)} className={inputCls} />
                </div>
              </div>
            </>
          )}

          {formTab === 'coverage' && (
            <>
              <div>
                <label className={labelCls}>Resource Types Covered</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {RESOURCE_TYPES.map(r => (
                    <button key={r} type="button" onClick={() => toggleArrayItem('resourcesCovered', r)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                        form.resourcesCovered.includes(r) ? 'bg-blue-100 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300' : 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-blue-300'
                      }`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Geography / Coverage Zones</label>
                <DictateTextarea rows={2} value={form.geographyCoverageZones} onChange={e => set('geographyCoverageZones', e.target.value)}
                  placeholder="Describe coverage zones, boundaries, special areas..." />
              </div>
              <div>
                <label className={labelCls}>Incident Type Activations</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {INCIDENT_TYPE_ACTIVATIONS.map(t => (
                    <button key={t} type="button" onClick={() => toggleArrayItem('incidentTypeActivations', t)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                        form.incidentTypeActivations.includes(t) ? 'bg-orange-100 dark:bg-orange-950/50 border-orange-300 dark:border-orange-700 text-orange-800 dark:text-orange-300' : 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-orange-300'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Activation Threshold / Rules</label>
                <DictateTextarea rows={2} value={form.activationThreshold} onChange={e => set('activationThreshold', e.target.value)}
                  placeholder="When is this agreement activated? Auto-dispatch rules?" />
              </div>
              <div>
                <label className={labelCls}>Response Time Expectation</label>
                <input value={form.responseTimeExpectation} onChange={e => set('responseTimeExpectation', e.target.value)} className={inputCls}
                  placeholder="e.g. 8 minutes to shared boundary" />
              </div>
            </>
          )}

          {formTab === 'dispatch' && (
            <>
              <div>
                <label className={labelCls}>Dispatch Notes</label>
                <DictateTextarea rows={3} value={form.dispatchNotes} onChange={e => set('dispatchNotes', e.target.value)}
                  placeholder="How is this department dispatched? Through county? Direct request?" />
              </div>
              <div>
                <label className={labelCls}>Radio Channels</label>
                <input value={form.radioChannels} onChange={e => set('radioChannels', e.target.value)} className={inputCls}
                  placeholder="e.g. County Tac 3 (primary), Fireground 7 (secondary)" />
              </div>
              <div>
                <label className={labelCls}>Interoperability Settings / Notes</label>
                <DictateTextarea rows={3} value={form.interoperabilityNotes} onChange={e => set('interoperabilityNotes', e.target.value)}
                  placeholder="Radio compatibility, shared systems, portable caches, interop drills..." />
              </div>
            </>
          )}

          {formTab === 'financial' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Reimbursement Model</label>
                  <select value={form.reimbursementModel} onChange={e => set('reimbursementModel', e.target.value)} className={inputCls}>
                    {REIMBURSEMENT_MODELS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Payment Terms</label>
                  <input value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)} className={inputCls}
                    placeholder="e.g. Net 30 days" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Billing Procedures</label>
                <DictateTextarea rows={3} value={form.billingProcedures} onChange={e => set('billingProcedures', e.target.value)}
                  placeholder="Describe billing process, forms to submit, timelines..." />
              </div>
            </>
          )}

          {formTab === 'compliance' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Agreement Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                    {AGREEMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Compliance Status</label>
                  <select value={form.complianceStatus} onChange={e => set('complianceStatus', e.target.value)} className={inputCls}>
                    {COMPLIANCE_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Governing Authority</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Authority Name</label>
                    <input value={form.governingAuthorityName} onChange={e => set('governingAuthorityName', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Authority Contact</label>
                    <input value={form.governingAuthorityContact} onChange={e => set('governingAuthorityContact', e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>PDF Agreement File Name</label>
                <input value={form.pdfFileName} onChange={e => set('pdfFileName', e.target.value)} className={inputCls}
                  placeholder="e.g. Agreement_2025.pdf" />
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <DictateTextarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="General notes about this agreement..." />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button onClick={handleSubmit}
            className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg">
            <Save size={14} /> {isEdit ? 'Save Changes' : 'Create Agreement'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function MutualAidAgreements() {
  const [agreements, setAgreements] = useState(initialAgreements);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState(null);

  // ── Stats ──
  const stats = useMemo(() => {
    const active = agreements.filter(a => a.status === 'Active').length;
    const expiringSoon = agreements.filter(a => {
      const days = daysUntil(a.expirationDate);
      return days > 0 && days <= 90;
    }).length;
    const expired = agreements.filter(a => a.status === 'Expired' || daysUntil(a.expirationDate) <= 0).length;
    const reviewNeeded = agreements.filter(a =>
      a.complianceStatus === 'Review Needed' || a.complianceStatus === 'Renewal Required'
    ).length;
    return { active, expiringSoon, expired, reviewNeeded, total: agreements.length };
  }, [agreements]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    let list = agreements;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.partnerAgency?.toLowerCase().includes(q) ||
        a.partnerContact?.toLowerCase().includes(q) ||
        a.agreementType?.toLowerCase().includes(q) ||
        a.partnerJurisdiction?.toLowerCase().includes(q)
      );
    }
    if (filterStatus) list = list.filter(a => a.status === filterStatus);
    if (filterType) list = list.filter(a => a.agreementType === filterType);
    return list;
  }, [agreements, search, filterStatus, filterType]);

  // ── CRUD ──
  function handleSave(record) {
    if (editRecord) {
      setAgreements(prev => prev.map(a => a.id === record.id ? record : a));
    } else {
      setAgreements(prev => [...prev, record]);
    }
    setShowForm(false);
    setEditRecord(null);
  }

  function handleDelete(id) {
    if (!confirm('Delete this agreement? This cannot be undone.')) return;
    setAgreements(prev => prev.filter(a => a.id !== id));
    if (expanded === id) setExpanded(null);
  }

  function handleEdit(record) {
    setEditRecord(record);
    setShowForm(true);
  }

  // ── Auto-update expiring statuses ──
  const displayAgreements = filtered.map(a => {
    const days = daysUntil(a.expirationDate);
    let displayStatus = a.status;
    if (days <= 0 && a.status !== 'Expired' && a.status !== 'Suspended') displayStatus = 'Expired';
    else if (days > 0 && days <= 90 && a.status === 'Active') displayStatus = 'Expiring Soon';
    return { ...a, displayStatus };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Handshake className="h-6 w-6 text-red-700 dark:text-red-300" />
            Mutual Aid Agreements
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Formal agreements, coverage, dispatch coordination, and compliance tracking</p>
        </div>
        <button onClick={() => { setEditRecord(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
          <Plus size={14} /> New Agreement
        </button>
      </div>

      {/* Alert Banner */}
      {(stats.expiringSoon > 0 || stats.reviewNeeded > 0) && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {stats.expiringSoon > 0 && <><strong>{stats.expiringSoon}</strong> agreement{stats.expiringSoon !== 1 ? 's' : ''} expiring within 90 days. </>}
            {stats.reviewNeeded > 0 && <><strong>{stats.reviewNeeded}</strong> requiring review or renewal.</>}
          </p>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total" value={stats.total} icon={Handshake} color="bg-gray-500" />
        <StatCard label="Active" value={stats.active} icon={CheckCircle} color="bg-green-500" />
        <StatCard label="Expiring Soon" value={stats.expiringSoon} icon={Clock} color={stats.expiringSoon > 0 ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'} />
        <StatCard label="Expired" value={stats.expired} icon={XCircle} color={stats.expired > 0 ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'} />
        <StatCard label="Review Needed" value={stats.reviewNeeded} icon={AlertTriangle} color={stats.reviewNeeded > 0 ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agencies, contacts, jurisdictions..."
            aria-label="Search agreements by agency, contact, or jurisdiction"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          aria-label="Filter by status"
          className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
          <option value="">All Statuses</option>
          {AGREEMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          aria-label="Filter by agreement type"
          className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
          <option value="">All Types</option>
          {AGREEMENT_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Agreement List */}
      <div className="space-y-3">
        {displayAgreements.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 text-center">
            <Handshake className="mx-auto h-8 w-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">No agreements match your filters</p>
          </div>
        ) : (
          displayAgreements.map(a => {
            const isExpanded = expanded === a.id;
            const days = daysUntil(a.expirationDate);
            const isExpiring = days > 0 && days <= 90;
            const isExpired = days <= 0 && a.expirationDate;
            return (
              <div key={a.id} className={`bg-white dark:bg-gray-900 rounded-2xl border shadow-sm overflow-hidden ${
                isExpired ? 'border-red-200 dark:border-red-900' : isExpiring ? 'border-amber-200 dark:border-amber-900' : 'border-gray-100 dark:border-gray-700'
              }`}>
                {/* Summary Row */}
                <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setExpanded(isExpanded ? null : a.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Toggle details for ${a.partnerAgency} agreement`}
                  aria-expanded={isExpanded}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : a.id); } }}>
                  <div className={`p-2 rounded-lg ${
                    a.displayStatus === 'Active' ? 'bg-green-100 dark:bg-green-950/50' :
                    a.displayStatus === 'Expiring Soon' ? 'bg-amber-100 dark:bg-amber-950/50' :
                    a.displayStatus === 'Expired' ? 'bg-red-100 dark:bg-red-950/50' : 'bg-gray-100 dark:bg-gray-800'
                  }`}>
                    <Handshake size={16} className={
                      a.displayStatus === 'Active' ? 'text-green-600 dark:text-green-400' :
                      a.displayStatus === 'Expiring Soon' ? 'text-amber-600 dark:text-amber-400' :
                      a.displayStatus === 'Expired' ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'
                    } />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{a.partnerAgency}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {a.agreementType} · {a.partnerJurisdiction || 'No jurisdiction'} · Exp: {formatDate(a.expirationDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(isExpiring || isExpired) && <AlertTriangle size={12} className={isExpired ? 'text-red-500' : 'text-amber-500'} />}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(a.displayStatus)}`}>
                      {a.displayStatus}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${complianceColor(a.complianceStatus)}`}>
                      {a.complianceStatus}
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>

                {/* Expanded Detail */}
                {isExpanded && <AgreementDetail agreement={a} onEdit={handleEdit} onDelete={handleDelete} onNavigateToMeetings={null} />}
              </div>
            );
          })
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <AgreementFormModal
          record={editRecord}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditRecord(null); }}
        />
      )}
    </div>
  );
}
