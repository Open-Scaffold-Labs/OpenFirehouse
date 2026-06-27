import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import LoginScreen from './components/LoginScreen';
import FirstRunSetup from './components/FirstRunSetup';
import LicenseActivation from './components/LicenseActivation';
import DispatchNotification from './components/DispatchNotification';
import { canAccess, isUnitSession } from './data/auth';
import { ActivityProvider } from './context/ActivityContext';

// ── Eagerly loaded: pages shown on first render ──
import Dashboard from './components/Dashboard';

// ── Lazy loaded: every other page loads on demand ──
const MemberRoster = lazy(() => import('./components/MemberRoster'));
const ApparatusTracker = lazy(() => import('./components/ApparatusTracker'));
const DutySchedule = lazy(() => import('./components/DutySchedule'));
const IncidentLog = lazy(() => import('./components/IncidentLog'));
const AIScheduler = lazy(() => import('./components/AIScheduler'));
const TrainingRecords = lazy(() => import('./components/TrainingRecords'));
const TrainingModules = lazy(() => import('./components/TrainingModules'));
const TrainingCompliance = lazy(() => import('./components/TrainingCompliance'));
const ModulePlayer = lazy(() => import('./components/ModulePlayer'));
const MutualAidTracker = lazy(() => import('./components/MutualAidTracker'));
const AssetInventory = lazy(() => import('./components/AssetInventory'));
const ReportsExport = lazy(() => import('./components/ReportsExport'));
const NotificationsCenter = lazy(() => import('./components/NotificationsCenter'));
const StationSettings = lazy(() => import('./components/StationSettings'));
const VolunteerHours = lazy(() => import('./components/VolunteerHours'));
const MemberPortal = lazy(() => import('./components/MemberPortal'));
const MyPortal = lazy(() => import('./components/MyPortal'));
const EventCalendar = lazy(() => import('./components/EventCalendar'));
const PreIncidentPlans = lazy(() => import('./components/PreIncidentPlans'));
const InspectionChecklists = lazy(() => import('./components/InspectionChecklists'));
const MaintenanceLog = lazy(() => import('./components/MaintenanceLog'));
const SOGLibrary = lazy(() => import('./components/SOGLibrary'));
const PublicDashboard = lazy(() => import('./components/PublicDashboard'));
const BudgetTracker = lazy(() => import('./components/BudgetTracker'));
const WellnessTracker = lazy(() => import('./components/WellnessTracker'));
const NFIRSReports = lazy(() => import('./components/NFIRSReports'));
const FireInspections = lazy(() => import('./components/FireInspections'));
const InspectionSearch = lazy(() => import('./components/InspectionSearch'));
const InspectionEntry = lazy(() => import('./components/InspectionEntry'));
const InspectionChecklist = lazy(() => import('./components/InspectionChecklist'));
const InspectorStatus = lazy(() => import('./components/InspectorStatus'));
const Violations = lazy(() => import('./components/Violations'));
const Permits = lazy(() => import('./components/Permits'));
const Registrations = lazy(() => import('./components/Registrations'));
const RegistrationSearch = lazy(() => import('./components/RegistrationSearch'));
const RegistrationEntry = lazy(() => import('./components/RegistrationEntry'));
const Complaints = lazy(() => import('./components/Complaints'));
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
const SCBATracker = lazy(() => import('./components/SCBATracker'));
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
const ISOReport = lazy(() => import('./components/ISOReport'));
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
const CommanderCam = lazy(() => import('./components/CommanderCam'));
const VacancyFill = lazy(() => import('./components/VacancyFill'));
const NG911Console = lazy(() => import('./components/NG911Console'));
const FTOTracker = lazy(() => import('./components/FTOTracker'));
const ActivityLogger = lazy(() => import('./components/ActivityLogger'));
const AvailabilityWidget = lazy(() => import('./components/AvailabilityWidget'));
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
import { useAlerts } from './hooks/useAlerts';
import { useWorkflowAlerts } from './hooks/useWorkflowAlerts';
import { useBulletinAlerts } from './hooks/useBulletinAlerts';
import { api, setToken, clearToken, onAuthFailure, getStoredUser, getToken } from './utils/api';
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

