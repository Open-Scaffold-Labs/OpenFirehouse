/**
 * CommandCenterWizard.jsx — Command Board Configuration (Wizard 3)
 *
 * Runs when an officer first opens Dispatch & Command.
 * Configures the incident command experience:
 *  1. Default ICS Roles
 *  2. Radio Channels
 *  3. Mutual Aid Quick-Add
 *  4. Box Alarm Templates
 *  5. Board Layout
 *  6. Done
 */

import { useState } from 'react';
import {
  Shield, Radio, Handshake, Truck, Settings, CheckCircle,
  ChevronRight, ChevronLeft, Plus, X, Zap, Star, Loader2,
} from 'lucide-react';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900';

const STEPS = [
  { id: 'ics', label: 'ICS Roles', icon: Shield, color: 'bg-red-600' },
  { id: 'radio', label: 'Radio', icon: Radio, color: 'bg-indigo-600' },
  { id: 'mutualaid', label: 'Mutual Aid', icon: Handshake, color: 'bg-cyan-600' },
  { id: 'boxalarm', label: 'Box Alarms', icon: Truck, color: 'bg-green-600' },
  { id: 'layout', label: 'Layout', icon: Settings, color: 'bg-purple-600' },
  { id: 'done', label: 'Done', icon: CheckCircle, color: 'bg-green-600' },
];

const DEFAULT_ICS_ROLES = [
  { name: 'Incident Commander', enabled: true },
  { name: 'Safety Officer', enabled: true },
  { name: 'Operations Section Chief', enabled: true },
  { name: 'Division Supervisor', enabled: true },
  { name: 'Attack Group', enabled: true },
  { name: 'Ventilation Group', enabled: true },
  { name: 'Water Supply', enabled: true },
  { name: 'Staging Manager', enabled: true },
  { name: 'RIC/RIT Officer', enabled: true },
  { name: 'Accountability Officer', enabled: true },
  { name: 'EMS Group', enabled: false },
  { name: 'Rehab Group Supervisor', enabled: false },
  { name: 'PIO (Public Information)', enabled: false },
  { name: 'Logistics Section Chief', enabled: false },
  { name: 'Planning Section Chief', enabled: false },
  { name: 'Law Enforcement Liaison', enabled: false },
];

const DEFAULT_CHANNELS = [
  { name: 'Dispatch', enabled: true },
  { name: 'Tac 1', enabled: true },
  { name: 'Tac 2', enabled: true },
  { name: 'Command', enabled: true },
  { name: 'Mutual Aid', enabled: true },
  { name: 'EMS', enabled: false },
  { name: 'Fire Ground', enabled: false },
];

const BOARD_PANELS = [
  { id: 'response-map', label: 'Response Map', desc: 'Live apparatus tracking on map', default: true },
  { id: 'ics-chart', label: 'ICS Org Chart', desc: 'Auto-building command structure', default: true },
  { id: 'units', label: 'Apparatus / Units', desc: 'Unit status cards with color coding', default: true },
  { id: 'personnel', label: 'Personnel Tracker', desc: 'On scene / in structure / rehab', default: true },
  { id: 'comms', label: 'Radio / Comms Log', desc: 'Rolling radio traffic log', default: true },
  { id: 'commander-cam', label: 'Commander Cam', desc: 'Live or simulated helmet video', default: true },
  { id: 'scene-photos', label: 'Scene Photos', desc: 'Photo uploads from the fireground', default: true },
  { id: 'resources', label: 'Resource Tracker', desc: 'Multi-agency resource management', default: false },
  { id: 'timeline', label: 'Incident Timeline', desc: 'Full chronological event log', default: false },
  { id: 'notes', label: 'Incident Notes', desc: 'Free-text situation notes', default: false },
];

