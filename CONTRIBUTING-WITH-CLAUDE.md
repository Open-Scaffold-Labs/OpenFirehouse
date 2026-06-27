# Contributing to OpenFirehouse with Claude

> **OpenFirehouse was built using vibe coding.** Every meaningful module in this
> repo — incident command board, ICS-205 wiring, CAD adapter framework, the
> training course, the Apple Maps integration — was written by Claude under a
> human's direction, not by a developer typing the code. The repo is itself the
> proof that this works for a real, production, life-safety-adjacent
> application.

This document is for developers (or anyone using a code editor) who want to
extend OpenFirehouse. It describes how Open Scaffold Labs works with Claude,
how this repo expects to be modified, and the conventions to follow so your
contributions get accepted.

If you're a fire department admin who just wants to customize OpenFirehouse
for your shop without touching code, read **[`CUSTOMIZE-WITH-COWORK.md`](CUSTOMIZE-WITH-COWORK.md)**
instead.

---

## What "vibe coding" means here

The term "vibe coding" was popularized by Andrej Karpathy to describe a
workflow where the human directs intent and judgment while the LLM produces
the code. It is **not** "let the LLM run wild" — it is structured collaboration
with explicit guardrails:

- The human stays in the loop on every meaningful change (`CLAUDE.md`'s
  "Always Ask Matt Before Acting" rule is the canonical example)
- The repo encodes its own rules so any Claude session inherits them
- Architectural decisions get committed as ADRs (Architecture Decision
  Records) — written first, reviewed, then implemented
- Tests, migrations, and verification gates are part of the spec, not
  afterthoughts
- The LLM is "domain-aware" because the repo's `CLAUDE.md` is loaded into the
  system prompt at session start

The result is an order-of-magnitude productivity multiplier for a small team
without sacrificing review discipline or production-readiness.

---

## The Open Scaffold Labs Claude stack

OpenFirehouse runs inside a larger system Matt Lavin built called the
**Limitless Stack**. It's a seven-tool protocol that turns a generic Claude
session into a domain expert on every Open Scaffold app.

| Tool | Role in OpenFirehouse contributions |
|---|---|
| **Claude** | Reads, writes, connects, decides — pair-programmer mode |
| **`CLAUDE.md`** | Trust anchor — every session reads it on start; encodes the "ask before acting" rules, file-path conventions, and known gotchas |
| **Obsidian** | Vault that holds the long-form architecture wiki — `wiki/index.md`, `wiki/log.md`, app-specific pages like `wiki/apps/openfirehouse.md` |
| **NotebookLM** | Per-app research notebook; the OpenFirehouse one is bucket `9c8f` — Claude queries it for project rules and recent context |
| **Pinecone** | Semantic memory across every Open Scaffold repo — `pinecone-search.py "your question" --repo OpenFirehouse` |
| **Hub Workspace** | Multi-model agent runtime — Gemini default, Claude opt-in |
| **Paperclip** | Coordination — org chart, budgets, tickets, approvals |

You don't need all seven to make a useful contribution, but you DO need
`CLAUDE.md` (already in this repo) and a working Claude session.

To install the full stack, see the **Limitless Stack repo**:
<https://github.com/Open-Scaffold-Labs/LimitlessStack>. The fastest path is:

```bash
/plugin marketplace add Open-Scaffold-Labs/LimitlessStack
/plugin install limitless-stack@limitless-stack
```

Or manual:

```bash
git clone https://github.com/Open-Scaffold-Labs/LimitlessStack.git
cd LimitlessStack && ./install.sh
```

---

## Quick start for contributors

### 1. Clone + bootstrap

```bash
gh repo clone Open-Scaffold-Labs/OpenFirehouse
cd OpenFirehouse
npm install
cp .env.example .env  # fill in your Supabase + (optional) connector keys
npm run dev
```

### 2. Open a Claude session

Pick your interface:

- **Claude Code** (terminal) — best for heavy refactors and multi-file edits
- **Cowork** (desktop app) — best for non-developers and for tasks that involve files outside the repo
- **Web/iOS Claude** — fine for planning, ADR drafting, code review

