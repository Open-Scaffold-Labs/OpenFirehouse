/**
 * OnboardingFlow.jsx — Role-adaptive onboarding wizard (Phase 2)
 *
 * Shows once per user (stored in localStorage keyed by username).
 * Step 1: Role selection
 * Step 2: Primary responsibilities (multi-select)
 * Step 3: Software comfort level
 * Step 4: Customized guided tour highlights
 *
 * Props:
 *   user     — current user object { username, role, ... }
 *   onDone   — called when user dismisses/completes onboarding
 *   onNavigate — called with page id to navigate to a page
 */

import { useState } from 'react';
import {
  ShieldCheck, Users, ClipboardList, Wrench, ChevronRight,
  ChevronLeft, CheckCircle2, X, Flame, Ambulance, BarChart3,
  Calendar, GraduationCap, FileText, AlertCircle, Zap,
} from 'lucide-react';

// ─── config ─────────────────────────────────────────────────────────────────

const ROLES = [
  {
    id: 'chief',
    label: 'Chief / Admin',
    desc: 'Department head, admin access, full system visibility',
    icon: ShieldCheck,
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900',
    activeBg: 'bg-red-600 border-red-600 text-white',
  },
  {
    id: 'officer',
    label: 'Company Officer',
    desc: 'Line officer, incident command, scheduling',
    icon: Users,
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900',
    activeBg: 'bg-amber-500 border-amber-500 text-white',
  },
  {
    id: 'member',
    label: 'Firefighter / EMT',
    desc: 'Line member, incident response, personal records',
    icon: Flame,
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900',
    activeBg: 'bg-blue-600 border-blue-600 text-white',
  },
  {
    id: 'admin',
    label: 'Admin / Treasurer',
    desc: 'Administrative staff, payroll, records management',
    icon: ClipboardList,
    color: 'text-indigo-700 dark:text-indigo-300',
    bg: 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-900',
    activeBg: 'bg-indigo-600 border-indigo-600 text-white',
  },
];

const RESPONSIBILITIES = {
  chief: [
    { id: 'incidents',  label: 'Incident Reporting & NFIRS', icon: Flame },
    { id: 'personnel',  label: 'Personnel Management',        icon: Users },
    { id: 'budget',     label: 'Budget & Finance',            icon: BarChart3 },
    { id: 'compliance', label: 'Compliance & Training',       icon: GraduationCap },
    { id: 'apparatus',  label: 'Apparatus & Equipment',       icon: Wrench },
    { id: 'reports',    label: 'Reports & Analytics',         icon: FileText },
  ],
  officer: [
    { id: 'incidents',  label: 'Incident Command',            icon: Flame },
    { id: 'schedule',   label: 'Shift Scheduling',            icon: Calendar },
    { id: 'training',   label: 'Training Management',         icon: GraduationCap },
    { id: 'apparatus',  label: 'Apparatus Check & Dispatch',  icon: Wrench },
    { id: 'preplans',   label: 'Pre-Incident Plans',          icon: ClipboardList },
    { id: 'mutualaid',  label: 'Mutual Aid',                  icon: Users },
  ],
  member: [
    { id: 'incidents',  label: 'Logging Incidents',           icon: Flame },
    { id: 'training',   label: 'My Training & Certifications',icon: GraduationCap },
    { id: 'schedule',   label: 'My Schedule & Availability',  icon: Calendar },
    { id: 'ems',        label: 'EMS / Medical Calls',         icon: Ambulance },
    { id: 'wellness',   label: 'Wellness Tracking',           icon: CheckCircle2 },
  ],
  admin: [
    { id: 'roster',     label: 'Member Records',              icon: Users },
    { id: 'losap',      label: 'LOSAP Tracking',              icon: GraduationCap },
    { id: 'payroll',    label: 'Payroll & Hours',             icon: BarChart3 },
    { id: 'reports',    label: 'State Reports & Exports',     icon: FileText },
    { id: 'events',     label: 'Events & Calendar',           icon: Calendar },
  ],
};

const COMFORT_LEVELS = [
  { id: 'beginner',  label: 'New to this',    desc: "I'll need a bit of guidance along the way" },
  { id: 'moderate',  label: 'Comfortable',    desc: 'I use web apps regularly, just need the basics' },
  { id: 'expert',    label: 'Power user',     desc: 'Show me the highlights and I\'ll explore the rest' },
];

