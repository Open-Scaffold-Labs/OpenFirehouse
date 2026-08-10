// CommandBoard.jsx — Combined Dispatch & Command Board
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import LiveDispatch from './LiveDispatch';
import { tonePar } from '../utils/alertTones';
import UnitStatusBoard from './UnitStatusBoard';
import DemoTimeline from './DemoTimeline';
import CommanderCam from './CommanderCam';
import ResponseMap from './ResponseMap';
import ResourceTracker from './ResourceTracker';
import PresenterOverlay from './PresenterOverlay';
import ScreenErrorBoundary from './ScreenErrorBoundary';
import { api } from '../utils/api';
import { offlineQueue } from '../utils/offlineQueue';
import { isDemoDispatch } from '../utils/demoProvenance';
import { parRemainingSeconds, parChipLabel, parBasis, parBenchmarkTriggers, PAR_ANCHOR } from '../utils/parClock';
import {
  Plus, X, Clock, Truck, Users, ShieldAlert,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  ClipboardList, DollarSign, Package, Cog, BookOpen,
  UserCheck, Siren, Radio, MessageSquare, Wind,
  Coffee, List, GitFork, Zap, Moon, Sun,
} from 'lucide-react';
import DictateTextarea from './DictateTextarea';
import { toggleTheme } from '../utils/theme';

// ─── Static data ──────────────────────────────────────────────────────────────

import { NERIS_INCIDENT_TYPES, LEGACY_TYPE_MAP } from '../data/nerisTypes';

// Demo scenarios for the one-click demo button (matches LiveDispatch scenarios)

// Quick-pick shortcuts map to NERIS codes for the Command Board
const QUICK_PICKS = [
  { label: 'Structure Fire',         neris: 'FIRE.STRUCTURE_FIRE.STRUCTURAL_INVOLVEMENT_FIRE' },
  { label: 'Vehicle Fire',           neris: 'FIRE.TRANSPORTATION_FIRE.VEHICLE_FIRE_PASSENGER' },
  { label: 'Brush / Wildland Fire',  neris: 'FIRE.OUTSIDE_FIRE.WILDFIRE_WILDLAND' },
  { label: 'Gas Leak',               neris: 'HAZSIT.HAZARDOUS_MATERIALS.GAS_LEAK_ODOR' },
  { label: 'Hazmat',                 neris: 'HAZSIT.HAZARDOUS_MATERIALS.HAZMAT_RELEASE_FACILITY' },
  { label: 'Motor Vehicle Accident', neris: 'HAZSIT.HAZARD_NONCHEM.MOTOR_VEHICLE_COLLISION' },
  { label: 'Medical',                neris: 'MEDICAL.ILLNESS.SICK_CASE' },
  { label: 'Water Rescue',           neris: 'RESCUE.WATER.PERSON_IN_WATER_STANDING' },
  { label: 'Technical Rescue',       neris: 'RESCUE.OUTSIDE.EXTRICATION_ENTRAPPED' },
  { label: 'False Alarm',            neris: 'NOEMERG.FALSE_ALARM.ACCIDENTAL_ALARM' },
  { label: 'Mutual Aid',             neris: 'PUBSERV.OTHER.MOVE_UP' },
  { label: 'Other',                  neris: 'PUBSERV.CITIZEN_ASSIST.CITIZEN_ASSIST_SERVICE_CALL' },
];

function parseNerisCode(code) {
  if (!code || !code.includes('.')) return { cat: 'FIRE', sub: 'STRUCTURE_FIRE', detail: 'STRUCTURAL_INVOLVEMENT_FIRE' };
  const [cat, sub, detail] = code.split('.');
  return { cat, sub, detail };
}

// Pre-plan addresses + common generic options
const KNOWN_LOCATIONS = [
  '200 Elm Street, Maplewood',
  '45 Riverside Drive, Maplewood',
  '775 Route 22, Maplewood',
  '120 Maple Avenue, Maplewood',
  '500 Valley Road, Maplewood',
  '1200 Commerce Parkway, Maplewood',
  '88 Summit Drive, Maplewood',
  '1 Municipal Plaza, Maplewood',
  'Intersection — Route 22 & Elm St',
  'Intersection — Valley Rd & Maple Ave',
  'Highway — Route 22 Northbound',
  'Highway — Route 22 Southbound',
  'Rail Yard — Commerce Pkwy',
  'Open Field / Brush — North End',
  'Other / Unknown',
];

const MEMBERS = [
  'Chief Chen',
  'Dep. Chief Chen',
  'Bn. Chief Chen',
  'Capt. Delgado',
  'Capt. Delgado',
  'FF McGee',
  'FF Fontaine',
  'FF Winters',
  'FF Harrington',
  'FF Kim',
];

const ICS_ROLES = [
  'Incident Commander',
  'Deputy IC',
  'Safety Officer',
  'Public Information Officer',
  'Liaison Officer',
  'Operations Section Chief',
  'Planning Section Chief',
  'Logistics Section Chief',
  'Finance / Admin Section Chief',
  'Staging Area Manager',
  'RIC / RIT Leader',
  'EMS Group Supervisor',
  'Decon Group Supervisor',
  'Entry Team Leader',
  'Rehab Group Supervisor',
  'Water Supply Officer',
];

const ASSIGNMENTS = [
  'Entry Team A',
  'Entry Team B',
  'Entry Team C',
  'RIC / RIT',
  'Division 1',
  'Division 2',
  'Roof Group',
  'Exposure Group',
  'Staging',
  'Rehab',
  'Decon',
  'Water Supply',
  'EMS Group',
  'Aerial Operations',
  'Command',
  'Unassigned',
];

const APPARATUS = [
  'Engine 14',
  'Engine 142',
  'Ladder 14',
  'Tanker 14',
  'Rescue 14',
  'Brush 14',
  'Command 14',
  'EMS 14',
  'HazMat 14',
  'Mutual Aid — Engine',
  'Mutual Aid — Tanker',
  'Mutual Aid — Ladder',
  'Mutual Aid — Other',
];

const UNIT_STATUSES      = ['Dispatched', 'En Route', 'On Scene', 'Staging', 'Committed', 'Available', 'Returning'];
const PERSONNEL_STATUSES = ['On Scene', 'Staging', 'In Structure', 'Rehab', 'Returned'];
const HAZMAT_TYPES       = ['Hazmat', 'Gas Leak'];

// Per-type milestone timelines
// ─── FIREGROUND EVENTS — the things that OWE YOU A PAR ───────────────────────
// These are NOT progression milestones. "Water On" is routine; "Emergency
// Evacuation" is not, and rendering them in the same strip would frame a
// mayday-adjacent order as a normal step of the call. They get their own row.
//
// Each one stamps a milestone key that parClock's parBenchmarkTriggers() reads,
// which raises the PAR REQUIRED prompt. This is the doctrinal core: New Jersey's
// statewide reg (N.J.A.C. 5:75-2.4(f)) mandates these triggers and ZERO time
// intervals. A board that only nags on a wall clock is doctrinally wrong.
//
// We PROMPT. We never run the PAR. A human calls the roll over the radio.
//
// `confirm: true` for the ones an accidental tap would be bad for — declaring an
// emergency evacuation is an order, not a checkbox.
const FIREGROUND_EVENTS = [
  { key: 'evacuation',     label: 'EMERGENCY EVAC',   full: 'Emergency evacuation ordered',                 tone: 'red',   confirm: true },
  { key: 'strategyChange', label: 'STRATEGY CHANGE',  full: 'Strategy change (offensive ⇄ defensive)',      tone: 'red',   confirm: true },
  { key: 'collapse',       label: 'COLLAPSE / BLAST', full: 'Sudden hazardous event (collapse / flashover / explosion)', tone: 'red', confirm: true },
  { key: 'allClear',       label: 'ALL CLEAR',        full: 'Primary search all-clear',                     tone: 'amber', confirm: false },
];

const MILESTONES_BY_TYPE = {
  'Structure Fire': [
    { key: 'dispatched',   label: 'Dispatched'    },
    { key: 'enRoute',      label: 'En Route'      },
    { key: 'onScene',      label: 'On Scene'      },
    { key: 'waterOn',      label: 'Water On'      },
    { key: 'underControl', label: 'Under Control' },
    { key: 'cleared',      label: 'Cleared'       },
  ],
  'Vehicle Fire': [
    { key: 'dispatched',   label: 'Dispatched'    },
    { key: 'enRoute',      label: 'En Route'      },
    { key: 'onScene',      label: 'On Scene'      },
    { key: 'waterOn',      label: 'Water On'      },
    { key: 'extinguished', label: 'Extinguished'  },
    { key: 'cleared',      label: 'Cleared'       },
  ],
  'Brush / Wildland Fire': [
    { key: 'dispatched',   label: 'Dispatched'    },
    { key: 'enRoute',      label: 'En Route'      },
    { key: 'onScene',      label: 'On Scene'      },
    { key: 'waterOn',      label: 'Water On'      },
    { key: 'contained',    label: 'Contained'     },
    { key: 'controlled',   label: 'Controlled'    },
    { key: 'cleared',      label: 'Cleared'       },
  ],
  'Gas Leak': [
    { key: 'dispatched',   label: 'Dispatched'     },
    { key: 'enRoute',      label: 'En Route'       },
    { key: 'onScene',      label: 'On Scene'       },
    { key: 'sourceFound',  label: 'Source ID\'d'   },
    { key: 'secured',      label: 'Source Secured' },
    { key: 'ventilated',   label: 'Ventilated'     },
    { key: 'cleared',      label: 'Cleared'        },
  ],
  'Hazmat': [
    { key: 'dispatched',   label: 'Dispatched'    },
    { key: 'enRoute',      label: 'En Route'      },
    { key: 'onScene',      label: 'On Scene'      },
    { key: 'hotZone',      label: 'Hot Zone Est.' },
    { key: 'deconActive',  label: 'Decon Active'  },
    { key: 'mitigated',    label: 'Mitigated'     },
    { key: 'cleared',      label: 'Cleared'       },
  ],
  'Motor Vehicle Accident': [
    { key: 'dispatched',   label: 'Dispatched'    },
    { key: 'enRoute',      label: 'En Route'      },
    { key: 'onScene',      label: 'On Scene'      },
    { key: 'patientContact', label: 'Pt. Contact' },
    { key: 'extrication',  label: 'Extrication'   },
    { key: 'transport',    label: 'Transport'      },
    { key: 'cleared',      label: 'Cleared'        },
  ],
  'Medical': [
    { key: 'dispatched',   label: 'Dispatched'    },
    { key: 'enRoute',      label: 'En Route'      },
    { key: 'onScene',      label: 'On Scene'      },
    { key: 'patientContact', label: 'Pt. Contact' },
    { key: 'alsRequested', label: 'ALS Request'   },
    { key: 'transport',    label: 'Transport'      },
    { key: 'cleared',      label: 'Cleared'        },
  ],
  'Water Rescue': [
    { key: 'dispatched',   label: 'Dispatched'    },
    { key: 'enRoute',      label: 'En Route'      },
    { key: 'onScene',      label: 'On Scene'      },
    { key: 'inWater',      label: 'In Water'      },
    { key: 'victimLocated','label': 'Victim Loc.' },
    { key: 'victimSecured','label': 'Victim Sec.' },
    { key: 'cleared',      label: 'Cleared'       },
  ],
  'Technical Rescue': [
    { key: 'dispatched',   label: 'Dispatched'    },
    { key: 'enRoute',      label: 'En Route'      },
    { key: 'onScene',      label: 'On Scene'      },
    { key: 'accessMade',   label: 'Access Made'   },
    { key: 'patientContact', label: 'Pt. Contact' },
    { key: 'extrication',  label: 'Extrication'   },
    { key: 'cleared',      label: 'Cleared'        },
  ],
  'Mutual Aid': [
    { key: 'dispatched',   label: 'Dispatched'    },
    { key: 'enRoute',      label: 'En Route'      },
    { key: 'staging',      label: 'Staging'       },
    { key: 'deployed',     label: 'Deployed'      },
    { key: 'released',     label: 'Released'      },
    { key: 'cleared',      label: 'Cleared'       },
  ],
  'Other': [
    { key: 'dispatched',   label: 'Dispatched'    },
    { key: 'enRoute',      label: 'En Route'      },
    { key: 'onScene',      label: 'On Scene'      },
    { key: 'mitigated',    label: 'Mitigated'     },
    { key: 'cleared',      label: 'Cleared'       },
  ],
};

function getMilestones(type) {
  return MILESTONES_BY_TYPE[type] ?? MILESTONES_BY_TYPE['Other'];
}