Whichever you use, Claude will read `CLAUDE.md` on session start and inherit
the repo's rules.

### 3. State what you want

Examples that work well:

- "I want to add a new CAD adapter for [vendor X]. Look at
  `api/cad-adapters/active911.js` for the existing pattern, then draft an
  ADR explaining your approach before writing code."
- "There's a bug where the apparatus list doesn't refresh when a new unit is
  added. Diagnose it — don't fix yet — and tell me which file you'd change."
- "Read `docs/CAD_INTEGRATION_STRATEGY.md` and the related code, then write
  a one-page README in `docs/integrations/<vendor>/` for a department
  evaluating us."

The pattern: state the intent, point at the canonical references, and ask
for a plan before code.

### 4. Review, commit, push

The `CLAUDE.md` rule is explicit: **always ask before committing or pushing**.
Claude shows you the diff, you say "go", Claude commits + pushes via Desktop
Commander (Bash git fails behind the project's HTTP proxy — see `CLAUDE.md`
for the gory details).

---

## How this repo expects to be modified

### File-path conventions

```
api/              Vercel serverless functions and route handlers
api/admin/        Privileged endpoints (password-gated)
api/cad-adapters/ Vendor-specific adapters (Active911, IamResponding, etc.)
client/           React Native + web client
docs/             Architecture docs, ADRs, integration guides
docs/adr/         Architecture Decision Records — see ADR pattern below
scripts/          One-off + scheduled scripts (seeding, exports, migrations)
seed/             Idempotent seed scripts split into essentials/ + demo/
server/           Express server (legacy; new code prefers Vercel functions)
supabase/         Postgres migrations + Edge Functions
```

### Architecture Decision Records (ADRs)

For any change that touches data model, security model, billing, licensing,
public API, or cross-component contracts: **write an ADR before code**.

ADRs live at `docs/adr/ADR-NNNN-short-name.md`. Each one captures:

- **Status** — proposed / accepted / superseded
- **Context** — what was broken or unclear that forced this decision
- **Decision** — the rule we are adopting, in plain prose
- **Consequences** — what this enables, what it costs, what it forbids

Existing ADRs in the OpenFirehouse + sibling FireHazmat repos:

- `ADR-0001-incident-id-pairing-token.md` — opaque 256-bit incident ids
- `ADR-0002-encrypted-cloud-backup.md` — Option-A relay architecture
- `ADR-0006-license-device-cap-enforcement.md` — D1 cap atomicity rules
- `ADR-0007-OffStore-Billing-Licensing-Architecture.md` — Stripe pipeline (FireHazmat)

ADRs are NOT optional theater. They are the thing reviewers read first.

### `CLAUDE.md` as trust anchor

Every contributor's first read should be `CLAUDE.md`. It contains:

- The "ask before acting" rule (do not surprise the maintainer)
- The Desktop Commander requirement for git operations
- Which docs to update on every change (UPDATES.md, wiki entries)
- Known landmines (HTTP proxy blocks GitHub HTTPS, certain seed scripts must
  not run in prod, etc.)

If you find yourself fighting `CLAUDE.md`, stop. Either the rule is wrong (in
which case open a PR to update it) or you're solving the wrong problem.

### The "verify before claim" discipline

Born from a real incident: a sync tool reported success while content stayed
frozen for two weeks. The rule:

**Never declare a tool, resource, or capability as "available" or "complete"
based on its own status response. Verify the end state separately.**

Examples in this repo:

- Don't trust `npm run seed` printed "OK" — query the DB to confirm rows
  landed
- Don't trust a webhook returned 200 — check the downstream system actually
  reacted
- Don't trust a migration "applied successfully" — `\d <table>` it

The `skills/verify-before-claim` from the Limitless Stack codifies this.

---

## Patterns we use for common tasks

### Asking Claude to add a feature

The shape that works:

```
Goal: <one sentence>

Anchor files (read these first):
- <path/to/canonical/example.js>
- <path/to/related/test.js>
- docs/adr/<closest-ADR>.md (if relevant)

Constraints:
- <e.g., must not break the existing /api/foo endpoint>
- <e.g., follow the CLAUDE.md ask-before-commit rule>

Plan first. Code after I say "go".
```

