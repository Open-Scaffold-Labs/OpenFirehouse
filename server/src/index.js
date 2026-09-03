/**
 * Open Firehouse API Server — Phase 4
 *
 * PostgreSQL database via the pg driver.
 * DATABASE_URL environment variable required.
 */

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const compression  = require('compression');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const db           = require('./db');

const app  = express();
const PORT = process.env.PORT || 3005;

// Behind Vercel/any proxy: trust the first hop so req.ip (used by the rate
// limiter) reflects the real client, not the proxy.
app.set('trust proxy', 1);

// ── Security headers (helmet) ────────────────────────────────────────────────
// CSP is disabled because this server also serves the built client, which
// loads Apple MapKit JS from Apple's CDN and inline Vite chunks; a default
// CSP would break the live dispatch maps. All other helmet protections apply.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// ── Rate limiting ────────────────────────────────────────────────────────────
// Per-instance in-memory limits (serverless = per warm instance; still blocks
// brute-force bursts). Generous global ceiling; strict ceiling on auth.
// Generous ceiling: a whole station can sit behind one NAT IP, and dispatch
// clients poll — never rate-limit a firehouse during operations. This only
// exists to stop scripted abuse; auth brute-force is covered by authLimiter.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  // Demo/CI instances (OPENFIREHOUSE_DEMO=true) authenticate many times from a
  // SINGLE IP — the E2E suite logs in per worker and every page load fires
  // /api/auth/refresh, and a handful of people clicking the live demo at once do
  // the same — which trips this 30/15min brute-force guard (429) even though a
  // demo instance is not a brute-force target. Skip it there. PROD NEVER SETS
  // OPENFIREHOUSE_DEMO, so production keeps full brute-force protection unchanged.
  // (E2E 429 fix, 2026-07-14.)
  skip: () => String(process.env.OPENFIREHOUSE_DEMO || '').trim().toLowerCase() === 'true',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
});
app.use('/api/', apiLimiter);

// ── Compression (gzip all responses ≥1 kB) ──────────────────────────────────
app.use(compression());

// CLIENT_ORIGIN accepts a comma-separated list of allowed origins, or '*' for any.
// Defaults to the known Vercel URL + localhost so the app works without env var config.
// Override in Vercel environment variables: CLIENT_ORIGIN=https://your-custom-domain.com
// W3.6 (roadmap 4.10): default origin list now names the REAL app domains
// (prod custom domain + vercel alias + localhost dev) instead of only the
// legacy separate-client domain. Same-origin requests never hit CORS at all —
// this list only matters for genuinely cross-origin callers.
const rawOrigin = process.env.CLIENT_ORIGIN
  || 'https://app.openfirehouse.openscaffoldlabs.com,https://open-firehouse.vercel.app,https://open-firehouse-client.vercel.app,http://localhost:5173,http://localhost:5174';
const corsOrigin = rawOrigin === '*' ? '*' : rawOrigin.split(',').map(s => s.trim());
// credentials:true + origin:'*' is an invalid combination (browsers refuse to
// expose the response, and offering it just masks misconfiguration) — if a
// deploy sets CLIENT_ORIGIN='*', serve open CORS WITHOUT credentials and warn.
const corsCredentials = corsOrigin !== '*';
if (!corsCredentials) {
  console.warn('[cors] CLIENT_ORIGIN="*" — serving open CORS without credentials; cookie auth (refresh) will not work cross-origin. List explicit origins to re-enable.');
}
// Explicitly list allowedHeaders so Safari (which is stricter than Chrome) passes
// the Authorization header on cross-origin requests without silently dropping it.
app.use(cors({
  origin:         corsOrigin,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    corsCredentials,
}));
// Respond to preflight OPTIONS requests immediately (before any auth middleware).
app.options('*', cors({
  origin:         corsOrigin,
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    corsCredentials,
}));
// ADR-0001: Stripe webhook needs the raw body for signature verification,
// so mount BEFORE the global express.json() parser.
app.use('/api/stripe-webhook', express.raw({ type: 'application/json', limit: '1mb' }), require('./routes/stripeWebhook'));

// The offline drain carries the SERVED notice PDF verbatim (Prevention Core P3.6,
// TRAP 1: the bytes the officer handed the owner are the legal instrument and are
// stored as-is, never re-rendered). Those bytes blow past express.json()'s 100 KB
// default, so this path gets its own parser — mounted FIRST, because the global
// parser below would otherwise reject the body before the route ever sees it. This
// only widens the parser; auth, the fi gate, and the per-op size caps all still run
// downstream (routes/fiSync.js caps a notice at 12 MB).
app.use('/api/fi-sync/batch', express.json({ limit: '20mb' }));

// 4C.2 — CAD ingest must hold the RAW bytes before anything can fail on them.
// Mounted BEFORE the global express.json() for two reasons, both proven against
// this express version rather than assumed:
//   (a) express.json() only parses when the content-type is application/json.
//       The same JSON sent as text/plain, form-urlencoded, or with no
//       content-type yields req.body === {} with a 200 and no error — and every
//       CAD adapter reads `req.body || {}`. routes/cad.js already notes that
//       real vendors post non-JSON content-types.
//   (b) MALFORMED JSON makes express.json() answer 400 from inside the
//       middleware chain, so handleVendorWebhook is never entered. A receipt
//       written at the top of that handler would therefore miss the unparseable
//       message that NENA i3 4.12.3.7 specifically requires be logged with its
//       raw bytes. "Persist before parse" is only true if persist happens before
//       the JSON PARSER, not before our handler.
// body-parser sets req._body once it has read the stream, so the global
// express.json() below sees the body as already parsed and skips it — the same
// mechanism the Stripe raw-body webhook above relies on.
const cadRawCapture = require('./cad/rawCapture');
app.use('/api/cad', cadRawCapture.captureBuffer, cadRawCapture.normalizeBody);

app.use(express.json());
app.use(cookieParser());

// ADR-0001: public retrieval page + checkout + sign-license endpoints
// (mounted BEFORE requireAuth — license issuance is by issuer password,
//  retrieval page is public-by-design).
app.use('/api/admin/sign-license', require('./routes/adminSignLicense'));
app.use('/api/checkout',           require('./routes/checkout'));
app.use('/api/cron/reconcile',     require('./routes/cronReconcile'));
app.use('/api/cron/retention',     require('./routes/cronRetention'));
app.use('/api/cron/report-delivery', require('./routes/cronReportDelivery'));
app.use('/api/cron/neris-sweep',   require('./routes/cronNerisSweep'));
// 3.1b — the permit expiry ladder. ⚠ Its 14:30 UTC schedule in vercel.json is a CORRECTNESS
// constraint (the UTC day must equal every US department's local day); see the route header.
app.use('/api/cron/permit-expiry', require('./routes/cronPermitExpiry'));
app.use('/api/cron/morning-brief', require('./routes/cronMorningBrief'));
// NOTE: /api/license runtime endpoints moved BEHIND requireAuth (post-login,
// per-department gating) — see the authed mount below. Only the public license
// retrieval page (/license) stays here.
app.use('/license',                require('./routes/license'));

// ── Cache headers for API reads: no-store by DEFAULT ────────────────────────
// REPLACED the old blanket `max-age=30, stale-while-revalidate=60` (2026-07-11):
// that default legally served operational data up to 90s stale — it bit the iPad
// client on /api/fi-inspections (post-sync pre-edit values) and exposed
// /api/cad/alerts' ping→refetch to cached answers. Caching is now a deliberate
// per-route decision (routes set their own header after this and win — e.g.
// streetview 24h, mapkit-token 25min). See middleware/apiCacheHeaders.js.
app.use(require('./middleware/apiCacheHeaders'));