// Role-specific guided tour highlights
const TOUR_HIGHLIGHTS = {
  chief: [
    { page: 'dashboard',  icon: BarChart3,     title: 'Dashboard',         desc: 'Your department at a glance — incidents, apparatus status, weather, and active alerts.' },
    { page: 'training',   icon: GraduationCap, title: 'Training & LOSAP',  desc: 'Track certifications, get 90/60/30-day renewal alerts, and monitor LOSAP compliance for every member.' },
    { page: 'incidents',  icon: Flame,         title: 'Incident Log',      desc: 'Log and manage incidents, generate NFIRS-ready reports, and track exposure data.' },
    { page: 'reports',    icon: FileText,      title: 'Reports & Export',  desc: 'One-click state reports, activity summaries, and CSV exports for any date range.' },
    { page: 'budget',     icon: BarChart3,     title: 'Budget Tracker',    desc: 'Track budget lines, expenditures, and grant spending across the fiscal year.' },
    { page: 'settings',   icon: ShieldCheck,   title: 'Station Settings',  desc: 'Configure department info, integrations, API keys, and notification preferences.' },
  ],
  officer: [
    { page: 'dashboard',  icon: BarChart3,     title: 'Dashboard',         desc: 'Apparatus status, recent incidents, duty roster, and real-time weather alerts.' },
    { page: 'incidents',  icon: Flame,         title: 'Incident Log',      desc: 'Log incidents from dispatch through closeout. Supports NFIRS coding and timeline tracking.' },
    { page: 'schedule',   icon: Calendar,      title: 'Duty Schedule',     desc: 'Manage shift assignments, on-call rosters, and member availability.' },
    { page: 'training',   icon: GraduationCap, title: 'Training',          desc: 'View cert status, LOSAP compliance, and on-demand modules for your crew.' },
    { page: 'apparatus',  icon: Wrench,        title: 'Apparatus',         desc: 'Live apparatus status board, inspection logs, and out-of-service tracking.' },
    { page: 'preplans',   icon: ClipboardList, title: 'Pre-Incident Plans', desc: 'Access floor plans, hazmat info, and site-specific SOGs for your district.' },
  ],
  member: [
    { page: 'dashboard',  icon: BarChart3,     title: 'Dashboard',         desc: 'Your department\'s live status, current weather, and any active alerts.' },
    { page: 'incidents',  icon: Flame,         title: 'Incident Log',      desc: 'Log your incident responses, exposure records, and call notes.' },
    { page: 'training',   icon: GraduationCap, title: 'Training',          desc: 'Your certifications, expiry dates, training hours, and on-demand modules.' },
    { page: 'portal',     icon: Users,         title: 'Member Portal',     desc: 'Your personal profile, contact info, and department communications.' },
    { page: 'schedule',   icon: Calendar,      title: 'Duty Schedule',     desc: 'View your assigned shifts and check department scheduling.' },
  ],
  admin: [
    { page: 'roster',     icon: Users,         title: 'Member Roster',     desc: 'Full member directory with contact info, certifications, and status.' },
    { page: 'training',   icon: GraduationCap, title: 'Compliance & LOSAP', desc: 'LOSAP hours tracking, cert compliance dashboard, and one-click state report export.' },
    { page: 'hours',      icon: Calendar,      title: 'Volunteer Hours',   desc: 'Log and review volunteer hours for LOSAP reporting and payroll.' },
    { page: 'reports',    icon: FileText,      title: 'Reports',           desc: 'Generate activity reports, export training data, and produce state-ready documents.' },
    { page: 'calendar',   icon: Calendar,      title: 'Event Calendar',    desc: 'Manage department events, training sessions, and community programs.' },
  ],
};

// ─── storage helpers ─────────────────────────────────────────────────────────

const STORAGE_KEY = 'of_onboarding_done';

export function hasCompletedOnboarding(username) {
  try {
    const done = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return !!done[username];
  } catch (_) {
    return false;
  }
}

export function markOnboardingDone(username) {
  try {
    const done = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    done[username] = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
  } catch (_) {}
}

// ─── component ───────────────────────────────────────────────────────────────

