import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import LoginScreen from './components/LoginScreen';
import FirstRunSetup from './components/FirstRunSetup';
import LicenseActivation from './components/LicenseActivation';
import DispatchNotification from './components/DispatchNotification';
import { canAccess, isUnitSession } from './data/auth';
import { isModuleEnabled } from './data/moduleRegistry';
import { ActivityProvider } from './context/ActivityContext';
import { Siren, Truck } from 'lucide-react';

// ── Eagerly loaded: pages shown on first render ──
import Dashboard from './components/Dashboard';

// ── Lazy loaded: every other page loads on demand ──
const MemberRoster = lazy(() => import('./components/MemberRoster'));
const ApparatusTracker = lazy(() => import('./components/ApparatusTracker'));
const DutySchedule = lazy(() => import('./components/DutySchedule'));
const IncidentLog = lazy(() => import('./components/IncidentLog'));
// NOT lazy: this is the ENTIRE content of the report window. Code-splitting it
// would put a Suspense spinner between the officer and the form for no benefit —
// there is nothing else in this window to load first.
import IncidentReportWindow from './components/IncidentReportWindow';
const AIScheduler = lazy(() => import('./components/AIScheduler'));
const TrainingRecords = lazy(() => import('./components/TrainingRecords'));
const TrainingModules = lazy(() => import('./components/TrainingModules'));
const TrainingCompliance = lazy(() => import('./components/TrainingCompliance'));
const ModulePlayer = lazy(() => import('./components/ModulePlayer'));
const MutualAidTracker = lazy(() => import('./components/MutualAidTracker'));
const AssetInventory = lazy(() => import('./components/AssetInventory'));
const ReportsExport = lazy(() => import('./components/ReportsExport'));
const Reconciliation = lazy(() => import('./components/Reconciliation'));
const NotificationsCenter = lazy(() => import('./components/NotificationsCenter'));
const StationSettings = lazy(() => import('./components/StationSettings'));
const VolunteerHours = lazy(() => import('./components/VolunteerHours'));
const MyPortal = lazy(() => import('./components/MyPortal'));
const EventCalendar = lazy(() => import('./components/EventCalendar'));
const PreIncidentPlans = lazy(() => import('./components/PreIncidentPlans'));
const ApparatusChecks = lazy(() => import('./components/ApparatusChecks'));
const WorkOrders = lazy(() => import('./components/WorkOrders'));
const Narcotics = lazy(() => import('./components/Narcotics')); // 2.7 (0087, Dale-gated)
const SOGLibrary = lazy(() => import('./components/SOGLibrary'));
const PublicDashboard = lazy(() => import('./components/PublicDashboard'));
const BudgetTracker = lazy(() => import('./components/BudgetTracker'));
const WellnessTracker = lazy(() => import('./components/WellnessTracker'));
const NFIRSReports = lazy(() => import('./components/NFIRSReports'));
const FireInspections = lazy(() => import('./components/FireInspections'));
const Prevention = lazy(() => import('./components/prevention/Prevention')); // Phase 3 Prevention Center
// InspectionSearch + InspectionEntry retired P0.4 (2026-07-12): both were local-state
// mockups that persisted nothing and showed a pre-canonical vocabulary. Their good
// ideas (advanced search, imminent-hazard flag, print flags) return properly in the
// Prevention Core rebuild (gameplan Phases 2-3).
// P1-1 (2026-07-16): the legacy "coming soon" mockup pages (InspectionChecklist,
// InspectorStatus, Violations, Registrations, RegistrationSearch, RegistrationEntry,
// Complaints) were REMOVED — every one rendered a static shell next to the REAL,
// shipped feature inside Prevention Center. Do not resurrect; build inside
// Prevention Center instead.
const PrePlanWizard = lazy(() => import('./components/PrePlanWizard'));
const HydrantTracker = lazy(() => import('./components/HydrantTracker'));
const DrillManager = lazy(() => import('./components/DrillManager'));
const StationLog = lazy(() => import('./components/StationLog'));
const GrantManager = lazy(() => import('./components/GrantManager'));
const CommunityRisk = lazy(() => import('./components/CommunityRisk'));
const CADIntegration = lazy(() => import('./components/CADIntegration'));
const AvlSettings = lazy(() => import('./components/AvlSettings'));
const FireInvestigation = lazy(() => import('./components/FireInvestigation'));
const DataImport = lazy(() => import('./components/DataImport'));
const DataIngestAI = lazy(() => import('./components/DataIngestAI'));
const RecruitmentTracker = lazy(() => import('./components/RecruitmentTracker'));
const AssetTesting = lazy(() => import('./components/AssetTesting'));
const PayrollTracker = lazy(() => import('./components/PayrollTracker'));
const HazmatReference = lazy(() => import('./hazmat/HazmatReference'));
const CommandBoard = lazy(() => import('./components/CommandBoard'));
const RecallSystem = lazy(() => import('./components/RecallSystem'));
const TVDisplay = lazy(() => import('./components/TVDisplay'));
const IncidentResponse = lazy(() => import('./components/IncidentResponse'));
const BulletinBoard = lazy(() => import('./components/BulletinBoard'));
const RadioLog = lazy(() => import('./components/RadioFeed'));
const FundraisingTracker = lazy(() => import('./components/FundraisingTracker'));
const CommunityOutreach = lazy(() => import('./components/CommunityOutreach'));
const CadetProgram = lazy(() => import('./components/CadetProgram'));
const ResponseAnalytics = lazy(() => import('./components/ResponseAnalytics'));
const FLSADashboard = lazy(() => import('./components/FLSADashboard'));
const QualificationsManager = lazy(() => import('./components/QualificationsManager'));
const ApparatusAssignmentBoard = lazy(() => import('./components/ApparatusAssignmentBoard'));
const RetentionScoring = lazy(() => import('./components/RetentionScoring'));
const OTEqualizationBoard = lazy(() => import('./components/OTEqualizationBoard'));
const PersonnelActions = lazy(() => import('./components/PersonnelActions'));
const ExposureTracking = lazy(() => import('./components/ExposureTracking'));
const ShiftTradeManager = lazy(() => import('./components/ShiftTradeManager'));
const DailyStaffingBoard = lazy(() => import('./components/DailyStaffingBoard'));
const ApparatusOOSTracker = lazy(() => import('./components/ApparatusOOSTracker'));
const TimesheetExport = lazy(() => import('./components/TimesheetExport'));
const GrievanceTracker = lazy(() => import('./components/GrievanceTracker'));
const AfterActionReports = lazy(() => import('./components/AfterActionReports'));
const MutualAidAgreements = lazy(() => import('./components/MutualAidAgreements'));
const TrainingPlans = lazy(() => import('./components/TrainingPlans'));
const DocumentVault = lazy(() => import('./components/DocumentVault'));
const MeetingMinutes = lazy(() => import('./components/MeetingMinutes'));
const PolicyAcknowledgments = lazy(() => import('./components/PolicyAcknowledgments'));
const EquipmentCheckout = lazy(() => import('./components/EquipmentCheckout'));
const KnoxKeyManagement = lazy(() => import('./components/KnoxKeyManagement'));
const IncidentCostTracker = lazy(() => import('./components/IncidentCostTracker'));
const IncidentMap = lazy(() => import('./components/IncidentMap'));
const DispatchArchive = lazy(() => import('./components/DispatchArchive'));
const CommanderCam = lazy(() => import('./components/CommanderCam'));
const VacancyFill = lazy(() => import('./components/VacancyFill'));
const NG911Console = lazy(() => import('./components/NG911Console'));
const FTOTracker = lazy(() => import('./components/FTOTracker'));
const ActivityLogger = lazy(() => import('./components/ActivityLogger'));
const IncidentIntelligence = lazy(() => import('./components/IncidentIntelligence'));
const TrainingRecommender = lazy(() => import('./components/TrainingRecommender'));
const ReportWriter = lazy(() => import('./components/ReportWriter'));
const PrePlanAI = lazy(() => import('./components/PrePlanAI'));
const StaffingPredictor = lazy(() => import('./components/StaffingPredictor'));
const EmailIngest = lazy(() => import('./components/EmailIngest'));
const TrainingCatalog = lazy(() => import('./components/TrainingCatalog'));
const MyTraining = lazy(() => import('./components/MyTraining'));
const TodaysCrew = lazy(() => import('./components/TodaysCrew'));
const DatabaseAdmin = lazy(() => import('./components/DatabaseAdmin'));
import { loadSettings } from './data/stationSettings';
import { useAttentionCount } from './hooks/useAttentionCount';
import { api, setToken, clearToken, onAuthFailure, getStoredUser, getToken } from './utils/api';
import { toneDispatch } from './utils/alertTones';
import { supabase, dispatchTopic } from './utils/supabase';
const OnboardingFlow = lazy(() => import('./components/OnboardingFlow'));
const DepartmentSetupWizard = lazy(() => import('./components/DepartmentSetupWizard'));
const AssistantWidget = lazy(() => import('./components/AssistantWidget'));
const DictationWidget = lazy(() => import('./components/DictationWidget'));
const WorkflowPanel = lazy(() => import('./components/WorkflowPanel'));
import { DEFAULT_PREFS, loadLocalPrefs, saveLocalPrefs } from './components/PreferencesModal';
const MessagesInbox = lazy(() => import('./components/MessagesInbox'));
const KioskDispatch = lazy(() => import('./components/KioskDispatch'));