// ── DB readiness flag — set true once initDb() resolves ─────────────────────
let dbReady = false;
let dbError = null;
let dbInitStarted = false;

// ── Build identity (computed once at module load) ───────────────────────────
// IMPORTANT: report what's ACTUALLY deployed. The old hardcoded version: '0.3.0'
// was a dead literal unrelated to package.json — useless for confirming a deploy.
// Now we surface the real package version + the Vercel-injected git commit SHA so
// /health can verify exactly what's running in prod (life-safety: you must be able
// to tell). Wrapped defensively so a missing file/env never breaks the health probe.
const BUILD_INFO = (() => {
  let version = 'unknown';
  try { version = require('../../package.json').version || version; }
  catch { try { version = require('../package.json').version || version; } catch { /* ignore */ } }
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || '';
  return {
    version,
    commit: sha ? sha.slice(0, 7) : 'local',
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  };
})();

// ── Health check (always responds — deployment platform uses this to confirm startup) ────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    db: dbReady,
    dbError: dbError ? dbError.message : null,
    version: BUILD_INFO.version,
    commit: BUILD_INFO.commit,
    branch: BUILD_INFO.branch,
    env: BUILD_INFO.env,
  });
});

// ── DB-ready gate: lazy init on first API request (serverless-safe) ─────────
// Instead of firing initDb() at module load (where the connection hangs on
// Vercel serverless freeze/thaw), we trigger it on the first real request.
app.use(async (req, res, next) => {
  if (dbReady) return next();
  if (!req.path.startsWith('/api/') || req.path === '/api/auth/login') return next();

  if (!dbInitStarted) {
    dbInitStarted = true;
    console.log('[initDb] Lazy init triggered by first request:', req.path);
    try {
      await db.ensureDb();
      dbReady = true;
      // Fire seeds in background — don't block the request. SKIPPED in enforced
      // mode (P5_TXN=on / of_app): these boot seeds run owner-only DDL/seed/refresh
      // via their OWN pool.connect() clients (which bypass the db.js DDL-skip), so
      // of_app can't perform them and a failed seed can leave a pooled connection
      // in an aborted state that a later request reuses. In enforced mode the
      // schema + reference data are owner-managed via migrations, so these are
      // unnecessary. They still run normally when connected as the owner (flag off).
      if (process.env.P5_TXN === 'on') {
        console.log('✅ DB ready — boot seeds skipped (enforced mode; owner-managed schema)');
      } else {
        console.log('✅ DB ready — running seeds in background');
        (async () => {
          await runSeeds().catch(err => console.error('runSeeds error:', err));
          await ensureHazmatReference().catch(err => console.error('ensureHazmatReference error:', err));
          await ensureBugReportsTable().catch(err => console.error('ensureBugReportsTable error:', err));
          await migratePhantomNames().catch(err => console.error('phantom name migration error:', err));
          await reconcileSequences().catch(err => console.error('reconcileSequences error:', err));
        })();
      }
      return next();
    } catch (err) {
      dbError = err;
      dbInitStarted = false; // allow retry on next request
      console.error('❌ DB initialization failed:', err.message);
      return res.status(503).json({ error: 'Database initialization failed', detail: err.message });
    }
  }

  // Init already in progress from another concurrent request — 503 with retry hint
  return res.status(503).json({ error: 'Server is starting, please retry in a few seconds.' });
});

// ── Auth routes (public) ────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, require('./routes/auth'));
// 5.7 (0113) — department-authored custom roles. Chief-only; built-ins immutable.
app.use('/api/roles',                require('./routes/roles'));
// 5.4 (Phase 5) — the customer-visible audit trail. Read-only over audit_log;
// record-level history only (the market bar), no tenant-wide or auth-event feed.
app.use('/api/audit',                require('./routes/auditTrail'));
// 0111 (Phase 5) — TOTP MFA enrolment + lifecycle. Behind authLimiter, not the
// generous apiLimiter: /confirm verifies a 6-digit code and is therefore a
// brute-force target in exactly the way the auth routes are. (The login-time
// exchange lives at /api/auth/mfa and is already covered above.)
app.use('/api/mfa', authLimiter, require('./routes/mfa'));

// ── First-run setup (public — no auth required, by design) ───────────────────
// When no users exist, a fresh clone needs a way to create the first chief
// account before anyone can log in. /api/setup-status reports whether
// bootstrap is needed; /api/setup-status/bootstrap-chief creates the first
// chief account ONLY when the users table is empty (so this is safe to
// leave wired in production — it self-disables after first use).
// `demoMode` mirrors SEED_DEMO — the SAME switch that decides whether the
// Maplewood demo accounts (chief/officer/bchief/member/dispatch, password 1234)
// are seeded at all (db.js DEMO_LABELS). The login screen reads it so it can
// only ever advertise credentials that actually exist. Without this the quick-
// login role cards, the "1234 for all demo accounts" placeholder and the printed
// credential line rendered UNCONDITIONALLY — so a real department that deployed
// correctly (SEED_DEMO unset, BOOTSTRAP_CHIEF_* used) still saw a login page
// offering one-click logins for accounts their database does not contain. First
// screen a fire chief ever sees. Reported as a fact, never inferred client-side:
// the client cannot know the server's seed configuration.
// ⚠️⚠️ THIS ENDPOINT HAS FAR MORE CONSUMERS THAN IT LOOKS. DO NOT RENAME OR DROP
// A FIELD WITHOUT UPDATING ALL OF THEM. It is not just a first-run helper — it is
// the readiness probe for most of the test estate:
//   · 20+ server test files poll it before running (checks, fieldSync, csCustody,
//     hiringEngine, workOrders, inventory, provisioningIsolation, …). They only
//     check status===200, so they tolerate shape changes.
//   · .github/workflows/e2e.yml — the CI readiness gate — RAW STRING MATCHES the
//     body for `"needsFirstRun":false`. No type system will catch a rename here.
//   · client/src/App.jsx            → needsFirstRun (first-run detection)
//   · client/src/components/LoginScreen.jsx → demoMode (may we offer quick login)
// Frozen by server/src/tests/setupStatusContract.test.js — if you change the
// shape, that test tells you, loudly, instead of CI hanging for 90s and then
// failing every journey with a misleading 401.
//
// ⚠️ ASK THE DATABASE, NOT THE ENV VAR. This was gated on SEED_DEMO first and
// that was WRONG in the one way that mattered: SEED_DEMO describes what happened
// at BOOT, not what is in the table now. db.js fast-paths on stations.seeded_at,
// so a deployment seeded once keeps its demo accounts forever even after the var
// is removed — which is exactly production's state (accounts present, SEED_DEMO
// unset). Gating on the env var therefore hid a working demo login from the
// surface prospective departments are shown. Shipped and caught live 2026-08-04.
//
// Whether to OFFER a one-click demo login is a question about whether those
// accounts EXIST. So ask that. The UI then cannot drift from reality: a real
// department's clean install has no demo rows and gets a plain sign-in form,
// while any deployment that actually carries the demo accounts keeps its fast
// path — with no env var for anyone to remember, set, or lose.
const DEMO_USERNAMES = ['chief', 'officer', 'bchief', 'member', 'dispatch'];