### Asking Claude to debug

The shape that works:

```
Symptom: <what the user sees>

Repro: <exact steps>

What I have already ruled out:
- <thing 1>
- <thing 2>

Diagnose only — do not write a fix yet. Tell me your top three hypotheses
and which file to look at for each.
```

The "diagnose only" framing prevents the failure mode where Claude writes
a fix for the wrong root cause.

### Asking Claude to do a refactor

The shape that works:

```
Refactor: <e.g., move CAD adapter selection from hardcoded switch into a
registry pattern>

Scope: <which files are in / out>

Tests: <what I expect to still pass after this lands>

Before code: outline the new shape, show me the diff structure, no
implementation yet.
```

---

## The Karpathy guidelines (vibe coding rules of thumb)

Vendored from the [karpathy-guidelines](https://github.com/forrestchang/andrej-karpathy-skills)
skill in the Limitless Stack. The four big ones:

1. **Think before coding.** State the plan; only then write code. If you
   skip the plan you'll discover requirements mid-implementation and have to
   throw work away.
2. **Simplicity first.** Prefer the boring solution. A 30-line file that
   solves the problem beats a 300-line abstraction that "might" be useful
   later.
3. **Surgical changes.** Touch the minimum surface area required. A bug fix
   that also reformats four unrelated files is harder to review and harder
   to revert.
4. **Goal-driven execution.** Every step has a "I'll know this worked when…"
   gate. If you can't state the gate, you don't know what success looks like.

Cite these by name when asking Claude to apply them — e.g., "Surgical change
only — touch the auth middleware, leave the rest alone."

---

## The self-healing pipeline (optional)

Every Open Scaffold app can opt into autonomous bug diagnosis and repair.
Users report bugs through an in-app floating icon; a Claude diagnostic agent
captures context, proposes a root cause, and (with operator approval) opens a
verified PR. Cost: ~$0.13 per repair attempt.

OpenFirehouse has not yet opted in. To enable, copy the template files from
`LimitlessStack/self-heal/templates/` into this repo and follow
`SELF-HEAL-SETUP.md`. Roughly:

```
/CLAUDE.md                              already exists — trust anchor
/SELF-HEAL-SETUP.md                     operator setup doc
/.github/workflows/self-heal.yml        GitHub Actions workflow
/scripts/self-heal-agent.js             constrained agent loop (tool whitelist)
/server/src/routes/debug-agent.js       server endpoints + webhook
/client/src/components/BugReporter.jsx  in-app capture component
/client/src/pages/DebugReportsPage.jsx  operator review UI
```

This is a roadmap item, not a today item.

---

## Getting unstuck

- **Claude is making the same mistake twice.** Add the rule to `CLAUDE.md`.
  Future sessions will inherit it.
- **Claude is fighting the repo's structure.** Either the structure is wrong
  (open a PR) or you're outside the patterns the repo expects (ask for a
  plan first, see if the anchor files Claude wants to follow match yours).
- **Claude is "complete" but the thing doesn't work.** Apply the
  verify-before-claim discipline. Don't trust the status; check the end state.
- **You don't know where to start.** Read `CLAUDE.md`, then `docs/ARCHITECTURE.md`,
  then `wiki/apps/openfirehouse.md` (in the Open Scaffold vault).

---

## License + contributor terms

OpenFirehouse is **AGPL v3** (see `LICENSE`). Contributions are accepted under
the same license. By opening a PR you agree the change is yours to submit and
that it can be relicensed by Open Scaffold Labs if needed for commercial
distribution under our copyright assignment policy (see `CONTRIBUTING.md`).

---

## Where to look next

- `CLAUDE.md` — the repo's operating rules
- `docs/ARCHITECTURE.md` — system overview
- `docs/adr/` — Architecture Decision Records
- `docs/Development-Workflow.md` — branch + PR workflow
- `CUSTOMIZE-WITH-COWORK.md` — non-developer customization path
- <https://github.com/Open-Scaffold-Labs/LimitlessStack> — the full Claude protocol

Welcome aboard. Read the rules, write the ADR, ask before you push.