// OnboardingFlow helpers (lazy-loaded separately)
// Beacon removed — was a duplicate of AssistantWidget at the same corner.
// BugReporter removed — self-heal trigger is now an opt-in checkbox inside
// the header Feedback form (FeedbackWidget). One place for all bug reports.

// ── TV mode: /tv?pin=XXXX-XXXX bypasses all auth ────────────────────────────
const IS_TV_MODE = window.location.pathname === '/tv';
const TV_PIN     = IS_TV_MODE
  ? (new URLSearchParams(window.location.search).get('pin') || '')
  : null;

// ── Kiosk mode: ?kiosk=true renders full-screen dispatch (watch desk) ────────
const IS_KIOSK = new URLSearchParams(window.location.search).get('kiosk') === 'true';

// ── Incident report window: #/incident-report opens in its OWN browser window ──
// Read once at module load, like the two above, so the early return in App()
// cannot change hook order between renders.
const IS_REPORT_WINDOW = /^#\/incident-report\b/.test(window.location.hash);

/**
 * RENDERABLE_PAGES — every page id the render chain below actually has a branch for.
 *
 * 🔴 WHY THIS EXISTS: an unrecognised hash used to become the ACTIVE page and render a blank
 * screen. Both guards in the router fail OPEN for an unknown id, and correctly so:
 *   · isModuleEnabled() treats an id absent from MODULE_STATUS as ready — that map is a sparse
 *     HIDDEN-set by design ("a module ABSENT from this map defaults to ready"), so making it
 *     fail closed would hide every working module. Do NOT "fix" it there.
 *   · canAccess() falls back to `PAGE_ACCESS[id] ?? 3`, and a chief IS level 3 — so a chief
 *     passes the check for any string at all. (A member is level 1, fails, and never saw this.)
 * With both passing, setPage('anything') ran, no branch matched, and the user got an empty
 * panel with the header still reading "Dashboard" — indistinguishable from a crash. Reproduced
 * on prod 2026-08-04 with #/this-route-does-not-exist and with a stale ?page=prevention link.
 *
 * The list is kept honest by a TEST, not by discipline: tests/renderablePages.test.js parses
 * this file for every `page === '...'` branch and fails if the two sets differ. Add a page
 * without adding it here and the suite breaks — which is the point, because the last thing this
 * guard should do is silently start rejecting a real screen.
 */
