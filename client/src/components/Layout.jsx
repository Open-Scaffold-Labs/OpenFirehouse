// Layout v2
import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard, Users, Truck, CalendarDays, Flame, Sparkles,
  GraduationCap, Handshake, Package, Download, Clock, IdCard,
  MapPinned, ClipboardCheck, Wrench, BookOpen, MonitorPlay, Banknote, HeartPulse,
  Bell, Shield, Settings, Menu, X, ChevronDown, ChevronRight, LogOut, HelpCircle, MessageSquarePlus,
  FileText, Droplets, BookMarked, NotebookPen, Landmark, HeartHandshake,
  Radio, Microscope, FolderInput, UserPlus, Wind, DollarSign, FlaskConical, Siren,
  RotateCcw, SlidersHorizontal, Megaphone, BarChart3, Users2, ToggleLeft, PiggyBank, Baby,
  UserCog, ShieldAlert, ArrowLeftRight, Scale,
  FileSpreadsheet, CircleOff,
  FileSearch, FolderOpen, Video, Award,
  ClipboardList, KeyRound, Receipt, Brain, Lightbulb, FileOutput, Map, UserCheck,
  Bot, Database, Phone, MessageSquare, Biohazard, Moon, Sun,
} from 'lucide-react';
import { canAccess, ROLES, isUnitSession } from '../data/auth';
import { toggleTheme } from '../utils/theme';
import { api } from '../utils/api';
import HelpPanel from './HelpPanel';
import PreferencesModal from './PreferencesModal';
import FeedbackWidget from './FeedbackWidget';
import VoiceAssistant from './VoiceAssistant';
import OfflineBanner from './OfflineBanner';
import PersonalAssistant from './PersonalAssistant';
import WhatsNew from './WhatsNew';


// ─── Navigation structure ────────────────────────────────────────────────────

