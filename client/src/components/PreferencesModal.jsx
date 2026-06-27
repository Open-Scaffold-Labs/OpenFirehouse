/**
 * PreferencesModal.jsx — Personalized view settings (Phase 6)
 *
 * Lets each user choose:
 *  1. Which Dashboard widgets are visible
 *  2. Which sidebar nav items are visible
 *
 * Preferences are saved to the backend (/api/user/preferences) and
 * mirrored in localStorage for instant apply without a page load.
 */

import { useState } from 'react';
import { X, LayoutDashboard, SidebarOpen, Save, RotateCcw, Loader2, Lock } from 'lucide-react';
import { api } from '../utils/api';

// ─── Widget & nav definitions ─────────────────────────────────────────────────

export const DASHBOARD_WIDGETS = [
  { id: 'stats',        label: 'Stats & Weather',   desc: 'Active members, apparatus, shifts, incidents, and weather at a glance' },
  { id: 'alerts',       label: 'Alerts Panel',       desc: 'Expired certifications, maintenance-due warnings, and system notices' },
  { id: 'shifts',       label: 'Upcoming Shifts',    desc: 'Next 7 days of scheduled shifts and staffing headcount' },
  { id: 'incidents',    label: 'Recent Incidents',   desc: 'Last 5 incidents from the incident log' },
  { id: 'training',     label: 'Training Snapshot',  desc: 'Certification expiry counts and total training hours' },
  { id: 'quickactions', label: 'Quick Actions',      desc: 'Shortcut buttons: Add Member, Log Incident, Log Training, and more' },
];

// nav items mirroring Layout.jsx NAV_GROUPS (id must match)
export const NAV_ITEMS_BY_GROUP = [
  {
    group: 'Personnel',
    items: [
      { id: 'roster',      label: 'Member Roster'    },
      { id: 'recruitment', label: 'Recruitment'      },
      { id: 'schedule',    label: 'Duty Schedule'    },
      { id: 'hours',       label: 'Volunteer Hours'  },
      { id: 'portal',      label: 'Member Portal'    },
      { id: 'training',    label: 'Training'         },
      { id: 'wellness',    label: 'Health & Wellness' },
    ],
  },
  {
    group: 'Apparatus',
    items: [
      { id: 'apparatus',   label: 'Apparatus Tracker' },
      { id: 'maintenance', label: 'Maintenance Log'   },
      { id: 'checklists',  label: 'Inspection Checks' },
      { id: 'scba',        label: 'SCBA / Air Mgmt'   },
    ],
  },
  {
    group: 'Operations',
    items: [
      { id: 'incidents',         label: 'Incident Log'       },
      { id: 'nfirs',             label: 'NFIRS / NERIS'      },
      { id: 'hydrants',          label: 'Hydrant Management' },
      { id: 'drills',            label: 'Drills & Courses'   },
      { id: 'stationlog',        label: 'Station Daily Log'  },
      { id: 'crr',               label: 'Community Risk'     },
      { id: 'preplans',          label: 'Pre-Incident Plans' },
      { id: 'cad',               label: 'CAD Integration'    },
      { id: 'fireinvestigation', label: 'Fire Investigation' },
      { id: 'hazmat',            label: 'Hazmat Reference (ERG)' },
      { id: 'recall',            label: 'Recall / All-Call'  },
      { id: 'inspections',       label: 'Fire Inspections'   },
      { id: 'mutualaid',         label: 'Mutual Aid'         },
      { id: 'calendar',          label: 'Event Calendar'     },
      { id: 'public',            label: 'Public Dashboard'   },
    ],
  },
  {
    group: 'Administration',
    items: [
      { id: 'sogs',       label: 'SOG Library'       },
      { id: 'budget',     label: 'Budget & Finance'  },
      { id: 'grants',     label: 'Grant Management'  },
      { id: 'payroll',    label: 'Payroll & Stipends' },
      { id: 'assets',     label: 'Asset & Inventory' },
      { id: 'dataimport', label: 'Data Import'       },
      { id: 'reports',    label: 'Reports & Export'  },
    ],
  },
  {
    group: 'Tools',
    items: [
      { id: 'ai', label: 'AI Scheduling' },
    ],
  },
];

// These nav items can never be hidden
const LOCKED_NAV = new Set(['dashboard', 'command', 'alerts', 'settings']);

// ─── Default preferences ──────────────────────────────────────────────────────

export const DEFAULT_PREFS = {
  nav:       { hidden: [] },
  dashboard: { hidden: [] },
};

// ─── localStorage helpers ─────────────────────────────────────────────────────

