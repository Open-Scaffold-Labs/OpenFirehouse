# OpenFirehouse

**The open-source operating system for the fire service.** Incident command, NFIRS/NERIS records, roster and staffing, apparatus, training and compliance, hydrants, pre-plans, and an AI assistant — one application that replaces legacy $800–$3,000/year RMS platforms. React 19 + Express + PostgreSQL, deployed on Vercel + Supabase.

[**Live demo**](https://openfirehouse.openscaffoldlabs.com) ·
[**Install guide**](docs/INSTALL.md) ·
[**User manual**](docs/user-guide.md) ·
[**Architecture**](docs/ARCHITECTURE.md) ·
[**Contributing**](CONTRIBUTING.md)

- 🆓 **Free and open source, at any size** — it's [AGPL v3](LICENSE); clone it and run it on your own Vercel + Supabase for $0, forever.
- 🚒 **Built for the firehouse** — incident command, NFIRS/NERIS, roster, apparatus, training, hydrants, pre-plans, and an AI assistant in one application.
- 🔓 **Can't be locked in** — the platform is open source, your data exports in one click any time, and the code keeps running no matter what.

> **Status:** single-department deployments are production-ready. Multi-department (multi-tenant) support is in progress — see [ROADMAP.md](docs/ROADMAP.md).

---

## What OpenFirehouse does

**Live interactive incident command.** A real-time command board, apparatus tracking on a live map, an ICS org chart that builds itself, personnel accountability with PAR checks, and an AI-assisted radio log — on one screen. Text a tracking link to a mutual-aid department and they see your apparatus live, with no app and no login.

**Daily station life, without the paperwork.** AI drafts NFIRS narratives in minutes, generates shift briefings, and ranks/texts vacancy-fill candidates when someone calls out. Certifications, LOSAP hours, and FTO milestones are tracked automatically.

**An AI that knows the fire service.** A "Hey Firehouse" voice assistant and 26 purpose-built, context-aware AI actions that know your active incident, pre-plans, people, and apparatus. Bring your own Anthropic API key.

### What's inside

| Surface | Headline features |
|---|---|
| **Incident Command** | Live animated Response Map, auto-building ICS org chart, Personnel Accountability + PAR, Commander Cam HUD, Live Share tracking links, GPS-tagged scene photos |
| **AI Intelligence** | "Hey Firehouse" voice assistant, NFIRS narratives, AI shift briefings, staffing forecasts + burnout detection, NFPA training-gap analysis, auto vacancy fill |
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
#    Optional: ANTHROPIC_API_KEY (AI), SUPABASE_URL + SUPABASE_ANON_KEY (realtime).

# 3. Run client + server together
npm run dev
```

Open <http://localhost:5173> (the API runs on `:3005` and is proxied in dev). On first run with an empty database, the **First-Run Setup** screen creates your chief account and walks you through stations, apparatus, shifts, and ranks.

**Clean install vs. demo data.** By default OpenFirehouse seeds only reference data (the ERG 2024 hazmat library and the NFPA course catalog) — no fictional records. Set `SEED_DEMO=true` to load the fictional "Maplewood Fire Department" dataset used by the public demo. Full details and production deployment (Vercel + Supabase) are in the [**Install guide**](docs/INSTALL.md) and [**Configuration reference**](docs/CONFIGURATION.md).

## Architecture

- **Client** — React 19, Vite 7, Tailwind 4, Recharts, Apple MapKit (maps), ~178 lazy-loaded views.
- **Server** — Express + PostgreSQL via `pg` (no ORM; parameterized SQL), ~90 tables, ~574 endpoints, lazy DB init for serverless cold starts.
- **Real-time** — Supabase Realtime (live dispatch), web-push notifications, Twilio SMS.
- **AI** — Anthropic SDK; 26 AI actions in `server/src/utils/aiActionRegistry.js`.
- **Auth** — JWT + bcrypt, role-based access, per-department data scoping.
- **Offline** — PWA service-worker caching for station use without connectivity.

Deeper detail: [Architecture](docs/ARCHITECTURE.md) · [Data dictionary](docs/DATABASE.md) · [CAD & radio integration](docs/CAD_AND_RADIO_INTEGRATION.md).

## Documentation

**For departments deploying OpenFirehouse**

- [Install guide](docs/INSTALL.md) — fresh clone to first login on Vercel + Supabase
- [Configuration reference](docs/CONFIGURATION.md) — every environment variable
- [Backup & restore](docs/BACKUP_AND_RESTORE.md) · [Upgrading](docs/UPGRADING.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Active911 / CAD setup](docs/CAD_SETUP_ACTIVE911.md) · [User manual](docs/user-guide.md)
- [Customize with Cowork (no-code path)](CUSTOMIZE-WITH-COWORK.md)

**For developers & contributors**

- [Architecture](docs/ARCHITECTURE.md) · [Data dictionary](docs/DATABASE.md) · [Development workflow](docs/Development-Workflow.md)
- [Roadmap](docs/ROADMAP.md) · [Why AGPL](docs/WHY_AGPL.md)
- [Contributing](CONTRIBUTING.md) · [Contributing with Claude](CONTRIBUTING-WITH-CLAUDE.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security policy](SECURITY.md) · [Changelog](CHANGELOG.md)

## Contributing

Pull requests, issues, and field feedback from working fire departments are all welcome. Contributions are accepted under a **[Contributor License Agreement](CLA.md)** — sign it once before your first merge. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and conventions, and [SECURITY.md](SECURITY.md) to report a vulnerability. A per-PR audit gate runs in CI (`.github/workflows/audit.yml`).

## License & trademarks

**AGPL v3** ([LICENSE](LICENSE)) — copyleft open source. Self-host it, modify it, and run it for your department with no obligation to share anything back. If you offer a *modified* OpenFirehouse to other organizations as a network service, you must publish your modifications under the same AGPL terms. Why AGPL: [docs/WHY_AGPL.md](docs/WHY_AGPL.md).

**Trademarks** — the AGPL covers the *code*, not the *brand*. "Open Firehouse" and "FireHazmat" are trademarks of Open Scaffold Labs, LLC (used in stylized form as "OpenFirehouse"; U.S. trademark registration applications pending). Fork and self-host freely, but please give your fork its own name — see [TRADEMARK-POLICY.md](TRADEMARK-POLICY.md).

## Open Scaffold Labs

OpenFirehouse is the flagship product of [Open Scaffold Labs](https://openscaffoldlabs.com). Companion app: **FireHazmat** — an offline hazmat reference and incident-command tool for responders, on the App Store.

---

_Built and maintained by [Open Scaffold Labs, LLC](https://openscaffoldlabs.com) · Questions & security: dale@openscaffoldlabs.com_