export const RENDERABLE_PAGES = new Set([
  'activity-equipment', 'activity-general', 'activity-station', 'activity-training',
  'activity-unit', 'after-action', 'ai', 'aid-agreements', 'alerts', 'analytics', 'apparatus',
  'apparatus-oos', 'assets', 'assignboard', 'avl', 'budget', 'bulletins', 'cad', 'cadets',
  'calendar', 'checklists', 'command', 'commander-cam', 'community-outreach', 'crr',
  'daily-staffing', 'dashboard', 'data-ingest', 'dataimport', 'db-admin', 'dispatch-archive',
  'doc-vault', 'drills', 'email-ingest', 'equipment-checkout', 'exposure-tracking',
  'fireinvestigation', 'flsa', 'fto-tracker', 'fundraising', 'grants', 'grievances', 'hazmat',
  'hours', 'hydrants', 'incident-costs', 'incident-intel', 'incident-map', 'incidents',
  'inspections', 'knox-keys', 'live-dispatch', 'maintenance', 'meeting-minutes',
  'messages', 'mutualaid', 'my-training', 'narcotics', 'nfirs', 'ng911', 'ot-equalization',
  'payroll', 'personnel-actions', 'policy-acks', 'portal', 'preplan-ai', 'preplan-wizard',
  'preplans', 'prevention-center', 'public', 'qualifications', 'radio-log', 'recall',
  'reconciliation', 'recruitment', 'report-writer', 'reports', 'retention', 'roster', 'scba',
  'schedule', 'settings', 'shift-trades', 'sogs', 'staffing-ai', 'stationlog', 'timesheets',
  'todays-crew', 'training', 'training-ai', 'training-catalog', 'training-compliance',
  'training-modules', 'training-plans', 'vacancy-fill', 'wellness', 'workflows',
]);

/**
 * RETIRED_ROUTES — a page id that no longer exists, mapped to where its capability WENT.
 *
 * 🔴 WHY THIS IS A MODULE-LEVEL MAP AND NOT A BRANCH IN THE RENDER CHAIN. The R6 fold
 * (`986b624`) retired eight page ids and wrote a redirect for them inside the render tree:
 *   {[...retiredIds].includes(page) && (() => { setTimeout(() => setPage('prevention-center')) })()}
 * with the correct intent — "a bookmark or a ⌘K entry pointing at the retired id must land on the
 * real feature, not a blank pane."
 *
 * **It could never fire.** None of the eight ids is in RENDERABLE_PAGES, so `getInitialPage` and
 * the hashchange handler both REJECT them before `page` is ever set — and the branch only tests
 * `page`. The one thing that could still have reached it, an in-app `setPage('permits')`, was the
 * nav entry that the same commit deleted. So the guard against stale links was unreachable BY a
 * stale link, for every cold load and every `?page=` push-notification click, from the day it
 * shipped. Same class as `9abbdd9`: a remedy that does not exist where the problem occurs.
 *
 * Resolution has to happen BEFORE the renderable-pages gate, which is what this map does.
 * Every entry is a documented successor, not a guess:
 *   · `permits` — R6 states it explicitly: folded into the Prevention Center Permits tab.
 *   · the six prevention-family placeholders retired by the same commit — their capability lives
 *     in Prevention Center (findings/violations are cited inside an inspection; checklists and
 *     inspector status are its Dashboard).
 *   · `prevention` — never a route, added as an alias because it is the obvious short form a human
 *     types or bookmarks for `prevention-center`, and it is unambiguous.
 * An id with NO successor does not belong here — it falls through to the portal, silently.
 */
export const RETIRED_ROUTES = Object.freeze({
  permits:                'prevention-center',
  violations:             'prevention-center',
  complaints:             'prevention-center',
  registrations:          'prevention-center',
  'registration-search':  'prevention-center',
  'registration-entry':   'prevention-center',
  'inspection-checklist': 'prevention-center',
  'inspector-status':     'prevention-center',
  prevention:             'prevention-center',
});

/** A retired id resolves to its successor; anything else passes through unchanged. */
export const resolveRoute = (id) => (id && RETIRED_ROUTES[id]) || id;

