# Contributing to OpenFirehouse

Thanks for your interest. OpenFirehouse is built to be used by working
volunteer fire departments — field feedback is at least as valuable as
code. Both are welcome.

## Quickest way to help

If you're a firefighter, chief, or administrator at a department
considering OpenFirehouse, open an issue describing what you'd want
to use it for. Concrete department-specific feedback shapes the
roadmap more than abstract feature requests.

If you're a developer, the highest-leverage contributions right now
are:

- Bug reports from running the live demo, especially on real
  fireground conditions (slow networks, tablets, gloved fingers)
- NFIRS export improvements — corner cases in the 5.0 schema we
  haven't hit yet
- Mutual aid agreement edge cases (multi-agency PAR, dual-IC handoffs)
- AI action prompt improvements in `server/src/utils/aiActionRegistry.js`
- Accessibility fixes (we aim for WCAG 2.1 AA but haven't formally
  audited)

## Reporting bugs

Open an issue with:
- What you tried to do
- What happened
- Browser + OS
- A screenshot or short video if visual
- Console errors (Inspect → Console) if any

## Development setup

```bash
npm install                       # installs workspaces
cp server/.env.example server/.env
# Edit server/.env: DATABASE_URL, JWT_SECRET, optional ANTHROPIC_API_KEY
npm run dev                       # client on :5173, server on :3005
```

Use a local Postgres or a free Supabase project. The server runs
`initDb()` lazily on the first API request, so the first call after
startup may take 1–2 seconds longer than subsequent calls.

## Conventions

- **JavaScript / JSX**, not TypeScript. We may add TS in a future
  pass; for now consistency matters more than gradual typing.
- **Tailwind CSS v4** for styling. No CSS modules, no styled-components.
- **Single-file components** — components live in
  `client/src/components/<Name>.jsx`. Lazy-loaded from `App.jsx`.
- **Server routes** live in `server/src/routes/<feature>.js` and are
  mounted in `server/src/index.js`.
- **Database changes** go in `server/src/db.js` (the canonical schema
  file). Use `CREATE TABLE IF NOT EXISTS` so reruns are safe.

## Audit gate

Every PR runs a 14-point audit gate (see
`.github/workflows/audit.yml`). The audit script lives in
`openscaffold-core` and checks things like:

- Component count vs. README claim
- Missing or stale documentation
- Schema/code drift
- Test coverage on changed files
- Brand consistency

A PR that *lowers* the score versus the base branch will fail the
check. Flat or improved scores pass.

## Commit messages

Use the [Conventional Commits](https://www.conventionalcommits.org/)
format where it fits naturally:

```
feat(dispatch): live mutual-aid apparatus on response map
fix(nfirs): handle null incident_address_2 in 5.0 export
docs(readme): update component count after lazy-load refactor
```

If you used an AI assistant (Claude, Copilot, Cursor, etc.) to help
write the PR, include a co-authorship trailer:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

## Licensing your contributions — sign the CLA first

OpenFirehouse is **open source under AGPL v3**. So that contributions can always
ship under the AGPL — and, if ever needed, under a separate commercial license —
we accept contributions under a **Contributor License Agreement**
([CLA.md](CLA.md)).

**Before we merge your first pull request**, please sign the CLA: read
[CLA.md](CLA.md), then either email a signed copy to dale@openscaffoldlabs.com
or note in your PR that you agree to it. Future PRs don't need to repeat this.
The CLA does not take away your rights to your own work — it grants Open
Scaffold Labs the right to license your contribution under the AGPL and
commercially.

If you'd like to know why we chose copyleft rather than MIT, see
[docs/WHY_AGPL.md](docs/WHY_AGPL.md). The short version: vertical-SaaS
open-source projects (Open Dental, Discourse, Mastodon, Frappe,
Bahmni) use AGPL specifically to keep large proprietary vendors from
absorbing community-built code into closed products. We're following
that pattern.

Self-hosted use — your department running OpenFirehouse for itself —
has no AGPL obligations whatsoever, and is always free at any size. The
copyleft only triggers if someone offers a *modified* OpenFirehouse as a
service to other organizations.

## Code of conduct

Be kind to first-time contributors. Disagree on the merits, not the
person. The fire service is a small world and reputations follow you.

## Questions

Open a Discussion on GitHub, or email dale@openscaffoldlabs.com.
