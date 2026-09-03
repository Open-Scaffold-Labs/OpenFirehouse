# OpenFirehouse architecture

A high-level map of how the system is organized. Aimed at developers
joining the project, IT administrators evaluating self-hosting, and
auditors reviewing the code.

## At a glance

OpenFirehouse is a two-tier application: a React 19 client and an
Express + Postgres server. Both live in this monorepo as npm
workspaces.

```
┌─────────────────────────────────────────────────────────────┐
│                       Web Browser                            │
│  Vite-built React 19 SPA (Tailwind 4, lazy-loaded views)    │
└─────────────────────────────────────────────────────────────┘
                            ↕  HTTPS / JWT
┌─────────────────────────────────────────────────────────────┐
│                  Express 5 API Server                        │
│  ~574 endpoints across ~80 route files                       │
│  JWT auth, station_id-scoped queries, SSE for dispatch       │
└─────────────────────────────────────────────────────────────┘
                            ↕  pg (Postgres protocol)
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                       │
│  ~90 tables, station_id column on every multi-tenant table  │
└─────────────────────────────────────────────────────────────┘
                            ↕  Webhooks
┌─────────────────────────────────────────────────────────────┐
│                External integrations                         │
│  CAD vendors, Resend (email), Twilio (SMS), Anthropic API   │
└─────────────────────────────────────────────────────────────┘
```

## Repository layout

```
OpenFirehouse/
├── client/                  React 19 SPA — Vite build
│   ├── src/
│   │   ├── App.jsx          Top-level router + first-run gating
│   │   └── components/      178 components, lazy-loaded
│   └── public/              Static assets, brochure, demo pages
│
├── server/                  Express + Postgres API
│   ├── src/
│   │   ├── index.js         App entry, seeds runner, route mounting
│   │   ├── db.js            Schema + safeSeed (~90 tables)
│   │   ├── middleware/      auth, requireChief, error handlers
│   │   ├── routes/          80+ Express route files
│   │   ├── cad/             CAD adapter framework
│   │   │   ├── types.js     CadIncident JSDoc contract
│   │   │   ├── pipeline.js  Persist + broadcast
│   │   │   ├── index.js     Adapter registry, /:vendor handler
│   │   │   └── adapters/    One file per CAD vendor
│   │   ├── seeds/           Demo + essential seed scripts
│   │   └── utils/           aiActionRegistry, jwt helpers, etc.
│   └── scripts/             Standalone CLI scripts (smoke tests, etc.)
│
├── docs/                    Markdown documentation
├── brand/                   Marketing site + brochure assets
├── .github/                 Workflows + issue / PR templates
├── README.md
├── LICENSE                  AGPL v3
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── CHANGELOG.md
```

## Client architecture

**Stack.** React 19, Vite 7, Tailwind 4. JavaScript (not TypeScript)
for consistency with the server. Routing is by `?page=` query
parameter rather than React Router — keeps the URL stable for
bookmarking incident views and survives our lazy-load patterns
without router code splitting.

**Components.** ~178 components in `client/src/components/`,
single-file per component. Heavy use of `React.lazy()` + `Suspense`
in `App.jsx` so the initial bundle ships only the auth screen and
the shell; everything else loads on demand. The dispatch view,
incident command board, and any AI feature are all lazy chunks.

**State.** Local component state via `useState`/`useReducer`. No
Redux/Zustand. Auth state lives in `localStorage` (the JWT and the
decoded user object). The auth context flows through React props
rather than Context — simpler to audit, easier to log in tests.

**Real-time.** Dispatch updates arrive via Server-Sent Events at
`GET /api/cad/stream` (authenticated by JWT in query string,
EventSource workaround). The radio feed uses a WebSocket at
`/ws/radio`. SSE was chosen for dispatch because dispatch is
unidirectional and SSE survives flaky cellular better than WS.

## Server architecture

**Stack.** Express 5, `pg` for raw Postgres, `jsonwebtoken` for
auth, bcrypt for password hashing. No ORM — the server uses
parameterized SQL strings throughout. The shape is closer to PHP
1999 than to a modern TypeScript ORM stack, deliberately, because
the audience is fire departments who need to read the code and
understand what it does.

**Auth.** JWT-based. The token carries `sub` (user ID), `stationId`,
`role`, and an exp claim. Every authenticated route runs through
`middleware/auth.js`, which validates the signature and attaches
`req.user`. `middleware/requireChief.js` adds role-based gating for
admin endpoints (force-reseed, db-audit, etc.).

**Multi-tenancy.** Single Postgres database, single application
instance, station-level data isolation via a `station_id` column on
every multi-tenant table. Routes read `req.user.stationId` and add
it to every `SELECT` and `INSERT`. There are 86 `ALTER TABLE`
statements in `db.js` that added `station_id` to tables that
predate the multi-tenancy refactor.