const NAV_GROUPS = [
  // ── Staffing & Personnel ─────────────────────────────────────────────────
  {
    id: 'staffing',
    label: 'Staffing & Personnel',
    items: [
      { id: 'roster',             label: 'Member Roster',      icon: Users         },
      { id: 'recruitment',        label: 'Recruitment',        icon: UserPlus      },
      { id: 'schedule',           label: 'Duty Schedule',      icon: CalendarDays  },
      { id: 'daily-staffing',     label: 'Daily Staffing',     icon: Users         },
      { id: 'assignboard',        label: 'Assignment Board',   icon: Users2        },
      { id: 'hours',              label: 'Volunteer Hours',    icon: Clock         },
      { id: 'portal',             label: 'Member Portal',      icon: IdCard        },
      { id: 'cadets',             label: 'Cadet Program',      icon: Baby          },
      { id: 'retention',          label: 'Retention Scoring',  icon: BarChart3     },
      { id: 'personnel-actions',  label: 'Personnel Actions',  icon: UserCog       },
      { id: 'vacancy-fill',       label: 'Auto Vacancy Fill', icon: UserCheck      },
    ],
  },
  // ── Training & Readiness ─────────────────────────────────────────────────
  {
    id: 'training',
    label: 'Training & Readiness',
    items: [
      { id: 'training',            label: 'Training Management', icon: GraduationCap },
      { id: 'training-modules',    label: 'On-Demand Modules',   icon: MonitorPlay   },
      { id: 'training-catalog',    label: 'Video Courses & CEU', icon: Video         },
      { id: 'my-training',         label: 'My Training',         icon: Award         },
      { id: 'training-compliance', label: 'Training Compliance', icon: Shield        },
      { id: 'training-plans',      label: 'Training Plans',      icon: BookOpen      },
      { id: 'drills',              label: 'Drills & Courses',    icon: BookMarked    },
      { id: 'qualifications',     label: 'Qualifications',     icon: GraduationCap },
      { id: 'wellness',           label: 'Health & Wellness',  icon: HeartPulse    },
      { id: 'exposure-tracking',  label: 'Exposure & Safety',  icon: ShieldAlert   },
      { id: 'fto-tracker',       label: 'FTO Tracker',        icon: GraduationCap },
    ],
  },
  // ── Apparatus & Equipment ────────────────────────────────────────────────
  {
    id: 'apparatus',
    label: 'Apparatus & Equipment',
    items: [
      { id: 'apparatus',           label: 'Apparatus Tracker',   icon: Truck          },
      { id: 'maintenance',         label: 'Maintenance Log',     icon: Wrench         },
      { id: 'checklists',          label: 'Inspection Checks',   icon: ClipboardCheck },
      { id: 'apparatus-oos',       label: 'Out of Service',      icon: CircleOff      },
      { id: 'scba',                label: 'SCBA / Air Mgmt',     icon: Wind           },
      { id: 'equipment-checkout',  label: 'Equipment Checkout',  icon: KeyRound       },
      { id: 'knox-keys',           label: 'Knox Key Mgmt',      icon: KeyRound       },
    ],
  },
  // ── Incident Operations ──────────────────────────────────────────────────
  {
    id: 'incidents',
    label: 'Incident Operations',
    items: [
      { id: 'incidents',          label: 'Incident Log',        icon: Flame        },
      { id: 'incident-map',      label: 'Incident Map',        icon: MapPinned    },
      { id: 'commander-cam',     label: 'Commander Cam',       icon: MonitorPlay  },
      { id: 'radio-log',         label: 'Radio Feed',          icon: Radio        },
      { id: 'nfirs',              label: 'NFIRS / NERIS',       icon: FileText     },
      { id: 'ng911',              label: 'NG911 Console',       icon: Phone         },
      { id: 'cad',                label: 'CAD Integration',     icon: Siren        },
      { id: 'avl',                label: 'Vehicle AVL',         icon: Truck        },
      { id: 'fireinvestigation',  label: 'Fire Investigation',  icon: Microscope   },
      { id: 'mutualaid',          label: 'Mutual Aid',          icon: Handshake    },
      { id: 'aid-agreements',     label: 'Aid Agreements',      icon: Handshake    },
      { id: 'after-action',       label: 'After Action',        icon: FileSearch   },
      { id: 'incident-costs',     label: 'Incident Costs',      icon: Receipt      },
    ],
  },
  // ── Hazmat Operations ────────────────────────────────────────────────────
  {
    id: 'hazmat-ops',
    label: 'Hazmat Operations',
    items: [
      { id: 'hazmat',             label: 'Hazmat Reference (ERG)', icon: Biohazard },
    ],
  },
  // ── Inspections & Pre-Plans ───────────────────────────────────────────────
  {
    id: 'inspections-group',
    label: 'Inspections & Pre-Plans',
    items: [
      { id: 'inspections',           label: 'Fire Inspections',      icon: Shield         },
      { id: 'inspection-search',     label: 'Inspection Search',     icon: FileSearch     },
      { id: 'inspection-entry',      label: 'Inspection Entry',      icon: ClipboardCheck },
      { id: 'inspection-checklist',  label: 'Inspection Checklist',  icon: ClipboardList  },
      { id: 'inspector-status',      label: 'Inspector Status',      icon: UserCheck      },
      { id: 'violations',            label: 'Violations & Codes',    icon: ShieldAlert    },
      { id: 'permits',               label: 'Permits & Fees',        icon: Receipt        },
      { id: 'registration-search',    label: 'Registration Search',   icon: FileSearch     },
      { id: 'registration-entry',     label: 'Registration Entry',    icon: FileText       },
      { id: 'complaints',            label: 'Requests & Complaints', icon: MessageSquare  },
      { id: 'preplans',              label: 'Pre-Incident Plans',    icon: MapPinned      },
      { id: 'preplan-wizard',        label: 'Pre-Plan Setup Wizard', icon: Map            },
    ],
  },
  // ── Prevention & Community ───────────────────────────────────────────────
  {
    id: 'prevention',
    label: 'Prevention & Community',
    items: [
      { id: 'hydrants',             label: 'Hydrant Management',    icon: Droplets       },
      { id: 'community-outreach',   label: 'Community Outreach',    icon: HeartPulse     },
      { id: 'crr',                  label: 'Community Risk',        icon: HeartHandshake },
      { id: 'public',               label: 'Public Dashboard',      icon: MonitorPlay    },
    ],
  },
  // ── Finance & Compliance ─────────────────────────────────────────────────
  {
    id: 'finance',
    label: 'Finance & Compliance',
    items: [
      { id: 'budget',            label: 'Budget & Finance',     icon: Banknote        },
      { id: 'grants',            label: 'Grant Management',     icon: Landmark        },
      { id: 'fundraising',       label: 'Fundraising',          icon: PiggyBank       },
      { id: 'payroll',           label: 'Payroll & Stipends',   icon: DollarSign      },
      { id: 'timesheets',        label: 'Timesheets',           icon: FileSpreadsheet },
      { id: 'flsa',              label: 'FLSA Overtime',        icon: Clock           },
      { id: 'ot-equalization',   label: 'OT Equalization',      icon: Scale           },
      { id: 'iso',               label: 'ISO Grading Report',   icon: ClipboardCheck  },
    ],
  },
  // ── Activity Entry ───────────────────────────────────────────────────────
  {
    id: 'activity-entry',
    label: 'Activity Entry',
    items: [
      { id: 'activity-general',   label: 'General Journal',    icon: FileText       },
      { id: 'activity-station',   label: 'Station Journal',    icon: Shield         },
      { id: 'activity-unit',      label: 'Unit Journal',       icon: Truck          },
      { id: 'activity-equipment', label: 'Equipment Checks',   icon: ClipboardCheck },
      { id: 'activity-training',  label: 'Training Entry',     icon: GraduationCap  },
      { id: 'stationlog',         label: 'Station Daily Log',  icon: NotebookPen    },
    ],
  },
  // ── Department Admin ─────────────────────────────────────────────────────
  {
    id: 'admin',
    label: 'Department Admin',
    items: [
      { id: 'sogs',             label: 'SOG Library',       icon: BookOpen      },
      { id: 'policy-acks',      label: 'Policy Sign-offs',  icon: ShieldAlert   },
      { id: 'meeting-minutes',  label: 'Meeting Minutes',   icon: ClipboardList },
      { id: 'doc-vault',        label: 'Document Vault',    icon: FolderOpen    },
      { id: 'grievances',       label: 'Grievance Tracker', icon: Scale         },
      { id: 'shift-trades',     label: 'Shift Trades',      icon: ArrowLeftRight },
      { id: 'bulletins',        label: 'Bulletin Board',    icon: Megaphone     },
    ],
  },
  // ── Tools & Data ─────────────────────────────────────────────────────────
  {
    id: 'tools',
    label: 'Tools & Data',
    items: [
      { id: 'analytics',   label: 'AI Response Analytics',  icon: BarChart3   },
      { id: 'ai',          label: 'AI Scheduling',            icon: Sparkles    },
      { id: 'dataimport',  label: 'Data Import',              icon: FolderInput },
      { id: 'data-ingest', label: 'AI Data Ingestion',        icon: Brain       },
      { id: 'reports',     label: 'Reports & Export',         icon: Download    },
      { id: 'assets',      label: 'Asset & Inventory',        icon: Package     },
      { id: 'workflows',          label: 'AI Workflow Orchestration', icon: Brain     },
      { id: 'incident-intel',    label: 'AI Incident Intelligence', icon: Brain      },
      { id: 'training-ai',       label: 'AI Training Recommender', icon: Lightbulb  },
      { id: 'report-writer',     label: 'AI Report Writer',        icon: FileOutput },
      { id: 'preplan-ai',        label: 'AI Pre-Plan Generator',   icon: Map        },
      { id: 'staffing-ai',       label: 'AI Staffing Predictor',   icon: UserCheck  },
      { id: 'db-admin',           label: 'Database Admin',          icon: Database   },
    ],
  },
];