export default function CommandCenterWizard({ onComplete, deptType }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [icsRoles, setIcsRoles] = useState(DEFAULT_ICS_ROLES);
  const [channels, setChannels] = useState(DEFAULT_CHANNELS);
  const [partners, setPartners] = useState([]);
  const [boxAlarms, setBoxAlarms] = useState([
    { type: 'Structure Fire', units: 'Engine 1, Truck 1, Battalion 1' },
    { type: 'Medical', units: 'Engine 1' },
    { type: 'MVA', units: 'Engine 1, Rescue 1' },
  ]);
  const [panels, setPanels] = useState(
    BOARD_PANELS.reduce((acc, p) => { acc[p.id] = p.default; return acc; }, {})
  );

  function toggleRole(i) {
    setIcsRoles(r => r.map((role, idx) => idx === i ? { ...role, enabled: !role.enabled } : role));
  }
  function toggleChannel(i) {
    setChannels(c => c.map((ch, idx) => idx === i ? { ...ch, enabled: !ch.enabled } : ch));
  }

  function handleComplete() {
    setSaving(true);
    // Save config to localStorage for now
    const config = {
      icsRoles: icsRoles.filter(r => r.enabled).map(r => r.name),
      channels: channels.filter(c => c.enabled).map(c => c.name),
      partners,
      boxAlarms,
      panels,
      setupDate: new Date().toISOString(),
    };
    localStorage.setItem('of_command_config', JSON.stringify(config));
    localStorage.setItem('of_command_setup_complete', 'true');
    setSaving(false);
    onComplete(config);
  }

  const isVolunteer = deptType === 'Volunteer' || deptType === 'volunteer';

  function renderStep() {
    switch (step) {
      case 0: return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Which ICS roles does your department typically use? Check the ones you fill on a working incident. You can always add roles during a live incident.</p>
          {isVolunteer && (
            <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 rounded-xl px-4 py-2 flex items-start gap-2">
              <Zap size={14} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-purple-700 dark:text-purple-300">For a volunteer department, most working incidents use: IC, Safety, Attack Group, Water Supply. The others are available but won't clutter your default view.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {icsRoles.map((r, i) => (
              <label key={r.name} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                r.enabled ? 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
              }`}>
                <input type="checkbox" checked={r.enabled} onChange={() => toggleRole(i)} className="rounded" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{r.name}</span>
              </label>
            ))}
          </div>
        </div>
      );

      case 1: return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Define your radio channels. These populate the channel dropdown in the comms log.</p>
          <div className="space-y-2">
            {channels.map((c, i) => (
              <label key={c.name} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                c.enabled ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-800' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
              }`}>
                <input type="checkbox" checked={c.enabled} onChange={() => toggleChannel(i)} className="rounded" />
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{c.name}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <input id="newChannel" className={INPUT} placeholder="Add custom channel..." aria-label="Add custom channel" />
            <button onClick={() => {
              const el = document.getElementById('newChannel');
              if (el.value.trim()) { setChannels(c => [...c, { name: el.value.trim(), enabled: true }]); el.value = ''; }
            }} aria-label="Add channel" className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg"><Plus size={12} /></button>
          </div>
        </div>
      );

      case 2: return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Which departments appear in Quick-Add on the Resource Tracker? These are your go-to mutual aid partners.</p>
          {partners.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No quick-add partners yet. Add your most common mutual aid departments, or skip.</p>}
          {partners.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" value={p} aria-label="Partner department name"
                onChange={e => setPartners(ps => ps.map((pp, idx) => idx === i ? e.target.value : pp))} placeholder="Department name" />
              <button onClick={() => setPartners(ps => ps.filter((_, idx) => idx !== i))} aria-label="Remove partner" className="text-gray-400 hover:text-red-500"><X size={14} /></button>
            </div>
          ))}
          <button onClick={() => setPartners(p => [...p, ''])} className="flex items-center gap-1.5 text-xs font-bold text-cyan-700 dark:text-cyan-300 hover:text-cyan-800">
            <Plus size={13} /> Add Partner
          </button>
        </div>
      );

      case 3: return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Set up standard responses. When a dispatch comes in for a structure fire, which units respond by default?</p>
          {boxAlarms.map((b, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
              <select className="w-40 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" value={b.type} aria-label="Incident type"
                onChange={e => setBoxAlarms(ba => ba.map((bb, idx) => idx === i ? { ...bb, type: e.target.value } : bb))}>
                <option value="">Select type...</option>
                <option>Structure Fire</option><option>Medical</option><option>MVA</option>
                <option>Hazmat</option><option>Fire Alarm</option><option>CO Alarm</option>
                <option>Water Rescue</option><option>Brush/Wildland</option><option>Vehicle Fire</option>
                <option>MCI</option><option>Technical Rescue</option><option>Mutual Aid</option>
              </select>
              <input className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" value={b.units} aria-label="Default responding units"
                onChange={e => setBoxAlarms(ba => ba.map((bb, idx) => idx === i ? { ...bb, units: e.target.value } : bb))} placeholder="Engine 1, Truck 1, BC1" />
              <button onClick={() => setBoxAlarms(ba => ba.filter((_, idx) => idx !== i))} aria-label="Remove response template" className="text-gray-400 hover:text-red-500"><X size={14} /></button>
            </div>
          ))}
          <button onClick={() => setBoxAlarms(ba => [...ba, { type: '', units: '' }])} className="flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-300 hover:text-green-800">
            <Plus size={13} /> Add Response Template
          </button>
        </div>
      );

      case 4: return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Choose which panels show on your Command Board. Drag to reorder (coming soon). Unchecked panels are hidden but available.</p>
          <div className="space-y-2">
            {BOARD_PANELS.map(p => (
              <label key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                panels[p.id] ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-300 dark:border-purple-800' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
              }`}>
                <input type="checkbox" checked={!!panels[p.id]}
                  onChange={e => setPanels(ps => ({ ...ps, [p.id]: e.target.checked }))} className="rounded" />
                <div>
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{p.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{p.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      );

      case 5: return (
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-950/50 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">Command Board Configured!</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Your Command Board is ready with {icsRoles.filter(r => r.enabled).length} ICS roles,
            {' '}{channels.filter(c => c.enabled).length} radio channels,
            {' '}{boxAlarms.length} box alarm templates, and
            {' '}{Object.values(panels).filter(Boolean).length} active panels.
          </p>
          <p className="text-xs text-gray-400">You can change any of these settings later in Station Settings.</p>
        </div>
      );

      default: return null;
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
      <div className="bg-gradient-to-r from-red-700 to-red-900 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 dark:bg-gray-900/20 rounded-xl flex items-center justify-center">
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black">Command Center Setup</h1>
            <p className="text-xs text-red-200">Step {step + 1} of {STEPS.length} — {STEPS[step].label}</p>
          </div>
          <button onClick={() => onComplete(null)} className="ml-auto text-red-200 hover:text-white text-xs font-bold">
            Skip Setup
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-6 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex-1 flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i < step ? 'bg-green-500 text-white' : i === step ? `${s.color} text-white` : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>{i < step ? '✓' : i + 1}</div>
            <span className={`text-[10px] font-bold hidden sm:block ${i === step ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl mx-auto w-full">
        {renderStep()}
      </div>

      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between">
        <button onClick={() => step > 0 && setStep(step - 1)} disabled={step === 0}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30">
          <ChevronLeft size={14} /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(step + 1)}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-red-700 hover:bg-red-800 text-white text-sm font-bold rounded-xl transition-all">
            Next <ChevronRight size={14} />
          </button>
        ) : (
          <button onClick={handleComplete} disabled={saving}
            className="flex items-center gap-1.5 px-8 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-all">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
            Launch Command Board
          </button>
        )}
      </div>
    </div>
  );
}