// Read ?page= deep-link from URL (used by push notification clicks)
function getInitialPage() {
  try {
    const h = resolveRoute((window.location.hash.match(/^#\/([\w-]+)/) || [])[1]);
    // A deep-link to a not-enabled ('planned') module falls back to the portal —
    // market model: a module the department hasn't enabled is not reachable.
    // RENDERABLE_PAGES is the added guard: a hash that no branch can render must not become
    // the active page, or the user gets a blank panel instead of a screen.
    //
    // Falling back to the portal IS the whole remedy, and it is deliberately SILENT. A stale
    // bookmark is not an event worth narrating: the earlier version raised a banner naming the
    // requested route in a monospace box and guessing at the cause ("most likely an old
    // bookmark"), which put an internal route slug and a theory about the user's browser in
    // front of a fire chief. The blank-panel bug it was written for is fixed by landing
    // somewhere real — not by also explaining the router.
    if (h && RENDERABLE_PAGES.has(h) && isModuleEnabled(h)) return h;
    const params = new URLSearchParams(window.location.search);
    // ?page= is how a PUSH NOTIFICATION click arrives, which is why resolving retired ids here
    // is not hypothetical: a notification sent before a route was retired still opens that id.
    const p = resolveRoute(params.get('page'));
    if (p && RENDERABLE_PAGES.has(p) && isModuleEnabled(p)) return p;
  } catch (_) {}
  return 'portal';
}

// ── Kiosk wrapper — Supabase Realtime ping + authed refetch ──────────────────
// Same delivery pattern as the main-app dispatch effect: the kiosk used to
// hold an unauthenticated SSE stream open, which (a) was rejected by the
// stream's token check and (b) cannot deliver across Vercel serverless
// instances anyway — so the Watch Desk never received a single call in prod.
// It now reuses the signed-in session from the launching tab (localStorage).
function KioskApp() {
  const [dispatches, setDispatches] = useState([]);
  const [connected, setConnected] = useState(false);
  const authed = !!getToken();

  useEffect(() => {
    if (!authed) return undefined;
    let cancelled = false;
    const dept = getStoredUser()?.department_id ?? null;

    async function loadAlerts() {
      try {
        const res = await api.get('/api/cad/alerts?limit=50');
        if (cancelled) return;
        setDispatches((res?.data || []).map((a) => ({
          id: a.id,
          status: a.status,
          priority: a.priority,
          description: a.description,
          type: a.type,
          address: a.address,
          location: a.location,
          details: a.details,
          units: a.units,
          dispatched_at: a.dispatched_at,
        })));
      } catch (_) { /* keep last-known feed; next ping/poll retries */ }
    }

    loadAlerts();

    // Realtime keyed on department (P6.2). Skip the subscription if we somehow
    // have no department — never fall back to a default tenant; the poll backstops.
    const topic = dispatchTopic(dept);
    const channel = (supabase && topic)
      ? supabase
          .channel(topic)
          .on('broadcast', { event: 'dispatch' }, () => loadAlerts())
          .subscribe((status) => setConnected(status === 'SUBSCRIBED'))
      : null;

    // Poll backstop for a missed ping — the kiosk is an always-on display.
    const pollTimer = setInterval(() => { if (!document.hidden) loadAlerts(); }, 20000);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      if (channel) { try { supabase.removeChannel(channel); } catch (_) { /* noop */ } }
    };
  }, [authed]);

  return <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full" /></div>}><KioskDispatch dispatches={dispatches} connected={connected} authMissing={!authed} /></Suspense>;
}

export default function App() {
  // ── Incident report window — its own browser window, no app chrome ──
  // Spec R1 (Matt, 2026-08-07): the report opens as a SEPARATE window that can
  // live on a second monitor while the call list stays usable on the first.
  // Same early-return shape as kiosk/TV: the predicate is a module constant, so
  // it is stable across renders and cannot change the hook order below.
  // It renders no sidebar and no topbar on purpose — this window has one job,
  // and the modal it replaces was showing 17 of 110 fields for want of width.
  if (IS_REPORT_WINDOW) {
    return <IncidentReportWindow />;
  }

  // ── Kiosk mode shortcut — full-screen watch desk display ──
  if (IS_KIOSK) {
    return <KioskApp />;
  }

  // ── TV mode shortcut — skip all auth, render wall display ──
  if (IS_TV_MODE) {
    return <TVDisplay pin={TV_PIN} />;
  }
  const [user,      setUser]     = useState(null);
  const [page,      setPage]     = useState(getInitialPage);
  // Router: reflect the current page in the URL hash so screens are deep-linkable
  // and testable (#/incidents, #/preplans, …). No react-router, no new dependency.
  useEffect(() => {
    const target = `#/${page}`;
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
  }, [page]);
  useEffect(() => {
    const onHash = () => {
      // Resolve retired ids here too — an in-session hash change to a retired route is the same
      // problem as a cold load of one, and it hit the same unreachable-guard bug.
      const id = resolveRoute((window.location.hash.match(/^#\/([\w-]+)/) || [])[1]);
      if (!id || id === page) return;
      // A hash no branch can render must never become the active page — that is the blank-screen
      // bug. Leave the user on the screen they were already looking at, silently: they are still
      // looking at something real, which is the entire requirement.
      if (!RENDERABLE_PAGES.has(id)) return;
      if (canAccess(user, id) && isModuleEnabled(id)) setPage(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [page, user]);
  const [settings,  setSettings] = useState(() => loadSettings());
  const [authReady, setAuthReady] = useState(false);
  const [firstRun,  setFirstRun]  = useState(null);  // null = checking, true = no users exist, false = setup done
  const [licenseActivated, setLicenseActivated] = useState(null); // null = checking, true/false = known
  const [licenseStatus,    setLicenseStatus]    = useState(null); // full /api/license/status payload
  const [cadAlert,  setCadAlert] = useState(null);   // incoming call banner
  const [cadAlertDismissed, setCadAlertDismissed] = useState(null); // dismissed alert id
  // Mirror the dismissed-id into a ref so the dispatch effect's loadDispatches
  // closure (deps: [user]) reads the CURRENT value, not the stale one captured
  // at mount — otherwise a dismissed banner re-fires on the next 20s poll/ping.
  const cadAlertDismissedRef = useRef(null);
  const [pendingCADAlert, setPendingCADAlert] = useState(null); // passed to CommandBoard
  const [autoActivate, setAutoActivate] = useState(false); // triggers auto-activation in CommandBoard
  const [showDeptSetup, setShowDeptSetup] = useState(false);
  const [userPrefs, setUserPrefs] = useState(DEFAULT_PREFS);
  const [respondingTo, setRespondingTo] = useState(null); // active incident for Live Guidance
  const [activeModule, setActiveModule] = useState(null); // active on-demand training module
  const [dispatches,  setDispatches]    = useState([]);   // live dispatch feed (SSE)
  const [stations,        setStations]        = useState([]);   // P6.3 — department's houses
  const [selectedStation, setSelectedStation] = useState(null); // null = all houses
  const [latestDispatch, setLatestDispatch] = useState(null); // newest dispatch for popup
  const [matchedPrePlan, setMatchedPrePlan] = useState(null); // preplan auto-surfaced for current dispatch
  const dispatchNotifDismissedRef = useRef(null); // id of last dismissed notification

  // Dispatch tone — REPEATS until acknowledged (market norm: every major
  // responder/station-alerting product repeats the dispatch tone until a human
  // acks). Keys on the notification being up; dismissing/viewing it (or the
  // next feed refresh clearing it) stops the tone. Capped at 6 plays (~1 min)
  // so an unattended kiosk doesn't tone forever. Single-shot tones for
  // overdue/PAR stay as-is — this is primary alerting, those are cues.
  useEffect(() => {
    if (!latestDispatch) return;
    toneDispatch(); // immediate
    let plays = 1;
    const id = setInterval(() => {
      if (plays >= 6) { clearInterval(id); return; }
      plays += 1;
      toneDispatch();
    }, 10000);
    return () => clearInterval(id);
  }, [latestDispatch]);
  const seenDispatchIdsRef = useRef(new Set());   // alert ids already processed (don't re-banner)
  useEffect(() => { cadAlertDismissedRef.current = cadAlertDismissed; }, [cadAlertDismissed]);

  // live badge count — user-filtered cert alerts + workflow alerts + unread bulletins/notices
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  // ONE definition of "needs attention", shared with the Notifications page, the
  // Member Portal card and the Dashboard header — see hooks/useAttentionCount.js.
  // The bell used to compute this inline and three other surfaces each computed
  // something different, so the app showed 47 / 36 / 1 for the same claim.
  const { total: alertCount } = useAttentionCount(user, unreadMessageCount);

  // Deep-link state — when user clicks a notification, we pass the bulletin ID
  // to the target component so it can auto-expand that specific post.
  const [bulletinHighlight, setBulletinHighlight] = useState(null);

  // Register logout handler for 401 failures in api.js.
  // Full page reload clears all React state and avoids any render-crash on expiry.
  useEffect(() => {
    onAuthFailure(() => { clearToken(); window.location.reload(); });
  }, []);

  // Vercel serverless functions are always-on; no warm-up ping needed.
  // This code is kept for future extensibility and monitoring purposes.
  useEffect(() => {
    const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3005';
    // Optional: ping /health occasionally for monitoring (disabled)
    // const ping = () => fetch(`${BASE}/health`, { method: 'GET' }).catch(() => {});
    // ping(); // immediate ping on mount
    // const id = setInterval(ping, 10 * 60 * 1000); // then every 10 min
    // return () => clearInterval(id);
  }, []);

  // Try to restore session on startup.
  // Primary: refresh cookie (httpOnly). Fallback: localStorage token.
  useEffect(() => {
    api.post('/api/auth/refresh', undefined)
      .then((data) => { setToken(data.token, data.user); setUser(data.user); })
      .catch(() => {
        // Cookie refresh failed (e.g. blocked cross-origin cookie).
        // Fall back to the token already restored from localStorage in api.js.
        const stored = getStoredUser();
        if (getToken() && stored) setUser(stored);
      })
      .finally(() => setAuthReady(true));
  }, []);

  // ── Unit-login landing (migration 0025) ───────────────────────────────────
  // A unit terminal can only open the operational/rig pages (UNIT_PAGES). If the
  // restored/initial page isn't one of them, drop it on The Board so it never
  // lands on a guarded blank screen. Member/officer sessions are unaffected.
  useEffect(() => {
    if (isUnitSession(user) && !canAccess(user, page)) setPage('command');
  }, [user, page]);

  // ── Unit GPS reporting (migration 0025) ───────────────────────────────────
  // When signed in AS a unit (the in-cab apparatus terminal — laptop or iPad),
  // the device reports its position so the rig shows live on the dispatch map and
  // its own response route can be drawn — identical to OF Mobile's location.ts.
  // Member/officer sessions NEVER track. Fire-and-forget; fixes worse than 100 m
  // are dropped so a cold-start reading never puts a wrong dot on the map.
  useEffect(() => {
    if (!isUnitSession(user) || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const apparatusId = user.apparatus_id;
    const report = (pos) => {
      const { latitude, longitude, heading, speed, accuracy } = pos.coords || {};
      if (typeof accuracy === 'number' && accuracy > 100) return; // drop noisy fixes
      api.patch(`/api/units/${apparatusId}/location`, {
        latitude, longitude,
        heading: typeof heading === 'number' ? heading : null,
        speed: typeof speed === 'number' ? speed : null,
        accuracy: typeof accuracy === 'number' ? accuracy : null,
      }).catch(() => { /* fire-and-forget: a failed report must never disrupt the app */ });
    };
    const watchId = navigator.geolocation.watchPosition(
      report, () => { /* permission denied / unavailable — silently skip */ },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [user]);

  // ── Check for pending wizard/onboarding on session restore ────────────────
  useEffect(() => {
    if (!user) return;
    // Department setup wizard for the first admin/chief (not completed). The
    // per-member personal setup wizard was REMOVED — members never self-configure
    // their profile (the chief/BC enters all of it), and notifications are
    // rank-derived, not a personal choice. Units are never chief/admin.
    if ((user.role === 'chief' || user.role === 'admin') && !localStorage.getItem('of_dept_setup_complete')
        && !sessionStorage.getItem('of_dept_setup_snooze')) { // snooze = "Finish later" this session (wizard audit 2026-07-16)
      setShowDeptSetup(true);
    }
  }, [user]);

  // ── Real-time dispatch (Supabase Realtime + poll fallback) ──────────────────
  // SSE does NOT deliver across Vercel serverless instances, so the CAD banner
  // was unreliable. The server now broadcasts a minimal "new dispatch" ping over
  // Supabase Realtime (id only — no call details on the public channel); we
  // refetch the authz'd /api/cad/alerts for the real data. A 20s visibility-aware
  // poll covers any missed ping. seenDispatchIdsRef guarantees each call fires the
  // banner/auto-activate at most once, and never replays an old call on page open.
  useEffect(() => {
    if (!user) return;
    const dept = user.department_id ?? null;
    const seen = seenDispatchIdsRef.current;
    let cancelled = false;
    let pollTimer;

    const normalize = (a) => ({
      id:            a.id,
      alertId:       a.alert_id,
      description:   a.description,
      address:       a.address,
      units:         a.units,
      details:       a.details,
      latitude:      a.latitude,
      longitude:     a.longitude,
      dispatchedAt:  a.dispatched_at,
      dispatched_at: a.dispatched_at,
      source:        a.source || 'cad',
    });

    async function loadDispatches({ allowBanner }) {
      let alerts;
      try {
        const res = await api.get('/api/cad/alerts?limit=100');
        alerts = res?.data || [];
      } catch (_) {
        return; // keep last-known feed; the next ping/poll retries
      }
      if (cancelled) return;

      const mapped = alerts.map(normalize);
      setDispatches(mapped.slice(0, 100)); // feed always reflects current calls

      // Alerts never processed before (array is newest-first).
      const fresh = mapped.filter((a) => !seen.has(a.id));
      mapped.forEach((a) => seen.add(a.id));

      // First load only SEEDS seen-ids — opening a board mid-shift must not
      // replay an old call as a toast or banner. Only genuinely new arrivals
      // (via realtime ping / poll) raise the notification + auto-activate.
      if (allowBanner && fresh.length) {
        const newest = fresh[0]; // newest unprocessed alert
        setLatestDispatch(newest); // slide-in toast — the repeat-tone effect below keys on it
        const age = (Date.now() - new Date(newest.dispatched_at).getTime()) / 1000;
        if (age < 600 && newest.id !== cadAlertDismissedRef.current) {
          const alert = {
            id:            newest.id,
            description:   newest.description,
            address:       newest.address,
            units:         newest.units,
            dispatched_at: newest.dispatched_at,
          };
          setCadAlert(alert);
          setPendingCADAlert(alert);   // auto-activate: push to Command Board
          setAutoActivate(true);
          setPage('command');

          // Pre-plan auto-surface — fuzzy match against building address
          if (newest.address) {
            api.get(`/api/pre-plans/by-address?address=${encodeURIComponent(newest.address)}`)
              .then(res => { if (res?.data) setMatchedPrePlan(res.data); })
              .catch(() => {}); // never fail the dispatch flow
          }
        }
      }
    }

    // First load seeds seen-ids without firing the banner.
    loadDispatches({ allowBanner: false });

    // Realtime ping → refetch (banner allowed). Dept-keyed (P6.2); skip the
    // subscription if no department is known — never default a tenant; poll covers.
    const topic = dispatchTopic(dept);
    const channel = (supabase && topic)
      ? supabase
          .channel(topic)
          .on('broadcast', { event: 'dispatch' }, () => loadDispatches({ allowBanner: true }))
          .subscribe()
      : null;

    // Poll fallback for a missed ping; pause while the tab is hidden.
    pollTimer = setInterval(() => {
      if (!document.hidden) loadDispatches({ allowBanner: true });
    }, 20000);

    const onVisible = () => { if (!document.hidden) loadDispatches({ allowBanner: true }); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) { try { supabase.removeChannel(channel); } catch (_) {} }
    };
  }, [user]);

  // First-run check: if the server reports no users exist, show the
  // FirstRunSetup screen instead of the standard login. This handles the
  // clean-install path (no SEED_DEMO, no BOOTSTRAP_CHIEF_* env vars).
  // ⚠️ MUST stay above any early returns. Previously this useEffect lived
  // below the `if (!authReady) return <spinner />` block, which caused
  // React #310 "rendered fewer hooks than expected" the moment authReady
  // flipped from false → true (the hook count grew on the second render).
  useEffect(() => {
    if (user) return; // already logged in
    let cancelled = false;
    fetch((import.meta.env.VITE_API_URL || '') + '/api/setup-status')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setFirstRun(Boolean(data?.needsFirstRun));
      })
      .catch(() => {
        if (!cancelled) setFirstRun(false); // fall back to login on error
      });
    return () => { cancelled = true; };
  }, [user]);

  // License-activation check — per-department, POST-login. The gate now keys on
  // the authenticated user's department: the server scopes /api/license/status to
  // req.user.department_id, so each department sees its own license state. Only
  // meaningful once logged in (api.get sends the access token).
  // ⚠️ MUST stay above any early returns (see note on first-run useEffect).
  useEffect(() => {
    let cancelled = false;
    if (!user) { setLicenseActivated(null); setLicenseStatus(null); return; }
    api.get('/api/license/status')
      .then((data) => {
        if (cancelled) return;
        setLicenseStatus(data);
        setLicenseActivated(Boolean(data?.activated));
      })
      .catch(() => {
        if (cancelled) return;
        // Fail open on a transient error — don't trap a logged-in department out
        // of their own install on a network blip.
        setLicenseActivated(true);
      });
    return () => { cancelled = true; };
  }, [user]);

  // P6.3 — fetch the department's houses once on login; reset on logout.
  // Only renders the station picker in Layout when count > 1.
  useEffect(() => {
    if (!user) { setStations([]); setSelectedStation(null); return; }
    api.get('/api/stations')
      .then((data) => setStations(data?.data || []))
      .catch(() => {});
  }, [user]);

  // Show spinner while checking session
  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin h-10 w-10 rounded-full border-4 border-red-700 border-t-transparent" />
      </div>
    );
  }

  function handleLogout() {
    // Fire-and-forget: ask the server to clear the refresh cookie.
    api.post('/api/auth/logout', undefined).catch(() => {});
    // Clear the local token, then do a hard reload so React never has to render
    // the transition from "logged in" to "login screen" — avoids any render crash.
    clearToken();
    window.location.reload();
  }

  // Show first-run setup when the server has no users yet
  if (!user && firstRun === true) {
    return <FirstRunSetup onComplete={(u) => {
      setUser(u);
      setPage('portal');
      // New chief — they'll see the Department Setup Wizard next via the
      // existing localStorage-gated logic in the useEffect below.
    }} />;
  }

  // While we're still checking first-run status, render nothing (brief flash avoidance)
  if (!user && firstRun === null) return null;

  // Show login screen when not authenticated
  if (!user) return <LoginScreen onLogin={(u) => {
    setUser(u);
    setPage('portal');
    // Load preferences from localStorage immediately for instant apply
    const local = loadLocalPrefs(u.username);
    if (local) setUserPrefs(local);
    // Then sync from backend (non-blocking)
    api.get('/api/user/preferences')
      .then((res) => {
        const backendPrefs = res.data;
        if (backendPrefs && Object.keys(backendPrefs).length > 0) {
          setUserPrefs(backendPrefs);
          saveLocalPrefs(u.username, backendPrefs);
        }
      })
      .catch(() => {}); // silent fail — localStorage stays as source of truth
    // Prefetch critical data for offline rig use (non-blocking)
    import('./utils/offlineCache.js').then(({ offlineCache }) => {
      offlineCache.prefetchAll(api).then(r => {
        console.log(`Offline cache: ${r.preplans} pre-plans, ${r.hydrants} hydrants, ${r.knox} Knox boxes cached`);
      }).catch(() => {});
    });
    // Department setup wizard for the first admin/chief (not completed). The
    // per-member personal setup wizard was removed — members don't self-configure
    // their profile, and notifications are rank-derived (not a personal choice).
    if ((u.role === 'chief' || u.role === 'admin') && !localStorage.getItem('of_dept_setup_complete')
        && !sessionStorage.getItem('of_dept_setup_snooze')) { // snooze = "Finish later" this session (wizard audit 2026-07-16)
      setShowDeptSetup(true);
    }
  }} />;

  // License gate — POST-login, per the authenticated user's department. Runs only
  // after a user is present, so /api/license/status resolves THIS department's
  // license. Fails open on a transient error (set in the effect above).
  if (licenseActivated === null) return null; // still checking this department's license
  if (licenseActivated === false) {
    return <LicenseActivation user={user} onActivated={(status) => {
      setLicenseStatus(status);
      setLicenseActivated(true);
    }} />;
  }

  // Guard navigation — redirect to The Board if role lacks access.
  // Accepts an optional second arg: { highlightId } — passed through to the
  // target component so it can auto-expand a specific bulletin post.
  function handleNavigate(id, opts = {}) {
    if (canAccess(user, id) && isModuleEnabled(id)) setPage(id);
    else setPage(isUnitSession(user) ? 'command' : 'calendar');
    setBulletinHighlight(opts.highlightId ?? null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return (
    <ActivityProvider>
    <>
    {/* ── Department Setup Wizard (first-time admin setup) ────────────────── */}
    {showDeptSetup && (
      <Suspense fallback={null}>
        <DepartmentSetupWizard onComplete={() => setShowDeptSetup(false)} />
      </Suspense>
    )}

    {/* Personal Setup Wizard REMOVED — a member never self-enters profile data.
        All profile/cert/rank information is entered and verified by the chief/BC,
        and notifications are determined by rank (not a per-member choice), so
        there is nothing for an individual member to set up. */}

    {/* ── Incoming CAD Call Banner ─────────────────────────────────────────── */}
    {cadAlert && cadAlert.id !== cadAlertDismissed && page !== 'command' && (
      <div className="fixed top-0 inset-x-0 z-[100] bg-red-700 text-white px-4 py-3 flex items-center gap-3 shadow-xl animate-pulse">
        {/* lucide + measured green, matching the two incident banners this one
            drops on top of. This banner renders OVER every module-2 surface, so
            leaving it emoji while the banners beside it are icons is the exact
            inconsistency the pass exists to remove. */}
        <Siren size={20} className="shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black truncate">{cadAlert.description}</p>
          <p className="text-xs text-red-100 truncate">{cadAlert.address}{cadAlert.units ? ` · ${cadAlert.units}` : ''}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRespondingTo({
              id: cadAlert.id,
              type: cadAlert.description || 'Unknown',
              address: cadAlert.address || '',
              units: cadAlert.units || '',
              dispatched_at: cadAlert.dispatched_at || new Date().toISOString(),
            });
            setCadAlertDismissed(cadAlert.id);
            setCadAlert(null);
          }}
          className="shrink-0 inline-flex items-center gap-1.5 bg-green-700 text-white font-black text-xs px-3 py-1.5 rounded-xl hover:bg-green-800"
        >
          <Truck size={14} aria-hidden="true" /> I&apos;m Responding
        </button>
        <button
          type="button"
          onClick={() => {
            setPendingCADAlert(cadAlert);
            setCadAlertDismissed(cadAlert.id);
            setCadAlert(null);
            setPage('command');
          }}
          className="flex-shrink-0 bg-white text-red-700 font-black text-xs px-3 py-1.5 rounded-xl hover:bg-red-50"
        >
          Launch Board →
        </button>
        <button
          type="button"
          onClick={() => { setCadAlertDismissed(cadAlert.id); setCadAlert(null); }}
          className="flex-shrink-0 text-red-200 hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>
    )}
    <Layout activePage={page} onNavigate={handleNavigate} settings={settings} alertCount={alertCount}
            user={user} onLogout={handleLogout}
            unreadMessageCount={unreadMessageCount}
            userPrefs={userPrefs} onPrefsChange={(p) => { setUserPrefs(p); saveLocalPrefs(user.username, p); }}
            stations={stations} selectedStation={selectedStation} onStationChange={setSelectedStation}>
      <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full" /></div>}>
      {page === 'dashboard'  && <Dashboard onNavigate={setPage} settings={settings} prefs={userPrefs} onRespond={setRespondingTo} user={user} selectedStation={selectedStation} unreadMessageCount={unreadMessageCount} />}
      {page === 'roster'      && <MemberRoster selectedStation={selectedStation} />}
      {page === 'recruitment' && <RecruitmentTracker user={user} />}
      {page === 'apparatus'  && <ApparatusTracker selectedStation={selectedStation} />}
      {page === 'schedule'   && <DutySchedule />}
      {page === 'incidents'  && <IncidentLog />}
      {page === 'ai'         && <AIScheduler />}
      {page === 'training'   && <TrainingRecords />}
      {page === 'training-modules'     && <TrainingModules onLaunch={(mod) => setActiveModule(mod)} />}
      {page === 'training-compliance'  && <TrainingCompliance />}
      {page === 'mutualaid'  && <MutualAidTracker />}
      {page === 'assets'     && <AssetInventory />}
      {page === 'reports'    && <ReportsExport settings={settings} />}
      {page === 'reconciliation' && <Reconciliation />}
      {page === 'alerts'     && <NotificationsCenter onNavigate={handleNavigate} user={user} unreadMessageCount={unreadMessageCount} />}
      {page === 'messages'   && <MessagesInbox user={user} onUnreadChange={setUnreadMessageCount} />}
      {page === 'settings'   && <StationSettings onSettingsChange={setSettings} />}
      {page === 'hours'      && <VolunteerHours />}
      {page === 'portal'     && <MyPortal user={user} onNavigate={handleNavigate} unreadMessageCount={unreadMessageCount} />}
      {page === 'calendar'   && <EventCalendar highlightBulletinId={bulletinHighlight} onHighlightConsumed={() => setBulletinHighlight(null)} selectedStation={selectedStation} stations={stations} onStationChange={setSelectedStation} />}
      {page === 'preplans'   && <PreIncidentPlans onNavigate={handleNavigate} />}
      {page === 'checklists'  && <ApparatusChecks />}
      {page === 'maintenance' && <WorkOrders />}
      {page === 'narcotics'   && <Narcotics currentUser={user} />}
      {page === 'sogs'        && <SOGLibrary />}
      {page === 'public'      && <PublicDashboard />}
      {page === 'budget'      && <BudgetTracker />}
      {page === 'wellness'    && <WellnessTracker />}
      {page === 'nfirs'       && <NFIRSReports />}
      {page === 'inspections' && <FireInspections />}
      {page === 'prevention-center' && <Prevention user={user} />}
      {page === 'preplan-wizard' && <PrePlanWizard />}
      {page === 'hydrants'    && <HydrantTracker />}
      {page === 'drills'      && <DrillManager />}
      {page === 'stationlog'  && <StationLog />}
      {page === 'grants'      && <GrantManager />}
      {page === 'crr'         && <CommunityRisk />}
      {page === 'cad'         && <CADIntegration onNavigate={setPage} currentUser={user} />}
      {page === 'avl'         && <AvlSettings />}
      {page === 'fireinvestigation' && <FireInvestigation />}
      {page === 'dataimport'        && <DataImport stations={stations} selectedStation={selectedStation} />}
      {page === 'data-ingest'       && <DataIngestAI />}
      {page === 'scba'              && <AssetTesting />}
      {page === 'payroll'           && <PayrollTracker />}
      {page === 'hazmat'            && <HazmatReference />}
      {page === 'command'           && <CommandBoard onNavigate={setPage} initialAlert={pendingCADAlert} onAlertConsumed={() => setPendingCADAlert(null)} autoActivate={autoActivate} onAutoActivated={() => setAutoActivate(false)} currentUser={user} settings={settings} onRespond={setRespondingTo} dispatches={dispatches} onClearBadge={() => setLatestDispatch(null)} onAddDispatch={(d) => setDispatches(prev => [d, ...prev].slice(0, 100))} onCallCleared={(id) => setDispatches(prev => prev.filter(d => d.id !== id))} onCallReopened={(d) => setDispatches(prev => prev.some(x => x.id === d.id) ? prev : [d, ...prev].slice(0, 100))} selectedStation={selectedStation} />}
      {page === 'recall'            && <RecallSystem user={user} />}
      {page === 'radio-log'         && <RadioLog />}
      {page === 'bulletins'           && <BulletinBoard user={user} highlightId={bulletinHighlight} onHighlightConsumed={() => setBulletinHighlight(null)} />}
      {page === 'fundraising'         && <FundraisingTracker user={user} />}
      {page === 'community-outreach'  && <CommunityOutreach />}
      {page === 'cadets'              && <CadetProgram user={user} />}
      {page === 'analytics'           && <ResponseAnalytics />}
      {page === 'flsa'                 && <FLSADashboard />}
      {page === 'qualifications'       && <QualificationsManager />}
      {page === 'assignboard'          && <ApparatusAssignmentBoard onNavigate={setPage} selectedStation={selectedStation} stations={stations} currentUser={user} />}
      {page === 'retention'           && <RetentionScoring />}
      {page === 'ot-equalization'      && <OTEqualizationBoard />}
      {page === 'personnel-actions'    && <PersonnelActions />}
      {page === 'exposure-tracking'    && <ExposureTracking />}
      {page === 'shift-trades'         && <ShiftTradeManager />}
      {page === 'daily-staffing'       && <DailyStaffingBoard />}
      {page === 'apparatus-oos'        && <ApparatusOOSTracker />}
      {page === 'timesheets'           && <TimesheetExport />}
      {page === 'grievances'           && <GrievanceTracker />}
      {page === 'after-action'         && <AfterActionReports />}
      {page === 'aid-agreements'       && <MutualAidAgreements />}
      {page === 'training-plans'       && <TrainingPlans />}
      {page === 'doc-vault'            && <DocumentVault />}
      {page === 'meeting-minutes'      && <MeetingMinutes />}
      {page === 'policy-acks'          && <PolicyAcknowledgments user={user} />}
      {page === 'equipment-checkout'   && <EquipmentCheckout />}
      {page === 'knox-keys'            && <KnoxKeyManagement user={user} />}
      {page === 'incident-costs'       && <IncidentCostTracker />}
      {page === 'incident-map'        && <IncidentMap onNavigate={handleNavigate} />}
      {page === 'dispatch-archive'    && <DispatchArchive />}
      {page === 'commander-cam'      && <CommanderCam incident={null} />}
      {page === 'vacancy-fill'       && <VacancyFill user={user} />}
      {page === 'ng911'              && <NG911Console />}
      {page === 'fto-tracker'        && <FTOTracker user={user} />}
      {page === 'activity-general'   && <ActivityLogger key="activity-general"   user={user} defaultCategory="general" />}
      {page === 'activity-station'   && <ActivityLogger key="activity-station"   user={user} defaultCategory="station" />}
      {page === 'activity-unit'      && <ActivityLogger key="activity-unit"      user={user} defaultCategory="unit" />}
      {page === 'activity-equipment' && <ActivityLogger key="activity-equipment" user={user} defaultCategory="equipment-checks" />}
      {page === 'activity-training'  && <ActivityLogger key="activity-training"  user={user} defaultCategory="training" />}
      {page === 'incident-intel'       && <IncidentIntelligence />}
      {page === 'training-ai'          && <TrainingRecommender />}
      {page === 'report-writer'        && <ReportWriter />}
      {page === 'preplan-ai'           && <PrePlanAI />}
      {page === 'staffing-ai'          && <StaffingPredictor />}
      {page === 'email-ingest'         && <EmailIngest />}
      {page === 'training-catalog'     && <TrainingCatalog />}
      {page === 'my-training'          && <MyTraining user={user} />}
      {page === 'todays-crew'          && <TodaysCrew />}
      {page === 'db-admin'             && <DatabaseAdmin />}
      {page === 'workflows'            && <WorkflowPanel />}
      {page === 'live-dispatch'        && (() => { setTimeout(() => setPage('command'), 0); return null; })()}
      {/* P1-1 (2026-07-16): the removed legacy mockup pages redirect to the REAL feature
          (Prevention Center) instead of rendering a blank content area for a stale link. */}
      {/* The retired-id redirect that used to live here is GONE — see RETIRED_ROUTES at the top
          of this file. It resolved `page`, but nothing could ever set `page` to a retired id, so
          it never ran. Resolution now happens in getInitialPage and the hashchange handler,
          BEFORE the renderable-pages gate, which is the only place it can work. Also: it called
          setTimeout(setState) from inside render, which is a side effect during render. */}
      </Suspense>

      </Layout>

    {/* ── Live Incident Response overlay ────────────────────────────────────── */}
    {respondingTo && (
      <IncidentResponse
        incident={respondingTo}
        user={user}
        settings={settings}
        onClose={() => setRespondingTo(null)}
      />
    )}

    {/* ── Module Player overlay ────────────────────────────────────────────── */}
    {activeModule && (
      <ModulePlayer
        module={activeModule}
        onClose={() => setActiveModule(null)}
        onCompleted={() => setActiveModule(null)}
      />
    )}

    {/* ── Real-time Dispatch Notification popup ────────────────────────────── */}
    <DispatchNotification
      dispatch={latestDispatch}
      matchedPrePlan={matchedPrePlan}
      onDismiss={() => { setLatestDispatch(null); setMatchedPrePlan(null); }}
      onView={() => { setLatestDispatch(null); handleNavigate('command'); }}
      onViewPrePlan={() => { setLatestDispatch(null); handleNavigate('preplans'); }}
    />

    {/* ── Global fire-service dictation widget ────────────────────────────── */}
    <Suspense fallback={null}>
      <DictationWidget />
    </Suspense>

    {/* ── AI Assistant floating widget ─────────────────────────────────────── */}
    <Suspense fallback={null}>
      <AssistantWidget
        user={user}
        activePage={page}
        onNavigate={handleNavigate}
      />
    </Suspense>
    </>
    </ActivityProvider>
  );
}