const UNIT_STATUS_COLORS = {
  'Dispatched':{ bg: 'bg-gray-100 dark:bg-gray-800',   text: 'text-gray-600 dark:text-gray-300',   dot: 'bg-gray-400'   },
  'En Route':  { bg: 'bg-blue-100 dark:bg-blue-950/50',   text: 'text-blue-700 dark:text-blue-300',   dot: 'bg-blue-500'   },
  'On Scene':  { bg: 'bg-green-100 dark:bg-green-950/50',  text: 'text-green-700 dark:text-green-300',  dot: 'bg-green-500'  },
  'Staging':   { bg: 'bg-yellow-100 dark:bg-yellow-950/50', text: 'text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500' },
  'Committed': { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  'Available': { bg: 'bg-gray-100 dark:bg-gray-800',   text: 'text-gray-600 dark:text-gray-300',   dot: 'bg-gray-400'   },
  'Returning': { bg: 'bg-purple-100 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowIso() { return new Date().toISOString(); }

// Collision-proof local id.
// Date.now() was used as a primary key for personnel, units, roles, comms and
// timeline events. Two people added inside the same millisecond — trivially
// possible when seeding a crew from a roster — collided, which produced duplicate
// React keys AND made updatePersonStatus/removePerson operate on BOTH records. On
// an accountability board, "remove one firefighter and silently remove a second"
// is not an acceptable failure mode.
let _idSeq = 0;
function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for any browser without crypto.randomUUID (and for non-secure
  // contexts, where it is undefined even in modern browsers).
  _idSeq += 1;
  return `id-${Date.now()}-${_idSeq}-${Math.random().toString(36).slice(2, 10)}`;
}

// A real UUID for the PAR idempotency key (par_checks.client_id is a UUID column,
// so the fallback must be UUID-SHAPED — the newId() fallback above is not).
function newClientUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC-4122 v4 fallback (non-secure contexts / old browsers).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function timeStr(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}
function autoIncidentNumber() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `${yy}-${seq}`;
}

function useElapsed(startIso) {
  const [elapsed, setElapsed] = useState('00:00');
  useEffect(() => {
    if (!startIso) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - new Date(startIso)) / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setElapsed(
        h > 0
          ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
          : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startIso]);
  return elapsed;
}

// ─── UI Primitives ────────────────────────────────────────────────────────────

function StatusChip({ status, colors }) {
  const c = colors[status] ?? { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-300', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}

function SectionCard({ icon: Icon, iconColor, title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconColor}`}>
          <Icon size={15} className="text-white" />
        </div>
        <span className="flex-1 text-left text-sm font-bold text-gray-900 dark:text-gray-100">{title}</span>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>
      {open && <div className="border-t border-gray-100 dark:border-gray-700 p-4">{children}</div>}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

const selectCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100';
const labelCls  = 'block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';
const inputCls  = 'w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100';

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({ onActivate, onNavigate, members, locations, initialAlert, wind }) {
  // Guess incident type from CAD description
  function guessType(desc) {
    if (!desc) return 'Structure Fire';
    const d = desc.toUpperCase();
    if (d.includes('STRUCTURE') || d.includes('DWELLING') || d.includes('BUILDING')) return 'Structure Fire';
    if (d.includes('VEHICLE') || d.includes('MVA') || d.includes('MOTOR')) return 'Vehicle Fire';
    if (d.includes('BRUSH') || d.includes('GRASS') || d.includes('WOODS')) return 'Brush / Grass Fire';
    if (d.includes('HAZMAT') || d.includes('SPILL') || d.includes('LEAK') || d.includes('GAS')) return 'Gas Leak';
    if (d.includes('MEDICAL') || d.includes('EMS') || d.includes('CARDIAC') || d.includes('RESCUE')) return 'Medical Assist';
    if (d.includes('WATER') || d.includes('FLOOD')) return 'Water Rescue';
    if (d.includes('ELECTRIC') || d.includes('WIRE') || d.includes('UTILITY')) return 'Electrical';
    return 'Structure Fire';
  }

  const guessedType = guessType(initialAlert?.description);
  const guessedQuickPick = QUICK_PICKS.find(qp => qp.label === guessedType) || QUICK_PICKS[0];
  const guessedNeris = parseNerisCode(guessedQuickPick.neris);
  const [form, setForm] = useState({
    incidentNumber: autoIncidentNumber(),
    type: guessedType,
    neris_type: guessedQuickPick.neris,
    neris_category: guessedNeris.cat,
    neris_subcategory: guessedNeris.sub,
    neris_detail: guessedNeris.detail,
    address: initialAlert?.address || locations[0] || '',
    ic: members[0] ?? '',
  });

  // Keep address/ic in sync if live data loads after initial render
  useEffect(() => {
    setForm(f => ({
      ...f,
      address: f.address || locations[0] || '',
      ic:      f.ic      || members[0]   || '',
    }));
  }, [members, locations]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="max-w-md mx-auto px-4 py-10 space-y-5">
      {/* CAD alert banner */}
      {initialAlert && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 rounded-2xl px-4 py-3 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">🚨</span>
          <div>
            <p className="text-sm font-black text-red-900 dark:text-red-200">CAD Dispatch — Pre-filled from Active911</p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">{initialAlert.description}{initialAlert.units ? ` · Units: ${initialAlert.units}` : ''}</p>
            {initialAlert.details && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{initialAlert.details}</p>}
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-red-700 flex items-center justify-center">
          <Siren size={26} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">Incident Command Center</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{initialAlert ? 'Confirm and activate' : 'Set up a live incident'}</p>
        </div>
      </div>

      {/* Wind banner */}
      {wind && (
        <div className={`rounded-2xl border p-4 ${wind.bg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wind size={18} className={wind.color} />
              <span className={`text-sm font-black uppercase tracking-wide ${wind.color}`}>Wind</span>
              <span className={`text-xs font-semibold ${wind.color} opacity-75`}>— {wind.label}</span>
            </div>
            {wind.compass && (
              <span className={`text-xs font-bold ${wind.color}`}>
                <span
                  style={{ display: 'inline-block', transform: `rotate(${wind.dir}deg)` }}
                >↑</span>
                {' '}{wind.compass}
              </span>
            )}
          </div>
          <div className="flex items-end gap-3 mt-1">
            <span className={`text-3xl font-black ${wind.color}`}>{wind.speed}</span>
            <span className={`text-base mb-0.5 ${wind.color}`}>mph</span>
            {wind.gusts && wind.gusts > wind.speed + 5 && (
              <span className={`text-xs mb-1 ${wind.color} opacity-80`}>· gusts {wind.gusts} mph</span>
            )}
          </div>
          {wind.speed >= 25 && (
            <p className={`text-xs mt-1 font-semibold ${wind.color}`}>
              ⚠ Wind conditions may affect fire behavior and aerial operations
            </p>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">

        {/* Incident Type — Quick Pick + NERIS drill-down */}
        <div>
          <label className={labelCls}>Incident Type</label>
          <select className={selectCls} value={form.neris_type}
            onChange={e => {
              const code = e.target.value;
              const match = QUICK_PICKS.find(qp => qp.neris === code);
              const { cat, sub, detail } = parseNerisCode(code);
              const typeObj = NERIS_INCIDENT_TYPES[cat]?.subcategories?.[sub]?.types?.[detail];
              setForm(f => ({
                ...f,
                type: match?.label || typeObj?.label || cat,
                neris_type: code,
                neris_category: cat,
                neris_subcategory: sub,
                neris_detail: detail,
              }));
            }}>
            {QUICK_PICKS.map(qp => {
              const { cat } = parseNerisCode(qp.neris);
              const icon = NERIS_INCIDENT_TYPES[cat]?.icon || '';
              return <option key={qp.neris} value={qp.neris}>{icon} {qp.label}</option>;
            })}
          </select>
          {/* NERIS drill-down for precise classification */}
          <details className="mt-2">
            <summary className="text-[10px] text-gray-400 cursor-pointer select-none hover:text-gray-600">
              NERIS detail: <span className="font-mono">{form.neris_type}</span>
            </summary>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <select aria-label="NERIS category" className="rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 px-2 py-1 text-xs"
                value={form.neris_category}
                onChange={e => {
                  const cat = e.target.value;
                  const subs = Object.keys(NERIS_INCIDENT_TYPES[cat]?.subcategories || {});
                  const sub = subs[0] || '';
                  const types = sub ? Object.keys(NERIS_INCIDENT_TYPES[cat].subcategories[sub].types) : [];
                  const detail = types[0] || '';
                  const label = NERIS_INCIDENT_TYPES[cat]?.subcategories?.[sub]?.types?.[detail]?.label || NERIS_INCIDENT_TYPES[cat]?.label;
                  setForm(f => ({ ...f, type: label, neris_category: cat, neris_subcategory: sub, neris_detail: detail, neris_type: `${cat}.${sub}.${detail}` }));
                }}>
                {Object.entries(NERIS_INCIDENT_TYPES).map(([code, c]) => (
                  <option key={code} value={code}>{c.icon} {c.label}</option>
                ))}
              </select>
              <select aria-label="NERIS subcategory" className="rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 px-2 py-1 text-xs"
                value={form.neris_subcategory}
                onChange={e => {
                  const sub = e.target.value;
                  const cat = form.neris_category;
                  const types = Object.keys(NERIS_INCIDENT_TYPES[cat]?.subcategories?.[sub]?.types || {});
                  const detail = types[0] || '';
                  const label = NERIS_INCIDENT_TYPES[cat]?.subcategories?.[sub]?.types?.[detail]?.label || sub;
                  setForm(f => ({ ...f, type: label, neris_subcategory: sub, neris_detail: detail, neris_type: `${cat}.${sub}.${detail}` }));
                }}>
                {Object.entries(NERIS_INCIDENT_TYPES[form.neris_category]?.subcategories || {}).map(([code, s]) => (
                  <option key={code} value={code}>{s.label}</option>
                ))}
              </select>
              <select aria-label="NERIS incident type detail" className="rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 px-2 py-1 text-xs"
                value={form.neris_detail}
                onChange={e => {
                  const detail = e.target.value;
                  const cat = form.neris_category;
                  const sub = form.neris_subcategory;
                  const label = NERIS_INCIDENT_TYPES[cat]?.subcategories?.[sub]?.types?.[detail]?.label || detail;
                  setForm(f => ({ ...f, type: label, neris_detail: detail, neris_type: `${cat}.${sub}.${detail}` }));
                }}>
                {Object.entries(NERIS_INCIDENT_TYPES[form.neris_category]?.subcategories?.[form.neris_subcategory]?.types || {}).map(([code, t]) => (
                  <option key={code} value={code}>{t.label}</option>
                ))}
              </select>
            </div>
          </details>
        </div>

        {/* Location — from pre-incident plans */}
        <div>
          <label className={labelCls}>Location</label>
          <select className={selectCls} value={form.address} onChange={e => set('address', e.target.value)}>
            {locations.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>

        {/* Incident Commander — from live roster */}
        <div>
          <label className={labelCls}>Incident Commander</label>
          <select className={selectCls} value={form.ic} onChange={e => set('ic', e.target.value)}>
            {members.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>

        {/* Incident Number (auto-generated, editable) */}
        <div>
          <label className={labelCls}>Incident # (auto-generated)</label>
          <input
            className={inputCls}
            value={form.incidentNumber}
            onChange={e => set('incidentNumber', e.target.value)}
          />
        </div>

        <button
          onClick={() => onActivate({
            ...form,
            milestones: { dispatched: nowIso() },
            units: [],
            personnel: [],
            roles: [],
            icsNotes: { operations: '', planning: '', logistics: '', finance: '' },
            parHistory: [],
            parInterval: 0,
            commsLog: [],
          })}
          className="w-full py-3 bg-red-700 text-white font-black rounded-xl hover:bg-red-800 transition-colors flex items-center justify-center gap-2 text-base"
        >
          <Siren size={18} /> Activate Incident
        </button>
      </div>

      {/* Recall shortcut — issue an all-call before or without activating an incident */}
      <div className="bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-900 rounded-2xl p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-orange-900 dark:text-orange-200">Need more hands?</p>
          <p className="text-xs text-orange-700 dark:text-orange-300">Issue a recall to notify off-duty members by push &amp; text</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('recall')}
          className="flex-shrink-0 flex items-center gap-1.5 bg-orange-700 hover:bg-orange-800 text-white px-3 py-2 rounded-xl text-sm font-bold transition-colors"
        >
          <Siren size={14} /> Issue Recall
        </button>
      </div>
    </div>
  );
}

// ─── Main Board ───────────────────────────────────────────────────────────────

// Parse dispatched units string (e.g. "Engine 3, Ladder 1, Battalion 1") into unit objects
function parseDispatchUnits(unitsStr) {
  if (!unitsStr) return [];
  return unitsStr
    .split(/[,;\/&+]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map((designation, i) => ({
      id: newId(),
      designation,
      officer: '',
      status: 'Dispatched',
      fromDispatch: true,
    }));
}

export default function CommandBoard({ onNavigate = () => {}, initialAlert = null, onAlertConsumed = () => {}, autoActivate = false, onAutoActivated = () => {}, currentUser = null, settings = {}, onRespond = () => {}, dispatches = [], onClearBadge = () => {}, onAddDispatch = () => {}, onCallCleared = null, onCallReopened = null, selectedStation = null }) {
  const [activeTab, setActiveTab] = useState('dispatch'); // 'dispatch' | 'board'
  const [incident, setIncident]           = useState(null);
  const [wind, setWind]                   = useState(null); // { speed, gusts, dir, compass, label, color }
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showParModal, setShowParModal]   = useState(false);
  const [confirmClose, setConfirmClose]   = useState(false);

  // ── 0062: the department's SOG default PAR interval ────────────────────────
  // NULL/unset = today's behavior exactly (no timer until command sets one —
  // there is NO NFPA-mandated interval; "every 20" is SOG convention). When the
  // department has configured a default, a newly ACTIVATED board starts with it
  // pre-selected and persisted (same /par-interval path the manual selector
  // uses, so the TV and other surfaces agree). Command keeps the per-incident
  // override — incident conditions vary, and command outranks a setting.
  const deptParDefaultRef = useRef(0);
  useEffect(() => {
    api.get('/api/departments/me')
      .then((d) => {
        const v = Number(d?.data?.par_interval_default_min);
        deptParDefaultRef.current = Number.isInteger(v) && v > 0 ? v : 0;
      })
      .catch(() => {});
  }, []);
  function applyParDefault(inc) {
    const def = deptParDefaultRef.current;
    if (!def || (Number(inc?.parInterval) || 0) > 0) return inc;
    api.patch('/api/active-board/par-interval', { minutes: def }).catch(() => {});
    return { ...inc, parInterval: def };
  }
  const [showRecallBtn, setShowRecallBtn] = useState(false);
  const [showCommsModal, setShowCommsModal] = useState(false);
  const [showAllComms, setShowAllComms]   = useState(false);
  const [parCountdown, setParCountdown]   = useState(null); // seconds remaining
  const [showRehabModal, setShowRehabModal] = useState(false);
  const [showOrgChart, setShowOrgChart]   = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [parChecks, setParChecks]         = useState({}); // { [personId]: boolean }
  // A failed PAR write must be VISIBLE. The board must never render
  // "All accounted for" over a write the server never received.
  const [parSaveError, setParSaveError]   = useState(null);
  const [maydayArm, setMaydayArm]         = useState(false);   // two-tap confirm for DECLARE MAYDAY
  const [maydayError, setMaydayError]     = useState('');
  const [maydayElapsed, setMaydayElapsed] = useState('00:00'); // ticking mm:ss since declaration
  const [showCommandModal, setShowCommandModal] = useState(false); // update IC via dispatcher
  const [demoRunning, setDemoRunning]   = useState(false);   // auto-sequence demo active
  const [demoStep, setDemoStep]         = useState('');       // current step label for banner
  const demoTimersRef                   = useRef([]);         // so we can cancel on unmount
  const [showDemoTimeline, setShowDemoTimeline] = useState(false); // Matt's full DemoTimeline player
  const [demoElapsed, setDemoElapsed] = useState(0); // for PresenterOverlay callouts
  const unitsRef = useRef(null);   // scroll target for unit changes
  const commsRef = useRef(null);   // scroll target for comms changes


  // Live data from the database — fall back to static lists if API unavailable
  const [liveMembers,   setLiveMembers]   = useState(MEMBERS);
  const [liveApparatus, setLiveApparatus] = useState(APPARATUS);
  const [liveLocations, setLiveLocations] = useState(KNOWN_LOCATIONS);

  useEffect(() => {
    // Active roster members formatted as "Rank Name"
    api.get('/api/members')
      .then(({ data = [] }) => {
        const names = data
          .filter(m => ['Active', 'Probationary'].includes(m.status))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(m => m.rank ? `${m.rank} ${m.name}` : m.name);
        if (names.length > 0) setLiveMembers(names);
      })
      .catch(() => {});

    // Apparatus not out of service, plus mutual-aid options at the end
    api.get('/api/apparatus')
      .then(({ data = [] }) => {
        const units = data
          .filter(a => a.status !== 'Out of Service')
          .sort((a, b) => a.designation.localeCompare(b.designation))
          .map(a => a.designation);
        if (units.length > 0) {
          setLiveApparatus([
            ...units,
            'Mutual Aid — Engine',
            'Mutual Aid — Tanker',
            'Mutual Aid — Ladder',
            'Mutual Aid — Other',
          ]);
        }
      })
      .catch(() => {});

    // Pre-plan addresses as known locations, plus generic fallbacks
    api.get('/api/pre-plans')
      .then(({ data = [] }) => {
        const locs = data
          .map(p => p.occupancyName ? `${p.address} — ${p.occupancyName}` : p.address)
          .filter(Boolean);
        if (locs.length > 0) {
          setLiveLocations([
            ...locs,
            'Intersection — (specify)',
            'Highway — (specify)',
            'Open Field / Brush',
            'Other / Unknown',
          ]);
        }
      })
      .catch(() => {});
  }, []);

  // Wind fetch — uses station city/state from settings
  useEffect(() => {
    const city  = settings?.city;
    const state = settings?.state;
    if (!city || !state) return;

    const degToCompass = (deg) => {
      const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      return dirs[Math.round(deg / 22.5) % 16];
    };

    const fetchWind = async () => {
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)},${encodeURIComponent(state)}&format=json&limit=1`
        );
        const locs = await geoRes.json();
        if (!locs?.length) return;
        const { lat, lon } = locs[0];

        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=mph&timezone=auto`
        );
        const wxData = await wxRes.json();
        const c = wxData.current;
        const speed  = Math.round(c.wind_speed_10m);
        const gusts  = c.wind_gusts_10m ? Math.round(c.wind_gusts_10m) : null;
        const dir    = c.wind_direction_10m ?? null;
        const compass = dir !== null ? degToCompass(dir) : null;
        const label  = speed < 5 ? 'Calm' : speed < 15 ? 'Light' : speed < 25 ? 'Moderate' : speed < 35 ? 'Strong' : 'Dangerous';
        const color  = speed < 15 ? 'text-green-700 dark:text-green-300' : speed < 25 ? 'text-yellow-700 dark:text-yellow-300' : speed < 35 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400';
        const bg     = speed < 15 ? 'bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-800' : speed < 25 ? 'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-300 dark:border-yellow-800' : speed < 35 ? 'bg-orange-50 dark:bg-orange-950/50 border-orange-300 dark:border-orange-800' : 'bg-red-50 dark:bg-red-950/50 border-red-400 dark:border-red-800';
        setWind({ speed, gusts, dir, compass, label, color, bg });
      } catch (e) {
        // silently fail — wind is supplemental
      }
    };

    fetchWind();
    const id = setInterval(fetchWind, 600000); // refresh every 10 min
    return () => clearInterval(id);
  }, [settings?.city, settings?.state]);

  // ── Auto-activation from dispatch ────────────────────────────────────────────
  useEffect(() => {
    if (!autoActivate || !initialAlert || incident) return;

    const dispatchedAt = initialAlert.dispatched_at || initialAlert.dispatchedAt || nowIso();
    const guessedType  = (() => {
      const d = (initialAlert.description || '').toUpperCase();
      if (d.includes('STRUCTURE') || d.includes('DWELLING') || d.includes('BUILDING') || d.includes('FIRE')) return 'Structure Fire';
      if (d.includes('VEHICLE') || d.includes('MVA') || d.includes('MOTOR')) return 'Vehicle Fire';
      if (d.includes('BRUSH') || d.includes('GRASS') || d.includes('WOODS')) return 'Brush / Wildland Fire';
      if (d.includes('HAZMAT') || d.includes('SPILL') || d.includes('LEAK') || d.includes('GAS')) return 'Gas Leak';
      if (d.includes('MEDICAL') || d.includes('EMS') || d.includes('CARDIAC')) return 'Medical';
      if (d.includes('WATER') || d.includes('FLOOD')) return 'Water Rescue';
      if (d.includes('MVA') || d.includes('COLLISION') || d.includes('ACCIDENT')) return 'Motor Vehicle Accident';
      return 'Structure Fire';
    })();
    const quickPick = QUICK_PICKS.find(qp => qp.label === guessedType) || QUICK_PICKS[0];
    const { cat, sub, detail } = parseNerisCode(quickPick.neris);
    const parsedUnits = parseDispatchUnits(initialAlert.units);

    const inc = {
      incidentNumber: autoIncidentNumber(),
      type:           guessedType,
      neris_type:     quickPick.neris,
      neris_category: cat,
      neris_subcategory: sub,
      neris_detail:   detail,
      address:        initialAlert.address || 'Unknown Location',
      ic:             '', // No IC yet — awaiting radio confirmation to dispatch
      commandAssumed: false,
      // PROVENANCE (2026-07-14). The scripted auto-sequence below fabricates radio
      // traffic, unit statuses, milestones, an IC and a PAR. That is exactly what
      // it is FOR — it is the hands-free demo, and it is triggered by a dispatch.
      //
      // But it used to be gated on "did this incident come from a dispatch?", which
      // a REAL CAD webhook also satisfies: /api/cad/simulate and a live Active911
      // feed produce the same shape. Today every dispatch is a demo dispatch, so
      // nothing has gone wrong — but the day a department wires a real CAD feed, a
      // real fire would have triggered the script.
      //
      // The demo dispatch already identifies itself in the data (LiveDispatch's
      // fireDispatch mints `demo-<ts>` ids). Carry that provenance onto the incident
      // and gate the script on THAT, not on "came from a dispatch". A real CAD alert
      // never sets it. The demo is unchanged.
      isDemo:         isDemoDispatch(initialAlert),
      milestones:     { dispatched: dispatchedAt },
      units:          parsedUnits,
      personnel:      [],
      roles:          [],
      parHistory:     [],
      parInterval:    0,
      commsLog:       [],
      notes:          '',
      icsNotes:       {},
      rehabLog:       [],
      timelineEvents: [
        { id: newId(), time: dispatchedAt, event: `Dispatched: ${initialAlert.description || guessedType} @ ${initialAlert.address || 'Unknown'}`, type: 'activation', auto: true },
        ...(parsedUnits.length ? [{ id: newId(), time: dispatchedAt, event: `Units dispatched: ${parsedUnits.map(u => u.designation).join(', ')} — awaiting en route confirmation`, type: 'unit', auto: true }] : []),
      ],
    };

    onAlertConsumed();
    setIncident(applyParDefault(inc));
    setActiveTab('board'); // auto-switch to command board when incident activates
    onAutoActivated();
    api.put('/api/active-board', {
      type: inc.type,
      address: inc.address,
      dispatched_at: dispatchedAt,
      personnel_count: 0,
      units_count: parsedUnits.length,
    }).catch(() => {});
  }, [autoActivate, initialAlert]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-sequence demo timer ────────────────────────────────────────────────
  // When a DEMO dispatch auto-creates an incident, this effect runs a timed
  // sequence that simulates the full radio traffic of a real incident — the
  // hands-free demo. It fabricates comms, unit statuses, milestones, an IC and a
  // PAR, which is precisely its job.
  //
  // 🛑 IT MUST NEVER RUN ON A REAL INCIDENT. The gate is `incident.isDemo`, set
  // from the dispatch's own `demo-` provenance at auto-activate. It used to be
  // gated on "did this incident come from a dispatch?" — which a live CAD feed
  // satisfies just as well as the Simulate Dispatch button does. Nothing has ever
  // gone wrong (every dispatch in prod today is a demo dispatch, and the prod
  // incident records are clean — checked), but the day a department wires a real
  // Active911 feed, a real fire would have triggered this script and written
  // fabricated radio traffic and fabricated NFIRS times into a legal record.
  //
  // If you are tempted to relax this gate: don't. Add a new explicit demo entry
  // point instead.
  const demoTriggeredRef = useRef(false);
  useEffect(() => {
    // Auto-scroll to relevant section during demo when events fire
    if (showDemoTimeline && incident?._demoFlash) {
      const flash = incident._demoFlash;
      if (flash.type === 'unit_status' && unitsRef.current) {
        unitsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (flash.type === 'comms' && commsRef.current) {
        commsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (flash.type === 'command_established' && unitsRef.current) {
        unitsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // Skip if DemoTimeline is driving the demo — it handles its own events.
    if (showDemoTimeline) return;
    // THE GATE: scripted fiction runs ONLY on a dispatch that identified itself as
    // a demo. A real CAD alert never sets isDemo.
    if (!incident?.isDemo) return;
    if (!incident || !incident.units?.length || demoTriggeredRef.current) return;
    // Only run if this is a fresh auto-activated incident (no milestones beyond dispatched)
    const msKeys = Object.keys(incident.milestones || {});
    if (msKeys.length > 1 || !msKeys.includes('dispatched')) return;
    // Only if units came from a dispatch (have fromDispatch flag)
    if (!incident.units.some(u => u.fromDispatch)) return;

    demoTriggeredRef.current = true;
    setDemoRunning(true);
    setDemoStep('Dispatched — units responding');

    const timers = [];
    const schedule = (fn, delayMs) => {
      const t = setTimeout(fn, delayMs);
      timers.push(t);
      return t;
    };

    const unitNames = incident.units.map(u => u.designation);
    const firstUnit = unitNames[0] || 'Engine 1';
    const secondUnit = unitNames[1] || null;
    const thirdUnit = unitNames[2] || null;
    const icName = 'Chief Chen';
    const addressShort = (incident.address || 'the scene').split(',')[0];

    // Helper: add comms log entry to incident
    const addComms = (from, message, channel = 'Tac 1') => {
      setIncident(inc => {
        if (!inc) return inc;
        return {
          ...inc,
          commsLog: [
            { id: Date.now() + Math.random(), time: new Date().toISOString(), from, message, channel },
            ...(inc.commsLog || []),
          ],
        };
      });
    };

    // Helper: add timeline event
    const addEvent = (event, type = 'radio') => {
      setIncident(inc => {
        if (!inc) return inc;
        return {
          ...inc,
          timelineEvents: [
            ...(inc.timelineEvents || []),
            { id: Date.now() + Math.random(), time: new Date().toISOString(), event, type, auto: true },
          ],
        };
      });
    };

    // Helper: update a unit's status by index
    const setUnitStatus = (unitIndex, status) => {
      setIncident(inc => {
        if (!inc) return inc;
        const units = [...inc.units];
        if (units[unitIndex]) units[unitIndex] = { ...units[unitIndex], status };
        return { ...inc, units };
      });
    };

    // Helper: stamp a milestone
    const stampMilestone = (key) => {
      const ts = new Date().toISOString();
      setIncident(inc => {
        if (!inc || inc.milestones[key]) return inc;
        const label = getMilestones(inc.type).find(m => m.key === key)?.label || key;
        return {
          ...inc,
          milestones: { ...inc.milestones, [key]: ts },
          timelineEvents: [
            ...(inc.timelineEvents || []),
            { id: Date.now() + Math.random(), time: ts, event: `Milestone: ${label}`, type: 'milestone', auto: true },
          ],
        };
      });
    };

    // ─── Timed sequence ─────────────────────────────────────────────────

    // 0s — Already dispatched (incident just created)

    // 6s — First unit goes En Route
    schedule(() => {
      setDemoStep(`${firstUnit} responding`);
      setUnitStatus(0, 'En Route');
      addComms(firstUnit, `${firstUnit} responding.`, 'Dispatch');
      addEvent(`${firstUnit} en route`);
      stampMilestone('enRoute');
    }, 6000);

    // 10s — Second unit goes En Route
    if (secondUnit) {
      schedule(() => {
        setUnitStatus(1, 'En Route');
        addComms(secondUnit, `${secondUnit} en route.`, 'Dispatch');
        addEvent(`${secondUnit} en route`);
      }, 10000);
    }

    // 14s — Third unit goes En Route
    if (thirdUnit) {
      schedule(() => {
        setUnitStatus(2, 'En Route');
        addComms(thirdUnit, `${thirdUnit} responding.`, 'Dispatch');
        addEvent(`${thirdUnit} en route`);
      }, 14000);
    }

    // 20s — First unit On Scene + size-up + command established
    schedule(() => {
      setDemoStep(`${firstUnit} on scene — establishing command`);
      setUnitStatus(0, 'On Scene');
      stampMilestone('onScene');
      addComms(
        firstUnit,
        `${firstUnit} on scene at ${addressShort}. Two-story ordinary, smoke showing from the second floor. ${firstUnit} is establishing ${addressShort} Command.`,
        'Tac 1'
      );
      addEvent(`${firstUnit} on scene — size-up reported`);

      // Establish command
      setIncident(inc => {
        if (!inc) return inc;
        return {
          ...inc,
          ic: icName,
          commandAssumed: true,
          timelineEvents: [
            ...(inc.timelineEvents || []),
            { id: Date.now() + Math.random(), time: new Date().toISOString(), event: `Command established — IC: ${icName}`, type: 'milestone', auto: true },
          ],
        };
      });
    }, 20000);

    // 26s — Second unit On Scene
    if (secondUnit) {
      schedule(() => {
        setDemoStep(`${secondUnit} on scene`);
        setUnitStatus(1, 'On Scene');
        addComms(secondUnit, `${secondUnit} on scene.`, 'Tac 1');
        addEvent(`${secondUnit} on scene`);
      }, 26000);
    }

    // 30s — Third unit On Scene
    if (thirdUnit) {
      schedule(() => {
        setUnitStatus(2, 'On Scene');
        addComms(thirdUnit, `${thirdUnit} on scene.`, 'Tac 1');
        addEvent(`${thirdUnit} on scene`);
      }, 30000);
    }

    // 34s — IC assigns attack
    schedule(() => {
      setDemoStep('Attack commenced');
      addComms(
        'Command',
        `${firstUnit}, you have fire attack. ${secondUnit || 'Ladder'}, I need primary search and ventilation.`,
        'Tac 1'
      );
      addEvent(`IC assigns: ${firstUnit} — fire attack, ${secondUnit || 'Ladder'} — search/ventilation`);
      // Set first unit committed
      setUnitStatus(0, 'Committed');
    }, 34000);

    // 40s — Water On
    schedule(() => {
      setDemoStep('Water on the fire');
      stampMilestone('waterOn');
      addComms(firstUnit, `${firstUnit} has a line stretched, water on the fire.`, 'Tac 1');
      addEvent(`${firstUnit} has water on the fire`);
    }, 40000);

    // 50s — Progress report
    schedule(() => {
      setDemoStep('Knockdown — checking for extension');
      addComms(
        firstUnit,
        'Command, good knockdown on the second floor. Checking for extension.',
        'Tac 1'
      );
      addEvent('Good knockdown reported — checking extension');
    }, 50000);

    // 58s — Under Control
    schedule(() => {
      setDemoStep('Fire under control');
      stampMilestone('underControl');
      addComms('Command', 'Dispatch from Command — fire is under control. Hold the working fire assignment.', 'Dispatch');
      addEvent('Fire under control');
    }, 58000);

    // 65s — PAR check
    schedule(() => {
      setDemoStep('PAR check in progress');
      addComms('Command', 'All companies — PAR check. Report your personnel count.', 'Tac 1');
      addEvent('PAR check initiated by command');

      // Simulate PAR responses
      schedule(() => {
        addComms(firstUnit, `${firstUnit} — PAR, all members accounted for.`, 'Tac 1');
      }, 3000);
      if (secondUnit) {
        schedule(() => {
          addComms(secondUnit, `${secondUnit} — PAR complete.`, 'Tac 1');
        }, 5000);
      }
      if (thirdUnit) {
        schedule(() => {
          addComms(thirdUnit, `${thirdUnit} — PAR, all accounted.`, 'Tac 1');
        }, 7000);
      }

      // PAR result in timeline
      schedule(() => {
        const total = incident.units.length * 3; // estimate 3 per unit for demo
        setIncident(inc => {
          if (!inc) return inc;
          return {
            ...inc,
            parHistory: [
              ...(inc.parHistory || []),
              { time: new Date().toISOString(), count: total, missing: 0, total },
            ],
            timelineEvents: [
              ...(inc.timelineEvents || []),
              { id: Date.now() + Math.random(), time: new Date().toISOString(), event: `PAR — All ${total} accounted for`, type: 'par', auto: true },
            ],
          };
        });
        setDemoStep('PAR complete — all accounted');
      }, 9000);
    }, 65000);

    // 80s — Demo complete
    schedule(() => {
      setDemoRunning(false);
      setDemoStep('');
      addComms('Command', 'Dispatch from Command — beginning overhaul. Request an investigator when available.', 'Dispatch');
      addEvent('Overhaul commenced — demo sequence complete');
    }, 80000);

    demoTimersRef.current = timers;

    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [incident?.milestones?.dispatched]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup demo timers on unmount
  useEffect(() => {
    return () => {
      demoTimersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const elapsed = useElapsed(incident?.milestones?.dispatched);

  // PAR overdue tone.
  // Was: a rising-edge detector that fired only on the exact 0 transition. Two
  // ways that missed a genuinely overdue PAR: (a) if the component remounted while
  // already overdue, prevParCountdownRef started null and NO tone ever fired;
  // (b) the countdown used to clamp at 0, so a backgrounded tab whose interval was
  // throttled could skip the edge. Now the countdown goes NEGATIVE when overdue
  // (see below), so we fire on the STATE (just crossed into overdue) and re-arm
  // only once it's satisfied. Never infer safety from an edge you might miss.
  const parOverdueTonedRef = useRef(false);
  useEffect(() => {
    if (parCountdown == null) { parOverdueTonedRef.current = false; return; }
    if (parCountdown <= 0 && !parOverdueTonedRef.current) {
      parOverdueTonedRef.current = true;
      tonePar();
    } else if (parCountdown > 0) {
      parOverdueTonedRef.current = false;   // re-arm after a PAR resets the clock
    }
  }, [parCountdown]);

  // The department's PAR anchor, from GET /api/active-board (`par_anchor`).
  // DEFAULT = dispatch: present on every call, so the clock always starts, and it
  // matches the market-leading board (anchors to call creation). on_scene is the
  // explicit long-travel / volunteer choice (Annex A.8.2.4) — honoured when the
  // department sets it, but never the fail-open default, because on-scene time is
  // not guaranteed to exist. (Read the snake_case field the server actually
  // sends; tolerate a camelCase alias.)
  const parAnchor = (incident?.par_anchor ?? incident?.parAnchor) === PAR_ANCHOR.ON_SCENE
    ? PAR_ANCHOR.ON_SCENE
    : PAR_ANCHOR.DISPATCH;

  // PAR countdown timer.
  // NOTE: this deliberately does NOT clamp at zero. It used to — which meant an
  // overdue PAR read "PAR OVERDUE" forever, and the IC could not tell whether it
  // was 30 seconds late or 11 minutes late. On a fireground that difference is the
  // whole point of the tool. A negative value = seconds overdue, and the chip
  // renders it counting UP.
  useEffect(() => {
    if (!incident || !incident.parInterval || incident.parInterval <= 0) {
      setParCountdown(null);
      return;
    }

    // The math lives in utils/parClock.js so the fireground's most time-critical
    // number is unit-tested and cannot regress unnoticed. Do not inline it back.
    // `firstOnSceneAt` is DERIVED server-side from the moment dispatch flipped the
    // first unit to on_scene over the radio — see GET /api/active-board.
    const tick = () => setParCountdown(parRemainingSeconds(incident, Date.now(), parAnchor));

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [incident?.parInterval, incident?.parHistory, incident?.milestones?.dispatched, incident?.firstOnSceneAt, parAnchor]);

  function setMilestone(key) {
    const ts = nowIso();
    setIncident(inc => {
      if (inc.milestones[key]) return inc; // already stamped
      // Fireground events (evacuation, strategy change, collapse, all-clear) are
      // NOT in MILESTONES_BY_TYPE, so look them up too — otherwise the incident
      // record would read "Milestone: evacuation" (a variable name) instead of
      // "Emergency evacuation ordered". This text becomes the legal narrative.
      const fg = FIREGROUND_EVENTS.find(e => e.key === key);
      const label = fg
        ? fg.full
        : (getMilestones(inc.type).find(m => m.key === key)?.label || key);
      return {
        ...inc,
        milestones: { ...inc.milestones, [key]: ts },
        timelineEvents: [
          ...(inc.timelineEvents || []),
          { id: newId(), time: ts, event: fg ? `⚠ ${label}` : `Milestone: ${label}`, type: fg ? 'par_alert' : 'milestone', auto: true },
        ],
      };
    });
  }

  // ── MAYDAY (Phase 4): tap-and-snapshot. One tap freezes a snapshot server-side,
  // starts the clock, and auto-orders a PAR (stamps milestones.mayday → the same
  // benchmark trigger the fireground events use). No typed LUNAR / air / channel
  // (decisions log 2026-07-15) — the market pattern, and the only thing usable on a
  // chaotic scene.
  const maydayActive = Boolean(incident?.milestones?.mayday && !incident?.maydayResolvedAt);

  useEffect(() => {
    if (!maydayActive || !incident?.milestones?.mayday) { setMaydayElapsed('00:00'); setMaydayError(''); return; }
    const start = new Date(incident.milestones.mayday).getTime();
    const upd = () => {
      const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setMaydayElapsed(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
    };
    upd();
    const id = setInterval(upd, 1000);
    return () => clearInterval(id);
  }, [maydayActive, incident?.milestones?.mayday]);

  async function declareMayday() {
    if (!incident || maydayActive) return;
    setMaydayArm(false);
    const clientId = (window.crypto?.randomUUID?.()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ts = nowIso();
    // Stamp the milestone (raises PAR REQUIRED via parBenchmarkTriggers) + go red,
    // in one update. auto:false — a real MAYDAY belongs in the legal record.
    setIncident(inc => {
      if (!inc || inc.milestones?.mayday) return inc;
      return {
        ...inc,
        milestones: { ...inc.milestones, mayday: ts },
        maydayId: clientId,
        maydayResolvedAt: null,
        timelineEvents: [...(inc.timelineEvents || []),
          { id: newId(), time: ts, event: '🆘 MAYDAY DECLARED', type: 'par_alert', auto: false }],
      };
    });
    setMaydayError('');
    // Seal the snapshot server-side. Surface failure — never a silent write on a
    // life-safety record.
    const snapshot = {
      type: incident.type, address: incident.address,
      units: (incident.units || []).map(u => ({ designation: u.designation, status: u.status })),
      milestones: incident.milestones,
    };
    try {
      await api.post('/api/active-board/mayday', {
        client_id: clientId, scene_snapshot: snapshot, client_recorded_at: ts,
      });
    } catch (e) {
      setMaydayError('MAYDAY is active on the board, but the sealed server record did not save — it will retry on reconnect.');
    }
  }

  async function resolveMayday() {
    if (!incident?.maydayId) return;
    const evId = (window.crypto?.randomUUID?.()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const res = await api.post(`/api/active-board/mayday/${incident.maydayId}/events`, {
        events: [{ client_id: evId, kind: 'resolved' }],
      });
      const r = res?.data?.results?.[0];
      if (r?.status === 'rejected') {
        setMaydayError('Cannot resolve yet — run a whole-scene PAR (all accounted) first.');
        return;
      }
      setMaydayError('');
      setIncident(inc => inc ? ({
        ...inc, maydayResolvedAt: nowIso(),
        timelineEvents: [...(inc.timelineEvents || []),
          { id: newId(), time: nowIso(), event: 'MAYDAY resolved — all accounted', type: 'milestone', auto: false }],
      }) : inc);
    } catch (e) {
      setMaydayError('Could not record MAYDAY resolution — check connection and retry.');
    }
  }

  function addUnit(unit) {
    const ts = nowIso();
    setIncident(inc => ({
      ...inc,
      units: [...inc.units, { ...unit, id: newId() }],
      timelineEvents: [
        ...(inc.timelineEvents || []),
        { id: newId(), time: ts, event: `Unit added: ${unit.designation} (${unit.status})`, type: 'unit', auto: true },
      ],
    }));
    setShowUnitModal(false);
  }

  function updateUnitStatus(id, status) {
    setIncident(inc => ({ ...inc, units: inc.units.map(u => u.id === id ? { ...u, status } : u) }));
  }

  function removeUnit(id) {
    setIncident(inc => ({ ...inc, units: inc.units.filter(u => u.id !== id) }));
  }

  function addPerson(p) {
    // lastPar starts NULL, not now(). It used to be stamped at ADD time, so a
    // firefighter who had never been in a single PAR displayed "PAR 0m ago" — the
    // board asserting an accountability check that never happened. Never show a
    // life-safety value that isn't true; "never" is a legitimate state and the UI
    // renders it as such.
    setIncident(inc => ({
      ...inc,
      personnel: [...inc.personnel, {
        ...p,
        id: newId(),
        lastPar: null,
        // The accountability fact: which rig did they ride in on? null = POV.
        unitId: p.unitId ?? null,
        pov: !!p.pov,
      }],
    }));
    setShowPersonModal(false);
  }

  function updatePersonStatus(id, status) {
    setIncident(inc => ({ ...inc, personnel: inc.personnel.map(p => p.id === id ? { ...p, status } : p) }));
  }

  function removePerson(id) {
    setIncident(inc => ({ ...inc, personnel: (inc.personnel || []).filter(p => p.id !== id) }));
  }

  function addRole(role) {
    setIncident(inc => ({ ...inc, roles: [...inc.roles, { ...role, id: newId() }] }));
    setShowRoleModal(false);
  }

  function removeRole(id) {
    setIncident(inc => ({ ...inc, roles: inc.roles.filter(r => r.id !== id) }));
  }

  function runPar(checkedIds) {
    const ts = nowIso();
    const onScene = (incident.personnel || []).filter(p => p.status !== 'Returned');
    const total   = onScene.length;
    // A person is accounted for ONLY if they were affirmatively checked. There is
    // no "no list supplied = everyone is fine" shortcut any more — see the PAR
    // modal note. An empty set means nobody has been accounted for yet, and that
    // is the honest reading.
    const checked   = checkedIds instanceof Set ? checkedIds : new Set();
    const accounted = onScene.filter(p => checked.has(p.id)).length;
    const missing   = total - accounted;

    // A completed PAR is a REPLAYABLE append-only record (0058). It carries:
    //   • client_id — a UUID minted here. The server dedupes on it, so a retry
    //     after an outage cannot double-record.
    //   • ran_at — the real time the PAR happened (this ts), so a LATE write
    //     records when it actually occurred, not when the network came back.
    //   • an incident snapshot, so the PAR still records if the call has closed.
    //
    // On failure we do NOT tell the IC to "re-run it" — nobody re-runs a PAR on a
    // fireground because an app asked. We QUEUE it (offlineQueue, localStorage-
    // backed, auto-flushed on reconnect by OfflineBanner). The PAR survives the
    // outage and lands itself; the idempotency key makes replay safe.
    const parBody = {
      client_id: newClientUuid(),
      ran_at: ts,
      accounted, missing, total,
      results: onScene.map(p => ({ name: p.name, accounted: checked.has(p.id) })),
      incident_id:   Number.isInteger(incident?.id) ? incident.id : null,
      incident_type: incident?.type || '',
      address:       incident?.address || '',
    };
    api.post('/api/active-board/par', parBody)
      .then(() => setParSaveError(null))
      .catch(() => {
        // Durable queue — replays on reconnect, idempotent via client_id.
        const queued = offlineQueue.push({
          method: 'POST', url: '/api/active-board/par', body: parBody,
          label: `PAR ${accounted}/${total} @ ${timeStr(ts)}`,
        });
        setParSaveError(queued
          ? null   // queued successfully — it will sync; no alarm needed
          : 'PAR could not be saved OR queued (device storage full). Note it manually.');
      });

    setIncident(inc => ({
      ...inc,
      personnel: inc.personnel.map(p => (checked.has(p.id) ? { ...p, lastPar: ts } : p)),
      parHistory: [...(inc.parHistory || []), { time: ts, count: accounted, missing, total }],
      timelineEvents: [
        ...(inc.timelineEvents || []),
        {
          id: newId(), time: ts,
          event: missing > 0
            ? `PAR — ${accounted}/${total} accounted · ⚠ ${missing} NOT accounted for`
            : `PAR — All ${accounted} accounted for`,
          type: missing > 0 ? 'par_alert' : 'par', auto: true,
        },
      ],
    }));
    setParCountdown(null);
    setParChecks({});
    setShowParModal(false);
  }

  function setIcsNote(section, val) {
    setIncident(inc => ({ ...inc, icsNotes: { ...inc.icsNotes, [section]: val } }));
  }

  function addCommsEntry(entry) {
    setIncident(inc => ({
      ...inc,
      commsLog: [{ ...entry, id: newId(), time: nowIso() }, ...(inc.commsLog || [])],
    }));
    setShowCommsModal(false);
  }

  // Update command officer — dispatcher enters who announced command on the radio
  function updateCommandOfficer(officerName, transferNote) {
    const ts = nowIso();
    const prevIC = incident.ic;
    const isTransfer = Boolean(prevIC && incident.commandAssumed);
    const eventText = isTransfer
      ? `Command transferred: ${prevIC} → ${officerName}${transferNote ? ` (${transferNote})` : ''}`
      : `Command established — IC: ${officerName}`;
    setIncident(inc => ({
      ...inc,
      ic: officerName,
      commandAssumed: true,
      milestones: { ...inc.milestones, onScene: inc.milestones.onScene || ts },
      timelineEvents: [
        ...(inc.timelineEvents || []),
        { id: newId(), time: ts, event: eventText, type: 'milestone', auto: false },
      ],
    }));
    setShowCommandModal(false);
  }

  function addTimelineEvent(event, type = 'manual') {
    const ts = nowIso();
    setIncident(inc => ({
      ...inc,
      timelineEvents: [
        ...(inc.timelineEvents || []),
        { id: newId(), time: ts, event, type, auto: false },
      ],
    }));
  }

  function addRehabEntry(name) {
    const ts = nowIso();
    setIncident(inc => {
      const cycle = (inc.rehabLog || []).filter(r => r.name === name).length + 1;
      return {
        ...inc,
        rehabLog: [...(inc.rehabLog || []), { id: newId(), name, enteredAt: ts, exitedAt: null, cycle }],
        timelineEvents: [
          ...(inc.timelineEvents || []),
          { id: newId(), time: ts, event: `${name} entered Rehab (Cycle ${cycle})`, type: 'rehab', auto: true },
        ],
      };
    });
  }

  function exitRehab(id) {
    const ts = nowIso();
    const entry = (incident.rehabLog || []).find(r => r.id === id);
    setIncident(inc => ({
      ...inc,
      rehabLog: inc.rehabLog.map(r => r.id === id ? { ...r, exitedAt: ts } : r),
      timelineEvents: [
        ...(inc.timelineEvents || []),
        { id: newId(), time: ts, event: `${entry?.name || 'Member'} released from Rehab`, type: 'rehab', auto: true },
      ],
    }));
  }

  const isHazmat          = incident ? HAZMAT_TYPES.includes(incident.type) : false;
  const onScenePersonnel  = incident ? (incident.personnel || []).filter(p => p.status !== 'Returned') : [];
  const assignedNames     = incident ? new Set((incident.personnel || []).map(p => p.name)) : new Set();
  const availableMembers  = liveMembers.filter(m => !assignedNames.has(m));
  const inRehab           = (incident?.rehabLog || []).filter(r => !r.exitedAt);
  const pastRehab         = (incident?.rehabLog || []).filter(r => r.exitedAt).slice(-6).reverse();
  // PERSONNEL GROUPED BY THE RIG THEY RODE IN ON.
  // A firefighter does not appear on a fireground unattached — they arrive on
  // apparatus, in a seat. The exception is the volunteer who arrives POV, and they
  // are NOT "just on scene": they go in a LOUD pool until Command gives them a job.
  // Assigned to a rig, or in the pool. No third state. (Freelancing must be
  // impossible to hide.)
  // What the PAR clock counts from — surfaced on screen. A life-safety value
  // never travels without its provenance.
  const parBasisInfo = useMemo(
    () => (incident ? parBasis(incident, parAnchor) : null),
    [incident, parAnchor]
  );
  // Benchmarks that fired after the last PAR. These OWE the IC a PAR regardless of
  // what the wall clock says. (NJ mandates the benchmarks and ZERO intervals.)
  const parOwed = useMemo(() => (incident ? parBenchmarkTriggers(incident) : []), [incident]);

  // ── ACCOUNTABILITY COHERENCE ────────────────────────────────────────────────
  // You cannot have personnel on scene from a rig that never arrived. The only
  // legitimate exception is the volunteer who came POV. Anything else is a
  // contradiction, and a contradiction on an accountability board is not something
  // to render quietly — it means the board and the fireground disagree, and the
  // board is the one that's wrong. SURFACE IT.
  const unitsOnScene = useMemo(
    () => (incident?.units || []).filter(u => u.status === 'On Scene'),
    [incident?.units]
  );
  const povCount = useMemo(
    () => (incident?.personnel || []).filter(p => p.status !== 'Returned' && !p.unitId).length,
    [incident?.personnel]
  );
  // People marked on scene whose RIG is not on scene, and who did not arrive POV.
  // Either the rig's status is stale, or the person's is. Command must reconcile it
  // over the radio — we will not guess which.
  const ghostPersonnel = useMemo(() => {
    const units = incident?.units || [];
    return (incident?.personnel || []).filter(p => {
      if (p.status === 'Returned' || !p.unitId) return false;   // POV is handled above
      const rig = units.find(u => u.id === p.unitId);
      return !rig || rig.status !== 'On Scene';
    });
  }, [incident?.personnel, incident?.units]);

  const personnelByUnit = useMemo(() => {
    const people = incident?.personnel || [];
    const units  = incident?.units || [];
    const groups = [];
    for (const u of units) {
      const crew = people.filter(p => p.unitId === u.id);
      if (crew.length) groups.push({ key: `u-${u.id}`, label: u.designation, people: crew, pov: false });
    }
    // Anyone with no rig: POV arrivals, plus any legacy person added before the
    // board modelled apparatus at all. Both need Command's attention.
    const orphans = people.filter(p => !p.unitId || !units.some(u => u.id === p.unitId));
    if (orphans.length) {
      groups.push({ key: 'pov', label: 'POV / UNASSIGNED — no apparatus', people: orphans, pov: true });
    }
    return groups;
  }, [incident?.personnel, incident?.units]);

  const allTimelineEvents = [...(incident?.timelineEvents || [])].sort((a, b) => new Date(b.time) - new Date(a.time));

  // Dispatch and command-level officers (Chief, Deputy Chief, Battalion Chief) can edit the board.
  // All other members have a read-only view.
  const EDIT_ROLES = ['dispatch', 'chief', 'deputy_chief', 'battalion_chief'];
  const canEdit = EDIT_ROLES.includes(currentUser?.role);

  return (
    <div className={`glove-friendly max-w-[1600px] mx-auto px-4 py-4 space-y-4 ${maydayActive ? 'ring-4 ring-red-600 rounded-2xl' : ''}`}>

      {/* ── Tab Bar ── */}
      <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-1 gap-1">
        <button
          onClick={() => setActiveTab('dispatch')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-colors ${
            activeTab === 'dispatch'
              ? 'bg-white dark:bg-gray-900 text-red-700 dark:text-red-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Radio size={15} />
          Live Dispatch
          {dispatches.length > 0 && (
            <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${
              activeTab === 'dispatch' ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400' : 'bg-red-500 text-white animate-pulse'
            }`}>
              {dispatches.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('board')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-colors ${
            activeTab === 'board'
              ? 'bg-white dark:bg-gray-900 text-red-700 dark:text-red-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Siren size={15} />
          Command Board
          {incident && (
            <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${
              activeTab === 'board' ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400' : 'bg-red-600 text-white animate-pulse'
            }`}>
              ACTIVE
            </span>
          )}
        </button>
        {!incident && !showDemoTimeline && (
          <button
            onClick={() => { setShowDemoTimeline(true); setActiveTab('board'); }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-900"
          >
            <Zap size={14} />
            Demo
          </button>
        )}
        <button onClick={() => toggleTheme()} title="Toggle dark mode" aria-label="Toggle dark mode" className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Moon size={14} className="dark:hidden" /><Sun size={14} className="hidden dark:block" /></button>
      </div>

      {/* ── DemoTimeline Player — sticky compact bar ── */}
      {showDemoTimeline && (
        <div className="sticky top-0 z-10">
        <DemoTimeline
          setIncident={setIncident}
          onTick={(secs) => setDemoElapsed(secs)}
          onActivate={(inc) => {
            const now = new Date().toISOString();
            setIncident({
              ...inc,
              milestones: { dispatched: now },
              personnel: [],
              roles: [],
              commsLog: [],
              rehabLog: [],
              timelineEvents: [
                { id: Date.now(), time: now, event: `Incident activated — ${inc.type} @ ${inc.address}`, type: 'activation', auto: true },
              ],
            });
            onAlertConsumed();
            setActiveTab('board');
          }}
          // NO onEvent HANDLER HERE — ON PURPOSE. DemoTimeline is the SINGLE owner of
          // demo event application: it applies every event through the `setIncident`
          // prop above and stamps `_demoFlash` for the visual flashes this file reads.
          // CommandBoard used to ALSO apply the same events via an `onEvent` callback,
          // so every Radio Log entry and timeline event was written twice and the ICS
          // chart rendered two Incident Commander cards (this file's copy pushed the IC
          // role with no already-present guard). One event, one writer. Do not re-add.
          onClose={() => {
            setShowDemoTimeline(false);
            setIncident(null);
          }}
          onDemoComplete={() => {
            setDemoRunning(false);
          }}
        />
        </div>
      )}

      {/* ── Live Dispatch Tab ── */}
      {activeTab === 'dispatch' && (
        <div className="space-y-4">
          <ScreenErrorBoundary label="Live Dispatch">
            <LiveDispatch
              dispatches={dispatches}
              onClearBadge={onClearBadge}
              onNavigate={() => setActiveTab('board')}
              onAddDispatch={onAddDispatch}
              onSetupCAD={() => onNavigate('cad')}
              departmentId={currentUser?.department_id}
              currentUser={currentUser}
              onCallCleared={onCallCleared}
              onCallReopened={onCallReopened}
            />
          </ScreenErrorBoundary>
          {/* Live apparatus status alongside the incoming-call feed (Phase 2) */}
          <ScreenErrorBoundary label="Unit Status">
            <UnitStatusBoard user={currentUser} title="Unit Status — Live" selectedStation={selectedStation} />
          </ScreenErrorBoundary>
        </div>
      )}

      {/* ── Command Board Tab ── */}
      {activeTab === 'board' && !incident && (
        <SetupScreen
          onActivate={(inc) => {
            onAlertConsumed();
            const activatedAt = inc.milestones?.dispatched || nowIso();
            setIncident(applyParDefault({
              ...inc,
              rehabLog: [],
              timelineEvents: [
                { id: Date.now(), time: activatedAt, event: `Incident activated — ${inc.type} @ ${inc.address}`, type: 'activation', auto: true },
              ],
            }));
            api.put('/api/active-board', {
              type: inc.type,
              address: inc.address,
              dispatched_at: inc.milestones.dispatched,
              personnel_count: 0,
              units_count: 0,
            }).catch(() => {});
          }}
          onNavigate={onNavigate}
          members={liveMembers}
          locations={liveLocations}
          initialAlert={initialAlert}
          wind={wind}
        />
      )}

      {activeTab === 'board' && incident && <div className={showDemoTimeline ? 'space-y-2' : 'space-y-4'}>

      {/* ── Demo Mode Banner ── */}
      {/* A demo incident stays visibly a demo for its WHOLE life — not just while
          the auto-sequence is playing. The old banner was tied to `demoRunning`, so
          the moment the 80-second script finished, a board full of fabricated radio
          traffic, a fabricated IC and a fabricated PAR looked exactly like a real
          incident. Anyone walking up to the screen mid-demo could not tell. */}
      {incident?.isDemo && !demoRunning && (
        <div className="bg-amber-500 rounded-2xl px-4 py-2 flex items-center gap-2 shadow-lg">
          <Radio size={16} className="text-white shrink-0" />
          <p className="text-xs font-black text-white">
            DEMO INCIDENT — simulated data. This will not be saved to the incident log.
          </p>
        </div>
      )}

      {demoRunning && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <Radio size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">DEMO MODE — Auto-Sequence Active</p>
            <p className="text-xs text-amber-100 truncate">{demoStep}</p>
          </div>
          <button
            onClick={() => {
              demoTimersRef.current.forEach(t => clearTimeout(t));
              demoTimersRef.current = [];
              setDemoRunning(false);
              setDemoStep('');
            }}
            className="flex-shrink-0 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
          >
            Stop Demo
          </button>
        </div>
      )}

      {/* ── Header bar ── */}
      <div className={`bg-red-700 rounded-2xl text-white ${showDemoTimeline ? 'p-2.5' : 'p-4'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Siren size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">{incident.type}</span>
                <span className="text-xs text-red-200">#{incident.incidentNumber}</span>
              </div>
              <h1 className="text-lg font-black leading-tight">{incident.address}</h1>
              {incident.commandAssumed
                ? <p className="text-xs text-red-200">IC: <strong className="text-white">{incident.ic}</strong></p>
                : canEdit
                  ? <button onClick={() => setShowCommandModal(true)} className="text-xs bg-amber-500 hover:bg-amber-400 text-white font-black px-2 py-0.5 rounded-lg animate-pulse mt-0.5">
                      ⚡ Command Not Established — Update
                    </button>
                  : <p className="text-xs text-amber-300 font-bold mt-0.5">⚡ Awaiting first arrival</p>
              }
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-red-200">Elapsed</p>
              <p className="text-2xl font-black font-mono tabular-nums">{elapsed}</p>
              <p className="text-xs text-red-200">{timeStr(incident.milestones.dispatched)} dispatch</p>
            </div>
            <button
              onClick={() => onRespond({
                id: incident.id || Date.now(),
                type: incident.type || 'Unknown',
                address: incident.address || '',
                // `designation`, not `name` — units have never had a `name` field, so
                // this used to emit ",," and the responder payload carried no units.
                units: incident.units?.map(u => u.designation).filter(Boolean).join(', ') || '',
                dispatched_at: incident.milestones?.dispatched || new Date().toISOString(),
              })}
              className="px-3 py-1.5 bg-green-500 hover:bg-green-400 text-white text-xs font-black rounded-lg flex items-center gap-1 shadow-lg"
              title="Get live AI guidance for this incident"
            >
              🚒 I'm Responding
            </button>
            {canEdit && (
              <button
                onClick={() => setShowRecallBtn(true)}
                className="px-3 py-1.5 bg-orange-600/70 hover:bg-orange-500/80 text-white text-xs font-bold rounded-lg flex items-center gap-1"
                title="Issue a recall / all-call to off-duty members"
              >
                <Siren size={12} /> Recall
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setConfirmClose(true)}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg"
              >
                Close Incident
              </button>
            )}
          </div>
        </div>
        {/* Stats.
            This row used to read "0 on scene · 3 personnel", which is not a thing:
            firefighters arrive ON APPARATUS. The units count was unlabelled, so it
            read as a contradiction on a red bar at 0300. Both counts are now
            explicit, and any state that IS genuinely incoherent gets SURFACED
            rather than quietly rendered (see the accountability warning below). */}
        <div className="mt-3 flex flex-wrap gap-4 text-sm items-center">
          <span className="flex items-center gap-1">
            <Truck size={14} /> {unitsOnScene.length} {unitsOnScene.length === 1 ? 'unit' : 'units'} on scene
          </span>
          <span className="flex items-center gap-1">
            <Users size={14} /> {onScenePersonnel.length} personnel
          </span>
          {povCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500 text-white text-xs font-black">
              <AlertTriangle size={13} /> {povCount} POV — UNASSIGNED
            </span>
          )}
          {incident.parHistory?.length > 0 && (
            <span className="flex items-center gap-1 text-red-200">
              <UserCheck size={14} /> PAR {timeStr(incident.parHistory.at(-1)?.time)}
            </span>
          )}
          {wind && (
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold ${
              wind.speed >= 35 ? 'bg-red-900/60 text-red-100' :
              wind.speed >= 25 ? 'bg-orange-800/60 text-orange-100' :
              wind.speed >= 15 ? 'bg-yellow-800/50 text-yellow-100' :
              'bg-white/15 text-white/80'
            }`}>
              <Wind size={13} />
              {wind.speed} mph {wind.compass && `${wind.compass}`}
              {wind.gusts && wind.gusts > wind.speed + 5 && ` · gusts ${wind.gusts}`}
            </span>
          )}

          {/* PAR Interval Selector — dispatch only */}
          {canEdit && (
            <div className="flex items-center gap-2 ml-auto">
              <select
                value={incident.parInterval || 0}
                onChange={e => {
                  const minutes = parseInt(e.target.value);
                  setIncident(inc => ({ ...inc, parInterval: minutes }));
                  // PAR spine (0048): persist so every surface (TV, a second
                  // console) shares the countdown. Best-effort — local UI is
                  // never blocked on the write.
                  api.patch('/api/active-board/par-interval', { minutes: minutes > 0 ? minutes : null }).catch(() => {});
                }}
                aria-label="PAR check interval"
                className="text-xs bg-red-600 text-white border border-red-400 rounded-lg px-2 py-1 font-semibold"
              >
                <option value={0}>No PAR timer</option>
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
                <option value={20}>20 min</option>
                <option value={30}>30 min</option>
              </select>
            </div>
          )}

          {/* PAR Countdown Display.
              Overdue now counts UP. It used to clamp at zero and read a flat
              "PAR OVERDUE" forever — so the IC could not tell 30 seconds late from
              11 minutes late, which is the entire decision the number exists to
              support. Never show a life-safety value without its magnitude. */}
          {incident.parInterval > 0 && parCountdown !== null && (
            <div className={`flex items-center gap-1 font-bold text-xs px-3 py-1 rounded-lg ${
              parCountdown <= 0
                ? 'bg-red-500 text-white animate-pulse'
                : parCountdown <= 120
                ? 'bg-orange-500 text-white animate-pulse'
                : 'bg-green-500 text-white'
            }`}>
              <Clock size={13} />
              {parChipLabel(parCountdown)}
            </div>
          )}
        </div>

        {/* WHAT THE CLOCK COUNTS FROM. Never show a life-safety value without its
            provenance. This matters more than it looks: in most jurisdictions
            DISPATCH is already announcing 10-minute elapsed-time notifications over
            the radio (NFPA 1500 §8.2.4 makes it their job). If our clock is
            anchored differently from theirs, the IC hears two different numbers for
            the same fire. Saying the anchor out loud is what makes them reconcile. */}
        {incident.parInterval > 0 && parBasisInfo && (
          <p className="mt-1.5 text-[11px] text-red-100/80 font-semibold">
            PAR clock: {parBasisInfo.from}
            {incident.firstOnSceneUnit && parBasisInfo.from.includes('on scene')
              ? ` (${incident.firstOnSceneUnit}, ${timeStr(parBasisInfo.time)})`
              : ` (${timeStr(parBasisInfo.time)})`}
          </p>
        )}
        {incident.parInterval > 0 && !parBasisInfo && (
          <p className="mt-1.5 text-[11px] text-amber-200 font-bold">
            PAR clock not started — no unit on scene yet. Crews are still responding.
          </p>
        )}

        {/* ── A BENCHMARK OWES YOU A PAR ────────────────────────────────────────
            PAR is BENCHMARK-driven first and clock-driven second. New Jersey's
            statewide regulation (N.J.A.C. 5:75-2.4(f)) mandates five triggers and
            ZERO time intervals — an entire state says the benchmarks ARE the
            doctrine and the clock is optional. A board that only nags on a wall
            clock is doctrinally wrong.

            We PROMPT. We never run it. Same rule as unit status: the machine does
            not perform a roll call — a human does, over the radio, and then tells
            us. A PAR the system "completed" is not a PAR. */}
        {/* ── MAYDAY — the whole board goes red. Two-tap DECLARE; then a snapshot is
            frozen server-side, the clock runs, and a PAR is auto-ordered (the mayday
            milestone raises PAR REQUIRED below). No typed LUNAR / air / channel. ── */}
        {canEdit && incident && (maydayActive ? (
          <div className="mt-2 rounded-lg border-4 border-red-600 bg-red-700 px-3 py-2 shadow-lg">
            <div className="flex items-center gap-3 flex-wrap">
              <Siren size={18} className="text-white shrink-0 animate-pulse" />
              <p className="text-sm font-black text-white flex-1 min-w-0 tracking-wide">
                MAYDAY ACTIVE · {maydayElapsed}
                {incident.milestones?.mayday && (
                  <span className="opacity-70 font-semibold"> · declared {timeStr(incident.milestones.mayday)}</span>
                )}
              </p>
              <button
                onClick={resolveMayday}
                className="shrink-0 px-3 py-1.5 bg-white text-red-700 text-xs font-black rounded-lg hover:bg-red-50"
              >
                MAYDAY RESOLVED
              </button>
            </div>
            {maydayError && <p className="text-[11px] font-bold text-white/90 mt-1">{maydayError}</p>}
          </div>
        ) : (
          <div className="mt-2">
            <button
              onClick={() => {
                if (maydayArm) { declareMayday(); }
                else { setMaydayArm(true); setTimeout(() => setMaydayArm(false), 3000); }
              }}
              className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 font-black text-sm tracking-wide transition-colors ${
                maydayArm
                  ? 'border-red-700 bg-red-700 text-white animate-pulse'
                  : 'border-red-600 bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              <Siren size={18} /> {maydayArm ? 'TAP AGAIN TO CONFIRM MAYDAY' : 'DECLARE MAYDAY'}
            </button>
            {maydayError && <p className="text-[11px] font-bold text-red-700 dark:text-red-400 mt-1">{maydayError}</p>}
          </div>
        ))}

        {parOwed.length > 0 && (
          <div className="mt-2 rounded-lg border-2 border-amber-300 bg-amber-500/90 px-3 py-2">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTriangle size={15} className="text-white shrink-0" />
              <p className="text-xs font-black text-white flex-1 min-w-0">
                PAR REQUIRED — {parOwed.map(b => b.label).join(' · ')}
              </p>
              {canEdit && (
                <button
                  onClick={() => setShowParModal(true)}
                  className="shrink-0 px-3 py-1 bg-white text-amber-700 text-xs font-black rounded-lg hover:bg-amber-50"
                >
                  RUN PAR
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── THE BOARD AND THE FIREGROUND DISAGREE ─────────────────────────────
            Personnel marked on scene from a rig that is not on scene, who did not
            arrive POV. One of the two statuses is stale. We do NOT guess which, and
            we do NOT quietly render a number we can't stand behind — we tell
            Command to reconcile it over the radio. */}
        {ghostPersonnel.length > 0 && (
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-900/50 px-3 py-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-200 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold text-amber-100">
                {ghostPersonnel.length} on scene from {ghostPersonnel.length === 1 ? 'a unit' : 'units'} not marked on scene
                {' '}({[...new Set(ghostPersonnel.map(p => (incident.units.find(u => u.id === p.unitId)?.designation) || '?'))].join(', ')}).
                {' '}Confirm over the radio and correct the unit status — the accountability count is only as good as this.
              </p>
            </div>
          </div>
        )}

        {/* A PAR that did not reach the server is NOT a PAR. This used to be a
            `.catch(() => {})`: the board would render "All accounted for" over a
            write the server never received. */}
        {parSaveError && (
          <div className="mt-2 flex items-center gap-2 bg-red-900/60 border border-red-400 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="text-red-200 shrink-0" />
            <p className="text-xs font-bold text-red-100 flex-1">{parSaveError}</p>
            <button
              onClick={() => setParSaveError(null)}
              className="text-[10px] font-black text-red-200 hover:text-white underline shrink-0"
            >
              DISMISS
            </button>
          </div>
        )}
      </div>

      {/* ── View-only banner for non-dispatch members ── */}
      {!canEdit && (
        <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-blue-500 text-base">👁</span>
          <p className="text-sm text-blue-800 dark:text-blue-300 font-semibold">View Mode — Board is managed by Dispatch or Command Officers during an active call</p>
        </div>
      )}

      {/* ── Dispatch Info Strip (visible to all members) ── */}
      {!incident.commandAssumed && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-700 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-2xl flex-shrink-0">⚡</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-amber-900 dark:text-amber-200">Awaiting First Arrival — Command Not Yet Established</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              Dispatched units en route · First arriving officer will announce Command on radio · Dispatch updates IC below
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowCommandModal(true)}
              className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-3 py-2 rounded-xl"
            >
              Update Command
            </button>
          )}
        </div>
      )}

      {/* ── Command Established banner ── */}
      {incident.commandAssumed && (
        <div className="bg-green-50 dark:bg-green-950/50 border border-green-300 dark:border-green-800 rounded-2xl px-4 py-2.5 flex items-center gap-3">
          <CheckCircle2 size={18} className="text-green-600 dark:text-green-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-green-900 dark:text-green-200">Command Established</p>
            <p className="text-xs text-green-700 dark:text-green-300">IC: <strong>{incident.ic}</strong> · Reported to dispatch</p>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowCommandModal(true)}
              className="flex-shrink-0 text-xs text-green-700 dark:text-green-300 font-bold hover:underline"
            >
              Transfer Command
            </button>
          )}
        </div>
      )}

      {/* ── Milestone timeline ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Timeline {canEdit ? '— tap to stamp' : '— view only'}
        </p>
        <div className="flex flex-wrap gap-2">
          {getMilestones(incident.type).map(({ key, label }) => {
            const ts = incident.milestones[key];
            return (
              <button
                key={key}
                onClick={() => canEdit && setMilestone(key)}
                disabled={Boolean(ts) || !canEdit}
                className={`flex flex-col items-center px-3 py-2 rounded-xl border-2 transition-colors min-w-[82px] ${
                  ts
                    ? 'border-green-500 bg-green-50 dark:bg-green-950/50 cursor-default'
                    : canEdit
                    ? 'border-dashed border-gray-300 dark:border-gray-700 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/50'
                    : 'border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 cursor-default opacity-60'
                }`}
              >
                {ts
                  ? <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 mb-0.5" />
                  : <Clock size={16} className="text-gray-400 mb-0.5" />}
                <span className={`text-xs font-bold ${ts ? 'text-green-700 dark:text-green-300' : 'text-gray-500 dark:text-gray-400'}`}>{label}</span>
                {ts && <span className="text-[10px] text-green-600 dark:text-green-400">{timeStr(ts)}</span>}
              </button>
            );
          })}
        </div>

        {/* ── FIREGROUND EVENTS — the things that OWE YOU A PAR ────────────────
            Kept OUT of the milestone strip above on purpose. Those are the normal
            arc of a call; these are the moments the fireground changes under you.
            Rendering "Emergency Evacuation" next to "Water On" would frame an
            order to get everyone out as a routine step.

            Each stamps a milestone that raises the PAR REQUIRED prompt in the
            header (parBenchmarkTriggers). We prompt — a human calls the roll over
            the radio. The board never runs a PAR for you.

            N.J.A.C. 5:75-2.4(f) mandates these triggers and ZERO time intervals.
            The clock is the backstop; THESE are the doctrine. */}
        {canEdit && (
          <>
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-wide mb-2">
                Fireground Events — declare, then run a PAR
              </p>
              <div className="flex flex-wrap gap-2">
                {FIREGROUND_EVENTS.map(({ key, label, full, tone, confirm }) => {
                  const ts = incident.milestones[key];
                  const red = tone === 'red';
                  return (
                    <button
                      key={key}
                      title={full}
                      disabled={Boolean(ts)}
                      onClick={() => {
                        if (ts) return;
                        // An emergency evacuation is an ORDER, not a checkbox. A
                        // mis-tap on a fireground must not declare one.
                        if (confirm && !window.confirm(`Declare: ${full}?\n\nThis is timestamped into the incident record and will require a PAR.`)) return;
                        setMilestone(key);
                        setShowParModal(true);   // the prompt IS the point
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 font-black text-xs transition-colors ${
                        ts
                          ? 'border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-500 cursor-default'
                          : red
                          ? 'border-red-500 bg-red-600 text-white hover:bg-red-700'
                          : 'border-amber-400 bg-amber-500 text-white hover:bg-amber-600'
                      }`}
                    >
                      <AlertTriangle size={13} />
                      {label}
                      {ts && <span className="font-semibold opacity-70">· {timeStr(ts)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* During demo: reorder sections into a 2x2 grid — ICS Roles, Units, Personnel, Comms */}
      {showDemoTimeline && (
        <div className="space-y-2">

          {/* ── ROW 0: Response Map (shows apparatus converging on scene) ── */}
          <ScreenErrorBoundary label="Response Map">
            <ResponseMap incident={incident} departmentId={currentUser?.department_id} />
          </ScreenErrorBoundary>

          {/* ── All Resources (multi-agency tracking) ── */}
          <ResourceTracker compact />

          {/* ── ROW 1: ICS Org Chart (full width, top priority) ── */}
          <SectionCard icon={ShieldAlert} iconColor="bg-red-700" title="ICS Organization Chart">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {(incident.roles || []).length === 0
                ? <p className="text-xs text-gray-400 text-center py-1 col-span-full">Awaiting command establishment...</p>
                : (incident.roles || []).map(r => {
                  const roleFlash = (incident._demoFlash?.type === 'command_established' || incident._demoFlash?.type === 'add_role') && Date.now() - (incident._demoFlash?.time || 0) < 5000;
                  return (
                  <div key={r.id} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 transition-all duration-700 ${roleFlash ? 'bg-red-100 dark:bg-red-950/50 border-2 border-red-400 shadow-lg scale-[1.03]' : 'bg-gray-50 dark:bg-gray-950 border-2 border-transparent'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${roleFlash ? 'bg-red-600 animate-pulse' : 'bg-red-100 dark:bg-red-950/50'}`}>
                      <ShieldAlert size={14} className={roleFlash ? 'text-white' : 'text-red-600 dark:text-red-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-red-600 dark:text-red-400 font-black uppercase tracking-wider">{r.role}</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{r.assignee}</p>
                    </div>
                  </div>
                  );
                })
              }
            </div>
          </SectionCard>

          {/* ── ROW 2: Units + Comms side by side ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <div ref={unitsRef}>
            <SectionCard icon={Truck} iconColor="bg-blue-600" title="Apparatus / Units">
              <div className="space-y-1.5">
                {incident.units.map((u, idx) => {
                  const BOLD_COLORS = {
                    'Dispatched':{ bg: 'bg-gray-200 dark:bg-gray-700',   badge: 'bg-gray-600 text-white',   dot: 'bg-gray-500'  },
                    'En Route':  { bg: 'bg-blue-200 dark:bg-blue-900',   badge: 'bg-blue-600 text-white',   dot: 'bg-blue-600'  },
                    'On Scene':  { bg: 'bg-green-200 dark:bg-green-900',  badge: 'bg-green-600 text-white',  dot: 'bg-green-600' },
                    'Staging':   { bg: 'bg-yellow-200 dark:bg-yellow-900', badge: 'bg-yellow-500 text-white', dot: 'bg-yellow-500'},
                    'Committed': { bg: 'bg-orange-200 dark:bg-orange-900', badge: 'bg-orange-600 text-white', dot: 'bg-orange-600'},
                  };
                  const c = BOLD_COLORS[u.status] || BOLD_COLORS['Dispatched'];
                  const flash = incident._demoFlash?.type === 'unit_status' && Date.now() - (incident._demoFlash?.time || 0) < 4000;
                  return (
                  <div key={u.id ?? idx} className={`flex items-center gap-2 rounded-lg px-3 py-2 border-2 transition-all duration-700 ${c.bg} ${flash ? 'border-amber-400 shadow-lg ring-2 ring-amber-300 scale-[1.02]' : 'border-transparent'}`}>
                    <div className={`w-3 h-3 rounded-full ${c.dot} flex-shrink-0 ${flash ? 'animate-ping' : ''}`} />
                    <Truck size={14} className="text-gray-600 dark:text-gray-300 shrink-0" />
                    <p className="text-sm font-black text-gray-900 dark:text-gray-100 flex-1">{u.designation}</p>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-full ${c.badge}`}>{u.status}</span>
                  </div>
                  );
                })}
              </div>
            </SectionCard>
            </div>

            <div ref={commsRef}>
            <SectionCard icon={Radio} iconColor="bg-sky-700" title={`Radio Log (${(incident.commsLog || []).length})`}>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {(incident.commsLog || []).length === 0
                  ? <p className="text-xs text-gray-400 text-center py-1">No radio traffic</p>
                  : (incident.commsLog || []).slice(0, 8).map((entry, i) => {
                    const isNew = i === 0 && incident._demoFlash?.type === 'comms' && Date.now() - (incident._demoFlash?.time || 0) < 4000;
                    return (
                    <div key={entry.id} className={`rounded-lg px-2.5 py-1.5 text-xs transition-all duration-700 ${isNew ? 'bg-sky-100 dark:bg-sky-950/50 border border-sky-300 dark:border-sky-800 shadow-sm' : 'bg-gray-50 dark:bg-gray-950 border border-transparent'}`}>
                      <div className="flex items-center gap-1.5">
                        {isNew && <Radio size={10} className="text-sky-700 animate-pulse" />}
                        <span className="font-bold text-sky-700 dark:text-sky-300">{entry.from}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-400">{entry.channel}</span>
                        <span className="text-gray-400 ml-auto text-[10px]">{new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                      <p className={`mt-0.5 leading-snug ${isNew ? 'text-sky-900 dark:text-sky-200 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>{entry.message}</p>
                    </div>
                    );
                  })
                }
              </div>
            </SectionCard>
            </div>
          </div>

          {/* ── ROW 3: Personnel + Commander Cam side by side ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <SectionCard icon={Users} iconColor="bg-green-600" title={`Personnel (${onScenePersonnel.length})`}>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {(incident.personnel || []).length === 0
                  ? <p className="text-xs text-gray-400 text-center py-1">No personnel logged</p>
                  : (incident.personnel || []).map(p => {
                    const pFlash = incident._demoFlash?.type === 'add_personnel' && Date.now() - (incident._demoFlash?.time || 0) < 3000;
                    const statusColor = p.status === 'In Structure' ? 'bg-red-600 text-white' : p.status === 'On Scene' ? 'bg-green-600 text-white' : 'bg-gray-500 text-white';
                    return (
                    <div key={p.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-all duration-500 ${pFlash ? 'bg-green-100 dark:bg-green-950/50 border border-green-300 dark:border-green-800' : 'bg-gray-50 dark:bg-gray-950 border border-transparent'}`}>
                      <p className="font-bold text-gray-900 dark:text-gray-100 flex-1 truncate">{p.name}</p>
                      <span className="text-gray-400 truncate max-w-[80px]">{p.assignment}</span>
                      <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${statusColor}`}>{p.status}</span>
                    </div>
                    );
                  })
                }
              </div>
            </SectionCard>

            <CommanderCam incident={incident} compact demoPhase={showDemoTimeline} />
          </div>
        </div>
      )}

      {/* Presenter callout overlay for guided demos */}
      <PresenterOverlay elapsedSecs={demoElapsed} enabled={showDemoTimeline} />

      {/* Normal (non-demo) layout */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${showDemoTimeline ? 'hidden' : ''}`}>

        {/* ── Apparatus ── */}
        <div ref={showDemoTimeline ? null : unitsRef}>
        <ScreenErrorBoundary label="Apparatus / Units">
        <SectionCard icon={Truck} iconColor="bg-blue-600" title="Apparatus / Units">
          <div className="space-y-2 mb-3">
            {incident.units.length === 0
              ? <p className="text-sm text-gray-400 text-center py-2">No units assigned</p>
              : incident.units.map((u, idx) => {
                // Bold, saturated colors for demo visibility
                const BOLD_COLORS = {
                  'Dispatched':{ bg: 'bg-gray-200 dark:bg-gray-700',    text: 'text-gray-700 dark:text-gray-300',   dot: 'bg-gray-500',   badge: 'bg-gray-600 text-white'   },
                  'En Route':  { bg: 'bg-blue-200 dark:bg-blue-900',    text: 'text-blue-800 dark:text-blue-300',   dot: 'bg-blue-600',   badge: 'bg-blue-600 text-white'   },
                  'On Scene':  { bg: 'bg-green-200 dark:bg-green-900',   text: 'text-green-800 dark:text-green-300',  dot: 'bg-green-600',  badge: 'bg-green-600 text-white'  },
                  'Staging':   { bg: 'bg-yellow-200 dark:bg-yellow-900',  text: 'text-yellow-800 dark:text-yellow-300', dot: 'bg-yellow-500', badge: 'bg-yellow-500 text-white' },
                  'Committed': { bg: 'bg-orange-200 dark:bg-orange-900',  text: 'text-orange-800 dark:text-orange-300', dot: 'bg-orange-600', badge: 'bg-orange-600 text-white' },
                  'Available': { bg: 'bg-gray-200 dark:bg-gray-700',    text: 'text-gray-600 dark:text-gray-300',   dot: 'bg-gray-400',   badge: 'bg-gray-500 text-white'   },
                  'Returning': { bg: 'bg-purple-200 dark:bg-purple-900',  text: 'text-purple-800 dark:text-purple-300', dot: 'bg-purple-600', badge: 'bg-purple-600 text-white' },
                };
                const colors = (showDemoTimeline ? BOLD_COLORS : UNIT_STATUS_COLORS)[u.status] || UNIT_STATUS_COLORS['Dispatched'];
                const justChanged = incident._demoFlash?.type === 'unit_status' && Date.now() - (incident._demoFlash?.time || 0) < 4000;
                return (
                <div key={u.id || idx}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 border-2 transition-all duration-700
                    ${colors.bg}
                    ${justChanged ? 'border-amber-400 shadow-xl shadow-amber-300/60 scale-[1.03] ring-2 ring-amber-300' : 'border-transparent'}`}
                  style={justChanged ? { animation: 'pulse 1s ease-in-out 3' } : {}}
                >
                  <div className={`w-4 h-4 rounded-full ${colors.dot} flex-shrink-0 ${justChanged ? 'animate-ping' : ''}`} />
                  <Truck size={18} className={`${colors.text} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-black text-gray-900 dark:text-gray-100">{u.designation}</p>
                    {u.officer && <p className="text-xs text-gray-500 dark:text-gray-400">Officer: {u.officer}</p>}
                  </div>
                  <span className={`text-sm font-black px-3 py-1.5 rounded-full shadow-sm ${colors.badge || colors.bg + ' ' + colors.text}`}>
                    {u.status}
                  </span>
                  {canEdit && !showDemoTimeline && (
                    <select
                      value={u.status}
                      onChange={e => updateUnitStatus(u.id, e.target.value)}
                      aria-label={`${u.designation} unit status`}
                      className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 dark:text-gray-100"
                    >
                      {UNIT_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  )}
                  {canEdit && !showDemoTimeline && (
                    <button onClick={() => removeUnit(u.id)} aria-label="Remove unit" className="text-gray-300 hover:text-red-500 ml-1">
                      <X size={14} />
                    </button>
                  )}
                </div>
                );
              })
            }
          </div>
          {canEdit && (
            <button onClick={() => setShowUnitModal(true)}
              className="flex items-center gap-1 text-xs text-red-700 dark:text-red-300 font-bold hover:underline">
              <Plus size={13} /> Add Unit
            </button>
          )}
        </SectionCard>
        </ScreenErrorBoundary>

        </div>
        {/* ── ICS Roles ── */}
        <SectionCard icon={ShieldAlert} iconColor="bg-red-700" title="ICS Role Assignments">
          <div className="space-y-2 mb-3">
            {(incident.roles || []).length === 0
              ? <p className="text-sm text-gray-400 text-center py-2">No roles assigned</p>
              : (incident.roles || []).map(r => {
                const roleFlash = incident._demoFlash?.type === 'command_established' && Date.now() - (incident._demoFlash?.time || 0) < 5000;
                return (
                <div key={r.id} className={`flex items-center gap-2 rounded-xl px-3 py-3 transition-all duration-700 ${roleFlash ? 'bg-red-100 dark:bg-red-950/50 border-2 border-red-400 shadow-lg shadow-red-200/50 scale-[1.02]' : 'bg-gray-50 dark:bg-gray-950 border-2 border-transparent'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${roleFlash ? 'bg-red-600 animate-pulse' : 'bg-red-100 dark:bg-red-950/50'}`}>
                    <ShieldAlert size={14} className={roleFlash ? 'text-white' : 'text-red-600 dark:text-red-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-red-600 dark:text-red-400 font-black uppercase tracking-wide">{r.role}</p>
                    <p className="text-base font-black text-gray-900 dark:text-gray-100">{r.assignee}</p>
                  </div>
                  {canEdit && (
                    <button onClick={() => removeRole(r.id)} aria-label="Remove role" className="text-gray-300 hover:text-red-500">
                      <X size={14} />
                    </button>
                  )}
                </div>
                );
              })
            }
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {canEdit && (
              <button onClick={() => setShowRoleModal(true)}
                className="flex items-center gap-1 text-xs text-red-700 dark:text-red-300 font-bold hover:underline">
                <Plus size={13} /> Assign Role
              </button>
            )}
            <button onClick={() => setShowOrgChart(v => !v)}
              className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300 font-bold hover:underline">
              <GitFork size={13} /> {showOrgChart ? 'Hide' : 'View'} Org Chart
            </button>
          </div>
          {showOrgChart && (
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
              <IcsOrgChart roles={incident.roles} />
            </div>
          )}
        </SectionCard>

        {/* ── Personnel Accountability ── */}
        <ScreenErrorBoundary label="Personnel Accountability">
        {/* PERSONNEL, GROUPED BY THE RIG THEY RODE IN ON.
            This is how the market renders it and how a passport system works:
            "Engine 1: Captain Jones, FF Smith, FF Baker." A flat list of names with
            no apparatus is not an accountability system — if you have to find
            someone, the first question is which rig they came in on.
            POV arrivals get their own LOUD block. */}
        <SectionCard icon={Users} iconColor="bg-green-600" title={`Personnel (${onScenePersonnel.length} on scene)`}>
          <div className="space-y-2 mb-3">
            {(incident.personnel || []).length === 0
              ? <p className="text-sm text-gray-400 text-center py-2">No personnel logged</p>
              : personnelByUnit.map(group => (
                <div key={group.key} className={group.pov
                  ? 'rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 p-2'
                  : ''}>
                  <div className="flex items-center gap-1.5 px-1 pb-1">
                    {group.pov
                      ? <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                      : <Truck size={13} className="text-gray-400 shrink-0" />}
                    <p className={`text-[11px] font-black uppercase tracking-wide ${
                      group.pov ? 'text-amber-800 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {group.label} · {group.people.length}
                    </p>
                  </div>
                  {group.pov && (
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 px-1 pb-1.5 font-semibold">
                      Arrived POV — no apparatus. Assign them a job or they are freelancing.
                    </p>
                  )}
                  <div className="space-y-2">
                  {group.people.map(p => {
                const parAge    = p.lastPar ? Math.floor((Date.now() - new Date(p.lastPar)) / 60000) : null;
                const parAlert  = parAge !== null && parAge > 30;
                return (
                  <div key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${parAlert ? 'bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900' : 'bg-gray-50 dark:bg-gray-950'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{p.name}</p>
                        {parAlert && <AlertTriangle size={12} className="text-red-500" />}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {p.assignment}
                        {/* "never PAR'd" is a real state and it is NOT the same as
                            "PAR 0m ago". Say which. */}
                        {parAge !== null ? ` · PAR ${parAge}m ago` : ' · no PAR yet'}
                      </p>
                    </div>
                    {canEdit ? (
                      <select
                        value={p.status}
                        onChange={e => updatePersonStatus(p.id, e.target.value)}
                        aria-label={`${p.name} personnel status`}
                        className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 dark:text-gray-100"
                      >
                        {PERSONNEL_STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">{p.status}</span>
                    )}
                    {canEdit && (
                      <button onClick={() => removePerson(p.id)} aria-label="Remove personnel" className="text-gray-300 hover:text-red-500 ml-1">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
                  })}
                  </div>
                </div>
              ))
            }
          </div>
          <div className="flex gap-3">
            {canEdit && (
              <button onClick={() => setShowPersonModal(true)}
                className="flex items-center gap-1 text-xs text-red-700 dark:text-red-300 font-bold hover:underline">
                <Plus size={13} /> Add Personnel
              </button>
            )}
            {canEdit && (
              <button onClick={() => setShowParModal(true)}
                data-testid="par-start"
                className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300 font-bold hover:underline">
                <UserCheck size={13} /> Run PAR
              </button>
            )}
          </div>
        </SectionCard>
        </ScreenErrorBoundary>

        {/* ── Rehab Tracking ── */}
        <SectionCard icon={Coffee} iconColor="bg-amber-600" title={`Rehab${inRehab.length > 0 ? ` (${inRehab.length} active)` : ''}`}>
          {inRehab.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wide mb-1.5">Currently In Rehab</p>
              <div className="space-y-2">
                {inRehab.map(r => {
                  const mins = Math.floor((Date.now() - new Date(r.enteredAt)) / 60000);
                  return (
                    <div key={r.id} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2">
                      <Coffee size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{r.name}</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">{mins}m in rehab · Cycle {r.cycle}</p>
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => exitRehab(r.id)}
                          className="text-xs bg-green-600 text-white px-2.5 py-1 rounded-lg font-bold hover:bg-green-700"
                        >
                          Release
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {pastRehab.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wide mb-1.5">Recent Rotations</p>
              <div className="space-y-1">
                {pastRehab.map(r => {
                  const dur = r.exitedAt ? Math.floor((new Date(r.exitedAt) - new Date(r.enteredAt)) / 60000) : null;
                  return (
                    <div key={r.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-1.5 text-xs">
                      <span className="flex-1 text-gray-700 dark:text-gray-300 font-semibold">{r.name}</span>
                      <span className="text-gray-400">Cycle {r.cycle}</span>
                      <span className="text-gray-400">{dur !== null ? `${dur}m` : '—'}</span>
                      <span className="text-gray-400">{timeStr(r.exitedAt)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {inRehab.length === 0 && pastRehab.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">No rehab rotations logged</p>
          )}
          {canEdit && (
            <button onClick={() => setShowRehabModal(true)}
              className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 font-bold hover:underline">
              <Plus size={13} /> Send to Rehab
            </button>
          )}
        </SectionCard>

        {/* ── Incident Notes (hidden during demo) ── */}
        {!showDemoTimeline && <SectionCard icon={ClipboardList} iconColor="bg-gray-600" title="Incident Notes">
          <DictateTextarea
            rows={7}
            placeholder="Size-up, actions taken, significant events…"
            value={incident.notes || ''}
            onChange={e => canEdit && setIncident(inc => ({ ...inc, notes: e.target.value }))}
            readOnly={!canEdit}
          />
        </SectionCard>}

        {/* ── Radio / Comms Log ── */}
        <div ref={commsRef}>
        <ScreenErrorBoundary label="Radio / Comms Log">
        <SectionCard icon={Radio} iconColor="bg-sky-700" title="Radio / Comms Log">
          <div className="space-y-2">
            {(incident.commsLog || []).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">No radio traffic logged</p>
            )}
            {(showAllComms ? (incident.commsLog || []) : (incident.commsLog || []).slice(0, 6)).map((entry, i) => {
              const isNew = i === 0 && incident._demoFlash?.type === 'comms' && Date.now() - (incident._demoFlash?.time || 0) < 4000;
              return (
              <div key={entry.id} className={`flex items-start gap-2 rounded-xl px-3 py-2 transition-all duration-700 ${isNew ? 'bg-sky-100 dark:bg-sky-950/50 border-2 border-sky-300 dark:border-sky-800 shadow-md' : 'bg-gray-50 dark:bg-gray-950 border-2 border-transparent'}`}>
                <div className="flex-shrink-0 mt-0.5">
                  {isNew ? <Radio size={13} className="text-sky-700 animate-pulse" /> : <MessageSquare size={13} className="text-sky-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold ${isNew ? 'text-sky-800 dark:text-sky-300' : 'text-sky-700 dark:text-sky-300'}`}>{entry.channel}</span>
                    {entry.from && <span className={`text-xs ${isNew ? 'text-sky-700 dark:text-sky-400 font-bold' : 'text-gray-500 dark:text-gray-400'}`}>· {entry.from}</span>}
                    <span className="text-xs text-gray-400 ml-auto">{new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  <p className={`text-sm mt-0.5 ${isNew ? 'text-sky-900 dark:text-sky-200 font-semibold' : 'text-gray-800 dark:text-gray-100'}`}>{entry.message}</p>
                </div>
              </div>
              );
            })}
            {(incident.commsLog || []).length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllComms(v => !v)}
                className="text-xs text-sky-700 dark:text-sky-400 font-bold hover:underline w-full text-center py-1"
              >
                {showAllComms ? 'Show less' : `Show all ${(incident.commsLog || []).length} entries`}
              </button>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowCommsModal(true)}
              className="mt-3 flex items-center gap-1 text-xs text-sky-700 dark:text-sky-300 font-bold hover:underline"
            >
              <Plus size={13} /> Log Radio Traffic
            </button>
          )}
        </SectionCard>
        </ScreenErrorBoundary>
        </div>

        {/* ── Incident Timeline ── */}
        <SectionCard icon={List} iconColor="bg-gray-700" title={`Incident Timeline (${allTimelineEvents.length})`} defaultOpen={false}>
          <div className="space-y-1.5 mb-3 max-h-80 overflow-y-auto pr-1">
            {allTimelineEvents.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">No events recorded yet</p>
            ) : (
              allTimelineEvents.map(evt => (
                <div key={evt.id} className="flex items-start gap-2 text-xs">
                  <span className="text-gray-400 font-mono shrink-0 w-14 pt-0.5 leading-tight">{timeStr(evt.time)}</span>
                  <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                    evt.type === 'activation' ? 'bg-red-700' :
                    evt.type === 'milestone'  ? 'bg-green-500' :
                    evt.type === 'par'        ? 'bg-blue-500' :
                    evt.type === 'par_alert'  ? 'bg-red-500' :
                    evt.type === 'rehab'      ? 'bg-amber-500' :
                    evt.type === 'unit'       ? 'bg-indigo-500' :
                    'bg-gray-400'
                  }`} />
                  <span className="text-gray-700 dark:text-gray-300 leading-tight flex-1">{evt.event}</span>
                  {!evt.auto && <span className="text-gray-300 text-[10px] shrink-0">manual</span>}
                </div>
              ))
            )}
          </div>
          {canEdit && (
            <button onClick={() => setShowTimelineModal(true)}
              className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 font-bold hover:underline">
              <Plus size={13} /> Add Event
            </button>
          )}
        </SectionCard>
      </div>

      {/* ── HazMat ICS Sections ── */}
      {isHazmat && (
        <>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-px flex-1 bg-orange-200 dark:bg-orange-900" />
            <span className="text-xs font-bold text-orange-700 dark:text-orange-300 uppercase tracking-widest">⚠ HazMat ICS Sections</span>
            <div className="h-px flex-1 bg-orange-200 dark:bg-orange-900" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              { key: 'operations', label: 'Operations', icon: Cog,       color: 'bg-red-600',    ph: 'Entry assignments, decon corridor, tactical objectives…' },
              { key: 'planning',   label: 'Planning',   icon: BookOpen,  color: 'bg-blue-600',   ph: 'SDS obtained, ERG guide, LEPC notification, action plan…' },
              { key: 'logistics',  label: 'Logistics',  icon: Package,   color: 'bg-green-600',  ph: 'Equipment deployed, PPE levels, supply needs, rehab…' },
              { key: 'finance',    label: 'Finance',    icon: DollarSign,color: 'bg-purple-600', ph: 'Resources consumed, contractor costs, reimbursements…' },
            ].map(({ key, label, icon: Icon, color, ph }) => (
              <SectionCard key={key} icon={Icon} iconColor={color} title={`${label} Section`} defaultOpen={false}>
                <DictateTextarea
                  rows={4}
                  placeholder={ph}
                  value={incident.icsNotes?.[key] || ''}
                  onChange={e => canEdit && setIcsNote(key, e.target.value)}
                  readOnly={!canEdit}
                />
              </SectionCard>
            ))}
          </div>
        </>
      )}

      {/* ── Add Unit Modal ── */}
      {showUnitModal && (
        <Modal title="Add Unit" onClose={() => setShowUnitModal(false)}>
          <AddUnitForm apparatus={liveApparatus} members={liveMembers} onSave={addUnit} onClose={() => setShowUnitModal(false)} />
        </Modal>
      )}

      {/* ── Add Personnel Modal ── */}
      {showPersonModal && (
        <Modal title="Add Personnel" onClose={() => setShowPersonModal(false)}>
          <AddPersonForm availableMembers={availableMembers} allMembers={liveMembers} units={incident.units || []} onSave={addPerson} onClose={() => setShowPersonModal(false)} />
        </Modal>
      )}

      {/* ── Assign Role Modal ── */}
      {showRoleModal && (
        <Modal title="Assign ICS Role" onClose={() => setShowRoleModal(false)}>
          <AddRoleForm members={liveMembers} onSave={addRole} onClose={() => setShowRoleModal(false)} />
        </Modal>
      )}

      {/* ── PAR Modal ──────────────────────────────────────────────────────────
          THE DEFAULT IS INVERTED (2026-07-14). It used to be
          `parChecks[p.id] !== false` — i.e. EVERY person rendered pre-checked and
          green, and an IC who opened this modal and hit "Submit PAR" without
          reading recorded a 100%-accounted-for PAR for the whole fireground
          without a single affirmative check.

          A personnel accountability report is the tool you reach for when you
          think you may have lost someone. Its default answer cannot be "everyone
          is fine." Accounting for a firefighter is now an AFFIRMATIVE ACT: nobody
          is accounted for until a human says they are, and the Submit button
          refuses to pretend otherwise. */}
      {showParModal && (() => {
        const accountedCount = onScenePersonnel.filter(p => parChecks[p.id] === true).length;
        const missingCount   = onScenePersonnel.length - accountedCount;
        return (
        <Modal title="Run PAR Check" onClose={() => { setShowParModal(false); setParChecks({}); }}>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            Account for each person — <strong>{onScenePersonnel.length}</strong> on scene.
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Nobody is accounted for until you check them in.
            </span>
          </p>
          <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 space-y-2 max-h-64 overflow-y-auto mb-3">
            {onScenePersonnel.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">No personnel on scene</p>
            ) : onScenePersonnel.map(p => {
              const checked = parChecks[p.id] === true; // DEFAULT = NOT accounted for
              return (
                <label key={p.id} className={`flex items-center gap-3 cursor-pointer rounded-lg px-2 py-1.5 transition-colors ${checked ? 'bg-green-50 dark:bg-green-950/50' : 'bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900'}`}>
                  <input
                    type="checkbox"
                    data-testid="par-account"
                    data-member={p.id}
                    checked={checked}
                    onChange={e => setParChecks(prev => ({ ...prev, [p.id]: e.target.checked }))}
                    className="w-4 h-4 accent-green-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{p.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{p.status} · {p.assignment}</p>
                  </div>
                  {!checked && <AlertTriangle size={14} className="text-red-500 shrink-0" />}
                </label>
              );
            })}
          </div>
          {missingCount > 0 && onScenePersonnel.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 mb-3 text-xs text-red-700 dark:text-red-300 font-bold">
              ⚠ {missingCount} of {onScenePersonnel.length} NOT accounted for
            </div>
          )}
          <div className="flex gap-2">
            <button
              data-testid="par-complete"
              onClick={() => {
                const checkedSet = new Set(
                  onScenePersonnel.filter(p => parChecks[p.id] === true).map(p => p.id)
                );
                runPar(checkedSet);
              }}
              className="flex-1 py-2.5 bg-red-700 text-white font-black rounded-xl hover:bg-red-800 text-sm"
            >
              Submit PAR{missingCount > 0 ? ` — ⚠ ${missingCount} MISSING` : ''}
            </button>
            {/* "All ✓" is retained — a fast all-clear is a real fireground need — but
                it is now an explicit, deliberate tap rather than the silent default. */}
            <button
              onClick={() => {
                const all = {};
                onScenePersonnel.forEach(p => { all[p.id] = true; });
                setParChecks(all);
              }}
              className="px-4 py-2.5 bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 font-bold rounded-xl text-sm hover:bg-green-200 dark:hover:bg-green-900"
            >
              All ✓
            </button>
          </div>
        </Modal>
        );
      })()}

      {/* ── Recall shortcut ── */}
      {showRecallBtn && (
        <Modal title="Issue Recall / All-Call" onClose={() => setShowRecallBtn(false)}>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            Go to the Recall System to issue a full recall notification to off-duty members.
            A push notification will be sent to everyone with the app installed.
          </p>
          <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 text-xs text-amber-800 dark:text-amber-300 mb-3">
            <strong>Incident on board:</strong> {incident?.type}{incident?.address ? ` @ ${incident.address}` : ''}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowRecallBtn(false)}
              className="flex-1 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              Stay Here
            </button>
            <button onClick={() => { setShowRecallBtn(false); onNavigate('recall'); }}
              className="flex-1 py-2 bg-red-700 text-white font-black rounded-xl hover:bg-red-800 text-sm text-center flex items-center justify-center gap-1">
              <Siren size={14} /> Open Recall System
            </button>
          </div>
        </Modal>
      )}

      {/* ── Log Radio Traffic ── */}
      {showCommsModal && (
        <Modal title="Log Radio Traffic" onClose={() => setShowCommsModal(false)}>
          <CommsEntryForm
            members={['IC', ...onScenePersonnel.map(p => p.name), 'Dispatch', 'Mutual Aid']}
            onSave={addCommsEntry}
            onClose={() => setShowCommsModal(false)}
          />
        </Modal>
      )}

      {/* ── Send to Rehab Modal ── */}
      {showRehabModal && (
        <Modal title="Send to Rehab" onClose={() => setShowRehabModal(false)}>
          <RehabEntryForm
            onScenePersonnel={onScenePersonnel}
            inRehab={inRehab}
            onSave={(name) => { addRehabEntry(name); setShowRehabModal(false); }}
            onClose={() => setShowRehabModal(false)}
          />
        </Modal>
      )}

      {/* ── Update Command Officer Modal ── */}
      {showCommandModal && (
        <Modal title={incident.commandAssumed ? 'Transfer Command' : 'Establish Command'} onClose={() => setShowCommandModal(false)}>
          <CommandUpdateForm
            members={liveMembers}
            currentIC={incident.ic}
            commandAssumed={incident.commandAssumed}
            onSave={updateCommandOfficer}
            onClose={() => setShowCommandModal(false)}
          />
        </Modal>
      )}

      {/* ── Manual Timeline Event Modal ── */}
      {showTimelineModal && (
        <Modal title="Add Timeline Event" onClose={() => setShowTimelineModal(false)}>
          <TimelineEntryForm
            onSave={(event) => { addTimelineEvent(event); setShowTimelineModal(false); }}
            onClose={() => setShowTimelineModal(false)}
          />
        </Modal>
      )}

      {/* ── Close Confirm ── */}
      {/* THE BOARD DOES NOT WRITE THE INCIDENT RECORD. Matt, 2026-07-26, re-affirmed
          2026-08-08: "the Command Board is just a separate tool, it is not meant to be
          the activation of this information, it only should reflect it."
          A "Save to Incident Log & Close" button used to live here. It minted the legal
          record out of board state and stamped incidents.time from milestones.dispatched
          — on a manual activation, the instant someone clicked Activate — which then
          became the NERIS `call_create`, i.e. the 911 call time, on a subpoenable record.
          The incident record is authored by an officer in the Incident Log; the call is
          associated to it by CAD run number (utils/callAssociation.js). Every NERIS time
          comes from the CAD integration. Do not rebuild a writer here. */}
      {confirmClose && (
        <Modal title="Close Incident" onClose={() => setConfirmClose(false)}>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            Closing ends this incident’s command view. The board is a live command
            tool — it does not write the incident record.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            File the incident in the Incident Log, where the officer authors the
            narrative and the call is matched by its CAD run number.
          </p>
          <div className="space-y-2">
            <button onClick={() => {
              api.delete('/api/active-board').catch(() => {});
              setIncident(null);
              setConfirmClose(false);
              demoTriggeredRef.current = false;
              demoTimersRef.current.forEach(t => clearTimeout(t));
              setDemoRunning(false);
            }}
              className="w-full py-2.5 bg-red-700 text-white font-black rounded-xl hover:bg-red-800 text-sm">
              Close Board
            </button>
            <button onClick={() => setConfirmClose(false)}
              className="w-full py-2 text-xs text-gray-400 hover:text-gray-600">
              Cancel — Stay on Board
            </button>
          </div>
        </Modal>
      )}
      </div>}

    </div>
  );
}

// ─── Add Unit Form ────────────────────────────────────────────────────────────

function AddUnitForm({ apparatus, members, onSave, onClose }) {
  const [designation, setDesignation] = useState(apparatus[0] ?? '');
  const [officer, setOfficer]         = useState(members[0] ?? '');
  const [status, setStatus]           = useState('Dispatched');
  return (
    <>
      <div>
        <label className={labelCls}>Apparatus</label>
        <select className={selectCls} value={designation} onChange={e => setDesignation(e.target.value)}>
          {apparatus.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Officer / Driver</label>
        <select className={selectCls} value={officer} onChange={e => setOfficer(e.target.value)}>
          {members.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Initial Status</label>
        <select className={selectCls} value={status} onChange={e => setStatus(e.target.value)}>
          {UNIT_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onClose}
          className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
          Cancel
        </button>
        <button onClick={() => onSave({ designation, officer, status })}
          className="flex-1 py-2.5 bg-red-700 text-white font-black rounded-xl hover:bg-red-800 text-sm">
          Add Unit
        </button>
      </div>
    </>
  );
}

// ─── Add Personnel Form ───────────────────────────────────────────────────────

// ── A PERSON RIDES A RIG. ────────────────────────────────────────────────────
// Firefighters do not materialise on a fireground. They arrive ON APPARATUS, IN A
// SEAT. The board used to model a person as { name, assignment, status } with NO
// link to a unit at all — so you could have "0 units on scene · 3 personnel on
// scene", which is not a thing. The header wasn't lying; the DATA MODEL allowed an
// incoherent state and the header faithfully reported it.
//
// Two facts were being collapsed into one field:
//   • WHICH RIG YOU CAME IN ON  → accountability. Who do I look for, and where?
//   • WHAT JOB YOU ARE DOING    → tactical. Entry Team A, Roof Group, RIC.
// `assignment` was only ever the second. Now we carry both.
//
// The ONE legitimate case of a firefighter with no apparatus is the VOLUNTEER WHO
// ARRIVES POV. That is real and it is the volunteer fireground's daily reality —
// but they are NOT "just on scene". They land in a LOUD UNASSIGNED POOL until
// Command gives them a job. Assigned to a rig, or in the pool. There is no third
// state, and freelancing must be impossible to hide.
const POV = '__POV__';

function AddPersonForm({ availableMembers, allMembers, units, onSave, onClose }) {
  const list = availableMembers.length > 0 ? availableMembers : (allMembers ?? MEMBERS);
  const [name, setName]           = useState(list[0] ?? '');
  const [unitId, setUnitId]       = useState(units?.[0]?.id ?? POV);
  const [assignment, setAssignment] = useState(ASSIGNMENTS[0]);
  const [status, setStatus]         = useState('On Scene');
  return (
    <>
      <div>
        <label className={labelCls}>Member</label>
        <select className={selectCls} value={name} onChange={e => setName(e.target.value)}>
          {list.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* RIDING ON — the accountability fact. Which rig did this firefighter arrive
          on? That is what tells you where to look for them. It is NOT the same as
          the tactical assignment below, and collapsing the two is how you end up
          with personnel on scene from units that aren't. */}
      <div>
        <label className={labelCls}>Riding on</label>
        <select className={selectCls} value={unitId} onChange={e => setUnitId(e.target.value === POV ? POV : Number(e.target.value))}>
          {(units ?? []).map(u => (
            <option key={u.id} value={u.id}>{u.designation}</option>
          ))}
          <option value={POV}>⚠ Arrived POV — no apparatus</option>
        </select>
        {unitId === POV && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 font-bold mt-1">
            Goes to the UNASSIGNED pool until Command gives them a job.
          </p>
        )}
        {(units ?? []).length === 0 && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 font-bold mt-1">
            No units on the board yet — add apparatus first, or log this member as POV.
          </p>
        )}
      </div>

      {/* TACTICAL ASSIGNMENT — the job. Separate fact, separate field. */}
      <div>
        <label className={labelCls}>Assignment (tactical)</label>
        <select className={selectCls} value={assignment} onChange={e => setAssignment(e.target.value)}>
          {ASSIGNMENTS.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Status</label>
        <select className={selectCls} value={status} onChange={e => setStatus(e.target.value)}>
          {PERSONNEL_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onClose}
          className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
          Cancel
        </button>
        <button
          onClick={() => onSave({
            name,
            unitId: unitId === POV ? null : unitId,
            pov: unitId === POV,
            // A POV arrival is UNASSIGNED until Command says otherwise. We do not
            // let the form's default quietly give them a job they were never given.
            assignment: unitId === POV ? 'Unassigned' : assignment,
            status,
          })}
          className="flex-1 py-2.5 bg-red-700 text-white font-black rounded-xl hover:bg-red-800 text-sm">
          Add
        </button>
      </div>
    </>
  );
}

// ─── Add Role Form ────────────────────────────────────────────────────────────

function AddRoleForm({ members, onSave, onClose }) {
  const [role, setRole]     = useState(ICS_ROLES[0]);
  const [assignee, setAssignee] = useState(members[0] ?? '');
  return (
    <>
      <div>
        <label className={labelCls}>ICS Role</label>
        <select className={selectCls} value={role} onChange={e => setRole(e.target.value)}>
          {ICS_ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Assigned To</label>
        <select className={selectCls} value={assignee} onChange={e => setAssignee(e.target.value)}>
          {members.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onClose}
          className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
          Cancel
        </button>
        <button onClick={() => onSave({ role, assignee })}
          className="flex-1 py-2.5 bg-red-700 text-white font-black rounded-xl hover:bg-red-800 text-sm">
          Assign
        </button>
      </div>
    </>
  );
}

// ─── Command Update Form ──────────────────────────────────────────────────────
// Entered by DISPATCH after hearing officer announce command on the radio

function CommandUpdateForm({ members, currentIC, commandAssumed, onSave, onClose }) {
  const [officer, setOfficer] = useState(currentIC || members[0] || '');
  const [note,    setNote]    = useState('');

  return (
    <>
      <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg px-3 py-2 text-xs text-blue-800 dark:text-blue-300 mb-3">
        <strong>Dispatcher Action</strong> — Enter the officer who announced command on the radio.
        {commandAssumed && <> This will log a command transfer from <strong>{currentIC}</strong>.</>}
      </div>
      <div>
        <label className={labelCls}>{commandAssumed ? 'New IC (Transfer To)' : 'Incident Commander'}</label>
        <select className={selectCls} value={officer} onChange={e => setOfficer(e.target.value)}>
          {members.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      {commandAssumed && (
        <div>
          <label className={labelCls}>Transfer Reason (optional)</label>
          <input
            type="text"
            className={inputCls}
            placeholder="e.g. Battalion Chief arrived and assumed command"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
        <button onClick={() => onSave(officer, note)} className="flex-1 py-2.5 bg-red-700 text-white font-black rounded-xl hover:bg-red-800 text-sm">
          {commandAssumed ? '⚡ Transfer Command' : '⚡ Establish Command'}
        </button>
      </div>
    </>
  );
}

// ─── ICS Org Chart ────────────────────────────────────────────────────────────

function IcsOrgChart({ roles }) {
  function findAssignee(roleName) {
    const r = roles.find(r => r.role === roleName);
    return r?.assignee || null;
  }

  function OrgBox({ role, color = 'bg-red-700', shortLabel }) {
    const assignee = findAssignee(role);
    const label = shortLabel || role
      .replace(' Section Chief', '')
      .replace(' Officer', '')
      .replace(' Group Supervisor', '')
      .replace(' Area Manager', '')
      .replace('Public Information', 'PIO')
      .replace('Finance / Admin', 'Finance');
    return (
      <div className={`rounded-lg px-2 py-1.5 text-center min-w-[90px] max-w-[110px] border ${assignee ? `${color} border-transparent` : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
        <p className={`text-[9px] font-bold uppercase tracking-wide leading-tight ${assignee ? 'text-white/80' : 'text-gray-400'}`}>{label}</p>
        {assignee
          ? <p className="text-xs font-black text-white mt-0.5 truncate">{assignee.split(' ').pop()}</p>
          : <p className="text-[10px] text-gray-400 mt-0.5 italic">Unassigned</p>
        }
      </div>
    );
  }

  function Connector() {
    return <div className="w-px h-3 bg-gray-300 mx-auto" />;
  }

  return (
    <div className="overflow-x-auto py-2">
      <div className="flex flex-col items-center gap-0 min-w-max mx-auto text-center">
        {/* IC */}
        <OrgBox role="Incident Commander" color="bg-red-700" shortLabel="Incident Commander" />
        {findAssignee('Deputy IC') && (
          <>
            <Connector />
            <OrgBox role="Deputy IC" color="bg-red-600" />
          </>
        )}
        <Connector />
        {/* Command Staff row */}
        <div className="flex items-start gap-2">
          <OrgBox role="Safety Officer" color="bg-orange-600" />
          <OrgBox role="Liaison Officer" color="bg-orange-600" />
          <OrgBox role="Public Information Officer" color="bg-orange-600" />
        </div>
        <Connector />
        {/* General Staff row */}
        <div className="flex items-start gap-2">
          <OrgBox role="Operations Section Chief" color="bg-blue-600" shortLabel="Operations" />
          <OrgBox role="Planning Section Chief" color="bg-green-600" shortLabel="Planning" />
          <OrgBox role="Logistics Section Chief" color="bg-purple-600" shortLabel="Logistics" />
          <OrgBox role="Finance / Admin Section Chief" color="bg-yellow-600" shortLabel="Finance" />
        </div>
        <Connector />
        {/* Subordinate roles */}
        <div className="flex items-start gap-2">
          <OrgBox role="Staging Area Manager" color="bg-blue-500" shortLabel="Staging" />
          <OrgBox role="RIC / RIT Leader" color="bg-blue-500" shortLabel="RIC/RIT" />
          <OrgBox role="EMS Group Supervisor" color="bg-blue-500" shortLabel="EMS Group" />
          <OrgBox role="Rehab Group Supervisor" color="bg-blue-500" shortLabel="Rehab" />
        </div>
      </div>
      <p className="text-[10px] text-gray-400 text-center mt-2">
        Assign roles above to populate boxes · Bold = assigned · Gray = unassigned
      </p>
    </div>
  );
}

// ─── Rehab Entry Form ─────────────────────────────────────────────────────────

function RehabEntryForm({ onScenePersonnel, inRehab, onSave, onClose }) {
  const inRehabNames = new Set(inRehab.map(r => r.name));
  const eligible = onScenePersonnel.filter(p => !inRehabNames.has(p.name));
  const [name, setName] = useState(eligible[0]?.name || '');

  if (eligible.length === 0) {
    return (
      <>
        <p className="text-sm text-gray-600 dark:text-gray-300">All on-scene personnel are already in rehab.</p>
        <button onClick={onClose} className="w-full py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Close</button>
      </>
    );
  }

  return (
    <>
      <div>
        <label className={labelCls}>Select Personnel</label>
        <select className={selectCls} value={name} onChange={e => setName(e.target.value)}>
          {eligible.map(p => <option key={p.id}>{p.name}</option>)}
        </select>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 rounded-lg px-3 py-2">
        Time will be logged automatically. Use "Release" in the Rehab section when the member returns to service.
      </p>
      <div className="flex gap-2 pt-1">
        <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
        <button onClick={() => onSave(name)} className="flex-1 py-2.5 bg-amber-600 text-white font-black rounded-xl hover:bg-amber-700 text-sm">
          <Coffee size={13} className="inline mr-1" />Send to Rehab
        </button>
      </div>
    </>
  );
}

// ─── Timeline Entry Form ──────────────────────────────────────────────────────

function TimelineEntryForm({ onSave, onClose }) {
  const [event, setEvent] = useState('');
  return (
    <>
      <div>
        <label className={labelCls}>Event Description</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={3}
          placeholder="e.g. Second alarm struck, Aerial 7 arrived on scene, Victim located on 2nd floor…"
          value={event}
          onChange={e => setEvent(e.target.value)}
          autoFocus
        />
      </div>
      <p className="text-xs text-gray-400">Current time will be recorded automatically.</p>
      <div className="flex gap-2 pt-1">
        <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
        <button
          onClick={() => { if (event.trim()) onSave(event.trim()); }}
          disabled={!event.trim()}
          className="flex-1 py-2.5 bg-gray-800 text-white font-black rounded-xl hover:bg-gray-900 text-sm disabled:opacity-40"
        >
          Add to Timeline
        </button>
      </div>
    </>
  );
}

// ─── Comms Entry Form ─────────────────────────────────────────────────────────
const COMMS_CHANNELS = ['Command', 'Attack', 'Rescue', 'Ventilation', 'EMS', 'Dispatch', 'Mutual Aid', 'Other'];

function CommsEntryForm({ members, onSave, onClose }) {
  const [channel, setChannel] = useState('Command');
  const [from,    setFrom]    = useState(members[0] ?? '');
  const [message, setMessage] = useState('');
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Channel</label>
          <select className={selectCls} value={channel} onChange={e => setChannel(e.target.value)}>
            {COMMS_CHANNELS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>From</label>
          <select className={selectCls} value={from} onChange={e => setFrom(e.target.value)}>
            {members.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Message / Traffic</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={3}
          placeholder="e.g. Attack 1 to Command — water on, fire knocked down"
          value={message}
          onChange={e => setMessage(e.target.value)}
          autoFocus
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => { if (message.trim()) onSave({ channel, from, message: message.trim() }); }}
          disabled={!message.trim()}
          className="flex-1 py-2.5 bg-sky-700 text-white font-black rounded-xl hover:bg-sky-800 text-sm disabled:opacity-40"
        >
          Log Entry
        </button>
      </div>
    </>
  );
}
