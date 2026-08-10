import { useState, useEffect } from 'react';
import { Shield, LogIn, Eye, EyeOff, ChevronRight, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { ROLES } from '../data/auth';
import { api, setToken } from '../utils/api';
import { version as APP_VERSION } from '../../package.json';

// Initials are DERIVED from the name, never hand-maintained. They used to be a
// literal field, and it had silently drifted: Sarah Chen's avatar read "DR" — the
// wrong initials, on the first row of the first screen a fire chief ever sees.
// A duplicated fact is a fact that can disagree with itself.
function initialsFor(name) {
  const words = String(name || '').split(/[\s/]+/).filter((w) => /[a-z]/i.test(w));
  if (!words.length) return '—';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : (words[0][1] || '');
  return (first + last).toUpperCase();
}

const DEMO_USERS = [
  {
    username: 'chief',
    name: 'Sarah Chen',
    title: 'Fire Chief',
    role: 'chief',
    highlights: ['Full dashboard', 'LOSAP compliance', 'Budget & reports'],
  },
  {
    username: 'officer',
    name: 'Maria Delgado',
    title: 'Captain · Training Officer',
    role: 'officer',
    highlights: ['Incident command', 'Scheduling', 'Pre-incident plans'],
  },
  {
    username: 'bchief',
    name: 'B/C Simmons',
    title: 'Battalion Chief',
    role: 'battalion_chief',
    highlights: ['Command board access', 'Unit & PAR tracking', 'Incident command'],
  },
  {
    username: 'dispatch',
    name: 'Dispatch Center',
    title: 'Dispatcher',
    role: 'dispatch',
    highlights: ['Manage active incidents', 'Update command board', 'Log units & personnel'],
  },
  {
    username: 'member',
    name: 'Nathan McGee',
    title: 'Firefighter I',
    role: 'member',
    highlights: ['Training & certs', 'Incident log', 'My schedule'],
  },
];

const ONBOARDING_KEY = 'of_onboarding_done';

function getOnboardingState() {
  try { return JSON.parse(localStorage.getItem(ONBOARDING_KEY) || '{}'); }
  catch (_) { return {}; }
}
function clearOnboardingForUser(username) {
  const s = getOnboardingState();
  delete s[username];
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(s));
}
function clearAllOnboarding() {
  localStorage.removeItem(ONBOARDING_KEY);
}

// ─── Quick-login role card ─────────────────────────────────────────────────────