const ALL_ITEMS = [
  { id: 'dashboard',     label: 'Dashboard'                },
  { id: 'command',       label: 'Incident Command Center'  },
  { id: 'recall',        label: 'Recall / All-Call'        },
  { id: 'alerts',        label: 'Notifications & Alerts'   },
  { id: 'settings',      label: 'Station Settings'         },
  { id: 'availability',  label: 'Availability'             },
  ...NAV_GROUPS.flatMap((g) => g.items),
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findGroupForPage(pageId) {
  return NAV_GROUPS.find((g) => g.items.some((i) => i.id === pageId))?.id ?? null;
}

function buildInitialOpen(activePage) {
  const state = {};
  NAV_GROUPS.forEach((g) => { state[g.id] = false; });
  // Auto-open the group containing the active page
  const activeGroup = findGroupForPage(activePage);
  if (activeGroup) state[activeGroup] = true;
  return state;
}

// ─── Nav Item ─────────────────────────────────────────────────────────────────

function NavItem({ id, label, icon: Icon, active, onClick, badge }) {
  return (
    <button
      data-nav-id={id}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
        active
          ? 'bg-red-700 text-white'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {badge}
    </button>
  );
}

// ─── Collapsible Group ────────────────────────────────────────────────────────

function NavGroup({ group, activePage, open, onToggle, onNavigate, setSidebarOpen, user }) {
  // Filter items the current user can access
  const visibleItems = group.items.filter((item) => canAccess(user, item.id));
  if (visibleItems.length === 0) return null;

  const hasActive = visibleItems.some((i) => i.id === activePage);

  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors group
          ${hasActive ? 'text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
      >
        <span className="flex-1 text-xs font-bold uppercase tracking-wider">{group.label}</span>
        {open
          ? <ChevronDown size={13} className="flex-shrink-0 opacity-60" />
          : <ChevronRight size={13} className="flex-shrink-0 opacity-60" />}
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5 ml-1">
          {visibleItems.map(({ id, label, icon }) => (
            <NavItem
              key={id}
              id={id}
              label={label}
              icon={icon}
              active={activePage === id}
              onClick={() => { onNavigate(id); setSidebarOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── User Menu Dropdown ───────────────────────────────────────────────────────

const ONBOARDING_KEY = 'of_onboarding_done';
function clearOnboardingForUser(username) {
  try {
    const s = JSON.parse(localStorage.getItem(ONBOARDING_KEY) || '{}');
    delete s[username];
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(s));
  } catch (_) {}
}
function clearAllOnboarding() {
  try { localStorage.removeItem(ONBOARDING_KEY); } catch (_) {}
}

function UserMenu({ user, roleInfo, onLogout, onCustomize }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors"
        title="Account menu"
      >
        <div className={`h-6 w-6 rounded-md text-[10px] font-black flex items-center justify-center flex-shrink-0 ${roleInfo.bg} ${roleInfo.color}`}>
          {user.initials}
        </div>
        <div className="hidden sm:block leading-none text-left">
          <p className="text-xs font-semibold text-white">{user.name}</p>
          <p className="text-[10px] text-red-300">{roleInfo.label}</p>
        </div>
        <ChevronDown size={12} className={`text-red-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50">
          {/* user header */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{user.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{roleInfo.label} · @{user.username}</p>
          </div>

          {/* customize view */}
          <button
            onClick={() => { setOpen(false); onCustomize?.(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
          >
            <SlidersHorizontal size={15} className="text-gray-400" />
            Customize My View
          </button>

          {/* Setup-wizard controls are meaningless for a unit (rig terminal)
              session — it has no personal profile to set up. Hide for units. */}
          {!isUnitSession(user) && (
            <>
              <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />

              {/* reset this user's onboarding */}
              <button
                onClick={() => {
                  clearOnboardingForUser(user.username);
                  setOpen(false);
                  window.location.reload();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <RotateCcw size={15} className="text-gray-400" />
                Re-run setup wizard
              </button>

              {/* reset ALL onboarding */}
              <button
                onClick={() => {
                  clearAllOnboarding();
                  setOpen(false);
                  window.location.reload();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <RotateCcw size={15} className="text-gray-400" />
                Reset all accounts' setup
              </button>
            </>
          )}

          <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />

          {/* sign out */}
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors text-left font-medium"
          >
            <LogOut size={15} className="text-red-500" />
            Sign out &amp; switch account
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function Layout({ children, activePage, onNavigate, settings, alertCount = 0, user, onLogout, userPrefs, onPrefsChange, unreadMessageCount = 0, stations = [], selectedStation = null, onStationChange }) {
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [groupOpen,      setGroupOpen]      = useState(() => buildInitialOpen(activePage));
  const [helpOpen,       setHelpOpen]       = useState(false);
  const [feedbackOpen,   setFeedbackOpen]   = useState(false);
  const [prefsOpen,      setPrefsOpen]      = useState(false);
  const [assistantOpen,  setAssistantOpen]  = useState(false);
  const [stationPickerOpen, setStationPickerOpen] = useState(false);

  const [whatsNewOpen,   setWhatsNewOpen]   = useState(false);
  const [assistantCount, setAssistantCount] = useState(0);
  const mainRef = useRef(null);
  const navRef = useRef(null);
  const assistantPollRef = useRef(null);
  const stationPickerRef = useRef(null);

  // Auto-open the group for the active page and scroll it into view
  useEffect(() => {
    const groupId = findGroupForPage(activePage);
    if (groupId) {
      setGroupOpen((prev) => ({ ...prev, [groupId]: true }));
      // Scroll the active nav item into view after a tick
      requestAnimationFrame(() => {
        const el = navRef.current?.querySelector(`[data-nav-id="${activePage}"]`);
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }, [activePage]);

  // Close station picker on outside click
  useEffect(() => {
    if (!stationPickerOpen) return;
    function handler(e) { if (stationPickerRef.current && !stationPickerRef.current.contains(e.target)) setStationPickerOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [stationPickerOpen]);

  // Fetch assistant alert count on mount and poll every 60 seconds
  useEffect(() => {
    if (!user?.id) return;

    async function fetchAssistantCount() {
      try {
        const data = await api.get(`/api/assistant/alerts/count?member_id=${user.id}`);
        setAssistantCount(data.count || 0);
      } catch (err) {
        console.error('Failed to fetch assistant count:', err);
      }
    }

    fetchAssistantCount();

    assistantPollRef.current = setInterval(() => {
      fetchAssistantCount();
    }, 60000);

    return () => {
      if (assistantPollRef.current) clearInterval(assistantPollRef.current);
    };
  }, [user?.id]);

  // Build filtered nav groups based on user preferences
  const hiddenNav = userPrefs?.nav?.hidden ?? [];
  const filteredNavGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !hiddenNav.includes(item.id)),
  })).filter((g) => g.items.length > 0);

  // Scroll to top whenever the active page changes.
  // Double-RAF ensures scroll runs after child components have mounted,
  // focused inputs, or triggered any scrollIntoView calls.
  useEffect(() => {
    let frame1, frame2;
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        if (mainRef.current) {
          mainRef.current.scrollTop = 0;
        }
      });
    });
    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
    };
  }, [activePage]);

  const stationName    = settings?.stationName    || 'Station 14';
  const departmentName = settings?.departmentName || 'Maplewood VFD';

  const pageLabel = ALL_ITEMS.find((n) => n.id === activePage)?.label ?? 'Dashboard';
  const roleInfo  = user ? (ROLES[user.role] ?? {}) : {};

  function toggleGroup(id) {
    setGroupOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleNavigate(id) {
    const groupId = findGroupForPage(id);
    if (groupId && !groupOpen[groupId]) {
      setGroupOpen((prev) => ({ ...prev, [groupId]: true }));
    }
    onNavigate(id);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="bg-red-700 shadow-lg z-40 flex-shrink-0 relative">
        <div className="flex h-16 items-center gap-4 px-4 sm:px-6">

          <button className="sm:hidden text-red-200 hover:text-white"
            onClick={() => setSidebarOpen((o) => !o)} aria-label="Toggle menu">
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 leading-none">
                <p className="text-xs font-bold"><span className="text-white">OPEN</span><span className="text-red-300">FIREHOUSE</span></p>
                <button onClick={() => setWhatsNewOpen(true)} className="text-[10px] font-bold text-red-900 bg-red-200 hover:bg-white px-1.5 py-0.5 rounded-full leading-none transition-colors cursor-pointer" title="What's New — click for release notes">
                  v{__APP_VERSION__}
                </button>
              </div>
              <h1 className="text-base font-bold text-white leading-tight">{pageLabel}</h1>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {/* Messages button */}
            <button
              onClick={() => { handleNavigate('messages'); setSidebarOpen(false); }}
              className={`relative flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg transition-colors text-xs font-semibold ${
                activePage === 'messages'
                  ? 'bg-white/20 text-white'
                  : 'text-red-200 hover:text-white hover:bg-white/10'
              }`}
              title="Messages — inbox and direct messaging"
            >
              <MessageSquare size={15} />
              <span className="hidden sm:inline">Messages</span>
              {unreadMessageCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-white text-red-700 text-[10px] font-black rounded-full flex items-center justify-center leading-none">
                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                </span>
              )}
            </button>

            {/* My Member Portal button */}
            <button
              onClick={() => { handleNavigate('portal'); setSidebarOpen(false); }}
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-red-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs font-semibold"
              title="My Member Portal — your profile, certs, training & hours"
            >
              <IdCard size={15} />
              <span className="hidden sm:inline">My Portal</span>
            </button>

            {/* Personal Assistant button */}
            <button
              onClick={() => setAssistantOpen((o) => !o)}
              className="relative flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-red-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs font-semibold"
              title="Personal Assistant"
            >
              <Bot size={15} />
              <span className="hidden sm:inline">Assistant</span>
              {assistantCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-purple-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {assistantCount > 99 ? '99+' : assistantCount}
                </span>
              )}
            </button>

            {/* Help button */}
            <button
              onClick={() => setHelpOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-red-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs font-semibold"
              title="Help & Documentation"
            >
              <HelpCircle size={15} />
              Support
            </button>

            {/* Report a Bug / Feedback */}
            <button
              onClick={() => setFeedbackOpen(true)}
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-red-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs font-semibold"
              title="Report a bug or send feedback"
            >
              <MessageSquarePlus size={15} />
              <span className="hidden sm:inline">Feedback</span>
            </button>

            {/* Theme toggle */}
            <button
              onClick={() => toggleTheme()}
              title="Toggle dark mode"
              aria-label="Toggle dark mode"
              className="p-2 rounded-lg text-red-200 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Moon size={16} className="dark:hidden" />
              <Sun size={16} className="hidden dark:block" />
            </button>

            {/* Alert bell */}
            <button
              onClick={() => { handleNavigate('alerts'); setSidebarOpen(false); }}
              className="relative p-2 text-red-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Notifications & Alerts"
              aria-label="Notifications and alerts"
            >
              <Bell size={18} />
              {alertCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-amber-400 text-gray-900 text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </button>

            {/* User menu dropdown */}
            <UserMenu user={user} roleInfo={roleInfo} onLogout={onLogout} onCustomize={() => setPrefsOpen(true)} />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {sidebarOpen && (
          <div className="fixed inset-0 z-20 bg-black/40 sm:hidden" aria-hidden="true"
            onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <aside className={`
          fixed sm:static top-16 sm:top-0 bottom-0 left-0 z-30 w-56 bg-gray-900 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}
          sm:flex
        `}>
          {/* Station badge — becomes a picker when the dept has 2+ houses (P6.3) */}
          <div className="border-b border-gray-700" ref={stationPickerRef}>
            {stations.length > 1 ? (
              <div className="relative">
                <button
                  onClick={() => setStationPickerOpen((o) => !o)}
                  className="w-full px-4 py-4 text-left hover:bg-gray-800/60 transition-colors"
                  title="Filter by house"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        {selectedStation ? stations.find((s) => s.id === selectedStation)?.name ?? stationName : 'All Houses'}
                      </p>
                      <p className="text-sm font-medium text-white mt-0.5">{departmentName}</p>
                    </div>
                    <ChevronDown size={13} className={`text-gray-500 flex-shrink-0 transition-transform ${stationPickerOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {stationPickerOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 bg-gray-800 border border-gray-700 rounded-b-lg shadow-xl py-1">
                    <button
                      onClick={() => { onStationChange?.(null); setStationPickerOpen(false); }}
                      className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${!selectedStation ? 'text-white font-semibold' : 'text-gray-300 hover:bg-gray-700'}`}
                    >
                      All Houses
                      {!selectedStation && <span className="text-red-400 text-xs">✓</span>}
                    </button>
                    {stations.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { onStationChange?.(s.id); setStationPickerOpen(false); }}
                        className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${selectedStation === s.id ? 'text-white font-semibold' : 'text-gray-300 hover:bg-gray-700'}`}
                      >
                        {s.name}
                        {selectedStation === s.id && <span className="text-red-400 text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{stationName}</p>
                <p className="text-sm font-medium text-white mt-0.5">{departmentName}</p>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav ref={navRef} className="flex-1 px-3 py-3 overflow-y-auto space-y-3">
            <NavItem
              id="calendar"
              label="The Board"
              icon={CalendarDays}
              active={activePage === 'calendar'}
              onClick={() => { handleNavigate('calendar'); setSidebarOpen(false); }}
            />
            <NavItem
              id="dashboard"
              label="Dashboard"
              icon={LayoutDashboard}
              active={activePage === 'dashboard'}
              onClick={() => { handleNavigate('dashboard'); setSidebarOpen(false); }}
            />

            {/* Incident Command Center — top-level, high-visibility */}
            <button
              onClick={() => { handleNavigate('command'); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold transition-colors text-left border ${
                activePage === 'command'
                  ? 'bg-red-700 text-white border-red-600'
                  : 'text-red-400 border-red-900 hover:bg-red-900/40 hover:text-red-300'
              }`}
            >
              <Siren className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">Dispatch & Command</span>
              {activePage !== 'command' && (
                <span className="text-[9px] font-black uppercase tracking-widest text-red-600">Live</span>
              )}
            </button>

            <div className="h-px bg-gray-700" />

            {filteredNavGroups.map((group) => (
              <NavGroup
                key={group.id}
                group={group}
                activePage={activePage}
                open={!!groupOpen[group.id]}
                onToggle={() => toggleGroup(group.id)}
                onNavigate={handleNavigate}
                setSidebarOpen={setSidebarOpen}
                user={user}
              />
            ))}

            <div className="h-px bg-gray-700" />

            <NavItem
              label="Notifications"
              icon={Bell}
              active={activePage === 'alerts'}
              onClick={() => { handleNavigate('alerts'); setSidebarOpen(false); }}
              badge={alertCount > 0 && (
                <span className="min-w-[20px] h-5 bg-amber-400 text-gray-900 text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            />

            {canAccess(user, 'settings') && (
              <NavItem
                label="Station Settings"
                icon={Settings}
                active={activePage === 'settings'}
                onClick={() => { handleNavigate('settings'); setSidebarOpen(false); }}
              />
            )}
          </nav>

          {/* Footer — user info + logout */}
          <div className="px-4 py-3 border-t border-gray-700 space-y-2">
            {user && (
              <div className="flex items-center gap-2">
                <div className={`h-8 w-8 rounded-lg text-xs font-black flex items-center justify-center flex-shrink-0 ${roleInfo.bg} ${roleInfo.color}`}>
                  {user.initials}
                </div>
                <div className="flex-1 min-w-0 leading-none">
                  <p className="text-xs font-semibold text-white truncate">{user.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{roleInfo.label}</p>
                </div>
                <button
                  onClick={onLogout}
                  title="Sign out"
                  aria-label="Sign out"
                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}
            <p className="text-[10px] font-semibold"><span className="text-gray-500">OPEN</span><span className="text-red-400">FIREHOUSE</span> <button onClick={() => setWhatsNewOpen(true)} className="text-gray-400 hover:text-red-500 font-normal transition-colors cursor-pointer" title="What's New">v{__APP_VERSION__}</button></p>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div key={activePage} className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-safe">
            {children}
          </div>
        </main>
      </div>

      {/* Help panel */}
      {helpOpen && <HelpPanel user={user} currentPage={activePage} onClose={() => setHelpOpen(false)} />}

      {/* Preferences modal */}
      {prefsOpen && (
        <PreferencesModal
          user={user}
          prefs={userPrefs}
          onSave={(p) => { onPrefsChange?.(p); }}
          onClose={() => setPrefsOpen(false)}
        />
      )}

      {/* Personal Assistant panel */}
      <PersonalAssistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        user={user}
        onNavigate={(moduleId) => { handleNavigate(moduleId); setAssistantOpen(false); }}
      />

      {/* What's New modal */}
      <WhatsNew open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />

      {/* Feedback widget */}
      <FeedbackWidget
        user={user}
        settings={settings}
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
      />

      {/* Voice Assistant — "Hey Firehouse" floating mic */}
      <VoiceAssistant incident={null} />

      {/* Offline / sync banner */}
      <OfflineBanner />
    </div>
  );
}
