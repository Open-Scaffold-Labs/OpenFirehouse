/**
 * PersonalSetupWizard.jsx — First-login personal configuration (Wizard 2)
 *
 * Runs on first login per member. Personalizes the portal experience:
 *  1. Confirm Identity (pre-filled from roster)
 *  2. Assignment (station, apparatus, shift)
 *  3. Certifications (quick-add major certs)
 *  4. Notifications (what to be notified about)
 *  5. Portal Preferences (default landing page, theme)
 *
 * AI assists at each step with role-appropriate suggestions.
 */

import { useState, useEffect } from 'react';
import {
  User, Truck, Award, Bell, Settings, ChevronRight, ChevronLeft,
  CheckCircle, Loader2, Star, Zap, X, Clock,
} from 'lucide-react';
import { api } from '../utils/api';
import { RANKS, SHIFTS, APPARATUS_LIST } from '../data/members';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100';

const STEPS = [
  { id: 'identity', label: 'You', icon: User, color: 'bg-red-600' },
  { id: 'assignment', label: 'Assignment', icon: Truck, color: 'bg-blue-600' },
  { id: 'certs', label: 'Certifications', icon: Award, color: 'bg-green-600' },
  { id: 'notifications', label: 'Notifications', icon: Bell, color: 'bg-amber-600' },
  { id: 'portal', label: 'Preferences', icon: Settings, color: 'bg-purple-600' },
];

const COMMON_CERTS = [
  { name: 'Firefighter I', typical: ['member', 'officer', 'chief'] },
  { name: 'Firefighter II', typical: ['officer', 'chief'] },
  { name: 'EMT-Basic', typical: ['member', 'officer', 'chief'] },
  { name: 'EMT-Paramedic', typical: [] },
  { name: 'Hazmat Awareness', typical: ['member', 'officer', 'chief'] },
  { name: 'Hazmat Operations', typical: ['officer', 'chief'] },
  { name: 'Hazmat Technician', typical: [] },
  { name: 'CDL (Class B)', typical: ['officer'] },
  { name: 'ICS-100', typical: ['member', 'officer', 'chief'] },
  { name: 'ICS-200', typical: ['member', 'officer', 'chief'] },
  { name: 'ICS-300', typical: ['officer', 'chief'] },
  { name: 'ICS-400', typical: ['chief'] },
  { name: 'IS-700', typical: ['member', 'officer', 'chief'] },
  { name: 'IS-800', typical: ['officer', 'chief'] },
  { name: 'Water Rescue', typical: [] },
  { name: 'Technical Rescue', typical: [] },
  { name: 'Fire Inspector', typical: [] },
  { name: 'Fire Instructor I', typical: ['officer'] },
  { name: 'Fire Officer I', typical: ['officer', 'chief'] },
  { name: 'Fire Officer II', typical: ['chief'] },
];

const NOTIFICATION_OPTIONS = [
  { id: 'dispatch', label: 'Incident Dispatch', desc: 'Real-time alerts for new incidents', default: true },
  { id: 'training', label: 'Training Reminders', desc: 'Upcoming drills, classes, and deadlines', default: true },
  { id: 'certs', label: 'Certification Expirations', desc: '90/60/30-day warnings for your certs', default: true },
  { id: 'bulletins', label: 'Department Bulletins', desc: 'Announcements and memos', default: true },
  { id: 'schedule', label: 'Schedule Changes', desc: 'Shift swaps, vacancy fills, duty changes', default: true },
  { id: 'maintenance', label: 'Maintenance Alerts', desc: 'Apparatus and equipment issues', default: false },
  { id: 'meetings', label: 'Meeting Reminders', desc: 'Department and committee meetings', default: false },
];

const LANDING_PAGES = [
  { id: 'calendar', label: 'The Board', desc: 'Daily station view with crew, events, weather' },
  { id: 'dashboard', label: 'Dashboard', desc: 'Department-wide stats and AI briefing' },
  { id: 'portal', label: 'My Portal', desc: 'Your personal hub with tasks, training, hours' },
  { id: 'command', label: 'Dispatch & Command', desc: 'Live dispatch feed and command board' },
];

