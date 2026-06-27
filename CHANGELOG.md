# Changelog

All notable changes to OpenFirehouse are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version numbers follow [Semantic Versioning](https://semver.org/) once
tagged releases begin; until then, this changelog tracks notable changes
on `main`.

## Unreleased

### Security
- **Bug reports are now private to each department.** A chief sees and can act on only their *own* department's submitted bug reports — never another department's — closing a cross-tenant visibility gap. The OpenFirehouse support team can still see all reports across departments (configured via an allowlist), so support and triage are unaffected.
- **Apparatus endpoints now reject malformed record IDs up front.** The apparatus read/update/delete and unit-login routes validate that the ID in the URL is a well-formed number before any database work (shared zod validation), returning a clean 400 instead of letting a bad value reach the query — continued hardening of the API's input validation.

### Added
- **Tactical sketches drawn on a pre-incident plan are now saved to the department's records.** A pre-plan can now store the tactical sketch (the vector strokes an officer draws over a building) on the record itself, so a sketch made on the apparatus iPad is archived and available to the department and across devices — not stranded on the one tablet it was drawn on. (Enables the OpenFirehouse Mobile sketch sync; the strokes are kept as re-editable vectors.)
- **Hydrants on the incident map are now color-coded by available fire flow (NFPA-291).** Each hydrant pin is colored to the NFPA-291 standard — light blue for Class AA (≥1500 GPM), green for Class A (1000–1499), orange for Class B (500–999), red for Class C (<500) — so command can read available water at a glance. The class is shown on the pin and in its detail panel, with a color legend on the map.

### Changed
- **Every map in the app now runs on Apple Maps.** The apparatus response-tracking map (Command Board) and the GIS incident map (hydrants, pre-plans, Knox boxes, active incidents) have been moved to Apple Maps, joining the live dispatch map that already used it — so every map surface looks and behaves like one consistent, high-quality product. The previous open-source mapping library was removed from the app entirely. Live apparatus positions, status colors, response routing, and the click-for-details behavior are all preserved.

### Added
- **Every roster member is now tied to their login and their certifications by a stable identity — so staffing is scored against the right person, every time.** A member's record, their account, and their certifications are now linked by a permanent internal ID rather than matched by name. This removes a real life-safety risk: two firefighters with similar names (e.g. "Nathan McGee" and "Nathan P. McGee") can no longer be confused when the board scores who's qualified for a seat. New departments are fully linked from day one — when a chief signs up, they're added to the roster and linked automatically. For existing departments, a chief-only **"Roster setup → Unlinked members"** card lists any roster record that isn't yet tied to a login and suggests the right account **with the matching evidence shown** (email / SSO id), so the chief confirms a reason, not a guess; a one-tap **Confirm** links them, or an invite can be created inline when no login exists. Linking happens in setup and never interrupts dispatch.
- **A responder who isn't linked to a roster member is shown as "Unlinked," never silently scored.** On the staffing board (web and iPad), a person who responds but can't be matched to a confirmed roster member gets a distinct **Unlinked** tag — visually separate from Qualified / Partial / Open — telling command "this person responded but isn't confirmed in the roster yet," with a prompt to resolve it in Roster setup. The board never guesses a qualification it can't stand behind.
- **Personnel record history.** A read-only history view shows the audit trail for each member — who linked the login, who verified which rank, and when — drawn from the append-only audit log (no edit or delete path exists on those records).
- **SSO/SCIM-ready identity.** The data model now carries the standard correlation fields (`external_id`, agency `personnel_id`) so single-sign-on and automated provisioning can be added cleanly for large agencies later, without a rewrite. (Design + columns only; no SSO server is built until a customer needs it.)

### Changed
- **The live-incident responder record now carries the stable member link, and "planned vs. responding" is shown honestly.** When a responder declares a seat, their account is resolved to the roster member at write time and stored on the response, so accountability and qualification scoring no longer fall back to matching by name. If a responder takes a seat the run-list planned for someone else, the board shows both ("planned X · responding Y") rather than the planned name silently disappearing. Burnout/workload counts also resolve by the stable member link, so duplicate names aren't double-counted.

### Changed
- **The alert feed now reflects each department's real, live data.** Cert-expiration, apparatus-service, equipment-inspection, and shift-understaffing alerts are now computed server-side from the department's actual records (`GET /api/alerts`), replacing a bundled demo dataset that showed the same content to everyone. A real department sees its own alerts; a brand-new department with no data yet sees a clean, empty feed instead of demo content. Rank-notification gating and the cert crew/station/own scope are applied server-side, and a failed load is surfaced (never shown as a false "all clear").

### Added
- **Notifications are now set by rank, not per person — and the chief controls the rules.** Which alert categories each rank receives (incident dispatch, training, certification expirations, bulletins, schedule changes, apparatus/equipment, meetings) is determined by rank tier — firefighter, Lt/Captain, BC/DC/Chief — so everyone of a rank gets the same, relevant alerts. Sensible defaults are built in (everyone gets the safety/operational essentials; apparatus and meeting alerts default to officers-and-up), and a chief can adjust the per-rank rules in Station Settings → Notifications by Rank. Certification-expiration alerts are scoped by rank: a firefighter sees only their own, command sees all (officer scope is by station for now, tightening to assigned crew in a later release).

### Added (continued, org structure)
- **Standing crew assignment — officers see their own crew's certifications.** Each member can be assigned a standing **unit** and **group** by the chief (e.g. Ladder 1, Group 4), and the app now scopes certification-expiration alerts by who actually oversees whom: a **career** company officer sees only the cert alerts for the firefighters in their unit + group; a **volunteer** officer sees their station; **command** (BC/DC/Chief) sees everyone; a **firefighter** sees only their own. The model serves both career (platoon/group crews, one officer per unit+group) and volunteer departments (centralized oversight) from one schema — assignment is a chief-managed record field, never self-set. (Researched against NFPA/NVFC/USFA and how mature RMS/staffing platforms model career-vs-volunteer staffing.)

### Changed
- **Removed the per-member setup wizard.** A member never self-configures their profile or notifications: name, rank, and certifications are entered and verified by the chief/BC (so members can't enter false record data), and notifications follow rank rules. The first-login wizard, which collected this from the member and discarded it, has been removed. The chief Department Setup Wizard is unchanged.

### Added (continued)
- **Unit logins — sign in as the apparatus, not just a person.** A department can now provision a dedicated **unit login** for each rig (e.g. "Engine 1"). When a mounted in-cab device — iPad **or laptop** — signs in as the unit, it enters a rig terminal: the operational + rig surface only (dispatch & size-up, the live map, apparatus/equipment/inventory checks, maintenance, fuel log, pre-plans, hydrants, hazmat, inspections), and it automatically reports its GPS so the rig shows live on the dispatch map with its own response route. The web app and OpenFirehouse Mobile behave identically. Records authoring (incident narrative, NFIRS/NERIS) and personnel/admin are not available from a shared rig terminal — a member or officer logs in for those. Member and officer logins are unchanged.
- **Qualification-weighted staffing — apparatus staffing tagged by certification, scored against each rig's minimum positions.** The daily Apparatus Assignment Board and the live incident responder view now score every filled seat as **Qualified / Partial / Unverified / Open** against members' certifications (active and unexpired), showing each seat's required certs and any the assigned member is missing. A firefighter riding an officer seat is correctly labeled **Acting** (A/C / A/L) for the shift — never "FF" in an officer slot — because qualification is decided by certifications while rank decides the title. Volunteer responders can declare which apparatus and seat they're covering. All certifications are unified under one canonical taxonomy so the same cert (e.g. "Firefighter II", "FF II") is recognized consistently across the app. Advisory only — the board never changes a unit's dispatch status.
- **Hazmat Reference (ERG 2024) — the full FireHazmat reference library, now in the web app.** The web app's hazmat section is now powered by the same ERG 2024 dataset and screens as the FireHazmat mobile app: Search (by name, UN, CAS, or guide #), the DOT placard grid, the unknown-substance Wizard, full material detail (isolation & protective-action distances incl. Table 3, GHS classification, exposure limits, recommended field instruments, PPE advisories, CHEMTREC), and full ERG response guides. Materials are enriched (3,541 materials, 62 guides, 272 isolation distances, 26 Table-3 entries) — GHS pictograms/hazard statements, molecular identity, vapor behavior, carcinogen flags, and more. The dataset is served from the server and never bundled to the browser.

- **Marketing site is now in the repo and git-deployed.** The public landing page at `openfirehouse.openscaffoldlabs.com` lives at `marketing/` in this repo (a self-contained `index.html` + `vercel.json`) and deploys from `main` via the `marketing-site` Vercel project, replacing a hand-uploaded, un-versioned file. The page was rebuilt to cover the full module set.

### Changed
- **Hazard severity is now derived from objective ERG/DOT facts, not a hand-set flag.** Material and guide hazard advisories (Toxic Inhalation, Explosive, Radioactive, Polymerization, Water-Reactive, Pyrophoric) are computed at display time from the ERG data itself, so they're consistent everywhere and never out of date.

### Removed
- **Retired the old in-app hazmat screens and the "above/below the line" classification.** The previous ERG reference screen and the hazmat inventory tracker were replaced by the new FireHazmat-powered reference. The legacy "above the line / below the line" hazard flag has been removed entirely (data and schema) in favor of the derived advisories above.

### Security
- **Every AI feature now runs through one guarded path — with a daily spend limit
  that actually works.** All AI calls go through a single helper that enforces a
  per-department daily token budget, guards against prompt-injection in record
  data, and never leaks API keys in error messages. A latent bug meant the budget
  was recorded against the wrong key and never actually accumulated — so it never
  capped anything; that's fixed, and AI usage now counts toward the department's
  daily limit (over-limit requests return a clear "budget reached" instead of
  silently running up cost). The per-firehouse "bring your own API key" assistant
  and workflow chat keep their own key and conversation history, now with the same
  budget + injection protections.
- **The live radio feed now authenticates with your verified login, not a claimed
  station id.** The real-time radio WebSocket previously trusted whatever station id
  a client sent — which, on a self-hosted/Docker deployment, let any client subscribe
  to another department's live radio traffic. Connections now authenticate with the
  user's verified session token (or, for wall displays, the TV PIN); the department is
  derived on the server and never taken from the client. Wall displays are keyed to
  their department so a multi-firehouse department shares one feed correctly.
  (Cloud deployments were never exposed — they don't run a persistent WebSocket.)
- **Scheduled (cron) endpoints now fail closed.** The daily reconciliation and
  retention jobs previously ran open to anyone if the cron secret happened to be
  unset; in production they now reject the request (503) when no secret is configured,
  and verify the secret in constant time. Production behavior is unchanged when the
  secret is set (as it is).
- **Demo-data seeding is double-gated.** The admin "seed demo data" action — which
  wipes and rebuilds the sample department's records — now runs only when demo mode
  is explicitly enabled *and* an explicit confirmation token is supplied, and the
  underlying routine refuses to run without that confirmation. This removes any path
  to accidentally wiping a real department's data.

### Fixed
- **The mobile staffing board and the web run list now always show the same crew.** The mobile
  (iPad) staffing board was reading the most-recent run list regardless of date; it now reads the
  run list for the incident's own date — the same date-keyed read the web run-list board uses — so
  the two surfaces always reflect the same assignments. (The mobile board additionally overlays who
  has responded to the active call.)
- **An incident response now records the responder's real name, so their certifications are
  recognized.** Responses were storing the login username instead of the member's name, which meant
  the staffing board couldn't match the responder to their roster record and showed them as
  "Unverified." The member's actual name is now carried through, so a responder's qualifications are
  scored correctly. (The durable account↔member link is a follow-up.)
- **Dispatch alerts reach every firehouse in a multi-house department.** The realtime
  "new call" ping was addressed using the station id instead of the department id, so
  in a department with more than one firehouse the alert could be broadcast on the
  wrong channel. It now always uses the department id, matching the rest of the
  realtime delivery. (No effect on single-station departments.)
- **A dismissed incoming-call banner stays dismissed.** The live dispatch banner read
  a stale copy of "which alert was dismissed," so under some conditions a dismissed
  call could re-trigger its banner/auto-jump on the next refresh. It now always reads
  the current dismissed state.
- **Command Board unit list renders reliably during a call.** The on-scene unit list
  was keyed by position, so removing a unit mid-incident could briefly flash the wrong
  apparatus. Units are now keyed by stable id, and every dispatch path assigns one.
- **The in-app "Simulate Dispatch" button works again.** It posted to the public CAD
  webhook endpoint, which now requires the webhook secret — so simulated dispatches
  appeared on screen but never persisted or broadcast. A new authenticated
  `POST /api/cad/simulate` (dispatch role) runs it through the real dispatch pipeline,
  scoped to your department, so test dispatches persist and broadcast like real ones.
- **The dispatch alert feed and call-clearing now work correctly under row-level
  security.** The CAD endpoints are mounted alongside the unauthenticated CAD
  webhooks, ahead of the per-request tenancy middleware, so under RLS they weren't
  receiving the department context — the alert list/lookup returned nothing and
  "clear call" silently did nothing for every department (masked because the live
  dispatch banner is delivered over the realtime channel, not the list refetch).
  Those endpoints now establish the department context themselves, matching how
  the TV feed and dispatch pipeline already work. Found by a fresh-department
  onboarding audit (a brand-new department couldn't see a CAD alert it had just
  received).
- **Bulk data import is now safe to re-run.** The generic importer (members,
  incidents, training, apparatus, assets) now runs the whole batch in a single
  database transaction (a failure mid-import rolls everything back instead of
  leaving a half-finished import), caps the number of rows per import, and is
  idempotent — re-importing the same file no longer creates duplicates (existing
  records are matched by a natural key and skipped, and duplicate rows within one
  file collapse). Invalid rows are skipped and reported rather than aborting the run.

### Changed
- **Unit status now matches real firehouse radio doctrine.** The unit-status board uses
  seven statuses — **In Service, On the Air, Dispatched, En Route, On Scene, Returning,**
  and **Out of Service** — and a unit is dispatchable only when it's **In Service,
  Returning, or On the Air**. "On the Air" is new: a rig that's in service and in-district
  but out of quarters (driver training, district familiarization) and still available for
  calls. "Available" was renamed to "In Service," and the rarely-used "Staging" and
  "Committed" states were retired. As always, the app never auto-changes a unit's status —
  dispatch updates it after radio traffic.
- **Removed dead, server-ignored station-id parameters from the web app.** Several
  modules (equipment checkout, incident costs, policy acknowledgments, meeting minutes,
  correspondence, attachments, and the personal assistant) were sending a station id
  the server already ignores — it derives your department from your login. These
  vestigial parameters were removed; behavior is unchanged. Also removed two unused
  internal radio-feed components.

### Added
- **Live apparatus location (backend).** Apparatus can now report their real-time
  GPS position to the department, and a new feed returns every rig's latest fix from
  the last few minutes — the foundation for showing where each unit is on the live
  dispatch map and on the in-cab app. Positions are stored per department and isolated
  at the database level (row-level security), low-accuracy fixes are rejected, and an
  update is broadcast on the department's realtime channel so any connected screen
  updates instantly. (Consumed by the new OpenFirehouse in-cab app; the web map
  display is next.)

- **See every rig move on the map — in the cab and on the wall.** The live dispatch
  maps now plot each apparatus as a status-colored dot at its real GPS position,
  updating live as units move. The command board's apparatus-tracking map and the
  idle coverage map both show genuine positions (the old simulated convergence
  animation is gone). In the new OpenFirehouse in-cab app, the Dispatch screen shows
  the rig's real dispatch status and a "Tracking · last fix" GPS indicator, and a new
  Live Map tab shows your rig (ringed) and every other unit in the department on an
  Apple map. The map is never a dead end: if tiles can't load, a live unit list takes
  over. All of it updates over the department's realtime channel with a polling
  backstop.

- **Station selector for multi-firehouse departments.** A new house picker in the
  sidebar lets departments with more than one firehouse filter the unit-status board,
  apparatus list, and member roster to a single station — without restricting what the
  server returns. For single-station departments the picker is invisible; for
  multi-house departments a dropdown shows station names. Selecting "All houses"
  restores the full department view.

- **Per-department CAD webhooks.** Each department can now connect its *own* CAD
  feed: creating a CAD connection generates a unique webhook secret (shown once),
  and inbound dispatches presenting that secret are automatically routed to that
  department and its station — no shared, deployment-wide configuration. The
  existing global webhook secret still works as a fallback.

### Changed
- **Database performance: per-department indexing across the board.** Every
  per-department table now has an index on its department column, so as more
  departments come on board each one's data stays fast to read regardless of how
  large the shared tables grow. Invisible to users; it keeps the app snappy at
  scale and makes the database-level isolation checks cheap.
- **Multi-firehouse readiness.** Live dispatch and unit-status updates are now
  delivered per *department* rather than per *station*, and incoming records are
  tagged with their department resolved from the station they belong to — so a
  department with more than one firehouse works correctly end to end. No change
  for single-station departments.

### Added
- **Hydrant GPS + NFPA 291 map view.** Each hydrant now stores lat/lng coordinates.
  A MapKit JS pin-drop widget in the hydrant form lets crews capture GPS by dragging
  a pin or using device geolocation. A new full-screen Map View shows all hydrants
  color-coded by NFPA 291 flow class (AA ≥1500 GPM blue, A green, B orange, C red,
  unrated gray) with filter buttons by class and a detail panel on selection.
- **Bulk hydrant import — ArcGIS Feature Service + CSV.** A 4-step import wizard
  (Source → Preview → Confirm → Done) pulls hydrants directly from any ArcGIS/ESRI
  REST endpoint (SSRF-protected allowlist) or from uploaded CSV/TSV files. The
  preview step shows a table with NFPA 291 badges and GPS pin indicators before
  any data is committed. Existing hydrants are matched by hydrant number and
  updated in-place; new records are inserted — all in a single transaction.
- **Pre-plan NFPA 1620 completeness scoring.** The pre-plan form now shows a
  real-time progress bar scoring 8 NFPA 1620 required components (occupancy ID,
  address, construction, hazards, access, water supply, suppression, evacuation).
  Color shifts green/amber/red as completeness changes.
- **Pre-plan Evacuation tab + review workflow.** A new Evacuation tab captures
  evacuation routes and a formal review/approval record (reviewed by, date, notes).
  A checklist at the bottom shows which NFPA 1620 sections are complete vs. missing.
- **Pre-plan satellite map with hydrant overlay.** Each pre-plan detail view now
  shows a MapKit JS satellite map that geocodes the occupancy address, drops a
  property pin, and overlays nearby hydrants (within 500 m) as NFPA 291
  color-coded pins with a legend.
- **CAD dispatch → pre-plan auto-surface.** When a new dispatch arrives, the system
  fuzzy-matches the CAD address against pre-plan addresses using Jaccard token
  similarity (abbreviation-aware; threshold 0.75). If a match is found, the dispatch
  notification banner shows a Building Intel panel with the occupancy name, risk
  level, and hazard count. A "View Building Intel →" button navigates directly to
  the matching pre-plan.
- **Pre-incident plan PDF export.** Each pre-plan can now be exported as a
  professional 4-page PDF (NFPA 1620 template): cover/occupancy profile,
  hazards & access, water supply/suppression/utilities, evacuation routes &
  review/completeness checklist. Generated server-side with PDFKit; no data
  leaves the server. Export PDF button added to the plan detail header.


- **Self-serve department signup (preview, off by default).** A new
  `POST /api/auth/signup` endpoint creates a brand-new department and its founding
  chief account in a single step — no manual setup or SQL — and chiefs can view
  and update their department (including re-attesting size, which is advisory and
  never blocks) via `/api/departments`. It is dark-launched behind a feature flag
  and disabled in production until onboarding is finished.
- **Stand up your department in-app — stations, apparatus, and a setup wizard that
  remembers your work.** Chiefs can now create and edit their fire stations
  (firehouses) and assign apparatus to specific houses directly in the app. The
  first-run Department Setup Wizard now saves every step to your department on the
  server — not just in this browser — and resumes where you left off if you close
  it partway through, covering identity, stations, apparatus, mutual-aid partners,
  shift style, and your AI key. Single-station departments see a streamlined view;
  multi-house departments get full controls. Apparatus edits now require officer
  rank or above.
- **Add your whole crew — member invites, chief verification, and a member setup
  wizard.** Chiefs can now give each member a login: add them to the roster and
  generate a single-use invite link to hand over (no email required), which the
  member redeems to set their own password. New members start with member-level
  access only; a chief verifies their rank to grant officer/command permissions,
  and every step is recorded in the audit log. Members get a personal setup wizard
  with a clear "awaiting verification" state so the app is never empty while they
  wait. Removing a member now **deactivates** them rather than deleting — their
  exposure history and personnel records are preserved as required for legal
  recordkeeping.
- **Self-service crew sign-up with a department join code.** Instead of inviting
  members one at a time, a chief can generate a single department join code to
  share; members enter it to register their own login. They start with
  member-level access and stay pending until a chief verifies their rank — so a
  shared code never grants elevated access on its own. Codes are rotatable and
  expire.
- **Plan tier & license status at a glance.** Settings now shows whether your
  department's attested size puts you on the free Independent tier or a paid tier,
  your current license status, and — when a paid license is needed — a direct link
  to get one. It also shows your **storage usage against your tier's quota** (5 GB
  Independent up to 1 TB Metro), with an 80% warning and an overage estimate
  ($0.05/GB/month). Purely informational: OpenFirehouse never blocks features or
  storage based on tier (you keep your tier through the paid year and re-attest at
  renewal).

### Security
- **Provisioning & onboarding events are audited.** Self-serve department signup,
  member invite acceptance, and join-code self-registration now write to the
  append-only audit log, alongside the existing coverage of member invites, rank
  verifications, and deactivations — a complete trail of who joined and when.
- **Signup verifies the department's email.** Self-serve signup now requires a
  contact email and sends a single-use verification link; the address is marked
  verified when the link is clicked. This filters bot/spam signups and confirms a
  reachable, real department — without blocking login (you can use the app while
  unverified; verification is a trust signal, not a gate).
- **Database-level department isolation is now enforced, not just app-level.**
  Previously, every department's records were kept apart only by application
  code adding a "which department" filter to each query — a single missed
  filter could have exposed one department's data to another. The application
  now connects to the database as a restricted account that is itself subject
  to per-department row security: the database independently refuses to return
  or modify any row outside the signed-in department, regardless of what the
  application asks for. This is defense-in-depth — even a bug in application
  code can no longer cross the department boundary. The login step uses a
  narrowly-scoped, audited path to look up a user's department before that
  boundary is applied. No change to what any user sees; the guarantee behind
  it is now much stronger and ready for multiple departments on one
  deployment.
- **Per-department licensing.** License activation, status, and deactivation
  are now scoped to the signed-in department and gated to chief-level users,
  so one deployment can serve many departments each with its own license.
  Activation refuses a license whose department doesn't match the caller's.
- **Closed a database privilege gap in department membership.** The restricted
  database account the application uses could, in principle, have written
  department-membership records directly. It no longer can: all membership
  changes now flow through a small set of audited, access-checked database
  routines, and those routines are executable only by the application account —
  never by any anonymous or public database role. This removes a path by which a
  signed-in user could have attached themselves to a department they do not
  belong to. (Groundwork for self-serve department signup and member onboarding.)
- **Member invites are now covered by database-level department isolation too.**
  The member-invite table was the last one still relying on application code alone
  to keep departments apart, because the "accept invite" step runs before anyone is
  signed in. Accepting an invite now goes through a single audited, access-checked
  database routine (executable only by the application account), which let us turn
  on the same per-department row security that protects every other table. Invites
  remain redeemable by the one-time link as before — the isolation guarantee behind
  them is now enforced by the database, not just the app.
- **Legal records can no longer be wiped by deleting a member.** Exposure records
  and personnel actions are legally retained, subpoenable history. They were set to
  auto-delete if a member record were ever deleted; the database now refuses to
  delete a member who still has such records attached. Member removal already works
  by deactivation (never deletion), so this adds a hard safety net beneath that rule.

### Fixed
- **`/health` now reports what's actually deployed.** It previously returned a
  hardcoded version that never changed, which made it impossible to confirm which
  build was live. It now reports the real application version plus the deployed
  commit, branch, and environment — so a deployment can be verified at a glance.
- **No spurious "DB initialization failed" on production cold starts.** With
  database-level isolation enabled, the app runs as a restricted account and the
  schema is managed by hand, so the startup schema-setup step no longer runs at
  all in that mode (it would otherwise attempt owner-only operations the
  restricted account can't perform and log a confusing — though harmless —
  error). Fresh self-hosted installs still run full setup as before.
- **Fresh installs boot again.** A brand-new install pointed at an empty
  database could never start: recent index/security hardening in the schema
  init ran before the tables it referenced were created, and a failed first
  init was cached so retries could never recover. The hardening now runs
  after all tables exist, and a failed init is retried properly. Existing
  databases are unaffected.
- **Exam assignment works again.** Assigning an exam to members failed for
  everyone because the eligibility check referenced a column that doesn't exist
  on the shared login table; it now scopes correctly. A build-time guard was
  added so this class of error can't slip back in.

### Added
- **Department scoping now consistent through the route layer.** Completed the
  pass so request handlers and their queries reference the department
  throughout, not just the central data layer — the access boundary is now
  uniformly the department. The shared login-identity table and a few
  cross-agency tables (live location shares, incident media) intentionally
  remain station-scoped for now. No behavior change for the current
  single-station customer.
- **Department-scoped data access across the board.** The central data layer
  now scopes every read and write by department rather than by station, so all
  records — training, scheduling, budget, hydrants, inspections, grievances,
  and the rest — are shared across a department's stations, matching how a real
  department operates. Behavior is unchanged for today's single-station
  customer; the station is retained on each record as a "which house" tag.
- **Live dispatch feed now keyed on department.** The dispatcher's active CAD
  call list and the clear/clear-all actions are now department-scoped; incoming
  CAD alerts still record the dispatching station as the call's origin. (The
  real-time notification channel remains station-keyed for now — that rename
  needs a coordinated client update and is handled separately.)
- **Apparatus access now keyed on department.** Apparatus (units) are read,
  created, edited, and removed by department; the station now records which
  house a rig lives in rather than acting as the access boundary. Apparatus
  designations are unique per-department, so two departments can each run an
  "Engine 1." Fixed a demo-data seeding path affected by the new
  per-department uniqueness.
- **Incident access now keyed on department.** Incident reports — the legal
  record — are now read, edited, and soft-deleted by department rather than by
  the single station, with the per-department incident-number rules preserved.
  Behavior-identical for the current single-station setup.
- **Member access now keyed on department (Phase 3 begins).** Member lookups,
  edits, and the auto-assigned member number are now scoped to the department
  rather than the single station, and member numbers increment per-department.
  A database safeguard keeps the department tag in sync on every write during
  the transition, so the change is behavior-identical for the current
  single-station setup while laying the groundwork for true department
  isolation.
- **Login now carries the department.** Authentication resolves which
  department a user belongs to (from the new membership table, falling back to
  their station during the transition) and includes it in the session — so the
  app can begin scoping by department. A user with no resolvable department is
  refused, the same way a user with no station already was. Behavior is
  otherwise unchanged: the app still operates per-station until the next phase.
- **Multi-tenant foundation: departments.** The platform now models a
  *department* (a fire department — many stations) as the customer, alongside
  the existing per-station data. New `departments` and `user ↔ department`
  tables, plus a department tag on every record (backfilled from the current
  station, so nothing changes behavior yet). Member numbers and apparatus
  designations are now unique per-department rather than globally, so two
  departments can each run an "Engine 1." Shipped as a tracked, reversible
  database migration; full department-scoped access enforcement is a later
  phase. Test data can be reseeded into the real shape (a 7-station metro
  department plus a small volunteer department) for the isolation tests.
- **Department-isolation attack coverage nearly tripled.** The two-station
  attack suite grew from 10 to 27 route families — apparatus, training
  records, department documents, SOGs, budget, hydrants, investigations,
  personnel actions, wellness (medical), NFIRS reports, pre-plans, station
  log, timesheets, leave, attachments, live CAD alerts, and the full
  department data export are now actively attacked cross-tenant on every
  opt-in run. The unauthenticated tenant paths — the TV display (station
  PIN), radio hardware ingest (per-station API key), and the iCal feed
  (subscription token) — are also tested: each must resolve to exactly one
  department and reject an unknown credential rather than falling back to a
  default. A second round added shifts/scheduling, mutual-aid (logs and
  agreements), fire-inspection properties/inspections/permits, recall events,
  workflow tasks, and the run-list snapshot — bringing the suite to full
  coverage of the station-scoped route families.
- **CI runs the isolation suite on every push.** A throwaway Postgres
  service container means the two-department attack suite — which boots the
  app against an empty database — now gates every push and pull request,
  instead of only running when a developer opts in locally.
- **Tracked database migrations.** A small forward-only migration runner
  (`server/scripts/migrate.js`) now records every applied schema change in an
  `of_schema_migrations` table, so database changes are repeatable and auditable
  instead of hand-applied with no record. Run manually by an operator — it never
  runs during a deploy, so app startup is unaffected. The recent security/index
  hardening is captured as the first tracked migration so brand-new installs get
  it automatically.
- **Dark mode everywhere.** The night theme now covers the entire app — every
  screen, form, and modal — with a global sun/moon toggle in the top bar. The
  last hold-out screens (styled with fixed colors) were rebuilt to follow the
  theme, and a design audit of the live app fixed washed-out text on the
  greeting banner and notice headers.
- **Screen-reader and keyboard support app-wide.** ~530 controls that were
  icon-only or unlabeled now announce themselves properly; expandable
  cards (including dispatch calls) work with Enter/Space and show a visible
  focus ring; sortable table columns are real buttons that announce their
  sort direction; and every expandable table row has a keyboard-reachable
  expand control.

### Removed
- **Dead real-time plumbing.** The legacy server-sent-events dispatch stream
  (which could not deliver on the serverless platform and had no remaining
  consumers) was removed — all live dispatch delivery, including the
  always-on Watch Desk display, runs on the reliable realtime channel.
- **Department-isolation attack tests.** The two-station test suite grew from
  4 to 10 route families — it now actively attacks vacancy fills, Knox-box
  logs, 911 call records, training-record enumeration, mutual-aid resources,
  and message injection on every opt-in run, so the holes closed in the
  isolation audit can never silently reopen.
- **Typed validation on legal-record writes.** Exposure records and grievances
  now validate input shape and size at the door, and an exposure record can
  only reference a member of your own department.

### Fixed
- **Document package panel always showed "Failed to load package."** It was
  reading a sign-in token that never existed; incident document packages now
  load correctly.


### Fixed
- **Fresh-install seeding could break the database connection.** One hazmat
  seed module closed the shared database pool mid-startup on a brand-new
  install (existing installs were unaffected), which could leave a fresh
  deployment unable to serve requests until restart. The seed now matches its
  sibling modules and leaves the pool open.

### Security
- **Department data is no longer readable directly from the database.** The
  Supabase database exposes a public REST API, and with row-level security off,
  anyone holding the app's public key (which ships in the browser) could read
  member, incident, and even login tables — including hashed passwords —
  straight from the database, bypassing the server entirely. Row-level security
  is now enabled (deny-all) on all 91 remaining OpenFirehouse tables, so that
  public path returns nothing. The app is unaffected (it connects as the table
  owner, which bypasses the rule). Verified: reads that previously dumped
  password hashes now return empty.
- **CAD dispatch webhooks now require authentication.** The incoming-dispatch
  endpoints accept a call and notify every member's device — and the catch-all
  ("generic") endpoint had no authentication at all, so anyone who learned the
  URL could inject a fake dispatch. All CAD webhooks now require a shared secret
  (`CAD_WEBHOOK_SECRET`, sent as a header or URL parameter), enforced centrally
  so every vendor path is covered. In production the endpoint fails closed if no
  secret is configured, and the webhook routes are rate-limited.
- **Closed a direct-to-database read of stored integration credentials.** The
  CAD-connection and radio-config tables — which hold the API keys for the
  dispatch and radio feeds — were readable over the database's public REST API
  using the anon key that ships in the browser app, bypassing the server
  entirely. Row-level security is now enabled on both (deny-all to that public
  path); the app is unaffected (it connects as the table owner). Verified: a
  read that returned the full credential rows now returns nothing.
- **Per-department query indexes on the remaining hot tables.** Added the
  foreign-key covering indexes the database advisor flagged (17 in all,
  including the live unit-status board's apparatus join) so per-department reads
  don't full-scan as history and departments grow.
- **Role-based authority on privileged actions.** Editing the member roster now
  requires officer rank or above; department settings (FLSA/overtime config),
  the TV display PIN, and bulk data imports now require chief authority. The
  role-level map is enforced server-side and kept in lock-step with the app's
  access levels by a guard test.
- **Department isolation, line-by-line.** Every API route was read end-to-end
  and every remaining cross-department hole closed: another department can no
  longer read your training records, 911 caller details, Knox-box access
  history, or push notifications, nor modify your vacancy fills, mutual-aid
  resources, fundraising totals, or messages. Static guard tests now catch
  four additional bug patterns so these can't regress silently.
- **Uploaded files are department-private.** Fireground photos and
  correspondence attachments are now served only to members of the owning
  department (previously any signed-in user who knew a filename could fetch
  them on self-hosted installs).
- **Attachment links are validated.** Attachment URLs must be real web links
  or in-app paths — script-injection style links are rejected.
- **API keys can no longer leak into logs or error messages.** AI provider
  errors (which can echo your API key) are redacted everywhere they're
  logged or returned.
- **Stricter input validation on public endpoints** (login, TV display,
  hazmat lookups, CAD webhooks) with clear validation errors.
- **Prompt-injection guards on all AI actions.** Text inside your records
  (radio transcripts, CAD payloads, notes) can no longer steer the AI;
  AI-generated exposure records now require explicit review before saving
  and are written to the audit trail.
- **Tighter cookies and CORS.** The session-refresh cookie no longer works
  cross-site; allowed web origins are explicit.
- **Sign-in requires a station assignment.** Accounts with no department
  fail closed instead of defaulting into department 1.
- **Scheduled jobs are authenticated** (CRON_SECRET).

### Added
- **Daily AI budget per department.** A configurable daily token ceiling
  (default 250k) protects bring-your-own-key departments from runaway AI
  bills; usage is metered per action and visible via the API.
- **"Export all my data."** Chiefs can download every record their
  department owns in one JSON file — the disaster-recovery and
  walk-away-anytime story.
- **NFIRS 5.0 flat-file export.** The NFIRS export now produces the real
  caret-delimited transaction file state import clients ingest (verify your
  first state import — layouts vary). Previously it was a raw JSON dump.
- **Per-state submission rules.** NERIS validation rules (FDID format,
  submission deadlines) are now pluggable per state — New Jersey shipped,
  other states are a small data addition, and nothing silently assumes NJ
  anymore.
- **Dark mode on command screens.** Command Board, Live Dispatch, and the
  unit board get a low-glare night theme with a toggle — for apparatus-
  mounted displays and 0300 incidents.
- **Glove-friendly command screens.** Touch targets meet 44px minimums on
  touch devices, and screen-reader labels were added across the command
  surfaces.

### Fixed
- **NERIS export accuracy (8 bugs).** Exported unit times were local times
  mislabeled as UTC (off by your UTC offset in every submission); $0 losses
  were silently dropped; the controlled time was omitted; unparseable dates
  produced corrupt submission ids; and missing FDIDs silently became a New
  Jersey default. All fixed, with the export test suite updated to prove it.
- **Offline mode honesty.** The active incident, hazmat UN-number lookups,
  pre-plans, and hydrants are now served from cache when cellular drops; a
  bug that surfaced raw network errors instead of a friendly offline message
  is fixed; and the offline write queue no longer retries invalid requests
  forever (rejected writes are surfaced so you can re-enter them).
- **Staffing AI endpoints** queried columns that don't exist and always
  failed; all five now work against the real schema.
- **Wellness member lookup** could never return a record (route typo).
- **Weather is your weather.** The dashboard weather now geocodes each
  department's own town instead of showing every department Maplewood, MN.
- **Fundraising donations filter** crashed; donations can now be attached
  only to your own campaigns.

### Removed
- **AI no longer writes incident narratives — anywhere.** Incident narratives
  and NERIS/NFIRS report content are written entirely by the officer. Every
  AI narrative surface was removed: the Draft Narrative buttons, the workflow
  assistant's narrative drafting, the Narrative Writer tab, the
  incident-analysis narrative generator, the AI-written narrative that the
  CAD pipeline previously inserted on auto-created incidents, and the
  narrative field from NFIRS auto-complete. AI still auto-fills factual
  fields (times, units, addresses from CAD and radio data) and still helps
  with internal documents like after-action summaries — but the sworn
  account of an incident comes from the responding officer, period. (An
  officer-approval gate for AI drafts was built and shipped earlier the same
  day, then replaced by this full removal.)

### Added
- **Append-only audit trail and soft-delete for legal records.** Incidents,
  exposure records, and grievances are never hard-deleted anymore — deleting
  retains the row invisibly with a deletion timestamp, and every create,
  update, delete, and narrative review writes an audit entry (who, what,
  when). Incident numbers stay reserved by deleted incidents' history but can
  be reissued to a recreated report.
- **Structured request logging.** Every authenticated API request logs who
  (user + department), what (method + path), and the result — without ever
  logging request contents, since exposure and grievance records are
  privacy-sensitive.
- **Crash-proof command screens.** The Command Board, Live Dispatch, response
  map, accountability/PAR, unit-status board, kiosk, and TV display now
  isolate failures per panel — one malformed response degrades that one panel
  with a reload button instead of blanking the screen mid-incident.
- **Continuous integration.** Every push now runs the full server test suite
  (tenancy guards, department-isolation tests against a real database, TV-PIN
  and CAD unit-matching tests) and a full client build; NERIS exports are
  verified against golden reference documents (19 tests).

### Fixed
- **Two departments could never share an incident number.** A global
  uniqueness rule on incident numbers applied across all departments;
  it is now correctly scoped per department (and ignores deleted records).
- **Broken GitHub workflow files** (`self-heal.yml` invalid YAML,
  `deploy.yml` placeholder) logged a failed run on every push.

### Security
- **Department data isolation hardened across the entire API.** Every route now
  scopes queries to the authenticated user's department: removed hardcoded
  station references from 14 route files and all 22 calendar feed modules,
  eliminated every endpoint that accepted a client-supplied `station_id`
  (attachments, correspondence, calendar subscriptions, equipment checkout,
  incident costs, meeting minutes, policy acknowledgments, data import, AI
  assistant), and added department scoping to previously unscoped
  update/delete statements. A static tenancy-guard test now fails the test
  suite if any of these patterns reappear.
- **Server refuses to boot in production without `JWT_SECRET`** instead of
  falling back to a built-in development secret.
- **Security headers (helmet) and rate limiting** added: a strict limit on
  authentication endpoints and a high global ceiling sized so a busy station
  is never throttled during operations.
- **TV display PIN is now stored hashed** (keyed HMAC-SHA256) instead of
  plaintext; existing PINs keep working and upgrade transparently on first use.
- **Uploaded-file serving locked to the uploads directory.** The
  correspondence file route previously exposed a much broader directory tree;
  it now serves uploads only, with a path-traversal guard on delete.
- **Cron endpoints honor `CRON_SECRET`** when configured.

### Fixed
- **Executive dashboard and morning briefing endpoints were failing in
  production** due to queries referencing columns that don't exist in the live
  schema (leave requests, maintenance, equipment, budget, response-time
  fields). Queries now match the real schema, and each dashboard module
  degrades gracefully instead of failing the whole endpoint.
- **Incident companion records (workflow task, exposure check) could be
  silently dropped on serverless** because they ran fire-and-forget after the
  response; they are now completed before the response is sent, and an
  auxiliary failure can never block logging the incident itself.

### Added
- **Daily data-retention job** (`/api/cron/retention`) prunes the radio log
  per department using each department's configured retention period.
- **Server test suite** (`npm test` in `server/`): tenancy-guard static
  analysis, TV-PIN hashing unit tests, plus the existing CAD unit-match tests.
- **Reliable real-time dispatch alerts (Supabase Realtime).** When a CAD call
  drops, the dispatcher's screen now reliably lights up — a slide-in dispatch
  toast plus auto-open of the Command Board with the call pre-filled — within a
  second or two, live on Vercel. The server broadcasts a minimal id-only "new
  dispatch" ping on a per-station Supabase Realtime channel; the client refetches
  the access-controlled alerts API for the real call details (no addresses or PII
  on the public channel). A visibility-aware 20-second poll backstops any missed
  ping, and each call raises its notification at most once — opening a board
  mid-shift never replays an old call. Replaces the prior SSE stream, which does
  not deliver across Vercel's serverless instances.

### Fixed
- **Incident timeline "replay" could leak a timer.** Replaying an incident
  timeline started a 400ms interval with no cleanup if you navigated away
  mid-replay (or clicked Replay again), leaving a stray timer ticking state on
  an unmounted view. It's now stored in a ref, cleared on unmount, and a
  re-click cancels the prior run first. (Found in an app-wide reliability sweep;
  every other timer, socket, and realtime channel was already cleaned up
  correctly, and all socket reconnects already use capped backoff.)
- **Dispatch notification could crash the app on a real call.** The dispatch
  toast assumed the units field was an array and called `.join()` on it, but CAD
  alerts store units as a comma-separated string — so the moment a real dispatch
  populated the toast it threw `units.join is not a function` and tripped the
  "Something went wrong" screen. The toast now normalizes units the same way the
  dispatch feed does. (Latent since the SSE stream rarely delivered on Vercel;
  surfaced once real-time delivery became reliable.)

### Added
- **Auto-status from CAD.** When a dispatch arrives, the apparatus named in the
  call are automatically set to **Dispatched**, so the unit-status board and TV
  light up the instant a call drops — no manual taps. Matching handles both full
  names and the abbreviations real CAD feeds use (`E6`→Engine 6, `BC`→Battalion 1,
  `B14`→Brush 14, etc.), and is **fail-safe**: an abbreviation is only accepted
  when it resolves to exactly one apparatus in your fleet — ambiguous (e.g. `T1`
  when you run both a Truck 1 and a Tanker 1) or unknown units are skipped, never
  guessed. Best-effort; never blocks the CAD webhook response.
- **Unit-status board on the Dispatch & Command page** — the dispatcher now sees
  the incoming-call feed and live apparatus status together in one view.
- **Live per-unit status lifecycle (Phase 2).** Every apparatus now has a live,
  color-coded incident status — Available → Dispatched → En Route → On Scene →
  Staging → Committed → Returning — on a new **Unit Status — Live** board on the
  Dashboard. New `unit_statuses` + `unit_status_history` tables (separate from
  the maintenance `apparatus.status`), `GET /api/units/status`,
  `PATCH /api/units/:id/status`, `POST /api/units/reset`. Updates show live via
  **Supabase Realtime Broadcast** — the server pushes a per-station "changed"
  signal on every change and the client re-fetches the authoritative API (SSE
  does not work on Vercel serverless; Broadcast exposes no table data and needs
  no RLS change), with a 30s poll as backstop. Per-unit status-change history is
  captured for the eventual NFIRS/NERIS apparatus times. Status changes are
  optimistic with a server-authoritative reconcile.
- **Dispatch-only "Clear Call" button** on the Dashboard active-incident banner.

### Security
- **Clearing/closing a call is now dispatch-controlled.** `DELETE /api/active-board`
  (close the incident) requires Dispatch or a Chief (new shared
  `middleware/requireDispatch.js`; was open to any authenticated user — a
  firefighter could close the station's incident). Changing a unit's status
  requires Dispatch/command (any unit) or the rig's officer for their own unit
  (incl. acting A/C, A/LT, resolved from today's run list; fail-closed). The CAD
  clear-all / clear-one routes now share the same authority list (added
  deputy_chief), removing a duplicated role list that could drift.

### Fixed
- Dashboard was not receiving the `user` prop, which silently disabled every
  role-gated control on it (the new Clear Call button and unit-status edit
  controls). Now passed through.
- **TV display 24/7 stability.** The radio ticker's WebSocket targeted an
  endpoint that can't exist on serverless and reconnected every 5 seconds
  indefinitely — on an always-on wall display that churned thousands of dead
  connections a day. Now uses capped exponential backoff and tears down
  cleanly (it already falls back to the polled radio feed). Also removed a
  realtime-client resource leak and added a 6-hour idle reload so a TV left up
  for days flushes accumulated browser state — never during an active incident.
- **App-wide reconnect hardening.** An audit of every persistent connection
  found four reconnect loops using a fixed 5-second retry (the two `/api/cad/stream`
  SSE connections — one of which runs on every page for a logged-in user — and
  the radio-feed WebSockets). On serverless these hammered unreachable endpoints
  thousands of times a day on always-on screens. All now use one shared
  capped-exponential-backoff helper (5s → 5min, reset on a healthy connection).
  Also audited: no leaked interval timers or event listeners; connection feeds
  are length-capped.

### Added (prior)
- **PDF → fully-staffed run list import.** A new "Run List / Riding
  Assignments" record type in the Data Import wizard imports a daily run
  list (Unit / Position / Name / Rank) from a **PDF**, spreadsheet, CSV, or
  paste, and produces a fully-staffed Run List board. PDF parsing uses
  lazy-loaded pdfjs (worker code-split) with a section-aware extractor that
  reconstructs the Unit column from unit headers. The new transactional
  endpoint `POST /api/import/run-list` (`server/src/routes/importRunList.js`)
  idempotently upserts apparatus (by designation, type inferred) + members
  (by name, generated memberNumber) and writes the `run_lists` snapshot
  (`{ date, crew[] }`) the board/TV render — all in one DB transaction
  (BEGIN/COMMIT/ROLLBACK), station-scoped from the token, with row + length
  caps. The BC routes to Command Staff; the aide + crews ride their unit
  cards. Verified live: a 35-person sample PDF (BC + aide, 3 trucks + 6
  engines) imported to a fully-staffed board; re-import created 0 duplicate
  apparatus/members. Design + audit: `docs/RUNLIST-IMPORT-GAMEPLAN.md`.
- **Data-import parser brought to FireHazmat parity.** The import wizard
  (`client/src/components/DataImport.jsx` + `data/importers/`) — already richer
  than FireHazmat in scope (5 record types, vendor source presets, validation,
  preview, AI ingest) — now also matches FireHazmat's parser robustness: **Excel
  (.xlsx/.xls) upload** (lazy-loaded, hardened xlsx — String-coerce + JSON
  round-trip defeats the 0.18.5 prototype-pollution advisory), a
  **paste-from-clipboard** path (paste rows straight from Excel / Google Sheets),
  and a **quote-aware state-machine parser** with tab/comma auto-detect that
  handles newlines inside quoted fields. The old line-split CSV parser was
  comma-only and broke on multi-line quoted cells (e.g. an incident narrative).
  Same `{headers, rows}` output, so the mapping/validate/preview steps are
  unchanged across all record types.
- **Apple MapKit JS maps on Live Dispatch.** Replaced the Google Maps
  Embed / OpenStreetMap iframes with Apple MapKit JS across Live Dispatch.
  New `server/src/routes/mapkitToken.js` mints an ES256 JWT (reuses the
  Open Scaffold Labs Apple Maps key `VQYX44YADP`; origin-locked via an
  allowlist covering the app domain, `*.vercel.app` previews, and
  localhost). The active-call view is a **Route / Overhead / Street View**
  toggle: Route draws the response route from the **rig's live GPS
  position** (falls back to the station, configurable via
  `VITE_STATION_LAT`/`LNG`) to the call with distance + ETA via
  `mapkit.Directions`; Overhead is a satellite size-up; Street View renders
  a Google Street View Static image via a **server proxy** (`/api/streetview`,
  `server/src/routes/streetview.js`) that keeps the Google key server-side and
  Sensitive (set `GOOGLE_STREETVIEW_KEY`) and does a free metadata probe so a
  missing panorama returns 204 → clean fallback. The map is always on screen the
  instant a call drops — no "Open in Maps" dead-end. Per-card thumbnails
  and the right-panel map use a shared Apple `MiniMap`. Client helpers in
  `client/src/utils/mapkit.js`. Requires `MAPKIT_KEY_ID` / `APPLE_TEAM_ID`
  / `MAPKIT_PRIVATE_KEY` (set Sensitive) on the `open-firehouse` Vercel
  project.
- **Data dictionary auto-generator.** New script
  `server/scripts/generate-db-docs.js` parses `server/src/db.js` and
  emits `docs/DATABASE.md` — 89 tables, 1266 columns, organized by
  domain with a TOC. Regenerate after any schema change. The doc
  stays in sync with code rather than drifting.
- **Docker Compose support.** New `Dockerfile`, `docker-compose.yml`,
  and `.dockerignore` at the repo root. `docker compose up -d` brings
  up OpenFirehouse + Postgres in two containers with persistent
  volumes for the database and uploads. Adds the one-command install
  path standard for self-hostable open-source products.
- `docs/BACKUP_AND_RESTORE.md` — backup strategies by hosting model
  (Supabase, Docker Compose, BYO Postgres), restore procedures, the
  quarterly restore drill.
- `docs/UPGRADING.md` — upgrade process per hosting model, the
  five-minute post-upgrade checklist, rollback procedures.
- Standard GitHub documentation set for fire-department implementers:
  `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `.github/ISSUE_TEMPLATE/`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `docs/INSTALL.md`,
  `docs/CONFIGURATION.md`, `docs/ARCHITECTURE.md`,
  `docs/TROUBLESHOOTING.md`, `docs/CAD_SETUP_ACTIVE911.md`.
- CAD integration adapter framework (`server/src/cad/`) with vendor
  registry, shared persistence pipeline, and per-vendor adapter pattern.
  Active911 and the generic webhook are full implementations;
  IamResponding, FirstDue CAD, and Zuercher are scaffolds.
- Strategy paper `docs/CAD_INTEGRATION_STRATEGY.md` covering the
  three-layer model (ingest / status+AVL / closeout-RMS) and the
  90-day plan for the volunteer-friendly CAD market.
- `WHY_AGPL.md` documenting the licensing choice and what it means
  for each user category (departments, consultants, vendors).
- Smoke test for the CAD adapter framework
  (`server/scripts/smoke-cad-adapters.js`), 39 assertions.

### Changed
- **License: relicensed from MIT to AGPL v3.** Self-hosted department
  use is unaffected; the copyleft only activates when someone offers a
  modified OpenFirehouse as a hosted service to other organizations.
  See `docs/WHY_AGPL.md` for the reasoning.
- `server/src/routes/cad.js` thinned from 227 lines to an HTTP shell;
  per-vendor parsing logic moved into the adapter framework.
- Brochure (`client/public/brochure.html`): hero stat updated to
  "AGPL v3 / Copyleft Open Source"; pricing card and footer aligned.
- `README.md`: rewritten license section pointing to `docs/WHY_AGPL.md`,
  with the commercial-licensing contact (dale@openscaffoldlabs.com).

### Removed
- `client/public/video/cam-*.mp4` (4 files, 3.2 MB). These were
  placeholder body-cam footage used by the standalone dispatch demo
  and never reflected real product functionality. The dispatch demo's
  telemetry HUDs (SCBA, HR, response-phase) are preserved.

### Security
- Multi-tenancy: server routes now filter by `station_id` from the JWT
  in every query that previously could leak across stations. Dispatch
  SSE stream is station-scoped. Pre-existing routes affected:
  `staffingAI.js`, `preplanAI.js`, `reportWriter.js`,
  `dispatchStream.js`, `cad.js`, `dbAudit.js`, `personalApp.js`.

---

*Older history: see git log. Future releases tagged once the version
scheme stabilizes.*
