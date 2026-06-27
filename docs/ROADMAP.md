# OpenFirehouse Roadmap — Path to Best-in-Class

> Source: full codebase review, June 9, 2026 (server security, client/field UX,
> NFIRS/NERIS compliance, AI infrastructure). Findings verified against code.
>
> Mission test for every item: does this help volunteer firefighters spend less
> time on paperwork and more time preventing and fighting fires — and can a
> department bet its compliance and its crews' safety on it?


> **Execution status updated 2026-06-10 (Matt + Claude session).** ☑/◐ notes below
> are verified-in-prod claims, not aspirations. Working checklist mapping: Wave 1
> (2.1/2.2/5.2) + Wave 2 (3.1/1.3/2.6/5.1) SHIPPED. **W2.5 (1.2 line-by-line
> audit + all finding fixes), Wave 3 (4.3/4.4/4.6/4.7/4.8/4.9/4.10 + 5.4/5.5),
> and Wave 4 (2.4/2.5 incl. the 8 export bugs, 3.3◐, 3.4◐, 3.5◐, 5.3) ALL
> SHIPPED 2026-06-10 PM/late.** Quick wins done same session: CRON_SECRET set
> in Vercel (applies on next deploy); users.station_id||1 login fallback
> removed (NULL-station fails closed). The three ◐ items carry explicit
> residuals in their notes (dark mode beyond command screens, airplane-mode
> device walk-through, full-app ARIA sweep). Open questions for Dale in §1.2.
> Separate track (blocked on Dale's credentials): DB dedication plan v2 → RLS.
>
> **Batch-2 hardening (DONE 2026-06-10 night, parallel session):** enabled
> row-level security (deny-all) on `cad_connections` + `radio_config` — their
> stored API-key columns were readable over the public PostgREST anon path;
> verified the leak (full credential rows) is now closed, app unaffected
> (owner-bypass). Added the 17 advisor-flagged FK covering indexes
> (incl. `unit_statuses.apparatus_id`, the live unit-status join). Both
> back-ported into `docs/migrations/0002-*.sql` + mirrored into `db.js` so fresh
> installs converge, and recorded in `of_schema_migrations` (see Phase 5 —
> tracked migration runner).

**Status legend:** ☐ not started · ◐ in progress · ☑ done

---

## Phase 1 — Multi-Tenancy (CRITICAL, blocks everything)

The "ubiquitous web app for every department" premise fails while tenancy is broken.

- ☑ **1.1 Remove hardcoded `station_id = 1`** *(DONE 2026-06-10 — 14 route files + 22 feed modules + ical.js + ~20 more sites; tenancy-guard test is the fence)* — 14 route files query a literal
  station 1, so a second department on a shared deployment reads/writes
  department 1's data or nothing.
  Files: `afterAction.js`, `apparatusOOS.js`, `grievances.js`, `attachments.js`,
  `correspondence.js`, `calendarFeed.js` + 8 more
  (`grep -l "station_id = 1" server/src/routes/*.js`).
  Fix: middleware injects `req.user.stationId`; no route may accept
  `station_id` from query/body.
- ☑ **1.2 Audit all 121 route files for tenancy scoping** *(DONE 2026-06-10 PM —
  W2.5 line-by-line read of all 127 route files (3-agent fan-out): 96 CLEAN, 18
  intentionally-global, 13 finding files ALL FIXED — 8 HIGH (trainingAI fully
  unscoped; vacancyFill/activeResources/knoxKeys UPDATE-by-id; ng911 literal
  station 1 in param array; push.js read req.session which is never set;
  assistant member-keyed reads; dataIngestAI import) + MEDs (fundraising
  cross-station campaign writes, messages cross-dept inbox injection, liveShare
  token-only writes) + LOW hygiene (client-supplied FK validation in exams/
  fiInspections/fiPermits/incidentCosts/hazmat; /uploads + correspondence
  static-file serving now station-checked; 47 dead `stationId || 1` fallbacks
  swept). 4 new guard fences: camelCase `||/?? 1`, req.session, UPDATE-by-id,
  param-array literal-1. Audit-surfaced bugs fixed: staffingAI schema-mismatch
  queries (500'd), wellness `'/:.*'` route typo, weather hardcoded-town →
  per-station geocode, fundraising GET /donations crash. OPEN for Dale:
  (a) bug_reports tenant-privacy — any chief can read/dispatch any station's
  reports by design today; (b) personalApp.js is unmounted dead code — mount or
  delete.)* — every SELECT /
  UPDATE / DELETE must filter by the authenticated station. Pattern reference:
  `exposureTracking.js` (correct) vs `grievances.js` (broken).
- ◐ **1.3 Tenancy isolation tests** *(EXPANDED 2026-06-10 late — live two-station
  suite now attacks 10 route families: the 4 originals (incidents, members,
  grievances, exposure-records) + the 6 the W2.5 audit fixed (vacancy-fill,
  knox-keys, ng911 PII reads, training-AI member enumeration,
  active-resources, messages injection). Fixtures created THROUGH the API as
  station A so schema drift breaks loudly. 11/11 verified against the dev DB;
  opt-in via TENANCY_TEST_DB so CI stays green without a database. The static
  guard (6 pattern fences) covers all 127 files mechanically. Literal
  one-test-per-route remains the aspiration — add a family whenever a route
  ships or a hole is found.)* — one test per route proving department B
  cannot read or mutate department A's rows. This is the regression net that
  keeps 1.1–1.2 fixed forever.

## Phase 2 — Reports You Can Take to the State (CRITICAL)

Incident reports are legal records. The pitch is "trust the AI with mandatory
reporting" — these gaps undermine that trust.

- ☑ **2.1 Human approval gate for AI narratives** *(SUPERSEDED BY DOCTRINE 2026-06-10: Matt removed AI from ALL narrative/NERIS surfaces entirely — gate built, shipped, then replaced same-day by full removal. See CLAUDE.md "AI-Narrative Doctrine". AI auto-fills facts only.)* — AI-generated NFIRS/NERIS
  narratives currently save straight to the DB. A hallucinated detail becomes
  part of a state submission. Add draft → officer review → approve workflow;
  store reviewer + timestamp.
- ☑ **2.2 Soft-delete + append-only audit trail** *(DONE 2026-06-10 — deleted_at on the 3 legal tables, 41 read paths filtered, append-only audit_log + audit() on create/update/delete/review)* for incidents, exposure
  records (HIPAA-adjacent), and grievances. Today most routes hard-DELETE and
  nothing logs who viewed or changed a record. Record retention is a
  compliance requirement.
- ☑ **2.3 Transactions on multi-step writes** *(ADDRESSED 2026-06-10, different design: companion writes awaited pre-response, individually non-fatal — an auxiliary failure must never block logging an incident; debate welcome)* — e.g. `incidents.js:23-50`
  creates incident + workflow task fire-and-forget; failure leaves orphans.
  Wrap in BEGIN/COMMIT.
- ☑ **2.4 Per-state NERIS validation rules** *(DONE 2026-06-10 PM, W4.1 —
  data/stateNerisRules.js: pluggable per-state rules (fdidPattern, fdidHint,
  submissionDeadlineDays), DEFAULT + NJ shipped, opt-in via
  validateNerisIncident(neris, { state }). The 8 export bugs ALL FIXED with
  goldens updated same-commit: FDID:NaN → now-fallback; fake-UTC unit times →
  real local→UTC conversion (TZ-independent goldens); zero-loss truthiness →
  $0 and 0-stories preserved; hardcoded NJ FDID default → empty + hard
  validation error; hardcoded NJ state fallback → options.defaultState +
  warning; controlledTime dropped → emitted as time_fire_control; corrupt
  time strings → omitted not emitted; missing-state warning added.)* — current rules are NJ-specific
  (FDID format, 30-day deadline, municipal codes). Make rules pluggable per
  state to be usable nationwide.
- ☑ **2.5 Legacy NFIRS flat-file export** *(DONE 2026-06-10 PM, W4.1 —
  utils/nfirsFlatFile.js: caret-delimited NFIRS 5.0 Basic Module transactions
  + header/trailer records, caret-injection neutralized, MMDDYYYY/HHMM
  conventions; wired as the NFIRS export in NFIRSReports.jsx (the old "NFIRS"
  button was a raw JSON dump). CAVEAT: field layout is best-effort per the 5.0
  Basic Module order — verify the first import with the state program.)* — for states still transitioning to
  NERIS. JSON export exists (`client/src/utils/nerisExport.js`); flat-file is
  ~half a day.
- ☑ **2.6 NERIS export validation tests** *(DONE 2026-06-10 — 19 golden-file tests / 58 assertions, in CI via client npm test)* — golden-file tests against the
  NERIS Core Data Schema.

## Phase 3 — Field-Grade Incident Command (HIGH)

Command screens are where lives are on the line; they are currently the least
hardened part of the client.

- ☑ **3.1 Error boundaries** *(DONE 2026-06-10 — ScreenErrorBoundary, 14 panel-level wrap sites: CommandBoard, LiveDispatch, ResponseMap, PAR, unit board, kiosk, TV)* on CommandBoard, ResponseMap, accountability/PAR —
  one malformed API response currently blanks the screen mid-incident.
- ☑ **3.2 Realtime unit status** *(DONE 2026-06-09/10 — Supabase Realtime Broadcast ~1s, NOT SSE (undeliverable on Vercel serverless); governed by the radio doctrine in CLAUDE.md)* — accountability/PAR polls at 60–120s; too
  slow for a PAR check. Extend the existing SSE channel (already used for
  dispatch) to unit status and accountability.
- ☑ **3.3 Dark mode** *(FULL APP 2026-06-10 late-night — after the
  command-screens-first slice shipped with a visible toggle, the partial state
  was wrong product-wise (toggle on → white pages elsewhere; Matt's call, and
  correct). Swept ALL 181 components same night: 6-agent fan-out, ~9,200 dark
  variants, every file @babel/parser-checked, build + 30/30 client tests
  clean. Global Moon/Sun toggle in the Layout top bar (+ the two
  command-screen toggles). Applied pre-paint, localStorage-persisted,
  OS-preference fallback. Known light-only stragglers (inline-style hex, no
  Tailwind classes — needs restructuring): StaffingPredictor,
  TrainingRecommender, PrePlanAI, LicenseActivation/LicenseInfoCard;
  ReportWriter printable correctly stays white for print/export. Still wants
  a human night-brightness pass.)* — night operations, apparatus-mounted displays.
- ◐ **3.4 Honest offline story** *(mechanisms SHIPPED 2026-06-10 PM, W4.4 —
  (a) sw.js: ACTIVE-INCIDENT surfaces (active-board, cad/alerts, units/status)
  + hazmat material/:un + placard/:code added to the stale-while-revalidate
  cache; fixed a real bug where the offline-503 fallback was unreachable
  (cached || fetchPromise || resp — a Promise is always truthy) so a
  cache-miss offline threw a raw TypeError; API cache bumped to v2.
  (b) offline queue hardened per the logged bug: push() validates
  method+url (rejects, never silently queues junk); flushQueue() drops
  permanent 4xx rejections + expires entries at 72h/10 attempts; transient
  failures (network/5xx/401/408/429) stay queued with attempt counts;
  api.js now attaches err.status so the queue can tell them apart;
  OfflineBanner reports dropped items. 6 executed tests cover the whole
  matrix. REMAINING: a human airplane-mode walk-through on a real device
  (roadmap requirement), and IndexedDB component-level read fallbacks
  beyond the SW layer if the walk-through finds gaps.)* — service worker is registered but offline
  does not deliver what the README claims. Test in airplane mode; make
  pre-plans, hazmat, hydrants, and the active incident actually work offline
  (IndexedDB cache exists — extend it), and fix the offline queue (no endpoint
  validation, queues invalid requests forever).
- ☑ **3.5 Accessibility pass** *(FULL APP 2026-06-10 late — after the
  command-screens slice: 5-agent fan-out added ~530 aria-labels across ~120
  components (every icon-only button named, every placeholder-only field
  labeled) + 27 clickable-div disclosure controls converted to real keyboard
  targets (role/tabIndex/Enter/Space/aria-expanded), incl. the LiveDispatch
  DispatchCard with a visible focus ring. Glove-target CSS layer from W4.3
  unchanged. Documented structural follow-ups (NOT silently skipped):
  clickable <tr> expanders + sortable <th> headers need in-cell buttons +
  aria-sort; a few nested-interactive and non-prop-forwarding wrapper cases
  listed in the agent reports. Screen-reader walk-through by a human still
  recommended.)* — ~29 ARIA attributes across 179 components;
  glove-friendly touch targets on command screens.

## Phase 4 — Server & AI Hardening (HIGH)

- ☑ **4.1 Refuse to boot without `JWT_SECRET`** *(DONE 2026-06-10 — config/jwtSecret.js throws in prod, 3 call sites)* — `middleware/auth.js:5` falls
  back to a known dev string.
- ☑ **4.2 Rate limiting + helmet** *(DONE 2026-06-10 — helmet app-wide; 30/15min on /api/auth; 5,000 global so a station behind one NAT IP never throttles mid-incident)* — none anywhere; prioritize unauthenticated
  endpoints (`hazmat.js`, `tvData.js`, `cad.js`).
- ◐ **4.3 Input validation library (zod)** *(W3.3 unauth surface SHIPPED 2026-06-10 PM; LEGAL-TABLE writes added same night late: exposure-records POST (typed body + in-station member FK check — was raw client member_id into a legal record), grievances POST (typed/capped), numeric :id fences on incidents/exposure/grievances. Caught-by-suite note: first attempt put the imports mid-file (TDZ crash) — the live tenancy suite caught it before commit. REMAINING: the long tail of interior routes adopt as touched; routeKit gives new routes validate by default.)* — replace ad-hoc per-route checks
  with shared schemas + validation middleware.
- ☑ **4.4 File upload validation** *(DONE 2026-06-10 PM, W3.1 — file_url restricted to http(s)/app-relative (no //, .., control chars), plain-filename file_name, type/size caps; validators unit-tested. Earlier same day: /files traversal guard.)* — `attachments.js` accepts client-supplied
  `file_url` with no path/type/size checks.
- ☑ **4.5 Hash the TV PIN** *(DONE 2026-06-10 — keyed HMAC, legacy PINs upgrade transparently on first use, verified live)* (`tvData.js`) — stored plaintext.
- ☑ **4.6 Centralize AI model config** *(DONE 2026-06-10 PM, W3.2 — sweep COMPLETE: 20 remaining sites across 17 files → AI_MODEL / AI_MODEL_HEAVY / OPENAI_MODEL in config/aiModel.js, incl. two dead 20241022-era strings; grep verifies zero hardcoded model strings remain.)* — model strings hardcoded in ~27 places,
  many outdated (`20241022`-era). One config; easy upgrades when models sunset.
- ☑ **4.7 AI cost guardrails** *(DONE 2026-06-10 PM, W3.5 — utils/aiBudget.js at the dispatcher choke point: per-dept daily ceiling (stations.ai_daily_token_budget → env → 250k), 429 BUDGET_EXCEEDED, real provider token counts in ai_usage, GET /api/ai/action/usage; prod schema hand-applied + verified; behavior verified by execution.)* — BYO-key departments have no token ceilings or
  spend tracking; a runaway loop is a real bill for a volunteer department.
  Per-department daily token budget + usage display.
- ☑ **4.8 Prompt-injection guards** *(DONE 2026-06-10 PM, W3.4 — utils/promptGuard.js (<station_data> delimiting + tag defang + 150k cap) at both dispatcher choke points so all 25 actions inherit; AI writes to legal tables now require explicit /apply confirmation (requiresConfirmation); auto_exposure handler rewritten — old one inserted nonexistent columns + skipped audit.)* — user data is interpolated into prompts
  that can dispatch the 26 AI actions. Sanitize inputs; require explicit user
  confirmation for any write action.
- ◐ **4.9 Secrets hygiene** *(half DONE 2026-06-10 PM, W3.2 — API keys redacted from every AI error/log path via sanitizeAIError. REMAINING: physically move the license signing key out of the repo folder (keys/ is gitignored but still on disk in the repo tree) — deploy-affecting, coordinate with Matt/Dale.)* — license signing key in `keys/` is correctly
  gitignored (verified); move it out of the repo folder entirely. Don't log
  API keys in error paths (`aiAction.js:122`).
- ☑ **4.10 CORS/CSRF review** *(DONE 2026-06-10 PM, W3.6 — refresh cookie sameSite none→lax (COOKIE_SAMESITE env escape hatch; every supported flow is same-origin), real app domains in the CORS default list, credentials never offered with origin:'*'. Residue: one human login round-trip to confirm the cookie change in prod.)* — `sameSite: 'none'` cookies + broad origin list.

## Phase 5 — Safety Net & Operations (ONGOING)

- ◐ **5.1 Test foundation** *(CI live on every push 2026-06-10: tenancy guard + isolation + TV-PIN + unitMatch + NERIS golden + client build; grow with W2.5 and beyond)* — currently zero automated tests across 160K lines
  / 574 endpoints. Start with: tenancy isolation (1.3), NERIS export (2.6),
  command-screen smoke tests. Wire into CI on every push.
- ☑ **5.2 Structured request logging** *(DONE 2026-06-10 — middleware/requestLog.js, one JSON line per authed request, ids only, never bodies/PII)* — who accessed what, when (replaces
  bare `console.error`); required for the audit trail in 2.2.
- ☑ **5.3 "Export all my data" endpoint** *(DONE 2026-06-10 PM, W4.5 — GET /api/export/all, chief-only, built on the W3.7 routeKit: every station-scoped table (information_schema discovery) WHERE station_id = caller, own stations row, passwordHash/tv_pin stripped, soft-deleted rows included, audit-logged. Verified by execution: 101 tables / station-1 rows exported, non-chief 403.)* — departments will ask; it is also
  an AGPL trust signal and the disaster-recovery story.
- ☑ **5.4 Unified error response schema** *(DONE 2026-06-10 PM, W3.7 — { error, code?, details? } via middleware/errorHandler.js + unified 404; 5xx internals genericized, logged key-sanitized; existing routes converge as they migrate to routeKit.)* across all routes.
- ☑ **5.5 Shared route boilerplate** *(DONE 2026-06-10 PM, W3.7 — utils/routeKit.js: scoped() fails CLOSED (401 NO_STATION, never station 1), httpError(), validate re-export; exportAll.js is the reference implementation; existing routes migrate opportunistically, no drive-by refactors.)* — auth, scoping, errors, validation in
  one place so new routes can't skip security checks.

---

## Sequencing

Phases 1 and 2 are the difference between a demo and a product departments can
bet their compliance on. Phase 3 is the difference between station software and
incident software. Phases 4 and 5 keep it that way as it grows.

Recommended order of attack: 1.1 → 4.1 (one-liner) → 2.1 → 2.2/2.3 → 1.2/1.3 →
Phase 3 → remainder.