export function loadLocalPrefs(username) {
  try {
    const raw = localStorage.getItem(`of_prefs_v1_${username}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLocalPrefs(username, prefs) {
  try {
    localStorage.setItem(`of_prefs_v1_${username}`, JSON.stringify(prefs));
  } catch {}
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, locked, ariaLabel }) {
  return (
    <button
      type="button"
      disabled={locked}
      aria-label={ariaLabel}
      aria-pressed={checked}
      onClick={() => !locked && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        locked ? 'cursor-not-allowed opacity-40' :
        checked ? 'bg-red-600 cursor-pointer' : 'bg-gray-200 dark:bg-gray-700 cursor-pointer'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-900 shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-red-600 dark:text-red-400" />
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────

export default function PreferencesModal({ user, prefs, onSave, onClose }) {
  const [draft,   setDraft]   = useState(() => ({
    nav:       { hidden: [...(prefs?.nav?.hidden       ?? [])] },
    dashboard: { hidden: [...(prefs?.dashboard?.hidden ?? [])] },
  }));
  const [saving, setSaving]   = useState(false);
  const [tab,    setTab]      = useState('dashboard');

  function toggleNav(id) {
    const h = draft.nav.hidden;
    const next = h.includes(id) ? h.filter((x) => x !== id) : [...h, id];
    setDraft((d) => ({ ...d, nav: { hidden: next } }));
  }

  function toggleWidget(id) {
    const h = draft.dashboard.hidden;
    const next = h.includes(id) ? h.filter((x) => x !== id) : [...h, id];
    setDraft((d) => ({ ...d, dashboard: { hidden: next } }));
  }

  function handleReset() {
    setDraft({ nav: { hidden: [] }, dashboard: { hidden: [] } });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.put('/api/user/preferences', draft);
    } catch {
      // non-fatal — localStorage is the source of truth for instant apply
    } finally {
      setSaving(false);
    }
    saveLocalPrefs(user.username, draft);
    onSave(draft);
    onClose();
  }

  const navHiddenCount      = draft.nav.hidden.length;
  const dashHiddenCount     = draft.dashboard.hidden.length;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="bg-gray-900 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Customize My View</h2>
            <p className="text-xs text-gray-400 mt-0.5">Choose what you see when you log in. Saved per account.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 flex-shrink-0">
          {[
            { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard, count: dashHiddenCount },
            { id: 'nav',       label: 'Navigation', icon: SidebarOpen,     count: navHiddenCount  },
          ].map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors border-b-2 ${
                tab === id
                  ? 'border-red-600 text-red-700 dark:text-red-300 bg-white dark:bg-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon size={14} />
              {label}
              {count > 0 && (
                <span className="bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {count} hidden
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* ── Dashboard tab ── */}
          {tab === 'dashboard' && (
            <Section title="Dashboard Widgets" icon={LayoutDashboard}>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                Toggle which panels appear on your Dashboard home screen.
                The active incident banner always shows when a call is running.
              </p>
              <div className="space-y-2">
                {DASHBOARD_WIDGETS.map(({ id, label, desc }) => {
                  const visible = !draft.dashboard.hidden.includes(id);
                  return (
                    <div
                      key={id}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                        visible ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900' : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950'
                      }`}
                    >
                      <Toggle checked={visible} onChange={() => toggleWidget(id)} ariaLabel={`Toggle ${label} widget`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${visible ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400'}`}>{label}</p>
                        <p className="text-xs text-gray-400 mt-0.5 leading-snug">{desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* ── Navigation tab ── */}
          {tab === 'nav' && (
            <Section title="Sidebar Navigation" icon={SidebarOpen}>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                Hide modules you never use to keep the sidebar clean.
                Your role still controls which modules you can actually access.
              </p>

              {/* Locked items note */}
              <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-3 py-2.5 mb-4">
                <Lock size={12} className="text-blue-500 flex-shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Dashboard, Command Center, Notifications, and Settings are always visible and cannot be hidden.
                </p>
              </div>

              <div className="space-y-5">
                {NAV_ITEMS_BY_GROUP.map(({ group, items }) => (
                  <div key={group}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{group}</p>
                    <div className="space-y-1.5">
                      {items.map(({ id, label }) => {
                        const locked  = LOCKED_NAV.has(id);
                        const visible = locked || !draft.nav.hidden.includes(id);
                        return (
                          <div
                            key={id}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                              visible ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900' : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950'
                            }`}
                          >
                            <Toggle
                              checked={visible}
                              onChange={() => toggleNav(id)}
                              locked={locked}
                              ariaLabel={`Toggle ${label} navigation item`}
                            />
                            <span className={`text-sm font-medium flex-1 ${visible ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'}`}>
                              {label}
                            </span>
                            {locked && <Lock size={11} className="text-gray-300 dark:text-gray-600" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 flex items-center gap-3 flex-shrink-0 bg-white dark:bg-gray-900">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-red-600 transition-colors"
          >
            <RotateCcw size={13} /> Reset to defaults
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm font-bold rounded-xl hover:bg-red-800 transition-colors disabled:opacity-60 shadow-sm"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save & Apply
          </button>
        </div>
      </div>
    </>
  );
}
