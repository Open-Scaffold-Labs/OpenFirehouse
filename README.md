# OpenFirehouse

**The open-source operating system for the fire service.** Incident command, NFIRS/NERIS records, roster and staffing, apparatus, training and compliance, hydrants, pre-plans, and an AI assistant — one application that replaces legacy $800–$3,000/year RMS platforms. React 19 + Express + PostgreSQL, deployed on Vercel + Supabase.

[**Live demo**](https://openfirehouse.openscaffoldlabs.com) ·
[**Sign up your department**](https://openfirehouse.openscaffoldlabs.com/signup) ·
[**Install guide**](docs/INSTALL.md) ·
[**User manual**](docs/user-guide.md) ·
[**Architecture**](docs/ARCHITECTURE.md) ·
[**Contributing**](CONTRIBUTING.md)

- 🆓 **Free to self-host, at any size** — it's [AGPL v3](LICENSE); clone it and run it on your own Vercel + Supabase for $0.
- 🏠 **Free managed hosting** for volunteer / small departments (≤30 members AND ≤2 stations AND ≤$750K budget). Larger departments pay a fair, size-based hosting fee — see [Pricing](#pricing).
- 🔓 **Can't be locked in** — the platform is open source, your data exports in one click any time, and the code keeps running no matter what happens to us.

> **Status:** single-department deployments are production-ready. Multi-department (multi-tenant) hosting is in progress — see [ROADMAP.md](docs/ROADMAP.md).

---

## What OpenFirehouse does

**Live interactive incident command.** A real-time command board, apparatus tracking on a live map, an ICS org chart that builds itself, personnel accountability with PAR checks, and an AI-assisted radio log — on one screen. Text a tracking link to a mutual-aid department and they see your apparatus live, with no app and no login.

**Daily station life, without the paperwork.** AI can generate shift briefings and rank/text vacancy-fill candidates when someone calls out. Incident narratives and NFIRS/NERIS legal records stay officer-written — the software never drafts them. Certifications, LOSAP hours, and FTO milestones are tracked automatically.

**An AI that knows the fire service.** A "Hey Firehouse" voice assistant and 26 purpose-built, context-aware AI actions that know your active incident, pre-plans, people, and apparatus. Bring your own Anthropic API key.

### What's inside

| Surface | Headline features |
|---|---|
| **Incident Command** | Live animated Response Map, auto-building ICS org chart, Personnel Accountability + PAR, Commander Cam HUD, Live Share tracking links, GPS-tagged scene photos |
| **AI Intelligence** | "Hey Firehouse" voice assistant, AI shift briefings, staffing forecasts + burnout detection, NFPA training-gap analysis, auto vacancy fill. A department-local MCP exposes a small set of fire verbs (read incidents/roster/training/apparatus; queue NERIS submit, notify-chief, and unit clear for a chief to accept on the Dashboard). |
| **Station Operations** | Member portal, activity logger, FTO tracker (NFPA 1001 skills), Knox key management, TV wall display, NG911 console |
| **Full platform** | Incident log + NFIRS, apparatus, roster, duty schedule, training compliance, hydrants, pre-incident plans, maintenance, budget + grants, SOG library, mutual aid, wellness + exposure tracking, fire inspections, GIS map, volunteer hours, bulletins, cadets, shift trades, offline caching |

## Who it's for

Volunteer and combination fire departments running on legacy RMS platforms or paper — departments where the chief and the treasurer are often the same person, and the "IT person" is whoever's on shift when the printer breaks. It's built to be installed in an afternoon by someone who isn't a developer (Vercel + Supabase free tiers work for small departments) and to run for years without surprise bills.

## Quick start (self-host)

```bash
# 1. Install (npm workspaces handle client + server)
npm install

# 2. Configure the server
cp server/.env.example server/.env
#    Set DATABASE_URL (Supabase or local Postgres) and JWT_SECRET.
#    Optional: ANTHROPIC_API_KEY (AI); SUPABASE_URL + SUPABASE_ANON_KEY to PUBLISH
#    realtime broadcasts.

# 3. Configure the client (optional — only needed for live push)
cp client/.env.example client/.env
#    Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY so the browser SUBSCRIBES to
#    those broadcasts. Live push needs BOTH halves: the server pair publishes, this
#    pair subscribes. Skip this and everything still works — dispatch, unit status
#    and the maps fall back to a 20s poll instead of instant push.

# 4. Run client + server together
npm run dev
```

Open <http://localhost:5173> (the API runs on `:3005` and is proxied in dev). On first run with an empty database, the **First-Run Setup** screen creates your chief account and walks you through stations, apparatus, shifts, and ranks.

**Clean install vs. demo data.** By default OpenFirehouse seeds only reference data (the ERG 2024 hazmat library and the NFPA course catalog) — no fictional records. Set `SEED_DEMO=true` to load the fictional "Maplewood Fire Department" dataset used by the public demo. Full details and production deployment (Vercel + Supabase) are in the [**Install guide**](docs/INSTALL.md) and [**Configuration reference**](docs/CONFIGURATION.md).

## Pricing

OpenFirehouse is **open source under [AGPL v3](LICENSE)** — any department, any size, can self-host it free, forever. What's priced is our **optional managed hosting** (we run, back up, update, and support it for you), governed by the [Hosted Service Agreement](HOSTED-SERVICE-AGREEMENT.md). Tier is set by objective size ("Rule C"); fill in your numbers at signup and the tier is shown instantly.

| Tier | Members | Stations | Budget | Managed-hosting price |
|---|---|---|---|---|
| **Independent** | ≤ 30 | ≤ 2 | ≤ $750K | **Free** |
| **Career Small** | ≤ 80 | ≤ 4 | ≤ $3M | **$3,000 / year** |
| **Career Mid** | ≤ 200 | ≤ 9 | ≤ $10M | **$12,000 / year** |
| **Metro** | unlimited | unlimited | unlimited | **Custom (enterprise quote)** |

Every tier includes every module — nothing is paywalled by feature. **Self-hosting any tier is always $0.** The binding [OpenFirehouse Pledge](HOSTED-SERVICE-AGREEMENT.md) guarantees one-click data export at any time (even after cancellation), a capped annual price increase (CPI or 5%, whichever is greater), and a permanently free Independent tier. Plain-English details: [Pricing FAQ](docs/PRICING-CHANGES-FAQ.md).

Need terms outside the AGPL — e.g. shipping a closed fork or embedding OpenFirehouse in a proprietary product? See the [Commercial / OEM License](COMMERCIAL-LICENSE.md).

## Architecture

- **Client** — React 19, Vite 7, Tailwind 4, Recharts, Apple MapKit (maps), ~178 lazy-loaded views.
- **Server** — Express + PostgreSQL via `pg` (no ORM; parameterized SQL), ~90 tables, ~574 endpoints, lazy DB init for serverless cold starts.
- **Real-time** — Supabase Realtime (live dispatch), web-push notifications, Twilio SMS.
- **AI** — Anthropic SDK; 26 AI actions in `server/src/utils/aiActionRegistry.js` (prompt templates, not fire verbs). A department-local MCP (`docs/AGENT-MCP.md`) wraps existing JWT-gated routes with a member or service-account token (not a chief token in Claude Desktop); legal-record writes stay human-approved on the Dashboard.
- **Auth** — JWT + bcrypt, role-based access, per-department data scoping.
- **Offline** — PWA service-worker caching for station use without connectivity.

Deeper detail: [Architecture](docs/ARCHITECTURE.md) · [Data dictionary](docs/DATABASE.md) · [CAD & radio integration](docs/CAD_AND_RADIO_INTEGRATION.md).

## Documentation

**For departments deploying OpenFirehouse**

- [Install guide](docs/INSTALL.md) — fresh clone to first login on Vercel + Supabase
- [Configuration reference](docs/CONFIGURATION.md) — every environment variable
- [Backup & restore](docs/BACKUP_AND_RESTORE.md) · [Upgrading](docs/UPGRADING.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Active911 / CAD setup](docs/CAD_SETUP_ACTIVE911.md) · [User manual](docs/user-guide.md)
- [Customize with Cowork (branding / seed / SOPs)](CUSTOMIZE-WITH-COWORK.md)
- [Department-local MCP (agent on the install)](docs/AGENT-MCP.md)

**For developers & contributors**

- [Architecture](docs/ARCHITECTURE.md) · [Data dictionary](docs/DATABASE.md) · [Development workflow](docs/Development-Workflow.md)
- [Roadmap](docs/ROADMAP.md) · [Why AGPL](docs/WHY_AGPL.md)
- [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security policy](SECURITY.md) · [Changelog](CHANGELOG.md)

## Contributing

Pull requests, issues, and field feedback from working fire departments are all welcome. Because OpenFirehouse is open-core (AGPL plus a commercial/OEM license), contributions are accepted under a **[Contributor License Agreement](CLA.md)** — sign it once before your first merge. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and conventions, and [SECURITY.md](SECURITY.md) to report a vulnerability. A per-PR audit gate runs in CI (`.github/workflows/audit.yml`).

## License & trademarks

**AGPL v3** ([LICENSE](LICENSE)) — copyleft open source. Self-host it, modify it, and run it for your department with no obligation to share anything back. If you offer a *modified* OpenFirehouse to other organizations as a network service, you must publish your modifications under the same AGPL terms. Why AGPL: [docs/WHY_AGPL.md](docs/WHY_AGPL.md).

- **Commercial / OEM license** for use outside the AGPL: [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).
- **Managed hosting** (the paid offering): [HOSTED-SERVICE-AGREEMENT.md](HOSTED-SERVICE-AGREEMENT.md).
- **Trademarks** — the AGPL covers the *code*, not the *brand*. "OpenFirehouse" and "Fire Hazmat" are trademarks of Open Scaffold Labs, LLC (registrations in progress). Fork and self-host freely, but please give your fork its own name — see [TRADEMARK-POLICY.md](TRADEMARK-POLICY.md).

## Open Scaffold Labs

OpenFirehouse is the flagship product of [Open Scaffold Labs](https://openscaffoldlabs.com). Companion app: **Fire Hazmat** — an offline hazmat reference and incident-command tool for responders, on the App Store.

---

_Built and maintained by [Open Scaffold Labs, LLC](https://openscaffoldlabs.com) · Questions & security: dale@openscaffoldlabs.com_