// Read ?page= deep-link from URL (used by push notification clicks)
function getInitialPage() {
  try {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('page');
    if (p) return p;
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
    const channel = topic
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
  const seenDispatchIdsRef = useRef(new Set());   // alert ids already processed (don't re-banner)
  useEffect(() => { cadAlertDismissedRef.current = cadAlertDismissed; }, [cadAlertDismissed]);

  // live badge count — user-filtered cert alerts + workflow alerts + unread bulletins/notices
  const { alerts: wfAlerts } = useWorkflowAlerts();
  const { unreadCount: unreadBulletinCount } = useBulletinAlerts();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  // Live, server-scoped department alerts (rank + crew applied server-side).
  const { alerts: liveAlerts } = useAlerts(user);
  const alertCount = liveAlerts.filter((a) => a.severity !== 'info').length
    + wfAlerts.filter((a) => a.severity !== 'info').length
    + unreadBulletinCount
    + unreadMessageCount;

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
    if ((user.role === 'chief' || user.role === 'admin') && !localStorage.getItem('of_dept_setup_complete')) {
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
        setLatestDispatch(newest); // slide-in "new dispatch" toast
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
    const channel = topic
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
    if ((u.role === 'chief' || u.role === 'admin') && !localStorage.getItem('of_dept_setup_complete')) {
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
    if (canAccess(user, id)) setPage(id);
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
        <span className="text-lg flex-shrink-0">🚨</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black truncate">{cadAlert.description}</p>
          <p className="text-xs text-red-200 truncate">{cadAlert.address}{cadAlert.units ? ` · ${cadAlert.units}` : ''}</p>
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
          className="flex-shrink-0 bg-green-500 text-white font-black text-xs px-3 py-1.5 rounded-xl hover:bg-green-400 animate-pulse"
        >
          I'm Responding 🚒
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
      {page === 'dashboard'  && <Dashboard onNavigate={setPage} settings={settings} prefs={userPrefs} onRespond={setRespondingTo} user={user} selectedStation={selectedStation} />}
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
      {page === 'alerts'     && <NotificationsCenter onNavigate={handleNavigate} user={user} />}
      {page === 'messages'   && <MessagesInbox user={user} onUnreadChange={setUnreadMessageCount} />}
      {page === 'settings'   && <StationSettings onSettingsChange={setSettings} />}
      {page === 'hours'      && <VolunteerHours />}
      {page === 'portal'     && <MyPortal user={user} onNavigate={handleNavigate} />}
      {page === 'calendar'   && <EventCalendar highlightBulletinId={bulletinHighlight} onHighlightConsumed={() => setBulletinHighlight(null)} />}
      {page === 'preplans'   && <PreIncidentPlans onNavigate={handleNavigate} />}
      {page === 'checklists'  && <InspectionChecklists />}
      {page === 'maintenance' && <MaintenanceLog />}
      {page === 'sogs'        && <SOGLibrary />}
      {page === 'public'      && <PublicDashboard />}
      {page === 'budget'      && <BudgetTracker />}
      {page === 'wellness'    && <WellnessTracker />}
      {page === 'nfirs'       && <NFIRSReports />}
      {page === 'inspections' && <FireInspections />}
      {page === 'inspection-search' && <InspectionSearch />}
      {page === 'inspection-entry' && <InspectionEntry />}
      {page === 'inspection-checklist' && <InspectionChecklist />}
      {page === 'inspector-status' && <InspectorStatus />}
      {page === 'violations' && <Violations />}
      {page === 'permits' && <Permits />}
      {page === 'registrations' && <Registrations />}
      {page === 'registration-search' && <RegistrationSearch />}
      {page === 'registration-entry' && <RegistrationEntry />}
      {page === 'complaints' && <Complaints />}
      {page === 'preplan-wizard' && <PrePlanWizard />}
      {page === 'hydrants'    && <HydrantTracker />}
      {page === 'drills'      && <DrillManager />}
      {page === 'stationlog'  && <StationLog />}
      {page === 'grants'      && <GrantManager />}
      {page === 'crr'         && <CommunityRisk />}
      {page === 'cad'         && <CADIntegration onNavigate={setPage} />}
      {page === 'avl'         && <AvlSettings />}
      {page === 'fireinvestigation' && <FireInvestigation />}
      {page === 'dataimport'        && <DataImport />}
      {page === 'data-ingest'       && <DataIngestAI />}
      {page === 'scba'              && <SCBATracker />}
      {page === 'payroll'           && <PayrollTracker />}
      {page === 'hazmat'            && <HazmatReference />}
      {page === 'command'           && <CommandBoard onNavigate={setPage} initialAlert={pendingCADAlert} onAlertConsumed={() => setPendingCADAlert(null)} autoActivate={autoActivate} onAutoActivated={() => setAutoActivate(false)} currentUser={user} settings={settings} onRespond={setRespondingTo} dispatches={dispatches} onClearBadge={() => setLatestDispatch(null)} onAddDispatch={(d) => setDispatches(prev => [d, ...prev].slice(0, 100))} selectedStation={selectedStation} />}
      {page === 'recall'            && <RecallSystem user={user} />}
      {page === 'radio-log'         && <RadioLog />}
      {page === 'bulletins'           && <BulletinBoard user={user} highlightId={bulletinHighlight} onHighlightConsumed={() => setBulletinHighlight(null)} />}
      {page === 'fundraising'         && <FundraisingTracker user={user} />}
      {page === 'community-outreach'  && <CommunityOutreach />}
      {page === 'cadets'              && <CadetProgram user={user} />}
      {page === 'analytics'           && <ResponseAnalytics />}
      {page === 'iso'                  && <ISOReport />}
      {page === 'flsa'                 && <FLSADashboard />}
      {page === 'qualifications'       && <QualificationsManager />}
      {page === 'assignboard'          && <ApparatusAssignmentBoard onNavigate={setPage} />}
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
