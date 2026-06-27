# Customize OpenFirehouse with Cowork

> **You don't have to be a developer to run, customize, or extend OpenFirehouse.**
> OpenFirehouse itself was built by Claude under a small team's direction —
> what software people call *vibe coding*. The same approach works for fire
> departments customizing it. This document is the on-ramp.

This guide is for fire chiefs, training officers, IT volunteers, and anyone
else in a department who wants to make OpenFirehouse fit their shop without
hiring (or becoming) a developer. The tool that does the heavy lifting is
**Cowork** — Anthropic's desktop app for working with Claude on files,
spreadsheets, and small projects.

If you ARE a developer who wants to extend the codebase, read
**[`CONTRIBUTING-WITH-CLAUDE.md`](CONTRIBUTING-WITH-CLAUDE.md)** instead.

---

## What is Cowork?

Cowork is Anthropic's desktop app for Mac and Windows that lets Claude work
directly with files on your computer. You point Cowork at a folder, Claude
sees what's there, and you can ask it to do things in plain English:

- "Add my department's logo to the brochure and save the new version next to it."
- "Read this PDF roster and turn it into a CSV with one row per firefighter."
- "Look at the seed data — replace the demo apparatus list with our actual rigs and ranks."

Cowork can also connect to your existing tools — Gmail, Google Calendar,
Slack, Stripe, Box, Notion, and others — through what Anthropic calls
**MCP servers** (Model Context Protocol). Once connected, Claude can read
your inbox, draft replies, pull a roster from a Google Sheet, etc. — all
with your explicit approval on each action.

Cowork is the lowest-friction way for a department to customize OpenFirehouse
without writing code.

---

## When Cowork is the right tool (and when it isn't)

**Cowork is GREAT for:**

- Customizing seed data (apparatus list, ranks, station addresses, default roles)
- Writing or updating department-specific docs (SOPs, training materials,
  email templates)
- Branding (swapping the logo, color tweaks, updating mast headers)
- Connecting your department's Slack, Gmail, or calendar so OpenFirehouse can
  read or send messages on your behalf
- Pulling in data from PDFs, spreadsheets, or your existing systems
- Asking questions like "explain what this file does" or "summarize the
  Active911 integration in two sentences"

**Cowork is NOT the right tool for:**

- Big architectural changes to OpenFirehouse itself (use Claude Code or hire a
  developer — see `CONTRIBUTING-WITH-CLAUDE.md`)
- Anything involving the production database directly (data-loss risk)
- Anything that requires CLI tools or build steps you're not comfortable
  reviewing

When you hit the boundary, Cowork will tell you. Claude is good at saying
"this is past what I can do safely from here — you'll want a developer."

---

## Install Cowork

1. Download Claude desktop from <https://claude.com/desktop> (Mac and
   Windows; the Mac version is the most mature today).
2. Sign in with your Claude account (the same one you use on claude.com).
3. Open the **Cowork** view in the sidebar.
4. When prompted, **select a folder** on your computer for Cowork to work
   in. The first time, point it at an empty new folder named something like
   `~/OpenFirehouse-Workspace`. You can add more folders later.

That's the whole install. Cowork now reads + writes inside that folder.

---

## The Limitless Stack (strongly recommended for heavy customization)

For one-off changes — fix a typo, swap the logo, write a training email —
plain Cowork works. The work is done in a single session and you don't need
to remember what happened later.

For **sustained, heavy customization** — running OpenFirehouse as your
department's actual operating platform, modifying it month after month — you
hit a wall that's not obvious until you've been at it a few weeks:

> **Claude has no memory between sessions.** Every conversation starts
> completely fresh. The Claude you talk to on Monday doesn't know what the
> Claude you talked to on Friday did, decided, or changed. Every time you
> open a new session, you start over.