function RoleCard({ user, onQuickLogin, loading, onboardingDone, onResetOnboarding }) {
  const role = ROLES[user.role];
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-red-300 dark:hover:border-red-500/60 transition-all group">
      <button
        onClick={() => onQuickLogin(user.username)}
        disabled={loading}
        className="w-full flex items-center gap-4 p-4 text-left disabled:opacity-60"
      >
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm ${role.bg} ${role.color}`}>
          {initialsFor(user.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 group-hover:text-red-700 dark:group-hover:text-red-400 transition-colors">
              {user.name}
            </p>
            {/* Amber, not green: this badge means "setup not done yet". Green reads
                as complete, which is the opposite of what it is telling you. */}
            {!onboardingDone && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200">
                <Sparkles size={10} /> First-time setup
              </span>
            )}
          </div>
          {/* The role pill on the right already states the rank, so the left column
              carries the ASSIGNMENT, not a second copy of the title. */}
          {user.title !== role.label && (
            <p className="text-xs text-gray-600 dark:text-gray-300">{user.title}</p>
          )}
          {/* gray-400 here was ~2.8:1 on white — the unreadable line. */}
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{user.highlights.join(' · ')}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${role.bg} ${role.color}`}>
            {role.label}
          </span>
          <ChevronRight size={14} className="text-gray-400 dark:text-gray-500 group-hover:text-red-500 transition-colors" />
        </div>
      </button>

      {/* onboarding reset row — only shown when already completed */}
      {onboardingDone && (
        <div className="flex items-center justify-between px-4 pb-3 -mt-1">
          <span className="text-xs text-gray-600 dark:text-gray-400">Setup wizard already completed</span>
          <button
            onClick={(e) => { e.stopPropagation(); onResetOnboarding(user.username); }}
            className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors"
            title="Re-run first-time setup on next login"
          >
            <RotateCcw size={11} /> Reset setup
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

export default function LoginScreen({ onLogin }) {
  // ── ONLY ADVERTISE CREDENTIALS THAT EXIST ────────────────────────────────
  // The quick-login role cards, the "1234" placeholder and the printed demo
  // credential line used to render UNCONDITIONALLY. But the demo accounts they
  // name are seeded only when SEED_DEMO=true (db.js DEMO_LABELS) — so a real
  // department that deployed correctly (SEED_DEMO unset, BOOTSTRAP_CHIEF_* used
  // for their real chief) saw a login page offering one-click sign-in for
  // accounts their database does not contain. That is the first screen a fire
  // chief ever sees.
  //
  // The client cannot infer this — only the server knows its seed config — so
  // /api/setup-status reports it. Starts NULL and FAILS CLOSED: until the server
  // confirms demo mode we render the plain username/password form, so a slow or
  // failed request can never flash demo credentials onto a real department's
  // screen. `null` (unknown) and `false` (not demo) deliberately behave alike.
  const [demoMode, setDemoMode] = useState(null);
  const [mode,     setMode]     = useState('form');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [onboardingState, setOnboardingState] = useState(() => getOnboardingState());
  // 0111 — non-null while a second factor is outstanding. Holding the challenge
  // token in state (never in storage) keeps it exactly as long as the prompt.
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaCode,  setMfaCode]  = useState('');

  // Ask the server whether this deployment is demo-seeded. Public endpoint, no
  // auth (it already backs first-run bootstrap). On any failure we stay in the
  // fail-closed state above — never optimistically show demo affordances.
  useEffect(() => {
    let cancelled = false;
    fetch((import.meta.env.VITE_API_URL || '') + '/api/setup-status')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const isDemo = d?.demoMode === true;
        setDemoMode(isDemo);
        if (isDemo) setMode('quick');   // demo deployments keep the fast path
      })
      .catch(() => { if (!cancelled) setDemoMode(false); });
    return () => { cancelled = true; };
  }, []);

  function handleResetOnboarding(u) {
    clearOnboardingForUser(u);
    setOnboardingState(getOnboardingState());
  }

  async function doLogin(u, p) {
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/api/auth/login', { username: u, password: p });
      // 0111 — this account has a second factor. The server issued NO session,
      // only a short-lived challenge; hold it and ask for the code.
      if (data.mfaRequired) {
        setMfaToken(data.mfaToken);
        setMfaCode('');
        return;
      }
      setToken(data.token, data.user);
      onLogin(data.user);
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  }

  // 0111 — exchange the challenge + code for a real session.
  async function submitMfa(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/api/auth/mfa', { mfaToken, code: mfaCode.trim() });
      setToken(data.token, data.user);
      if (data.usedRecoveryCode) {
        // Not an error, but the member needs to know a one-time code is now spent.
        console.warn(`Recovery code used. ${data.recoveryCodesRemaining ?? 0} remaining.`);
      }
      onLogin(data.user);
    } catch (err) {
      // The challenge expiring is a restart, not a bad code — say which.
      if (err?.code === 'MFA_CHALLENGE_EXPIRED') {
        setMfaToken(null);
        setError('That sign-in attempt timed out. Please sign in again.');
      } else {
        setError(err.message || 'That code is not right.');
      }
    } finally {
      setLoading(false);
    }
  }

  function cancelMfa() {
    setMfaToken(null);
    setMfaCode('');
    setError('');
  }

  function handleFormLogin(e) {
    e.preventDefault();
    doLogin(username.trim(), password);
  }

  function handleQuickLogin(u) {
    doLogin(u, '1234');
  }

  // items-start, not items-center: with five role cards the list is taller than a
  // laptop viewport, and centering pushed the last role below the fold with no
  // scroll cue. Start-aligned it simply scrolls.
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-red-950 flex items-start justify-center p-4 py-10 sm:py-14">
      {/* The role list needs more measure than a password form does: at max-w-md the
          three-item highlight line wrapped mid-phrase ("Pre-/incident plans") while
          ~470px of viewport sat empty either side. Widen only for the card list; a
          credentials form stays at form width, where it belongs. */}
      <div className={`w-full space-y-6 ${mode === 'quick' && demoMode && !mfaToken ? 'max-w-2xl' : 'max-w-md'}`}>

        {/* Logo / branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-red-700 shadow-2xl mx-auto">
            <Shield size={36} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight"><span className="text-white">OPEN</span><span className="text-red-300">FIREHOUSE</span></h1>
            <p className="text-red-300 text-sm mt-1">Volunteer Fire Department Management</p>
          </div>
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-gray-300 font-medium">Station 14 · Maplewood VFD</span>
          </div>
        </div>

        {/* 0111 — second factor. Replaces the whole sign-in body while pending,
            so there is no way to "skip" past it in the UI. The server refuses a
            pending challenge on every other route regardless. */}
        {mfaToken ? (
          <form onSubmit={submitMfa} className="bg-white/10 backdrop-blur rounded-2xl p-6 space-y-4">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-white">Enter your code</h2>
              <p className="text-sm text-gray-300">
                Open your authenticator app and enter the 6-digit code for OpenFirehouse.
              </p>
            </div>

            <div>
              <label htmlFor="mfa-code" className="sr-only">Authentication code</label>
              <input
                id="mfa-code"
                data-testid="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="000000"
                className="w-full text-center tracking-[0.4em] text-2xl font-mono px-4 py-3 rounded-xl bg-white/90 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-[11px] text-gray-400 mt-2 text-center">
                Lost your phone? Enter one of your recovery codes instead.
              </p>
            </div>

            {error && (
              <div data-testid="mfa-error" className="text-sm text-red-300 bg-red-950/50 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              data-testid="mfa-submit"
              disabled={loading || mfaCode.trim().length < 6}
              className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold disabled:opacity-50"
            >
              {loading ? 'Checking…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={cancelMfa}
              className="w-full py-2 text-sm text-gray-300 hover:text-white"
            >
              Cancel and start over
            </button>
          </form>
        ) : (
        <>
        {/* Mode toggle — demo deployments only. A real department has exactly
            one way in (their own credentials), so the toggle is not just
            useless there, it points at a door that isn't in the building. */}
        {demoMode === true && (
        <div className="flex gap-1 bg-white/10 rounded-xl p-1">
          <button
            data-testid="login-mode-quick"
            onClick={() => setMode('quick')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              mode === 'quick' ? 'bg-white text-gray-900 shadow' : 'text-gray-300 hover:text-white'
            }`}
          >
            Quick Demo Login
          </button>
          <button
            data-testid="login-mode-form"
            onClick={() => setMode('form')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              mode === 'form' ? 'bg-white text-gray-900 shadow' : 'text-gray-300 hover:text-white'
            }`}
          >
            Username / Password
          </button>
        </div>
        )}

        {/* Quick login panel — guarded on demoMode too, not just `mode`, so it
            can never render from stale state on a non-demo deployment. */}
        {demoMode === true && mode === 'quick' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-300">
                Select a role to log in — a <span className="text-amber-300 font-medium">First-time setup</span> badge means that role still has its setup wizard to run
              </p>
              <button
                onClick={() => { clearAllOnboarding(); setOnboardingState({}); }}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                title="Reset all onboarding to re-run setup for all users"
              >
                <RotateCcw size={11} /> Reset all
              </button>
            </div>
            {error && <p className="text-xs text-red-400 text-center font-medium">{error}</p>}
            {DEMO_USERS.map((user) => (
              <RoleCard
                key={user.username}
                user={user}
                onQuickLogin={handleQuickLogin}
                loading={loading}
                onboardingDone={!!onboardingState[user.username]}
                onResetOnboarding={handleResetOnboarding}
              />
            ))}
            {loading && (
              <div className="flex justify-center">
                <Loader2 size={20} className="text-white animate-spin" />
              </div>
            )}
          </div>
        )}

        {/* Form login panel */}
        {mode === 'form' && (
          <form onSubmit={handleFormLogin} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Sign In</h2>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Username</label>
              <input
                type="text"
                autoComplete="username"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100"
                data-testid="login-username"
                placeholder={demoMode === true ? 'chief · officer · member' : 'Username'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100"
                  data-testid="login-password"
                  placeholder={demoMode === true ? '1234 for all demo accounts' : 'Password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
            )}

            <button
              type="submit"
              data-testid="login-submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-red-700 rounded-xl hover:bg-red-800 transition-colors shadow-sm disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              Sign In
            </button>

            {demoMode === true && (
              <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-400 text-center">
                  Demo credentials · <span className="font-mono">chief</span> / <span className="font-mono">officer</span> / <span className="font-mono">member</span> · password: <span className="font-mono">1234</span>
                </p>
              </div>
            )}
          </form>
        )}
        </>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          <span className="font-semibold"><span className="text-gray-600 dark:text-gray-300">OPEN</span><span className="text-red-400">FIREHOUSE</span></span> v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
