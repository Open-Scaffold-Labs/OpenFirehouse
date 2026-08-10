import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Download, Search, ChevronDown, ChevronUp,
  CheckCircle, Clock, Send, AlertTriangle, Link, X, ShieldCheck,
} from 'lucide-react';
import {
  NFIRS_STATUSES, STATUS_COLORS,
  INCIDENT_TYPE_CODES, FDID, NFIRS_VERSION, NERIS_VERSION,
} from '../data/nfirs';
import NFIRSForm from './NFIRSForm';
import { api } from '../utils/api';
import { downloadNerisJson } from '../utils/nerisExport';
import { downloadNfirsFlatFile } from '../utils/nfirsFlatFile';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(num, den) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

function completeness(r) {
  const required = [
    r.incidentDate, r.alarmTime, r.arrivalTime, r.clearedTime,
    r.incidentTypeCode, r.streetName, r.city, r.state, r.zip,
    r.propertyUseCode, r.action1,
    r.suppressionApparatus !== '' && r.suppressionApparatus >= 0,
    r.officerInCharge,
  ];
  if (r.isStructureFire) {
    required.push(r.structureType, r.fireOriginCode, r.fireCauseCode, r.detectorPresence, r.sprinklerPresence);
  }
  const filled = required.filter(Boolean).length;
  return pct(filled, required.length);
}

function incidentLabel(code) {
  return INCIDENT_TYPE_CODES.find(c => c.code === code)?.label ?? code;
}

async function exportSingleReport(report, format = 'nfirs') {
  if (format === 'neris') {
    // D4: the NERIS payload is built by the ONE server-side transformer
    // (live IncidentPayload shape) — the client only downloads it.
    const res = await api.get(`/api/nfirs-reports/${report.id}/neris`);
    downloadNerisJson(res.data, `NERIS_${report.incidentNumber}_${report.incidentDate}.json`);
  } else {
    // W4.1 (roadmap 2.5): real NFIRS 5.0 flat-file (caret-delimited Basic
    // Module transactions) — what state import clients actually ingest.
    // The old path was a raw JSON dump of internal records labeled "NFIRS".
    downloadNfirsFlatFile(
      [report],
      { fdid: report.fdid || FDID, state: report.state || '' },
      `NFIRS_${report.incidentNumber}_${report.incidentDate}.txt`
    );
  }
}

async function exportAllReports(reports, format = 'nfirs') {
  if (format === 'neris') {
    // D4: server-built bundle (live IncidentPayload shape per report).
    const res = await api.get('/api/nfirs-reports/neris/export');
    downloadNerisJson(res.data);
  } else {
    // W4.1 (roadmap 2.5): NFIRS 5.0 flat file for the whole set.
    downloadNfirsFlatFile(reports, { fdid: FDID });
  }
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }) {
  const icons = { Draft: Clock, Complete: CheckCircle, Submitted: Send };
  const Icon  = icons[status] ?? Clock;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
      <Icon size={10} />
      {status}
    </span>
  );
}

// ─── Completeness bar ─────────────────────────────────────────────────────────

function CompletenessBar({ pct: p }) {
  const color = p === 100 ? 'bg-green-500' : p >= 70 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 w-8 text-right">{p}%</span>
    </div>
  );
}

// ─── Expanded detail ──────────────────────────────────────────────────────────

