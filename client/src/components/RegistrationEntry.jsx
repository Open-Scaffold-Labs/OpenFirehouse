import { useState } from 'react';
import {
  Save, Search, Camera, Building2, Plus, Trash2, FileText,
  Paperclip, MapPin, X, Calendar,
} from 'lucide-react';
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
const CYCLES = ['Annual', 'Bi-Annual', '3 Year', '5 Year', 'One-Time'];

function generateRegNum() {
  const yr = new Date().getFullYear();
  return `REG-${yr}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

// ─── Registration Entry ───────────────────────────────────────────────────────

export default function RegistrationEntry() {
  const [activeTab, setActiveTab] = useState('details');

  // ── Header ──
  const [regNum] = useState(generateRegNum);
  const [systemId, setSystemId] = useState('');
  const [stateRegNum, setStateRegNum] = useState('');
  const [fpbRegId, setFpbRegId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [contactName, setContactName] = useState('');

  // ── Registration details ──
  const [regType, setRegType] = useState('');
  const [regStatus, setRegStatus] = useState('Active');
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiresDate, setExpiresDate] = useState('');
  const [renewalDate, setRenewalDate] = useState('');
  const [cycle, setCycle] = useState('Annual');
  const [station, setStation] = useState('14');
  const [inspector, setInspector] = useState('');

  // ── Fees ──
  const [regFee, setRegFee] = useState('');
  const [lateFee, setLateFee] = useState('');
  const [totalFee, setTotalFee] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('Unpaid');
  const [paymentDate, setPaymentDate] = useState('');
  const [receiptNum, setReceiptNum] = useState('');

  // ── Conditions ──
  const [conditions, setConditions] = useState('');

  // ── Notes ──
  const [notes, setNotes] = useState('');

  // ── Attachments ──
  const [attachments, setAttachments] = useState([]);

  // ── History ──
  const [history] = useState([]);

  const selectedProperty = initialProperties.find(p => String(p.id) === String(propertyId));

  const tabs = [
    { id: 'details', label: 'Registration Details' },
    { id: 'fees', label: 'Fees & Payment' },
    { id: 'conditions', label: 'Conditions' },
    { id: 'notes', label: 'Notes' },
    { id: 'attachments', label: 'Attachments' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Registration Entry</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create or update a fire safety registration record</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Search size={16} /> Lookup Property
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
            <Save size={16} /> Save Registration
          </button>
        </div>
      </div>

      {/* Registration Header Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm p-6 mb-4">
        {/* Row 1: IDs */}
        <div className="grid grid-cols-5 gap-4 mb-4">
          <div>
            <label className={labelCls}>Registration #</label>
            <input type="text" value={regNum} readOnly className={inputCls + ' bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 font-mono'} />
          </div>
          <div>
            <label className={labelCls}>System ID #</label>
            <input type="text" value={systemId} onChange={e => setSystemId(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>State Reg #</label>
            <input type="text" value={stateRegNum} onChange={e => setStateRegNum(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>FPB Registration ID</label>
            <input type="text" value={fpbRegId} onChange={e => setFpbRegId(e.target.value)} className={inputCls} />
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
            <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className={selectCls}>
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
              placeholder="Contact person..." className={inputCls} />
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
            {selectedProperty.sprinklered && <span className="text-green-700 dark:text-green-300 font-semibold">Sprinklered</span>}
            {!selectedProperty.sprinklered && <span className="text-amber-700 dark:text-amber-300 font-semibold">No Sprinkler</span>}
            {selectedProperty.hazmatOnsite && <span className="text-red-700 dark:text-red-300 font-semibold">HAZMAT ON SITE</span>}
          </div>
        )}

        {/* Row 3: Type, Status, Dates */}
        <div className="grid grid-cols-5 gap-4 pt-3 border-t border-gray-100 dark:border-gray-700 mb-4">
          <div>
            <label className={labelCls}>Registration Type</label>
            <select value={regType} onChange={e => setRegType(e.target.value)} className={selectCls}>
              <option value="">— Select Type —</option>
              {REGISTRATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select value={regStatus} onChange={e => setRegStatus(e.target.value)} className={selectCls}>
              {REG_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Issued Date</label>
            <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Expires Date</label>
            <input type="date" value={expiresDate} onChange={e => setExpiresDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Renewal Date</label>
            <input type="date" value={renewalDate} onChange={e => setRenewalDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Row 4: Cycle, Station, Inspector */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className={labelCls}>Cycle</label>
            <select value={cycle} onChange={e => setCycle(e.target.value)} className={selectCls}>
              {CYCLES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Station</label>
            <select value={station} onChange={e => setStation(e.target.value)} className={selectCls}>
              <option value="14">Station 14</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Inspector</label>
            <select value={inspector} onChange={e => setInspector(e.target.value)} className={selectCls}>
              <option value="">Select inspector...</option>
              <option value="Sarah Chen">Sarah Chen — Fire Chief</option>
              <option value="Maria Delgado">Maria Delgado — Captain</option>
              <option value="B/C Simmons">B/C Simmons — Battalion Chief</option>
            </select>
          </div>
          <div />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 border border-gray-100 dark:border-gray-700 border-b-white -mb-px relative z-10'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-950'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-b-2xl rounded-tr-2xl shadow-sm p-6">

        {/* ── Registration Details Tab ── */}
        {activeTab === 'details' && (
          <div>
            <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide mb-4">Registration Type Details</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>Registered System / Description</label>
                <input type="text" placeholder="e.g. Siemens Fire Alarm Panel, Wet Sprinkler System..."
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Manufacturer / Vendor</label>
                <input type="text" placeholder="System manufacturer or installer..." className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className={labelCls}>Model / Serial #</label>
                <input type="text" placeholder="Model or serial number..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Install Date</label>
                <input type="date" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Last Service Date</label>
                <input type="date" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Service Company</label>
                <input type="text" placeholder="Company name..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Service Company Phone</label>
                <input type="tel" placeholder="(555) 555-5555" className={inputCls} />
              </div>
            </div>
          </div>
        )}

        {/* ── Fees & Payment Tab ── */}
        {activeTab === 'fees' && (
          <div>
            <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide mb-4">Fee Schedule</h3>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div>
                <label className={labelCls}>Registration Fee</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="text" value={regFee} onChange={e => setRegFee(e.target.value)}
                    placeholder="0.00" className={inputCls + ' pl-7'} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Late Fee</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="text" value={lateFee} onChange={e => setLateFee(e.target.value)}
                    placeholder="0.00" className={inputCls + ' pl-7'} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Total Due</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="text" value={totalFee} onChange={e => setTotalFee(e.target.value)}
                    placeholder="0.00" className={inputCls + ' pl-7 font-semibold'} />
                </div>
              </div>
            </div>
            <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide mb-4 pt-4 border-t border-gray-100 dark:border-gray-700">Payment</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Payment Status</label>
                <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className={selectCls}>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Paid">Paid</option>
                  <option value="Partial">Partial</option>
                  <option value="Waived">Waived</option>
                  <option value="Refunded">Refunded</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Payment Date</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Receipt #</label>
                <input type="text" value={receiptNum} onChange={e => setReceiptNum(e.target.value)}
                  placeholder="Receipt number..." className={inputCls} />
              </div>
            </div>
          </div>
        )}

        {/* ── Conditions Tab ── */}
        {activeTab === 'conditions' && (
          <div>
            <label className={labelCls}>Registration Conditions & Requirements</label>
            <textarea value={conditions} onChange={e => setConditions(e.target.value)}
              rows={8} placeholder="Enter any conditions, restrictions, or special requirements for this registration..."
              className={inputCls + ' resize-y'} />
          </div>
        )}

        {/* ── Notes Tab ── */}
        {activeTab === 'notes' && (
          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={8} placeholder="Enter notes about this registration..."
              className={inputCls + ' resize-y'} />
          </div>
        )}

        {/* ── Attachments Tab ── */}
        {activeTab === 'attachments' && (
          <div>
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:border-red-300 hover:bg-red-50/30 transition-colors cursor-pointer">
              <Paperclip size={28} className="mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Drop files here or click to upload</p>
              <p className="text-xs text-gray-400">Certificates, inspection reports, photos — up to 25 MB each</p>
            </div>
            {attachments.length === 0 && (
              <p className="text-center text-xs text-gray-400 mt-4">No attachments yet.</p>
            )}
          </div>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Action</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">By</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-10 text-gray-400 text-xs">
                        <Calendar size={24} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                        No history records. History will be recorded when this registration is saved.
                      </td>
                    </tr>
                  ) : (
                    history.map((h, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{h.date}</td>
                        <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{h.action}</td>
                        <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{h.by}</td>
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{h.notes}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