export default function OnboardingFlow({ user, onDone, onNavigate }) {
  const [step,          setStep]          = useState(1);
  const [selectedRole,  setSelectedRole]  = useState(user ? user.role : null);
  const [selectedResps, setSelectedResps] = useState([]);
  const [comfort,       setComfort]       = useState(null);

  const totalSteps = 4;

  function handleComplete() {
    if (user) markOnboardingDone(user.username);
    if (onDone) onDone();
  }

  function toggleResp(id) {
    setSelectedResps((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  }

  const highlights = TOUR_HIGHLIGHTS[selectedRole] || TOUR_HIGHLIGHTS.member;
  const respOptions = RESPONSIBILITIES[selectedRole] || RESPONSIBILITIES.member;
  const roleInfo    = ROLES.find((r) => r.id === selectedRole);

  // ── step 1: role selection ──
  function StepRole() {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center mx-auto mb-3">
            <Flame size={24} className="text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-bold">Welcome to <span className="text-gray-900 dark:text-gray-100">OPEN</span><span className="text-red-600 dark:text-red-400">FIREHOUSE</span></h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Let's get you set up in about 2 minutes. What's your role?</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROLES.map((role) => {
            const Icon    = role.icon;
            const isActive = selectedRole === role.id;
            return (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                  isActive ? role.activeBg : `bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800`
                }`}
              >
                <Icon size={20} className={isActive ? 'text-white mt-0.5' : role.color + ' mt-0.5'} />
                <div>
                  <p className={`font-semibold text-sm ${isActive ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`}>{role.label}</p>
                  <p className={`text-xs mt-0.5 ${isActive ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>{role.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── step 2: responsibilities ──
  function StepResponsibilities() {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center mx-auto mb-3">
            <ClipboardList size={24} className="text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">What do you handle day-to-day?</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Select everything that applies — we'll tailor your experience.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {respOptions.map(({ id, label, icon: Icon }) => {
            const isActive = selectedResps.includes(id);
            return (
              <button
                key={id}
                onClick={() => toggleResp(id)}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  isActive
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-white' : 'text-gray-400'} />
                <span className="text-sm font-medium">{label}</span>
                {isActive && <CheckCircle2 size={15} className="ml-auto text-white" />}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 text-center">Select as many as apply</p>
      </div>
    );
  }

  // ── step 3: comfort level ──
  function StepComfort() {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center mx-auto mb-3">
            <Zap size={24} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">How comfortable are you with web apps?</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">We'll calibrate how much guidance to show you.</p>
        </div>

        <div className="space-y-2">
          {COMFORT_LEVELS.map((level) => {
            const isActive = comfort === level.id;
            return (
              <button
                key={level.id}
                onClick={() => setComfort(level.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                  isActive
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                  isActive ? 'border-white bg-white dark:bg-gray-900' : 'border-gray-300 dark:border-gray-700'
                }`}>
                  {isActive && <div className="w-2 h-2 rounded-full bg-red-600" />}
                </div>
                <div>
                  <p className={`font-semibold text-sm ${isActive ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`}>{level.label}</p>
                  <p className={`text-xs mt-0.5 ${isActive ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>{level.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── step 4: tailored highlights tour ──
  function StepTour() {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">You're set up!</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Here are the key areas for a{' '}
            <span className="font-semibold text-gray-700 dark:text-gray-300">{roleInfo ? roleInfo.label : 'team member'}</span>.
            Click any to go there now.
          </p>
        </div>

        <div className="space-y-2">
          {highlights.map(({ page, icon: Icon, title, desc }) => (
            <button
              key={page}
              onClick={() => { handleComplete(); if (onNavigate) onNavigate(page); }}
              className="w-full flex items-start gap-4 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 text-left transition-all group"
            >
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-red-100 transition-colors shrink-0">
                <Icon size={16} className="text-gray-500 dark:text-gray-400 group-hover:text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800 dark:text-gray-100 group-hover:text-red-700">{title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
              </div>
              <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 group-hover:text-red-500 mt-1 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── navigation helpers ──
  const canNext = (
    (step === 1 && selectedRole) ||
    (step === 2 && selectedResps.length > 0) ||
    (step === 3 && comfort) ||
    step === 4
  );

  function handleNext() {
    if (step < totalSteps) setStep((s) => s + 1);
    else handleComplete();
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i < step ? 'bg-red-600 w-8' : 'bg-gray-200 dark:bg-gray-700 w-4'
                }`}
              />
            ))}
          </div>
          <button
            onClick={handleComplete}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Skip setup"
            aria-label="Skip setup"
          >
            <X size={16} />
          </button>
        </div>

        {/* content */}
        <div className="px-6 pt-4 pb-2" style={{ minHeight: 360 }}>
          {step === 1 && <StepRole />}
          {step === 2 && <StepResponsibilities />}
          {step === 3 && <StepComfort />}
          {step === 4 && <StepTour />}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          <div>
            {step > 1 && step < 4 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <ChevronLeft size={15} /> Back
              </button>
            )}
            {step === 1 && (
              <span className="text-xs text-gray-400">Step {step} of {totalSteps}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step < 4 && (
              <button
                onClick={handleComplete}
                className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Skip
              </button>
            )}
            {step < 4 ? (
              <button
                onClick={handleNext}
                disabled={!canNext}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                Next <ChevronRight size={15} />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                <CheckCircle2 size={15} /> Go to Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