function NerisValidationCard({ report }) {
  // D4: validation comes from the ONE server-side transformer's response.
  const [result, setResult] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get(`/api/nfirs-reports/${report.id}/neris`)
      .then((res) => { if (alive) setResult(res.data?.validation || null); })
      .catch(() => { if (alive) setResult(null); });
    return () => { alive = false; };
  }, [report.id]);

  if (!result) {
    return (
      <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-purple-600 dark:text-purple-400" />
          <p className="text-xs font-bold text-purple-900 dark:text-purple-200">NERIS Validation</p>
          <span className="text-[10px] text-purple-500 dark:text-purple-400">checking…</span>
        </div>
      </div>
    );
  }

  const barColor = result.completeness === 100 ? 'bg-green-500'
    : result.completeness >= 70 ? 'bg-blue-500' : 'bg-amber-500';

  return (
    <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-purple-600 dark:text-purple-400" />
          <p className="text-xs font-bold text-purple-900 dark:text-purple-200">NERIS Validation</p>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          result.valid ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
        }`}>
          {result.valid ? 'VALID' : `${result.errors.length} ERROR${result.errors.length > 1 ? 'S' : ''}`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-purple-100 dark:bg-purple-950/50 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${result.completeness}%` }} />
        </div>
        <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 w-10 text-right">{result.completeness}%</span>
      </div>
      {result.errors.length > 0 && (
        <div className="space-y-0.5">
          {result.errors.map((e, i) => (
            <p key={i} className="text-[10px] text-red-600 dark:text-red-400 flex items-center gap-1">
              <X size={8} className="flex-shrink-0" /> {e}
            </p>
          ))}
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="space-y-0.5">
          {result.warnings.slice(0, 3).map((w, i) => (
            <p key={i} className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle size={8} className="flex-shrink-0" /> {w}
            </p>
          ))}
          {result.warnings.length > 3 && (
            <p className="text-[10px] text-amber-500">+{result.warnings.length - 3} more warnings</p>
          )}
        </div>
      )}
    </div>
  );
}