That's fine the first time. By the tenth time it's exhausting: you find
yourself re-explaining your role structure, your CAD vendor, the migration
you ran last week, why a certain module is hidden, which fields you renamed
on the apparatus table. The repo's `CLAUDE.md` file helps — that's why we
maintain it — but it can't track every decision a department makes over
time.

**The Limitless Stack solves the memory problem.** It's a layer that sits
underneath Cowork and remembers your department's history across every
session. Concretely:

- **Obsidian vault** — a structured wiki of every meaningful decision,
  customization, and pattern. New sessions read it on start and inherit
  full context.
- **NotebookLM notebooks** — curated research desks per topic (e.g., your
  CAD integration history, your training program structure). Claude can
  query them for deep context that's too long to keep in active memory.
- **Pinecone semantic search** — full-text recall across every doc, code
  file, and decision in your vault. "What did we change about the roster
  in March?" returns the relevant entries even if you don't remember the
  exact filename.
- **Per-app `CLAUDE.md`** — the trust anchor. Every Claude session reads it
  on start and inherits the project's rules, conventions, and known
  landmines.
- **Architecture Decision Records (ADRs)** — the rationale for every
  meaningful technical choice, committed alongside the code change that
  implemented it. Future you doesn't have to remember why; the ADR explains.

This is how Open Scaffold Labs itself built OpenFirehouse. Every
architectural decision — the row-level security model, the seed data
split, the CAD adapter framework, the licensing system — lives in a
Limitless Stack vault, so every new Claude session inherits the
accumulated context instead of starting from zero. The whole approach is
designed to make a small team productive on a large, evolving codebase
without burning out re-explaining decisions.

**For a department doing heavy customization, the Limitless Stack means
the work you did six months ago still informs the work you do today.**

### Quick install

```
/plugin marketplace add Open-Scaffold-Labs/LimitlessStack
/plugin install limitless-stack@limitless-stack
```

Full setup walkthrough: <https://github.com/Open-Scaffold-Labs/LimitlessStack/blob/main/docs/setup-guide.md>

### When to actually adopt it

- **Skip it for now** if you're just doing periodic small tweaks (branding,
  training emails, seed data updates). Plain Cowork is fine.
- **Adopt it** the moment you find yourself re-explaining the same context
  to Claude across multiple sessions. That's the wall, and the Limitless
  Stack is the answer.
- **Adopt it from day one** if you're planning to run OpenFirehouse as a
  long-term core system and expect to extend it over time. The setup pays
  for itself within the first month.

The setup is about a half-day of focused work the first time. After that,
it runs in the background.

---

## Set up OpenFirehouse for your department

### Option A — Cloud install (recommended for most departments)

The simplest path is to use the hosted version we run at
**<https://openfirehouse.openscaffoldlabs.com>**. Sign your department up,
get your API key, and run from the browser or our iPad app. No install. No
servers. We handle backups + updates.

You can still use Cowork to customize the parts that are yours —
SOPs, training, branding emails — without touching our infrastructure.

### Option B — Self-host (departments with IT staff or strict data residency rules)

OpenFirehouse is open source under AGPL v3. To run your own copy:

1. **Sign up for a free Supabase account** at <https://supabase.com>. This is
   your database + auth backend.
2. **Sign up for a free Vercel account** at <https://vercel.com>. This is
   where the app runs.
3. **Clone the OpenFirehouse repo:**
   ```bash
   git clone https://github.com/Open-Scaffold-Labs/OpenFirehouse.git
   ```
4. **Open the cloned folder in Cowork.** Tell Claude:
   > "Set up OpenFirehouse for the [Your Department] Fire Department. The
   > Supabase project is at [URL]. Walk me through every step and ask before
   > running anything that changes my system."

   Claude will read the repo's `INSTALL.md`, `CONFIGURATION.md`, and `CLAUDE.md`,
   and walk you through the steps one at a time. Approve each before it runs.

5. **Test the install at `localhost:3000`** before deploying.
6. **Deploy to Vercel** when you're satisfied — Cowork can do this for you.