export default function PersonalSetupWizard({ user, onComplete }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [identity, setIdentity] = useState({
    name: user?.name || '', rank: '', phone: '', email: '',
  });

  const [assignment, setAssignment] = useState({
    station: 'Station 1', apparatus: '', shift: '', respondFromHome: false,
  });

  // "Awaiting chief verification" state (P4.4): an invited member is active and
  // can finish their profile, but their rank/access is member-level until a chief
  // verifies them. Driven by their own member record — never a broken/empty app.
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.get('/api/members/me').then((r) => {
      if (cancelled || !r?.data) return;
      setPending(r.data.rank_verified === false);
      if (r.data.rank) setIdentity((i) => ({ ...i, rank: i.rank || r.data.rank }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [certs, setCerts] = useState({});
  const [notifications, setNotifications] = useState(
    NOTIFICATION_OPTIONS.reduce((acc, n) => { acc[n.id] = n.default; return acc; }, {})
  );
  const [landingPage, setLandingPage] = useState('portal');

  // Suggest certs based on role
  const suggestedCerts = COMMON_CERTS.filter(c =>
    c.typical.includes(user?.role === 'chief' ? 'chief' : user?.role === 'officer' ? 'officer' : 'member')
  );

  function getAISuggestion() {
    const role = user?.role || 'member';
    if (step === 2) {
      return `Based on your role (${role}), you typically need: ${suggestedCerts.slice(0, 4).map(c => c.name).join(', ')}. Check the ones you have.`;
    }
    if (step === 4) {
      if (role === 'chief') return "As chief, I'd recommend the Dashboard as your landing page — it gives you the department-wide view.";
      if (role === 'officer') return "As an officer, the Command Board or The Board work well as your landing page.";
      return "My Portal is a great default — it shows your assignment, tasks, and training at a glance.";
    }
    return null;
  }

  async function handleComplete() {
    setSaving(true);
    try {
      // Save preferences
      await api.post('/api/user/preferences', {
        data: {
          defaultPage: landingPage,
          notifications,
          assignment,
          setupCompleted: true,
        },
      }).catch(() => {});

      onComplete();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  function renderStep() {
    switch (step) {
      case 0: return (
        <div className="space-y-4">
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl p-4 text-center mb-4">
            <p className="text-lg font-black text-red-800 dark:text-red-300">Welcome, {identity.name.split(' ')[0] || 'Firefighter'}!</p>
            <p className="text-sm text-red-600 dark:text-red-400">Let's set up your OpenFirehouse profile. This takes about 2 minutes.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Full Name</label>
              <input className={INPUT} value={identity.name} onChange={e => setIdentity(i => ({ ...i, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Rank</label>
              <select className={INPUT} value={identity.rank} onChange={e => setIdentity(i => ({ ...i, rank: e.target.value }))}>
                <option value="">Select rank...</option>
                {RANKS.map(rank => <option key={rank}>{rank}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Phone</label>
              <input type="tel" className={INPUT} value={identity.phone} onChange={e => setIdentity(i => ({ ...i, phone: e.target.value }))} placeholder="(555) 555-0100" />
            </div>
          </div>
        </div>
      );

      case 1: return (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Where are you assigned? Volunteers: check "I respond from home" if you don't have a fixed station assignment.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Station</label>
              <select className={INPUT} value={assignment.station} onChange={e => setAssignment(a => ({ ...a, station: e.target.value }))}>
                <option value="">Select station...</option>
                <option>Station 14</option><option>Station 15</option><option>Station 16</option>
                <option>Station 17</option><option>Station 18</option><option>HQ</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Apparatus</label>
              <select className={INPUT} value={assignment.apparatus} onChange={e => setAssignment(a => ({ ...a, apparatus: e.target.value }))}>
                <option value="">Select apparatus...</option>
                {APPARATUS_LIST.map(app => <option key={app}>{app}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Shift / Platoon</label>
              <select className={INPUT} value={assignment.shift} onChange={e => setAssignment(a => ({ ...a, shift: e.target.value }))}>
                <option value="">Select shift...</option>
                {SHIFTS.map(shift => <option key={shift}>{shift}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer bg-blue-50 dark:bg-blue-950/50 rounded-xl p-3 border border-blue-200 dark:border-blue-900">
            <input type="checkbox" checked={assignment.respondFromHome} onChange={e => setAssignment(a => ({ ...a, respondFromHome: e.target.checked }))} className="rounded" />
            <div>
              <span className="text-sm font-bold text-blue-800 dark:text-blue-300">I'm a volunteer and respond from home</span>
              <p className="text-xs text-blue-600 dark:text-blue-400">No fixed station assignment — I respond to the station when dispatched.</p>
            </div>
          </label>
        </div>
      );

      case 2: return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">Check the certifications you currently hold. You can add expiration dates later.</p>
          {getAISuggestion() && (
            <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 rounded-xl px-4 py-2 flex items-start gap-2">
              <Zap size={14} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-purple-700 dark:text-purple-300">{getAISuggestion()}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {COMMON_CERTS.map(cert => {
              const suggested = suggestedCerts.includes(cert);
              return (
                <label key={cert.name} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  certs[cert.name] ? 'bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-800' : suggested ? 'bg-amber-50/50 border-amber-200 dark:border-amber-900' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                }`}>
                  <input type="checkbox" checked={!!certs[cert.name]} onChange={e => setCerts(c => ({ ...c, [cert.name]: e.target.checked }))} className="rounded" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{cert.name}</span>
                  {suggested && !certs[cert.name] && <span className="text-[8px] text-amber-600 dark:text-amber-400 font-bold ml-auto">Suggested</span>}
                </label>
              );
            })}
          </div>
        </div>
      );

      case 3: return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">What do you want to be notified about? You can change these anytime in Settings.</p>
          {NOTIFICATION_OPTIONS.map(n => (
            <label key={n.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              notifications[n.id] ? 'bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-800' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
            }`}>
              <input type="checkbox" checked={!!notifications[n.id]}
                onChange={e => setNotifications(ns => ({ ...ns, [n.id]: e.target.checked }))} className="rounded" />
              <div>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{n.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{n.desc}</p>
              </div>
            </label>
          ))}
        </div>
      );

      case 4: return (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Choose what you see when you open OpenFirehouse.</p>
          {getAISuggestion() && (
            <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 rounded-xl px-4 py-2 flex items-start gap-2">
              <Zap size={14} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-purple-700 dark:text-purple-300">{getAISuggestion()}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {LANDING_PAGES.map(p => (
              <button key={p.id} onClick={() => setLandingPage(p.id)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  landingPage === p.id ? 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800 shadow-sm' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
                <p className={`text-sm font-bold ${landingPage === p.id ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>{p.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>
      );

      default: return null;
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
      <div className="bg-gradient-to-r from-red-700 to-red-900 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <User size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black">Welcome to OpenFirehouse</h1>
            <p className="text-xs text-red-200">Step {step + 1} of {STEPS.length} — {STEPS[step].label}</p>
          </div>
          <button onClick={onComplete} className="ml-auto text-red-200 hover:text-white text-xs font-bold">
            Skip Setup
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-6 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex-1 flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i < step ? 'bg-green-500 text-white' : i === step ? `${s.color} text-white` : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-[10px] font-bold hidden sm:block ${i === step ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl mx-auto w-full">
        {pending && (
          <div className="mb-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 flex items-start gap-2">
            <Clock size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Awaiting chief verification</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">Your account is active — finish setting up your profile below. A chief will verify your rank to unlock officer/command features; until then you have member-level access.</p>
            </div>
          </div>
        )}
        {renderStep()}
      </div>

      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between">
        <button onClick={() => step > 0 && setStep(step - 1)} disabled={step === 0}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30">
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
            Start Using OpenFirehouse
          </button>
        )}
      </div>
    </div>
  );
}