function ExpandedDetail({ report, onEdit, onExport, exportFormat }) {
  const address = [
    report.streetNumber, report.streetPrefix, report.streetName,
    report.streetType, report.streetSuffix, report.aptSuite,
  ].filter(Boolean).join(' ');

  const Field = ({ label, value }) => (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-gray-800 dark:text-gray-100 font-medium">{value || '—'}</p>
    </div>
  );

  return (
    <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-4">
      {/* NERIS Validation */}
      {exportFormat === 'neris' && <NerisValidationCard report={report} />}
      {/* Times */}
      <div>
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Times</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Alarm"      value={report.alarmTime}      />
          <Field label="Arrival"    value={report.arrivalTime}    />
          <Field label="Controlled" value={report.controlledTime} />
          <Field label="Cleared"    value={report.clearedTime}    />
        </div>
      </div>

      {/* Location & Property */}
      <div>
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Location & Property</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Address" value={address || report.streetName} />
          <Field label="City / State / ZIP" value={`${report.city}, ${report.state} ${report.zip}`} />
          <Field label="Property Use Code" value={report.propertyUseCode} />
        </div>
      </div>

      {/* Actions & Resources */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Actions Taken</p>
          <div className="space-y-1">
            {[report.action1, report.action2, report.action3].filter(Boolean).map((a,i) => (
              <p key={i} className="text-xs text-gray-700 dark:text-gray-300">• {a}</p>
            ))}
            {!report.action1 && <p className="text-xs text-gray-400">None recorded</p>}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Resources</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-center">
            {[
              { l: 'Suppr. App',    v: report.suppressionApparatus  },
              { l: 'Suppr. Pers',   v: report.suppressionPersonnel  },
              { l: 'EMS App',       v: report.emsApparatus          },
              { l: 'EMS Pers',      v: report.emsPersonnel          },
              { l: 'Other App',     v: report.otherApparatus        },
              { l: 'Other Pers',    v: report.otherPersonnel        },
            ].map(({ l, v }) => (
              <div key={l} className="bg-white dark:bg-gray-900 rounded-lg p-2 border border-gray-100 dark:border-gray-700">
                <p className="text-lg font-black text-gray-800 dark:text-gray-100">{v}</p>
                <p className="text-[9px] text-gray-400">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Casualties & Losses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Casualties</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {[
              { l: 'Civ Deaths', v: report.civilianDeaths,  warn: report.civilianDeaths > 0  },
              { l: 'Civ Injured', v: report.civilianInjuries, warn: report.civilianInjuries > 0 },
              { l: 'FS Deaths',  v: report.fsDeaths,         warn: report.fsDeaths > 0        },
              { l: 'FS Injured', v: report.fsInjuries,       warn: report.fsInjuries > 0      },
            ].map(({ l, v, warn }) => (
              <div key={l} className={`rounded-lg p-2 border ${warn ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-700'}`}>
                <p className={`text-lg font-black ${warn ? 'text-red-700 dark:text-red-300' : 'text-gray-800 dark:text-gray-100'}`}>{v}</p>
                <p className="text-[9px] text-gray-400">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Estimated Losses</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-center">
            {[
              { l: 'Property Loss', v: report.propertyLoss ? `$${parseInt(report.propertyLoss).toLocaleString()}` : '—' },
              { l: 'Contents Loss', v: report.contentsLoss ? `$${parseInt(report.contentsLoss).toLocaleString()}` : '—' },
            ].map(({ l, v }) => (
              <div key={l} className="bg-white dark:bg-gray-900 rounded-lg p-2 border border-gray-100 dark:border-gray-700">
                <p className="text-base font-black text-gray-800 dark:text-gray-100">{v}</p>
                <p className="text-[9px] text-gray-400">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Structure Fire */}
      {report.isStructureFire && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Structure Fire Module</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Structure Type"  value={report.structureType}    />
            <Field label="Origin Code"     value={report.fireOriginCode}   />
            <Field label="Cause Code"      value={report.fireCauseCode}    />
            <Field label="Stories Above"   value={report.storiesAboveGrade}/>
            <Field label="Detector"        value={`${report.detectorPresence || '—'} / ${report.detectorOperation || '—'}`} />
            <Field label="Sprinkler"       value={`${report.sprinklerPresence || '—'} / ${report.sprinklerOperation || '—'}`} />
          </div>
        </div>
      )}

      {/* Narrative */}
      {report.narrativeStatement && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Narrative</p>
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2">
            {report.narrativeStatement}
          </p>
        </div>
      )}

      {/* Officers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Prepared By"     value={report.preparedBy}     />
        <Field label="Officer in Charge" value={report.officerInCharge} />
        <Field label="Reviewed By"     value={report.reviewedBy}     />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={() => onEdit(report)}
          className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">
          Edit Report
        </button>
        <button onClick={() => onExport(report, exportFormat)}
          className="px-3 py-1.5 text-xs font-semibold bg-gray-800 text-white rounded-lg hover:bg-gray-900 flex items-center gap-1">
          <Download size={11} /> Export JSON
        </button>
        {report.linkedIncidentId && (
          <span className="px-3 py-1.5 text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 rounded-lg flex items-center gap-1">
            <Link size={11} /> Linked to Incident #{report.linkedIncidentId}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function NFIRSReports() {
  const [reports,    setReports]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [statusFlt,  setStatusFlt]  = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [formOpen,   setFormOpen]   = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [exportFormat, setExportFormat] = useState('nfirs');

  const filtered = reports.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q || r.incidentNumber.toLowerCase().includes(q)
      || r.streetName.toLowerCase().includes(q)
      || r.incidentTypeCode.includes(q);
    const matchS = statusFlt === 'All' || r.status === statusFlt;
    return matchQ && matchS;
  });

  const stats = {
    total:     reports.length,
    draft:     reports.filter(r => r.status === 'Draft').length,
    complete:  reports.filter(r => r.status === 'Complete').length,
    submitted: reports.filter(r => r.status === 'Submitted').length,
    withFire:  reports.filter(r => r.isStructureFire).length,
    nerisReady: reports.filter(r => r.status === 'Complete').length,
  };

  const fetchReports = useCallback(async () => {
    try {
      const raw = await api.get('/api/nfirs-reports');
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setReports(arr);
    } catch (e) {
      console.error('Failed to fetch NFIRS reports', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  async function handleSave(data) {
    try {
      if (data.id) {
        const { id, ...changes } = data;
        const res = await api.patch(`/api/nfirs-reports/${id}`, changes);
        setReports(prev => prev.map(r => r.id === id ? res.data : r));
      } else {
        const res = await api.post('/api/nfirs-reports', data);
        setReports(prev => [...prev, res.data]);
      }
    } catch (e) {
      console.error('Failed to save NFIRS report', e);
    }
    setFormOpen(false);
    setEditing(null);
  }

  function openEdit(r) {
    setEditing(r);
    setFormOpen(true);
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">NFIRS / NERIS Reports</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            FDID: <span className="font-mono font-bold text-gray-700 dark:text-gray-300">{FDID}</span>
            &nbsp;·&nbsp; {NFIRS_VERSION} compliant fields
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportAllReports(reports, exportFormat)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-gray-800 text-white rounded-xl hover:bg-gray-900">
            <Download size={14} /> Export All ({exportFormat === 'neris' ? 'NERIS' : 'NFIRS'})
          </button>
          <button onClick={() => { setEditing(null); setFormOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-sm">
            <Plus size={15} /> New Report
          </button>
        </div>
      </div>

      {/* NERIS Transition Banner */}
      <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertTriangle size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-900 dark:text-blue-200">NERIS Transition In Progress</p>
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed mt-0.5">
            The USFA is transitioning from NFIRS 5.0 to NERIS. New reports can be created with NERIS-compatible fields.
            Existing NFIRS reports remain valid and can be exported in either format.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-900 rounded-lg p-1 flex-shrink-0">
          <button
            onClick={() => setExportFormat('nfirs')}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
              exportFormat === 'nfirs' ? 'bg-blue-600 text-white' : 'text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/50'
            }`}
          >
            NFIRS 5.0
          </button>
          <button
            onClick={() => setExportFormat('neris')}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
              exportFormat === 'neris' ? 'bg-blue-600 text-white' : 'text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/50'
            }`}
          >
            NERIS
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Total Reports', value: stats.total,     color: 'text-gray-900 dark:text-gray-100' },
          { label: 'Draft',         value: stats.draft,     color: 'text-amber-700 dark:text-amber-300' },
          { label: 'Complete',      value: stats.complete,  color: 'text-blue-700 dark:text-blue-300'  },
          { label: 'Submitted',     value: stats.submitted, color: 'text-green-700 dark:text-green-300' },
          { label: 'Structure Fire', value: stats.withFire,  color: 'text-red-700 dark:text-red-300'   },
          { label: 'NERIS Ready',    value: stats.nerisReady, color: 'text-purple-700 dark:text-purple-300' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3 shadow-sm">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search incident number, address…"
            aria-label="Search reports by incident number or address"
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100" />
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {['All', ...NFIRS_STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFlt(s)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                statusFlt === s ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_2fr_1.5fr_1fr_1.2fr_1.2fr_0.8fr_24px] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          <span>Incident #</span>
          <span>Type</span>
          <span>Address</span>
          <span>Date</span>
          <span>Status</span>
          <span>Completeness</span>
          <span>Losses</span>
          <span />
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-12">No NFIRS reports match your filters.</p>
        )}

        {filtered.map(r => {
          const pctDone = completeness(r);
          const isOpen  = expandedId === r.id;
          return (
            <div key={r.id} className="border-b border-gray-50 last:border-b-0">
              <div
                onClick={() => setExpandedId(isOpen ? null : r.id)}
                role="button"
                tabIndex={0}
                aria-label={`Toggle details for report ${r.incidentNumber}`}
                aria-expanded={isOpen}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isOpen ? null : r.id); } }}
                className="grid grid-cols-[1fr_2fr_1.5fr_1fr_1.2fr_1.2fr_0.8fr_24px] gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 items-center"
              >
                <span className="font-mono text-sm font-bold text-gray-800 dark:text-gray-100">{r.incidentNumber}</span>
                <div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
                    {incidentLabel(r.incidentTypeCode)}
                  </p>
                  {r.isStructureFire && (
                    <span className="text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-1.5 py-0.5 rounded-full">Structure Fire</span>
                  )}
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                  {[r.streetNumber, r.streetName, r.streetType].filter(Boolean).join(' ')}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-300">{r.incidentDate}</span>
                <span><StatusChip status={r.status} /></span>
                <CompletenessBar pct={pctDone} />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  {r.propertyLoss ? `$${parseInt(r.propertyLoss).toLocaleString()}` : '—'}
                </span>
                {isOpen
                  ? <ChevronUp   size={14} className="text-gray-400" />
                  : <ChevronDown size={14} className="text-gray-400" />
                }
              </div>
              {isOpen && (
                <ExpandedDetail
                  report={r}
                  onEdit={openEdit}
                  onExport={exportSingleReport}
                  exportFormat={exportFormat}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
        <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          <strong>Submission Notice:</strong> This module captures and validates NFIRS 5.0 and NERIS 1.0 required fields and exports data in JSON format.
          Reports can be exported in either NFIRS or NERIS format using the toggle above.
          For NFIRS: Submit directly to the USFA NFIRS system (requires registration and certified FDID) or import into your state's submission client.
          For NERIS: Use NERIS exports for integration with the new National Emergency Response Information System.
        </p>
      </div>

      {/* Form modal */}
      {formOpen && (
        <NFIRSForm
          initial={editing}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
