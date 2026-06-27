import { useState } from 'react';
import { Search, RotateCcw, ChevronDown, FileText, Building2, Calendar } from 'lucide-react';
import { initialProperties } from '../data/fireInspections';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 dark:text-gray-100';
const selectCls = inputCls + ' appearance-none';
const labelCls = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

const REGISTRATION_TYPES = [
  'Business Registration', 'Occupancy Registration', 'Fire Alarm System',
  'Sprinkler System', 'Commercial Kitchen Hood', 'High-Rise Building',
  'Assembly Venue', 'Daycare / School', 'Healthcare Facility',
  'Hotel / Motel', 'Hazardous Materials', 'Underground Storage Tank',
  'Above Ground Storage Tank', 'LP Gas Installation', 'Elevator',
  'Vacant Building', 'Multi-Family Dwelling',
];

const REG_STATUSES = ['Active', 'Expired', 'Pending', 'Suspended', 'Revoked'];

const SAMPLE_REGISTRATIONS = [
  { id: 1, regNum: 'REG-2024-001', type: 'Business Registration', property: 'Maplewood Town Center Mall', address: '1200 Commerce Blvd', status: 'Active', issued: '2024-03-01', expires: '2026-03-01', inspector: 'Maria Delgado' },
  { id: 2, regNum: 'REG-2024-002', type: 'Hazardous Materials', property: 'Apex Chemical Supply', address: '334 Industrial Pkwy', status: 'Active', issued: '2025-04-01', expires: '2026-04-01', inspector: 'Sarah Chen' },
  { id: 3, regNum: 'REG-2024-003', type: 'Fire Alarm System', property: 'Maplewood Elementary School', address: '88 Ridgeline Court', status: 'Active', issued: '2025-09-01', expires: '2027-09-01', inspector: 'Sarah Chen' },
  { id: 4, regNum: 'REG-2024-004', type: 'Multi-Family Dwelling', property: 'Riverdale Arms Apartments', address: '1847 Lakeview Blvd', status: 'Expired', issued: '2023-06-15', expires: '2025-06-15', inspector: 'Maria Delgado' },
  { id: 5, regNum: 'REG-2025-005', type: 'Assembly Venue', property: 'Maplewood VFW Post 8984', address: '412 Elmwood Drive', status: 'Active', issued: '2025-01-10', expires: '2027-01-10', inspector: 'Maria Delgado' },
  { id: 6, regNum: 'REG-2025-006', type: 'Commercial Kitchen Hood', property: 'Maplewood VFW Post 8984', address: '412 Elmwood Drive', status: 'Pending', issued: '', expires: '', inspector: '' },
];

// ─── Registration Search ──────────────────────────────────────────────────────

