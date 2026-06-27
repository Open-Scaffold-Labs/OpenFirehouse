import { useState, useCallback } from 'react';
import {
  ClipboardCheck, Save, Plus, Trash2, Search, ChevronDown,
  AlertTriangle, CheckCircle, XCircle, FileText, Camera,
  Paperclip, Clock, Building2, User, Calendar, Shield,
  X, Edit3, List, Eye, MapPin, Radio, RotateCcw,
} from 'lucide-react';
import {
  INSPECTION_TYPES, INSPECTION_RESULTS, VIOLATION_CODES, VIOLATION_STATUSES,
  VIOLATION_CATEGORIES, VIOLATION_ACTIONS, FLOOR_OPTIONS, LOCATION_OPTIONS,
  INSPECTION_CHECKLISTS, initialProperties,
} from '../data/fireInspections';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 dark:text-gray-100';
const selectCls = inputCls + ' appearance-none';
const labelCls = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

function generateInspNum() {
  return 'INS-' + String(Math.floor(Math.random() * 90000) + 10000);
}

// ─── Violation Detail Form Modal ─────────────────────────────────────────────

function ViolationDetailForm({ violation, onUpdate, onClose, inspectionNum }) {
  const v = violation;
  const update = (field, value) => onUpdate(v.id, field, value);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-[820px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <Edit3 size={18} className="text-red-600 dark:text-red-400" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Violation Detail Form</h2>
            <span className="text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
              Violation #{v.seq}
            </span>
          </div>
          <button onClick={onClose} aria-label="Close violation detail form" className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X size={18} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Inspection context bar */}
          <div className="flex items-center gap-4 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/50 rounded-xl text-xs text-blue-800 dark:text-blue-300">
            <span className="font-semibold">Inspection #: {inspectionNum}</span>
            {v.code && <span>| Code: {v.code}</span>}
          </div>

          {/* Violation section */}
          <div>
            <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide mb-3">Violation</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>Floor #</label>
                <select value={v.floor || ''} onChange={e => update('floor', e.target.value)} aria-label="Floor number" className={selectCls}>
                  <option value="">Select floor...</option>
                  {FLOOR_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Location</label>
                <select value={v.location || ''} onChange={e => update('location', e.target.value)} aria-label="Location" className={selectCls}>
                  <option value="">Type or Select Location</option>
                  {LOCATION_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>Category</label>
                <select value={v.category || ''} onChange={e => update('category', e.target.value)} aria-label="Category" className={selectCls}>
                  <option value="">Type or Select Category</option>
                  {VIOLATION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Nature / Action</label>
                <select value={v.action || ''} onChange={e => update('action', e.target.value)} aria-label="Nature / Action" className={selectCls}>
                  <option value="">Type or Select Nature/Action</option>
                  {VIOLATION_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className={labelCls}>Violation Code</label>
              <select value={v.code || ''} onChange={e => {
                const found = VIOLATION_CODES.find(vc => vc.code === e.target.value);
                update('code', e.target.value);
                if (found) update('description', found.desc);
              }} aria-label="Violation Code" className={selectCls}>
                <option value="">Select violation code...</option>
                {VIOLATION_CODES.map(vc => (
                  <option key={vc.code} value={vc.code}>{vc.code} — {vc.desc}</option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls + ' mb-0'}>Description</label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={v.includeInPrint !== false} onChange={e => update('includeInPrint', e.target.checked)}
                    className="w-3.5 h-3.5 text-red-500 rounded focus:ring-red-400" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Include in print</span>
                </label>
              </div>
              <textarea value={v.description || ''} onChange={e => update('description', e.target.value)}
                aria-label="Violation description"
                rows={3} placeholder="Describe the violation..."
                className={inputCls + ' resize-y'} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Inspection Type</label>
                <select value={v.inspType || 'Periodic'} onChange={e => update('inspType', e.target.value)} aria-label="Inspection Type" className={selectCls}>
                  <option value="Periodic">Periodic</option>
                  <option value="Initial">Initial</option>
                  <option value="Re-Inspection">Re-Inspection</option>
                  <option value="Complaint">Complaint</option>
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={v.imminentHazard || false} onChange={e => update('imminentHazard', e.target.checked)}
                    className="w-4 h-4 text-red-600 dark:text-red-400 rounded focus:ring-red-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Imminent Hazard?</span>
                </label>
              </div>
            </div>
          </div>

          {/* Status section */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-5">
            <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide mb-3">Status</h3>
            <div className="flex items-center gap-4 flex-wrap mb-4">
              {VIOLATION_STATUSES.map(s => (
                <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name={`status-${v.id}`} value={s}
                    checked={v.status === s} onChange={e => update('status', e.target.value)}
                    className="w-4 h-4 text-red-600 dark:text-red-400 focus:ring-red-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{s}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Abate By</label>
                <input type="date" value={v.abateBy || ''} onChange={e => update('abateBy', e.target.value)} aria-label="Abate By" className={inputCls} />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={v.recurring || false} onChange={e => update('recurring', e.target.checked)}
                    className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Recurring?</span>
                </label>
              </div>
              <div>
                <label className={labelCls}>Penalty $</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="text" value={v.penalty || ''} onChange={e => update('penalty', e.target.value)}
                    aria-label="Penalty amount" placeholder="0.00" className={inputCls + ' pl-7'} />
                </div>
              </div>
            </div>
          </div>

          {/* History / Penalty sub-tabs */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <div className="flex gap-1 mb-3">
              <span className="px-3 py-1.5 text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg">History</span>
              <span className="px-3 py-1.5 text-xs font-medium text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">Penalty</span>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-2 font-bold text-gray-500 dark:text-gray-400 uppercase">Inspection Date</th>
                    <th className="text-left px-4 py-2 font-bold text-gray-500 dark:text-gray-400 uppercase">Inspector PF</th>
                    <th className="text-left px-4 py-2 font-bold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-gray-400"><td colSpan={3} className="px-4 py-6 text-center text-xs">No history records yet.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors">
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inspection Entry ─────────────────────────────────────────────────────────

export default function InspectionEntry() {
  const [activeTab, setActiveTab] = useState('entry');

  // ── Header fields ──
  const [inspectionNum] = useState(generateInspNum);
  const [systemId, setSystemId] = useState('');
  const [stateReg, setStateReg] = useState('');
  const [registrationId, setRegistrationId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [contactName, setContactName] = useState('');

  // ── Scheduling ──
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [reinspectionDate, setReinspectionDate] = useState('');
  const [station, setStation] = useState('14');
  const [inspectorName, setInspectorName] = useState('');
  const [additionalInspectors, setAdditionalInspectors] = useState('');

  // ── Entry details ──
  const [accessToBuilding, setAccessToBuilding] = useState(true);
  const [buildingStatus, setBuildingStatus] = useState('');
  const [manualInspection, setManualInspection] = useState(false);
  const [selfInspection, setSelfInspection] = useState(false);
  const [printCodeSections, setPrintCodeSections] = useState(true);

  // ── Inspection types selected ──
  const [selectedTypes, setSelectedTypes] = useState([]);

  // ── Violations ──
  const [violations, setViolations] = useState([]);
  const [noViolationFound, setNoViolationFound] = useState(false);
  const [selectedViolations, setSelectedViolations] = useState([]);
  const [showDetailForm, setShowDetailForm] = useState(null); // violation id
  const [showAllViolations, setShowAllViolations] = useState(false);
  const [selectedChecklist, setSelectedChecklist] = useState(INSPECTION_CHECKLISTS[0]);

  // ── Batch update ──
  const [batchAbateBy, setBatchAbateBy] = useState('');
  const [batchStatus, setBatchStatus] = useState('');
  const [batchVoid, setBatchVoid] = useState(false);

  // ── Remarks ──
  const [remarks, setRemarks] = useState('');
  const [printRemarks, setPrintRemarks] = useState(false);

  // ── Penalties ──
  const [initialPenalty, setInitialPenalty] = useState('');
  const [additionalPenalty, setAdditionalPenalty] = useState('');

  // ── Notes ──
  const [notes, setNotes] = useState('');

  // ── Attachments ──
  const [attachments, setAttachments] = useState([]);

  const selectedProperty = initialProperties.find(p => String(p.id) === String(propertyId));

  function toggleType(type) {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }

  let nextSeq = violations.length > 0 ? Math.max(...violations.map(v => v.seq || 0)) + 1 : 1;

  function addViolation() {
    const seq = nextSeq;
    setViolations(prev => [...prev, {
      id: Date.now(),
      seq,
      code: '',
      description: '',
      status: 'New Violation',
      floor: 'General',
      location: 'Building',
      category: '',
      action: '',
      notes: '',
      abateBy: '',
      penalty: '',
      includeInPrint: true,
      inspType: 'Periodic',
      imminentHazard: false,
      recurring: false,
    }]);
  }

  function updateViolation(id, field, value) {
    setViolations(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
  }

  function removeViolation(id) {
    setViolations(prev => prev.filter(v => v.id !== id));
    setSelectedViolations(prev => prev.filter(vid => vid !== id));
  }

  function toggleViolationSelect(id) {
    setSelectedViolations(prev =>
      prev.includes(id) ? prev.filter(vid => vid !== id) : [...prev, id]
    );
  }

  function selectAllViolations() {
    if (selectedViolations.length === violations.length) {
      setSelectedViolations([]);
    } else {
      setSelectedViolations(violations.map(v => v.id));
    }
  }

  function handleBatchUpdate() {
    setViolations(prev => prev.map(v => {
      if (!selectedViolations.includes(v.id)) return v;
      const updated = { ...v };
      if (batchAbateBy) updated.abateBy = batchAbateBy;
      if (batchStatus) updated.status = batchStatus;
      if (batchVoid) updated.status = 'Void';
      return updated;
    }));
    setSelectedViolations([]);
  }

  const tabs = [
    { id: 'entry', label: 'Inspection Entry' },
    { id: 'violations', label: 'Violations' },
    { id: 'notes', label: 'Notes' },
    { id: 'attachments', label: 'Attachment' },
    { id: 'remote', label: 'Remote Inspection Data' },
    { id: 'map', label: 'Map' },
  ];

  const detailViolation = showDetailForm ? violations.find(v => v.id === showDetailForm) : null;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Detail Form Modal */}
      {detailViolation && (
        <ViolationDetailForm
          violation={detailViolation}
          onUpdate={updateViolation}
          onClose={() => setShowDetailForm(null)}
          inspectionNum={inspectionNum}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Inspection Entry</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create a new fire inspection record</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Search size={16} /> Lookup Property
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
            <Save size={16} /> Save Inspection
          </button>
        </div>
      </div>

      {/* Inspection Header Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm p-6 mb-4">
        {/* Row 1: IDs */}
        <div className="grid grid-cols-5 gap-4 mb-4">
          <div>
            <label className={labelCls}>Inspection #</label>
            <input type="text" value={inspectionNum} readOnly className={inputCls + ' bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 font-mono'} />
          </div>
          <div>
            <label className={labelCls}>System ID #</label>
            <input type="text" value={systemId} onChange={e => setSystemId(e.target.value)} aria-label="System ID number" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>State Reg #</label>
            <input type="text" value={stateReg} onChange={e => setStateReg(e.target.value)} aria-label="State Reg number" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Registration ID</label>
            <input type="text" value={registrationId} onChange={e => setRegistrationId(e.target.value)} aria-label="Registration ID" className={inputCls} />
          </div>
          <div className="flex items-end justify-center">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
              <Camera size={20} className="text-gray-400" />
              <span className="text-[9px] text-gray-400 mt-1">Photo</span>
            </div>
          </div>
        </div>

        {/* Row 2: Property */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="col-span-2">
            <label className={labelCls}>Occupancy / Property Name</label>
            <select value={propertyId} onChange={e => setPropertyId(e.target.value)} aria-label="Occupancy / Property Name" className={selectCls}>
              <option value="">Select a property...</option>
              {initialProperties.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.address}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Contact</label>
            <input type="text" value={contactName || selectedProperty?.contactName || ''}
              onChange={e => setContactName(e.target.value)}
              aria-label="Contact" placeholder="Contact person..." className={inputCls} />
          </div>
        </div>

        {/* Property quick info */}
        {selectedProperty && (
          <div className="flex items-center gap-4 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/50 rounded-xl mb-4 text-xs text-blue-800 dark:text-blue-300">
            <Building2 size={14} />
            <span className="font-medium">{selectedProperty.occupancyType}</span>
            <span>|</span>
            <span>{selectedProperty.squareFootage?.toLocaleString()} sq ft</span>
            <span>|</span>
            <span>{selectedProperty.stories} {selectedProperty.stories === 1 ? 'story' : 'stories'}</span>
            <span>|</span>
            <span>Occ. Load: {selectedProperty.occupantLoad}</span>
            {selectedProperty.sprinklered && <span className="text-green-700 dark:text-green-300 font-semibold">Sprinklered</span>}
            {!selectedProperty.sprinklered && <span className="text-amber-700 dark:text-amber-300 font-semibold">No Sprinkler</span>}
            {selectedProperty.hazmatOnsite && <span className="text-red-700 dark:text-red-300 font-semibold">HAZMAT ON SITE</span>}
          </div>
        )}

        {/* Row 3: Dates & Station */}
        <div className="grid grid-cols-5 gap-4 mb-4 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div>
            <label className={labelCls}>Inspection Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} aria-label="Inspection Start Date" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} aria-label="End Date" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Reinspection Date</label>
            <input type="date" value={reinspectionDate} onChange={e => setReinspectionDate(e.target.value)} aria-label="Reinspection Date" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Station</label>
            <select value={station} onChange={e => setStation(e.target.value)} aria-label="Station" className={selectCls}>
              <option value="14">Station 14</option>
            </select>
          </div>
          <div />
        </div>

        {/* Row 4: Inspectors */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Inspector</label>
            <select value={inspectorName} onChange={e => setInspectorName(e.target.value)} aria-label="Inspector" className={selectCls}>
              <option value="">Select inspector...</option>
              <option value="Sarah Chen">Sarah Chen — Fire Chief</option>
              <option value="Maria Delgado">Maria Delgado — Captain</option>
              <option value="B/C Simmons">B/C Simmons — Battalion Chief</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Additional Inspectors</label>
            <input type="text" value={additionalInspectors} onChange={e => setAdditionalInspectors(e.target.value)}
              aria-label="Additional Inspectors" placeholder="Names of additional inspectors..." className={inputCls} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 border border-gray-100 dark:border-gray-700 border-b-white -mb-px relative z-10'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-950'
            }`}
          >
            {tab.label}
            {tab.id === 'violations' && violations.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                {violations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-b-2xl rounded-tr-2xl shadow-sm p-6">

        {/* ── Inspection Entry Tab ── */}
        {activeTab === 'entry' && (
          <>
            {/* Options row */}
            <div className="flex items-center gap-6 mb-5 pb-4 border-b border-gray-100 dark:border-gray-700 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={accessToBuilding} onChange={e => setAccessToBuilding(e.target.checked)}
                  className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Access to Building</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={manualInspection} onChange={e => setManualInspection(e.target.checked)}
                  className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Manual / Unscheduled</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selfInspection} onChange={e => setSelfInspection(e.target.checked)}
                  className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Allow Self-Inspection</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={printCodeSections} onChange={e => setPrintCodeSections(e.target.checked)}
                  className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Print Code Sections</span>
              </label>
              <div className="ml-auto flex items-center gap-2">
                <label className={labelCls + ' mb-0'}>Building Status</label>
                <select value={buildingStatus} onChange={e => setBuildingStatus(e.target.value)} aria-label="Building Status" className={selectCls + ' w-40'}>
                  <option value="">— Select —</option>
                  <option value="occupied">Occupied</option>
                  <option value="vacant">Vacant</option>
                  <option value="under-construction">Under Construction</option>
                  <option value="condemned">Condemned</option>
                </select>
              </div>
            </div>

            {/* Inspection Type Selection */}
            <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide mb-3">
              Select Inspection Types to Perform
            </h3>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700">
                    <th className="w-12 px-4 py-2.5 text-center">
                      <input type="checkbox"
                        aria-label="Select all inspection types"
                        checked={selectedTypes.length === INSPECTION_TYPES.length}
                        onChange={e => setSelectedTypes(e.target.checked ? [...INSPECTION_TYPES] : [])}
                        className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Inspection Type</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-32">Cycle</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-36">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {INSPECTION_TYPES.map(type => (
                    <tr key={type} className="border-b border-gray-50 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => toggleType(type)}>
                      <td className="px-4 py-2 text-center">
                        <input type="checkbox" aria-label={`Select ${type}`} checked={selectedTypes.includes(type)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleType(type)}
                          className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{type}</td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                        {type === 'Annual Inspection' ? 'Annual' : type === 'Follow-Up Inspection' ? '90 Days' : '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Violation Status / Penalties */}
            <div className="flex items-center gap-6 pt-4 border-t border-gray-100 dark:border-gray-700 flex-wrap">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Violation Status:</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={noViolationFound} onChange={e => { setNoViolationFound(e.target.checked); if (e.target.checked) setViolations([]); }}
                  className="w-4 h-4 text-green-500 rounded focus:ring-green-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">No Violation Found</span>
              </label>
              <button onClick={() => { setActiveTab('violations'); addViolation(); }}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 text-sm font-medium rounded-lg hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors">
                <AlertTriangle size={14} /> Enter Violations
              </button>

              <div className="ml-auto flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Initial Penalty</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="text" value={initialPenalty} onChange={e => setInitialPenalty(e.target.value)}
                      aria-label="Initial Penalty" placeholder="0.00" className={inputCls + ' w-28 pl-7'} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Additional</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="text" value={additionalPenalty} onChange={e => setAdditionalPenalty(e.target.value)}
                      aria-label="Additional Penalty" placeholder="0.00" className={inputCls + ' w-28 pl-7'} />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Violations Tab ── */}
        {activeTab === 'violations' && (
          <>
            {/* Add Violations Toolbar */}
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Add Violations using</span>
              <button onClick={() => { addViolation(); setTimeout(() => setShowDetailForm(violations.length > 0 ? violations[violations.length - 1]?.id : null), 50); }}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm">
                <Edit3 size={14} /> Detail Form
              </button>
              <span className="text-xs text-gray-400 font-medium">OR</span>
              <select value={selectedChecklist} onChange={e => setSelectedChecklist(e.target.value)} aria-label="Inspection checklist" className={selectCls + ' w-64'}>
                {INSPECTION_CHECKLISTS.map(cl => <option key={cl} value={cl}>{cl}</option>)}
              </select>
              <button onClick={addViolation}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm">
                Checklist
              </button>
            </div>

            {/* Select All / Show All */}
            <div className="flex items-center gap-6 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selectedViolations.length === violations.length && violations.length > 0}
                  onChange={selectAllViolations}
                  className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                <span className="text-xs text-gray-600 dark:text-gray-300">Select All</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showAllViolations} onChange={e => setShowAllViolations(e.target.checked)}
                  className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                <span className="text-xs text-gray-600 dark:text-gray-300">Show All</span>
              </label>
              {violations.length > 0 && (
                <span className="ml-auto text-xs text-gray-400">Right click to change the status</span>
              )}
            </div>

            {/* Violations Table */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-red-50 dark:bg-red-950/50 border-b border-red-100 dark:border-red-900">
                    <th className="w-8 px-2 py-2.5 text-center">
                      <span className="text-xs font-bold text-red-700 dark:text-red-300">X</span>
                    </th>
                    <th className="w-10 px-2 py-2.5 text-center text-xs font-bold text-red-700 dark:text-red-300">Chk</th>
                    <th className="w-12 px-2 py-2.5 text-left text-xs font-bold text-red-700 dark:text-red-300">Seq#</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-red-700 dark:text-red-300">Floor</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-red-700 dark:text-red-300">Location</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-red-700 dark:text-red-300">Category</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-red-700 dark:text-red-300">Action</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-red-700 dark:text-red-300">Violation Code</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-red-700 dark:text-red-300">Notes</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-red-700 dark:text-red-300 w-28">Abate By</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-red-700 dark:text-red-300 w-24">Status</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-red-700 dark:text-red-300 w-20">Penalty</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-10 text-gray-400">
                        <Shield size={28} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                        <p className="text-sm">No violations recorded. Use Detail Form or Checklist above to add.</p>
                      </td>
                    </tr>
                  ) : (
                    violations.map((v, idx) => (
                      <tr key={v.id} className={`border-b border-gray-50 hover:bg-amber-50/40 cursor-pointer ${selectedViolations.includes(v.id) ? 'bg-blue-50 dark:bg-blue-950/50' : ''}`}
                        onDoubleClick={() => setShowDetailForm(v.id)}>
                        <td className="px-2 py-2 text-center">
                          <button onClick={() => removeViolation(v.id)} aria-label="Remove violation" className="text-red-400 hover:text-red-600" title="Remove">
                            <X size={14} />
                          </button>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" aria-label={`Select violation ${v.seq || ''}`} checked={selectedViolations.includes(v.id)}
                            onChange={() => toggleViolationSelect(v.id)}
                            className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                        </td>
                        <td className="px-2 py-2 text-gray-600 dark:text-gray-300 font-mono text-xs">{v.seq || idx + 1}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs">{v.floor || '—'}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs">{v.location || '—'}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs">{v.category || '—'}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs">{v.action || '—'}</td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 text-xs font-medium">{v.code || '—'}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300 text-xs truncate max-w-[140px]" title={v.notes || v.description || ''}>
                          {v.notes || v.description || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <input type="date" aria-label="Abate by date" value={v.abateBy || ''} onChange={e => updateViolation(v.id, 'abateBy', e.target.value)}
                            className="text-xs px-1.5 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded w-full dark:text-gray-100" />
                        </td>
                        <td className="px-3 py-2">
                          <select aria-label="Violation status" value={v.status} onChange={e => updateViolation(v.id, 'status', e.target.value)}
                            className="text-xs px-1.5 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded w-full dark:text-gray-100">
                            {VIOLATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300 text-xs">{v.penalty ? `$${v.penalty}` : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Batch Update Bar */}
            <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 flex-wrap">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase">Batch Update</span>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Abate By</label>
                <input type="date" aria-label="Batch abate by date" value={batchAbateBy} onChange={e => setBatchAbateBy(e.target.value)}
                  className="text-xs px-2 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-gray-100" />
              </div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Status</span>
              <div className="flex items-center gap-3">
                {['Abated', 'UnAbated', 'Withdrawn', 'Time Extension', 'Recommended'].map(s => (
                  <label key={s} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name="batchStatus" value={s}
                      checked={batchStatus === s} onChange={e => setBatchStatus(e.target.value)}
                      className="w-3.5 h-3.5 text-red-600 dark:text-red-400 focus:ring-red-400" />
                    <span className="text-xs text-gray-600 dark:text-gray-300">{s}</span>
                  </label>
                ))}
              </div>
              <button onClick={handleBatchUpdate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shadow-sm">
                <RotateCcw size={12} /> Batch Update
              </button>
              <label className="flex items-center gap-1.5 cursor-pointer ml-1">
                <input type="checkbox" checked={batchVoid} onChange={e => setBatchVoid(e.target.checked)}
                  className="w-3.5 h-3.5 text-red-500 rounded focus:ring-red-400" />
                <span className="text-xs text-gray-600 dark:text-gray-300">Void</span>
              </label>
            </div>

            {/* Remarks */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase">Remarks</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={printRemarks} onChange={e => setPrintRemarks(e.target.checked)}
                    className="w-3.5 h-3.5 text-red-500 rounded focus:ring-red-400" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Print these remarks on the violation notice</span>
                </label>
              </div>
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
                aria-label="Remarks"
                rows={3} placeholder="Enter remarks..."
                className={inputCls + ' resize-y'} />
            </div>
          </>
        )}

        {/* ── Notes Tab ── */}
        {activeTab === 'notes' && (
          <div>
            <label className={labelCls}>Inspection Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              aria-label="Inspection Notes"
              rows={8} placeholder="Enter notes about this inspection..."
              className={inputCls + ' resize-y'} />
          </div>
        )}

        {/* ── Attachments Tab ── */}
        {activeTab === 'attachments' && (
          <div>
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:border-red-300 hover:bg-red-50/30 transition-colors cursor-pointer">
              <Paperclip size={28} className="mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Drop files here or click to upload</p>
              <p className="text-xs text-gray-400">Photos, documents, PDFs — up to 25 MB each</p>
            </div>
            {attachments.length === 0 && (
              <p className="text-center text-xs text-gray-400 mt-4">No attachments yet.</p>
            )}
          </div>
        )}

        {/* ── Remote Inspection Data Tab ── */}
        {activeTab === 'remote' && (
          <div className="text-center py-12">
            <Radio size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Remote Inspection Data</h3>
            <p className="text-xs text-gray-400">Remote inspection records and self-inspection submissions will appear here.</p>
          </div>
        )}

        {/* ── Map Tab ── */}
        {activeTab === 'map' && (
          <div className="text-center py-12">
            <MapPin size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Inspection Location Map</h3>
            <p className="text-xs text-gray-400 mb-4">View the inspection location and surrounding area.</p>
            {selectedProperty ? (
              <div className="bg-gray-100 dark:bg-gray-800 rounded-xl h-64 flex items-center justify-center text-gray-400 text-sm">
                <MapPin size={18} className="mr-2" />
                {selectedProperty.address}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Select a property above to view its location.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