app.get('/api/setup-status', async (req, res) => {
  try {
    // One round trip: total users + how many of the demo set are present.
    const { rows } = await db.pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE username = ANY($1))::int AS demo
         FROM users`,
      [DEMO_USERNAMES]
    );
    const usersExist = rows[0].total > 0;
    res.json({
      usersExist,
      needsFirstRun: !usersExist,
      // Present only when the accounts are really there. SEED_DEMO is still
      // honoured so a fresh demo deploy shows the fast path on its very first
      // load, before the seed has populated anything.
      demoMode: rows[0].demo > 0 || process.env.SEED_DEMO === 'true',
    });
  } catch (e) {
    // DB not ready or users table missing — likely first-run. Fail closed on
    // demoMode: never offer credentials we could not confirm exist.
    res.json({
      usersExist: false,
      needsFirstRun: true,
      demoMode: false,
      dbError: e.message,
    });
  }
});

app.post('/api/setup-status/bootstrap-chief', express.json(), async (req, res) => {
  try {
    const { rows } = await db.pool.query('SELECT COUNT(*) AS c FROM users');
    if (parseInt(rows[0].c) > 0) {
      return res.status(409).json({ error: 'Setup already complete. Users exist; this endpoint is disabled.' });
    }
    const { username, password, name } = req.body || {};
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'username, password, and name are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const bcrypt = require('bcrypt');
    const hash = bcrypt.hashSync(password, 10);
    const initials = name.split(/\s+/).map(s => s[0] || '').join('').toUpperCase().slice(0, 4) || 'CH';
    await db.pool.query(
      `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
       VALUES ($1, $2, $3, 'chief', $4, 1)`,
      [username, name, initials, hash]
    );
    console.log(`[first-run] Created first chief account via UI: ${username} (${name})`);
    res.json({ ok: true, username, role: 'chief' });
  } catch (e) {
    console.error('[first-run] bootstrap-chief failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── CAD webhook (public — Active911 posts here, no JWT) ─────────────────────
app.use('/api/cad',  require('./routes/cad'));
app.use('/api/mapkit-token', require('./routes/mapkitToken'));
app.use('/api/streetview', require('./routes/streetview'));

// ── TV data (public — PIN-protected, no JWT, for wall-mounted displays) ─────
app.use('/api/tv-data', require('./routes/tvData'));
// Station-display PAIRING — the public redeem route (a display is unauthenticated) is
// mounted BEFORE requireAuth; the chief create/list/revoke router is mounted after (below).
app.use('/api/station-displays', authLimiter, require('./routes/stationDisplays').publicRouter);

// ── Radio ingest (public — API-key-protected, no JWT, for station SDR hardware) ─
app.use('/api/radio-ingest', require('./routes/radioIngest'));

// ── AVL ingest (public — per-dept secret, no JWT, for vehicle GPS/modem feeds) ─
// ADR-0003: hardware AVL forwards here so a rig shows on the command map
// independent of any iPad/login. Source-agnostic: normalizes into unit_locations.
app.use('/api/avl', require('./routes/avl'));

// ── iCal subscription (public — token-authenticated) ──────────────────────────
// Phones fetch this without JWT; the token IS the auth
app.use('/ical', require('./routes/ical'));

// ── Serve built React app (production) ───────────────────────────────────────
// Must come BEFORE requireAuth so the browser can load index.html and all
// static assets (JS/CSS) without needing a JWT. React Router handles client-
// side auth checks once the app is running in the browser.
const _path = require('path');
const clientDist = _path.join(__dirname, '..', '..', 'client', 'dist');
if (require('fs').existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA catch-all: any path that isn't an API route or known file returns index.html
  app.get(/^(?!\/api|\/health|\/ical|\/uploads).*$/, (req, res) => {
    res.sendFile(_path.join(clientDist, 'index.html'));
  });
}

// ── Auth middleware (protects all routes below) ──────────────────────────────
const requireAuth = require('./middleware/auth');

// ── Hazmat routes — public read-only (ERG 2024 is public domain data) ────────
// Registered BEFORE requireAuth so public consumers can
// access search, guide, material lookup, and stats without a login token.
// Mutation endpoints (POST/PUT incidents) are protected inside the router itself.
app.use('/api/hazmat', require('./routes/hazmat'));

// ── Self-heal callback — GitHub Actions hits this without JWT auth ───────────
app.use('/api/debug-agent', require('./routes/debugAgent').publicRouter);

// ── API routes (protected) ──────────────────────────────────────────────────
app.use(requireAuth);
// Write-capability gate for the read-only companion (phone) client. Runs right
// after requireAuth (needs req.user.client_kind) and BEFORE the DB transaction,
// so a companion's disallowed write is 403'd without opening a transaction.
// No-op for command/web/legacy sessions. See middleware/companionGate.js.
app.use(require('./middleware/companionGate'));
// Scope guard for unit-login (in-cab apparatus) sessions. Runs right after
// requireAuth (needs req.user.session_kind), defense-in-depth on top of the role
// gates: hard-blocks a rig terminal's WRITES to the legal-record + admin families
// before any DB transaction. No-op for member/officer/legacy sessions.
// See middleware/unitGate.js (migration 0025).
app.use(require('./middleware/unitGate'));
// P5 RLS plumbing — per-request DB transaction + app.department_id/app.user_id
// GUCs. Runs after requireAuth (needs req.user.department_id), before route
// handlers. OPT-IN: no-op unless P5_TXN=on, so this is behavior-neutral until
// deliberately enabled. See middleware/dbTransaction.js + utils/dbContext.js.
app.use(require('./middleware/dbTransaction'));
// Structured request logging (Phase 5.2) — one JSON line per authed API call:
// who, what, when, status. Runs after requireAuth so user/station are known.
app.use(require('./middleware/requestLog').requestLog);
app.use('/api/license',              require('./routes/licenseRuntime').authedRouter);
// (The /api/narrative-drafts review queue was removed 2026-06-10: AI narrative
// generation is gone entirely — officers write incident narratives directly.)
app.use('/api/active-board',         require('./routes/activeBoard'));
app.use('/api/reconciliation',       require('./routes/reconciliation'));
app.use('/api/response-reports',     require('./routes/responseReports'));
app.use('/api/report-schedules',      require('./routes/reportSchedules'));
app.use('/api/members',              require('./routes/members'));
app.use('/api/station-displays',     require('./routes/stationDisplays').authedRouter); // 2.3 chief create/list/revoke
// AVL connection/device management (chief-only; the public ingest is in routes/avl.js).
app.use('/api/avl',                  require('./routes/avlAdmin'));
app.use('/api/departments',          require('./routes/departments'));

// GET /api/stations/tv-pin — TV PIN status for the logged-in station.
// PINs are stored hashed, so a hashed PIN can't be echoed back — the client
// keeps the plaintext it generated (localStorage) and can always rotate.
// Legacy plaintext rows still return the PIN until first hashed rotation/use.
app.get('/api/stations/tv-pin', async (req, res) => {
  try {
    const { pool } = require('./db');
    const { isHashed } = require('./config/tvPin');
    const result = await pool.query('SELECT tv_pin FROM stations WHERE id = $1 LIMIT 1', [req.user.stationId]);
    const stored = result.rows[0]?.tv_pin || null;
    if (!stored) return res.json({ pin: null, set: false });
    if (isHashed(stored)) return res.json({ pin: null, set: true });
    res.json({ pin: stored, set: true }); // legacy plaintext row
  } catch (err) {
    res.status(500).json({ error: 'Could not retrieve TV PIN' });
  }
});
// PUT /api/stations/tv-pin — update the TV PIN (called from Station Settings)
// Chief-only: rotating the PIN affects the whole department's TV displays.
app.put('/api/stations/tv-pin', require('./middleware/requireRole').requireChief, async (req, res) => {
  try {
    const { pool } = require('./db');
    const { hashTvPin, normalize } = require('./config/tvPin');
    const { pin } = req.body;
    if (!pin || typeof pin !== 'string') return res.status(400).json({ error: 'PIN required' });
    const clean = normalize(pin);
    if (!/^[A-Z0-9-]{4,16}$/.test(clean)) {
      return res.status(400).json({ error: 'PIN must be 4-16 letters/numbers/dashes' });
    }
    await pool.query('UPDATE stations SET tv_pin = $1 WHERE id = $2', [hashTvPin(clean), req.user.stationId]);
    res.json({ pin: clean });
  } catch (err) {
    res.status(500).json({ error: 'Could not update TV PIN' });
  }
});
app.use('/api/stations',             require('./routes/stations'));   // P4.3 firehouse CRUD — mounted after /api/stations/tv-pin so the specific routes win
app.use('/api/neris-registry',       require('./routes/nerisRegistry')); // SR — chief-gated NERIS station/unit registration
app.use('/api/apparatus',            require('./routes/apparatus'));
app.use('/api/units',                require('./routes/units'));
app.use('/api/notifications',        require('./routes/notificationPrefs'));
app.use('/api/alerts',               require('./routes/alerts'));
app.use('/api/incidents',            require('./routes/incidents'));
app.use('/api/incidents',            require('./routes/respond'));
app.use('/api/training',             require('./routes/training'));
app.use('/api/work-orders',          require('./routes/workOrders'));        // 2.2 (0083)
app.use('/api/defects',              require('./routes/defects'));           // 2.2 (0083)
app.use('/api/checks',               require('./routes/checks'));            // 2.1 (0082)
app.use('/api/shifts',               require('./routes/shifts'));
app.use('/api/shift-patterns',        require('./routes/shiftPatterns'));
app.use('/api/leave',                 require('./routes/leaveRequests'));
app.use('/api/leave-types',           require('./routes/leaveTypes'));   // 1.2a leave banks (types + balances + ledger)
app.use('/api/shift-swaps',           require('./routes/shiftSwaps'));
app.use('/api/coverage',              require('./routes/coverageWorkbench'));
app.use('/api/station-log',          require('./routes/stationLog'));
app.use('/api/fi-properties',        require('./routes/fiProperties'));
app.use('/api/fi-inspections/:id/photos', require('./routes/fiInspectionPhotos'));
app.use('/api/fi-inspections',       require('./routes/fiSchedule'));           // P3: batch-schedule + bulk-assign (before the /:id CRUD)
app.use('/api/fi-inspections',       require('./routes/fiInspections'));
app.use('/api/fi-permits',           require('./routes/fiPermits'));
app.use('/api/permit-jobs',          require('./routes/permitJobs'));
app.use('/api/fi-permit-types',      require('./routes/fiPermitTypes'));
app.use('/api/fi-fee-schedules',     require('./routes/fiFeeSchedules'));
app.use('/api/fi-invoices',          require('./routes/fiInvoices'));
app.use('/api/fi-payments',          require('./routes/fiPayments'));
app.use('/api/fi-code-library',      require('./routes/fiCodeLibrary'));      // P1 (2026-07-12)
app.use('/api/fi-inspection-types',  require('./routes/fiInspectionTypes'));  // P1
app.use('/api/fi-checklists',        require('./routes/fiChecklists'));       // P1
app.use('/api/fi-inspections',       require('./routes/fiWorkflow'));         // P2: /:id/complete + /:id/answers
app.use('/api/fi-inspections',       require('./routes/fiNotices'));          // P2.3: /:id/notice(s)
app.use('/api/fi-notices',           require('./routes/fiNotices').pdfRouter); // P2.3: /:noticeId/pdf stream
app.use('/api/fi-inspections',       require('./routes/fiSignatures'));       // P3: /:id/signatures capture + list
app.use('/api/fi-signatures',        require('./routes/fiSignatures').imageRouter); // P3: /:sigId/image stream
app.use('/api/fi-inspections',       require('./routes/fiService'));           // P3.5: /:id/service — the service-of-notice ladder (0053)
app.use('/api/fi-service',           require('./routes/fiService').eventRouter); // P3.5: mail events (the Jones trigger), void, posting photo
app.use('/api/fi-sync',              require('./routes/fiSync'));             // P3.6: offline day payload + idempotent outbox drain (0054)
app.use('/api/fi-reports',           require('./routes/fiReports'));          // P3: rows-authoritative violation reads
app.use('/api/fi-designations',      require('./routes/fiDesignations'));     // P2: rank-independent inspector grants
app.use('/api/fi-settings',          require('./routes/fiSettings'));         // P2: crew/commit toggles
app.use('/api/hydrants/import',      require('./routes/hydrantImport'));
app.use('/api/hydrants',             require('./routes/hydrants'));
app.use('/api/volunteer-hours',      require('./routes/volunteerHours'));
app.use('/api/grants',               require('./routes/grants'));
app.use('/api/mutual-aid',           require('./routes/mutualAid'));
app.use('/api/sogs',                 require('./routes/sogs'));
app.use('/api/wellness',             require('./routes/wellness'));
app.use('/api/recruitment',          require('./routes/recruitment'));
app.use('/api/events',               require('./routes/events'));
app.use('/api/pre-plans',                          require('./routes/prePlanExport'));
app.use('/api/pre-plans/:id/attachments',          require('./routes/prePlanAttachments'));
app.use('/api/pre-plans/:id/photos',               require('./routes/prePlanPhotos'));
app.use('/api/pre-plans',                          require('./routes/prePlans'));
app.use('/api/drills',               require('./routes/drills'));
app.use('/api/courses',              require('./routes/courses'));
app.use('/api/assets',               require('./routes/assets'));
app.use('/api/asset-tests',          require('./routes/assetTests'));        // 2.3 (0084)
app.use('/api/inventory',            require('./routes/inventory'));         // 2.4 (0085)
app.use('/api/scan',                 require('./routes/scan').router);       // 2.5 (0086)
app.use('/api/cs',                   require('./routes/cs'));                // 2.7 (0087, Dale-gated)
app.use('/api/fill-stations',        require('./routes/fillStations'));
app.use('/api/cad-connections',       require('./routes/cadConnections'));
app.use('/api/cad-ingest',            require('./routes/cadIngestMonitor'));  // 4C.4 (0127)
app.use('/api/cron-health',           require('./routes/cronHealth'));        // X-PHASE (0128)
app.use('/api/investigations',        require('./routes/investigations'));
app.use('/api/pay-entries',           require('./routes/payEntries'));
app.use('/api/crr-visits',            require('./routes/crrVisits'));
app.use('/api/crr-programs',          require('./routes/crrPrograms'));
app.use('/api/budget-lines',          require('./routes/budgetLines'));
app.use('/api/budget-transactions',   require('./routes/budgetTransactions'));
app.use('/api/nfirs-reports',         require('./routes/nfirsReports'));
app.use('/api/station-config',        require('./routes/stationConfig'));
app.use('/api/qualifications',        require('./routes/qualifications'));
app.use('/api/apparatus-assignments', require('./routes/apparatusAssignments'));
app.use('/api/run-list',             require('./routes/runList'));
app.use('/api/ot-equalization',       require('./routes/otEqualization'));
app.use('/api/personnel-actions',     require('./routes/personnelActions'));
app.use('/api/exposure-records',      require('./routes/exposureTracking'));
app.use('/api/shift-trades',          require('./routes/shiftTrades'));
app.use('/api/daily-staffing',        require('./routes/dailyStaffing'));
app.use('/api/staffing',              require('./routes/staffing'));      // 1.4: rules + coverage view
app.use('/api/vacancies',             require('./routes/vacancies'));     // 1.4: unified vacancy record
app.use('/api/hiring',                require('./routes/hiring'));        // 1.5: ordered hiring engine
app.use('/api/apparatus-oos',         require('./routes/apparatusOOS'));
app.use('/api/timesheets',            require('./routes/timesheets'));
app.use('/api/grievances',            require('./routes/grievances'));
app.use('/api/after-action',          require('./routes/afterAction'));
app.use('/api/mutual-aid-agreements', require('./routes/mutualAidAgreements'));
app.use('/api/training-plans',        require('./routes/trainingPlans'));
app.use('/api/dept-documents',        require('./routes/deptDocuments'));
app.use('/api/meeting-minutes',      require('./routes/meetingMinutes'));
app.use('/api/policy-acks',          require('./routes/policyAcknowledgments'));
app.use('/api/equipment-checkout',   require('./routes/equipmentCheckout'));
app.use('/api/knox-keys',           require('./routes/knoxKeys'));
app.use('/api/incident-costs',       require('./routes/incidentCosts'));
app.use('/api/incident-analysis',   require('./routes/incidentAnalysis'));
app.use('/api/training-ai',         require('./routes/trainingAI'));
app.use('/api/report-writer',       require('./routes/reportWriter'));
app.use('/api/preplan-ai',          require('./routes/preplanAI'));
app.use('/api/staffing-ai',         require('./routes/staffingAI'));
app.use('/api/data-ingest',         require('./routes/dataIngestAI'));
app.use('/api/import/run-list',      require('./routes/importRunList'));
app.use('/api/import',               require('./routes/import'));
app.use('/api/push',                 require('./routes/push').router);
app.use('/api/radio',               require('./routes/radio'));
app.use('/api/recall',               require('./routes/recall'));
app.use('/api/assistant',            require('./routes/assistant'));
app.use('/api/workflows',            require('./routes/workflows'));
app.use('/api/ai/action',           require('./routes/aiAction'));
app.use('/api/agent',               require('./routes/agent'));
app.use('/api/ai/enhance',          require('./routes/aiEnhance'));
app.use('/api/modules',              require('./routes/modules'));
app.use('/api/scenarios',            require('./routes/scenarios'));
app.use('/api/exams',               require('./routes/exams'));
app.use('/api/availability',        require('./routes/availability'));
app.use('/api/bulletins',           require('./routes/bulletins'));
app.use('/api/messages',            require('./routes/messages'));
app.use('/api/fundraising',         require('./routes/fundraising'));
app.use('/api/community-outreach',  require('./routes/communityOutreach'));
app.use('/api/calendar',            require('./routes/calendarFeed'));
app.use('/api/dashboard',           require('./routes/dashboardSummary'));
app.use('/api/dashboard/briefing',  require('./routes/dashboardBriefing'));
app.use('/api/dashboard/today',     require('./routes/dashboardToday'));
app.use('/api/weather',             require('./routes/weather'));
app.use('/api/cadets',              require('./routes/cadets'));
// RETIRED 4.1h — /api/response-analytics computed `incidents.time ->
// incidents."dispatchTime"` and called it "turnout". dispatchTime has NO LIVE
// WRITER (absent from incUpdate's allowlist, from the CAD pipeline, and from
// the incident form) so all ten populated values on prod are seed fixtures, and
// `time -> dispatchTime` is not turnout anyway — it is wrong by two segments.
// Replaced by /api/response-reports/compliance, which reads the unit-status
// ladder. The page it fed now points there.
app.use('/api/user',                 require('./routes/userPrefs'));
app.use('/api/attachments',         require('./routes/attachments'));
app.use('/api/correspondence',     require('./routes/correspondence'));
app.use('/api/email-ingest',        require('./routes/emailIngest'));
app.use('/api/intelligence',       require('./routes/intelligence'));
app.use('/api/webhooks',           require('./routes/webhooks'));
app.use('/api/live-share',         require('./routes/liveShare'));
app.use('/api/active-resources',   require('./routes/activeResources'));
app.use('/api/incident-media',    require('./routes/incidentMedia'));
app.use('/api/ng911',            require('./routes/ng911'));
app.use('/api/activity-entries',  require('./routes/activityEntries'));
app.use('/api/fto',              require('./routes/ftoTracker'));
app.use('/api/cameras',          require('./routes/publicCameras'));
// /uploads files are tenant-scoped (fireground photos etc.) — serve through a
// station ownership check, NOT blanket static. Blanket static let any authed
// user fetch another department's scene photos by filename (W2.5 audit,
// 2026-06-10). Runs behind requireAuth (mounted above), so req.user is set.
app.get('/uploads/incident-media/:filename', async (req, res) => {
  try {
    const filename = _path.basename(req.params.filename); // traversal guard
    const { rows } = await require('./db').pool.query(
      'SELECT station_id FROM incident_media WHERE filename = $1',
      [filename]
    );
    // 404 (not 403) on both missing and foreign files — don't leak existence
    if (!rows.length || String(rows[0].station_id) !== String(req.user.stationId)) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(_path.join(__dirname, '..', 'uploads', 'incident-media', filename));
  } catch (e) {
    // incident_media is created lazily by routes/incidentMedia.js ensureTable —
    // if nothing was ever uploaded the table may not exist yet; that's a 404.
    if (/relation "incident_media" does not exist/.test(e.message)) {
      return res.status(404).json({ error: 'Not found' });
    }
    console.error('uploads/incident-media serve error:', e.message);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});
app.use('/api/admin/db-audit',      require('./routes/dbAudit'));
app.use('/api/completeness',       require('./routes/completeness'));
app.use('/api/export',             require('./routes/exportAll')); // W4.5: chief-only full-department export

// ── Self-heal: bug reports, diagnosis, dispatch (auth required) ──────────────
app.use('/api/debug-agent', require('./routes/debugAgent').protectedRouter);

// ── Admin: force-seed demo data (chief only) ─────────────────────────────────
app.post('/api/admin/seed-demo', async (req, res) => {
  if (req.user?.role !== 'chief') {
    return res.status(403).json({ error: 'Chief role required' });
  }
  // forceSeedDemo HARD-DELETES all station-1 data before reseeding. Gate it behind
  // the same SEED_DEMO env used by the boot-time demo seeds, plus an explicit
  // confirmation token, so it can never wipe a real department's data by accident.
  if (process.env.SEED_DEMO !== 'true') {
    return res.status(403).json({ error: 'Demo seeding is disabled (SEED_DEMO is not enabled)', code: 'SEED_DEMO_OFF' });
  }
  if (req.body?.confirm !== 'WIPE_STATION_1') {
    return res.status(400).json({ error: 'Confirmation required: pass { "confirm": "WIPE_STATION_1" }', code: 'CONFIRM_REQUIRED' });
  }
  try {
    await db.forceSeedDemo({ confirm: true });
    res.json({ ok: true, message: 'Demo data seeded: 12 members, 8 apparatus, 8 incidents, 10 training records' });
  } catch (err) {
    console.error('seed-demo error:', err);
    res.status(500).json({ error: err.message });
  }
});



// ── 404 fallback + unified error handler (W3.7, roadmap 5.4) ─────────────────
const { errorHandler, notFound } = require('./middleware/errorHandler');
app.use(notFound);
app.use(errorHandler);

// ── Start server after DB is ready, then seed ────────────────────────────────
// Seeds must run AFTER initDb() completes so all tables exist.
// Each seed exports an async function; we run them sequentially so dependent
// seeds (e.g. fireInspections needs property IDs) work correctly.
async function runSeeds() {
  // ── Seed model: essentials always run, demo gated by SEED_DEMO env var ─────
  //
  // ESSENTIAL seeds populate reference data every department needs regardless
  // of who they are: the ERG 2024 hazmat library (public domain), the NFPA
  // training course catalog, etc. These ALWAYS run.
  //
  // DEMO seeds populate the fictional "Maplewood Fire Department" content
  // used by the open-firehouse-client.vercel.app demo: 12 fake members,
  // 18 sample incidents, 16 sample apparatus, bulletins, exams, meetings.
  // These ONLY run when process.env.SEED_DEMO === 'true'.
  //
  // For a real fire department cloning this repo:
  //   - Don't set SEED_DEMO. You get a clean install with reference data only.
  //   - First-run shows the Department Setup Wizard to create your station +
  //     first chief account. After that you're populating your own data.
  //
  // For the public Vercel demo (open-firehouse-client.vercel.app):
  //   - SEED_DEMO=true is set in Vercel project env vars.
  //   - All 70+ demo seeds run, populating Maplewood Fire Department.
  //
  // To force a re-seed in either mode:
  //   UPDATE stations SET seeded_at = NULL WHERE id = 1;
  // ───────────────────────────────────────────────────────────────────────────

  const seedDemo = process.env.SEED_DEMO === 'true';

  // ── Fast-path: skip all seeds if station 1 was already seeded ──────────────
  try {
    const { rows } = await db.pool.query('SELECT seeded_at FROM stations WHERE id = 1');
    if (rows.length > 0 && rows[0].seeded_at !== null) {
      console.log(`[seed] Already seeded at ${rows[0].seeded_at} — skipping all seeds.`);
      return;
    }
  } catch (e) {
    // seeded_at column may not exist yet on very first boot — proceed normally
  }

  // ── Essential seeds — always run, regardless of SEED_DEMO ─────────────────
  // Reference data every fire department needs to function. Safe to re-run.
  const essentialSeeds = [
    // Hazmat reference is seeded separately from FireHazmat's private hazmat.json
    // via ensureHazmatReference() — NOT from a hardcoded array seed.
    './seed-courses.js',    // NFPA-standard fire service training course catalog
  ];

  for (const mod of essentialSeeds) {
    try {
      const fn = require(mod);
      if (typeof fn === 'function') {
        await fn();
        console.log(`[seed] essential — ${mod} OK`);
      }
    } catch (e) {
      console.warn(`[seed] essential ${mod} failed — skipping:`, e.message);
    }
  }

  if (!seedDemo) {
    console.log('[seed] SEED_DEMO not set — essentials only, skipping demo seeds.');
    console.log('[seed]   (To populate the Maplewood demo dataset, set SEED_DEMO=true.)');
    return;
  }

  console.log('[seed] SEED_DEMO=true — running demo seeds (Maplewood Fire Department)...');

  // ── Demo seeds — Maplewood Fire Department fictional data ─────────────────
  const demoSeeds = [
    './seed.js',
    './seed-apparatus.js',
    './seed-incidents.js',
    './seed-training.js',
    './seed-maintenance.js',
    './seed-shifts.js',
    './seed-stationLog.js',
    './seed-fireInspections.js',
    './seed-hydrants.js',
    './seed-volunteerHours.js',
    './seed-grants.js',
    './seed-mutualAid.js',
    './seed-sogs.js',
    './seed-wellness.js',
    './seed-recruitment.js',
    './seed-events.js',
    './seed-prePlans.js',
    './seed-drills.js',
    './seed-assets.js',
    './seed-scba.js',
    './seed-cad.js',
    './seed-investigations.js',
    './seed-payroll.js',
    './seed-crr.js',
    './seed-budget.js',
    './seed-nfirs.js',
    './seed-afterAction.js',
    './seed-apparatusAssignments.js',
    './seed-apparatusOOS.js',
    './seed-cadets.js',
    './seed-courses.js',
    './seed-dailyStaffing.js',
    './seed-deptDocuments.js',
    './seed-exposureRecords.js',
    './seed-qualifications.js',
    './seed-trainingPlans.js',
    './seed-fundraising.js',
    './seed-communityOutreach.js',
    './seed-fillStations.js',
    './seed-leaveRequests.js',
    './seed-mutualAidAgreements.js',
    './seed-otRecords.js',
    './seed-personnelActions.js',
    './seed-shiftPatterns.js',
    './seed-shiftTrades.js',
    './seed-timesheets.js',
    './seed-exams.js',
    './seed-grievances.js',
    './seed-meetingMinutes.js',
    './seed-bulletins.js',
    './seed-equipmentCheckout.js',
    './seed-knoxKeys.js',
    './seed-attachments.js',
    './seed-assistant.js',
    './seed-apparatusPositions.js',
    './seed-policyAcknowledgments.js',
    // seed-fiPermits.js removed 2026-07-16: it was a second, redundant permits
    // seeder written against a non-existent column set (permit_number/applicant_*)
    // and never inserted a row. Permits are seeded correctly via fiPermits.create()
    // in seed-fireInspections.js (one permits seed, one owner). — Matt/Dale
    './seed-examAssignments.js',
    './seed-donations.js',
    './seed-assistantFeedback.js',
    './seed-todayActivities.js',
    './seed-correspondence.js',
    './seed-messages.js',
    './seed-incidentCosts.js',
    './seed-shiftSwaps.js',
    './seed-workflowTasks.js',
    './seed-memberAvailability.js',
    './seed-ng911.js',
    './seed-ftoTracker.js',
    './seed-activityEntries.js',
    './seed-incidentAnalysis.js',
    './seed-recall.js',
    './seed-radioConfig.js',
    './seed-ftoEvaluations.js',
    // NOTE: hazmat reference data is seeded by ensureHazmatReference() from
    // FireHazmat's private hazmat.json, not from a demo/essential array seed.
  ];
  for (const mod of demoSeeds) {
    try {
      const fn = require(mod);
      if (typeof fn === 'function') await fn();
    } catch (e) {
      console.warn(`[seed] demo ${mod} failed — skipping:`, e.message);
    }
  }

  // ── Stamp seeded_at so future restarts skip this entire block ───────────────
  try {
    await db.pool.query('UPDATE stations SET seeded_at = NOW() WHERE id = 1');
    console.log('[seed] All demo seeds complete — seeded_at stamped on station 1.');
  } catch (e) {
    console.warn('[seed] Could not stamp seeded_at:', e.message);
  }
}

// ── Belt-and-suspenders: reconcile every id sequence to its table's MAX(id) ──
// Seeds/backfills that insert EXPLICIT ids (e.g. applyDepartmentExpand's
// department-per-station) don't advance the owning sequence, so the next
// nextval() can collide on the primary key — which silently broke the FIRST
// self-serve signup on a fresh install (departments_pkey, mislabeled as
// USERNAME_TAKEN). Runs once, after all seeds/migrations settle, only in the
// owner/seed path (skipped under P5_TXN=on, like the seeds themselves). Scoped
// to columns whose default is nextval(...) — independent of OWNED BY — and
// idempotent: a no-op when a sequence is already ahead of MAX(id).
async function reconcileSequences() {
  try {
  await db.pool.query(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT c.table_name AS tbl, c.column_name AS col,
               regexp_replace(
                 regexp_replace(c.column_default, '^nextval\\(''(.+)''::regclass\\)$', '\\1'),
                 '^public\\.', '') AS seq
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_default LIKE 'nextval(%'
      LOOP
        EXECUTE format(
          'SELECT setval(%L, GREATEST(COALESCE((SELECT MAX(%I) FROM public.%I), 0), 1), ' ||
          '(SELECT MAX(%I) FROM public.%I) IS NOT NULL)',
          r.seq, r.col, r.tbl, r.col, r.tbl);
      END LOOP;
    END $$;
  `);
  console.log('[seed] Sequence reconciliation complete — all id sequences >= MAX(id).');
  } catch (e) {
    // The shared pool can be closed (e.g. a test's teardown) while this background
    // pass is still queued — that race is benign (reconciliation is belt-and-
    // suspenders; applyDepartmentExpand already reconciles via OWNED BY). Swallow
    // only the closed-pool race; rethrow anything real.
    if (/pool after calling end|Cannot use a pool|Client was closed/i.test(e.message || '')) return;
    throw e;
  }
}

// ── Is the reference data on the enriched (FireHazmat 2024.77) schema? ────────
// Sentinel: the `polymerization_hazard` column only exists after the enriched
// FireHazmat reseed. Used to detect whether the reference tables still need
// reseeding from the private hazmat.json.
async function isHazmatEnriched() {
  try {
    const r = await db.pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'fs_hazmat_materials' AND column_name = 'polymerization_hazard' LIMIT 1`
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

// ── Hazmat reference orchestrator ─────────────────────────────────────────────
// Single source of truth: FireHazmat's private hazmat.json (gitignored; ingested
// by seed-hazmat-json). Always ensures the operational incident tables; reseeds
// the enriched reference data from the JSON when present and not already
// enriched. There is NO legacy hardcoded-array fallback — the old dataset has
// been retired entirely; the OF hazmat module carries FireHazmat data only.
async function ensureHazmatReference() {
  await ensureHazmatIncidentTables();

  if (await isHazmatEnriched()) {
    console.log('[seed] Hazmat reference is on the enriched FireHazmat schema.');
    return;
  }

  const fsx = require('fs');
  const jsonPath = require('path').join(__dirname, '..', 'data', 'hazmat.json');
  if (fsx.existsSync(jsonPath)) {
    console.log('[seed] Enriched hazmat reference missing — reseeding from private hazmat.json…');
    try {
      const seedHazmatFromJson = require('./seed-hazmat-json');
      await seedHazmatFromJson(db.pool);
    } catch (err) {
      console.error('[seed] Enriched hazmat reseed failed:', err.message);
    }
  } else {
    console.warn('[seed] No enriched hazmat data and no private hazmat.json present — reference tables empty until reseeded (run seed-hazmat-json against DATABASE_URL).');
  }
}

// ── Operational hazmat incident tables ────────────────────────────────────────
// Subpoenable incident records — always ensured, independent of the reference
// library (which is seeded from FireHazmat's private hazmat.json).
async function ensureHazmatIncidentTables() {
  try {
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS fs_hazmat_incidents (
        id                    SERIAL PRIMARY KEY,
        station_id            INTEGER REFERENCES stations(id),
        department_id         INTEGER,
        incident_number       TEXT,
        address               TEXT,
        material_name         TEXT,
        un_number             VARCHAR(10),
        guide_number          INTEGER,
        hazard_class          TEXT,
        quantity              TEXT,
        container_type        TEXT,
        release_type          TEXT,
        ppe_level             TEXT,
        isolation_zone_m      INTEGER,
        status                TEXT DEFAULT 'active',
        declared_at           TIMESTAMPTZ DEFAULT NOW(),
        mitigated_at          TIMESTAMPTZ,
        notes                 TEXT,
        crew_in_hot_zone      TEXT[],
        notifications_sent    TEXT[],
        created_by            INTEGER REFERENCES users(id),
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW(),
        location_address      TEXT,
        location_lat          NUMERIC,
        location_lon          NUMERIC,
        quantity_estimate     TEXT,
        wind_direction        TEXT,
        wind_speed_mph        NUMERIC,
        temperature_f         NUMERIC,
        ic_user_id            INTEGER REFERENCES users(id),
        responders_count      INTEGER,
        evacuation_distance_m INTEGER,
        resolved_at           TIMESTAMPTZ
      )
    `);
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS fs_hazmat_incident_audit (
        id            SERIAL PRIMARY KEY,
        incident_id   INTEGER NOT NULL REFERENCES fs_hazmat_incidents(id) ON DELETE CASCADE,
        department_id INTEGER,
        field_changed VARCHAR(64) NOT NULL,
        old_value     TEXT,
        new_value     TEXT,
        changed_by    INTEGER REFERENCES users(id),
        changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.pool.query(`CREATE INDEX IF NOT EXISTS idx_hazmat_audit_incident   ON fs_hazmat_incident_audit(incident_id)`);
    await db.pool.query(`CREATE INDEX IF NOT EXISTS idx_hazmat_audit_changed_at ON fs_hazmat_incident_audit(changed_at)`);
    console.log('[seed] fs_hazmat_incidents tables verified.');
  } catch (err) {
    console.error('[seed] Could not ensure hazmat incident tables:', err.message);
  }
}

// ── WebSocket server for real-time radio feed ────────────────────────────────
const http      = require('http');
const WebSocket = require('ws');

const { resolveRadioWsTenant } = require('./radio/wsAuth');

const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, path: '/ws/radio' });

// Track connected clients by department (the broadcast bucket key).
const radioClients = new Map(); // department_id -> Set<ws>

wss.on('connection', (ws, req) => {
  // Clients authenticate with a VERIFIED JWT (logged-in clients) or a TV PIN.
  // First message: { type: 'auth', token: '<JWT>' } or { type: 'auth', pin: 'XXXX' }.
  // A client-claimed station/department id is never trusted — see radio/wsAuth.js.
  let authenticated = false;
  let clientStationId = null;

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'auth' && !authenticated) {
        // Resolve the tenant via the shared resolver: a verified JWT or a TV PIN
        // → department_id bucket key (radio/wsAuth.js). Returns null → reject.
        const deptKey = await resolveRadioWsTenant(msg);
        if (deptKey != null) {
          clientStationId = deptKey;
          authenticated = true;
        }

        if (authenticated) {
          if (!radioClients.has(clientStationId)) radioClients.set(clientStationId, new Set());
          radioClients.get(clientStationId).add(ws);
          ws.send(JSON.stringify({ type: 'auth_ok', stationId: clientStationId }));
        } else {
          ws.send(JSON.stringify({ type: 'auth_fail' }));
          ws.close();
        }
      }
    } catch (e) { /* ignore invalid messages */ }
  });

  ws.on('close', () => {
    if (clientStationId && radioClients.has(clientStationId)) {
      radioClients.get(clientStationId).delete(ws);
      if (radioClients.get(clientStationId).size === 0) radioClients.delete(clientStationId);
    }
  });

  // Send a ping every 30s to keep connections alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 30000);
  ws.on('close', () => clearInterval(pingInterval));
});

// Global broadcast function — called by radio routes when new transcriptions arrive
global.radioWsBroadcast = (stationId, entry) => {
  const clients = radioClients.get(stationId);
  if (!clients) return;
  const payload = JSON.stringify({ type: 'radio', data: entry });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
};

// ── Start listening IMMEDIATELY for deployment health checks ────────────────
// The /health endpoint responds right away. DB init and seeding happen in
// the background. The dbReady gate above returns 503 for API requests
// until the DB is fully ready (usually <10s on subsequent restarts).
// Only bind a listening socket when running as a standalone Node process
// (e.g. local dev or a traditional long-lived host). On Vercel the serverless
// runtime imports this module and invokes the exported Express app directly,
// so calling listen there would throw / leak.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Open Firehouse API listening on http://localhost:${PORT}`);
    console.log(`WebSocket radio feed available at ws://localhost:${PORT}/ws/radio`);
    try {
      require('./utils/morningBrief').startMorningBriefTicker();
    } catch (err) {
      console.warn('[morningBrief] ticker not started:', err.message);
    }
  });
}

module.exports = app;

// ── One-time migration: replace phantom member names in ALL tables ───────────
// The old seed data used fake names (Ashley N. Pruitt, James R. Kowalski, etc.)
// This migration fixes them in the live database so existing records show correctly.
async function migratePhantomNames() {
  const { pool } = require('./db');
  const NAME_MAP = [
    ['James R. Kowalski',  'Sarah Chen'],
    ['Ashley N. Pruitt',   'Sandra Kim'],
    ['Ashley Pruitt',      'Sandra Kim'],
    ['Derek A. Simmons',   'Nathan McGee'],
    ['Vanessa C. Torres',  'Tracy Benson'],
    ['Nathan P. McGee',    'James Ortega'],
    ['Samuel J. Okafor',   'Mike Harrington'],
    ['Robert L. Huang',    'Lisa Fontaine'],
    ['Connor D. Walsh',    'Carlos Ruiz'],
    ['Brianna K. Wells',   'Amy Winters'],
    ['Tyler J. Barton',    'Kevin Marsh'],
    ['Rebecca A. Nguyen',  'Diane Tolliver'],
    ['Marcus T. Everett',  'Sarah Chen'],
    ['Danielle K. Foley',  'Maria Delgado'],
    ['Maya R. Okonkwo',    'Tracy Benson'],
    ['Linda M. Reyes',     'Lisa Fontaine'],
  ];

  // Every text column in every table that might contain a member name
  const TABLES_COLS = [
    ['bulletins',          ['author_name']],
    ['station_log',        ['officerOnDuty', 'visitors']],
    ['training',           ['memberName', 'instructor']],
    ['maintenance',        ['technician']],
    ['volunteer_hours',    ['memberName']],
    ['incidents',          ['personnel', 'notes']],
    ['drills',             ['instructor']],
    ['events',             ['organizer']],
    ['pre_plans',          ['lastUpdatedBy']],
    ['fi_inspections',     ['inspectorName']],
    ['mutual_aid',         ['notes']],
    ['nfirs_reports',      ['preparedBy', 'officerInCharge', 'reviewedBy']],
    ['investigations',     ['investigator']],
    ['pay_entries',        ['memberName']],
    ['wellness',           ['memberName']],
    ['sogs',               ['author', 'approvedBy']],
    ['personnel_actions',  ['issued_by']],
    ['exposure_records',   ['reported_by']],
    ['recruitment',        ['recruiter']],
    ['shifts',             ['crew', 'notes']],
    ['shift_swaps',        ['requesterName', 'coveredByName']],
    ['leave_requests',     ['memberName', 'approvedBy']],
    ['checklist_completions', ['completedBy']],
    ['courses',            ['instructor']],
    ['crr_visits',         ['notes']],
    ['budget_transactions',['approvedBy']],
  ];

  let totalUpdated = 0;
  for (const [oldName, newName] of NAME_MAP) {
    for (const [table, cols] of TABLES_COLS) {
      for (const col of cols) {
        try {
          const r = await pool.query(
            `UPDATE ${table} SET "${col}" = REPLACE("${col}", $1, $2) WHERE "${col}" LIKE '%' || $1 || '%'`,
            [oldName, newName]
          );
          totalUpdated += r.rowCount;
        } catch (e) { /* column/table may not exist yet — skip */ }
      }
    }
  }
  if (totalUpdated > 0) {
    console.log(`[migration] Fixed ${totalUpdated} phantom name occurrences in database.`);
  } else {
    console.log('[migration] No phantom names found in database — clean.');
  }
}

async function ensureBugReportsTable() {
  try {
    await db.pool.query('SELECT 1 FROM bug_reports LIMIT 1');
    console.log('[seed] bug_reports table already exists — skipping.');
  } catch (e) {
    if (e.code === '42P01') { // relation does not exist
      console.log('[seed] bug_reports table missing — creating...');

      // Detect whether users.id is INTEGER (local) or UUID (Supabase)
      const colInfo = await db.pool.query(
        "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'"
      );
      const idType = colInfo.rows[0]?.data_type || 'integer';
      const isUuid = idType === 'uuid';
      const pkType = isUuid ? 'UUID PRIMARY KEY DEFAULT gen_random_uuid()' : 'SERIAL PRIMARY KEY';
      const fkType = isUuid ? 'UUID REFERENCES users(id)' : 'INTEGER REFERENCES users(id)';
      console.log(`[seed] Detected users.id type: ${idType} — using ${isUuid ? 'UUID' : 'INTEGER'} for bug_reports`);

      await db.pool.query(`
        CREATE TABLE IF NOT EXISTS bug_reports (
          id                  ${pkType},
          created_at          TIMESTAMPTZ DEFAULT now(),
          user_id             ${fkType},
          description         TEXT NOT NULL,
          page_route          TEXT,
          context_bundle      JSONB,
          status              TEXT DEFAULT 'pending'
                              CHECK (status IN ('pending','diagnosed','resolved','failed')),
          diagnosis           JSONB,
          diagnosis_tokens    JSONB,
          diagnosis_duration_ms INTEGER,
          self_heal_status    TEXT
                              CHECK (self_heal_status IN ('queued','running','completed','failed')),
          self_heal_run_id    TEXT,
          self_heal_branch    TEXT,
          self_heal_pr_url    TEXT,
          self_heal_pr_number INTEGER,
          resolution_notes    TEXT,
          updated_at          TIMESTAMPTZ DEFAULT now()
        )
      `);
      await db.pool.query('CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status)');
      await db.pool.query('CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at DESC)');
      await db.pool.query('CREATE INDEX IF NOT EXISTS idx_bug_reports_user ON bug_reports(user_id)');
      await db.pool.query('CREATE INDEX IF NOT EXISTS idx_bug_reports_self_heal ON bug_reports(self_heal_status)');
      console.log('[seed] bug_reports table created.');
    } else {
      throw e;
    }
  }
}

// NOTE: db.ready / initDb() is now triggered lazily on first API request
// (see the DB-ready gate middleware above). This avoids the Vercel serverless
// freeze/thaw issue where module-scope promises hang forever.
