import { useState, useMemo } from 'react';
import {
  Search, Filter, FileSearch, ChevronDown, CheckCircle, XCircle,
  AlertTriangle, Clock, Calendar, MapPin, User, Building2, Shield,
} from 'lucide-react';
import {
  INSPECTION_TYPES, INSPECTION_RESULTS, VIOLATION_CODES,
  PERMIT_TYPES, initialProperties, initialInspections, initialPermits,
} from '../data/fireInspections';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function resultBadge(result) {
  if (!result) return <span className="text-xs text-gray-400 italic">Pending</span>;
  const colors = {
    'Pass': 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
    'Pass with Violations': 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
    'Fail': 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300',
    'Reinspection Required': 'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300',
    'Not Completed': 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[result] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
      {result}
    </span>
  );
}

// ─── Inspection Search ────────────────────────────────────────────────────────

export default function InspectionSearch() {
  const [activeTab, setActiveTab] = useState('basic');

  // ── Basic Search Filters ──
  const [searchType, setSearchType] = useState('due');     // 'due' | 'history'
  const [recordTypes, setRecordTypes] = useState({ inspection: true, permit: false, hydrant: false });
  const [inspectionNum, setInspectionNum] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [inspectionType, setInspectionType] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [noEntry, setNoEntry] = useState(false);

  // ── Assignment Filters ──
  const [inspectorName, setInspectorName] = useState('');
  const [station, setStation] = useState('');
  const [cycle, setCycle] = useState('');

  // ── Location Filters ──
  const [zone, setZone] = useState('');
  const [address, setAddress] = useState('');
  const [occupancyName, setOccupancyName] = useState('');
  const [propertyUseCode, setPropertyUseCode] = useState('');

  // ── Violation Filters ──
  const [violationCode, setViolationCode] = useState('');
  const [violationStatus, setViolationStatus] = useState('');

  // ── Search state ──
  const [hasSearched, setHasSearched] = useState(false);

  // ── Build results ──
  const results = useMemo(() => {
    if (!hasSearched) return [];

    let items = initialInspections.map(insp => {
      const prop = initialProperties.find(p => p.id === insp.propertyId);
      return { ...insp, property: prop };
    });

    // Filter by inspector
    if (inspectorName) {
      items = items.filter(i => i.inspectorName?.toLowerCase().includes(inspectorName.toLowerCase()));
    }
    // Filter by type
    if (inspectionType) {
      items = items.filter(i => i.type === inspectionType);
    }
    // Filter by result
    if (resultFilter) {
      items = items.filter(i => i.result === resultFilter);
    }
    // Filter by address / occupancy name
    if (address) {
      items = items.filter(i => i.property?.address?.toLowerCase().includes(address.toLowerCase()));
    }
    if (occupancyName) {
      items = items.filter(i => i.property?.name?.toLowerCase().includes(occupancyName.toLowerCase()));
    }
    // Filter by date range
    if (dateFrom) {
      items = items.filter(i => (i.completedDate || i.scheduledDate) >= dateFrom);
    }
    if (dateTo) {
      items = items.filter(i => (i.completedDate || i.scheduledDate) <= dateTo);
    }
    // Violation tab filters
    if (activeTab === 'violations') {
      items = items.filter(i => i.violations?.length > 0);
      if (violationCode) {
        items = items.filter(i => i.violations.some(v => v.code === violationCode));
      }
      if (violationStatus) {
        items = items.filter(i => i.violations.some(v => v.status === violationStatus));
      }
    }

    return items;
  }, [hasSearched, inspectorName, inspectionType, resultFilter, address, occupancyName, dateFrom, dateTo, activeTab, violationCode, violationStatus]);

  function handleSearch() {
    setHasSearched(true);
  }

  function handleClear() {
    setInspectionNum(''); setDateFrom(''); setDateTo('');
    setInspectionType(''); setResultFilter(''); setNoEntry(false);
    setInspectorName(''); setStation(''); setCycle('');
    setZone(''); setAddress(''); setOccupancyName(''); setPropertyUseCode('');
    setViolationCode(''); setViolationStatus('');
    setHasSearched(false);
  }

  const inspectors = [...new Set(initialInspections.map(i => i.inspectorName).filter(Boolean))];

  // ── Shared input classes ──
  const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 dark:text-gray-100';
  const selectCls = inputCls + ' appearance-none';
  const labelCls = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Inspection Search</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Search inspections, permits, and violations across all properties</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {[{ id: 'basic', label: 'Basic' }, { id: 'violations', label: 'Violations' }].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-red-500 text-red-600 dark:text-red-400 bg-white dark:bg-gray-900'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search Form */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm p-6 mb-6">

        {activeTab === 'basic' && (
          <>
            {/* Search Type */}
            <div className="flex items-center gap-6 mb-5 pb-4 border-b border-gray-100 dark:border-gray-700">
              <span className={labelCls + ' mb-0'}>Search Type</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="searchType" checked={searchType === 'due'} onChange={() => setSearchType('due')}
                  className="w-4 h-4 text-red-500 focus:ring-red-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Inspection Due</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="searchType" checked={searchType === 'history'} onChange={() => setSearchType('history')}
                  className="w-4 h-4 text-red-500 focus:ring-red-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Inspection History</span>
              </label>

              <div className="ml-6 flex items-center gap-4">
                {['inspection', 'permit', 'hydrant'].map(type => (
                  <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={recordTypes[type]}
                      onChange={e => setRecordTypes(r => ({ ...r, [type]: e.target.checked }))}
                      className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-300 capitalize">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Row 1: ID & Dates */}
            <div className="grid grid-cols-5 gap-4 mb-4">
              <div>
                <label className={labelCls}>Inspection #</label>
                <input type="text" value={inspectionNum} onChange={e => setInspectionNum(e.target.value)}
                  aria-label="Inspection number" placeholder="e.g. 1234" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="Date From" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="Date To" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Inspection Type</label>
                <select value={inspectionType} onChange={e => setInspectionType(e.target.value)} aria-label="Inspection Type" className={selectCls}>
                  <option value="">All Types</option>
                  {INSPECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Result</label>
                <select value={resultFilter} onChange={e => setResultFilter(e.target.value)} aria-label="Result" className={selectCls}>
                  <option value="">All Results</option>
                  {INSPECTION_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {/* Inspection Assignment */}
            <div className="mb-4 pt-3 border-t border-gray-100 dark:border-gray-700">
              <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide mb-3 flex items-center gap-2">
                <User size={14} className="text-gray-400" /> Inspection Assignment
              </h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Inspector</label>
                  <select value={inspectorName} onChange={e => setInspectorName(e.target.value)} aria-label="Inspector" className={selectCls}>
                    <option value="">All Inspectors</option>
                    {inspectors.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Station</label>
                  <select value={station} onChange={e => setStation(e.target.value)} aria-label="Station" className={selectCls}>
                    <option value="">All Stations</option>
                    <option value="14">Station 14</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Cycle</label>
                  <select value={cycle} onChange={e => setCycle(e.target.value)} aria-label="Cycle" className={selectCls}>
                    <option value="">All</option>
                    <option value="annual">Annual</option>
                    <option value="semi-annual">Semi-Annual</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input type="checkbox" checked={noEntry} onChange={e => setNoEntry(e.target.checked)}
                      className="w-4 h-4 text-red-500 rounded focus:ring-red-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">No Entry Only</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="mb-5 pt-3 border-t border-gray-100 dark:border-gray-700">
              <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide mb-3 flex items-center gap-2">
                <MapPin size={14} className="text-gray-400" /> Location
              </h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Zone / District</label>
                  <select value={zone} onChange={e => setZone(e.target.value)} aria-label="Zone / District" className={selectCls}>
                    <option value="">All Zones</option>
                    <option value="north">North</option>
                    <option value="south">South</option>
                    <option value="east">East</option>
                    <option value="west">West</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input type="text" value={address} onChange={e => setAddress(e.target.value)} aria-label="Address"
                    placeholder="Street address..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Occupancy / Applicant Name</label>
                  <input type="text" value={occupancyName} onChange={e => setOccupancyName(e.target.value)} aria-label="Occupancy name"
                    placeholder="Business name..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Property Use Code</label>
                  <input type="text" value={propertyUseCode} onChange={e => setPropertyUseCode(e.target.value)}
                    aria-label="Property Use Code" placeholder="e.g. 580" className={inputCls} />
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'violations' && (
          <>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <label className={labelCls}>Violation Code</label>
                <select value={violationCode} onChange={e => setViolationCode(e.target.value)} aria-label="Violation Code" className={selectCls}>
                  <option value="">All Codes</option>
                  {VIOLATION_CODES.map(v => (
                    <option key={v.code} value={v.code}>{v.code} — {v.desc.substring(0, 50)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Violation Status</label>
                <select value={violationStatus} onChange={e => setViolationStatus(e.target.value)} aria-label="Violation Status" className={selectCls}>
                  <option value="">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="Corrected">Corrected</option>
                  <option value="Pending">Pending</option>
                  <option value="Referred to Legal">Referred to Legal</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Date From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="Date From" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="Date To" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <label className={labelCls}>Occupancy Name</label>
                <input type="text" value={occupancyName} onChange={e => setOccupancyName(e.target.value)} aria-label="Occupancy name"
                  placeholder="Business name..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Inspector</label>
                <select value={inspectorName} onChange={e => setInspectorName(e.target.value)} aria-label="Inspector" className={selectCls}>
                  <option value="">All Inspectors</option>
                  {inspectors.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} aria-label="Address"
                  placeholder="Street address..." className={inputCls} />
              </div>
              <div />
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={handleSearch}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
            <Search size={16} /> Search
          </button>
          <button onClick={handleClear}
            className="px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Clear
          </button>
          <span className="text-xs text-gray-400 ml-auto">
            {hasSearched && `${results.length} result${results.length !== 1 ? 's' : ''} found`}
          </span>
        </div>
      </div>

      {/* Results Table */}
      {hasSearched && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Insp #</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Property</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Type</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Inspector</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Result</th>
                <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Violations</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">No inspections match your search criteria.</td>
                </tr>
              ) : (
                results.map(insp => (
                  <tr key={insp.id} className="border-b border-gray-50 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                    <td className="px-5 py-3 font-mono text-gray-700 dark:text-gray-300">{String(insp.id).padStart(4, '0')}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{insp.property?.name}</p>
                      <p className="text-xs text-gray-400">{insp.property?.address}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{insp.type}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{insp.inspectorName}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{fmtDate(insp.completedDate || insp.scheduledDate)}</td>
                    <td className="px-5 py-3">{resultBadge(insp.result)}</td>
                    <td className="px-5 py-3 text-center">
                      {insp.violations?.length > 0 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-xs font-bold">
                          {insp.violations.length}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