A future hardening pass will add Postgres RLS policies as
defense-in-depth — so even a SQL bug in a route can't leak across
stations. That work is tracked in `docs/SECURITY-ROADMAP.md` (TBD)
and is not yet implemented.

**Database initialization.** `server/src/db.js` exports `initDb()`,
which is idempotent. On first API request after server start, it
runs every `CREATE TABLE IF NOT EXISTS` plus any `ALTER TABLE`
migrations, then runs the always-seeds (ERG hazmat, NFPA courses).
If `SEED_DEMO=true`, it then runs the ~70 demo-seed scripts.

**AI features.** `server/src/utils/aiActionRegistry.js` defines ~25
"AI actions" — server-side prompt templates that take some context
(an incident, a pre-plan, a duty schedule), call the Anthropic or
OpenAI API, and return a structured response. That catalog is **not**
the fire-verb contract: it does not write incident notes or NFIRS
narrative. Department agents use `server/src/utils/agentVerbRegistry.js`
instead, exposed as `POST /api/agent/invoke` (stdio MCP and in-app
Ask are clients of that path). Those verbs wrap existing JWT-gated
routes. Immediate reads include incident, roster, today's duty/run
list, the live Command Board, training hours, and apparatus status.
Legal-record writes (NERIS submit, notify chief, unit clear) land in
`agent_approvals`. The requester cannot accept their own item; a
different human officer accepts on the Dashboard. The in-app **Ask
Open Firehouse** face (`docs/ASK-OPEN-FIREHOUSE.md`) is a signed-in
client of the same `POST /api/agent/invoke` surface.

## CAD integration

The CAD adapter framework lives in `server/src/cad/`. Vendor
adapters export a `parse(req)` function that normalizes the
vendor's webhook payload to a shared `CadIncident` interface. The
pipeline takes care of persistence, SSE broadcast, push
notifications, and multi-station resolution.

Adding a new vendor: drop a file in `server/src/cad/adapters/`,
register it in `server/src/cad/index.js`. The route at
`POST /api/cad/:vendor` picks it up automatically.

See [CAD_INTEGRATION_STRATEGY.md](CAD_INTEGRATION_STRATEGY.md) for
the broader plan.

## Data model

Roughly 90 tables organized by domain:

- **Identity** — `users`, `members`, `roles`, `sessions`
- **Operations** — `incidents`, `apparatus`, `dispatches`,
  `cad_alerts`, `incident_assignments`
- **Records** — `nfirs_reports`, `pcr_reports`, `training_records`
- **Compliance** — `policies`, `policy_acknowledgments`, `exams`,
  `inspections`, `certifications`
- **Logistics** — `equipment`, `equipment_checkout`, `hydrants`,
  `pre_plans`
- **Reference** — `hazmat_materials` (ERG 2024), `nfpa_courses`,
  `incident_types`
- **Administrative** — `bulletins`, `meetings`, `meeting_minutes`,
  `grievances`, `leave_requests`, `time_off_balances`
- **Financial** — `invoices`, `payments`, `purchase_orders`,
  `grant_applications`
- **System** — `bug_reports`, `audit_log`, `feature_flags`,
  `webhooks`

A complete data dictionary is in [DATABASE.md](DATABASE.md),
auto-generated from `server/src/db.js`. Regenerate it after any
schema change with:

```bash
node server/scripts/generate-db-docs.js
```

The schema file itself is the canonical reference — `db.js` defines
every table inline with column comments and runs idempotently
through `initDb()`.

## Deployment

The standard deployment target is Vercel:

- The client builds via Vite into static assets, deployed to
  Vercel's edge
- The server runs as Vercel serverless functions (Express adapter)
- The database is Supabase Postgres (free tier covers any
  volunteer department)

Vercel's `vercel.json` configures the rewrites (`/demo` → `demo.html`,
`/brochure` → `brochure.html`, etc.) and the serverless function
routing.

Alternative deployment targets work but are not formally tested:
Railway, Render, Fly.io, a department-owned VPS running PM2.

## Observability

Today: server logs to stdout, captured by Vercel. The bug-reporter
flow (`/api/debug-agent/report`) runs an AI diagnostic on any
in-app bug submission and stores it in `bug_reports`, optionally
emailing the result via Resend.

What's not in place yet: metrics, structured logging, alerting on
error rates. Tracked for future work.

## Security posture

See [SECURITY.md](../SECURITY.md) for the vulnerability reporting
process. Key facts:

- All passwords bcrypt-hashed with sensible cost
- JWT secret is configurable; the in-tree default is a known dev
  fallback and refuses to run in production without override
- SQL throughout uses parameterized queries; no string concatenation
- CORS is allow-listed via `CLIENT_ORIGIN`; default is restrictive
- Multi-station isolation is application-level today; Postgres RLS
  is on the roadmap as defense-in-depth

## License

AGPL v3. See [LICENSE](../LICENSE) and
[WHY_AGPL.md](WHY_AGPL.md).