Full self-host docs: [`docs/INSTALL.md`](docs/INSTALL.md) and
[`docs/CONFIGURATION.md`](docs/CONFIGURATION.md).

---

## Common customizations a department will want

### Show only the modules your department uses

OpenFirehouse ships with a lot of modules — personnel, apparatus, training,
incident log, NFIRS / NERIS, hydrant management, fire investigation,
community risk, CAD integration, and more. Most departments don't use all of
them, and a crowded sidebar is noise that makes the app slower to work with.

Two ways to scope what shows up:

**Globally — hide a module for everyone.** Tell Claude:

> "Open `client/src/components/Layout.jsx`. Find the module groups in the
> nav. Comment out the entries for [list the modules you don't use — e.g.,
> 'Cadet Program' and 'Fire Investigation']. Don't delete them — comment them
> out so we can turn them back on later."

The hidden modules stay in the codebase (and their database tables stay
intact) — they just don't appear in the sidebar.

**Per-role — show or hide modules by who's signed in.** OpenFirehouse uses a
`canAccess(user, moduleId)` filter on the sidebar plus role definitions
(see `Layout.jsx`'s `ROLES` map) and an `access` column on the underlying
tables. Tell Claude:

> "I want the [e.g., 'Maintenance Log' and 'Inspection Checks'] modules to
> only show for users with the role 'Maintenance Chief' or higher. Find
> where `canAccess` is defined, update the role mapping, and show me the
> diff before saving."

Same pattern works for hiding admin-only modules from line firefighters,
gating training authoring to training officers, or hiding fire investigation
until you have a qualified investigator on payroll. The access mapping is
the single hub — change it there and the sidebar, dashboards, and module
pages all respect the new rule.

### Update the apparatus list

Tell Claude (with the repo open in Cowork):

> "Open `seed/essentials/apparatus.json`. Replace the placeholder rigs with
> our actual apparatus: Engine 1, Engine 2, Tanker 1, Brush 1, Squad 1.
> Engine 1 is a 2018 Pierce Arrow XT pumper. Tanker 1 holds 2,000 gallons.
> Keep the same JSON structure as the existing entries."

Claude will read the file, propose the changes, show you the result, and
save when you approve.

### Add your department's logo

> "Save the attached image as `client/public/brand/logo.png` at 512×512.
> Then open `client/src/components/Header.jsx` and verify the logo image
> path matches."

Cowork can read images and resize them for you.

### Write a training email

> "Write a training email to my crew about the new ICS-205 worksheet
> feature in OpenFirehouse. Tone: practical, not corporate. Two paragraphs
> max. Save it in `docs/training/email-ics205-rollout.md`."

### Connect your department Slack

In Cowork, click **Settings → Connectors → Slack** and authorize. Then:

> "Read the #ops channel from the last 24 hours. Are there any apparatus
> status updates that should be reflected in OpenFirehouse?"

Claude will read the channel (with your authorization), summarize, and
optionally help you update the system.

### Generate an ICS-201 worksheet for tonight's drill

> "Open `_demos/ICS-201-template.docx`. Fill in 'Anytown FD live-burn drill
> 2026-06-15, IC: Smith, Safety Officer: Jones, Operations: Engine 1 +
> Tanker 1. Save the filled version next to the template."

### Update marketing copy for your department's recruitment page

> "Read `brand/marketing/recruitment-template.md`. Adapt it for the Anytown
> Fire Department — we have 24 paid members, 12 volunteers, three stations,
> we cover 84 square miles. Save the result as
> `local/anytown-recruitment.md`."

---

## How to ask Claude effectively

The same patterns developers use also work for departments. The shape that
gets you the best results:

```
What you want:        "Update the duty roster page to..."
Anchor file:          "Look at the existing roster at client/src/pages/Roster.jsx"
Constraints:          "Keep the existing styling. Don't change the print layout."
Approval gate:        "Show me before you save."
```

Five things to internalize:

1. **Tell Claude what to read first.** Pointing it at the canonical example
   gives massively better output than asking from scratch.
2. **Ask for a plan before action.** "Tell me what you'd change and show me
   the file paths before writing." Lets you catch wrong assumptions early.
3. **Ask for "surgical" changes.** "Touch only the apparatus file — don't
   reformat anything else." Prevents Claude from "helpfully" refactoring
   things that worked.
4. **Approve every commit.** OpenFirehouse's `CLAUDE.md` file (which Claude
   reads at session start) directs Claude to **always ask the project
   maintainer before acting**. Keep that rule — never give Claude blanket
   auto-approve permission on a life-safety-adjacent codebase.