export default function RegistrationSearch() {
  const [activeTab, setActiveTab] = useState('basic');

  // ── Basic search ──
  const [searchType, setSearchType] = useState('history');
  const [regNumber, setRegNumber] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [regType, setRegType] = useState('');
  const [regStatus, setRegStatus] = useState('');

  // ── Assignment ──
  const [inspector, setInspector] = useState('');
  const [station, setStation] = useState('');

  // ── Location ──
  const [zone, setZone] = useState('');
  const [address, setAddress] = useState('');
  const [occupancyName, setOccupancyName] = useState('');
  const [propertyUseCode, setPropertyUseCode] = useState('');

  // ── Expiring ──
  const [expiringWithin, setExpiringWithin] = useState('');

  // ── Results ──
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);

  function handleSearch() {
    let filtered = [...SAMPLE_REGISTRATIONS];
    if (regNumber) filtered = filtered.filter(r => r.regNum.toLowerCase().includes(regNumber.toLowerCase()));
    if (regType) filtered = filtered.filter(r => r.type === regType);
    if (regStatus) filtered = filtered.filter(r => r.status === regStatus);
    if (occupancyName) filtered = filtered.filter(r => r.property.toLowerCase().includes(occupancyName.toLowerCase()));
    if (address) filtered = filtered.filter(r => r.address.toLowerCase().includes(address.toLowerCase()));
    if (inspector) filtered = filtered.filter(r => r.inspector === inspector);
    setResults(filtered);
    setSearched(true);
  }

  function handleClear() {
    setRegNumber(''); setDateFrom(''); setDateTo(''); setRegType(''); setRegStatus('');
    setInspector(''); setStation(''); setZone(''); setAddress('');
    setOccupancyName(''); setPropertyUseCode(''); setExpiringWithin('');
    setResults([]); setSearched(false);
  }

  const STATUS_COLORS = {
    Active: 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
    Expired: 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300',
    Pending: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300',
    Suspended: 'bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300',
    Revoked: 'bg-red-100 dark:bg-red-950/50 text-red-900 dark:text-red-200',
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Registration Search</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Search fire safety registrations by type, property, status, or expiration</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-0">
        {[{ id: 'basic', label: 'Basic Search' }, { id: 'expiring', label: 'Expiring / Due' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 border border-gray-100 dark:border-gray-700 border-b-white -mb-px relative z-10'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-950'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search Form */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-b-2xl rounded-tr-2xl shadow-sm p-6 mb-6">
        {activeTab === 'basic' && (
          <>
            {/* Search Type */}
            <div className="flex items-center gap-6 mb-5 pb-4 border-b border-gray-100 dark:border-gray-700">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Search Type:</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="searchType" value="due" checked={searchType === 'due'}
                  onChange={e => setSearchType(e.target.value)} className="w-4 h-4 text-red-600 dark:text-red-400 focus:ring-red-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Registration Due</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="searchType" value="history" checked={searchType === 'history'}
                  onChange={e => setSearchType(e.target.value)} className="w-4 h-4 text-red-600 dark:text-red-400 focus:ring-red-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Registration History</span>
              </label>
            </div>

            {/* Row 1: Reg #, Dates, Type, Status */}
            <div className="grid grid-cols-5 gap-4 mb-5">
              <div>
                <label className={labelCls}>Registration #</label>
                <input type="text" value={regNumber} onChange={e => setRegNumber(e.target.value)}
                  placeholder="REG-XXXX-XXX" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Registration Type</label>
                <select value={regType} onChange={e => setRegType(e.target.value)} className={selectCls}>
                  <option value="">— All Types —</option>
                  {REGISTRATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={regStatus} onChange={e => setRegStatus(e.target.value)} className={selectCls}>
                  <option value="">— All —</option>
                  {REG_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Assignment */}
            <div className="mb-5 pb-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide mb-3">Assignment</h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Inspector</label>
                  <select value={inspector} onChange={e => setInspector(e.target.value)} className={selectCls}>
                    <option value="">— All —</option>
                    <option value="Sarah Chen">Sarah Chen</option>
                    <option value="Maria Delgado">Maria Delgado</option>
                    <option value="B/C Simmons">B/C Simmons</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Station</label>
                  <select value={station} onChange={e => setStation(e.target.value)} className={selectCls}>
                    <option value="">— All —</option>
                    <option value="14">Station 14</option>
                  </select>
                </div>
                <div />
                <div />
              </div>
            </div>

            {/* Location */}
            <div className="mb-5">
              <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide mb-3">Location</h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Zone / District</label>
                  <select value={zone} onChange={e => setZone(e.target.value)} className={selectCls}>
                    <option value="">— All —</option>
                    <option value="north">North</option>
                    <option value="south">South</option>
                    <option value="east">East</option>
                    <option value="west">West</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                    placeholder="Street address..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Occupancy / Name</label>
                  <input type="text" value={occupancyName} onChange={e => setOccupancyName(e.target.value)}
                    placeholder="Business name..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Property Use Code</label>
                  <input type="text" value={propertyUseCode} onChange={e => setPropertyUseCode(e.target.value)}
                    placeholder="Code..." className={inputCls} />
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'expiring' && (
          <div className="mb-5">
            <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide mb-3">Find Registrations Expiring Soon</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Expiring Within</label>
                <select value={expiringWithin} onChange={e => setExpiringWithin(e.target.value)} className={selectCls}>
                  <option value="">— Select —</option>
                  <option value="30">30 Days</option>
                  <option value="60">60 Days</option>
                  <option value="90">90 Days</option>
                  <option value="180">6 Months</option>
                  <option value="365">1 Year</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Registration Type</label>
                <select value={regType} onChange={e => setRegType(e.target.value)} className={selectCls}>
                  <option value="">— All Types —</option>
                  {REGISTRATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={regStatus} onChange={e => setRegStatus(e.target.value)} className={selectCls}>
                  <option value="">— All —</option>
                  {REG_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={handleSearch}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
            <Search size={16} /> Search
          </button>
          <button onClick={handleClear}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <RotateCcw size={14} /> Clear
          </button>
        </div>
      </div>

      {/* Results */}
      {searched && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
              Search Results <span className="text-gray-400 font-normal">({results.length} found)</span>
            </h3>
          </div>
          {results.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText size={28} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-sm">No registrations found matching your criteria.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Reg #</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Property</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Type</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Inspector</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Issued</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Expires</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300">{r.regNum}</td>
                    <td className="px-4 py-2.5">
                      <div className="text-gray-900 dark:text-gray-100 font-medium">{r.property}</div>
                      <div className="text-xs text-gray-400">{r.address}</div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{r.type}</td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{r.inspector || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{r.issued || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{r.expires || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[r.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