5. **Verify the end state.** If Claude says "the change is live," click
   through the app to confirm it looks right. Trust but verify.

---

## When you might still want a developer

Cowork + Claude can take a department further than most people expect. With
the patterns above — anchor files, plan-before-action, surgical changes,
verify the end state — there's very little that's strictly off-limits. There
is one real exception:

**Authorization and access controls.** Anything that decides "who can see
what" — user roles, row-level security policies in Supabase, the rules that
gate admin-only screens — is deeply consequential. A mistake here doesn't
crash the app, it silently leaks data. Don't have Claude write these
changes unless an engineer with security review experience is going to
read the diff before it lands.

Beyond that, the things people often assume require a developer are
actually within Cowork's reach with appropriate caution:

- **Database schema changes** (new columns, new tables, indexes) — doable.
  Ask Claude to write a proper migration file, dry-run it against a non-
  production database first, and have it report back with the `\d <table>`
  output to confirm what landed.
- **CAD integration for a new vendor** — OpenFirehouse already has an
  adapter framework (see `api/cad-adapters/`). Adding a new adapter is a
  copy-an-existing-one-and-modify task that Cowork handles well.
- **Payment processor integration** — sister project FireHazmat was wired
  to Stripe end-to-end in about two days using exactly this workflow. The
  patterns are documented; if you need them, ask.
- **External system connectors** — your records management system, your
  scheduling system, your county dispatch — if it has an API, Cowork can
  wire to it.
- **Bug fixes for symptoms you can describe clearly** — even if you don't
  know WHY it's happening, if you can say "when I do X, Y happens instead
  of Z," that's enough for Claude to diagnose.

For anything in either bucket, the discipline is the same: anchor files
first, plan before code, surgical changes, verify the end state. If
something looks risky, post in our community channels (link in the main
README) for a sanity check before it goes to the rigs.

---

## What you DON'T need to learn

You do not need to learn:

- Git (Cowork handles it; Claude commits + pushes on your approval)
- JavaScript or React (you're describing changes; Claude writes the code)
- The database query language (you ask Claude to query; it shows you results)
- The CLI (Cowork puts a graphical layer over the tools that need a terminal)

You DO need to understand:

- Your department's actual workflow — Claude can ask, but you're the
  authority on what your crews need
- When something looks wrong (a screen that doesn't match your radio
  procedure, a roster that doesn't include the volunteer pool, etc.)
- That every change to a life-safety system needs your eyes on it before it
  goes to the rigs

---

## Getting started today

1. Install Cowork (above)
2. Clone or open this OpenFirehouse folder in Cowork
3. Open a chat and tell Claude:
   > "Read `CLAUDE.md` and `README.md` for this project, then tell me what
   > customization options the seed data and brand folders support. I'm the
   > chief of [Your Department] and want to make this fit our shop."

That's the first 15 minutes.

---

## License + community

OpenFirehouse is **AGPL v3** (see `LICENSE`). You can use it, modify it, run
it for your department, and never share your changes with the world. If you
DO want to share customizations that would help other departments, open a
pull request and we'll review.

Questions or stuck? **support@openscaffoldlabs.com** — we answer personally
for now.

Welcome aboard.
